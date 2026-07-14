import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { Team } from './protocol';

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
};

export type RiggedOperatorInstance = {
  root: THREE.Group;
  weaponSocket: THREE.Group;
};

let operatorAsset: RiggedOperatorAsset | null = null;
let firstPersonArmsAsset: THREE.Group | null = null;
let operatorAssetPromise: Promise<void> | null = null;

function materialForTeam(material: THREE.Material, team: Team, flattenMaterials: boolean): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material.clone();
  const result = material.clone();
  const name = material.name.toLowerCase();
  if (name === 'swat') {
    result.color.setHex(team === 0 ? 0x2f6f75 : 0x8d433b);
    result.emissive.setHex(team === 0 ? 0x071b1c : 0x230b08);
    result.emissiveIntensity = flattenMaterials ? 0.34 : 0.14;
  } else if (name.includes('swat_black')) {
    result.color.setHex(team === 0 ? 0x1d292d : 0x302326);
    result.emissive.setHex(team === 0 ? 0x061113 : 0x130708);
    result.emissiveIntensity = flattenMaterials ? 0.22 : 0.08;
  } else if (name.includes('grey')) {
    result.color.setHex(team === 0 ? 0x5e8586 : 0x966961);
  }
  if (flattenMaterials) {
    result.roughness = 1;
    result.metalness = 0;
  }
  return result;
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

export function createRiggedOperator(team: Team, name: string, flattenMaterials: boolean): RiggedOperatorInstance | null {
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
    if (Array.isArray(node.material)) node.material = node.material.map((material) => materialForTeam(material, team, flattenMaterials));
    else node.material = materialForTeam(node.material, team, flattenMaterials);
    if (node.name === 'Pistol') node.visible = false;
  });
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
  } satisfies RiggedOperatorRuntime;
  root.userData.operatorAsset = {
    source: 'Quaternius Ultimate Modular Males / Swat.gltf',
    license: 'CC0-1.0',
    skinnedMeshes: 5,
    clips: operatorAsset.clips.length,
  };
  return { root, weaponSocket };
}

export function updateRiggedOperator(root: THREE.Object3D, speed: number, stance: 'stand' | 'crouch' | 'prone'): boolean {
  const runtimeState = runtime(root);
  if (!runtimeState) return false;
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - runtimeState.lastUpdatedAt) / 1_000));
  runtimeState.lastUpdatedAt = now;
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
  const weaponBounds = runtimeState.weaponSocket.children.length > 0
    ? new THREE.Box3().setFromObject(runtimeState.weaponSocket)
    : null;
  return {
    source: root.userData.operatorAsset?.source,
    license: root.userData.operatorAsset?.license,
    skinnedMeshes: root.userData.operatorAsset?.skinnedMeshes,
    clips: root.userData.operatorAsset?.clips,
    activeClip: runtimeState.currentBase,
    skeletons: runtimeState.visual.getObjectsByProperty('isSkinnedMesh', true).length,
    weaponChildren: runtimeState.weaponSocket.children.length,
    weaponSocketWorld: runtimeState.weaponSocket.getWorldPosition(new THREE.Vector3()).toArray(),
    weaponSocketQuaternion: runtimeState.weaponSocket.getWorldQuaternion(new THREE.Quaternion()).toArray(),
    weaponBounds: weaponBounds ? {
      center: weaponBounds.getCenter(new THREE.Vector3()).toArray(),
      size: weaponBounds.getSize(new THREE.Vector3()).toArray(),
    } : null,
  };
}
