/**
 * Test1 & Test2 (owner 2026-08-30) — see docs/TEST1_MAP_BRIEF.md and
 * docs/TEST2_MAP_BRIEF.md. Original procedural art throughout; the briefs'
 * archetypes inform layout beats only.
 *
 * FULL-COMPLEX PASS (owner: "test 1 and test 2 map are a good start but only a
 * small portion of the map and style, we need a deeper recreation"). v1 built
 * the central quarter of each brief and stopped. v2 builds the whole thing:
 *
 *   Test1  64 x 46 m (was 52 x 38). Approach road and vehicle park at each
 *          end, a COVERED firing line with seven numbered lanes under a
 *          corrugated roof, a range-control tower that reads as a building
 *          (two annexes, a clerestory band, a walkable deck reached from BOTH
 *          ends and opening onto both annex roofs), an ammunition/stores block
 *          at each end, the container yard
 *          with a real climb ladder onto a container roof, berms, and a fenced
 *          perimeter with a posted rhythm.
 *   Test2  76 x 58 m (was 64 x 48). Motor court and gatehouse at each end,
 *          two villa wings with a real facade and a VERANDA you can fight
 *          along, the pool terrace, a sunken sport court, garden terraces
 *          stepping down to a sunken parterre, and four outbuildings.
 *
 * Both new extents sit INSIDE the shadow volumes already authored for these
 * arenas in src/graphics-refinement.ts (test1 68 x 54, test2 80 x 64), so the
 * cascade still covers the whole playfield with margin and no table this pass
 * does not own had to move. See the report for the two knock-on values in
 * src/rendering/arenas/*.ts that now want a re-measure.
 *
 * THE FAIRNESS INVOLUTION
 * -----------------------
 * Every gameplay mass on each map is authored as a PAIR under the involution
 * that swaps the two teams, so neither team owns a better half:
 *
 *   Test1 — teams separate along Z (team 0 at z < 0, team 1 at z > 0) and the
 *     two lanes differ in kind by the brief (a firing line west, a container
 *     yard east). The team-swapping involution is therefore the Z MIRROR
 *     (x, z) -> (x, -z), and every structure below is either centred on z = 0
 *     or authored as a +/-z pair. A literal 180-degree rotation would
 *     additionally demand that the firing line EQUAL the container yard, which
 *     the brief's own lane programme forbids; v1 claimed the rotation and had
 *     neither (its five containers had no partners at all). The spawn sets are
 *     symmetric in x, so they map onto each other under the mirror AND under
 *     the rotation.
 *   Test2 — teams separate along X and the Domination anchors A(-20, -12) and
 *     C(+20, +12) are already exact 180-degree images of one another, so this
 *     map's involution is the ROTATION (x, z) -> (-x, -z), and it is honoured
 *     literally. The pool lane's 180-degree partner is the sunken garden
 *     parterre: identical footprint, identical walkable depth, differentiated
 *     only by dressing. That is what lets a pool and a garden coexist on a
 *     rotationally symmetric map.
 *
 * THE COVER RULE (owner: cover breaks BOTH stances or is jump-mountable)
 * ---------------------------------------------------------------------
 * The measured jump apex on this controller is 0.82 m (arena-layout.ts:130).
 * Every cover piece on both maps is therefore one of:
 *   - a MOUNTABLE platform whose top is reachable in a rise of <= 0.75 m from
 *     the surface beside it (0.7 / 1.45 / 2.15 / 2.6 is the container ladder);
 *   - HARD cover at >= 1.9 m, which clears the 1.65 m standing eye-line.
 * Nothing is authored in the 0.9-1.8 m dead band, where a piece hides a
 * crouched player from nobody and cannot be climbed. v1 shipped six pieces in
 * that band (1.25 m sandbag walls, 1.6 m berms, 1.5 m crates, 1.2 m drums);
 * they are re-cut here, not re-labelled.
 */
import * as THREE from 'three';
import {
  batchPresentationOnlyBoxes,
  box,
  emptyTelemetry,
  spawnRecord,
  standard,
  type Builder,
} from './additional-maps';
import type { ArenaMap } from './map';
import { applyTest1Dressing, applyTest2Dressing, test1Materials, test2Materials, worldTiled } from './test-maps-art';

