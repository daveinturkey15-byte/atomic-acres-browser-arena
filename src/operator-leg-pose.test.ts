import { describe, expect, it } from 'vitest';
import {
  MAX_KNEE_FLEXION_RADIANS,
  MIN_LEG_LATERAL_SEPARATION_M,
  OPERATOR_BIND_LEG_SEPARATION_M,
  OPERATOR_LEG_LATERAL_OFFSET_M,
  PLANT_HANDOVER_PRONE_WEIGHT,
  PRONE_LEG_SETTLE_WEIGHT,
  STANCE_POSE_VALIDITY_WEIGHT,
  WORST_CLIP_ANKLE_SEPARATION_M,
  clampFootDistanceM,
  crouchPlantAuthority,
  judgeLegPose,
  kneeFlexionRadians,
  legSettleWeight,
  minimumFootDistanceM,
  proneLegSettleFloor,
  separateLegLateralTargets,
} from './operator-leg-pose';
import {
  OPERATOR_POSTURE_TRANSITIONS,
  advanceOperatorPosture,
  createOperatorPostureLayer,
  type OperatorPostureStance,
} from './operator-posture-layer';
import { AUTHORITATIVE_HIT_PROXIES } from './hit-proxies';

/**
 * HF-509. The pose-validity gate for the owner's report: "when they go prone and
 * or crouch, their legs get tangled up".
 *
 * The transition sampler below is not a mock of the fix - it drives the SHIPPED
 * posture blend (`advanceOperatorPosture`, whose durations come from
 * `DROP_SHOT_TIMING`) and the SHIPPED correction functions
 * (`crouchPlantAuthority`, `separateLegLateralTargets`, `legSettleWeight`,
 * `clampFootDistanceM`) over the same frames the runtime does. What it models is
 * only the part that needs a GPU: the ankle positions the standing clip corpus
 * writes. Those are modelled as the WORST case the corpus produces, a mid-cycle
 * lateral run whose ankles cross the midline by
 * `WORST_CLIP_ANKLE_SEPARATION_M`, because a fix that survives the worst case
 * survives the rest.
 */

/**
 * Leg segment lengths, derived from the rig rather than tuned: the two leg hit
 * proxies in `hit-proxies.ts` are 0.72 m tall and centred at y = 0.36, so the
 * leg spans ground to 0.72 m and the knee halves it.
 */
const LEG_PROXY = AUTHORITATIVE_HIT_PROXIES.filter((proxy) => proxy.position[1] < 0.5);
const LEG_SPAN_M = LEG_PROXY[0].size[1];
const UPPER_LENGTH_M = LEG_SPAN_M / 2;
const LOWER_LENGTH_M = LEG_SPAN_M / 2;
/** The shipped crouch drops the hips by this much; see `operator-model.ts`. */
const CROUCH_HIP_DROP_M = 0.44;

type StanceStep = Readonly<{ stance: OperatorPostureStance; seconds: number }>;

type SampledFrame = Readonly<{
  seconds: number;
  stance: OperatorPostureStance;
  crouch: number;
  prone: number;
  standing: number;
  plantAuthority: number;
  settle: number;
  ankleSeparationM: number;
  kneeSeparationM: number;
  kneeFlexionRadians: number;
}>;

/**
 * The worst lateral ankle pair the standing corpus produces at clip phase
 * `phase`. At phase 1 the pair is crossed by exactly
 * `WORST_CLIP_ANKLE_SEPARATION_M`; at phase 0 it is at bind separation.
 */
function clipAnkleLaterals(phase: number): { left: number; right: number } {
  const swing = (OPERATOR_BIND_LEG_SEPARATION_M - WORST_CLIP_ANKLE_SEPARATION_M) / 2;
  return {
    left: -OPERATOR_LEG_LATERAL_OFFSET_M + swing * phase,
    right: OPERATOR_LEG_LATERAL_OFFSET_M - swing * phase,
  };
}

function lerp(from: number, to: number, weight: number): number {
  return from + (to - from) * weight;
}

/**
 * Samples a stance script frame by frame at 120 Hz, running the shipped posture
 * blend and the shipped corrections, and reports the leg pose each frame.
 */
