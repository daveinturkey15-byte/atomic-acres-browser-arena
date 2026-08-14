import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PROFILES = [
  { label: 'quality', query: 'quality' },
  { label: 'performance', query: 'performance' },
] as const;
const PANE_COUNT = 6;
const LIVE_CROSSBOW_IMPACT_TIMEOUT_MS = 2_000;
const CROSSBOW_IMPACT_RECEIPT_COLLECTION_TIMEOUT_MS = 8_000;
const DEBRIS_SPAWN_TIMEOUT_MS = 5_000;
const DEBRIS_PHYSICS_TIMEOUT_MS = 1_500;
const DEBRIS_MOVEMENT_TIMEOUT_MS = 2_500;
const DEBRIS_SETTLE_TIMEOUT_MS = 4_250;
const DEBRIS_MAX_LIFETIME_MS = 4_500;
const ALL_PANE_INDEXES = Object.freeze(Array.from({ length: PANE_COUNT }, (_, index) => index));
const HF304_COMPONENT_PATH = process.env.PASS71_HF304_BROWSER_COMPONENT_PATH
  ? resolve(process.env.PASS71_HF304_BROWSER_COMPONENT_PATH)
  : null;
const HF304_EXPECTED_SOURCE_SHA = process.env.PASS71_HF304_EXPECTED_SOURCE_SHA ?? null;
const HF304_RELEASE_PASS = process.env.PASS71_HF304_RELEASE_PASS ?? null;
const HF304_CASE_IDS = Object.freeze(PROFILES.flatMap((profile) => (
  ['bullet', 'knife', 'grenade', 'flare-gun', 'explosive-crossbow'].map((path) => `${profile.label}/${path}`)
)));
const hf304Cases: Array<Record<string, unknown>> = [];
let hf304ServedCandidate: Record<string, unknown> | null = null;
let hf304UserAgent: string | null = null;

