/**
 * textures.ts — CPU-generated DataTexture families for the nature lane.
 *
 * Everything is a Uint8 RGBA field computed from seeded noise, so the maps are
 * identical in the browser and in Node QA (no <canvas>, no document guard
 * needed), and a test can look inside them. Sizes stay modest (128–256 px);
 * each family is generated ONCE and shared by every material that uses it.
 */
import * as THREE from 'three';
import { clamp01, fbm2, hash2, mulberry32, smoothstep, valueNoise2 } from './seeded';

export type NatureTextures = Readonly<{
  /** 2x2 leaf-cluster atlas (alpha cut): 0 oak, 1 maple-warm, 2 birch, 3 hedge sprig. */
  leafAtlas: THREE.DataTexture;
  /** Opaque dense clipped-hedge surface. */
  hedgeSurface: THREE.DataTexture;
  /** Rough broadleaf/conifer bark, vertical striation. */
  bark: THREE.DataTexture;
  /** Birch bark: pale with dark lenticel bands. */
  birchBark: THREE.DataTexture;
  /** 2x1 conifer atlas: 0 opaque needle mass (cone core), 1 alpha-cut branch spray. */
  needles: THREE.DataTexture;
  /** Tileable ground/rock detail multiplied over terrain vertex colours. */
  groundDetail: THREE.DataTexture;
  /** 2x2 flower head atlas (alpha cut). */
  flowers: THREE.DataTexture;
  /** 2x1 far tree silhouettes (alpha cut): 0 conifer, 1 broadleaf. */
  farTrees: THREE.DataTexture;
  all: readonly THREE.DataTexture[];
}>;

function makeTexture(
  data: Uint8Array,
  width: number,
  height: number,
  name: string,
  srgb: boolean,
  repeat: boolean,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.name = name;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function put(data: Uint8Array, i: number, r: number, g: number, b: number, a: number): void {
  data[i] = Math.round(clamp01(r) * 255);
  data[i + 1] = Math.round(clamp01(g) * 255);
  data[i + 2] = Math.round(clamp01(b) * 255);
  data[i + 3] = Math.round(clamp01(a) * 255);
}

type Leaf = { x: number; y: number; rot: number; len: number; wid: number; tone: number; seed: number };

/**
 * Ovate leaf signed field. Returns coverage 0..1 (1 inside) with a soft 1.5
 * texel edge, and a 0..1 "t" along the leaf for the base-to-tip shading.
 */
function leafCoverage(px: number, py: number, leaf: Leaf, edge: number): { cover: number; t: number; u: number } {
  const dx = px - leaf.x;
  const dy = py - leaf.y;
  const c = Math.cos(-leaf.rot);
  const s = Math.sin(-leaf.rot);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  const t = clamp01((ly + leaf.len * 0.5) / leaf.len);
  const halfWidth = leaf.wid * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.35 * t);
  const serrate = 1 + 0.06 * Math.sin(t * 28 + leaf.seed * 9);
  const d = Math.abs(lx) - halfWidth * serrate;
  const inside = ly > -leaf.len * 0.5 && ly < leaf.len * 0.5;
  const cover = inside ? 1 - smoothstep(-edge, edge, d) : 0;
  return { cover, t, u: halfWidth > 0 ? lx / halfWidth : 1 };
}

const LEAF_PALETTES: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0.14, 0.30, 0.08, 0.40, 0.58, 0.18], // oak: deep green to fresh green
  [0.26, 0.34, 0.07, 0.62, 0.55, 0.16], // maple-warm: olive to warm yellow-green
  [0.20, 0.38, 0.10, 0.52, 0.66, 0.22], // birch: lighter, cooler
  [0.10, 0.26, 0.07, 0.30, 0.50, 0.14], // hedge: dense dark box
];

