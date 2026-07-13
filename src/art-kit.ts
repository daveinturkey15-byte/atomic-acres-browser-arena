import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Team, WeaponId } from './protocol';
import { hitReactionAt } from './weapon-presentation-state';

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

export type StaticBatchStats = {
  sourceMeshes: number;
  batches: number;
};

function materialBatchKey(material: THREE.Material): string {
  const candidate = material as THREE.MeshStandardMaterial & { transmission?: number };
  return JSON.stringify({
    type: material.type,
    color: candidate.color?.getHex(),
    emissive: candidate.emissive?.getHex(),
    emissiveIntensity: candidate.emissiveIntensity,
    roughness: candidate.roughness,
    metalness: candidate.metalness,
    transmission: candidate.transmission,
    map: candidate.map?.uuid,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
    depthWrite: material.depthWrite,
    polygonOffset: material.polygonOffset,
    polygonOffsetFactor: material.polygonOffsetFactor,
  });
}

/**
 * Collapses static authored meshes sharing a material into world-space batches.
 * The original meshes stay in the scene (hidden) so collision/raycast references
 * remain valid; dynamic target/operator meshes opt out via `targetRoot` metadata.
 */
export function batchStaticMeshes(
  root: THREE.Object3D,
  destination: THREE.Object3D,
  classify: (mesh: THREE.Mesh) => string = () => '',
  flattenMaterials = false,
): StaticBatchStats {
  root.updateWorldMatrix(true, true);
  const groups = new Map<string, { material: THREE.Material; classification: string; meshes: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible || node.userData.targetRoot || Array.isArray(node.material)) return;
    const classification = classify(node);
    const key = flattenMaterials ? classification : `${materialBatchKey(node.material)}:${classification}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = {
        material: flattenMaterials ? new THREE.MeshBasicMaterial({ vertexColors: true }) : node.material,
        classification,
        meshes: [],
        geometries: [],
      };
      groups.set(key, entry);
    }
    let geometry = node.geometry.clone();
    if (geometry.index) {
      const indexed = geometry;
      geometry = geometry.toNonIndexed();
      indexed.dispose();
    }
    geometry.applyMatrix4(node.matrixWorld);
    if (flattenMaterials) {
      for (const attribute of Object.keys(geometry.attributes)) {
        if (attribute !== 'position') geometry.deleteAttribute(attribute);
      }
      const source = node.material as THREE.MeshStandardMaterial;
      const color = source.color?.clone() ?? new THREE.Color(0xffffff);
      if (source.emissive) color.lerp(source.emissive, Math.min(1, source.emissiveIntensity ?? 0));
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let index = 0; index < colors.length; index += 3) {
        colors[index] = color.r;
        colors[index + 1] = color.g;
        colors[index + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    entry.meshes.push(node);
    entry.geometries.push(geometry);
  });

  const batches = new THREE.Group();
  batches.name = `${root.name || 'static'}-render-batches`;
  let sourceMeshes = 0;
  let batchCount = 0;
  for (const entry of groups.values()) {
    const geometry = mergeGeometries(entry.geometries, false);
    if (!geometry) {
      entry.geometries.forEach((item) => item.dispose());
      continue;
    }
    const mesh = new THREE.Mesh(geometry, entry.material);
    if (entry.classification) mesh.userData.hitZone = entry.classification;
    mesh.castShadow = !flattenMaterials && entry.meshes.some((item) => item.castShadow);
    mesh.receiveShadow = !flattenMaterials && entry.meshes.some((item) => item.receiveShadow);
    mesh.frustumCulled = true;
    batches.add(mesh);
    for (const source of entry.meshes) source.visible = false;
    sourceMeshes += entry.meshes.length;
    batchCount += 1;
  }
  destination.add(batches);
  return { sourceMeshes, batches: batchCount };
}

function texture(path: string, repeatX = 1, repeatY = 1): THREE.Texture {
  const key = `${path}:${repeatX}:${repeatY}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const value = textureLoader.load(path);
  value.colorSpace = THREE.SRGBColorSpace;
  value.wrapS = value.wrapT = THREE.RepeatWrapping;
  value.repeat.set(repeatX, repeatY);
  value.anisotropy = 8;
  textureCache.set(key, value);
  return value;
}

export function texturedMaterial(
  path: string,
  options: { color?: number; roughness?: number; metalness?: number; repeatX?: number; repeatY?: number } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: texture(path, options.repeatX ?? 1, options.repeatY ?? 1),
    color: options.color ?? 0xffffff,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0.03,
  });
}

