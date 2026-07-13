import { chromium } from '@playwright/test';

const base = process.env.ATOMIC_BASE ?? 'http://127.0.0.1:4180/';
const targetUrl = new URL(base);
targetUrl.search = 'render=performance&multiplayerQa=pass14';
const target = targetUrl.toString();
const browser = await chromium.launch({ headless: true });
try {
  const host = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const guest = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
    await page.goto(target);
    await page.waitForFunction(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const status = document.querySelector('#network-status');
      const host = document.querySelector('#host');
      return debug?.weaponReady === true && status?.dataset.kind === 'ok' && host?.disabled === false;
    }, undefined, { timeout: 30_000 });
  }

  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: 30_000 });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.selectOption('#team', '1');
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: 30_000 });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes >= 1, undefined, { timeout: 30_000 });
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes >= 1, undefined, { timeout: 30_000 });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 20_000 });
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 20_000 });

  // Prove active-life inventory replication is exactly a selected primary or pistol.
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.switchWeapon(1));
  await host.waitForFunction(() => {
    const remote = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers[0];
    return remote?.primary === 'carbine' && remote?.weapon === 'pistol';
  }, undefined, { timeout: 5_000 });
  const pistolReplication = await host.evaluate(() => {
    const remote = window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0];
    return remote ? { primary: remote.primary, weapon: remote.weapon } : null;
  });

  // Put opposing peers on an unobstructed line, then prove victim-side melee
  // admission applies one authoritative knife hit from a plausible action.
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, 0, 0, 0));
  await guest.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.switchWeapon(0);
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, -1.45, Math.PI, 0);
  });
  await host.waitForFunction(() => {
    const remote = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers[0];
    return remote && Math.abs(remote.position[0]) < 0.2 && Math.abs(remote.position[2] + 1.45) < 0.3;
  }, undefined, { timeout: 5_000 });
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.melee());
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.hp <= 0, undefined, { timeout: 5_000 });

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
    replicatedLoadout: pistolReplication,
    melee: { hostHp: hostState.player.hp, hostDeaths: hostState.player.deaths },
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
    || pistolReplication?.primary !== 'carbine'
    || pistolReplication?.weapon !== 'pistol'
    || hostState.player.hp > 0
    || hostState.player.deaths < 1
  ) process.exitCode = 1;
} finally {
  await browser.close();
}
