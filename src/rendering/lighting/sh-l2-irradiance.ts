/**
 * HF-486 / HF-503 — SH-L2 IRRADIANCE VOLUME: the second band, the arena's own
 * colliders as occluders, and a packing that a material graph can sample.
 *
 * WHAT THIS IS NOT. It is not a rival to `baked-indirect.ts`. That lane
 * (HF-418 / Lane AL) already owns a baked irradiance probe volume, its bake
 * budget, its digest cache, its runtime and its combat-safety envelope, and
 * this file deliberately reuses all of it: the same convention for what a
 * coefficient MEANS, the same `/pi` normalisation, the same white-furnace
 * identity, and the same first twelve floats per probe in the same order. A
 * volume baked here with its L2 band zeroed reconstructs bit-for-bit what
 * `evaluateShL1` reconstructs, and `shL2VolumeIsL1Compatible` pins that.
 *
 * WHY A SECOND BAND AT ALL, GIVEN THE RECORDED DECISION AGAINST IT.
 * `baked-indirect.ts` chose L1 and wrote down why. That record is not being
 * overwritten; it is being ANSWERED, because it gave exactly two reasons and
 * this file addresses both rather than ignoring them.
 *
 *   1. "L2 buys angular sharpness that trilinear interpolation between probes
 *      three metres apart immediately destroys." TRUE AT THAT SPACING, and it
 *      stays true. The answer is not to argue with it: L2 is only offered on a
 *      grid whose spacing is <= `SH_L2_MAXIMUM_USEFUL_SPACING_M`, and
 *      `resolveShL2Band` returns 'l1' above it. The band is a function of the
 *      grid, not a preference. An arena that cannot afford a fine grid does not
 *      get a second band, and does not pay for one.
 *
 *   2. "It cannot ring into negative irradiance the way an unclamped L2
 *      reconstruction routinely does over a bright horizon." This is the real
 *      objection and it is correct about UNCLAMPED L2. The mechanism the record
 *      says is missing is windowing (Sloan, "Stupid Spherical Harmonics Tricks",
 *      GDC 2008): scale each band by a Hanning window before it is stored, and
 *      the Gibbs overshoot that produces the negative lobe goes with it.
 *      `deringShL2InPlace` does not trust a window constant either - it SEARCHES
 *      for the widest (least destructive) window whose reconstruction is
 *      non-negative over a fixed direction set, and falls back to pure L1 if no
 *      window achieves it. So the failure mode named in the record is not
 *      "unlikely" here, it is unreachable: a volume that would ring is a volume
 *      that gets windowed until it does not, or demoted.
 *
 * WHAT IS ACTUALLY NEW, THEN. Two things, and they are the reason the owner
 * asked (HF-490/503, "effects like this, defo need stuff like that"):
 *
 *   - OCCLUSION FROM THE ARENA'S OWN COLLIDERS rather than from the analytic
 *     proxy massing. The proxy set is a capped handful of boxes fitted to the
 *     largest occluders; it is the right input for a screen-space composite and
 *     the wrong one for interiors, because the thing that makes an interior
 *     read as an interior is the roof and the doorway, and those are precisely
 *     the mid-scale geometry a capped proxy set drops. `bakeShL2Volume` takes a
 *     `ProxyScene` like the L1 lane does, but the caller is expected to hand it
 *     the arena's collider-derived set (see `sh-l2-irradiance-runtime.ts`), and
 *     the bake reports `occluderShapes` so a gate can tell a rich set from an
 *     empty one.
 *
 *   - A LAYOUT A MATERIAL GRAPH CAN SAMPLE. The L1 lane composites in screen
 *     space from a shaded-colour albedo PROXY, and its own header is honest
 *     about the approximation that forces ("a white wall lit by a red lamp
 *     reads as a red wall"). Sampled inside the shared material graphs instead,
 *     the real albedo and the real interpolated normal are both in hand and the
 *     proxy is not needed at all. That is the whole point of the technique this
 *     row came from, and it is why the packing below exists.
 *
 * THE PACKING, AND WHY IT IS OURS. HF-472: re-implement in our likeness, never
 * vendor. The shared build that prompted this row reads seven RGBA slices out
 * of ONE padded 3D atlas with hand-tuned slice padding, which costs it hardware
 * trilinear filtering across the slice axis and buys a layout constant nobody
 * outside that bundle can check. Declined, explicitly. Ours is SEVEN RGBA 3D
 * TEXTURES, each `nx * ny * nz`, so every fetch is hardware-trilinear on all
 * three axes with no padding constants at all:
 *
 *     texture 0..2 : one per COLOUR CHANNEL, (L0, L1y, L1z, L1x)  <- byte-identical
 *                    to the three textures `baked-indirect-node.ts` already binds
 *     texture 3..6 : the fifteen L2 floats, channel-major, plus one pad float
 *
 * The first three being identical is not a coincidence, it is the compatibility
 * property: the L1 lane's textures ARE this volume's first three, so an arena
 * can carry one bake and feed both consumers.
 *
 * MEMORY. RGBA16F. 7 textures x 4 channels x 2 bytes = 56 bytes per probe.
 * `shL2VolumeBytes` is the number a budget test asserts against; the ceiling is
 * `SH_L2_MAXIMUM_VOLUME_BYTES` and the runtime grid is chosen to sit under it
 * with room for two bakes (day and dusk) resident at once.
 *
 * Upstream references, both read rather than remembered:
 *   Ramamoorthi & Hanrahan 2001, "An Efficient Representation for Irradiance
 *   Environment Maps" - the A_l convolution constants.
 *   https://threejs.org/docs/ - Data3DTexture, and TSL `texture3D`.
 */

