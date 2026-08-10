import { expect, test, type Page } from '@playwright/test';
import { GUN_RANGE_TEST_BAY_CONTRACT } from '../../src/gun-range-test-bay';
import {
  captureFrameHitchRendererEvidence,
  expectFrameHitchRendererEvidence,
  frameHitchRoute,
  writeOfficialFrameHitchReceipt,
} from './pass69-3-frame-hitch-evidence';

type SpecialWeapon = 'flamethrower' | 'flare-gun';

type PresentedFrameWindow = Readonly<{
  label: string;
  durationMs: number;
  frameDelta: number;
  gapsMs: readonly number[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maximumMs: number;
}>;

type ColdFireProbe = Readonly<{
  label: string;
  synchronousMs: number;
  eventToPresentedFrameMs: number;
  presentedFrameDelta: number;
}>;

type FlamethrowerProbe = Readonly<{
  label: 'flamethrower-held-fire';
  durationMs: number;
  synchronousMs: number | null;
  triggerToPresentedFrameMs: number | null;
  firstEmissionObservedAfterTriggerMs: number | null;
  firstEmissionContainingFrameGapMs: number | null;
  frameWindow: PresentedFrameWindow;
  emissions: number;
  particlesSpawned: number;
  particlesPerEmission: number;
  softwarePresentationBudget: boolean;
  maximumActive: number;
  groundFireActive: number;
  groundFireMerges: number;
  poolExhaustions: number;
}>;

type FlareEffectTelemetry = Readonly<{
  spawnCount: number;
  active: number;
  flying: number;
  burning: number;
  impactCount: number;
  burnPulseCount: number;
  poolExhaustions: number;
}>;

type FlareLifecycleProbe = Readonly<{
  coldFire: ColdFireProbe;
  frameWindow: PresentedFrameWindow;
  before: FlareEffectTelemetry;
  after: FlareEffectTelemetry;
}>;

type FlareImpactStage = Readonly<{
  targetId: string;
  playerPosition: readonly [number, number, number];
  targetPosition: readonly [number, number, number];
  yaw: number;
  pitch: number;
  distanceM: number;
}>;

const MAX_EVENT_TO_PRESENTED_FRAME_MS = 120;
const MAX_SYNCHRONOUS_ACTION_MS = 50;
const MAX_SUSTAINED_PRESENTED_FRAME_GAP_MS = 120;
const MAX_SUSTAINED_P95_MS = 50;

async function deployGunRange(page: Page, seed: string): Promise<void> {
  await page.goto(frameHitchRoute('gun-range', seed, { signal: false }));
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.admissionState().matchPhase === 'active'
      && debug.admissionState().presentedGameplayFrame > 2;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
}

async function acquireTrainingWeapon(page: Page, weapon: SpecialWeapon): Promise<void> {
  const station = GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.find(({ id }) => id === weapon);
  if (!station) throw new Error(`Missing Gun Range training station for ${weapon}`);
  await page.evaluate(({ x, z }) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z);
  }, station.position);
  await expect.poll(async () => page.evaluate((expectedWeapon) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.candidates
      .some((candidate: { kind: string; targetId: string }) => candidate.kind === 'test-bay-weapon'
        && candidate.targetId === `test-bay-weapon:${expectedWeapon}`)
  ), weapon)).toBe(true);
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactTestBayStation())).toBe(true);
  await expect.poll(async () => page.evaluate((expectedWeapon) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      weapon: snapshot.player.weapon,
      localHolder: snapshot.timedMapWeapons.localHolder,
      authorityStatus: snapshot.timedMapWeapons.states[expectedWeapon].status,
    };
  }, weapon)).toEqual({ weapon, localHolder: weapon, authorityStatus: 'held' });
  // The authority grant intentionally owns a 420 ms swap fence. Waiting for it
  // does not warm either effect: no trigger or special-weapon emission occurs.
  await page.waitForTimeout(500);
  // Face down the longest clear test-bay axis so the projectile remains in
  // admitted flight throughout the bounded sustained-update window.
  await page.evaluate(({ x, z }) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z, 0, 0);
  }, station.position);
}

