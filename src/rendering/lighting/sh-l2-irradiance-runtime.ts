/**
 * Runtime binding for the Nuke Town SH-L2 material volume.
 *
 * COLD-PATH CONTRACT (Finding 1, SHIP-WITH-FIXES). The 128-ray bake costs
 * ~2.4 s single-shot, so the arena transition NEVER performs it:
 *
 * - `configureNuketown2ShL2[ForArena]` is non-blocking. It binds instantly
 *   when the digest is already held (same-boot memory, or the persistent
 *   cache from a previous boot), and otherwise parks the shared term on the
 *   fallback — the frozen `PhysicalLightingModel` + `scene.environment`
 *   path, i.e. exactly what shipped before this lane, with the added term at
 *   uniform zero — while a chunked session bakes the volume in 4 ms
 *   menu-idle slices behind `scheduleBrowserPreparationIdleTask`.
 * - `prewarmNuketown2ShL2[ForMenu]` kicks that session from menu idle time
 *   (first preview frame), so a transition that happens after the menu has
 *   been visible usually finds the volume ready.
 * - When a pending bake finishes it is stored to the digest-guarded cache,
 *   uploaded into the SAME texture objects (uniform-only, zero new
 *   pipelines), and enabled at the waiter's tier — a single uniform flip on
 *   a frame boundary, so the swap is at most one frame's cutover.
 */
import type { Group } from 'three';

import {
  NUKETOWN2_ARENA_ID,
  resolveNuketown2Sky,
} from '../../nuketown2-lighting';
import {
  nuketown2SkyPreset,
  type Nuketown2SkyPreset,
} from '../../nuketown2-lighting/presets';
import { scheduleBrowserPreparationIdleTask } from '../../browser-preparation-scheduler';
import type { LightingConditionsInput } from '../lighting-conditions';
import {
  bakeShL2Volume,
  beginShL2Bake,
  deriveShL2Grid,
  shL2Digest,
  type ShL2BakeOptions,
  type ShL2BakeSession,
  type ShL2Volume,
} from './sh-l2-irradiance';
import type { BakeLighting } from './baked-indirect';
import {
  defaultShL2Storage,
  readCachedShL2Volume,
  storeShL2Volume,
  type ShL2Storage,
} from './sh-l2-irradiance-cache';
import {
  NUKETOWN2_SH_L2_STRENGTH,
  configureNuketown2IndirectTerm,
  setNuketown2IndirectTier,
  sharedNuketown2IndirectTerm,
} from './indirect-term';
import { publishShL2Receipt } from './sh-l2-irradiance-node';
import { buildNuketown2ShL2BakeOccluders } from './nuketown2-sh-l2-occluders';
import type { ProxyScene } from '../raytracing/analytic-proxy-scene';
import { vec3 } from '../raytracing/analytic-proxy-scene';

export type ShL2Tier = keyof typeof NUKETOWN2_SH_L2_STRENGTH;

export type ShL2Lux = Readonly<{ directIlluminanceLux: number; skyIlluminanceLux: number }>;

export type ShL2RuntimeReceipt = Readonly<{
  digest: string;
  conditionId: string;
  occluderShapes: number;
  directIlluminanceLux: number;
  skyIlluminanceLux: number;
  /** True while the volume is still baking on the menu-idle driver. */
  pending: boolean;
  /** True when the volume came from memory or the persistent cache, not a bake. */
  cached: boolean;
}>;

export type ShL2Runtime = Readonly<{
  bake(input: LightingConditionsInput): ShL2RuntimeReceipt;
  adoptBaked(volume: ShL2Volume, conditionId: string, lux: ShL2Lux): ShL2RuntimeReceipt;
  boundDigest(): string | null;
  setTier(tier: ShL2Tier): void;
  receipt(): ShL2RuntimeReceipt | null;
}>;

/**
 * Indirection for the two bake entry points, so the cold-path test can spy
 * on the synchronous whole-volume bake and prove the transition never calls
 * it. Production always leaves both at their real implementations.
 */
export const shL2BakeBackend = {
  bakeVolume: bakeShL2Volume,
  beginBake: beginShL2Bake,
};

/** One menu-idle slice. A 128-ray probe measures ~0.7 ms; 4 ms never janks. */
export const SH_L2_MENU_SLICE_MS = 4;

