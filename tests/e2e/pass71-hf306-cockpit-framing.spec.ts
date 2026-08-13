import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  PASS71_HF306_ACTIONS,
  PASS71_HF306_RENDERERS,
  PASS71_HF306_VIEWPORTS,
} from '../../scripts/qa/pass71-hf306-cockpit-evidence-contract.mjs';

type Renderer = typeof PASS71_HF306_RENDERERS[number];
type Viewport = typeof PASS71_HF306_VIEWPORTS[number];
type Action = typeof PASS71_HF306_ACTIONS[number];

const componentPath = process.env.PASS71_HF306_COMPONENT_PATH;
const expectedSourceSha = process.env.PASS71_HF306_EXPECTED_SOURCE_SHA;
const checkoutSourceSha = componentPath
  ? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim()
  : undefined;
const installedEdge = process.env.QA_INSTALLED_EDGE === '1';
const scopes: any[] = [];
const aggregateFaults: string[] = [];
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

if (componentPath && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')
  || checkoutSourceSha !== expectedSourceSha || !installedEdge)) {
  throw new Error('Official HF-306 components require exact-SHA installed-Edge evidence');
}

test.use({
  viewport: { width: 1_920, height: 1_080 },
  deviceScaleFactor: 1,
  launchOptions: {
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  },
});

async function candidateProvenance(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HF-306 candidate provenance request failed: ${response.status}`);
    const value = await response.json() as any;
    return {
      schemaVersion: value.schemaVersion,
      channel: value.channel,
      releasePass: value.releasePass,
      sourceSha: value.sourceSha,
      path: value.path,
      treeSha256: value.treeSha256,
      exactRootFileCount: value.exactRootFileCount,
    };
  });
}

async function installFaultTripwires(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const audit = { faults: [] as string[], trustedInputs: [] as Array<{ type: string; code: string; button: number; trusted: boolean }> };
    (globalThis as any).__PASS71_HF306_AUDIT__ = audit;
    addEventListener('unhandledrejection', (event) => audit.faults.push(`unhandledrejection:${String(event.reason)}`));
    addEventListener('error', (event) => audit.faults.push(`window-error:${event.message}`));
    for (const type of ['keydown', 'keyup', 'mousedown', 'mouseup'] as const) {
      addEventListener(type, (event) => {
        const input = event as KeyboardEvent & MouseEvent;
        audit.trustedInputs.push({
          type,
          code: input.code ?? '',
          button: Number.isFinite(input.button) ? input.button : -1,
          trusted: input.isTrusted,
        });
      }, { capture: true });
    }
  });
}

async function deploy(page: Page, renderer: Renderer) {
  await page.addInitScript((storedLoadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
  }, loadout);
  await page.bringToFront();
  const required = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(
    `/?release=latest&map=atomic-acres&renderer=${renderer}${required}`
      + '&render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off'
      + `&seed=pass71-hf306-cockpit-${renderer}`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 },
  );
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 90_000 });
  await page.locator('#player-name').fill(`Pass 71 HF-306 ${renderer}`);
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug?.snapshot() as any;
    const support = snapshot?.supportVehiclePresentation;
    const requiredAssets = support?.requiredAssets ?? [];
    const loadedAssets = support?.loadedAssets ?? [];
    return snapshot?.gameStarted === true && snapshot?.matchPhase === 'active'
      && debug.admissionState().presentedGameplayFrame > 2
      && support?.state === 'ready' && requiredAssets.length > 0
      && requiredAssets.length === loadedAssets.length
      && requiredAssets.every((asset: string) => loadedAssets.includes(asset))
      && snapshot.killstreakPresentation?.prewarmedAuthoredSupportFamilies?.includes('chopper');
  }, undefined, { timeout: 90_000, polling: 50 });
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.earnSupport(15);
  });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper'))).toBe(true);
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting'), undefined, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await page.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'chopper-gunner'
    && Boolean((window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation.firstPersonSightline?.alignment),
  undefined, { timeout: 10_000 });
  return candidateProvenance(page);
}

async function instrumentLayout(page: Page) {
  return page.evaluate(() => {
    const ids = ['gunner-hull', 'gunner-ammo', 'gunner-altitude', 'gunner-speed', 'gunner-time', 'gunner-damage'];
    const elements = ids.map((id) => document.querySelector<HTMLElement>(`#${id}`)!);
    const rects = elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom,
        width: bounds.width, height: bounds.height,
      };
    });
    const allVisible = elements.every((element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    });
    const allInsideSafeViewport = rects.every((bounds) => bounds.left >= -1 && bounds.top >= -1
      && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1);
    const allUnclipped = elements.every((element) => element.scrollWidth <= element.clientWidth + 1
      && element.scrollHeight <= element.clientHeight + 1);
    const platform = document.querySelector<HTMLElement>('#gunner-platform')!;
    const missileStatus = document.querySelector<HTMLElement>('#gunner-missile-status')!;
    const missileBounds = missileStatus.getBoundingClientRect();
    const centre = { x: innerWidth / 2, y: innerHeight / 2 };
    const centreDomOccluders = document.elementsFromPoint(centre.x, centre.y)
      .filter((entry) => entry instanceof HTMLElement && entry.id !== 'game'
        && entry.tagName !== 'HTML' && entry.tagName !== 'BODY'
        && getComputedStyle(entry).pointerEvents !== 'none')
      .map((entry) => (entry as HTMLElement).id || (entry as HTMLElement).className || entry.tagName);
    const reticle = document.querySelector<HTMLElement>('.gunner-reticle')!;
    const reticleCentreClear = [...reticle.children].every((child) => {
      const bounds = (child as HTMLElement).getBoundingClientRect();
      return !(centre.x >= bounds.left && centre.x <= bounds.right
        && centre.y >= bounds.top && centre.y <= bounds.bottom);
    });
    return {
      ids,
      texts: elements.map((element) => element.textContent?.trim() ?? ''),
      rects,
      allVisible,
      allInsideSafeViewport,
      allUnclipped,
      platformVisible: getComputedStyle(platform).display !== 'none' && platform.textContent?.trim() === 'CHOPPER GUNNER',
      missileStatusVisible: !missileStatus.hidden && getComputedStyle(missileStatus).display !== 'none',
      missileStatusInsideSafeViewport: missileBounds.left >= -1 && missileBounds.top >= -1
        && missileBounds.right <= innerWidth + 1 && missileBounds.bottom <= innerHeight + 1,
      centreDomOccluders,
      reticleCentreClear,
    };
  });
}