async function stageFlareImpactAtTrainingDummy(page: Page): Promise<FlareImpactStage> {
  const stage = await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const targets = (debug.snapshot() as any).rangePractice.targets as Array<{
      id: string;
      kind: string;
      active: boolean;
      position: [number, number, number];
    }>;
    const target = targets.find(({ id, active }) => id === 'test-dummy-charlie' && active)
      ?? targets.find(({ kind, active }) => kind === 'training-dummy' && active);
    if (!target) throw new Error('Gun Range exposes no active training dummy for the flare impact gate');
    const [targetX, targetY, targetZ] = target.position;
    const playerPosition = [targetX, 1.7, targetZ + 6] as const;
    const deltaX = targetX - playerPosition[0];
    const deltaY = targetY - playerPosition[1];
    const deltaZ = targetZ - playerPosition[2];
    const yaw = Math.atan2(-deltaX, -deltaZ);
    const pitch = Math.atan2(deltaY, Math.hypot(deltaX, deltaZ));
    debug.teleportPlayer(...playerPosition, yaw, pitch);
    return {
      targetId: target.id,
      playerPosition,
      targetPosition: [...target.position] as [number, number, number],
      yaw,
      pitch,
      distanceM: Math.hypot(deltaX, deltaY, deltaZ),
    };
  });
  await expect.poll(async () => page.evaluate(({ playerPosition }) => {
    const actual = window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position;
    return actual.every((value: number, index: number) => Math.abs(value - playerPosition[index]!) < 0.001);
  }, stage)).toBe(true);
  return stage;
}

