import * as THREE from 'three';
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

const standard = (color: number, roughness = 0.86, metalness = 0.08): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  options: { solid?: boolean; shots?: boolean; rotation?: [number, number, number]; cast?: boolean } = {},
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
  builder.root.add(mesh);
  const solid = options.solid !== false;
  const shots = options.shots ?? solid;
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

/**
 * Original compact industrial tower duel. It translates the high-level pacing
 * of classic small vertical arenas without reproducing any commercial layout.
 */
export function buildRustworks1v1(scene: THREE.Scene): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Rustworks 1V1 arena';
  scene.add(root);
  const builder: Builder = { root, colliders: [], physicsColliders: [], raycastMeshes: [] };
  const sand = standard(0x8f6546, 1, 0);
  const rust = standard(0x7a3924, 0.82, 0.42);
  const rustDark = standard(0x3c2924, 0.9, 0.35);
  const steel = standard(0x59656a, 0.58, 0.62);
  const hazard = standard(0xd7972d, 0.72, 0.34);
  const concrete = standard(0x77756d, 0.98, 0.03);
  const tarp = standard(0x315665, 0.94, 0.02);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(56, 60), sand);
  ground.name = 'rustworks-compacted-earth';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.impactSurface = 'soil';
  root.add(ground);
  builder.raycastMeshes.push(ground);

  // Perimeter corrugated barrier — broken sightlines rather than a copied wall ring.
  for (const [x, z, sx, sz] of [
    [0, -29.5, 56, 1], [0, 29.5, 56, 1], [-27.5, 0, 1, 60], [27.5, 0, 1, 60],
  ] as const) box(builder, 'rustworks-perimeter-sheeting', [x, 2.2, z], [sx, 4.4, sz], rustDark);

  // Original four-leg processing tower with two readable combat decks.
  for (const x of [-3.2, 3.2]) for (const z of [-3.2, 3.2]) {
    box(builder, 'rustworks-tower-leg', [x, 3.4, z], [0.52, 6.8, 0.52], steel);
  }
  box(builder, 'rustworks-lower-deck', [0, 2.65, 0], [8.4, 0.34, 8.4], steel);
  box(builder, 'rustworks-upper-deck', [0, 5.45, 0], [6.8, 0.34, 6.8], rust);
  box(builder, 'rustworks-control-hut', [0.7, 6.55, 0.4], [3.6, 2.0, 3.3], rustDark);
  box(builder, 'rustworks-lower-ramp', [0, 1.35, -7.3], [3.1, 0.34, 8.5], steel, { rotation: [-0.31, 0, 0] });
  box(builder, 'rustworks-upper-ramp', [5.7, 4.0, 0], [7.0, 0.34, 2.5], rust, { rotation: [0, 0, -0.39] });
  for (const x of [-4.1, 4.1]) box(builder, 'rustworks-deck-rail', [x, 3.45, 0], [0.16, 1.4, 8.2], hazard, { solid: false });
  box(builder, 'rustworks-crane-boom', [-5.5, 9.2, 0], [11.5, 0.38, 0.38], steel, { solid: false });
  box(builder, 'rustworks-crane-cable', [-10.9, 6.2, 0], [0.12, 6.2, 0.12], rustDark, { solid: false });

  // Asymmetric outer cover keeps each rotation distinct.
  for (const [x, z, color] of [
    [-18, -18, tarp], [-13.5, -18, rust], [17, 19, hazard], [12.5, 19, rustDark],
  ] as const) box(builder, 'rustworks-freight-crate', [x, 1.25, z], [4.0, 2.5, 7.2], color);
  for (const [x, z] of [[-19, 9], [19, -10]] as const) {
    box(builder, 'rustworks-tank-collider', [x, 1.7, z], [4.0, 3.4, 4.0], steel);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3.2, 12), rust);
    tank.name = 'rustworks-horizontal-process-tank';
    tank.rotation.z = Math.PI / 2;
    tank.position.set(x, 1.7, z);
    tank.castShadow = true;
    tank.receiveShadow = true;
    tank.userData.presentationOnly = true;
    root.add(tank);
  }
  for (const [x, z, sx, sz] of [
    [-9, 12, 6, 2.1], [10, -14, 7, 2.1], [-15, -3, 3.8, 2.6], [15, 4, 3.8, 2.6],
    [-5.5, 20, 5.2, 2.0], [6, -22, 5.2, 2.0],
  ] as const) box(builder, 'rustworks-scrap-cover', [x, 1.0, z], [sx, 2.0, sz], concrete);
  for (const [x, z] of [[-8.5, -11], [9, 11], [-20, 20], [20, -20]] as const) {
    box(builder, 'rustworks-pipe-bundle-collider', [x, 0.8, z], [3.2, 1.6, 3.2], rustDark);
    for (const offset of [-0.85, 0, 0.85]) {
      const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.12, 6, 12), steel);
      pipe.name = 'rustworks-pipe-opening';
      pipe.position.set(x + offset, 0.82, z - 1.62);
      pipe.rotation.x = Math.PI / 2;
      pipe.userData.presentationOnly = true;
      root.add(pipe);
    }
  }

  const labelBoard = box(builder, 'rustworks-original-arena-sign', [0, 8.0, 2.15], [3.8, 0.72, 0.12], hazard, { solid: false, shots: false });
  labelBoard.userData.label = 'RUSTWORKS 1V1';

  return {
    id: 'rustworks-1v1',
    label: 'Rustworks 1V1',
    root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    spawns: spawnRecord(
      [[-21, 23], [-15, 24], [-22, 15], [-11, 20]],
      [[21, -23], [15, -24], [22, -15], [11, -20]],
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
  plate.position.y = 1.65;
  plate.rotation.x = Math.PI / 2;
  const bullseye = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.135, 20), standard(0xf5eee0, 0.48, 0.18));
  bullseye.name = 'range-bullseye';
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
  targets.push({ id, root, active: true, respawnAt: 0, scoreValue, distanceBand });
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
  box(builder, 'gun-range-firing-line', [0, 0.05, 1.2], [30, 0.1, 0.5], safety, { solid: false, shots: false });
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
