/**
 * nuketown2-pool-water.ts — PASS 94 lane TECHNIQUES: the back-yard pool, given
 * a physical water-colour model.
 *
 * WHAT WAS THERE BEFORE, exactly. `createNuketown2PoolWaterMaterial()` in
 * `nuketown2-interior-materials.ts` sets a CONSTANT `vec3(0.04, 0.44, 0.54)`
 * plus a +/- 0.04 fbm ripple, `opacity: 0.78` flat, and calls that comment
 * "Beer-Lambert absorption tone". It is a palette, not an absorption model:
 * there is no path length in it, so the water is the same colour 5 cm from the
 * coping as it is over the deepest point, and it is equally opaque looked at
 * straight down as at a grazing angle. That is the "blue lid" failure the
 * water skill names, and it is what this module replaces.
 *
 * TECHNIQUE PROVENANCE. Register row 46 (Three.js Water Pro) - the library is
 * PAID, all-rights-reserved, and no part of it is used, read or reverse
 * engineered here; both of that author's water repositories return 404 so
 * there is no code to copy even in principle. What IS free is his public
 * documentation, and the physics it names is published oceanography and
 * graphics rather than his expression. Restated here and implemented from
 * scratch in our own TSL, in the order the `threejs-webgpu-water` skill gives
 * (§"The physical water stack: build it in this order"):
 *
 *   1. BEER-LAMBERT ABSORPTION over a real optical path (skill step 1). The
 *      path is `pathLength = depthUnderSurface / max(cos(theta), eps)` where
 *      the depth comes from an authored dished BED PROFILE and `theta` is the
 *      view angle, so a grazing look through 3 m of water is 3 m of water and
 *      a look straight down into the shallow edge is 15 cm of it. Per-channel
 *      extinction: red largest, green smallest - the Jerlov-style ordering for
 *      a clean chlorinated domestic pool, which sits at the CLEAR end.
 *   2. BROADBAND BACKSCATTER injected UPSTREAM of the absorption integral
 *      (skill step 2), driven by the same crest estimator that drives foam and
 *      forced to zero in calm water. In a domestic pool this term is nearly
 *      always ~0, which is the correct outcome, not a missing feature: the
 *      skill's own rule is "keep it out of calm water entirely".
 *   3. EDGE FOAM, depth-driven (skill step 3, the shoreline layer), plus a
 *      crest term with an explicit lag so foam trails the ripple instead of
 *      blinking with it. The persistent world-fixed foam FIELD is NOT built -
 *      see OPEN below.
 *   4. LOCAL FRESNEL TRANSPARENCY at iorRatio 1.33 (skill step 4). Thin water
 *      seen steeply from above goes see-through; the same surface at a grazing
 *      angle stays opaque. This is the single term that makes a pool read as
 *      water rather than as a painted lid, and it is why `opacityNode` is a
 *      function here and a constant 0.78 before.
 *
 * OPEN, deliberately, with the reason (never silently omitted):
 *   - Persistent Jacobian foam held in a world-fixed render target. That is
 *     one render target plus one blit per frame (skill §"Per-frame cost
 *     classes") for a 9.9 m2 pool. Not a trade this map should make; the
 *     depth-driven edge layer carries the read.
 *   - Refraction of the scene behind the surface, and caustics on the bed.
 *     Both need a scene colour copy or a pass. Recorded, not opened.
 *   - Wave HEIGHT. A domestic pool's surface displacement is millimetres, and
 *     the mesh this material dresses is a 1-segment box emitted by the arena's
 *     own `pair()` helper, so there is nothing to displace. The swept surface
 *     is therefore a NORMAL field, which is the physically correct model at
 *     this scale: what you see on a pool is refraction and specular driven by
 *     surface slope, not silhouette.
 *
 * PARITY. Presentation only. The material carries no gameplay authority: the
 * pool is not swimmable, has no submersion query, and the mesh it dresses is
 * already `solid: false, shots: false, cast: false` in `nuketown2-arena.ts`.
 * Nothing here may write water level, swimmable state or amplitude, and
 * nothing here varies by render profile - the same graph compiles on Quality
 * and on Performance, so the two profiles see one surface.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { nuketown2HandedX } from './nuketown2-layout';

const {
  abs,
  float,
  max,
  min,
  mix,
  positionViewDirection,
  positionWorld,
  smoothstep,
  time,
  transformNormalToView,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

// ---------------------------------------------------------------------------
// The authored body (mirrors `yard pool water` in nuketown2-arena.ts)
// ---------------------------------------------------------------------------

/**
 * The pool as DATA, in the shape the water skill's roster rule asks for: one
 * body, its extents, its bed profile and its optical class. The arena still
 * owns the mesh; this is the water entry that describes it.
 *
 * `nuketown2-pool-water.test.ts` pins every number here against the arena's
 * own constructed mesh, so it cannot drift.
 */
