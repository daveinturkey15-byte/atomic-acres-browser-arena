/**
 * water-authoring.ts — per-arena water body registry.
 *
 * HF-358: water was hard-gated to rustworks-1v1 across two hand-synchronized
 * presentations. This registry is the one authored source for where water
 * exists, at what level, and whether it is swimmable. Arena configure paths
 * (WaterSystem for the WebGL2 compat route, ocean-tsl for WebGPU) consume it.
 *
 * Authority notes:
 * - `level`, `swimmable` and `amplitudeScale` are host-authoritative gameplay
 *   constants: they gate buoyancy/swim outcomes and must never vary by render
 *   profile or peer. amplitudeScale is deliberately a single number, not a
 *   per-profile record.
 * - Island half-extents are authoritative water-mask inputs. Keeping them here
 *   prevents broad gameplay bounds from cutting rectangular holes in the sea.
 */

import type { ArenaId } from '../map-selection';

export type WaterArenaId = ArenaId;

/**
 * Water optics (HF-420). A water type is a per-channel EXTINCTION vector in
 * 1/metre plus the default depth of its column, and it is the only thing that
 * distinguishes a lagoon from a pond in this module.
 *
 * These are seeded from published oceanography (the Jerlov oceanic/coastal
 * classes) rather than art-directed: clear water absorbs red first and blue
 * last, humic/silty pond water absorbs BOTH red and blue and transmits green,
 * which is why a pond reads green-brown and an atoll reads cyan without a
 * second authored palette. No number here is copied from any product.
 *
 * A body with NO waterType keeps the legacy mix(deep, shallow) palette lerp,
 * so the colour model reverts per body by deleting one field.
 */
export type WaterTypeId = 'clear-lagoon' | 'open-ocean' | 'storm-ocean' | 'murky-pond';

export type WaterOptics = Readonly<{
  /** Per-channel extinction sigma (1/m). Red largest in clear water. */
  extinction: Readonly<{ r: number; g: number; b: number }>;
  /** Water-column depth (m) reached at open water when a body authors none. */
  defaultDepth: number;
  /**
   * Broadband bubble backscatter strength at full crest energy. Spectrally
   * FLAT by construction (one scalar, not a colour): the green shift is
   * produced by the absorption integral acting on it, never by this number.
   */
  backscatter: number;
}>;

export const WATER_TYPES: Readonly<Record<WaterTypeId, WaterOptics>> = Object.freeze({
  // Jerlov oceanic I-II: red gone within ~2 m, blue carries tens of metres.
  'clear-lagoon': Object.freeze({
    extinction: Object.freeze({ r: 0.40, g: 0.075, b: 0.035 }),
    defaultDepth: 6,
    backscatter: 0.55,
  }),
  // Jerlov oceanic III / coastal 1: slightly more yellow substance.
  'open-ocean': Object.freeze({
    extinction: Object.freeze({ r: 0.45, g: 0.095, b: 0.055 }),
    defaultDepth: 12,
    backscatter: 0.60,
  }),
  // Coastal 5-9 under a night sky: turbid, short paths in every channel.
  'storm-ocean': Object.freeze({
    extinction: Object.freeze({ r: 0.62, g: 0.30, b: 0.22 }),
    defaultDepth: 14,
    backscatter: 0.72,
  }),
  // Humic/algal pond: blue AND red absorbed hard, green survives.
  'murky-pond': Object.freeze({
    extinction: Object.freeze({ r: 1.50, g: 0.80, b: 2.00 }),
    defaultDepth: 0.35,
    backscatter: 0.40,
  }),
});

/**
 * A finite, centred water surface. Absent on the three perimeter oceans, which
 * keep the historical square near-plane centred on the arena origin plus the
 * curved horizon skirt. Present on every pool and pond: a pond is the SAME
 * module with different data and no new shader code.
 */
export type WaterSurfaceShape = Readonly<{
  centerX: number;
  centerZ: number;
  /** Full extents (metres) along world X and Z. */
  sizeX: number;
  sizeZ: number;
  /** Shore band (metres, inward from the rectangle edge) the depth ramps over. */
  shoreBand: number;
}>;

