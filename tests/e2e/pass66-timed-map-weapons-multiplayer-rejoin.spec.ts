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
  await guest.bringToFront();
  await expect.poll(async () => guest.evaluate(() => ({
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
  })), { intervals: [25, 50, 100] }).toEqual({ visibilityState: 'visible', hasFocus: true });
  await guest.click('#join');
  const lateAdmissionBoundary = guest.waitForFunction(() => {
    const admission = window.__ATOMIC_ACRES_DEBUG__.admissionState();
    return admission.gameStarted === false
      && admission.bootstrapStage === 'prewarming-flare-first-shot';
  }, undefined, { timeout: 60_000 });
  // Fire after the authenticated lobby reconnect, but before the guest has
  // rebuilt its arena and emitted the in-game join repair handshake.
  await host.waitForFunction((id) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
      .find((member: { id: string }) => member.id === id)?.connected === true
  ), guestId, { timeout: 20_000 });
  const hostRemoteSeqBeforeRepair = await host.evaluate((id) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
      .find((remote: { id: string }) => remote.id === id)?.seq ?? null
  ), guestId);
  expect(hostRemoteSeqBeforeRepair).not.toBeNull();

  const beforeShots = await host.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.states['flare-gun'].shotsRemaining
  ));

  // Admission duration is deliberately variable within the overall test, so
  // do not guess when a previously fired five-second flare remains alive. Wait
  // for the final named prewarm boundary, then stage one real host-authority
  // shot and bind every repair assertion to its exact nonce.
  await lateAdmissionBoundary;
  const priorHostFlareNonces = await host.evaluate((ownerId) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.flareActiveReplicas
      .filter((replica: { ownerId: string; authority: boolean }) => (
        replica.ownerId === ownerId && replica.authority === true
      ))
      .map((replica: { actionNonce: number }) => replica.actionNonce)
  ), hostId);
  const broadcastBeforeLateShot = await host.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.flarePresentationReplication.lastBroadcastAt
  ));
  await host.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 200, 2, 0, -1.5);
    window.__ATOMIC_ACRES_DEBUG__.fireOnce();
  });
  const firedBeforeRepair = 1;
  const expectedRemaining = beforeShots - firedBeforeRepair;
  await host.waitForFunction(({ expectedRemaining, hostId, priorNonces }) => {
    const timed = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons;
    return timed.states['flare-gun'].shotsRemaining === expectedRemaining
      && timed.flareActiveReplicas.some((replica: {
        ownerId: string; authority: boolean; actionNonce: number; remainingMs: number;
      }) => replica.ownerId === hostId && replica.authority === true
        && !priorNonces.includes(replica.actionNonce) && replica.remainingMs > 0);
  }, { expectedRemaining, hostId, priorNonces: priorHostFlareNonces }, { timeout: 8_000 });
  const repairSource = await host.evaluate(({ hostId, priorNonces }) => {
    const timed = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons;
    const replica = timed.flareActiveReplicas.find((candidate: {
      ownerId: string; authority: boolean; actionNonce: number;
    }) => candidate.ownerId === hostId && candidate.authority === true
      && !priorNonces.includes(candidate.actionNonce));
    return {
      replica,
      broadcastAt: timed.flarePresentationReplication.lastBroadcastAt,
      shotsRemaining: timed.states['flare-gun'].shotsRemaining,
    };
  }, { hostId, priorNonces: priorHostFlareNonces });
  expect(repairSource.replica).toBeTruthy();
  expect(repairSource.replica.remainingMs).toBeGreaterThan(3_500);
  expect(repairSource.broadcastAt).toBeGreaterThan(broadcastBeforeLateShot);
  expect(repairSource.shotsRemaining).toBe(expectedRemaining);
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

  try {
    await guest.waitForFunction(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true
    ), undefined, { timeout: 60_000 });
    const liveAtWorldRepair = await host.evaluate(({ ownerId, actionNonce }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        replica: snapshot.timedMapWeapons.flareActiveReplicas.find((candidate: {
          ownerId: string; authority: boolean; actionNonce: number;
        }) => candidate.ownerId === ownerId && candidate.authority === true
          && candidate.actionNonce === actionNonce) ?? null,
        replication: snapshot.timedMapWeapons.flarePresentationReplication,
      };
    }, { ownerId: hostId, actionNonce: repairSource.replica.actionNonce });
    expect(liveAtWorldRepair.replica, 'selected host flare remains live across world-ready repair').toBeTruthy();
    expect(liveAtWorldRepair.replica.remainingMs).toBeGreaterThan(0);
    await host.waitForFunction(({ ownerId, actionNonce, priorBroadcastAt }) => {
      const timed = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons;
      return timed.flarePresentationReplication.lastBroadcastAt > priorBroadcastAt
        && timed.flareActiveReplicas.some((candidate: {
          ownerId: string; authority: boolean; actionNonce: number; remainingMs: number;
        }) => candidate.ownerId === ownerId && candidate.authority === true
          && candidate.actionNonce === actionNonce && candidate.remainingMs > 0);
    }, {
      ownerId: hostId,
      actionNonce: repairSource.replica.actionNonce,
      priorBroadcastAt: repairSource.broadcastAt,
    }, { timeout: 15_000 });

    await guest.waitForFunction(({ ownerId, actionNonce }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const timed = snapshot.timedMapWeapons;
      return timed.flareActiveReplicas.some((candidate: {
        ownerId: string; authority: boolean; actionNonce: number;
      }) => candidate.ownerId === ownerId && candidate.authority === false
        && candidate.actionNonce === actionNonce)
        && timed.flarePresentationReplication.lastAdmission?.accepted === true
        && snapshot.player.awaitingCanonicalGuestAuthority === false
        && snapshot.player.lastAppliedGuestResumeAuthority !== null;
    }, { ownerId: hostId, actionNonce: repairSource.replica.actionNonce }, { timeout: 15_000 });
    // The guest emits its ACK before a fresh state commit on the same ordered
    // event lane, while the host rejects replacement state until that ACK.
    // A later remote sequence therefore proves the host accepted the ACK.
    await host.waitForFunction(({ guestId, priorSeq }) => {
      const remote = window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
        .find((candidate: { id: string }) => candidate.id === guestId);
      return remote !== undefined && remote.seq > priorSeq;
    }, { guestId, priorSeq: hostRemoteSeqBeforeRepair }, { timeout: 15_000 });
  } catch (error) {
    const [hostDiagnostic, guestDiagnostic] = await Promise.all([
      host.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          admission: window.__ATOMIC_ACRES_DEBUG__.admissionState(),
          flares: snapshot.timedMapWeapons.flareActiveReplicas,
          replication: snapshot.timedMapWeapons.flarePresentationReplication,
          network: snapshot.networkLifecycle,
          remotes: snapshot.remotePlayers.map((remote: { id: string; seq: number }) => ({
            id: remote.id, seq: remote.seq,
          })),
        };
      }),
      guest.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          admission: window.__ATOMIC_ACRES_DEBUG__.admissionState(),
          flares: snapshot.timedMapWeapons.flareActiveReplicas,
          replication: snapshot.timedMapWeapons.flarePresentationReplication,
          network: snapshot.networkLifecycle,
          resume: {
            awaitingCanonicalGuestAuthority: snapshot.player.awaitingCanonicalGuestAuthority,
            lastAppliedGuestResumeAuthority: snapshot.player.lastAppliedGuestResumeAuthority,
          },
        };
      }),
    ]);
    throw new Error(`Nonce-bound flare repair boundary failed: ${JSON.stringify({
      expected: { ownerId: hostId, actionNonce: repairSource.replica.actionNonce },
      host: hostDiagnostic,
      guest: guestDiagnostic,
    })}`, { cause: error });
  }
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
  const repairReplica = guestRepair.replicas
    .filter((replica: { ownerId: string; authority: boolean }) => (
      replica.ownerId === hostId && replica.authority === false
        && replica.actionNonce === repairSource.replica.actionNonce
    ))
    .sort((left: { remainingMs: number }, right: { remainingMs: number }) => right.remainingMs - left.remainingMs)[0];
  expect(repairReplica).toBeTruthy();
  const persistedActiveRepair = await host.evaluate(() => {
    const raw = localStorage.getItem('atomic-acres:host-match-checkpoint:v3');
    return raw ? JSON.parse(raw) : null;
  });
  expect(persistedActiveRepair.flareProjectiles.effects.some((effect: { ownerId: string; actionNonce: number }) => (
    effect.ownerId === repairReplica.ownerId && effect.actionNonce === repairReplica.actionNonce
  ))).toBe(true);

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

  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.flareActiveReplicas.length === 0
  ), undefined, { timeout: 10_000 })));
  expect(await guest.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons.flareProjectiles.active
  ))).toBe(0);
  await Promise.all([hostContext.close(), guestContext.close()]);
});