function drawLeafCell(
  data: Uint8Array,
  size: number,
  cellX: number,
  cellY: number,
  cellSize: number,
  cellIndex: number,
  count: number,
  leafLen: number,
  opaque: boolean,
): void {
  const rng = mulberry32(0x1eaf + cellIndex * 7919);
  const leaves: Leaf[] = [];
  const margin = opaque ? -leafLen : leafLen * 0.55;
  for (let i = 0; i < count; i += 1) {
    leaves.push({
      x: margin + rng() * (cellSize - margin * 2),
      y: margin + rng() * (cellSize - margin * 2),
      rot: rng() * Math.PI * 2,
      len: leafLen * (0.7 + rng() * 0.6),
      wid: leafLen * (0.22 + rng() * 0.14),
      tone: rng(),
      seed: rng(),
    });
  }
  const pal = LEAF_PALETTES[cellIndex % LEAF_PALETTES.length];
  const edge = 1.2;
  const border = opaque ? 0 : 2;
  for (let y = 0; y < cellSize; y += 1) {
    for (let x = 0; x < cellSize; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let bestCover = 0;
      let r = pal[0] * 0.6;
      let g = pal[1] * 0.6;
      let b = pal[2] * 0.6;
      // Later leaves overlap earlier ones: iterate in order and let the last
      // covering leaf win, so clusters read as stacked, not blended mush.
      for (const leaf of leaves) {
        const { cover, t, u } = leafCoverage(px, py, leaf, edge);
        if (cover <= 0.02) continue;
        const shade = 0.72 + 0.28 * t + (1 - Math.abs(u)) * 0.06 - leaf.tone * 0.18;
        const midrib = Math.abs(u) < 0.07 ? 1.12 : 1;
        const lr = (pal[0] + (pal[3] - pal[0]) * t) * shade * midrib;
        const lg = (pal[1] + (pal[4] - pal[1]) * t) * shade * midrib;
        const lb = (pal[2] + (pal[5] - pal[2]) * t) * shade * midrib;
        r = r + (lr - r) * cover;
        g = g + (lg - g) * cover;
        b = b + (lb - b) * cover;
        bestCover = Math.max(bestCover, cover);
      }
      const atBorder = x < border || y < border || x >= cellSize - border || y >= cellSize - border;
      const alpha = opaque ? 1 : atBorder ? 0 : bestCover;
      const i = ((cellY * cellSize + y) * size + (cellX * cellSize + x)) * 4;
      put(data, i, r, g, b, alpha);
    }
  }
}

export function createLeafAtlasData(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const cell = size / 2;
  drawLeafCell(data, size, 0, 0, cell, 0, 34, cell * 0.30, false);
  drawLeafCell(data, size, 1, 0, cell, 1, 30, cell * 0.32, false);
  drawLeafCell(data, size, 0, 1, cell, 2, 44, cell * 0.22, false);
  drawLeafCell(data, size, 1, 1, cell, 3, 60, cell * 0.20, false);
  return data;
}

export function createHedgeSurfaceData(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  drawLeafCell(data, size, 0, 0, size, 3, 420, size * 0.075, true);
  // Contact darkening of the inner mass: dim texels that no leaf lit strongly.
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i + 1] / 255;
    const k = 0.78 + 0.22 * smoothstep(0.18, 0.5, lum);
    data[i] = Math.round(data[i] * k);
    data[i + 1] = Math.round(data[i + 1] * k);
    data[i + 2] = Math.round(data[i + 2] * k);
  }
  return data;
}

export function createBarkData(size = 256, birch = false): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const period = 8;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * period;
      const v = (y / size) * period;
      // Anisotropic: stretched along V so ridges run up the trunk.
      const ridge = fbm2(u * 3, v * 0.45, 4, 0xbadc, period * 3);
      const fine = valueNoise2(u * 12, v * 1.5, 0x51, period * 12) * 0.5;
      let r: number;
      let g: number;
      let b: number;
      if (birch) {
        const band = smoothstep(0.55, 0.85, valueNoise2(u * 0.8, v * 5, 0x77, period) * 0.5 + 0.5)
          * smoothstep(0.3, 0.7, fbm2(u * 4, v * 0.6, 2, 0x79, period * 4) * 0.5 + 0.5);
        const pale = 0.82 + fine * 0.06 + ridge * 0.05;
        r = pale - band * 0.62;
        g = pale - band * 0.62;
        b = pale * 0.96 - band * 0.6;
      } else {
        const tone = 0.32 + ridge * 0.16 + fine * 0.05;
        r = tone * 1.05;
        g = tone * 0.86;
        b = tone * 0.66;
        const moss = smoothstep(0.62, 0.9, fbm2(u * 1.2, v * 1.2, 3, 0x88, Math.round(period * 1.2)) * 0.5 + 0.5) * 0.35;
        r -= moss * 0.12;
        g += moss * 0.10;
      }
      put(data, (y * size + x) * 4, r, g, b, 1);
    }
  }
  return data;
}

/** Distance from (px, py) to the segment (ax, ay)-(bx, by). */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? clamp01(((px - ax) * vx + (py - ay) * vy) / len2) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/**
 * Conifer needle atlas, 2 cells side by side (width = 2 x height):
 *   cell 0 (u 0..0.5)  opaque needle mass, tileable inside the cell — the
 *                      cone core under the branches samples this;
 *   cell 1 (u 0.5..1)  alpha-cut branch spray: one twig from the base up
 *                      the cell with side twigs and needle strokes — the
 *                      branch cards sample this.
 */
