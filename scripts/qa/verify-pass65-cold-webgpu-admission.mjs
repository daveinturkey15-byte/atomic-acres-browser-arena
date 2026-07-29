import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { isFatalWebGpuConsoleWarning } from './pass65-browser-console-contract.mjs';

const port = Number(process.env.PASS65_COLD_ADMISSION_PORT ?? '44175');
const requestedTrials = Number(process.env.PASS65_COLD_ADMISSION_TRIALS ?? '3');
const trials = Math.min(5, Math.max(3, Math.floor(requestedTrials)));
const maximumPreparedSwitchFrameMs = 50;
const maximumColdTransitionMs = 10_000;
const maximumMenuDeploymentPrewarmMs = 10_000;
const maximumWeaponCatalogPrewarmMs = 5_000;
const maximumEffectPrewarmMs = 4_500;
const artifactRoot = 'artifacts/pass65/cold-webgpu-admission';
const chromeCandidates = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 65 cold admission requires installed Google Chrome');

async function runtimeWeaponCorpusFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await runtimeWeaponCorpusFiles(path));
    else if (/(?:-world-lod0|-drop-lod0)\.glb$/.test(entry.name)) files.push(path);
  }
  return files;
}

const runtimeWeaponCorpusPaths = await runtimeWeaponCorpusFiles('public/assets/original/models/weapons');
const runtimeWeaponCorpusCompressedBytes = (await Promise.all(
  runtimeWeaponCorpusPaths.map(async (path) => (await stat(path)).size),
)).reduce((sum, size) => sum + size, 0);

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

function variantCacheKeys(telemetry, variant) {
  return telemetry.entries
    .filter((entry) => entry.variant === variant)
    .map((entry) => entry.key)
    .sort();
}

