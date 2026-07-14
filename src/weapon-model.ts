import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { WeaponId } from './protocol';
import { weaponFamilyPresentation } from './weapon-family-presentation';

type WeaponAsset = { scene: THREE.Group; clips: THREE.AnimationClip[] };
type ImportedWeaponRuntime = { mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; weapon: WeaponId };

const URLS: Record<WeaponId, string> = {
  carbine: './assets/third-party/quaternius/animated-guns/Rifle.glb',
  smg: './assets/third-party/quaternius/animated-guns/P90.glb',
  scattergun: './assets/third-party/quaternius/animated-guns/Shotgun.glb',
  pistol: './assets/third-party/quaternius/animated-guns/Pistol.glb',
};
const LENGTHS: Record<WeaponId, number> = { carbine: 1.35, smg: 0.92, scattergun: 1.3, pistol: 0.48 };
const PRESENTATION_YAW: Record<WeaponId, number> = {
  carbine: 0,
  smg: 0,
  scattergun: 0,
  pistol: Math.PI / 2,
};
const PRESENTATION_ROLL: Record<WeaponId, number> = {
  carbine: -0.12,
  smg: -0.1,
  scattergun: -0.08,
  pistol: -0.06,
};
const assets = new Map<WeaponId, WeaponAsset>();
let loadPromise: Promise<void> | null = null;

function loadOne(id: WeaponId): Promise<void> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(URLS[id], (gltf) => {
      assets.set(id, { scene: gltf.scene, clips: gltf.animations });
      resolve();
    }, undefined, reject);
  });
}

export function loadImportedWeaponAssets(): Promise<void> {
  loadPromise ??= Promise.all((Object.keys(URLS) as WeaponId[]).map(loadOne)).then(() => undefined);
  return loadPromise;
}

function socket(root: THREE.Object3D, name: string, position: [number, number, number]): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  result.position.set(...position);
  root.add(result);
  return result;
}

function flattenMaterial(material: THREE.Material): THREE.Material {
  const source = material as THREE.MeshStandardMaterial;
  return new THREE.MeshBasicMaterial({
    color: source.color?.clone() ?? new THREE.Color(0x303944),
    map: source.map ?? null,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
  });
}

const SOCKETS: Record<WeaponId, {
  muzzle: [number, number, number]; eject: [number, number, number]; right: [number, number, number]; left: [number, number, number]; reload: [number, number, number]; sight: string;
}> = {
  carbine: { muzzle: [0, 0.005, -1.24], eject: [0.145, 0.055, -0.07], right: [-0.1, -0.135, 0.43], left: [-0.43, -0.07, 0.47], reload: [-0.13, -0.18, -0.08], sight: 'optic-reticle' },
  smg: { muzzle: [0, 0.005, -0.96], eject: [0.14, 0.06, -0.04], right: [0.03, -0.13, 0.02], left: [-0.03, -0.08, -0.43], reload: [-0.14, -0.16, -0.08], sight: 'smg-aperture' },
  scattergun: { muzzle: [0, 0.005, -1.24], eject: [0.14, 0.045, -0.03], right: [0.03, -0.14, 0.12], left: [-0.03, -0.025, -0.55], reload: [-0.18, -0.14, 0.02], sight: 'ghost-ring' },
  pistol: { muzzle: [0, 0.105, -0.58], eject: [0.125, 0.13, -0.08], right: [0.03, -0.2, 0.08], left: [-0.09, -0.1, -0.12], reload: [-0.12, -0.06, 0], sight: 'pistol-rear-sight' },
};

