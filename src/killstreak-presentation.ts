import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { DroneSensorContact, KillstreakEntitySnapshot, KillstreakImpactEvent, KillstreakPlacementMarkerSnapshot, KillstreakRecipientSnapshot } from './killstreak-runtime';
import { DRONE_GUN_PROFILE_ID, DRONE_PRESENTATION_FAMILY_ID } from './killstreak-support-catalog';
import { SUPPORT_WEAPON_FEEDBACK_CONTRACT } from './support-vehicle-presentation-contract';

const MAX_PRESENTED_ENTITIES = 32;
const MAX_IMPACT_FLASHES = 20;
const MAX_SENSOR_CONTACTS = 16;
const MAX_PLACEMENT_MARKERS = 8;
export const HUNTER_DRONE_ASSET = './assets/original/models/support/hunter-drone-lod0.glb';
const HUNTER_DRONE_TARGET_MAX_DIMENSION = 1.45;

let hunterDroneTemplate: THREE.Group | null = null;
let hunterDroneAnimations: readonly THREE.AnimationClip[] = [];
let hunterDroneSourceMaxDimension = 0;
let hunterDroneLoadState: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';
let hunterDroneLoadPromise: Promise<void> | null = null;

function markSharedPresentationAsset(root: THREE.Object3D): void {
  root.traverse((node) => {
    node.userData.presentationOnly = true;
    node.userData.authoredSharedAsset = true;
    node.raycast = () => undefined;
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}

export function loadHunterDronePresentation(): Promise<void> {
  if (hunterDroneLoadPromise) return hunterDroneLoadPromise;
  hunterDroneLoadState = 'loading';
  hunterDroneLoadPromise = new Promise((resolve) => {
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(HUNTER_DRONE_ASSET, (gltf) => {
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      hunterDroneSourceMaxDimension = Math.max(size.x, size.y, size.z);
      const required = ['drone-body', 'drone-mounted-gun', 'drone-gun-muzzle-socket', 'drone-first-person-camera-socket', 'drone-rotors'];
      hunterDroneLoadState = hunterDroneSourceMaxDimension > 0 && required.every((name) => root.getObjectByName(name))
        ? 'ready'
        : 'fallback';
      if (hunterDroneLoadState === 'ready') {
        hunterDroneTemplate = root;
        hunterDroneAnimations = Object.freeze([...gltf.animations]);
        markSharedPresentationAsset(root);
      }
      resolve();
    }, undefined, (error) => {
      hunterDroneLoadState = 'fallback';
      console.warn('[Arena] Authored Hunter Drone unavailable; retaining bounded fallback.', error);
      resolve();
    });
  });
  return hunterDroneLoadPromise;
}

export function hunterDronePresentationTelemetry(): Readonly<{
  state: typeof hunterDroneLoadState;
  asset: string;
  sourceMaxDimension: number;
  animations: readonly string[];
}> {
  return Object.freeze({
    state: hunterDroneLoadState,
    asset: HUNTER_DRONE_ASSET,
    sourceMaxDimension: hunterDroneSourceMaxDimension,
    animations: Object.freeze(hunterDroneAnimations.map((clip) => clip.name)),
  });
}

type PresentedEntity = Readonly<{
  root: THREE.Group;
  rotor: THREE.Object3D | null;
  target: THREE.Vector3;
  mixer: THREE.AnimationMixer | null;
}>;

type PresentedPlacementMarker = {
  root: THREE.Group;
  snapshot: KillstreakPlacementMarkerSnapshot;
  snapshotRevision: number;
  expiresAtMs: number;
};

export type KillstreakPlacementMarkerTelemetry = Readonly<{
  id: string;
  activationId: string;
  source: KillstreakPlacementMarkerSnapshot['source'];
  shape: KillstreakPlacementMarkerSnapshot['shape'];
  audience: KillstreakPlacementMarkerSnapshot['audience'];
  ownerId: string;
  anchor: readonly number[];
  pathStart: readonly number[] | null;
  pathEnd: readonly number[] | null;
  halfWidthM: number | null;
  worldPosition: readonly number[];
  worldBounds: Readonly<{ min: readonly number[]; max: readonly number[] }>;
  corridorLengthM: number | null;
  meshNames: readonly string[];
  colourHexes: readonly string[];
  depthTest: boolean;
  visible: boolean;
}>;

export type KillstreakPresentationTelemetry = Readonly<{
  entities: number;
  impactFlashes: number;
  sensorContacts: number;
  placementMarkers: number;
  markerDetails: readonly KillstreakPlacementMarkerTelemetry[];
  bounded: boolean;
}>;

export type KillstreakPresentationRetireRoot = (root: THREE.Object3D) => void;

function material(color: number, options: { emissive?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: options.emissive ?? 0,
    emissiveIntensity: options.emissive ? 0.55 : 0,
    roughness: 0.45,
    metalness: 0.42,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

function mesh(geometry: THREE.BufferGeometry, colour: number, name: string): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material(colour));
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function presentationSocket(name: string, position: readonly [number, number, number]): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  result.position.set(...position);
  result.userData.presentationOnly = true;
  return result;
}

function isFirstPersonCockpitNode(root: THREE.Object3D, node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor && cursor !== root) {
    if (cursor.userData.firstPersonCockpit === true) return true;
    cursor = cursor.parent;
  }
  return false;
}

function isFirstPersonOnlyNode(root: THREE.Object3D, node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor && cursor !== root) {
    if (cursor.userData.firstPersonOnly === true) return true;
    cursor = cursor.parent;
  }
  return false;
}

