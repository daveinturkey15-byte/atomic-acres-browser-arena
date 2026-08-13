import { expect, test, type Page } from '@playwright/test';
import {
  captureFrameHitchRendererEvidence,
  expectFrameHitchRendererEvidence,
  frameHitchRoute,
  writeOfficialFrameHitchReceipt,
} from './pass69-3-frame-hitch-evidence';
import {
  ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS,
  captureFrameActionBaseline,
  deriveFrameActionBudget,
  MAXIMUM_ACTION_FRAME_BUDGETS,
  MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS,
  MAXIMUM_BASELINE_GAP_FRAME_BUDGETS,
  MAXIMUM_BASELINE_P95_FRAME_BUDGETS,
  MINIMUM_ACTION_FRAME_BUDGETS,
  TARGET_FRAME_BUDGET_MS,
  type FrameActionBudget,
} from './frame-action-budget';

type ProbeAction = 'noop' | 'fire' | 'equip-m14' | 'ads-on' | 'ads-off';

type FrameProbe = Readonly<{
  label: string;
  action: ProbeAction;
  synchronousMs: number;
  eventToPresentedFrameMs: number;
  eventToCompletionMs: number;
  presentedFrameDelta: number;
  presentationStatus: string;
  startingSubmissionSequence: number;
  startingCompletedSequence: number;
  targetSubmissionSequence: number;
  endingSubmissionSequence: number;
  endingCompletedSequence: number;
  maximumPendingForMs: number;
  completionFailures: number;
}>;

type M14TransitionReadiness = Readonly<{
  requestedWeapon: string;
  ready: boolean;
  modelLoaded: boolean;
  gpuReady: boolean;
  resident: boolean;
  catalogPrewarming: boolean;
  importedWeapon: string | null;
  mountedIsRequested: boolean;
  assetCacheLoading: number;
  dmrThermalActive: boolean;
  dmrThermalContacts: number;
  adsProgress: number;
  cameraFov: number;
  expectedFov: number;
}>;

type M14TransitionProbe = FrameProbe & Readonly<{
  readyMs: number;
  maximumAnimationFrameGapMs: number;
  readiness: M14TransitionReadiness;
}>;

const MAX_M14_TRANSITION_READY_MS = 5_000;

async function deploy(page: Page): Promise<void> {
  await page.goto(frameHitchRoute('atomic-acres', 'pass69-3-glass-m14-hitch-gate'));
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.admissionState().matchPhase === 'active'
      && debug.admissionState().presentedGameplayFrame > 2;
  }, undefined, { timeout: 30_000 });
}

