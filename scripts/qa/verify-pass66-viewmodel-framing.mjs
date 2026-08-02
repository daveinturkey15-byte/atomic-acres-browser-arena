import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'vite';

const captureMode = process.env.PASS66_VIEWMODEL_CAPTURE_MODE === 'live' ? 'live' : 'paused';
// Local iteration may capture a dirty candidate, but the default release gate
// remains strict and the receipt records that development evidence as
// non-exact.  Requiring the complete porcelain snapshot to stay unchanged
// still prevents a concurrent writer from contaminating a visual comparison.
const allowDirty = process.env.PASS66_VIEWMODEL_ALLOW_DIRTY === '1';
const artifactRoot = captureMode === 'live'
  ? 'artifacts/pass66/viewmodel-framing-live'
  : 'artifacts/pass66/viewmodel-framing';
await rm(artifactRoot, { recursive: true, force: true });
await mkdir(artifactRoot, { recursive: true });
const port = Number(process.env.PASS66_VIEWMODEL_PORT ?? '44225');
const localViteOverrides = ['.env', '.env.local', '.env.development', '.env.development.local']
  .filter((path) => existsSync(path));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`Pass 66 viewmodel framing gate rejects Vite environment overrides (${[
    ...localViteOverrides,
    ...inheritedViteVariables,
  ].join(', ')})`);
}
const executablePath = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 66 viewmodel framing gate requires installed Google Chrome');

const requestedViewports = new Set((process.env.PASS66_VIEWMODEL_VIEWPORTS ?? '')
  .split(',').map((id) => id.trim()).filter(Boolean));
const viewports = Object.freeze([
  { id: '1440p', width: 2560, height: 1440 },
  { id: '4k', width: 3840, height: 2160 },
  { id: 'ultrawide-1440p', width: 3440, height: 1440 },
].filter((viewport) => requestedViewports.size === 0 || requestedViewports.has(viewport.id)));
if (viewports.length === 0) throw new Error('Pass 66 viewmodel framing gate has no selected viewports');
const route = `http://127.0.0.1:${port}/?release=latest&renderer=webgl2&render=blender&map=gun-range&grass=off&mist=off&seed=660214`;
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceRevision)) {
  throw new Error(`Pass 66 viewmodel framing gate found an invalid source revision ${sourceRevision}`);
}
const startingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
if (!allowDirty && startingStatus) {
  throw new Error('Pass 66 viewmodel framing gate requires a clean tracked and untracked worktree');
}
const expectedSourceRevision = process.env.PASS66_VIEWMODEL_SOURCE_SHA?.trim();
if (expectedSourceRevision && expectedSourceRevision !== sourceRevision) {
  throw new Error(`Pass 66 viewmodel framing expected ${expectedSourceRevision}, found ${sourceRevision}`);
}

function fatalBrowserErrors(errors) {
  return [...new Set(errors)].filter((message) => !/favicon|leaderboard|Failed to fetch|fonts\.googleapis/i.test(message));
}

function framingViolations(label, framing, requireNearPlane = true) {
  const violations = [];
  if (!framing?.finite) violations.push(`${label}: nonfinite framing`);
  if (!framing?.intersectsViewport) violations.push(`${label}: presentation is offscreen`);
  if (requireNearPlane && !framing?.nearPlaneClear) violations.push(`${label}: presentation crosses the camera near plane`);
  if (!Array.isArray(framing?.ndcMin) || !Array.isArray(framing?.ndcMax)
    || ![...framing.ndcMin, ...framing.ndcMax, framing.nearestDepth].every(Number.isFinite)) {
    violations.push(`${label}: framing telemetry is incomplete`);
  }
  return violations;
}

