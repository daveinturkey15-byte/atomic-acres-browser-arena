import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS,
  assertFrameActionEvidenceEnvironment,
  captureFrameActionBaseline,
  deriveFrameActionBudget,
  frameActionBudgetFailures,
  frameActionReleaseAcceptanceEligible,
  MAXIMUM_ACTION_FRAME_BUDGETS,
  MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS,
  MAXIMUM_BASELINE_GAP_FRAME_BUDGETS,
  MAXIMUM_BASELINE_P95_FRAME_BUDGETS,
  MINIMUM_ACTION_FRAME_BUDGETS,
  minimumActionFrameSamples,
  REQUIRED_RELEASE_ACCEPTANCE_FRAME_ACTION_MODE,
  resolveFrameActionEvidenceMode,
  SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE,
  TARGET_FRAME_BUDGET_MS,
  type FrameActionBaseline,
  type FrameActionBudget,
  type FrameActionReleaseAcceptanceIdentity,
} from './frame-action-budget';

type GrenadeId = 'frag' | 'flash' | 'smoke' | 'semtex';
type GrenadeFirstActionReceipt = Readonly<{
  actionNonce: number;
  grenade: GrenadeId;
  cold: boolean;
  startedAt: number;
  handlerCompletedAt: number;
  handlerSyncMs: number;
  audio: {
    contextState: string;
    prepared: boolean;
    retainedSources: number;
    automationsBefore: number;
    automationsAfter: number;
  };
  startingSubmissionSequence: number;
  startingCompletedSequence: number;
  targetSubmissionSequence: number | null;
  firstSubmissionDelayMs: number | null;
  firstCompletionDelayMs: number | null;
  endingSubmissionSequence: number;
  endingCompletedSequence: number;
  maximumPendingForMs: number;
  maximumAnimationFrameGapMs: number;
  maximumFrameWorkMs: number;
  frameSamples: number;
  completionFailures: number;
  status: string;
  observationComplete: boolean;
}>;

const renderer = process.env.PASS71_GRENADE_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
const renderProfile = process.env.PASS71_GRENADE_RENDER_PROFILE
  ?? (renderer === 'webgpu' ? 'performance' : 'compat');
const evidenceMode = resolveFrameActionEvidenceMode(process.env.PASS71_GRENADE_EVIDENCE_MODE);
assertFrameActionEvidenceEnvironment(evidenceMode, process.env.CI === 'true');
const installedBrowserEvidence = process.env.QA_INSTALLED_EDGE === '1';
const grenades: readonly GrenadeId[] = ['frag', 'flash', 'smoke', 'semtex'];

function releaseAcceptanceIdentity(
  receipt: Awaited<ReturnType<typeof throwAndObserve>>,
): FrameActionReleaseAcceptanceIdentity {
  return {
    evidenceMode,
    // The generic supplemental shard has no exact-candidate provenance. Only a
    // separately owned exact-SHA receipt may populate these three identity fields.
    expectedSourceSha: undefined,
    checkoutSourceSha: undefined,
    servedSourceSha: undefined,
    renderer,
    browserChannel: installedBrowserEvidence ? 'msedge' : 'configured-chromium',
    browserUserAgent: receipt.userAgent,
    installedBrowser: installedBrowserEvidence,
    softwareAdapter: receipt.runtime.softwareAdapter,
    adapterLabel: receipt.runtime.adapterLabel,
  };
}

async function deployWithUnlockedAudio(page: Page, grenade: GrenadeId): Promise<void> {
  await page.goto(
    `/?release=latest&map=atomic-acres&renderer=${renderer}${requireWebGpu}`
      + `&render=${renderProfile}&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off`
      + `&seed=pass71-grenade-first-action-${grenade}-${renderer}`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 },
  );
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 90_000 });
  await page.locator('#player-name').fill('Pass 71 Grenadier');
  // A real trusted pointer gesture is part of the frozen acceptance: it proves
  // the audio-unlocked first-action path rather than the autoplay-locked path.
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.admissionState().matchPhase === 'active'
      && debug.admissionState().presentedGameplayFrame > 2;
  }, undefined, { timeout: 90_000 });
  await page.evaluate((selectedGrenade) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.setSelectedGrenade(selectedGrenade);
    debug.setGrenades(1);
  }, grenade);
}

