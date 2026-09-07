/**
 * map3/noise.ts — value noise and fBM as TSL node expressions.
 *
 * WHY THIS EXISTS.
 *
 * The forest floor was built from products of sines — `sin(x*a) * cos(z*b)` —
 * which is the obvious thing to reach for and produces a visible CHECKERBOARD.
 * It cannot not: a product of two axis-aligned periodic functions is a grid by
 * construction, and no amount of adding more octaves of the same shape hides
 * it, because every octave is aligned to the same two axes.
 *
 * Real noise needs two properties that trick lacks:
 *
 *   1. A HASH, so neighbouring cells are uncorrelated rather than related by a
 *      smooth function. Value noise interpolates between per-lattice-point
 *      random values; the randomness is what breaks the periodicity.
 *   2. A ROTATION BETWEEN OCTAVES. Even with a good hash, stacking octaves on
 *      the same axes leaves faint axis-aligned structure. Rotating the domain
 *      by an irrational-ish angle each octave scatters that completely, and it
 *      costs two multiplies.
 *
 * Everything here is a plain JS function that RETURNS a node expression, not a
 * TSL `Fn`. The octave count is known at build time so the sum unrolls, which
 * matches the repo's production TSL and avoids needing statement scope.
 *
 * All of it is textureless by design: no lookup table, no blue-noise image, no
 * atlas. That keeps the "nothing imported" property of the whole map intact.
 */
import * as TSL from 'three/tsl';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  abs, cos, dot, float, floor, fract, mix, sin, smoothstep, vec2,
} = TSL as unknown as Record<string, any>;

/**
 * Deterministic hash of a 2D lattice point to [0,1).
 *
 * The `sin`-and-scale hash is the standard shader trick. It is not a good
 * random number generator in any statistical sense, but it is stable, cheap,
 * needs no texture, and is uncorrelated enough at these scales that the eye
 * cannot find a pattern — which is the only property that matters here.
 */
export function hash2(p: any) {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
}

/**
 * Value noise on a 2D lattice, smoothly interpolated.
 *
 * The interpolant is the classic smoothstep polynomial `f*f*(3-2f)` rather
 * than a linear blend: linear interpolation leaves visible creases along every
 * lattice line, which reintroduces exactly the grid this file exists to avoid.
 */
export function valueNoise2(p: any) {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));

  const a = hash2(i);
  const b = hash2(i.add(vec2(1, 0)));
  const c = hash2(i.add(vec2(0, 1)));
  const d = hash2(i.add(vec2(1, 1)));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * Fractional Brownian motion: octaves of value noise at doubling frequency and
 * halving amplitude, with the domain ROTATED between each one.
 *
 * The rotation is the part people leave out. Without it the octaves reinforce
 * along the lattice axes and the result still reads as a grid at grazing
 * angles, which is precisely how a "noisy" ground texture ends up looking
 * tiled. 0.5 rad per octave is deliberately not a neat fraction of pi.
 *
 * @param octaves compile-time constant — this unrolls, so keep it small.
 */
export function fbm2(p: any, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  const CA = Math.cos(0.5);
  const SA = Math.sin(0.5);

  let sum: any = float(0);
  let amp = 0.5;
  let q = p;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    sum = sum.add(valueNoise2(q).mul(amp));
    norm += amp;
    // Rotate then scale. Written out rather than using a matrix so the whole
    // expression stays inside the node graph with no extra node types.
    const rx = q.x.mul(CA).sub(q.y.mul(SA)).mul(lacunarity);
    const ry = q.x.mul(SA).add(q.y.mul(CA)).mul(lacunarity);
    q = vec2(rx, ry);
    amp *= gain;
  }
  return sum.div(float(norm));
}

/**
 * Ridged fBM — `1 - |n|` per octave, which turns the smooth blobs of ordinary
 * fBM into creases. This is the difference between rolling hills and knife
 * ridges, and it is also what makes cracked dry earth read as cracked.
 */
export function ridgedFbm2(p: any, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  const CA = Math.cos(0.5);
  const SA = Math.sin(0.5);

  let sum: any = float(0);
  let amp = 0.5;
  let q = p;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    const n = float(1).sub(abs(valueNoise2(q).mul(2).sub(1)));
    sum = sum.add(n.mul(n).mul(amp));
    norm += amp;
    const rx = q.x.mul(CA).sub(q.y.mul(SA)).mul(lacunarity);
    const ry = q.x.mul(SA).add(q.y.mul(CA)).mul(lacunarity);
    q = vec2(rx, ry);
    amp *= gain;
  }
  return sum.div(float(norm));
}

/**
 * Domain warping: displace the sample point by noise before sampling noise.
 *
 * This is the cheapest way to make a field stop looking like a field. Straight
 * fBM has a characteristic even "cloudiness"; warping the domain first bends
 * and branches its features so they look eroded and directional instead.
 */
export function warpedFbm2(p: any, amount = 0.6, octaves = 4) {
  const wx = fbm2(p.add(vec2(0.0, 0.0)), 2).sub(0.5).mul(amount * 2);
  const wy = fbm2(p.add(vec2(5.2, 1.3)), 2).sub(0.5).mul(amount * 2);
  return fbm2(vec2(p.x.add(wx), p.y.add(wy)), octaves);
}

/**
 * Cellular / Worley-ish field, approximated from value noise rather than a
 * true nearest-point search: cheap, and enough for a scatter mask or a
 * mottled ground break-up where the exact cell distance does not matter.
 */
export function cellular2(p: any) {
  const n = valueNoise2(p);
  return smoothstep(float(0.35), float(0.75), n);
}

/** Convenience: an XZ sample vector from a world position node. */
export function xz(positionNode: any, scale = 1) {
  return vec2(positionNode.x.mul(scale), positionNode.z.mul(scale));
}

/** Unused import guard — `cos`/`sin` are used via Math above, keep the DSL live. */
void cos;
void sin;
