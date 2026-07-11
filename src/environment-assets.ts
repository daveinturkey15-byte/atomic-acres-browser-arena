import * as THREE from 'three';
import {
  buildRetroCoach,
  buildRetroDeliveryTruck,
  roundedBox,
  texturedMaterial,
} from './art-kit';

export type ArenaArtResult = {
  root: THREE.Group;
  loadedModels: number;
};

const LEGACY_VEHICLE_NAMES = new Set([
  'tour coach', 'coach roof', 'coach window', 'delivery truck', 'truck cab', 'truck windshield',
]);

function addTree(root: THREE.Group, x: number, z: number, scale: number): void {
  const bark = texturedMaterial('./assets/original/textures/wood-deck.png', { color: 0x72503b, roughness: 1, repeatY: 3 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38 * scale, 0.55 * scale, 4.2 * scale, 12), bark);
  trunk.position.set(x, 2.1 * scale, z);
  trunk.castShadow = true;
  root.add(trunk);
  const leafMaterials = [0x496f47, 0x5f8249, 0x77934f].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  const clusters: Array<[number, number, number, number]> = [
    [0, 5.1, 0, 2.3], [-1.25, 4.75, 0.3, 1.55], [1.2, 4.9, -0.25, 1.65], [0.15, 6.2, 0.1, 1.7],
  ];
  clusters.forEach(([ox, oy, oz, radius], index) => {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * scale, 2), leafMaterials[index % leafMaterials.length]);
    crown.position.set(x + ox * scale, oy * scale, z + oz * scale);
    crown.castShadow = true;
    root.add(crown);
  });
}

function addStreetProps(root: THREE.Group): void {
  const metal = texturedMaterial('./assets/original/textures/painted-metal-teal.png', { roughness: 0.58, metalness: 0.3 });
  const concrete = texturedMaterial('./assets/original/textures/concrete-poured.png', { roughness: 0.95, repeatX: 2 });
  for (const [x, z, rotation] of [
    [-15, -20, 0.2], [17, 22, Math.PI], [-31, 10, Math.PI / 2], [30, -13, -Math.PI / 2],
  ] as Array<[number, number, number]>) {
    const mailbox = new THREE.Group();
    mailbox.position.set(x, 0, z); mailbox.rotation.y = rotation;
    const post = roundedBox('mailbox-post', [0.16, 1.35, 0.16], concrete, 0.035); post.position.y = 0.67;
    const box = roundedBox('mailbox', [0.7, 0.48, 0.95], metal, 0.12, 4); box.position.set(0, 1.35, 0);
    mailbox.add(post, box); root.add(mailbox);
  }
  for (const [x, z] of [[-9, 18], [10, -22], [-34, -2], [34, 4]] as Array<[number, number]>) {
    const hydrant = new THREE.Group(); hydrant.position.set(x, 0, z);
    const red = new THREE.MeshStandardMaterial({ color: 0xb94d38, roughness: 0.55, metalness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.9, 16), red); body.position.y = 0.45; body.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), red); cap.position.y = 0.9;
    hydrant.add(body, cap); root.add(hydrant);
  }
  for (const [x, z] of [[-20, 12], [22, -14], [-26, -29], [25, 30]] as Array<[number, number]>) {
    const planter = roundedBox('concrete-planter', [2.2, 0.7, 1.05], concrete, 0.12); planter.position.set(x, 0.35, z); root.add(planter);
    for (const offset of [-0.6, 0, 0.6]) {
      const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.54, 2), new THREE.MeshStandardMaterial({ color: 0x547747, roughness: 0.96 }));
      shrub.position.set(x + offset, 0.88, z); shrub.castShadow = true; root.add(shrub);
    }
  }
}

/** Builds original Atomic Acres hero vehicles and environmental props. */
export async function loadArenaArt(
  scene: THREE.Scene,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArenaArtResult> {
  scene.traverse((node) => {
    if (LEGACY_VEHICLE_NAMES.has(node.name) || node.name === 'primitive-tree') node.visible = false;
  });

  const root = new THREE.Group();
  root.name = 'original-arena-art';
  scene.add(root);

  const coach = buildRetroCoach();
  coach.position.set(-3.8, 0, 7);
  coach.rotation.y = 0.03;
  root.add(coach);
  onProgress?.(1, 8);

  const truck = buildRetroDeliveryTruck();
  truck.position.set(4.2, 0, -8.8);
  truck.rotation.y = Math.PI;
  root.add(truck);
  onProgress?.(2, 8);

  addTree(root, -33, -26, 1.05); onProgress?.(3, 8);
  addTree(root, 33, 27, 1.1); onProgress?.(4, 8);
  addTree(root, -32, 34, 0.82); onProgress?.(5, 8);
  addTree(root, 31, -36, 0.9); onProgress?.(6, 8);
  addStreetProps(root); onProgress?.(7, 8);

  const tower = new THREE.Group();
  tower.position.set(35, 0, -42);
  const steel = new THREE.MeshStandardMaterial({ color: 0x4c5960, roughness: 0.48, metalness: 0.55 });
  for (const x of [-1.4, 1.4]) for (const z of [-1.4, 1.4]) {
    const leg = roundedBox('test-tower-leg', [0.22, 9, 0.22], steel, 0.04); leg.position.set(x, 4.5, z); tower.add(leg);
  }
  for (let y = 1; y < 9; y += 1.6) {
    for (const rotation of [0, Math.PI / 2]) {
      const brace = roundedBox('test-tower-brace', [3.2, 0.12, 0.12], steel, 0.025); brace.position.y = y; brace.rotation.y = rotation; tower.add(brace);
    }
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff6b4f, emissive: 0xff2a16, emissiveIntensity: 3 }));
  beacon.position.y = 9.2; tower.add(beacon); root.add(tower); onProgress?.(8, 8);

  return { root, loadedModels: 8 };
}