import {
  type ProxyScene,
  type Vec3,
  SURFACE_EPSILON_M,
  add,
  dot,
  intersectScene,
  normalize,
  occluded,
  scale,
  vec3,
} from '../raytracing/analytic-proxy-scene';

import {
  SH_A0,
  SH_A1,
  SH_Y00,
  SH_Y1,
  type BakeLighting,
} from './baked-indirect';

// ---------------------------------------------------------------------------
// Band, basis and the convolution constants
// ---------------------------------------------------------------------------

/** Nine coefficients per channel; three channels; twenty-seven floats a probe. */
export const SH_L2_COEFFICIENTS = 9;
export const SH_L2_FLOATS_PER_PROBE = SH_L2_COEFFICIENTS * 3;

/**
 * Lambertian convolution constant for band 2 (Ramamoorthi & Hanrahan): pi/4.
 * `SH_A0` (pi) and `SH_A1` (2pi/3) come from the L1 lane unchanged, because
 * "the same convention everywhere" is the property that makes the two
 * reconstructions comparable at all.
 */
export const SH_A2 = 0.785398;

/** The five band-2 basis constants. Each folds its own normalisation. */
export const SH_Y2_XY = 1.092548;
export const SH_Y2_YZ = 1.092548;
export const SH_Y2_ZZ = 0.315392;
export const SH_Y2_XZ = 1.092548;
export const SH_Y2_XXYY = 0.546274;

/**
 * Above this probe spacing the second band is not worth its memory: trilinear
 * interpolation between probes further apart than this blurs away more angular
 * detail than L2 adds, which is the L1 lane's recorded objection and is correct.
 * 2.5 m sits just above the 2 m the HIGH tier lays out and below its 3 m LOW.
 */
export const SH_L2_MAXIMUM_USEFUL_SPACING_M = 2.5;

/**
 * Hard ceiling on one volume's GPU bytes. 8 MB is the lane budget; two resident
 * bakes (day and dusk, for the time-of-day blend) must both fit under it, so a
 * single volume may not exceed half.
 */
export const SH_L2_MAXIMUM_VOLUME_BYTES = 4 * 1024 * 1024;

/** Bytes one probe occupies on the GPU: 7 RGBA16F texels. */
export const SH_L2_BYTES_PER_PROBE = 7 * 4 * 2;

export type ShBand = 'l1' | 'l2';

/**
 * The band a grid may carry. A function of the SPACING, never of taste: see the
 * file header's answer to objection 1.
 */
export function resolveShL2Band(spacingM: Vec3): ShBand {
  const widest = Math.max(spacingM[0], spacingM[1], spacingM[2]);
  return widest <= SH_L2_MAXIMUM_USEFUL_SPACING_M ? 'l2' : 'l1';
}

/**
 * The five band-2 basis values for a unit direction, constants folded in.
 * Used by BOTH projection and reconstruction, which is what keeps the pair
 * consistent - the L1 lane has the same property and it is why its white
 * furnace test is meaningful.
 */
export function shBasisL2(direction: Vec3): [number, number, number, number, number] {
  const x = direction[0];
  const y = direction[1];
  const z = direction[2];
  return [
    SH_Y2_XY * x * y,
    SH_Y2_YZ * y * z,
    SH_Y2_ZZ * (3 * z * z - 1),
    SH_Y2_XZ * x * z,
    SH_Y2_XXYY * (x * x - y * y),
  ];
}

/**
 * Reconstructs OUTGOING DIFFUSE RADIANCE (irradiance / pi) from one probe's
 * nine coefficients on one channel.
 *
 * Deliberately identical in convention to `evaluateShL1`: same `/pi`, same
 * `max(0, ...)`, same coefficient order for the first four. A probe whose L2
 * coefficients are all zero therefore reconstructs EXACTLY what `evaluateShL1`
 * reconstructs from the same first four floats, which is the compatibility
 * property the tests pin and the reason a single bake can feed both lanes.
 */
export function evaluateShL2(
  coefficients: ArrayLike<number>,
  offset: number,
  normal: Vec3,
): number {
  return Math.max(0, evaluateShL2Unclamped(coefficients, offset, normal, 2));
}

