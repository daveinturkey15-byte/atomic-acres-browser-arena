import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const renderMode = process.env.QA_RENDER_MODE ?? 'compat';
const blenderRenderModes = ['blender', 'host-full', 'host-blender', 'guest-blender'];
const connectionTimeoutMs = blenderRenderModes.includes(renderMode) ? 45_000 : 30_000;
const interactionTimeoutMs = process.env.QA_HEADED === '1' ? 30_000 : blenderRenderModes.includes(renderMode) ? 45_000 : renderMode === 'performance' ? 20_000 : 10_000;
const peerQaPort = Number(process.env.QA_PEER_PORT ?? 0);
const chromiumArgs = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--allow-loopback-in-peer-connection',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
];
const headed = process.env.QA_HEADED === '1';
const browser = await chromium.launch({ headless: !headed, args: chromiumArgs });
const host = await browser.newPage({ viewport: { width: 960, height: 540 } });
const guest = await browser.newPage({ viewport: { width: 960, height: 540 } });
await host.addInitScript(() => {
  localStorage.setItem('atomic-acres:high-scores:v2', JSON.stringify({
    version: 4,
    entries: [{ id: 'score:legacy-ace:qa', name: 'Legacy Ace', kills: 14, deaths: 4, bestStreak: 9, won: true, recordedAt: Date.UTC(2026, 6, 17, 12) }],
  }));
});
for (const page of [host, guest]) {
  if (headed) continue;
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ sessionId }) => cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 1, everyNthFrame: 5 });
}
const errors = [];
const phase = (name) => console.error(`[multiplayer-qa] ${name}`);

