import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'vite';

const artifactRoot = 'artifacts/pass65/smoke-visual-sanity';
const port = Number(process.env.PASS65_SMOKE_VISUAL_PORT ?? '44125');
const allowDirty = process.env.PASS65_SMOKE_ALLOW_DIRTY === '1';
const baselineEdgeThreshold = 12;
const chromeCandidates = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 65 smoke visual sanity requires PASS65_CHROME_PATH or installed Google Chrome');

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const startingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
if (!allowDirty && startingStatus.length > 0) {
  throw new Error('Pass 65 smoke visual sanity requires a clean tracked worktree; use PASS65_SMOKE_ALLOW_DIRTY=1 only for local development');
}

function fatalBrowserErrors(errors) {
  return [...new Set(errors)].filter((message) => (
    /GPUValidationError|device\s*lost|destroyed|uncaptured|WebGPU|render.*stalled|context.*lost/i.test(message)
    || !/favicon|leaderboard|Failed to fetch/i.test(message)
  ));
}

async function pixels(buffer) {
  return sharp(buffer)
    .removeAlpha()
    .resize(320, 180, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function luminance(data, offset) {
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

function analyseFrame(frame, cleanFrame = null) {
  const { data, info } = frame;
  const cleanData = cleanFrame?.data ?? null;
  const pixelCount = info.width * info.height;
  const delta = new Float64Array(pixelCount);
  const cleanLuminance = cleanData ? new Float64Array(pixelCount) : null;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let highLuminancePixels = 0;
  let veryHighLuminancePixels = 0;
  let meanAbsoluteDeltaSum = 0;
  let deltaSquaredSum = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * info.channels;
    const value = luminance(data, offset);
    luminanceSum += value;
    luminanceSquaredSum += value * value;
    if (value >= 210) highLuminancePixels += 1;
    if (value >= 235) veryHighLuminancePixels += 1;
    if (cleanData) {
      const cleanValue = luminance(cleanData, offset);
      cleanLuminance[index] = cleanValue;
      const difference = value - cleanValue;
      delta[index] = difference;
      meanAbsoluteDeltaSum += Math.abs(difference);
      deltaSquaredSum += difference * difference;
    }
  }
  let hardEdgePixels = 0;
  let baselineExcludedEdges = 0;
  let evaluatedEdges = 0;
  let gradientSum = 0;
  let maximumVerticalHardEdgeCoverage = 0;
  let maximumHorizontalHardEdgeCoverage = 0;
  if (cleanData) {
    for (let x = 1; x < info.width; x += 1) {
      let hardEdgesInColumn = 0;
      for (let y = 0; y < info.height; y += 1) {
        const index = y * info.width + x;
        const gradient = Math.abs(delta[index] - delta[index - 1]);
        gradientSum += gradient;
        evaluatedEdges += 1;
        if (Math.abs(cleanLuminance[index] - cleanLuminance[index - 1]) >= baselineEdgeThreshold) {
          baselineExcludedEdges += 1;
        } else if (gradient >= 20) {
          hardEdgePixels += 1;
          hardEdgesInColumn += 1;
        }
      }
      maximumVerticalHardEdgeCoverage = Math.max(maximumVerticalHardEdgeCoverage, hardEdgesInColumn / info.height);
    }
    for (let y = 1; y < info.height; y += 1) {
      let hardEdgesInRow = 0;
      for (let x = 0; x < info.width; x += 1) {
        const index = y * info.width + x;
        const gradient = Math.abs(delta[index] - delta[index - info.width]);
        gradientSum += gradient;
        evaluatedEdges += 1;
        if (Math.abs(cleanLuminance[index] - cleanLuminance[index - info.width]) >= baselineEdgeThreshold) {
          baselineExcludedEdges += 1;
        } else if (gradient >= 20) {
          hardEdgePixels += 1;
          hardEdgesInRow += 1;
        }
      }
      maximumHorizontalHardEdgeCoverage = Math.max(maximumHorizontalHardEdgeCoverage, hardEdgesInRow / info.width);
    }
  }
  const meanLuminance = luminanceSum / pixelCount;
  return Object.freeze({
    meanLuminance,
    luminanceStandardDeviation: Math.sqrt(Math.max(0, luminanceSquaredSum / pixelCount - meanLuminance ** 2)),
    highLuminanceRatio: highLuminancePixels / pixelCount,
    veryHighLuminanceRatio: veryHighLuminancePixels / pixelCount,
    meanAbsoluteDelta: meanAbsoluteDeltaSum / pixelCount,
    rootMeanSquareDelta: Math.sqrt(deltaSquaredSum / pixelCount),
    meanDeltaGradient: gradientSum / Math.max(1, pixelCount * 2),
    hardDeltaEdgeRatio: hardEdgePixels / Math.max(1, pixelCount * 2),
    baselineExcludedEdgeRatio: baselineExcludedEdges / Math.max(1, evaluatedEdges),
    maximumVerticalHardEdgeCoverage,
    maximumHorizontalHardEdgeCoverage,
  });
}

function verifyBaselineEdgeIsolation() {
  const width = 4;
  const height = 4;
  const frame = (sample) => {
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = sample(x, y);
        const offset = (y * width + x) * 3;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
      }
    }
    return { data, info: { width, height, channels: 3 } };
  };
  const structuredClean = frame((x) => x < 2 ? 0 : 200);
  const smokeOverStructure = frame((x) => x < 2 ? 100 : 200);
  const structuralMetrics = analyseFrame(smokeOverStructure, structuredClean);
  if (structuralMetrics.maximumVerticalHardEdgeCoverage !== 0) {
    throw new Error('Smoke visual gate self-test mistook baseline geometry for a smoke-card edge');
  }
  const flatClean = frame(() => 0);
  const actualSmokeEdge = frame((x) => x < 2 ? 100 : 0);
  const smokeEdgeMetrics = analyseFrame(actualSmokeEdge, flatClean);
  if (smokeEdgeMetrics.maximumVerticalHardEdgeCoverage < 0.99) {
    throw new Error('Smoke visual gate self-test failed to detect an actual smoke-card edge');
  }
}

