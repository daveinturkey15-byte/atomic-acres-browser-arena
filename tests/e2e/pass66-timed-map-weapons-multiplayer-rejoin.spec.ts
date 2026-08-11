import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  TIMED_MAP_WEAPON_DEFINITIONS,
  type TimedMapWeaponId,
} from '../../src/timed-map-weapon-authority';
import {
  assertPass66OwnedCandidatePage,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS66_TIMED_WEAPONS_PEER_PORT ?? 9_068);
let peerServer: OwnedPeerServer | null = null;

const cases = [
  { weaponId: 'flamethrower', arenaId: 'rustworks-1v1', effect: 'flameStream', finalStatus: 'held' },
  { weaponId: 'flare-gun', arenaId: 'skyline-terminal', effect: 'flareProjectiles', finalStatus: 'depleted' },
] as const satisfies readonly Readonly<{
  weaponId: TimedMapWeaponId;
  arenaId: 'rustworks-1v1' | 'skyline-terminal';
  effect: 'flameStream' | 'flareProjectiles';
  finalStatus: 'held' | 'depleted';
}>[];

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
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS66_TIMED_WEAPONS_PEER_PATH);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(
  context: BrowserContext,
  name: string,
  seed: string,
  arenaId: 'rustworks-1v1' | 'skyline-terminal',
): Promise<Page> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const page = await context.newPage();
  const url = new URL(test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', map: arenaId, renderer: 'webgl2', render: 'compat', signal: 'off',
    grass: 'off', mist: 'off', clouds: 'off', rays: 'off', renderPaused: '1',
    multiplayerQa: '1', peerQaPort: String(peerPort), peerQaPath: peerServer.path, externalServices: 'off', seed,
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction((expectedArena) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.weaponReady === true && snapshot.arenaSelection.id === expectedArena
      && [...document.querySelectorAll<HTMLButtonElement>('.map-card')].some((button) => !button.disabled);
  }, arenaId, { timeout: 60_000 });
  await page.fill('#player-name', name);
  return page;
}

async function startTwoPeerMatch(
  hostContext: BrowserContext,
  guestContext: BrowserContext,
  testCase: typeof cases[number],
): Promise<{ host: Page; guest: Page; roomCode: string; hostId: string; guestId: string }> {
  const hostName = `Timed Host ${testCase.weaponId}`;
  const guestName = `Timed Guest ${testCase.weaponId}`;
  const [host, guest] = await Promise.all([
    openPlayer(hostContext, hostName, `pass66-mp-host-${testCase.weaponId}`, testCase.arenaId),
    openPlayer(guestContext, guestName, `pass66-mp-guest-${testCase.weaponId}`, testCase.arenaId),
  ]);
  await host.click('#host');
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.textContent('#room-code'))!.trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ), undefined, { timeout: 30_000 })));
  await host.locator('#lobby-bots').selectOption('0');
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((page) => page.waitForFunction((arenaId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active' && state.arenaSelection.id === arenaId
      && state.remotePlayers.length === 1;
  }, testCase.arenaId, { timeout: 60_000 })));
  const lobby = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch);
  const members = lobby.members;
  const hostId = members.find((member: { name: string }) => member.name.startsWith('Timed Host'))?.id;
  const guestId = members.find((member: { name: string }) => member.name.startsWith('Timed Guest'))?.id;
  if (!hostId || !guestId) throw new Error(`Timed-special lobby identities missing: ${JSON.stringify(members)}`);
  return { host, guest, roomCode, hostId, guestId };
}