function setSupportFirstPersonVisibility(root: THREE.Group, possessed: boolean): void {
  root.visible = true;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData.supportBaseVisible === undefined) node.userData.supportBaseVisible = node.visible;
    node.visible = possessed
      ? isFirstPersonCockpitNode(root, node)
      : node.userData.supportBaseVisible === true && !isFirstPersonOnlyNode(root, node);
  });
}

function buildChopper(): PresentedEntity {
  const root = new THREE.Group();
  root.name = 'pass65-chopper-gunner';
  root.userData.pass65KillstreakPresentation = true;
  const fuselage = mesh(new THREE.CapsuleGeometry(0.72, 2.1, 6, 12), 0x18262b, 'chopper-fuselage');
  fuselage.rotation.x = Math.PI / 2;
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.67, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    material(0x316b77, { emissive: 0x0a2932, transparent: true, opacity: 0.82 }),
  );
  canopy.name = 'chopper-sleek-cockpit-canopy';
  canopy.position.set(0, 0.2, -0.98);
  canopy.scale.set(0.88, 0.78, 1.1);
  const glareshield = mesh(new THREE.BoxGeometry(0.76, 0.09, 0.43), 0x071012, 'chopper-cockpit-glareshield');
  glareshield.position.set(0, 0.04, -0.92);
  const tail = mesh(new THREE.BoxGeometry(0.18, 0.18, 2.25), 0x263a3f, 'chopper-tail-boom');
  tail.position.z = 1.95;
  const fin = mesh(new THREE.BoxGeometry(0.08, 0.75, 0.55), 0xe0b94f, 'chopper-tail-fin');
  fin.position.set(0, 0.35, 3.03);
  const gun = mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.95, 10), 0x0b1012, 'chopper-player-gun');
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, -0.58, -0.72);
  const gunMuzzle = presentationSocket('chopper-gun-muzzle-socket', [0, -0.58, -1.24]);
  const cameraSocket = presentationSocket('chopper-first-person-camera-socket', [0, 0.18, -1.22]);
  const cockpit = new THREE.Group();
  cockpit.name = 'chopper-first-person-cockpit';
  cockpit.userData.firstPersonCockpit = true;
  cockpit.position.copy(cameraSocket.position);
  const dashboard = mesh(new THREE.BoxGeometry(0.82, 0.13, 0.16), 0x071215, 'chopper-cockpit-dashboard-3d');
  dashboard.position.set(0, -0.165, -0.35);
  dashboard.rotation.x = -0.16;
  const cockpitRailLeft = mesh(new THREE.BoxGeometry(0.035, 0.48, 0.035), 0x2a555e, 'chopper-cockpit-rail-left');
  cockpitRailLeft.position.set(-0.47, 0.02, -0.27);
  cockpitRailLeft.rotation.z = -0.18;
  const cockpitRailRight = cockpitRailLeft.clone();
  cockpitRailRight.name = 'chopper-cockpit-rail-right';
  cockpitRailRight.position.x = 0.47;
  cockpitRailRight.rotation.z = 0.18;
  const displayMaterial = (colour: number) => new THREE.MeshStandardMaterial({
    color: colour,
    emissive: colour,
    emissiveIntensity: 2.2,
    roughness: 0.28,
    metalness: 0.18,
    toneMapped: false,
  });
  const cyanDisplay = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.012), displayMaterial(0x41ddff));
  cyanDisplay.name = 'chopper-cockpit-display-cyan';
  cyanDisplay.position.set(-0.19, -0.125, -0.44);
  const greenDisplay = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.012), displayMaterial(0x5dff9b));
  greenDisplay.name = 'chopper-cockpit-display-green';
  greenDisplay.position.set(0.19, -0.125, -0.44);
  const firstPersonRotor = new THREE.Group();
  firstPersonRotor.name = 'chopper-first-person-rotor';
  firstPersonRotor.userData.firstPersonOnly = true;
  // Keep the translucent tips forward of the near plane throughout rotation;
  // they remain visible overhead without ever sweeping through the camera.
  firstPersonRotor.position.set(0, 0.44, -1.35);
  const rotorBlurMaterial = new THREE.MeshBasicMaterial({
    color: 0x7ddde3,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    toneMapped: false,
  });
  const firstBladeA = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.012, 0.035), rotorBlurMaterial);
  firstBladeA.name = 'chopper-first-person-rotor-blade-a';
  const firstBladeB = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 2.2), rotorBlurMaterial.clone());
  firstBladeB.name = 'chopper-first-person-rotor-blade-b';
  firstPersonRotor.add(firstBladeA, firstBladeB);
  cockpit.add(dashboard, cockpitRailLeft, cockpitRailRight, cyanDisplay, greenDisplay, firstPersonRotor);
  const rotor = new THREE.Group();
  rotor.name = 'chopper-main-rotor';
  rotor.position.y = 0.85;
  const hub = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8), 0xa9bbb5, 'chopper-rotor-hub');
  const bladeA = mesh(new THREE.BoxGeometry(5.6, 0.035, 0.13), 0x121a1d, 'chopper-rotor-blade-a');
  const bladeB = mesh(new THREE.BoxGeometry(0.13, 0.035, 5.6), 0x121a1d, 'chopper-rotor-blade-b');
  rotor.add(hub, bladeA, bladeB);
  const tailRotor = new THREE.Group();
  tailRotor.name = 'chopper-tail-rotor';
  tailRotor.position.set(0.12, 0.42, 3.05);
  tailRotor.rotation.z = Math.PI / 2;
  tailRotor.add(
    mesh(new THREE.BoxGeometry(0.8, 0.025, 0.07), 0x121a1d, 'chopper-tail-rotor-blade-a'),
    mesh(new THREE.BoxGeometry(0.07, 0.025, 0.8), 0x121a1d, 'chopper-tail-rotor-blade-b'),
  );
  const skids = [-1, 1].map((side) => {
    const skid = mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.15, 6), 0x778580, `chopper-skid-${side}`);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * 0.58, -0.67, 0.15);
    return skid;
  });
  root.add(fuselage, canopy, glareshield, tail, fin, gun, gunMuzzle, cameraSocket, cockpit, rotor, tailRotor, ...skids);
  root.userData.forwardAxis = [0, 0, -1];
  root.userData.audioSemanticIds = ['chopper-low-loop', 'chopper-gun-report'];
  root.userData.weaponFeedback = [...SUPPORT_WEAPON_FEEDBACK_CONTRACT];
  root.scale.setScalar(0.82);
  return Object.freeze({ root, rotor, target: new THREE.Vector3(), mixer: null });
}