async function waitForFrameAdvance(page: Page, startingFrame: number) {
  await page.waitForFunction((frame) => window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame > frame,
    startingFrame, { timeout: 5_000, polling: 'raf' });
}

async function waitForPresentationCompletion(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry() as any;
    return presentation.completedSequence >= presentation.submissionSequence
      && presentation.completionFailures === 0;
  }, undefined, { timeout: 8_000, polling: 'raf' });
}

function attachment(key: string, bytes: Buffer, viewport: Viewport) {
  const [viewportId, suffix] = key.split('/');
  return {
    key,
    kind: suffix === 'visible' ? 'visible' : suffix === 'hidden-control' ? 'hidden-control' : 'action',
    viewportId,
    action: PASS71_HF306_ACTIONS.includes(suffix as Action) ? suffix : null,
    mimeType: 'image/png',
    encoding: 'lossless-png-embedded-base64',
    byteLength: bytes.length,
    width: viewport.width,
    height: viewport.height,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pngBase64: bytes.toString('base64'),
  };
}

function rasterRegions(viewport: Viewport) {
  const sideHeight = Math.max(1, Math.floor(viewport.height * 0.82));
  const sideWidth = Math.max(1, Math.floor(viewport.width * 0.4));
  const instrumentTop = Math.floor(viewport.height * 0.64);
  const centreWidth = Math.max(8, Math.floor(viewport.width * 0.08));
  const centreHeight = Math.max(8, Math.floor(viewport.height * 0.08));
  return {
    left: { left: 0, top: 0, width: sideWidth, height: sideHeight },
    right: { left: viewport.width - sideWidth, top: 0, width: sideWidth, height: sideHeight },
    instruments: { left: 0, top: instrumentTop, width: Math.max(1, Math.floor(viewport.width * 0.58)), height: viewport.height - instrumentTop },
    centre: { left: Math.floor((viewport.width - centreWidth) / 2), top: Math.floor((viewport.height - centreHeight) / 2), width: centreWidth, height: centreHeight },
  };
}

