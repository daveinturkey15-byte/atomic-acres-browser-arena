/**
 * HF-536 muse-lawn — the lawn is olive on the boards, lime on ours: prove the move.
 *
 * MEASUREMENT (`docs/forge/tonal-gap-after.json`, look-2a instrument
 * `scripts/forge/measure-tonal-gap.mjs` over root-captures/interim-4/nuketown2 vs
 * the per-station target boards; full table in the lane REPORT.md):
 *
 *   box (ours -> boards, mean RGB | hue | sat | p50/p10)
 *   north-yard/grassNear      (100,113,60)  63.6 67.0%  71/67 -> (40,39,17) 70.3 62.2%  23/12
 *   south-yard/lawnSouth      (104,102,60)  55.3 64.2%  74/34 -> (75,71,47) 55.5 56.5%  33/12
 *   glasshouse/baseBed        (74,107,12)   77.9 94.1%  85/80 -> (81,69,27)  52.7 70.8%  54/26
 *   garden-pod/bedGround      (68,110,9)    83.3 93.1%  87/82 -> (72,71,29)  61.3 63.5%  63/42
 *   sand-pit/surroundGround   (68,92,6)     72.8 92.0%  81/67 -> (47,47,17)  68.5 69.4%  38/19
 *   overhead/lawnBox          (165,144,117) 32.0 33.1% 156/66 -> (150,126,93) 34.3 40.4% 117/49
 *
 * Ours is brighter, more saturated, and (in every close-up) greener than the boards'
 * desaturated olive/khaki with warm dry tips. The authored lime was the blade
 * composition (75, 142, 39) hue 99.0 sat 72.5% and the 0x496438 plate hue 96.8.
 *
 * This test recomputes the authored plate+blade+straw mix in LINEAR space (the same
 * multiply the renderer does: linear(base) * tint * value) and asserts the predicted
 * mix lands within 12 deg of hue and 10 points of saturation of the authored board
 * target below, plus exact ratchets on every constant this lane moved.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createNuketown2MaterialRegistry } from './nuketown2-materials';
import {
  LAWN_DRY_ALBEDO_LINEAR,
  LAWN_DRY_PATCH_M,
  LAWN_DRY_PATCH_WEIGHT,
} from './nuketown2-materials/families/lawn';
import {
  NUKETOWN2_LAWN_BASE_COLOR,
  NUKETOWN2_LAWN_TINT,
} from './nuketown-lawn-field';
import { HEDGE_SPECIES } from './nuketown2-vegetation';

/**
 * Board turf target, sRGB. The shaded board lawn boxes sit at value ~20-35
 * (grassNear p50 23, lawnSouth p50 33) and the sunlit one at ~117
 * (overhead/lawnBox p50 117); an albedo must sit between the two, so the target
 * takes the boards' hue family (mid-50s) and mid saturation (mid-40s) at a
 * mid-tone value: hue 54.9 deg, sat 45.2%.
 */
const BOARD_LAWN_SRGB = Object.freeze([104, 100, 57] as const);

const toSrgb = (l: number): number => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255;

