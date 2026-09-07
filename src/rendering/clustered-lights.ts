import * as THREE from 'three';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import {
  NUKETOWN2_BOUNDS,
  NUKETOWN2_CENTRAL_TRUCK,
  NUKETOWN2_DRIVEWAY_CAR,
  NUKETOWN2_HEAD_CAR,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_LAMP_POST_LAYOUT,
  NUKETOWN2_SECTION,
  NUKETOWN2_STREET_COACH,
  NUKETOWN2_WINDOWS,
} from '../nuketown2-arena';

/**
 * HF-490 fixed-budget local lighting. Three r185 ships the public
 * `ClusteredLighting` addon, but the renderer's default `Lighting` manager is
 * not clustered. We install the addon before WebGPURenderer.init(); its own
 * ClusteredLightsNode owns the reusable light buffers, screen clusters and
 * bounded TSL loop. No upstream source is copied here.
 */
export const NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS = Object.freeze({
  enabledByDefault: true,
  maxLightsPerArena: 48,
  maxLightsPerTile: 24,
  tileSizePixels: 32,
  zSlices: 24,
  pipelineCount: 1,
  pipelineBudgetCeiling: 54,
});

export const CLUSTERED_LIGHTING_PRECOMPILE_REACH = Object.freeze({
  owner: 'pass64-exact-scene-pass',
  installedBy: 'WebGpuRenderRuntime.create',
  beforeCombat: true,
});

export type ClusteredLightKind = 'window' | 'porch' | 'garage' | 'street' | 'appliance' | 'vehicle';

export type Nuketown2LocalLightSpec = Readonly<{
  id: string;
  pairId: string | null;
  kind: ClusteredLightKind;
  position: readonly [number, number, number];
  color: number;
  intensity: number;
  distance: number;
  decay: number;
  source: string;
}>;

const asPosition = (x: number, y: number, z: number): readonly [number, number, number] => Object.freeze([x, y, z]);

function spec(
  id: string,
  pairId: string | null,
  kind: ClusteredLightKind,
  position: readonly [number, number, number],
  color: number,
  intensity: number,
  distance: number,
  source: string,
): Nuketown2LocalLightSpec {
  return Object.freeze({ id, pairId, kind, position, color, intensity, distance, decay: 2, source });
}

/** The catalog involution used by the arena's own `pair()` helper. */
function pair(
  id: string,
  kind: ClusteredLightKind,
  position: readonly [number, number, number],
  color: number,
  intensity: number,
  distance: number,
  source: string,
): readonly [Nuketown2LocalLightSpec, Nuketown2LocalLightSpec] {
  return Object.freeze([
    spec(`${id}-north`, id, kind, asPosition(position[0], position[1], position[2]), color, intensity, distance, source),
    spec(`${id}-south`, id, kind, asPosition(-position[0], position[1], -position[2]), color, intensity, distance, source),
  ]);
}

function single(
  id: string,
  kind: ClusteredLightKind,
  position: readonly [number, number, number],
  color: number,
  intensity: number,
  distance: number,
  source: string,
): Nuketown2LocalLightSpec {
  return spec(id, null, kind, position, color, intensity, distance, source);
}

const catalog: Nuketown2LocalLightSpec[] = [];

// Window emitters sit inside the exact openings used by the arena builder.
for (const window of NUKETOWN2_WINDOWS) {
  const interiorZ = window.face === 'front' ? window.wallZ - 0.65 : window.wallZ + 0.65;
  const y = window.pane ? 1.7 : window.sillTop + 0.65;
  catalog.push(...pair(
    `window-${window.id.replaceAll(' ', '-')}`,
    'window',
    [(window.x0 + window.x1) / 2, y, interiorZ],
    0xffbd72,
    window.pane ? 1.2 : 1.05,
    9.5,
    `NUKETOWN2_WINDOWS:${window.id}`,
  ));
}

