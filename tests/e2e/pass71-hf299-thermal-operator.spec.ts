import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  pass71Hf299ThermalRasterAttribution,
} from '../../scripts/qa/pass71-hf299-thermal-operator-evidence-contract.mjs';
import {
  attachBrowserDiagnostics,
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type BrowserDiagnostics,
  type OwnedPeerServer,
} from './pass66-e2e-support';

declare global {
  interface Window {
    __ATOMIC_ACRES_DEBUG__?: any;
  }
}

type TargetKind = 'bot' | 'remote';
type Renderer = 'webgl2' | 'webgpu';
type Weapon = 'm14-ebr' | 'railgun';

const enabled = process.env.PASS71_HF299_THERMAL_EVIDENCE === '1';
const expectedSourceSha = process.env.PASS71_HF299_EXPECTED_SOURCE_SHA ?? '';
const componentPath = process.env.PASS71_HF299_COMPONENT_PATH ?? '';
const targetKind = process.env.PASS71_HF299_TARGET_KIND === 'remote' ? 'remote' : 'bot' satisfies TargetKind;
const renderer = process.env.PASS71_HF299_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2' satisfies Renderer;
const weapon = process.env.PASS71_HF299_WEAPON === 'railgun' ? 'railgun' : 'm14-ebr' satisfies Weapon;
const peerPort = Number(process.env.PASS71_HF299_PEER_PORT ?? '4612');
const checkoutSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
let peerServer: OwnedPeerServer | null = null;

if (enabled && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha) || checkoutSourceSha !== expectedSourceSha
  || componentPath === '' || process.env.QA_INSTALLED_EDGE !== '1')) {
  throw new Error('Official HF-299 evidence requires exact candidate A, installed Edge and an owned component path');
}

test.use({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });

function candidateUrl(player: string): string {
  const url = new URL('/', test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', map: 'atomic-acres', renderer,
    render: 'blender', requireWebGPU: renderer === 'webgpu' ? '1' : undefined,
    signal: 'on', grass: 'off', mist: 'off', clouds: 'off', rays: 'off', externalServices: 'off',
    multiplayerQa: '1', peerQaPort: String(peerPort), peerQaPath: peerServer?.path ?? '/peerjs',
    seed: `pass71-hf299-${targetKind}-${renderer}-${weapon}-${player}`,
  })) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

async function openCandidate(context: BrowserContext, player: string, diagnostics: BrowserDiagnostics): Promise<Page> {
  const page = await context.newPage();
  await loadCandidate(page, player, diagnostics);
  return page;
}

async function loadCandidate(page: Page, player: string, diagnostics: BrowserDiagnostics): Promise<void> {
  attachBrowserDiagnostics(page, player, diagnostics);
  await page.goto(candidateUrl(player), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(({ expectedRenderer }) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
    return state?.bootstrap?.stage === 'ready' && state.weaponReady === true
      && state.render.runtime.actualBackend === expectedRenderer
      && state.arenaSelection.id === 'atomic-acres'
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false;
  }, { expectedRenderer: renderer }, { timeout: 120_000 });
  await page.locator('#player-name').fill(player);
}

async function servedCandidate(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HF-299 candidate provenance HTTP ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return Object.fromEntries([
      'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
    ].map((key) => [key, value[key]]));
  });
}

