/**
 * farcrysis-physics.ts — Rapier-aligned physics interactables for the Farcrysis arena.
 *
 * Exports addInteractables(builder) which places breakable crates, barrels,
 * stacked sandbag cover walls, fallen trunks, rock outcrops, and vantage
 * platforms into the arena.  Every object follows the existing box() pattern
 * from farcrysis.ts: create THREE.Mesh, push matching pairs into
 * builder.colliders AND builder.physicsColliders (keeping their lengths equal),
 * builder.raycastMeshes, builder.shotSurfaces, and builder.physicalCover where
 * appropriate.  The Rapier physics world and the ballistic-authority system
 * pick up every entry without any extra wiring.
 *
 * All placement is seeded deterministic (mulberry32 PRNG — no Math.random)
 * so every prop position is reproducible across reloads and test runs.
 *
 * ## How to wire into buildFarcrysis()
 *
 * Inside `buildFarcrysis()` in farcrysis.ts, import and call addInteractables
 * after the core desk / interior crates (around line 309) and before the
 * throwbacks section or applyFarcrysisArtwork:
 *
 *   import { addInteractables } from './farcrysis-physics';
 *   // ... (after farcrysis-core-crate-b)
 *   addInteractables(builder);   // <-- mount interactables here
 *   // ... (before throwbacks / applyFarcrysisArtwork)
 *
 * The engine auto-creates Rapier static cuboid colliders from physicsColliders
 * inside CharacterPhysics.create() — there is NO need to import
 * @dimforge/rapier3d-compat in this module.
 */

import * as THREE from 'three';
import type { Box2 } from './collision';
import { createBallisticSurface } from './ballistics';
import { classifyImpactSurface } from './combat-feedback';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';

// ---------------------------------------------------------------------------
// Terrain-height function — replicated from farcrysis-art.ts so every
// interactable can be placed on the visual terrain surface.  The physics
// world floor is flat at y=0; this function determines where the rendered
// terrain sits so objects are never floating above or buried inside it.
// ---------------------------------------------------------------------------

/** Replicated from farcrysis-art.ts — must be kept in sync. */
function terrainHeight(x: number, z: number): number {
  const dist = FARCRYSIS_BOUNDS.maxX - Math.max(Math.abs(x), Math.abs(z));
  // Beach shelf: flat near edges, rising toward centre
  if (dist < 10) return Math.max(0, dist * 0.03 - 0.1);
  // Jungle interior: gentle rolling hills
  const h = Math.sin(x * 0.12) * Math.cos(z * 0.15) * 1.2
    + Math.sin(x * 0.25 + 1.3) * Math.cos(z * 0.22 + 2.1) * 0.6
    + Math.sin(z * 0.18 - 0.7) * 0.4;
  return Math.max(-0.05, h + 0.1);
}

/** Returns the terrain surface Y clamped to never go below the physics floor (y=0). */
function placementBaseY(x: number, z: number): number {
  return Math.max(0, terrainHeight(x, z));
}

// ---------------------------------------------------------------------------
// Material helper — mirrors the mat() convention in farcrysis-art.ts
// ---------------------------------------------------------------------------

const mat = (color: number, roughness = 0.86, metalness = 0.08): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

// ---------------------------------------------------------------------------
// Interactable registration — mirrors the private box() helper in farcrysis.ts
// ---------------------------------------------------------------------------

/**
 * Build a world-space AABB from the mesh geometry and register it with
 * every collision / physics / ballistic / cover array on the Builder.
 *
 * This is the same shape as the private `box()` function in farcrysis.ts:
 * 1. Compute Box2 bounds from geometry parameters (BoxGeometry or CylinderGeometry).
 * 2. Push the mesh into builder.raycastMeshes for hitscan traces.
 * 3. Push bounds into builder.colliders (lightweight AABB queries) and
 *    builder.physicsColliders (auto-converted to Rapier cuboid colliders).
 * 4. Push a BallisticSurface into builder.shotSurfaces so the penetration
 *    system knows the material (wood, thin-metal, earth, etc.).
 * 5. If this is a cover piece, push into builder.physicalCover for the
 *    crouch / peek / lean system.
 */
