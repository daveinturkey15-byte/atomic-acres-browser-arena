import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  attachBrowserDiagnostics,
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS66_CARPET_SHED_PEER_PORT ?? 9_068);
const artifactRoot = resolve('artifacts/pass66/carpet-shed-webgpu');
const carpetLoadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});
const arenaCases = Object.freeze([
  Object.freeze({
    arenaId: 'rustworks-1v1',
    label: 'rustrig',
    targetShedId: 'rustworks-shed-west',
    siblingShedId: 'rustworks-shed-east',
    target: [-24, 0, -11] as [number, number, number],
    safePlayerPosition: [0, 1.7, 20] as [number, number, number],
  }),
  Object.freeze({
    arenaId: 'skyline-terminal',
    label: 'terminal',
    targetShedId: 'terminal-shed-west',
    siblingShedId: 'terminal-shed-east',
    target: [-29, 0, 4] as [number, number, number],
    safePlayerPosition: [0, 1.7, -20] as [number, number, number],
  }),
]);
type NativePresentationHandoff = Readonly<{
  label: string;
  beforeSubmissionSequence: number;
  beforeCompletedSequence: number;
  admittedSubmissionSequence: number;
  finalCompletedSequence: number;
  completionFailures: number;
}>;

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
  mkdirSync(artifactRoot, { recursive: true });
  rmSync(resolve(artifactRoot, 'receipt.json'), { force: true });
  peerServer = await startOwnedPeerServer(peerPort);
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
  const url = new URL('/', test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgpu', requireWebGPU: '1', render: 'blender', externalServices: 'off',
    signal: 'off', grass: 'on', mist: 'on', clouds: 'on', rays: 'on', multiplayerQa: '1',
    peerQaPort: String(peerPort), peerQaPath: peerServer.path, map: 'rustworks-1v1', seed,
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true
      && state.bootstrap.stage === 'ready'
      && document.querySelector<HTMLButtonElement>('#host')?.disabled === false;
  }, undefined, { timeout: 120_000 });
  await page.locator('#player-name').fill(name);
  return page;
}

async function nativeWebGpuHealth(page: Page): Promise<any> {
  return page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      requestedBackend: state.render.runtime.requestedBackend,
      actualBackend: state.render.runtime.actualBackend,
      softwareAdapter: state.render.runtime.softwareAdapter,
      deviceLost: state.render.runtime.deviceLost,
      uncapturedErrors: state.render.runtime.uncapturedErrors,
      presentationStatus: state.render.runtime.presentation.status,
      profile: state.render.profile,
    };
  });
}

async function handoffNativeWebGpu(
  page: Page,
  label: string,
  handoffs: NativePresentationHandoff[],
): Promise<void> {
  const before = await page.evaluate(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry();
    return {
      submissionSequence: presentation.submissionSequence,
      completedSequence: presentation.completedSequence,
      completionFailures: presentation.completionFailures,
    };
  });
  await page.bringToFront();
  await page.waitForFunction(() => document.visibilityState === 'visible' && document.hasFocus());
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  const admittedHandle = await page.waitForFunction((baseline) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const state = debug.snapshot();
    const presentation = debug.samplePresentationTelemetry();
    if (state.render.runtime.actualBackend !== 'webgpu'
      || presentation.status !== 'healthy'
      || presentation.completionFailures !== baseline.completionFailures
      || presentation.submissionSequence <= baseline.submissionSequence
      || presentation.completedSequence <= baseline.completedSequence) return false;
    return {
      submissionSequence: presentation.submissionSequence,
      completedSequence: presentation.completedSequence,
    };
  }, before, { polling: 16, timeout: 30_000 });
  const admitted = await admittedHandle.jsonValue() as { submissionSequence: number; completedSequence: number };
  await page.waitForFunction((targetSubmission) => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry();
    return presentation.status === 'healthy'
      && presentation.completionFailures === 0
      && presentation.completedSequence >= targetSubmission;
  }, admitted.submissionSequence, { polling: 16, timeout: 30_000 });
  const finalPresentation = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry());
  expect(finalPresentation.submissionSequence).toBeGreaterThan(before.submissionSequence);
  expect(finalPresentation.completedSequence).toBeGreaterThan(before.completedSequence);
  expect(finalPresentation.completedSequence).toBeGreaterThanOrEqual(admitted.submissionSequence);
  expect(finalPresentation.completionFailures).toBe(before.completionFailures);
  expect(await nativeWebGpuHealth(page)).toEqual({
    requestedBackend: 'webgpu',
    actualBackend: 'webgpu',
    softwareAdapter: false,
    deviceLost: false,
    uncapturedErrors: 0,
    presentationStatus: 'healthy',
    profile: 'blender',
  });
  handoffs.push(Object.freeze({
    label,
    beforeSubmissionSequence: before.submissionSequence,
    beforeCompletedSequence: before.completedSequence,
    admittedSubmissionSequence: admitted.submissionSequence,
    finalCompletedSequence: finalPresentation.completedSequence,
    completionFailures: finalPresentation.completionFailures,
  }));
}