function presentationViolations(label, presentation, melee) {
  const violations = [];
  if (presentation?.weapon === 'm4a1') {
    const trim = presentation?.firstPersonRearStockTrim;
    const suppressedElements = Array.isArray(trim?.batches)
      ? trim.batches.reduce((total, batch) => total + Number(batch.suppressedElements ?? 0), 0)
      : 0;
    if (trim?.applied !== true || suppressedElements <= 0) {
      violations.push(`${label}: M4A1 first-person rear-stock occlusion trim is inactive`);
    }
    if (presentation?.importedModel?.triangles !== 32_112
      || presentation?.importedModel?.renderPrimitives !== 8) {
      violations.push(`${label}: M4A1 trim changed the immutable 32112-triangle/8-primitive topology`);
    }
  }
  if (presentation?.armsSource !== 'authored-two-chain') violations.push(`${label}: authored two-chain arms are inactive`);
  if (presentation?.authoredFingerBoneCount !== 30) violations.push(`${label}: expected 30 finger bones`);
  if (presentation?.armMaterials?.contract !== 'opaque-depth-writing'
    || presentation?.armMaterials?.transparent !== 0
    || presentation?.armMaterials?.nonOpaque !== 0
    || presentation?.armMaterials?.depthWriteDisabled !== 0) {
    violations.push(`${label}: opaque depth-writing arm material contract failed`);
  }
  violations.push(...framingViolations(`${label}/arms`, presentation?.armFraming));
  if (!melee) violations.push(...framingViolations(`${label}/weapon`, presentation?.weaponFraming));
  if (!melee) {
    for (const side of ['right', 'left']) {
      const arm = presentation?.riggedArms?.find((candidate) => candidate.side === side);
      if (!arm || arm.finite !== true || arm.withinStableReach !== true
        || !Number.isFinite(arm.contactError) || arm.contactError > 0.015
        || !Number.isFinite(arm.wristContactError) || arm.wristContactError > 0.015) {
        violations.push(`${label}: ${side} hand is detached or outside stable weapon reach`);
      }
    }
    if (label.endsWith('/ads')) {
      const armDepth = presentation?.armFraming?.nearestDepth;
      const weaponDepth = presentation?.weaponFraming?.nearestDepth;
      if (!Number.isFinite(armDepth) || !Number.isFinite(weaponDepth) || armDepth <= weaponDepth + 0.08) {
        violations.push(`${label}: hand/arm geometry clips through the receiver depth envelope`);
      }
    }
    return violations;
  }
  if (presentation?.meleeArmSource !== 'authored-rigged-arms' || presentation?.knifeVisible !== true) {
    violations.push(`${label}: authored melee arms/knife are inactive`);
  }
  if (presentation?.authoredMeleeKnifeParent !== 'right-wrist-knife-socket') {
    violations.push(`${label}: knife is not mounted on the authored wrist socket`);
  }
  if (!Number.isFinite(presentation?.authoredMeleeGripError) || presentation.authoredMeleeGripError > 0.001) {
    violations.push(`${label}: grip-to-socket error ${presentation?.authoredMeleeGripError}`);
  }
  if (!Number.isFinite(presentation?.authoredMeleeHandContactError)
    || presentation.authoredMeleeHandContactError > 0.015) {
    violations.push(`${label}: knife is detached from the visible hand by ${presentation?.authoredMeleeHandContactError}`);
  }
  violations.push(...framingViolations(`${label}/knife`, presentation?.meleeKnifeFraming));
  if (presentation?.meleeKnifeFraming?.fullyInsideViewport !== true) {
    violations.push(`${label}: peak knife silhouette is clipped by the viewport`);
  }
  const bladeTipLane = presentation?.meleeKnifeFraming?.ndcMin?.[0];
  if (!Number.isFinite(bladeTipLane) || bladeTipLane < 0.16 || bladeTipLane > 0.3) {
    violations.push(`${label}: peak blade tip ${bladeTipLane} misses the centre-right combat lane`);
  }
  if (presentation?.armFraming?.ndcMax?.[0] < 1
    || presentation?.armFraming?.ndcMin?.[1] > -0.75
    || presentation?.armFraming?.ndcMax?.[1] > 0.15) {
    violations.push(`${label}: melee arm does not enter continuously from the lower-right frame edge`);
  }
  const right = presentation?.riggedArms?.find((arm) => arm.side === 'right');
  if (!right || right.action !== 'melee' || right.knifeAttachedToRightWrist !== true
    || right.shoulderBindDelta < 0.25 || right.elbowBindDelta < 0.18 || right.wristBindDelta < 0.18) {
    violations.push(`${label}: peak stab does not produce a readable articulated arm arc`);
  }
  if (presentation?.passiveKnifeVisible || presentation?.browserProceduralMeleeArmViolation) {
    violations.push(`${label}: invalid passive/procedural knife presentation is visible`);
  }
  return violations;
}

