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
  CORNER_HEDGE_LAYOUT,
  CORNER_HEDGE_SIZE,
  COVER_LAYOUT,
  FRONT_HEDGE_FIN_LAYOUT,
  FRONT_HEDGE_FIN_SIZE,
  FRONT_HEDGE_LAYOUT,
  FRONT_HEDGE_SIZE,
  NEIGHBOURHOOD_BIN_COLLIDER_SIZE,
  NEIGHBOURHOOD_BIN_POSITIONS,
  REAR_HEDGE_LAYOUT,
  REAR_HEDGE_SIZE,
  SIDE_HEDGE_LAYOUT,
  SIDE_HEDGE_SIZE,
  YARD_FENCE_LAYOUT,
} from './arena-layout';
import type { Box2 } from './collision';
import { GRASS_GROUND_REGIONS, GRASS_MAX_HEIGHT, grassPlacementAllowed } from './grass-placement';
import { ATOMIC_MANNEQUIN_COLLIDER_SIZE, ATOMIC_MANNEQUIN_LAYOUT } from './map';
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
  for (const hedge of FRONT_HEDGE_LAYOUT) boxes.push(rect(hedge.x, hedge.z, hedge.length, FRONT_HEDGE_SIZE.depth));
  for (const fin of FRONT_HEDGE_FIN_LAYOUT) boxes.push(rect(fin.x, fin.z, FRONT_HEDGE_FIN_SIZE[0], FRONT_HEDGE_FIN_SIZE[2]));
  for (const rear of REAR_HEDGE_LAYOUT) boxes.push(rect(rear.x, rear.z, REAR_HEDGE_SIZE[0], REAR_HEDGE_SIZE[2]));
  for (const corner of CORNER_HEDGE_LAYOUT) boxes.push(rect(corner.x, corner.z, CORNER_HEDGE_SIZE[0], CORNER_HEDGE_SIZE[2]));
  for (const side of SIDE_HEDGE_LAYOUT) boxes.push(rect(side.x, side.z, SIDE_HEDGE_SIZE[0], SIDE_HEDGE_SIZE[2]));
  for (const [x, z, sizeX, sizeZ] of YARD_FENCE_LAYOUT) boxes.push(rect(x, z, sizeX, sizeZ));
  for (const [x, z, width, depth] of COVER_LAYOUT) boxes.push(rect(x, z, width, depth));
  for (const [x, z] of NEIGHBOURHOOD_BIN_POSITIONS) {
    boxes.push(rect(x, z, NEIGHBOURHOOD_BIN_COLLIDER_SIZE[0], NEIGHBOURHOOD_BIN_COLLIDER_SIZE[2]));
  }
  for (const [x, z] of ATOMIC_MANNEQUIN_LAYOUT) {
    boxes.push(rect(x, z, ATOMIC_MANNEQUIN_COLLIDER_SIZE[0], ATOMIC_MANNEQUIN_COLLIDER_SIZE[2]));
  }

  // --- Mirrored from map.ts authored props (provenance: buildArena) ---
  // Authored tree trunks (authored-tree-trunk-collider-N): [x, z, scale].
  for (const [x, z, scale] of [
    [-19, -28, 1], [19, 28, 1], [-27, -21, 0.9], [27, 21, 0.9], [-13, 28.5, 0.85], [13, -28.5, 0.85],
  ] as const) boxes.push(rect(x, z, 0.68 * scale, 0.68 * scale));
  // Irrigation terminals (authored-terminal-collider-N), yard pair + kerb pair.
  for (const [x, z] of [[-24, -8], [24, 8], [-9, -27], [9, 27]] as const) boxes.push(rect(x, z, 1.25, 0.8));
  // Hydroponics beds (authored-hydro-bed-collider-N) at z = 21.
  for (const x of [-29, -26, -23]) boxes.push(rect(x, 21, 1.1, 6.2));
  // Reclamation tank (authored-reclamation-tank-collider).
  boxes.push(rect(-29.5, -14, 2.7, 2.7));
  // Skyline trellis columns (collisionProxy 'skyline trellis column').
  for (const [x, z] of [[-29, -24], [-29, -19], [-24, -24], [-24, -19]] as const) boxes.push(rect(x, z, 0.55, 0.55));
  // Service channel walls (collisionProxy 'service wall west/east').
  for (const x of [22.5, 28.5]) boxes.push(rect(x, 9, 0.7, 10));
  // Solar canopy columns (collisionProxy 'solar canopy column').
  for (const [x, z] of [[23, -27], [23, -17], [30.5, -22], [30.5, -12]] as const) boxes.push(rect(x, z, 0.6, 0.6));
  // Street lamp poles ('lamp pole'); the yard pair stands on the lawns.
  for (const [x, z] of [[-18, -16], [18, 16], [-26, -2], [26, 2]] as const) boxes.push(rect(x, z, 0.15, 0.15));
  // Auxiliary lamps (authored-extra-lamp-collider-N) on the pavement edge.
  for (const [x, z] of [[-30, -8], [30, 8]] as const) boxes.push(rect(x, z, 0.3, 0.3));
  // Atomic landmark plinth ('atomic landmark plinth').
  boxes.push(rect(27, -20, 4.4, 4.4));
  // East irrigation vessel ('east-irrigation-vessel-collider').
  boxes.push(rect(27, 24, 3.8, 3.8));
  // Verge terrain mounds ('terrain-mound-*-collider'): blades rooted at y=0
  // under the raised ellipsoids would render buried inside them.
  boxes.push(rect(-24, -29.5, 4.6, 3.4));
  boxes.push(rect(24, 29.5, 4.6, 3.4));
  // Quality earth-bank tier colliders ('quality-earth-bank-*-collider-N'):
  // the corner banks deliberately overlap the playable side of the boundary,
  // so their tiered authority boxes reach into the lawn corners. Blades
  // rooted at y=0 inside them would render buried in the bank slopes.
  // [x, z, width, depth] mirrored from the map.ts slice tables (bank z is
  // -34 north / +34 south; only the in-bounds overlap matters here).
  for (const [x, z, width, depth] of [
    [-30, -34, 3, 16], [-27.5, -34, 2.5, 10], [-25.5, -34, 2, 5], // north-west
    [30, -34, 3, 14], [27.5, -34, 2.5, 8], // north-east
    [-30, 34, 3, 14], [-27.5, 34, 2.5, 8], // south-west
    [30, 34, 3, 16], [27.5, 34, 2.5, 10], [25.5, 34, 2, 5], // south-east
  ] as const) boxes.push(rect(x, z, width, depth));
  // Greenhouse interior (environment-assets addRouteArchitecture sills at
  // x -30/-22, z 17.2/24.8 + planters): the framed floor is planted beds, not
  // lawn, and the sills are decorative (no colliders) so no collider-derived
  // rect exists for them.
  boxes.push({ minX: -30.5, maxX: -21.5, minZ: 16.7, maxZ: 25.3 });

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