async function timedEvidence(page: Page, testCase: typeof cases[number]) {
  return page.evaluate(({ weaponId, effect }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      state: snapshot.timedMapWeapons.states[weaponId],
      effectCount: effect === 'flameStream'
        ? snapshot.timedMapWeapons.flameStream.emissions
        : snapshot.timedMapWeapons.flareProjectiles.spawnCount,
      announcements: snapshot.timedMapWeapons.audit.announcements,
      currentWeapon: snapshot.player.weapon,
      ammo: snapshot.player.ammo,
      reserve: snapshot.player.reserve,
      reliableStateCommitMirrors: snapshot.networkLifecycle.reliableStateCommitMirrors,
      announcementRows: [...document.querySelectorAll<HTMLElement>('#killfeed > div')]
        .filter((row) => row.textContent?.includes(weaponId === 'flamethrower' ? 'FLAMETHROWER AVAILABLE' : 'FLARE GUN AVAILABLE'))
        .length,
    };
  }, testCase);
}

async function holdFlamethrowerUntilAdmitted(host: Page, initialEmissions: number): Promise<void> {
  await host.locator('#game').click({ position: { x: 640, y: 360 } });
  await host.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 5_000 });
  await host.mouse.down();
  try {
    await host.waitForFunction(({ baseline, totalShots }) => {
      const timed = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons;
      return timed.states.flamethrower.shotsRemaining < totalShots
        && timed.flameStream.emissions > baseline;
    }, {
      baseline: initialEmissions,
      totalShots: TIMED_MAP_WEAPON_DEFINITIONS.flamethrower.totalShots,
    }, { polling: 'raf', timeout: 8_000 });
  } finally {
    await host.mouse.up();
  }
}

