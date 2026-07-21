import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { classifyImpactSurface } from './combat-feedback';
import type { Box2 } from './collision';
import type { ArenaMap, PracticeTarget } from './map';
import type { Team } from './protocol';

type Builder = {
  root: THREE.Group;
  colliders: Box2[];
  physicsColliders: Box2[];
  raycastMeshes: THREE.Object3D[];
};

export const GUN_RANGE_FIRING_LINE_Z = 1.2;
export const GUN_RANGE_FIRING_LINE_BARRIER: Readonly<Box2> = Object.freeze({
  minX: -15,
  maxX: 15,
  minZ: GUN_RANGE_FIRING_LINE_Z - 0.25,
  maxZ: GUN_RANGE_FIRING_LINE_Z + 0.25,
  minY: -2,
  maxY: 8,
});

const standard = (color: number, roughness = 0.86, metalness = 0.08): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  options: { solid?: boolean; shots?: boolean; rotation?: [number, number, number]; cast?: boolean } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.cast !== false;
  mesh.receiveShadow = true;
  mesh.userData.impactSurface = classifyImpactSurface({
    name,
    metalness: material instanceof THREE.MeshStandardMaterial ? material.metalness : undefined,
  });
  builder.root.add(mesh);
  const solid = options.solid !== false;
  const shots = options.shots ?? solid;
  mesh.userData.presentationBatchCandidate = !solid && !shots;
  if (shots) builder.raycastMeshes.push(mesh);
  if (solid) {
    const bounds: Box2 = {
      minX: position[0] - size[0] / 2,
      maxX: position[0] + size[0] / 2,
      minZ: position[2] - size[2] / 2,
      maxZ: position[2] + size[2] / 2,
      minY: position[1] - size[1] / 2,
      maxY: position[1] + size[1] / 2,
      rotation: options.rotation,
    };
    builder.colliders.push(bounds);
    builder.physicsColliders.push(bounds);
  }
  return mesh;
}

type SingleMaterialMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

type PresentationBatchTelemetry = Readonly<{
  sourceMeshes: number;
  batches: number;
  savedDrawCalls: number;
}>;

/**
 * Collapse decorative box meshes by material/shadow state while retaining the
 * named hidden source nodes for semantic inspection. Collision and shot meshes
 * are deliberately excluded: only non-solid, non-raycast presentation detail
 * enters these static batches.
 */
