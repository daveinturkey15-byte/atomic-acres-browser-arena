import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Team } from './protocol';
import { objectLocalGeometryBounds } from './character-presentation-contract';

const OPERATOR_URL = './assets/third-party/quaternius/ultimate-modular-males/Swat.gltf';
const FIRST_PERSON_ARMS_URL = './assets/third-party/quaternius/ultimate-modular-males/Swat_FirstPersonArms.glb';

type RiggedOperatorAsset = {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
};

type RiggedOperatorRuntime = {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  currentBase: string;
  lastUpdatedAt: number;
  visual: THREE.Group;
  weaponSocket: THREE.Group;
  stance: 'stand' | 'crouch' | 'prone';
  speed: number;
};

export type RiggedOperatorInstance = {
  root: THREE.Group;
  weaponSocket: THREE.Group;
};

export type OperatorAppearance = 'team' | 'neon-purple';

let operatorAsset: RiggedOperatorAsset | null = null;
let firstPersonArmsAsset: THREE.Group | null = null;
let operatorAssetPromise: Promise<void> | null = null;

function materialForTeam(
  material: THREE.Material,
  team: Team,
  flattenMaterials: boolean,
  appearance: OperatorAppearance = 'team',
): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material.clone();
  const result = material.clone();
  const name = material.name.toLowerCase();
  if (appearance === 'neon-purple' && name === 'swat') {
    result.color.setHex(0xd85cff);
    result.emissive.setHex(0x7d16bd);
    result.emissiveIntensity = 1.2;
    result.roughness = 0.46;
    result.metalness = 0.08;
  } else if (appearance === 'neon-purple' && name.includes('swat_black')) {
    result.color.setHex(0xa93cff);
    result.emissive.setHex(0x5d0ca8);
    result.emissiveIntensity = 1.05;
    result.roughness = 0.5;
    result.metalness = 0.06;
  } else if (appearance === 'neon-purple' && name.includes('grey')) {
    result.color.setHex(0xe3a5ff);
    result.emissive.setHex(0x64119e);
    result.emissiveIntensity = 0.72;
    result.roughness = 0.54;
    result.metalness = 0.04;
  } else if (name === 'swat') {
    result.color.setHex(team === 0 ? 0x2d7882 : 0xb34d3f);
    result.emissive.setHex(team === 0 ? 0x061a1d : 0x240906);
    result.emissiveIntensity = flattenMaterials ? 0.34 : 0.14;
  } else if (name.includes('swat_black')) {
    result.color.setHex(team === 0 ? 0x1d292d : 0x302326);
    result.emissive.setHex(team === 0 ? 0x061113 : 0x130708);
    result.emissiveIntensity = flattenMaterials ? 0.22 : 0.08;
  } else if (name.includes('grey')) {
    result.color.setHex(team === 0 ? 0x6d9b9e : 0xb98276);
  }
  if (flattenMaterials && appearance !== 'neon-purple') {
    result.roughness = 1;
    result.metalness = 0;
  }
  return result;
}

function flattenOperatorMaterialGroups(
  mesh: THREE.Mesh,
  materials: THREE.Material[],
  appearance: OperatorAppearance,
): void {
  const cloned = mesh.geometry.clone();
  const geometry = cloned.index ? cloned.toNonIndexed() : cloned;
  if (geometry !== cloned) cloned.dispose();
  const vertexCount = geometry.getAttribute('position')?.count ?? 0;
  const colors = new Float32Array(vertexCount * 3);
  const groups = geometry.groups.length > 0
    ? [...geometry.groups]
    : [{ start: 0, count: vertexCount, materialIndex: 0 }];
  for (const group of groups) {
    const source = materials[group.materialIndex ?? 0] ?? materials[0];
    const candidate = source as THREE.MeshStandardMaterial;
    const color = candidate.color?.clone() ?? new THREE.Color(0xffffff);
    if (candidate.emissive && candidate.emissiveIntensity > 0) {
      color.lerp(candidate.emissive, Math.min(0.34, candidate.emissiveIntensity * 0.3));
    }
    const end = Math.min(vertexCount, group.start + group.count);
    for (let vertex = group.start; vertex < end; vertex += 1) color.toArray(colors, vertex * 3);
  }
  geometry.clearGroups();
  if (vertexCount > 0) geometry.addGroup(0, vertexCount, 0);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  mesh.geometry = geometry;
  mesh.material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: appearance === 'neon-purple' ? 0.46 : 1,
    metalness: appearance === 'neon-purple' ? 0.06 : 0,
    emissive: appearance === 'neon-purple' ? 0x4f078d : 0x000000,
    emissiveIntensity: appearance === 'neon-purple' ? 0.92 : 0,
  });
}

