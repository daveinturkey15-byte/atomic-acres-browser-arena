import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const renderMode = process.env.QA_RENDER_MODE ?? 'compat';
const connectionTimeoutMs = ['blender', 'host-blender', 'guest-blender'].includes(renderMode) ? 45_000 : 30_000;
const interactionTimeoutMs = ['blender', 'host-blender', 'guest-blender'].includes(renderMode) ? 20_000 : 10_000;
const peerQaPort = Number(process.env.QA_PEER_PORT ?? 0);
const browser = await chromium.launch({ headless: true });
const host = await browser.newPage({ viewport: { width: 960, height: 540 } });
const guest = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
const phase = (name) => console.error(`[multiplayer-qa] ${name}`);

async function movePlayerSmoothly(page, target, steps = 10) {
  const start = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const position = start.map((value, index) => value + (target[index] - value) * progress);
    await page.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z), position);
    await page.waitForTimeout(120);
  }
}
for (const [label, page] of [['host', host], ['guest', guest]]) {
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  const url = new URL(baseUrl);
  if (renderMode === 'host-full') {
    url.searchParams.set('render', label === 'host' ? 'quality' : 'performance');
  } else if (renderMode === 'host-blender') {
    url.searchParams.set('render', label === 'host' ? 'blender' : 'performance');
  } else if (renderMode === 'guest-blender') {
    url.searchParams.set('render', label === 'guest' ? 'blender' : 'performance');
  } else if (['performance', 'quality', 'blender', 'compat'].includes(renderMode)) {
    url.searchParams.set('render', renderMode);
  }
  url.searchParams.set('multiplayerQa', '1');
  if (Number.isInteger(peerQaPort) && peerQaPort >= 1_024 && peerQaPort <= 65_535) url.searchParams.set('peerQaPort', String(peerQaPort));
  await page.goto(url.toString());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: connectionTimeoutMs });
}
phase('both pages ready');

await host.click('#host');
await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: connectionTimeoutMs });
const roomCode = (await host.textContent('#room-code')).trim();
phase('room created');
// The transport verifier chooses explicit opposing squads before deployment;
// untouched invite-default assignment is covered by browser/UI tests.
await guest.selectOption('#team', '1');
const teams = { host: 0, guest: Number(await guest.inputValue('#team')) };
await guest.fill('#room-input', roomCode);
await guest.click('#join');
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: connectionTimeoutMs });
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes >= 1, undefined, { timeout: connectionTimeoutMs });
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes >= 1, undefined, { timeout: connectionTimeoutMs });
phase('peer join complete');
await guest.waitForTimeout(500);
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.stance === 'prone', undefined, { timeout: 5_000 });
await host.waitForFunction(
  () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers?.some((remote) => remote.stance === 'prone'),
  undefined,
  { timeout: 10_000 },
);
const stanceReplicated = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.some((remote) => remote.stance === 'prone'));
phase('stance replicated');

const windowBreaksBefore = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows.filter((pane) => pane.broken).length);
phase('staging window');
await host.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.stageWindow(0, 5);
  api.equipWeapon('carbine');
  api.setAds(true);
});
phase('window staged');
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponPresentation.adsProgress >= 0.98, undefined, { timeout: interactionTimeoutMs });
phase('ADS ready');
const stagedWindowPosition = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
await guest.waitForFunction(([x, z]) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
  .some((remote) => Math.abs(remote.position[0] - x) < 0.5 && Math.abs(remote.position[2] - z) < 0.5), [stagedWindowPosition[0], stagedWindowPosition[2]], { timeout: 10_000 });
phase('staged position replicated');
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
await host.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().breakableWindows.filter((pane) => pane.broken).length > before, windowBreaksBefore, { timeout: 10_000 });
phase('host window broken');
await guest.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().breakableWindows.filter((pane) => pane.broken).length > before, windowBreaksBefore, { timeout: 10_000 });
const windowReplicated = (await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows.filter((pane) => pane.broken).length)) > windowBreaksBefore;
phase('window replicated');

await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-25, 1.7, 6, 0, 0));
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-25, 1.7, 0, Math.PI, 0));
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers.some((remote) => Math.abs(remote.position[0] + 25) < 0.25 && Math.abs(remote.position[2]) < 0.25), undefined, { timeout: 10_000 });
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
  .some((remote) => Math.abs(remote.position[0] + 25) < 0.25 && Math.abs(remote.position[2] - 6) < 0.25), undefined, { timeout: 10_000 });
