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

const FARCRYSIS_WATER: WaterBodyDefinition = Object.freeze({
  arenaId: 'farcrysis' as const,
  // The retained Pass 69 terrain builder still owns this surface. Recording
  // that exception prevents the shared runtime from drawing a duplicate sea.
  presentationOwner: 'arena-builder',
  dryFootprintMask: 'rectangular',
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
