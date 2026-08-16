import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const artifactRoot = 'artifacts/pass65/first-person-arms-visual-gate';
const port = Number(process.env.PASS65_ARMS_VISUAL_PORT ?? '44205');
const allowDirty = process.env.PASS65_ARMS_VISUAL_ALLOW_DIRTY === '1';
const executablePath = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 65 first-person arms visual gate requires installed Google Chrome');

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const startingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
if (!allowDirty && startingStatus.length > 0) throw new Error('Pass 65 first-person arms visual gate requires a clean tracked worktree');

const representatives = Object.freeze([
  { family: 'handgun', weapon: 'pistol' },
  { family: 'compact', weapon: 'mp5' },
  { family: 'long-gun', weapon: 'm4a1' },
  { family: 'heavy', weapon: 'minigun' },
  { family: 'crossbow', weapon: 'explosive-crossbow' },
  { family: 'railgun', weapon: 'railgun' },
  { family: 'flare-handgun', weapon: 'flare-gun' },
]);
const route = `http://127.0.0.1:${port}/?release=latest&renderer=webgpu&render=blender&map=gun-range&grass=off&mist=off&seed=650085`;

function fatalBrowserErrors(errors) {
  return [...new Set(errors)].filter((message) => (
    /GPUValidationError|device\s*lost|destroyed|uncaptured|WebGPU|render.*stalled|context.*lost/i.test(message)
    || !/favicon|leaderboard|Failed to fetch|fonts\.googleapis/i.test(message)
  ));
}

const finiteArray = (values) => Array.isArray(values) && values.every(Number.isFinite);
const minimumArmBranchNdcY = -1.05;
const proximalSleeveContract = 'shoulder-bound-authored-pbr-lower-crop-continuation-v1';