function temporalActionViolations(label, presentation, action, progress) {
  if (action === 'reload') {
    const violations = presentationViolations(label, presentation, false);
    if (presentation?.actionContract?.state !== 'reload'
      || !Number.isFinite(presentation?.actionContract?.reloadProgress)
      || Math.abs(presentation.actionContract.reloadProgress - progress) > 0.015) {
      violations.push(`${label}: reload action contract is not pinned at ${progress}`);
    }
    return violations;
  }

  const violations = [];
  if (presentation?.armsSource !== 'authored-two-chain') violations.push(`${label}: authored two-chain arms are inactive`);
  if (presentation?.authoredFingerBoneCount !== 30) violations.push(`${label}: expected 30 finger bones`);
  if (presentation?.armMaterials?.contract !== 'opaque-depth-writing'
    || presentation?.armMaterials?.transparent !== 0
    || presentation?.armMaterials?.nonOpaque !== 0
    || presentation?.armMaterials?.depthWriteDisabled !== 0) {
    violations.push(`${label}: opaque depth-writing arm material contract failed`);
  }
  violations.push(...framingViolations(`${label}/arms`, presentation?.armFraming));
  violations.push(...framingViolations(`${label}/knife`, presentation?.meleeKnifeFraming));
  if (presentation?.meleeKnifeFraming?.fullyInsideViewport !== true) {
    violations.push(`${label}: temporal knife silhouette is clipped by the viewport`);
  }
  if (presentation?.actionContract?.state !== 'melee'
    || !Number.isFinite(presentation?.actionContract?.meleeProgress)
    || Math.abs(presentation.actionContract.meleeProgress - progress) > 0.015) {
    violations.push(`${label}: melee action contract is not pinned at ${progress}`);
  }
  if (presentation?.meleeArmSource !== 'authored-rigged-arms'
    || presentation?.knifeVisible !== true
    || presentation?.authoredMeleeKnifeParent !== 'right-wrist-knife-socket') {
    violations.push(`${label}: authored wrist-mounted melee presentation is inactive`);
  }
  if (!Number.isFinite(presentation?.authoredMeleeGripError) || presentation.authoredMeleeGripError > 0.001
    || !Number.isFinite(presentation?.authoredMeleeHandContactError)
    || presentation.authoredMeleeHandContactError > 0.015) {
    violations.push(`${label}: temporal knife grip is detached from the authored hand`);
  }
  const right = presentation?.riggedArms?.find((arm) => arm.side === 'right');
  const left = presentation?.riggedArms?.find((arm) => arm.side === 'left');
  const finiteVector = (value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (!right || right.action !== 'melee' || right.knifeAttachedToRightWrist !== true
    || Math.abs(right.progress - progress) > 0.015
    || ![right.shoulder, right.elbow, right.wrist, right.palm].every(finiteVector)
    || right.shoulderBindDelta + right.elbowBindDelta + right.wristBindDelta < 0.08) {
    violations.push(`${label}: articulated knife arm is not finite or visibly posed`);
  }
  if (!left || left.action !== 'melee' || left.supportChainScale > 0.0011
    || left.supportChainPolicy !== 'one-hand-action-stowed-outside-frustum-v1') {
    violations.push(`${label}: one-handed melee support chain is not safely stowed`);
  }
  if (presentation?.passiveKnifeVisible || presentation?.browserProceduralMeleeArmViolation) {
    violations.push(`${label}: invalid passive/procedural knife presentation is visible`);
  }
  return violations;
}

function vectorDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 3 || b.length !== 3) return 0;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function temporalMotionSummary(entries) {
  const summary = [];
  const requiredViewportIds = viewports
    .map((viewport) => viewport.id)
    .filter((viewportId) => viewportId === '1440p' || viewportId === '4k');
  for (const viewportId of requiredViewportIds) {
    for (const action of ['reload', 'melee']) {
      const samples = entries
        .filter((entry) => entry.viewport.id === viewportId && entry.action === action)
        .sort((a, b) => a.progress - b.progress);
      const side = action === 'reload' ? 'left' : 'right';
      const wrists = samples.map((entry) => entry.presentation.riggedArms.find((arm) => arm.side === side)?.wrist);
      let maximumTravel = 0;
      for (let first = 0; first < wrists.length; first += 1) {
        for (let second = first + 1; second < wrists.length; second += 1) {
          maximumTravel = Math.max(maximumTravel, vectorDistance(wrists[first], wrists[second]));
        }
      }
      const minimumTravel = action === 'reload' ? 0.025 : 0.08;
      summary.push(Object.freeze({
        viewport: viewportId,
        action,
        trackedSide: side,
        sampleProgress: Object.freeze(samples.map((entry) => entry.progress)),
        samples: samples.length,
        maximumWristTravelMeters: maximumTravel,
        minimumWristTravelMeters: minimumTravel,
        pass: samples.length === 3 && maximumTravel >= minimumTravel,
      }));
    }
  }
  return summary;
}

function temporalMotionViolations(summary) {
  const violations = [];
  for (const result of summary) {
    if (result.samples !== 3) {
      violations.push(`${result.viewport}/${result.action}: expected exactly three temporal contact samples`);
    } else if (!result.pass) {
      violations.push(`${result.viewport}/${result.action}: temporal strip is effectively static (${result.maximumWristTravelMeters}m)`);
    }
  }
  return violations;
}

