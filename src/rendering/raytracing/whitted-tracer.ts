/**
 * HF-398 — the recursion itself: Whitted (1980) with the Hall shading model
 * (1983), over the analytic proxy scene.
 *
 * This is a CPU implementation, and that is deliberate rather than a
 * compromise. Every combat-safety bound this preset makes is a claim about what
 * the tracer PRODUCES, and this project has already been burned once by a
 * system that asserted the value written INTO a material and passed for months
 * while being arithmetically incapable of showing anything. So the numbers the
 * shader runs on are proven here, against real traced radiance, in a suite that
 * needs no GPU and cannot be fooled by a green pipeline.
 *
 * The GPU node in `raytraced-light-node.ts` mirrors these stages one for one.
 * When the two disagree, this file is the specification.
 *
 * WHAT IS AND IS NOT COMPUTED, once more so nobody has to infer it:
 *   - Reflection rays, refraction rays, shadow rays: yes, real, recursive.
 *   - Caustics: yes, as SHADOW-RAY caustics — light that survives refraction
 *     through a transparent object. They are a look, and a very good one. They
 *     are not photon mapping and are never described as physically accurate.
 *   - Global illumination / diffuse colour bleeding: NO. There is no indirect
 *     bounce. The fill comes from the arena's existing baked environment probe,
 *     handed in as `environmentRadiance`. Raising a flat ambient constant to
 *     cover the missing bounce is the failure this parameter exists to prevent,
 *     and `raytracing-profile.ts` asserts against it.
 */

import {
  type SurfaceSample,
  type Vec3,
  type WhittedMaterial,
  add,
  classifySurface,
  dielectricFresnel,
  dot,
  materialForClassification,
  normalize,
  reflect,
  refract,
  scale,
  schlickFresnel,
  sub,
  vec3,
} from './whitted-materials';
import {
  type ProxyScene,
  type ProxyShape,
  NO_HIT,
  SURFACE_EPSILON_M,
  intersectScene,
  intersectShape,
} from './analytic-proxy-scene';

export type TraceLight = Readonly<{
  /** Unit vector FROM the surface TOWARD the light. */
  direction: Vec3;
  /** Linear radiance. */
  colour: Vec3;
  /** Distance to the light; `Infinity` for a directional sun. */
  distanceM: number;
  /** Whether this light casts shadow rays. Budgeted as a number, not a mood. */
  castsShadows: boolean;
}>;

export type TraceOptions = Readonly<{
  /**
   * Hard recursion depth. Two mirrors facing each other will happily eat
   * whatever depth is given, and the visual return past a few bounces is nil.
   */
  maximumDepth: number;
  /** Whether refraction rays are spawned at all. */
  refractionsEnabled: boolean;
  /** Whether shadow rays may pass through transparent proxies as caustics. */
  causticsEnabled: boolean;
  /**
   * Linear-HDR ceiling on everything this tracer adds to a pixel. The whole
   * contribution is ADDITIVE over the rasterized frame, so this is the number
   * that guarantees the preset can brighten a pixel and can never darken one.
   */
  maximumAdditiveGain: number;
  /**
   * Indirect fill, supplied by the arena's baked/probe environment. A surface
   * facing away from every light is lit by this and nothing else.
   */
  environmentRadiance: Vec3;
}>;

export type TraceSurfaceContext = Readonly<{
  /** Height of the arena floor, so `SurfaceSample.heightM` is meaningful. */
  floorHeightM: number;
  /** Screen-area fraction attributed to a proxy, for the classifier. */
  screenAreaFor: (shape: ProxyShape) => number;
  /** Whether the weather system reports this surface wet. */
  wet: boolean;
}>;

function clampChannel(value: number, ceiling: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(ceiling, value);
}

function clampRadiance(colour: Vec3, ceiling: number): Vec3 {
  return vec3(
    clampChannel(colour[0], ceiling),
    clampChannel(colour[1], ceiling),
    clampChannel(colour[2], ceiling),
  );
}

function multiply(a: Vec3, b: Vec3): Vec3 {
  return vec3(a[0] * b[0], a[1] * b[1], a[2] * b[2]);
}

export function materialAt(
  shape: ProxyShape,
  normal: Vec3,
  pointHeightM: number,
  context: TraceSurfaceContext,
): WhittedMaterial {
  const sample: SurfaceSample = Object.freeze({
    metalness: shape.metalness,
    roughness: shape.roughness,
    worldNormal: normal,
    heightM: pointHeightM - context.floorHeightM,
    screenAreaFraction: context.screenAreaFor(shape),
    wet: context.wet,
  });
  return materialForClassification(classifySurface(sample), shape.albedo, context.wet);
}

/**
 * Shadow-ray visibility, with the refractive caustic term.
 *
 * An opaque proxy in the way returns zero: that is the pixel-perfect hard
 * shadow this technique is worth having for. A TRANSPARENT proxy in the way
 * does not black the light out — it tints and attenuates it, and the surviving
 * light is what draws a caustic on the receiving surface. That is exactly what
 * "caustics through transparent objects" means here, and it is why the caustic
 * is a shadow-ray effect rather than a photon-mapped one.
 */