function mergeFlattenedOperatorMeshes(visual: THREE.Group): void {
  const meshes: THREE.SkinnedMesh[] = [];
  visual.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh && node.visible) meshes.push(node);
  });
  if (meshes.length < 2) return;
  const first = meshes[0];
  if (!meshes.every((mesh) => mesh.skeleton.bones.length === first.skeleton.bones.length)) return;
  const allowedAttributes = new Set(['position', 'normal', 'color', 'skinIndex', 'skinWeight']);
  const geometries = meshes.map((mesh) => {
    const geometry = mesh.geometry.clone();
    for (const attribute of Object.keys(geometry.attributes)) {
      if (!allowedAttributes.has(attribute)) geometry.deleteAttribute(attribute);
    }
    return geometry;
  });
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((candidate) => candidate.dispose());
  if (!geometry) return;
  const merged = new THREE.SkinnedMesh(geometry, first.material);
  merged.name = 'Swat_Merged_Vertex_LOD';
  merged.castShadow = false;
  merged.receiveShadow = false;
  merged.userData.presentationOnly = true;
  merged.raycast = () => undefined;
  merged.bindMode = first.bindMode;
  merged.bind(first.skeleton, first.bindMatrix);
  meshes.forEach((mesh) => { mesh.visible = false; });
  visual.add(merged);
}

function materialForFirstPerson(material: THREE.Material, flattenMaterials: boolean): THREE.Material {
  const result = materialForTeam(material, 0, flattenMaterials);
  if (result instanceof THREE.MeshStandardMaterial && material.name.toLowerCase() === 'skin') {
    // Dark tactical gloves read more cleanly than bare low-poly fingertips
    // when the articulated hand wraps around compact weapon geometry.
    result.color.setHex(0x243238);
    result.roughness = 0.92;
    result.metalness = 0;
    result.emissive.setHex(0x05090a);
    result.emissiveIntensity = flattenMaterials ? 0.24 : 0.08;
  }
  return result;
}

export function loadRiggedOperatorAsset(): Promise<void> {
  if (operatorAsset && firstPersonArmsAsset) return Promise.resolve();
  if (operatorAssetPromise) return operatorAssetPromise;
  const loader = new GLTFLoader();
  const load = (url: string) => new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
  operatorAssetPromise = Promise.all([load(OPERATOR_URL), load(FIRST_PERSON_ARMS_URL)]).then(([operator, arms]) => {
    operatorAsset = { scene: operator.scene, clips: operator.animations };
    firstPersonArmsAsset = arms.scene;
  });
  return operatorAssetPromise;
}

export function riggedOperatorAssetReady(): boolean {
  return operatorAsset !== null && firstPersonArmsAsset !== null;
}

export type FirstPersonArmChain = {
  shoulder: THREE.Bone;
  elbow: THREE.Bone;
  wrist: THREE.Bone;
  finger: THREE.Bone;
  side: 'left' | 'right';
};

export type FirstPersonRiggedArms = {
  root: THREE.Group;
  chains: FirstPersonArmChain[];
};