function framingPixelRect(framing, width, height) {
  const left = Math.max(0, Math.floor((clampNdc(framing.ndcMin[0]) + 1) * 0.5 * width));
  const right = Math.min(width, Math.ceil((clampNdc(framing.ndcMax[0]) + 1) * 0.5 * width));
  const top = Math.max(0, Math.floor((1 - clampNdc(framing.ndcMax[1])) * 0.5 * height));
  const bottom = Math.min(height, Math.ceil((1 - clampNdc(framing.ndcMin[1])) * 0.5 * height));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function clampNdc(value) {
  return Math.max(-1, Math.min(1, value));
}

async function readabilityMetrics(frame, backgroundFrame, framing) {
  if (!framing?.finite || !Array.isArray(framing.ndcMin) || !Array.isArray(framing.ndcMax)) return null;
  const metadata = await sharp(frame).metadata();
  if (!metadata.width || !metadata.height) return null;
  const crop = framingPixelRect(framing, metadata.width, metadata.height);
  const resize = { width: Math.min(640, crop.width), withoutEnlargement: true };
  const { data, info } = await sharp(frame)
    .extract(crop)
    .resize(resize)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const background = await sharp(backgroundFrame)
    .extract(crop)
    .resize(resize)
    .removeAlpha()
    .raw()
    .toBuffer();
  const luminance = [];
  const foregroundLuminance = [];
  const differences = [];
  let overexposed = 0;
  let foregroundOverexposed = 0;
  let maskMinX = info.width;
  let maskMinY = info.height;
  let maskMaxX = -1;
  let maskMaxY = -1;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const value = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
    luminance.push(value);
    if (value >= 244) overexposed += 1;
    const difference = Math.sqrt(
      (data[offset] - background[offset]) ** 2
      + (data[offset + 1] - background[offset + 1]) ** 2
      + (data[offset + 2] - background[offset + 2]) ** 2,
    );
    differences.push(difference);
    if (difference < 7) continue;
    foregroundLuminance.push(value);
    if (value >= 244) foregroundOverexposed += 1;
    const pixel = offset / info.channels;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    maskMinX = Math.min(maskMinX, x);
    maskMinY = Math.min(maskMinY, y);
    maskMaxX = Math.max(maskMaxX, x);
    maskMaxY = Math.max(maskMaxY, y);
  }
  luminance.sort((a, b) => a - b);
  foregroundLuminance.sort((a, b) => a - b);
  differences.sort((a, b) => a - b);
  const quantile = (values, fraction) => values[Math.floor((values.length - 1) * fraction)] ?? 0;
  const foregroundPixels = foregroundLuminance.length;
  return Object.freeze({
    crop,
    mean: Number((luminance.reduce((sum, value) => sum + value, 0) / luminance.length).toFixed(3)),
    p50: Number(quantile(luminance, 0.5).toFixed(3)),
    p75: Number(quantile(luminance, 0.75).toFixed(3)),
    p90: Number(quantile(luminance, 0.9).toFixed(3)),
    p95: Number(quantile(luminance, 0.95).toFixed(3)),
    p99: Number(quantile(luminance, 0.99).toFixed(3)),
    overexposedRatio: Number((overexposed / luminance.length).toFixed(6)),
    foregroundPixels,
    foregroundRatio: Number((foregroundPixels / luminance.length).toFixed(6)),
    foregroundMean: foregroundPixels > 0
      ? Number((foregroundLuminance.reduce((sum, value) => sum + value, 0) / foregroundPixels).toFixed(3))
      : 0,
    foregroundP10: Number(quantile(foregroundLuminance, 0.1).toFixed(3)),
    foregroundP50: Number(quantile(foregroundLuminance, 0.5).toFixed(3)),
    foregroundP90: Number(quantile(foregroundLuminance, 0.9).toFixed(3)),
    foregroundP95: Number(quantile(foregroundLuminance, 0.95).toFixed(3)),
    foregroundP99: Number(quantile(foregroundLuminance, 0.99).toFixed(3)),
    foregroundOverexposedRatio: foregroundPixels > 0
      ? Number((foregroundOverexposed / foregroundPixels).toFixed(6))
      : 0,
    differenceP95: Number(quantile(differences, 0.95).toFixed(3)),
    maskBounds: foregroundPixels > 0 ? Object.freeze({
      minX: Number((maskMinX / info.width).toFixed(4)),
      minY: Number((maskMinY / info.height).toFixed(4)),
      maxX: Number((maskMaxX / info.width).toFixed(4)),
      maxY: Number((maskMaxY / info.height).toFixed(4)),
    }) : null,
  });
}