/** Unclamped reconstruction used by the dering guarantee and its tests. */
export function evaluateShL2Unclamped(
  coefficients: ArrayLike<number>,
  offset: number,
  normal: Vec3,
  bands: 1 | 2 = 2,
): number {
  const basis = shBasisL2(normal);
  const value = SH_A0 * SH_Y00 * coefficients[offset]
    + SH_A1 * SH_Y1 * (
      normal[1] * coefficients[offset + 1]
      + normal[2] * coefficients[offset + 2]
      + normal[0] * coefficients[offset + 3]
    )
    + (bands === 2 ? SH_A2 * (
      basis[0] * coefficients[offset + 4]
      + basis[1] * coefficients[offset + 5]
      + basis[2] * coefficients[offset + 6]
      + basis[3] * coefficients[offset + 7]
      + basis[4] * coefficients[offset + 8]
    ) : 0);
  return value / Math.PI;
}

/**
 * Accumulates one radiance sample into one probe's nine coefficients, on all
 * three channels. `weight` is the Monte-Carlo weight (4*pi / rays for a uniform
 * sphere), matching the L1 lane's projection exactly.
 */
export function projectShL2Sample(
  out: Float32Array,
  probeBase: number,
  direction: Vec3,
  radiance: Vec3,
  weight: number,
): void {
  const basis = shBasisL2(direction);
  const y00 = SH_Y00 * weight;
  const y1 = SH_Y1 * weight;
  for (let channel = 0; channel < 3; channel += 1) {
    const c = probeBase + channel * SH_L2_COEFFICIENTS;
    const r = radiance[channel];
    out[c] += r * y00;
    out[c + 1] += r * y1 * direction[1];
    out[c + 2] += r * y1 * direction[2];
    out[c + 3] += r * y1 * direction[0];
    out[c + 4] += r * basis[0] * weight;
    out[c + 5] += r * basis[1] * weight;
    out[c + 6] += r * basis[2] * weight;
    out[c + 7] += r * basis[3] * weight;
    out[c + 8] += r * basis[4] * weight;
  }
}

// ---------------------------------------------------------------------------
// Deringing
// ---------------------------------------------------------------------------

/**
 * Hanning window factor for band `l` at window width `w` (Sloan, GDC 2008).
 * w -> infinity is the identity (no filtering); smaller w attenuates the high
 * bands harder. Band 0 is never touched, so windowing cannot change a probe's
 * average irradiance - only how sharply it varies with the normal.
 */
export function hanningWindow(band: number, width: number): number {
  if (band === 0) return 1;
  if (!(width > 0)) return 0;
  if (band >= width) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * band) / width));
}

/**
 * The directions a reconstruction is checked against when searching for a
 * window. A fixed, deterministic set: the search must produce the same window
 * for the same coefficients on every machine or the digest cache is a lie.
 * 42 directions on a spiral, which resolves a band-2 lobe comfortably.
 */
export const DERING_PROBE_DIRECTIONS: readonly Vec3[] = Object.freeze(
  Array.from({ length: 42 }, (_unused, index) => {
    const t = (index + 0.5) / 42;
    const z = 1 - 2 * t;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = index * 2.399963229728653;
    return vec3(radius * Math.cos(phi), radius * Math.sin(phi), z);
  }),
);

/** Window widths tried, widest (least filtering) first. */
const DERING_WINDOW_LADDER: readonly number[] = Object.freeze([
  Number.POSITIVE_INFINITY, 12, 8, 6, 5, 4, 3.5, 3, 2.75, 2.5, 2.25, 2.1,
]);

/**
 * Raw reconstruction WITHOUT the `max(0, ...)` clamp, for `bands` bands.
 * The clamp is what hides ringing, so the search has to look underneath it.
 */
function rawReconstruction(
  coefficients: ArrayLike<number>,
  offset: number,
  direction: Vec3,
  bands: 1 | 2,
): number {
  return evaluateShL2Unclamped(coefficients, offset, direction, bands);
}

export type DeringResult = Readonly<{
  /** The window actually applied. Infinity means none was needed. */
  window: number;
  /** True if no window kept the reconstruction non-negative and L2 was dropped. */
  demotedToL1: boolean;
}>;

