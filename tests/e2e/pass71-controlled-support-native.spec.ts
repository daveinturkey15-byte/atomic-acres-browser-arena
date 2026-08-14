import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { MATCH_WARMUP_MS } from '../../src/gameplay';
import { CHOPPER_MISSILE_CADENCE_MS, chopperMissileLaunchPosition } from '../../src/killstreak-runtime';
import { CHOPPER_GUN_PROFILE, CHOPPER_GUNNER_SPLASH_POLICY } from '../../src/killstreak-support-catalog';

const renderer = process.env.PASS71_CONTROLLED_SUPPORT_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
const MATCH_COUNTDOWN_CUE_COUNT = 4;
// Solo continuity deliberately preserves each unseen 3/2/1/ENGAGE edge across
// a starved presentation frame. Evidence budgets one unchanged warmup envelope
// per required cue; the runtime warmup remains MATCH_WARMUP_MS.
const MATCH_WARMUP_SCHEDULER_EVIDENCE_TIMEOUT_MS = MATCH_WARMUP_MS * MATCH_COUNTDOWN_CUE_COUNT;
const FIRST_CHOPPER_MISSILE_OBSERVER_KEY = '__PASS71_FIRST_CHOPPER_MISSILE_OBSERVER__';
const MINIMUM_CHOPPER_MISSILE_EVIDENCE_LIFETIME_MS = 5_000;
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