async function assertNativeWebGpuPair(
  pages: readonly Page[],
  handoffs: NativePresentationHandoff[],
  label: string,
): Promise<void> {
  for (const page of pages) {
    await handoffNativeWebGpu(page, `${label}:${pages.indexOf(page) === 0 ? 'host' : 'guest'}`, handoffs);
  }
}

async function startPair(browser: Browser): Promise<{
  contexts: readonly BrowserContext[];
  host: Page;
  guest: Page;
  diagnostics: BrowserDiagnostics;
  handoffs: NativePresentationHandoff[];
}> {
  // Lobby credentials and player identities are origin storage. Each peer
  // therefore needs its own BrowserContext even though the WebGPU foreground
  // handoff is deliberately serialized between their pages.
  const hostContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 }, deviceScaleFactor: 1 });
  const guestContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 }, deviceScaleFactor: 1 });
  const contexts = [hostContext, guestContext] as const;
  try {
  await Promise.all(contexts.map((context) => context.addInitScript((loadout) => {
    try { localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(loadout)); } catch { /* about:blank */ }
  }, carpetLoadout)));
  const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
  const handoffs: NativePresentationHandoff[] = [];
  const host = await openPlayer(hostContext, 'Carpet Shed Host', 'pass66-carpet-shed-host', diagnostics, 'host bootstrap/runtime');
  const guest = await openPlayer(guestContext, 'Carpet Shed Guest', 'pass66-carpet-shed-guest', diagnostics, 'guest bootstrap/runtime');
  await handoffNativeWebGpu(host, 'create-room:host', handoffs);
  await host.locator('#team').selectOption('0');
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.locator('#room-code').textContent())!.trim();
  await handoffNativeWebGpu(guest, 'join-room:guest', handoffs);
  await guest.locator('#team').selectOption('1');
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ))));
  return { contexts, host, guest, diagnostics, handoffs };
  } catch (error) {
    await Promise.allSettled(contexts.map((context) => context.close()));
    throw error;
  }
}

async function startCurrentLobbyMatch(
  host: Page,
  guest: Page,
  expectedArenaId: string,
  handoffs: NativePresentationHandoff[],
): Promise<void> {
  await handoffNativeWebGpu(host, `${expectedArenaId}:ready-host`, handoffs);
  await host.locator('#lobby-ready').click();
  await handoffNativeWebGpu(guest, `${expectedArenaId}:ready-guest`, handoffs);
  await guest.locator('#lobby-ready').click();
  await handoffNativeWebGpu(host, `${expectedArenaId}:start-host`, handoffs);
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await host.waitForFunction((arenaId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.arenaSelection.id === arenaId
      && state.killstreak.actors.length === 2
      && state.interactiveWorld.envelope?.arenaId === arenaId;
  }, expectedArenaId, { timeout: 150_000 });
  await handoffNativeWebGpu(guest, `${expectedArenaId}:admit-guest`, handoffs);
  await guest.waitForFunction((arenaId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.arenaSelection.id === arenaId
      && state.killstreak.actors.length === 2
      && state.interactiveWorld.envelope?.arenaId === arenaId;
  }, expectedArenaId, { timeout: 150_000 });
}

