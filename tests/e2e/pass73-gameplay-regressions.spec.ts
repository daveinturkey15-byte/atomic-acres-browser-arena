import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

type WindowState = { id: string; broken: boolean; visible: boolean };
type DebugApi = {
  startSolo(): void;
  admissionState(): { matchPhase: string };
  snapshot(): any;
  setBotsFrozen(frozen: boolean): void;
  setBotPresentation(stance: 'stand' | 'crouch' | 'prone' | null, speed?: number, weapon?: string): void;
  placeBotAhead(distance?: number): unknown;
  aimAtBot(zone?: 'head' | 'body' | 'limb'): void;
  stageWindow(index: number, distance?: number): void;
  equipWeapon(weapon: 'explosive-crossbow' | 'm14-ebr'): void;
  fireOnce(): void;
  setAds(held: boolean): void;
  teleportPlayer(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  placeBotRelative(right: number, forward: number): void;
  segmentBlocked(x1: number, z1: number, x2: number, z2: number): boolean;
  setThermalRevealEvidenceHidden(hidden: boolean): boolean;
  stageRailgunSpawn(siteIndex?: number): { pickupPosition: [number, number, number] };
  interactRailgun(): boolean;
  detonateCrossbowNearWindow(index: number, distance?: number): {
    windowId: string;
    beforeBroken: boolean;
    afterBroken: boolean;
    detonationPoint: number[];
    radiusM: number;
  } | null;
  throwGrenade(): void;
  setGrenades(count: number): void;
};

type GrenadeFrameWindow = Readonly<{
  handlerMs: number;
  gapsMs: readonly number[];
  maximumGapMs: number;
  longTasks: readonly Readonly<{ startTime: number; duration: number }>[];
  audioBefore: any;
  audioAfter: any;
}>;

async function changedPixelFraction(left: Buffer, right: Buffer): Promise<number> {
  const leftRaw = await sharp(left).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rightRaw = await sharp(right).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(rightRaw.info.width).toBe(leftRaw.info.width);
  expect(rightRaw.info.height).toBe(leftRaw.info.height);
  let changed = 0;
  for (let offset = 0; offset < leftRaw.data.length; offset += leftRaw.info.channels) {
    const delta = Math.max(
      Math.abs(leftRaw.data[offset]! - rightRaw.data[offset]!),
      Math.abs(leftRaw.data[offset + 1]! - rightRaw.data[offset + 1]!),
      Math.abs(leftRaw.data[offset + 2]! - rightRaw.data[offset + 2]!),
    );
    if (delta >= 12) changed += 1;
  }
  return changed / (leftRaw.info.width * leftRaw.info.height);
}

function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * fraction) - 1))]!;
}

async function captureThermalContribution(page: Page, weapon: 'm14-ebr' | 'railgun') {
  try {
    await page.waitForFunction((weaponId) => {
      const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.snapshot();
      const reveal = snapshot.dmrThermal?.exactOperatorReveal;
      return snapshot.player.weapon === weaponId
        && snapshot.textChat.adsHeld === true
        && reveal?.activeTargets >= 1
        && reveal?.activeModelLayers === reveal?.activeSourceBodyLayers
        && reveal?.activeHaloLayers === reveal?.activeSourceBodyLayers
        && reveal?.siblingParentIdentity === true;
    }, weapon, { polling: 'raf', timeout: 10_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        player: snapshot.player,
        adsHeld: snapshot.textChat?.adsHeld,
        dmrThermal: snapshot.dmrThermal,
        railgun: snapshot.railgun,
        bots: snapshot.bots,
        render: snapshot.render?.runtime,
      };
    });
    throw new Error(`${weapon} thermal readiness timed out: ${JSON.stringify(diagnostic, null, 2)}`, { cause: error });
  }
  const botId = await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    const bot = api.snapshot().bots[0];
    if (!bot) throw new Error('Thermal evidence bot is absent');
    return bot.id as string;
  });
  const canvas = page.locator('#game');
  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
  ).__ATOMIC_ACRES_DEBUG__.setThermalRevealEvidenceHidden(true));
  await page.waitForTimeout(80);
  const hiddenA = await canvas.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(80);
  const hiddenB = await canvas.screenshot({ animations: 'disabled' });
  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
  ).__ATOMIC_ACRES_DEBUG__.setThermalRevealEvidenceHidden(false));
  await page.waitForTimeout(80);
  const shown = await canvas.screenshot({ animations: 'disabled' });
  const baselineNoise = await changedPixelFraction(hiddenA, hiddenB);
  const revealedDelta = await changedPixelFraction(hiddenB, shown);
  const telemetry = await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().dmrThermal.exactOperatorReveal);
  expect(telemetry).toMatchObject({
    contract: 'exact-animated-operator-plus-orange-halo-v1',
    siblingParentIdentity: true,
    geometryIdentity: true,
    skeletonIdentity: true,
    bindMatrixIdentity: true,
    meshWorldMatrixIdentity: true,
    haloWorldMatrixIdentity: true,
    throughGeometry: true,
    orangeHalo: true,
    evidenceControlHidden: false,
  });
  expect(telemetry.activeTargetIds).toContain(botId);
  expect(revealedDelta, `${weapon} thermal layers must materially change rendered pixels`)
    .toBeGreaterThan(Math.max(0.00002, baselineNoise * 1.5));
  return { weapon, botId, baselineNoise, revealedDelta, telemetry };
}