async function samplePresentedFrameWindow(
  page: Page,
  label: string,
  durationMs: number,
): Promise<PresentedFrameWindow> {
  return page.evaluate(({ selectedLabel, selectedDurationMs }) => new Promise<PresentedFrameWindow>((resolve, reject) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (!debug) return reject(new Error('Atomic Acres debug surface is unavailable'));
    requestAnimationFrame(() => {
      const startedAt = performance.now();
      const startedFrame = debug.admissionState().presentedGameplayFrame;
      let lastFrame = startedFrame;
      let lastPresentedAt = startedAt;
      const gapsMs: number[] = [];
      const inspect = () => {
        const now = performance.now();
        const presentedFrame = debug.admissionState().presentedGameplayFrame;
        if (presentedFrame > lastFrame) {
          gapsMs.push(now - lastPresentedAt);
          lastFrame = presentedFrame;
          lastPresentedAt = now;
        }
        if (now - startedAt >= selectedDurationMs) {
          if (gapsMs.length === 0) {
            reject(new Error(`${selectedLabel} presented no gameplay frames`));
            return;
          }
          const sorted = [...gapsMs].sort((left, right) => left - right);
          const percentile = (quantile: number) => sorted[Math.min(
            sorted.length - 1,
            Math.max(0, Math.ceil(sorted.length * quantile) - 1),
          )]!;
          const roundedGaps = gapsMs.map((gap) => Number(gap.toFixed(3)));
          resolve({
            label: selectedLabel,
            durationMs: Number((now - startedAt).toFixed(3)),
            frameDelta: lastFrame - startedFrame,
            gapsMs: roundedGaps,
            p50Ms: Number(percentile(0.5).toFixed(3)),
            p95Ms: Number(percentile(0.95).toFixed(3)),
            p99Ms: Number(percentile(0.99).toFixed(3)),
            maximumMs: Number(sorted[sorted.length - 1]!.toFixed(3)),
          });
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });
  }), { selectedLabel: label, selectedDurationMs: durationMs });
}

async function probeColdFlareLifecycle(page: Page, durationMs: number): Promise<FlareLifecycleProbe> {
  return page.evaluate((selectedDurationMs) => new Promise<FlareLifecycleProbe>((resolve, reject) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (!debug) return reject(new Error('Atomic Acres debug surface is unavailable'));
    const effectSnapshot = (): FlareEffectTelemetry => {
      const effect = (debug.snapshot() as any).timedMapWeapons.flareProjectiles;
      return {
        spawnCount: effect.spawnCount,
        active: effect.active,
        flying: effect.flying,
        burning: effect.burning,
        impactCount: effect.impactCount,
        burnPulseCount: effect.burnPulseCount,
        poolExhaustions: effect.poolExhaustions,
      };
    };
    requestAnimationFrame(() => {
      const before = effectSnapshot();
      const startedAt = performance.now();
      const startedFrame = debug.admissionState().presentedGameplayFrame;
      let lastFrame = startedFrame;
      let lastPresentedAt = startedAt;
      let eventToPresentedFrameMs: number | null = null;
      const gapsMs: number[] = [];
      debug.fireOnce();
      const synchronousMs = performance.now() - startedAt;
      const inspect = () => {
        const now = performance.now();
        const presentedFrame = debug.admissionState().presentedGameplayFrame;
        if (presentedFrame > lastFrame) {
          gapsMs.push(now - lastPresentedAt);
          if (eventToPresentedFrameMs === null) eventToPresentedFrameMs = now - startedAt;
          lastFrame = presentedFrame;
          lastPresentedAt = now;
        }
        if (now - startedAt >= selectedDurationMs) {
          if (eventToPresentedFrameMs === null || gapsMs.length === 0) {
            reject(new Error('flare-gun-projectile-lifecycle presented no gameplay frames'));
            return;
          }
          const sorted = [...gapsMs].sort((left, right) => left - right);
          const percentile = (quantile: number) => sorted[Math.min(
            sorted.length - 1,
            Math.max(0, Math.ceil(sorted.length * quantile) - 1),
          )]!;
          resolve({
            coldFire: {
              label: 'flare-gun-cold-fire',
              synchronousMs: Number(synchronousMs.toFixed(3)),
              eventToPresentedFrameMs: Number(eventToPresentedFrameMs.toFixed(3)),
              presentedFrameDelta: lastFrame - startedFrame,
            },
            frameWindow: {
              label: 'flare-gun-impact-and-burn-lifecycle',
              durationMs: Number((now - startedAt).toFixed(3)),
              frameDelta: lastFrame - startedFrame,
              gapsMs: gapsMs.map((gap) => Number(gap.toFixed(3))),
              p50Ms: Number(percentile(0.5).toFixed(3)),
              p95Ms: Number(percentile(0.95).toFixed(3)),
              p99Ms: Number(percentile(0.99).toFixed(3)),
              maximumMs: Number(sorted[sorted.length - 1]!.toFixed(3)),
            },
            before,
            after: effectSnapshot(),
          });
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });
  }), durationMs);
}

async function releaseFlamethrowerAndProbeNextPresentedFrame(page: Page): Promise<ColdFireProbe> {
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (!debug) throw new Error('Atomic Acres debug surface is unavailable');
    const target = window as typeof window & { __PASS69_3_FLAME_RELEASE_PROBE__?: Promise<ColdFireProbe> };
    target.__PASS69_3_FLAME_RELEASE_PROBE__ = new Promise<ColdFireProbe>((resolve, reject) => {
      window.addEventListener('mouseup', (event) => {
        if (event.button !== 0) return;
        const startedAt = performance.now();
        const presentedBefore = debug.admissionState().presentedGameplayFrame;
        let synchronousMs: number | null = null;
        queueMicrotask(() => { synchronousMs = performance.now() - startedAt; });
        const deadline = startedAt + 2_000;
        const inspect = () => {
          const presentedAfter = debug.admissionState().presentedGameplayFrame;
          if (presentedAfter > presentedBefore) {
            resolve({
              label: 'flamethrower-release-clearance',
              synchronousMs: Number((synchronousMs ?? performance.now() - startedAt).toFixed(3)),
              eventToPresentedFrameMs: Number((performance.now() - startedAt).toFixed(3)),
              presentedFrameDelta: presentedAfter - presentedBefore,
            });
            return;
          }
          if (performance.now() >= deadline) {
            reject(new Error('flamethrower release did not reach another presented gameplay frame within 2000ms'));
            return;
          }
          requestAnimationFrame(inspect);
        };
        requestAnimationFrame(inspect);
      }, { capture: true, once: true });
    });
  });
  await page.mouse.up({ button: 'left' });
  return page.evaluate(() => {
    const target = window as typeof window & { __PASS69_3_FLAME_RELEASE_PROBE__?: Promise<ColdFireProbe> };
    if (!target.__PASS69_3_FLAME_RELEASE_PROBE__) throw new Error('Flamethrower release probe was not armed');
    return target.__PASS69_3_FLAME_RELEASE_PROBE__;
  });
}

