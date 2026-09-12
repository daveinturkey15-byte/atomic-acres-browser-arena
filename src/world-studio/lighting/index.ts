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
 *
 * Continuation (same lane, owner feedback "pool but flat/pale"): every
 * practical now also owns a small visible fixture (instanced, 2 shared
 * materials, ≤8 draw calls total), hangs below its ceiling mount so the pool
 * reads as fixture-produced, and keys are tightened (narrower cone, higher
 * peak, lower fill wash) for local contrast. Placement traces the room's
 * focal furniture anchor (id suffix) when present instead of a blind
 * centroid, so pools land over tables/benches — actual anchor positions,
 * never invented bounds.
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

const KEY_SPOT_BASE = 20;
const BEDROOM_SPOT_BASE = 14;
const FILL_BASE = 6.5;
const GARAGE_FILL_BASE = 5;

/** Key-spot shaping: tighter cone + softer-edged penumbra than pass 1 (0.7/0.7). */
const SPOT_ANGLE = 0.5;
const SPOT_PENUMBRA = 0.45;

const WARM_NEUTRAL = 0xffe9c8;
const WARM_DEEP = 0xffd9a8;
/** Room-differentiated fill bases: service rooms cooler, living rooms warmer-neutral. */
const FILL_TINT: Readonly<Record<string, number>> = Object.freeze({
  dining: 0xf0ece2,
  kitchen: 0xe9f0f4,
  study: 0xf0ece2,
  bedroom2: 0xeef2f6,
  garage: 0xe4ecf2,
});
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

/** Visible fixture silhouette per room. Parts are instanced; 2 shared materials. */
type FixtureKind = 'pendant' | 'flush' | 'batten';
const FIXTURE_KIND: Readonly<Record<string, FixtureKind>> = Object.freeze({
  living: 'pendant',
  dining: 'pendant',
  kitchen: 'flush',
  bedroom: 'flush',
  bedroom2: 'flush',
  study: 'flush',
  garage: 'batten',
});
/** How far the light origin hangs below the ceiling line, per fixture kind. */
const FIXTURE_DROP: Readonly<Record<FixtureKind, number>> = Object.freeze({
  pendant: 0.35,
  flush: 0.02,
  batten: 0.05,
});

/**
 * Focal furniture anchor per room, matched as an exact `-<token>` id suffix.
 * Practical placement lands on that anchor (over the table/bench) when the
 * producer authored one; otherwise the room centroid, as before.
 */
const FOCAL_TOKEN: Readonly<Record<string, string>> = Object.freeze({
  living: 'coffee-table',
  dining: 'dining-table',
  kitchen: 'kitchen-run',
  bedroom: 'bed',
  bedroom2: 'bed2',
  study: 'desk',
  garage: 'workbench',
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
  readonly scene: THREE.Object3D;
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
  /** Visible fixture instances (one per practical). */
  readonly fixtures: number;
  /** Instanced fixture meshes actually created (each is one draw call). */
  readonly fixtureDrawCalls: number;
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

/**
 * Validated anchors → one plan per (house, lit room). Placement prefers the
 * room's focal furniture anchor (exact `-<token>` id suffix, e.g.
 * `<house>-coffee-table`); without one it falls back to the anchor centroid.
 * Either way the position is an actual authored anchor position — this
 * function never invents coordinates.
 */
export function planStudioRoomPracticals(anchors: readonly StudioInteriorAnchor[]): readonly RoomPlan[] {
  const seen = new Set<string>();
  for (const anchor of anchors) {
    if (!anchor.id || seen.has(anchor.id)) throw new Error('Invalid or duplicate interior anchor');
    if (![...anchor.position, anchor.yaw, ...anchor.footprint].every(Number.isFinite)) {
      throw new Error('Invalid interior anchor');
    }
    seen.add(anchor.id);
  }
  const rooms = new Map<string, {
    house: string; room: string; sum: THREE.Vector3; count: number; focal: THREE.Vector3 | null;
  }>();
  let skipped = 0;
  for (const anchor of anchors) {
    const separator = anchor.id.indexOf('-');
    const house = separator > 0 ? anchor.id.slice(0, separator) : 'house';
    if (!isLitRoom(anchor.room)) { skipped += 1; continue; }
    const key = `${house}/${anchor.room}`;
    const entry = rooms.get(key) ?? { house, room: anchor.room, sum: new THREE.Vector3(), count: 0, focal: null };
    entry.sum.x += anchor.position[0]!;
    entry.sum.y += anchor.position[1]!;
    entry.sum.z += anchor.position[2]!;
    entry.count += 1;
    const token = FOCAL_TOKEN[anchor.room];
    if (token && anchor.id.endsWith(`-${token}`)) {
      entry.focal = new THREE.Vector3(anchor.position[0]!, anchor.position[1]!, anchor.position[2]!);
    }
    rooms.set(key, entry);
  }
  return [...rooms.values()].map((entry) => ({
    house: entry.house,
    room: entry.room,
    position: entry.focal ? entry.focal.clone() : entry.sum.divideScalar(entry.count),
  })).sort((a, b) => a.house.localeCompare(b.house) || a.room.localeCompare(b.room));
}

const scratchWarm = new THREE.Color(WARM_NEUTRAL);
const scratchDeep = new THREE.Color(WARM_DEEP);
const scratchCool = new THREE.Color(COOL_SHIFT);

const isKeyRoom = (room: string): boolean => room === 'living' || room === 'bedroom';
const baseIntensity = (room: string): number => room === 'living' ? KEY_SPOT_BASE
  : room === 'bedroom' ? BEDROOM_SPOT_BASE : room === 'garage' ? GARAGE_FILL_BASE : FILL_BASE;
const baseDistance = (room: string): number => isKeyRoom(room) ? 6.5 : room === 'garage' ? 5.5 : 5;

/**
 * Fixture part geometries, pre-translated so the instance origin is the light
 * position (the bulb/lens plane). Pendant hangs 0.35 m below the ceiling
 * line; flush and batten sit almost against it.
 */
function buildFixtureParts(kind: FixtureKind): Array<{ geometry: THREE.BufferGeometry; glow: boolean }> {
  if (kind === 'pendant') {
    const mount = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16);
    mount.translate(0, FIXTURE_DROP.pendant, 0);
    const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8);
    stem.translate(0, FIXTURE_DROP.pendant - 0.1, 0);
    const shade = new THREE.ConeGeometry(0.17, 0.16, 20, 1, true);
    shade.translate(0, FIXTURE_DROP.pendant - 0.25, 0);
    const bulb = new THREE.SphereGeometry(0.045, 12, 8);
    return [
      { geometry: mount, glow: false },
      { geometry: stem, glow: false },
      { geometry: shade, glow: false },
      { geometry: bulb, glow: true },
    ];
  }
  if (kind === 'flush') {
    const mount = new THREE.CylinderGeometry(0.11, 0.12, 0.04, 16);
    mount.translate(0, 0.02, 0);
    const lens = new THREE.CylinderGeometry(0.085, 0.085, 0.014, 16);
    lens.translate(0, -0.015, 0);
    return [
      { geometry: mount, glow: false },
      { geometry: lens, glow: true },
    ];
  }
  const body = new THREE.BoxGeometry(1.2, 0.06, 0.1);
  body.translate(0, 0.03, 0);
  const tube = new THREE.BoxGeometry(1.08, 0.028, 0.05);
  tube.translate(0, -0.02, 0);
  return [
    { geometry: body, glow: false },
    { geometry: tube, glow: true },
  ];
}

