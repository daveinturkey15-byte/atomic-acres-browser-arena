import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ADS_WEAPONS = ['carbine', 'mini-uzi'] as const;
type Renderer = 'webgl2' | 'webgpu';

const requestedRenderer = process.env.PASS69_3_ADS_PHYSICAL_RENDERER ?? 'webgl2';
if (requestedRenderer !== 'webgl2' && requestedRenderer !== 'webgpu') {
  throw new Error(`Pass 69.3 physical ADS renderer must be webgl2 or webgpu; received ${requestedRenderer}`);
}
const renderer: Renderer = requestedRenderer;
const renderProfile = process.env.PASS69_3_ADS_PHYSICAL_RENDER_PROFILE ?? 'blender';
if (renderProfile !== 'blender') {
  throw new Error(`Pass 69.3 physical ADS evidence requires the Blender profile; received ${renderProfile}`);
}
const expectedSourceSha = process.env.PASS69_3_ADS_PHYSICAL_SOURCE_SHA ?? '';
const expectedTarget = process.env.PASS69_3_ADS_PHYSICAL_TARGET ?? '';
const officialEvidence = expectedSourceSha !== '' || expectedTarget !== '';
const targetForRenderer = `edge-${renderer}`;
if (officialEvidence && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha) || expectedTarget !== targetForRenderer)) {
  throw new Error(`Pass 69.3 physical ADS evidence has incomplete target provenance for ${targetForRenderer}`);
}
const repositoryRoot = process.cwd();
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const sourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();
const artifactBase = resolve(repositoryRoot, 'artifacts/pass69-3/ads-physical-clearance');
const artifactRoot = resolve(artifactBase, renderer);
const receiptPath = resolve(artifactBase, `receipt-${renderer}.json`);

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function repositoryRelative(path: string): string {
  return relative(repositoryRoot, path).replaceAll('\\', '/');
}

function expectRendererProvenance(runtime: any, label: string): void {
  expect(runtime, `${label}: requested renderer reaches the actual renderer`).toMatchObject({
    requestedBackend: renderer,
    actualBackend: renderer,
    initialized: true,
    failClosed: false,
    deviceLost: false,
    uncapturedErrors: 0,
  });
  if (officialEvidence) expect(runtime.softwareAdapter, `${label}: hardware renderer provenance`).toBe(false);
  if (renderer === 'webgpu') {
    expect(runtime.adapterClass, `${label}: native WebGPU adapter`).toBe('GPUAdapter');
    expect(runtime.deviceClass, `${label}: native WebGPU device`).toBe('GPUDevice');
    expect(runtime.presentation, `${label}: native WebGPU presentation remains healthy`).toMatchObject({ status: 'healthy' });
  } else {
    expect(runtime.adapterClass, `${label}: WebGL2 context provenance`).toBe('WebGL2RenderingContext');
    expect(runtime.presentation, `${label}: WebGL2 stays on synchronous presentation`).toMatchObject({ status: 'synchronous' });
  }
}

async function deploy(page: Page): Promise<void> {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto(`/?release=latest&map=atomic-acres&renderer=${renderer}${requireWebGpu}&render=${renderProfile}&grass=off&mist=off&rays=off&externalServices=off&seed=pass69-3-ads-physical-clearance-${renderer}`);
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state.weaponReady === true;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
  });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
}

function clearanceFor(state: any, weapon: typeof ADS_WEAPONS[number]) {
  return state.weaponPresentation.adsMaterialClearance.catalog
    .find((entry: { weapon: string }) => entry.weapon === weapon);
}

