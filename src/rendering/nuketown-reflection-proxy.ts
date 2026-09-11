import * as THREE from 'three';
import {
  NUKETOWN2_HOUSE_LAYOUT, NUKETOWN2_HOUSE_WIDTH, NUKETOWN2_HOUSE_DEPTH,
  nuketown2HandedX,
} from '../nuketown2-layout';

/** Static local IBL, not a live mirror: the two authored houses frame the street. */
export function createNuketownReflectionProxy(background: THREE.Texture): {
  scene: THREE.Scene;
  dispose: () => void;
} {
  const scene = new THREE.Scene();
  scene.name = 'nuketown-static-neighbourhood-reflection';
  scene.background = background; // borrowed; disposal below must not own it
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map<number, THREE.MeshBasicMaterial>();
  const box = (name: string, size: number[], at: number[], hex: number) => {
    let material = materials.get(hex);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
      materials.set(hex, material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(at[0], at[1], at[2]);
    scene.add(mesh);
  };
  box('ground', [220, 0.1, 220], [0, -0.15, 0], 0x536347);
  box('street', [40, 0.1, 13], [0, -0.08, 0], 0x393f44);
  for (const house of NUKETOWN2_HOUSE_LAYOUT) {
    const x = nuketown2HandedX(house.x);
    const front = house.z + house.facing * NUKETOWN2_HOUSE_DEPTH / 2;
    box(`${house.id}-lower`, [NUKETOWN2_HOUSE_WIDTH, 3.2, NUKETOWN2_HOUSE_DEPTH], [x, 1.6, house.z], 0xd9d5c6);
    box(`${house.id}-upper`, [NUKETOWN2_HOUSE_WIDTH, 3, NUKETOWN2_HOUSE_DEPTH], [x, 4.7, house.z], house.id === 'north' ? 0xb96838 : 0xd9d5c6);
    box(`${house.id}-roof`, [NUKETOWN2_HOUSE_WIDTH + 0.5, 0.22, NUKETOWN2_HOUSE_DEPTH + 0.5], [x, 6.3, house.z], 0x414d54);
    for (const y of [1.6, 4.7]) {
      for (const dx of [-3.2, 3.2]) {
        box(`${house.id}-window-${dx}-${y}`, [2, 1.15, 0.05], [x + dx, y, front + house.facing * 0.04], 0x324d61);
      }
    }
  }
  scene.updateMatrixWorld(true);
  return {
    scene,
    dispose: () => {
      scene.clear();
      geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}

/** Explicit local IBL on the automotive surfaces, without lifting every matte wall. */
export function bindNuketownVehicleReflections(scene: THREE.Scene, texture: THREE.Texture | null, scale: number): void {
  const visited = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (visited.has(material) || !['glass', 'paint', 'chrome'].includes(material.userData.forgeRole)) continue;
      visited.add(material);
      const surface = material as THREE.MeshStandardMaterial;
      if (surface.envMap !== texture) {
        surface.envMap = texture;
        surface.needsUpdate = true;
      }
      surface.envMapIntensity = (material.userData.forgeRole === 'glass' ? 1.2 : 0.7) * scale;
    }
  });
}
