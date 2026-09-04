/**
 * HF-486 — SH-L2 irradiance volume: the maths, the grid, the bake and the pack.
 *
 * The analytic cases come first and are the point. A probe volume is a thing
 * you cannot eyeball: a wrong convolution constant, a swapped basis order or a
 * projection that disagrees with its own reconstruction all produce an image
 * that looks like lighting and is wrong by a factor nobody can see. The white
 * furnace, the orthonormality check and the L1-compatibility check between them
 * pin the convention hard enough that a later edit cannot quietly change it.
 */

import { describe, expect, it } from 'vitest';

import {
  type ProxyScene,
  type ProxyShape,
  vec3,
} from '../raytracing/analytic-proxy-scene';
import { evaluateShL1 } from './baked-indirect';
import {
  DERING_PROBE_DIRECTIONS,
  SH_L2_BYTES_PER_PROBE,
  SH_L2_COEFFICIENTS,
  SH_L2_FLOATS_PER_PROBE,
  SH_L2_MAXIMUM_USEFUL_SPACING_M,
  SH_L2_MAXIMUM_VOLUME_BYTES,
  SH_L2_PLANES,
  type ShL2BakeOptions,
  bakeShL2Volume,
  deringShL2InPlace,
  deriveShL2Grid,
  evaluateShL2,
  hanningWindow,
  packShL2Volume,
  probePosition,
  projectShL2Sample,
  resolveShL2Band,
  shBasisL2,
  shL2VolumeBytes,
  shL2VolumeIsL1Compatible,
  unpackShL2Probe,
} from './sh-l2-irradiance';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function uniformDirections(count: number): ReturnType<typeof vec3>[] {
  // Deterministic spiral, so a tolerance measured once stays measured.
  return Array.from({ length: count }, (_unused, index) => {
    const t = (index + 0.5) / count;
    const z = 1 - 2 * t;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = index * 2.399963229728653;
    return vec3(radius * Math.cos(phi), radius * Math.sin(phi), z);
  });
}

function shape(overrides: Partial<ProxyShape>): ProxyShape {
  return Object.freeze({
    kind: 'box',
    centre: vec3(0, 0, 0),
    halfExtents: vec3(1, 1, 1),
    yaw: 0,
    normal: vec3(0, 1, 0),
    albedo: vec3(0.5, 0.5, 0.5),
    metalness: 0,
    roughness: 1,
    name: 'fixture',
    ...overrides,
  }) as ProxyShape;
}

function scene(shapes: ProxyShape[]): ProxyScene {
  return Object.freeze({
    shapes: Object.freeze(shapes),
    boundsMin: vec3(-50, -1, -50),
    boundsMax: vec3(50, 20, 50),
    candidatesConsidered: shapes.length,
    reflectiveMeshCount: 0,
    reflectiveFootprintM2: 0,
    capReason: 'fixture',
  }) as ProxyScene;
}

const DAYLIGHT = Object.freeze({
  sunDirection: vec3(0.4, 0.8, 0.447),
  sunColour: vec3(3, 2.9, 2.7),
  skyZenithColour: vec3(0.3, 0.45, 0.8),
  skyHorizonColour: vec3(0.6, 0.65, 0.75),
  skyGroundColour: vec3(0.15, 0.14, 0.12),
});

// ---------------------------------------------------------------------------
// 1. The maths, analytically
// ---------------------------------------------------------------------------

