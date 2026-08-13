import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  CHOPPER_MISSILE_BLAST_RADIUS_M,
  chopperMissileLaunchPosition,
} from '../../src/killstreak-runtime';
import { LOCAL_MULTIPLAYER_QA_HOST_DAMAGE_RESULT_EVENT } from '../../src/network';
import {
  PASS71_HF308_POLICY,
  pass71Hf308DecodeLosslessPng,
  pass71Hf308RasterDifference,
} from '../../scripts/qa/pass71-hf308-chopper-missile-evidence-contract.mjs';
import {
  attachBrowserDiagnostics,
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const enabled = process.env.PASS71_HF308_CHOPPER_MISSILE_EVIDENCE === '1';
const renderer = process.env.PASS71_HF308_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const mode = process.env.PASS71_HF308_MODE === 'hosted' ? 'hosted' : 'offline';
const arena = process.env.PASS71_HF308_ARENA ?? 'atomic-acres';
const expectedSourceSha = process.env.PASS71_HF308_EXPECTED_SOURCE_SHA ?? '';
const componentPath = process.env.PASS71_HF308_COMPONENT_PATH ?? '';
const edgeExecutable = process.env.PASS71_HF308_EDGE_EXECUTABLE ?? '';
const peerPort = Number(process.env.PASS71_HF308_PEER_PORT ?? '4897');
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

let peerServer: OwnedPeerServer | null = null;

if (enabled && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha)
  || componentPath === '' || edgeExecutable === '' || process.env.QA_INSTALLED_EDGE !== '1')) {
  throw new Error('Official HF-308 evidence requires exact candidate A, exact installed Edge, and an owned component path');
}

