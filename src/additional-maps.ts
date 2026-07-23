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
import { createRustworksWelshFlag } from './rustworks-flag';

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

/** Presentation-only beam between two authored points. */
function presentationBeam(
  builder: Builder,
  name: string,
  start: [number, number, number],
  end: [number, number, number],
  width: number,
  material: THREE.Material,
  detail: 'performance' | 'quality' = 'performance',
): THREE.Mesh {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const delta = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, width, delta.length()), material);
  mesh.name = name;
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.copy(delta.clone().normalize().lengthSq() > 0
    ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.clone().normalize())
    : new THREE.Quaternion());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.impactSurface = 'metal';
  mesh.userData.rustworksDetail = detail;
  mesh.userData.presentationBatchCandidate = true;
  builder.root.add(mesh);
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
  undercroftPassageWidth: 3.1,
  undercroftClearHeight: 2.75,
  openContainerClearWidth: 2.32,
  openContainerClearHeight: 2.46,
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

  // Four load-bearing legs remain authoritative. Armoured corner modules wrap
  // their bases and turn the lower deck into two intersecting maintenance
  // tunnels instead of a visually noisy open brace cage.
  for (const x of [-3.2, 3.2]) for (const z of [-3.2, 3.2]) {
    box(builder, 'rustworks-tower-leg', [x, 5.4, z], [0.58, 10.8, 0.58], steelBright);
    box(builder, 'rustworks-tower-leg-base', [x, 0.28, z], [0.95, 0.56, 0.95], concrete);
  }
  const undercroftModuleSize = 2.2;
  const undercroftModuleOffset = (RUSTWORKS_TOWER.undercroftPassageWidth + undercroftModuleSize) / 2;
  for (const x of [-undercroftModuleOffset, undercroftModuleOffset]) {
    for (const z of [-undercroftModuleOffset, undercroftModuleOffset]) {
      const module = box(
        builder,
        'rustworks-undercroft-module',
        [x, RUSTWORKS_TOWER.undercroftClearHeight / 2, z],
        [undercroftModuleSize, RUSTWORKS_TOWER.undercroftClearHeight, undercroftModuleSize],
        rustDark,
        { ballisticMaterial: 'structural-metal' },
      );
      module.userData.rustworksRouteRole = 'undercroft-corner-cover';
      box(builder, 'rustworks-undercroft-module-cap', [x, RUSTWORKS_TOWER.undercroftClearHeight - 0.08, z], [2.45, 0.16, 2.45], hazardDark, {
        solid: false,
        shots: false,
        detail: 'performance',
      });
    }
  }
  box(builder, 'rustworks-undercroft-floor-east-west', [0, 0.045, 0], [8.1, 0.05, 2.7], grate, { solid: false, cast: false, shots: false });
  box(builder, 'rustworks-undercroft-floor-north-south', [0, 0.05, 0], [2.7, 0.05, 8.1], grate, { solid: false, cast: false, shots: false });
  for (const [x, z, sx, sz] of [
    [0, -4.0, 3.25, 0.12], [0, 4.0, 3.25, 0.12], [-4.0, 0, 0.12, 3.25], [4.0, 0, 0.12, 3.25],
  ] as const) {
    box(builder, 'rustworks-undercroft-portal-header', [x, 2.72, z], [sx, 0.18, sz], hazard, { solid: false, shots: false, detail: 'performance' });
  }

  // Sparse upper-bay X-bracing preserves the oil-rig read without blocking the
  // undercroft portals or recreating the former cage silhouette.
  for (const z of [-3.35, 3.35]) {
    for (const [y0, y1] of [[3.7, 7.85], [8.45, 11.1]] as const) {
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
    for (const [y0, y1] of [[3.7, 7.85], [8.45, 11.1]] as const) {
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
  const shipLadderAuthority = box(
    builder,
    'rustworks-ship-ladder',
    [shipX, shipPosY, shipCenterZ],
    [shipWidth, shipThickness, shipLength],
    steelBright,
    { rotation: shipRotation },
  );
  const invisibleAuthorityMaterial = steelBright.clone();
  invisibleAuthorityMaterial.name = 'rustworks-ship-ladder-collision-authority';
  invisibleAuthorityMaterial.visible = false;
  shipLadderAuthority.material = invisibleAuthorityMaterial;
  shipLadderAuthority.userData.collisionOnly = true;
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
      detail: 'performance',
    });
  }
  for (const side of [-1, 1] as const) {
    box(
      builder,
      'rustworks-ship-ladder-stringer',
      [shipX + side * (shipWidth / 2 + 0.02), shipPosY - 0.08, shipCenterZ],
      [0.08, 0.18, shipLength + 0.08],
      oxide,
      { solid: false, rotation: shipRotation, detail: 'performance' },
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

  // A tapered derrick crown replaces the former flat canopy slab. Every member
  // terminates at a supported ring, keeping the silhouette tall but coherent.
  const derrickBaseY = upperTop + 0.15;
  const derrickRingY = 11.35;
  const derrickTopY = 14.35;
  for (const x of [-2.75, 2.75]) for (const z of [-2.75, 2.75]) {
    presentationBeam(
      builder,
      'rustworks-derrick-leg',
      [x, derrickBaseY, z],
      [Math.sign(x) * 0.78, derrickTopY, Math.sign(z) * 0.78],
      0.22,
      x === z ? rust : steelBright,
      'performance',
    );
  }
  for (const y of [derrickRingY, derrickTopY] as const) {
    const half = y === derrickRingY ? 1.9 : 0.84;
    box(builder, 'rustworks-derrick-ring', [0, y, -half], [half * 2, 0.16, 0.16], steelBright, { solid: false, shots: false, detail: 'performance' });
    box(builder, 'rustworks-derrick-ring', [0, y, half], [half * 2, 0.16, 0.16], steelBright, { solid: false, shots: false, detail: 'performance' });
    box(builder, 'rustworks-derrick-ring', [-half, y, 0], [0.16, 0.16, half * 2], steelBright, { solid: false, shots: false, detail: 'performance' });
    box(builder, 'rustworks-derrick-ring', [half, y, 0], [0.16, 0.16, half * 2], steelBright, { solid: false, shots: false, detail: 'performance' });
  }
  box(builder, 'rustworks-derrick-service-platform', [0, derrickRingY - 0.12, 0], [4.3, 0.18, 4.3], grate, { solid: false, shots: false, detail: 'quality' });
  box(builder, 'rustworks-derrick-beacon-mast', [0, 15.05, 0], [0.16, 1.4, 0.16], hazard, { solid: false, shots: false, detail: 'quality' });
  box(builder, 'rustworks-derrick-beacon', [0, 15.78, 0], [0.42, 0.18, 0.42], hazard, { solid: false, shots: false, detail: 'quality' });

  // West-side maintenance trench: a deck-level, grated service lane with low
  // blast walls and repeated lateral exits. The continuous physics floor means
  // the lane reads as recessed without introducing a cross-map floor-hole rule.
  const trenchX = -13.8;
  const trenchWallXs = [trenchX - 1.85, trenchX + 1.85] as const;
  const trenchSegments = [-12, 0, 12] as const;
  box(builder, 'rustworks-service-trench-floor', [trenchX, 0.045, 0], [3.4, 0.05, 34], grate, { solid: false, cast: false, shots: false });
  for (const x of trenchWallXs) {
    for (const z of trenchSegments) {
      const wall = box(builder, 'rustworks-service-trench-wall', [x, 0.65, z], [0.32, 1.3, 7], concreteDark);
      wall.userData.rustworksRouteRole = 'west-service-trench-cover';
      box(builder, 'rustworks-service-trench-coping', [x, 1.34, z], [0.46, 0.08, 7.05], hazard, {
        solid: false,
        shots: false,
        detail: 'performance',
      });
    }
  }
  // The former mixed crate/pallet/low-wall clusters read as random floating
  // debris. Keep the service cross completely clean and use only the authored
  // freight-container vocabulary for yard cover.
  root.userData.rustworksCentreCoverAudit = {
    styles: [],
    count: 0,
    deckGroundY: 0,
    minimumTowerDistance: null,
    removedMixedCover: true,
    lanesPreserved: ['north-south-service', 'east-west-service', 'west-trench', 'tower-undercroft'],
  };
  // Twenty-four containers: 18 closed + 6 open (75/25). Three open at both
  // ends and three at one end, exactly matching the requested freight mix.
  const perimeterSlots = [-18, -10.8, -3.6, 3.6, 10.8, 18] as const;
  const perimeterRow = 21.5;
  type ContainerOpening = 'closed' | 'open-both' | 'open-one';
  const openingFor = (side: 'north' | 'south' | 'west' | 'east', slot: number): ContainerOpening => {
    if (side === 'north' && slot === 1) return 'open-both';
    if (side === 'south' && slot === 2) return 'open-both';
    if (side === 'east' && slot === 4) return 'open-both';
    if (side === 'north' && slot === 4) return 'open-one';
    if (side === 'south' && slot === 5) return 'open-one';
    if (side === 'west' && slot === 1) return 'open-one';
    return 'closed';
  };
  const containerRows = [
    ...perimeterSlots.map((x, slot) => ({ side: 'north' as const, slot, x, z: -perimeterRow, opening: openingFor('north', slot) })),
    ...perimeterSlots.map((x, slot) => ({ side: 'south' as const, slot, x, z: perimeterRow, opening: openingFor('south', slot) })),
    ...perimeterSlots.map((z, slot) => ({ side: 'west' as const, slot, x: -perimeterRow, z, opening: openingFor('west', slot) })),
    ...perimeterSlots.map((z, slot) => ({ side: 'east' as const, slot, x: perimeterRow, z, opening: openingFor('east', slot) })),
  ] as const;
  const containerPalette = [hazardDark, rustDark, tarp] as const;
  const openContainerRoutes: Array<{ id: string; side: string; axis: 'x' | 'z'; anchors: [number, number, number][] }> = [];
  for (const [index, placement] of containerRows.entries()) {
    const alongX = placement.side === 'north' || placement.side === 'south';
    const containerSize: [number, number, number] = alongX ? [5.8, 2.6, 2.5] : [2.5, 2.6, 5.8];
    const marker = new THREE.Group();
    marker.name = 'rustworks-container-placement';
    marker.position.set(placement.x, 0, placement.z);
    marker.userData.rustworksContainerSide = placement.side;
    marker.userData.rustworksContainerSlot = placement.slot;
    marker.userData.rustworksContainerType = placement.opening;
    root.add(marker);

    if (placement.opening !== 'closed') {
      const thickness = 0.14;
      const material = containerPalette[placement.slot % containerPalette.length];
      const shellParts = alongX
        ? [
          { suffix: 'wall-a', position: [placement.x, 1.3, placement.z - (containerSize[2] - thickness) / 2], size: [containerSize[0], containerSize[1], thickness] },
          { suffix: 'wall-b', position: [placement.x, 1.3, placement.z + (containerSize[2] - thickness) / 2], size: [containerSize[0], containerSize[1], thickness] },
          { suffix: 'roof', position: [placement.x, containerSize[1] - thickness / 2, placement.z], size: [containerSize[0], thickness, containerSize[2]] },
        ]
        : [
          { suffix: 'wall-a', position: [placement.x - (containerSize[0] - thickness) / 2, 1.3, placement.z], size: [thickness, containerSize[1], containerSize[2]] },
          { suffix: 'wall-b', position: [placement.x + (containerSize[0] - thickness) / 2, 1.3, placement.z], size: [thickness, containerSize[1], containerSize[2]] },
          { suffix: 'roof', position: [placement.x, containerSize[1] - thickness / 2, placement.z], size: [containerSize[0], thickness, containerSize[2]] },
        ];
      for (const part of shellParts) {
        const shell = box(
          builder,
          `rustworks-open-container-${part.suffix}`,
          part.position as [number, number, number],
          part.size as [number, number, number],
          material,
        );
        shell.userData.rustworksContainerSide = placement.side;
        shell.userData.rustworksContainerSlot = placement.slot;
      }
      box(builder, `rustworks-open-container-floor-${index}`, [placement.x, 0.045, placement.z], [containerSize[0], 0.05, containerSize[2]], grate, {
        solid: false,
        shots: false,
        cast: false,
        detail: 'performance',
      });
      if (placement.opening === 'open-one') {
        const endThickness = 0.16;
        const closesPositiveEnd = (placement.side === 'north' || placement.side === 'west');
        const direction = closesPositiveEnd ? 1 : -1;
        const endPosition: [number, number, number] = alongX
          ? [placement.x + direction * (containerSize[0] - endThickness) / 2, 1.3, placement.z]
          : [placement.x, 1.3, placement.z + direction * (containerSize[2] - endThickness) / 2];
        const endSize: [number, number, number] = alongX
          ? [endThickness, containerSize[1], containerSize[2]]
          : [containerSize[0], containerSize[1], endThickness];
        const end = box(builder, 'rustworks-open-one-container-closed-end', endPosition, endSize, material);
        end.userData.rustworksContainerSide = placement.side;
        end.userData.rustworksContainerSlot = placement.slot;
      } else {
        const halfLength = (alongX ? containerSize[0] : containerSize[2]) / 2;
        openContainerRoutes.push({
          id: `open-container-${placement.side}-${placement.slot}`,
          side: placement.side,
          axis: alongX ? 'x' : 'z',
          anchors: alongX
            ? [[placement.x - halfLength - 0.5, 1.7, placement.z], [placement.x, 1.7, placement.z], [placement.x + halfLength + 0.5, 1.7, placement.z]]
            : [[placement.x, 1.7, placement.z - halfLength - 0.5], [placement.x, 1.7, placement.z], [placement.x, 1.7, placement.z + halfLength + 0.5]],
        });
      }
    } else {
      const container = box(
        builder,
        'rustworks-shipping-container',
        [placement.x, 1.3, placement.z],
        containerSize,
        containerPalette[placement.slot % containerPalette.length],
      );
      container.userData.rustworksContainerSide = placement.side;
      container.userData.rustworksContainerSlot = placement.slot;

      // Three strong ribs read more cleanly than five thin stripes at combat distance.
      for (const offset of [-1.45, 0, 1.45]) {
        const ribPosition: [number, number, number] = alongX
          ? [placement.x + offset, 1.3, placement.z + (placement.side === 'north' ? -1.27 : 1.27)]
          : [placement.x + (placement.side === 'west' ? -1.27 : 1.27), 1.3, placement.z + offset];
        box(builder, `rustworks-container-rib-${index}`, ribPosition, alongX ? [0.08, 2.2, 0.05] : [0.05, 2.2, 0.08], steelBright, {
          solid: false,
          shots: false,
          cast: false,
          detail: 'performance',
        });
      }
    }
  }

  root.userData.rustworksContainerLayout = {
    total: containerRows.length,
    closed: containerRows.filter((placement) => placement.opening === 'closed').length,
    open: containerRows.filter((placement) => placement.opening !== 'closed').length,
    openBothEnds: containerRows.filter((placement) => placement.opening === 'open-both').length,
    openOneEnd: containerRows.filter((placement) => placement.opening === 'open-one').length,
    closedPercent: 75,
    openPercent: 25,
    perSide: 6,
    slots: [...perimeterSlots],
    row: perimeterRow,
    minimumEndGap: 7.2 - 5.8,
    onlyShippingContainers: true,
  };
  root.userData.rustworksOpenContainerRoutes = openContainerRoutes;
  root.userData.rustworksUndercroft = {
    passageWidth: RUSTWORKS_TOWER.undercroftPassageWidth,
    clearHeight: RUSTWORKS_TOWER.undercroftClearHeight,
    portals: ['north', 'south', 'west', 'east'],
  };
  root.userData.rustworksTrench = {
    side: 'west',
    x: trenchX,
    width: 3.4,
    segmentCentres: [...trenchSegments],
    lateralExitGaps: 4,
  };

  const labelBoard = box(builder, 'rustworks-original-arena-sign', [0, 11.1, 2.15], [3.8, 0.72, 0.12], hazard, { solid: false, shots: false, detail: 'performance' });
  labelBoard.userData.label = 'RUSTWORKS';
  const welshFlag = createRustworksWelshFlag();
  root.add(welshFlag);
  root.userData.rustworksFlagAudit = welshFlag.userData.rustworksFlagAudit;

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
    'undercroft-east-west': [
      { id: 'undercroft-west-portal', position: [-5.2, 1.7, 0] },
      { id: 'undercroft-centre-ew', position: [0, 1.7, 0] },
      { id: 'undercroft-east-portal', position: [5.2, 1.7, 0] },
    ],
    'undercroft-north-south': [
      { id: 'undercroft-north-portal', position: [0, 1.7, -5.2] },
      { id: 'undercroft-centre-ns', position: [0, 1.7, 0] },
      { id: 'undercroft-south-portal', position: [0, 1.7, 5.2] },
    ],
    'west-service-trench': [
      { id: 'trench-north', position: [trenchX, 1.7, -17] },
      { id: 'trench-centre', position: [trenchX, 1.7, 0] },
      { id: 'trench-south', position: [trenchX, 1.7, 17] },
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

  // Six spawns per side for private lobbies up to 6. Keep them just inside the
  // container ring so deployment never starts in a narrow exterior service gap.
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
        [0, 19], [-13, 19], [13, 19], [-19, 11], [-19, 0], [-13, 14],
      ],
      [
        [0, -19], [13, -19], [-13, -19], [19, -11], [19, 0], [13, -14],
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
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node.userData.skylineQualityPlaceholder !== true) return;
    const replaced = allowQuality;
    node.castShadow = !replaced;
    node.receiveShadow = !replaced;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      material.colorWrite = !replaced;
      material.depthWrite = !replaced;
      material.needsUpdate = true;
    }
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

type FittedCanvasText = Readonly<{
  fontSize: number;
  measuredWidth: number;
  availableWidth: number;
}>;

export function fitCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  preferredSize: number,
  availableWidth: number,
  minimumSize = 18,
): FittedCanvasText {
  let fontSize = Math.max(minimumSize, Math.floor(preferredSize));
  const family = '"Arial Narrow", "Roboto Condensed", Arial, sans-serif';
  context.font = `900 ${fontSize}px ${family}`;
  while (fontSize > minimumSize && context.measureText(text).width > availableWidth) {
    fontSize -= 2;
    context.font = `900 ${fontSize}px ${family}`;
  }
  return { fontSize, measuredWidth: context.measureText(text).width, availableWidth };
}

