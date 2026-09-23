/**
 * Source 2 — Spectral FFT ocean (`squall01337/abyssal-ocean`).
 *
 * Read at pin `142265f5013b6f27bea4f4f819b832dec75c7bad`, file `index.html`
 * (the whole implementation is that one file):
 *   :239-241  CASC = 3, CASC_L = [768, 121, 19] m, k-space partitioned with no overlap
 *   :513-518  spectrum inputs windSpeed / windDir / fetch / depth; foam threshold/decay
 *   :532-567  makeButterflyTexture(n) — precomputed twiddle + index lookup
 *   :573-579  h0 / result / foam render targets, foam ping-pong
 *   :581-658  PASS 1, initial spectrum: jonswap(w, wp, alpha) * tma(w) * spreading,
 *             then Tessendorf h0 = (xi_r + i*xi_i) * sqrt(P)
 *   :667-684  PASS 2, time propagation h(k,t) from h0(k) and conj(h0(-k))
 *   :686-699  PASS 3, Cooley-Tukey butterfly across two MRT slots
 * README (repo page, rendered): foam is taken from the sign of the Jacobian of the
 * Tessendorf displacement — "where the Jacobian goes negative the surface folds".
 *
 * This demo runs that pipeline honestly but SMALL and on the CPU: ONE cascade at
 * N=32 instead of three cascades at 512^2 on the GPU, a JavaScript iterative
 * radix-2 Cooley-Tukey transform instead of a butterfly texture and MRT passes,
 * and vertex colours for foam instead of a temporally accumulated foam target.
 * Everything that makes it *spectral* is real: JONSWAP with the TMA shallow-water
 * correction, cos^2s directional spreading, Tessendorf h0 with a seeded Gaussian
 * pair, the deep/shallow dispersion relation, choppy horizontal displacement and
 * Jacobian-negative foam.
 *
 * BEFORE is the thing this must not be confused with: three summed Gerstner sines.
 * AFTER is the spectral surface. They are the same grid, the same material and the
 * same triangle count, so the only difference on screen is the method.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  makeRng,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';

const N = 32; // grid resolution per axis (upstream: 512 per cascade)
const L = 24; // patch size in metres (upstream cascade 3 is 19 m)
const G = 9.81;

// index.html:514 — the spectrum's real inputs, kept at the same defaults.
const WIND_SPEED = 11.0;
const WIND_DIR = (38.0 * Math.PI) / 180;
const FETCH_KM = 210.0;
const DEPTH = 420.0;
const FOAM_THRESHOLD = 0.62;

/** JONSWAP, Hasselmann et al. 1973, in the form the source uses. */
function jonswap(w: number, wp: number, alpha: number): number {
  if (w <= 1e-4) return 0;
  const sigma = w <= wp ? 0.07 : 0.09;
  const r = Math.exp(-((w - wp) ** 2) / (2 * sigma * sigma * wp * wp));
  const gamma = 3.3;
  return ((alpha * G * G) / w ** 5) * Math.exp(-1.25 * (wp / w) ** 4) * gamma ** r;
}

/** TMA shallow-water correction, Bouws et al. 1985. */
function tma(w: number, depth: number): number {
  const wh = w * Math.sqrt(depth / G);
  if (wh <= 1) return 0.5 * wh * wh;
  if (wh < 2) return 1 - 0.5 * (2 - wh) * (2 - wh);
  return 1;
}

/** Box-Muller from the seeded stream, so the spectrum is reproducible. */
function gaussianPair(rng: () => number): [number, number] {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  const mag = Math.sqrt(-2 * Math.log(u1));
  return [mag * Math.cos(2 * Math.PI * u2), mag * Math.sin(2 * Math.PI * u2)];
}