/** Glow ceiling: bounded emissive presence so fixtures read lit, never bloom-flooded. */
const GLOW_BASE_EMISSIVE = 1.2;
const GLOW_PRESENCE_EMISSIVE = 0.8;

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
    const kind = FIXTURE_KIND[plan.room] ?? 'flush';
    const fixtureY = plan.position.y + (FIXTURE_HEIGHT[plan.room] ?? 2.4);
    const lightY = fixtureY - FIXTURE_DROP[kind];
    const light = key ? new THREE.SpotLight(0xffffff, 0, baseDistance(plan.room), SPOT_ANGLE, SPOT_PENUMBRA, 2)
      : new THREE.PointLight(0xffffff, 0, baseDistance(plan.room), 2);
    light.name = `world-studio-practical-${plan.house}-${plan.room}`;
    light.position.set(plan.position.x, lightY, plan.position.z);
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

  // Visible fixtures: one InstancedMesh per (kind, part) across all plans —
  // ≤8 draw calls total, 2 shared materials, no shadow participation.
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b2e33, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide,
  });
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff3dd, emissive: 0xffe2ae, emissiveIntensity: GLOW_BASE_EMISSIVE + GLOW_PRESENCE_EMISSIVE,
    roughness: 0.4,
  });
  const disposables: Array<{ dispose(): void }> = [shellMaterial, glowMaterial];
  let fixtureDrawCalls = 0;

  const plansByKind: Record<FixtureKind, RoomPlan[]> = { pendant: [], flush: [], batten: [] };
  for (const plan of plans) {
    plansByKind[FIXTURE_KIND[plan.room] ?? 'flush'].push(plan);
  }
  const instanceMatrix = new THREE.Matrix4();
  for (const kind of ['pendant', 'flush', 'batten'] as const) {
    const kindPlans = plansByKind[kind];
    if (kindPlans.length === 0) continue;
    const parts = buildFixtureParts(kind);
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.glow ? glowMaterial : shellMaterial, kindPlans.length);
      mesh.name = `world-studio-fixture-${kind}-${part.glow ? 'glow' : 'shell'}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.presentationOnly = true;
      mesh.userData.blocksShots = false;
      kindPlans.forEach((plan, index) => {
        const kind0 = FIXTURE_KIND[plan.room] ?? 'flush';
        const lightY = plan.position.y + (FIXTURE_HEIGHT[plan.room] ?? 2.4) - FIXTURE_DROP[kind0];
        instanceMatrix.makeTranslation(plan.position.x, lightY, plan.position.z);
        mesh.setMatrixAt(index, instanceMatrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      rig.add(mesh);
      disposables.push(part.geometry, mesh);
      fixtureDrawCalls += 1;
    }
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
        presenceScratch.setHex(FILL_TINT[entry.room] ?? FILL_NEUTRAL).lerp(scratchCool, lastTuning.coldness);
      }
      entry.light.color.copy(presenceScratch);
    }
    glowMaterial.emissiveIntensity = GLOW_BASE_EMISSIVE + GLOW_PRESENCE_EMISSIVE * lastTuning.presence;
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
        fixtures: plans.length,
        fixtureDrawCalls,
      };
    },
    dispose() {
      input.scene.remove(rig);
      rig.traverse((node) => {
        if (node instanceof THREE.SpotLight || node instanceof THREE.PointLight) node.shadow?.map?.dispose();
      });
      for (const disposable of disposables) disposable.dispose();
      rig.clear();
      applied.length = 0;
      disposables.length = 0;
      fixtureDrawCalls = 0;
      lastEnvironment = null;
      lastTuning = null;
    },
  };
}