export const NUKETOWN2_POOL = Object.freeze({
  id: 'nuketown2-yard-pool',
  /** AUTHORED centre - `pair()` mirrors x and emits the 180-degree partner. */
  authoredX: 4.8,
  z: -29.5,
  /** Water sheet extents, metres. */
  width: 3.8,
  depth: 2.6,
  /** Top of the water sheet in world y (box centre 0.22, half-height 0.02). */
  surfaceY: 0.24,
  /**
   * Deepest point of the authored bed, below the surface, in metres. A dished
   * domestic pool: deepest at the centre, shelving to the coping. There is no
   * shallow-end/deep-end slope because the material only ever sees |local|
   * (see `poolLocal` below), and a dish is the honest shape that survives that.
   */
  maxDepthM: 1.35,
  /** Width of the shelving band at the wall, metres. */
  shelfM: 0.55,
  /**
   * Per-channel extinction coefficient, 1/m. Red is removed fastest, green
   * slowest - the ordering every published water-type table gives, and the
   * reason deep clean water goes cyan-green rather than simply dark. These are
   * the CLEAR end of the range: a chlorinated domestic pool, not a pond.
   */
  extinction: Object.freeze([0.92, 0.16, 0.11] as const),
  /**
   * Turbidity / silt scatter, 0..1. A kept pool is near zero; a green pond
   * would raise this and nothing else. This is the "two knobs" the skill asks
   * for - extinction plus turbidity - and it is the ONLY difference between
   * this body and a murky one.
   */
  turbidity: 0.06,
  /** Refractive index ratio air->water. Drives Fresnel in both directions. */
  iorRatio: 1.33,
} as const);

/** Peak surface slope of the swept ripple field, dimensionless (dy/dx). */
export const POOL_RIPPLE_SLOPE = 0.085;

// ---------------------------------------------------------------------------
// CPU mirror of the bed profile
// ---------------------------------------------------------------------------

/**
 * Water depth under a world point, in metres, from the authored dished bed.
 * Zero outside the sheet.
 *
 * This exists as a CPU function as well as a TSL graph on purpose: the skill's
 * wave contract says one field, two evaluators. Nothing gameplay-side consumes
 * it today (the pool is not swimmable), but the depth the shader integrates and
 * the depth a future submersion query would ask for must be the same function,
 * and the test asserts the two agree at sampled points.
 */
export function nuketown2PoolDepthAt(x: number, z: number): number {
  const halfW = NUKETOWN2_POOL.width / 2;
  const halfD = NUKETOWN2_POOL.depth / 2;
  const cx = nuketown2HandedX(NUKETOWN2_POOL.authoredX);
  // Componentwise distance to the NEARER of the two 180-degree partners.
  const lx = Math.min(Math.abs(x - cx), Math.abs(x + cx));
  const lz = Math.min(Math.abs(z - NUKETOWN2_POOL.z), Math.abs(z + NUKETOWN2_POOL.z));
  if (lx > halfW || lz > halfD) return 0;
  // Distance in from the nearest wall, normalised over the shelf band.
  const inset = Math.min(halfW - lx, halfD - lz);
  const t = Math.min(1, Math.max(0, inset / NUKETOWN2_POOL.shelfM));
  // smoothstep, so the bed meets the wall tangentially rather than as a step.
  const shelf = t * t * (3 - 2 * t);
  return NUKETOWN2_POOL.maxDepthM * shelf;
}

// ---------------------------------------------------------------------------
// The material
// ---------------------------------------------------------------------------

function webgl2CompatRoute(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement?.dataset.renderBackend === 'webgl2';
}

/**
 * The pool surface material.
 *
 * ONE graph, no per-profile variant, no per-arena branch: the skill's compile
 * fence says prefer uniforms and `select()` over new graph shapes, because a
 * variant is a whole pipeline compiled the first time it is seen and this map
 * must create no pipeline in combat.
 */
