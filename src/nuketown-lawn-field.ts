/**
 * nuketown-lawn-field.ts — Pass 82 dense instanced lawns for Nuke Town.
 *
 * The owner's ask: "implement better grass ... in nuketown". Until this pass
 * the yards and verges were flat lawn textures on every route the owner
 * actually plays (the WebGL2-only GrassSystem never constructs on WebGPU,
 * and the 180-card 'Pass 64 TSL grass' layer both are sparse dressing, not a
 * lawn). This module grows a real field through the reusable donor
 * generalisation in src/rendering/instanced-grass-field.ts:
 *
 *   - Regions are the two manicured-verges-v4 lawn bands (grass-placement.ts)
 *     — everything between the pavement edge (|z| = 8.8, derived from
 *     STREET_HALF_WIDTH + the spec roadway kerb/sidewalk table) and the
 *     boundary fence. Asphalt, kerbs and pavements are outside the regions
 *     BY CONSTRUCTION, not by filtering.
 *   - Keep-outs: houses + garages (grass-placement's structural footprint)
 *     plus every authored yard prop with a ground-level footprint — hedges,
 *     yard fences, cover/cargo anchors, bins, mannequins, tree trunks,
 *     terminals, hydroponics beds + greenhouse, trellis and canopy columns,
 *     service-channel walls, the plinth, the irrigation vessel and the two
 *     verge mounds. The containment test (nuketown-lawn-field.test.ts)
 *     verifies this table against the REAL constructed arena's colliders so
 *     it cannot silently drift from map.ts.
 *   - Suburban preset: short kept blades (height cap 0.22 m, well under the
 *     0.25 m art-only ceiling), subtler wind than the tropical donor, and a
 *     kept-lawn tint band (cool greens, mild sun-bleach clumps).
 *
 * COMBAT SAFETY: presentation only — no colliders, no raycast surfaces, no
 * sightline-blocking height. Deterministic (fixed seed, no Math.random).
 */
import type * as THREE from 'three';
import {
  COVER_LAYOUT,
  KERB_CAR_LAYOUT,
  KERB_CAR_SIZE,
  NEIGHBOURHOOD_BIN_POSITIONS,
  NEIGHBOURHOOD_BIN_COLLIDER_SIZE,
} from './arena-layout';
import type { Box2 } from './collision';
import { GRASS_GROUND_REGIONS, GRASS_MAX_HEIGHT, grassPlacementAllowed } from './grass-placement';
import { nuketown2HandedX } from './nuketown2-layout';
import {
  buildInstancedGrassField,
  GRASS_BLADE_LEAN_MAX_DEG,
  GRASS_NEAR_BAND_DENSITY_FACTOR,
  GRASS_NEAR_BAND_RADIUS_M,
  type GrassClumpTint,
  type GrassNearBandSpec,
  type GrassRegionRect,
  type InstancedGrassField,
  type InstancedGrassFieldStats,
} from './rendering/instanced-grass-field';

/** Suburban blade cap — kept lawn, under the 0.25 m art-only ceiling. */
export const NUKETOWN_LAWN_BLADE_HEIGHT_M = GRASS_MAX_HEIGHT;
/** Fixed placement seed — identical lawn on every peer. */
export const NUKETOWN_LAWN_SEED = 0x1aa2_82f1;
/**
 * Keep-out inflation for the rebuild's collider-driven placement, in metres.
 * The same 0.34 m `COLLIDER_MARGIN` grass-placement.ts applies to the shipped
 * map's colliders — blades must not grow flush against a wall face or they
 * z-fight the wall's own base edge. The extra 20 mm over the shared donor
 * margin also covers float32 instance-matrix quantisation at a boundary.
 */
export const NUKETOWN_LAWN_KEEPOUT_MARGIN_M = 0.36;

const rect = (cx: number, cz: number, sizeX: number, sizeZ: number): Box2 => ({
  minX: cx - sizeX / 2,
  maxX: cx + sizeX / 2,
  minZ: cz - sizeZ / 2,
  maxZ: cz + sizeZ / 2,
});

