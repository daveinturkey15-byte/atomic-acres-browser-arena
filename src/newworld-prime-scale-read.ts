/**
 * newworld-prime scale-read dressing (presentation-only, additive).
 *
 * Sense-of-scale + boundary readability for the Day-1 blockout, without new
 * assets or interiors (separate calls). Reuses the bay template + run
 * generators from newworld-prime-props, the TSL-registry material ids the
 * blockout already resolves, and the GLB-dressing flag pattern from
 * newworld-prime-assets (NEWWORLD_PRIME_GLB_DRESSING_DEFAULT): every group
 * below is reversible through NEWWORLD_PRIME_SCALE_READ_DEFAULT-style flags.
 *
 * Layout authority: `atomic-acres-catalog/LAYOUT_CONTRACT.md` (read in place):
 *  fact 1 — high-desert surround, lawns ONLY inside the two fenced lots
 *            (scrub/rock ring stays on the sand, never on the lawns);
 *  fact 2 — west TEAL + east YELLOW two-storey houses (doorway dark insets +
 *            stoops + dusk window-glow cards hang off their street faces);
 *  fact 7 — front-yard concrete pads (lawn edging reuses the planter-concrete
 *            role, never a new material family);
 *  fact 9 — wooden privacy fences (closures repeat the 2.40 m bay template via
 *            newworldPrimePrivacyFenceRunParts; no new geometry families).
 *
 * Rules: presentation geometry NEVER derives collision/authority (colliders,
 * shot surfaces, spawns/nav untouched); deterministic frozen data only, never
 * Math.random; no ShaderMaterial/GLSL; original art only. World coordinates
 * below are derived from NEWWORLD_PRIME_WEST_TEAL_ORIGIN (-13.5, 1.5) and
 * NEWWORLD_PRIME_EAST_YELLOW_ORIGIN (13.5, -1.5) as restated (not imported)
 * so this module never cycles back into newworld-prime-arena.ts — the same
 * restatement precedent newworld-prime-authority.ts uses for those origins.
 */

import type { NewworldPrimeLightingVariant } from './newworld-prime-lighting';
import type { NewworldPrimePropPlacement } from './newworld-prime-props';

// ---------------------------------------------------------------------------
// Reversible dressing flags (mirrors NEWWORLD_PRIME_GLB_DRESSING_DEFAULT).
// ---------------------------------------------------------------------------

/** Per-group kill switches for the scale-read dressing. Every group on. */
export type NewworldPrimeScaleReadFlags = Readonly<{
  /** Lot-perimeter fence closures (bay template + run generators). */
  lotFences: boolean;
  /** Doorway dark-inset planes + stoops on both houses. */
  doorways: boolean;
  /** Lawn edging + sand-side scrub/rock ring clusters. */
  groundVariation: boolean;
  /** Dusk window-glow cards (emissive role, off at noon). */
  windowGlow: boolean;
}>;

export const NEWWORLD_PRIME_SCALE_READ_DEFAULT: NewworldPrimeScaleReadFlags = Object.freeze({
  lotFences: true,
  doorways: true,
  groundVariation: true,
  windowGlow: true,
});

export const NEWWORLD_PRIME_SCALE_READ_DISABLED: NewworldPrimeScaleReadFlags = Object.freeze({
  lotFences: false,
  doorways: false,
  groundVariation: false,
  windowGlow: false,
});

// ---------------------------------------------------------------------------
// (1) Lot-perimeter fence closures.
// Bay length 2.40 m (NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES); rotationY PI/2
// runs extend toward -Z, rotationY 0 runs extend toward +X (yawOffset rule).
// West lawn x[-23,-9.5] z[-16,12]; east lawn x[9.5,23] z[-12,16].
// Existing runs (props facts): fence-west (-26, 6 -> -8.4), fence-east
// (26, -8 -> -22.4). Closures below complete the perimeters and tie into
// those existing lines; street sides keep a driveway/entry gap per lot.
// ---------------------------------------------------------------------------