function buildCareAircraft(): PresentedEntity {
  const root = new THREE.Group();
  root.name = 'pass65-care-package-aircraft';
  root.userData.pass65KillstreakPresentation = true;
  const fuselage = mesh(new THREE.CapsuleGeometry(0.52, 3.6, 6, 12), 0x34464a, 'care-aircraft-fuselage');
  fuselage.rotation.x = Math.PI / 2;
  const nose = mesh(new THREE.SphereGeometry(0.49, 12, 8), 0x64787a, 'care-aircraft-nose');
  nose.scale.set(0.86, 0.74, 1.18);
  nose.position.z = -2.05;
  const wing = mesh(new THREE.BoxGeometry(5.8, 0.11, 1.05), 0x26383c, 'care-aircraft-main-wing');
  wing.position.z = 0.1;
  const tailWing = mesh(new THREE.BoxGeometry(2.2, 0.08, 0.52), 0x26383c, 'care-aircraft-tail-wing');
  tailWing.position.z = 2.05;
  const tailFin = mesh(new THREE.BoxGeometry(0.1, 0.82, 0.72), 0xd5b84d, 'care-aircraft-tail-fin');
  tailFin.position.set(0, 0.42, 2.15);
  const cargoLight = mesh(new THREE.SphereGeometry(0.08, 8, 6), 0x7fe6e0, 'care-aircraft-cargo-light');
  cargoLight.position.set(0, -0.45, -0.15);
  const forwardSocket = presentationSocket('care-aircraft-forward-socket', [0, 0, -2.6]);
  root.add(fuselage, nose, wing, tailWing, tailFin, cargoLight, forwardSocket);
  root.userData.forwardAxis = [0, 0, -1];
  root.scale.setScalar(0.9);
  return Object.freeze({ root, rotor: null, target: new THREE.Vector3(), mixer: null });
}