export function createNeedleData(width = 256, height = 128): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  const cell = width / 2;
  const period = 6;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const u = (x / cell) * period;
      const v = (y / height) * period;
      const mass = fbm2(u * 2, v * 2, 3, 0x9e, period * 2) * 0.5 + 0.5;
      const streak = valueNoise2(u * 14, v * 3, 0x9f, period * 14) * 0.5 + 0.5;
      const lum = 0.55 + mass * 0.45 + (streak - 0.5) * 0.3;
      put(data, (y * width + x) * 4, 0.10 * lum, 0.30 * lum, 0.13 * lum, 1);
    }
  }
  // Branch spray strokes, authored in cell pixels: main twig bottom-centre to
  // near the top, side twigs alternating left/right, needles off every twig.
  type Stroke = readonly [number, number, number, number, number, number]; // ax, ay, bx, by, halfWidth, tone
  const rng = mulberry32(0x5b4a_9ce1);
  const strokes: Stroke[] = [];
  const mainX = cell * 0.5;
  const baseY = height * 0.04;
  const tipY = height * 0.96;
  strokes.push([mainX, baseY, mainX, tipY, 1.4, 0.55]);
  const needlesAlong = (ax: number, ay: number, bx: number, by: number, count: number, len: number): void => {
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    const tx = dx / L;
    const ty = dy / L;
    for (let n = 0; n < count; n += 1) {
      const t = (n + 0.5) / count;
      const px = ax + dx * t;
      const py = ay + dy * t;
      const side = n % 2 === 0 ? 1 : -1;
      const ang = 0.95 + rng() * 0.35;
      const nx = tx * Math.cos(ang) - ty * Math.sin(ang) * side;
      const ny = tx * Math.sin(ang) * side + ty * Math.cos(ang);
      const l = len * (0.7 + rng() * 0.6) * (1 - t * 0.35);
      strokes.push([px, py, px + nx * l, py + ny * l, 0.75, 0.75 + rng() * 0.3]);
    }
  };
  needlesAlong(mainX, baseY + height * 0.08, mainX, tipY, 26, height * 0.075);
  const sideTwigs = 9;
  for (let s = 0; s < sideTwigs; s += 1) {
    const t = 0.12 + (s / sideTwigs) * 0.78;
    const y0 = baseY + (tipY - baseY) * t;
    const side = s % 2 === 0 ? 1 : -1;
    const reach = cell * (0.42 - t * 0.30) * (0.85 + rng() * 0.3);
    const rise = height * (0.08 + rng() * 0.05);
    const x1 = mainX + side * reach;
    const y1 = y0 + rise;
    strokes.push([mainX, y0, x1, y1, 1.0, 0.6]);
    needlesAlong(mainX + side * reach * 0.15, y0 + rise * 0.15, x1, y1, 12, height * 0.06);
  }
  const edge = 0.9;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let cover = 0;
      let tone = 0.6;
      for (const [ax, ay, bx, by, hw, tn] of strokes) {
        const d = segmentDistance(px, py, ax, ay, bx, by) - hw;
        const c = 1 - smoothstep(-edge, edge, d);
        if (c > cover) { cover = c; tone = tn; }
      }
      const t = y / height;
      const shade = tone * (0.7 + 0.3 * t) + hash2(x, y, 0x5b) * 0.08;
      const border = x < 2 || y < 2 || x >= cell - 2 || y >= height - 2;
      put(data, (y * width + cell + x) * 4, 0.09 * shade, 0.27 * shade, 0.11 * shade, border ? 0 : cover);
    }
  }
  return data;
}

export function createGroundDetailData(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const period = 10;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * period;
      const v = (y / size) * period;
      const grain = fbm2(u, v, 5, 0x6d, period) * 0.5 + 0.5;
      const crack = 1 - smoothstep(0.48, 0.52, Math.abs(valueNoise2(u * 1.6, v * 1.6, 0x6e, period * 1.6 | 0)));
      const lum = 0.74 + grain * 0.36 - crack * 0.12;
      put(data, (y * size + x) * 4, lum, lum * 0.99, lum * 0.97, 1);
    }
  }
  return data;
}

const FLOWER_TONES: ReadonlyArray<readonly [number, number, number]> = [
  [0.86, 0.22, 0.24], [0.95, 0.78, 0.18], [0.92, 0.92, 0.88], [0.62, 0.36, 0.78],
];

