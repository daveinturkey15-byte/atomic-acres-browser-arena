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
import {
  buildInstancedGrassField,
  type GrassClumpTint,
  type GrassRegionRect,
  type InstancedGrassField,
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
 */
export const NUKETOWN_LAWN_TINT: GrassClumpTint = Object.freeze({
  rBase: 0.63, rWarm: 0.18,
  gBase: 0.88, gWarm: 0.09,
  bBase: 0.5, bWarm: -0.09,
  valueBase: 0.855, valuePatch: 0.06, valueJitter: 0.045,
});

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
    // 1,144 m2 of lawn: 9,953 tufts / 149 k triangles / 8 draws, against an
    // arena budget of 650 k triangles and 420 draws whose solid geometry is
    // 230 boxes. A sparser cell was tried first and rejected - the owner's
    // standing note on this map's grass is that it "still feels poor", and
    // there is no budget reason here to under-plant it.
    cellSizeM: reduced ? 0.5 : compatRoute ? 0.36 : 0.3,
    bladeHeightM: NUKETOWN_LAWN_BLADE_HEIGHT_M,
    bladeWidthM: 0.062,
    bladeBendM: 0.055,
    bladesPerTuft: reduced || compatRoute ? 2 : 3,
    scaleRange: [0.68, 1.0],
    placementAllowed: (x, z) => !keepOuts.some((box) => (
      x > box.minX - NUKETOWN_LAWN_KEEPOUT_MARGIN_M
      && x < box.maxX + NUKETOWN_LAWN_KEEPOUT_MARGIN_M
      && z > box.minZ - NUKETOWN_LAWN_KEEPOUT_MARGIN_M
      && z < box.maxZ + NUKETOWN_LAWN_KEEPOUT_MARGIN_M
    )) && !keepOutCircles.some((circle) => (
      (x - circle.centreX) ** 2 + (z - circle.centreZ) ** 2 < circle.radius ** 2
    )),
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
    tint: NUKETOWN_LAWN_TINT,
  });
  parent.add(field.group);
  return field;
}
