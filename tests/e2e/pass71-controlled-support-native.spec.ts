import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { MATCH_WARMUP_MS } from '../../src/gameplay';
import { chopperMissileLaunchPosition } from '../../src/killstreak-runtime';

const renderer = process.env.PASS71_CONTROLLED_SUPPORT_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
const MATCH_COUNTDOWN_CUE_COUNT = 4;
// Solo continuity deliberately preserves each unseen 3/2/1/ENGAGE edge across
// a starved presentation frame. Evidence budgets one unchanged warmup envelope
// per required cue; the runtime warmup remains MATCH_WARMUP_MS.
const MATCH_WARMUP_SCHEDULER_EVIDENCE_TIMEOUT_MS = MATCH_WARMUP_MS * MATCH_COUNTDOWN_CUE_COUNT;
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

test.use({
  viewport: { width: 1_920, height: 1_080 },
  launchOptions: {
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  },
});

async function ensurePointerLock(page: Page): Promise<void> {
  if (await page.evaluate(() => document.pointerLockElement === document.querySelector('#game'))) return;
  const game = page.locator('#game');
  const bounds = await game.boundingBox();
  if (!bounds) throw new Error('Game canvas has no trusted-input bounds');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 5_000 });
}

async function chopperEntity(page: Page, entityId: string) {
  return page.evaluate((id) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      entity: snapshot.killstreak.entities.find((candidate: any) => candidate.id === id) ?? null,
      impacts: snapshot.supportImpactEvents,
      controlAdmission: snapshot.killstreakControlAdmission,
      presentation: snapshot.killstreakPresentation,
    };
  }, entityId);
}

async function awaitSchedulerSafeMatchWarmupEvidence(page: Page) {
  const handle = await page.waitForFunction((requiredCueCount) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug.snapshot() as any;
    const admission = debug.admissionState() as any;
    const countdown = snapshot.audio?.countdown;
    if (snapshot.matchPhase !== 'active'
      || !(admission.presentedGameplayFrame > 2)
      || countdown?.cues !== requiredCueCount
      || countdown.lastCue !== 'engage') return false;
    return {
      matchPhase: snapshot.matchPhase,
      presentedGameplayFrame: admission.presentedGameplayFrame,
      cues: countdown.cues,
      lastCue: countdown.lastCue,
    };
  }, MATCH_COUNTDOWN_CUE_COUNT, {
    timeout: MATCH_WARMUP_SCHEDULER_EVIDENCE_TIMEOUT_MS,
    polling: 'raf',
  });
  return handle.jsonValue();
}