export function shadowVisibility(
  point: Vec3,
  normal: Vec3,
  light: TraceLight,
  scene: ProxyScene,
  context: TraceSurfaceContext,
  options: TraceOptions,
): Vec3 {
  if (!light.castsShadows) return vec3(1, 1, 1);
  const origin = add(point, scale(normal, SURFACE_EPSILON_M * 4));
  const reach = Number.isFinite(light.distanceM) ? light.distanceM : 1e6;
  let transmission = vec3(1, 1, 1);
  for (const shape of scene.shapes) {
    const hit = intersectShape(origin, light.direction, shape);
    if (!(hit.t > SURFACE_EPSILON_M) || hit.t >= reach) continue;
    const material = materialAt(shape, hit.normal, hit.point[1], context);
    if (material.type !== 'transparent' || !options.causticsEnabled) return vec3(0, 0, 0);
    // Fresnel says how much of the light bounced off the glass instead of
    // passing through it, and Beer-Lambert says how much the glass absorbed on
    // the way. What is left is the caustic.
    const cosine = Math.abs(dot(hit.normal, light.direction));
    const reflected = dielectricFresnel(cosine, material.indexOfRefraction);
    const thickness = Math.max(shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2]) * 2;
    const absorbed = vec3(
      Math.exp(-material.absorptionPerMetre[0] * thickness),
      Math.exp(-material.absorptionPerMetre[1] * thickness),
      Math.exp(-material.absorptionPerMetre[2] * thickness),
    );
    // The tint the glass imparts is what makes a caustic read as coloured light
    // rather than as a grey hole in the shadow.
    transmission = multiply(
      transmission,
      scale(multiply(absorbed, material.albedo), 1 - reflected),
    );
  }
  return transmission;
}

/**
 * One recursive trace. Returns linear radiance, already clamped to the
 * additive ceiling so no caller can forget to.
 */
export function traceRay(
  origin: Vec3,
  direction: Vec3,
  scene: ProxyScene,
  lights: readonly TraceLight[],
  context: TraceSurfaceContext,
  options: TraceOptions,
  depth = 0,
): Vec3 {
  if (depth >= options.maximumDepth) return vec3(0, 0, 0);
  const hit = intersectScene(origin, direction, scene);
  if (hit === NO_HIT || !Number.isFinite(hit.t) || hit.shapeIndex < 0) {
    // A ray that leaves the scene returns the environment. This is the SAME
    // baked/probe radiance the rasterized frame already uses, which is what
    // keeps the reflected sky and the drawn sky the same colour.
    return clampRadiance(options.environmentRadiance, options.maximumAdditiveGain);
  }
  const shape = scene.shapes[hit.shapeIndex];
  const material = materialAt(shape, hit.normal, hit.point[1], context);
  const outgoing = scale(direction, -1);
  const frontFacing = dot(hit.normal, outgoing) > 0;
  const normal = frontFacing ? hit.normal : scale(hit.normal, -1);
  const cosineView = Math.max(0, dot(normal, outgoing));

  // ---- Direct term: Hall's diffuse + specular, with a real shadow ray. -----
  let direct = multiply(material.albedo, options.environmentRadiance);
  for (const light of lights) {
    const nDotL = dot(normal, light.direction);
    if (nDotL <= 0) continue;
    const visibility = shadowVisibility(hit.point, normal, light, scene, context, options);
    if (visibility[0] + visibility[1] + visibility[2] <= 0) continue;
    const lit = multiply(light.colour, visibility);
    // Metals have no diffuse lobe: a conductor's whole response is specular.
    if (material.type !== 'metal') {
      direct = add(direct, multiply(material.albedo, scale(lit, nDotL)));
    }
    const halfway = normalize(add(light.direction, outgoing));
    const specular = Math.max(0, dot(normal, halfway)) ** material.specularExponent;
    const fresnel = schlickFresnel(cosineView, material.normalReflectance);
    direct = add(direct, scale(lit, specular * fresnel));
  }

  // ---- Recursion. ---------------------------------------------------------
  if (material.type === 'transparent' && options.refractionsEnabled) {
    const etaRatio = frontFacing ? 1 / material.indexOfRefraction : material.indexOfRefraction;
    const reflectance = dielectricFresnel(cosineView, material.indexOfRefraction);
    const reflectedDirection = normalize(reflect(direction, normal));
    const reflected = traceRay(
      add(hit.point, scale(normal, SURFACE_EPSILON_M * 4)),
      reflectedDirection,
      scene, lights, context, options, depth + 1,
    );
    const transmittedDirection = refract(direction, normal, etaRatio);
    // Total internal reflection: all of it comes back. Returning a zero
    // direction here instead is how glass turns into a black void.
    const transmitted = transmittedDirection === null
      ? reflected
      : traceRay(
        add(hit.point, scale(normal, -SURFACE_EPSILON_M * 4)),
        transmittedDirection,
        scene, lights, context, options, depth + 1,
      );
    const thickness = Math.max(shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2]) * 2;
    const absorbed = vec3(
      Math.exp(-material.absorptionPerMetre[0] * thickness),
      Math.exp(-material.absorptionPerMetre[1] * thickness),
      Math.exp(-material.absorptionPerMetre[2] * thickness),
    );
    const combined = add(
      scale(reflected, reflectance),
      scale(multiply(transmitted, multiply(absorbed, material.albedo)), 1 - reflectance),
    );
    return clampRadiance(add(scale(direct, 0.15), combined), options.maximumAdditiveGain);
  }

  if (material.spawnsReflectionRay) {
    const fresnel = material.type === 'metal'
      ? schlickFresnel(cosineView, material.normalReflectance)
      : schlickFresnel(cosineView, material.normalReflectance);
    const reflectedDirection = normalize(reflect(direction, normal));
    const reflected = traceRay(
      add(hit.point, scale(normal, SURFACE_EPSILON_M * 4)),
      reflectedDirection,
      scene, lights, context, options, depth + 1,
    );
    // A conductor tints its mirror with its own colour; a clear coat does not
    // tint the coat reflection at all, which is the whole visual difference
    // between chrome and lacquer.
    const tinted = material.type === 'metal' ? multiply(reflected, material.albedo) : reflected;
    return clampRadiance(add(direct, scale(tinted, fresnel)), options.maximumAdditiveGain);
  }

  return clampRadiance(direct, options.maximumAdditiveGain);
}

