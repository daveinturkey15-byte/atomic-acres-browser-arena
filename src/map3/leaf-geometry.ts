/**
 * map3/leaf-geometry.ts — cupped, twisted, asymmetric leaf cards.
 *
 * The single biggest reason our foliage reads as "low-poly geometry" and a
 * reference jungle reads as photographic is not density, texture resolution or
 * renderer version. It is that our leaf is a FLAT SLAB and theirs is a surface.
 *
 * A real leaf is never planar. It cups along its midrib, droops under its own
 * weight toward the tip, twists slightly about its own axis, and is not
 * symmetric about the midrib. Each of those is one term in the same function,
 * and together they cost four extra triangles per leaf. That curvature is what
 * lets a single directional light produce a gradient ACROSS one leaf instead of
 * one flat tone, which is most of the difference the eye actually reads.
 *
 * Everything here is generated. No texture, no atlas, no imported mesh — the
 * blade outline is cut into the geometry itself so the silhouette is real
 * rather than alpha-tested, which also means no alpha sorting, no coverage-mip
 * work, and no sparkle at distance. That trade (a few more triangles, zero
 * alpha) is the right one for a leaf measured in centimetres on screen.
 *
 * Vertex attributes emitted for the material to use:
 *   - `aSpan`   0 at the petiole, 1 at the tip. Drives senescence and droop.
 *   - `aSide`  -1..1 across the blade. Drives the underside/edge treatment.
 *   - `aDead`   0..1 per-leaf senescence, so a branch can carry a few dying
 *               leaves without a second material.
 */
import * as THREE from 'three';

export interface LeafOptions {
  /** Blade length in metres, petiole to tip. */
  length: number;
  /** Blade half-width at its widest point, in metres. */
  width: number;
  /** Segments along the blade. 4 is enough for the droop arc to read. */
  segmentsV?: number;
  /** Segments across the blade. 2 gives the midrib cup its middle vertex. */
  segmentsU?: number;
  /** Downward bend from petiole to tip, radians of total arc. */
  droop?: number;
  /** Cup depth as a fraction of half-width; the blade folds up along the midrib. */
  cup?: number;
  /** Twist about the blade's own long axis, radians end to end. */
  twist?: number;
  /** Asymmetry: 0 = symmetric, 1 = one side is twice the other. */
  asymmetry?: number;
  /** 0..1 senescence written to `aDead` for the whole leaf. */
  dead?: number;
  /** Where the blade reaches full width, 0..1 along its length. */
  widestAt?: number;
}

const DEFAULTS = {
  segmentsV: 4,
  segmentsU: 2,
  droop: 0.55,
  cup: 0.35,
  twist: 0.25,
  asymmetry: 0.18,
  dead: 0,
  widestAt: 0.42,
};

/**
 * Lanceolate outline: 0 at the petiole, 1 at `widestAt`, tapering to a point.
 * Two different powers either side of the widest point are what stop it reading
 * as an ellipse — a leaf is blunt at the base and drawn out at the tip.
 */
function outline(t: number, widestAt: number): number {
  if (t <= 0 || t >= 1) return 0;
  if (t < widestAt) {
    const k = t / widestAt;
    return Math.pow(k, 0.62);
  }
  const k = (1 - t) / (1 - widestAt);
  return Math.pow(k, 0.85);
}

/**
 * Build one leaf blade lying in +Z (length) / ±X (width), petiole at the origin,
 * normal roughly +Y before droop. Caller positions it with a matrix.
 */