function intervalUnionDurationMs(intervals) {
  const ordered = intervals
    .filter(({ startedAt, completedAt }) => Number.isFinite(startedAt) && Number.isFinite(completedAt))
    .map(({ startedAt, completedAt }) => ({
      startedAt: Math.min(startedAt, completedAt),
      completedAt: Math.max(startedAt, completedAt),
    }))
    .sort((left, right) => left.startedAt - right.startedAt);
  if (ordered.length !== intervals.length) return Number.POSITIVE_INFINITY;
  let durationMs = 0;
  let activeStart = ordered[0]?.startedAt ?? 0;
  let activeEnd = ordered[0]?.completedAt ?? 0;
  for (const interval of ordered.slice(1)) {
    if (interval.startedAt <= activeEnd) {
      activeEnd = Math.max(activeEnd, interval.completedAt);
      continue;
    }
    durationMs += activeEnd - activeStart;
    activeStart = interval.startedAt;
    activeEnd = interval.completedAt;
  }
  return Number((durationMs + activeEnd - activeStart).toFixed(3));
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
      await page.addInitScript(() => {
        window.__PASS65_COLD_TASK_AUDIT__ = {
          supported: typeof PerformanceObserver === 'function',
          startedAt: performance.now(),
          menuInteractiveAt: null,
          deploymentStartedAt: null,
          longTasks: [],
        };
        if (window.__PASS65_COLD_TASK_AUDIT__.supported) {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.startTime < window.__PASS65_COLD_TASK_AUDIT__.startedAt) continue;
              window.__PASS65_COLD_TASK_AUDIT__.longTasks.push({
                startTime: entry.startTime,
                duration: entry.duration,
                name: entry.name,
              });
            }
          }).observe({ type: 'longtask', buffered: true });
        }
      });
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
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const state = api.snapshot();
        window.__PASS65_COLD_TASK_AUDIT__.menuInteractiveAt = performance.now();
        return {
          gameStarted: state.gameStarted,
          bootstrap: state.bootstrap,
          runtime: state.render.runtime,
          localLightOcclusion: state.render.worldLocalLightOcclusion,
          arenaId: state.arenaSelection.id,
          streaming: state.arenaSelection.streaming,
          weaponAssetCache: api.sampleWeaponAssetCache(),
        };
      });
      const menuInteractionAudit = await page.evaluate(() => ({
        sampledAt: performance.now(),
        selectedArena: window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.id,
        mapButtonsEnabled: [...document.querySelectorAll('.map-card[data-arena-id]')]
          .every((button) => !(button instanceof HTMLButtonElement) || !button.disabled),
        soloEnabled: !(document.querySelector('#solo')?.disabled ?? true),
      }));
      await page.locator('.map-card[data-arena-id="skyline-terminal"]').click();
      await page.waitForFunction(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return state.arenaSelection.id === 'skyline-terminal'
          && state.arenaSelection.streaming.constructionCount === 0;
      });
      await page.locator('.map-card[data-arena-id="atomic-acres"]').click();
      await page.waitForFunction(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return state.arenaSelection.id === 'atomic-acres'
          && state.arenaSelection.streaming.constructionCount === 0;
      });
      await page.locator('#player-name').fill(`Cold Atomic QA ${trial}`);
      await page.evaluate(() => {
        window.__PASS65_COLD_TASK_AUDIT__.deploymentStartedAt = performance.now();
      });
      await page.locator('#solo').click();
      const earlyDeploymentAudit = await page.evaluate(() => ({
        sampledAt: performance.now(),
        lifecycle: document.documentElement.dataset.menuLifecycle ?? null,
        transitionVisible: !(document.querySelector('#deployment-transition')?.hidden ?? true),
        media: document.querySelector('#deployment-transition')?.getAttribute('data-media') ?? null,
        liveRender: document.querySelector('#deployment-transition')?.getAttribute('data-live-render') ?? null,
      }));
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

      const admitted = await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const state = api.snapshot();
        return {
          bootstrap: state.bootstrap,
          weaponAssetCache: api.sampleWeaponAssetCache(),
        };
      });

      const firstSwitchAudit = await page.evaluate(async () => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const beforeSwitches = api.sampleWeaponCatalogReadiness();
        const weaponIds = [...beforeSwitches.retained];
        const samples = [];
        for (const weaponId of weaponIds) {
          const startedAt = performance.now();
          api.equipWeapon(weaponId);
          const frameTimes = [];
          for (let frame = 0; frame < 3; frame += 1) {
            frameTimes.push(await new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now()))));
          }
          const frameGapsMs = frameTimes.map((at, index) => at - (index === 0 ? startedAt : frameTimes[index - 1]));
          samples.push({
            weaponId,
            startedAt,
            completedAt: frameTimes.at(-1),
            frameGapsMs,
            maximumFrameMs: Math.max(...frameGapsMs),
          });
        }
        const afterSwitches = api.sampleWeaponCatalogReadiness();
        return {
          before: beforeSwitches,
          after: afterSwitches,
          samples,
          maximumFrameMs: Math.max(0, ...samples.map((sample) => sample.maximumFrameMs)),
        };
      });
      await page.waitForTimeout(100);
      const taskAudit = await page.evaluate(() => ({
        supported: window.__PASS65_COLD_TASK_AUDIT__.supported,
        startedAt: window.__PASS65_COLD_TASK_AUDIT__.startedAt,
        menuInteractiveAt: window.__PASS65_COLD_TASK_AUDIT__.menuInteractiveAt,
        deploymentStartedAt: window.__PASS65_COLD_TASK_AUDIT__.deploymentStartedAt,
        longTasks: [...window.__PASS65_COLD_TASK_AUDIT__.longTasks],
        resources: performance.getEntriesByType('resource').map((entry) => ({
          name: new URL(entry.name, location.href).pathname,
          startTime: entry.startTime,
          duration: entry.duration,
          transferSize: 'transferSize' in entry ? entry.transferSize : null,
          decodedBodySize: 'decodedBodySize' in entry ? entry.decodedBodySize : null,
        })),
        heap: 'memory' in performance ? {
          usedJsHeapSize: performance.memory.usedJSHeapSize,
          totalJsHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        } : null,
      }));

      const after = await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const state = api.snapshot();
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
          weaponAssetCache: api.sampleWeaponAssetCache(),
        };
      });
      const fatalErrors = uniqueFatalErrors(errors);
      const transition = after.streaming.transition;
      const failures = [];
      if (before.gameStarted || before.streaming.constructionCount !== 0) failures.push('gameplay was not cold before the physical menu start');
      if (before.runtime.actualBackend !== 'webgpu' || before.runtime.softwareAdapter) failures.push('hardware WebGPU was not active');
      if (before.localLightOcclusion.violations.length > 0) failures.push(`pre-start local-light violations: ${before.localLightOcclusion.violations.join(', ')}`);
      const corpusPolicy = after.weaponAssetCache.runtimeCorpus.policy;
      const decodedRuntimeCorpusBytes = after.weaponAssetCache.resident.world.estimatedDecodedBytes
        + after.weaponAssetCache.resident.drop.estimatedDecodedBytes;
      const menuPrewarmProfile = after.bootstrap.menuDeploymentAssetsProfile;
      if (!menuPrewarmProfile?.completed || menuPrewarmProfile.error !== null
        || menuPrewarmProfile.phases.length !== 3) {
        failures.push(`menu deployment prewarm did not complete: ${JSON.stringify(menuPrewarmProfile)}`);
      } else if (menuPrewarmProfile.durationMs > maximumMenuDeploymentPrewarmMs) {
        failures.push(`menu deployment prewarm ${menuPrewarmProfile.durationMs}ms exceeded ${maximumMenuDeploymentPrewarmMs}ms`);
      }
      if (!menuInteractionAudit.mapButtonsEnabled || !menuInteractionAudit.soloEnabled) {
        failures.push(`menu interactions were disabled during background deployment preparation: ${JSON.stringify(menuInteractionAudit)}`);
      }
      if (earlyDeploymentAudit.lifecycle !== 'deploying' || !earlyDeploymentAudit.transitionVisible
        || earlyDeploymentAudit.liveRender !== 'false'
        || !['shared-prerecorded-video', 'reduced-motion-poster'].includes(earlyDeploymentAudit.media)) {
        failures.push(`early deployment did not remain behind bounded loading media: ${JSON.stringify(earlyDeploymentAudit)}`);
      }
      if (!after.weaponAssetCache.runtimeCorpus.ready || after.weaponAssetCache.runtimeCorpus.prewarming
        || after.weaponAssetCache.runtimeCorpus.profile?.completed !== true
        || after.weaponAssetCache.runtimeCorpus.profile.loadedAssets !== corpusPolicy.assets) {
        failures.push(`runtime weapon corpus was not retained: ${JSON.stringify(after.weaponAssetCache.runtimeCorpus)}`);
      }
      if (runtimeWeaponCorpusPaths.length !== corpusPolicy.assets
        || runtimeWeaponCorpusCompressedBytes > corpusPolicy.maximumCompressedBytes) {
        failures.push(`runtime weapon corpus compressed budget failed: ${runtimeWeaponCorpusPaths.length} assets / ${runtimeWeaponCorpusCompressedBytes} bytes`);
      }
      if (decodedRuntimeCorpusBytes > corpusPolicy.maximumEstimatedDecodedBytes) {
        failures.push(`runtime weapon corpus decoded estimate ${decodedRuntimeCorpusBytes} exceeded ${corpusPolicy.maximumEstimatedDecodedBytes}`);
      }
      const expectedResidentAssetsPerVariant = corpusPolicy.assets / corpusPolicy.variants.length;
      if (after.weaponAssetCache.resident.world.assets !== expectedResidentAssetsPerVariant
        || after.weaponAssetCache.resident.drop.assets !== expectedResidentAssetsPerVariant) {
        failures.push(`runtime weapon corpus residency was incomplete: ${JSON.stringify(after.weaponAssetCache.resident)}`);
      }
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
      if (firstSwitchAudit.maximumFrameMs > maximumPreparedSwitchFrameMs) {
        failures.push(`prepared weapon switch frame ${firstSwitchAudit.maximumFrameMs.toFixed(1)}ms exceeded ${maximumPreparedSwitchFrameMs}ms`);
      }
      const profile = transition.profile;
      const phaseDuration = (phase) => profile?.phases.find((entry) => entry.phase === phase)?.durationMs ?? Number.POSITIVE_INFINITY;
      const menuPhaseDuration = (phase) => menuPrewarmProfile?.phases.find((entry) => entry.name === phase)?.durationMs
        ?? Number.POSITIVE_INFINITY;
      if (!profile || profile.durationMs > maximumColdTransitionMs) {
        failures.push(`cold transition ${profile?.durationMs ?? 'missing'}ms exceeded ${maximumColdTransitionMs}ms`);
      }
      const coldPreparationWorkMs = intervalUnionDurationMs([
        { startedAt: menuPrewarmProfile?.startedAt, completedAt: menuPrewarmProfile?.completedAt },
        { startedAt: profile?.startedAt, completedAt: profile?.completedAt },
      ]);
      if (coldPreparationWorkMs > maximumColdTransitionMs) {
        failures.push(`combined cold preparation work ${coldPreparationWorkMs}ms exceeded preserved ${maximumColdTransitionMs}ms budget`);
      }
      if (menuPhaseDuration('first-person-catalog') > maximumWeaponCatalogPrewarmMs) {
        failures.push(`menu weapon catalog prewarm ${menuPhaseDuration('first-person-catalog')}ms exceeded ${maximumWeaponCatalogPrewarmMs}ms`);
      }
      if (phaseDuration('weapon-catalog-prewarm') > maximumWeaponCatalogPrewarmMs) {
        failures.push(`weapon catalog prewarm ${phaseDuration('weapon-catalog-prewarm')}ms exceeded ${maximumWeaponCatalogPrewarmMs}ms`);
      }
      if (phaseDuration('prewarm-batched-effects') > maximumEffectPrewarmMs) {
        failures.push(`effect prewarm ${phaseDuration('prewarm-batched-effects')}ms exceeded ${maximumEffectPrewarmMs}ms`);
      }
      const effectPrewarmProfile = after.bootstrap.effectPrewarmProfile;
      if (effectPrewarmProfile?.groups.length !== 6) {
        failures.push(`bounded effect prewarm groups were incomplete: ${JSON.stringify(effectPrewarmProfile)}`);
      }
      if (!taskAudit.supported) failures.push('browser Long Tasks API unavailable for cold admission audit');
      const overlapsWindow = (entry, startedAt, completedAt = Number.POSITIVE_INFINITY) => (
        entry.startTime + entry.duration > startedAt && entry.startTime < completedAt
      );
      const menuPrewarmLongTasks = menuPrewarmProfile?.completedAt === null || !menuPrewarmProfile
        ? []
        : taskAudit.longTasks.filter((entry) => overlapsWindow(
          entry, menuPrewarmProfile.startedAt, menuPrewarmProfile.completedAt,
        ));
      const admissionLongTasks = taskAudit.deploymentStartedAt === null
        ? []
        : taskAudit.longTasks.filter((entry) => overlapsWindow(entry, taskAudit.deploymentStartedAt));
      if (menuPrewarmLongTasks.length > 0) {
        failures.push(`menu deployment prewarm produced ${menuPrewarmLongTasks.length} >=50ms main-thread tasks (max ${Math.max(...menuPrewarmLongTasks.map((entry) => entry.duration)).toFixed(1)}ms)`);
      }
      if (admissionLongTasks.length > 0) {
        failures.push(`cold admission produced ${admissionLongTasks.length} >=50ms main-thread tasks (max ${Math.max(...admissionLongTasks.map((entry) => entry.duration)).toFixed(1)}ms)`);
      }
      const postCorpusPrewarmLoads = taskAudit.resources.filter((entry) => (
        /\/models\/weapons\//.test(entry.name) && /(?:-world-lod0|-drop-lod0)\.glb$/.test(entry.name)
        && menuPrewarmProfile?.completedAt != null
        && entry.startTime > menuPrewarmProfile.completedAt
      ));
      if (postCorpusPrewarmLoads.length > 0) {
        failures.push(`gameplay re-decoded ${postCorpusPrewarmLoads.length} retained world/drop weapon assets`);
      }
      if (!after.weaponAssetCache.runtimeCorpus.ready || after.weaponAssetCache.loading !== 0) {
        failures.push(`runtime weapon corpus changed after admission: ${JSON.stringify(after.weaponAssetCache.runtimeCorpus)}`);
      }
      for (const variant of corpusPolicy.variants) {
        const admittedKeys = variantCacheKeys(admitted.weaponAssetCache, variant);
        const finalKeys = variantCacheKeys(after.weaponAssetCache, variant);
        if (admittedKeys.length !== after.weaponAssetCache.budgets[variant]
          || JSON.stringify(admittedKeys) !== JSON.stringify(finalKeys)) {
          failures.push(`${variant} weapon source cache churned during live exercise: ${JSON.stringify({ admittedKeys, finalKeys })}`);
        }
      }
      if (transition.phase !== 'idle' || transition.failure !== null || transition.renderSubmissionPaused) failures.push(`arena transition did not commit cleanly: ${JSON.stringify(transition)}`);
      if (after.runtime.actualBackend !== 'webgpu' || after.runtime.softwareAdapter || after.runtime.deviceLost) failures.push('hardware WebGPU did not remain healthy');
      if (after.runtime.uncapturedErrors !== 0 || after.runtime.presentation.completionFailures !== 0 || after.runtime.presentation.status !== 'healthy') failures.push(`presentation failed: ${JSON.stringify(after.runtime.presentation)}`);
      if (after.localLightOcclusion.violations.length > 0) failures.push(`active local-light violations: ${after.localLightOcclusion.violations.join(', ')}`);
      if (fatalErrors.length > 0) failures.push(`browser/GPU errors: ${fatalErrors.join(' | ')}`);

      const receipt = {
        trial,
        browserVersion,
        runtimeWeaponCorpus: {
          files: runtimeWeaponCorpusPaths.length,
          compressedBytes: runtimeWeaponCorpusCompressedBytes,
          decodedBytesEstimate: decodedRuntimeCorpusBytes,
          postPrewarmLoads: postCorpusPrewarmLoads,
        },
        before,
        menuInteractionAudit,
        earlyDeploymentAudit,
        coldPreparationWorkMs,
        admitted,
        after,
        firstSwitchAudit,
        taskAudit: { ...taskAudit, menuPrewarmLongTasks, admissionLongTasks },
        errors: fatalErrors,
        pass: failures.length === 0,
      };
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
