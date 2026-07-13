import { chromium } from '@playwright/test';

const base = process.env.ATOMIC_BASE ?? 'http://127.0.0.1:4180/';
const target = new URL('/?render=compat&multiplayerQa=1', base).toString();
const browser = await chromium.launch({ headless: true });
try {
  const host = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const guest = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
    await page.goto(target);
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
  }

  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: 30_000 });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: 30_000 });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes >= 1, undefined, { timeout: 30_000 });
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes >= 1, undefined, { timeout: 30_000 });

  await guest.keyboard.down('KeyW');
  await guest.waitForTimeout(450);
  await guest.keyboard.up('KeyW');
  await host.waitForTimeout(120);

  const hostState = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const guestState = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const remote = hostState.remotePlayers[0];
  await host.screenshot({ path: 'test-results/release-multiplayer-host.png' });
  await guest.screenshot({ path: 'test-results/release-multiplayer-guest.png' });
  const result = {
    roomCodeLength: roomCode.length,
    errors,
    host: { mode: hostState.gameMode, remotes: hostState.remotes },
    guest: { mode: guestState.gameMode, remotes: guestState.remotes },
    networkSync: hostState.networkSync,
    remote: remote ? { snapshotAgeMs: remote.snapshotAgeMs, interpolationError: remote.interpolationError } : null,
  };
  console.log(JSON.stringify(result, null, 2));
  if (
    errors.length
    || hostState.gameMode !== 'host'
    || guestState.gameMode !== 'client'
    || hostState.remotes < 1
    || guestState.remotes < 1
    || hostState.networkSync.stateIntervalMs !== 33
    || hostState.networkSync.interpolationRate !== 24
    || !remote
    || remote.snapshotAgeMs > 250
    || remote.interpolationError > 2
  ) process.exitCode = 1;
} finally {
  await browser.close();
}