test.use({
  // Retained screencast tracing delays trusted input dispatch by seconds on
  // software CI. Exact page-owned input/authority receipts remain the gate.
  trace: 'off',
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

async function armFirstChopperMissileObserver(
  page: Page,
  entityId: string,
  activationId: string,
): Promise<void> {
  await page.evaluate(({ key, id, activation, cadenceMs, minimumEvidenceLifetimeMs }) => {
    if ((globalThis as any)[key]) throw new Error('A first Chopper missile observer is already armed');
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    // Start the projection clock before reading the entity so the retained
    // lifetime is conservative even if snapshot collection itself takes time.
    const armedAtMs = performance.now();
    const armedSnapshot = debug.snapshot() as any;
    const armedEntity = armedSnapshot.killstreak.entities
      .find((candidate: any) => candidate.id === id) ?? null;
    const armedPossession = armedSnapshot.killstreak.actors
      .find((actor: any) => actor.actorId === armedSnapshot.player.id)?.possession ?? null;
    if (armedPossession?.kind !== 'chopper-gunner'
      || armedPossession.entityId !== id
      || armedEntity?.activationId !== activation
      || armedEntity.gunController !== 'owner-player'
      || armedEntity.missileAmmo !== 6
      || armedEntity.missileCooldownMs !== 0
      || !(armedEntity.expiresInMs > 0)) {
      throw new Error('The exact ready Chopper identity was unavailable while arming its missile observer');
    }
    const armedRemainingLifetimeMs = armedEntity.expiresInMs as number;
    let resolveReceipt!: (receipt: any) => void;
    let rejectReceipt!: (error: unknown) => void;
    const promise = new Promise<any>((resolve, reject) => {
      resolveReceipt = resolve;
      rejectReceipt = reject;
    });
    const observer = {
      entityId: id,
      activationId: activation,
      armedAtMs,
      armedRemainingLifetimeMs,
      deadlineAtMs: null as number | null,
      trustedRightDowns: [] as Array<Readonly<{
        eventTimestampMs: number;
        observedAtMs: number;
        eventPhase: number;
        remainingLifetimeMs: number;
      }>>,
      firstMissileReceipt: null as any,
      latest: null as any,
      pollId: null as number | null,
      watchdogId: null as number | null,
      inspectionMicrotaskQueued: false,
      settled: false,
      promise,
      cancel: (_message: string) => undefined,
      dispose: () => undefined,
    };
    const dispose = () => {
      window.removeEventListener('mousedown', onTrustedRightDown, true);
      if (observer.pollId !== null) {
        clearTimeout(observer.pollId);
        observer.pollId = null;
      }
      if (observer.watchdogId !== null) {
        clearTimeout(observer.watchdogId);
        observer.watchdogId = null;
      }
    };
    const fail = (error: unknown) => {
      if (observer.settled) return;
      observer.settled = true;
      dispose();
      rejectReceipt(error);
    };
    const finish = (receipt: any) => {
      if (observer.settled) return;
      observer.settled = true;
      dispose();
      resolveReceipt(receipt);
    };
    const scheduleInspect = () => {
      if (observer.settled || observer.pollId !== null) return;
      observer.pollId = window.setTimeout(inspect, 25);
    };
    const schedulePostPropagationInspect = () => {
      if (observer.settled || observer.inspectionMicrotaskQueued) return;
      observer.inspectionMicrotaskQueued = true;
      queueMicrotask(() => {
        observer.inspectionMicrotaskQueued = false;
        if (observer.settled) return;
        if (observer.pollId !== null) {
          clearTimeout(observer.pollId);
          observer.pollId = null;
        }
        inspect();
      });
    };
    const inspect = () => {
      observer.pollId = null;
      if (observer.settled || observer.deadlineAtMs === null) return;
      try {
        const now = performance.now();
        const snapshot = debug.snapshot() as any;
        const entity = snapshot.killstreak.entities
          .find((candidate: any) => candidate.id === id) ?? null;
        const drops = snapshot.supportImpactEvents.recent.filter((event: any) => (
          event.source === 'chopper'
            && event.activationId === activation
            && event.phase === 'drop'
        ));
        const launches = snapshot.chopperMissileAuthority.events.filter((event: any) => (
          event.phase === 'launch'
            && event.aircraftId === id
            && event.activationId === activation
        ));
        const latest = {
          entity,
          impacts: snapshot.supportImpactEvents,
          authority: snapshot.chopperMissileAuthority,
          controlAdmission: snapshot.killstreakControlAdmission,
          presentation: snapshot.killstreakPresentation,
          activationMatches: entity?.activationId === activation,
          remainingLifetimeMs: entity?.expiresInMs ?? 0,
          observerEntityId: id,
          observerActivationId: activation,
          observerArmedAtMs: armedAtMs,
          trustedRightDowns: Object.freeze([...observer.trustedRightDowns]),
          deadlineAtMs: observer.deadlineAtMs,
        };
        observer.latest = latest;
        if (!entity || entity.activationId !== activation || !(entity.expiresInMs > 0)) {
          throw new Error(`The first Chopper missile observer lost its activation identity: ${JSON.stringify(latest)}`);
        }
        if (entity.missileAmmo < 5
          || drops.some((event: any) => event.ordinal === 1)
          || launches.some((event: any) => event.ordinal === 1)) {
          throw new Error(`The immediate second trusted RMB escaped the Chopper missile cadence: ${JSON.stringify(latest)}`);
        }
        if (observer.trustedRightDowns.length === 2) {
          const [firstInput, secondInput] = observer.trustedRightDowns;
          const handlerDeltaMs = secondInput!.observedAtMs - firstInput!.observedAtMs;
          if (!(handlerDeltaMs >= 0 && handlerDeltaMs < cadenceMs)) {
            throw new Error(`The immediate trusted RMB handler delta crossed the ${cadenceMs}ms cadence (${handlerDeltaMs}ms)`);
          }
          const firstLaunch = launches.find((event: any) => event.ordinal === 0) ?? null;
          const admission = snapshot.killstreakControlAdmission;
          if (firstLaunch && admission?.sequence !== firstLaunch.controlSequence + 1) {
            throw new Error(`The immediate second RMB admission was not the exact successor of the first launch: ${JSON.stringify(latest)}`);
          }
          if (entity.missileAmmo === 5
            && drops.length === 1
            && drops[0]?.ordinal === 0
            && launches.length === 1
            && firstLaunch
            && admission?.missileFire === true
            && admission.accepted === true) {
            observer.firstMissileReceipt ??= latest;
          }
        }
        if (now < observer.deadlineAtMs
          && observer.firstMissileReceipt
          && entity.missileAmmo === 5
          && entity.missileCooldownMs === 0
          && drops.length === 1
          && launches.length === 1) {
          finish({ ...latest, firstMissileReceipt: observer.firstMissileReceipt });
          return;
        }
        if (now >= observer.deadlineAtMs) {
          throw new Error(`The trusted first Chopper missile transaction did not reach cooldown-ready within 3000ms: ${JSON.stringify(latest)}`);
        }
        scheduleInspect();
      } catch (error) {
        fail(error);
      }
    };
    const onDeadline = () => {
      if (observer.settled || observer.deadlineAtMs === null) return;
      const remainingMs = observer.deadlineAtMs - performance.now();
      if (remainingMs > 0) {
        observer.watchdogId = window.setTimeout(onDeadline, remainingMs);
        return;
      }
      inspect();
    };
    const onTrustedRightDown = (event: MouseEvent) => {
      if (event.button !== 2 || event.isTrusted !== true) return;
      if (event.eventPhase !== Event.CAPTURING_PHASE || event.currentTarget !== window) {
        fail(new Error('The Chopper missile observer received RMB outside the trusted window capture phase'));
        return;
      }
      if (observer.trustedRightDowns.length >= 2) {
        fail(new Error('The first Chopper missile observer received more than two trusted RMB edges'));
        return;
      }
      const observedAtMs = performance.now();
      const projectedRemainingLifetimeMs = armedRemainingLifetimeMs - (observedAtMs - armedAtMs);
      if (!(projectedRemainingLifetimeMs > minimumEvidenceLifetimeMs)) {
        fail(new Error(`The trusted Chopper missile input arrived without enough exact activation lifetime for the unchanged cadence: ${JSON.stringify({
          entityId: id,
          activationId: activation,
          armedAtMs,
          armedRemainingLifetimeMs,
          observedAtMs,
          projectedRemainingLifetimeMs,
          cadenceMs,
          minimumEvidenceLifetimeMs,
        })}`));
        return;
      }
      observer.trustedRightDowns.push(Object.freeze({
        eventTimestampMs: event.timeStamp,
        observedAtMs,
        eventPhase: event.eventPhase,
        remainingLifetimeMs: projectedRemainingLifetimeMs,
      }));
      if (observer.deadlineAtMs === null) {
        observer.deadlineAtMs = observedAtMs + 3_000;
        observer.watchdogId = window.setTimeout(onDeadline, 3_000);
      }
      // The observer runs at window capture before the canvas input owner.
      // Inspect in a microtask after propagation so the exact launch/admission
      // can be retained before any later starved timer or natural expiry.
      schedulePostPropagationInspect();
    };
    observer.cancel = (message: string) => fail(new Error(message));
    observer.dispose = dispose;
    window.addEventListener('mousedown', onTrustedRightDown, true);
    void promise.catch(() => undefined);
    (globalThis as any)[key] = observer;
  }, {
    key: FIRST_CHOPPER_MISSILE_OBSERVER_KEY,
    id: entityId,
    activation: activationId,
    cadenceMs: CHOPPER_MISSILE_CADENCE_MS,
    minimumEvidenceLifetimeMs: MINIMUM_CHOPPER_MISSILE_EVIDENCE_LIFETIME_MS,
  });
}

async function awaitFirstChopperMissileObserver(
  page: Page,
  entityId: string,
  activationId: string,
) {
  return page.evaluate(async ({ key, id, activation }) => {
    const observer = (globalThis as any)[key];
    if (!observer || observer.entityId !== id || observer.activationId !== activation) {
      throw new Error('The exact first Chopper missile observer is unavailable');
    }
    try {
      return await observer.promise;
    } finally {
      observer.dispose();
      if ((globalThis as any)[key] === observer) delete (globalThis as any)[key];
    }
  }, { key: FIRST_CHOPPER_MISSILE_OBSERVER_KEY, id: entityId, activation: activationId });
}

async function cancelFirstChopperMissileObserver(
  page: Page,
  entityId: string,
  activationId: string,
): Promise<void> {
  await page.evaluate(({ key, id, activation }) => {
    const observer = (globalThis as any)[key];
    if (observer?.entityId === id && observer.activationId === activation) {
      observer.cancel('The trusted first Chopper missile transaction was cancelled after input or protocol failure');
      if ((globalThis as any)[key] === observer) delete (globalThis as any)[key];
    }
  }, { key: FIRST_CHOPPER_MISSILE_OBSERVER_KEY, id: entityId, activation: activationId });
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
    const trustedInputs: Array<{
      type: string;
      button: number;
      trusted: boolean;
      observedAtMs: number;
      eventTimestampMs: number;
    }> = [];
    (globalThis as any).__PASS71_CONTROLLED_SUPPORT_INPUTS__ = trustedInputs;
    for (const type of ['mousedown', 'mouseup'] as const) {
      window.addEventListener(type, (event) => trustedInputs.push({
        type,
        button: event.button,
        trusted: event.isTrusted,
        observedAtMs: performance.now(),
        eventTimestampMs: event.timeStamp,
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
  const missileInputBounds = await page.locator('#game').boundingBox();
  if (!missileInputBounds) throw new Error('Game canvas has no trusted Chopper missile input bounds');
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateDormantReinforcement())).toMatchObject({ activated: true });

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper'))).toBe(true);
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting'), undefined, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await page.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'chopper-gunner');
  await ensurePointerLock(page);

  const gunCadenceDwell = await page.evaluate(async (cadenceMs) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const before = debug.snapshot() as any;
    const possession = before.killstreak.actors
      .find((actor: any) => actor.actorId === before.player.id)?.possession ?? null;
    const entity = before.killstreak.entities
      .find((candidate: any) => candidate.id === possession?.entityId) ?? null;
    const startedAtMs = performance.now();
    const accepted = debug.requestPossessedChopperEvidenceControl({ fire: false });
    try {
      await new Promise<void>((resolveDelay) => window.setTimeout(resolveDelay, cadenceMs));
      const after = debug.snapshot() as any;
      const currentPossession = after.killstreak.actors
        .find((actor: any) => actor.actorId === after.player.id)?.possession ?? null;
      const currentEntity = after.killstreak.entities
        .find((candidate: any) => candidate.id === entity?.id) ?? null;
      return {
        accepted,
        fire: false,
        elapsedMs: performance.now() - startedAtMs,
        entityId: entity?.id ?? null,
        activationId: entity?.activationId ?? null,
        currentPossession,
        currentEntityId: currentEntity?.id ?? null,
        currentActivationId: currentEntity?.activationId ?? null,
        remainingLifetimeMs: currentEntity?.expiresInMs ?? 0,
        triggerHeld: after.textChat.triggerHeld,
      };
    } finally {
      debug.releasePossessedChopperEvidenceControl();
    }
  }, CHOPPER_GUN_PROFILE.cadenceMs);
  expect(gunCadenceDwell).toMatchObject({
    accepted: true,
    fire: false,
    currentPossession: { kind: 'chopper-gunner', entityId: gunCadenceDwell.entityId },
    currentEntityId: gunCadenceDwell.entityId,
    currentActivationId: gunCadenceDwell.activationId,
    triggerHeld: false,
  });
  expect(gunCadenceDwell.elapsedMs).toBeGreaterThanOrEqual(CHOPPER_GUN_PROFILE.cadenceMs);
  expect(gunCadenceDwell.remainingLifetimeMs).toBeGreaterThan(5_000);

  const stagedSplash = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stagePossessedChopperSplashTargets());
  expect(stagedSplash).not.toBeNull();
  if (!stagedSplash) throw new Error('No authoritative two-bot Chopper splash stage was available');
  expect(stagedSplash.entityId).toBe(gunCadenceDwell.entityId);
  expect(stagedSplash.activationId).toBe(gunCadenceDwell.activationId);
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

  await page.evaluate(({ staged, baseline }) => {
    const key = '__PASS71_CHOPPER_SPLASH_OBSERVER__';
    if ((globalThis as any)[key]) throw new Error('A Chopper splash observer is already armed');
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const observerArmedAtMs = performance.now();
    const observer: any = {
      entityId: staged.entityId,
      activationId: staged.activationId,
      observerArmedAtMs,
      trustedTriggerAtMs: null,
      deadlineAtMs: null,
      watchdogId: null,
      latest: null,
      settled: false,
      promise: null,
      cancel: null,
      dispose: null,
    };
    observer.promise = new Promise((resolveReceipt, rejectReceipt) => {
      const dispose = () => {
        if (observer.watchdogId !== null) {
          clearTimeout(observer.watchdogId);
          observer.watchdogId = null;
        }
        window.removeEventListener('mousedown', onTrustedMouseDown, true);
        debug.clearPossessedChopperAimTarget();
      };
      const finish = (receipt: any) => {
        if (observer.settled) return;
        observer.settled = true;
        dispose();
        resolveReceipt(receipt);
      };
      const fail = (error: unknown) => {
        if (observer.settled) return;
        observer.settled = true;
        dispose();
        rejectReceipt(error);
      };
      const inspect = () => {
        if (observer.settled) return;
        try {
          if (performance.now() >= observer.deadlineAtMs) {
            onDeadline();
            return;
          }
          const aim = debug.readPossessedChopperAlignedAimReceipt();
          const snapshot = debug.snapshot() as any;
          const entity = snapshot.killstreak.entities
            .find((candidate: any) => candidate.id === staged.entityId) ?? null;
          const possession = snapshot.killstreak.actors
            .find((actor: any) => actor.actorId === snapshot.player.id)?.possession ?? null;
          if (aim && (!entity || entity.activationId !== staged.activationId || !(entity.expiresInMs > 0))) {
            throw new Error('A valid Chopper aim receipt did not retain its activation identity');
          }
          const recent = snapshot.supportDamageFeedback.recent.filter((sample: any) => (
            aim
              && sample.source === 'chopper'
              && sample.activationId === staged.activationId
              && sample.atMs >= aim.controlAdmissionAtMs
              && sample.atMs <= observer.deadlineAtMs
          ));
          const primary = recent.find((sample: any) => (
            sample.targetId === staged.primaryTargetId
              && sample.targetLifeId === staged.primaryTargetLifeId
          ));
          const splash = recent.find((sample: any) => (
            sample.targetId === staged.splashTargetId
              && sample.targetLifeId === staged.splashTargetLifeId
          ));
          observer.latest = {
            aim,
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
            observerEntityId: staged.entityId,
            observerActivationId: staged.activationId,
            observerArmedAtMs,
            trustedTriggerAtMs: observer.trustedTriggerAtMs,
            deadlineAtMs: observer.deadlineAtMs,
            trustedLeftDown: (globalThis as any).__PASS71_CONTROLLED_SUPPORT_INPUTS__
              .some((event: any) => event.type === 'mousedown' && event.button === 0 && event.trusted === true),
          };
          if (aim && primary && splash) {
            finish(observer.latest);
            return;
          }
          requestAnimationFrame(inspect);
        } catch (error) {
          fail(error);
        }
      };
      const onDeadline = () => {
        if (observer.settled) return;
        const remainingMs = observer.deadlineAtMs - performance.now();
        if (remainingMs > 0) {
          observer.watchdogId = window.setTimeout(onDeadline, remainingMs);
          return;
        }
        fail(new Error(`Trusted Chopper splash trigger produced no exact admitted damage receipt within 2500ms: ${JSON.stringify(observer.latest)}`));
      };
      const onTrustedMouseDown = (event: MouseEvent) => {
        if (event.button !== 0 || event.isTrusted !== true) return;
        window.removeEventListener('mousedown', onTrustedMouseDown, true);
        try {
          observer.trustedTriggerAtMs = performance.now();
          observer.deadlineAtMs = observer.trustedTriggerAtMs + 2_500;
          const armed = debug.armPossessedChopperAimTarget(event, {
            entityId: staged.entityId,
            activationId: staged.activationId,
            targetId: staged.primaryTargetId,
            deadlineAtMs: observer.deadlineAtMs,
          });
          if (!armed) throw new Error('Trusted Chopper splash trigger could not arm staged primary aim');
          const snapshot = debug.snapshot() as any;
          const possession = snapshot.killstreak.actors
            .find((actor: any) => actor.actorId === snapshot.player.id)?.possession ?? null;
          const entity = snapshot.killstreak.entities
            .find((candidate: any) => candidate.id === staged.entityId) ?? null;
          if (possession?.kind !== 'chopper-gunner'
            || possession.entityId !== staged.entityId
            || entity?.activationId !== staged.activationId
            || !(entity.expiresInMs > 0)) {
            throw new Error('Trusted Chopper splash trigger did not retain the staged possession identity');
          }
          observer.watchdogId = window.setTimeout(onDeadline, 2_500);
          requestAnimationFrame(inspect);
        } catch (error) {
          fail(error);
        }
      };
      observer.cancel = (message: string) => {
        fail(new Error(message));
        if ((globalThis as any)[key] === observer) delete (globalThis as any)[key];
      };
      observer.dispose = dispose;
      window.addEventListener('mousedown', onTrustedMouseDown, true);
    });
    void observer.promise.catch(() => undefined);
    (globalThis as any)[key] = observer;
  }, { staged: stagedSplash, baseline: splashBaseline });
  let splashReceipt: any;
  try {
    await page.mouse.down({ button: 'left' });
    splashReceipt = await page.evaluate(async ({ entityId, activationId }) => {
      const key = '__PASS71_CHOPPER_SPLASH_OBSERVER__';
      const observer = (globalThis as any)[key];
      if (!observer || observer.entityId !== entityId || observer.activationId !== activationId) {
        throw new Error('Chopper splash observer was not armed for the active possession identity');
      }
      if (observer.trustedTriggerAtMs === null) {
        observer.cancel('Trusted Chopper splash mousedown was not observed after input admission');
      }
      try {
        return await observer.promise;
      } finally {
        observer.dispose();
        if ((globalThis as any)[key] === observer) delete (globalThis as any)[key];
      }
    }, { entityId: stagedSplash.entityId, activationId: stagedSplash.activationId });
  } catch (error) {
    await page.evaluate(({ entityId, activationId }) => {
      const key = '__PASS71_CHOPPER_SPLASH_OBSERVER__';
      const observer = (globalThis as any)[key];
      if (observer?.entityId === entityId && observer.activationId === activationId) {
        observer.cancel('Trusted Chopper splash transaction was cancelled after input or protocol failure');
      }
    }, { entityId: stagedSplash.entityId, activationId: stagedSplash.activationId }).catch(() => undefined);
    await page.mouse.up({ button: 'left' }).catch(() => undefined);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearPossessedChopperAimTarget()).catch(() => undefined);
    throw error;
  }
  await page.mouse.up({ button: 'left' });
  const missileArmReceipt = await page.evaluate(({ entityId, activationId }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.clearPossessedChopperAimTarget();
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
  expect(splashReceipt.aim).not.toBeNull();
  await armFirstChopperMissileObserver(
    page,
    stagedSplash.entityId,
    stagedSplash.activationId,
  );
  const firstMissileWallClockMs = Date.now();
  let cooldownReady: any;
  try {
    await page.mouse.dblclick(
      missileInputBounds.x + missileInputBounds.width / 2,
      missileInputBounds.y + missileInputBounds.height / 2,
      { button: 'right', delay: 0 },
    );
    cooldownReady = await awaitFirstChopperMissileObserver(
      page,
      stagedSplash.entityId,
      stagedSplash.activationId,
    );
  } catch (error) {
    await cancelFirstChopperMissileObserver(
      page,
      stagedSplash.entityId,
      stagedSplash.activationId,
    ).catch(() => undefined);
    throw error;
  }
  expect(splashReceipt.aim).toMatchObject({
    contract: 'chopper-gunner-trusted-aligned-aim-v1',
    entityId: stagedSplash.entityId,
    activationId: stagedSplash.activationId,
    targetId: stagedSplash.primaryTargetId,
    targetLifeId: stagedSplash.primaryTargetLifeId,
    controlAction: 'pilot-control',
    controlReason: 'accepted',
    missileFire: false,
    fireAuthority: 'native-trigger-held',
    triggerHeld: true,
    controlAccepted: true,
    selectedAsPrimary: true,
    maximumRangeM: CHOPPER_GUN_PROFILE.maximumRangeM,
    splashRadiusM: CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM,
    lineOfSight: true,
  });
  expect(splashReceipt.trustedLeftDown).toBe(true);
  expect(splashReceipt).toMatchObject({
    possession: { kind: 'chopper-gunner', entityId: stagedSplash.entityId },
    entityId: stagedSplash.entityId,
    activationId: stagedSplash.activationId,
    observerEntityId: stagedSplash.entityId,
    observerActivationId: stagedSplash.activationId,
  });
  expect(splashReceipt.trustedTriggerAtMs).toBeGreaterThanOrEqual(splashReceipt.observerArmedAtMs);
  expect(splashReceipt.deadlineAtMs - splashReceipt.trustedTriggerAtMs).toBe(2_500);
  expect(splashReceipt.aim.trustedEventTimestampMs).toBeLessThanOrEqual(splashReceipt.aim.armedAtMs);
  expect(splashReceipt.aim.armedAtMs).toBeGreaterThanOrEqual(splashReceipt.trustedTriggerAtMs);
  expect(splashReceipt.aim.controlAdmissionAtMs).toBe(splashReceipt.aim.alignedAtMs);
  expect(splashReceipt.aim.consumedAtMs).toBe(splashReceipt.aim.controlAdmissionAtMs);
  expect(splashReceipt.aim.controlAdmissionAtMs).toBeGreaterThanOrEqual(splashReceipt.aim.armedAtMs);
  expect(splashReceipt.aim.controlAdmissionAtMs).toBeLessThanOrEqual(splashReceipt.deadlineAtMs);
  expect(Number.isSafeInteger(splashReceipt.aim.controlSequence)).toBe(true);
  expect(splashReceipt.aim.controlSequence).toBeGreaterThan(0);
  if (splashReceipt.aim.minimumControlEligibleAtMs !== null) {
    expect(splashReceipt.aim.controlAdmissionAtMs)
      .toBeGreaterThanOrEqual(splashReceipt.aim.minimumControlEligibleAtMs);
  }
  expect(splashReceipt.aim.entryDistanceM).toBeLessThanOrEqual(CHOPPER_GUN_PROFILE.maximumRangeM);
  expect(splashReceipt.aim.radialDistanceM).toBeLessThanOrEqual(CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM);
  expect(splashReceipt.remainingLifetimeMs).toBeGreaterThan(0);
  expect(splashReceipt.triggerHeld).toBe(true);
  expect(splashReceipt.primaryHealth).toBeLessThan(splashBaseline.primaryHealth);
  expect(splashReceipt.splashHealth).toBeLessThan(splashBaseline.splashHealth);
  expect(splashReceipt.primary.atMs).toBe(splashReceipt.splash.atMs);
  expect(splashReceipt.primary.atMs).toBeGreaterThanOrEqual(splashReceipt.aim.controlAdmissionAtMs);
  expect(splashReceipt.primary.atMs).toBeLessThanOrEqual(splashReceipt.deadlineAtMs);
  expect(splashReceipt.primary.activationId).toBe(splashReceipt.splash.activationId);
  expect(splashReceipt.primary.targetLifeId).toBe(stagedSplash.primaryTargetLifeId);
  expect(splashReceipt.splash.targetLifeId).toBe(stagedSplash.splashTargetLifeId);
  expect(splashReceipt.primary.origin).toEqual(splashReceipt.aim.origin);
  expect(splashReceipt.splash.origin).toEqual(splashReceipt.aim.origin);
  expect(splashReceipt.primary.endpoint).toEqual(splashReceipt.aim.endpoint);
  expect(splashReceipt.splash.endpoint).toEqual(splashReceipt.aim.endpoint);
  expect(splashReceipt.primary.tracerOrigin).toEqual(splashReceipt.aim.tracerOrigin);
  expect(splashReceipt.splash.tracerOrigin).toEqual(splashReceipt.aim.tracerOrigin);
  expect(splashReceipt.primary.damage).toBeGreaterThan(0);
  expect(splashReceipt.splash.damage).toBeGreaterThan(0);

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
  expect(firstMissile.trustedRightDowns).toHaveLength(2);
  const [firstTrustedRightDown, secondTrustedRightDown] = firstMissile.trustedRightDowns;
  expect(firstTrustedRightDown).toMatchObject({ eventPhase: 1 });
  expect(secondTrustedRightDown).toMatchObject({ eventPhase: 1 });
  expect(firstTrustedRightDown.eventTimestampMs).toBeLessThanOrEqual(firstTrustedRightDown.observedAtMs);
  expect(secondTrustedRightDown.eventTimestampMs).toBeLessThanOrEqual(secondTrustedRightDown.observedAtMs);
  expect(firstTrustedRightDown.remainingLifetimeMs).toBeGreaterThan(MINIMUM_CHOPPER_MISSILE_EVIDENCE_LIFETIME_MS);
  expect(secondTrustedRightDown.remainingLifetimeMs).toBeGreaterThan(MINIMUM_CHOPPER_MISSILE_EVIDENCE_LIFETIME_MS);
  expect(secondTrustedRightDown.observedAtMs - firstTrustedRightDown.observedAtMs)
    .toBeLessThan(CHOPPER_MISSILE_CADENCE_MS);
  expect(firstAuthority.launchAtMs).toBeGreaterThanOrEqual(firstTrustedRightDown.observedAtMs);
  expect(secondTrustedRightDown.observedAtMs)
    .toBeLessThan(firstAuthority.launchAtMs + CHOPPER_MISSILE_CADENCE_MS);
  expect(firstMissile.controlAdmission.atMs).toBeGreaterThanOrEqual(secondTrustedRightDown.observedAtMs);
  expect(cooldownReady.deadlineAtMs - firstTrustedRightDown.observedAtMs).toBe(3_000);
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
