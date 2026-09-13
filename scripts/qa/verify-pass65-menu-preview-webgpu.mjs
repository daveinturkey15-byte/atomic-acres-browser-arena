import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.QA_PREVIEW_PORT ?? '44165');
const allowDirty = process.env.PASS65_MENU_PREVIEW_ALLOW_DIRTY === '1';
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const startingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
if (!allowDirty && startingStatus.length > 0) {
  throw new Error('Pass 65 menu-preview WebGPU QA requires a completely clean worktree for exact-SHA evidence');
}
const chromeCandidates = [
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 65 menu-preview WebGPU QA requires installed Google Chrome');

const artifactRoot = 'artifacts/pass65/menu-preview-webgpu';
await mkdir(artifactRoot, { recursive: true });
const server = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
});
let browser;

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
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ entries: [] }),
  }));
  await page.route('**/v1/streak', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ accepted: true }),
  }));

  await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&requireWebGPU=1&render=blender&seed=6505`);
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return ['menu-video-ready', 'ready'].includes(state?.bootstrap.stage)
      && state?.render.runtime.actualBackend === 'webgpu'
      && state?.menuPreview.sourceCount === 2;
  }, undefined, { timeout: 60_000 });

  // WebGPU performs one bounded empty-scene bootstrap probe after device setup.
  // Establish a stable baseline before attributing any later submission to menu browsing.
  await page.waitForTimeout(1_000);
  const before = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      gameStarted: state.gameStarted,
      menuLifecycle: state.menuLifecycle,
      runtime: state.render.runtime,
      menuPreview: state.menuPreview,
      arenaStreaming: state.arenaSelection.streaming,
    };
  });
  await page.waitForTimeout(250);
  const settledSample = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      submissionSequence: state.render.runtime.presentation.submissionSequence,
      renderCalls: state.menuPreview.rendererEvidence.renderCalls,
    };
  });
  const browseSamples = [];
  for (const arenaId of ['skyline-terminal', 'rustworks-1v1', 'gun-range', 'atomic-acres']) {
    await page.locator(`.map-card[data-arena-id="${arenaId}"]`).click();
    await page.waitForFunction((expectedArena) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.menuPreview.arenaId === expectedArena
        && state.menuPreview.sourceCount === 2
        && state.menuPreview.videoCurrentSrc.includes(`/menu-previews/${expectedArena}.`);
    }, arenaId, { timeout: 15_000 });
    browseSamples.push(await page.evaluate((selectedArenaId) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        arenaId: selectedArenaId,
        submissionSequence: state.render.runtime.presentation.submissionSequence,
        renderCalls: state.menuPreview.rendererEvidence.renderCalls,
      };
    }, arenaId));
  }
  const afterBrowse = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      gameStarted: state.gameStarted,
      menuLifecycle: state.menuLifecycle,
      runtime: state.render.runtime,
      menuPreview: state.menuPreview,
      arenaStreaming: state.arenaSelection.streaming,
    };
  });

  const browseFailures = [];
  if (before.runtime.actualBackend !== 'webgpu' || before.runtime.softwareAdapter) browseFailures.push('hardware WebGPU was not active');
  if (before.runtime.presentation.submissionSequence > 1 || before.menuPreview.rendererEvidence.renderCalls > 1) {
    browseFailures.push('pre-deployment bootstrap exceeded one bounded empty-scene renderer probe');
  }
  if (settledSample.submissionSequence !== before.runtime.presentation.submissionSequence
    || settledSample.renderCalls !== before.menuPreview.rendererEvidence.renderCalls) {
    browseFailures.push('pre-deployment renderer baseline did not settle');
  }
  if (afterBrowse.runtime.presentation.submissionSequence !== before.runtime.presentation.submissionSequence) {
    browseFailures.push('map browsing submitted a WebGPU gameplay frame');
  }
  if (before.menuPreview.rendererEvidence.renderCalls !== afterBrowse.menuPreview.rendererEvidence.renderCalls) {
    browseFailures.push('map browsing changed gameplay render calls');
  }
  if (before.menuPreview.rendererSubmissions !== 0 || afterBrowse.menuPreview.rendererSubmissions !== 0) {
    browseFailures.push('prerecorded menu-preview controller reported a renderer submission');
  }
  if (afterBrowse.menuPreview.rendererEvidence.gameplayArenaPrepared
    || afterBrowse.arenaStreaming.constructionCount !== 0
    || afterBrowse.arenaStreaming.residentArenaRoots !== 0) {
    browseFailures.push('map browsing constructed or retained a gameplay arena');
  }
  if (browseFailures.length > 0) {
    throw new Error(`${browseFailures.join('; ')}: ${JSON.stringify({
      before: {
        submissionSequence: before.runtime.presentation.submissionSequence,
        renderCalls: before.menuPreview.rendererEvidence.renderCalls,
        gameplayArenaPrepared: before.menuPreview.rendererEvidence.gameplayArenaPrepared,
        constructionCount: before.arenaStreaming.constructionCount,
        residentArenaRoots: before.arenaStreaming.residentArenaRoots,
        gameStarted: before.gameStarted,
        menuSurface: before.menuLifecycle.surface,
      },
      afterBrowse: {
        submissionSequence: afterBrowse.runtime.presentation.submissionSequence,
        renderCalls: afterBrowse.menuPreview.rendererEvidence.renderCalls,
        gameplayArenaPrepared: afterBrowse.menuPreview.rendererEvidence.gameplayArenaPrepared,
        constructionCount: afterBrowse.arenaStreaming.constructionCount,
        residentArenaRoots: afterBrowse.arenaStreaming.residentArenaRoots,
        gameStarted: afterBrowse.gameStarted,
        menuSurface: afterBrowse.menuLifecycle.surface,
      },
      browseSamples,
      settledSample,
    })}`);
  }

  await page.locator('.map-card[data-arena-id="gun-range"]').click();
  await page.waitForFunction(() => {
    const preview = window.__ATOMIC_ACRES_DEBUG__.snapshot().menuPreview;
    const video = document.querySelector('#menu-preview-video');
    return preview.videoCurrentSrc.includes('/menu-previews/gun-range.')
      && video instanceof HTMLVideoElement
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && video.currentTime >= 1.5;
  }, undefined, { timeout: 15_000 });
  await page.screenshot({ path: `${artifactRoot}/gun-range-menu-preview.png`, animations: 'disabled' });
  await page.locator('#player-name').fill('WebGPU Preview QA');
  await page.locator('#solo').click();
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true, undefined, { timeout: 75_000 });
  const reviewCamera = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const before = api.snapshot();
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    return {
      applied: api.setArenaReviewCamera('gun-range-armory-support'),
      beforeFrame: before.frameCount,
      beforeSubmission: before.render.runtime.presentation.submissionSequence,
    };
  });
  if (!reviewCamera.applied) throw new Error('Gun Range authored-rack review camera was unavailable');
  await page.waitForFunction(({ beforeFrame, beforeSubmission }) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const presentation = state.render.runtime.presentation;
    return state.render.playableScene.deterministicReview.cameraId === 'gun-range-armory-support'
      && state.frameCount > beforeFrame
      && presentation.submissionSequence > beforeSubmission;
  }, reviewCamera, { timeout: 20_000 });
  const reviewSubmission = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime.presentation.submissionSequence
  ));
  await page.waitForFunction((targetSequence) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.render.playableScene.deterministicReview.cameraId === 'gun-range-armory-support'
      && state.render.runtime.presentation.completedSequence >= targetSequence;
  }, reviewSubmission, { timeout: 20_000 });
  const afterDeployment = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      runtime: state.render.runtime,
      profile: state.render.profile,
      playableScene: state.render.playableScene,
      menuPreview: state.menuPreview,
      arenaStreaming: state.arenaSelection.streaming,
      arenaId: state.arenaSelection.id,
      gameStarted: state.gameStarted,
      rangePractice: state.rangePractice,
    };
  });
  if (afterDeployment.arenaId !== 'gun-range'
    || afterDeployment.arenaStreaming.constructionCount !== 1
    || afterDeployment.arenaStreaming.constructionHistory[0] !== 'gun-range'
    || afterDeployment.arenaStreaming.residentArenaRoots !== 1
    || afterDeployment.runtime.presentation.submissionSequence < 1
    || afterDeployment.runtime.presentation.status !== 'healthy') {
    throw new Error(`explicit deployment did not produce one healthy selected WebGPU arena: ${JSON.stringify(afterDeployment)}`);
  }
  const expectedRackWeapons = ['carbine', 'smg', 'lmg', 'scattergun', 'sniper'];
  const expectedRackRequests = expectedRackWeapons.map((weapon) => (
    `./assets/original/models/weapons/pass65-firearms/${weapon}/${weapon}-world-lod0.glb`
  ));
  const rackFailures = [];
  if (afterDeployment.runtime.actualBackend !== 'webgpu' || afterDeployment.runtime.softwareAdapter === true) {
    rackFailures.push('authored rack gate did not use hardware WebGPU');
  }
  if (afterDeployment.profile !== 'blender') rackFailures.push(`authored rack gate used ${afterDeployment.profile} instead of Quality`);
  if (afterDeployment.playableScene.deterministicReview.cameraId !== 'gun-range-armory-support') {
    rackFailures.push('deterministic armory review camera was not active');
  }
  if (afterDeployment.rangePractice.rackPresentation?.status !== 'ready'
    || afterDeployment.rangePractice.rackPresentation?.ready !== expectedRackWeapons.length
    || afterDeployment.rangePractice.rackPresentation?.source !== 'project-original-blender-world-lod0') {
    rackFailures.push(`rack aggregate did not attest five authored models: ${JSON.stringify(afterDeployment.rangePractice.rackPresentation)}`);
  }
  if (JSON.stringify(afterDeployment.playableScene.arena?.requestedResources) !== JSON.stringify(expectedRackRequests)) {
    rackFailures.push(`selected request receipt mismatch: ${JSON.stringify(afterDeployment.playableScene.arena?.requestedResources)}`);
  }
  if (afterDeployment.rangePractice.stations.length !== expectedRackWeapons.length) {
    rackFailures.push(`expected ${expectedRackWeapons.length} rack stations, received ${afterDeployment.rangePractice.stations.length}`);
  }
  afterDeployment.rangePractice.stations.forEach((station, index) => {
    const expectedWeapon = expectedRackWeapons[index];
    const expectedSource = expectedRackRequests[index];
    if (station.weapon !== expectedWeapon
      || station.authored !== true
      || station.deliveryVariant !== 'world'
      || station.presentationSource !== 'project-original-blender-world-lod0'
      || station.importedWeaponSource !== expectedSource
      || typeof station.modelId !== 'string'
      || station.modelId.length === 0
      || /procedural|fallback|test-only/i.test(`${station.modelId} ${station.importedWeaponSource} ${station.presentationSource}`)) {
      rackFailures.push(`station ${index} failed authored identity: ${JSON.stringify(station)}`);
    }
  });
  if (rackFailures.length > 0) throw new Error(`Gun Range authored-rack gate failed: ${rackFailures.join('; ')}`);
  if (errors.length > 0) throw new Error(`browser/GPU errors: ${[...new Set(errors)].join(' | ')}`);

  const endingRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const endingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (!allowDirty && (endingRevision !== sourceRevision || endingStatus !== startingStatus)) {
    throw new Error('source changed during exact Gun Range authored-rack WebGPU capture');
  }

  const receipt = {
    checkedAt: new Date().toISOString(),
    sourceRevision,
    exactSource: !allowDirty && startingStatus.length === 0 && endingRevision === sourceRevision && endingStatus === startingStatus,
    executablePath,
    before,
    settledSample,
    browseSamples,
    afterBrowse,
    reviewSubmission,
    afterDeployment,
    errors,
    pass: true,
  };
  await writeFile(`${artifactRoot}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await page.screenshot({ path: `${artifactRoot}/gun-range-deployment.png`, animations: 'disabled' });
  console.log(JSON.stringify({
    pass: true,
    backend: afterDeployment.runtime.actualBackend,
    bootstrapSubmissionSequence: before.runtime.presentation.submissionSequence,
    menuSubmissionDelta: afterBrowse.runtime.presentation.submissionSequence - before.runtime.presentation.submissionSequence,
    menuArenaConstructions: afterBrowse.arenaStreaming.constructionCount,
    deploymentArenaConstructions: afterDeployment.arenaStreaming.constructionCount,
    receipt: `${artifactRoot}/receipt.json`,
  }));
} finally {
  await browser?.close();
  await server.close();
}
