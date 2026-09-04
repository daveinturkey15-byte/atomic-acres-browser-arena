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
 *   Test2  100 x 76 m. REBUILT 2026-08-31 against
 *          docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md - see the Test2 section
 *          below for what changed and why. The 76 x 58 estate this line used to
 *          describe (motor courts, two villa wings, verandas, a central sunken
 *          sport court, a sunken parterre, four diagonal outbuildings) is gone:
 *          it was a rotationally symmetric walled slab, and the owner's report
 *          was that it is "not the layout at all".
 *
 * Test1's extent still sits inside the shadow volume authored for it in
 * src/graphics-refinement.ts (68 x 54). TEST2'S NO LONGER DOES: the old claim
 * that "no table this pass does not own had to move" died with the rebuild, and
 * the test2 shadow volume, fog near plane, killstreak flight radius and review
 * cameras were all re-measured and re-pinned by the same pass (2026-08-31).
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
 *   Test2 — teams separate along X, and as of the 2026-08-31 rebuild this
 *     map's involution is the X MIRROR (x, z) -> (-x, z). It used to be the
 *     180-degree rotation, and that was wrong on the evidence: the archetype's
 *     measured objective anchors are A(-34.6, -0.1) and C(+33.1, -0.9), which
 *     are x-mirrors of one another and NOT 180-degree images (a rotation would
 *     put A's partner at (+34.6, +0.1)). Every other paired feature agrees -
 *     the two service buildings flank the drive from the same side, both upper
 *     balconies look INTO the drive, and the two flank lanes differ in kind (a
 *     pool terrace and a motor circle), so neither rotates into the other.
 *
 *     This is the same argument the Test1 paragraph above already makes, on the
 *     other axis. Under the mirror the fairness obligations are: every spawn
 *     point maps to a spawn point of the other team; every lane mouth is the
 *     same distance from each spawn; each team has exactly one elevated room
 *     per flank lane; and A maps to C exactly while B sits on x = 0. Holding
 *     the rotation instead would have demanded the pool lane EQUAL the drive
 *     lane, which is precisely the demand that produced the old build's
 *     pool-and-its-180-degree-partner-parterre and its uniform open terrace.
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
import { createBallisticSurface, type BallisticMaterialId } from './ballistics';
import type { Box2 } from './collision';
import type { ArenaMap } from './map';
import { applyTest1Dressing, applyTest2Dressing, test1Materials, test2Materials, worldTiled } from './test-maps-art';

export const TEST1_BOUNDS = Object.freeze({ minX: -32, maxX: 32, minZ: -23, maxZ: 23 });
/**
 * 100 x 76 m (Pass 79 rebuild, 2026-08-31). Derived, not guessed - see
 * docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md section 1.3: the archetype's long
 * axis measures 85-92 m off four independent architectural anchors, and this
 * controller sprints at 8.7 m/s against the reference engine's derived
 * 7.24 m/s, so a faithful metre-for-metre copy would be crossed 20% faster and
 * would feel SMALLER than the map it copies. 85-92 x 1.20 = 102-110 m; 100 m is
 * the conservative bottom of that band, and 100 / 76 = 1.316 reproduces the
 * measured 1.311 aspect to within 0.4%.
 *
 * The old 76 x 58 = 4408 m2 was within 1% of Atomic Acres' 74 x 60 = 4440 m2 -
 * the "big estate map" was the same size as the small street map, which is what
 * the owner reported.
 */
export const TEST2_BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -38, maxZ: 38 });

/**
 * Domination anchors for Test2 (A west end, B drive-lane mouth, C garage drive).
 *
 * B IS DELIBERATELY OFF-CENTRE at (0, +14) and must stay there. With A and C on
 * the long axis at the two ends and B pulled into one flank, a team that owns B
 * is committed to one side of the map, so the losing team's spawn stays anchored
 * behind its own end instead of flipping through the middle. Moving B into the
 * courtyard is the obvious "fix" and it would break spawn stability.
 */
