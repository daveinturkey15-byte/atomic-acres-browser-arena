import { describe, expect, it } from 'vitest';
import {
  LOCOMOTION_IDLE_SPEED_MPS,
  LOCOMOTION_PLAYBACK_LIMITS,
  OPERATOR_LOCOMOTION_CALIBRATION,
  footSlideMetresPerSecond,
  playbackRateForGroundSpeed,
  solveLocomotion,
} from './animation-locomotion';

/** Exactly what the shipped runtime binds today (13 clips, no directional runs). */
const RUNTIME_CLIPS = Object.freeze([
  'Idle_Gun_Pointing', 'Idle_Gun', 'Idle_Gun_Shoot', 'Walk', 'Run_Shoot', 'Run',
  'Gun_Shoot', 'HitRecieve_2', 'HitRecieve', 'Death', 'Punch_Right', 'Kick_Right', 'Wave',
]);

/** The same set plus the three authored directional runs the corpus already has. */
const DIRECTIONAL_CLIPS = Object.freeze([...RUNTIME_CLIPS, 'Run_Back', 'Run_Left', 'Run_Right']);

function totalWeight(clips: readonly { weight: number }[]): number {
  return clips.reduce((sum, entry) => sum + entry.weight, 0);
}

describe('calibration', () => {
  it('covers every authored locomotion clip with a positive measured speed', () => {
    expect(Object.keys(OPERATOR_LOCOMOTION_CALIBRATION).sort()).toEqual(
      ['Run', 'Run_Back', 'Run_Left', 'Run_Right', 'Run_Shoot', 'Walk'],
    );
    for (const [clip, entry] of Object.entries(OPERATOR_LOCOMOTION_CALIBRATION)) {
      expect(entry.durationS, clip).toBeGreaterThan(0);
      expect(entry.authoredGroundSpeedMps, clip).toBeGreaterThan(0);
    }
  });

  it('keeps the walk slower than every run, as the source rig was authored', () => {
    const walk = OPERATOR_LOCOMOTION_CALIBRATION.Walk!.authoredGroundSpeedMps;
    for (const clip of ['Run', 'Run_Shoot', 'Run_Back', 'Run_Left', 'Run_Right'] as const) {
      expect(OPERATOR_LOCOMOTION_CALIBRATION[clip]!.authoredGroundSpeedMps, clip).toBeGreaterThan(walk);
    }
  });
});

describe('playbackRateForGroundSpeed', () => {
  it('matches the authored speed exactly inside the clamp band', () => {
    expect(playbackRateForGroundSpeed(2, 2)).toBe(1);
    expect(playbackRateForGroundSpeed(2, 3)).toBeCloseTo(1.5, 12);
    expect(playbackRateForGroundSpeed(2, 1.2)).toBeCloseTo(0.6, 12);
  });

  it('clamps rather than blurring the legs or crawling', () => {
    expect(playbackRateForGroundSpeed(1, 90)).toBe(LOCOMOTION_PLAYBACK_LIMITS.maximum);
    expect(playbackRateForGroundSpeed(90, 1)).toBe(LOCOMOTION_PLAYBACK_LIMITS.minimum);
  });

  it('degrades safely on hostile numbers', () => {
    expect(playbackRateForGroundSpeed(0, 4)).toBe(1);
    expect(playbackRateForGroundSpeed(Number.NaN, 4)).toBe(1);
    expect(playbackRateForGroundSpeed(2, Number.NaN)).toBe(LOCOMOTION_PLAYBACK_LIMITS.minimum);
  });
});

describe('foot sliding', () => {
  it('is exactly zero once playback matches the authored speed', () => {
    // 2.0 m/s is inside the clamp band for a 1.3416 m/s walk, so the rate can
    // match it exactly and the planted foot does not move at all.
    expect(footSlideMetresPerSecond(1.3416, 2, playbackRateForGroundSpeed(1.3416, 2))).toBeCloseTo(0, 12);
  });

  it('is the whole residual once the rate is clamped', () => {
    const rate = playbackRateForGroundSpeed(3.0832, 8.7);
    expect(rate).toBe(LOCOMOTION_PLAYBACK_LIMITS.maximum);
    expect(footSlideMetresPerSecond(3.0832, 8.7, rate)).toBeCloseTo(8.7 - 3.0832 * rate, 12);
  });
});

