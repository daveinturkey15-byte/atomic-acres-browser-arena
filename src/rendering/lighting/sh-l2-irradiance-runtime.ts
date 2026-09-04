/** Runtime binding for the Nuke Town SH-L2 material volume. */
import type { Group } from 'three';

import {
  NUKETOWN2_ARENA_ID,
  resolveNuketown2Sky,
} from '../../nuketown2-lighting';
import {
  nuketown2SkyPreset,
  type Nuketown2SkyPreset,
} from '../../nuketown2-lighting/presets';
import type { LightingConditionsInput } from '../lighting-conditions';
import {
  bakeShL2Volume,
  deriveShL2Grid,
  type ShL2Volume,
} from './sh-l2-irradiance';
import type { BakeLighting } from './baked-indirect';
import {
  NUKETOWN2_SH_L2_STRENGTH,
  configureNuketown2IndirectTerm,
  setNuketown2IndirectTier,
  sharedNuketown2IndirectTerm,
} from './indirect-term';
import { publishShL2Receipt } from './sh-l2-irradiance-node';
import { buildNuketown2ShL2BakeOccluders } from './nuketown2-sh-l2-occluders';
import { vec3 } from '../raytracing/analytic-proxy-scene';

export type ShL2Tier = keyof typeof NUKETOWN2_SH_L2_STRENGTH;

export type ShL2RuntimeReceipt = Readonly<{
  digest: string;
  conditionId: string;
  occluderShapes: number;
  directIlluminanceLux: number;
  skyIlluminanceLux: number;
}>;

export type ShL2Runtime = Readonly<{
  bake(input: LightingConditionsInput): ShL2RuntimeReceipt;
  setTier(tier: ShL2Tier): void;
  receipt(): ShL2RuntimeReceipt | null;
}>;

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

const runtimeByRoot = new WeakMap<object, ShL2Runtime>();

function publishReceipt(): void {
  if (typeof document !== 'undefined') publishShL2Receipt(document.documentElement, sharedNuketown2IndirectTerm());
}

function createRuntime(): ShL2Runtime {
  const occluders = buildNuketown2ShL2BakeOccluders();
  let volume: ShL2Volume | null = null;
  let lastReceipt: ShL2RuntimeReceipt | null = null;
  let lastCondition = '';
  return {
    bake(input) {
      const nextCondition = conditionId(input);
      if (!volume || lastCondition !== nextCondition) {
        const sky = resolveNuketown2Sky({ ...input, arenaId: NUKETOWN2_ARENA_ID });
        const entry = resolvedPreset(sky);
        const cloud = nuketown2SkyPreset('overcast');
        const directIlluminanceLux = mix(entry.directIlluminanceLux, cloud.directIlluminanceLux, sky.overcastBlend);
        volume = bakeShL2Volume({
          arenaId: NUKETOWN2_ARENA_ID,
          conditionId: nextCondition,
          grid: BAKE_GRID,
          lighting: bakeLightingFromNuketown2Sky(input),
          occluders,
          raysPerProbe: 128,
          bounces: 1,
          seed: 0x53484c32,
        });
        lastCondition = nextCondition;
        lastReceipt = Object.freeze({
          digest: volume.digest,
          conditionId: nextCondition,
          occluderShapes: volume.bake.occluderShapes,
          directIlluminanceLux,
          skyIlluminanceLux: sky.skyIlluminanceLux,
        });
        configureNuketown2IndirectTerm({ enabled: false, strength: 0, volume });
      }
      return lastReceipt!;
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

/** Builds/binds the volume behind the existing arena transition loading fence. */
export function configureNuketown2ShL2(
  root: Group,
  input: LightingConditionsInput,
  tier: ShL2Tier,
): ShL2RuntimeReceipt {
  let runtime = runtimeByRoot.get(root) as ShL2Runtime | undefined;
  if (!runtime) {
    runtime = createRuntime();
    runtimeByRoot.set(root, runtime);
  }
  const receipt = runtime.bake(input);
  runtime.setTier(tier);
  publishReceipt();
  return receipt;
}

/** Narrow legacy-main seam: keep the live lighting-input assembly beside the bake owner. */
export function configureNuketown2ShL2ForArena(
  root: Group,
  tier: ShL2Tier,
  matchSeed: number,
  elapsedSeconds: number,
  choice: LightingConditionsInput['choice'],
  skyDarkenAmount: number,
): ShL2RuntimeReceipt {
  return configureNuketown2ShL2(root, {
    arenaId: NUKETOWN2_ARENA_ID,
    matchSeed,
    elapsedSeconds,
    choice,
    skyDarkenAmount,
  }, tier);
}

export function setNuketown2ShL2Tier(tier: ShL2Tier): void {
  setNuketown2IndirectTier(tier, sharedNuketown2IndirectTerm().receipt().digest !== 'unbound');
  publishReceipt();
}