async function deploy(browser: Browser, page: Page, diagnostics: BrowserDiagnostics): Promise<{
  observer: Page;
  targetPage: Page | null;
  targetId: string | null;
  contexts: BrowserContext[];
}> {
  if (targetKind === 'bot') {
    await loadCandidate(page, 'HF299 Solo', diagnostics);
    await page.locator('#solo').click();
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.admissionState();
      return state?.matchPhase === 'active' && state.presentedGameplayFrame > 2;
    }, undefined, { timeout: 90_000 });
    return { observer: page, targetPage: null, targetId: null, contexts: [] };
  }
  if (!peerServer) throw new Error('HF-299 remote evidence requires the owned PeerJS server');
  const hostContext = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  const guestContext = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  const host = await openCandidate(hostContext, 'HF299 Host', diagnostics);
  const guest = await openCandidate(guestContext, 'HF299 Remote', diagnostics);
  await host.locator('#team').selectOption('0');
  await guest.locator('#team').selectOption('1');
  await host.locator('#lobby-bots').selectOption('0');
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
  expect(roomCode).not.toBe('');
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((candidate) => candidate.waitForFunction(() => (
    (window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any)?.privateMatch?.members.length === 2
  ), undefined, { timeout: 45_000 })));
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((candidate) => candidate.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
    return state?.matchPhase === 'active' && state.remotePlayers?.length === 1;
  }, undefined, { timeout: 90_000 })));
  const targetId = await host.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any).remotePlayers[0].id as string);
  return { observer: host, targetPage: guest, targetId, contexts: [hostContext, guestContext] };
}

async function ensurePointerLock(page: Page): Promise<void> {
  const game = page.locator('#game');
  const bounds = await game.boundingBox();
  if (!bounds) throw new Error('HF-299 game canvas has no input bounds');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 8_000 });
}

async function equipEvidenceWeapon(page: Page): Promise<void> {
  await page.evaluate((selectedWeapon) => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    if (selectedWeapon === 'railgun') {
      const staged = api.stageRailgunSpawn(0);
      if (!Array.isArray(staged?.pickupPosition)) throw new Error('HF-299 railgun pickup was not staged');
      api.teleportPlayer(...staged.pickupPosition);
      if (api.interactRailgun() !== true) throw new Error('HF-299 railgun pickup was rejected');
    } else api.equipWeapon(selectedWeapon);
  }, weapon);
  await page.waitForFunction((selectedWeapon) => (
    (window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any)?.player?.weapon === selectedWeapon
  ), weapon, { timeout: 15_000 });
}

async function stageTarget(observer: Page, targetPage: Page | null, expectedTargetId: string | null, occluded: boolean) {
  if (targetKind === 'bot') {
    const stage = await observer.evaluate((behindWall) => (
      (window.__ATOMIC_ACRES_DEBUG__ as any).stageThermalEvidenceBot(behindWall)
    ), occluded);
    expect(stage).toMatchObject({ targetKind: 'bot', hostile: true, living: true, wallBlocked: occluded });
    return stage;
  }
  if (!targetPage || !expectedTargetId) throw new Error('HF-299 remote target is unavailable');
  const target = occluded ? [-9, 1.7, -21.5] : [-9, 1.7, -15.5];
  await targetPage.evaluate(([x, y, z]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    api.teleportPlayer(x, y, z, 0, 0);
    api.setMovement(false);
  }, target);
  await observer.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__ as any).teleportPlayer(-9, 1.7, -12.5, 0, 0));
  await observer.waitForFunction(({ id, position }) => {
    const remote = ((window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any)?.remotePlayers ?? [])
      .find((candidate: any) => candidate.id === id);
    return remote && remote.hp > 0 && Math.hypot(
      remote.authoritativePosition[0] - position[0], remote.authoritativePosition[2] - position[2],
    ) < 0.4;
  }, { id: expectedTargetId, position: target }, { timeout: 15_000 });
  const wallBlocked = await observer.evaluate(({ id }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    const state = api.snapshot();
    const remote = state.remotePlayers.find((candidate: any) => candidate.id === id);
    return api.segmentBlocked(state.player.position[0], state.player.position[2],
      remote.authoritativePosition[0], remote.authoritativePosition[2]);
  }, { id: expectedTargetId });
  expect(wallBlocked).toBe(occluded);
  return { targetId: expectedTargetId, targetKind: 'remote', hostile: true, living: true, wallBlocked };
}

function pngEvidence(bytes: Buffer) {
  return {
    mimeType: 'image/png', width: 1_280, height: 720, byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), dataBase64: bytes.toString('base64'),
  };
}

function exactReveal(snapshot: any) {
  return snapshot.dmrThermal.exactOperatorReveal;
}

