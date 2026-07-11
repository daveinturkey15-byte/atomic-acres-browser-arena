import * as THREE from 'three';
import { Box2 } from './collision';
import { Team } from './protocol';

export type PracticeTarget = { id: string; root: THREE.Group; active: boolean; respawnAt: number };
export type ArenaMap = {
  colliders: Box2[];
  raycastMeshes: THREE.Object3D[];
  spawns: Record<Team, THREE.Vector3[]>;
  targets: PracticeTarget[];
  bounds: Box2;
};

const material = (color: number, roughness = 0.78, metalness = 0.03) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

export function buildArena(scene: THREE.Scene): ArenaMap {
  const colliders: Box2[] = [];
  const raycastMeshes: THREE.Object3D[] = [];
  const targets: PracticeTarget[] = [];
  const world = new THREE.Group();
  world.name = 'Atomic Acres arena';
  scene.add(world);

  const palette = {
    grass: material(0x6b8b50, 1),
    grassDark: material(0x47683d, 1),
    road: material(0x31363b, 0.96),
    concrete: material(0xc8c1ab, 0.92),
    cream: material(0xe4d2ad, 0.82),
    aqua: material(0x4ba7a5, 0.72),
    coral: material(0xd86856, 0.72),
    mustard: material(0xe0ad3d, 0.66, 0.08),
    dark: material(0x252a31, 0.82, 0.12),
    timber: material(0x7a4f32, 0.96),
    glass: new THREE.MeshStandardMaterial({ color: 0x8bc7d4, roughness: 0.16, transparent: true, opacity: 0.55 }),
    white: material(0xf4ead5, 0.75),
    chrome: material(0xb6c4c9, 0.25, 0.72),
  };

  function box(
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    mat: THREE.Material,
    solid = true,
    cast = true,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    world.add(mesh);
    raycastMeshes.push(mesh);
    if (solid) {
      colliders.push({
        minX: position[0] - size[0] / 2,
        maxX: position[0] + size[0] / 2,
        minZ: position[2] - size[2] / 2,
        maxZ: position[2] + size[2] / 2,
        minY: position[1] - size[1] / 2,
        maxY: position[1] + size[1] / 2,
      });
    }
    return mesh;
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 120), palette.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(19, 104), palette.road);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.025;
  road.receiveShadow = true;
  world.add(road);
  for (const x of [-10.25, 10.25]) box('curb', [x, 0.12, 0], [1.4, 0.24, 104], palette.concrete, false, false);
  for (let z = -46; z <= 46; z += 8) box('lane marker', [0, 0.055, z], [0.18, 0.03, 3.6], palette.mustard, false, false);

  function addHouse(team: Team, x: number, z: number, facing: 1 | -1): void {
    const accent = team === 0 ? palette.aqua : palette.coral;
    const frontZ = z + facing * 7.2;
    const backZ = z - facing * 7.2;
    // Ground-floor shell with front and rear doorways. Unlike the reference game,
    // this is an original, single-level playable footprint with a decorative upper storey.
    box('house side wall', [x - 8.1, 1.65, z], [0.45, 3.3, 14.8], accent);
    box('house side wall', [x + 8.1, 1.65, z], [0.45, 3.3, 14.8], accent);
    for (const wallZ of [frontZ, backZ]) {
      box('house wall', [x - 5.1, 1.65, wallZ], [6, 3.3, 0.45], accent);
      box('house wall', [x + 5.1, 1.65, wallZ], [6, 3.3, 0.45], accent);
      box('door lintel', [x, 3.05, wallZ], [4.2, 0.5, 0.45], accent, false);
    }
    box('house upper', [x, 5.35, z], [15.5, 4, 13.4], accent, false);
    box('house roof', [x, 7.7, z], [17.8, 0.8, 15.5], palette.dark, false);
    box('front porch', [x, 0.22, frontZ + facing * 1.4], [7.5, 0.44, 2.4], palette.concrete, false);
    box('rear deck', [x, 0.36, backZ - facing * 2], [10, 0.72, 3.5], palette.timber, true);
    box('picture window', [x - 4.1, 5.45, frontZ + facing * 0.24], [4.2, 1.8, 0.18], palette.glass, false, false);
    box('picture window', [x + 4.1, 5.45, frontZ + facing * 0.24], [4.2, 1.8, 0.18], palette.glass, false, false);
    box('balcony', [x, 4.1, backZ - facing * 1.1], [10, 0.4, 2.2], palette.concrete, false);
    box('chimney', [x + 5.4, 9.2, z - facing * 3], [1.4, 3.4, 1.4], palette.cream, false);
  }

  addHouse(0, -11, -34, 1);
  addHouse(1, 11, 34, -1);

  // Distinctive central silhouettes: an atomic-tour coach and a delivery truck.
  box('tour coach', [-3.8, 1.75, 7], [5.4, 3.5, 14], palette.mustard);
  box('coach roof', [-3.8, 3.62, 7], [5.15, 0.25, 13.2], palette.white, false);
  for (const z of [2.6, 6, 9.4, 12.8]) {
    box('coach window', [-6.53, 2.35, z], [0.12, 1.1, 2.3], palette.glass, false, false);
    box('coach window', [-1.07, 2.35, z], [0.12, 1.1, 2.3], palette.glass, false, false);
  }
  for (const z of [2, 12]) {
    for (const x of [-5.7, -1.9]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.38, 16), palette.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.7, z);
      world.add(wheel);
    }
  }

  box('delivery truck', [4.2, 1.55, -8], [4.8, 3.1, 8.8], palette.aqua);
  box('truck cab', [4.2, 1.35, -13], [4.8, 2.7, 3.4], palette.cream);
  box('truck windshield', [4.2, 2.05, -14.73], [3.5, 1.05, 0.1], palette.glass, false, false);

  // Garages and backyard flow lanes deliberately differ from the copyrighted map.
  box('north garage', [14, 1.7, -43.5], [12, 3.4, 6.5], palette.cream);
  box('south garage', [-14, 1.7, 43.5], [12, 3.4, 6.5], palette.cream);
  box('garage door', [14, 1.55, -40.2], [9, 2.7, 0.18], palette.chrome, false, false);
  box('garage door', [-14, 1.55, 40.2], [9, 2.7, 0.18], palette.chrome, false, false);

  // Lane cover creates short sightlines and quick flanks.
  const cover: Array<[number, number, number, number]> = [
    [-15, -13, 3.5, 2], [15, 13, 3.5, 2], [-17, 5, 3, 3], [17, -5, 3, 3],
    [-24, 20, 4, 2], [24, -20, 4, 2], [-27, -5, 3, 5], [27, 5, 3, 5],
  ];
  cover.forEach(([x, z, w, d], index) => box(`cover ${index}`, [x, 0.8, z], [w, 1.6, d], index % 2 ? palette.coral : palette.aqua));

  // Boundary fencing, with substantial visual posts rather than invisible walls.
  box('west fence', [-41.3, 1.5, 0], [0.6, 3, 104], palette.timber);
  box('east fence', [41.3, 1.5, 0], [0.6, 3, 104], palette.timber);
  box('north fence', [0, 1.5, -51.3], [83, 3, 0.6], palette.timber);
  box('south fence', [0, 1.5, 51.3], [83, 3, 0.6], palette.timber);
  for (let z = -47; z <= 47; z += 7) {
    box('fence post', [-40.9, 2.1, z], [0.8, 4.2, 0.8], palette.dark, false);
    box('fence post', [40.9, 2.1, z], [0.8, 4.2, 0.8], palette.dark, false);
  }

  function sign(text: string, x: number, y: number, z: number, rotationY = 0): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#13242b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#f3c34d';
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = '#f6ead6';
    ctx.font = '900 58px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.65), new THREE.MeshBasicMaterial({ map: texture }));
    board.position.set(x, y, z);
    board.rotation.y = rotationY;
    world.add(board);
  }
  sign('ATOMIC ACRES', 0, 4.7, -50.9, 0);
  sign('TEST BLOCK 86', 0, 4.7, 50.9, Math.PI);

  function target(id: string, x: number, z: number, team: Team): void {
    const root = new THREE.Group();
    root.name = 'practice-target';
    root.userData.targetId = id;
    root.position.set(x, 0, z);
    const targetMat = team === 0 ? palette.aqua : palette.coral;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.05, 5, 10), targetMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), palette.cream);
    head.position.y = 1.92;
    head.castShadow = true;
    root.add(torso, head);
    root.traverse((child) => { child.userData.targetRoot = root; });
    world.add(root);
    targets.push({ id, root, active: true, respawnAt: 0 });
  }
  target('north-yard', -24, -40, 1);
  target('north-lane', 21, -14, 1);
  target('south-yard', 24, 40, 0);
  target('south-lane', -21, 14, 0);
  target('mid-coach', 10, 4, 1);
  target('mid-truck', -10, -6, 0);

  // Street lamps and a few decorative trees add depth without texture downloads.
  for (const [x, z] of [[-13, -18], [13, 18], [-13, 26], [13, -26]] as Array<[number, number]>) {
    box('lamp pole', [x, 2.8, z], [0.15, 5.6, 0.15], palette.dark, false);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffefb5, emissive: 0xffb84d, emissiveIntensity: 2.2 }));
    lamp.position.set(x, 5.55, z);
    world.add(lamp);
  }
  for (const [x, z] of [[-33, -26], [33, 27], [-32, 34], [31, -36]] as Array<[number, number]>) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8), palette.timber);
    trunk.position.set(x, 2, z);
    trunk.castShadow = true;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), palette.grassDark);
    crown.position.set(x, 5.2, z);
    crown.castShadow = true;
    world.add(trunk, crown);
  }

  return {
    colliders,
    raycastMeshes,
    targets,
    bounds: { minX: -41, maxX: 41, minZ: -51, maxZ: 51 },
    spawns: {
      0: [new THREE.Vector3(-25, 1.7, -45), new THREE.Vector3(25, 1.7, -42), new THREE.Vector3(-30, 1.7, -18)],
      1: [new THREE.Vector3(25, 1.7, 45), new THREE.Vector3(-25, 1.7, 42), new THREE.Vector3(30, 1.7, 18)],
    },
  };
}