/** Supplementary fence runs; the assembler repeats the bay template per run. */
export const NEWWORLD_PRIME_SCALE_READ_FENCE_CLOSURES: readonly (
  NewworldPrimePropPlacement & Readonly<{ bays: number }>
)[] = Object.freeze([
  // West lot: north/south edges tie the x=-26 outer line to the street stubs.
  Object.freeze({ id: 'newworld-prime-fence-lot-west-north', x: -26, z: 12.2, rotationY: 0, bays: 7 }),
  Object.freeze({ id: 'newworld-prime-fence-lot-west-south', x: -26, z: -16.2, rotationY: 0, bays: 7 }),
  // West lot street side (x=-9.7 threads house wall -9.9 / road edge -9.5):
  // sedan driveway gap z 4..7.4 (sedan massing spans z 4.8..9.2 at x=-13.5).
  Object.freeze({ id: 'newworld-prime-fence-lot-west-street-north', x: -9.7, z: 4, rotationY: Math.PI / 2, bays: 9 }),
  Object.freeze({ id: 'newworld-prime-fence-lot-west-street-south', x: -9.7, z: 12.2, rotationY: Math.PI / 2, bays: 2 }),
  // West outer line extensions: meet fence-west (z 6 -> -8.4) both ends.
  Object.freeze({ id: 'newworld-prime-fence-lot-west-outer-north', x: -26, z: 12.2, rotationY: Math.PI / 2, bays: 3 }),
  Object.freeze({ id: 'newworld-prime-fence-lot-west-outer-south', x: -26, z: -8.4, rotationY: Math.PI / 2, bays: 4 }),
  // East lot: north/south edges tie the x=26 outer line to the street stubs.
  Object.freeze({ id: 'newworld-prime-fence-lot-east-north', x: 9.8, z: -12.2, rotationY: 0, bays: 7 }),
  Object.freeze({ id: 'newworld-prime-fence-lot-east-south', x: 9.8, z: 16.2, rotationY: 0, bays: 7 }),
  // East lot street side (x=9.8 threads house wall 9.6 / road edge 9.5):
  // entry gap z -3.5..1.8 walks to the door (door world z = 1.763).
  Object.freeze({ id: 'newworld-prime-fence-lot-east-street-north', x: 9.8, z: -3.5, rotationY: Math.PI / 2, bays: 6 }),
  Object.freeze({ id: 'newworld-prime-fence-lot-east-street-south', x: 9.8, z: 16.2, rotationY: Math.PI / 2, bays: 6 }),
  // East outer line extension: meets fence-east (z -8 -> -22.4) at its head.
  Object.freeze({ id: 'newworld-prime-fence-lot-east-outer-north', x: 26, z: 16.2, rotationY: Math.PI / 2, bays: 10 }),
]);

// ---------------------------------------------------------------------------
// Shared box descriptor (world-space, emitted via the arena centred helper).
// ---------------------------------------------------------------------------

/** One world-space presentation box the arena emits verbatim. */
export type NewworldPrimeScaleReadBox = Readonly<{
  id: string;
  role: string;
  offset: readonly [number, number, number];
  size: readonly [number, number, number];
  /** TSL-registry material id already resolved by the blockout palette. */
  materialId: string;
  rotationY?: number;
}>;

function box(
  id: string,
  role: string,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  materialId: string,
  rotationY = 0,
): NewworldPrimeScaleReadBox {
  return Object.freeze({ id, role, offset, size, materialId, rotationY });
}

// ---------------------------------------------------------------------------
// (2) Doorway depth cues (no interiors).
// West door world (origin -13.5, 1.5; leaf y 1.475, face z 4.563); east door
// world (origin 13.5, -1.5; leaf y 1.145, face z 1.763). Dark insets stand
// 12 mm proud of the opening centre behind the leaf (8 cm shadow border per
// side); stoops sit at grade past the porch front (west deck ends z=6.3) and
// the east door step (ends z=2.663).
// ---------------------------------------------------------------------------

/** Dark-inset planes + stoops for both street doors. */
export const NEWWORLD_PRIME_SCALE_READ_DOORWAYS: readonly NewworldPrimeScaleReadBox[] = Object.freeze([
  box(
    'newworld-prime-doorway-west-inset', 'doorway-inset',
    [-13.5, 1.495, 4.575], [1.11, 2.17, 0.04], 'newworld-prime-rubber-v1',
  ),
  box(
    'newworld-prime-doorway-west-stoop', 'doorway-stoop',
    [-13.5, 0.09, 6.95], [1.6, 0.18, 1.0], 'newworld-prime-concrete-pad-v1',
  ),
  box(
    'newworld-prime-doorway-east-inset', 'doorway-inset',
    [13.5, 1.165, 1.775], [1.11, 2.17, 0.04], 'newworld-prime-rubber-v1',
  ),
  box(
    'newworld-prime-doorway-east-stoop', 'doorway-stoop',
    [13.5, 0.09, 3.3], [1.6, 0.18, 1.0], 'newworld-prime-concrete-pad-v1',
  ),
]);