function sampleStanceScript(script: readonly StanceStep[], clipPhase = 1): SampledFrame[] {
  const layer = createOperatorPostureLayer(script[0].stance);
  const frames: SampledFrame[] = [];
  const deltaSeconds = 1 / 120;
  let seconds = 0;
  for (const step of script) {
    const stepFrames = Math.max(1, Math.round(step.seconds / deltaSeconds));
    for (let frame = 0; frame < stepFrames; frame += 1) {
      const posture = advanceOperatorPosture(layer, {
        deltaSeconds,
        stance: step.stance,
        // A crawl and a crouch-walk both move; the speed is capped by the
        // posture layer itself, which is the point of feeding it a real one.
        groundSpeedMps: 1.6,
      });
      seconds += deltaSeconds;
      const crouch = posture.weights.crouch;
      const prone = posture.weights.prone;
      const plantAuthority = crouchPlantAuthority(crouch, prone);
      const settle = legSettleWeight(crouch, prone);
      const clip = clipAnkleLaterals(clipPhase);
      // The runtime's two corrections, in the runtime's order: the plant's
      // lateral separation when the plant has authority, then the settle toward
      // the bind pose for the region the plant is withdrawn from.
      const planted = plantAuthority > 0
        ? separateLegLateralTargets(clip.left, clip.right)
        : { left: clip.left, right: clip.right };
      const ankleLeft = lerp(planted.left, -OPERATOR_LEG_LATERAL_OFFSET_M, settle);
      const ankleRight = lerp(planted.right, OPERATOR_LEG_LATERAL_OFFSET_M, settle);
      // The knee rides between the hip, which stays at the rig's own hip width,
      // and the ankle.
      const kneeLeft = (-OPERATOR_LEG_LATERAL_OFFSET_M + ankleLeft) / 2;
      const kneeRight = (OPERATOR_LEG_LATERAL_OFFSET_M + ankleRight) / 2;
      // Hip-to-ankle distance: the crouch drops the hip toward the foot, prone
      // straightens the leg back out under the laid-down pelvis.
      const vertical = lerp(lerp(LEG_SPAN_M, LEG_SPAN_M - CROUCH_HIP_DROP_M, crouch), LEG_SPAN_M * 0.94, prone);
      const lateral = Math.abs(ankleRight - OPERATOR_LEG_LATERAL_OFFSET_M);
      const distance = clampFootDistanceM(Math.hypot(vertical, lateral), UPPER_LENGTH_M, LOWER_LENGTH_M);
      frames.push({
        seconds,
        stance: step.stance,
        crouch,
        prone,
        standing: posture.weights.stand,
        plantAuthority,
        settle,
        ankleSeparationM: ankleRight - ankleLeft,
        kneeSeparationM: kneeRight - kneeLeft,
        kneeFlexionRadians: kneeFlexionRadians(distance, UPPER_LENGTH_M, LOWER_LENGTH_M),
      });
    }
  }
  return frames;
}

/** The frames the no-crossing rule is asserted over; see STANCE_POSE_VALIDITY_WEIGHT. */
function inValidityDomain(frame: SampledFrame): boolean {
  return frame.crouch + frame.prone >= STANCE_POSE_VALIDITY_WEIGHT;
}

describe('HF-509 rig-derived leg geometry', () => {
  it('takes its separation constants from the authoritative leg proxies', () => {
    const legs = AUTHORITATIVE_HIT_PROXIES.filter((proxy) => proxy.position[1] < 0.5);
    expect(legs).toHaveLength(2);
    expect(Math.abs(legs[0].position[0])).toBeCloseTo(OPERATOR_LEG_LATERAL_OFFSET_M, 6);
    expect(legs[1].position[0] - legs[0].position[0]).toBeCloseTo(OPERATOR_BIND_LEG_SEPARATION_M, 6);
  });

  it('sets the crossing threshold below any real crouch and above zero', () => {
    expect(MIN_LEG_LATERAL_SEPARATION_M).toBeCloseTo(0.12, 6);
    expect(MIN_LEG_LATERAL_SEPARATION_M).toBeLessThan(OPERATOR_BIND_LEG_SEPARATION_M);
    expect(MIN_LEG_LATERAL_SEPARATION_M).toBeGreaterThan(0);
  });

  it('admits the shipped crouch drop inside the knee limit', () => {
    // 0.72 m of leg minus a 0.44 m hip drop is a 0.28 m hip-to-ankle distance.
    const flexion = kneeFlexionRadians(LEG_SPAN_M - CROUCH_HIP_DROP_M, UPPER_LENGTH_M, LOWER_LENGTH_M);
    expect(flexion).toBeGreaterThan(2);
    expect(flexion).toBeLessThanOrEqual(MAX_KNEE_FLEXION_RADIANS);
  });
});

