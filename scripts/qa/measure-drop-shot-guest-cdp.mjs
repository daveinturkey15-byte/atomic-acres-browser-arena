// HF-412 (Lane Y) — the GUEST's view of a drop shot, in a real two-client match.
//
// The ledger's falsifier for HF-412 ends: "and a guest in the two-client
// harness sees the host's body play a prone transition rather than snap". A
// source reading is not that, and neither is a single-client rig measurement
// driven through a QA presentation override. This is that.
//
// WHAT IT DOES
//   Two REAL headless Chromes over a local PeerJS signalling server, joined
//   through the real menu (#host -> room code -> #room-input -> #join ->
//   #lobby-arena -> #lobby-ready -> #lobby-start), exactly as Lane F's
//   scripts/qa/mp-lab/run-host-guest.mjs does it - this script IMPORTS that
//   harness's helpers rather than editing a file it does not own. Once both
//   sides are in the match it drives the HOST's real stance machine to prone
//   and samples, on the GUEST, the rig that guest is posing for that remote
//   peer: `debug.sampleBodyStancePose('remote')`, one cheap read per animation
//   frame (five fields; no snapshot() bone walk, which sampled at ~65 ms and
//   made an earlier body receipt unusable).
//
// WHAT IT PROVES OR DISPROVES
//   - the stance replicates at all (the guest's rig learns 'prone'),
//   - the guest's body BLENDS rather than snapping: the largest single-frame
//     step is a fraction of the pose, not the whole of it,
//   - the blend crosses 5% -> 95% inside the shared fixed window
//     (DROP_SHOT_TIMING.standToProneMs) plus scheduling slack, and the rise
//     back tells the same story.
//
// Headless only. This is the two-client case the lane brief allows two browsers
// for; each launch waits for >= 3 GB free VRAM through the imported
// launchBrowser, and both are closed in the finally block.
//
// USAGE
//   npm run build
//   node scripts/qa/measure-drop-shot-guest-cdp.mjs --map test2 \
//     --port 41952 --peer-port 9352 \
//     --out docs/evidence/pass85/hf412/guest-body-test2.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { serveDist, startPeerServer, launchBrowser, openPlayer, snapshotOf } from './mp-lab/run-host-guest.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
// --port / --peer-port / --renderer / --render are read by the imported module
// from this process's argv, so they are passed the same way here.
const PORT = Number(arg('--port', '41946'));
const ARENA = arg('--map', 'test2');
const OUT = arg('--out', 'artifacts/qa/drop-shot/guest-body.json');
const HOLD_MS = Number(arg('--hold-ms', '900'));
const TIMEOUT_MS = 180_000;

// The window is read out of the module that owns it rather than restated here,
// so a tuning change cannot leave this harness asserting a stale number. (A
// plain text read, not a TS import: this is a .mjs script.)
const TRANSITION_SOURCE = readFileSync(new URL('../../src/prone-transition.ts', import.meta.url), 'utf8');
const numberFrom = (name) => {
  const match = new RegExp(`${name}:\\s*([0-9_]+)`).exec(TRANSITION_SOURCE);
  if (!match) throw new Error(`could not read ${name} from src/prone-transition.ts`);
  return Number(match[1].replace(/_/g, ''));
};
const STAND_TO_PRONE_MS = numberFrom('standToProneMs');
const PRONE_TO_STAND_MS = numberFrom('proneToStandMs');