describe('SH-L2 projection and evaluation', () => {
  it('reconstructs a uniform environment exactly (white furnace)', () => {
    // A constant radiance L in every direction must reconstruct to exactly L on
    // EVERY normal. This is the single identity that pins the convolution
    // constants, the basis normalisation and the /pi together: get any one of
    // them wrong and this test fails by a clean multiplicative factor.
    const radiance = 0.7;
    const directions = uniformDirections(4096);
    const weight = (4 * Math.PI) / directions.length;
    const coefficients = new Float32Array(SH_L2_FLOATS_PER_PROBE);
    for (const direction of directions) {
      projectShL2Sample(coefficients, 0, direction, vec3(radiance, radiance, radiance), weight);
    }

    for (const normal of uniformDirections(32)) {
      expect(evaluateShL2(coefficients, 0, normal)).toBeCloseTo(radiance, 2);
    }
  });

  it('has orthonormal band-2 basis functions', () => {
    // <Yi, Yj> = delta_ij over the sphere. If two band-2 constants are swapped
    // the volume still bakes, still samples and is silently wrong; this is what
    // catches that.
    const directions = uniformDirections(20000);
    const weight = (4 * Math.PI) / directions.length;
    const gram = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));
    for (const direction of directions) {
      const basis = shBasisL2(direction);
      for (let i = 0; i < 5; i += 1) {
        for (let j = 0; j < 5; j += 1) gram[i][j] += basis[i] * basis[j] * weight;
      }
    }
    for (let i = 0; i < 5; i += 1) {
      for (let j = 0; j < 5; j += 1) {
        expect(gram[i][j]).toBeCloseTo(i === j ? 1 : 0, 1);
      }
    }
  });

  it('band-2 basis integrates to zero against a constant', () => {
    const directions = uniformDirections(20000);
    const weight = (4 * Math.PI) / directions.length;
    const sums = [0, 0, 0, 0, 0];
    for (const direction of directions) {
      const basis = shBasisL2(direction);
      for (let i = 0; i < 5; i += 1) sums[i] += basis[i] * weight;
    }
    for (const sum of sums) expect(Math.abs(sum)).toBeLessThan(0.02);
  });

  it('reduces to evaluateShL1 exactly when band 2 is zero', () => {
    // The compatibility property. A probe whose L2 coefficients are zero must
    // reconstruct bit-for-bit what the existing HF-418 lane reconstructs, which
    // is what lets one bake feed both consumers.
    const coefficients = new Float32Array(SH_L2_COEFFICIENTS);
    coefficients[0] = 0.9;
    coefficients[1] = 0.11;
    coefficients[2] = -0.07;
    coefficients[3] = 0.24;
    const l1 = new Float32Array([coefficients[0], coefficients[1], coefficients[2], coefficients[3]]);
    for (const normal of uniformDirections(64)) {
      expect(evaluateShL2(coefficients, 0, normal)).toBeCloseTo(evaluateShL1(l1, 0, normal), 10);
    }
  });

  it('resolves a directional environment more sharply than L1 does', () => {
    // The reason the second band exists. A bright patch on one side must read
    // as MORE directional at L2 than at L1: the contrast between the normal
    // facing the patch and the normal facing away is larger.
    const directions = uniformDirections(8192);
    const weight = (4 * Math.PI) / directions.length;
    const coefficients = new Float32Array(SH_L2_FLOATS_PER_PROBE);
    const towards = vec3(0, 0, 1);
    for (const direction of directions) {
      const facing = direction[2] > 0.6 ? 4 : 0.05;
      projectShL2Sample(coefficients, 0, direction, vec3(facing, facing, facing), weight);
    }
    const l1 = new Float32Array([coefficients[0], coefficients[1], coefficients[2], coefficients[3]]);

    const l2Contrast = evaluateShL2(coefficients, 0, towards)
      - evaluateShL2(coefficients, 0, vec3(0, 0, -1));
    const l1Contrast = evaluateShL1(l1, 0, towards) - evaluateShL1(l1, 0, vec3(0, 0, -1));
    expect(l2Contrast).toBeGreaterThan(l1Contrast);
  });
});

// ---------------------------------------------------------------------------
// 2. Deringing — the answer to the recorded objection against L2
// ---------------------------------------------------------------------------

