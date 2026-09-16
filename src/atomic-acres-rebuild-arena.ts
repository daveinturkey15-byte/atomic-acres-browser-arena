/**
 * LayoutGray — exterior density blockout for `atomic-acres-rebuild` (NEW WORLD).
 *
 * WHAT THIS IS. Presentation-only graybox massing: every mesh is emitted with
 * `{ solid: false, shots: false }`, so this module contributes ZERO colliders,
 * ZERO shot surfaces and ZERO spawns. Gameplay authority (colliders, spawns,
 * shots, cover) is owned by AuthorityGray
 * (`src/atomic-acres-rebuild-authority.ts`) and interior shells by
 * InteriorsGray (`src/atomic-acres-rebuild-interiors.ts`). Front-door portals
 * (≥0.95 m) are NOT carved here; the shells below are solid visual mass and
 * InteriorsGray owns the doorway cut + matching authority.
 *
 * PLATES (all four graybox plates read 2026-09-14):
 * - `batch-4-nuketown-graybox/gray_topdown_01.png` — full-block massing: loop
 *   road with south entry, twin houses flanking the loop, attached garages +
 *   driveways + parked cars, sheds in the north (back) corners, crate clusters
 *   (south choke + island + yards), closed perimeter walls with pillar posts,
 *   side service roads with parked trailers outside the walls.
 * - `batch-4-nuketown-graybox/gray_street_01.png` — street-level south entry:
 *   crate-barricade choke across the road, sidewalks + hedges + lamps flanking,
 *   bus + semi nose-to-nose in the loop, island crates, utility poles.
 * - `batch-4-nuketown-graybox/gray_aerial_01.png` — oblique massing: gabled
 *   house shells + porches + chimneys, patio sets (umbrella + table) behind
 *   both houses, green-blob trees in yards and desert, rock outcrops south.
 * - `batch-4-nuketown-graybox/gray_aerial_02.png` — second oblique: north
 *   entrance gap between the sheds, rear patio furniture, perimeter pillars,
 *   scrub/rocks scattered on the desert surround.
 * - `batch-4-nuketown-graybox/BRIEF.md` — read first per the task order; road
 *   enters the bottom of frame (south), garages flank BOTH houses, sheds in
 *   back corners, south entry choked by crate barricade + sandbags.
 *
 * LAYOUT_CONTRACT FACTS (`atomic-acres-catalog/LAYOUT_CONTRACT.md`):
 * fact 1 high-desert surround, lawns ONLY inside fenced lots; fact 2 twin
 * two-story houses (WEST teal identity / EAST yellow identity — siding color is
 * art truth, massing here is gray); fact 3 horseshoe/loop asphalt spine with
 * south entry (BRIEF mirror note: graybox enters south, facts hold); fact 4
 * center-loop cover: school bus + semi nose-to-nose + crate clusters; fact 5
 * north entrance: rusty car + welcome sign between the back-yard sheds;
 * fact 6 south exit: jeep + sandbag/crate emplacement across the road;
 * fact 7 four concrete pads in front yards + hedge rows; fact 8 back yards
 * with sheds/patios; fact 9 wooden privacy fences divide lots, lamps line the
 * loop, low hedges on road edges; fact 10 team color blocking (art, not mass).
 *
 * DETERMINISM. One seeded PRNG (mulberry32, SEED below) drives scrub/rock
 * scatter only. No `Math.random` anywhere in this file.
 *
 * ASSUMPTIONS (for AuthorityGray / InteriorsGray / ShellGray):
 * A1. North = -Z, south = +Z. South entry road runs x=0 from z=+12 to z=+34.
 * A2. House shells are solid visual boxes; InteriorsGray carves ≥0.95 m front
 *     doors on the loop-facing sides (west house east face, east house west
 *     face) and owns the matching movement/shot authority.
 * A3. All dims in metres. Wall height 3 m/storey; crates 1 m; lamps 5.6 m.
 * A4. `atomic-acres-rebuild` id is cast (`as unknown as ArenaId`) because
 *     ShellGray (registry slice) lands in parallel; remove the cast once
 *     `src/arena-identity.ts` carries the id.
 */

import * as THREE from 'three';
import { atomicAcresRebuildAuthority } from './atomic-acres-rebuild-authority';
import {
  ATOMIC_ACRES_REBUILD_DOORWAYS,
  ATOMIC_ACRES_REBUILD_ROOMS,
  ATOMIC_ACRES_REBUILD_SPREAD,
  ATOMIC_ACRES_REBUILD_WALLS,
  frontDoorPortal,
  garageWalls,
  rearLinkGap,
  REBUILD_DOOR_HEAD_Y,
  REBUILD_SHELL_WALL_T,
  REBUILD_STAIR_RISER,
  REBUILD_STAIR_STEPS,
  REBUILD_STAIR_TREAD,
  stairSpec,
  upperDoors,
  upperRooms,
  upperSlabs,
  upperWalls,
} from './atomic-acres-rebuild-interiors';
import { box, emptyTelemetry, standard, type Builder } from './additional-maps';
import { texturedMaterial } from './art-kit';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ArenaId } from './arena-identity';
import type { ArenaMap } from './map';

/** Deterministic seed for scrub/rock scatter. */
export const ATOMIC_ACRES_REBUILD_SEED = 0xaac4e9;

/** Playfield bounds: perimeter walls at |x|<=38.4, z in [-41.6, +38.4] (SPREAD 1.6x). */
export const ATOMIC_ACRES_REBUILD_BOUNDS = Object.freeze({
  minX: -44,
  maxX: 44,
  minZ: -48,
  maxZ: 48,
});

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

type Vec3 = [number, number, number];
type Size3 = [number, number, number];
type BoxOptions = Parameters<typeof box>[5];

const spreadXZ = (v: Vec3): Vec3 => [v[0] * ATOMIC_ACRES_REBUILD_SPREAD, v[1], v[2] * ATOMIC_ACRES_REBUILD_SPREAD];

/**
 * The arena's own centred-box helper: one named presentation-only box.
 * AuthorityGray owns all solidity; `solid`/`shots` are pinned off here.
 */
function centred(
  builder: Builder,
  name: string,
  center: Vec3,
  size: Size3,
  material: THREE.Material,
  options: BoxOptions = {},
): THREE.Mesh {
  const c = spreadXZ(center);
  const s: Size3 = [size[0] * ATOMIC_ACRES_REBUILD_SPREAD, size[1], size[2] * ATOMIC_ACRES_REBUILD_SPREAD];
  return box(builder, name, c, s, material, {
    cast: true,
    ...options,
    solid: false,
    shots: false,
  });
}

/**
 * The arena's own mirrored-pair helper: two presentation-only boxes at ±x.
 * Returns the two meshes. Most street/wall/hedge/lamp/pad massing is x-mirrored.
 */