async function deploy(page: Page, renderer: 'webgl2' | 'webgpu' = 'webgl2'): Promise<void> {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&map=atomic-acres&renderer=${renderer}${requireWebGpu}&render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass73-gameplay`);
  await expect(page.locator('#solo')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#player-name').fill('Pass 73 Gameplay');
  // Trusted input owns AudioContext resume; debug-only admission would leave
  // the first-throw sound lane unproven in autoplay-restricted browsers.
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('#solo');
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    button?.addEventListener('click', () => api.startSolo(), { capture: true, once: true });
  });
  await page.locator('#solo').click();
  await page.waitForFunction(() => Boolean((window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi })
    .__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 10_000 });
  // The menu click owns the trusted AudioContext transition. Some headless
  // channels do not dispatch the async deployment handler after focus moves;
  // the idempotent debug seam completes that same solo admission.
  await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    if (api.admissionState().matchPhase !== 'active') api.startSolo();
  });
  await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi })
    .__ATOMIC_ACRES_DEBUG__?.admissionState().matchPhase === 'active', undefined, { timeout: 60_000 });
  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
  ).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
}

async function captureImmediateGrenadeFrameWindow(page: Page): Promise<GrenadeFrameWindow> {
  return page.evaluate(() => new Promise<GrenadeFrameWindow>((resolve) => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    api.setGrenades(1);
    const longTasks: Array<{ startTime: number; duration: number }> = [];
    const observer = typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      })
      : null;
    try { observer?.observe({ type: 'longtask', buffered: true }); } catch { /* optional browser evidence */ }
    requestAnimationFrame((actionFrameAt) => {
      const audioBefore = api.snapshot().audio.grenadeEffectsPrewarm;
      const handlerStartedAt = performance.now();
      api.throwGrenade();
      const handlerCompletedAt = performance.now();
      const handlerMs = handlerCompletedAt - handlerStartedAt;
      const gapsMs: number[] = [];
      let priorFrameAt = actionFrameAt;
      const sample = (frameAt: number): void => {
        gapsMs.push(Math.max(0, frameAt - priorFrameAt));
        priorFrameAt = frameAt;
        if (frameAt - actionFrameAt < 350) {
          requestAnimationFrame(sample);
          return;
        }
        observer?.disconnect();
        const relevantLongTasks = longTasks.filter(({ startTime, duration }) => (
          startTime + duration >= handlerStartedAt && startTime <= handlerStartedAt + 350
        ));
        resolve({
          handlerMs,
          gapsMs,
          maximumGapMs: Math.max(0, ...gapsMs),
          longTasks: relevantLongTasks,
          audioBefore,
          audioAfter: api.snapshot().audio.grenadeEffectsPrewarm,
        });
      };
      requestAnimationFrame(sample);
    });
  }));
}

test.describe('Pass 73 gameplay regression behavior', () => {
  test('crossbow impact opens glass before its fuse and blast opens an in-radius pane', async ({ page }) => {
    test.setTimeout(120_000);
    await deploy(page);

    const targetId = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
      api.stageWindow(0, 3);
      api.equipWeapon('explosive-crossbow');
      const target = api.snapshot().breakableWindows[0];
      if (!target || target.broken) throw new Error('Expected an intact staged pane');
      api.fireOnce();
      return target.id;
    });
    await page.waitForFunction((windowId) => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
      return api.snapshot().breakableWindows.find(({ id }) => id === windowId)?.broken === true;
    }, targetId, { timeout: 1_000 });
    const direct = await page.evaluate((windowId) => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
      return api.snapshot().breakableWindows.find(({ id }) => id === windowId) ?? null;
    }, targetId);
    expect(direct).toMatchObject({ id: targetId, broken: true, visible: false });

    const blast = await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__.detonateCrossbowNearWindow(0, 1));
    expect(blast).not.toBeNull();
    expect(blast).toMatchObject({
      windowId: targetId,
      beforeBroken: false,
      afterBroken: true,
      radiusM: 3.5,
    });
  });

  test('M14 EBR and Railgun ADS contribute exact-operator plus orange-halo pixels through a wall', async ({ page }) => {
    test.setTimeout(150_000);
    await deploy(page);
    const wallBlocked = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
      api.teleportPlayer(-9, 1.7, -12.5, 0, 0);
      api.placeBotRelative(0, 9);
      api.setBotsFrozen(true);
      api.equipWeapon('m14-ebr');
      api.setAds(true);
      return api.segmentBlocked(-9, -12.5, -9, -21.5);
    });
    expect(wallBlocked).toBe(true);
    const m14 = await captureThermalContribution(page, 'm14-ebr');
    expect(m14.telemetry.activeTargets).toBeGreaterThanOrEqual(1);

    const railgunReady = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      const staged = api.stageRailgunSpawn(0);
      api.teleportPlayer(...staged.pickupPosition);
      if (!api.interactRailgun()) return false;
      api.teleportPlayer(-9, 1.7, -12.5, 0, 0);
      api.placeBotRelative(0, 9);
      api.setBotsFrozen(true);
      api.setAds(true);
      return true;
    });
    expect(railgunReady).toBe(true);
    const railgun = await captureThermalContribution(page, 'railgun');
    expect(railgun.telemetry.activeTargets).toBeGreaterThanOrEqual(1);
  });

  test('a real solo M14 body shot applies the single 0.6x envelope exactly once', async ({ page }) => {
    test.setTimeout(120_000);
    await deploy(page);
    const staged = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
      api.setBotPresentation('stand', 0, 'carbine');
      api.equipWeapon('m14-ebr');
      api.placeBotAhead(6);
      api.aimAtBot('body');
      const before = api.snapshot().bots[0];
      if (!before) throw new Error('M14 damage target is absent');
      api.fireOnce();
      return { id: before.id, healthBefore: before.hp };
    });
    await page.waitForFunction((healthBefore) => {
      const bot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi })
        .__ATOMIC_ACRES_DEBUG__.snapshot().bots[0];
      return bot?.hp < healthBefore;
    }, staged.healthBefore, { polling: 'raf', timeout: 5_000 });
    const after = await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__.snapshot().bots[0]);
    expect(after.id).toBe(staged.id);
    expect(staged.healthBefore - after.hp).toBe(37);
  });

  test('the immediate first grenade frame window stays within the warm second-throw envelope', async ({ page }, testInfo) => {
    test.skip(process.env.PASS73_NATIVE_WEBGPU !== '1', 'Run explicitly on installed Chrome with native hardware WebGPU.');
    test.setTimeout(150_000);
    await deploy(page, 'webgpu');
    const runtime = await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime);
    expect(runtime).toMatchObject({
      requestedBackend: 'webgpu',
      actualBackend: 'webgpu',
      initialized: true,
      failClosed: false,
      softwareAdapter: false,
      deviceLost: false,
      uncapturedErrors: 0,
    });
    const prewarm = await page.evaluate(() => ({
      dataset: document.documentElement.dataset.grenadeEffectsAudioPrewarm,
      telemetry: (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi })
        .__ATOMIC_ACRES_DEBUG__.snapshot().audio.grenadeEffectsPrewarm,
    }));
    expect(prewarm).toMatchObject({
      dataset: 'ready',
      telemetry: {
        prepared: true,
        runs: 1,
        warmupSources: 7,
        warmupNodes: 9,
        retainedSources: 0,
        retainedBroadbandLoops: 0,
        liveRecipe: 'sawtooth-pressure-plus-dual-filtered-noise-v1',
      },
    });

    const first = await captureImmediateGrenadeFrameWindow(page);
    await page.waitForFunction(() => {
      const profile = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi })
        .__ATOMIC_ACRES_DEBUG__.snapshot().grenadeFirstAction;
      return profile?.sequence === 0 && profile.observationComplete === true;
    }, undefined, { polling: 'raf', timeout: 10_000 });
    const firstProfile = await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__.snapshot().grenadeFirstAction);
    await page.waitForTimeout(3_000);
    const second = await captureImmediateGrenadeFrameWindow(page);
    await page.waitForFunction(() => {
      const profile = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi })
        .__ATOMIC_ACRES_DEBUG__.snapshot().grenadeFirstAction;
      return profile?.sequence === 1 && profile.observationComplete === true;
    }, undefined, { polling: 'raf', timeout: 10_000 });
    const secondProfile = await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__.snapshot().grenadeFirstAction);
    const external = {
      first: {
        ...first,
        p50Ms: percentile(first.gapsMs, 0.5),
        p95Ms: percentile(first.gapsMs, 0.95),
        p99Ms: percentile(first.gapsMs, 0.99),
      },
      second: {
        ...second,
        p50Ms: percentile(second.gapsMs, 0.5),
        p95Ms: percentile(second.gapsMs, 0.95),
        p99Ms: percentile(second.gapsMs, 0.99),
      },
    };
    const evidence = JSON.stringify({ external, firstProfile, secondProfile, userAgent: await page.evaluate(() => navigator.userAgent) }, null, 2);
    expect(first.gapsMs.length, evidence).toBeGreaterThanOrEqual(3);
    expect(second.gapsMs.length, evidence).toBeGreaterThanOrEqual(3);
    expect(first.handlerMs, evidence).toBeLessThanOrEqual(second.handlerMs + 3);
    expect(first.maximumGapMs, evidence).toBeLessThan(40);
    expect(first.maximumGapMs, evidence).toBeLessThanOrEqual(second.maximumGapMs + 12);
    expect(external.first.p95Ms, evidence).toBeLessThanOrEqual(external.second.p95Ms + 8);
    expect(external.first.p99Ms, evidence).toBeLessThanOrEqual(external.second.p99Ms + 12);
    expect(first.longTasks, evidence).toEqual([]);
    expect(first.audioBefore, evidence).toMatchObject({ prepared: true, warmupSources: 7, retainedSources: 0 });
    expect(first.audioAfter, evidence).toMatchObject({ prepared: true, warmupSources: 7, retainedSources: 0 });
    expect(second.audioAfter, evidence).toMatchObject({ prepared: true, warmupSources: 7, retainedSources: 0 });
    expect(firstProfile, evidence).toMatchObject({
      sequence: 0,
      cold: true,
      audio: {
        contextState: 'running',
        prewarmed: true,
        warmupSources: 7,
        retainedSources: 0,
        liveRecipe: 'sawtooth-pressure-plus-dual-filtered-noise-v1',
      },
      pool: { acquiredRetainedMesh: true },
      animation: { activeAtHandlerEnd: true, activeOnFirstPresentedFrame: true },
      physics: { path: 'deterministic-kinematic-no-rapier-body', rapierBodiesAcquired: 0 },
      meshVisibleOnFirstPresentedFrame: true,
      observationComplete: true,
    });
    expect(firstProfile.pool.acquisitionsAfter - firstProfile.pool.acquisitionsBefore, evidence).toBe(1);
    expect(firstProfile.pool.activeAfter, evidence).toBeGreaterThanOrEqual(1);
    expect(firstProfile.firstPresentedGameplayFrame, evidence).toBeGreaterThan(firstProfile.startingPresentedGameplayFrame);
    expect(firstProfile.firstPresentedDelayMs, evidence).toBeLessThan(40);
    expect(firstProfile.frameP95Ms, evidence).toBeLessThanOrEqual(secondProfile.frameP95Ms + 8);
    expect(firstProfile.frameP99Ms, evidence).toBeLessThanOrEqual(secondProfile.frameP99Ms + 12);
    expect(firstProfile.maximumAnimationFrameGapMs, evidence)
      .toBeLessThanOrEqual(secondProfile.maximumAnimationFrameGapMs + 12);
    expect(secondProfile, evidence).toMatchObject({
      sequence: 1,
      cold: false,
      pool: { acquiredRetainedMesh: true },
      animation: { activeOnFirstPresentedFrame: true },
      meshVisibleOnFirstPresentedFrame: true,
      observationComplete: true,
    });
    await testInfo.attach('pass73-first-vs-second-grenade-frame-window', {
      body: Buffer.from(evidence),
      contentType: 'application/json',
    });
  });
});