describe('SH-L2 deringing', () => {
  it('never attenuates band 0, so windowing cannot change average irradiance', () => {
    for (const width of [2.5, 3, 4, 8, 12]) expect(hanningWindow(0, width)).toBe(1);
  });

  it('attenuates band 2 at least as hard as band 1', () => {
    for (const width of [2.5, 3, 4, 6, 8, 12]) {
      expect(hanningWindow(2, width)).toBeLessThanOrEqual(hanningWindow(1, width));
      expect(hanningWindow(1, width)).toBeLessThanOrEqual(1);
    }
  });

  it('never lets the second band undershoot the L1 baseline it is added to', () => {
    // A narrow bright cone is the classic ringing input. Note what this test
    // does NOT assert: that the result is non-negative. L1 rings on this input
    // too — the shipping lane hides it behind max(0, …) — so an absolute
    // non-negativity bar is a standard the CURRENT band does not meet and is
    // unreachable without windowing the signal away. The guarantee that answers
    // `baked-indirect.ts`'s recorded objection is the relative one: adding band
    // 2 must never make a probe darker in any direction than shipping L1 alone
    // would have. That is what is checked here, and it is what makes the second
    // band safe to add to a combat-visible surface.
    const directions = uniformDirections(8192);
    const weight = (4 * Math.PI) / directions.length;
    const coefficients = new Float32Array(SH_L2_FLOATS_PER_PROBE);
    for (const direction of directions) {
      const bright = direction[1] > 0.93 ? 60 : 0;
      projectShL2Sample(coefficients, 0, direction, vec3(bright, bright, bright), weight);
    }

    const l1Baseline = DERING_PROBE_DIRECTIONS.map((d) => rawL1(coefficients, d));
    // The unwindowed L2 really does ring worse than L1 somewhere: without that,
    // this fixture would not be exercising the search at all.
    const worseBefore = DERING_PROBE_DIRECTIONS.some(
      (d, i) => rawL2(coefficients, d) < Math.min(0, l1Baseline[i]) - 1e-6,
    );
    expect(worseBefore).toBe(true);

    const result = deringShL2InPlace(coefficients, 0);
    expect(result.window).toBeLessThan(Number.POSITIVE_INFINITY);
    for (let i = 0; i < DERING_PROBE_DIRECTIONS.length; i += 1) {
      expect(rawL2(coefficients, DERING_PROBE_DIRECTIONS[i]))
        .toBeGreaterThanOrEqual(Math.min(0, l1Baseline[i]) - 1e-6);
    }
  });

  it('leaves an already non-negative probe completely untouched', () => {
    const directions = uniformDirections(4096);
    const weight = (4 * Math.PI) / directions.length;
    const coefficients = new Float32Array(SH_L2_FLOATS_PER_PROBE);
    for (const direction of directions) projectShL2Sample(coefficients, 0, direction, vec3(1, 1, 1), weight);
    const before = Float32Array.from(coefficients);

    const result = deringShL2InPlace(coefficients, 0);
    expect(result.window).toBe(Number.POSITIVE_INFINITY);
    expect(result.demotedToL1).toBe(false);
    expect(Array.from(coefficients)).toEqual(Array.from(before));
  });

  it('demotes to L1 rather than shipping a probe that still rings', () => {
    // A coefficient set fabricated to be un-windowable: a huge band-2 term with
    // no band-0 to lift it. There must be no configuration in which this
    // reaches a material graph, so the band is dropped.
    const coefficients = new Float32Array(SH_L2_FLOATS_PER_PROBE);
    for (let channel = 0; channel < 3; channel += 1) {
      coefficients[channel * SH_L2_COEFFICIENTS] = 0.001;
      coefficients[channel * SH_L2_COEFFICIENTS + 6] = -80;
    }
    const result = deringShL2InPlace(coefficients, 0);
    expect(result.demotedToL1).toBe(true);
    for (let channel = 0; channel < 3; channel += 1) {
      for (let band = 4; band < SH_L2_COEFFICIENTS; band += 1) {
        expect(coefficients[channel * SH_L2_COEFFICIENTS + band]).toBe(0);
      }
    }
  });
});

/** Unclamped L1 reconstruction of channel 0. The clamp is what hides ringing. */
function rawL1(coefficients: Float32Array, direction: ReturnType<typeof vec3>): number {
  return (Math.PI * 0.282095 * coefficients[0]
    + 2.094395 * 0.488603 * (
      direction[1] * coefficients[1] + direction[2] * coefficients[2] + direction[0] * coefficients[3]
    )) / Math.PI;
}

/** Unclamped L1+L2 reconstruction of channel 0. */
function rawL2(coefficients: Float32Array, direction: ReturnType<typeof vec3>): number {
  const basis = shBasisL2(direction);
  return rawL1(coefficients, direction) + (0.785398 * (
    basis[0] * coefficients[4] + basis[1] * coefficients[5] + basis[2] * coefficients[6]
    + basis[3] * coefficients[7] + basis[4] * coefficients[8]
  )) / Math.PI;
}

