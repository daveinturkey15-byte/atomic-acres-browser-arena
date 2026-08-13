import { expect, test, type Page, type TestInfo } from '@playwright/test';

type GrenadeId = 'frag' | 'flash' | 'smoke' | 'semtex';
type GrenadeFirstActionReceipt = Readonly<{
  actionNonce: number;
  grenade: GrenadeId;
  cold: boolean;
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
const grenades: readonly GrenadeId[] = ['frag', 'flash', 'smoke', 'semtex'];
const MAX_SYNCHRONOUS_ACTION_MS = 50;
const MAX_FIRST_PRESENTATION_MS = process.env.QA_INSTALLED_EDGE === '1' ? 120 : 220;
const MAX_OBSERVATION_FRAME_GAP_MS = process.env.QA_INSTALLED_EDGE === '1' ? 180 : 220;
const MAX_COMPLETION_MS = 350;

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

async function throwAndObserve(page: Page): Promise<{
  profile: GrenadeFirstActionReceipt;
  audio: any;
  presentation: any;
  runtime: any;
  userAgent: string;
}> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      window.__ATOMIC_ACRES_DEBUG__.throwGrenade();
      resolve();
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
  });
}

function assertActionReceipt(
  receipt: Awaited<ReturnType<typeof throwAndObserve>>,
  grenade: GrenadeId,
  cold: boolean,
): void {
  const { profile, audio, presentation, runtime, userAgent } = receipt;
  const evidence = JSON.stringify({ renderer, profile, audio, presentation, runtime, userAgent });
  expect(profile, evidence).toMatchObject({
    grenade,
    cold,
    audio: { contextState: 'running', prepared: true, retainedSources: 3 },
    observationComplete: true,
    completionFailures: 0,
  });
  expect(profile.handlerSyncMs, `${evidence}: synchronous throw handler`).toBeLessThan(MAX_SYNCHRONOUS_ACTION_MS);
  expect(profile.maximumAnimationFrameGapMs, `${evidence}: no visible first-action freeze`)
    .toBeLessThan(MAX_OBSERVATION_FRAME_GAP_MS);
  expect(profile.maximumFrameWorkMs, `${evidence}: no first-action long frame`)
    .toBeLessThan(MAX_FIRST_PRESENTATION_MS);
  expect(profile.frameSamples, `${evidence}: exact 0-350ms observation window`).toBeGreaterThan(2);
  expect(profile.firstSubmissionDelayMs, `${evidence}: first presentation after the action`)
    .not.toBeNull();
  expect(profile.firstSubmissionDelayMs!, `${evidence}: action reaches presentation promptly`)
    .toBeLessThan(MAX_FIRST_PRESENTATION_MS);
  expect(profile.firstCompletionDelayMs, `${evidence}: actual completion frontier observed`)
    .not.toBeNull();
  expect(profile.firstCompletionDelayMs!, `${evidence}: completion inside observed action window`)
    .toBeLessThanOrEqual(MAX_COMPLETION_MS);
  expect(profile.status, evidence).toBe(renderer === 'webgpu' ? 'healthy' : 'synchronous');
  expect(profile.endingCompletedSequence, evidence).toBeGreaterThanOrEqual(profile.targetSubmissionSequence ?? 0);
  if (renderer === 'webgpu') {
    expect(profile.targetSubmissionSequence, evidence).toBeGreaterThan(profile.startingSubmissionSequence);
    expect(profile.endingCompletedSequence, evidence).toBeGreaterThanOrEqual(profile.targetSubmissionSequence!);
    expect(runtime, evidence).toMatchObject({
      requestedBackend: 'webgpu', actualBackend: 'webgpu', initialized: true,
      deviceLost: false, uncapturedErrors: 0, presentation: { status: 'healthy' },
    });
    if (process.env.QA_INSTALLED_EDGE === '1') {
      expect(userAgent, `${evidence}: installed Edge identity`).toMatch(/Edg\//u);
      expect(runtime.softwareAdapter, `${evidence}: native hardware adapter`).toBe(false);
      expect(runtime.adapterLabel, `${evidence}: concrete hardware adapter`).toEqual(expect.any(String));
      expect(runtime.adapterLabel, `${evidence}: reject a software adapter`)
        .not.toMatch(/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu);
    }
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
  test(`${renderer}: ${grenade} cold and warm throws are pre-owned and complete without a first-use freeze`, async ({ page }, testInfo: TestInfo) => {
    test.setTimeout(120_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deployWithUnlockedAudio(page, grenade);
    const cold = await throwAndObserve(page);
    assertActionReceipt(cold, grenade, true);

    await page.evaluate((selectedGrenade) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.setSelectedGrenade(selectedGrenade);
      debug.setGrenades(1);
    }, grenade);
    const warm = await throwAndObserve(page);
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
      body: Buffer.from(JSON.stringify({ grenade, renderer, cold, warm, faults }, null, 2)),
      contentType: 'application/json',
    });
  });
}