function batchPresentationOnlyBoxes(root: THREE.Group): PresentationBatchTelemetry {
  const groups = new Map<string, {
    material: THREE.Material;
    castShadow: boolean;
    receiveShadow: boolean;
    meshes: SingleMaterialMesh[];
  }>();
  const candidates: SingleMaterialMesh[] = [];
  for (const node of root.children) {
    if (!(node instanceof THREE.Mesh)
      || node.userData.presentationBatchCandidate !== true
      || !(node.geometry instanceof THREE.BoxGeometry)
      || Array.isArray(node.material)) continue;
    candidates.push(node as SingleMaterialMesh);
  }

  for (const mesh of candidates) {
    const material = mesh.material as THREE.Material;
    const key = `${material.uuid}:${Number(mesh.castShadow)}:${Number(mesh.receiveShadow)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.meshes.push(mesh);
      continue;
    }
    groups.set(key, {
      material,
      castShadow: mesh.castShadow,
      receiveShadow: mesh.receiveShadow,
      meshes: [mesh],
    });
  }

  let sourceMeshes = 0;
  let batches = 0;
  for (const group of groups.values()) {
    if (group.meshes.length < 2) continue;
    const transformed = group.meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(transformed, false);
    transformed.forEach((entry) => entry.dispose());
    if (!geometry) continue;
    const batch = new THREE.Mesh(geometry, group.material);
    batch.name = `rustworks-presentation-batch-${batches}`;
    batch.castShadow = group.castShadow;
    batch.receiveShadow = group.receiveShadow;
    batch.userData.presentationOnly = true;
    batch.userData.staticBatchRendered = true;
    batch.userData.sourceMeshes = group.meshes.length;
    root.add(batch);
    for (const mesh of group.meshes) {
      mesh.visible = false;
      mesh.userData.staticBatchRendered = true;
    }
    sourceMeshes += group.meshes.length;
    batches += 1;
  }

  return {
    sourceMeshes,
    batches,
    savedDrawCalls: Math.max(0, sourceMeshes - batches),
  };
}

function emptyTelemetry(): ArenaMap['houseTelemetry'] {
  return {
    houses: 0,
    groundRooms: 0,
    upperRooms: 0,
    doors: 0,
    windows: 0,
    ramps: 0,
    wallMaterialVariants: 0,
    pbrMaterialFamilies: 0,
  };
}

function spawnRecord(team0: readonly [number, number][], team1: readonly [number, number][]): Record<Team, THREE.Vector3[]> {
  return {
    0: team0.map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
    1: team1.map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
  };
}

/** Shared Rustworks tower metrics used by map build, tests, and Blender parity notes. */
export const RUSTWORKS_TOWER = Object.freeze({
  lowerDeckCenterY: 3.35,
  upperDeckCenterY: 8.15,
  deckThickness: 0.34 as number,
  lowerDeckSize: 8.4,
  upperDeckSize: 6.8,
  /** Character controller climb limit is 50°; ship-ladder stays strictly under it. */
  shipLadderAngleDegrees: 48,
  lowerRampAngleDegrees: 22,
  maxClimbDegrees: 50,
  landingOverlap: 0.06,
  maxLandingOverlap: 0.08,
  maxTransitionLip: 0.1,
});

export function rustworksDeckTopY(centerY: number, thickness: number = RUSTWORKS_TOWER.deckThickness): number {
  return centerY + thickness / 2;
}

/**
 * Original compact industrial tower duel. It translates the high-level pacing
 * of classic small vertical arenas without reproducing any commercial layout.
 * Pass 40 keeps Performance-mode authority on procedural geometry: coherent
 * ramp landings, a walkable ship-ladder between decks, and denser industrial read.
 */
export function buildRustworks1v1(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Rustworks 1V1 arena';
  scene.add(root);
  const builder: Builder = { root, colliders: [], physicsColliders: [], raycastMeshes: [] };
  const sand = standard(0x8a5f42, 1, 0);
  const packed = standard(0x6e5a48, 0.98, 0.02);
  const rust = standard(0x7a3924, 0.82, 0.42);
  const rustDark = standard(0x3c2924, 0.9, 0.35);
  const steel = standard(0x59656a, 0.58, 0.62);
  const steelBright = standard(0x6d7a80, 0.48, 0.72);
  const hazard = standard(0xd7972d, 0.72, 0.34);
  const hazardDark = standard(0x8a5a18, 0.8, 0.28);
  const concrete = standard(0x77756d, 0.98, 0.03);
  const concreteDark = standard(0x5c5a54, 0.96, 0.04);
  const tarp = standard(0x315665, 0.94, 0.02);
  const oxide = standard(0x4a2c22, 0.9, 0.3);
  const grate = standard(0x4e585c, 0.62, 0.55);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(56, 60), sand);
  ground.name = 'rustworks-compacted-earth';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.impactSurface = 'soil';
  root.add(ground);
  builder.raycastMeshes.push(ground);

  // Hardstand under the tower + lane chevrons for industrial ground read.
  box(builder, 'rustworks-tower-hardstand', [0, 0.04, 0], [18, 0.08, 18], packed, { solid: false, cast: false });
  box(builder, 'rustworks-service-lane', [0, 0.05, -16], [8.5, 0.06, 18], concreteDark, { solid: false, cast: false });
  for (const z of [-24, -18, -12, 12, 18, 24]) {
    box(builder, 'rustworks-ground-chevron', [0, 0.055, z], [3.2, 0.04, 0.55], hazardDark, { solid: false, cast: false, shots: false });
  }
  for (const x of [-10.5, 10.5]) {
    box(builder, 'rustworks-ground-marking', [x, 0.055, 0], [0.45, 0.04, 14], hazard, { solid: false, cast: false, shots: false });
  }

  // Perimeter corrugated barrier with intermittent posts and gate recesses.
  for (const [x, z, sx, sz] of [
    [0, -29.5, 56, 1], [0, 29.5, 56, 1], [-27.5, 0, 1, 60], [27.5, 0, 1, 60],
  ] as const) box(builder, 'rustworks-perimeter-sheeting', [x, 2.2, z], [sx, 4.4, sz], rustDark);
  for (const [x, z] of [
    [-18, -29.2], [-6, -29.2], [6, -29.2], [18, -29.2],
    [-18, 29.2], [-6, 29.2], [6, 29.2], [18, 29.2],
    [-27.2, -18], [-27.2, 0], [-27.2, 18],
    [27.2, -18], [27.2, 0], [27.2, 18],
  ] as const) {
    box(builder, 'rustworks-perimeter-post', [x, 2.4, z], [0.42, 4.8, 0.42], steel, { solid: false });
  }
  for (const [x, z, sx, sz] of [
    [-12, -29.15, 4.5, 0.35], [12, 29.15, 4.5, 0.35], [-27.15, 10, 0.35, 4.5], [27.15, -10, 0.35, 4.5],
  ] as const) {
    box(builder, 'rustworks-perimeter-gate-recess', [x, 1.5, z], [sx, 3.0, sz], hazardDark, { solid: false });
  }

  const {
    lowerDeckCenterY,
    upperDeckCenterY,
    deckThickness,
    lowerDeckSize,
    upperDeckSize,
    shipLadderAngleDegrees,
    lowerRampAngleDegrees,
    landingOverlap,
  } = RUSTWORKS_TOWER;
  const lowerTop = rustworksDeckTopY(lowerDeckCenterY, deckThickness);
  const upperTop = rustworksDeckTopY(upperDeckCenterY, deckThickness);
  const lowerHalf = lowerDeckSize / 2;

  // Four-leg processing tower with denser structural silhouette.
  for (const x of [-3.2, 3.2]) for (const z of [-3.2, 3.2]) {
    box(builder, 'rustworks-tower-leg', [x, 5.4, z], [0.58, 10.8, 0.58], steelBright);
    box(builder, 'rustworks-tower-leg-base', [x, 0.35, z], [1.1, 0.7, 1.1], concrete);
  }
  // X-bracing stays outside the walkable deck cores so rotations stay open.
  for (const z of [-3.35, 3.35]) {
    for (const [y0, y1] of [[0.55, 3.1], [3.7, 7.85], [8.45, 11.1]] as const) {
      const midY = (y0 + y1) / 2;
      const rise = y1 - y0;
      const run = 6.4;
      const length = Math.hypot(run, rise);
      const angle = Math.atan2(rise, run);
      box(builder, 'rustworks-structural-brace', [0, midY, z], [length, 0.14, 0.14], rust, {
        solid: false,
        rotation: [0, 0, angle],
      });
      box(builder, 'rustworks-structural-brace', [0, midY, z], [length, 0.14, 0.14], oxide, {
        solid: false,
        rotation: [0, 0, -angle],
      });
    }
  }
  for (const x of [-3.35, 3.35]) {
    for (const [y0, y1] of [[0.55, 3.1], [3.7, 7.85], [8.45, 11.1]] as const) {
      const midY = (y0 + y1) / 2;
      const rise = y1 - y0;
      const run = 6.4;
      const length = Math.hypot(run, rise);
      const angle = Math.atan2(rise, run);
      box(builder, 'rustworks-structural-brace', [x, midY, 0], [0.14, 0.14, length], steel, {
        solid: false,
        rotation: [angle, 0, 0],
      });
      box(builder, 'rustworks-structural-brace', [x, midY, 0], [0.14, 0.14, length], steel, {
        solid: false,
        rotation: [-angle, 0, 0],
      });
    }
  }

  box(builder, 'rustworks-lower-deck', [0, lowerDeckCenterY, 0], [lowerDeckSize, deckThickness, lowerDeckSize], grate);
  box(builder, 'rustworks-upper-deck', [0, upperDeckCenterY, 0], [upperDeckSize, deckThickness, upperDeckSize], rust);
  box(builder, 'rustworks-control-hut', [-1.35, 9.55, -1.45], [2.6, 2.5, 2.4], rustDark);
  box(builder, 'rustworks-control-hut-awning', [-1.35, 10.95, -0.35], [2.8, 0.16, 1.3], hazard, { solid: false });
  box(builder, 'rustworks-process-manifold', [1.55, 9.35, 1.85], [1.2, 1.7, 1.2], steel);
  box(builder, 'rustworks-lower-deck-grating-trim', [0, lowerTop + 0.02, 0], [lowerDeckSize - 0.5, 0.04, lowerDeckSize - 0.5], steel, {
    solid: false,
    cast: false,
  });

  // Ground → lower deck ramp on -Z with explicit foot/top landings (≤50°).
  const lowerRampAngle = (lowerRampAngleDegrees * Math.PI) / 180;
  const lowerRampLength = (lowerTop - 0.12) / Math.sin(lowerRampAngle);
  const lowerRampThickness = 0.28;
  const lowerRampWidth = 3.2;
  const lowerLandingDepth = 1.35;
  const lowerDeckEdgeZ = -lowerHalf;
  const lowerLandingCenterZ = lowerDeckEdgeZ - lowerLandingDepth / 2 + landingOverlap;
  const lowerRampTopZ = lowerLandingCenterZ - lowerLandingDepth / 2 + landingOverlap;
  const lowerRampCenterZ = lowerRampTopZ - Math.cos(lowerRampAngle) * (lowerRampLength / 2);
  // Center Y so the uphill top surface meets lowerTop within lip tolerance.
  const lowerRampPosY = lowerTop
    - Math.sin(lowerRampAngle) * (lowerRampLength / 2)
    - Math.cos(lowerRampAngle) * (lowerRampThickness / 2);

  box(builder, 'rustworks-lower-ramp-foot-pad', [0, 0.08, lowerRampCenterZ - Math.cos(lowerRampAngle) * (lowerRampLength / 2) - 0.55], [lowerRampWidth + 0.6, 0.16, 1.4], concrete);
  box(
    builder,
    'rustworks-lower-ramp',
    [0, lowerRampPosY, lowerRampCenterZ],
    [lowerRampWidth, lowerRampThickness, lowerRampLength],
    steelBright,
    { rotation: [-lowerRampAngle, 0, 0] },
  );
  box(
    builder,
    'rustworks-lower-ramp-landing',
    [0, lowerDeckCenterY, lowerLandingCenterZ],
    [lowerRampWidth + 0.35, deckThickness, lowerLandingDepth],
    grate,
  );
  for (const side of [-1, 1] as const) {
    box(
      builder,
      'rustworks-lower-ramp-rail',
      [side * (lowerRampWidth / 2 + 0.12), lowerRampPosY + 0.55, lowerRampCenterZ],
      [0.1, 0.1, lowerRampLength],
      hazard,
      { solid: false, rotation: [-lowerRampAngle, 0, 0] },
    );
  }

  // Steep industrial ship-ladder on the +X rim. The climb runs along Z outside the
  // upper-deck footprint so the capsule never tunnels under the upper slab, then a
  // short bridge steps inward onto the upper deck. Continuous collision, no use-key.
  const shipAngle = (shipLadderAngleDegrees * Math.PI) / 180;
  const shipRise = upperTop - lowerTop;
  const shipRun = shipRise / Math.tan(shipAngle);
  const shipLength = shipRise / Math.sin(shipAngle);
  const shipThickness = 0.22;
  const shipWidth = 1.5;
  // Keep the walking line just outside the upper deck (half = 3.4) while still on the lower deck (half = 4.2).
  const shipX = lowerHalf - 0.3;
  const lowerShipLandingDepth = 1.15;
  const upperOutboardLandingDepth = 1.2;
  // Positive X rotation: local +Z is downhill, local -Z is uphill.
  const shipRotation: [number, number, number] = [shipAngle, 0, 0];
  const shipLowZ = lowerHalf - 0.15;
  const shipLowerLandingCenterZ = shipLowZ + lowerShipLandingDepth / 2 - landingOverlap;
  const shipLowSurfaceZ = shipLowerLandingCenterZ - lowerShipLandingDepth / 2 + landingOverlap;
  const shipHighSurfaceZ = shipLowSurfaceZ - shipRun;
  const shipCenterZ = (shipLowSurfaceZ + shipHighSurfaceZ) / 2;
  const shipPosY = (lowerTop + upperTop) / 2 - Math.cos(shipAngle) * (shipThickness / 2);
  const upperHalf = upperDeckSize / 2;
  const upperOutboardCenterZ = shipHighSurfaceZ - upperOutboardLandingDepth / 2 + landingOverlap;
  const upperBridgeCenterX = (shipX + upperHalf - 0.15) / 2;

  box(
    builder,
    'rustworks-ship-ladder-lower-landing',
    [shipX, lowerDeckCenterY, shipLowerLandingCenterZ],
    [shipWidth + 0.4, deckThickness, lowerShipLandingDepth],
    grate,
  );
  box(
    builder,
    'rustworks-ship-ladder',
    [shipX, shipPosY, shipCenterZ],
    [shipWidth, shipThickness, shipLength],
    steelBright,
    { rotation: shipRotation },
  );
  box(
    builder,
    'rustworks-ship-ladder-upper-landing',
    [shipX, upperDeckCenterY, upperOutboardCenterZ],
    [shipWidth + 0.35, deckThickness, upperOutboardLandingDepth],
    rust,
  );
  box(
    builder,
    'rustworks-upper-access',
    [upperBridgeCenterX, upperDeckCenterY, upperOutboardCenterZ],
    [Math.abs(shipX - (upperHalf - 0.15)) + 0.35, deckThickness, upperOutboardLandingDepth],
    grate,
  );
  for (const side of [-1, 1] as const) {
    box(
      builder,
      `rustworks-ship-ladder-rail-${side < 0 ? 'west' : 'east'}`,
      [shipX + side * (shipWidth / 2 + 0.08), shipPosY + 0.62, shipCenterZ],
      [0.09, 0.09, shipLength],
      hazard,
      { solid: false, rotation: shipRotation },
    );
  }
  // Presentation rungs — collision stays on the continuous walking slab.
  const rungCount = 9;
  for (let index = 0; index < rungCount; index += 1) {
    const t = (index + 0.5) / rungCount;
    const z = shipLowSurfaceZ - shipRun * t;
    const y = lowerTop + shipRise * t + 0.04;
    box(builder, `rustworks-ship-ladder-rung-${index}`, [shipX, y, z], [shipWidth - 0.12, 0.08, 0.1], hazard, {
      solid: false,
    });
  }
  for (const side of [-1, 1] as const) {
    box(
      builder,
      'rustworks-ship-ladder-stringer',
      [shipX + side * (shipWidth / 2 + 0.02), shipPosY - 0.08, shipCenterZ],
      [0.08, 0.18, shipLength + 0.08],
      oxide,
      { solid: false, rotation: shipRotation },
    );
  }

  // Thin visual safety rails, intentionally non-solid/non-raycast so bullets and
  // movement are governed by the deck/access authority rather than invisible
  // rail proxies. Split the bars around both authored access corridors.
  const lowerRailY = lowerTop + 1.2;
  box(builder, 'rustworks-lower-deck-rail', [-4.15, lowerRailY, 0.1], [0.12, 0.12, 7.6], hazard, { solid: false });
  box(builder, 'rustworks-lower-deck-rail', [4.15, lowerRailY, -0.35], [0.12, 0.12, 5.4], hazard, { solid: false });
  // Leave a clear centre opening wider than the lower ramp landing so posts never
  // silhouette across the authored access corridor.
  box(builder, 'rustworks-lower-deck-rail', [-3.15, lowerRailY, -4.15], [2.0, 0.12, 0.12], hazard, { solid: false });
  box(builder, 'rustworks-lower-deck-rail', [3.15, lowerRailY, -4.15], [2.0, 0.12, 0.12], hazard, { solid: false });
  box(builder, 'rustworks-lower-deck-rail', [-0.6, lowerRailY, 4.15], [6.2, 0.12, 0.12], hazard, { solid: false });
  for (const [x, z] of [
    [-4.15, -4.15], [-2.15, -4.15], [2.15, -4.15], [4.15, -4.15],
    [-4.15, 4.15], [2.5, 4.15], [4.15, 2.35],
  ] as const) {
    box(builder, 'rustworks-lower-deck-rail-post', [x, lowerTop + 0.62, z], [0.12, 1.2, 0.12], hazard, { solid: false });
  }

  const upperRailY = upperTop + 1.2;
  for (const z of [-3.35, 3.35]) {
    box(builder, 'rustworks-upper-deck-rail', [-0.1, upperRailY, z], [6.0, 0.12, 0.12], hazard, { solid: false });
  }
  box(builder, 'rustworks-upper-deck-rail', [-3.35, upperRailY, -0.15], [0.12, 0.12, 5.9], hazard, { solid: false });
  box(builder, 'rustworks-upper-deck-rail', [3.35, upperRailY, -2.45], [0.12, 0.12, 1.8], hazard, { solid: false });
  box(builder, 'rustworks-upper-deck-rail', [3.35, upperRailY, 1.675], [0.12, 0.12, 3.35], hazard, { solid: false });
  for (const [x, z] of [
    [-3.35, -3.35], [2.9, -3.35], [-3.35, 3.35], [2.9, 3.35],
    [3.35, -3.35], [3.35, -1.55], [3.35, 0], [3.35, 3.35],
  ] as const) {
    box(builder, 'rustworks-upper-deck-rail-post', [x, upperTop + 0.62, z], [0.12, 1.2, 0.12], hazard, { solid: false });
  }

  // Crown, crane, and process risers — readable silhouette without blocking decks.
  box(builder, 'rustworks-tower-crown-beam', [0, 12.35, 0], [7.2, 0.28, 7.2], rust, { solid: false });
  box(builder, 'rustworks-tower-crown-ridge', [0, 12.85, 0], [0.35, 0.7, 7.4], hazard, { solid: false });
  for (const x of [-2.7, 2.7]) for (const z of [-2.7, 2.7]) {
    box(builder, 'rustworks-canopy-post', [x, 11.4, z], [0.18, 2.4, 0.18], steel, { solid: false });
  }
  box(builder, 'rustworks-crane-boom', [-5.5, 13.4, 0], [11.5, 0.38, 0.38], steelBright, { solid: false });
  box(builder, 'rustworks-crane-cable', [-10.9, 9.8, 0], [0.12, 7.2, 0.12], rustDark, { solid: false });
  box(builder, 'rustworks-crane-hook', [-10.9, 6.2, 0], [0.35, 0.55, 0.28], rust, { solid: false });
  for (const x of [-1.35, 1.35]) {
    box(builder, 'rustworks-process-riser', [x, 6.1, -3.05], [0.38, 10.2, 0.38], oxide, { solid: false });
    box(builder, 'rustworks-process-riser-cap', [x, 11.35, -3.05], [0.55, 0.28, 0.55], rust, { solid: false });
  }
  for (const [x, y, z, sx, sy, sz] of [
    [-2.4, 4.6, 2.6, 1.8, 0.32, 0.32],
    [2.1, 6.8, -2.4, 0.32, 0.32, 2.2],
    [0.2, 10.2, 2.4, 2.6, 0.28, 0.28],
  ] as const) {
    box(builder, 'rustworks-process-pipe-run', [x, y, z], [sx, sy, sz], steel, { solid: false });
  }

  // Asymmetric outer cover — crates, tanks, barriers, pallets, spools.
  for (const [x, z, color, sx, sy, sz] of [
    [-18, -18, tarp, 4.0, 2.5, 7.2],
    [-13.5, -18, rust, 3.6, 2.3, 6.4],
    [17, 19, hazard, 4.0, 2.5, 7.2],
    [12.5, 19, rustDark, 3.6, 2.2, 6.0],
    // Keep clear of team spawn capsules near the corners.
    [-20, 12, oxide, 3.2, 1.8, 3.8],
    [20, -12, tarp, 3.2, 1.8, 3.8],
  ] as const) {
    box(builder, 'rustworks-freight-crate', [x, sy / 2, z], [sx, sy, sz], color);
    box(builder, 'rustworks-crate-lid', [x, sy + 0.08, z], [sx + 0.15, 0.16, sz + 0.15], steel, { solid: false });
  }
  for (const [x, z] of [[-19, 9], [19, -10], [0, 22]] as const) {
    box(builder, 'rustworks-tank-collider', [x, 1.7, z], [4.0, 3.4, 4.0], steel);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3.2, 12), rust);
    tank.name = 'rustworks-horizontal-process-tank';
    tank.rotation.z = Math.PI / 2;
    tank.position.set(x, 1.7, z);
    tank.castShadow = true;
    tank.receiveShadow = true;
    tank.userData.presentationOnly = true;
    tank.userData.impactSurface = 'metal';
    root.add(tank);
    box(builder, 'rustworks-tank-saddle', [x - 1.2, 0.45, z], [0.35, 0.9, 2.2], concrete, { solid: false });
    box(builder, 'rustworks-tank-saddle', [x + 1.2, 0.45, z], [0.35, 0.9, 2.2], concrete, { solid: false });
  }
  for (const [x, z, sx, sz] of [
    [-9, 12, 6, 2.1], [10, -14, 7, 2.1], [-15, -3, 3.8, 2.6], [15, 4, 3.8, 2.6],
    [-5.5, 20, 5.2, 2.0], [6, -22, 5.2, 2.0], [8, 8, 2.8, 2.4], [-7, -7, 2.8, 2.4],
  ] as const) {
    box(builder, 'rustworks-scrap-cover', [x, 1.0, z], [sx, 2.0, sz], concrete);
    box(builder, 'rustworks-cover-detail-beam', [x, 2.15, z], [Math.min(sx, 3.2), 0.18, 0.22], hazard, { solid: false });
  }
  for (const [x, z] of [[-8.5, -11], [9, 11], [-20, 20], [20, -20], [14, 8], [-14, -8]] as const) {
    box(builder, 'rustworks-pipe-bundle-collider', [x, 0.8, z], [3.2, 1.6, 3.2], rustDark);
    for (const offset of [-0.85, 0, 0.85]) {
      const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.12, 6, 12), steel);
      pipe.name = 'rustworks-pipe-opening';
      pipe.position.set(x + offset, 0.82, z - 1.62);
      pipe.rotation.x = Math.PI / 2;
      pipe.userData.presentationOnly = true;
      root.add(pipe);
    }
  }
  for (const [x, z] of [[-11, 4], [11, -5], [-4, 16], [5, -17]] as const) {
    box(builder, 'rustworks-pallet-stack', [x, 0.45, z], [1.6, 0.9, 1.2], oxide);
    box(builder, 'rustworks-cable-spool', [x + 2.1, 0.7, z], [1.3, 1.4, 0.45], steel);
  }
  for (const [x, z] of [[-16, 14], [16, -14]] as const) {
    box(builder, 'rustworks-barrier-low', [x, 0.55, z], [3.5, 1.1, 0.45], hazard);
    box(builder, 'rustworks-barrier-low', [x, 0.55, z + 2.2], [0.45, 1.1, 3.2], hazardDark);
  }

  const labelBoard = box(builder, 'rustworks-original-arena-sign', [0, 11.1, 2.15], [3.8, 0.72, 0.12], hazard, { solid: false, shots: false });
  labelBoard.userData.label = 'RUSTWORKS 1V1';

  root.userData.rustworksPresentationBatches = batchPresentationOnlyBoxes(root);

  // Route anchors for deterministic traversal tests (eye-height samples).
  root.userData.rustworksRoutes = {
    'ground-to-lower': [
      { id: 'lower-ramp-foot', position: [0, 1.7, lowerRampCenterZ - Math.cos(lowerRampAngle) * (lowerRampLength / 2) - 0.35] },
      { id: 'lower-ramp-top', position: [0, lowerTop + 1.55, lowerLandingCenterZ] },
      { id: 'lower-deck-center', position: [0, lowerTop + 1.55, 0] },
    ],
    'lower-to-upper': [
      { id: 'ship-ladder-foot', position: [shipX, lowerTop + 1.55, shipLowerLandingCenterZ] },
      { id: 'ship-ladder-top', position: [shipX, upperTop + 1.55, upperOutboardCenterZ] },
      { id: 'upper-deck-center', position: [1.4, upperTop + 1.55, upperOutboardCenterZ] },
    ],
  };
  root.userData.rustworksAccess = {
    lowerRampAngleDegrees,
    shipLadderAngleDegrees,
    lowerRamp: {
      position: [0, lowerRampPosY, lowerRampCenterZ],
      size: [lowerRampWidth, lowerRampThickness, lowerRampLength],
      rotation: [-lowerRampAngle, 0, 0],
      landingPosition: [0, lowerDeckCenterY, lowerLandingCenterZ],
      landingSize: [lowerRampWidth + 0.35, deckThickness, lowerLandingDepth],
    },
    shipLadder: {
      position: [shipX, shipPosY, shipCenterZ],
      size: [shipWidth, shipThickness, shipLength],
      rotation: shipRotation,
      lowerLandingPosition: [shipX, lowerDeckCenterY, shipLowerLandingCenterZ],
      lowerLandingSize: [shipWidth + 0.4, deckThickness, lowerShipLandingDepth],
      upperLandingPosition: [shipX, upperDeckCenterY, upperOutboardCenterZ],
      upperLandingSize: [shipWidth + 0.35, deckThickness, upperOutboardLandingDepth],
      bridgePosition: [upperBridgeCenterX, upperDeckCenterY, upperOutboardCenterZ],
      bridgeSize: [Math.abs(shipX - (upperHalf - 0.15)) + 0.35, deckThickness, upperOutboardLandingDepth],
      run: shipRun,
      rise: shipRise,
    },
  };

  return {
    id: 'rustworks-1v1',
    label: 'Rustworks 1V1',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    spawns: spawnRecord(
      [[-21, 23], [-15, 24], [-22, 15], [-11, 20]],
      [[21, -23], [15, -24], [22, -15], [11, -20]],
    ),
    patrolPoints: [
      [-18, 18], [-10, 9], [0, 10], [12, 8], [18, -18], [8, -11], [0, -15], [-12, -8],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { minX: -27, maxX: 27, minZ: -29, maxZ: 29 },
    houseTelemetry: emptyTelemetry(),
  };
}

function scoreTexture(value: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#10171b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#f4c44f';
  context.lineWidth = 10;
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  context.fillStyle = '#f8f0d2';
  context.font = '900 62px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`${value} PTS`, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function rangeTarget(
  builder: Builder,
  targets: PracticeTarget[],
  id: string,
  x: number,
  z: number,
  scoreValue: number,
  distanceBand: PracticeTarget['distanceBand'],
): void {
  const root = new THREE.Group();
  root.name = 'gun-range-scoring-target';
  root.userData.targetId = id;
  root.userData.scoreValue = scoreValue;
  root.position.set(x, 0, z);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), standard(0x4b4d49, 0.8, 0.5));
  stand.position.y = 0.6;
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.12, 24),
    standard(distanceBand === 'near' ? 0x58e3dc : distanceBand === 'mid' ? 0xf4c44f : 0xff765f, 0.58, 0.28),
  );
  plate.name = `${scoreValue}-point-range-plate`;
  plate.userData.hitZone = 'body';
  plate.position.y = 1.65;
  plate.rotation.x = Math.PI / 2;
  const bullseye = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.135, 20), standard(0xf5eee0, 0.48, 0.18));
  bullseye.name = 'range-bullseye';
  bullseye.userData.hitZone = 'head';
  bullseye.position.set(0, 1.65, 0.01);
  bullseye.rotation.x = Math.PI / 2;
  root.add(stand, plate, bullseye);
  const texture = scoreTexture(scoreValue);
  if (texture) {
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: false, depthTest: true, toneMapped: false }));
    label.name = `${scoreValue}-point-label`;
    label.position.set(0, 2.75, 0);
    label.scale.set(2.4, 1.2, 1);
    root.add(label);
  }
  root.traverse((child) => {
    child.userData.targetRoot = root;
    child.userData.impactSurface = 'metal';
  });
  builder.root.add(root);
  targets.push({ id, root, active: true, respawnAt: 0, scoreValue, distanceBand, maxHealth: 500, health: 500 });
}

export function buildGunRange(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Acres Gun Range arena';
  scene.add(root);
  const builder: Builder = { root, colliders: [], physicsColliders: [], raycastMeshes: [] };
  const concrete = standard(0x6d7472, 0.98, 0.02);
  const dark = standard(0x1f292c, 0.78, 0.44);
  const timber = standard(0x6f4b30, 0.94, 0.02);
  const safety = standard(0xe1a32f, 0.72, 0.26);
  const targets: PracticeTarget[] = [];

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 54), concrete);
  floor.name = 'gun-range-concrete-lanes';
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -17;
  floor.receiveShadow = true;
  floor.userData.impactSurface = 'concrete';
  root.add(floor);
  builder.raycastMeshes.push(floor);

  box(builder, 'gun-range-backstop', [0, 3.5, -43], [32, 7, 1.2], dark);
  box(builder, 'gun-range-left-berm', [-15.5, 2.1, -17], [1.0, 4.2, 53], timber);
  box(builder, 'gun-range-right-berm', [15.5, 2.1, -17], [1.0, 4.2, 53], timber);
  box(builder, 'gun-range-firing-line-roof', [0, 4.3, 5.8], [31, 0.35, 8], dark, { solid: false, shots: false });
  for (const x of [-10, -5, 0, 5, 10]) {
    box(builder, 'gun-range-booth-divider', [x, 1.35, 6], [0.16, 2.7, 7], dark);
  }
  box(builder, 'gun-range-firing-line', [0, 0.05, GUN_RANGE_FIRING_LINE_Z], [30, 0.1, 0.5], safety, { solid: false, shots: false });
  // The yellow line is a range-safety boundary, not ballistic cover. Keep its
  // tall invisible barrier in authoritative character physics only so every
  // stance and jump remains behind it while bullets pass into the lanes.
  builder.physicsColliders.push({ ...GUN_RANGE_FIRING_LINE_BARRIER });
  for (const z of [-9, -22, -35]) {
    box(builder, 'gun-range-distance-stripe', [0, 0.035, z], [30, 0.06, 0.22], safety, { solid: false, shots: false });
  }
  for (const [band, z, score] of [
    ['near', -10, 100], ['mid', -23, 200], ['far', -36, 300],
  ] as const) {
    for (const x of [-7, 0, 7]) rangeTarget(builder, targets, `${band}-${x}`, x, z, score, band);
  }
  for (const x of [-12, 12]) {
    box(builder, 'gun-range-weapon-bench', [x, 0.72, 5.5], [4.2, 1.0, 1.2], timber);
    box(builder, 'gun-range-safety-post', [x, 1.7, 2.0], [0.18, 3.4, 0.18], safety);
  }

  return {
    id: 'gun-range',
    label: 'Acres Gun Range',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    spawns: spawnRecord(
      [[2.5, 7], [-7.5, 7], [7.5, 7]],
      [[2.5, 7], [-7.5, 7], [7.5, 7]],
    ),
    patrolPoints: [],
    targets,
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { minX: -15, maxX: 15, minZ: -42, maxZ: 9 },
    houseTelemetry: emptyTelemetry(),
  };
}