async function selectLobbyArena(
  host: Page,
  guest: Page,
  arenaId: string,
  handoffs: NativePresentationHandoff[],
): Promise<void> {
  await handoffNativeWebGpu(host, `${arenaId}:select-host`, handoffs);
  await host.locator('#lobby-arena').selectOption(arenaId);
  await host.waitForFunction((expectedArenaId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.privateMatch?.arenaId === expectedArenaId
      && state.arenaSelection.id === expectedArenaId
      && state.interactiveWorld.envelope?.arenaId === expectedArenaId;
  }, arenaId, { timeout: 120_000 });
  await handoffNativeWebGpu(guest, `${arenaId}:sync-guest`, handoffs);
  await guest.waitForFunction((expectedArenaId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.privateMatch?.arenaId === expectedArenaId
      && state.arenaSelection.id === expectedArenaId
      && state.interactiveWorld.envelope?.arenaId === expectedArenaId;
  }, arenaId, { timeout: 120_000 });
}

async function stableShedSummary(page: Page, targetShedId: string, siblingShedId: string): Promise<any> {
  return page.evaluate(({ targetId, siblingId }) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const envelope = state.interactiveWorld.envelope;
    const target = envelope.sheds.find((shed: any) => shed.placementId === targetId);
    const sibling = envelope.sheds.find((shed: any) => shed.placementId === siblingId);
    if (!target || !sibling) throw new Error(`Missing served shed pair ${targetId}/${siblingId}`);
    return {
      arenaId: envelope.arenaId,
      matchEpoch: envelope.matchEpoch,
      target: {
        placementId: target.placementId,
        stages: target.surfaces.map((surface: any) => [surface.surfaceId, surface.stage]).sort(),
        detachedChunkIds: [...target.detachedChunkIds].sort(),
        majorDebrisIds: target.majorDebris.map((body: any) => body.chunkId).sort(),
        door: { phase: target.door.phase, direction: target.door.direction },
      },
      sibling: {
        placementId: sibling.placementId,
        detachedChunkIds: [...sibling.detachedChunkIds].sort(),
        allSurfacesIntact: sibling.surfaces.every((surface: any) => surface.stage === 'intact'),
      },
      presentationRootInScene: state.interactiveWorld.presentationRootInScene,
      presentationRootVisible: state.interactiveWorld.presentationRootVisible,
      gpuRetirementFailures: state.interactiveWorld.gpuRetirement.failures,
      boundedPresentation: state.killstreakPresentation.bounded,
    };
  }, { targetId: targetShedId, siblingId: siblingShedId });
}

