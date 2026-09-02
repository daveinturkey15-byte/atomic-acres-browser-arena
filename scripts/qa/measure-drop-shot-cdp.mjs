// HF-412 (Lane Y) — measure the DROP SHOT: what happens when the player presses
// the prone input while the trigger is down.
//
// The owner's statement is about a Black Ops 2 mechanic, so the two numbers that
// decide whether we have it are:
//   1. FIRE CONTINUITY — shots must keep landing across the stance change. This
//      script calls the real fire path (`debug.fireOnce()`, which runs `tryFire`
//      with every production gate) once per animation frame and records the
//      AMMO COUNT. A drop in the shot cadence across the transition IS the
//      interruption the owner is complaining about, measured rather than argued.
//   2. TRANSITION SHAPE — the camera eye height over time. A reference drop is a
//      short, fixed, smooth fall; a single-frame collapse is a teleport.
//
// Headless only (owner instruction 12:40 BST: no browser may take the screen).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41999');
const ARENA = arg('--arena', 'test1');
const OUT = arg('--out', 'artifacts/qa/drop-shot/measure.json');
const LABEL = arg('--label', 'before');
// The trigger is held for this long; the prone input is pressed at DROP_AT_MS.
const RUN_MS = Number(arg('--run-ms', '2000'));
const DROP_AT_MS = Number(arg('--drop-at-ms', '600'));
const RISE_AT_MS = Number(arg('--rise-at-ms', '1300'));

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));