verifyBaselineEdgeIsolation();

function assertFrameContracts(single, multi) {
  const violations = [];
  if (single.meanAbsoluteDelta < 10) violations.push('single smoke volume is visually ineffective');
  if (single.highLuminanceRatio > 0.35) violations.push('single smoke volume produces a near-white frame');
  if (single.baselineExcludedEdgeRatio > 0.35) violations.push('smoke edge scene baseline is too structured for a trustworthy verdict');
  if (single.maximumVerticalHardEdgeCoverage > 0.32) violations.push('single smoke volume exposes a hard vertical card boundary');
  if (single.maximumHorizontalHardEdgeCoverage > 0.36) violations.push('single smoke volume exposes a hard horizontal card boundary');
  if (multi.meanAbsoluteDelta < single.meanAbsoluteDelta * 0.9) violations.push('overlapping smoke does not preserve dense obscuration');
  if (multi.luminanceStandardDeviation < 8) violations.push('overlapping smoke collapses to a flat untextured fill');
  if (multi.maximumVerticalHardEdgeCoverage > 0.4) violations.push('overlapping smoke exposes a hard vertical card boundary');
  if (multi.maximumHorizontalHardEdgeCoverage > 0.44) violations.push('overlapping smoke exposes a hard horizontal card boundary');
  return violations;
}

async function captureCanvas(page) {
  const clip = await page.locator('#game').boundingBox();
  if (!clip || clip.width <= 0 || clip.height <= 0) throw new Error('Smoke visual sanity could not resolve gameplay canvas bounds');
  await page.evaluate(() => {
    document.documentElement.dataset.pass65SmokeCanvasOnly = 'true';
    window.__ATOMIC_ACRES_DEBUG__?.setRenderPaused(true);
  });
  try {
    await page.waitForFunction(() => {
      const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.render?.runtime?.presentation;
      return presentation && presentation.completedSequence >= presentation.submissionSequence;
    }, undefined, { timeout: 12_000 });
    return await page.screenshot({ clip });
  } finally {
    await page.evaluate(() => {
      delete document.documentElement.dataset.pass65SmokeCanvasOnly;
      window.__ATOMIC_ACRES_DEBUG__?.setRenderPaused(false);
    });
  }
}

