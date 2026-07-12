import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const renderMode = process.env.QA_RENDER_MODE ?? 'compat';
const browser = await chromium.launch({ headless: true });
const host = await browser.newPage({ viewport: { width: 960, height: 540 } });
const guest = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
for (const [label, page] of [['host', host], ['guest', guest]]) {
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  const url = new URL(baseUrl);
  if (renderMode === 'compat' || (renderMode === 'host-full' && label === 'guest')) url.searchParams.set('render', 'compat');
  url.searchParams.set('multiplayerQa', '1');
  await page.goto(url.toString());
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
await guest.waitForTimeout(500);
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.stance === 'prone', undefined, { timeout: 5_000 });
await host.waitForFunction(
  () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers?.some((remote) => remote.stance === 'prone'),
  undefined,
  { timeout: 10_000 },
);

const hostState = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
const guestState = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
const stanceReplicated = hostState.remotePlayers.some((remote) => remote.stance === 'prone');
const spawnSeparation = Math.hypot(
  hostState.player.position[0] - guestState.player.position[0],
  hostState.player.position[2] - guestState.player.position[2],
);
await host.screenshot({ path: 'test-results/release-multiplayer-host.png' });
await guest.screenshot({ path: 'test-results/release-multiplayer-guest.png' });
console.log(JSON.stringify({ baseUrl, renderMode, roomCodeLength: roomCode.length, errors, stanceReplicated, spawnSeparation, host: { mode: hostState.gameMode, remotes: hostState.remotes }, guest: { mode: guestState.gameMode, remotes: guestState.remotes, stance: guestState.player.stance } }, null, 2));
if (errors.length || !stanceReplicated || spawnSeparation < 5 || hostState.gameMode !== 'host' || guestState.gameMode !== 'client' || hostState.remotes < 1 || guestState.remotes < 1) process.exitCode = 1;
await browser.close();