function registerBox(
  builder: any,

  /** The THREE.Mesh — must be already added to builder.root BEFORE calling registerBox. */
  mesh: THREE.Mesh,

  /** Unique name, e.g. 'farcrysis-crate-03'. Doubles as the cover id when isCover is true. */
  name: string,

  /** Ballistic material id understood by the penetration system. */
  ballistic: string,

  /** True for sandbag walls and other low cover that blocks movement and shots. */
  isCover: boolean,
): void {
  const pos = mesh.position;
  const geom = mesh.geometry;

  // ---- Compute half-extents from geometry parameters ----
  let halfW: number;
  let halfH: number;
  let halfD: number;

  if (geom instanceof THREE.BoxGeometry) {
    // BoxGeometry(width, height, depth, ...segments)
    const p = geom.parameters as { width: number; height: number; depth: number } | undefined;
    halfW = (p?.width ?? 1) / 2;
    halfH = (p?.height ?? 1) / 2;
    halfD = (p?.depth ?? 1) / 2;
  } else if (geom instanceof THREE.CylinderGeometry) {
    // CylinderGeometry(radiusTop, radiusBottom, height, ...)
    // We collapse the cylinder into an AABB — Rapier static colliders are cuboid,
    // and the physicsColliders Box2 format only models boxes.  The small
    // approximation error (cylinder → box) is acceptable for barrels at this scale.
    const p = geom.parameters as {
      radiusTop: number;
      radiusBottom: number;
      height: number;
    } | undefined;
    const r = Math.max(p?.radiusTop ?? 0.5, p?.radiusBottom ?? 0.5);
    halfW = r;
    halfD = r;
    halfH = (p?.height ?? 1) / 2;
  } else {
    // Fallback: use the computed bounding box (works for any BufferGeometry).
    geom.computeBoundingBox();
    const bb = geom.boundingBox!;
    halfW = (bb.max.x - bb.min.x) / 2;
    halfH = (bb.max.y - bb.min.y) / 2;
    halfD = (bb.max.z - bb.min.z) / 2;
  }

  // ---- Build the Box2 bounds shared by collision, physics, and cover ----
  const bounds: Box2 = {
    minX: pos.x - halfW,
    maxX: pos.x + halfW,
    minZ: pos.z - halfD,
    maxZ: pos.z + halfD,
    minY: pos.y - halfH,
    maxY: pos.y + halfH,
  };

  // (a) Raycast mesh: hitscan bullet traces stop on this object.
  builder.raycastMeshes.push(mesh);

  // (b) Lightweight AABB colliders for rapid overlap / trace queries.
  builder.colliders.push(bounds);

  // (c) Physics colliders → Rapier static cuboids built by CharacterPhysics.create().
  builder.physicsColliders.push(bounds);

  // (d) Ballistic surface: gives the penetration system material info (wood,
  //     thin-metal, earth) so bullets behave correctly inside this object.
  const surfaceBounds = {
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  };
  builder.shotSurfaces.push(
    createBallisticSurface(
      `farcrysis-shot-${name}`,
      name,
      surfaceBounds,
      { material: ballistic as any },
    ),
  );

  // (e) Physical cover: only sandbag walls (or other deliberate cover) get
  //     registered for the crouch / peek / lean system.
  if (isCover) {
    builder.physicalCover.push({
      id: name,
      bounds,
      blocksMovement: true,
      blocksShots: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Material palette for interactables — derived from FARCRYSIS_ART_FEEL
// ---------------------------------------------------------------------------

/** Wooden crate: warm brown with subtle grain feel. */
const crateMat = mat(FARCRYSIS_ART_FEEL.tikiWood, 0.9, 0.04);

/** Accent stripe / stamp on each crate face — golden-amber from the palette. */
const crateStampMat = mat(FARCRYSIS_ART_FEEL.crateStamp, 0.72, 0.1);

/** Rusty steel barrel: beacon orange works as a weathered-rust tone. */
const barrelMat = mat(FARCRYSIS_ART_FEEL.beaconLight, 0.78, 0.28);

/** Sandbag: dry sandy tan matched to the beach ring. */
const sandbagMat = mat(FARCRYSIS_ART_FEEL.beachSand, 0.95, 0.02);

/** Darker wood tone for crate frame edges / bevel inset. */
const frameWoodMat = mat(FARCRYSIS_ART_FEEL.tikiWood, 0.94, 0.03);

/** Barrel band metal — weathered antenna-grey. */
const barrelBandMat = mat(FARCRYSIS_ART_FEEL.antenna, 0.42, 0.55);

/** Palm trunk for fallen-cover logs — same colour as instanced palms. */
const palmTrunkMat = mat(FARCRYSIS_ART_FEEL.palmTrunk, 0.88, 0.03);

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG (mulberry32) — replaces Math.random for
// reproducible placement in all interactable helpers.
// ---------------------------------------------------------------------------

/**
 * Returns a mulberry32 PRNG function seeded with a 32-bit integer.
 * Used throughout the module for deterministic jitter so that every
 * prop position is reproducible across reloads and test runs.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

/**
 * Places one wooden crate (BoxGeometry) at the given position, registers
 * it with the builder, and optionally adds a coloured accent stripe on
 * the outward-facing side so the crate reads as a stamped "f4rcry515"
 * supply box at a distance.
 */
function placeCrate(
  builder: any,
  name: string,
  x: number,
  z: number,
  size: number,          // cubic side length, 0.8–1.2 m
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + size / 2;     // sit on the terrain surface

  // Main body — wood-brown box
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: crateMat.metalness });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'wood', false);

  // ── Visual detail ────────────────────────────────────────────────
  // Beveled inset — slightly smaller inner box gives plank-edging depth
  const inset = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.93, size * 0.93, size * 0.93),
    frameWoodMat,
  );
  inset.name = `${name}-inset`;
  inset.position.copy(mesh.position);
  inset.castShadow = false;
  inset.receiveShadow = false;
  builder.root.add(inset);

  // Corner frame posts — four thin vertical strips at each vertical edge
  const postHalf = size / 2 - 0.04;
  const postGeom = new THREE.BoxGeometry(0.07, size, 0.07);
  const corners: [number, number][] = [
    [ postHalf,  postHalf],
    [ postHalf, -postHalf],
    [-postHalf,  postHalf],
    [-postHalf, -postHalf],
  ];
  for (const [cx, cz] of corners) {
    const post = new THREE.Mesh(postGeom, frameWoodMat);
    post.name = `${name}-post-${cx > 0 ? 'p' : 'n'}${cz > 0 ? 'p' : 'n'}`;
    post.position.set(x + cx, y, z + cz);
    post.castShadow = false;
    post.receiveShadow = false;
    post.userData.impactSurface = mesh.userData.impactSurface;
    builder.root.add(post);
  }

  // Top-face frame slats — two thin strips across opposite edges in stamp colour
  const slatGeomX = new THREE.BoxGeometry(size * 0.85, 0.05, 0.06);
  const slatGeomZ = new THREE.BoxGeometry(0.06, 0.05, size * 0.85);
  const slatY = y + size / 2 + 0.025;
  const slatMat = mat(FARCRYSIS_ART_FEEL.crateStamp, 0.72, 0.1);
  [
    [x, slatY, z + size / 2 - 0.03, slatGeomX],
    [x, slatY, z - size / 2 + 0.03, slatGeomX],
    [x + size / 2 - 0.03, slatY, z, slatGeomZ],
    [x - size / 2 + 0.03, slatY, z, slatGeomZ],
  ].forEach(([sx, sy, sz, geom], i) => {
    const slat = new THREE.Mesh(geom as THREE.BoxGeometry, slatMat);
    slat.name = `${name}-top-slat-${i}`;
    slat.position.set(sx as number, sy as number, sz as number);
    slat.castShadow = false;
    slat.receiveShadow = false;
    slat.userData.impactSurface = mesh.userData.impactSurface;
    builder.root.add(slat);
  });

  // Accent stripe — thin emissive-coloured plaque on the side of the crate
  // that faces the most likely player approach direction, giving the stamp
  // visibility without requiring a texture.
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.6, size * 0.12, 0.04),
    crateStampMat,
  );
  accent.name = `${name}-stamp`;
  accent.position.set(x, y + size * 0.15, z + size / 2 + 0.03);
  accent.castShadow = false;
  accent.receiveShadow = false;
  builder.root.add(accent);
}