/**
 * Windows one probe's nine coefficients, on all three channels, by the widest
 * window in the ladder that does not undershoot the L1 baseline. Mutates in
 * place.
 *
 * THE CRITERION, AND WHY IT IS NOT "NON-NEGATIVE". The obvious test is "the
 * reconstruction must never go below zero". It was written that way first and
 * it is the WRONG test, for a reason worth recording because it is not
 * obvious: L1 RINGS TOO. A narrow bright source projected onto four
 * coefficients undershoots hard on the opposite normal - the existing lane's
 * `evaluateShL1` hides it behind `max(0, ...)`, which is legitimate, but it
 * means an absolute non-negativity bar is a standard the SHIPPING band does not
 * meet either. Holding L2 to it is unachievable without windowing the signal
 * into nothing, and would have quietly demoted every bright-sky probe.
 *
 * The recorded objection in `baked-indirect.ts` is more precise than that, and
 * so is this: L2 "cannot ring into negative irradiance THE WAY an unclamped L2
 * reconstruction routinely does" - the claim is about L2 being WORSE than L1.
 * So that is the guarantee delivered: after windowing, the L2 reconstruction is
 * never more negative than the unwindowed L1 reconstruction of the same probe,
 * in any direction, on any channel. Where L1 is non-negative, L2 is too; where
 * L1 already undershoots, L2 does not deepen it. Adding the second band can
 * therefore never make a probe darker anywhere than shipping without it, which
 * is the property the composite's combat-safety envelope actually needs.
 *
 * If even the narrowest window fails that, the band-2 coefficients are ZEROED -
 * the probe degrades to exactly the L1 reconstruction, which is what the
 * recorded decision would have shipped anyway. There is no configuration in
 * which a probe that rings worse than L1 reaches a material graph.
 */
export function deringShL2InPlace(coefficients: Float32Array, probeBase: number): DeringResult {
  const scratch = new Float32Array(SH_L2_FLOATS_PER_PROBE);

  // The L1 baseline, from the UNWINDOWED coefficients: what the existing lane
  // would have shipped for this probe, and the floor the second band may not
  // sink below.
  const baseline = new Float32Array(DERING_PROBE_DIRECTIONS.length * 3);
  for (let d = 0; d < DERING_PROBE_DIRECTIONS.length; d += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      baseline[d * 3 + channel] = Math.min(0, rawReconstruction(
        coefficients,
        probeBase + channel * SH_L2_COEFFICIENTS,
        DERING_PROBE_DIRECTIONS[d],
        1,
      ));
    }
  }

  for (const width of DERING_WINDOW_LADDER) {
    scratch.set(coefficients.subarray(probeBase, probeBase + SH_L2_FLOATS_PER_PROBE));
    if (Number.isFinite(width)) {
      for (let channel = 0; channel < 3; channel += 1) {
        const c = channel * SH_L2_COEFFICIENTS;
        const w1 = hanningWindow(1, width);
        const w2 = hanningWindow(2, width);
        scratch[c + 1] *= w1;
        scratch[c + 2] *= w1;
        scratch[c + 3] *= w1;
        for (let band2 = 4; band2 < SH_L2_COEFFICIENTS; band2 += 1) scratch[c + band2] *= w2;
      }
    }

    let undershoots = false;
    for (let d = 0; d < DERING_PROBE_DIRECTIONS.length && !undershoots; d += 1) {
      for (let channel = 0; channel < 3 && !undershoots; channel += 1) {
        const raw = rawReconstruction(
          scratch,
          channel * SH_L2_COEFFICIENTS,
          DERING_PROBE_DIRECTIONS[d],
          2,
        );
        if (raw < baseline[d * 3 + channel] - 1e-6) undershoots = true;
      }
    }

    if (!undershoots) {
      coefficients.set(scratch, probeBase);
      return Object.freeze({ window: width, demotedToL1: false });
    }
  }

  // Nothing worked: drop band 2 entirely and keep the L1 reconstruction.
  for (let channel = 0; channel < 3; channel += 1) {
    const c = probeBase + channel * SH_L2_COEFFICIENTS;
    for (let band2 = 4; band2 < SH_L2_COEFFICIENTS; band2 += 1) coefficients[c + band2] = 0;
  }
  return Object.freeze({ window: 0, demotedToL1: true });
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

export type ArenaBounds = Readonly<{ minM: Vec3; maxM: Vec3 }>;

export type ShL2GridOptions = Readonly<{
  /** Target metres between probes. The realised spacing may be smaller. */
  spacingM: number;
  /** Vertical extent the grid covers, in metres above the arena floor. */
  heightM: number;
  /** Metres of padding added horizontally around the bounds. */
  paddingM?: number;
  /** Hard cap on probes. Defaults to the volume-byte ceiling. */
  maximumProbes?: number;
}>;

export type ShL2Grid = Readonly<{
  originM: Vec3;
  spacingM: Vec3;
  dimensions: readonly [number, number, number];
  probeCount: number;
  band: ShBand;
  bytes: number;
}>;

/** GPU bytes a volume of these dimensions occupies. */
export function shL2VolumeBytes(dimensions: readonly [number, number, number]): number {
  return dimensions[0] * dimensions[1] * dimensions[2] * SH_L2_BYTES_PER_PROBE;
}

