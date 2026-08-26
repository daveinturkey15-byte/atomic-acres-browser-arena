import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4173/';
const peerQaPort = Number(process.env.QA_PEER_PORT ?? 0);
const timeout = 30_000;
const errors = [];
const browser = await chromium.launch({
  headless: process.env.QA_HEADFUL !== '1',
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

async function movePlausibly(page, x, y, z, steps = 48) {
  const start = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    await page.evaluate(({ px, py, pz }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(px, py, pz), {
      px: start[0] + (x - start[0]) * t,
      py: start[1] + (y - start[1]) * t,
      pz: start[2] + (z - start[2]) * t,
    });
    await page.waitForTimeout(100);
  }
}

async function awardVerifiedHostKills(host, guest, count) {
  const before = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.kills);
  await movePlausibly(host, -25, 1.7, 6);
  await host.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.equipWeapon('sniper');
    api.setAds(true);
  });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponPresentation.adsProgress >= 0.98, undefined, { timeout });
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
    .some((remote) => remote.weapon === 'sniper'), undefined, { timeout });
  for (let index = 0; index < count; index += 1) {
    console.log(`[support-qa] earning verified elimination ${index + 1}/${count}`);
    await movePlausibly(guest, -25, 1.7, 0);
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('stand'));
    await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
      .some((remote) => Math.abs(remote.position[0] + 25) < 0.5 && Math.abs(remote.position[2]) < 0.5), undefined, { timeout });
    await host.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.aimAtRemote('head');
      api.fireOnce();
    });
    await host.waitForFunction((target) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.kills >= target, before + index + 1, { timeout });
    await guest.waitForFunction((target) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remoteSupportAuthority
      .some((authority) => authority.streak >= target), before + index + 1, { timeout });
    console.log(`[support-qa] elimination ${index + 1}/${count} admitted`);
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.respawn());
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.alive === true, undefined, { timeout });
  }
}

