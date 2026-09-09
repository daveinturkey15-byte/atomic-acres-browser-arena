import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4182/';
const peerPort = Number(process.env.QA_PEER_PORT ?? 9001);
const browser = await chromium.launch({
  headless: true,
  args: ['--mute-audio', 
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});
const errors = [];

async function openPlayer(name, context = null) {
  const page = context
    ? await context.newPage()
    : await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${name} console: ${message.text()}`);
  });
  const url = new URL(baseUrl);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgl2');
  url.searchParams.set('render', 'performance');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(peerPort));
  await page.goto(url.toString());
  try {
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
  } catch (error) {
    console.error(`${name} startup diagnostics`, JSON.stringify({
      url: page.url(),
      title: await page.title(),
      body: (await page.locator('body').innerText()).slice(0, 2_000),
      debugPresent: await page.evaluate(() => Boolean(window.__ATOMIC_ACRES_DEBUG__)),
      errors,
    }, null, 2));
    throw error;
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await page.fill('#player-name', name);
  return page;
}

try {
  const host = await openPlayer('Recovery Host');
  const guestContext = await browser.newContext({ viewport: { width: 640, height: 360 } });
  let guest = await openPlayer('Recovery Guest', guestContext);
  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim(), undefined, { timeout: 30_000 });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2, undefined, { timeout: 30_000 });
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2, undefined, { timeout: 30_000 });
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 30_000 });
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 30_000 })));

  const guestId = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.find((member) => member.name === 'Recovery Guest')?.id);
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.stance === 'prone', undefined, { timeout: 10_000 });
  try {
    await host.waitForFunction((id) => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.some((remote) => remote.id === id && remote.stance === 'prone'), guestId, { timeout: 15_000 });
  } catch (error) {
    console.error('prone replication diagnostics', JSON.stringify(await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { player: state.player, remotes: state.remotePlayers, network: state.networkLifecycle };
    }))), null, 2));
    throw error;
  }

  const degraded = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.degradeStateChannel());
  if (!degraded) throw new Error('Could not close the transient movement channel');
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle.stateFallbackActive === true, undefined, { timeout: 10_000 });
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('stand'));
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.stance === 'stand', undefined, { timeout: 10_000 });
  try {
    await host.waitForFunction((id) => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.some((remote) => remote.id === id && remote.stance === 'stand'), guestId, { timeout: 10_000 });
  } catch (error) {
    console.error('fallback diagnostics', JSON.stringify(await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { player: state.player, remotes: state.remotePlayers, network: state.networkLifecycle };
    }))), null, 2));
    throw error;
  }

  const durableIdentityWritten = await guest.evaluate((code) => localStorage.getItem(`atomic-acres:room-identity:${code}`) !== null, roomCode);
  await guest.evaluate((code) => localStorage.removeItem(`atomic-acres:room-identity:${code}`), roomCode);
  await guest.close({ runBeforeUnload: true });
  await host.waitForFunction((id) => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.some((member) => member.id === id && !member.connected), guestId, { timeout: 30_000 });
  guest = await openPlayer('Recovery Guest', guestContext);
  const reopenedTabHasFreshSession = await guest.evaluate((code) => sessionStorage.getItem(`atomic-acres:room-identity:${code}`) === null, roomCode);
  const closeLifecyclePersistedIdentity = await guest.evaluate((code) => localStorage.getItem(`atomic-acres:room-identity:${code}`) !== null, roomCode);
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await guest.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active' && state.remotes === 1;
  }, undefined, { timeout: 30_000 });
  const rejoinedId = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.find((member) => member.name === 'Recovery Guest')?.id);
  const result = {
    errors,
    proneReplicated: true,
    reliableFallback: true,
    durableIdentityWritten,
    reopenedTabHasFreshSession,
    closeLifecyclePersistedIdentity,
    identityPreserved: rejoinedId === guestId,
    rejoinedActiveMatch: true,
    guestNetwork: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle),
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length || !result.durableIdentityWritten || !result.reopenedTabHasFreshSession
    || !result.closeLifecyclePersistedIdentity || !result.identityPreserved) process.exitCode = 1;
} finally {
  await browser.close();
}