async function activateCarpetAtShed(
  host: Page,
  guest: Page,
  arenaCase: typeof arenaCases[number],
  testInfo: TestInfo,
  handoffs: NativePresentationHandoff[],
): Promise<Record<string, unknown>> {
  await handoffNativeWebGpu(host, `${arenaCase.label}:activate-host`, handoffs);
  await host.evaluate(([x, y, z]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, 0, 0);
    window.__ATOMIC_ACRES_DEBUG__.earnSupport(7);
  }, arenaCase.safePlayerPosition);
  await expect.poll(async () => host.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.availableCharges['carpet-bomber'] ?? 0
  ))).toBeGreaterThanOrEqual(1);

  const markerArgument = { target: arenaCase.target, shedId: arenaCase.targetShedId };
  const hostMarkerPromise = host.waitForFunction(({ target }) => {
    const markers = window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreakPresentation.markerDetails;
    const targetMarker = markers.find((marker: any) => marker.source === 'carpet-bomber' && marker.shape === 'ground-x');
    const corridor = markers.find((marker: any) => marker.source === 'carpet-bomber' && marker.shape === 'corridor');
    if (!targetMarker || !corridor) return false;
    return { targetMarker, corridor, target };
  }, markerArgument, { polling: 16, timeout: 4_000 });
  const guestMarkerPromise = guest.waitForFunction(() => {
    // A native-WebGPU browser has one foreground presentation owner. The
    // hidden guest must still receive the authoritative snapshot, but it is
    // intentionally forbidden from presenting the marker until foregrounded.
    const markers = window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.placementMarkers;
    const targetMarker = markers.find((marker: any) => marker.source === 'carpet-bomber' && marker.shape === 'ground-x');
    return targetMarker ? { targetMarker, corridorCount: markers.filter((marker: any) => marker.shape === 'corridor').length } : false;
  }, undefined, { polling: 16, timeout: 4_000 });

  const activated = await host.evaluate(({ target }) => (
    window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('carpet-bomber', target, [1, 0, 0])
  ), markerArgument);
  expect(activated).toBe(true);
  const [hostMarkerHandle, guestMarkerHandle] = await Promise.all([hostMarkerPromise, guestMarkerPromise]);
  const hostMarkers = await hostMarkerHandle.jsonValue() as any;
  const guestMarkers = await guestMarkerHandle.jsonValue() as any;
  expect(hostMarkers.targetMarker).toMatchObject({
    source: 'carpet-bomber', shape: 'ground-x', audience: 'all-combatants', visible: true,
  });
  expect(hostMarkers.corridor).toMatchObject({
    source: 'carpet-bomber', shape: 'corridor', audience: 'owner-only', visible: true,
  });
  expect(hostMarkers.targetMarker.anchor[0]).toBeCloseTo(arenaCase.target[0], 4);
  expect(hostMarkers.targetMarker.anchor[2]).toBeCloseTo(arenaCase.target[2], 4);
  expect(guestMarkers.targetMarker).toMatchObject({
    id: hostMarkers.targetMarker.id,
    anchor: hostMarkers.targetMarker.anchor,
    source: 'carpet-bomber',
    audience: 'all-combatants',
  });
  expect(guestMarkers.corridorCount).toBe(0);

  await Promise.all([host, guest].map((page) => page.waitForFunction((targetId) => {
    const shed = window.__ATOMIC_ACRES_DEBUG__.snapshot().interactiveWorld.envelope?.sheds
      .find((candidate: any) => candidate.placementId === targetId);
    return shed
      && shed.surfaces.every((surface: any) => surface.stage === 'detached')
      && shed.detachedChunkIds.length === 6
      && shed.majorDebris.length === 6
      && shed.door.phase === 'open';
  }, arenaCase.targetShedId, { timeout: 20_000 })));

  const hostSummary = await stableShedSummary(host, arenaCase.targetShedId, arenaCase.siblingShedId);
  await expect.poll(async () => stableShedSummary(guest, arenaCase.targetShedId, arenaCase.siblingShedId), {
    timeout: 20_000,
  }).toEqual(hostSummary);
  expect(hostSummary.target.detachedChunkIds).toHaveLength(6);
  expect(hostSummary.target.majorDebrisIds).toHaveLength(6);
  expect(hostSummary.target.stages.every((entry: any) => entry[1] === 'detached')).toBe(true);
  expect(hostSummary.target.door).toEqual({ phase: 'open', direction: 'stationary' });
  expect(hostSummary.sibling).toMatchObject({ detachedChunkIds: [], allSurfacesIntact: true });
  expect(hostSummary).toMatchObject({
    arenaId: arenaCase.arenaId,
    presentationRootInScene: true,
    presentationRootVisible: true,
    gpuRetirementFailures: 0,
    boundedPresentation: true,
  });

  await handoffNativeWebGpu(host, `${arenaCase.label}:capture-host`, handoffs);
  await host.evaluate(([x, y, z]) => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(x, y + 18, z, 0, -1.45, 58);
  }, arenaCase.target);
  await host.evaluate(() => new Promise<void>((ready) => requestAnimationFrame(() => requestAnimationFrame(() => ready()))));
  const screenshotPath = resolve(artifactRoot, `${arenaCase.label}-carpet-shed-collapse-host.png`);
  await host.screenshot({ path: screenshotPath, animations: 'disabled' });
  await testInfo.attach(`${arenaCase.label}-carpet-shed-collapse-host`, { path: screenshotPath, contentType: 'image/png' });
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null));

  for (const page of [host, guest]) {
    await handoffNativeWebGpu(
      page,
      `${arenaCase.label}:teardown-${page === host ? 'host' : 'guest'}`,
      handoffs,
    );
    await expect.poll(async () => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        carpetAircraft: state.killstreak.entities.filter((entity: any) => (
          entity.kind === 'aircraft' && String(entity.id).includes('carpet-aircraft')
        )).length,
        placementMarkers: state.killstreakPresentation.placementMarkers,
        impactFlashes: state.killstreakPresentation.impactFlashes,
        bombShells: state.killstreakPresentation.bombShells,
        emberParticles: state.killstreakPresentation.emberParticles,
        activeExplosions: state.fieldSupport.explosionPresentation.active,
        bounded: state.killstreakPresentation.bounded,
      };
    }), { timeout: 20_000 }).toEqual({
      carpetAircraft: 0,
      placementMarkers: 0,
      impactFlashes: 0,
      bombShells: 0,
      emberParticles: 0,
      activeExplosions: 0,
      bounded: true,
    });
  }
  await assertNativeWebGpuPair([host, guest], handoffs, `${arenaCase.label}:post-teardown`);
  return { hostMarkers, guestMarkers, hostSummary };
}