const northHouse = NUKETOWN2_HOUSE_LAYOUT[0]!;
const frontZ = NUKETOWN2_WINDOWS.find((window) => window.face === 'front')!.wallZ;
const backZ = NUKETOWN2_WINDOWS.find((window) => window.face === 'back')!.wallZ;
const garageCenterX = northHouse.x + NUKETOWN2_SECTION.houseWidth / 2 + NUKETOWN2_SECTION.garageWidth / 2;
const garageFrontZ = frontZ - NUKETOWN2_SECTION.garageSetback;
const garageBackZ = backZ;

catalog.push(...pair(
  'porch-door',
  'porch',
  [northHouse.x, 2.35, northHouse.z + northHouse.facing * (NUKETOWN2_SECTION.houseDepth / 2 + 0.35)],
  0xffa44d,
  1.7,
  8,
  'yard porch body + house back door',
));
catalog.push(...pair(
  'garage-tube',
  'garage',
  [garageCenterX, 3.15, (garageFrontZ + garageBackZ) / 2],
  0x9bc7ff,
  1.55,
  9,
  'garage tube light body',
));

for (const lamp of NUKETOWN2_LAMP_POST_LAYOUT) {
  catalog.push(...pair(
    `lamp-post-${lamp.id}`,
    'street',
    [lamp.x, lamp.fixtureY, lamp.z],
    0xff813d,
    1.9,
    13,
    `verge ${lamp.id} lamp post body`,
  ));
}

// The kitchen counter and rear-room shelf are the authored appliance banks;
// their paired positions are the neon accent sources rather than new geometry.
catalog.push(...pair(
  'appliance-kitchen',
  'appliance',
  [-4.8, 1.65, frontZ - 2.8],
  0x39e7ff,
  0.85,
  5.5,
  'house kitchen counter + appliance bank',
));
catalog.push(...pair(
  'appliance-living',
  'appliance',
  [1.5, 1.65, backZ + 2.4],
  0xff267d,
  0.7,
  5.5,
  'house living shelf + appliance bank',
));

const truck = NUKETOWN2_CENTRAL_TRUCK;
const truckHeadX = truck.cabX + truck.cabLength / 2 + 0.04;
for (const side of [-1, 1]) {
  catalog.push(single(
    `truck-headlamp-${side < 0 ? 'left' : 'right'}`,
    'vehicle',
    [truckHeadX, 0.95, truck.z + side * (truck.width / 2 - 0.35)],
    0xfff0c2,
    2.2,
    14,
    'central truck headlight body',
  ));
}

const coach = NUKETOWN2_STREET_COACH;
const coachHeadX = coach.x + coach.length / 2 + 0.04;
for (const side of [-1, 1]) {
  catalog.push(single(
    `coach-headlamp-${side < 0 ? 'left' : 'right'}`,
    'vehicle',
    [coachHeadX, 0.98, coach.z + side * (coach.width / 2 - 0.35)],
    0xfff0c2,
    2.2,
    14,
    'street coach headlight body',
  ));
}

for (const side of [-1, 1]) {
  catalog.push(single(
    `head-car-headlamp-${side < 0 ? 'left' : 'right'}`,
    'vehicle',
    [NUKETOWN2_HEAD_CAR.x + NUKETOWN2_HEAD_CAR.headlightX, 0.68, NUKETOWN2_HEAD_CAR.z + side * NUKETOWN2_HEAD_CAR.headlightZ],
    0xfff0c2,
    1.9,
    12,
    'head car headlight body',
  ));
}

// Driveway-car lamps follow the same garage-derived centre used by the arena's
// paired civilian cars, so each side has two fixed forward-facing sources.
const drivewayCarX = NUKETOWN2_DRIVEWAY_CAR.x;
const drivewayCarZ = NUKETOWN2_DRIVEWAY_CAR.z;
for (const offset of [-0.7, 0.7]) {
  catalog.push(...pair(
    `driveway-car-${offset < 0 ? 'left' : 'right'}`,
    'vehicle',
    [drivewayCarX + offset, 0.68, drivewayCarZ + 2.22],
    0xfff0c2,
    1.8,
    12,
    'paired driveway car headlight body',
  ));
}

