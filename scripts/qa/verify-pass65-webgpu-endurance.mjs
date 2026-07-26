import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.PASS65_ENDURANCE_PORT ?? '44075');
const sampleIntervalMs = Math.max(500, Number(process.env.PASS65_SAMPLE_INTERVAL_MS ?? '1_000'));
const rustworksDurationMs = Math.max(10_000, Number(process.env.PASS65_RUSTWORKS_SOAK_MS ?? '45_000'));
const otherArenaDurationMs = Math.max(5_000, Number(process.env.PASS65_MAP_SOAK_MS ?? '12_000'));
const artifactRoot = 'artifacts/pass65/webgpu-endurance';
const chromeCandidates = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 65 endurance requires PASS65_CHROME_PATH or installed Google Chrome');

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const trackedWorktreeDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0;
if (trackedWorktreeDirty) throw new Error('Pass 65 endurance requires a clean tracked worktree so the receipt identifies an exact source SHA');

const arenaSequence = [
  'rustworks-1v1',
  'gun-range',
  'skyline-terminal',
  'atomic-acres',
  'rustworks-1v1',
];

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function fatalBrowserErrors(errors) {
  return [...new Set(errors)].filter((message) => (
    /GPUValidationError|device\s*lost|destroyed|uncaptured|WebGPU|render.*stalled|context.*lost/i.test(message)
    || !/favicon|leaderboard|Failed to fetch/i.test(message)
  ));
}

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
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&map=rustworks-1v1&render=blender&grass=on&mist=on&seed=6501`);
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true
      && state?.bootstrap?.stage === 'ready'
      && state?.render?.runtime?.actualBackend === 'webgpu';
  }, undefined, { timeout: 60_000 });

  const arenaReceipts = [];
  for (const [visit, arenaId] of arenaSequence.entries()) {
    await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.selectArena(id), arenaId);
    await page.waitForFunction((id) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.arenaSelection?.id === id
        && state?.arenaSelection?.streaming?.transition?.phase === 'idle'
        && state?.arenaSelection?.streaming?.transition?.failure === null;
    }, arenaId, { timeout: 30_000 });
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.equipKit('marksman');
      api.startSolo();
      api.setBotsFrozen(true);
      api.setMovement(true, true);
    });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true
        && state?.render?.runtime?.presentation?.status === 'healthy'
        && document.querySelector('#menu')?.classList.contains('hidden');
    }, undefined, { timeout: 30_000 });

    const durationMs = arenaId === 'rustworks-1v1' ? rustworksDurationMs : otherArenaDurationMs;
    const startedAt = Date.now();
    const samples = [];
    const screenshotHashes = new Set();
    let previous = null;
    let sampleIndex = 0;
    let lastScreenshot = null;
    while (Date.now() - startedAt < durationMs) {
      await page.evaluate((index) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const state = api.snapshot();
        const [x, y, z] = state.player.position;
        api.setCaptureCameraPose(x, y, z, (index * 0.31) % (Math.PI * 2), Math.sin(index * 0.37) * 0.08);
        if (index % 4 === 0) {
          api.setGrenades(1);
          api.throwGrenade();
        }
        if (index % 5 === 1) {
          api.equipWeapon('explosive-crossbow');
          api.fireOnce();
        } else if (index % 5 === 3) {
          api.equipWeapon('m14-ebr');
          api.setAds(true);
          api.fireOnce();
        } else api.setAds(false);
        if (index % 7 === 2 && state.interactiveWorld?.envelope?.placements?.length > 0) api.damageShed();
      }, sampleIndex);
      await page.waitForTimeout(sampleIntervalMs);

      const sample = await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const state = api.snapshot();
        return {
          atMs: performance.now(),
          frameCount: state.frameCount,
          gameStarted: state.gameStarted,
          arenaId: state.arenaSelection.id,
          transition: state.arenaSelection.streaming.transition,
          runtime: state.render.runtime,
          watchdog: state.render.playableScene.renderWatchdog,
          gpuRetirement: state.interactiveWorld.gpuRetirement,
          smokePresentation: state.dmrThermal.smokePresentation,
          residency: api.sampleRendererResidency(),
        };
      });
      lastScreenshot = await page.locator('#game').screenshot();
      const screenshotHash = digest(lastScreenshot);
      screenshotHashes.add(screenshotHash);

      if (!sample.gameStarted || sample.arenaId !== arenaId
        || sample.transition.phase !== 'idle' || sample.transition.failure !== null || sample.transition.renderSubmissionPaused
        || sample.runtime.actualBackend !== 'webgpu' || sample.runtime.deviceLost
        || sample.runtime.presentation.status !== 'healthy'
        || sample.watchdog.status !== 'healthy' || sample.watchdog.fatal
        || sample.gpuRetirement.failures !== 0
        || sample.smokePresentation.liveDisposals !== 0) {
        throw new Error(`${arenaId} entered an invalid presentation state: ${JSON.stringify(sample)}`);
      }
      if (previous) {
        const elapsedMs = Math.max(1, sample.atMs - previous.atMs);
        const frameDelta = sample.frameCount - previous.frameCount;
        const completionDelta = sample.runtime.presentation.completedSequence - previous.runtime.presentation.completedSequence;
        const minimumProgress = Math.max(4, Math.floor(elapsedMs / 100));
        if (frameDelta < minimumProgress || completionDelta < minimumProgress || screenshotHash === previous.screenshotHash) {
          throw new Error(`${arenaId} presentation freeze detected: ${JSON.stringify({ elapsedMs, frameDelta, completionDelta, screenshotHash, previous })}`);
        }
      }
      const receipt = { ...sample, screenshotHash };
      samples.push(receipt);
      previous = receipt;
      sampleIndex += 1;
    }
    if (samples.length < 5 || screenshotHashes.size < Math.ceil(samples.length * 0.8)) {
      throw new Error(`${arenaId} did not produce enough distinct live presentation samples`);
    }
    if (lastScreenshot) await writeFile(`${artifactRoot}/${visit}-${arenaId}-final.png`, lastScreenshot);
    const beforeReturn = samples.at(-1);
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.setMovement(false);
      api.setCaptureCameraPose(null);
      api.returnToMainMenu();
    });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === false && !document.querySelector('#menu')?.classList.contains('hidden');
    }, undefined, { timeout: 20_000 });
    const afterReturn = await page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        frameCount: state.frameCount,
        runtime: state.render.runtime,
        gpuRetirement: state.interactiveWorld.gpuRetirement,
        smokePresentation: state.dmrThermal.smokePresentation,
      };
    });
    if (afterReturn.runtime.presentation.status !== 'healthy'
      || afterReturn.gpuRetirement.failures !== 0
      || afterReturn.smokePresentation.liveDisposals !== 0
      || afterReturn.smokePresentation.active !== 0) {
      throw new Error(`${arenaId} menu return did not retire presentation safely: ${JSON.stringify(afterReturn)}`);
    }
    arenaReceipts.push({
      visit,
      arenaId,
      requestedDurationMs: durationMs,
      actualDurationMs: samples.at(-1).atMs - samples[0].atMs,
      samples: samples.length,
      distinctScreenshots: screenshotHashes.size,
      first: samples[0],
      last: beforeReturn,
      afterReturn,
    });
  }

  const uniqueErrors = fatalBrowserErrors(errors);
  if (uniqueErrors.length > 0) throw new Error(`Pass 65 endurance emitted browser/GPU errors: ${uniqueErrors[0]}`);
  const output = {
    gate: 'pass65-webgpu-presentation-endurance',
    verdict: 'pass',
    sourceRevision,
    browserExecutable: executablePath,
    viewport: [2560, 1440],
    sampleIntervalMs,
    rustworksDurationMs,
    otherArenaDurationMs,
    arenaSequence,
    browserErrors: [...new Set(errors)],
    arenaReceipts,
  };
  await writeFile(`${artifactRoot}/exact-sha-receipt.json`, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
