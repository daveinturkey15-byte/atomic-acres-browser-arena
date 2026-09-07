/**
 * HF-418 / Lane AL — BAKED INDIRECT LIGHT: an offline path-traced irradiance
 * probe volume, and the runtime sampling of it.
 *
 * WHY THIS EXISTS, IN THE OWNER'S WORDS. "when i say ray tracing i mean the
 * beautiful lighting etc, get it all working in a nice way that wont murder
 * FPS". The single largest gap between this build and that sentence is that
 * nothing in it computes an indirect bounce below the MAX profile: `SSGI` is
 * off on PERFORMANCE and BALANCED — QUALITY and MAX now carry the ray-traced
 * reflection stage, and MAX also carries SSGI — and `indirectLighting`
 * is a scalar on a hemisphere approximation, not a bounce. A wall facing away
 * from the sun is lit by a constant, so it reads flat, and the shaded side of
 * every interior reads as the same grey whatever colour the room is.
 *
 * The RTX skill's route 4 is the answer, and it says so twice: baked irradiance
 * is both the honest default AND "route 3's indirect-lighting supply" — the
 * classic recursive tracer computes no bounce at all, and the documented
 * failure mode is raising a flat ambient constant until the whole scene is
 * milk. This module is the thing that is supposed to be raised instead.
 *
 * WHAT IT COSTS PER FRAME. Nothing that scales with the scene: THREE volume
 * fetches (one 3D texture per colour channel, see `baked-indirect-node.ts`) and
 * eleven multiply-adds per shaded pixel, on top of the scene colour/normal/
 * viewZ reads the composite already performs. The path tracing happens
 * once, offline (or once behind the loading screen), and the result is a small
 * 3D grid of spherical-harmonic coefficients.
 *
 * WHAT IT IS TRACED AGAINST. The SAME analytic proxy set the ray-traced
 * reflection stage in QUALITY and MAX traces against (`raytracing/analytic-proxy-scene.ts`): a capped set of yaw-
 * oriented boxes, spheres and a ground plane fitted to the arena's largest
 * occluders. Re-using it is deliberate and has three consequences worth stating
 * before someone discovers them:
 *   - The bake sees the arena's MASSING, not its detail. A probe volume is a
 *     low-frequency signal by construction (metres between samples), so detail
 *     the proxy drops could not have been represented anyway.
 *   - Coverage is inherited. An arena whose proxy set is empty bakes a volume
 *     that is pure sky, which is CORRECT and looks like nothing. That is the
 *     RTX skill's "correct image of nothing" failure, and `bakeIrradianceVolume`
 *     reports `occluderShapes` so a gate can tell the two apart.
 *   - Nothing dynamic is in it. Players, bots and vehicles are not in the proxy
 *     set, so they cannot bounce light and cannot be revealed by bounced light.
 *     That is the competitive-parity property, and it is structural rather than
 *     tuned — see `bakedIndirectRevealsNoDynamicActors` in the tests.
 *
 * BAND CHOICE. L1 (4 coefficients per channel, 12 floats per probe) rather than
 * L2 (9 / 27). At the 2-3 m probe spacing the tiers use, the limit on detail is
 * the SPACING, not the band count: L2 buys angular sharpness that trilinear
 * interpolation between probes three metres apart immediately destroys, and it
 * would take the volume from 27 KB to 61 KB for a 12x8x6 grid. L1 also has the
 * property that matters most here — it cannot ring into negative irradiance the
 * way an unclamped L2 reconstruction routinely does over a bright horizon.
 *
 * COMBAT SAFETY. The composite is ADDITIVE and clamped, exactly like every
 * other lighting effect in this build (see `screen-space-post-profile.ts`):
 * a baked probe may brighten a pixel and can never darken one, so nothing that
 * is visible today can be hidden by turning this on. The clamp is
 * `BAKED_INDIRECT_MAXIMUM_GAIN`, applied by the resolver rather than trusted.
 */

import {
  type ProxyScene,
  type ProxyShape,
  type Vec3,
  SURFACE_EPSILON_M,
  add,
  dot,
  intersectScene,
  normalize,
  occluded,
  scale,
  sub,
  vec3,
} from '../raytracing/analytic-proxy-scene';

// ---------------------------------------------------------------------------
// Tiers and the safety envelope
// ---------------------------------------------------------------------------

/** Shares `LightingTier`'s shape: off / low / high. No "ultra" without a budget. */
export type BakedIndirectTier = 'off' | 'low' | 'high';

/**
 * Largest multiplier any tier may apply to the reconstructed irradiance before
 * it is composited. The composite is `albedoProxy * irradiance * gain` — see
 * `baked-indirect-node.ts` for what the albedo proxy is and why the shaded
 * colour is not used directly — so this bounds the STRENGTH of the fill.
 *
 * 0.55 was chosen the way GODRAY_MAXIMUM_ADDITIVE_GAIN was: it is the value at
 * which a fully sky-lit interior wall reads as lit rather than as fogged, and
 * above which a bright bounce starts to wash a silhouette standing against it.
 */
export const BAKED_INDIRECT_MAXIMUM_GAIN = 0.55;