const DEG = Math.PI / 180;
const ANCHOR = nuketown2SkyPreset('golden-hour');
const BAKE_GRID = deriveShL2Grid(
  { minM: vec3(-18, 0, -42), maxM: vec3(18, 0, 42) },
  { spacingM: 2, heightM: 6, paddingM: 1 },
);

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function resolvedPreset(sky: ReturnType<typeof resolveNuketown2Sky>): Nuketown2SkyPreset {
  return nuketown2SkyPreset(sky.presetId);
}

/** Converts the authored lux table directly; no quantised sun reconstruction. */
export function bakeLightingFromNuketown2Sky(input: LightingConditionsInput): BakeLighting {
  const sky = resolveNuketown2Sky({ ...input, arenaId: NUKETOWN2_ARENA_ID });
  const entry = resolvedPreset(sky);
  const cloud = nuketown2SkyPreset('overcast');
  const directLux = mix(entry.directIlluminanceLux, cloud.directIlluminanceLux, sky.overcastBlend);
  const directScale = directLux / Math.max(1e-6, ANCHOR.directIlluminanceLux);
  const skyScale = sky.skyIlluminanceLux / Math.max(1e-6, ANCHOR.skyIlluminanceLux);
  const elevation = sky.sunElevationDegrees * DEG;
  const azimuth = sky.sunAzimuthDeltaDegrees * DEG;
  const sunDirection = vec3(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth));
  return Object.freeze({
    sunDirection,
    sunColour: vec3(
      directScale * sky.sunTint[0], directScale * sky.sunTint[1], directScale * sky.sunTint[2],
    ),
    skyZenithColour: vec3(
      skyScale * sky.skyTint[0], skyScale * sky.skyTint[1], skyScale * sky.skyTint[2],
    ),
    skyHorizonColour: vec3(
      skyScale * sky.skyTint[0] * 0.78, skyScale * sky.skyTint[1] * 0.78, skyScale * sky.skyTint[2] * 0.78,
    ),
    skyGroundColour: vec3(
      skyScale * sky.skyTint[0] * 0.24, skyScale * sky.skyTint[1] * 0.24, skyScale * sky.skyTint[2] * 0.24,
    ),
  });
}

function conditionId(input: LightingConditionsInput): string {
  const sky = resolveNuketown2Sky({ ...input, arenaId: NUKETOWN2_ARENA_ID });
  return `${sky.presetId}:${sky.overcastBlend.toFixed(4)}`;
}

function luxFor(input: LightingConditionsInput): ShL2Lux {
  const sky = resolveNuketown2Sky({ ...input, arenaId: NUKETOWN2_ARENA_ID });
  const entry = resolvedPreset(sky);
  const cloud = nuketown2SkyPreset('overcast');
  return {
    directIlluminanceLux: mix(entry.directIlluminanceLux, cloud.directIlluminanceLux, sky.overcastBlend),
    skyIlluminanceLux: sky.skyIlluminanceLux,
  };
}

let sharedOccluders: ProxyScene | null = null;

/** The bake inputs for these lighting conditions, without baking anything. */
function bakeOptionsFor(input: LightingConditionsInput): ShL2BakeOptions {
  if (!sharedOccluders) sharedOccluders = buildNuketown2ShL2BakeOccluders();
  return {
    arenaId: NUKETOWN2_ARENA_ID,
    conditionId: conditionId(input),
    grid: BAKE_GRID,
    lighting: bakeLightingFromNuketown2Sky(input),
    occluders: sharedOccluders,
    raysPerProbe: 128,
    bounces: 1,
    seed: 0x53484c32,
  };
}

const runtimeByRoot = new WeakMap<object, ShL2Runtime>();

/** Finished volumes shared across roots: one condition bakes once per boot. */
const readyByDigest = new Map<string, ShL2Volume>();

type PendingShL2Bake = {
  session: ShL2BakeSession;
  options: ShL2BakeOptions;
  lux: ShL2Lux;
  waiters: Map<ShL2Runtime, ShL2Tier>;
};

const pendingByDigest = new Map<string, PendingShL2Bake>();
let idlePumpScheduled = false;

function publishReceipt(): void {
  if (typeof document !== 'undefined') publishShL2Receipt(document.documentElement, sharedNuketown2IndirectTerm());
}

