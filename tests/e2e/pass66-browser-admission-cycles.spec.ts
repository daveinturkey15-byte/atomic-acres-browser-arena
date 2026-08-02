import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test';

type ArenaId = 'atomic-acres' | 'skyline-terminal' | 'rustworks-1v1' | 'gun-range';
type RenderProfile = 'performance' | 'blender' | 'compat';
type Renderer = 'webgl2' | 'webgpu';

type BrowserFault = Readonly<{
  phase: string;
  kind: 'pageerror' | 'console-error' | 'request-failed' | 'http-error';
  message: string;
  stack?: string;
}>;

type AdmissionClassification = Readonly<{
  scenario: 'fresh-context-pair' | 'cumulative-reuse';
  cycle: 'cold' | 'warm' | null;
  sweep: 'forward' | 'reverse' | null;
  cacheDisposition: 'isolated-empty-context' | 'same-context-reuse' | 'cumulative-context-reuse';
  contextId: string;
  contextAdmissionIndex: number;
}>;

type AdmissionReceipt = AdmissionClassification & Readonly<{
  profile: RenderProfile;
  arenaId: ArenaId;
  weaponReadyAtClick: boolean;
  deploymentAssetsReadyAtClick: boolean;
  menuToActiveMs: number;
  latencyCeilingMs: number;
  admissionGeneration: number;
  presentedGameplayFrame: number;
  frameCount: number;
  backend: string | null;
  webglVersion: string | null;
  contextState: string | null;
}>;

type PageAudit = Readonly<{
  contextId: string;
  clientRuntimeLog: unknown;
  runtime: unknown;
  presentation: unknown;
}>;

type AdmissionWaitOutcome = Readonly<{
  status: 'active' | 'failed';
  failure: string | null;
}>;

type FailedAdmissionEvidence = Readonly<{
  phase: string;
  failure: string;
  failedAt: {
    admission: unknown;
    bootstrap: unknown;
    transition: unknown;
    runtime: unknown;
    presentation: unknown;
    contextState: string | null;
    runtimeErrorVisible: boolean;
  };
  completionRecovery: null | {
    targetSequence: number;
    startedAt: unknown;
    endedAt: unknown;
    recovered: boolean;
    elapsedMs: number;
  };
}>;

const enabled = process.env.QA_PASS66_BROWSER_ADMISSION === '1';
const expectedSourceSha = process.env.QA_PASS66_ADMISSION_SOURCE_SHA ?? '';
const renderer: Renderer = process.env.QA_PASS66_ADMISSION_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const requestedProfiles = (process.env.QA_PASS66_ADMISSION_PROFILES ?? 'performance,blender,compat')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry): entry is RenderProfile => ['performance', 'blender', 'compat'].includes(entry));
const profiles: readonly RenderProfile[] = [...new Set(requestedProfiles)];
const requestedArenas = (process.env.QA_PASS66_ADMISSION_ARENAS
  ?? 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry): entry is ArenaId => ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'].includes(entry));
const arenas: readonly ArenaId[] = [...new Set(requestedArenas)];

const LATENCY_CEILINGS_MS = Object.freeze({
  edgeWebGl2: 20_000,
  edgeWebGpu: 35_000,
  webkitWebGl2: 60_000,
});

function admissionLatencyCeilingMs(projectName: string): number {
  if (renderer === 'webgpu') return LATENCY_CEILINGS_MS.edgeWebGpu;
  if (projectName.startsWith('webkit')) return LATENCY_CEILINGS_MS.webkitWebGl2;
  return LATENCY_CEILINGS_MS.edgeWebGl2;
}

function isolatedContextOptions(testInfo: TestInfo): BrowserContextOptions {
  const configured = testInfo.project.use;
  return {
    serviceWorkers: 'block',
    ...(configured.viewport ? { viewport: configured.viewport } : {}),
    ...(typeof configured.deviceScaleFactor === 'number'
      ? { deviceScaleFactor: configured.deviceScaleFactor }
      : {}),
    ...(typeof configured.userAgent === 'string' ? { userAgent: configured.userAgent } : {}),
    ...(typeof configured.locale === 'string' ? { locale: configured.locale } : {}),
    ...(typeof configured.timezoneId === 'string' ? { timezoneId: configured.timezoneId } : {}),
    ...(typeof configured.hasTouch === 'boolean' ? { hasTouch: configured.hasTouch } : {}),
    ...(typeof configured.isMobile === 'boolean' ? { isMobile: configured.isMobile } : {}),
  };
}

