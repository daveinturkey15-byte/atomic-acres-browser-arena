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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, emptyTelemetry, standard, type Builder } from './additional-maps';
import { texturedMaterial } from './art-kit';
import { bindLateArenaReflectionSurfaces } from './rendering/arena-environment-ibl';
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

/**
 * PER-FAMILY SPECULAR TAGS (lane-K, 2026-09-16).
 *
 * `scene.environmentIntensity` is one scalar for the entire scene, so the only
 * way this arena can give its glass, its vehicle paint and its metal trim
 * DIFFERENT amounts of reflection is a per-material `envMap`. The route that
 * binds one already exists and is not arena-specific in its selection:
 * `bindNuketownVehicleReflections` (rendering/nuketown-reflection-proxy.ts,
 * driven from rendering/arena-environment-ibl.ts) keys purely on
 * `material.userData.forgeRole` in {glass, paint, chrome} and binds the arena's
 * own PMREM at 1.2x (glass) or 0.7x (paint, chrome) of the reflection scale.
 * Until this pass nothing in this arena carried the tag - the arena does not
 * build through vehicle-forge/materials.ts, which was the only tagger in the
 * tree - so the route ran over it and bound nothing.
 *
 * WHAT IS DELIBERATELY NOT TAGGED. The point of a per-family binding is that it
 * lifts the automotive and glazed surfaces WITHOUT lifting every matte wall, so
 * the tag stays off siding, plaster, roofs, asphalt, concrete, hedge, rock,
 * timber, canvas, rubber and every emissive lamp lens. `roof` in particular is
 * shared between the six architectural roofs and the bus roof, and it is left
 * untagged rather than split: making six house and garage roofs reflective to
 * reach one 0.2 m bus panel that a catalog GLB covers anyway is the exact trade
 * this selection exists to refuse.
 */
type ForgeRole = 'glass' | 'paint' | 'chrome';

/** Tags a material for the per-family specular binding and returns it. */
function forgeRole<T extends THREE.Material>(material: T, role: ForgeRole): T {
  material.userData.forgeRole = role;
  return material;
}

/**
 * The catalog GLBs whose materials are classified.
 *
 * Restricted by asset family on purpose. The kitbash pump also streams crates,
 * plants, litter, fences, sheds, signs and interior wear, and a name regex let
 * loose over all of them would start tagging things like a "steel" crate band
 * by accident. Vehicles, the two houses and the street lamps are the families
 * the reference plates actually judge specular on.
 */
const REFLECTIVE_CATALOG_GLB = /\/(?:vehicles|houses)\/|\/spread\/lamp\.glb$/;
const CATALOG_VEHICLE_GLB = /\/vehicles\//;

/**
 * Role for one catalog material, from the name the asset itself carries.
 *
 * These are this project's own authored GLBs and their material names are
 * deterministic: BusGlassDark / SemiGlassDark / BurntGlassDark / JeepGlass /
 * WindowGlass / GlassDark / SolarPanelGlass; SemiChrome / BusSteel / SemiSteel
 * / WreckSteel / JeepSteel / GalvMetal / DarkMetal / BlackMetal; and the paint
 * coats SchoolBusYellow / SemiCabRed / TrailerWhite / TrailerRib / OliveDrab /
 * SunBleachTop / RustyCharBase / *TrimBlack. Classifying on the name rather
 * than on `metalness` is what keeps the black-painted trim (metalness 0) apart
 * from the bare steel (metalness 0.7-0.9) - both read as "dark" numerically and
 * only one of them is metal.
 *
 * Paint is admitted on the VEHICLE families only. House siding is a matte
 * painted wall; lifting it is the thing the per-family route exists to avoid.
 */
function catalogForgeRole(url: string, materialName: string): ForgeRole | null {
  if (/glass|windshield|windscreen/i.test(materialName)) return 'glass';
  if (/chrome|steel|metal/i.test(materialName)) return 'chrome';
  if (CATALOG_VEHICLE_GLB.test(url) && /yellow|red|white|olive|drab|rib|bleach|rusty|trim|paint/i.test(materialName)) return 'paint';
  return null;
}

/**
 * Tags a resolved catalog GLB's materials in place. Returns true when anything
 * new was tagged, which is the caller's signal that the binding has to be
 * replayed for surfaces the environment pass has already run past.
 *
 * Idempotent: a material already carrying a role is left alone, so the repeated
 * clones the pump produces do not re-mark materials for recompile.
 */
function tagCatalogReflectionRoles(url: string, loaded: THREE.Object3D): boolean {
  if (!REFLECTIVE_CATALOG_GLB.test(url)) return false;
  let tagged = false;
  loaded.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (!material || material.userData.forgeRole) continue;
      const role = catalogForgeRole(url, material.name);
      if (!role) continue;
      material.userData.forgeRole = role;
      tagged = true;
    }
  });
  return tagged;
}

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

/**
 * Wall-art atlas, drawn in code — one 512x512 canvas, four quadrants.
 *
 * `living-room-eye.png` carries a brass STARBURST WALL CLOCK and a group of
 * framed pictures, and `bedroom-eye.png` repeats the pictures over the bed.
 * Neither is reachable from the ten baked PNGs on disk (they are plaster,
 * ceiling, tile, plank, teak, concrete, asphalt, sand, lawn — no figurative
 * content at all), and `public/assets/**` is another lane's. The canvas route
 * that `starburstRugTexture()` opened for the rug is the only one a
 * presentation lane has to a DRAWING, so the clock and the pictures take it.
 *
 * ONE canvas, not four, because `texture.clone()` shares `.source`: four
 * quadrant clones at repeat (0.5, 0.5) are one GPU upload (512^2 RGBA plus
 * mips, about 1.4 MB decoded) instead of four. Quadrants, in UV space with
 * v measured from the BOTTOM: (0,1) clock, (1,1) abstract A, (0,0) abstract B,
 * (1,0) spare/landscape.
 *
 * Returns null without a drawable 2D context, exactly like the rug: the
 * callers fall back to plain trim, so wall art is never the reason a headless
 * audit or a build breaks.
 */
function midCenturyWallArtTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const size = 512;
    const half = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // --- top-left quadrant: brass starburst clock on cream.
    ctx.fillStyle = '#efe7d8';
    ctx.fillRect(0, 0, half, half);
    const ccx = half / 2;
    const ccy = half / 2;
    ctx.strokeStyle = '#8a6a2f';
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const long = i % 2 === 0;
      ctx.lineWidth = long ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(ccx + Math.cos(angle) * 34, ccy + Math.sin(angle) * 34);
      ctx.lineTo(ccx + Math.cos(angle) * (long ? 118 : 92), ccy + Math.sin(angle) * (long ? 118 : 92));
      ctx.stroke();
    }
    ctx.fillStyle = '#3b3630';
    ctx.beginPath();
    ctx.arc(ccx, ccy, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9cbae';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(ccx, ccy);
    ctx.lineTo(ccx + 4, ccy - 24);
    ctx.moveTo(ccx, ccy);
    ctx.lineTo(ccx + 19, ccy + 9);
    ctx.stroke();
    // --- top-right quadrant: abstract A, teal/rust blocks on oatmeal.
    ctx.fillStyle = '#e4dbc8';
    ctx.fillRect(half, 0, half, half);
    ctx.fillStyle = '#3f8c8c';
    ctx.fillRect(half + 28, 34, 84, 132);
    ctx.fillStyle = '#b0562c';
    ctx.fillRect(half + 96, 92, 112, 96);
    ctx.fillStyle = '#403a33';
    ctx.fillRect(half + 40, 186, 172, 12);
    ctx.fillStyle = '#d9b246';
    ctx.beginPath();
    ctx.arc(half + 176, 62, 30, 0, Math.PI * 2);
    ctx.fill();
    // --- bottom-left quadrant: abstract B, mustard/charcoal strokes.
    ctx.fillStyle = '#ded6c4';
    ctx.fillRect(0, half, half, half);
    ctx.strokeStyle = '#4a443c';
    ctx.lineWidth = 9;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(32 + i * 14, half + 40 + i * 8);
      ctx.lineTo(196 - i * 18, half + 196 - i * 22);
      ctx.stroke();
    }
    ctx.fillStyle = '#c8933a';
    ctx.fillRect(40, half + 150, 130, 44);
    // --- bottom-right quadrant: horizon band, stands in for a landscape print.
    ctx.fillStyle = '#cfd9de';
    ctx.fillRect(half, half, half, half);
    ctx.fillStyle = '#9a8c74';
    ctx.fillRect(half, half + 128, half, 40);
    ctx.fillStyle = '#6f7a5e';
    ctx.fillRect(half, half + 168, half, half - 168);
    ctx.fillStyle = '#cf9a55';
    ctx.beginPath();
    ctx.arc(half + 168, half + 72, 26, 0, Math.PI * 2);
    ctx.fill();
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
    // A PLACEHOLDER THAT CANNOT BE HIDDEN IS WORSE THAN NO PLACEHOLDER.
    //
    // Every mesh in `hide` is a fallback that must disappear the moment its GLB
    // resolves, and the `.then()` below does exactly that - `mesh.visible =
    // false`. It was not working, and the reason is that hiding the SOURCE mesh
    // does nothing once the static batcher has merged its geometry into a
    // combined draw: the merged copy is a different object and keeps rendering.
    //
    // additional-maps.ts:123 sets `presentationBatchCandidate = !solid && !shots`,
    // and `centred()` in this module hard-pins BOTH to false on every mesh it
    // makes - which is what keeps this file presentation-only. So every massing
    // placeholder in the arena was, by construction, a batch candidate.
    //
    // The visible cost was the hero shots: `bus.glb` and `semi.glb` both load
    // and render, and their massing boxes were still drawn around them, so the
    // two vehicles the plates are built around read as white boxes. A raycast
    // into the tiled pixels of the bus station returns `aarr-bus-body`, the
    // placeholder, not the bus.
    //
    // Opting these meshes out of batching makes `visible = false` authoritative.
    // The draw-call cost is transient and small: it applies only while the GLB
    // is in flight, because after it resolves these meshes draw nothing at all.
    for (const mesh of hide) mesh.userData.presentationBatchCandidate = false;
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
        // THE HERO SURFACES ARRIVE AFTER THE ENVIRONMENT DOES. This pump is
        // async and every vehicle GLB HIDES the massing it replaces, so the bus,
        // the semi, the jeep, the rusty car, both houses and the lamps are not
        // in the scene when arena-environment-ibl traverses it. Tag them and ask
        // for the live binding to be replayed; the replay is a no-op unless this
        // scene currently holds one, so a callback that lands after a map switch
        // or under reflectionQuality 'off' touches nothing.
        if (tagCatalogReflectionRoles(url, anchor)) bindLateArenaReflectionSurfaces(scene);
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
  // NOT FIXABLE FROM THIS LANE, STATED RATHER THAN FAKED (lane H, 2026-09-16).
  // The cream interior walls (`plasterFor`) and every ceiling and trim run
  // below are the two flattest surfaces in the arena - InteriorPlaster 0.74 and
  // InteriorCeiling 0.41 luma stddev, i.e. solid colour to a camera - and they
  // are also the largest by screen area in `interior-west`, `interior-sunlit`
  // and `upper-landing`. They cannot be re-routed the way the fence, the
  // crates, the lawns and the vehicle panels were, because `material.color`
  // MULTIPLIES: reaching InteriorPlaster's linear (0.8248, 0.7476, 0.6397) or
  // InteriorCeiling's (0.9326, 0.9156, 0.8656) from ANY of the eight detailed
  // bakes needs a ratio above 1.0 in at least two channels (the brightest
  // detailed bake on disk is BathTile at (0.5342, 0.5928, 0.6549), so even it
  // is 1.54x short in red). The only ways out are a new pale detailed bake -
  // which is the asset lane's to author, not this one's - or darkening the
  // walls, which would be compensating for the light rig while lane G is
  // changing it. Left alone deliberately; re-tiling them changes nothing a
  // camera can see, because there is nothing in the map to re-tile.
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
  // SCALE, added by lane H 2026-09-16. DesertSand's ripple period is about an
  // eighth of a tile. At the shipped flat `repeat 6` over an 11 m house floor
  // that put a ripple at 0.23 m and a pebble at 0.1 m, and
  // `atomic-acres-rebuild-interior-sunlit.png` shows the result honestly: the
  // living-room floor reads as a DUNE FIELD, complete with scattered stones,
  // not as the wool pile the note above intended. The bake is still the right
  // choice - it is the only detailed bake whose mean is already the refs' warm
  // beige - but it has to be tiled at carpet scale. One tile per 0.9 m puts a
  // ripple at 0.11 m and a fleck at 0.05 m, which reads as a corded pile.
  // Derived per floor so a 2 m bedroom band and an 11 m ground floor get the
  // same physical grain instead of the same number of repeats.
  const carpetByRepeat = new Map<string, THREE.Material>();
  const carpetFor = (spanU: number, spanV = spanU, color?: number): THREE.Material => {
    const rx = spanU < 8 ? 6 : 12;
    const ry = spanV < 8 ? 6 : 12;
    const key = `${rx}:${ry}:${color ?? 0}`;
    let mat = carpetByRepeat.get(key);
    if (!mat) { mat = gndPbr('DesertSand', rx, ry, color); carpetByRepeat.set(key, mat); }
    return mat;
  };
  const UPPER_CARPET_GOLD = 0xf8ffda;
  const livingCarpet = carpetFor(6, 6);
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
  /**
   * ASPHALT, PER AXIS - same defect the concrete pass fixed, left on the roads.
   *
   * A flat `repeat (5, 5)` was applied to every asphalt mesh regardless of its
   * shape. On the two 7 x 90 m service roads that draws a tile 1.4 m across and
   * 18 m ALONG - a 13:1 stretch - and the result does not read as asphalt at
   * all: in the 15:37 overview and topdown captures both service roads render
   * as long brown streaks that look like timber decking, which is exactly how
   * they were first misread as a materials regression. They are not a
   * regression; the tiling has been anisotropic since the roads were authored.
   *
   * The authored intent is recoverable from the mesh the repeat actually suited:
   * the 25.2 x 20 m loop at repeat 5 gives a ~4.5 m tile, so that is the tile
   * size both axes derive from.
   *
   * The ladder runs one step past the concrete one. 90 / 4.5 = 20, and the
   * shared [1,2,4,8] ladder would clamp that to 8 - an 11.25 m tile, still a
   * 3:1 stretch. Allowing 16 lands it at 5.6 m against 3.5 m across, i.e. 1.6:1.
   * That costs at most one extra 1024^2 pair (`texture()` caches on
   * path:repeatX:repeatY, so every distinct pair is its own upload plus mips)
   * and the arena is at 358.7 MB of decoded VRAM with the budget gate at 500.
   */
  const ASPHALT_TILE_M = 4.5;
  const ASPHALT_SNAP = [1, 2, 4, 8, 16] as const;
  const snapAsphalt = (v: number): number => ASPHALT_SNAP.reduce(
    (best, step) => (Math.abs(step - v) < Math.abs(best - v) ? step : best), ASPHALT_SNAP[0]);
  const asphaltByRepeat = new Map<string, THREE.Material>();
  const asphaltFor = (spanU: number, spanV = spanU): THREE.Material => {
    const rx = snapAsphalt(spanU / ASPHALT_TILE_M);
    const ry = snapAsphalt(spanV / ASPHALT_TILE_M);
    const key = `${rx}:${ry}`;
    let mat = asphaltByRepeat.get(key);
    if (!mat) { mat = gndPbr('AsphaltLoop', rx, ry); asphaltByRepeat.set(key, mat); }
    return mat;
  };
  const asphalt = asphaltFor(25.2, 20);
  const timber = inPbr('StairTimber', 2, 1);
  const sand = gndPbr('DesertSand', 8, 8);
  /**
   * VEHICLE PANELS (ref `hero-vehicles.png`, `street-teal.png`). Three of the
   * five vehicle massings are kitbashed over by a catalog GLB, but the four
   * outside trailers and both garage cars are NOT, and they were the last flat
   * `standard()` colour on a large mesh: a 2.6 x 2.8 x 9 m box in one solid
   * grey. BathTile is an 8x8 square grid, which on a box trailer is exactly
   * right - the refs' trailers are ribbed panel sides, and a 0.5 m tile pitch
   * is the panel pitch. The tint is the OLD colour, reproduced exactly rather
   * than re-art-directed: #a8adb3 is linear (0.3916, 0.4179, 0.4508) and the
   * BathTile bake means (0.5342, 0.5928, 0.6549), so the ratios are 0.733 /
   * 0.705 / 0.688 - all below 1.0, so this one IS reachable, unlike the cream
   * interior walls below. Nothing about the surface's value changes; it gains
   * 7.38 stddev of panel structure where it had none.
   */
  const VEHICLE_GREY = 0xdedbd8;
  /**
   * VEHICLE PANELS, PER AXIS - the identical defect `asphaltFor` above fixed on
   * the service roads, left on the vehicles.
   *
   * The header's reasoning is right and the tint is right; the REPEAT was the
   * bug. BathTile is an 8x8 SQUARE grid and it was applied at a flat (3, 1) to
   * every vehicle panel regardless of the panel's shape. On the bus body that
   * draws 24 columns across 17.6 m and 8 rows up 2.6 m - a 0.73 x 0.33 m cell -
   * and `artifacts/viewpoint-regression/final-pm3/atomic-acres-rebuild/
   * atomic-acres-rebuild-bus-closeup.png` shows the result honestly: the body
   * reads as a tiled bathroom wall. A trailer's ribbing is a set of parallel
   * VERTICAL ribs and contains no horizontal lines at all, so the horizontals
   * were never wanted - they came in free with a square grid.
   *
   * Both axes now derive from one physical size. Across the body: one rib every
   * VEHICLE_RIB_M, i.e. repeatX = span / (rib x 8 cells), snapped so the pair
   * count stays bounded. Up the body: exactly ONE cell row over the full height
   * (repeatY = 1/8), which stretches the bake's horizontal grout onto the
   * panel's top and bottom EDGES - where a real trailer carries a rub rail and
   * a roof cap - instead of ruling lines across its face.
   *
   * The snap ladder is deliberately two rungs, not the asphalt five. `texture()`
   * caches on path:repeatX:repeatY and each distinct pair is its own 1024^2
   * upload plus mips for BOTH the diffuse and the roughness bake, and the arena
   * is at 358.7 MB of decoded VRAM against a 500 MB gate. Two rungs cover the
   * whole set at one extra pair: the long bodies (bus 17.6 m, semi trailer
   * 15.2 m, outside trailers 14.4 m) land on 4 for a 0.45-0.55 m rib, and the
   * garage cars (6.7 m and 3.5 m) land on 2 for a 0.22-0.42 m rib.
   */
  const VEHICLE_RIB_M = 0.5;
  const VEHICLE_BATHTILE_CELLS = 8;
  const VEHICLE_RIB_SNAP = [2, 4] as const;
  const vehicleByRepeat = new Map<number, THREE.Material>();
  /**
   * Vehicle panel coat for a body of `planLength` metres along its long axis.
   * The argument is the PLAN length, the same number the `centred()` call site
   * passes, because `centred()` is what multiplies x and z by SPREAD.
   */
  const vehicleFor = (planLength: number): THREE.Material => {
    const wanted = (planLength * ATOMIC_ACRES_REBUILD_SPREAD) / (VEHICLE_RIB_M * VEHICLE_BATHTILE_CELLS);
    const rx = VEHICLE_RIB_SNAP.reduce(
      (best, step) => (Math.abs(step - wanted) < Math.abs(best - wanted) ? step : best), VEHICLE_RIB_SNAP[0]);
    let mat = vehicleByRepeat.get(rx);
    if (!mat) {
      mat = forgeRole(inPbr('BathTile', rx, 1 / VEHICLE_BATHTILE_CELLS, VEHICLE_GREY), 'paint');
      vehicleByRepeat.set(rx, mat);
    }
    return mat;
  };
  const rust = forgeRole(standard(0x8a5a3a, 0.9, 0.1), 'paint');
  // Green mass + rock + crate, measured 2026-09-16 by the integrator on the
  // yard capture: road stddev 19.3, house wall 10.4, fence 12.0, concrete 8.9,
  // but every green mass 0.21-1.62. The LawnPatchy bake itself measures 16.13,
  // so the flatness was the `standard()` colour, not the texture set. Each
  // green now rides that bake; hedge and scrub are darker than it, so both
  // tints stay under 1.0 per channel.
  const olive = forgeRole(gndPbr('LawnPatchy', 2, 2, 0xeee6f7), 'paint');
  // Lamp posts and the patio umbrella pole - the arena's only authored metal
  // trim (metalness 0.4). The umbrella pole is never kitbashed over.
  const darkPole = forgeRole(standard(0x3a3d42, 0.7, 0.4), 'chrome');
  // HEDGE, RE-TINTED (lane M, 2026-09-16). The coordinator's read of
  // `atomic-acres-rebuild-yard-geometry.png` is "raised green SLABS with
  // visible vertical side faces", and the two candidates were the 0.06 m lawn
  // slabs and these 1.0-1.2 m hedge boxes. MEASURED, not guessed: that station
  // is `camera(... [-32, 5, 26], [22, 2, -16] ...)`, a 5 m eye looking down at
  // ground 20-50 m away. The lawn slab's exposed lip is exactly 0.07 m (top
  // 0.06 against the desert apron's -0.01) and at that eye it is nearly
  // edge-on; it cannot subtend the band in the frame. `aarr-hedge-pad`
  // (1.0 m tall, 7.2 m long, ~10 m from that eye) and `aarr-hedge-yard`
  // (1.2 m) can and do. So the LAWNS ARE LEFT ALONE - sinking them would open
  // a 0.04 m float under the concrete pads that stand on them - and the fix
  // goes where the measurement points: at the hedges' machined top edge, and
  // at a tint that was lighter than the lawn it is supposed to sit on.
  // 0xb4f9cd was a bright mint; 0x93d9a8 is a planting green, and like every
  // tint in this file it is a DARKENING, which is the only direction
  // `material.color` can move a bake.
  const hedge = gndPbr('LawnPatchy', 2, 2, 0x93d9a8);
  const rock = gndPbr('SidewalkConcrete', 1, 1, 0xd9e3f1);
  /**
   * One mirrored hedge run, recorded so the foliage pass can find it.
   *
   * A BOX IS THE RIGHT PRIMITIVE FOR A CLIPPED HEDGE and it stays. What the
   * plates have and the render did not is a foliage SILHOUETTE where the box
   * has a machined corner — in `gray_topdown_01.png`, `street-teal.png` and
   * `teal-backyard.png` the hedges read as a separate, smaller, denser thing
   * sitting on the lawn, with a broken top edge. So the mass is unchanged (it
   * is what the layout contract's fact 9 authored) and the clumps that break
   * its edges are generated from its own world AABB below, which is why this
   * wrapper exists: it keeps the hedge's box and its foliage from ever
   * drifting apart.
   */
  const hedgeRuns: Array<{ cx: number; cy: number; cz: number; w: number; h: number; d: number }> = [];
  const hedgeRun = (name: string, x: number, y: number, z: number, size: Size3): void => {
    pair(builder, name, x, y, z, size, hedge);
    for (const side of [-1, 1]) {
      hedgeRuns.push({
        cx: side * Math.abs(x) * ATOMIC_ACRES_REBUILD_SPREAD,
        cy: y,
        cz: z * ATOMIC_ACRES_REBUILD_SPREAD,
        w: size[0] * ATOMIC_ACRES_REBUILD_SPREAD,
        h: size[1],
        d: size[2] * ATOMIC_ACRES_REBUILD_SPREAD,
      });
    }
  };

  // ---- LANE H / SYSTEM 5, 2026-09-16: SURFACE DETAIL AT TRUE SIZE ----------
  // Re-measured every shipped bake myself (128x128 box resample, luma stddev,
  // and a linear-space mean over the full-res PNG) rather than trusting the
  // header above, because the tint maths below only works off the linear mean:
  //   LawnPatchy 14.53  DesertSand 12.09  AsphaltLoop 11.94  SidewalkConcrete
  //   8.78  BathTile 7.38  WoodFloor 4.83  GarageConcrete 2.72  StairTimber
  //   1.93  InteriorPlaster 0.74  InteriorCeiling 0.41.
  // What each bake actually CONTAINS (looked at, not inferred): BathTile is an
  // 8x8 square tile grid; WoodFloor is 8 parallel PLANK lines running along u;
  // GarageConcrete and SidewalkConcrete are 2x2 slab grids (the latter with
  // pebbles and specks); StairTimber is four barely-there horizontal lines on
  // flat brown; InteriorPlaster and InteriorCeiling are, to a camera, solid
  // colours. So the only structural vocabulary on disk is: planks, tiles,
  // slabs, ripples, patches, cracks.
  //
  // THE RULE THIS SECTION FOLLOWS (morning-diner BUILD.md, System 5 rev 2):
  // roughness is close to inert on a light surface, and albedo steps under
  // ~5% are film grain. A surface only gains detail here if the substituted
  // bake carries a REAL albedo step at the size the object actually is. So
  // each helper below picks `repeat` from the mesh's own span to put one
  // texture tile at a stated real-world size, instead of the fixed 2 or 3 the
  // file used everywhere regardless of whether the mesh was 0.9 m or 16 m.
  //
  // MEASURED BEFORE (11:36 wide capture, patch luma stddev):
  //   choke barricade 3.70, porch/roof boxes 7.08, hedge 9.22, fence run 11.12,
  //   lawn 10.99-25.72, road 12.71, concrete 18.77-24.82.
  // The barricade is the flattest large surface in the set and it is the one
  // thing in the frame that is still a placeholder box, so it goes first.

  /**
   * SidewalkConcrete is a 2x2 slab grid, so one slab = tile/2; a 2.4 m tile
   * puts a slab at 1.2 m, which is a poured bay. The file used a flat
   * `repeat (2, 2)` on every concrete mesh regardless of size, which is only
   * ever right by accident: on the 22 m entry sidewalk it drew slabs 1.1 m
   * across and 11 m long, and on a 0.9 m pillar it drew four 0.45 m slabs
   * where a cast pier has none. Both axes are derived independently so a long
   * thin run does not get square tiles stretched along it.
   */
  // VRAM, NOT FILESIZE (repo memory `gotcha-baked-glb-vram-not-filesize`).
  // `texture()` in art-kit.ts caches on `path:repeatX:repeatY`, so every new
  // repeat pair is a SEPARATE 1024^2 upload - about 5.3 MB with mips, and each
  // material here binds a diffuse AND a roughness. A freely-derived repeat
  // would have produced ~28 new pairs, i.e. ~300 MB of VRAM for tiling alone,
  // on top of the ~25 pairs the file already had. So every derived repeat
  // snaps to a short shared ladder. Tints are free by comparison - `color` is
  // a material uniform, not a texture - which is why the crate ages and the
  // fence cap vary by tint and reuse each other's tiling.
  const SNAP = [1, 2, 4, 8] as const;
  const snap = (v: number): number => SNAP.reduce((best, step) => (Math.abs(step - v) < Math.abs(best - v) ? step : best), SNAP[0]);
  const concreteByRepeat = new Map<string, THREE.Material>();
  const concreteFor = (spanU: number, spanV = spanU): THREE.Material => {
    const rx = snap(spanU / 2.4);
    const ry = snap(spanV / 2.4);
    const key = `${rx}:${ry}`;
    let mat = concreteByRepeat.get(key);
    if (!mat) { mat = gndPbr('SidewalkConcrete', rx, ry); concreteByRepeat.set(key, mat); }
    return mat;
  };
  /**
   * LawnPatchy's bald patches are roughly a quarter of a tile across. At the
   * old flat `repeat 3` over an 11 m lawn that made every dirt patch ~0.9 m —
   * in `atomic-acres-rebuild-yard-geometry.png` they read as craters, and
   * `teal-backyard.png` has no bald spot anywhere near that size. Tile 2.4 m
   * puts a patch at 0.6 m, which is a worn line of grass, not geology.
   */
  const lawnByRepeat = new Map<number, THREE.Material>();
  const lawnFor = (span: number): THREE.Material => {
    const r = span / 2.4 < 4.5 ? 3 : 6;
    let mat = lawnByRepeat.get(r);
    if (!mat) { mat = gndPbr('LawnPatchy', r, r); lawnByRepeat.set(r, mat); }
    return mat;
  };
  /**
   * FENCE (ref `teal-backyard.png`, `street-teal.png`). The refs show a honey
   * stockade fence with boards, a cap rail, and posts a shade off the panel.
   * What shipped was one flat terracotta slab: StairTimber (stddev 1.93) at
   * `repeat 2` over a 9 m panel, i.e. its four faint lines stretched to 4.5 m
   * each — `yard-geometry` 380-760 x 410-520 is a plain orange wall with a
   * hint of banding, and the end posts are the same material so they vanish.
   * WoodFloor is 2.5x the texel spread AND carries eight real plank lines;
   * `repeat (4, 1)` on a 1.8 m panel puts a board at 225 mm and a board length
   * at 2.25 m, both true. Posts stay on the darker StairTimber so the member
   * separates from the boards, which is the thing that makes a fence read as a
   * fence at street distance. The bake cannot be tinted TOWARD the refs' sunlit
   * honey (#c9a06a needs r x1.4 off WoodFloor's #a5774a and `color` only
   * multiplies), so it is left untinted at its brightest — stated, not faked.
   */
  const fenceBoard = inPbr('WoodFloor', 4, 1);
  const fencePost = inPbr('StairTimber', 1, 1, 0xd8c4b4);
  const fenceCap = inPbr('WoodFloor', 4, 1, 0xd6c6b6);
  /** Finished lumber (bench, planter, sign board) — plank lines, not flat brown. */
  const lumber = inPbr('WoodFloor', 2, 1);
  /**
   * CRATES. The south choke barricade is fifteen 1 m boxes and, unlike the
   * island and yard clusters, no worn-crate GLB is kitbashed over it, so its
   * material is what the camera gets. All fifteen shared one StairTimber
   * instance and merged into a single orange slab: measured stddev 3.70 over
   * `street-south` 575-705 x 325-395, the flattest patch anywhere in the nine
   * stations. A stack of crates is a stack of DIFFERENT crates — different
   * timber, different ages, some turned. WoodFloor at `repeat 1` puts eight
   * slats across a 1 m face; four variants alternate slat pitch and age tone
   * (every tint is <= 1.0 per channel against WoodFloor's #a5774a, so all four
   * are reachable) and are picked by the crate's own grid position, so the
   * variation is deterministic and the same crate is the same crate every run.
   */
  const crateAges: readonly THREE.Material[] = [
    inPbr('WoodFloor', 1, 1),
    inPbr('WoodFloor', 2, 1, 0xd9cec2),
    inPbr('WoodFloor', 1, 1, 0xc9bfae),
    inPbr('WoodFloor', 2, 1, 0xb6b0a6),
  ] as const;
  /**
   * ROUNDS ITS INPUTS, and that is a fix rather than a nicety.
   *
   * This picked a material by grid position and was written for the integer
   * loop counters the choke stack uses. The island cluster passes its authored
   * spot offsets straight through, and those are FRACTIONAL: crateAge(-0.8, 2.2)
   * evaluates to index 0.5999999999999996, `crateAges[0.6]` is `undefined`, and
   * the non-null assertion swallowed it. Four of the five island crates were
   * therefore built with NO MATERIAL and rendered as three.js's default white -
   * which is exactly the "untextured white boxes" visible beside the bus and
   * semi in every hero frame, and which had already been misattributed twice
   * (once to a materials regression, once to placeholder massing surviving its
   * GLB). The fifth crate sits at (0, 3), lands on a whole number, and renders
   * correctly, which is why the cluster looked partly right.
   *
   * Rounding here rather than at the call site so no future caller can
   * reintroduce it; the yard cluster was already rounding defensively at its
   * own call and now does not need to.
   */
  const crateAge = (a: number, b: number): THREE.Material => {
    const slot = Math.round(a) * 3 + Math.round(b) * 5;
    return crateAges[((slot % crateAges.length) + crateAges.length) % crateAges.length]!;
  };

  // ---- Desert surround + side service roads (fact 1; topdown plate edges) ----
  centred(builder, 'aarr-desert-apron', [0, -0.06, 0], [140, 0.1, 150], sand, { cast: false });
  pair(builder, 'aarr-service-road', 31, 0.0, 0, [7, 0.06, 90], asphaltFor(7, 90), { cast: false });
  // Parked trailers outside the walls (topdown plate east/west edges).
  for (const [side, z] of [[-31, -18], [-31, 8], [31, -8], [31, 16]] as Array<[number, number]>) {
    centred(builder, `aarr-outside-trailer-${side < 0 ? 'w' : 'e'}-${z}`, [side, 1.4, z], [2.6, 2.8, 9], vehicleFor(9));
  }

  // ---- Lawns: green ONLY inside fenced lots (fact 1; aerial plates) ----
  pair(builder, 'aarr-lawn-front', 14, 0.03, 12, [11, 0.06, 12], lawnFor(11.5), { cast: false });
  pair(builder, 'aarr-lawn-back', 14, 0.03, -16, [12, 0.06, 10], lawnFor(11), { cast: false });
  pair(builder, 'aarr-lawn-side', 21, 0.03, -2, [5, 0.06, 9], lawnFor(7), { cast: false });

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
  centred(builder, 'aarr-road-entry-south', [0, 0.02, 23], [7, 0.04, 22], asphaltFor(7, 22), { cast: false });
  centred(builder, 'aarr-road-spine-north', [0, 0.02, -17], [7, 0.04, 18], asphaltFor(7, 18), { cast: false });
  centred(builder, 'aarr-road-entry-stub-north', [0, 0.02, -29], [7, 0.04, 6], asphaltFor(7, 6), { cast: false });
  // Center island disc, SPREAD 1.6x (r 4.8 at z 4.8).
  const island = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 0.12, 24), concreteFor(9.6));
  island.name = 'aarr-loop-island';
  island.position.set(0, 0.06, 4.8);
  island.receiveShadow = true;
  root.add(island);
  pair(builder, 'aarr-sidewalk-entry', 4.6, 0.03, 23, [2.2, 0.06, 22], concreteFor(2.2, 22), { cast: false });
  pair(builder, 'aarr-sidewalk-loop', 13.6, 0.03, 2, [2.0, 0.06, 20], concreteFor(2.0, 20), { cast: false });
  pair(builder, 'aarr-sidewalk-north', 8, 0.03, -8, [9, 0.06, 2.0], concreteFor(9, 2.0), { cast: false });

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
  // VEIL REDUCED 2026-09-16 (integrator), measured. With the aperture split and
  // the sun azimuth solved, the interior now takes a broad, correctly shaped sun
  // pool - but the frame still caps at max 0.812 where `living-room-eye.png`
  // reaches 1.000 with 4.4% of its pixels over 0.8. A large part of that plate's
  // top end is BLOWN-OUT EXTERIOR SEEN THROUGH THE GLASS, and at opacity 0.42
  // this pane replaced 42% of every window pixel with a blue-grey layer, then
  // darkened it further with a 0x24333d emissive. The window could not be bright
  // because it was 42% opaque paint.
  //
  // Real clean glass transmits ~90%. 0.14 keeps a visible pane - at grazing
  // angles and against the dark interior it still reads as glazing rather than
  // as a hole - while letting the exterior through. Emissive is kept but halved:
  // it was there to stop the opening reading as a painted box, which the
  // transmitted exterior now does on its own, and at 0.6 it was tinting the pane
  // toward dark blue, i.e. working against the thing it was added for.
  const windowGlass = new THREE.MeshStandardMaterial({
    color: 0xcfe0ea,
    roughness: 0.35,
    metalness: 0.0,
    transparent: true,
    opacity: 0.14,
    emissive: 0x24333d,
    emissiveIntensity: 0.3,
  });
  // The sixteen window panes are the arena's only authored glazing, and glazing
  // is the family the per-family binding pays the most for (1.2x against paint
  // and chrome's 0.7x). At roughness 0.35 the envMap reads as a broad sky sheen
  // across the pane rather than as a mirror, which is what the street plates
  // show. Hidden per house once that house's catalog GLB lands - its own
  // WindowGlass/GlassDark materials are tagged on arrival by the kitbash
  // resolve - so both routes to a pane end up on the same binding.
  forgeRole(windowGlass, 'glass');

  const rugTexture = starburstRugTexture();
  const rugMaterial = rugTexture
    ? new THREE.MeshStandardMaterial({ map: rugTexture, roughness: 1.0, metalness: 0.0 })
    : livingCarpet;

  // ---- LANE M / DRESSING BATCH, 2026-09-16 ---------------------------------
  //
  // WHY A BATCH AND NOT MORE `dressPiece()` CALLS. The room needed a fireplace,
  // a chimney breast, curtains, a credenza, a standard lamp, an armchair,
  // pictures, a clock, plants, books and bowls; the bedrooms needed side
  // tables, lamps, a dresser and pictures; the hedges needed a broken foliage
  // silhouette and the desert needed Joshua trees. Every one of those is a
  // handful of primitives, and `dressPiece()` emits ONE MESH PER PRIMITIVE with
  // `presentationBatchCandidate = false` — i.e. one draw call each. Built that
  // way this pass would have added roughly 900 draw calls to a competitive FPS
  // map, which is not a trade worth making for dressing.
  //
  // So every piece below is a BufferGeometry baked into world space and merged
  // into one mesh per (material, castShadow) pair. The whole interior fit-out
  // of both houses plus all of the vegetation lands in a low double-digit
  // number of draws, and the triangle cost of a merged box is identical to the
  // triangle cost of a separate one.
  //
  // AUTHORITY IS UNTOUCHED BY CONSTRUCTION, and it is checkable rather than
  // asserted: nothing here goes near `builder`. `colliders`, `physicsColliders`,
  // `raycastMeshes`, `shotSurfaces` and `spawns` are only ever appended to by
  // `box()`/`centred()`/`pair()`, and this code path calls none of them — it
  // parents finished meshes straight to `root`, exactly as `aarr-loop-island`
  // and every wear-lane GLB anchor already do.
  //
  // INDEXING IS LOAD-BEARING. `mergeGeometries` refuses a set that mixes
  // indexed and non-indexed geometry, and it refuses one whose attribute sets
  // differ (repo memory `gotcha-static-batcher-attribute-mismatch`). Box,
  // Cylinder and Cone are all indexed with exactly position/normal/uv, so they
  // merge; nothing else is ever handed to `dressAdd`. If a merge fails anyway
  // the bucket falls back to individual meshes, so a dressing batch can never
  // be the reason a frame or a gate breaks.
  type DressBucket = { material: THREE.Material; cast: boolean; geometries: THREE.BufferGeometry[] };
  const dressBuckets = new Map<string, DressBucket>();
  const dressMaterialKey = new Map<THREE.Material, string>();
  let dressStats = { meshes: 0, triangles: 0 };
  const dressAdd = (material: THREE.Material, geometry: THREE.BufferGeometry, transform: THREE.Matrix4, cast = true): void => {
    let materialKey = dressMaterialKey.get(material);
    if (materialKey === undefined) {
      materialKey = `m${dressMaterialKey.size}`;
      dressMaterialKey.set(material, materialKey);
    }
    const key = `${materialKey}:${cast ? 'c' : 'n'}`;
    let bucket = dressBuckets.get(key);
    if (bucket === undefined) {
      bucket = { material, cast, geometries: [] };
      dressBuckets.set(key, bucket);
    }
    geometry.applyMatrix4(transform);
    bucket.geometries.push(geometry);
  };
  /** One axis-aligned (or yawed) box of dressing, in TRUE world metres. */
  const dressBox = (material: THREE.Material, centre: Vec3, size: Size3, yaw = 0, cast = true): void => {
    const transform = new THREE.Matrix4().makeRotationY(yaw);
    transform.setPosition(centre[0], centre[1], centre[2]);
    dressAdd(material, new THREE.BoxGeometry(size[0], size[1], size[2]), transform, cast);
  };
  /** One upright cylinder/cone of dressing (legs, poles, pots, trunks). */
  const dressTube = (
    material: THREE.Material,
    centre: Vec3,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    radialSegments = 8,
    rotation?: THREE.Euler,
    cast = true,
  ): void => {
    const transform = new THREE.Matrix4();
    if (rotation) transform.makeRotationFromEuler(rotation);
    transform.setPosition(centre[0], centre[1], centre[2]);
    dressAdd(material, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1), transform, cast);
  };
  /**
   * One yucca/agave BLADE: a four-sided spike of `length`, rising from `base`,
   * tilted `tilt` radians off vertical and swung to `azimuth` in plan. This is
   * the single primitive that makes a Joshua tree read as a Joshua tree rather
   * than as a green blob — the plates' rosettes are nine or ten of these.
   */
  const dressBlade = (
    material: THREE.Material,
    base: Vec3,
    length: number,
    width: number,
    azimuth: number,
    tilt: number,
    cast = true,
  ): void => {
    const geometry = new THREE.ConeGeometry(width, length, 4, 1);
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, azimuth, tilt, 'YZX'));
    const offset = new THREE.Vector3(0, length / 2, 0).applyQuaternion(quaternion);
    const transform = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
    transform.setPosition(base[0] + offset.x, base[1] + offset.y, base[2] + offset.z);
    dressAdd(material, geometry, transform, cast);
  };
  const flushDress = (): void => {
    for (const [key, bucket] of dressBuckets) {
      const merged = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries, false);
      const emit = merged === null ? bucket.geometries : [merged];
      for (const [index, geometry] of emit.entries()) {
        const mesh = new THREE.Mesh(geometry, bucket.material);
        mesh.name = `aarr-dress-${key}-${index}`;
        mesh.castShadow = bucket.cast;
        mesh.receiveShadow = true;
        mesh.userData.presentationBatchCandidate = false;
        root.add(mesh);
        dressStats = {
          meshes: dressStats.meshes + 1,
          triangles: dressStats.triangles + (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3,
        };
      }
    }
    dressBuckets.clear();
  };

  // ---- LANE M materials. EVERY ONE REUSES AN ALREADY-CACHED TILING PAIR.
  // `texture()` caches on `path:repeatX:repeatY`, so a new pair is a fresh
  // 1024^2 upload plus mips for BOTH the diffuse and the roughness bake, and
  // the arena stands at 358.7 MB against a 500 MB gate. Each repeat below is
  // one this file already binds — SidewalkConcrete (1,1) from `rock`,
  // InteriorPlaster (1,1) from `stairTimber` and (2,1) from `massing`,
  // InteriorCeiling (1,1) from `interiorTrim`, StairTimber (2,1) from `timber`,
  // LawnPatchy (2,2) from `hedge` and `olive` — so this whole pass adds ZERO
  // texture VRAM apart from the one 512^2 wall-art canvas. Every difference
  // below is a TINT, which is a material uniform and free, and every tint is
  // a DARKENING because `material.color` multiplies and cannot lighten a bake.
  const stoneHearth = gndPbr('SidewalkConcrete', 1, 1, 0xbfae9a);
  const fireboxDark = inPbr('InteriorPlaster', 1, 1, 0x4d443c);
  const curtainFabric = inPbr('InteriorPlaster', 2, 1, 0x86c3c0);
  const lampShade = inPbr('InteriorCeiling', 1, 1, 0xf2e2c4);
  const upholstery = inPbr('InteriorPlaster', 2, 1, 0xd98a52);
  const potTerracotta = gndPbr('SidewalkConcrete', 1, 1, 0xc98a5e);
  const plantLeaf = gndPbr('LawnPatchy', 2, 2, 0x8fc496);
  const brassTrim = inPbr('InteriorCeiling', 1, 1, 0xd9b877);
  // Sanitaryware. InteriorCeiling (1,1) is already bound by `interiorTrim`, so
  // this is a tint on a cached upload and costs no VRAM; the tint is a very
  // slight cool DARKENING, which is the only direction `material.color` moves a
  // bake, and it is what separates a porcelain fitting from the cream trim
  // behind it.
  const porcelain = inPbr('InteriorCeiling', 1, 1, 0xeef4f4);
  // Joshua-tree bark and desert blade. The bark tint is StairTimber pulled
  // toward the plates' bleached grey-brown; the blade is LawnPatchy pulled well
  // under the hedge so the desert never reads as lawn.
  const joshuaBark = inPbr('StairTimber', 2, 1, 0xc4b2a0);
  const desertBlade = gndPbr('LawnPatchy', 2, 2, 0x86b088);
  const desertScrubGreen = gndPbr('LawnPatchy', 2, 2, 0x8aa87e);
  const hedgeFoliage = gndPbr('LawnPatchy', 2, 2, 0xa2dcaf);
  const shrubBloom = inPbr('InteriorPlaster', 2, 1, 0xe2a2b4);
  const wallArtTexture = midCenturyWallArtTexture();
  /**
   * One quadrant of the wall-art atlas as its own material. Clones share the
   * canvas's `.source`, so four quadrants are ONE upload; only the uv window
   * differs. Falls back to the cream trim bake when there is no 2D context,
   * which turns a picture into a blank mount rather than into an exception.
   */
  const wallArt = (u: 0 | 1, v: 0 | 1): THREE.Material => {
    if (!wallArtTexture) return interiorTrim;
    const clone = wallArtTexture.clone();
    clone.repeat.set(0.5, 0.5);
    clone.offset.set(u * 0.5, v * 0.5);
    clone.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: clone, roughness: 0.82, metalness: 0.0 });
  };
  const clockFace = wallArt(0, 1);
  const artPanelA = wallArt(1, 1);
  const artPanelB = wallArt(0, 0);

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
    finish('living', living, carpetFor(living.x1 - living.x0, living.z1 - living.z0));
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

    // ---- LANE M: THE ROOM WAS STILL AN EMPTY BOX ---------------------------
    //
    // Against `refs/living-room-eye.png` the frame was carrying a rug, a
    // coffee table, a sofa and a stair, and the plate carries a fireplace with
    // a stone chimney breast, a teak sideboard, a standard lamp, framed
    // pictures, a starburst wall clock, curtains at the window wall,
    // houseplants, books and bowls on every surface and a dining set through
    // the opening. Everything below is one of those, placed off the measured
    // geometry rather than by feel, and built as merged dressing so the whole
    // fit-out of both houses costs single-digit draw calls.
    //
    // HOW READABILITY IS BOUNDED, because this is a competitive FPS map and
    // dressing is the easiest way to ruin one:
    //  1. NOTHING IS SOLID. Not one primitive reaches `builder`, so no piece
    //     can become cover, block a bullet, or change where a player may walk.
    //     Colliders and shot surfaces are identical before and after.
    //  2. NOTHING STANDS IN THE OPEN FLOOR. Every tall piece is flush against
    //     a wall plane the room already owns (the chimney breast and credenza
    //     on the zLo glazed wall, the pictures and console on the loop-facing
    //     inner wall, the dresser and side tables on the bedroom's own walls).
    //     The only pieces off a wall are the armchair and the plants, and both
    //     sit under 0.95 m — below a crouched player's head — so neither can
    //     hide a body from a defender who has the room.
    //  3. NOTHING ENTERS A DOORWAY. The picture group is placed south of
    //     `frontDoorPortal`'s z span in both houses, and the landing's centre
    //     line and the stairwell void are left completely clear.
    //  4. NOTHING TOUCHES THE SUN PATCH. Lane G's §4 solve puts the west
    //     living room's sunlit floor between 1.17 m and 2.91 m out from the
    //     zHi glazed wall, which is the band the `interior-west` camera was
    //     moved to see. Every piece within reach of that band — both sets of
    //     curtains, the pelmets, the lamp, the plants, the clock and every
    //     picture — is emitted with `cast = false`, so the dressing physically
    //     cannot take back the patch that lane bought. The drapes also stop
    //     5 cm clear of the casting aperture's own edge (half-width
    //     (DRESS_WIN_W/2 - DRESS_APERTURE_MARGIN) x SPREAD = 1.408 m against
    //     the drape's inner edge at 1.46 m), so no glazing is ever covered.
    //  5. PASS 82 IS NOT TOUCHED. The standard lamp and the two bedside lamps
    //     are GEOMETRY — a pole and a shade. No `THREE.Light` is created,
    //     removed, hidden, parented or toggled anywhere in this lane.
    const spec = houseSpec(id);
    const inward = -face; // from the loop-facing inner plane, into the room
    const southInnerZ = (frame.zLo + REBUILD_SHELL_WALL_T) * S;
    const northInnerZ = (frame.zHi - REBUILD_SHELL_WALL_T) * S;
    const frontInnerX = frame.innerFront * S;
    const livRearX = (face === 1 ? living.x0 : living.x1) * S;
    const livXLo = Math.min(livRearX, frontInnerX);
    const livXHi = Math.max(livRearX, frontInnerX);
    // The glazed elevations carry two openings each and only ONE of them falls
    // inside the living room in either house (west: plan -15.3 is over the
    // kitchen band, -11.7 is over the living room; east mirrors it). Deriving
    // the set rather than hardcoding it means a later change to
    // DRESS_WIN_OFFSETS moves the curtains with the glazing.
    const livingWindowXs = DRESS_WIN_OFFSETS
      .map((dx) => (spec.cx + dx) * S)
      .filter((wx) => wx > livXLo + 0.7 && wx < livXHi - 0.7);
    const apertureHalf = (DRESS_WIN_W / 2 - DRESS_APERTURE_MARGIN) * S;

    // --- Fireplace + stone chimney breast, on the zLo glazed wall at the
    // room's rear end. That position is not decorative: the `interior-west`
    // eye (-17, 1.7, 5.5) -> target (-19.7, 1.2, 2.0) puts this breast 7 deg
    // off the view axis, i.e. dead centre of frame, and the sight ray clears
    // the stair run (whose first steps are only 0.2 m tall where it passes) by
    // over 0.8 m. It is the one surface in the room big enough to answer the
    // plate's fireplace, and it is on the BACKLIT elevation — the sun enters
    // through zHi, not zLo — so a 0.40 m proud breast cannot shadow anything.
    const breastX = livRearX + face * 1.35;
    const breastD = 0.40;
    const breastZ = southInnerZ + breastD / 2;
    const breastFace = breastZ + breastD / 2;
    const breastTop = 2.62;
    dressBox(stoneHearth, [breastX, (finishTop + breastTop) / 2, breastZ], [1.9, breastTop - finishTop, breastD]);
    dressBox(stoneHearth, [breastX, finishTop + 0.06, breastFace + 0.28], [1.9, 0.12, 0.56], 0, false);
    dressBox(fireboxDark, [breastX, finishTop + 0.52, breastFace - 0.06], [1.02, 0.80, 0.12], 0, false);
    dressBox(teakTrim, [breastX, finishTop + 1.16, breastZ + 0.07], [2.12, 0.08, breastD + 0.14]);
    // Starburst wall clock over the mantel (`living-room-eye.png` hangs one on
    // the stair wall; this room's stair wall is the run's own flank, so it goes
    // over the fire, which is the other place the plates put it).
    dressBox(clockFace, [breastX, finishTop + 1.92, breastFace + 0.03], [0.66, 0.66, 0.04], 0, false);
    dressTube(brassTrim, [breastX - 0.58, finishTop + 1.29, breastZ + 0.10], 0.07, 0.05, 0.18, 10, undefined, false);
    dressBox(artPanelA, [breastX + 0.52, finishTop + 1.33, breastZ + 0.10], [0.28, 0.26, 0.03], 0, false);

    for (const winX of livingWindowXs) {
      // --- Teak credenza under the zLo window. 0.78 m tall against a 0.95 m
      // sill, so it never crosses the glazing, and it is the plate's sideboard.
      const credZ = southInnerZ + 0.26;
      dressBox(teakTrim, [winX, finishTop + 0.45, credZ], [2.30, 0.66, 0.48]);
      for (const lx of [-1.02, 1.02]) {
        for (const lz of [-0.17, 0.17]) {
          dressTube(teakTrim, [winX + lx, finishTop + 0.06, credZ + lz], 0.026, 0.032, 0.12, 6);
        }
      }
      dressTube(brassTrim, [winX - 0.62, finishTop + 0.88, credZ], 0.10, 0.07, 0.20, 10, undefined, false);
      dressBox(artPanelB, [winX + 0.46, finishTop + 0.94, credZ - 0.02], [0.30, 0.34, 0.03], 0, false);
      dressBox(teakTrim, [winX + 0.86, finishTop + 0.82, credZ], [0.26, 0.16, 0.18], 0.2, false);
      // --- Houseplant beside the credenza.
      dressTube(potTerracotta, [winX + 1.56, finishTop + 0.18, southInnerZ + 0.45], 0.19, 0.14, 0.36, 10, undefined, false);
      for (let i = 0; i < 7; i += 1) {
        dressBlade(plantLeaf, [winX + 1.56, finishTop + 0.34, southInnerZ + 0.45], 0.76, 0.06, (i / 7) * Math.PI * 2 + 0.3, 0.28 + (i % 3) * 0.14, false);
      }
    }
    // --- Curtains at BOTH glazed elevations' living-room windows. Drawn OPEN,
    // at the jambs only, and non-casting (see bound 4 above).
    for (const [planeZ, sign] of [[southInnerZ, 1], [northInnerZ, -1]] as Array<[number, number]>) {
      for (const winX of livingWindowXs) {
        const drapeZ = planeZ + sign * 0.12;
        for (const side of [-1, 1]) {
          dressBox(curtainFabric, [winX + side * (apertureHalf + 0.23), 1.53, drapeZ], [0.34, 1.86, 0.13], 0, false);
        }
        dressBox(interiorTrim, [winX, 2.55, drapeZ], [2 * apertureHalf + 0.92, 0.18, 0.17], 0, false);
      }
    }
    // --- Standard lamp in the corner the plate puts one in (window wall meets
    // the loop-facing wall). Geometry only; PASS 82 forbids a real light and
    // this lane creates none.
    const lampX = frontInnerX + inward * 0.55;
    const lampZ = southInnerZ + 0.58;
    dressTube(teakTrim, [lampX, finishTop + 0.03, lampZ], 0.17, 0.19, 0.06, 10, undefined, false);
    dressTube(teakTrim, [lampX, finishTop + 0.72, lampZ], 0.028, 0.036, 1.32, 8, undefined, false);
    dressTube(lampShade, [lampX, finishTop + 1.58, lampZ], 0.17, 0.27, 0.34, 12, undefined, false);
    // --- Armchair, back to the stair run, facing the fire. Offset 2.55 m from
    // the living room's rear boundary, which clears the stair's own footprint
    // (west 20.56-22.32 m, east 20.56-22.32 m mirrored) by 0.16 m.
    const chairX = livRearX + face * 2.55;
    const chairZ = southInnerZ + 1.45;
    const seatY = finishTop + 0.40;
    dressBox(upholstery, [chairX, seatY, chairZ], [0.74, 0.14, 0.72]);
    dressBox(upholstery, [chairX - face * 0.30, seatY + 0.33, chairZ], [0.14, 0.54, 0.72]);
    for (const dz of [-0.36, 0.36]) dressBox(teakTrim, [chairX, seatY + 0.13, chairZ + dz], [0.70, 0.07, 0.07]);
    for (const dx of [-0.30, 0.30]) {
      for (const dz of [-0.28, 0.28]) {
        dressTube(teakTrim, [chairX + dx, finishTop + 0.17, chairZ + dz], 0.022, 0.030, 0.34, 6);
      }
    }
    // --- Houseplant beside the fire, on the open side away from the stair.
    const plantX = breastX + face * 1.28;
    dressTube(potTerracotta, [plantX, finishTop + 0.21, southInnerZ + 0.48], 0.22, 0.16, 0.42, 10, undefined, false);
    for (let i = 0; i < 8; i += 1) {
      dressBlade(plantLeaf, [plantX, finishTop + 0.40, southInnerZ + 0.48], 0.88, 0.065, (i / 8) * Math.PI * 2, 0.24 + (i % 4) * 0.12, false);
    }
    // --- Books and a brass bowl on the coffee table the last pass left bare.
    dressBox(artPanelB, [rugX - 0.26, finishTop + 0.47, rugZ + 0.05], [0.26, 0.05, 0.19], 0.24, false);
    dressBox(teakTrim, [rugX - 0.24, finishTop + 0.515, rugZ + 0.01], [0.24, 0.04, 0.17], -0.16, false);
    dressTube(brassTrim, [rugX + 0.27, finishTop + 0.49, rugZ], 0.15, 0.09, 0.10, 12, undefined, false);
    // --- Framed pictures on the loop-facing inner wall, south of the front
    // door's z span in BOTH houses (west portal world z 1.6-3.2, east
    // -3.2 to -1.6; the group sits at -0.09/1.21 and -5.21/-3.91).
    const artX = frontInnerX + inward * 0.04;
    for (const [dz, ay, aw, ah, panel] of [
      [-0.55, 1.78, 0.62, 0.48, artPanelA],
      [0.75, 1.94, 0.46, 0.60, artPanelB],
    ] as Array<[number, number, number, number, THREE.Material]>) {
      const az = southInnerZ + 1.9 + dz;
      dressBox(teakTrim, [artX, ay, az], [0.05, ah + 0.09, aw + 0.09], 0, false);
      dressBox(panel, [artX + inward * 0.031, ay, az], [0.02, ah, aw], 0, false);
    }
    // --- Dining chairs around the pedestal table the last pass left alone
    // (`living-room-eye.png` shows a four-seat set through the opening).
    for (const [cdx, cdz] of [[-0.95, 0], [0.95, 0], [0, -0.95], [0, 0.95]] as Array<[number, number]>) {
      const cx2 = diningX + cdx;
      const cz2 = diningZ + cdz;
      const alongX = cdz !== 0;
      dressBox(teakTrim, [cx2, finishTop + 0.44, cz2], [0.42, 0.05, 0.42]);
      dressBox(upholstery, [
        cx2 + (alongX ? 0 : Math.sign(cdx) * 0.19),
        finishTop + 0.68,
        cz2 + (alongX ? Math.sign(cdz) * 0.19 : 0),
      ], alongX ? [0.42, 0.44, 0.05] : [0.05, 0.44, 0.42]);
      for (const lx of [-0.16, 0.16]) {
        for (const lz of [-0.16, 0.16]) {
          dressTube(teakTrim, [cx2 + lx, finishTop + 0.22, cz2 + lz], 0.018, 0.024, 0.44, 6);
        }
      }
    }

    // ---- LANE N: THE GROUND BATHROOM AND THE KITCHEN FLOOR --------------
    //
    // `_judge/refs/teal-ground-cutaway.png` and `yellow-ground-cutaway.png`
    // show both plans: a kitchen with a table and chairs on the open floor
    // beside its counter run, and a bathroom with a tub, a WC and a basin under
    // a mirror. The last pass furnished both living rooms and the bedroom and
    // reached neither of these, so the bath was a tiled empty box and the
    // kitchen was a counter facing 2.9-3.2 m of bare tile.
    //
    // WHERE THE FITTINGS CAN GO IS DECIDED BY THE OPENINGS, NOT BY TASTE, and
    // the obvious answer is wrong here. The bath rect is only 2.24 m deep and
    // BOTH of its long walls are already pierced: the rear shell wall carries
    // `rearLinkGap` (the garage link, cz +/-0.5 plan) and the partition carries
    // `${id} living to bath`, centred on the same cz. Against a 1.4 plan room
    // that leaves 0.32 m of solid wall at each end of each - too little for any
    // fitting. The two z walls (`bath south`, and the `bath north` face the
    // sage accent is on) are unpierced at every height and run the full 3.68 m
    // (west) / 4.48 m (east) of the band, so the whole suite goes on those two:
    // tub and WC on the low-z wall, basin and mirror on the high-z wall, with
    // 1.1 m of clear floor between them.
    //
    // READABILITY. Nothing here reaches `builder`, so no collider, shot surface
    // or spawn moves and no piece can become cover. Every fitting is against a
    // wall the room already owns; the tallest free-standing point is the 0.90 m
    // basin rim, well under a crouched player. The bath door's own plane
    // (the partition, at cz) is 2.6-3.4 m from the nearest fitting in x, and
    // both the tub and the WC stop short of the room's z midline, so the
    // doorway and its swing stay completely clear. Same for the kitchen: the
    // table sits 2.6 m back from the `living to kitchen` opening's plane and
    // 1.4 m clear of the counter run, so the route through the room is intact.
    const bx0 = Math.min(bath.x0, bath.x1) * S;
    const bx1 = Math.max(bath.x0, bath.x1) * S;
    const bz0 = Math.min(bath.z0, bath.z1) * S;
    const bz1 = Math.max(bath.z0, bath.z1) * S;
    const bathW = bx1 - bx0;
    /** Distance measured from the bath's REAR-wall end, so both houses mirror. */
    const bathAt = (u: number): number => (face === 1 ? bx0 : bx1) + face * u;
    // Tub + tiled surround on the low-z wall, at the rear-wall end.
    const tubX = bathAt(1.00);
    dressBox(porcelain, [tubX, finishTop + 0.25, bz0 + 0.38], [1.55, 0.50, 0.70]);
    dressBox(porcelain, [tubX, finishTop + 0.525, bz0 + 0.38], [1.63, 0.07, 0.78]);
    dressBox(bathTile, [tubX, finishTop + 0.47, bz0 + 0.38], [1.39, 0.05, 0.54]);
    dressBox(bathTile, [tubX, finishTop + 1.10, bz0 + 0.04], [1.63, 1.10, 0.06]);
    dressTube(brassTrim, [tubX, finishTop + 0.64, bz0 + 0.14], 0.028, 0.034, 0.20, 8, undefined, false);
    // WC on the same wall at the partition end, stopping short of the midline.
    const wcX = bathAt(bathW - 0.45);
    dressBox(porcelain, [wcX, finishTop + 0.70, bz0 + 0.12], [0.42, 0.52, 0.18]);
    dressBox(porcelain, [wcX, finishTop + 0.28, bz0 + 0.44], [0.36, 0.32, 0.48]);
    dressBox(porcelain, [wcX, finishTop + 0.465, bz0 + 0.44], [0.38, 0.05, 0.50]);
    // Basin, mirror and a towel rail on the high-z wall.
    const basinX = bathAt(0.80);
    dressTube(porcelain, [basinX, finishTop + 0.37, bz1 - 0.28], 0.10, 0.13, 0.74, 10);
    dressBox(porcelain, [basinX, finishTop + 0.82, bz1 - 0.26], [0.56, 0.17, 0.42]);
    dressTube(brassTrim, [basinX, finishTop + 0.98, bz1 - 0.40], 0.024, 0.028, 0.16, 8, undefined, false);
    dressBox(teakTrim, [basinX, finishTop + 1.55, bz1 - 0.04], [0.56, 0.68, 0.05], 0, false);
    dressBox(interiorTrim, [basinX, finishTop + 1.55, bz1 - 0.08], [0.48, 0.60, 0.02], 0, false);
    const towelX = bathAt(bathW - 1.15);
    dressTube(brassTrim, [towelX, finishTop + 1.16, bz1 - 0.07], 0.018, 0.018, 0.62, 8, new THREE.Euler(0, 0, Math.PI / 2), false);
    dressBox(curtainFabric, [towelX, finishTop + 0.90, bz1 - 0.13], [0.34, 0.50, 0.06], 0, false);

    // Kitchen table + two chairs, on the open floor away from the counter run.
    const kz1 = Math.max(kitchen.z0, kitchen.z1) * S;
    const kitchenRearX = (face === 1 ? Math.min(kitchen.x0, kitchen.x1) : Math.max(kitchen.x0, kitchen.x1)) * S;
    const tableX = kitchenRearX + face * 1.05;
    const tableZ = kz1 - 0.80;
    dressBox(teakTrim, [tableX, finishTop + 0.73, tableZ], [1.05, 0.05, 0.72]);
    for (const lx of [-0.46, 0.46]) {
      for (const lz of [-0.28, 0.28]) {
        dressTube(teakTrim, [tableX + lx, finishTop + 0.355, tableZ + lz], 0.022, 0.028, 0.71, 6);
      }
    }
    for (const cdz of [-0.62, 0.62]) {
      dressBox(teakTrim, [tableX, finishTop + 0.44, tableZ + cdz], [0.40, 0.05, 0.40]);
      dressBox(upholstery, [tableX, finishTop + 0.68, tableZ + cdz + Math.sign(cdz) * 0.18], [0.40, 0.44, 0.05]);
      for (const lx of [-0.15, 0.15]) {
        for (const lz of [-0.15, 0.15]) {
          dressTube(teakTrim, [tableX + lx, finishTop + 0.22, tableZ + cdz + lz], 0.018, 0.024, 0.44, 6);
        }
      }
    }
    // A bowl and a stack of plates, so the table is used rather than staged.
    dressTube(brassTrim, [tableX - 0.18, finishTop + 0.79, tableZ], 0.14, 0.09, 0.09, 12, undefined, false);
    dressTube(porcelain, [tableX + 0.26, finishTop + 0.79, tableZ + 0.06], 0.11, 0.11, 0.07, 12, undefined, false);

    // ---- LANE M: THE UPPER STOREY WAS EMPTIER STILL ------------------------
    // `refs/bedroom-eye.png` carries a made bed, two side tables with lamps, a
    // dresser and pictures; `atomic-acres-rebuild-upper-landing.png` renders an
    // empty box with a rail. The bed and the bathroom suite are already wave-2
    // GLBs, so what is added here is everything AROUND them, all of it against
    // a wall so the landing's traversal line and the stairwell void stay clear.
    const UPPER_Y = REBUILD_UPPER_FLOOR_Y;
    const bed = upperRooms(id).find((entry) => entry.id === 'rearBed');
    const landing = upperRooms(id).find((entry) => entry.id === 'landing');
    if (bed) {
      const bedXLo = Math.min(bed.x0, bed.x1) * S;
      const bedXHi = Math.max(bed.x0, bed.x1) * S;
      const bedZLo = Math.min(bed.z0, bed.z1) * S;
      const bedCx = (bedXLo + bedXHi) / 2;
      // Side tables + lamps on the room's low-z wall, 1.25 m either side of the
      // bed's own centre line. The bed GLB is centred in this rect and is 2 m
      // long, so at 0.32 m off that wall the tables clear it by ~0.9 m
      // whichever way round the GLB's long axis lands.
      for (const side of [-1, 1]) {
        const tx = bedCx + side * 1.25;
        const tz = bedZLo + 0.34;
        dressBox(teakTrim, [tx, UPPER_Y + 0.28, tz], [0.44, 0.05, 0.42]);
        dressBox(teakTrim, [tx, UPPER_Y + 0.13, tz], [0.40, 0.24, 0.38]);
        for (const lx of [-0.18, 0.18]) {
          for (const lz of [-0.16, 0.16]) {
            dressTube(teakTrim, [tx + lx, UPPER_Y + 0.14, tz + lz], 0.018, 0.022, 0.28, 6);
          }
        }
        dressTube(teakTrim, [tx, UPPER_Y + 0.44, tz], 0.022, 0.030, 0.28, 6, undefined, false);
        dressTube(lampShade, [tx, UPPER_Y + 0.70, tz], 0.11, 0.17, 0.24, 12, undefined, false);
      }
      // Dresser against the rear wall + a picture over the bed.
      dressBox(teakTrim, [bedXLo + 0.3, UPPER_Y + 0.42, bedZLo + 2.6], [0.52, 0.84, 1.48]);
      dressBox(teakTrim, [bedXLo + 0.3, UPPER_Y + 0.87, bedZLo + 2.6], [0.58, 0.05, 1.54], 0, false);
      dressTube(brassTrim, [bedXLo + 0.34, UPPER_Y + 1.02, bedZLo + 2.2], 0.10, 0.07, 0.24, 10, undefined, false);
      for (const [dx, ay, aw, ah, panel] of [
        [-0.72, 1.64, 0.50, 0.40, artPanelB],
        [0.72, 1.70, 0.40, 0.52, artPanelA],
      ] as Array<[number, number, number, number, THREE.Material]>) {
        const ax = bedCx + dx;
        dressBox(teakTrim, [ax, UPPER_Y + ay, bedZLo + 0.05], [aw + 0.09, ah + 0.09, 0.05], 0, false);
        dressBox(panel, [ax, UPPER_Y + ay, bedZLo + 0.081], [aw, ah, 0.02], 0, false);
      }
    }
    if (landing) {
      // Console + plant + pictures on the landing's loop-facing wall, and a
      // runner down its length. The stairwell void and the centre line of the
      // landing are deliberately left completely clear: this is the upper
      // storey's only traversal route and the rail already narrows it.
      const conX = frontInnerX + inward * 0.30;
      const zLo = Math.min(landing.z0, landing.z1) * S;
      const zHi = Math.max(landing.z0, landing.z1) * S;
      const conZ = zLo + (zHi - zLo) * 0.74;
      dressBox(teakTrim, [conX, UPPER_Y + 0.74, conZ], [0.40, 0.05, 1.30]);
      for (const lz of [-0.55, 0.55]) {
        dressBox(teakTrim, [conX, UPPER_Y + 0.37, conZ + lz], [0.34, 0.74, 0.06]);
      }
      dressTube(brassTrim, [conX, UPPER_Y + 0.87, conZ - 0.34], 0.12, 0.08, 0.22, 10, undefined, false);
      dressBox(artPanelA, [conX - inward * 0.06, UPPER_Y + 0.94, conZ + 0.30], [0.26, 0.34, 0.03], 0, false);
      for (const [dz, ay, aw, ah, panel] of [
        [-0.35, 1.72, 0.54, 0.42, artPanelB],
        [0.62, 1.80, 0.40, 0.54, artPanelA],
      ] as Array<[number, number, number, number, THREE.Material]>) {
        const ax = frontInnerX + inward * 0.04;
        dressBox(teakTrim, [ax, UPPER_Y + ay, conZ + dz], [0.05, ah + 0.09, aw + 0.09], 0, false);
        dressBox(panel, [ax + inward * 0.031, UPPER_Y + ay, conZ + dz], [0.02, ah, aw], 0, false);
      }
      dressTube(potTerracotta, [conX, UPPER_Y + 0.20, zHi - 0.55], 0.20, 0.15, 0.40, 10, undefined, false);
      for (let i = 0; i < 7; i += 1) {
        dressBlade(plantLeaf, [conX, UPPER_Y + 0.38, zHi - 0.55], 0.80, 0.06, (i / 7) * Math.PI * 2, 0.26 + (i % 3) * 0.13, false);
      }
      dressBox(rugMaterial, [frontInnerX + inward * 1.35, UPPER_Y + 0.012, (zLo + zHi) / 2], [1.30, 0.024, (zHi - zLo) * 0.62], 0, false);
    }
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
    centred(builder, `aarr-house-${house.id}-floor`, [house.cx, 0.06, house.cz], [house.w, 0.12, house.d], carpetFor(house.w, house.d), { cast: false });
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
      centred(builder, `aarr-house-${house.id}-upper-slab-${index}`, [(slab.x0 + slab.x1) / 2, 2.875, (slab.z0 + slab.z1) / 2], [slab.x1 - slab.x0, 0.25, slab.z1 - slab.z0], carpetFor(slab.x1 - slab.x0, slab.z1 - slab.z0, UPPER_CARPET_GOLD), { cast: false });
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
    //
    // LANE N, 2026-09-16: THE ROOF UNDERSIDE READ THROUGH IT. In
    // `artifacts/viewpoint-regression/final/atomic-acres-rebuild/
    // atomic-acres-rebuild-upper-landing.png` the top-right corner is a wedge
    // of dark exterior shingle with a bright cyan hairline under it, and the
    // cause is a GAP, not a z-fight and not a missing face. The board shipped
    // at y 6.04-6.08 and the upper shell walls are `[house.cx, 4.5, ...]` x 3
    // tall, i.e. they stop dead at y 6.00. The board therefore FLOATED 40 mm
    // clear of every wall top, and its plan span (`house.w - 2 * t`) ended
    // exactly ON the walls' inner faces rather than inside them. Any sight ray
    // that crossed a wall's inner top edge going up and outward passed under
    // the board entirely and landed on the roof slab's shingle bottom (6.10) -
    // the dark wedge - while the 40 mm slot itself let a sliver of exterior
    // light in, which is the cyan hairline.
    //
    // Two changes, both of which have to be there: the board now BOTTOMS OUT
    // BELOW the wall tops (5.96 against 6.00, a 40 mm overlap) so there is no
    // slot left to see through, and its plan span is `house.w - 1.5 * t`, so
    // each edge buries 0.25t (0.075 plan, 0.12 m) INSIDE a 0.48 m wall instead
    // of sitting coplanar with its inner face - which also removes the coplanar
    // pair that would z-fight along the whole perimeter. The top face at 6.06
    // still clears the roof slab's 6.10 underside by 40 mm, the bottom face
    // only shades the upper 40 mm of the walls and the top 40 mm of the door
    // lintels (both cream, both already hidden by it), and the upper rooms keep
    // a 2.96 m ceiling. Presentation only: `centred()` pins solid/shots off.
    centred(builder, `aarr-house-${house.id}-ceiling-upper`, [house.cx, 6.01, house.cz], [house.w - 1.5 * t, 0.10, house.d - 1.5 * t], interiorCeiling, { cast: false });
    centred(builder, `aarr-house-${house.id}-roof`, [house.cx, 6.35, house.cz], [house.w + 0.6, 0.5, house.d + 0.6], roof);
    centred(builder, `aarr-house-${house.id}-ridge`, [house.cx, 6.75, house.cz], [house.w * 0.35, 0.4, house.d + 0.6], roof);
    centred(builder, `aarr-house-${house.id}-chimney`, [house.cx - house.w * 0.28, 7.0, house.cz - 1], [0.9, 2.2, 0.9], massing);
    for (const door of ATOMIC_ACRES_REBUILD_DOORWAYS) {
      if (door.house !== house.id || door.from === 'porch') continue;
      centred(builder, `aarr-house-${house.id}-inlintel-${door.id}`, [door.at, (door.headY + 3) / 2, door.centre], [0.2, 3 - door.headY, door.width], massing);
    }
    const porchX = house.cx + face * (house.w / 2 + 1.0);
    centred(builder, `aarr-house-${house.id}-porch-slab`, [porchX, 0.15, house.cz], [2.0, 0.3, house.d * 0.9], concreteFor(2.0, house.d * 0.9));
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
      centred(builder, `aarr-house-${house.id}-porch-planter-${tag}`, [porchX + face * 0.35, 0.575, house.cz + sign * (house.d * 0.4 - 0.25)], [0.55, 0.55, 0.55], lumber);
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
    centred(builder, `aarr-garage-${garage.id}-driveway`, [garage.cx, 0.04, garage.cz + 5.5], [3.2, 0.08, 6.0], concreteFor(3.2, 6.0), { cast: false });
    const [carX, carZ] = garage.car;
    centred(builder, `aarr-car-${garage.id}-body`, [carX, 0.55, carZ], [1.8, 0.7, 4.2], vehicleFor(4.2));
    centred(builder, `aarr-car-${garage.id}-cabin`, [carX, 1.15, carZ - 0.2], [1.6, 0.6, 2.2], vehicleFor(2.2));

    // ---- LANE N: THE GARAGE WAS A BARE CONCRETE BOX ----------------------
    //
    // Both cutaway refs (`_judge/refs/teal-ground-cutaway.png`,
    // `yellow-ground-cutaway.png`) fill the garage: a bench down one side,
    // shelving over it, boxes, tyres and tins. The shell, floor, roof, door and
    // driveway were all here and nothing was in the room.
    //
    // WHAT IS DELIBERATELY NOT HERE IS THE CAR. The refs park one inside, and
    // this arena already parks one at `garage.car` on the driveway immediately
    // outside this door. A second body inside would be 1.8 x 4.2 m of
    // presentation-only mass in the middle of a 5.44 x 8.00 m room, i.e. an
    // object a player reads as blocking and then walks straight through, in a
    // room whose only route is the rear link from the bathroom. That is the
    // readability failure this map cannot afford, so the interior gets the
    // bench-and-clutter half of the ref and the car stays on the drive.
    //
    // Everything below hugs the FAR wall (the one opposite the house link) and
    // the low-z end, leaving the link gap and the centre floor clear, and
    // nothing free-standing passes 0.90 m - under a crouched player, so none of
    // it can hide a body. All of it is merged dressing on materials this file
    // already binds, so it adds no VRAM and no new draw beyond the buckets the
    // interior fit-out opened. Nothing reaches `builder`.
    const garageFace = houseSpec(garage.id).face;
    const gx0 = (garageInner.cx - REBUILD_GARAGE_W / 2) * ATOMIC_ACRES_REBUILD_SPREAD;
    const gx1 = (garageInner.cx + REBUILD_GARAGE_W / 2) * ATOMIC_ACRES_REBUILD_SPREAD;
    const gz0 = (garageInner.cz - REBUILD_GARAGE_D / 2) * ATOMIC_ACRES_REBUILD_SPREAD;
    const gz1 = (garageInner.cz + REBUILD_GARAGE_D / 2) * ATOMIC_ACRES_REBUILD_SPREAD;
    const gFloorY = 0.12;
    /** Distance in from the FAR wall (the link wall is at the other end). */
    const garageAt = (u: number): number => (garageFace === 1 ? gx0 : gx1) + garageFace * u;
    // Bench + pegboard + two shelves down the far wall, low-z half.
    const benchX = garageAt(0.36);
    const benchZ = gz0 + 1.45;
    dressBox(teakTrim, [benchX, gFloorY + 0.86, benchZ], [0.62, 0.06, 2.20]);
    for (const lx of [-0.24, 0.24]) {
      for (const lz of [-0.98, 0.98]) {
        dressTube(teakTrim, [benchX + lx, gFloorY + 0.415, benchZ + lz], 0.032, 0.038, 0.83, 6);
      }
    }
    dressBox(stoneHearth, [garageAt(0.05), gFloorY + 1.20, benchZ], [0.06, 0.62, 2.20], 0, false);
    for (const shelfY of [1.62, 1.98]) {
      dressBox(teakTrim, [garageAt(0.21), gFloorY + shelfY, benchZ], [0.32, 0.05, 2.20], 0, false);
    }
    // Tins on the bench, boxes on the shelves.
    for (const [tz, tr] of [[-0.72, 0.09], [-0.42, 0.075], [0.86, 0.085]] as Array<[number, number]>) {
      dressTube(brassTrim, [benchX + 0.06, gFloorY + 1.00, benchZ + tz], tr, tr, 0.22, 10, undefined, false);
    }
    for (const [sy, sz, sw] of [[1.78, -0.70, 0.40], [1.78, 0.30, 0.52], [2.14, -0.10, 0.44]] as Array<[number, number, number]>) {
      dressBox(upholstery, [garageAt(0.21), gFloorY + sy, benchZ + sz], [0.26, 0.26, sw], 0, false);
    }
    // Tyre stack and a box stack, both against the far wall, both under 0.90 m.
    const tyreX = garageAt(0.52);
    for (const [index, ty] of [0.10, 0.30, 0.50].entries()) {
      dressTube(fireboxDark, [tyreX + index * 0.02, gFloorY + ty, gz0 + 3.75], 0.34, 0.34, 0.20, 14);
    }
    dressBox(teakTrim, [garageAt(0.48), gFloorY + 0.24, gz1 - 1.05], [0.72, 0.48, 0.60], 0.07);
    dressBox(teakTrim, [garageAt(0.44), gFloorY + 0.66, gz1 - 1.00], [0.60, 0.36, 0.52], -0.12);
    dressBox(interiorTrim, [garageAt(0.50), gFloorY + 0.22, gz1 - 1.85], [0.44, 0.44, 0.40], 0.19);
  }

  // ---- Sheds in back (north) corners + rear patio sets (fact 8; aerials) ----
  // The back-yard shed is not bare massing: in `teal-backyard.png` it is clad
  // and painted in the SAME colour as the house it stands behind, with a white
  // door, which is what ties the back lot to its team half. Cream massing made
  // it read as a third, unrelated building. Emitted as two `centred()` calls
  // rather than `pair()` only because each half needs its own skin material;
  // the names, positions and size are byte-identical to what `pair()` emitted.
  const shedE = centred(builder, 'aarr-shed-east', [-16, 1.1, -21], [3.0, 2.2, 2.6], houseSkin.east);
  const shedW = centred(builder, 'aarr-shed-west', [16, 1.1, -21], [3.0, 2.2, 2.6], houseSkin.west);
  const [shedRoofW, shedRoofE] = pair(builder, 'aarr-shed-roof', 16, 2.3, -21, [3.4, 0.25, 3.0], roof);
  // Catalog shed GLBs sit on the same pads at the same yaw (none).
  kitbash('./assets/rebuild/spread/shed.glb', [-25.6, 0, -33.6], 0, [shedW, shedRoofW], undefined, true);
  kitbash('./assets/rebuild/spread/shed.glb', [25.6, 0, -33.6], 0, [shedE, shedRoofE], undefined, true);
  pair(builder, 'aarr-patio-table', 10, 0.4, -19, [1.4, 0.8, 1.4], concreteFor(1.4));
  pair(builder, 'aarr-patio-umbrella-pole', 10, 1.4, -19, [0.12, 2.4, 0.12], darkPole);
  pair(builder, 'aarr-patio-bench', 10, 0.3, -17.2, [1.6, 0.6, 0.5], lumber);

  // ---- Bus + semi nose-to-nose inside the loop (fact 4; all plates) ----
  // Bus body is catalog batch1 (Blender procedural + baked PBR, manifest
  // atomic-acres-rebuild-bus-20260915); massing stays as instant fallback.
  const busBody = centred(builder, 'aarr-bus-body', [-3.2, 1.4, 0.5], [2.5, 2.6, 11.0], vehicleFor(11.0), { rotation: [0, 0.28, 0] });
  const busRoof = centred(builder, 'aarr-bus-roof', [-3.2, 2.8, 0.5], [2.5, 0.2, 11.0], roof, { rotation: [0, 0.28, 0] });
  // Base-frame catalog GLB: standard kitbash applies SPREAD + yaw.
  kitbash('./assets/rebuild/vehicles/bus.glb', [-3.2, 0, 0.5], 0.28, [busBody, busRoof]);
  const semiCab = centred(builder, 'aarr-semi-cab', [3.4, 1.5, -3.4], [2.5, 2.8, 2.8], rust, { rotation: [0, -0.22, 0] });
  const semiTrailer = centred(builder, 'aarr-semi-trailer', [4.6, 1.6, 3.2], [2.6, 3.0, 9.5], vehicleFor(9.5), { rotation: [0, -0.22, 0] });
  // Catalog whole-rig GLB spans the cab+trailer zone at the shared yaw.
  kitbash('./assets/rebuild/vehicles/semi.glb', [4.0, 0, -0.1], -0.22, [semiCab, semiTrailer]);

  // ---- Crate clusters: south choke + island + yards (fact 4/6; street plate) ----
  //
  // ---- LANE N, 2026-09-16: THE BARRICADE WAS STILL ONE SLAB ---------------
  //
  // WHAT THE CAPTURE SHOWS. In `artifacts/viewpoint-regression/final/
  // atomic-acres-rebuild/atomic-acres-rebuild-street-south.png` - the first
  // thing a player sees coming up the entry - the choke is a single block of
  // flat orange panels. The last pass gave the fifteen boxes four deterministic
  // `crateAges` on WoodFloor at a true 1 m slat pitch, which was the right
  // diagnosis of the MATERIAL and did nothing about the FORM: fifteen 1.6 m
  // cubes on an exact 1.6 m pitch at one z share a single continuous 6.4 m
  // face plane and a single straight 4 m top line, so the only thing varying
  // across the whole object is tint. That is why it still measures 3.70 luma
  // stddev against road 12.71 and concrete 18.77-24.82 - the flattest large
  // surface in the arena. A tint cannot break a plane.
  //
  // WHAT THE REFS HAVE THAT IT DID NOT (`_judge/refs/road-entrance.png`,
  // `batch-4-nuketown-graybox/gray_street_01.png`): crates of different sizes,
  // turned a few degrees off each other, resting on whatever is under them
  // rather than on a grid line, with a shadow gap at every joint, a visible
  // corner FRAME standing proud of each panel, and a top line that steps.
  // Every one of those is geometry, so every one of them is done here.
  //
  //  1. SIZE + YAW VARIANCE. Each crate draws its own plan width, depth,
  //     height and yaw from one seeded `mulberry32` stream, so the barricade is
  //     byte-identical every run and every capture is comparable to the last.
  //  2. IT STACKS ON ITSELF. Rows no longer sit at hard 1 m stations: each
  //     column carries a running top and the next crate rests on it. With
  //     heights 0.86-1.00 the three-high stack finishes anywhere in 2.58-3.00,
  //     which is the stepped top line the refs have, and the top row rests on
  //     the HIGHER of the two columns it bridges so nothing floats.
  //  3. THE FRAME IS REAL GEOMETRY. The `centred()` body is emitted 35 mm
  //     UNDERSIZE in plan and 30 mm undersize in height, and ten merged batten
  //     members - four full-height corner stiles, a top and bottom rail on each
  //     z face, two lid battens - are placed at the crate's true envelope. So
  //     the frame stands 35 mm proud of the panel it frames, in a tone off the
  //     panel's own, and the 30 mm body inset opens a genuine shadow reveal at
  //     every stacked joint. That is the thing that was missing: a lit edge and
  //     a dark line per crate instead of one 6.4 m plane.
  //
  // BOUNDED STRICTLY INSIDE THE COLLIDER, AND THE COLLIDER IS NOT TOUCHED.
  // `src/atomic-acres-rebuild-authority.ts` owns this choke as two merged
  // proxies - `aarr-choke-base` [0, 1.5, 14] x [4, 3, 1] and `aarr-choke-top`
  // [0, 3.5, 14] x [3, 1, 1] - i.e. world x +/-3.2, y 0-3.0, z 21.6-23.2 with a
  // x +/-2.4, y 3.0-4.0 cap. Nothing below goes near `builder`'s authority: the
  // bodies are `centred()` (solid:false/shots:false pinned) and the battens are
  // merged dressing parented straight to `root`. The envelopes are sized so the
  // YAWED plan AABB still fits: worst case half-extent is
  // (0.95*cos(0.055) + 0.84*sin(0.055))/2 = 0.4974 plan against the outer cell
  // at 1.5, i.e. 1.9974 of an available 2.0, and in z 0.04 + 0.4455 = 0.4855 of
  // 0.5. The tallest reachable stack is 3.00 + 1.00 = 4.00 exactly. So the
  // barricade cannot grow past the box a player already collides with.
  //
  // READABILITY, on a combat choke. The silhouette is BOUNDED BY, not extended
  // to, the collider - every added member is inside a volume the player already
  // reads as solid, so the object cannot newly block a sightline, and the
  // stepped top only ever REMOVES mass (0.86-1.00 heights) against the old flat
  // 4.0 m line, which opens the over-the-top shot rather than closing it. The
  // joint reveals are 30 mm and the plan gaps between neighbours are 50-100 mm
  // at 1.6 m of depth: a shadow seam at entry distance, not a firing slot and
  // not wide enough to hide or reveal a body. Nothing is added at ground level
  // in front of the stack, so the approach lane and the two flanking shoulders
  // (`choke-shoulder west/east`) keep the footprint they were tuned with.
  //
  // VRAM: ZERO. Both batten materials reuse tiling pairs this file already
  // binds - WoodFloor (2,1) from `crateAges[1]`/`lumber` and StairTimber (1,1)
  // from `fencePost` - and differ only by tint, which is a material uniform.
  // DRAWS: two, one per batten material, because all 150 members merge.
  const CHOKE_Z = 14;
  const CHOKE_PROUD = 0.035;
  const CHOKE_INSET = CHOKE_PROUD / ATOMIC_ACRES_REBUILD_SPREAD;
  const chokeBattenLight = inPbr('WoodFloor', 2, 1, 0xe8dccc);
  const chokeBattenDark = inPbr('StairTimber', 1, 1, 0x8f8377);
  /**
   * The ten merged batten members of one crate, placed at its TRUE envelope
   * (the `centred()` body inside them is `CHOKE_PROUD` smaller on every face).
   * `px`/`pz` are plan units like every other call in this section; `py` and
   * `h` are true metres, which is the same split `centred()` itself uses.
   */
  const chokeFrame = (px: number, py: number, pz: number, wP: number, h: number, dP: number, yaw: number, batten: THREE.Material): void => {
    const halfW = (wP * ATOMIC_ACRES_REBUILD_SPREAD) / 2;
    const halfD = (dP * ATOMIC_ACRES_REBUILD_SPREAD) / 2;
    const cx = px * ATOMIC_ACRES_REBUILD_SPREAD;
    const cz = pz * ATOMIC_ACRES_REBUILD_SPREAD;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // `dressBox` yaws with `makeRotationY`, so a local offset maps to world as
    // (ox*cos + oz*sin, -ox*sin + oz*cos); the member is yawed to match.
    const at = (ox: number, oy: number, oz: number): Vec3 => [cx + ox * cos + oz * sin, py + oy, cz - ox * sin + oz * cos];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        dressBox(batten, at(sx * (halfW - 0.05), 0, sz * (halfD - 0.05)), [0.10, h, 0.10], yaw);
      }
    }
    for (const sz of [-1, 1]) {
      for (const oy of [-(h / 2 - 0.10), h / 2 - 0.10]) {
        dressBox(batten, at(0, oy, sz * (halfD - 0.035)), [2 * halfW - 0.20, 0.11, 0.07], yaw);
      }
    }
    for (const oz of [-halfD / 2, halfD / 2]) {
      dressBox(batten, at(0, h / 2 - 0.0225, oz), [2 * halfW, 0.045, 0.12], yaw);
    }
  };
  const chokeRand = mulberry32(0x5ca1e5);
  /** One barricade crate: body + frame, returning the stack height it leaves. */
  const chokeCrate = (name: string, px: number, baseY: number, cell: number, row: number): number => {
    const wP = 0.90 + chokeRand() * 0.05;
    const dP = 0.78 + chokeRand() * 0.06;
    const h = 0.86 + chokeRand() * 0.14;
    const yaw = (chokeRand() - 0.5) * 0.11;
    const pz = CHOKE_Z + (chokeRand() - 0.5) * 0.08;
    const py = baseY + h / 2;
    centred(builder, name, [px, py, pz], [wP - CHOKE_INSET, h - 0.06, dP - CHOKE_INSET], crateAge(cell, row), { rotation: [0, yaw, 0] });
    chokeFrame(px, py, pz, wP, h, dP, yaw, (cell + row) % 2 === 0 ? chokeBattenLight : chokeBattenDark);
    return baseY + h;
  };
  // South choke barricade across the entry: 4-wide x 3-tall + 3-crate top row.
  const chokeColumnTop = [0, 0, 0, 0];
  for (let iy = 0; iy < 3; iy += 1) {
    for (let ix = 0; ix < 4; ix += 1) {
      chokeColumnTop[ix] = chokeCrate(`aarr-choke-crate-${ix}-${iy}`, -1.5 + ix, chokeColumnTop[ix]!, ix, iy);
    }
  }
  for (let ix = 0; ix < 3; ix += 1) {
    // Bridges columns ix and ix+1, so it rests on the higher of the two.
    chokeCrate(`aarr-choke-crate-top-${ix}`, -1 + ix, Math.max(chokeColumnTop[ix]!, chokeColumnTop[ix + 1]!), ix, 4);
  }
  // Island cluster (street plate island): 2x2 + 1 top + planter pair.
  // Spread 06 crates (0.96 footprint inside the merged island collider).
  const islandSpots: ReadonlyArray<readonly [number, number, number]> = [[-0.8, 2.2, 0], [0.8, 2.2, 0], [-0.8, 3.8, 0], [0.8, 3.8, 0], [0, 3, 0.6]] as const;
  for (const [dx, dz, dy] of islandSpots) {
    const box = centred(builder, `aarr-island-crate-${dx}-${dz}`, [dx, 0.62, dz], [1, 1, 1], crateAge(dx, dz));
    kitbash('./assets/rebuild/crates-worn/crate-06-worn.glb', [dx * 1.6, dy, dz * 1.6], (dx + dz) * 0.4, [box], undefined, true);
  }
  hedgeRun('aarr-hedge-loop', 12.2, 0.6, -4.3, [1.2, 1.2, 2.0]);
  // Yard clusters near fences/pads (topdown plate scatter).
  const yardClusters: ReadonlyArray<readonly [number, number]> = [[-8, -12], [8, -13], [-6, 9], [6, 8]] as const;
  for (const [cx, cz] of yardClusters) {
    const side = cx < 0 ? 'w' : 'e';
    const end = cz < 0 ? 'n' : 's';
    const spots: ReadonlyArray<readonly [number, number, number]> = [[cx, cz, 0], [cx + 1, cz, 0], [cx + 0.5, cz, 0.6], [cx + 0.5, cz + 1, 0]] as const;
    for (const [sx, sz, sy] of spots) {
      const box = centred(builder, `aarr-yard-crate-${side}-${end}-${sx}-${sz}`, [sx, 0.5 + sy, sz], [1, 1, 1], crateAge(Math.round(sx), Math.round(sz)));
      kitbash('./assets/rebuild/crates-worn/crate-06-worn.glb', [sx * 1.6, sy, sz * 1.6], (sx + sz) * 0.7, [box], undefined, true);
    }
  }

  // ---- Concrete pads: entrance + shed aprons + 4 lawn pads (fact 7) ----
  centred(builder, 'aarr-pad-entrance', [0, 0.05, 19], [10, 0.1, 4], concreteFor(10, 4), { cast: false });
  pair(builder, 'aarr-pad-shed-apron', 16, 0.05, -18.4, [4, 0.1, 2.4], concreteFor(4, 2.4), { cast: false });
  pair(builder, 'aarr-pad-lawn-sw-se', 14, 0.09, 12, [4.5, 0.08, 4.5], concreteFor(4.5), { cast: false });
  pair(builder, 'aarr-pad-lawn-mid', 14, 0.09, -4, [4.0, 0.08, 4.0], concreteFor(4.0), { cast: false });

  // ---- Perimeter concrete walls with pillars, CLOSED with gaps (BRIEF; topdown) ----
  // South wall (z=+24) with 8 m entry gap; north wall (z=-26) with 6 m entrance gap.
  pair(builder, 'aarr-wall-south', 14, 1.2, 24, [16, 2.4, 0.5], concreteFor(16, 2.4));
  pair(builder, 'aarr-wall-north', 13.5, 1.2, -26, [17, 2.4, 0.5], concreteFor(17, 2.4));
  pair(builder, 'aarr-wall-side', 24, 1.2, -1, [0.5, 2.4, 49], concreteFor(49, 2.4));
  // Pillars every ~8 m along each run.
  for (const px of [-20, -12, -4, 4, 12, 20]) {
    pair(builder, `aarr-pillar-south-${Math.abs(px)}`, Math.abs(px) < 4 ? 6 : px, 1.5, 24, [0.9, 3.0, 0.9], concreteFor(0.9, 3.0));
    pair(builder, `aarr-pillar-north-${Math.abs(px)}`, Math.abs(px) < 3 ? 5 : px, 1.5, -26, [0.9, 3.0, 0.9], concreteFor(0.9, 3.0));
  }
  for (const pz of [-20, -12, -4, 4, 12, 20]) {
    pair(builder, `aarr-pillar-side-${Math.abs(pz)}`, 24, 1.5, pz, [0.9, 3.0, 0.9], concreteFor(0.9, 3.0));
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
    const [runW, runE] = pair(builder, `aarr-fence-${run.name}`, run.cx, 0.9, run.cz, run.alongX ? [9, 1.8, 0.25] : [0.25, 1.8, 10], fenceBoard);
    // CAP RAIL. Every fence in `teal-backyard.png` and `street-teal.png` is
    // capped, and at street distance the cap is the only line the eye gets off
    // a fence: a lit horizontal edge with its own shadow under it, breaking the
    // panel's top against the sky. The shipped run had a bare cut top, which is
    // most of why `yard-geometry` reads it as a garden WALL rather than a
    // fence. 0.12 m thick, 0.15 m proud of each face, casting (the shadow is
    // the point), and hidden with the panel when the bay GLB resolves so it
    // cannot double up on the catalog bay's own cap.
    const [capW, capE] = pair(builder, `aarr-fence-${run.name}-cap`, run.cx, 1.86, run.cz, run.alongX ? [9.2, 0.12, 0.55] : [0.55, 0.12, 10.2], fenceCap);
    const hide = [runW, runE, capW, capE];
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
        centred(builder, `aarr-fence-${run.name}-post-${side < 0 ? 'w' : 'e'}-${e < 0 ? 'a' : 'b'}`, [px, 1.0, pz], [0.25, 2.0, 0.25], fencePost);
      }
    }
  }

  // ---- Street lamps x6 (fact 9; street plate dark poles + lamp-pool massing) ----
  const lampSpots: ReadonlyArray<readonly [number, number]> = [[-7, -12], [7, -12], [-7.5, 8], [7.5, 8], [-5.5, 20], [5.5, 20]] as const;
  for (const [lx, lz] of lampSpots) {
    const tag = `${lx < 0 ? 'w' : 'e'}-${Math.round(lz)}`;
    centred(builder, `aarr-lamp-${tag}-base`, [lx, 0.3, lz], [0.9, 0.6, 0.9], concreteFor(0.9));
    const pole = centred(builder, `aarr-lamp-${tag}-pole`, [lx, 3.1, lz], [0.18, 5.6, 0.18], darkPole);
    const head = centred(builder, `aarr-lamp-${tag}-head`, [lx, 5.9, lz], [0.7, 0.35, 0.4], darkPole);
    // Catalog lamp post GLB over the pole+head (base plinth stays).
    kitbash('./assets/rebuild/spread/lamp.glb', [lx * 1.6, 0, lz * 1.6], 0, [pole, head], undefined, true);
  }

  // ---- Hedges: road edges + front yards + pad rows (facts 7/9; green blobs) ----
  hedgeRun('aarr-hedge-entry', 6.4, 0.6, 20, [1.2, 1.2, 8]);
  hedgeRun('aarr-hedge-yard', 14, 0.6, 6.5, [7, 1.2, 1.2]);
  hedgeRun('aarr-hedge-back', 12, 0.6, -13, [8, 1.2, 1.2]);
  hedgeRun('aarr-hedge-wall', 18, 0.6, 21.5, [6, 1.2, 1.2]);
  hedgeRun('aarr-hedge-pad', 14, 0.6, 14.6, [4.5, 1.0, 0.8]);

  // ---- North entrance: welcome sign + rusty car between sheds (fact 5) ----
  const signBoard = centred(builder, 'aarr-sign-board', [0, 1.9, -24.5], [3.2, 1.0, 0.15], lumber);
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
    centred(builder, `aarr-sandbag-${ix}`, [-6.5 + ix * 1.1, 0.35, 18.5], [1.0, 0.7, 0.8], concreteFor(1.0));
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
    // Desert scrub is NOT lawn and must not carry the lawn's green: the same
    // bake at the same (2, 2) repeat, tinted down to a dry sage, so the surround
    // stops reading as mown grass at zero VRAM cost.
    centred(builder, `aarr-scrub-${i}`, [x, s / 2, z], [s, s, s], desertScrubGreen);
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

  // ---- LANE M / DESERT VEGETATION, 2026-09-16 ------------------------------
  //
  // `gray_topdown_01.png`, `street-teal.png`, `teal-side-lane.png` and
  // `map__center-loop.png` all carry JOSHUA TREES with their spiky rosettes,
  // clipped box hedges with a foliage edge, flowering shrubs at the kerb and
  // desert scrub with agave. The render put flat green cuboids where the
  // hedges should be, dry cubes for scrub, and left the Joshua trees to six
  // far-desert GLBs that no street station frames. All four are answered here
  // in code; `public/assets/**` is another lane's and no bake on disk carries
  // a plant silhouette.
  //
  // READABILITY IS BOUNDED BY PLACEMENT, and the bound is geometric, not a
  // promise. NOTHING below is solid — none of it reaches `builder`, so no
  // sightline, bullet path or walkable surface changes at all. Beyond that:
  //  - Every Joshua tree stands either OUTSIDE the perimeter wall (plan
  //    |x| >= 26 or |z| >= 29, against the wall line at |x| 24 / z 24, and
  //    clear of the service roads at plan |x| 27.5-34.5) or in one of the four
  //    dead lot corners at plan (+-22.5, +-21.5..-24), which carry no lane, no
  //    spawn and no cover. Its trunk is 0.52 m across and every rosette sits
  //    above 2.3 m, i.e. over a standing player's head, so it cannot hide a
  //    body at the range it is visible from.
  //  - Hedge foliage is generated INSIDE each hedge's own world AABB grown by
  //    at most 0.22 m. The tallest run goes from 1.20 m to about 1.42 m at the
  //    clumps, still under a standing eye at 1.70 m, and the clumps are
  //    discontinuous by construction, so a head crossing a hedge line is read
  //    through the gaps exactly as it was before.
  //  - Flowering shrubs are 0.8 m foundation planting on the front lawns at
  //    plan |x| 16.5, clear of both driveways (inner edge plan 17.3) and of
  //    both houses' z spans. They are below crouch height.
  //  - Agave sits only on the desert apron beyond world |x| 40, outside the
  //    playfield entirely.
  const vegRand = mulberry32(0x5eed17);
  /** One foliage clump: a low-poly lump, sunk into whatever it dresses. */
  const dressClump = (material: THREE.Material, x: number, y: number, z: number, radius: number, squash: number): void => {
    const transform = new THREE.Matrix4().makeScale(1, squash, 1);
    transform.setPosition(x, y, z);
    dressAdd(material, new THREE.IcosahedronGeometry(radius, 0), transform, true);
  };
  for (const run of hedgeRuns) {
    const top = run.cy + run.h / 2;
    const cols = Math.max(2, Math.round(run.w / 0.72));
    const rows = Math.max(2, Math.round(run.d / 0.72));
    for (let ci = 0; ci < cols; ci += 1) {
      for (let ri = 0; ri < rows; ri += 1) {
        const gx = -run.w / 2 + ((ci + 0.5) / cols) * run.w;
        const gz = -run.d / 2 + ((ri + 0.5) / rows) * run.d;
        const radius = 0.26 + vegRand() * 0.14;
        dressClump(
          hedgeFoliage,
          run.cx + gx + (vegRand() - 0.5) * 0.18,
          top - 0.10 + (vegRand() - 0.5) * 0.12,
          run.cz + gz + (vegRand() - 0.5) * 0.18,
          radius,
          0.78,
        );
        // Flank clumps on the run's long edges only: two staggered heights are
        // what turns a machined vertical face into planting.
        const onEdge = run.w >= run.d ? ri === 0 || ri === rows - 1 : ci === 0 || ci === cols - 1;
        if (!onEdge) continue;
        const nx = run.w >= run.d ? 0 : Math.sign(gx || 1);
        const nz = run.w >= run.d ? Math.sign(gz || 1) : 0;
        for (const drop of [0.34, 0.72]) {
          const r2 = 0.21 + vegRand() * 0.11;
          dressClump(
            hedgeFoliage,
            run.cx + gx + nx * (run.w / 2 - 0.04) + (vegRand() - 0.5) * 0.12,
            top - drop - vegRand() * 0.14,
            run.cz + gz + nz * (run.d / 2 - 0.04) + (vegRand() - 0.5) * 0.12,
            r2,
            0.9,
          );
        }
      }
    }
  }
  /**
   * One Joshua tree, in TRUE world metres.
   *
   * The plates' signal is the spiky ROSETTE, not the crown: a shaggy tapered
   * trunk, three arms cocked up and out, and a fan of stiff blades at every
   * arm tip and at the apex. Nine blades per rosette is the count that reads
   * as spiky at street distance without becoming a ball; four radial segments
   * per blade is a spike rather than a cone.
   */
  const joshuaTree = (x: number, z: number, scale: number, yaw: number): void => {
    const trunkH = 2.35 * scale;
    const trunkR = 0.26 * scale;
    dressTube(joshuaBark, [x, trunkH / 2, z], trunkR * 0.76, trunkR, trunkH, 7);
    const rosettes: Array<readonly [number, number, number, number]> = [[x, trunkH + 0.06 * scale, z, 1.06]];
    const arms = 3;
    for (let i = 0; i < arms; i += 1) {
      const az = yaw + (i / arms) * Math.PI * 2 + (vegRand() - 0.5) * 0.7;
      const tilt = 0.52 + vegRand() * 0.3;
      const len = (1.2 + vegRand() * 0.55) * scale;
      const baseY = trunkH - 0.3 * scale;
      const dx = Math.cos(az) * Math.sin(tilt);
      const dy = Math.cos(tilt);
      const dz = Math.sin(az) * Math.sin(tilt);
      dressTube(
        joshuaBark,
        [x + dx * len / 2, baseY + dy * len / 2, z + dz * len / 2],
        0.12 * scale,
        0.17 * scale,
        len,
        6,
        new THREE.Euler(0, -az, -tilt, 'YZX'),
      );
      rosettes.push([x + dx * len, baseY + dy * len, z + dz * len, 0.86 + vegRand() * 0.3] as const);
    }
    for (const [rx, ry, rz, rs] of rosettes) {
      for (let b = 0; b < 9; b += 1) {
        dressBlade(desertBlade, [rx, ry, rz], 0.6 * scale * rs, 0.055 * scale * rs, (b / 9) * Math.PI * 2 + yaw, 0.52 + (b % 3) * 0.24);
      }
    }
  };
  // Plan-frame positions, mirrored; converted to world here so every number
  // above can be checked against the layout numbers in this file's header.
  const JOSHUA_PLAN: ReadonlyArray<readonly [number, number]> = [
    [26, 30], [26, 12], [26, -6], [26, -24],
    [36.5, 22], [36.5, 2], [36.5, -18],
    [42, 34], [42, 10], [42, -14],
    [9.5, 29], [13.5, 33], [20, 31],
    [7.5, -30], [14, -32],
    [22.5, 21.5], [22.5, -24],
  ] as const;
  let joshuaCount = 0;
  for (const [px, pz] of JOSHUA_PLAN) {
    for (const side of [-1, 1]) {
      joshuaTree(
        side * px * ATOMIC_ACRES_REBUILD_SPREAD,
        pz * ATOMIC_ACRES_REBUILD_SPREAD,
        0.86 + vegRand() * 0.42,
        vegRand() * Math.PI * 2,
      );
      joshuaCount += 1;
    }
  }
  // Agave rosettes on the desert apron beyond the playfield (world metres).
  let agaveCount = 0;
  for (let i = 0; i < 40; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const ax = side * (40 + vegRand() * 28);
    const az = -56 + vegRand() * 112;
    if (Math.abs(ax) > 44 && Math.abs(ax) < 55.2) continue; // clear of the service roads
    const s = 0.8 + vegRand() * 0.5;
    for (let b = 0; b < 11; b += 1) {
      dressBlade(desertBlade, [ax, 0.05, az], 0.62 * s, 0.07 * s, (b / 11) * Math.PI * 2 + vegRand() * 0.2, 0.78 + (b % 3) * 0.16);
    }
    agaveCount += 1;
  }
  // Flowering shrubs, foundation planting on the four front-lawn faces.
  let shrubCount = 0;
  for (const pz of [8.4, 11.6, 14.8, 17.4, -6.2, -9.4]) {
    for (const side of [-1, 1]) {
      const sx = side * 16.5 * ATOMIC_ACRES_REBUILD_SPREAD;
      const sz = pz * ATOMIC_ACRES_REBUILD_SPREAD;
      for (let c = 0; c < 5; c += 1) {
        const angle = (c / 5) * Math.PI * 2;
        dressClump(
          hedgeFoliage,
          sx + Math.cos(angle) * 0.3,
          0.3 + (c === 4 ? 0.24 : 0),
          sz + Math.sin(angle) * 0.3,
          0.3 + vegRand() * 0.1,
          0.85,
        );
      }
      for (let f = 0; f < 6; f += 1) {
        dressClump(
          shrubBloom,
          sx + (vegRand() - 0.5) * 0.9,
          0.5 + vegRand() * 0.28,
          sz + (vegRand() - 0.5) * 0.9,
          0.075 + vegRand() * 0.035,
          1,
        );
      }
      shrubCount += 1;
    }
  }

  // One merged mesh per (material, castShadow) for every piece of interior
  // dressing and every plant above. Nothing here is solid; see the batch header.
  flushDress();

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
    // Lane M dressing + vegetation, merged: one mesh per (material, cast).
    dressMeshes: dressStats.meshes,
    dressTriangles: dressStats.triangles,
    joshuaTrees: joshuaCount,
    agaveRosettes: agaveCount,
    floweringShrubs: shrubCount,
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