// ---------------------------------------------------------------------------
// Aperture depth of field — real ray spread, not a post-process blur
// ---------------------------------------------------------------------------

export type ThinLensCamera = Readonly<{
  position: Vec3;
  /** Unit forward. */
  forward: Vec3;
  /** Unit right. */
  right: Vec3;
  /** Unit up. */
  up: Vec3;
  /** Tangent of the half vertical field of view. */
  tanHalfFovY: number;
  aspect: number;
  /** Aperture RADIUS in metres. Zero is a pinhole and everything is sharp. */
  apertureRadiusM: number;
  /** Distance at which the image is exactly sharp. */
  focalDistanceM: number;
}>;

/**
 * Generates one camera ray through NDC (-1..1) with a thin-lens aperture.
 *
 * The lens sample is handed in rather than drawn internally: this project bans
 * `Math.random` in anything peers must agree on, and a deterministic sample
 * also means the depth-of-field bound below is a proof rather than a sampling
 * estimate.
 */
export function thinLensRay(
  camera: ThinLensCamera,
  ndcX: number,
  ndcY: number,
  lensSampleX: number,
  lensSampleY: number,
): Readonly<{ origin: Vec3; direction: Vec3 }> {
  const px = ndcX * camera.tanHalfFovY * camera.aspect;
  const py = ndcY * camera.tanHalfFovY;
  const pinhole = normalize(add(
    camera.forward,
    add(scale(camera.right, px), scale(camera.up, py)),
  ));
  if (camera.apertureRadiusM <= 0) {
    return Object.freeze({ origin: camera.position, direction: pinhole });
  }
  // The focal point is where every ray through the aperture must converge, so
  // it is found along the PINHOLE ray at the focal distance and then aimed at
  // from the displaced lens position.
  const cosine = Math.max(1e-4, dot(pinhole, camera.forward));
  const focalPoint = add(camera.position, scale(pinhole, camera.focalDistanceM / cosine));
  const lens = add(
    camera.position,
    add(
      scale(camera.right, lensSampleX * camera.apertureRadiusM),
      scale(camera.up, lensSampleY * camera.apertureRadiusM),
    ),
  );
  return Object.freeze({ origin: lens, direction: normalize(sub(focalPoint, lens)) });
}

/**
 * The blur-circle diameter, in PIXELS, that a thin lens produces for a point at
 * `distanceM`. This is the number the aperture bound is written against, and it
 * is exact rather than a heuristic:
 *
 *   c_world = A * |d - f| / d        (similar triangles across the lens)
 *   c_px    = c_world * H / (2 * d * tanHalfFovY)
 *
 * where A is the aperture DIAMETER, f the focal distance, d the subject
 * distance and H the framebuffer height in pixels.
 */
export function apertureBlurCircleDiameterPx(
  camera: ThinLensCamera,
  distanceM: number,
  framebufferHeightPx: number,
): number {
  if (camera.apertureRadiusM <= 0) return 0;
  const distance = Math.max(1e-4, distanceM);
  const apertureDiameter = camera.apertureRadiusM * 2;
  const worldDiameter = apertureDiameter * Math.abs(distance - camera.focalDistanceM) / distance;
  const worldPerPixel = (2 * distance * camera.tanHalfFovY) / Math.max(1, framebufferHeightPx);
  return worldDiameter / worldPerPixel;
}
