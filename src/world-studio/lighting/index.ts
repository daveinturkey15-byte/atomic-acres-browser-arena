import * as THREE from 'three';
import type { StudioEnvironment, StudioPresetId } from '../environment';
import { STUDIO_ENVIRONMENTS } from '../environment';
import type { StudioInteriorAnchor } from '../interiors';
import { auditLocalLightOcclusion, makeShadowedLocal, type LightOcclusionAudit } from '../../rendering/light-occlusion';

/**
 * world-studio/lighting — additive presentation-only practical rig (2026-09-12).
 *
 * Owns NOTHING global: the sun, hemisphere, ambient, fill lights, fog, tone
 * mapping and exposure stay with `src/legacy-main.ts` +
 * `src/rendering/lighting-conditions.ts` (`LightingConditionWrites`). This
 * module never writes renderer state, never creates a clock, and never
 * touches the ground/material/interiors lanes. It derives everything from the
 * environment the existing weather router already writes into
 * `root.userData.worldStudioEnvironment` (`src/world-studio/weather-routing.ts`
 * → `legacy-main.ts:5066`), the same object `arena.ts:update` reads.
 *
 * Interior depth is bought the cheap, honest way (`threejs-webgpu-interior-lighting-look`
 * skill, budgets table): a small number of real practicals per house, shadowed
 * keys only at focal rooms, clustered-policy fills elsewhere, and nothing at
 * all outside the five named interior rooms.
 */

export type StudioLightingMode = 'presentation' | 'preview';

export interface StudioLightingPreset {
  readonly maximumShadowLights: number;
  readonly maximumFillLights: number;
  readonly shadowMapSize: number;
  readonly shadowBias: number;
  readonly shadowNormalBias: number;
  /** Presence ceiling: practical intensity multiplier never exceeds this. */
  readonly maximumPresence: number;
}

/** Bounded by construction; `assertStudioLightingPreset` fails closed on drift. */
export const STUDIO_LIGHTING_PRESET: StudioLightingPreset = Object.freeze({
  maximumShadowLights: 4,
  maximumFillLights: 10,
  shadowMapSize: 256,
  shadowBias: -0.00022,
  shadowNormalBias: 0.02,
  maximumPresence: 1.45,
});

const KEY_SPOT_BASE = 16;
const BEDROOM_SPOT_BASE = 12;
const FILL_BASE = 8;
const GARAGE_FILL_BASE = 6;

const WARM_NEUTRAL = 0xffe9c8;
const WARM_DEEP = 0xffd9a8;
const FILL_NEUTRAL = 0xeef2f6;
const COOL_SHIFT = 0xe7f0f8;

/** Ceiling fixture height above each storey's floor line (house.ts:32-33). */
const FIXTURE_HEIGHT: Readonly<Record<string, number>> = Object.freeze({
  living: 2.55,
  dining: 2.55,
  kitchen: 2.55,
  bedroom: 2.1,
  bedroom2: 2.1,
  study: 2.1,
  garage: 2.4,
});

/** Rooms this rig lights at all. Anything else in an anchor is ignored. */
const LIT_ROOMS: Readonly<Record<string, true>> = Object.freeze(Object.fromEntries(
  Object.keys(FIXTURE_HEIGHT).map((room) => [room, true as const]),
));

const isLitRoom = (room: string): boolean => LIT_ROOMS[room] === true;

