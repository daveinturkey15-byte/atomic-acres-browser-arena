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
  options: {
    solid?: boolean;
    shots?: boolean;
    rotation?: [number, number, number];
    cast?: boolean;
    /** core = always; performance = performance+quality; quality = Quality Graphics only */
    detail?: 'core' | 'performance' | 'quality';
  } = {},
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
  mesh.userData.rustworksDetail = options.detail ?? 'core';
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
      || node.userData.rustworksDetail === 'quality'
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
 * Original compact industrial tower arena. Performance keeps climb authority and
 * sparse yard cover; Quality Graphics adds denser industrial decoration plus the
 * Blender central-tower overlay — same split style as Atomic Acres.
 */
export function buildRustworks1v1(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Rustworks arena';
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

  // Raised oil-rig deck (playable surface stays at y≈0 for physics). Ocean sits far below.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(54, 58), steel);
  ground.name = 'rustworks-rig-deck-top';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.0;
  ground.receiveShadow = true;
  ground.userData.impactSurface = 'metal';
  root.add(ground);
  builder.raycastMeshes.push(ground);
  // Thick deck plate + edge lip so the drop to water reads when looking over.
  box(builder, 'rustworks-rig-deck-slab', [0, -0.85, 0], [54.5, 1.6, 58.5], rustDark, { solid: false, cast: true, shots: false });
  box(builder, 'rustworks-rig-deck-edge', [0, -0.08, 0], [55.2, 0.22, 59.2], hazardDark, { solid: false, cast: false, shots: false });
  // Support legs down toward the ocean (visual only — no snag colliders).
  for (const x of [-22, -8, 8, 22]) for (const z of [-24, -8, 8, 24]) {
    box(builder, 'rustworks-rig-leg', [x, -8.5, z], [1.35, 15.5, 1.35], steelBright, { solid: false, detail: 'performance' });
    box(builder, 'rustworks-rig-leg-brace', [x, -4.2, z], [2.4, 0.35, 0.35], oxide, { solid: false, detail: 'quality' });
  }
  // Cross girders under deck
  for (const z of [-18, 0, 18]) {
    box(builder, 'rustworks-rig-girder', [0, -1.55, z], [50, 0.55, 0.7], steel, { solid: false, detail: 'performance' });
  }
  for (const x of [-18, 0, 18]) {
    box(builder, 'rustworks-rig-girder', [x, -1.55, 0], [0.7, 0.55, 54], steel, { solid: false, detail: 'performance' });
  }

  // Painted walk lanes — presentation only, clear paths for bots/players.
  box(builder, 'rustworks-tower-hardstand', [0, 0.03, 0], [16, 0.06, 16], packed, { solid: false, cast: false });
  box(builder, 'rustworks-service-lane', [0, 0.04, 0], [5.5, 0.05, 48], concreteDark, { solid: false, cast: false });
  box(builder, 'rustworks-service-lane', [0, 0.04, 0], [48, 0.05, 5.5], concreteDark, { solid: false, cast: false });
  for (const z of [-20, 20]) {
    box(builder, 'rustworks-ground-chevron', [0, 0.05, z], [2.8, 0.03, 0.45], hazard, { solid: false, cast: false, shots: false });
  }

  // Open safety rail (NOT solid walls) — world bounds stop exits; ocean stays visible.
  for (const [x, z, sx, sz] of [
    [0, -29.2, 52, 0.18], [0, 29.2, 52, 0.18], [-26.8, 0, 0.18, 56], [26.8, 0, 0.18, 56],
  ] as const) {
    box(builder, 'rustworks-perimeter-rail', [x, 1.15, z], [sx, 0.12, sz], hazard, { solid: false, detail: 'performance' });
    box(builder, 'rustworks-perimeter-rail', [x, 0.55, z], [sx, 0.1, sz], steel, { solid: false, detail: 'performance' });
  }
  for (const [x, z] of [
    [-20, -29], [-8, -29], [8, -29], [20, -29],
    [-20, 29], [-8, 29], [8, 29], [20, 29],
    [-26.6, -16], [-26.6, 0], [-26.6, 16],
    [26.6, -16], [26.6, 0], [26.6, 16],
  ] as const) {
    box(builder, 'rustworks-perimeter-post', [x, 0.7, z], [0.28, 1.4, 0.28], steel, { solid: false, detail: 'performance' });
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
    box(builder, 'rustworks-tower-leg-base', [x, 0.28, z], [0.95, 0.56, 0.95], concrete);
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
        detail: 'performance',
      });
      box(builder, 'rustworks-structural-brace', [0, midY, z], [length, 0.14, 0.14], oxide, {
        solid: false,
        rotation: [0, 0, -angle],
        detail: 'performance',
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
        detail: 'performance',
      });
      box(builder, 'rustworks-structural-brace', [x, midY, 0], [0.14, 0.14, length], steel, {
        solid: false,
        rotation: [-angle, 0, 0],
        detail: 'performance',
      });
    }
  }

  box(builder, 'rustworks-lower-deck', [0, lowerDeckCenterY, 0], [lowerDeckSize, deckThickness, lowerDeckSize], grate);
  box(builder, 'rustworks-upper-deck', [0, upperDeckCenterY, 0], [upperDeckSize, deckThickness, upperDeckSize], rust);
  // Keep the upper deck walkable: corner utility only, open centre circulation ring.
  // Corner utilities stay small so the upper deck centre stays a clean fight space.
  box(builder, 'rustworks-control-hut', [-2.25, 9.35, -2.25], [1.45, 2.0, 1.45], rustDark);
  box(builder, 'rustworks-control-hut-awning', [-2.25, 10.5, -1.45], [1.7, 0.12, 0.85], hazard, { solid: false, detail: 'performance' });
  box(builder, 'rustworks-process-manifold', [2.3, 9.1, 2.3], [0.85, 1.35, 0.85], steel);
  box(builder, 'rustworks-lower-deck-grating-trim', [0, lowerTop + 0.02, 0], [lowerDeckSize - 0.8, 0.04, lowerDeckSize - 0.8], steel, {
    solid: false,
    cast: false,
    detail: 'performance',
  });
  // Clear walk ring paint on upper deck (presentation only).
  box(builder, 'rustworks-upper-walk-ring', [0, upperTop + 0.03, 0], [upperDeckSize - 1.8, 0.03, upperDeckSize - 1.8], hazardDark, {
    solid: false,
    cast: false,
    shots: false,
    detail: 'performance',
  });

  // Ground → lower deck ramp on -Z with explicit foot/top landings (≤50°).
  const lowerRampAngle = (lowerRampAngleDegrees * Math.PI) / 180;
  const lowerRampLength = (lowerTop - 0.12) / Math.sin(lowerRampAngle);
  const lowerRampThickness = 0.28;
  const lowerRampWidth = 4.0;
  const lowerLandingDepth = 1.55;
  const lowerDeckEdgeZ = -lowerHalf;
  const lowerLandingCenterZ = lowerDeckEdgeZ - lowerLandingDepth / 2 + landingOverlap;
  const lowerRampTopZ = lowerLandingCenterZ - lowerLandingDepth / 2 + landingOverlap;
  const lowerRampCenterZ = lowerRampTopZ - Math.cos(lowerRampAngle) * (lowerRampLength / 2);
  const lowerRampPosY = lowerTop
    - Math.sin(lowerRampAngle) * (lowerRampLength / 2)
    - Math.cos(lowerRampAngle) * (lowerRampThickness / 2);

  box(builder, 'rustworks-lower-ramp-foot-pad', [0, 0.08, lowerRampCenterZ - Math.cos(lowerRampAngle) * (lowerRampLength / 2) - 0.55], [lowerRampWidth + 0.8, 0.16, 1.6], concrete);
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
    [lowerRampWidth + 0.45, deckThickness, lowerLandingDepth],
    grate,
  );
  for (const side of [-1, 1] as const) {
    box(
      builder,
      'rustworks-lower-ramp-rail',
      [side * (lowerRampWidth / 2 + 0.12), lowerRampPosY + 0.55, lowerRampCenterZ],
      [0.1, 0.1, lowerRampLength],
      hazard,
      { solid: false, rotation: [-lowerRampAngle, 0, 0], detail: 'performance' },
    );
  }

  // Ship-ladder on +X rim: continuous climb, wider bridge, open upper landing.
  const shipAngle = (shipLadderAngleDegrees * Math.PI) / 180;
  const shipRise = upperTop - lowerTop;
  const shipRun = shipRise / Math.tan(shipAngle);
  const shipLength = shipRise / Math.sin(shipAngle);
  const shipThickness = 0.22;
  const shipWidth = 1.95;
  const shipX = lowerHalf - 0.35;
  const lowerShipLandingDepth = 1.25;
  const upperOutboardLandingDepth = 1.35;
  const shipRotation: [number, number, number] = [shipAngle, 0, 0];
  const shipLowZ = lowerHalf - 0.2;
  const shipLowerLandingCenterZ = shipLowZ + lowerShipLandingDepth / 2 - landingOverlap;
  const shipLowSurfaceZ = shipLowerLandingCenterZ - lowerShipLandingDepth / 2 + landingOverlap;
  const shipHighSurfaceZ = shipLowSurfaceZ - shipRun;
  const shipCenterZ = (shipLowSurfaceZ + shipHighSurfaceZ) / 2;
  const shipPosY = (lowerTop + upperTop) / 2 - Math.cos(shipAngle) * (shipThickness / 2);
  const upperHalf = upperDeckSize / 2;
  const upperOutboardCenterZ = shipHighSurfaceZ - upperOutboardLandingDepth / 2 + landingOverlap;
  const upperBridgeCenterX = (shipX + upperHalf - 0.35) / 2;
  const upperBridgeWidth = Math.abs(shipX - (upperHalf - 0.35)) + 0.55;

  box(
    builder,
    'rustworks-ship-ladder-lower-landing',
    [shipX, lowerDeckCenterY, shipLowerLandingCenterZ],
    [shipWidth + 0.55, deckThickness, lowerShipLandingDepth],
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
    [shipWidth + 0.45, deckThickness, upperOutboardLandingDepth],
    rust,
  );
  box(
    builder,
    'rustworks-upper-access',
    [upperBridgeCenterX, upperDeckCenterY, upperOutboardCenterZ],
    [upperBridgeWidth, deckThickness, upperOutboardLandingDepth],
    grate,
  );
  for (const side of [-1, 1] as const) {
    box(
      builder,
      `rustworks-ship-ladder-rail-${side < 0 ? 'west' : 'east'}`,
      [shipX + side * (shipWidth / 2 + 0.08), shipPosY + 0.62, shipCenterZ],
      [0.09, 0.09, shipLength],
      hazard,
      { solid: false, rotation: shipRotation, detail: 'performance' },
    );
  }
  const rungCount = 9;
  for (let index = 0; index < rungCount; index += 1) {
    const t = (index + 0.5) / rungCount;
    const z = shipLowSurfaceZ - shipRun * t;
    const y = lowerTop + shipRise * t + 0.04;
    box(builder, `rustworks-ship-ladder-rung-${index}`, [shipX, y, z], [shipWidth - 0.12, 0.08, 0.1], hazard, {
      solid: false,
      detail: 'quality',
    });
  }
  for (const side of [-1, 1] as const) {
    box(
      builder,
      'rustworks-ship-ladder-stringer',
      [shipX + side * (shipWidth / 2 + 0.02), shipPosY - 0.08, shipCenterZ],
      [0.08, 0.18, shipLength + 0.08],
      oxide,
      { solid: false, rotation: shipRotation, detail: 'quality' },
    );
  }

  // Thin visual safety rails — split clear of ramp and ladder openings.
  const lowerRailY = lowerTop + 1.2;
  box(builder, 'rustworks-lower-deck-rail', [-4.15, lowerRailY, 0.1], [0.12, 0.12, 7.6], hazard, { solid: false, detail: 'performance' });
  box(builder, 'rustworks-lower-deck-rail', [4.15, lowerRailY, -0.35], [0.12, 0.12, 5.4], hazard, { solid: false, detail: 'performance' });
  box(builder, 'rustworks-lower-deck-rail', [-3.35, lowerRailY, -4.15], [1.6, 0.12, 0.12], hazard, { solid: false, detail: 'performance' });
  box(builder, 'rustworks-lower-deck-rail', [3.35, lowerRailY, -4.15], [1.6, 0.12, 0.12], hazard, { solid: false, detail: 'performance' });
  box(builder, 'rustworks-lower-deck-rail', [-0.6, lowerRailY, 4.15], [6.2, 0.12, 0.12], hazard, { solid: false, detail: 'performance' });
  for (const [x, z] of [
    [-4.15, -4.15], [-2.55, -4.15], [2.55, -4.15], [4.15, -4.15],
    [-4.15, 4.15], [2.5, 4.15], [4.15, 2.35],
  ] as const) {
    box(builder, 'rustworks-lower-deck-rail-post', [x, lowerTop + 0.62, z], [0.12, 1.2, 0.12], hazard, { solid: false, detail: 'performance' });
  }

  const upperRailY = upperTop + 1.2;
  for (const z of [-3.35, 3.35]) {
    box(builder, 'rustworks-upper-deck-rail', [-0.1, upperRailY, z], [6.0, 0.12, 0.12], hazard, { solid: false, detail: 'performance' });
  }
  box(builder, 'rustworks-upper-deck-rail', [-3.35, upperRailY, -0.15], [0.12, 0.12, 5.9], hazard, { solid: false, detail: 'performance' });
  // Split +X rails wider around the ship-ladder bridge corridor.
  box(builder, 'rustworks-upper-deck-rail', [3.35, upperRailY, -2.55], [0.12, 0.12, 1.5], hazard, { solid: false, detail: 'performance' });
  box(builder, 'rustworks-upper-deck-rail', [3.35, upperRailY, 1.85], [0.12, 0.12, 2.9], hazard, { solid: false, detail: 'performance' });
  for (const [x, z] of [
    [-3.35, -3.35], [2.7, -3.35], [-3.35, 3.35], [2.7, 3.35],
    [3.35, -3.35], [3.35, -1.75], [3.35, 0.2], [3.35, 3.35],
  ] as const) {
    box(builder, 'rustworks-upper-deck-rail-post', [x, upperTop + 0.62, z], [0.12, 1.2, 0.12], hazard, { solid: false, detail: 'performance' });
  }

  // Clean crown only. The old crane/cable/hook and decorative process runs
  // produced disconnected silhouettes above the tower and are deliberately gone.
  for (const x of [-2.7, 2.7]) for (const z of [-2.7, 2.7]) {
    box(builder, 'rustworks-canopy-post', [x, 11.4, z], [0.18, 2.4, 0.18], steel, { solid: false, detail: 'quality' });
  }
  box(builder, 'rustworks-canopy-roof', [0, 12.65, 0], [6.9, 0.24, 6.9], rust, { solid: false, detail: 'quality' });

  // Sparse corner cover only — open cross-lanes for smooth player/bot pathing.
  // Keep a clear ~12m apron around the tower and open ±X / ±Z corridors.
  for (const [x, z, color, sx, sy, sz] of [
    [-20, -20, tarp, 3.2, 2.1, 3.2],
    [20, 20, hazard, 3.2, 2.1, 3.2],
    [-20, 20, rustDark, 3.0, 2.0, 3.0],
    [20, -20, oxide, 3.0, 2.0, 3.0],
  ] as const) {
    box(builder, 'rustworks-freight-crate', [x, sy / 2, z], [sx, sy, sz], color);
    box(builder, 'rustworks-crate-lid', [x, sy + 0.08, z], [sx + 0.12, 0.14, sz + 0.12], steel, { solid: false, detail: 'quality' });
  }
  // Collision-backed shipping cover: large containers + low pallet stacks.
  // All groups stay outside the central 12m apron and away from private-match spawns.
  for (const [index, x, z, rotationY] of [
    [0, -20, -12, 0],
    [1, 20, 12, 0],
    [2, -12, -20, Math.PI / 2],
    [3, 12, 20, Math.PI / 2],
  ] as const) {
    const containerSize: [number, number, number] = rotationY === 0 ? [5.8, 2.6, 2.5] : [2.5, 2.6, 5.8];
    box(builder, 'rustworks-shipping-container', [x, 1.3, z], containerSize, index % 2 === 0 ? rustDark : tarp);
    // Full-collision pallet cover sits beside, not inside, the container footprint.
    const palletX = x + (x < 0 ? 4.2 : -4.2);
    box(builder, 'rustworks-pallet-stack', [palletX, 0.55, z], [2.2, 1.1, 1.8], hazardDark);
    for (const y of [0.12, 0.42, 0.72, 1.02]) {
      box(builder, `rustworks-pallet-slat-${index}`, [palletX, y, z], [2.35, 0.08, 1.95], steel, {
        solid: false,
        shots: false,
        cast: false,
        detail: 'quality',
      });
    }
  }

  // One process tank per long side, pulled to the rail so mid-lanes stay clear.
  for (const [x, z] of [[-22, 0], [22, 0]] as const) {
    box(builder, 'rustworks-tank-collider', [x, 1.4, z], [2.6, 2.8, 4.2], steel);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 4.0, 14), rust);
    tank.name = 'rustworks-horizontal-process-tank';
    tank.rotation.x = Math.PI / 2;
    tank.position.set(x, 1.5, z);
    tank.castShadow = true;
    tank.receiveShadow = true;
    tank.userData.presentationOnly = true;
    tank.userData.rustworksDetail = 'quality';
    tank.userData.impactSurface = 'metal';
    root.add(tank);
  }
  // Two low hazard barriers as soft mid-range cover (not L-traps).
  for (const [x, z] of [[-12, 18], [12, -18]] as const) {
    box(builder, 'rustworks-barrier-low', [x, 0.45, z], [2.4, 0.9, 0.35], hazard);
  }

  const labelBoard = box(builder, 'rustworks-original-arena-sign', [0, 11.1, 2.15], [3.8, 0.72, 0.12], hazard, { solid: false, shots: false, detail: 'performance' });
  labelBoard.userData.label = 'RUSTWORKS';

  root.userData.rustworksPresentationBatches = batchPresentationOnlyBoxes(root);
  // Default to full presentation for tests/tools; runtime re-applies the active render profile.
  applyRustworksPresentationProfile(root, 'blender');

  root.userData.rustworksRoutes = {
    'ground-to-lower': [
      { id: 'lower-ramp-foot', position: [0, 1.7, lowerRampCenterZ - Math.cos(lowerRampAngle) * (lowerRampLength / 2) - 0.35] },
      { id: 'lower-ramp-top', position: [0, lowerTop + 1.55, lowerLandingCenterZ] },
      { id: 'lower-deck-center', position: [0, lowerTop + 1.55, 0] },
    ],
    'lower-to-upper': [
      { id: 'ship-ladder-foot', position: [shipX, lowerTop + 1.55, shipLowerLandingCenterZ] },
      { id: 'ship-ladder-top', position: [shipX, upperTop + 1.55, upperOutboardCenterZ] },
      { id: 'upper-deck-center', position: [0.4, upperTop + 1.55, 0.2] },
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
      landingSize: [lowerRampWidth + 0.45, deckThickness, lowerLandingDepth],
    },
    shipLadder: {
      position: [shipX, shipPosY, shipCenterZ],
      size: [shipWidth, shipThickness, shipLength],
      rotation: shipRotation,
      lowerLandingPosition: [shipX, lowerDeckCenterY, shipLowerLandingCenterZ],
      lowerLandingSize: [shipWidth + 0.55, deckThickness, lowerShipLandingDepth],
      upperLandingPosition: [shipX, upperDeckCenterY, upperOutboardCenterZ],
      upperLandingSize: [shipWidth + 0.45, deckThickness, upperOutboardLandingDepth],
      bridgePosition: [upperBridgeCenterX, upperDeckCenterY, upperOutboardCenterZ],
      bridgeSize: [upperBridgeWidth, deckThickness, upperOutboardLandingDepth],
      run: shipRun,
      rise: shipRise,
    },
  };

  // Six spawns per side for private lobbies up to 6, staggered outside cover and tower apron.
  return {
    id: 'rustworks-1v1',
    label: 'Rustworks',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    spawns: spawnRecord(
      [
        [-22, 21], [-14, 25], [-4, 20], [-25, 8], [-17, 2], [-9, 14],
      ],
      [
        [22, -21], [14, -25], [4, -20], [25, -8], [17, -2], [9, -14],
      ],
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

/**
 * Match Atomic Acres' Performance vs Quality split on Rustworks:
 * Performance keeps climbable/combat core and sparse yard cover;
 * Quality enables heavy industrial decoration + Blender tower overlay.
 */
export function applyRustworksPresentationProfile(
  root: THREE.Object3D,
  profile: 'performance' | 'blender' | 'compat',
): { hidden: number; shown: number } {
  let hidden = 0;
  let shown = 0;
  const allowPerformance = profile === 'performance' || profile === 'blender';
  const allowQuality = profile === 'blender';
  root.traverse((node) => {
    // Source meshes collapsed into static presentation batches must stay hidden.
    if (node.userData.staticBatchRendered === true && !String(node.name).startsWith('rustworks-presentation-batch-')) {
      if (node.visible) {
        node.visible = false;
        hidden += 1;
      }
      return;
    }
    const detail = node.userData.rustworksDetail as string | undefined;
    if (node.userData.blenderAuthoredEnvironment) {
      const visible = allowQuality;
      if (node.visible !== visible) {
        node.visible = visible;
        if (visible) shown += 1;
        else hidden += 1;
      }
      return;
    }
    if (!detail || detail === 'core') return;
    let visible = true;
    if (detail === 'performance') visible = allowPerformance;
    if (detail === 'quality') visible = allowQuality;
    if (node.visible === visible) return;
    node.visible = visible;
    if (visible) shown += 1;
    else hidden += 1;
  });
  return { hidden, shown };
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