function scoreTexture(value: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const text = `${value} PTS`;
  context.fillStyle = '#10171b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#f4c44f';
  context.lineWidth = 18;
  context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  context.fillStyle = '#f8f0d2';
  const layout = fitCanvasText(context, text, 118, canvas.width - 88, 54);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.userData.textLayout = { ...layout, canvasWidth: canvas.width, canvasHeight: canvas.height };
  return texture;
}

function rangeSign(text: string, accent: number, name: string, scale: [number, number]): THREE.Mesh | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  const aspect = THREE.MathUtils.clamp(scale[0] / Math.max(0.1, scale[1]), 3.2, 12);
  canvas.height = Math.round(THREE.MathUtils.clamp(canvas.width / aspect, 128, 320));
  const context = canvas.getContext('2d');
  if (!context) return null;
  const border = Math.max(8, Math.round(canvas.height * 0.055));
  const inset = Math.max(7, Math.round(border * 0.7));
  context.fillStyle = 'rgba(10, 17, 20, 0.94)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `#${accent.toString(16).padStart(6, '0')}`;
  context.lineWidth = border;
  context.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
  context.fillStyle = '#f8f0d2';
  const horizontalPadding = Math.max(50, Math.round(canvas.width * 0.055));
  const layout = fitCanvasText(context, text, canvas.height * 0.48, canvas.width - horizontalPadding * 2, 30);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + Math.round(canvas.height * 0.025));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  // World signs must stay attached to their boards. A Sprite billboard grows
  // across the viewport when the player walks close or looks away from the
  // board, which caused the giant clipped PICK UP text at range spawn.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(scale[0], scale[1]),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  sign.name = name;
  sign.renderOrder = 8;
  sign.userData.presentationOnly = true;
  sign.userData.text = text;
  sign.userData.textLayout = { ...layout, canvasWidth: canvas.width, canvasHeight: canvas.height, worldAspect: scale[0] / scale[1], boardAnchored: true };
  return sign;
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
  targets.push({ id, root, active: true, respawnAt: 0, scoreValue, distanceBand, maxHealth: 500, health: 500, kind: 'plate' });
}