export function createLeafGeometry(opts: LeafOptions): THREE.BufferGeometry {
  const o = { ...DEFAULTS, ...opts };
  const nv = Math.max(2, o.segmentsV);
  const nu = Math.max(2, o.segmentsU % 2 === 0 ? o.segmentsU : o.segmentsU + 1);

  const cols = nu + 1;
  const rows = nv + 1;
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const aSpan: number[] = [];
  const aSide: number[] = [];
  const aDead: number[] = [];

  for (let r = 0; r < rows; r++) {
    const t = r / nv;                       // 0 petiole -> 1 tip
    const halfWidth = outline(t, o.widestAt) * o.width;

    // Droop: the blade bends downward along an arc, accelerating toward the tip
    // so the base leaves the stem flat and the tip hangs. t^1.6 rather than t
    // is what keeps the join to the twig from looking hinged.
    const bend = o.droop * Math.pow(t, 1.6);
    const spineZ = Math.sin(bend) / Math.max(o.droop, 1e-4) * o.length * o.droop;
    const spineY = -(1 - Math.cos(bend)) / Math.max(o.droop, 1e-4) * o.length * o.droop;
    // Twist accumulates along the blade about its own long axis.
    const tw = o.twist * t;
    const cosT = Math.cos(tw);
    const sinT = Math.sin(tw);

    for (let c = 0; c < cols; c++) {
      const u = c / nu;                      // 0..1 across
      let s = u * 2 - 1;                     // -1..1, signed side
      // Asymmetry widens one side and narrows the other, so no leaf mirrors.
      const sideScale = 1 + o.asymmetry * s;
      const x0 = s * halfWidth * sideScale;
      // Cup: the blade folds up away from the midrib, strongest mid-blade.
      const cupY = o.cup * halfWidth * (s * s) * (1 - Math.abs(t - 0.5) * 0.8);

      // Apply twist in the blade's local X/Y before adding the spine offset.
      const x = x0 * cosT - cupY * sinT;
      const y = x0 * sinT + cupY * cosT + spineY;
      const z = spineZ;

      position.push(x, y, z);
      normal.push(0, 1, 0);                  // replaced by computeVertexNormals
      uv.push(u, t);
      aSpan.push(t);
      aSide.push(s);
      aDead.push(o.dead);
    }
  }

  const index: number[] = [];
  for (let r = 0; r < nv; r++) {
    for (let c = 0; c < nu; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(aSpan, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
  g.setAttribute('aDead', new THREE.Float32BufferAttribute(aDead, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * A flat comparison card with the same triangle budget and the same outline,
 * so an exhibit can show the two side by side and the ONLY difference is the
 * curvature. Used by the nature corridor's before/after plate.
 */
export function createFlatLeafGeometry(opts: LeafOptions): THREE.BufferGeometry {
  return createLeafGeometry({ ...opts, droop: 0, cup: 0, twist: 0, asymmetry: 0 });
}

/** Deterministic hash so a seed produces the same plant every run. */
export function hash11(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export interface SprayOptions {
  count: number;
  /** Radius of the spray in metres. */
  radius: number;
  /** Vertical spread of the attachment points. */
  height: number;
  seed?: number;
  leaf: LeafOptions;
  /** Fraction of leaves given senescence, 0..1. */
  deadFraction?: number;
  /** Downward pitch range in radians for the leaf's own attachment. */
  pitch?: [number, number];
}

/**
 * Merge a spray of leaves into ONE geometry.
 *
 * Deliberately merged rather than instanced: a clump of 30 leaves is small
 * enough that a single draw beats 30 instanced matrices, and merging lets each
 * leaf carry its own senescence in `aDead` without a per-instance attribute.
 * The instancing happens one level up — the whole clump is the instance.
 */
export function createLeafSpray(opts: SprayOptions): THREE.BufferGeometry {
  const seed = opts.seed ?? 1;
  const deadFraction = opts.deadFraction ?? 0.12;
  const pitch = opts.pitch ?? [0.15, 1.05];
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < opts.count; i++) {
    const h0 = hash11(seed * 31.7 + i * 7.13);
    const h1 = hash11(seed * 17.3 + i * 3.71);
    const h2 = hash11(seed * 53.9 + i * 11.9);
    const h3 = hash11(seed * 71.1 + i * 5.17);

    const yaw = h0 * Math.PI * 2;
    const down = pitch[0] + h1 * (pitch[1] - pitch[0]);
    const r = opts.radius * (0.25 + 0.75 * Math.sqrt(h2));
    const scale = 0.7 + h3 * 0.6;

    const dead = h2 < deadFraction ? 0.35 + h3 * 0.65 : 0;
    const leaf = createLeafGeometry({
      ...opts.leaf,
      length: opts.leaf.length * scale,
      width: opts.leaf.width * scale,
      // Every leaf gets its own curvature so no two catch the light alike.
      droop: (opts.leaf.droop ?? DEFAULTS.droop) * (0.7 + h1 * 0.7),
      twist: (opts.leaf.twist ?? DEFAULTS.twist) * (h0 * 2 - 1) * 1.4,
      asymmetry: (opts.leaf.asymmetry ?? DEFAULTS.asymmetry) * (h3 * 2 - 1),
      dead,
    });

    e.set(-down, yaw, (h1 - 0.5) * 0.5);
    q.setFromEuler(e);
    pos.set(Math.cos(yaw) * r * 0.35, opts.height * (h2 - 0.5), Math.sin(yaw) * r * 0.35);
    m.compose(pos, q, one);
    leaf.applyMatrix4(m);
    parts.push(leaf);
  }

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * The litter skirt.
 *
 * Where a plant meets the ground our foliage currently ends on a clean line,
 * and that line is the first artefact the eye finds — it reads as a decal
 * pasted on a floor. A ring of small tilted fallen leaves around the base
 * breaks it, and because it is emitted into the plant's OWN geometry it
 * travels with the instance for free: no second scatter pass, no placement
 * query, no chance of the skirt and the plant disagreeing about the ground.
 */
export function createLitterSkirt(
  radius: number,
  count: number,
  leaf: LeafOptions,
  seed = 3,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < count; i++) {
    const h0 = hash11(seed * 13.7 + i * 9.31);
    const h1 = hash11(seed * 41.3 + i * 2.77);
    const h2 = hash11(seed * 91.7 + i * 6.19);

    const yaw = h0 * Math.PI * 2;
    const r = radius * (0.45 + 0.85 * Math.sqrt(h1));
    const scale = 0.55 + h2 * 0.5;
    // Fallen leaves lie nearly flat but never perfectly — a few degrees of
    // tilt is what catches a highlight and stops the litter reading as paint.
    const tilt = (h1 - 0.5) * 0.5;

    const g = createLeafGeometry({
      ...leaf,
      length: leaf.length * scale,
      width: leaf.width * scale,
      droop: 0.15,
      cup: 0.5 + h2 * 0.5,          // dried leaves curl UP at the edges
      twist: (h0 - 0.5) * 0.9,
      dead: 0.55 + h2 * 0.45,       // litter is always senescent
    });
    e.set(-Math.PI / 2 + tilt, yaw, (h2 - 0.5) * 0.6);
    q.setFromEuler(e);
    pos.set(Math.cos(yaw) * r, 0.012 + h2 * 0.02, Math.sin(yaw) * r);
    m.compose(pos, q, one);
    g.applyMatrix4(m);
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Minimal non-indexed merge over geometries that share an attribute set.
 * Written here rather than pulled from three/addons so this module has no
 * dependency beyond `three` itself and can be lifted into an arena unchanged.
 */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'aSpan', 'aSide', 'aDead'] as const;
  const sizes: Record<string, number> = {
    position: 3, normal: 3, uv: 2, aSpan: 1, aSide: 1, aDead: 1,
  };
  const acc: Record<string, number[]> = {};
  names.forEach((n) => { acc[n] = []; });
  const index: number[] = [];
  let vertexOffset = 0;

  for (const g of list) {
    const posAttr = g.getAttribute('position');
    if (!posAttr) continue;
    for (const n of names) {
      const a = g.getAttribute(n);
      const size = sizes[n];
      if (a) {
        for (let i = 0; i < a.count * size; i++) acc[n].push(a.array[i] as number);
      } else {
        for (let i = 0; i < posAttr.count * size; i++) acc[n].push(0);
      }
    }
    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) index.push((idx.array[i] as number) + vertexOffset);
    } else {
      for (let i = 0; i < posAttr.count; i++) index.push(i + vertexOffset);
    }
    vertexOffset += posAttr.count;
  }

  const out = new THREE.BufferGeometry();
  for (const n of names) {
    out.setAttribute(n, new THREE.Float32BufferAttribute(acc[n], sizes[n]));
  }
  out.setIndex(index);
  return out;
}
