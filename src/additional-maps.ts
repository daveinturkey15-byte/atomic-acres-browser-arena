import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildOperator, poseOperator } from './art-kit';
import { classifyImpactSurface } from './combat-feedback';
import { createBallisticSurface, type BallisticMaterialId, type BallisticSurface } from './ballistics';
import type { Box2 } from './collision';
import { WEAPONS } from './gameplay';
import { GUN_RANGE_WEAPON_STATIONS } from './gun-range-armory';
import {
  GUN_RANGE_TEST_BAY_CONTRACT,
  GUN_RANGE_TEST_BAY_STRUCTURE,
  advanceGunRangeTestBayDoor,
  createGunRangeTestBayDoorState,
  gunRangeTestBayDoorDynamicBallisticSurfaces,
  gunRangeTestBayDoorDynamicColliders,
  gunRangeTestBayDoorLeafBounds,
  gunRangeTestBayRenderedDummyPose,
  type GunRangeTestBayDoorState,
  type GunRangeTestBayDummyDefinition,
} from './gun-range-test-bay';
import type { ArenaMap, BreakableWindow, PracticeTarget } from './map';
import type { DynamicWorldCollider } from './physics';
import type { Team } from './protocol';
import { createRustworksWelshFlag } from './rustworks-flag';
import { makeEmissiveOnly } from './rendering/light-occlusion';
import { applyBotEmissiveBrightness } from './operator-model';

export type Builder = {
  root: THREE.Group;
  colliders: Box2[];
  physicsColliders: Box2[];
  raycastMeshes: THREE.Object3D[];
  shotSurfaces: BallisticSurface[];
  ballisticSurfaceSequence: number;
  /** Optional dynamic panes owned by the arena's existing glass authority. */
  breakableWindows?: BreakableWindow[];
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

export const standard = (color: number, roughness = 0.86, metalness = 0.08): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

type RustSurfaceKind = 'deck' | 'oxidised' | 'painted-steel';

function rustSurfaceTexture(kind: RustSurfaceKind, repeat: [number, number]): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hash = ((x * 73 + y * 151 + x * y * 17) ^ (x << 3) ^ (y << 5)) & 255;
      const seam = x % 16 === 0 || y % 16 === 0;
      const streak = kind === 'oxidised' && ((x * 3 + y) % 29 < 3);
      const base = kind === 'deck' ? 174 : kind === 'oxidised' ? 188 : 202;
      const noise = (hash % 31) - 15;
      const offset = (y * size + x) * 4;
      data[offset] = THREE.MathUtils.clamp(base + noise + (streak ? 36 : 0) - (seam ? 42 : 0), 0, 255);
      data[offset + 1] = THREE.MathUtils.clamp(base + noise - (streak ? 26 : 0) - (seam ? 34 : 0), 0, 255);
      data[offset + 2] = THREE.MathUtils.clamp(base + noise - (streak ? 44 : 0) - (seam ? 28 : 0), 0, 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `rustrig-${kind}-surface-v1`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function applyRustSurface(material: THREE.MeshStandardMaterial, kind: RustSurfaceKind, repeat: [number, number]): THREE.MeshStandardMaterial {
  material.map = rustSurfaceTexture(kind, repeat);
  material.userData.assetOwner = 'rustworks-1v1';
  material.userData.assetKind = 'deterministic-industrial-surface';
  material.userData.surfaceKind = kind;
  return material;
}

export function box(
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
    mesh.userData.ballisticMaterial = surface.material;
    if (options.breakableWindowId) {
      mesh.userData.breakableWindowId = options.breakableWindowId;
      mesh.userData.dynamic = true;
      builder.breakableWindows?.push({
        id: options.breakableWindowId,
        mesh,
        broken: false,
      });
    }
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

type SkylineOpeningProbe = Readonly<{
  id: string;
  aperture: Readonly<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  }>;
}>;

type SkylineOpeningProfileAudit = Readonly<{
  id: string;
  movementBlockers: number;
  shotBlockers: number;
  opaquePresentationBlockers: number;
  opaquePresentationBlockerNames: readonly string[];
}>;

function volumesIntersect(
  first: SkylineOpeningProbe['aperture'],
  second: SkylineOpeningProbe['aperture'],
): boolean {
  return first.minX <= second.maxX && first.maxX >= second.minX
    && first.minY <= second.maxY && first.maxY >= second.minY
    && first.minZ <= second.maxZ && first.maxZ >= second.minZ;
}

function skylineOpeningParityAudit(
  builder: Builder,
  probes: readonly SkylineOpeningProbe[],
): Readonly<Record<'performance' | 'quality', readonly SkylineOpeningProfileAudit[]>> {
  builder.root.updateMatrixWorld(true);
  const sourceMeshes: THREE.Mesh[] = [];
  builder.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)
      || (node.userData.staticBatchRendered === true && typeof node.userData.sourceMeshes === 'number')) return;
    sourceMeshes.push(node);
  });

  const profileAudit = (profile: 'performance' | 'quality'): readonly SkylineOpeningProfileAudit[] => probes.map((probe) => {
    const opaquePresentationBlockerNames = sourceMeshes.flatMap((mesh) => {
      const detail = mesh.userData.rustworksDetail as 'core' | 'performance' | 'quality' | undefined;
      if (detail === 'quality' && profile !== 'quality') return [];
      if (mesh.userData.skylineQualityPlaceholder === true && profile === 'quality') return [];
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const opaque = materials.some((material) => material.visible
        && (!material.transparent || material.opacity >= 0.8));
      if (!opaque) return [];
      const bounds = new THREE.Box3().setFromObject(mesh);
      const meshVolume = {
        minX: bounds.min.x,
        maxX: bounds.max.x,
        minY: bounds.min.y,
        maxY: bounds.max.y,
        minZ: bounds.min.z,
        maxZ: bounds.max.z,
      };
      return volumesIntersect(probe.aperture, meshVolume) ? [mesh.name] : [];
    });
    const movementBlockers = builder.physicsColliders.filter((collider) => volumesIntersect(probe.aperture, {
      minX: collider.minX,
      maxX: collider.maxX,
      minY: collider.minY ?? -Infinity,
      maxY: collider.maxY ?? Infinity,
      minZ: collider.minZ,
      maxZ: collider.maxZ,
    })).length;
    const shotBlockers = builder.shotSurfaces.filter((surface) => volumesIntersect(probe.aperture, {
      minX: surface.bounds.minX,
      maxX: surface.bounds.maxX,
      minY: surface.bounds.minY ?? -Infinity,
      maxY: surface.bounds.maxY ?? Infinity,
      minZ: surface.bounds.minZ,
      maxZ: surface.bounds.maxZ,
    })).length;
    return {
      id: probe.id,
      movementBlockers,
      shotBlockers,
      opaquePresentationBlockers: opaquePresentationBlockerNames.length,
      opaquePresentationBlockerNames,
    };
  });

  return {
    performance: profileAudit('performance'),
    quality: profileAudit('quality'),
  };
}

/**
 * Collapse decorative box meshes by material/shadow state while retaining the
 * named hidden source nodes for semantic inspection. Collision and shot meshes
 * are deliberately excluded: only non-solid, non-raycast presentation detail
 * enters these static batches.
 */