export type WaterBodyDefinition = Readonly<{
  arenaId: WaterArenaId;
  /** Rendering owner while retained arena-specific oceans are migrated. */
  presentationOwner: 'shared-ocean' | 'arena-builder';
  /** Whether the ocean shader removes an authored rectangular dry footprint. */
  dryFootprintMask: 'rectangular' | 'none';
  /** World Y of the mean water surface. */
  level: number;
  /**
   * True when the body is traversable swim water (HF-358 swim state). False
   * keeps the legacy float-zone behaviour (out-of-bounds soft float, e.g. the
   * rustworks ocean 19.5 m below the rig deck).
   */
  swimmable: boolean;
  /**
   * Host-authoritative multiplier applied to the shared reference amplitude
   * for this body. Profile-invariant by construction (a single number).
   */
  amplitudeScale: number;
  /** Authored dry-land footprint half extents (Chebyshev, metres). */
  island: Readonly<{ halfX: number; halfZ: number }>;
  /**
   * Shore band in Chebyshev distance from arena origin: foam/shallow-colour
   * ramps run between innerRadius (shoreline) and outerRadius (open water).
   */
  shore: Readonly<{ innerRadius: number; outerRadius: number }>;
  /** Dense displaced near-plane size (metres). */
  nearSize: number;
  /** Cheap far-water skirt radius (metres). */
  horizonRadius: number;
  night: boolean;
  /** WebGPU/TSL presentation palette (hex). */
  palette: Readonly<{ deep: number; shallow: number; foam: number }>;
  /** Legacy GLSL palette, retained separately when its accepted grade differs. */
  legacyPalette: Readonly<{ deep: number; shallow: number; foam: number }>;
  /**
   * HF-420 physical colour. When present the surface colour is
   * exp(-sigma * pathLength) over the authored water column instead of the
   * palette lerp; when absent the body keeps its accepted palette grade
   * byte-for-byte. Presentation only — nothing here reaches sampleOcean().
   */
  waterType?: WaterTypeId;
  /** Water-column depth (m) at open water. Defaults to the water type's. */
  opticalDepth?: number;
  /** Finite centred surface (pools and ponds). Absent = square near plane at origin. */
  shape?: WaterSurfaceShape;
  /** Distinct id when an arena owns more than one body. Defaults to arenaId. */
  bodyId?: string;
}>;

const RUSTWORKS_WATER: WaterBodyDefinition = Object.freeze({
  arenaId: 'rustworks-1v1' as const,
  presentationOwner: 'shared-ocean',
  dryFootprintMask: 'rectangular',
  // Deep ocean well below the raised oil-rig deck; unchanged from the
  // pre-HF-358 behaviour (non-swim float zone at y = -19.5).
  level: -19.5,
  swimmable: false,
  amplitudeScale: 1,
  island: Object.freeze({ halfX: 27, halfZ: 29 }),
  shore: Object.freeze({ innerRadius: 27.8, outerRadius: 78 }),
  nearSize: 960,
  horizonRadius: 3_200,
  night: true,
  palette: Object.freeze({ deep: 0x071b2b, shallow: 0x165b71, foam: 0x68b9c9 }),
  legacyPalette: Object.freeze({ deep: 0x020814, shallow: 0x0a2a44, foam: 0x7ec8e8 }),
  // Turbid coastal water under a night sky; the storm spectrum is the only
  // body in the game whose slope reaches the foam/backscatter gate.
  waterType: 'storm-ocean',
  opticalDepth: 14,
});

