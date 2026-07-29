import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { isFatalWebGpuConsoleWarning } from './pass65-browser-console-contract.mjs';

const port = Number(process.env.PASS65_COLD_ADMISSION_PORT ?? '44175');
const requestedTrials = Number(process.env.PASS65_COLD_ADMISSION_TRIALS ?? '3');
const trials = Math.min(5, Math.max(3, Math.floor(requestedTrials)));
const maximumFirstSwitchFrameMs = 50;
const artifactRoot = 'artifacts/pass65/cold-webgpu-admission';
const chromeCandidates = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 65 cold admission requires installed Google Chrome');

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
  throw new Error('Pass 65 cold admission requires a clean tracked worktree');
}

await mkdir(artifactRoot, { recursive: true });
const server = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
});
const receipts = [];

function uniqueFatalErrors(errors) {
  return [...new Set(errors)].filter((message) => !/favicon|leaderboard|Failed to fetch/i.test(message));
}

async function stubExternalServices(page) {
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
}

try {
  await server.listen();
  for (let trial = 1; trial <= trials; trial += 1) {
    let browser;
    try {
      // A new browser process guarantees a new WebGPU device and prevents a
      // prior trial's in-memory shader/pipeline cache from warming this path.
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
      const browserVersion = browser.version();
      const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error'
          || message.type() === 'warning' && isFatalWebGpuConsoleWarning(message.text())) {
          errors.push(message.text());
        }
      });
      await stubExternalServices(page);

      await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&render=blender&map=atomic-acres&seed=${65_100 + trial}`);
      await page.waitForFunction(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return state?.bootstrap.stage === 'ready'
          && state?.render.runtime.actualBackend === 'webgpu'
          && state?.render.runtime.softwareAdapter === false
          && state?.menuPreview.rendererEvidence.gameplayArenaPrepared === false
          && state?.arenaSelection.streaming.constructionCount === 0;
      }, undefined, { timeout: 60_000 });

      const before = await page.evaluate(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          gameStarted: state.gameStarted,
          bootstrap: state.bootstrap,
          runtime: state.render.runtime,
          localLightOcclusion: state.render.worldLocalLightOcclusion,
          arenaId: state.arenaSelection.id,
          streaming: state.arenaSelection.streaming,
        };
      });
      await page.locator('.map-card[data-arena-id="atomic-acres"]').click();
      await page.locator('#player-name').fill(`Cold Atomic QA ${trial}`);
      await page.locator('#solo').click();
      await page.waitForFunction(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        if (!state) return false;
        const transition = state.arenaSelection.streaming.transition;
        return state.gameStarted === true
          || state.bootstrap.stage === 'failed'
          || transition.failure !== null
          || transition.phase === 'failed'
          || state.render.runtime.deviceLost
          || state.render.runtime.uncapturedErrors > 0;
      }, undefined, { timeout: 90_000 });
      await page.waitForTimeout(1_000);

      const firstSwitchAudit = await page.evaluate(async () => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const beforeSwitches = api.snapshot().weaponPresentation.browserWeaponCatalog;
        const weaponIds = [...beforeSwitches.retained];
        const samples = [];
        for (const weaponId of weaponIds) {
          const startedAt = performance.now();
          api.equipWeapon(weaponId);
          const firstPresentedAt = await new Promise((resolve) => requestAnimationFrame(resolve));
          const settledAt = await new Promise((resolve) => requestAnimationFrame(resolve));
          samples.push({
            weaponId,
            firstFrameMs: firstPresentedAt - startedAt,
            settledFrameMs: settledAt - firstPresentedAt,
          });
        }
        const afterSwitches = api.snapshot().weaponPresentation.browserWeaponCatalog;
        return {
          before: beforeSwitches,
          after: afterSwitches,
          samples,
          maximumFirstFrameMs: Math.max(0, ...samples.map((sample) => sample.firstFrameMs)),
          maximumSettledFrameMs: Math.max(0, ...samples.map((sample) => sample.settledFrameMs)),
        };
      });

      const after = await page.evaluate(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          gameStarted: state.gameStarted,
          bootstrap: state.bootstrap,
          runtime: state.render.runtime,
          localLightOcclusion: state.render.worldLocalLightOcclusion,
          renderProfile: state.render.profile,
          atomicQualityStreaming: state.render.qualityAssetStreaming.atomicAcres,
          blenderEnvironment: state.render.blenderEnvironment,
          originalArtLoaded: state.originalArtLoaded,
          arenaId: state.arenaSelection.id,
          streaming: state.arenaSelection.streaming,
        };
      });
      const fatalErrors = uniqueFatalErrors(errors);
      const transition = after.streaming.transition;
      const failures = [];
      if (before.gameStarted || before.streaming.constructionCount !== 0) failures.push('gameplay was not cold before the physical menu start');
      if (before.runtime.actualBackend !== 'webgpu' || before.runtime.softwareAdapter) failures.push('hardware WebGPU was not active');
      if (before.localLightOcclusion.violations.length > 0) failures.push(`pre-start local-light violations: ${before.localLightOcclusion.violations.join(', ')}`);
      if (!after.gameStarted || after.arenaId !== 'atomic-acres' || !after.originalArtLoaded) failures.push('Atomic Acres did not become the playable arena');
      if (!after.bootstrap.matchAdmissionCadence
        || after.bootstrap.matchAdmissionCadence.admittedDegraded !== false
        || after.bootstrap.matchAdmissionCadence.visibilityState !== 'visible') {
        failures.push(`foreground match admission was degraded: ${JSON.stringify(after.bootstrap.matchAdmissionCadence)}`);
      }
      if (after.renderProfile !== 'blender'
        || after.atomicQualityStreaming !== 'ready'
        || !after.blenderEnvironment.qualityArtRootVisible
        || after.blenderEnvironment.proceduralRootActuallyVisible
        || after.blenderEnvironment.overlappingPrimaryArenaRoots) {
        failures.push(`Atomic Acres did not retain its intended Quality presentation: ${JSON.stringify({
          renderProfile: after.renderProfile,
          atomicQualityStreaming: after.atomicQualityStreaming,
          blenderEnvironment: after.blenderEnvironment,
        })}`);
      }
      if (after.streaming.constructionCount !== 1 || after.streaming.constructionHistory[0] !== 'atomic-acres') failures.push('cold deployment did not construct exactly one Atomic arena');
      if (firstSwitchAudit.before.retainedCount !== firstSwitchAudit.before.available
        || firstSwitchAudit.before.loaded !== firstSwitchAudit.before.available
        || firstSwitchAudit.before.gpuReady !== firstSwitchAudit.before.available
        || new Set(firstSwitchAudit.before.retained).size !== firstSwitchAudit.before.available) {
        failures.push(`deployment weapon catalog was incomplete: ${JSON.stringify(firstSwitchAudit.before)}`);
      }
      if (firstSwitchAudit.before.unpreparedSwitches !== 0 || firstSwitchAudit.after.unpreparedSwitches !== 0) {
        failures.push(`a first weapon switch reached an unprepared model: ${JSON.stringify(firstSwitchAudit.after.lastUnpreparedSwitch)}`);
      }
      if (firstSwitchAudit.maximumFirstFrameMs > maximumFirstSwitchFrameMs) {
        failures.push(`first prepared weapon switch frame ${firstSwitchAudit.maximumFirstFrameMs.toFixed(1)}ms exceeded ${maximumFirstSwitchFrameMs}ms`);
      }
      if (transition.phase !== 'idle' || transition.failure !== null || transition.renderSubmissionPaused) failures.push(`arena transition did not commit cleanly: ${JSON.stringify(transition)}`);
      if (after.runtime.actualBackend !== 'webgpu' || after.runtime.softwareAdapter || after.runtime.deviceLost) failures.push('hardware WebGPU did not remain healthy');
      if (after.runtime.uncapturedErrors !== 0 || after.runtime.presentation.completionFailures !== 0 || after.runtime.presentation.status !== 'healthy') failures.push(`presentation failed: ${JSON.stringify(after.runtime.presentation)}`);
      if (after.localLightOcclusion.violations.length > 0) failures.push(`active local-light violations: ${after.localLightOcclusion.violations.join(', ')}`);
      if (fatalErrors.length > 0) failures.push(`browser/GPU errors: ${fatalErrors.join(' | ')}`);

      const receipt = { trial, browserVersion, before, after, firstSwitchAudit, errors: fatalErrors, pass: failures.length === 0 };
      receipts.push(receipt);
      if (trial === 1) await page.screenshot({ path: `${artifactRoot}/atomic-quality-active.png`, animations: 'disabled' });
      await context.close();
      if (failures.length > 0) throw new Error(`cold Atomic trial ${trial} failed: ${failures.join('; ')}`);
    } finally {
      await browser?.close();
    }
  }

  const receipt = {
    gate: 'pass65-cold-physical-menu-webgpu-admission',
    verdict: 'pass',
    checkedAt: new Date().toISOString(),
    sourceRevision,
    executablePath,
    trials: receipts,
  };
  await writeFile(`${artifactRoot}/exact-sha-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    pass: true,
    sourceRevision,
    trials: receipts.length,
    adapter: receipts[0]?.after.runtime.adapterLabel,
    receipt: `${artifactRoot}/exact-sha-receipt.json`,
  }));
} catch (error) {
  await writeFile(`${artifactRoot}/failure-receipt.json`, `${JSON.stringify({
    gate: 'pass65-cold-physical-menu-webgpu-admission',
    verdict: 'fail',
    checkedAt: new Date().toISOString(),
    sourceRevision,
    executablePath,
    trials: receipts,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  await server.close();
}
