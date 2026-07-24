import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const peerPort = Number(process.env.QA_PEER_PORT ?? 9011);
const peerProcess = spawn(process.execPath, [resolve('node_modules/peer/dist/bin/peerjs.js'), '--port', String(peerPort), '--path', '/peerjs'], {
  cwd: process.cwd(), stdio: 'ignore', windowsHide: true,
});
for (let attempt = 0; attempt < 100; attempt += 1) {
  const ready = await new Promise((done) => {
    const request = http.get(`http://127.0.0.1:${peerPort}/peerjs`, (response) => {
      response.resume();
      done(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.once('error', () => done(false));
    request.setTimeout(250, () => { request.destroy(); done(false); });
  });
  if (ready) break;
  if (peerProcess.exitCode !== null) throw new Error(`Local PeerJS server exited with ${peerProcess.exitCode}`);
  await new Promise((done) => setTimeout(done, 100));
}
const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});
const errors = [];

async function openPlayer(name) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`${name}: ${message.text()}`);
  });
  const url = new URL(baseUrl);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', 'compatibility');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(peerPort));
  url.searchParams.set('eventDelayQaMs', '10');
  url.searchParams.set('eventJitterQaMs', '6');
  await page.goto(url.toString());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await page.fill('#player-name', name);
  return page;
}

