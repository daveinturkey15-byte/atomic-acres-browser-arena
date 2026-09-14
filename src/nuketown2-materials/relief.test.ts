/**
 * relief.test.ts — the pins for the surface relief pass (HF-536 NIGHT materials).
 *
 * WHAT THIS FILE IS DEFENDING. Before this pass every structural feature in
 * the Nuke Town families - mortar joints, lap courses, shingle butts, tar
 * seams, board gaps - existed only as an albedo step, so nothing on the map
 * responded to the sun's direction and the owner's verdict was that the build
 * "looks very poor, more like Roblox or something 20 years old". The fix is a
 * height field per family, authored in millimetres, differentiated into a
 * normal. The numbers below are the ones a future value tweak could silently
 * flatten again, so they are pinned here with the physical reason attached.
 *
 * TWO CLASSES OF PIN:
 *   1. AUTHORED DEPTHS. Every relief constant is a real-world dimension
 *      (R17: real dimensions or nothing) and lives inside a physical band -
 *      no relief term may be smaller than 0.05 mm (below the film thickness
 *      of paint, i.e. not a thing) or larger than 25 mm (above which it is
 *      geometry, not a surface).
 *   2. NOISE PERIODS. `signedNoise` / `lutFbm` wrap on the LUT's own INTEGER
 *      cell count, which is what makes them seamless and, more importantly,
 *      what stops a fractional period producing NaN and a black surface
 *      (gotcha-nuketown2-black-roofs-shader-program-set). The LUT is checked
 *      for finiteness here rather than trusted.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAX_RELIEF_SLOPE } from './relief';
import { MARKING_FILM_M, PAINT_LOSS_HI, PAINT_LOSS_LO } from './families/asphalt';
import { SIDING_COURSE_M, SIDING_LAP_PROUD_M } from './families/siding';
import { BLOCK_COURSE_M, BLOCK_STRETCHER_M, MORTAR_RECESS_M, SLAB_JOINT_M } from './families/concrete';
import { SHINGLE_BUTT_PROUD_M, SHINGLE_COURSE_M, SHINGLE_TAB_M } from './families/roof';
import { DECK_PITCH_M, PICKET_PITCH_M } from './families/timber';
import { DOOR_PANEL_M } from './families/painted-metal';
import { NOISE_LUT_CELLS, NOISE_LUT_SIZE, generateNoiseLutData } from './noise-lut';
import { createNuketown2MaterialRegistry } from './index';

/** Below this a relief term is thinner than a coat of paint: not a feature. */
const MIN_RELIEF_M = 0.00005;
/** Above this it stops being a surface and becomes geometry the silhouette has to carry. */
const MAX_RELIEF_M = 0.025;

/**
 * Every authored relief depth in the library, with the real object it measures.
 * A new family term is expected to be added here; that is the point.
 */
const RELIEF_DEPTHS: ReadonlyArray<readonly [string, number, string]> = [
  ['siding lap proud', SIDING_LAP_PROUD_M, '7 1/4 in lap board is milled 11 mm at the butt'],
  ['roof shingle butt proud', SHINGLE_BUTT_PROUD_M, 'strip shingle mat + granule bed'],
  ['mortar recess', MORTAR_RECESS_M, 'bucket-handle joint raked back 4-6 mm'],
  ['marking film', MARKING_FILM_M, 'extruded thermoplastic is 3 mm'],
];

describe('HF-536 surface relief — authored depths', () => {
  for (const [label, depth, why] of RELIEF_DEPTHS) {
    it(`${label} is a real dimension inside the physical band (${why})`, () => {
      expect(Math.abs(depth)).toBeGreaterThanOrEqual(MIN_RELIEF_M);
      expect(Math.abs(depth)).toBeLessThanOrEqual(MAX_RELIEF_M);
    });
  }

  it('never lets a relief step exceed the grazing-angle slope ceiling', () => {
    // A hard step differentiated across one pixel is an unbounded slope; the
    // clamp is what keeps the perturbed normal on the same side of the
    // geometric one, so a step can never render as a hole under the arena's
    // ~14 degree key.
    expect(MAX_RELIEF_SLOPE).toBeGreaterThan(1);
    expect(MAX_RELIEF_SLOPE).toBeLessThanOrEqual(4);
  });

  it('keeps the lap proud below a tenth of the course it sits in', () => {
    // A board that stands proud by a large fraction of its own exposure is a
    // staircase, not siding. 11 mm on a 184 mm course is 6 %.
    expect(SIDING_LAP_PROUD_M / SIDING_COURSE_M).toBeLessThan(0.10);
    expect(SHINGLE_BUTT_PROUD_M / SHINGLE_COURSE_M).toBeLessThan(0.10);
  });
});