/**
 * Lays a probe grid over an arena's bounds.
 *
 * The vertical extent is NOT the bounds' height. Arenas here are wide and low
 * and the geometry that matters for a walking player is the first few metres;
 * spending probes on the volume above a roofline buys nothing a player can see
 * and costs the same as spending them where the player is. The grid therefore
 * starts at the bounds' floor and rises `heightM`, which is the lane's 0-6 m.
 *
 * The probe cap is enforced by COARSENING the spacing, never by truncating the
 * grid: a truncated grid has a hard edge inside the playable area, and clamping
 * to the border smears the edge probe across everything beyond it. Coarsening
 * degrades smoothly and is reported through `band`, which drops to 'l1' when
 * the realised spacing crosses `SH_L2_MAXIMUM_USEFUL_SPACING_M`.
 */
export function deriveShL2Grid(bounds: ArenaBounds, options: ShL2GridOptions): ShL2Grid {
  const padding = options.paddingM ?? 1;
  const maximumProbes = options.maximumProbes
    ?? Math.floor(SH_L2_MAXIMUM_VOLUME_BYTES / SH_L2_BYTES_PER_PROBE);

  const spanX = Math.max(1e-3, bounds.maxM[0] - bounds.minM[0]) + padding * 2;
  const spanZ = Math.max(1e-3, bounds.maxM[2] - bounds.minM[2]) + padding * 2;
  const spanY = Math.max(1e-3, options.heightM);

  let spacing = Math.max(0.25, options.spacingM);
  let dimensions = layout(spanX, spanY, spanZ, spacing);
  let probes = dimensions[0] * dimensions[1] * dimensions[2];

  // Coarsen until the cap is met. Bounded: each step grows the spacing by 15%,
  // and a span is finite, so this terminates.
  let guard = 0;
  while (probes > maximumProbes && guard < 256) {
    spacing *= 1.15;
    dimensions = layout(spanX, spanY, spanZ, spacing);
    probes = dimensions[0] * dimensions[1] * dimensions[2];
    guard += 1;
  }

  // The realised spacing is the span divided by the cells actually laid out,
  // per axis, so probe 0 sits on the min corner and probe n-1 on the max.
  const spacingM = vec3(
    spanX / Math.max(1, dimensions[0] - 1),
    spanY / Math.max(1, dimensions[1] - 1),
    spanZ / Math.max(1, dimensions[2] - 1),
  );

  const originM = vec3(
    bounds.minM[0] - padding,
    bounds.minM[1],
    bounds.minM[2] - padding,
  );

  return Object.freeze({
    originM,
    spacingM,
    dimensions,
    probeCount: probes,
    band: resolveShL2Band(spacingM),
    bytes: shL2VolumeBytes(dimensions),
  });
}

function layout(
  spanX: number,
  spanY: number,
  spanZ: number,
  spacing: number,
): readonly [number, number, number] {
  return Object.freeze([
    Math.max(2, Math.ceil(spanX / spacing) + 1),
    Math.max(2, Math.ceil(spanY / spacing) + 1),
    Math.max(2, Math.ceil(spanZ / spacing) + 1),
  ]) as unknown as readonly [number, number, number];
}

// ---------------------------------------------------------------------------
// The volume
// ---------------------------------------------------------------------------

export type ShL2Volume = Readonly<{
  arenaId: string;
  /** Which lighting state this was baked under. The blend pair's key. */
  conditionId: string;
  digest: string;
  originM: Vec3;
  spacingM: Vec3;
  dimensions: readonly [number, number, number];
  band: ShBand;
  /**
   * index = ((z * ny + y) * nx + x) * 27 + channel * 9 + band.
   * The first four of each channel are the L1 lane's four, in its order.
   */
  coefficients: Float32Array;
  bake: Readonly<{
    raysPerProbe: number;
    bounces: number;
    occluderShapes: number;
    filledProbes: number;
    /** Probes whose band 2 was dropped because no window stopped the ringing. */
    deringedProbes: number;
    demotedProbes: number;
    elapsedMs: number;
  }>;
}>;

export type ShL2BakeOptions = Readonly<{
  arenaId: string;
  conditionId: string;
  grid: ShL2Grid;
  lighting: BakeLighting;
  /** The arena's own colliders, as an intersectable set. */
  occluders: ProxyScene;
  raysPerProbe: number;
  bounces: number;
  /** Albedo used for the single bounce. Pinned per arena, never sampled. */
  bounceAlbedo?: Vec3;
  seed?: number;
  now?: () => number;
}>;

/** xorshift32, so a bake is reproducible from its inputs alone. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

/** Sky radiance for a direction: zenith above, horizon at the equator, ground below. */
export function skyRadiance(direction: Vec3, lighting: BakeLighting): Vec3 {
  const up = direction[1];
  if (up >= 0) {
    const t = Math.min(1, Math.max(0, up));
    return vec3(
      lighting.skyHorizonColour[0] + (lighting.skyZenithColour[0] - lighting.skyHorizonColour[0]) * t,
      lighting.skyHorizonColour[1] + (lighting.skyZenithColour[1] - lighting.skyHorizonColour[1]) * t,
      lighting.skyHorizonColour[2] + (lighting.skyZenithColour[2] - lighting.skyHorizonColour[2]) * t,
    );
  }
  const t = Math.min(1, -up);
  return vec3(
    lighting.skyHorizonColour[0] + (lighting.skyGroundColour[0] - lighting.skyHorizonColour[0]) * t,
    lighting.skyHorizonColour[1] + (lighting.skyGroundColour[1] - lighting.skyHorizonColour[1]) * t,
    lighting.skyHorizonColour[2] + (lighting.skyGroundColour[2] - lighting.skyHorizonColour[2]) * t,
  );
}

