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
 * - Island half-extents here are authored defaults. The legacy-main arena
 *   configure path still passes live arena bounds; caller-supplied extents win
 *   so existing rustworks behaviour is byte-compatible.
 */

import type { ArenaId } from '../map-selection';

/**
 * HF-359 restores the farcrysis arena from its Pass 69 branch; its ArenaId
 * lands with that lane's map-selection integration. Water authoring accepts it
 * today so the island ocean is ready for wave-2 wiring.
 */
export type WaterArenaId = ArenaId | 'farcrysis';

export type WaterBodyDefinition = Readonly<{
  arenaId: WaterArenaId;
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
}>;

const RUSTWORKS_WATER: WaterBodyDefinition = Object.freeze({
  arenaId: 'rustworks-1v1' as const,
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
});

/** Authored intent, retained deliberately unregistered - see WATER_BODIES below. */
export const FARCRYSIS_WATER: WaterBodyDefinition = Object.freeze({
  arenaId: 'farcrysis' as const,
  // HF-359 island ocean: level/palette/shore ramp read from the restored
  // farcrysis modules (buildWater in src/farcrysis-terrain.ts: water plane
  // 76 m at y = -0.3, shore factor ramp (chebyshev - 15) / 22). Owner scope
  // makes this the first swimmable body. amplitudeScale keeps the tropical
  // shore calm relative to the rustworks storm spectrum; coordinate final
  // tuning with the farcrysis lane in wave 2.
  level: -0.3,
  swimmable: true,
  amplitudeScale: 0.2,
  island: Object.freeze({ halfX: 32, halfZ: 32 }),
  shore: Object.freeze({ innerRadius: 15, outerRadius: 37 }),
  nearSize: 76,
  horizonRadius: 1_400,
  night: false,
  palette: Object.freeze({ deep: 0x0d4a5c, shallow: 0x19a3a8, foam: 0xfffef9 }),
});

/** Every authored water body, keyed by arena. Arenas absent here have none. */
/**
 * HF-358 audit correction: farcrysis is deliberately NOT registered.
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
 * FARCRYSIS_WATER is retained above as the authored intent. Re-register it only
 * once the arena's own water layers are replaced rather than duplicated, and
 * once amplitudeScale is proven to reach the surface.
 */
export const WATER_BODIES: Readonly<Partial<Record<WaterArenaId, WaterBodyDefinition>>> = Object.freeze({
  'rustworks-1v1': RUSTWORKS_WATER,
});

/** Null for arenas without water — atomic-acres, gun-range, skyline-terminal. */
export function waterBodyForArena(arenaId: string): WaterBodyDefinition | null {
  return WATER_BODIES[arenaId as WaterArenaId] ?? null;
}
