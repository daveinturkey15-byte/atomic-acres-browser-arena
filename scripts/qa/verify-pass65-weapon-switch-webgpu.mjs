import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const artifactRoot = 'artifacts/pass65/weapon-switch-webgpu';
const allowDirty = process.env.PASS65_WEAPON_SWITCH_ALLOW_DIRTY === '1';
const maximumFrameGapMs = Math.min(
  1_000,
  Math.max(100, Number(process.env.PASS65_WEAPON_SWITCH_MAX_FRAME_MS ?? '250')),
);
const baseUrl = process.env.QA_BASE_URL;
if (!baseUrl) {
  throw new Error('Pass 65 weapon-switch WebGPU gate requires QA_BASE_URL; run npm run qa:pass65:weapon-switch-webgpu');
}

const executablePath = [
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 65 weapon-switch WebGPU gate requires installed Google Chrome');

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const startingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
if (!allowDirty && startingStatus.length > 0) {
  throw new Error('Pass 65 weapon-switch WebGPU gate requires a clean worktree');
}

const route = new URL('/', baseUrl);
route.searchParams.set('release', 'latest');
route.searchParams.set('renderer', 'webgpu');
route.searchParams.set('requireWebGPU', '1');
route.searchParams.set('render', 'blender');
route.searchParams.set('map', 'atomic-acres');
route.searchParams.set('seed', '650095');

function unique(values) {
  return [...new Set(values)];
}

function sameMembers(left, right) {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}

function fatalBrowserErrors(errors) {
  return unique(errors).filter((message) => (
    /GPUValidationError|device\s*lost|destroyed|uncaptured|WebGPU|render.*stalled|context.*lost/i.test(message)
    || !/favicon|leaderboard|Failed to fetch|fonts\.googleapis/i.test(message)
  ));
}

async function stubExternalServices(page) {
  await page.route('https://fonts.googleapis.com/**', (request) => request.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '',
  }));
  await page.route('**/v1/leaderboard?*', (request) => request.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ entries: [] }),
  }));
  await page.route('**/v1/streak', (request) => request.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ accepted: true }),
  }));
}

function catalogEvidence(state) {
  const catalog = state.weaponPresentation.browserWeaponCatalog;
  return {
    weapon: state.weaponPresentation.weapon,
    weaponModelId: state.weaponPresentation.weaponModelId,
    firstPersonSource: state.weaponPresentation.firstPersonSource,
    detailsReady: state.weaponPresentation.detailsReady,
    modelVisibleMeshCount: state.weaponPresentation.modelVisibleMeshCount,
    retained: [...catalog.retained],
    retainedCount: catalog.retainedCount,
    loaded: catalog.loaded,
    gpuReady: catalog.gpuReady,
    available: catalog.available,
    prewarming: catalog.prewarming,
    unpreparedSwitches: catalog.unpreparedSwitches,
    lastUnpreparedSwitch: catalog.lastUnpreparedSwitch,
    maximumRetained: catalog.maximumRetained,
    flashlightGpuPrewarmCount: catalog.flashlightGpuPrewarmCount,
    renderSubmissionPaused: state.arenaSelection.streaming.transition.renderSubmissionPaused,
    transitionPhase: state.arenaSelection.streaming.transition.phase,
    transitionFailure: state.arenaSelection.streaming.transition.failure,
    frameCount: state.frameCount,
    presentation: state.render.runtime.presentation,
    actualBackend: state.render.runtime.actualBackend,
    softwareAdapter: state.render.runtime.softwareAdapter,
    deviceLost: state.render.runtime.deviceLost,
    uncapturedErrors: state.render.runtime.uncapturedErrors,
  };
}