function hueSat(srgb: readonly number[]): readonly [number, number] {
  const [r, g, b] = [srgb[0]! / 255, srgb[1]! / 255, srgb[2]! / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return [0, 0] as const;
  const sat = ((max - min) / max) * 100;
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return [hue, sat] as const;
}

function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Blade green composition at a warm value, linear, exactly as the renderer multiplies. */
function bladeGreenLinear(warm: number): readonly [number, number, number] {
  const base = new THREE.Color(NUKETOWN2_LAWN_BASE_COLOR);
  return [
    base.r * (NUKETOWN2_LAWN_TINT.rBase + NUKETOWN2_LAWN_TINT.rWarm * warm) * NUKETOWN2_LAWN_TINT.valueBase,
    base.g * (NUKETOWN2_LAWN_TINT.gBase + NUKETOWN2_LAWN_TINT.gWarm * warm) * NUKETOWN2_LAWN_TINT.valueBase,
    base.b * (NUKETOWN2_LAWN_TINT.bBase + NUKETOWN2_LAWN_TINT.bWarm * warm) * NUKETOWN2_LAWN_TINT.valueBase,
  ] as const;
}

describe('HF-536 muse-lawn — authored turf lands on the boards olive', () => {
  it('lands the predicted plate+blade mix within 12 deg hue and 10 pts saturation of the board target', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const plate = (registry.lawn as THREE.Material & { color: THREE.Color }).color;
    const [boardHue, boardSat] = hueSat(BOARD_LAWN_SRGB);
    for (const warm of [0, 0.5, 1]) {
      const blade = bladeGreenLinear(warm);
      // The camera reads blades standing IN the plate: mean the two albedos in
      // linear space, exactly as mixed light adds.
      const mix: readonly number[] = [
        (plate.r + blade[0]!) / 2,
        (plate.g + blade[1]!) / 2,
        (plate.b + blade[2]!) / 2,
      ];
      const [hue, sat] = hueSat([toSrgb(mix[0]!), toSrgb(mix[1]!), toSrgb(mix[2]!)]);
      expect(hueDiff(hue, boardHue), `warm=${warm} mix hue ${hue.toFixed(1)} vs board ${boardHue.toFixed(1)}`).toBeLessThanOrEqual(12);
      expect(Math.abs(sat - boardSat), `warm=${warm} mix sat ${sat.toFixed(1)} vs board ${boardSat.toFixed(1)}`).toBeLessThanOrEqual(10);
    }
  });

  it('ratchets the moved constants (plate, scrub, planter, blade tint, straw, hedge)', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const hexOf = (role: string): number => (
      (registry[role] as THREE.Material & { color: THREE.Color }).color.getHex()
    );
    // Lawn plate 0x496438 (hue 96.8) -> olive; scrub and planter move with it so
    // the yard stays one palette.
    expect(hexOf('lawn')).toBe(0x6a6b3a);
    expect(hexOf('ground')).toBe(0x5e5f3c);
    expect(hexOf('planter')).toBe(0x57602f);
    // Blade green pull-down: the lime composition is gone.
    expect(NUKETOWN2_LAWN_TINT.rBase).toBeCloseTo(0.254, 3);
    expect(NUKETOWN2_LAWN_TINT.gBase).toBeCloseTo(0.336, 3);
    expect(NUKETOWN2_LAWN_TINT.bBase).toBeCloseTo(0.485, 3);
    // Straw warms over the olive turf (hue step, not brightness step).
    expect(LAWN_DRY_ALBEDO_LINEAR[0]).toBeCloseTo(0.342, 3);
    expect(LAWN_DRY_ALBEDO_LINEAR[1]).toBeCloseTo(0.246, 3);
    expect(LAWN_DRY_ALBEDO_LINEAR[2]).toBeCloseTo(0.061, 3);
    // Hedge mass moves with the lawn (leaf cards follow via the atlas + sss).
    expect(HEDGE_SPECIES.color).toBe(0x55602e);
    expect(HEDGE_SPECIES.sssColor).toBe(0x9aa04e);
  });

  it('keeps look-2b field period/phase and the p10 floor while moving', () => {
    // Period, phase and mix weight are look-2b's contract: plate and blades must
    // still go dry in the same places.
    expect(LAWN_DRY_PATCH_M).toBe(4.5);
    expect(LAWN_DRY_PATCH_WEIGHT).toBe(0.35);
    expect(NUKETOWN2_LAWN_TINT.dry!.patchM).toBe(4.5);
    expect(NUKETOWN2_LAWN_TINT.dry!.weight).toBe(0.35);
    // The lawn must not go darker than the boards' p10 (12 of 255 in both yard
    // lawn boxes): every authored turf tone keeps every channel well above 10.
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    for (const role of ['lawn', 'ground', 'planter'] as const) {
      const c = (registry[role] as THREE.Material & { color: THREE.Color }).color;
      const srgb = [toSrgb(c.r), toSrgb(c.g), toSrgb(c.b)];
      for (const channel of srgb) expect(channel).toBeGreaterThanOrEqual(10);
    }
    const bladeSrgb = [0, 0.5, 1].map((warm) => {
      const blade = bladeGreenLinear(warm);
      return [toSrgb(blade[0]!), toSrgb(blade[1]!), toSrgb(blade[2]!)];
    });
    for (const srgb of bladeSrgb) {
      for (const channel of srgb) expect(channel).toBeGreaterThanOrEqual(10);
    }
  });
});
