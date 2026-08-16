import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  CHOPPER_GUNNER_SPLASH_POLICY,
  CHOPPER_GUN_PROFILE,
} from '../../src/killstreak-support-catalog';
import { LOCAL_MULTIPLAYER_QA_HOST_DAMAGE_RESULT_EVENT } from '../../src/network';
import {
  attachBrowserDiagnostics,
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const enabled = process.env.PASS71_HF307_CHOPPER_MG_EVIDENCE === '1';
const renderer = process.env.PASS71_HF307_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const arena = process.env.PASS71_HF307_ARENA ?? 'atomic-acres';
const expectedSourceSha = process.env.PASS71_HF307_EXPECTED_SOURCE_SHA ?? '';
const componentPath = process.env.PASS71_HF307_COMPONENT_PATH ?? '';
const edgeExecutable = process.env.PASS71_HF307_EDGE_EXECUTABLE ?? '';
const peerPort = Number(process.env.PASS71_HF307_PEER_PORT ?? '4697');
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

let peerServer: OwnedPeerServer | null = null;

if (enabled && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha)
  || componentPath === '' || edgeExecutable === '' || process.env.QA_INSTALLED_EDGE !== '1')) {
  throw new Error('Official HF-307 evidence requires exact candidate A, an exact installed Edge executable, and an owned component path');
}

test.skip(!enabled, 'Run through the owned HF-307 exact-candidate-A evidence runner.');
test.describe.configure({ mode: 'serial' });
test.use({
  viewport: { width: 1_280, height: 720 },
  deviceScaleFactor: 1,
  launchOptions: {
    ...(edgeExecutable ? { executablePath: edgeExecutable } : {}),
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  },
});

function candidateUrl(seed: string): string {
  const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
  const url = new URL('/channels/the-big-one/', baseUrl);
  for (const [key, value] of Object.entries({
    release: 'latest',
    map: arena,
    renderer,
    requireWebGPU: renderer === 'webgpu' ? '1' : undefined,
    render: 'performance',
    signal: 'on',
    grass: 'off',
    mist: 'off',
    clouds: 'off',
    rays: 'off',
    externalServices: 'off',
    multiplayerQa: '1',
    peerQaPort: String(peerPort),
    peerQaPath: peerServer?.path,
    previewTime: '0',
    seed,
  })) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

async function openCandidate(
  context: BrowserContext,
  name: string,
  seed: string,
  diagnostics: BrowserDiagnostics,
): Promise<Page> {
  await context.addInitScript(({ storedLoadout, hostDamageResultEvent }) => {
    try {
      localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
      localStorage.removeItem('atomic-acres:client-runtime-log:v1');
    } catch { /* about:blank */ }
    (globalThis as any).__PASS71_HF307_INPUTS__ = [];
    (globalThis as any).__PASS71_HF307_GUEST_HOST_DAMAGE_RESULTS__ = [];
    window.addEventListener(hostDamageResultEvent, (event) => {
      (globalThis as any).__PASS71_HF307_GUEST_HOST_DAMAGE_RESULTS__.push((event as CustomEvent).detail);
    });
    for (const type of ['mousedown', 'mouseup'] as const) {
      window.addEventListener(type, (event) => {
        (globalThis as any).__PASS71_HF307_INPUTS__.push({
          type: event.type,
          button: event.button,
          trusted: event.isTrusted,
        });
      }, { capture: true });
    }
  }, { storedLoadout: loadout, hostDamageResultEvent: LOCAL_MULTIPLAYER_QA_HOST_DAMAGE_RESULT_EVENT });
  const page = await context.newPage();
  attachBrowserDiagnostics(page, name, diagnostics);
  await page.goto(candidateUrl(seed), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(({ expectedArena, expectedRenderer }) => {
    const snapshot = (window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any);
    return snapshot?.bootstrap?.stage === 'ready'
      && snapshot.weaponReady === true
      && snapshot.arenaSelection.id === expectedArena
      && snapshot.render.runtime.actualBackend === expectedRenderer
      && document.querySelector<HTMLButtonElement>('#host')?.disabled === false;
  }, { expectedArena: arena, expectedRenderer: renderer }, { timeout: 120_000 });
  await page.locator('#player-name').fill(name);
  return page;
}

async function ensurePointerLock(page: Page): Promise<void> {
  if (await page.evaluate(() => document.pointerLockElement === document.querySelector('#game'))) return;
  const bounds = await page.locator('#game').boundingBox();
  if (!bounds) throw new Error('HF-307 game canvas has no trusted-input bounds');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 8_000 });
}

