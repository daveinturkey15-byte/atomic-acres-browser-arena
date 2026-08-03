import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { ADS_SIGHT_PROFILES } from '../../src/ads-sight-profile';
import { WEAPON_IDS, type WeaponId } from '../../src/protocol';

const renderer = process.env.PASS66_ADS_CATALOG_RENDERER ?? 'webgl2';
const renderProfile = process.env.PASS66_ADS_CATALOG_RENDER_PROFILE ?? 'blender';
const expectedSourceSha = process.env.PASS66_ADS_CATALOG_SOURCE_SHA ?? '';
const viewport = Object.freeze({ width: 2_560, height: 1_440 });
const output = resolve(process.cwd(), 'artifacts/pass66/ads-sight-catalog');

type SightReceipt = Readonly<{
  weapon: WeaponId;
  marker: string;
  color: string;
  ringSize: string;
  dotSize: string;
  rotation: string;
  overlay: string | null;
  frameDelta: number;
  presentedFrameDelta: number;
  adsDwellMs: number;
  alignmentErrorCssPixels: number;
  screenshot: string;
  screenshotSha256: string;
  centreCropSha256: string;
  isolatedReticleScreenshot: string;
  isolatedReticleSha256: string;
}>;

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!);
}

async function deploy(page: Page): Promise<void> {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.setViewportSize(viewport);
  await page.goto(`/?release=latest&map=atomic-acres&renderer=${renderer}${requireWebGpu}&render=${renderProfile}&grass=off&mist=off&rays=off&externalServices=off&seed=pass66-ads-catalog`);
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
    api.placeBotAhead(6);
    api.aimAtBot('body');
  });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
}

async function equipForEvidence(page: Page, weapon: WeaponId): Promise<number> {
  const before = await page.evaluate((weaponId) => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    api.setAds(false);
    if (weaponId === 'railgun') {
      const staged = api.stageRailgunSpawn(0);
      if (!Array.isArray(staged.pickupPosition)) throw new Error('Railgun evidence spawn did not expose a pickup position.');
      api.teleportPlayer(...staged.pickupPosition);
      const pickupResult = api.interactRailgun();
      if (pickupResult !== true) throw new Error(`Railgun evidence pickup was rejected: ${String(pickupResult)}`);
    } else {
      api.equipWeapon(weaponId);
    }
    const frameCount = api.snapshot().frameCount;
    api.setAds(true);
    return frameCount;
  }, weapon);

  await page.waitForFunction((weaponId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    if (state?.player?.weapon !== weaponId || state?.weaponPresentation?.adsProgress < 0.98) return false;
    if (weaponId === 'sniper') return state.sniperScope.active === true;
    if (weaponId === 'm14-ebr') return state.dmrThermal.active === true;
    if (weaponId === 'railgun') return state.railgun.thermalVisible === true;
    return document.querySelector<HTMLElement>('#crosshair')?.classList.contains('ads') === true;
  }, weapon, { timeout: 8_000 });
  await page.waitForFunction((frameCount) => window.__ATOMIC_ACRES_DEBUG__!.snapshot().frameCount > frameCount + 1, before, { timeout: 5_000 });
  return page.evaluate((frameCount) => window.__ATOMIC_ACRES_DEBUG__!.snapshot().frameCount - frameCount, before);
}