export const TEST1_BOUNDS = Object.freeze({ minX: -32, maxX: 32, minZ: -23, maxZ: 23 });
export const TEST2_BOUNDS = Object.freeze({ minX: -38, maxX: 38, minZ: -29, maxZ: 29 });

/** Domination anchors for Test2 (A pool deck, B court, C garden terrace). */
export const TEST2_DOMINATION_ZONES = Object.freeze([
  Object.freeze({ id: 'A' as const, centre: Object.freeze([-20, 0, -12] as const) }),
  Object.freeze({ id: 'B' as const, centre: Object.freeze([0, 0, 0] as const) }),
  Object.freeze({ id: 'C' as const, centre: Object.freeze([20, 0, 12] as const) }),
]);

/**
 * The traversal ladder, in metres of TOP height above the surface beside each
 * piece. Consecutive rises are <= 0.75 m against a measured 0.82 m jump apex.
 */
const MOUNT_LOW = 0.7;
const MOUNT_MID = 1.45;
const MOUNT_HIGH = 2.15;
/** Clears the 1.65 m standing eye-line, so it breaks both stances. */
const HARD_COVER = 1.9;
/** ISO container: the yard's cover module and the top of the climb ladder. */
const CONTAINER_SIZE: readonly [number, number, number] = [6, 2.6, 2.6];

function makeBuilder(scene: THREE.Scene, name: string): Builder {
  const root = new THREE.Group();
  root.name = name;
  scene.add(root);
  return { root, colliders: [], physicsColliders: [], raycastMeshes: [], shotSurfaces: [], ballisticSurfaceSequence: 0 };
}

/**
 * `box` plus world-space UV scaling.
 *
 * A BoxGeometry face is 0..1 in UV whatever it measures, so one texture repeat
 * can only ever be right for one mesh size. Both maps now share six forged
 * surfaces across ~20 material uses and dozens of mesh sizes, so scale is
 * carried per MESH (see `worldTiled` in test-maps-art.ts) and every authored
 * block goes through here. Nothing else about `box` changes: solidity, shot
 * registration and the collider bounds are still its business alone.
 */
function block(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  options: Parameters<typeof box>[5] = {},
): THREE.Mesh {
  return worldTiled(box(builder, name, position, size, material, options), size);
}

function perimeter(builder: Builder, name: string, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, height: number, material: THREE.Material): void {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  block(builder, `${name} north`, [0, height / 2, bounds.minZ - 0.4], [width + 2, height, 0.8], material);
  block(builder, `${name} south`, [0, height / 2, bounds.maxZ + 0.4], [width + 2, height, 0.8], material);
  block(builder, `${name} west`, [bounds.minX - 0.4, height / 2, 0], [0.8, height, depth + 2], material);
  block(builder, `${name} east`, [bounds.maxX + 0.4, height / 2, 0], [0.8, height, depth + 2], material);
}

// ---------------------------------------------------------------------------
// Test1 — the range complex
// ---------------------------------------------------------------------------

