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
  if (renderMode === 'host-full') {
    url.searchParams.set('render', label === 'host' ? 'quality' : 'performance');
  } else if (['performance', 'quality', 'compat'].includes(renderMode)) {
    url.searchParams.set('render', renderMode);
  }
  url.searchParams.set('multiplayerQa', '1');
  await page.goto(url.toString());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
}

await host.click('#host');
await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: 30_000 });
const roomCode = (await host.textContent('#room-code')).trim();
// The transport verifier chooses explicit opposing squads before deployment;
// untouched invite-default assignment is covered by browser/UI tests.
await guest.selectOption('#team', '1');
const teams = { host: 0, guest: Number(await guest.inputValue('#team')) };
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
const stanceReplicated = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.some((remote) => remote.stance === 'prone'));

const windowBreaksBefore = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows.filter((pane) => pane.broken).length);
await host.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.stageWindow(0, 5);
  api.equipWeapon('carbine');
  api.setAds(true);
});
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponPresentation.adsProgress >= 0.98, undefined, { timeout: 10_000 });
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
await host.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().breakableWindows.filter((pane) => pane.broken).length > before, windowBreaksBefore, { timeout: 10_000 });
await guest.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().breakableWindows.filter((pane) => pane.broken).length > before, windowBreaksBefore, { timeout: 10_000 });
const windowReplicated = (await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows.filter((pane) => pane.broken).length)) > windowBreaksBefore;

await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-25, 1.7, 6, 0, 0));
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-25, 1.7, 0, Math.PI, 0));
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers.some((remote) => Math.abs(remote.position[0] + 25) < 0.25 && Math.abs(remote.position[2]) < 0.25), undefined, { timeout: 10_000 });
const guestDeathsBefore = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.deaths);
await host.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.equipWeapon('sniper');
  api.setAds(true);
});
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponPresentation.adsProgress >= 0.98, undefined, { timeout: 10_000 });
await host.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.aimAtRemote('head');
  api.fireOnce();
});
await guest.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.deaths > before, guestDeathsBefore, { timeout: 10_000 });
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().deathDrops.length > 0, undefined, { timeout: 10_000 });
const remoteDeathDrop = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().deathDrops[0]);
await host.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y + 1.55, z), remoteDeathDrop.position);
await host.waitForFunction(() => document.querySelector('#pickup-prompt')?.classList.contains('hidden') === false, undefined, { timeout: 10_000 });
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop());
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.primaryWeapon === 'carbine', undefined, { timeout: 10_000 });
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers.some((remote) => remote.primary === 'carbine'), undefined, { timeout: 10_000 });
const pickupReplicated = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.some((remote) => remote.primary === 'carbine'));

const hostState = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
const guestState = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
const spawnSeparation = Math.hypot(
  hostState.player.position[0] - guestState.player.position[0],
  hostState.player.position[2] - guestState.player.position[2],
);
await host.screenshot({ path: 'test-results/release-multiplayer-host.png' });
await guest.screenshot({ path: 'test-results/release-multiplayer-guest.png' });
console.log(JSON.stringify({ baseUrl, renderMode, roomCodeLength: roomCode.length, errors, stanceReplicated, windowReplicated, pickupReplicated, spawnSeparation, teams, host: { mode: hostState.gameMode, remotes: hostState.remotes, team: hostState.player.team, primary: hostState.player.primaryWeapon }, guest: { mode: guestState.gameMode, remotes: guestState.remotes, stance: guestState.player.stance, team: guestState.player.team, deaths: guestState.player.deaths } }, null, 2));
if (errors.length || !stanceReplicated || !windowReplicated || !pickupReplicated || spawnSeparation < 5 || hostState.gameMode !== 'host' || guestState.gameMode !== 'client' || hostState.remotes < 1 || guestState.remotes < 1 || teams.host === teams.guest) process.exitCode = 1;
await browser.close();