/** In-place iterative radix-2 Cooley-Tukey FFT of one row of length n. */
function fft1d(re: Float64Array, im: Float64Array, offset: number, stride: number, n: number): void {
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const a = offset + i * stride;
      const b = offset + j * stride;
      const tr = re[a];
      const ti = im[a];
      re[a] = re[b];
      im[a] = im[b];
      re[b] = tr;
      im[b] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = offset + (i + k) * stride;
        const b = offset + (i + k + len / 2) * stride;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function fft2d(re: Float64Array, im: Float64Array): void {
  for (let y = 0; y < N; y += 1) fft1d(re, im, y * N, 1, N);
  for (let x = 0; x < N; x += 1) fft1d(re, im, x, N, N);
}

interface Spectrum {
  h0re: Float64Array;
  h0im: Float64Array;
  h0cre: Float64Array;
  h0cim: Float64Array;
  omega: Float64Array;
  kx: Float64Array;
  kz: Float64Array;
}

function buildSpectrum(seed: number): Spectrum {
  const rng = makeRng(seed ^ 0x0cea11);
  const size = N * N;
  const s: Spectrum = {
    h0re: new Float64Array(size),
    h0im: new Float64Array(size),
    h0cre: new Float64Array(size),
    h0cim: new Float64Array(size),
    omega: new Float64Array(size),
    kx: new Float64Array(size),
    kz: new Float64Array(size),
  };

  const fetchMetres = FETCH_KM * 1000;
  // index.html:641-645 — fetch-limited JONSWAP parameters from wind and fetch.
  const alpha = 0.076 * (WIND_SPEED ** 2 / (fetchMetres * G)) ** 0.22;
  const wp = 22 * (G * G / (WIND_SPEED * fetchMetres)) ** (1 / 3);
  const windX = Math.cos(WIND_DIR);
  const windZ = Math.sin(WIND_DIR);

  const amplitude = 0.55; // calibration constant, the source's uAmp equivalent
  for (let z = 0; z < N; z += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = z * N + x;
      const kx = (2 * Math.PI * (x - N / 2)) / L;
      const kz = (2 * Math.PI * (z - N / 2)) / L;
      s.kx[i] = kx;
      s.kz[i] = kz;
      const k = Math.hypot(kx, kz);
      if (k < 1e-6) continue;

      // Dispersion with finite depth, the same relation the propagation pass uses.
      const w = Math.sqrt(G * k * Math.tanh(k * DEPTH));
      s.omega[i] = w;

      // dw/dk maps the frequency spectrum onto the wavenumber grid.
      const dwdk = (G * Math.tanh(k * DEPTH)) / (2 * w);
      const directional = (kx * windX + kz * windZ) / k;
      if (directional <= 0) continue; // drop waves travelling against the wind
      // cos^2s spreading, the reduced stand-in for Donelan-Banner.
      const spread = directional ** 4;
      const energy = jonswap(w, wp, alpha) * tma(w, DEPTH) * spread * (dwdk / k);
      const p = Math.max(0, energy) * ((2 * Math.PI) / L) ** 2 * amplitude;

      const [xr, xi] = gaussianPair(rng);
      const root = Math.sqrt(p / 2);
      s.h0re[i] = xr * root;
      s.h0im[i] = xi * root;
    }
  }

  // conj(h0(-k)), precomputed once exactly as the source stores it alongside h0.
  for (let z = 0; z < N; z += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = z * N + x;
      const j = ((N - z) % N) * N + ((N - x) % N);
      s.h0cre[i] = s.h0re[j];
      s.h0cim[i] = -s.h0im[j];
    }
  }
  return s;
}

interface Field {
  height: Float64Array;
  dispX: Float64Array;
  dispZ: Float64Array;
  foam: Float64Array;
}

function makeField(): Field {
  return {
    height: new Float64Array(N * N),
    dispX: new Float64Array(N * N),
    dispZ: new Float64Array(N * N),
    foam: new Float64Array(N * N),
  };
}

/** PASS 2 + PASS 3 + the Jacobian foam test, per frame, on the CPU. */
function evaluate(s: Spectrum, t: number, field: Field, work: Float64Array[]): number {
  const [hre, him, xre, xim, zre, zim] = work;
  for (let i = 0; i < N * N; i += 1) {
    const w = s.omega[i];
    const c = Math.cos(w * t);
    const sn = Math.sin(w * t);
    // h(k,t) = h0(k) e^{iwt} + conj(h0(-k)) e^{-iwt}
    const ar = s.h0re[i] * c - s.h0im[i] * sn;
    const ai = s.h0re[i] * sn + s.h0im[i] * c;
    const br = s.h0cre[i] * c + s.h0cim[i] * sn;
    const bi = -s.h0cre[i] * sn + s.h0cim[i] * c;
    hre[i] = ar + br;
    him[i] = ai + bi;

    // Choppy horizontal displacement D = -i * (k/|k|) * h  (Tessendorf).
    const k = Math.hypot(s.kx[i], s.kz[i]);
    if (k < 1e-6) {
      xre[i] = xim[i] = zre[i] = zim[i] = 0;
      continue;
    }
    const nx = s.kx[i] / k;
    const nz = s.kz[i] / k;
    xre[i] = him[i] * nx;
    xim[i] = -hre[i] * nx;
    zre[i] = him[i] * nz;
    zim[i] = -hre[i] * nz;
  }

  fft2d(hre, him);
  fft2d(xre, xim);
  fft2d(zre, zim);

  const chop = 0.9;
  let minJacobian = Number.POSITIVE_INFINITY;
  for (let z = 0; z < N; z += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = z * N + x;
      const sign = (x + z) % 2 === 0 ? 1 : -1; // fftshift folded into the read
      field.height[i] = hre[i] * sign;
      field.dispX[i] = xre[i] * sign * chop;
      field.dispZ[i] = zre[i] * sign * chop;
    }
  }

  // Jacobian of the horizontal displacement; negative means the surface folded.
  for (let z = 0; z < N; z += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = z * N + x;
      const ix = z * N + ((x + 1) % N);
      const iz = ((z + 1) % N) * N + x;
      const dxdx = (field.dispX[ix] - field.dispX[i]) * (N / L);
      const dzdz = (field.dispZ[iz] - field.dispZ[i]) * (N / L);
      const dxdz = (field.dispX[iz] - field.dispX[i]) * (N / L);
      const dzdx = (field.dispZ[ix] - field.dispZ[i]) * (N / L);
      const j = (1 + dxdx) * (1 + dzdz) - dxdz * dzdx;
      minJacobian = Math.min(minJacobian, j);
      field.foam[i] = j < FOAM_THRESHOLD ? Math.min(1, (FOAM_THRESHOLD - j) * 2.2) : 0;
    }
  }
  return minJacobian;
}