function fivePointStarGeometry(outerRadius = 0.16, innerRadius = 0.065): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function flyingBlackCat(targets: PracticeTarget[], root: THREE.Group): void {
  const cat = new THREE.Group();
  cat.name = 'gun-range-flying-black-cat';
  cat.userData.targetId = 'flying-black-cat';
  cat.userData.scoreValue = 500;
  cat.userData.flyingCat = true;
  cat.position.set(10.5, 3.8, -18);

  const fur = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.78, metalness: 0.02 });
  const eyes = new THREE.MeshBasicMaterial({ color: 0xf4c44f, toneMapped: false });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 10), fur);
  body.name = 'flying-black-cat-body';
  body.scale.set(1.45, 0.72, 0.78);
  body.userData.hitZone = 'head';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), fur);
  head.name = 'flying-black-cat-head';
  head.position.set(0, 0.18, -0.52);
  head.userData.hitZone = 'head';
  const earGeometry = new THREE.ConeGeometry(0.13, 0.3, 4);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeometry, fur);
    ear.name = 'flying-black-cat-ear';
    ear.position.set(side * 0.19, 0.47, -0.54);
    ear.rotation.y = Math.PI / 4;
    ear.userData.hitZone = 'head';
    cat.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyes);
    eye.name = 'flying-black-cat-eye';
    eye.position.set(side * 0.12, 0.23, -0.82);
    eye.userData.hitZone = 'head';
    cat.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.07, 8, 20, Math.PI * 1.35), fur);
  tail.name = 'flying-black-cat-tail';
  tail.position.set(0.46, 0.06, 0.38);
  tail.rotation.set(Math.PI / 2, 0.35, 0.3);
  tail.userData.hitZone = 'head';
  cat.add(body, head, tail);

  const starMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, transparent: true, opacity: 0.9, toneMapped: false });
  const starGeometry = fivePointStarGeometry();
  const trail: THREE.Mesh[] = [];
  for (let index = 0; index < 8; index += 1) {
    const star = new THREE.Mesh(starGeometry, starMaterial.clone());
    star.name = 'flying-black-cat-trail-star';
    star.position.set(Math.sin(index * 1.7) * 0.18, Math.cos(index * 1.3) * 0.14, 0.65 + index * 0.34);
    star.scale.setScalar(1 - index * 0.075);
    star.userData.presentationOnly = true;
    star.userData.blocksShots = false;
    star.raycast = () => undefined;
    cat.add(star);
    trail.push(star);
  }
  cat.userData.starTrail = trail;
  cat.traverse((child) => {
    if (child.userData.presentationOnly === true) return;
    child.userData.targetRoot = cat;
    child.userData.targetId = 'flying-black-cat';
    child.userData.hitZone = 'head';
    child.userData.impactSurface = 'organic';
  });
  root.add(cat);
  targets.push({
    id: 'flying-black-cat', root: cat, active: true, respawnAt: 0, respawnDelayMs: 30_000,
    scoreValue: 500, distanceBand: 'mid', maxHealth: 100, health: 100,
    alwaysCritical: true, kind: 'flying-cat',
  });
}