/**
 * Ground-level keep-out footprints inside the lawn bands. Everything that can
 * be derived from the shared layout authority IS derived from it; the rest is
 * mirrored from map.ts / environment-assets.ts authored positions with the
 * provenance noted, and the containment test pins the whole table against the
 * real constructed arena colliders so drift goes red instead of unnoticed.
 */
export const NUKETOWN_LAWN_KEEPOUTS: readonly Box2[] = Object.freeze((() => {
  const boxes: Box2[] = [];

  // --- Derived from arena-layout (moves automatically with the layout) ---
  for (const [x, z, width, depth] of COVER_LAYOUT) boxes.push(rect(x, z, width, depth));
  for (const car of KERB_CAR_LAYOUT) boxes.push(rect(car.x, car.z, KERB_CAR_SIZE[0], KERB_CAR_SIZE[2]));
  for (const [x, z] of NEIGHBOURHOOD_BIN_POSITIONS) {
    boxes.push(rect(x, z, NEIGHBOURHOOD_BIN_COLLIDER_SIZE[0], NEIGHBOURHOOD_BIN_COLLIDER_SIZE[2]));
  }

  // --- Mirrored from map.ts authored props (provenance: buildArena) ---
  // v3 (owner HITL): fences, hedges, garden cover, dividers and mannequins
  // are DELETED; the survivors are trees, planters, mounds and lamps.
  for (const [x, z, scale] of [
    [-9, -28.5, 1], [9, 28.5, 1], [-33.5, -26, 0.9], [33.5, 26, 0.9],
    [-13, 27.5, 0.85], [13, -27.5, 0.85], [-34.5, 10, 0.9], [34.5, -10, 0.9],
  ] as const) boxes.push(rect(x, z, 0.68 * scale, 0.68 * scale));
  for (const [x, z] of [[-16, -28.5], [16, 28.5]] as const) boxes.push(rect(x, z, 2.2, 1.05));
  for (const [x, z] of [[-18, -16], [18, 16], [-26, -2], [26, 2]] as const) boxes.push(rect(x, z, 0.15, 0.15));
  for (const [x, z] of [[-30, -8], [30, 8]] as const) boxes.push(rect(x, z, 0.3, 0.3));
  boxes.push(rect(-36.2, -28.8, 1.6, 2.2));
  boxes.push(rect(36.2, 28.8, 1.6, 2.2));

  return boxes.map((box) => Object.freeze(box));
})());

/**
 * The lawn-field placement truth: inside a v4 lawn band, outside every
 * structure footprint and authored prop keep-out. Composition of the shared
 * grass-placement authority (regions + houses/garages + expanded collider
 * rejection) with the Nuke Town prop table above.
 */
export function nuketownLawnPlacementAllowed(x: number, z: number): boolean {
  return grassPlacementAllowed(x, z, NUKETOWN_LAWN_KEEPOUTS);
}

/**
 * Kept-lawn tint: cool suburban greens with mild sun-bleached clumping.
 *
 * v2 2026-08-31 (zero-cost re-key, owner "grass ... still feel poor"). The
 * measured problem in the evidence frames was not density - 24,732 tufts is a
 * real field - it was VALUE SEPARATION: the blades were keyed brighter and
 * yellower than the lawn plate they stand on, so they read as pale spikes
 * scattered ON the ground instead of grass growing OUT of it, and every blade
 * silhouetted individually. Pulling the base value down and the warm
 * sun-bleach back seats them into the plate. Costs nothing: same tuft count,
 * same draws, same triangles - only the instance tint constants moved.
 *
 * v3 2026-09-06 (HF-536 forge-nature PASS 1). Late-summer verge warmth: the
 * sun-bleach clumps swing a little further warm (rWarm 0.18 -> 0.22, gWarm
 * 0.09 -> 0.10, bWarm -0.09 -> -0.11, visual-a's measured values) so the kept
 * turf carries a dry August cast on its lit patches instead of one flat cool
 * green. BASE values are untouched, so the unlit/shaded turf hue does not move
 * - which is what the pass's T4 "lawn hue unchanged" box measures. This is
 * instance-colour data only: no material, no uniform, no graph (R2).
 *
 * Gotcha "material.color tint cannot lighten" applies to the whole family:
 * these are multipliers over the blade material's 0x5e9e41 base, capped at
 * white, so a warm tint can only ever REMOVE green - never add brightness.
 * `grassClumpTintPeak(...) <= 1` in the lane test is the arithmetic guard.
 */