async function movePlayerSmoothly(page, target, steps = 48) {
  const start = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const position = start.map((value, index) => value + (target[index] - value) * progress);
    await page.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z), position);
    await page.waitForTimeout(120);
  }
}
for (const [label, page] of [['host', host], ['guest', guest]]) {
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`${label}: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${label}: HTTP ${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  const url = new URL(baseUrl);
  if (renderMode === 'host-full') {
    url.searchParams.set('render', label === 'host' ? 'blender' : 'performance');
  } else if (renderMode === 'host-blender') {
    url.searchParams.set('render', label === 'host' ? 'blender' : 'performance');
  } else if (renderMode === 'guest-blender') {
    url.searchParams.set('render', label === 'guest' ? 'blender' : 'performance');
  } else if (['performance', 'blender', 'compat'].includes(renderMode)) {
    url.searchParams.set('render', renderMode);
  }
  url.searchParams.set('multiplayerQa', '1');
  if (Number.isInteger(peerQaPort) && peerQaPort >= 1_024 && peerQaPort <= 65_535) url.searchParams.set('peerQaPort', String(peerQaPort));
  await page.goto(url.toString());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: connectionTimeoutMs });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await page.fill('#player-name', label === 'host' ? 'Host QA' : 'Guest QA');
}
phase('both pages ready');

await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: connectionTimeoutMs });
const roomCode = (await host.textContent('#room-code')).trim();
phase('room created');
// The transport verifier chooses explicit opposing squads before deployment;
// untouched invite-default assignment is covered by browser/UI tests.
await guest.selectOption('#team', '1');
const teams = { host: 0, guest: Number(await guest.inputValue('#team')) };
await guest.fill('#room-input', roomCode);
await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await host.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: connectionTimeoutMs });
await guest.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: connectionTimeoutMs });
phase('waiting room joined');
const initialHostedBotCount = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.hostedBotCount);
await host.selectOption('#lobby-bots', '2');
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.hostedBotCount === 2, undefined, { timeout: interactionTimeoutMs });
const hostedBotControl = {
  initial: initialHostedBotCount,
  hostValue: Number(await host.inputValue('#lobby-bots')),
  guestValue: Number(await guest.inputValue('#lobby-bots')),
  guestDisabled: await guest.locator('#lobby-bots').isDisabled(),
};
await host.click('#lobby-ready');
await guest.click('#lobby-ready');
await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: connectionTimeoutMs });
const lobbyReady = await host.evaluate(() => document.querySelectorAll('#lobby-roster .lobby-player em').length === 2
  && [...document.querySelectorAll('#lobby-roster .lobby-player em')].every((element) => element.textContent === 'READY'));
await host.click('#lobby-start');
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: connectionTimeoutMs });
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: connectionTimeoutMs });
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes >= 1, undefined, { timeout: connectionTimeoutMs });
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes >= 1, undefined, { timeout: connectionTimeoutMs });
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: connectionTimeoutMs });
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: connectionTimeoutMs });
phase('ready gate and synchronized match start complete');
try {
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.privateMatch?.hostedBotCount === 2 && state.bots.length === 2
      && new Set(state.bots.map((bot) => bot.id)).size === 2;
  }, undefined, { timeout: interactionTimeoutMs })));
} catch (error) {
  const botReplicationState = {
    host: await host.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return { hostedBotCount: state?.privateMatch?.hostedBotCount, bots: state?.bots };
    }),
    guest: await guest.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return { hostedBotCount: state?.privateMatch?.hostedBotCount, bots: state?.bots };
    }),
  };
  console.error(`[multiplayer-qa] hosted bot replication timeout ${JSON.stringify({ ...botReplicationState, errors })}`);
  throw error;
}
const hostedBotsReplicated = true;
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
phase('two hosted bots replicated from host authority');
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.throwGrenade());
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePresentation?.grenades >= 1, undefined, { timeout: interactionTimeoutMs });
const remoteGrenadePresentation = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePresentation.grenades >= 1);
for (let index = 0; index < 5; index += 1) {
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.damageFromRemote(999, 'gun'));
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.alive === false, undefined, { timeout: interactionTimeoutMs });
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.respawn());
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.alive === true, undefined, { timeout: interactionTimeoutMs });
}
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().fieldSupport.available.yardhawk === true, undefined, { timeout: interactionTimeoutMs });
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateSupport('yardhawk'));
try {
  await host.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePresentation;
    return presentation?.supportEffects >= 1 && presentation.supportRoots >= 1 && presentation.presentationOnly === true;
  }, undefined, { timeout: interactionTimeoutMs });
} catch (error) {
  const supportReplicationState = {
    host: await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePresentation),
    guest: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePresentation),
    errors,
  };
  console.error(`[multiplayer-qa] support replication timeout ${JSON.stringify(supportReplicationState)}`);
  throw error;
}
const remoteSupportPresentation = await host.evaluate(() => {
  const presentation = window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePresentation;
  return presentation.supportEffects >= 1 && presentation.supportRoots >= 1 && presentation.presentationOnly === true;
});
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().fieldSupport.yardhawk.active === false, undefined, { timeout: interactionTimeoutMs });
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.alive === true, undefined, { timeout: interactionTimeoutMs });
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
phase('remote grenade and support presentation replicated cosmetically');
try {
  await guest.waitForFunction(() => document.querySelector('#high-score-list')?.textContent?.includes('Legacy Ace'), undefined, { timeout: interactionTimeoutMs });
} catch (error) {
  const leaderboardState = {
    host: await host.evaluate(() => ({ text: document.querySelector('#high-score-list')?.textContent, snapshot: window.__ATOMIC_ACRES_DEBUG__?.snapshot().leaderboard })),
    guest: await guest.evaluate(() => ({ text: document.querySelector('#high-score-list')?.textContent, snapshot: window.__ATOMIC_ACRES_DEBUG__?.snapshot().leaderboard })),
    errors,
  };
  console.error(`[multiplayer-qa] leaderboard replication timeout ${JSON.stringify(leaderboardState)}`);
  throw error;
}
const leaderboardReplicated = await guest.evaluate(() => document.querySelector('#high-score-list')?.textContent?.includes('14 KILLS') === true);
phase('persistent leaderboard replicated');
await guest.waitForTimeout(500);
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.stance === 'prone', undefined, { timeout: interactionTimeoutMs });
await host.waitForFunction(
  () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers?.some((remote) => remote.stance === 'prone'),
  undefined,
  { timeout: interactionTimeoutMs },
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
  .some((remote) => Math.abs(remote.position[0] - x) < 0.5 && Math.abs(remote.position[2] - z) < 0.5), [stagedWindowPosition[0], stagedWindowPosition[2]], { timeout: interactionTimeoutMs });
phase('staged position replicated');
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
await host.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().breakableWindows.filter((pane) => pane.broken).length > before, windowBreaksBefore, { timeout: interactionTimeoutMs });
phase('host window broken');
await guest.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().breakableWindows.filter((pane) => pane.broken).length > before, windowBreaksBefore, { timeout: interactionTimeoutMs });
const windowReplicated = (await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows.filter((pane) => pane.broken).length)) > windowBreaksBefore;
phase('window replicated');
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.detonateGrenadeAtWindow(1));
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().breakableWindows[1]?.broken === true, undefined, { timeout: interactionTimeoutMs });
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().breakableWindows[1]?.broken === true, undefined, { timeout: interactionTimeoutMs });
const explosiveWindowReplicated = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows[1]?.broken === true);
phase('explosive window replicated');

await movePlayerSmoothly(host, [-25, 1.7, 6]);
await movePlayerSmoothly(guest, [-25, 1.7, 0]);
await guest.waitForTimeout(1_000);
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('stand'));
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.stance === 'stand', undefined, { timeout: interactionTimeoutMs });
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
  .some((remote) => remote.stance === 'stand'), undefined, { timeout: interactionTimeoutMs });
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers.some((remote) => Math.abs(remote.position[0] + 25) < 0.25 && Math.abs(remote.position[2]) < 0.25), undefined, { timeout: interactionTimeoutMs });
await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
  .some((remote) => Math.abs(remote.position[0] + 25) < 0.25 && Math.abs(remote.position[2] - 6) < 0.25), undefined, { timeout: interactionTimeoutMs });
const guestDeathsBefore = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.deaths);
await host.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.equipWeapon('carbine');
  api.setAds(true);
});
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponPresentation.adsProgress >= 0.98, undefined, { timeout: interactionTimeoutMs });
for (let shot = 0; shot < 3; shot += 1) {
  await host.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.aimAtRemote('head');
    api.fireOnce();
  });
  await host.waitForTimeout(180);
}
try {
  await guest.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.deaths > before, guestDeathsBefore, { timeout: interactionTimeoutMs });
} catch (error) {
  console.error('[multiplayer-qa] shot authority diagnostics', JSON.stringify({
    guest: await guest.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: snapshot.player.hp, remoteHitAdmission: snapshot.remoteHitAdmission, remotes: snapshot.remotePlayers };
    }),
    host: await host.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { alignment: snapshot.lastPrincipalShotAlignment, history: snapshot.weaponActionHistory.slice(-4), remotes: snapshot.remotePlayers };
    }),
  }, null, 2));
  throw error;
}
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().deathDrops.length > 0, undefined, { timeout: interactionTimeoutMs });
await guest.waitForFunction(() => {
  const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
  return state?.player.alive === true && state.player.hp === 100 && document.querySelector('#respawn')?.hidden === true;
}, undefined, { timeout: interactionTimeoutMs });
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers.some((remote) => remote.hp === 100), undefined, { timeout: interactionTimeoutMs });
const guestRespawned = true;
const damageTelemetryVisible = await Promise.all([host, guest].map((page) => page.evaluate(() => {
  const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const local = state.privateMatch.scores.find((score) => score.id === state.privateMatch.members.find((member) => member.name === (state.gameMode === 'host' ? 'Host QA' : 'Guest QA'))?.id);
  return {
    networkRows: document.querySelectorAll('#network-strip span').length,
    dealt: Number(document.querySelector('#damage-dealt')?.textContent ?? 0),
    taken: Number(document.querySelector('#damage-taken')?.textContent ?? 0),
    feedDamageDealt: Number(document.querySelector('#damage-done-feed [data-damage-dealt]')?.dataset.damageDealt ?? 0),
    feedDamageTaken: Number(document.querySelector('#damage-taken-feed [data-damage-taken]')?.dataset.damageTaken ?? 0),
    score: local,
  };
})));
const remoteDeathDrop = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().deathDrops[0]);
phase('remote death and drop replicated');
await movePlayerSmoothly(host, [remoteDeathDrop.position[0], remoteDeathDrop.position[1] + 1.55, remoteDeathDrop.position[2] + 4]);
await guest.waitForFunction(([x, z]) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
  .some((remote) => Math.abs(remote.position[0] - x) < 0.5 && Math.abs(remote.position[2] - (z + 4)) < 0.5), [remoteDeathDrop.position[0], remoteDeathDrop.position[2]], { timeout: interactionTimeoutMs });
await movePlayerSmoothly(host, [remoteDeathDrop.position[0], remoteDeathDrop.position[1] + 1.55, remoteDeathDrop.position[2] + 2.2]);
await guest.waitForFunction(([x, z]) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
  .some((remote) => Math.abs(remote.position[0] - x) < 0.5 && Math.abs(remote.position[2] - (z + 2.2)) < 0.5), [remoteDeathDrop.position[0], remoteDeathDrop.position[2]], { timeout: interactionTimeoutMs });
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('sniper'));
await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.primaryWeapon === 'sniper', undefined, { timeout: interactionTimeoutMs });
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
await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
await host.waitForTimeout(1_000);
await host.screenshot({ path: 'test-results/release-multiplayer-host.png' });
await guest.screenshot({ path: 'test-results/release-multiplayer-guest.png' });
console.log(JSON.stringify({ baseUrl, renderMode, roomCodeLength: roomCode.length, errors, lobbyReady, hostedBotControl, hostedBotsReplicated, remoteGrenadePresentation, remoteSupportPresentation, leaderboardReplicated, stanceReplicated, windowReplicated, explosiveWindowReplicated, guestRespawned, damageTelemetryVisible, scavengeReplicated, pickupReplicated, spawnSeparation, teams, host: { mode: hostState.gameMode, remotes: hostState.remotes, team: hostState.player.team, primary: hostState.player.primaryWeapon, network: hostState.networkLifecycle }, guest: { mode: guestState.gameMode, remotes: guestState.remotes, stance: guestState.player.stance, team: guestState.player.team, deaths: guestState.player.deaths, network: guestState.networkLifecycle } }, null, 2));
if (errors.length || !lobbyReady || hostedBotControl.initial !== 0 || hostedBotControl.hostValue !== 2 || hostedBotControl.guestValue !== 2 || !hostedBotControl.guestDisabled || !hostedBotsReplicated || !remoteGrenadePresentation || !remoteSupportPresentation || hostState.bots.length !== 2 || guestState.bots.length !== 2 || !leaderboardReplicated || !stanceReplicated || !windowReplicated || !explosiveWindowReplicated || !guestRespawned || damageTelemetryVisible.some((sample) => sample.networkRows < 2 || !sample.score) || damageTelemetryVisible[0].dealt <= 0 || damageTelemetryVisible[0].feedDamageDealt <= 0 || damageTelemetryVisible[1].taken <= 0 || damageTelemetryVisible[1].feedDamageTaken <= 0 || !scavengeReplicated || !pickupReplicated || spawnSeparation < 5 || hostState.gameMode !== 'host' || guestState.gameMode !== 'client' || hostState.remotes < 1 || guestState.remotes < 1 || teams.host === teams.guest || hostState.networkLifecycle.stateChannels < 1 || guestState.networkLifecycle.stateChannels < 1 || hostState.networkLifecycle.stateChannelOrdered !== false || guestState.networkLifecycle.stateChannelOrdered !== false || hostState.networkLifecycle.stateChannelMaxRetransmits !== 0 || guestState.networkLifecycle.stateChannelMaxRetransmits !== 0 || hostState.networkLifecycle.selfStateEchoesSuppressed < 1) process.exitCode = 1;
await browser.close();