function catalogViolations(label, evidence, expectedWeapons, baselineUnpreparedSwitches) {
  const violations = [];
  if (evidence.actualBackend !== 'webgpu' || evidence.softwareAdapter === true) {
    violations.push(`${label}: hardware WebGPU is not active`);
  }
  if (evidence.deviceLost === true || evidence.uncapturedErrors !== 0) {
    violations.push(`${label}: WebGPU device/error telemetry is unhealthy`);
  }
  if (evidence.presentation?.status !== 'healthy' || evidence.presentation?.completionFailures !== 0) {
    violations.push(`${label}: presentation telemetry is ${JSON.stringify(evidence.presentation)}`);
  }
  if (evidence.renderSubmissionPaused === true) violations.push(`${label}: renderSubmissionPaused was true`);
  if (evidence.transitionPhase !== 'idle' || evidence.transitionFailure !== null) {
    violations.push(`${label}: arena transition is not idle and healthy`);
  }
  if (evidence.prewarming === true) violations.push(`${label}: weapon catalog was still prewarming after match admission`);
  if (!sameMembers(evidence.retained, expectedWeapons)) {
    violations.push(`${label}: retained catalog ${JSON.stringify(evidence.retained)} does not equal reachable set ${JSON.stringify(expectedWeapons)}`);
  }
  if (evidence.retainedCount !== expectedWeapons.length) {
    violations.push(`${label}: retained count ${evidence.retainedCount} does not equal ${expectedWeapons.length}`);
  }
  if (evidence.loaded !== expectedWeapons.length || evidence.gpuReady !== expectedWeapons.length) {
    violations.push(`${label}: expected ${expectedWeapons.length} loaded and GPU-ready models, received loaded=${evidence.loaded}, gpuReady=${evidence.gpuReady}`);
  }
  if (evidence.maximumRetained < expectedWeapons.length) {
    violations.push(`${label}: maximum retained ${evidence.maximumRetained} cannot hold the ${expectedWeapons.length}-weapon reachable set`);
  }
  if (evidence.flashlightGpuPrewarmCount < 1) {
    violations.push(`${label}: flashlight lighting/shadow pipeline was not prewarmed`);
  }
  if (evidence.unpreparedSwitches !== baselineUnpreparedSwitches) {
    violations.push(`${label}: unprepared switches changed from ${baselineUnpreparedSwitches} to ${evidence.unpreparedSwitches}`);
  }
  return violations;
}

await mkdir(artifactRoot, { recursive: true });
let browser;
let page;
const errors = [];
const violations = [];
const switches = [];
let authority = null;
let baseline = null;
let final = null;
let monitor = null;