export function roundedBox(
  name: string,
  size: [number, number, number],
  material: THREE.Material,
  radius = 0.08,
  segments = 3,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], segments, Math.min(radius, ...size.map((v) => v / 4))), material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const MAT = {
  gunmetal: () => texturedMaterial('./assets/original/textures/weapon-gunmetal.png', { color: 0xb8bfbd, roughness: 0.38, metalness: 0.62, repeatX: 2 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x252c31, roughness: 0.42, metalness: 0.5 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x202628, roughness: 0.9 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xb8883c, roughness: 0.3, metalness: 0.76 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x84cfe3, roughness: 0.12, metalness: 0.08, transparent: true, opacity: 0.7 }),
  cream: () => new THREE.MeshStandardMaterial({ color: 0xe7dbc1, roughness: 0.68 }),
  tealMetal: () => texturedMaterial('./assets/original/textures/painted-metal-teal.png', { roughness: 0.54, metalness: 0.28, repeatX: 3 }),
};

function part(root: THREE.Group, mesh: THREE.Mesh, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  root.add(mesh);
  return mesh;
}

export function buildWeaponModel(id: WeaponId, flattenMaterials = false): THREE.Group {
  const root = new THREE.Group();
  root.name = `${id}-original-weapon`;
  const metal = flattenMaterials ? MAT.dark() : MAT.gunmetal();
  const dark = MAT.dark();
  const rubber = MAT.rubber();
  const accent = new THREE.MeshStandardMaterial({
    color: id === 'carbine' ? 0xd6a944 : id === 'smg' ? 0x48b9b7 : 0xb75d45,
    roughness: 0.45,
    metalness: 0.35,
  });

  const addSocket = (name: string, position: [number, number, number], parent: THREE.Object3D = root) => {
    const socket = new THREE.Object3D();
    socket.name = name;
    socket.position.set(...position);
    parent.add(socket);
  };
  const addBarrel = (length: number, z: number, radius: number) => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius, length, 12), dark);
    part(root, barrel, [0, 0.005, z], [Math.PI / 2, 0, 0]);
  };

  if (id === 'carbine') {
    // Original M86 vertical-slice silhouette: compact receiver, ventilated fore-end,
    // skeleton stock and a physically aligned low reflex optic.
    part(root, roundedBox('receiver', [0.235, 0.22, 0.62], metal, 0.035), [0, 0, -0.12]);
    part(root, roundedBox('upper-receiver', [0.205, 0.095, 0.57], dark, 0.025), [0, 0.115, -0.13]);
    for (const side of [-1, 1]) {
      part(root, roundedBox('receiver-side-panel', [0.022, 0.135, 0.43], dark, 0.006, 2), [side * 0.128, 0.015, -0.16]);
      if (side < 0) {
        const accentPositions = flattenMaterials ? [-0.15] : [-0.29, -0.15, -0.01];
        for (const z of accentPositions) {
          part(root, roundedBox('receiver-accent-stripe', [0.025, 0.045, 0.085], accent, 0.006, 1), [side * 0.141, 0.045, z], [0, 0, -0.18]);
        }
      }
      const stockRod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 7), dark);
      stockRod.name = 'stock-support-rod';
      part(root, stockRod, [side * 0.055, 0.035, 0.38], [Math.PI / 2, side * 0.08, 0]);
    }
    part(root, roundedBox('stock-cheek-rest', [0.18, 0.105, 0.3], rubber, 0.035), [0, 0.095, 0.36], [-0.05, 0, 0]);
    part(root, roundedBox('stock-shoulder-pad', [0.185, 0.23, 0.09], rubber, 0.035), [0, -0.005, 0.56], [-0.08, 0, 0]);
    part(root, roundedBox('pistol-grip', [0.11, 0.255, 0.135], rubber, 0.025), [0, -0.18, 0.055], [-0.2, 0, 0]);
    part(root, roundedBox('trigger-guard-front', [0.026, 0.125, 0.025], dark, 0.006, 1), [0, -0.12, -0.045], [0.18, 0, 0]);
    part(root, roundedBox('trigger-guard-bottom', [0.026, 0.025, 0.13], dark, 0.006, 1), [0, -0.18, 0.01]);
    part(root, roundedBox('trigger', [0.022, 0.09, 0.022], accent, 0.005, 1), [0, -0.12, 0.01], [0.25, 0, 0]);

    const magazine = new THREE.Group();
    magazine.name = 'curved-magazine';
    magazine.position.set(0, -0.24, -0.17);
    magazine.rotation.x = 0.16;
    root.add(magazine);
    part(magazine, roundedBox('magazine-body', [0.12, 0.35, 0.16], dark, 0.032), [0, 0, 0]);
    const magazineRibs = flattenMaterials ? [0.04] : [-0.11, -0.035, 0.04, 0.115];
    for (const y of magazineRibs) {
      part(magazine, roundedBox('magazine-rib', [0.126, 0.018, 0.168], accent, 0.005, 1), [0, y, 0]);
    }
    part(magazine, roundedBox('magazine-base', [0.14, 0.045, 0.18], rubber, 0.012, 2), [0, -0.185, 0.01]);
    addSocket('reload-socket-l', [-0.14, -0.05, 0.04], magazine);

    part(root, roundedBox('triangular-fore-end', [0.215, 0.16, 0.46], metal, 0.032), [0, -0.005, -0.59]);
    part(root, roundedBox('fore-end-top-rail', [0.19, 0.035, 0.52], dark, 0.008, 1), [0, 0.105, -0.55]);
    for (const side of [-1, 1]) {
      part(root, roundedBox('fore-end-side-rail', [0.028, 0.085, 0.34], dark, 0.006, 1), [side * 0.116, 0, -0.58]);
      const ventPositions = flattenMaterials ? [-0.61] : [-0.72, -0.61, -0.5];
      for (const z of ventPositions) {
        part(root, roundedBox('fore-end-vent', [0.024, 0.052, 0.062], accent, 0.006, 1), [side * 0.123, 0.035, z]);
      }
    }
    const railTeeth = flattenMaterials ? [-0.64, -0.46] : [-0.73, -0.64, -0.55, -0.46, -0.37];
    for (const z of railTeeth) {
      part(root, roundedBox('rail-tooth', [0.18, 0.024, 0.035], dark, 0.004, 1), [0, 0.135, z]);
    }
    addBarrel(0.5, -0.96, 0.031);
    const gasBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.095, 10), dark);
    gasBlock.name = 'gas-block';
    part(root, gasBlock, [0, 0.002, -0.8], [Math.PI / 2, 0, 0]);

    part(root, roundedBox('optic-bridge', [0.155, 0.045, 0.34], dark, 0.01), [0, 0.145, -0.015]);
    for (const side of [-1, 1]) {
      part(root, roundedBox('optic-side-post', [0.026, 0.13, 0.11], dark, 0.007, 2), [side * 0.062, 0.202, -0.025]);
    }
    part(root, roundedBox('optic-top-frame', [0.148, 0.026, 0.11], dark, 0.007, 2), [0, 0.268, -0.025]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.01, 8, 20), dark);
    ring.name = 'optic-ring';
    ring.position.set(0, 0.215, -0.096); root.add(ring);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.049, 18),
      new THREE.MeshBasicMaterial({
        color: flattenMaterials ? 0x6fc3d7 : 0x8bdbe4,
        transparent: true,
        opacity: flattenMaterials ? 0.16 : 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    lens.name = 'optic-lens';
    lens.position.set(0, 0.215, -0.098); root.add(lens);
    const reticle = new THREE.Mesh(
      new THREE.CircleGeometry(0.009, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd35a, depthWrite: false, toneMapped: false }),
    );
    reticle.name = 'optic-reticle';
    reticle.position.set(0, 0.215, 0.033); root.add(reticle);
    part(root, roundedBox('rear-sight', [0.105, 0.07, 0.045], dark, 0.01), [0, 0.19, 0.18]);
    part(root, roundedBox('front-sight', [0.035, 0.105, 0.035], dark, 0.006), [0, 0.17, -0.78]);
    part(root, roundedBox('charging-handle', [0.19, 0.035, 0.07], accent, 0.008), [0, 0.13, 0.1]);
    const bolt = part(root, roundedBox('bolt-or-slide', [0.052, 0.06, 0.18], MAT.brass(), 0.01), [0.112, 0.035, -0.045]);
    bolt.userData.restZ = bolt.position.z;
    addSocket('muzzle-socket', [0, 0.005, -1.24]);
    addSocket('eject-socket', [0.145, 0.055, -0.07]);
    addSocket('grip-socket-r', [0.035, -0.135, 0.045]);
    addSocket('support-socket-l', [-0.035, -0.085, -0.58]);
  } else if (id === 'smg') {
    part(root, roundedBox('receiver', [0.21, 0.22, 0.42], metal, 0.04), [0, 0, -0.12]);
    part(root, roundedBox('tall-rear-housing', [0.2, 0.25, 0.18], dark, 0.035), [0, 0.08, 0.08]);
    part(root, roundedBox('heat-shield', [0.22, 0.14, 0.3], accent, 0.025), [0, 0.005, -0.43]);
    for (const z of [-0.52, -0.43, -0.34]) {
      const vent = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 12), dark);
      vent.rotation.y = Math.PI / 2; vent.position.set(0.116, 0.01, z); root.add(vent);
    }
    part(root, roundedBox('raked-grip', [0.11, 0.25, 0.13], rubber, 0.025), [0, -0.18, 0.01], [-0.24, 0, 0]);
    const magazine = part(root, roundedBox('straight-magazine', [0.13, 0.3, 0.14], dark, 0.025), [0, -0.26, -0.1], [-0.08, 0, 0]);
    addSocket('reload-socket-l', [-0.14, -0.08, 0.02], magazine);
    for (const x of [-0.065, 0.065]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8), dark);
      part(root, rod, [x, 0.015, 0.35], [Math.PI / 2, 0, 0]);
    }
    part(root, roundedBox('wire-stock-pad', [0.18, 0.19, 0.08], rubber, 0.025), [0, 0.015, 0.54]);
    addBarrel(0.25, -0.68, 0.035);
    const block = part(root, roundedBox('bolt-or-slide', [0.22, 0.055, 0.1], accent, 0.012), [0, 0.135, -0.04]);
    block.userData.restZ = block.position.z;
    part(root, roundedBox('rear-sight', [0.13, 0.08, 0.05], dark, 0.012), [0, 0.19, 0.08]);
    part(root, roundedBox('front-sight', [0.04, 0.1, 0.04], dark, 0.008), [0, 0.18, -0.52]);
    addSocket('muzzle-socket', [0, 0.005, -0.83]);
    addSocket('eject-socket', [0.14, 0.06, -0.04]);
    addSocket('grip-socket-r', [0.03, -0.13, 0.02]);
    addSocket('support-socket-l', [-0.03, -0.08, -0.4]);
  } else {
    const wood = new THREE.MeshStandardMaterial({ color: 0xb98a57, roughness: 0.78, metalness: 0.04 });
    part(root, roundedBox('rounded-receiver', [0.21, 0.22, 0.48], metal, 0.055), [0, 0, -0.05]);
    part(root, roundedBox('stock', [0.17, 0.2, 0.48], wood, 0.06), [0, -0.015, 0.4], [-0.05, 0, 0]);
    part(root, roundedBox('grip', [0.115, 0.25, 0.14], rubber, 0.03), [0, -0.19, 0.13], [-0.2, 0, 0]);
    addBarrel(0.88, -0.75, 0.042);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.039, 0.72, 12), metal);
    part(root, tube, [0, -0.075, -0.69], [Math.PI / 2, 0, 0]);
    const pump = part(root, roundedBox('pump', [0.2, 0.17, 0.34], wood, 0.05), [0, -0.055, -0.48]);
    pump.userData.restZ = pump.position.z;
    for (const z of [-0.59, -0.52, -0.45, -0.38]) part(pump as unknown as THREE.Group, roundedBox('pump-rib', [0.21, 0.02, 0.018], dark, 0.004), [0, 0.03, z + 0.48]);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), accent);
    bead.position.set(0, 0.215, -1.11); root.add(bead);
    part(root, roundedBox('rear-ring', [0.09, 0.055, 0.025], dark, 0.01), [0, 0.2, 0.11]);
    const reloadShell = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.105, 8), new THREE.MeshStandardMaterial({ color: 0xb43f32, roughness: 0.58, metalness: 0.18 }));
    reloadShell.name = 'reload-shell';
    reloadShell.rotation.z = Math.PI / 2;
    reloadShell.position.set(-0.16, -0.13, -0.02);
    reloadShell.visible = false;
    root.add(reloadShell);
    addSocket('reload-socket-l', [-0.18, -0.14, 0.02]);
    addSocket('muzzle-socket', [0, 0.005, -1.2]);
    addSocket('eject-socket', [0.14, 0.045, -0.03]);
    addSocket('grip-socket-r', [0.03, -0.14, 0.12]);
    addSocket('support-socket-l', [-0.03, -0.025, 0], pump);
  }

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.1, 12), dark);
  const muzzleSocket = root.getObjectByName('muzzle-socket');
  if (muzzleSocket) {
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.copy(muzzleSocket.position);
    muzzle.userData.muzzle = true;
    root.add(muzzle);
    const flash = new THREE.Mesh(
      new THREE.ConeGeometry(id === 'scattergun' ? 0.12 : 0.075, id === 'scattergun' ? 0.42 : 0.28, 7),
      new THREE.MeshBasicMaterial({ color: 0xffc66d, transparent: true, opacity: 0.88, depthWrite: false }),
    );
    flash.name = 'world-muzzle-flash';
    flash.rotation.x = -Math.PI / 2;
    flash.position.copy(muzzleSocket.position).add(new THREE.Vector3(0, 0, -0.18));
    flash.visible = false;
    root.add(flash);
  }
  if (flattenMaterials && id === 'carbine') {
    const compatibilityHidden = new Set([
      'receiver-side-panel', 'receiver-accent-stripe', 'stock-support-rod',
      'trigger-guard-front', 'trigger-guard-bottom', 'trigger',
      'fore-end-side-rail', 'fore-end-vent', 'rail-tooth', 'gas-block',
      'rear-sight', 'front-sight', 'charging-handle', 'bolt-or-slide',
    ]);
    root.traverse((node) => {
      if (compatibilityHidden.has(node.name)) node.visible = false;
    });
  }
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = false;
    }
  });
  return root;
}