async function rasterDifference(visible: Buffer, hidden: Buffer, viewport: Viewport) {
  const decode = async (bytes: Buffer) => sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [official, control] = await Promise.all([decode(visible), decode(hidden)]);
  expect(official.info).toMatchObject({ width: viewport.width, height: viewport.height, channels: 3 });
  expect(control.info).toMatchObject({ width: viewport.width, height: viewport.height, channels: 3 });
  const results: Record<string, unknown> = {};
  for (const [name, crop] of Object.entries(rasterRegions(viewport))) {
    let changedPixelsAboveEight = 0;
    let changedPixelsAboveTwentyFour = 0;
    let maximumPerceptualDifference = 0;
    let minimumChangedY: number | null = null;
    let maximumChangedY: number | null = null;
    const changedRows = new Set<number>();
    for (let y = crop.top; y < crop.top + crop.height; y += 1) {
      for (let x = crop.left; x < crop.left + crop.width; x += 1) {
        const offset = (y * viewport.width + x) * 3;
        const difference = Math.abs(official.data[offset]! - control.data[offset]!) * 0.2126
          + Math.abs(official.data[offset + 1]! - control.data[offset + 1]!) * 0.7152
          + Math.abs(official.data[offset + 2]! - control.data[offset + 2]!) * 0.0722;
        if (difference > 8) {
          changedPixelsAboveEight += 1;
          changedRows.add(y);
          minimumChangedY = minimumChangedY === null ? y : Math.min(minimumChangedY, y);
          maximumChangedY = maximumChangedY === null ? y : Math.max(maximumChangedY, y);
        }
        if (difference > 24) changedPixelsAboveTwentyFour += 1;
        maximumPerceptualDifference = Math.max(maximumPerceptualDifference, difference);
      }
    }
    const pixelCount = crop.width * crop.height;
    results[name] = {
      crop,
      pixelCount,
      changedPixelsAboveEight,
      changedPixelsAboveTwentyFour,
      materiallyChangedPixelRatio: changedPixelsAboveEight / pixelCount,
      highContrastChangedPixelRatio: changedPixelsAboveTwentyFour / pixelCount,
      maximumPerceptualDifference,
      minimumChangedY,
      maximumChangedY,
      topViewportRatio: minimumChangedY === null ? null : minimumChangedY / viewport.height,
      bottomViewportRatio: maximumChangedY === null ? null : maximumChangedY / viewport.height,
      changedRowCount: changedRows.size,
      changedRowCoverageRatio: changedRows.size / crop.height,
    };
  }
  return results;
}

async function ensurePointerLock(page: Page): Promise<void> {
  if (await page.evaluate(() => document.pointerLockElement === document.querySelector('#game'))) return;
  const bounds = await page.locator('#game').boundingBox();
  if (!bounds) throw new Error('HF-306 game canvas has no trusted-input bounds');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, {
    timeout: 5_000,
  });
}

async function cockpitState(page: Page) {
  return page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug.snapshot() as any;
    const presentation = debug.samplePresentationTelemetry() as any;
    const firstPerson = snapshot.killstreakPresentation.firstPersonSightline;
    const entityId = firstPerson?.entityId ?? null;
    const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === entityId) ?? null;
    return {
      frame: debug.admissionState().presentedGameplayFrame,
      entity,
      firstPerson,
      controlAdmission: snapshot.killstreakControlAdmission,
      weaponActionsPresented: snapshot.killstreakPresentation.chopperWeaponActionsPresented,
      presentation: {
        status: presentation.status,
        submissionSequence: presentation.submissionSequence,
        completedSequence: presentation.completedSequence,
        completionFailures: presentation.completionFailures,
      },
    };
  });
}

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(
    (right[0] ?? 0) - (left[0] ?? 0),
    (right[1] ?? 0) - (left[1] ?? 0),
    (right[2] ?? 0) - (left[2] ?? 0),
  );
}

