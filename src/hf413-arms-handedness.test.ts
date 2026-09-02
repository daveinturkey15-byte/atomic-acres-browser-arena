// HF-413 (Lane Z, PASS 85). Falsifiers for the first-person arms and animation
// defects the owner reported as "inverted or strange", each pinned against the
// value that was MEASURED on the running build at base 75a4e508 rather than
// against a guess.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC,
  FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC,
  VIEWMODEL_MELEE_ENTRY_REFERENCE_DEPTH_METERS,
  firstPersonArmShoulderEntryNdc,
  viewmodelMeleeEntryMeters,
  viewmodelMeleeLateralOffset,
} from './weapon-presentation';
import type { ViewmodelGripFamily } from './weapon-presentation-pose-profiles';

/**
 * The floor `scripts/qa/verify-pass65-first-person-arms-visual.mjs` enforces on
 * every solved chain: an arm whose shoulder joint projects above this is an arm
 * that visibly ends in mid-air instead of continuing off the bottom edge.
 */
const BELOW_FRAME_CONTINUATION_NDC = -0.98;
const GRIP_FAMILIES: readonly ViewmodelGripFamily[] = ['long-gun', 'compact', 'handgun', 'heavy', 'crossbow'];

describe('HF-413 first-person arm shoulder entry stays below the frame', () => {
  it('keeps every authored lane past the below-frame continuation floor', () => {
    expect(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.left).toBeLessThan(BELOW_FRAME_CONTINUATION_NDC);
    expect(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right).toBeLessThan(BELOW_FRAME_CONTINUATION_NDC);
    expect(FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC).toBeLessThan(BELOW_FRAME_CONTINUATION_NDC);
  });

  it('keeps every reachable side/family/aim/high-ready combination past that floor', () => {
    // The measured regression: heavy hip, ADS and high-ready poses all resolved
    // to -0.83 at base 75a4e508 and the gate rejected each of them.
    for (const side of ['left', 'right'] as const) {
      for (const family of GRIP_FAMILIES) {
        for (const adsBlend of [0, 0.25, 0.5, 0.75, 1]) {
          for (const highReadyBlend of [0, 0.5, 1]) {
            const ndc = firstPersonArmShoulderEntryNdc(side, family, adsBlend, highReadyBlend);
            expect(
              ndc,
              `${side}/${family}/ads=${adsBlend}/highReady=${highReadyBlend}`,
            ).toBeLessThan(BELOW_FRAME_CONTINUATION_NDC);
          }
        }
      }
    }
  });

  it('still lifts the raised lane above the ordinary firing lane', () => {
    // HF-388's distinction must survive the fix, or the heavy/ADS forearm folds
    // back under the crop.
    expect(FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC)
      .toBeGreaterThan(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right);
    expect(firstPersonArmShoulderEntryNdc('right', 'heavy', 0, 0))
      .toBeGreaterThan(firstPersonArmShoulderEntryNdc('right', 'long-gun', 0, 0));
  });
});

describe('HF-413 melee entry is a screen-space lane, not a fixed metre offset', () => {
  const halfWidth = (depth: number, fov: number, aspect: number) =>
    Math.abs(depth) * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * aspect;

  it('reproduces the authored metres exactly at the calibration depth and fov', () => {
    for (const aspect of [16 / 9, 2560 / 1440, 3440 / 1440, 21 / 9]) {
      expect(viewmodelMeleeEntryMeters(aspect, 75, VIEWMODEL_MELEE_ENTRY_REFERENCE_DEPTH_METERS))
        .toBeCloseTo(viewmodelMeleeLateralOffset(aspect), 8);
    }
  });

  it('holds one screen displacement across every depth and field of view', () => {
    const aspect = 16 / 9;
    const authoredNdc = viewmodelMeleeLateralOffset(aspect)
      / halfWidth(VIEWMODEL_MELEE_ENTRY_REFERENCE_DEPTH_METERS, 75, aspect);
    for (const depth of [-0.3, -0.407, -0.6, -1.08, -1.4]) {
      for (const fov of [60, 75, 82, 100]) {
        const meters = viewmodelMeleeEntryMeters(aspect, fov, depth);
        expect(meters / halfWidth(depth, fov, aspect), `depth=${depth} fov=${fov}`)
          .toBeCloseTo(authoredNdc, 8);
      }
    }
  });

  it('collapses the measured off-screen peak at the live viewmodel depth', () => {
    // Measured live state at base 75a4e508: root z -0.407 m, fov 82, aspect
    // 1.7778, half frustum width 0.629 m. The old fixed 1.37 m offset displaced
    // the rig 2.18 NDC; the authored lane is 0.93 NDC.
    const aspect = 16 / 9;
    const live = halfWidth(-0.407, 82, aspect);
    expect(live).toBeCloseTo(0.6292, 3);
    expect(viewmodelMeleeLateralOffset(aspect) / live).toBeGreaterThan(2.1);
    const fixed = viewmodelMeleeEntryMeters(aspect, 82, -0.407);
    expect(fixed / live).toBeCloseTo(0.9298, 3);
    expect(fixed).toBeLessThan(viewmodelMeleeLateralOffset(aspect));
  });

  it('falls back to the authored metres for a degenerate depth, fov or aspect', () => {
    const authored = viewmodelMeleeLateralOffset(16 / 9);
    expect(viewmodelMeleeEntryMeters(Number.NaN, Number.NaN, Number.NaN)).toBeCloseTo(authored, 8);
    expect(viewmodelMeleeEntryMeters(16 / 9, 75, 0)).toBeCloseTo(authored, 8);
    expect(Number.isFinite(viewmodelMeleeEntryMeters(16 / 9, 500, -0.4))).toBe(true);
  });
});

describe('HF-413 shipped arms and weapon assets carry no mirror and no wrong-side socket', () => {
  it('runs the standing corpus gate over the shipped GLBs', async () => {
    // The gate itself is scripts/qa/verify-pass85-arms-handedness.mjs
    // (npm run qa:pass85:arms-handedness). It is executed rather than imported
    // so there is exactly one implementation of the audit and no TS/JS copy of
    // it that could drift away from the shipped gate.
    const { execFileSync } = await import('node:child_process');
    const stdout = execFileSync(
      process.execPath,
      ['scripts/qa/verify-pass85-arms-handedness.mjs'],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    const receipt = JSON.parse(stdout) as {
      verdict: string; files: number; nodes: number; sockets: number; violations: string[];
    };
    // Guards the guard: a corpus that silently shrank would pass vacuously.
    expect(receipt.files).toBeGreaterThanOrEqual(130);
    expect(receipt.nodes).toBeGreaterThanOrEqual(4000);
    expect(receipt.sockets).toBeGreaterThanOrEqual(400);
    expect(receipt.violations).toEqual([]);
    expect(receipt.verdict).toBe('pass');
  }, 60_000);
});