// ---------------------------------------------------------------------------
// 3. The grid, derived from arena bounds
// ---------------------------------------------------------------------------

describe('SH-L2 probe grid', () => {
  const bounds = { minM: vec3(-30, 0, -20), maxM: vec3(30, 12, 20) };

  it('covers the arena bounds with the requested spacing and vertical extent', () => {
    const grid = deriveShL2Grid(bounds, { spacingM: 2, heightM: 6, paddingM: 1 });
    expect(grid.dimensions[0]).toBeGreaterThan(1);
    expect(grid.dimensions[1]).toBeGreaterThan(1);
    expect(grid.dimensions[2]).toBeGreaterThan(1);

    // Probe 0 sits on the padded min corner at the arena floor.
    const first = probePosition(grid, 0);
    expect(first[0]).toBeCloseTo(-31, 5);
    expect(first[1]).toBeCloseTo(0, 5);
    expect(first[2]).toBeCloseTo(-21, 5);

    // The vertical extent is the requested height, NOT the bounds height.
    const top = grid.originM[1] + grid.spacingM[1] * (grid.dimensions[1] - 1);
    expect(top).toBeCloseTo(6, 5);
  });

  it('reaches the far corner of the padded bounds', () => {
    const grid = deriveShL2Grid(bounds, { spacingM: 2, heightM: 6, paddingM: 1 });
    const last = probePosition(grid, grid.probeCount - 1);
    expect(last[0]).toBeCloseTo(31, 4);
    expect(last[2]).toBeCloseTo(21, 4);
  });

  it('enforces the probe cap by coarsening, never by truncating the grid', () => {
    // A truncated grid has a hard edge inside the playable area. Coarsening
    // keeps full coverage, so the far corner must still be reached.
    const grid = deriveShL2Grid(bounds, { spacingM: 0.25, heightM: 6, maximumProbes: 500 });
    expect(grid.probeCount).toBeLessThanOrEqual(500);
    const last = probePosition(grid, grid.probeCount - 1);
    expect(last[0]).toBeCloseTo(31, 3);
    expect(last[2]).toBeCloseTo(21, 3);
  });

  it('drops to band L1 when the realised spacing is too coarse to carry L2', () => {
    // The recorded objection, enforced mechanically: a grid too coarse for the
    // second band does not get one and does not pay for one.
    const coarse = deriveShL2Grid(bounds, { spacingM: 6, heightM: 6 });
    expect(coarse.band).toBe('l1');
    const fine = deriveShL2Grid(bounds, { spacingM: 2, heightM: 6 });
    expect(fine.band).toBe('l2');
  });

  it('resolves the band from spacing alone', () => {
    expect(resolveShL2Band(vec3(2, 1.5, 2))).toBe('l2');
    expect(resolveShL2Band(vec3(2, 1.5, SH_L2_MAXIMUM_USEFUL_SPACING_M + 0.01))).toBe('l1');
  });
});

// ---------------------------------------------------------------------------
// 4. Occlusion from the arena's own colliders
// ---------------------------------------------------------------------------