describe('HF-509 joint limits', () => {
  it('maps a straight leg to zero flexion and a folded leg to the maximum', () => {
    expect(kneeFlexionRadians(UPPER_LENGTH_M + LOWER_LENGTH_M, UPPER_LENGTH_M, LOWER_LENGTH_M)).toBeCloseTo(0, 6);
    const minimum = minimumFootDistanceM(UPPER_LENGTH_M, LOWER_LENGTH_M);
    expect(kneeFlexionRadians(minimum, UPPER_LENGTH_M, LOWER_LENGTH_M)).toBeCloseTo(MAX_KNEE_FLEXION_RADIANS, 5);
  });

  it('clamps a target inside the knee-fold limit that the shared IK would accept', () => {
    // Equal segments: `solveTwoBoneElbow` clamps to |upper - lower| = 0, a leg
    // folded flat against itself. This is the limit the runtime adds.
    const collapsed = clampFootDistanceM(0.02, UPPER_LENGTH_M, LOWER_LENGTH_M);
    expect(collapsed).toBeGreaterThan(0.2);
    expect(kneeFlexionRadians(collapsed, UPPER_LENGTH_M, LOWER_LENGTH_M)).toBeLessThanOrEqual(
      MAX_KNEE_FLEXION_RADIANS + 1e-6,
    );
  });

  it('never returns a target beyond the leg span, and survives a non-finite distance', () => {
    expect(clampFootDistanceM(9, UPPER_LENGTH_M, LOWER_LENGTH_M)).toBeLessThan(UPPER_LENGTH_M + LOWER_LENGTH_M);
    expect(Number.isFinite(clampFootDistanceM(Number.NaN, UPPER_LENGTH_M, LOWER_LENGTH_M))).toBe(true);
  });
});

describe('HF-509 lateral target separation', () => {
  it('leaves an already-separated pair exactly alone', () => {
    const pair = separateLegLateralTargets(-0.2, 0.3);
    expect(pair.left).toBeCloseTo(-0.2, 9);
    expect(pair.right).toBeCloseTo(0.3, 9);
  });

  it('un-crosses a swapped pair and preserves its mean', () => {
    const pair = separateLegLateralTargets(0.08, -0.04);
    expect(pair.right - pair.left).toBeCloseTo(MIN_LEG_LATERAL_SEPARATION_M, 9);
    expect((pair.left + pair.right) / 2).toBeCloseTo(0.02, 9);
    expect(pair.left).toBeLessThan(pair.right);
  });

  it('keeps a stride that is genuinely shifted to one side shifted', () => {
    const pair = separateLegLateralTargets(0.3, 0.32);
    expect((pair.left + pair.right) / 2).toBeCloseTo(0.31, 9);
  });
});

describe('HF-509 plant authority and settle', () => {
  it('gives the plant full authority in a pure crouch', () => {
    expect(crouchPlantAuthority(1, 0)).toBe(1);
    expect(legSettleWeight(1, 0)).toBe(0);
  });

  it('withdraws the plant once the pelvis has turned past the handover', () => {
    for (const prone of [PLANT_HANDOVER_PRONE_WEIGHT, 0.25, 0.5, 0.9, 1]) {
      expect(crouchPlantAuthority(1 - prone, prone)).toBe(0);
    }
    expect(crouchPlantAuthority(0.98, PLANT_HANDOVER_PRONE_WEIGHT - 0.01)).toBeGreaterThan(0);
  });

  it('hands the plant over to a settle that is already at full strength', () => {
    expect(legSettleWeight(1 - PLANT_HANDOVER_PRONE_WEIGHT, PLANT_HANDOVER_PRONE_WEIGHT))
      .toBeCloseTo(PRONE_LEG_SETTLE_WEIGHT, 6);
    expect(legSettleWeight(0.5, 0.5)).toBeCloseTo(PRONE_LEG_SETTLE_WEIGHT, 6);
    // Continuous into the handover rather than stepping at it.
    expect(legSettleWeight(1, PLANT_HANDOVER_PRONE_WEIGHT / 2)).toBeCloseTo(PRONE_LEG_SETTLE_WEIGHT / 2, 6);
  });

  it('clears the algebraic settle floor with margin', () => {
    const floor = proneLegSettleFloor();
    expect(floor).toBeCloseTo(0.42857, 4);
    expect(PRONE_LEG_SETTLE_WEIGHT).toBeGreaterThan(floor);
  });
});

