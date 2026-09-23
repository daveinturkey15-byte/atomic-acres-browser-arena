import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box2 } from '../collision';
import type { BallisticMaterialId } from '../ballistics';
import { createStudioSurface } from './materials';
import { studioRoadHalfWidth } from './layout';

export type StudioSolid = { id: string; mesh: THREE.Object3D; bounds: Box2; material: BallisticMaterialId };

function ribbon(side: number, inner: number, outer: number, y: number): THREE.BufferGeometry {
  const points: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 68; i += 1) {
    const z = i - 34, width = studioRoadHalfWidth(z);
    for (const offset of [inner, outer]) {
      const x = side === 0 ? (offset === inner ? -width : width) : side * (width + offset);
      points.push(x, y, z); uv.push(x / 2, z / 2);
    }
    if (i < 68) {
      const k = i * 2;
      if (side < 0) indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      else indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

const KERB_TREAD = 0.18, KERB_TOP = 0.10, KERB_CHAMFER = 0.045, KERB_STONE = 0.915, KERB_JOINT = 0.006, KERB_JOINT_DEPTH = 0.009;

/** Continuous kerb: the road-side profile (face, 45-degree chamfer, top, kerb-side
 * face) extruded along the curved road edge with a recessed joint every stone, so
 * the run follows studioRoadHalfWidth instead of stepping in detached boxes. */
function kerbGeometry(side: number): THREE.BufferGeometry {
  const profile: ReadonlyArray<readonly [number, number]> = [
    [0, 0], [0, KERB_TOP - KERB_CHAMFER], [KERB_CHAMFER, KERB_TOP], [KERB_TREAD, KERB_TOP], [KERB_TREAD, 0],
  ];
  const joints: number[] = [];
  for (let j = -34 + KERB_STONE; j < 34; j += KERB_STONE) joints.push(j);
  const stations: Array<{ z: number; scale: number }> = [];
  for (let z = -34; z <= 34; z += 1) stations.push({ z, scale: 1 });
  for (const j of joints) stations.push({ z: j - KERB_JOINT, scale: 1 }, { z: j, scale: 1 - KERB_JOINT_DEPTH / KERB_TOP }, { z: j + KERB_JOINT, scale: 1 });
  stations.sort((a, b) => a.z - b.z);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const segments = profile.length - 1;
  for (let i = 0; i < stations.length; i += 1) {
    const { z, scale } = stations[i];
    const w = studioRoadHalfWidth(z);
    for (let s = 0; s < segments; s += 1) {
      for (const [off, h] of [profile[s], profile[s + 1]]) {
        positions.push(side * (w + off), h * scale, z);
        uvs.push(z / 2, off / 2);
      }
    }
    if (i > 0) for (let s = 0; s < segments; s += 1) {
      const a = (i - 1) * segments * 2 + s * 2, b = a + 1, c = i * segments * 2 + s * 2, d = c + 1;
      if (side > 0) indices.push(a, c, b, c, d, b);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** One oriented collision proxy per visible kerb stone; boundaries match the
 * joints drawn by kerbGeometry and the tread band stays out of the road. */
function kerbStoneBounds(side: number): Box2[] {
  const boxes: Box2[] = [];
  const count = Math.ceil(68 / KERB_STONE);
  for (let k = 0; k < count; k += 1) {
    const za = -34 + k * KERB_STONE, zb = Math.min(za + KERB_STONE, 34);
    const ax = side * studioRoadHalfWidth(za), bx = side * studioRoadHalfWidth(zb);
    const len = Math.hypot(bx - ax, zb - za);
    const tx = (bx - ax) / len, tz = (zb - za) / len;
    const nx = side * tz, nz = -side * tx;
    const cx = (ax + bx) / 2 + nx * KERB_TREAD / 2, cz = (za + zb) / 2 + nz * KERB_TREAD / 2;
    const halfRun = len / 2 + 0.004;
    boxes.push({
      minX: cx - halfRun, maxX: cx + halfRun, minY: 0, maxY: KERB_TOP,
      minZ: cz - KERB_TREAD / 2, maxZ: cz + KERB_TREAD / 2,
      rotation: [0, Math.atan2(-tz, tx), 0],
    });
  }
  return boxes;
}

export function createStudioGround(): { root: THREE.Group; solids: StudioSolid[]; surfaces: THREE.MeshStandardMaterial[] } {
  const root = new THREE.Group(); root.name = 'world-studio-ground-and-street';
  const solids: StudioSolid[] = [];
  const asphalt = createStudioSurface('asphalt'), concrete = createStudioSurface('concrete');
  const soil = createStudioSurface('soil'), wood = createStudioSurface('timber');
  const grass = createStudioSurface('grass');
  const stone = new THREE.MeshStandardMaterial({ color: 0xb9b19d, roughness: .95, map: concrete.map, normalMap: concrete.normalMap });
  const metal = new THREE.MeshStandardMaterial({ color: 0x666b62, roughness: .46, metalness: .65 });
  const globe = new THREE.MeshStandardMaterial({ color: 0xf5efdc, roughness: .3, emissive: 0xffd4a1, emissiveIntensity: .12 });
  function box(id: string, size: [number, number, number], position: [number, number, number], mat: THREE.Material, material: BallisticMaterialId = 'concrete', solid = true) {
    const geometry = new THREE.BoxGeometry(...size);
    // Scale box UVs by face dimensions for one-metre aggregate.
    const uvs = geometry.getAttribute('uv');
    for (let i = 0; i < uvs.count; i += 1) {
      const face = Math.floor(i / 4);
      uvs.setXY(i, uvs.getX(i) * (face < 2 ? size[2] : size[0]) / 2, uvs.getY(i) * (face === 2 || face === 3 ? size[2] : size[1]) / 2);
    }
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(...position); mesh.name = id;
    mesh.castShadow = size[1] > .3; mesh.receiveShadow = true; root.add(mesh);
    if (solid) solids.push({ id, mesh, material, bounds: { minX: position[0] - size[0] / 2, maxX: position[0] + size[0] / 2, minY: position[1] - size[1] / 2, maxY: position[1] + size[1] / 2, minZ: position[2] - size[2] / 2, maxZ: position[2] + size[2] / 2 } });
    else { mesh.userData.presentationOnly = true; mesh.userData.blocksShots = false; }
    return mesh;
  }
  const foundation: THREE.Mesh = box('supported-playable-ground', [80, .3, 68], [0, -.15, 0], grass, 'earth');
  // Grass must not continue under the road: the 14 mm layered surfaces fight
  // in the distant review camera's depth buffer. Keep the physical foundation
  // and its sides, and author the two lawn tops around the actual road ribbon.
  const shell = foundation.geometry;
  const shellIndex = shell.getIndex()!;
  const shellNormals = shell.getAttribute('normal');
  const retained: number[] = [];
  for (let i = 0; i < shellIndex.count; i += 3) {
    if (shellNormals.getY(shellIndex.getX(i)) < .99)
      retained.push(shellIndex.getX(i), shellIndex.getX(i + 1), shellIndex.getX(i + 2));
  }
  shell.setIndex(retained);
  const lawnTops = [-1, 1].map(side => {
    const geometry = ribbon(side, 0, 1, .15);
    const positions = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i += 1) {
      if (i % 2 === 1) positions.setX(i, side * 40);
      uv.setXY(i, positions.getX(i) / 2, positions.getZ(i) / 2);
    }
    return geometry;
  });
  foundation.geometry = mergeGeometries([shell, ...lawnTops])!;
  shell.dispose(); lawnTops.forEach(geometry => geometry.dispose());
  // Only bridge to the terrain ring: a giant flat plate would bury the coastal water.
  const apronGeometry = new THREE.CircleGeometry(57, 96);
  apronGeometry.rotateX(-Math.PI / 2);
  const apron = new THREE.Mesh(apronGeometry, soil); apron.position.y = -.015;
  apron.name = 'terrain-ring-apron'; apron.receiveShadow = true; apron.userData.presentationOnly = true; root.add(apron);
  const road = new THREE.Mesh(ribbon(0, 0, 1, .014), asphalt); road.name = 'curved-asphalt-road'; road.receiveShadow = true; root.add(road);
  road.userData.presentationOnly = true;
  for (const side of [-1, 1]) {
    const walk = new THREE.Mesh(ribbon(side, .05, 1.95, .038), concrete); walk.name = `street-sidewalk-${side}`; walk.receiveShadow = true; root.add(walk); walk.userData.presentationOnly = true;
    // One continuous kerb surface per side; every visible stone keeps its own
    // oriented collision proxy on the same visible mesh (no detached witnesses).
    const kerb = new THREE.Mesh(kerbGeometry(side), stone);
    kerb.name = `street-kerb-${side}`; kerb.receiveShadow = true; root.add(kerb);
    kerbStoneBounds(side).forEach((proxy, k) => solids.push({ id: `kerb-${side}-stone-${k}`, mesh: kerb, material: 'concrete', bounds: proxy }));
    box(`garage-drive-${side}`, [12, .06, 12], [side * 22, .028, 22], concrete, 'concrete', false);
    box(`yard-crosspath-${side}`, [24, .06, 1.75], [side * 25, .03, -13], concrete, 'concrete', false);
    box(`yard-sidepath-${side}`, [1.7, .06, 38], [side * 29, .03, 0], concrete, 'concrete', false);
    box(`front-door-path-${side}`, [5, .06, 1.8], [side * 11.5, .03, 4], concrete, 'concrete', false);
    box(`fence-side-${side}`, [.16, 2.35, 68], [side * 39.85, 1.175, 0], wood, 'fence');
    box(`fence-end-${side}`, [80, 2.35, .16], [0, 1.175, side * 33.85], wood, 'fence');
  }
  const postGeometry = new THREE.BoxGeometry(.2, 2.6, .2);
  const postTransforms: THREE.Matrix4[] = [];
  const matrix = new THREE.Matrix4();
  for (let n = -38; n <= 38; n += 4) for (const side of [-1, 1]) postTransforms.push(matrix.makeTranslation(n, 1.3, side * 33.85).clone());
  for (let n = -30; n <= 30; n += 4) for (const side of [-1, 1]) postTransforms.push(matrix.makeTranslation(side * 39.85, 1.3, n).clone());
  const posts = new THREE.InstancedMesh(postGeometry, wood, postTransforms.length);
  postTransforms.forEach((m, i) => posts.setMatrixAt(i, m)); posts.name = 'fence-posts'; posts.castShadow = true; posts.receiveShadow = true; root.add(posts);
  posts.userData.presentationOnly = true;
  // Telegraph poles and globes establish reference scale without competing lights.
  const poleGeometry = new THREE.CylinderGeometry(.065, .12, 3.9, 10);
  const globeGeometry = new THREE.SphereGeometry(.29, 14, 10);
  for (const side of [-1, 1]) for (const z of [-27, -13, 4, 23]) {
    const x = side * (studioRoadHalfWidth(z) + 1.2);
    const pole = new THREE.Mesh(poleGeometry, metal); pole.position.set(x, 1.95, z); pole.castShadow = true; pole.name = `streetlamp-${side}-${z}`; root.add(pole);
    solids.push({ id: pole.name, mesh: pole, material: 'structural-metal', bounds: { minX: x - .12, maxX: x + .12, minZ: z - .12, maxZ: z + .12, minY: 0, maxY: 3.9 } });
    const ball = new THREE.Mesh(globeGeometry, globe); ball.position.set(x, 4.05, z); root.add(ball); ball.userData.presentationOnly = true;
    box(`lamp-plinth-${side}-${z}`, [.48, .15, .48], [x, .075, z], stone, 'concrete');
  }
  const joint = new THREE.MeshStandardMaterial({ color: 0x807f71, roughness: 1 });
  for (const side of [-1, 1]) for (let z = -32; z < 34; z += 2.2) box(`pavement-joint-${side}-${z}`, [1.85, .004, .016], [side * (studioRoadHalfWidth(z) + 1), .073, z], joint, 'concrete', false);
  for (const z of [18, -18]) {
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .018, 24), metal); cover.position.set(.8, .025, z); cover.receiveShadow = true; root.add(cover); cover.userData.presentationOnly = true;
  }
  return { root, solids, surfaces: [asphalt, concrete, grass, stone] };
}