function presentationViolations(label, state) {
  const violations = [];
  const presentation = state?.weaponPresentation;
  if (!presentation) return [`${label}: weapon presentation telemetry is unavailable`];
  if (presentation.armsSource !== 'authored-two-chain') violations.push(`${label}: authored two-chain arms are not active`);
  if (presentation.armsVisible !== true) violations.push(`${label}: arms are not visible`);
  if (presentation.armMeshCount < 4 || presentation.armMeshCount > 6) violations.push(`${label}: arm mesh count ${presentation.armMeshCount} is outside 4..6`);
  if (presentation.authoredFingerBoneCount !== 30) violations.push(`${label}: expected 30 authored digit bones, received ${presentation.authoredFingerBoneCount}`);
  if (presentation.armMaterials?.contract !== 'opaque-depth-writing') violations.push(`${label}: opaque material contract is missing`);
  if ((presentation.armMaterials?.total ?? 0) < 1) violations.push(`${label}: no arm materials were observed`);
  if ((presentation.armMaterials?.transparent ?? -1) !== 0) violations.push(`${label}: transparent arm material detected`);
  if ((presentation.armMaterials?.nonOpaque ?? -1) !== 0) violations.push(`${label}: sub-opaque arm material detected`);
  if ((presentation.armMaterials?.depthWriteDisabled ?? -1) !== 0) violations.push(`${label}: arm material disables depth writing`);
  const animation = presentation.authoredArmAnimation;
  if (animation?.clips !== 13) violations.push(`${label}: expected 13 authored arm clips, received ${animation?.clips ?? 'none'}`);
  if (animation?.blendPolicy !== 'finger-tracks-first-runtime-ik-last') violations.push(`${label}: runtime IK ordering contract is missing`);
  if (animation?.trackPolicy !== 'finger-bones-only') violations.push(`${label}: authored upper-chain animation was not excluded`);
  if ((animation?.runtimeTracks ?? 0) < 1) violations.push(`${label}: no authored digit tracks reached runtime`);
  if ((animation?.upperChainTracksExcluded ?? 0) < 1) violations.push(`${label}: upper-chain exclusion was not exercised`);
  const framing = presentation.armFraming;
  if (!framing?.finite || !framing?.nearPlaneClear || !framing?.intersectsViewport) violations.push(`${label}: arm framing is nonfinite, clipped by the near plane, or offscreen`);
  const branchFraming = presentation.armBranchFraming;
  for (const side of ['left', 'right']) {
    const branch = branchFraming?.[side];
    const continuation = presentation.proximalSleeveContinuations?.find((entry) => entry.side === side);
    if (continuation?.contract !== proximalSleeveContract
      || continuation?.parent !== `UpperArm${side === 'left' ? 'L' : 'R'}`
      || continuation?.materialKind !== 'MeshStandardMaterial'
      || continuation?.authoredSleeveMaterial !== true
      || continuation?.opaque !== true) {
      violations.push(`${label}/${side}: authored proximal sleeve continuation is invalid ${JSON.stringify(continuation)}`);
    }
    if (!branch?.finite || !branch?.nearPlaneClear || !branch?.intersectsViewport) {
      violations.push(`${label}/${side}: deformed branch framing is missing, clipped, or offscreen`);
    } else if (branch.ndcMin?.[1] > minimumArmBranchNdcY) {
      violations.push(`${label}/${side}: detached sleeve envelope ${JSON.stringify(branch)}`);
    }
  }
  if (!Array.isArray(presentation.riggedArms) || presentation.riggedArms.length !== 2) {
    violations.push(`${label}: expected two solved arm chains`);
  } else if (presentation.riggedArms.every((arm) => arm.action === 'melee')) {
    for (const arm of presentation.riggedArms) {
      for (const key of ['shoulderBindDelta', 'elbowBindDelta', 'wristBindDelta']) {
        if (!Number.isFinite(arm[key])) violations.push(`${label}/${arm.side}: nonfinite melee ${key}`);
      }
    }
  } else {
    const policy = presentation.riggedArms.find((arm) => arm.handPolicy)?.handPolicy;
    const activeArms = presentation.riggedArms.filter((arm) => arm.active === true);
    const stowedArms = presentation.riggedArms.filter((arm) => arm.stowed === true);
    if (policy?.contract !== 'right-firing-hand-two-hand-support-v2') violations.push(`${label}: two-hand policy is missing`);
    if (activeArms.length !== policy?.activeChainCount) violations.push(`${label}: ${activeArms.length} active chains do not match policy ${policy?.activeChainCount}`);
    if (policy?.activeChainCount !== 2 || stowedArms.length !== 0) violations.push(`${label}: both authored chains must remain visible`);
    for (const arm of activeArms) {
      if (!arm.finite || !arm.withinStableReach || !arm.meaningfulElbowBend || arm.authoredSegmentDirectionsPreserved !== true) violations.push(`${label}/${arm.side}: unstable, straight, or nonfinite authored-chain IK`);
      if (!Number.isFinite(arm.elbowFlexRadians) || arm.elbowFlexRadians < 0.36) violations.push(`${label}/${arm.side}: elbow flex ${arm.elbowFlexRadians} is too straight`);
      if (!Number.isFinite(arm.contactError) || arm.contactError > 0.01) violations.push(`${label}/${arm.side}: authored palm contact error ${arm.contactError}`);
      if (!Number.isFinite(arm.palmOrientationError) || arm.palmOrientationError > 0.2) violations.push(`${label}/${arm.side}: palm orientation error ${arm.palmOrientationError}`);
      if (!Number.isFinite(arm.socketReachRatio) || arm.socketReachRatio > 1.04) violations.push(`${label}/${arm.side}: authored socket reach ratio ${arm.socketReachRatio}`);
      if (!Number.isFinite(arm.gripSocketCalibration) || arm.gripSocketCalibration > 0.01) violations.push(`${label}/${arm.side}: grip calibration ${arm.gripSocketCalibration}m exceeds authored tolerance`);
      // A shoulder bone may legitimately remain in-frame while the weighted
      // proximal sleeve exits below it; armBranchFraming above measures the
      // current deformed vertices for each side independently.
      if (!finiteArray(arm.shoulderEntryNdc)) violations.push(`${label}/${arm.side}: shoulder entry telemetry is nonfinite`);
      if (arm.segmentLengthScale !== 1 || arm.bindOffsetsPreserved !== true) violations.push(`${label}/${arm.side}: authored segment length changed ${arm.segmentLengthScale}`);
      for (const key of ['shoulder', 'elbow', 'wrist', 'palm', 'palmQuaternion', 'palmTargetQuaternion', 'target', 'shoulderQuaternion', 'elbowQuaternion']) {
        if (!finiteArray(arm[key])) violations.push(`${label}/${arm.side}: nonfinite ${key}`);
      }
    }
  }
  if (presentation.weapon === 'railgun') {
    const optic = presentation.importedModel?.firstPersonOptic;
    if (optic?.contract !== 'clear-glass-and-opaque-backer-component-v3'
      || optic?.clearGlassLensMeshCount !== 1
      || optic?.opticWindowOpacity !== 0.02
      || optic?.opaqueBackerAperture?.applied !== true
      || optic?.opaqueBackerAperture?.contract !== 'semantic-lens-grid-spatial-degenerate-v1'
      || optic?.opaqueBackerAperture?.suppressedElements < 3
      || optic?.opaqueBackerAperture?.suppressionRatio >= 0.2
      || optic?.adsAuthority !== 'railgun-fullscreen-scope-unchanged') {
      violations.push(`${label}: Railgun hip optic clear-air contract failed ${JSON.stringify(optic)}`);
    }
  }
  if (presentation.weapon === 'flare-gun') {
    const width = presentation.importedModel?.firstPersonWidth;
    if (width?.contract !== 'mesh-geometry-only-socket-invariant-width-v1'
      || width?.multiplier < 3 || width?.multiplier > 5
      || width?.measuredMultiplier < 3 || width?.measuredMultiplier > 5
      || width?.widenedMeshCount < 1
      || width?.maximumSocketDriftMeters > 1e-9) {
      violations.push(`${label}: Flare Gun visual-width/socket invariant failed ${JSON.stringify(width)}`);
    }
  }
  if (presentation.browserProceduralMeleeArmViolation === true || presentation.proceduralMeleeArmVisible === true) violations.push(`${label}: browser procedural arm fallback is visible`);
  return violations;
}