try {
  const host = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const guest = await browser.newPage({ viewport: { width: 640, height: 360 } });
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`${label}: ${message.text()}`);
    });
    const url = new URL(baseUrl);
    url.searchParams.set('render', 'compatibility');
    url.searchParams.set('multiplayerQa', '1');
    if (Number.isInteger(peerQaPort) && peerQaPort >= 1_024 && peerQaPort <= 65_535) {
      url.searchParams.set('peerQaPort', String(peerQaPort));
    }
    await page.goto(url.toString());
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
    await page.fill('#player-name', label === 'host' ? 'Support Host' : 'Support Guest');
  }

  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.selectOption('#team', '1');
  await guest.fill('#room-input', roomCode);
  await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await Promise.all([host, guest].map((page) => page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members.length === 2,
    undefined,
    { timeout },
  )));
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout });
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.matchPhase === 'active' && state.remotes === 1;
  }, undefined, { timeout })));
  await guest.waitForTimeout(2_000);
  await awardVerifiedHostKills(host, guest, 8);

  const hunterPoint = await host.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const candidates = [[8, 0], [-8, 0], [0, 8], [0, -8], [7, 7], [-7, 7], [7, -7], [-7, -7]];
    return candidates.find(([x, z]) => [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]
      .every(([dx, dz]) => !api.collisionProbe(x + dx, z + dz))) ?? null;
  });
  if (!hunterPoint) throw new Error('No clear mid-map Hunter Swarm QA point');
  await host.evaluate(([x, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-x, 1.7, -z, 0, 0), hunterPoint);
  await movePlausibly(guest, hunterPoint[0], 1.7, hunterPoint[1]);
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
  await host.waitForFunction(([x, z]) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
    .some((remote) => Math.abs(remote.position[0] - x) < 0.5 && Math.abs(remote.position[2] - z) < 0.5 && remote.stance === 'prone'), hunterPoint, { timeout });

  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateSupport('hunter-swarm'));
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().fieldSupport.hunterSwarmLaunches === 5, undefined, { timeout });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().fieldSupport.hunterSwarmImpacts === 5, undefined, { timeout });
  await guest.waitForTimeout(1_000);
  const hunterProneHp = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.hp);
  if (hunterProneHp <= 0 || hunterProneHp >= 100) {
    console.error('[support-qa] hunter diagnostics', JSON.stringify({
      host: await host.evaluate(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return { fieldSupport: state.fieldSupport, remoteAuthority: state.remoteSupportAuthority, remotes: state.remotePlayers };
      }),
      guest: await guest.evaluate(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return { hp: state.player.hp, remoteAuthority: state.remoteSupportAuthority, remoteHitAdmission: state.remoteHitAdmission };
      }),
    }, null, 2));
    throw new Error(`Expected prone player to survive five damaging drones, got ${hunterProneHp} HP`);
  }

  // The receiver must admit Tri-Pass at the full authoritative 15 m radius,
  // Tri-Pass source metadata must preserve a legitimate 12 m blast. This was
  // rejected by the old source-agnostic ~6.2 m gate.
  // Reset authoritative victim health through a real lethal hit + bounded respawn;
  // debug-only local healing is deliberately not accepted by the host.
  await awardVerifiedHostKills(host, guest, 1);
  const triPassPair = await host.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    for (let x = -12; x <= 12; x += 6) {
      for (let z = -12; z <= 12; z += 6) {
        if (api.collisionProbe(x, z)) continue;
        for (let index = 0; index < 16; index += 1) {
          const angle = index * Math.PI / 8;
          const targetX = x + Math.sin(angle) * 12;
          const targetZ = z + Math.cos(angle) * 12;
          if (Math.abs(targetX) > 28 || Math.abs(targetZ) > 28) continue;
          if (!api.collisionProbe(targetX, targetZ) && !api.segmentBlocked(x, z, targetX, targetZ)) {
            return { blast: [x, z], target: [targetX, targetZ] };
          }
        }
      }
    }
    return null;
  });
  if (!triPassPair) throw new Error('No clear 12 m Tri-Pass authority segment');
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, -20, 0, 0));
  await movePlausibly(guest, triPassPair.target[0], 1.7, triPassPair.target[1]);
  await host.waitForFunction(([x, z]) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers
    .some((remote) => Math.abs(remote.position[0] - x) < 0.5 && Math.abs(remote.position[2] - z) < 0.5), triPassPair.target, { timeout });
  await guest.waitForTimeout(1_500);
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateSupport('tri-pass'));
  const spareTargets = [[-20, -20], [-20, 20], [20, -20], [20, 20]]
    .sort((a, b) => Math.hypot(b[0] - triPassPair.target[0], b[1] - triPassPair.target[1])
      - Math.hypot(a[0] - triPassPair.target[0], a[1] - triPassPair.target[1]));
  const secondTarget = spareTargets[0];
  const thirdTarget = spareTargets.find((point) => point !== secondTarget
    && Math.hypot(point[0] - secondTarget[0], point[1] - secondTarget[1]) >= 12
    && Math.hypot(point[0] - triPassPair.target[0], point[1] - triPassPair.target[1]) >= 18);
  if (!thirdTarget) throw new Error('No isolated spare Tri-Pass targets');
  const targetsAccepted = await host.evaluate(({ blast, secondTarget, thirdTarget }) => window.__ATOMIC_ACRES_DEBUG__.selectTriPassWorldTargets([
    blast,
    secondTarget,
    thirdTarget,
  ]), { blast: triPassPair.blast, secondTarget, thirdTarget });
  if (!targetsAccepted) throw new Error('Tri-Pass QA targets were not accepted');
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().fieldSupport.triPassImpacts === 3, undefined, { timeout });
  try {
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.hp < 100, undefined, { timeout });
  } catch (error) {
    console.error('Tri-Pass authority diagnostics', JSON.stringify({
      pair: triPassPair,
      guest: await guest.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return { hp: snapshot.player.hp, remoteSupportAuthority: snapshot.remoteSupportAuthority, remotes: snapshot.remotePlayers };
      }),
      host: await host.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return { networkHits: snapshot.fieldSupport.networkHits, remotes: snapshot.remotePlayers };
      }),
    }, null, 2));
    throw error;
  }
  const triPassHpAtTwelveMetres = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.hp);
  if (triPassHpAtTwelveMetres <= 0 || triPassHpAtTwelveMetres >= 100) {
    console.error('Tri-Pass result diagnostics', JSON.stringify({
      pair: triPassPair,
      spareTargets: [secondTarget, thirdTarget],
      hp: triPassHpAtTwelveMetres,
      guest: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player),
      host: await host.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return { remotes: snapshot.remotePlayers, networkHits: snapshot.fieldSupport.networkHits };
      }),
    }, null, 2));
    throw new Error(`Expected a 12 m Tri-Pass target to survive with damage, got ${triPassHpAtTwelveMetres} HP`);
  }

  await awardVerifiedHostKills(host, guest, 7);
  const guestDeathsBeforeNuke = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.deaths);
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateSupport('nuke'));
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
    triPass: {
      impacts: hostState.fieldSupport.triPassImpacts,
      hpAtTwelveMetres: triPassHpAtTwelveMetres,
    },
    nuke: {
      launches: hostState.fieldSupport.nukeActivations,
      detonations: hostState.fieldSupport.nukeDetonations,
      remoteDeaths: guestState.player.deaths - guestDeathsBeforeNuke,
    },
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