export function createFirstPersonRiggedArms(flattenMaterials: boolean): FirstPersonRiggedArms | null {
  if (!firstPersonArmsAsset) return null;
  const root = new THREE.Group();
  root.name = 'first-person-arms';
  const visual = cloneSkeleton(firstPersonArmsAsset) as THREE.Group;
  visual.name = 'licensed-first-person-arms-visual';
  visual.rotation.y = Math.PI;
  visual.scale.setScalar(1.6);
  visual.position.set(-0.28, -2.02, 1.05);
  visual.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = false;
    node.receiveShadow = false;
    if (Array.isArray(node.material)) node.material = node.material.map((material) => materialForFirstPerson(material, flattenMaterials));
    else node.material = materialForFirstPerson(node.material, flattenMaterials);
  });
  root.add(visual);
  const chain = (side: 'left' | 'right'): FirstPersonArmChain | null => {
    const suffix = side === 'left' ? 'L' : 'R';
    const shoulder = visual.getObjectByName(`UpperArm${suffix}`);
    const elbow = visual.getObjectByName(`LowerArm${suffix}`);
    const wrist = visual.getObjectByName(`Wrist${suffix}`);
    const finger = visual.getObjectByName(`Index1${suffix}`);
    return shoulder instanceof THREE.Bone && elbow instanceof THREE.Bone && wrist instanceof THREE.Bone && finger instanceof THREE.Bone
      ? { shoulder, elbow, wrist, finger, side }
      : null;
  };
  const chains = [chain('right'), chain('left')].filter((value): value is FirstPersonArmChain => value !== null);
  // The source third-person proportions are slightly short for a camera-space
  // two-hand stance. Extend bone offsets without inflating sleeve thickness.
  for (const arm of chains) {
    const reachScale = arm.side === 'left' ? 1.5 : 1.3;
    arm.elbow.position.multiplyScalar(reachScale);
    arm.wrist.position.multiplyScalar(reachScale);
  }
  for (const suffix of ['L', 'R']) {
    for (const fingerName of ['Index', 'Middle', 'Ring', 'Pinky']) {
      for (let joint = 1; joint <= 3; joint += 1) {
        const bone = visual.getObjectByName(`${fingerName}${joint}${suffix}`);
        if (bone instanceof THREE.Bone) bone.rotation.x += joint === 1 ? 0.72 : joint === 2 ? 0.95 : 0.78;
      }
    }
    const thumb = visual.getObjectByName(`Thumb2${suffix}`);
    if (thumb instanceof THREE.Bone) thumb.rotation.x += 0.58;
  }
  root.userData.importedFirstPersonArms = true;
  root.userData.importedFirstPersonArmChains = chains.length;
  return { root, chains };
}

function runtime(root: THREE.Object3D): RiggedOperatorRuntime | undefined {
  return root.userData.riggedOperatorRuntime as RiggedOperatorRuntime | undefined;
}

function actionFor(runtimeState: RiggedOperatorRuntime, name: string): THREE.AnimationAction | undefined {
  return runtimeState.actions.get(name);
}

function switchBaseAction(runtimeState: RiggedOperatorRuntime, name: string): void {
  if (runtimeState.currentBase === name) return;
  const previous = actionFor(runtimeState, runtimeState.currentBase);
  const next = actionFor(runtimeState, name);
  if (!next) return;
  next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.14).play();
  previous?.fadeOut(0.14);
  runtimeState.currentBase = name;
}

function playOneShot(runtimeState: RiggedOperatorRuntime, name: string, timeScale = 1): void {
  const action = actionFor(runtimeState, name);
  if (!action) return;
  action.reset();
  action.enabled = true;
  action.clampWhenFinished = true;
  action.setLoop(THREE.LoopOnce, 1);
  action.setEffectiveTimeScale(timeScale);
  action.setEffectiveWeight(1);
  action.fadeIn(0.035).play();
}

