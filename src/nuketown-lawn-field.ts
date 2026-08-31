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
  type InstancedGrassField,
} from './rendering/instanced-grass-field';

/** Suburban blade cap — kept lawn, under the 0.25 m art-only ceiling. */
export const NUKETOWN_LAWN_BLADE_HEIGHT_M = GRASS_MAX_HEIGHT;
/** Fixed placement seed — identical lawn on every peer. */
export const NUKETOWN_LAWN_SEED = 0x1aa2_82f1;

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
