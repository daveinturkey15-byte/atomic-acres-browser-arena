import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.PASS66_SKY_WEBGPU_PORT ?? '44266');
const artifactRoot = 'artifacts/pass66/sky-backdrops';
await rm(artifactRoot, { recursive: true, force: true });
await mkdir(artifactRoot, { recursive: true });
const skyAssets = Object.freeze({
  'atomic-acres': './assets/original/skies/atomic-acres-sunset.webp',
  'rustworks-1v1': './assets/original/skies/rustworks-industrial-night.webp',
  'skyline-terminal': './assets/original/skies/terminal-airport-dawn.webp',
});
const skyAssetPaths = new Set(Object.values(skyAssets).map((asset) => asset.slice(1)));
const forceFallback = process.env.PASS66_SKY_FORCE_FALLBACK === '1';
const localViteOverrides = ['.env', '.env.local', '.env.development', '.env.development.local']
  .filter((path) => existsSync(path));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`Pass 66 sky WebGPU gate rejects Vite environment overrides (${[
    ...localViteOverrides,
    ...inheritedViteVariables,
  ].join(', ')})`);
}
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceRevision)) {
  throw new Error(`Pass 66 sky WebGPU gate found an invalid source revision ${sourceRevision}`);
}
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()) {
  throw new Error('Pass 66 sky WebGPU gate requires a clean tracked and untracked worktree');
}
const expectedSourceRevision = process.env.PASS66_SKY_SOURCE_SHA?.trim();
if (expectedSourceRevision && expectedSourceRevision !== sourceRevision) {
  throw new Error(`Pass 66 sky WebGPU expected ${expectedSourceRevision}, found ${sourceRevision}`);
}
const executablePath = [
  process.env.PASS66_CHROME_PATH,
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 66 sky WebGPU gate requires installed Google Chrome');

const evidenceStem = forceFallback ? 'atomic-acres-webgpu-fallback' : 'atomic-acres-webgpu';
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
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
  const page = await browser.newPage({ viewport: { width: 2_560, height: 1_440 }, deviceScaleFactor: 1 });
  const errors = [];
  const skyResponses = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    const expectedForcedDecodeFailure = forceFallback && /Failed to load resource: net::ERR_FAILED/i.test(message.text());
    if (message.type() === 'error' && !expectedForcedDecodeFailure
      && !/favicon|leaderboard|Failed to fetch|fonts\.googleapis/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (skyAssetPaths.has(new URL(response.url()).pathname)) {
      skyResponses.push({ url: response.url(), status: response.status(), ok: response.ok() });
    }
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"entries":[]}' }));
  await page.route('**/v1/streak', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' }));
  if (forceFallback) await page.route('**/assets/original/skies/atomic-acres-sunset.webp', (route) => route.abort('failed'));

  await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&requireWebGPU=1&externalServices=off&render=blender&map=atomic-acres&grass=off&mist=off&signal=off&seed=660201`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready'
      && state?.weaponReady === true
      && state?.render?.runtime?.actualBackend === 'webgpu';
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.matchPhase === 'active'
      && state?.arenaSelection?.id === 'atomic-acres'
      && state?.arenaSelection?.streaming?.transition?.phase === 'idle'
      && state?.render?.playableScene?.arena?.requestedResources?.includes('./assets/original/skies/atomic-acres-sunset.webp');
  }, undefined, { timeout: 60_000 });
  if (!forceFallback) {
    const skyResponseDeadline = Date.now() + 30_000;
    while (skyResponses.length === 0 && Date.now() < skyResponseDeadline) await page.waitForTimeout(50);
    if (skyResponses.length === 0) throw new Error('Atomic Acres generated sky emitted no HTTP response');
  }

  const sampleVisit = () => page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      arenaId: state.arenaSelection.id,
      arenaReceipt: state.render.playableScene.arena,
      arenaWatchdog: state.render.playableScene.renderWatchdog,
      authoritativeArenaRoots: state.render.playableScene.authoritativeArenaRoots,
      runtime: {
        actualBackend: state.render.runtime.actualBackend,
        deviceLost: state.render.runtime.deviceLost,
        uncapturedErrors: state.render.runtime.uncapturedErrors,
        presentationStatus: state.render.runtime.presentation.status,
      },
      frameCount: state.frameCount,
    };
  });
  const waitForCurrentArenaWatchdog = (arenaId) => page.waitForFunction((id) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    const watchdog = state?.render?.playableScene?.renderWatchdog;
    return state?.arenaSelection?.id === id
      && watchdog?.status === 'healthy'
      && watchdog?.lastAudit?.arenaId === id;
  }, arenaId, { timeout: 15_000 });
  await waitForCurrentArenaWatchdog('atomic-acres');
  const visits = [await sampleVisit()];
  for (const arenaId of ['skyline-terminal', 'rustworks-1v1', 'atomic-acres']) {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu());
    await page.waitForFunction(() => document.querySelector('#menu')?.classList.contains('hidden') === false,
      undefined, { timeout: 15_000 });
    await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.selectArena(id), arenaId);
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    });
    // Keep transition polling to cheap DOM lifecycle state. Repeated full
    // snapshots traverse both retained arena roots and can perturb the WebGPU
    // submission deadline this gate is intended to observe.
    try {
      await page.waitForFunction((id) => (
        document.documentElement.dataset.gameplayArena === id
          && document.querySelector('#menu')?.classList.contains('hidden') === true
      ), arenaId, { timeout: 15_000 });
    } catch (error) {
      const stalled = await page.evaluate(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return {
          gameStarted: state?.gameStarted ?? null,
          arenaSelection: state?.arenaSelection ?? null,
          runtime: state?.render?.runtime ?? null,
          gameplayArena: document.documentElement.dataset.gameplayArena ?? null,
          menuHidden: document.querySelector('#menu')?.classList.contains('hidden') === true,
          status: document.querySelector('#status')?.textContent ?? null,
        };
      }).catch((snapshotError) => ({ snapshotError: String(snapshotError) }));
      throw new Error(`${arenaId} WebGPU sky map switch exceeded 15 seconds: ${JSON.stringify(stalled)}`, { cause: error });
    }
    await page.waitForTimeout(1_250);
    await waitForCurrentArenaWatchdog(arenaId);
    const visit = await sampleVisit();
    await page.waitForFunction((frameCount) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > frameCount, visit.frameCount);
    visits.push(visit);
  }

  const atomicVisits = visits.filter((visit) => visit.arenaId === 'atomic-acres');
  if (atomicVisits.length !== 2
    || atomicVisits.some((visit) => !visit.arenaReceipt.requestedResources.includes(skyAssets['atomic-acres']))) {
    throw new Error(`Atomic Acres sky request was missing from a map-switch receipt: ${JSON.stringify(visits)}`);
  }
  for (const visit of visits) {
    const selectedSky = skyAssets[visit.arenaId];
    const requested = visit.arenaReceipt.requestedResources;
    if (!selectedSky || !requested.includes(selectedSky)
      || Object.values(skyAssets).some((asset) => asset !== selectedSky && requested.includes(asset))) {
      throw new Error(`Outdoor sky selection leaked across map ownership: ${JSON.stringify(visits)}`);
    }
  }
  const requiredResponseAssets = Object.entries(skyAssets)
    .filter(([arenaId]) => !forceFallback || arenaId !== 'atomic-acres')
    .map(([, asset]) => asset);
  if (requiredResponseAssets.some((asset) => !skyResponses.some((response) => (
    new URL(response.url).pathname === asset.slice(1) && response.ok
  ))) || skyResponses.some((response) => !response.ok)) {
    throw new Error(`Generated outdoor skies did not return successful responses: ${JSON.stringify(skyResponses)}`);
  }
  if (visits.some((visit) => visit.runtime.deviceLost
    || visit.runtime.uncapturedErrors !== 0
    || visit.runtime.presentationStatus !== 'healthy'
    || visit.arenaWatchdog.status !== 'healthy'
    || visit.arenaWatchdog.lastAudit?.arenaId !== visit.arenaId
    || visit.authoritativeArenaRoots !== 1)) {
    throw new Error(`Atomic Acres WebGPU map-switch lifecycle was unhealthy: ${JSON.stringify(visits)}`);
  }
  if (errors.length > 0) throw new Error(`Atomic Acres WebGPU sky emitted browser/GPU errors: ${[...new Set(errors)].join('\n')}`);

  const overviewFrame = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    if (!api.setArenaReviewCamera('nuke-town-overview')) throw new Error('Atomic Acres overview camera was rejected');
    return api.snapshot().frameCount;
  });
  await page.waitForFunction((frameCount) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > frameCount, overviewFrame);
  await page.screenshot({ path: `${artifactRoot}/${evidenceStem}-2560x1440.png`, animations: 'disabled' });
  const groundFrame = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setCaptureCameraPose(0, 5, 20, 0, -0.15, 70, 63_000, 6_401);
    return api.snapshot().frameCount;
  });
  await page.waitForFunction((frameCount) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > frameCount, groundFrame);
  await page.screenshot({ path: `${artifactRoot}/${evidenceStem}-ground-context-2560x1440.png`, animations: 'disabled' });
  const endingRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const endingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (endingStatus || endingRevision !== sourceRevision) {
    throw new Error(`Pass 66 sky WebGPU source drifted during capture (${sourceRevision} -> ${endingRevision})`);
  }
  const receipt = {
    schema: 'atomic-acres/pass66-sky-webgpu@2',
    verdict: 'pass',
    sourceRevision,
    sourceState: {
      revision: sourceRevision,
      endingRevision,
      cleanBefore: true,
      cleanAfter: true,
      expectedRevision: expectedSourceRevision ?? sourceRevision,
    },
    backend: 'webgpu',
    forceFallback,
    skyAssets,
    skyResponses,
    visits,
    errors,
  };
  await writeFile(`${artifactRoot}/${evidenceStem}-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log('PASS66_ATOMIC_SKY_WEBGPU', JSON.stringify(receipt));
} finally {
  await browser?.close();
  await server.close();
}
