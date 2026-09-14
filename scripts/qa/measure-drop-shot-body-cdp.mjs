// HF-412 (Lane Y) — the BODY half of the drop shot.
//
// The owner: "and has an animation too of the body". What another player sees
// is a third-person rig posed by `updateRiggedOperator(root, speed, stance)` —
// the SAME function a guest runs for a remote peer, a host runs for a bot, and
// the local player's shadow runs for itself. This script drives one rig's
// stance through the debug bot-presentation lever and samples the rig's own
// prone blend every frame, so "the body falls, it does not snap" is a
// measurement rather than a screenshot impression.
//
// WHAT THIS IS NOT. It drives the QA presentation override, not a networked
// peer: gameplay bots carry no stance at all. The guest-side evidence the
// HF-412 ledger row asks for is `measure-drop-shot-guest-cdp.mjs`.
//
// SAMPLING (fixed 2026-09-02 after review). The first version read
// `debug.snapshot()` every iteration, which rebuilds the whole operator report
// and stretched the sampling frame to ~65 ms - so its "largest single-frame
// blend step" was a 65 ms sample delta, not a frame, and its two runs were not
// aligned to the same point in the fall. It now reads
// `debug.sampleBodyStancePose('bot')`, which touches five fields, and it
// records the blend at the exact frame of the press so before/after start from
// the same pose.
//
// Headless only.
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
const ARENA = arg('--arena', 'atomic-acres');
const OUT = arg('--out', 'artifacts/qa/drop-shot/body.json');
const LABEL = arg('--label', 'before');

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

try {
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=dropshotbody&previewTime=0`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true && snapshot.bots.length > 0;
  }, undefined, { timeout: 300_000 });
  await page.waitForTimeout(2_000);

  const run = await page.evaluate(async () => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    // Cheap: five fields off the rig runtime, no bone walk. See
    // sampleBodyStancePose in legacy-main.ts.
    const pose = () => {
      const sample = debug.sampleBodyStancePose('bot');
      return {
        stance: sample.stance,
        proneBlend: sample.proneBlend,
        crouchBlend: sample.crouchBlend,
        pivotHeight: sample.pivotHeight,
        blendProgress: sample.blendProgress,
      };
    };
    // Settle the rig standing first, so the fall starts from a known pose.
    debug.setBotPresentation('stand', 0);
    for (let warm = 0; warm < 60; warm += 1) await frame();

    const samples = [];
    const start = performance.now();
    let droppedAt = null;
    for (;;) {
      const elapsed = performance.now() - start;
      if (elapsed > 1_200) break;
      // Sample FIRST, then press on this same frame, so sample 0 after the drop
      // is the pose at the press (blend 0) in both runs rather than whatever the
      // sampling interval happened to leave.
      const contract = pose();
      if (droppedAt === null && elapsed >= 200) {
        droppedAt = elapsed;
        debug.setBotPresentation('prone', 0);
      }
      samples.push({ t: Math.round(elapsed * 100) / 100, ...contract });
      await frame();
    }
    debug.setBotPresentation(null, 0);
    return { droppedAt, samples };
  });

  const after = run.samples.filter((sample) => sample.t >= run.droppedAt);
  const at = (fraction) => {
    const hit = after.find((sample) => (sample.proneBlend ?? 0) >= fraction);
    return hit ? Math.round((hit.t - run.droppedAt) * 100) / 100 : null;
  };
  let biggestStep = 0;
  let biggestStepFrameMs = 0;
  let worstFrameMs = 0;
  for (let index = 1; index < after.length; index += 1) {
    const step = (after[index].proneBlend ?? 0) - (after[index - 1].proneBlend ?? 0);
    const frameMs = after[index].t - after[index - 1].t;
    worstFrameMs = Math.max(worstFrameMs, frameMs);
    if (step > biggestStep) { biggestStep = step; biggestStepFrameMs = frameMs; }
  }
  const report = {
    label: LABEL,
    arena: ARENA,
    capturedAt: new Date().toISOString(),
    droppedAtMs: run.droppedAt,
    proneBlendAtDrop: after[0]?.proneBlend ?? null,
    finalProneBlend: after[after.length - 1]?.proneBlend ?? null,
    fivePercentAfterMs: at(0.05),
    ninetyFivePercentAfterMs: at(0.95),
    biggestSingleFrameBlendStep: Math.round(biggestStep * 1_000) / 1_000,
    // The frame that step was taken over, so the number can be read as a rate
    // rather than mistaken for a per-frame constant.
    biggestStepFrameMs: Math.round(biggestStepFrameMs * 100) / 100,
    worstSampleFrameMs: Math.round(worstFrameMs * 100) / 100,
    medianSampleFrameMs: (() => {
      const gaps = [];
      for (let index = 1; index < after.length; index += 1) gaps.push(after[index].t - after[index - 1].t);
      gaps.sort((a, b) => a - b);
      return gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] * 100) / 100 : null;
    })(),
    sampleCount: after.length,
    // A body that SNAPS covers the whole blend in one frame. A body that falls
    // cannot: the step is bounded by frame time over the transition window.
    snapped: biggestStep > 0.5,
    samples: run.samples,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[drop-shot-body] ${JSON.stringify({
    label: report.label,
    fivePercentAfterMs: report.fivePercentAfterMs,
    ninetyFivePercentAfterMs: report.ninetyFivePercentAfterMs,
    biggestSingleFrameBlendStep: report.biggestSingleFrameBlendStep,
    medianSampleFrameMs: report.medianSampleFrameMs,
    proneBlendAtDrop: report.proneBlendAtDrop,
    finalProneBlend: report.finalProneBlend,
    snapped: report.snapped,
  }, null, 2)}`);
  console.log(`[drop-shot-body] wrote ${OUT}`);
} finally {
  await browser.close();
}