const server = await serveDist(PORT);
const peer = await startPeerServer(Number(arg('--peer-port', '9345')));
let hostBrowser = null;
let guestBrowser = null;
let record = null;
try {
  hostBrowser = await launchBrowser('host');
  guestBrowser = await launchBrowser('guest');
  const [host, guest] = await Promise.all([
    openPlayer(hostBrowser, 'host', ARENA, 'HOST'),
    openPlayer(guestBrowser, 'guest', ARENA, 'GUEST'),
  ]);
  console.log(`[guest-body] booted host=${host.backend} guest=${guest.backend}`);

  await host.page.click('#host');
  await host.page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: TIMEOUT_MS });
  const roomCode = (await host.page.textContent('#room-code')).trim();
  await guest.page.fill('#room-input', roomCode);
  await guest.page.waitForFunction(() => document.querySelector('#join')?.disabled === false, undefined, { timeout: TIMEOUT_MS });
  await guest.page.click('#join');
  await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members?.filter((member) => member.connected).length === 2,
    undefined,
    { timeout: TIMEOUT_MS },
  )));
  console.log('[guest-body] joined');

  await host.page.selectOption('#lobby-arena', ARENA);
  await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
    (arenaId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.arenaId === arenaId,
    ARENA,
    { timeout: TIMEOUT_MS },
  )));
  await guest.page.click('#lobby-ready');
  await host.page.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: TIMEOUT_MS });
  await host.page.click('#lobby-start');
  await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
    (arenaId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return snapshot?.gameStarted === true && snapshot.matchPhase === 'active'
        && snapshot.arenaSelection?.id === arenaId && snapshot.remotes === 1;
    },
    ARENA,
    { timeout: TIMEOUT_MS },
  )));
  console.log('[guest-body] deployed, both sides active with one remote each');
  await guest.page.waitForTimeout(1_500);

  // The guest samples its rendered picture of the host's body; the host is
  // driven through its REAL stance machine (setStanceForQa -> requestStance).
  const sampling = guest.page.evaluate(async (totalMs) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const samples = [];
    const start = performance.now();
    for (;;) {
      const elapsed = performance.now() - start;
      if (elapsed > totalMs) break;
      const body = debug.sampleBodyStancePose('remote');
      samples.push({
        t: Math.round(elapsed * 100) / 100,
        found: body.found,
        stance: body.stance,
        blendFrom: body.blendFrom,
        blendProgress: body.blendProgress,
        proneBlend: body.proneBlend,
        crouchBlend: body.crouchBlend,
        pivotHeight: body.pivotHeight,
      });
      await frame();
    }
    return samples;
  }, HOLD_MS + 2_200);

  await host.page.waitForTimeout(600);
  const hostDropStance = await host.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStanceForQa('prone'));
  await host.page.waitForTimeout(HOLD_MS);
  const hostRiseStance = await host.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStanceForQa('stand'));
  const samples = await sampling;
  const guestState = await snapshotOf(guest.page);

  const found = samples.filter((sample) => sample.found);
  const firstProne = found.findIndex((sample) => sample.stance === 'prone');
  const dropWindow = firstProne >= 0 ? found.slice(firstProne) : [];
  const riseIndex = dropWindow.findIndex((sample) => sample.stance !== 'prone');
  const dropOnly = riseIndex > 0 ? dropWindow.slice(0, riseIndex) : dropWindow;
  const riseOnly = riseIndex > 0 ? dropWindow.slice(riseIndex) : [];

  const crossing = (list, fraction, rising) => {
    if (list.length === 0) return null;
    const hit = list.find((sample) => (rising
      ? (sample.proneBlend ?? 0) >= fraction
      : (sample.proneBlend ?? 1) <= fraction));
    return hit ? Math.round((hit.t - list[0].t) * 100) / 100 : null;
  };
  const biggestStep = (list) => {
    let biggest = 0;
    let frameMs = 0;
    for (let index = 1; index < list.length; index += 1) {
      const step = Math.abs((list[index].proneBlend ?? 0) - (list[index - 1].proneBlend ?? 0));
      if (step > biggest) { biggest = step; frameMs = list[index].t - list[index - 1].t; }
    }
    return { biggest: Math.round(biggest * 1_000) / 1_000, frameMs: Math.round(frameMs * 100) / 100 };
  };
  const medianFrameMs = (list) => {
    const gaps = [];
    for (let index = 1; index < list.length; index += 1) gaps.push(list[index].t - list[index - 1].t);
    gaps.sort((a, b) => a - b);
    return gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] * 100) / 100 : null;
  };

  const dropStep = biggestStep(dropOnly);
  const riseStep = biggestStep(riseOnly);
  const dropFive = crossing(dropOnly, 0.05, true);
  const dropNinetyFive = crossing(dropOnly, 0.95, true);
  const failures = [];
  if (found.length === 0) failures.push('the guest never had a remote rig to sample');
  if (firstProne < 0) failures.push("the guest's rig never learned the host's prone stance (replication)");
  if (dropOnly.length < 6) failures.push('too few guest frames inside the drop to judge it');
  if (dropStep.biggest > 0.5) failures.push(`the guest's body SNAPPED: one frame moved ${dropStep.biggest} of the pose`);
  if (dropNinetyFive === null) failures.push('the guest body never reached 95% prone');
  if (dropNinetyFive !== null && dropNinetyFive > STAND_TO_PRONE_MS + 200) {
    failures.push(`the guest body took ${dropNinetyFive} ms to reach 95%, past the ${STAND_TO_PRONE_MS} ms window plus slack`);
  }

  record = {
    contract: 'hf412-guest-body-two-client-v1',
    capturedAt: new Date().toISOString(),
    arena: ARENA,
    standToProneMs: STAND_TO_PRONE_MS,
    proneToStandMs: PRONE_TO_STAND_MS,
    hostDropStance,
    hostRiseStance,
    guestRemotes: guestState?.remotes ?? null,
    guestMatchPhase: guestState?.matchPhase ?? null,
    sampleCount: samples.length,
    guestMedianFrameMs: medianFrameMs(found),
    guestSawProneAtSampleIndex: firstProne,
    drop: {
      frames: dropOnly.length,
      blendAtFirstProneFrame: dropOnly[0]?.proneBlend ?? null,
      fivePercentMs: dropFive,
      ninetyFivePercentMs: dropNinetyFive,
      biggestSingleFrameStep: dropStep.biggest,
      biggestStepFrameMs: dropStep.frameMs,
      finalBlend: dropOnly[dropOnly.length - 1]?.proneBlend ?? null,
      snapped: dropStep.biggest > 0.5,
    },
    rise: {
      frames: riseOnly.length,
      biggestSingleFrameStep: riseStep.biggest,
      biggestStepFrameMs: riseStep.frameMs,
      ninetyFivePercentDownMs: crossing(riseOnly, 0.95, false),
      fivePercentDownMs: crossing(riseOnly, 0.05, false),
      finalBlend: riseOnly[riseOnly.length - 1]?.proneBlend ?? null,
      snapped: riseStep.biggest > 0.5,
    },
    failures,
    pass: failures.length === 0,
    samples,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[guest-body] ${JSON.stringify({ ...record, samples: undefined }, null, 2)}`);
  console.log(`[guest-body] wrote ${OUT}`);
} finally {
  await guestBrowser?.close().catch(() => {});
  await hostBrowser?.close().catch(() => {});
  await new Promise((closed) => { server.closeAllConnections?.(); server.close(() => closed()); });
  if (peer.exitCode === null) peer.kill();
}
process.exitCode = record?.pass ? 0 : 1;