export function batchPresentationOnlyBoxes(root: THREE.Group, batchPrefix = 'presentation'): PresentationBatchTelemetry {
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
    batch.name = `${batchPrefix}-presentation-batch-${batches}`;
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

export function emptyTelemetry(): ArenaMap['houseTelemetry'] {
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

export function spawnRecord(team0: readonly [number, number][], team1: readonly [number, number][]): Record<Team, THREE.Vector3[]> {
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

/**
 * Authored fixture locations shared by the RustRig presentation and its
 * budgeted shadowed-local work lights. Both heads remain visible/emissive and
 * own bounded, opposed shadowed volumes so the playable deck is readable from
 * both ends without reintroducing unoccluded point-light leakage.
 */
export const RUSTWORKS_WORK_LIGHTS = Object.freeze([
  Object.freeze({
    id: 'north',
    position: [0, 8.35, -4.35] as const,
    mount: [0, 8.35, -3.35] as const,
    target: [0, 0.8, 13.5] as const,
    color: 0xffd2a0,
    intensity: 46,
    distance: 34,
    angle: 0.82,
    shadowed: true,
  }),
  Object.freeze({
    id: 'south',
    position: [0, 8.35, 4.35] as const,
    mount: [0, 8.35, 3.35] as const,
    target: [0, 0.8, -13.5] as const,
    color: 0xffd2a0,
    intensity: 42,
    distance: 34,
    angle: 0.82,
    shadowed: true,
  }),
]);

/**
 * One bounded shadowed practical per freight cluster. The eight visible
 * red/orange/yellow strips remain cheap emissive navigation cues; these four
 * ceiling-mounted volumes add real occluded colour and slow deterministic
 * intensity motion in Quality/Custom without changing container collision.
 */
export const RUSTWORKS_CONTAINER_LIGHTS = Object.freeze([
  Object.freeze({
    id: 'north-west',
    position: [-8, 2.32, -13] as const,
    target: [-8, 0.28, -13] as const,
    volume: { minimum: [-10.76, 0.04, -14.18] as const, maximum: [-5.24, 2.48, -11.82] as const },
    color: 0xff4d2e,
    intensity: 18,
    distance: 4.2,
    angle: 0.86,
    frequencyHz: 0.18,
    phaseRadians: 0.35,
  }),
  Object.freeze({
    id: 'north-east',
    position: [8, 2.32, -13] as const,
    target: [8, 0.28, -13] as const,
    volume: { minimum: [5.24, 0.04, -14.18] as const, maximum: [10.76, 2.48, -11.82] as const },
    color: 0xffd25a,
    intensity: 17,
    distance: 4.2,
    angle: 0.86,
    frequencyHz: 0.23,
    phaseRadians: 1.7,
  }),
  Object.freeze({
    id: 'south-west',
    position: [-18, 2.32, 8] as const,
    target: [-18, 0.28, 8] as const,
    volume: { minimum: [-19.18, 0.04, 5.24] as const, maximum: [-16.82, 2.48, 10.76] as const },
    color: 0xff9a3d,
    intensity: 16,
    distance: 4.2,
    angle: 0.86,
    frequencyHz: 0.29,
    phaseRadians: 3.05,
  }),
  Object.freeze({
    id: 'south-east',
    position: [18, 2.32, 8] as const,
    target: [18, 0.28, 8] as const,
    volume: { minimum: [16.82, 0.04, 5.24] as const, maximum: [19.18, 2.48, 10.76] as const },
    color: 0xff4d2e,
    intensity: 17,
    distance: 4.2,
    angle: 0.86,
    frequencyHz: 0.31,
    phaseRadians: 4.4,
  }),
]);

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
  const packed = applyRustSurface(standard(0x6e5a48, 0.98, 0.02), 'deck', [8, 8]);
  const rust = applyRustSurface(standard(0x7a3924, 0.82, 0.42), 'oxidised', [4, 4]);
  const rustDark = applyRustSurface(standard(0x3c2924, 0.9, 0.35), 'oxidised', [6, 6]);
  const steel = applyRustSurface(standard(0x59656a, 0.58, 0.62), 'deck', [12, 12]);
  const steelBright = applyRustSurface(standard(0x6d7a80, 0.48, 0.72), 'painted-steel', [5, 5]);
  const hazard = standard(0xd7972d, 0.72, 0.34);
  const hazardDark = standard(0x8a5a18, 0.8, 0.28);
  const concrete = standard(0x77756d, 0.98, 0.03);
  const concreteDark = standard(0x5c5a54, 0.96, 0.04);
  const tarp = standard(0x315665, 0.94, 0.02);
  const oxide = standard(0x4a2c22, 0.9, 0.3);
  const grate = standard(0x4e585c, 0.62, 0.55);
  const workLightHousing = standard(0x20282b, 0.58, 0.72);
  const workLightLens = new THREE.MeshStandardMaterial({
    color: 0xffedcf,
    roughness: 0.18,
    metalness: 0.06,
    emissive: 0xffb45c,
    emissiveIntensity: 4.8,
  });

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
  ground.userData.ballisticMaterial = groundSurface.material;
  // Thick deck plate + edge lip so the drop to water reads when looking over.
  box(builder, 'rustworks-rig-deck-slab', [0, -0.85, 0], [54.5, 1.6, 58.5], rustDark, { solid: false, cast: true, shots: false });
  const deckEdgeSpecs = [
    { id: 'north', position: [0, -0.08, -28.85] as [number, number, number], size: [54.5, 0.22, 0.8] as [number, number, number] },
    { id: 'south', position: [0, -0.08, 28.85] as [number, number, number], size: [54.5, 0.22, 0.8] as [number, number, number] },
    { id: 'west', position: [-26.85, -0.08, 0] as [number, number, number], size: [0.8, 0.22, 56.9] as [number, number, number] },
    { id: 'east', position: [26.85, -0.08, 0] as [number, number, number], size: [0.8, 0.22, 56.9] as [number, number, number] },
  ];
  for (const edge of deckEdgeSpecs) {
    box(builder, `rustworks-rig-deck-edge-${edge.id}`, edge.position, edge.size, hazardDark, { solid: false, cast: false, shots: false });
  }
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
  const hardstandSpec = {
    id: 'hardstand',
    position: [0, 0.03, 0] as [number, number, number],
    size: [16, 0.06, 16] as [number, number, number],
  };
  box(builder, 'rustworks-tower-hardstand', hardstandSpec.position, hardstandSpec.size, packed, { solid: false, cast: false });
  // Four edge-abutting lane sections replace the two intersecting full-length
  // overlays. Their top faces no longer occupy the same pixels at the central
  // cross/hardstand, removing the long-distance deck shimmer.
  const serviceLaneSpecs = [
    { id: 'north', position: [0, 0.04, -16] as [number, number, number], size: [5.5, 0.05, 16] as [number, number, number] },
    { id: 'south', position: [0, 0.04, 16] as [number, number, number], size: [5.5, 0.05, 16] as [number, number, number] },
    { id: 'west', position: [-16, 0.04, 0] as [number, number, number], size: [16, 0.05, 5.5] as [number, number, number] },
    { id: 'east', position: [16, 0.04, 0] as [number, number, number], size: [16, 0.05, 5.5] as [number, number, number] },
  ];
  for (const lane of serviceLaneSpecs) {
    box(builder, `rustworks-service-lane-${lane.id}`, lane.position, lane.size, concreteDark, { solid: false, cast: false });
  }
  const chevronSpecs = [-20, 20].map((z) => ({
    id: `chevron-${z < 0 ? 'north' : 'south'}`,
    position: [0, 0.075, z] as [number, number, number],
    size: [2.8, 0.02, 0.45] as [number, number, number],
  }));
  for (const chevron of chevronSpecs) {
    box(builder, 'rustworks-ground-chevron', chevron.position, chevron.size, hazard, { solid: false, cast: false, shots: false });
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

  // HF-390: Rustworks is a steel derrick. `deck`/`ramp`/`landing` are wood-rule
  // words, so every walking surface here was rated as timber (0.38 entry) until
  // these explicit families landed. Authored material beats the name rule.
  box(builder, 'rustworks-lower-deck', [0, lowerDeckCenterY, 0], [lowerDeckSize, deckThickness, lowerDeckSize], grate, { ballisticMaterial: 'structural-metal' });
  box(builder, 'rustworks-upper-deck', [0, upperDeckCenterY, 0], [upperDeckSize, deckThickness, upperDeckSize], rust, { ballisticMaterial: 'structural-metal' });
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

  for (const fixture of RUSTWORKS_WORK_LIGHTS) {
    const head = new THREE.Vector3(...fixture.position);
    const target = new THREE.Vector3(...fixture.target);
    const direction = target.clone().sub(head).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    presentationBeam(
      builder,
      `rustworks-work-light-mount-${fixture.id}`,
      [...fixture.mount],
      [...fixture.position],
      0.16,
      steelBright,
    );
    const housingPosition = head.clone().addScaledVector(direction, -0.12);
    const housing = box(
      builder,
      `rustworks-work-light-housing-${fixture.id}`,
      housingPosition.toArray(),
      [0.92, 0.52, 0.34],
      workLightHousing,
      { solid: false, shots: false, detail: 'performance' },
    );
    housing.quaternion.copy(orientation);
    const lens = box(
      builder,
      `rustworks-work-light-lens-${fixture.id}`,
      [...fixture.position],
      [0.72, 0.34, 0.055],
      workLightLens,
      { solid: false, shots: false, cast: false, detail: 'performance' },
    );
    lens.quaternion.copy(orientation);
    lens.userData.occlusionPolicy = 'emissive-only';
    lens.userData.practicalPolicyId = 'tower-work-light-lenses';
    lens.userData.fixtureId = fixture.id;
  }

  const managedSurfaceSpecs = [hardstandSpec, ...serviceLaneSpecs, ...chevronSpecs, ...deckEdgeSpecs];
  const coplanarOverlapPairs: string[] = [];
  for (let first = 0; first < managedSurfaceSpecs.length; first += 1) {
    const a = managedSurfaceSpecs[first];
    const aTop = a.position[1] + a.size[1] / 2;
    for (let second = first + 1; second < managedSurfaceSpecs.length; second += 1) {
      const b = managedSurfaceSpecs[second];
      const bTop = b.position[1] + b.size[1] / 2;
      const overlapX = Math.min(a.position[0] + a.size[0] / 2, b.position[0] + b.size[0] / 2)
        - Math.max(a.position[0] - a.size[0] / 2, b.position[0] - b.size[0] / 2);
      const overlapZ = Math.min(a.position[2] + a.size[2] / 2, b.position[2] + b.size[2] / 2)
        - Math.max(a.position[2] - a.size[2] / 2, b.position[2] - b.size[2] / 2);
      if (Math.abs(aTop - bTop) < 1e-4 && overlapX > 1e-4 && overlapZ > 1e-4) {
        coplanarOverlapPairs.push(`${a.id}:${b.id}`);
      }
    }
  }
  root.userData.rustworksDeckSurfaceAudit = {
    perimeterEdgeSegments: deckEdgeSpecs.length,
    serviceLaneSegments: serviceLaneSpecs.length,
    fullDeckLipOverlay: false,
    coplanarOverlapPairs,
  };
  root.userData.rustworksWorkLightAudit = {
    fixtures: RUSTWORKS_WORK_LIGHTS.map((fixture) => ({
      id: fixture.id,
      position: [...fixture.position],
      target: [...fixture.target],
      emissiveOnlyLens: true,
      shadowedLocalVolume: fixture.shadowed,
    })),
    containerFixtures: RUSTWORKS_CONTAINER_LIGHTS.map((fixture) => ({
      id: fixture.id,
      position: [...fixture.position],
      target: [...fixture.target],
      color: fixture.color,
      shadowedLocalVolume: true,
    })),
    shadowedLocalVolumes: RUSTWORKS_WORK_LIGHTS.filter((fixture) => fixture.shadowed).length + RUSTWORKS_CONTAINER_LIGHTS.length,
    maximumShadowCastersIncludingMoon: 7,
  };

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

  box(builder, 'rustworks-lower-ramp-foot-pad', [0, 0.08, lowerRampCenterZ - Math.cos(lowerRampAngle) * (lowerRampLength / 2) - 0.55], [lowerRampWidth + 0.8, 0.16, 1.6], concrete, { ballisticMaterial: 'concrete' });
  box(
    builder,
    'rustworks-lower-ramp',
    [0, lowerRampPosY, lowerRampCenterZ],
    [lowerRampWidth, lowerRampThickness, lowerRampLength],
    steelBright,
    { rotation: [-lowerRampAngle, 0, 0], ballisticMaterial: 'structural-metal' },
  );
  box(
    builder,
    'rustworks-lower-ramp-landing',
    [0, lowerDeckCenterY, lowerLandingCenterZ],
    [lowerRampWidth + 0.45, deckThickness, lowerLandingDepth],
    grate,
    { ballisticMaterial: 'structural-metal' },
  );
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
    { ballisticMaterial: 'structural-metal' },
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
    { ballisticMaterial: 'structural-metal' },
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
      // HF-390 lane (2026-08-28): authored in concreteDark and read as poured
      // concrete trench cover, but the 'wall' name rule rated it interior-wall
      // (0.42 entry - drywall) so the 1v1 trench lane was casually wallbanged
      // through what looks like concrete. Authored to the family it visually is.
      const wall = box(builder, 'rustworks-service-trench-wall', [x, 0.65, z], [0.32, 1.3, 7], concreteDark, { ballisticMaterial: 'concrete' });
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
  // Four compact freight clusters pull cover into the playable quadrants.
  // The old 24-container perimeter ring behaved like an unused outer wall and
  // left the yard itself empty.
  const containerRows = [
    { cluster: 'north-west', side: 'north', slot: 0, axis: 'x', x: -8, z: -13, opening: 'open-both' },
    { cluster: 'north-west', side: 'west', slot: 1, axis: 'z', x: -18, z: -8, opening: 'closed' },
    { cluster: 'north-west', side: 'north', slot: 2, axis: 'x', x: -19, z: -17, opening: 'closed' },
    { cluster: 'north-west', side: 'west', slot: 3, axis: 'z', x: -7, z: -19, opening: 'open-one' },
    { cluster: 'north-east', side: 'north', slot: 0, axis: 'x', x: 8, z: -13, opening: 'open-one' },
    { cluster: 'north-east', side: 'east', slot: 1, axis: 'z', x: 18, z: -8, opening: 'closed' },
    { cluster: 'north-east', side: 'north', slot: 2, axis: 'x', x: 19, z: -17, opening: 'open-both' },
    { cluster: 'north-east', side: 'east', slot: 3, axis: 'z', x: 7, z: -19, opening: 'closed' },
    { cluster: 'south-west', side: 'south', slot: 0, axis: 'x', x: -8, z: 13, opening: 'closed' },
    { cluster: 'south-west', side: 'west', slot: 1, axis: 'z', x: -18, z: 8, opening: 'open-one' },
    { cluster: 'south-west', side: 'south', slot: 2, axis: 'x', x: -19, z: 17, opening: 'open-both' },
    { cluster: 'south-west', side: 'west', slot: 3, axis: 'z', x: -7, z: 19, opening: 'closed' },
    { cluster: 'south-east', side: 'south', slot: 0, axis: 'x', x: 8, z: 13, opening: 'closed' },
    { cluster: 'south-east', side: 'east', slot: 1, axis: 'z', x: 18, z: 8, opening: 'open-both' },
    { cluster: 'south-east', side: 'south', slot: 2, axis: 'x', x: 19, z: 17, opening: 'closed' },
    { cluster: 'south-east', side: 'east', slot: 3, axis: 'z', x: 7, z: 19, opening: 'open-one' },
  ] as const;
  const containerPalette = [hazardDark, rustDark, tarp] as const;
  const containerPracticalPalette = [0xff4d2e, 0xff9a3d, 0xffd25a] as const;
  const containerPracticalMaterials = containerPracticalPalette.map((color, index) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      // Keep the hue saturated through the HDR/ACES path; the former 3.2+
      // values clipped all three cues toward white at RustRig exposure.
      emissiveIntensity: 1.55 + index * 0.1,
      roughness: 0.24,
      metalness: 0.28,
    });
    material.name = `RustRig_Container_Practical_${index}`;
    return material;
  });
  const openContainerRoutes: Array<{ id: string; side: string; axis: 'x' | 'z'; anchors: [number, number, number][] }> = [];
  const containerPracticalIds: string[] = [];
  let openPracticalSequence = 0;
  for (const [index, placement] of containerRows.entries()) {
    const alongX = placement.axis === 'x';
    const containerSize: [number, number, number] = alongX ? [5.8, 2.6, 2.5] : [2.5, 2.6, 5.8];
    const marker = new THREE.Group();
    marker.name = 'rustworks-container-placement';
    marker.position.set(placement.x, 0, placement.z);
    marker.userData.rustworksContainerSide = placement.side;
    marker.userData.rustworksContainerCluster = placement.cluster;
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
        // HF-390: these are the skin of the same shipping container the closed
        // placements rate as `container`. Left to the name rules, `wall-a`/`wall-b`
        // landed on `interior-wall` (drywall) and `roof` on `concrete` - three
        // different penetration ratings for one asset. Per-metre traversal still
        // prices a 0.14 m shell far below the solid 2.5 m box.
        const shell = box(
          builder,
          `rustworks-open-container-${part.suffix}`,
          part.position as [number, number, number],
          part.size as [number, number, number],
          material,
          { ballisticMaterial: 'container' },
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
      const practicalId = `rustworks-container-practical-${placement.cluster}-${placement.slot}`;
      const practicalPaletteIndex = openPracticalSequence % containerPracticalMaterials.length;
      const practicalMaterial = containerPracticalMaterials[practicalPaletteIndex]!;
      openPracticalSequence += 1;
      const practical = box(
        builder,
        practicalId,
        [placement.x, 2.36, placement.z],
        alongX ? [2.1, 0.08, 0.16] : [0.16, 0.08, 2.1],
        practicalMaterial,
        { solid: false, shots: false, cast: false, detail: 'performance' },
      );
      practical.userData.occlusionPolicy = 'emissive-only';
      practical.userData.practicalPolicyId = 'container-interior-warm-practicals';
      practical.userData.containerInterior = true;
      practical.userData.containerCluster = placement.cluster;
      practical.userData.paletteIndex = practicalPaletteIndex;
      containerPracticalIds.push(practicalId);
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
        const end = box(builder, 'rustworks-open-one-container-closed-end', endPosition, endSize, material, { ballisticMaterial: 'container' });
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
    closedPercent: 50,
    openPercent: 50,
    clusters: 4,
    perCluster: 4,
    perimeterWall: false,
    minimumTowerDistance: Math.min(...containerRows.map((placement) => Math.hypot(placement.x, placement.z))),
    onlyShippingContainers: true,
  };
  root.userData.rustworksContainerPracticalAudit = {
    ids: containerPracticalIds,
    count: containerPracticalIds.length,
    palette: [...containerPracticalPalette],
    fixtureOcclusionPolicy: 'emissive-only',
    dynamicOcclusionPolicy: 'shadowed-local',
    shadowedDynamicFill: 'four-cluster-container-practical-pulse',
    dynamicPracticalIds: RUSTWORKS_CONTAINER_LIGHTS.map((fixture) => `container-dynamic-${fixture.id}`),
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
  labelBoard.userData.label = 'RUSTRIG';
  const welshFlag = createRustworksWelshFlag();
  root.add(welshFlag);
  root.userData.rustworksFlagAudit = welshFlag.userData.rustworksFlagAudit;

  root.userData.rustworksPresentationBatches = batchPresentationOnlyBoxes(root, 'rustworks');
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
    label: 'RustRig',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(
      [
        [0, 19], [-13, 19], [13, 19], [-19, 14], [-19, 0], [-13, 14], [23, 24], [-25, 23],
      ],
      [
        [0, -19], [13, -19], [-13, -19], [19, -14], [19, 0], [13, -14], [23, -24], [-23, -24],
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
    if (node.userData.staticBatchRendered === true
      && (root.userData.pass65StaticBatchReady === true || !String(node.name).startsWith('rustworks-presentation-batch-'))) {
      if (node.visible) {
        node.visible = false;
        hidden += 1;
      }
      return;
    }
    const detail = node.userData.rustworksDetail as string | undefined;
    if (node.userData.blenderAuthoredEnvironment) {
      if (node.visible) {
        node.visible = false;
        hidden += 1;
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
    const authorityId = node.userData.skylineCollisionAuthorityId as string | undefined;
    let visiblePresentation = false;
    if (authorityId) {
      root.traverse((candidate) => {
        if (candidate === node
          || candidate.userData.skylineCollisionAuthorityId !== authorityId
          || !candidate.visible
          || candidate.userData.skylineQualityPlaceholder === true
          || !(candidate instanceof THREE.Mesh)) return;
        const candidateMaterials = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
        if (candidateMaterials.some((material) => material.visible && material.colorWrite)) visiblePresentation = true;
      });
    }
    // HF-188: collision authority may be hidden only while an explicitly
    // bound authored presentation is visible in the active profile. Missing
    // ownership fails visible instead of leaving a mystery blocker.
    node.castShadow = false;
    node.receiveShadow = false;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      material.colorWrite = !visiblePresentation;
      material.depthWrite = !visiblePresentation;
      material.needsUpdate = true;
    }
    node.userData.skylineCollisionPresentationVisible = visiblePresentation;
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
  root.traverse((child) => {
    child.userData.targetRoot = root;
    child.userData.impactSurface = 'metal';
  });
  builder.root.add(root);
  targets.push({ id, root, active: true, respawnAt: 0, scoreValue, distanceBand, maxHealth: 500, health: 500, kind: 'plate' });
}

function lateralRangeTarget(
  builder: Builder,
  targets: PracticeTarget[],
  id: string,
  originX: number,
  z: number,
  phase: number,
  color: number,
): void {
  const root = new THREE.Group();
  root.name = 'gun-range-lateral-illuminated-target';
  root.userData.targetId = id;
  root.userData.scoreValue = 250;
  root.userData.lateralOriginX = originX;
  root.userData.lateralAmplitudeM = 3.6;
  root.userData.lateralFrequencyHz = 0.065;
  root.userData.lateralPhaseRadians = phase;
  root.position.set(originX, 0, z);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 1.45, 0.16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.8, roughness: 0.34, metalness: 0.4 }),
  );
  plate.name = 'gun-range-lateral-target-plate';
  plate.position.y = 1.72;
  plate.userData.hitZone = 'body';
  root.add(plate);
  root.traverse((child) => {
    child.userData.targetRoot = root;
    child.userData.impactSurface = 'metal';
  });
  builder.root.add(root);
  const lateralTargets = (builder.root.userData.gunRangeLateralTargets ??= []) as THREE.Group[];
  lateralTargets.push(root);
  targets.push({ id, root, active: true, respawnAt: 0, scoreValue: 250, distanceBand: 'mid', maxHealth: 500, health: 500, kind: 'plate' });
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

type GunRangeTestDummyPresentation = Readonly<{
  root: THREE.Group;
  definition: GunRangeTestBayDummyDefinition;
  /** The actual canonical operator child; poseOperator cannot animate its wrapper. */
  riggedOperator: THREE.Group | null;
}>;

export type GunRangeTestBayDoorFrame = Readonly<{
  state: GunRangeTestBayDoorState;
  audioIntent: 'secure-door-opening-thump' | null;
  collisionChanged: boolean;
  dynamicColliders: readonly DynamicWorldCollider[];
  dynamicBallisticSurfaces: readonly BallisticSurface[];
}>;

function gunRangeTrainingDummy(
  builder: Builder,
  targets: PracticeTarget[],
  definition: GunRangeTestBayDummyDefinition,
  index: number,
): GunRangeTestDummyPresentation {
  const root = new THREE.Group();
  root.name = `gun-range-${definition.id}`;
  root.userData.targetId = definition.id;
  root.userData.targetKind = 'training-dummy';
  root.userData.armed = false;
  root.userData.walkSpeedMps = definition.speedMps;
  root.userData.scoreValue = 250;
  root.userData.maxHealth = 300;
  // Owner direction: the killstreak-room training bots must look like the
  // combatants in real matches. Use the canonical rigged operator family when
  // its authored GLB has loaded; the painted training robot remains only as a
  // pre-load fixture and is replaced as soon as the shared rig is ready.
  const rigged = (() => {
    try {
      return buildOperator(index % 2 === 0 ? 1 : 0, `gun-range-${definition.id}`, false, null, 'neon-purple');
    } catch {
      // Canonical rig not loaded yet (e.g. headless/unit environments): fall
      // back to the painted training robot below. Live deployment always loads
      // the rig before arena construction, so gameplay uses the rigged model.
      return null;
    }
  })();
  if (rigged) {
    // Use the same bounded emissive colour treatment as live combat bots so
    // unarmed test-bay targets remain readable in every graphics profile.
    applyBotEmissiveBrightness(rigged);
    rigged.position.set(0, 0, 0);
    rigged.userData.targetRoot = root;
    rigged.userData.targetId = definition.id;
    rigged.traverse((node) => {
      node.userData.targetRoot = root;
      node.userData.targetId = definition.id;
      if (node instanceof THREE.Mesh) node.userData.impactSurface = 'metal';
    });
    root.add(rigged);
    const parts: THREE.Mesh[] = [];
    rigged.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || node.userData.authoritativeProxy === true) return;
      parts.push(node);
      builder.raycastMeshes.push(node);
    });
    root.userData.targetMeshes = parts;
    root.userData.riggedOperator = true;
    root.position.set(definition.start.x, definition.start.y, definition.start.z);
    builder.root.add(root);
    targets.push({
      id: definition.id,
      root,
      active: true,
      respawnAt: 0,
      respawnDelayMs: 2_500,
      scoreValue: 250,
      distanceBand: 'mid',
      maxHealth: 300,
      health: 300,
      kind: 'training-dummy',
    });
    return Object.freeze({ root, definition, riggedOperator: rigged });
  }
  // Review capture and compatibility renderers must not turn the slow targets
  // into black silhouettes when authored practical lights are culled. These
  // are painted training robots, so an unlit albedo is also semantically apt.
  const shell = new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? 0xb9c8ca : 0x9aabad, toneMapped: false });
  const armour = new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? 0x279aa0 : 0xb87832, toneMapped: false });
  const joint = new THREE.MeshBasicMaterial({ color: 0x263337, toneMapped: false });
  const parts: THREE.Mesh[] = [];
  const part = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    hitZone: 'head' | 'body' | 'limb',
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `gun-range-${definition.id}-${name}`;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.targetRoot = root;
    mesh.userData.targetId = definition.id;
    mesh.userData.hitZone = hitZone;
    mesh.userData.impactSurface = 'metal';
    root.add(mesh);
    builder.raycastMeshes.push(mesh);
    parts.push(mesh);
    return mesh;
  };
  part('torso', new THREE.BoxGeometry(0.72, 0.94, 0.38), armour, [0, 1.32, 0], 'body');
  part('pelvis', new THREE.BoxGeometry(0.55, 0.34, 0.34), shell, [0, 0.72, 0], 'body');
  part('head', new THREE.SphereGeometry(0.27, 14, 10), shell, [0, 2.08, 0], 'head');
  for (const side of [-1, 1] as const) {
    part(`arm-${side}`, new THREE.CapsuleGeometry(0.105, 0.62, 4, 8), shell, [side * 0.52, 1.28, 0], 'limb').rotation.z = side * 0.13;
    part(`leg-${side}`, new THREE.CapsuleGeometry(0.13, 0.72, 4, 8), joint, [side * 0.2, 0.24, 0], 'limb');
  }
  root.userData.targetMeshes = parts;
  root.position.set(definition.start.x, definition.start.y, definition.start.z);
  builder.root.add(root);
  targets.push({
    id: definition.id,
    root,
    active: true,
    respawnAt: 0,
    respawnDelayMs: 2_500,
    scoreValue: 250,
    distanceBand: 'mid',
    maxHealth: 300,
    health: 300,
    kind: 'training-dummy',
  });
  return Object.freeze({ root, definition, riggedOperator: null });
}