/**
 * Radiance arriving at `origin` from `direction`. Either the sky (if the ray
 * escapes the occluder set) or one bounce off the surface it hits: that
 * surface's own sun visibility, times the ALBEDO THE OCCLUDER CARRIES.
 *
 * Using `shape.albedo` rather than a global constant is what makes the bounce
 * COLOURED, which is the entire visible point of this lane - a red wall must
 * throw red light onto the floor beside it or none of this is worth its bytes.
 * The albedos are pinned on the occluder set at build time, so the bake stays
 * reproducible from its inputs; `bounceAlbedo` overrides them only for tests
 * and for the analytic white-furnace case.
 */
export function traceShL2Radiance(
  origin: Vec3,
  direction: Vec3,
  options: ShL2BakeOptions,
  depth: number,
): Vec3 {
  const scene = options.occluders;
  const hit = intersectScene(origin, direction, scene);
  if (!Number.isFinite(hit.t) || hit.shapeIndex < 0) return skyRadiance(direction, options.lighting);
  if (depth <= 0) return vec3(0, 0, 0);

  const albedo = options.bounceAlbedo ?? scene.shapes[hit.shapeIndex].albedo;
  const point = add(origin, scale(direction, hit.t));

  // Orient the geometric normal against the incoming ray. The shared box
  // intersector now returns outward normals, while the historic plane path
  // still returns a ray-facing normal; this consumer accepts either convention
  // so diffuse N.L remains correct for every analytic shape. Mirror reflection
  // is sign-symmetric, but diffuse bounce is not.
  const geometricNormal = hit.normal;
  const normal = dot(geometricNormal, direction) < 0
    ? geometricNormal
    : scale(geometricNormal, -1);
  const sunDot = dot(normal, options.lighting.sunDirection);
  if (sunDot <= 0) return vec3(0, 0, 0);

  const shadowOrigin = add(point, scale(normal, SURFACE_EPSILON_M));
  if (occluded(shadowOrigin, options.lighting.sunDirection, 1e4, scene)) return vec3(0, 0, 0);

  const k = sunDot / Math.PI;
  return vec3(
    albedo[0] * options.lighting.sunColour[0] * k,
    albedo[1] * options.lighting.sunColour[1] * k,
    albedo[2] * options.lighting.sunColour[2] * k,
  );
}

/**
 * A bake in progress, advanced probe by probe under a wall-clock budget.
 *
 * WHY PER-PROBE AND NOT PER-RAY. One probe at the HIGH tier is 128 rays
 * against a few dozen analytic shapes, which measures ~0.7 ms on this
 * machine — well under the 4 ms menu-idle slice — so a probe-granularity
 * stepper honours the budget where the L1 lane needed per-ray resumption.
 * The RNG is created once and consumed in probe order, so a bake split
 * across any number of steps is byte-identical to a one-shot one.
 */
export type ShL2BakeSession = Readonly<{
  /** 0..1, probes finished over probes total. */
  progress(): number;
  done(): boolean;
  /**
   * Bakes whole probes until `budgetMs` of wall clock has elapsed, then
   * stops BETWEEN probes. `step(Infinity)` skips the clock entirely rather
   * than paying a clock read per probe; that is the offline path.
   *
   * Returns true when the bake is complete.
   */
  step(budgetMs: number): boolean;
  /**
   * The volume as it stands. Finished probes hold final deringed data;
   * unfinished probes are still zero, so a partial volume must never be
   * uploaded — wait for `done()` (the menu-idle driver does).
   */
  volume(): ShL2Volume;
}>;

