import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

const renderer = process.env.PASS66_REAL_ADS_RENDERER === 'webgl2' ? 'webgl2' : 'webgpu';
const renderProfile = process.env.PASS66_REAL_ADS_RENDER_PROFILE ?? (renderer === 'webgpu' ? 'blender' : 'compat');
const output = resolve(process.env.PASS66_REAL_ADS_ARTIFACT_DIR ?? 'artifacts/pass66/real-input-ads-hitl');
const viewport = Object.freeze({ width: 2_560, height: 1_440 });

test.use({
  viewport,
  launchOptions: {
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  },
});

type ScopeKind = 'm40' | 'm14-ebr' | 'railgun';

type ScopeReceipt = Readonly<{
  scope: ScopeKind;
  weapon: 'sniper' | 'm14-ebr' | 'railgun';
  screenshot: string;
  screenshotSha256: string;
  fullFrameNearWhiteFraction: number;
  centreNearWhiteFraction: number;
  imageEntropy: number;
  presentedFrameDelta: number;
  frameDelta: number;
  trustedRightMouseDowns: number;
  overlay: string;
  throughWall?: Readonly<{
    wallBlocked: boolean;
    contacts: number;
    silhouettes: number;
    thermalThroughGeometry: boolean;
  }>;
}>;

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function nearWhiteFraction(image: Buffer, extract?: sharp.Region): Promise<number> {
  let pipeline = sharp(image).removeAlpha();
  if (extract) pipeline = pipeline.extract(extract);
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  let whitePixels = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset]! >= 248 && data[offset + 1]! >= 248 && data[offset + 2]! >= 248) whitePixels += 1;
  }
  return whitePixels / (info.width * info.height);
}

async function ensurePointerLock(page: Page): Promise<void> {
  if (await page.evaluate(() => document.pointerLockElement === document.querySelector('#game'))) return;
  const game = page.locator('#game');
  const box = await game.boundingBox();
  if (!box) throw new Error('Game canvas has no input bounds.');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 5_000 });
}

async function releaseAds(page: Page): Promise<void> {
  await page.mouse.up({ button: 'right' }).catch(() => undefined);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().textChat.adsHeld === false, undefined, { timeout: 5_000 });
}

async function equipStandardWeapon(page: Page, weapon: 'sniper' | 'm14-ebr'): Promise<void> {
  await releaseAds(page);
  await page.evaluate((weaponId) => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    api.equipWeapon(weaponId);
  }, weapon);
  await page.waitForFunction((weaponId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.player?.weapon === weaponId && state?.textChat?.adsHeld === false;
  }, weapon);
}

async function equipRailgunBehindWall(page: Page): Promise<boolean> {
  await releaseAds(page);
  return page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    const staged = api.stageRailgunSpawn(0);
    if (!Array.isArray(staged?.pickupPosition)) throw new Error('Railgun spawn did not expose its pickup position.');
    api.teleportPlayer(...staged.pickupPosition);
    if (!api.interactRailgun()) throw new Error('Railgun pickup was rejected.');
    // The hostile is inside the Aqua house while the player looks through the
    // solid centre section of its front wall. This proves the thermal contact
    // is not merely an unobstructed HUD marker.
    api.teleportPlayer(-9, 1.7, -12.5, 0, 0);
    api.placeBotRelative(0, 9);
    api.setBotsFrozen(true);
    return api.segmentBlocked(-9, -12.5, -9, -21.5);
  });
}