async function buildContactSheet(entries: readonly SightReceipt[]): Promise<string> {
  const columns = 4;
  const tileWidth = 640;
  const imageHeight = 360;
  const labelHeight = 44;
  const tileHeight = imageHeight + labelHeight;
  const rows = Math.ceil(entries.length / columns);
  const composites = await Promise.all(entries.map(async (entry, index) => {
    const frame = await sharp(resolve(process.cwd(), entry.screenshot))
      .resize(tileWidth, imageHeight, { fit: 'cover' })
      .png()
      .toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#061116"/>
      <text x="18" y="28" fill="#ecfff8" font-family="Arial, sans-serif" font-size="20" font-weight="700">${xml(entry.weapon.toUpperCase())}</text>
      <text x="622" y="28" text-anchor="end" fill="#7fe6d0" font-family="Arial, sans-serif" font-size="15">${xml(entry.overlay ?? entry.marker)}</text>
    </svg>`);
    const x = index % columns * tileWidth;
    const y = Math.floor(index / columns) * tileHeight;
    return [
      { input: frame, left: x, top: y },
      { input: label, left: x, top: y + imageHeight },
    ];
  }));
  const contactSheet = resolve(output, `contact-sheet-${renderer}-${viewport.width}x${viewport.height}.png`);
  await sharp({
    create: { width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: '#02080b' },
  }).composite(composites.flat()).png().toFile(contactSheet);
  return contactSheet;
}

async function buildIsolatedReticleContactSheet(entries: readonly SightReceipt[]): Promise<string> {
  const columns = 5;
  const imageSize = 320;
  const labelHeight = 42;
  const tileHeight = imageSize + labelHeight;
  const rows = Math.ceil(entries.length / columns);
  const composites = await Promise.all(entries.map(async (entry, index) => {
    const frame = await sharp(resolve(process.cwd(), entry.isolatedReticleScreenshot))
      .png()
      .toBuffer();
    const label = Buffer.from(`<svg width="${imageSize}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#061116"/>
      <text x="14" y="27" fill="#ecfff8" font-family="Arial, sans-serif" font-size="17" font-weight="700">${xml(entry.weapon.toUpperCase())}</text>
      <text x="306" y="27" text-anchor="end" fill="#7fe6d0" font-family="Arial, sans-serif" font-size="13">${xml(entry.overlay ?? entry.marker)}</text>
    </svg>`);
    const x = index % columns * imageSize;
    const y = Math.floor(index / columns) * tileHeight;
    return [
      { input: frame, left: x, top: y },
      { input: label, left: x, top: y + imageSize },
    ];
  }));
  const contactSheet = resolve(output, `isolated-reticle-contact-sheet-${renderer}-${viewport.width}x${viewport.height}.png`);
  await sharp({
    create: { width: columns * imageSize, height: rows * tileHeight, channels: 3, background: '#02080b' },
  }).composite(composites.flat()).png().toFile(contactSheet);
  return contactSheet;
}

async function captureIsolatedReticle(page: Page, weapon: WeaponId): Promise<Readonly<{
  path: string;
  bytes: Buffer;
  pixels: Buffer;
}>> {
  const name = `${String(WEAPON_IDS.indexOf(weapon) + 1).padStart(2, '0')}-${weapon}-${renderer}-isolated-reticle.png`;
  const path = resolve(output, name);
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'pass66-ads-isolated-reticle';
    style.textContent = `
      html, body, #hud { background: #02080b !important; }
      body > :not(#hud), canvas, #hud > * { visibility: hidden !important; }
      #hud, #crosshair, #sniper-scope:not([hidden]), #dmr-thermal:not([hidden]), #railgun-thermal:not([hidden]),
      #crosshair::before, #crosshair::after, #sniper-scope *, #dmr-thermal *, #railgun-thermal * {
        visibility: visible !important;
      }
      /* The ADS crosshair carries the hidden attribute, which display:nones the
         element and cannot be overridden by visibility alone. Re-display it so
         the isolated reticle capture sees the real rendered marker. */
      #crosshair { display: initial !important; }
      #hud::before, #hud::after { display: none !important; }
    `;
    document.head.append(style);
  });
  let bytes: Buffer;
  try {
    bytes = await page.screenshot({
      path,
      animations: 'disabled',
      clip: { x: viewport.width / 2 - 160, y: viewport.height / 2 - 160, width: 320, height: 320 },
      timeout: 60_000,
    });
  } finally {
    await page.evaluate(() => document.querySelector('#pass66-ads-isolated-reticle')?.remove());
  }
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(info, `${weapon}: isolated reticle dimensions`).toMatchObject({ width: 320, height: 320, channels: 3 });
  return { path, bytes, pixels: data };
}

function isolatedPixelDifference(left: Buffer, right: Buffer): Readonly<{
  changedPixels: number;
  meanAbsoluteChannelDelta: number;
}> {
  if (left.length !== right.length || left.length !== 320 * 320 * 3) {
    throw new Error(`Isolated reticle buffers have invalid lengths ${left.length}/${right.length}`);
  }
  let changedPixels = 0;
  let absoluteChannelDelta = 0;
  for (let offset = 0; offset < left.length; offset += 3) {
    const delta = Math.abs(left[offset] - right[offset])
      + Math.abs(left[offset + 1] - right[offset + 1])
      + Math.abs(left[offset + 2] - right[offset + 2]);
    if (delta > 0) changedPixels += 1;
    absoluteChannelDelta += delta;
  }
  return Object.freeze({
    changedPixels,
    meanAbsoluteChannelDelta: absoluteChannelDelta / left.length,
  });
}

test('renders a distinct, live ADS sight for every canonical weapon without freezing', async ({ page }) => {
  test.setTimeout(renderer === 'webgpu' ? 480_000 : 360_000);
  mkdirSync(output, { recursive: true });
  for (const staleEvidence of [
    `receipt-${renderer}.json`,
    `contact-sheet-${renderer}-${viewport.width}x${viewport.height}.png`,
    `isolated-reticle-contact-sheet-${renderer}-${viewport.width}x${viewport.height}.png`,
  ]) rmSync(resolve(output, staleEvidence), { force: true });
  test.skip(!/^[a-f0-9]{40}$/u.test(expectedSourceSha), 'Run the explicit clean-SHA Pass 66 ADS catalog command.');
  expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
  expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()).toBe('');
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  expect(sourceSha).toBe(expectedSourceSha);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      consoleErrors.push(message.text());
    }
  });
  await deploy(page);

  const receipts: SightReceipt[] = [];
  const isolatedPixels = new Map<WeaponId, Buffer>();
  const runtimeBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().render.runtime);
  for (const weapon of WEAPON_IDS) {
    const profile = ADS_SIGHT_PROFILES[weapon];
    const frameDelta = await equipForEvidence(page, weapon);
    expect(frameDelta, `${weapon}: frame loop advances through ADS`).toBeGreaterThan(1);

    // A caught runtime frame exception still increments frameCount before the
    // failed update/render path. Prove actual post-ADS presentation progress
    // over a dwell window and reject the persisted runtime log; the longer
    // scoped dwell is the exact M40/M14/Railgun freeze regression boundary.
    const presentedBefore = await page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__!.admissionState().presentedGameplayFrame
    ));
    const adsDwellMs = ['sniper', 'm14-ebr', 'railgun'].includes(weapon) ? 1_200 : 350;
    await page.waitForTimeout(adsDwellMs);
    const stableAds = await page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      let clientRuntimeLog: unknown = null;
      try { clientRuntimeLog = JSON.parse(localStorage.getItem('atomic-acres:client-runtime-log:v1') ?? '[]'); }
      catch { clientRuntimeLog = ['invalid-client-runtime-log-json']; }
      return {
        weapon: state.player.weapon,
        adsProgress: state.weaponPresentation.adsProgress,
        presentedGameplayFrame: window.__ATOMIC_ACRES_DEBUG__!.admissionState().presentedGameplayFrame,
        clientRuntimeLog,
        dmrThermalActive: state.dmrThermal.active,
        railgunThermalVisible: state.railgun.thermalVisible,
        sniperScopeActive: state.sniperScope.active,
        runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false
          || document.querySelector<HTMLElement>('#runtime-error-log')?.hidden === false,
      };
    });
    const presentedFrameDelta = stableAds.presentedGameplayFrame - presentedBefore;
    expect(presentedFrameDelta, `${weapon}: rendered frames continue after ADS settles`).toBeGreaterThan(2);
    expect(stableAds.weapon, `${weapon}: remains equipped through ADS dwell`).toBe(weapon);
    expect(stableAds.adsProgress, `${weapon}: remains fully ADS through dwell`).toBeGreaterThan(0.98);
    expect(stableAds.clientRuntimeLog, `${weapon}: no caught frame/runtime errors`).toEqual([]);
    expect(stableAds.runtimeErrorVisible, `${weapon}: runtime error surfaces stay hidden`).toBe(false);
    if (weapon === 'sniper') expect(stableAds.sniperScopeActive).toBe(true);
    if (weapon === 'm14-ebr') expect(stableAds.dmrThermalActive).toBe(true);
    if (weapon === 'railgun') expect(stableAds.railgunThermalVisible).toBe(true);

    const alignmentErrorCssPixels = await page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__!.snapshot().aimAlignment.errorCssPixels
    ));
    expect(alignmentErrorCssPixels, `${weapon}: authoritative centre-ray alignment`).toBeLessThanOrEqual(1);

    const sight = await page.evaluate(() => {
      const crosshair = document.querySelector<HTMLElement>('#crosshair')!;
      const style = getComputedStyle(crosshair);
      const visibleOverlay = ['sniper-scope', 'dmr-thermal', 'railgun-thermal']
        .find((id) => document.querySelector<HTMLElement>(`#${id}`)?.hidden === false) ?? null;
      return {
        weapon: crosshair.dataset.weapon,
        marker: crosshair.dataset.adsMarker,
        ads: crosshair.classList.contains('ads'),
        opacity: Number(style.opacity),
        color: style.getPropertyValue('--ads-color').trim(),
        ringSize: style.getPropertyValue('--ads-ring-size').trim(),
        dotSize: style.getPropertyValue('--ads-dot-size').trim(),
        rotation: style.getPropertyValue('--ads-rotation').trim(),
        overlay: visibleOverlay,
      };
    });
    expect(sight, `${weapon}: live canonical sight style`).toMatchObject({
      weapon,
      marker: profile.marker,
      ads: true,
      color: profile.color,
      ringSize: `${profile.ringSizePx}px`,
      dotSize: `${profile.dotSizePx}px`,
      rotation: `${profile.rotationDeg}deg`,
    });
    const expectedOverlay = weapon === 'sniper'
      ? 'sniper-scope'
      : weapon === 'm14-ebr'
        ? 'dmr-thermal'
        : weapon === 'railgun'
          ? 'railgun-thermal'
          : null;
    expect(sight.overlay, `${weapon}: dedicated overlay ownership`).toBe(expectedOverlay);
    if (profile.marker === 'scope') expect(sight.opacity, `${weapon}: generic marker suppressed`).toBe(0);
    else expect(sight.opacity, `${weapon}: authored marker visible`).toBeGreaterThan(0.9);

    const screenshotName = `${String(WEAPON_IDS.indexOf(weapon) + 1).padStart(2, '0')}-${weapon}-${renderer}-ads.png`;
    const screenshot = resolve(output, screenshotName);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.setRenderPaused(true));
    let frame: Buffer;
    try {
      frame = await page.screenshot({ path: screenshot, animations: 'disabled', timeout: 60_000 });
    } finally {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.setRenderPaused(false));
    }
    const centreCrop = await sharp(frame)
      .extract({ left: viewport.width / 2 - 160, top: viewport.height / 2 - 160, width: 320, height: 320 })
      .png()
      .toBuffer();
    const isolated = await captureIsolatedReticle(page, weapon);
    isolatedPixels.set(weapon, isolated.pixels);
    receipts.push(Object.freeze({
      weapon,
      marker: profile.marker,
      color: sight.color,
      ringSize: sight.ringSize,
      dotSize: sight.dotSize,
      rotation: sight.rotation,
      overlay: sight.overlay,
      frameDelta,
      presentedFrameDelta,
      adsDwellMs,
      alignmentErrorCssPixels,
      screenshot: `artifacts/pass66/ads-sight-catalog/${screenshotName}`,
      screenshotSha256: sha256(frame),
      centreCropSha256: sha256(centreCrop),
      isolatedReticleScreenshot: isolated.path.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/'),
      isolatedReticleSha256: sha256(isolated.bytes),
    }));
  }

  expect(new Set(receipts.map((entry) => [entry.marker, entry.color, entry.ringSize, entry.dotSize, entry.rotation].join('|'))).size)
    .toBe(WEAPON_IDS.length);
  expect(new Set(receipts.map((entry) => entry.isolatedReticleSha256)).size, 'all isolated rendered reticles are distinct')
    .toBe(WEAPON_IDS.length);
  const pairwiseReticleDifferences: Array<Readonly<{
    left: WeaponId;
    right: WeaponId;
    changedPixels: number;
    meanAbsoluteChannelDelta: number;
  }>> = [];
  for (let leftIndex = 0; leftIndex < WEAPON_IDS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < WEAPON_IDS.length; rightIndex += 1) {
      const left = WEAPON_IDS[leftIndex];
      const right = WEAPON_IDS[rightIndex];
      const difference = isolatedPixelDifference(isolatedPixels.get(left)!, isolatedPixels.get(right)!);
      expect(difference.changedPixels, `${left}/${right}: materially different rendered reticle pixels`).toBeGreaterThanOrEqual(12);
      expect(difference.meanAbsoluteChannelDelta, `${left}/${right}: perceptible rendered reticle delta`).toBeGreaterThan(0.01);
      pairwiseReticleDifferences.push(Object.freeze({ left, right, ...difference }));
    }
  }
  const runtimeAfter = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().render.runtime);
  if (renderer === 'webgpu') {
    expect(runtimeAfter).toMatchObject({
      actualBackend: 'webgpu', deviceLost: false, uncapturedErrors: 0, presentation: { status: 'healthy' },
    });
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  const contactSheet = await buildContactSheet(receipts);
  const isolatedReticleContactSheet = await buildIsolatedReticleContactSheet(receipts);
  writeFileSync(resolve(output, `receipt-${renderer}.json`), `${JSON.stringify({
    schemaVersion: 2,
    status: 'PASS',
    sourceSha,
    renderer,
    renderProfile,
    viewport,
    canonicalWeaponCount: WEAPON_IDS.length,
    uniqueProfileSignatures: new Set(receipts.map((entry) => [entry.marker, entry.color, entry.ringSize, entry.dotSize, entry.rotation].join('|'))).size,
    uniqueCentreCrops: new Set(receipts.map((entry) => entry.centreCropSha256)).size,
    uniqueIsolatedReticles: new Set(receipts.map((entry) => entry.isolatedReticleSha256)).size,
    minimumPairwiseIsolatedChangedPixels: Math.min(...pairwiseReticleDifferences.map((entry) => entry.changedPixels)),
    minimumPairwiseIsolatedMeanAbsoluteChannelDelta: Math.min(...pairwiseReticleDifferences.map((entry) => entry.meanAbsoluteChannelDelta)),
    pairwiseReticleDifferences,
    contactSheet: contactSheet.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/'),
    isolatedReticleContactSheet: isolatedReticleContactSheet.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/'),
    runtimeBefore,
    runtimeAfter,
    pageErrors,
    consoleErrors,
    receipts,
  }, null, 2)}\n`);
});