export const NUKETOWN_LAWN_TINT: GrassClumpTint = Object.freeze({
  rBase: 0.63, rWarm: 0.22,
  gBase: 0.88, gWarm: 0.10,
  bBase: 0.5, bWarm: -0.11,
  valueBase: 0.855, valuePatch: 0.06, valueJitter: 0.045,
});

export type NuketownVergeBloomStats = InstancedGrassFieldStats;

/**
 * Late-summer verge bloom tint: dry August tufts and pale yellow/white blooms
 * scattered along the beyond-fence verges (HF-536).
 */
export const NUKETOWN_VERGE_BLOOM_TINT: GrassClumpTint = Object.freeze({
  rBase: 0.86, rWarm: 0.10,
  gBase: 0.72, gWarm: 0.06,
  bBase: 0.22, bWarm: -0.05,
  valueBase: 0.9, valuePatch: 0.04, valueJitter: 0.05,
});

/** Verge bloom blade height — matching kept height under the 0.25 m art-only ceiling. */
export const NUKETOWN_VERGE_BLOOM_BLADE_HEIGHT_M = 0.22;
/** Verge bloom placement seed — decorrelated from the lawn stream. */
export const NUKETOWN_VERGE_BLOOM_SEED = NUKETOWN_LAWN_SEED ^ 0xb100;

/**
 * Beyond-fence verge strip regions: |x| in 18..24 or |z| in 36..42.
 * Four boundary rectangles covering the perimeter strips outside the fence.
 */
export const NUKETOWN_VERGE_BLOOM_REGIONS: readonly GrassRegionRect[] = Object.freeze([
  // West verge strip: |x| in 18..24
  Object.freeze({ minX: -24, maxX: -18, minZ: -42, maxZ: 42 }),
  // East verge strip: |x| in 18..24
  Object.freeze({ minX: 18, maxX: 24, minZ: -42, maxZ: 42 }),
  // North verge strip: |z| in 36..42
  Object.freeze({ minX: -18, maxX: 18, minZ: -42, maxZ: -36 }),
  // South verge strip: |z| in 36..42
  Object.freeze({ minX: -18, maxX: 18, minZ: 36, maxZ: 42 }),
]);

/**
 * Build the Nuke Town verge bloom field under `parent`. Deterministic,
 * presentation only; <= 600 instances, <= 4 draws. Places sparse yellow/white
 * blooms and dry tufts on the beyond-fence verge strips only (|x| in 18..24 or
 * |z| in 36..42, clipped by `nuketownLawnPlacementAllowed`).
 *
 * It gets its own material (MeshStandardNodeMaterial, allowed under Amendment B;
 * adds no texture sampler).
 */
export function buildNuketownVergeBloomField(
  parent: THREE.Object3D,
  _reduced = false,
): InstancedGrassField {
  const field = buildInstancedGrassField({
    name: 'nuketown-verge-bloom',
    seed: NUKETOWN_VERGE_BLOOM_SEED,
    regions: NUKETOWN_VERGE_BLOOM_REGIONS,
    cellSizeM: 2.4,
    bladeHeightM: NUKETOWN_VERGE_BLOOM_BLADE_HEIGHT_M,
    bladeWidthM: 0.062,
    bladeBendM: 0.055,
    bladesPerTuft: 3,
    scaleRange: [0.68, 1.0],
    placementAllowed: nuketownLawnPlacementAllowed,
    material: {
      color: 0x5e9e41,
      roughness: 0.89,
      metalness: 0.02,
      swayAmount: 0.045,
      windSpeed: 0.8,
      sssColor: 0xa4cb55,
      sssStrength: 0.29,
      rootShade: [0.56, 0.65, 0.5],
    },
    tint: NUKETOWN_VERGE_BLOOM_TINT,
  });
  parent.add(field.group);
  return field;
}

/**
 * Build the Nuke Town lawn field under `parent`. Deterministic, presentation
 * only; two lawn bands = two instanced draws. `reduced` widens the placement
 * cell for the reduced-world-detail route (fewer blades, same coverage).
 */
