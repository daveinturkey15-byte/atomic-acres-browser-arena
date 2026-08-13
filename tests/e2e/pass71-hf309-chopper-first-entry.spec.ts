import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  captureFrameActionBaseline,
  deriveFrameActionBudget,
  MAXIMUM_ACTION_FRAME_BUDGETS,
  MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS,
  minimumActionFrameSamples,
  NATIVE_NO_FREEZE_FRAME_ACTION_MODE,
  TARGET_FRAME_BUDGET_MS,
  type FrameActionBaseline,
  type FrameActionBudget,
} from './frame-action-budget';

type Renderer = 'webgl2' | 'webgpu';
type ResourceSignature = Readonly<{
  supportAssets: readonly string[];
  supportFamilies: readonly string[];
  supportTextureCounts: readonly number[];
  poolCounts: readonly number[];
  pooledChopperActions: readonly string[];
  rotorOwnedResources: readonly number[];
  audioRetainedSources: number;
  audioSpatialChains: number;
  hudNodeCount: number;
  hudIdentityToken: string;
  rendererPrewarmGeneration: number | null;
  rendererPrewarmGroups: readonly string[];
}>;
type KeyEventProof = Readonly<{
  code: string;
  key: string;
  isTrusted: boolean;
  repeat: boolean;
  atMs: number;
}>;
type EntryReceipt = Readonly<{
  phase: 'first' | 'warm';
  baseline: FrameActionBaseline;
  budget: FrameActionBudget;
  keyEvent: KeyEventProof;
  startedAtMs: number;
  handlerReturnedAtMs: number;
  handlerSyncMs: number;
  eventToNextAnimationFrameMs: number;
  eventToNextPresentedFrameMs: number;
  firstSubmissionDelayMs: number;
  firstCompletionDelayMs: number;
  maximumAnimationFrameGapMs: number;
  maximumPendingForMs: number;
  frameSamples: number;
  startingPresentedFrame: number;
  endingPresentedFrame: number;
  startingSubmissionSequence: number;
  startingCompletedSequence: number;
  targetSubmissionSequence: number;
  endingSubmissionSequence: number;
  endingCompletedSequence: number;
  completionFailures: number;
  presentationStatus: string;
  controlAdmission: unknown;
  beforePossession: null;
  afterHandlerPossession: string;
  endingPossession: string;
  hud: Readonly<{
    hiddenBefore: boolean;
    hiddenAfter: boolean;
    samePreparedNode: boolean;
    supportKind: string;
    requiredNodesPresent: boolean;
  }>;
  firstPerson: unknown;
  resourcesBefore: ResourceSignature;
  resourcesAfterHandler: ResourceSignature;
  resourcesAfterObservation: ResourceSignature;
}>;

const nativeRun = process.env.PASS71_HF309_NATIVE === '1';
const renderer: Renderer = process.env.PASS71_HF309_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const expectedSourceSha = process.env.PASS71_HF309_SOURCE_SHA;
const componentPath = process.env.PASS71_HF309_COMPONENT_PATH;
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});
const requiredHudIds = Object.freeze([
  'gunner-cockpit-hud',
  'gunner-platform',
  'gunner-weapon-mode',
  'gunner-target-confirm',
  'gunner-missile-status',
  'gunner-missile-ammo',
  'gunner-missile-cooldown',
  'gunner-hull',
  'gunner-ammo',
  'gunner-altitude',
  'gunner-speed',
  'gunner-time',
  'gunner-damage',
  'chopper-thermal',
]);
const expectedSupportAssets = Object.freeze([
  './assets/original/models/support/pass65-care-aircraft-lod0.glb',
  './assets/original/models/support/pass65-care-aircraft-lod1.glb',
  './assets/original/models/support/pass65-care-aircraft-lod2.glb',
  './assets/original/models/support/pass65-care-crate-lod0.glb',
  './assets/original/models/support/pass65-care-crate-lod1.glb',
  './assets/original/models/support/pass65-carpet-aircraft-lod0.glb',
  './assets/original/models/support/pass65-carpet-aircraft-lod1.glb',
  './assets/original/models/support/pass65-carpet-aircraft-lod2.glb',
  './assets/original/models/support/pass65-chopper-gunner-lod0.glb',
  './assets/original/models/support/pass65-chopper-gunner-lod1.glb',
  './assets/original/models/support/pass65-chopper-gunner-lod2.glb',
]);
const expectedWebGpuPrewarmGroups = Object.freeze([
  'tracers-impacts',
  'explosions',
  'death-drops-glass',
  'world-ordnance',
  'nuke-overdrive-bolts',
  'smoke-volumes',
  'bot-world-weapons',
  'flare-first-shot',
  'flamethrower-first-shot',
  'killstreak-vocabulary',
]);

test.skip(!nativeRun, 'HF-309 closing evidence is emitted only by its clean exact-SHA installed-Edge runner');

function checkoutSourceSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
}

