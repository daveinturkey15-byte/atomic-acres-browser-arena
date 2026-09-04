#!/usr/bin/env node
// ===========================================================================
// WEAPON-SWITCH LATENCY PROBE — does a mid-combat weapon switch still commit
// on the SAME frame after admission stopped rehearsing every weapon?
//
// WHY THIS PROBE EXISTS
// ---------------------
// `admission-rehearsal-scope` (PASS 93/94) stopped walking all 21 catalog
// weapons through the full setWeapon state machine inside match admission.
// Only the weapons a player can actually hold on this arena — loadout primary,
// loadout sidearm and the arena's pickup-only specials — are rehearsed before
// the first live frame; the rest are deferred to a safe window (menu, respawn,
// pre-match countdown). If one is ever reached in combat before its safe
// window ran, `switchWeapon` fails closed rather than invoking the WebGPU
// prewarmer; the probe must report the missed commit instead of permitting a
// combat-time pipeline compile.
//
// That await is the whole risk of the change. A switch that used to be one
// synchronous assignment would become a promise round trip, and the player
// would feel a weapon that does not come up when they press the key. So the
// question this probe answers is not "is admission faster" — the switch matrix
// probe answers that — it is:
//
//   1. Is the synchronous cost of a real in-combat switch still ~0 ms?
//   2. Does the switch COMMIT on the next frame, not several frames later?
//   3. Is the deferred set actually unreachable from `switchWeapon`, with any
//      unexpected reach failing closed rather than compiling during combat?
//
// (3) is the one that decides whether (1) and (2) generalise. `switchWeapon`
// can only ever select the loadout primary, the loadout sidearm or the
// currently held authority special, and `createWeaponRehearsalPlan` puts all
// three in the admission hot set — so the intersection of the reachable set
// and `deferredWeaponIds` must be EMPTY. If a future loadout or handicap rule
// makes a deferred weapon reachable, this probe reds before a player feels it.
//
// It is a GATE: exit 1 on a non-empty intersection, on a switch that never
// commits, or on a synchronous cost above the budget. Timings are reported for
// every run; only those three are thresholds, and none of them is widened to
// make a build pass.
//
// HEADLESS, installed Chrome (channel:'chrome'), muted — the bundled Chromium
// cannot get a WebGPU device on dave-gaming-pc (dxil.dll Windows Error 87).
//
// USAGE
//   node scripts/qa/probe-weapon-switch-latency-cdp.mjs \
//     --dist dist --arena nuketown2 --switches 12 --label after
// ===========================================================================
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};