// ---------------------------------------------------------------------------
// (3) Ground variation: lawn edging + sand-side scrub/rock ring.
// Edging reuses the hedge-planter concrete role. The ring reuses the desert
// scrub/rock roles and size bands from buildDesertSurround (scrub 0.5-0.9 m,
// rock 0.4-1.1 m) and stays off lawns, roads, pads, reservations and the
// utility-pole march (x=+-30, z=-28/-4/20).
// ---------------------------------------------------------------------------

/** Planter-concrete lawn edging; street sides split at the driveway gaps. */
export const NEWWORLD_PRIME_SCALE_READ_EDGING: readonly NewworldPrimeScaleReadBox[] = Object.freeze([
  box('newworld-prime-edging-west-north', 'lawn-edging', [-16.25, 0.1, 12.2], [13.9, 0.14, 0.3], 'newworld-prime-planter-concrete-v1'),
  box('newworld-prime-edging-west-south', 'lawn-edging', [-16.25, 0.1, -16.2], [13.9, 0.14, 0.3], 'newworld-prime-planter-concrete-v1'),
  box('newworld-prime-edging-west-outer', 'lawn-edging', [-23.2, 0.1, -2], [0.3, 0.14, 28.7], 'newworld-prime-planter-concrete-v1'),
  box('newworld-prime-edging-west-street-north', 'lawn-edging', [-9.3, 0.1, -6], [0.3, 0.14, 20.4], 'newworld-prime-planter-concrete-v1'),
  box('newworld-prime-edging-west-street-south', 'lawn-edging', [-9.3, 0.1, 9.6], [0.3, 0.14, 5.2], 'newworld-prime-planter-concrete-v1'),
  box('newworld-prime-edging-east-north', 'lawn-edging', [16.25, 0.1, -12.2], [13.9, 0.14, 0.3], 'newworld-prime-planter-concrete-v1'),
  box('newworld-prime-edging-east-south', 'lawn-edging', [16.25, 0.1, 16.2], [13.9, 0.14, 0.3], 'newworld-prime-planter-concrete-v1'),
  box('newworld-prime-edging-east-outer', 'lawn-edging', [23.2, 0.1, 2], [0.3, 0.14, 28.7], 'newworld-prime-planter-concrete-v1'),
  box('newworld-prime-edging-east-street-north', 'lawn-edging', [9.3, 0.1, -7.75], [0.3, 0.14, 8.9], 'newworld-prime-planter-concrete-v1'),
  box('newworld-prime-edging-east-street-south', 'lawn-edging', [9.3, 0.1, 8.8], [0.3, 0.14, 14.8], 'newworld-prime-planter-concrete-v1'),
]);

/** Sand-side scrub/rock clusters ringing the lots (desert roles only). */
export const NEWWORLD_PRIME_SCALE_READ_GROUND_RING: readonly NewworldPrimeScaleReadBox[] = Object.freeze([
  box('newworld-prime-ring-scrub-00', 'desert-scrub', [-26, 0.35, 14], [0.7, 0.7, 0.7], 'newworld-prime-scrub-v1', 0.6),
  box('newworld-prime-ring-scrub-01', 'desert-scrub', [-27.5, 0.3, 0], [0.6, 0.6, 0.6], 'newworld-prime-scrub-v1', 2.1),
  box('newworld-prime-ring-scrub-02', 'desert-scrub', [-26, 0.4, -13], [0.8, 0.8, 0.8], 'newworld-prime-scrub-v1', 1.2),
  box('newworld-prime-ring-scrub-03', 'desert-scrub', [-24.5, 0.28, -19], [0.55, 0.55, 0.55], 'newworld-prime-scrub-v1', 2.8),
  box('newworld-prime-ring-scrub-04', 'desert-scrub', [-12, 0.32, -19.5], [0.65, 0.65, 0.65], 'newworld-prime-scrub-v1', 0.3),
  box('newworld-prime-ring-scrub-05', 'desert-scrub', [8, 0.38, -19.5], [0.75, 0.75, 0.75], 'newworld-prime-scrub-v1', 1.7),
  box('newworld-prime-ring-scrub-06', 'desert-scrub', [20, 0.3, -18.5], [0.6, 0.6, 0.6], 'newworld-prime-scrub-v1', 2.4),
  box('newworld-prime-ring-scrub-07', 'desert-scrub', [27, 0.42, -13], [0.85, 0.85, 0.85], 'newworld-prime-scrub-v1', 0.9),
  box('newworld-prime-ring-scrub-08', 'desert-scrub', [27.5, 0.35, 5], [0.7, 0.7, 0.7], 'newworld-prime-scrub-v1', 1.9),
  box('newworld-prime-ring-scrub-09', 'desert-scrub', [26, 0.3, 18.5], [0.6, 0.6, 0.6], 'newworld-prime-scrub-v1', 0.1),
  box('newworld-prime-ring-scrub-10', 'desert-scrub', [12, 0.4, 18.5], [0.8, 0.8, 0.8], 'newworld-prime-scrub-v1', 2.6),
  box('newworld-prime-ring-scrub-11', 'desert-scrub', [-12, 0.33, 18.5], [0.65, 0.65, 0.65], 'newworld-prime-scrub-v1', 1.4),
  box('newworld-prime-ring-rock-00', 'desert-rock', [-28, 0.24, -20], [0.8, 0.48, 0.64], 'newworld-prime-rock-v1', 0.8),
  box('newworld-prime-ring-rock-01', 'desert-rock', [-24, 0.18, 16.5], [0.6, 0.36, 0.48], 'newworld-prime-rock-v1', 2.0),
  box('newworld-prime-ring-rock-02', 'desert-rock', [24, 0.3, -20.5], [1.0, 0.6, 0.8], 'newworld-prime-rock-v1', 1.1),
  box('newworld-prime-ring-rock-03', 'desert-rock', [28.5, 0.21, 12], [0.7, 0.42, 0.56], 'newworld-prime-rock-v1', 2.9),
  box('newworld-prime-ring-rock-04', 'desert-rock', [-8, 0.15, 26], [0.5, 0.3, 0.4], 'newworld-prime-rock-v1', 0.4),
  box('newworld-prime-ring-rock-05', 'desert-rock', [10, 0.27, -26], [0.9, 0.54, 0.72], 'newworld-prime-rock-v1', 1.6),
]);

