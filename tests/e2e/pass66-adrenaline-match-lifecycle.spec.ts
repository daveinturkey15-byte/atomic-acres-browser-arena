import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  assertPass66OwnedCandidatePage,
  attachBrowserDiagnostics,
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS66_ADRENALINE_PEER_PORT ?? 9_067);
const renderer = process.env.PASS66_ADRENALINE_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const renderProfile = process.env.PASS66_ADRENALINE_RENDER_PROFILE ?? (renderer === 'webgpu' ? 'blender' : 'compat');
const adrenalineLoadout = Object.freeze({
  schemaVersion: 1,
  slots: ['adrenaline', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});
let peerServer: OwnedPeerServer | null = null;

test.use({
  launchOptions: {
    args: [
      '--enable-unsafe-webgpu',
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
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS66_ADRENALINE_PEER_PATH);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(
  context: BrowserContext,
  name: string,
  seed: string,
  diagnostics: BrowserDiagnostics,
  label: string,
): Promise<Page> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const page = await context.newPage();
  attachBrowserDiagnostics(page, label, diagnostics);
  const url = new URL(test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer, render: renderProfile, requireWebGPU: renderer === 'webgpu' ? '1' : '0',
    externalServices: 'off', signal: 'off', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    multiplayerQa: '1', peerQaPort: String(peerPort), peerQaPath: peerServer.path, map: 'atomic-acres', seed,
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true
      && state.bootstrap.stage === 'ready'
      && document.querySelector<HTMLButtonElement>('#host')?.disabled === false;
  }, undefined, { timeout: renderer === 'webgpu' ? 90_000 : 45_000 });
  await page.locator('#player-name').fill(name);
  return page;
}

function actorTimers(state: any): Array<{ actorId: string; adrenalineRemainingMs: number }> {
  return state.killstreak.actors
    .map((actor: any) => ({ actorId: actor.actorId, adrenalineRemainingMs: actor.adrenalineRemainingMs }))
    .sort((left: any, right: any) => left.actorId.localeCompare(right.actorId));
}

async function baseAdrenalineState(page: Page): Promise<any> {
  return page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      gameStarted: state.gameStarted,
      matchPhase: state.matchPhase,
      lobbyPhase: state.privateMatch?.phase ?? null,
      epoch: state.adrenalineRuntime.matchEpoch,
      remainingMs: state.adrenalineRuntime.remainingMs,
      modifiers: state.adrenalineRuntime.modifiers,
      hud: state.adrenalineRuntime.hud,
      actorTimers: state.killstreak.actors
        .map((actor: any) => ({ actorId: actor.actorId, adrenalineRemainingMs: actor.adrenalineRemainingMs }))
        .sort((left: any, right: any) => left.actorId.localeCompare(right.actorId)),
      memberIds: state.privateMatch?.members.map((member: any) => member.id).sort() ?? [],
      allConnected: state.privateMatch?.members.every((member: any) => member.connected) ?? false,
      hostConnectionOpen: state.networkLifecycle.hostConnectionOpen,
    };
  });
}

async function settleCrashPrimitive<T>(operation: Promise<T>, timeoutMs = 5_000): Promise<T | null> {
  return Promise.race([
    operation,
    new Promise<null>((resolveTimeout) => setTimeout(() => resolveTimeout(null), timeoutMs)),
  ]);
}

