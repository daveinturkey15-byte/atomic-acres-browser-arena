import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4173/';
const timeout = 30_000;
const errors = [];
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

try {
  const host = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const guest = await browser.newPage({ viewport: { width: 640, height: 360 } });
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`${label}: ${message.text()}`);
    });
    const url = new URL(baseUrl);
    url.searchParams.set('render', 'performance');
    url.searchParams.set('multiplayerQa', '1');
    await page.goto(url.toString());
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout });
    await page.fill('#player-name', label === 'host' ? 'Support Host' : 'Support Guest');
  }

  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.selectOption('#team', '1');
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout });
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout });
  await guest.waitForTimeout(2_000);

  const hunterPoint = await host.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const candidates = [[8, 0], [-8, 0], [0, 8], [0, -8], [7, 7], [-7, 7], [7, -7], [-7, -7]];
    return candidates.find(([x, z]) => [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]
      .every(([dx, dz]) => !api.collisionProbe(x + dx, z + dz))) ?? null;
  });
  if (!hunterPoint) throw new Error('No clear mid-map Hunter Swarm QA point');
  await host.evaluate(([x, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-x, 1.7, -z, 0, 0), hunterPoint);
  await guest.evaluate(([x, z]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.teleportPlayer(x, 1.7, z, Math.PI, 0);
    api.setStance('prone');
  }, hunterPoint);
  await host.waitForFunction(([x, z]) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
    .some((remote) => Math.abs(remote.position[0] - x) < 0.5 && Math.abs(remote.position[2] - z) < 0.5 && remote.stance === 'prone'), hunterPoint, { timeout });

  await host.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.earnSupport(8);
    api.activateSupport('hunter-swarm');
  });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().fieldSupport.hunterSwarmLaunches === 5, undefined, { timeout });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().fieldSupport.hunterSwarmImpacts === 5, undefined, { timeout });
  await guest.waitForTimeout(1_000);
  const hunterProneHp = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.hp);
  if (hunterProneHp <= 0 || hunterProneHp >= 100) throw new Error(`Expected prone player to survive five damaging drones, got ${hunterProneHp} HP`);

  const guestDeathsBeforeNuke = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.deaths);
  await host.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.earnSupport(7);
    api.activateSupport('nuke');
  });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().fieldSupport.nukeDetonations === 1, undefined, { timeout });
  await guest.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.deaths > before, guestDeathsBeforeNuke, { timeout });

  const hostState = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const guestState = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const result = {
    errors,
    hunter: {
      launches: hostState.fieldSupport.hunterSwarmLaunches,
      impacts: hostState.fieldSupport.hunterSwarmImpacts,
      proneHpAfterFive: hunterProneHp,
    },
    nuke: {
      launches: hostState.fieldSupport.nukeLaunches,
      detonations: hostState.fieldSupport.nukeDetonations,
      remoteDeaths: guestState.player.deaths - guestDeathsBeforeNuke,
    },
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}