export function buildNuketownLawnField(parent: THREE.Object3D, reduced: boolean): InstancedGrassField {
  // The WebGL2 compat route renders the field without the TSL wind graph and
  // pays pure fill-rate for every blade; measured 2026-08-29 (p95 22.3 ms ->
  // 27.7 ms at full tuft density on that route), so it takes a middle tier:
  // still 2-blade tufts (denser than the old single blades), wider cells.
  const compatRoute = typeof document !== 'undefined'
    && document.documentElement?.dataset.renderBackend === 'webgl2';
  const field = buildInstancedGrassField({
    name: 'nuketown-lawn',
    seed: NUKETOWN_LAWN_SEED,
    regions: GRASS_GROUND_REGIONS,
    cellSizeM: reduced ? 0.5 : compatRoute ? 0.36 : 0.3,
    bladeHeightM: NUKETOWN_LAWN_BLADE_HEIGHT_M,
    bladeWidthM: 0.062,
    bladeBendM: 0.055,
    // Owner 2026-08-29: lawns must read like the shared showcase grass, not
    // sparse lone blades - 3-blade merged tufts triple density per instance.
    bladesPerTuft: reduced || compatRoute ? 2 : 3,
    scaleRange: [0.68, 1.0],
    placementAllowed: nuketownLawnPlacementAllowed,
    material: {
      // v2 2026-08-31: deeper blade green and a darker root so a tuft reads as
      // one clump of grass rather than a fan of individually-lit spikes.
      color: 0x5e9e41,
      roughness: 0.89,
      metalness: 0.02,
      swayAmount: 0.045,
      windSpeed: 0.8,
      sssColor: 0xa4cb55,
      sssStrength: 0.29,
      // Kept lawn, not jungle floor - but the old root shade was so light the
      // blade base was brighter than the plate behind it, which is what made
      // the field read as stubble sitting on top of the lawn. A first cut at
      // 0.46/0.56/0.42 with valueBase 0.80 over-corrected - it came back dry
      // and olive rather than kept - so this lands between the two.
      rootShade: [0.56, 0.65, 0.5],
    },
    tint: NUKETOWN_LAWN_TINT,
  });
  parent.add(field.group);
  buildNuketownVergeBloomField(parent, reduced);
  return field;
}

// ---------------------------------------------------------------------------
// NUKETOWN2 (HF-426 Job 3) - the same lawn on the rebuilt map
// ---------------------------------------------------------------------------

/**
 * One of the rebuild's plan rectangles. Structural, not an import: this module
 * must not import `nuketown2-arena.ts`, which imports this one back.
 * `NUKETOWN2_GROUND_DRESSING` satisfies it exactly, and the CALLER passes it -
 * so the lawn's extents are the arena's own authored extents rather than a
 * second copy of them that can silently drift. Re-typing those numbers here is
 * precisely the failure that put 38 m2 of lawn inside each house's front room
 * on an early cut of the layout (see the export's own comment in the arena).
 */
export type NuketownGroundDressingPiece = Readonly<{
  id: string;
  material: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /**
   * HF-477. Default true: the arena emits the piece through its own `pair()`,
   * so the lawn field owes it a 180-degree partner region. `false` means the
   * arena authored the piece ONCE - the rebuilt front verge is tiled per
   * z-side because the lollipop cul-de-sac is not a rotational pair of itself -
   * and inventing a partner here would grow grass across the carriageway.
   */
  paired?: boolean;
}>;

export type NuketownLawnKeepOutCircle = Readonly<{
  centreX: number;
  centreZ: number;
  radius: number;
}>;

// ---------------------------------------------------------------------------
// HF-536 look-2b: dry-grass variety and a clover/flower layer (nuketown2 only)
// ---------------------------------------------------------------------------

