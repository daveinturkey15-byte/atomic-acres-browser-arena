/**
 * HF-398 — the ray-traced light node: the GPU half of the classic recursive
 * ray tracer, expressed as TSL on the existing linear-HDR chain.
 *
 * `raytracing-profile.ts` owns the numbers, `whitted-tracer.ts` owns the
 * specification, and this file turns both into nodes. When the CPU reference
 * and this graph disagree, the CPU reference is right and this is the bug.
 *
 * WHAT MAKES THIS RAY TRACING AND NOT ANOTHER SCREEN-SPACE TRICK.
 * The existing screen-space reflection tier marches the DEPTH BUFFER: it can
 * only ever reflect what is already on screen, which is the technique and not a
 * defect. This node instead reconstructs the shaded point in WORLD SPACE and
 * intersects a real world-space ray against real world-space geometry — the
 * analytic proxy set built from the arena at load. It therefore reflects
 * architecture that is behind the camera and off the sides of the frame, and it
 * resolves shadow rays by intersection rather than by sampling a shadow map.
 * That is a genuine, if bounded, Whitted trace.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, AND WHY.
 *
 *  1. IT NEVER DARKENS A PIXEL. The whole contribution composites with `+`,
 *     like every other lighting effect in this chain. So the pixel-perfect
 *     shadows this technique is famous for appear INSIDE the reflected and
 *     refracted image, where they cost nothing in readability, and the primary
 *     shadow solve stays with the existing shadow map. A ray-traced primary
 *     shadow would be a darkening pass, and a darkening pass can hide a player.
 *
 *  2. IT NEVER TRACES A DYNAMIC OBJECT. No player, bot or vehicle is in the
 *     proxy set, so no enemy can be duplicated into a mirror and no positional
 *     information exists here that the Performance preset cannot also give.
 *     See `RAY_TRACED_PRESET_PARITY`.
 *
 *  3. IT IS NOT HARDWARE RAY TRACING. No browser exposes a ray-tracing
 *     pipeline, acceleration structures or ray queries; nothing here requests
 *     an extension, and no string in this build claims RTX, RT cores, hardware
 *     acceleration, or path tracing.
 *
 * KNOWN APPROXIMATION, carried honestly. Metalness and roughness are shader
 * properties only PBR node materials write, so a basic, points or sky material
 * leaves both zero-initialised, which reads as a perfectly smooth dielectric.
 * The sky dome and the additive atmosphere cards are exactly those materials,
 * which is why every pixel past `RAY_TRACED_GEOMETRY_DEPTH_LIMIT_M` is excluded
 * from the trace outright rather than trusted to classify itself.
 */

import * as THREE from 'three';
import type { Node } from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  dot,
  float,
  luminance,
  max,
  min,
  mix,
  nodeObject,
  normalize,
  reflect,
  refract,
  screenUV,
  sign,
  smoothstep,
  step,
  uniform,
  uniformArray,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  type ProxyScene,
  PROXY_FLOATS_PER_SHAPE,
  extractProxyScene,
  packProxyScene,
} from './analytic-proxy-scene';
import {
  type RayTracingTuning,
  RAY_TRACED_GEOMETRY_DEPTH_LIMIT_M,
  RAY_TRACED_GLOSS_RAMP_CEILING,
  RAY_TRACED_GLOSS_RAMP_FLOOR,
  RAY_TRACED_MAXIMUM_SHAPES,
  assertRayTracingCombatSafety,
} from './raytracing-profile';
import {
  ABOVE_COMBAT_BAND_M,
  GLASS_INDEX_OF_REFRACTION,
  WALL_NORMAL_Y_CEILING,
} from './whitted-materials';

/** The stage name this node contributes to the linear-source receipt. */
export const RAY_TRACED_LIGHT_STAGE = 'raytraced-reflection-refraction-add';

const VEC4S_PER_SHAPE = PROXY_FLOATS_PER_SHAPE / 4;

/** Empty slots carry this kind code so the loop skips them with one compare. */
const EMPTY_SHAPE_KIND = -1;

/** Floor normal test: cos(20 degrees) rounded, i.e. "this is walkable ground". */
const FLOOR_NORMAL_Y_FLOOR = 0.94;

