import * as THREE from 'three';
import { texturedMaterial } from './art-kit';
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
    grass: texturedMaterial('./assets/original/textures/grass-turf.png', { roughness: 1, repeatX: 12, repeatY: 16 }),
    grassDark: texturedMaterial('./assets/original/textures/grass-turf.png', { color: 0x7e916a, roughness: 1, repeatX: 8, repeatY: 8 }),
    road: texturedMaterial('./assets/original/textures/asphalt-aged.png', { roughness: 0.98, repeatX: 5, repeatY: 20 }),
    concrete: texturedMaterial('./assets/original/textures/concrete-poured.png', { roughness: 0.94, repeatX: 3, repeatY: 3 }),
    cream: texturedMaterial('./assets/original/textures/brick-warm.png', { color: 0xf0ddbd, roughness: 0.86, repeatX: 4, repeatY: 2 }),
    aqua: texturedMaterial('./assets/original/textures/siding-aqua.png', { roughness: 0.76, repeatX: 4, repeatY: 4 }),
    coral: texturedMaterial('./assets/original/textures/siding-coral.png', { roughness: 0.76, repeatX: 4, repeatY: 4 }),
    mustard: material(0xd9a43b, 0.58, 0.18),
    dark: texturedMaterial('./assets/original/textures/weapon-gunmetal.png', { roughness: 0.56, metalness: 0.3, repeatX: 3, repeatY: 2 }),
    timber: texturedMaterial('./assets/original/textures/wood-deck.png', { roughness: 0.92, repeatX: 4, repeatY: 2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x78bad0, roughness: 0.1, metalness: 0.04, transparent: true, opacity: 0.54, transmission: 0.12 }),
    white: material(0xf0e4c9, 0.68),
    chrome: material(0xaebdc1, 0.23, 0.76),
    brick: texturedMaterial('./assets/original/textures/brick-warm.png', { roughness: 0.9, repeatX: 5, repeatY: 3 }),
    roof: texturedMaterial('./assets/original/textures/roof-shingles.png', { roughness: 0.86, repeatX: 5, repeatY: 6 }),
  };

  function box(
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    mat: THREE.Material,
    solid = true,
    cast = true,
    blocksShots = solid,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    world.add(mesh);
    if (blocksShots) raycastMeshes.push(mesh);
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

  function collisionProxy(name: string, position: [number, number, number], size: [number, number, number]): void {
    const proxy = box(name, position, size, palette.dark, true, true);
    proxy.visible = false;
    proxy.userData.collisionProxy = true;
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
  for (const x of [-12.6, 12.6]) box('sidewalk', [x, 0.07, 0], [3.2, 0.14, 104], palette.concrete, false, false);
  for (let z = -46; z <= 46; z += 8) box('lane marker', [0, 0.055, z], [0.18, 0.03, 3.6], palette.mustard, false, false);
  for (const z of [-22, 22]) {
    for (let x = -7.5; x <= 7.5; x += 2.5) box('crosswalk stripe', [x, 0.062, z], [1.4, 0.025, 3.2], palette.white, false, false);
  }

  function addHouse(team: Team, x: number, z: number, facing: 1 | -1): void {
    const accent = team === 0 ? palette.aqua : palette.coral;
    const frontZ = z + facing * 7.2;
    const backZ = z - facing * 7.2;
    const trim = palette.white;

    // Ground floor: real door openings, two-room interior and readable exterior trim.
    box('house-ground-side', [x - 8.1, 1.65, z], [0.45, 3.3, 14.8], accent);
    box('house-ground-side', [x + 8.1, 1.65, z], [0.45, 3.3, 14.8], accent);
    for (const wallZ of [frontZ, backZ]) {
      box('house-ground-wall', [x - 5.2, 1.65, wallZ], [5.8, 3.3, 0.45], accent);
      box('house-ground-wall', [x + 5.2, 1.65, wallZ], [5.8, 3.3, 0.45], accent);
      box('door-lintel', [x, 3.02, wallZ], [4.55, 0.56, 0.45], trim);
      box('door-trim-left', [x - 2.28, 1.35, wallZ + facing * 0.08], [0.15, 2.7, 0.12], trim, false);
      box('door-trim-right', [x + 2.28, 1.35, wallZ + facing * 0.08], [0.15, 2.7, 0.12], trim, false);
    }
    box('interior-divider-left', [x - 4.9, 1.55, z], [5.6, 3.1, 0.25], palette.brick);
    box('interior-divider-right', [x + 5.9, 1.55, z], [4.2, 3.1, 0.25], palette.brick);

    // Split second-floor slab leaves a genuine stairwell opening.
    box('upper-floor-left', [x - 4.9, 3.48, z], [6.2, 0.3, 13.7], palette.timber);
    box('upper-floor-right-front', [x + 4.9, 3.48, z + facing * 4.25], [6.2, 0.3, 5.2], palette.timber);
    box('upper-floor-right-rear', [x + 4.9, 3.48, z - facing * 4.25], [6.2, 0.3, 5.2], palette.timber);

    // Ten solid steps connect the lower room to the upper combat route.
    for (let step = 0; step < 10; step += 1) {
      const height = 0.34 * (step + 1);
      const depth = 0.62;
      box(
        'interior-stair',
        [x + 4.85, height / 2, z - facing * 3.45 + facing * step * depth],
        [2.5, height, depth + 0.04],
        palette.timber,
      );
    }

    // Upper-storey shell uses actual walls and window gaps, not a decorative cube.
    box('house-upper-side', [x - 8.1, 5.45, z], [0.45, 3.65, 14.8], accent);
    box('house-upper-side', [x + 8.1, 5.45, z], [0.45, 3.65, 14.8], accent);
    for (const wallZ of [frontZ, backZ]) {
      box('upper-wall-left', [x - 6.3, 5.45, wallZ], [3.6, 3.65, 0.45], accent);
      box('upper-wall-centre', [x, 5.45, wallZ], [3.4, 3.65, 0.45], accent);
      box('upper-wall-right', [x + 6.3, 5.45, wallZ], [3.6, 3.65, 0.45], accent);
      for (const wx of [x - 3.75, x + 3.75]) {
        box('window-glass', [wx, 5.55, wallZ + facing * 0.08], [2.2, 1.55, 0.1], palette.glass, false, false);
        box('window-top-trim', [wx, 6.43, wallZ + facing * 0.14], [2.5, 0.13, 0.13], trim, false);
        box('window-bottom-trim', [wx, 4.67, wallZ + facing * 0.14], [2.5, 0.13, 0.13], trim, false);
      }
    }

    // Twin pitched roof slabs, gutters, porch columns and exterior dressing.
    const roofLeft = box('pitched-roof', [x - 4.15, 8.15, z], [9.2, 0.48, 15.7], palette.roof, false);
    roofLeft.rotation.z = -0.24;
    const roofRight = box('pitched-roof', [x + 4.15, 8.15, z], [9.2, 0.48, 15.7], palette.roof, false);
    roofRight.rotation.z = 0.24;
    box('front-porch', [x, 0.22, frontZ + facing * 1.4], [8.2, 0.44, 2.5], palette.concrete, false);
    box('rear-deck', [x, 0.36, backZ - facing * 2], [10, 0.72, 3.5], palette.timber, true);
    for (const px of [x - 3.5, x + 3.5]) {
      box('porch-column', [px, 1.8, frontZ + facing * 1.65], [0.28, 3.6, 0.28], trim, false);
    }
    box('balcony', [x, 4.1, backZ - facing * 1.1], [10, 0.4, 2.2], palette.concrete, false);
    box('chimney', [x + 5.4, 8.6, z - facing * 3], [1.45, 3.4, 1.45], palette.brick, false);
    box('gutter', [x - 8.25, 7.68, z], [0.18, 0.18, 15.5], palette.chrome, false, false);
    box('gutter', [x + 8.25, 7.68, z], [0.18, 0.18, 15.5], palette.chrome, false, false);
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

  // Original east-lane landmark doubles as readable hard cover; decorative rings are added by environment-assets.
  box('atomic landmark plinth', [29.5, 0.38, -1.5], [5.8, 0.76, 5.8], palette.concrete);

  // Lane cover creates short sightlines and quick flanks.
  const cover: Array<[number, number, number, number]> = [
    [-15, -13, 3.5, 2], [15, 13, 3.5, 2], [-17, 5, 3, 3], [17, -5, 3, 3],
    [-24, 20, 4, 2], [24, -20, 4, 2], [-27, -5, 3, 5], [27, 5, 3, 5],
  ];
  cover.forEach(([x, z, w, d], index) => box(`cover ${index}`, [x, 0.8, z], [w, 1.6, d], index % 2 ? palette.coral : palette.aqua));

  // Route-shaping collision proxies for three distinct lanes. Rounded visual shells live in environment-assets.ts.
  for (const x of [-34, -25]) for (const z of [-17, -5]) collisionProxy('skyline trellis column', [x, 1.9, z], [0.55, 3.8, 0.55]);
  collisionProxy('greenhouse west wall', [-33.3, 1.5, 18], [0.45, 3, 8]);
  collisionProxy('greenhouse east wall', [-25.7, 1.5, 18], [0.45, 3, 8]);
  collisionProxy('greenhouse north wall', [-29.5, 1.5, 21.8], [8, 3, 0.45]);
  collisionProxy('greenhouse south left', [-32.2, 1.5, 14.2], [2.6, 3, 0.45]);
  collisionProxy('greenhouse south right', [-26.8, 1.5, 14.2], [2.6, 3, 0.45]);
  collisionProxy('service wall west', [25.8, 0.75, 11], [0.7, 1.5, 11]);
  collisionProxy('service wall east', [32.2, 0.75, 11], [0.7, 1.5, 11]);
  for (const x of [25.5, 33.5]) for (const z of [-22, -14]) collisionProxy('solar canopy column', [x, 2.1, z], [0.6, 4.2, 0.6]);

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
  // Original trees and street props are assembled in environment-assets.ts.

  return {
    colliders,
    raycastMeshes,
    targets,
    bounds: { minX: -41, maxX: 41, minZ: -51, maxZ: 51 },
    spawns: {
      0: [
        // First spawn uses the open exterior flank so forward movement cannot begin
        // inside a deck, wall, or interior-divider collider.
        new THREE.Vector3(-24, 1.7, -35), new THREE.Vector3(5, 1.7, -38),
        new THREE.Vector3(-20, 1.7, -25), new THREE.Vector3(20, 1.7, -25),
      ],
      1: [
        new THREE.Vector3(24, 1.7, 35), new THREE.Vector3(-5, 1.7, 38),
        new THREE.Vector3(20, 1.7, 25), new THREE.Vector3(-20, 1.7, 25),
      ],
    },
  };
}