/**
 * THE DRY-GRASS BASE COLOUR, and why the base had to move at all.
 *
 * The critic's gap #4 on the interim-2 build is that the verges and lawns "are
 * uniform green strips". The instance tint is the right place to break that
 * up - it costs no draw, no triangle and no pipeline - EXCEPT that
 * `material.color` MULTIPLIES and is capped at white (this machine's memory
 * "three.js tint cannot lighten"). A straw patch is BRIGHTER and REDDER than
 * kept turf, so from the old 0x5e9e41 green base the only "dry" a tint can
 * reach is a darker olive, which reads as shadow, not as dry grass. That is
 * exactly the impossible tint-only system the memory records.
 *
 * So the base moves to the DRY tone and the green tint pulls it back down.
 * The remap is EXACT, not approximate: every green coefficient below is the
 * old coefficient multiplied by linear(0x5e9e41)/linear(0xc5aa5b) per channel,
 * so `linear(base) * tint` for a green blade is bit-for-bit what it was
 * before this pass. `nuketown-lawn-field.test.ts` asserts that composition
 * against the OLD constants rather than trusting this comment.
 *
 * Measured composed results (linear -> sRGB 0-255), at value 0.855:
 *   green blade        (75, 142, 39)   - unchanged from the pre-pass lawn
 *   full dry (weight 1) (184, 158, 84)  - reachable, but not used
 *   shipped patch (0.35) (127, 148, 59) - what a dry spot actually renders as
 */
export const NUKETOWN2_LAWN_BASE_COLOR = 0xc5aa5b;

/**
 * Late-summer kept turf with metre-scale dry spots. HF-536 muse-lawn: the green
 * half moves from lime (composed hue 99.0 sat 72.5% at value 0.855) to the boards
 * olive (composed sRGB ~(103, 101, 57), hue ~57 sat ~45% across warm 0..1:
 * (98, 95, 59) / (103, 101, 57) / (108, 106, 55) - measured against interim-4
 * boards bedGround hue 61.3 sat 63.5%, surroundGround hue 68.5 sat 69.4%).
 * Base stays the dry tone 0xc5aa5b so the straw pole remains reachable; only the
 * green pull-down coefficients move. `patchM`/`coverage`/weight keep look-2b's
 * field period and phase, so plate and blades still go dry in the same places.
 */
export const NUKETOWN2_LAWN_TINT: GrassClumpTint = Object.freeze({
  rBase: 0.254, rWarm: 0.060,
  gBase: 0.336, gWarm: 0.085,
  bBase: 0.485, bWarm: -0.055,
  valueBase: 0.855, valuePatch: 0.06, valueJitter: 0.045,
  dry: Object.freeze({
    rDry: 0.999, gDry: 0.997, bDry: 0.995,
    weight: 0.35,
    patchM: 4.5,
    coverage: 0.34,
  }),
});
/**
 * HF-536 muse-lawn2 blade read — the authored numbers behind the contrast.
 *
 * BASE/TIP: blade-root composed luma 0.55x the plate, tip 1.35x (the tip
 * catches the sun). The root shade below is the per-channel multiplier whose
 * composed luma lands the 0.55 ratio against the 0x646536 plate; the tip tint
 * lives in instanced-grass-field.ts (GRASS_BLADE_TIP_TINT) with the 20 %
 * sun-catch hash. Pinned in src/nuketown2-lawn-blades.test.ts.
 */
export const NUKETOWN2_LAWN_ROOT_SHADE: readonly [number, number, number] = Object.freeze([0.485, 0.562, 0.427]);
/**
 * Height jitter 0.7x–1.4x: per-instance scale in [0.7, 1.0] against the
 * 0.22 m authored geometry, so the shortest tuft is 0.7x nominal and the
 * tallest (1.0 / 0.7 = 1.43x the shortest) never clears the art-only cap.
 * The max stays clamped to 1.0 by construction in the field builder.
 */
export const NUKETOWN2_LAWN_SCALE_RANGE: readonly [number, number] = Object.freeze([0.7, 1.0]);
/**
 * Near-band density x1.6 within 4 m of the review-close camera footprints:
 * the five ground-level yard stations' eyes and targets (authored coords put
 * through the handedness mirror at build time, so a map mirror carries the
 * band with the cameras). The overhead is aerial, not near turf, by design.
 */