function admissionUrl(
  testInfo: TestInfo,
  profile: RenderProfile,
  arenaId: ArenaId,
  seed: string,
): string {
  const url = new URL('/', testInfo.project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer, render: profile, map: arenaId,
    requireWebGPU: renderer === 'webgpu' ? '1' : '0',
    externalServices: 'off', signal: 'off', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    seed,
  })) url.searchParams.set(key, value);
  return url.toString();
}

function installFaultCapture(page: Page, activePhase: () => string, faults: BrowserFault[]): void {
  page.on('pageerror', (error) => faults.push({
    phase: activePhase(),
    kind: 'pageerror',
    message: error.message,
    stack: error.stack,
  }));
  page.on('console', (message) => {
    if (message.type() !== 'error' || message.text().startsWith('Failed to load resource:')) return;
    faults.push({ phase: activePhase(), kind: 'console-error', message: message.text() });
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown request failure';
    if (request.resourceType() === 'media' || /ABORT|cancel/i.test(failure)) return;
    faults.push({
      phase: activePhase(),
      kind: 'request-failed',
      message: `${request.method()} ${request.url()} :: ${failure}`,
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    faults.push({
      phase: activePhase(),
      kind: 'http-error',
      message: `${response.status()} ${response.request().method()} ${response.url()}`,
    });
  });
}

async function captureFailedAdmissionEvidence(
  page: Page,
  phase: string,
  failure: string,
): Promise<FailedAdmissionEvidence> {
  const failedAt = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      admission: window.__ATOMIC_ACRES_DEBUG__.admissionState(),
      bootstrap: state.bootstrap,
      transition: state.arenaSelection?.streaming?.transition ?? null,
      runtime: state.render?.runtime ?? null,
      presentation: window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry(),
      contextState: document.documentElement.dataset.webglContext ?? null,
      runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false,
    };
  });
  const targetSequence = Number(/submission (\d+)/i.exec(failure)?.[1] ?? Number.NaN);
  const completionRecovery = Number.isSafeInteger(targetSequence)
    ? await page.evaluate(async (target) => {
        const startedAt = window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry();
        const started = performance.now();
        let endedAt = startedAt;
        while (performance.now() - started < 14_000) {
          await new Promise<void>((resolveWait) => window.setTimeout(resolveWait, 100));
          endedAt = window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry();
          if (endedAt.completedSequence >= target || endedAt.deviceLost || endedAt.uncapturedErrors > 0) break;
        }
        return {
          targetSequence: target,
          startedAt,
          endedAt,
          recovered: endedAt.completedSequence >= target,
          elapsedMs: Number((performance.now() - started).toFixed(3)),
        };
      }, targetSequence)
    : null;
  return { phase, failure, failedAt, completionRecovery };
}

async function waitForMenu(page: Page): Promise<{ weaponReady: boolean; deploymentAssetsReady: boolean }> {
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return state?.bootstrap?.stage === 'ready' && solo?.disabled === false;
  }, undefined, { timeout: 90_000 });
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#player-name').fill('PASS66 BROWSER ADMISSION');
  return page.evaluate(() => ({
    weaponReady: window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponReady === true,
    deploymentAssetsReady: window.__ATOMIC_ACRES_DEBUG__.snapshot().bootstrap?.menuDeploymentAssets?.status === 'ready',
  }));
}

async function selectArena(page: Page, arenaId: ArenaId): Promise<void> {
  const card = page.locator(`.map-card[data-arena-id="${arenaId}"]`);
  if (await card.getAttribute('aria-pressed') !== 'true') await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
}

