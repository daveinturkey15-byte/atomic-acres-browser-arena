import * as THREE from 'three';
import { GPU_SHARED_GEOMETRY_KEY } from './gpu-resource-ownership';

export const PASS70_DRONE_SWARM_LOGO_CONTRACT = Object.freeze({
  id: 'black-field-white-hollow-ring-open-chevron-v1',
  canvasSize: 512,
  background: '#000000',
  foreground: '#ffffff',
  ring: Object.freeze({ centerX: 256, centerY: 236, radius: 50, lineWidth: 18 }),
  chevron: Object.freeze([
    Object.freeze([194, 309] as const),
    Object.freeze([204, 292] as const),
    Object.freeze([256, 314] as const),
    Object.freeze([308, 292] as const),
    Object.freeze([318, 309] as const),
    Object.freeze([256, 335] as const),
  ]),
});

export const PASS70_DRONE_SWARM_BODY_MARK_CONTRACT = Object.freeze({
  id: 'drone-body-black-field-white-hollow-ring-open-chevron-v1',
  fieldSizeM: 0.28,
  surfaceGapM: 0.004,
  ring: Object.freeze({ innerRadiusM: 0.057, outerRadiusM: 0.079, centerY: 0.047 }),
  chevron: Object.freeze([
    Object.freeze([-0.094, -0.025] as const),
    Object.freeze([-0.079, -0.054] as const),
    Object.freeze([0, -0.091] as const),
    Object.freeze([0.079, -0.054] as const),
    Object.freeze([0.094, -0.025] as const),
    Object.freeze([0.079, 0.004] as const),
    Object.freeze([0, -0.033] as const),
    Object.freeze([-0.079, 0.004] as const),
  ]),
});

const BODY_MARK_GEOMETRY_OWNER = PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.id;
const bodyMarkFieldGeometry = new THREE.PlaneGeometry(
  PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.fieldSizeM,
  PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.fieldSizeM,
);
const bodyMarkRingGeometry = new THREE.RingGeometry(
  PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.ring.innerRadiusM,
  PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.ring.outerRadiusM,
  32,
).translate(0, PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.ring.centerY, 0);
const bodyMarkChevronShape = new THREE.Shape();
const [bodyMarkChevronFirst, ...bodyMarkChevronRest] = PASS70_DRONE_SWARM_BODY_MARK_CONTRACT.chevron;
bodyMarkChevronShape.moveTo(bodyMarkChevronFirst![0], bodyMarkChevronFirst![1]);
for (const point of bodyMarkChevronRest) bodyMarkChevronShape.lineTo(point[0], point[1]);
bodyMarkChevronShape.closePath();
const bodyMarkChevronGeometry = new THREE.ShapeGeometry(bodyMarkChevronShape);
for (const geometry of [bodyMarkFieldGeometry, bodyMarkRingGeometry, bodyMarkChevronGeometry]) {
  geometry.userData[GPU_SHARED_GEOMETRY_KEY] = BODY_MARK_GEOMETRY_OWNER;
}

