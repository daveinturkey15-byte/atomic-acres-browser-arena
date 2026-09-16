/**
 * ATOMIC ACRES REBUILD — AuthorityGray (gameplay authority, graybox).
 *
 * WHAT THIS IS. The ONLY gameplay-authority source for `atomic-acres-rebuild`:
 * movement colliders, physics colliders, ballistic shot surfaces (every one
 * backed by an invisible proxy raycast mesh carrying its ballisticSurfaceId,
 * per the census in `src/ballistics.test.ts`), physical cover, and the 6v6
 * spawn tables. LayoutGray (`src/atomic-acres-rebuild-arena.ts`) is
 * presentation-only (zero colliders/shots/spawns); InteriorsGray
 * (`src/atomic-acres-rebuild-interiors.ts`) owns the interior partition
 * records, which are committed HERE via `buildAtomicAcresRebuildInteriors`
 * (never inside the presentation pass, per that module's contract).
 *
 * GEOMETRY FACTS (all from the landed `src/atomic-acres-rebuild-arena.ts`,
 * which cites the four graybox plates + BRIEF.md + LAYOUT_CONTRACT facts):
 * - fact 3: horseshoe/loop asphalt spine with south entry (north = -Z).
 * - fact 4: center-loop cover — school bus + semi nose-to-nose + crates.
 * - fact 2: twin two-storey houses, WEST 7.2 x 6.0 @ (-13.5, 1.5) with the
 *   loop-facing (+x) front, EAST 7.8 x 6.4 @ (13.5, -1.5) with the
 *   loop-facing (-x) front; fronts carry porches + 1.0 m door markers.
 * - fact 5: north entrance gap (|x| < 5) with rusty car + welcome sign.
 * - fact 6: south exit with jeep + sandbag reservation across the road.
 * - fact 8: sheds in the back (north) corners + rear patio sets.
 * - fact 9: wooden privacy fences divide lots; lamps line the loop.
 * - Perimeter walls at |x| = 24 / z = +24 / -26 with an 8 m south entry gap
 *   and a 6 m north entrance gap; playfield bounds x [-28, 28], z [-32, 32].
 * - Front-door portals: 1.0 m wide centred on each house cz, head 2.2 m
 *   (`frontDoorPortal` in the interiors module; satisfies the >= 0.95 m rule).
 *
 * SOLID vs NON-SOLID (per the 04-authority brief). Solid: house shells
 * (segmented, with the front-door portal carved + a shots-only lintel above
 * it), interior partitions (InteriorsGray records), garages, bus, semi,
 * sheds, perimeter walls, all crate clusters, lot fences, parked cars, jeep,
 * rusty car, patio tables/benches, porch posts, utility poles. Non-solid:
 * pads, lawns, roads, sidewalks, lamps, hedges, planters, welcome sign,
 * sandbag reservation (stays walkable so the south exit never seals),
 * door-marker slabs (they sit inside the carved portal), scrub/rocks/trees
 * outside the walls, desert apron, island disc (0.12 m: autostep-clear).
 *
 * FINDING for LayoutGray / orchestrator (not patched here — presentation vs
 * authority separation): the perimeter wall runs leave open corners. South
 * wall segments end at |x| = 22 while the side walls sit at |x| = 24
 * (x in [22, 23.75] open at z ~ 24); same at the north corners (x in
 * [22, 23.75] open at z ~ -26). Authority matches presentation exactly, so
 * the leak is real in both. The ground proxy below stops at the wall lines,
 * so anything leaving through a corner stands on nothing (no safety floor is
 * set on this arena, deliberately — HF-402: a fail-safe floor must not
 * legitimise out-of-bounds spawns, and none of ours are out there).
 *
 * SPAWNS (deterministic literals, no Math.random). Team 0 holds the south
 * half, team 1 the north half; every point re-checked against
 * `src/spawn-layout-constraints.ts` thresholds by construction:
 * - 6 per team, pairwise >= 3 m, team x-span 22 m / 26 m (>= 0.18 of the
 *   64 m longer axis), cross-team minimum ~32.5 m (>= 0.33 axis fraction,
 *   and >= the 30 m visible-enemy rule geometrically, so occlusion is bonus).
 * - Every spawn stands on the ground proxy (floor gap 0), clear of colliders
 *   by more than the 0.44 m capsule, with hard cover inside 6 m and wall
 *   standoff >= 1.2 m. North-south routes run around the crate choke via the
 *   entry-road shoulders and through the fence-line centre gaps (|x| < 5.5),
 *   all on flat grade (autostep only, no jumps — bots cannot jump).
 *
 * DETERMINISM. Literal tables only. No Math.random anywhere in this file.
 */

