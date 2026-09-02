import { expect, test, type Page } from '@playwright/test';
import { DROP_SHOT_TIMING } from '../../src/prone-transition';

/**
 * PASS 85 Lane Y — HF-412, drop shots the way Black Ops 2 did them.
 *
 * Owner, 2026-09-02 ~16:45 BST: "Also ensure 'drop shots' work like they did
 * back in black ops 2 days, no weird sliding or diving, just however drop shots
 * worked and what keys you had to press, important".
 *
 * The unit tests pin the state machine; this pins the thing only a browser can
 * show: that going prone MID-BURST in the real game keeps putting rounds out,
 * over a real fixed transition, with no lateral impulse.
 *
 * Measured on the shipped build before this landed
 * (docs/evidence/pass85/hf412/before-test1-quiet.json): the eye covered its
 * whole 1.09 m fall in ONE frame and `tryFire` refused 30 consecutive shots
 * with `stance-or-sprint-recovery`. Both are asserted against here.
 *
 * Headless installed Chrome, muted (owner standing instruction: no visible QA
 * windows, no audio).
 */
test.use({ channel: 'chrome', launchOptions: { args: ['--mute-audio'] } });

async function ready(page: Page): Promise<void> {
  await page.goto('/?release=latest&map=test1&renderer=webgl2&render=performance&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass85-drop-shot&previewTime=0');
  await page.waitForFunction(() => {
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return solo?.disabled === false
      && debug?.snapshot().weaponReady === true
      && debug.snapshot().bootstrap.stage === 'ready';
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase === 'active',
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await page.waitForTimeout(600);
}

type DropRun = {
  droppedAtMs: number;
  stanceAtDrop: string;
  samples: Array<{
    t: number; ammo: number; camY: number; recoveryMs: number; x: number; z: number;
    dropActive: boolean; dropProgress: number; dropEyeOffset: number; dropSpread: number;
  }>;
  fireBlock: { byReason: Record<string, number> };
};

/**
 * Hold the trigger through a prone drop and record, every frame, the ammunition
 * count (the real fire path decides it), the rendered eye height, the stance
 * recovery block and the horizontal position.
 */
async function dropWhileFiring(page: Page, dropAtMs: number, runMs: number): Promise<DropRun> {
  return page.evaluate(async ({ dropAt, total }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const frame = (): Promise<void> => new Promise((resolve) => { requestAnimationFrame(() => resolve()); });
    debug.setStanceForQa('stand');
    await frame();
    const weapon = debug.snapshot().player.weapon;
    debug.setAmmo(weapon, 900, 900);
    await frame();
    await frame();

    const samples: DropRun['samples'] = [];
    const start = performance.now();
    let droppedAtMs = -1;
    let stanceAtDrop = 'stand';
    for (;;) {
      const elapsed = performance.now() - start;
      if (elapsed > total) break;
      if (droppedAtMs < 0 && elapsed >= dropAt) {
        droppedAtMs = elapsed;
        stanceAtDrop = debug.setStanceForQa('prone');
      }
      debug.fireOnce();
      // Deliberately cheap: `snapshot()` walks every bone chain in the scene and
      // dragged the sampling frame out to ~80 ms, which then made the per-frame
      // fall look like a teleport that was actually just a slow frame.
      const readiness = debug.sampleWeaponActionReadiness();
      const seat = debug.cameraSeat();
      const drop = readiness.dropShot;
      samples.push({
        t: elapsed,
        ammo: readiness.ammo,
        camY: seat[1],
        recoveryMs: readiness.stanceRecoveryRemainingMs,
        x: seat[0],
        z: seat[2],
        dropActive: drop.active,
        dropProgress: drop.progress,
        dropEyeOffset: drop.eyeOffsetMeters,
        dropSpread: drop.spreadMultiplier,
      });
      await frame();
    }
    const snapshot = debug.snapshot();
    debug.setStanceForQa('stand');
    return { droppedAtMs, stanceAtDrop, samples, fireBlock: snapshot.fireBlock };
  }, { dropAt: dropAtMs, total: runMs }) as Promise<DropRun>;
}

function shotTimes(run: DropRun): number[] {
  const times: number[] = [];
  for (let index = 1; index < run.samples.length; index += 1) {
    if (run.samples[index - 1].ammo > run.samples[index].ammo) times.push(run.samples[index].t);
  }
  return times;
}

test.describe('HF-412 drop shot', () => {
  test('firing is continuous across the drop and the transition is a fall, not a teleport', async ({ page }) => {
    await ready(page);
    const run = await dropWhileFiring(page, 600, 1_500);
    expect(run.stanceAtDrop).toBe('prone');

    // 1. NO FIRE INTERRUPTION. The shipped build refused every shot for 260 ms.
    expect(run.fireBlock.byReason['stance-or-sprint-recovery'] ?? 0).toBe(0);
    const times = shotTimes(run);
    expect(times.length).toBeGreaterThan(6);
    const steady = times.filter((t) => t < run.droppedAtMs);
    const beforeGaps: number[] = [];
    for (let index = 1; index < steady.length; index += 1) beforeGaps.push(steady[index] - steady[index - 1]);
    const medianSteadyGap = [...beforeGaps].sort((a, b) => a - b)[Math.floor(beforeGaps.length / 2)];
    expect(medianSteadyGap).toBeGreaterThan(0);
    // Shots must keep landing THROUGH the whole transition window.
    const duringDrop = times.filter(
      (t) => t >= run.droppedAtMs && t <= run.droppedAtMs + DROP_SHOT_TIMING.standToProneMs,
    );
    expect(duringDrop.length).toBeGreaterThanOrEqual(2);
    // And no shot-to-shot gap across the drop may be a stance block in disguise.
    let worstGapAcrossDrop = 0;
    for (let index = 1; index < times.length; index += 1) {
      const from = times[index - 1];
      if (from < run.droppedAtMs - 120 || from > run.droppedAtMs + 500) continue;
      worstGapAcrossDrop = Math.max(worstGapAcrossDrop, times[index] - from);
    }
    expect(worstGapAcrossDrop).toBeLessThan(medianSteadyGap * 1.75);

    // 2. A REAL TRANSITION. The fall is spread over frames, not one of them.
    const window = run.samples.filter(
      (sample) => sample.t >= run.droppedAtMs - 40 && sample.t <= run.droppedAtMs + 700,
    );
    const totalFall = window[0].camY - window[window.length - 1].camY;
    expect(totalFall).toBeGreaterThan(0.8);
    let biggestSingleFrameFall = 0;
    let worstFrameMs = 0;
    for (let index = 1; index < window.length; index += 1) {
      biggestSingleFrameFall = Math.max(biggestSingleFrameFall, window[index - 1].camY - window[index].camY);
      if (window[index - 1].dropActive) worstFrameMs = Math.max(worstFrameMs, window[index].t - window[index - 1].t);
    }
    // The bound is the CURVE's, not a frame-rate-dependent constant: a
    // smoothstep's steepest slope is 1.5, so one frame can move at most
    // 1.5 * fall * dt / duration however slow the sampling frame is. A machine
    // under load therefore cannot fail this, and the shipped build - which moved
    // the whole 1.09 m in one frame - cannot pass it.
    const analyticFrameBound = 1.5 * totalFall * (worstFrameMs / DROP_SHOT_TIMING.standToProneMs) * 1.2;
    expect(biggestSingleFrameFall).toBeLessThan(Math.min(analyticFrameBound, totalFall * 0.9));

    // Stronger, and completely independent of frame rate: the eye offset the
    // runtime reports must be the smoothstep of its own reported progress.
    const smoothstep = (t: number): number => t * t * (3 - 2 * t);
    const inFlight = window.filter((sample) => sample.dropActive && sample.dropProgress > 0);
    expect(inFlight.length).toBeGreaterThan(1);
    for (const sample of inFlight) {
      expect(sample.dropEyeOffset).toBeCloseTo(totalFall * (1 - smoothstep(sample.dropProgress)), 2);
      // The reference's accuracy cost is present and bounded - never a refusal.
      expect(sample.dropSpread).toBeGreaterThanOrEqual(1);
      expect(sample.dropSpread).toBeLessThanOrEqual(DROP_SHOT_TIMING.transitionSpreadPeak + 1e-6);
    }
    // It still ARRIVES: the whole fall completes inside the fixed window plus a
    // couple of frames of scheduling slack.
    const settled = window.find(
      (sample) => sample.t > run.droppedAtMs && sample.camY <= window[0].camY - totalFall * 0.95,
    );
    expect(settled).toBeDefined();
    expect(settled!.t - run.droppedAtMs).toBeLessThan(DROP_SHOT_TIMING.standToProneMs + 120);

    // 3. NO SLIDE, NO DIVE. A stationary player who drops must not travel.
    const start = window[0];
    let travelled = 0;
    for (const sample of window) {
      travelled = Math.max(travelled, Math.hypot(sample.x - start.x, sample.z - start.z));
    }
    expect(travelled).toBeLessThan(0.05);
  });

  test('the crouch bind still stands a PRONE player up, however long it is held', async ({ page }) => {
    // The regression this pins: `nextStance('prone', 'toggle-crouch')` is
    // 'crouch', so a press from prone starts the rise - and an unconditional
    // hold-to-prone poll then forced the player straight back down
    // holdCrouchToProneMs later. The crouch key must remain the way out of
    // prone no matter how deliberately it is pressed.
    await ready(page);
    const result = await page.evaluate(async (holdMs) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const wait = (ms: number): Promise<void> => new Promise((resolve) => { window.setTimeout(resolve, ms); });
      const stance = (): string => debug.snapshot().player.stance as string;
      const down = (): void => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true }));
      const up = (): void => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', bubbles: true }));

      debug.setStanceForQa('prone');
      await wait(200);
      const beforePress = stance();
      down();
      await wait(120);
      const shortlyAfterPress = stance();
      // Hold well past the conversion threshold, twice over.
      await wait(holdMs * 2 + 300);
      const whileStillHeld = stance();
      up();
      await wait(200);
      const afterRelease = stance();
      debug.setStanceForQa('stand');
      return { beforePress, shortlyAfterPress, whileStillHeld, afterRelease };
    }, DROP_SHOT_TIMING.holdCrouchToProneMs);

    expect(result.beforePress).toBe('prone');
    expect(result.shortlyAfterPress).toBe('crouch');
    expect(result.whileStillHeld).toBe('crouch');
    expect(result.afterRelease).toBe('crouch');
  });

  test('holding the crouch bind goes prone, and a tap only crouches', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(async (holdMs) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const wait = (ms: number): Promise<void> => new Promise((resolve) => { window.setTimeout(resolve, ms); });
      const stance = (): string => debug.snapshot().player.stance as string;
      debug.setStanceForQa('stand');
      await wait(120);

      const down = (): void => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true }));
      const up = (): void => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', bubbles: true }));

      // A tap: crouch, and nothing more, however long we then wait.
      down();
      await wait(60);
      up();
      await wait(holdMs + 300);
      const afterTap = stance();

      debug.setStanceForQa('stand');
      await wait(150);
      // A hold: crouch on the press, prone once the hold passes the threshold.
      down();
      await wait(80);
      const duringHold = stance();
      await wait(holdMs + 250);
      const afterHold = stance();
      up();
      await wait(150);
      const afterRelease = stance();
      debug.setStanceForQa('stand');
      return { afterTap, duringHold, afterHold, afterRelease };
    }, DROP_SHOT_TIMING.holdCrouchToProneMs);

    expect(result.afterTap).toBe('crouch');
    expect(result.duringHold).toBe('crouch');
    expect(result.afterHold).toBe('prone');
    // Releasing must not stand the player back up - that would make the control
    // a peek rather than a drop shot.
    expect(result.afterRelease).toBe('prone');
  });
});
