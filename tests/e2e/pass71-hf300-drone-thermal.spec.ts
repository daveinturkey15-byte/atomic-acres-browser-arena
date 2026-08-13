import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  pass71Hf300PngEvidence,
  pass71Hf300PngPairMetrics,
} from '../../scripts/qa/pass71-hf300-drone-thermal-evidence-contract.mjs';
import { startOwnedPeerServer, type OwnedPeerServer } from './pass66-e2e-support';

const enabled = process.env.PASS71_HF300_DRONE_THERMAL === '1';
const targetKind = process.env.PASS71_HF300_TARGET_KIND === 'remote-human' ? 'remote-human' : 'bot';
const mode = targetKind === 'remote-human' ? 'hosted' : 'solo';
const renderer = process.env.PASS71_HF300_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const expectedSourceSha = process.env.PASS71_HF300_SOURCE_SHA ?? '';
const componentRoot = process.env.PASS71_HF300_COMPONENT_DIR ?? '';
const peerPort = Number(process.env.PASS71_HF300_PEER_PORT ?? '4591');
const exactEdgeExecutable = process.env.PASS71_HF300_EDGE_EXECUTABLE;
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});
let peerServer: OwnedPeerServer | null = null;

test.describe.configure({ timeout: 300_000 });
test.use({
  viewport: { width: 1_280, height: 720 },
  deviceScaleFactor: 1,
  launchOptions: {
    ...(exactEdgeExecutable ? { executablePath: exactEdgeExecutable } : {}),
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--allow-loopback-in-peer-connection',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  },
});

test.beforeAll(async () => {
  if (enabled && targetKind === 'remote-human') peerServer = await startOwnedPeerServer(peerPort);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

type ScopePages = Readonly<{
  hostContext: BrowserContext;
  guestContext: BrowserContext | null;
  host: Page;
  guest: Page | null;
  targetId: string | null;
}>;

function attachFaultCollection(page: Page, label: string, faults: string[]): void {
  page.on('pageerror', (error) => faults.push(`${label}:pageerror:${error.stack ?? error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') faults.push(`${label}:console:${message.text()}`);
  });
  page.on('crash', () => faults.push(`${label}:page-crash`));
}

async function openCandidatePage(
  context: BrowserContext,
  label: string,
  seed: string,
  faults: string[],
): Promise<Page> {
  const page = await context.newPage();
  attachFaultCollection(page, label, faults);
  await page.addInitScript((storedLoadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
  }, loadout);
  const url = new URL(test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest',
    map: 'atomic-acres',
    renderer,
    render: 'blender',
    signal: 'off',
    grass: 'off',
    mist: 'off',
    clouds: 'off',
    rays: 'off',
    externalServices: 'off',
    seed,
    ...(renderer === 'webgpu' ? { requireWebGPU: '1' } : {}),
    ...(targetKind === 'remote-human' && peerServer ? {
      multiplayerQa: '1', peerQaPort: String(peerPort), peerQaPath: peerServer.path,
    } : {}),
  })) url.searchParams.set(key, value);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(({ expectedRenderer }) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready'
      && state.arenaSelection?.id === 'atomic-acres'
      && state.render?.profile === 'blender'
      && state.render?.runtime?.requestedBackend === expectedRenderer
      && state.render.runtime.actualBackend === expectedRenderer
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false;
  }, { expectedRenderer: renderer }, { timeout: 120_000 });
  await page.locator('#player-name').fill(label);
  return page;
}

async function waitForSupportBarrier(page: Page): Promise<void> {
  await page.waitForFunction(({ expectedRenderer }) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    const support = state.supportVehiclePresentation;
    const required = support?.requiredAssets ?? [];
    const loaded = support?.loadedAssets ?? [];
    const runtime = state.render?.runtime;
    return state.gameStarted === true && state.matchPhase === 'active'
      && support?.state === 'ready' && required.length > 0 && required.length === loaded.length
      && required.every((asset: string) => loaded.includes(asset))
      && runtime?.requestedBackend === expectedRenderer && runtime.actualBackend === expectedRenderer
      && runtime.initialized === true && runtime.softwareAdapter === false
      && runtime.deviceLost === false && runtime.uncapturedErrors === 0
      && runtime.presentation?.status === (expectedRenderer === 'webgpu' ? 'healthy' : 'synchronous');
  }, { expectedRenderer: renderer }, { timeout: renderer === 'webgpu' ? 150_000 : 90_000 });
  await page.evaluate(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.setMovement(false);
  });
}

async function startScope(browser: Browser, faults: string[]): Promise<ScopePages> {
  const hostContext = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  if (targetKind === 'bot') {
    const host = await openCandidatePage(hostContext, 'HF300 BOT HOST', `hf300-bot-${renderer}`, faults);
    await host.locator('#solo').click();
    await host.waitForFunction(() => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      return debug.snapshot().matchPhase === 'active' && debug.admissionState().presentedGameplayFrame > 2;
    }, undefined, { timeout: 90_000 });
    await waitForSupportBarrier(host);
    return { hostContext, guestContext: null, host, guest: null, targetId: null };
  }

  if (!peerServer) throw new Error('HF-300 remote-human scope requires its owned PeerJS server');
  const guestContext = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  const [host, guest] = await Promise.all([
    openCandidatePage(hostContext, 'HF300 HOST', `hf300-host-${renderer}`, faults),
    openCandidatePage(guestContext, 'HF300 REMOTE HUMAN', `hf300-guest-${renderer}`, faults),
  ]);
  await host.locator('#team').selectOption('0');
  await guest.locator('#team').selectOption('1');
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
  expect(roomCode).not.toBe('');
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ), undefined, { timeout: 45_000 })));
  await host.locator('#lobby-bots').selectOption('1');
  await host.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.hostedBotCount === 1
  ));
  const identities = await host.evaluate(() => {
    const members = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members;
    return {
      guestId: members.find((member: any) => member.name === 'HF300 REMOTE HUMAN')?.id ?? '',
    };
  });
  expect(identities.guestId).toMatch(/^p-/u);
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.remotePlayers.length === 1 && state.remotePlayers[0].operatorModel !== null
      && state.bots.length === 1;
  }, undefined, { timeout: 120_000 })));
  await Promise.all([waitForSupportBarrier(host), waitForSupportBarrier(guest)]);
  return { hostContext, guestContext, host, guest, targetId: identities.guestId };
}

async function candidateProvenance(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), {
      cache: 'no-store', credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HF-300 candidate provenance returned HTTP ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return Object.fromEntries([
      'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
    ].map((key) => [key, value[key]]));
  });
}

async function activatePilotedDrone(host: Page): Promise<void> {
  await host.bringToFront();
  const activated = await host.evaluate(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    debug.earnSupport(15);
    return debug.activateKillstreak('piloted-drone');
  });
  expect(activated).toBe(true);
  await host.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.entities
      .some((entity: any) => entity.kind === 'drone' && entity.mode === 'piloted' && entity.expiresInMs > 0)
  ), undefined, { timeout: 20_000 });
  expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.togglePilotedDroneControl())).toBe(true);
  await host.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'piloted-drone');
}

async function stageTarget(
  host: Page,
  guest: Page | null,
  remoteTargetId: string | null,
  occluded: boolean,
): Promise<any> {
  const wallStage = await host.evaluate((hidden) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.stagePossessedPilotedDroneSensorTarget(hidden)
  ), occluded);
  expect(wallStage).not.toBeNull();
  if (!wallStage) throw new Error(`HF-300 could not find a real ${occluded ? 'occluding' : 'open'} collider stage`);
  let actualTargetId = wallStage.targetId as string;
  if (targetKind === 'remote-human') {
    if (!guest || !remoteTargetId) throw new Error('HF-300 remote target identity is unavailable');
    await guest.evaluate(([x, y, z]) => {
      (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y + 0.65, z, 0, 0);
    }, wallStage.target);
    await host.waitForFunction(({ id, x, z }) => {
      const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
        .find((candidate: any) => candidate.id === id);
      return remote && remote.hp > 0
        && Math.abs(remote.authoritativePosition[0] - x) < 0.3
        && Math.abs(remote.authoritativePosition[2] - z) < 0.3
        && remote.operatorModel !== null;
    }, { id: remoteTargetId, x: wallStage.target[0], z: wallStage.target[2] }, { timeout: 15_000 });
    // The hosted bot is only a real-world collider witness used to discover
    // this pose. Reassign it to the host side and move it away without a death
    // or corpse presentation, so the human sample cannot contain a second
    // overlapping body or a second hostile sensor contact.
    const retiredWitness = await host.evaluate(() => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      const receipt = debug.stageHostedBotAgainstRemote();
      debug.setBotsFrozen(true);
      debug.placeBotRelative(9, -9);
      return receipt;
    });
    expect(retiredWitness).toEqual({ botId: wallStage.targetId, targetId: remoteTargetId });
    actualTargetId = remoteTargetId;
  }
  const aimed = await host.evaluate((id) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.aimPossessedPilotedDroneAtTarget(id)
  ), actualTargetId);
  expect(aimed).toMatchObject({ targetId: actualTargetId });
  await host.waitForFunction(({ id, hidden }) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    const contactIds = state.killstreak.sensorContacts.map((contact: any) => contact.id).sort();
    const reveal = state.dmrThermal.exactOperatorReveal;
    return JSON.stringify(contactIds) === JSON.stringify([id])
      && state.killstreakPresentation.sensorProxyMeshes === 0
      && state.killstreakPresentation.sensorPresentation === 'shared-exact-animated-thermal-operator'
      && (hidden
        ? reveal.activeTargets === 1 && reveal.occludedTargets === 1
          && reveal.visibleOriginalTargets === 0 && reveal.treatmentsPerTarget === 1
        : reveal.activeTargets === 0 && reveal.occludedTargets === 0
          && reveal.visibleOriginalTargets === 1 && reveal.treatmentsPerTarget === 0);
  }, { id: actualTargetId, hidden: occluded }, { timeout: 8_000, polling: 'raf' });
  return {
    ...wallStage,
    targetId: actualTargetId,
    wallWitnessTargetId: wallStage.targetId,
    rangeM: Math.hypot(...aimed.target.map((value: number, index: number) => value - aimed.origin[index])),
  };
}

function exactOperator(operator: any): Record<string, unknown> {
  if (!operator) throw new Error('HF-300 canonical operator telemetry is unavailable');
  return Object.fromEntries([
    'source', 'assetUrl', 'appearance', 'license', 'lod', 'skinnedMeshes', 'runtimeClips',
    'runtimeActionsBound', 'activeClip', 'skeletons', 'visibleSkinnedMeshes',
    'effectivelyVisibleSkinnedMeshes', 'animationContract',
  ].map((key) => [key, operator[key]]));
}

async function sampleTarget(host: Page, id: string): Promise<any> {
  return host.evaluate(({ targetId, kind }) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    const target = kind === 'bot'
      ? state.bots.find((candidate: any) => candidate.id === targetId)
      : state.remotePlayers.find((candidate: any) => candidate.id === targetId);
    if (!target?.operatorModel) throw new Error(`HF-300 target ${targetId} has no canonical operator`);
    const operator = target.operatorModel;
    const sourceOperator = Object.fromEntries([
      'source', 'assetUrl', 'appearance', 'license', 'lod', 'skinnedMeshes', 'runtimeClips',
      'runtimeActionsBound', 'activeClip', 'skeletons', 'visibleSkinnedMeshes',
      'effectivelyVisibleSkinnedMeshes', 'animationContract',
    ].map((key) => [key, operator[key]]));
    return {
      targetId,
      alive: kind === 'bot' ? target.alive === true : target.hp > 0,
      rootIdentity: kind === 'bot'
        ? target.rootUuid
        : `remote-human:${targetId}:${operator.source}:${operator.assetUrl}:${operator.lod}`,
      screenPosition: target.screenPosition,
      normalSource: {
        rootEffectivelyVisible: kind === 'bot'
          ? target.rootEffectivelyVisible === true
          : target.hp > 0 && operator.effectivelyVisibleSkinnedMeshes.length > 0,
        visibleMeshCount: kind === 'bot' ? target.visibleMeshCount : operator.visibleSkinnedMeshes,
      },
      sourceOperator,
      sensorContactIds: state.killstreak.sensorContacts.map((contact: any) => contact.id).sort(),
      sensorProxyMeshes: state.killstreakPresentation.sensorProxyMeshes,
      sensorPresentation: state.killstreakPresentation.sensorPresentation,
      reveal: state.dmrThermal.exactOperatorReveal,
      possession: state.killstreak.actors.find((actor: any) => actor.actorId === state.player.id)?.possession?.kind ?? null,
      matchEpoch: state.killstreak.matchEpoch,
      matchPhase: state.matchPhase,
    };
  }, { targetId: id, kind: targetKind });
}

function targetClip(screenPosition: number[]): Readonly<{ x: number; y: number; width: 320; height: 320 }> {
  if (screenPosition.length !== 3 || !screenPosition.every(Number.isFinite)) {
    throw new Error(`HF-300 target screen position is invalid: ${JSON.stringify(screenPosition)}`);
  }
  const centreX = (screenPosition[0] + 1) * 640;
  const centreY = (1 - screenPosition[1]) * 360;
  return Object.freeze({
    x: Math.max(0, Math.min(960, Math.round(centreX - 160))),
    y: Math.max(0, Math.min(400, Math.round(centreY - 160))),
    width: 320,
    height: 320,
  });
}

async function committedScreenshot(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
  await page.bringToFront();
  await page.evaluate(async () => {
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
    await (window as any).__ATOMIC_ACRES_DEBUG__.awaitCommittedCameraCompletion();
  });
  return page.screenshot({ type: 'png', clip, animations: 'allow' });
}

async function installSameCameraPose(page: Page): Promise<number> {
  await page.bringToFront();
  return page.evaluate(async () => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    const before = debug.snapshot().deterministicReview.captureCamera;
    const captureRevision = debug.setCaptureCameraPose(
      before.position[0], before.position[1], before.position[2],
      before.yaw, before.pitch, before.fov,
    );
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())));
    await debug.awaitCommittedCameraCompletion();
    return captureRevision;
  });
}

async function sampleSameCameraPose(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const fixed = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCamera;
    return {
      position: fixed.position,
      quaternion: fixed.quaternion,
      yaw: fixed.yaw,
      pitch: fixed.pitch,
      fov: fixed.fov,
      near: fixed.near,
      far: fixed.far,
    };
  });
}

async function releaseSameCameraPose(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null));
}

function runtimeEvidence(runtime: any): Record<string, unknown> {
  return {
    requestedBackend: runtime.requestedBackend,
    actualBackend: runtime.actualBackend,
    initialized: runtime.initialized,
    adapterClass: runtime.adapterClass,
    deviceClass: runtime.deviceClass,
    adapterLabel: runtime.adapterLabel,
    softwareAdapter: runtime.softwareAdapter,
    deviceLost: runtime.deviceLost,
    uncapturedErrors: runtime.uncapturedErrors,
    presentationStatus: runtime.presentation?.status,
  };
}

async function restartHostedMatch(host: Page, guest: Page): Promise<void> {
  await expect(host.locator('#rematch')).toHaveText('RETURN EVERYONE TO LOBBY');
  await host.locator('#rematch').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return !state.gameStarted && state.privateMatch?.phase === 'waiting';
  }, undefined, { timeout: 30_000 })));
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.remotePlayers.length === 1 && state.bots.length === 1;
  }, undefined, { timeout: 90_000 })));
}

test(`${targetKind}/${renderer}: exact piloted-drone thermal lifecycle receipt`, async ({ browser, browserName }, testInfo: TestInfo) => {
  test.skip(!enabled, 'Run only through the clean-SHA HF-300 native evidence runner.');
  test.skip(browserName !== 'chromium', 'HF-300 is an installed-Edge Chromium-project gate.');
  expect(process.env.QA_INSTALLED_EDGE).toBe('1');
  expect(exactEdgeExecutable).toMatch(/[\\/]msedge\.exe$/iu);
  expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
  expect(componentRoot).not.toBe('');
  expect(targetKind === 'bot' || peerServer !== null).toBe(true);
  test.setTimeout(renderer === 'webgpu' ? 300_000 : 240_000);

  const startedAt = new Date().toISOString();
  const faults: string[] = [];
  const pages = await startScope(browser, faults);
  const { host, guest } = pages;
  try {
    const servedCandidate = await candidateProvenance(host);
    expect(servedCandidate).toMatchObject({
      schemaVersion: 4,
      channel: 'the-big-one',
      releasePass: 'PASS 71',
      sourceSha: expectedSourceSha,
      path: 'channels/the-big-one',
    });
    await activatePilotedDrone(host);

    const occludedStage = await stageTarget(host, guest, pages.targetId, true);
    const occludedTarget = await sampleTarget(host, occludedStage.targetId);
    const clip = targetClip(occludedTarget.screenPosition);
    const occludedPngBytes = await committedScreenshot(host, clip);
    const occludedPng = pass71Hf300PngEvidence(occludedPngBytes);
    expect(occludedTarget).toMatchObject({
      alive: true,
      sensorContactIds: [occludedStage.targetId],
      sensorProxyMeshes: 0,
      sensorPresentation: 'shared-exact-animated-thermal-operator',
      possession: 'piloted-drone',
      reveal: { activeTargets: 1, occludedTargets: 1, treatmentsPerTarget: 1 },
    });

    const lineOfSightStage = await stageTarget(host, guest, pages.targetId, false);
    expect(lineOfSightStage.targetId).toBe(occludedStage.targetId);
    const lineOfSightTarget = await sampleTarget(host, lineOfSightStage.targetId);
    const lineOfSightClip = targetClip(lineOfSightTarget.screenPosition);
    const lineOfSightPngBytes = await committedScreenshot(host, lineOfSightClip);
    const lineOfSightPng = pass71Hf300PngEvidence(lineOfSightPngBytes);
    expect(lineOfSightTarget).toMatchObject({
      alive: true,
      normalSource: { rootEffectivelyVisible: true },
      sensorContactIds: [lineOfSightStage.targetId],
      reveal: { activeTargets: 0, visibleOriginalTargets: 1, treatmentsPerTarget: 0 },
    });

    const exitStage = await stageTarget(host, guest, pages.targetId, true);
    expect(exitStage.targetId).toBe(occludedStage.targetId);
    const exitBefore = await sampleTarget(host, exitStage.targetId);
    const exitClip = targetClip(exitBefore.screenPosition);
    const exitCameraRevision = await installSameCameraPose(host);
    const exitBeforePngBytes = await committedScreenshot(host, exitClip);
    const exitBeforeCameraPose = await sampleSameCameraPose(host);
    const exitBeforeFixed = await sampleTarget(host, exitStage.targetId);
    expect(exitBeforeFixed).toMatchObject({
      alive: true,
      possession: 'piloted-drone',
      reveal: { activeTargets: 1, occludedTargets: 1, treatmentsPerTarget: 1 },
    });
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.togglePilotedDroneControl())).toBe(true);
    await host.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const actor = state.killstreak.actors.find((candidate: any) => candidate.actorId === state.player.id);
      return (actor?.possession ?? null) === null
        && state.dmrThermal.exactOperatorReveal.activeTargets === 0;
    }, undefined, { timeout: 5_000, polling: 'raf' });
    const exitAfterState = await host.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        possession: state.killstreak.actors.find((actor: any) => actor.actorId === state.player.id)?.possession?.kind ?? null,
        reveal: state.dmrThermal.exactOperatorReveal,
      };
    });
    const exitAfterPngBytes = await committedScreenshot(host, exitClip);
    const exitAfterCameraPose = await sampleSameCameraPose(host);
    await releaseSameCameraPose(host);
    const exitCameraPose = {
      contract: 'hf300-same-capture-camera-pose-v2',
      captureRevision: exitCameraRevision,
      before: exitBeforeCameraPose,
      after: exitAfterCameraPose,
    };

    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.togglePilotedDroneControl())).toBe(true);
    await host.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'piloted-drone');
    const endStage = await stageTarget(host, guest, pages.targetId, true);
    expect(endStage.targetId).toBe(occludedStage.targetId);
    const priorEpoch = (await sampleTarget(host, endStage.targetId)).matchEpoch;
    await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.endMatch());
    await host.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const actor = state.killstreak.actors.find((candidate: any) => candidate.actorId === state.player.id);
      return state.matchPhase === 'ended' && (actor?.possession ?? null) === null
        && state.dmrThermal.exactOperatorReveal.activeTargets === 0;
    }, undefined, { timeout: 15_000 });
    const matchEnd = await host.evaluate((epoch) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        priorEpoch: epoch,
        phase: state.matchPhase,
        possession: state.killstreak.actors.find((actor: any) => actor.actorId === state.player.id)?.possession?.kind ?? null,
        reveal: state.dmrThermal.exactOperatorReveal,
      };
    }, priorEpoch);

    if (guest) await restartHostedMatch(host, guest);
    else {
      await host.locator('#rematch').click();
      await host.waitForFunction(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active'
      ), undefined, { timeout: 60_000 });
    }
    await waitForSupportBarrier(host);
    const rematch = await host.evaluate((epoch) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        priorEpoch: epoch,
        nextEpoch: state.killstreak.matchEpoch,
        phase: state.matchPhase,
        possession: state.killstreak.actors.find((actor: any) => actor.actorId === state.player.id)?.possession?.kind ?? null,
        reveal: state.dmrThermal.exactOperatorReveal,
      };
    }, priorEpoch);
    expect(rematch.nextEpoch).toBeGreaterThan(priorEpoch);

    await activatePilotedDrone(host);
    const deathStage = await stageTarget(host, guest, pages.targetId, true);
    expect(deathStage.targetId).toBe(occludedStage.targetId);
    const deathBefore = await sampleTarget(host, deathStage.targetId);
    expect(deathBefore.alive).toBe(true);
    const deathClip = targetClip(deathBefore.screenPosition);
    const deathCameraRevision = await installSameCameraPose(host);
    const deathBeforePngBytes = await committedScreenshot(host, deathClip);
    const deathBeforeCameraPose = await sampleSameCameraPose(host);
    const deathBeforeFixed = await sampleTarget(host, deathStage.targetId);
    expect(deathBeforeFixed).toMatchObject({
      alive: true,
      possession: 'piloted-drone',
      reveal: { activeTargets: 1, occludedTargets: 1, treatmentsPerTarget: 1 },
    });
    const deathReceipt = targetKind === 'bot'
      ? await host.evaluate((id) => {
        (window as any).__ATOMIC_ACRES_DEBUG__.damageBotWithCause('gun');
        return { kind: 'bot', targetId: id };
      }, deathStage.targetId)
      : await host.evaluate((id) => {
        const receipt = (window as any).__ATOMIC_ACRES_DEBUG__.forceRemoteDeathForReconnect(id);
        return receipt ? { kind: 'remote-human', ...receipt } : null;
      }, deathStage.targetId);
    expect(deathReceipt).not.toBeNull();
    await host.waitForFunction(({ id, kind }) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const target = kind === 'bot'
        ? state.bots.find((candidate: any) => candidate.id === id)
        : state.remotePlayers.find((candidate: any) => candidate.id === id);
      const dead = kind === 'bot' ? target?.alive === false : target?.hp === 0;
      return dead && state.dmrThermal.exactOperatorReveal.activeTargets === 0;
    }, { id: deathStage.targetId, kind: targetKind }, { timeout: 1_500, polling: 'raf' });
    const deathAfterState = await host.evaluate(({ id, kind }) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const target = kind === 'bot'
        ? state.bots.find((candidate: any) => candidate.id === id)
        : state.remotePlayers.find((candidate: any) => candidate.id === id);
      return {
        alive: kind === 'bot' ? target?.alive === true : target?.hp > 0,
        reveal: state.dmrThermal.exactOperatorReveal,
      };
    }, { id: deathStage.targetId, kind: targetKind });
    const deathAfterPngBytes = await committedScreenshot(host, deathClip);
    const deathAfterCameraPose = await sampleSameCameraPose(host);
    await releaseSameCameraPose(host);
    const deathCameraPose = {
      contract: 'hf300-same-capture-camera-pose-v2',
      captureRevision: deathCameraRevision,
      before: deathBeforeCameraPose,
      after: deathAfterCameraPose,
    };

    const finalState = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot());
    const userAgent = await host.evaluate(() => navigator.userAgent);
    const version = browser.version();
    expect(userAgent).toContain(`Edg/${version}`);
    expect(faults).toEqual([]);

    const scope = {
      targetKind,
      mode,
      renderer,
      arenaId: 'atomic-acres',
      renderProfile: 'blender',
      startedAt,
      completedAt: new Date().toISOString(),
      servedCandidate,
      browser: {
        channel: 'msedge', installed: true, userAgent, version, sessionNonce: randomUUID(),
      },
      runtime: runtimeEvidence(finalState.render.runtime),
      staging: {
        source: 'real-active-world-collider-stage',
        targetId: occludedStage.targetId,
        targetRootIdentity: occludedTarget.rootIdentity,
        wallWitnessTargetId: occludedStage.wallWitnessTargetId,
        rangeM: occludedStage.rangeM,
        sensorMaximumRangeM: occludedStage.sensorMaximumRangeM,
        hostedMemberCount: targetKind === 'remote-human'
          ? finalState.privateMatch?.members.length ?? 0
          : 0,
      },
      occluded: {
        targetId: occludedStage.targetId,
        sensorContactIds: occludedTarget.sensorContactIds,
        sensorProxyMeshes: occludedTarget.sensorProxyMeshes,
        sensorPresentation: occludedTarget.sensorPresentation,
        sourceOperator: exactOperator(occludedTarget.sourceOperator),
        screenPosition: occludedTarget.screenPosition,
        clip,
        reveal: occludedTarget.reveal,
        png: occludedPng,
      },
      lineOfSight: {
        targetId: lineOfSightStage.targetId,
        sensorContactIds: lineOfSightTarget.sensorContactIds,
        normalSource: lineOfSightTarget.normalSource,
        sourceOperator: exactOperator(lineOfSightTarget.sourceOperator),
        clip: lineOfSightClip,
        reveal: lineOfSightTarget.reveal,
        png: lineOfSightPng,
      },
      exit: {
        possessionBefore: exitBeforeFixed.possession,
        possessionAfter: exitAfterState.possession,
        cameraPose: exitCameraPose,
        clip: exitClip,
        beforeReveal: exitBeforeFixed.reveal,
        afterReveal: exitAfterState.reveal,
        beforePng: pass71Hf300PngEvidence(exitBeforePngBytes),
        afterPng: pass71Hf300PngEvidence(exitAfterPngBytes),
        pixelDelta: pass71Hf300PngPairMetrics(exitBeforePngBytes, exitAfterPngBytes),
      },
      matchEnd,
      rematch,
      death: {
        targetId: deathStage.targetId,
        targetRootIdentity: deathBeforeFixed.rootIdentity,
        sourceOperator: exactOperator(deathBeforeFixed.sourceOperator),
        targetAliveBefore: deathBeforeFixed.alive,
        targetAliveAfter: deathAfterState.alive,
        deathReceipt,
        cameraPose: deathCameraPose,
        clip: deathClip,
        beforeReveal: deathBeforeFixed.reveal,
        afterReveal: deathAfterState.reveal,
        beforePng: pass71Hf300PngEvidence(deathBeforePngBytes),
        afterPng: pass71Hf300PngEvidence(deathAfterPngBytes),
        pixelDelta: pass71Hf300PngPairMetrics(deathBeforePngBytes, deathAfterPngBytes),
      },
      faults,
    };
    mkdirSync(componentRoot, { recursive: true });
    const componentPath = resolve(componentRoot, `${targetKind}-${renderer}.json`);
    writeFileSync(componentPath, `${JSON.stringify(scope, null, 2)}\n`, 'utf8');
    await testInfo.attach(`hf300-${targetKind}-${renderer}-scope`, {
      body: Buffer.from(`${JSON.stringify(scope, null, 2)}\n`, 'utf8'),
      contentType: 'application/json',
    });
  } finally {
    await Promise.allSettled([
      pages.hostContext.close(),
      pages.guestContext?.close() ?? Promise.resolve(),
    ]);
  }
});
