import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildWeaponModel } from './art-kit';
import { classifyImpactSurface } from './combat-feedback';
import { createBallisticSurface, type BallisticMaterialId, type BallisticSurface } from './ballistics';
import type { Box2 } from './collision';
import { WEAPONS } from './gameplay';
import { GUN_RANGE_WEAPON_STATIONS } from './gun-range-armory';
import type { ArenaMap, BreakableWindow, PracticeTarget } from './map';
import type { Team } from './protocol';

type Builder = {
  root: THREE.Group;
  colliders: Box2[];
  physicsColliders: Box2[];
  raycastMeshes: THREE.Object3D[];
  shotSurfaces: BallisticSurface[];
  ballisticSurfaceSequence: number;
};

export const GUN_RANGE_FIRING_LINE_Z = 1.2;
export const GUN_RANGE_FIRING_LINE_BARRIER: Readonly<Box2> = Object.freeze({
  minX: -20,
  maxX: 20,
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
    ballisticMaterial?: BallisticMaterialId;
    breakableWindowId?: string;
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
  const bounds: Box2 = {
    minX: position[0] - size[0] / 2,
    maxX: position[0] + size[0] / 2,
    minZ: position[2] - size[2] / 2,
    maxZ: position[2] + size[2] / 2,
    minY: position[1] - size[1] / 2,
    maxY: position[1] + size[1] / 2,
    rotation: options.rotation,
  };
  if (shots) {
    builder.raycastMeshes.push(mesh);
    const surface = createBallisticSurface(
      `${builder.root.name}:${builder.ballisticSurfaceSequence}:${name}`,
      name,
      bounds,
      {
        impactSurface: mesh.userData.impactSurface as ReturnType<typeof classifyImpactSurface>,
        material: options.ballisticMaterial,
      },
      options.breakableWindowId,
    );
    builder.ballisticSurfaceSequence += 1;
    builder.shotSurfaces.push(surface);
    mesh.userData.ballisticSurfaceId = surface.id;
  }
  if (solid) {
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
  shipLadderAngleDegrees: 38,
  lowerRampAngleDegrees: 18,
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
  const builder: Builder = {
    root, colliders: [], physicsColliders: [], raycastMeshes: [], shotSurfaces: [], ballisticSurfaceSequence: 0,
  };
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
  const groundSurface = createBallisticSurface(
    `${root.name}:${builder.ballisticSurfaceSequence}:deck`,
    ground.name,
    { minX: -27, maxX: 27, minY: -1.6, maxY: 0, minZ: -29, maxZ: 29 },
    { impactSurface: 'metal', material: 'structural-metal' },
  );
  builder.ballisticSurfaceSequence += 1;
  builder.shotSurfaces.push(groundSurface);
  ground.userData.ballisticSurfaceId = groundSurface.id;
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
  // Keep the compact crown clear. The former hut/manifold blocks narrowed
  // rotations and read as accidental clutter rather than useful cover.
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
  const lowerRampWidth = 4.8;
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
  const shipWidth = 2.6;
  // Keep the capsule clear of the upper-deck slab edge while preserving lower-deck overlap.
  const shipX = lowerHalf - 0.1;
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
  box(builder, 'rustworks-lower-deck-rail', [-3.4, lowerRailY, -4.15], [1.5, 0.12, 0.12], hazard, { solid: false, detail: 'performance' });
  box(builder, 'rustworks-lower-deck-rail', [3.4, lowerRailY, -4.15], [1.5, 0.12, 0.12], hazard, { solid: false, detail: 'performance' });
  box(builder, 'rustworks-lower-deck-rail', [-3.4, lowerRailY, 4.15], [1.5, 0.12, 0.12], hazard, { solid: false, detail: 'performance' });
  box(builder, 'rustworks-lower-deck-rail', [3.4, lowerRailY, 4.15], [1.5, 0.12, 0.12], hazard, { solid: false, detail: 'performance' });
  for (const [x, z] of [
    [-4.15, -4.15], [-2.85, -4.15], [2.85, -4.15], [4.15, -4.15],
    [-4.15, 4.15], [4.15, 4.15], [4.15, 2.35],
  ] as const) {
    box(builder, 'rustworks-lower-deck-rail-post', [x, lowerTop + 0.62, z], [0.12, 1.2, 0.12], hazard, { solid: false, detail: 'performance' });
  }

  const upperRailY = upperTop + 1.2;
  for (const z of [-3.35, 3.35]) {
    box(builder, 'rustworks-upper-deck-rail', [-0.3, upperRailY, z], [5.6, 0.12, 0.12], hazard, { solid: false, detail: 'performance' });
  }
  box(builder, 'rustworks-upper-deck-rail', [-3.35, upperRailY, -0.15], [0.12, 0.12, 5.9], hazard, { solid: false, detail: 'performance' });
  // Split +X rails wider around the ship-ladder bridge corridor.
  box(builder, 'rustworks-upper-deck-rail', [3.35, upperRailY, 1.85], [0.12, 0.12, 2.9], hazard, { solid: false, detail: 'performance' });
  for (const [x, z] of [
    [-3.35, -3.35], [-3.35, 3.35], [2.7, 3.35],
    [3.35, -1.75], [3.35, 0.2], [3.35, 3.35],
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
  const containerRows = [
    ...[-19, -6.3, 6.3, 19].map((x) => ({ side: 'north', x, z: -23 })),
    ...[-19, -6.3, 6.3, 19].map((x) => ({ side: 'south', x, z: 23 })),
    ...[-18, -6, 6, 18].map((z) => ({ side: 'west', x: -23, z })),
    ...[-18, -6, 6, 18].map((z) => ({ side: 'east', x: 23, z })),
  ] as const;
  for (const [index, placement] of containerRows.entries()) {
    const alongX = placement.side === 'north' || placement.side === 'south';
    const containerSize: [number, number, number] = alongX ? [5.8, 2.6, 2.5] : [2.5, 2.6, 5.8];
    const container = box(
      builder,
      'rustworks-shipping-container',
      [placement.x, 1.3, placement.z],
      containerSize,
      [hazardDark, rustDark, tarp][index % 3],
    );
    container.userData.rustworksContainerSide = placement.side;

    // Presentation-only corrugation adds readable scale without extra collision clutter.
    for (const offset of [-2.15, -1.1, 0, 1.1, 2.15]) {
      const ribPosition: [number, number, number] = alongX
        ? [placement.x + offset, 1.3, placement.z + (placement.side === 'north' ? -1.27 : 1.27)]
        : [placement.x + (placement.side === 'west' ? -1.27 : 1.27), 1.3, placement.z + offset];
      box(builder, `rustworks-container-rib-${index}`, ribPosition, alongX ? [0.08, 2.25, 0.05] : [0.05, 2.25, 0.08], steelBright, {
        solid: false,
        shots: false,
        cast: false,
        detail: 'performance',
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
      { id: 'lower-ramp-top', position: [0, lowerTop + 1.7, lowerLandingCenterZ] },
      { id: 'lower-deck-center', position: [0, lowerTop + 1.7, 0] },
    ],
    'lower-to-upper': [
      // Route anchors are eye positions. Keep the standing 1.7 m eye height so
      // browser staging never begins with the capsule embedded in a landing.
      { id: 'ship-ladder-foot', position: [shipX, lowerTop + 1.7, shipLowerLandingCenterZ] },
      { id: 'ship-ladder-top', position: [shipX, upperTop + 1.7, upperOutboardCenterZ] },
      { id: 'upper-deck-center', position: [0.4, upperTop + 1.7, 0.2] },
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
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(
      [
        [0, 26], [-13, 26], [13, 26], [-26, 11], [-26, 0], [-13, 14],
      ],
      [
        [0, -26], [13, -26], [-13, -26], [26, -11], [26, 0], [13, -14],
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
export function applyAdditionalMapPresentationProfile(
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

/** Backward-compatible name retained for existing Rustworks callers. */
export function applyRustworksPresentationProfile(
  root: THREE.Object3D,
  profile: 'performance' | 'blender' | 'compat',
): { hidden: number; shown: number } {
  return applyAdditionalMapPresentationProfile(root, profile);
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

function rangeSign(text: string, accent: number, name: string, scale: [number, number]): THREE.Sprite | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = 'rgba(10, 17, 20, 0.94)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `#${accent.toString(16).padStart(6, '0')}`;
  context.lineWidth = 10;
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  context.fillStyle = '#f8f0d2';
  context.font = '900 58px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, toneMapped: false }));
  sprite.name = name;
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.userData.presentationOnly = true;
  return sprite;
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
  root.name = 'Acres Indoor Gun Range arena';
  scene.add(root);
  const builder: Builder = {
    root, colliders: [], physicsColliders: [], raycastMeshes: [], shotSurfaces: [], ballisticSurfaceSequence: 0,
  };
  const concrete = standard(0x444b4e, 0.98, 0.02);
  const wall = standard(0x242d32, 0.88, 0.22);
  const dark = standard(0x11191d, 0.7, 0.62);
  const acoustic = standard(0x303b3f, 0.96, 0.08);
  const timber = standard(0x765136, 0.91, 0.04);
  const safety = new THREE.MeshStandardMaterial({ color: 0xe0aa37, emissive: 0x4b2b00, emissiveIntensity: 0.5, roughness: 0.62, metalness: 0.28 });
  const redSafety = new THREE.MeshStandardMaterial({ color: 0xc74235, emissive: 0x4a0804, emissiveIntensity: 0.72, roughness: 0.54, metalness: 0.2 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xd9eff2, emissive: 0x9edfe9, emissiveIntensity: 2.5, roughness: 0.22, metalness: 0.08 });
  const targets: PracticeTarget[] = [];

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(42, 70), concrete);
  floor.name = 'gun-range-concrete-lanes';
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -14.5;
  floor.receiveShadow = true;
  floor.userData.impactSurface = 'concrete';
  root.add(floor);
  builder.raycastMeshes.push(floor);
  const floorSurface = createBallisticSurface(
    `${root.name}:${builder.ballisticSurfaceSequence}:floor`,
    floor.name,
    { minX: -16, maxX: 16, minY: -1.2, maxY: 0, minZ: -44, maxZ: 10 },
    { impactSurface: 'concrete', material: 'concrete' },
  );
  builder.ballisticSurfaceSequence += 1;
  builder.shotSurfaces.push(floorSurface);
  floor.userData.ballisticSurfaceId = floorSurface.id;

  // Full indoor shell: deep charcoal walls and ceiling keep attention on the
  // warm armory, cool lane lighting and bright target faces.
  box(builder, 'gun-range-backstop', [0, 3.6, -49], [42, 7.2, 1.2], dark);
  box(builder, 'gun-range-left-wall', [-20.5, 3.6, -14.5], [1, 7.2, 70], wall);
  box(builder, 'gun-range-right-wall', [20.5, 3.6, -14.5], [1, 7.2, 70], wall);
  box(builder, 'gun-range-rear-wall', [0, 3.6, 20], [42, 7.2, 1], wall);
  box(builder, 'gun-range-ceiling', [0, 7.1, -14.5], [42, 0.45, 70], dark, { solid: false, shots: true });

  // Suspended acoustic baffles and side ventilation sell the large industrial
  // interior while leaving the floor plan broad and readable.
  for (const z of [-41, -31, -21, -11, -1, 9, 17]) {
    box(builder, 'gun-range-acoustic-baffle', [0, 6.35, z], [37, 0.32, 1.15], acoustic, { solid: false, shots: false, cast: false });
  }
  for (const side of [-1, 1]) {
    box(builder, 'gun-range-ventilation-duct', [side * 17.7, 5.7, -17], [2.1, 1.25, 51], dark, { solid: false, shots: false, cast: false });
    for (const z of [-38, -24, -10, 4, 15]) {
      box(builder, 'gun-range-vent-grille', [side * 16.62, 5.7, z], [0.08, 0.8, 3.4], acoustic, { solid: false, shots: false, cast: false });
    }
  }

  for (const z of [-42, -32, -22, -12, -2, 8, 16]) {
    box(builder, 'gun-range-ceiling-light', [0, 6.82, z], [18, 0.08, 0.28], lamp, { solid: false, shots: false, cast: false });
    const light = new THREE.PointLight(z > 1 ? 0xffd59a : 0xc8f3ff, z > 1 ? 13 : 10, 17, 2.1);
    light.name = 'gun-range-interior-light';
    light.position.set(z % 4 === 0 ? -7 : 7, 5.9, z);
    light.castShadow = false;
    light.userData.presentationOnly = true;
    root.add(light);
  }

  box(builder, 'gun-range-control-room', [-16.5, 2.1, 15.5], [6.2, 4.2, 6.2], wall, { ballisticMaterial: 'interior-wall' });
  box(builder, 'gun-range-control-window', [-13.34, 2.5, 15.2], [0.08, 2, 3.6], new THREE.MeshStandardMaterial({ color: 0x76b8c5, emissive: 0x0a2730, emissiveIntensity: 0.5, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.52 }), { solid: false, shots: false });
  box(builder, 'gun-range-ready-bench', [16.2, 0.62, 15.4], [6.4, 1.05, 2.1], timber);
  box(builder, 'gun-range-ready-lockers', [18.5, 2.35, 8.4], [2.8, 4.6, 5.8], acoustic, { ballisticMaterial: 'structural-metal' });

  // Six boundaries form five roomy firing bays centred on the target lanes.
  // Keeping x=0 clear is gameplay-critical: the centre firing lane must not
  // begin inside a structural-metal shot surface.
  for (const x of [-15, -9, -3, 3, 9, 15]) {
    box(builder, 'gun-range-booth-divider', [x, 1.45, 4.2], [0.16, 2.9, 5.5], dark);
    box(builder, 'gun-range-booth-safety-lamp', [x, 3.35, 4.2], [0.18, 0.18, 1.1], redSafety, { solid: false, shots: false });
  }
  box(builder, 'gun-range-firing-line', [0, 0.05, GUN_RANGE_FIRING_LINE_Z], [40, 0.1, 0.5], safety, { solid: false, shots: false });
  // The yellow line is a range-safety boundary, not ballistic cover. Keep its
  // tall invisible barrier in authoritative character physics only so every
  // stance and jump remains behind it while bullets pass into the lanes.
  builder.physicsColliders.push({ ...GUN_RANGE_FIRING_LINE_BARRIER });
  for (const z of [-9, -22, -35]) {
    box(builder, 'gun-range-distance-stripe', [0, 0.035, z], [40, 0.06, 0.22], safety, { solid: false, shots: false });
  }
  for (const [band, z, score] of [
    ['near', -10, 100], ['mid', -23, 200], ['far', -36, 300],
  ] as const) {
    for (const x of [-7, 0, 7]) rangeTarget(builder, targets, `${band}-${x}`, x, z, score, band);
  }
  for (const station of GUN_RANGE_WEAPON_STATIONS) {
    const accent = new THREE.MeshStandardMaterial({
      color: WEAPONS[station.weapon].color,
      emissive: WEAPONS[station.weapon].color,
      emissiveIntensity: 0.34,
      roughness: 0.48,
      metalness: 0.32,
    });
    box(builder, 'gun-range-weapon-bench', [station.position.x, 0.62, station.position.z], [4.6, 1.05, 1.35], timber);
    box(builder, `gun-range-station-accent-${station.weapon}`, [station.position.x, 1.17, station.position.z + 0.55], [4.2, 0.09, 0.15], accent, { solid: false, shots: false });
    const stationRoot = new THREE.Group();
    stationRoot.name = `gun-range-weapon-station-${station.weapon}`;
    stationRoot.position.set(station.position.x, station.position.y, station.position.z);
    stationRoot.userData.stationId = station.id;
    stationRoot.userData.weapon = station.weapon;
    stationRoot.userData.label = `${station.label} / ${WEAPONS[station.weapon].name}`;
    const weapon = buildWeaponModel(station.weapon, true, false);
    weapon.name = `gun-range-rack-weapon-${station.weapon}`;
    weapon.rotation.set(0.08, Math.PI / 2, -0.08);
    weapon.scale.setScalar(station.weapon === 'lmg' ? 0.52 : 0.58);
    weapon.traverse((node) => {
      node.userData.presentationOnly = true;
      if (node instanceof THREE.Mesh) node.raycast = () => undefined;
    });
    stationRoot.add(weapon);
    const label = rangeSign(`${station.label} · ${WEAPONS[station.weapon].name.toUpperCase()}`, WEAPONS[station.weapon].color, `gun-range-station-label-${station.weapon}`, [4.15, 0.62]);
    if (label) {
      label.position.set(0, 0.78, 0.65);
      stationRoot.add(label);
    }
    const stationLight = new THREE.PointLight(WEAPONS[station.weapon].color, 5.5, 7, 2);
    stationLight.name = 'gun-range-armory-light';
    stationLight.position.set(0, 2.2, 0.6);
    stationLight.userData.presentationOnly = true;
    stationRoot.add(stationLight);
    root.add(stationRoot);
  }

  box(builder, 'gun-range-armory-header', [0, 3.8, 12.2], [32, 1.15, 0.25], dark, { solid: false, shots: false });
  box(builder, 'gun-range-live-fire-sign', [0, 4.45, 1.0], [12, 0.75, 0.22], redSafety, { solid: false, shots: false });
  root.getObjectByName('gun-range-armory-header')!.userData.label = 'CHOOSE A WEAPON · PRESS F';
  root.getObjectByName('gun-range-live-fire-sign')!.userData.label = 'LIVE FIRE · EYES AND EARS';
  const armorySign = rangeSign('ARMORY · PICK UP WITH F', 0x58e3dc, 'gun-range-armory-sign-text', [18, 1.25]);
  if (armorySign) {
    armorySign.position.set(0, 3.8, 12.02);
    root.add(armorySign);
  }
  const liveFireSign = rangeSign('LIVE FIRE · EYES AND EARS', 0xff765f, 'gun-range-live-fire-sign-text', [10.5, 0.82]);
  if (liveFireSign) {
    liveFireSign.position.set(0, 4.45, 0.86);
    root.add(liveFireSign);
  }

  return {
    id: 'gun-range',
    label: 'Acres Indoor Gun Range',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(
      [[0, 16.5], [-8, 16.5], [8, 16.5]],
      [[0, 16.5], [-8, 16.5], [8, 16.5]],
    ),
    patrolPoints: [],
    targets,
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { minX: -20, maxX: 20, minZ: -48, maxZ: 19.5 },
    houseTelemetry: emptyTelemetry(),
  };
}

function terminalWayfindingMaterial(title: string, subtitle: string, accent: string): THREE.Material {
  if (typeof document === 'undefined') {
    return new THREE.MeshStandardMaterial({ color: 0x172126, roughness: 0.48, metalness: 0.36 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) return standard(0x172126, 0.48, 0.36);
  context.fillStyle = '#111a1f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 28, canvas.height);
  context.fillRect(0, canvas.height - 12, canvas.width, 12);
  context.fillStyle = '#f4ead2';
  context.font = '900 66px sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(title, 62, 76);
  context.fillStyle = '#b8c8c8';
  context.font = '700 30px sans-serif';
  context.fillText(subtitle, 64, 142);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
}

export function buildSkylineTerminal(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Skyline Terminal arena';
  scene.add(root);
  const builder: Builder = {
    root, colliders: [], physicsColliders: [], raycastMeshes: [], shotSurfaces: [], ballisticSurfaceSequence: 0,
  };

  const tarmacMat = standard(0x30383a, 0.95, 0.05);
  const floorMat = standard(0x9ca6a2, 0.52, 0.1);
  const wallMat = standard(0x263238, 0.86, 0.22);
  const trimMat = standard(0x46575c, 0.52, 0.48);
  // Avoid transmission/refraction on the low-spec path: alpha glass is much
  // cheaper under software WebGL and still reads clearly as breakable glazing.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x6babb7,
    roughness: 0.2,
    metalness: 0.08,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const planeHullMat = standard(0xe5e8e4, 0.32, 0.35);
  const planeWingMat = standard(0x7a8587, 0.44, 0.6);
  const engineMat = standard(0x222a2e, 0.3, 0.78);
  const jetbridgeMat = standard(0x566267, 0.58, 0.52);
  const kioskMat = standard(0x574738, 0.86, 0.1);
  const cargoMat = standard(0xb9602e, 0.72, 0.28);
  const hazardMat = standard(0xd69a2d, 0.58, 0.28);
  const floorBorderMat = standard(0x252c30, 0.48, 0.16);
  const floorInsetMat = standard(0x4a5555, 0.58, 0.12);
  const wallLowerMat = standard(0x455157, 0.8, 0.18);
  const structureMat = standard(0x222b30, 0.5, 0.68);
  const rubberMat = standard(0x171c1f, 0.92, 0.04);
  const cockpitMat = standard(0x111c25, 0.18, 0.72);
  const planeStripeMat = standard(0x31464c, 0.46, 0.42);
  const stainMat = standard(0x242a28, 1.0, 0.0);
  const practicalMat = new THREE.MeshStandardMaterial({
    color: 0xffd9a0,
    roughness: 0.34,
    metalness: 0.08,
    emissive: 0xffa94d,
    emissiveIntensity: 0.72,
  });

  const skylineClusterIds = [
    'floor-language',
    'wall-structure',
    'escalator-detail',
    'window-frame',
    'aircraft-skin',
    'apron-marking',
    'terminal-story',
  ] as const;
  type SkylineClusterId = typeof skylineClusterIds[number];
  const detailBox = (
    cluster: SkylineClusterId,
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    material: THREE.Material,
    detail: 'performance' | 'quality' = 'performance',
    rotation?: [number, number, number],
    cast = false,
  ): THREE.Mesh => {
    const mesh = box(builder, name, position, size, material, {
      solid: false,
      shots: false,
      detail,
      rotation,
      cast,
    });
    mesh.userData.skylineCluster = cluster;
    return mesh;
  };
  root.userData.skylineDetailClusters = [...skylineClusterIds];

  const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(76, 76), tarmacMat);
  tarmac.name = 'skyline-tarmac-apron';
  tarmac.rotation.x = -Math.PI / 2;
  tarmac.position.y = 0.0;
  tarmac.receiveShadow = true;
  tarmac.userData.impactSurface = 'concrete';
  root.add(tarmac);
  builder.raycastMeshes.push(tarmac);
  const tarmacSurface = createBallisticSurface(
    `${root.name}:${builder.ballisticSurfaceSequence}:tarmac`,
    tarmac.name,
    { minX: -36, maxX: 36, minY: -2, maxY: 0, minZ: -36, maxZ: 36 },
    { impactSurface: 'concrete', material: 'concrete' },
  );
  builder.ballisticSurfaceSequence += 1;
  builder.shotSurfaces.push(tarmacSurface);
  tarmac.userData.ballisticSurfaceId = tarmacSurface.id;

  for (let z = -10; z <= 30; z += 10) {
    box(builder, 'skyline-tarmac-stripe', [0, 0.02, z], [1.2, 0.03, 4.0], hazardMat, { solid: false, shots: false });
  }

  // A repeated apron grid and stand envelope give the large exterior plane
  // authored scale while remaining one static batch per shared material.
  for (let seamX = -28; seamX <= 28; seamX += 7) {
    detailBox('apron-marking', `skyline-apron-seam-x-${seamX}`, [seamX, 0.023, 8], [0.035, 0.018, 54], stainMat);
  }
  for (let seamZ = -16; seamZ <= 32; seamZ += 8) {
    detailBox('apron-marking', `skyline-apron-seam-z-${seamZ}`, [0, 0.024, seamZ], [68, 0.018, 0.035], stainMat);
  }
  for (const [name, x, z, width, depth] of [
    ['north', 0, -0.15, 43, 0.16],
    ['south', 0, 4.15, 43, 0.16],
    ['west', -21.4, 2, 0.16, 4.45],
    ['east', 21.4, 2, 0.16, 4.45],
  ] as const) {
    detailBox('apron-marking', `skyline-aircraft-stand-${name}`, [x, 0.036, z], [width, 0.025, depth], hazardMat);
  }
  detailBox('apron-marking', 'skyline-apron-lead-in-dark', [0, 0.034, 20], [0.35, 0.025, 28], floorBorderMat);
  detailBox('apron-marking', 'skyline-apron-lead-in-amber', [0, 0.049, 20], [0.12, 0.02, 28], hazardMat);
  for (const [z, rotationY] of [[12, 0.08], [-8, -0.08]] as const) {
    detailBox('apron-marking', `skyline-engine-stain-${z}`, [0, 0.031, z], [3.4, 0.022, 5.2], stainMat, 'performance', [0, rotationY, 0]);
  }

  box(builder, 'skyline-concourse-floor', [0, 0.02, -23], [60, 0.08, 22], floorMat, { solid: false });
  detailBox('floor-language', 'skyline-floor-dark-runner', [0, 0.073, -22.5], [5.2, 0.025, 20.5], floorInsetMat);
  detailBox('floor-language', 'skyline-floor-window-border', [0, 0.074, -12.55], [59.2, 0.028, 0.52], floorBorderMat);
  detailBox('floor-language', 'skyline-floor-backwall-border', [0, 0.074, -33.4], [59.2, 0.028, 0.52], floorBorderMat);
  for (let tileX = -27; tileX <= 27; tileX += 6) {
    detailBox('floor-language', `skyline-floor-joint-x-${tileX}`, [tileX, 0.076, -23], [0.025, 0.018, 20.2], floorBorderMat);
  }
  for (let tileZ = -31; tileZ <= -15; tileZ += 4) {
    detailBox('floor-language', `skyline-floor-joint-z-${tileZ}`, [0, 0.077, tileZ], [58.5, 0.018, 0.025], floorBorderMat);
  }
  // Split the mezzanine around both escalators. A monolithic slab creates a
  // low underside above each ramp and physically stops the character halfway.
  box(builder, 'skyline-concourse-mezzanine', [0, 3.2, -31.25], [52, 0.28, 5.5], floorMat);
  box(builder, 'skyline-mezzanine-front-center', [0, 3.2, -25.25], [36.4, 0.28, 6.5], floorMat);
  box(builder, 'skyline-mezzanine-front-west', [-23.8, 3.2, -25.25], [4.4, 0.28, 6.5], floorMat);
  box(builder, 'skyline-mezzanine-front-east', [23.8, 3.2, -25.25], [4.4, 0.28, 6.5], floorMat);
  detailBox('floor-language', 'skyline-mezzanine-front-edge', [0, 3.36, -22.12], [52, 0.12, 0.34], floorBorderMat);
  for (const x of [-23.5, -16, -8, 0, 8, 16, 23.5]) {
    detailBox('floor-language', `skyline-mezzanine-inlay-${x}`, [x, 3.355, -27.1], [0.035, 0.025, 12.8], floorBorderMat);
  }
  // Split the front rail around the central gate connector so the route does
  // not visually pass through a barrier.
  box(builder, 'skyline-mezzanine-rail', [-14, 4.2, -22.1], [24, 1.1, 0.15], trimMat, { solid: false, detail: 'performance' });
  box(builder, 'skyline-mezzanine-rail', [14, 4.2, -22.1], [24, 1.1, 0.15], trimMat, { solid: false, detail: 'performance' });
  box(builder, 'skyline-gate-connector-floor', [0, 3.2, -17], [3.6, 0.24, 10], jetbridgeMat);
  box(builder, 'skyline-gate-connector-rail-left', [-1.75, 4.15, -17], [0.12, 1.7, 10], trimMat, { solid: false, detail: 'performance' });
  box(builder, 'skyline-gate-connector-rail-right', [1.75, 4.15, -17], [0.12, 1.7, 10], trimMat, { solid: false, detail: 'performance' });

  const mainSign = box(builder, 'skyline-terminal-main-sign', [0, 6.2, -33.8], [14.0, 1.2, 0.2], terminalWayfindingMaterial('SKYLINE TERMINAL', 'GATES 01—12  •  CONCOURSE A', '#d69a2d'), { solid: false, shots: false, detail: 'performance' });
  mainSign.userData.label = 'SKYLINE TERMINAL - GATES 1-12';
  mainSign.userData.skylineCluster = 'terminal-story';

  const flightDisplay = box(builder, 'skyline-flight-display-board', [0, 4.8, -27.8], [6.5, 1.4, 0.25], terminalWayfindingMaterial('DEPARTURES', 'AERO 86  •  BOARDING', '#4d9b98'), { solid: false, shots: false, detail: 'quality' });
  flightDisplay.userData.label = 'DEPARTURES - FLIGHT AERO 86';
  flightDisplay.userData.skylineCluster = 'terminal-story';

  const rampAngle = (22 * Math.PI) / 180;
  const rampLen = 3.2 / Math.sin(rampAngle);
  for (const sideX of [-20, 20]) {
    box(builder, 'skyline-concourse-escalator', [sideX, 1.6, -24.5], [3.2, 0.25, rampLen], jetbridgeMat, {
      // Positive X rotation climbs from the front concourse toward -Z and the
      // mezzanine. Gemini's negative sign inverted the physical route.
      rotation: [rampAngle, 0, 0],
    });
    for (const railX of [sideX - 1.48, sideX + 1.48]) {
      detailBox('escalator-detail', `skyline-escalator-side-${railX}`, [railX, 1.82, -24.5], [0.14, 0.44, rampLen + 0.35], wallLowerMat, 'performance', [rampAngle, 0, 0], true);
      detailBox('escalator-detail', `skyline-escalator-rail-${railX}`, [railX, 2.45, -24.5], [0.09, 0.09, rampLen + 0.3], structureMat, 'performance', [rampAngle, 0, 0]);
    }
    for (let tread = -3.6; tread <= 3.6; tread += 0.72) {
      const y = 1.6 - tread * Math.sin(rampAngle) + 0.17;
      const z = -24.5 + tread * Math.cos(rampAngle);
      detailBox('escalator-detail', `skyline-escalator-tread-${sideX}-${tread.toFixed(2)}`, [sideX, y, z], [2.85, 0.055, 0.18], rubberMat, 'performance', [rampAngle, 0, 0]);
    }
    detailBox('escalator-detail', `skyline-escalator-comb-foot-${sideX}`, [sideX, 0.095, -20.45], [3.05, 0.04, 0.5], hazardMat);
    detailBox('escalator-detail', `skyline-escalator-comb-top-${sideX}`, [sideX, 3.375, -28.45], [3.05, 0.04, 0.5], hazardMat);
    detailBox('escalator-detail', `skyline-escalator-underlight-${sideX}`, [sideX, 1.38, -24.5], [2.3, 0.06, rampLen - 0.45], practicalMat, 'performance', [rampAngle, 0, 0]);
  }

  box(builder, 'skyline-terminal-backwall', [0, 3.5, -34.1], [62, 7.0, 0.4], wallMat);
  box(builder, 'skyline-terminal-leftwall', [-31.1, 3.5, -23], [0.4, 7.0, 22.6], wallMat);
  box(builder, 'skyline-terminal-rightwall', [31.1, 3.5, -23], [0.4, 7.0, 22.6], wallMat);
  detailBox('wall-structure', 'skyline-backwall-wainscot', [0, 1.05, -33.84], [60.8, 2.1, 0.14], wallLowerMat);
  for (const columnX of [-28, -21, -14, -7, 0, 7, 14, 21, 28]) {
    detailBox('wall-structure', `skyline-backwall-column-${columnX}`, [columnX, 3.5, -33.69], [0.34, 7, 0.26], structureMat, 'performance', undefined, true);
  }
  for (const sideX of [-30.84, 30.84]) {
    detailBox('wall-structure', `skyline-sidewall-wainscot-${sideX}`, [sideX, 1.05, -23], [0.14, 2.1, 21.8], wallLowerMat);
    for (const columnZ of [-32, -27, -22, -17, -12.5]) {
      detailBox('wall-structure', `skyline-sidewall-column-${sideX}-${columnZ}`, [sideX, 3.5, columnZ], [0.26, 7, 0.34], structureMat, 'performance', undefined, true);
    }
  }
  for (const ribZ of [-32.5, -28.5, -24.5, -20.5, -16.5, -12.7]) {
    detailBox('wall-structure', `skyline-ceiling-rib-${ribZ}`, [0, 6.78, ribZ], [60.5, 0.2, 0.28], structureMat, 'performance', undefined, true);
    for (const lightX of [-20, -10, 0, 10, 20]) {
      detailBox('terminal-story', `skyline-ceiling-practical-${ribZ}-${lightX}`, [lightX, 6.64, ribZ + 0.18], [6.4, 0.055, 0.1], practicalMat);
    }
  }

  for (const archX of [-6, 6]) {
    box(builder, 'skyline-security-scanner', [archX, 1.35, -20], [0.35, 2.7, 1.8], trimMat);
    detailBox('terminal-story', `skyline-security-crown-${archX}`, [archX, 2.64, -20], [2.1, 0.18, 1.85], structureMat);
    detailBox('terminal-story', `skyline-security-lamp-${archX}`, [archX, 2.51, -20.82], [1.25, 0.08, 0.08], practicalMat);
  }
  box(builder, 'skyline-security-belt', [0, 0.55, -20], [8.0, 1.1, 1.4], wallMat);
  detailBox('terminal-story', 'skyline-security-belt-top', [0, 1.13, -20], [8.15, 0.12, 1.52], rubberMat);

  box(builder, 'skyline-cafe-counter', [-14, 0.55, -28], [5.5, 1.1, 2.8], kioskMat);
  box(builder, 'skyline-dutyfree-kiosk', [14, 0.55, -28], [5.5, 1.1, 2.8], kioskMat);
  for (const x of [-14, 14]) {
    detailBox('terminal-story', `skyline-kiosk-countertop-${x}`, [x, 1.14, -28], [5.8, 0.14, 3.05], structureMat);
    detailBox('terminal-story', `skyline-kiosk-front-band-${x}`, [x, 0.58, -26.54], [4.6, 0.36, 0.12], hazardMat);
    detailBox('terminal-story', `skyline-kiosk-canopy-${x}`, [x, 2.65, -28], [5.9, 0.22, 3.1], floorBorderMat, 'performance', undefined, true);
    for (const postX of [x - 2.55, x + 2.55]) {
      detailBox('terminal-story', `skyline-kiosk-post-${postX}`, [postX, 1.88, -28], [0.12, 1.45, 0.12], structureMat);
    }
  }

  box(builder, 'skyline-baggage-claim-carousel', [0, 0.4, -31], [9.5, 0.8, 4.2], kioskMat);
  detailBox('terminal-story', 'skyline-baggage-rubber-belt', [0, 0.84, -31], [8.8, 0.12, 3.55], rubberMat);
  detailBox('terminal-story', 'skyline-baggage-bumper-north', [0, 0.9, -29.1], [9.4, 0.18, 0.16], structureMat);
  detailBox('terminal-story', 'skyline-baggage-bumper-south', [0, 0.9, -32.9], [9.4, 0.18, 0.16], structureMat);
  detailBox('terminal-story', 'skyline-baggage-bumper-west', [-4.6, 0.9, -31], [0.16, 0.18, 3.65], structureMat);
  detailBox('terminal-story', 'skyline-baggage-bumper-east', [4.6, 0.9, -31], [0.16, 0.18, 3.65], structureMat);
  box(builder, 'skyline-baggage-item-1', [-2.5, 0.9, -31], [1.1, 0.5, 0.7], cargoMat, { solid: false, detail: 'quality' });
  box(builder, 'skyline-baggage-item-2', [2.2, 0.9, -31], [0.9, 0.45, 0.65], hazardMat, { solid: false, detail: 'quality' });

  const breakableWindows: BreakableWindow[] = [];
  for (const winX of [-22, -14, -6, 6, 14, 22]) {
    const windowId = `skyline-window-${winX}`;
    const winMesh = box(builder, `skyline-facade-window-${winX}`, [winX, 2.5, -12], [6.8, 5.0, 0.2], glassMat, {
      solid: false, shots: true, ballisticMaterial: 'glass', breakableWindowId: windowId,
    });
    winMesh.userData.breakableWindowId = windowId;
    winMesh.userData.dynamic = true;
    breakableWindows.push({ id: windowId, mesh: winMesh, broken: false });
    detailBox('window-frame', `skyline-window-frame-top-${winX}`, [winX, 5.04, -11.86], [7.15, 0.18, 0.24], structureMat, 'performance', undefined, true);
    detailBox('window-frame', `skyline-window-frame-bottom-${winX}`, [winX, 0.14, -11.86], [7.15, 0.2, 0.24], structureMat);
    detailBox('window-frame', `skyline-window-frame-left-${winX}`, [winX - 3.48, 2.58, -11.86], [0.18, 5.1, 0.24], structureMat, 'performance', undefined, true);
    detailBox('window-frame', `skyline-window-frame-right-${winX}`, [winX + 3.48, 2.58, -11.86], [0.18, 5.1, 0.24], structureMat, 'performance', undefined, true);
    detailBox('window-frame', `skyline-window-mullion-${winX}`, [winX, 2.58, -11.84], [0.11, 4.95, 0.2], structureMat);
  }

  box(builder, 'skyline-jetbridge-bellows', [0, 4.3, -11.8], [4.1, 2.6, 0.5], jetbridgeMat, { solid: false, shots: false, detail: 'quality' });

  box(builder, 'skyline-jetbridge-floor', [0, 3.2, -7], [3.6, 0.24, 10], jetbridgeMat);
  box(builder, 'skyline-jetbridge-wall-left', [-1.75, 4.4, -6], [0.15, 2.2, 12], wallMat);
  box(builder, 'skyline-jetbridge-wall-right', [1.75, 4.4, -6], [0.15, 2.2, 12], wallMat);
  box(builder, 'skyline-jetbridge-roof', [0, 5.5, -6], [3.6, 0.15, 12], jetbridgeMat, { solid: false, shots: false });
  const jetbridgeRampAngle = Math.atan2(0.79, 2.2);
  box(builder, 'skyline-jetbridge-cabin-ramp', [0, 2.935, -1], [3.6, 0.24, 2.2], jetbridgeMat, {
    rotation: [jetbridgeRampAngle, 0, 0],
  });
  for (const legZ of [-10, -2]) {
    box(builder, 'skyline-jetbridge-leg', [0, 1.5, legZ], [0.4, 3.0, 0.4], jetbridgeMat, { solid: false });
  }
  for (const ribZ of [-10.8, -8.8, -6.8, -4.8, -2.8]) {
    detailBox('wall-structure', `skyline-jetbridge-rib-left-${ribZ}`, [-1.86, 4.4, ribZ], [0.16, 2.45, 0.2], structureMat);
    detailBox('wall-structure', `skyline-jetbridge-rib-right-${ribZ}`, [1.86, 4.4, ribZ], [0.16, 2.45, 0.2], structureMat);
    detailBox('wall-structure', `skyline-jetbridge-rib-roof-${ribZ}`, [0, 5.47, ribZ], [3.9, 0.16, 0.2], structureMat);
  }
  detailBox('floor-language', 'skyline-gate-threshold-terminal', [0, 3.35, -11.65], [3.35, 0.04, 0.42], hazardMat);
  detailBox('floor-language', 'skyline-gate-threshold-aircraft', [0, 2.69, -0.18], [3.35, 0.04, 0.42], hazardMat);
  detailBox('terminal-story', 'skyline-jetbridge-light-spine', [0, 5.38, -6.2], [0.24, 0.06, 10.2], practicalMat);

  box(builder, 'skyline-jetliner-fuselage-top', [0, 5.8, 2.0], [36.0, 1.2, 4.2], planeHullMat);
  box(builder, 'skyline-jetliner-cabin-floor', [0, 2.4, 2.0], [35.0, 0.3, 3.8], floorMat);
  // Split the north fuselage wall around the jetbridge doorway. A single solid
  // wall made the authored bridge-to-cabin route stop outside the aircraft.
  box(builder, 'skyline-jetliner-side-north', [-9.65, 3.75, 0.2], [15.7, 2.4, 0.2], planeHullMat);
  box(builder, 'skyline-jetliner-side-north', [9.65, 3.75, 0.2], [15.7, 2.4, 0.2], planeHullMat);
  box(builder, 'skyline-jetliner-side-south', [0, 3.75, 3.8], [35.0, 2.4, 0.2], planeHullMat);
  box(builder, 'skyline-jetliner-nose', [-19.0, 3.75, 2.0], [2.2, 2.4, 3.8], trimMat);
  box(builder, 'skyline-jetliner-cockpit-partition', [-16.8, 3.75, 2.0], [0.15, 2.4, 3.6], wallMat, { solid: false, detail: 'quality' });
  box(builder, 'skyline-jetliner-tail', [19.0, 6.3, 2.0], [2.2, 3.0, 0.4], trimMat, { solid: false, shots: false });
  detailBox('aircraft-skin', 'skyline-aircraft-belly-north', [0, 3.12, 0.06], [34.2, 0.58, 0.08], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-aircraft-belly-south', [0, 3.12, 3.94], [34.2, 0.58, 0.08], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-aircraft-roof-spine', [0, 6.43, 2], [33.8, 0.12, 0.54], planeStripeMat, 'quality');
  for (const windowX of [-13.5, -10.5, -7.5, -4.5, 4.5, 7.5, 10.5, 13.5]) {
    detailBox('aircraft-skin', `skyline-cabin-window-north-${windowX}`, [windowX, 4.28, 0.055], [1.28, 0.5, 0.08], cockpitMat);
    detailBox('aircraft-skin', `skyline-cabin-window-south-${windowX}`, [windowX, 4.28, 3.945], [1.28, 0.5, 0.08], cockpitMat);
    detailBox('aircraft-skin', `skyline-cabin-window-cap-north-${windowX}`, [windowX, 4.58, 0.04], [1.42, 0.055, 0.1], planeStripeMat);
    detailBox('aircraft-skin', `skyline-cabin-window-cap-south-${windowX}`, [windowX, 4.58, 3.96], [1.42, 0.055, 0.1], planeStripeMat);
  }
  detailBox('aircraft-skin', 'skyline-cockpit-glass-front', [-20.12, 4.3, 2], [0.08, 0.7, 2.15], cockpitMat);
  detailBox('aircraft-skin', 'skyline-cockpit-glass-north', [-19.2, 4.35, 0.045], [1.55, 0.72, 0.08], cockpitMat, 'performance', [0, 0.12, 0]);
  detailBox('aircraft-skin', 'skyline-cockpit-glass-south', [-19.2, 4.35, 3.955], [1.55, 0.72, 0.08], cockpitMat, 'performance', [0, -0.12, 0]);
  detailBox('aircraft-skin', 'skyline-tail-slate-panel', [19.02, 6.42, 2.22], [1.86, 2.55, 0.06], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-tail-amber-mark', [19.02, 6.55, 2.27], [1.35, 0.28, 0.07], hazardMat);

  for (const seatX of [-12, -8, -4, 4, 8, 12]) {
    box(builder, `skyline-cabin-seat-left-${seatX}`, [seatX, 3.1, 1.1], [1.1, 1.1, 1.0], wallMat);
    box(builder, `skyline-cabin-seat-right-${seatX}`, [seatX, 3.1, 2.9], [1.1, 1.1, 1.0], wallMat);
    box(builder, `skyline-cabin-overhead-bin-left-${seatX}`, [seatX, 4.5, 0.65], [1.8, 0.45, 0.65], planeHullMat, { solid: false, shots: false });
    box(builder, `skyline-cabin-overhead-bin-right-${seatX}`, [seatX, 4.5, 3.35], [1.8, 0.45, 0.65], planeHullMat, { solid: false, shots: false });
    detailBox('terminal-story', `skyline-seat-headrest-left-${seatX}`, [seatX, 3.48, 1.1], [0.78, 0.28, 0.82], planeStripeMat);
    detailBox('terminal-story', `skyline-seat-headrest-right-${seatX}`, [seatX, 3.48, 2.9], [0.78, 0.28, 0.82], planeStripeMat);
    detailBox('terminal-story', `skyline-bin-latch-left-${seatX}`, [seatX, 4.3, 1.0], [0.44, 0.06, 0.05], hazardMat);
    detailBox('terminal-story', `skyline-bin-latch-right-${seatX}`, [seatX, 4.3, 3.0], [0.44, 0.06, 0.05], hazardMat);
  }
  detailBox('floor-language', 'skyline-cabin-aisle-runner', [-0.25, 2.77, 2], [31.8, 0.035, 0.72], floorInsetMat);
  detailBox('terminal-story', 'skyline-cabin-light-north', [-0.5, 5.47, 1.12], [31, 0.07, 0.11], practicalMat);
  detailBox('terminal-story', 'skyline-cabin-light-south', [-0.5, 5.47, 2.88], [31, 0.07, 0.11], practicalMat);
  for (const windowX of [-13.5, -10.5, -7.5, -4.5, 4.5, 7.5, 10.5, 13.5]) {
    detailBox('aircraft-skin', `skyline-cabin-window-inner-north-${windowX}`, [windowX, 4.05, 0.415], [1.26, 0.48, 0.055], cockpitMat);
    detailBox('aircraft-skin', `skyline-cabin-window-inner-south-${windowX}`, [windowX, 4.05, 3.585], [1.26, 0.48, 0.055], cockpitMat);
  }
  for (const ribX of [-14, -11, -8, -5, -2, 1, 4, 7, 10, 13, 16]) {
    detailBox('wall-structure', `skyline-cabin-ceiling-rib-${ribX}`, [ribX, 5.42, 2], [0.11, 0.08, 3.15], structureMat);
  }
  detailBox('terminal-story', 'skyline-cockpit-door-panel', [-16.71, 4.2, 2], [0.055, 1.95, 1.65], structureMat);
  detailBox('terminal-story', 'skyline-cockpit-door-mark', [-16.67, 4.65, 2], [0.04, 0.25, 0.92], hazardMat);
  detailBox('terminal-story', 'skyline-cabin-exit-sign', [15.9, 4.95, 2], [0.1, 0.32, 1.25], practicalMat);

  box(builder, 'skyline-jetliner-wing-port', [0, 2.8, 11.0], [5.0, 0.3, 15.0], planeWingMat);
  box(builder, 'skyline-jetliner-wing-starboard', [0, 2.8, -7.0], [5.0, 0.3, 15.0], planeWingMat);
  box(builder, 'skyline-jetliner-engine-1', [0, 1.6, 12.0], [2.2, 2.2, 4.5], engineMat);
  box(builder, 'skyline-jetliner-engine-2', [0, 1.6, -8.0], [2.2, 2.2, 4.5], engineMat);
  detailBox('aircraft-skin', 'skyline-wingtip-port', [0, 2.99, 18.42], [5.1, 0.08, 0.14], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-wingtip-starboard', [0, 2.99, -14.42], [5.1, 0.08, 0.14], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-wing-navigation-port', [-2.35, 3.06, 18.48], [0.42, 0.16, 0.16], practicalMat);
  detailBox('aircraft-skin', 'skyline-wing-navigation-starboard', [-2.35, 3.06, -14.48], [0.42, 0.16, 0.16], practicalMat);
  const engineNacelles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.95, 0.78, 4.1, 20), planeStripeMat, 2);
  engineNacelles.name = 'skyline-aircraft-engine-nacelles';
  engineNacelles.castShadow = true;
  engineNacelles.receiveShadow = true;
  engineNacelles.userData.presentationOnly = true;
  engineNacelles.userData.rustworksDetail = 'quality';
  engineNacelles.userData.skylineCluster = 'aircraft-skin';
  const nacelleMatrix = new THREE.Matrix4();
  const nacelleRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  for (const [index, z] of [12, -8].entries()) {
    nacelleMatrix.compose(new THREE.Vector3(0, 1.6, z), nacelleRotation, new THREE.Vector3(1, 1, 1));
    engineNacelles.setMatrixAt(index, nacelleMatrix);
  }
  engineNacelles.instanceMatrix.needsUpdate = true;
  root.add(engineNacelles);

  const stairAngle = (32 * Math.PI) / 180;
  const stairLen = 2.4 / Math.sin(stairAngle);
  // Place the high end at the cabin's rear edge instead of burying half the
  // stair beneath the cabin floor.
  box(builder, 'skyline-airstair', [19.4, 1.2, 2.0], [stairLen, 0.2, 2.2], trimMat, {
    rotation: [0, 0, -stairAngle],
  });
  for (const railZ of [0.95, 3.05]) {
    detailBox('escalator-detail', `skyline-airstair-side-${railZ}`, [19.4, 1.42, railZ], [stairLen + 0.2, 0.38, 0.12], wallLowerMat, 'performance', [0, 0, -stairAngle], true);
    detailBox('escalator-detail', `skyline-airstair-rail-${railZ}`, [19.4, 2.05, railZ], [stairLen + 0.1, 0.08, 0.08], structureMat, 'performance', [0, 0, -stairAngle]);
  }
  for (let tread = -1.8; tread <= 1.8; tread += 0.45) {
    const x = 19.4 + tread * Math.cos(stairAngle);
    const y = 1.2 - tread * Math.sin(stairAngle) + 0.15;
    detailBox('escalator-detail', `skyline-airstair-tread-${tread.toFixed(2)}`, [x, y, 2], [0.18, 0.05, 1.94], rubberMat, 'performance', [0, 0, -stairAngle]);
  }
  detailBox('floor-language', 'skyline-airstair-comb-foot', [21.35, 0.08, 2], [0.5, 0.04, 2.15], hazardMat);
  detailBox('floor-language', 'skyline-airstair-comb-top', [17.45, 2.7, 2], [0.5, 0.04, 2.15], hazardMat);

  box(builder, 'skyline-fuel-trailer', [-10, 1.2, 18], [5.8, 2.4, 2.6], hazardMat);
  const fuelTank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5.2, 14), cargoMat);
  fuelTank.name = 'skyline-fuel-trailer-tank';
  fuelTank.rotation.z = Math.PI / 2;
  fuelTank.position.set(-10, 1.5, 18);
  fuelTank.castShadow = true;
  fuelTank.receiveShadow = true;
  fuelTank.userData.presentationOnly = true;
  fuelTank.userData.impactSurface = 'metal';
  root.add(fuelTank);

  for (const [x, z, col] of [
    [-20, 18, cargoMat],
    [20, 18, wallMat],
    [-12, 26, hazardMat],
    [12, 26, cargoMat],
    [0, 28, trimMat],
  ] as const) {
    box(builder, 'skyline-tarmac-cargo', [x, 1.3, z], [4.5, 2.6, 2.6], col);
  }

  for (const [x, z] of [[-8, 14], [8, 14], [-22, 26], [22, 26]] as const) {
    box(builder, 'skyline-luggage-cart', [x, 0.6, z], [2.4, 1.2, 1.6], hazardMat);
    detailBox('terminal-story', `skyline-cart-rubber-top-${x}-${z}`, [x, 1.24, z], [2.2, 0.12, 1.38], rubberMat);
    detailBox('terminal-story', `skyline-cart-rail-north-${x}-${z}`, [x, 1.58, z - 0.69], [2.35, 0.08, 0.08], structureMat);
    detailBox('terminal-story', `skyline-cart-rail-south-${x}-${z}`, [x, 1.58, z + 0.69], [2.35, 0.08, 0.08], structureMat);
    for (const wheelX of [x - 0.82, x + 0.82]) {
      detailBox('terminal-story', `skyline-cart-wheel-${wheelX}-${z}`, [wheelX, 0.22, z - 0.68], [0.42, 0.42, 0.18], rubberMat);
      detailBox('terminal-story', `skyline-cart-wheel-${wheelX}-${z}-south`, [wheelX, 0.22, z + 0.68], [0.42, 0.42, 0.18], rubberMat);
    }
  }
  for (const [x, z] of [[-2.1, 11.5], [2.1, 11.5], [-2.1, -7.5], [2.1, -7.5]] as const) {
    detailBox('apron-marking', `skyline-wheel-chock-${x}-${z}`, [x, 0.18, z], [0.58, 0.34, 0.42], hazardMat, 'performance', [0, Math.PI / 4, 0]);
  }
  for (const bandX of [-12.2, -10, -7.8]) {
    detailBox('terminal-story', `skyline-fuel-tank-band-${bandX}`, [bandX, 1.5, 18], [0.12, 2.3, 2.72], structureMat);
  }

  box(builder, 'skyline-fence-north', [0, 1.5, -35.8], [72, 3.0, 0.4], jetbridgeMat);
  box(builder, 'skyline-fence-south', [0, 1.5, 35.8], [72, 3.0, 0.4], jetbridgeMat);
  box(builder, 'skyline-fence-west', [-35.8, 1.5, 0], [0.4, 3.0, 72], jetbridgeMat);
  box(builder, 'skyline-fence-east', [35.8, 1.5, 0], [0.4, 3.0, 72], jetbridgeMat);

  const physicalCover: ArenaMap['physicalCover'] = [
    { id: 'jetliner-engine-south', bounds: { minX: -1.1, maxX: 1.1, minZ: 9.75, maxZ: 14.25 }, blocksMovement: true, blocksShots: true },
    { id: 'terminal-backwall', bounds: { minX: -31, maxX: 31, minZ: -34.3, maxZ: -33.9 }, blocksMovement: true, blocksShots: true },
    { id: 'cargo-stack-north', bounds: { minX: -22.3, maxX: -17.7, minZ: 16.7, maxZ: 19.3 }, blocksMovement: true, blocksShots: true },
    { id: 'cargo-stack-south', bounds: { minX: 17.7, maxX: 22.3, minZ: 16.7, maxZ: 19.3 }, blocksMovement: true, blocksShots: true },
    { id: 'fuel-trailer-station', bounds: { minX: -13.0, maxX: -7.0, minZ: 16.6, maxZ: 19.4 }, blocksMovement: true, blocksShots: true },
  ];

  root.userData.skylinePresentationBatches = batchPresentationOnlyBoxes(root);

  root.userData.skylineRoutes = {
    'concourse-to-mezzanine': [
      { id: 'escalator-foot', position: [-20, 1.7, -20.45] },
      { id: 'escalator-top', position: [-20, 5.04, -28.45] },
      { id: 'mezzanine-center', position: [0, 5.04, -28.0] },
    ],
    'mezzanine-to-jetbridge': [
      { id: 'mezzanine-gate', position: [0, 5.04, -22.0] },
      { id: 'gate-connector', position: [0, 5.02, -17.0] },
      { id: 'jetbridge-interior', position: [0, 5.02, -7.0] },
      { id: 'jetbridge-ramp-top', position: [0, 5.02, -2.03] },
      { id: 'cabin-door', position: [0, 4.25, 0.4] },
    ],
    'fuselage-to-tarmac': [
      { id: 'cabin-rear', position: [14.0, 4.25, 2.0] },
      { id: 'airstair-top', position: [17.45, 4.25, 2.0] },
      { id: 'airstair-foot', position: [21.35, 1.7, 2.0] },
      { id: 'apron-tarmac', position: [24.0, 1.7, 2.0] },
    ],
  };

  root.userData.verticalNavigation = {
    routes: [
      { id: 'west-escalator', foot: [-20, 0, -20.45], top: [-20, 3.34, -28.45] },
      { id: 'east-escalator', foot: [20, 0, -20.45], top: [20, 3.34, -28.45] },
      { id: 'rear-airstair', foot: [21.35, 0, 2], top: [17.45, 2.55, 2] },
    ],
    ramps: [
      { id: 'west-escalator', from: [-20, 0, -20.45], to: [-20, 3.34, -28.45], width: 3.2 },
      { id: 'east-escalator', from: [20, 0, -20.45], to: [20, 3.34, -28.45], width: 3.2 },
      { id: 'jetbridge-cabin-ramp', from: [0, 3.32, -2.03], to: [0, 2.55, 0.03], width: 3.6 },
      { id: 'rear-airstair', from: [21.35, 0, 2], to: [17.45, 2.55, 2], width: 2.2 },
    ],
    platforms: [
      { id: 'mezzanine-back', minX: -26, maxX: 26, minZ: -34, maxZ: -28.5, y: 3.34 },
      { id: 'mezzanine-front-center', minX: -18.2, maxX: 18.2, minZ: -28.5, maxZ: -22, y: 3.34 },
      { id: 'mezzanine-front-west', minX: -26, maxX: -21.6, minZ: -28.5, maxZ: -22, y: 3.34 },
      { id: 'mezzanine-front-east', minX: 21.6, maxX: 26, minZ: -28.5, maxZ: -22, y: 3.34 },
      { id: 'gate-connector', minX: -1.8, maxX: 1.8, minZ: -22, maxZ: -12, y: 3.32 },
      { id: 'jetbridge', minX: -1.8, maxX: 1.8, minZ: -12, maxZ: -2, y: 3.32 },
      { id: 'jetliner-cabin', minX: -17.5, maxX: 17.5, minZ: 0.1, maxZ: 3.9, y: 2.55 },
    ],
  };

  root.userData.skylineAccess = {
    escalatorAngleDegrees: 22,
    jetbridgeRampAngleDegrees: THREE.MathUtils.radToDeg(jetbridgeRampAngle),
    airstairAngleDegrees: 32,
    maxClimbDegrees: 50,
  };

  return {
    id: 'skyline-terminal',
    label: 'Skyline Terminal',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(
      [
        [-24, -30], [-16, -30], [-8, -30], [8, -30], [16, -30], [24, -30],
      ],
      [
        [-24, 30], [-16, 30], [-8, 30], [8, 30], [16, 30], [24, 30],
      ],
    ),
    patrolPoints: [
      [-26, -18], [-16, -18], [-8, -18], [8, -18], [16, -18], [26, -18], [0, 8],
      [-18, 12], [18, 12], [-26, 24], [-4, 24], [4, 24], [26, 24], [0, 32],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows,
    physicalCover,
    bounds: { minX: -35, maxX: 35, minZ: -35, maxZ: 35 },
    houseTelemetry: emptyTelemetry(),
  };
}