function makeGrid(THREE: ThreeNamespace, registry: DisposalRegistry) {
  const geometry = registry.track(new THREE.PlaneGeometry(2, 2, N - 1, N - 1));
  geometry.rotateX(-Math.PI / 2);
  const colours = new Float32Array(geometry.getAttribute('position').count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const material = registry.track(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.22,
      metalness: 0.02,
      flatShading: false,
    }),
  );
  return { geometry, mesh: new THREE.Mesh(geometry, material) };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();
  const spectrum = buildSpectrum(context.seed);
  const field = makeField();
  const work = [0, 1, 2, 3, 4, 5].map(() => new Float64Array(N * N));

  const spectral = makeGrid(THREE, registry);
  const gerstner = makeGrid(THREE, registry);
  spectral.mesh.name = 'after:jonswap-tma-spectral';
  gerstner.mesh.name = 'before:three-summed-gerstner-sines';

  const root = sideBySide(THREE, registry, gerstner.mesh, spectral.mesh, 2.6);
  root.name = 'source-02:spectral-fft-ocean';

  const scaleXZ = 2 / N;
  const heightScale = 0.32;
  const restSpectral = spectral.geometry.getAttribute('position').clone();
  const restGerstner = gerstner.geometry.getAttribute('position').clone();

  const deepColour = new THREE.Color(0x0b2b3c);
  const crestColour = new THREE.Color(0x2f7fa0);
  const foamColour = new THREE.Color(0xe9f2f4);
  const scratch = new THREE.Color();

  let minJacobian = 1;

  const writeSpectral = (time: number) => {
    minJacobian = evaluate(spectrum, time, field, work);
    const position = spectral.geometry.getAttribute('position');
    const colour = spectral.geometry.getAttribute('color');
    for (let i = 0; i < N * N; i += 1) {
      const h = field.height[i] * heightScale;
      position.setXYZ(
        i,
        restSpectral.getX(i) + field.dispX[i] * scaleXZ * heightScale,
        h,
        restSpectral.getZ(i) + field.dispZ[i] * scaleXZ * heightScale,
      );
      const lift = Math.min(1, Math.max(0, h * 3 + 0.5));
      scratch.copy(deepColour).lerp(crestColour, lift).lerp(foamColour, field.foam[i]);
      colour.setXYZ(i, scratch.r, scratch.g, scratch.b);
    }
    position.needsUpdate = true;
    colour.needsUpdate = true;
    spectral.geometry.computeVertexNormals();
  };

  const writeGerstner = (time: number) => {
    const position = gerstner.geometry.getAttribute('position');
    const colour = gerstner.geometry.getAttribute('color');
    for (let i = 0; i < N * N; i += 1) {
      const x = restGerstner.getX(i);
      const z = restGerstner.getZ(i);
      const h =
        0.09 * Math.sin(3.1 * x + time * 1.2) +
        0.05 * Math.sin(5.7 * z + time * 1.9) +
        0.03 * Math.sin(9.3 * (x + z) + time * 2.7);
      position.setY(i, h);
      const lift = Math.min(1, Math.max(0, h * 3 + 0.5));
      scratch.copy(deepColour).lerp(crestColour, lift);
      colour.setXYZ(i, scratch.r, scratch.g, scratch.b);
    }
    position.needsUpdate = true;
    colour.needsUpdate = true;
    gerstner.geometry.computeVertexNormals();
  };

  writeSpectral(0);
  writeGerstner(0);

  const metadata = {
    sourceId: 2,
    title: 'Spectral FFT ocean',
    method:
      'JONSWAP spectrum with TMA shallow-water correction and directional spreading -> Tessendorf h0(k) from a seeded Gaussian pair -> time propagation on the finite-depth dispersion relation -> inverse Cooley-Tukey FFT to height and choppy horizontal displacement -> foam where the displacement Jacobian goes negative.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/Graalitoo/status/2089656660981862487',
      'https://github.com/squall01337/abyssal-ocean',
      'squall01337/abyssal-ocean@142265f5013b6f27bea4f4f819b832dec75c7bad index.html:239-241,513-518,532-567,581-699',
    ],
    limitation:
      'One cascade at N=32 on the CPU, not three GPU cascades at 512^2 with a butterfly lookup texture and MRT passes; cos^2s spreading stands in for Donelan-Banner; foam is a per-frame Jacobian test with no temporal accumulation; no reflection, refraction, caustics or buoyancy. Source is MIT and no code was copied - the algorithm was re-implemented from the named passes.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      gridN: N,
      minJacobian,
    },
  };

  return {
    root,
    update(time: number) {
      writeSpectral(time);
      writeGerstner(time);
      metadata.counters.minJacobian = minJacobian;
    },
    dispose() {
      restSpectral.array = new Float32Array(0);
      restGerstner.array = new Float32Array(0);
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