async function returnToReadyMenu(page: Page): Promise<{ weaponReady: boolean; deploymentAssetsReady: boolean }> {
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu());
  await page.waitForFunction(() => {
    const menu = document.querySelector<HTMLElement>('#menu');
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return document.documentElement.dataset.menuLifecycle === 'pre-match'
      && menu?.hidden !== true && !menu?.classList.contains('hidden')
      && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
  return waitForMenu(page);
}

async function auditPage(page: Page, contextId: string): Promise<PageAudit> {
  return page.evaluate((id) => {
    let clientRuntimeLog: unknown;
    try { clientRuntimeLog = JSON.parse(localStorage.getItem('atomic-acres:client-runtime-log:v1') ?? '[]'); }
    catch { clientRuntimeLog = ['invalid-client-runtime-log-json']; }
    return {
      contextId: id,
      clientRuntimeLog,
      runtime: window.__ATOMIC_ACRES_DEBUG__.snapshot().render?.runtime ?? null,
      presentation: window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry(),
    };
  }, contextId);
}

async function deployOnce(
  page: Page,
  classification: AdmissionClassification,
  profile: RenderProfile,
  arenaId: ArenaId,
  weaponReadyAtClick: boolean,
  deploymentAssetsReadyAtClick: boolean,
  latencyCeilingMs: number,
): Promise<AdmissionReceipt> {
  const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.admissionState());
  const startedAt = Date.now();
  await page.locator('#solo').click();
  let outcomeHandle;
  try {
    outcomeHandle = await page.waitForFunction(({ expectedArena, expectedGeneration }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const state = window.__ATOMIC_ACRES_DEBUG__?.admissionState();
      const failure = typeof snapshot?.bootstrap?.error === 'string'
        ? snapshot.bootstrap.error
        : document.querySelector<HTMLElement>('#runtime-error')?.hidden === false
          ? document.querySelector<HTMLElement>('#runtime-error')?.textContent ?? 'runtime error surface became visible'
          : null;
      if (failure) return { status: 'failed', failure } satisfies AdmissionWaitOutcome;
      if (state?.arenaId === expectedArena
        && state.matchAdmissionGeneration === expectedGeneration
        && state.gameStarted === true
        && state.matchPhase === 'active'
        && state.arenaTransitionPhase === 'idle'
        && state.presentedGameplayFrame >= 1) {
        return { status: 'active', failure: null } satisfies AdmissionWaitOutcome;
      }
      return false;
    }, {
      expectedArena: arenaId,
      expectedGeneration: before.matchAdmissionGeneration + 1,
    }, { timeout: latencyCeilingMs });
  } catch (error) {
    const failure = `Admission exceeded explicit ${latencyCeilingMs} ms ceiling: ${error instanceof Error ? error.message : String(error)}`;
    const evidence = await captureFailedAdmissionEvidence(
      page,
      `${profile}:${classification.scenario}:${classification.cycle ?? classification.sweep}:${arenaId}:latency`,
      failure,
    );
    throw new Error(`Browser admission failed: ${JSON.stringify(evidence, null, 2)}`);
  }
  const outcome = await outcomeHandle.jsonValue() as AdmissionWaitOutcome;
  if (outcome.status === 'failed') {
    const evidence = await captureFailedAdmissionEvidence(
      page,
      `${profile}:${classification.scenario}:${classification.cycle ?? classification.sweep}:${arenaId}:admission`,
      outcome.failure ?? 'unknown admission failure',
    );
    throw new Error(`Browser admission failed: ${JSON.stringify(evidence, null, 2)}`);
  }

  const active = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const admission = window.__ATOMIC_ACRES_DEBUG__.admissionState();
    return {
      bootstrap: state.bootstrap,
      menuHidden: document.querySelector('#menu')?.classList.contains('hidden') === true,
      transitionHidden: document.querySelector<HTMLElement>('#deployment-transition')?.hidden === true,
      runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false,
      frameCount: Number(state.frameCount ?? 0),
      profile: state.render?.profile ?? null,
      backend: state.render?.runtime?.actualBackend ?? null,
      webglVersion: state.render?.webglVersion ?? null,
      contextState: document.documentElement.dataset.webglContext ?? null,
      admission,
    };
  });
  expect(active.bootstrap.error).toBeNull();
  expect(active.bootstrap.stage).toBe('ready');
  expect(active.profile).toBe(profile);
  expect(active.backend).toBe(renderer);
  expect(active.contextState).toBe('ready');
  expect(active.menuHidden).toBe(true);
  expect(active.transitionHidden).toBe(true);
  expect(active.runtimeErrorVisible).toBe(false);
  if (renderer === 'webgl2') expect(active.webglVersion).toContain('WebGL 2');
  if (classification.scenario === 'fresh-context-pair') {
    expect(
      active.admission.matchAdmissionGeneration,
      `${classification.contextId} must contain exactly its cold then warm admissions`,
    ).toBe(classification.contextAdmissionIndex);
  }

  const menuToActiveMs = Date.now() - startedAt;
  expect(
    menuToActiveMs,
    `${classification.scenario}/${classification.cycle ?? classification.sweep} ${profile}/${arenaId} admission latency`,
  ).toBeLessThanOrEqual(latencyCeilingMs);
  await page.waitForFunction((frame) => Number(window.__ATOMIC_ACRES_DEBUG__?.snapshot().frameCount ?? 0) > frame + 1,
    active.frameCount, { timeout: 15_000 });
  return {
    ...classification,
    profile,
    arenaId,
    weaponReadyAtClick,
    deploymentAssetsReadyAtClick,
    menuToActiveMs,
    latencyCeilingMs,
    admissionGeneration: active.admission.matchAdmissionGeneration,
    presentedGameplayFrame: active.admission.presentedGameplayFrame,
    frameCount: active.frameCount,
    backend: active.backend,
    webglVersion: active.webglVersion,
    contextState: active.contextState,
  };
}