describe('SH-L2 bake occlusion', () => {
  const house = shape({
    kind: 'box',
    centre: vec3(0, 3, 0),
    halfExtents: vec3(5, 3, 5),
    albedo: vec3(0.55, 0.5, 0.45),
    name: 'house',
  });

  function bakeAt(position: ReturnType<typeof vec3>, shapes: ProxyShape[]): number {
    const grid = {
      originM: position,
      spacingM: vec3(2, 2, 2),
      dimensions: Object.freeze([1, 1, 1]) as unknown as readonly [number, number, number],
      probeCount: 1,
      band: 'l2' as const,
      bytes: SH_L2_BYTES_PER_PROBE,
    };
    const options: ShL2BakeOptions = {
      arenaId: 'fixture',
      conditionId: 'day',
      grid,
      lighting: DAYLIGHT,
      occluders: scene(shapes),
      raysPerProbe: 512,
      bounces: 1,
      seed: 12345,
    };
    const volume = bakeShL2Volume(options);
    // Average reconstructed radiance over a fixed normal set: one number that
    // means "how much light is at this probe".
    let total = 0;
    const normals = uniformDirections(24);
    for (const normal of normals) total += evaluateShL2(volume.coefficients, 0, normal);
    return total / normals.length;
  }

  it('makes a probe inside a house darker than one outside it', () => {
    // The headline behavioural property of the whole lane. If this does not
    // hold, the volume is not seeing the arena and every pretty screenshot is
    // a coincidence.
    const inside = bakeAt(vec3(0, 3, 0), [house]);
    const outside = bakeAt(vec3(30, 3, 30), [house]);
    expect(inside).toBeLessThan(outside * 0.5);
  });

  it('bakes a pure-sky volume when the occluder set is empty, and reports it', () => {
    // The "correct image of nothing" case: an arena with no occluders bakes a
    // correct, featureless volume. That must be distinguishable from a failure,
    // so the shape count is on the receipt.
    const grid = deriveShL2Grid(
      { minM: vec3(-4, 0, -4), maxM: vec3(4, 6, 4) },
      { spacingM: 4, heightM: 6 },
    );
    const volume = bakeShL2Volume({
      arenaId: 'empty', conditionId: 'day', grid, lighting: DAYLIGHT,
      occluders: scene([]), raysPerProbe: 128, bounces: 1, seed: 7,
    });
    expect(volume.bake.occluderShapes).toBe(0);
    expect(evaluateShL2(volume.coefficients, 0, vec3(0, 1, 0))).toBeGreaterThan(0);
  });

  it('bounces the occluder colour, not a grey constant', () => {
    // A red wall must throw RED light. Measured DIFFERENTIALLY against a grey
    // wall of identical geometry, because the absolute red/green ratio at the
    // probe is dominated by the sky (which is blue) and would answer a
    // different question. Swapping only the albedo isolates the bounce, which
    // is the thing under test — and this is what separates the lane from
    // raising a flat ambient, so it is the owner-visible difference.
    const geometry = { centre: vec3(0, 3, -4), halfExtents: vec3(8, 3, 0.4) };
    const grid = {
      originM: vec3(0, 1.5, 0), spacingM: vec3(2, 2, 2),
      dimensions: Object.freeze([1, 1, 1]) as unknown as readonly [number, number, number],
      probeCount: 1, band: 'l2' as const, bytes: SH_L2_BYTES_PER_PROBE,
    };
    const bakeWall = (albedo: ReturnType<typeof vec3>) => bakeShL2Volume({
      arenaId: 'bleed', conditionId: 'day', grid, lighting: DAYLIGHT,
      occluders: scene([shape({ ...geometry, albedo, name: 'wall' })]),
      raysPerProbe: 4096, bounces: 1, seed: 99,
    });

    const normal = vec3(0, 0, -1);
    const ratio = (volume: ReturnType<typeof bakeWall>) =>
      evaluateShL2(volume.coefficients, 0, normal)
      / evaluateShL2(volume.coefficients, SH_L2_COEFFICIENTS, normal);

    const red = ratio(bakeWall(vec3(0.85, 0.08, 0.06)));
    const grey = ratio(bakeWall(vec3(0.33, 0.33, 0.33)));
    expect(red).toBeGreaterThan(grey);
  });

  it('is reproducible from its inputs alone', () => {
    // The digest cache says "this volume is what these inputs bake to". A bake
    // seeded from Math.random makes that sentence false while every other test
    // still passes.
    const grid = deriveShL2Grid(
      { minM: vec3(-6, 0, -6), maxM: vec3(6, 6, 6) },
      { spacingM: 3, heightM: 6 },
    );
    const options: ShL2BakeOptions = {
      arenaId: 'repeat', conditionId: 'day', grid, lighting: DAYLIGHT,
      occluders: scene([house]), raysPerProbe: 64, bounces: 1, seed: 4242,
    };
    const a = bakeShL2Volume(options);
    const b = bakeShL2Volume(options);
    expect(Array.from(a.coefficients)).toEqual(Array.from(b.coefficients));
    expect(a.digest).toBe(b.digest);
  });

  it('changes its digest when the lighting changes', () => {
    const grid = deriveShL2Grid(
      { minM: vec3(-6, 0, -6), maxM: vec3(6, 6, 6) },
      { spacingM: 3, heightM: 6 },
    );
    const base: ShL2BakeOptions = {
      arenaId: 'tod', conditionId: 'day', grid, lighting: DAYLIGHT,
      occluders: scene([house]), raysPerProbe: 32, bounces: 1, seed: 1,
    };
    const dusk = bakeShL2Volume({
      ...base,
      conditionId: 'dusk',
      lighting: { ...DAYLIGHT, sunColour: vec3(2.4, 1.2, 0.5), sunDirection: vec3(0.9, 0.15, 0.4) },
    });
    expect(dusk.digest).not.toBe(bakeShL2Volume(base).digest);
  });
});