test.skip(!enabled, 'Run through the owned HF-308 exact-candidate-A evidence runner.');
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

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function candidateUrl(seed: string): string {
  const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
  const url = new URL('/channels/the-big-one/', baseUrl);
  for (const [key, value] of Object.entries({
    release: 'latest',
    map: arena,
    renderer,
    requireWebGPU: renderer === 'webgpu' ? '1' : undefined,
    render: 'blender',
    signal: mode === 'hosted' ? 'on' : 'off',
    grass: 'off',
    mist: 'off',
    clouds: 'off',
    rays: 'off',
    externalServices: 'off',
    multiplayerQa: '1',
    peerQaPort: mode === 'hosted' ? String(peerPort) : undefined,
    peerQaPath: mode === 'hosted' ? peerServer?.path : undefined,
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
    (globalThis as any).__PASS71_HF308_INPUTS__ = [];
    (globalThis as any).__PASS71_HF308_GUEST_HOST_DAMAGE_RESULTS__ = [];
    window.addEventListener(hostDamageResultEvent, (event) => {
      (globalThis as any).__PASS71_HF308_GUEST_HOST_DAMAGE_RESULTS__.push((event as CustomEvent).detail);
    });
    for (const type of ['mousedown', 'mouseup'] as const) {
      window.addEventListener(type, (event) => {
        (globalThis as any).__PASS71_HF308_INPUTS__.push({
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
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
    return snapshot?.bootstrap?.stage === 'ready'
      && snapshot.weaponReady === true
      && snapshot.arenaSelection.id === expectedArena
      && snapshot.render.runtime.actualBackend === expectedRenderer
      && (document.querySelector<HTMLButtonElement>('#solo')?.disabled === false
        || document.querySelector<HTMLButtonElement>('#host')?.disabled === false);
  }, { expectedArena: arena, expectedRenderer: renderer }, { timeout: 120_000 });
  await page.locator('#player-name').fill(name);
  return page;
}

async function ensurePointerLock(page: Page): Promise<void> {
  if (await page.evaluate(() => document.pointerLockElement === document.querySelector('#game'))) return;
  const bounds = await page.locator('#game').boundingBox();
  if (!bounds) throw new Error('HF-308 game canvas has no trusted-input bounds');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, {
    timeout: 8_000,
  });
}

async function trustedRmb(host: Page): Promise<void> {
  await host.mouse.down({ button: 'right' });
  await host.mouse.up({ button: 'right' });
}

async function stageAndAimMissileTarget(host: Page, ordinal: number): Promise<any> {
  const staged = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stagePossessedChopperMissileTarget());
  expect(staged).not.toBeNull();
  if (!staged) throw new Error(`HF-308 could not stage the exact target for missile ${ordinal}`);
  expect(Number.isSafeInteger(staged.targetLifeId)).toBe(true);
  const aim = await host.evaluate(({ targetId, targetKind }) => (
    targetKind === 'training-dummy'
      ? window.__ATOMIC_ACRES_DEBUG__.aimPossessedChopperAtTrainingDummy(targetId)
      : window.__ATOMIC_ACRES_DEBUG__.aimPossessedChopperAtTarget(targetId)
  ), staged);
  expect(aim).toMatchObject({
    entityId: staged.entityId,
    activationId: staged.activationId,
    targetId: staged.targetId,
    lineOfSight: true,
  });
  if (!aim) throw new Error(`HF-308 lost the exact target solution for missile ${ordinal}`);
  expect(aim.target).toEqual(staged.targetPosition);
  expect(aim.targetDistanceFromImpactM).toBeLessThanOrEqual(CHOPPER_MISSILE_BLAST_RADIUS_M);
  return {
    ordinal,
    entityId: staged.entityId,
    activationId: staged.activationId,
    targetId: staged.targetId,
    targetLifeId: staged.targetLifeId,
    targetKind: staged.targetKind,
    targetPosition: staged.targetPosition,
    lineOfSight: true,
  };
}

async function servedCandidate(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HF-308 candidate provenance HTTP ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return Object.fromEntries([
      'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
    ].map((key) => [key, value[key]]));
  });
}

async function waitForSupportReady(page: Page, remoteCount: number): Promise<void> {
  await page.waitForFunction(({ expectedArena, expectedRemoteCount }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const support = snapshot.supportVehiclePresentation;
    return snapshot.gameStarted === true
      && snapshot.matchPhase === 'active'
      && snapshot.arenaSelection.id === expectedArena
      && snapshot.remotePlayers.length === expectedRemoteCount
      && support?.state === 'ready'
      && support.requiredAssets.length > 0
      && support.requiredAssets.length === support.loadedAssets.length
      && support.requiredAssets.every((asset: string) => support.loadedAssets.includes(asset))
      && support.readyFamilies.includes('chopper')
      && Object.keys(support.failures).length === 0;
  }, { expectedArena: arena, expectedRemoteCount: remoteCount }, { timeout: 120_000 });
}

async function entityState(page: Page, entityId: string): Promise<any> {
  return page.evaluate((id) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      entity: snapshot.killstreak.entities.find((candidate: any) => candidate.id === id) ?? null,
      actor: snapshot.killstreak.actors.find((candidate: any) => candidate.actorId === snapshot.player.id) ?? null,
      player: snapshot.player,
      admission: snapshot.killstreakControlAdmission,
      authority: snapshot.chopperMissileAuthority,
      impacts: snapshot.supportImpactEvents.recent,
      shells: snapshot.killstreakPresentation.chopperMissileShells,
    };
  }, entityId);
}

async function waitForLaunch(page: Page, entityId: string, ordinal: number): Promise<any> {
  await page.waitForFunction(({ id, expectedOrdinal }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return snapshot.chopperMissileAuthority.events.some((event: any) => (
      event.aircraftId === id && event.phase === 'launch' && event.ordinal === expectedOrdinal
    ));
  }, { id: entityId, expectedOrdinal: ordinal }, { timeout: 4_000, polling: 'raf' });
  const state = await entityState(page, entityId);
  return state.authority.events.find((event: any) => (
    event.aircraftId === entityId && event.phase === 'launch' && event.ordinal === ordinal
  ));
}

async function waitForMissileCooldown(page: Page, entityId: string): Promise<void> {
  await expect.poll(async () => (await entityState(page, entityId)).entity?.missileCooldownMs, {
    timeout: 4_000,
    intervals: [20, 40, 80],
  }).toBe(0);
}

function impactKeys(events: readonly any[]): string[] {
  return events.map((event) => `${event.activationId}:${event.ordinal}:${event.phase}`);
}