async function trustedInputIndex(page: Page): Promise<number> {
  return page.evaluate(() => (globalThis as any).__PASS71_HF306_AUDIT__.trustedInputs.length);
}

async function trustedInputObserved(
  page: Page,
  startingIndex: number,
  predicate: Readonly<{ type: string; code?: string; button?: number }>,
): Promise<boolean> {
  return page.evaluate(({ index, expected }) => {
    const inputs = (globalThis as any).__PASS71_HF306_AUDIT__.trustedInputs.slice(index) as any[];
    return inputs.some((input) => input.trusted === true && input.type === expected.type
      && (expected.code === undefined || input.code === expected.code)
      && (expected.button === undefined || input.button === expected.button));
  }, { index: startingIndex, expected: predicate });
}

async function stopEvidenceControl(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.requestPossessedChopperEvidenceControl({
      thrustQ: 0,
      strafeQ: 0,
      verticalQ: 0,
      fire: false,
      missileFire: false,
    });
    debug.releasePossessedChopperEvidenceControl();
  });
}

async function captureAction(
  page: Page,
  viewport: Viewport,
  action: Action,
): Promise<{ receipt: Record<string, unknown>; screenshot: Buffer }> {
  const starting = await cockpitState(page);
  expect(starting.entity).not.toBeNull();
  expect(starting.firstPerson).not.toBeNull();
  const inputIndex = await trustedInputIndex(page);
  let outcomeState: any = null;
  let trustedInput = false;
  try {
    if (action === 'movement') {
      await page.keyboard.down('KeyW');
      expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__
        .requestPossessedChopperEvidenceControl({ thrustQ: 1 }))).toBe(true);
      await expect.poll(async () => {
        const state = await cockpitState(page);
        return state.entity ? distance(starting.entity.position, state.entity.position) : 0;
      }, { timeout: 3_000, intervals: [16, 32, 50] }).toBeGreaterThan(0.01);
      outcomeState = await cockpitState(page);
      trustedInput = await trustedInputObserved(page, inputIndex, { type: 'keydown', code: 'KeyW' });
    } else if (action === 'fire') {
      await page.mouse.down({ button: 'left' });
      expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__
        .requestPossessedChopperEvidenceControl({ fire: true }))).toBe(true);
      await expect.poll(async () => (await cockpitState(page)).weaponActionsPresented, {
        timeout: 3_000,
        intervals: [16, 32, 50],
      }).toBeGreaterThan(starting.weaponActionsPresented);
      outcomeState = await cockpitState(page);
      trustedInput = await trustedInputObserved(page, inputIndex, { type: 'mousedown', button: 0 });
    } else {
      await expect.poll(async () => (await cockpitState(page)).entity?.missileCooldownMs ?? -1, {
        timeout: 3_000,
        intervals: [25, 50],
      }).toBe(0);
      const missileStarting = await cockpitState(page);
      await page.mouse.down({ button: 'right' });
      await page.mouse.up({ button: 'right' });
      await expect.poll(async () => (await cockpitState(page)).entity?.missileAmmo ?? -1, {
        timeout: 3_000,
        intervals: [16, 32, 50],
      }).toBeLessThan(missileStarting.entity.missileAmmo);
      outcomeState = await cockpitState(page);
      trustedInput = await trustedInputObserved(page, inputIndex, { type: 'mousedown', button: 2 });
    }
  } finally {
    if (action === 'movement') await page.keyboard.up('KeyW');
    if (action === 'fire') await page.mouse.up({ button: 'left' });
    await stopEvidenceControl(page);
  }
  expect(trustedInput).toBe(true);
  expect(outcomeState).not.toBeNull();
  expect(outcomeState.controlAdmission).toMatchObject({ action: 'pilot-control', accepted: true });
  if (action === 'fire') expect(outcomeState.controlAdmission).toMatchObject({ fire: true });
  if (action === 'missile') expect(outcomeState.controlAdmission).toMatchObject({ missileFire: true });
  await waitForFrameAdvance(page, starting.frame);
  await waitForPresentationCompletion(page);
  const ending = await cockpitState(page);
  const screenshot = await page.screenshot({ animations: 'allow', scale: 'css' });
  const positionDeltaM = distance(starting.entity.position, ending.entity.position);
  const outcome = action === 'movement'
    ? { controlAction: 'pilot-control', thrustQ: 1 }
    : action === 'fire'
      ? {
          controlAction: 'pilot-control',
          fire: true,
          weaponActionsBefore: starting.weaponActionsPresented,
          weaponActionsAfter: outcomeState.weaponActionsPresented,
        }
      : {
          controlAction: 'pilot-control',
          missileFire: true,
          missileAmmoBefore: starting.entity.missileAmmo,
          missileAmmoAfter: outcomeState.entity.missileAmmo,
        };
  return {
    screenshot,
    receipt: {
      key: `${viewport.id}/${action}`,
      viewportId: viewport.id,
      action,
      trustedInput,
      startingFrame: starting.frame,
      endingFrame: ending.frame,
      startingPosition: starting.entity.position,
      endingPosition: ending.entity.position,
      positionDeltaM,
      outcome,
      presentation: ending.presentation,
      firstPerson: ending.firstPerson,
      instruments: await instrumentLayout(page),
    },
  };
}