async function eventToNextPresentedFrame(page: Page, label: string, action: ProbeAction): Promise<FrameProbe> {
  return page.evaluate(({ selectedLabel, selectedAction }) => new Promise<FrameProbe>((resolve, reject) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (!debug) return reject(new Error('Atomic Acres debug surface is unavailable'));
    requestAnimationFrame(() => {
      const startedAt = performance.now();
      const presentedBefore = debug.admissionState().presentedGameplayFrame;
      const presentationBefore = debug.samplePresentationTelemetry() as any;
      const synchronous = presentationBefore.status === 'synchronous';
      if (selectedAction === 'fire') debug.fireOnce();
      else if (selectedAction === 'equip-m14') debug.equipWeapon('m14-ebr');
      else if (selectedAction === 'ads-on') debug.setAds(true);
      else if (selectedAction === 'ads-off') debug.setAds(false);
      const synchronousMs = performance.now() - startedAt;
      const deadline = startedAt + 2_000;
      let firstPresentedAtMs: number | null = null;
      let firstPresentedFrameDelta = 0;
      let targetSubmissionSequence: number | null = synchronous ? 0 : null;
      let firstCompletionAtMs: number | null = null;
      let maximumPendingForMs = presentationBefore.pendingForMs as number;
      let presentationAfter = presentationBefore;
      const inspect = () => {
        const now = performance.now();
        const presentedAfter = debug.admissionState().presentedGameplayFrame;
        presentationAfter = debug.samplePresentationTelemetry() as any;
        maximumPendingForMs = Math.max(maximumPendingForMs, presentationAfter.pendingForMs as number);
        if (firstPresentedAtMs === null && presentedAfter > presentedBefore) {
          firstPresentedAtMs = now - startedAt;
          firstPresentedFrameDelta = presentedAfter - presentedBefore;
          if (synchronous) firstCompletionAtMs = firstPresentedAtMs;
        }
        if (!synchronous && targetSubmissionSequence === null
          && presentationAfter.submissionSequence > presentationBefore.submissionSequence) {
          targetSubmissionSequence = presentationAfter.submissionSequence;
        }
        if (!synchronous && firstCompletionAtMs === null && targetSubmissionSequence !== null
          && presentationAfter.completedSequence >= targetSubmissionSequence) {
          firstCompletionAtMs = now - startedAt;
        }
        if (firstPresentedAtMs !== null && firstCompletionAtMs !== null
          && targetSubmissionSequence !== null) {
          resolve({
            label: selectedLabel,
            action: selectedAction,
            synchronousMs: Number(synchronousMs.toFixed(3)),
            eventToPresentedFrameMs: Number(firstPresentedAtMs.toFixed(3)),
            eventToCompletionMs: Number(firstCompletionAtMs.toFixed(3)),
            presentedFrameDelta: firstPresentedFrameDelta,
            presentationStatus: presentationAfter.status,
            startingSubmissionSequence: presentationBefore.submissionSequence,
            startingCompletedSequence: presentationBefore.completedSequence,
            targetSubmissionSequence,
            endingSubmissionSequence: presentationAfter.submissionSequence,
            endingCompletedSequence: presentationAfter.completedSequence,
            maximumPendingForMs: Number(maximumPendingForMs.toFixed(3)),
            completionFailures: presentationAfter.completionFailures,
          });
          return;
        }
        if (now >= deadline) {
          reject(new Error(`${selectedAction} did not reach a completed gameplay frame within 2000ms`));
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });
  }), { selectedLabel: label, selectedAction: action });
}

async function m14TransitionToReady(
  page: Page,
  label: string,
  action: 'equip-m14' | 'ads-on',
  requiredState: 'equipped' | 'thermal-active',
): Promise<M14TransitionProbe> {
  return page.evaluate(({ selectedLabel, selectedAction, selectedRequiredState, maximumReadyMs }) => (
    new Promise<M14TransitionProbe>((resolve, reject) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      if (!debug) return reject(new Error('Atomic Acres debug surface is unavailable'));
      requestAnimationFrame(() => {
        const startedAt = performance.now();
        const presentedBefore = debug.admissionState().presentedGameplayFrame;
        const presentationBefore = debug.samplePresentationTelemetry() as any;
        const synchronous = presentationBefore.status === 'synchronous';
        if (selectedAction === 'equip-m14') debug.equipWeapon('m14-ebr');
        else debug.setAds(true);
        const synchronousMs = performance.now() - startedAt;
        const deadline = startedAt + maximumReadyMs;
        let previousAnimationFrameAt = startedAt;
        let maximumAnimationFrameGapMs = 0;
        let firstPresentedAtMs: number | null = null;
        let firstPresentedFrameDelta = 0;
        let targetSubmissionSequence: number | null = synchronous ? 0 : null;
        let firstCompletionAtMs: number | null = null;
        let maximumPendingForMs = presentationBefore.pendingForMs as number;
        let presentationAfter = presentationBefore;
        let lastReadiness: M14TransitionReadiness | null = null;
        const inspect = () => {
          const now = performance.now();
          maximumAnimationFrameGapMs = Math.max(maximumAnimationFrameGapMs, now - previousAnimationFrameAt);
          previousAnimationFrameAt = now;
          const presentedAfter = debug.admissionState().presentedGameplayFrame;
          if (firstPresentedAtMs === null && presentedAfter > presentedBefore) {
            firstPresentedAtMs = now - startedAt;
            firstPresentedFrameDelta = presentedAfter - presentedBefore;
            if (synchronous) firstCompletionAtMs = firstPresentedAtMs;
          }
          presentationAfter = debug.samplePresentationTelemetry() as any;
          maximumPendingForMs = Math.max(maximumPendingForMs, presentationAfter.pendingForMs as number);
          if (!synchronous && targetSubmissionSequence === null
            && presentationAfter.submissionSequence > presentationBefore.submissionSequence) {
            targetSubmissionSequence = presentationAfter.submissionSequence;
          }
          if (!synchronous && firstCompletionAtMs === null && targetSubmissionSequence !== null
            && presentationAfter.completedSequence >= targetSubmissionSequence) {
            firstCompletionAtMs = now - startedAt;
          }
          const weapon = debug.sampleActiveWeaponReadiness();
          const importedM14Ready = weapon.requestedWeapon === 'm14-ebr'
            && weapon.ready
            && weapon.modelLoaded
            && weapon.gpuReady
            && weapon.resident
            && !weapon.catalogPrewarming
            && weapon.importedWeapon === 'm14-ebr'
            && weapon.mountedIsRequested;
          const assetCacheLoading = importedM14Ready ? debug.sampleWeaponAssetCache().loading : -1;
          const thermal = debug.sampleDmrThermalReadiness();
          lastReadiness = {
            ...weapon,
            assetCacheLoading,
            dmrThermalActive: thermal.active,
            dmrThermalContacts: thermal.contacts,
            adsProgress: thermal.adsProgress,
            cameraFov: thermal.cameraFov,
            expectedFov: thermal.expectedFov,
          };
          const requiredPresentationReady = selectedRequiredState === 'equipped' || thermal.active;
          if (firstPresentedAtMs !== null
            && firstCompletionAtMs !== null
            && targetSubmissionSequence !== null
            && importedM14Ready
            && assetCacheLoading === 0
            && requiredPresentationReady) {
            resolve({
              label: selectedLabel,
              action: selectedAction,
              synchronousMs: Number(synchronousMs.toFixed(3)),
              eventToPresentedFrameMs: Number(firstPresentedAtMs.toFixed(3)),
              eventToCompletionMs: Number(firstCompletionAtMs.toFixed(3)),
              presentedFrameDelta: firstPresentedFrameDelta,
              presentationStatus: presentationAfter.status,
              startingSubmissionSequence: presentationBefore.submissionSequence,
              startingCompletedSequence: presentationBefore.completedSequence,
              targetSubmissionSequence,
              endingSubmissionSequence: presentationAfter.submissionSequence,
              endingCompletedSequence: presentationAfter.completedSequence,
              maximumPendingForMs: Number(maximumPendingForMs.toFixed(3)),
              completionFailures: presentationAfter.completionFailures,
              readyMs: Number((now - startedAt).toFixed(3)),
              maximumAnimationFrameGapMs: Number(maximumAnimationFrameGapMs.toFixed(3)),
              readiness: lastReadiness,
            });
            return;
          }
          if (now >= deadline) {
            reject(new Error(
              `${selectedAction} did not reach ${selectedRequiredState} within ${maximumReadyMs}ms: ${JSON.stringify(lastReadiness)}`,
            ));
            return;
          }
          requestAnimationFrame(inspect);
        };
        requestAnimationFrame(inspect);
      });
    })
  ), {
    selectedLabel: label,
    selectedAction: action,
    selectedRequiredState: requiredState,
    maximumReadyMs: MAX_M14_TRANSITION_READY_MS,
  });
}