export function buildGunRange(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Acres Indoor Gun Range arena';
  scene.add(root);
  const builder: Builder = {
    root, colliders: [], physicsColliders: [], raycastMeshes: [], shotSurfaces: [], ballisticSurfaceSequence: 0,
  };
  const concrete = standard(0x444b4e, 0.98, 0.02);
  const wall = terminalSurfaceMaterial('panel', 0xb8c1c4, '#69777d', 0.5, 0.38, [7, 4]);
  wall.name = 'GunRange_SilverWall_PanelTexture';
  wall.userData.gunRangeShell = 'white-silver-wall';
  const ceiling = terminalSurfaceMaterial('panel', 0xd7dbdc, '#8e9a9e', 0.42, 0.46, [8, 10]);
  ceiling.name = 'GunRange_SilverCeiling_PanelTexture';
  ceiling.userData.gunRangeShell = 'white-silver-ceiling';
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

  // A pale textured shell keeps player and target silhouettes readable. Dark
  // acoustic/ballistic inserts preserve contrast without turning the room black.
  box(builder, 'gun-range-backstop', [0, 3.6, -49], [42, 7.2, 1.2], dark);
  box(builder, 'gun-range-left-wall', [-20.5, 3.6, -14.5], [1, 7.2, 70], wall);
  box(builder, 'gun-range-right-wall', [20.5, 3.6, -14.5], [1, 7.2, 70], wall);
  box(builder, 'gun-range-rear-wall', [0, 3.6, 20], [42, 7.2, 1], wall);
  box(builder, 'gun-range-ceiling', [0, 7.1, -14.5], [42, 0.45, 70], ceiling, { solid: false, shots: true });

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
  const ambient = new THREE.HemisphereLight(0xe8f5f5, 0x253137, 0.68);
  ambient.name = 'gun-range-moderate-ambient';
  ambient.userData.presentationOnly = true;
  root.add(ambient);
  const neonMaterials: THREE.MeshStandardMaterial[] = [];
  const neonLights: THREE.PointLight[] = [];
  for (const [index, z] of [-37, -21, -5, 11].entries()) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x56e7df,
      emissive: 0x56e7df,
      emissiveIntensity: 1.55,
      roughness: 0.22,
      metalness: 0.28,
    });
    material.name = `GunRange_CyclingNeon_${index}`;
    neonMaterials.push(material);
    for (const side of [-1, 1] as const) {
      box(builder, 'gun-range-cycling-neon-strip', [side * 19.88, 4.65, z], [0.08, 0.16, 7.2], material, { solid: false, shots: false, cast: false });
    }
    const light = new THREE.PointLight(0x56e7df, 2.8, 13, 2.2);
    light.name = 'gun-range-cycling-neon-light';
    light.position.set(index % 2 === 0 ? -12 : 12, 4.8, z);
    light.userData.presentationOnly = true;
    light.userData.neonIndex = index;
    neonLights.push(light);
    root.add(light);
  }
  root.userData.gunRangeNeonMaterials = neonMaterials;
  root.userData.gunRangeNeonLights = neonLights;

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

  // Subtle live wall-penetration lab: four isolated lanes use explicit material
  // and thickness contracts, with a scored plate behind every panel.
  const wallbangGlass = new THREE.MeshStandardMaterial({ color: 0x8ccbd2, transparent: true, opacity: 0.34, roughness: 0.16, metalness: 0.04 });
  const wallbangPanels = [
    { x: -17.1, label: 'GLASS 8 CM', material: 'glass' as const, thickness: 0.08, render: wallbangGlass },
    { x: -14.7, label: 'WOOD 24 CM', material: 'wood' as const, thickness: 0.24, render: timber },
    { x: -12.3, label: 'PLASTER 42 CM', material: 'interior-wall' as const, thickness: 0.42, render: wall },
    { x: -9.9, label: 'BRICK 70 CM', material: 'brick' as const, thickness: 0.7, render: standard(0x744838, 0.93, 0.04) },
  ];
  for (const [index, panel] of wallbangPanels.entries()) {
    box(builder, `gun-range-wallbang-panel-${panel.material}`, [panel.x, 1.45, -7.6], [2.05, 2.9, panel.thickness], panel.render, {
      solid: false,
      shots: true,
      ballisticMaterial: panel.material,
    });
    rangeTarget(builder, targets, `wallbang-${panel.material}`, panel.x, -12.4, 50, 'near');
    const label = rangeSign(panel.label, index === 0 ? 0x79dce6 : 0xe0aa37, `gun-range-wallbang-label-${panel.material}`, [2.05, 0.55]);
    if (label) {
      label.position.set(panel.x, 3.35, -7.5);
      root.add(label);
    }
  }
  box(builder, 'gun-range-wallbang-lab-left', [-18.45, 1.6, -8.8], [0.18, 3.2, 9.8], dark, { ballisticMaterial: 'structural-metal' });
  box(builder, 'gun-range-wallbang-lab-right', [-8.55, 1.6, -8.8], [0.18, 3.2, 9.8], dark, { ballisticMaterial: 'structural-metal' });
  const wallbangHeader = rangeSign('WALLBANG TEST · MATERIAL / THICKNESS', 0xe0aa37, 'gun-range-wallbang-header', [8.8, 0.72]);
  if (wallbangHeader) {
    wallbangHeader.position.set(-13.5, 4.45, -5.25);
    root.add(wallbangHeader);
  }
  flyingBlackCat(targets, root);
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

  box(builder, 'gun-range-armory-header', [0, 3.8, 9.45], [32, 1.15, 0.25], dark, { solid: false, shots: false });
  box(builder, 'gun-range-live-fire-sign', [0, 4.45, 1.0], [12, 0.75, 0.22], redSafety, { solid: false, shots: false });
  root.getObjectByName('gun-range-armory-header')!.userData.label = 'CHOOSE A WEAPON · PRESS F';
  root.getObjectByName('gun-range-live-fire-sign')!.userData.label = 'LIVE FIRE · EYES AND EARS';
  const armorySign = rangeSign('ARMORY · PICK UP WITH F', 0x58e3dc, 'gun-range-armory-sign-text', [13.5, 0.95]);
  if (armorySign) {
    // Text must sit on the player-facing side of its backing board.
    armorySign.position.set(0, 3.8, 9.59);
    root.add(armorySign);
  }
  const liveFireSign = rangeSign('LIVE FIRE · EYES AND EARS', 0xff765f, 'gun-range-live-fire-sign-text', [10.5, 0.82]);
  if (liveFireSign) {
    liveFireSign.position.set(0, 4.45, 1.13);
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

/** Slow colour motion adds life without strobing or changing gameplay light authority. */
export function updateGunRangePresentation(root: THREE.Object3D, nowMs: number): void {
  const materials = root.userData.gunRangeNeonMaterials as THREE.MeshStandardMaterial[] | undefined;
  const lights = root.userData.gunRangeNeonLights as THREE.PointLight[] | undefined;
  if (!materials || !lights) return;
  materials.forEach((material, index) => {
    const hue = (nowMs / 18_000 + index * 0.17) % 1;
    material.color.setHSL(hue, 0.68, 0.58);
    material.emissive.copy(material.color);
  });
  lights.forEach((light, index) => {
    light.color.copy(materials[index % materials.length].color);
  });
}

function terminalWayfindingMaterial(title: string, subtitle: string, accent: string): THREE.Material {
  if (typeof document === 'undefined') {
    return new THREE.MeshStandardMaterial({ color: 0x062a3d, roughness: 0.32, metalness: 0.52 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) return standard(0x172126, 0.48, 0.36);
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#031d31');
  gradient.addColorStop(0.62, '#083f54');
  gradient.addColorStop(1, '#071523');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 34, canvas.height);
  context.fillRect(0, canvas.height - 16, canvas.width, 16);
  context.fillStyle = '#f4fdff';
  context.font = '900 66px sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(title, 62, 76);
  context.fillStyle = '#a9f4ff';
  context.font = '700 30px sans-serif';
  context.fillText(subtitle, 64, 142);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
}

type TerminalSurfacePattern = 'terrazzo' | 'panel' | 'rubber' | 'fabric' | 'aircraft' | 'cargo' | 'asphalt';

function terminalSurfaceTexture(
  pattern: TerminalSurfacePattern,
  base: string,
  accent: string,
  repeat: [number, number],
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  context.strokeStyle = accent;
  context.fillStyle = accent;

  if (pattern === 'terrazzo' || pattern === 'asphalt') {
    const count = pattern === 'terrazzo' ? 170 : 260;
    for (let index = 0; index < count; index += 1) {
      const x = (index * 73 + 19) % 256;
      const y = (index * 151 + 47) % 256;
      const radius = pattern === 'terrazzo' ? 1 + (index % 3) : 0.6 + (index % 2);
      context.globalAlpha = pattern === 'terrazzo' ? 0.34 : 0.2;
      context.fillRect(x, y, radius, radius);
    }
    context.globalAlpha = 1;
  } else if (pattern === 'panel') {
    context.globalAlpha = 0.34;
    context.lineWidth = 2;
    for (let x = 0; x <= 256; x += 64) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 256);
      context.stroke();
    }
    for (let y = 0; y <= 256; y += 128) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(256, y);
      context.stroke();
    }
    context.globalAlpha = 1;
  } else if (pattern === 'rubber' || pattern === 'fabric') {
    context.globalAlpha = pattern === 'fabric' ? 0.24 : 0.3;
    context.lineWidth = 1;
    for (let offset = -256; offset < 512; offset += pattern === 'fabric' ? 12 : 20) {
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + 256, 256);
      context.stroke();
      if (pattern === 'fabric') {
        context.beginPath();
        context.moveTo(offset + 256, 0);
        context.lineTo(offset, 256);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  } else if (pattern === 'aircraft') {
    context.globalAlpha = 0.32;
    context.lineWidth = 2;
    for (let x = 0; x <= 256; x += 64) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 256);
      context.stroke();
    }
    for (let y = 32; y < 256; y += 64) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(256, y);
      context.stroke();
      for (let x = 12; x < 256; x += 32) context.fillRect(x, y - 1, 2, 2);
    }
    context.globalAlpha = 1;
  } else if (pattern === 'cargo') {
    context.globalAlpha = 0.32;
    context.lineWidth = 5;
    for (let x = 10; x < 256; x += 24) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 256);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.needsUpdate = true;
  return texture;
}

function terminalSurfaceMaterial(
  pattern: TerminalSurfacePattern,
  color: number,
  accent: string,
  roughness: number,
  metalness: number,
  repeat: [number, number],
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  material.userData.assetOwner = 'skyline-terminal';
  material.userData.assetKind = 'runtime-generated-surface';
  material.userData.surfacePattern = pattern;
  const base = `#${color.toString(16).padStart(6, '0')}`;
  const texture = terminalSurfaceTexture(pattern, base, accent, repeat);
  if (texture) material.map = texture;
  return material;
}