function wheel(root: THREE.Group, x: number, z: number, radius: number): void {
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.42, 24), MAT.rubber());
  tyre.rotation.z = Math.PI / 2;
  tyre.position.set(x, radius, z);
  tyre.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.44, radius * 0.44, 0.46, 20), MAT.brass());
  hub.rotation.z = Math.PI / 2;
  hub.position.copy(tyre.position);
  root.add(tyre, hub);
}

function decal(textValue: string, width: number, height: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#173039'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e6b84b'; ctx.lineWidth = 12; ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = '#f4ead2'; ctx.font = '900 58px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(textValue, 256, 67);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }));
}

export function buildRetroCoach(): THREE.Group {
  const root = new THREE.Group(); root.name = 'original-atomic-coach';
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd09b32, roughness: 0.48, metalness: 0.25 });
  part(root, roundedBox('coach-body', [5.3, 3.45, 13.6], bodyMat, 0.38, 5), [0, 2.02, 0]);
  part(root, roundedBox('coach-lower', [5.42, 0.72, 13.2], MAT.tealMetal(), 0.2), [0, 0.78, 0]);
  part(root, roundedBox('coach-roof', [5.08, 0.34, 12.8], MAT.cream(), 0.16), [0, 3.88, 0]);
  const glass = MAT.glass();
  for (const side of [-1, 1]) {
    for (let z = -4.8; z <= 4.8; z += 2.4) part(root, roundedBox('coach-window', [0.055, 1.34, 1.85], glass, 0.08), [side * 2.67, 2.68, z]);
  }
  part(root, roundedBox('windshield', [4.28, 1.36, 0.08], glass, 0.09), [0, 2.64, -6.82], [-0.08, 0, 0]);
  part(root, roundedBox('rear-glass', [4.18, 1.18, 0.08], glass, 0.09), [0, 2.64, 6.82]);
  for (const x of [-1.8, 1.8]) for (const z of [-4.6, 4.6]) wheel(root, x, z, 0.74);
  for (const x of [-1.75, 1.75]) {
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), new THREE.MeshStandardMaterial({ color: 0xfff0b2, emissive: 0xffb84d, emissiveIntensity: 2.3 }));
    light.position.set(x, 1.55, -6.88); root.add(light);
  }
  const sign = decal('ATOM-LINER 86', 3.6, 0.9); sign.position.set(0, 3.25, -6.9); root.add(sign);
  return root;
}

