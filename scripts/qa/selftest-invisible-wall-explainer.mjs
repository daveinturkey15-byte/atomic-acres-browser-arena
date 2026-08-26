#!/usr/bin/env node
// SELF-TEST for scripts/qa/sweep-invisible-walls-cdp.mjs's explanation rule.
// "A harness that cannot fail is not evidence": before trusting an all-clear
// map, prove both branches fire against LIVE game state.
//
// Controls (atomic-acres, whose central bus at ~(0,0) is a known solid -
// see verify-collider-parity-cdp.mjs 'central-bus-solid-control'):
//   A) explained path - stand west of the bus facing east, run the sweep's
//      own EXPLAIN_FN. MUST return kind='explained' with triangle-accurate
//      raycast hits naming the bus batch.
//   B) invisible-wall branch wiring - identical probe after deliberately
//      blanking the visible-mesh sample. MUST return kind='invisible-wall'
//      (authority march still finds the collider; nothing visible explains).
//   C) march sanity - collisionProbeAt must flip true somewhere within 2.4 m,
//      i.e. the authority march can locate the bus face.
//
// Exit 0 iff all three controls pass. This validates the DETECTOR only; it
// makes no claim about the game.
//
// Usage: node scripts/qa/selftest-invisible-wall-explainer.mjs [--url http://127.0.0.1:41911]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41911');

// Load the exact page-side functions from the sweep script so the self-test
// exercises the SHIPPED code, not a copy.
const sweepSource = readFileSync(resolve0(), 'utf8');
function resolve0() {
  // scripts/qa/selftest-... -> sibling sweep script
  return new URL('./sweep-invisible-walls-cdp.mjs', import.meta.url).pathname
    .replace(/^\/([A-Za-z]:)/, '$1');
}
const sampleFnSource = sweepSource.slice(
  sweepSource.indexOf('const SAMPLE_MESHES_FN'),
  sweepSource.indexOf('const EXPLAIN_FN'),
);
const explainFnSource = sweepSource.slice(
  sweepSource.indexOf('const EXPLAIN_FN'),
  sweepSource.indexOf('async function runArena'),
);
if (!sampleFnSource || !explainFnSource) {
  console.error('[selftest] could not extract page-side functions from sweep script');
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

await page.goto(`${BASE}/?renderer=webgpu&render=quality&seed=selftest&previewTime=0`, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 300_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
  return Boolean(snapshot) && snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 300_000 });
await page.waitForTimeout(2_000);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });

// Mirror the sweep's engagement: without a user gesture the presentation
// gate can hold the simulation (measured: a teleported player hung at drop
// height y=5 indefinitely until the canvas was clicked).
await page.click('body');

// Install the sweep's own page-side functions.
await page.evaluate(`${sampleFnSource}\n${explainFnSource}\nwindow.__SELFTEST_SAMPLE = SAMPLE_MESHES_FN;\nwindow.__SELFTEST_EXPLAIN = EXPLAIN_FN;`);

// Self-locating control spot: find a cell where the game authority says
// OPEN here and SOLID 1.5 m east - guaranteed standable with a wall ahead,
// regardless of authored geometry we cannot see from outside.
const spot = await page.evaluate(() => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  for (let x = -20; x <= 20; x += 2) {
    for (let z = -16; z <= 16; z += 2) {
      if (!debug.collisionProbe(x, z) && debug.collisionProbe(x + 1.5, z)) {
        return { x, z };
      }
    }
  }
  return null;
});
if (!spot) {
  console.error('[selftest] no open->solid cell found for controls');
  await browser.close();
  process.exit(1);
}
await page.evaluate(({ x, z }) => {
  window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 6, z, -Math.PI / 2, 0);
}, spot);
let settled = false;
let lastY = null;
let stableRuns = 0;
for (let attempt = 0; attempt < 24 && !settled; attempt += 1) {
  await page.waitForTimeout(250);
  const y = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position[1]);
  if (lastY !== null && Math.abs(y - lastY) < 0.02) stableRuns += 1;
  else stableRuns = 0;
  if (stableRuns >= 2) settled = true;
  lastY = y;
}
if (!settled) {
  console.error(`[selftest] player never settled (lastY=${lastY}); aborting rather than probing mid-air`);
  await browser.close();
  process.exit(1);
}

const outcome = await page.evaluate(async () => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const snapshot = debug.snapshot();
  const [ex, ey, ez] = snapshot.player.position;
  const feetY = ey - 1.7;
  const sampled = window.__SELFTEST_SAMPLE();
  window.__WALL_PROBE_MESHES = window.__WALL_PROBE_MESHES; // set by SAMPLE

  // Control A0 - raycast MACHINERY: a straight-down ray from the eye MUST
  // hit visible geometry (the ground being stood on). Proves intersectObjects
  // works against these material-batched meshes at all.
  const three = window.__WALL_PROBE_THREE;
  if (!three) {
    const chunkUrl = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /three\.webgpu[^/]*\.js/.test(name));
    window.__WALL_PROBE_THREE = await import(chunkUrl);
  }
  const downCaster = new window.__WALL_PROBE_THREE.Raycaster();
  downCaster.far = 4;
  downCaster.set(
    new window.__WALL_PROBE_THREE.Vector3(ex, ey, ez),
    new window.__WALL_PROBE_THREE.Vector3(0, -1, 0),
  );
  const meshes = window.__WALL_PROBE_MESHES;
  const downHits = downCaster.intersectObjects(meshes.map((mesh) => mesh.node), false);

  const args = [ex, ey, ez, 1, 0, feetY]; // dirX=1 (east), dirZ=0

  // Control C: authority march flips true ahead.
  let marchT = null;
  for (let t = 0.24; t <= 2.4; t += 0.12) {
    if (debug.collisionProbeAt(ex + t, feetY + 0.9, ez)) { marchT = t; break; }
  }

  const explainedRun = await window.__SELFTEST_EXPLAIN(args);
  const keepMeshes = window.__WALL_PROBE_MESHES;
  window.__WALL_PROBE_MESHES = [];
  const blankedRun = await window.__SELFTEST_EXPLAIN(args);
  window.__WALL_PROBE_MESHES = keepMeshes;
  return {
    playerAt: [Number(ex.toFixed(2)), Number(ey.toFixed(2)), Number(ez.toFixed(2))],
    sampledCount: Array.isArray(meshes) ? meshes.length : null,
    downHit: downHits.length > 0 ? { name: downHits[0].object.name || '(unnamed)', distanceM: Number(downHits[0].distance.toFixed(2)) } : null,
    marchT,
    explainedRun,
    blankedRun,
  };
});

console.log(JSON.stringify(outcome, null, 2));
const checks = {
  a0_raycastMachinery: outcome.downHit !== null,
  c_marchFoundCollider: outcome.marchT !== null,
  a_explainedPath: outcome.explainedRun?.kind === 'explained' && (outcome.explainedRun.hits?.length ?? 0) > 0,
  b_invisibleWallBranch: outcome.blankedRun?.kind === 'invisible-wall',
};
console.log(JSON.stringify({ checks }, null, 2));
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