try {
  const host = await openPlayer('Netcode Host');
  const guest = await openPlayer('Netcode Guest');
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('gun-range'));
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.id === 'gun-range', undefined, { timeout: 30_000 });
  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim(), undefined, { timeout: 30_000 });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await Promise.all([host, guest].map((page) => page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2,
    undefined,
    { timeout: 30_000 },
  )));
  await guest.selectOption('[data-lobby-dhv]', '2');
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.some(
    (member) => member.name === 'Netcode Guest' && member.dhv === 2,
  ), undefined, { timeout: 10_000 });
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 30_000 });
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((page) => page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active',
    undefined,
    { timeout: 30_000 },
  )));

  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, -3, Math.PI, 0));
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, 3, 0, 0));
  await Promise.all([
    host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.some(
      (remote) => Math.abs(remote.position[2] - 3) < 0.5,
    ), undefined, { timeout: 15_000 }),
    guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.some(
      (remote) => Math.abs(remote.position[2] + 3) < 0.5,
    ), undefined, { timeout: 15_000 }),
  ]);
  // The netcode invariant is unrelated to spawn protection; wait until both
  // combatants are damageable so an admission cannot be misclassified as a miss.
  await guest.waitForTimeout(2_000);

  for (let shot = 0; shot < 7; shot += 1) {
    if (shot === 2 || shot === 4) {
      const stance = shot === 2 ? 'crouch' : 'prone';
      await host.evaluate((nextStance) => window.__ATOMIC_ACRES_DEBUG__.setStance(nextStance), stance);
      await guest.waitForFunction((nextStance) => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.some(
        (remote) => remote.stance === nextStance,
      ), stance, { timeout: 10_000 });
      await guest.waitForTimeout(250);
    }
    await guest.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.aimAtRemote('body');
      window.__ATOMIC_ACRES_DEBUG__.fireOnce();
    });
    await guest.waitForTimeout(160);
  }
  try {
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().networkSync.shotProtocol['result-hit-presented'] === 7, undefined, { timeout: 15_000 });
    await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().networkSync.shotProtocol['accepted-hit'] === 7, undefined, { timeout: 15_000 });
  } catch (error) {
    console.error('authoritative netcode diagnostics', JSON.stringify(await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { player: state.player, remotes: state.remotePlayers, sync: state.networkSync, network: state.networkLifecycle };
    }))), null, 2));
    throw error;
  }

  const hostState = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const guestState = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const hostAccepted = hostState.networkSync.shotProtocol['accepted-hit'] ?? 0;
  const guestCreated = guestState.networkSync.shotProtocol['created-sent'] ?? 0;
  const guestConfirmed = guestState.networkSync.shotProtocol['result-hit-presented'] ?? 0;
  const resolvedTimeline = hostState.networkSync.shotTimeline.resolved;
  const resolutionTraces = hostState.networkSync.shotTimeline.recentResolutions;
  const authoredTimeline = guestState.networkSync.shotTimeline.authored;
  const interpolationDelay = guestState.networkSync.interpolationDelay;
  const hostTiming = hostState.networkSync.shotTimeline.timing;
  const guestTiming = guestState.networkSync.shotTimeline.timing;
  const resolverMatchesReportedRewind = resolvedTimeline !== null && resolutionTraces.length === 7
    && Math.abs(resolvedTimeline.fireTimeMs - resolvedTimeline.targetViewTimeMs
      - resolvedTimeline.appliedRewindMs) < 0.001
    && resolvedTimeline.resolvedAtHostTimeMs >= resolvedTimeline.receivedHostTimeMs
    && resolvedTimeline.appliedRewindMs >= 0
    && resolvedTimeline.appliedRewindMs <= hostState.networkSync.shotTimeline.rewindCeilingMs
    && resolutionTraces.every((trace) => Math.abs(trace.fireTimeMs - trace.targetViewTimeMs
      - trace.appliedRewindMs) < 0.001
      && trace.resolvedAtHostTimeMs >= trace.receivedHostTimeMs
      && trace.appliedRewindMs >= 0
      && trace.appliedRewindMs <= hostState.networkSync.shotTimeline.rewindCeilingMs);
  const delayBands = { 20: [80, 120], 30: [60, 90], 40: [40, 70] };
  const [delayMinimum, delayMaximum] = delayBands[interpolationDelay.sourceSnapshotRateHz];
  const delayFitsRewindBudget = interpolationDelay.delayMs >= delayMinimum && interpolationDelay.delayMs <= delayMaximum
    && interpolationDelay.targetMs >= delayMinimum && interpolationDelay.targetMs <= delayMaximum
    && interpolationDelay.delayMs + interpolationDelay.targetViewRewindHeadroomMs
      === guestState.networkSync.shotTimeline.rewindCeilingMs
    && authoredTimeline !== null
    && Math.abs(authoredTimeline.fireTimeMs - authoredTimeline.targetViewTimeMs - authoredTimeline.targetViewDelayMs) < 0.001;
  const rewindHistogramCount = Object.values(hostTiming.appliedRewindHistogram)
    .reduce((total, count) => total + count, 0);
  const transportTimingCaptured = hostTiming.authoredSpacing.count === 6
    && hostTiming.packetReceiptSpacing.count === 6
    && hostTiming.resolutionSpacing.count === 6
    && guestTiming.resultDeliverySpacing.count === 6
    && rewindHistogramCount === 7
    && hostTiming.appliedRewindHistogram.rejected === 0
    && hostState.networkLifecycle.eventChannelOrdered === true;
  const result = {
    errors,
    impairment: guestState.networkLifecycle,
    hostAccepted,
    guestCreated,
    guestConfirmed,
    hostHealthAfter: hostState.player.hp,
    exactAgreement: hostAccepted === 7 && guestCreated === 7 && guestConfirmed === 7,
    resolverMatchesReportedRewind,
    resolutionTraces,
    authoredTimeline,
    interpolationDelay,
    delayFitsRewindBudget,
    hostTiming,
    guestTiming,
    transportTimingCaptured,
    movementRateHz: guestState.networkSync.selectedRateHz,
    hostTime: guestState.networkSync.hostTime,
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0 || !result.exactAgreement || !resolverMatchesReportedRewind
    || !authoredTimeline || !delayFitsRewindBudget || !transportTimingCaptured
    || result.hostHealthAfter >= 100) process.exitCode = 1;
} finally {
  await browser.close();
  peerProcess.kill();
}