async function probeHeldFlamethrower(page: Page, durationMs: number): Promise<FlamethrowerProbe> {
  return page.evaluate((selectedDurationMs) => new Promise<FlamethrowerProbe>((resolve, reject) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (!debug) return reject(new Error('Atomic Acres debug surface is unavailable'));
    const before = (debug.snapshot() as any).timedMapWeapons.flameStream;
    let inputDeadline = window.setTimeout(() => reject(new Error('No real flamethrower trigger event arrived')), 2_000);
    window.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      window.clearTimeout(inputDeadline);
      inputDeadline = 0;
      const startedAt = performance.now();
      const startedFrame = debug.admissionState().presentedGameplayFrame;
      let lastFrame = startedFrame;
      let lastPresentedAt = startedAt;
      let synchronousMs: number | null = null;
      let triggerToPresentedFrameMs: number | null = null;
      let firstEmissionObservedAfterTriggerMs: number | null = null;
      let firstEmissionContainingFrameGapMs: number | null = null;
      let emissionObservedSinceLastPresentedFrame = false;
      const gapsMs: number[] = [];
      const ammoElement = document.querySelector<HTMLElement>('#ammo');
      const startingAmmo = Number(ammoElement?.textContent ?? Number.NaN);
      const ammoObserver = new MutationObserver(() => {
        const currentAmmo = Number(ammoElement?.textContent ?? Number.NaN);
        if (firstEmissionObservedAfterTriggerMs !== null || !Number.isFinite(startingAmmo)
          || !Number.isFinite(currentAmmo) || currentAmmo >= startingAmmo) return;
        firstEmissionObservedAfterTriggerMs = performance.now() - startedAt;
        emissionObservedSinceLastPresentedFrame = true;
      });
      if (ammoElement) ammoObserver.observe(ammoElement, { childList: true, characterData: true, subtree: true });
      // Capture-to-microtask spans the real pointer handler without including
      // controller/CDP latency. The actual held state remains owned by the
      // production input path and is released by Playwright after the probe.
      queueMicrotask(() => { synchronousMs = performance.now() - startedAt; });
      const inspect = () => {
        try {
          const now = performance.now();
          const presentedFrame = debug.admissionState().presentedGameplayFrame;
          if (presentedFrame > lastFrame) {
            const gap = now - lastPresentedAt;
            gapsMs.push(gap);
            if (triggerToPresentedFrameMs === null) triggerToPresentedFrameMs = now - startedAt;
            if (emissionObservedSinceLastPresentedFrame && firstEmissionContainingFrameGapMs === null) {
              firstEmissionContainingFrameGapMs = gap;
              emissionObservedSinceLastPresentedFrame = false;
            }
            lastFrame = presentedFrame;
            lastPresentedAt = now;
          }
          if (now - startedAt >= selectedDurationMs) {
            ammoObserver.disconnect();
            const after = (debug.snapshot() as any).timedMapWeapons.flameStream;
            if (gapsMs.length === 0) {
              reject(new Error('flamethrower-held-fire presented no gameplay frames'));
              return;
            }
            const sorted = [...gapsMs].sort((left, right) => left - right);
            const percentile = (quantile: number) => sorted[Math.min(
              sorted.length - 1,
              Math.max(0, Math.ceil(sorted.length * quantile) - 1),
            )]!;
            resolve({
              label: 'flamethrower-held-fire',
              durationMs: Number((now - startedAt).toFixed(3)),
              synchronousMs: synchronousMs === null ? null : Number(synchronousMs.toFixed(3)),
              triggerToPresentedFrameMs: triggerToPresentedFrameMs === null
                ? null : Number(triggerToPresentedFrameMs.toFixed(3)),
              firstEmissionObservedAfterTriggerMs: firstEmissionObservedAfterTriggerMs === null
                ? null : Number(firstEmissionObservedAfterTriggerMs.toFixed(3)),
              firstEmissionContainingFrameGapMs: firstEmissionContainingFrameGapMs === null
                ? null : Number(firstEmissionContainingFrameGapMs.toFixed(3)),
              frameWindow: {
                label: 'flamethrower-held-fire',
                durationMs: Number((now - startedAt).toFixed(3)),
                frameDelta: lastFrame - startedFrame,
                gapsMs: gapsMs.map((gap) => Number(gap.toFixed(3))),
                p50Ms: Number(percentile(0.5).toFixed(3)),
                p95Ms: Number(percentile(0.95).toFixed(3)),
                p99Ms: Number(percentile(0.99).toFixed(3)),
                maximumMs: Number(sorted[sorted.length - 1]!.toFixed(3)),
              },
              emissions: after.emissions - before.emissions,
              particlesSpawned: after.particlesSpawned - before.particlesSpawned,
              particlesPerEmission: after.particlesPerEmission,
              softwarePresentationBudget: after.softwareAdapter,
              maximumActive: after.maximumActive,
              groundFireActive: after.groundFireActive,
              groundFireMerges: after.groundFireMerges - before.groundFireMerges,
              poolExhaustions: after.poolExhaustions - before.poolExhaustions,
            });
            return;
          }
          requestAnimationFrame(inspect);
        } catch (error) {
          ammoObserver.disconnect();
          reject(error);
        }
      };
      requestAnimationFrame(inspect);
    }, { capture: true, once: true });
  }), durationMs);
}