for (const testCase of cases) {
  test(`${testCase.weaponId} authority converges after explicit guest rejoin without replay`, async ({ browser }) => {
    test.setTimeout(240_000);
    const [hostContext, guestContext] = await Promise.all([
      browser.newContext({ viewport: { width: 1_280, height: 720 } }),
      browser.newContext({ viewport: { width: 1_280, height: 720 } }),
    ]);
    const { host, guest, roomCode, hostId, guestId } = await startTwoPeerMatch(hostContext, guestContext, testCase);
    const definition = TIMED_MAP_WEAPON_DEFINITIONS[testCase.weaponId];

    const exact = await host.evaluate((weaponId) => (
      window.__ATOMIC_ACRES_DEBUG__.stageTimedMapWeaponMidpoint(weaponId, 'exact')
    ), testCase.weaponId);
    expect(exact).toMatchObject({ status: 'available', announcementSent: true });
    await Promise.all([host, guest].map((page) => page.waitForFunction((weaponId) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states[weaponId];
      return state.status === 'available' && state.announcementSent === true;
    }, testCase.weaponId, { timeout: 15_000 })));

    await host.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z), definition.spawnPosition);
    expect(await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop())).toBe(true);
    await Promise.all([host, guest].map((page) => page.waitForFunction(({ weaponId, hostId }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states[weaponId];
      return state.status === 'held' && state.holderId === hostId;
    }, { weaponId: testCase.weaponId, hostId }, { timeout: 15_000 })));
    await guest.waitForFunction(({ hostId, weaponId, pickup }) => {
      const remote = window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
        .find((candidate: { id: string }) => candidate.id === hostId);
      return remote?.weapon === weaponId
        && Math.hypot(remote.position[0] - pickup[0], remote.position[2] - pickup[2]) < 0.75;
    }, { hostId, weaponId: testCase.weaponId, pickup: definition.spawnPosition }, { timeout: 15_000 });
    await host.waitForTimeout(550);

    const hostEffectBaseline = (await timedEvidence(host, testCase)).effectCount;
    const guestEffectBaseline = (await timedEvidence(guest, testCase)).effectCount;
    if (testCase.weaponId === 'flamethrower') {
      await holdFlamethrowerUntilAdmitted(host, hostEffectBaseline);
      await host.waitForTimeout(250);
    } else {
      for (let shot = 1; shot <= definition.totalShots; shot += 1) {
        await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
        const expectedRemaining = definition.totalShots - shot;
        await Promise.all([host, guest].map((page) => page.waitForFunction(({ weaponId, expectedRemaining }) => (
          window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states[weaponId].shotsRemaining === expectedRemaining
        ), { weaponId: testCase.weaponId, expectedRemaining }, { timeout: 15_000 })));
        if (expectedRemaining > 0) await host.waitForTimeout(2_650);
      }
    }

    await Promise.all([host, guest].map((page) => page.waitForFunction(({ weaponId, status }) => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states[weaponId].status === status
    ), { weaponId: testCase.weaponId, status: testCase.finalStatus }, { timeout: 15_000 })));
    const beforeHost = await timedEvidence(host, testCase);
    const beforeGuest = await timedEvidence(guest, testCase);
    expect(beforeHost.state).toEqual(beforeGuest.state);
    const consumed = definition.totalShots - beforeHost.state.shotsRemaining;
    expect(consumed).toBeGreaterThan(0);
    expect(beforeHost.effectCount - hostEffectBaseline).toBe(consumed);
    expect(beforeGuest.effectCount - guestEffectBaseline).toBe(consumed);
    expect(beforeHost.announcements).toBe(1);
    expect(beforeHost.currentWeapon).toBe(testCase.weaponId);
    expect(beforeHost.ammo + beforeHost.reserve).toBe(beforeHost.state.shotsRemaining);

    await guest.reload({ waitUntil: 'domcontentloaded' });
    await assertPass66OwnedCandidatePage(guest);
    await host.waitForFunction((id) => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.find((member: { id: string }) => member.id === id)?.connected === false
    ), guestId, { timeout: 20_000 });
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
    await expect(guest.locator('#room-input')).toHaveValue(roomCode);
    await expect(guest.locator('#join')).toHaveText('REJOIN LAST MATCH');
    await expect(guest.locator('#join')).toHaveAttribute('data-rejoin-available', 'true');
    await guest.fill('#player-name', `Timed Guest ${testCase.weaponId}`);
    await guest.click('#join');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active'
        && state.privateMatch?.members.every((member: { connected: boolean }) => member.connected)
        && state.remotePlayers.length === 1;
    }, undefined, { timeout: 60_000 })));
    const rejoinedGuestId = await guest.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
        .find((member: { name: string }) => member.name.startsWith('Timed Guest'))?.id
    ));
    expect(rejoinedGuestId).toBe(guestId);

    await expect.poll(async () => (await timedEvidence(guest, testCase)).state, { timeout: 20_000 }).toEqual(beforeHost.state);
    const afterHost = await timedEvidence(host, testCase);
    const afterGuest = await timedEvidence(guest, testCase);
    expect(afterHost.state).toEqual(beforeHost.state);
    expect(afterGuest.state).toEqual(beforeHost.state);
    expect(afterHost.effectCount).toBe(beforeHost.effectCount);
    expect(afterGuest.effectCount).toBe(0);
    expect(afterHost.announcements).toBe(1);
    expect(afterGuest.announcementRows).toBeLessThanOrEqual(1);
    expect(afterHost.reliableStateCommitMirrors).toBeGreaterThan(beforeHost.reliableStateCommitMirrors);
    expect(afterGuest.state.shotsRemaining).toBe(definition.totalShots - consumed);
    expect(afterGuest.state.holderId).toBe(hostId);
    await guest.waitForTimeout(250);
    expect((await timedEvidence(host, testCase)).effectCount).toBe(afterHost.effectCount);
    expect((await timedEvidence(guest, testCase)).effectCount).toBe(0);

    await Promise.all([hostContext.close(), guestContext.close()]);
  });
}

