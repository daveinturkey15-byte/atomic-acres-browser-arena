import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { STUDIO_ENVIRONMENTS, studioEnvironmentForSeed } from '../environment';
import type { StudioEnvironment, StudioPresetId } from '../environment';
import type { StudioInteriorAnchor } from '../interiors';
import {
  STUDIO_LIGHTING_PRESET,
  createStudioLighting,
  derivePracticalTuning,
  planStudioRoomPracticals,
  type StudioLightingMode,
} from './index';

const preset = (id: StudioPresetId): StudioEnvironment =>
  STUDIO_ENVIRONMENTS.find((environment) => environment.id === id)!;

/** Mirrors house.ts:985-994 for both houses (world-space anchors). */
const fixtureAnchors = (houses: readonly string[]): StudioInteriorAnchor[] =>
  houses.flatMap((house) => [
    { id: `${house}-sofa`, room: 'living', position: [house === 'teal' ? 5.4 : -5.4, 0.08, -4.4], yaw: 0, footprint: [2.2, 0.9] },
    { id: `${house}-coffee-table`, room: 'living', position: [house === 'teal' ? 3.6 : -3.6, 0.08, -4.4], yaw: 0, footprint: [1.2, 0.6] },
    { id: `${house}-dining-table`, room: 'dining', position: [house === 'teal' ? -3.4 : 3.4, 0.08, -3.4], yaw: 0, footprint: [1.6, 1] },
    { id: `${house}-kitchen-run`, room: 'kitchen', position: [house === 'teal' ? -6.2 : 6.2, 0.08, 5.2], yaw: 0, footprint: [4.4, 0.65] },
    { id: `${house}-bed`, room: 'bedroom', position: [house === 'teal' ? 4.6 : -4.6, 3.3, -5.2], yaw: 0, footprint: [2, 1.9] },
    { id: `${house}-desk`, room: 'study', position: [house === 'teal' ? -5.8 : 5.8, 3.3, -6], yaw: 0, footprint: [1.6, 0.7] },
    { id: `${house}-bed2`, room: 'bedroom2', position: [house === 'teal' ? -5.4 : 5.4, 3.3, 6.6], yaw: 0, footprint: [1.9, 1.4] },
    { id: `${house}-workbench`, room: 'garage', position: [house === 'teal' ? -3 : 3, 0.06, 11.5], yaw: 0, footprint: [2.4, 0.7] },
  ]);

const ALL_ANCHORS = fixtureAnchors(['teal', 'yellow']);

describe('studio practical tuning derivation', () => {
  it('stays finite and inside declared bounds for the whole frozen catalog', () => {
    for (const environment of STUDIO_ENVIRONMENTS) {
      const tuning = derivePracticalTuning(environment);
      expect(tuning.presence).toBeGreaterThanOrEqual(1);
      expect(tuning.presence).toBeLessThanOrEqual(STUDIO_LIGHTING_PRESET.maximumPresence);
      expect(tuning.warmth).toBeGreaterThanOrEqual(0);
      expect(tuning.warmth).toBeLessThanOrEqual(1);
      expect(tuning.coldness).toBeGreaterThanOrEqual(0);
      expect(tuning.coldness).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic in the environment alone', () => {
    for (const environment of STUDIO_ENVIRONMENTS) {
      expect(derivePracticalTuning(environment)).toEqual(derivePracticalTuning(environment));
    }
  });

  it('reads practicals stronger and warmer under rain than at clear noon', () => {
    const noon = derivePracticalTuning(preset('clear-noon'));
    const rain = derivePracticalTuning(preset('spring-rain'));
    expect(rain.presence).toBeGreaterThan(noon.presence);
    expect(rain.warmth).toBeGreaterThan(noon.warmth);
  });

  it('cools fills under snow only, never at clear noon', () => {
    expect(derivePracticalTuning(preset('clear-noon')).coldness).toBe(0);
    expect(derivePracticalTuning(preset('winter-snow')).coldness).toBeGreaterThan(0);
  });

  it('resolves identical tuning from any seeded match environment', () => {
    for (let seed = 0; seed < 16; seed += 1) {
      const environment = studioEnvironmentForSeed(seed);
      const again = studioEnvironmentForSeed(seed);
      expect(derivePracticalTuning(environment)).toEqual(derivePracticalTuning(again));
    }
  });

  it('gives service-room fills a cooler base than living-room fills at clear noon', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Object3D();
    const controller = createStudioLighting({
      root, scene, anchors: ALL_ANCHORS, mode: 'presentation',
      getEnvironment: () => preset('clear-noon'),
    });
    controller.update();
    const rig = scene.getObjectByName('world-studio-lighting')!;
    const colorOf = (room: string): THREE.Color => {
      const light = rig.children.find((node) => node.name === `world-studio-practical-teal-${room}`) as THREE.Light;
      return light.color;
    };
    const kitchen = colorOf('kitchen');
    const dining = colorOf('dining');
    expect(kitchen.b).toBeGreaterThan(kitchen.r); // cool service fill
    expect(dining.r).toBeGreaterThan(dining.b); // warm living fill
    controller.dispose();
  });
});