function readabilityViolations(label, readability, melee) {
  const violations = [];
  const arms = readability?.arms;
  if (!arms || arms.foregroundRatio < 0.025
    || arms.foregroundP95 - arms.foregroundP10 < 28
    || arms.foregroundP90 < 34) {
    violations.push(`${label}: arm material detail is below the shadow-floor contrast contract`);
  }
  if (arms?.foregroundOverexposedRatio > 0.035) {
    violations.push(`${label}: arm fill clips ${arms.foregroundOverexposedRatio} of its isolated silhouette`);
  }
  if (melee) {
    const knife = readability?.knife;
    if (!knife || knife.foregroundRatio < 0.035
      || knife.foregroundP99 - knife.foregroundP10 < 38
      || knife.foregroundP95 < 36) {
      violations.push(`${label}: knife edge/handle is not readable against the Gun Range shadow floor`);
    }
    if (knife?.foregroundOverexposedRatio > 0.035) {
      violations.push(`${label}: knife fill clips ${knife.foregroundOverexposedRatio} of its isolated silhouette`);
    }
  } else {
    const weapon = readability?.weapon;
    if (!weapon || weapon.foregroundRatio < 0.025
      || weapon.foregroundP95 - weapon.foregroundP10 < 34
      || weapon.foregroundP90 < 42) {
      violations.push(`${label}: weapon controls/materials are below the shadow-floor contrast contract`);
    }
    if (weapon?.foregroundOverexposedRatio > 0.035) {
      violations.push(`${label}: weapon fill clips ${weapon.foregroundOverexposedRatio} of its isolated silhouette`);
    }
  }
  return violations;
}

async function stubExternalServices(page) {
  await page.route('https://fonts.googleapis.com/**', (request) => request.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/v1/leaderboard?*', (request) => request.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }) }));
  await page.route('**/v1/streak', (request) => request.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true }) }));
}

async function capture(page, name) {
  const path = `${artifactRoot}/${name}.png`;
  let canvasFrame;
  let backgroundFrame;
  if (captureMode === 'live') {
    // A live comparison mode isolates screenshot/freezing artifacts without
    // changing the gameplay or renderer. Two presented frames ensure local
    // arena lighting has reached the browser compositor before capture.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path, animations: 'disabled', timeout: 60_000 });
    canvasFrame = await page.locator('#game').screenshot({ animations: 'disabled', timeout: 60_000 });
  } else {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
    try {
      await page.screenshot({ path, animations: 'disabled', timeout: 60_000 });
      canvasFrame = await page.locator('#game').screenshot({ animations: 'disabled', timeout: 60_000 });
    } finally {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
    }
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true));
  try {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    backgroundFrame = await page.locator('#game').screenshot({ animations: 'disabled', timeout: 60_000 });
  } finally {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(false));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  return { path, canvasFrame, backgroundFrame };
}

async function writeContactSheet(entries, outputPath, maximumColumns = 5) {
  const tileWidth = 640;
  const tileHeight = 380;
  const imageHeight = 350;
  const columns = Math.min(maximumColumns, Math.max(1, entries.length));
  const rows = Math.ceil(entries.length / columns);
  const tiles = await Promise.all(entries.map(async (entry) => {
    const frame = await sharp(entry.screenshot)
      .resize({ width: tileWidth, height: imageHeight, fit: 'contain', background: '#061116' })
      .png()
      .toBuffer();
    const escaped = entry.label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const label = Buffer.from(`<svg width="${tileWidth}" height="30" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#07151a"/>
      <text x="14" y="21" fill="#8ff4ed" font-family="Arial, sans-serif" font-size="16" font-weight="700">${escaped}</text>
    </svg>`);
    return sharp({ create: { width: tileWidth, height: tileHeight, channels: 3, background: '#061116' } })
      .composite([{ input: frame, top: 0, left: 0 }, { input: label, top: imageHeight, left: 0 }])
      .png()
      .toBuffer();
  }));
  await sharp({
    create: { width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: '#03090c' },
  }).composite(tiles.map((input, index) => ({
    input,
    left: (index % columns) * tileWidth,
    top: Math.floor(index / columns) * tileHeight,
  }))).png().toFile(outputPath);
}