function createRuntime(): ShL2Runtime {
  let volume: ShL2Volume | null = null;
  let lastReceipt: ShL2RuntimeReceipt | null = null;
  let lastCondition = '';
  return {
    bake(input) {
      const options = bakeOptionsFor(input);
      const nextCondition = options.conditionId;
      if (!volume || lastCondition !== nextCondition) {
        const lux = luxFor(input);
        volume = shL2BakeBackend.bakeVolume(options);
        lastCondition = nextCondition;
        lastReceipt = Object.freeze({
          digest: volume.digest,
          conditionId: nextCondition,
          occluderShapes: volume.bake.occluderShapes,
          directIlluminanceLux: lux.directIlluminanceLux,
          skyIlluminanceLux: lux.skyIlluminanceLux,
          pending: false,
          cached: false,
        });
        configureNuketown2IndirectTerm({ enabled: false, strength: 0, volume });
      }
      return lastReceipt!;
    },
    adoptBaked(next, nextCondition, lux) {
      volume = next;
      lastCondition = nextCondition;
      lastReceipt = Object.freeze({
        digest: next.digest,
        conditionId: nextCondition,
        occluderShapes: next.bake.occluderShapes,
        directIlluminanceLux: lux.directIlluminanceLux,
        skyIlluminanceLux: lux.skyIlluminanceLux,
        pending: false,
        cached: true,
      });
      configureNuketown2IndirectTerm({ enabled: false, strength: 0, volume: next });
      return lastReceipt;
    },
    boundDigest() {
      return volume ? volume.digest : null;
    },
    setTier(tier) {
      const graph = sharedNuketown2IndirectTerm();
      graph.setStrength(NUKETOWN2_SH_L2_STRENGTH[tier]);
      graph.setEnabled(tier !== 'off' && volume !== null);
    },
    receipt() {
      return lastReceipt;
    },
  };
}

/**
 * Steps every pending bake under `budgetMs` per session. Finished volumes
 * are cached persistently, shared across roots, and bound at each waiter's
 * tier; the upload reuses the allocated textures, so the swap is uniform-only.
 * Returns the number of bakes that completed.
 */
export function pumpPendingShL2Bakes(
  budgetMs: number = SH_L2_MENU_SLICE_MS,
  storage: ShL2Storage | null = defaultShL2Storage(),
): number {
  let completed = 0;
  for (const [digest, pending] of [...pendingByDigest]) {
    if (!pending.session.step(budgetMs)) continue;
    pendingByDigest.delete(digest);
    const volume = pending.session.volume();
    readyByDigest.set(digest, volume);
    storeShL2Volume(storage, volume);
    for (const [runtime, tier] of pending.waiters) {
      runtime.adoptBaked(volume, pending.options.conditionId, pending.lux);
      runtime.setTier(tier);
    }
    completed += 1;
    publishReceipt();
  }
  return completed;
}

function scheduleShL2IdlePump(storage: ShL2Storage | null): void {
  if (idlePumpScheduled || pendingByDigest.size === 0) return;
  idlePumpScheduled = true;
  scheduleBrowserPreparationIdleTask(() => {
    idlePumpScheduled = false;
    pumpPendingShL2Bakes(SH_L2_MENU_SLICE_MS, storage);
    if (pendingByDigest.size > 0) scheduleShL2IdlePump(storage);
  });
}

/**
 * Menu-idle entry: ensures a chunked session exists for these lighting
 * conditions (or adopts the persistent cache), then returns its digest.
 * Safe to call on every menu idle turn; repeat calls are free.
 */
export function prewarmNuketown2ShL2(
  input: LightingConditionsInput,
  storage: ShL2Storage | null = defaultShL2Storage(),
): string {
  const options = bakeOptionsFor(input);
  const digest = shL2Digest(options);
  if (readyByDigest.has(digest) || pendingByDigest.has(digest)) return digest;
  const cached = readCachedShL2Volume(storage, digest);
  if (cached) {
    readyByDigest.set(digest, cached);
    return digest;
  }
  pendingByDigest.set(digest, {
    session: shL2BakeBackend.beginBake(options),
    options,
    lux: luxFor(input),
    waiters: new Map(),
  });
  scheduleShL2IdlePump(storage);
  return digest;
}