export interface StudioPracticalTuning {
  /** 1..maximumPresence intensity multiplier. */
  readonly presence: number;
  /** 0..1 shift from neutral-warm practicals toward low-sun warm. */
  readonly warmth: number;
  /** 0..1 shift of fills toward cool overcast light. */
  readonly coldness: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Pure environment → practical tuning. The world-studio daylight band is
 * [9.5, 16.5] hours (lighting-conditions.ts:544-547); `daylight` normalises
 * it. Overcast/rain/snow darken the sky, so practicals read stronger and
 * warmer against them; snow also cools the fills. Deterministic in the frozen
 * `StudioEnvironment` only — no clock, no renderer reads.
 */
export function derivePracticalTuning(environment: StudioEnvironment): StudioPracticalTuning {
  const daylight = clamp01((environment.hour - 9.5) / 7);
  const overcast = environment.id === 'overcast-morning' ? 0.3 : 0;
  const skyDim = clamp01(Math.max(environment.rain * 0.9, environment.snow * 0.55, overcast));
  const presence = 1 + 0.35 * skyDim + 0.1 * (1 - daylight);
  const warmth = clamp01(0.25 * (1 - daylight) + 0.5 * skyDim);
  const coldness = clamp01(environment.snow * 0.8 - warmth * 0.5);
  return { presence, warmth, coldness };
}

/** Fails closed over the whole frozen catalog at module init, mirroring `assertLightingConditionSafety`. */
function assertTuningBounds(): void {
  for (const environment of STUDIO_ENVIRONMENTS) {
    const tuning = derivePracticalTuning(environment);
    if (![tuning.presence, tuning.warmth, tuning.coldness].every((v) => Number.isFinite(v))) {
      throw new Error(`studio lighting tuning not finite for preset '${environment.id}'`);
    }
    if (tuning.presence < 1 || tuning.presence > STUDIO_LIGHTING_PRESET.maximumPresence) {
      throw new Error(`studio lighting presence out of bounds for preset '${environment.id}'`);
    }
    if (tuning.warmth < 0 || tuning.warmth > 1 || tuning.coldness < 0 || tuning.coldness > 1) {
      throw new Error(`studio lighting tint weight out of bounds for preset '${environment.id}'`);
    }
  }
}
assertTuningBounds();

export interface StudioLightingInput {
  /** The world-studio arena root; read for `worldStudioEnvironment` + fallback. */
  readonly root: THREE.Object3D;
  /** Scene that receives the presentation-only rig (and loses it on dispose). */
  readonly scene: THREE.Scene;
  /** `root.userData.furnitureAnchors` — world-space room anchors per house. */
  readonly anchors: readonly StudioInteriorAnchor[];
  /** `presentation` (shadowed keys) or `preview` (no shadow maps at all). */
  readonly mode?: StudioLightingMode;
  readonly preset?: StudioLightingPreset;
  /** Explicit environment override; defaults to reading `root.userData.worldStudioEnvironment`. */
  readonly getEnvironment?: () => StudioEnvironment | null | undefined;
}

export interface StudioLightingTelemetry {
  readonly mode: StudioLightingMode;
  readonly activeLights: number;
  readonly shadowedLights: number;
  readonly maximumShadowLights: number;
  readonly litRooms: readonly string[];
  readonly skippedAnchors: number;
  readonly occlusion: LightOcclusionAudit;
  readonly lastTuning: StudioPracticalTuning | null;
  readonly lastEnvironmentId: StudioPresetId | null;
}

export interface StudioLightingController {
  /** Re-derives from the current environment; no allocation when it did not change. */
  update(): void;
  telemetry(): StudioLightingTelemetry;
  /** Removes and disposes exactly what this factory added. Restores nothing else. */
  dispose(): void;
}

interface RoomPlan {
  readonly house: string;
  readonly room: string;
  readonly position: THREE.Vector3;
}

/** Validated anchors → one plan per (house, lit room); centroid of that room's anchors. */
export function planStudioRoomPracticals(anchors: readonly StudioInteriorAnchor[]): readonly RoomPlan[] {
  const seen = new Set<string>();
  for (const anchor of anchors) {
    if (!anchor.id || seen.has(anchor.id)) throw new Error('Invalid or duplicate interior anchor');
    if (![...anchor.position, anchor.yaw, ...anchor.footprint].every(Number.isFinite)) {
      throw new Error('Invalid interior anchor');
    }
    seen.add(anchor.id);
  }
  const rooms = new Map<string, { house: string; room: string; sum: THREE.Vector3; count: number }>();
  let skipped = 0;
  for (const anchor of anchors) {
    const separator = anchor.id.indexOf('-');
    const house = separator > 0 ? anchor.id.slice(0, separator) : 'house';
    if (!isLitRoom(anchor.room)) { skipped += 1; continue; }
    const key = `${house}/${anchor.room}`;
    const entry = rooms.get(key) ?? { house, room: anchor.room, sum: new THREE.Vector3(), count: 0 };
    entry.sum.x += anchor.position[0]!;
    entry.sum.y += anchor.position[1]!;
    entry.sum.z += anchor.position[2]!;
    entry.count += 1;
    rooms.set(key, entry);
  }
  return [...rooms.values()].map((entry) => ({
    house: entry.house,
    room: entry.room,
    position: entry.sum.divideScalar(entry.count),
  })).sort((a, b) => a.house.localeCompare(b.house) || a.room.localeCompare(b.room));
}

const scratchWarm = new THREE.Color(WARM_NEUTRAL);
const scratchDeep = new THREE.Color(WARM_DEEP);
const scratchFill = new THREE.Color(FILL_NEUTRAL);
const scratchCool = new THREE.Color(COOL_SHIFT);

const isKeyRoom = (room: string): boolean => room === 'living' || room === 'bedroom';
const baseIntensity = (room: string): number => room === 'living' ? KEY_SPOT_BASE
  : room === 'bedroom' ? BEDROOM_SPOT_BASE : room === 'garage' ? GARAGE_FILL_BASE : FILL_BASE;
const baseDistance = (room: string): number => isKeyRoom(room) ? 7.5 : room === 'garage' ? 6 : 5.5;

/**
 * Additive studio practical rig. See module header for ownership. The rig is
 * presentation-only (`presentationOnly`, `blocksShots: false`), tagged with
 * the repo's occlusion policies (`makeShadowedLocal` keys, clustered-policy
 * fills) so `auditLocalLightOcclusion` reports zero violations.
 */
export function createStudioLighting(input: StudioLightingInput): StudioLightingController {
  const mode: StudioLightingMode = input.mode ?? 'presentation';
  const preset = input.preset ?? STUDIO_LIGHTING_PRESET;
  const getEnvironment = input.getEnvironment ?? (() => input.root.userData.worldStudioEnvironment as StudioEnvironment | undefined);

  const plans = planStudioRoomPracticals(input.anchors);
  const keyPlans = plans.filter((plan) => isKeyRoom(plan.room));
  if (keyPlans.length > preset.maximumShadowLights && mode === 'presentation') {
    // Fail closed: the caller trimmed anchors or shrank the budget.
    throw new Error(`studio lighting needs ${keyPlans.length} shadowed keys > budget ${preset.maximumShadowLights}`);
  }

  const rig = new THREE.Group();
  rig.name = 'world-studio-lighting';
  rig.userData.presentationOnly = true;
  rig.userData.blocksShots = false;

  interface AppliedLight { light: THREE.PointLight | THREE.SpotLight; house: string; room: string; base: number; }
  const applied: AppliedLight[] = [];
  let shadowedLights = 0;

  for (const plan of plans) {
    const key = isKeyRoom(plan.room) && mode === 'presentation';
    const fixtureY = plan.position.y + (FIXTURE_HEIGHT[plan.room] ?? 2.4);
    const light = key ? new THREE.SpotLight(0xffffff, 0, baseDistance(plan.room), 0.7, 0.7, 2)
      : new THREE.PointLight(0xffffff, 0, baseDistance(plan.room), 2);
    light.name = `world-studio-practical-${plan.house}-${plan.room}`;
    light.position.set(plan.position.x, fixtureY, plan.position.z);
    light.userData.presentationOnly = true;
    light.userData.blocksShots = false;
    if (light instanceof THREE.SpotLight) {
      makeShadowedLocal(light);
      light.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = baseDistance(plan.room);
      light.shadow.bias = preset.shadowBias;
      light.shadow.normalBias = preset.shadowNormalBias;
      light.shadow.radius = 1.5;
      const target = new THREE.Object3D();
      target.name = `${light.name}-target`;
      target.position.set(plan.position.x, plan.position.y, plan.position.z);
      target.userData.presentationOnly = true;
      target.userData.blocksShots = false;
      light.target = target;
      rig.add(target);
      shadowedLights += 1;
    } else {
      // Clustered-policy fill: bounded distance, decay 2, named source — the
      // audit's sanctioned unshadowed shape (light-occlusion.ts:63-74).
      light.userData.clusteredLocalLight = true;
      light.userData.clusteredSource = `world-studio:${plan.house}:${plan.room}`;
    }
    rig.add(light);
    applied.push({ light, house: plan.house, room: plan.room, base: baseIntensity(plan.room) });
  }

  input.scene.add(rig);

  let lastEnvironment: StudioEnvironment | null | undefined;
  let lastTuning: StudioPracticalTuning | null = null;
  const presenceScratch = new THREE.Color();

  const apply = (environment: StudioEnvironment): void => {
    lastTuning = derivePracticalTuning(environment);
    for (const entry of applied) {
      const intensity = entry.base * lastTuning.presence;
      entry.light.intensity = intensity;
      if (isKeyRoom(entry.room)) {
        presenceScratch.copy(scratchWarm).lerp(scratchDeep, lastTuning.warmth);
      } else {
        presenceScratch.copy(scratchFill).lerp(scratchCool, lastTuning.coldness);
      }
      entry.light.color.copy(presenceScratch);
    }
  };

  return {
    update() {
      const environment = getEnvironment() ?? null;
      // Identity-cache like arena.ts: the router writes frozen preset objects,
      // so object equality is a cheap "did weather actually change" gate.
      if (environment === lastEnvironment) return;
      lastEnvironment = environment;
      if (environment) apply(environment);
    },
    telemetry(): StudioLightingTelemetry {
      return {
        mode,
        activeLights: applied.filter((entry) => entry.light.intensity > 0).length,
        shadowedLights,
        maximumShadowLights: preset.maximumShadowLights,
        litRooms: applied.map((entry) => `${entry.house}/${entry.room}`),
        skippedAnchors: input.anchors.filter((anchor) => !isLitRoom(anchor.room)).length,
        occlusion: auditLocalLightOcclusion(rig),
        lastTuning,
        lastEnvironmentId: lastEnvironment?.id ?? null,
      };
    },
    dispose() {
      input.scene.remove(rig);
      rig.traverse((node) => {
        if (node instanceof THREE.SpotLight || node instanceof THREE.PointLight) node.shadow?.map?.dispose();
      });
      rig.clear();
      applied.length = 0;
      lastEnvironment = null;
      lastTuning = null;
    },
  };
}