function occludedRevealEvidence(snapshot: any) {
  const reveal = exactReveal(snapshot);
  return Object.fromEntries([
    'contract', 'activeTargets', 'activeTargetIds', 'occludedTargets', 'occludedTargetIds',
    'visibleOriginalTargets', 'visibleOriginalTargetIds', 'activeSourceBodyLayers', 'activeModelLayers',
    'activeThermalLayers', 'activeHaloLayers', 'geometryIdentity', 'skeletonIdentity', 'bindMatrixIdentity',
    'meshWorldMatrixIdentity', 'boneWorldMatrixIdentity', 'silhouetteLayerIdentity', 'monochromeThermal',
    'throughGeometry', 'orangeHalo', 'treatmentsPerTarget', 'completeOperatorModels',
    'incompleteTargets', 'proxyMeshes', 'ownedMaterials',
    'materialBudgetExceeded',
  ].map((key) => [key, reveal[key]]));
}

test('captures exact bot or remote M14/Railgun thermal attribution and cleanup', async ({ browser, page }) => {
  test.skip(!enabled, 'Official HF-299 native evidence is opt-in');
  test.setTimeout(240_000);
  const diagnostics: BrowserDiagnostics = { pageErrors: [], consoleErrors: [] };
  const deployed = await deploy(browser, page, diagnostics);
  const observer = deployed.observer;
  const cdp = await observer.context().newCDPSession(observer);
  let rightMouseDown = false;
  try {
    await equipEvidenceWeapon(observer);
    const authority = await stageTarget(observer, deployed.targetPage, deployed.targetId, true);
    await observer.evaluate(() => {
      (globalThis as any).__PASS71_HF299_RMB_EVENTS__ = [];
      window.addEventListener('mousedown', (event) => {
        (globalThis as any).__PASS71_HF299_RMB_EVENTS__.push({
          type: event.type, button: event.button, trusted: event.isTrusted, at: performance.now(),
        });
      }, { capture: true });
    });
    await ensurePointerLock(observer);
    await observer.mouse.down({ button: 'right' });
    rightMouseDown = true;
    await observer.waitForFunction(({ id, selectedWeapon }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
      const reveal = state?.dmrThermal?.exactOperatorReveal;
      const event = ((globalThis as any).__PASS71_HF299_RMB_EVENTS__ ?? [])
        .find((candidate: any) => candidate.type === 'mousedown' && candidate.button === 2 && candidate.trusted === true);
      return state?.player?.weapon === selectedWeapon && state.textChat.adsHeld === true && event
        && reveal?.activeTargets === 1 && reveal.activeTargetIds?.[0] === id
        && reveal.occludedTargets === 1 && reveal.occludedTargetIds?.[0] === id
        && reveal.activeSourceBodyLayers > 0
        && reveal.activeModelLayers === reveal.activeSourceBodyLayers;
    }, { id: authority.targetId, selectedWeapon: weapon }, { polling: 'raf', timeout: 15_000 });
    const trustedRmb = await observer.evaluate(() => (
      ((globalThis as any).__PASS71_HF299_RMB_EVENTS__ ?? [])
        .some((event: any) => event.type === 'mousedown' && event.button === 2 && event.trusted === true)
    ));
    const occludedSnapshot = await observer.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__ as any).snapshot());
    const visibleFrame = await observer.evaluate((targetId) => (
      (window.__ATOMIC_ACRES_DEBUG__ as any).freezeThermalOperatorEvidenceFrame(targetId)
    ), authority.targetId);
    expect(visibleFrame).not.toBeNull();
    const visibleSurface = await cdp.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    });
    const occludedPng = Buffer.from(visibleSurface.data, 'base64');
    const hiddenControl = await observer.evaluate(() => (
      (window.__ATOMIC_ACRES_DEBUG__ as any).captureThermalOperatorHiddenControl()
    ));
    expect(hiddenControl).not.toBeNull();
    const controlSurface = await cdp.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    });
    const controlPng = Buffer.from(controlSurface.data, 'base64');
    const occludedRaster = pass71Hf299ThermalRasterAttribution(occludedPng, controlPng);
    expect(await observer.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__ as any).releaseThermalOperatorEvidenceFrame())).toBe(true);
    await observer.waitForFunction((frozenFrame) => (
      (window.__ATOMIC_ACRES_DEBUG__?.admissionState().presentedGameplayFrame ?? 0) > frozenFrame
    ), visibleFrame.simulationFrame, { timeout: 8_000 });

    const openStage = await stageTarget(observer, deployed.targetPage, authority.targetId, false);
    await observer.waitForFunction((id) => {
      const reveal = (window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any)?.dmrThermal?.exactOperatorReveal;
      return reveal?.activeTargets === 0 && reveal.visibleOriginalTargets === 1
        && reveal.visibleOriginalTargetIds?.[0] === id;
    }, authority.targetId, { polling: 'raf', timeout: 15_000 });
    const unobstructedSnapshot = await observer.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__ as any).snapshot());
    const unobstructedPng = await observer.screenshot({ animations: 'allow' });

    await observer.mouse.up({ button: 'right' });
    rightMouseDown = false;
    await observer.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
      return state?.textChat?.adsHeld === false && state.dmrThermal.exactOperatorReveal.activeTargets === 0;
    });
    const release = await observer.evaluate(() => {
      const state = (window.__ATOMIC_ACRES_DEBUG__ as any).snapshot();
      return { activeTargets: state.dmrThermal.exactOperatorReveal.activeTargets,
        activeModelLayers: state.dmrThermal.exactOperatorReveal.activeModelLayers, adsHeld: state.textChat.adsHeld };
    });

    await stageTarget(observer, deployed.targetPage, authority.targetId, true);
    await observer.mouse.down({ button: 'right' });
    rightMouseDown = true;
    await observer.waitForFunction((id) => (
      (window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any)?.dmrThermal?.exactOperatorReveal?.activeTargetIds?.[0] === id
    ), authority.targetId, { timeout: 15_000 });
    if (targetKind === 'bot') {
      await observer.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__ as any).damageBotWithCause('gun'));
    } else {
      const death = await observer.evaluate((id) => (
        (window.__ATOMIC_ACRES_DEBUG__ as any).forceRemoteDeathForReconnect(id)
      ), authority.targetId);
      expect(death).toMatchObject({ targetId: authority.targetId });
    }
    const deathHandle = await observer.waitForFunction((id) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
      const reveal = state?.dmrThermal?.exactOperatorReveal;
      const targetAlive = state?.bots?.some((bot: any) => bot.id === id && bot.alive)
        || state?.remotePlayers?.some((remote: any) => remote.id === id && remote.hp > 0);
      return reveal?.activeTargets === 0 && targetAlive === false ? {
        activeTargets: reveal.activeTargets, activeModelLayers: reveal.activeModelLayers, targetAlive,
      } : false;
    }, authority.targetId, { timeout: 15_000 });
    const deathState = await deathHandle.jsonValue();
    const cleanupPng = await observer.screenshot({ animations: 'allow' });

    await observer.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__ as any).equipWeapon('carbine'));
    await observer.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
      return state?.player?.weapon === 'carbine' && state.dmrThermal.exactOperatorReveal.activeTargets === 0;
    });
    const swap = await observer.evaluate(() => {
      const state = (window.__ATOMIC_ACRES_DEBUG__ as any).snapshot();
      return { activeTargets: state.dmrThermal.exactOperatorReveal.activeTargets,
        activeModelLayers: state.dmrThermal.exactOperatorReveal.activeModelLayers, weapon: state.player.weapon };
    });
    const final = await observer.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__ as any).snapshot());
    const runtime = final.render.runtime;
    const browserVersion = await observer.context().browser()!.version();
    const browserIdentity = await observer.evaluate(() => ({ userAgent: navigator.userAgent }));
    const runtimeLog = await readPersistedClientRuntimeLog(observer);
    const faults = [...diagnostics.pageErrors, ...diagnostics.consoleErrors, ...runtimeLog.map((entry) => String(entry))];
    const component = {
      schemaVersion: 1,
      contract: 'atomic-acres/pass71-hf299-native-scope-component@1',
      status: 'passed',
      expectedSourceSha,
      checkoutSourceSha,
      servedCandidate: await servedCandidate(observer),
      browser: { version: browserVersion, userAgent: browserIdentity.userAgent },
      scope: {
        targetKind, renderer, weapon, freshProcess: true, trustedRmb,
        runtime: {
          requestedBackend: runtime.requestedBackend, actualBackend: runtime.actualBackend,
          initialized: runtime.initialized, adapterClass: runtime.adapterClass, deviceClass: runtime.deviceClass,
          adapterLabel: runtime.adapterLabel, softwareAdapter: runtime.softwareAdapter,
          deviceLost: runtime.deviceLost, uncapturedErrors: runtime.uncapturedErrors,
          presentationStatus: runtime.presentation.status,
        },
        authority: { targetId: authority.targetId, targetKind, living: true, hostile: true },
        occluded: { targetId: authority.targetId, wallBlocked: authority.wallBlocked,
          reveal: occludedRevealEvidence(occludedSnapshot), visibleFrame, hiddenControl },
        unobstructed: { targetId: openStage.targetId, wallBlocked: openStage.wallBlocked,
          reveal: {
            activeTargets: exactReveal(unobstructedSnapshot).activeTargets,
            activeTargetIds: exactReveal(unobstructedSnapshot).activeTargetIds,
            visibleOriginalTargets: exactReveal(unobstructedSnapshot).visibleOriginalTargets,
            visibleOriginalTargetIds: exactReveal(unobstructedSnapshot).visibleOriginalTargetIds,
          }, ordinarySourceVisible: true, thermalLayers: exactReveal(unobstructedSnapshot).activeThermalLayers },
        cleanup: { release, swap, death: deathState,
          proxyMeshes: exactReveal(final).proxyMeshes,
          domBodyMarkers: Math.max(
            Number(final.railgun.presentation.domBodyMarkers ?? 0),
            Number(final.dmrThermal.domBodyMarkers ?? 0),
          ) },
        occludedImage: pngEvidence(occludedPng),
        occludedControlImage: pngEvidence(controlPng),
        occludedRaster,
        unobstructedImage: pngEvidence(unobstructedPng),
        cleanupImage: pngEvidence(cleanupPng),
      },
      faults,
      claims: { physicalTrustedRmb: true, botAndRemoteOperators: true, webgl2AndWebgpu: true,
        occludedAndOpenLos: true, sameFrameRasterAttribution: true,
        releaseSwapDeathCleanup: true, ownerSubjectiveApproval: 'not-claimed' },
    };
    expect(component.scope.runtime).toMatchObject({ requestedBackend: renderer, actualBackend: renderer,
      initialized: true, softwareAdapter: false, deviceLost: false, uncapturedErrors: 0 });
    expect(component.scope.runtime.presentationStatus).toBe(renderer === 'webgpu' ? 'healthy' : 'synchronous');
    expect(component.scope.occludedRaster.attributableThermalPixels).toBeGreaterThanOrEqual(64);
    expect(component.scope.occludedRaster.maximumChannelDelta).toBeGreaterThanOrEqual(64);
    expect(component.faults).toEqual([]);
    mkdirSync(dirname(componentPath), { recursive: true });
    writeFileSync(componentPath, `${JSON.stringify(component, null, 2)}\n`, 'utf8');
  } finally {
    if (rightMouseDown) await deployed.observer.mouse.up({ button: 'right' }).catch(() => undefined);
    await deployed.observer.evaluate(() => (
      (window.__ATOMIC_ACRES_DEBUG__ as any)?.releaseThermalOperatorEvidenceFrame?.()
    )).catch(() => false);
    await cdp.detach().catch(() => undefined);
    await Promise.all(deployed.contexts.map((context) => context.close().catch(() => undefined)));
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