export function buildRetroDeliveryTruck(): THREE.Group {
  const root = new THREE.Group(); root.name = 'original-delivery-truck';
  part(root, roundedBox('cargo-body', [4.9, 3.75, 7.4], MAT.tealMetal(), 0.24, 5), [0, 2.35, 1.3]);
  part(root, roundedBox('cab', [4.7, 2.95, 3.5], MAT.cream(), 0.34, 5), [0, 1.75, -4.05]);
  part(root, roundedBox('windscreen', [3.55, 1.05, 0.07], MAT.glass(), 0.08), [0, 2.5, -5.82], [-0.08, 0, 0]);
  for (const side of [-1, 1]) part(root, roundedBox('cab-side-window', [0.06, 0.9, 1.35], MAT.glass(), 0.08), [side * 2.37, 2.45, -4.2]);
  for (const x of [-1.7, 1.7]) for (const z of [-3.55, 2.7]) wheel(root, x, z, 0.68);
  part(root, roundedBox('front-bumper', [4.9, 0.35, 0.35], MAT.dark(), 0.08), [0, 0.72, -5.92]);
  const sign = decal('ACRES SUPPLY', 3.5, 0.85); sign.position.set(0, 2.65, 5.02); sign.rotation.y = Math.PI; root.add(sign);
  return root;
}