describe('HF-536 surface relief — every family carries a normal', () => {
  it('gives every structural family a normalNode, which none of them had', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const withNormal = ['asphalt', 'trimDecal', 'kerb', 'drive', 'driveDecal', 'block',
      'sidingA', 'sidingB', 'roof', 'fence', 'garageDoor', 'sign'];
    for (const role of withNormal) {
      const material = registry[role] as unknown as Record<string, unknown>;
      expect(material, role).toBeDefined();
      expect((material.normalNode as { isNode?: boolean } | undefined)?.isNode, role).toBe(true);
    }
  });

  it('adds no texture: the relief is differentiated, not sampled', () => {
    // The whole reason this is a surface-gradient bump rather than a normal map
    // is the device sampler budget (silent requestDevice rejection at 17
    // samplers). A normalMap slot appearing here would be that regression.
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    for (const [role, material] of Object.entries(registry)) {
      const slots = material as unknown as Record<string, unknown>;
      expect(slots.normalMap ?? null, `${role} normalMap`).toBeNull();
      expect(slots.bumpMap ?? null, `${role} bumpMap`).toBeNull();
    }
  });
});

describe('HF-536 noise periods stay integer', () => {
  it('wraps on an integer lattice cell count', () => {
    expect(Number.isInteger(NOISE_LUT_CELLS)).toBe(true);
    expect(Number.isInteger(NOISE_LUT_SIZE / NOISE_LUT_CELLS)).toBe(true);
  });

  it('generates a LUT with no non-finite texel — a fractional period is a black surface', () => {
    const data = generateNoiseLutData();
    let bad = 0;
    for (let i = 0; i < data.length; i += 1) if (!Number.isFinite(data[i]!)) bad += 1;
    expect(bad).toBe(0);
  });

  it('keeps every coursed family period a real, unchanged dimension', () => {
    // These are R17 pins carried over verbatim; the relief pass must not have
    // moved a single one of them to make a shadow line land better.
    expect(SIDING_COURSE_M).toBeCloseTo(0.184, 6);
    expect(SHINGLE_COURSE_M).toBeCloseTo(0.143, 6);
    expect(SHINGLE_TAB_M).toBeCloseTo(0.333, 6);
    expect(BLOCK_COURSE_M).toBeCloseTo(0.20, 6);
    expect(BLOCK_STRETCHER_M).toBeCloseTo(0.40, 6);
    expect(SLAB_JOINT_M).toBeCloseTo(2.7, 6);
    expect(PICKET_PITCH_M).toBeCloseTo(0.146, 6);
    expect(DECK_PITCH_M).toBeCloseTo(0.145, 6);
    expect(DOOR_PANEL_M).toBeCloseTo(0.51, 6);
  });
});

describe('HF-536 marking paint loss lands in the brief 3a band', () => {
  /**
   * The shipped loss fraction, measured on the SHIPPED LUT rather than
   * asserted from the thresholds.
   *
   * `paintLoss = smoothstep(LO, HI, fbm2)` where fbm2 is the LUT's G channel.
   * Averaging that over the whole tile is the fraction of a marking bar the
   * paint has left, which brief 3a puts at 20-40 %. Re-deriving it here means
   * a threshold nudge that quietly restores a pristine dash fails the gate.
   */
  const lossFraction = (): number => {
    const data = generateNoiseLutData();
    const smoothstep = (lo: number, hi: number, x: number): number => {
      const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
      return t * t * (3 - 2 * t);
    };
    let sum = 0;
    const texels = NOISE_LUT_SIZE * NOISE_LUT_SIZE;
    for (let i = 0; i < texels; i += 1) sum += smoothstep(PAINT_LOSS_LO, PAINT_LOSS_HI, data[i * 4 + 1]! / 255);
    return sum / texels;
  };

  it('loses 20-40 % of the bar, with a chipped rather than sawn edge', () => {
    const loss = lossFraction();
    expect(loss).toBeGreaterThanOrEqual(0.20);
    expect(loss).toBeLessThanOrEqual(0.40);
    // Transition width: a sawn edge is a step, a chipped edge is a ramp.
    expect(PAINT_LOSS_HI - PAINT_LOSS_LO).toBeGreaterThanOrEqual(0.08);
  });
});
