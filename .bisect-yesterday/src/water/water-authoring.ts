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
  island: Object.freeze({ halfX: 32, halfZ: 32 }),
  shore: Object.freeze({ innerRadius: 15, outerRadius: 37 }),
  nearSize: 76,
  horizonRadius: 1_400,
  night: false,
  palette: Object.freeze({ deep: 0x0d4a5c, shallow: 0x19a3a8, foam: 0xfffef9 }),
  legacyPalette: Object.freeze({ deep: 0x0d4a5c, shallow: 0x19a3a8, foam: 0xfffef9 }),
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