try {
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
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await stubExternalServices(page);

  await page.goto(route.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready'
      && state?.weaponReady === true
      && state?.render?.runtime?.actualBackend === 'webgpu'
      && state?.render?.runtime?.softwareAdapter === false
      && document.querySelector('#loadout-primary') instanceof HTMLSelectElement
      && document.querySelector('#solo') instanceof HTMLButtonElement;
  }, undefined, { timeout: 60_000 });

  const menuAuthority = await page.evaluate(() => ({
    primaryOptions: [...document.querySelector('#loadout-primary').options].map((option) => option.value),
    secondaryOptions: [...document.querySelector('#loadout-secondary').options].map((option) => option.value),
  }));
  if (menuAuthority.primaryOptions.length === 0) violations.push('menu authority exposes no primary weapons');
  if (unique(menuAuthority.primaryOptions).length !== menuAuthority.primaryOptions.length) {
    violations.push(`menu authority contains duplicate primary options: ${JSON.stringify(menuAuthority.primaryOptions)}`);
  }

  // Exercise the physical owner path through arena selection and the Solo
  // control. Debug APIs are reserved for deterministic post-admission switches.
  await page.locator('.map-card[data-arena-id="atomic-acres"]').click();
  await page.locator('#player-name').fill('Pass 65 Weapon Switch QA');
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true
      && state?.matchPhase === 'active'
      && state?.arenaSelection?.id === 'atomic-acres'
      && state?.arenaSelection?.streaming?.transition?.phase === 'idle'
      && state?.arenaSelection?.streaming?.transition?.failure === null
      && state?.weaponPresentation?.browserWeaponCatalog?.prewarming === false
      && state?.render?.runtime?.presentation?.status === 'healthy';
  }, undefined, { timeout: 120_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    window.__ATOMIC_ACRES_DEBUG__.setMovement(false);
  });

  const admittedState = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  authority = {
    kind: 'menu-primary-and-secondary-options-plus-handicap-sidearm-and-map-specials',
    primaryOptions: menuAuthority.primaryOptions,
    secondaryOptions: menuAuthority.secondaryOptions,
    admittedSecondary: admittedState.player.secondaryWeapon,
    handicapSidearm: 'magnum',
    mapSpecials: ['railgun', 'flamethrower', 'flare-gun'],
  };
  const expectedWeapons = unique([
    ...authority.primaryOptions,
    ...authority.secondaryOptions,
    authority.handicapSidearm,
    ...authority.mapSpecials,
  ]);
  const knownProfiles = Object.keys(admittedState.ballistics.weaponProfiles);
  for (const weapon of expectedWeapons) {
    if (!knownProfiles.includes(weapon)) violations.push(`reachable weapon ${weapon} has no runtime weapon profile`);
  }
  if (!authority.secondaryOptions.includes(authority.admittedSecondary)) {
    violations.push(`admitted secondary ${authority.admittedSecondary} is absent from secondary loadout authority`);
  }

  baseline = catalogEvidence(admittedState);
  const baselineUnpreparedSwitches = baseline.unpreparedSwitches;
  if (baselineUnpreparedSwitches !== 0) {
    violations.push(`baseline already contains ${baselineUnpreparedSwitches} unprepared switch(es)`);
  }
  violations.push(...catalogViolations('admission', baseline, expectedWeapons, baselineUnpreparedSwitches));

  await page.evaluate(() => {
    const monitor = {
      intervalId: 0,
      animationFrameId: 0,
      stopped: false,
      samples: 0,
      pauseObservations: [],
      maximumUnpreparedSwitches: 0,
      maximumFrameGapMs: 0,
      maximumFrameGapWeapon: null,
      lastFrameAt: performance.now(),
      currentWeapon: null,
    };
    const sample = (source) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      if (!state) return;
      monitor.samples += 1;
      const paused = state.arenaSelection.streaming.transition.renderSubmissionPaused === true;
      if (paused) monitor.pauseObservations.push({ source, at: performance.now(), weapon: state.weaponPresentation.weapon });
      monitor.maximumUnpreparedSwitches = Math.max(
        monitor.maximumUnpreparedSwitches,
        state.weaponPresentation.browserWeaponCatalog.unpreparedSwitches,
      );
    };
    const frame = (now) => {
      const gap = now - monitor.lastFrameAt;
      if (gap > monitor.maximumFrameGapMs) {
        monitor.maximumFrameGapMs = gap;
        monitor.maximumFrameGapWeapon = monitor.currentWeapon;
      }
      monitor.lastFrameAt = now;
      if (!monitor.stopped) monitor.animationFrameId = requestAnimationFrame(frame);
    };
    // Full debug snapshots are deliberately sampled at display cadence. A 0ms
    // interval plus an additional snapshot in every animation frame distorted
    // the very frame-gap measurement this gate is responsible for checking.
    monitor.intervalId = window.setInterval(() => sample('interval'), 16);
    monitor.animationFrameId = requestAnimationFrame(frame);
    window.__PASS65_WEAPON_SWITCH_MONITOR__ = monitor;
  });

  for (const weapon of expectedWeapons) {
    const immediate = await page.evaluate((requestedWeapon) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      window.__PASS65_WEAPON_SWITCH_MONITOR__.currentWeapon = requestedWeapon;
      const before = api.snapshot();
      const startedAt = performance.now();
      api.equipWeapon(requestedWeapon);
      const after = api.snapshot();
      return {
        elapsedMs: performance.now() - startedAt,
        before: {
          weapon: before.weaponPresentation.weapon,
          frameCount: before.frameCount,
          submissionSequence: before.render.runtime.presentation.submissionSequence,
          completedSequence: before.render.runtime.presentation.completedSequence,
        },
        immediate: {
          weapon: after.weaponPresentation.weapon,
          unpreparedSwitches: after.weaponPresentation.browserWeaponCatalog.unpreparedSwitches,
          prewarming: after.weaponPresentation.browserWeaponCatalog.prewarming,
          renderSubmissionPaused: after.arenaSelection.streaming.transition.renderSubmissionPaused,
        },
      };
    }, weapon);

    // Let several actual presentation frames complete. A lazy WebGPU upload or
    // compile blocks this boundary and is captured by the sticky unprepared
    // counter, pause sampler, browser errors, and frame-gap budget.
    await page.waitForFunction((requestedWeapon) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.weaponPresentation?.weapon === requestedWeapon
        && state?.weaponPresentation?.detailsReady === true
        && state?.weaponPresentation?.modelVisibleMeshCount > 0
        && state?.frameCount > 0;
    }, weapon, { timeout: 5_000 });
    await page.waitForTimeout(80);
    const settledState = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    const settled = catalogEvidence(settledState);
    const entry = { weapon, ...immediate, settled };
    switches.push(entry);

    if (immediate.immediate.weapon !== weapon) violations.push(`${weapon}: synchronous switch did not select the requested weapon`);
    if (immediate.immediate.unpreparedSwitches !== baselineUnpreparedSwitches) {
      violations.push(`${weapon}: synchronous switch incremented unpreparedSwitches to ${immediate.immediate.unpreparedSwitches}`);
    }
    if (immediate.immediate.prewarming === true) violations.push(`${weapon}: synchronous switch started catalog prewarming`);
    if (immediate.immediate.renderSubmissionPaused === true) violations.push(`${weapon}: synchronous switch paused render submission`);
    if (settled.weapon !== weapon) violations.push(`${weapon}: settled presentation reports ${settled.weapon}`);
    if (!settled.weaponModelId || settled.firstPersonSource === 'unknown' || !settled.detailsReady || settled.modelVisibleMeshCount < 1) {
      violations.push(`${weapon}: authored first-person model was not immediately present and complete`);
    }
    violations.push(...catalogViolations(weapon, settled, expectedWeapons, baselineUnpreparedSwitches));
  }

  monitor = await page.evaluate(() => {
    const monitor = window.__PASS65_WEAPON_SWITCH_MONITOR__;
    monitor.stopped = true;
    window.clearInterval(monitor.intervalId);
    cancelAnimationFrame(monitor.animationFrameId);
    return {
      samples: monitor.samples,
      pauseObservations: monitor.pauseObservations,
      maximumUnpreparedSwitches: monitor.maximumUnpreparedSwitches,
      maximumFrameGapMs: monitor.maximumFrameGapMs,
      maximumFrameGapWeapon: monitor.maximumFrameGapWeapon,
    };
  });
  final = catalogEvidence(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot()));
  if (monitor.samples < expectedWeapons.length * 2) violations.push(`pause monitor collected only ${monitor.samples} samples`);
  if (monitor.pauseObservations.length > 0) {
    violations.push(`renderSubmissionPaused was observed ${monitor.pauseObservations.length} time(s) during live switching`);
  }
  if (monitor.maximumUnpreparedSwitches !== baselineUnpreparedSwitches) {
    violations.push(`monitor observed unpreparedSwitches=${monitor.maximumUnpreparedSwitches}`);
  }
  if (monitor.maximumFrameGapMs > maximumFrameGapMs) {
    violations.push(`live weapon-switch frame gap ${monitor.maximumFrameGapMs.toFixed(1)}ms exceeded ${maximumFrameGapMs}ms`);
  }
  violations.push(...catalogViolations('final', final, expectedWeapons, baselineUnpreparedSwitches));
  violations.push(...fatalBrowserErrors(errors).map((message) => `browser/GPU error: ${message}`));

  const endingRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const endingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (endingRevision !== sourceRevision) violations.push('source revision changed during the gate');
  if (!allowDirty && endingStatus !== startingStatus) violations.push('worktree changed during the gate');

  await page.screenshot({ path: `${artifactRoot}/final-weapon.png`, animations: 'disabled', timeout: 60_000 });
  const receipt = {
    schema: 'atomic-acres/pass65-weapon-switch-webgpu-gate@1',
    verdict: violations.length === 0 ? 'pass' : 'fail',
    checkedAt: new Date().toISOString(),
    sourceRevision,
    route: route.href,
    browser: browser.version(),
    executablePath,
    renderer: {
      requested: 'webgpu',
      actual: final.actualBackend,
      softwareAdapter: final.softwareAdapter,
      deviceLost: final.deviceLost,
      uncapturedErrors: final.uncapturedErrors,
    },
    authority,
    expectedWeapons,
    maximumFrameGapMs,
    baseline,
    switches,
    monitor,
    final,
    browserErrors: fatalBrowserErrors(errors),
    violations,
  };
  await writeFile(`${artifactRoot}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (violations.length > 0) {
    throw new Error(`Pass 65 weapon-switch WebGPU gate failed:\n- ${violations.join('\n- ')}`);
  }
  console.log(JSON.stringify({
    pass: true,
    sourceRevision,
    browser: receipt.browser,
    adapter: final.presentation?.adapterLabel ?? final.actualBackend,
    weapons: expectedWeapons,
    samples: monitor.samples,
    maximumObservedFrameGapMs: monitor.maximumFrameGapMs,
    receipt: `${artifactRoot}/receipt.json`,
  }, null, 2));
} catch (error) {
  await writeFile(`${artifactRoot}/failure-receipt.json`, `${JSON.stringify({
    schema: 'atomic-acres/pass65-weapon-switch-webgpu-gate@1',
    verdict: 'fail',
    checkedAt: new Date().toISOString(),
    sourceRevision,
    route: route.href,
    authority,
    baseline,
    switches,
    monitor,
    final,
    browserErrors: fatalBrowserErrors(errors),
    violations,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  await browser?.close();
}