export function createNuketown2PoolWaterMaterial(): THREE.Material {
  if (webgl2CompatRoute()) {
    // Compat route keeps a plain standard material, the same gate the lawn and
    // vegetation apply. The WebGL2 leg is compatibility coverage, not the
    // required HITL route.
    const flat = new THREE.MeshStandardMaterial({
      color: 0x0a6f7f, roughness: 0.14, metalness: 0.02, transparent: true, opacity: 0.78,
    });
    flat.name = 'nuketown2-pool-water-material';
    return flat;
  }

  const mat = new MeshStandardNodeMaterial({
    roughness: 0.09,
    metalness: 0.02,
    transparent: true,
  });
  // Name kept EXACTLY as it was: `arena-proxy-registration.ts` matches the mesh
  // name `nuketown2-yard-pool-water`, and the material name is what the review
  // captures and the material-family gates read.
  mat.name = 'nuketown2-pool-water-material';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  const cx = nuketown2HandedX(NUKETOWN2_POOL.authoredX);
  const halfW = float(NUKETOWN2_POOL.width / 2);
  const halfD = float(NUKETOWN2_POOL.depth / 2);

  // ---- pool-local coordinates -------------------------------------------
  // ONE material serves both 180-degree partners, so the graph works in the
  // componentwise distance to the NEARER pool centre. The two pools are 59 m
  // apart in z, so the `min` never blends them.
  const lx = min(abs(p.x.sub(float(cx))), abs(p.x.add(float(cx))));
  const lz = min(abs(p.z.sub(float(NUKETOWN2_POOL.z))), abs(p.z.add(float(NUKETOWN2_POOL.z))));
  const inset = min(halfW.sub(lx), halfD.sub(lz)).clamp(0, 10);
  const shelfT = inset.div(float(NUKETOWN2_POOL.shelfM)).clamp(0, 1);
  // Same smoothstep the CPU mirror uses, so the two evaluators agree.
  const depthM = smoothstep(0, 1, shelfT).mul(float(NUKETOWN2_POOL.maxDepthM));

  // ---- the swept surface: a normal field, not a displacement -------------
  // Two travelling bands at different wavelengths and headings. Analytic
  // derivatives of the SAME height field, so the shading normal and the ripple
  // you can see are one surface rather than two guesses.
  const t = time;
  const k1 = 5.9;
  const k2 = 9.3;
  const phase1 = p.x.mul(k1 * 0.86).add(p.z.mul(k1 * 0.51)).add(t.mul(1.35));
  const phase2 = p.x.mul(k2 * -0.42).add(p.z.mul(k2 * 0.91)).add(t.mul(0.92));
  const a1 = POOL_RIPPLE_SLOPE * 0.62;
  const a2 = POOL_RIPPLE_SLOPE * 0.38;
  // d(height)/dx and d(height)/dz of `a1*sin(phase1) + a2*sin(phase2)`.
  const slopeX = TSL.cos(phase1).mul(a1 * 0.86).add(TSL.cos(phase2).mul(a2 * -0.42));
  const slopeZ = TSL.cos(phase1).mul(a1 * 0.51).add(TSL.cos(phase2).mul(a2 * 0.91));
  // Damp the ripple into the wall: real water goes still against a coping.
  const rippleMask = smoothstep(0, 0.35, inset);
  const normalLocal = vec3(slopeX.mul(rippleMask).negate(), 1, slopeZ.mul(rippleMask).negate()).normalize();
  mat.normalNode = transformNormalToView(normalLocal);

  // ---- view angle, and therefore the optical path ------------------------
  // `positionViewDirection` is the unit surface->camera direction in view
  // space, and `transformNormalToView(normalLocal)` is the shading normal in
  // the same space, so their dot is cos(theta) between the view ray and the
  // surface normal. That is exactly the factor an optical path length through
  // a slab is divided by.
  const cosTheta = positionViewDirection.dot(transformNormalToView(normalLocal)).abs().clamp(0.06, 1);
  // Light goes DOWN through the water and comes back UP, so the path is the
  // downwelling leg (vertical) plus the upwelling leg (along the view ray).
  const pathLength = depthM.add(depthM.div(cosTheta));

  // ---- crest / turbulence estimator (drives foam AND backscatter) ---------
  // For a non-choppy vertical field the honest breaking proxy is the rate of
  // change of slope along the wave direction; here that is the slope magnitude
  // itself, which for a domestic pool stays tiny - and that is the point.
  const slopeMag = vec2(slopeX, slopeZ).length().mul(rippleMask);
  const turbulence = smoothstep(POOL_RIPPLE_SLOPE * 0.72, POOL_RIPPLE_SLOPE * 1.15, slopeMag);

  // ---- 2. BACKSCATTER, injected BEFORE absorption ------------------------
  // Bubbles scatter almost spectrally flat; the water's own absorption then
  // filters what comes back, and because absorption is weakest in the green
  // the result emerges brighter AND green-shifted. That hue shift can only
  // happen if the scattering is added to the radiance that then passes through
  // exp(-sigma * path). Added after absorption it would be grey milk.
  const skyIn = vec3(0.62, 0.74, 0.82);
  const bedIn = vec3(0.72, 0.78, 0.80); // pale tiled pool bed, lit from above
  // Radiance entering the integral: what the bed returns, plus the flat
  // broadband scattering from entrained air. Turbidity is the always-present
  // silt/algae term; turbulence is the transient bubble cloud.
  const scatter = float(NUKETOWN2_POOL.turbidity).add(turbulence.mul(0.55));
  const incoming = mix(bedIn, skyIn, float(0.25)).add(vec3(1, 1, 1).mul(scatter.mul(0.45)));

  // ---- 1. BEER-LAMBERT: transmitted = incoming * exp(-sigma * path) -------
  const [sr, sg, sb] = NUKETOWN2_POOL.extinction;
  const transmittance = vec3(
    pathLength.mul(-sr).exp(),
    pathLength.mul(-sg).exp(),
    pathLength.mul(-sb).exp(),
  );
  // What the medium itself contributes where the bed light has been absorbed
  // away: the in-scattered body colour, which is what "deep water" actually is.
  const bodyColour = vec3(0.03, 0.34, 0.40).add(vec3(1, 1, 1).mul(scatter.mul(0.22)));
  let colour = incoming.mul(transmittance).add(bodyColour.mul(vec3(1, 1, 1).sub(transmittance)));

  // ---- 3. FOAM: depth-driven edge layer, plus a lagging crest layer -------
  // Edge foam is the shoreline layer: it lives where the water is shallow, not
  // where a wave happens to be, so it stays put against the coping.
  const edgeFoam = float(1).sub(smoothstep(0.0, 0.22, inset)).mul(0.85);
  // Crest foam trails the ripple: sampling the crest estimator at t - lag and
  // taking the max with the present value makes foam decay behind a crest
  // instead of blinking in place. It is a lag, not a persistent field - see
  // the OPEN note in this file's header.
  const lagPhase1 = p.x.mul(k1 * 0.86).add(p.z.mul(k1 * 0.51)).add(t.sub(0.35).mul(1.35));
  const laggedSlope = abs(TSL.cos(lagPhase1).mul(a1)).mul(rippleMask);
  const crestFoam = max(
    turbulence,
    smoothstep(POOL_RIPPLE_SLOPE * 0.72, POOL_RIPPLE_SLOPE * 1.15, laggedSlope).mul(0.55),
  ).mul(0.35);
  const foam = edgeFoam.add(crestFoam).clamp(0, 0.92);
  // Foam is capped well under a character key value: the water skill's
  // readability rule is that foam and sparkle sit exactly where a swimming
  // head is, and must never out-shout a player.
  colour = mix(colour, vec3(0.86, 0.90, 0.90), foam.mul(0.72));
  mat.colorNode = colour;

  // ---- 4. LOCAL FRESNEL TRANSPARENCY -------------------------------------
  // Schlick at iorRatio 1.33: R0 = ((1 - n) / (1 + n))^2 = 0.0201. Looking
  // straight down, reflectance is ~2 % and the water is nearly clear; at a
  // grazing angle it goes to 1 and the surface becomes a mirror. Opacity is
  // then that reflectance, raised by how much water there is to look through
  // and by the foam sitting on top of it.
  const n = NUKETOWN2_POOL.iorRatio;
  const r0 = ((1 - n) / (1 + n)) ** 2;
  const fresnel = float(r0).add(float(1 - r0).mul(float(1).sub(cosTheta).pow(5)));
  // Optical thickness: 1 - exp(-mean(sigma) * path). Deep water is opaque
  // because it absorbs, not because a constant said so.
  const meanSigma = (sr + sg + sb) / 3;
  const thickness = float(1).sub(pathLength.mul(-meanSigma).exp());
  mat.opacityNode = fresnel
    .add(thickness.mul(0.82))
    .add(foam.mul(0.5))
    .clamp(0.14, 0.97);

  // Slope-modulated roughness: a flat sheet is a mirror, a rippled one is not.
  mat.roughnessNode = float(0.045).add(slopeMag.div(POOL_RIPPLE_SLOPE).clamp(0, 1).mul(0.14));

  return mat;
}
