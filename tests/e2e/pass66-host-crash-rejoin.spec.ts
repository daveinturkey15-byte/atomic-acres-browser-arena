import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  assertPass66OwnedCandidatePage,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS66_HOST_RECOVERY_PEER_PORT ?? 9_066);
let peerServer: OwnedPeerServer | null = null;

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
  viewport: { width: 1_920, height: 1_080 },
});

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS66_HOST_RECOVERY_PEER_PATH);
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
    release: 'latest', renderer: 'webgl2', render: 'compat', signal: 'off', grass: 'off', mist: 'off',
    clouds: 'off', rays: 'off', renderPaused: '1', multiplayerQa: '1', peerQaPort: String(peerPort),
    peerQaPath: peerServer.path, seed,
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.map-card')].some((button) => !button.disabled));
  await page.fill('#player-name', name);
  return page;
}

async function settleCrashPrimitive(operation: Promise<unknown>, timeoutMs = 5_000): Promise<void> {
  await Promise.race([
    operation.then(() => undefined, () => undefined),
    new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs)),
  ]);
}

test('a crashed host explicitly resumes the same active room and guests plus bots converge', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Renderer-crash recovery uses the Chromium DevTools crash primitive.');
  test.setTimeout(240_000);
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext({ viewport: { width: 1_920, height: 1_080 } }),
    browser.newContext({ viewport: { width: 1_920, height: 1_080 } }),
  ]);
  let host = await openPlayer(hostContext, 'Crash Host', 'pass66-crash-host');
  let guest = await openPlayer(guestContext, 'Crash Guest', 'pass66-crash-guest');
  // The retained authority must differ from a fresh page's default kit so the
  // post-crash assertions can detect a cosmetic-only HP repair.
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipKit('marksman'));

  await host.click('#host');
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.textContent('#room-code'))!.trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ))));
  await host.locator('#lobby-bots').selectOption('2');
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active' && state.bots.length === 2;
  }, undefined, { timeout: 60_000 })));
  await host.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.teleportPlayer(8, 1.7, 4, 0.35, -0.05);
    debug.setAmmo('carbine', 17, 83);
  });
  const guestId = await host.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members.find((member: any) => member.name === 'Crash Guest')?.id
  ));
  expect(typeof guestId).toBe('string');
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-8, 1.7, 4, -0.35, 0.08));
  await expect.poll(async () => host.evaluate((id) => {
    const remote = window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.find((candidate: any) => candidate.id === id);
    return remote?.authoritativePosition ?? null;
  }, guestId)).toEqual(expect.arrayContaining([
    expect.closeTo(-8, 1), expect.closeTo(1.7, 1), expect.closeTo(4, 1),
  ]));
  // Deplete the real guest inventory through admitted gameplay transitions so
  // a fresh document's full runner kit cannot masquerade as successful repair.
  await guest.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.fireOnce();
    debug.throwGrenade();
  });
  try {
    await expect.poll(async () => guest.evaluate(() => {
      const inventory = window.__ATOMIC_ACRES_DEBUG__.snapshot().player.combatInventory;
      return { sniper: inventory.ammo.sniper, grenades: inventory.grenades };
    })).toEqual({ sniper: 4, grenades: 0 });
  } catch (error) {
    const [hostFailure, guestFailure] = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        localContinuity: state.networkSync.localContinuity,
        player: { weapon: state.player.weapon, combatInventory: state.player.combatInventory },
        remotes: state.remotePlayers.map((remote: any) => ({
          id: remote.id, weapon: remote.weapon, continuity: remote.continuity,
          combatInventory: remote.combatInventory,
        })),
        shotProtocol: state.networkSync.shotProtocol,
        lifecycle: state.networkLifecycle,
      };
    })));
    throw new Error(`Initial host-owned inventory actions did not converge: ${JSON.stringify({ host: hostFailure, guest: guestFailure })}`, { cause: error });
  }
  await guest.waitForTimeout(1_200);
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
  const stagedOrdinaryInventory = {
    ammo: { sniper: 3, 'machine-pistol': 20 },
    reserve: { sniper: 25, 'machine-pistol': 80 },
    grenades: 0,
  };
  await expect.poll(async () => host.evaluate((id) => {
    const inventory = window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
      .find((candidate: any) => candidate.id === id)?.combatInventory;
    if (!inventory) return null;
    return {
      ammo: { sniper: inventory.ammo.sniper, 'machine-pistol': inventory.ammo['machine-pistol'] },
      reserve: { sniper: inventory.reserve.sniper, 'machine-pistol': inventory.reserve['machine-pistol'] },
      grenades: inventory.grenades,
    };
  }, guestId)).toEqual(stagedOrdinaryInventory);
  const stagedGuestAuthority = await host.evaluate((id) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.stageRailgunSpawn(1);
    const railgunGranted = debug.grantRailgunToRemote(id);
    const damage = debug.damageRemoteAuthoritatively(35, id);
    return { railgunGranted, damage };
  }, guestId);
  expect(stagedGuestAuthority).toMatchObject({
    railgunGranted: true,
    damage: { targetId: guestId, storedBefore: 100, storedAfter: 65 },
  });
  await expect.poll(async () => guest.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { holderId: state.railgun.holderId, localHolder: state.railgun.localHolder, weapon: state.player.weapon };
  })).toEqual({ holderId: guestId, localHolder: true, weapon: 'railgun' });

  // The periodic checkpoint exists before the renderer is killed; the crash
  // primitive below does not run the pagehide/beforeunload safety net.
  await expect.poll(async () => host.evaluate(() => {
    const raw = localStorage.getItem('atomic-acres:host-match-checkpoint:v3');
    if (!raw) return null;
    const checkpoint = JSON.parse(raw);
    return {
      roomCode: checkpoint.roomCode,
      weapon: checkpoint.hostPlayer.weapon,
      ammo: checkpoint.hostPlayer.ammo.carbine,
      bots: checkpoint.bots.length,
      guest: checkpoint.guests.find((entry: any) => entry.snapshot.id === checkpoint.members.find((member: any) => member.name === 'Crash Guest')?.id),
      railgun: checkpoint.railgun,
      hasRawTokens: JSON.stringify(checkpoint).includes('resumeToken"'),
    };
  }), { timeout: 8_000 }).toMatchObject({
    roomCode,
    weapon: 'carbine',
    ammo: 17,
    bots: 2,
    guest: {
      snapshot: {
        id: guestId, hp: 65, primary: 'sniper', secondary: 'machine-pistol', grenade: 'smoke',
        weapon: 'railgun', stance: 'stand',
        x: expect.closeTo(-8, 1), y: expect.closeTo(1.7, 1), z: expect.closeTo(4, 1),
      },
      health: { hp: 65, alive: true },
      combatInventory: stagedOrdinaryInventory,
    },
    railgun: { status: 'held', holderId: guestId, roundsRemaining: 8 },
    hasRawTokens: false,
  });

  const before = await host.evaluate((id) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      playerId: state.privateMatch.members.find((member: any) => member.name === 'Crash Host')?.id,
      position: state.player.position,
      bots: state.bots.map((bot: any) => ({ id: bot.id, weapon: bot.weapon, hp: bot.hp, alive: bot.alive })),
      matchEpoch: state.killstreak.matchEpoch,
      guest: state.remotePlayers.find((remote: any) => remote.id === id),
      railgun: {
        generation: state.railgun.generation, revision: state.railgun.revision, status: state.railgun.status,
        holderId: state.railgun.holderId, roundsRemaining: state.railgun.roundsRemaining,
      },
    };
  }, guestId);
  const cdp = await hostContext.newCDPSession(host);
  // Chromium may terminate the renderer before acknowledging Page.crash,
  // leaving the CDP promise non-settling even though the destructive action
  // already happened. Bound only that harness acknowledgement; every recovery
  // and consensus assertion below remains fail-closed.
  await settleCrashPrimitive(cdp.send('Page.crash'));
  await settleCrashPrimitive(host.close({ runBeforeUnload: false }));

  host = await openPlayer(hostContext, 'Crash Host', 'pass66-crash-host-recovered');
  await expect(host.locator('#host')).toHaveText('RESUME HOSTED MATCH');
  await expect(host.locator('#host')).toHaveAttribute('data-recovery-available', 'true');
  await host.click('#host');

  await host.waitForFunction((expectedRoom) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && document.querySelector('#room-code')?.textContent?.trim() === expectedRoom
      && state.bots.length === 2;
  }, roomCode, { timeout: 90_000 });
  // The QA freeze is presentation-test state rather than checkpoint authority;
  // restore it before taking static score/bot consensus snapshots.
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await guest.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle.hostConnectionOpen === true
  ), undefined, { timeout: 90_000 });
  // Exercise a real guest document replacement after the host is already
  // recovered. The context retains only the authenticated room identity; all
  // player/runtime state is rebuilt from scratch.
  await guest.close({ runBeforeUnload: true });
  await host.waitForFunction((id) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members
      .find((member: any) => member.id === id)?.connected === false
  ), guestId, { timeout: 20_000 });
  guest = await openPlayer(guestContext, 'Crash Guest', 'pass66-crash-guest-reloaded');
  // Deliberately select a different fresh-document kit. The authenticated host
  // must replace it with the checkpoint's marksman loadout before accepting a
  // single state sample from this page.
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipKit('runner'));
  const rejoinHealthStage = await host.evaluate((id) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const initial = debug.snapshot();
    const remote = initial.remotePlayers.find((entry: any) => entry.id === id)
      ?? initial.retainedRemotePlayers.find((entry: any) => entry.id === id);
    if (!remote) return null;
    const targetHp = Math.min(25, Number(remote.hp));
    const damage = remote.hp > targetHp ? debug.damageRemoteAuthoritatively(remote.hp - targetHp, id) : null;
    const afterDamage = debug.snapshot();
    const staged = afterDamage.remotePlayers.find((entry: any) => entry.id === id)
      ?? afterDamage.retainedRemotePlayers.find((entry: any) => entry.id === id);
    return { hp: Number(staged?.hp), stagedAtMonoMs: performance.now(), damage };
  }, guestId);
  expect(rejoinHealthStage).not.toBeNull();
  expect(rejoinHealthStage!.hp).toBeGreaterThan(0);
  expect(rejoinHealthStage!.hp).toBeLessThanOrEqual(25);
  await guest.fill('#room-input', roomCode);
  await expect(guest.locator('#join')).toHaveAttribute('data-rejoin-available', 'true');
  await guest.click('#join');
  await expect.poll(async () => guest.evaluate((expectedRoom) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      gameStarted: state.gameStarted,
      matchPhase: state.matchPhase,
      lobbyPhase: state.privateMatch?.phase,
      roomMatches: document.querySelector('#room-hud')?.textContent?.trim() === `ROOM ${expectedRoom.slice(0, 8).toUpperCase()}`,
      allConnected: state.privateMatch?.members.every((member: any) => member.connected) ?? false,
      hostedBotCount: state.bots.length,
      remotePlayerCount: state.remotePlayers.length,
      network: state.networkLifecycle,
      authorityApplied: state.player.lastAppliedGuestResumeAuthority !== null,
      awaitingAuthority: state.player.awaitingCanonicalGuestAuthority,
    };
  }, roomCode), { timeout: 90_000 }).toMatchObject({
    gameStarted: true,
    matchPhase: 'active',
    lobbyPhase: 'active',
    roomMatches: true,
    allConnected: true,
    hostedBotCount: 2,
    remotePlayerCount: 1,
    network: { role: 'client', hostConnectionOpen: true },
    authorityApplied: true,
    awaitingAuthority: false,
  });

  const guestResumeProof = await guest.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      authority: state.player.lastAppliedGuestResumeAuthority,
      player: state.player,
      railgun: state.railgun,
    };
  });
  expect(guestResumeProof.authority).toMatchObject({
    hp: expect.any(Number),
    position: [expect.closeTo(-8, 1), expect.closeTo(1.7, 1), expect.closeTo(4, 1)],
    primary: 'sniper',
    secondary: 'machine-pistol',
    grenade: 'smoke',
    weapon: 'railgun',
    combatInventory: stagedOrdinaryInventory,
    continuity: before.guest.continuity,
  });
  expect(guestResumeProof.player).toMatchObject({
    primaryWeapon: 'sniper', secondaryWeapon: 'machine-pistol', selectedGrenade: 'smoke',
    weapon: 'railgun', combatInventory: stagedOrdinaryInventory, continuity: before.guest.continuity,
  });
  expect(guestResumeProof.railgun).toMatchObject({ holderId: guestId, localHolder: true });
  const boundedRejoinHealth = await host.evaluate(({ stagedAtMonoMs, hp }) => ({
    elapsedMs: performance.now() - stagedAtMonoMs,
    maximumLegitimateHp: Math.min(100, hp + Math.max(0, performance.now() - stagedAtMonoMs - 5_000) * 18 / 1_000),
  }), rejoinHealthStage!);
  expect(guestResumeProof.authority.hp).toBeLessThanOrEqual(boundedRejoinHealth.maximumLegitimateHp + 1);
  if (guestResumeProof.authority.hp === 100) {
    // 100 is admissible only when the host's deterministic 5 s delay + 18 HP/s
    // ledger proves enough elapsed time; a document-default reset cannot pass.
    expect(boundedRejoinHealth.maximumLegitimateHp).toBeGreaterThanOrEqual(99);
  }

  const after = await host.evaluate((id) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      capturedAtMonoMs: performance.now(),
      playerId: state.privateMatch.members.find((member: any) => member.name === 'Crash Host')?.id,
      position: state.player.position,
      ammo: state.player.ammo,
      bots: state.bots.map((bot: any) => ({ id: bot.id, weapon: bot.weapon, hp: bot.hp, alive: bot.alive })),
      matchEpoch: state.killstreak.matchEpoch,
      allConnected: state.privateMatch?.members.every((member: any) => member.connected),
      guest: state.remotePlayers.find((remote: any) => remote.id === id),
      railgun: {
        generation: state.railgun.generation, revision: state.railgun.revision, status: state.railgun.status,
        holderId: state.railgun.holderId, roundsRemaining: state.railgun.roundsRemaining,
      },
    };
  }, guestId);
  expect(after.playerId).toBe(before.playerId);
  expect(after.position[0]).toBeCloseTo(before.position[0], 1);
  expect(after.position[2]).toBeCloseTo(before.position[2], 1);
  expect(after.ammo).toBe(17);
  expect(after.bots).toEqual(before.bots);
  expect(after.matchEpoch).toBe(before.matchEpoch);
  expect(after.allConnected).toBe(true);
  expect(after.guest.primary).toBe('sniper');
  expect(after.guest.secondary).toBe('machine-pistol');
  expect(after.guest.grenade).toBe('smoke');
  expect(after.guest.weapon).toBe('railgun');
  expect(after.guest.combatInventory).toMatchObject(stagedOrdinaryInventory);
  expect(after.guest.stance).toBe(before.guest.stance);
  expect(after.guest.continuity).toBe(before.guest.continuity);
  expect(after.guest.authoritativePosition[0]).toBeCloseTo(before.guest.authoritativePosition[0], 1);
  expect(after.guest.authoritativePosition[2]).toBeCloseTo(before.guest.authoritativePosition[2], 1);
  const maximumHealthAtAfter = Math.min(
    100,
    rejoinHealthStage!.hp + Math.max(0, after.capturedAtMonoMs - rejoinHealthStage!.stagedAtMonoMs - 5_000) * 18 / 1_000,
  );
  expect(after.guest.hp).toBeGreaterThanOrEqual(rejoinHealthStage!.hp);
  expect(after.guest.hp).toBeLessThanOrEqual(maximumHealthAtAfter + 1);
  expect(after.railgun).toEqual(before.railgun);
  await expect.poll(async () => {
    const [hostHealth, guestHealth] = await Promise.all([
      host.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers.find((remote: any) => remote.id === id)?.hp, guestId),
      guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.hp),
    ]);
    return Math.abs(Number(hostHealth) - Number(guestHealth));
  }, { timeout: 20_000 }).toBeLessThanOrEqual(1);
  await expect.poll(async () => guest.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      weapon: state.player.weapon,
      primary: state.player.primaryWeapon,
      secondary: state.player.secondaryWeapon,
      grenade: state.player.selectedGrenade,
      continuity: state.player.continuity,
      combatInventory: state.player.combatInventory,
      position: state.player.position,
      railgun: {
        generation: state.railgun.generation, revision: state.railgun.revision, status: state.railgun.status,
        holderId: state.railgun.holderId, roundsRemaining: state.railgun.roundsRemaining,
      },
    };
  }), { timeout: 20_000 }).toMatchObject({
    weapon: 'railgun',
    primary: 'sniper',
    secondary: 'machine-pistol',
    grenade: 'smoke',
    continuity: before.guest.continuity,
    combatInventory: stagedOrdinaryInventory,
    position: [expect.closeTo(-8, 1), expect.closeTo(1.7, 1), expect.closeTo(4, 1)],
    railgun: after.railgun,
  });
  await expect.poll(async () => host.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle.reliableStateCommitMirrors
  ))).toBeGreaterThan(0);

  const recoveredConsensus = await host.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      room: document.querySelector('#room-hud')?.textContent?.trim(),
      arenaId: state.arenaSelection.id,
      matchPhase: state.matchPhase,
      lobbyPhase: state.privateMatch.phase,
      activeAtEpochMs: state.privateMatch.activeAtEpochMs,
      hostedBotCount: state.privateMatch.hostedBotCount,
      memberIds: state.privateMatch.members.map((member: any) => member.id).sort(),
      scores: state.privateMatch.scores
        .map((score: any) => ({ id: score.id, kills: score.kills, deaths: score.deaths }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
      bots: state.bots
        .map((bot: any) => ({ id: bot.id, weapon: bot.weapon, hp: bot.hp, alive: bot.alive }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
      matchEpoch: state.killstreak.matchEpoch,
    };
  });
  await expect.poll(async () => guest.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      room: document.querySelector('#room-hud')?.textContent?.trim(),
      arenaId: state.arenaSelection.id,
      matchPhase: state.matchPhase,
      lobbyPhase: state.privateMatch.phase,
      activeAtEpochMs: state.privateMatch.activeAtEpochMs,
      hostedBotCount: state.privateMatch.hostedBotCount,
      memberIds: state.privateMatch.members.map((member: any) => member.id).sort(),
      scores: state.privateMatch.scores
        .map((score: any) => ({ id: score.id, kills: score.kills, deaths: score.deaths }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
      bots: state.bots
        .map((bot: any) => ({ id: bot.id, weapon: bot.weapon, hp: bot.hp, alive: bot.alive }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
      matchEpoch: state.killstreak.matchEpoch,
    };
  }), { timeout: 20_000 }).toEqual(recoveredConsensus);
  await Promise.all([hostContext.close(), guestContext.close()]);
});
