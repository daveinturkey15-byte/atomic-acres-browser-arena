import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const peerPort = Number(process.env.QA_PEER_PORT ?? 0);
const forceArenaSyncGate = ['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname);
const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});
const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
const host = await context.newPage();
const guest = await context.newPage();
const errors = [];

try {
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`${label}: ${message.text()}`);
    });
    const url = new URL(baseUrl);
    url.searchParams.set('render', 'compat');
    url.searchParams.set('multiplayerQa', '1');
    url.searchParams.set('arenaSwitchQaDelayMs', '800');
    url.searchParams.set('seed', `rustworks-sync-${label}`);
    if (peerPort) url.searchParams.set('peerQaPort', String(peerPort));
    await page.goto(url.toString());
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
    await page.waitForFunction(() => [...document.querySelectorAll('.map-card[data-arena-id]')].some((button) => !button.disabled), undefined, { timeout: 60_000 });
    await page.fill('#player-name', label === 'host' ? 'Rust Host' : 'Atomic Guest');
  }

  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('rustworks-1v1'));
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.id === 'rustworks-1v1');
  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim(), undefined, { timeout: 45_000 });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');

  await Promise.all([host, guest].map((page) => page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members.length === 2, undefined, { timeout: 45_000 })));
  let arenaSyncGate = null;
  if (forceArenaSyncGate) {
    await guest.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state.privateMatch?.arenaId === 'rustworks-1v1' && state.arenaSelection.id === 'atomic-acres';
    }, undefined, { timeout: 15_000 });
    arenaSyncGate = await guest.evaluate(() => ({
      readyDisabled: document.querySelector('#lobby-ready')?.disabled === true,
      guidance: document.querySelector('#lobby-guidance')?.textContent?.trim(),
      mapCardsLocked: [...document.querySelectorAll('.map-card[data-arena-id]')].every((button) => button.disabled),
    }));
    if (!arenaSyncGate.readyDisabled || !arenaSyncGate.mapCardsLocked || !arenaSyncGate.guidance?.startsWith('Synchronizing Rustworks')) {
      throw new Error(`Arena synchronization gate missing: ${JSON.stringify(arenaSyncGate)}`);
    }
  }
  try {
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state.privateMatch.arenaId === 'rustworks-1v1'
      && state.arenaSelection.id === 'rustworks-1v1'
      && state.arenaSelection.activeRoots.length === 1
      && state.arenaSelection.activeRoots[0] === 'rustworks-1v1'
      && state.arenaSelection.navigationCollidersMatchArena === true;
    }, undefined, { timeout: 60_000 })));
  } catch (error) {
    console.error(JSON.stringify(await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { privateMatch: state.privateMatch, arenaSelection: state.arenaSelection, status: document.querySelector('#network-status')?.textContent };
    }))), null, 2));
    throw error;
  }
  const postSyncControls = await Promise.all([host, guest].map((page) => page.evaluate(() => ({
    readyDisabled: document.querySelector('#lobby-ready')?.disabled === true,
    mapCardsLocked: [...document.querySelectorAll('.map-card[data-arena-id]')].every((button) => button.disabled),
  }))));
  if (postSyncControls.some((controls) => controls.readyDisabled || !controls.mapCardsLocked)) {
    throw new Error(`Post-sync lobby controls invalid: ${JSON.stringify(postSyncControls)}`);
  }

  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 30_000 });
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.matchPhase === 'active' && state.arenaSelection.id === 'rustworks-1v1' && state.remotes === 1;
  }, undefined, { timeout: 60_000 })));
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.every((member) => member.pingMs !== null), undefined, { timeout: 15_000 });

  const states = await Promise.all([host, guest].map((page) => page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      arenaId: state.arenaSelection.id,
      lobbyArenaId: state.privateMatch.arenaId,
      activeRoots: state.arenaSelection.activeRoots,
      colliders: state.arenaSelection.colliders,
      physicsColliders: state.arenaSelection.physicsColliders,
      bounds: state.arenaSelection.bounds,
      networkRows: document.querySelectorAll('#network-strip span').length,
      domArenaId: document.documentElement.dataset.arenaId,
    };
  })));
  const report = { errors, roomCodeLength: roomCode.length, arenaSyncGate, postSyncControls, states };
  console.log(JSON.stringify(report, null, 2));
  const canonical = JSON.stringify(states[0]);
  if (errors.length > 0 || roomCode.length !== 36 || states.some((state) => state.arenaId !== 'rustworks-1v1'
    || state.lobbyArenaId !== 'rustworks-1v1' || state.domArenaId !== 'rustworks-1v1'
    || state.activeRoots.length !== 1 || state.activeRoots[0] !== 'rustworks-1v1'
    || state.networkRows !== 2 || JSON.stringify(state) !== canonical)) process.exitCode = 1;
} finally {
  await browser.close();
}