async function throwAndObserve(page: Page, baselineLabel: string): Promise<{
  frameActionBaseline: FrameActionBaseline;
  frameActionBudget: FrameActionBudget;
  actionFrontier: Readonly<{
    invokedAt: number;
    handlerReturnedAt: number;
    nextAnimationFrameAt: number;
    handlerSyncMs: number;
    eventToNextAnimationFrameMs: number;
  }>;
  profile: GrenadeFirstActionReceipt;
  audio: any;
  presentation: any;
  runtime: any;
  userAgent: string;
}> {
  const frameActionBaseline = await captureFrameActionBaseline(page, baselineLabel);
  const frameActionBudget = deriveFrameActionBudget(frameActionBaseline, evidenceMode);
  const actionFrontier = await page.evaluate(() => new Promise<{
    invokedAt: number;
    handlerReturnedAt: number;
    nextAnimationFrameAt: number;
    handlerSyncMs: number;
    eventToNextAnimationFrameMs: number;
  }>((resolve) => {
    requestAnimationFrame(() => {
      const invokedAt = performance.now();
      window.__ATOMIC_ACRES_DEBUG__.throwGrenade();
      const handlerReturnedAt = performance.now();
      requestAnimationFrame((nextAnimationFrameAt) => resolve({
        invokedAt,
        handlerReturnedAt,
        nextAnimationFrameAt,
        handlerSyncMs: handlerReturnedAt - invokedAt,
        eventToNextAnimationFrameMs: nextAnimationFrameAt - invokedAt,
      }));
    });
  }));
  await page.waitForFunction(() => (
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).grenadeFirstAction?.observationComplete === true
  ), undefined, { timeout: 12_000 });
  return page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug.snapshot() as any;
    return {
      profile: snapshot.grenadeFirstAction as GrenadeFirstActionReceipt,
      audio: snapshot.audio,
      presentation: debug.samplePresentationTelemetry(),
      runtime: snapshot.render.runtime,
      userAgent: navigator.userAgent,
    };
  }).then((receipt) => ({ ...receipt, actionFrontier, frameActionBaseline, frameActionBudget }));
}

