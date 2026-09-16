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
  garageSpec,
  garageWalls,
  houseFrame,
  houseSpec,
  rearLinkGap,
  REBUILD_DOOR_HEAD_Y,
  REBUILD_GARAGE_D,
  REBUILD_GARAGE_W,
  REBUILD_INTERIOR_WALL_T,
  REBUILD_SHELL_WALL_T,
  REBUILD_STAIR_RISER,
  REBUILD_STAIR_STEPS,
  REBUILD_STAIR_TREAD,
  REBUILD_UPPER_FLOOR_Y,
  REBUILD_UPPER_SLAB_T,
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

/**
 * True-dimension interior dressing: a raw mesh parented straight to the arena
 * root, exactly like `aarr-loop-island` and every wear-lane GLB anchor.
 * `centred()` cannot serve here because it multiplies plan sizes by SPREAD,
 * and a rug, a coffee table and a dining table have to keep the same metre as
 * the 2.2 m sofa and 3.0 m counter GLBs standing on and beside them. Nothing
 * here reaches `builder`, so no collider, shot surface or spawn can move.
 */
function dressPiece(
  root: THREE.Group,
  name: string,
  centre: Vec3,
  size: Size3,
  material: THREE.Material,
  yaw = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...centre);
  mesh.rotation.set(0, yaw, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.presentationBatchCandidate = false;
  root.add(mesh);
  return mesh;
}

/**
 * Atomic/starburst living-room rug, drawn in code.
 *
 * `living-room-eye.png` puts a patterned starburst rug under the coffee table
 * and it is the single loudest piece of mid-century signal in the frame. Lane D
 * owns `public/assets/**`, so this cannot be a new bake; a canvas is the only
 * route a presentation lane has to a PATTERN rather than a flat tint, and the
 * six interior bakes on disk have none. Colours are the ref's own: warm beige
 * field with rust, charcoal and teak motif lines.
 *
 * Returns null in any environment without a drawable 2D context (the headless
 * arena audits shim `document` with a no-op context proxy); the caller falls
 * back to plain carpet, so a rug is never the reason a build or a gate breaks.
 */
function starburstRugTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#c9bda4';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#a8562f';
    ctx.lineWidth = 10;
    ctx.strokeRect(22, 22, size - 44, size - 44);
    ctx.strokeStyle = '#6f5c46';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, size - 80, size - 80);
    // Two starbursts on the diagonal + a scatter of small ones, which is how
    // the ref's rug reads: one dominant motif, the rest as texture.
    const burst = (cx: number, cy: number, radius: number, spokes: number, width: number, colour: string): void => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      for (let i = 0; i < spokes; i += 1) {
        const angle = (i / spokes) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, width * 1.6), 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
    };
    burst(176, 320, 118, 12, 5, '#3a3630');
    burst(348, 168, 78, 8, 4, '#a8562f');
    for (const [bx, by] of [[110, 120], [400, 400], [420, 120], [120, 430]] as Array<[number, number]>) {
      burst(bx, by, 34, 6, 2.5, '#6f5c46');
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
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
  // One fetch+parse per URL: repeated kitbashes (fence bays x20, crates x21)
  // clone the resolved scene instead of re-loading. Without this the queue
  // grows with instance count and boot never settles.
  const glbCache = new Map<string, Promise<{ scene: THREE.Object3D }>>();
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
      let pending = glbCache.get(url);
      if (pending === undefined) {
        pending = treeLoader.loadAsync(url);
        glbCache.set(url, pending);
      }
      pending.then((gltf) => {
        anchor.add(gltf.scene.clone(true));
        for (const mesh of hide) mesh.visible = false;
        if (hideHouseId !== undefined) hideHouseSkin(hideHouseId);
      }).catch(() => {
        // Placeholder massing stays.
        glbCache.delete(url);
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
  //
  // TINT MATHS FOR EVERY `color` BELOW (lane-A interior look, 2026-09-16).
  // `material.color` MULTIPLIES the diffuse map in linear space, so a tint can
  // only darken: any channel needing a ratio above 1.0 is unreachable and is
  // NOT authored here. Each tint is target_linear / bake_linear, converted back
  // to sRGB for `setHex`. The bake means are measured off the shipped PNGs
  // (128x128 box resample, sRGB->linear per texel, then averaged):
  //   InteriorPlaster  0.8247 0.7475 0.6395   (#eae0d1 cream)
  //   InteriorCeiling  0.9305 0.9135 0.8636   (#f7f5ef near-white)
  //   BathTile         0.5341 0.5923 0.6536   (#c1cad3 cool tile)
  //   StairTimber      0.2580 0.1119 0.0437   (#8a5d3a teak)
  //   WoodFloor        0.3761 0.1853 0.0695   (#a4774a orange plank)
  //   GarageConcrete   0.1992 0.1857 0.1589   (#7b776e bare concrete)
  //   SidewalkConcrete 0.4870 0.4091 0.2978   (#b9ab94 warm concrete)
  //   LawnPatchy       0.1723 0.2055 0.0603   (#737d45 grass)
  // WoodFloor is the one bake that cannot serve a mid-century floor: reaching
  // the beige/gold carpet of `bedroom-eye.png` needs green x2.9 and blue x6.6,
  // both far above 1.0. Carpet is therefore tinted InteriorPlaster, not tinted
  // WoodFloor, and WoodFloor is left to the surfaces that really are planks.
  const pbr = (dir: string, name: string, repeatX: number, repeatY: number, color?: number): THREE.Material =>
    texturedMaterial(`./assets/rebuild/${dir}/${name}_BAKE_DIFFUSE.png`, {
      roughnessPath: `./assets/rebuild/${dir}/${name}_BAKE_ROUGH.png`,
      roughness: 1.0,
      metalness: 0.0,
      repeatX,
      repeatY,
      color,
    });
  const inPbr = (name: string, repeatX: number, repeatY: number, color?: number): THREE.Material =>
    pbr('interiors', name, repeatX, repeatY, color);
  const gndPbr = (name: string, repeatX: number, repeatY: number, color?: number): THREE.Material =>
    pbr('ground', name, repeatX, repeatY, color);
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
  // The stair run's step boxes are solid from y=0 to each tread's top, so from
  // the living-room camera their combined SIDE is one uninterrupted wedge that
  // fills the left half of the frame. Carrying StairTimber there put #8a5d3a
  // teak across all of it, and because that bake measures luma stddev 1.79 it
  // reads as a flat saturated terracotta slab rather than as a stair - the
  // single worst surface in the 11:08 capture. The references
  // (teal-ground-cutaway.png, living-room-eye.png) do not show a timber flank
  // at all: they show a CREAM CLOSED STRINGER with the timber confined to the
  // tread edges. So the flank takes plaster and the tread nosings and rail keep
  // teakTrim, which is what actually draws the stair's line. Tint is warm and
  // near-white because material.color multiplies and cannot lighten a bake.
  const stairTimber = inPbr('InteriorPlaster', 1, 1, 0xf0e6d8);
  const garageConcrete = inPbr('GarageConcrete', 2, 1);
  // ---- Interior finishes (refs `living-room-eye.png`, `bedroom-eye.png`,
  // `teal-ground-cutaway.png`, `yellow-ground-cutaway.png`).
  // The ceiling bake shipped with wave-1 and was never bound to a mesh: every
  // ground-floor ceiling in the capture is the UNDERSIDE of the upper floor
  // slab, i.e. WoodFloor, which is why `rb11-rebuild-interior.png` and
  // `artifacts/viewpoint-regression/pre-polish/.../interior-west.png` are both
  // dominated by an orange plank lid. The refs show a pale ceiling with a slim
  // white cornice, so the slab now gets a separate board under it.
  const interiorCeiling = inPbr('InteriorCeiling', 3, 3);
  const interiorTrim = inPbr('InteriorCeiling', 1, 1);
  // CARPET RIDES DesertSand, NOT PLASTER (integrator capture 2026-09-16: the
  // first attempt landed as "flat grey-beige with no material"). The zone split
  // was reaching the floor; the BAKE had nothing to show. Measured texel spread
  // over a 128x128 box resample, luma stddev: InteriorPlaster 0.69 and
  // InteriorCeiling 0.22 are effectively solid colours, which is right for
  // plaster and a ceiling and useless for a floor. Of the ten bakes on disk the
  // detailed ones are LawnPatchy 16.13, DesertSand 12.37, AsphaltLoop 11.94,
  // SidewalkConcrete 8.81, BathTile 6.99, WoodFloor 4.13. DesertSand is the
  // only one whose grain reads as a fine wool pile AND whose unmodified mean
  // (#c5ac8c) is already the refs' warm carpet beige, so the living band takes
  // it untinted and the bedroom band tints it to `bedroom-eye`'s gold.
  const livingCarpet = gndPbr('DesertSand', 6, 6);
  const upperCarpet = gndPbr('DesertSand', 6, 6, 0xf8ffda);
  const kitchenTile = inPbr('BathTile', 3, 3, 0xf3d9b2);
  const sageAccent = inPbr('InteriorPlaster', 3, 1, 0xabccb5);
  // WoodFloor keeps its bake but loses its job: nothing in the refs is a plank
  // FLOOR, and it was only ever on screen as the underside of the upper slab.
  // Its light teak grain is the right match for the mid-century case goods the
  // dressing below builds, so that is where it goes.
  const teakTrim = woodFloor;
  const massing = inPbr('InteriorPlaster', 2, 1);
  // Team colour blocking (LAYOUT_CONTRACT fact 2 + integrator measurement
  // 2026-09-16: both shells render the same off-white, so the identity the
  // header claims is absent from the frame). Teal west / yellow east, tinted
  // off the plaster bake because that is the only light, detailed surface in
  // the set; the flat `standard()` gray it replaces measured stddev ~1 against
  // the bake's 0.69 texel spread plus real shading.
  const houseSkin = { west: inPbr('InteriorPlaster', 2, 1, 0x79ccd4), east: inPbr('InteriorPlaster', 2, 1, 0xf7de83) } as const;
  const roof = gndPbr('SidewalkConcrete', 3, 3, 0xc5dcff);
  const concrete = gndPbr('SidewalkConcrete', 2, 2);
  const asphalt = gndPbr('AsphaltLoop', 5, 5);
  const sidewalk = gndPbr('SidewalkConcrete', 2, 2);
  const timber = inPbr('StairTimber', 2, 1);
  const lawn = gndPbr('LawnPatchy', 3, 3);
  const sand = gndPbr('DesertSand', 8, 8);
  const vehicle = standard(0xa8adb3, 0.6, 0.3);
  const rust = standard(0x8a5a3a, 0.9, 0.1);
  // Green mass + rock + crate, measured 2026-09-16 by the integrator on the
  // yard capture: road stddev 19.3, house wall 10.4, fence 12.0, concrete 8.9,
  // but every green mass 0.21-1.62. The LawnPatchy bake itself measures 16.13,
  // so the flatness was the `standard()` colour, not the texture set. Each
  // green now rides that bake; hedge and scrub are darker than it, so both
  // tints stay under 1.0 per channel.
  const olive = gndPbr('LawnPatchy', 2, 2, 0xeee6f7);
  const darkPole = standard(0x3a3d42, 0.7, 0.4);
  const hedge = gndPbr('LawnPatchy', 2, 2, 0xb4f9cd);
  const rock = gndPbr('SidewalkConcrete', 1, 1, 0xd9e3f1);
  const crate = inPbr('StairTimber', 1, 1);

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
  // WHERE THE SIDE-ELEVATION WINDOWS ARE, AUTHORED ONCE (lane-F 2026-09-16).
  // The shell-wall aperture split (`emitGlazedWall()` in the house loop) and
  // the `dressWindow()` calls that stand the casing/pane in those apertures
  // have to describe the SAME two openings per elevation. They used to be two
  // literals 380 lines apart; a drift of a few centimetres there would put a
  // hole in the wall with no window over it, which is exactly the failure this
  // lane exists to avoid, so both now read these.
  const DRESS_WIN_OFFSETS = [-1.8, 1.8] as const;
  // WIDENED 0.95 -> 1.8 (integrator, 2026-09-16). With the aperture split in
  // place, the sun reaching the west floor measured 0.68 m2 and lifted the
  // frame's peak luminance only to 0.851, against 1.000 and 2.5% of pixels over
  // 0.9 in `living-room-eye.png`: light was entering through two 0.95 m slots
  // and could not become a key. The references are not slot windows - they are
  // near-continuous glazed elevations. Because the aperture emitter derives its
  // openings and piers from THIS constant, and `dressWindow()` reads it too,
  // widening here moves the hole and its casing together and cannot desync
  // them. Geometry still closes on a 7.2 m elevation: openings land at
  // cx +/- [0.92, 2.68], leaving a 1.84 m centre pier and 0.92 m corner piers.
  const DRESS_WIN_W = 1.8;
  // The hole cut in the casting shell is DRESS_APERTURE_MARGIN smaller than the
  // casing board on every edge, so the opaque (non-casting) casing overlaps the
  // hole by 32 mm all round. That overlap is what keeps the exterior silhouette
  // intact: every sightline into the aperture, at any grazing angle, has to
  // pass through the casing box first, so no player outside sees a hole.
  const DRESS_APERTURE_MARGIN = 0.02;
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
    // NO GRAYBOX WINDOW MAY CAST (lane-B measurement 2026-09-16: on
    // `rb11-rebuild-interior.png` the fraction of the frame above display 0.9
    // is 0.000 and p99 is 0.841 - not one key-lit pixel anywhere inside). Every
    // part of this dressing is a solid box sitting on the shell's OUTER plane
    // with no aperture behind it, so each one was a shadow-map occluder pinned
    // exactly where the refs want daylight. Dropping them out of the shadow map
    // changes no collider, no shot surface and no authority rect; `centred()`
    // already pins solid:false/shots:false on all of them.
    // THE OTHER HALF OF THE LIGHT PATH, now done (lane-F 2026-09-16). The
    // casing was never the only occluder: the `-north`/`-south` shell walls
    // were single solid boxes with no window aperture cut in them and they DO
    // cast, so while they are the visible wall - i.e. whenever the catalog
    // house GLB has not resolved - dropping this dressing out of the shadow map
    // changed nothing on the floor. `emitGlazedWall()` in the house loop now
    // splits those two walls per house into a sill band, a header band and
    // three jamb piers, leaving a real hole in the CASTING geometry at exactly
    // the openings this function dresses. Same outer plane, same thickness,
    // same extents, same skin material, same solid:false/shots:false.
    const glass = centred(builder, `${name}-reveal`, at(0), span(width - 2 * DRESS_REVEAL_INSET, height - 2 * DRESS_REVEAL_DROP, DRESS_REVEAL_T), windowGlass, { cast: false });
    // Transparent panes must not join a merged presentation batch: the batcher
    // groups by material and a sorted-transparent pane inside an opaque batch
    // loses its own draw order.
    glass.userData.presentationBatchCandidate = false;
    const out: THREE.Mesh[] = [
      centred(builder, `${name}-casing`, at(0), span(width, height, DRESS_BOARD_T), interiorTrim, { cast: false }),
      glass,
    ];
    if (!shutters) return out;
    for (const side of [-1, 1] as const) {
      out.push(centred(builder, `${name}-shutter-${side < 0 ? 'a' : 'b'}`, at((side * (width + DRESS_SHUTTER_W)) / 2), span(DRESS_SHUTTER_W, height, DRESS_BOARD_T), timber, { cast: false }));
    }
    return out;
  };

  /**
   * MUSTARD CABINETRY, within what a multiply can reach.
   *
   * Both cutaways and `living-room-eye.png` put a mustard-yellow run under a
   * pale counter; the wave-2 GLB is a modern flat-pack birch. Lane D owns the
   * asset, so the only lever here is `material.color`, and it multiplies.
   * Measured on the run's own embedded 512x512 base colour, bright subset
   * (mean channel > 120, 39.7% of texels, i.e. the cabinet faces rather than
   * the black worktop): linear 0.4782 0.3281 0.2194. A true #c9a227 mustard
   * would need red x1.22 and green x1.10, both unreachable, so the tint is
   * pinned at the largest multiply that clips nothing (red x1.00, green x0.86,
   * blue x0.11) and lands the faces on #b9942d - an ochre mustard. The near-
   * black worktop multiplies to near-black and stays a worktop.
   */
  const tintKitchenRun = (loaded: THREE.Object3D): void => {
    loaded.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) material.color.setHex(0xffee58);
      }
    });
  };

  // Window pane. Roughness is deliberately 0.35 and not a glassy 0.08: the
  // ray-traced proxy extractor admits anything at or below 0.22
  // (REFLECTIVE_ROUGHNESS_CEILING) and sixteen new panes would spend the
  // arena's packed-shape budget on dressing. Transparency plus a low-key
  // emissive is what makes the opening read as glazing rather than as the
  // painted box the graybox shipped.
  const windowGlass = new THREE.MeshStandardMaterial({
    color: 0x9fb8c8,
    roughness: 0.35,
    metalness: 0.0,
    transparent: true,
    opacity: 0.42,
    emissive: 0x24333d,
    emissiveIntensity: 0.6,
  });

  const rugTexture = starburstRugTexture();
  const rugMaterial = rugTexture
    ? new THREE.MeshStandardMaterial({ map: rugTexture, roughness: 1.0, metalness: 0.0 })
    : livingCarpet;

  /**
   * INTERIOR FIT-OUT (lane-A, owner verdict 2026-09-16: the houses "are compact
   * and messy and they don't match the original catalog image gen references").
   *
   * Presentation only. Every mesh here is either a `centred()` emission, which
   * pins solid:false/shots:false, or a `dressPiece()` mesh that never reaches
   * `builder` at all, so no collider, shot surface, spawn or authority rect
   * moves. Structural walls, doorways and the stair run are read, never
   * written.
   *
   * WHAT THE REFS PIN, AND WHERE EACH DECISION COMES FROM:
   * - `teal-ground-cutaway.png` / `yellow-ground-cutaway.png`: the floor is not
   *   one material. Tile runs through kitchen and dining, carpet fills the
   *   living room, the garage is bare concrete. That split is the zone loop.
   * - `living-room-eye.png`: pale ceiling with a slim white cornice and white
   *   skirting; a green accent plane behind the seating; a patterned starburst
   *   rug under a low teak table; mustard cabinetry behind a tiled splashback.
   * - `bedroom-eye.png`: upper floor is gold carpet, not boards.
   *
   * WHAT IT CANNOT REACH, stated rather than faked: the four perimeter walls a
   * player sees from inside belong to the house GLB once it resolves, and every
   * one of its elevations carries ground-floor glazing (west sills at y 1.05,
   * east at 1.15). A full-height cream liner over them would seal the windows
   * and take the daylight with them, so the perimeter gets trim only and the
   * green accent goes on the cross partition - the largest uninterrupted
   * interior plane in the house - instead of the window wall the ref uses.
   */
  const buildInteriorFitOut = (
    id: 'west' | 'east',
    face: 1 | -1,
    finishTop: number,
    stripX: number,
    living: { x0: number; x1: number; z0: number; z1: number },
  ): void => {
    const frame = houseFrame(houseSpec(id));
    const tInt = REBUILD_INTERIOR_WALL_T;
    const S = ATOMIC_ACRES_REBUILD_SPREAD;
    const xLo = Math.min(frame.innerFront, frame.innerRear);
    const xHi = Math.max(frame.innerFront, frame.innerRear);
    const zone = (roomId: string): { x0: number; x1: number; z0: number; z1: number } => {
      const found = ATOMIC_ACRES_REBUILD_ROOMS.find((entry) => entry.house === id && entry.id === roomId);
      if (!found) throw new Error(`missing room ${id}/${roomId}`);
      return found;
    };
    const kitchen = zone('kitchen');
    const bath = zone('bath');
    // The dining nook has no room record on purpose: `ATOMIC_ACRES_REBUILD_WALLS`
    // opens the old den frontage to the living room with no wall and no lintel,
    // so the rear band north of the bath is floor with no rect. It takes the
    // kitchen's tile, which is what both cutaways show under the dining table.
    const dining = { x0: kitchen.x0, x1: kitchen.x1, z0: bath.z1 + tInt, z1: frame.zHi };
    const finishY = finishTop - 0.02;
    const finish = (tag: string, rect: { x0: number; x1: number; z0: number; z1: number }, material: THREE.Material): void => {
      if (rect.x1 - rect.x0 <= 0.05 || rect.z1 - rect.z0 <= 0.05) return;
      centred(builder, `aarr-house-${id}-zonefloor-${tag}`, [(rect.x0 + rect.x1) / 2, finishY, (rect.z0 + rect.z1) / 2], [rect.x1 - rect.x0, 0.04, rect.z1 - rect.z0], material, { cast: false });
    };
    finish('living', living, livingCarpet);
    finish('kitchen', kitchen, kitchenTile);
    finish('dining', dining, kitchenTile);
    finish('bath', bath, bathTile);

    // ---- Trim. Skirting sits ON the finished floor, cornice tucks under the
    // ceiling board. Both clear the GLB's ground glazing: heads measure 2.35
    // (west) and 2.65 (east), and the cornice starts at 2.66.
    //
    // DEPTH IS NOT COSMETIC. Two wall planes disagree by 0.288 m here and the
    // trim has to touch whichever one is present. This module rooms against
    // REBUILD_SHELL_WALL_T (0.3 unscaled, 0.48 m), which is also where
    // AuthorityGray stops the player; the catalog house GLB's own walls are
    // 0.12 local (0.192 m), so its inner face sits 0.288 m OUTBOARD of the
    // plane the player can reach. A 0.05 strip on the arena plane would hang in
    // mid-air off the GLB wall. Each strip therefore runs 0.30 unscaled
    // (0.48 m) from 0.08 m proud of the arena plane to 0.40 m behind it, which
    // buries its far edge inside the GLB wall (0.192 m thick) without piercing
    // the exterior, and inside the fallback shell wall as well.
    const portal = frontDoorPortal(id);
    const [linkZ0, linkZ1] = rearLinkGap(id);
    const runsMinusGap = (from: number, to: number, gapFrom: number, gapTo: number): Array<[number, number]> =>
      [[from, Math.min(gapFrom, to)] as [number, number], [Math.max(gapTo, from), to] as [number, number]]
        .filter(([a, b]) => b - a > 0.05);
    const faces: Array<{ axis: 'x' | 'z'; plane: number; inward: number; runs: Array<[number, number]> }> = [
      { axis: 'x', plane: frame.innerFront, inward: -face, runs: runsMinusGap(frame.zLo, frame.zHi, portal.centreZ - portal.width / 2, portal.centreZ + portal.width / 2) },
      { axis: 'x', plane: frame.innerRear, inward: face, runs: runsMinusGap(frame.zLo, frame.zHi, linkZ0, linkZ1) },
      { axis: 'z', plane: frame.zLo, inward: 1, runs: [[xLo, xHi]] },
      { axis: 'z', plane: frame.zHi, inward: -1, runs: [[xLo, xHi]] },
    ];
    for (const [index, wallFace] of faces.entries()) {
      for (const [runIndex, [from, to]] of wallFace.runs.entries()) {
        const mid = (from + to) / 2;
        const len = to - from;
        for (const [tag, y, height] of [['skirt', finishTop + 0.07, 0.14], ['cornice', 2.695, 0.07]] as Array<[string, number, number]>) {
          const centre: Vec3 = wallFace.axis === 'x'
            ? [wallFace.plane - wallFace.inward * 0.1, y, mid]
            : [mid, y, wallFace.plane - wallFace.inward * 0.1];
          const size: Size3 = wallFace.axis === 'x' ? [0.3, height, len] : [len, height, 0.3];
          centred(builder, `aarr-house-${id}-inwall-${tag}-${index}-${runIndex}`, centre, size, interiorTrim, { cast: false });
        }
      }
    }

    // ---- Sage accent, on the bath box's dining-side face.
    //
    // WHY NOT THE WALL THE REF USES. `living-room-eye.png` paints the window
    // wall green. That wall is the GLB's, and lining it seals its glazing (see
    // the fit-out header). The next candidate, the cross partition, measures
    // out at 0.16 m and 0.64 m of actual wall once its 2.4 m great-room
    // opening, its 1.0 m bath door and the open den frontage are subtracted -
    // two stripes, not an accent. The bath box's north face is arena-owned, has
    // no opening in it at any height, runs the full 3.68 m of the rear band,
    // and is the plane a player reads straight across the open plan from the
    // sofa, because the den frontage beside it is deliberately wall-free. That
    // is the substitution, and it is a substitution.
    const accentTop = 2.66;
    const accentBase = finishTop + 0.14;
    for (const [index, wall] of ATOMIC_ACRES_REBUILD_WALLS.filter((entry) => entry.house === id && entry.id.includes('bath north')).entries()) {
      centred(
        builder,
        `aarr-house-${id}-inwall-accent-${index}`,
        [(wall.x0 + wall.x1) / 2, (accentBase + accentTop) / 2, wall.z1 + 0.015],
        [wall.x1 - wall.x0, accentTop - accentBase, 0.03],
        sageAccent,
        { cast: false },
      );
    }

    // ---- Dressing, true world metres (see `dressPiece`). Deliberately few:
    // the owner's complaint was crowding, so the living room gets one rug and
    // one low table on the open floor between sofa and window wall, and the
    // dining nook one pedestal table. Rug width 2.2 m is the largest that
    // clears the front wall in BOTH houses (east has 15.92 m against an inner
    // face at 15.84 m).
    const rugX = ((frame.innerFront + stripX) / 2) * S;
    const rugZ = (living.z0 + 1.2) * S;
    dressPiece(root, `aarr-house-${id}-dress-rug`, [rugX, finishTop + 0.012, rugZ], [2.2, 0.024, 2.6], rugMaterial);
    dressPiece(root, `aarr-house-${id}-dress-table-top`, [rugX, finishTop + 0.41, rugZ], [1.15, 0.06, 0.55], teakTrim);
    for (const [legX, legZ] of [[-0.5, -0.2], [0.5, -0.2], [-0.5, 0.2], [0.5, 0.2]] as Array<[number, number]>) {
      dressPiece(root, `aarr-house-${id}-dress-table-leg-${legX < 0 ? 'a' : 'b'}${legZ < 0 ? 'a' : 'b'}`, [rugX + legX, finishTop + 0.19, rugZ + legZ], [0.05, 0.38, 0.05], teakTrim);
    }
    const diningX = ((dining.x0 + dining.x1) / 2) * S;
    const diningZ = ((dining.z0 + dining.z1) / 2) * S;
    dressPiece(root, `aarr-house-${id}-dress-dining-top`, [diningX, finishTop + 0.73, diningZ], [1.3, 0.06, 0.9], teakTrim);
    dressPiece(root, `aarr-house-${id}-dress-dining-stem`, [diningX, finishTop + 0.36, diningZ], [0.16, 0.7, 0.16], teakTrim);
    // Tiled splashback over the relocated counter run (ref: `living-room-eye`
    // puts tile between worktop and wall cabinets). 0.9-1.5 m matches the run's
    // own worktop height.
    dressPiece(root, `aarr-house-${id}-dress-splashback`, [((kitchen.x0 + kitchen.x1) / 2) * S, finishTop + 1.2, Math.min(kitchen.z0, kitchen.z1) * S + 0.04], [3.0, 0.6, 0.06], bathTile);
  };

  const houseSpecs = [
    { id: 'west', cx: -13.5, cz: 1.5, w: 7.2, d: 6.0, porch: 1 as const },
    { id: 'east', cx: 13.5, cz: -1.5, w: 7.8, d: 6.4, porch: -1 as const },
  ] as const;
  for (const house of houseSpecs) {
    const face = house.id === 'west' ? 1 : -1; // loop-facing side
    const skin = houseSkin[house.id];
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
    // Floor slab (presentation; movement floor is AuthorityGray's proxy). This
    // is the sub-floor the per-zone finishes below sit on, and it is what shows
    // if the house GLB never resolves, so it carries the largest zone's finish
    // (carpet) rather than the plank bake it used to.
    centred(builder, `aarr-house-${house.id}-floor`, [house.cx, 0.06, house.cz], [house.w, 0.12, house.d], livingCarpet, { cast: false });
    // FINISHED FLOOR LEVEL. The catalog house GLB brings its own foundation
    // slab and it is HIGHER than this sub-floor, so the sub-floor is not what a
    // player sees once the GLB resolves: measured on the shipped files (node
    // transform x accessor bounds, y unscaled by the 1.6 plan spread),
    // `house-west-teal.glb` Foundation tops out at 0.150 and
    // `house-east-yellow.glb` at 0.300. Each zone finish below sits 20 mm above
    // its own house's foundation - the same no-z-fight step the carriageway
    // block uses against the desert apron - so the finish reads in both the
    // GLB-resolved and the fallback case, and ground furniture stands on it.
    const finishTop = house.id === 'west' ? 0.17 : 0.32;
    // Rear wall split at the garage personnel link + side walls, full storey.
    const [linkZ0, linkZ1] = rearLinkGap(house.id);
    const rearCX = rearX + (face === 1 ? t / 2 : -t / 2);
    centred(builder, `aarr-house-${house.id}-rear-south`, [rearCX, 1.5, (z0 + linkZ0) / 2], [t, 3, Math.max(linkZ0 - z0, 0.05)], skin);
    centred(builder, `aarr-house-${house.id}-rear-north`, [rearCX, 1.5, (linkZ1 + z1) / 2], [t, 3, Math.max(z1 - linkZ1, 0.05)], skin);
    centred(builder, `aarr-house-${house.id}-rear-link-lintel`, [rearCX, (REBUILD_DOOR_HEAD_Y + 3) / 2, (linkZ0 + linkZ1) / 2], [t, 3 - REBUILD_DOOR_HEAD_Y, linkZ1 - linkZ0], massing);
    // ---- SIDE ELEVATIONS, WITH THE WINDOW APERTURES ACTUALLY CUT (lane-F,
    // 2026-09-16). Measured on the current capture, no sunlight reaches any
    // interior floor in this arena: on the interior frame the fraction of
    // pixels above 0.9 is 0.000 and p99 is 0.841 - not one key-lit pixel -
    // while `refs/living-room-eye.png` is DEFINED by hard sun entering a window
    // wall and pooling on the floor. The lighting lane proved no rig change can
    // reach it (`fillLight.castShadow = false`, and the sun cannot pass an
    // opaque wall) and the interior lane took the whole window DRESSING out of
    // the shadow map, which was necessary and not sufficient: these two walls
    // were each ONE solid box spanning the full elevation, they cast, and they
    // sat directly behind every casing. The sun had nothing to come through.
    //
    // So the box is split around its own openings: a sill band under them, a
    // header band over them, and jamb piers between them. Every segment keeps
    // the elevation's outer plane, its thickness `t`, its `skin` material and
    // its full 0..3 height between them, so from outside the silhouette and the
    // extents are bit-for-bit what they were; the only difference is that two
    // 1.46 x 1.36 m rectangles of the casting geometry are now absent, and the
    // non-casting casing and pane `dressWindow()` already stands there fill
    // them. Openings come from DRESS_WIN_OFFSETS/DRESS_WIN_W, the same
    // constants the dressing reads, so the hole cannot drift off the window.
    //
    // PRESENTATION ONLY, and this is checkable rather than asserted: `centred()`
    // pins solid:false/shots:false on every one of these, and the arena's
    // colliders, shot surfaces and spawns all come from
    // `atomicAcresRebuildAuthority()` in a separate module whose own
    // `aarr-house-<id>-north`/`-south` brick proxies are untouched. Measured
    // across this change: 122 colliders and 139 shot surfaces before and after.
    //
    // NAMING IS LOAD-BEARING: `hideHouseSkin()` hides exterior skin by the
    // `-north`/`-south` infixes, so every segment name must still contain one
    // (and must avoid the lintel/inwall/upwall/slab/stair/furn/-floor
    // exclusions) or the split walls would survive the catalog house GLB and
    // stand inside it.
    const apHalfW = DRESS_WIN_W / 2 - DRESS_APERTURE_MARGIN;
    const apY0 = DRESS_SILL_Y + DRESS_APERTURE_MARGIN;
    const apY1 = DRESS_HEAD_Y - DRESS_APERTURE_MARGIN;
    const emitGlazedWall = (tag: 'north' | 'south', planeCz: number): void => {
      const name = `aarr-house-${house.id}-${tag}`;
      centred(builder, `${name}-sill`, [house.cx, apY0 / 2, planeCz], [house.w, apY0, t], skin);
      centred(builder, `${name}-header`, [house.cx, (apY1 + 3) / 2, planeCz], [house.w, 3 - apY1, t], skin);
      const openings = DRESS_WIN_OFFSETS
        .map((dx) => [house.cx + dx - apHalfW, house.cx + dx + apHalfW] as const)
        .sort((a, b) => a[0] - b[0]);
      let cursor = house.cx - house.w / 2;
      const piers: Array<readonly [number, number]> = [];
      for (const [lo, hi] of openings) {
        if (lo > cursor) piers.push([cursor, lo] as const);
        cursor = Math.max(cursor, hi);
      }
      const end = house.cx + house.w / 2;
      if (end > cursor) piers.push([cursor, end] as const);
      for (const [index, [lo, hi]] of piers.entries()) {
        centred(builder, `${name}-pier-${index}`, [(lo + hi) / 2, (apY0 + apY1) / 2, planeCz], [hi - lo, apY1 - apY0, t], skin);
      }
    };
    emitGlazedWall('north', z1 - t / 2);
    emitGlazedWall('south', z0 + t / 2);
    // Loop-facing wall split around the door gap + lintel above.
    const frontCX = frontX + (face === 1 ? -t / 2 : t / 2);
    centred(builder, `aarr-house-${house.id}-front-south`, [frontCX, 1.5, (z0 + gap0) / 2], [t, 3, Math.max(gap0 - z0, 0.05)], skin);
    centred(builder, `aarr-house-${house.id}-front-north`, [frontCX, 1.5, (gap1 + z1) / 2], [t, 3, Math.max(z1 - gap1, 0.05)], skin);
    centred(builder, `aarr-house-${house.id}-front-lintel`, [frontCX, (REBUILD_DOOR_HEAD_Y + 3) / 2, portal.centreZ], [t, 3 - REBUILD_DOOR_HEAD_Y, portal.width], massing);
    // Upper storey hollow shell (walkable, concept cutaways).
    centred(builder, `aarr-house-${house.id}-upper-rear`, [rearX + (face === 1 ? t / 2 : -t / 2), 4.5, house.cz], [t, 3, house.d], skin);
    centred(builder, `aarr-house-${house.id}-upper-front`, [frontX + (face === 1 ? -t / 2 : t / 2), 4.5, house.cz], [t, 3, house.d], skin);
    centred(builder, `aarr-house-${house.id}-upper-north`, [house.cx, 4.5, z1 - t / 2], [house.w, 3, t], skin);
    centred(builder, `aarr-house-${house.id}-upper-south`, [house.cx, 4.5, z0 + t / 2], [house.w, 3, t], skin);
    for (const wall of ATOMIC_ACRES_REBUILD_WALLS) {
      if (wall.house !== house.id) continue;
      const cx = (wall.x0 + wall.x1) / 2;
      const cz = (wall.z0 + wall.z1) / 2;
      const len = Math.max(wall.x1 - wall.x0, wall.z1 - wall.z0);
      const bath = wall.id.includes('bath');
      centred(builder, `aarr-house-${house.id}-inwall-${wall.id}`, [cx, 1.5, cz], [wall.x1 - wall.x0, 3, wall.z1 - wall.z0], bath ? bathTile : plasterFor(len));
    }
    // Upper floor slabs mirror upperSlabs (stairwell hole stays open). The slab
    // now shows only its TOP face to a player — the ceiling boards below cover
    // its underside — so it carries the upper storey's own finish, the gold
    // carpet of `bedroom-eye.png`, not the plank bake that used to double as
    // every ground-floor ceiling.
    for (const [index, slab] of upperSlabs(house.id).entries()) {
      centred(builder, `aarr-house-${house.id}-upper-slab-${index}`, [(slab.x0 + slab.x1) / 2, 2.875, (slab.z0 + slab.z1) / 2], [slab.x1 - slab.x0, 0.25, slab.z1 - slab.z0], upperCarpet, { cast: false });
      centred(builder, `aarr-house-${house.id}-ceiling-board-${index}`, [(slab.x0 + slab.x1) / 2, REBUILD_UPPER_FLOOR_Y - REBUILD_UPPER_SLAB_T - 0.04, (slab.z0 + slab.z1) / 2], [slab.x1 - slab.x0, 0.04, slab.z1 - slab.z0], interiorCeiling, { cast: false });
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
    //
    // THE WEDGE (integrator capture 2026-09-16, `artifacts/viewpoint-regression/
    // trial/.../interior-west.png`: the run "occupies the entire left half of
    // the frame as one flat untextured terracotta wedge"). Each step is a box
    // that starts at the FLOOR and rises to its own tread, so fifteen nested
    // boxes share one continuous side plane 7.2 m long and 3 m tall - a solid
    // triangle with no step in it from any angle but the front. That shape is
    // the authority's, not a look choice: `rebuildParts()` needs the filled
    // volume for climbable 0.2 m risers, and the authority copy stays exactly
    // as it is.
    //
    // WHY THE MATERIAL ALONE CANNOT FIX IT. The run already rides
    // `inPbr('StairTimber', ...)`. The bake is simply almost flat: luma stddev
    // 1.79 over a 128x128 resample, against WoodFloor 4.13, BathTile 6.99 and
    // DesertSand 12.37. Re-routing it changes nothing a camera can see, so what
    // goes on instead is the detail a real stair has and this one did not: a
    // proud tread nosing on every step, in the LIGHTER WoodFloor bake (#a4774a
    // against StairTimber's #8a5d3a), overhanging 30 mm at the front and 20 mm
    // each side. Fifteen light lines crossing a dark side plane is what makes a
    // stair read as a stair from the side, which is the only view this camera
    // has of it. Presentation only: `centred()` pins solid:false/shots:false,
    // and the climbable volume underneath is untouched.
    const stair = stairSpec(house.id);
    const stairW = stair.x1 - stair.x0;
    for (let i = 0; i < REBUILD_STAIR_STEPS; i += 1) {
      const top = REBUILD_STAIR_RISER * (i + 1);
      const treadCz = stair.zA + i * REBUILD_STAIR_TREAD + REBUILD_STAIR_TREAD / 2;
      centred(builder, `aarr-house-${house.id}-stair-${i}`, [(stair.x0 + stair.x1) / 2, top / 2, treadCz], [stairW, top, REBUILD_STAIR_TREAD], stairTimber);
      // z is pulled back 0.02 (0.032 m) and lengthened 0.02 (0.032 m) so the
      // nosing overhangs the riser by 48 mm at the front and still stops 16 mm
      // short of the next step's face: coplanar z faces between consecutive
      // steps would z-fight along every tread line.
      centred(builder, `aarr-house-${house.id}-stair-nosing-${i}`, [(stair.x0 + stair.x1) / 2, top - 0.02, treadCz - 0.02], [stairW + 0.04, 0.05, REBUILD_STAIR_TREAD + 0.02], teakTrim, { cast: false });
    }
    // Rail in walnut, not the cream structural trim: the ref's stair rail is a
    // timber cap, and cream read as the white blocks the integrator flagged
    // along the run's top edge.
    centred(builder, `aarr-house-${house.id}-stair-rail`, [stair.x1 + face * 0.05, 3.5, (stair.zA + stair.zB) / 2], [0.1, 1.0, stair.zB - stair.zA], teakTrim);
    // Upper-storey ceiling: the roof slab's underside is the only lid the
    // bedrooms have and it is exterior shingle. One board 20 mm under its
    // bottom face (6.10) gives the upper rooms the same pale ceiling the ground
    // floor now has, for one mesh per house.
    centred(builder, `aarr-house-${house.id}-ceiling-upper`, [house.cx, 6.06, house.cz], [house.w - 2 * t, 0.04, house.d - 2 * t], interiorCeiling, { cast: false });
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
      for (const dx of DRESS_WIN_OFFSETS) {
        const winMeshes = dressWindow(`aarr-house-${house.id}-win-${tag}-${dx < 0 ? 'a' : 'b'}`, 'z', planeZ, house.cx + dx, DRESS_WIN_W, true);
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
    const kitchen = groundRoom('kitchen');
    const rearBed = upperRoom('rearBed');
    const bathUp = upperRoom('bathUp');
    // Sofa + island share the stair-side strip (long axes along Z, 0.95 and
    // 0.7 wide in a 1.75+ m strip): sofa south, island north, clear walkways
    // around both ends. Bed/bath centred in rooms that fit them.
    const run = stairSpec(house.id);
    const frontInner = house.cx + face * (house.w / 2) - face * 0.3;
    const runEdge = face === 1 ? run.x1 : run.x0;
    const stripX = (frontInner + runEdge) / 2;
    // THE KITCHEN WAS STANDING IN THE LIVING ROOM (owner 2026-09-16: "the
    // inside of the houses are compact and messy"). Both wave-2 GLBs were
    // pinned to the same `stripX` line inside the LIVING rect - sofa at its
    // south end, a 3.0 x 2.2 m appliance run 1.55 m off its north end - so the
    // single widest object in the house cut the great room in half and left the
    // actual kitchen rect empty. Both cutaway refs put the run against the rear
    // band's outer wall with the dining table in front of it, and the rect is
    // there already: west 3.68 x 2.88 m, east 4.48 x 3.20 m in world metres,
    // against a run that is 3.0 long and 0.7 deep. It now backs onto the
    // kitchen's low-z wall at yaw 0 (long axis along world x, 0.68 m and 1.48 m
    // of jamb clearance), which leaves >2.1 m of circulation in front of it and
    // gives the living room back its whole floor.
    // FACING, and how to falsify it: the run's front is its local +z. In the
    // pre-polish capture it sits at yaw PI/2, where local +z maps to world +x,
    // and the camera - which reads the sofa at world z 0.0 with the run at
    // z 4.24, i.e. looking down -z with the run on its left - is therefore
    // outboard of it in +x and sees that face. If a later capture shows a blank
    // back panel here instead of doors, the run is 180 degrees out and the fix
    // is yaw Math.PI with z mirrored to the kitchen's high-z wall.
    const kitchenRunZ = Math.min(kitchen.z0, kitchen.z1) + 0.35 / S;
    const furnish: ReadonlyArray<readonly [string, string, number, number, number, number]> = [
      ['sofa', './assets/rebuild/furniture/sofa.glb', stripX * S, (living.z0 + 1.2) * S, finishTop, Math.PI / 2],
      ['kitchen-counter', './assets/rebuild/furniture/kitchen-counter-v2.glb', ((kitchen.x0 + kitchen.x1) / 2) * S, kitchenRunZ * S, finishTop, 0],
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
        if (tag === 'kitchen-counter') tintKitchenRun(gltf.scene);
      }).catch(() => {
        // Bare room stays: a missing GLB never breaks the lane.
      });
    }
    buildInteriorFitOut(house.id, face, finishTop, stripX, living);
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
    // Bare concrete garage floor (both cutaways; the garage was the one interior
    // zone with no floor mesh at all, so the desert apron showed through it).
    const garageInner = garageSpec(garage.id);
    centred(builder, `aarr-garage-${garage.id}-floor`, [garageInner.cx, 0.06, garageInner.cz], [REBUILD_GARAGE_W, 0.12, REBUILD_GARAGE_D], garageConcrete, { cast: false });
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
  // Base-frame catalog GLB: standard kitbash applies SPREAD + yaw.
  kitbash('./assets/rebuild/vehicles/bus.glb', [-3.2, 0, 0.5], 0.28, [busBody, busRoof]);
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
  // Spread 06 crates (0.96 footprint inside the merged island collider).
  const islandSpots: ReadonlyArray<readonly [number, number, number]> = [[-0.8, 2.2, 0], [0.8, 2.2, 0], [-0.8, 3.8, 0], [0.8, 3.8, 0], [0, 3, 0.6]] as const;
  for (const [dx, dz, dy] of islandSpots) {
    const box = centred(builder, `aarr-island-crate-${dx}-${dz}`, [dx, 0.62, dz], [1, 1, 1], crate);
    kitbash('./assets/rebuild/crates-worn/crate-06-worn.glb', [dx * 1.6, dy, dz * 1.6], (dx + dz) * 0.4, [box], undefined, true);
  }
  pair(builder, 'aarr-hedge-loop', 12.2, 0.6, -4.3, [1.2, 1.2, 2.0], hedge);
  // Yard clusters near fences/pads (topdown plate scatter).
  const yardClusters: ReadonlyArray<readonly [number, number]> = [[-8, -12], [8, -13], [-6, 9], [6, 8]] as const;
  for (const [cx, cz] of yardClusters) {
    const side = cx < 0 ? 'w' : 'e';
    const end = cz < 0 ? 'n' : 's';
    const spots: ReadonlyArray<readonly [number, number, number]> = [[cx, cz, 0], [cx + 1, cz, 0], [cx + 0.5, cz, 0.6], [cx + 0.5, cz + 1, 0]] as const;
    for (const [sx, sz, sy] of spots) {
      const box = centred(builder, `aarr-yard-crate-${side}-${end}-${sx}-${sz}`, [sx, 0.5 + sy, sz], [1, 1, 1], crate);
      kitbash('./assets/rebuild/crates-worn/crate-06-worn.glb', [sx * 1.6, sy, sz * 1.6], (sx + sz) * 0.7, [box], undefined, true);
    }
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
  // Rebuilt bays (Lane N: 3.93 m world width, 2.14 tall, y=0 standing).
  // Bay world width in base units: 3.93 / 1.6 = 2.456.
  const fenceRuns: ReadonlyArray<{ name: string; cx: number; cz: number; alongX: boolean; bays: number }> = [
    { name: 'lot-north', cx: 10, cz: -10, alongX: true, bays: 3 },
    { name: 'lot-south', cx: 10, cz: 8, alongX: true, bays: 3 },
    { name: 'drive', cx: 20.5, cz: 6, alongX: false, bays: 4 },
  ] as const;
  for (const run of fenceRuns) {
    const [runW, runE] = pair(builder, `aarr-fence-${run.name}`, run.cx, 0.9, run.cz, run.alongX ? [9, 1.8, 0.25] : [0.25, 1.8, 10], timber);
    const hide = [runW, runE];
    for (const side of [-1, 1] as const) {
      for (let b = 0; b < run.bays; b += 1) {
        const off = (b - (run.bays - 1) / 2) * 2.456;
        const bx = run.alongX ? side * run.cx + off : side * run.cx;
        const bz = run.alongX ? run.cz : run.cz + off;
        kitbash('./assets/rebuild/spread/fence-bay.glb', [bx * 1.6, 0, bz * 1.6], run.alongX ? 0 : Math.PI / 2, hide, undefined, true);
      }
      // Timber end posts close the remainder (bays cover 7.37 of 9, 9.83 of 10).
      const endOff = run.alongX ? 4.4 : 4.9;
      for (const e of [-endOff, endOff] as const) {
        const px = run.alongX ? side * run.cx + e : side * run.cx;
        const pz = run.alongX ? run.cz : run.cz + e;
        centred(builder, `aarr-fence-${run.name}-post-${side < 0 ? 'w' : 'e'}-${e < 0 ? 'a' : 'b'}`, [px, 1.0, pz], [0.25, 2.0, 0.25], timber);
      }
    }
  }

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
    [-22, 4, 'yard'],
    [22, 4, 'yard'],
    [-38, 30, 'desert'],
    [38, 30, 'desert'],
    [-44, -20, 'desert'],
    [44, -20, 'desert'],
    [-40, 44, 'desert'],
    [40, 44, 'desert'],
  ] as const;
  for (const [tx, tz, kind] of treeSpots) {
    const tag = `${kind}-${tx}-${tz}`;
    const trunk = centred(builder, `aarr-tree-${tag}-trunk`, [tx, 1.0, tz], [0.4, 2.0, 0.4], timber);
    const crown = centred(builder, `aarr-tree-${tag}-crown`, [tx, 2.8, tz], [2.2, 1.8, 2.2], hedge);
    const top = centred(builder, `aarr-tree-${tag}-top`, [tx, 4.0, tz], [1.2, 1.0, 1.2], hedge);
    // Through the cached kitbash pump (raw: tree GLBs are world-scale like
    // the spread rebuilds). Direct parallel loads starve the browser queue
    // and nothing resolves before capture settle (see pump note above).
    kitbash(treeGLBs[kind], [tx * ATOMIC_ACRES_REBUILD_SPREAD, 0, tz * ATOMIC_ACRES_REBUILD_SPREAD], 0, [trunk, crown, top], undefined, true);
  }

  // ---- Wave-3 dressing: rock clusters + prickly pears (Trellis GLBs over
  // massing blobs, manifest ground-plants-20260915). Non-solid dress.
  const rockSpots: ReadonlyArray<readonly [number, number]> = [[0, 44], [20, 46], [-20, 46], [-40, 28], [-30, 40], [30, 40], [-44, -8], [44, -8]] as const;
  for (const [rx, rz] of rockSpots) {
    const blob = centred(builder, `aarr-rockdress-${rx}-${rz}`, [rx, 0.5, rz], [1.6, 1.0, 1.6], rock);
    kitbash('./assets/rebuild/plants/rock-cluster.glb', [rx, 0, rz], 0, [blob]);
  }
  const pearSpots: ReadonlyArray<readonly [number, number]> = [[-24, 10], [24, -8], [-8, 24], [12, -22], [-28, -18], [28, -18], [-30, 28], [30, 28], [-14, 30], [14, 30]] as const;
  for (const [px, pz] of pearSpots) {
    const blob = centred(builder, `aarr-pear-${px}-${pz}`, [px, 0.5, pz], [0.8, 1.0, 0.8], hedge);
    kitbash('./assets/rebuild/plants/prickly-pear.glb', [px, 0, pz], 0, [blob]);
  }
  const rand = mulberry32(ATOMIC_ACRES_REBUILD_SEED);
  let scrub = 0;
  let rockCount = 0;
  for (let i = 0; i < 60; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (27 + rand() * 30);
    const z = -34 + rand() * 68;
    if (Math.abs(x) < 44 || Math.abs(z) > 58) continue;
    const s = 0.5 + rand() * 0.7;
    centred(builder, `aarr-scrub-${i}`, [x, s / 2, z], [s, s, s], hedge);
    scrub += 1;
  }
  for (let i = 0; i < 30; i += 1) {
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