function pair(
  builder: Builder,
  baseName: string,
  x: number,
  y: number,
  z: number,
  size: Size3,
  material: THREE.Material,
  options: BoxOptions = {},
): readonly [THREE.Mesh, THREE.Mesh] {
  const sx = `${baseName}-west`;
  const ex = `${baseName}-east`;
  return [
    centred(builder, x <= 0 ? sx : ex, [x <= 0 ? x : -x, y, z], size, material, options),
    centred(builder, x <= 0 ? ex : sx, [x <= 0 ? -x : x, y, z], size, material, options),
  ] as const;
}

export function buildAtomicAcresRebuild(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Atomic Acres Rebuild graybox';
  scene.add(root);
  const builder: Builder = {
    root,
    colliders: [],
    physicsColliders: [],
    raycastMeshes: [],
    shotSurfaces: [],
    ballisticSurfaceSequence: 0,
  };
  // Shared async GLB loader (catalog kitbash over massing placeholders).
  const treeLoader = new GLTFLoader();
  // Kitbash: catalog GLB over massing placeholders (async, fallback-safe).
  // Base-frame pos; SPREAD + yaw applied on the anchor; placeholders hide
  // only after the GLB resolves, so a missing file never breaks the lane.
  // Loads run at most 4-deep: two dozen parallel loadAsync calls starve in
  // the browser's per-host queue and nothing resolves before capture settle.
  let kitbashDepth = 0;
  const kitbashQueue: Array<() => void> = [];
  const kitbashPump = (): void => {
    while (kitbashDepth < 4 && kitbashQueue.length > 0) {
      const start = kitbashQueue.shift()!;
      kitbashDepth += 1;
      start();
    }
  };
  // Exterior skin infixes hidden when a house GLB lands. Authority, interior
  // fit-out, slabs, stairs, furniture and lintels never match (excluded below).
  const houseSkinInfixes = ['-rear-south', '-rear-north', '-north', '-south', '-front-south', '-front-north', '-upper-', '-roof', '-ridge', '-chimney', '-porch-', '-win-', '-door-jamb', '-door-head', '-door-panel', '-fascia', '-apron-', '-porch-rail', '-planter'];
  const hideHouseSkin = (id: string): void => {
    for (const child of [...root.children]) {
      if (!(child instanceof THREE.Mesh) || !child.name.startsWith(`aarr-house-${id}-`)) continue;
      if (child.name.includes('lintel') || child.name.includes('inwall') || child.name.includes('upwall') || child.name.includes('slab') || child.name.includes('stair') || child.name.includes('furn') || child.name.includes('-floor')) continue;
      if (houseSkinInfixes.some((infix) => child.name.includes(infix))) child.visible = false;
    }
  };
  const kitbash = (url: string, pos: Vec3, yaw: number, hide: THREE.Mesh[], hideHouseId?: string, raw?: boolean): void => {
    const anchor = new THREE.Group();
    anchor.name = `aarr-glb-${url.split('/').pop()}`;
    // raw = asset authored at TRUE world dims (Lane N spread rebuilds):
    // position and scale pass through untouched.
    const spread = raw === true ? 1 : ATOMIC_ACRES_REBUILD_SPREAD;
    anchor.position.set(pos[0] * spread, pos[1], pos[2] * spread);
    anchor.rotation.set(0, yaw, 0);
    anchor.scale.set(spread, 1, spread);
    root.add(anchor);
    kitbashQueue.push(() => {
      treeLoader.loadAsync(url).then((gltf) => {
        anchor.add(gltf.scene);
        for (const mesh of hide) mesh.visible = false;
        if (hideHouseId !== undefined) hideHouseSkin(hideHouseId);
      }).catch(() => {
        // Placeholder massing stays.
      }).finally(() => {
        kitbashDepth -= 1;
        kitbashPump();
      });
    });
    kitbashPump();
  };
  // Graybox palette: untextured massing gray + green blobs (plates are gray).
  // Wave-1 PBR (aa-swarm lane-pbr, manifest atomic-acres-rebuild-interior-pbr-20260915):
  // shared textured materials below; exterior shells stay gray for the art pass.
  const pbr = (dir: string, name: string, repeatX: number, repeatY: number): THREE.Material =>
    texturedMaterial(`./assets/rebuild/${dir}/${name}_BAKE_DIFFUSE.png`, {
      roughnessPath: `./assets/rebuild/${dir}/${name}_BAKE_ROUGH.png`,
      roughness: 1.0,
      metalness: 0.0,
      repeatX,
      repeatY,
    });
  const inPbr = (name: string, repeatX: number, repeatY: number): THREE.Material =>
    pbr('interiors', name, repeatX, repeatY);
  const gndPbr = (name: string, repeatX: number, repeatY: number): THREE.Material =>
    pbr('ground', name, repeatX, repeatY);
  const plasterByLen = new Map<number, THREE.Material>();
  const plasterFor = (len: number): THREE.Material => {
    const r = Math.max(1, Math.min(6, Math.round(len / 3)));
    let mat = plasterByLen.get(r);
    if (!mat) {
      mat = inPbr('InteriorPlaster', r, 1);
      plasterByLen.set(r, mat);
    }
    return mat;
  };
  const bathTile = inPbr('BathTile', 2, 1);
  const woodFloor = inPbr('WoodFloor', 3, 3);
  const stairTimber = inPbr('StairTimber', 1, 1);
  const garageConcrete = inPbr('GarageConcrete', 2, 1);
  const massing = standard(0xb9bcc0, 0.92, 0.02);
  const roof = standard(0x9aa0a6, 0.9, 0.04);
  const concrete = standard(0xc9c7c2, 0.96, 0.02);
  const asphalt = gndPbr('AsphaltLoop', 5, 5);
  const sidewalk = gndPbr('SidewalkConcrete', 2, 2);
  const timber = standard(0x8a6f4d, 0.9, 0.04);
  const lawn = gndPbr('LawnPatchy', 3, 3);
  const sand = gndPbr('DesertSand', 8, 8);
  const vehicle = standard(0xa8adb3, 0.6, 0.3);
  const rust = standard(0x8a5a3a, 0.9, 0.1);
  const olive = standard(0x6b7043, 0.9, 0.05);
  const darkPole = standard(0x3a3d42, 0.7, 0.4);
  const hedge = standard(0x5d8f3e, 0.98, 0.0);
  const rock = standard(0x9d988c, 0.98, 0.02);
  const crate = standard(0xa3a7ad, 0.9, 0.05);

  // ---- Desert surround + side service roads (fact 1; topdown plate edges) ----
  centred(builder, 'aarr-desert-apron', [0, -0.06, 0], [140, 0.1, 150], sand, { cast: false });
  pair(builder, 'aarr-service-road', 31, 0.0, 0, [7, 0.06, 90], asphalt, { cast: false });
  // Parked trailers outside the walls (topdown plate east/west edges).
  for (const [side, z] of [[-31, -18], [-31, 8], [31, -8], [31, 16]] as Array<[number, number]>) {
    centred(builder, `aarr-outside-trailer-${side < 0 ? 'w' : 'e'}-${z}`, [side, 1.4, z], [2.6, 2.8, 9], vehicle);
  }

  // ---- Lawns: green ONLY inside fenced lots (fact 1; aerial plates) ----
  pair(builder, 'aarr-lawn-front', 14, 0.03, 12, [11, 0.06, 12], lawn, { cast: false });
  pair(builder, 'aarr-lawn-back', 14, 0.03, -16, [12, 0.06, 10], lawn, { cast: false });
  pair(builder, 'aarr-lawn-side', 21, 0.03, -2, [5, 0.06, 9], lawn, { cast: false });

  // ---- Loop road + south entry (fact 3; all plates, BRIEF mirror note) ----
  // THE CARRIAGEWAY ITSELF (aa-swarm lane-value, 2026-09-15). This section
  // header has claimed a loop road and a south entry since the graybox wave;
  // until now the only asphalt it emitted was the 6 m stub OUTSIDE the north
  // wall, and the `asphalt` material's only other use is the two service roads
  // outside the east and west walls. Every metre of road a player or a review
  // camera can see was bare `sand`. That is not a shading defect and no rig
  // number reaches it:
  //   * measured albedos (the shipped bakes, not the source intent) -
  //     AsphaltLoop_BAKE_DIFFUSE linear Y 0.1223, DesertSand_BAKE_DIFFUSE
  //     0.4347. Through this arena's own chain that is display 0.601 against
  //     0.868 sunlit: a 0.267 step, 68 eight-bit codes, the largest
  //     area-weighted value step the palette owns and the only one big enough
  //     to give the frame a floor. The rig, by comparison, can model a
  //     0.114 lit-to-shade step on the same surface.
  //   * repo-state/rb7-rebuild-topdown.png measures p1 0.485 and 0.01% of the
  //     frame below display 0.25; the plates it is graded against measure p1
  //     0.086 and 24.7%. The frame has no dark because the dark SURFACE is
  //     absent, not because it is mis-lit.
  //   * repo-state/rb7-rebuild-street.png puts the bus+semi pair - the anchor
  //     every plate composes the loop around - 0.012 of display value away
  //     from the ground it stands on. Asphalt under it is what separates it.
  // NO NEW NUMBER IS AUTHORED HERE. Each carriageway is the gap between
  // sidewalks this file already places, so the road cannot drift from its own
  // kerbs: the loop takes aarr-sidewalk-loop's z centre 2 and length 20, and
  // its width 25.2 is the span between those sidewalks' inner edges
  // (13.6 - 2.0/2 = 12.6 each side); the south entry takes
  // aarr-sidewalk-entry's z centre 23 and length 22 with width 7 between its
  // inner edges (4.6 - 2.2/2 = 3.5), which is also the width the north stub
  // already uses; the spine closes the remaining gap from the loop's north
  // edge (z -8) to that stub's south edge (z -26 = the perimeter wall line),
  // at the same width. y is the stub's own 0.02 centre / 0.04 thickness, so
  // the road sits 0.05 m above the desert apron's top face (-0.01) and 0.02 m
  // below every sidewalk, lawn and pad face (0.06): no plane can z-fight.
  // Presentation only, like everything else in this file - centred() pins
  // solid:false and shots:false, so AuthorityGray's colliders, shot surfaces
  // and spawns are untouched; `cast: false` matches every other ground plane
  // (a 40 mm slab must not cast onto the apron below it) while receiveShadow
  // stays on, which is the point: this is the surface the bus, the semi, the
  // houses and the fence lines finally have something to cast a shadow ONTO.
  centred(builder, 'aarr-road-loop', [0, 0.02, 2], [25.2, 0.04, 20], asphalt, { cast: false });
  centred(builder, 'aarr-road-entry-south', [0, 0.02, 23], [7, 0.04, 22], asphalt, { cast: false });
  centred(builder, 'aarr-road-spine-north', [0, 0.02, -17], [7, 0.04, 18], asphalt, { cast: false });
  centred(builder, 'aarr-road-entry-stub-north', [0, 0.02, -29], [7, 0.04, 6], asphalt, { cast: false });
  // Center island disc, SPREAD 1.6x (r 4.8 at z 4.8).
  const island = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 0.12, 24), concrete);
  island.name = 'aarr-loop-island';
  island.position.set(0, 0.06, 4.8);
  island.receiveShadow = true;
  root.add(island);
  pair(builder, 'aarr-sidewalk-entry', 4.6, 0.03, 23, [2.2, 0.06, 22], sidewalk, { cast: false });
  pair(builder, 'aarr-sidewalk-loop', 13.6, 0.03, 2, [2.0, 0.06, 20], sidewalk, { cast: false });
  pair(builder, 'aarr-sidewalk-north', 8, 0.03, -8, [9, 0.06, 2.0], sidewalk, { cast: false });

  // ---- Exterior dress vocabulary (ported from wave-2 lane F dress.patch;
  // full derivation in aa-swarm-20260915/lane-dress/RATIONALE.md). BASE-frame
  // numbers: centred() spreads x/z, never y. All boards sit centred on shell
  // outer planes (inner half inside brick authority) or under height floors.
  const DRESS_BOARD_T = 0.12;
  const DRESS_REVEAL_T = 0.08;
  const DRESS_SILL_Y = 0.95;
  const DRESS_HEAD_Y = 2.35;
  const DRESS_REVEAL_INSET = 0.11;
  const DRESS_REVEAL_DROP = 0.18;
  const DRESS_SHUTTER_W = 0.3;
  const dressWindow = (
    name: string,
    axis: 'x' | 'z',
    plane: number,
    along: number,
    width: number,
    shutters: boolean,
  ): THREE.Mesh[] => {
    const at = (offset: number): Vec3 => (axis === 'z'
      ? [along + offset, (DRESS_SILL_Y + DRESS_HEAD_Y) / 2, plane]
      : [plane, (DRESS_SILL_Y + DRESS_HEAD_Y) / 2, along + offset]);
    const span = (w: number, h: number, t: number): Size3 => (axis === 'z' ? [w, h, t] : [t, h, w]);
    const height = DRESS_HEAD_Y - DRESS_SILL_Y;
    const out: THREE.Mesh[] = [
      centred(builder, `${name}-casing`, at(0), span(width, height, DRESS_BOARD_T), massing),
      centred(builder, `${name}-reveal`, at(0), span(width - 2 * DRESS_REVEAL_INSET, height - 2 * DRESS_REVEAL_DROP, DRESS_REVEAL_T), roof),
    ];
    if (!shutters) return out;
    for (const side of [-1, 1] as const) {
      out.push(centred(builder, `${name}-shutter-${side < 0 ? 'a' : 'b'}`, at((side * (width + DRESS_SHUTTER_W)) / 2), span(DRESS_SHUTTER_W, height, DRESS_BOARD_T), timber));
    }
    return out;
  };

  const houseSpecs = [
    { id: 'west', cx: -13.5, cz: 1.5, w: 7.2, d: 6.0, porch: 1 as const },
    { id: 'east', cx: 13.5, cz: -1.5, w: 7.8, d: 6.4, porch: -1 as const },
  ] as const;
  for (const house of houseSpecs) {
    const face = house.id === 'west' ? 1 : -1; // loop-facing side
    // Walkable ground floor, hollow shell; upper stays solid look-only massing
    // (no stairs yet — upper is look-only until the art pass).
    const t = REBUILD_SHELL_WALL_T;
    const portal = frontDoorPortal(house.id);
    const x0 = house.cx - house.w / 2;
    const x1 = house.cx + house.w / 2;
    const z0 = house.cz - house.d / 2;
    const z1 = house.cz + house.d / 2;
    const frontX = face === 1 ? x1 : x0;
    const rearX = face === 1 ? x0 : x1;
    const gap0 = portal.centreZ - portal.width / 2;
    const gap1 = portal.centreZ + portal.width / 2;
    // Floor slab (presentation; movement floor is AuthorityGray's proxy).
    centred(builder, `aarr-house-${house.id}-floor`, [house.cx, 0.06, house.cz], [house.w, 0.12, house.d], woodFloor, { cast: false });
    // Rear wall split at the garage personnel link + side walls, full storey.
    const [linkZ0, linkZ1] = rearLinkGap(house.id);
    const rearCX = rearX + (face === 1 ? t / 2 : -t / 2);
    centred(builder, `aarr-house-${house.id}-rear-south`, [rearCX, 1.5, (z0 + linkZ0) / 2], [t, 3, Math.max(linkZ0 - z0, 0.05)], massing);
    centred(builder, `aarr-house-${house.id}-rear-north`, [rearCX, 1.5, (linkZ1 + z1) / 2], [t, 3, Math.max(z1 - linkZ1, 0.05)], massing);
    centred(builder, `aarr-house-${house.id}-rear-link-lintel`, [rearCX, (REBUILD_DOOR_HEAD_Y + 3) / 2, (linkZ0 + linkZ1) / 2], [t, 3 - REBUILD_DOOR_HEAD_Y, linkZ1 - linkZ0], massing);
    centred(builder, `aarr-house-${house.id}-north`, [house.cx, 1.5, z1 - t / 2], [house.w, 3, t], massing);
    centred(builder, `aarr-house-${house.id}-south`, [house.cx, 1.5, z0 + t / 2], [house.w, 3, t], massing);
    // Loop-facing wall split around the door gap + lintel above.
    const frontCX = frontX + (face === 1 ? -t / 2 : t / 2);
    centred(builder, `aarr-house-${house.id}-front-south`, [frontCX, 1.5, (z0 + gap0) / 2], [t, 3, Math.max(gap0 - z0, 0.05)], massing);
    centred(builder, `aarr-house-${house.id}-front-north`, [frontCX, 1.5, (gap1 + z1) / 2], [t, 3, Math.max(z1 - gap1, 0.05)], massing);
    centred(builder, `aarr-house-${house.id}-front-lintel`, [frontCX, (REBUILD_DOOR_HEAD_Y + 3) / 2, portal.centreZ], [t, 3 - REBUILD_DOOR_HEAD_Y, portal.width], massing);
    // Upper storey hollow shell (walkable, concept cutaways).
    centred(builder, `aarr-house-${house.id}-upper-rear`, [rearX + (face === 1 ? t / 2 : -t / 2), 4.5, house.cz], [t, 3, house.d], massing);
    centred(builder, `aarr-house-${house.id}-upper-front`, [frontX + (face === 1 ? -t / 2 : t / 2), 4.5, house.cz], [t, 3, house.d], massing);
    centred(builder, `aarr-house-${house.id}-upper-north`, [house.cx, 4.5, z1 - t / 2], [house.w, 3, t], massing);
    centred(builder, `aarr-house-${house.id}-upper-south`, [house.cx, 4.5, z0 + t / 2], [house.w, 3, t], massing);
    for (const wall of ATOMIC_ACRES_REBUILD_WALLS) {
      if (wall.house !== house.id) continue;
      const cx = (wall.x0 + wall.x1) / 2;
      const cz = (wall.z0 + wall.z1) / 2;
      const len = Math.max(wall.x1 - wall.x0, wall.z1 - wall.z0);
      const bath = wall.id.includes('bath');
      centred(builder, `aarr-house-${house.id}-inwall-${wall.id}`, [cx, 1.5, cz], [wall.x1 - wall.x0, 3, wall.z1 - wall.z0], bath ? bathTile : plasterFor(len));
    }
    // Upper floor slabs mirror upperSlabs (stairwell hole stays open).
    for (const [index, slab] of upperSlabs(house.id).entries()) {
      centred(builder, `aarr-house-${house.id}-upper-slab-${index}`, [(slab.x0 + slab.x1) / 2, 2.875, (slab.z0 + slab.z1) / 2], [slab.x1 - slab.x0, 0.25, slab.z1 - slab.z0], woodFloor, { cast: false });
    }
    for (const wall of upperWalls(house.id)) {
      const len = Math.max(wall.x1 - wall.x0, wall.z1 - wall.z0);
      const bath = wall.id.includes('bath');
      centred(builder, `aarr-house-${house.id}-upwall-${wall.id}`, [(wall.x0 + wall.x1) / 2, 4.5, (wall.z0 + wall.z1) / 2], [wall.x1 - wall.x0, 3, wall.z1 - wall.z0], bath ? bathTile : plasterFor(len));
    }
    for (const door of upperDoors(house.id)) {
      if (door.from === 'stairtop' && door.to === 'landing') continue;
      const horizontal = door.span === 'x';
      centred(builder, `aarr-house-${house.id}-uplintel-${door.id}`, [horizontal ? door.centre : door.at, 5.6, horizontal ? door.at : door.centre], [horizontal ? 1.0 : 0.2, 0.8, horizontal ? 0.2 : 1.0], massing);
    }
    // Stair treads + guard rail mirror stairSpec (climbable 0.2 risers).
    const stair = stairSpec(house.id);
    for (let i = 0; i < REBUILD_STAIR_STEPS; i += 1) {
      centred(builder, `aarr-house-${house.id}-stair-${i}`, [(stair.x0 + stair.x1) / 2, (REBUILD_STAIR_RISER * (i + 1)) / 2, stair.zA + i * REBUILD_STAIR_TREAD + REBUILD_STAIR_TREAD / 2], [stair.x1 - stair.x0, REBUILD_STAIR_RISER * (i + 1), REBUILD_STAIR_TREAD], stairTimber);
    }
    centred(builder, `aarr-house-${house.id}-stair-rail`, [stair.x1 + face * 0.05, 3.5, (stair.zA + stair.zB) / 2], [0.1, 1.0, stair.zB - stair.zA], massing);
    centred(builder, `aarr-house-${house.id}-roof`, [house.cx, 6.35, house.cz], [house.w + 0.6, 0.5, house.d + 0.6], roof);
    centred(builder, `aarr-house-${house.id}-ridge`, [house.cx, 6.75, house.cz], [house.w * 0.35, 0.4, house.d + 0.6], roof);
    centred(builder, `aarr-house-${house.id}-chimney`, [house.cx - house.w * 0.28, 7.0, house.cz - 1], [0.9, 2.2, 0.9], massing);
    for (const door of ATOMIC_ACRES_REBUILD_DOORWAYS) {
      if (door.house !== house.id || door.from === 'porch') continue;
      centred(builder, `aarr-house-${house.id}-inlintel-${door.id}`, [door.at, (door.headY + 3) / 2, door.centre], [0.2, 3 - door.headY, door.width], massing);
    }
    const porchX = house.cx + face * (house.w / 2 + 1.0);
    centred(builder, `aarr-house-${house.id}-porch-slab`, [porchX, 0.15, house.cz], [2.0, 0.3, house.d * 0.9], concrete);
    centred(builder, `aarr-house-${house.id}-porch-roof`, [porchX, 3.1, house.cz], [2.0, 0.25, house.d * 0.9], roof);
    for (const dz of [-house.d * 0.4, house.d * 0.4]) {
      centred(builder, `aarr-house-${house.id}-porch-post-${dz < 0 ? 'n' : 's'}`, [porchX + face * 0.8, 1.6, house.cz + dz], [0.18, 2.8, 0.18], massing);
    }
    // ---- DRESS. Two shuttered windows per side elevation + picture window
    // beside the front door + open door panel + porch fascia, balustrade,
    for (const [tag, planeZ] of [['south', z0], ['north', z1]] as const) {
      for (const dx of [-1.8, 1.8]) {
        const winMeshes = dressWindow(`aarr-house-${house.id}-win-${tag}-${dx < 0 ? 'a' : 'b'}`, 'z', planeZ, house.cx + dx, 0.95, true);
        // Wear-lane shutter rebuilds over the south-face ground windows
        // (world-authored GLBs: anchor sill line, +z out -> yaw PI south).
        if (tag === 'south') {
          const shutterGLB = house.id === 'west'
            ? './assets/rebuild/wear/window_shuttered.glb'
            : './assets/rebuild/wear/window_wide.glb';
          kitbash(shutterGLB, [(house.cx + dx) * 1.6, DRESS_SILL_Y, planeZ * 1.6], Math.PI, winMeshes, undefined, true);
        }
      }
    }
    // Porch furniture (wear lane, true dims, slab top y=0.3 world).
    const porchWorldX = porchX * 1.6;
    const porchWorldZ = house.cz * 1.6;
    kitbash('./assets/rebuild/wear/chair_slat.glb', [porchWorldX + face * 0.8, 0.3, porchWorldZ + 0.9], -face * Math.PI / 2, [], undefined, true);
    kitbash('./assets/rebuild/wear/chair_folding.glb', [porchWorldX + face * 0.4, 0.3, porchWorldZ - 1.1], face * Math.PI / 2 + 0.3, [], undefined, true);
    kitbash('./assets/rebuild/wear/table_side.glb', [porchWorldX + face * 0.6, 0.3, porchWorldZ - 0.1], 0, [], undefined, true);
    // Garden beds + planters flanking the porch (true dims, y=0 on grade).
    kitbash('./assets/rebuild/wear/bed_sleeper.glb', [porchWorldX - 1.6, 0, porchWorldZ + 5.2], 0, [], undefined, true);
    kitbash('./assets/rebuild/wear/planter_conc.glb', [porchWorldX + face * 1.2, 0, porchWorldZ + 2.6], 0, [], undefined, true);
    kitbash('./assets/rebuild/wear/planter_conc.glb', [porchWorldX + face * 1.2, 0, porchWorldZ - 2.6], 0, [], undefined, true);
    for (const [tag, sign] of [['n', -1], ['s', 1]] as const) {
      const railZ0 = house.cz + sign * 0.6;
      const railZ1 = house.cz + sign * house.d * 0.4;
      const railLen = Math.abs(railZ1 - railZ0);
      centred(builder, `aarr-house-${house.id}-porch-apron-${tag}`, [porchX + face * 0.8, 0.75, (railZ0 + railZ1) / 2], [0.12, 0.5, railLen], massing);
      centred(builder, `aarr-house-${house.id}-porch-rail-${tag}`, [porchX + face * 0.8, 1.06, (railZ0 + railZ1) / 2], [0.2, 0.12, railLen + 0.1], massing);
      centred(builder, `aarr-house-${house.id}-porch-planter-${tag}`, [porchX + face * 0.35, 0.575, house.cz + sign * (house.d * 0.4 - 0.25)], [0.55, 0.55, 0.55], timber);
    }
    // ---- Wave-2 furniture (Trellis GLBs, manifest rebuild-furniture-20260915).
    // Async over bare rooms: no placeholders (rooms read dressed or empty, never
    // broken). No authority: furniture is non-solid dress at greybox stage.
    const S = ATOMIC_ACRES_REBUILD_SPREAD;
    const groundRoom = (id: string): { x0: number; x1: number; z0: number; z1: number } => {
      const found = ATOMIC_ACRES_REBUILD_ROOMS.find((entry) => entry.house === house.id && entry.id === id);
      if (!found) throw new Error(`missing room ${house.id}/${id}`);
      return found;
    };
    const upperRoom = (id: 'rearBed' | 'bathUp'): { x0: number; x1: number; z0: number; z1: number } => {
      const found = upperRooms(house.id).find((entry) => entry.id === id);
      if (!found) throw new Error(`missing upper room ${house.id}/${id}`);
      return found;
    };
    const living = groundRoom('living');
    const rearBed = upperRoom('rearBed');
    const bathUp = upperRoom('bathUp');
    // Sofa + island share the stair-side strip (long axes along Z, 0.95 and
    // 0.7 wide in a 1.75+ m strip): sofa south, island north, clear walkways
    // around both ends. Bed/bath centred in rooms that fit them.
    const run = stairSpec(house.id);
    const frontInner = house.cx + face * (house.w / 2) - face * 0.3;
    const runEdge = face === 1 ? run.x1 : run.x0;
    const stripX = (frontInner + runEdge) / 2;
    const furnish: ReadonlyArray<readonly [string, string, number, number, number, number]> = [
      ['sofa', './assets/rebuild/furniture/sofa.glb', stripX * S, (living.z0 + 1.2) * S, 0, Math.PI / 2],
      ['kitchen-counter', './assets/rebuild/furniture/kitchen-counter.glb', stripX * S, (living.z1 - 1.55) * S, 0, Math.PI / 2],
      ['bed-double', './assets/rebuild/furniture/bed-double.glb', ((rearBed.x0 + rearBed.x1) / 2) * S, ((rearBed.z0 + rearBed.z1) / 2) * S, 3, 0],
      ['bath-set', './assets/rebuild/furniture/bath-set.glb', ((bathUp.x0 + bathUp.x1) / 2) * S, ((bathUp.z0 + bathUp.z1) / 2) * S, 3, 0],
    ] as const;
    for (const [tag, url, fx, fz, fy, yaw] of furnish) {
      const anchor = new THREE.Group();
      anchor.name = `aarr-house-${house.id}-furn-${tag}`;
      anchor.position.set(fx, fy, fz);
      anchor.rotation.set(0, yaw, 0);
      root.add(anchor);
      treeLoader.loadAsync(url).then((gltf) => {
        anchor.add(gltf.scene);
      }).catch(() => {
        // Bare room stays: a missing GLB never breaks the lane.
      });
    }
  }
  // ---- Wave-4 houses: catalog v2 exteriors with real openings (Lane M).
  // Anchors/yaw per Lane K PLACEMENT (door centres on portals to 0.0 cm);
  // grey shells hide only after each GLB resolves (fallback-safe).
  kitbash('./assets/rebuild/houses/house-west-teal.glb', [-13.48, 0, 1.5], -Math.PI / 2, [], 'west');
  kitbash('./assets/rebuild/houses/house-east-yellow.glb', [13.48, -0.18, -1.5], Math.PI / 2, [], 'east');
  // ---- Litter/rubble micro-scatter (wear lane atlas, true dims, y=0).
  const litterSpots: ReadonlyArray<readonly [number, number, number]> = [[-8, 20, 0.4], [9, 5, 2.2], [-6, -25, 1.1], [12, 28, 2.9], [-14, -8, 0.9]] as const;
  for (const [lx, lz, yaw] of litterSpots) {
    kitbash('./assets/rebuild/wear/litter_atlas.glb', [lx * 1.6, 0, lz * 1.6], yaw, [], undefined, true);
  }

  // ---- Garages flanking BOTH houses + driveways + parked cars (BRIEF queue 1) ----
  const garageSpecs = [
    { id: 'west', cx: -18.9, cz: 1.5, car: [-18.9, 5.5] },
    { id: 'east', cx: 19.2, cz: -1.5, car: [19.2, 2.5] },
  ] as const;
  for (const garage of garageSpecs) {
    // Hollow shell mirrors garageWalls (link door open to the house).
    for (const wall of garageWalls(garage.id)) {
      centred(builder, `aarr-garage-${garage.id}-shell-${wall.id}`, [(wall.x0 + wall.x1) / 2, 1.4, (wall.z0 + wall.z1) / 2], [wall.x1 - wall.x0, 2.8, wall.z1 - wall.z0], garageConcrete);
    }
    centred(builder, `aarr-garage-${garage.id}-roof`, [garage.cx, 2.925, garage.cz], [3.8, 0.25, 5.4], roof);
    centred(builder, `aarr-garage-${garage.id}-door`, [garage.cx, 1.1, garage.cz + 2.55], [2.6, 2.2, 0.12], roof);
    centred(builder, `aarr-garage-${garage.id}-driveway`, [garage.cx, 0.04, garage.cz + 5.5], [3.2, 0.08, 6.0], concrete, { cast: false });
    const [carX, carZ] = garage.car;
    centred(builder, `aarr-car-${garage.id}-body`, [carX, 0.55, carZ], [1.8, 0.7, 4.2], vehicle);
    centred(builder, `aarr-car-${garage.id}-cabin`, [carX, 1.15, carZ - 0.2], [1.6, 0.6, 2.2], vehicle);
  }

  // ---- Sheds in back (north) corners + rear patio sets (fact 8; aerials) ----
  const [shedW, shedE] = pair(builder, 'aarr-shed', 16, 1.1, -21, [3.0, 2.2, 2.6], massing);
  const [shedRoofW, shedRoofE] = pair(builder, 'aarr-shed-roof', 16, 2.3, -21, [3.4, 0.25, 3.0], roof);
  // Catalog shed GLBs sit on the same pads at the same yaw (none).
  kitbash('./assets/rebuild/spread/shed.glb', [-25.6, 0, -33.6], 0, [shedW, shedRoofW], undefined, true);
  kitbash('./assets/rebuild/spread/shed.glb', [25.6, 0, -33.6], 0, [shedE, shedRoofE], undefined, true);
  pair(builder, 'aarr-patio-table', 10, 0.4, -19, [1.4, 0.8, 1.4], concrete);
  pair(builder, 'aarr-patio-umbrella-pole', 10, 1.4, -19, [0.12, 2.4, 0.12], darkPole);
  pair(builder, 'aarr-patio-bench', 10, 0.3, -17.2, [1.6, 0.6, 0.5], timber);

  // ---- Bus + semi nose-to-nose inside the loop (fact 4; all plates) ----
  // Bus body is catalog batch1 (Blender procedural + baked PBR, manifest
  // atomic-acres-rebuild-bus-20260915); massing stays as instant fallback.
  const busBody = centred(builder, 'aarr-bus-body', [-3.2, 1.4, 0.5], [2.5, 2.6, 11.0], vehicle, { rotation: [0, 0.28, 0] });
  const busRoof = centred(builder, 'aarr-bus-roof', [-3.2, 2.8, 0.5], [2.5, 0.2, 11.0], roof, { rotation: [0, 0.28, 0] });
  const busAnchor = new THREE.Group();
  busAnchor.name = 'aarr-bus-glb';
  busAnchor.position.set(-3.2 * ATOMIC_ACRES_REBUILD_SPREAD, 0, 0.5 * ATOMIC_ACRES_REBUILD_SPREAD);
  busAnchor.rotation.set(0, 0.28, 0);
  busAnchor.scale.set(ATOMIC_ACRES_REBUILD_SPREAD, 1, ATOMIC_ACRES_REBUILD_SPREAD);
  root.add(busAnchor);
  treeLoader.loadAsync('./assets/rebuild/vehicles/bus.glb').then((gltf) => {
    busAnchor.add(gltf.scene);
    busBody.visible = false;
    busRoof.visible = false;
  }).catch(() => {
    // Massing stays: a missing GLB never breaks the lane.
  });
  const semiCab = centred(builder, 'aarr-semi-cab', [3.4, 1.5, -3.4], [2.5, 2.8, 2.8], rust, { rotation: [0, -0.22, 0] });
  const semiTrailer = centred(builder, 'aarr-semi-trailer', [4.6, 1.6, 3.2], [2.6, 3.0, 9.5], vehicle, { rotation: [0, -0.22, 0] });
  // Catalog whole-rig GLB spans the cab+trailer zone at the shared yaw.
  kitbash('./assets/rebuild/vehicles/semi.glb', [4.0, 0, -0.1], -0.22, [semiCab, semiTrailer]);

  // ---- Crate clusters: south choke + island + yards (fact 4/6; street plate) ----
  // South choke barricade across the entry: 4-wide x 3-tall + 3-crate top row.
  for (let ix = 0; ix < 4; ix += 1) {
    for (let iy = 0; iy < 3; iy += 1) {
      centred(builder, `aarr-choke-crate-${ix}-${iy}`, [-1.5 + ix, 0.5 + iy, 14], [1, 1, 1], crate);
    }
  }
  for (let ix = 0; ix < 3; ix += 1) {
    centred(builder, `aarr-choke-crate-top-${ix}`, [-1 + ix, 3.5, 14], [1, 1, 1], crate);
  }
  // Island cluster (street plate island): 2x2 + 1 top + planter pair.
  for (const [dx, dz] of [[-0.8, 2.2], [0.8, 2.2], [-0.8, 3.8], [0.8, 3.8]] as Array<[number, number]>) {
    centred(builder, `aarr-island-crate-${dx < 0 ? 'w' : 'e'}-${dz < 3 ? 's' : 'n'}`, [dx, 0.62, dz], [1, 1, 1], crate);
  }
  centred(builder, 'aarr-island-crate-top', [0, 1.62, 3], [1, 1, 1], crate);
  pair(builder, 'aarr-hedge-loop', 12.2, 0.6, -4.3, [1.2, 1.2, 2.0], hedge);
  // Yard clusters near fences/pads (topdown plate scatter).
  const yardClusters: ReadonlyArray<readonly [number, number]> = [[-8, -12], [8, -13], [-6, 9], [6, 8]] as const;
  for (const [cx, cz] of yardClusters) {
    const side = cx < 0 ? 'w' : 'e';
    const end = cz < 0 ? 'n' : 's';
    centred(builder, `aarr-yard-crate-${side}-${end}-0`, [cx, 0.5, cz], [1, 1, 1], crate);
    centred(builder, `aarr-yard-crate-${side}-${end}-1`, [cx + 1, 0.5, cz], [1, 1, 1], crate);
    centred(builder, `aarr-yard-crate-${side}-${end}-2`, [cx + 0.5, 1.5, cz], [1, 1, 1], crate);
    centred(builder, `aarr-yard-crate-${side}-${end}-3`, [cx + 0.5, 0.5, cz + 1], [1, 1, 1], crate);
  }

  // ---- Concrete pads: entrance + shed aprons + 4 lawn pads (fact 7) ----
  centred(builder, 'aarr-pad-entrance', [0, 0.05, 19], [10, 0.1, 4], concrete, { cast: false });
  pair(builder, 'aarr-pad-shed-apron', 16, 0.05, -18.4, [4, 0.1, 2.4], concrete, { cast: false });
  pair(builder, 'aarr-pad-lawn-sw-se', 14, 0.09, 12, [4.5, 0.08, 4.5], concrete, { cast: false });
  pair(builder, 'aarr-pad-lawn-mid', 14, 0.09, -4, [4.0, 0.08, 4.0], concrete, { cast: false });

  // ---- Perimeter concrete walls with pillars, CLOSED with gaps (BRIEF; topdown) ----
  // South wall (z=+24) with 8 m entry gap; north wall (z=-26) with 6 m entrance gap.
  pair(builder, 'aarr-wall-south', 14, 1.2, 24, [16, 2.4, 0.5], concrete);
  pair(builder, 'aarr-wall-north', 13.5, 1.2, -26, [17, 2.4, 0.5], concrete);
  pair(builder, 'aarr-wall-side', 24, 1.2, -1, [0.5, 2.4, 49], concrete);
  // Pillars every ~8 m along each run.
  for (const px of [-20, -12, -4, 4, 12, 20]) {
    pair(builder, `aarr-pillar-south-${Math.abs(px)}`, Math.abs(px) < 4 ? 6 : px, 1.5, 24, [0.9, 3.0, 0.9], concrete);
    pair(builder, `aarr-pillar-north-${Math.abs(px)}`, Math.abs(px) < 3 ? 5 : px, 1.5, -26, [0.9, 3.0, 0.9], concrete);
  }
  for (const pz of [-20, -12, -4, 4, 12, 20]) {
    pair(builder, `aarr-pillar-side-${Math.abs(pz)}`, 24, 1.5, pz, [0.9, 3.0, 0.9], concrete);
  }
  // Wooden privacy fences dividing every lot (fact 9; aerial plates).
  pair(builder, 'aarr-fence-lot-north', 10, 0.9, -10, [9, 1.8, 0.25], timber);
  pair(builder, 'aarr-fence-lot-south', 10, 0.9, 8, [9, 1.8, 0.25], timber);
  pair(builder, 'aarr-fence-drive', 20.5, 0.9, 6, [0.25, 1.8, 10], timber);

  // ---- Street lamps x6 (fact 9; street plate dark poles + lamp-pool massing) ----
  const lampSpots: ReadonlyArray<readonly [number, number]> = [[-7, -12], [7, -12], [-7.5, 8], [7.5, 8], [-5.5, 20], [5.5, 20]] as const;
  for (const [lx, lz] of lampSpots) {
    const tag = `${lx < 0 ? 'w' : 'e'}-${Math.round(lz)}`;
    centred(builder, `aarr-lamp-${tag}-base`, [lx, 0.3, lz], [0.9, 0.6, 0.9], concrete);
    const pole = centred(builder, `aarr-lamp-${tag}-pole`, [lx, 3.1, lz], [0.18, 5.6, 0.18], darkPole);
    const head = centred(builder, `aarr-lamp-${tag}-head`, [lx, 5.9, lz], [0.7, 0.35, 0.4], darkPole);
    // Catalog lamp post GLB over the pole+head (base plinth stays).
    kitbash('./assets/rebuild/spread/lamp.glb', [lx * 1.6, 0, lz * 1.6], 0, [pole, head], undefined, true);
  }

  // ---- Hedges: road edges + front yards + pad rows (facts 7/9; green blobs) ----
  pair(builder, 'aarr-hedge-entry', 6.4, 0.6, 20, [1.2, 1.2, 8], hedge);
  pair(builder, 'aarr-hedge-yard', 14, 0.6, 6.5, [7, 1.2, 1.2], hedge);
  pair(builder, 'aarr-hedge-back', 12, 0.6, -13, [8, 1.2, 1.2], hedge);
  pair(builder, 'aarr-hedge-wall', 18, 0.6, 21.5, [6, 1.2, 1.2], hedge);
  pair(builder, 'aarr-hedge-pad', 14, 0.6, 14.6, [4.5, 1.0, 0.8], hedge);

  // ---- North entrance: welcome sign + rusty car between sheds (fact 5) ----
  const signBoard = centred(builder, 'aarr-sign-board', [0, 1.9, -24.5], [3.2, 1.0, 0.15], timber);
  // Catalog sign GLB over the board (posts stay).
  kitbash('./assets/rebuild/spread/sign.glb', [0, 0, -39.2], 0, [signBoard], undefined, true);
  centred(builder, 'aarr-sign-post-e', [1.2, 0.9, -24.5], [0.18, 1.8, 0.18], timber);
  const rustyBody = centred(builder, 'aarr-rustycar-body', [-4.5, 0.55, -23], [1.8, 0.7, 4.0], rust);
  const rustyCabin = centred(builder, 'aarr-rustycar-cabin', [-4.5, 1.1, -23.2], [1.6, 0.55, 2.0], rust);
  // Catalog rusty-car GLB at the same pad and yaw (none).
  kitbash('./assets/rebuild/vehicles/rusty-car.glb', [-4.5, 0, -23], 0, [rustyBody, rustyCabin]);

  // ---- South exit: jeep + sandbag reservation (fact 6; photo street plate) ----
  const jeepBody = centred(builder, 'aarr-jeep-body', [7.5, 0.6, 21], [1.8, 0.8, 3.6], olive);
  const jeepCabin = centred(builder, 'aarr-jeep-cabin', [7.5, 1.2, 21.6], [1.6, 0.6, 1.8], olive);
  // Catalog jeep GLB at the same pad and yaw (none).
  kitbash('./assets/rebuild/vehicles/jeep.glb', [7.5, 0, 21], 0, [jeepBody, jeepCabin]);
  for (let ix = 0; ix < 5; ix += 1) {
    centred(builder, `aarr-sandbag-${ix}`, [-6.5 + ix * 1.1, 0.35, 18.5], [1.0, 0.7, 0.8], concrete);
  }

  // ---- Utility poles flanking the street (street + aerial plates) ----
  for (const [px, pz] of [[-6.5, 16], [6.5, 16], [-11, -6], [11, -6]] as Array<[number, number]>) {
    const tag = `${px < 0 ? 'w' : 'e'}-${pz}`;
    centred(builder, `aarr-pole-${tag}`, [px, 4, pz], [0.3, 8, 0.3], timber);
    centred(builder, `aarr-pole-${tag}-arm`, [px, 7.4, pz], [1.6, 0.18, 0.18], timber);
  }

  // ---- Trees: Wave-1 Trellis GLBs over green-blob placeholders (BRIEF; aerials).
  // Placeholders keep day-one boot instant and carry the layout until each GLB
  // resolves, then hide (trunk proxies stay: conservative solid colliders).
  const treeGLBs: Record<'yard' | 'desert', string> = {
    yard: './assets/rebuild/trees/street-leafy.glb',
    desert: './assets/rebuild/trees/joshua.glb',
  };
  const treeSpots: ReadonlyArray<readonly [number, number, 'yard' | 'desert']> = [
    [-18, -14, 'yard'],
    [18, -14, 'yard'],
    [-19, 16, 'yard'],
    [19, 16, 'yard'],
    [-38, 30, 'desert'],
    [38, 30, 'desert'],
  ] as const;
  for (const [tx, tz, kind] of treeSpots) {
    const tag = `${kind}-${tx}-${tz}`;
    const trunk = centred(builder, `aarr-tree-${tag}-trunk`, [tx, 1.0, tz], [0.4, 2.0, 0.4], timber);
    const crown = centred(builder, `aarr-tree-${tag}-crown`, [tx, 2.8, tz], [2.2, 1.8, 2.2], hedge);
    const top = centred(builder, `aarr-tree-${tag}-top`, [tx, 4.0, tz], [1.2, 1.0, 1.2], hedge);
    const anchor = new THREE.Group();
    anchor.name = `aarr-tree-${tag}-glb`;
    // SPREAD applies to placements (helpers do it for boxes; anchor is raw).
    anchor.position.set(tx * ATOMIC_ACRES_REBUILD_SPREAD, 0, tz * ATOMIC_ACRES_REBUILD_SPREAD);
    root.add(anchor);
    treeLoader.loadAsync(treeGLBs[kind]).then((gltf) => {
      anchor.add(gltf.scene);
      trunk.visible = false;
      crown.visible = false;
      top.visible = false;
    }).catch(() => {
      // Placeholder blobs stay: a missing GLB never breaks the lane.
    });
  }

  // ---- Wave-3 dressing: rock clusters + prickly pears (Trellis GLBs over
  // massing blobs, manifest ground-plants-20260915). Non-solid dress.
  const rockSpots: ReadonlyArray<readonly [number, number]> = [[0, 44], [20, 46], [-20, 46], [-40, 28]] as const;
  for (const [rx, rz] of rockSpots) {
    const blob = centred(builder, `aarr-rockdress-${rx}-${rz}`, [rx, 0.5, rz], [1.6, 1.0, 1.6], rock);
    kitbash('./assets/rebuild/plants/rock-cluster.glb', [rx, 0, rz], 0, [blob]);
  }
  const pearSpots: ReadonlyArray<readonly [number, number]> = [[-24, 10], [24, -8], [-8, 24], [12, -22]] as const;
  for (const [px, pz] of pearSpots) {
    const blob = centred(builder, `aarr-pear-${px}-${pz}`, [px, 0.5, pz], [0.8, 1.0, 0.8], hedge);
    kitbash('./assets/rebuild/plants/prickly-pear.glb', [px, 0, pz], 0, [blob]);
  }
  const rand = mulberry32(ATOMIC_ACRES_REBUILD_SEED);
  let scrub = 0;
  let rockCount = 0;
  for (let i = 0; i < 26; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (27 + rand() * 30);
    const z = -34 + rand() * 68;
    if (Math.abs(x) < 44 || Math.abs(z) > 58) continue;
    const s = 0.5 + rand() * 0.7;
    centred(builder, `aarr-scrub-${i}`, [x, s / 2, z], [s, s, s], hedge);
    scrub += 1;
  }
  for (let i = 0; i < 14; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (28 + rand() * 28);
    const z = -32 + rand() * 64;
    if (Math.abs(x) < 45.6) continue;
    const s = 0.6 + rand() * 1.1;
    centred(builder, `aarr-rock-${i}`, [x, s / 2 - 0.05, z], [s, s, s], rock);
    rockCount += 1;
  }

  const parts = root.children.length;
  root.userData.atomicAcresRebuildLayout = {
    parts,
    seed: ATOMIC_ACRES_REBUILD_SEED,
    seedHex: '0xaac4e9',
    presentationOnly: true,
    colliders: builder.colliders.length,
    physicsColliders: builder.physicsColliders.length,
    shotSurfaces: builder.shotSurfaces.length,
    spawns: 0,
    scrub,
    rocks: rockCount,
    plates: [
      'batch-4-nuketown-graybox/gray_topdown_01.png',
      'batch-4-nuketown-graybox/gray_street_01.png',
      'batch-4-nuketown-graybox/gray_aerial_01.png',
      'batch-4-nuketown-graybox/gray_aerial_02.png',
    ],
  };

  // Authority (colliders/spawns/shots) committed by the authority module;
  // presentation builder stays authority-free by construction.
  const authority = atomicAcresRebuildAuthority(scene);

  // Bot-skirmish waypoints (all open ground, clear of wall/prop proxies):
  // loop spine, both porches, yards, entries. Empty here crashed updateBots
  // every frame (NaN index into []), so this list is load-bearing.
  const patrolPoints = [
    [0, 19.2], [-15.2, 3.2], [15.2, 3.2], [0, -12.8],
    [-22.4, 19.2], [22.4, -19.2], [-14.24, 2.4], [13.76, -2.4],
    [3.2, 30.4], [4.8, -38.4],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  return {
    id: 'atomic-acres-rebuild' as unknown as ArenaId,
    label: 'Atomic Acres',
    root,
    colliders: authority.colliders,
    physicsColliders: authority.physicsColliders,
    raycastMeshes: authority.raycastMeshes,
    shotSurfaces: authority.shotSurfaces,
    spawns: authority.spawns,
    patrolPoints,
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: authority.physicalCover,
    bounds: { ...ATOMIC_ACRES_REBUILD_BOUNDS },
    houseTelemetry: emptyTelemetry(),
  };
}