/**
 * Hard per-channel ceiling on the linear-HDR value this layer may ADD to any
 * one pixel, applied last in the node and clamped rather than trusted. The gain
 * above bounds the multiplier; this bounds the result, so neither an unusually
 * bright bake (a white arena at noon) nor a future gain edit can put a wash
 * across a sightline. Below the godrays' 0.22 because a bounce covers whole
 * surfaces rather than a shaft's narrow volume.
 */
export const BAKED_INDIRECT_MAXIMUM_ADDITIVE = 0.18;

/**
 * Hard cap on probes in one volume. Every probe is 12 floats in three 3D
 * textures; 8192 probes is 384 KB of GPU memory and about 12 seconds of CPU
 * bake at the HIGH tier. The cap exists so an arena with a large bounding box
 * cannot silently turn a 200 ms bake into a 40 s one.
 */
export const BAKED_INDIRECT_MAXIMUM_PROBES = 8192;

/** Coefficients per channel (L1), and floats per probe (3 channels x 4). */
export const SH_L1_COEFFICIENTS = 4;
export const FLOATS_PER_PROBE = SH_L1_COEFFICIENTS * 3;

export type BakedIndirectTuning = Readonly<{
  tier: BakedIndirectTier;
  enabled: boolean;
  /** Metres between probes on each axis. */
  probeSpacingM: number;
  /** Rays cast per probe over the full sphere. */
  raysPerProbe: number;
  /** Indirect bounces followed after the first hit. 0 = direct light only. */
  bounces: number;
  /**
   * Multiplier on the reconstructed irradiance where it is composited.
   * Clamped to BAKED_INDIRECT_MAXIMUM_GAIN by the resolver.
   */
  composite: number;
}>;

const BAKED_INDIRECT_OFF: BakedIndirectTuning = Object.freeze({
  tier: 'off', enabled: false, probeSpacingM: 0, raysPerProbe: 0, bounces: 0, composite: 0,
});

/**
 * LOW is the BALANCED-profile tier: a 3 m grid, one bounce, 48 rays. It is
 * "on lightly" in the owner's phrase — the room reads as coloured rather than
 * grey, without the second bounce that mostly refines a signal trilinear
 * interpolation is about to blur anyway.
 *
 * HIGH is QUALITY and above: 2 m, two bounces, 128 rays. Both bake offline, so
 * the per-frame cost of the two tiers is IDENTICAL — the difference is bake
 * time and texture size, which is why this control is the cheapest thing in the
 * lighting category and the profile defaults reflect that.
 */
export function resolveBakedIndirectTuning(tier: BakedIndirectTier): BakedIndirectTuning {
  if (tier === 'off') return BAKED_INDIRECT_OFF;
  const high = tier === 'high';
  return Object.freeze({
    tier,
    enabled: true,
    probeSpacingM: high ? 2 : 3,
    raysPerProbe: high ? 128 : 48,
    bounces: high ? 2 : 1,
    composite: Math.min(high ? 0.5 : 0.38, BAKED_INDIRECT_MAXIMUM_GAIN),
  });
}

// ---------------------------------------------------------------------------
// The volume
// ---------------------------------------------------------------------------

export type IrradianceProbeVolume = Readonly<{
  /** Arena this was baked for. */
  arenaId: string;
  /** Digest of the proxy set + lighting + grid this was baked from. The cache key. */
  digest: string;
  /** World-space position of probe (0,0,0). */
  originM: Vec3;
  /** Metres between probes, per axis. Non-uniform: arenas are wide and low. */
  spacingM: Vec3;
  /** Probe counts on x, y, z. */
  dimensions: readonly [number, number, number];
  /**
   * SH-L1 coefficients, probe-major, then channel-major, then band:
   * index = ((z * ny + y) * nx + x) * 12 + channel * 4 + band.
   */
  coefficients: Float32Array;
  /** How the bake was parameterised, for provenance. */
  bake: Readonly<{
    raysPerProbe: number;
    bounces: number;
    /** Proxy shapes the rays could hit. Zero means a sky-only bake. */
    occluderShapes: number;
    /** Probes that landed inside solid geometry and were filled from neighbours. */
    filledProbes: number;
    /** Wall-clock milliseconds the bake took. Provenance, never an assertion. */
    elapsedMs: number;
  }>;
}>;

/**
 * The lighting the bake integrates. Deliberately a plain struct rather than a
 * read of the live arena: Lane AB's time-of-day model produces these values,
 * and the bake has to be reproducible from them alone or the digest cache is a
 * lie. `sunColour` is the irradiance on a surface facing the sun; the sky terms
 * are radiances.
 */
export type BakeLighting = Readonly<{
  /** Unit vector pointing FROM the world TOWARDS the sun. */
  sunDirection: Vec3;
  sunColour: Vec3;
  skyZenithColour: Vec3;
  skyHorizonColour: Vec3;
  /** Radiance seen looking down, i.e. the ground's own bounce into the sky term. */
  skyGroundColour: Vec3;
}>;