export const FARCRYSIS_WATER: WaterBodyDefinition = Object.freeze({
  arenaId: 'farcrysis' as const,
  // The retained Pass 69 terrain builder still owns this surface. Recording
  // that exception prevents the shared runtime from drawing a duplicate sea.
  presentationOwner: 'arena-builder',
  dryFootprintMask: 'rectangular',
  // HF-359 island ocean: palette/shore ramp were read from the restored
  // farcrysis terrain module (shore factor ramp (chebyshev - 15) / 22). That
  // module has since been deleted as dead code - the live arena builds its
  // terrain inline - so these values are now the authority for them rather
  // than a copy of it. Owner scope makes this the first swimmable body.
  // amplitudeScale keeps the tropical shore calm relative to the rustworks
  // storm spectrum.
  //
  // HF-360: level corrected from -0.3 to -0.25. The -0.3 figure was read
  // from the DELETED terrain module; the live arena's authored waterline is
  // the 76 m lagoon plane at y = -0.25 (farcrysis.ts), with the deep plane
  // 30 mm below and the shallow lens/wave FX 10-30 mm above purely as
  // z-fighting offsets. One level now drives both gameplay (swim depth,
  // buoyancy) and every visual plane, instead of gameplay water floating
  // 50 mm below the sea a player can actually see.
  level: -0.25,
  swimmable: true,
  amplitudeScale: 0.2,
  // Dry-land footprint gate for samplePhysics buoyancy and the float-zone
  // (consumers test (half + 0.8) * 0.98 Chebyshev). The pre-HF-396 figure of
  // 32 flagged the entire outer jungle band of the now-128 m island as open
  // ocean: a PRONE player on dry sand there (eye ~1.06 m above the surface)
  // cleared water-system's depth > -1.2 gate and took ~12.6 m/s^2 of ocean
  // buoyancy on dry ground. Derived from the shore profile instead of the
  // arena bounds: the descending shelf envelope crosses the waterline at
  // ARENA_HALF - descentStartDist + (joinHeight - level) / shelfSlope
  // = 64 - 10 + (0.2 - (-0.25)) / 0.38 = 55.18 m, and (55.5 + 0.8) * 0.98
  // = 55.17 m puts the physics gate on the authored waterline itself.
  // Pinned against the live terrain authority in water-authoring.test.ts.
  island: Object.freeze({ halfX: 55.5, halfZ: 55.5 }),
  shore: Object.freeze({ innerRadius: 15, outerRadius: 37 }),
  nearSize: 76,
  horizonRadius: 1_400,
  night: false,
  palette: Object.freeze({ deep: 0x0d4a5c, shallow: 0x19a3a8, foam: 0xfffef9 }),
  legacyPalette: Object.freeze({ deep: 0x0d4a5c, shallow: 0x19a3a8, foam: 0xfffef9 }),
  // Tropical lagoon over pale sand: red is gone within ~2 m, so the shelf
  // reads shallow from the depth ramp instead of from a second palette.
  waterType: 'clear-lagoon',
  opticalDepth: 5,
});

const HIGH_SEAS_WATER: WaterBodyDefinition = Object.freeze({
  arenaId: 'high-seas' as const,
  presentationOwner: 'shared-ocean',
  // The closed tapered hull crosses this plane; no rectangular cut-out is
  // allowed because it would expose dry wedges around the bow and stern.
  dryFootprintMask: 'none',
  level: -2.2,
  swimmable: false,
  // Five spectral weights sum to 1.525, so 1.55 * 1.525 * 0.15 gives a
  // theoretical +/-0.3546 m envelope around the authored mean waterline.
  amplitudeScale: 0.15,
  island: Object.freeze({ halfX: 12, halfZ: 44 }),
  shore: Object.freeze({ innerRadius: 44, outerRadius: 94 }),
  nearSize: 960,
  horizonRadius: 3_200,
  night: false,
  palette: Object.freeze({ deep: 0x063650, shallow: 0x177d95, foam: 0xe7fbff }),
  legacyPalette: Object.freeze({ deep: 0x063650, shallow: 0x177d95, foam: 0xe7fbff }),
  waterType: 'open-ocean',
  opticalDepth: 12,
});

