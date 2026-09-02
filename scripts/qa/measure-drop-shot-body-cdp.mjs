// HF-412 (Lane Y) — the BODY half of the drop shot.
//
// The owner: "and has an animation too of the body". What another player sees
// is a third-person rig posed by `updateRiggedOperator(root, speed, stance)` —
// the SAME function a guest runs for a remote peer, a host runs for a bot, and
// the local player's shadow runs for itself. This script drives one rig's
// stance through the debug bot-presentation lever and samples the rig's own
// `animationContract.proneBlend` every frame, so "the body falls, it does not
// snap" is a measurement rather than a screenshot impression.
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
    const proneBlend = () => {
      const bot = debug.snapshot().bots[0];
      return {
        stance: bot?.operatorModel?.animationContract?.stance ?? null,
        proneBlend: bot?.operatorModel?.animationContract?.proneBlend ?? null,
        crouchBlend: bot?.operatorModel?.animationContract?.crouchBlend ?? null,
        pivotHeight: bot?.operatorModel?.animationContract?.pivotHeight ?? null,
      };
    };
    // Settle the rig standing first, so the fall starts from a known pose.
    debug.setBotPresentation('stand', 0);
    for (let warm = 0; warm < 45; warm += 1) await frame();

    const samples = [];
    const start = performance.now();
    let droppedAt = null;
    for (;;) {
      const now = performance.now();
      const elapsed = now - start;
      if (elapsed > 1_200) break;
      if (droppedAt === null && elapsed >= 200) {
        droppedAt = elapsed;
        debug.setBotPresentation('prone', 0);
      }
      const contract = proneBlend();
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
  for (let index = 1; index < after.length; index += 1) {
    biggestStep = Math.max(biggestStep, (after[index].proneBlend ?? 0) - (after[index - 1].proneBlend ?? 0));
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
    finalProneBlend: report.finalProneBlend,
    snapped: report.snapped,
  }, null, 2)}`);
  console.log(`[drop-shot-body] wrote ${OUT}`);
} finally {
  await browser.close();
}