/** Writes a light's colour and intensity into a linear-radiance vec3 uniform. */
function setRadiance(target: THREE.Vector3, colour: THREE.Color, intensity: number): THREE.Vector3 {
  return target.set(colour.r, colour.g, colour.b).multiplyScalar(intensity);
}

export type RayTracedLightSources = Readonly<{
  /** The rasterized scene colour, used as the metal tint and the contrast base. */
  sceneColor: Node<'vec4'>;
  /** View-space normals from the MRT normal attachment. */
  sceneNormal: Node<'vec4'>;
  /** Packed vec4(metalness, roughness, 0, 1). */
  sceneMaterial: Node<'vec4'>;
  /** Scene-pass view Z, i.e. `scenePass.getViewZNode()`. */
  sceneViewZ: Node<'float'>;
  camera: THREE.Camera;
  /** The sun. Shadow rays are cast toward it, and it tints the sky term. */
  sun: THREE.DirectionalLight | THREE.PointLight | null;
}>;

export type RayTracedLightGraph = Readonly<{
  stage: string;
  /** Additive linear-HDR light, ready to add into the reflection term. */
  light: Node<'vec3'>;
  /** How many shapes the live proxy set holds. Reported, not guessed. */
  tracedShapeCount(): number;
  /** Replaces the traced proxy set without rebuilding the graph. */
  setProxyScene(scene: ProxyScene, floorHeightM: number): void;
  /** Pushes a new tuning into the live uniforms. Topology is unchanged. */
  applyTuning(next: RayTracingTuning): void;
  /** Called once per presented frame, before submission. */
  beforeRender(): void;
  dispose(): void;
}>;

/**
 * Builds the trace.
 *
 * The proxy set lives in a uniform array sized to `RAY_TRACED_MAXIMUM_SHAPES`
 * and the loop is a CONSTANT trip count. That is deliberate: a dynamic loop
 * bound is a different shader on some drivers and a recompile on others, and
 * this preset's entire admission budget rests on the trace compiling once.
 */