// ---------------------------------------------------------------------------
// (4) Dusk window-glow cards.
// Thin cards 20 mm proud of the south-face glass (glass front sits +38.5 mm
// off the opening centre; cards sit at +60 mm), reusing the lamp-lens role
// so the Shell TSL inventory treats them as practical-light glass. Emissive
// intensity derives from the lighting variant: off at noon.
// ---------------------------------------------------------------------------

/** South-face window glow cards for both houses (street read). */
export const NEWWORLD_PRIME_SCALE_READ_WINDOW_GLOW: readonly NewworldPrimeScaleReadBox[] = Object.freeze([
  // West teal face z=4.623 (hd 3.063 + 0.06); ground y=1.5, upper y=4.15.
  box('newworld-prime-glow-west-s0-0', 'window-glow', [-15.7, 1.5, 4.623], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
  box('newworld-prime-glow-west-s0-1', 'window-glow', [-11.3, 1.5, 4.623], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
  box('newworld-prime-glow-west-s1-0', 'window-glow', [-15.7, 4.15, 4.623], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
  box('newworld-prime-glow-west-s1-1', 'window-glow', [-13.5, 4.15, 4.623], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
  box('newworld-prime-glow-west-s1-2', 'window-glow', [-11.3, 4.15, 4.623], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
  // East yellow face z=1.823 (hd 3.263 + 0.06); ground y=1.5, upper y=4.15.
  box('newworld-prime-glow-east-s0-0', 'window-glow', [10.9, 1.5, 1.823], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
  box('newworld-prime-glow-east-s0-1', 'window-glow', [16.1, 1.5, 1.823], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
  box('newworld-prime-glow-east-s1-0', 'window-glow', [10.9, 4.15, 1.823], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
  box('newworld-prime-glow-east-s1-1', 'window-glow', [13.5, 4.15, 1.823], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
  box('newworld-prime-glow-east-s1-2', 'window-glow', [16.1, 4.15, 1.823], [0.78, 1.08, 0.02], 'newworld-prime-lamp-lens-v1'),
]);

/**
 * Emissive intensity for the shared lamp-lens role. Day variants read 0
 * (off at noon: late-morning + overcast); dusk/night variants lift the
 * cards and the street-lamp lenses together as one practical-light role.
 * Day-3 graphics: golden-dusk 1.6 -> 1.9 so the cards stay legible against
 * amber-lit siding. Emissive-only light-source role: no dark identity moves.
 */
export function newworldPrimeScaleReadGlowIntensity(variant: NewworldPrimeLightingVariant): number {
  switch (variant) {
    case 'golden-dusk': return 1.9;
    case 'night-rain': return 2.2;
    case 'dawn-mist': return 0.9;
    case 'overcast':
    case 'late-morning':
    default: return 0;
  }
}