async function candidateProvenance(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HF-309 candidate provenance request failed: ${response.status}`);
    const value = await response.json() as Record<string, unknown>;
    return {
      schemaVersion: value.schemaVersion,
      channel: value.channel,
      releasePass: value.releasePass,
      sourceSha: value.sourceSha,
      path: value.path,
      treeSha256: value.treeSha256,
      exactRootFileCount: value.exactRootFileCount,
    };
  });
}

async function installResourceSampler(page: Page): Promise<void> {
  await page.evaluate((ids) => {
    const root = window as any;
    const hud = document.querySelector<HTMLElement>('#gunner-cockpit-hud');
    if (!hud) throw new Error('HF-309 requires the prepared Chopper HUD before activation');
    root.__PASS71_HF309_HUD_REFERENCE__ = hud;
    root.__PASS71_HF309_HUD_TOKEN__ = crypto.randomUUID();
    root.__PASS71_HF309_RESOURCE_SIGNATURE__ = (): ResourceSignature => {
      const snapshot = root.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const support = snapshot.supportVehiclePresentation;
      const presentation = snapshot.killstreakPresentation;
      const rotor = snapshot.audio.support.chopperRotorPrewarm;
      const rendererPrewarm = snapshot.bootstrap.effectPrewarmProfile;
      const preparedHud = root.__PASS71_HF309_HUD_REFERENCE__ as HTMLElement;
      return {
        supportAssets: [...support.loadedAssets].sort(),
        supportFamilies: [...support.readyFamilies].sort(),
        supportTextureCounts: [
          support.textureDedup.canonicalTextureCount,
          support.textureDedup.reusedTextureCount,
          support.textureDedup.disposedDuplicateTextureCount,
          support.textureDedup.closedDuplicateImageCount,
          support.textureDedup.ineligibleTextureCount,
          support.textureDedup.estimatedActiveTextureBytes,
          support.textureDedup.estimatedAvoidedTextureBytes,
        ],
        poolCounts: [
          presentation.prewarmed,
          presentation.pooledEntityInstances,
          presentation.pooledSwarmDrones,
        ],
        pooledChopperActions: [...presentation.pooledChopperActionNames].sort(),
        rotorOwnedResources: [
          rotor.runs,
          rotor.capacity,
          rotor.sources,
          rotor.nodes,
          rotor.factoryCalls,
          rotor.retainedBroadbandLoops,
        ],
        audioRetainedSources: snapshot.audio.runtime.retainedSources,
        audioSpatialChains: snapshot.audio.runtime.spatialChains,
        hudNodeCount: preparedHud.querySelectorAll('*').length,
        hudIdentityToken: root.__PASS71_HF309_HUD_TOKEN__,
        rendererPrewarmGeneration: rendererPrewarm?.sceneGeneration ?? null,
        rendererPrewarmGroups: rendererPrewarm?.groups?.map((group: any) => group.name) ?? [],
      };
    };
    root.__PASS71_HF309_HUD_STATE__ = () => ({
      hidden: hud.hidden,
      connected: hud.isConnected,
      supportKind: hud.dataset.supportKind ?? 'none',
      samePreparedNode: document.querySelector('#gunner-cockpit-hud')
        === root.__PASS71_HF309_HUD_REFERENCE__,
      requiredNodesPresent: ids.every((id) => document.getElementById(id) !== null),
      descendantCount: hud.querySelectorAll('*').length,
    });
  }, requiredHudIds);
}

async function resourceSignature(page: Page): Promise<ResourceSignature> {
  return page.evaluate(() => (window as any).__PASS71_HF309_RESOURCE_SIGNATURE__());
}

async function armKeyRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = window as any;
    root.__PASS71_HF309_KEY_EVENTS__ = [];
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Digit6' || event.repeat) return;
      root.__PASS71_HF309_KEY_EVENTS__.push({
        code: event.code,
        key: event.key,
        isTrusted: event.isTrusted,
        repeat: event.repeat,
        atMs: Number(performance.now().toFixed(3)),
      });
    }, { capture: true });
  });
}

async function keyEvents(page: Page): Promise<KeyEventProof[]> {
  return page.evaluate(() => [...(window as any).__PASS71_HF309_KEY_EVENTS__]);
}

async function captureEntry(page: Page, phase: 'first' | 'warm'): Promise<EntryReceipt> {
  const baseline = await captureFrameActionBaseline(page, `hf309-${renderer}-${phase}-preentry-baseline`);
  const budget = deriveFrameActionBudget(baseline, NATIVE_NO_FREEZE_FRAME_ACTION_MODE);
  await page.evaluate(({ minimumSamples, actionPhase, requestedRenderer }) => {
    const root = window as any;
    root.__PASS71_HF309_ENTRY_PROMISE__ = new Promise((resolveEntry, rejectEntry) => {
      let handled = false;
      const onKeyDown = (event: KeyboardEvent) => {
        if (handled || event.code !== 'Digit6' || event.repeat) return;
        handled = true;
        window.removeEventListener('keydown', onKeyDown, true);
        const keyEvent = root.__PASS71_HF309_KEY_EVENTS__.at(-1) as KeyEventProof | undefined;
        if (!keyEvent || keyEvent.code !== event.code || keyEvent.key !== event.key
          || keyEvent.isTrusted !== true || keyEvent.repeat !== false) {
          rejectEntry(new Error(`HF-309 ${actionPhase} did not bind to the trusted slot recorder`));
          return;
        }
        const debug = root.__ATOMIC_ACRES_DEBUG__;
        const startedAtMs = keyEvent.atMs;
        const startingPresentation = debug.samplePresentationTelemetry() as any;
        const startingSnapshot = debug.snapshot() as any;
        const startingPresentedFrame = debug.admissionState().presentedGameplayFrame as number;
        const actor = startingSnapshot.killstreak.actors.find(
          (candidate: any) => candidate.actorId === startingSnapshot.player.id,
        );
        const resourcesBefore = root.__PASS71_HF309_RESOURCE_SIGNATURE__();
        const hudBefore = root.__PASS71_HF309_HUD_STATE__();
        let handlerReturnedAtMs: number | null = null;
        let afterHandlerPossession = 'pending';
        let resourcesAfterHandler: ResourceSignature | null = null;
        let firstPersonAfterHandler: unknown = null;
        let hudAfterHandler: any = null;
        let controlAdmissionAfterHandler: unknown = null;
        let previousAnimationFrameAt = startedAtMs;
        let eventToNextAnimationFrameMs: number | null = null;
        let eventToNextPresentedFrameMs: number | null = null;
        let firstSubmissionDelayMs: number | null = null;
        let firstCompletionDelayMs: number | null = null;
        let targetSubmissionSequence: number | null = requestedRenderer === 'webgl2' ? 0 : null;
        let maximumAnimationFrameGapMs = 0;
        let maximumPendingForMs = Number(startingPresentation.pendingForMs);
        let frameSamples = 0;
        let endingPresentedFrame = startingPresentedFrame;
        let endingPresentation = startingPresentation;
        const deadline = startedAtMs + 2_000;
        const rounded = (value: number) => Number(value.toFixed(3));

        queueMicrotask(() => {
          handlerReturnedAtMs = performance.now();
          const after = debug.snapshot() as any;
          const afterActor = after.killstreak.actors.find((candidate: any) => candidate.actorId === after.player.id);
          afterHandlerPossession = afterActor?.possession?.kind ?? 'none';
          resourcesAfterHandler = root.__PASS71_HF309_RESOURCE_SIGNATURE__();
          firstPersonAfterHandler = after.killstreakPresentation.firstPersonSightline;
          hudAfterHandler = root.__PASS71_HF309_HUD_STATE__();
          controlAdmissionAfterHandler = after.killstreakControlAdmission;
        });

        const inspect = (frameAt: number) => {
          frameSamples += 1;
          if (eventToNextAnimationFrameMs === null) eventToNextAnimationFrameMs = frameAt - startedAtMs;
          maximumAnimationFrameGapMs = Math.max(maximumAnimationFrameGapMs, frameAt - previousAnimationFrameAt);
          previousAnimationFrameAt = frameAt;
          endingPresentedFrame = debug.admissionState().presentedGameplayFrame as number;
          endingPresentation = debug.samplePresentationTelemetry() as any;
          maximumPendingForMs = Math.max(maximumPendingForMs, Number(endingPresentation.pendingForMs));
          const elapsedMs = frameAt - startedAtMs;
          if (eventToNextPresentedFrameMs === null && endingPresentedFrame > startingPresentedFrame) {
            eventToNextPresentedFrameMs = elapsedMs;
          }
          if (requestedRenderer === 'webgl2' && firstSubmissionDelayMs === null) {
            firstSubmissionDelayMs = elapsedMs;
            firstCompletionDelayMs = elapsedMs;
          } else if (requestedRenderer === 'webgpu' && targetSubmissionSequence === null
            && endingPresentation.submissionSequence > startingPresentation.submissionSequence) {
            targetSubmissionSequence = endingPresentation.submissionSequence;
            firstSubmissionDelayMs = elapsedMs;
          }
          if (requestedRenderer === 'webgpu' && firstCompletionDelayMs === null && targetSubmissionSequence !== null
            && endingPresentation.completedSequence >= targetSubmissionSequence) {
            firstCompletionDelayMs = elapsedMs;
          }
          const complete = elapsedMs >= 350
            && frameSamples >= minimumSamples
            && handlerReturnedAtMs !== null
            && resourcesAfterHandler !== null
            && eventToNextAnimationFrameMs !== null
            && eventToNextPresentedFrameMs !== null
            && firstSubmissionDelayMs !== null
            && firstCompletionDelayMs !== null
            && targetSubmissionSequence !== null;
          if (complete) {
            const endingSnapshot = debug.snapshot() as any;
            const endingActor = endingSnapshot.killstreak.actors.find(
              (candidate: any) => candidate.actorId === endingSnapshot.player.id,
            );
            const hudAfter = root.__PASS71_HF309_HUD_STATE__();
            resolveEntry({
              phase: actionPhase,
              keyEvent,
              startedAtMs: rounded(startedAtMs),
              handlerReturnedAtMs: rounded(handlerReturnedAtMs!),
              handlerSyncMs: rounded(handlerReturnedAtMs! - startedAtMs),
              eventToNextAnimationFrameMs: rounded(eventToNextAnimationFrameMs!),
              eventToNextPresentedFrameMs: rounded(eventToNextPresentedFrameMs!),
              firstSubmissionDelayMs: rounded(firstSubmissionDelayMs!),
              firstCompletionDelayMs: rounded(firstCompletionDelayMs!),
              maximumAnimationFrameGapMs: rounded(maximumAnimationFrameGapMs),
              maximumPendingForMs: rounded(maximumPendingForMs),
              frameSamples,
              startingPresentedFrame,
              endingPresentedFrame,
              startingSubmissionSequence: startingPresentation.submissionSequence,
              startingCompletedSequence: startingPresentation.completedSequence,
              targetSubmissionSequence,
              endingSubmissionSequence: endingPresentation.submissionSequence,
              endingCompletedSequence: endingPresentation.completedSequence,
              completionFailures: endingPresentation.completionFailures,
              presentationStatus: endingPresentation.status,
              controlAdmission: controlAdmissionAfterHandler,
              beforePossession: actor?.possession?.kind ?? null,
              afterHandlerPossession,
              endingPossession: endingActor?.possession?.kind ?? 'none',
              hud: {
                hiddenBefore: hudBefore.hidden,
                hiddenAfter: hudAfter.hidden,
                samePreparedNode: hudBefore.samePreparedNode
                  && hudAfterHandler.samePreparedNode
                  && hudAfter.samePreparedNode,
                supportKind: hudAfter.supportKind,
                requiredNodesPresent: hudBefore.requiredNodesPresent
                  && hudAfterHandler.requiredNodesPresent
                  && hudAfter.requiredNodesPresent,
              },
              firstPerson: endingSnapshot.killstreakPresentation.firstPersonSightline ?? firstPersonAfterHandler,
              resourcesBefore,
              resourcesAfterHandler,
              resourcesAfterObservation: root.__PASS71_HF309_RESOURCE_SIGNATURE__(),
            });
            return;
          }
          if (frameAt >= deadline) {
            rejectEntry(new Error(`HF-309 ${actionPhase} possession did not complete a native frontier within 2000ms`));
            return;
          }
          requestAnimationFrame(inspect);
        };
        requestAnimationFrame(inspect);
      };
      window.addEventListener('keydown', onKeyDown, { capture: true });
    });
  }, {
    minimumSamples: minimumActionFrameSamples(NATIVE_NO_FREEZE_FRAME_ACTION_MODE),
    actionPhase: phase,
    requestedRenderer: renderer,
  });
  await page.keyboard.press('6');
  const receipt = await page.evaluate(() => (window as any).__PASS71_HF309_ENTRY_PROMISE__) as Omit<EntryReceipt, 'baseline' | 'budget'>;
  return { ...receipt, baseline, budget };
}

function assertEntry(receipt: EntryReceipt): void {
  const evidence = JSON.stringify(receipt);
  const hardActionMaximum = Number((TARGET_FRAME_BUDGET_MS * MAXIMUM_ACTION_FRAME_BUDGETS).toFixed(3));
  const hardSynchronousMaximum = Number(
    (TARGET_FRAME_BUDGET_MS * MAXIMUM_SYNCHRONOUS_ACTION_FRAME_BUDGETS).toFixed(3),
  );
  expect(receipt.budget, evidence).toMatchObject({
    evidenceMode: 'native-no-freeze',
    releaseAcceptanceModeEligible: true,
    targetFrameBudgetMs: Number(TARGET_FRAME_BUDGET_MS.toFixed(3)),
    maximumSynchronousActionMs: hardSynchronousMaximum,
  });
  expect(receipt.budget.maximumActionMs, evidence).toBeLessThanOrEqual(hardActionMaximum);
  expect(receipt.keyEvent, evidence).toMatchObject({ code: 'Digit6', key: '6', isTrusted: true, repeat: false });
  expect(receipt.handlerSyncMs, evidence).toBeLessThan(receipt.budget.maximumSynchronousActionMs);
  expect(receipt.eventToNextAnimationFrameMs, evidence).toBeLessThan(receipt.budget.maximumActionMs);
  expect(receipt.eventToNextPresentedFrameMs, evidence).toBeLessThan(receipt.budget.maximumActionMs);
  expect(receipt.firstSubmissionDelayMs, evidence).toBeLessThan(receipt.budget.maximumFirstSubmissionDelayMs);
  expect(receipt.firstCompletionDelayMs, evidence).toBeLessThan(receipt.budget.maximumFirstCompletionDelayMs);
  expect(receipt.maximumAnimationFrameGapMs, evidence).toBeLessThan(receipt.budget.maximumAnimationFrameGapMs);
  expect(receipt.maximumPendingForMs, evidence).toBeLessThan(receipt.budget.maximumPendingForMs);
  expect(receipt.frameSamples, evidence).toBeGreaterThanOrEqual(10);
  expect(receipt.endingPresentedFrame, evidence).toBeGreaterThan(receipt.startingPresentedFrame);
  expect(receipt.endingCompletedSequence, evidence).toBeGreaterThanOrEqual(receipt.targetSubmissionSequence);
  expect(receipt.completionFailures, evidence).toBe(0);
  expect(receipt.presentationStatus, evidence).toBe(renderer === 'webgpu' ? 'healthy' : 'synchronous');
  expect(receipt.controlAdmission, evidence).toMatchObject({
    action: 'toggle-chopper-gunner', accepted: true, reason: 'accepted',
  });
  expect(receipt.beforePossession, evidence).toBeNull();
  expect(receipt.afterHandlerPossession, evidence).toBe('chopper-gunner');
  expect(receipt.endingPossession, evidence).toBe('chopper-gunner');
  expect(receipt.hud, evidence).toEqual({
    hiddenBefore: true,
    hiddenAfter: false,
    samePreparedNode: true,
    supportKind: 'chopper-gunner',
    requiredNodesPresent: true,
  });
  expect(receipt.firstPerson, evidence).toMatchObject({
    presentationSource: 'project-original-blender-glb',
    visibleOutsideCockpit: [],
    dashboardVisible: true,
    displaysVisible: true,
    hudVisible: false,
    centreSightlineClear: true,
    weaponVisible: true,
    overlayLayerExclusive: true,
    alignment: { pivotErrorM: expect.any(Number) },
  });
  expect((receipt.firstPerson as any).alignment.pivotErrorM, evidence).toBeLessThan(0.001);
  expect(receipt.resourcesAfterHandler, evidence).toEqual(receipt.resourcesBefore);
  expect(receipt.resourcesAfterObservation, evidence).toEqual(receipt.resourcesBefore);
}

test(`${renderer}: HF-309 prepares every Chopper first-entry resource before trusted possession`, async ({ page }) => {
  test.setTimeout(120_000);
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '') || checkoutSourceSha() !== expectedSourceSha) {
    throw new Error('HF-309 browser component requires the exact expected candidate A checkout');
  }
  if (!componentPath) throw new Error('HF-309 browser component path is required');
  const faults: string[] = [];
  page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') faults.push(message.text());
  });
  await page.addInitScript((storedLoadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
    const root = window as any;
    root.__PASS71_HF309_SESSION_NONCE__ = crypto.randomUUID();
    root.__PASS71_HF309_SOLO_POINTER__ = null;
    window.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.id !== 'solo') return;
      root.__PASS71_HF309_SOLO_POINTER__ = {
        selector: '#solo', eventType: event.type, isTrusted: event.isTrusted,
        atMs: Number(performance.now().toFixed(3)),
      };
    }, { capture: true });
  }, loadout);
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  const startedAt = new Date().toISOString();
  await page.goto(
    `/?release=latest&map=gun-range&renderer=${renderer}${requireWebGpu}`
      + '&render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off'
      + `&seed=pass71-hf309-${renderer}`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 },
  );
  await page.waitForFunction(() => Boolean(
    (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 90_000 });
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
    return snapshot?.gameStarted === true
      && snapshot.matchPhase === 'active'
      && snapshot.bootstrap.stage === 'ready'
      && snapshot.supportVehiclePresentation?.state === 'ready'
      && snapshot.killstreakPresentation?.prewarmedAuthoredSupportFamilies?.includes('chopper')
      && snapshot.audio?.support?.chopperRotorPrewarm?.prepared === true
      && snapshot.render?.runtime?.initialized === true;
  }, undefined, { timeout: 90_000 });
  await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await installResourceSampler(page);
  await armKeyRecorder(page);

  const initial = await page.evaluate(() => {
    const root = window as any;
    const snapshot = root.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const actor = snapshot.killstreak.actors.find((candidate: any) => candidate.actorId === snapshot.player.id);
    const support = snapshot.supportVehiclePresentation;
    const presentation = snapshot.killstreakPresentation;
    const rotor = snapshot.audio.support.chopperRotorPrewarm;
    const runtime = snapshot.render.runtime;
    const effectPrewarm = snapshot.bootstrap.effectPrewarmProfile;
    return {
      capturedAtMs: performance.now(),
      physicalStart: { ...root.__PASS71_HF309_SOLO_POINTER__, audioContext: snapshot.audio.context.state },
      slot: {
        slotIndex: actor.loadout.slots.indexOf('chopper'),
        inputKey: '6', inputCode: 'Digit6',
      },
      supportVehicle: {
        state: support.state,
        requiredAssets: [...support.requiredAssets].sort(),
        loadedAssets: [...support.loadedAssets].sort(),
        readyFamilies: [...support.readyFamilies].sort(),
        maxConcurrentDecodes: support.maxConcurrentDecodes,
        failureCount: Object.keys(support.failures).length,
        textureDedup: support.textureDedup,
      },
      pool: {
        prewarmed: presentation.prewarmed,
        pooledEntityInstances: presentation.pooledEntityInstances,
        pooledSwarmDrones: presentation.pooledSwarmDrones,
        prewarmedAuthoredSupportFamilies: [...presentation.prewarmedAuthoredSupportFamilies].sort(),
        pooledChopperActionNames: [...presentation.pooledChopperActionNames].sort(),
        activeEntities: presentation.entities,
        activeBombShells: presentation.bombShells,
        activeImpactFlashes: presentation.impactFlashes,
        activeEmberParticles: presentation.emberParticles,
        bounded: presentation.bounded,
      },
      hud: root.__PASS71_HF309_HUD_STATE__(),
      audio: {
        contextState: snapshot.audio.context.state,
        prepared: rotor.prepared,
        runs: rotor.runs,
        capacity: rotor.capacity,
        sources: rotor.sources,
        nodes: rotor.nodes,
        factoryCalls: rotor.factoryCalls,
        firstActiveSync: rotor.firstActiveSync,
        retainedBroadbandLoops: rotor.retainedBroadbandLoops,
      },
      rendererPrewarm: {
        bootstrapStage: snapshot.bootstrap.stage,
        sceneGeneration: effectPrewarm?.sceneGeneration ?? null,
        groups: effectPrewarm?.groups?.map((group: any) => group.name) ?? [],
      },
      runtime: {
        requestedBackend: runtime.requestedBackend,
        actualBackend: runtime.actualBackend,
        initialized: runtime.initialized,
        adapterClass: runtime.adapterClass,
        deviceClass: runtime.deviceClass,
        adapterLabel: runtime.adapterLabel,
        softwareAdapter: runtime.softwareAdapter,
        deviceLost: runtime.deviceLost,
        uncapturedErrors: runtime.uncapturedErrors,
        presentationStatus: runtime.presentation.status,
      },
      allocationSignature: root.__PASS71_HF309_RESOURCE_SIGNATURE__(),
      possession: actor.possession?.kind ?? null,
    };
  });
  expect(initial.physicalStart).toMatchObject({
    selector: '#solo', eventType: 'pointerdown', isTrusted: true, audioContext: 'running',
  });
  expect(initial.slot).toEqual({ slotIndex: 3, inputKey: '6', inputCode: 'Digit6' });
  expect(initial.supportVehicle).toMatchObject({
    state: 'ready', maxConcurrentDecodes: 2, failureCount: 0,
    readyFamilies: ['care', 'carpet', 'chopper', 'crate'],
  });
  expect(initial.supportVehicle.loadedAssets).toEqual(initial.supportVehicle.requiredAssets);
  expect(initial.supportVehicle.requiredAssets).toEqual(expectedSupportAssets);
  expect(initial.pool).toMatchObject({
    prewarmed: 6,
    pooledEntityInstances: 29,
    pooledSwarmDrones: 24,
    prewarmedAuthoredSupportFamilies: ['care', 'carpet', 'chopper', 'crate'],
    activeEntities: 0,
    activeBombShells: 0,
    activeImpactFlashes: 0,
    activeEmberParticles: 0,
    bounded: true,
  });
  expect(initial.pool.pooledChopperActionNames).toEqual([
    'Chopper_Gun_Fire',
    'Chopper_Gun_Recoil',
    'Chopper_Impact_Pulse',
    'Chopper_Main_Rotor_Loop',
    'Chopper_Muzzle_Flash',
    'Chopper_Quiet_Loop',
    'Chopper_Tail_Rotor_Loop',
    'Chopper_Tracer_Pulse',
  ]);
  expect(initial.hud).toMatchObject({
    hidden: true, connected: true, supportKind: 'none', samePreparedNode: true,
    requiredNodesPresent: true, descendantCount: 42,
  });
  expect(initial.audio).toEqual({
    contextState: 'running', prepared: true, runs: 1, capacity: 4, sources: 4, nodes: 12,
    factoryCalls: 16, firstActiveSync: null, retainedBroadbandLoops: 0,
  });
  expect(initial.rendererPrewarm.bootstrapStage).toBe('ready');
  if (renderer === 'webgpu') {
    expect(initial.rendererPrewarm.sceneGeneration).toEqual(expect.any(Number));
    expect(initial.rendererPrewarm.groups).toEqual(expectedWebGpuPrewarmGroups);
  } else {
    expect(initial.rendererPrewarm).toEqual({ bootstrapStage: 'ready', sceneGeneration: null, groups: [] });
  }
  expect(initial.allocationSignature).toMatchObject({
    supportAssets: expectedSupportAssets,
    supportTextureCounts: [5, 39, 39, 39, 0, 6_990_500, 54_525_900],
    poolCounts: [6, 29, 24],
    rotorOwnedResources: [1, 4, 4, 12, 16, 0],
    audioRetainedSources: 12,
    audioSpatialChains: 4,
    hudNodeCount: 42,
    rendererPrewarmGeneration: renderer === 'webgpu' ? initial.rendererPrewarm.sceneGeneration : null,
    rendererPrewarmGroups: renderer === 'webgpu' ? expectedWebGpuPrewarmGroups : [],
  });
  expect(initial.runtime).toMatchObject({
    requestedBackend: renderer, actualBackend: renderer, initialized: true,
    softwareAdapter: false, deviceLost: false, uncapturedErrors: 0,
    presentationStatus: renderer === 'webgpu' ? 'healthy' : 'synchronous',
  });
  expect(initial.possession).toBeNull();

  await page.locator('#game').click({ position: { x: 64, y: 64 }, force: true });
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'));
  await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.earnSupport(15));
  const activationResourcesBefore = await resourceSignature(page);
  await page.keyboard.press('6');
  await page.waitForFunction(() => {
    const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const actor = snapshot.killstreak.actors.find((candidate: any) => candidate.actorId === snapshot.player.id);
    const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.kind === 'chopper');
    const detail = snapshot.killstreakPresentation.entityDetails.find((candidate: any) => candidate.entityId === entity?.id);
    return actor?.possession == null
      && entity?.phase === 'orbiting'
      && detail?.poolKey === 'chopper'
      && detail?.presentationSource === 'project-original-blender-glb'
      && snapshot.audio.support.chopperRotorPrewarm.firstActiveSync?.factoryDelta === 0;
  }, undefined, { timeout: 20_000 });
  const activation = await page.evaluate(() => {
    const root = window as any;
    const snapshot = root.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const actor = snapshot.killstreak.actors.find((candidate: any) => candidate.actorId === snapshot.player.id);
    const entity = snapshot.killstreak.entities.find((candidate: any) => candidate.kind === 'chopper');
    const detail = snapshot.killstreakPresentation.entityDetails.find((candidate: any) => candidate.entityId === entity.id);
    const rotor = snapshot.audio.support.chopperRotorPrewarm;
    return {
      observedAtMs: performance.now(),
      keyEvent: root.__PASS71_HF309_KEY_EVENTS__.at(-1),
      entity: {
        id: entity.id,
        activationId: entity.activationId,
        phase: entity.phase,
        gunController: entity.gunController,
        poolKey: detail.poolKey,
        presentationSource: detail.presentationSource,
        visible: detail.visible,
        visibleMeshCount: detail.visibleMeshCount,
        activeLodAsset: detail.activeLodAsset,
      },
      possession: actor.possession?.kind ?? null,
      audio: {
        prepared: rotor.prepared,
        runs: rotor.runs,
        capacity: rotor.capacity,
        sources: rotor.sources,
        nodes: rotor.nodes,
        factoryCalls: rotor.factoryCalls,
        active: snapshot.audio.support.chopperRotorActive,
        liveIds: [...rotor.liveIds],
        firstActiveSync: rotor.firstActiveSync,
      },
      resources: root.__PASS71_HF309_RESOURCE_SIGNATURE__(),
    };
  });
  expect(activation.keyEvent).toMatchObject({ code: 'Digit6', key: '6', isTrusted: true, repeat: false });
  expect(activation.entity).toMatchObject({
    phase: 'orbiting', gunController: 'ai', poolKey: 'chopper',
    presentationSource: 'project-original-blender-glb', visible: true,
  });
  expect(activation.entity.visibleMeshCount).toBeGreaterThan(0);
  expect(activation.entity.activeLodAsset).toMatch(/pass65-chopper-gunner-lod[0-2]\.glb$/u);
  expect(activation.possession).toBeNull();
  expect(activation.audio).toMatchObject({
    prepared: true, runs: 1, capacity: 4, sources: 4, nodes: 12, factoryCalls: 16, active: true,
    firstActiveSync: { cold: true, factoryDelta: 0, admitted: 1, contextState: 'running' },
  });
  expect(activation.audio.liveIds).toEqual([activation.entity.id]);
  expect(activation.resources).toEqual(activationResourcesBefore);

  const firstEntry = await captureEntry(page, 'first');
  assertEntry(firstEntry);
  await page.keyboard.press('6');
  await expect.poll(async () => page.evaluate(() => {
    const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const actor = snapshot.killstreak.actors.find((candidate: any) => candidate.actorId === snapshot.player.id);
    return {
      possession: actor.possession?.kind ?? null,
      hudHidden: document.querySelector<HTMLElement>('#gunner-cockpit-hud')?.hidden,
      supportKind: document.querySelector<HTMLElement>('#gunner-cockpit-hud')?.dataset.supportKind,
    };
  })).toEqual({ possession: null, hudHidden: true, supportKind: 'none' });
  const afterFirstExit = await resourceSignature(page);
  expect(afterFirstExit).toEqual(activation.resources);

  const warmEntry = await captureEntry(page, 'warm');
  assertEntry(warmEntry);
  await page.keyboard.press('6');
  await expect.poll(async () => page.evaluate(() => {
    const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const actor = snapshot.killstreak.actors.find((candidate: any) => candidate.actorId === snapshot.player.id);
    return actor.possession?.kind ?? null;
  })).toBeNull();
  const finalResources = await resourceSignature(page);
  expect(finalResources).toEqual(activation.resources);
  const observedKeyEvents = await keyEvents(page);
  expect(observedKeyEvents).toHaveLength(5);
  expect(observedKeyEvents.every((entry) => entry.code === 'Digit6' && entry.key === '6'
    && entry.isTrusted && !entry.repeat)).toBe(true);
  expect(faults).toEqual([]);

  const final = await page.evaluate(() => {
    const root = window as any;
    const snapshot = root.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const rotor = snapshot.audio.support.chopperRotorPrewarm;
    return {
      observedAtMs: performance.now(),
      possession: document.documentElement.dataset.killstreakPossession ?? 'none',
      hud: root.__PASS71_HF309_HUD_STATE__(),
      audio: {
        prepared: rotor.prepared,
        runs: rotor.runs,
        capacity: rotor.capacity,
        sources: rotor.sources,
        nodes: rotor.nodes,
        factoryCalls: rotor.factoryCalls,
        lastSyncFactoryDelta: rotor.lastSyncFactoryDelta,
        retainedBroadbandLoops: rotor.retainedBroadbandLoops,
      },
      presentation: root.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry(),
      sessionNonce: root.__PASS71_HF309_SESSION_NONCE__,
      userAgent: navigator.userAgent,
    };
  });
  expect(final.possession).toBe('none');
  expect(final.hud).toMatchObject({ hidden: true, connected: true, samePreparedNode: true, supportKind: 'none' });
  expect(final.audio).toEqual({
    prepared: true, runs: 1, capacity: 4, sources: 4, nodes: 12, factoryCalls: 16,
    lastSyncFactoryDelta: 0, retainedBroadbandLoops: 0,
  });
  expect(final.presentation).toMatchObject({
    completionFailures: 0,
    status: renderer === 'webgpu' ? 'healthy' : 'synchronous',
  });

  const servedCandidate = await candidateProvenance(page);
  expect(servedCandidate).toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: 'PASS 71',
    sourceSha: expectedSourceSha,
    path: 'channels/the-big-one',
  });
  expect(final.userAgent).toMatch(/Edg\/(\d+(?:\.\d+){3})/u);
  const browserVersion = final.userAgent.match(/Edg\/(\d+(?:\.\d+){3})/u)![1]!;
  const component = {
    schemaVersion: 1,
    evidenceId: 'HF-309',
    contract: 'atomic-acres/pass71-hf309-chopper-first-entry-component@1',
    renderer,
    arenaId: 'gun-range',
    renderProfile: 'performance',
    startedAt,
    completedAt: new Date().toISOString(),
    servedCandidate,
    browser: {
      channel: 'msedge', installed: true, userAgent: final.userAgent,
      version: browserVersion, sessionNonce: final.sessionNonce,
    },
    runtime: initial.runtime,
    initial,
    activation: { ...activation, resourcesBefore: activationResourcesBefore },
    firstEntry,
    firstExit: {
      keyEvent: observedKeyEvents[2], possession: null, hudHidden: true,
      resources: afterFirstExit,
    },
    warmEntry,
    finalExit: {
      keyEvent: observedKeyEvents[4], possession: null, hud: final.hud,
      resources: finalResources,
    },
    allocationStability: {
      activationPreparedBeforeInput: initial.capturedAtMs < activation.keyEvent.atMs,
      activationSettledBeforeFirstPossession: activation.observedAtMs < firstEntry.startedAtMs,
      initialToActivation: JSON.stringify(initial.allocationSignature) === JSON.stringify(activation.resources),
      activationToFirstHandler: JSON.stringify(activation.resources) === JSON.stringify(firstEntry.resourcesAfterHandler),
      activationToFirstObservation: JSON.stringify(activation.resources) === JSON.stringify(firstEntry.resourcesAfterObservation),
      activationToFirstExit: JSON.stringify(activation.resources) === JSON.stringify(afterFirstExit),
      activationToWarmHandler: JSON.stringify(activation.resources) === JSON.stringify(warmEntry.resourcesAfterHandler),
      activationToWarmObservation: JSON.stringify(activation.resources) === JSON.stringify(warmEntry.resourcesAfterObservation),
      activationToFinalExit: JSON.stringify(activation.resources) === JSON.stringify(finalResources),
    },
    keyEvents: observedKeyEvents,
    faults,
  };
  mkdirSync(dirname(componentPath), { recursive: true });
  writeFileSync(componentPath, `${JSON.stringify(component, null, 2)}\n`, 'utf8');
});
