/**
 * Adapted from @thai-kit/props 0.4.0, Municipal Wheelie Bin, MIT.
 * Original factory/license: docs/third-party/thaikit/municipal-wheelie-bin/.
 * Only its box/frustum/cylinder recipe is needed here. No preview rig, canvas
 * grime, collider proposal, animation or additional Three.js instance enters play.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import recipe from './municipal-wheelie-bin.geometry.json';

export const THAIKIT_BIN_PROP_ID = 'yard domestic bin blue';
/** Original six-box presentation envelope, relative to its unchanged yard anchor. */
export const THAIKIT_BIN_ENVELOPE = Object.freeze({
  min: [-0.28, 0.01, -0.29] as const,
  max: [0.28, 0.915, 0.26] as const,
});

const palette = new Map<number, number>([
  [5211490, 0x586766], // clean neutral grey-green container
  [5935208, 0x637271], // moulded ribs
  [4684378, 0x4f5d5c], // rear panel
  [6067312, 0x58798a], // muted blue lid, retaining the existing bin identity
  [3102016, 0x486575], // lid moulding
  [1710616, 0x292d2e], // tyres and axle
  [2763304, 0x4e5558], // wheel hubs
]);

function tint(geometry: THREE.BufferGeometry, sourceHex: number): THREE.BufferGeometry {
  const color = new THREE.Color(palette.get(sourceHex) ?? sourceHex);
  const values = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let index = 0; index < values.length; index += 3) {
    values[index] = color.r; values[index + 1] = color.g; values[index + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

function recipeBox(row: number[]): THREE.BufferGeometry {
  const [hex, x, y, z, width, height, depth, rx = 0, ry = 0, rz = 0] = row;
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz);
  geometry.translate(x, y, z);
  return tint(geometry, hex);
}

function recipeFrustum(row: number[]): THREE.BufferGeometry {
  const [hex, x, bottom, z, width0, depth0, width1, depth1, height] = row;
  const geometry = new THREE.BoxGeometry(1, height, 1);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const fraction = (positions.getY(index) + height / 2) / height;
    positions.setX(index, positions.getX(index) * THREE.MathUtils.lerp(width0, width1, fraction));
    positions.setZ(index, positions.getZ(index) * THREE.MathUtils.lerp(depth0, depth1, fraction));
  }
  geometry.computeVertexNormals();
  geometry.translate(x, bottom + height / 2, z);
  return tint(geometry, hex);
}

export function createMunicipalWheelieBinGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (const component of recipe) {
    // Both body and closed lid have identity placements in this pinned recipe.
    if (component.placements.length !== 1 || component.placements[0].some((value) => value !== 0)) {
      throw new Error('Wheelie-bin recipe needs an explicit placement adaptation');
    }
    pieces.push(...component.boxes.map(recipeBox), ...component.frusta.map(recipeFrustum));
    for (const cylinder of component.cyls) {
      // Physical tyre diameters are under 0.18 m after fitting. Preserve round
      // silhouettes without spending 20/14 radial segments on tiny tyres/hubs.
      const segments = cylinder.seg === 20 ? 12 : cylinder.seg === 14 ? 8 : cylinder.seg;
      const geometry = new THREE.CylinderGeometry(cylinder.rt, cylinder.rb, cylinder.h, segments);
      geometry.rotateZ(cylinder.rz);
      geometry.translate(cylinder.at[0], cylinder.at[1], cylinder.at[2]);
      pieces.push(tint(geometry, cylinder.hex));
    }
  }
  const merged = mergeGeometries(pieces, false);
  pieces.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('Wheelie-bin geometry could not merge');
  merged.computeBoundingBox();
  const bounds = merged.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  merged.translate(-centre.x, -bounds.min.y, -centre.z);
  merged.scale(0.56 / size.x, 0.905 / size.y, 0.55 / size.z);
  merged.translate(0, 0.01, -0.015);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createMunicipalWheelieBinMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.64, metalness: 0, vertexColors: true });
  material.type = 'MeshStandardMaterial';
  material.name = 'nuketown2-thaikit-clean-bin-plastic';
  return material;
}

/** Shared geometry/material are arena-owned and disposed through the normal scene lifetime. */
export function createMunicipalWheelieBin(
  geometry = createMunicipalWheelieBinGeometry(),
  material = createMunicipalWheelieBinMaterial(),
): THREE.Mesh<THREE.BufferGeometry, MeshStandardNodeMaterial> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.presentationOnly = true;
  mesh.userData.propId = THAIKIT_BIN_PROP_ID;
  mesh.userData.sourceAsset = '@thai-kit/props@0.4.0/municipal-wheelie-bin';
  return mesh;
}