export function buildRayTracedLightNode(
  sources: RayTracedLightSources,
  tuning: RayTracingTuning,
): RayTracedLightGraph {
  assertRayTracingCombatSafety(tuning);

  // --- Camera and scene uniforms, pushed explicitly. ------------------------
  // The built-in camera nodes resolve against whatever camera the pass is drawn
  // with, and a full-screen post pass is drawn with a quad camera. So every
  // camera quantity this trace needs is an explicit uniform written in
  // `beforeRender`, which is also the only way the values stay auditable.
  const cameraWorldMatrix = uniform(new THREE.Matrix4());
  const cameraRotation = uniform(new THREE.Matrix3());
  const cameraPositionWorld = uniform(new THREE.Vector3());
  const tanHalfFovY = uniform(0.5);
  const aspectRatio = uniform(16 / 9);

  const sunDirection = uniform(new THREE.Vector3(0.45, 0.72, -0.22).normalize());
  // Vector3 rather than Color deliberately: TSL types a Color uniform as the
  // 'color' node type, which is not interchangeable with 'vec3' in arithmetic,
  // and every use below is arithmetic on linear radiance rather than a colour
  // the renderer should ever convert.
  const sunColour = uniform(new THREE.Vector3(1, 1, 1));
  const skyRadiance = uniform(new THREE.Vector3(0.09, 0.12, 0.17));
  const groundRadiance = uniform(new THREE.Vector3(0.05, 0.045, 0.04));

  const additiveGain = uniform(tuning.enabled ? 1 : 0);
  const maximumAdditiveGain = uniform(tuning.maximumAdditiveGain);
  const backgroundFraction = uniform(tuning.backgroundLuminanceFraction);
  const floorHeight = uniform(0);
  const causticMix = uniform(tuning.causticsEnabled ? 1 : 0);
  const refractionsInGraph = tuning.refractionsEnabled;

  const shapeSlots = Array.from(
    { length: RAY_TRACED_MAXIMUM_SHAPES * VEC4S_PER_SHAPE },
    () => new THREE.Vector4(),
  );
  for (let index = 0; index < RAY_TRACED_MAXIMUM_SHAPES; index += 1) {
    shapeSlots[index * VEC4S_PER_SHAPE].w = EMPTY_SHAPE_KIND;
  }
  let liveShapeCount = 0;
  const shapeArray = uniformArray(shapeSlots, 'vec4');
  // `UniformArrayNode.element()` is typed without swizzle access, so one cast
  // is quarantined here rather than repeated at every call site.
  const shapes = (index: Node<'int'>): Node<'vec4'> => (
    nodeObject(shapeArray.element(index) as unknown as Node<'vec4'>)
  );

  // --- Intersection. -------------------------------------------------------
  // Slab test against a yaw-oriented box, returning (tNear, tFar). A miss is
  // any result where tFar < max(tNear, epsilon); the caller tests that once,
  // rather than this returning a sentinel every call site has to special-case.
  const intersectBox = Fn(([origin, direction, centre, halfExtents, yaw]: readonly [
    Node<'vec3'>, Node<'vec3'>, Node<'vec3'>, Node<'vec3'>, Node<'float'>,
  ]) => {
    const cosYaw = yaw.cos();
    const sinYaw = yaw.sin();
    const offset = origin.sub(centre);
    const localOrigin = vec3(
      offset.x.mul(cosYaw).add(offset.z.mul(sinYaw)),
      offset.y,
      offset.x.mul(sinYaw).negate().add(offset.z.mul(cosYaw)),
    );
    const localDirection = vec3(
      direction.x.mul(cosYaw).add(direction.z.mul(sinYaw)),
      direction.y,
      direction.x.mul(sinYaw).negate().add(direction.z.mul(cosYaw)),
    );
    // A component of exactly zero is a ray parallel to that slab. Nudging it
    // instead of branching keeps the loop body uniform, and the huge t values
    // that result fall out of the min/max naturally.
    const safeDirection = vec3(
      localDirection.x.add(sign(localDirection.x).mul(1e-6)).add(1e-9),
      localDirection.y.add(sign(localDirection.y).mul(1e-6)).add(1e-9),
      localDirection.z.add(sign(localDirection.z).mul(1e-6)).add(1e-9),
    );
    const inverse = vec3(1, 1, 1).div(safeDirection);
    const first = halfExtents.negate().sub(localOrigin).mul(inverse);
    const second = halfExtents.sub(localOrigin).mul(inverse);
    const slabNear = min(first, second);
    const slabFar = max(first, second);
    const tNear = max(max(slabNear.x, slabNear.y), slabNear.z);
    const tFar = min(min(slabFar.x, slabFar.y), slabFar.z);
    return vec2(tNear, tFar);
  });

  /** World-space normal of the box face a hit at `tHit` landed on. */
  const boxNormal = Fn(([origin, direction, centre, halfExtents, yaw, tHit]: readonly [
    Node<'vec3'>, Node<'vec3'>, Node<'vec3'>, Node<'vec3'>, Node<'float'>, Node<'float'>,
  ]) => {
    const cosYaw = yaw.cos();
    const sinYaw = yaw.sin();
    const offset = origin.add(direction.mul(tHit)).sub(centre);
    const localPoint = vec3(
      offset.x.mul(cosYaw).add(offset.z.mul(sinYaw)),
      offset.y,
      offset.x.mul(sinYaw).negate().add(offset.z.mul(cosYaw)),
    );
    // The face is whichever local axis the hit point came closest to saturating.
    const ratio = localPoint.div(max(halfExtents, vec3(1e-4, 1e-4, 1e-4)));
    const magnitude = abs(ratio);
    const largest = max(max(magnitude.x, magnitude.y), magnitude.z);
    const localNormal = vec3(
      step(largest.sub(1e-4), magnitude.x).mul(sign(ratio.x)),
      step(largest.sub(1e-4), magnitude.y).mul(sign(ratio.y)),
      step(largest.sub(1e-4), magnitude.z).mul(sign(ratio.z)),
    );
    const worldNormal = vec3(
      localNormal.x.mul(cosYaw).sub(localNormal.z.mul(sinYaw)),
      localNormal.y,
      localNormal.x.mul(sinYaw).add(localNormal.z.mul(cosYaw)),
    );
    return normalize(worldNormal);
  });

  /** Sky/ground gradient for a ray that leaves the proxy set entirely. */
  const environmentRadiance = Fn(([direction]: readonly [Node<'vec3'>]) => {
    const up = clamp(direction.y.mul(0.5).add(0.5), 0, 1);
    const gradient = mix(groundRadiance, skyRadiance, up);
    // The sun's own disc, so a mirror pointed at it returns a highlight rather
    // than flat sky. Tight, because a broad sun produces mush.
    const sunFacing = clamp(dot(direction, sunDirection), 0, 1);
    const disc = smoothstep(float(0.9986), float(0.9999), sunFacing);
    return gradient.add(sunColour.mul(disc));
  });

  /**
   * Occlusion query for a shadow ray. Returns transmission, not a boolean: an
   * opaque proxy in the way returns zero and one flagged transparent returns
   * the light that survived refraction through it, which is the caustic. These
   * are SHADOW-RAY caustics — a look, and a very good one, not photon mapping,
   * and never described as physically accurate.
   */
  const shadowTransmission = Fn(([origin, direction]: readonly [Node<'vec3'>, Node<'vec3'>]) => {
    const transmission = float(1).toVar();
    Loop(RAY_TRACED_MAXIMUM_SHAPES, ({ i }) => {
      const base = i.mul(VEC4S_PER_SHAPE);
      const centreKind = shapes(base);
      const extentsYaw = shapes(base.add(1));
      const roughnessSlot = shapes(base.add(3));
      If(centreKind.w.greaterThanEqual(float(0)), () => {
        const span = intersectBox(
          origin, direction, centreKind.xyz, extentsYaw.xyz, extentsYaw.w,
        );
        const hit = step(float(1e-3), span.x).mul(step(span.x, span.y));
        const transparent = step(roughnessSlot.x, float(0.06)).mul(causticMix);
        const blocked = hit.mul(mix(float(1), float(0.28), transparent));
        transmission.mulAssign(blocked.oneMinus());
      });
    });
    return clamp(transmission, 0, 1);
  });

  /**
   * One bounce: intersect the proxy set, shade the hit with a real shadow ray,
   * and fall back to the environment gradient on a miss.
   */
  const traceBounce = Fn(([origin, direction]: readonly [Node<'vec3'>, Node<'vec3'>]) => {
    const nearest = float(1e6).toVar();
    const hitIndex = float(0).toVar();
    Loop(RAY_TRACED_MAXIMUM_SHAPES, ({ i }) => {
      const base = i.mul(VEC4S_PER_SHAPE);
      const centreKind = shapes(base);
      const extentsYaw = shapes(base.add(1));
      If(centreKind.w.greaterThanEqual(float(0)), () => {
        const span = intersectBox(
          origin, direction, centreKind.xyz, extentsYaw.xyz, extentsYaw.w,
        );
        const valid = step(float(1e-3), span.x)
          .mul(step(span.x, span.y))
          .mul(step(span.x, nearest));
        nearest.assign(mix(nearest, span.x, valid));
        hitIndex.assign(mix(hitIndex, float(i), valid));
      });
    });

    const escaped = step(nearest, float(1e5)).oneMinus();
    const slot = hitIndex.mul(VEC4S_PER_SHAPE).toInt();
    const centreKind = shapes(slot);
    const extentsYaw = shapes(slot.add(1));
    const albedoMetal = shapes(slot.add(2));
    const point = origin.add(direction.mul(min(nearest, float(1e5))));
    const normal = boxNormal(
      origin, direction, centreKind.xyz, extentsYaw.xyz, extentsYaw.w, min(nearest, float(1e5)),
    );
    const nDotL = clamp(dot(normal, sunDirection), 0, 1);
    const visibility = shadowTransmission(point.add(normal.mul(float(4e-3))), sunDirection);
    const lit = albedoMetal.xyz.mul(
      sunColour.mul(nDotL).mul(visibility).add(skyRadiance.mul(0.35)),
    );
    return mix(lit, environmentRadiance(direction), escaped);
  });

  // --- The per-pixel shading. ----------------------------------------------
  const light = Fn(() => {
    const sceneColour = nodeObject(sources.sceneColor);
    const material = nodeObject(sources.sceneMaterial);
    const metalness = clamp(material.r, 0, 1);
    const roughness = clamp(material.g, 0, 1);

    const viewZ = nodeObject(sources.sceneViewZ);
    const viewDepth = viewZ.negate();
    // The sky dome and the additive atmosphere cards are non-PBR materials that
    // leave metalness and roughness zero-initialised, which would otherwise
    // read as a perfect mirror. Excluding everything past the geometry depth
    // limit removes that class outright and bounds the trace's screen area at
    // the same time.
    const geometryGate = step(viewDepth, float(RAY_TRACED_GEOMETRY_DEPTH_LIMIT_M))
      .mul(step(float(0.02), viewDepth));

    // The gloss ramp. Above the ceiling a surface is Phong: it spawns no
    // reflection ray at all, which is the single largest saving in the whole
    // trace and the reason a scene of concrete and foliage costs almost
    // nothing. Below it the strength rises smoothly rather than switching on,
    // because a semi-gloss surface reflects blurrily rather than not at all —
    // and because a hard cutoff at the mirror boundary landed this layer on a
    // handful of window panes and nothing else on the measured arenas.
    const mirrorWeight = smoothstep(
      float(RAY_TRACED_GLOSS_RAMP_CEILING), float(RAY_TRACED_GLOSS_RAMP_FLOOR), roughness,
    ).mul(geometryGate);

    const ndc = screenUV.mul(2).sub(1);
    const viewPosition = vec3(
      ndc.x.mul(tanHalfFovY).mul(aspectRatio).mul(viewDepth),
      ndc.y.mul(tanHalfFovY).mul(viewDepth),
      viewZ,
    );
    const worldPosition = cameraWorldMatrix.mul(vec4(viewPosition, 1)).xyz;
    const viewNormal = normalize(nodeObject(sources.sceneNormal).xyz);
    const worldNormal = normalize(cameraRotation.mul(viewNormal));
    const viewDirection = normalize(worldPosition.sub(cameraPositionWorld));

    // ---- The readability demotions, per pixel. ---------------------------
    // A large flat wall inside the band a player searches for torsos must not
    // be a mirror: players shoot reflections and lose the real target. A
    // walkable floor must not be one either, because ground contact is where
    // range and stance are read. Both keep a dielectric coat instead — which is
    // the look that was wanted anyway.
    const heightAboveFloor = worldPosition.y.sub(floorHeight);
    const facesSideways = step(abs(worldNormal.y), float(WALL_NORMAL_Y_CEILING));
    const insideSearchBand = step(heightAboveFloor, float(ABOVE_COMBAT_BAND_M));
    const wallDemotion = facesSideways.mul(insideSearchBand);
    const floorDemotion = step(float(FLOOR_NORMAL_Y_FLOOR), worldNormal.y);
    const demoted = clamp(max(wallDemotion, floorDemotion), 0, 1);

    // A conductor's F0 is its own colour; a dielectric coat is 0.04 everywhere.
    // The demotion collapses a would-be mirror onto the coat, which is exactly
    // "beauty gives way, and the readability threshold does not".
    const effectiveMetalness = metalness.mul(demoted.oneMinus());
    const baseReflectance = mix(vec3(0.04, 0.04, 0.04), sceneColour.rgb, effectiveMetalness);
    const cosineView = clamp(dot(worldNormal, viewDirection.negate()), 0, 1);
    const fresnel = baseReflectance.add(
      vec3(1, 1, 1).sub(baseReflectance).mul(cosineView.oneMinus().pow(5)),
    );

    // THE GATE, and it is real time saved rather than a multiply by zero: a
    // pixel too rough to spawn a reflection ray runs no traversal at all, and
    // neither does any pixel once the adaptive valve has paused the trace under
    // sustained frame-time pressure. This is the trace's ONLY live cost lever —
    // ray count and recursion depth are topology and belong to the declared
    // pipeline-rebuild path.
    const traceGate = additiveGain.mul(mirrorWeight);
    const result = vec3(0, 0, 0).toVar();
    If(traceGate.greaterThan(float(1e-3)), () => {
      const reflectedDirection = normalize(reflect(viewDirection, worldNormal));
      const reflected = traceBounce(
        worldPosition.add(worldNormal.mul(float(4e-3))), reflectedDirection,
      );
      const secondary = vec3(reflected).toVar();
      const weight = vec3(fresnel).toVar();
      if (refractionsInGraph) {
        // A smooth, non-metallic surface bends the view ray instead of
        // mirroring it. Real Snell refraction, with the Fresnel term deciding
        // how much of each comes back, so glass reads as glass head-on and as a
        // mirror at a grazing angle — which is what glass actually does.
        const transmissive = metalness.oneMinus()
          .mul(step(roughness, float(0.06)))
          .mul(geometryGate);
        const refractedDirection = normalize(
          refract(viewDirection, worldNormal, float(1 / GLASS_INDEX_OF_REFRACTION)),
        );
        const refracted = traceBounce(
          worldPosition.sub(worldNormal.mul(float(4e-3))), refractedDirection,
        );
        const fresnelScalar = clamp(max(max(fresnel.x, fresnel.y), fresnel.z), 0, 1);
        const throughGlass = mix(refracted, reflected, fresnelScalar);
        secondary.assign(mix(reflected, throughGlass, transmissive));
        // Weighting a transmissive pixel by the 0.04 dielectric Fresnel term
        // would make glass invisible, which is the opposite of the point.
        weight.assign(mix(fresnel, vec3(0.86, 0.86, 0.86), transmissive));
      }

      // ---- The bounds, applied rather than trusted. -----------------------
      // 1. An absolute linear-HDR ceiling, the same order as the godray ceiling
      //    this project has already proven safe on these arenas.
      // 2. A ceiling RELATIVE to the pixel's own luminance, which is what keeps
      //    an enemy silhouette's Weber contrast above the project's 0.35
      //    READABLE threshold: additive light lands on the background as well
      //    as on the target, so the contrast loss is bounded only if the
      //    addition is bounded against the background it lands on.
      const contribution = secondary.mul(weight).mul(mirrorWeight).mul(additiveGain);
      const relativeCeiling = luminance(sceneColour.rgb).mul(backgroundFraction);
      const ceiling = min(maximumAdditiveGain, max(relativeCeiling, float(1e-5)));
      const magnitude = max(max(contribution.x, contribution.y), contribution.z);
      const scaleDown = min(float(1), ceiling.div(max(magnitude, float(1e-5))));
      result.assign(contribution.mul(scaleDown));
    });
    return result;
  });

  let active = tuning;

  // --- Where the traced geometry comes from. -------------------------------
  // The scene-pass assembler is owned by another lane and hands this module the
  // camera, not the scene. The camera is parented into the scene (legacy-main
  // `scene.add(camera)`), so the arena root is its topmost ancestor; the sun is
  // the fallback for a detached review camera. Walking up beats inventing a new
  // parameter that the assembler would have to be changed to pass.
  const sceneRoot = (): THREE.Object3D | null => {
    let node: THREE.Object3D | null = sources.camera as THREE.Object3D;
    while (node?.parent) node = node.parent;
    if (node && node !== (sources.camera as THREE.Object3D)) return node;
    let fromSun: THREE.Object3D | null = sources.sun as THREE.Object3D | null;
    while (fromSun?.parent) fromSun = fromSun.parent;
    return fromSun && fromSun !== (sources.sun as unknown) ? fromSun : null;
  };

  // The arena streams in AFTER the pipeline is assembled, so the proxy cannot
  // be built at graph-construction time — it would be built over an empty
  // scene. It is rebuilt when the root's child count changes and settles,
  // debounced so a streaming arena does not re-traverse every frame, and it is
  // never built while the trace is switched off.
  let lastRootSignature = -1;
  let lastExtractionAt = 0;
  const EXTRACTION_DEBOUNCE_MS = 1_000;

  const refreshProxyScene = (graph: RayTracedLightGraph): void => {
    if (!active.enabled) return;
    const root = sceneRoot();
    if (!root) return;
    const signature = root.children.length;
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    if (signature === lastRootSignature && liveShapeCount > 0) return;
    if (now - lastExtractionAt < EXTRACTION_DEBOUNCE_MS) return;
    lastExtractionAt = now;
    lastRootSignature = signature;
    const proxy = extractProxyScene(root, THREE);
    graph.setProxyScene(proxy, proxy.boundsMin[1]);
  };

  const graph: RayTracedLightGraph = Object.freeze({
    stage: RAY_TRACED_LIGHT_STAGE,
    light: light() as unknown as Node<'vec3'>,
    tracedShapeCount(): number {
      return liveShapeCount;
    },
    setProxyScene(scene: ProxyScene, floorHeightM: number): void {
      const packed = packProxyScene(scene, RAY_TRACED_MAXIMUM_SHAPES);
      liveShapeCount = Math.min(scene.shapes.length, RAY_TRACED_MAXIMUM_SHAPES);
      for (let index = 0; index < RAY_TRACED_MAXIMUM_SHAPES; index += 1) {
        const base = index * PROXY_FLOATS_PER_SHAPE;
        const slot = index * VEC4S_PER_SHAPE;
        const occupied = index < liveShapeCount;
        shapeSlots[slot + 0].set(
          packed[base + 0], packed[base + 1], packed[base + 2],
          occupied ? packed[base + 3] : EMPTY_SHAPE_KIND,
        );
        shapeSlots[slot + 1].set(packed[base + 4], packed[base + 5], packed[base + 6], packed[base + 7]);
        shapeSlots[slot + 2].set(packed[base + 8], packed[base + 9], packed[base + 10], packed[base + 11]);
        shapeSlots[slot + 3].set(packed[base + 12], 0, 0, 0);
      }
      floorHeight.value = floorHeightM;
      // The second half of the runtime receipt: what the trace is actually
      // pointed at. `shapes/candidates:reflectiveMeshes` says, from outside the
      // build, whether the proxy found geometry AND whether this arena has any
      // surface smooth enough to spawn a ray. An arena of grass, brick and
      // stucco reporting zero reflective meshes is a correct, invisible layer —
      // not a broken one — and the two cases must be distinguishable.
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.dataset.rayTracedProxy =
          `${liveShapeCount}/${scene.candidatesConsidered}:${scene.reflectiveMeshCount}`;
      }
    },
    applyTuning(next: RayTracingTuning): void {
      assertRayTracingCombatSafety(next);
      active = next;
      additiveGain.value = next.enabled ? 1 : 0;
      maximumAdditiveGain.value = next.maximumAdditiveGain;
      backgroundFraction.value = next.backgroundLuminanceFraction;
      causticMix.value = next.causticsEnabled ? 1 : 0;
    },
    beforeRender(): void {
      const camera = sources.camera as THREE.PerspectiveCamera;
      camera.updateMatrixWorld();
      cameraWorldMatrix.value.copy(camera.matrixWorld);
      cameraRotation.value.setFromMatrix4(camera.matrixWorld);
      cameraPositionWorld.value.setFromMatrixPosition(camera.matrixWorld);
      if (typeof camera.fov === 'number' && typeof camera.aspect === 'number') {
        tanHalfFovY.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
        aspectRatio.value = camera.aspect;
      }
      const sun = sources.sun;
      if (sun instanceof THREE.DirectionalLight) {
        // Direction FROM the surface TOWARD the light, which is what every
        // shading term expects and the opposite of the light's forward vector.
        sunDirection.value.copy(sun.position).sub(sun.target.position).normalize();
        setRadiance(sunColour.value, sun.color, Math.min(2, sun.intensity));
      } else if (sun) {
        sunDirection.value.copy(sun.position).normalize();
        setRadiance(sunColour.value, sun.color, Math.min(2, sun.intensity));
      }
      // The sky and ground terms follow the arena's own sun rather than being a
      // flat ambient constant raised to cover the bounce classic ray tracing
      // does not compute. The real fill for that bounce is the baked PMREM
      // probe this preset runs at its highest tier; raising ambient instead is
      // the failure mode that turns a ray-traced scene into milk.
      skyRadiance.value.copy(sunColour.value).multiplyScalar(0.14).addScalar(0.03);
      groundRadiance.value.copy(sunColour.value).multiplyScalar(0.05).addScalar(0.012);
      /* addScalar exists on Vector3; the two lines above are linear radiance. */
      additiveGain.value = active.enabled ? 1 : 0;
      refreshProxyScene(graph);
    },
    dispose(): void {
      /* Every resource here is a uniform owned by the node graph itself. */
    },
  });
  return graph;
}