test('an active flare repairs a rejoining guest without duplicate replicas', async ({ browser }) => {
  test.setTimeout(240_000);
  const flareCase = cases[1];
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext({ viewport: { width: 1_280, height: 720 } }),
    browser.newContext({ viewport: { width: 1_280, height: 720 } }),
  ]);
  const { host, guest, roomCode, hostId, guestId } = await startTwoPeerMatch(hostContext, guestContext, flareCase);
  const definition = TIMED_MAP_WEAPON_DEFINITIONS['flare-gun'];

  const exact = await host.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.stageTimedMapWeaponMidpoint('flare-gun', 'exact')
  ));
  expect(exact).toMatchObject({ status: 'available', announcementSent: true });
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states['flare-gun'].status === 'available'
  ), undefined, { timeout: 15_000 })));
  await host.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z), definition.spawnPosition);
  expect(await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop())).toBe(true);
  await Promise.all([host, guest].map((page) => page.waitForFunction(({ hostId }) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states['flare-gun'];
    return state.status === 'held' && state.holderId === hostId;
  }, { hostId }, { timeout: 15_000 })));

  await guest.reload({ waitUntil: 'domcontentloaded' });
  await assertPass66OwnedCandidatePage(guest);
  await host.waitForFunction((id) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
      .find((member: { id: string }) => member.id === id)?.connected === false
  ), guestId, { timeout: 20_000 });
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
  await expect(guest.locator('#room-input')).toHaveValue(roomCode);
  await expect(guest.locator('#join')).toHaveText('REJOIN LAST MATCH');
  await guest.fill('#player-name', 'Timed Guest flare-gun');
  await guest.click('#join');
  // Fire after the authenticated lobby reconnect, but before the guest has
  // rebuilt its arena and emitted the in-game join repair handshake.
  await host.waitForFunction((id) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
      .find((member: { id: string }) => member.id === id)?.connected === true
  ), guestId, { timeout: 20_000 });

  const beforeShots = await host.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states['flare-gun'].shotsRemaining
  ));
  // The downward flight from the arena's bounded high-air QA position lasts
  // several seconds before impact, then retains the canonical four-second
  // burn. This leaves a real (not duration-inflated) late-join repair window.
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 200, 2, 0, -1.5));
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
  await host.waitForFunction(({ beforeShots, hostId }) => {
    const timed = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons;
    return timed.states['flare-gun'].shotsRemaining === beforeShots - 1
      && timed.flareActiveReplicas.some((replica: { ownerId: string; authority: boolean; phase: string }) => (
        replica.ownerId === hostId && replica.authority === true && replica.phase === 'flight'
      ));
  }, { beforeShots, hostId }, { timeout: 8_000 });
  const activeBeforeGuestRejoin = await host.evaluate((hostId) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.flareActiveReplicas
      .find((replica: { ownerId: string }) => replica.ownerId === hostId)
  ), hostId);
  expect(activeBeforeGuestRejoin).toBeTruthy();
  await expect.poll(async () => host.evaluate(() => {
    const raw = localStorage.getItem('atomic-acres:host-match-checkpoint:v3');
    if (!raw) return null;
    const checkpoint = JSON.parse(raw);
    return {
      effectCount: checkpoint.flareProjectiles?.effects?.length ?? 0,
      feedbackCount: checkpoint.flareShotFeedback?.length ?? 0,
    };
  }), { timeout: 2_500, intervals: [25, 50, 100] }).toEqual({ effectCount: 1, feedbackCount: 0 });
  await host.evaluate(([x, y, z]) => (
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, 0, 0)
  ), definition.spawnPosition);

  // Match admission intentionally performs full presentation prewarm. Keep a
  // canonical flare in flight/burn while that runs; no duration is inflated.
  let firedBeforeRepair = 1;
  while (firedBeforeRepair < 5 && !(await guest.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true
  )))) {
    await host.waitForTimeout(2_650);
    if (await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true)) break;
    const expectedRemaining = beforeShots - firedBeforeRepair - 1;
    await host.evaluate(() => {
      // Reset the QA fall before each downward shot. A real terminal fall from
      // y=200 becomes lethal before the next 2.5 second flare cadence.
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 200, 2, 0, -1.5);
      window.__ATOMIC_ACRES_DEBUG__.fireOnce();
    });
    try {
      await host.waitForFunction((expectedRemaining) => (
        window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states['flare-gun'].shotsRemaining === expectedRemaining
      ), expectedRemaining, { timeout: 8_000 });
    } catch (error) {
      const diagnostic = await host.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          gameStarted: snapshot.gameStarted,
          matchPhase: snapshot.matchPhase,
          player: snapshot.player,
          timed: snapshot.timedMapWeapons,
        };
      });
      throw new Error(`Repeated active-flare shot was not admitted: ${JSON.stringify(diagnostic)}`, { cause: error });
    }
    await host.evaluate(([x, y, z]) => (
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, 0, 0)
    ), definition.spawnPosition);
    firedBeforeRepair += 1;
  }

  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.privateMatch?.members.every((member: { connected: boolean }) => member.connected)
      && state.remotePlayers.length === 1;
  }, undefined, { timeout: 60_000 })));
  expect(await guest.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
      .find((member: { name: string }) => member.name.startsWith('Timed Guest'))?.id
  ))).toBe(guestId);
  const repairReplica = await host.evaluate((hostId) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.flareActiveReplicas
      .filter((replica: { ownerId: string; authority: boolean }) => replica.ownerId === hostId && replica.authority)
      .sort((left: { remainingMs: number }, right: { remainingMs: number }) => right.remainingMs - left.remainingMs)[0]
  ), hostId);
  expect(repairReplica).toBeTruthy();
  await guest.waitForFunction(({ ownerId, actionNonce }) => {
    const timed = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons;
    const replica = timed.flareActiveReplicas
      .find((candidate: { ownerId: string; actionNonce: number }) => (
        candidate.ownerId === ownerId && candidate.actionNonce === actionNonce
      ));
    return replica?.authority === false
      && timed.flarePresentationReplication.lastAdmission?.accepted === true;
  }, {
    ownerId: repairReplica.ownerId,
    actionNonce: repairReplica.actionNonce,
  }, { timeout: 10_000 });
  const guestRepair = await guest.evaluate(() => {
    const timed = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons;
    return {
      state: timed.states['flare-gun'],
      replicas: timed.flareActiveReplicas,
      telemetry: timed.flareProjectiles,
    };
  });
  expect(guestRepair.state.shotsRemaining).toBe(beforeShots - firedBeforeRepair);
  expect(guestRepair.replicas.length).toBeGreaterThan(0);
  expect(guestRepair.replicas.every((replica: { authority: boolean }) => replica.authority === false)).toBe(true);
  expect(new Set(guestRepair.replicas.map((replica: { ownerId: string; actionNonce: number }) => (
    `${replica.ownerId}:${replica.actionNonce}`
  ))).size).toBe(guestRepair.replicas.length);
  expect(guestRepair.telemetry.replicaCreates).toBeGreaterThanOrEqual(guestRepair.replicas.length);
  expect(guestRepair.telemetry.replicaCreates).toBeLessThanOrEqual(firedBeforeRepair);
  expect(guestRepair.telemetry.active).toBe(guestRepair.replicas.length);
  const persistedActiveRepair = await host.evaluate(() => {
    const raw = localStorage.getItem('atomic-acres:host-match-checkpoint:v3');
    return raw ? JSON.parse(raw) : null;
  });
  expect(persistedActiveRepair.flareProjectiles.effects.some((effect: { ownerId: string; actionNonce: number }) => (
    effect.ownerId === repairReplica.ownerId && effect.actionNonce === repairReplica.actionNonce
  ))).toBe(true);

  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.flareActiveReplicas.length === 0
  ), undefined, { timeout: 10_000 })));
  expect(await guest.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.flareProjectiles.active
  ))).toBe(0);
  await Promise.all([hostContext.close(), guestContext.close()]);
});