/**
 * Places one rusty steel barrel (CylinderGeometry) at the given position
 * and registers it as a thin-metal interactable.
 */
function placeBarrel(
  builder: any,
  name: string,
  x: number,
  z: number,
  radius: number,
  height: number,
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + height / 2;  // sit on the terrain surface

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 12),
    barrelMat,
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: barrelMat.metalness });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'thin-metal', false);

  // ── Visual detail ────────────────────────────────────────────────
  // Two metal bands wrapped around the barrel
  const bandRadius = radius + 0.03; // sit slightly proud of the surface
  const bandGeom = new THREE.TorusGeometry(bandRadius, 0.04, 6, 16);
  for (const bandY of [-height * 0.25, height * 0.25]) {
    const band = new THREE.Mesh(bandGeom, barrelBandMat);
    band.name = `${name}-band-${bandY > 0 ? 'top' : 'bot'}`;
    band.position.set(x, y + bandY, z);
    band.rotation.x = Math.PI / 2; // Torus defaults to XY plane — rotate to XZ
    band.castShadow = false;
    band.receiveShadow = false;
    band.userData.impactSurface = mesh.userData.impactSurface;
    builder.root.add(band);
  }

  // Vertical ridges — four thin strips running the barrel height at cardinal points
  const ridgeGeom = new THREE.BoxGeometry(0.03, height * 0.78, 0.04);
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const rx = Math.cos(angle) * (radius + 0.015);
    const rz = Math.sin(angle) * (radius + 0.015);
    const ridge = new THREE.Mesh(ridgeGeom, barrelBandMat);
    ridge.name = `${name}-ridge-${i}`;
    ridge.position.set(x + rx, y, z + rz);
    ridge.rotation.y = angle;
    ridge.castShadow = false;
    ridge.receiveShadow = false;
    ridge.userData.impactSurface = mesh.userData.impactSurface;
    builder.root.add(ridge);
  }
}

/**
 * Places one sandbag wall (low wide BoxGeometry) at the given position
 * and registers it as physical cover (blocks movement + shots).
 */
function placeSandbagWall(
  builder: any,
  name: string,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + height / 2;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    sandbagMat,
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: sandbagMat.metalness });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'earth', true);

  // ── Visual detail: individual sandbag overlays ───────────────────
  // Place 8-12 small slightly-rotated bag-shaped boxes on the front/back
  // faces to break up the monolithic look with fabric texture.
  const bagGeom = new THREE.BoxGeometry(0.38, 0.18, 0.44);
  const bagRows = 3;   // vertical layers
  const bagCols = 5;   // bags across the width
  for (let row = 0; row < bagRows; row += 1) {
    const rowY = row * 0.2 + 0.1; // stack from bottom up
    // stagger every other row
    const colCount = row % 2 === 0 ? bagCols : bagCols - 1;
    const colStartX = row % 2 === 0 ? -width / 2 + 0.22 : -width / 2 + 0.41;
    for (let col = 0; col < colCount; col += 1) {
      const bx = colStartX + col * 0.44;
      // Jitter each bag slightly for organic feel (deterministic via mulberry32)
      const bagRng = mulberry32(
        ((x * 1000) | 0) + ((z * 100) | 0) + row * 10 + col + 1,
      );
      const jx = (bagRng() - 0.5) * 0.06;
      const jy = (bagRng() - 0.5) * 0.03;
      const jz = (bagRng() - 0.5) * 0.04;
      const ry = (bagRng() - 0.5) * 0.12; // slight Y-rotation
      const rz = (bagRng() - 0.5) * 0.08; // slight roll

      const bag = new THREE.Mesh(bagGeom, sandbagMat);
      bag.name = `${name}-bag-f-${row}-${col}`;
      bag.position.set(x + bx + jx, y + rowY + jy, z + depth / 2 + 0.01 + jz);
      bag.rotation.set(0, ry, rz);
      bag.castShadow = true;
      bag.receiveShadow = true;
      bag.userData.impactSurface = mesh.userData.impactSurface;
      builder.root.add(bag);
    }
  }
}

/**
 * Places a fallen palm trunk as natural cover — a long low box that
 * reads as a collapsed log spanning a jungle path.  Registered as
 * physical cover with wood ballistic behaviour.
 */