export const TEST2_DOMINATION_ZONES = Object.freeze([
  Object.freeze({ id: 'A' as const, centre: Object.freeze([-34, 0, -0.5] as const) }),
  Object.freeze({ id: 'B' as const, centre: Object.freeze([0, 0, 14] as const) }),
  Object.freeze({ id: 'C' as const, centre: Object.freeze([34, 0, -0.5] as const) }),
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

/**
 * HF-411: dressing meshes on Test1 that a player reads as a floor and must
 * therefore be able to stand on. Names only - every number comes off the mesh
 * (see `adoptWalkableDressing`). Adding a row here is how a future art pass
 * declares "this panel is walkable"; the walkable-surface gate
 * (src/walkable-surface-parity-gate.test.ts) fails if one is missing.
 */
export const TEST1_WALKABLE_DRESSING: readonly string[] = Object.freeze(['test1-camo-net-tarp']);

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

/**
 * Promotes a DRESSING mesh that reads as a floor into full arena authority
 * (HF-411).
 *
 * Every number is DERIVED from the mesh that is actually in the graph - its own
 * geometry extent, world placement and world rotation - and never re-typed from
 * the art module's literals. An art pass that moves, resizes or tilts the panel
 * moves the authority with it; an art pass that RENAMES or deletes it removes
 * the authority and the walkable-surface gate re-fires, which is the behaviour a
 * hand-copied number cannot give.
 *
 * WHAT AUTHORITY THIS ACTUALLY GRANTS - all four channels, named, because the
 * first version of this function claimed "movement only" and that was false:
 *
 *  1. `physicsColliders` - the Rapier world. This is the movement half the
 *     owner asked for: the capsule stands on the panel instead of falling
 *     3.0 m.
 *  2. `colliders` - the general world-solid list. `activeWorldColliders()` in
 *     legacy-main reads it for far more than movement: explosion and blast
 *     occlusion, the swept-sphere grenade/projectile test, spawn validity and
 *     `visibleThreats` scoring, interaction and bot line-of-sight, and
 *     carpet-bomber damage occlusion. There is no movement-only channel; a
 *     solid floor is solid to all of them, which is what a floor should be.
 *  3. `shotSurfaces` - the analytic ballistic authority. AGENTS.md requires
 *     matching movement and shot authority for every substantial
 *     player-reachable object, and the overhead-dressing exemption stops
 *     applying the moment the panel becomes a floor a player stands on. The
 *     panel is rated with `ballisticMaterial` so the round PAYS for the
 *     crossing instead of being ignored; for netting that material is `fence`,
 *     the cheapest rated non-glass material there is (0.18 entry +
 *     0.38/metre), so 0.06 m of net costs 0.203 of a 2.15-9.4 energy budget:
 *     a hit registers, a round still goes through. See
 *     `src/test1-roof-traversal.test.ts` for the per-weapon measurement.
 *  4. `raycastMeshes` + `blocksShots` - knife and world raycasts. The art
 *     module neutered `mesh.raycast` when it authored the panel as pure
 *     presentation; a floor needs it back, or a melee swing passes through the
 *     thing the player is standing on.
 *
 * Returns how many meshes were adopted so the caller can assert the census.
 */
function adoptWalkableDressing(
  builder: Builder,
  names: readonly string[],
  ballisticMaterial: BallisticMaterialId,
): number {
  const wanted = new Set(names);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let adopted = 0;
  builder.root.updateMatrixWorld(true);
  builder.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !wanted.has(object.name)) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const local = object.geometry.boundingBox;
    if (!local) return;
    object.matrixWorld.decompose(position, quaternion, scale);
    const size = local.getSize(new THREE.Vector3()).multiply(scale);
    const centre = local.getCenter(new THREE.Vector3()).multiply(scale).applyQuaternion(quaternion).add(position);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
    // Same convention `box()` writes and CharacterPhysics.create reads: an
    // axis-aligned extent plus the mesh's own rotation about its centre.
    const bounds: Box2 = {
      minX: centre.x - size.x / 2,
      maxX: centre.x + size.x / 2,
      minZ: centre.z - size.z / 2,
      maxZ: centre.z + size.z / 2,
      minY: centre.y - size.y / 2,
      maxY: centre.y + size.y / 2,
      rotation: [euler.x, euler.y, euler.z],
    };
    builder.colliders.push(bounds);
    builder.physicsColliders.push(bounds);
    // Shot authority, same bounds and same rotation as the movement collider,
    // so the two can never disagree about where the panel is. `fence` is
    // passed explicitly: `classifyBallisticMaterial` has no rule that matches
    // "net", so a rule-classified panel would fall through to `reinforced` and
    // turn camo netting into the hardest cover on the map.
    const surface = createBallisticSurface(
      `${builder.root.name}:${builder.ballisticSurfaceSequence}:${object.name}`,
      object.name,
      bounds,
      { material: ballisticMaterial },
    );
    builder.ballisticSurfaceSequence += 1;
    builder.shotSurfaces.push(surface);
    object.userData.ballisticSurfaceId = surface.id;
    object.userData.ballisticMaterial = surface.material;
    // The art module set `raycast = () => undefined` and `blocksShots = false`
    // when this was dressing. It is a floor now: restore the real raycast so a
    // knife swing and an impact decal land on it.
    object.userData.blocksShots = true;
    object.userData.presentationOnly = false;
    delete (object as { raycast?: THREE.Mesh['raycast'] }).raycast;
    if (!builder.raycastMeshes.includes(object)) builder.raycastMeshes.push(object);
    adopted += 1;
  });
  return adopted;
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
  // Observation glazing: the ray-traced reflection stage (QUALITY/MAX) needs
  // something to reflect on every arena, and this is Test1's only smooth surface.
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
  // HF-411 (owner, 2026-09-02): "on firing range sometimes you go to run onto a
  // metal fence layed as a floor on the roof level of the map and you fall
  // through it, fix all that shit."
  //
  // MEASURED, not guessed. The walkable-surface sweep
  // (scripts/qa/audit-walkable-surface-parity.ts) censused 48 elevated walkable
  // visuals on this map and found exactly two with no movement authority: the
  // camo netting strung over the container yard, authored as dressing in
  // test-maps-art.ts. Two 9.0 x 6.4 m panels, tilted 2 degrees, top face
  // running 2.79 m (west) to 3.11 m (east) - 97% of each panel unsupported,
  // 3.0 m of clear air to the hardpan. Evidence:
  // docs/evidence/pass85/hf411/before.json.
  //
  // The art's own justification for leaving them non-solid was that the
  // underside "sits at 2.92 m - above the 2.6 m reachable ceiling", and that is
  // false by measurement: the yard's reachable ceiling is the TOP OF CONTAINER
  // A at 2.60 m, which the four-rung climb ladder beside it exists to put a
  // player on. From those boots the netting's west edge is 0.19 m up - inside
  // the 0.42 m autostep - and it reads as a floor running 9 m east across open
  // air. That is the "sometimes": approach the panel over the container and you
  // step onto a floor; approach it anywhere else and you never touch it.
  //
  // The visual is not moved, hidden, levelled or resized. It is given the
  // authority it always looked like it had, derived from the mesh itself so art
  // and authority cannot drift apart - movement, world-solid (blast occlusion,
  // grenade sweeps, spawn threat scoring, line of sight), shot and raycast.
  // The netting is rated `fence`, the cheapest rated non-glass material in
  // BALLISTIC_MATERIALS: 0.06 m of it costs a round 0.203 energy out of the
  // 2.15-9.4 the catalogue's weapons carry, so a hit registers and the round
  // still goes through. That is grating semantics done with authority instead
  // of with absence - and it is what AGENTS.md's matching-authority clause
  // requires the moment a panel becomes a floor.
  adoptWalkableDressing(builder, TEST1_WALKABLE_DRESSING, 'fence');
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
      [[-20, -20.8], [-11.5, -20.8], [-2.6, -20], [2.6, -20], [11.5, -20.8], [20, -20.8], [-7.5, -20.8], [7.5, -20.8]],
      [[20, 20.8], [11.5, 20.8], [2.6, 20], [-2.6, 20], [-11.5, 20.8], [-20, 20.8], [7.5, 20.8], [-7.5, 20.8]],
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
// Test2 - the hillside estate, three-lane archetype (rebuild 2026-08-31)
//
// Contract: docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md. The owner's measured
// complaint was three-fold - the map was the same size as the small street map,
// it had ZERO reachable upper floors, and its two "villa wings" were 56 m solid
// walls that collapsed three nominal lanes into one 76 m terrace. This rebuild
// answers all three: 100 x 76 m, four reachable +3.40 m rooms on four
// autostep-legal stairs, and a boundary that follows a BUILDING FOOTPRINT
// instead of a rectangle, so roughly a quarter of the bounding box is simply
// not map and the lanes are separated by architecture.
//
// ORIGINAL ART ONLY. Every mesh below is a `block()` wearing a surface forged
// by test2Materials() in test-maps-art.ts. Nothing is sourced from any other
// game; the reference informed topology (lane count, adjacency, where the
// elevated vantages sit) and nothing else. The arena keeps its own name.
// ---------------------------------------------------------------------------

/**
 * The playable BLOB, read off the spec's 2 m/cell top-down diagram (section 6)
 * row by row: `[minZ, maxZ, minX, maxX]`, z ascending, each row's x extent the
 * diagram's own contiguous span.
 *
 * This table is the map's outline. The paving is authored inside it, the
 * boundary is generated around it, and the ~26% of the 100 x 76 bounding box it
 * leaves out is where the arena's corners, dead ends and cover-by-architecture
 * come from. The old build filled ~100% of its rectangle, which is exactly why
 * it played as one open field.
 */
const TEST2_BLOB: ReadonlyArray<readonly [number, number, number, number]> = [
  [-38, -36, -28, 34],
  [-36, -34, -40, 28],
  [-34, -20, -40, 32],
  [-20, -14, -40, 42],
  [-14, -10, -42, 50],
  [-10, 4, -50, 50],
  [4, 10, -42, 50],
  [10, 16, -38, 42],
  [16, 24, -34, 26],
  [24, 30, -30, 22],
  [30, 36, -22, 16],
  [36, 38, -10, 10],
];

/**
 * Paving: the blob minus the two sunken cutouts (sport court -0.35, pool basin
 * -0.55). Authored as the COMPLEMENT rather than one slab with holes - the
 * technique the first art pass had to learn when a one-piece slab buried the
 * water sheet. `[name, minX, maxX, minZ, maxZ]`.
 */
