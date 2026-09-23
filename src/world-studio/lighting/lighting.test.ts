import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
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
import { createStudioPbrLibrary, type StudioPbrConsumer } from '../pbr-library';
import { GARAGE_ROOF_Y, GROUND_FLOOR_Y, UPPER_CEILING_Y, UPPER_FLOOR_Y } from '../architecture/house';

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
  it('plans one practical per lit house room over the focal furniture anchor, sorted', () => {
    const plans = planStudioRoomPracticals(ALL_ANCHORS);
    expect(plans).toHaveLength(14); // 7 rooms x 2 houses
    const living = plans.find((plan) => plan.house === 'teal' && plan.room === 'living')!;
    // Focal rule: lands on the <house>-coffee-table anchor, not the centroid.
    expect(living.position.x).toBeCloseTo(3.6, 5);
    expect(living.position.y).toBeCloseTo(0.08, 5);
    expect(living.position.z).toBeCloseTo(-4.4, 5);
    const bedroom = plans.find((plan) => plan.house === 'yellow' && plan.room === 'bedroom')!;
    expect(bedroom.position.x).toBeCloseTo(-4.6, 5); // focal <house>-bed anchor
    const sorted = [...plans].sort((a, b) => a.house.localeCompare(b.house) || a.room.localeCompare(b.room));
    expect(plans).toEqual(sorted);
  });

  it('falls back to the centroid when a room has no focal anchor', () => {
    const anchors: StudioInteriorAnchor[] = [
      { id: 'h-sofa', room: 'living', position: [2, 0.1, 3], yaw: 0, footprint: [1, 1] },
      { id: 'h-chair', room: 'living', position: [4, 0.1, 3], yaw: 0, footprint: [1, 1] },
    ];
    const [plan] = planStudioRoomPracticals(anchors);
    expect(plan!.position.x).toBeCloseTo(3, 5);
  });

  it('fails closed on duplicate, unnamed or non-finite anchors', () => {
    const duplicate = [...ALL_ANCHORS, ALL_ANCHORS[0]!];
    expect(() => planStudioRoomPracticals(duplicate)).toThrow(/duplicate/i);
    expect(() => planStudioRoomPracticals([
      { id: 'x-room', room: 'living', position: [Number.NaN, 0, 0], yaw: 0, footprint: [1, 1] },
    ])).toThrow(/invalid/i);
  });
});