export function createRiggedOperator(
  team: Team,
  name: string,
  flattenMaterials: boolean,
  appearance: OperatorAppearance = 'team',
): RiggedOperatorInstance | null {
  if (!operatorAsset) return null;
  const root = new THREE.Group();
  root.name = name;
  root.userData.dynamic = true;

  const visual = cloneSkeleton(operatorAsset.scene) as THREE.Group;
  visual.name = 'rigged-operator-visual';
  // The source character's authored forward axis is opposite Atomic Acres'
  // existing operator convention. Correct it once at the visual root so AI,
  // network yaw and authoritative hit proxies keep their established axes.
  visual.rotation.y = Math.PI;
  visual.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = !flattenMaterials;
    node.receiveShadow = !flattenMaterials;
    node.userData.presentationOnly = true;
    node.raycast = () => undefined;
    if (Array.isArray(node.material)) {
      const materials = node.material.map((material) => materialForTeam(material, team, flattenMaterials, appearance));
      if (flattenMaterials) {
        flattenOperatorMaterialGroups(node, materials, appearance);
      } else {
        node.material = materials;
      }
    } else node.material = materialForTeam(node.material, team, flattenMaterials, appearance);
    if (node.name === 'Pistol') node.visible = false;
  });
  if (flattenMaterials) mergeFlattenedOperatorMeshes(visual);
  root.add(visual);

  const wrist = visual.getObjectByName('WristR') ?? visual.getObjectByName('Wrist.R');
  const weaponSocket = new THREE.Group();
  weaponSocket.name = 'weapon-socket';
  if (wrist) wrist.add(weaponSocket);
  else visual.add(weaponSocket);

  const mixer = new THREE.AnimationMixer(visual);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of operatorAsset.clips) actions.set(clip.name, mixer.clipAction(clip));
  const base = actions.has('Idle_Gun_Pointing') ? 'Idle_Gun_Pointing' : actions.has('Idle_Gun') ? 'Idle_Gun' : 'Idle_Gun_Shoot';
  actions.get(base)?.setLoop(THREE.LoopRepeat, Infinity).play();
  root.userData.riggedOperatorRuntime = {
    mixer,
    actions,
    currentBase: base,
    lastUpdatedAt: performance.now(),
    visual,
    weaponSocket,
    stance: 'stand',
    speed: 0,
  } satisfies RiggedOperatorRuntime;
  root.userData.operatorAsset = {
    source: 'Quaternius Ultimate Modular Males / Swat.gltf',
    license: 'CC0-1.0',
    skinnedMeshes: 5,
    clips: operatorAsset.clips.length,
  };
  root.userData.operatorAppearance = appearance;
  return { root, weaponSocket };
}

export function updateRiggedOperator(root: THREE.Object3D, speed: number, stance: 'stand' | 'crouch' | 'prone'): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - runtimeState.lastUpdatedAt) / 1_000));
  runtimeState.lastUpdatedAt = now;
  runtimeState.stance = stance;
  runtimeState.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
  if (runtimeState.currentBase === 'Death') {
    runtimeState.mixer.update(dt);
    return true;
  }
  const next = speed > 3.2 ? 'Run_Shoot' : speed > 0.18 ? 'Walk' : 'Idle_Gun_Pointing';
  switchBaseAction(runtimeState, runtimeState.actions.has(next) ? next : speed > 0.18 ? 'Run' : 'Idle_Gun');
  runtimeState.visual.position.y = stance === 'crouch' ? -0.34 : stance === 'prone' ? -0.78 : 0;
  runtimeState.visual.rotation.x = stance === 'prone' ? -1.25 : 0;
  runtimeState.mixer.update(dt);
  return true;
}

export function fireRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  playOneShot(runtimeState, runtimeState.actions.has('Gun_Shoot') ? 'Gun_Shoot' : 'Idle_Gun_Shoot', 1.35);
  return true;
}

export function reactRiggedOperator(root: THREE.Object3D, alternate = false): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  playOneShot(runtimeState, alternate && runtimeState.actions.has('HitRecieve_2') ? 'HitRecieve_2' : 'HitRecieve', 1.15);
  return true;
}

export function deathRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState || !runtimeState.actions.has('Death')) return false;
  for (const action of runtimeState.actions.values()) action.fadeOut(0.04);
  playOneShot(runtimeState, 'Death', 1.08);
  runtimeState.currentBase = 'Death';
  return true;
}

export function resetRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  for (const action of runtimeState.actions.values()) action.stop();
  const base = runtimeState.actions.has('Idle_Gun_Pointing')
    ? 'Idle_Gun_Pointing'
    : runtimeState.actions.has('Idle_Gun') ? 'Idle_Gun' : 'Idle_Gun_Shoot';
  runtimeState.actions.get(base)?.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  runtimeState.currentBase = base;
  runtimeState.visual.position.set(0, 0, 0);
  runtimeState.visual.rotation.x = 0;
  runtimeState.lastUpdatedAt = performance.now();
  return true;
}

