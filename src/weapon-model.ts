import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { WeaponId } from './protocol';
import { weaponFamilyPresentation } from './weapon-family-presentation';

type WeaponAsset = { scene: THREE.Group; clips: THREE.AnimationClip[] };
type ImportedWeaponRuntime = { mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; weapon: WeaponId };

const URLS: Record<WeaponId, string> = {
  carbine: './assets/third-party/quaternius/animated-guns/Rifle.glb',
  lmg: './assets/third-party/quaternius/animated-guns/Rifle.glb',
  smg: './assets/third-party/quaternius/animated-guns/P90.glb',
  scattergun: './assets/third-party/quaternius/animated-guns/Shotgun.glb',
  sniper: './assets/third-party/quaternius/animated-guns/Rifle.glb',
  pistol: './assets/third-party/quaternius/animated-guns/Pistol.glb',
  'machine-pistol': './assets/third-party/quaternius/animated-guns/Pistol.glb',
};
const LENGTHS: Record<WeaponId, number> = { carbine: 1.35, lmg: 1.7, smg: 0.92, scattergun: 1.3, sniper: 1.55, pistol: 0.48, 'machine-pistol': 0.5 };
const PRESENTATION_YAW: Record<WeaponId, number> = {
  carbine: 0,
  lmg: 0,
  smg: 0,
  scattergun: 0,
  sniper: 0,
  pistol: Math.PI / 2,
  'machine-pistol': Math.PI / 2,
};
const PRESENTATION_ROLL: Record<WeaponId, number> = {
  carbine: -0.12,
  lmg: -0.12,
  smg: -0.1,
  scattergun: -0.08,
  sniper: -0.1,
  pistol: -0.06,
  'machine-pistol': -0.06,
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
  lmg: { muzzle: [0, 0.005, -1.92], eject: [0.16, 0.065, -0.12], right: [-0.1, -0.15, 0.42], left: [-0.45, -0.09, 0.68], reload: [-0.24, -0.3, -0.24], sight: 'optic-reticle' },
  smg: { muzzle: [0, 0.005, -0.96], eject: [0.14, 0.06, -0.04], right: [0.03, -0.13, 0.02], left: [-0.03, -0.08, -0.43], reload: [-0.14, -0.16, -0.08], sight: 'smg-aperture' },
  scattergun: { muzzle: [0, 0.005, -1.24], eject: [0.14, 0.045, -0.03], right: [0.03, -0.14, 0.12], left: [-0.03, -0.025, -0.55], reload: [-0.18, -0.14, 0.02], sight: 'ghost-ring' },
  sniper: { muzzle: [0, 0.005, -1.52], eject: [0.145, 0.055, -0.07], right: [-0.1, -0.135, 0.43], left: [-0.43, -0.07, 0.47], reload: [-0.13, -0.18, -0.08], sight: 'optic-reticle' },
  pistol: { muzzle: [0, 0.105, -0.58], eject: [0.125, 0.13, -0.08], right: [0.03, -0.2, 0.08], left: [-0.09, -0.1, -0.12], reload: [-0.12, -0.06, 0], sight: 'pistol-rear-sight' },
  'machine-pistol': { muzzle: [0, 0.105, -0.58], eject: [0.125, 0.13, -0.08], right: [0.03, -0.2, 0.08], left: [-0.09, -0.1, -0.12], reload: [-0.12, -0.06, 0], sight: 'pistol-rear-sight' },
};