function expectBoundedFrameWindow(window: PresentedFrameWindow, minimumFrames: number): void {
  const evidence = `${window.label} ${JSON.stringify({
    frameDelta: window.frameDelta,
    p95Ms: window.p95Ms,
    maximumMs: window.maximumMs,
  })}`;
  expect(window.frameDelta, `${evidence}: presentation must remain live`).toBeGreaterThanOrEqual(minimumFrames);
  expect(window.p95Ms, `${evidence}: sustained p95 frame-gap budget`).toBeLessThan(MAX_SUSTAINED_P95_MS);
  expect(window.maximumMs, `${evidence}: sustained maximum frame-gap budget`)
    .toBeLessThan(MAX_SUSTAINED_PRESENTED_FRAME_GAP_MS);
}

test('cold and held flamethrower fire remain inside the presented-frame freeze budget', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await deployGunRange(page, 'pass69-3-flamethrower-hitch-gate');
  const runtimeBefore = await captureFrameHitchRendererEvidence(page, testInfo);
  expectFrameHitchRendererEvidence(runtimeBefore, 'gun-range', 'flamethrower initial runtime');
  const baseline = await samplePresentedFrameWindow(page, 'flamethrower-baseline', 750);
  await acquireTrainingWeapon(page, 'flamethrower');
  await page.locator('#game').click({ position: { x: 64, y: 64 }, force: true });
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 5_000 });
  const heldProbePromise = probeHeldFlamethrower(page, 2_000);
  await page.waitForTimeout(100);
  await page.mouse.down({ button: 'left' });
  let probe: FlamethrowerProbe;
  let releaseProbe: ColdFireProbe | null = null;
  try {
    probe = await heldProbePromise;
  } finally {
    releaseProbe = await releaseFlamethrowerAndProbeNextPresentedFrame(page);
  }
  if (!releaseProbe) throw new Error('Flamethrower release-frame probe did not complete');
  await page.waitForFunction(() => {
    const clearance = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any)
      .weaponPresentation.flamethrowerHeldFireClearance;
    return clearance.fastPathActive === false && clearance.exitTransitions >= 1;
  }, undefined, { timeout: 5_000 });
  const clearance = await page.evaluate(() => {
    const presentation = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).weaponPresentation;
    return {
      ...presentation.flamethrowerHeldFireClearance,
      armNearPlaneClear: presentation.armFraming?.nearPlaneClear ?? null,
      weaponNearPlaneClear: presentation.weaponFraming?.nearPlaneClear ?? null,
    };
  });
  expect(probe.synchronousMs).not.toBeNull();
  expect(probe.synchronousMs).toBeLessThan(MAX_SYNCHRONOUS_ACTION_MS);
  expect(probe.triggerToPresentedFrameMs).not.toBeNull();
  expect(probe.triggerToPresentedFrameMs!).toBeLessThan(MAX_EVENT_TO_PRESENTED_FRAME_MS);
  expect(probe.firstEmissionObservedAfterTriggerMs).not.toBeNull();
  expect(probe.firstEmissionContainingFrameGapMs).not.toBeNull();
  expect(probe.firstEmissionContainingFrameGapMs!).toBeLessThan(MAX_EVENT_TO_PRESENTED_FRAME_MS);
  expect(releaseProbe.synchronousMs).toBeLessThan(MAX_SYNCHRONOUS_ACTION_MS);
  expect(releaseProbe.eventToPresentedFrameMs).toBeLessThan(MAX_EVENT_TO_PRESENTED_FRAME_MS);
  expect(probe.emissions).toBeGreaterThanOrEqual(8);
  const expectedParticlesPerEmission = runtimeBefore.runtime.softwareAdapter === true ? 2 : 4;
  expect(probe.softwarePresentationBudget).toBe(runtimeBefore.runtime.softwareAdapter === true);
  expect(probe.particlesPerEmission).toBe(expectedParticlesPerEmission);
  expect(probe.particlesSpawned).toBe(probe.emissions * expectedParticlesPerEmission);
  expect(probe.maximumActive).toBeGreaterThan(0);
  expect(probe.groundFireActive).toBeGreaterThan(0);
  expect(probe.poolExhaustions).toBe(0);
  expect(clearance).toMatchObject({
    fastPathActive: false,
    armNearPlaneClear: true,
    weaponNearPlaneClear: true,
  });
  expect(clearance.prewarmChecks).toBeGreaterThanOrEqual(1);
  expect(clearance.entryTransitions).toBeGreaterThanOrEqual(1);
  expect(clearance.exitTransitions).toBeGreaterThanOrEqual(1);
  expect(clearance.skippedFrames).toBeGreaterThanOrEqual(20);
  expectBoundedFrameWindow(baseline, 20);
  expectBoundedFrameWindow(probe.frameWindow, 50);
  expect(probe.frameWindow.maximumMs).toBeLessThan(baseline.p95Ms * 4 + 40);
  const runtimeAfter = await captureFrameHitchRendererEvidence(page, testInfo);
  expectFrameHitchRendererEvidence(runtimeAfter, 'gun-range', 'flamethrower final runtime');
  expect(browserErrors).toEqual([]);
  const thresholds = {
    maximumEventToPresentedFrameMs: MAX_EVENT_TO_PRESENTED_FRAME_MS,
    maximumSynchronousActionMs: MAX_SYNCHRONOUS_ACTION_MS,
    maximumSustainedPresentedFrameGapMs: MAX_SUSTAINED_PRESENTED_FRAME_GAP_MS,
    maximumSustainedP95Ms: MAX_SUSTAINED_P95_MS,
    maximumRelativeMultiplier: 4,
    maximumRelativeAllowanceMs: 40,
  };
  await testInfo.attach('flamethrower-frame-hitch-receipt', {
    body: Buffer.from(JSON.stringify({
      thresholds, runtimeBefore, runtimeAfter, baseline, probe, releaseProbe, clearance,
    }, null, 2)),
    contentType: 'application/json',
  });
  console.log('PASS69_3_FLAMETHROWER_FRAME_HITCH', JSON.stringify({
    runtimeBefore,
    runtimeAfter,
    baseline: { ...baseline, gapsMs: undefined },
    probe: { ...probe, frameWindow: { ...probe.frameWindow, gapsMs: undefined } },
    releaseProbe,
    clearance,
  }));
  writeOfficialFrameHitchReceipt(
    'flamethrower', runtimeBefore, runtimeAfter, thresholds,
    { baseline, probe, releaseProbe, clearance }, browserErrors,
  );
});