test.describe('Pass 66 cross-browser single-click admission matrix', () => {
  test.skip(!enabled, 'Run through qa:pass66:browser-admission:* so the expensive browser matrix is explicit.');

  test('admits isolated cold/warm pairs and survives cumulative context reuse', async ({ browser, browserName }, testInfo) => {
    test.setTimeout(60 * 60_000);
    expect(profiles.length, 'at least one valid render profile').toBeGreaterThan(0);
    expect(arenas.length, 'at least one valid arena').toBeGreaterThan(0);
    if (renderer === 'webgpu') expect(browserName).toBe('chromium');

    let phase = 'initializing';
    const faults: BrowserFault[] = [];
    const contextAudits: PageAudit[] = [];
    const freshContextPairReceipts: AdmissionReceipt[] = [];
    const cumulativeReuseReceipts: AdmissionReceipt[] = [];
    const latencyCeilingMs = admissionLatencyCeilingMs(testInfo.project.name);
    const contextOptions = isolatedContextOptions(testInfo);
    const artifactDirectory = resolve(process.cwd(), 'artifacts/pass66/browser-admission');
    const receiptPath = resolve(artifactDirectory, `${testInfo.project.name}-${renderer}-receipt.json`);
    mkdirSync(artifactDirectory, { recursive: true });
    rmSync(receiptPath, { force: true });
    expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
    expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()).toBe('');
    const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    expect(sourceSha).toBe(expectedSourceSha);

    // A real cold admission gets a new isolated BrowserContext for each
    // profile+arena pair. Its immediate warm admission reuses that exact page,
    // JS runtime, GPU runtime, and cache without another navigation.
    for (const profile of profiles) {
      for (const arenaId of arenas) {
        const contextId = `fresh-pair:${profile}:${arenaId}`;
        const pairContext = await browser.newContext(contextOptions);
        const page = await pairContext.newPage();
        installFaultCapture(page, () => phase, faults);
        try {
          phase = `${contextId}:cold-navigation`;
          await page.goto(admissionUrl(
            testInfo,
            profile,
            arenaId,
            `pass66-browser-admission-cold-${profile}-${arenaId}`,
          ), { waitUntil: 'domcontentloaded', timeout: 90_000 });
          let menu = await waitForMenu(page);
          await selectArena(page, arenaId);
          phase = `${contextId}:cold-admission`;
          freshContextPairReceipts.push(await deployOnce(
            page,
            {
              scenario: 'fresh-context-pair',
              cycle: 'cold',
              sweep: null,
              cacheDisposition: 'isolated-empty-context',
              contextId,
              contextAdmissionIndex: 1,
            },
            profile,
            arenaId,
            menu.weaponReady,
            menu.deploymentAssetsReady,
            latencyCeilingMs,
          ));

          phase = `${contextId}:warm-return-menu`;
          menu = await returnToReadyMenu(page);
          await expect(page.locator(`.map-card[data-arena-id="${arenaId}"]`)).toHaveAttribute('aria-pressed', 'true');
          phase = `${contextId}:warm-admission`;
          freshContextPairReceipts.push(await deployOnce(
            page,
            {
              scenario: 'fresh-context-pair',
              cycle: 'warm',
              sweep: null,
              cacheDisposition: 'same-context-reuse',
              contextId,
              contextAdmissionIndex: 2,
            },
            profile,
            arenaId,
            menu.weaponReady,
            menu.deploymentAssetsReady,
            latencyCeilingMs,
          ));

          phase = `${contextId}:audit`;
          const audit = await auditPage(page, contextId);
          expect(audit.clientRuntimeLog, `${contextId} client runtime log`).toEqual([]);
          contextAudits.push(audit);
        } finally {
          await pairContext.close();
        }
      }
    }

    // Preserve the original long-lived same-context forward/reverse sweeps.
    // This is intentionally not labelled cold/warm: it is cumulative reuse
    // stress across arena switches, profile navigations, and browser caches.
    const cumulativeContextId = 'cumulative-reuse';
    const cumulativeContext = await browser.newContext(contextOptions);
    const cumulativePage = await cumulativeContext.newPage();
    installFaultCapture(cumulativePage, () => phase, faults);
    let cumulativeAdmissionIndex = 0;
    let cumulativeAudit: PageAudit;
    try {
      for (const profile of profiles) {
        for (const sweep of ['forward', 'reverse'] as const) {
          const order = sweep === 'forward' ? arenas : [...arenas].reverse();
          phase = `${cumulativeContextId}:${profile}:${sweep}:navigation`;
          await cumulativePage.goto(admissionUrl(
            testInfo,
            profile,
            order[0],
            `pass66-browser-admission-cumulative-${profile}-${sweep}`,
          ), { waitUntil: 'domcontentloaded', timeout: 90_000 });
          let menu = await waitForMenu(cumulativePage);

          for (const arenaId of order) {
            phase = `${cumulativeContextId}:${profile}:${sweep}:${arenaId}:selection`;
            await selectArena(cumulativePage, arenaId);
            phase = `${cumulativeContextId}:${profile}:${sweep}:${arenaId}:admission`;
            cumulativeAdmissionIndex += 1;
            cumulativeReuseReceipts.push(await deployOnce(
              cumulativePage,
              {
                scenario: 'cumulative-reuse',
                cycle: null,
                sweep,
                cacheDisposition: 'cumulative-context-reuse',
                contextId: cumulativeContextId,
                contextAdmissionIndex: cumulativeAdmissionIndex,
              },
              profile,
              arenaId,
              menu.weaponReady,
              menu.deploymentAssetsReady,
              latencyCeilingMs,
            ));
            phase = `${cumulativeContextId}:${profile}:${sweep}:${arenaId}:return-menu`;
            menu = await returnToReadyMenu(cumulativePage);
          }
        }
      }

      phase = `${cumulativeContextId}:audit`;
      cumulativeAudit = await auditPage(cumulativePage, cumulativeContextId);
      expect(cumulativeAudit.clientRuntimeLog, 'cumulative context client runtime log').toEqual([]);
      contextAudits.push(cumulativeAudit);
    } finally {
      await cumulativeContext.close();
    }

    const expectedPairReceiptCount = profiles.length * arenas.length * 2;
    const expectedCumulativeReceiptCount = profiles.length * arenas.length * 2;
    expect(freshContextPairReceipts).toHaveLength(expectedPairReceiptCount);
    expect(cumulativeReuseReceipts).toHaveLength(expectedCumulativeReceiptCount);
    expect(contextAudits).toHaveLength(profiles.length * arenas.length + 1);
    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);

    writeFileSync(receiptPath, `${JSON.stringify({
      schemaVersion: 3,
      status: 'PASS',
      sourceSha,
      browserName,
      browserVersion: browser.version(),
      project: testInfo.project.name,
      renderer,
      profiles,
      arenas,
      singlePhysicalClickPerAdmission: true,
      totalAdmissions: freshContextPairReceipts.length + cumulativeReuseReceipts.length,
      latencyContract: {
        appliedCeilingMs: latencyCeilingMs,
        calibratedCeilingsMs: LATENCY_CEILINGS_MS,
      },
      freshContextPairs: {
        policy: 'Each profile+arena pair starts in a new isolated BrowserContext with service workers blocked; cold is the first admission, warm is the immediate second admission on the same page without navigation.',
        pairCount: profiles.length * arenas.length,
        receipts: freshContextPairReceipts,
      },
      cumulativeReuseStress: {
        policy: 'One long-lived BrowserContext executes forward and reverse arena sweeps for every profile; these admissions are cumulative reuse and are not described as cold or warm.',
        sweeps: ['forward', 'reverse'],
        receipts: cumulativeReuseReceipts,
      },
      runtime: cumulativeAudit.runtime,
      presentation: cumulativeAudit.presentation,
      contextAudits,
      faults,
    }, null, 2)}\n`, 'utf8');
    await testInfo.attach('browser-admission-receipt', { path: receiptPath, contentType: 'application/json' });
  });
});