function prismGeometryXZ(points: Array<[number, number]>, thickness: number): THREE.BufferGeometry {
  const half = thickness / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const y of [-half, half]) {
    for (const [x, z] of points) positions.push(x, y, z);
  }
  const count = points.length;
  for (let index = 1; index < count - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(count, count + index, count + index + 1);
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, count + next, index, count + next, count + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildSkylineTerminal(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Skyline Terminal arena';
  scene.add(root);
  const builder: Builder = {
    root, colliders: [], physicsColliders: [], raycastMeshes: [], shotSurfaces: [], ballisticSurfaceSequence: 0,
  };

  // Pass 60 reskin: a bright white/silver terminal with a cyan wayfinding
  // language.  The previous mid-grey palette collapsed every authored shape
  // into the same blockout value, especially under the mezzanine.
  const tarmacMat = terminalSurfaceMaterial('asphalt', 0x17232d, '#5b7380', 0.9, 0.08, [5, 5]);
  const floorMat = terminalSurfaceMaterial('terrazzo', 0xdce8e9, '#4f8791', 0.34, 0.2, [5, 5]);
  const wallMat = terminalSurfaceMaterial('panel', 0xe4ecec, '#7899a1', 0.4, 0.42, [6, 3]);
  const trimMat = standard(0x8eabb1, 0.3, 0.7);
  // Avoid transmission/refraction on the low-spec path: alpha glass is much
  // cheaper under software WebGL and still reads clearly as breakable glazing.
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x78d9e6,
    roughness: 0.2,
    metalness: 0.08,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });
  const planeHullMat = terminalSurfaceMaterial('aircraft', 0xf1f6f4, '#7697a0', 0.24, 0.46, [8, 2]);
  const planeWingMat = terminalSurfaceMaterial('panel', 0xc8d6d8, '#55717a', 0.3, 0.68, [4, 2]);
  const engineMat = standard(0x163342, 0.24, 0.78);
  const jetbridgeMat = terminalSurfaceMaterial('panel', 0xb9d0d3, '#3f7781', 0.34, 0.62, [5, 2]);
  const kioskMat = standard(0x087b8d, 0.42, 0.36);
  const cargoMat = terminalSurfaceMaterial('cargo', 0x546f82, '#b8dce1', 0.6, 0.38, [3, 2]);
  const hazardMat = standard(0xe69b32, 0.42, 0.36);
  const floorBorderMat = standard(0x183b4a, 0.34, 0.46);
  const floorInsetMat = new THREE.MeshStandardMaterial({
    color: 0x166979,
    roughness: 0.38,
    metalness: 0.38,
    emissive: 0x063a47,
    emissiveIntensity: 0.52,
  });
  const wallLowerMat = standard(0xacc3c7, 0.46, 0.4);
  const structureMat = standard(0x486b75, 0.3, 0.72);
  const rubberMat = terminalSurfaceMaterial('rubber', 0x171c1f, '#536063', 0.92, 0.04, [4, 4]);
  const seatMat = terminalSurfaceMaterial('fabric', 0x087a86, '#8ef2f0', 0.7, 0.08, [4, 4]);
  const cockpitMat = standard(0x051a2b, 0.12, 0.8);
  const planeStripeMat = standard(0x0a8999, 0.32, 0.52);
  const stainMat = standard(0x101b23, 1.0, 0.0);
  const practicalMat = new THREE.MeshStandardMaterial({
    color: 0xd9fcff,
    roughness: 0.24,
    metalness: 0.08,
    emissive: 0x4cdbea,
    emissiveIntensity: 1.9,
  });
  const magentaPracticalMat = new THREE.MeshStandardMaterial({
    color: 0xffd4f3,
    roughness: 0.26,
    metalness: 0.1,
    emissive: 0xe23a9a,
    emissiveIntensity: 1.45,
  });
  const ivoryPanelMat = terminalSurfaceMaterial('panel', 0xf2f5f1, '#9bb1b4', 0.28, 0.42, [8, 4]);
  // An unlit pale underside prevents the deep connector/mezzanine overhangs
  // from collapsing into featureless black on the low-ratio quality path.
  const soffitMat = new THREE.MeshBasicMaterial({ color: 0xe6efee });

  const skylineClusterIds = [
    'floor-language',
    'wall-structure',
    'escalator-detail',
    'window-frame',
    'aircraft-skin',
    'apron-marking',
    'terminal-story',
    'concourse-cover',
    'boarding-route',
    'quality-aircraft',
    'service-equipment',
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
    mesh.userData.assetOwner = 'skyline-terminal';
    return mesh;
  };
  const detailMesh = (
    cluster: SkylineClusterId,
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    detail: 'performance' | 'quality' = 'quality',
    cast = true,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    mesh.userData.rustworksDetail = detail;
    mesh.userData.skylineCluster = cluster;
    mesh.userData.assetOwner = 'skyline-terminal';
    mesh.raycast = () => undefined;
    root.add(mesh);
    return mesh;
  };
  const qualityPlaceholderBox = (
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    material: THREE.MeshStandardMaterial,
  ): THREE.Mesh => {
    const mesh = box(builder, name, position, size, material.clone());
    mesh.userData.skylineQualityPlaceholder = true;
    return mesh;
  };
  root.userData.skylineDetailClusters = [...skylineClusterIds];
  root.userData.skylineAssetAudit = {
    retained: ['terminal-shell', 'mezzanine-routes', 'breakable-facade', 'jetbridge', 'airstair', 'apron-boundaries'],
    adjusted: ['team-aqua-spawns', 'cabin-seat-clearance', 'jetbridge-lighting', 'concourse-cover'],
    qualityReplaced: ['fuselage-roof', 'aircraft-nose', 'wing-boxes', 'engine-boxes', 'cargo-boxes', 'fuel-trailer-box'],
    generatedOriginal: ['runtime-surface-patterns', 'curved-aircraft-shell', 'airport-uld-shells', 'luminous-terminal-canopy', 'gate-portal-wayfinding'],
  };
  root.userData.skylineReskin = {
    version: 'pass-60-total-overhaul',
    palette: 'white-silver-cyan-magenta',
    routeGeometryChanged: false,
    authoritativeCeiling: true,
  };

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
  detailBox('apron-marking', 'skyline-apron-cyan-guidance-west', [-6.5, 0.051, 11], [0.11, 0.024, 46], practicalMat);
  detailBox('apron-marking', 'skyline-apron-magenta-guidance-east', [6.5, 0.051, 11], [0.11, 0.024, 46], magentaPracticalMat);
  for (const z of [-8, 2, 12, 22, 32]) {
    detailBox('apron-marking', `skyline-apron-gate-chevron-${z}`, [0, 0.054, z], [8.6, 0.022, 0.12], z === 12 ? magentaPracticalMat : practicalMat);
  }
  for (const [z, rotationY] of [[12, 0.08], [-8, -0.08]] as const) {
    detailBox('apron-marking', `skyline-engine-stain-${z}`, [0, 0.031, z], [3.4, 0.022, 5.2], stainMat, 'performance', [0, rotationY, 0]);
  }

  box(builder, 'skyline-concourse-floor', [0, 0.02, -23], [60, 0.08, 22], floorMat, { solid: false });
  detailBox('floor-language', 'skyline-floor-dark-runner', [0, 0.073, -22.5], [5.2, 0.025, 20.5], floorInsetMat);
  // A real roof and luminous ceiling make the terminal read as an interior,
  // not an outdoor grey blockout. It is above every route but remains
  // collision and shot authoritative for debug/fly-camera probes.
  box(builder, 'skyline-terminal-silver-ceiling', [0, 7.05, -23], [62, 0.24, 22.6], ivoryPanelMat);
  for (const z of [-31.5, -28.5, -25.5, -22.5, -19.5, -16.5, -13.5]) {
    detailBox('wall-structure', `skyline-ceiling-white-baffle-${z}`, [0, 6.86, z], [60.2, 0.13, 0.72], ivoryPanelMat, 'performance', undefined, true);
    detailBox('terminal-story', `skyline-ceiling-cyan-spine-${z}`, [0, 6.76, z], [38, 0.055, 0.12], practicalMat);
  }
  // The long runner is repeated in inset cyan and magenta so it is legible
  // from either spawn and through the glass facade.
  detailBox('floor-language', 'skyline-floor-cyan-runner-west', [-2.3, 0.091, -22.5], [0.16, 0.022, 20.2], practicalMat);
  detailBox('floor-language', 'skyline-floor-cyan-runner-east', [2.3, 0.091, -22.5], [0.16, 0.022, 20.2], practicalMat);
  detailBox('floor-language', 'skyline-floor-magenta-crossing', [0, 0.093, -20.4], [24, 0.024, 0.16], magentaPracticalMat);
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
  // A pale coffered underside keeps the deployment end readable without
  // changing the collision-authoritative mezzanine slabs above it.
  detailBox('wall-structure', 'skyline-mezzanine-soffit-back', [0, 3.035, -31.25], [51.4, 0.035, 4.95], soffitMat);
  detailBox('wall-structure', 'skyline-mezzanine-soffit-center', [0, 3.035, -25.25], [35.9, 0.035, 5.95], soffitMat);
  detailBox('wall-structure', 'skyline-mezzanine-soffit-west', [-23.8, 3.035, -25.25], [4.0, 0.035, 5.95], soffitMat);
  detailBox('wall-structure', 'skyline-mezzanine-soffit-east', [23.8, 3.035, -25.25], [4.0, 0.035, 5.95], soffitMat);
  // Overlay the formerly monolithic grey underside with a coffered silver
  // ceiling. These shallow panels do not alter the mezzanine collider.
  for (const x of [-21, -14, -7, 0, 7, 14, 21]) {
    detailBox('wall-structure', `skyline-mezzanine-coffer-${x}`, [x, 3.002, -30.3], [5.65, 0.025, 3.9], ivoryPanelMat);
    detailBox('terminal-story', `skyline-mezzanine-coffer-light-${x}`, [x, 2.982, -30.25], [3.8, 0.022, 0.13], x === 0 ? magentaPracticalMat : practicalMat);
  }
  for (const x of [-16, -8, 0, 8, 16]) {
    detailBox('wall-structure', `skyline-mezzanine-front-coffer-${x}`, [x, 3.001, -25.3], [6.5, 0.024, 4.9], ivoryPanelMat);
    detailBox('terminal-story', `skyline-mezzanine-front-coffer-light-${x}`, [x, 2.981, -25.2], [4.6, 0.022, 0.13], x === 0 ? magentaPracticalMat : practicalMat);
  }
  for (const lightX of [-18, -10, 0, 10, 18]) {
    detailBox('terminal-story', `skyline-mezzanine-underlight-${lightX}`, [lightX, 3.005, -29.8], [5.4, 0.025, 0.11], practicalMat);
    detailBox('terminal-story', `skyline-mezzanine-underlight-front-${lightX}`, [lightX, 3.005, -24.3], [5.4, 0.025, 0.11], practicalMat);
  }
  detailBox('floor-language', 'skyline-mezzanine-front-edge', [0, 3.36, -22.12], [52, 0.12, 0.34], floorBorderMat);
  for (const x of [-23.5, -16, -8, 0, 8, 16, 23.5]) {
    detailBox('floor-language', `skyline-mezzanine-inlay-${x}`, [x, 3.355, -27.1], [0.035, 0.025, 12.8], floorBorderMat);
  }
  // Split the front rail around the central gate connector so the route does
  // not visually pass through a barrier.
  box(builder, 'skyline-mezzanine-rail', [-14, 4.2, -22.1], [24, 1.1, 0.15], trimMat, { solid: false, detail: 'performance' });
  box(builder, 'skyline-mezzanine-rail', [14, 4.2, -22.1], [24, 1.1, 0.15], trimMat, { solid: false, detail: 'performance' });
  box(builder, 'skyline-gate-connector-floor', [0, 3.2, -17], [3.6, 0.24, 10], soffitMat);
  detailBox('boarding-route', 'skyline-gate-connector-soffit', [0, 3.065, -17], [3.42, 0.035, 9.72], soffitMat);
  for (const lightZ of [-20.2, -17, -13.8]) {
    detailBox('boarding-route', `skyline-gate-connector-underlight-${lightZ}`, [0, 3.035, lightZ], [2.65, 0.025, 0.11], practicalMat);
  }
  box(builder, 'skyline-gate-connector-rail-left', [-1.75, 4.15, -17], [0.12, 1.7, 10], trimMat, { solid: false, detail: 'performance' });
  box(builder, 'skyline-gate-connector-rail-right', [1.75, 4.15, -17], [0.12, 1.7, 10], trimMat, { solid: false, detail: 'performance' });

  // Two seating islands create deliberate waist-high cover while preserving
  // the centre runner and both exterior flank routes.
  for (const seatX of [-10, 10]) {
    box(builder, `skyline-concourse-seat-cover-${seatX}`, [seatX, 0.57, -16.7], [5.2, 1.14, 0.5], seatMat);
    detailBox('concourse-cover', `skyline-concourse-seat-plinth-${seatX}`, [seatX, 0.18, -16.7], [5.5, 0.34, 1.5], structureMat);
    for (const offsetX of [-1.9, -0.95, 0, 0.95, 1.9]) {
      detailBox('concourse-cover', `skyline-concourse-seat-pad-${seatX}-${offsetX}`, [seatX + offsetX, 0.57, -16.28], [0.82, 0.18, 0.82], seatMat);
      detailBox('concourse-cover', `skyline-concourse-seat-back-${seatX}-${offsetX}`, [seatX + offsetX, 0.96, -16.83], [0.82, 0.72, 0.14], seatMat);
    }
    detailBox('concourse-cover', `skyline-concourse-seat-endcap-left-${seatX}`, [seatX - 2.65, 0.62, -16.7], [0.12, 0.82, 1.2], trimMat);
    detailBox('concourse-cover', `skyline-concourse-seat-endcap-right-${seatX}`, [seatX + 2.65, 0.62, -16.7], [0.12, 0.82, 1.2], trimMat);
  }
  for (const planterX of [-25, 25]) {
    box(builder, `skyline-concourse-charging-planter-${planterX}`, [planterX, 0.56, -18], [3.8, 1.12, 1.55], wallLowerMat);
    detailBox('concourse-cover', `skyline-concourse-planter-cap-${planterX}`, [planterX, 1.15, -18], [4.0, 0.12, 1.7], trimMat);
    detailBox('concourse-cover', `skyline-concourse-planter-soil-${planterX}`, [planterX, 1.23, -18], [3.45, 0.08, 1.2], stainMat);
    for (const leafOffset of [-1.05, 0, 1.05]) {
      detailMesh(
        'concourse-cover',
        `skyline-concourse-planter-leaf-${planterX}-${leafOffset}`,
        new THREE.ConeGeometry(0.35, 1.15, 7),
        standard(0x40584a, 0.9, 0.02),
        [planterX + leafOffset, 1.78, -18],
        [0, leafOffset * 0.2, leafOffset * 0.1],
        'quality',
        false,
      );
    }
  }

  const mainSign = box(builder, 'skyline-terminal-main-sign', [0, 6.2, -33.8], [14.0, 1.2, 0.2], terminalWayfindingMaterial('SKYLINE TERMINAL', 'GATES 01—12  •  CONCOURSE A', '#d69a2d'), { solid: false, shots: false, detail: 'performance' });
  mainSign.userData.label = 'SKYLINE TERMINAL - GATES 1-12';
  mainSign.userData.skylineCluster = 'terminal-story';

  const flightDisplay = box(builder, 'skyline-flight-display-board', [0, 4.8, -27.8], [6.5, 1.4, 0.25], terminalWayfindingMaterial('DEPARTURES', 'AERO 86  •  BOARDING', '#4d9b98'), { solid: false, shots: false, detail: 'quality' });
  flightDisplay.userData.label = 'DEPARTURES - FLIGHT AERO 86';
  flightDisplay.userData.skylineCluster = 'terminal-story';

  // Suspended portal signs establish an unmistakable terminal identity at the
  // player-height sightline, without adding route obstructions.
  for (const [x, title, subtitle, accent] of [
    [-18, 'GATES 01—06', 'SECURITY  •  LOUNGE', '#4ce5ec'],
    [18, 'GATES 07—12', 'BOARDING  •  AIRSIDE', '#ee62bd'],
  ] as const) {
    const portalSign = box(builder, `skyline-overhead-gate-sign-${x}`, [x, 5.55, -16.2], [11.5, 1.28, 0.16], terminalWayfindingMaterial(title, subtitle, accent), { solid: false, shots: false, detail: 'performance' });
    portalSign.userData.skylineCluster = 'terminal-story';
    detailBox('terminal-story', `skyline-gate-sign-crown-${x}`, [x, 6.27, -16.2], [12.2, 0.12, 0.22], x < 0 ? practicalMat : magentaPracticalMat);
    for (const postX of [x - 5.65, x + 5.65]) {
      detailBox('wall-structure', `skyline-gate-sign-drop-${postX}`, [postX, 6.42, -16.2], [0.12, 1.1, 0.12], structureMat);
    }
  }

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
  detailBox('terminal-story', 'skyline-backwall-luminous-crown-cyan', [-15.5, 6.72, -33.68], [30.4, 0.16, 0.14], practicalMat);
  detailBox('terminal-story', 'skyline-backwall-luminous-crown-magenta', [15.5, 6.72, -33.68], [30.4, 0.16, 0.14], magentaPracticalMat);
  for (const columnX of [-28, -21, -14, -7, 0, 7, 14, 21, 28]) {
    detailBox('wall-structure', `skyline-backwall-column-${columnX}`, [columnX, 3.5, -33.69], [0.34, 7, 0.26], structureMat, 'performance', undefined, true);
  }
  for (const sideX of [-30.84, 30.84]) {
    detailBox('wall-structure', `skyline-sidewall-wainscot-${sideX}`, [sideX, 1.05, -23], [0.14, 2.1, 21.8], wallLowerMat);
    for (const columnZ of [-32, -27, -22, -17, -12.5]) {
      detailBox('wall-structure', `skyline-sidewall-column-${sideX}-${columnZ}`, [sideX, 3.5, columnZ], [0.26, 7, 0.34], structureMat, 'performance', undefined, true);
    }
  }
  for (const sideX of [-30.7, 30.7]) {
    for (const z of [-31, -27, -23, -19, -15]) {
      detailBox('terminal-story', `skyline-sidewall-light-fin-${sideX}-${z}`, [sideX, 3.6, z], [0.08, 4.6, 0.16], z === -23 ? magentaPracticalMat : practicalMat);
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
  for (const [index, x, z] of [
    [0, -11, -18.6], [1, -11, -21.4], [2, -8.5, -18.6], [3, -8.5, -21.4],
    [4, 8.5, -18.6], [5, 8.5, -21.4], [6, 11, -18.6], [7, 11, -21.4],
  ] as const) {
    detailMesh('terminal-story', `skyline-queue-post-${index}`, new THREE.CylinderGeometry(0.07, 0.1, 1.05, 10), trimMat, [x, 0.525, z], [0, 0, 0], 'performance', false);
  }
  for (const [index, x, z] of [[0, -9.75, -18.6], [1, -9.75, -21.4], [2, 9.75, -18.6], [3, 9.75, -21.4]] as const) {
    detailBox('terminal-story', `skyline-queue-belt-${index}`, [x, 0.91, z], [2.35, 0.09, 0.05], hazardMat);
  }

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

  // Door audit: the central terminal and aircraft apertures are deliberately open;
  // the two staff doors are visibly closed against the authoritative back wall.
  detailBox('boarding-route', 'skyline-terminal-gate-jamb-left', [-1.84, 4.15, -11.86], [0.18, 2.2, 0.28], trimMat, 'performance', undefined, true);
  detailBox('boarding-route', 'skyline-terminal-gate-jamb-right', [1.84, 4.15, -11.86], [0.18, 2.2, 0.28], trimMat, 'performance', undefined, true);
  detailBox('boarding-route', 'skyline-terminal-gate-header', [0, 5.2, -11.86], [3.86, 0.18, 0.28], trimMat, 'performance', undefined, true);
  detailBox('boarding-route', 'skyline-terminal-gate-threshold', [0, 3.34, -11.84], [3.55, 0.08, 0.34], rubberMat);
  for (const [id, x] of [['west', -22], ['east', 22]] as const) {
    detailBox('terminal-story', 'skyline-staff-door-' + id, [x, 1.25, -33.66], [2.25, 2.5, 0.12], glassMat, 'performance');
    detailBox('terminal-story', 'skyline-staff-door-' + id + '-header', [x, 2.62, -33.61], [2.55, 0.18, 0.2], structureMat, 'performance', undefined, true);
    for (const side of [-1, 1]) detailBox('terminal-story', 'skyline-staff-door-' + id + '-jamb-' + side, [x + side * 1.22, 1.35, -33.61], [0.18, 2.7, 0.2], structureMat, 'performance', undefined, true);
    detailBox('terminal-story', 'skyline-staff-door-' + id + '-handle', [x + 0.7, 1.25, -33.52], [0.08, 0.36, 0.1], hazardMat);
  }
  root.userData.skylineDoorAudit = [
    { id: 'terminal-gate', state: 'open', mechanicalAuthority: 'open-facade-gap', clearWidth: 3.5 },
    { id: 'aircraft-boarding', state: 'open', mechanicalAuthority: 'split-fuselage-wall', clearWidth: 2.68 },
    { id: 'staff-west', state: 'closed', mechanicalAuthority: 'skyline-terminal-backwall', clearWidth: 0 },
    { id: 'staff-east', state: 'closed', mechanicalAuthority: 'skyline-terminal-backwall', clearWidth: 0 },
  ];

  // Pass 60 concourse densification: repeated lounge furniture, information
  // screens and baggage carts replace broad empty floor without changing routes.
  for (const [row, z] of [-21.5, -25.2].entries()) {
    for (const x of [-24, -18, 18, 24]) {
      detailBox('terminal-story', `skyline-lounge-seat-${row}-${x}`, [x, 0.48, z], [4.2, 0.22, 1.25], seatMat, 'performance');
      detailBox('terminal-story', `skyline-lounge-seat-back-${row}-${x}`, [x, 0.9, z + 0.52], [4.2, 0.72, 0.15], seatMat, 'performance');
      for (const leg of [-1.65, 1.65]) detailBox('terminal-story', `skyline-lounge-leg-${row}-${x}-${leg}`, [x + leg, 0.24, z], [0.12, 0.48, 0.85], structureMat, 'performance');
    }
  }
  for (const x of [-29, -10, 10, 29]) {
    detailBox('terminal-story', `skyline-flight-screen-post-${x}`, [x, 1.8, -20], [0.16, 3.6, 0.16], structureMat, 'performance');
    detailBox('terminal-story', `skyline-flight-screen-${x}`, [x, 3.25, -20], [3.6, 1.5, 0.18], cockpitMat, 'performance');
    detailBox('terminal-story', `skyline-baggage-cart-basket-${x}`, [x, 0.62, -30.5], [1.65, 0.72, 0.82], structureMat, 'performance');
    detailBox('terminal-story', `skyline-baggage-cart-handle-${x}`, [x, 1.15, -30.88], [1.65, 0.08, 0.08], trimMat, 'performance');
  }
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

  // Exterior roofline and two large airside identities are visible from every
  // Coral spawn. They transform the facade silhouette without changing its
  // apertures or window collision.
  detailBox('wall-structure', 'skyline-airside-roof-crown', [0, 7.24, -12], [63, 0.42, 1.05], structureMat, 'performance', undefined, true);
  detailBox('terminal-story', 'skyline-airside-roof-cyan-line', [-15.5, 7.02, -11.43], [31, 0.14, 0.12], practicalMat);
  detailBox('terminal-story', 'skyline-airside-roof-magenta-line', [15.5, 7.02, -11.43], [31, 0.14, 0.12], magentaPracticalMat);
  for (const x of [-24, -12, 0, 12, 24]) {
    detailBox('wall-structure', `skyline-roof-sculptural-fin-${x}`, [x, 8.45, -12.2], [0.22, 2.5, 1.45], ivoryPanelMat, 'performance', [0, 0, x * 0.006], true);
    detailBox('terminal-story', `skyline-roof-sculptural-fin-light-${x}`, [x, 8.45, -11.43], [0.09, 2.1, 0.08], x === 0 ? magentaPracticalMat : practicalMat);
  }
  for (const [x, title, subtitle, accent] of [
    [-18, 'SKYLINE', 'INTERNATIONAL TERMINAL', '#4ce5ec'],
    [18, 'GATE 07', 'AERO 86  •  BOARDING', '#ee62bd'],
  ] as const) {
    const airsideSign = box(builder, `skyline-airside-identity-${x}`, [x, 6.25, -11.51], [12.2, 1.05, 0.12], terminalWayfindingMaterial(title, subtitle, accent), { solid: false, shots: false, detail: 'performance' });
    airsideSign.userData.skylineCluster = 'terminal-story';
  }

  box(builder, 'skyline-jetbridge-bellows', [0, 4.3, -11.8], [4.1, 2.6, 0.5], jetbridgeMat, { solid: false, shots: false, detail: 'quality' });

  box(builder, 'skyline-jetbridge-floor', [0, 3.2, -7], [3.6, 0.24, 10], jetbridgeMat);
  box(builder, 'skyline-jetbridge-wall-left', [-1.75, 4.4, -6], [0.15, 2.2, 12], wallMat);
  box(builder, 'skyline-jetbridge-wall-right', [1.75, 4.4, -6], [0.15, 2.2, 12], wallMat);
  box(builder, 'skyline-jetbridge-roof', [0, 5.5, -6], [3.6, 0.15, 12], jetbridgeMat, { solid: false, shots: false });
  for (const sideX of [-1.66, 1.66]) {
    detailBox('boarding-route', `skyline-jetbridge-inner-panel-${sideX}`, [sideX, 3.8, -6], [0.035, 0.7, 11.4], soffitMat);
    detailBox('boarding-route', `skyline-jetbridge-window-band-${sideX}`, [sideX, 4.68, -6], [0.028, 0.72, 10.8], cockpitMat, 'quality');
  }
  for (const lightZ of [-10, -7, -4, -1.8]) {
    detailBox('boarding-route', `skyline-jetbridge-practical-${lightZ}`, [0, 5.36, lightZ], [2.55, 0.045, 0.13], practicalMat);
  }
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

  // Boarding portal: the mechanical wall gap already exists, but these pieces
  // make the aperture read as an open aircraft door instead of missing geometry.
  detailBox('boarding-route', 'skyline-aircraft-door-jamb-left', [-1.67, 3.88, 0.075], [0.18, 2.55, 0.28], trimMat, 'performance', undefined, true);
  detailBox('boarding-route', 'skyline-aircraft-door-jamb-right', [1.67, 3.88, 0.075], [0.18, 2.55, 0.28], trimMat, 'performance', undefined, true);
  detailBox('boarding-route', 'skyline-aircraft-door-header', [0, 5.12, 0.075], [3.52, 0.18, 0.28], trimMat, 'performance', undefined, true);
  detailBox('boarding-route', 'skyline-aircraft-door-threshold-seal', [0, 2.69, 0.08], [3.28, 0.09, 0.32], rubberMat);
  detailBox('boarding-route', 'skyline-aircraft-open-door-leaf', [-1.34, 3.88, 0.26], [0.42, 2.25, 0.12], planeHullMat, 'performance');
  detailBox('boarding-route', 'skyline-aircraft-door-handle', [-1.12, 3.94, 0.18], [0.08, 0.42, 0.12], hazardMat, 'quality');
  const boardingSign = box(builder, 'skyline-aircraft-boarding-sign', [0, 5.42, -0.12], [3.35, 0.52, 0.08], terminalWayfindingMaterial('GATE 07', 'BOARDING BRIDGE', '#d69a2d'), { solid: false, shots: false, detail: 'performance' });
  boardingSign.userData.skylineCluster = 'boarding-route';

  qualityPlaceholderBox('skyline-jetliner-fuselage-top', [0, 5.8, 2.0], [36.0, 1.2, 4.2], planeHullMat);
  box(builder, 'skyline-jetliner-cabin-floor', [0, 2.4, 2.0], [35.0, 0.3, 3.8], floorMat);
  // Split the north fuselage wall around the jetbridge doorway. A single solid
  // wall made the authored bridge-to-cabin route stop outside the aircraft.
  box(builder, 'skyline-jetliner-side-north', [-9.65, 3.75, 0.2], [15.7, 2.4, 0.2], planeHullMat);
  box(builder, 'skyline-jetliner-side-north', [9.65, 3.75, 0.2], [15.7, 2.4, 0.2], planeHullMat);
  box(builder, 'skyline-jetliner-side-south', [0, 3.75, 3.8], [35.0, 2.4, 0.2], planeHullMat);
  qualityPlaceholderBox('skyline-jetliner-nose', [-19.0, 3.75, 2.0], [2.2, 2.4, 3.8], trimMat);
  box(builder, 'skyline-jetliner-cockpit-partition', [-16.8, 3.75, 2.0], [0.15, 2.4, 3.6], wallMat, { solid: false, detail: 'quality' });
  const fuselageShell = detailMesh(
    'quality-aircraft',
    'skyline-quality-fuselage-shell',
    new THREE.CylinderGeometry(2.1, 2.1, 36, 28, 1, true, 0, Math.PI),
    planeHullMat,
    [0, 4.3, 2],
    [0, 0, Math.PI / 2],
  );
  fuselageShell.userData.assetOwner = 'skyline-terminal';
  const qualityNose = detailMesh(
    'quality-aircraft',
    'skyline-quality-aircraft-nose',
    new THREE.SphereGeometry(1, 28, 16),
    planeHullMat,
    [-18.2, 4.3, 2],
  );
  qualityNose.scale.set(2.45, 2.1, 2.1);
  qualityNose.userData.assetOwner = 'skyline-terminal';
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(3.1, 0);
  tailShape.lineTo(2.15, 4.25);
  tailShape.lineTo(0.55, 4.25);
  tailShape.closePath();
  const qualityTail = detailMesh(
    'quality-aircraft',
    'skyline-quality-aircraft-tail-fin',
    new THREE.ExtrudeGeometry(tailShape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }),
    planeStripeMat,
    [16.7, 4.35, 1.84],
  );
  qualityTail.userData.assetOwner = 'skyline-terminal';
  detailBox('aircraft-skin', 'skyline-aircraft-belly-north', [0, 3.12, 0.06], [34.2, 0.58, 0.08], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-aircraft-belly-south', [0, 3.12, 3.94], [34.2, 0.58, 0.08], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-aircraft-livery-cyan-north', [0, 3.7, 0.045], [32.8, 0.18, 0.06], practicalMat);
  detailBox('aircraft-skin', 'skyline-aircraft-livery-cyan-south', [0, 3.7, 3.955], [32.8, 0.18, 0.06], practicalMat);
  detailBox('aircraft-skin', 'skyline-aircraft-livery-magenta-north', [9.8, 3.98, 0.038], [12.5, 0.1, 0.05], magentaPracticalMat);
  detailBox('aircraft-skin', 'skyline-aircraft-livery-magenta-south', [9.8, 3.98, 3.962], [12.5, 0.1, 0.05], magentaPracticalMat);
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

  const cabinSeatDepth = 0.72;
  const cabinSeatLeftZ = 0.86;
  const cabinSeatRightZ = 3.14;
  const cabinAisleClearance = cabinSeatRightZ - cabinSeatDepth / 2 - (cabinSeatLeftZ + cabinSeatDepth / 2);
  root.userData.skylineCabinClearance = {
    aisleMetres: cabinAisleClearance,
    physicsPlayerDiameterMetres: 0.76,
    clearanceProbeDiameterMetres: 0.88,
    doorVisibleApertureMetres: 2.68,
  };
  for (const seatX of [-12, -8, -4, 4, 8, 12]) {
    box(builder, `skyline-cabin-seat-left-${seatX}`, [seatX, 3.05, cabinSeatLeftZ], [1.0, 1.0, cabinSeatDepth], seatMat);
    box(builder, `skyline-cabin-seat-right-${seatX}`, [seatX, 3.05, cabinSeatRightZ], [1.0, 1.0, cabinSeatDepth], seatMat);
    box(builder, `skyline-cabin-overhead-bin-left-${seatX}`, [seatX, 4.5, 0.58], [1.8, 0.45, 0.58], planeHullMat, { solid: false, shots: false });
    box(builder, `skyline-cabin-overhead-bin-right-${seatX}`, [seatX, 4.5, 3.42], [1.8, 0.45, 0.58], planeHullMat, { solid: false, shots: false });
    detailBox('terminal-story', `skyline-seat-headrest-left-${seatX}`, [seatX, 3.45, cabinSeatLeftZ], [0.78, 0.3, 0.58], planeStripeMat);
    detailBox('terminal-story', `skyline-seat-headrest-right-${seatX}`, [seatX, 3.45, cabinSeatRightZ], [0.78, 0.3, 0.58], planeStripeMat);
    detailBox('terminal-story', `skyline-bin-latch-left-${seatX}`, [seatX, 4.3, 0.9], [0.44, 0.06, 0.05], hazardMat);
    detailBox('terminal-story', `skyline-bin-latch-right-${seatX}`, [seatX, 4.3, 3.1], [0.44, 0.06, 0.05], hazardMat);
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

  qualityPlaceholderBox('skyline-jetliner-wing-port', [0, 2.8, 11.0], [5.0, 0.3, 15.0], planeWingMat);
  qualityPlaceholderBox('skyline-jetliner-wing-starboard', [0, 2.8, -7.0], [5.0, 0.3, 15.0], planeWingMat);
  qualityPlaceholderBox('skyline-jetliner-engine-1', [0, 1.6, 12.0], [2.2, 2.2, 4.5], engineMat);
  qualityPlaceholderBox('skyline-jetliner-engine-2', [0, 1.6, -8.0], [2.2, 2.2, 4.5], engineMat);
  const portWing = detailMesh(
    'quality-aircraft',
    'skyline-quality-wing-port',
    prismGeometryXZ([[-3.2, 0], [2.7, 0], [1.8, 16.8], [-1.3, 16.8]], 0.28),
    planeWingMat,
    [0, 2.82, 3.6],
  );
  portWing.userData.assetOwner = 'skyline-terminal';
  const starboardWing = detailMesh(
    'quality-aircraft',
    'skyline-quality-wing-starboard',
    prismGeometryXZ([[-3.2, 0], [2.7, 0], [1.8, -16.8], [-1.3, -16.8]], 0.28),
    planeWingMat,
    [0, 2.82, 0.4],
  );
  starboardWing.userData.assetOwner = 'skyline-terminal';
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

  qualityPlaceholderBox('skyline-fuel-trailer', [-10, 1.2, 18], [5.8, 2.4, 2.6], hazardMat);
  const fuelTank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5.2, 14), cargoMat);
  fuelTank.name = 'skyline-fuel-trailer-tank';
  fuelTank.rotation.z = Math.PI / 2;
  fuelTank.position.set(-10, 1.5, 18);
  fuelTank.castShadow = true;
  fuelTank.receiveShadow = true;
  fuelTank.userData.presentationOnly = true;
  fuelTank.userData.impactSurface = 'metal';
  fuelTank.userData.rustworksDetail = 'quality';
  fuelTank.userData.skylineCluster = 'service-equipment';
  fuelTank.userData.assetOwner = 'skyline-terminal';
  fuelTank.raycast = () => undefined;
  root.add(fuelTank);
  detailBox('service-equipment', 'skyline-fuel-trailer-chassis', [-10, 0.38, 18], [6.1, 0.28, 2.3], structureMat, 'performance');
  for (const wheelX of [-12.1, -8.2]) {
    for (const wheelZ of [17.05, 18.95]) {
      detailMesh('service-equipment', `skyline-fuel-trailer-wheel-${wheelX}-${wheelZ}`, new THREE.CylinderGeometry(0.38, 0.38, 0.22, 14), rubberMat, [wheelX, 0.38, wheelZ], [Math.PI / 2, 0, 0], 'performance');
    }
  }
  detailMesh('service-equipment', 'skyline-fuel-hose-reel', new THREE.TorusGeometry(0.58, 0.12, 8, 18), rubberMat, [-7.25, 1.3, 18], [0, Math.PI / 2, 0], 'quality');
  detailBox('service-equipment', 'skyline-fuel-control-cabinet', [-7.15, 1.15, 16.95], [0.9, 1.6, 0.48], wallMat, 'quality');

  const uldShape = new THREE.Shape();
  uldShape.moveTo(-2.25, 0);
  uldShape.lineTo(2.25, 0);
  uldShape.lineTo(2.02, 2.6);
  uldShape.lineTo(-1.72, 2.6);
  uldShape.lineTo(-2.25, 1.95);
  uldShape.closePath();
  for (const [x, z, col] of [
    [-20, 18, cargoMat],
    [20, 18, wallMat],
    [-12, 26, hazardMat],
    [12, 26, cargoMat],
    [0, 28, trimMat],
  ] as const) {
    qualityPlaceholderBox(`skyline-tarmac-cargo-${x}-${z}`, [x, 1.3, z], [4.5, 2.6, 2.6], col);
    const shell = detailMesh(
      'service-equipment',
      `skyline-quality-uld-${x}-${z}`,
      new THREE.ExtrudeGeometry(uldShape, { depth: 2.6, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }),
      col,
      [x, 0, z - 1.3],
    );
    shell.userData.assetOwner = 'skyline-terminal';
    detailBox('service-equipment', `skyline-uld-rail-${x}-${z}`, [x, 1.42, z + 1.34], [4.15, 0.12, 0.08], hazardMat, 'quality');
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
    { id: 'concourse-seating-west', bounds: { minX: -12.6, maxX: -7.4, minZ: -16.95, maxZ: -16.45 }, blocksMovement: true, blocksShots: true },
    { id: 'concourse-seating-east', bounds: { minX: 7.4, maxX: 12.6, minZ: -16.95, maxZ: -16.45 }, blocksMovement: true, blocksShots: true },
    { id: 'concourse-planter-west', bounds: { minX: -26.9, maxX: -23.1, minZ: -18.78, maxZ: -17.22 }, blocksMovement: true, blocksShots: true },
    { id: 'concourse-planter-east', bounds: { minX: 23.1, maxX: 26.9, minZ: -18.78, maxZ: -17.22 }, blocksMovement: true, blocksShots: true },
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
    'cabin-through-aisle': [
      { id: 'cabin-forward', position: [-15.4, 4.25, 2.0] },
      { id: 'cabin-mid', position: [0, 4.25, 2.0] },
      { id: 'cabin-rear', position: [15.4, 4.25, 2.0] },
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
        [-27, -14], [-18, -14], [-6, -14], [6, -14], [18, -14], [27, -14],
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
