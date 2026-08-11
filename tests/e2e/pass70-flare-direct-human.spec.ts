import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { TIMED_MAP_WEAPON_DEFINITIONS } from '../../src/timed-map-weapon-authority';
import {
  assertPass66OwnedCandidatePage,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS70_FLARE_DIRECT_PEER_PORT ?? 9_081);
let peerServer: OwnedPeerServer | null = null;

test.describe.configure({ timeout: 180_000 });
test.use({
  launchOptions: {
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--allow-loopback-in-peer-connection',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  },
  viewport: { width: 1_280, height: 720 },
});

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS70_FLARE_DIRECT_PEER_PATH);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const page = await context.newPage();
  const url = new URL(test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', map: 'skyline-terminal', renderer: 'webgl2', render: 'compat', signal: 'off',
    grass: 'off', mist: 'off', clouds: 'off', rays: 'off', renderPaused: '1', externalServices: 'off',
    multiplayerQa: '1', peerQaPort: String(peerPort), peerQaPath: peerServer.path, seed,
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.fill('#player-name', name);
  return page;
}

test('one authoritative Flare direct hit removes exactly 42 health from a human once', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Bundled headless Firefox cannot retain two simultaneous game pages.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext({ viewport: { width: 1_280, height: 720 } }),
    browser.newContext({ viewport: { width: 1_280, height: 720 } }),
  ]);
  try {
    const [host, guest] = await Promise.all([
      openPlayer(hostContext, 'FLARE HOST', 'pass70-flare-host'),
      openPlayer(guestContext, 'FLARE GUEST', 'pass70-flare-guest'),
    ]);
    await host.click('#host');
    await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
    const roomCode = (await host.textContent('#room-code'))!.trim();
    await guest.fill('#room-input', roomCode);
    await guest.click('#join');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
    ))));
    await host.locator('#lobby-bots').selectOption('0');
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await expect(host.locator('#lobby-start')).toBeEnabled();
    await host.click('#lobby-start');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active' && state.arenaSelection.id === 'skyline-terminal'
        && state.remotePlayers.length === 1;
    }, undefined, { timeout: 60_000 })));

    const lobby = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch);
    const hostId = lobby.members.find((member: any) => member.name === 'FLARE HOST')?.id;
    const guestId = lobby.members.find((member: any) => member.name === 'FLARE GUEST')?.id;
    expect(typeof hostId).toBe('string');
    expect(typeof guestId).toBe('string');

    const staged = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.stageTimedMapWeaponMidpoint('flare-gun', 'exact')
    ));
    expect(staged).toMatchObject({ status: 'available', announcementSent: true });
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states['flare-gun'].status === 'available'
    ), undefined, { timeout: 15_000 })));
    const pickup = TIMED_MAP_WEAPON_DEFINITIONS['flare-gun'].spawnPosition;
    await host.evaluate(([x, y, z]) => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z), pickup);
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.interactDrop())).toBe(true);
    await Promise.all([host, guest].map((page) => page.waitForFunction((holderId) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states['flare-gun'];
      return state.status === 'held' && state.holderId === holderId;
    }, hostId, { timeout: 15_000 })));

    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setAds(true));
    await host.waitForTimeout(350);
    // The south apron is a retained open-authority lane without terminal,
    // aircraft or cargo colliders between these two real peers.
    await Promise.all([
      host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(-4, 1.7, 30, 0, 0)),
      guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(4, 1.7, 30, 0, 0)),
    ]);
    await host.waitForFunction((id) => {
      const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
        .find((candidate: any) => candidate.id === id);
      return remote && Math.abs(remote.authoritativePosition[0] - 4) < 0.25
        && Math.abs(remote.authoritativePosition[2] - 30) < 0.25 && remote.hp === 100;
    }, guestId, { timeout: 15_000 });
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.aimAtRemote('body'));
    const beforeShots = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states['flare-gun'].shotsRemaining
    ));
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.fireOnce());

    await guest.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp === 58, undefined, { timeout: 8_000 });
    await host.waitForFunction(({ id, beforeShots }) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const remote = state.remotePlayers.find((candidate: any) => candidate.id === id);
      return remote?.hp === 58
        && state.timedMapWeapons.states['flare-gun'].shotsRemaining === beforeShots - 1
        && state.timedMapWeapons.audit.flareDamage >= 42;
    }, { id: guestId, beforeShots }, { timeout: 8_000 });
    expect(await host.evaluate((id) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        remoteHp: state.remotePlayers.find((candidate: any) => candidate.id === id)?.hp,
        flareDamage: state.timedMapWeapons.audit.flareDamage,
      };
    }, guestId)).toEqual({ remoteHp: 58, flareDamage: 42 });
    await host.waitForTimeout(1_250);
    expect(await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp)).toBe(58);
    expect(await host.evaluate((id) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        remoteHp: state.remotePlayers.find((candidate: any) => candidate.id === id)?.hp,
        flareDamage: state.timedMapWeapons.audit.flareDamage,
      };
    }, guestId)).toEqual({ remoteHp: 58, flareDamage: 42 });
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});