function runtimeIdentity(snapshot: any, presentationStatus: string, renderer: Renderer) {
  const runtime = snapshot.render.runtime;
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
    presentationStatus: renderer === 'webgpu' ? presentationStatus : 'synchronous',
  };
}

test.describe.serial('Pass 71 HF-306 exact Chopper Gunner cockpit framing', () => {
  for (const renderer of PASS71_HF306_RENDERERS as readonly Renderer[]) {
    test(`${renderer}: desktop, ultrawide and mobile framing stays bounded through trusted actions`, async ({ browser, page }) => {
      test.setTimeout(180_000);
      const faults: string[] = [];
      page.on('pageerror', (error) => faults.push(`pageerror:${error.stack ?? error.message}`));
      page.on('crash', () => faults.push('page-crash'));
      page.on('console', (message) => {
        if (message.type() === 'error') faults.push(`console:${message.text()}`);
      });
      page.on('requestfailed', (request) => faults.push(
        `requestfailed:${request.method()}:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`,
      ));
      await installFaultTripwires(page);
      const servedCandidate = await deploy(page, renderer);
      if (componentPath) {
        expect(servedCandidate).toMatchObject({
          schemaVersion: 4,
          channel: 'the-big-one',
          releasePass: 'PASS 71',
          sourceSha: expectedSourceSha,
          path: 'channels/the-big-one',
          treeSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        });
      }
      await ensurePointerLock(page);
      const viewportCases: any[] = [];
      const attachments: any[] = [];
      for (const viewport of PASS71_HF306_VIEWPORTS as readonly Viewport[]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForFunction(({ width, height }) => {
          const canvas = document.querySelector<HTMLCanvasElement>('#game');
          return innerWidth === width && innerHeight === height && devicePixelRatio === 1
            && canvas?.width === width && canvas.height === height;
        }, viewport, { timeout: 5_000, polling: 'raf' });
        await ensurePointerLock(page);
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        const frameBeforeResizeCommit = await page.evaluate(() => (
          window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame
        ));
        await waitForFrameAdvance(page, frameBeforeResizeCommit);
        const visibleFrame = await page.evaluate(() => (
          window.__ATOMIC_ACRES_DEBUG__.freezeChopperCockpitEvidenceFrame()
        ));
        expect(visibleFrame).not.toBeNull();
        let hiddenControl: any = null;
        let visiblePng: Buffer;
        let hiddenPng: Buffer;
        try {
          visiblePng = await page.screenshot({ animations: 'allow', scale: 'css' });
          hiddenControl = await page.evaluate(() => (
            window.__ATOMIC_ACRES_DEBUG__.captureChopperCockpitHiddenControl()
          ));
          expect(hiddenControl).not.toBeNull();
          hiddenPng = await page.screenshot({ animations: 'allow', scale: 'css' });
        } finally {
          expect(await page.evaluate(() => (
            window.__ATOMIC_ACRES_DEBUG__.releaseChopperCockpitEvidenceFrame()
          ))).toBe(true);
        }
        const visibleKey = `${viewport.id}/visible`;
        const hiddenKey = `${viewport.id}/hidden-control`;
        attachments.push(attachment(visibleKey, visiblePng!, viewport));
        attachments.push(attachment(hiddenKey, hiddenPng!, viewport));
        const actions = [];
        for (const action of PASS71_HF306_ACTIONS as readonly Action[]) {
          const captured = await captureAction(page, viewport, action);
          actions.push(captured.receipt);
          attachments.push(attachment(`${viewport.id}/${action}`, captured.screenshot, viewport));
        }
        const restored = await cockpitState(page);
        viewportCases.push({
          viewport,
          visibleFrame,
          hiddenControl,
          raster: {
            regions: await rasterDifference(visiblePng!, hiddenPng!, viewport),
            sameFrame: visibleFrame!.simulationFrame === hiddenControl.simulationFrame,
            sameCamera: JSON.stringify(visibleFrame!.camera) === JSON.stringify(hiddenControl.camera),
            visibleSha256: createHash('sha256').update(visiblePng!).digest('hex'),
            hiddenControlSha256: createHash('sha256').update(hiddenPng!).digest('hex'),
          },
          actions,
          postControlRestored: restored.firstPerson?.entityId === visibleFrame!.entityId
            && restored.firstPerson?.dashboardVisible === true
            && restored.firstPerson?.centreSightlineClear === true,
        });
      }
      const final = await page.evaluate(() => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        const snapshot = debug.snapshot() as any;
        const audit = (globalThis as any).__PASS71_HF306_AUDIT__ as any;
        const presentation = debug.samplePresentationTelemetry() as any;
        return {
          snapshot,
          presentationStatus: presentation.status,
          runtimeErrorLog: (document.querySelector<HTMLElement>('#runtime-error-log')?.textContent ?? '').trim(),
          auditFaults: [...audit.faults],
        };
      });
      faults.push(...final.auditFaults);
      const userAgent = await page.evaluate(() => navigator.userAgent);
      expect(userAgent).toMatch(/Edg\//u);
      expect(final.runtimeErrorLog).toBe('');
      expect(faults).toEqual([]);
      const scope = {
        renderer,
        expectedSourceSha,
        checkoutSourceSha,
        servedCandidate,
        browser: { version: browser.version(), userAgent },
        runtime: runtimeIdentity(final.snapshot, final.presentationStatus, renderer),
        viewportCases,
        attachments,
        runtimeErrorLog: final.runtimeErrorLog,
        faults,
      };
      scopes.push(scope);
      aggregateFaults.push(...faults.map((fault) => `${renderer}:${fault}`));
    });
  }
});

test.afterAll(() => {
  if (!componentPath) return;
  const record = {
    schemaVersion: 1,
    contract: 'atomic-acres/pass71-hf306-cockpit-browser-component@1',
    status: scopes.length === PASS71_HF306_RENDERERS.length && aggregateFaults.length === 0 ? 'passed' : 'failed',
    expectedSourceSha,
    checkoutSourceSha,
    scopes,
    faults: aggregateFaults,
  };
  mkdirSync(dirname(resolve(componentPath)), { recursive: true });
  writeFileSync(resolve(componentPath), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  if (record.status !== 'passed') throw new Error(`HF-306 component incomplete: ${JSON.stringify(record)}`);
});
