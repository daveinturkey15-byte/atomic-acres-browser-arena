import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type ArenaArtResult = {
  root: THREE.Group;
  loadedModels: number;
};

type Placement = {
  path: string;
  name: string;
  position: [number, number, number];
  longestAxis: number;
  rotationY?: number;
};

const PLACEMENTS: Placement[] = [
  {
    path: './assets/kenney/car/firetruck.glb',
    name: 'authored-central-rescue-truck',
    position: [-3.8, 0, 7],
    longestAxis: 13.2,
  },
  {
    path: './assets/kenney/car/delivery.glb',
    name: 'authored-central-delivery-truck',
    position: [4.2, 0, -9],
    longestAxis: 8.4,
    rotationY: Math.PI,
  },
  {
    path: './assets/kenney/suburban/tree-large.glb',
    name: 'authored-tree-west',
    position: [-33, 0, -26],
    longestAxis: 7.2,
  },
  {
    path: './assets/kenney/suburban/tree-large.glb',
    name: 'authored-tree-east',
    position: [33, 0, 27],
    longestAxis: 7.2,
  },
  {
    path: './assets/kenney/suburban/tree-small.glb',
    name: 'authored-tree-south',
    position: [-32, 0, 34],
    longestAxis: 5.3,
  },
  {
    path: './assets/kenney/suburban/tree-small.glb',
    name: 'authored-tree-north',
    position: [31, 0, -36],
    longestAxis: 5.3,
  },
  {
    path: './assets/kenney/suburban/planter.glb',
    name: 'authored-planter-a',
    position: [-18, 0, -18],
    longestAxis: 2.4,
  },
  {
    path: './assets/kenney/suburban/planter.glb',
    name: 'authored-planter-b',
    position: [18, 0, 18],
    longestAxis: 2.4,
    rotationY: Math.PI,
  },
];

const LEGACY_VEHICLE_NAMES = new Set([
  'tour coach',
  'coach roof',
  'coach window',
  'delivery truck',
  'truck cab',
  'truck windshield',
]);

/** Loads authored CC0 dressing while preserving the separately-tested collision blockout. */
export async function loadArenaArt(
  scene: THREE.Scene,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArenaArtResult> {
  const loader = new GLTFLoader();
  const templates = new Map<string, THREE.Object3D>();
  const uniquePaths = [...new Set(PLACEMENTS.map((entry) => entry.path))];
  let loaded = 0;
  await Promise.all(uniquePaths.map(async (path) => {
    const gltf = await loader.loadAsync(path);
    templates.set(path, gltf.scene);
    loaded += 1;
    onProgress?.(loaded, uniquePaths.length);
  }));

  scene.traverse((node) => {
    if (LEGACY_VEHICLE_NAMES.has(node.name)) node.visible = false;
    if (node.name === 'fence post' || node.name === 'lamp pole') {
      // Keep these authored-looking silhouettes until the full modular environment kit lands.
      node.castShadow = true;
    }
  });

  const root = new THREE.Group();
  root.name = 'authored-arena-art';
  scene.add(root);
  for (const placement of PLACEMENTS) {
    const template = templates.get(placement.path);
    if (!template) throw new Error(`Missing loaded template ${placement.path}`);
    const model = template.clone(true);
    model.name = placement.name;
    model.rotation.y = placement.rotationY ?? 0;
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    fitAndGround(model, placement.longestAxis);
    model.position.add(new THREE.Vector3(...placement.position));
    root.add(model);
  }
  return { root, loadedModels: uniquePaths.length };
}

function fitAndGround(model: THREE.Object3D, longestAxis: number): void {
  const initial = new THREE.Box3().setFromObject(model);
  const size = initial.getSize(new THREE.Vector3());
  const scale = longestAxis / Math.max(size.x, size.y, size.z, 0.001);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(model);
  const center = fitted.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fitted.min.y;
}