export function meleeRiggedOperator(root: THREE.Object3D): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  playOneShot(runtimeState, runtimeState.actions.has('Punch_Right') ? 'Punch_Right' : 'Kick_Right', 1.4);
  return true;
}

export function riggedOperatorTelemetry(root: THREE.Object3D): Record<string, unknown> | null {
  const runtimeState = runtime(root);
  if (!runtimeState) return null;
  const weaponRoot = runtimeState.weaponSocket.children[0];
  let weaponBounds: { center: number[]; size: number[]; distanceFromSocket: number } | null = null;
  if (weaponRoot) {
    weaponRoot.updateWorldMatrix(true, true);
    const rootInverse = weaponRoot.matrixWorld.clone().invert();
    const localBounds = new THREE.Box3().makeEmpty();
    weaponRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.geometry) return;
      child.geometry.computeBoundingBox();
      if (!child.geometry.boundingBox) return;
      const meshToWeapon = rootInverse.clone().multiply(child.matrixWorld);
      localBounds.union(child.geometry.boundingBox.clone().applyMatrix4(meshToWeapon));
    });
    if (!localBounds.isEmpty()) {
      const center = localBounds.getCenter(new THREE.Vector3()).applyMatrix4(weaponRoot.matrixWorld);
      const size = localBounds.getSize(new THREE.Vector3());
      const worldScale = weaponRoot.getWorldScale(new THREE.Vector3());
      size.multiply(new THREE.Vector3(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z)));
      const socketPosition = runtimeState.weaponSocket.getWorldPosition(new THREE.Vector3());
      weaponBounds = { center: center.toArray(), size: size.toArray(), distanceFromSocket: center.distanceTo(socketPosition) };
    }
  }
  const localMountBounds = weaponRoot ? objectLocalGeometryBounds(weaponRoot) : null;
  let visibleSkinnedMeshes = 0;
  runtimeState.visual.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh && node.visible) visibleSkinnedMeshes += 1;
  });
  return {
    source: root.userData.operatorAsset?.source,
    appearance: root.userData.operatorAppearance,
    license: root.userData.operatorAsset?.license,
    skinnedMeshes: root.userData.operatorAsset?.skinnedMeshes,
    clips: root.userData.operatorAsset?.clips,
    activeClip: runtimeState.currentBase,
    animationContract: {
      base: runtimeState.currentBase,
      stance: runtimeState.stance,
      speed: runtimeState.speed,
      mixerBeforeSupportIk: true,
    },
    skeletons: runtimeState.visual.getObjectsByProperty('isSkinnedMesh', true).length,
    visibleSkinnedMeshes,
    mergedVertexLod: runtimeState.visual.getObjectByName('Swat_Merged_Vertex_LOD')?.visible === true,
    weaponChildren: runtimeState.weaponSocket.children.length,
    weaponSocketWorld: runtimeState.weaponSocket.getWorldPosition(new THREE.Vector3()).toArray(),
    weaponSocketQuaternion: runtimeState.weaponSocket.getWorldQuaternion(new THREE.Quaternion()).toArray(),
    weaponBounds,
    weaponMount: weaponRoot ? {
      directChild: weaponRoot.parent === runtimeState.weaponSocket,
      localPosition: weaponRoot.position.toArray(),
      localQuaternion: weaponRoot.quaternion.toArray(),
      localScale: weaponRoot.scale.toArray(),
      finite: [...weaponRoot.position.toArray(), ...weaponRoot.quaternion.toArray(), ...weaponRoot.scale.toArray()].every(Number.isFinite),
      localBounds: localMountBounds ? {
        center: localMountBounds.getCenter(new THREE.Vector3()).toArray(),
        size: localMountBounds.getSize(new THREE.Vector3()).toArray(),
      } : null,
    } : null,
    supportGrip: root.userData.operatorGripTelemetry ?? null,
  };
}