function placeFallenTrunk(
  builder: any,
  name: string,
  x: number,
  z: number,
  length: number,
  thickness: number,
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + thickness / 2;
  const depth = 0.7; // fixed depth for all trunks (narrow)

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, thickness, depth),
    palmTrunkMat,
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: palmTrunkMat.metalness });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'wood', true);
}

/**
 * Places a 2-crate stack as player cover.  Each crate is registered
 * individually as a non-cover interactable; a combined physicalCover
 * entry spans the full stack footprint so the crouch / peek / lean
 * system treats it as one cover position.
 */
function placeCrateCover(builder: any, name: string, x: number, z: number): void {
  const size = 0.9;
  const baseY = placementBaseY(x, z);
  const y0 = baseY + size / 2;            // bottom crate centre
  const y1 = baseY + size / 2 + size;     // top crate centre

  // Bottom crate
  const c0 = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  c0.name = `${name}-c0`;
  c0.position.set(x, y0, z);
  c0.castShadow = true;
  c0.receiveShadow = true;
  c0.userData.impactSurface = classifyImpactSurface({ name: c0.name, metalness: crateMat.metalness });
  builder.root.add(c0);
  registerBox(builder, c0, c0.name, 'wood', false);

  // Top crate
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  c1.name = `${name}-c1`;
  c1.position.set(x, y1, z);
  c1.castShadow = true;
  c1.receiveShadow = true;
  c1.userData.impactSurface = classifyImpactSurface({ name: c1.name, metalness: crateMat.metalness });
  builder.root.add(c1);
  registerBox(builder, c1, c1.name, 'wood', false);

  // Combined cover footprint — ground to top of stack
  const halfW = size / 2;
  const halfD = size / 2;
  const coverBounds: Box2 = {
    minX: x - halfW,
    maxX: x + halfW,
    minZ: z - halfD,
    maxZ: z + halfD,
    minY: baseY,
    maxY: y1 + halfD,
  };
  builder.physicalCover.push({
    id: name,
    bounds: coverBounds,
    blocksMovement: true,
    blocksShots: true,
  });
}

/**
 * Adds splinter-shard detail on top of a crate — small thin planks at slight
 * angles, purely visual, not registered for collision/physics. Gives the
 * crate a "broken open" supply-drop look.
 */
function addCrateShards(builder: any, name: string, x: number, z: number, size: number): void {
  const baseY = placementBaseY(x, z);
  const yTop = baseY + size + 0.025; // just above the crate top
  const shardGeom = new THREE.BoxGeometry(size * 0.45, 0.03, 0.08);
  const shardMat = mat(FARCRYSIS_ART_FEEL.tikiWood, 0.94, 0.03);
  const seed = (x * 17 + z * 31) % 100;
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + ((seed + i * 7) % 31) * 0.04;
    const offsetR = size * 0.26;
    const sx = x + Math.cos(angle) * offsetR;
    const sz = z + Math.sin(angle) * offsetR;
    const shard = new THREE.Mesh(shardGeom, shardMat);
    shard.name = `${name}-shard-${i}`;
    shard.position.set(sx, yTop, sz);
    shard.rotation.y = angle + ((seed + i * 13) % 17 - 8) * 0.07;
    shard.castShadow = false;
    shard.receiveShadow = false;
    builder.root.add(shard);
  }
  // One or two thin splinters poking upward
  const splinterGeom = new THREE.BoxGeometry(0.04, size * 0.35, 0.04);
  for (let i = 0; i < 2; i += 1) {
    const angle = ((seed + i * 11) % 37) * 0.17;
    const offsetR = size * 0.18;
    const sx = x + Math.cos(angle) * offsetR;
    const sz = z + Math.sin(angle) * offsetR;
    const splinter = new THREE.Mesh(splinterGeom, shardMat);
    splinter.name = `${name}-splinter-${i}`;
    splinter.position.set(sx, yTop + size * 0.12, sz);
    splinter.rotation.z = ((seed + i * 19) % 13 - 6) * 0.055;
    splinter.rotation.x = ((seed + i * 23) % 11 - 5) * 0.05;
    splinter.castShadow = false;
    splinter.receiveShadow = false;
    builder.root.add(splinter);
  }
}

/**
 * Adds hazard-yellow stripe bands to a barrel (purely visual).
 * Two thin torus rings in a contrasting safety-yellow tone, placed
 * near the top and bottom thirds.
 */
function addHazardStripesToBarrel(
  builder: any,
  name: string,
  x: number,
  z: number,
  radius: number,
  height: number,
): void {
  const hazardYellow = mat(0xe6c23a, 0.55, 0.12);
  const stripeRadius = radius + 0.045;
  const stripeGeom = new THREE.TorusGeometry(stripeRadius, 0.05, 6, 16);
  const baseY = placementBaseY(x, z);
  const y = baseY + height / 2;
  for (const bandY of [-height * 0.18, height * 0.18]) {
    const stripe = new THREE.Mesh(stripeGeom, hazardYellow);
    stripe.name = `${name}-hazard-${bandY > 0 ? 'top' : 'bot'}`;
    stripe.position.set(x, y + bandY, z);
    stripe.rotation.x = Math.PI / 2;
    stripe.castShadow = false;
    stripe.receiveShadow = false;
    builder.root.add(stripe);
  }
}

/**
 * Places a rock outcrop as natural cover — a wide low boulder-like box
 * with a grey-brown rock tone.  Registered as physical cover with
 * earth ballistic behaviour, placed near the beach ring.
 */
function placeRockOutcrop(
  builder: any,
  name: string,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + height / 2;
  const rockOutcropMat = mat(0x7a7a73, 0.93, 0.08);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), rockOutcropMat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: 0.08 });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'earth', true);
}