async function captureRealAds(
  page: Page,
  scope: ScopeKind,
  weapon: 'sniper' | 'm14-ebr' | 'railgun',
  overlay: '#sniper-scope' | '#dmr-thermal' | '#railgun-thermal',
  wallBlocked?: boolean,
): Promise<ScopeReceipt> {
  await ensurePointerLock(page);
  const before = await page.evaluate(() => ({
    frameCount: window.__ATOMIC_ACRES_DEBUG__!.snapshot().frameCount,
    presentedGameplayFrame: window.__ATOMIC_ACRES_DEBUG__!.admissionState().presentedGameplayFrame,
    events: (globalThis as any).__PASS66_REAL_ADS_EVENTS__.length,
  }));

  await page.mouse.down({ button: 'right' });
  try {
    await page.waitForFunction(({ weaponId, overlaySelector }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const element = document.querySelector<HTMLElement>(overlaySelector);
      return state?.player?.weapon === weaponId
        && state?.textChat?.adsHeld === true
        && state?.weaponPresentation?.adsProgress >= (weaponId === 'railgun' ? 0.6 : 0.9)
        && element?.hidden === false;
    }, { weaponId: weapon, overlaySelector: overlay }, { polling: 'raf', timeout: 8_000 });

    // Hold real RMB after the optic settles. A caught update exception can
    // increment frameCount before presentation, so require both counters.
    await page.waitForTimeout(1_500);
    const state = await page.evaluate(({ startFrame, startPresented, startEvents }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      let runtimeLog: unknown = null;
      try { runtimeLog = JSON.parse(localStorage.getItem('atomic-acres:client-runtime-log:v1') ?? '[]'); }
      catch { runtimeLog = ['invalid-client-runtime-log-json']; }
      const inputEvents = (globalThis as any).__PASS66_REAL_ADS_EVENTS__.slice(startEvents);
      return {
        snapshot,
        frameDelta: snapshot.frameCount - startFrame,
        presentedFrameDelta: window.__ATOMIC_ACRES_DEBUG__!.admissionState().presentedGameplayFrame - startPresented,
        inputEvents,
        runtimeLog,
        runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false
          || document.querySelector<HTMLElement>('#runtime-error-log')?.hidden === false,
        overlayVisibility: {
          sniper: document.querySelector<HTMLElement>('#sniper-scope')?.hidden === false,
          dmr: document.querySelector<HTMLElement>('#dmr-thermal')?.hidden === false,
          railgun: document.querySelector<HTMLElement>('#railgun-thermal')?.hidden === false,
        },
      };
    }, { startFrame: before.frameCount, startPresented: before.presentedGameplayFrame, startEvents: before.events });

    expect(state.snapshot.textChat.adsHeld, `${scope}: real RMB remains admitted`).toBe(true);
    expect(state.frameDelta, `${scope}: update loop advances while real RMB is held`).toBeGreaterThan(5);
    expect(state.presentedFrameDelta, `${scope}: presented frames advance while real RMB is held`).toBeGreaterThan(5);
    expect(state.runtimeLog, `${scope}: no caught runtime exceptions`).toEqual([]);
    expect(state.runtimeErrorVisible, `${scope}: stack-trace surface remains hidden`).toBe(false);
    expect(state.inputEvents).toContainEqual(expect.objectContaining({ type: 'mousedown', button: 2, trusted: true }));
    expect(state.snapshot.render.runtime).toMatchObject({
      actualBackend: renderer,
      deviceLost: false,
      uncapturedErrors: 0,
      presentation: { status: 'healthy' },
    });

    if (scope === 'm40') {
      expect(state.snapshot.sniperScope.active).toBe(true);
      expect(state.overlayVisibility).toEqual({ sniper: true, dmr: false, railgun: false });
    } else if (scope === 'm14-ebr') {
      expect(state.snapshot.dmrThermal.active).toBe(true);
      expect(state.overlayVisibility).toEqual({ sniper: false, dmr: true, railgun: false });
    } else {
      expect(wallBlocked, 'railgun: staged line of sight crosses solid geometry').toBe(true);
      expect(state.snapshot.railgun.thermalVisible).toBe(true);
      expect(state.overlayVisibility).toEqual({ sniper: false, dmr: false, railgun: true });
      expect(state.snapshot.railgun.presentation).toMatchObject({
        thermalActive: true,
        thermalThroughGeometry: true,
      });
      expect(state.snapshot.railgun.presentation.thermalContacts).toBeGreaterThanOrEqual(1);
      expect(state.snapshot.railgun.presentation.worldSilhouettes).toBeGreaterThanOrEqual(1);
    }

    const screenshotPath = resolve(output, `${scope}-${renderer}-${viewport.width}x${viewport.height}-real-rmb.png`);
    const screenshot = await page.screenshot({ path: screenshotPath, animations: 'disabled', timeout: 60_000 });
    const stats = await sharp(screenshot).stats();
    const fullFrameWhite = await nearWhiteFraction(screenshot);
    const centreWhite = await nearWhiteFraction(screenshot, {
      left: Math.floor(viewport.width * 0.3),
      top: Math.floor(viewport.height * 0.3),
      width: Math.floor(viewport.width * 0.4),
      height: Math.floor(viewport.height * 0.4),
    });
    expect(fullFrameWhite, `${scope}: full frame is not a whiteout`).toBeLessThan(0.85);
    expect(centreWhite, `${scope}: optic centre is not a whiteout`).toBeLessThan(0.85);
    expect(stats.entropy, `${scope}: screenshot retains visible scene/optic detail`).toBeGreaterThan(1.5);

    return Object.freeze({
      scope,
      weapon,
      screenshot: screenshotPath.replaceAll('\\', '/'),
      screenshotSha256: sha256(screenshot),
      fullFrameNearWhiteFraction: fullFrameWhite,
      centreNearWhiteFraction: centreWhite,
      imageEntropy: stats.entropy,
      presentedFrameDelta: state.presentedFrameDelta,
      frameDelta: state.frameDelta,
      trustedRightMouseDowns: state.inputEvents.filter((event: any) => event.type === 'mousedown' && event.trusted).length,
      overlay: overlay.slice(1),
      ...(scope === 'railgun' ? {
        throughWall: Object.freeze({
          wallBlocked: wallBlocked === true,
          contacts: state.snapshot.railgun.presentation.thermalContacts,
          silhouettes: state.snapshot.railgun.presentation.worldSilhouettes,
          thermalThroughGeometry: state.snapshot.railgun.presentation.thermalThroughGeometry,
        }),
      } : {}),
    });
  } finally {
    await page.mouse.up({ button: 'right' });
  }
}

