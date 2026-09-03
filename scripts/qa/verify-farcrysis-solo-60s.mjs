// Lane R (PASS 87, HF-423) — the "60 s solo run, zero errors" falsifier item.
//
// WHY A SEPARATE INSTRUMENT. The HF-423 ledger row's falsifier is
// `selectable: true` + boot smoke + admission + tripwire 0 + spawn-quality gate
// + eye-clearance measured + **60 s solo run zero errors**. Nothing this lane
// ran answered that last clause: verify-player-path-cdp.mjs proves a player can
// REACH an active match and then closes the browser within a second or two, and
// measure-farcrysis-frame-time.mjs holds for 20 s but drives the match through
// the debug backdoor. An arena that admits and then throws at t+30 s would pass
// both. So this holds a real match, entered through the real menu, for 60 s and
// reports every page error and console error in that window.
//
// SCOPE. farcrysis only, on purpose - this is a lane instrument answering a
// lane falsifier, not a new shared gate with a roster to keep in sync. It takes
// --arena so it can be pointed at a control (atomic-acres) for comparison, and
// it says which arena it measured in its own receipt.
//
// WHAT COUNTS AS AN ERROR. `pageerror` (an uncaught exception) and console
// entries of type `error`, verbatim, with no filtering: a filter list here
// would be exactly the kind of quiet allowance this repo keeps finding. If a
// benign one shows up, it goes in the receipt and gets argued about in the
// report, not suppressed in the instrument.
//
// It also samples rAF cadence across the hold, because "no errors" and "still
// rendering" are different claims and a wedged raf loop throws nothing.
//
// Headless only (machine rule: never a visible window).
//
// Usage:
//   node scripts/qa/run-with-preview-server.mjs \
//     node scripts/qa/verify-farcrysis-solo-60s.mjs --url http://127.0.0.1:4180 \
//       [--arena farcrysis] [--seconds 60] [--out docs/evidence/.../solo-60s.json]

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180');
const ARENA = arg('--arena', 'farcrysis');
const SECONDS = Number(arg('--seconds', '60'));
const CALLSIGN = arg('--callsign', 'qa-player');
const ADMIT_MS = Number(arg('--admit-timeout', '240000'));
const OUT = arg('--out', null);

/** rAF deltas over the hold, sampled in-page. Returned in buckets, not raw. */
const HOLD = (seconds) => new Promise((done) => {
  const deltas = [];
  let previous = performance.now();
  const endAt = previous + seconds * 1000;
  const tick = () => {
    const now = performance.now();
    deltas.push(now - previous);
    previous = now;
    if (now < endAt) requestAnimationFrame(tick);
    else done(deltas);
  };
  requestAnimationFrame(tick);
});

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    // An occluded/throttled tab reads exactly like a wedged arena, which would
    // make this instrument report a false wedge. Same flags the player-path
    // harness uses, same reason.
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});

const pageErrors = [];
const consoleErrors = [];
const record = {
  contract: 'farcrysis-solo-60s-v1',
  measuredAt: new Date().toISOString(),
  arena: ARENA,
  url: BASE,
  seconds: SECONDS,
  path: 'real menu: callsign field, .map-card, #solo - no debug API is used to enter the match',
  ok: false,
  stoppedAt: null,
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 400)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400));
  });

  const startedAt = Date.now();
  record.stoppedAt = 'waiting for menu';
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#solo', { timeout: 120_000 });

  record.stoppedAt = 'callsign field';
  const callsign = page.locator('#player-name');
  if (await callsign.count() !== 1) throw new Error('no #player-name callsign input on the menu');
  await callsign.fill(CALLSIGN);

  record.stoppedAt = `arena card [data-arena-id="${ARENA}"]`;
  const card = page.locator(`.map-card[data-arena-id="${ARENA}"]`);
  if (await card.count() !== 1) throw new Error(`no .map-card for ${ARENA} - is it selectable?`);
  await card.click();

  record.stoppedAt = 'clicking #solo';
  await page.locator('#solo').click();

  record.stoppedAt = 'waiting for matchPhase active';
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (!debug) return false;
    const snapshot = debug.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: ADMIT_MS });
  record.admittedMs = Date.now() - startedAt;

  // Errors are counted from the moment the match is playable, and separately
  // from the ones raised while loading: the falsifier asks about the RUN.
  record.pageErrorsBeforeHold = pageErrors.length;
  record.consoleErrorsBeforeHold = consoleErrors.length;
  const beforePage = pageErrors.length;
  const beforeConsole = consoleErrors.length;

  record.stoppedAt = `holding the match for ${SECONDS} s`;
  const deltas = (await page.evaluate(HOLD, SECONDS)).slice(1);
  const sorted = [...deltas].sort((a, b) => a - b);
  const at = (q) => Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(2));
  record.hold = {
    frames: deltas.length,
    meanFps: Number((1000 / (deltas.reduce((s, v) => s + v, 0) / deltas.length)).toFixed(1)),
    p50FrameMs: at(0.5),
    p95FrameMs: at(0.95),
    p99FrameMs: at(0.99),
    worstFrameMs: Number(sorted[sorted.length - 1].toFixed(2)),
    // A wedge is the failure this is really looking for: rAF stops, or a single
    // multi-second gap opens.
    gapsOver1000ms: deltas.filter((value) => value > 1000).length,
    longFramesOver33ms: deltas.filter((value) => value > 33.4).length,
  };

  // The match must still be the same live match at the end of the hold, not a
  // rolled-back one that silently returned to the menu.
  record.snapshotAfterHold = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { matchPhase: snapshot.matchPhase, gameStarted: snapshot.gameStarted, arena: snapshot.arenaId ?? null };
  });

  record.pageErrorsDuringHold = pageErrors.slice(beforePage);
  record.consoleErrorsDuringHold = consoleErrors.slice(beforeConsole);
  record.stillActive = record.snapshotAfterHold.matchPhase === 'active'
    && record.snapshotAfterHold.gameStarted === true;
  record.ok = record.stillActive
    && record.pageErrorsDuringHold.length === 0
    && record.consoleErrorsDuringHold.length === 0
    && record.hold.gapsOver1000ms === 0
    && record.hold.frames > SECONDS * 5;
  record.stoppedAt = record.ok ? null : record.stoppedAt;
} catch (error) {
  record.error = String(error).slice(0, 400);
} finally {
  await browser.close();
}

record.pageErrorsAll = pageErrors.slice(0, 10);
record.consoleErrorsAll = consoleErrors.slice(0, 10);

if (OUT) {
  const path = resolve(process.cwd(), OUT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 1)}\n`);
}
console.log(JSON.stringify(record, null, 1));
process.exit(record.ok ? 0 : 1);