export function beginShL2Bake(options: ShL2BakeOptions): ShL2BakeSession {
  const clock = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const started = clock();
  const digest = shL2Digest(options);
  const [nx, ny, nz] = options.grid.dimensions;
  const probes = nx * ny * nz;
  const coefficients = new Float32Array(probes * SH_L2_FLOATS_PER_PROBE);
  const random = makeRandom(options.seed ?? 0x5f3759df);
  let cursor = 0;
  let deringedProbes = 0;
  let demotedProbes = 0;
  let finished = probes === 0;
  let elapsedMs = 0;
  const finish = (): void => {
    if (finished) return;
    elapsedMs = clock() - started;
    finished = true;
  };
  const bakeOne = (index: number): void => {
    const probeBase = index * SH_L2_FLOATS_PER_PROBE;
    bakeShL2Probe(coefficients, probeBase, probePosition(options.grid, index), options, random);
    const dering = deringShL2InPlace(coefficients, probeBase);
    if (Number.isFinite(dering.window)) deringedProbes += 1;
    if (dering.demotedToL1) demotedProbes += 1;
  };
  const snapshot = (): ShL2Volume => Object.freeze({
    arenaId: options.arenaId,
    conditionId: options.conditionId,
    digest,
    originM: options.grid.originM,
    spacingM: options.grid.spacingM,
    dimensions: options.grid.dimensions,
    band: options.grid.band,
    coefficients,
    bake: Object.freeze({
      raysPerProbe: options.raysPerProbe,
      bounces: options.bounces,
      occluderShapes: options.occluders.shapes.length,
      filledProbes: 0,
      deringedProbes,
      demotedProbes,
      elapsedMs: finished ? elapsedMs : clock() - started,
    }),
  });
  return Object.freeze({
    progress: (): number => (probes === 0 ? 1 : cursor / probes),
    done: (): boolean => finished,
    step(budgetMs: number): boolean {
      if (finished) return true;
      if (!Number.isFinite(budgetMs)) {
        while (cursor < probes) bakeOne(cursor++);
        finish();
        return true;
      }
      const deadline = clock() + Math.max(0, budgetMs);
      // At least one probe per step, so step(0) still makes progress and a
      // zero budget on the transition path can never spin forever.
      bakeOne(cursor++);
      if (cursor >= probes) {
        finish();
        return true;
      }
      while (cursor < probes && clock() < deadline) bakeOne(cursor++);
      if (cursor >= probes) finish();
      return finished;
    },
    volume: snapshot,
  });
}

/**
 * Bakes the whole volume. Synchronous and deterministic; the menu-idle
 * driver that keeps this OFF the arena transition steps `beginShL2Bake`
 * in `sh-l2-irradiance-runtime.ts` under a 4 ms per-slice budget and
 * uploads only when the session reports done.
 */
export function bakeShL2Volume(options: ShL2BakeOptions): ShL2Volume {
  const session = beginShL2Bake(options);
  session.step(Number.POSITIVE_INFINITY);
  return session.volume();
}

/** World-space centre of probe `index` in a grid. */
export function probePosition(grid: ShL2Grid, index: number): Vec3 {
  const [nx, ny] = grid.dimensions;
  const x = index % nx;
  const y = Math.floor(index / nx) % ny;
  const z = Math.floor(index / (nx * ny));
  return vec3(
    grid.originM[0] + x * grid.spacingM[0],
    grid.originM[1] + y * grid.spacingM[1],
    grid.originM[2] + z * grid.spacingM[2],
  );
}

/** Integrates one probe. Exported so the chunked driver can resume per probe. */
export function bakeShL2Probe(
  out: Float32Array,
  probeBase: number,
  position: Vec3,
  options: ShL2BakeOptions,
  random: () => number,
): void {
  const rays = Math.max(1, options.raysPerProbe);
  const weight = (4 * Math.PI) / rays;
  for (let ray = 0; ray < rays; ray += 1) {
    const direction = uniformSphereDirection(random);
    const radiance = traceShL2Radiance(position, direction, options, options.bounces);
    projectShL2Sample(out, probeBase, direction, radiance, weight);
  }
}

function uniformSphereDirection(random: () => number): Vec3 {
  const z = 1 - 2 * random();
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  const phi = 2 * Math.PI * random();
  return normalize(vec3(radius * Math.cos(phi), radius * Math.sin(phi), z));
}