const guestDeathsBefore = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.deaths);
await host.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.equipWeapon('sniper');
  api.setAds(true);
});
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponPresentation.adsProgress >= 0.98, undefined, { timeout: interactionTimeoutMs });
await host.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.aimAtRemote('head');
  api.fireOnce();
});
await guest.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.deaths > before, guestDeathsBefore, { timeout: 10_000 });
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().deathDrops.length > 0, undefined, { timeout: 10_000 });
const remoteDeathDrop = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().deathDrops[0]);
phase('remote death and drop replicated');
await movePlayerSmoothly(host, [remoteDeathDrop.position[0], remoteDeathDrop.position[1] + 1.55, remoteDeathDrop.position[2] + 4]);
await guest.waitForFunction(([x, z]) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
  .some((remote) => Math.abs(remote.position[0] - x) < 0.5 && Math.abs(remote.position[2] - (z + 4)) < 0.5), [remoteDeathDrop.position[0], remoteDeathDrop.position[2]], { timeout: 10_000 });
await movePlayerSmoothly(host, [remoteDeathDrop.position[0], remoteDeathDrop.position[1] + 1.55, remoteDeathDrop.position[2] + 2.2]);
await guest.waitForFunction(([x, z]) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
  .some((remote) => Math.abs(remote.position[0] - x) < 0.5 && Math.abs(remote.position[2] - (z + 2.2)) < 0.5), [remoteDeathDrop.position[0], remoteDeathDrop.position[2]], { timeout: 10_000 });
await host.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const state = api.snapshot();
  api.setAmmo('sniper', state.player.ammo, 0);
  api.setGrenades(1);
});
await movePlayerSmoothly(host, [remoteDeathDrop.position[0], remoteDeathDrop.position[1] + 1.55, remoteDeathDrop.position[2]], 12);
await host.waitForFunction(() => {
  const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
  return state?.player.primaryWeapon === 'sniper' && state.player.reserve > 0 && state.player.grenades === 2;
}, undefined, { timeout: interactionTimeoutMs });
await guest.waitForFunction((dropId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().deathDrops
  .some((drop) => drop.id === dropId && drop.ammoAvailable === false && drop.weaponAvailable === true), remoteDeathDrop.id, { timeout: interactionTimeoutMs });
const scavengeReplicated = await guest.evaluate((dropId) => window.__ATOMIC_ACRES_DEBUG__.snapshot().deathDrops
  .some((drop) => drop.id === dropId && drop.ammoAvailable === false && drop.weaponAvailable === true), remoteDeathDrop.id);
phase('scavenge replicated');
await host.waitForFunction(() => document.querySelector('#pickup-prompt')?.classList.contains('hidden') === false, undefined, { timeout: interactionTimeoutMs });
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop());
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.primaryWeapon === 'carbine', undefined, { timeout: interactionTimeoutMs });
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers.some((remote) => remote.primary === 'carbine'), undefined, { timeout: interactionTimeoutMs });
const pickupReplicated = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.some((remote) => remote.primary === 'carbine'));
phase('pickup replicated');

const hostState = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
const guestState = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
const spawnSeparation = Math.hypot(
  hostState.player.position[0] - guestState.player.position[0],
  hostState.player.position[2] - guestState.player.position[2],
);
await host.screenshot({ path: 'test-results/release-multiplayer-host.png' });
await guest.screenshot({ path: 'test-results/release-multiplayer-guest.png' });
console.log(JSON.stringify({ baseUrl, renderMode, roomCodeLength: roomCode.length, errors, stanceReplicated, windowReplicated, scavengeReplicated, pickupReplicated, spawnSeparation, teams, host: { mode: hostState.gameMode, remotes: hostState.remotes, team: hostState.player.team, primary: hostState.player.primaryWeapon }, guest: { mode: guestState.gameMode, remotes: guestState.remotes, stance: guestState.player.stance, team: guestState.player.team, deaths: guestState.player.deaths } }, null, 2));
if (errors.length || !stanceReplicated || !windowReplicated || !scavengeReplicated || !pickupReplicated || spawnSeparation < 5 || hostState.gameMode !== 'host' || guestState.gameMode !== 'client' || hostState.remotes < 1 || guestState.remotes < 1 || teams.host === teams.guest) process.exitCode = 1;
await browser.close();