import * as THREE from 'three';
import {
  box,
  spawnRecord,
  standard,
  type Builder,
} from './additional-maps';
import type { BallisticMaterialId, BallisticSurface } from './ballistics';
import type { Box2 } from './collision';
import type { ArenaMap } from './map';
import type { Team } from './protocol';
import {
  ATOMIC_ACRES_REBUILD_SPREAD,
  buildAtomicAcresRebuildInteriors,
  frontDoorPortal,
  garageWalls,
  rearLinkGap,
  REBUILD_DOOR_HEAD_Y,
  REBUILD_SHELL_WALL_T,
  REBUILD_STOREY_H,
} from './atomic-acres-rebuild-interiors';

/** Full gameplay authority for `atomic-acres-rebuild`. */
export interface AtomicAcresRebuildAuthority {
  readonly colliders: Box2[];
  readonly physicsColliders: Box2[];
  readonly raycastMeshes: THREE.Object3D[];
  readonly shotSurfaces: BallisticSurface[];
  readonly physicalCover: ArenaMap['physicalCover'];
  readonly spawns: Record<Team, THREE.Vector3[]>;
  /** Invisible proxy meshes added to the scene (census backing). */
  readonly proxies: THREE.Object3D[];
}

type Vec3 = [number, number, number];
/** Team 0 (south) spawn table: [x, z], eye height applied by spawnRecord (SPREAD 1.6x). */
const TEAM0_SPAWNS: readonly [number, number][] = Object.freeze([
  [-5.6, 29.6], // choke-shoulder west: choke barricade (cover)
  [5.6, 29.6], // choke-shoulder east: choke barricade (cover)
  [14.4, 20.8], // yard east: yard crates (cover), spread for nearest-neighbour floor
  [-14.4, 21.6], // yard west: yard crates (cover), spread for nearest-neighbour floor
  [-21.6, 33.6], // south-west wall: perimeter wall (cover)
  [21.6, 33.6], // south-east wall: perimeter wall (cover)
] as const);

/** Team 1 (north) spawn table: [x, z], eye height applied by spawnRecord (SPREAD 1.6x). */
const TEAM1_SPAWNS: readonly [number, number][] = Object.freeze([
  [-22.4, -29.6], // north-west reach
  [-6.4, -31.2], // entrance west reach
  [11.2, -30.4], // entrance east reach: 4.8 m off the east patio table (cover)
  [22.4, -29.6], // north-east reach
  [-5.6, -18.4], // patio west reach
  [8.8, -19.2], // patio east reach
] as const);

/**
 * Emit one invisible authority proxy: a solid (or shots-only) box whose mesh
 * is hidden so LayoutGray's presentation massing stays the only visual, while
 * the collider / shot-surface / census backing is exact.
 */
function proxy(
  builder: Builder,
  name: string,
  center: Vec3,
  size: [number, number, number],
  material: THREE.Material,
  ballisticMaterial: BallisticMaterialId,
  solid = true,
  rotation?: [number, number, number],
): THREE.Mesh {
  // SPREAD mirrors LayoutGray (single-sourced from InteriorsGray): plan only.
  const S = ATOMIC_ACRES_REBUILD_SPREAD;
  const mesh = box(builder, name, [center[0] * S, center[1], center[2] * S], [size[0] * S, size[1], size[2] * S], material, {
    solid,
    shots: true,
    ballisticMaterial,
    rotation,
    cast: false,
  });
  mesh.visible = false;
  return mesh;
}

function cover(
  physicalCover: ArenaMap['physicalCover'],
  builder: Builder,
  id: string,
  colliderIndex: number,
): void {
  const bounds = builder.colliders[colliderIndex];
  physicalCover.push({ id, bounds, blocksMovement: true, blocksShots: true });
}

