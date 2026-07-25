import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const peerPort = Number(process.env.QA_PEER_PORT ?? 0);
const cycles = Number(process.env.QA_MULTIPLAYER_CYCLES ?? 20);
const chromiumArgs = [
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns',
];
const headed = process.env.QA_HEADED === '1';
const browser = await chromium.launch({ headless: !headed, args: chromiumArgs });
const results = [];
const errors = [];
async function keepPageAnimating(context, page) {
  if (headed) return;
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ sessionId }) => cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 1, everyNthFrame: 5 });
}
try {
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    console.error(`[multiplayer-lifecycle] cycle ${cycle}/${cycles}`);
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const host = await context.newPage();
    const guest = await context.newPage();
    await Promise.all([keepPageAnimating(context, host), keepPageAnimating(context, guest)]);
    for (const [label, page] of [['host', host], ['guest', guest]]) {
      await page.bringToFront();
      page.on('pageerror', (error) => errors.push(`cycle ${cycle} ${label}: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`cycle ${cycle} ${label}: ${message.text()}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`cycle ${cycle} ${label}: HTTP ${response.status()} ${response.url()}`);
      });
      const url = new URL(baseUrl);
      url.searchParams.set('render', 'compatibility');
      url.searchParams.set('seed', `pass25a-mp-${cycle}-${label}`);
      url.searchParams.set('multiplayerQa', '1');
      if (peerPort) url.searchParams.set('peerQaPort', String(peerPort));
      await page.goto(url.toString());
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
      await page.waitForFunction(
        () => [...document.querySelectorAll('.map-card[data-arena-id]')].some((button) => !button.disabled),
        undefined,
        { timeout: 60_000 },
      );
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
      await page.fill('#player-name', `${label} ${cycle}`);
    }
    await host.bringToFront();
    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: 45_000 });
    const roomCode = (await host.textContent('#room-code')).trim();
    await guest.bringToFront();
    await guest.selectOption('#team', '1');
    await guest.fill('#room-input', roomCode);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.bringToFront();
    await host.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: 30_000 });
    await guest.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: 30_000 });
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 30_000 });
    await host.click('#lobby-start');
    await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout: 30_000 });
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout: 30_000 });
    const joined = {
      cycle,
      roomCodeLength: roomCode.length,
      hostMode: await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameMode),
      guestMode: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameMode),
      hostRemotes: await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotes),
      guestRemotes: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotes),
      hostNetwork: await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle),
      guestNetwork: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle),
    };

    // A complete second host+guest match is the regression gate. Both start
    // clocks must clear together when the host returns the ended match to the
    // lobby, otherwise peers reject the mixed waiting snapshot and cannot ready.
    // These pages intentionally share one browser context, hence one localStorage.
    // Capture each peer's retained summary immediately after its own completion,
    // before the second page overwrites the same test-origin key.
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.endMatch());
    await host.waitForFunction(() => document.querySelector('#rematch') !== null, undefined, { timeout: 15_000 });
    const hostRetainedDiagnostic = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().lastCompletedMultiplayerDiagnostic);
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.endMatch());
    await guest.waitForFunction(() => document.querySelector('#rematch') !== null, undefined, { timeout: 15_000 });
    const guestRetainedDiagnostic = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().lastCompletedMultiplayerDiagnostic);
    const automaticDiagnostics = await Promise.all([host, guest].map((page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchDiagnosticsUpload)));
    const retainedDiagnostics = [hostRetainedDiagnostic, guestRetainedDiagnostic];
    joined.diagnosticEvidence = retainedDiagnostics.map((diagnostic) => diagnostic ? {
      schemaVersion: diagnostic.schemaVersion,
      role: diagnostic.role,
      arena: diagnostic.arena,
      recentDamageCount: diagnostic.recentDamage?.length ?? null,
    } : null);
    joined.sanitizedDiagnosticRetained = retainedDiagnostics.every((diagnostic, index) => {
      const serialized = JSON.stringify(diagnostic);
      return diagnostic?.schemaVersion === 1
        && diagnostic.role === (index === 0 ? 'host' : 'guest')
        && diagnostic.arena === 'atomic-acres'
        && Array.isArray(diagnostic.recentDamage)
        && diagnostic.recentDamage.length <= 64
        && !serialized.includes(`host ${cycle}`)
        && !serialized.includes(`guest ${cycle}`)
        && !serialized.includes(roomCode);
    });
    joined.automaticDiagnosticEvidence = automaticDiagnostics.map((diagnostic) => ({
      activeMatch: diagnostic.activeMatch,
      lastEnvelopeBytes: diagnostic.lastEnvelopeBytes,
      lastMatchIdPattern: /^p-[a-f0-9]{16}$/.test(diagnostic.lastMatchId ?? ''),
      requestsDuringActiveMatch: diagnostic.requestsDuringActiveMatch,
    }));
    joined.automaticDiagnosticsCompleted = automaticDiagnostics.every((diagnostic) => diagnostic.activeMatch === false
      && diagnostic.lastEnvelopeBytes > 0 && diagnostic.lastEnvelopeBytes <= 48 * 1024
      && /^p-[a-f0-9]{16}$/.test(diagnostic.lastMatchId ?? '')
      && diagnostic.requestsDuringActiveMatch === 0);
    await host.click('#rematch');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === false && state.privateMatch?.phase === 'waiting';
    }, undefined, { timeout: 30_000 })));
    const resetStates = await Promise.all([host, guest].map((page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch)));
    joined.rematchResetStates = resetStates.map((state) => ({
      phase: state.phase,
      activeAtHostTimeMs: state.activeAtHostTimeMs,
      activeAtEpochMs: state.activeAtEpochMs,
      readiness: state.members.map((member) => member.ready),
    }));
    joined.rematchReset = resetStates.every((state) => state.activeAtHostTimeMs === null && state.activeAtEpochMs === null
      && state.members.every((member) => member.ready === false));
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 30_000 });
    joined.secondReady = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.every((member) => member.ready));
    await host.click('#lobby-start');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.matchPhase === 'active' && state.remotes === 1;
    }, undefined, { timeout: 45_000 })));
    joined.secondMatchStarted = true;

    const stagedRailgun = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stageRailgunSpawn(0));
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().railgun.status === 'available', undefined, { timeout: 15_000 });
    await guest.evaluate((pickup) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(...pickup), stagedRailgun.pickupPosition);
    if (!await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stageRemoteAtRailgunPickup())) throw new Error('could not stage authoritative remote at railgun pickup');
    joined.railgunGuestClaimed = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactRailgun());
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.railgun.status === 'held' && state.railgun.roundsRemaining === 8;
    }, undefined, { timeout: 15_000 })));
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().railgun.localHolder === true, undefined, { timeout: 15_000 });
    await guest.waitForTimeout(500);
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().railgun.thermalVisible === true, undefined, { timeout: 5_000 });
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().railgun.roundsRemaining === 7, undefined, { timeout: 15_000 })));
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
    joined.railgunImmediateRepeatBlocked = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().railgun.roundsRemaining === 7);
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(false));
    await guest.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot().railgun;
      return state.adsResetRequired === false && state.chamberReadyAtHostTimeMs === 0;
    }, undefined, { timeout: 5_000 });
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().railgun.thermalVisible === true, undefined, { timeout: 5_000 });
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().railgun.roundsRemaining === 6, undefined, { timeout: 15_000 })));
    joined.railgunReplicatedTwoShots = true;

    const beforeRedeploy = await Promise.all([host, guest].map((page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot())));
    await guest.evaluate(() => {
      if (document.pointerLockElement) void document.exitPointerLock();
      document.querySelector('#menu')?.classList.remove('hidden');
    });
    await guest.click('[data-menu-tab="kit"]');
    await guest.click('[data-kit-id="runner"]');
    await guest.click('[data-menu-tab="deploy"]');
    await guest.waitForFunction(() => {
      const button = document.querySelector('#field-kit-redeploy');
      return button && button.hidden === false && button.disabled === false;
    }, undefined, { timeout: 15_000 });
    await guest.click('#field-kit-redeploy');
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.primaryWeapon === 'smg', undefined, { timeout: 15_000 });
    await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0]?.primary === 'smg', undefined, { timeout: 15_000 });
    const afterRedeploy = await Promise.all([host, guest].map((page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot())));
    joined.guestRedeployNoCombatEffects = afterRedeploy[1].player.deaths === beforeRedeploy[1].player.deaths
      && afterRedeploy[1].player.kills === beforeRedeploy[1].player.kills
      && afterRedeploy[0].corpses.active === beforeRedeploy[0].corpses.active
      && afterRedeploy[1].corpses.active === beforeRedeploy[1].corpses.active
      && afterRedeploy[0].deathDrops.length === beforeRedeploy[0].deathDrops.length
      && afterRedeploy[1].deathDrops.length === beforeRedeploy[1].deathDrops.length
      && afterRedeploy[0].fieldSupport.streak === beforeRedeploy[0].fieldSupport.streak
      && afterRedeploy[1].fieldSupport.streak === beforeRedeploy[1].fieldSupport.streak
      && JSON.stringify(afterRedeploy[0].privateMatch.scores) === JSON.stringify(beforeRedeploy[0].privateMatch.scores);
    joined.railgunDroppedOnRedeploy = afterRedeploy[0].railgun.status === 'available'
      && afterRedeploy[0].railgun.roundsRemaining === 6
      && afterRedeploy[1].railgun.status === 'available'
      && afterRedeploy[1].railgun.roundsRemaining === 6;

    await guest.close({ runBeforeUnload: true });
    await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 0, undefined, { timeout: 30_000 });
    await host.waitForFunction(() => document.querySelector('#lobby-roster')?.textContent?.includes('REJOINING'), undefined, { timeout: 30_000 });
    joined.leaveObserved = true;
    joined.rejoinGraceObserved = true;
    results.push(joined);
    await context.close();
  }
  const report = { schema: 'atomic-acres/pass38-multiplayer-lifecycle@1', cycles, errors, results };
  await mkdir('artifacts/pass38', { recursive: true });
  await writeFile('artifacts/pass38/multiplayer-lifecycle.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || results.length !== cycles || results.some((result) => result.hostMode !== 'host' || result.guestMode !== 'client'
    || !result.rematchReset || !result.secondReady || !result.secondMatchStarted || !result.guestRedeployNoCombatEffects
    || !result.sanitizedDiagnosticRetained || !result.automaticDiagnosticsCompleted || !result.railgunGuestClaimed || !result.railgunImmediateRepeatBlocked
    || !result.railgunReplicatedTwoShots || !result.railgunDroppedOnRedeploy
    || !result.leaveObserved || !result.rejoinGraceObserved
    || result.hostNetwork.stateChannels < 1 || result.guestNetwork.stateChannels < 1
    || result.hostNetwork.stateChannelReliable !== false || result.hostNetwork.stateChannelOrdered !== false
    || result.hostNetwork.stateChannelMaxRetransmits !== 0 || result.guestNetwork.stateChannelMaxRetransmits !== 0)) process.exitCode = 1;
} finally {
  await browser.close();
}
