import * as THREE from 'three';
import { texturedMaterial } from './art-kit';
import { ARENA_BOUNDS, COVER_LAYOUT, GARAGE_LAYOUT, HOUSE_LAYOUT, SPAWN_LAYOUT } from './arena-layout';
import { classifyImpactSurface } from './combat-feedback';
import { Box2 } from './collision';
import { createHouseArchitecture, HouseSurface } from './house-navigation';
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
    cream: texturedMaterial('./assets/original/textures/plaster-warm.png', { roughness: 0.92, repeatX: 3, repeatY: 3 }),
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
    mesh.userData.impactSurface = classifyImpactSurface({
      name,
      metalness: mat instanceof THREE.MeshStandardMaterial ? mat.metalness : undefined,
    });
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
    const proxy = box(name, position, size, palette.dark, true, false);
    // This simple shell is intentionally visible in Performance so every
    // authoritative route collider has a readable visual counterpart. Quality
    // replaces it with the rounded authored route art in environment-assets.
    proxy.visible = true;
    proxy.userData.collisionProxy = true;
  }

  function colliderOnly(position: [number, number, number], size: [number, number, number]): void {
    colliders.push({
      minX: position[0] - size[0] / 2,
      maxX: position[0] + size[0] / 2,
      minZ: position[2] - size[2] / 2,
      maxZ: position[2] + size[2] / 2,
      minY: position[1] - size[1] / 2,
      maxY: position[1] + size[1] / 2,
    });
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(86, 98), palette.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.impactSurface = 'soil';
  world.add(ground);
  raycastMeshes.push(ground);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(19, 88), palette.road);
  road.name = 'aged asphalt road';
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.025;
  road.receiveShadow = true;
  road.userData.impactSurface = 'concrete';
  world.add(road);
  raycastMeshes.push(road);
  for (const x of [-10.25, 10.25]) box('curb', [x, 0.12, 0], [1.4, 0.24, 88], palette.concrete, false, false);
  for (const x of [-12.6, 12.6]) box('sidewalk', [x, 0.07, 0], [3.2, 0.14, 88], palette.concrete, false, false);
  for (let z = -38; z <= 38; z += 8) box('lane marker', [0, 0.055, z], [0.18, 0.03, 3.6], palette.mustard, false, false);
  for (const z of [-18, 18]) {
    for (let x = -7.5; x <= 7.5; x += 2.5) box('crosswalk stripe', [x, 0.062, z], [1.4, 0.025, 3.2], palette.white, false, false);
  }

  function addHouse(team: Team, x: number, z: number, facing: 1 | -1): void {
    const frontZ = z + facing * 7.2;
    const backZ = z - facing * 7.2;
    const trim = palette.white;
    const architecture = createHouseArchitecture(team, x, z, facing);
    const surfaceMaterial: Record<HouseSurface, THREE.Material> = {
      aqua: palette.aqua,
      coral: palette.coral,
      plaster: palette.cream,
      brick: palette.brick,
      timber: palette.timber,
      concrete: palette.concrete,
      trim,
      glass: palette.glass,
      metal: palette.chrome,
      ceiling: texturedMaterial('./assets/original/textures/ceiling-acoustic.png', { roughness: 0.96, repeatX: 3, repeatY: 3 }),
      light: new THREE.MeshBasicMaterial({ color: 0xffe2a3, toneMapped: false }),
    };

    for (const solid of architecture.solids) {
      const mat = surfaceMaterial[solid.surface];
      if (solid.kind === 'stair') {
        // Keep full-step controller collision while presenting credible thin
        // treads and risers. Both derive from the same authored declaration.
        colliderOnly(solid.position, solid.size);
        const top = solid.position[1] + solid.size[1] / 2;
        box('interior-stair-tread', [solid.position[0], top - 0.055, solid.position[2]], [solid.size[0], 0.11, solid.size[2]], mat, false, true, true);
        box(
          'interior-stair-riser',
          [solid.position[0], top - 0.17, solid.position[2] - facing * (solid.size[2] / 2 - 0.04)],
          [solid.size[0], 0.34, 0.08],
          mat,
          false,
          true,
          true,
        );
      } else {
        box(solid.name, solid.position, solid.size, mat, solid.collidable, solid.kind !== 'glass');
      }
    }

    // Glass occupies the authored upper openings but remains non-authoritative.
    for (const wallZ of [frontZ, backZ]) {
      for (const wx of [x - 4.7, x + 4.7]) {
        box('window-glass', [wx, 5.35, wallZ + facing * 0.08], [2.1, 1.65, 0.08], palette.glass, false, false);
      }
    }

    // Twin pitched roof slabs, gutters, porch columns and exterior dressing.
    const roofLeft = box('pitched-roof', [x - 4.15, 8.15, z], [9.2, 0.48, 15.7], palette.roof, false);
    roofLeft.rotation.z = -0.24;
    const roofRight = box('pitched-roof', [x + 4.15, 8.15, z], [9.2, 0.48, 15.7], palette.roof, false);
    roofRight.rotation.z = 0.24;
    box('front-porch', [x, 0.22, frontZ + facing * 1.4], [8.2, 0.44, 2.5], palette.concrete, false);
    for (const px of [x - 3.5, x + 3.5]) {
      box('porch-column', [px, 1.8, frontZ + facing * 1.65], [0.28, 3.6, 0.28], trim, false);
    }
    box('balcony', [x, 4.1, backZ - facing * 1.1], [10, 0.4, 2.2], palette.concrete, false);
    box('chimney', [x + 5.4, 8.6, z - facing * 3], [1.45, 3.4, 1.45], palette.brick, false);
    box('gutter', [x - 8.25, 7.68, z], [0.18, 0.18, 15.5], palette.chrome, false, false);
    box('gutter', [x + 8.25, 7.68, z], [0.18, 0.18, 15.5], palette.chrome, false, false);
  }

  for (const house of HOUSE_LAYOUT) addHouse(house.team, house.x, house.z, house.facing);

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
  const [northGarage, southGarage] = GARAGE_LAYOUT;
  box('north garage', [northGarage.x, 1.7, northGarage.z], [12, 3.4, 6.5], palette.cream);
  box('south garage', [southGarage.x, 1.7, southGarage.z], [12, 3.4, 6.5], palette.cream);
  box('garage door', [northGarage.x, 1.55, northGarage.z + 3.3], [9, 2.7, 0.18], palette.chrome, false, false);
  box('garage door', [southGarage.x, 1.55, southGarage.z - 3.3], [9, 2.7, 0.18], palette.chrome, false, false);

  // Original east-lane landmark doubles as readable hard cover; decorative rings are added by environment-assets.
  box('atomic landmark plinth', [27, 0.38, -1.5], [5.8, 0.76, 5.8], palette.concrete);

  // Lane cover interrupts ordinary combat rays every 12–18 metres.
  COVER_LAYOUT.forEach(([x, z, w, d], index) => box(`cover ${index}`, [x, 0.8, z], [w, 1.6, d], index % 2 ? palette.coral : palette.aqua));

  // Route-shaping collision proxies for three distinct lanes. Rounded visual shells live in environment-assets.ts.
  for (const x of [-29, -22]) for (const z of [-15, -5]) collisionProxy('skyline trellis column', [x, 1.9, z], [0.55, 3.8, 0.55]);
  collisionProxy('greenhouse west wall', [-29, 1.5, 16], [0.45, 3, 8]);
  collisionProxy('greenhouse east wall', [-22, 1.5, 16], [0.45, 3, 8]);
  collisionProxy('greenhouse north wall', [-25.5, 1.5, 19.8], [7.5, 3, 0.45]);
  collisionProxy('greenhouse south left', [-28, 1.5, 12.2], [2.2, 3, 0.45]);
  collisionProxy('greenhouse south right', [-23, 1.5, 12.2], [2.2, 3, 0.45]);
  collisionProxy('service wall west', [22.5, 0.75, 9], [0.7, 1.5, 10]);
  collisionProxy('service wall east', [28.5, 0.75, 9], [0.7, 1.5, 10]);
  for (const x of [22.5, 29.5]) for (const z of [-20, -12]) collisionProxy('solar canopy column', [x, 2.1, z], [0.6, 4.2, 0.6]);

  // Boundary fencing, with substantial visual posts rather than invisible walls.
  box('west fence', [-34.3, 1.5, 0], [0.6, 3, 88], palette.timber);
  box('east fence', [34.3, 1.5, 0], [0.6, 3, 88], palette.timber);
  box('north fence', [0, 1.5, -43.3], [69, 3, 0.6], palette.timber);
  box('south fence', [0, 1.5, 43.3], [69, 3, 0.6], palette.timber);
  for (let z = -39; z <= 39; z += 6.5) {
    box('fence post', [-33.9, 2.1, z], [0.8, 4.2, 0.8], palette.dark, false);
    box('fence post', [33.9, 2.1, z], [0.8, 4.2, 0.8], palette.dark, false);
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
  sign('ATOMIC ACRES', 0, 4.7, -42.9, 0);
  sign('TEST BLOCK 86', 0, 4.7, 42.9, Math.PI);

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
  target('north-yard', -20, -34, 1);
  target('north-lane', 18, -12, 1);
  target('south-yard', 20, 34, 0);
  target('south-lane', -18, 12, 0);
  target('mid-coach', 8, 4, 1);
  target('mid-truck', -8, -6, 0);

  // Street lamps and a few decorative trees add depth without texture downloads.
  for (const [x, z] of [[-13, -16], [13, 16], [-13, 22], [13, -22]] as Array<[number, number]>) {
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
    bounds: { ...ARENA_BOUNDS },
    spawns: {
      0: SPAWN_LAYOUT[0].map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
      1: SPAWN_LAYOUT[1].map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
    },
  };
}