try {
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=dropshot&previewTime=0`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 300_000 });
  await page.waitForTimeout(2_000);

  const run = await page.evaluate(async ({ runMs, dropAtMs, riseAtMs }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    // Stand, grounded, on the floor, with more ammunition than the run can
    // spend so a reload never masquerades as a stance interruption.
    debug.setStanceForQa('stand');
    await frame();
    const weapon = debug.snapshot().player.weapon;
    debug.setAmmo(weapon, 900, 900);
    await frame();
    await frame();

    const samples = [];
    const start = performance.now();
    let droppedAt = null;
    let roseAt = null;
    let stanceAtDrop = null;
    for (;;) {
      const now = performance.now();
      const elapsed = now - start;
      if (elapsed > runMs) break;
      if (droppedAt === null && elapsed >= dropAtMs) {
        droppedAt = elapsed;
        stanceAtDrop = debug.setStanceForQa('prone');
      }
      if (roseAt === null && elapsed >= riseAtMs) {
        roseAt = elapsed;
        debug.setStanceForQa('stand');
      }
      // The REAL fire path, every production gate included.
      debug.fireOnce();
      const readiness = debug.sampleWeaponActionReadiness();
      samples.push({
        t: Math.round(elapsed * 100) / 100,
        ammo: readiness.ammo,
        camY: Math.round(debug.cameraSeat()[1] * 10_000) / 10_000,
        stanceRecoveryMs: Math.round(readiness.stanceRecoveryRemainingMs * 100) / 100,
      });
      await frame();
    }
    debug.setStanceForQa('stand');
    const snapshot = debug.snapshot();
    return {
      weapon,
      droppedAt,
      roseAt,
      stanceAtDrop,
      finalStance: snapshot.player.stance,
      fireBlock: snapshot.fireBlock,
      samples,
    };
  }, { runMs: RUN_MS, dropAtMs: DROP_AT_MS, riseAtMs: RISE_AT_MS });

  // ---- derive the two headline numbers ----------------------------------
  const shots = [];
  for (let index = 1; index < run.samples.length; index += 1) {
    const spent = run.samples[index - 1].ammo - run.samples[index].ammo;
    if (spent > 0) shots.push({ t: run.samples[index].t, spent });
  }
  const gaps = [];
  for (let index = 1; index < shots.length; index += 1) {
    gaps.push({ from: shots[index - 1].t, to: shots[index].t, ms: Math.round((shots[index].t - shots[index - 1].t) * 100) / 100 });
  }
  const steadyGaps = gaps.filter((gap) => gap.to < run.droppedAt).map((gap) => gap.ms);
  const medianSteadyGap = steadyGaps.length
    ? [...steadyGaps].sort((a, b) => a - b)[Math.floor(steadyGaps.length / 2)]
    : null;
  // The interruption: the largest shot-to-shot gap that straddles the drop.
  const dropWindowGaps = gaps.filter((gap) => gap.from >= run.droppedAt - 120 && gap.from <= run.droppedAt + 500);
  const worstDropGap = dropWindowGaps.length ? Math.max(...dropWindowGaps.map((gap) => gap.ms)) : null;
  const riseWindowGaps = gaps.filter((gap) => gap.from >= run.roseAt - 120 && gap.from <= run.roseAt + 500);
  const worstRiseGap = riseWindowGaps.length ? Math.max(...riseWindowGaps.map((gap) => gap.ms)) : null;
  const shotsDuringDrop = shots.filter((shot) => shot.t >= run.droppedAt && shot.t <= run.droppedAt + 400).length;

  // Camera transition shape: how long the eye takes to cover 5%..95% of its
  // total fall, and how much of that fall landed inside ONE frame.
  // The window must END before the rise, or the eye climbing back to standing
  // cancels the fall and the shape reads as "no transition at all".
  const dropWindowEnd = Math.min(run.droppedAt + 800, (run.roseAt ?? Infinity) - 60);
  const dropSamples = run.samples.filter((sample) => sample.t >= run.droppedAt - 40 && sample.t <= dropWindowEnd);
  const startY = dropSamples.length ? dropSamples[0].camY : null;
  const endY = dropSamples.length ? dropSamples[dropSamples.length - 1].camY : null;
  const totalFall = startY !== null && endY !== null ? startY - endY : null;
  let transition = null;
  if (totalFall !== null && totalFall > 0.05) {
    const at = (fraction) => {
      const threshold = startY - totalFall * fraction;
      const hit = dropSamples.find((sample) => sample.camY <= threshold);
      return hit ? hit.t : null;
    };
    const t05 = at(0.05);
    const t95 = at(0.95);
    let biggestSingleFrameFall = 0;
    for (let index = 1; index < dropSamples.length; index += 1) {
      biggestSingleFrameFall = Math.max(biggestSingleFrameFall, dropSamples[index - 1].camY - dropSamples[index].camY);
    }
    transition = {
      totalFallMeters: Math.round(totalFall * 1_000) / 1_000,
      fivePercentAtMs: t05,
      ninetyFivePercentAtMs: t95,
      durationMs: t05 !== null && t95 !== null ? Math.round((t95 - t05) * 100) / 100 : null,
      biggestSingleFrameFallMeters: Math.round(biggestSingleFrameFall * 1_000) / 1_000,
      singleFrameFractionOfFall: Math.round((biggestSingleFrameFall / totalFall) * 1_000) / 1_000,
    };
  }

  const report = {
    label: LABEL,
    arena: ARENA,
    capturedAt: new Date().toISOString(),
    weapon: run.weapon,
    droppedAtMs: run.droppedAt,
    roseAtMs: run.roseAt,
    stanceAtDrop: run.stanceAtDrop,
    finalStance: run.finalStance,
    fireBlock: run.fireBlock,
    shotCount: shots.length,
    medianSteadyShotGapMs: medianSteadyGap,
    worstShotGapAcrossDropMs: worstDropGap,
    worstShotGapAcrossRiseMs: worstRiseGap,
    shotsInFirst400msOfDrop: shotsDuringDrop,
    fireInterruptedByDrop: medianSteadyGap !== null && worstDropGap !== null
      ? worstDropGap > medianSteadyGap * 1.75
      : null,
    cameraTransition: transition,
    pageErrors,
    shots,
    samples: run.samples,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  const headline = {
    label: report.label,
    shots: report.shotCount,
    medianGapMs: report.medianSteadyShotGapMs,
    worstGapAcrossDropMs: report.worstShotGapAcrossDropMs,
    worstGapAcrossRiseMs: report.worstShotGapAcrossRiseMs,
    shotsInFirst400ms: report.shotsInFirst400msOfDrop,
    fireInterrupted: report.fireInterruptedByDrop,
    transition: report.cameraTransition,
    stanceRecoveryBlocks: report.fireBlock?.byReason?.['stance-or-sprint-recovery'] ?? 0,
  };
  console.log(`[drop-shot] ${JSON.stringify(headline, null, 2)}`);
  console.log(`[drop-shot] wrote ${OUT}`);
} finally {
  await browser.close();
}