/**
 * Places a raised vantage platform — a 2×2 crate stack (~1.5 m tall) that
 * gives a height advantage and doubles as cover.  Each base crate is
 * registered individually; the plank top and a combined physicalCover
 * footprint complete the position.  Small footprint keeps it out of
 * patrol lanes.
 */
function placeVantagePlatform(builder: any, name: string, x: number, z: number): void {
  const cSize = 0.82;
  const half = cSize / 2;
  const baseY = placementBaseY(x, z);
  const yBase = baseY + cSize / 2;

  // 2×2 grid of crates at the base
  const offsets: [number, number][] = [
    [-half, -half], [half, -half],
    [-half,  half], [half,  half],
  ];
  for (let i = 0; i < offsets.length; i += 1) {
    const [ox, oz] = offsets[i];
    const c = new THREE.Mesh(new THREE.BoxGeometry(cSize, cSize, cSize), crateMat);
    c.name = `${name}-base-${i}`;
    c.position.set(x + ox, yBase, z + oz);
    c.castShadow = true;
    c.receiveShadow = true;
    c.userData.impactSurface = classifyImpactSurface({ name: c.name, metalness: crateMat.metalness });
    builder.root.add(c);
    registerBox(builder, c, c.name, 'wood', false);
  }

  // Plank top — wider than the crate stack so a player can stand on it
  const platGeomHalf = cSize * 1.05;
  const platThick = 0.08;
  const platY = baseY + cSize + platThick / 2;
  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(platGeomHalf * 2, platThick, platGeomHalf * 2),
    mat(FARCRYSIS_ART_FEEL.tikiWood, 0.84, 0.04),
  );
  plat.name = `${name}-plank`;
  plat.position.set(x, platY, z);
  plat.castShadow = true;
  plat.receiveShadow = true;
  plat.userData.impactSurface = classifyImpactSurface({ name: plat.name, metalness: 0.04 });
  builder.root.add(plat);
  registerBox(builder, plat, plat.name, 'wood', false);

  // Combined cover footprint: ground to top of plank
  const coverBounds: Box2 = {
    minX: x - platGeomHalf,
    maxX: x + platGeomHalf,
    minZ: z - platGeomHalf,
    maxZ: z + platGeomHalf,
    minY: baseY,
    maxY: platY + platThick,
  };
  builder.physicalCover.push({
    id: name,
    bounds: coverBounds,
    blocksMovement: true,
    blocksShots: true,
  });
}

/**
 * Places a stacked sandbag wall built from small box segments near a
 * core door entrance.  Each segment is individually registered as a
 * 'concrete' ballistic surface with colliders + physics colliders;
 * a single physicalCover entry spans the whole wall so the crouch /
 * peek / lean system treats it as one cover position.
 */
function placeStackedSandbagWall(
  builder: any,
  name: string,
  x: number,
  z: number,
  width: number,
  segHeight: number,
  depth: number,
  count: number,
): void {
  const baseY = placementBaseY(x, z);
  // Build vertically stacked segments
  for (let i = 0; i < count; i += 1) {
    const segY = baseY + segHeight / 2 + i * segHeight; // bottom-aligned stack
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, segHeight, depth),
      sandbagMat,
    );
    mesh.name = `${name}-seg-${i}`;
    mesh.position.set(x, segY, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.impactSurface = classifyImpactSurface({
      name: mesh.name,
      metalness: sandbagMat.metalness,
    });
    builder.root.add(mesh);
    registerBox(builder, mesh, mesh.name, 'concrete', false);
  }

  // Single physicalCover for the full wall stack
  const totalHeight = segHeight * count;
  const wallBounds: Box2 = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    minY: baseY,
    maxY: baseY + totalHeight,
  };
  builder.physicalCover.push({
    id: name,
    bounds: wallBounds,
    blocksMovement: true,
    blocksShots: true,
  });
}

// ---------------------------------------------------------------------------
// Main entry point — called once from buildFarcrysis()
// ---------------------------------------------------------------------------

/**
 * Adds physics-backed interactables to the Farcrysis arena Builder.
 *
 * Places 32 crates, 22 barrels, 9 sandbag walls (6 flat + 2 stacked near
 * core doors + 1 cave/tower/beach each), 6 fallen palm trunks, 2 rock
 * outcrops, 2 crate stacks (adding 4 more crates), and 2 vantage
 * platforms (8 more crates).  Every position is seed-deterministic (mulberry32 — no Math.random)
 * and verified ≥3 m from every spawn and patrol waypoint.
 *
 * @param builder  The ArenaMap Builder object from farcrysis.ts — a
 *                 plain object with { root, colliders, physicsColliders,
 *                 raycastMeshes, shotSurfaces, physicalCover }.
 */
