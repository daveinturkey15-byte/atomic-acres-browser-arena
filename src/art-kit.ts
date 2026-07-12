import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Team, WeaponId } from './protocol';

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
  gunmetal: () => texturedMaterial('./assets/original/textures/weapon-gunmetal.png', { roughness: 0.38, metalness: 0.62, repeatX: 2 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x151b20, roughness: 0.42, metalness: 0.5 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x111315, roughness: 0.9 }),
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
  const metal = MAT.gunmetal();
  const dark = MAT.dark();
  const rubber = MAT.rubber();
  const accent = new THREE.MeshStandardMaterial({
    color: id === 'carbine' ? 0xd6a944 : id === 'smg' ? 0x48b9b7 : 0xb75d45,
    roughness: 0.45,
    metalness: 0.35,
  });

  const long = id === 'scattergun';
  const compact = id === 'smg';
  const bodyLength = long ? 0.72 : compact ? 0.43 : 0.58;
  part(root, roundedBox('receiver', [0.18, 0.18, bodyLength], metal, 0.035), [0, 0, -0.15]);
  part(root, roundedBox('receiver-accent', [0.19, 0.055, bodyLength * 0.72], accent, 0.025), [0, 0.075, -0.13]);
  part(root, roundedBox('stock', [0.15, 0.18, compact ? 0.22 : 0.34], rubber, 0.045), [0, -0.015, bodyLength * 0.48]);
  part(root, roundedBox('grip', [0.105, 0.25, 0.13], rubber, 0.025), [0, -0.18, 0.02], [-0.18, 0, 0]);
  part(root, roundedBox('magazine', [compact ? 0.13 : 0.11, compact ? 0.28 : 0.33, 0.14], dark, 0.025), [0, -0.22, -0.18], [compact ? -0.08 : 0.12, 0, 0]);

  const barrelLength = long ? 0.65 : compact ? 0.31 : 0.48;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(long ? 0.035 : 0.026, long ? 0.04 : 0.032, barrelLength, 18), dark);
  part(root, barrel, [0, 0.005, -bodyLength * 0.5 - barrelLength * 0.48], [Math.PI / 2, 0, 0]);
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, barrelLength * 0.64, 12), metal);
  part(root, shroud, [0, 0.005, -bodyLength * 0.5 - barrelLength * 0.25], [Math.PI / 2, 0, 0]);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.11, 16), dark);
  part(root, muzzle, [0, 0.005, -bodyLength * 0.5 - barrelLength - 0.02], [Math.PI / 2, 0, 0]);
  muzzle.userData.muzzle = true;

  // Sight, rails, charging handle and visible hardware keep the silhouette authored rather than toy-like.
  part(root, roundedBox('top-rail', [0.13, 0.028, bodyLength * 0.78], dark, 0.008), [0, 0.12, -0.14]);
  for (const z of [-0.31, -0.22, -0.13, -0.04, 0.05]) {
    part(root, roundedBox('rail-notch', [0.16, 0.018, 0.018], MAT.brass(), 0.004, 2), [0, 0.142, z]);
  }
  part(root, roundedBox('optic-base', [0.12, 0.045, 0.13], dark, 0.014), [0, 0.145, 0.02]);
  const opticRing = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.011, 8, 20), dark);
  opticRing.position.set(0, 0.215, -0.025); root.add(opticRing);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), new THREE.MeshBasicMaterial({ color: 0x9af6ff, transparent: true, opacity: 0.58, depthWrite: false }));
  lens.position.set(0, 0.215, -0.026);
  root.add(lens);
  part(root, roundedBox('front-sight-post', [0.035, 0.105, 0.035], dark, 0.008), [0, 0.16, -bodyLength * 0.52]);
  part(root, roundedBox('charging-handle', [0.24, 0.035, 0.065], dark, 0.012), [0, 0.06, 0.05]);

  if (long) {
    part(root, roundedBox('pump', [0.19, 0.16, 0.3], new THREE.MeshStandardMaterial({ color: 0x704528, roughness: 0.82 }), 0.045), [0, -0.035, -0.48]);
    for (const z of [-0.59, -0.52, -0.45, -0.38]) part(root, roundedBox('pump-rib', [0.2, 0.018, 0.018], dark, 0.004), [0, -0.01, z]);
  }
  if (compact) {
    part(root, roundedBox('foregrip', [0.09, 0.22, 0.09], rubber, 0.022), [0, -0.13, -0.33], [-0.08, 0, 0]);
  }

  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = false;
    }
  });
  batchStaticMeshes(root, root, () => '', flattenMaterials);
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

export function buildOperator(team: Team, name = 'operator', flattenMaterials = false): THREE.Group {
  const root = new THREE.Group(); root.name = name;
  const uniform = new THREE.MeshStandardMaterial({ color: team === 0 ? 0x4dbab6 : 0xd96a55, roughness: 0.68 });
  const armour = MAT.dark();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99b78, roughness: 0.82 });
  const torso = roundedBox('torso', [0.64, 0.86, 0.34], uniform, 0.14, 4); torso.position.y = 1.28; torso.userData.hitZone = 'body';
  const vest = roundedBox('vest', [0.7, 0.58, 0.4], armour, 0.08); vest.position.set(0, 1.32, -0.04); vest.userData.hitZone = 'body';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 14), skin); head.position.y = 1.98; head.userData.hitZone = 'head'; head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.255, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), armour); helmet.position.y = 2.04; helmet.userData.hitZone = 'head';
  root.add(torso, vest, head, helmet);
  for (const side of [-1, 1]) {
    const arm = roundedBox('arm', [0.18, 0.72, 0.2], uniform, 0.07); arm.position.set(side * 0.43, 1.32, -0.05); arm.rotation.x = -0.35; arm.userData.hitZone = 'limb';
    const leg = roundedBox('leg', [0.24, 0.82, 0.27], armour, 0.08); leg.position.set(side * 0.18, 0.5, 0); leg.userData.hitZone = 'limb';
    root.add(arm, leg);
  }
  const weapon = new THREE.Group();
  weapon.name = 'operator-carbine-silhouette';
  const receiver = roundedBox('operator-receiver', [0.15, 0.14, 0.72], MAT.gunmetal(), 0.025, 2);
  receiver.position.z = -0.26;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.48, 10), MAT.dark());
  barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.82;
  const grip = roundedBox('operator-grip', [0.09, 0.22, 0.11], MAT.rubber(), 0.018, 2);
  grip.position.set(0, -0.15, -0.08); grip.rotation.x = -0.18;
  const magazine = roundedBox('operator-magazine', [0.1, 0.27, 0.13], armour, 0.018, 2);
  magazine.position.set(0, -0.18, -0.34); magazine.rotation.x = 0.16;
  weapon.add(receiver, barrel, grip, magazine);
  weapon.scale.setScalar(0.78); weapon.position.set(0.28, 1.38, -0.4); weapon.rotation.y = Math.PI;
  root.add(weapon);
  batchStaticMeshes(root, root, (mesh) => String(mesh.userData.hitZone ?? 'visual'), flattenMaterials);
  root.traverse((node) => { node.userData.targetRoot = root; });
  return root;
}
