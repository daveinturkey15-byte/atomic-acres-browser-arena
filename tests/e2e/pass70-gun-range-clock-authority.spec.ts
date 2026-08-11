import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  assertPass66OwnedCandidatePage,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS70_RANGE_CLOCK_PEER_PORT ?? 9_077);
let peerServer: OwnedPeerServer | null = null;

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS70_RANGE_CLOCK_PEER_PATH);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const page = await context.newPage();
  const url = new URL(test.info().project.use.baseURL as string);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgl2');
  url.searchParams.set('render', 'compat');
  url.searchParams.set('signal', 'off');
  url.searchParams.set('grass', 'off');
  url.searchParams.set('mist', 'off');
  url.searchParams.set('clouds', 'off');
  url.searchParams.set('rays', 'off');
  url.searchParams.set('renderPaused', '1');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(peerPort));
  url.searchParams.set('peerQaPath', peerServer.path);
  url.searchParams.set('seed', seed);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.fill('#player-name', name);
  return page;
}

async function clock(page: Page): Promise<{
  revision: number;
  paused: boolean;
  authorityRole: string;
  occupantIds: string[];
  effectiveRemainingMs: number;
}> {
  return page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock);
}

test('guest bay occupancy freezes the host clock for both peers and exit resumes it', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Bundled headless Firefox cannot retain two simultaneous game pages.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext({ viewport: { width: 1_280, height: 720 } }),
    browser.newContext({ viewport: { width: 1_280, height: 720 } }),
  ]);
  try {
    const [host, guest] = await Promise.all([
      openPlayer(hostContext, 'CLOCK HOST', 'pass70-clock-host'),
      openPlayer(guestContext, 'CLOCK GUEST', 'pass70-clock-guest'),
    ]);
    await host.click('#host');
    await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
    const roomCode = (await host.textContent('#room-code'))!.trim();
    await guest.fill('#room-input', roomCode);
    await guest.click('#join');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
    ))));

    await host.locator('#lobby-arena').selectOption('gun-range');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.privateMatch?.arenaId === 'gun-range'
        && state.privateMatch.durationMs === 120_000
        && state.arenaSelection.id === 'gun-range';
    }, undefined, { timeout: 60_000 })));
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await expect(host.locator('#lobby-start')).toBeEnabled();
    await host.click('#lobby-start');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active'
        && state.matchClock?.paused === false;
    }, undefined, { timeout: 60_000 })));

    const guestId = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
        .find((member: any) => member.name === 'CLOCK GUEST')?.id
    ));
    expect(typeof guestId).toBe('string');
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0));
    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(72, 1.7, 6));
    await host.waitForFunction(({ id }) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const remote = state.remotePlayers.find((candidate: any) => candidate.id === id);
      return remote && Math.abs(remote.authoritativePosition[0] - 72) < 0.5
        && Math.abs(remote.authoritativePosition[2] - 6) < 0.5
        && state.matchClock?.paused === true
        && state.matchClock.occupantIds.includes(id);
    }, { id: guestId }, { timeout: 15_000 });
    await guest.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === true
    ), undefined, { timeout: 15_000 });

    const pausedStart = await Promise.all([clock(host), clock(guest)]);
    expect(pausedStart[0]).toMatchObject({ paused: true, authorityRole: 'host', occupantIds: [guestId] });
    expect(pausedStart[1]).toMatchObject({ paused: true, authorityRole: 'replica', occupantIds: [] });
    expect(pausedStart[1].revision).toBe(pausedStart[0].revision);
    await host.waitForTimeout(1_250);
    const pausedEnd = await Promise.all([clock(host), clock(guest)]);
    for (let index = 0; index < 2; index += 1) {
      expect(Math.abs(pausedEnd[index].effectiveRemainingMs - pausedStart[index].effectiveRemainingMs)).toBeLessThan(180);
    }
    expect(Math.abs(pausedEnd[0].effectiveRemainingMs - pausedEnd[1].effectiveRemainingMs)).toBeLessThan(350);

    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(20, 1.7, 0));
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchClock?.paused === false
    ), undefined, { timeout: 15_000 })));
    const resumedStart = await Promise.all([clock(host), clock(guest)]);
    expect(resumedStart[0].revision).toBe(pausedStart[0].revision + 1);
    expect(resumedStart[1].revision).toBe(resumedStart[0].revision);
    await host.waitForTimeout(1_250);
    const resumedEnd = await Promise.all([clock(host), clock(guest)]);
    for (let index = 0; index < 2; index += 1) {
      const consumedMs = resumedStart[index].effectiveRemainingMs - resumedEnd[index].effectiveRemainingMs;
      expect(consumedMs).toBeGreaterThan(900);
      expect(consumedMs).toBeLessThan(1_600);
    }
    expect(Math.abs(resumedEnd[0].effectiveRemainingMs - resumedEnd[1].effectiveRemainingMs)).toBeLessThan(350);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});