type OperatorStance = 'stand' | 'crouch' | 'prone';

type OperatorRig = {
  pelvis: THREE.Group;
  spine: THREE.Group;
  leftUpperArm: THREE.Group;
  rightUpperArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftThigh: THREE.Group;
  rightThigh: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  weaponSocket: THREE.Group;
  reactionRoot: THREE.Group;
  weapon?: THREE.Group;
  weaponId: WeaponId;
};

function operatorRig(root: THREE.Group): OperatorRig | undefined {
  return root.userData.operatorRig as OperatorRig | undefined;
}

export function setOperatorWeapon(root: THREE.Group, weaponId: WeaponId, flattenMaterials = false): void {
  const rig = operatorRig(root);
  if (!rig || rig.weaponId === weaponId && rig.weapon) return;
  if (rig.weapon) rig.weaponSocket.remove(rig.weapon);
  const weapon = buildWeaponModel(weaponId, flattenMaterials);
  weapon.name = `operator-${weaponId}`;
  weapon.scale.setScalar(weaponId === 'smg' ? 0.72 : 0.68);
  weapon.rotation.y = Math.PI;
  // World weapons are presentation only: visual recoil must never move an authoritative hit proxy.
  weapon.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.userData.presentationOnly = true;
      node.raycast = () => undefined;
    }
  });
  rig.weaponSocket.add(weapon);
  rig.weapon = weapon;
  rig.weaponId = weaponId;
}