function syncGunRangeTestBayDoorLeaf(root: THREE.Object3D, state: GunRangeTestBayDoorState): void {
  const leaf = root.getObjectByName('gun-range-test-bay-secure-door-leaf');
  if (!leaf) return;
  const bounds = gunRangeTestBayDoorLeafBounds(state);
  leaf.position.y = ((bounds.minY ?? 0) + (bounds.maxY ?? 0)) / 2;
  leaf.userData.phase = state.phase;
  leaf.userData.openness = state.openness;
}

/**
 * Narrow frame API for the main runtime. The caller owns audio delivery and
 * must merge dynamicColliders into the existing Rapier reconciliation set.
 */
export function updateGunRangeTestBayDoor(
  root: THREE.Object3D,
  nowMs: number,
  observerPosition: Readonly<{ x: number; y: number; z: number }>,
): GunRangeTestBayDoorFrame {
  const prior = (root.userData.gunRangeTestBayDoorState as GunRangeTestBayDoorState | undefined)
    ?? createGunRangeTestBayDoorState(nowMs);
  const step = advanceGunRangeTestBayDoor(prior, nowMs, observerPosition);
  root.userData.gunRangeTestBayDoorState = step.state;
  syncGunRangeTestBayDoorLeaf(root, step.state);
  return Object.freeze({
    ...step,
    dynamicColliders: gunRangeTestBayDoorDynamicColliders(step.state),
    dynamicBallisticSurfaces: gunRangeTestBayDoorDynamicBallisticSurfaces(step.state),
  });
}

/** Apply a host-authored or host-clock-projected leaf state. No observer is
 * accepted here, so a guest can never author its own collision corridor. */
export function applyGunRangeTestBayDoorState(
  root: THREE.Object3D,
  state: GunRangeTestBayDoorState,
): GunRangeTestBayDoorFrame {
  const prior = root.userData.gunRangeTestBayDoorState as GunRangeTestBayDoorState | undefined;
  root.userData.gunRangeTestBayDoorState = state;
  syncGunRangeTestBayDoorLeaf(root, state);
  return Object.freeze({
    state,
    audioIntent: null,
    collisionChanged: prior === undefined || Math.abs(prior.openness - state.openness) > Number.EPSILON,
    dynamicColliders: gunRangeTestBayDoorDynamicColliders(state),
    dynamicBallisticSurfaces: gunRangeTestBayDoorDynamicBallisticSurfaces(state),
  });
}

