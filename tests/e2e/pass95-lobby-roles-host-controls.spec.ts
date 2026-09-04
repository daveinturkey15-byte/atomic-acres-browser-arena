import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { startOwnedPeerServer, type OwnedPeerServer } from './pass66-e2e-support';

/**
 * HF-504 lobby/room flow — the browser half of the evidence.
 *
 * The pure state machine (roles, ready, kick authority, migration election,
 * snapshot handoff) is proved in `src/lobby-roles.test.ts`. What a unit test
 * CANNOT prove is that the room the player actually sees agrees with it: that
 * the badge on each roster row is the role the module resolved, that a KICK
 * button exists on the host's screen and on nobody else's, and that pressing
 * it removes that peer from EVERY roster in the room rather than only the
 * host's own view. Three real browsers on an owned PeerJS server, so the
 * removal travels over the wire it will travel over in a real match.
 */

const peerPort = Number(process.env.PASS95_LOBBY_PEER_PORT ?? 4_202);
let peerServer: OwnedPeerServer | null = null;

test.use({
  launchOptions: {
    args: [
      '--mute-audio',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--allow-loopback-in-peer-connection',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  },
  viewport: { width: 1_920, height: 1_080 },
});
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(context: BrowserContext, name: string, seed: string, map?: string): Promise<Page> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const page = await context.newPage();
  const url = new URL(test.info().project.use.baseURL as string);
  // The lobby is the subject; the renderer is not. Everything expensive is off
  // so three contexts fit on one GPU the owner is also using.
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgl2', render: 'compat', signal: 'off',
    grass: 'off', mist: 'off', clouds: 'off', rays: 'off', renderPaused: '1',
    externalServices: 'off', multiplayerQa: '1', seed,
    peerQaPort: String(peerServer.port), peerQaPath: peerServer.path,
  })) url.searchParams.set(key, value);
  if (map) url.searchParams.set('map', map);
  await page.goto(url.toString());
  await page.waitForFunction(() => (window as { __ATOMIC_ACRES_DEBUG__?: { snapshot(): { weaponReady: boolean } } })
    .__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.map-card')]
    .some((button) => !button.disabled));
  await page.fill('#player-name', name);
  return page;
}

async function hostRoom(page: Page): Promise<string> {
  await page.click('#host');
  await page.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  return (await page.textContent('#room-code'))!.trim();
}

async function memberCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as {
    __ATOMIC_ACRES_DEBUG__?: { snapshot(): { privateMatch: { members: unknown[] } | null } };
  }).__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members.length ?? 0);
}

async function snapshot(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot());
}

async function succession(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.sampleHostSuccession());
}