export function buildTest1(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Test1 arena');
  // Every surface below wears a FORGED set (albedo + normal + roughness + AO)
  // from test-maps-art.ts. The flat colours only survive in headless audits,
  // where the forge finds no readable canvas and skips the bake entirely.
  const materials = test1Materials();
  const { hardpan, road, plywood, plywoodDark, sandbag, steel, cinder } = materials;
  // Observation glazing: the RAY TRACED preset needs something to reflect on
  // every arena, and this is Test1's only smooth surface.
  const rangeGlass = new THREE.MeshStandardMaterial({
    color: 0xb8ccd4, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.42,
  });

  // Ground runs out to meet the ridge ring's 66 m inner rim, so the horizon is
  // continuous dust rather than a 68 m slab floating in a void. One draw call
  // either way; the playfield is fenced at TEST1_BOUNDS.
  block(builder, 'test1 hardpan', [0, -0.5, 0], [150, 1, 130], hardpan, { cast: false });
  perimeter(builder, 'test1 fence', TEST1_BOUNDS, 3, plywoodDark);

  // --- centre: the range-control tower ------------------------------------
  // A building, not a box: a cinderblock ground floor with a clerestory band
  // north and south and door mouths into an annex on each side, a walkable
  // deck at 2.90 m, a waist parapet with an observation glazing band above it,
  // and an exterior stair at BOTH ends. v1 had one stair, at the south end
  // only, which handed team 1 the map's power position for free.
  //
  // The sill is 1.9 m, not the 1.0 m a window normally sits at: at 1.0 m it
  // was the only piece on either map in the 0.9-1.8 m dead band, hiding a
  // crouched defender from nobody while being unclimbable. At 1.9 m it is hard
  // cover and the 0.84 m opening above it (1.9 m to the 2.74 m deck soffit) is
  // a standing firing slot, which is what a range tower has anyway.
  for (const end of [-1, 1] as const) {
    block(builder, `test1 tower sill ${end}`, [0, HARD_COVER / 2, end * 4.05], [8.4, HARD_COVER, 0.35], cinder);
  }
  for (const side of [-1, 1] as const) {
    for (const end of [-1, 1] as const) {
      // 2.2 m door mouth in the middle of each side wall, into the annex.
      block(builder, `test1 tower wall ${side} ${end}`, [side * 4.05, 1.35, end * 2.65], [0.35, 2.7, 3.1], cinder);
    }
  }
  block(builder, 'test1 tower deck', [0, 2.82, 0], [9.2, 0.16, 9.2], steel);
  for (const end of [-1, 1] as const) {
    // Parapet split around a 3 m stair doorway at each end.
    block(builder, `test1 tower parapet ${end} west`, [-3.05, 3.4, end * 4.45], [3.1, 1, 0.3], cinder);
    block(builder, `test1 tower parapet ${end} east`, [3.05, 3.4, end * 4.45], [3.1, 1, 0.3], cinder);
  }
  for (const side of [-1, 1] as const) {
    // Split around a 3 m gap so the deck OPENS onto each annex roof (2.64 m, a
    // 0.26 m step down). An unbroken side parapet sealed both roofs off: the
    // reachability sweep found them as 96-cell islands, which is a power
    // position the map advertises and no one can stand on.
    for (const end of [-1, 1] as const) {
      block(builder, `test1 tower parapet side ${side} ${end}`, [side * 4.45, 3.4, end * 3.05], [0.3, 1, 3.1], cinder);
    }
    // Glazing band sits ABOVE the parapet (3.9 m), so it never blocks a body
    // and its bottom clears the 2.6 m reachable ceiling by 1.3 m.
    block(builder, `test1 tower glazing ${side}`, [side * 4.45, 4.35, 0], [0.12, 0.9, 9.2], rangeGlass, { solid: false, shots: true });
  }
  // Four 0.725 m rises to the 2.90 m deck at each end. Measured live: the
  // controller autosteps 0.38 m from flat ground but refuses 0.38 m
  // box-to-box, and the jump apex is 0.82 m, so 0.725 climbs reliably.
  for (const end of [-1, 1] as const) {
    for (let step = 0; step < 4; step += 1) {
      const top = (2.9 * (step + 1)) / 4;
      block(builder, `test1 tower stair ${end} ${step}`,
        [0, top / 2, end * (5.15 + (3 - step) * 1.1)], [1.8, top, 1.1], steel);
    }
  }
  // Annexes: the range office west, the equipment store east. Their 2.64 m
  // roofs are one 0.26 m step off the deck, so the power position has depth
  // instead of being a single 9 m square.
  for (const side of [-1, 1] as const) {
    const cx = side * 7.2;
    for (const end of [-1, 1] as const) {
      block(builder, `test1 annex outer ${side} ${end}`, [side * 10.05, 1.2, end * 2.25], [0.35, 2.4, 2.9], cinder);
      block(builder, `test1 annex flank ${side} ${end}`, [cx, 1.2, end * 3.45], [6, 2.4, 0.35], cinder);
    }
    block(builder, `test1 annex roof ${side}`, [cx, 2.52, 0], [6.3, 0.24, 7.5], steel);
  }

  // --- west lane: the covered firing line ---------------------------------
  // Seven numbered lanes under a corrugated roof on a double column line.
  block(builder, 'test1 firing line roof', [-13.8, 3.32, 0], [6.4, 0.28, 34], steel);
  for (const columnX of [-16.7, -10.9]) {
    for (const columnZ of [-15, -9, -3, 3, 9, 15]) {
      block(builder, `test1 firing column ${columnX} ${columnZ}`, [columnX, 1.59, columnZ], [0.32, 3.18, 0.32], steel);
    }
  }
  // Firing-point kerb: 0.7 m, so it is kneeling cover you shoot over AND a
  // mountable step, never a dead-band wall.
  for (const laneZ of [-15, -10, -5, 0, 5, 10, 15]) {
    block(builder, `test1 firing kerb ${laneZ}`, [-17.6, MOUNT_LOW / 2, laneZ], [0.9, MOUNT_LOW, 4.2], sandbag);
  }
  // Sandbag traverses between lane groups: 1.9 m hard cover that breaks the
  // firing line's full-length duel without sealing it (1.4 m walkway behind,
  // open ground downrange).
  for (const end of [-1, 1] as const) {
    block(builder, `test1 lane traverse ${end}`, [-14.8, HARD_COVER / 2, end * 11.5], [5.6, HARD_COVER, 0.9], sandbag);
  }
  // Target line + the earth backstop every real range is built around.
  for (const targetZ of [-15, -10, -5, 0, 5, 10, 15]) {
    block(builder, `test1 target post ${targetZ}`, [-25.5, 0.9, targetZ], [0.14, 1.8, 0.14], plywoodDark, { solid: false, shots: true });
    block(builder, `test1 target silhouette ${targetZ}`, [-25.5, 1.95, targetZ], [0.9, 1.1, 0.06], plywood, { solid: false, shots: true });
  }
  // Flush to the fence: a 0.5 m slot between the berm and the boundary was a
  // sealed strip the reachability sweep counted as unreachable floor.
  block(builder, 'test1 backstop berm', [-29.75, 1.3, 0], [4.5, 2.6, 44], road);

  // --- east lane: the container yard --------------------------------------
  // Six containers as three +/-z pairs plus one centred broadside, so the weave
  // is identical from either end. v1's five containers had no partners.
  const containerPairs: ReadonlyArray<readonly [string, number, number, number, THREE.Material]> = [
    ['test1 container a', 15, 7.5, 0, materials.containerRed],
    ['test1 container b', 22, 3, Math.PI / 16, materials.containerBlue],
    ['test1 container c', 27.5, 11, 0, materials.containerGreen],
    ['test1 container d', 13, 15, -Math.PI / 18, materials.containerGreen],
  ];
  for (const [name, x, z, yaw, material] of containerPairs) {
    for (const end of [-1, 1] as const) {
      block(builder, `${name} ${end}`, [x, 1.3, end * z], [...CONTAINER_SIZE] as [number, number, number], material,
        yaw ? { rotation: [0, end * yaw, 0] } : {});
    }
  }
  block(builder, 'test1 container e', [28.5, 1.3, 0], [...CONTAINER_SIZE] as [number, number, number], materials.containerBlue, { rotation: [0, Math.PI / 2, 0] });
  for (const end of [-1, 1] as const) {
    block(builder, `test1 container stack ${end}`, [27.5, 3.9, end * 11], [...CONTAINER_SIZE] as [number, number, number], materials.containerRed);
  }
  // The climb ladder onto container A's roof, and the only way up in the yard:
  // 0.70 -> 1.45 -> 2.15 -> 2.60, four rises of 0.70/0.75/0.70/0.45.
  for (const end of [-1, 1] as const) {
    block(builder, `test1 yard pallet step ${end}`, [15, MOUNT_LOW / 2, end * 11.9], [2.2, MOUNT_LOW, 1.6], plywood);
    block(builder, `test1 yard crate ${end}`, [15, MOUNT_MID / 2, end * 10.2], [2.2, MOUNT_MID, 1.4], plywood);
    block(builder, `test1 yard barrier ${end}`, [15, MOUNT_HIGH / 2, end * 9.1], [2.2, MOUNT_HIGH, 0.6], cinder);
  }

  // --- mid-map cover ------------------------------------------------------
  // A mountable crate beside a hard-cover crate: the pair gives a shooter a
  // parapet and a climber a step, on all four approaches to the tower.
  for (const end of [-1, 1] as const) {
    for (const side of [-1, 1] as const) {
      block(builder, `test1 mid crate low ${side} ${end}`, [side * 8, MOUNT_LOW / 2, end * 12], [1.8, MOUNT_LOW, 1.8], plywood);
      block(builder, `test1 mid crate high ${side} ${end}`, [side * 8, HARD_COVER / 2, end * 13.9], [1.8, HARD_COVER, 1.8], plywood);
      block(builder, `test1 concrete block ${side} ${end}`, [side * 7.5, HARD_COVER / 2, end * 7.5], [2.4, HARD_COVER, 1.2], cinder);
    }
  }

  // --- ends: spawn shed, berms, vehicle park, stores block ----------------
  for (const end of [-1, 1] as const) {
    // Spawn shed: open toward the map, so the spawn itself is under a roof and
    // both lane exits are covered.
    block(builder, `test1 spawn shed rear ${end}`, [0, 1.5, end * 22], [10, 3, 0.35], plywoodDark);
    for (const side of [-1, 1] as const) {
      block(builder, `test1 spawn shed side ${side} ${end}`, [side * 4.8, 1.5, end * 20], [0.35, 3, 4.4], plywoodDark);
    }
    block(builder, `test1 spawn shed roof ${end}`, [0, 3.15, end * 20], [10.6, 0.3, 4.8], steel);
    // Berm cluster flanking the shed.
    for (const side of [-1, 1] as const) {
      block(builder, `test1 end berm ${side} ${end}`, [side * 11, HARD_COVER / 2, end * 18.5], [7, HARD_COVER, 2.2], road);
    }
    // Approach road and the vehicle park it serves. No vehicles are authored
    // (both briefs forbid them); the park is bays, barriers and stores.
    block(builder, `test1 approach road ${end}`, [-21.5, 0.03, end * 20.6], [10, 0.06, 5], road, { solid: false, shots: false, cast: false });
    block(builder, `test1 vehicle park apron ${end}`, [-21.5, 0.03, end * 16.5], [13, 0.06, 4], road, { solid: false, shots: false, cast: false });
    for (const barrierX of [-25.5, -21.5, -17.5]) {
      block(builder, `test1 jersey barrier ${barrierX} ${end}`, [barrierX, MOUNT_LOW / 2, end * 18.5], [3.2, MOUNT_LOW, 0.7], cinder);
    }
    // Ammunition/stores block: a real room with a 3.6 m roller door.
    block(builder, `test1 stores rear ${end}`, [22, 1.6, end * 19.1], [11, 3.2, 0.35], cinder);
    for (const side of [-1, 1] as const) {
      block(builder, `test1 stores side ${side} ${end}`, [22 + side * 5.3, 1.6, end * 16.7], [0.35, 3.2, 5.2], cinder);
      block(builder, `test1 stores front ${side} ${end}`, [22 + side * 3.4, 1.6, end * 14.25], [3.2, 3.2, 0.35], cinder);
    }
    block(builder, `test1 stores roof ${end}`, [22, 3.35, end * 16.7], [11.4, 0.3, 5.6], steel);
  }

  applyTest1Dressing(builder.root, materials);
  batchPresentationOnlyBoxes(builder.root, 'test1-presentation');

  return {
    id: 'test1',
    label: 'Test1',
    root: builder.root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    // The two sets are exact negations of each other, and each set is
    // symmetric in x, so they also map onto each other under the z mirror the
    // geometry is built on. Two spawns per team sit inside the covered shed.
    spawns: spawnRecord(
      [[-20, -20.8], [-11.5, -20.8], [-2.6, -20], [2.6, -20], [11.5, -20.8], [20, -20.8]],
      [[20, 20.8], [11.5, 20.8], [2.6, 20], [-2.6, 20], [-11.5, 20.8], [-20, 20.8]],
    ),
    patrolPoints: [
      [-19, -14], [-19, 0], [-19, 14], [-24, -6], [-24, 6], [0, -12],
      [0, 12], [19.5, -11], [19.5, 11], [24, 0], [-8, -21], [8, 21],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { ...TEST1_BOUNDS },
    houseTelemetry: emptyTelemetry(),
  };
}

// ---------------------------------------------------------------------------
// Test2 — the hillside estate
// ---------------------------------------------------------------------------

export function buildTest2(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Test2 arena');
  const materials = test2Materials();
  const { travertine, stucco, stone, hedge, poolTile, court, timber } = materials;
  const poolWater = new THREE.MeshStandardMaterial({
    color: 0x2e9cb0, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.82,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xbfd8de, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.4,
  });

  // The terrace is a band decomposition around THREE cutouts - the pool, its
  // 180-degree partner the sunken parterre, and the sunken court. A one-piece
  // slab buried all three (measured on the first art pass: the water sheet sat
  // under the floor), so the ground is authored as the complement instead.
  const terraceSlabs: ReadonlyArray<readonly [string, number, number, number, number]> = [
    ['north apron', 0, -25.35, 79, 10.3],
    ['south apron', 0, 25.35, 79, 10.3],
    ['pool west', -23.85, -15, 31.3, 10.4],
    ['pool east', 23.85, -15, 31.3, 10.4],
    ['garden west', -23.85, 15, 31.3, 10.4],
    ['garden east', 23.85, 15, 31.3, 10.4],
    ['pool inner walk', 0, -7.4, 79, 4.8],
    ['garden inner walk', 0, 7.4, 79, 4.8],
    ['court west', -24.25, 0, 30.5, 10],
    ['court east', 24.25, 0, 30.5, 10],
  ];
  for (const [name, x, z, width, depth] of terraceSlabs) {
    block(builder, `test2 terrace ${name}`, [x, -0.5, z], [width, 1, depth], travertine, { cast: false });
  }
  perimeter(builder, 'test2 estate wall', TEST2_BOUNDS, 3.4, stucco);

  // --- centre: the sunken sport court -------------------------------------
  // Sunk 0.35 m: below the autostep threshold on the way in, well under the
  // jump apex on the way out, so the court reads as a pit without becoming a
  // trap. Markings are flush geometry (see applyTest2Dressing for why).
  block(builder, 'test2 court floor', [0, -0.85, 0], [18, 1, 10], court, { cast: false });
  for (const side of [-1, 1] as const) {
    for (const end of [-1, 1] as const) {
      // Planters flanking the court: 1.9 m hard cover with a clipped box cap.
      block(builder, `test2 planter ${side} ${end}`, [side * 10.5, HARD_COVER / 2, end * 7], [2.6, HARD_COVER, 2.6], stone);
      block(builder, `test2 planter hedge ${side} ${end}`, [side * 10.5, 2.3, end * 7], [2.3, 0.8, 2.3], hedge, { solid: false, shots: true });
      // Clipped hedge blocks on the outer court approaches.
      block(builder, `test2 hedge block ${side} ${end}`, [side * 18, HARD_COVER / 2, end * 5.5], [5, HARD_COVER, 1.6], hedge);
      // Terrace balustrade: 0.7 m, so it is a mountable step as well as
      // kneeling cover - never a dead-band wall.
      block(builder, `test2 balustrade ${side} ${end}`, [side * 26, MOUNT_LOW / 2, end * 8.7], [12, MOUNT_LOW, 0.5], stone);
      // The garden terraces stepping down toward each sunken basin.
      block(builder, `test2 terrace step ${side} ${end}`, [side * 14.25, 0.175, end * 19.2], [10.5, 0.35, 2.4], travertine);
    }
  }

  // --- the two sunken basins ----------------------------------------------
  // side = -1 is the POOL (north), side = +1 its exact 180-degree partner, the
  // sunken parterre (south). Identical footprint, identical 0.55 m depth,
  // identical exit steps; only the material and the dressing differ. That is
  // what lets a pool lane and a garden lane coexist on a rotationally
  // symmetric map without either team getting the easier half.
  for (const side of [-1, 1] as const) {
    const label = side < 0 ? 'pool' : 'parterre';
    const surface = side < 0 ? poolTile : stone;
    const centreZ = side * 15;
    block(builder, `test2 ${label} basin floor`, [0, -1.05, centreZ], [16.4, 1, 10.4], surface, { cast: false });
    block(builder, `test2 ${label} wall outer`, [0, -0.275, side * 20.05], [16.4, 0.55, 0.3], surface);
    block(builder, `test2 ${label} wall inner`, [0, -0.275, side * 9.95], [16.4, 0.55, 0.3], surface);
    for (const flank of [-1, 1] as const) {
      block(builder, `test2 ${label} wall flank ${flank}`, [flank * 8.05, -0.275, centreZ], [0.3, 0.55, 10.4], surface);
    }
    // Two 0.27 m exit steps in one corner; the 0.55 m rim also clears a jump.
    block(builder, `test2 ${label} step low`, [side * -5.4, -0.415, side * 11.4], [2.2, 0.27, 1.2], surface);
    block(builder, `test2 ${label} step high`, [side * -5.4, -0.14, side * 10.6], [2.2, 0.28, 0.9], surface);
    // Coping ring, 0.3 m: walkable over, and the visual lip the brief asks for.
    block(builder, `test2 ${label} coping outer`, [0, 0.15, side * 20.5], [17.4, 0.3, 0.6], stone);
    block(builder, `test2 ${label} coping inner`, [0, 0.15, side * 9.5], [17.4, 0.3, 0.6], stone);
    for (const flank of [-1, 1] as const) {
      block(builder, `test2 ${label} coping flank ${flank}`, [flank * 8.5, 0.15, centreZ], [0.6, 0.3, 10.4], stone);
    }
  }
  // Presentation water only - the basin slab beneath it is the movement and
  // shot authority (recorded as this arena's one visual/collider exception).
  block(builder, 'test2 pool water sheet', [0, -0.35, -15], [15.7, 0.05, 9.7], poolWater, { solid: false, shots: false, cast: false });

  // --- the villa wings and their verandas ---------------------------------
  // The estate wraps the court: a wing on each long edge, 180-degree partners
  // of one another, each with a colonnaded veranda you can fight along. The
  // deck is 0.7 m (mountable at every balustrade gap), the balustrade tops out
  // at 1.85 m absolute - hard cover from the court, a shooting parapet from
  // the veranda - and the roof soffit sits at 3.6 m.
  for (const side of [-1, 1] as const) {
    block(builder, `test2 villa wing ${side}`, [0, 2.1, side * 26], [56, 4.2, 0.6], stucco);
    block(builder, `test2 veranda deck ${side}`, [0, MOUNT_LOW / 2, side * 23], [50, MOUNT_LOW, 5.4], travertine);
    block(builder, `test2 veranda roof ${side}`, [0, 3.75, side * 23], [51, 0.3, 5.8], stucco);
    for (const columnX of [-24, -17, -10, -3, 3, 10, 17, 24]) {
      block(builder, `test2 veranda column ${side} ${columnX}`, [columnX, 2.15, side * 20.6], [0.4, 2.9, 0.4], stucco);
    }
    // Balustrade only between the inner columns: the spans at |x| 17-24 stay
    // open, so each veranda has three ways up (both flanks and the steps).
    for (const balusterX of [-13.5, -6.5, 6.5, 13.5]) {
      block(builder, `test2 veranda balustrade ${side} ${balusterX}`, [balusterX, 1.275, side * 20.5], [5.4, 1.15, 0.35], stone);
    }
    block(builder, `test2 grand step low ${side}`, [0, 0.175, side * 19.3], [6, 0.35, 1.2], stone);
    block(builder, `test2 grand step high ${side}`, [0, MOUNT_LOW / 2, side * 20.2], [6, MOUNT_LOW, 0.8], stone);
    // Glazed doors, recessed 0.2 m into the wing wall so the ballistic census
    // sees them explained by the wall they are set into.
    for (const glazingX of [-14, 14]) {
      block(builder, `test2 villa glazing ${side} ${glazingX}`, [glazingX, 2, side * 25.65], [7, 2.6, 0.3], glass, { solid: false, shots: true });
    }
  }

  // --- outbuildings, motor courts and gatehouses --------------------------
  // Four outbuildings on the diagonals: pool houses at the pool's two ends,
  // their 180-degree partners serving as the garden's garage/staff entry.
  for (const side of [-1, 1] as const) {
    for (const end of [-1, 1] as const) {
      const px = side * 30;
      const pz = end * 16;
      block(builder, `test2 outbuilding rear ${side} ${end}`, [px, 1.7, pz + end * 3.9], [9, 3.4, 0.35], stucco);
      block(builder, `test2 outbuilding outer ${side} ${end}`, [px + side * 4.3, 1.7, pz], [0.35, 3.4, 8], stucco);
      block(builder, `test2 outbuilding inner ${side} ${end}`, [px - side * 4.3, 1.7, pz + end * 2.4], [0.35, 3.4, 3.2], stucco);
      block(builder, `test2 outbuilding front ${side} ${end}`, [px + side * 2.6, 1.7, pz - end * 3.9], [3.8, 3.4, 0.35], stucco);
      block(builder, `test2 outbuilding roof ${side} ${end}`, [px, 3.55, pz], [9.6, 0.3, 8.6], travertine);
    }
    // Motor court: gatehouse, a hard-cover fountain wall, and a glazed
    // orangery. The orangery replaces v1's parked cars, which both briefs
    // forbid; it keeps the RAY TRACED preset a smooth surface at each end.
    block(builder, `test2 gatehouse ${side}`, [side * 35, 1.7, side * -9], [4.5, 3.4, 6], stucco);
    block(builder, `test2 motor wall ${side}`, [side * 31, HARD_COVER / 2, side * 3], [1.2, HARD_COVER, 9], stone);
    block(builder, `test2 orangery ${side}`, [side * 30.5, 1.3, side * -5], [2.4, 2.6, 5.2], glass);
    // Veranda seating: 0.4 m, dressing height by measurement.
    block(builder, `test2 veranda bench ${side}`, [side * 20, 0.9, side * 22.4], [3.4, 0.4, 0.9], timber, { solid: false, shots: true });
  }

  // Domination flag poles at the zone anchors (presentation; banners tinted by
  // the mode presentation at runtime via these exact names). Zone B stands on
  // the sunken court floor, so its plinth is dropped to meet it.
  for (const zone of TEST2_DOMINATION_ZONES) {
    const [zoneX, , zoneZ] = zone.centre;
    const groundY = zone.id === 'B' ? -0.35 : 0;
    block(builder, `test2 zone plinth ${zone.id}`, [zoneX, groundY + 0.12, zoneZ], [1.6, 0.24, 1.6], stone);
    // One material per zone: the runtime recolours these by name, and keeping
    // them distinct also keeps them out of the merged presentation batch,
    // whose shell-scale AABB would otherwise have to be triaged.
    block(builder, `test2-zone-flag-pole-${zone.id}`, [zoneX, groundY + 2.1, zoneZ], [0.12, 4, 0.12], standard(0x8b949c, 0.5, 0.7), { solid: false, shots: false });
    block(builder, `test2-zone-flag-banner-${zone.id}`, [zoneX + 0.65, groundY + 3.55, zoneZ], [1.3, 0.8, 0.06], standard(0xcccccc, 0.85, 0.02), { solid: false, shots: false });
  }

  applyTest2Dressing(builder.root, materials);
  batchPresentationOnlyBoxes(builder.root, 'test2-presentation');

  return {
    id: 'test2',
    label: 'Test2',
    root: builder.root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    // Exact 180-degree images of one another, on the motor court at each end.
    spawns: spawnRecord(
      [[-36, -10], [-36, -3], [-36, 4], [-34, -7], [-34, 0], [-31, -10]],
      [[36, 10], [36, 3], [36, -4], [34, 7], [34, 0], [31, 10]],
    ),
    patrolPoints: [
      // All at grade: a point on the 0.7 m veranda deck is reachable but makes
      // the bot pay a jump to stand on its own patrol anchor.
      [-29, -6], [29, 6], [-20, -12], [20, 12], [0, -15], [0, 15],
      [-14, 0], [14, 0], [-22, -18], [22, 18], [24, -11], [-24, 11],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { ...TEST2_BOUNDS },
    houseTelemetry: emptyTelemetry(),
    physicsSafetyFloorY: -1.2,
  };
}
