/**
 * Method-level contract for the orientation step shared by every forge emitter.
 *
 * `pushTriangle` decides an emitted vertex ORDER and then copies whole vertex
 * records in that order. The historical `normal-winding` before/after hashes
 * pinned the shape of one authoring state to prove the normal repair had not
 * moved a vertex; this test proves the same thing for ARBITRARY inputs instead:
 *
 *   1. `orientTriangle` returns `indices` or `indices` with its second and third
 *      entries swapped, never anything else, and never mutates a record.
 *   2. Emitting records in that order keeps each position bound to its own
 *      normal and UV, bit for bit, including degenerate and all-zero inputs.
 *   3. On every nondegenerate face the emitted winding agrees with the analytic
 *      reference normal, for both the per-quad (`needsFlip`) and per-triangle
 *      decision paths.
 *
 * The checker is validated against reference faults that must be rejected:
 * inverted winding, detached UVs, perturbed positions, zeroed normals, negated
 * normals on flip, and dropped degenerate triangles.
 */
import { describe, expect, it } from 'vitest';
import { needsFlip, orientTriangle, pushTriangle, type Vec2 } from './geometry';

type Vec3 = [number, number, number];
type Tri = readonly [number, number, number];
interface Emitted { position: number[]; normal: number[]; uv: number[] }
type Emitter = (p: readonly Vec3[], n: readonly Vec3[], uv: readonly Vec2[], indices: Tri, flip: boolean, orientPerTriangle: boolean) => Emitted;

/** The production copy loop, parameterised by the orientation decision under test. */
function emitWith(orient: typeof orientTriangle): Emitter {
  return (p, n, uv, indices, flip, orientPerTriangle) => {
    const out: Emitted = { position: [], normal: [], uv: [] };
    for (const index of orient(p, n, indices, flip, orientPerTriangle)) {
      out.position.push(p[index]![0], p[index]![1], p[index]![2]);
      out.normal.push(n[index]![0], n[index]![1], n[index]![2]);
      out.uv.push(uv[index]![0], uv[index]![1]);
    }
    return out;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Case { p: Vec3[]; n: Vec3[]; uv: Vec2[]; indices: Tri; flip: boolean; orientPerTriangle: boolean; kind: string }

/** Arbitrary quads: general, opposed normals, tiny, collinear, repeated, zero-normal, permuted indices. */
function generateCases(count: number, seed: number): Case[] {
  const random = mulberry32(seed);
  const span = (scale: number): number => (random() * 2 - 1) * scale;
  const cases: Case[] = [];
  const kinds = ['general', 'opposed', 'tiny', 'collinear', 'repeated', 'zero-normal', 'mixed-normal'] as const;
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length]!;
    const scale = kind === 'tiny' ? 1e-6 : 5;
    const p: Vec3[] = Array.from({ length: 4 }, () => [span(scale), span(scale), span(scale)]);
    if (kind === 'collinear') { const d: Vec3 = [span(1), span(1), span(1)]; for (let k = 1; k < 4; k++) p[k] = [p[0]![0] + d[0] * k, p[0]![1] + d[1] * k, p[0]![2] + d[2] * k]; }
    if (kind === 'repeated') p[2] = [...p[0]!] as Vec3;
    const a = p[0]!, b = p[1]!, c = p[2]!;
    const face: Vec3 = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const sign = kind === 'opposed' ? -1 : 1;
    const n: Vec3[] = p.map((): Vec3 => {
      if (kind === 'zero-normal') return [0, 0, 0];
      const jitter: Vec3 = [span(0.2), span(0.2), span(0.2)];
      const length = Math.hypot(...face) || 1;
      const base: Vec3 = kind === 'mixed-normal' ? [span(1), span(1), span(1)] : [face[0] / length * sign + jitter[0], face[1] / length * sign + jitter[1], face[2] / length * sign + jitter[2]];
      return base;
    });
    const uv: Vec2[] = p.map((): Vec2 => [random(), random()]);
    const permutations: Tri[] = [[0, 1, 2], [0, 2, 3], [1, 3, 2], [3, 0, 1], [2, 1, 0]];
    cases.push({ p, n, uv, indices: permutations[Math.floor(random() * permutations.length)]!, flip: random() < 0.5, orientPerTriangle: random() < 0.5, kind });
  }
  return cases;
}