async function servedCandidate(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HF-307 candidate provenance HTTP ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return Object.fromEntries([
      'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
    ].map((key) => [key, value[key]]));
  });
}

async function botHealth(page: Page, targetIds: readonly string[]): Promise<number[]> {
  return page.evaluate((ids) => {
    const bots = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots;
    return ids.map((id) => bots.find((bot: any) => bot.id === id)?.hp ?? Number.NaN);
  }, targetIds);
}

test(`${renderer}: hosted owner LMB emits one exact 3x LOS-bounded result per hostile`, async ({ browser }) => {
  test.setTimeout(240_000);
  expect(arena).toBe('atomic-acres');
  expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
  expect(componentPath.length).toBeGreaterThan(0);
  const checkoutSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
  }).trim();
  expect(checkoutSourceSha).toBe(expectedSourceSha);
  const browserCdp = await browser.newBrowserCDPSession();
  const browserCommandLine = await browserCdp.send('Browser.getBrowserCommandLine');
  await browserCdp.detach();
  const launchedExecutablePath = resolve(browserCommandLine.arguments[0] ?? '').replaceAll('\\', '/');
  expect(launchedExecutablePath).toBe(resolve(edgeExecutable).replaceAll('\\', '/'));
  if (!peerServer) throw new Error('HF-307 owned PeerJS server is unavailable');

  const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
  const hostContext = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  const guestContext = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  let leftMouseDown = false;
  try {
    const [host, guest] = await Promise.all([
      openCandidate(hostContext, 'HF307 Host', `pass71-hf307-${renderer}-host`, diagnostics),
      openCandidate(guestContext, 'HF307 Guest', `pass71-hf307-${renderer}-guest`, diagnostics),
    ]);
    await host.locator('#team').selectOption('0');
    await guest.locator('#team').selectOption('1');
    await host.locator('#host').click();
    await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()), undefined, { timeout: 30_000 });
    const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
    expect(roomCode.length).toBeGreaterThan(0);
    await guest.locator('#room-input').fill(roomCode);
    await guest.locator('#join').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).privateMatch?.members.length === 2
    ), undefined, { timeout: 30_000 })));
    await host.locator('#lobby-bots').selectOption('2');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).privateMatch?.hostedBotCount === 2
    ), undefined, { timeout: 15_000 })));
    await host.locator('#lobby-ready').click();
    await guest.locator('#lobby-ready').click();
    await expect(host.locator('#lobby-start')).toBeEnabled();
    await host.locator('#lobby-start').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction((expectedArena) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      return snapshot.gameStarted === true
        && snapshot.matchPhase === 'active'
        && snapshot.arenaSelection.id === expectedArena
        && snapshot.remotePlayers.length === 1
        && snapshot.bots.length === 2
        && snapshot.killstreak.actors.length === 2
        && snapshot.privateMatch.members.every((member: any) => member.connected === true);
    }, arena, { timeout: 90_000 })));
    await host.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const support = snapshot.supportVehiclePresentation;
      return support?.state === 'ready'
        && support.requiredAssets.length > 0
        && support.requiredAssets.length === support.loadedAssets.length
        && support.requiredAssets.every((asset: string) => support.loadedAssets.includes(asset))
        && support.readyFamilies.includes('chopper')
        && Object.keys(support.failures).length === 0;
    }, undefined, { timeout: 90_000 });

    await host.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.earnSupport(15);
    });
    expect(await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper'))).toBe(true);
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
        .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting')
    ), undefined, { timeout: 30_000 })));
    expect(await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
    await host.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'chopper-gunner');

    const possessed = await host.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const actor = snapshot.killstreak.actors.find((candidate: any) => candidate.actorId === snapshot.player.id);
      const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === actor?.possession?.entityId);
      return { ownerId: snapshot.player.id, matchEpoch: snapshot.killstreak.matchEpoch, entity };
    });
    expect(possessed.entity).toMatchObject({ kind: 'chopper', ownerId: possessed.ownerId, gunController: 'owner-player' });
    await guest.waitForFunction(({ entityId, ownerId, activationId }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === entityId);
      return entity?.ownerId === ownerId && entity.activationId === activationId && entity.gunController === 'owner-player';
    }, { entityId: possessed.entity.id, ownerId: possessed.ownerId, activationId: possessed.entity.activationId }, { timeout: 15_000 });

    const guestIdentity = await guest.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).player.id as string);
    const guestApiAccepted = await guest.evaluate((entityId) => (
      window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl(entityId)
    ), possessed.entity.id);
    expect(guestApiAccepted).toBe(false);
    const hostAfterGuestAttempt = await host.evaluate((entityId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      return snapshot.killstreak.entities.find((candidate: any) => candidate.id === entityId);
    }, possessed.entity.id);
    expect(hostAfterGuestAttempt).toMatchObject({
      ownerId: possessed.ownerId,
      activationId: possessed.entity.activationId,
      gunController: 'owner-player',
    });

    await ensurePointerLock(host);
    const staged = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stagePossessedChopperSplashTargets());
    expect(staged).not.toBeNull();
    if (!staged) throw new Error('HF-307 could not stage two authoritative hostile bots');
    expect(staged.splashRadiusM).toBe(CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM);
    expect(staged.separationM).toBeGreaterThan(2.8);
    expect(staged.separationM).toBeLessThan(CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM);
    const targetIds = [staged.primaryTargetId, staged.splashTargetId] as const;
    const aim = await host.evaluate((targetId) => (
      window.__ATOMIC_ACRES_DEBUG__.aimPossessedChopperAtTarget(targetId)
    ), staged.primaryTargetId);
    expect(aim).toMatchObject({
      entityId: staged.entityId,
      activationId: staged.activationId,
      targetId: staged.primaryTargetId,
      lineOfSight: true,
    });
    if (!aim) throw new Error('HF-307 exact staged target lost host LOS');

    await guest.waitForFunction(({ ids, positions }) => {
      const bots = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots;
      return ids.every((id: string, index: number) => {
        const bot = bots.find((candidate: any) => candidate.id === id);
        return bot?.hp === 100 && bot.alive === true
          && Math.hypot(...bot.position.map((value: number, axis: number) => value - positions[index][axis])) < 0.01;
      });
    }, { ids: targetIds, positions: [staged.primaryPosition, staged.splashPosition] }, { timeout: 15_000 });
    const hostBotHealthBefore = await botHealth(host, targetIds);
    expect(hostBotHealthBefore).toEqual([100, 100]);
    const startedAtMs = await host.evaluate(() => performance.now());

    await host.mouse.down({ button: 'left' });
    leftMouseDown = true;
    let receipt: any = null;
    for (let attempt = 0; attempt < 8 && receipt === null; attempt += 1) {
      expect(await host.evaluate((targetId) => (
        window.__ATOMIC_ACRES_DEBUG__.aimPossessedChopperAtTarget(targetId)
      ), staged.primaryTargetId)).toMatchObject({ lineOfSight: true });
      await host.waitForTimeout(20);
      receipt = await host.evaluate(({ ids, activationId, afterMs }) => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
        const samples = snapshot.supportDamageFeedback.recent.filter((sample: any) => (
          sample.source === 'chopper'
            && sample.activationId === activationId
            && sample.atMs >= afterMs
            && ids.includes(sample.targetId)
        ));
        const primary = samples.find((sample: any) => sample.targetId === ids[0]);
        const splash = samples.find((sample: any) => sample.targetId === ids[1]);
        if (!primary || !splash) return null;
        const completeShotSamples = samples.filter((sample: any) => sample.atMs === primary.atMs);
        const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === snapshot.killstreak.actors
          .find((actor: any) => actor.actorId === snapshot.player.id)?.possession?.entityId);
        return {
          samples: completeShotSamples,
          entity,
          controlAdmission: snapshot.killstreakControlAdmission,
          triggerHeld: snapshot.textChat.triggerHeld,
        };
      }, { ids: targetIds, activationId: staged.activationId, afterMs: startedAtMs });
    }
    await host.mouse.up({ button: 'left' });
    leftMouseDown = false;
    const completedAtMs = await host.evaluate(() => performance.now());
    const completeHostCapture = await host.evaluate(({ ids, activationId, afterMs }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      return snapshot.supportDamageFeedback.recent.filter((sample: any) => (
        sample.source === 'chopper'
          && sample.activationId === activationId
          && sample.atMs >= afterMs
          && ids.includes(sample.targetId)
      ));
    }, { ids: targetIds, activationId: staged.activationId, afterMs: startedAtMs });
    expect(receipt).not.toBeNull();
    expect(completedAtMs - startedAtMs).toBeLessThan(CHOPPER_GUN_PROFILE.cadenceMs);
    expect(completeHostCapture.map((sample: any) => sample.targetId)).toEqual(targetIds);
    expect(completeHostCapture).toHaveLength(2);
    expect(new Set(completeHostCapture.map((sample: any) => sample.atMs)).size).toBe(1);
    expect(receipt.triggerHeld).toBe(true);
    expect(receipt.entity).toMatchObject({ ownerId: possessed.ownerId, gunController: 'owner-player' });
    expect(receipt.controlAdmission).toMatchObject({ action: 'pilot-control', fire: true, accepted: true });
    expect(receipt.samples).toEqual(completeHostCapture);
    expect(new Set(completeHostCapture.map((sample: any) => sample.resultId)).size).toBe(2);
    expect(completeHostCapture[0].damage).toBeGreaterThan(completeHostCapture[1].damage);
    expect(completeHostCapture[1].damage).toBeGreaterThan(0);
    expect(await host.evaluate(() => (globalThis as any).__PASS71_HF307_INPUTS__
      .some((event: any) => event.type === 'mousedown' && event.button === 0 && event.trusted === true))).toBe(true);

    const hostBotHealthAfter = await botHealth(host, targetIds);
    const guestTransportQuery = {
      hostId: possessed.ownerId,
      matchEpoch: possessed.matchEpoch,
      activationId: staged.activationId,
      atMs: completeHostCapture[0].atMs,
    };
    const readGuestTransport = () => guest.evaluate((query) => {
      const messages = ((globalThis as any).__PASS71_HF307_GUEST_HOST_DAMAGE_RESULTS__ as any[])
        .filter((message) => message.by === query.hostId && message.matchEpoch === query.matchEpoch)
        .filter((message) => message.events.some((event: any) => (
          event.source === 'chopper' && event.activationId === query.activationId && event.atMs === query.atMs
        )));
      const events = messages.flatMap((message) => message.events).filter((event: any) => (
        event.source === 'chopper' && event.activationId === query.activationId && event.atMs === query.atMs
      ));
      return {
        hostId: messages[0]?.by ?? null,
        matchEpoch: messages[0]?.matchEpoch ?? null,
        messageCount: messages.length,
        nonces: messages.map((message) => message.nonce),
        targetIds: events.map((event: any) => event.targetId),
        resultIds: events.map((event: any) => event.resultId),
        resultCount: events.length,
        uniqueTargetCount: new Set(events.map((event: any) => event.targetId)).size,
        uniqueResultCount: new Set(events.map((event: any) => event.resultId)).size,
      };
    }, guestTransportQuery);
    await expect.poll(async () => (await readGuestTransport()).resultCount, {
      timeout: 15_000,
      intervals: [25, 50, 100],
    }).toBeGreaterThanOrEqual(2);
    const guestTransport = await readGuestTransport();
    expect(guestTransport).toEqual({
      hostId: possessed.ownerId,
      matchEpoch: possessed.matchEpoch,
      messageCount: 1,
      nonces: [expect.any(Number)],
      targetIds,
      resultIds: completeHostCapture.map((sample: any) => sample.resultId),
      resultCount: 2,
      uniqueTargetCount: 2,
      uniqueResultCount: 2,
    });
    await expect.poll(async () => botHealth(guest, targetIds), {
      timeout: 15_000,
      intervals: [25, 50, 100],
    }).toEqual(hostBotHealthAfter);
    const guestBotHealthAfter = await botHealth(guest, targetIds);
    const [hostSnapshot, guestSnapshot] = await Promise.all([host, guest].map((page) => page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
    ))));
    const hostEntity = hostSnapshot.killstreak.entities.find((entity: any) => entity.id === staged.entityId);
    const guestEntity = guestSnapshot.killstreak.entities.find((entity: any) => entity.id === staged.entityId);
    const hostId = hostSnapshot.player.id as string;
    const guestId = guestSnapshot.player.id as string;
    const privateLobby = {
      hostId,
      guestId,
      memberIds: hostSnapshot.privateMatch.members.map((member: any) => member.id).sort(),
      memberCount: hostSnapshot.privateMatch.members.length,
      connectedCount: hostSnapshot.privateMatch.members.filter((member: any) => member.connected === true).length,
      botCount: hostSnapshot.privateMatch.hostedBotCount,
      hostRole: hostSnapshot.networkLifecycle.role,
      guestRole: guestSnapshot.networkLifecycle.role,
    };
    expect(privateLobby).toMatchObject({ memberCount: 2, connectedCount: 2, botCount: 2, hostRole: 'host', guestRole: 'client' });
    expect(privateLobby.memberIds).toEqual([hostId, guestId].sort());

    const [hostRuntimeLog, guestRuntimeLog] = await Promise.all([
      readPersistedClientRuntimeLog(host),
      readPersistedClientRuntimeLog(guest),
    ]);
    const faults = [
      ...diagnostics.pageErrors,
      ...diagnostics.consoleErrors,
      ...hostRuntimeLog.map((entry) => `host-runtime: ${JSON.stringify(entry)}`),
      ...guestRuntimeLog.map((entry) => `guest-runtime: ${JSON.stringify(entry)}`),
    ];
    expect(faults).toEqual([]);
    const runtime = hostSnapshot.render.runtime;
    const browserVersion = browser.version();
    const userAgent = await host.evaluate(() => navigator.userAgent);
    const component = {
      schemaVersion: 1,
      contract: 'atomic-acres/pass71-hf307-native-scope-component@1',
      status: 'passed',
      expectedSourceSha,
      checkoutSourceSha,
      scope: {
        arena,
        renderer,
        mode: 'hosted',
        profile: 'performance',
        topology: 'owned-private-two-peer',
        freshProcess: true,
        servedCandidate: await servedCandidate(host),
        browser: {
          version: browserVersion,
          userAgent,
          launchedExecutablePath,
        },
        runtime: {
          requestedBackend: runtime.requestedBackend,
          actualBackend: runtime.actualBackend,
          initialized: runtime.initialized,
          adapterClass: runtime.adapterClass,
          deviceClass: runtime.deviceClass,
          adapterLabel: runtime.adapterLabel,
          softwareAdapter: runtime.softwareAdapter,
          deviceLost: runtime.deviceLost,
          uncapturedErrors: runtime.uncapturedErrors,
          presentationStatus: runtime.presentation.status,
        },
        privateLobby,
        policy: {
          precedingDirectHitRadiusM: CHOPPER_GUNNER_SPLASH_POLICY.precedingDirectHitRadiusM,
          linearRadiusMultiplier: CHOPPER_GUNNER_SPLASH_POLICY.linearRadiusMultiplier,
          splashRadiusM: CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM,
          radialMinimumDamageMultiplier: CHOPPER_GUNNER_SPLASH_POLICY.radialMinimumDamageMultiplier,
          cadenceMs: CHOPPER_GUN_PROFILE.cadenceMs,
          penetration: CHOPPER_GUN_PROFILE.penetration,
          hostOwned: true,
          lineOfSightRequired: true,
          hostileRelationsOnly: true,
          oneResultPerTarget: true,
        },
        stage: {
          entityId: staged.entityId,
          activationId: staged.activationId,
          ownerId: hostEntity.ownerId,
          primaryTargetId: staged.primaryTargetId,
          splashTargetId: staged.splashTargetId,
          targetKinds: ['bot', 'bot'],
          targetTeams: targetIds.map((id) => hostSnapshot.bots.find((bot: any) => bot.id === id)?.team),
          ownerTeam: hostSnapshot.player.team,
          separationM: staged.separationM,
          lineOfSight: aim.lineOfSight,
        },
        guestControl: {
          attemptedEntityId: staged.entityId,
          attemptedActivationId: staged.activationId,
          guestId: guestIdentity,
          apiAccepted: guestApiAccepted,
          hostOwnerAfter: hostAfterGuestAttempt.ownerId,
          hostControllerAfter: hostAfterGuestAttempt.gunController,
          hostActivationAfter: hostAfterGuestAttempt.activationId,
        },
        shot: {
          capture: 'complete-host-single-cadence-window',
          captureDurationMs: completedAtMs - startedAtMs,
          shotTimestampCount: new Set(completeHostCapture.map((sample: any) => sample.atMs)).size,
          trustedLmb: true,
          controlAccepted: receipt.controlAdmission.accepted,
          controller: hostEntity.gunController,
          entityOwnerId: hostEntity.ownerId,
          activationId: staged.activationId,
          targetIds: completeHostCapture.map((sample: any) => sample.targetId),
          resultIds: completeHostCapture.map((sample: any) => sample.resultId),
          resultCount: completeHostCapture.length,
          uniqueTargetCount: new Set(completeHostCapture.map((sample: any) => sample.targetId)).size,
          uniqueResultCount: new Set(completeHostCapture.map((sample: any) => sample.resultId)).size,
          sameHostTimestamp: completeHostCapture[0].atMs === completeHostCapture[1].atMs,
          atMs: completeHostCapture[0].atMs,
          damages: completeHostCapture.map((sample: any) => sample.damage),
          aimOrigin: aim.origin,
          aimTarget: aim.target,
        },
        guestTransport,
        replication: {
          hostBotHealthBefore,
          hostBotHealthAfter,
          guestBotHealthAfter,
          guestObservedEntity: Boolean(guestEntity),
          guestObservedActivation: guestEntity?.activationId ?? null,
          guestObservedOwner: guestEntity?.ownerId ?? null,
          guestObservedController: guestEntity?.gunController ?? null,
          replicaDrift: Math.max(...hostBotHealthAfter.map((health, index) => Math.abs(health - guestBotHealthAfter[index]!))),
        },
        faults,
      },
    };
    mkdirSync(dirname(componentPath), { recursive: true });
    writeFileSync(componentPath, `${JSON.stringify(component, null, 2)}\n`, 'utf8');
  } finally {
    if (leftMouseDown) {
      const pages = hostContext.pages();
      await pages[0]?.mouse.up({ button: 'left' }).catch(() => undefined);
    }
    await Promise.all([
      hostContext.close().catch(() => undefined),
      guestContext.close().catch(() => undefined),
    ]);
  }
});

test.beforeAll(async () => {
  if (!enabled) return;
  peerServer = await startOwnedPeerServer(peerPort);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});