function assertActionReceipt(
  receipt: Awaited<ReturnType<typeof throwAndObserve>>,
  grenade: GrenadeId,
  cold: boolean,
): void {
  const { actionFrontier, frameActionBaseline, frameActionBudget, profile, audio, presentation, runtime, userAgent } = receipt;
  const evidence = JSON.stringify({
    renderer, actionFrontier, frameActionBaseline, frameActionBudget, profile, audio, presentation, runtime, userAgent,
  });
  expect(profile, evidence).toMatchObject({
    grenade,
    cold,
    audio: { contextState: 'running', prepared: true, retainedSources: 3 },
    observationComplete: true,
    completionFailures: 0,
  });
  expect(frameActionBudget).toMatchObject({
    evidenceMode,
    targetFrameBudgetMs: Number(TARGET_FRAME_BUDGET_MS.toFixed(3)),
    maximumSynchronousActionMs: Number((TARGET_FRAME_BUDGET_MS * 2).toFixed(3)),
  });
  expect(profile.startedAt, `${evidence}: internal profile starts no later than outer handler return`)
    .toBeLessThanOrEqual(actionFrontier.handlerReturnedAt);
  expect(profile.actionNonce, `${evidence}: accepted action binds its exact nonce`).toEqual(expect.any(Number));
  expect(profile.frameSamples, `${evidence}: exact 0-350ms observation window`)
    .toBeGreaterThanOrEqual(minimumActionFrameSamples(evidenceMode));
  expect(profile.firstSubmissionDelayMs, `${evidence}: first presentation after the action`)
    .not.toBeNull();
  expect(profile.firstCompletionDelayMs, `${evidence}: actual completion frontier observed`)
    .not.toBeNull();
  expect(frameActionBudgetFailures(frameActionBudget, {
    internalHandlerSyncMs: profile.handlerSyncMs,
    outerHandlerSyncMs: actionFrontier.handlerSyncMs,
    eventToNextAnimationFrameMs: actionFrontier.eventToNextAnimationFrameMs,
    maximumAnimationFrameGapMs: profile.maximumAnimationFrameGapMs,
    maximumFrameWorkMs: profile.maximumFrameWorkMs,
    maximumPendingForMs: profile.maximumPendingForMs,
    firstSubmissionDelayMs: profile.firstSubmissionDelayMs!,
    firstCompletionDelayMs: profile.firstCompletionDelayMs!,
  }), evidence).toEqual([]);
  expect(profile.status, evidence).toBe(renderer === 'webgpu' ? 'healthy' : 'synchronous');
  expect(profile.endingCompletedSequence, evidence).toBeGreaterThanOrEqual(profile.targetSubmissionSequence ?? 0);
  if (renderer === 'webgpu') {
    expect(profile.targetSubmissionSequence, evidence).toBeGreaterThan(profile.startingSubmissionSequence);
    expect(profile.endingCompletedSequence, evidence).toBeGreaterThanOrEqual(profile.targetSubmissionSequence!);
    expect(runtime, evidence).toMatchObject({
      requestedBackend: 'webgpu', actualBackend: 'webgpu', initialized: true,
      deviceLost: false, uncapturedErrors: 0, presentation: { status: 'healthy' },
    });
  }
  if (installedBrowserEvidence) {
    expect(userAgent, `${evidence}: installed Edge identity`).toMatch(/Edg\//u);
    expect(runtime.softwareAdapter, `${evidence}: native hardware adapter`).toBe(false);
    expect(runtime.adapterLabel, `${evidence}: concrete hardware adapter`).toEqual(expect.any(String));
    expect(runtime.adapterLabel, `${evidence}: reject a software adapter`)
      .not.toMatch(/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu);
  }
  if (evidenceMode === SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE) {
    expect(renderer, `${evidence}: software-CI semantics are WebGL2-only`).toBe('webgl2');
    expect(installedBrowserEvidence, `${evidence}: software-CI is not installed-browser evidence`).toBe(false);
    expect(runtime.softwareAdapter, `${evidence}: software-CI provenance`).toBe(true);
    expect(runtime.adapterLabel, `${evidence}: concrete software adapter`).toMatch(
      /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu,
    );
    expect(frameActionBudget.releaseAcceptanceModeEligible, evidence).toBe(false);
    expect(frameActionReleaseAcceptanceEligible(releaseAcceptanceIdentity(receipt)), evidence)
      .toBe(false);
  } else if (installedBrowserEvidence) {
    expect(frameActionBudget.releaseAcceptanceModeEligible, evidence).toBe(true);
    // Native timings alone are deliberately insufficient: the release-owned
    // receipt must also bind exact checkout and served source identities.
    expect(frameActionReleaseAcceptanceEligible(releaseAcceptanceIdentity(receipt)), evidence)
      .toBe(false);
  }
  expect(audio.grenadeEffectsPrewarm, evidence).toMatchObject({
    prepared: true,
    runs: 1,
    sources: 3,
    nodes: 6,
    retainedBroadbandLoops: 0,
  });
  expect(audio.runtime, evidence).toMatchObject({ retainedSources: 12 });
  expect(audio.runtime.retainedAudibleGains, `${evidence}: only the three intended grenade voices may be audible`)
    .toBeLessThanOrEqual(3);
  expect(audio.ambience.continuousSources, `${evidence}: no arena oscillator buzz`).toBe(0);
}

for (const grenade of grenades) {
  const evidenceClaim = evidenceMode === SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE
    ? 'preserve bounded software-CI action overhead'
    : 'complete without a first-use freeze';
  test(`${renderer}: ${grenade} cold and warm throws are pre-owned and ${evidenceClaim}`, async ({ page }, testInfo: TestInfo) => {
    test.setTimeout(120_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deployWithUnlockedAudio(page, grenade);
    const cold = await throwAndObserve(page, `${grenade}-cold-preaction-baseline`);
    assertActionReceipt(cold, grenade, true);

    await page.evaluate((selectedGrenade) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.setSelectedGrenade(selectedGrenade);
      debug.setGrenades(1);
    }, grenade);
    const warm = await throwAndObserve(page, `${grenade}-warm-preaction-baseline`);
    assertActionReceipt(warm, grenade, false);

    expect(warm.audio.grenadeEffectsPrewarm.sources, 'warm action retains the exact pre-owned graph')
      .toBe(cold.audio.grenadeEffectsPrewarm.sources);
    expect(warm.audio.runtime.retainedSources, 'warm action does not allocate another retained source')
      .toBe(cold.audio.runtime.retainedSources);
    await expect.poll(async () => page.evaluate(() => {
      const audio = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).audio;
      return {
        retainedAudibleGains: audio.runtime.retainedAudibleGains,
        retainedSources: audio.runtime.retainedSources,
        continuousAmbience: audio.ambience.continuousSources,
      };
    }), { message: `${grenade}: every bounded cue returns to retained zero-gain baseline`, timeout: 5_000 }).toEqual({
      retainedAudibleGains: 0,
      retainedSources: 12,
      continuousAmbience: 0,
    });
    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    await testInfo.attach(`pass71-${grenade}-first-action-${renderer}`, {
      body: Buffer.from(JSON.stringify({
        grenade,
        renderer,
        evidenceMode,
        claim: evidenceMode === SOFTWARE_CI_SEMANTIC_FRAME_ACTION_MODE
          ? 'software-CI action-overhead semantics only; not hardware no-freeze evidence'
          : 'native no-freeze evidence',
        releaseAcceptance: {
          requiredEvidenceMode: REQUIRED_RELEASE_ACCEPTANCE_FRAME_ACTION_MODE,
          exactExpectedCheckoutAndServedSourceShaRequired: true,
          installedBrowserRequired: true,
          installedEdgeRequired: true,
          webGpuRequired: true,
          hardwareAdapterRequired: true,
          eligible: frameActionReleaseAcceptanceEligible(
            releaseAcceptanceIdentity(cold),
          ) && frameActionReleaseAcceptanceEligible(
            releaseAcceptanceIdentity(warm),
          ),
        },
        actionFrameSamples: {
          required: minimumActionFrameSamples(evidenceMode),
          cold: cold.profile.frameSamples,
          warm: warm.profile.frameSamples,
        },
        thresholds: {
          targetFrameBudgetMs: Number(TARGET_FRAME_BUDGET_MS.toFixed(3)),
          maximumBaselineP95FrameBudgets: MAXIMUM_BASELINE_P95_FRAME_BUDGETS,
          maximumBaselineGapFrameBudgets: MAXIMUM_BASELINE_GAP_FRAME_BUDGETS,
          maximumBaselineCompletionFrameBudgets: MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS,
          minimumActionFrameBudgets: MINIMUM_ACTION_FRAME_BUDGETS,
          maximumActionFrameBudgets: MAXIMUM_ACTION_FRAME_BUDGETS,
          actionRelativeAllowanceFrameBudgets: ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS,
        },
        cold,
        warm,
        faults,
      }, null, 2)),
      contentType: 'application/json',
    });
  });
}
