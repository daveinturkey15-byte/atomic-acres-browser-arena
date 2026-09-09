/**
 * nuketown-forest-conifer-tone.test.ts — HF-536 night-defects-3b.
 *
 * The owner's complaint was "see-through / black assets"; the treeline's share
 * of that is a colour-space trap, and this file pins both halves of it.
 *
 * THE TRAP (measured here, not asserted from memory). `THREE.Color.setHex()`
 * decodes sRGB into the LINEAR working space, so `offsetHSL()` moves a LINEAR
 * lightness. The cool-flank line subtracts up to 0.03 from a tone whose linear
 * lightness is only 0.03657 — it removes 82 % of it. Test 1 reproduces the
 * pre-floor maths (by passing minLightness 0) and states the numbers as a
 * measurement, so if a future three.js release changes the working space or
 * the HSL convention this file fails loudly instead of the treeline going
 * quietly black again.
 *
 * THE FLOOR. `FOREST_CONIFER_MIN_LINEAR_LIGHTNESS` is a ratchet pinned from
 * the rendered-frame measurement (scripts/qa/probe-nuketown2-conifer-darkness.mjs).
 * Test 2 is the red proof that the clamp actually fires; test 3 is the
 * arena-wide guarantee across the whole tone x flank domain; test 4 pins the
 * shipped value so lowering it is a failing test rather than a silent edit.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FOREST_CONIFER_MIN_LINEAR_LIGHTNESS,
  FOREST_CONIFER_TONES,
  FOREST_CONIFER_UNDERSIDE_SHADE,
  coniferInstanceColour,
} from './nuketown-forest-surround';

const linearLightness = (colour: THREE.Color): number => {
  const hsl = { h: 0, s: 0, l: 0 };
  colour.getHSL(hsl);
  return hsl.l;
};

/** Display-space 0..255 max channel of a linear working colour. */
const displayMaxChannel = (colour: THREE.Color): number => {
  const srgb = colour.clone().convertLinearToSRGB();
  return Math.round(Math.max(srgb.r, srgb.g, srgb.b) * 255);
};

/** The tone stream value that selects tone index `i` (see the % in the source). */
const toneStreamFor = (index: number): number => (index + 0.5) / FOREST_CONIFER_TONES.length;

describe('conifer instance colour', () => {
  it('MEASURES the linear-space offsetHSL trap that produced the black treeline', () => {
    const colour = new THREE.Color();

    // 0x27412b's own linear lightness, before any flank bias.
    coniferInstanceColour(toneStreamFor(2), 0, colour, 0);
    expect(FOREST_CONIFER_TONES[2]).toBe(0x27412b);
    expect(linearLightness(colour)).toBeCloseTo(0.03657, 4);

    // The full cool flank takes 0.03 of that 0.03657 away — 82 % of it.
    coniferInstanceColour(toneStreamFor(2), -1, colour, 0);
    const cooled = linearLightness(colour);
    expect(cooled).toBeCloseTo(0.00657, 4);
    expect(cooled / 0.03657).toBeLessThan(0.2);

    // Unlit albedo, and the same albedo through the baked underside ramp.
    // [12,25,13] and [10,21,11] respectively: that is a tree whose shaded
    // side is at the edge of the 8-bit floor before a light rig touches it.
    expect(displayMaxChannel(colour)).toBe(25);
    const shaded = colour.clone().multiplyScalar(FOREST_CONIFER_UNDERSIDE_SHADE);
    expect(displayMaxChannel(shaded)).toBe(21);
  });

  it('RED PROOF: the clamp fires and lifts the darkest tone', () => {
    const floored = new THREE.Color();
    const unfloored = new THREE.Color();
    // A floor well above the darkest authored combination must move it.
    coniferInstanceColour(toneStreamFor(2), -1, floored, 0.05);
    coniferInstanceColour(toneStreamFor(2), -1, unfloored, 0);
    expect(linearLightness(unfloored)).toBeLessThan(0.05);
    expect(linearLightness(floored)).toBeCloseTo(0.05, 6);
    expect(displayMaxChannel(floored)).toBeGreaterThan(displayMaxChannel(unfloored));

    // ...and it is a floor, not a set: a colour already above it is untouched.
    const bright = new THREE.Color();
    const brightUnfloored = new THREE.Color();
    coniferInstanceColour(toneStreamFor(3), 1, bright, 0.05);
    coniferInstanceColour(toneStreamFor(3), 1, brightUnfloored, 0);
    expect(linearLightness(bright)).toBeGreaterThan(0.05);
    expect(bright.getHex()).toBe(brightUnfloored.getHex());
  });

  it('holds the floor across the whole tone x flank domain the arena can produce', () => {
    const colour = new THREE.Color();
    let darkestLinear = Number.POSITIVE_INFINITY;
    let darkestShadedDisplay = 255;
    for (let toneIndex = 0; toneIndex < FOREST_CONIFER_TONES.length; toneIndex += 1) {
      for (let sunSide = -1; sunSide <= 1.0001; sunSide += 1 / 64) {
        coniferInstanceColour(toneStreamFor(toneIndex), Math.min(1, sunSide), colour);
        const l = linearLightness(colour);
        expect(l).toBeGreaterThanOrEqual(FOREST_CONIFER_MIN_LINEAR_LIGHTNESS - 1e-9);
        darkestLinear = Math.min(darkestLinear, l);
        darkestShadedDisplay = Math.min(
          darkestShadedDisplay,
          displayMaxChannel(colour.clone().multiplyScalar(FOREST_CONIFER_UNDERSIDE_SHADE)),
        );
      }
    }
    // The floor binds the domain's darkest corner (or sits just under it — it
    // is pinned from a rendered frame, not from this arithmetic).
    expect(darkestLinear).toBeLessThan(0.01);
    // Whatever the light rig then does, the darkest conifer ALBEDO is never
    // inside the diff instrument's exact-black band (max channel <= 6).
    expect(darkestShadedDisplay).toBeGreaterThan(6);
  });

  it('pins the shipped floor so lowering it is a failing test', () => {
    // Ratchet. Raising this constant needs a rendered-frame measurement in the
    // commit message; lowering it is a regression by definition.
    expect(FOREST_CONIFER_MIN_LINEAR_LIGHTNESS).toBe(0.0065);
    expect(FOREST_CONIFER_UNDERSIDE_SHADE).toBe(0.8);
    expect([...FOREST_CONIFER_TONES]).toEqual([0x2e4a30, 0x39573a, 0x27412b, 0x435f41]);
  });
});
