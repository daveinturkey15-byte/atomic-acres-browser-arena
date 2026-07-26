import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.QA_PREVIEW_PORT ?? '44165');
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
    args: [
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

  await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&render=blender&seed=6505`);
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return ['menu-video-ready', 'ready'].includes(state?.bootstrap.stage)
      && state?.render.runtime.actualBackend === 'webgpu'
      && state?.menuPreview.sourceCount === 2;
  }, undefined, { timeout: 60_000 });

  const before = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      runtime: state.render.runtime,
      menuPreview: state.menuPreview,
      arenaStreaming: state.arenaSelection.streaming,
    };
  });
  for (const arenaId of ['skyline-terminal', 'rustworks-1v1', 'gun-range', 'atomic-acres']) {
    await page.locator(`.map-card[data-arena-id="${arenaId}"]`).click();
    await page.waitForFunction((expectedArena) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.menuPreview.arenaId === expectedArena
        && state.menuPreview.sourceCount === 2
        && state.menuPreview.videoCurrentSrc.includes(`/menu-previews/${expectedArena}.`);
    }, arenaId, { timeout: 15_000 });
  }
  const afterBrowse = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      runtime: state.render.runtime,
      menuPreview: state.menuPreview,
      arenaStreaming: state.arenaSelection.streaming,
    };
  });

  const browseFailures = [];
  if (before.runtime.actualBackend !== 'webgpu' || before.runtime.softwareAdapter) browseFailures.push('hardware WebGPU was not active');
  if (before.runtime.presentation.submissionSequence !== 0 || afterBrowse.runtime.presentation.submissionSequence !== 0) {
    browseFailures.push('map browsing submitted a WebGPU gameplay frame');
  }
  if (before.menuPreview.rendererEvidence.renderCalls !== afterBrowse.menuPreview.rendererEvidence.renderCalls) {
    browseFailures.push('map browsing changed gameplay render calls');
  }
  if (afterBrowse.menuPreview.rendererEvidence.gameplayArenaPrepared
    || afterBrowse.arenaStreaming.constructionCount !== 0
    || afterBrowse.arenaStreaming.residentArenaRoots !== 0) {
    browseFailures.push('map browsing constructed or retained a gameplay arena');
  }
  if (browseFailures.length > 0) throw new Error(browseFailures.join('; '));

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
  const afterDeployment = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      runtime: state.render.runtime,
      menuPreview: state.menuPreview,
      arenaStreaming: state.arenaSelection.streaming,
      arenaId: state.arenaSelection.id,
      gameStarted: state.gameStarted,
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
  if (errors.length > 0) throw new Error(`browser/GPU errors: ${[...new Set(errors)].join(' | ')}`);

  const receipt = {
    checkedAt: new Date().toISOString(),
    executablePath,
    before,
    afterBrowse,
    afterDeployment,
    errors,
    pass: true,
  };
  await writeFile(`${artifactRoot}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await page.screenshot({ path: `${artifactRoot}/gun-range-deployment.png`, animations: 'disabled' });
  console.log(JSON.stringify({
    pass: true,
    backend: afterDeployment.runtime.actualBackend,
    menuSubmissionSequence: afterBrowse.runtime.presentation.submissionSequence,
    menuArenaConstructions: afterBrowse.arenaStreaming.constructionCount,
    deploymentArenaConstructions: afterDeployment.arenaStreaming.constructionCount,
    receipt: `${artifactRoot}/receipt.json`,
  }));
} finally {
  await browser?.close();
  await server.close();
}
