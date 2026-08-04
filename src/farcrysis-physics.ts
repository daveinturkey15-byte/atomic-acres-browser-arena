/**
 * farcrysis-physics.ts — Rapier-aligned physics interactables for the Farcrysis arena.
 *
 * Exports addInteractables(builder) which places breakable crates, barrels, and
 * sandbag cover walls into the arena.  Every object follows the existing box()
 * pattern from farcrysis.ts: create THREE.Mesh, push to builder.physicsColliders,
 * builder.raycastMeshes, builder.shotSurfaces (plus builder.colliders and
 * builder.physicalCover where appropriate).  The Rapier physics world and the
 * ballistic-authority system pick up every entry without any extra wiring.
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
  const y = size / 2;     // sit on the ground plane (bottom at y=0)

  // Main body — wood-brown box
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: crateMat.metalness });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'wood', false);

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
  const y = height / 2;  // sit on the ground plane

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
  const y = height / 2;

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
}

// ---------------------------------------------------------------------------
// Main entry point — called once from buildFarcrysis()
// ---------------------------------------------------------------------------

/**
 * Adds physics-backed interactables to the Farcrysis arena Builder.
 *
 * Places 16 crates, 10 barrels, and 4 sandbag walls distributed near
 * building interiors and along path edges.  All spawn-safe zones
 * (±24–26 m corners) are deliberately avoided so no interactable
 * overlaps a player spawn point.
 *
 * @param builder  The ArenaMap Builder object from farcrysis.ts — a
 *                 plain object with { root, colliders, physicsColliders,
 *                 raycastMeshes, shotSurfaces, physicalCover }.
 */
export function addInteractables(builder: any): void {
  // =====================================================================
  // 1. WOODEN CRATES (16) — 0.8–1.2 m, placed near paths and the core
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
}