describe('solveLocomotion', () => {
  it('reports idle below the movement floor and emits no clips', () => {
    const solution = solveLocomotion({ forwardMps: 0.05, strafeMps: 0, availableClips: RUNTIME_CLIPS });
    expect(solution.moving).toBe(false);
    expect(solution.clips).toHaveLength(0);
    expect(LOCOMOTION_IDLE_SPEED_MPS).toBeGreaterThan(0.05);
  });

  it('emits weights that sum to one across a full speed and direction sweep', () => {
    for (const clips of [RUNTIME_CLIPS, DIRECTIONAL_CLIPS]) {
      for (let angleStep = 0; angleStep < 16; angleStep += 1) {
        const angle = (angleStep / 16) * Math.PI * 2;
        for (const speed of [0.3, 1.2, 1.35, 2.4, 3.1, 4.05, 6.15, 8.7]) {
          const solution = solveLocomotion({
            forwardMps: Math.cos(angle) * speed,
            strafeMps: Math.sin(angle) * speed,
            availableClips: clips,
          });
          expect(totalWeight(solution.clips)).toBeCloseTo(1, 12);
          for (const entry of solution.clips) expect(clips).toContain(entry.clip);
        }
      }
    }
  });

  it('drives every clip in a blend at one shared stride frequency', () => {
    const solution = solveLocomotion({ forwardMps: 2.2, strafeMps: 0, availableClips: RUNTIME_CLIPS });
    expect(solution.clips.length).toBeGreaterThan(1);
    for (const entry of solution.clips) {
      const duration = OPERATOR_LOCOMOTION_CALIBRATION[entry.clip]!.durationS;
      expect(entry.timeScale / duration).toBeCloseTo(solution.strideFrequencyHz, 10);
    }
  });

  it('removes foot sliding entirely at speeds the corpus can reach', () => {
    for (const speed of [1.0, 1.3416, 2.2, 3.0832, 4.6]) {
      const solution = solveLocomotion({ forwardMps: speed, strafeMps: 0, availableClips: RUNTIME_CLIPS });
      expect(solution.footSlideMps, `${speed} m/s`).toBeCloseTo(0, 9);
      expect(solution.footSlideRatio, `${speed} m/s`).toBeCloseTo(0, 9);
    }
  });

  it('reports, rather than hides, the residual slide a sprint cannot reach', () => {
    // 8.7 m/s is the authored sprint speed; the fastest authored clip is
    // 3.0832 m/s. No playback multiplier closes that without new art, so the
    // gap has to surface as evidence instead of being clamped away silently.
    const solution = solveLocomotion({ forwardMps: 8.7, strafeMps: 0, availableClips: RUNTIME_CLIPS });
    expect(solution.playbackRate).toBe(LOCOMOTION_PLAYBACK_LIMITS.maximum);
    expect(solution.footSlideMps).toBeGreaterThan(3);
    expect(solution.footSlideRatio).toBeGreaterThan(0.35);
  });

  it('blends walk into run instead of swapping clips at a threshold', () => {
    const slow = solveLocomotion({ forwardMps: 1.4, strafeMps: 0, availableClips: RUNTIME_CLIPS });
    const middle = solveLocomotion({ forwardMps: 2.2, strafeMps: 0, availableClips: RUNTIME_CLIPS });
    const fast = solveLocomotion({ forwardMps: 3.1, strafeMps: 0, availableClips: RUNTIME_CLIPS });
    const runWeight = (solution: typeof slow): number => solution.clips.find((entry) => entry.clip === 'Run_Shoot')?.weight ?? 0;
    expect(runWeight(slow)).toBeLessThan(runWeight(middle));
    expect(runWeight(middle)).toBeLessThan(runWeight(fast));
    expect(runWeight(fast)).toBeCloseTo(1, 6);
  });

  it('uses the authored directional runs when they are bound', () => {
    const strafe = solveLocomotion({ forwardMps: 0, strafeMps: 4.05, availableClips: DIRECTIONAL_CLIPS });
    expect(strafe.directional).toBe(true);
    expect(strafe.clips.map((entry) => entry.clip)).toEqual(['Run_Right']);
    expect(strafe.directionMismatch).toBeCloseTo(0, 12);

    const retreat = solveLocomotion({ forwardMps: -4.65, strafeMps: 0, availableClips: DIRECTIONAL_CLIPS });
    expect(retreat.clips.map((entry) => entry.clip)).toEqual(['Run_Back']);
    expect(retreat.directionMismatch).toBeCloseTo(0, 12);
  });

  it('blends adjacent cardinals on a diagonal', () => {
    const solution = solveLocomotion({ forwardMps: 3, strafeMps: 3, availableClips: DIRECTIONAL_CLIPS });
    const names = solution.clips.map((entry) => entry.clip).sort();
    expect(names).toContain('Run_Right');
    expect(names.some((clip) => clip === 'Run_Shoot' || clip === 'Run' || clip === 'Walk')).toBe(true);
    expect(totalWeight(solution.clips)).toBeCloseTo(1, 12);
    expect(solution.directionMismatch).toBeLessThan(0.1);
  });

  it('proves the moonwalk: a retreat on the current corpus plays a forward run', () => {
    // Bots retreat at 4.65 m/s and strafe at 4.05 m/s, and the runtime binds no
    // directional clips, so the played motion faces exactly backwards. This is
    // the measurement of that defect, not an endorsement of it.
    const retreat = solveLocomotion({ forwardMps: -4.65, strafeMps: 0, availableClips: RUNTIME_CLIPS });
    expect(retreat.directional).toBe(false);
    expect(retreat.clips.map((entry) => entry.clip)).toEqual(['Run_Shoot']);
    expect(retreat.directionMismatch).toBeCloseTo(1, 6);

    const strafe = solveLocomotion({ forwardMps: 0, strafeMps: 4.05, availableClips: RUNTIME_CLIPS });
    expect(strafe.directionMismatch).toBeCloseTo(0.5, 6);
  });

  it('never emits a clip the mixer has not bound', () => {
    const solution = solveLocomotion({ forwardMps: -3, strafeMps: 3, availableClips: ['Walk'] });
    expect(solution.clips.map((entry) => entry.clip)).toEqual(['Walk']);
    expect(totalWeight(solution.clips)).toBeCloseTo(1, 12);
  });

  it('prefers the shooting run only while armed', () => {
    const armed = solveLocomotion({ forwardMps: 6, strafeMps: 0, availableClips: RUNTIME_CLIPS, armed: true });
    const unarmed = solveLocomotion({ forwardMps: 6, strafeMps: 0, availableClips: RUNTIME_CLIPS, armed: false });
    expect(armed.clips[0]!.clip).toBe('Run_Shoot');
    expect(unarmed.clips[0]!.clip).toBe('Run');
  });

  it('is a pure function of its inputs', () => {
    const sample = { forwardMps: 2.7, strafeMps: -1.1, availableClips: DIRECTIONAL_CLIPS } as const;
    expect(solveLocomotion(sample)).toEqual(solveLocomotion(sample));
  });
});