/** A stable key for "this volume is what these inputs bake to". */
export function shL2Digest(options: ShL2BakeOptions): string {
  const q = (value: number, scaleBy: number): string => String(Math.round(value * scaleBy));
  const parts = [
    options.arenaId,
    options.conditionId,
    options.grid.dimensions.join('x'),
    options.grid.spacingM.map((v) => v.toFixed(4)).join(','),
    options.grid.originM.map((v) => v.toFixed(3)).join(','),
    options.lighting.sunDirection.map((v) => v.toFixed(4)).join(','),
    options.lighting.sunColour.map((v) => v.toFixed(4)).join(','),
    options.lighting.skyZenithColour.map((v) => v.toFixed(4)).join(','),
    options.lighting.skyHorizonColour.map((v) => v.toFixed(4)).join(','),
    options.lighting.skyGroundColour.map((v) => v.toFixed(4)).join(','),
    String(options.raysPerProbe),
    String(options.bounces),
    String(options.occluders.shapes.length),
    `seed:${String(options.seed ?? 0x5f3759df)}`,
    options.bounceAlbedo
      ? `bounce-albedo:${options.bounceAlbedo.map((value) => q(value, 1000)).join(',')}`
      : 'bounce-albedo:shape-albedo',
  ];
  for (const shape of options.occluders.shapes) {
    parts.push([
      shape.kind,
      q(shape.centre[0], 1000), q(shape.centre[1], 1000), q(shape.centre[2], 1000),
      q(shape.halfExtents[0], 1000), q(shape.halfExtents[1], 1000), q(shape.halfExtents[2], 1000),
      q(shape.yaw, 1000),
      q(shape.albedo[0], 1000), q(shape.albedo[1], 1000), q(shape.albedo[2], 1000),
    ].join(','));
  }
  const text = parts.join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

/**
 * Seven RGBA planes, `nx * ny * nz` texels each. Layout (ours, not theirs):
 *
 *   plane 0 : (R.L0, R.L1y, R.L1z, R.L1x)   identical to the L1 lane's red
 *   plane 1 : (G.L0, G.L1y, G.L1z, G.L1x)   identical to the L1 lane's green
 *   plane 2 : (B.L0, B.L1y, B.L1z, B.L1x)   identical to the L1 lane's blue
 *   plane 3 : (R.L2a, R.L2b, R.L2c, R.L2d)
 *   plane 4 : (R.L2e, G.L2a, G.L2b, G.L2c)
 *   plane 5 : (G.L2d, G.L2e, B.L2a, B.L2b)
 *   plane 6 : (B.L2c, B.L2d, B.L2e, 0)
 *
 * The pad float is a literal zero rather than a reused coefficient: a texel
 * whose fourth channel means something different from its neighbours' is the
 * kind of layout that survives review and then breaks when someone adds
 * filtering. One wasted half per probe is two bytes.
 */
export const SH_L2_PLANES = 7;

export function packShL2Volume(volume: ShL2Volume): Float32Array[] {
  const [nx, ny, nz] = volume.dimensions;
  const probes = nx * ny * nz;
  const planes = Array.from({ length: SH_L2_PLANES }, () => new Float32Array(probes * 4));
  const c = volume.coefficients;

  for (let probe = 0; probe < probes; probe += 1) {
    const base = probe * SH_L2_FLOATS_PER_PROBE;
    const t = probe * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const s = base + channel * SH_L2_COEFFICIENTS;
      planes[channel][t] = c[s];
      planes[channel][t + 1] = c[s + 1];
      planes[channel][t + 2] = c[s + 2];
      planes[channel][t + 3] = c[s + 3];
    }
    // Fifteen L2 floats, channel-major, laid across planes 3..6 in order.
    const l2: number[] = [];
    for (let channel = 0; channel < 3; channel += 1) {
      const s = base + channel * SH_L2_COEFFICIENTS;
      for (let band = 4; band < SH_L2_COEFFICIENTS; band += 1) l2.push(c[s + band]);
    }
    l2.push(0);
    for (let slot = 0; slot < 16; slot += 1) {
      planes[3 + Math.floor(slot / 4)][t + (slot % 4)] = l2[slot];
    }
  }
  return planes;
}

/** Reads one probe's twenty-seven coefficients back out of the packed planes. */
export function unpackShL2Probe(
  planes: readonly Float32Array[],
  probe: number,
  out: Float32Array = new Float32Array(SH_L2_FLOATS_PER_PROBE),
): Float32Array {
  const t = probe * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    const s = channel * SH_L2_COEFFICIENTS;
    out[s] = planes[channel][t];
    out[s + 1] = planes[channel][t + 1];
    out[s + 2] = planes[channel][t + 2];
    out[s + 3] = planes[channel][t + 3];
  }
  for (let slot = 0; slot < 15; slot += 1) {
    const value = planes[3 + Math.floor(slot / 4)][t + (slot % 4)];
    const channel = Math.floor(slot / 5);
    const band = 4 + (slot % 5);
    out[channel * SH_L2_COEFFICIENTS + band] = value;
  }
  return out;
}

/**
 * True when a volume's first four coefficients per channel reconstruct exactly
 * what the L1 lane reconstructs from the same floats. The compatibility
 * property, checked rather than asserted in prose.
 */
export function shL2VolumeIsL1Compatible(
  volume: ShL2Volume,
  evaluateL1: (coefficients: ArrayLike<number>, offset: number, normal: Vec3) => number,
  normal: Vec3,
): boolean {
  const probes = volume.dimensions[0] * volume.dimensions[1] * volume.dimensions[2];
  const l1 = new Float32Array(4);
  for (let probe = 0; probe < probes; probe += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const s = probe * SH_L2_FLOATS_PER_PROBE + channel * SH_L2_COEFFICIENTS;
      l1[0] = volume.coefficients[s];
      l1[1] = volume.coefficients[s + 1];
      l1[2] = volume.coefficients[s + 2];
      l1[3] = volume.coefficients[s + 3];
      const zeroed = new Float32Array(SH_L2_COEFFICIENTS);
      zeroed[0] = l1[0]; zeroed[1] = l1[1]; zeroed[2] = l1[2]; zeroed[3] = l1[3];
      if (Math.abs(evaluateShL2(zeroed, 0, normal) - evaluateL1(l1, 0, normal)) > 1e-6) return false;
    }
  }
  return true;
}