/** Every authored water body, keyed by arena. Arenas absent here have none. */
/**
 * HF-358 audit history: farcrysis was deliberately NOT registered in Pass 74.
 *
 * The arena already authors three of its own water layers at y = -0.28/-0.24/-0.22
 * (src/farcrysis-art.ts), so registering it here built a SECOND ocean 20mm below
 * the real one. Worse, its authored `amplitudeScale: 0.2` never applied: the
 * runtime unconditionally passes the RustRig storm amplitude (1.55), and the
 * consumer reads `graphics.oceanWaveAmplitude ?? default`, so the nullish
 * coalesce never fired. With band weights summing to ~1.525 that put opaque
 * ~2.36m swells cresting ~2m ABOVE a 64x64 island whose eye height is ~1.6m -
 * the map would have been unplayable on the first click.
 *
 * PASS 75 RESOLVED THIS. Registration in this map no longer implies shared-ocean
 * PRESENTATION, which is what both objections above were actually about. Pass 75
 * added `presentationOwner`, and every presentation consumer goes through
 * `sharedWaterBodyForArena` (pass64-tsl-scene.ts:518/566/688, legacy-main far-plane
 * selection) which returns null for an `arena-builder` body. So farcrysis draws no
 * second ocean while still being registered.
 *
 * Both original conditions are now met, checked rather than assumed:
 *   1. Duplication - impossible: no shared-ocean presentation path resolves farcrysis.
 *   2. amplitudeScale reaching the surface - the consumer now multiplies by
 *      `body.amplitudeScale` explicitly instead of relying on a nullish coalesce that
 *      never fired, and for farcrysis the shared ocean amplitude path does not run at
 *      all.
 *
 * Leaving it unregistered had a real cost, which is why this was changed rather than
 * left alone: `water-system.ts` (the WebGL2/CPU authority route) reads
 * `waterBodyForArena`, so an unregistered farcrysis has NO authoritative level,
 * swimmable flag or amplitudeScale on that path - the gameplay values disappear along
 * with the unwanted presentation. Those values are host-authoritative and must not
 * vary by render profile, so dropping them was the more dangerous of the two options.
 */
export const WATER_BODIES: Readonly<Partial<Record<WaterArenaId, WaterBodyDefinition>>> = Object.freeze({
  'rustworks-1v1': RUSTWORKS_WATER,
  farcrysis: FARCRYSIS_WATER,
  'high-seas': HIGH_SEAS_WATER,
});

/** Null for arenas without water — atomic-acres, gun-range, skyline-terminal. */
export function waterBodyForArena(arenaId: string): WaterBodyDefinition | null {
  return WATER_BODIES[arenaId as WaterArenaId] ?? null;
}

/** Null when an arena has no sea or deliberately retains an arena-owned surface. */
export function sharedWaterBodyForArena(arenaId: string): WaterBodyDefinition | null {
  const body = waterBodyForArena(arenaId);
  return body?.presentationOwner === 'shared-ocean' ? body : null;
}

/**
 * HF-420 pools and ponds — the roster half of "water in every level".
 *
 * WHY THIS IS A SECOND MAP AND NOT MORE ENTRIES IN WATER_BODIES.
 * `WATER_BODIES` is the HOST-AUTHORITATIVE gameplay table: `water-system.ts`
 * reads it for `level`, `swimmable` and `amplitudeScale`, and buoyancy, the
 * float zone and swim state all hang off exactly one body per arena. Ponds are
 * PRESENTATION-ONLY decorative surfaces over solid authored basins: nothing may
 * read them for submersion, buoyancy or swim, and keeping them in a separate
 * map makes that unrepresentable rather than merely undocumented. Every pool
 * here is `swimmable: false` and no consumer of `waterBodyForArena` can see it.
 *
 * A pond is the SAME module with different data: finite `shape`, near-zero
 * amplitude, murky `waterType`, `horizonRadius: 0` (no skirt). No new shader
 * file exists for any of them, which is this lane's module-design falsifier.
 */