const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
let browser;
const errors = [];
const violations = [];
const evidence = [];
const temporalEvidence = [];
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await stubExternalServices(page);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true
      && state?.render?.runtime?.actualBackend === 'webgl2';
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.startSolo(); api.setBotsFrozen(true); api.setMovement(false);
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state?.matchPhase === 'active';
  }, undefined, { timeout: 45_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('m4a1'));
  await page.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
    return presentation?.weapon === 'm4a1' && presentation?.importedModel?.weapon === 'm4a1';
  }, undefined, { timeout: 30_000 });
  // Keep the deployment announcement out of the immutable human-review frame;
  // it is unrelated to viewmodel readability and otherwise masks the receiver.
  await page.waitForTimeout(1_200);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false); api.setReloadCaptureProgress(null); api.setMeleeCaptureProgress(null);
      // Leave the prior viewport's wall fixture before requesting stand. The
      // runtime correctly refuses a stance expansion at an obstructed prone
      // location; teleporting first makes this a deterministic open-floor reset.
      api.teleportPlayer(0, 1.7, 0, Math.PI / 2, 0); api.setStance('stand');
    });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return snapshot?.weaponPresentation?.adsProgress < 0.02 && snapshot?.player?.stance === 'stand';
    });
    await page.waitForTimeout(220);
    let state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    const hipLabel = `${viewport.id}/hip`;
    violations.push(...presentationViolations(hipLabel, state.weaponPresentation, false));
    const hipCapture = await capture(page, `${viewport.id}-m4a1-hip`);
    const hipReadability = {
      arms: await readabilityMetrics(hipCapture.canvasFrame, hipCapture.backgroundFrame, state.weaponPresentation.armFraming),
      weapon: await readabilityMetrics(hipCapture.canvasFrame, hipCapture.backgroundFrame, state.weaponPresentation.weaponFraming),
    };
    violations.push(...readabilityViolations(hipLabel, hipReadability, false));
    evidence.push({ label: hipLabel, viewport, screenshot: hipCapture.path, presentation: state.weaponPresentation, readability: hipReadability });

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.adsProgress > 0.98);
    await page.waitForTimeout(120);
    state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    const adsLabel = `${viewport.id}/ads`;
    violations.push(...presentationViolations(adsLabel, state.weaponPresentation, false));
    if (!Array.isArray(state.weaponPresentation?.sightOffset)
      || !state.weaponPresentation.sightOffset.every(Number.isFinite)
      || Math.hypot(...state.weaponPresentation.sightOffset) > 0.03) {
      violations.push(`${adsLabel}: physical sight is not centred`);
    }
    const adsCapture = await capture(page, `${viewport.id}-m4a1-ads`);
    const adsReadability = {
      arms: await readabilityMetrics(adsCapture.canvasFrame, adsCapture.backgroundFrame, state.weaponPresentation.armFraming),
      weapon: await readabilityMetrics(adsCapture.canvasFrame, adsCapture.backgroundFrame, state.weaponPresentation.weaponFraming),
    };
    violations.push(...readabilityViolations(adsLabel, adsReadability, false));
    evidence.push({ label: adsLabel, viewport, screenshot: adsCapture.path, presentation: state.weaponPresentation, readability: adsReadability });

    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false); api.setReloadCaptureProgress(0.46);
    });
    await page.waitForFunction(() => {
      const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
      return presentation?.adsProgress < 0.02 && presentation?.actionContract?.state === 'reload';
    });
    await page.waitForTimeout(120);
    state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    const reloadLabel = `${viewport.id}/reload-0.46`;
    violations.push(...presentationViolations(reloadLabel, state.weaponPresentation, false));
    const reloadCapture = await capture(page, `${viewport.id}-m4a1-reload-0_46`);
    const reloadReadability = {
      arms: await readabilityMetrics(reloadCapture.canvasFrame, reloadCapture.backgroundFrame, state.weaponPresentation.armFraming),
      weapon: await readabilityMetrics(reloadCapture.canvasFrame, reloadCapture.backgroundFrame, state.weaponPresentation.weaponFraming),
    };
    violations.push(...readabilityViolations(reloadLabel, reloadReadability, false));
    const reloadEntry = { label: reloadLabel, viewport, screenshot: reloadCapture.path, presentation: state.weaponPresentation, readability: reloadReadability };
    evidence.push(reloadEntry);
    if (viewport.id !== 'ultrawide-1440p') {
      violations.push(...temporalActionViolations(`${viewport.id}/reload-temporal-0.46`, state.weaponPresentation, 'reload', 0.46));
      temporalEvidence.push({ ...reloadEntry, label: `${viewport.id}/reload-temporal-0.46`, action: 'reload', progress: 0.46 });
      // Start, fully detached magazine beat, and late bolt/recovery beat. The
      // endpoints deliberately bracket handToReload instead of sampling three
      // nearly identical full-reach poses.
      for (const progress of [0.08, 0.9]) {
        await page.evaluate((value) => window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(value), progress);
        await page.waitForFunction((value) => {
          const contract = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.actionContract;
          return contract?.state === 'reload'
            && Math.abs(contract.reloadProgress - value) <= 0.015;
        }, progress);
        await page.waitForTimeout(120);
        const temporalState = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
        const temporalLabel = `${viewport.id}/reload-temporal-${progress.toFixed(2)}`;
        violations.push(...temporalActionViolations(temporalLabel, temporalState.weaponPresentation, 'reload', progress));
        const token = progress.toFixed(2).replace('.', '_');
        const temporalCapture = await capture(page, `${viewport.id}-m4a1-reload-${token}-temporal`);
        const temporalReadability = {
          arms: await readabilityMetrics(temporalCapture.canvasFrame, temporalCapture.backgroundFrame, temporalState.weaponPresentation.armFraming),
          weapon: await readabilityMetrics(temporalCapture.canvasFrame, temporalCapture.backgroundFrame, temporalState.weaponPresentation.weaponFraming),
        };
        violations.push(...readabilityViolations(temporalLabel, temporalReadability, false));
        temporalEvidence.push({
          label: temporalLabel,
          viewport,
          screenshot: temporalCapture.path,
          presentation: temporalState.weaponPresentation,
          readability: temporalReadability,
          action: 'reload',
          progress,
        });
      }
    }

    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setReloadCaptureProgress(null); api.melee(); api.setMeleeCaptureProgress(0.42);
    });
    await page.waitForFunction(() => {
      const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
      return presentation?.meleeArmSource === 'authored-rigged-arms' && presentation?.knifeVisible === true;
    });
    await page.waitForTimeout(260);
    state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    const meleeLabel = `${viewport.id}/melee-0.42`;
    violations.push(...presentationViolations(meleeLabel, state.weaponPresentation, true));
    const meleeCapture = await capture(page, `${viewport.id}-melee-0_42`);
    const meleeReadability = {
      arms: await readabilityMetrics(meleeCapture.canvasFrame, meleeCapture.backgroundFrame, state.weaponPresentation.armFraming),
      knife: await readabilityMetrics(meleeCapture.canvasFrame, meleeCapture.backgroundFrame, state.weaponPresentation.meleeKnifeFraming),
    };
    violations.push(...readabilityViolations(meleeLabel, meleeReadability, true));
    const meleeEntry = { label: meleeLabel, viewport, screenshot: meleeCapture.path, presentation: state.weaponPresentation, readability: meleeReadability };
    evidence.push(meleeEntry);
    if (viewport.id !== 'ultrawide-1440p') {
      violations.push(...temporalActionViolations(`${viewport.id}/melee-temporal-0.42`, state.weaponPresentation, 'melee', 0.42));
      temporalEvidence.push({ ...meleeEntry, label: `${viewport.id}/melee-temporal-0.42`, action: 'melee', progress: 0.42 });
      // Wind-up, peak strike, and recovery: three materially different points
      // in the 520 ms authored action rather than adjacent peak snapshots.
      for (const progress of [0.08, 0.84]) {
        await page.evaluate((value) => window.__ATOMIC_ACRES_DEBUG__.setMeleeCaptureProgress(value), progress);
        await page.waitForFunction((value) => {
          const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
          return presentation?.meleeArmSource === 'authored-rigged-arms'
            && presentation?.knifeVisible === true
            && Math.abs(presentation?.actionContract?.meleeProgress - value) <= 0.015;
        }, progress);
        await page.waitForTimeout(120);
        const temporalState = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
        const temporalLabel = `${viewport.id}/melee-temporal-${progress.toFixed(2)}`;
        violations.push(...temporalActionViolations(temporalLabel, temporalState.weaponPresentation, 'melee', progress));
        const token = progress.toFixed(2).replace('.', '_');
        const temporalCapture = await capture(page, `${viewport.id}-melee-${token}-temporal`);
        const temporalReadability = {
          arms: await readabilityMetrics(temporalCapture.canvasFrame, temporalCapture.backgroundFrame, temporalState.weaponPresentation.armFraming),
          knife: await readabilityMetrics(temporalCapture.canvasFrame, temporalCapture.backgroundFrame, temporalState.weaponPresentation.meleeKnifeFraming),
        };
        violations.push(...readabilityViolations(temporalLabel, temporalReadability, true));
        temporalEvidence.push({
          label: temporalLabel,
          viewport,
          screenshot: temporalCapture.path,
          presentation: temporalState.weaponPresentation,
          readability: temporalReadability,
          action: 'melee',
          progress,
        });
      }
    }

    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setMeleeCaptureProgress(null); api.setAds(false); api.setReloadCaptureProgress(null);
      // Face the current authored west-wall collider. The older 12/-32.55
      // fixture became open floor when the Gun Range shell/test-bay route was
      // rebuilt, so it could only prove the open-prone 0.09 m baseline.
      api.teleportPlayer(-19.65, 1.7, -14.5, Math.PI / 2, 0); api.setStance('prone');
    });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return snapshot?.player?.stance === 'prone'
        && snapshot?.weaponPresentation?.weaponFraming?.intersectsViewport === true;
    }, undefined, { timeout: 10_000 });
    await page.waitForTimeout(320);
    state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    const proneLabel = `${viewport.id}/prone-wall-floor`;
    violations.push(...presentationViolations(proneLabel, state.weaponPresentation, false));
    if (state.weaponPresentation.surfaceLift < 0.13 || state.weaponPresentation.surfaceLift > 0.5) {
      violations.push(`${proneLabel}: prone floor lift ${state.weaponPresentation.surfaceLift} is outside 0.13..0.5m`);
    }
    if (state.weaponPresentation.surfaceRetreat <= 0.25 || state.weaponPresentation.surfaceRetreat > 0.7) {
      violations.push(`${proneLabel}: wall retreat ${state.weaponPresentation.surfaceRetreat} is outside 0.25..0.7m`);
    }
    const proneCapture = await capture(page, `${viewport.id}-prone-wall-floor`);
    const proneReadability = {
      arms: await readabilityMetrics(proneCapture.canvasFrame, proneCapture.backgroundFrame, state.weaponPresentation.armFraming),
      weapon: await readabilityMetrics(proneCapture.canvasFrame, proneCapture.backgroundFrame, state.weaponPresentation.weaponFraming),
    };
    violations.push(...readabilityViolations(proneLabel, proneReadability, false));
    evidence.push({ label: proneLabel, viewport, screenshot: proneCapture.path, presentation: state.weaponPresentation, readability: proneReadability });
  }

  const hipEvidence = evidence.filter((entry) => entry.label.endsWith('/hip'));
  const standardScale = hipEvidence.find((entry) => entry.viewport.id === '1440p')?.presentation?.viewmodelViewport?.rootScale;
  const fourKScale = hipEvidence.find((entry) => entry.viewport.id === '4k')?.presentation?.viewmodelViewport?.rootScale;
  const ultrawideScale = hipEvidence.find((entry) => entry.viewport.id === 'ultrawide-1440p')?.presentation?.viewmodelViewport?.rootScale;
  if (viewports.length === 3 && ![standardScale, fourKScale, ultrawideScale].every(Number.isFinite)) {
    violations.push('viewport/root-scale telemetry is incomplete');
  } else if (viewports.length === 3) {
    if (Math.abs(standardScale - fourKScale) > 0.001) violations.push(`1440p/4K relative framing diverged: ${standardScale} vs ${fourKScale}`);
    const ultrawideRatio = ultrawideScale / standardScale;
    if (ultrawideRatio < 1 || ultrawideRatio > 1.121) violations.push(`ultrawide scale ratio ${ultrawideRatio} is outside 1..1.121`);
  }
  const temporalMotion = temporalMotionSummary(temporalEvidence);
  violations.push(...temporalMotionViolations(temporalMotion));
  violations.push(...fatalBrowserErrors(errors).map((message) => `browser error: ${message}`));
  const contactSheet = `${artifactRoot}/contact-sheet.png`;
  await writeContactSheet(evidence, contactSheet);
  const actionOrder = Object.freeze({ reload: 0, melee: 1 });
  const viewportOrder = Object.freeze({ '1440p': 0, '4k': 1 });
  const orderedTemporalEvidence = [...temporalEvidence].sort((first, second) => (
    viewportOrder[first.viewport.id] - viewportOrder[second.viewport.id]
    || actionOrder[first.action] - actionOrder[second.action]
    || first.progress - second.progress
  ));
  const temporalContactSheet = orderedTemporalEvidence.length > 0
    ? `${artifactRoot}/temporal-contact-strip.png`
    : null;
  if (temporalContactSheet) await writeContactSheet(orderedTemporalEvidence, temporalContactSheet, 3);
  const endingRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const endingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (endingRevision !== sourceRevision || (!allowDirty && endingStatus) || (allowDirty && endingStatus !== startingStatus)) {
    throw new Error(`Pass 66 viewmodel framing source drifted during capture (${sourceRevision} -> ${endingRevision})`);
  }
  const receipt = {
    schema: 'atomic-acres/pass66-viewmodel-framing@2',
    verdict: violations.length === 0 ? 'pass' : 'fail',
    sourceRevision,
    sourceState: {
      revision: sourceRevision,
      endingRevision,
      cleanBefore: startingStatus.length === 0,
      cleanAfter: endingStatus.length === 0,
      exactSource: !allowDirty && startingStatus.length === 0 && endingStatus.length === 0,
      dirtyDevelopmentCapture: allowDirty,
      expectedRevision: expectedSourceRevision ?? sourceRevision,
    },
    route,
    browser: browser.version(),
    captureMode,
    viewports,
    contactSheet,
    temporalContactSheet,
    temporalMotion,
    evidence,
    temporalEvidence: orderedTemporalEvidence,
    browserErrors: fatalBrowserErrors(errors),
    violations,
  };
  await writeFile(`${artifactRoot}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (violations.length > 0) throw new Error(`Pass 66 viewmodel framing gate failed:\n- ${violations.join('\n- ')}`);
  console.log(JSON.stringify({ verdict: receipt.verdict, browser: receipt.browser, viewports, evidence: evidence.map((entry) => ({
    label: entry.label,
    screenshot: entry.screenshot,
    armFraming: entry.presentation.armFraming,
    knifeFraming: entry.presentation.meleeKnifeFraming,
    handContactError: entry.presentation.authoredMeleeHandContactError,
    viewmodelViewport: entry.presentation.viewmodelViewport,
    readability: entry.readability,
  })) }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