export function createFlowerAtlasData(size = 128): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const cell = size / 2;
  for (let ci = 0; ci < 4; ci += 1) {
    const cx = (ci % 2) * cell;
    const cy = Math.floor(ci / 2) * cell;
    const rng = mulberry32(0xf10e + ci * 31);
    const heads: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 7; i += 1) heads.push([cell * (0.2 + rng() * 0.6), cell * (0.2 + rng() * 0.6), cell * (0.07 + rng() * 0.05), 5 + Math.floor(rng() * 3)]);
    const tone = FLOWER_TONES[ci];
    for (let y = 0; y < cell; y += 1) {
      for (let x = 0; x < cell; x += 1) {
        let cover = 0;
        let r = 0.2;
        let g = 0.35;
        let b = 0.12;
        for (const [hx, hy, rad, petals] of heads) {
          const dx = x + 0.5 - hx;
          const dy = y + 0.5 - hy;
          const ang = Math.atan2(dy, dx);
          const pr = rad * (0.72 + 0.28 * Math.abs(Math.cos(ang * petals * 0.5)));
          const d = Math.hypot(dx, dy);
          const c = 1 - smoothstep(pr - 1, pr + 0.5, d);
          if (c > cover) {
            cover = c;
            const centre = 1 - smoothstep(rad * 0.2, rad * 0.4, d);
            r = tone[0] * (1 - centre) + 0.95 * centre;
            g = tone[1] * (1 - centre) + 0.82 * centre;
            b = tone[2] * (1 - centre) + 0.25 * centre;
          }
        }
        const border = x < 1 || y < 1 || x >= cell - 1 || y >= cell - 1;
        put(data, ((cy + y) * size + cx + x) * 4, r, g, b, border ? 0 : cover);
      }
    }
  }
  return data;
}

export function createFarTreeData(width = 128, height = 64): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  const cell = width / 2;
  for (let ci = 0; ci < 2; ci += 1) {
    for (let y = 0; y < height; y += 1) {
      const t = y / height; // 0 base, 1 tip
      for (let x = 0; x < cell; x += 1) {
        const u = (x + 0.5) / cell * 2 - 1;
        let half: number;
        if (ci === 0) {
          // conifer: narrow triangle with layered rim
          half = (1 - t) * 0.42 * (1 + 0.16 * Math.sin(t * 40)) + 0.02;
          if (t < 0.08) half = 0.05;
        } else {
          // broadleaf: lobed dome on a short trunk
          const dome = t > 0.22 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.61) / 0.42, 2))) * 0.62 : 0.05;
          half = dome * (1 + 0.1 * Math.sin(t * 26 + u * 9)) + 0.01;
        }
        const noise = hash2(x, y, ci) * 0.05;
        const inside = Math.abs(u) < half - noise;
        const shade = 0.55 + 0.45 * t;
        const i = (y * width + ci * cell + x) * 4;
        const border = x < 1 || x >= cell - 1 || y >= height - 1;
        if (ci === 0) put(data, i, 0.10 * shade, 0.20 * shade, 0.12 * shade, inside && !border ? 1 : 0);
        else put(data, i, 0.16 * shade, 0.30 * shade, 0.12 * shade, inside && !border ? 1 : 0);
      }
    }
  }
  return data;
}

export function createNatureTextures(): NatureTextures {
  const leafAtlas = makeTexture(createLeafAtlasData(256), 256, 256, 'ws-nature-leaf-atlas', true, false);
  const hedgeSurface = makeTexture(createHedgeSurfaceData(256), 256, 256, 'ws-nature-hedge-surface', true, true);
  const bark = makeTexture(createBarkData(256, false), 256, 256, 'ws-nature-bark', true, true);
  const birchBark = makeTexture(createBarkData(128, true), 128, 128, 'ws-nature-birch-bark', true, true);
  const needles = makeTexture(createNeedleData(256, 128), 256, 128, 'ws-nature-needles', true, false);
  const groundDetail = makeTexture(createGroundDetailData(256), 256, 256, 'ws-nature-ground-detail', true, true);
  const flowers = makeTexture(createFlowerAtlasData(128), 128, 128, 'ws-nature-flowers', true, false);
  const farTrees = makeTexture(createFarTreeData(128, 64), 128, 64, 'ws-nature-far-trees', true, false);
  const all = [leafAtlas, hedgeSurface, bark, birchBark, needles, groundDetail, flowers, farTrees];
  return Object.freeze({ leafAtlas, hedgeSurface, bark, birchBark, needles, groundDetail, flowers, farTrees, all });
}