function buildDrone(mode: 'piloted' | 'swarm' | null): PresentedEntity {
  if (hunterDroneTemplate && hunterDroneLoadState === 'ready') {
    const root = hunterDroneTemplate.clone(true);
    root.name = mode === 'piloted' ? 'pass65-piloted-drone' : 'pass65-swarm-drone';
    root.scale.setScalar(HUNTER_DRONE_TARGET_MAX_DIMENSION / Math.max(0.001, hunterDroneSourceMaxDimension));
    root.userData.pass65KillstreakPresentation = true;
    root.userData.authoredHunterDrone = true;
    root.userData.presentationFamilyId = DRONE_PRESENTATION_FAMILY_ID;
    root.userData.gunProfileId = DRONE_GUN_PROFILE_ID;
    root.userData.forwardAxis = [0, 0, -1];
    root.userData.weaponFeedback = [...SUPPORT_WEAPON_FEEDBACK_CONTRACT];
    markSharedPresentationAsset(root);
    const mixer = new THREE.AnimationMixer(root);
    const propellers = hunterDroneAnimations.find((clip) => clip.name === 'Drone_Propellers_Loop');
    if (propellers) mixer.clipAction(propellers).play();
    return Object.freeze({ root, rotor: null, target: new THREE.Vector3(), mixer });
  }
  const root = new THREE.Group();
  root.name = mode === 'piloted' ? 'pass65-piloted-drone' : 'pass65-swarm-drone';
  root.userData.pass65KillstreakPresentation = true;
  root.userData.presentationFamilyId = DRONE_PRESENTATION_FAMILY_ID;
  root.userData.gunProfileId = DRONE_GUN_PROFILE_ID;
  root.userData.forwardAxis = [0, 0, -1];
  root.userData.weaponFeedback = [...SUPPORT_WEAPON_FEEDBACK_CONTRACT];
  // Standalone and swarm drones deliberately share the same machine family;
  // control mode changes no geometry, gun profile, socket, or forward axis.
  const body = mesh(new THREE.CapsuleGeometry(0.22, 0.42, 5, 12), 0x28383d, 'drone-body');
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.18, 0.82, 1);
  const eye = mesh(new THREE.SphereGeometry(0.08, 8, 6), 0xff5f4b, 'drone-optic');
  eye.position.set(0, 0.035, -0.43);
  const gun = new THREE.Group();
  gun.name = 'drone-mounted-gun';
  gun.position.set(0, -0.19, -0.12);
  const gunReceiver = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), 0x11191c, 'drone-gun-receiver');
  const gunBarrel = mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.42, 10), 0x090d0f, 'drone-gun-barrel');
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.z = -0.3;
  gun.add(gunReceiver, gunBarrel);
  const muzzleSocket = presentationSocket('drone-gun-muzzle-socket', [0, -0.19, -0.56]);
  const cameraSocket = presentationSocket('drone-first-person-camera-socket', [0, 0.035, -0.34]);
  const rotor = new THREE.Group();
  rotor.name = 'drone-rotors';
  for (const x of [-0.42, 0.42]) for (const z of [-0.34, 0.34]) {
    const arm = mesh(new THREE.BoxGeometry(0.5, 0.035, 0.04), 0x172126, 'drone-arm');
    arm.position.set(x * 0.55, 0, z * 0.55);
    arm.rotation.y = Math.atan2(z, x);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 12), material(0x0d1417, { transparent: true, opacity: 0.72 }));
    disc.name = 'drone-rotor-disc';
    disc.position.set(x, 0.08, z);
    rotor.add(arm, disc);
  }
  root.add(body, eye, gun, muzzleSocket, cameraSocket, rotor);
  return Object.freeze({ root, rotor, target: new THREE.Vector3(), mixer: null });
}