test('native WebGPU Carpet Bomber destroys real RustRig and Terminal sheds across a two-peer rematch', async ({ browser, browserName }, testInfo) => {
  test.skip(process.env.PASS66_CARPET_SHED_NATIVE_WEBGPU !== '1', 'Run the dedicated installed-Edge native-WebGPU gate explicitly.');
  test.skip(browserName !== 'chromium', 'Strict hardware WebGPU plus two-peer replication is Chromium/installed Edge only.');
  test.setTimeout(600_000);
  const { contexts, host, guest, diagnostics, handoffs } = await startPair(browser);
  try {
    await startCurrentLobbyMatch(host, guest, arenaCases[0].arenaId, handoffs);
    await assertNativeWebGpuPair([host, guest], handoffs, 'rustrig:active');
    const rustEpoch = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.matchEpoch);
    expect(await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.matchEpoch)).toBe(rustEpoch);
    const rust = await activateCarpetAtShed(host, guest, arenaCases[0], testInfo, handoffs);

    await handoffNativeWebGpu(host, 'rustrig:end-host', handoffs);
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.endMatch());
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'ended'
    ))));
    await handoffNativeWebGpu(host, 'rustrig:return-lobby-host', handoffs);
    await host.locator('#rematch').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return !state.gameStarted && state.privateMatch?.phase === 'waiting';
    })));

    await selectLobbyArena(host, guest, arenaCases[1].arenaId, handoffs);
    await startCurrentLobbyMatch(host, guest, arenaCases[1].arenaId, handoffs);
    await assertNativeWebGpuPair([host, guest], handoffs, 'terminal:active');
    const terminalEpoch = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.matchEpoch);
    expect(terminalEpoch).not.toBe(rustEpoch);
    expect(await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.matchEpoch)).toBe(terminalEpoch);
    const terminal = await activateCarpetAtShed(host, guest, arenaCases[1], testInfo, handoffs);

    await handoffNativeWebGpu(host, 'terminal:end-host', handoffs);
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.endMatch());
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'ended'
    ))));
    await handoffNativeWebGpu(host, 'terminal:return-lobby-host', handoffs);
    await host.locator('#rematch').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return !state.gameStarted && state.privateMatch?.phase === 'waiting'
        && state.killstreak.entities.length === 0
        && state.killstreakPresentation.entities === 0
        && state.killstreakPresentation.placementMarkers === 0;
    })));
    await assertNativeWebGpuPair([host, guest], handoffs, 'final-lobby');
    const clientRuntimeLog = await readPersistedClientRuntimeLog(host);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(clientRuntimeLog).toEqual([]);

    writeFileSync(resolve(artifactRoot, 'receipt.json'), `${JSON.stringify({
      schema: 'atomic-acres/pass66-carpet-shed-native-webgpu@1',
      backend: 'webgpu',
      profile: 'blender',
      peers: 2,
      rounds: [
        { arenaId: arenaCases[0].arenaId, matchEpoch: rustEpoch, evidence: rust },
        { arenaId: arenaCases[1].arenaId, matchEpoch: terminalEpoch, evidence: terminal },
      ],
      presentationHandoffs: handoffs,
      diagnostics: {
        pageErrors: diagnostics.pageErrors,
        consoleErrors: diagnostics.consoleErrors,
        clientRuntimeLog,
      },
    }, null, 2)}\n`, 'utf8');
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
