import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4182/';
const peerPort = Number(process.env.QA_PEER_PORT ?? 9001);
const timeout = 45_000;
const errors = [];
const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

async function openPlayer(name) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  const url = new URL(baseUrl);
  url.searchParams.set('render', 'compatibility');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(peerPort));
  url.searchParams.set('map', 'gun-range');
  await page.goto(url.toString());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await page.fill('#player-name', name);
  return page;
}

async function movePlausibly(page, target, steps = 36) {
  const start = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    await page.evaluate(({ start, target, t }) => {
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(
        start[0] + (target[0] - start[0]) * t,
        start[1] + (target[1] - start[1]) * t,
        start[2] + (target[2] - start[2]) * t,
      );
    }, { start, target, t });
    await page.waitForTimeout(85);
  }
}

try {
  const host = await openPlayer('Range Host');
  const guest = await openPlayer('Range Guest');
  await host.click('#host');
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim(), undefined, { timeout });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await Promise.all([host, guest].map((page) => page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2,
    undefined,
    { timeout },
  )));
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout });
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.matchPhase === 'active' && state.remotes === 1;
  }, undefined, { timeout })));

  const opening = await Promise.all([host, guest].map((page) => page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      arena: state.arenaSelection.id,
      bots: state.bots.length,
      mode: state.privateMatch.mode,
      members: state.privateMatch.members.length,
    };
  })));
  if (!opening.every((state) => state.arena === 'gun-range' && state.bots === 0 && state.mode === 'ffa' && state.members === 2)) {
    throw new Error(`Gun Range lobby contract failed: ${JSON.stringify(opening)}`);
  }

  // The centre bay is intentionally unobstructed. x=-3 is a booth divider and
  // would turn this into a cover test instead of a human-damage proof.
  await movePlausibly(host, [0, 1.7, 5]);
  await movePlausibly(guest, [0, 1.7, -1]);
  await host.waitForFunction(() => {
    const remote = window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0];
    return remote && Math.abs(remote.position[0]) < 0.4 && Math.abs(remote.position[2] + 1) < 0.4;
  }, undefined, { timeout });
  const guestHpBefore = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.hp);
  await host.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.equipWeapon('carbine');
    api.setAds(true);
    api.aimAtRemote('body');
  });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation.adsProgress >= 0.98, undefined, { timeout });
  for (let shot = 0; shot < 3; shot += 1) {
    await host.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.aimAtRemote('body');
      api.fireOnce();
    });
    await host.waitForTimeout(180);
  }
  try {
    await guest.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.hp < before, guestHpBefore, { timeout: 8_000 });
  } catch (error) {
    const diagnostics = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        player: state.player,
        remotes: state.remotePlayers,
        mode: state.privateMatch?.mode,
        remoteHitAdmission: state.remoteHitAdmission,
        clientRuntimeLog: state.clientRuntimeLog,
      };
    })));
    throw new Error(`Gun Range human damage failed: ${JSON.stringify(diagnostics)}; ${error}`);
  }
  const guestHpAfter = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.hp);
  const hostDamageVisible = await host.locator('#damage-done-feed [data-damage-dealt]').first().isVisible();
  const guestDamageVisible = await guest.locator('#damage-taken-feed [data-damage-taken]').first().isVisible();

  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.hitRangeTarget('flying-black-cat', 100, 'body'));
  await host.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const cat = state.rangePractice.targets.find((target) => target.id === 'flying-black-cat');
    return state.rangePractice.score >= 500 && cat?.active === false;
  }, undefined, { timeout });
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.scores
    .some((score) => (score.rangeScore ?? 0) >= 500), undefined, { timeout });

  const hostState = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const guestState = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const cat = hostState.rangePractice.targets.find((target) => target.id === 'flying-black-cat');
  const result = {
    schema: 'atomic-acres/pass60-gun-range-acceptance@1',
    errors,
    opening,
    humanDamage: { guestHpBefore, guestHpAfter, hostDamageVisible, guestDamageVisible },
    cat: { score: hostState.rangePractice.score, active: cat?.active, respawnInMs: cat?.respawnInMs },
    replicatedScores: guestState.privateMatch.scores.map((score) => ({ id: score.id, rangeScore: score.rangeScore, rangeHits: score.rangeHits, rangeShots: score.rangeShots })),
  };
  await mkdir('artifacts/pass60', { recursive: true });
  await writeFile('artifacts/pass60/gun-range-multiplayer.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (errors.length || guestHpAfter >= guestHpBefore || !hostDamageVisible || !guestDamageVisible
    || hostState.rangePractice.score < 500 || cat?.active !== false || (cat?.respawnInMs ?? 0) < 28_000
    || !result.replicatedScores.some((score) => (score.rangeScore ?? 0) >= 500)) process.exitCode = 1;
} finally {
  await browser.close();
}
