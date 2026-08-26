import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import {
  PASS73_LIVE_GRAPHICS_VIEWPORT,
  assertPass73LiveGraphicsReceipt,
} from './pass73-live-graphics-contract.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const artifactRoot = resolve(repositoryRoot, 'artifacts', 'pass73', 'live-graphics');
const allowedArtifactParent = `${resolve(repositoryRoot, 'artifacts', 'pass73')}${sep}`;
if (!artifactRoot.startsWith(allowedArtifactParent)) throw new Error('Live graphics artifact root escaped Pass 73 artifacts');

function requiredEnvironment(name, pattern) {
  const value = process.env[name]?.trim();
  if (!value || (pattern && !pattern.test(value))) throw new Error(`Pass 73 live graphics requires valid ${name}`);
  return value;
}

function requiredSourceEvidence() {
  const raw = requiredEnvironment('PASS73_LIVE_GRAPHICS_SOURCE_EVIDENCE');
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || value.length < 1
    || value.some((path) => typeof path !== 'string'
      || !/^channels\/the-big-one\/assets\/[^/]+\.js$/u.test(path))) {
    throw new Error('Pass 73 live graphics requires exact staged source-evidence asset identities');
  }
  return Object.freeze([...new Set(value)].sort());
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sha256File(path) {
  return sha256(await readFile(path));
}

const baseUrl = requiredEnvironment('PASS73_LIVE_GRAPHICS_BASE_URL', /^http:\/\/127\.0\.0\.1:\d+\/channels\/the-big-one\/$/u);
const sourceSha = requiredEnvironment('PASS73_LIVE_GRAPHICS_SOURCE_SHA', /^[a-f0-9]{40}$/u);
const sourceTree = requiredEnvironment('PASS73_LIVE_GRAPHICS_SOURCE_TREE', /^[a-f0-9]{40}$/u);
const treeSha256 = requiredEnvironment('PASS73_LIVE_GRAPHICS_TREE_SHA256', /^[a-f0-9]{64}$/u);
const topologyReceiptSha256 = requiredEnvironment('PASS73_LIVE_GRAPHICS_TOPOLOGY_RECEIPT_SHA256', /^[a-f0-9]{64}$/u);
const browserExecutablePath = resolve(requiredEnvironment('PASS73_LIVE_GRAPHICS_BROWSER_PATH'));
const browserExecutableSha256 = requiredEnvironment('PASS73_LIVE_GRAPHICS_BROWSER_SHA256', /^[a-f0-9]{64}$/u);
const exactRootFileCount = Number(requiredEnvironment('PASS73_LIVE_GRAPHICS_FILE_COUNT', /^\d+$/u));
const topologySchemaVersion = Number(requiredEnvironment('PASS73_LIVE_GRAPHICS_TOPOLOGY_SCHEMA', /^\d+$/u));
const releasePass = requiredEnvironment('PASS73_LIVE_GRAPHICS_RELEASE_PASS', /^PASS \d+$/u);
const serverKind = requiredEnvironment('PASS73_LIVE_GRAPHICS_SERVER_KIND');
const sourceEvidenceFiles = requiredSourceEvidence();
if (serverKind !== 'built-staged-release-topology-vite-preview') throw new Error('Pass 73 live graphics rejects non-staged server ownership');
if (!Number.isSafeInteger(exactRootFileCount) || exactRootFileCount < 2
  || !Number.isSafeInteger(topologySchemaVersion) || topologySchemaVersion < 1) {
  throw new Error('Pass 73 live graphics topology counts are invalid');
}
if (!existsSync(browserExecutablePath) || await sha256File(browserExecutablePath) !== browserExecutableSha256) {
  throw new Error('Installed Chrome executable identity does not match the owned wrapper');
}
const localViteOverrides = ['.env', '.env.local', '.env.production.local', '.env.development.local']
  .filter((path) => existsSync(resolve(repositoryRoot, path)));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`Pass 73 live graphics rejects Vite overrides: ${[...localViteOverrides, ...inheritedViteVariables].join(', ')}`);
}

const startingSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim();
const startingTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim();
const startingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
}).trim();
if (startingSha !== sourceSha || startingTree !== sourceTree || startingStatus) {
  throw new Error('Pass 73 live graphics requires the wrapper-bound clean source HEAD/tree');
}

await rm(artifactRoot, { recursive: true, force: true });
await mkdir(artifactRoot, { recursive: true });

const browserErrors = [];
const resourceUrls = new Set();
const mainDocumentNavigations = [];
let browser;

function fatalBrowserErrors(messages) {
  return [...new Set(messages)].filter((message) => !/favicon|leaderboard|Failed to fetch|fonts\.googleapis/iu.test(message));
}

function roundPose(values, digits = 4) {
  return values.map((value) => Number(Number(value).toFixed(digits)));
}

async function settleCommittedFrames(page, frames = 4) {
  await page.evaluate((count) => new Promise((resolveFrames) => {
    let remaining = count;
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) resolveFrames();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }), frames);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.awaitCommittedCameraCompletion());
}

async function samplePhase(page) {
  return page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const render = state.render;
    const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const rounded = (values, digits = 4) => values.map((value) => Number(Number(value).toFixed(digits)));
    return {
      document: {
        id: window.__PASS73_LIVE_GRAPHICS_DOCUMENT_ID__,
        timeOrigin: performance.timeOrigin,
      },
      gameStarted: state.gameStarted,
      matchPhase: state.matchPhase,
      menuVisible: state.menuVisible,
      frameCount: state.frameCount,
      matchEpoch: state.killstreak.matchEpoch,
      player: {
        id: state.player.id,
        team: state.player.team,
        position: rounded(state.player.position),
        yaw: Number(Number(state.player.yaw).toFixed(6)),
        pitch: Number(Number(state.player.pitch).toFixed(6)),
        hp: state.player.hp,
      },
      settings: {
        displayedGraphicsPreset: state.settings.displayedGraphicsPreset,
        requestedPreset: state.settings.requested.graphics.preset,
        liveApplication: copy(state.settings.liveApplication),
      },
      ui: {
        effectiveLabel: document.querySelector('#graphics-effective')?.textContent ?? '',
        graphicsModeLabel: document.querySelector('#graphics-profile')?.selectedOptions?.[0]?.textContent ?? '',
        graphicsStaged: document.documentElement.dataset.graphicsStaged ?? '',
        graphicsPreset: document.documentElement.dataset.graphicsPreset ?? '',
        graphicsLiveProfile: document.documentElement.dataset.graphicsLiveProfile ?? '',
      },
      render: {
        profile: render.profile,
        liveProfile: render.liveProfile,
        representation: render.representation,
        pixelRatio: render.pixelRatio,
        drawingBuffer: copy(render.drawingBuffer),
        shadows: render.shadows,
        authoredShadows: render.authoredShadows,
        shadowMode: render.shadowMode,
        graphicsApplication: copy(render.graphicsApplication),
        runtime: {
          requestedBackend: render.runtime.requestedBackend,
          actualBackend: render.runtime.actualBackend,
          initialized: render.runtime.initialized,
          failClosed: render.runtime.failClosed,
          adapterLabel: render.runtime.adapterLabel,
          adapterClass: render.runtime.adapterClass,
          deviceClass: render.runtime.deviceClass,
          softwareAdapter: render.runtime.softwareAdapter,
          deviceLost: render.runtime.deviceLost,
          uncapturedErrors: render.runtime.uncapturedErrors,
          canvasAlphaMode: render.runtime.canvasAlphaMode,
          canvasAntialias: render.runtime.canvasAntialias,
          canvasSamples: render.runtime.canvasSamples,
          principalHdrSamples: render.runtime.principalHdrSamples,
          bloomSamples: render.runtime.bloomSamples,
          renderPipelineApi: render.runtime.renderPipelineApi,
          presentation: copy(render.runtime.presentation),
        },
        post: {
          owner: render.atomicSignal.owner,
          liveProfile: render.atomicSignal.liveProfile,
          depthAwareBloom: render.atomicSignal.depthAwareBloom,
          bloomGraphId: render.atomicSignal.bloomGraphId,
          bloomOcclusionSource: render.atomicSignal.bloomOcclusionSource,
          canvasAntialias: render.atomicSignal.canvasAntialias,
          canvasSamples: render.atomicSignal.canvasSamples,
          principalHdrSamples: render.atomicSignal.principalHdrSamples,
          bloomSamples: render.atomicSignal.bloomSamples,
          advancedGraphics: copy(render.atomicSignal.advancedGraphics),
        },
        lighting: copy(render.lighting),
        contrast: copy(render.arenaContrastLighting),
        refinement: copy(render.graphicsRefinement),
        atmosphere: copy(render.atmosphere),
        water: copy(render.water),
        playableScene: {
          authoritativeArenaRoots: render.playableScene.authoritativeArenaRoots,
          authoritativeArenaRootIsGameplayRoot: render.playableScene.authoritativeArenaRootIsGameplayRoot,
          duplicateArenaRoots: render.playableScene.duplicateArenaRoots,
          actualArenaVisualPolicy: copy(render.playableScene.actualArenaVisualPolicy),
          tslSystemVisibility: copy(render.playableScene.tslSystemVisibility),
          arena: copy(render.playableScene.arena),
        },
        roots: copy(render.blenderEnvironment),
        qualityAssetState: render.qualityAssetStreaming.atomicAcres,
      },
    };
  });
}