function createPass31DetailKit(id: WeaponId, flattenMaterials: boolean, sightHeight: number): THREE.Group {
  const kit = new THREE.Group();
  kit.name = `${id}-pass31-detail-kit`;
  kit.userData.originalDetailKit = true;
  const material = (color: number, roughness: number, metalness: number, emissive = 0) => flattenMaterials
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive ? 0.42 : 0 });
  const gunmetal = material(0x1d2930, 0.28, 0.78);
  const parkerized = material(0x344249, 0.4, 0.62);
  const grip = material(0x171c20, 0.72, 0.16);
  const accent = material(id === 'scattergun' ? 0xc76f42 : id === 'sniper' ? 0x78d1c7 : id === 'lmg' ? 0x789f54 : 0xe2aa51, 0.34, 0.52, id === 'sniper' ? 0x0b2a2b : 0);
  const lens = flattenMaterials
    ? new THREE.MeshBasicMaterial({ color: 0x78eef2, transparent: true, opacity: 0.58 })
    : new THREE.MeshStandardMaterial({ color: 0x78eef2, emissive: 0x123b43, emissiveIntensity: 0.7, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.7 });
  const addBox = (name: string, size: [number, number, number], position: [number, number, number], mat: THREE.Material, rotation: [number, number, number] = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size, 2, 2, 2), mat);
    mesh.name = name; mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.castShadow = !flattenMaterials; mesh.receiveShadow = !flattenMaterials;
    kit.add(mesh); return mesh;
  };
  const addCylinder = (name: string, radius: number, length: number, position: [number, number, number], mat: THREE.Material, segments = 12) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), mat);
    mesh.name = name; mesh.position.set(...position); mesh.rotation.x = Math.PI / 2; mesh.castShadow = !flattenMaterials; kit.add(mesh); return mesh;
  };

  const longGun = id === 'carbine' || id === 'lmg' || id === 'smg' || id === 'scattergun' || id === 'sniper';
  if (longGun) {
    const railLength = id === 'sniper' ? 0.72 : id === 'scattergun' ? 0.58 : 0.48;
    addBox('receiver-side-plate', [0.3, 0.17, id === 'smg' ? 0.5 : 0.62], [0, 0, -0.22], parkerized);
    addBox('top-accessory-rail', [0.18, 0.032, railLength], [0, sightHeight - 0.08, -0.3], gunmetal);
    for (let tooth = 0; tooth < 6; tooth += 1) addBox(`rail-tooth-${tooth}`, [0.21, 0.025, 0.026], [0, sightHeight - 0.052, -0.08 - tooth * railLength / 6], gunmetal);
    addCylinder('muzzle-brake', id === 'scattergun' ? 0.085 : 0.065, 0.16, [0, 0.005, SOCKETS[id].muzzle[2] + 0.07], gunmetal, 14);
  }

  if (id === 'lmg') {
    const magazine = addBox('lmg-box-magazine', [0.38, 0.4, 0.34], [0, -0.3, -0.25], grip); magazine.userData.originalAnimatedPart = true;
    const bolt = addBox('bolt-or-slide', [0.22, 0.075, 0.22], [0.12, 0.045, -0.12], accent); bolt.userData.restZ = bolt.position.z;
    addBox('lmg-heavy-receiver', [0.34, 0.28, 0.82], [0, 0.02, -0.28], parkerized);
    addBox('lmg-heat-shield', [0.3, 0.18, 0.76], [0, 0, -0.92], gunmetal);
    addBox('lmg-carry-handle', [0.34, 0.16, 0.1], [0, sightHeight + 0.09, -0.42], grip);
    addBox('lmg-bipod', [0.32, 0.06, 0.48], [0, -0.14, -1.08], parkerized, [0.05, 0, 0]);
  } else if (id === 'carbine') {
    const magazine = addBox('curved-magazine', [0.21, 0.48, 0.19], [0, -0.28, -0.08], grip, [0.12, 0, -0.06]);
    magazine.userData.originalAnimatedPart = true;
    const bolt = addBox('bolt-or-slide', [0.19, 0.07, 0.2], [0.11, 0.035, -0.05], accent); bolt.userData.restZ = bolt.position.z;
    addBox('stock-cheek-riser', [0.28, 0.11, 0.42], [0, 0.1, 0.3], grip);
    addCylinder('optic-housing', 0.105, 0.18, [0, sightHeight, -0.2], gunmetal, 16);
    addCylinder('optic-glass', 0.084, 0.008, [0, sightHeight, -0.104], lens, 18);
  } else if (id === 'smg') {
    const magazine = addBox('straight-magazine', [0.2, 0.44, 0.16], [0, -0.25, -0.1], grip, [0.08, 0, 0]); magazine.userData.originalAnimatedPart = true;
    const bolt = addBox('bolt-or-slide', [0.2, 0.065, 0.18], [0.1, 0.045, -0.08], accent); bolt.userData.restZ = bolt.position.z;
    addBox('smg-hand-stop', [0.22, 0.22, 0.13], [0, -0.14, -0.51], grip, [-0.1, 0, 0]);
    addBox('smg-holo-frame', [0.22, 0.2, 0.07], [0, sightHeight, -0.18], gunmetal);
    addBox('smg-holo-glass', [0.14, 0.12, 0.008], [0, sightHeight + 0.01, -0.135], lens);
  } else if (id === 'scattergun') {
    const pump = addBox('pump', [0.31, 0.22, 0.42], [0, -0.05, -0.52], grip); pump.userData.restZ = pump.position.z;
    addBox('ventilated-rib', [0.055, 0.035, 0.72], [0, sightHeight - 0.07, -0.57], gunmetal);
    for (let vent = 0; vent < 4; vent += 1) addBox(`rib-bridge-${vent}`, [0.22, 0.025, 0.035], [0, sightHeight - 0.055, -0.28 - vent * 0.16], accent);
    const shell = addCylinder('reload-shell', 0.045, 0.11, [-0.16, -0.13, -0.02], material(0xb54c37, 0.54, 0.24), 10); shell.visible = false;
  } else if (id === 'sniper') {
    const magazine = addBox('straight-magazine', [0.22, 0.42, 0.19], [0, -0.26, -0.06], grip, [0.09, 0, 0]); magazine.userData.originalAnimatedPart = true;
    const bolt = addBox('bolt-or-slide', [0.18, 0.07, 0.24], [0.12, 0.04, -0.02], accent); bolt.userData.restZ = bolt.position.z;
    addCylinder('longline-scope-body', 0.115, 0.62, [0, sightHeight, -0.25], gunmetal, 18);
    addCylinder('scope-rear-lens', 0.094, 0.009, [0, sightHeight, 0.065], lens, 20);
    addCylinder('scope-front-lens', 0.102, 0.009, [0, sightHeight, -0.565], lens, 20);
    addBox('scope-turret', [0.12, 0.1, 0.12], [0, sightHeight + 0.15, -0.25], accent);
    addBox('folded-bipod', [0.26, 0.06, 0.48], [0, -0.105, -0.72], parkerized, [0.04, 0, 0]);
  } else {
    const magazine = addBox('pistol-magazine', [0.13, id === 'machine-pistol' ? 0.5 : 0.32, 0.11], [0, -0.27, 0.06], grip, [0.15, 0, 0]); magazine.userData.originalAnimatedPart = true;
    const slide = addBox('bolt-or-slide', [0.24, 0.19, 0.5], [0, 0.08, -0.18], gunmetal); slide.userData.restZ = slide.position.z;
    addBox('pistol-frame-detail', [0.23, 0.12, 0.34], [0, -0.04, -0.14], parkerized);
    addBox('front-sight-blade', [0.045, 0.07, 0.045], [0, sightHeight - 0.015, -0.43], accent);
    if (id === 'machine-pistol') {
      addCylinder('machine-pistol-compensator', 0.09, 0.18, [0, 0.105, -0.53], gunmetal, 14);
      addBox('machine-pistol-side-rail', [0.28, 0.07, 0.26], [0, -0.06, -0.31], accent);
    }
  }
  kit.userData.detailMeshCount = kit.children.filter((child) => child instanceof THREE.Mesh).length;
  return kit;
}

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
  const detailKit = createPass31DetailKit(id, flattenMaterials, sightHeight);
  root.add(detailKit);
  root.userData.pass31DetailMeshes = Number(detailKit.userData.detailMeshCount ?? 0);
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
  detailMeshes: number;
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
    detailMeshes: Number(root.userData.pass31DetailMeshes ?? 0),
    socketContractReady,
    muzzleForwardDot: localDirection('grip-socket-r', 'muzzle-socket'),
    sightForwardDot: localDirection('rear-sight-socket', 'front-sight-socket'),
  };
}