function evidenceFor(label, state, screenshot, cadence = null) {
  const presentation = state.weaponPresentation;
  return Object.freeze({
    label,
    screenshot,
    weapon: presentation.weapon,
    armsSource: presentation.armsSource,
    armMeshCount: presentation.armMeshCount,
    armMaterials: presentation.armMaterials,
    authoredFingerBoneCount: presentation.authoredFingerBoneCount,
    authoredArmAnimation: presentation.authoredArmAnimation,
    armFraming: presentation.armFraming,
    armBranchFraming: presentation.armBranchFraming,
    proximalSleeveContinuations: presentation.proximalSleeveContinuations,
    importedModel: presentation.importedModel,
    meleeKnifeFraming: presentation.meleeKnifeFraming,
    viewmodelViewport: presentation.viewmodelViewport,
    riggedArms: presentation.riggedArms,
    cadence,
    melee: {
      source: presentation.meleeArmSource,
      knifeVisible: presentation.knifeVisible,
      knifeParent: presentation.authoredMeleeKnifeParent,
      gripError: presentation.authoredMeleeGripError,
      handContactError: presentation.authoredMeleeHandContactError,
      bindPoseRestored: presentation.riggedMeleeBindPoseRestoredExactly,
    },
  });
}

async function measureWarmCadence(page, frameCount = 30) {
  return page.evaluate((requestedFrames) => new Promise((resolve) => {
    const samples = [];
    let previous = performance.now();
    const tick = (now) => {
      samples.push(now - previous);
      previous = now;
      if (samples.length < requestedFrames) requestAnimationFrame(tick);
      else {
        const sorted = [...samples].sort((a, b) => a - b);
        const totalMs = samples.reduce((sum, value) => sum + value, 0);
        resolve({
          frames: samples.length,
          meanFps: 1000 / (totalMs / samples.length),
          p95FrameMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
          maxFrameMs: sorted.at(-1),
        });
      }
    };
    requestAnimationFrame(tick);
  }), frameCount);
}