export function createImportedWeaponModel(id: WeaponId, flattenMaterials: boolean): THREE.Group | null {
  const asset = assets.get(id);
  if (!asset) return null;
  const root = new THREE.Group();
  root.name = `${id}-imported-model`;
  root.userData.importedWeapon = true;
  const visual = cloneSkeleton(asset.scene) as THREE.Group;
  visual.name = `${id}-licensed-visual`;
  visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  visual.position.copy(center).multiplyScalar(-1);
  const presentation = new THREE.Group();
  presentation.name = `${id}-licensed-orientation`;
  presentation.scale.setScalar(LENGTHS[id] / Math.max(0.001, maxDimension));
  // Normalize scale on one parent. Keep roll subtle: the explicit gameplay
  // sockets below live in root space, so a dramatic visual-only roll makes
  // hands solve toward invisible grips and turns the receiver edge-on.
  presentation.rotation.y = PRESENTATION_YAW[id];
  presentation.rotation.z = PRESENTATION_ROLL[id];
  visual.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = !flattenMaterials;
    node.receiveShadow = !flattenMaterials;
    if (Array.isArray(node.material)) node.material = node.material.map((material) => flattenMaterials ? flattenMaterial(material) : material.clone());
    else node.material = flattenMaterials ? flattenMaterial(node.material) : node.material.clone();
  });
  presentation.add(visual);
  root.add(presentation);

  // Imported assets expose inconsistent control-node names. A single explicit
  // game-space contract is safer than mixing authored child sockets with
  // duplicate root placeholders: every consumer resolves exactly one socket.
  const config = SOCKETS[id];
  const sightHeight = weaponFamilyPresentation(id).sightHeight;
  socket(root, 'muzzle-socket', config.muzzle);
  socket(root, 'eject-socket', config.eject);
  socket(root, 'grip-socket-r', config.right);
  socket(root, 'support-socket-l', config.left);
  socket(root, 'reload-socket-l', config.reload);
  socket(root, 'rear-sight-socket', [0, sightHeight, 0.08]);
  socket(root, 'front-sight-socket', [0, sightHeight, config.muzzle[2] + 0.12]);
  socket(root, config.sight, [0, sightHeight, 0.08]);

  const mixer = new THREE.AnimationMixer(visual);
  const actions = new Map(asset.clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
  const runtime: ImportedWeaponRuntime = { mixer, actions, weapon: id };
  root.userData.importedWeaponRuntime = runtime;
  root.userData.importedWeaponSource = URLS[id];
  return root;
}

function runtime(root: THREE.Object3D): ImportedWeaponRuntime | null {
  return (root.userData.importedWeaponRuntime as ImportedWeaponRuntime | undefined) ?? null;
}

function playMatching(root: THREE.Object3D, fragment: string): void {
  const state = runtime(root);
  if (!state) return;
  const entry = [...state.actions.entries()].find(([name]) => name.toLowerCase().includes(fragment.toLowerCase()));
  if (!entry) return;
  entry[1].reset().setLoop(THREE.LoopOnce, 1).play();
}

export function updateImportedWeapon(root: THREE.Object3D, dt: number): void {
  runtime(root)?.mixer.update(Math.min(0.05, Math.max(0, dt)));
}

export function fireImportedWeapon(root: THREE.Object3D): void {
  playMatching(root, 'fire');
}

export function reloadImportedWeapon(root: THREE.Object3D): void {
  playMatching(root, 'reload');
}

export function importedWeaponTelemetry(root: THREE.Object3D | undefined): {
  source: string;
  weapon: WeaponId;
  clips: number;
  meshes: number;
  socketContractReady: boolean;
  muzzleForwardDot: number | null;
  sightForwardDot: number | null;
} | null {
  if (!root) return null;
  const state = runtime(root);
  if (!state) return null;
  let meshes = 0;
  const socketCounts = new Map<string, number>();
  const contractNames = ['muzzle-socket', 'eject-socket', 'grip-socket-r', 'support-socket-l', 'reload-socket-l', 'rear-sight-socket', 'front-sight-socket'];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) meshes += 1;
    if (contractNames.includes(node.name)) socketCounts.set(node.name, (socketCounts.get(node.name) ?? 0) + 1);
  });
  const socketContractReady = contractNames.every((name) => socketCounts.get(name) === 1);
  root.updateMatrixWorld(true);
  const localDirection = (fromName: string, toName: string): number | null => {
    const from = root.getObjectByName(fromName);
    const to = root.getObjectByName(toName);
    if (!from || !to) return null;
    const fromLocal = root.worldToLocal(from.getWorldPosition(new THREE.Vector3()));
    const toLocal = root.worldToLocal(to.getWorldPosition(new THREE.Vector3()));
    const direction = toLocal.sub(fromLocal);
    if (direction.lengthSq() < 1e-8) return null;
    return direction.normalize().dot(new THREE.Vector3(0, 0, -1));
  };
  return {
    source: String(root.userData.importedWeaponSource),
    weapon: state.weapon,
    clips: state.actions.size,
    meshes,
    socketContractReady,
    muzzleForwardDot: localDirection('grip-socket-r', 'muzzle-socket'),
    sightForwardDot: localDirection('rear-sight-socket', 'front-sight-socket'),
  };
}