const TEST2_PAVING: ReadonlyArray<readonly [string, number, number, number, number]> = [
  ['north tip', -28, 34, -38, -36],
  ['pool head', -40, 28, -36, -35],
  ['pool head west', -40, -10, -35, -34],
  ['pool head east', 16, 28, -35, -34],
  ['court head west', -40, -10, -34, -33],
  ['court head east', 16, 32, -34, -33],
  ['court flank west', -40, -37, -33, -25],
  ['court walk', -19, -10, -33, -25],
  ['pool flank east', 16, 32, -33, -25],
  ['court flank south', -40, -37, -25, -21],
  ['pool deck', -19, 32, -25, -21],
  ['lane sill', -40, 32, -21, -20],
  ['house north band', -40, 42, -20, -14],
  ['approach band', -42, 50, -14, -10],
  ['long axis', -50, 50, -10, 4],
  ['drive north band', -42, 50, 4, 10],
  ['drive mid band', -38, 42, 10, 16],
  ['drive band', -34, 26, 16, 24],
  ['drive circle', -30, 22, 24, 30],
  ['drive approach', -22, 16, 30, 36],
  ['drive tip', -10, 10, 36, 38],
];

/** First-floor height. Four rooms sit here and nothing else is standable above it. */
const UPPER_FLOOR_Y = 3.4;
/**
 * Floor slab thickness. The soffit therefore lands at 3.16 m: every interior
 * beneath an upper room keeps 3.16 m of clear height against a 1.70 m standing
 * eye and a 0.61 m prone eye, so no stair soffit, balcony underside or covered
 * walk can produce an eye-clearance hazard by geometry alone.
 */
const UPPER_SLAB = 0.24;
const UPPER_SOFFIT = UPPER_FLOOR_Y - UPPER_SLAB;
/**
 * The canonical stair module, built once and reused four times. 9 risers of
 * 0.3778 m and 0.45 m treads: EVERY riser is under the 0.42 m autostep
 * (CHARACTER_PHYSICS_CONFIG), so the player walks up with no jump and no
 * timing, and 0.45 m clears the 0.22 m autostep minimum width with margin.
 * Rise 3.40 m over a 4.05 m run is a 40 degree pitch, inside the 50 degree
 * slope-climb limit, so a smooth-ramp fallback stays available.
 */
const STAIR_RISERS = 9;
const STAIR_TREAD = 0.45;
const STAIR_RUN = STAIR_RISERS * STAIR_TREAD;
/**
 * Balcony and window-slot rail. This is the ONE deliberate exception to the
 * 0.9-1.8 m dead-band rule below, and the rule's own rationale is what licenses
 * it: a dead-band piece is banned because it "hides a crouched player from
 * nobody and cannot be climbed". On a +3.40 m floor both halves invert - the
 * crouch eye sits at 1.16 m so a 1.05 m rail hides the body and clears the eye
 * exactly (the classic head-glitch the spec's 3.5 asks for), and it MUST NOT be
 * climbable or the upper room becomes a launch pad. Ground cover keeps the rule.
 */
const BALCONY_RAIL = 1.05;
/** Upper-room walls: hard cover measured from the +3.40 floor, not from grade. */
const UPPER_WALL = 1.9;
/** Roof parapet top. Set so no upper room can see across the map into a second lane. */
const PARAPET_TOP = 4.8;