test('Adrenaline ends at the round boundary and cannot resurrect through lobby, rematch, or crash rejoin', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'The renderer-crash primitive and two-peer lifecycle proof are Chromium-only.');
  test.setTimeout(renderer === 'webgpu' ? 420_000 : 300_000);

  // Each peer owns an isolated origin-storage and renderer lifecycle. Sharing
  // one BrowserContext would make lobby credentials overwrite each other and
  // could let the deliberate guest renderer crash take the host down too.
  const hostContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 }, deviceScaleFactor: 1 });
  const guestContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 }, deviceScaleFactor: 1 });
  try {
    await Promise.all([hostContext, guestContext].map((context) => context.addInitScript((loadout) => {
      try { localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(loadout)); } catch { /* about:blank */ }
    }, adrenalineLoadout)));
    const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
    const host = await openPlayer(hostContext, 'Adrenaline Host', 'pass66-adrenaline-host', diagnostics, 'host bootstrap/runtime');
    let guest = await openPlayer(guestContext, 'Adrenaline Guest', 'pass66-adrenaline-guest', diagnostics, 'guest bootstrap/runtime');

  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.locator('#room-code').textContent())!.trim();
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ))));
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active' && state.killstreak.actors.length === 2;
  }, undefined, { timeout: renderer === 'webgpu' ? 120_000 : 60_000 })));

  const firstEpoch = (await baseAdrenalineState(host)).epoch;
  expect((await baseAdrenalineState(guest)).epoch).toBe(firstEpoch);
  const hostId = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().adrenalineRuntime.actorId);
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(3));
  expect(await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('adrenaline'))).toBe(true);
  await expect.poll(async () => (await baseAdrenalineState(host)).remainingMs).toBeGreaterThan(12_000);
  await expect.poll(async () => {
    const state = await baseAdrenalineState(guest);
    return state.actorTimers.find((actor: any) => actor.actorId === hostId)?.adrenalineRemainingMs ?? 0;
  }).toBeGreaterThan(11_000);

  const hostBoosted = await baseAdrenalineState(host);
  expect(hostBoosted).toMatchObject({
    gameStarted: true,
    matchPhase: 'active',
    lobbyPhase: 'active',
    modifiers: { damage: 1.1, movement: 1.1, reloadDuration: 0.9 },
    hud: { hidden: false, audioActive: true },
  });
  expect(Number(hostBoosted.hud.timeText)).toBeGreaterThan(11);
  const guestWhileHostBoosted = await baseAdrenalineState(guest);
  expect(guestWhileHostBoosted).toMatchObject({
    modifiers: { damage: 1, movement: 1, reloadDuration: 1 },
    hud: { hidden: true, audioActive: false },
  });

  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.endMatch());
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'ended'
      && window.__ATOMIC_ACRES_DEBUG__.snapshot().adrenalineRuntime.remainingMs === 0
      && window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors
        .every((actor: any) => actor.adrenalineRemainingMs === 0)
  ))));
  for (const page of [host, guest]) {
    const ended = await baseAdrenalineState(page);
    expect(ended).toMatchObject({
      gameStarted: true,
      matchPhase: 'ended',
      modifiers: { damage: 1, movement: 1, reloadDuration: 1 },
      hud: { hidden: true, audioActive: false },
    });
    expect(ended.remainingMs).toBe(0);
    expect(ended.actorTimers.every((actor: any) => actor.adrenalineRemainingMs === 0)).toBe(true);
  }

  await expect(host.locator('#rematch')).toHaveText('RETURN EVERYONE TO LOBBY');
  await host.locator('#rematch').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return !state.gameStarted && state.privateMatch?.phase === 'waiting';
  })));
  const hostLobby = await baseAdrenalineState(host);
  const guestLobby = await baseAdrenalineState(guest);
  for (const lobby of [hostLobby, guestLobby]) {
    expect(lobby).toMatchObject({
      gameStarted: false,
      lobbyPhase: 'waiting',
      remainingMs: 0,
      modifiers: { damage: 1, movement: 1, reloadDuration: 1 },
      hud: { hidden: true, audioActive: false },
      allConnected: true,
    });
    expect(lobby.actorTimers.every((actor: any) => actor.adrenalineRemainingMs === 0)).toBe(true);
  }
  expect(guestLobby.memberIds).toEqual(hostLobby.memberIds);

  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  try {
    await Promise.all([host, guest].map((page) => page.waitForFunction((priorEpoch) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active'
        && state.adrenalineRuntime.matchEpoch !== priorEpoch
        && state.killstreak.actors.length === 2;
    }, firstEpoch, { timeout: renderer === 'webgpu' ? 120_000 : 60_000 })));
  } catch (error) {
    const [hostFailure, guestFailure] = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        admission: window.__ATOMIC_ACRES_DEBUG__.admissionState(),
        epoch: state.adrenalineRuntime.matchEpoch,
        lobby: state.privateMatch,
        localContinuity: state.networkSync.localContinuity,
        actors: state.killstreak.actors.map((actor: any) => ({ actorId: actor.actorId, lifeId: actor.lifeId })),
        remotes: state.remotePlayers.map((remote: any) => ({ id: remote.id, continuity: remote.continuity, seq: remote.seq })),
        network: state.networkLifecycle,
      };
    })));
    throw new Error(`Rematch authority did not converge: ${JSON.stringify({ host: hostFailure, guest: guestFailure })}`, { cause: error });
  }
  const rematchHost = await baseAdrenalineState(host);
  const rematchGuest = await baseAdrenalineState(guest);
  expect(rematchHost.epoch).not.toBe(firstEpoch);
  expect(rematchGuest.epoch).toBe(rematchHost.epoch);
  for (const state of [rematchHost, rematchGuest]) {
    expect(state).toMatchObject({
      gameStarted: true,
      matchPhase: 'active',
      lobbyPhase: 'active',
      remainingMs: 0,
      modifiers: { damage: 1, movement: 1, reloadDuration: 1 },
      hud: { hidden: true, audioActive: false },
    });
    expect(state.actorTimers.every((actor: any) => actor.adrenalineRemainingMs === 0)).toBe(true);
  }

  const crashedGuest = guest;
  const guestId = await crashedGuest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().adrenalineRuntime.actorId);
  expect(await readPersistedClientRuntimeLog(crashedGuest)).toEqual([]);
  const cdp = await guestContext.newCDPSession(crashedGuest);
  const rendererCrashEvent = crashedGuest.waitForEvent('crash', { timeout: 15_000 });
  const crashCommandOutcome = cdp.send('Page.crash').then(
    () => ({ status: 'resolved' as const, message: '' }),
    (error: unknown) => ({ status: 'rejected' as const, message: error instanceof Error ? error.message : String(error) }),
  );
  expect(await rendererCrashEvent).toBe(crashedGuest);
  const crashOutcome = await settleCrashPrimitive(crashCommandOutcome);
  if (crashOutcome?.status === 'rejected') expect(crashOutcome.message).toMatch(/crash|closed|target/i);
  await host.waitForFunction((id) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members
      .some((member: any) => member.id === id && !member.connected)
  ), guestId, { timeout: 20_000 });

  guest = await openPlayer(
    guestContext,
    'Adrenaline Guest',
    'pass66-adrenaline-guest-rejoin',
    diagnostics,
    'rejoined guest bootstrap/runtime',
  );
  await expect(guest.locator('#join')).toHaveText('REJOIN LAST MATCH');
  await expect(guest.locator('#join')).toHaveAttribute('data-rejoin-available', 'true');
  await guest.locator('#join').click();
  await guest.waitForFunction((expectedEpoch) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.adrenalineRuntime.matchEpoch === expectedEpoch
      && state.networkLifecycle.hostConnectionOpen === true;
  }, rematchHost.epoch, { timeout: 90_000 });
  await host.waitForFunction((id) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members
      .some((member: any) => member.id === id && member.connected)
  ), guestId, { timeout: 60_000 });

  const rejoined = await baseAdrenalineState(guest);
  expect(rejoined).toMatchObject({
    gameStarted: true,
    matchPhase: 'active',
    lobbyPhase: 'active',
    epoch: rematchHost.epoch,
    remainingMs: 0,
    modifiers: { damage: 1, movement: 1, reloadDuration: 1 },
    hud: { hidden: true, audioActive: false },
    allConnected: true,
    hostConnectionOpen: true,
  });
  expect(await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().adrenalineRuntime.actorId)).toBe(guestId);
  expect(rejoined.actorTimers.every((actor: any) => actor.adrenalineRemainingMs === 0)).toBe(true);
  expect(actorTimers(await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot())))
    .toEqual(rejoined.actorTimers);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(await readPersistedClientRuntimeLog(host)).toEqual([]);
  } finally {
    await Promise.allSettled([hostContext.close(), guestContext.close()]);
  }
});