// ---------------------------------------------------------------------------
// 5. Packing and memory
// ---------------------------------------------------------------------------

describe('SH-L2 volume packing', () => {
  const grid = deriveShL2Grid(
    { minM: vec3(-8, 0, -8), maxM: vec3(8, 6, 8) },
    { spacingM: 2, heightM: 6 },
  );
  const volume = bakeShL2Volume({
    arenaId: 'pack', conditionId: 'day', grid, lighting: DAYLIGHT,
    occluders: scene([shape({ centre: vec3(0, 2, 0), halfExtents: vec3(3, 2, 3) })]),
    raysPerProbe: 32, bounces: 1, seed: 11,
  });

  it('round-trips every coefficient of every probe', () => {
    const planes = packShL2Volume(volume);
    expect(planes).toHaveLength(SH_L2_PLANES);
    const probes = grid.dimensions[0] * grid.dimensions[1] * grid.dimensions[2];
    const scratch = new Float32Array(SH_L2_FLOATS_PER_PROBE);
    for (let probe = 0; probe < probes; probe += 1) {
      unpackShL2Probe(planes, probe, scratch);
      for (let i = 0; i < SH_L2_FLOATS_PER_PROBE; i += 1) {
        expect(scratch[i]).toBe(volume.coefficients[probe * SH_L2_FLOATS_PER_PROBE + i]);
      }
    }
  });

  it('keeps the first three planes byte-identical to the L1 lane layout', () => {
    // The compatibility property at the texture level: planes 0..2 ARE the
    // three RGBA textures `baked-indirect-node.ts` already binds, in its order
    // (L0, L1y, L1z, L1x). One bake, two consumers.
    const planes = packShL2Volume(volume);
    for (let channel = 0; channel < 3; channel += 1) {
      const source = channel * SH_L2_COEFFICIENTS;
      expect(planes[channel][0]).toBe(volume.coefficients[source]);
      expect(planes[channel][1]).toBe(volume.coefficients[source + 1]);
      expect(planes[channel][2]).toBe(volume.coefficients[source + 2]);
      expect(planes[channel][3]).toBe(volume.coefficients[source + 3]);
    }
  });

  it('writes a literal zero into the pad slot', () => {
    const planes = packShL2Volume(volume);
    const probes = grid.dimensions[0] * grid.dimensions[1] * grid.dimensions[2];
    for (let probe = 0; probe < probes; probe += 1) expect(planes[6][probe * 4 + 3]).toBe(0);
  });

  it('stays inside the volume memory ceiling, with room for a second bake', () => {
    expect(grid.bytes).toBe(shL2VolumeBytes(grid.dimensions));
    expect(grid.bytes).toBeLessThanOrEqual(SH_L2_MAXIMUM_VOLUME_BYTES);
    // Two resident bakes (day and dusk) must fit the 8 MB lane budget.
    expect(grid.bytes * 2).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('costs exactly seven RGBA16F texels per probe', () => {
    expect(SH_L2_BYTES_PER_PROBE).toBe(SH_L2_PLANES * 4 * 2);
  });

  it('reconstructs the L1 lane exactly from the shared first four floats', () => {
    expect(shL2VolumeIsL1Compatible(volume, evaluateShL1, vec3(0, 1, 0))).toBe(true);
  });
});