export const NUKETOWN2_LOCAL_LIGHT_CATALOG: readonly Nuketown2LocalLightSpec[] = Object.freeze(catalog);
export const NUKETOWN2_LOCAL_LIGHT_COUNT = NUKETOWN2_LOCAL_LIGHT_CATALOG.length;

export const LOCAL_LIGHT_DUSK_START_HOUR = 15.5;
export const LOCAL_LIGHT_FULL_HOUR = 18;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Monotone fade-in from golden hour to night; the selected hour is uniform data. */
export function duskLocalLightFade(hour: number): number {
  const t = clamp01((hour - LOCAL_LIGHT_DUSK_START_HOUR) / (LOCAL_LIGHT_FULL_HOUR - LOCAL_LIGHT_DUSK_START_HOUR));
  return t * t * (3 - 2 * t);
}

export function createNuketown2ClusteredLighting(): ClusteredLighting {
  return new ClusteredLighting(
    NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerArena,
    NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.tileSizePixels,
    NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.zSlices,
    NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerTile,
  );
}

export type Nuketown2ClusteredLightRig = Readonly<{
  enabled: boolean;
  requiresColdSessionPrecompile: boolean;
  lights: readonly THREE.PointLight[];
  applyLighting(arenaId: string, hour: number): void;
  telemetry(): Readonly<{ enabled: boolean; localLightCount: number; maxLightsPerArena: number; maxLightsPerTile: number }>;
}>;

const OFF_RIG: Nuketown2ClusteredLightRig = Object.freeze({
  enabled: false,
  requiresColdSessionPrecompile: false,
  lights: Object.freeze([]),
  applyLighting: () => undefined,
  telemetry: () => Object.freeze({
    enabled: false,
    localLightCount: 0,
    maxLightsPerArena: NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerArena,
    maxLightsPerTile: NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerTile,
  }),
});

export function createNuketown2LocalLights(
  scene: THREE.Scene,
  enabled: boolean,
): Nuketown2ClusteredLightRig {
  if (!enabled) return OFF_RIG;
  const lights: THREE.PointLight[] = [];
  const bindings: Array<Readonly<{ light: THREE.PointLight; baseIntensity: number }>> = [];
  for (const entry of NUKETOWN2_LOCAL_LIGHT_CATALOG) {
    const light = new THREE.PointLight(entry.color, 0, entry.distance, entry.decay);
    light.name = `nuketown2 clustered local ${entry.id}`;
    light.position.set(...entry.position);
    light.castShadow = false;
    light.userData.clusteredLocalLight = true;
    light.userData.clusteredSource = entry.source;
    scene.add(light);
    lights.push(light);
    bindings.push(Object.freeze({ light, baseIntensity: entry.intensity }));
  }
  const applyLighting = (arenaId: string, hour: number): void => {
    const fade = arenaId === 'nuketown2' ? duskLocalLightFade(hour) : 0;
    for (const binding of bindings) binding.light.intensity = binding.baseIntensity * fade;
  };
  return Object.freeze({
    enabled: true,
    requiresColdSessionPrecompile: true,
    lights: Object.freeze(lights),
    applyLighting,
    telemetry: () => Object.freeze({
      enabled: true,
      localLightCount: NUKETOWN2_LOCAL_LIGHT_COUNT,
      maxLightsPerArena: NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerArena,
      maxLightsPerTile: NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerTile,
    }),
  });
}

export function assertNuketown2ClusteredLightCatalog(): void {
  if (NUKETOWN2_LOCAL_LIGHT_COUNT > NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.maxLightsPerArena) {
    throw new Error('Nuke Town clustered local-light catalog exceeds its arena budget');
  }
  for (const entry of NUKETOWN2_LOCAL_LIGHT_CATALOG) {
    if (entry.position.some((value) => !Number.isFinite(value))) throw new Error(`Invalid clustered light position: ${entry.id}`);
    if (entry.kind === 'street' && (entry.position[0] < NUKETOWN2_BOUNDS.minX || entry.position[0] > NUKETOWN2_BOUNDS.maxX)) {
      throw new Error(`Street light is outside Nuke Town bounds: ${entry.id}`);
    }
  }
}