function expectBoundedProbe(probe: FrameProbe, budget: FrameActionBudget): void {
  const evidence = `${probe.label}/${probe.action} ${JSON.stringify(probe)}`;
  expect(probe.presentedFrameDelta, `${evidence}: presentation must advance`).toBeGreaterThan(0);
  expect(probe.synchronousMs, `${evidence}: synchronous action budget`)
    .toBeLessThan(budget.maximumSynchronousActionMs);
  expect(probe.eventToPresentedFrameMs, `${evidence}: baseline-relative event-to-presented-frame budget`)
    .toBeLessThan(budget.maximumActionMs);
  expect(probe.eventToCompletionMs, `${evidence}: actual completion-frontier budget`)
    .toBeLessThan(budget.maximumActionMs);
  expect(probe.maximumPendingForMs, `${evidence}: no hidden completion backlog`)
    .toBeLessThan(budget.maximumActionMs);
  expect(probe.completionFailures, evidence).toBe(0);
  expect(probe.presentationStatus, evidence).toMatch(/^(?:healthy|synchronous)$/u);
  expect(probe.endingSubmissionSequence, evidence).toBeGreaterThanOrEqual(probe.startingSubmissionSequence);
  expect(probe.endingCompletedSequence, evidence).toBeGreaterThanOrEqual(probe.startingCompletedSequence);
  expect(probe.endingCompletedSequence, evidence).toBeGreaterThanOrEqual(probe.targetSubmissionSequence);
}

function expectM14TransitionReady(
  probe: M14TransitionProbe,
  thermalActive: boolean,
  budget: FrameActionBudget,
): void {
  const evidence = `${probe.label}/${probe.action} ${JSON.stringify(probe)}`;
  expectBoundedProbe(probe, budget);
  expect(probe.readyMs, `${evidence}: bounded readiness deadline`).toBeLessThan(MAX_M14_TRANSITION_READY_MS);
  expect(probe.maximumAnimationFrameGapMs, `${evidence}: no hidden transition freeze`)
    .toBeLessThan(budget.maximumActionMs);
  expect(probe.readiness, `${evidence}: exact retained imported M14`).toMatchObject({
    requestedWeapon: 'm14-ebr',
    ready: true,
    modelLoaded: true,
    gpuReady: true,
    resident: true,
    catalogPrewarming: false,
    importedWeapon: 'm14-ebr',
    mountedIsRequested: true,
    assetCacheLoading: 0,
    dmrThermalActive: thermalActive,
  });
  if (!thermalActive) return;
  expect(probe.readiness.adsProgress, `${evidence}: settled physical ADS pose`).toBeGreaterThanOrEqual(0.9);
  expect(probe.readiness.dmrThermalContacts, `${evidence}: real thermal contact presentation`)
    .toBeGreaterThan(0);
  expect(
    Math.abs(probe.readiness.cameraFov - probe.readiness.expectedFov),
    `${evidence}: exact 2.5x DMR projection`,
  ).toBeLessThan(0.35);
}

