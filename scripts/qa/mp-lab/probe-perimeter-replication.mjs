#!/usr/bin/env node
// MP-LAB: directed proof for the perimeter replication drop.
//
// Finding (2026-09-02, host+guest sweep, atomic-acres): the host walked to the
// +X wall, its state carried x = 36.595 (bounds.maxX 37, physics capsule
// radius 0.38) and the guest dropped it five times as 'outside-arena-bounds'
// because state admission demanded a 0.44 m margin. To the guest the host
// stood frozen at the wall. This probe reproduces that deterministically:
// host + guest through the real lobby, then the host is turned to face the
// nearest perimeter wall (aimAtRemoteWithOffset gives yaw control without
// pointer lock), walks into it and holds there. The guest's admission-drop
// telemetry is the verdict: any 'outside-arena-bounds' drop fails.
//
//   node scripts/qa/mp-lab/probe-perimeter-replication.mjs [--map atomic-acres] [--hold-seconds 12] [--wall +x|-x|+z|-z]
//
// --wall pins the face to walk into. Without it the probe takes the nearest
// wall, which depends on where the spawn put the host: the 2026-09-02
// before/after pair landed on +x and -x respectively, so the "same measurement
// twice" it claimed to be was two different poses. Pin the wall when you are
// comparing two runs.
//
// Exit 0 = zero drops on both sides; 1 = drops observed (the bug); 2 = harness fault.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist, startPeerServer, launchBrowser, openPlayer, snapshotOf } from './run-host-guest.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback; };
const MAP = arg('--map', 'atomic-acres');
const HOLD_SECONDS = Number(arg('--hold-seconds', '12'));
const WALL = arg('--wall', null);
if (WALL !== null && !['+x', '-x', '+z', '-z'].includes(WALL)) throw new Error(`--wall must be one of +x -x +z -z; got ${WALL}`);
const PORT = Number(arg('--port', '41946'));
const PEER_PORT = Number(arg('--peer-port', '9345'));
const OUT = resolve(REPO_ROOT, 'artifacts/qa/mp-lab/perimeter');
const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms));