test(`${renderer}: trusted possessed support controls prove Chopper splash/missiles and exact-rig Piloted Drone sensing`, async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((storedLoadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
  }, loadout);
  await page.addInitScript(() => {
    const trustedInputs: Array<{ type: string; button: number; trusted: boolean }> = [];
    (globalThis as any).__PASS71_CONTROLLED_SUPPORT_INPUTS__ = trustedInputs;
    for (const type of ['mousedown', 'mouseup'] as const) {
      window.addEventListener(type, (event) => trustedInputs.push({
        type,
        button: event.button,
        trusted: event.isTrusted,
      }), { capture: true });
    }
  });
  await page.goto(
    `/?release=latest&map=atomic-acres&renderer=${renderer}${requireWebGpu}`
      + '&render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off'
      + `&seed=pass71-controlled-support-${renderer}`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 },
  );
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().bootstrap?.stage === 'ready'
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 90_000 });
  await page.locator('#player-name').fill('Pass 71 Support Operator');
  await page.locator('#solo').click();
  await expect.poll(async () => page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug?.snapshot() as any;
    const support = snapshot?.supportVehiclePresentation;
    const requiredAssets = support?.requiredAssets ?? [];
    const loadedAssets = support?.loadedAssets ?? [];
    return {
      gameStarted: snapshot?.gameStarted === true,
      state: support?.state ?? null,
      exactAssetSet: requiredAssets.length > 0
        && requiredAssets.length === loadedAssets.length
        && requiredAssets.every((asset: string) => loadedAssets.includes(asset)),
      readyFamilies: support?.readyFamilies ?? [],
      failures: support?.failures ?? null,
    };
  }), {
    timeout: 90_000,
    intervals: [100, 250, 500],
    message: 'authored support assets must complete their release barrier before controlled evidence',
  }).toMatchObject({
    gameStarted: true,
    state: 'ready',
    exactAssetSet: true,
    readyFamilies: ['care', 'carpet', 'chopper', 'crate'],
    failures: {},
  });
  expect(await awaitSchedulerSafeMatchWarmupEvidence(page)).toMatchObject({
    matchPhase: 'active',
    presentedGameplayFrame: expect.any(Number),
    cues: MATCH_COUNTDOWN_CUE_COUNT,
    lastCue: 'engage',
  });
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.earnSupport(15);
  });
  const evidence = resolve(process.cwd(), `artifacts/pass71/controlled-support/${renderer}`);
  mkdirSync(evidence, { recursive: true });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateDormantReinforcement())).toMatchObject({ activated: true });

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper'))).toBe(true);
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting'), undefined, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await page.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'chopper-gunner');
  await ensurePointerLock(page);

  const stagedSplash = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stagePossessedChopperSplashTargets());
  expect(stagedSplash).not.toBeNull();
  if (!stagedSplash) throw new Error('No authoritative two-bot Chopper splash stage was available');
  expect(stagedSplash.splashRadiusM).toBe(3);
  expect(stagedSplash.separationM).toBeGreaterThan(1);
  expect(stagedSplash.separationM).toBeGreaterThan(2.8);
  expect(stagedSplash.separationM).toBeLessThan(stagedSplash.splashRadiusM);
  const splashBaseline = await page.evaluate(({ primaryTargetId, splashTargetId }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      primaryHealth: snapshot.bots.find((bot: any) => bot.id === primaryTargetId)?.hp,
      splashHealth: snapshot.bots.find((bot: any) => bot.id === splashTargetId)?.hp,
      received: snapshot.supportDamageFeedback.received,
      startedAtMs: performance.now(),
    };
  }, stagedSplash);

  await page.mouse.down({ button: 'left' });
  let splashReceipt: any = null;
  for (let attempt = 0; attempt < 24 && splashReceipt === null; attempt += 1) {
    expect(await page.evaluate((targetId) => (
      window.__ATOMIC_ACRES_DEBUG__.aimPossessedChopperAtTarget(targetId)
    ), stagedSplash.primaryTargetId)).toMatchObject({
      entityId: stagedSplash.entityId,
      activationId: stagedSplash.activationId,
      targetId: stagedSplash.primaryTargetId,
      lineOfSight: true,
    });
    await page.waitForTimeout(75);
    splashReceipt = await page.evaluate(({ staged, baseline }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const recent = snapshot.supportDamageFeedback.recent.filter((sample: any) => (
        sample.source === 'chopper'
          && sample.activationId === staged.activationId
          && sample.atMs >= baseline.startedAtMs
      ));
      const primary = recent.find((sample: any) => sample.targetId === staged.primaryTargetId);
      const splash = recent.find((sample: any) => sample.targetId === staged.splashTargetId);
      const primaryBot = snapshot.bots.find((bot: any) => bot.id === staged.primaryTargetId);
      const splashBot = snapshot.bots.find((bot: any) => bot.id === staged.splashTargetId);
      return primary && splash ? {
        primary,
        splash,
        primaryHealth: primaryBot?.hp,
        splashHealth: splashBot?.hp,
        triggerHeld: snapshot.textChat.triggerHeld,
      } : null;
    }, { staged: stagedSplash, baseline: splashBaseline });
  }
  await page.mouse.up({ button: 'left' });
  expect(await page.evaluate(() => (globalThis as any).__PASS71_CONTROLLED_SUPPORT_INPUTS__
    .some((event: any) => event.type === 'mousedown' && event.button === 0 && event.trusted === true))).toBe(true);
  expect(splashReceipt).not.toBeNull();
  expect(splashReceipt.triggerHeld).toBe(true);
  expect(splashReceipt.primaryHealth).toBeLessThan(splashBaseline.primaryHealth);
  expect(splashReceipt.splashHealth).toBeLessThan(splashBaseline.splashHealth);
  expect(splashReceipt.primary.atMs).toBe(splashReceipt.splash.atMs);
  expect(splashReceipt.primary.activationId).toBe(splashReceipt.splash.activationId);
  expect(splashReceipt.primary.damage).toBeGreaterThan(0);
  expect(splashReceipt.splash.damage).toBeGreaterThan(0);

  expect(await page.evaluate((targetId) => (
    window.__ATOMIC_ACRES_DEBUG__.aimPossessedChopperAtTarget(targetId)
  ), stagedSplash.primaryTargetId)).not.toBeNull();
  const missileBefore = await chopperEntity(page, stagedSplash.entityId);
  expect(missileBefore.entity).toMatchObject({ missileAmmo: 6, missileCooldownMs: 0 });
  const firstMissileWallClockMs = Date.now();
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => (await chopperEntity(page, stagedSplash.entityId)).entity?.missileAmmo, {
    timeout: 3_000,
  }).toBe(5);
  const firstMissile = await chopperEntity(page, stagedSplash.entityId);
  const firstDrop = [...firstMissile.impacts.recent].reverse().find((event: any) => (
    event.source === 'chopper'
      && event.activationId === stagedSplash.activationId
      && event.phase === 'drop'
      && event.ordinal === 0
  ));
  expect(firstDrop).toMatchObject({ launchPosition: [expect.any(Number), expect.any(Number), expect.any(Number)] });
  expect(firstMissile.entity.missileCooldownMs).toBeGreaterThan(0);
  expect(firstMissile.presentation.bombShells).toBeGreaterThan(0);
  expect(firstMissile.controlAdmission).toMatchObject({ action: 'pilot-control', missileFire: true, accepted: true });
  const expectedFirstHardpoint = chopperMissileLaunchPosition(
    missileBefore.entity.position,
    missileBefore.entity.attitude,
    0,
  );
  expect(Math.hypot(
    firstDrop.launchPosition[0] - expectedFirstHardpoint[0],
    firstDrop.launchPosition[1] - expectedFirstHardpoint[1],
    firstDrop.launchPosition[2] - expectedFirstHardpoint[2],
  )).toBeLessThan(0.75);
  const hardpointDistanceM = Math.hypot(
    firstDrop.launchPosition[0] - firstMissile.entity.position[0],
    firstDrop.launchPosition[1] - firstMissile.entity.position[1],
    firstDrop.launchPosition[2] - firstMissile.entity.position[2],
  );
  expect(hardpointDistanceM).toBeGreaterThan(0.5);
  expect(hardpointDistanceM).toBeLessThan(3);
  expect(Math.abs(firstDrop.launchPosition[1] - firstMissile.entity.position[1])).toBeLessThan(1.5);
  expect(firstDrop.launchPosition[1] - firstDrop.position[1]).toBeLessThan(20);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(125);
  const immediateSecond = await chopperEntity(page, stagedSplash.entityId);
  expect(immediateSecond.entity.missileAmmo).toBe(5);
  expect(immediateSecond.impacts.recent.filter((event: any) => (
    event.source === 'chopper'
      && event.activationId === stagedSplash.activationId
      && event.phase === 'drop'
  ))).toHaveLength(1);
  expect(immediateSecond.entity.missileCooldownMs).toBeGreaterThan(0);
  const missileScreenshot = resolve(evidence, 'chopper-hardpoint-missile.png');
  await page.screenshot({ path: missileScreenshot, animations: 'allow' });
  expect((await sharp(missileScreenshot).stats()).entropy).toBeGreaterThan(1.5);
  await testInfo.attach(`pass71-${renderer}-chopper-hardpoint-missile`, {
    path: missileScreenshot,
    contentType: 'image/png',
  });

  await expect.poll(async () => (await chopperEntity(page, stagedSplash.entityId)).entity?.missileCooldownMs, {
    timeout: 3_000,
    intervals: [25],
  }).toBe(0);
  expect(Date.now() - firstMissileWallClockMs).toBeGreaterThanOrEqual(1_000);
  const secondMissileBefore = await chopperEntity(page, stagedSplash.entityId);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => (await chopperEntity(page, stagedSplash.entityId)).entity?.missileAmmo, {
    timeout: 3_000,
  }).toBe(4);
  const secondMissile = await chopperEntity(page, stagedSplash.entityId);
  const secondDrop = [...secondMissile.impacts.recent].reverse().find((event: any) => (
    event.source === 'chopper'
      && event.activationId === stagedSplash.activationId
      && event.phase === 'drop'
      && event.ordinal === 1
  ));
  expect(secondDrop).toBeTruthy();
  expect(secondDrop.atMs - firstDrop.atMs).toBeGreaterThanOrEqual(1_000);
  const expectedSecondHardpoint = chopperMissileLaunchPosition(
    secondMissileBefore.entity.position,
    secondMissileBefore.entity.attitude,
    1,
  );
  expect(Math.hypot(
    secondDrop.launchPosition[0] - expectedSecondHardpoint[0],
    secondDrop.launchPosition[1] - expectedSecondHardpoint[1],
    secondDrop.launchPosition[2] - expectedSecondHardpoint[2],
  )).toBeLessThan(0.75);
  expect(await page.evaluate(() => (globalThis as any).__PASS71_CONTROLLED_SUPPORT_INPUTS__
    .filter((event: any) => event.type === 'mousedown' && event.button === 2 && event.trusted === true).length)).toBe(3);

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await page.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'none');
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('piloted-drone'))).toBe(true);
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'drone' && entity.mode === 'piloted'), undefined, { timeout: 20_000 });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.togglePilotedDroneControl())).toBe(true);
  await page.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'piloted-drone');

  const occludedStage = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stagePossessedPilotedDroneSensorTarget(true));
  expect(occludedStage).not.toBeNull();
  if (!occludedStage) throw new Error('No real-collider occluded Piloted Drone sensor stage was available');
  expect(occludedStage.rangeM).toBeLessThan(occludedStage.sensorMaximumRangeM);
  expect(await page.evaluate((targetId) => (
    window.__ATOMIC_ACRES_DEBUG__.aimPossessedPilotedDroneAtTarget(targetId)
  ), occludedStage.targetId)).toMatchObject({ entityId: occludedStage.entityId, targetId: occludedStage.targetId });
  await expect.poll(async () => page.evaluate((stage) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const target = snapshot.bots.find((bot: any) => bot.id === stage.targetId);
    const sensor = snapshot.killstreak.sensorContacts.filter((contact: any) => contact.id === stage.targetId);
    const exact = snapshot.dmrThermal.exactOperatorReveal;
    return {
      targetRootUuid: target?.operatorModel ? target.rootUuid : null,
      activeClip: target?.operatorModel?.activeClip ?? null,
      sensorContacts: sensor.length,
      sensorProxyMeshes: snapshot.killstreakPresentation.sensorProxyMeshes,
      sensorPresentation: snapshot.killstreakPresentation.sensorPresentation,
      exact,
    };
  }, occludedStage), { timeout: 5_000 }).toMatchObject({
    targetRootUuid: occludedStage.targetRootUuid,
    activeClip: expect.any(String),
    sensorContacts: 1,
    sensorProxyMeshes: 0,
    sensorPresentation: 'shared-exact-animated-thermal-operator',
    exact: {
      contract: 'occlusion-conditioned-single-exact-animated-thermal-operator-v2',
      activeTargets: 1,
      occludedTargets: 1,
      visibleOriginalTargets: 0,
      geometryIdentity: true,
      skeletonIdentity: true,
      bindMatrixIdentity: true,
      meshWorldMatrixIdentity: true,
      boneWorldMatrixIdentity: true,
      silhouetteLayerIdentity: true,
      throughGeometry: true,
      monochromeThermal: true,
      orangeHalo: false,
      treatmentsPerTarget: 1,
      proxyMeshes: 0,
      thermalMaterials: 1,
      exactModelMaterials: 0,
      haloMaterials: 0,
      activeHaloLayers: 0,
      ownedMaterials: 1,
      materialBudgetExceeded: false,
      completeOperatorModels: true,
      incompleteTargets: 0,
    },
  });
  const occludedScreenPosition = await page.evaluate((targetId) => {
    const target = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots
      .find((bot: any) => bot.id === targetId);
    return target?.screenPosition ?? null;
  }, occludedStage.targetId);
  expect(occludedScreenPosition).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
  expect(Math.abs(occludedScreenPosition[0])).toBeLessThan(0.2);
  expect(Math.abs(occludedScreenPosition[1])).toBeLessThan(0.2);
  expect(occludedScreenPosition[2]).toBeGreaterThan(-1);
  expect(occludedScreenPosition[2]).toBeLessThan(1);
  const droneOccludedScreenshot = resolve(evidence, 'piloted-drone-occluded-exact-thermal-rig.png');
  await page.screenshot({ path: droneOccludedScreenshot, animations: 'allow' });
  expect((await sharp(droneOccludedScreenshot).stats()).entropy).toBeGreaterThan(1.5);
  await testInfo.attach(`pass71-${renderer}-piloted-drone-occluded-exact-thermal-rig`, {
    path: droneOccludedScreenshot,
    contentType: 'image/png',
  });

  const visibleStage = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stagePossessedPilotedDroneSensorTarget(false));
  expect(visibleStage).not.toBeNull();
  if (!visibleStage) throw new Error('No real-collider unobstructed Piloted Drone sensor stage was available');
  expect(await page.evaluate((targetId) => (
    window.__ATOMIC_ACRES_DEBUG__.aimPossessedPilotedDroneAtTarget(targetId)
  ), visibleStage.targetId)).not.toBeNull();
  await expect.poll(async () => page.evaluate((targetId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const target = snapshot.bots.find((bot: any) => bot.id === targetId) ?? null;
    const exact = snapshot.dmrThermal.exactOperatorReveal;
    return {
      sensorContacts: snapshot.killstreak.sensorContacts.filter((contact: any) => contact.id === targetId).length,
      normalSource: target ? {
        rootUuid: target.rootUuid,
        effectivelyVisible: target.rootEffectivelyVisible,
        hasVisibleMeshes: target.visibleMeshCount > 0,
        activeClip: target.operatorModel?.activeClip ?? null,
      } : null,
      exact,
    };
  }, visibleStage.targetId), { timeout: 5_000 }).toMatchObject({
    sensorContacts: 1,
    normalSource: {
      rootUuid: visibleStage.targetRootUuid,
      effectivelyVisible: true,
      hasVisibleMeshes: true,
      activeClip: expect.any(String),
    },
    exact: {
      activeTargets: 0,
      occludedTargets: 0,
      visibleOriginalTargets: 1,
      activeModelLayers: 0,
      activeThermalLayers: 0,
      activeHaloLayers: 0,
      treatmentsPerTarget: 0,
      proxyMeshes: 0,
      completeOperatorModels: true,
      incompleteTargets: 0,
    },
  });

  await testInfo.attach(`pass71-${renderer}-controlled-support-runtime-proof`, {
    body: Buffer.from(`${JSON.stringify({
      chopper: { stagedSplash, splashBaseline, splashReceipt, firstDrop, immediateSecond, secondDrop },
      pilotedDrone: { occludedStage, occludedScreenPosition, visibleStage },
    }, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
  expect(errors).toEqual([]);
});