async function stubExternalServices(page) {
  await page.route('https://fonts.googleapis.com/**', (request) => request.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/v1/leaderboard?*', (request) => request.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }) }));
  await page.route('**/v1/streak', (request) => request.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true }) }));
}

async function capture(page, name) {
  const path = `${artifactRoot}/${name}.png`;
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  try {
    await page.screenshot({ path, animations: 'disabled', timeout: 60_000 });
  } finally {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  }
  return path;
}

await mkdir(artifactRoot, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
let browser;
const violations = [];
const errors = [];
const evidence = [];
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await stubExternalServices(page);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true
      && state?.render?.runtime?.actualBackend === 'webgpu' && state?.render?.profile === 'blender';
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('gun-range'));
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.arenaSelection?.id === 'gun-range'
      && state?.arenaSelection?.streaming?.transition?.phase === 'idle'
      && state?.arenaSelection?.streaming?.transition?.failure === null;
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
    api.setMovement(false);
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state?.matchPhase === 'active'
      && state?.render?.runtime?.actualBackend === 'webgpu'
      && state?.render?.runtime?.presentation?.status === 'healthy';
  }, undefined, { timeout: 45_000 });

  for (const { family, weapon } of representatives) {
    await page.evaluate((selected) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.setReloadCaptureProgress(null);
      api.setMeleeCaptureProgress(null);
      api.equipWeapon(selected);
    }, weapon);
    await page.waitForFunction((selected) => {
      const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
      return presentation?.weapon === selected && presentation?.importedModel?.weapon === selected;
    }, weapon, { timeout: 30_000 });
    // Asset decode/upload/first-pipeline compilation is a cold-switch event,
    // not representative sustained presentation. Settle it, then measure real
    // RAF cadence before accepting the frame; a persistently slow crossbow (or
    // any family) remains a hard failure rather than being explained away.
    await page.waitForTimeout(900);
    const cadence = await measureWarmCadence(page);
    if (!Number.isFinite(cadence.meanFps) || cadence.meanFps < 24
      || !Number.isFinite(cadence.p95FrameMs) || cadence.p95FrameMs > 50) {
      violations.push(`${family}/${weapon}/hip: warmed cadence is ${JSON.stringify(cadence)}`);
    }
    const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    violations.push(...presentationViolations(`${family}/${weapon}/hip`, state));
    const screenshot = await capture(page, `${family}-${weapon}-hip`);
    evidence.push(evidenceFor(`${family}/${weapon}/hip`, state, screenshot, cadence));
  }

  await page.setViewportSize({ width: 2560, height: 1440 });
  for (const { family, weapon } of [
    { family: 'handgun', weapon: 'pistol' },
    { family: 'long-gun', weapon: 'm4a1' },
    { family: 'railgun', weapon: 'railgun' },
    { family: 'flare-handgun', weapon: 'flare-gun' },
  ]) {
    await page.evaluate((selected) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.setReloadCaptureProgress(null);
      api.equipWeapon(selected);
    }, weapon);
    await page.waitForFunction((selected) => {
      const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
      return presentation?.weapon === selected && presentation?.importedModel?.weapon === selected;
    }, weapon, { timeout: 30_000 });
    await page.waitForTimeout(900);
    const highResolutionState = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    const label = `${family}/${weapon}/hip-2560x1440`;
    violations.push(...presentationViolations(label, highResolutionState));
    const highResolutionScreenshot = await capture(page, `${family}-${weapon}-hip-2560x1440`);
    evidence.push(evidenceFor(label, highResolutionState, highResolutionScreenshot));
  }
  await page.setViewportSize({ width: 1600, height: 900 });

  await page.evaluate(() => { const api = window.__ATOMIC_ACRES_DEBUG__; api.equipWeapon('m4a1'); api.setAds(true); });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.adsProgress > 0.98, undefined, { timeout: 12_000 });
  await page.waitForTimeout(300);
  let state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  violations.push(...presentationViolations('long-gun/m4a1/ads', state));
  let screenshot = await capture(page, 'long-gun-m4a1-ads');
  evidence.push(evidenceFor('long-gun/m4a1/ads', state, screenshot));

  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false); api.setAmmo('m4a1', 10, 60); api.reload(); api.setReloadCaptureProgress(0.46);
  });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.actionContract?.state === 'reload', undefined, { timeout: 12_000 });
  await page.waitForTimeout(250);
  state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  violations.push(...presentationViolations('long-gun/m4a1/reload', state));
  screenshot = await capture(page, 'long-gun-m4a1-reload');
  evidence.push(evidenceFor('long-gun/m4a1/reload', state, screenshot));
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(null));

  // The deterministic pose override does not cancel authoritative reload
  // timing. Await the real reload exit before starting independent melee proof
  // so no screenshot can combine a knife pose with "Reloading M4A1" state.
  await page.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
    return presentation?.actionContract?.state !== 'reload';
  }, undefined, { timeout: 6_000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('#killfeed > *')]
    .some((row) => row.textContent?.includes('Reloading M4A1')), undefined, { timeout: 7_000 });

  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.setAmmo('m4a1', 30, 60);
    api.melee();
    api.setMeleeCaptureProgress(0.12);
  });
  await page.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
    return presentation?.actionContract?.state === 'melee'
      && presentation?.meleeArmSource === 'authored-rigged-arms'
      && presentation?.knifeVisible === true;
  }, undefined, { timeout: 5_000 });
  for (const progress of [0.12, 0.42, 0.82]) {
    await page.evaluate((value) => window.__ATOMIC_ACRES_DEBUG__.setMeleeCaptureProgress(value), progress);
    await page.waitForTimeout(120);
    state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    const label = `melee/knife/${progress.toFixed(2)}`;
    violations.push(...presentationViolations(label, state));
    const presentation = state.weaponPresentation;
    if (presentation.actionContract?.state !== 'melee') violations.push(`${label}: action contract is ${presentation.actionContract?.state}`);
    if (presentation.meleeArmSource !== 'authored-rigged-arms') violations.push(`${label}: authored melee rig is not active`);
    if (presentation.knifeVisible !== true) violations.push(`${label}: authored knife is not visible`);
    if (presentation.authoredMeleeKnifeParent !== 'right-wrist-knife-socket') violations.push(`${label}: knife is not attached to the exported wrist socket`);
    if (!Number.isFinite(presentation.authoredMeleeGripError) || presentation.authoredMeleeGripError > 0.001) violations.push(`${label}: knife grip error ${presentation.authoredMeleeGripError}`);
    if (!Number.isFinite(presentation.authoredMeleeHandContactError) || presentation.authoredMeleeHandContactError > 0.015) violations.push(`${label}: knife-to-visible-hand contact error ${presentation.authoredMeleeHandContactError}`);
    if (!presentation.meleeKnifeFraming?.finite || !presentation.meleeKnifeFraming?.nearPlaneClear
      || !presentation.meleeKnifeFraming?.intersectsViewport) {
      violations.push(`${label}: knife is nonfinite, near-plane clipped, or offscreen`);
    }
    if (presentation.browserProceduralMeleeArmViolation || presentation.proceduralMeleeArmVisible) violations.push(`${label}: procedural browser melee fallback is visible`);
    if (presentation.passiveKnifeVisible) violations.push(`${label}: passive floating knife is visible`);
    if (!presentation.riggedArms.some((arm) => arm.side === 'right' && arm.knifeAttachedToRightWrist === true)) violations.push(`${label}: right wrist attachment telemetry failed`);
    screenshot = await capture(page, `melee-knife-${String(progress).replace('.', '_')}`);
    evidence.push(evidenceFor(label, state, screenshot));
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMeleeCaptureProgress(null));
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.knifeVisible === false, undefined, { timeout: 5_000 });
  state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  if (state.weaponPresentation.riggedMeleeBindPoseRestoredExactly !== true) violations.push('melee/exit: arm bind pose did not restore exactly');

  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.equipWeapon('m4a1');
    api.teleportPlayer(-19.65, 1.7, -14.5, Math.PI / 2, 0);
  });
  await page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.surfaceRetreat > 0.15
  ), undefined, { timeout: 10_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
  await page.waitForFunction(() => {
    const current = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return current?.player?.stance === 'prone'
      && current?.weaponPresentation?.weapon === 'm4a1'
      && current?.weaponPresentation?.surfaceRetreat > 0.25
      && current?.weaponPresentation?.surfaceLift >= 0.13;
  }, undefined, { timeout: 15_000 });
  await page.waitForTimeout(400);
  state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  violations.push(...presentationViolations('contact/m4a1/prone-wall-floor-hip', state));
  if (state.weaponPresentation.contactResponse?.contract !== 'catalog-viewmodel-contact-response-v2'
    || state.weaponPresentation.contactResponse?.additionalDropMeters <= 0.04
    || state.weaponPresentation.contactResponse?.aimAuthority !== 'camera-forward-unchanged') {
    violations.push(`contact/m4a1/prone-wall-floor-hip: invalid response ${JSON.stringify(state.weaponPresentation.contactResponse)}`);
  }
  screenshot = await capture(page, 'contact-m4a1-prone-wall-floor-hip');
  evidence.push(evidenceFor('contact/m4a1/prone-wall-floor-hip', state, screenshot));
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.adsProgress > 0.999, undefined, { timeout: 12_000 });
  await page.waitForTimeout(350);
  state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  violations.push(...presentationViolations('contact/m4a1/prone-wall-floor-ads', state));
  if (state.weaponPresentation.contactResponse?.highReadyBlend <= 0.2
    || state.weaponPresentation.contactResponse?.additionalDropMeters <= 0.04
    || state.aimAlignment?.errorCssPixels > 1) {
    violations.push(`contact/m4a1/prone-wall-floor-ads: contact/aim invariant failed`);
  }
  screenshot = await capture(page, 'contact-m4a1-prone-wall-floor-ads');
  evidence.push(evidenceFor('contact/m4a1/prone-wall-floor-ads', state, screenshot));
  if (state.render.runtime.actualBackend !== 'webgpu') violations.push(`runtime backend is ${state.render.runtime.actualBackend}`);
  if (state.render.profile !== 'blender') violations.push(`render profile is ${state.render.profile}`);
  if (state.render.runtime.softwareAdapter === true) violations.push('WebGPU gate used a software adapter');
  violations.push(...fatalBrowserErrors(errors).map((message) => `browser/GPU error: ${message}`));

  const endingRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const endingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  if (endingRevision !== sourceRevision) violations.push('source revision changed during visual gate');
  if (!allowDirty && endingStatus !== startingStatus) violations.push('tracked source changed during visual gate');
  const receipt = {
    schema: 'atomic-acres/pass65-first-person-arms-visual-gate@1', verdict: violations.length === 0 ? 'pass' : 'fail',
    sourceRevision, route, browser: browser.version(),
    renderer: { requested: 'webgpu', actual: state.render.runtime.actualBackend, softwareAdapter: state.render.runtime.softwareAdapter, profile: state.render.profile },
    representatives, evidence, browserErrors: fatalBrowserErrors(errors), violations,
  };
  await writeFile(`${artifactRoot}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (violations.length > 0) throw new Error(`Pass 65 first-person arms visual gate failed:\n- ${violations.join('\n- ')}`);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