export function fireOperator(root: THREE.Group): void {
  root.userData.operatorShotAt = performance.now();
  const rig = operatorRig(root);
  if (rig?.weapon) {
    const flash = rig.weapon.getObjectByName('world-muzzle-flash');
    if (flash) flash.visible = true;
  }
}

export function reactOperator(root: THREE.Group, zone: 'head' | 'body' | 'limb'): void {
  root.userData.operatorHitAt = performance.now();
  root.userData.operatorHitZone = zone;
  root.userData.operatorHitSign = Number(root.userData.operatorHitSign ?? -1) * -1;
}

export function poseOperator(
  root: THREE.Group,
  stance: OperatorStance,
  speed: number,
  phase: number,
  blend = 1,
  aimPitch = 0,
): void {
  const rig = operatorRig(root);
  if (!rig) return;
  const shotAge = performance.now() - Number(root.userData.operatorShotAt ?? -10_000);
  const shotKick = shotAge < 180 ? Math.sin((shotAge / 180) * Math.PI) : 0;
  const hitAge = performance.now() - Number(root.userData.operatorHitAt ?? -10_000);
  const rawHitZone = root.userData.operatorHitZone;
  const hitZone = rawHitZone === 'head' || rawHitZone === 'limb' ? rawHitZone : 'body';
  const hitReaction = hitReactionAt(hitAge, hitZone);
  const hitSign = Number(root.userData.operatorHitSign ?? 1);
  rig.weaponSocket.position.x = hitReaction.roll * hitSign * 0.18;
  rig.weaponSocket.position.z = -0.36 + shotKick * 0.11 + hitReaction.envelope * 0.055;
  rig.weaponSocket.rotation.x = -shotKick * 0.12 + hitReaction.pitch;
  rig.weaponSocket.rotation.z = hitReaction.roll * hitSign;
  rig.reactionRoot.rotation.x = hitReaction.pitch * 0.72;
  rig.reactionRoot.rotation.z = hitReaction.roll * hitSign * 0.85;
  const actionPart = rig.weapon?.getObjectByName(rig.weaponId === 'scattergun' ? 'pump' : 'bolt-or-slide');
  if (actionPart) {
    const restZ = Number(actionPart.userData.restZ ?? actionPart.position.z);
    const actionDelay = rig.weaponId === 'scattergun' ? 180 : 0;
    const actionDuration = rig.weaponId === 'scattergun' ? 440 : rig.weaponId === 'smg' ? 44 : 62;
    const progress = THREE.MathUtils.clamp((shotAge - actionDelay) / actionDuration, 0, 1);
    actionPart.position.z = restZ + Math.sin(progress * Math.PI) * (rig.weaponId === 'scattergun' ? 0.22 : 0.08);
  }
  const flash = rig.weapon?.getObjectByName('world-muzzle-flash');
  if (flash) flash.visible = shotAge >= 0 && shotAge < 55;
  const gait = Math.sin(phase) * Math.min(1, speed / 4.8);
  const crouched = stance === 'crouch';
  const prone = stance === 'prone';
  const lerp = (from: number, to: number) => THREE.MathUtils.lerp(from, to, blend);
  rig.pelvis.position.y = lerp(rig.pelvis.position.y, prone ? 0.38 : crouched ? 0.67 : 0.9);
  rig.pelvis.rotation.x = lerp(rig.pelvis.rotation.x, prone ? -1.08 : 0);
  rig.spine.rotation.x = lerp(rig.spine.rotation.x, prone ? -0.24 : crouched ? 0.13 : aimPitch * 0.28);
  rig.leftThigh.rotation.x = lerp(rig.leftThigh.rotation.x, prone ? -1.22 + gait * 0.12 : crouched ? -0.7 + gait * 0.18 : gait * 0.48);
  rig.rightThigh.rotation.x = lerp(rig.rightThigh.rotation.x, prone ? -1.22 - gait * 0.12 : crouched ? -0.7 - gait * 0.18 : -gait * 0.48);
  rig.leftShin.rotation.x = lerp(rig.leftShin.rotation.x, prone ? 1.32 : crouched ? 1.15 : Math.max(0, -gait) * 0.32);
  rig.rightShin.rotation.x = lerp(rig.rightShin.rotation.x, prone ? 1.32 : crouched ? 1.15 : Math.max(0, gait) * 0.32);
  const shoulderPitch = prone ? -1.05 : -0.72 + aimPitch * 0.45;
  rig.leftUpperArm.rotation.x = lerp(rig.leftUpperArm.rotation.x, shoulderPitch - gait * 0.08);
  rig.rightUpperArm.rotation.x = lerp(rig.rightUpperArm.rotation.x, shoulderPitch + gait * 0.08);
  rig.leftUpperArm.rotation.z = lerp(rig.leftUpperArm.rotation.z, -0.54);
  rig.rightUpperArm.rotation.z = lerp(rig.rightUpperArm.rotation.z, 0.45);
  rig.leftForearm.rotation.x = lerp(rig.leftForearm.rotation.x, -1.08);
  rig.rightForearm.rotation.x = lerp(rig.rightForearm.rotation.x, -1.22);
}