test('cold flare shot and sustained projectile updates remain inside the presented-frame freeze budget', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await deployGunRange(page, 'pass69-3-flare-gun-hitch-gate');
  const runtimeBefore = await captureFrameHitchRendererEvidence(page, testInfo);
  expectFrameHitchRendererEvidence(runtimeBefore, 'gun-range', 'flare-gun initial runtime');
  const baseline = await samplePresentedFrameWindow(page, 'flare-gun-baseline', 750);
  await acquireTrainingWeapon(page, 'flare-gun');
  const impactStage = await stageFlareImpactAtTrainingDummy(page);
  // One continuous strict frame sample owns the cold action, target/floor
  // impact, and the first real 500 ms burn pulse. This prevents a flight-only
  // pass from hiding a hitch in either collision or burn processing.
  const lifecycle = await probeColdFlareLifecycle(page, 1_200);
  const { coldFire, frameWindow: sustained, before, after } = lifecycle;
  const effectTelemetry = {
    spawnCountDelta: after.spawnCount - before.spawnCount,
    impactCountDelta: after.impactCount - before.impactCount,
    burnPulseCountDelta: after.burnPulseCount - before.burnPulseCount,
    activeAfterWindow: after.active,
    flyingAfterWindow: after.flying,
    burningAfterWindow: after.burning,
    poolExhaustionsDelta: after.poolExhaustions - before.poolExhaustions,
  };

  expect(coldFire.presentedFrameDelta).toBeGreaterThan(0);
  expect(coldFire.synchronousMs).toBeLessThan(MAX_SYNCHRONOUS_ACTION_MS);
  expect(coldFire.eventToPresentedFrameMs).toBeLessThan(MAX_EVENT_TO_PRESENTED_FRAME_MS);
  expect(effectTelemetry.spawnCountDelta).toBe(1);
  expect(effectTelemetry.impactCountDelta).toBeGreaterThan(0);
  expect(effectTelemetry.burnPulseCountDelta).toBeGreaterThan(0);
  expect(after.flying + after.burning).toBe(after.active);
  expect(effectTelemetry.poolExhaustionsDelta).toBe(0);
  expectBoundedFrameWindow(baseline, 20);
  expectBoundedFrameWindow(sustained, 20);
  expect(sustained.maximumMs).toBeLessThan(baseline.p95Ms * 4 + 40);
  const runtimeAfter = await captureFrameHitchRendererEvidence(page, testInfo);
  expectFrameHitchRendererEvidence(runtimeAfter, 'gun-range', 'flare-gun final runtime');
  expect(browserErrors).toEqual([]);
  const thresholds = {
    maximumEventToPresentedFrameMs: MAX_EVENT_TO_PRESENTED_FRAME_MS,
    maximumSynchronousActionMs: MAX_SYNCHRONOUS_ACTION_MS,
    maximumSustainedPresentedFrameGapMs: MAX_SUSTAINED_PRESENTED_FRAME_GAP_MS,
    maximumSustainedP95Ms: MAX_SUSTAINED_P95_MS,
    maximumRelativeMultiplier: 4,
    maximumRelativeAllowanceMs: 40,
  };
  await testInfo.attach('flare-gun-frame-hitch-receipt', {
    body: Buffer.from(JSON.stringify({
      thresholds,
      runtimeBefore,
      runtimeAfter,
      baseline,
      coldFire,
      sustained,
      impactStage,
      before,
      after,
      effectTelemetry,
    }, null, 2)),
    contentType: 'application/json',
  });
  console.log('PASS69_3_FLARE_GUN_FRAME_HITCH', JSON.stringify({
    runtimeBefore,
    runtimeAfter,
    baseline: { ...baseline, gapsMs: undefined },
    coldFire,
    sustained: { ...sustained, gapsMs: undefined },
    impactStage,
    effectTelemetry,
  }));
  writeOfficialFrameHitchReceipt(
    'flare-gun', runtimeBefore, runtimeAfter, thresholds,
    { baseline, coldFire, sustained, impactStage, before, after, effectTelemetry }, browserErrors,
  );
});