test('cold carbine control, isolated first M14 EBR use and glass breach reach the next presented frame without a freeze', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await deploy(page);
  const runtimeBefore = await captureFrameHitchRendererEvidence(page, testInfo);
  expectFrameHitchRendererEvidence(runtimeBefore, 'atomic-acres', 'glass/M14 initial runtime');
  const retainedGlassBefore = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      pool: snapshot.windowGlassDebrisPool,
      panes: snapshot.breakableWindows.map((window: any) => window.retainedDebrisPrewarmed),
    };
  });
  expect(retainedGlassBefore).toMatchObject({
    pool: {
      contract: 'retained-exact-instanced-render-object-v1',
      retained: 6,
      currentArenaRetained: 6,
      active: 0,
      activePhysics: 0,
      lifecycle: {
        poseGraceMs: 180,
        noProgressMs: 450,
        maxPhysicsMs: 1_800,
        maxLifetimeMs: 4_500,
      },
    },
    panes: [true, true, true, true, true, true],
  });

  const frameActionBaseline = await captureFrameActionBaseline(page, 'glass-m14-preaction-baseline');
  const frameActionBudget = deriveFrameActionBudget(frameActionBaseline);
  const baseline = await eventToNextPresentedFrame(page, 'baseline-noop', 'noop');

  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.equipWeapon('carbine');
    const snapshot = debug.snapshot() as any;
    const [x, y, z] = snapshot.player.position;
    debug.teleportPlayer(x, y, z, snapshot.player.yaw, 1.25);
  });
  const coldCarbine = await eventToNextPresentedFrame(page, 'cold-carbine-empty-sky', 'fire');

  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.placeBotAhead(6);
    debug.aimAtBot('body');
  });
  const m14Equip = await m14TransitionToReady(page, 'm14-cold-equip', 'equip-m14', 'equipped');
  const m14Ads = await m14TransitionToReady(page, 'm14-cold-ads-on', 'ads-on', 'thermal-active');
  const m14Shot = await eventToNextPresentedFrame(page, 'm14-cold-fire', 'fire');
  const m14AdsRelease = await eventToNextPresentedFrame(page, 'm14-ads-off', 'ads-off');
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.sampleDmrThermalReadiness().active
  ))).toBe(false);
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.equipWeapon('carbine');
  });
  await expect.poll(async () => page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const weapon = debug.sampleActiveWeaponReadiness();
    return weapon.requestedWeapon === 'carbine'
      && weapon.ready
      && weapon.importedWeapon === 'carbine'
      && weapon.mountedIsRequested
      && debug.sampleWeaponAssetCache().loading === 0;
  })).toBe(true);

  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.stageWindow(0, 4);
  });
  const coldGlass = await eventToNextPresentedFrame(page, 'cold-glass-breach', 'fire');
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).breakableWindows[0].broken)).toBe(true);

  await page.waitForTimeout(150);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stageWindow(1, 4));
  const warmGlass = await eventToNextPresentedFrame(page, 'warm-glass-breach', 'fire');
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).breakableWindows[1].broken)).toBe(true);

  const glassAfter = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      coldWindowBroken: snapshot.breakableWindows[0].broken,
      warmWindowBroken: snapshot.breakableWindows[1].broken,
      pool: snapshot.windowGlassDebrisPool,
    };
  });
  expect(glassAfter).toMatchObject({ coldWindowBroken: true, warmWindowBroken: true });
  const debrisSamples: any[] = [];
  for (const elapsedMs of [250, 750, 1_500, 2_500, 4_750]) {
    await page.waitForTimeout(elapsedMs - (debrisSamples.at(-1)?.elapsedMs ?? 0));
    debrisSamples.push(await page.evaluate((sampleElapsedMs) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      return {
        elapsedMs: sampleElapsedMs,
        pool: snapshot.windowGlassDebrisPool,
        debris: snapshot.persistentWindowDebris,
        panes: snapshot.breakableWindows.slice(0, 2).map((pane: any) => ({
          id: pane.id,
          broken: pane.broken,
          apertureOpen: pane.authority?.apertureOpen,
        })),
      };
    }, elapsedMs));
  }
  for (const sample of debrisSamples) {
    for (const debris of sample.debris) {
      expect(debris.position.every(Number.isFinite), `${sample.elapsedMs}ms finite shard root`).toBe(true);
      expect(
        !debris.fallbackSettled || debris.support.restY !== null && debris.position[1] <= debris.support.restY + 0.04,
        `${sample.elapsedMs}ms debris cannot report mid-air settled: ${JSON.stringify(debris)}`,
      ).toBe(true);
      expect(
        !debris.physicsActive || debris.noProgressMs < sample.pool.lifecycle.noProgressMs + 80,
        `${sample.elapsedMs}ms active body must make progress: ${JSON.stringify(debris)}`,
      ).toBe(true);
    }
  }
  expect(debrisSamples.at(-1)).toMatchObject({
    pool: { retained: 6, currentArenaRetained: 6, active: 0, activePhysics: 0 },
    debris: [],
    panes: [
      { broken: true, apertureOpen: true },
      { broken: true, apertureOpen: true },
    ],
  });
  const runtimeAfter = await captureFrameHitchRendererEvidence(page, testInfo);
  expectFrameHitchRendererEvidence(runtimeAfter, 'atomic-acres', 'glass/M14 final runtime');

  const probes = [baseline, coldCarbine, m14Equip, m14Ads, m14Shot, m14AdsRelease, coldGlass, warmGlass];
  await testInfo.attach('event-to-presented-frame-receipt', {
    body: Buffer.from(JSON.stringify({
      renderer: runtimeAfter.runtime.actualBackend,
      targetFrameBudgetMs: Number(TARGET_FRAME_BUDGET_MS.toFixed(3)),
      maximumBaselineP95FrameBudgets: MAXIMUM_BASELINE_P95_FRAME_BUDGETS,
      maximumBaselineGapFrameBudgets: MAXIMUM_BASELINE_GAP_FRAME_BUDGETS,
      maximumBaselineCompletionFrameBudgets: MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS,
      minimumActionFrameBudgets: MINIMUM_ACTION_FRAME_BUDGETS,
      maximumActionFrameBudgets: MAXIMUM_ACTION_FRAME_BUDGETS,
      actionRelativeAllowanceFrameBudgets: ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS,
      maximumActionMs: frameActionBudget.maximumActionMs,
      maximumSynchronousActionMs: frameActionBudget.maximumSynchronousActionMs,
      maximumM14TransitionReadyMs: MAX_M14_TRANSITION_READY_MS,
      runtimeBefore,
      runtimeAfter,
      frameActionBaseline,
      frameActionBudget,
      retainedGlassBefore,
      glassAfter,
      debrisSamples,
      probes,
    }, null, 2)),
    contentType: 'application/json',
  });
  for (const probe of probes) expectBoundedProbe(probe, frameActionBudget);
  expectM14TransitionReady(m14Equip, false, frameActionBudget);
  expectM14TransitionReady(m14Ads, true, frameActionBudget);
  expect(browserErrors).toEqual([]);
  writeOfficialFrameHitchReceipt(
    'glass-m14',
    runtimeBefore,
    runtimeAfter,
    {
      targetFrameBudgetMs: Number(TARGET_FRAME_BUDGET_MS.toFixed(3)),
      maximumBaselineP95FrameBudgets: MAXIMUM_BASELINE_P95_FRAME_BUDGETS,
      maximumBaselineGapFrameBudgets: MAXIMUM_BASELINE_GAP_FRAME_BUDGETS,
      maximumBaselineCompletionFrameBudgets: MAXIMUM_BASELINE_COMPLETION_FRAME_BUDGETS,
      minimumActionFrameBudgets: MINIMUM_ACTION_FRAME_BUDGETS,
      maximumActionFrameBudgets: MAXIMUM_ACTION_FRAME_BUDGETS,
      actionRelativeAllowanceFrameBudgets: ACTION_RELATIVE_ALLOWANCE_FRAME_BUDGETS,
      maximumActionMs: frameActionBudget.maximumActionMs,
      maximumSynchronousActionMs: frameActionBudget.maximumSynchronousActionMs,
      maximumM14TransitionReadyMs: MAX_M14_TRANSITION_READY_MS,
    },
    { frameActionBaseline, frameActionBudget, retainedGlassBefore, glassAfter, debrisSamples, probes },
    browserErrors,
  );
});