function cleanupProjection(snapshot: any, guest: boolean): Record<string, unknown> {
  return {
    phase: snapshot.matchPhase,
    hostEntityCount: snapshot.killstreak.entities.length,
    hostAuthorityEventCount: snapshot.chopperMissileAuthority.events.length,
    hostImpactEventCount: snapshot.supportImpactEvents.recent.length,
    hostMissileShellCount: snapshot.killstreakPresentation.chopperMissileShells.length,
    guestEntityCount: guest ? snapshot.guest.killstreak.entities.length : null,
    guestImpactEventCount: guest ? snapshot.guest.supportImpactEvents.recent.length : null,
    guestMissileShellCount: guest ? snapshot.guest.killstreakPresentation.chopperMissileShells.length : null,
  };
}

test(`${arena}/${renderer}/${mode}: closes HF-308 missile authority presentation lifecycle and replica evidence`, async ({ browser }) => {
  test.setTimeout(360_000);
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
  if (mode === 'hosted' && !peerServer) throw new Error('HF-308 owned PeerJS server is unavailable');

  const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
  const hostContext = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  const guestContext = mode === 'hosted'
    ? await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 })
    : null;
  try {
    const host = await openCandidate(
      hostContext,
      'HF308 Host',
      `pass71-hf308-${arena}-${renderer}-${mode}-host`,
      diagnostics,
    );
    const guest = guestContext ? await openCandidate(
      guestContext,
      'HF308 Guest',
      `pass71-hf308-${arena}-${renderer}-${mode}-guest`,
      diagnostics,
    ) : null;

    if (guest) {
      await host.locator('#team').selectOption('0');
      await guest.locator('#team').selectOption('1');
      await host.locator('#host').click();
      await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()), undefined, {
        timeout: 30_000,
      });
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
      await Promise.all([waitForSupportReady(host, 1), waitForSupportReady(guest, 1)]);
    } else {
      await host.locator('#solo').click();
      await waitForSupportReady(host, 0);
    }

    await host.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.earnSupport(15);
    });
    const activationRequest = await host.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('chopper')
    ));
    expect(activationRequest).not.toBeNull();
    if (!activationRequest) throw new Error('HF-308 Chopper activation was rejected');
    await host.waitForFunction(({ sequence, lifeId }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const aircraft = snapshot.chopperMissileAuthority.aircraft.find((candidate: any) => (
        candidate.activationSequence === sequence
          && candidate.ownerLifeId === lifeId
          && candidate.ownerId === snapshot.player.id
      ));
      return snapshot.killstreak.entities.some((entity: any) => (
        entity.id === aircraft?.aircraftId && entity.kind === 'chopper' && entity.phase === 'orbiting'
      ));
    }, activationRequest, { timeout: 30_000 });
    expect(await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
    await host.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'chopper-gunner');
    await ensurePointerLock(host);

    const staged = await stageAndAimMissileTarget(host, 0);
    const initial = await entityState(host, staged.entityId);
    expect(initial.entity).toMatchObject({
      id: staged.entityId,
      activationId: staged.activationId,
      ownerId: initial.player.id,
      gunController: 'owner-player',
      missileAmmo: 6,
      missileCooldownMs: 0,
    });

    let guestControlAccepted = false;
    if (guest) {
      await guest.waitForFunction(({ entityId, activationId, ownerId }) => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
        const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === entityId);
        return entity?.activationId === activationId && entity.ownerId === ownerId
          && entity.gunController === 'owner-player';
      }, { entityId: staged.entityId, activationId: staged.activationId, ownerId: initial.player.id }, {
        timeout: 15_000,
      });
      guestControlAccepted = await guest.evaluate((entityId) => (
        window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl(entityId)
      ), staged.entityId);
      expect(guestControlAccepted).toBe(false);
    }

    const firstTarget = await stageAndAimMissileTarget(host, 0);
    expect(firstTarget).toMatchObject({ entityId: staged.entityId, activationId: staged.activationId });
    const targetAdmissions = [firstTarget];
    await trustedRmb(host);
    const firstLaunch = await waitForLaunch(host, staged.entityId, 0);
    expect(firstLaunch).toBeTruthy();
    expect(firstLaunch).toMatchObject({
      targetId: firstTarget.targetId,
      targetLifeId: firstTarget.targetLifeId,
      targetKind: 'bot',
      targetPosition: firstTarget.targetPosition,
    });
    expect((await entityState(host, staged.entityId)).entity.missileAmmo).toBe(5);

    let visibleFrame: any = null;
    for (let attempt = 0; attempt < 50 && visibleFrame === null; attempt += 1) {
      visibleFrame = await host.evaluate(({ activationId, ordinal }) => (
        window.__ATOMIC_ACRES_DEBUG__.freezeChopperMissileEvidenceFrame(activationId, ordinal)
      ), { activationId: staged.activationId, ordinal: 0 });
      if (visibleFrame === null) await host.waitForTimeout(10);
    }
    expect(visibleFrame).not.toBeNull();
    if (!visibleFrame) throw new Error('HF-308 could not freeze the exact in-flight missile shell');
    const frozenShellState = await entityState(host, staged.entityId);
    const viewportX = (visibleFrame.missile.projectedNdc[0] + 1) * visibleFrame.viewport.cssWidth / 2;
    const viewportY = (1 - visibleFrame.missile.projectedNdc[1]) * visibleFrame.viewport.cssHeight / 2;
    const crop = {
      left: Math.max(0, Math.min(
        visibleFrame.viewport.cssWidth - PASS71_HF308_POLICY.rasterRoiWidth,
        Math.round(viewportX - PASS71_HF308_POLICY.rasterRoiWidth / 2),
      )),
      top: Math.max(0, Math.min(
        visibleFrame.viewport.cssHeight - PASS71_HF308_POLICY.rasterRoiHeight,
        Math.round(viewportY - PASS71_HF308_POLICY.rasterRoiHeight / 2),
      )),
      width: PASS71_HF308_POLICY.rasterRoiWidth,
      height: PASS71_HF308_POLICY.rasterRoiHeight,
    };
    let hiddenControl: any = null;
    let visiblePng: Buffer;
    let hiddenPng: Buffer;
    try {
      visiblePng = await host.screenshot({ clip: crop, type: 'png', animations: 'allow', scale: 'css' });
      hiddenControl = await host.evaluate(() => (
        window.__ATOMIC_ACRES_DEBUG__.captureChopperMissileHiddenControl()
      ));
      expect(hiddenControl).not.toBeNull();
      hiddenPng = await host.screenshot({ clip: crop, type: 'png', animations: 'allow', scale: 'css' });
    } finally {
      expect(await host.evaluate(() => (
        window.__ATOMIC_ACRES_DEBUG__.releaseChopperMissileEvidenceFrame()
      ))).toBe(true);
    }
    expect(visiblePng!.byteLength).toBeLessThanOrEqual(PASS71_HF308_POLICY.maximumAttachmentBytes);
    expect(hiddenPng!.byteLength).toBeLessThanOrEqual(PASS71_HF308_POLICY.maximumAttachmentBytes);
    const visibleRaster = pass71Hf308DecodeLosslessPng(visiblePng!);
    const hiddenRaster = pass71Hf308DecodeLosslessPng(hiddenPng!);
    const rasterSummary = pass71Hf308RasterDifference(visibleRaster, hiddenRaster);
    expect(rasterSummary.changedPixelsAboveEight).toBeGreaterThanOrEqual(8);
    expect(rasterSummary.changedPixelsAboveTwentyFour).toBeGreaterThanOrEqual(2);
    const expectedSocket = chopperMissileLaunchPosition(
      visibleFrame.authority.sourcePosition,
      visibleFrame.authority.sourceAttitude,
      visibleFrame.ordinal,
    );
    const sourceSocketErrorM = Math.hypot(...expectedSocket.map((value, axis) => (
      value - visibleFrame.authority.launchPosition[axis]
    )));
    const pngAttachment = (bytes: Buffer) => ({
      mediaType: 'image/png',
      encoding: 'base64',
      lossless: true,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      pngBase64: bytes.toString('base64'),
    });
    const attribution = {
      visibleFrame,
      hiddenControl,
      raster: {
        contract: PASS71_HF308_POLICY.rasterContract,
        crop,
        projectedPixel: {
          viewportX,
          viewportY,
          cropX: viewportX - crop.left,
          cropY: viewportY - crop.top,
        },
        sourceSocketErrorM,
        trajectoryErrorM: visibleFrame.missile.distanceFromTrajectoryM,
        skySpawnObserved: false,
        detachedTrailObserved: false,
        unidentifiedShellCount: (frozenShellState.shells as any[]).filter((shell) => !shell.trajectoryId).length,
        otherRootVisibilityChanged: hiddenControl.allOtherMissileRootVisibilitiesPreserved !== true,
        attachments: [
          { key: 'visible', ...pngAttachment(visiblePng!) },
          { key: 'hidden-control', ...pngAttachment(hiddenPng!) },
        ],
        summary: rasterSummary,
      },
    };

    const exitStartedAt = await host.evaluate(() => performance.now());
    const exitLaunchCount = (await entityState(host, staged.entityId)).authority.events
      .filter((event: any) => event.phase === 'launch').length;
    await trustedRmb(host);
    const exitRequest = await entityState(host, staged.entityId);
    expect(exitRequest.admission).toMatchObject({ missileFire: true, accepted: true });
    expect(exitRequest.authority.aircraft[0].pendingRequest).toBe(false);
    expect(await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
    await host.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'none');
    await host.waitForTimeout(1_100);
    const exitAfter = await entityState(host, staged.entityId);
    const exitCompletedAt = await host.evaluate(() => performance.now());
    const exit = {
      cooldownRequestSent: true,
      cooldownControlAccepted: exitRequest.admission.accepted,
      pendingAfterRequest: exitRequest.authority.aircraft[0].pendingRequest,
      possessionAfterExit: exitAfter.actor?.possession ?? null,
      ammoBefore: 5,
      ammoAfter: exitAfter.entity.missileAmmo,
      waitedMs: exitCompletedAt - exitStartedAt,
      additionalLaunches: exitAfter.authority.events.filter((event: any) => event.phase === 'launch').length
        - exitLaunchCount,
    };
    expect(exit).toMatchObject({ possessionAfterExit: null, ammoAfter: 5, additionalLaunches: 0 });

    expect(await host.evaluate((entityId) => (
      window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl(entityId)
    ), staged.entityId)).toBe(true);
    await host.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'chopper-gunner');
    await ensurePointerLock(host);
    await waitForMissileCooldown(host, staged.entityId);
    const secondTarget = await stageAndAimMissileTarget(host, 1);
    expect(secondTarget).toMatchObject({ entityId: staged.entityId, activationId: staged.activationId });
    targetAdmissions.push(secondTarget);
    await trustedRmb(host);
    const secondLaunch = await waitForLaunch(host, staged.entityId, 1);
    expect(secondLaunch).toMatchObject({
      targetId: secondTarget.targetId,
      targetLifeId: secondTarget.targetLifeId,
      targetKind: 'bot',
      targetPosition: secondTarget.targetPosition,
    });
    expect(secondLaunch.launchAtMs - firstLaunch.launchAtMs).toBeGreaterThanOrEqual(1_000);
    const deathLaunchCount = (await entityState(host, staged.entityId)).authority.events
      .filter((event: any) => event.phase === 'launch').length;
    const ownerLifeBefore = secondLaunch.ownerLifeId;
    const deathStartedAt = await host.evaluate(() => performance.now());
    await trustedRmb(host);
    const deathRequest = await entityState(host, staged.entityId);
    expect(deathRequest.admission).toMatchObject({ missileFire: true, accepted: true });
    expect(deathRequest.authority.aircraft[0].pendingRequest).toBe(false);
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.damage(1_000));
    await host.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const actor = snapshot.killstreak.actors.find((candidate: any) => candidate.actorId === snapshot.player.id);
      return snapshot.player.alive === false && actor?.possession == null;
    }, undefined, { timeout: 5_000 });
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.respawn());
    await host.waitForFunction((priorLife) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      return snapshot.player.alive === true && snapshot.player.continuity === priorLife + 1;
    }, ownerLifeBefore, { timeout: 5_000 });
    await host.waitForTimeout(1_100);
    const deathAfter = await entityState(host, staged.entityId);
    const deathCompletedAt = await host.evaluate(() => performance.now());
    const death = {
      cooldownRequestSent: true,
      cooldownControlAccepted: deathRequest.admission.accepted,
      pendingAfterRequest: deathRequest.authority.aircraft[0].pendingRequest,
      possessionAfterDeath: deathAfter.actor?.possession ?? null,
      ownerLifeBefore,
      ownerLifeAfter: deathAfter.player.continuity,
      ammoBefore: 4,
      ammoAfter: deathAfter.entity.missileAmmo,
      waitedMs: deathCompletedAt - deathStartedAt,
      additionalLaunches: deathAfter.authority.events.filter((event: any) => event.phase === 'launch').length
        - deathLaunchCount,
    };
    expect(death).toMatchObject({ possessionAfterDeath: null, ammoAfter: 4, additionalLaunches: 0 });

    expect(await host.evaluate((entityId) => (
      window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl(entityId)
    ), staged.entityId)).toBe(true);
    await host.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'chopper-gunner');
    await ensurePointerLock(host);
    for (let ordinal = 2; ordinal < 6; ordinal += 1) {
      await waitForMissileCooldown(host, staged.entityId);
      const targetAdmission = await stageAndAimMissileTarget(host, ordinal);
      expect(targetAdmission).toMatchObject({ entityId: staged.entityId, activationId: staged.activationId });
      targetAdmissions.push(targetAdmission);
      await trustedRmb(host);
      const launch = await waitForLaunch(host, staged.entityId, ordinal);
      expect(launch.ordinal).toBe(ordinal);
      expect(launch).toMatchObject({
        targetId: targetAdmission.targetId,
        targetLifeId: targetAdmission.targetLifeId,
        targetKind: 'bot',
        targetPosition: targetAdmission.targetPosition,
      });
      expect((await entityState(host, staged.entityId)).entity.missileAmmo).toBe(5 - ordinal);
    }
    await host.waitForFunction((entityId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const authority = snapshot.chopperMissileAuthority;
      const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === entityId);
      return authority.events.length === 12 && entity?.missileAmmo === 0;
    }, staged.entityId, { timeout: 5_000 });
    const beforeSeventh = await entityState(host, staged.entityId);
    const seventhSequenceBefore = beforeSeventh.admission?.sequence ?? -1;
    const launchCountBeforeSeventh = beforeSeventh.authority.events.filter((event: any) => event.phase === 'launch').length;
    await trustedRmb(host);
    await host.waitForTimeout(150);
    const afterSeventh = await entityState(host, staged.entityId);
    const seventh = {
      trustedRmb: true,
      controlAccepted: (afterSeventh.admission?.sequence ?? -1) !== seventhSequenceBefore,
      ammoBefore: beforeSeventh.entity.missileAmmo,
      ammoAfter: afterSeventh.entity.missileAmmo,
      additionalLaunches: afterSeventh.authority.events.filter((event: any) => event.phase === 'launch').length
        - launchCountBeforeSeventh,
    };
    expect(seventh).toEqual({
      trustedRmb: true,
      controlAccepted: false,
      ammoBefore: 0,
      ammoAfter: 0,
      additionalLaunches: 0,
    });
    const seventhLaunchObserved = seventh.additionalLaunches !== 0;
    expect(seventhLaunchObserved).toBe(false);
    const trustedRmbEvents = await host.evaluate(() => (
      (globalThis as any).__PASS71_HF308_INPUTS__.filter((event: any) => (
        event.type === 'mousedown' && event.button === 2 && event.trusted === true
      )).length
    ));
    expect(trustedRmbEvents).toBeGreaterThanOrEqual(9);

    const completedState = await entityState(host, staged.entityId);
    expect(completedState.authority.events).toHaveLength(12);
    expect(completedState.impacts).toHaveLength(12);
    const authority = {
      contract: completedState.authority.contract,
      capacity: completedState.authority.capacity,
      cadenceMs: completedState.authority.cadenceMs,
      flightMs: completedState.authority.flightMs,
      events: completedState.authority.events,
      seventhControlPacketAccepted: seventh.controlAccepted,
      seventhLaunchObserved: false,
      cooldownClickQueued: exit.additionalLaunches !== 0 || death.additionalLaunches !== 0,
      boundedEventCapacity: completedState.authority.events.length,
    };
    expect(authority.events.filter((event: any) => event.phase === 'launch')).toHaveLength(6);
    expect(authority.events.filter((event: any) => event.phase === 'impact')).toHaveLength(6);

    let guestTransport: Record<string, unknown> | null = null;
    if (guest) {
      await guest.waitForFunction((activationId) => {
        const messages = (globalThis as any).__PASS71_HF308_GUEST_HOST_DAMAGE_RESULTS__ as any[];
        return messages.flatMap((message) => message.impacts).filter((impact) => (
          impact.source === 'chopper' && impact.activationId === activationId
        )).length === 12;
      }, staged.activationId, { timeout: 15_000 });
      await guest.waitForFunction(({ entityId, activationId }) => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
        const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === entityId);
        const impacts = snapshot.supportImpactEvents.recent.filter((impact: any) => (
          impact.source === 'chopper' && impact.activationId === activationId
        ));
        return entity?.missileAmmo === 0 && impacts.length === 12;
      }, { entityId: staged.entityId, activationId: staged.activationId }, { timeout: 15_000 });
      const guestSnapshot = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
      const hostSnapshot = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
      const transport = await guest.evaluate((activationId) => {
        const allMessages = (globalThis as any).__PASS71_HF308_GUEST_HOST_DAMAGE_RESULTS__ as any[];
        const messages = allMessages.filter((message) => message.impacts.some((impact: any) => (
          impact.source === 'chopper' && impact.activationId === activationId
        )));
        const impacts = messages.flatMap((message) => message.impacts).filter((impact: any) => (
          impact.source === 'chopper' && impact.activationId === activationId
        ));
        return { messageCount: messages.length, impacts };
      }, staged.activationId);
      const hostId = hostSnapshot.player.id as string;
      const guestId = guestSnapshot.player.id as string;
      const hostEntity = hostSnapshot.killstreak.entities.find((entity: any) => entity.id === staged.entityId);
      const guestEntity = guestSnapshot.killstreak.entities.find((entity: any) => entity.id === staged.entityId);
      const hostEventKeys = impactKeys(hostSnapshot.supportImpactEvents.recent);
      const guestRecentEventKeys = impactKeys(guestSnapshot.supportImpactEvents.recent);
      const eventKeys = impactKeys(transport.impacts);
      const replicaDrift = JSON.stringify(hostEventKeys) === JSON.stringify(guestRecentEventKeys)
        && hostEntity.missileAmmo === guestEntity.missileAmmo ? 0 : 1;
      guestTransport = {
        topology: 'owned-private-two-peer',
        realTwoPeer: true,
        hostId,
        guestId,
        memberIds: hostSnapshot.privateMatch.members.map((member: any) => member.id).sort(),
        memberCount: hostSnapshot.privateMatch.members.length,
        connectedCount: hostSnapshot.privateMatch.members.filter((member: any) => member.connected === true).length,
        hostRole: hostSnapshot.networkLifecycle.role,
        guestRole: guestSnapshot.networkLifecycle.role,
        guestControlAccepted,
        messageCount: transport.messageCount,
        eventKeys,
        hostEventKeys,
        guestRecentEventKeys,
        hostAmmoAfter: hostEntity.missileAmmo,
        guestAmmoAfter: guestEntity.missileAmmo,
        replicaDrift,
        converged: replicaDrift === 0,
      };
    }

    const priorEpoch = completedState.authority.matchEpoch;
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.endMatch());
    await host.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).matchPhase === 'ended', undefined, {
      timeout: 10_000,
    });
    if (guest) await guest.waitForFunction(() => (
      (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).matchPhase === 'ended'
    ), undefined, { timeout: 15_000 });
    const hostCleanupSnapshot = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
    const guestCleanupSnapshot = guest
      ? await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any)
      : null;
    const cleanupCombined = { ...hostCleanupSnapshot, ...(guestCleanupSnapshot ? { guest: guestCleanupSnapshot } : {}) };
    const cleanup = cleanupProjection(cleanupCombined, Boolean(guest));
    expect(cleanup).toMatchObject({
      phase: 'ended',
      hostEntityCount: 0,
      hostAuthorityEventCount: 0,
      hostImpactEventCount: 0,
      hostMissileShellCount: 0,
    });

    await host.locator('#rematch').click();
    if (guest) {
      await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
        (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).privateMatch?.phase === 'waiting'
      ), undefined, { timeout: 15_000 })));
      await host.locator('#lobby-ready').click();
      await guest.locator('#lobby-ready').click();
      await expect(host.locator('#lobby-start')).toBeEnabled();
      await host.locator('#lobby-start').click();
      await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
        (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).matchPhase === 'active'
      ), undefined, { timeout: 60_000 })));
    } else {
      await host.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).matchPhase === 'active', undefined, {
        timeout: 60_000,
      });
    }
    const hostRematchSnapshot = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
    const guestRematchSnapshot = guest
      ? await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any)
      : null;
    const rematchCombined = { ...hostRematchSnapshot, ...(guestRematchSnapshot ? { guest: guestRematchSnapshot } : {}) };
    const rematchBase = cleanupProjection(rematchCombined, Boolean(guest));
    const rematch = {
      priorEpoch,
      nextEpoch: hostRematchSnapshot.killstreak.matchEpoch,
      ...rematchBase,
    };
    expect(rematch).toMatchObject({
      phase: 'active',
      hostEntityCount: 0,
      hostAuthorityEventCount: 0,
      hostImpactEventCount: 0,
      hostMissileShellCount: 0,
    });
    expect(rematch.nextEpoch).toBeGreaterThan(priorEpoch);

    const [hostRuntimeLog, guestRuntimeLog] = await Promise.all([
      readPersistedClientRuntimeLog(host),
      guest ? readPersistedClientRuntimeLog(guest) : Promise.resolve([]),
    ]);
    const faults = [
      ...diagnostics.pageErrors,
      ...diagnostics.consoleErrors,
      ...hostRuntimeLog.map((entry) => `host-runtime: ${JSON.stringify(entry)}`),
      ...guestRuntimeLog.map((entry) => `guest-runtime: ${JSON.stringify(entry)}`),
    ];
    expect(faults).toEqual([]);
    const completedHostSnapshot = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
    const runtime = completedHostSnapshot.render.runtime;
    const browserVersion = browser.version();
    const userAgent = await host.evaluate(() => navigator.userAgent);
    const stage = {
      aircraftId: staged.entityId,
      activationId: staged.activationId,
      activationSequence: activationRequest.sequence,
      ownerId: initial.player.id,
      ownerLifeId: activationRequest.lifeId,
      matchEpoch: initial.authority.matchEpoch,
      targetAdmissions: targetAdmissions.map((admission) => ({
        ordinal: admission.ordinal,
        targetId: admission.targetId,
        targetLifeId: admission.targetLifeId,
        targetKind: admission.targetKind,
        targetPosition: admission.targetPosition,
        lineOfSight: admission.lineOfSight,
      })),
      controller: 'owner-player',
      initialAmmo: 6,
    };
    const component = {
      schemaVersion: 1,
      contract: 'atomic-acres/pass71-hf308-native-scope-component@1',
      status: 'passed',
      expectedSourceSha,
      checkoutSourceSha,
      scope: {
        arena,
        renderer,
        mode,
        profile: 'quality',
        topology: guest ? 'owned-private-two-peer' : 'owned-offline-single-peer',
        freshProcess: true,
        servedCandidate: await servedCandidate(host),
        browser: { version: browserVersion, userAgent, launchedExecutablePath },
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
        stage,
        authority,
        attribution,
        lifecycle: { trustedRmbEvents, exit, death, seventh, cleanup, rematch },
        guestTransport,
        faults,
      },
    };
    mkdirSync(dirname(componentPath), { recursive: true });
    writeFileSync(componentPath, `${JSON.stringify(component)}\n`, 'utf8');
  } finally {
    await Promise.all([
      hostContext.close().catch(() => undefined),
      guestContext?.close().catch(() => undefined),
    ]);
  }
});

test.beforeAll(async () => {
  if (!enabled || mode !== 'hosted') return;
  peerServer = await startOwnedPeerServer(peerPort);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});