export function buildTest2(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Test2 arena');
  const materials = test2Materials();
  const { travertine, stucco, stone, hedge, poolTile, court, timber } = materials;
  // Carried forward unchanged from the 2026-08-30 art pass, which measured hue
  // perplexity 5.61 against Farcrysis' 5.66 and a crushed fraction of 6.33%.
  // The palette is not re-opened by this pass; only the geometry it dresses is.
  const poolWater = new THREE.MeshStandardMaterial({
    color: 0x2e9cb0, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.82,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xbfd8de, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.4,
  });

  /**
   * Axis-aligned rectangular prism from corner to corner. Every mass in this
   * arena is authored as an EXTENT, not a centre and a size: the spec is a
   * table of extents, walls have to meet exactly, and a stairwell hole has to
   * line up with a stair tread to the centimetre. Centre/size arithmetic done
   * by hand is where the old build's 0.5 m seams came from.
   */
  const rect = (
    name: string,
    x0: number, x1: number,
    y0: number, y1: number,
    z0: number, z1: number,
    material: THREE.Material,
    options: Parameters<typeof block>[5] = {},
  ): THREE.Mesh => block(
    builder, name,
    [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    [x1 - x0, y1 - y0, z1 - z0],
    material, options,
  );

  /**
   * One canonical stair run inside the given footprint, climbing to
   * UPPER_FLOOR_Y along `direction`. The run must be exactly STAIR_RUN long on
   * the climbing axis; the caller sizes the stairwell hole to match so the top
   * riser lands flush against the floor slab it serves.
   */
  const stairRun = (
    name: string,
    x0: number, x1: number,
    z0: number, z1: number,
    direction: 'x+' | 'x-' | 'z+' | 'z-',
    material: THREE.Material,
  ): void => {
    for (let step = 0; step < STAIR_RISERS; step += 1) {
      const top = (UPPER_FLOOR_Y * (step + 1)) / STAIR_RISERS;
      const near = step * STAIR_TREAD;
      const far = (step + 1) * STAIR_TREAD;
      if (direction === 'x+') rect(`${name} riser ${step}`, x0 + near, x0 + far, 0, top, z0, z1, material);
      else if (direction === 'x-') rect(`${name} riser ${step}`, x1 - far, x1 - near, 0, top, z0, z1, material);
      else if (direction === 'z+') rect(`${name} riser ${step}`, x0, x1, 0, top, z0 + near, z0 + far, material);
      else rect(`${name} riser ${step}`, x0, x1, 0, top, z1 - far, z1 - near, material);
    }
  };

  // --- ground plane -------------------------------------------------------
  for (const [name, x0, x1, z0, z1] of TEST2_PAVING) {
    rect(`test2 paving ${name}`, x0, x1, -1, 0, z0, z1, travertine, { cast: false });
  }

  // --- boundary -----------------------------------------------------------
  // Generated from the blob, so the wall IS the outline and the two can never
  // drift apart. Segments on the drive's far side (z >= 24) are 1.9 m parapets:
  // the map is cut into a hillside and its south rim has to read as a drop, not
  // as a fourth wall. 1.9 m is still hard cover and still far above the 0.82 m
  // jump apex, so nothing leaves the map over it.
  const boundaryHeight = (z0: number): number => (z0 >= 24 ? 1.9 : 3.4);
  // Boundary masses start 2 m BELOW grade, not at it. The hillside dressing
  // slab's top is at -1.60 m (test-maps-art.ts), so a wall footed at y = 0
  // would show a 1.6 m strip of daylight under itself from every upper room
  // that looks out over it.
  const BOUNDARY_FOOT = -2;
  {
    const runs = (edge: 'min' | 'max'): void => {
      let index = 0;
      while (index < TEST2_BLOB.length) {
        const value = edge === 'min' ? TEST2_BLOB[index][2] : TEST2_BLOB[index][3];
        let end = index;
        while (end + 1 < TEST2_BLOB.length && (edge === 'min' ? TEST2_BLOB[end + 1][2] : TEST2_BLOB[end + 1][3]) === value) end += 1;
        const z0 = TEST2_BLOB[index][0];
        const z1 = TEST2_BLOB[end][1];
        const height = boundaryHeight(z0);
        if (edge === 'min') rect(`test2 boundary west ${index}`, value - 0.8, value, BOUNDARY_FOOT, height, z0, z1, stucco);
        else rect(`test2 boundary east ${index}`, value, value + 0.8, BOUNDARY_FOOT, height, z0, z1, stucco);
        index = end + 1;
      }
    };
    runs('min');
    runs('max');
    // Jogs: wherever the outline steps in or out, the cap across the step.
    for (let index = 0; index + 1 < TEST2_BLOB.length; index += 1) {
      const [, z, minA, maxA] = TEST2_BLOB[index];
      const [, , minB, maxB] = TEST2_BLOB[index + 1];
      const height = boundaryHeight(z);
      if (minA !== minB) {
        rect(`test2 boundary jog west ${index}`, Math.min(minA, minB) - 0.8, Math.max(minA, minB), BOUNDARY_FOOT, height, z - 0.8, z, stucco);
      }
      if (maxA !== maxB) {
        rect(`test2 boundary jog east ${index}`, Math.min(maxA, maxB), Math.max(maxA, maxB) + 0.8, BOUNDARY_FOOT, height, z - 0.8, z, stucco);
      }
    }
    rect('test2 boundary cap north', -28.8, 34.8, BOUNDARY_FOOT, 3.4, -38.8, -38, stucco);
    rect('test2 boundary cap south', -10.8, 10.8, BOUNDARY_FOOT, 1.9, 38, 38.8, stucco);
  }

  // =========================================================================
  // NORTH LANE - the pool terrace. The map's one long lane, and the only one
  // allowed to hold a 45 m+ line (spec 3.2).
  // =========================================================================

  // N1 sport court, sunk 0.35 m: one riser, walked in and out on the 0.42 m
  // autostep, so it reads as a pit without becoming a trap. Deliberately BARE -
  // this is the map's "cross it and pray" pocket and filling it to be fair
  // would remove the tension the flank charges for (spec 7.7).
  rect('test2 court floor', -37, -19, -1.35, -0.35, -33, -21, court, { cast: false });
  rect('test2 court kerb north', -36, -30, -0.35, 0.35, -32.6, -32, stone);
  rect('test2 court kerb south', -26, -20, -0.35, 0.35, -22, -21.4, stone);
  rect('test2 court equipment box', -36.4, -34.4, -0.35, 1.55, -24.5, -22.5, stucco);
  // Groundskeeper's store on the court's south-east corner, standing on grade
  // rather than on the sunken floor so its 3.0 m mass actually breaks a line.
  // It is here by measurement: without it the north lane and the west approach
  // joined into one 72.8 m corner-to-corner diagonal. It sits clear of the
  // court-to-pool line at z -27 and clear of the pool deck's own 45 m lane, so
  // the one long lane spec 3.2 asks for survives intact.
  rect('test2 court store base', -22.4, -19, 0, 0.7, -25.4, -21, stone);
  rect('test2 court store body', -22.4, -19, 0.7, 3, -25.4, -21, stucco);
  rect('test2 court store roof', -22.7, -18.7, 3, 3.3, -25.7, -20.7, travertine);

  // N5 bar pavilion, seated in the 6 m gap between the sport court and the pool.
  // Enclosed, one 2 m mouth, roof at 3.4 m and NOT reachable. Walk past it on
  // either side: 3 m of coping walk to the north, 5 m of pool deck to the south.
  //
  // DEVIATION, twice over. The spec's own section 2 seats this at x -13..-5,
  // which lies INSIDE its own pool water rect (x -14..+16) - the two callouts
  // overlap and both cannot be built. It is resolved by moving the pavilion
  // rather than the pool, and by moving it into the lane rather than to the
  // pool's far end: mid-lane is the only place a 6 x 6 m mass does any work
  // here, and without it the north lane measured a 72.8 m corner-to-corner
  // line, which is the old build's defect wearing a new footprint.
  rect('test2 pavilion wall north', -18, -11.5, 0, 3.4, -32, -31.6, stucco);
  rect('test2 pavilion wall west', -18, -17.6, 0, 3.4, -32, -26, stucco);
  rect('test2 pavilion wall east', -11.9, -11.5, 0, 3.4, -32, -26, stucco);
  rect('test2 pavilion wall south west', -18, -16, 0, 3.4, -26.4, -26, stucco);
  rect('test2 pavilion wall south east', -14, -11.5, 0, 3.4, -26.4, -26, stucco);
  rect('test2 pavilion roof', -18.3, -11.2, 3.4, 3.7, -32.3, -25.7, travertine);
  rect('test2 pavilion bar', -17, -13, 0, 1.9, -31, -30.4, stone);

  // N3 pool. Presentation water over a SOLID basin slab - this arena's one
  // authored visual/collider exception, reused verbatim from the old build.
  rect('test2 pool basin floor', -10, 16, -1.55, -0.55, -35, -25, poolTile, { cast: false });
  rect('test2 pool basin wall north', -10, 16, -0.55, 0, -35, -34.7, poolTile);
  rect('test2 pool basin wall south', -10, 16, -0.55, 0, -25.3, -25, poolTile);
  rect('test2 pool basin wall west', -10, -9.7, -0.55, 0, -35, -25, poolTile);
  rect('test2 pool basin wall east', 15.7, 16, -0.55, 0, -35, -25, poolTile);
  // Two exit-step pairs, SW and NE, each 0.27 / 0.28 m; the 0.55 m rim also
  // clears a jump, so nobody is ever trapped in the basin.
  rect('test2 pool step sw low', -9, -6.8, -1.55, -0.28, -26.8, -26, poolTile);
  rect('test2 pool step sw high', -9, -6.8, -1.55, 0, -26, -25.2, poolTile);
  rect('test2 pool step ne high', 10, 12.2, -1.55, 0, -34.4, -33.6, poolTile);
  rect('test2 pool step ne low', 10, 12.2, -1.55, -0.28, -33.6, -32.8, poolTile);
  rect('test2 pool coping south', -10.6, 16.6, 0, 0.3, -25, -24.4, stone);
  rect('test2 pool coping west', -10.6, -10, 0, 0.3, -35, -25, stone);
  rect('test2 pool coping east', 16, 16.6, 0, 0.3, -35, -25, stone);
  rect('test2 pool water sheet', -9.8, 15.8, -0.4, -0.35, -34.8, -25.2, poolWater, { solid: false, shots: false, cast: false });

  // N4 pool deck. The long planter box run is both kneeling cover you shoot
  // over and a mountable step - never a dead-band wall.
  rect('test2 deck planter run', -8, 14, 0, 0.7, -22.9, -22.1, stone);
  rect('test2 deck cabana pier west', -3.3, -2.7, 0, 1.9, -24.6, -24, stucco);
  rect('test2 deck cabana pier east', 7.7, 8.3, 0, 1.9, -24.6, -24, stucco);

  // Flank route 3 - THE LEDGE. A continuous 0.70 m mountable ledge from the
  // garage end, north up the wing's east flank, then west along the pool's
  // north coping, arriving in the pool lane BEHIND anyone watching the covered
  // walk. DEVIATION: the spec runs it across the pool deck screened by the
  // planter box; a 4 m deck cannot carry a screened ledge (a 0.70 m walk behind
  // a 0.70 m screen just stands you up), so it is authored on the map's north
  // rim instead, where the wing and the pool screen it for their full length.
  rect('test2 ledge east flank', 28.4, 31.6, 0, 0.7, -33.6, -20.4, stone);
  rect('test2 ledge north rim', -10.6, 28.4, 0, 0.7, -35.6, -35, stone);

  // N6/N7 north-east wing: a colonnaded ground floor closing the pool lane's
  // east end, two enclosed rooms behind it, and U1 above.
  rect('test2 wing wall north', 16, 28, 0, UPPER_SOFFIT, -32, -31.6, stucco);
  rect('test2 wing wall east', 27.6, 28, 0, UPPER_SOFFIT, -32, -20, stucco);
  rect('test2 wing wall west', 16, 16.4, 0, UPPER_SOFFIT, -32, -26, stucco);
  rect('test2 wing wall south west', 16, 20, 0, UPPER_SOFFIT, -26.4, -26, stucco);
  rect('test2 wing wall south east', 22.4, 28, 0, UPPER_SOFFIT, -26.4, -26, stucco);
  rect('test2 wing room divider', 22, 22.4, 0, UPPER_SOFFIT, -31.6, -28.6, stucco);
  rect('test2 wing counter', 17, 20, 0, 1.9, -30, -29.4, stone);
  // Recessed glazing: set INTO the north wall's own thickness so the ballistic
  // census sees it explained by the wall it is fitted to, which is the pattern
  // every window on this map repeats.
  rect('test2 wing glazing north', 17.5, 21, 0.7, 2.6, -31.9, -31.7, glass, { solid: false, shots: true });
  // Six colonnade piers - the pool lane's only broken ground.
  for (const pierX of [17.5, 22, 26.5]) {
    for (const pierZ of [-25.2, -21.2]) {
      rect(`test2 walk pier ${pierX} ${pierZ}`, pierX - 0.3, pierX + 0.3, 0, UPPER_SOFFIT, pierZ - 0.3, pierZ + 0.3, stucco);
    }
  }
  // U1 floor, holed for the back stair. That stair is the counter-route the
  // spec demands for the map's strongest position: it is entered from the
  // covered walk, i.e. from the pool lane BOTH teams push, not from the team-1
  // spawn.
  rect('test2 wing floor landing', 22.05, 28, UPPER_SOFFIT, UPPER_FLOOR_Y, -32, -29.5, travertine);
  rect('test2 wing floor main', 16, 28, UPPER_SOFFIT, UPPER_FLOOR_Y, -29.5, -20, travertine);
  stairRun('test2 wing stair', 18, 18 + STAIR_RUN, -31.8, -30, 'x+', stone);
  rect('test2 wing upper wall north', 16, 28, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, -32, -31.6, stucco);
  rect('test2 wing upper wall east', 27.6, 28, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, -32, -20, stucco);
  rect('test2 wing balcony rail west', 16, 16.4, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, -29.5, -20, stone);
  rect('test2 wing balcony rail south', 16, 28, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, -20.4, -20, stone);
  rect('test2 wing stairwell rail', 16, 22.05, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, -29.9, -29.5, stone);

  // =========================================================================
  // CENTRE LANE - the house. Short range, four mouths, always contested.
  // =========================================================================

  // C4 north house band: the mansion's north range. Its ground floor is the
  // corridor spine that connects C1 to C2 to C3, and it is also the mass that
  // guarantees no sightline sees two lanes at once (spec 3.2). Its roof
  // parapet tops out at 4.80 m for exactly that reason: measured, a shooter in
  // U1 (eye 5.10 m) sighting the west spawn apron crosses this face at 4.28 m.
  for (const [x0, x1] of [[-24, -14], [-11.5, 6], [8.5, 20], [24, 28]] as const) {
    rect(`test2 house north wall ${x0}`, x0, x1, 0, 3.4, -20, -19.6, stucco);
  }
  // The office window: the lane change the reference's own tips call out. A
  // 0.70 m sill mounted from a 0.35 + 0.35 step outside, a 2.0 m opening above
  // it, and a 0.70 m drop into the room - in from the pool lane, out over the
  // sill, without re-entering the courtyard mouths.
  rect('test2 house office sill', 20, 24, 0, 0.7, -20, -19.6, stone);
  rect('test2 house office lintel', 20, 24, 2.7, 3.4, -20, -19.6, stucco);
  rect('test2 house office step low', 20, 24, 0, 0.35, -21.3, -20.7, stone);
  rect('test2 house office step high', 20, 24, 0, 0.7, -20.7, -20, stone);
  for (const [x0, x1] of [[-24, -20], [-17, -2], [4, 16], [19, 28]] as const) {
    rect(`test2 house south wall ${x0}`, x0, x1, 0, 3.4, -6.4, -6, stucco);
  }
  rect('test2 house wall west', -24, -23.6, 0, 3.4, -20, -6, stucco);
  rect('test2 house wall east', 27.6, 28, 0, 3.4, -20, -6, stucco);
  // Two cross walls with OFFSET door mouths: a 52 m interior hall would have
  // been a longer sightline than anything outdoors on the map.
  rect('test2 house cross west a', -10.2, -9.8, 0, 3.4, -20, -14, stucco);
  rect('test2 house cross west b', -10.2, -9.8, 0, 3.4, -11.5, -6, stucco);
  rect('test2 house cross east a', 13.8, 14.2, 0, 3.4, -20, -18, stucco);
  rect('test2 house cross east b', 13.8, 14.2, 0, 3.4, -15.5, -6, stucco);
  // Blind screens two metres inside each north door. Without them the two north
  // doors, the courtyard's north mouth and the courtyard's south mouth line up
  // well enough for a straight ray, and the pool deck could see the circular
  // drive 52 m away through the house - measured, and exactly what spec 3.2
  // forbids ("no sightline may see two lanes at once"). They also turn the
  // corridor spine into a dogleg, which is what a house corridor is.
  rect('test2 house door screen west', -16, -10, 0, 3.4, -17.5, -17.1, stucco);
  rect('test2 house door screen east', 4, 10.5, 0, 3.4, -17.5, -17.1, stucco);
  rect('test2 house spine counter', -6, -2, 0, 1.9, -12.6, -12, stone);
  rect('test2 house office counter', 17, 21, 0, 1.9, -12, -11.4, stone);
  // U2 upper landing: sees the pool deck through two window slots and nothing
  // else. Its stair comes off the house spine.
  rect('test2 house upper floor landing', -15.95, -4, UPPER_SOFFIT, UPPER_FLOOR_Y, -19.6, -17.8, travertine);
  rect('test2 house upper floor main', -20, -4, UPPER_SOFFIT, UPPER_FLOOR_Y, -17.8, -12, travertine);
  stairRun('test2 house stair', -20, -20 + STAIR_RUN, -19.6, -17.8, 'x+', stone);
  for (const [x0, x1] of [[-15.95, -13], [-11, -8], [-6, -4]] as const) {
    rect(`test2 house upper north wall ${x0}`, x0, x1, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, -19.6, -19.2, stucco);
  }
  for (const [x0, x1] of [[-13, -11], [-8, -6]] as const) {
    rect(`test2 house window slot ${x0}`, x0, x1, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, -19.6, -19.2, stone);
  }
  rect('test2 house upper wall west', -20, -19.6, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, -17.8, -12, stucco);
  rect('test2 house upper wall south', -20, -4, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, -12.4, -12, stucco);
  rect('test2 house upper wall east', -4.4, -4, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, -19.6, -12, stucco);
  rect('test2 house stairwell rail', -20, -15.95, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, -17.8, -17.4, stone);
  // Roof, authored as the complement of the U2 footprint, then the parapet.
  rect('test2 house roof west', -24, -20, 3.4, 3.7, -20, -6, travertine);
  rect('test2 house roof south', -20, -4, 3.4, 3.7, -12, -6, travertine);
  rect('test2 house roof east', -4, 28, 3.4, 3.7, -20, -6, travertine);
  rect('test2 house parapet west', -24, -23.6, 3.7, PARAPET_TOP, -20, -6, stone);
  rect('test2 house parapet east', 27.6, 28, 3.7, PARAPET_TOP, -20, -6, stone);
  rect('test2 house parapet south', -24, 28, 3.7, PARAPET_TOP, -6.4, -6, stone);
  rect('test2 house parapet north west', -24, -20, 3.7, PARAPET_TOP, -20, -19.6, stone);
  rect('test2 house parapet north east', -4, 28, 3.7, PARAPET_TOP, -20, -19.6, stone);

  // C1 living room: team-0 side of the courtyard. Three mouths - west to the
  // apron, east to the courtyard, north to the house spine - and a vantage
  // window over the drive lane on its south wall.
  // The west mouth is at the room's NORTH-WEST corner, not on its centre line.
  // Centred, it lined up with the courtyard's west and east mouths and the
  // kitchen divider's mouth, and the measured result was a 76.2 m line running
  // from the west spawn apron clean through the house into the kitchen's east
  // room - the same single-long-line defect the whole rebuild exists to remove,
  // and a spawn-visibility break as well (spec 4.3).
  rect('test2 living wall west', -24, -23.6, 0, 3.4, -3, 4, stucco);
  for (const [x0, x1] of [[-24, -18], [-14, -8]] as const) {
    rect(`test2 living wall south ${x0}`, x0, x1, 0, 3.4, 3.6, 4, stucco);
  }
  rect('test2 living window sill', -18, -14, 0, 0.7, 3.6, 4, stone);
  rect('test2 living window lintel', -18, -14, 1.9, 3.4, 3.6, 4, stucco);
  // Glazed door recessed INTO the south wall's own 0.4 m thickness, so the
  // ballistic census sees it explained by the wall it is fitted to and the
  // movement census sees a collider under it. This is also ray-traced coverage:
  // QUALITY and MAX need smooth surfaces to reflect on, and the demolished villa
  // wings took the old build's glazing with them.
  rect('test2 living glazing south', -23, -19, 0.7, 2.6, 3.75, 3.85, glass, { solid: false, shots: true });
  rect('test2 living sofa run', -22, -18, 0, 0.7, -1.4, -0.6, timber);
  // Chimney breast, standing across the room rather than against its north
  // wall: hard cover at 1.9 m that a shooter in the west mouth has to lean
  // around before the courtyard's west mouth opens up.
  rect('test2 living chimney breast', -14.6, -12.6, 0, 1.9, -3, 1, stone);
  rect('test2 living roof', -24, -7, 3.4, 3.7, -6, 4, travertine);
  rect('test2 living parapet west', -24, -23.6, 3.7, PARAPET_TOP, -6, 4, stone);
  rect('test2 living parapet south', -24, -7, 3.7, PARAPET_TOP, 3.6, 4, stone);

  // C2 the central courtyard - the heart. 16 x 10 m, open to sky, enclosed on
  // four sides, FOUR mouths, four full-height colonnade piers on a 9 m grid and
  // a 0.70 m fountain kerb to mount. Everything here is short range.
  for (const [z0, z1] of [[-6, -2], [2, 4]] as const) {
    rect(`test2 courtyard wall west ${z0}`, -7, -6.6, 0, PARAPET_TOP, z0, z1, stucco);
    rect(`test2 courtyard wall east ${z0}`, 10, 10.4, 0, PARAPET_TOP, z0, z1, stucco);
  }
  for (const [x0, x1] of [[-6.6, -2], [4, 10]] as const) {
    rect(`test2 courtyard wall south ${x0}`, x0, x1, 0, PARAPET_TOP, 4, 4.4, stucco);
  }
  for (const pierX of [-2.5, 6.5]) {
    for (const pierZ of [-3.5, 1.5]) {
      rect(`test2 courtyard pier ${pierX} ${pierZ}`, pierX - 0.35, pierX + 0.35, 0, 3.4, pierZ - 0.35, pierZ + 0.35, stone);
    }
  }
  rect('test2 courtyard fountain kerb', 0.1, 3.3, 0, 0.7, -2.4, 0.4, stone);

  // C3 kitchen and dining: team-1 side of the courtyard, two connected rooms.
  rect('test2 kitchen wall east', 27.6, 28, 0, 3.4, -6, 4, stucco);
  for (const [x0, x1] of [[10.4, 21], [24, 28]] as const) {
    rect(`test2 kitchen wall south ${x0}`, x0, x1, 0, 3.4, 3.6, 4, stucco);
  }
  for (const [z0, z1] of [[-6, 0], [2.5, 4]] as const) {
    rect(`test2 kitchen divider ${z0}`, 19, 19.4, 0, 3.4, z0, z1, stucco);
  }
  rect('test2 kitchen glazing south', 12.5, 18, 0.7, 2.6, 3.75, 3.85, glass, { solid: false, shots: true });
  rect('test2 kitchen counter run', 12, 16, 0, 1.9, -2, -1.2, stone);
  rect('test2 kitchen island', 21, 25, 0, 0.7, -1.4, -0.2, stone);
  rect('test2 kitchen roof', 10.4, 28, 3.4, 3.7, -6, 4, travertine);
  rect('test2 kitchen parapet east', 27.6, 28, 3.7, PARAPET_TOP, -6, 4, stone);
  rect('test2 kitchen parapet south', 10.4, 28, 3.7, PARAPET_TOP, 3.6, 4, stone);

  // =========================================================================
  // SOUTH LANE - the circular drive. Medium range, a circular island of cover,
  // one elevated room firing across it from each end.
  // =========================================================================

  // S1 laundry block, team-0 side, with U3 and its balcony above. DEVIATION:
  // the spec's footprint starts at x -26; it is carried west to x -30 so the
  // west approach cannot hold a straight pool-deck-to-drive line, which spec
  // 3.2 forbids outright. Measured before the change: 46 m, seeing both lanes.
  for (const [x0, x1] of [[-30, -26], [-23.5, -12], [-9.5, -5]] as const) {
    rect(`test2 laundry wall north ${x0}`, x0, x1, 0, 3.4, 5, 5.4, stucco);
  }
  for (const [z0, z1] of [[5, 8], [10.5, 16]] as const) {
    rect(`test2 laundry wall west ${z0}`, -30, -29.6, 0, 3.4, z0, z1, stucco);
  }
  for (const [x0, x1] of [[-30, -18], [-15, -5]] as const) {
    rect(`test2 laundry wall south ${x0}`, x0, x1, 0, 3.4, 15.6, 16, stucco);
  }
  for (const [z0, z1] of [[5, 8], [11, 16]] as const) {
    rect(`test2 laundry wall east ${z0}`, -5.4, -5, 0, 3.4, z0, z1, stucco);
  }
  for (const [z0, z1] of [[5, 11], [13.5, 16]] as const) {
    rect(`test2 laundry cross ${z0}`, -18, -17.6, 0, 3.4, z0, z1, stucco);
  }
  rect('test2 laundry bench', -27, -23, 0, 1.9, 8, 8.6, stone);
  rect('test2 laundry floor west', -30, -10.5, UPPER_SOFFIT, UPPER_FLOOR_Y, 5, 16, travertine);
  rect('test2 laundry floor south', -10.5, -5, UPPER_SOFFIT, UPPER_FLOOR_Y, 5, 7.35, travertine);
  rect('test2 laundry floor north', -10.5, -5, UPPER_SOFFIT, UPPER_FLOOR_Y, 11.4, 16, travertine);
  stairRun('test2 laundry stair', -9.6, -7.8, 11.4 - STAIR_RUN, 11.4, 'z-', stone);
  rect('test2 laundry upper wall north', -30, -5, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, 5, 5.4, stucco);
  rect('test2 laundry upper wall west', -30, -29.6, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, 5, 16, stucco);
  rect('test2 laundry upper wall east a', -5.4, -5, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, 5, 7.35, stucco);
  rect('test2 laundry upper wall east b', -5.4, -5, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, 11.4, 16, stucco);
  rect('test2 laundry balcony rail', -30, -5, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, 15.6, 16, stone);
  rect('test2 laundry stairwell rail west', -10.9, -10.5, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, 7.35, 11.4, stone);
  rect('test2 laundry stairwell rail north', -10.5, -5, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, 11.4, 11.8, stone);

  // S4 gallery, team-1 side, with U4 above. Carried east to x +32 for the same
  // reason S1 was carried west - the east approach must not hold a two-lane
  // line either. Opens both to the kitchen rooms and to the drive.
  for (const [x0, x1] of [[12, 21], [24, 32]] as const) {
    rect(`test2 gallery wall north ${x0}`, x0, x1, 0, 3.4, 4, 4.4, stucco);
  }
  for (const [z0, z1] of [[4, 9.5]] as const) {
    rect(`test2 gallery wall west ${z0}`, 12, 12.4, 0, 3.4, z0, z1, stucco);
  }
  for (const [x0, x1] of [[12, 20], [23, 32]] as const) {
    rect(`test2 gallery wall south ${x0}`, x0, x1, 0, 3.4, 11.6, 12, stucco);
  }
  rect('test2 gallery wall east', 31.6, 32, 0, 3.4, 4, 12, stucco);
  rect('test2 gallery glazing north', 14, 19.5, 0.7, 2.6, 4.15, 4.25, glass, { solid: false, shots: true });
  rect('test2 gallery sculpture', 20, 22, 0, 1.9, 7, 9, stone);
  // Service wing on the gallery's south-east corner. Same reason as the drive
  // verges: without it the band at z 13-15 ran open from the S1/S4 passage to
  // the east boundary, 47 m, which is a third long lane the map is not allowed.
  rect('test2 gallery service north', 24, 32, 0, 3.4, 12, 12.4, stucco);
  rect('test2 gallery service east', 31.6, 32, 0, 3.4, 12, 16, stucco);
  rect('test2 gallery service south', 24, 32, 0, 3.4, 15.6, 16, stucco);
  rect('test2 gallery service west', 24, 24.4, 0, 3.4, 12, 16, stucco);
  rect('test2 gallery service roof', 23.7, 32.3, 3.4, 3.7, 11.7, 16.3, travertine);
  rect('test2 gallery floor east', 17.5, 32, UPPER_SOFFIT, UPPER_FLOOR_Y, 4, 12, travertine);
  rect('test2 gallery floor north', 12, 17.5, UPPER_SOFFIT, UPPER_FLOOR_Y, 4, 4.6, travertine);
  rect('test2 gallery floor south', 12, 17.5, UPPER_SOFFIT, UPPER_FLOOR_Y, 9.45, 12, travertine);
  stairRun('test2 gallery stair', 13.5, 15.3, 5.4, 5.4 + STAIR_RUN, 'z+', stone);
  rect('test2 gallery upper wall north', 12, 32, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, 4, 4.4, stucco);
  rect('test2 gallery upper wall east', 31.6, 32, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, 4, 12, stucco);
  rect('test2 gallery upper wall west a', 12, 12.4, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, 4, 4.6, stucco);
  rect('test2 gallery upper wall west b', 12, 12.4, UPPER_FLOOR_Y, UPPER_FLOOR_Y + UPPER_WALL, 9.45, 12, stucco);
  rect('test2 gallery balcony rail', 12, 32, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, 11.6, 12, stone);
  rect('test2 gallery stairwell rail east', 17.5, 17.9, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, 4.6, 9.45, stone);
  rect('test2 gallery stairwell rail north', 12, 17.5, UPPER_FLOOR_Y, UPPER_FLOOR_Y + BALCONY_RAIL, 4.2, 4.6, stone);

  // S3 drive island: the only cover in the middle of the drive lane, and it
  // must be circumnavigable. The kerb is 0.30 m so it is walked onto, and the
  // planters and fountain plinth clear the standing eye.
  rect('test2 drive island kerb', -4, 8, -0.3, 0.3, 21, 29, stone, { cast: false });
  for (const [px, pz] of [[-3, 22], [2, 21.6], [7, 22], [-3, 28], [2, 28.4], [7, 28]] as const) {
    rect(`test2 drive planter ${px} ${pz}`, px - 0.8, px + 0.8, 0.3, 2.2, pz - 0.8, pz + 0.8, hedge);
  }
  rect('test2 drive fountain plinth', 0.5, 3.5, 0.3, 2.2, 24, 26, stone);
  // The drive lane's two verge masses. NOT in the spec's callout list, and
  // they are here for a measured reason: the diagram's own drive band is 60 m
  // wide (x -34..+26) and, left open, it held a 74.7 m ground-to-ground line -
  // a second 45 m+ lane, which spec 3.2 allows exactly one of, and it is the
  // pool terrace. A carport at the circle's west mouth and a planted verge at
  // its east mouth cut it with architecture rather than prop clutter, and the
  // carport is also what U3's balcony is given to overlook.
  rect('test2 carport wall north', -30, -22, 0, 3.4, 18, 18.4, stucco);
  rect('test2 carport wall west', -30, -29.6, 0, 3.4, 18, 26, stucco);
  rect('test2 carport wall south', -30, -22, 0, 3.4, 25.6, 26, stucco);
  rect('test2 carport pier east', -22.4, -22, 0, 3.4, 18, 21, stucco);
  rect('test2 carport pier east b', -22.4, -22, 0, 3.4, 23, 26, stucco);
  rect('test2 carport roof', -30.3, -21.7, 3.4, 3.7, 17.7, 26.3, travertine);
  for (const [px, pz] of [[16.5, 18.5], [19.5, 18.5]] as const) {
    rect(`test2 drive verge ${px}`, px - 1.5, px + 1.5, 0, 1.9, pz - 1.5, pz + 1.5, hedge);
  }
  rect('test2 drive approach kerb west', -14, -6, 0, 0.7, 32, 32.8, stone);
  rect('test2 drive approach kerb east', 4, 12, 0, 0.7, 32, 32.8, stone);

  // =========================================================================
  // THE TWO ENDS
  // =========================================================================

  // E1 west spawn apron. Open unpaved end, two mountable garden walls and a
  // planter run screening it from the approach. No elevated room sees into it
  // (measured: U1's line into this apron crosses the house parapet at 4.28 m
  // against a 4.80 m top).
  rect('test2 apron garden wall north', -44, -40.5, 0, 0.7, -7.4, -6.8, stone);
  rect('test2 apron garden wall south', -44, -40.5, 0, 0.7, 1.4, 2, stone);
  rect('test2 apron planter run', -40.4, -39.6, 0, 0.7, -6, 1, hedge);

  // The garden store in the west approach. It is not in the reference's own
  // callout list; it is here because without it the west approach holds a 46 m
  // line that sees the pool deck AND the circular drive, which spec 3.2 bans.
  rect('test2 store wall north', -38, -30, 0, 3.4, -17, -16.6, stucco);
  rect('test2 store wall south', -38, -30, 0, 3.4, -9.4, -9, stucco);
  rect('test2 store wall west', -38, -37.6, 0, 3.4, -17, -9, stucco);
  rect('test2 store wall east a', -30.4, -30, 0, 3.4, -17, -14, stucco);
  rect('test2 store wall east b', -30.4, -30, 0, 3.4, -11.5, -9, stucco);
  rect('test2 store roof', -38.3, -29.7, 3.4, 3.7, -17.3, -8.7, travertine);
  rect('test2 store rack', -36, -33, 0, 1.9, -14, -13.4, stone);

  // E2 east spawn: a long covered garage block, open along its west face, with
  // bay piers as hard cover and a 0.70 m kerb line to step up onto. Its roof is
  // at 4.0 m and is not reachable.
  rect('test2 garage wall north', 36, 50, 0, 4, -13.4, -13, stucco);
  rect('test2 garage wall south', 36, 50, 0, 4, 11, 11.4, stucco);
  rect('test2 garage wall east', 49.6, 50, 0, 4, -13, 11, stucco);
  rect('test2 garage roof', 35.6, 50, 4, 4.3, -13.4, 11.4, travertine);
  for (const pierZ of [-12, -8, -4, 0, 4, 8]) {
    rect(`test2 garage pier ${pierZ}`, 36, 36.6, 0, 4, pierZ - 0.35, pierZ + 0.35, stucco);
  }
  rect('test2 garage kerb', 37.4, 38.2, 0, 0.7, -12, 10, stone);
  rect('test2 garage bench', 44, 48, 0, 1.9, 9.4, 10, stone);

  // Domination flag poles at the zone anchors (presentation; banners tinted by
  // the mode presentation at runtime via these exact names). All three anchors
  // now stand on flat paving, so the old zone-B plinth drop is gone.
  for (const zone of TEST2_DOMINATION_ZONES) {
    const [zoneX, , zoneZ] = zone.centre;
    block(builder, `test2 zone plinth ${zone.id}`, [zoneX, 0.12, zoneZ], [1.6, 0.24, 1.6], stone);
    // One material per zone: the runtime recolours these by name, and keeping
    // them distinct also keeps them out of the merged presentation batch,
    // whose shell-scale AABB would otherwise have to be triaged.
    block(builder, `test2-zone-flag-pole-${zone.id}`, [zoneX, 2.1, zoneZ], [0.12, 4, 0.12], standard(0x8b949c, 0.5, 0.7), { solid: false, shots: false });
    block(builder, `test2-zone-flag-banner-${zone.id}`, [zoneX + 0.65, 3.55, zoneZ], [1.3, 0.8, 0.06], standard(0xcccccc, 0.85, 0.02), { solid: false, shots: false });
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
    // HF-402 (2026-09-02). Owner: "currently raid spawns me in outside".
    //
    // The 2026-08-31 table put a spawn LINE at x = +/-47 across 46 m of z. It
    // passed the gate of its day because "walkable" was measured as "not
    // inside a collider" against the bounding RECTANGLE - and TEST2_BLOB, the
    // building footprint, leaves ~26% of that rectangle as nothing: no paving,
    // no route, a 3.4 m boundary wall between it and the map, and the physics
    // fail-safe floor 1.2 m under grade. Measured before this change
    // (scripts/qa/measure-spawn-layouts.ts): team 0 had 5/6 spawns with no
    // floor beneath and 6/6 with no autostep route to the enemy; team 1 had
    // 4/6 with no floor and 6/6 with no route, because its two grounded points
    // sat in the garage, whose whole west face is a 0.7 m kerb that a player
    // jumps and a bot never crosses (bots collide against everything in their
    // 1.7 m span and Raid authors no vertical navigation).
    //
    // These points come from scripts/qa/solve-spawn-layouts.ts under the
    // HF-402 constraint set (src/spawn-layout-constraints.ts): every point has
    // paving or a collider top under its feet, an autostep-only route to the
    // enemy table, hard cover within 3 m, and NO enemy spawn in sight at any
    // range; the tables are 52 m apart. The solver searched each team's back
    // band of the map and spread the points across it, Nuke Town style.
    //
    // Re-solved 2026-09-02 after review: the first HF-402 pass bounded cover
    // from above (within 6 m) and never from below, so the farthest-point
    // search parked spawns against wall faces - ten of its twelve points stood
    // 0.5-1.2 m from a face that fills the view, and the respawn at (-31, 22)
    // opened with a stucco wall across the whole screen and only 17% of the
    // compass walkable. The constraint set now carries a standoff floor
    // (1.2 m) and an open-arc floor (30%), both calibrated on the SHIPPED
    // maps' own minima, and these points clear both.
    //
    // NOT an X mirror any more, deliberately: the map's east end (the E2
    // garage wing and the x 28-36 strip in front of it) is sealed off from the
    // rest of the map at autostep by the garage kerb, the solid kitchen east
    // wall (27.6-28, z -6..4) and the solid gallery east wall (31.6-32, z
    // 4..12) - the spec's E2 exits "W to C3" and "SW to S4" were never built
    // - so team 1's back band is the interior east of the courtyard until
    // that geometry gets its doors. Pinned by src/spawn-layout-quality.test.ts.
    spawns: spawnRecord(
      [[-46, 0], [-30, -34], [-32, 19], [-32, -15], [-30, 2], [-38, -25], [-39, 8], [-41, -9]],
      [[22, 1], [24, -24], [24, 22], [26, -11], [30, 10], [22, 13], [22, -17], [24, 7]],
    ),
    // Ten at grade and FOUR on the +3.40 m floors. The old comment kept every
    // anchor at grade because the only raised surface was a 0.70 m deck a bot
    // had to jump onto; with four stairs and four upper rooms, bots that never
    // go upstairs simply do not defend the map's power positions.
    patrolPoints: [
      [-44, 0, -3], [-30, 0, -26], [0, 0, -23], [24, 0, -22],
      [2, 0, -1], [-16, 0, -1], [22, 0, -1], [2, 0, 24],
      [44, 0, 0], [-16, 0, 12],
      [22, UPPER_FLOOR_Y, -25], [-12, UPPER_FLOOR_Y, -15],
      [-16, UPPER_FLOOR_Y, 11], [24, UPPER_FLOOR_Y, 8],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { ...TEST2_BOUNDS },
    houseTelemetry: emptyTelemetry(),
    // Lowest standable surface is the pool basin at -0.55 m; unchanged.
    physicsSafetyFloorY: -1.2,
  };
}