function buildCareCrate(): PresentedEntity {
  const root = new THREE.Group();
  root.name = 'pass65-care-package';
  root.userData.pass65KillstreakPresentation = true;
  root.userData.interactable = true;
  root.userData.interactionPrompt = 'F TO COLLECT KILLSTREAK';
  const crate = mesh(new THREE.BoxGeometry(1.05, 0.75, 1.05), 0x4e604d, 'care-package-crate');
  crate.userData.interactable = true;
  crate.userData.interactionPrompt = 'F TO COLLECT KILLSTREAK';
  const straps = mesh(new THREE.BoxGeometry(1.1, 0.79, 0.12), 0xe0b94f, 'care-package-straps');
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), material(0xd7dad0, { transparent: true, opacity: 0.82 }));
  canopy.name = 'care-package-parachute';
  canopy.position.y = 2.4;
  canopy.scale.y = 0.45;
  root.add(crate, straps, canopy);
  return Object.freeze({ root, rotor: canopy, target: new THREE.Vector3(), mixer: null });
}

function createPresentedEntity(entity: KillstreakEntitySnapshot): PresentedEntity {
  if (entity.kind === 'aircraft') return buildCareAircraft();
  if (entity.kind === 'chopper') return buildChopper();
  if (entity.kind === 'drone') return buildDrone(entity.mode);
  return buildCareCrate();
}

function buildDroneSensorSilhouette(index: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `piloted-drone-hostile-sensor-${index + 1}`;
  root.userData.presentationOnly = true;
  const sensorMaterial = new THREE.MeshBasicMaterial({
    name: 'piloted-drone-hostile-through-wall',
    color: 0xff674f,
    transparent: true,
    opacity: 0.62,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const part = (name: string, geometry: THREE.BufferGeometry, position: readonly [number, number, number]) => {
    const result = new THREE.Mesh(geometry, sensorMaterial);
    result.name = name;
    result.position.set(...position);
    result.renderOrder = 90;
    root.add(result);
  };
  part('drone-sensor-head', new THREE.SphereGeometry(0.2, 9, 6), [0, 0.68, 0]);
  part('drone-sensor-torso', new THREE.CapsuleGeometry(0.27, 0.48, 3, 8), [0, 0.18, 0]);
  part('drone-sensor-leg-left', new THREE.CapsuleGeometry(0.1, 0.56, 2, 6), [-0.14, -0.51, 0]);
  part('drone-sensor-leg-right', new THREE.CapsuleGeometry(0.1, 0.56, 2, 6), [0.14, -0.51, 0]);
  root.visible = false;
  return root;
}

function placementMarkerMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xff253f,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function buildPlacementMarker(marker: KillstreakPlacementMarkerSnapshot): THREE.Group {
  const root = new THREE.Group();
  root.name = `support-placement-${marker.shape}`;
  root.userData.presentationOnly = true;
  root.userData.markerId = marker.id;
  root.userData.activationId = marker.activationId;
  root.userData.source = marker.source;
  root.userData.audience = marker.audience;
  root.raycast = () => undefined;
  if (marker.shape === 'ground-x') {
    root.position.fromArray(marker.anchor);
    root.position.y += 0.055;
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.035, 0.34), placementMarkerMaterial(0.88));
      bar.name = 'support-target-x-bar';
      bar.rotation.y = angle;
      bar.renderOrder = 18;
      bar.raycast = () => undefined;
      root.add(bar);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.68, 48), placementMarkerMaterial(0.58));
    ring.name = 'support-target-x-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 18;
    ring.raycast = () => undefined;
    root.add(ring);
  } else if (marker.pathStart && marker.pathEnd) {
    const start = new THREE.Vector3(...marker.pathStart);
    const end = new THREE.Vector3(...marker.pathEnd);
    const delta = end.clone().sub(start);
    const length = Math.max(0.1, Math.hypot(delta.x, delta.z));
    root.position.copy(start).lerp(end, 0.5);
    root.position.y = marker.anchor[1] + 0.065;
    root.rotation.y = -Math.atan2(delta.z, delta.x);
    const corridorWidthM = Math.max(0.2, (marker.halfWidthM ?? 0.1) * 2);
    root.userData.halfWidthM = marker.halfWidthM;
    const corridor = new THREE.Mesh(new THREE.BoxGeometry(length, 0.03, corridorWidthM), placementMarkerMaterial(0.32));
    corridor.name = 'carpet-bomber-flight-corridor';
    corridor.renderOrder = 17;
    corridor.raycast = () => undefined;
    const centre = new THREE.Mesh(new THREE.BoxGeometry(length, 0.045, 0.18), placementMarkerMaterial(0.92));
    centre.name = 'carpet-bomber-flight-centreline';
    centre.renderOrder = 18;
    centre.raycast = () => undefined;
    root.add(corridor, centre);
  }
  return root;
}