test('M40, M14 EBR, and Railgun survive real right-mouse ADS with their own readable optics', async ({ page }) => {
  test.setTimeout(renderer === 'webgpu' ? 180_000 : 120_000);
  mkdirSync(output, { recursive: true });
  const sourceStatusBefore = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
  if (process.env.PASS66_REAL_ADS_REQUIRE_CLEAN === '1') expect(sourceStatusBefore.trim(), 'exact-SHA evidence requires a clean source tree').toBe('');
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (process.env.PASS66_REAL_ADS_SOURCE_SHA) {
    expect(sourceSha, 'browser evidence source SHA').toBe(process.env.PASS66_REAL_ADS_SOURCE_SHA);
  }
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) consoleErrors.push(message.text());
  });

  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&map=atomic-acres&renderer=${renderer}${requireWebGpu}&render=${renderProfile}&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass66-real-input-ads`);
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    (globalThis as any).__PASS66_REAL_ADS_EVENTS__ = [];
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Game canvas unavailable.');
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 2) (globalThis as any).__PASS66_REAL_ADS_EVENTS__.push({
        type: 'mousedown', button: event.button, trusted: event.isTrusted, at: performance.now(),
      });
    }, { capture: true });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 2) (globalThis as any).__PASS66_REAL_ADS_EVENTS__.push({
        type: 'mouseup', button: event.button, trusted: event.isTrusted, at: performance.now(),
      });
    }, { capture: true });
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    api.startSolo();
    api.setBotsFrozen(true);
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state?.matchPhase === 'active';
  }, undefined, { timeout: 60_000 });

  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    // startSolo() creates the canonical bot after the bootstrap call above, so
    // freeze again only once the active generation owns that bot. Otherwise it
    // can kill and respawn the evidence player between scoped cases.
    api.setBotsFrozen(true);
    api.placeBotAhead(6);
    api.aimAtBot('body');
  });

  const receipts: ScopeReceipt[] = [];
  await equipStandardWeapon(page, 'sniper');
  receipts.push(await captureRealAds(page, 'm40', 'sniper', '#sniper-scope'));
  await releaseAds(page);

  await equipStandardWeapon(page, 'm14-ebr');
  receipts.push(await captureRealAds(page, 'm14-ebr', 'm14-ebr', '#dmr-thermal'));
  await releaseAds(page);

  const wallBlocked = await equipRailgunBehindWall(page);
  receipts.push(await captureRealAds(page, 'railgun', 'railgun', '#railgun-thermal', wallBlocked));
  await releaseAds(page);

  const finalState = await page.evaluate(() => ({
    snapshot: window.__ATOMIC_ACRES_DEBUG__!.snapshot(),
    events: (globalThis as any).__PASS66_REAL_ADS_EVENTS__,
  }));
  expect(finalState.events.filter((event: any) => event.type === 'mousedown' && event.trusted)).toHaveLength(3);
  expect(finalState.events.filter((event: any) => event.type === 'mouseup' && event.trusted).length).toBeGreaterThanOrEqual(3);
  expect(finalState.snapshot.textChat.adsHeld).toBe(false);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  const sourceStatusAfter = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
  expect(sourceStatusAfter, 'shared source must remain byte-set stable during the browser run').toBe(sourceStatusBefore);
  const receipt = Object.freeze({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSha,
    cleanSource: sourceStatusAfter.trim().length === 0,
    sourceStatusSha256: sha256(sourceStatusAfter),
    renderer,
    renderProfile,
    viewport,
    browserVersion: page.context().browser()?.version() ?? 'unknown',
    realInputOnly: true,
    scopes: receipts,
    runtime: finalState.snapshot.render.runtime,
    diagnostics: Object.freeze({ pageErrors, consoleErrors }),
  });
  writeFileSync(resolve(output, `receipt-${renderer}.json`), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
});