describe('practical mount plane', () => {
  /** Fixture drop below the mount plane, per room's fixture kind (index.ts FIXTURE_DROP). */
  const DROP: Readonly<Record<string, number>> = {
    living: 0.35, dining: 0.35, // pendant
    kitchen: 0.02, bedroom: 0.02, bedroom2: 0.02, study: 0.02, // flush
    garage: 0.05, // batten
  };
  /** Pass-1 mount heights and candela, before the 2026-09-13 mount correction. */
  const PASS1_HEIGHT: Readonly<Record<string, number>> = {
    living: 2.55, dining: 2.55, kitchen: 2.55, bedroom: 2.1, bedroom2: 2.1, study: 2.1, garage: 2.4,
  };
  const PASS1_BASE: Readonly<Record<string, number>> = {
    living: 20, dining: 6.5, kitchen: 6.5, bedroom: 14, bedroom2: 6.5, study: 6.5, garage: 5,
  };
  /**
   * Authored ceiling planes, derived from the exported house constants rather
   * than restated: "3.0 m clear per storey" (house.ts:14-15) puts the
   * ground-floor ceiling at the upper slab's underside and the upper ceiling at
   * UPPER_CEILING_Y. SLAB (0.22) and the garage roof thickness (0.2) are not
   * exported, so those two appear as literals and are cross-checked below.
   */
  const CLEAR_STOREY = UPPER_CEILING_Y - UPPER_FLOOR_Y;
  const CEILING_Y: Readonly<Record<string, number>> = {
    living: GROUND_FLOOR_Y + CLEAR_STOREY, dining: GROUND_FLOOR_Y + CLEAR_STOREY,
    kitchen: GROUND_FLOOR_Y + CLEAR_STOREY,
    bedroom: UPPER_CEILING_Y, bedroom2: UPPER_CEILING_Y, study: UPPER_CEILING_Y,
    garage: GARAGE_ROOF_Y - 0.2,
  };

  const rigOf = (): { scene: THREE.Scene; controller: ReturnType<typeof createStudioLighting> } => {
    const scene = new THREE.Scene();
    const controller = createStudioLighting({
      root: new THREE.Object3D(), scene, anchors: ALL_ANCHORS, mode: 'presentation',
      getEnvironment: () => preset('clear-noon'),
    });
    controller.update();
    return { scene, controller };
  };

  it('keeps the anchor fixture in step with the authored house floor lines', () => {
    // The mount planes below are only meaningful if these anchors are real.
    expect(CLEAR_STOREY).toBeCloseTo(3, 9);
    expect(GROUND_FLOOR_Y + CLEAR_STOREY).toBeCloseTo(UPPER_FLOOR_Y - 0.22, 9); // SLAB, house.ts
    for (const anchor of ALL_ANCHORS) {
      const expected = anchor.room === 'garage' ? 0.06
        : ['bedroom', 'bedroom2', 'study'].includes(anchor.room) ? UPPER_FLOOR_Y : GROUND_FLOOR_Y;
      expect(anchor.position[1], anchor.id).toBeCloseTo(expected, 9);
    }
  });

  it('hangs every lamp its own fixture drop below the authored ceiling, not in mid-air', () => {
    const { scene, controller } = rigOf();
    const rig = scene.getObjectByName('world-studio-lighting')!;
    for (const room of Object.keys(CEILING_Y)) {
      const light = rig.children.find((node) => node.name === `world-studio-practical-teal-${room}`)!;
      const mountY = light.position.y + DROP[room]!;
      expect(mountY, `${room} mount plane`).toBeCloseTo(CEILING_Y[room]!, 9);
      // Pass 1 floated these by 0.45 m (ground), 0.90 m (upper), 0.84 m (garage).
      const anchorY = ALL_ANCHORS.find((anchor) => anchor.room === room)!.position[1]!;
      expect(CEILING_Y[room]! - (anchorY + PASS1_HEIGHT[room]!), `${room} pass-1 float`).toBeGreaterThan(0.4);
    }
    controller.dispose();
  });

  it('places each visible fixture instance on its own lamp, never on a stale plane', () => {
    const { scene, controller } = rigOf();
    const rig = scene.getObjectByName('world-studio-lighting')!;
    const lampYs = rig.children.filter((node): node is THREE.Light => node instanceof THREE.Light)
      .map((light) => light.position.y);
    const matrix = new THREE.Matrix4();
    const offset = new THREE.Vector3();
    for (const mesh of rig.children.filter((node): node is THREE.InstancedMesh => node instanceof THREE.InstancedMesh)) {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        offset.setFromMatrixPosition(matrix);
        // instanceMatrix is a Float32Array, so the lamp Y round-trips to ~2.4e-7 at this scale.
        expect(lampYs.some((y) => Math.abs(y - offset.y) < 1e-6), `${mesh.name}[${index}] y=${offset.y}`).toBe(true);
      }
    }
    controller.dispose();
  });

  it('delivers the illuminance pass 1 authored at every focal plane', () => {
    const { scene, controller } = rigOf();
    const presence = derivePracticalTuning(preset('clear-noon')).presence;
    const rig = scene.getObjectByName('world-studio-lighting')!;
    for (const room of Object.keys(CEILING_Y)) {
      const light = rig.children.find((node) => node.name === `world-studio-practical-teal-${room}`) as THREE.Light;
      const anchorY = ALL_ANCHORS.find((anchor) => anchor.room === room)!.position[1]!;
      const authored = PASS1_BASE[room]! / (PASS1_HEIGHT[room]! - DROP[room]!) ** 2;
      const delivered = (light.intensity / presence) / (light.position.y - anchorY) ** 2;
      expect(delivered, `${room} illuminance`).toBeCloseTo(authored, 9);
      expect(light.intensity).toBeGreaterThan(PASS1_BASE[room]!); // longer throw needs more candela
    }
    controller.dispose();
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

  it(`hangs one visible fixture per practical with bounded instanced cost (${mode})`, () => {
    const { scene, controller } = make();
    controller.update();
    const telemetry = controller.telemetry();
    expect(telemetry.fixtures).toBe(14);
    const rig = scene.getObjectByName('world-studio-lighting')!;
    const fixtureMeshes = rig.children.filter((node): node is THREE.InstancedMesh => node instanceof THREE.InstancedMesh);
    expect(telemetry.fixtureDrawCalls).toBe(fixtureMeshes.length);
    expect(fixtureMeshes.length).toBeGreaterThan(0);
    expect(fixtureMeshes.length).toBeLessThanOrEqual(8); // ≤8 draw calls: pendant×4 + flush×2 + batten×2
    const totalInstances = fixtureMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    // Part instances, not fixtures: pendant 4 plans x 4 parts, flush 8 x 2, batten 2 x 2.
    expect(totalInstances).toBe(4 * 4 + 8 * 2 + 2 * 2);
    for (const mesh of fixtureMeshes) {
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(Number.isFinite(mesh.instanceMatrix.array[0] as number)).toBe(true);
    }
    controller.dispose();
    expect(scene.children.length).toBe(0);
  });

  it(`keeps fixture glow emissive finite and bounded across every environment (${mode})`, () => {
    const { root, scene, controller } = make();
    for (const environment of STUDIO_ENVIRONMENTS) {
      root.userData.env = environment;
      controller.update();
      const rig = scene.getObjectByName('world-studio-lighting')!;
      rig.traverse((node) => {
        if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial && node.material.emissiveIntensity > 0) {
          expect(Number.isFinite(node.material.emissiveIntensity)).toBe(true);
          expect(node.material.emissiveIntensity).toBeLessThanOrEqual(2.4 + 1e-9);
        }
      });
    }
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

describe('studio pbr library', () => {
  it('requests existing public files and uses the real TextureLoader error callback slot', async () => {
    const urls: string[] = [];
    const spy = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, _ok, progress, fail) => {
      urls.push(url);
      expect(progress).toBeUndefined();
      expect(fail).toBeTypeOf('function');
      queueMicrotask(() => fail!(new Error('synthetic decode failure')));
      return new THREE.Texture();
    });
    try {
      const library = createStudioPbrLibrary();
      await expect(library.whenReady()).rejects.toThrow(/failed to load/);
      expect(urls).toHaveLength(6);
      for (const url of urls) expect(existsSync(`public/${url}`), url).toBe(true);
      expect(library.isReady()).toBe(false);
      library.dispose();
    } finally { spy.mockRestore(); }
  });

  it('rejects pending readiness on disposal and releases late loaded textures exactly once', async () => {
    const pending: Array<{ texture: THREE.Texture; resolve: (texture: THREE.Texture) => void; dispose: ReturnType<typeof vi.spyOn> }> = [];
    const library = createStudioPbrLibrary('test', { load(_url, resolve) {
      const texture = new THREE.Texture();
      pending.push({ texture, resolve, dispose: vi.spyOn(texture, 'dispose') });
      return texture;
    } });
    const ready = library.whenReady();
    const rejection = expect(ready).rejects.toThrow(/disposed/);
    library.dispose();
    await rejection;
    for (const request of pending) request.resolve(request.texture);
    await Promise.resolve();
    expect(library.isReady()).toBe(false);
    for (const request of pending) expect(request.dispose).toHaveBeenCalledTimes(1);
    await expect(library.whenReady()).rejects.toThrow(/disposed/);
  });

  it('cleans partial successes and late arrivals after a map fails', async () => {
    const requests: Array<{ texture: THREE.Texture; ok: (texture: THREE.Texture) => void; fail: (error: unknown) => void; dispose: ReturnType<typeof vi.spyOn> }> = [];
    const library = createStudioPbrLibrary('test', { load(_url, ok, _progress, fail) {
      const texture = new THREE.Texture();
      requests.push({ texture, ok, fail, dispose: vi.spyOn(texture, 'dispose') });
      return texture;
    } });
    const rejection = expect(library.whenReady()).rejects.toThrow(/failed to load/);
    requests[0]!.ok(requests[0]!.texture);
    requests[1]!.fail(new Error('bad image'));
    await rejection;
    for (const request of requests.slice(2)) request.ok(request.texture);
    await Promise.resolve();
    library.dispose();
    for (const request of requests) expect(request.dispose).toHaveBeenCalledTimes(1);
    expect(library.isReady()).toBe(false);
  });

  const makeTexture = (): THREE.Texture => {
    const texture = new THREE.Texture();
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.image = {}; // sentinel: observable through dispose-to-null in r185
    return texture;
  };
  /** DI loader seam: resolves every request against a fresh dummy texture. */
  const stubLoader = (): { loader: Parameters<typeof createStudioPbrLibrary>[1]; loaded: string[] } => {
    const loaded: string[] = [];
    const loader: Parameters<typeof createStudioPbrLibrary>[1] = {
      load(url, onLoad) {
        loaded.push(url);
        onLoad(makeTexture());
      },
    };
    return { loader, loaded };
  };

  it('loads every map once, marks albedo sRGB and keeps normal/roughness linear', async () => {
    const { loader, loaded } = stubLoader();
    const library = createStudioPbrLibrary('test-base', loader);
    expect(library.isReady()).toBe(false);
    await library.whenReady();
    expect(library.isReady()).toBe(true);
    expect(loaded).toHaveLength(6); // 3 maps x 2 assets, requested exactly once
    library.load(); // second call is idempotent: no further requests
    expect(loaded).toHaveLength(6);
    const consumer = library.createConsumer('brushed_concrete_03', { sizeMeters: [8, 2.55] });
    expect(consumer.material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(consumer.material.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(consumer.material.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
    library.dispose();
  });

  it('derives physical UV repeat from real surface size over the tile meters', async () => {
    const { loader } = stubLoader();
    const library = createStudioPbrLibrary('test-base', loader);
    await library.whenReady();
    const road = library.createConsumer('asphalt_02', { sizeMeters: [12, 60] }); // 3 m tile
    expect(road.material.map!.repeat.x).toBeCloseTo(4, 12);
    expect(road.material.map!.repeat.y).toBeCloseTo(20, 12);
    const wall = library.createConsumer('brushed_concrete_03', { sizeMeters: [8, 2.55] }); // 2 m tile
    expect(wall.material.map!.repeat.x).toBeCloseTo(4, 12);
    expect(wall.material.map!.repeat.y).toBeCloseTo(2.55 / 2, 12);
    expect(wall.material.normalScale.x).toBeLessThanOrEqual(1); // restrained by default
    library.dispose();
  });

  it('clones textures per consumer so repeat mutations never leak', async () => {
    const { loader } = stubLoader();
    const library = createStudioPbrLibrary('test-base', loader);
    await library.whenReady();
    const a = library.createConsumer('asphalt_02', { sizeMeters: [3, 3] });
    const b = library.createConsumer('asphalt_02', { sizeMeters: [6, 6] });
    expect(a.material.map).not.toBe(b.material.map);
    a.material.map!.repeat.set(99, 99);
    expect(b.material.map!.repeat.x).toBeCloseTo(2, 12); // unaffected
    expect(a.material.map!.image).toBe(b.material.map!.image); // shared original pixels
    const spyDisposes = (consumer: StudioPbrConsumer): (() => number[]) => {
      const counts = consumer.textures.map(() => ({ n: 0 }));
      consumer.textures.forEach((texture, index) => {
        const original = texture.dispose.bind(texture);
        texture.dispose = (): void => {
          counts[index]!.n += 1;
          original();
        };
      });
      return () => counts.map((count) => count.n);
    };
    const countA = spyDisposes(a);
    const countB = spyDisposes(b);
    library.release(a);
    expect(countA()).toEqual([1, 1, 1]); // exactly a's clones, exactly once
    expect(countB()).toEqual([0, 0, 0]); // sibling untouched by a's release
    library.dispose(); // originals + remaining consumer b
    expect(countB()).toEqual([1, 1, 1]);
    library.dispose(); // idempotent: no second pass over anything
    expect(countB()).toEqual([1, 1, 1]);
  });

  it('fails closed on unknown assets, premature consumers and non-finite sizes', async () => {
    const { loader } = stubLoader();
    const library = createStudioPbrLibrary('test-base', loader);
    expect(() => library.createConsumer('asphalt_02', { sizeMeters: [3, 3] })).toThrow(/not loaded/i);
    await library.whenReady();
    expect(() => library.createConsumer('blue_painted_planks', { sizeMeters: [3, 3] })).toThrow(/unknown asset/i);
    expect(() => library.createConsumer('asphalt_02', { sizeMeters: [Number.NaN, 3] })).toThrow(/finite positive/i);
    expect(() => library.createConsumer('asphalt_02', { sizeMeters: [3, 3], normalScale: 4 })).toThrow(/restrained/i);
    library.dispose();
    expect(() => library.createConsumer('asphalt_02', { sizeMeters: [3, 3] })).toThrow(/not loaded/i);
  });
});