async function fetchServedCandidate(page) {
  return page.evaluate(async () => {
    const response = await fetch('./channel-provenance.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`candidate provenance returned ${response.status}`);
    return response.json();
  });
}

async function captureGameplayCanvas(page, id) {
  await settleCommittedFrames(page);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  try {
    const relativePath = `artifacts/pass73/live-graphics/${id}.png`;
    const absolutePath = resolve(repositoryRoot, relativePath);
    const bytes = await page.locator('#game').screenshot({ path: absolutePath, animations: 'disabled' });
    const metadata = await sharp(bytes).metadata();
    const dimensions = [metadata.width, metadata.height];
    if (metadata.format !== 'png' || !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)) {
      throw new Error(`${id} screenshot is not a valid PNG`);
    }
    return Object.freeze({
      id,
      path: relativePath.replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: sha256(bytes),
      dimensions,
      buffer: bytes,
    });
  } finally {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  }
}

async function pixelDifference(beforePng, afterPng) {
  const before = await sharp(beforePng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(afterPng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (before.info.width !== after.info.width || before.info.height !== after.info.height
    || before.info.channels !== 3 || after.info.channels !== 3 || before.data.length !== after.data.length) {
    throw new Error('Paired gameplay pixel buffers are not dimensionally identical RGB surfaces');
  }
  let changedPixels = 0;
  let absoluteDifference = 0;
  for (let offset = 0; offset < before.data.length; offset += 3) {
    const difference = Math.abs(before.data[offset] - after.data[offset])
      + Math.abs(before.data[offset + 1] - after.data[offset + 1])
      + Math.abs(before.data[offset + 2] - after.data[offset + 2]);
    absoluteDifference += difference;
    if (difference >= 12) changedPixels += 1;
  }
  const totalPixels = before.info.width * before.info.height;
  return Object.freeze({
    dimensions: Object.freeze([before.info.width, before.info.height]),
    totalPixels,
    changedPixels,
    changedRatio: changedPixels / totalPixels,
    meanAbsoluteChannelDifference: absoluteDifference / before.data.length,
  });
}

async function waitForReadyRuntime(page, profile, requireActiveMatch) {
  await page.waitForFunction(({ expectedProfile, activeMatch }) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    if (!state || state.bootstrap?.stage !== 'ready' || state.weaponReady !== true
      || state.render?.runtime?.actualBackend !== 'webgpu'
      || state.render.runtime.softwareAdapter !== false
      || state.render.runtime.deviceLost !== false
      || state.render.runtime.uncapturedErrors !== 0
      || state.render.graphicsApplication?.constructionProfile !== expectedProfile
      || state.render.liveProfile !== expectedProfile) return false;
    if (!activeMatch) return state.gameStarted === false && state.menuVisible === true;
    const roots = state.render.blenderEnvironment;
    const expectedRoots = expectedProfile === 'blender'
      ? roots?.qualityArtRootVisible === true && roots?.proceduralRootActuallyVisible === false
      : roots?.qualityArtRootVisible === false && roots?.proceduralRootActuallyVisible === true;
    return state.gameStarted === true && state.matchPhase === 'active' && state.menuVisible === false
      && state.render.qualityAssetStreaming?.atomicAcres === 'ready'
      && state.render.playableScene?.authoritativeArenaRoots === 1
      && state.render.playableScene?.authoritativeArenaRootIsGameplayRoot === true
      && state.render.playableScene?.duplicateArenaRoots === false
      && state.render.atomicSignal?.advancedGraphics?.volumetricActual?.dustMotes > 0
      && expectedRoots;
  }, { expectedProfile: profile, activeMatch: requireActiveMatch }, { timeout: 120_000, polling: 100 });
}

async function startSoloAndFreeze(page) {
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
    api.setMovement(false);
  });
}