function cross(u: Vec3, v: Vec3): Vec3 { return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; }
function sub(a: readonly number[], b: readonly number[]): Vec3 { return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!]; }
function dot(a: readonly number[], b: readonly number[]): number { return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!; }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Run an emitter over every case and return every contract violation found.
 * Each emitted record must be an input record chosen by an allowed permutation,
 * and every nondegenerate face must wind with its reference normal.
 */
function violations(emit: Emitter, cases: readonly Case[]): string[] {
  const found: string[] = [];
  cases.forEach((c, caseIndex) => {
    const snapshot = clone({ p: c.p, n: c.n, uv: c.uv });
    const flip = c.orientPerTriangle ? c.flip : needsFlip(c.indices.map(k => c.p[k]!), c.n[c.indices[0]]!);
    const out = emit(c.p, c.n, c.uv, c.indices, flip, c.orientPerTriangle);
    const tag = `#${caseIndex} ${c.kind}`;
    if (JSON.stringify({ p: c.p, n: c.n, uv: c.uv }) !== JSON.stringify(snapshot)) found.push(`${tag}: input records mutated`);
    if (out.position.length !== 9 || out.normal.length !== 9 || out.uv.length !== 6) { found.push(`${tag}: topology ${out.position.length / 3} vertices emitted`); return; }
    const allowed: Tri[] = [c.indices, [c.indices[0], c.indices[2], c.indices[1]]];
    const matches = allowed.filter(order => order.every((index, k) => {
      const record = [c.p[index]![0], c.p[index]![1], c.p[index]![2], c.n[index]![0], c.n[index]![1], c.n[index]![2], c.uv[index]![0], c.uv[index]![1]];
      const emitted = [...out.position.slice(k * 3, k * 3 + 3), ...out.normal.slice(k * 3, k * 3 + 3), ...out.uv.slice(k * 2, k * 2 + 2)];
      return record.every((value, j) => Object.is(value, emitted[j]));
    }));
    if (matches.length === 0) { found.push(`${tag}: emitted records are not an allowed permutation of the input records`); return; }
    // Orientation: judge in the representation the decision path uses.
    const f = c.orientPerTriangle ? Math.fround : (x: number) => x;
    const a = out.position.slice(0, 3).map(f), b = out.position.slice(3, 6).map(f), d = out.position.slice(6, 9).map(f);
    const face = cross(sub(b, a), sub(d, a));
    if (Math.hypot(...face) < 1e-10) return;
    // Per-triangle reference exactly as production forms it: Float32 normals summed in the given index order.
    const reference = c.orientPerTriangle
      ? [0, 1, 2].map(axis => c.indices.reduce((sum, index) => sum + Math.fround(c.n[index]![axis]!), 0))
      : c.n[c.indices[0]]!;
    if (dot(face, reference) < 0) found.push(`${tag}: emitted winding opposes its reference normal`);
  });
  return found;
}

// Exercise the production copy loop, not an equivalent loop in the test.
const emitProduction: Emitter = (p, n, uv, indices, flip, perTriangle) => {
  const out: Emitted = { position: [], normal: [], uv: [] };
  pushTriangle(out, p, n, uv, indices, flip, perTriangle);
  return out;
};

const cases = generateCases(3500, 0x5eed);