export function nuketown2LawnNearBandPoints(): Array<readonly [number, number]> {
  const authored: Array<readonly [number, number]> = [
    [-12, -31], [-1.25, -21.5],
    [12, 31], [1.25, 21.5],
    [-5.4, -29.1], [-2.0, -33.2],
    [12.0, -29.4], [8.6, -33.6],
    [17.3, -22.5], [14.2, -25.6],
  ];
  return authored.map(([x, z]) => [nuketown2HandedX(x), z] as const);
}
export const NUKETOWN2_LAWN_NEAR_BAND_RADIUS_M = GRASS_NEAR_BAND_RADIUS_M;
export const NUKETOWN2_LAWN_NEAR_BAND_DENSITY = GRASS_NEAR_BAND_DENSITY_FACTOR;
export function nuketown2LawnNearBand(): GrassNearBandSpec {
  return {
    points: nuketown2LawnNearBandPoints(),
    radiusM: NUKETOWN2_LAWN_NEAR_BAND_RADIUS_M,
    densityFactor: NUKETOWN2_LAWN_NEAR_BAND_DENSITY,
  };
}

/** Clover/flower tuft cap - the brief's ceiling, enforced by construction. */
export const NUKETOWN2_CLOVER_BUDGET = 400;
/** Clover placement cell, sized so the rebuild's lawn area lands under the cap. */
export const NUKETOWN2_CLOVER_CELL_M = 1.95;
/** Clover seed - its own stream, decorrelated from the lawn and the bloom. */
export const NUKETOWN2_CLOVER_SEED = NUKETOWN_LAWN_SEED ^ 0x0c10_7e12;
/** Clover leaf height - a third of a blade, so it never reads as tall grass. */
export const NUKETOWN2_CLOVER_HEIGHT_M = 0.105;
/**
 * Pale bloom base. Same trick as the lawn: the BASE is the brightest tone the
 * layer must reach (the cream flower head) and the tint pulls the majority of
 * tufts down to clover green, so ONE field carries TWO plant tints without a
 * second material, a second pipeline or a second sampler.
 */
export const NUKETOWN2_CLOVER_BASE_COLOR = 0xf6f2b3;

/**
 * Clover-and-flower tint. Composed results at value 0.86:
 *   clover leaf  (69, 112, 54)  - cooler and darker than the lawn's green
 *   flower head  (230, 226, 167) - the pale cream bloom
 * The bloom is the `dry` pole at weight 1: patches ARE the flower clusters,
 * which is how clover actually grows (heads in clumps, leaf everywhere else).
 */
export const NUKETOWN2_CLOVER_TINT: GrassClumpTint = Object.freeze({
  rBase: 0.074762, rWarm: 0,
  gBase: 0.212997, gWarm: 0,
  bBase: 0.093652, bWarm: 0,
  valueBase: 0.86, valuePatch: 0.03, valueJitter: 0.04,
  dry: Object.freeze({
    rDry: 0.999, gDry: 0.999, bDry: 0.999,
    weight: 1,
    patchM: 2.6,
    coverage: 0.22,
  }),
});

/**
 * The rebuild's lawn REGIONS: every `material: 'lawn'` rectangle in the plan,
 * plus the 180-degree partner the arena's own `pair()` emits for each of them.
 * Everything else in the table - the driveway apron and the border path - is
 * hard surface and is outside the regions BY CONSTRUCTION, exactly as the
 * shipped map's asphalt and pavements are.
 *
 * On the corrected 36 x 84 footprint this is 4 authored rectangles becoming 8
 * regions, of which the yard lawn (z -36..-23 and its partner +23..+36) is by
 * far the largest - the back yards are the map's long axis now, so they are
 * where a lawn is actually seen.
 */
export function nuketownRebuildLawnRegions(
  dressing: readonly NuketownGroundDressingPiece[],
): readonly GrassRegionRect[] {
  const regions: GrassRegionRect[] = [];
  for (const piece of dressing) {
    if (piece.material !== 'lawn' || piece.id.includes('infill')) continue;
    const minX = Math.min(piece.x0, piece.x1);
    const maxX = Math.max(piece.x0, piece.x1);
    const minZ = Math.min(piece.z0, piece.z1);
    const maxZ = Math.max(piece.z0, piece.z1);
    regions.push({ minX, maxX, minZ, maxZ });
    // The rotational partner, the same transform `pair()` applies: (x, z) -> (-x, -z).
    // Suppressed for pieces the arena authored once - see `paired` above.
    if (piece.paired !== false) regions.push({ minX: -maxX, maxX: -minX, minZ: -maxZ, maxZ: -minZ });
  }
  return Object.freeze(regions);
}