const server = await serveDist(PORT);
const peer = await startPeerServer(PEER_PORT);
let hostBrowser = null;
let guestBrowser = null;
let exitCode = 2;
try {
  hostBrowser = await launchBrowser('host');
  guestBrowser = await launchBrowser('guest');
  const [host, guest] = await Promise.all([openPlayer(hostBrowser, 'host', MAP, 'HOST'), openPlayer(guestBrowser, 'guest', MAP, 'GUEST')]);
  await host.page.click('#host');
  await host.page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: 45_000 });
  const roomCode = (await host.page.textContent('#room-code')).trim();
  await guest.page.fill('#room-input', roomCode);
  await guest.page.waitForFunction(() => document.querySelector('#join')?.disabled === false, undefined, { timeout: 45_000 });
  await guest.page.click('#join');
  await Promise.all([host, guest].map(({ page }) => page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members?.filter((member) => member.connected).length === 2, undefined, { timeout: 45_000 })));
  await host.page.selectOption('#lobby-arena', MAP);
  await Promise.all([host, guest].map(({ page }) => page.waitForFunction((arenaId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.arenaSelection?.id === arenaId && document.querySelector('#lobby-ready')?.disabled === false;
  }, MAP, { timeout: 160_000 })));
  await guest.page.click('#lobby-ready');
  await host.page.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 45_000 });
  await host.page.click('#lobby-start');
  await Promise.all([host, guest].map(({ page }) => page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.gameStarted === true && snapshot.matchPhase === 'active' && snapshot.remotes === 1;
  }, undefined, { timeout: 180_000 })));
  console.log(`[perimeter ${MAP}] deployed`);

  // Turn the host toward the nearest perimeter wall and walk into it.
  const walk = await host.page.evaluate(async ({ holdMs, pinnedWall }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = api.snapshot();
    const bounds = snapshot.arenaSelection.bounds;
    const me = api.samplePlayerPose();
    const remote = snapshot.remotesDetail?.[0]?.position ?? null;
    // yaw convention (aimAtRemote): yaw = atan2(-dx, -dz) for a look vector (dx, dz).
    const candidates = [
      { name: '+x', dx: 1, dz: 0, gap: bounds.maxX - me.position[0] },
      { name: '-x', dx: -1, dz: 0, gap: me.position[0] - bounds.minX },
      { name: '+z', dx: 0, dz: 1, gap: bounds.maxZ - me.position[2] },
      { name: '-z', dx: 0, dz: -1, gap: me.position[2] - bounds.minZ },
    ].sort((a, b) => a.gap - b.gap);
    const wall = pinnedWall ? candidates.find((entry) => entry.name === pinnedWall) : candidates[0];
    if (!wall) throw new Error(`no wall candidate named ${pinnedWall}`);
    const wantYaw = Math.atan2(-wall.dx, -wall.dz);
    // aimAtRemoteWithOffset(yawOffset) sets yaw = yawToRemote + offset.
    api.aimAtRemote('body');
    const yawToRemote = api.samplePlayerPose().yaw;
    let offset = wantYaw - yawToRemote;
    while (offset > Math.PI) offset -= Math.PI * 2;
    while (offset < -Math.PI) offset += Math.PI * 2;
    api.aimAtRemoteWithOffset(offset, 0);
    const yawAfter = api.samplePlayerPose().yaw;
    api.setMovement(true, true);
    const trail = [];
    const startedAt = performance.now();
    while (performance.now() - startedAt < holdMs) {
      await new Promise((settle) => setTimeout(settle, 500));
      const pose = api.samplePlayerPose();
      trail.push([Math.round(performance.now() - startedAt), Number(pose.position[0].toFixed(3)), Number(pose.position[2].toFixed(3))]);
    }
    api.setMovement(false, false);
    const end = api.samplePlayerPose();
    return { bounds, wall: wall.name, wallGapAtStart: wall.gap, wantYaw, yawToRemote, yawAfter, start: me.position, end: end.position, trail, remote };
  }, { holdMs: HOLD_SECONDS * 1000, pinnedWall: WALL });
  await sleep(1500);
  const [hostState, guestState] = await Promise.all([snapshotOf(host.page), snapshotOf(guest.page)]);
  const guestRemoteView = await guest.page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { remotes: snapshot.remotes, drops: snapshot.stateAdmissionDrops };
  });
  const gapToWall = {
    '+x': walk.bounds.maxX - walk.end[0],
    '-x': walk.end[0] - walk.bounds.minX,
    '+z': walk.bounds.maxZ - walk.end[2],
    '-z': walk.end[2] - walk.bounds.minZ,
  };
  const nearestGap = Math.min(...Object.values(gapToWall));
  // MP-LAB: the precondition asks whether the host reached THE WALL IT WALKED
  // AT, not whether it happens to be near some wall. In nearest-wall mode those
  // are the same number; with --wall pinned they are not, and using the minimum
  // would let a run pass the precondition without ever testing the pinned face.
  const distanceToWall = gapToWall[walk.wall];
  // MP-LAB: the probe only proves anything if the host actually entered the
  // band the fix opened. The pre-fix admission margin was 0.44 m; a run that
  // ends further from the wall than that never exercised the drop and must NOT
  // report PASS. Observed 2026-09-02: test2 stopped 0.805 m short (geometry in
  // the way) and reported zero drops - a green that tested nothing.
  const OLD_BOUNDS_MARGIN_M = 0.44;
  const reachedRejectBand = distanceToWall < OLD_BOUNDS_MARGIN_M;
  const noDrops = (guestRemoteView.drops?.total ?? 1) === 0 && (hostState?.stateAdmissionDrops?.total ?? 1) === 0;
  const result = {
    contract: 'mp-lab-perimeter-replication-v3',
    measuredAt: new Date().toISOString(),
    arenaId: MAP,
    holdSeconds: HOLD_SECONDS,
    wall: walk.wall,
    wallSelection: WALL ? 'pinned' : 'nearest-at-spawn',
    hostStart: walk.start,
    hostEnd: walk.end,
    hostDistanceToWall: Number(distanceToWall.toFixed(3)),
    hostDistanceToNearestWall: Number(nearestGap.toFixed(3)),
    gapToWall: Object.fromEntries(Object.entries(gapToWall).map(([name, gap]) => [name, Number(gap.toFixed(3))])),
    yaw: { want: walk.wantYaw, toRemote: walk.yawToRemote, after: walk.yawAfter },
    trail: walk.trail,
    guestDrops: guestRemoteView.drops,
    hostDrops: hostState?.stateAdmissionDrops ?? null,
    oldBoundsMarginM: OLD_BOUNDS_MARGIN_M,
    reachedRejectBand,
    inconclusive: reachedRejectBand ? null : `host stopped ${distanceToWall.toFixed(3)} m from the ${walk.wall} wall, outside the ${OLD_BOUNDS_MARGIN_M} m band this probe exists to exercise`,
    noDrops,
    pass: reachedRejectBand && noDrops,
  };
  mkdirSync(OUT, { recursive: true });
  const outName = WALL ? `${MAP}-wall-${WALL === '+x' ? 'plus-x' : WALL === '-x' ? 'minus-x' : WALL === '+z' ? 'plus-z' : 'minus-z'}.json` : `${MAP}.json`;
  writeFileSync(join(OUT, outName), JSON.stringify(result, null, 2));
  console.log(`[perimeter ${MAP}] wall ${walk.wall} (${result.wallSelection}) host end x=${walk.end[0].toFixed(3)} z=${walk.end[2].toFixed(3)} (wall gap ${distanceToWall.toFixed(3)} m) guest drops ${JSON.stringify(guestRemoteView.drops)} host drops ${JSON.stringify(hostState?.stateAdmissionDrops)}`);
  if (result.inconclusive) console.log(`[perimeter ${MAP}] INCONCLUSIVE - ${result.inconclusive}`);
  console.log(`[perimeter ${MAP}] ${result.pass ? 'PASS' : 'FAIL'} - ${join(OUT, outName)}`);
  exitCode = result.pass ? 0 : 1;
  await guest.context.close().catch(() => {});
  await host.context.close().catch(() => {});
} catch (error) {
  console.error('[perimeter] fault', error);
  exitCode = 2;
} finally {
  await guestBrowser?.close().catch(() => {});
  await hostBrowser?.close().catch(() => {});
  await new Promise((closed) => { server.closeAllConnections?.(); server.close(() => closed()); });
  if (peer.exitCode === null) peer.kill();
}
process.exitCode = exitCode;