async function captureHf304RuntimeIdentity(page: Page): Promise<void> {
  if (!HF304_COMPONENT_PATH) return;
  expect(HF304_EXPECTED_SOURCE_SHA).toMatch(/^[a-f0-9]{40}$/u);
  expect(HF304_RELEASE_PASS).toBe('PASS 71');
  const identity = await page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HF-304 candidate provenance returned HTTP ${response.status}`);
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      servedCandidate: await response.json(),
      userAgent: navigator.userAgent,
      actualRenderer: snapshot.render?.runtime?.actualBackend,
    };
  });
  expect(identity.servedCandidate).toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: HF304_RELEASE_PASS,
    sourceSha: HF304_EXPECTED_SOURCE_SHA,
    path: 'channels/the-big-one',
  });
  expect(identity.userAgent).toMatch(/Edg\//u);
  expect(identity.actualRenderer).toBe('webgl2');
  if (hf304ServedCandidate === null) hf304ServedCandidate = identity.servedCandidate;
  else expect(identity.servedCandidate).toEqual(hf304ServedCandidate);
  if (hf304UserAgent === null) hf304UserAgent = identity.userAgent;
  else expect(identity.userAgent).toBe(hf304UserAgent);
}

function recordHf304Case(
  profile: string,
  path: string,
  arenaId: ArenaId,
  receipt: unknown,
  faults: readonly string[],
): void {
  if (!HF304_COMPONENT_PATH) return;
  hf304Cases.push({
    id: `${profile}/${path}`,
    profile,
    path,
    arenaId,
    status: 'PASS',
    paneCount: PANE_COUNT,
    receipt,
    faults: [...faults],
  });
}

test.afterAll(() => {
  if (!HF304_COMPONENT_PATH) return;
  expect(hf304Cases.map((entry) => entry.id)).toEqual(HF304_CASE_IDS);
  expect(hf304ServedCandidate).not.toBeNull();
  expect(hf304UserAgent).toMatch(/Edg\//u);
  const component = {
    schemaVersion: 1,
    contract: 'atomic-acres/pass71-hf304-glass-browser-component@1',
    status: 'PASS',
    sourceSha: HF304_EXPECTED_SOURCE_SHA,
    servedCandidate: hf304ServedCandidate,
    browser: { channel: 'msedge', userAgent: hf304UserAgent },
    renderer: { requested: 'webgl2', actual: 'webgl2' },
    coverage: {
      profiles: ['quality', 'performance'],
      arenas: ['atomic-acres', 'skyline-terminal'],
      paneCountPerArena: PANE_COUNT,
      paths: ['bullet', 'knife', 'grenade', 'flare-gun', 'explosive-crossbow'],
      caseCount: HF304_CASE_IDS.length,
      authorityMode: 'solo',
      hostedRuntimeTopologyObserved: false,
    },
    cases: hf304Cases,
    faults: [],
  };
  mkdirSync(dirname(HF304_COMPONENT_PATH), { recursive: true });
  const temporary = `${HF304_COMPONENT_PATH}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(component, null, 2)}\n`, 'utf8');
  renameSync(temporary, HF304_COMPONENT_PATH);
});

type GlassPhase = 'intact' | 'breached' | 'detached';
type ArenaId = 'atomic-acres' | 'skyline-terminal';
type PaneObservation = Readonly<{
  id: string;
  broken: boolean;
  visible: boolean;
  activeWorldColliderPresent: boolean;
  persistentDebrisId: string | null;
  position: readonly number[];
  authority: Readonly<{
    phase: GlassPhase;
    paneVisible: boolean;
    apertureOpen: boolean;
    movementSolid: boolean;
    ballisticSolid: boolean;
    aiLineOfSightSolid: boolean;
  }>;
  rapierDynamicColliders: number;
}>;

type CrossbowImpactSample = Readonly<{
  bolt: Readonly<{
    impacted: true;
    authority: true;
    ownerId: string;
    actionNonce: number;
    impactWindowId: string;
    position: readonly number[];
    spawnedAt: number;
    impactedAt: number;
    detonatesAt: number;
    actualImpactLatencyMs: number;
  }>;
  pane: Omit<PaneObservation, 'position'>;
  observedAfterDetonation: boolean;
}>;

type DebrisLifecycleSample = Readonly<{
  id: string;
  windowId: string;
  spawnGeneration: number;
  spawnedAt: number;
  actionIdentity: string;
  milestone: 'initial' | 'moving' | 'settled' | null;
  sampledAt: number;
  position: readonly number[];
  visible: boolean;
  physical: boolean;
  physicsActive: boolean;
  receivedPhysicsPose: boolean;
  fallbackSettled: boolean;
  support: Readonly<{ source: string | null; restY: number | null }>;
  ageMs: number;
  noProgressMs: number;
  fallbackStartedAt: number | null;
  settledAt: number | null;
}>;

type DebrisLifecycleBatch = Readonly<{
  id: string;
  windowId: string;
  spawnGeneration: number;
  spawnedAt: number;
  actionIdentity: string;
  milestones: readonly DebrisLifecycleSample[];
  current: DebrisLifecycleSample | null;
  terminal: DebrisLifecycleSample | null;
  retired: boolean;
}>;

type DebrisLifecycleReceipt = Readonly<{
  initial: DebrisLifecycleSample;
  moving: DebrisLifecycleSample;
  settled: DebrisLifecycleSample;
}>;

async function deploy(
  page: Page,
  render: string,
  arenaId: ArenaId = 'atomic-acres',
  multiplayerQa = false,
): Promise<void> {
  const seed = arenaId === 'atomic-acres'
    ? `pass71-glass-${render}`
    : `pass71-glass-${arenaId}-${render}`;
  await page.goto(
    `/?release=latest&map=${arenaId}&renderer=webgl2&render=${render}`
      + '&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off'
      + (multiplayerQa ? '&multiplayerQa=1' : '')
      + `&seed=${seed}`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 },
  );
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.admissionState().matchPhase === 'active'
      && debug.admissionState().presentedGameplayFrame > 2;
  }, undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await captureHf304RuntimeIdentity(page);
}

async function observePane(page: Page, index: number): Promise<PaneObservation> {
  return page.evaluate((paneIndex) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const pane = snapshot.breakableWindows[paneIndex];
    return {
      ...pane,
      rapierDynamicColliders: snapshot.interactiveWorld.rapierDynamicColliders,
    };
  }, index);
}

async function fireAndObserveLiveCrossbowImpact(page: Page, index: number): Promise<CrossbowImpactSample> {
  const binding = await page.evaluate((paneIndex) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    // Stage and fire in one browser task. On a starved worker an upper-window
    // teleport can otherwise fall for several game frames while intervening
    // evidence reads leave the original camera pitch aimed below the pane.
    debug.stageWindow(paneIndex, 6);
    const arm = debug.armExplosiveBoltImpactObservation(paneIndex);
    if (!arm) throw new Error(`Unable to arm exact crossbow impact receipt for pane ${paneIndex}`);
    const action = debug.fireOnce();
    const bound = debug.bindExplosiveBoltImpactObservation(arm, action);
    if (!bound) throw new Error(`Crossbow fire did not produce one newly spawned authoritative action for pane ${paneIndex}`);
    return bound;
  }, index);
  // Collection may happen after the fuse has detonated on a starved CI worker.
  // Admission still uses only the retained event's actual impact-spawn delta.
  const receiptHandle = await page.waitForFunction(({ bound, maxImpactLatencyMs }) => {
    const result = window.__ATOMIC_ACRES_DEBUG__
      .readExplosiveBoltImpactReceipt(bound, maxImpactLatencyMs);
    return result.status === 'pending' ? null : result;
  }, {
    bound: binding,
    maxImpactLatencyMs: LIVE_CROSSBOW_IMPACT_TIMEOUT_MS,
  }, {
    timeout: CROSSBOW_IMPACT_RECEIPT_COLLECTION_TIMEOUT_MS,
    polling: 50,
  });
  const read = await receiptHandle.jsonValue() as any;
  await receiptHandle.dispose();
  if (read.status !== 'accepted') {
    throw new Error(`Exact crossbow impact receipt rejected: ${read.reason}`);
  }
  const receipt = read.receipt;
  return Object.freeze({
    bolt: Object.freeze({
      impacted: true,
      authority: receipt.authority,
      ownerId: receipt.ownerId,
      actionNonce: receipt.actionNonce,
      impactWindowId: receipt.impactWindowId,
      position: Object.freeze([...receipt.position]),
      spawnedAt: receipt.spawnedAt,
      impactedAt: receipt.impactedAt,
      detonatesAt: receipt.detonatesAt,
      actualImpactLatencyMs: read.actualImpactLatencyMs,
    }),
    pane: Object.freeze({
      id: receipt.pane.id,
      broken: receipt.pane.broken,
      visible: receipt.pane.visible,
      activeWorldColliderPresent: receipt.pane.activeWorldColliderPresent,
      persistentDebrisId: null,
      authority: Object.freeze({ ...receipt.pane.authority }),
      rapierDynamicColliders: receipt.pane.rapierDynamicColliderCount,
    }),
    observedAfterDetonation: read.observedAfterDetonation,
  });
}

async function resetBreakableWindows(page: Page): Promise<void> {
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.resetBreakableWindows());
  await expect.poll(async () => {
    const ready = await page.evaluate((paneCount) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      return snapshot.breakableWindows.length === paneCount
      && snapshot.breakableWindows.every((pane: any) => (
        pane.broken === false
        && pane.visible === true
        && pane.authority?.phase === 'intact'
        && pane.activeWorldColliderPresent === true
      ))
      && snapshot.interactiveWorld.rapierDynamicColliders >= paneCount;
    }, PANE_COUNT);
    return ready;
  }, { timeout: 5_000 }).toBe(true);
}

async function assertPaneBreached(
  page: Page,
  index: number,
  label: string,
  rapierColliderCountBefore: number,
  expectedPhase: Exclude<GlassPhase, 'intact'>,
  waitForProjectile = false,
): Promise<PaneObservation> {
  if (waitForProjectile) {
    await page.waitForFunction(({ paneIndex, phase }) => {
      const pane = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).breakableWindows[paneIndex];
      return pane.broken === true
        && pane.visible === false
        && pane.authority?.phase === phase
        && pane.authority?.paneVisible === false
        && pane.authority?.apertureOpen === true
        && pane.authority?.movementSolid === false
        && pane.authority?.ballisticSolid === false
        && pane.authority?.aiLineOfSightSolid === false
        && pane.activeWorldColliderPresent === false;
    }, { paneIndex: index, phase: expectedPhase }, { timeout: 8_000 });
  }
  const admittedPane = await observePane(page, index);
  expect(admittedPane, `${label}: pane ${index}`).toMatchObject({
    broken: true,
    visible: false,
    activeWorldColliderPresent: false,
    authority: {
      phase: expectedPhase,
      paneVisible: false,
      apertureOpen: true,
      movementSolid: false,
      ballisticSolid: false,
      aiLineOfSightSolid: false,
    },
  });
  // Pane authority remains immediate for hitscan/melee/grenade. Only the
  // already-deferred Rapier reconciliation receives a bounded poll.
  await page.waitForFunction(({ colliderCountBefore }) => (
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).interactiveWorld.rapierDynamicColliders
      < colliderCountBefore
  ), { colliderCountBefore: rapierColliderCountBefore }, { timeout: 5_000 });
  return observePane(page, index);
}

async function armPaneDebrisLifecycleObservation(page: Page, index: number, label: string): Promise<void> {
  await page.evaluate((options) => {
    type ObserverOutcome = Readonly<{
      receipt: DebrisLifecycleReceipt | null;
      error: string | null;
    }>;
    type ObserverWindow = Window & {
      __PASS71_GLASS_DEBRIS_OBSERVER__?: Readonly<{
        outcome: Promise<ObserverOutcome>;
        cancel: () => void;
      }>;
    };
    const observerWindow = window as ObserverWindow;
    observerWindow.__PASS71_GLASS_DEBRIS_OBSERVER__?.cancel();
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const armedAt = performance.now();
    let animationFrame = 0;
    let spawnDeadline = 0;
    let finished = false;
    let sawDebris = false;
    let initial: DebrisLifecycleSample | null = null;
    let moving: DebrisLifecycleSample | null = null;
    let lastSample: DebrisLifecycleSample | null = null;
    let observedGeneration: number | null = null;
    let lastMilestoneAt = Number.NEGATIVE_INFINITY;
    let cancelLifecycle = (): void => undefined;

    const cloneSample = (sample: DebrisLifecycleSample): DebrisLifecycleSample => Object.freeze({
      ...sample,
      position: Object.freeze([...sample.position]),
      support: Object.freeze({ ...sample.support }),
    });
    const describeSample = (sample: DebrisLifecycleSample | null): string => JSON.stringify(sample
      ? {
        spawnGeneration: sample.spawnGeneration,
        milestone: sample.milestone,
        sampledAt: Math.round(sample.sampledAt),
        ageMs: Math.round(sample.ageMs),
        position: sample.position,
        physical: sample.physical,
        physicsActive: sample.physicsActive,
        receivedPhysicsPose: sample.receivedPhysicsPose,
        fallbackSettled: sample.fallbackSettled,
        support: sample.support,
      }
      : { ageMs: null, armedElapsedMs: Math.round(performance.now() - armedAt), state: 'not-spawned' });
    const lifecycle = new Promise<DebrisLifecycleReceipt>((resolveLifecycle, rejectLifecycle) => {
      const finish = (result: DebrisLifecycleReceipt | Error): void => {
        if (finished) return;
        finished = true;
        window.cancelAnimationFrame(animationFrame);
        window.clearTimeout(spawnDeadline);
        if (result instanceof Error) rejectLifecycle(result);
        else resolveLifecycle(result);
      };
      cancelLifecycle = (): void => finish(new Error(
        `${options.label}: debris observation cancelled; last=${describeSample(lastSample)}`,
      ));

      const consumeSample = (current: DebrisLifecycleSample, batch: DebrisLifecycleBatch): void => {
        if (finished) return;
        if (current.spawnGeneration !== batch.spawnGeneration
          || current.id !== batch.id
          || current.windowId !== batch.windowId
          || current.spawnedAt !== batch.spawnedAt
          || current.actionIdentity !== batch.actionIdentity) {
          finish(new Error(
            `${options.label}: debris published a stale or mixed-generation milestone; last=${describeSample(current)}`,
          ));
          return;
        }
        if (current.milestone !== null) {
          if (current.sampledAt < lastMilestoneAt
            || current.sampledAt >= current.spawnedAt + options.maxLifetimeMs
            || current.milestone === 'moving' && current.physical === false
              && (current.fallbackStartedAt === null || current.sampledAt < current.fallbackStartedAt)) {
            finish(new Error(
              `${options.label}: debris published a non-monotonic or expired milestone; last=${describeSample(current)}`,
            ));
            return;
          }
          lastMilestoneAt = current.sampledAt;
        }
        lastSample = cloneSample(current);
        if (!Number.isFinite(current.sampledAt)
          || !Number.isFinite(current.ageMs)
          || !current.position.every(Number.isFinite)) {
          finish(new Error(
            `${options.label}: debris published a non-finite lifecycle sample; last=${describeSample(lastSample)}`,
          ));
          return;
        }

        if (!initial) {
          if (current.ageMs >= options.physicsTimeoutMs) {
            finish(new Error(
              `${options.label}: no collision-backed physics pose within ${options.physicsTimeoutMs}ms; last=${describeSample(lastSample)}`,
            ));
            return;
          }
          if (current.milestone === 'initial'
            && current.visible === true
            && current.physical === true
            && current.physicsActive === true
            && current.receivedPhysicsPose === true
            && current.fallbackSettled === false) {
            initial = cloneSample(current);
          }
        }

        if (initial && !moving) {
          const displacement = Math.hypot(
            current.position[0] - initial.position[0],
            current.position[1] - initial.position[1],
            current.position[2] - initial.position[2],
          );
          if (current.milestone === 'moving'
            && current.fallbackSettled === false
            && current.position[1] <= initial.position[1] - 0.025
            && displacement >= 0.04) {
            if (current.ageMs >= options.movementTimeoutMs) {
              finish(new Error(
                `${options.label}: no falling debris motion within ${options.movementTimeoutMs}ms; last=${describeSample(lastSample)}`,
              ));
              return;
            }
            moving = cloneSample(current);
          } else if (current.ageMs >= options.movementTimeoutMs) {
            finish(new Error(
              `${options.label}: no falling debris motion within ${options.movementTimeoutMs}ms; last=${describeSample(lastSample)}`,
            ));
            return;
          }
        }

        if (initial && moving) {
          const restY = current.support.restY;
          const supportSource = current.support.source;
          const collisionAuthoritativeSupport = supportSource === 'world-floor'
            || supportSource?.startsWith('world-collider:') === true;
          if (current.milestone === 'settled'
            && current.visible === true
            && current.physical === false
            && current.physicsActive === false
            && current.fallbackSettled === true
            && collisionAuthoritativeSupport
            && typeof restY === 'number'
            && Number.isFinite(restY)
            && Math.abs(current.position[1] - restY) <= 0.04) {
            if (current.ageMs >= options.settleTimeoutMs) {
              finish(new Error(
                `${options.label}: no supported settled debris within ${options.settleTimeoutMs}ms; last=${describeSample(lastSample)}`,
              ));
              return;
            }
            finish(Object.freeze({ initial, moving, settled: cloneSample(current) }));
            return;
          }
          if (current.ageMs >= options.settleTimeoutMs) {
            finish(new Error(
              `${options.label}: no supported settled debris within ${options.settleTimeoutMs}ms; last=${describeSample(lastSample)}`,
            ));
            return;
          }
        }

        if (current.ageMs >= options.maxLifetimeMs) {
          finish(new Error(
            `${options.label}: debris exceeded the ${options.maxLifetimeMs}ms lifetime; last=${describeSample(lastSample)}`,
          ));
        }
      };

      const sampleAfterGameFrame = (): void => {
        const batch = debug.sampleWindowDebrisLifecycle(options.paneIndex) as DebrisLifecycleBatch | null;
        const now = performance.now();
        if (!batch) {
          if (sawDebris) {
            finish(new Error(
              `${options.label}: debris disappeared before a valid settled sample; last=${describeSample(lastSample)}`,
            ));
            return;
          }
          if (now - armedAt >= options.spawnTimeoutMs) {
            finish(new Error(
              `${options.label}: no debris spawned within ${options.spawnTimeoutMs}ms; last=${describeSample(null)}`,
            ));
            return;
          }
          animationFrame = window.requestAnimationFrame(sampleAfterGameFrame);
          return;
        }
        if (observedGeneration !== null && observedGeneration !== batch.spawnGeneration) {
          finish(new Error(
            `${options.label}: debris generation changed during observation; last=${describeSample(lastSample)}`,
          ));
          return;
        }
        observedGeneration = batch.spawnGeneration;
        if (!sawDebris) {
          sawDebris = true;
          window.clearTimeout(spawnDeadline);
        }
        for (const milestone of batch.milestones) consumeSample(milestone, batch);
        if (!finished && batch.current) consumeSample(batch.current, batch);
        if (!finished && batch.terminal) consumeSample(batch.terminal, batch);
        if (!finished && batch.retired) {
          finish(new Error(
            `${options.label}: debris retired before a valid settled milestone; last=${describeSample(lastSample)}`,
          ));
          return;
        }
        if (!finished) animationFrame = window.requestAnimationFrame(sampleAfterGameFrame);
      };

      spawnDeadline = window.setTimeout(() => finish(new Error(
        `${options.label}: no debris spawned within ${options.spawnTimeoutMs}ms; last=${describeSample(null)}`,
      )), options.spawnTimeoutMs);
      animationFrame = window.requestAnimationFrame(sampleAfterGameFrame);
    });
    const outcome = lifecycle.then<ObserverOutcome>(
      (receipt) => Object.freeze({ receipt, error: null }),
      (error: unknown) => Object.freeze({
        receipt: null,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    observerWindow.__PASS71_GLASS_DEBRIS_OBSERVER__ = Object.freeze({
      outcome,
      cancel: () => cancelLifecycle(),
    });
  }, {
    paneIndex: index,
    label,
    spawnTimeoutMs: DEBRIS_SPAWN_TIMEOUT_MS,
    physicsTimeoutMs: DEBRIS_PHYSICS_TIMEOUT_MS,
    movementTimeoutMs: DEBRIS_MOVEMENT_TIMEOUT_MS,
    settleTimeoutMs: DEBRIS_SETTLE_TIMEOUT_MS,
    maxLifetimeMs: DEBRIS_MAX_LIFETIME_MS,
  });
}

async function readPaneDebrisLifecycleObservation(page: Page, label: string): Promise<DebrisLifecycleReceipt> {
  const outcome = await page.evaluate(async () => {
    const observerWindow = window as Window & {
      __PASS71_GLASS_DEBRIS_OBSERVER__?: Readonly<{
        outcome: Promise<Readonly<{
          receipt: DebrisLifecycleReceipt | null;
          error: string | null;
        }>>;
        cancel: () => void;
      }>;
    };
    const observer = observerWindow.__PASS71_GLASS_DEBRIS_OBSERVER__;
    if (!observer) return { receipt: null, error: 'debris lifecycle observer was not armed' };
    try {
      return await observer.outcome;
    } finally {
      observer.cancel();
      delete observerWindow.__PASS71_GLASS_DEBRIS_OBSERVER__;
    }
  });
  expect(outcome.error, label).toBeNull();
  if (!outcome.receipt) throw new Error(`${label}: debris lifecycle observer returned no receipt`);
  const { initial, moving, settled } = outcome.receipt;
  expect(initial, `${label}: retained debris begins on collision-backed physics`).toMatchObject({
    visible: true,
    physical: true,
    physicsActive: true,
    receivedPhysicsPose: true,
    fallbackSettled: false,
  });
  expect(initial.position.every(Number.isFinite), `${label}: finite initial debris position`).toBe(true);
  expect(moving.fallbackSettled, `${label}: in-flight sample precedes fallback settlement`).toBe(false);
  expect(moving.position[1], `${label}: shards fall`).toBeLessThanOrEqual(initial.position[1] - 0.025);
  expect(Math.hypot(
    moving.position[0] - initial.position[0],
    moving.position[1] - initial.position[1],
    moving.position[2] - initial.position[2],
  ), `${label}: shards move`).toBeGreaterThanOrEqual(0.04);
  expect(settled, `${label}: shards settle on collision-authoritative support`).toMatchObject({
    visible: true,
    physical: false,
    physicsActive: false,
    fallbackSettled: true,
  });
  expect(
    settled.support.source === 'world-floor'
      || settled.support.source?.startsWith('world-collider:') === true,
    `${label}: settled support source`,
  ).toBe(true);
  expect(Number.isFinite(settled.support.restY), `${label}: finite settled support height`).toBe(true);
  expect(Math.abs(settled.position[1] - (settled.support.restY as number)), `${label}: supported rest pose`)
    .toBeLessThanOrEqual(0.04);
  return outcome.receipt;
}

async function assertDebrisRetired(
  page: Page,
  label: string,
  expectedBrokenPaneIndexes: readonly number[] = ALL_PANE_INDEXES,
): Promise<any> {
  await page.waitForTimeout(4_750);
  const snapshot = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
  for (const paneIndex of expectedBrokenPaneIndexes) {
    expect(snapshot.breakableWindows[paneIndex], `${label}: pane ${paneIndex} remains canonically open`)
      .toMatchObject({
        broken: true,
        visible: false,
        activeWorldColliderPresent: false,
        authority: {
          apertureOpen: true,
          movementSolid: false,
          ballisticSolid: false,
          aiLineOfSightSolid: false,
        },
      });
  }
  expect(snapshot.windowGlassDebrisPool, label).toMatchObject({
    retained: PANE_COUNT,
    currentArenaRetained: PANE_COUNT,
    visibleRetained: 0,
    active: 0,
    activePhysics: 0,
    prewarmedPhysicsBodies: PANE_COUNT,
    lifecycle: {
      maxPhysicsMs: 1_800,
      maxLifetimeMs: 4_500,
      missingPrewarm: 0,
    },
  });
  expect(snapshot.persistentWindowDebris, `${label}: no fragment or collider remains`).toEqual([]);
  expect(snapshot.interactiveWorld.rapierMajorBodies, `${label}: no active major-debris body remains`).toBe(0);
  return {
    panes: snapshot.breakableWindows.map((pane: any) => ({
      id: pane.id,
      broken: pane.broken,
      apertureOpen: pane.authority.apertureOpen,
      activeWorldColliderPresent: pane.activeWorldColliderPresent,
    })),
    pool: snapshot.windowGlassDebrisPool,
    rapierDynamicColliders: snapshot.interactiveWorld.rapierDynamicColliders,
    rapierMajorBodies: snapshot.interactiveWorld.rapierMajorBodies,
    persistentWindowDebris: snapshot.persistentWindowDebris,
  };
}

async function waitForWeaponReady(page: Page, weapon: string): Promise<void> {
  await expect.poll(async () => page.evaluate((weaponId) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug.snapshot() as any;
    const readiness = debug.sampleWeaponActionReadiness();
    return snapshot.player.weapon === weaponId
      && snapshot.player.ammo > 0
      && snapshot.player.reloading === false
      && readiness.switchingReady === true
      && readiness.fireReady === true;
  }, weapon), { timeout: 6_000 }).toBe(true);
}

async function acquireSkylineFlare(page: Page): Promise<any> {
  const staged = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.stageTimedMapWeaponMidpoint('flare-gun', 'exact')
  ));
  expect(staged).toMatchObject({ status: 'available', announcementSent: true });
  const pickup = (staged as any).pickupPosition as [number, number, number];
  expect(pickup?.every(Number.isFinite)).toBe(true);
  await page.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z), pickup);
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop())).toBe(true);
  await expect.poll(async () => page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const state = snapshot.timedMapWeapons.states['flare-gun'];
    return state.status === 'held'
      && state.holderId === snapshot.player.id
      && snapshot.player.weapon === 'flare-gun';
  }), { timeout: 5_000 }).toBe(true);
  await waitForWeaponReady(page, 'flare-gun');
  return staged;
}

async function stageSkylinePane(page: Page, paneIndex: number, distance = 6): Promise<void> {
  await page.evaluate(({ paneIndex: index, distance: approachDistance }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const pane = (debug.snapshot() as any).breakableWindows[index];
    const [paneX, targetY, targetZ] = pane.position as [number, number, number];
    // Skyline's authored centre mullion is solid, so aim through clear pane area.
    const targetX = paneX + 1;
    const eyeY = 1.7;
    const playerX = targetX;
    const playerZ = targetZ + approachDistance;
    const deltaX = targetX - playerX;
    const deltaZ = targetZ - playerZ;
    const yaw = Math.atan2(-deltaX, -deltaZ);
    const pitch = Math.atan2(targetY - eyeY, Math.hypot(deltaX, deltaZ));
    debug.teleportPlayer(playerX, eyeY, playerZ, yaw, pitch);
  }, { paneIndex, distance });
}

for (const profile of PROFILES) {
  test(`${profile.label}: all six authored panes breach by bullet and retire debris by 5s`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);

    await resetBreakableWindows(page);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine'));
    let lifecycle: unknown = null;
    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      const before = await observePane(page, pane);
      if (pane === 0) await armPaneDebrisLifecycleObservation(page, pane, `${profile.label}/bullet`);
      await page.evaluate((paneIndex) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.stageWindow(paneIndex, 4);
        debug.fireOnce();
      }, pane);
      await assertPaneBreached(page, pane, `${profile.label}/bullet`, before.rapierDynamicColliders, 'breached');
      if (pane === 0) lifecycle = await readPaneDebrisLifecycleObservation(page, `${profile.label}/bullet`);
      await page.waitForTimeout(130);
    }
    const retired = await assertDebrisRetired(page, `${profile.label}/bullet`);
    const receipt = { lifecycle, retired };

    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    recordHf304Case(profile.label, 'bullet', 'atomic-acres', receipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-bullet`, {
      body: Buffer.from(JSON.stringify({ profile: profile.label, paneCount: PANE_COUNT, receipt, faults }, null, 2)),
      contentType: 'application/json',
    });
  });

  test(`${profile.label}: all six authored panes breach by knife and retire debris by 5s`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);

    await resetBreakableWindows(page);
    let lifecycle: unknown = null;
    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      const before = await observePane(page, pane);
      if (pane === 0) await armPaneDebrisLifecycleObservation(page, pane, `${profile.label}/knife`);
      const accepted = await page.evaluate((paneIndex) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.stageWindow(paneIndex, 1.25);
        return debug.melee().accepted;
      }, pane);
      expect(accepted, `${profile.label}/knife pane ${pane} admitted`).toBe(true);
      await assertPaneBreached(page, pane, `${profile.label}/knife`, before.rapierDynamicColliders, 'breached');
      if (pane === 0) lifecycle = await readPaneDebrisLifecycleObservation(page, `${profile.label}/knife`);
      await page.waitForTimeout(670);
    }
    const retired = await assertDebrisRetired(page, `${profile.label}/knife`);
    const receipt = { lifecycle, retired };

    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    recordHf304Case(profile.label, 'knife', 'atomic-acres', receipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-knife`, {
      body: Buffer.from(JSON.stringify({ profile: profile.label, paneCount: PANE_COUNT, receipt, faults }, null, 2)),
      contentType: 'application/json',
    });
  });

  test(`${profile.label}: all six authored panes breach by grenade and retire debris by 5s`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);

    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      await resetBreakableWindows(page);
      const before = await observePane(page, pane);
      const broken = await page.evaluate((paneIndex) => (
        window.__ATOMIC_ACRES_DEBUG__.detonateGrenadeAtWindow(paneIndex)
      ), pane);
      expect(broken, `${profile.label}/grenade pane ${pane} admitted`).toBeGreaterThanOrEqual(1);
      await assertPaneBreached(page, pane, `${profile.label}/grenade`, before.rapierDynamicColliders, 'detached');
    }
    // Finish with all six concurrently breached so the four presentation-only
    // fallbacks beyond the two-body Rapier partition are exercised together.
    await resetBreakableWindows(page);
    await armPaneDebrisLifecycleObservation(page, 0, `${profile.label}/grenade`);
    await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      for (let pane = 0; pane < 6; pane += 1) debug.detonateGrenadeAtWindow(pane);
    });
    const lifecycle = await readPaneDebrisLifecycleObservation(page, `${profile.label}/grenade`);
    const retired = await assertDebrisRetired(page, `${profile.label}/grenade`);
    const receipt = { lifecycle, retired };

    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    recordHf304Case(profile.label, 'grenade', 'atomic-acres', receipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-grenade`, {
      body: Buffer.from(JSON.stringify({ profile: profile.label, paneCount: PANE_COUNT, receipt, faults }, null, 2)),
      contentType: 'application/json',
    });
  });

  test(`${profile.label}: real Flare Gun impacts breach all six Skyline panes and shards fall, settle and retire`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query, 'skyline-terminal', true);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots());
    const grant = await acquireSkylineFlare(page);
    const paneReceipts: unknown[] = [];
    let lifecycle: unknown = null;

    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      await resetBreakableWindows(page);
      await waitForWeaponReady(page, 'flare-gun');
      await stageSkylinePane(page, pane);
      const before = await observePane(page, pane);
      const impactCountBefore = await page.evaluate(() => (
        (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).timedMapWeapons.flareProjectiles.impactCount
      ));
      if (pane === 0) await armPaneDebrisLifecycleObservation(page, pane, `${profile.label}/flare-gun`);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
      const breached = await assertPaneBreached(
        page,
        pane,
        `${profile.label}/flare-gun`,
        before.rapierDynamicColliders,
        'breached',
        true,
      );
      const impactCountAfter = await page.evaluate(() => (
        (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).timedMapWeapons.flareProjectiles.impactCount
      ));
      // FlareProjectileSystem increments this exact authority counter before
      // the same synchronous callback breaches the pane. A post-breach +1 is
      // therefore stronger than a transport-side poll whose own trace capture
      // can overrun its timeout after returning the successful value.
      expect(impactCountAfter).toBe(impactCountBefore + 1);
      if (pane === 0) lifecycle = await readPaneDebrisLifecycleObservation(page, `${profile.label}/flare-gun`);
      paneReceipts.push({ id: breached.id, phase: breached.authority.phase });
    }

    const retired = await assertDebrisRetired(page, `${profile.label}/flare-gun`, [PANE_COUNT - 1]);
    const timedState = await page.evaluate(() => (
      (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).timedMapWeapons.states['flare-gun']
    ));
    expect(timedState).toMatchObject({ status: 'depleted', shotsRemaining: 0 });
    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    const evidenceReceipt = {
      grant,
      paneReceipts,
      lifecycle,
      retired,
      timedState,
    };
    recordHf304Case(profile.label, 'flare-gun', 'skyline-terminal', evidenceReceipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-flare-gun`, {
      body: Buffer.from(JSON.stringify({
        profile: profile.label,
        arena: 'skyline-terminal',
        ...evidenceReceipt,
        faults,
      }, null, 2)),
      contentType: 'application/json',
    });
  });

  test(`${profile.label}: real explosive-crossbow impact stays solid until detonation then breaches every pane`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots());
    const paneReceipts: unknown[] = [];
    let lifecycle: unknown = null;

    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      await resetBreakableWindows(page);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('explosive-crossbow'));
      await waitForWeaponReady(page, 'explosive-crossbow');
      const before = await observePane(page, pane);
      if (pane === 0) {
        await armPaneDebrisLifecycleObservation(page, pane, `${profile.label}/explosive-crossbow`);
      }
      const impactSample = await fireAndObserveLiveCrossbowImpact(page, pane);
      expect(impactSample.bolt).toMatchObject({
        impacted: true,
        authority: true,
        impactWindowId: before.id,
      });
      expect(Number.isSafeInteger(impactSample.bolt.actionNonce)).toBe(true);
      expect(impactSample.bolt.actualImpactLatencyMs).toBeLessThanOrEqual(LIVE_CROSSBOW_IMPACT_TIMEOUT_MS);
      expect(impactSample.bolt.impactedAt).toBeGreaterThanOrEqual(impactSample.bolt.spawnedAt);
      expect(impactSample.bolt.detonatesAt).toBeGreaterThan(impactSample.bolt.impactedAt);
      expect(impactSample.bolt.position.every(Number.isFinite)).toBe(true);
      const impacted = impactSample.pane;
      expect(impacted, `${profile.label}/explosive-crossbow pane ${pane} remains solid on bolt impact`)
        .toMatchObject({
          broken: false,
          visible: true,
          activeWorldColliderPresent: true,
          rapierDynamicColliders: before.rapierDynamicColliders,
          authority: {
            phase: 'intact',
            paneVisible: true,
            apertureOpen: false,
            movementSolid: true,
            ballisticSolid: true,
            aiLineOfSightSolid: true,
          },
        });

      const breached = await assertPaneBreached(
        page,
        pane,
        `${profile.label}/explosive-crossbow`,
        before.rapierDynamicColliders,
        'detached',
        true,
      );
      if (pane === 0) {
        lifecycle = await readPaneDebrisLifecycleObservation(page, `${profile.label}/explosive-crossbow`);
      }
      paneReceipts.push({ id: breached.id, phase: breached.authority.phase });
    }

    const retired = await assertDebrisRetired(page, `${profile.label}/explosive-crossbow`, [PANE_COUNT - 1]);
    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    const evidenceReceipt = { paneReceipts, lifecycle, retired };
    recordHf304Case(profile.label, 'explosive-crossbow', 'atomic-acres', evidenceReceipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-explosive-crossbow`, {
      body: Buffer.from(JSON.stringify({
        profile: profile.label,
        arena: 'atomic-acres',
        ...evidenceReceipt,
        faults,
      }, null, 2)),
      contentType: 'application/json',
    });
  });
}