/**
 * Build the rebuild's lawn field. Same donor, same suburban preset, same tint
 * and same blade material as the shipped map's - this is the port, not a
 * variant - with two things supplied by the caller instead of by a table here:
 *
 *   - REGIONS come from the arena's own ground-dressing rectangles;
 *   - KEEP-OUTS are the arena's own colliders, handed over at build time. The
 *     shipped map needs a hand-mirrored prop table (and a containment test to
 *     stop it drifting) because its lawn is built in a sibling group long after
 *     `buildArena` has returned. This one is built from INSIDE `buildNuketown2`
 *     with `builder.colliders` in scope, so the keep-outs cannot be stale: a
 *     shed, hedge or fence added to the arena is a keep-out on the same tick.
 *
 * Presentation only: no colliders, no raycast surfaces, blades capped at the
 * 0.25 m art-only ceiling. Deterministic (fixed seed, no Math.random).
 */
export function buildNuketownRebuildLawnField(
  parent: THREE.Object3D,
  options: Readonly<{
    dressing: readonly NuketownGroundDressingPiece[];
    keepOuts: readonly Box2[];
    keepOutCircles?: readonly NuketownLawnKeepOutCircle[];
    reduced?: boolean;
  }>,
): InstancedGrassField {
  const reduced = options.reduced === true;
  const compatRoute = typeof document !== 'undefined'
    && document.documentElement?.dataset.renderBackend === 'webgl2';
  const keepOuts = options.keepOuts;
  const keepOutCircles = options.keepOutCircles ?? [];
  const field = buildInstancedGrassField({
    name: 'nuketown2-lawn',
    // A different stream from the shipped map's, so the two maps do not carry
    // the same tuft pattern in the same world coordinates.
    seed: NUKETOWN_LAWN_SEED ^ 0x0002_6426,
    regions: nuketownRebuildLawnRegions(options.dressing),
    // The shipped map's own cell sizes, unchanged. Measured on the rebuild's
    // lawn: 8,303 tufts / 124,545 triangles / 11 draws pre-muse-lawn2 (the old
    // comment's 9,953 / 149 k / 8 predates the turning-head re-tile), against
    // an arena budget of 650 k triangles and 420 draws whose solid geometry is
    // 230 boxes. A sparser cell was tried first and rejected - the owner's
    // standing note on this map's grass is that it "still feels poor", and
    // there is no budget reason here to under-plant it.
    cellSizeM: reduced ? 0.5 : compatRoute ? 0.36 : 0.3,
    bladeHeightM: NUKETOWN_LAWN_BLADE_HEIGHT_M,
    bladeWidthM: 0.062,
    bladeBendM: 0.055,
    bladesPerTuft: reduced || compatRoute ? 2 : 3,
    // HF-536 muse-lawn2: 0.7x-1.4x height jitter (max/min 1.43x, cap holds),
    // 0-25 deg lean jitter, and x1.6 density within 4 m of the review-close
    // camera footprints. Twins reuse the region meshes: draws never move.
    scaleRange: [...NUKETOWN2_LAWN_SCALE_RANGE] as [number, number],
    nearBand: reduced || compatRoute ? null : nuketown2LawnNearBand(),
    leanMaxDeg: GRASS_BLADE_LEAN_MAX_DEG,
    placementAllowed: (x, z) => !keepOuts.some((box) => (
      x > box.minX - NUKETOWN_LAWN_KEEPOUT_MARGIN_M
      && x < box.maxX + NUKETOWN_LAWN_KEEPOUT_MARGIN_M
      && z > box.minZ - NUKETOWN_LAWN_KEEPOUT_MARGIN_M
      && z < box.maxZ + NUKETOWN_LAWN_KEEPOUT_MARGIN_M
    )) && !keepOutCircles.some((circle) => (
      (x - circle.centreX) ** 2 + (z - circle.centreZ) ** 2 < circle.radius ** 2
    )),
    material: {
      // HF-536 look-2b: the base is now the DRY tone; the tint carries the
      // green (see NUKETOWN2_LAWN_BASE_COLOR). HF-536 muse-lawn: the tip/backlit
      // translucency follows the lawn to the boards olive (0xa4cb55 hue 79.8 sat
      // 58.1% -> 0x9aa04e hue 64.4 sat 51.2%, measured with the lawn boxes).
      // HF-536 muse-lawn2: the root sits at 0.55x the plate luma so the blades
      // separate from the ground they stand in (was 0.56/0.65/0.50).
      color: NUKETOWN2_LAWN_BASE_COLOR,
      roughness: 0.89,
      metalness: 0.02,
      swayAmount: 0.045,
      windSpeed: 0.8,
      sssColor: 0x9aa04e,
      sssStrength: 0.29,
      rootShade: [...NUKETOWN2_LAWN_ROOT_SHADE] as [number, number, number],
    },
    tint: NUKETOWN2_LAWN_TINT,
  });
  parent.add(field.group);
  return field;
}