describe('orientTriangle: the orientation step preserves records and orients every nondegenerate face', () => {
  it('covers every input class, including degenerate faces and all-zero normals', () => {
    const kinds = new Set(cases.map(c => c.kind));
    expect([...kinds].sort()).toEqual(['collinear', 'general', 'mixed-normal', 'opposed', 'repeated', 'tiny', 'zero-normal']);
    expect(cases.some(c => c.orientPerTriangle && c.kind === 'tiny')).toBe(true);
    expect(cases.some(c => c.orientPerTriangle && c.kind === 'zero-normal')).toBe(true);
  });
  it('returns only the identity or the second/third swap of the given indices', () => {
    for (const c of cases) {
      const order = orientTriangle(c.p, c.n, c.indices, c.flip, c.orientPerTriangle);
      expect(order[0]).toBe(c.indices[0]);
      expect([...order].sort()).toEqual([...c.indices].sort());
      if (!c.orientPerTriangle) expect(order).toEqual(c.flip ? [c.indices[0], c.indices[2], c.indices[1]] : c.indices);
    }
  });
  it('keeps degenerate faces on the caller\'s decision and never flips against an all-zero reference', () => {
    const selected = cases.filter(c => c.orientPerTriangle && (c.kind === 'collinear' || c.kind === 'repeated' || c.kind === 'zero-normal'));
    expect(selected.length).toBeGreaterThan(100);
    let degenerate = 0, zeroReference = 0;
    for (const c of selected) {
      const order = orientTriangle(c.p, c.n, c.indices, c.flip, true);
      const [a, b, d] = c.indices.map(k => c.p[k]!.map(Math.fround) as Vec3);
      const face = cross(sub(b!, a!), sub(d!, a!));
      if (Math.hypot(...face) < 1e-10) {
        // Degenerate topology is preserved and the caller's decision stands.
        degenerate++;
        expect(order).toEqual(c.flip ? [c.indices[0], c.indices[2], c.indices[1]] : c.indices);
      } else if (c.kind === 'zero-normal') {
        // A zero reference cannot oppose the face: the given order is emitted unflipped.
        zeroReference++;
        expect(order).toEqual(c.indices);
      }
    }
    expect(degenerate).toBeGreaterThan(50);
    expect(zeroReference).toBeGreaterThan(50);
  });
  it('emits complete position/normal/UV records and face-aligned windings for arbitrary inputs', () => {
    expect(violations(emitProduction, cases)).toEqual([]);
  });
  it('flips the winding when, and only when, the analytic reference opposes the face (per-quad path)', () => {
    let flipped = 0, kept = 0;
    for (const c of cases.filter(x => x.kind === 'general' || x.kind === 'opposed')) {
      const positions = c.indices.map(k => c.p[k]!);
      const reference = c.n[c.indices[0]]!;
      const face = cross(sub(positions[1]!, positions[0]!), sub(positions[2]!, positions[0]!));
      const flip = needsFlip(positions, reference);
      expect(flip).toBe(dot(face, reference) < 0);
      if (flip) flipped++; else kept++;
    }
    expect(flipped).toBeGreaterThan(100);
    expect(kept).toBeGreaterThan(100);
  });
});

describe('the checker rejects reference faults', () => {
  const swapped = (i: Tri): Tri => [i[0], i[2], i[1]];
  const faults: Array<[string, Emitter, RegExp]> = [
    ['inverted winding', emitWith((p, n, i, flip, per) => { const o = orientTriangle(p, n, i, flip, per); return o === i ? swapped(i) : i; }), /opposes its reference normal/],
    ['UVs detached from their vertex', (p, n, uv, i, flip, per) => { const out = emitWith(orientTriangle)(p, n, uv, i, flip, per); out.uv = i.flatMap(k => [uv[k]![0], uv[k]![1]]); return out; }, /not an allowed permutation/],
    ['position perturbed by one float ulp-scale step', (p, n, uv, i, flip, per) => { const out = emitWith(orientTriangle)(p, n, uv, i, flip, per); out.position[4] = out.position[4]! + 1e-7; return out; }, /not an allowed permutation/],
    ['normals zeroed', (p, n, uv, i, flip, per) => { const out = emitWith(orientTriangle)(p, n, uv, i, flip, per); out.normal = out.normal.map(() => 0); return out; }, /not an allowed permutation/],
    ['normal negated on flip (the historical opposition bug)', (p, n, uv, i, flip, per) => { const o = orientTriangle(p, n, i, flip, per); const out = emitWith(orientTriangle)(p, n, uv, i, flip, per); if (o !== i) out.normal = out.normal.map(v => -v); return out; }, /not an allowed permutation/],
    ['degenerate triangles dropped', (p, n, uv, i, flip, per) => { const a = p[i[0]]!, b = p[i[1]]!, c = p[i[2]]!; if (Math.hypot(...cross(sub(b, a), sub(c, a))) < 1e-10) return { position: [], normal: [], uv: [] }; return emitWith(orientTriangle)(p, n, uv, i, flip, per); }, /topology 0 vertices/],
    ['input records mutated in place', (p, n, uv, i, flip, per) => { const out = emitWith(orientTriangle)(p, n, uv, i, flip, per); (n[i[0]] as Vec3)[0] = -(n[i[0]] as Vec3)[0]; return out; }, /input records mutated/],
  ];
  it.each(faults)('%s is detected', (_name, emitter, pattern) => {
    const found = violations(emitter, clone(cases));
    expect(found.length).toBeGreaterThan(0);
    expect(found.some(message => pattern.test(message))).toBe(true);
  });
});