export function buildGunRange(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Acres Indoor Gun Range arena';
  scene.add(root);
  const builder: Builder = {
    root, colliders: [], physicsColliders: [], raycastMeshes: [], shotSurfaces: [], ballisticSurfaceSequence: 0,
  };
  const concrete = standard(0x626a6d, 0.98, 0.02);
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
  const lamp = new THREE.MeshStandardMaterial({ color: 0xf1ffff, emissive: 0xa8f5ff, emissiveIntensity: 4.2, roughness: 0.18, metalness: 0.08 });
  const targets: PracticeTarget[] = [];
  root.userData.gunRangeBayLightMaterial = lamp;

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
  floor.userData.ballisticMaterial = floorSurface.material;

  // A pale textured shell keeps player and target silhouettes readable. Dark
  // acoustic/ballistic inserts preserve contrast without turning the room black.
  box(builder, 'gun-range-backstop', [0, 3.6, -49], [42, 7.2, 1.2], dark);
  box(builder, 'gun-range-left-wall', [-20.5, 3.6, -14.5], [1, 7.2, 70], wall);
  // Split the east wall around the 8 m test-bay portal. The two solids retain
  // the original shell identity while leaving movement and shots genuinely
  // clear through z=8..16; no opaque/collider plane masks the new opening.
  box(builder, 'gun-range-right-wall', [20.5, 3.6, -20.5], [1, 7.2, 57], wall);
  box(builder, 'gun-range-right-wall', [20.5, 3.6, 18], [1, 7.2, 4], wall);
  box(builder, 'gun-range-rear-wall', [0, 3.6, 20], [42, 7.2, 1], wall);
  box(builder, 'gun-range-ceiling', [0, 7.1, -14.5], [42, 0.45, 70], ceiling, { solid: false, shots: true });

  // Pass 66 grey-room annex. Ordinary forward walk is 6.15 m/s, so the
  // 30.75 m entry-to-door approach is exactly five seconds without sprinting.
  const testBayWall = terminalSurfaceMaterial('panel', 0x9aa3a6, '#4e5a5e', 0.62, 0.48, [6, 4]);
  testBayWall.name = 'GunRange_TestBay_GreyWall_PanelTexture';
  testBayWall.emissive.setHex(0x465155);
  testBayWall.emissiveIntensity = 0.52;
  const testBayFloor = terminalSurfaceMaterial('concrete', 0x596164, '#a5afb2', 0.88, 0.16, [12, 16]);
  testBayFloor.name = 'GunRange_TestBay_GreyFloor_Texture';
  testBayFloor.emissive.setHex(0x293235);
  testBayFloor.emissiveIntensity = 0.42;
  const testBayCeiling = terminalSurfaceMaterial('panel', 0x525d61, '#192225', 0.7, 0.5, [10, 8]);
  testBayCeiling.name = 'GunRange_TestBay_GreyCeiling_PanelTexture';
  testBayCeiling.emissive.setHex(0x252f32);
  testBayCeiling.emissiveIntensity = 0.4;
  const testBayCyan = new THREE.MeshBasicMaterial({ color: 0x35b9b6, toneMapped: false });
  const testBayAmber = new THREE.MeshBasicMaterial({ color: 0xd49742, toneMapped: false });
  const testBayVisibleFloor = terminalSurfaceMaterial('concrete', 0x495457, '#8c999d', 0.84, 0.18, [16, 20]);
  testBayVisibleFloor.name = 'GunRange_TestBay_VisibleFloor_PBR';
  testBayVisibleFloor.emissive.setHex(0x11191c);
  testBayVisibleFloor.emissiveIntensity = 0.18;
  const testBayVisibleWall = terminalSurfaceMaterial('panel', 0x718086, '#263237', 0.62, 0.42, [12, 8]);
  testBayVisibleWall.name = 'GunRange_TestBay_VisibleWall_PBR';
  testBayVisibleWall.emissive.setHex(0x172125);
  testBayVisibleWall.emissiveIntensity = 0.2;
  const testBayVisibleCeiling = terminalSurfaceMaterial('panel', 0x465359, '#151f23', 0.76, 0.34, [12, 8]);
  testBayVisibleCeiling.name = 'GunRange_TestBay_VisibleCeiling_PBR';
  testBayVisibleCeiling.emissive.setHex(0x10191c);
  testBayVisibleCeiling.emissiveIntensity = 0.16;
  const secureDoorMaterial = new THREE.MeshStandardMaterial({
    color: 0x526168,
    emissive: 0x101b1f,
    emissiveIntensity: 0.24,
    roughness: 0.42,
    metalness: 0.82,
  });
  secureDoorMaterial.name = 'GunRange_TestBay_SecureDoor_FrameMetal';
  const secureDoorPanelMaterial = terminalSurfaceMaterial('panel', 0x5f6e74, '#1e2b30', 0.44, 0.78, [4, 6]);
  secureDoorPanelMaterial.name = 'GunRange_TestBay_SecureDoor_PanelTexture';
  // The original physically dark gunmetal collapsed to a black slab under the
  // bounded WebGPU practicals. Keep the metal read, but give the authored panel
  // map enough diffuse/emissive separation to remain visible from both sides.
  secureDoorPanelMaterial.color.setHex(0x879ba2);
  secureDoorPanelMaterial.emissive.setHex(0x2a4149);
  secureDoorPanelMaterial.emissiveIntensity = 0.78;
  secureDoorPanelMaterial.roughness = 0.56;
  secureDoorPanelMaterial.metalness = 0.52;
  secureDoorPanelMaterial.userData.testBayDoorTextureMapping = Object.freeze({ pattern: 'panel', repeat: [2, 3] });

  const doorAssembly = new THREE.Group();
  doorAssembly.name = 'gun-range-test-bay-secure-door-assembly';
  doorAssembly.userData.authorityId = GUN_RANGE_TEST_BAY_CONTRACT.door.id;
  doorAssembly.userData.structure = 'static-frame-with-dynamic-leaf';
  doorAssembly.userData.practicalIds = Object.freeze(['test-bay-door-approach-key', 'test-bay-door-bay-key']);
  doorAssembly.userData.fixtureDepthPlanes = Object.freeze({
    leafHalfThicknessM: 0.35,
    armourFaceM: 0.358,
    braceFaceM: 0.37,
    spineFaceM: 0.382,
    detailFaceM: 0.394,
    emissiveFaceM: 0.406,
    emissiveSecondaryFaceM: 0.418,
    minimumGapM: 0.004,
  });
  doorAssembly.userData.emissiveIndicatorAnimation = 'static';
  root.add(doorAssembly);

  const structureMaterials = {
    wall: testBayWall,
    floor: testBayFloor,
    ceiling: testBayCeiling,
    'door-frame': secureDoorMaterial,
  } as const;
  for (const definition of GUN_RANGE_TEST_BAY_STRUCTURE) {
    const mesh = box(
      builder,
      definition.id,
      [...definition.position],
      [...definition.size],
      structureMaterials[definition.material],
      { ballisticMaterial: definition.ballisticMaterial },
    );
    mesh.userData.testBayAuthority = 'visible-movement-physics-ballistic';
    mesh.userData.testBayStructureId = definition.id;
    if (definition.assemblyRole) {
      mesh.userData.doorAssemblyRole = definition.assemblyRole;
      doorAssembly.add(mesh);
    }
  }

  // Thin PBR interior skins expose authored panel mapping to the bounded
  // practicals without becoming collision or shot authority.
  for (const skin of [
    box(builder, 'gun-range-test-bay-corridor-floor-skin', [35.75, 0.012, 12], [30.25, 0.024, 7.55], testBayVisibleFloor, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-corridor-north-skin', [35.75, 2.55, 8.015], [30.25, 4.9, 0.03], testBayVisibleWall, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-corridor-south-skin', [35.75, 2.55, 15.985], [30.25, 4.9, 0.03], testBayVisibleWall, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-corridor-ceiling-skin', [35.75, 4.955, 12], [30.25, 0.03, 7.55], testBayVisibleCeiling, { solid: false, shots: false, cast: false }),
  ]) skin.userData.presentationBatchCandidate = false;
  for (const x of [24, 29, 34, 39, 44, 49]) {
    const ceilingRib = box(builder, 'gun-range-test-bay-corridor-light-rib', [x, 4.88, 12], [0.18, 0.12, 7.2], x % 2 === 0 ? testBayCyan : testBayAmber, { solid: false, shots: false, cast: false });
    ceilingRib.userData.presentationBatchCandidate = false;
    for (const [sideIndex, z] of [8.03, 15.97].entries()) {
      const wallRib = box(builder, 'gun-range-test-bay-corridor-wall-rib', [x, 2.45, z], [0.16, 4.55, 0.08], sideIndex === 0 ? testBayCyan : testBayAmber, { solid: false, shots: false, cast: false });
      wallRib.userData.presentationBatchCandidate = false;
    }
  }
  for (const guide of [
    box(builder, 'gun-range-test-bay-corridor-guide-cyan', [35.75, 0.025, 9.15], [30.5, 0.05, 0.18], testBayCyan, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-corridor-guide-amber', [35.75, 0.026, 14.85], [30.5, 0.052, 0.18], testBayAmber, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-corridor-wall-guide-cyan', [35.75, 1.12, 8.03], [30.5, 0.15, 0.08], testBayCyan, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-corridor-wall-guide-amber', [35.75, 1.12, 15.97], [30.5, 0.15, 0.08], testBayAmber, { solid: false, shots: false, cast: false }),
  ]) guide.userData.presentationBatchCandidate = false;

  // Large 48.5 x 64 m bay: west wall is split around the secure door aperture.
  // Owner direction: the killstreak-testing room roof is three times taller so
  // chopper/drone altitudes read realistically; the bay clears 25.5 m.
  for (const skin of [
    box(builder, 'gun-range-test-bay-floor-skin', [75.75, 0.012, 6], [48, 0.024, 63.5], testBayVisibleFloor, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-ceiling-skin', [75.75, 25.155, 6], [48, 0.03, 63.5], testBayVisibleCeiling, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-east-wall-skin', [99.985, 13.15, 6], [0.03, 24.5, 63.5], testBayVisibleWall, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-north-wall-skin', [75.75, 13.15, -25.985], [48, 24.5, 0.03], testBayVisibleWall, { solid: false, shots: false, cast: false }),
    box(builder, 'gun-range-test-bay-south-wall-skin', [75.75, 13.15, 37.985], [48, 24.5, 0.03], testBayVisibleWall, { solid: false, shots: false, cast: false }),
  ]) skin.userData.presentationBatchCandidate = false;
  for (const rail of [
    box(builder, 'gun-range-test-bay-door-rail-north', [51.47, 3.3, 8.24], [0.12, 6.6, 0.16], secureDoorMaterial, { solid: false, shots: false }),
    box(builder, 'gun-range-test-bay-door-rail-south', [51.47, 3.3, 15.76], [0.12, 6.6, 0.16], secureDoorMaterial, { solid: false, shots: false }),
  ]) {
    rail.userData.doorAssemblyRole = 'track';
    rail.userData.presentationBatchCandidate = false;
    doorAssembly.add(rail);
  }
  // Secure door leaf: textured armour panels with amber/cyan status edge
  // lights so the door reads as the room's gameplay entrance from both faces.
  const secureDoor = box(builder, 'gun-range-test-bay-secure-door-leaf', [51.5, 3.25, 12], [0.7, 6.5, 7.6], secureDoorPanelMaterial, { solid: false, shots: false });
  doorAssembly.add(secureDoor);
  secureDoor.userData.presentationBatchCandidate = false;
  secureDoor.userData.dynamic = true;
  secureDoor.userData.authorityId = GUN_RANGE_TEST_BAY_CONTRACT.door.id;
  secureDoor.userData.portalCollisionStatus = 'runtime-helper-required';
  secureDoor.userData.defaultFailsOpen = false;
  const doorStatusRangeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0b24b,
    emissive: 0xf0b24b,
    emissiveIntensity: 3.1,
    roughness: 0.28,
    metalness: 0.18,
    toneMapped: false,
  });
  doorStatusRangeMaterial.name = 'GunRange_TestBay_DoorStatus_Amber';
  const doorStatusBayMaterial = new THREE.MeshStandardMaterial({
    color: 0x53ded8,
    emissive: 0x53ded8,
    emissiveIntensity: 3.1,
    roughness: 0.28,
    metalness: 0.18,
    toneMapped: false,
  });
  doorStatusBayMaterial.name = 'GunRange_TestBay_DoorStatus_Cyan';
  const doorInlayMaterial = new THREE.MeshStandardMaterial({
    color: 0x172328,
    emissive: 0x071115,
    emissiveIntensity: 0.25,
    roughness: 0.34,
    metalness: 0.88,
  });
  doorInlayMaterial.name = 'GunRange_TestBay_DoorInlay_Gunmetal';
  const doorArmourPlateMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aaeb3,
    emissive: 0x31474d,
    emissiveIntensity: 0.62,
    roughness: 0.5,
    metalness: 0.58,
  });
  doorArmourPlateMaterial.name = 'GunRange_TestBay_DoorArmour_SatinSteel';
  const doorGlassMaterial = new THREE.MeshStandardMaterial({
    color: 0x77eeea,
    emissive: 0x167f81,
    emissiveIntensity: 1.35,
    roughness: 0.18,
    metalness: 0.08,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    toneMapped: false,
  });
  doorGlassMaterial.name = 'GunRange_TestBay_DoorGlass_ClearCyan';
  const attachDoorFixture = (
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    material: THREE.Material,
    role: 'edge' | 'status-light' | 'armour-panel' | 'brace' | 'glass' | 'glyph',
  ): THREE.Mesh => {
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    fixture.name = name;
    fixture.position.set(...position);
    fixture.castShadow = false;
    fixture.receiveShadow = false;
    fixture.userData.presentationOnly = true;
    fixture.userData.presentationBatchCandidate = false;
    fixture.userData.dynamic = true;
    fixture.userData.doorAssemblyRole = role;
    fixture.userData.depthPlaneX = position[0];
    secureDoor.add(fixture);
    return fixture;
  };
  // Every decorative layer occupies its own non-overlapping depth interval.
  // The previous values embedded the cyan/amber bars inside the leaf and each
  // other, producing deterministic z-fighting whenever the door moved.
  attachDoorFixture('gun-range-test-bay-door-edge-north', [0, 0, -3.86], [0.7, 6.5, 0.12], doorStatusRangeMaterial, 'edge');
  attachDoorFixture('gun-range-test-bay-door-edge-south', [0, 0, 3.86], [0.7, 6.5, 0.12], doorStatusBayMaterial, 'edge');
  attachDoorFixture('gun-range-test-bay-door-armour-range-face', [-0.358, 0.12, 0], [0.008, 4.9, 5.8], secureDoorPanelMaterial, 'armour-panel');
  attachDoorFixture('gun-range-test-bay-door-armour-bay-face', [0.358, 0.12, 0], [0.008, 4.9, 5.8], secureDoorPanelMaterial, 'armour-panel');
  for (const [face, sign] of [['range', -1], ['bay', 1]] as const) {
    const braceX = sign * 0.37;
    const spineX = sign * 0.382;
    const detailX = sign * 0.394;
    const emissiveX = sign * 0.406;
    const emissiveSecondaryX = sign * 0.418;
    attachDoorFixture(`gun-range-test-bay-door-brace-${face}-upper`, [braceX, 1.72, 0], [0.008, 0.18, 6.25], secureDoorMaterial, 'brace');
    attachDoorFixture(`gun-range-test-bay-door-brace-${face}-lower`, [braceX, -1.52, 0], [0.008, 0.18, 6.25], secureDoorMaterial, 'brace');
    attachDoorFixture(`gun-range-test-bay-door-spine-${face}`, [spineX, 0.12, 0], [0.008, 4.9, 0.34], doorInlayMaterial, 'brace');
    for (const [vertical, y] of [['upper', 1.72], ['lower', -1.48]] as const) {
      for (const [side, z] of [['north', -2.42], ['south', 2.42]] as const) {
        attachDoorFixture(
          `gun-range-test-bay-door-armour-tile-${face}-${vertical}-${side}`,
          [detailX, y, z],
          [0.008, 1.12, 1.18],
          doorArmourPlateMaterial,
          'armour-panel',
        );
      }
    }
    for (const [side, z] of [['north', -1.42], ['south', 1.42]] as const) {
      attachDoorFixture(
        `gun-range-test-bay-door-glass-${face}-${side}`,
        [detailX, 0.28, z],
        [0.008, 2.65, 0.62],
        doorGlassMaterial,
        'glass',
      );
    }
    const chevronUpper = attachDoorFixture(
      `gun-range-test-bay-door-chevron-${face}-upper`,
      [emissiveSecondaryX, 0.55, 0],
      [0.008, 0.13, 3.2],
      face === 'range' ? doorStatusRangeMaterial : doorStatusBayMaterial,
      'glyph',
    );
    chevronUpper.rotation.x = Math.PI / 7;
    const chevronLower = attachDoorFixture(
      `gun-range-test-bay-door-chevron-${face}-lower`,
      [emissiveX, 0.55, 0],
      [0.008, 0.13, 3.2],
      face === 'range' ? doorStatusRangeMaterial : doorStatusBayMaterial,
      'glyph',
    );
    chevronLower.rotation.x = -Math.PI / 7;
  }
  // One static emissive indicator per face keeps the moving entrance readable
  // without an unoccluded light or any per-frame intensity animation.
  attachDoorFixture('gun-range-test-bay-door-status-range-face', [-0.406, -2.3, 0], [0.008, 0.82, 1.45], doorStatusRangeMaterial, 'status-light');
  attachDoorFixture('gun-range-test-bay-door-status-bay-face', [0.406, -2.3, 0], [0.008, 0.82, 1.45], doorStatusBayMaterial, 'status-light');
  doorAssembly.userData.statusLightMaterials = Object.freeze([doorStatusRangeMaterial, doorStatusBayMaterial]);
  const practicalHousing = box(builder, 'gun-range-test-bay-door-practical-housing', [51.12, 6.78, 12], [0.12, 0.42, 2.6], secureDoorMaterial, { solid: false, shots: false, cast: false });
  practicalHousing.userData.doorAssemblyRole = 'practical-housing';
  practicalHousing.userData.presentationBatchCandidate = false;
  doorAssembly.add(practicalHousing);
  const practicalEmitter = box(builder, 'gun-range-test-bay-door-practical-emitter', [51.04, 6.7, 12], [0.04, 0.16, 1.9], testBayCyan, { solid: false, shots: false, cast: false });
  practicalEmitter.userData.doorAssemblyRole = 'practical-emitter';
  practicalEmitter.userData.practicalId = 'test-bay-door-approach-key';
  practicalEmitter.userData.presentationBatchCandidate = false;
  doorAssembly.add(practicalEmitter);
  const bayPracticalHousing = box(builder, 'gun-range-test-bay-door-bay-practical-housing', [52.02, 6.78, 12], [0.12, 0.42, 2.6], secureDoorMaterial, { solid: false, shots: false, cast: false });
  bayPracticalHousing.userData.doorAssemblyRole = 'practical-housing';
  bayPracticalHousing.userData.presentationBatchCandidate = false;
  doorAssembly.add(bayPracticalHousing);
  const bayPracticalEmitter = box(builder, 'gun-range-test-bay-door-bay-practical-emitter', [52.1, 6.7, 12], [0.04, 0.16, 1.9], testBayAmber, { solid: false, shots: false, cast: false });
  bayPracticalEmitter.userData.doorAssemblyRole = 'practical-emitter';
  bayPracticalEmitter.userData.practicalId = 'test-bay-door-bay-key';
  bayPracticalEmitter.userData.presentationBatchCandidate = false;
  doorAssembly.add(bayPracticalEmitter);
  doorAssembly.userData.fixtureIds = Object.freeze([
    'gun-range-test-bay-door-rail-north',
    'gun-range-test-bay-door-rail-south',
    'gun-range-test-bay-door-practical-housing',
    'gun-range-test-bay-door-practical-emitter',
    'gun-range-test-bay-door-bay-practical-housing',
    'gun-range-test-bay-door-bay-practical-emitter',
  ]);
  for (const z of [-19, -7, 5, 17, 29]) {
    box(builder, 'gun-range-test-bay-ceiling-light', [75.5, 25.02, z], [35, 0.12, 0.3], z % 2 === 0 ? testBayAmber : testBayCyan, { solid: false, shots: false, cast: false });
  }
  for (const x of [59, 67, 75, 83, 91, 99]) {
    const grid = box(builder, 'gun-range-test-bay-floor-grid-x', [x, 0.023, 6], [0.11, 0.046, 62], x % 2 === 0 ? testBayAmber : testBayCyan, { solid: false, shots: false, cast: false });
    grid.userData.presentationBatchCandidate = false;
  }
  for (const z of [-20, -10, 0, 10, 20, 30]) {
    const grid = box(builder, 'gun-range-test-bay-floor-grid-z', [75.75, 0.024, z], [47, 0.048, 0.11], z % 20 === 0 ? testBayAmber : testBayCyan, { solid: false, shots: false, cast: false });
    grid.userData.presentationBatchCandidate = false;
  }

  const testBaySign = rangeSign('SECURE SYSTEMS TEST BAY', 0x53ded8, 'gun-range-test-bay-sign', [13.5, 0.95]);
  if (testBaySign) {
    testBaySign.position.set(52.15, 6.65, 12);
    testBaySign.rotation.y = -Math.PI / 2;
    if (!Array.isArray(testBaySign.material)) testBaySign.material.side = THREE.FrontSide;
    root.add(testBaySign);
  }
  const supportSign = rangeSign('ALL SUPPORT SYSTEMS', 0xf0b24b, 'gun-range-test-bay-support-sign', [11.5, 0.82]);
  if (supportSign) {
    supportSign.position.set(99.85, 6.6, 6);
    supportSign.rotation.y = -Math.PI / 2;
    if (!Array.isArray(supportSign.material)) supportSign.material.side = THREE.FrontSide;
    root.add(supportSign);
  }

  // These pads are honest structural stations. Their canonical IDs are
  // projected from the killstreak catalog; the main runtime consumes the IDs
  // through the normal host-authoritative support and weapon admission paths.
  for (const [index, station] of GUN_RANGE_TEST_BAY_CONTRACT.supportStations.entries()) {
    const pad = box(builder, `gun-range-test-bay-support-pad-${station.id}`, [station.position.x, 0.06, station.position.z], [5.6, 0.12, 5.6], index % 2 === 0 ? testBayAmber : testBayCyan, { solid: false, shots: false, cast: false });
    pad.userData.supportId = station.id;
    pad.userData.runtimeStatus = station.runtimeStatus;
  }
  for (const [index, station] of GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.entries()) {
    const marker = box(builder, `gun-range-test-bay-weapon-marker-${station.id}`, [station.position.x, 0.055, station.position.z], [4.8, 0.11, 0.5], index % 2 === 0 ? testBayCyan : testBayAmber, { solid: false, shots: false, cast: false });
    marker.userData.weaponId = station.id;
    marker.userData.runtimeStatus = station.runtimeStatus;
    const weapon = WEAPONS[station.id];
    const label = rangeSign(weapon.name.toUpperCase(), weapon.color, `gun-range-test-bay-weapon-label-${station.id}`, [5.2, 0.7]);
    if (label) {
      label.position.set(0, 0.72, -1.05);
      label.rotation.x = -Math.PI * 0.08;
      label.userData.weaponId = station.id;
      label.userData.canonicalWeaponName = weapon.name;
      marker.add(label);
    }
  }

  const testDummyPresentations = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map(
    (definition, index) => gunRangeTrainingDummy(builder, targets, definition, index),
  );
  root.userData.gunRangeTestDummies = testDummyPresentations;
  root.userData.gunRangeTestBayWeaponLabels = Object.freeze(GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.map((station) => Object.freeze({
    id: station.id,
    name: WEAPONS[station.id].name,
    objectName: `gun-range-test-bay-weapon-label-${station.id}`,
  })));
  root.userData.gunRangeTestBayContract = GUN_RANGE_TEST_BAY_CONTRACT;
  root.userData.gunRangeTestBayRuntime = Object.freeze({
    structure: 'implemented',
    slowUnarmedTargets: 'implemented',
    doorHelper: 'integrated-by-main-runtime',
    supportActivation: 'host-authoritative-training-integration',
    weaponInteraction: 'canonical-training-integration',
  });

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
    makeEmissiveOnly(light);
    root.add(light);
  }
  const ambient = new THREE.HemisphereLight(0xf2ffff, 0x4f626a, 1.24);
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
    makeEmissiveOnly(light);
    neonLights.push(light);
    root.add(light);
  }
  const perimeterNeon = neonMaterials[1]!;
  for (const side of [-1, 1] as const) {
    box(builder, 'gun-range-floor-neon-strip', [side * 19.55, 0.12, -14], [0.34, 0.14, 60], perimeterNeon, { solid: false, shots: false, cast: false });
    box(builder, 'gun-range-ceiling-neon-strip', [side * 19.55, 6.68, -14], [0.34, 0.14, 60], perimeterNeon, { solid: false, shots: false, cast: false });
  }
  for (const [index, z] of [-37, -21, -5, 11].entries()) {
    box(builder, 'gun-range-ceiling-neon-rib', [0, 6.69, z], [29, 0.1, 0.22], neonMaterials[index]!, { solid: false, shots: false, cast: false });
  }
  root.userData.gunRangeNeonMaterials = neonMaterials;
  root.userData.gunRangeNeonLights = neonLights;

  box(builder, 'gun-range-control-room', [-16.5, 2.1, 15.5], [6.2, 4.2, 6.2], wall, { ballisticMaterial: 'interior-wall' });
  // HF-390 lane (2026-08-28): the control-room glazing was shots:false - a
  // ghost pane bullets crossed silently. It is glass for gunfire (impact
  // material + 0.1 toll); movement stays non-solid exactly as before.
  box(builder, 'gun-range-control-window', [-13.34, 2.5, 15.2], [0.08, 2, 3.6], new THREE.MeshStandardMaterial({ color: 0x76b8c5, emissive: 0x0a2730, emissiveIntensity: 0.5, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.52 }), { solid: false, shots: true, ballisticMaterial: 'glass' });
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
  const movingTargetSign = rangeSign('MOVING 250 PTS', 0xf4c44f, 'gun-range-moving-score-sign', [4.2, 0.72]);
  if (movingTargetSign) {
    movingTargetSign.position.set(16.2, 2.75, -29);
    root.add(movingTargetSign);
  }
  box(builder, 'gun-range-lateral-target-rail', [0, 3.02, -29], [25, 0.12, 0.16], dark, { solid: false, shots: false, cast: false });
  lateralRangeTarget(builder, targets, 'lateral-cyan', -6.2, -29, 0, 0x56e7df);
  lateralRangeTarget(builder, targets, 'lateral-amber', 6.2, -29, Math.PI, 0xffb347);

  // Subtle live wall-penetration lab: isolated lanes with explicit material and
  // thickness contracts, and a scored plate behind every panel.
  //
  // HF-467, owner after PASS 93: "metal and glass should be shot through ...
  // thin metal (the shed) should get a hole with no collision after". The lab
  // shipped four lanes - glass, wood, plaster, brick - and no METAL of either
  // kind, so the two families the owner named could not be compared here at
  // all: the only sheet metal in the game was on a destructible shed in a back
  // yard, and the only structural steel was the lab's own side walls. The two
  // new lanes make the range the one place a human, or a headless probe, can
  // shoot every material class side by side at a known thickness.
  //
  // Lane x positions are DERIVED from the lane count so a seventh lane cannot
  // be added on top of a sixth: the row is centred on the lab and the panels
  // narrowed from 2.05 m to 1.50 m so six fit between the lab's side walls
  // (inner faces -18.36 and -8.64) instead of four.
  const wallbangGlass = new THREE.MeshStandardMaterial({ color: 0x8ccbd2, transparent: true, opacity: 0.34, roughness: 0.16, metalness: 0.04 });
  const WALLBANG_LAB_CENTRE_X = -13.5;
  const WALLBANG_LANE_SPACING = 1.6;
  const WALLBANG_PANEL_WIDTH = 1.5;
  // Ordered by BALLISTIC_MATERIAL_CLASS: shatter, perforate, then the three
  // penetrate families, then stop. Shooting left to right walks the owner's
  // sentence in order.
  const wallbangPanels = [
    { label: 'GLASS 8 CM', material: 'glass' as const, thickness: 0.08, render: wallbangGlass },
    { label: 'THIN METAL 6 CM', material: 'thin-metal' as const, thickness: 0.06, render: standard(0x9aa4ad, 0.42, 0.78) },
    { label: 'WOOD 24 CM', material: 'wood' as const, thickness: 0.24, render: timber },
    { label: 'PLASTER 42 CM', material: 'interior-wall' as const, thickness: 0.42, render: wall },
    { label: 'STEEL 18 CM', material: 'structural-metal' as const, thickness: 0.18, render: standard(0x5c646b, 0.55, 0.86) },
    { label: 'BRICK 70 CM', material: 'brick' as const, thickness: 0.7, render: standard(0x744838, 0.93, 0.04) },
  ];
  const wallbangLaneX = (index: number) => (
    WALLBANG_LAB_CENTRE_X + (index - (wallbangPanels.length - 1) / 2) * WALLBANG_LANE_SPACING
  );
  for (const [index, panel] of wallbangPanels.entries()) {
    const x = wallbangLaneX(index);
    box(builder, `gun-range-wallbang-panel-${panel.material}`, [x, 1.45, -7.6], [WALLBANG_PANEL_WIDTH, 2.9, panel.thickness], panel.render, {
      solid: false,
      shots: true,
      ballisticMaterial: panel.material,
    });
    rangeTarget(builder, targets, `wallbang-${panel.material}`, x, -12.4, 50, 'near');
    const label = rangeSign(panel.label, index === 0 ? 0x79dce6 : 0xe0aa37, `gun-range-wallbang-label-${panel.material}`, [WALLBANG_PANEL_WIDTH, 0.55]);
    if (label) {
      label.position.set(x, 3.35, -7.5);
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
    // Rack presentation fails closed until the selected-arena deployment gate
    // atomically attaches the already-authored world-LOD firearm family.
    stationRoot.userData.rackPresentationSource = 'fail-closed-unloaded';
    const label = rangeSign(`${station.label} · ${WEAPONS[station.weapon].name.toUpperCase()}`, WEAPONS[station.weapon].color, `gun-range-station-label-${station.weapon}`, [4.15, 0.62]);
    if (label) {
      label.position.set(0, 0.78, 0.65);
      stationRoot.add(label);
    }
    const stationLight = new THREE.PointLight(WEAPONS[station.weapon].color, 5.5, 7, 2);
    stationLight.name = 'gun-range-armory-light';
    stationLight.position.set(0, 2.2, 0.6);
    stationLight.userData.presentationOnly = true;
    makeEmissiveOnly(stationLight);
    stationRoot.add(stationLight);
    root.add(stationRoot);
  }

  root.userData.gunRangeRackPresentation = Object.freeze({
    status: 'unloaded',
    required: GUN_RANGE_WEAPON_STATIONS.length,
    ready: 0,
    source: 'fail-closed',
    error: null,
  });

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

  root.userData.gunRangePresentationBatches = batchPresentationOnlyBoxes(root, 'gun-range');

  return {
    id: 'gun-range',
    label: 'Indoor Gun Range',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(
      // Owner 2026-08-31: "make player and bot spawns nicely spread and
      // balanced everywhere". Both team lists here were BYTE-IDENTICAL - three
      // points on one line, cross-team minimum separation 0.00 m - so in a
      // six-player FFA every player drew from the same three spots and could
      // spawn on top of each other. Widened to six points across the firing
      // line's full width, and the second list offset so the two never collide.
      [[0, 16.5], [-8, 16.5], [8, 16.5], [-12, 16.5], [12, 16.5], [0, 12.5], [-4, 16.5], [4, 16.5]],
      [[-4, 12.5], [4, 12.5], [-8, 12.5], [8, 12.5], [-12, 12.5], [12, 12.5], [-4, 8.5], [4, 8.5]],
    ),
    patrolPoints: [],
    targets,
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { minX: -20, maxX: 100, minZ: -48, maxZ: 38 },
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
  const bayMaterial = root.userData.gunRangeBayLightMaterial as THREE.MeshStandardMaterial | undefined;
  if (bayMaterial) bayMaterial.emissiveIntensity = 3.7 + (Math.sin(nowMs * 0.00062) * 0.5 + 0.5) * 0.9;
  const lateralTargets = root.userData.gunRangeLateralTargets as THREE.Group[] | undefined;
  lateralTargets?.forEach((target) => {
    const phase = nowMs / 1_000 * Math.PI * 2 * Number(target.userData.lateralFrequencyHz)
      + Number(target.userData.lateralPhaseRadians);
    target.position.x = Number(target.userData.lateralOriginX)
      + Math.sin(phase) * Number(target.userData.lateralAmplitudeM);
  });
  const testDummies = root.userData.gunRangeTestDummies as GunRangeTestDummyPresentation[] | undefined;
  testDummies?.forEach(({ root: dummy, definition, riggedOperator }, index) => {
    const pose = gunRangeTestBayRenderedDummyPose(definition, index, nowMs);
    dummy.position.set(
      pose.position.x,
      pose.position.y,
      pose.position.z,
    );
    dummy.rotation.y = pose.yawRadians;
    // Rigged operators (the canonical in-match family) animate through the
    // shared pose pipeline, exactly like live combatants; the painted robot's
    // named-limb walk is only for the pre-rig fixture.
    if (riggedOperator) {
      poseOperator(riggedOperator, 'stand', definition.speedMps, nowMs * 0.008 + index, Math.min(1, 0.016 * 24), 0, 0.016);
      return;
    }
    const arms = [
      dummy.getObjectByName(`gun-range-${definition.id}-arm--1`),
      dummy.getObjectByName(`gun-range-${definition.id}-arm-1`),
    ];
    const legs = [
      dummy.getObjectByName(`gun-range-${definition.id}-leg--1`),
      dummy.getObjectByName(`gun-range-${definition.id}-leg-1`),
    ];
    const stride = Math.sin(nowMs * 0.0045 + index * 0.8) * 0.26;
    arms.forEach((limb, limbIndex) => { if (limb) limb.rotation.x = limbIndex === 0 ? stride : -stride; });
    legs.forEach((limb, limbIndex) => { if (limb) limb.rotation.x = limbIndex === 0 ? -stride : stride; });
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

type TerminalSurfacePattern = 'terrazzo' | 'panel' | 'rubber' | 'fabric' | 'aircraft' | 'cargo' | 'asphalt' | 'concrete' | 'timber';

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

  if (pattern === 'terrazzo' || pattern === 'asphalt' || pattern === 'concrete') {
    const count = pattern === 'terrazzo' ? 170 : pattern === 'concrete' ? 110 : 260;
    for (let index = 0; index < count; index += 1) {
      const x = (index * 73 + 19) % 256;
      const y = (index * 151 + 47) % 256;
      const radius = pattern === 'terrazzo' ? 1 + (index % 3) : pattern === 'concrete' ? 0.8 + (index % 2) : 0.6 + (index % 2);
      context.globalAlpha = pattern === 'terrazzo' ? 0.34 : pattern === 'concrete' ? 0.16 : 0.2;
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
  } else if (pattern === 'timber') {
    context.globalAlpha = 0.28;
    context.lineWidth = 2;
    for (let y = 16; y < 256; y += 24) {
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(58, y - 6, 126, y + 7, 256, y - 2);
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
  const uvs: number[] = [];
  const minimumX = Math.min(...points.map(([x]) => x));
  const maximumX = Math.max(...points.map(([x]) => x));
  const minimumZ = Math.min(...points.map(([, z]) => z));
  const maximumZ = Math.max(...points.map(([, z]) => z));
  const extentX = Math.max(Number.EPSILON, maximumX - minimumX);
  const extentZ = Math.max(Number.EPSILON, maximumZ - minimumZ);
  const indices: number[] = [];
  for (const y of [-half, half]) {
    for (const [x, z] of points) {
      positions.push(x, y, z);
      // The shared top/side vertices use a stable planar wing projection. The
      // thin edge may stretch slightly, but every textured vertex now has a
      // finite UV and WebGPU never has to synthesize a missing attribute.
      uvs.push((x - minimumX) / extentX, (z - minimumZ) / extentZ);
    }
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
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
  const tarmacMat = terminalSurfaceMaterial('concrete', 0x777f80, '#aeb5b4', 0.78, 0.06, [5, 5]);
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
  const palletMat = terminalSurfaceMaterial('timber', 0x8a603c, '#c49a67', 0.82, 0.02, [3, 2]);
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
  const cockpitGlassMat = new THREE.MeshStandardMaterial({
    color: 0x68c6d4,
    roughness: 0.14,
    metalness: 0.16,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  cockpitGlassMat.name = 'skyline-cockpit-glass-material';
  const flightScreenMat = new THREE.MeshStandardMaterial({
    color: 0x123d4b,
    roughness: 0.34,
    metalness: 0.24,
    emissive: 0x0e7587,
    emissiveIntensity: 0.8,
  });
  flightScreenMat.name = 'skyline-flight-screen-material';
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
  // The old unlit soffit stayed uniformly white under every overhang and made
  // Skyline read like a flat blockout. A lightly emissive PBR finish remains
  // readable while still accepting key light, contact shading and shadows.
  const soffitMat = new THREE.MeshStandardMaterial({
    color: 0xe6efee,
    roughness: 0.58,
    metalness: 0.24,
    emissive: 0x10191a,
    emissiveIntensity: 0.12,
  });

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
    collisionAuthorityId: string,
  ): THREE.Mesh => {
    const mesh = box(builder, name, position, size, material.clone());
    mesh.userData.skylineQualityPlaceholder = true;
    mesh.userData.skylineCollisionAuthorityId = collisionAuthorityId;
    return mesh;
  };
  type SkylineWalkablePlatform = Readonly<{
    id: string;
    presentationName: string;
    bounds: Box2;
    y: number;
    ballisticSurfaceId: string;
    qualityPresentationName?: string;
  }>;
  const walkablePlatforms: SkylineWalkablePlatform[] = [];
  const addWalkablePlatform = (
    id: string,
    presentationName: string,
    position: [number, number, number],
    size: [number, number, number],
    material: THREE.MeshStandardMaterial,
    options: Readonly<{ qualityPlaceholder?: boolean; qualityPresentationName?: string }> = {},
  ): THREE.Mesh => {
    const mesh = options.qualityPlaceholder
      ? qualityPlaceholderBox(presentationName, position, size, material, options.qualityPresentationName ?? id)
      : box(builder, presentationName, position, size, material);
    const bounds = builder.physicsColliders[builder.physicsColliders.length - 1];
    walkablePlatforms.push({
      id,
      presentationName,
      bounds,
      y: position[1] + size[1] / 2,
      ballisticSurfaceId: mesh.userData.ballisticSurfaceId as string,
      qualityPresentationName: options.qualityPresentationName,
    });
    mesh.userData.skylineWalkablePlatformId = id;
    return mesh;
  };
  root.userData.skylineDetailClusters = [...skylineClusterIds];
  root.userData.skylineAssetAudit = {
    retained: ['terminal-shell', 'mezzanine-routes', 'breakable-facade', 'jetbridge', 'airstair', 'apron-boundaries'],
    adjusted: ['team-aqua-spawns', 'cabin-seat-clearance', 'jetbridge-lighting', 'concourse-cover', 'open-aircraft-walkways'],
    qualityReplaced: ['fuselage-roof', 'aircraft-nose', 'wing-boxes', 'engine-boxes', 'cargo-boxes', 'fuel-trailer-box'],
    generatedOriginal: ['runtime-surface-patterns', 'curved-aircraft-shell', 'airport-uld-shells', 'luminous-terminal-canopy', 'stacked-wood-pallets', 'upper-kiosks'],
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
  tarmac.userData.ballisticMaterial = tarmacSurface.material;

  const addPalletStack = (id: string, x: number, z: number, alongX: boolean): void => {
    for (let level = 0; level < 4; level += 1) {
      const baseY = 0.13 + level * 0.32;
      for (const offset of [-2.08, -1.04, 0, 1.04, 2.08]) {
        box(
          builder,
          `skyline-wood-pallet-${id}-deck-${level}-${offset}`,
          alongX ? [x + offset, baseY + 0.09, z] : [x, baseY + 0.09, z + offset],
          alongX ? [0.72, 0.18, 2.6] : [2.6, 0.18, 0.72],
          palletMat,
        );
      }
      for (const offset of [-1.02, 0, 1.02]) {
        box(
          builder,
          `skyline-wood-pallet-${id}-runner-${level}-${offset}`,
          alongX ? [x, baseY - 0.05, z + offset] : [x + offset, baseY - 0.05, z],
          alongX ? [5.2, 0.14, 0.24] : [0.24, 0.14, 5.2],
          palletMat,
        );
      }
    }
  };
  addPalletStack('west', -25, 9, true);
  addPalletStack('east', 24, 22, false);

  // HF-346: polygonOffset tiering for co-planar / near-coplanar decals on the exterior apron.
  // Preserves low profile without requiring 18mm vertical separation between overlapping markings.
  const apronSeamXMat = stainMat.clone();
  apronSeamXMat.name = 'skyline-apron-seam-x-material';
  apronSeamXMat.polygonOffset = true;
  apronSeamXMat.polygonOffsetFactor = -1;
  apronSeamXMat.polygonOffsetUnits = -1;

  const apronEngineStainMat = stainMat.clone();
  apronEngineStainMat.name = 'skyline-engine-stain-material';
  apronEngineStainMat.polygonOffset = true;
  apronEngineStainMat.polygonOffsetFactor = -1.5;
  apronEngineStainMat.polygonOffsetUnits = -1.5;

  const apronSeamZMat = stainMat.clone();
  apronSeamZMat.name = 'skyline-apron-seam-z-material';
  apronSeamZMat.polygonOffset = true;
  apronSeamZMat.polygonOffsetFactor = -2;
  apronSeamZMat.polygonOffsetUnits = -2;

  const apronLeadInDarkMat = floorBorderMat.clone();
  apronLeadInDarkMat.name = 'skyline-apron-lead-in-dark-material';
  apronLeadInDarkMat.polygonOffset = true;
  apronLeadInDarkMat.polygonOffsetFactor = -2.5;
  apronLeadInDarkMat.polygonOffsetUnits = -2.5;

  const tarmacStripeMat = hazardMat.clone();
  tarmacStripeMat.name = 'skyline-tarmac-stripe-material';
  tarmacStripeMat.polygonOffset = true;
  tarmacStripeMat.polygonOffsetFactor = -3;
  tarmacStripeMat.polygonOffsetUnits = -3;

  const apronLeadInAmberMat = hazardMat.clone();
  apronLeadInAmberMat.name = 'skyline-apron-lead-in-amber-material';
  apronLeadInAmberMat.polygonOffset = true;
  apronLeadInAmberMat.polygonOffsetFactor = -3.5;
  apronLeadInAmberMat.polygonOffsetUnits = -3.5;

  const aircraftStandNSMat = hazardMat.clone();
  aircraftStandNSMat.name = 'skyline-aircraft-stand-ns-material';
  aircraftStandNSMat.polygonOffset = true;
  aircraftStandNSMat.polygonOffsetFactor = -4;
  aircraftStandNSMat.polygonOffsetUnits = -4;

  const apronGuidanceCyanMat = practicalMat.clone();
  apronGuidanceCyanMat.name = 'skyline-apron-guidance-cyan-material';
  apronGuidanceCyanMat.polygonOffset = true;
  apronGuidanceCyanMat.polygonOffsetFactor = -4.5;
  apronGuidanceCyanMat.polygonOffsetUnits = -4.5;

  const apronGuidanceMagentaMat = magentaPracticalMat.clone();
  apronGuidanceMagentaMat.name = 'skyline-apron-guidance-magenta-material';
  apronGuidanceMagentaMat.polygonOffset = true;
  apronGuidanceMagentaMat.polygonOffsetFactor = -4.5;
  apronGuidanceMagentaMat.polygonOffsetUnits = -4.5;

  const aircraftStandEWMat = hazardMat.clone();
  aircraftStandEWMat.name = 'skyline-aircraft-stand-ew-material';
  aircraftStandEWMat.polygonOffset = true;
  aircraftStandEWMat.polygonOffsetFactor = -5;
  aircraftStandEWMat.polygonOffsetUnits = -5;

  const apronChevronMat = practicalMat.clone();
  apronChevronMat.name = 'skyline-apron-chevron-material';
  apronChevronMat.polygonOffset = true;
  apronChevronMat.polygonOffsetFactor = -5.5;
  apronChevronMat.polygonOffsetUnits = -5.5;

  const apronChevronMagentaMat = magentaPracticalMat.clone();
  apronChevronMagentaMat.name = 'skyline-apron-chevron-magenta-material';
  apronChevronMagentaMat.polygonOffset = true;
  apronChevronMagentaMat.polygonOffsetFactor = -5.5;
  apronChevronMagentaMat.polygonOffsetUnits = -5.5;

  // HF-346: polygonOffset tiering for concourse floor decals and joints.
  const floorJointXMat = floorBorderMat.clone();
  floorJointXMat.name = 'skyline-floor-joint-x-material';
  floorJointXMat.polygonOffset = true;
  floorJointXMat.polygonOffsetFactor = -1;
  floorJointXMat.polygonOffsetUnits = -1;

  const floorJointZMat = floorBorderMat.clone();
  floorJointZMat.name = 'skyline-floor-joint-z-material';
  // HF-346 direction rule: joint-z sits ABOVE skyline-floor-dark-runner (topY 0.093 vs
  // 0.0855 after the Pass 75 lift; 0.086 vs 0.0855 before it), so it must carry the MORE
  // NEGATIVE effective bias to win the WebGPU depth test. -2/-2 lost to the runner's
  // -2.5/-2.5 despite being higher, which is what reported the inverted pairs. Keep -3/-3:
  // the Pass 75 lift widens the gap past the 4mm threshold but does not replace the tier.
  floorJointZMat.polygonOffset = true;
  floorJointZMat.polygonOffsetFactor = -3;
  floorJointZMat.polygonOffsetUnits = -3;

  const floorDarkRunnerMat = floorInsetMat.clone();
  floorDarkRunnerMat.name = 'skyline-floor-dark-runner-material';
  floorDarkRunnerMat.polygonOffset = true;
  floorDarkRunnerMat.polygonOffsetFactor = -2.5;
  floorDarkRunnerMat.polygonOffsetUnits = -2.5;

  const floorBorderDecalMat = floorBorderMat.clone();
  floorBorderDecalMat.name = 'skyline-floor-border-decal-material';
  floorBorderDecalMat.polygonOffset = true;
  floorBorderDecalMat.polygonOffsetFactor = -3;
  floorBorderDecalMat.polygonOffsetUnits = -3;

  const floorCyanRunnerMat = practicalMat.clone();
  floorCyanRunnerMat.name = 'skyline-floor-cyan-runner-material';
  floorCyanRunnerMat.polygonOffset = true;
  floorCyanRunnerMat.polygonOffsetFactor = -4;
  floorCyanRunnerMat.polygonOffsetUnits = -4;

  const floorMagentaCrossingMat = magentaPracticalMat.clone();
  floorMagentaCrossingMat.name = 'skyline-floor-magenta-crossing-material';
  floorMagentaCrossingMat.polygonOffset = true;
  floorMagentaCrossingMat.polygonOffsetFactor = -5;
  floorMagentaCrossingMat.polygonOffsetUnits = -5;

  // HF-346: polygonOffset tiering for mezzanine underside coffers and underlights.
  const mezzanineCofferMat = ivoryPanelMat.clone();
  mezzanineCofferMat.name = 'skyline-mezzanine-coffer-material';
  mezzanineCofferMat.polygonOffset = true;
  mezzanineCofferMat.polygonOffsetFactor = -1;
  mezzanineCofferMat.polygonOffsetUnits = -1;

  const mezzanineUnderlightMat = practicalMat.clone();
  mezzanineUnderlightMat.name = 'skyline-mezzanine-underlight-material';
  mezzanineUnderlightMat.polygonOffset = true;
  mezzanineUnderlightMat.polygonOffsetFactor = -2;
  mezzanineUnderlightMat.polygonOffsetUnits = -2;

  const mezzanineUnderlightMagentaMat = magentaPracticalMat.clone();
  mezzanineUnderlightMagentaMat.name = 'skyline-mezzanine-underlight-magenta-material';
  mezzanineUnderlightMagentaMat.polygonOffset = true;
  mezzanineUnderlightMagentaMat.polygonOffsetFactor = -2;
  mezzanineUnderlightMagentaMat.polygonOffsetUnits = -2;

  for (let z = -10; z <= 30; z += 10) {
    box(builder, 'skyline-tarmac-stripe', [0, 0.027, z], [1.2, 0.03, 4.0], tarmacStripeMat, { solid: false, shots: false });
  }

  // A repeated apron grid and stand envelope give the large exterior plane
  // authored scale while remaining one static batch per shared material.
  for (let seamX = -28; seamX <= 28; seamX += 7) {
    detailBox('apron-marking', `skyline-apron-seam-x-${seamX}`, [seamX, 0.023, 8], [0.035, 0.018, 54], apronSeamXMat);
  }
  for (let seamZ = -16; seamZ <= 32; seamZ += 8) {
    detailBox('apron-marking', `skyline-apron-seam-z-${seamZ}`, [0, 0.028, seamZ], [68, 0.018, 0.035], apronSeamZMat);
  }
  for (const [name, x, z, width, depth] of [
    ['north', 0, -0.15, 43, 0.16],
    ['south', 0, 4.15, 43, 0.16],
    ['west', -21.4, 2, 0.16, 4.45],
    ['east', 21.4, 2, 0.16, 4.45],
  ] as const) {
    // Pass 75 raises the E/W stands out of the N/S stands' depth range; Pass 74's
    // per-axis polygonOffset tiers keep the pair resolved even where they still touch.
    const markingY = (name === 'west' || name === 'east') ? 0.041 : 0.036;
    const standMat = (name === 'north' || name === 'south') ? aircraftStandNSMat : aircraftStandEWMat;
    detailBox('apron-marking', `skyline-aircraft-stand-${name}`, [x, markingY, z], [width, 0.025, depth], standMat);
  }
  detailBox('apron-marking', 'skyline-apron-lead-in-dark', [0, 0.034, 20], [0.35, 0.025, 28], apronLeadInDarkMat);
  detailBox('apron-marking', 'skyline-apron-lead-in-amber', [0, 0.049, 20], [0.12, 0.02, 28], apronLeadInAmberMat);
  detailBox('apron-marking', 'skyline-apron-cyan-guidance-west', [-6.5, 0.051, 11], [0.11, 0.024, 46], apronGuidanceCyanMat);
  detailBox('apron-marking', 'skyline-apron-magenta-guidance-east', [6.5, 0.051, 11], [0.11, 0.024, 46], apronGuidanceMagentaMat);
  for (const z of [-8, 2, 12, 22, 32]) {
    detailBox('apron-marking', `skyline-apron-gate-chevron-${z}`, [0, 0.054, z], [8.6, 0.022, 0.12], z === 12 ? apronChevronMagentaMat : apronChevronMat);
  }
  for (const [z, rotationY] of [[12, 0.08], [-8, -0.08]] as const) {
    detailBox('apron-marking', `skyline-engine-stain-${z}`, [0, 0.041, z], [3.4, 0.022, 5.2], apronEngineStainMat, 'performance', [0, rotationY, 0]);
  }

  box(builder, 'skyline-concourse-floor', [0, 0.02, -23], [60, 0.08, 22], floorMat, { solid: false });
  detailBox('floor-language', 'skyline-floor-dark-runner', [0, 0.073, -22.5], [5.2, 0.025, 20.5], floorDarkRunnerMat);
  // A real roof and luminous ceiling make the terminal read as an interior,
  // not an outdoor grey blockout. It is above every route but remains
  // collision and shot authoritative for debug/fly-camera probes.
  // HF-346 (depth pass): the ceiling slab used to end at z = -34.3, the back
  // wall's outer plane, putting a 0.07 m x 62 m same-facing band on that plane
  // - a hairline flicker running the full width of the rear elevation. It now
  // terminates BURIED inside the back wall (z = -34.1), so its rear face is
  // enclosed by solid geometry instead of sharing a visible plane, and no gap
  // opens at the ceiling/wall junction.
  box(builder, 'skyline-terminal-silver-ceiling', [0, 7.05, -22.9], [62, 0.24, 22.4], ivoryPanelMat);
  for (const z of [-31.5, -28.5, -25.5, -22.5, -19.5, -16.5, -13.5]) {
    detailBox('wall-structure', `skyline-ceiling-white-baffle-${z}`, [0, 6.86, z], [60.2, 0.13, 0.72], ivoryPanelMat, 'performance', undefined, true);
    detailBox('terminal-story', `skyline-ceiling-cyan-spine-${z}`, [0, 6.76, z], [38, 0.055, 0.12], practicalMat);
  }
  // The long runner is repeated in inset cyan and magenta so it is legible
  // from either spawn and through the glass facade.
  detailBox('floor-language', 'skyline-floor-cyan-runner-west', [-2.3, 0.091, -22.5], [0.16, 0.022, 20.2], floorCyanRunnerMat);
  detailBox('floor-language', 'skyline-floor-cyan-runner-east', [2.3, 0.091, -22.5], [0.16, 0.022, 20.2], floorCyanRunnerMat);
  detailBox('floor-language', 'skyline-floor-magenta-crossing', [0, 0.095, -20.4], [24, 0.024, 0.16], floorMagentaCrossingMat);
  detailBox('floor-language', 'skyline-floor-window-border', [0, 0.080, -12.55], [59.2, 0.028, 0.52], floorBorderDecalMat);
  detailBox('floor-language', 'skyline-floor-backwall-border', [0, 0.074, -33.4], [59.2, 0.028, 0.52], floorBorderDecalMat);
  for (let tileX = -27; tileX <= 27; tileX += 6) {
    detailBox('floor-language', `skyline-floor-joint-x-${tileX}`, [tileX, 0.076, -23], [0.025, 0.018, 20.2], floorJointXMat);
  }
  for (let tileZ = -31; tileZ <= -15; tileZ += 4) {
    detailBox('floor-language', `skyline-floor-joint-z-${tileZ}`, [0, 0.084, tileZ], [58.5, 0.018, 0.025], floorJointZMat);
  }
  // Split the mezzanine around both escalators. A monolithic slab creates a
  // low underside above each ramp and physically stops the character halfway.
  addWalkablePlatform('mezzanine-back', 'skyline-concourse-mezzanine', [0, 3.2, -31.25], [52, 0.28, 5.5], floorMat);
  addWalkablePlatform('mezzanine-front-center', 'skyline-mezzanine-front-center', [0, 3.2, -25.25], [36.4, 0.28, 6.5], floorMat);
  addWalkablePlatform('mezzanine-front-west', 'skyline-mezzanine-front-west', [-23.8, 3.2, -25.25], [4.4, 0.28, 6.5], floorMat);
  addWalkablePlatform('mezzanine-front-east', 'skyline-mezzanine-front-east', [23.8, 3.2, -25.25], [4.4, 0.28, 6.5], floorMat);
  // A pale coffered underside keeps the deployment end readable without
  // changing the collision-authoritative mezzanine slabs above it.
  detailBox('wall-structure', 'skyline-mezzanine-soffit-back', [0, 3.035, -31.25], [51.4, 0.035, 4.95], soffitMat);
  detailBox('wall-structure', 'skyline-mezzanine-soffit-center', [0, 3.035, -25.25], [35.9, 0.035, 5.95], soffitMat);
  detailBox('wall-structure', 'skyline-mezzanine-soffit-west', [-23.8, 3.035, -25.25], [4.0, 0.035, 5.95], soffitMat);
  detailBox('wall-structure', 'skyline-mezzanine-soffit-east', [23.8, 3.035, -25.25], [4.0, 0.035, 5.95], soffitMat);
  // Overlay the formerly monolithic grey underside with a coffered silver
  // ceiling. These shallow panels do not alter the mezzanine collider.
  for (const x of [-21, -14, -7, 0, 7, 14, 21]) {
    detailBox('wall-structure', `skyline-mezzanine-coffer-${x}`, [x, 3.002, -30.3], [5.65, 0.025, 3.9], mezzanineCofferMat);
    detailBox('terminal-story', `skyline-mezzanine-coffer-light-${x}`, [x, 2.982, -30.25], [3.8, 0.022, 0.13], x === 0 ? mezzanineUnderlightMagentaMat : mezzanineUnderlightMat);
  }
  for (const x of [-16, -8, 0, 8, 16]) {
    detailBox('wall-structure', `skyline-mezzanine-front-coffer-${x}`, [x, 3.001, -25.3], [6.5, 0.024, 4.9], mezzanineCofferMat);
    detailBox('terminal-story', `skyline-mezzanine-front-coffer-light-${x}`, [x, 2.981, -25.2], [4.6, 0.022, 0.13], x === 0 ? mezzanineUnderlightMagentaMat : mezzanineUnderlightMat);
  }
  for (const lightX of [-18, -10, 0, 10, 18]) {
    detailBox('terminal-story', `skyline-mezzanine-underlight-${lightX}`, [lightX, 3.007, -29.8], [5.4, 0.025, 0.11], mezzanineUnderlightMat);
    detailBox('terminal-story', `skyline-mezzanine-underlight-front-${lightX}`, [lightX, 3.007, -24.3], [5.4, 0.025, 0.11], mezzanineUnderlightMat);
  }
  detailBox('floor-language', 'skyline-mezzanine-front-edge', [0, 3.36, -22.12], [52, 0.12, 0.34], floorBorderMat);
  for (const x of [-23.5, -16, -8, 0, 8, 16, 23.5]) {
    detailBox('floor-language', `skyline-mezzanine-inlay-${x}`, [x, 3.355, -27.1], [0.035, 0.025, 12.8], floorBorderMat);
  }
  // Split the front rail around the central gate connector so the route does
  // not visually pass through a barrier.
  box(builder, 'skyline-mezzanine-rail', [-14, 4.2, -22.1], [24, 1.1, 0.15], trimMat, { solid: false, detail: 'performance' });
  box(builder, 'skyline-mezzanine-rail', [14, 4.2, -22.1], [24, 1.1, 0.15], trimMat, { solid: false, detail: 'performance' });
  addWalkablePlatform('gate-connector', 'skyline-gate-connector-floor', [0, 3.2, -17], [3.6, 0.24, 10], soffitMat);
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

  const mainSign = box(builder, 'skyline-terminal-main-sign', [0, 6.2, -33.8], [14.0, 1.2, 0.2], terminalWayfindingMaterial('TERMINAL', 'GATES 01—12  •  CONCOURSE A', '#d69a2d'), { solid: false, shots: false, detail: 'performance' });
  mainSign.userData.label = 'TERMINAL - GATES 1-12';
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

  // HF-346 (depth pass): the side walls used to run all the way to z = -34.3,
  // the SAME plane as the back wall's outer face, so at each rear corner a
  // 0.10 m x 7.0 m strip had two same-facing surfaces on one plane - a
  // full-height flickering seam, and the largest z-fight left in this arena.
  // The side walls now stop at the back wall's INNER face (z = -33.9) and the
  // back wall widens by the side-wall thickness so it still seals the corner
  // in collision. Nothing is removed from the playable envelope: the interior
  // faces (x = -+30.9, z = -33.9) are exactly where they were.
  box(builder, 'skyline-terminal-backwall', [0, 3.5, -34.1], [62.6, 7.0, 0.4], wallMat);
  box(builder, 'skyline-terminal-leftwall', [-31.1, 3.5, -22.8], [0.4, 7.0, 22.2], wallMat);
  box(builder, 'skyline-terminal-rightwall', [31.1, 3.5, -22.8], [0.4, 7.0, 22.2], wallMat);
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

  for (const x of [-12, 12]) {
    box(builder, `skyline-upper-kiosk-${x}`, [x, 3.92, -31], [4.4, 1.16, 2.2], kioskMat);
    detailBox('terminal-story', `skyline-upper-kiosk-countertop-${x}`, [x, 4.54, -31], [4.65, 0.12, 2.4], structureMat);
    detailBox('terminal-story', `skyline-upper-kiosk-sign-${x}`, [x, 5.22, -31.92], [3.7, 0.62, 0.1], x < 0 ? practicalMat : magentaPracticalMat);
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
    { id: 'cockpit-entry', state: 'open', mechanicalAuthority: 'open-cabin-shell-gap', clearWidth: 2.8 },
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
    detailBox('terminal-story', `skyline-flight-screen-${x}`, [x, 3.25, -20], [3.6, 1.5, 0.18], flightScreenMat, 'performance');
    const gate = x < -20 ? '01—03' : x < 0 ? '04—06' : x < 20 ? '07—09' : '10—12';
    const accent = x < 0 ? '#4ce5ec' : '#ee62bd';
    for (const faceZ of [-20.105, -19.895]) {
      const face = detailBox(
        'terminal-story',
        `skyline-flight-screen-face-${x}-${faceZ}`,
        [x, 3.25, faceZ],
        [3.34, 1.24, 0.025],
        terminalWayfindingMaterial('FLIGHT INFO', `GATES ${gate}  •  ON TIME`, accent),
        'performance',
      );
      face.userData.label = `FLIGHT INFO - GATES ${gate}`;
    }
    detailBox('terminal-story', `skyline-flight-screen-frame-top-${x}`, [x, 3.96, -20], [3.85, 0.12, 0.28], structureMat, 'performance');
    detailBox('terminal-story', `skyline-flight-screen-frame-bottom-${x}`, [x, 2.54, -20], [3.85, 0.12, 0.28], structureMat, 'performance');
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

  // The former single bellows box occupied the complete gate aperture in
  // Quality Graphics. It was presentation-only, so the result looked like a
  // black wall that the player could walk through. Keep the accordion collar
  // around the opening rather than across it.
  for (const sideX of [-1.93, 1.93]) {
    detailBox('boarding-route', `skyline-jetbridge-bellows-side-${sideX}`, [sideX, 4.3, -11.8], [0.24, 2.6, 0.5], jetbridgeMat, 'quality');
    for (const ribY of [3.35, 3.85, 4.35, 4.85]) {
      detailBox('boarding-route', `skyline-jetbridge-bellows-rib-${sideX}-${ribY}`, [sideX - Math.sign(sideX) * 0.08, ribY, -11.51], [0.12, 0.11, 0.08], structureMat, 'quality');
    }
  }
  detailBox('boarding-route', 'skyline-jetbridge-bellows-header', [0, 5.42, -11.8], [4.1, 0.36, 0.5], jetbridgeMat, 'quality');

  addWalkablePlatform('jetbridge', 'skyline-jetbridge-floor', [0, 3.2, -7], [3.6, 0.24, 10], jetbridgeMat);
  box(builder, 'skyline-jetbridge-wall-left', [-1.75, 4.4, -6], [0.15, 2.2, 12], wallMat);
  box(builder, 'skyline-jetbridge-wall-right', [1.75, 4.4, -6], [0.15, 2.2, 12], wallMat);
  box(builder, 'skyline-jetbridge-roof', [0, 5.5, -6], [3.6, 0.15, 12], jetbridgeMat, { solid: false, shots: false });
  for (const sideX of [-1.66, 1.66]) {
    detailBox('boarding-route', `skyline-jetbridge-inner-panel-${sideX}`, [sideX, 3.8, -6], [0.035, 0.7, 11.4], soffitMat);
    detailBox('boarding-route', `skyline-jetbridge-window-band-${sideX}`, [sideX, 4.68, -6], [0.028, 0.72, 10.8], cockpitGlassMat, 'quality');
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

  // The bridge meets the split fuselage wall directly. No decorative door
  // leaf, frame, header, threshold or sign may make this route read as an
  // opaque portal.

  qualityPlaceholderBox(
    'skyline-jetliner-fuselage-top',
    [0, 5.8, 2.0],
    [36.0, 1.2, 4.2],
    planeHullMat,
    'jetliner-fuselage-roof',
  );
  addWalkablePlatform('jetliner-cabin', 'skyline-jetliner-cabin-floor', [0, 2.4, 2.0], [35.0, 0.3, 3.8], floorMat);
  // Split the north fuselage wall around the jetbridge doorway. A single solid
  // wall made the authored bridge-to-cabin route stop outside the aircraft.
  box(builder, 'skyline-jetliner-side-north', [-9.65, 3.75, 0.2], [15.7, 2.4, 0.2], planeHullMat);
  box(builder, 'skyline-jetliner-side-north', [9.65, 3.75, 0.2], [15.7, 2.4, 0.2], planeHullMat);
  box(builder, 'skyline-jetliner-side-south', [0, 3.75, 3.8], [35.0, 2.4, 0.2], planeHullMat);
  // Give the cockpit a real interior rather than a non-colliding Quality
  // sphere backed by a different invisible box. The cabin floor and side
  // authority now continue to a glass-fronted cockpit, while the rear aperture
  // remains open in both profiles.
  addWalkablePlatform('jetliner-cockpit', 'skyline-cockpit-floor', [-18.75, 2.4, 2.0], [2.5, 0.3, 3.8], floorMat);
  box(builder, 'skyline-cockpit-lower-side-north', [-18.75, 3.3, 0.2], [2.5, 1.5, 0.2], planeHullMat);
  box(builder, 'skyline-cockpit-lower-side-south', [-18.75, 3.3, 3.8], [2.5, 1.5, 0.2], planeHullMat);
  box(builder, 'skyline-cockpit-glass-north', [-18.75, 4.42, 0.2], [2.5, 0.74, 0.2], cockpitGlassMat, { ballisticMaterial: 'glass' });
  box(builder, 'skyline-cockpit-glass-south', [-18.75, 4.42, 3.8], [2.5, 0.74, 0.2], cockpitGlassMat, { ballisticMaterial: 'glass' });
  box(builder, 'skyline-cockpit-roof', [-18.75, 5.18, 2.0], [2.5, 0.3, 3.8], planeHullMat);
  box(builder, 'skyline-cockpit-front-lower', [-20.08, 3.25, 2.0], [0.2, 1.7, 3.8], planeHullMat);
  box(builder, 'skyline-cockpit-glass-front', [-20.08, 4.52, 2.0], [0.2, 0.84, 3.8], cockpitGlassMat, { ballisticMaterial: 'glass' });
  const fuselageShellSpecs = [
    { name: 'skyline-quality-fuselage-shell-forward', x: -9.35, length: 14.9 },
    { name: 'skyline-quality-fuselage-shell-aft', x: 9.7, length: 15.6 },
  ] as const;
  const fuselageShells = fuselageShellSpecs.map(({ name, x, length }) => detailMesh(
    'quality-aircraft',
    name,
    new THREE.CylinderGeometry(2.1, 2.1, length, 28, 1, true, 0, Math.PI),
    planeHullMat,
    [x, 4.3, 2],
    [0, 0, Math.PI / 2],
  ));
  for (const shell of fuselageShells) {
    shell.userData.assetOwner = 'skyline-terminal';
    shell.userData.rustworksDetail = 'core';
    shell.userData.skylineCollisionAuthorityId = 'jetliner-fuselage-roof';
  }
  // The exterior half-cylinder is intentionally FrontSide. From the cabin its
  // backfaces disappear, which made the aircraft roof look absent in Quality.
  // A slightly inset, separately split BackSide shell restores the interior
  // ceiling without a blanket DoubleSide material or an opaque bridge door.
  const cabinCeilingMaterial = planeHullMat.clone();
  cabinCeilingMaterial.name = 'skyline-aircraft-interior-ceiling-material';
  cabinCeilingMaterial.side = THREE.BackSide;
  const cabinCeilingShells = fuselageShellSpecs.map(({ name, x, length }) => detailMesh(
    'quality-aircraft',
    name.replace('fuselage-shell', 'cabin-ceiling-shell'),
    new THREE.CylinderGeometry(2.02, 2.02, length, 28, 1, true, 0, Math.PI),
    cabinCeilingMaterial,
    [x, 4.3, 2],
    [0, 0, Math.PI / 2],
  ));
  for (const shell of cabinCeilingShells) {
    shell.userData.assetOwner = 'skyline-terminal';
    shell.userData.rustworksDetail = 'core';
    shell.userData.interiorFaceOrientation = 'back-side';
    shell.userData.boardingAperturePreserved = true;
    shell.userData.skylineCollisionAuthorityId = 'jetliner-fuselage-roof';
  }
  detailBox('quality-aircraft', 'skyline-quality-fuselage-door-crown', [0, 6.08, 2], [3.8, 0.58, 4.15], planeHullMat, 'quality');
  const qualityNose = detailMesh(
    'quality-aircraft',
    'skyline-quality-aircraft-nose',
    // Front hemisphere only: the open rear plane faces the cabin/cockpit
    // aperture instead of drawing an opaque shell across it.
    new THREE.SphereGeometry(1, 28, 16, -Math.PI / 2, Math.PI),
    planeHullMat,
    [-18.2, 4.3, 2],
  );
  qualityNose.scale.set(2.45, 2.1, 2.1);
  qualityNose.userData.assetOwner = 'skyline-terminal';
  qualityNose.userData.rustworksDetail = 'core';
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
  for (const [segment, x] of [['forward', -9.65], ['aft', 9.65]] as const) {
    detailBox('aircraft-skin', `skyline-aircraft-belly-north-${segment}`, [x, 3.12, 0.06], [15.7, 0.58, 0.08], planeStripeMat);
    detailBox('aircraft-skin', `skyline-aircraft-livery-cyan-north-${segment}`, [x, 3.7, 0.045], [15.7, 0.18, 0.06], practicalMat);
  }
  detailBox('aircraft-skin', 'skyline-aircraft-belly-south', [0, 3.12, 3.94], [34.2, 0.58, 0.08], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-aircraft-livery-cyan-south', [0, 3.7, 3.955], [32.8, 0.18, 0.06], practicalMat);
  detailBox('aircraft-skin', 'skyline-aircraft-livery-magenta-north', [9.8, 3.98, 0.038], [12.5, 0.1, 0.05], magentaPracticalMat);
  detailBox('aircraft-skin', 'skyline-aircraft-livery-magenta-south', [9.8, 3.98, 3.962], [12.5, 0.1, 0.05], magentaPracticalMat);
  detailBox('aircraft-skin', 'skyline-aircraft-roof-spine', [0, 6.43, 2], [33.8, 0.12, 0.54], planeStripeMat, 'quality');
  for (const windowX of [-13.5, -10.5, -7.5, -4.5, 4.5, 7.5, 10.5, 13.5]) {
    detailBox('aircraft-skin', `skyline-cabin-window-north-${windowX}`, [windowX, 4.28, 0.055], [1.28, 0.5, 0.08], cockpitGlassMat);
    detailBox('aircraft-skin', `skyline-cabin-window-south-${windowX}`, [windowX, 4.28, 3.945], [1.28, 0.5, 0.08], cockpitGlassMat);
    detailBox('aircraft-skin', `skyline-cabin-window-cap-north-${windowX}`, [windowX, 4.58, 0.04], [1.42, 0.055, 0.1], planeStripeMat);
    detailBox('aircraft-skin', `skyline-cabin-window-cap-south-${windowX}`, [windowX, 4.58, 3.96], [1.42, 0.055, 0.1], planeStripeMat);
  }
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
    cockpitVisibleApertureMetres: 2.8,
    cockpitAccessibleDepthMetres: 2.5,
    opaqueDoorPanels: 0,
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
    detailBox('aircraft-skin', `skyline-cabin-window-inner-north-${windowX}`, [windowX, 4.05, 0.415], [1.26, 0.48, 0.055], cockpitGlassMat);
    detailBox('aircraft-skin', `skyline-cabin-window-inner-south-${windowX}`, [windowX, 4.05, 3.585], [1.26, 0.48, 0.055], cockpitGlassMat);
  }
  for (const ribX of [-14, -11, -8, -5, -2, 1, 4, 7, 10, 13, 16]) {
    detailBox('wall-structure', `skyline-cabin-ceiling-rib-${ribX}`, [ribX, 5.42, 2], [0.11, 0.08, 3.15], structureMat);
  }
  detailBox('terminal-story', 'skyline-cabin-exit-sign', [15.9, 4.95, 2], [0.1, 0.32, 1.25], practicalMat);

  // The retained Quality wings are tapered prisms. Their former single box
  // colliders stopped short of the visible tips and leading edges, so players
  // could stand on rendered wing surface with no Rapier support. Eight narrow
  // authority sections per side conservatively cover the prism with at most a
  // 0.238 m edge overhang (below the 0.38 m player radius).
  const wingSliceCount = 8;
  const wingAuthorityMaximumOverhang = 1.9 / wingSliceCount;
  const addWingAuthority = (
    side: 'port' | 'starboard',
    rootZ: number,
    tipDeltaZ: number,
    qualityPresentationName: string,
  ): void => {
    for (let index = 0; index < wingSliceCount; index += 1) {
      const start = index / wingSliceCount;
      const end = (index + 1) / wingSliceCount;
      const startZ = rootZ + tipDeltaZ * start;
      const endZ = rootZ + tipDeltaZ * end;
      // The rootward width contains the complete tapered prism throughout this
      // slice; the bounded excess shrinks with every section.
      const minX = -3.2 + 1.9 * start;
      const maxX = 2.7 - 0.9 * start;
      addWalkablePlatform(
        `jetliner-wing-${side}-${index + 1}`,
        `skyline-jetliner-wing-${side}-authority-${index + 1}`,
        [(minX + maxX) / 2, 2.82, (startZ + endZ) / 2],
        [maxX - minX, 0.28, Math.abs(endZ - startZ)],
        planeWingMat,
        { qualityPlaceholder: true, qualityPresentationName },
      );
    }
  };
  addWingAuthority('port', 3.6, 16.8, 'skyline-quality-wing-port');
  addWingAuthority('starboard', 0.4, -16.8, 'skyline-quality-wing-starboard');
  /**
   * Engine nacelle seat height. Lane J, 2026-09-02 (eye-clearance triage).
   *
   * The nacelles used to sit at y = 1.6, so their 1.9 m body spanned
   * 0.65 .. 2.55 m. Two consequences, both measured:
   *  - the wing above them is authored at 2.68 .. 2.96 (visual AND authority,
   *    `addWingAuthority`), so the engines hung 0.13 m clear of the wing they
   *    are bolted to - floating geometry under the forging review;
   *  - the 0.65 m belly left a prone crawl space over a 0.61 m prone eye. The
   *    eye-clearance sweep flagged all six of skyline-terminal's red rows there
   *    (d = 0.067 m, prone, both nacelles), and stage 3 was worse than the
   *    analytic number: `resolveEyeClearance` had nowhere lateral to go, pushed
   *    the camera UP into the nacelle to its 0.34 m cap (seat y 1.66, i.e.
   *    inside the engine) and still measured 0.035 m - a metre above the
   *    player's real eye, looking through the engine's interior.
   *
   * Seating the nacelle against the wing underside fixes both at once: the top
   * lands exactly on 2.68 and the belly rises to 0.78 m, which clears the prone
   * eye by 0.17 m - past the sweep's 0.15 m probe radius (= the camera's 0.08 m
   * near plane plus bob margin), so the runtime resolve never engages here at
   * all. It is a translation only: no size, footprint or material changes, and
   * the instanced Quality visual below moves with it so authority and mesh stay
   * coincident.
   */
  const NACELLE_CENTRE_Y = 1.73;
  /**
   * Nacelle collision authority. Lane J found this transposed against its own
   * visual and PASS 87 Lane AR (item 12) landed the repair.
   *
   * The visual is `engineNacelles` below: a CylinderGeometry of length 4.1 and
   * radius 0.95, rotated +90 degrees about Z, so its axis lies along X and its
   * world extent is 4.1 x 1.9 x 1.9 (x, y, z). The authority box was authored
   * 1.9 x 1.9 x 4.1 - the same three numbers with x and z swapped, i.e. the
   * engine turned across the aircraft instead of along it. Consequences,
   * measured from the built arena: 1.10 m of solid stuck out fore and aft of a
   * pod that visibly ends there (an invisible wall), and 1.10 m of visible pod
   * on each side had no collision or shot authority at all (shooting through a
   * jet engine). Both profiles, since the pod was authored.
   *
   * Derived-not-copied is asserted in src/additional-maps.test.ts: the size pin
   * that used to hardcode 1.9/1.9/4.1 now reads the instanced visual's own
   * world bounds, so the next person to re-orient the pod cannot re-transpose
   * the collider silently.
   */
  qualityPlaceholderBox('skyline-jetliner-engine-1', [0, NACELLE_CENTRE_Y, 12.0], [4.1, 1.9, 1.9], engineMat, 'jetliner-engine-nacelles');
  qualityPlaceholderBox('skyline-jetliner-engine-2', [0, NACELLE_CENTRE_Y, -8.0], [4.1, 1.9, 1.9], engineMat, 'jetliner-engine-nacelles');
  const portWing = detailMesh(
    'quality-aircraft',
    'skyline-quality-wing-port',
    prismGeometryXZ([[-3.2, 0], [2.7, 0], [1.8, 16.8], [-1.3, 16.8]], 0.28),
    planeWingMat,
    [0, 2.82, 3.6],
  );
  portWing.userData.assetOwner = 'skyline-terminal';
  portWing.userData.rustworksDetail = 'core';
  portWing.userData.skylineCollisionAuthorityId = 'skyline-quality-wing-port';
  const starboardWing = detailMesh(
    'quality-aircraft',
    'skyline-quality-wing-starboard',
    prismGeometryXZ([[-3.2, 0], [2.7, 0], [1.8, -16.8], [-1.3, -16.8]], 0.28),
    planeWingMat,
    [0, 2.82, 0.4],
  );
  starboardWing.userData.assetOwner = 'skyline-terminal';
  starboardWing.userData.rustworksDetail = 'core';
  starboardWing.userData.skylineCollisionAuthorityId = 'skyline-quality-wing-starboard';
  detailBox('aircraft-skin', 'skyline-wingtip-port', [0, 2.99, 18.42], [5.1, 0.08, 0.14], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-wingtip-starboard', [0, 2.99, -14.42], [5.1, 0.08, 0.14], planeStripeMat);
  detailBox('aircraft-skin', 'skyline-wing-navigation-port', [-2.35, 3.06, 18.48], [0.42, 0.16, 0.16], practicalMat);
  detailBox('aircraft-skin', 'skyline-wing-navigation-starboard', [-2.35, 3.06, -14.48], [0.42, 0.16, 0.16], practicalMat);
  const engineNacelles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.95, 0.78, 4.1, 20), planeStripeMat, 2);
  engineNacelles.name = 'skyline-aircraft-engine-nacelles';
  engineNacelles.castShadow = true;
  engineNacelles.receiveShadow = true;
  engineNacelles.userData.presentationOnly = true;
  engineNacelles.userData.rustworksDetail = 'core';
  engineNacelles.userData.skylineCluster = 'aircraft-skin';
  engineNacelles.userData.skylineCollisionAuthorityId = 'jetliner-engine-nacelles';
  const nacelleMatrix = new THREE.Matrix4();
  const nacelleRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  for (const [index, z] of [12, -8].entries()) {
    // Same seat height as the collision authority above - see NACELLE_CENTRE_Y.
    nacelleMatrix.compose(new THREE.Vector3(0, NACELLE_CENTRE_Y, z), nacelleRotation, new THREE.Vector3(1, 1, 1));
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

  qualityPlaceholderBox('skyline-fuel-trailer', [-10, 1.5, 18], [5.2, 2.2, 2.2], hazardMat, 'fuel-trailer');
  const fuelTank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5.2, 14), cargoMat);
  fuelTank.name = 'skyline-fuel-trailer-tank';
  fuelTank.rotation.z = Math.PI / 2;
  fuelTank.position.set(-10, 1.5, 18);
  fuelTank.castShadow = true;
  fuelTank.receiveShadow = true;
  fuelTank.userData.presentationOnly = true;
  fuelTank.userData.impactSurface = 'metal';
  fuelTank.userData.rustworksDetail = 'core';
  fuelTank.userData.skylineCluster = 'service-equipment';
  fuelTank.userData.assetOwner = 'skyline-terminal';
  fuelTank.userData.skylineCollisionAuthorityId = 'fuel-trailer';
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
    const cargoAuthorityId = `tarmac-cargo-${x}-${z}`;
    qualityPlaceholderBox(`skyline-tarmac-cargo-${x}-${z}-lower`, [x, 0.975, z], [4.5, 1.95, 2.6], col, cargoAuthorityId);
    qualityPlaceholderBox(`skyline-tarmac-cargo-${x}-${z}-upper`, [x + 0.15, 2.275, z], [3.74, 0.65, 2.6], col, cargoAuthorityId);
    const shell = detailMesh(
      'service-equipment',
      `skyline-quality-uld-${x}-${z}`,
      new THREE.ExtrudeGeometry(uldShape, { depth: 2.6, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }),
      col,
      [x, 0, z - 1.3],
    );
    shell.userData.assetOwner = 'skyline-terminal';
    shell.userData.rustworksDetail = 'core';
    shell.userData.skylineCollisionAuthorityId = cargoAuthorityId;
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

  // HF-346 (depth pass): all four perimeter fences ran the full 72 m, so every
  // corner stacked two same-facing 0.40 m x 3.0 m faces on one plane - eight
  // coplanar pairs ringing the map. The east/west runs now butt BETWEEN the
  // north/south runs instead of crossing them. Containment is unchanged: the
  // corner cells stay filled by the north/south colliders, which still span
  // the full x range, and the inner faces stay at -+35.6.
  box(builder, 'skyline-fence-north', [0, 1.5, -35.8], [72, 3.0, 0.4], jetbridgeMat);
  box(builder, 'skyline-fence-south', [0, 1.5, 35.8], [72, 3.0, 0.4], jetbridgeMat);
  box(builder, 'skyline-fence-west', [-35.8, 1.5, 0], [0.4, 3.0, 71.2], jetbridgeMat);
  box(builder, 'skyline-fence-east', [35.8, 1.5, 0], [0.4, 3.0, 71.2], jetbridgeMat);

  const physicalCover: ArenaMap['physicalCover'] = [
    // Lane AR item 12: these two follow the repaired nacelle authority above
    // (4.1 along x, 1.9 across z, plus the same 0.2 m cover margin the other
    // rows carry). The south row was the transposed footprint; the north
    // engine at z = -8 had no physicalCover row at all, so half the aircraft's
    // hard cover was missing from bot cover selection and the minimap.
    { id: 'jetliner-engine-south', bounds: { minX: -2.25, maxX: 2.25, minZ: 10.85, maxZ: 13.15 }, blocksMovement: true, blocksShots: true },
    { id: 'jetliner-engine-north', bounds: { minX: -2.25, maxX: 2.25, minZ: -9.15, maxZ: -6.85 }, blocksMovement: true, blocksShots: true },
    { id: 'terminal-backwall', bounds: { minX: -31, maxX: 31, minZ: -34.3, maxZ: -33.9 }, blocksMovement: true, blocksShots: true },
    { id: 'concourse-seating-west', bounds: { minX: -12.6, maxX: -7.4, minZ: -16.95, maxZ: -16.45 }, blocksMovement: true, blocksShots: true },
    { id: 'concourse-seating-east', bounds: { minX: 7.4, maxX: 12.6, minZ: -16.95, maxZ: -16.45 }, blocksMovement: true, blocksShots: true },
    { id: 'concourse-planter-west', bounds: { minX: -26.9, maxX: -23.1, minZ: -18.78, maxZ: -17.22 }, blocksMovement: true, blocksShots: true },
    { id: 'concourse-planter-east', bounds: { minX: 23.1, maxX: 26.9, minZ: -18.78, maxZ: -17.22 }, blocksMovement: true, blocksShots: true },
    { id: 'cargo-stack-north', bounds: { minX: -22.3, maxX: -17.7, minZ: 16.7, maxZ: 19.3 }, blocksMovement: true, blocksShots: true },
    { id: 'cargo-stack-south', bounds: { minX: 17.7, maxX: 22.3, minZ: 16.7, maxZ: 19.3 }, blocksMovement: true, blocksShots: true },
    { id: 'fuel-trailer-station', bounds: { minX: -13.0, maxX: -7.0, minZ: 16.6, maxZ: 19.4 }, blocksMovement: true, blocksShots: true },
    { id: 'upper-kiosk-west', bounds: { minX: -14.2, maxX: -9.8, minZ: -32.1, maxZ: -29.9 }, blocksMovement: true, blocksShots: true },
    { id: 'upper-kiosk-east', bounds: { minX: 9.8, maxX: 14.2, minZ: -32.1, maxZ: -29.9 }, blocksMovement: true, blocksShots: true },
    { id: 'wood-pallet-stack-west', bounds: { minX: -27.6, maxX: -22.4, minZ: 7.7, maxZ: 10.3 }, blocksMovement: true, blocksShots: true },
    { id: 'wood-pallet-stack-east', bounds: { minX: 22.7, maxX: 25.3, minZ: 19.4, maxZ: 24.6 }, blocksMovement: true, blocksShots: true },
  ];

  root.userData.skylinePresentationBatches = batchPresentationOnlyBoxes(root, 'skyline');
  const collisionPresentationAudit: Array<Readonly<{
    placeholder: string;
    authorityId: string | null;
    presentationNames: readonly string[];
  }>> = [];
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node.userData.skylineQualityPlaceholder !== true) return;
    const authorityId = node.userData.skylineCollisionAuthorityId as string | undefined;
    const presentationNames: string[] = [];
    if (authorityId) {
      root.traverse((candidate) => {
        if (candidate !== node
          && candidate instanceof THREE.Mesh
          && candidate.userData.skylineQualityPlaceholder !== true
          && candidate.userData.skylineCollisionAuthorityId === authorityId) {
          presentationNames.push(candidate.name);
        }
      });
    }
    collisionPresentationAudit.push(Object.freeze({
      placeholder: node.name,
      authorityId: authorityId ?? null,
      presentationNames: Object.freeze(presentationNames.sort()),
    }));
  });
  root.userData.skylineCollisionPresentationAudit = Object.freeze({
    version: 'hf-188-profile-authority-v1',
    entries: Object.freeze(collisionPresentationAudit.sort((left, right) => left.placeholder.localeCompare(right.placeholder))),
    unownedPlaceholders: Object.freeze(collisionPresentationAudit
      .filter((entry) => !entry.authorityId || entry.presentationNames.length === 0)
      .map((entry) => entry.placeholder)
      .sort()),
  });
  root.userData.skylineOpeningAudit = skylineOpeningParityAudit(builder, [
    {
      id: 'terminal-gate',
      aperture: { minX: -1.5, maxX: 1.5, minY: 3.55, maxY: 5.0, minZ: -12.05, maxZ: -11.55 },
    },
    {
      id: 'aircraft-boarding',
      aperture: { minX: -1.45, maxX: 1.45, minY: 4.0, maxY: 5.05, minZ: -0.05, maxZ: 0.45 },
    },
    {
      id: 'cockpit-entry',
      aperture: { minX: -17.75, maxX: -17.3, minY: 2.8, maxY: 5.0, minZ: 0.6, maxZ: 3.4 },
    },
  ]);
  root.userData.skylinePlatformAuthorityAudit = {
    version: 'pass64-shared-platform-authority-v1',
    wingSliceCount,
    wingAuthorityMaximumOverhang,
    platforms: walkablePlatforms.map((platform) => ({
      id: platform.id,
      presentationName: platform.presentationName,
      qualityPresentationName: platform.qualityPresentationName ?? null,
      bounds: { ...platform.bounds },
      y: platform.y,
      movementAuthority: builder.colliders.includes(platform.bounds),
      physicsAuthority: builder.physicsColliders.includes(platform.bounds),
      shotAuthority: builder.shotSurfaces.some((surface) => surface.id === platform.ballisticSurfaceId),
    })),
  };

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
    'cabin-to-cockpit': [
      { id: 'cabin-forward', position: [-15.4, 4.25, 2.0] },
      { id: 'cockpit-entry', position: [-17.55, 4.25, 2.0] },
      { id: 'cockpit-controls', position: [-19.25, 4.25, 2.0] },
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
    platforms: walkablePlatforms.map((platform) => ({
      id: platform.id,
      minX: platform.bounds.minX,
      maxX: platform.bounds.maxX,
      minZ: platform.bounds.minZ,
      maxZ: platform.bounds.maxZ,
      y: platform.y,
    })),
  };

  root.userData.skylineAccess = {
    escalatorAngleDegrees: 22,
    jetbridgeRampAngleDegrees: THREE.MathUtils.radToDeg(jetbridgeRampAngle),
    airstairAngleDegrees: 32,
    maxClimbDegrees: 50,
  };

  return {
    id: 'skyline-terminal',
    label: 'Terminal',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(
      [
        [-27, -14], [-18, -14], [-6, -14], [6, -14], [18, -14], [27, -14], [-12, -14], [12, -14],
      ],
      // PASS 94 integration: the spawn-distribution lane (HF-456) added the
      // seventh and eighth point at x = -12 and 12, which sat 4.00 m from the
      // authored -18/-6 and 6/18 - inside src/additional-maps.test.ts' 6 m
      // Skyline separation floor, which is stricter than the 3 m repo-wide one.
      // The eight points are RE-SPACED along the same line rather than the
      // floor being lowered: -24/-16/-10/-4/4/10/16/24 gives gaps of
      // 8/6/6/8/6/6/8 m, every one at or over 6, with the same span and the
      // same eight points the lane asked for. Team 0's line already cleared it
      // (9/6/6/12/6/6/9) and is untouched.
      [
        [-24, 30], [-16, 30], [-10, 30], [-4, 30], [4, 30], [10, 30], [16, 30], [24, 30],
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
