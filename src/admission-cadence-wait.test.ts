import { describe, expect, it } from 'vitest';
import {
  ADMISSION_CADENCE_CEILING_MS,
  ADMISSION_CADENCE_TARGET_STABLE_FRAMES,
  computeMedianGap,
  evaluateAdaptiveCadenceDecision,
  type AdaptiveCadenceDecision,
} from './admission-cadence-wait';

describe('evaluateAdaptiveCadenceDecision', () => {
  it('computes correct median gap for odd and even length samples', () => {
    expect(computeMedianGap([])).toBeNull();
    expect(computeMedianGap([16.6])).toBe(16.6);
    expect(computeMedianGap([16.0, 16.6, 17.0])).toBe(16.6);
    expect(computeMedianGap([16.0, 16.4, 16.8, 17.2])).toBe(16.6);
    expect(computeMedianGap([33.3, 16.6, 50.0])).toBe(33.3);
  });

  it('exits early when presented-frame cadence has been stable for 30 consecutive frames', () => {
    const startedAt = 1_000;
    const frameIntervalMs = 1_000 / 60; // ~16.667 ms
    let now = startedAt;
    let previousAt = startedAt;
    let consecutiveStableFrames = 0;
    const recentGaps: number[] = [];

    let exitDecision: AdaptiveCadenceDecision | null = null;
    let exitFrameIndex = -1;

    // Deliver subsequent frame intervals
    for (let frame = 1; frame <= 60; frame += 1) {
      now += frameIntervalMs;
      recentGaps.push(frameIntervalMs);
      const decision = evaluateAdaptiveCadenceDecision({
        now,
        startedAt,
        previousFrameAt: previousAt,
        consecutiveStableFrames,
        recentGapsMs: recentGaps,
        progressReady: true,
      });

      consecutiveStableFrames = decision.consecutiveStableFrames;
      previousAt = now;

      if (decision.shouldExit) {
        exitDecision = decision;
        exitFrameIndex = frame;
        break;
      }
    }

    expect(exitDecision).not.toBeNull();
    expect(exitDecision!.shouldExit).toBe(true);
    expect(exitDecision!.reason).toBe('stable-cadence-achieved');
    expect(exitDecision!.admittedDegraded).toBe(false);
    expect(exitDecision!.consecutiveStableFrames).toBe(ADMISSION_CADENCE_TARGET_STABLE_FRAMES);
    expect(exitFrameIndex).toBe(30); // exactly 30 stable intervals
    const achievedWaitMs = now - startedAt;
    expect(achievedWaitMs).toBeCloseTo(30 * frameIntervalMs, 1); // ~500 ms
    expect(achievedWaitMs).toBeLessThan(ADMISSION_CADENCE_CEILING_MS);
  });

  it('works on high-refresh 120 Hz and 144 Hz display cadences', () => {
    for (const hz of [120, 144]) {
      const startedAt = 1_000;
      const frameIntervalMs = 1_000 / hz;
      let now = startedAt;
      let previousAt = startedAt;
      let consecutiveStableFrames = 0;
      const recentGaps: number[] = [];
      let exitDecision: AdaptiveCadenceDecision | null = null;

      for (let frame = 1; frame <= 50; frame += 1) {
        now += frameIntervalMs;
        recentGaps.push(frameIntervalMs);
        const decision = evaluateAdaptiveCadenceDecision({
          now,
          startedAt,
          previousFrameAt: previousAt,
          consecutiveStableFrames,
          recentGapsMs: recentGaps,
          progressReady: true,
        });
        consecutiveStableFrames = decision.consecutiveStableFrames;
        previousAt = now;
        if (decision.shouldExit) {
          exitDecision = decision;
          break;
        }
      }

      expect(exitDecision).not.toBeNull();
      expect(exitDecision!.reason).toBe('stable-cadence-achieved');
      expect(exitDecision!.admittedDegraded).toBe(false);
      expect(now - startedAt).toBeLessThan(1_000); // Exits in ~210-250 ms on high-refresh
    }
  });

  it('resets consecutive stable frames on hitches > 50 ms and waits toward ceiling', () => {
    const startedAt = 1_000;
    let now = startedAt;
    let previousAt = startedAt;
    let consecutiveStableFrames = 0;
    const recentGaps: number[] = [];

    // Deliver 20 stable frames
    for (let frame = 1; frame <= 20; frame += 1) {
      now += 16.6;
      recentGaps.push(16.6);
      const decision = evaluateAdaptiveCadenceDecision({
        now,
        startedAt,
        previousFrameAt: previousAt,
        consecutiveStableFrames,
        recentGapsMs: recentGaps,
        progressReady: true,
      });
      consecutiveStableFrames = decision.consecutiveStableFrames;
      previousAt = now;
      expect(decision.shouldExit).toBe(false);
    }
    expect(consecutiveStableFrames).toBe(20);

    // Frame 21 is a 65 ms hitch (> 50 ms limit)
    now += 65.0;
    recentGaps.push(65.0);
    const hitchDecision = evaluateAdaptiveCadenceDecision({
      now,
      startedAt,
      previousFrameAt: previousAt,
      consecutiveStableFrames,
      recentGapsMs: recentGaps,
      progressReady: true,
    });
    expect(hitchDecision.shouldExit).toBe(false);
    expect(hitchDecision.reason).toBe('unstable-hitch');
    expect(hitchDecision.consecutiveStableFrames).toBe(0); // Reset!
    consecutiveStableFrames = hitchDecision.consecutiveStableFrames;
    previousAt = now;

    // Next frame is stable again, counter restarts from 1
    now += 16.6;
    recentGaps.push(16.6);
    const recoverDecision = evaluateAdaptiveCadenceDecision({
      now,
      startedAt,
      previousFrameAt: previousAt,
      consecutiveStableFrames,
      recentGapsMs: recentGaps,
      progressReady: true,
    });
    expect(recoverDecision.consecutiveStableFrames).toBe(1);
    expect(recoverDecision.shouldExit).toBe(false);
  });

  it('resets consecutive stable frames on severe cadence variance (> 20% of median)', () => {
    const startedAt = 1_000;
    let now = startedAt + 28.0;
    let previousAt = startedAt;
    const recentGaps: number[] = [16.6, 16.6, 16.6, 16.6, 16.6];

    // Jump to a 28 ms frame (outside 16.6 * 1.2 = 19.92 ms, even though < 50 ms)
    const jitterDecision = evaluateAdaptiveCadenceDecision({
      now,
      startedAt,
      previousFrameAt: previousAt,
      consecutiveStableFrames: 10,
      recentGapsMs: recentGaps,
      progressReady: true,
    });
    expect(jitterDecision.shouldExit).toBe(false);
    expect(jitterDecision.reason).toBe('unstable-variance');
    expect(jitterDecision.consecutiveStableFrames).toBe(0); // Reset!
  });

  it('does not exit before presentation progress is ready, even if 30 frames are stable', () => {
    const startedAt = 1_000;
    let now = startedAt;
    let previousAt = startedAt;
    let consecutiveStableFrames = 0;
    const recentGaps: number[] = [];

    for (let frame = 1; frame <= 35; frame += 1) {
      now += 16.6;
      recentGaps.push(16.6);
      const decision = evaluateAdaptiveCadenceDecision({
        now,
        startedAt,
        previousFrameAt: previousAt,
        consecutiveStableFrames,
        recentGapsMs: recentGaps,
        progressReady: false, // NOT ready
      });
      consecutiveStableFrames = decision.consecutiveStableFrames;
      previousAt = now;
      expect(decision.shouldExit).toBe(false);
    }
    expect(consecutiveStableFrames).toBe(35);
  });

  it('respects documented floorMs when explicitly configured', () => {
    const startedAt = 1_000;
    let now = startedAt;
    let previousAt = startedAt;
    let consecutiveStableFrames = 0;
    const recentGaps: number[] = [];
    const floorMs = 1_000;

    // 30 frames at 16.6ms is ~500ms
    for (let frame = 1; frame <= 30; frame += 1) {
      now += 16.6;
      recentGaps.push(16.6);
      const decision = evaluateAdaptiveCadenceDecision({
        now,
        startedAt,
        previousFrameAt: previousAt,
        consecutiveStableFrames,
        recentGapsMs: recentGaps,
        progressReady: true,
        floorMs,
      });
      consecutiveStableFrames = decision.consecutiveStableFrames;
      previousAt = now;
      // At ~500ms, floor of 1000ms is not reached yet
      expect(decision.shouldExit).toBe(false);
    }
    expect(consecutiveStableFrames).toBe(30);
    // Advance frame by frame past floorMs (at 16.6 ms per frame, frame 61 passes 1,000 ms)
    let pastFloorDecision: AdaptiveCadenceDecision | null = null;
    for (let frame = 31; frame <= 65; frame += 1) {
      now += 16.6;
      recentGaps.push(16.6);
      const decision = evaluateAdaptiveCadenceDecision({
        now,
        startedAt,
        previousFrameAt: previousAt,
        consecutiveStableFrames,
        recentGapsMs: recentGaps,
        progressReady: true,
        floorMs,
      });
      consecutiveStableFrames = decision.consecutiveStableFrames;
      previousAt = now;
      if (decision.shouldExit) {
        pastFloorDecision = decision;
        break;
      }
    }
    expect(pastFloorDecision).not.toBeNull();
    expect(pastFloorDecision!.shouldExit).toBe(true);
    expect(pastFloorDecision!.reason).toBe('stable-cadence-achieved');
    expect(pastFloorDecision!.admittedDegraded).toBe(false);
    expect(now - startedAt).toBeGreaterThanOrEqual(floorMs);
  });

  it('never exceeds the 5,000 ms ceiling and exits degraded on timeout', () => {
    const startedAt = 10_000;
    const atCeiling = startedAt + ADMISSION_CADENCE_CEILING_MS;

    const timeoutDecision = evaluateAdaptiveCadenceDecision({
      now: atCeiling,
      startedAt,
      previousFrameAt: atCeiling - 16.6,
      consecutiveStableFrames: 5,
      recentGapsMs: [16.6],
      progressReady: false,
    });

    expect(timeoutDecision.shouldExit).toBe(true);
    expect(timeoutDecision.reason).toBe('ceiling-timeout');
    expect(timeoutDecision.admittedDegraded).toBe(true);

    // Over ceiling
    const overCeilingDecision = evaluateAdaptiveCadenceDecision({
      now: atCeiling + 200,
      startedAt,
      previousFrameAt: atCeiling + 180,
      consecutiveStableFrames: 2,
      recentGapsMs: [20],
      progressReady: false,
    });

    expect(overCeilingDecision.shouldExit).toBe(true);
    expect(overCeilingDecision.reason).toBe('ceiling-timeout');
    expect(overCeilingDecision.admittedDegraded).toBe(true);
  });
});
