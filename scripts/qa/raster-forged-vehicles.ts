#!/usr/bin/env tsx
// CPU rasteriser for the forged vehicles: GEOMETRY AND SILHOUETTE ONLY.
//
// It is NOT the game's shading - no TSL, no probes, no exposure, no post - so
// it can prove a shape and disprove a shape and NOTHING about the look. What it
// buys is a look at the bodies that needs no GPU and no browser slot, on a
// machine where ComfyUI holds the VRAM for hours at a time.
//
// It found three real defects on its first run that no unit gate could have:
// a waistline that humped over both wheel arches, a bumper z-fighting with the
// nose cap it was flush against, and a coach with no windscreen at all.
//
//   npx tsx scripts/qa/raster-forged-vehicles.ts <output-directory>
import * as THREE from 'three';
import sharp from 'sharp';
import { buildNuketown2 } from '../../src/nuketown2-arena';

const W = 1400;
const H = 800;

interface Tri { p: THREE.Vector3[]; n: THREE.Vector3[]; c: [number, number, number]; }

const PALETTE: Array<[RegExp, [number, number, number]]> = [
  [/ groove$/, [10, 10, 12]],
  [/ glass$/, [46, 62, 74]],
  [/ lining$/, [54, 54, 54]],
  [/ chrome$/, [186, 192, 198]],
  [/ tyre$/, [43, 43, 45]],
  [/ headLamp$/, [250, 240, 210]],
  [/ tailLamp$/, [200, 40, 44]],
  [/ accent$/, [168, 56, 44]],
  [/nuketown2-coach paint$/, [231, 222, 198]],
  [/truck-cab paint$/, [226, 223, 214]],
  [/sedan paint$/, [61, 111, 128]],
  [/ paint$/, [150, 150, 150]],
];

function colourOf(name: string): [number, number, number] {
  for (const [pattern, colour] of PALETTE) if (pattern.test(name)) return colour;
  return [140, 140, 140];
}

function collect(): Tri[] {
  const map = buildNuketown2(new THREE.Scene());
  map.root.updateMatrixWorld(true);
  const tris: Tri[] = [];
  map.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.name.startsWith('vehicle-forge ')) return;
    const colour = colourOf(node.name);
    const position = node.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = node.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
    for (let i = 0; i < position.count; i += 3) {
      const p: THREE.Vector3[] = [];
      const n: THREE.Vector3[] = [];
      for (let k = 0; k < 3; k += 1) {
        p.push(new THREE.Vector3().fromBufferAttribute(position, i + k).applyMatrix4(node.matrixWorld));
        n.push(new THREE.Vector3().fromBufferAttribute(normal, i + k).applyMatrix3(normalMatrix).normalize());
      }
      tris.push({ p, n, c: colour });
    }
  });
  return tris;
}

function render(tris: Tri[], camera: THREE.Camera, file: string): void {
  camera.updateMatrixWorld(true);
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const rgb = new Uint8Array(W * H * 3);
  // Sky gradient so a silhouette reads against something.
  for (let y = 0; y < H; y += 1) {
    const t = y / H;
    const r = Math.round(150 + 60 * (1 - t));
    const g = Math.round(168 + 52 * (1 - t));
    const b = Math.round(188 + 40 * (1 - t));
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 3;
      rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
    }
  }
  const depth = new Float32Array(W * H).fill(Infinity);
  const key = new THREE.Vector3(-0.62, 0.66, 0.42).normalize();
  const fill = new THREE.Vector3(0.4, 0.35, -0.85).normalize();

  for (const tri of tris) {
    const clip = tri.p.map((point) => point.clone().applyMatrix4(viewProjection));
    if (clip.some((c) => c.z < -1 || c.z > 1)) continue;
    const sx = clip.map((c) => (c.x * 0.5 + 0.5) * W);
    const sy = clip.map((c) => (1 - (c.y * 0.5 + 0.5)) * H);
    const minX = Math.max(0, Math.floor(Math.min(...sx)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(...sx)));
    const minY = Math.max(0, Math.floor(Math.min(...sy)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(...sy)));
    if (minX > maxX || minY > maxY) continue;
    const area = (sx[1]! - sx[0]!) * (sy[2]! - sy[0]!) - (sx[2]! - sx[0]!) * (sy[1]! - sy[0]!);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((sx[1]! - px) * (sy[2]! - py) - (sx[2]! - px) * (sy[1]! - py)) / area;
        const w1 = ((sx[2]! - px) * (sy[0]! - py) - (sx[0]! - px) * (sy[2]! - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * clip[0]!.z + w1 * clip[1]!.z + w2 * clip[2]!.z;
        const index = y * W + x;
        if (z >= depth[index]!) continue;
        depth[index] = z;
        const nx = w0 * tri.n[0]!.x + w1 * tri.n[1]!.x + w2 * tri.n[2]!.x;
        const ny = w0 * tri.n[0]!.y + w1 * tri.n[1]!.y + w2 * tri.n[2]!.y;
        const nz = w0 * tri.n[0]!.z + w1 * tri.n[1]!.z + w2 * tri.n[2]!.z;
        const length = Math.hypot(nx, ny, nz) || 1;
        const n = new THREE.Vector3(nx / length, ny / length, nz / length);
        const lambert = Math.max(0, n.dot(key)) * 0.78 + Math.max(0, n.dot(fill)) * 0.16 + 0.22;
        const o = index * 3;
        rgb[o] = Math.min(255, Math.round(tri.c[0] * lambert));
        rgb[o + 1] = Math.min(255, Math.round(tri.c[1] * lambert));
        rgb[o + 2] = Math.min(255, Math.round(tri.c[2] * lambert));
      }
    }
  }
  void sharp(Buffer.from(rgb), { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
}

const tris = collect();
console.log('forged triangles:', tris.length);

const out = process.argv[2] ?? '.';

// True side elevation of the coach: orthographic, square to its flank.
const elevation = new THREE.OrthographicCamera(-5.2, 5.2, 2.97, -2.97, 0.1, 60);
elevation.position.set(-6.4, 1.72, 14);
elevation.lookAt(-6.4, 1.72, -2.65);
render(tris, elevation, `${out}/coach-elevation.png`);

const shot = (id: string, from: [number, number, number], at: [number, number, number], fov = 46): void => {
  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.05, 200);
  camera.position.set(...from);
  camera.lookAt(...at);
  render(tris, camera, `${out}/${id}.png`);
};

shot('near-head-car', [9.0, 1.55, -3.6], [5.4, 1.0, -1.0]);
shot('mid-coach', [1.2, 1.7, -6.4], [-5.4, 1.5, -2.65]);
shot('far-street', [-16.0, 2.2, -6.0], [2.0, 1.6, 0.6], 55);
shot('truck-cab', [12.0, 1.6, 0.4], [7.6, 1.5, 2.4]);
shot('wheel-macro', [6.4, 0.55, -2.3], [5.2, 0.42, -1.6], 38);