const DIST = resolve(arg('--dist', 'dist'));
const ARENA = arg('--arena', 'nuketown2');
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '4198'));
const WIDTH = Number(arg('--width', '1600'));
const HEIGHT = Number(arg('--height', '900'));
const SWITCHES = Number(arg('--switches', '12'));
const WARMUP_SECONDS = Number(arg('--warmup-seconds', '6'));
const BOOT_TIMEOUT_MS = Number(arg('--boot-timeout-ms', '300000'));
// The budget is the frame the switch has to land on. A switch that costs more
// than one 60 Hz frame of SYNCHRONOUS main-thread time is a hitch the player
// feels on the key press itself.
const SYNC_BUDGET_MS = Number(arg('--sync-budget-ms', '16.7'));
const OUT = resolve(arg('--out', `artifacts/qa/weapon-switch/${LABEL}.json`));

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}`);

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream',
  '.glb': 'model/gltf-binary', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.ktx2': 'application/octet-stream', '.bin': 'application/octet-stream',
};
const server = createServer((request, response) => {
  const requested = decodeURIComponent((request.url ?? '/').split('?')[0]);
  let filePath = join(DIST, requested === '/' ? 'index.html' : requested.replace(/^\/+/u, ''));
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(DIST, 'index.html');
  response.writeHead(200, {
    'Content-Type': TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });
  response.end(readFileSync(filePath));
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

const report = {
  contract: 'weapon-switch-latency-v1', measuredAt: new Date().toISOString(),
  label: LABEL, arena: ARENA, dist: DIST, switches: SWITCHES, syncBudgetMs: SYNC_BUDGET_MS,
};
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});

let failure = null;
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  const url = new URL(`http://127.0.0.1:${PORT}/`);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => {
    const solo = document.querySelector('#solo');
    return solo !== null && !solo.disabled;
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  report.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  if (report.backend !== 'webgpu') throw new Error(`no hardware WebGPU backend (${report.backend})`);

  await page.evaluate(async (arena) => {
    const card = document.querySelector(`.map-card[data-arena-id="${arena}"]`);
    if (card) card.click();
    else await window.__ATOMIC_ACRES_DEBUG__.selectArena(arena);
    const name = document.querySelector('#player-name');
    if (name) name.value = 'SwitchProbe';
  }, ARENA);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#solo').click());
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return Boolean(snapshot && snapshot.matchPhase === 'active' && snapshot.gameStarted === true);
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  console.error('[weapon-switch] match active; warming up');
  await page.waitForTimeout(WARMUP_SECONDS * 1000);

  // The rehearsal registry the build published for THIS match. A build without
  // the scoped scheduler simply has no such fields, and the reachability gate
  // then reports `null` instead of inventing a pass.
  report.rehearsal = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    const profile = snapshot?.bootstrap?.matchAdmissionProfile ?? null;
    const player = snapshot?.player ?? {};
    const cadence = snapshot?.bootstrap?.matchAdmissionCadence ?? null;
    return {
      // The cadence wait's own account of why it exited. `ceiling-timeout` with
      // a low stable-frame count is the adaptive exit never firing, which is a
      // different fact from the wait being slow.
      cadence: cadence === null ? null : {
        waitedMs: cadence.waitedMs, resets: cadence.resets, samples: cadence.samples,
        maximumGapMs: cadence.maximumGapMs, admittedDegraded: cadence.admittedDegraded,
        exitReason: cadence.exitReason ?? null,
        consecutiveStableFrames: cadence.consecutiveStableFrames ?? null,
        visibilityState: cadence.visibilityState, documentHasFocus: cadence.documentHasFocus,
      },
      admissionWeaponIds: profile?.admissionWeaponIds ?? null,
      rehearsedWeaponIds: profile?.rehearsedWeaponIds ?? null,
      deferredWeaponIds: profile?.deferredWeaponIds ?? null,
      admissionDurationMs: profile?.durationMs ?? null,
      reachable: [player.primaryWeapon ?? null, player.secondaryWeapon ?? null, player.weapon ?? null]
        .filter((id) => typeof id === 'string'),
    };
  });
  if (Array.isArray(report.rehearsal.deferredWeaponIds)) {
    const deferred = new Set(report.rehearsal.deferredWeaponIds);
    report.reachableDeferred = report.rehearsal.reachable.filter((id) => deferred.has(id));
  } else {
    report.reachableDeferred = null;
  }

  // Each cycle: bracket the synchronous call, then watch rAF until the
  // authoritative player weapon actually changes. `syncMs` is what the key
  // press costs on the main thread; `commitMs`/`commitFrames` is when the
  // player's hands actually hold the other gun.
  const measured = await page.evaluate(async (count) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const cycles = [];
    // `snapshot()` is the only way to read the authoritative weapon and it is
    // NOT free - it serialises the whole debug surface. Measure it once so
    // `commitMs` can be read as "switch + one snapshot" rather than mistaken
    // for switch cost. `syncMs` is the number that answers the question.
    const snapshotStartedAt = performance.now();
    for (let i = 0; i < 5; i += 1) debug.snapshot();
    const snapshotCostMs = Number(((performance.now() - snapshotStartedAt) / 5).toFixed(3));
    for (let index = 0; index < count; index += 1) {
      const snapshot = debug.snapshot();
      const before = snapshot.player.weapon;
      if (!snapshot.player.alive) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      // Slot 0 is the primary/authority special and slot 1 the sidearm, so a
      // fixed index%2 alternation asks for the weapon already held on the very
      // first cycle and `switchWeapon` correctly no-ops. Derive the slot from
      // what is actually in the player's hands instead.
      const slot = before === snapshot.player.secondaryWeapon ? 0 : 1;
      const startedAt = performance.now();
      debug.switchWeapon(slot);
      const syncMs = performance.now() - startedAt;
      let frames = 0;
      let maxGapMs = 0;
      let last = performance.now();
      let after = debug.snapshot().player.weapon;
      // 40 frames is two thirds of a second at 60 Hz - far past anything a
      // player would call responsive, and short enough that a hung switch is
      // reported rather than hanging the probe.
      while (after === before && frames < 40) {
        await frame();
        const now = performance.now();
        maxGapMs = Math.max(maxGapMs, now - last);
        last = now;
        frames += 1;
        after = debug.snapshot().player.weapon;
      }
      cycles.push({
        slot, before, after,
        committed: after !== before,
        syncMs: Number(syncMs.toFixed(3)),
        commitFrames: frames,
        commitMs: Number((performance.now() - startedAt).toFixed(3)),
        maxGapMs: Number(maxGapMs.toFixed(2)),
      });
      // Past the 360 ms switch animation, so the next cycle is a fresh switch
      // and not a request the previous one is still holding.
      await new Promise((r) => setTimeout(r, 700));
    }
    return { cycles, snapshotCostMs };
  }, SWITCHES);

  report.cycles = measured.cycles;
  report.snapshotCostMs = measured.snapshotCostMs;
  const committed = report.cycles.filter((cycle) => cycle.committed);
  const median = (values) => (values.length === 0 ? null
    : [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)]);
  report.summary = {
    cycles: report.cycles.length,
    committedCycles: committed.length,
    maxSyncMs: report.cycles.length === 0 ? null : Math.max(...report.cycles.map((c) => c.syncMs)),
    medianSyncMs: median(report.cycles.map((c) => c.syncMs)),
    maxCommitFrames: committed.length === 0 ? null : Math.max(...committed.map((c) => c.commitFrames)),
    medianCommitMs: median(committed.map((c) => c.commitMs)),
    maxGapMs: report.cycles.length === 0 ? null : Math.max(...report.cycles.map((c) => c.maxGapMs)),
    snapshotCostMs: report.snapshotCostMs,
  };

  const problems = [];
  if (report.cycles.length === 0) problems.push('no switch cycle ran');
  if (committed.length !== report.cycles.length) {
    problems.push(`${report.cycles.length - committed.length} switch(es) never committed`);
  }
  if (report.summary.maxSyncMs !== null && report.summary.maxSyncMs > SYNC_BUDGET_MS) {
    problems.push(`synchronous switch cost ${report.summary.maxSyncMs} ms exceeds the ${SYNC_BUDGET_MS} ms budget`);
  }
  if (report.reachableDeferred !== null && report.reachableDeferred.length > 0) {
    problems.push(`switchWeapon can reach deferred weapons: ${report.reachableDeferred.join(',')}`);
  }
  report.problems = problems;
  report.pass = problems.length === 0;
} catch (error) {
  failure = error;
  report.pass = false;
  report.error = String(error).slice(0, 400);
} finally {
  await browser.close().catch(() => {});
  server.close();
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.error(`[weapon-switch] wrote ${OUT}`);
console.log(JSON.stringify({
  label: report.label, arena: report.arena, pass: report.pass,
  summary: report.summary ?? null, reachableDeferred: report.reachableDeferred ?? null,
  deferredWeaponIds: report.rehearsal?.deferredWeaponIds ?? null,
  cadence: report.rehearsal?.cadence ?? null,
  admissionWeaponIds: report.rehearsal?.admissionWeaponIds ?? null,
  problems: report.problems ?? null, error: report.error ?? null,
}, null, 2));
if (failure) throw failure;
process.exit(report.pass ? 0 : 1);