/** Kept-lawn tint: cool suburban greens with mild sun-bleached clumping. */
export const NUKETOWN_LAWN_TINT: GrassClumpTint = Object.freeze({
  rBase: 0.62, rWarm: 0.16,
  gBase: 0.86, gWarm: 0.08,
  bBase: 0.55, bWarm: -0.12,
  valueBase: 0.86, valuePatch: 0.09, valueJitter: 0.05,
});

/**
 * Build the Nuke Town lawn field under `parent`. Deterministic, presentation
 * only; two lawn bands = two instanced draws. `reduced` widens the placement
 * cell for the reduced-world-detail route (fewer blades, same coverage).
 */
export function buildNuketownLawnField(parent: THREE.Object3D, reduced: boolean): InstancedGrassField {
  const field = buildInstancedGrassField({
    name: 'nuketown-lawn',
    seed: NUKETOWN_LAWN_SEED,
    regions: GRASS_GROUND_REGIONS,
    cellSizeM: reduced ? 0.52 : 0.34,
    bladeHeightM: NUKETOWN_LAWN_BLADE_HEIGHT_M,
    bladeWidthM: 0.045,
    bladeBendM: 0.05,
    scaleRange: [0.68, 1.0],
    placementAllowed: nuketownLawnPlacementAllowed,
    material: {
      color: 0x527d36,
      roughness: 0.88,
      metalness: 0.02,
      swayAmount: 0.045,
      windSpeed: 0.8,
      sssColor: 0x9cc44e,
      sssStrength: 0.3,
    },
    tint: NUKETOWN_LAWN_TINT,
  });
  parent.add(field.group);
  return field;
}