test('carbine and Mini Uzi expose a live physical ADS corridor and restore every material on exit and switch', async ({ browser, page }, testInfo) => {
  test.setTimeout(renderer === 'webgpu' ? 180_000 : 120_000);
  rmSync(artifactRoot, { recursive: true, force: true });
  rmSync(receiptPath, { force: true });
  if (officialEvidence) {
    expect(sourceSha, 'official physical ADS evidence starts at the requested exact HEAD').toBe(expectedSourceSha);
    expect(sourceStatus, 'official physical ADS evidence starts from a clean worktree').toBe('');
  }
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  mkdirSync(artifactRoot, { recursive: true });
  await deploy(page);
  const servedCandidate = await page.evaluate(async () => {
    const response = await fetch('/channels/the-big-one/channel-provenance.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Physical ADS candidate provenance returned HTTP ${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  });
  expect(servedCandidate, 'physical ADS page is bound to the staged candidate').toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: 'PASS 69',
    path: 'channels/the-big-one',
    sourceSha,
  });
  expect(servedCandidate.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(servedCandidate.exactRootFileCount).toEqual(expect.any(Number));
  expect(servedCandidate.exactRootFileCount as number).toBeGreaterThanOrEqual(2);
  const runtimeBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime as any);
  expectRendererProvenance(runtimeBefore, 'initial physical ADS runtime');
  const evidence: Array<Record<string, unknown>> = [];

  for (const [index, weapon] of ADS_WEAPONS.entries()) {
    await page.evaluate((weaponId) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.equipWeapon(weaponId);
    }, weapon);
    await page.waitForFunction((weaponId) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const clearance = (state.weaponPresentation as any).adsMaterialClearance.catalog
        .find((entry: { weapon: string }) => entry.weapon === weaponId);
      return state.player.weapon === weaponId
        && state.weaponPresentation.weapon === weaponId
        && state.weaponPresentation.adsProgress < 0.02
        && clearance?.materialCount > 0;
    }, weapon, { timeout: 8_000 });

    const hip = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
    const hipMaterials = clearanceFor(hip, weapon);
    expect(hip.weaponPresentation.adsMaterialClearance.contract).toBe('static-silhouette-ads-translucency-v2');
    expect(hipMaterials.materialCount, `${weapon}: collected complete static silhouette material set`).toBeGreaterThanOrEqual(5);
    expect(hipMaterials.surfaces, `${weapon}: authored static material families`).toEqual(expect.arrayContaining([
      'gunmetal', 'polymer', 'primary', 'rubber',
    ]));
    expect(hipMaterials.restoredCount, `${weapon}: hip materials start at authored state`).toBe(hipMaterials.materialCount);
    const hipScreenshotPath = resolve(artifactRoot, `${index + 1}-${weapon}-hip-retention.png`);
    const hipScreenshot = await page.screenshot({
      path: hipScreenshotPath,
      animations: 'disabled',
      clip: { x: 640, y: 290, width: 320, height: 320 },
    });
    await testInfo.attach(`${index + 1}-${weapon}-hip-retention`, { body: hipScreenshot, contentType: 'image/png' });

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
    await page.waitForFunction((weaponId) => {
      const presentation = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).weaponPresentation;
      return presentation.weapon === weaponId
        && presentation.adsProgress > 0.98
        && presentation.adsMaterialClearance.blend > 0.98;
    }, weapon, { timeout: 8_000 });
    const ads = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
    const adsMaterials = clearanceFor(ads, weapon);
    expect(ads.weaponPresentation.firstPersonRearOccluderTrim, `${weapon}: actual served rear geometry trim`).toMatchObject({
      applied: true,
      contract: 'rear-sight-axis-spatial-degenerate-v1',
    });
    expect(ads.weaponPresentation.firstPersonRearOccluderTrim.suppressedElements).toBeGreaterThan(0);
    expect(ads.weaponPresentation.firstPersonRearOccluderTrim.suppressionRatio, `${weapon}: hip geometry retention`).toBeLessThan(0.08);
    expect(ads.weaponPresentation.firstPersonAdsSightBore, `${weapon}: actual served physical aperture`).toMatchObject({
      applied: true,
      contract: 'physical-aperture-spatial-degenerate-v1',
      rayCount: 9,
    });
    expect(ads.weaponPresentation.firstPersonAdsSightBore.suppressedElements).toBeGreaterThan(0);
    expect(adsMaterials.transparentCount).toBe(adsMaterials.materialCount);
    expect(adsMaterials.nonOpaqueCount).toBe(adsMaterials.materialCount);
    expect(adsMaterials.depthWriteDisabledCount).toBe(adsMaterials.materialCount);
    expect(adsMaterials.maximumTargetOpacity, `${weapon}: bounded ADS ghost target`).toBeLessThanOrEqual(0.14);
    expect(adsMaterials.maximumOpacity, `${weapon}: settled static silhouette opacity`).toBeLessThanOrEqual(0.14);
    expect(ads.weaponPresentation.adsMaterialClearance.sightPictureRetreat, `${weapon}: ADS-only physical viewmodel retreat`).toBeGreaterThanOrEqual(0.25);
    expect(ads.weaponPresentation.adsOpaqueSightWindow, `${weapon}: nine-ray camera sight window`).toMatchObject({
      contract: 'camera-ndc-sight-window-opaque-weapon-rays-v1',
      rayCount: 9,
      blockedRays: 0,
      maximumHits: 0,
      meshes: [],
    });

    const adsScreenshotPath = resolve(artifactRoot, `${index + 1}-${weapon}-physical-ads-corridor.png`);
    const screenshot = await page.screenshot({
      path: adsScreenshotPath,
      animations: 'disabled',
      clip: { x: 640, y: 290, width: 320, height: 320 },
    });
    await testInfo.attach(`${index + 1}-${weapon}-physical-ads-corridor`, { body: screenshot, contentType: 'image/png' });

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(false));
    await page.waitForFunction((weaponId) => {
      const presentation = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).weaponPresentation;
      return presentation.weapon === weaponId
        && presentation.adsProgress < 0.02
        && presentation.adsMaterialClearance.blend < 0.02;
    }, weapon, { timeout: 8_000 });
    const restored = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
    const restoredMaterials = clearanceFor(restored, weapon);
    expect(restoredMaterials.restoredCount, `${weapon}: exact opacity/transparent/depthWrite restoration`).toBe(restoredMaterials.materialCount);
    evidence.push({
      weapon,
      hip: {
        materials: hipMaterials,
        visibleMeshes: hip.weaponPresentation.modelVisibleMeshCount,
        screenshot: { path: repositoryRelative(hipScreenshotPath), sha256: sha256(hipScreenshot) },
      },
      ads: {
        materials: adsMaterials,
        sightPictureRetreat: ads.weaponPresentation.adsMaterialClearance.sightPictureRetreat,
        sightOffset: ads.weaponPresentation.sightOffset,
        rearOccluderTrim: ads.weaponPresentation.firstPersonRearOccluderTrim,
        sightBore: ads.weaponPresentation.firstPersonAdsSightBore,
        opaqueSightWindow: ads.weaponPresentation.adsOpaqueSightWindow,
        screenshot: { path: repositoryRelative(adsScreenshotPath), sha256: sha256(screenshot) },
      },
      restored: restoredMaterials,
    });
  }

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('pistol'));
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.player.weapon === 'pistol' && state.weaponPresentation.weapon === 'pistol';
  });
  const afterSwitch = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
  for (const weapon of ADS_WEAPONS) {
    const restored = clearanceFor(afterSwitch, weapon);
    expect(restored.restoredCount, `${weapon}: remains restored after switching away`).toBe(restored.materialCount);
  }
  const runtimeAfter = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime as any);
  expectRendererProvenance(runtimeAfter, 'final physical ADS runtime');
  const userAgent = await page.evaluate(() => navigator.userAgent);
  if (officialEvidence) expect(userAgent, 'official physical ADS evidence uses installed Edge').toMatch(/Edg\//u);
  expect(browserErrors).toEqual([]);
  const endingSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const endingSourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  if (officialEvidence) {
    expect(endingSourceSha, 'official physical ADS evidence ends at the same exact HEAD').toBe(sourceSha);
    expect(endingSourceStatus, 'official physical ADS evidence ends with a clean worktree').toBe('');
  }
  writeFileSync(receiptPath, `${JSON.stringify({
    schemaVersion: 1,
    status: 'PASS',
    contract: 'atomic-acres/pass69-3-ads-physical-clearance@1',
    evidenceScope: 'live-physical-viewmodel-clearance',
    target: officialEvidence ? expectedTarget : `development-${renderer}`,
    sourceSha,
    endingSourceSha,
    cleanSource: sourceStatus === '' && endingSourceStatus === '',
    renderer,
    renderProfile,
    viewport: [1_600, 900],
    servedCandidate,
    browser: {
      project: testInfo.project.name,
      channel: officialEvidence ? 'msedge' : 'configured-chromium',
      version: browser.version(),
      userAgent,
    },
    runtimeBefore,
    runtimeAfter,
    weapons: evidence,
    browserErrors,
  }, null, 2)}\n`, 'utf8');
});
