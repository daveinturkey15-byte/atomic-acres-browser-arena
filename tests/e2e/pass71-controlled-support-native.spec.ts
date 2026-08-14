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

async function awaitChopperRuntimePhase(
  page: Page,
  entityId: string,
  activationId: string,
  phase: 'cooldown-ready' | 'second-missile',
) {
  return page.evaluate(async ({ id, activation, expectedPhase }) => {
    const deadline = performance.now() + 3_000;
    let latest: any = null;
    let firstMissileReceipt: any = null;
    do {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === id) ?? null;
      const drops = snapshot.supportImpactEvents.recent.filter((event: any) => (
        event.source === 'chopper'
          && event.activationId === activation
          && event.phase === 'drop'
      ));
      latest = {
        entity,
        impacts: snapshot.supportImpactEvents,
        authority: snapshot.chopperMissileAuthority,
        controlAdmission: snapshot.killstreakControlAdmission,
        presentation: snapshot.killstreakPresentation,
        activationMatches: entity?.activationId === activation,
        remainingLifetimeMs: entity?.expiresInMs ?? 0,
      };
      if (entity?.missileAmmo === 5 && drops.some((event: any) => event.ordinal === 0)) {
        firstMissileReceipt ??= latest;
      }
      if (!entity || entity.activationId !== activation || !(entity.expiresInMs > 0)) {
        return { ...latest, firstMissileReceipt };
      }
      if ((expectedPhase === 'cooldown-ready' && firstMissileReceipt !== null
          && entity.missileAmmo === 5
          && drops.some((event: any) => event.ordinal === 0)
          && entity.missileCooldownMs === 0)
        || (expectedPhase === 'second-missile' && entity.missileAmmo === 4
          && drops.some((event: any) => event.ordinal === 1))) {
        return { ...latest, firstMissileReceipt };
      }
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 25));
    } while (performance.now() < deadline);
    return { ...latest, firstMissileReceipt };
  }, { id: entityId, activation: activationId, expectedPhase: phase });
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
    const possession = snapshot.killstreak.actors.find((actor: any) => actor.actorId === snapshot.player.id)?.possession;
    const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === possession?.entityId);
    return {
      primaryHealth: snapshot.bots.find((bot: any) => bot.id === primaryTargetId)?.hp,
      splashHealth: snapshot.bots.find((bot: any) => bot.id === splashTargetId)?.hp,
      received: snapshot.supportDamageFeedback.received,
      startedAtMs: performance.now(),
      possession,
      entityId: entity?.id ?? null,
      activationId: entity?.activationId ?? null,
      remainingLifetimeMs: entity?.expiresInMs ?? 0,
    };
  }, stagedSplash);
  expect(splashBaseline).toMatchObject({
    possession: { kind: 'chopper-gunner', entityId: stagedSplash.entityId },
    entityId: stagedSplash.entityId,
    activationId: stagedSplash.activationId,
  });
  expect(splashBaseline.remainingLifetimeMs).toBeGreaterThan(5_000);

  await page.mouse.down({ button: 'left' });
  const splashReceipt = await page.evaluate(async ({ staged, baseline }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const deadline = performance.now() + 2_500;
    let latest: any = null;
    let validAim: any = null;
    do {
      const targetId = staged.primaryTargetId;
      const aim = debug.aimPossessedChopperAtTarget(targetId);
      validAim ??= aim;
      const snapshot = debug.snapshot() as any;
      const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.id === staged.entityId) ?? null;
      const possession = snapshot.killstreak.actors
        .find((actor: any) => actor.actorId === snapshot.player.id)?.possession ?? null;
      if (aim && (!entity || entity.activationId !== staged.activationId || !(entity.expiresInMs > 0))) {
        throw new Error('A valid Chopper aim receipt did not retain its activation identity');
      }
      const recent = snapshot.supportDamageFeedback.recent.filter((sample: any) => (
        sample.source === 'chopper'
          && sample.activationId === staged.activationId
          && sample.atMs >= baseline.startedAtMs
      ));
      const primary = recent.find((sample: any) => sample.targetId === staged.primaryTargetId);
      const splash = recent.find((sample: any) => sample.targetId === staged.splashTargetId);
      latest = {
        aim: validAim,
        primary,
        splash,
        primaryHealth: snapshot.bots.find((bot: any) => bot.id === staged.primaryTargetId)?.hp,
        splashHealth: snapshot.bots.find((bot: any) => bot.id === staged.splashTargetId)?.hp,
        triggerHeld: snapshot.textChat.triggerHeld,
        possession,
        entityId: entity?.id ?? null,
        activationId: entity?.activationId ?? null,
        remainingLifetimeMs: entity?.expiresInMs ?? 0,
        entity,
        trustedLeftDown: (globalThis as any).__PASS71_CONTROLLED_SUPPORT_INPUTS__
          .some((event: any) => event.type === 'mousedown' && event.button === 0 && event.trusted === true),
      };
      if (primary && splash) return latest;
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 25));
    } while (performance.now() < deadline);
    return latest;
  }, { staged: stagedSplash, baseline: splashBaseline });
  await page.mouse.up({ button: 'left' });
  const missileArmReceipt = await page.evaluate(({ entityId, activationId }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const accepted = debug.requestPossessedChopperEvidenceControl({ fire: false });
    const snapshot = debug.snapshot() as any;
    const possession = snapshot.killstreak.actors
      .find((actor: any) => actor.actorId === snapshot.player.id)?.possession ?? null;
    const entity = snapshot.killstreak.entities
      .find((candidate: any) => candidate.id === entityId) ?? null;
    return {
      accepted,
      possession,
      entity,
      entityId: entity?.id ?? null,
      activationId: entity?.activationId ?? null,
      activationMatches: entity?.activationId === activationId,
      remainingLifetimeMs: entity?.expiresInMs ?? 0,
    };
  }, { entityId: stagedSplash.entityId, activationId: stagedSplash.activationId });
  expect(splashReceipt).not.toBeNull();
  expect(splashReceipt.aim).toMatchObject({
    entityId: stagedSplash.entityId,
    activationId: stagedSplash.activationId,
    targetId: stagedSplash.primaryTargetId,
    lineOfSight: true,
  });
  expect(splashReceipt.trustedLeftDown).toBe(true);
  expect(splashReceipt).toMatchObject({
    possession: { kind: 'chopper-gunner', entityId: stagedSplash.entityId },
    entityId: stagedSplash.entityId,
    activationId: stagedSplash.activationId,
  });
  expect(splashReceipt.remainingLifetimeMs).toBeGreaterThan(0);
  expect(splashReceipt.triggerHeld).toBe(true);
  expect(splashReceipt.primaryHealth).toBeLessThan(splashBaseline.primaryHealth);
  expect(splashReceipt.splashHealth).toBeLessThan(splashBaseline.splashHealth);
  expect(splashReceipt.primary.atMs).toBe(splashReceipt.splash.atMs);
  expect(splashReceipt.primary.activationId).toBe(splashReceipt.splash.activationId);
  expect(splashReceipt.primary.damage).toBeGreaterThan(0);
  expect(splashReceipt.splash.damage).toBeGreaterThan(0);

  expect(splashReceipt.aim).not.toBeNull();
  expect(missileArmReceipt).toMatchObject({
    accepted: true,
    possession: { kind: 'chopper-gunner', entityId: stagedSplash.entityId },
    entityId: stagedSplash.entityId,
    activationId: stagedSplash.activationId,
    activationMatches: true,
  });
  expect(missileArmReceipt.remainingLifetimeMs).toBeGreaterThan(0);
  const missileBefore = missileArmReceipt;
  expect(missileBefore.entity).toMatchObject({
    activationId: stagedSplash.activationId,
    missileAmmo: 6,
    missileCooldownMs: 0,
  });
  expect(missileBefore.entity.expiresInMs).toBeGreaterThan(0);
  const firstMissileWallClockMs = Date.now();
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  const cooldownReady = await awaitChopperRuntimePhase(
    page,
    stagedSplash.entityId,
    stagedSplash.activationId,
    'cooldown-ready',
  );
  const firstMissile = cooldownReady.firstMissileReceipt;
  expect(firstMissile).toMatchObject({ activationMatches: true, entity: { missileAmmo: 5 } });
  expect(firstMissile.remainingLifetimeMs).toBeGreaterThan(0);
  const firstDrop = [...firstMissile.impacts.recent].reverse().find((event: any) => (
    event.source === 'chopper'
      && event.activationId === stagedSplash.activationId
      && event.phase === 'drop'
      && event.ordinal === 0
  ));
  expect(firstDrop).toMatchObject({ launchPosition: [expect.any(Number), expect.any(Number), expect.any(Number)] });
  const firstAuthority = [...firstMissile.authority.events].reverse().find((event: any) => (
    event.phase === 'launch'
      && event.activationId === stagedSplash.activationId
      && event.ordinal === 0
  ));
  expect(firstAuthority).toMatchObject({
    contract: 'pass71-hf308-chopper-missile-authority-v1',
    aircraftId: stagedSplash.entityId,
    activationId: stagedSplash.activationId,
    ordinal: 0,
    socketSide: 'left',
    launchPosition: firstDrop.launchPosition,
    ammoBefore: 6,
    ammoAfter: 5,
    cadenceMs: 1_000,
  });
  expect(firstMissile.presentation.bombShells).toBeGreaterThan(0);
  expect(firstMissile.controlAdmission).toMatchObject({ action: 'pilot-control', missileFire: true, accepted: true });
  const expectedFirstHardpoint = chopperMissileLaunchPosition(
    firstAuthority.sourcePosition,
    firstAuthority.sourceAttitude,
    0,
  );
  expect(Math.hypot(
    firstDrop.launchPosition[0] - expectedFirstHardpoint[0],
    firstDrop.launchPosition[1] - expectedFirstHardpoint[1],
    firstDrop.launchPosition[2] - expectedFirstHardpoint[2],
  )).toBeLessThan(0.75);
  const hardpointDistanceM = Math.hypot(
    firstDrop.launchPosition[0] - firstAuthority.sourcePosition[0],
    firstDrop.launchPosition[1] - firstAuthority.sourcePosition[1],
    firstDrop.launchPosition[2] - firstAuthority.sourcePosition[2],
  );
  expect(hardpointDistanceM).toBeGreaterThan(0.5);
  expect(hardpointDistanceM).toBeLessThan(3);
  expect(Math.abs(firstDrop.launchPosition[1] - firstAuthority.sourcePosition[1])).toBeLessThan(1.5);
  expect(firstDrop.launchPosition[1] - firstDrop.position[1]).toBeLessThan(20);
  const immediateSecond = firstMissile;
  expect(immediateSecond.entity).toMatchObject({
    activationId: stagedSplash.activationId,
    missileAmmo: 5,
  });
  expect(immediateSecond.entity.expiresInMs).toBeGreaterThan(0);
  expect(immediateSecond.impacts.recent.filter((event: any) => (
    event.source === 'chopper'
      && event.activationId === stagedSplash.activationId
      && event.phase === 'drop'
  ))).toHaveLength(1);
  expect(immediateSecond.controlAdmission).toMatchObject({
    action: 'pilot-control',
    fire: false,
    missileFire: true,
    accepted: true,
    reason: 'accepted',
  });
  expect(immediateSecond.controlAdmission.sequence).toBe(firstAuthority.controlSequence + 1);
  expect(cooldownReady).toMatchObject({ activationMatches: true, entity: { missileCooldownMs: 0 } });
  expect(cooldownReady.remainingLifetimeMs).toBeGreaterThan(0);
  expect(Date.now() - firstMissileWallClockMs).toBeGreaterThanOrEqual(1_000);
  const secondMissileBefore = cooldownReady;
  expect(secondMissileBefore.entity).toMatchObject({
    activationId: stagedSplash.activationId,
    missileAmmo: 5,
    missileCooldownMs: 0,
  });
  expect(secondMissileBefore.entity.expiresInMs).toBeGreaterThan(0);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  const secondMissile = await awaitChopperRuntimePhase(
    page,
    stagedSplash.entityId,
    stagedSplash.activationId,
    'second-missile',
  );
  expect(secondMissile).toMatchObject({ activationMatches: true, entity: { missileAmmo: 4 } });
  expect(secondMissile.remainingLifetimeMs).toBeGreaterThan(0);
  const secondDrop = [...secondMissile.impacts.recent].reverse().find((event: any) => (
    event.source === 'chopper'
      && event.activationId === stagedSplash.activationId
      && event.phase === 'drop'
      && event.ordinal === 1
  ));
  expect(secondDrop).toBeTruthy();
  expect(secondDrop.atMs - firstDrop.atMs).toBeGreaterThanOrEqual(1_000);
  expect(secondMissile.presentation.bombShells).toBeGreaterThan(0);
  const secondAuthority = [...secondMissile.authority.events].reverse().find((event: any) => (
    event.phase === 'launch'
      && event.activationId === stagedSplash.activationId
      && event.ordinal === 1
  ));
  expect(secondAuthority).toMatchObject({
    contract: 'pass71-hf308-chopper-missile-authority-v1',
    aircraftId: stagedSplash.entityId,
    activationId: stagedSplash.activationId,
    ordinal: 1,
    socketSide: 'right',
    launchPosition: secondDrop.launchPosition,
    ammoBefore: 5,
    ammoAfter: 4,
    cadenceMs: 1_000,
  });
  expect(secondAuthority.controlSequence).toBe(immediateSecond.controlAdmission.sequence + 1);
  const expectedSecondHardpoint = chopperMissileLaunchPosition(
    secondAuthority.sourcePosition,
    secondAuthority.sourceAttitude,
    1,
  );
  expect(Math.hypot(
    secondDrop.launchPosition[0] - expectedSecondHardpoint[0],
    secondDrop.launchPosition[1] - expectedSecondHardpoint[1],
    secondDrop.launchPosition[2] - expectedSecondHardpoint[2],
  )).toBeLessThan(0.75);
  const missileScreenshot = resolve(evidence, 'chopper-hardpoint-missile.png');
  await page.screenshot({ path: missileScreenshot, animations: 'allow' });
  expect((await sharp(missileScreenshot).stats()).entropy).toBeGreaterThan(1.5);
  await testInfo.attach(`pass71-${renderer}-chopper-hardpoint-missile`, {
    path: missileScreenshot,
    contentType: 'image/png',
  });
  expect(await page.evaluate(() => (globalThis as any).__PASS71_CONTROLLED_SUPPORT_INPUTS__
    .filter((event: any) => event.type === 'mousedown' && event.button === 2 && event.trusted === true).length)).toBe(3);

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.releasePossessedChopperEvidenceControl());
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
      chopper: {
        stagedSplash,
        splashBaseline,
        splashReceipt,
        missileBefore: {
          entityId: missileBefore.entity.id,
          activationId: missileBefore.entity.activationId,
          remainingLifetimeMs: missileBefore.entity.expiresInMs,
        },
        firstMissile: {
          entityId: firstMissile.entity.id,
          activationId: firstMissile.entity.activationId,
          remainingLifetimeMs: firstMissile.remainingLifetimeMs,
          authority: firstAuthority,
        },
        firstDrop,
        immediateSecond: {
          entityId: immediateSecond.entity.id,
          activationId: immediateSecond.entity.activationId,
          remainingLifetimeMs: immediateSecond.remainingLifetimeMs,
          admittedControlSequence: immediateSecond.controlAdmission.sequence,
          missileAmmo: immediateSecond.entity.missileAmmo,
          dropCount: immediateSecond.impacts.recent.filter((event: any) => (
            event.source === 'chopper'
              && event.activationId === stagedSplash.activationId
              && event.phase === 'drop'
          )).length,
        },
        cooldownReady: {
          entityId: cooldownReady.entity.id,
          activationId: cooldownReady.entity.activationId,
          remainingLifetimeMs: cooldownReady.remainingLifetimeMs,
        },
        secondMissile: {
          entityId: secondMissile.entity.id,
          activationId: secondMissile.entity.activationId,
          remainingLifetimeMs: secondMissile.remainingLifetimeMs,
          authority: secondAuthority,
        },
        secondDrop,
      },
      pilotedDrone: { occludedStage, occludedScreenPosition, visibleStage },
    }, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
  expect(errors).toEqual([]);
});