const MAP3_BASIN_SHARED = Object.freeze({
  arenaId: 'map3' as const,
  presentationOwner: 'shared-ocean' as const,
  dryFootprintMask: 'none' as const,
  // The Water bay's basins are solid boxes whose visible top face is at
  // y = -0.05 (src/map3-arena.ts, `map3 water basin`). The surface sits 30 mm
  // above that face, under the 0.3 m kerb, so the walkway stays the contested
  // line and nothing about the bay's collision changes.
  level: -0.02,
  swimmable: false,
  // Near-still: at this amplitude the summed Gerstner slope is ~0.005, far
  // below the 0.06 foam/backscatter gate, so a Map 3 basin is EXACTLY zero
  // foam and EXACTLY zero backscatter by construction. That is the still-water
  // control this lane's backscatter proof depends on.
  amplitudeScale: 0.03,
  // Authored apparent column, not measured geometry. For humic pond water the
  // exponential has effectively saturated by ~0.3 m in every channel, so the
  // surface colour is depth-independent past that point and the opaque basin
  // floor beneath it is never seen. Recorded as authored, not as a claim about
  // the box's true thickness.
  opticalDepth: 0.3,
  waterType: 'murky-pond' as const,
  night: false,
  nearSize: 40,
  horizonRadius: 0,
  // Fallback palette only (foam colour and the one-line revert path).
  palette: Object.freeze({ deep: 0x16261c, shallow: 0x33583e, foam: 0xd8e4d2 }),
  legacyPalette: Object.freeze({ deep: 0x16261c, shallow: 0x33583e, foam: 0xd8e4d2 }),
});

/** Water bay, north basin (world x -65..-25, z 10.7..14.1), inset 0.2 m. */
const MAP3_BASIN_NORTH: WaterBodyDefinition = Object.freeze({
  ...MAP3_BASIN_SHARED,
  bodyId: 'map3-basin-north',
  island: Object.freeze({ halfX: 19.8, halfZ: 1.5 }),
  shore: Object.freeze({ innerRadius: 0, outerRadius: 0.6 }),
  shape: Object.freeze({ centerX: -45, centerZ: 12.4, sizeX: 39.6, sizeZ: 3.0, shoreBand: 0.6 }),
});

/** Water bay, south basin (world x -65..-25, z 4.9..8.3), inset 0.2 m. */
const MAP3_BASIN_SOUTH: WaterBodyDefinition = Object.freeze({
  ...MAP3_BASIN_SHARED,
  bodyId: 'map3-basin-south',
  island: Object.freeze({ halfX: 19.8, halfZ: 1.5 }),
  shore: Object.freeze({ innerRadius: 0, outerRadius: 0.6 }),
  shape: Object.freeze({ centerX: -45, centerZ: 6.6, sizeX: 39.6, sizeZ: 3.0, shoreBand: 0.6 }),
});

/** Presentation-only pools and ponds, keyed by arena. Never gameplay authority. */
export const WATER_POOLS: Readonly<Partial<Record<WaterArenaId, readonly WaterBodyDefinition[]>>> = Object.freeze({
  map3: Object.freeze([MAP3_BASIN_NORTH, MAP3_BASIN_SOUTH]),
});

/**
 * Arenas that deliberately have NO water of any kind, with the reason written
 * down. The roster test derives its list from the arena roster and treats an id
 * that is neither watered nor listed here as a FAILURE — an id silently absent
 * from a hardcoded list is the defect that lets a new arena ship dry with every
 * gate green (see water-roster.test.ts).
 */
export const WATER_ROSTER_OPT_OUTS: Readonly<Record<string, string>> = Object.freeze({
  test1: 'Test fixture, not a shippable arena.',
  test2: 'Test fixture, not a shippable arena.',
  'gun-range': 'Non-combat weapon range; an indoor lane with no exterior.',
});

/** Every pool/pond authored for an arena. Presentation only. */
export function waterPoolsForArena(arenaId: string): readonly WaterBodyDefinition[] {
  return WATER_POOLS[arenaId as WaterArenaId] ?? [];
}

/** Stable name for a body: its own id when an arena owns several. */
export function waterBodyId(body: WaterBodyDefinition): string {
  return body.bodyId ?? body.arenaId;
}

/** True when the arena has any authored water at all (sea or pool). */
export function arenaHasWater(arenaId: string): boolean {
  return waterBodyForArena(arenaId) !== null || waterPoolsForArena(arenaId).length > 0;
}