/**
 * The clover / flower-tuft layer (HF-536 look-2b, critic gap #4 "clover
 * patches, flowering weeds").
 *
 * Same regions and the same keep-out truth as the lawn - it is planted where
 * the lawn is planted, just far sparser (one candidate per 1.95 m cell against
 * the lawn's 0.3 m) and with a rosette geometry instead of a blade fan. It
 * follows the verge-bloom field's shape exactly, so nothing new is invented:
 * one instanced field, one node graph, no texture and no sampler.
 *
 * Presentation only: 0.105 m tall (less than half the 0.25 m art-only ceiling),
 * no collider, no shot surface, seeded-deterministic.
 */
export function buildNuketown2CloverField(
  parent: THREE.Object3D,
  options: Readonly<{
    dressing: readonly NuketownGroundDressingPiece[];
    keepOuts: readonly Box2[];
    keepOutCircles?: readonly NuketownLawnKeepOutCircle[];
    reduced?: boolean;
  }>,
): InstancedGrassField {
  const reduced = options.reduced === true;
  const keepOuts = options.keepOuts;
  const keepOutCircles = options.keepOutCircles ?? [];
  const field = buildInstancedGrassField({
    name: 'nuketown2-clover',
    seed: NUKETOWN2_CLOVER_SEED,
    regions: nuketownRebuildLawnRegions(options.dressing),
    // Reduced widens the cell, which lowers the count - it can never raise it.
    cellSizeM: reduced ? NUKETOWN2_CLOVER_CELL_M * 1.5 : NUKETOWN2_CLOVER_CELL_M,
    bladeHeightM: NUKETOWN2_CLOVER_HEIGHT_M,
    // Wide and barely bent: a clover leaflet is a disc on a short stem, not a
    // blade. Four of them per tuft is the trefoil rosette plus one head.
    bladeWidthM: 0.108,
    bladeBendM: 0.022,
    bladesPerTuft: reduced ? 3 : 4,
    scaleRange: [0.62, 1.0],
    placementAllowed: (x, z) => !keepOuts.some((box) => (
      x > box.minX - NUKETOWN_LAWN_KEEPOUT_MARGIN_M
      && x < box.maxX + NUKETOWN_LAWN_KEEPOUT_MARGIN_M
      && z > box.minZ - NUKETOWN_LAWN_KEEPOUT_MARGIN_M
      && z < box.maxZ + NUKETOWN_LAWN_KEEPOUT_MARGIN_M
    )) && !keepOutCircles.some((circle) => (
      (x - circle.centreX) ** 2 + (z - circle.centreZ) ** 2 < circle.radius ** 2
    )),
    material: {
      color: NUKETOWN2_CLOVER_BASE_COLOR,
      roughness: 0.82,
      metalness: 0.02,
      // Clover leaves are broad and catch more wind than a grass blade, but
      // they sit lower, so the tip travel stays small in absolute terms.
      swayAmount: 0.03,
      windSpeed: 0.95,
      sssColor: 0xc9e08a,
      sssStrength: 0.22,
      rootShade: [0.72, 0.78, 0.66],
    },
    tint: NUKETOWN2_CLOVER_TINT,
  });
  parent.add(field.group);
  return field;
}