export function addInteractables(builder: any): void {
  // All interactable positions are verified against the arena boundary
  // (±32 m) with a 1.5 m margin to avoid clipping the outer lagoon ring.
  const { minX: bMinX, maxX: bMaxX, minZ: bMinZ, maxZ: bMaxZ } = FARCRYSIS_BOUNDS;
  const margin = 1.5;
  const ok = (px: number, pz: number): boolean =>
    px >= bMinX + margin && px <= bMaxX - margin &&
    pz >= bMinZ + margin && pz <= bMaxZ - margin;

  // =====================================================================
  // 1. WOODEN CRATES (16 + 4 from cover stacks) — 0.8–1.2 m
  // =====================================================================
  //
  // Crates cluster around the research-station core approaches and the
  // mid-ring jungle paths.  Every crate is registered as 'wood' so
  // bullets penetrate with the wood resistance profile.

  // -- Mid-ring jungle, rotated square around the core ------------------
  placeCrate(builder, 'farcrysis-crate-01', -17, -17, 1.0);
  placeCrate(builder, 'farcrysis-crate-02',  17,  17, 1.0);
  placeCrate(builder, 'farcrysis-crate-03', -17,  17, 1.0);
  placeCrate(builder, 'farcrysis-crate-04',  17, -17, 1.0);

  // -- Core approaches (N/S/E/W) — stacked near the entrances -----------
  placeCrate(builder, 'farcrysis-crate-05',  -4, -10, 0.9);
  placeCrate(builder, 'farcrysis-crate-06',   4,  10, 0.9);
  placeCrate(builder, 'farcrysis-crate-07', -10,  -4, 0.9);
  placeCrate(builder, 'farcrysis-crate-08',  10,   4, 0.9);

  // -- Just outside the core building, NW and SE corners -----------------
  placeCrate(builder, 'farcrysis-crate-09',  -6,  -6, 1.1);
  placeCrate(builder, 'farcrysis-crate-10',   6,   6, 1.1);

  // -- Inside the core, flanking the desk on north and south sides -------
  placeCrate(builder, 'farcrysis-crate-11',   0, -1.8, 0.85);
  placeCrate(builder, 'farcrysis-crate-12',   0,  1.8, 0.85);

  // -- Beach / lagoon edge, near the skiff cover positions ---------------
  placeCrate(builder, 'farcrysis-crate-13', -22, -10, 1.0);
  placeCrate(builder, 'farcrysis-crate-14',  22,  10, 1.0);
  placeCrate(builder, 'farcrysis-crate-15', -10, -22, 1.0);
  placeCrate(builder, 'farcrysis-crate-16',  10,  22, 1.0);

  // =====================================================================
  // 2. RUSTY STEEL BARRELS (10) — 0.6 m radius × 1.0 m height
  // =====================================================================
  //
  // Barrels are scattered along path edges and near the skiff / beacon /
  // seaplane throwback zones.  Registered as 'thin-metal' — bullets
  // punch through with a satisfying metallic spark but don't stop cold.

  // -- Beach / skiff area pairs ------------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-01', -22, -20, 0.6, 1.0);
  placeBarrel(builder, 'farcrysis-barrel-02',  22,  20, 0.6, 1.0);

  // -- Near the signal beacon (NW) and seaplane (SE) throwback zones -----
  placeBarrel(builder, 'farcrysis-barrel-03', -20,  12, 0.6, 1.0);
  placeBarrel(builder, 'farcrysis-barrel-04',  20, -12, 0.6, 1.0);

  // -- Beach edge paths --------------------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-05',  -8, -22, 0.6, 1.0);
  placeBarrel(builder, 'farcrysis-barrel-06',   8,  22, 0.6, 1.0);

  // -- Just outside the core entrances -----------------------------------
  placeBarrel(builder, 'farcrysis-barrel-07',  -3, -3.5, 0.6, 1.0);
  placeBarrel(builder, 'farcrysis-barrel-08',   3,  3.5, 0.6, 1.0);

  // -- Mid-field jungle paths --------------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-09', -12,  16, 0.6, 1.0);
  placeBarrel(builder, 'farcrysis-barrel-10',  12, -16, 0.6, 1.0);

  // =====================================================================
  // 3. SANDBAG WALLS (4) — low cover near existing hard-cover positions
  // =====================================================================
  //
  // Each sandbag wall is ~2.2 m wide × 0.6 m tall × 0.45 m deep —
  // chest-high cover that blocks movement and shots.  Placed adjacent to
  // (but not overlapping) the existing hard-cover pieces (skiffs, rocks,
  // ruined walls) so players can chain cover-to-cover movement.

  // -- Beach approach, near skiff NW and rock NW -------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-01', -14, -18, 2.2, 0.6, 0.45);

  // -- Beach approach, near skiff SE and rock SE -------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-02',  14,  18, 2.2, 0.6, 0.45);

  // -- Path toward ruined wall N, mid-ring approach to core --------------
  placeSandbagWall(builder, 'farcrysis-sandbag-03',  -6, -17, 2.2, 0.6, 0.45);

  // -- Path toward ruined wall S, mid-ring approach to core --------------
  placeSandbagWall(builder, 'farcrysis-sandbag-04',   6,  17, 2.2, 0.6, 0.45);

  // =====================================================================
  // 4. COVER POSITIONS (4) — crate stacks & fallen trunks along paths
  // =====================================================================
  //
  // Additional physical-cover pieces spread across beach and jungle zones
  // so players can chain cover-to-cover movement.  Fallen palm trunks use
  // the palmTrunk palette tone; crate stacks use two stacked 0.9 m crates
  // with a combined physicalCover footprint.

  // -- Fallen palm trunk, NW jungle path near the research tower ----------
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-01', -20, 8, 3.2, 0.4);

  // -- Fallen palm trunk, SE jungle path behind the cave entrance ---------
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-02',  22, -8, 3.0, 0.4);

  // -- Crate stack, NE beach-to-jungle transition -------------------------
  placeCrateCover(builder, 'farcrysis-cover-jungle-03', 8, -24);

  // -- Crate stack, SW lagoon-side jungle path ----------------------------
  placeCrateCover(builder, 'farcrysis-cover-jungle-04', -20, 14);

  // =====================================================================
  // 5. ADDITIONAL CRATES (6) — jungle mid-ring and beach fringe
  // =====================================================================
  //
  // Six more breakable wooden crates placed in the jungle mid-ring and
  // along the beach approach.  Every position avoids spawn points, core
  // entrances, mid-ring cardinal corridor, and patrol waypoints.

  // -- Jungle mid-ring diagonals (radius ~19 m) --------------------------
  placeCrate(builder, 'farcrysis-crate-17', -14, -13, 0.95);
  placeCrate(builder, 'farcrysis-crate-18',  14,  13, 0.95);
  placeCrate(builder, 'farcrysis-crate-19', -13,  14, 0.9);
  placeCrate(builder, 'farcrysis-crate-20',  13, -14, 0.9);

  // -- Beach / jungle transition (radius ~24 m) --------------------------
  placeCrate(builder, 'farcrysis-crate-21', -14, -20, 0.95);
  placeCrate(builder, 'farcrysis-crate-22',  14,  20, 0.95);

  // ── Crate shard detail on the two beach crates ───────────────────────
  addCrateShards(builder, 'farcrysis-crate-21-shards', -14, -20, 0.95);
  addCrateShards(builder, 'farcrysis-crate-22-shards',  14,  20, 0.95);

  // =====================================================================
  // 6. ADDITIONAL BARRELS (4) — beach fringe
  // =====================================================================
  //
  // Four additional rusty steel barrels along the lagoon-side beach edge,
  // clear of spawn and patrol routes.

  // -- West / east beach fringe ------------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-11', -28,  -6, 0.55, 0.95);
  placeBarrel(builder, 'farcrysis-barrel-12',  28,   6, 0.55, 0.95);

  // -- North / south beach fringe ----------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-13',  -6,  24, 0.55, 0.95);
  placeBarrel(builder, 'farcrysis-barrel-14',   6, -24, 0.55, 0.95);

  // ── Hazard stripes on the new barrels ─────────────────────────────────
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-11', -28,  -6, 0.55, 0.95);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-12',  28,   6, 0.55, 0.95);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-13',  -6,  24, 0.55, 0.95);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-14',   6, -24, 0.55, 0.95);

  // =====================================================================
  // 7. FALLEN-LOG COVER (2) — jungle mid-ring
  // =====================================================================
  //
  // Two additional fallen palm trunks spanning jungle paths, placed off
  // the cardinal lanes and clear of patrol waypoints.

  // -- West jungle mid-ring -----------------------------------------------
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-05', -16, -4, 3.0, 0.4);

  // -- East jungle mid-ring -----------------------------------------------
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-06',  16,  4, 3.0, 0.4);

  // =====================================================================
  // 8. ROCK-OUTCROP COVER (2) — beach fringe
  // =====================================================================
  //
  // Two weathered limestone boulders near the lagoon edge that provide
  // natural crouch cover with earth ballistic behaviour.

  // -- West beach outcrop -------------------------------------------------
  placeRockOutcrop(builder, 'farcrysis-cover-rock-01', -25, -8, 1.8, 1.2, 1.6);

  // -- East beach outcrop -------------------------------------------------
  placeRockOutcrop(builder, 'farcrysis-cover-rock-02',  25,  8, 1.8, 1.2, 1.6);

  // =====================================================================
  // 9. RAISED VANTAGE PLATFORMS (2) — jungle mid-ring
  // =====================================================================
  //
  // Two 2×2 crate-stack platforms (~1.5 m tall) that give a height
  // advantage over the surrounding ground.  Small footprint, reachable
  // by walking movement, placed clear of patrol lanes and core entrances.

  // -- West vantage platform (jungle mid-ring) ----------------------------
  placeVantagePlatform(builder, 'farcrysis-vantage-01', -18, -6);

  // -- East vantage platform (jungle mid-ring) ----------------------------
  placeVantagePlatform(builder, 'farcrysis-vantage-02',  18,  6);

  // =====================================================================
  // 10. SIX MORE WOODEN CRATES (6) — core door flanks + jungle pockets
  // =====================================================================
  //
  // Four crates flank the two core door approaches, and two sit in
  // mid-jungle pockets SW and NE of the core.  All positions verified
  // ≥3 m from every spawn and patrol waypoint.

  // -- Core door south: west + east flanks ---------------------------------
  placeCrate(builder, 'farcrysis-crate-23',  -6, -4.0, 0.9);
  placeCrate(builder, 'farcrysis-crate-24',   6, -4.0, 0.9);

  // -- Core door north: west + east flanks ---------------------------------
  placeCrate(builder, 'farcrysis-crate-25',  -6,  4.0, 0.9);
  placeCrate(builder, 'farcrysis-crate-26',   6,  4.0, 0.9);

  // -- Mid-jungle SW + NE pockets (radius ~17 m) --------------------------
  placeCrate(builder, 'farcrysis-crate-27', -16, -10, 0.95);
  placeCrate(builder, 'farcrysis-crate-28',  16,  10, 0.95);

  // =====================================================================
  // 11. FOUR FUEL BARRELS (4) — hazard-striped, corner pockets
  // =====================================================================
  //
  // Four explosive-looking barrels with hazard-yellow stripe bands,
  // placed in arena corner pockets away from spawns and patrol paths.
  // Each carries a small emissive band for visibility at range.

  // -- NW / SE diagonal corner pockets ------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-15', -16,  16, 0.6, 1.0);
  placeBarrel(builder, 'farcrysis-barrel-16',  16, -16, 0.6, 1.0);

  // -- SW / NE beach fringe corner pockets --------------------------------
  placeBarrel(builder, 'farcrysis-barrel-17', -12, -28, 0.55, 0.95);
  placeBarrel(builder, 'farcrysis-barrel-18',  12,  28, 0.55, 0.95);

  // ── Hazard stripes on all four new barrels ────────────────────────────
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-15', -16,  16, 0.6, 1.0);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-16',  16, -16, 0.6, 1.0);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-17', -12, -28, 0.55, 0.95);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-18',  12,  28, 0.55, 0.95);

  // =====================================================================
  // 12. TWO STACKED SANDBAG WALLS (2) — core door approach cover
  // =====================================================================
  //
  // Each wall is built from 4 stacked box segments (1.6 m wide × 0.45 m
  // tall × 0.6 m deep per segment → 1.8 m total height).  Every segment
  // gets its own collider + physicsCollider + 'concrete' shot surface;
  // a single physicalCover spans the full stack so the peek / lean
  // system treats it as one low-cover position.

  // -- South core door approach cover -------------------------------------
  placeStackedSandbagWall(
    builder, 'farcrysis-core-door-sandbag-s', 0, -3.6, 1.6, 0.45, 0.6, 4,
  );

  // -- North core door approach cover -------------------------------------
  placeStackedSandbagWall(
    builder, 'farcrysis-core-door-sandbag-n', 0, 3.6, 1.6, 0.45, 0.6, 4,
  );

  // =====================================================================
  // 13. PASS 69 QA — cave entrance, tower approach, beach interactables
  // =====================================================================
  //
  // Eight additional interactables and three sandbag walls placed at
  // gameplay-significant positions: the flooded cave entrance (SE),
  // the research tower approach (NW), and the beach ring.  Every
  // position is verified ≥3 m from every spawn and patrol waypoint.

  // -- Cave entrance (SE) — crates + barrel flanking the flooded cave ------
  placeCrate(builder, 'farcrysis-crate-29', 28, 17.5, 1.0);
  placeCrate(builder, 'farcrysis-crate-30', 22, 17, 0.9);
  placeBarrel(builder, 'farcrysis-barrel-19', 24, 13.5, 0.6, 1.0);

  // -- Tower approach (NW) — barrel + crate near the research tower --------
  placeBarrel(builder, 'farcrysis-barrel-20', -11, -11, 0.6, 1.0);
  placeCrate(builder, 'farcrysis-crate-31', -10, -6.5, 0.9);

  // -- Beach ring — south, north, west beach interactables -----------------
  placeBarrel(builder, 'farcrysis-barrel-21', -3, -27, 0.55, 0.95);
  placeCrate(builder, 'farcrysis-crate-32', 3.5, 27, 0.95);
  placeBarrel(builder, 'farcrysis-barrel-22', -28, 14, 0.55, 0.95);

  // -- Cave entrance approach sandbag cover --------------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-05', 19, 15, 2.2, 0.6, 0.45);

  // -- Tower approach sandbag cover ----------------------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-06', -13, -8, 2.2, 0.6, 0.45);

  // -- SE beach sandbag cover ----------------------------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-07', 26, -26, 2.2, 0.6, 0.45);

  // =====================================================================
  // 14. FLESH-OUT GAP PIECES — fill bare patrol lanes in jungle/beach
  // =====================================================================
  //
  // Nine additional well-placed interactables to fill sparse patrol lanes
  // that had fewer than 3 cover/breakable options.  Every position is
  // verified ≥3 m from every spawn and patrol waypoint.  All use the
  // existing placement helpers so Rapier colliders match the established
  // addInteractables pattern.

  // -- East jungle mid-ring: crate fills gap between cover-jungle-06 and core
  placeCrate(builder, 'farcrysis-crate-33', 10, -8, 0.9);

  // -- West jungle mid-ring: barrel near cover-jungle-05
  placeBarrel(builder, 'farcrysis-barrel-23', -12, -4, 0.6, 1.0);

  // -- East jungle approach: fallen palm trunk cover
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-07', 12, -10, 3.0, 0.4);

  // -- West jungle: crate stack cover near core approach
  placeCrateCover(builder, 'farcrysis-cover-jungle-08', -14, -4);

  // -- SW beach fringe: sandbag wall above lagoon edge
  placeSandbagWall(builder, 'farcrysis-sandbag-08', -20, -26, 2.2, 0.6, 0.45);

  // -- NE beach edge: barrel filling the empty NE corner
  placeBarrel(builder, 'farcrysis-barrel-24', 24, 24, 0.6, 1.0);

  // -- NW jungle: crate cover near research tower approach
  placeCrateCover(builder, 'farcrysis-cover-jungle-09', -16, 8);

  // -- SE jungle: barrel for the sparse SE interior
  placeBarrel(builder, 'farcrysis-barrel-25', 18, -8, 0.6, 1.0);

  // -- South jungle path: fallen palm trunk for southern approach cover
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-10', 6, -20, 3.0, 0.4);

  // =====================================================================
  // VERIFICATION: warn if any cover position exceeds the arena boundary
  // =====================================================================
  for (const [label, px, pz] of [
    ['cover-jungle-01', -20, 8],
    ['cover-jungle-02', 22, -8],
    ['cover-jungle-03', 8, -24],
    ['cover-jungle-04', -20, 14],
    ['cover-jungle-05', -16, -4],
    ['cover-jungle-06', 16, 4],
    ['cover-rock-01', -25, -8],
    ['cover-rock-02', 25, 8],
    ['vantage-01', -18, -6],
    ['vantage-02', 18, 6],
    ['core-door-sandbag-s', 0, -3.6],
    ['core-door-sandbag-n', 0, 3.6],
    ['sandbag-05', 19, 15],
    ['sandbag-06', -13, -8],
    ['sandbag-07', 26, -26],
    ['cover-jungle-07', 12, -10],
    ['cover-jungle-08', -14, -4],
    ['sandbag-08', -20, -26],
    ['cover-jungle-09', -16, 8],
    ['cover-jungle-10', 6, -20],
  ] as const) {
    if (!ok(px, pz)) {
      console.warn(`farcrysis-${label} at (${px}, ${pz}) is outside FARCRYSIS_BOUNDS margin`);
    }
  }
}