try {
  browser = await chromium.launch({
    executablePath: browserExecutablePath,
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--use-angle=d3d11',
      '--disable-software-rasterizer',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=CalculateNativeWinOcclusion',
      '--no-first-run',
      '--disable-default-apps',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: PASS73_LIVE_GRAPHICS_VIEWPORT[0], height: PASS73_LIVE_GRAPHICS_VIEWPORT[1] },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, '__PASS73_LIVE_GRAPHICS_DOCUMENT_ID__', {
      value: crypto.randomUUID(), configurable: false, enumerable: false, writable: false,
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainDocumentNavigations.push({ url: frame.url(), at: Date.now() });
  });
  page.on('response', (response) => {
    try {
      const url = new URL(response.url());
      if (url.origin === new URL(baseUrl).origin) resourceUrls.add(`${url.pathname}${url.search}`);
    } catch {
      // Ignore malformed third-party diagnostics; browser errors remain fatal.
    }
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"entries":[]}' }));
  await page.route('**/v1/streak', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' }));

  const route = new URL(baseUrl);
  for (const [key, value] of Object.entries({
    renderer: 'webgpu', requireWebGPU: '1', externalServices: 'off', map: 'atomic-acres', seed: '7301',
  })) route.searchParams.set(key, value);
  await page.goto(route.toString(), { waitUntil: 'domcontentloaded' });
  const servedCandidate = await fetchServedCandidate(page);
  await waitForReadyRuntime(page, 'blender', false);
  const initialGraphicsMode = await page.locator('#graphics-profile').evaluate((select) => ({
    value: select.value,
    label: select.selectedOptions[0]?.textContent ?? '',
  }));
  if (initialGraphicsMode.value !== 'high' || initialGraphicsMode.label !== 'QUALITY') {
    throw new Error(`Fresh staged session did not begin in the real Quality preset: ${JSON.stringify(initialGraphicsMode)}`);
  }
  await startSoloAndFreeze(page);
  await waitForReadyRuntime(page, 'blender', true);
  await page.waitForFunction(() => document.querySelector('#banner')?.hidden === true
    && document.querySelector('#countdown')?.hidden === true, undefined, { timeout: 30_000 });

  const fixedPose = await page.evaluate(() => {
    const player = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
    return { position: player.position, yaw: player.yaw, pitch: player.pitch };
  });
  const restoreFixedPose = async () => {
    await page.evaluate((pose) => {
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(
        pose.position[0], pose.position[1], pose.position[2], pose.yaw, pose.pitch,
      );
    }, fixedPose);
    await settleCommittedFrames(page, 3);
  };
  await restoreFixedPose();
  const quality = await samplePhase(page);
  quality.player.position = roundPose(quality.player.position);
  const qualityCapture = await captureGameplayCanvas(page, 'quality');

  const navigationCountBeforeLiveApply = mainDocumentNavigations.length;
  const liveApplyStartedAt = performance.now();
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
  await page.locator('#menu-tab-options').click();
  await page.locator('#graphics-profile').selectOption('performance');
  await page.locator('#graphics-save').click();
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    const advanced = state?.render?.atomicSignal?.advancedGraphics;
    return state?.render?.liveProfile === 'performance'
      && state?.settings?.displayedGraphicsPreset === 'performance'
      && state?.render?.graphicsApplication?.constructionProfile === 'blender'
      && state?.render?.graphicsApplication?.pendingRendererReload === true
      && JSON.stringify([...(state?.render?.graphicsApplication?.stagedReconstruction ?? [])].sort())
        === JSON.stringify(['antiAliasing', 'geometryDetail'].sort())
      && state?.render?.shadows === false
      && state?.render?.lighting?.runtime?.sun?.castShadow === false
      && state?.render?.arenaContrastLighting?.activeLights === 0
      && advanced?.volumetricActual?.dustMotes > 0;
  }, undefined, { timeout: 15_000, polling: 50 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state?.matchPhase === 'active'
      && state?.menuVisible === false && document.querySelector('#menu')?.classList.contains('hidden');
  }, undefined, { timeout: 15_000 });
  await restoreFixedPose();
  const performanceLive = await samplePhase(page);
  performanceLive.player.position = roundPose(performanceLive.player.position);
  const liveApplyElapsedMs = performance.now() - liveApplyStartedAt;
  const navigationCountAfterLiveApply = mainDocumentNavigations.length;
  const performanceLiveCapture = await captureGameplayCanvas(page, 'performance-live');
  const pairedDifference = await pixelDifference(qualityCapture.buffer, performanceLiveCapture.buffer);

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
  await page.locator('#menu-tab-deploy').click();
  await page.waitForFunction(() => {
    const button = document.querySelector('#main-menu');
    return button instanceof HTMLButtonElement && button.hidden === false && button.disabled === false
      && button.getClientRects().length === 1;
  }, undefined, { timeout: 10_000 });
  const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('#main-menu').click();
  await navigationPromise;
  await waitForReadyRuntime(page, 'performance', false);
  const servedCandidateAfter = await fetchServedCandidate(page);
  const postReloadMenu = await samplePhase(page);
  await startSoloAndFreeze(page);
  await waitForReadyRuntime(page, 'performance', true);
  await page.waitForFunction(() => document.querySelector('#banner')?.hidden === true
    && document.querySelector('#countdown')?.hidden === true, undefined, { timeout: 30_000 });
  await restoreFixedPose();
  const performanceReconstructed = await samplePhase(page);
  performanceReconstructed.player.position = roundPose(performanceReconstructed.player.position);
  const reconstructedCapture = await captureGameplayCanvas(page, 'performance-reconstructed');

  const userAgent = await page.evaluate(() => navigator.userAgent);
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }));
  const endingSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim();
  const endingTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true }).trim();
  const endingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
  }).trim();
  const endingExecutableSha256 = await sha256File(browserExecutablePath);
  const fatalErrors = fatalBrowserErrors(browserErrors);
  const stagedCandidate = Object.freeze({
    schemaVersion: topologySchemaVersion,
    channel: 'the-big-one',
    releasePass,
    sourceSha,
    path: 'channels/the-big-one',
    exactRootFileCount,
    treeSha256,
  });
  const screenshots = [qualityCapture, performanceLiveCapture, reconstructedCapture]
    .map(({ buffer: _buffer, ...identity }) => identity);
  const receipt = {
    schema: 'atomic-acres/pass73-live-graphics@2',
    verdict: 'pass',
    zeroSkips: true,
    sourceState: {
      startingSha,
      endingSha,
      expectedSha: sourceSha,
      startingTree,
      endingTree,
      expectedTree: sourceTree,
      cleanBefore: startingStatus === '',
      cleanAfter: endingStatus === '',
    },
    topology: {
      serverKind,
      buildMode: 'production',
      devServer: false,
      baseUrl,
      receiptSha256: topologyReceiptSha256,
      sourceEvidenceFiles,
      stagedCandidate,
      servedCandidate,
      servedCandidateAfter,
      resources: {
        urls: [...resourceUrls].sort(),
        devServerUrls: [...resourceUrls].filter((url) => /(?:\/@vite\/client|\/src\/|\/node_modules\/|\/@fs\/|\/@id\/|\.tsx?(?:\?|$))/iu.test(url)).sort(),
      },
    },
    browser: {
      channel: 'installed-chrome',
      executablePath: browserExecutablePath.replaceAll('\\', '/'),
      executableSha256: browserExecutableSha256,
      endingExecutableSha256,
      version: browser.version(),
      userAgent,
      headless: false,
      contentViewport: [viewport.innerWidth, viewport.innerHeight],
      devicePixelRatio: viewport.devicePixelRatio,
    },
    route: page.url(),
    phases: { quality, performanceLive, postReloadMenu, performanceReconstructed },
    lifecycle: {
      liveApply: {
        elapsedMs: liveApplyElapsedMs,
        navigationCountDelta: navigationCountAfterLiveApply - navigationCountBeforeLiveApply,
        qualityDocumentId: quality.document.id,
        performanceDocumentId: performanceLive.document.id,
      },
      reconstruction: {
        returnedVia: 'main-menu-button',
        navigationCount: mainDocumentNavigations.length - navigationCountBeforeLiveApply,
        documentReplaced: quality.document.id !== performanceReconstructed.document.id,
        qualityDocumentId: quality.document.id,
        reconstructedDocumentId: performanceReconstructed.document.id,
        timeOrigins: [quality.document.timeOrigin, performanceReconstructed.document.timeOrigin],
      },
    },
    pixels: { qualityToLivePerformance: pairedDifference },
    screenshots,
    browserErrors: fatalErrors,
  };
  const expected = {
    sourceSha,
    sourceTree,
    topologySchemaVersion,
    releasePass,
    treeSha256,
    exactRootFileCount,
    topologyReceiptSha256,
    sourceEvidenceFiles,
    browserExecutablePath,
    browserExecutableSha256,
    baseUrl,
  };
  assertPass73LiveGraphicsReceipt(receipt, expected);
  const receiptPath = resolve(artifactRoot, 'receipt.json');
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await writeFile(receiptPath, receiptBytes);
  await writeFile(`${receiptPath}.sha256`, `${sha256(receiptBytes)}  receipt.json\n`, 'utf8');
  console.log('PASS73_LIVE_GRAPHICS', JSON.stringify({
    verdict: receipt.verdict,
    sourceSha,
    treeSha256,
    browser: receipt.browser,
    pixelDifference: pairedDifference,
    receiptPath: receiptPath.replaceAll('\\', '/'),
    receiptSha256: sha256(receiptBytes),
  }, null, 2));
} finally {
  await browser?.close();
  const artifactStat = await stat(artifactRoot).catch(() => null);
  if (artifactStat && !artifactStat.isDirectory()) throw new Error('Live graphics artifact root changed type');
}