export function buildOperator(team: Team, name = 'operator', flattenMaterials = false, weaponId: WeaponId = 'carbine'): THREE.Group {
  const root = new THREE.Group(); root.name = name;
  root.userData.dynamic = true;
  const teamColor = team === 0 ? 0x55d8d2 : 0xff745e;
  const uniform = new THREE.MeshStandardMaterial({
    color: teamColor,
    emissive: team === 0 ? 0x0b4c4b : 0x5a160f,
    emissiveIntensity: 0.24,
    roughness: 0.68,
  });
  const identifier = new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.72, roughness: 0.46 });
  const armour = MAT.dark();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99b78, roughness: 0.82 });
  const joint = (parent: THREE.Object3D, jointName: string, position: [number, number, number]) => {
    const group = new THREE.Group(); group.name = jointName; group.position.set(...position); parent.add(group); return group;
  };
  const limb = (parent: THREE.Group, meshName: string, size: [number, number, number], y: number, material: THREE.Material) => {
    const mesh = roundedBox(meshName, size, material, Math.min(...size) * 0.3, 3);
    mesh.position.y = y; mesh.userData.hitZone = 'limb'; parent.add(mesh); return mesh;
  };
  const presentationOnly = (mesh: THREE.Mesh): THREE.Mesh => {
    mesh.userData.presentationOnly = true;
    mesh.raycast = () => undefined;
    return mesh;
  };

  const pelvis = joint(root, 'pelvis-joint', [0, 0.9, 0]);
  const pelvisArmour = roundedBox('pelvis-armour', [0.5, 0.28, 0.32], armour, 0.08, 3);
  pelvisArmour.userData.hitZone = 'body'; pelvis.add(pelvisArmour);
  const spine = joint(pelvis, 'spine-joint', [0, 0.18, 0]);
  const torso = roundedBox('torso', [0.66, 0.72, 0.35], uniform, 0.13, 4);
  torso.position.y = 0.38; torso.userData.hitZone = 'body'; spine.add(torso);
  const vest = roundedBox('chest-armour', [0.71, 0.48, 0.41], armour, 0.08, 3);
  vest.position.set(0, 0.4, -0.04); vest.userData.hitZone = 'body'; spine.add(vest);
  const band = roundedBox('team-identifier', [0.74, 0.085, 0.43], identifier, 0.02, 2);
  band.position.set(0, team === 0 ? 0.55 : 0.42, -0.06); band.rotation.z = team === 0 ? 0 : -0.28; band.userData.hitZone = 'body'; spine.add(band);

  // Asymmetric presentation-only field gear improves team silhouettes and can
  // react to hits without moving the authoritative body/head/limb meshes.
  const reactionRoot = joint(spine, 'presentation-reaction-gear', [0, 0, 0]);
  if (flattenMaterials) {
    for (const name of ['field-radio-pack', 'asymmetric-shoulder-plate', 'utility-pouch', 'team-radio-antenna']) {
      const placeholder = new THREE.Group();
      placeholder.name = name;
      reactionRoot.add(placeholder);
    }
  } else {
    const backpack = presentationOnly(roundedBox('field-radio-pack', [0.42, 0.48, 0.18], armour, 0.06, 2));
    backpack.position.set(team === 0 ? -0.07 : 0.07, 0.38, 0.25); reactionRoot.add(backpack);
    const shoulderPlate = presentationOnly(roundedBox('asymmetric-shoulder-plate', [0.3, 0.13, 0.34], identifier, 0.035, 2));
    shoulderPlate.position.set(team === 0 ? -0.44 : 0.44, 0.67, 0); shoulderPlate.rotation.z = team === 0 ? -0.12 : 0.12; reactionRoot.add(shoulderPlate);
    const utilityPouch = presentationOnly(roundedBox('utility-pouch', [0.2, 0.22, 0.13], uniform, 0.035, 2));
    utilityPouch.position.set(team === 0 ? 0.24 : -0.24, 0.05, -0.21); reactionRoot.add(utilityPouch);
    const antenna = presentationOnly(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), identifier));
    antenna.name = 'team-radio-antenna'; antenna.position.set(team === 0 ? -0.16 : 0.16, 0.78, 0.22); antenna.rotation.z = team === 0 ? -0.12 : 0.12; reactionRoot.add(antenna);
  }

  const neck = joint(spine, 'neck-joint', [0, 0.81, 0]);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 12), skin); head.position.y = 0.18; head.userData.hitZone = 'head'; head.castShadow = true; neck.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.255, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.58), armour);
  helmet.position.y = 0.24; helmet.userData.hitZone = 'head'; neck.add(helmet);
  const visor = roundedBox('visor', [0.36, 0.1, 0.06], identifier, 0.025, 2); visor.position.set(0, 0.2, -0.2); visor.userData.hitZone = 'head'; neck.add(visor);

  const upperArms: THREE.Group[] = [];
  const forearms: THREE.Group[] = [];
  const thighs: THREE.Group[] = [];
  const shins: THREE.Group[] = [];
  for (const side of [-1, 1] as const) {
    const upperArm = joint(spine, side < 0 ? 'left-upper-arm-joint' : 'right-upper-arm-joint', [side * 0.42, 0.66, 0]);
    limb(upperArm, 'upper-arm', [0.19, 0.42, 0.21], -0.2, uniform);
    const forearm = joint(upperArm, side < 0 ? 'left-elbow-joint' : 'right-elbow-joint', [0, -0.4, 0]);
    limb(forearm, 'forearm', [0.17, 0.38, 0.19], -0.18, armour);
    const hand = roundedBox('hand', [0.18, 0.2, 0.18], armour, 0.065, 3); hand.position.y = -0.4; hand.userData.hitZone = 'limb'; forearm.add(hand);
    const thigh = joint(pelvis, side < 0 ? 'left-thigh-joint' : 'right-thigh-joint', [side * 0.17, -0.12, 0]);
    limb(thigh, 'thigh', [0.24, 0.49, 0.28], -0.23, uniform);
    const shin = joint(thigh, side < 0 ? 'left-knee-joint' : 'right-knee-joint', [0, -0.47, 0]);
    limb(shin, 'shin', [0.22, 0.48, 0.25], -0.22, armour);
    const foot = roundedBox('foot', [0.23, 0.16, 0.38], armour, 0.055, 3); foot.position.set(0, -0.49, -0.08); foot.userData.hitZone = 'limb'; shin.add(foot);
    upperArms.push(upperArm); forearms.push(forearm); thighs.push(thigh); shins.push(shin);
  }

  const beacon = team === 0
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), identifier)
    : new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.2, 3), identifier);
  beacon.name = 'team-shoulder-beacon'; beacon.position.set(team === 0 ? -0.44 : 0.44, 0.7, 0); beacon.rotation.z = Math.PI / 2; beacon.userData.hitZone = 'body'; spine.add(beacon);
  const weaponSocket = joint(spine, 'weapon-socket', [0.22, 0.43, -0.36]);
  const rig: OperatorRig = {
    pelvis, spine,
    leftUpperArm: upperArms[0], rightUpperArm: upperArms[1],
    leftForearm: forearms[0], rightForearm: forearms[1],
    leftThigh: thighs[0], rightThigh: thighs[1],
    leftShin: shins[0], rightShin: shins[1],
    weaponSocket, reactionRoot, weaponId,
  };
  root.userData.operatorRig = rig;
  setOperatorWeapon(root, weaponId, flattenMaterials);
  poseOperator(root, 'stand', 0, 0, 1);
  root.traverse((node) => { node.userData.targetRoot = root; });
  return root;
}