describe('HF-509 pose validity through the crouch and prone transitions', () => {
  const scripts: Readonly<Record<string, readonly StanceStep[]>> = {
    'stand->crouch->stand': [
      { stance: 'stand', seconds: 0.1 },
      { stance: 'crouch', seconds: 0.6 },
      { stance: 'stand', seconds: 0.6 },
    ],
    'stand->prone->stand': [
      { stance: 'stand', seconds: 0.1 },
      { stance: 'prone', seconds: 0.8 },
      { stance: 'stand', seconds: 0.8 },
    ],
    'crouch->prone->crouch': [
      { stance: 'crouch', seconds: 0.3 },
      { stance: 'prone', seconds: 0.8 },
      { stance: 'crouch', seconds: 0.8 },
    ],
  };

  for (const [name, script] of Object.entries(scripts)) {
    it(`never crosses the legs through ${name}`, () => {
      const frames = sampleStanceScript(script);
      const domain = frames.filter(inValidityDomain);
      expect(domain.length).toBeGreaterThan(40);
      const worst = domain.reduce(
        (lowest, frame) => Math.min(lowest, frame.ankleSeparationM, frame.kneeSeparationM),
        Number.POSITIVE_INFINITY,
      );
      expect(worst).toBeGreaterThanOrEqual(MIN_LEG_LATERAL_SEPARATION_M - 1e-9);
      for (const frame of domain) {
        const assessment = judgeLegPose({
          kneeLeftLateralM: -frame.kneeSeparationM / 2,
          kneeRightLateralM: frame.kneeSeparationM / 2,
          ankleLeftLateralM: -frame.ankleSeparationM / 2,
          ankleRightLateralM: frame.ankleSeparationM / 2,
          kneeLeftFlexionRadians: frame.kneeFlexionRadians,
          kneeRightFlexionRadians: frame.kneeFlexionRadians,
        });
        expect(assessment.valid).toBe(true);
      }
    });

    it(`keeps every knee inside its limit through ${name}`, () => {
      for (const frame of sampleStanceScript(script)) {
        expect(frame.kneeFlexionRadians).toBeGreaterThanOrEqual(0);
        expect(frame.kneeFlexionRadians).toBeLessThanOrEqual(MAX_KNEE_FLEXION_RADIANS + 1e-6);
      }
    });
  }

  it('is a real test: the pre-fix chain crosses the legs on the same frames', () => {
    // The shipped behaviour before HF-509: the plant ran whenever crouch > 0.001
    // regardless of prone weight, its targets were never separated, and prone
    // added no leg settle at all. Reproduced here so the assertions above are
    // known to be measuring something that was actually broken.
    const layer = createOperatorPostureLayer('crouch');
    const deltaSeconds = 1 / 120;
    let crossed = 0;
    let frames = 0;
    for (const step of [{ stance: 'crouch' as const, seconds: 0.3 }, { stance: 'prone' as const, seconds: 0.8 }]) {
      for (let frame = 0; frame < Math.round(step.seconds / deltaSeconds); frame += 1) {
        const posture = advanceOperatorPosture(layer, {
          deltaSeconds, stance: step.stance, groundSpeedMps: 1.6,
        });
        if (posture.weights.crouch + posture.weights.prone < STANCE_POSE_VALIDITY_WEIGHT) continue;
        frames += 1;
        const clip = clipAnkleLaterals(1);
        if (clip.right - clip.left < MIN_LEG_LATERAL_SEPARATION_M) crossed += 1;
      }
    }
    expect(frames).toBeGreaterThan(40);
    expect(crossed).toBe(frames);
  });

  it('uses the shipped posture transition table, not a private one', () => {
    expect(OPERATOR_POSTURE_TRANSITIONS.transitions['crouch->prone']).toBeGreaterThan(0);
    expect(OPERATOR_POSTURE_TRANSITIONS.transitions['stand->prone']).toBeGreaterThan(0);
  });
});