/**
 * Menu seam for legacy-main: same as `prewarmNuketown2ShL2` but assembled
 * from menu-scope state, and a no-op unless Nuke Town is selected with the
 * feature enabled. Best-effort: it never throws into the menu chain, so a
 * missed prewarm degrades to the pending path at transition time. Returns
 * the digest, or null when there is nothing to do.
 */
export function prewarmNuketown2ShL2ForMenu(
  input: LightingConditionsInput,
  tier: ShL2Tier,
  storage: ShL2Storage | null = defaultShL2Storage(),
): string | null {
  try {
    if (input.arenaId !== NUKETOWN2_ARENA_ID || tier === 'off') return null;
    return prewarmNuketown2ShL2(input, storage);
  } catch {
    return null;
  }
}

/**
 * Arena-transition seam. NEVER bakes synchronously: a held or cached volume
 * binds immediately (receipt `pending: false`), otherwise the shared term
 * stays on the zero L1 fallback and a chunked session bakes on the idle
 * driver (receipt `pending: true`). The transition never waits on the bake.
 */
export function configureNuketown2ShL2(
  root: Group,
  input: LightingConditionsInput,
  tier: ShL2Tier,
  storage: ShL2Storage | null = defaultShL2Storage(),
): ShL2RuntimeReceipt {
  let runtime = runtimeByRoot.get(root);
  if (!runtime) {
    runtime = createRuntime();
    runtimeByRoot.set(root, runtime);
  }
  const options = bakeOptionsFor(input);
  const digest = shL2Digest(options);
  if (runtime.boundDigest() === digest) {
    runtime.setTier(tier);
    publishReceipt();
    return runtime.receipt()!;
  }
  prewarmNuketown2ShL2(input, storage);
  const ready = readyByDigest.get(digest);
  if (ready) {
    const receipt = runtime.adoptBaked(ready, options.conditionId, luxFor(input));
    runtime.setTier(tier);
    publishReceipt();
    return receipt;
  }
  const pending = pendingByDigest.get(digest);
  if (pending) pending.waiters.set(runtime, tier);
  // Park the shared term on the fallback with the requested strength latent:
  // the fallback frame renders the frozen path, and the eventual bind flips
  // the term on at exactly this strength in one uniform write.
  const graph = sharedNuketown2IndirectTerm();
  graph.setStrength(NUKETOWN2_SH_L2_STRENGTH[tier]);
  graph.setEnabled(false);
  publishReceipt();
  const lux = luxFor(input);
  return Object.freeze({
    digest,
    conditionId: options.conditionId,
    occluderShapes: options.occluders.shapes.length,
    directIlluminanceLux: lux.directIlluminanceLux,
    skyIlluminanceLux: lux.skyIlluminanceLux,
    pending: true,
    cached: false,
  });
}

/** Narrow legacy-main seam: keep the live lighting-input assembly beside the bake owner. */
export function configureNuketown2ShL2ForArena(
  root: Group,
  tier: ShL2Tier,
  matchSeed: number,
  elapsedSeconds: number,
  choice: LightingConditionsInput['choice'],
  skyDarkenAmount: number,
  storage: ShL2Storage | null = defaultShL2Storage(),
): ShL2RuntimeReceipt {
  return configureNuketown2ShL2(root, {
    arenaId: NUKETOWN2_ARENA_ID,
    matchSeed,
    elapsedSeconds,
    choice,
    skyDarkenAmount,
  }, tier, storage);
}

export function setNuketown2ShL2Tier(tier: ShL2Tier): void {
  for (const pending of pendingByDigest.values()) {
    for (const runtime of pending.waiters.keys()) pending.waiters.set(runtime, tier);
  }
  setNuketown2IndirectTier(tier, sharedNuketown2IndirectTerm().receipt().digest !== 'unbound');
  publishReceipt();
}

/** Test-only introspection for the cold-path contract. Never call in production. */
export const __shL2ColdPathForTests = {
  backend: shL2BakeBackend,
  pendingBakes(): number {
    return pendingByDigest.size;
  },
  readyVolumes(): number {
    return readyByDigest.size;
  },
  pump(budgetMs: number, storage: ShL2Storage | null = null): number {
    return pumpPendingShL2Bakes(budgetMs, storage);
  },
  reset(): void {
    pendingByDigest.clear();
    readyByDigest.clear();
    idlePumpScheduled = false;
  },
};