function disposeRoot(root: THREE.Object3D): void {
  root.removeFromParent();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const entry of materials) entry.dispose();
  });
}

export class KillstreakPresentation {
  readonly root = new THREE.Group();
  private readonly entities = new Map<string, PresentedEntity>();
  private readonly impactFlashes: Array<{ root: THREE.Mesh; expiresAt: number }> = [];
  private readonly prewarmed: PresentedEntity[];
  private readonly sensorRoot = new THREE.Group();
  private readonly sensorSilhouettes: THREE.Group[];
  private visibleSensorContacts = 0;
  private firstPersonEntityId: string | null = null;
  private readonly placementMarkers = new Map<string, PresentedPlacementMarker>();
  private readonly locallyExpiredMarkerRevisions = new Map<string, number>();

  constructor(
    scene: THREE.Scene,
    private readonly retireRoot: KillstreakPresentationRetireRoot = disposeRoot,
  ) {
    this.root.name = 'pass65-killstreak-presentations';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);
    // Keep one instance of every material/geometry vocabulary resident so the
    // first earned streak does not discover shaders on a live combat frame.
    this.prewarmed = [buildChopper(), buildCareAircraft(), buildDrone('piloted'), buildDrone('swarm'), buildCareCrate()];
    for (const entry of this.prewarmed) {
      entry.root.name = `prewarmed-${entry.root.name}`;
      entry.root.userData.prewarmed = true;
      entry.root.scale.setScalar(0.0001);
      this.root.add(entry.root);
    }
    this.sensorRoot.name = 'piloted-drone-through-wall-sensor';
    this.sensorRoot.userData.presentationOnly = true;
    this.sensorSilhouettes = Array.from({ length: MAX_SENSOR_CONTACTS }, (_, index) => buildDroneSensorSilhouette(index));
    this.sensorRoot.add(...this.sensorSilhouettes);
    this.root.add(this.sensorRoot);
  }

  sync(snapshot: KillstreakRecipientSnapshot, nowMs: number): void {
    const admitted = snapshot.entities.slice(0, MAX_PRESENTED_ENTITIES);
    const liveIds = new Set(admitted.map((entity) => entity.id));
    for (const [id, presented] of this.entities) {
      if (liveIds.has(id)) continue;
      this.retireRoot(presented.root);
      this.entities.delete(id);
    }
    for (const entity of admitted) {
      let presented = this.entities.get(entity.id);
      if (!presented) {
        presented = createPresentedEntity(entity);
        this.entities.set(entity.id, presented);
        this.root.add(presented.root);
        presented.root.position.fromArray(entity.position);
      }
      setSupportFirstPersonVisibility(presented.root, entity.id === this.firstPersonEntityId);
      presented.target.fromArray(entity.position);
      presented.root.position.lerp(presented.target, 0.38);
      presented.root.rotation.set(entity.attitude[0], entity.attitude[1], entity.attitude[2], 'YXZ');
      presented.mixer?.setTime(nowMs / 1_000);
      if (presented.rotor) presented.rotor.rotation.y += entity.kind === 'chopper' ? 0.72 : 1.1;
      const tailRotor = presented.root.getObjectByName('chopper-tail-rotor');
      if (tailRotor) tailRotor.rotation.x += 1.35;
      const firstPersonRotor = presented.root.getObjectByName('chopper-first-person-rotor');
      if (firstPersonRotor) firstPersonRotor.rotation.y += 0.92;
      const canopy = presented.root.getObjectByName('care-package-parachute');
      if (canopy) canopy.visible = entity.phase === 'inbound' || entity.phase === 'descending';
      presented.root.userData.health = entity.health;
      presented.root.userData.phase = entity.phase;
      presented.root.userData.gunController = entity.gunController;
    }
    this.syncSensorContacts(snapshot.sensorContacts);
    this.syncPlacementMarkers(snapshot.placementMarkers, snapshot.revision, nowMs);
    for (let index = this.impactFlashes.length - 1; index >= 0; index -= 1) {
      const flash = this.impactFlashes[index];
      const remaining = THREE.MathUtils.clamp((flash.expiresAt - nowMs) / 420, 0, 1);
      flash.root.scale.setScalar(1 + (1 - remaining) * 2.8);
      (flash.root.material as THREE.MeshBasicMaterial).opacity = remaining * 0.8;
      if (remaining > 0) continue;
      this.retireRoot(flash.root);
      this.impactFlashes.splice(index, 1);
    }
  }

  private syncSensorContacts(contacts: readonly DroneSensorContact[]): void {
    const admitted = contacts.slice(0, MAX_SENSOR_CONTACTS);
    this.visibleSensorContacts = admitted.length;
    for (const [index, silhouette] of this.sensorSilhouettes.entries()) {
      const contact = admitted[index];
      silhouette.visible = contact !== undefined;
      if (!contact) continue;
      silhouette.position.fromArray(contact.position);
      silhouette.userData.contactId = contact.id;
      silhouette.userData.contactLifeId = contact.lifeId;
      silhouette.userData.relation = contact.relation;
      silhouette.userData.throughWall = contact.throughWall;
    }
  }

  private syncPlacementMarkers(
    markers: readonly KillstreakPlacementMarkerSnapshot[],
    snapshotRevision: number,
    nowMs: number,
  ): void {
    for (const [id, presented] of this.placementMarkers) {
      if (nowMs < presented.expiresAtMs) continue;
      this.retireRoot(presented.root);
      this.placementMarkers.delete(id);
      this.locallyExpiredMarkerRevisions.set(id, presented.snapshotRevision);
    }
    const markerIds = new Set(markers.map((marker) => marker.id));
    for (const [id, expiredRevision] of this.locallyExpiredMarkerRevisions) {
      if (!markerIds.has(id) || snapshotRevision > expiredRevision) this.locallyExpiredMarkerRevisions.delete(id);
    }
    const admitted = markers
      .filter((marker) => marker.expiresInMs > 0 && this.locallyExpiredMarkerRevisions.get(marker.id) !== snapshotRevision)
      .slice(0, MAX_PLACEMENT_MARKERS);
    const liveIds = new Set(admitted.map((marker) => marker.id));
    for (const [id, presented] of this.placementMarkers) {
      if (liveIds.has(id)) continue;
      this.retireRoot(presented.root);
      this.placementMarkers.delete(id);
    }
    for (const marker of admitted) {
      const existing = this.placementMarkers.get(marker.id);
      if (existing) {
        existing.snapshot = marker;
        if (existing.snapshotRevision !== snapshotRevision) {
          existing.snapshotRevision = snapshotRevision;
          existing.expiresAtMs = nowMs + marker.expiresInMs;
        }
        continue;
      }
      const root = buildPlacementMarker(marker);
      this.placementMarkers.set(marker.id, {
        root,
        snapshot: marker,
        snapshotRevision,
        expiresAtMs: nowMs + marker.expiresInMs,
      });
      this.root.add(root);
    }
  }

  presentImpacts(impacts: readonly KillstreakImpactEvent[], nowMs: number): void {
    for (const impact of impacts.slice(0, Math.max(0, MAX_IMPACT_FLASHES - this.impactFlashes.length))) {
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 10, 7),
        new THREE.MeshBasicMaterial({ color: 0xffb14c, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      flash.name = 'pass65-carpet-impact-flash';
      flash.position.fromArray(impact.position);
      flash.position.y += 0.35;
      this.root.add(flash);
      this.impactFlashes.push({ root: flash, expiresAt: nowMs + 420 });
    }
  }

  entityRoot(id: string): THREE.Group | null {
    return this.entities.get(id)?.root ?? null;
  }

  setFirstPersonEntity(id: string | null): void {
    this.firstPersonEntityId = id;
    for (const [entityId, presented] of this.entities) setSupportFirstPersonVisibility(presented.root, entityId === id);
  }

  firstPersonCameraAnchor(id: string): THREE.Vector3 | null {
    const root = this.entities.get(id)?.root;
    if (!root) return null;
    const socket = root.getObjectByName('drone-first-person-camera-socket')
      ?? root.getObjectByName('chopper-first-person-camera-socket');
    if (!socket) return null;
    root.updateMatrixWorld(true);
    const anchor = socket.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(socket.getWorldQuaternion(new THREE.Quaternion()));
    return anchor.addScaledVector(forward, 0.08);
  }

  alignFirstPersonCockpit(id: string, cameraWorldQuaternion: THREE.Quaternion): void {
    const root = this.entities.get(id)?.root;
    const cockpit = root?.getObjectByName('chopper-first-person-cockpit');
    if (!root || !cockpit) return;
    root.updateWorldMatrix(true, false);
    const inverseParent = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    cockpit.quaternion.copy(inverseParent.multiply(cameraWorldQuaternion));
  }

  telemetry(): KillstreakPresentationTelemetry {
    const markerDetails = [...this.placementMarkers.values()]
      .sort((left, right) => left.snapshot.id.localeCompare(right.snapshot.id))
      .map(({ root, snapshot }): KillstreakPlacementMarkerTelemetry => {
        root.updateWorldMatrix(true, true);
        const worldPosition = root.getWorldPosition(new THREE.Vector3()).toArray();
        const worldBounds = new THREE.Box3().setFromObject(root);
        const meshNames: string[] = [];
        const colourHexes = new Set<string>();
        let depthTest = true;
        root.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          meshNames.push(node.name);
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const entry of materials) {
            if ('color' in entry && entry.color instanceof THREE.Color) colourHexes.add(`#${entry.color.getHexString()}`);
            depthTest &&= entry.depthTest;
          }
        });
        const corridorLengthM = snapshot.pathStart && snapshot.pathEnd
          ? Math.hypot(snapshot.pathEnd[0] - snapshot.pathStart[0], snapshot.pathEnd[2] - snapshot.pathStart[2])
          : null;
        return Object.freeze({
          id: snapshot.id,
          activationId: snapshot.activationId,
          source: snapshot.source,
          shape: snapshot.shape,
          audience: snapshot.audience,
          ownerId: snapshot.ownerId,
          anchor: Object.freeze([...snapshot.anchor]),
          pathStart: snapshot.pathStart ? Object.freeze([...snapshot.pathStart]) : null,
          pathEnd: snapshot.pathEnd ? Object.freeze([...snapshot.pathEnd]) : null,
          halfWidthM: snapshot.halfWidthM,
          worldPosition: Object.freeze(worldPosition),
          worldBounds: Object.freeze({
            min: Object.freeze(worldBounds.min.toArray()),
            max: Object.freeze(worldBounds.max.toArray()),
          }),
          corridorLengthM,
          meshNames: Object.freeze(meshNames.sort()),
          colourHexes: Object.freeze([...colourHexes].sort()),
          depthTest,
          visible: root.visible && root.parent !== null,
        });
      });
    return Object.freeze({
      entities: this.entities.size,
      impactFlashes: this.impactFlashes.length,
      sensorContacts: this.visibleSensorContacts,
      placementMarkers: this.placementMarkers.size,
      markerDetails: Object.freeze(markerDetails),
      bounded: this.entities.size <= MAX_PRESENTED_ENTITIES
        && this.impactFlashes.length <= MAX_IMPACT_FLASHES
        && this.visibleSensorContacts <= MAX_SENSOR_CONTACTS
        && this.placementMarkers.size <= MAX_PLACEMENT_MARKERS,
    });
  }

  clear(): void {
    this.firstPersonEntityId = null;
    for (const presented of this.entities.values()) this.retireRoot(presented.root);
    this.entities.clear();
    for (const flash of this.impactFlashes) this.retireRoot(flash.root);
    this.impactFlashes.length = 0;
    this.visibleSensorContacts = 0;
    for (const silhouette of this.sensorSilhouettes) silhouette.visible = false;
    for (const presented of this.placementMarkers.values()) this.retireRoot(presented.root);
    this.placementMarkers.clear();
    this.locallyExpiredMarkerRevisions.clear();
  }

  dispose(): void {
    this.clear();
    for (const entry of this.prewarmed) this.retireRoot(entry.root);
    this.retireRoot(this.sensorRoot);
    this.root.removeFromParent();
  }
}