/** Commit full gameplay authority for `atomic-acres-rebuild` into `scene`. */
export function atomicAcresRebuildAuthority(scene: THREE.Scene): AtomicAcresRebuildAuthority {
  const root = new THREE.Group();
  root.name = 'Atomic Acres Rebuild authority';
  scene.add(root);
  const builder: Builder = {
    root,
    colliders: [],
    physicsColliders: [],
    raycastMeshes: [],
    shotSurfaces: [],
    ballisticSurfaceSequence: 0,
  };
  const physicalCover: ArenaMap['physicalCover'] = [];

  const brick = standard(0x8f8b86, 0.95, 0.0);
  const concrete = standard(0x9a9894, 0.96, 0.0);
  const timber = standard(0x6e5638, 0.9, 0.0);
  const hull = standard(0x7c8288, 0.6, 0.4);
  const groundMat = standard(0x8a8f7a, 1.0, 0.0);

  // ---- Walkable ground proxy (fact 1/3: desert surround + loop spine grade).
  // Shots-only so movement never collides with the floor itself; top at y=0.
  proxy(builder, 'aarr-authority-ground', [0, -0.1, -1], [48, 0.2, 50], groundMat, 'earth', false);

  // ---- House shells: 0.3 m perimeter walls, full 6 m two-storey height,
  // front-door portal carved on each loop-facing face + shots-only lintel
  // above the portal (InteriorsGray owns the interior side of the opening).
  for (const house of ['west', 'east'] as const) {
    const portal = frontDoorPortal(house);
    const t = REBUILD_SHELL_WALL_T;
    const h = 2 * REBUILD_STOREY_H;
    const y = h / 2;
    // Shell outer rects per the landed LayoutGray dims (fact 2), base frame —
    // proxy() applies SPREAD 1.6x after, same as presentation.
    const outer = house === 'west'
      ? { x0: -17.1, x1: -9.9, z0: -1.5, z1: 4.5 }
      : { x0: 9.6, x1: 17.4, z0: -4.7, z1: 1.7 };
    const gap0 = portal.centreZ - portal.width / 2;
    const gap1 = portal.centreZ + portal.width / 2;
    const [linkZ0, linkZ1] = rearLinkGap(house);
    if (house === 'west') {
      proxy(builder, 'aarr-house-west-rear-south', [-17.1 + t / 2, y, (outer.z0 + linkZ0) / 2], [t, h, linkZ0 - outer.z0], brick, 'brick');
      proxy(builder, 'aarr-house-west-rear-north', [-17.1 + t / 2, y, (linkZ1 + outer.z1) / 2], [t, h, outer.z1 - linkZ1], brick, 'brick');
      proxy(builder, 'aarr-house-west-north', [-13.5, y, 4.5 - t / 2], [7.2, h, t], brick, 'brick');
      proxy(builder, 'aarr-house-west-south', [-13.5, y, -1.5 + t / 2], [7.2, h, t], brick, 'brick');
      proxy(builder, 'aarr-house-west-front-south', [-9.9 - t / 2, y, (outer.z0 + gap0) / 2], [t, h, gap0 - outer.z0], brick, 'brick');
      proxy(builder, 'aarr-house-west-front-north', [-9.9 - t / 2, y, (gap1 + outer.z1) / 2], [t, h, outer.z1 - gap1], brick, 'brick');
    } else {
      proxy(builder, 'aarr-house-east-rear-south', [17.4 - t / 2, y, (outer.z0 + linkZ0) / 2], [t, h, linkZ0 - outer.z0], brick, 'brick');
      proxy(builder, 'aarr-house-east-rear-north', [17.4 - t / 2, y, (linkZ1 + outer.z1) / 2], [t, h, outer.z1 - linkZ1], brick, 'brick');
      proxy(builder, 'aarr-house-east-north', [13.5, y, 1.7 - t / 2], [7.8, h, t], brick, 'brick');
      proxy(builder, 'aarr-house-east-south', [13.5, y, -4.7 + t / 2], [7.8, h, t], brick, 'brick');
      proxy(builder, 'aarr-house-east-front-south', [9.6 + t / 2, y, (outer.z0 + gap0) / 2], [t, h, gap0 - outer.z0], brick, 'brick');
      proxy(builder, 'aarr-house-east-front-north', [9.6 + t / 2, y, (gap1 + outer.z1) / 2], [t, h, outer.z1 - gap1], brick, 'brick');
    }
    // Shots-only lintel closes the portal above the 2.2 m door head.
    proxy(
      builder,
      `aarr-house-${house}-front-lintel`,
      [portal.planeX - portal.face * (t / 2), (portal.headY + h) / 2, portal.centreZ],
      [t, h - portal.headY, portal.width],
      brick,
      'brick',
      false,
    );
    // Shots-only lintel over the garage personnel link (2.2 m head).
    const rearX = house === 'west' ? -17.1 : 17.4;
    proxy(
      builder,
      `aarr-house-${house}-rear-link-lintel`,
      [rearX, (REBUILD_DOOR_HEAD_Y + h) / 2, (linkZ0 + linkZ1) / 2],
      [t, h - REBUILD_DOOR_HEAD_Y, linkZ1 - linkZ0],
      brick,
      'brick',
      false,
    );
  }
  // ---- Interior partitions + upper storey + stairs + garage shells
  // (InteriorsGray records, committed here, meshes hidden).
  for (const mesh of buildAtomicAcresRebuildInteriors(builder)) mesh.visible = false;
  // ---- Garage cover keeps pointing at each hollow garage shell.
  for (const house of ['west', 'east'] as const) {
    const north = garageWalls(house).find((wall) => wall.id.endsWith('garage north'))!;
    const S = ATOMIC_ACRES_REBUILD_SPREAD;
    const index = builder.colliders.findIndex((rect) =>
      rect.minX === north.x0 * S && rect.maxX === north.x1 * S
      && rect.minZ === north.z0 * S && rect.maxZ === north.z1 * S,
    );
    if (index >= 0) cover(physicalCover, builder, `garage-${house}`, index);
  }

  // ---- Parked cars on the driveways (merged body + cabin footprints).
  proxy(builder, 'aarr-car-west', [-18.9, 0.65, 5.5], [1.8, 1.3, 4.2], hull, 'vehicle');
  proxy(builder, 'aarr-car-east', [19.2, 0.65, 2.5], [1.8, 1.3, 4.2], hull, 'vehicle');

  // ---- Bus + semi nose-to-nose inside the loop (fact 4; all plates).
  proxy(builder, 'aarr-bus', [-3.2, 1.4, 0.5], [2.5, 2.6, 11.0], hull, 'vehicle', true, [0, 0.28, 0]);
  cover(physicalCover, builder, 'bus', builder.colliders.length - 1);
  proxy(builder, 'aarr-semi-cab', [3.4, 1.5, -3.4], [2.5, 2.8, 2.8], hull, 'vehicle', true, [0, -0.22, 0]);
  proxy(builder, 'aarr-semi-trailer', [4.6, 1.6, 3.2], [2.6, 3.0, 9.5], hull, 'vehicle', true, [0, -0.22, 0]);
  cover(physicalCover, builder, 'semi-trailer', builder.colliders.length - 1);

  // ---- Sheds in the back corners (fact 8).
  proxy(builder, 'aarr-shed-west', [-16, 1.1, -21], [3.0, 2.2, 2.6], timber, 'wood');
  cover(physicalCover, builder, 'shed-west', builder.colliders.length - 1);
  proxy(builder, 'aarr-shed-east', [16, 1.1, -21], [3.0, 2.2, 2.6], timber, 'wood');
  cover(physicalCover, builder, 'shed-east', builder.colliders.length - 1);

  // ---- Perimeter concrete walls (closed runs with entry gaps per layout).
  proxy(builder, 'aarr-wall-south-west', [-14, 1.2, 24], [16, 2.4, 0.5], concrete, 'concrete');
  proxy(builder, 'aarr-wall-south-east', [14, 1.2, 24], [16, 2.4, 0.5], concrete, 'concrete');
  proxy(builder, 'aarr-wall-north-west', [-13.5, 1.2, -26], [17, 2.4, 0.5], concrete, 'concrete');
  proxy(builder, 'aarr-wall-north-east', [13.5, 1.2, -26], [17, 2.4, 0.5], concrete, 'concrete');
  proxy(builder, 'aarr-wall-side-west', [-24, 1.2, -1], [0.5, 2.4, 49], concrete, 'concrete');
  proxy(builder, 'aarr-wall-side-east', [24, 1.2, -1], [0.5, 2.4, 49], concrete, 'concrete');

  // ---- Wooden privacy fences dividing every lot (fact 9).
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'west' : 'east';
    proxy(builder, `aarr-fence-lot-north-${tag}`, [side * 10, 0.9, -10], [9, 1.8, 0.25], timber, 'fence');
    proxy(builder, `aarr-fence-lot-south-${tag}`, [side * 10, 0.9, 8], [9, 1.8, 0.25], timber, 'fence');
    proxy(builder, `aarr-fence-drive-${tag}`, [side * 20.5, 0.9, 6], [0.25, 1.8, 10], timber, 'fence');
  }

  // ---- South choke barricade (fact 6 street plate): merged 4x3 base + top row.
  // Merged by design (see ACCEPTED_MERGED_PROXY_COVERAGE): one unbroken body,
  // no 1-crate gaps to snag on. Base-frame dims; proxy() applies SPREAD.
  proxy(builder, 'aarr-choke-base', [0, 1.5, 14], [4, 3, 1], timber, 'wood');
  cover(physicalCover, builder, 'choke-barricade', builder.colliders.length - 1);
  proxy(builder, 'aarr-choke-top', [0, 3.5, 14], [3, 1, 1], timber, 'wood');

  // ---- Island crate cluster (street plate island): merged 2x2 + top.
  proxy(builder, 'aarr-island-crates', [0, 1.1, 3], [2.6, 2.2, 2.6], timber, 'wood');
  cover(physicalCover, builder, 'island-cluster', builder.colliders.length - 1);

  // ---- Yard crate clusters (topdown plate scatter): merged per cluster.
  const yardClusters: ReadonlyArray<readonly [string, number, number]> = [
    ['west-north', -8, -12],
    ['east-north', 8, -13],
    ['west-south', -6, 9],
    ['east-south', 6, 8],
  ] as const;
  for (const [tag, cx, cz] of yardClusters) {
    proxy(builder, `aarr-yard-crates-${tag}`, [cx + 0.5, 1.0, cz + 0.5], [2, 2, 2], timber, 'wood');
    cover(physicalCover, builder, `yard-cluster-${tag}`, builder.colliders.length - 1);
  }

  // ---- Rear patio sets (fact 8 aerials): tables + benches solid, poles skip.
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'west' : 'east';
    proxy(builder, `aarr-patio-table-${tag}`, [side * 10, 0.4, -19], [1.4, 0.8, 1.4], concrete, 'concrete');
    proxy(builder, `aarr-patio-bench-${tag}`, [side * 10, 0.3, -17.2], [1.6, 0.6, 0.5], timber, 'wood');
  }

  // ---- Porch posts (loop-facing porches; slabs are autostep-clear).
  proxy(builder, 'aarr-porch-post-west-north', [-8.1, 1.6, -0.9], [0.18, 2.8, 0.18], timber, 'wood');
  proxy(builder, 'aarr-porch-post-west-south', [-8.1, 1.6, 3.9], [0.18, 2.8, 0.18], timber, 'wood');
  proxy(builder, 'aarr-porch-post-east-north', [7.8, 1.6, -4.06], [0.18, 2.8, 0.18], timber, 'wood');
  proxy(builder, 'aarr-porch-post-east-south', [7.8, 1.6, 1.06], [0.18, 2.8, 0.18], timber, 'wood');

  // ---- Utility poles flanking the street (street + aerial plates).
  for (const [tag, px, pz] of [
    ['west-16', -6.5, 16],
    ['east-16', 6.5, 16],
    ['west--6', -11, -6],
    ['east--6', 11, -6],
  ] as const) {
    proxy(builder, `aarr-pole-${tag}`, [px, 4, pz], [0.3, 8, 0.3], timber, 'wood');
  }

  // ---- South-exit jeep + north-entrance rusty car (facts 5/6; merged shells).
  proxy(builder, 'aarr-jeep', [7.5, 0.75, 21], [1.8, 1.5, 3.6], hull, 'vehicle');
  proxy(builder, 'aarr-rustycar', [-4.5, 0.7, -23], [1.8, 1.4, 4.0], hull, 'vehicle');

  // ---- Yard trees (trunks only; crowns are non-solid green-blob massing).
  for (const [tag, tx, tz] of [
    ['west-north', -18, -14],
    ['east-north', 18, -14],
    ['west-south', -19, 16],
    ['east-south', 19, 16],
  ] as const) {
    proxy(builder, `aarr-tree-${tag}`, [tx, 1.0, tz], [0.5, 2.0, 0.5], timber, 'wood');
  }

  const spawns = spawnRecord(TEAM0_SPAWNS, TEAM1_SPAWNS);
  const proxies = [...builder.raycastMeshes];

  return {
    colliders: [...builder.colliders],
    physicsColliders: [...builder.physicsColliders],
    raycastMeshes: [...builder.raycastMeshes],
    shotSurfaces: [...builder.shotSurfaces],
    physicalCover,
    spawns,
    proxies,
  };
}