describe('room practical planning', () => {
  it('plans one centroid per lit house room, sorted, ignoring unlit rooms', () => {
    const plans = planStudioRoomPracticals(ALL_ANCHORS);
    expect(plans).toHaveLength(14); // 7 rooms x 2 houses
    const living = plans.find((plan) => plan.house === 'teal' && plan.room === 'living')!;
    expect(living.position.x).toBeCloseTo((5.4 + 3.6) / 2, 5);
    expect(living.position.y).toBeCloseTo(0.08, 5);
    const sorted = [...plans].sort((a, b) => a.house.localeCompare(b.house) || a.room.localeCompare(b.room));
    expect(plans).toEqual(sorted);
  });

  it('fails closed on duplicate, unnamed or non-finite anchors', () => {
    const duplicate = [...ALL_ANCHORS, ALL_ANCHORS[0]!];
    expect(() => planStudioRoomPracticals(duplicate)).toThrow(/duplicate/i);
    expect(() => planStudioRoomPracticals([
      { id: 'x-room', room: 'living', position: [Number.NaN, 0, 0], yaw: 0, footprint: [1, 1] },
    ])).toThrow(/invalid/i);
  });
});

describe.each<StudioLightingMode>(['presentation', 'preview'])('studio lighting rig (%s)', (mode) => {
  const make = () => {
    const scene = new THREE.Scene();
    const root = new THREE.Object3D();
    const controller = createStudioLighting({
      root, scene, anchors: ALL_ANCHORS, mode,
      getEnvironment: () => root.userData.env as StudioEnvironment | undefined,
    });
    return { scene, root, controller };
  };

  it(`allocates a bounded, occlusion-clean rig (${mode})`, () => {
    const { root, scene, controller } = make();
    root.userData.env = preset('clear-noon');
    controller.update();
    const telemetry = controller.telemetry();
    expect(telemetry.mode).toBe(mode);
    expect(telemetry.activeLights).toBe(14);
    expect(telemetry.activeLights).toBeLessThanOrEqual(
      STUDIO_LIGHTING_PRESET.maximumShadowLights + STUDIO_LIGHTING_PRESET.maximumFillLights,
    );
    expect(telemetry.occlusion.violations).toEqual([]);
    if (mode === 'presentation') {
      expect(telemetry.shadowedLights).toBe(4); // living + bedroom per house
      expect(telemetry.shadowedLights).toBeLessThanOrEqual(STUDIO_LIGHTING_PRESET.maximumShadowLights);
    } else {
      expect(telemetry.shadowedLights).toBe(0);
    }
    scene.clear();
    controller.dispose();
  });

  it('tags every light presentation-only and off the shot graph', () => {
    const { scene, controller } = make();
    controller.update();
    const rig = scene.getObjectByName('world-studio-lighting')!;
    rig.traverse((node) => {
      expect(node.userData.presentationOnly).toBe(true);
      expect(node.userData.blocksShots).toBe(false);
    });
    controller.dispose();
  });

  it('derives intensity from the environment and caches by preset identity', () => {
    const { root, controller } = make();
    root.userData.env = preset('clear-noon');
    controller.update();
    const noon = controller.telemetry();
    expect(noon.lastEnvironmentId).toBe('clear-noon');
    expect(noon.lastTuning!.presence).toBeCloseTo(derivePracticalTuning(preset('clear-noon')).presence, 12);
    controller.update(); // same frozen object: no re-derivation drift
    expect(controller.telemetry()).toEqual(noon);
    root.userData.env = preset('spring-rain');
    controller.update();
    const rain = controller.telemetry();
    expect(rain.lastEnvironmentId).toBe('spring-rain');
    expect(rain.lastTuning!.presence).toBeGreaterThan(noon.lastTuning!.presence);
    controller.dispose();
  });

  it('is deterministic across repeated construction and disposes cleanly', () => {
    const scene = new THREE.Scene();
    const baseline = scene.children.length;
    const controller = createStudioLighting({
      root: new THREE.Object3D(), scene, anchors: ALL_ANCHORS, mode,
      getEnvironment: () => preset('clear-noon'),
    });
    controller.update();
    const first = controller.telemetry();
    controller.dispose();
    expect(scene.children.length).toBe(baseline);

    const controller2 = createStudioLighting({
      root: new THREE.Object3D(), scene, anchors: ALL_ANCHORS, mode,
      getEnvironment: () => preset('clear-noon'),
    });
    controller2.update();
    expect(controller2.telemetry().litRooms).toEqual(first.litRooms);
    controller2.dispose();
    expect(scene.children.length).toBe(baseline);
    const after = controller2.telemetry();
    expect(after.activeLights).toBe(0);
    expect(after.occlusion.activeLocalLights).toBe(0);
  });

  it('keeps every applied intensity finite and physically bounded', () => {
    const { root, scene, controller } = make();
    for (const environment of STUDIO_ENVIRONMENTS) {
      root.userData.env = environment;
      controller.update();
      const rig = scene.getObjectByName('world-studio-lighting')!;
      rig.traverse((node) => {
        if (node instanceof THREE.Light) {
          expect(Number.isFinite(node.intensity)).toBe(true);
          expect(node.intensity).toBeGreaterThan(0);
          expect(node.intensity).toBeLessThanOrEqual(48 * STUDIO_LIGHTING_PRESET.maximumPresence);
          expect(Number.isFinite(node.color.r + node.color.g + node.color.b)).toBe(true);
        }
      });
    }
    controller.dispose();
  });
});

describe('studio lighting input validation', () => {
  it('refuses a shadow-key budget smaller than the focal-room plan', () => {
    const scene = new THREE.Scene();
    expect(() => createStudioLighting({
      root: new THREE.Object3D(), scene, anchors: ALL_ANCHORS,
      mode: 'presentation', preset: { ...STUDIO_LIGHTING_PRESET, maximumShadowLights: 2 },
    })).toThrow(/budget/i);
  });

  it('defaults to the shared environment the weather router writes', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Object3D();
    root.userData.worldStudioEnvironment = preset('golden-wind');
    const controller = createStudioLighting({ root, scene, anchors: ALL_ANCHORS });
    controller.update();
    expect(controller.telemetry().lastEnvironmentId).toBe('golden-wind');
    controller.dispose();
  });
});