export type BakeOptions = Readonly<{
  arenaId: string;
  tuning: BakedIndirectTuning;
  /** Metres of padding added around the proxy bounds before the grid is laid out. */
  paddingM?: number;
  /** Overrides the probe cap. Tests only; production uses the constant. */
  maximumProbes?: number;
  /**
   * Forces the grid to exactly these probe counts, deriving the spacing from
   * the arena's size instead of the other way round.
   *
   * The RUNTIME path always passes this. Its 3D textures are allocated once at
   * `BAKED_INDIRECT_RUNTIME_GRID` and re-uploaded in place on every arena
   * change, because swapping a bound texture for one of different dimensions
   * means rebuilding the node, which means rebuilding the pipeline, inside the
   * arena-transition window - a pipeline rebuild this feature has no reason to
   * cause. The offline CLI leaves it unset and gets the spacing the tier asks
   * for.
   */
  fixedDimensions?: readonly [number, number, number];
  /**
   * The clock the per-frame deadline is measured against. Tests only;
   * production leaves it unset and gets `nowMs`.
   *
   * PASS 89. `step()`'s contract - "stop at the first ray past the deadline" -
   * is a property of the CODE, but the only test of it was a wall-clock
   * measurement, which on a shared workstation measures the MACHINE: it read
   * 3.0-3.2 ms in isolation and 4.8-9.6 ms inside the full 578-file suite, on
   * the same commit. Injecting the clock makes the property testable exactly,
   * at both tiers, on the real proxy, with no timing slop at all - a strictly
   * tighter bound than any wall-clock percentile, and one that cannot be
   * evaded by a machine being quiet. The real-clock choice is pinned
   * separately, at the source, by "reads its deadline from a sub-millisecond
   * clock".
   */
  now?: () => number;
}>;

/**
 * The probe grid the RUNTIME allocates, once, for every arena. 24 x 12 x 24 is
 * 6912 probes: 331 KB across the three RGBA float 3D textures, and on the
 * largest authored arena (~120 m across) it lands the probes about 5 m apart
 * horizontally and 2 m vertically, which is the right anisotropy for arenas
 * that are wide and low rather than cubic.
 */
export const BAKED_INDIRECT_RUNTIME_GRID: readonly [number, number, number] = Object.freeze([24, 12, 24]) as unknown as readonly [number, number, number];

// ---------------------------------------------------------------------------
// Spherical harmonics (L1), in the one convention this file uses everywhere
// ---------------------------------------------------------------------------

/** Y00, and the three L1 basis coefficients' shared factor. */
export const SH_Y00 = 0.282095;
export const SH_Y1 = 0.488603;
/** Lambertian convolution constants (Ramamoorthi & Hanrahan). */
export const SH_A0 = 3.141593;
export const SH_A1 = 2.094395;

/**
 * Reconstructs OUTGOING DIFFUSE RADIANCE (irradiance / pi) for a surface whose
 * normal is `n`, from one probe's four coefficients on one channel.
 *
 * The division by pi is folded in so that a uniform environment of radiance L
 * reconstructs to exactly L on every normal. That is the white-furnace identity
 * the tests assert, and it is the property that makes the composite in
 * `baked-indirect-node.ts` a plain multiply against the surface colour.
 */
export function evaluateShL1(
  coefficients: ArrayLike<number>,
  offset: number,
  normal: Vec3,
): number {
  const value = SH_A0 * SH_Y00 * coefficients[offset]
    + SH_A1 * SH_Y1 * (
      normal[1] * coefficients[offset + 1]
      + normal[2] * coefficients[offset + 2]
      + normal[0] * coefficients[offset + 3]
    );
  return Math.max(0, value / Math.PI);
}

// ---------------------------------------------------------------------------
// Deterministic sampling
// ---------------------------------------------------------------------------

/**
 * xorshift32. The bake MUST be reproducible from its inputs alone: the digest
 * cache says "this volume is what these inputs bake to", and a bake seeded from
 * Math.random makes that sentence false while every test still passes.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * Fibonacci-sphere direction `index` of `count`, rotated by `offset` turns.
 * Low-discrepancy rather than random: at 48 rays a uniform random sphere leaves
 * visible clumping that reads as probe-to-probe flicker along a wall, and the
 * fix costs nothing.
 */
