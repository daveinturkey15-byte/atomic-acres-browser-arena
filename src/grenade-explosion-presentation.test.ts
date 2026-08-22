import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  GRENADE_EXPLOSION_DURATION_MS,
  GRENADE_EXPLOSION_MIN_PRESENTED_FRAMES,
  GRENADE_EXPLOSION_POOL_CAPACITY,
  GRENADE_EXPLOSION_RING_START_SCALE,
  GrenadeExplosionPresentation,
} from './grenade-explosion-presentation';

describe('GrenadeExplosionPresentation', () => {
  it('constructs a fixed unlit pool before any detonation', () => {
    const scene = new THREE.Scene();
    const presentation = new GrenadeExplosionPresentation(scene);
    let lightCount = 0;
    let ringCount = 0;
    presentation.root.traverse((node) => {
      if (node instanceof THREE.Light) lightCount += 1;
      if (node.name === 'grenade-blast-ring') ringCount += 1;
    });

    expect(presentation.telemetry()).toEqual({
      active: 0,
      capacity: GRENADE_EXPLOSION_POOL_CAPACITY,
      dynamicLights: 0,
      prewarmed: false,
    });
    expect(lightCount).toBe(0);
    expect(ringCount).toBe(GRENADE_EXPLOSION_POOL_CAPACITY);
  });

  it('reuses slots and expires them without allocating dynamic lights', () => {
    const presentation = new GrenadeExplosionPresentation(new THREE.Scene());
    const firstRoot = presentation.root.children[0] as THREE.Group;
    const firstRootRing = (firstRoot.children as THREE.Mesh[]).find((mesh) => mesh.name === 'grenade-blast-ring')!;

    presentation.emit(new THREE.Vector3(1, 2, 3), 1_000);
    expect(presentation.telemetry().active).toBe(1);
    expect(firstRoot.visible).toBe(true);
    expect(firstRoot.position.toArray()).toEqual([1, 2.055, 3]);
    // HF-349: the shockwave ring must start at a clearly visible scale.
    expect(firstRootRing.scale.x).toBeGreaterThanOrEqual(GRENADE_EXPLOSION_RING_START_SCALE);

    // HF-349: expiry requires BOTH the minimum presented-frame count AND
    // elapsed time - a single update past expiry with fewer presented frames
    // than the gate must NOT swallow the effect (the frame-hitch regression).
    presentation.update(1_000 + GRENADE_EXPLOSION_DURATION_MS + 50);
    expect(presentation.telemetry().active).toBe(1);
    for (let frame = 0; frame < GRENADE_EXPLOSION_MIN_PRESENTED_FRAMES; frame += 1) {
      presentation.update(1_000 + GRENADE_EXPLOSION_DURATION_MS + 60);
    }
    expect(presentation.telemetry().active).toBe(0);
    expect(firstRoot.visible).toBe(false);

    for (let index = 0; index < GRENADE_EXPLOSION_POOL_CAPACITY + 1; index += 1) {
      presentation.emit(new THREE.Vector3(index, 0, 0), 2_000 + index);
    }
    expect(presentation.root.children[0]).toBe(firstRoot);
    expect(presentation.telemetry().active).toBe(GRENADE_EXPLOSION_POOL_CAPACITY);
    expect(presentation.telemetry().dynamicLights).toBe(0);
  });

  it('prewarms every live-scale slot in view, restores state, and serializes scene generations', async () => {
    const scene = new THREE.Scene();
    const presentation = new GrenadeExplosionPresentation(scene);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    camera.position.set(3, 2, 7);
    camera.lookAt(0, 1, -10);
    presentation.emit(new THREE.Vector3(2, 1, -3), 1_000);
    presentation.update(1_080);
    const snapshot = () => {
      const states: unknown[] = [];
      presentation.root.traverse((node) => {
        states.push({
          visible: node.visible,
          position: node.position.toArray(),
          quaternion: node.quaternion.toArray(),
          scale: node.scale.toArray(),
          frustumCulled: node.frustumCulled,
          opacity: node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial
            ? node.material.opacity
            : null,
        });
      });
      return states;
    };
    const before = snapshot();
    let inspected = 0;
    await presentation.prewarm({
      compileAndRender: async (root, renderCamera, renderScene) => {
        inspected += 1;
        expect(root).toBe(presentation.root);
        expect(renderCamera).toBe(camera);
        expect(renderScene).toBe(scene);
        for (const slotRoot of presentation.root.children) {
          expect(slotRoot.visible).toBe(true);
          expect(slotRoot.scale.toArray()).toEqual([1, 1, 1]);
          const projected = slotRoot.getWorldPosition(new THREE.Vector3()).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
          const [ring, core] = slotRoot.children.filter((node): node is THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> => node instanceof THREE.Mesh);
          expect(ring!.scale.x).toBeCloseTo(0.42);
          expect(ring!.material.opacity).toBeCloseTo(0.72);
          expect(core!.scale.x).toBeCloseTo(0.9);
          expect(core!.material.opacity).toBeCloseTo(0.85);
        }
      },
    }, camera, 3);
    expect(inspected).toBe(1);
    expect(snapshot()).toEqual(before);
    expect(presentation.telemetry()).toMatchObject({ active: 1, prewarmed: true });

    await presentation.prewarm({ compileAndRender: async () => { inspected += 1; } }, camera, 3);
    expect(inspected).toBe(1);

    const releases: Array<() => void> = [];
    let calls = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    const runtime = {
      compileAndRender: async () => {
        calls += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise<void>((resolve) => releases.push(() => { concurrent -= 1; resolve(); }));
      },
    };
    const first = presentation.prewarm(runtime, camera, 4);
    const second = presentation.prewarm(runtime, camera, 5);
    expect(calls).toBe(1);
    releases.shift()!();
    await first;
    await vi.waitFor(() => expect(calls).toBe(2));
    releases.shift()!();
    await second;
    expect(maxConcurrent).toBe(1);
    expect(snapshot()).toEqual(before);
  });

  it('HF-349: keeps a hitch-swallowed slot alive until it is actually presented', () => {
    const presentation = new GrenadeExplosionPresentation(new THREE.Scene());
    const slotRoot = presentation.root.children[0] as THREE.Group;
    const meshes = slotRoot.children.filter((node): node is THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> => node instanceof THREE.Mesh);
    const smoke = meshes.find((mesh) => mesh.name === 'grenade-blast-smoke');
    expect(smoke).toBeDefined();
    // HF-349: smoke is deliberately non-additive so the blast reads against bright sky.
    expect(smoke!.material.blending).toBe(THREE.NormalBlending);

    // Simulate a full stall: emit() followed by one huge frame hitch that
    // overshoots the entire lifetime before the first presented frame.
    presentation.emit(new THREE.Vector3(0, 0, 0), 5_000);
    presentation.update(5_000 + GRENADE_EXPLOSION_DURATION_MS * 4);
    expect(presentation.telemetry().active).toBe(1);
    expect(slotRoot.visible).toBe(true);
    // Held afterglow must stay faintly visible, not an invisible zombie.
    expect(smoke!.material.opacity).toBeGreaterThan(0);

    // Each further update is one presented frame; the gate opens on the third
    // and only then does the elapsed-time expiry take effect.
    presentation.update(5_000 + GRENADE_EXPLOSION_DURATION_MS * 4 + 16);
    presentation.update(5_000 + GRENADE_EXPLOSION_DURATION_MS * 4 + 32);
    expect(presentation.telemetry().active).toBe(1);
    presentation.update(5_000 + GRENADE_EXPLOSION_DURATION_MS * 4 + 48);
    expect(presentation.telemetry().active).toBe(0);
    expect(slotRoot.visible).toBe(false);
  });
});