await mkdir(artifactRoot, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
let browser;
let page;
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--mute-audio', 
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&map=rustworks-1v1&render=blender&grass=on&mist=on&seed=6501`);
  await page.addStyleTag({
    content: 'html[data-pass65-smoke-canvas-only="true"] body > :not(#app), html[data-pass65-smoke-canvas-only="true"] #app > :not(#game) { visibility: hidden !important; }',
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true
      && state?.bootstrap?.stage === 'ready'
      && state?.render?.runtime?.actualBackend === 'webgpu';
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('rustworks-1v1'));
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.arenaSelection?.id === 'rustworks-1v1'
      && state?.arenaSelection?.streaming?.transition?.phase === 'idle'
      && state?.arenaSelection?.streaming?.transition?.failure === null;
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.equipKit('marksman');
    api.startSolo();
    api.setBotsFrozen(true);
    api.setMovement(false);
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true
      && state?.matchPhase === 'active'
      && state?.render?.runtime?.presentation?.status === 'healthy';
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const [x, y, z] = api.snapshot().player.position;
    // Hold unrelated arena animation at one deterministic visual instant so
    // image deltas measure smoke rather than moving lights/atmosphere.
    api.setCaptureCameraPose(x, y, z, 0, 0, undefined, 65_000, 6_501);
  });
  await page.waitForTimeout(1_000);

  const cleanPng = await captureCanvas(page);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stageSmokeVolume(2.5));
  await page.waitForTimeout(1_100);
  const singlePng = await captureCanvas(page);
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.stageSmokeVolume(3.5);
    api.stageSmokeVolume(4.5);
    api.stageSmokeVolume(5.5);
  });
  await page.waitForTimeout(1_100);
  const multiPng = await captureCanvas(page);

  await Promise.all([
    writeFile(`${artifactRoot}/clean.png`, cleanPng),
    writeFile(`${artifactRoot}/single-volume.png`, singlePng),
    writeFile(`${artifactRoot}/multi-volume.png`, multiPng),
  ]);
  const [cleanPixels, singlePixels, multiPixels] = await Promise.all([
    pixels(cleanPng), pixels(singlePng), pixels(multiPng),
  ]);
  const cleanMetrics = analyseFrame(cleanPixels);
  const singleMetrics = analyseFrame(singlePixels, cleanPixels);
  const multiMetrics = analyseFrame(multiPixels, cleanPixels);
  const violations = assertFrameContracts(singleMetrics, multiMetrics);
  const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const uniqueErrors = fatalBrowserErrors(errors);
  if (uniqueErrors.length > 0) violations.push(`browser/GPU error: ${uniqueErrors[0]}`);
  if (state.dmrThermal.smokePresentation.active !== 4) {
    violations.push(`expected four active smoke volumes, received ${state.dmrThermal.smokePresentation.active}`);
  }
  if (state.dmrThermal.smokePresentation.liveDisposals !== 0) {
    violations.push(`live smoke disposal count is ${state.dmrThermal.smokePresentation.liveDisposals}`);
  }
  const endingRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const endingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  if (!allowDirty && (endingRevision !== sourceRevision || endingStatus !== startingStatus)) {
    violations.push('source changed during exact smoke visual sanity run');
  }
  const receipt = {
    gate: 'pass65-smoke-visual-sanity',
    verdict: violations.length === 0 ? 'pass' : 'fail',
    sourceRevision,
    exactSource: startingStatus.length === 0 && endingRevision === sourceRevision && endingStatus === startingStatus,
    browserExecutable: executablePath,
    browserVersion: browser.version(),
    adapter: {
      label: state.render.runtime.adapterLabel,
      adapterClass: state.render.runtime.adapterClass,
      deviceClass: state.render.runtime.deviceClass,
      softwareAdapter: state.render.runtime.softwareAdapter,
    },
    smokePresentation: state.dmrThermal.smokePresentation,
    metrics: { clean: cleanMetrics, single: singleMetrics, multi: multiMetrics },
    limits: {
      singleMinimumMeanAbsoluteDelta: 10,
      singleMaximumHighLuminanceRatio: 0.35,
      singleMaximumVerticalHardEdgeCoverage: 0.32,
      singleMaximumHorizontalHardEdgeCoverage: 0.36,
      multiMinimumDensityRatio: 0.9,
      multiMinimumLuminanceStandardDeviation: 8,
      multiMaximumVerticalHardEdgeCoverage: 0.4,
      multiMaximumHorizontalHardEdgeCoverage: 0.44,
      maximumBaselineExcludedEdgeRatio: 0.35,
      baselineEdgeThreshold,
    },
    captures: ['clean.png', 'single-volume.png', 'multi-volume.png'],
    browserErrors: [...new Set(errors)],
    violations,
  };
  await writeFile(`${artifactRoot}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (violations.length > 0) throw new Error(`Pass 65 smoke visual sanity failed: ${violations.join('; ')}`);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