export function fibonacciSphereDirection(index: number, count: number, offset: number): Vec3 {
  const y = 1 - ((index + 0.5) / count) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (1 + Math.sqrt(5)) * index + offset * Math.PI * 2;
  return vec3(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
}

/** Cosine-weighted direction about `normal`, for the secondary bounce. */
function cosineHemisphereDirection(normal: Vec3, u1: number, u2: number): Vec3 {
  const r = Math.sqrt(u1);
  const phi = 2 * Math.PI * u2;
  const x = r * Math.cos(phi);
  const z = r * Math.sin(phi);
  const y = Math.sqrt(Math.max(0, 1 - u1));
  // Build an orthonormal frame around the normal without a branch on its axis.
  const sign = normal[1] >= 0 ? 1 : -1;
  const a = -1 / (sign + normal[1]);
  const b = normal[0] * normal[2] * a;
  const tangent = vec3(1 + sign * normal[0] * normal[0] * a, -sign * normal[0], sign * b);
  const bitangent = vec3(b, -normal[2], sign + normal[2] * normal[2] * a);
  return normalize(add(add(scale(tangent, x), scale(bitangent, z)), scale(normal, y)));
}

// ---------------------------------------------------------------------------
// The bake
// ---------------------------------------------------------------------------

function skyRadiance(direction: Vec3, lighting: BakeLighting): Vec3 {
  const up = direction[1];
  if (up < 0) {
    const t = Math.min(1, -up);
    return vec3(
      lighting.skyHorizonColour[0] * (1 - t) + lighting.skyGroundColour[0] * t,
      lighting.skyHorizonColour[1] * (1 - t) + lighting.skyGroundColour[1] * t,
      lighting.skyHorizonColour[2] * (1 - t) + lighting.skyGroundColour[2] * t,
    );
  }
  const t = Math.min(1, up);
  return vec3(
    lighting.skyHorizonColour[0] * (1 - t) + lighting.skyZenithColour[0] * t,
    lighting.skyHorizonColour[1] * (1 - t) + lighting.skyZenithColour[1] * t,
    lighting.skyHorizonColour[2] * (1 - t) + lighting.skyZenithColour[2] * t,
  );
}

/**
 * Irradiance arriving at an unoccluded surface with normal `n` from the sky
 * alone. Used as the TERMINAL estimate at the last bounce, where casting more
 * rays would cost more than the remaining energy is worth. It over-estimates
 * inside a closed room (it does not know the room is closed), which is why the
 * LOW tier's single bounce is a real tier rather than a degenerate one: the
 * first bounce is where the occlusion actually gets resolved.
 */
function terminalSkyIrradiance(normal: Vec3, lighting: BakeLighting): Vec3 {
  const above = skyRadiance(normal, lighting);
  return vec3(above[0] * Math.PI * 0.5, above[1] * Math.PI * 0.5, above[2] * Math.PI * 0.5);
}

function shadeHit(
  scene: ProxyScene,
  shape: ProxyShape,
  point: Vec3,
  normal: Vec3,
  lighting: BakeLighting,
  bouncesLeft: number,
  random: () => number,
): Vec3 {
  const origin = add(point, scale(normal, SURFACE_EPSILON_M * 4));
  const ndotl = dot(normal, lighting.sunDirection);
  let irradiance = vec3(0, 0, 0);
  if (ndotl > 0 && !occluded(origin, lighting.sunDirection, 1e4, scene)) {
    irradiance = vec3(
      lighting.sunColour[0] * ndotl,
      lighting.sunColour[1] * ndotl,
      lighting.sunColour[2] * ndotl,
    );
  }
  if (bouncesLeft <= 0) {
    const sky = terminalSkyIrradiance(normal, lighting);
    irradiance = add(irradiance, sky);
  } else {
    const direction = cosineHemisphereDirection(normal, random(), random());
    const hit = intersectScene(origin, direction, scene);
    // A cosine-weighted sample estimates E = pi * L with a single ray.
    const incoming = hit.t === Number.POSITIVE_INFINITY
      ? skyRadiance(direction, lighting)
      : shadeHit(scene, scene.shapes[hit.shapeIndex], hit.point, hit.normal, lighting, bouncesLeft - 1, random);
    irradiance = add(irradiance, scale(incoming, Math.PI));
  }
  // Outgoing radiance from a Lambertian surface: albedo * E / pi.
  return vec3(
    (shape.albedo[0] * irradiance[0]) / Math.PI,
    (shape.albedo[1] * irradiance[1]) / Math.PI,
    (shape.albedo[2] * irradiance[2]) / Math.PI,
  );
}

/** True when `point` is inside a solid proxy, i.e. the probe is buried in a wall. */
export function pointInsideShape(point: Vec3, shape: ProxyShape): boolean {
  if (shape.kind === 'plane') return false;
  const relative = sub(point, shape.centre);
  if (shape.kind === 'sphere') {
    const r = shape.halfExtents[0];
    return dot(relative, relative) < r * r;
  }
  const c = Math.cos(shape.yaw);
  const s = Math.sin(shape.yaw);
  const local = vec3(relative[0] * c + relative[2] * s, relative[1], -relative[0] * s + relative[2] * c);
  return Math.abs(local[0]) < shape.halfExtents[0]
    && Math.abs(local[1]) < shape.halfExtents[1]
    && Math.abs(local[2]) < shape.halfExtents[2];
}

/**
 * FNV-1a over the inputs that decide what the bake produces. Quantised to
 * millimetres and thousandths so a floating-point re-derivation of the same
 * geometry does not invalidate the cache, and INCLUDING the lighting and the
 * grid parameters, because a volume baked at noon is not a volume baked at
 * dusk and a cache keyed on geometry alone would happily serve one for the
 * other.
 */
export function computeBakeDigest(
  scene: ProxyScene,
  lighting: BakeLighting,
  tuning: BakedIndirectTuning,
): string {
  const parts: string[] = [];
  const q = (value: number, scaleBy: number): string => String(Math.round(value * scaleBy));
  for (const shape of scene.shapes) {
    parts.push([
      shape.kind,
      q(shape.centre[0], 1000), q(shape.centre[1], 1000), q(shape.centre[2], 1000),
      q(shape.halfExtents[0], 1000), q(shape.halfExtents[1], 1000), q(shape.halfExtents[2], 1000),
      q(shape.yaw, 1000),
      q(shape.albedo[0], 1000), q(shape.albedo[1], 1000), q(shape.albedo[2], 1000),
    ].join(','));
  }
  parts.push('|');
  for (const value of [
    ...lighting.sunDirection, ...lighting.sunColour,
    ...lighting.skyZenithColour, ...lighting.skyHorizonColour, ...lighting.skyGroundColour,
  ]) parts.push(q(value, 1000));
  parts.push('|', tuning.tier, q(tuning.probeSpacingM, 1000), String(tuning.raysPerProbe), String(tuning.bounces));
  const text = parts.join(';');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Lays out the probe grid over the proxy bounds, respecting the probe cap. */
export function planProbeGrid(
  scene: ProxyScene,
  spacingM: number,
  paddingM: number,
  maximumProbes: number,
  fixedDimensions?: readonly [number, number, number],
): Readonly<{ originM: Vec3; spacingM: Vec3; dimensions: readonly [number, number, number] }> {
  const min = vec3(
    scene.boundsMin[0] - paddingM,
    scene.boundsMin[1] - paddingM,
    scene.boundsMin[2] - paddingM,
  );
  const size = vec3(
    Math.max(0, scene.boundsMax[0] - scene.boundsMin[0]) + paddingM * 2,
    Math.max(0, scene.boundsMax[1] - scene.boundsMin[1]) + paddingM * 2,
    Math.max(0, scene.boundsMax[2] - scene.boundsMin[2]) + paddingM * 2,
  );
  if (fixedDimensions) {
    // Fixed grid: the arena decides the spacing, per axis, so a wide low arena
    // does not spend two thirds of its probes on empty sky above the roofline.
    const dims = fixedDimensions;
    return Object.freeze({
      originM: min,
      spacingM: vec3(
        Math.max(1e-3, size[0] / Math.max(1, dims[0] - 1)),
        Math.max(1e-3, size[1] / Math.max(1, dims[1] - 1)),
        Math.max(1e-3, size[2] / Math.max(1, dims[2] - 1)),
      ),
      dimensions: dims,
    });
  }
  let spacing = spacingM;
  let dims: [number, number, number] = [2, 2, 2];
  // Grow the spacing until the grid fits the cap. Coarsening is the right
  // failure here: a volume that silently truncated its bounds would leave part
  // of the arena sampling a clamped edge probe from the far side of the map.
  for (let attempt = 0; attempt < 32; attempt += 1) {
    dims = [
      Math.max(2, Math.min(64, Math.ceil(size[0] / spacing) + 1)),
      Math.max(2, Math.min(64, Math.ceil(size[1] / spacing) + 1)),
      Math.max(2, Math.min(64, Math.ceil(size[2] / spacing) + 1)),
    ];
    if (dims[0] * dims[1] * dims[2] <= maximumProbes) break;
    spacing *= 1.25;
  }
  return Object.freeze({
    originM: min,
    spacingM: vec3(spacing, spacing, spacing),
    dimensions: Object.freeze(dims) as unknown as readonly [number, number, number],
  });
}

/**
 * A bake in progress, advanced probe by probe under a wall-clock budget.
 *
 * WHY THIS IS A STEPPER AND NOT A FUNCTION. At runtime the bake runs on the
 * main thread of a game whose loading times are already a live owner
 * complaint (HF-417). A 3 m grid over a 60 x 20 x 60 m arena is ~3500 probes;
 * at 48 rays and one bounce against ~40 analytic shapes that is several
 * seconds of straight-line JavaScript, i.e. a hard freeze in exactly the
 * window a player is watching a loading screen tick.
 *
 * So the runtime path takes a few milliseconds per frame instead. The volume
 * is USABLE from the first step — every probe not yet traced still holds its
 * sky-only initialisation — so the picture converges rather than popping, and
 * the offline CLI simply calls `step(Infinity)` in a loop and gets the same
 * bytes. `bakeIrradianceVolume` is that loop, kept as the reference API.
 */
export type IrradianceBakeSession = Readonly<{
  /** 0..1, probes traced over probes total. */
  progress(): number;
  done(): boolean;
  /**
   * Traces until `budgetMs` of wall clock has elapsed. THE UNIT OF WORK IS A
   * RAY, NOT A PROBE, and that is the whole point: one probe at the HIGH tier
   * is 128 rays at two bounces against every occluder in the proxy, which on a
   * real 24-shape arena costs over ten milliseconds on this machine. A stepper
   * that can only stop between probes therefore cannot honour a 3 ms budget
   * however often it looks at the clock - the first version of this checked
   * every 16 probes and overshot by up to 198 ms, which is the freeze class
   * this project has spent three passes removing. A partially traced probe is
   * resumed exactly where it stopped, with the same ray offset, so a bake split
   * across a thousand steps is byte-identical to a one-shot one.
   *
   * `step(Infinity)` skips the clock entirely rather than paying a clock read
   * per ray; that is the offline CLI's path.
   *
   * Returns true when the bake is complete.
   */
  step(budgetMs: number): boolean;
  /**
   * The volume as it stands. Safe to read and upload at any point; the buried-
   * probe fill is applied when the last probe lands, so a partially traced
   * volume is dimmer near walls rather than wrong.
   */
  volume(): IrradianceProbeVolume;
}>;

/**
 * A high-resolution clock, because `Date.now()` cannot express this budget.
 *
 * MEASURED 2026-09-03: on Windows, Node's `Date.now()` advances in steps of up
 * to ~15.6 ms unless something on the machine has raised the system timer
 * resolution. A 3 ms deadline tested against that clock is not a 3 ms deadline
 * - the first per-ray version of this stepper still spent 31 ms in a single
 * step because the clock had not ticked yet. `performance.now()` is
 * sub-millisecond in both Node and every browser this ships to.
 */
const nowMs = (): number => {
  const clock = (globalThis as { performance?: { now(): number } }).performance;
  return clock ? clock.now() : Date.now();
};

export function beginIrradianceBake(
  scene: ProxyScene,
  lighting: BakeLighting,
  options: BakeOptions,
): IrradianceBakeSession {
  const clock = options.now ?? nowMs;
  const startedAt = clock();
  const { tuning } = options;
  if (!tuning.enabled) throw new Error('bakeIrradianceVolume: the OFF tier bakes nothing.');
  const digest = computeBakeDigest(scene, lighting, tuning);
  const grid = planProbeGrid(
    scene,
    tuning.probeSpacingM,
    options.paddingM ?? tuning.probeSpacingM,
    options.maximumProbes ?? BAKED_INDIRECT_MAXIMUM_PROBES,
    options.fixedDimensions,
  );
  const [nx, ny, nz] = grid.dimensions;
  const probeCount = nx * ny * nz;
  const coefficients = new Float32Array(probeCount * FLOATS_PER_PROBE);
  const buried = new Uint8Array(probeCount);
  // Seed from the digest so the same inputs bake the same volume, always.
  const random = makeRandom(Number.parseInt(digest, 16));
  const rays = tuning.raysPerProbe;
  const weight = (4 * Math.PI) / rays;
  const y00 = SH_Y00 * weight;
  const y1 = SH_Y1 * weight;
  let filledProbes = 0;
  let cursor = 0;
  let elapsedMs = 0;
  let finished = false;
  // RESUMABLE PROBE STATE. The budget is enforced per ray, so a step can stop
  // halfway through a probe and the next one must pick up the same probe, at
  // the same ray, with the same jitter offset. Redrawing the offset would
  // change the ray set and a chunked bake would stop matching a one-shot one -
  // which is the property `baked-indirect.test.ts` pins.
  let probeStarted = false;
  let rayCursor = 0;
  let probeOffset = 0;
  let probeBase = 0;
  let probePosition: Vec3 = vec3(0, 0, 0);

  /**
   * Positions probe `probeIndex` and decides whether it needs rays at all.
   * Returns false for a buried probe (which is filled from its neighbours at
   * the end and consumes no randomness, exactly as before).
   */
  const beginProbe = (probeIndex: number): boolean => {
    const x = probeIndex % nx;
    const y = Math.floor(probeIndex / nx) % ny;
    const z = Math.floor(probeIndex / (nx * ny));
    const position = vec3(
      grid.originM[0] + x * grid.spacingM[0],
      grid.originM[1] + y * grid.spacingM[1],
      grid.originM[2] + z * grid.spacingM[2],
    );
    if (scene.shapes.some((shape) => pointInsideShape(position, shape))) {
      buried[probeIndex] = 1;
      filledProbes += 1;
      return false;
    }
    probePosition = position;
    probeBase = probeIndex * FLOATS_PER_PROBE;
    probeOffset = random();
    rayCursor = 0;
    return true;
  };

  const traceRay = (ray: number): void => {
    const direction = fibonacciSphereDirection(ray, rays, probeOffset);
    const hit = intersectScene(probePosition, direction, scene);
    const radiance = hit.t === Number.POSITIVE_INFINITY
      ? skyRadiance(direction, lighting)
      : shadeHit(scene, scene.shapes[hit.shapeIndex], hit.point, hit.normal, lighting, tuning.bounces - 1, random);
    for (let channel = 0; channel < 3; channel += 1) {
      const value = radiance[channel];
      const slot = probeBase + channel * SH_L1_COEFFICIENTS;
      coefficients[slot] += value * y00;
      coefficients[slot + 1] += value * y1 * direction[1];
      coefficients[slot + 2] += value * y1 * direction[2];
      coefficients[slot + 3] += value * y1 * direction[0];
    }
  };

  const finish = (): void => {
    if (finished) return;
    // Buried probes are filled from their live neighbours rather than left at
    // zero: a wall probe reading black bleeds a dark band along every surface
    // that interpolates through it, which looks exactly like the dirt-shadow
    // artefact people spend a day chasing in the material graph.
    fillBuriedProbes(coefficients, buried, nx, ny, nz);
    elapsedMs = nowMs() - startedAt;
    finished = true;
  };

  return Object.freeze({
    // Counts the partially traced probe too, so progress advances after a step
    // that stopped mid-probe. It always would have mattered; it only became
    // visible once the budget started stopping inside a probe.
    progress: (): number => (probeCount === 0
      ? 1
      : (cursor + (probeStarted && rays > 0 ? rayCursor / rays : 0)) / probeCount),
    done: (): boolean => finished,
    step(budgetMs: number): boolean {
      if (finished) return true;
      const unbounded = !Number.isFinite(budgetMs);
      const deadline = clock() + budgetMs;
      const expired = (): boolean => !unbounded && clock() >= deadline;
      while (cursor < probeCount) {
        if (!probeStarted) {
          if (!beginProbe(cursor)) {
            cursor += 1;
            if (expired()) break;
            continue;
          }
          probeStarted = true;
        }
        while (rayCursor < rays) {
          traceRay(rayCursor);
          rayCursor += 1;
          if (expired()) break;
        }
        // Out of budget mid-probe: leave `probeStarted` set so the next step
        // resumes this probe rather than restarting or skipping it.
        if (rayCursor < rays) break;
        probeStarted = false;
        cursor += 1;
        if (expired()) break;
      }
      if (cursor >= probeCount) finish();
      return finished;
    },
    volume(): IrradianceProbeVolume {
      return Object.freeze({
        arenaId: options.arenaId,
        digest,
        originM: grid.originM,
        spacingM: grid.spacingM,
        dimensions: grid.dimensions,
        coefficients,
        bake: Object.freeze({
          raysPerProbe: rays,
          bounces: tuning.bounces,
          occluderShapes: scene.shapes.length,
          filledProbes,
          elapsedMs: finished ? elapsedMs : clock() - startedAt,
        }),
      });
    },
  });
}

/** The whole bake in one call. The offline CLI and every test use this. */
export function bakeIrradianceVolume(
  scene: ProxyScene,
  lighting: BakeLighting,
  options: BakeOptions,
): IrradianceProbeVolume {
  const session = beginIrradianceBake(scene, lighting, options);
  while (!session.step(Number.POSITIVE_INFINITY)) { /* one pass; the budget never expires */ }
  return session.volume();
}

function fillBuriedProbes(
  coefficients: Float32Array,
  buried: Uint8Array,
  nx: number,
  ny: number,
  nz: number,
): void {
  const neighbours: readonly (readonly [number, number, number])[] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  for (let sweep = 0; sweep < 8; sweep += 1) {
    let changed = false;
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const index = (z * ny + y) * nx + x;
          if (buried[index] !== 1) continue;
          let live = 0;
          const accumulator = new Float64Array(FLOATS_PER_PROBE);
          for (const [dx, dy, dz] of neighbours) {
            const sx = x + dx; const sy = y + dy; const sz = z + dz;
            if (sx < 0 || sy < 0 || sz < 0 || sx >= nx || sy >= ny || sz >= nz) continue;
            const source = (sz * ny + sy) * nx + sx;
            if (buried[source] === 1) continue;
            live += 1;
            for (let slot = 0; slot < FLOATS_PER_PROBE; slot += 1) {
              accumulator[slot] += coefficients[source * FLOATS_PER_PROBE + slot];
            }
          }
          if (live === 0) continue;
          for (let slot = 0; slot < FLOATS_PER_PROBE; slot += 1) {
            coefficients[index * FLOATS_PER_PROBE + slot] = accumulator[slot] / live;
          }
          buried[index] = 2;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

// ---------------------------------------------------------------------------
// Sampling — the CPU reference the GPU node must agree with
// ---------------------------------------------------------------------------

/**
 * Trilinear probe fetch, then SH evaluation. The GPU does exactly this with
 * hardware filtering over three RGBA 3D textures; this is the reference the
 * tests hold it to and the version any offline check (a readability capture, a
 * parity assertion) should use.
 */
export function sampleIrradianceVolume(
  volume: IrradianceProbeVolume,
  positionM: Vec3,
  normal: Vec3,
): Vec3 {
  const [nx, ny, nz] = volume.dimensions;
  const gx = (positionM[0] - volume.originM[0]) / volume.spacingM[0];
  const gy = (positionM[1] - volume.originM[1]) / volume.spacingM[1];
  const gz = (positionM[2] - volume.originM[2]) / volume.spacingM[2];
  const clampGrid = (value: number, count: number): number => Math.min(count - 1, Math.max(0, value));
  const x0 = Math.floor(clampGrid(gx, nx));
  const y0 = Math.floor(clampGrid(gy, ny));
  const z0 = Math.floor(clampGrid(gz, nz));
  const x1 = Math.min(nx - 1, x0 + 1);
  const y1 = Math.min(ny - 1, y0 + 1);
  const z1 = Math.min(nz - 1, z0 + 1);
  const fx = Math.min(1, Math.max(0, gx - x0));
  const fy = Math.min(1, Math.max(0, gy - y0));
  const fz = Math.min(1, Math.max(0, gz - z0));
  const blended = new Float64Array(FLOATS_PER_PROBE);
  const corners: readonly (readonly [number, number, number, number])[] = [
    [x0, y0, z0, (1 - fx) * (1 - fy) * (1 - fz)],
    [x1, y0, z0, fx * (1 - fy) * (1 - fz)],
    [x0, y1, z0, (1 - fx) * fy * (1 - fz)],
    [x1, y1, z0, fx * fy * (1 - fz)],
    [x0, y0, z1, (1 - fx) * (1 - fy) * fz],
    [x1, y0, z1, fx * (1 - fy) * fz],
    [x0, y1, z1, (1 - fx) * fy * fz],
    [x1, y1, z1, fx * fy * fz],
  ];
  for (const [cx, cy, cz, cw] of corners) {
    if (cw === 0) continue;
    const base = ((cz * ny + cy) * nx + cx) * FLOATS_PER_PROBE;
    for (let slot = 0; slot < FLOATS_PER_PROBE; slot += 1) blended[slot] += coefficientAt(volume, base + slot) * cw;
  }
  return vec3(
    evaluateShL1(blended, 0, normal),
    evaluateShL1(blended, SH_L1_COEFFICIENTS, normal),
    evaluateShL1(blended, SH_L1_COEFFICIENTS * 2, normal),
  );
}

function coefficientAt(volume: IrradianceProbeVolume, index: number): number {
  const value = volume.coefficients[index];
  return Number.isFinite(value) ? value : 0;
}

// ---------------------------------------------------------------------------
// Serialisation — the committed generated asset
// ---------------------------------------------------------------------------

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 written by hand rather than through Buffer or btoa, because this
 * module runs in three environments (the bake CLI on Node, the browser at
 * runtime, and vitest) and a codec that exists in two of them is a bug that
 * only appears in the third.
 */
export function encodeFloat32Base64(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index];
    const b1 = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const b2 = index + 2 < bytes.length ? bytes[index + 2] : 0;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += index + 1 < bytes.length ? BASE64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += index + 2 < bytes.length ? BASE64_ALPHABET[b2 & 63] : '=';
  }
  return out;
}

export function decodeFloat32Base64(text: string): Float32Array {
  const clean = text.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const c0 = BASE64_ALPHABET.indexOf(clean[index]);
    const c1 = BASE64_ALPHABET.indexOf(clean[index + 1]);
    const c2 = index + 2 < clean.length ? BASE64_ALPHABET.indexOf(clean[index + 2]) : 0;
    const c3 = index + 3 < clean.length ? BASE64_ALPHABET.indexOf(clean[index + 3]) : 0;
    if (byteIndex < bytes.length) bytes[byteIndex++] = (c0 << 2) | (c1 >> 4);
    if (byteIndex < bytes.length) bytes[byteIndex++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (byteIndex < bytes.length) bytes[byteIndex++] = ((c2 & 3) << 6) | c3;
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

export type SerialisedIrradianceVolume = Readonly<{
  format: 'atomic-acres.irradiance-probe-volume.sh-l1.v1';
  arenaId: string;
  digest: string;
  originM: readonly [number, number, number];
  spacingM: readonly [number, number, number];
  dimensions: readonly [number, number, number];
  coefficientsBase64: string;
  bake: IrradianceProbeVolume['bake'];
}>;

export const IRRADIANCE_VOLUME_FORMAT = 'atomic-acres.irradiance-probe-volume.sh-l1.v1';

export function serialiseIrradianceVolume(volume: IrradianceProbeVolume): SerialisedIrradianceVolume {
  return Object.freeze({
    format: IRRADIANCE_VOLUME_FORMAT,
    arenaId: volume.arenaId,
    digest: volume.digest,
    originM: [volume.originM[0], volume.originM[1], volume.originM[2]] as const,
    spacingM: [volume.spacingM[0], volume.spacingM[1], volume.spacingM[2]] as const,
    dimensions: volume.dimensions,
    coefficientsBase64: encodeFloat32Base64(volume.coefficients),
    bake: volume.bake,
  });
}

export function deserialiseIrradianceVolume(payload: SerialisedIrradianceVolume): IrradianceProbeVolume {
  if (payload.format !== IRRADIANCE_VOLUME_FORMAT) {
    throw new Error(`Unknown irradiance volume format: ${String(payload.format)}`);
  }
  const [nx, ny, nz] = payload.dimensions;
  const coefficients = decodeFloat32Base64(payload.coefficientsBase64);
  const expected = nx * ny * nz * FLOATS_PER_PROBE;
  if (coefficients.length !== expected) {
    throw new Error(`Irradiance volume for ${payload.arenaId} carries ${coefficients.length} floats, expected ${expected}.`);
  }
  return Object.freeze({
    arenaId: payload.arenaId,
    digest: payload.digest,
    originM: vec3(payload.originM[0], payload.originM[1], payload.originM[2]),
    spacingM: vec3(payload.spacingM[0], payload.spacingM[1], payload.spacingM[2]),
    dimensions: payload.dimensions,
    coefficients,
    bake: payload.bake,
  });
}