const bodyMarkFieldMaterial = new THREE.MeshBasicMaterial({
  name: 'MAT_Pass70_DroneSwarmLogo_BlackField',
  color: 0x000000,
  depthTest: true,
  depthWrite: true,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const bodyMarkWhiteMaterial = new THREE.MeshBasicMaterial({
  name: 'MAT_Pass70_DroneSwarmLogo_WhiteMark',
  color: 0xffffff,
  depthTest: true,
  depthWrite: true,
  toneMapped: false,
});

function createDroneSwarmBodyMark(name: string): THREE.Group {
  const root = new THREE.Group();
  root.name = name;
  root.userData.presentationOnly = true;
  root.userData.pass70DroneSwarmBodyLogo = true;

  const field = new THREE.Mesh(bodyMarkFieldGeometry, bodyMarkFieldMaterial);
  field.name = `${name}-black-field`;
  const ring = new THREE.Mesh(bodyMarkRingGeometry, bodyMarkWhiteMaterial);
  ring.name = `${name}-hollow-ring`;
  ring.position.z = 0.002;
  const chevron = new THREE.Mesh(bodyMarkChevronGeometry, bodyMarkWhiteMaterial);
  chevron.name = `${name}-open-chevron`;
  chevron.position.z = 0.002;
  for (const mesh of [field, ring, chevron]) {
    mesh.userData.presentationOnly = true;
    mesh.userData.pass70DroneSwarmBodyLogo = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 22;
    mesh.raycast = () => undefined;
  }
  root.add(field, ring, chevron);
  return root;
}

/** Adds body-bound marks to both visible hemispheres without billboard behaviour. */
export function attachPass70DroneSwarmBodyMarks(root: THREE.Object3D): readonly THREE.Group[] {
  const existing = root.children.filter((child): child is THREE.Group => (
    child instanceof THREE.Group && child.userData.pass70DroneSwarmBodyLogo === true
  ));
  if (existing.length > 0) return Object.freeze(existing);
  const body = root.getObjectByName('drone-body');
  if (!body) throw new TypeError('Pass 70 Drone Swarm body mark requires the canonical drone-body node');

  root.updateWorldMatrix(true, true);
  const findBodyMesh = (prefix: string): THREE.Mesh | null => {
    let match: THREE.Mesh | null = null;
    body.traverse((node) => {
      if (!match && node instanceof THREE.Mesh && node.name.startsWith(prefix)) match = node;
    });
    return match;
  };
  // Antennae are body descendants but are not a decal surface. The authored
  // top-armour and hull meshes provide the real skin planes; procedural
  // fallback geometry intentionally uses the body itself.
  const topSurface = findBodyMesh('Drone_TopArmor_') ?? body;
  const bottomSurface = findBodyMesh('Drone_Hull_') ?? body;
  const topBounds = new THREE.Box3().setFromObject(topSurface);
  const bottomBounds = new THREE.Box3().setFromObject(bottomSurface);
  if (topBounds.isEmpty() || bottomBounds.isEmpty()) {
    throw new TypeError('Pass 70 Drone Swarm body mark requires finite body bounds');
  }
  const topCentre = topBounds.getCenter(new THREE.Vector3());
  const bottomCentre = bottomBounds.getCenter(new THREE.Vector3());
  const contract = PASS70_DRONE_SWARM_BODY_MARK_CONTRACT;
  const top = createDroneSwarmBodyMark('pass70-drone-swarm-body-logo-top');
  const bottom = createDroneSwarmBodyMark('pass70-drone-swarm-body-logo-bottom');
  const topWorld = topCentre.clone().setY(topBounds.max.y + contract.surfaceGapM);
  const bottomWorld = bottomCentre.clone().setY(bottomBounds.min.y - contract.surfaceGapM);
  top.position.copy(root.worldToLocal(topWorld));
  bottom.position.copy(root.worldToLocal(bottomWorld));
  top.rotation.x = -Math.PI / 2;
  bottom.rotation.x = Math.PI / 2;
  root.add(top, bottom);
  root.userData.pass70DroneSwarmBodyLogo = contract.id;
  return Object.freeze([top, bottom]);
}

/** Draws the owner-provided hollow-ring/open-chevron mark without extra eye or flame styling. */
export function drawPass70DroneSwarmLogo(context: CanvasRenderingContext2D): void {
  const contract = PASS70_DRONE_SWARM_LOGO_CONTRACT;
  context.fillStyle = contract.background;
  context.fillRect(0, 0, contract.canvasSize, contract.canvasSize);

  context.strokeStyle = contract.foreground;
  context.lineWidth = contract.ring.lineWidth;
  context.beginPath();
  context.arc(contract.ring.centerX, contract.ring.centerY, contract.ring.radius, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = contract.foreground;
  context.beginPath();
  const [first, ...rest] = contract.chevron;
  context.moveTo(first![0], first![1]);
  for (const point of rest) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fill();
}