test('shows one host seat, guest seats for the rest, and offers KICK to the host alone', async ({ browser }) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({
    viewport: { width: 1_920, height: 1_080 },
  })));
  try {
    const [host, guestOne, guestTwo] = await Promise.all([
      openPlayer(contexts[0], 'HF504 Host', 'hf504-host'),
      openPlayer(contexts[1], 'HF504 Guest One', 'hf504-guest-one'),
      openPlayer(contexts[2], 'HF504 Guest Two', 'hf504-guest-two'),
    ]);
    const roomCode = await hostRoom(host);
    for (const guest of [guestOne, guestTwo]) {
      await guest.fill('#room-input', roomCode);
      await guest.click('#join');
      // Sequential joins: HF-323 holds the room while an admission is in flight,
      // so two simultaneous joins race a gate this test is not about.
      await expect.poll(() => memberCount(host)).toBeGreaterThan(0);
    }
    await Promise.all([host, guestOne, guestTwo].map(
      (page) => expect.poll(() => memberCount(page), { timeout: 60_000 }).toBe(3),
    ));

    // ROLES. Exactly one host seat, and it is the same seat on every screen.
    for (const page of [host, guestOne, guestTwo]) {
      await expect(page.locator('#lobby-roster .lobby-player[data-seat-role="host"]')).toHaveCount(1);
      await expect(page.locator('#lobby-roster .lobby-player[data-seat-role="host"]')).toContainText('HOST');
      await expect(page.locator('#lobby-roster .lobby-player[data-seat-role="guest"]')).toHaveCount(2);
    }

    // HOST CONTROLS. The offer exists on the host's screen for the two guests
    // and on nobody else's — a guest is never shown a control it may not use.
    await expect(host.locator('#lobby-roster [data-lobby-kick]')).toHaveCount(2);
    for (const guest of [guestOne, guestTwo]) {
      await expect(guest.locator('#lobby-roster [data-lobby-kick]')).toHaveCount(0);
    }

    // The host removes guest two; the removal reaches every roster in the room.
    await host.locator('#lobby-roster .lobby-player', { hasText: 'HF504 Guest Two' })
      .locator('[data-lobby-kick]').click();
    await Promise.all([host, guestOne].map(
      (page) => expect.poll(() => memberCount(page), { timeout: 60_000 }).toBe(2),
    ));
    for (const page of [host, guestOne]) {
      await expect(page.locator('#lobby-roster .lobby-player', { hasText: 'HF504 Guest Two' })).toHaveCount(0);
      await expect(page.locator('#lobby-roster .lobby-player')).toHaveCount(2);
    }
    // The removed player is told why, and is out of the room rather than
    // sitting in it disconnected.
    await expect.poll(() => guestTwo.textContent('#network-status'), { timeout: 60_000 })
      .toContain('The host removed you from the room.');
    expect(await memberCount(guestTwo)).toBe(0);

    // The surviving guest kept its seat and its role.
    await expect(guestOne.locator('#lobby-roster .lobby-player[data-seat-role="host"]')).toHaveCount(1);
    await expect(guestOne.locator('#lobby-roster .lobby-player[data-seat-role="guest"]')).toHaveCount(1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('elects the prescribed successor in an active match and carries live state across host loss', async ({ browser }) => {
  test.setTimeout(360_000);
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({
    viewport: { width: 1_920, height: 1_080 },
  })));
  try {
    const [host, guestOne, guestTwo] = await Promise.all([
      openPlayer(contexts[0], 'MIG HOST', 'hf504-migration-host', 'atomic-acres'),
      openPlayer(contexts[1], 'MIG GUEST1', 'hf504-migration-guest-one', 'atomic-acres'),
      openPlayer(contexts[2], 'MIG GUEST2', 'hf504-migration-guest-two', 'atomic-acres'),
    ]);
    const roomCode = await hostRoom(host);
    for (const guest of [guestOne, guestTwo]) {
      await guest.fill('#room-input', roomCode);
      await guest.click('#join');
      await expect.poll(() => memberCount(host), { timeout: 60_000 }).toBeGreaterThan(0);
    }
    await Promise.all([host, guestOne, guestTwo].map(
      (page) => expect.poll(() => memberCount(page), { timeout: 60_000 }).toBe(3),
    ));

    for (const page of [host, guestOne, guestTwo]) await page.click('#lobby-ready');
    await expect(host.locator('#lobby-start')).toBeEnabled({ timeout: 60_000 });
    await host.click('#lobby-start');
    await Promise.all([host, guestOne, guestTwo].map((page) => page.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted === true && state.matchPhase === 'active';
    }, undefined, { timeout: 180_000 })));

    const ids = await snapshot(host).then((state) => Object.fromEntries(
      state.privateMatch.members.map((member: { name: string; id: string }) => [member.name, member.id]),
    ));
    const guestOneId = ids['MIG GUEST1'];
    const guestTwoId = ids['MIG GUEST2'];
    expect(typeof guestOneId).toBe('string');
    expect(typeof guestTwoId).toBe('string');

    // Make the retained state non-default and observable: real replicated
    // positions/loadouts plus one host-authoritative score event.
    // Use the production field-kit redeploy path so the host authorizes the
    // changed loadout; a debug-only weapon mutation is intentionally not a
    // network admission path.
    for (const [page, kit] of [[guestOne, 'runner'], [guestTwo, 'marksman']] as const) {
      await page.evaluate((selectedKit) => (window as any).__ATOMIC_ACRES_DEBUG__.equipKit(selectedKit), kit);
      await expect(page.locator('#field-kit-redeploy')).toBeEnabled({ timeout: 15_000 });
      // The private-lobby shell keeps the redeploy row visually suppressed;
      // invoke the same production listener after its enabled-state contract
      // is met so the migration fixture does not add a test-only API.
      await page.locator('#field-kit-redeploy').evaluate((button) => (button as HTMLButtonElement).click());
    }
    await guestOne.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(4, 1.7, 4, Math.PI, 0));
    await guestTwo.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(-4, 1.7, -4, 0, 0));
    const forcedDeath = await host.evaluate((id) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.forceRemoteDeathForReconnect(id)
    ), guestOneId);
    expect(forcedDeath?.targetId).toBe(guestOneId);
    await expect.poll(async () => (await guestOne.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.alive)), { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await snapshot(host)).privateMatch.scores.some((score: { kills: number }) => score.kills > 0), { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await snapshot(host)).remotePlayers.some((remote: { id: string; primary: string }) => remote.id === guestTwoId && remote.primary === 'sniper'), { timeout: 15_000 }).toBe(true);

    const before = {
      guestOne: await snapshot(guestOne),
      guestTwo: await snapshot(guestTwo),
    };
    await expect.poll(async () => {
      const samples = await Promise.all([succession(guestOne), succession(guestTwo)]);
      return samples.map((sample) => sample.mandate?.successorId ?? null);
    }, { timeout: 60_000 }).toEqual([expect.any(String), expect.any(String)]);
    const mandates = await Promise.all([succession(guestOne), succession(guestTwo)]);
    const successorId = mandates.find((sample) => typeof sample.mandate?.successorId === 'string')?.mandate.successorId;
    expect(successorId).toBeTruthy();
    expect(new Set(mandates.map((sample) => sample.mandate?.successorId)).size).toBe(1);
    expect([guestOneId, guestTwoId]).toContain(successorId);
    const successorPage = successorId === guestOneId ? guestOne : guestTwo;
    const followerPage = successorId === guestOneId ? guestTwo : guestOne;
    const beforeSuccessor = successorId === guestOneId ? before.guestOne : before.guestTwo;
    const beforeFollower = successorId === guestOneId ? before.guestTwo : before.guestOne;
    const followerRevisionBeforeDrop = beforeFollower.privateMatch.revision;

    const droppedAt = Date.now();
    await contexts[0].close();
    let firstSuccessorSnapshotMs: number | null = null;
    let lastSuccessorControl: any = null;
    const migrationDeadline = Date.now() + 150_000;
    while (Date.now() < migrationDeadline) {
      const [successorState, followerState, successorControl, followerControl] = await Promise.all([
        snapshot(successorPage), snapshot(followerPage), succession(successorPage), succession(followerPage),
      ]);
      lastSuccessorControl = successorControl;
      if (firstSuccessorSnapshotMs === null
        && followerControl.lobbyHostId === successorId
        && followerState.privateMatch?.revision > followerRevisionBeforeDrop) {
        firstSuccessorSnapshotMs = Date.now() - droppedAt;
      }
      if (successorControl.role === 'host'
        && successorControl.lobbyHostId === successorId
        && followerControl.role === 'client'
        && followerControl.lobbyHostId === successorId
        && successorState.matchPhase === 'active'
        && followerState.matchPhase === 'active') break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(lastSuccessorControl?.role).toBe('host');
    const afterSuccessor = await snapshot(successorPage);
    const afterFollower = await snapshot(followerPage);
    const followerAfterControl = await succession(followerPage);
    expect(followerAfterControl.role).toBe('client');
    expect(followerAfterControl.lobbyHostId).toBe(successorId);
    expect(firstSuccessorSnapshotMs).not.toBeNull();
    expect(afterSuccessor.privateMatch.scores).toEqual(beforeSuccessor.privateMatch.scores);
    expect(afterFollower.privateMatch.scores).toEqual(beforeFollower.privateMatch.scores);
    expect(afterSuccessor.privateMatch.members.filter((member: { connected: boolean }) => member.connected)).toHaveLength(2);
    expect(afterFollower.privateMatch.members.filter((member: { connected: boolean }) => member.connected)).toHaveLength(2);

    expect(afterSuccessor.player.primaryWeapon).toBe(beforeSuccessor.player.primaryWeapon);
    expect(afterSuccessor.player.secondaryWeapon).toBe(beforeSuccessor.player.secondaryWeapon);
    expect(afterSuccessor.player.selectedGrenade).toBe(beforeSuccessor.player.selectedGrenade);
    expect(afterSuccessor.player.position).toHaveLength(3);
    for (const [index, coordinate] of beforeSuccessor.player.position.entries()) {
      expect(Math.abs(afterSuccessor.player.position[index] - coordinate)).toBeLessThan(0.75);
    }
    const followerRemote = afterFollower.remotePlayers.find((remote: { id: string }) => remote.id === successorId);
    expect(followerRemote?.primary).toBe(beforeSuccessor.player.primaryWeapon);
    expect(followerRemote?.authoritativePosition).toHaveLength(3);
    for (const [index, coordinate] of beforeSuccessor.player.position.entries()) {
      expect(Math.abs(followerRemote.authoritativePosition[index] - coordinate)).toBeLessThan(0.75);
    }
    console.log(`[host-migration] first successor snapshot after host loss: ${firstSuccessorSnapshotMs} ms; one 40 Hz snapshot interval is 25 ms`);
    test.info().annotations.push({
      type: 'host-migration-measurement',
      description: `first successor snapshot after host loss: ${firstSuccessorSnapshotMs} ms; one 40 Hz snapshot interval is 25 ms`,
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
