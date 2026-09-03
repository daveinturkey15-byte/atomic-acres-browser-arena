import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { finaliseProxyScene, groundPlaneProxy, vec3 } from '../raytracing/analytic-proxy-scene';
import {
  BAKED_INDIRECT_RUNTIME_GRID,
  bakeIrradianceVolume,
  computeBakeDigest,
  resolveBakedIndirectTuning,
} from './baked-indirect';
import { publishBakedIndirectReceipt } from './baked-indirect-node';
import {
  EXTRACTION_DEBOUNCE_MS,
  bakeLightingFromSun,
  buildBakedIndirectRuntime,
  type BakedIndirectRuntimeSources,
} from './baked-indirect-runtime';

/**
 * A scene shaped like a real arena commit: a root, a sun, a camera parented
 * into the root (which is how the runtime finds the scene at all), and enough
 * box geometry to clear the proxy extractor's footprint floor.
 */
function arenaScene() {
  const root = new THREE.Scene();
  root.name = 'test-arena';
  const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
  sun.position.set(30, 60, 20);
  root.add(sun, sun.target);
  for (const [index, position] of ([[0, 3, 8], [-12, 2, -4], [10, 4, -9]] as const).entries()) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(16, 6, 1.2),
      new THREE.MeshStandardMaterial({ color: index === 0 ? 0xcc2018 : 0x9a9a92, roughness: 0.8 }),
    );
    mesh.name = `wall-${index}`;
    mesh.position.set(position[0], position[1], position[2]);
    root.add(mesh);
  }
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(60, 0.4, 60),
    new THREE.MeshStandardMaterial({ color: 0x707068, roughness: 0.9 }),
  );
  floor.name = 'floor';
  root.add(floor);
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.02, 400);
  camera.position.set(0, 1.7, 0);
  root.add(camera);
  root.updateMatrixWorld(true);
  return { root, sun, camera };
}

function sourcesFor(camera: THREE.Camera, sun: THREE.DirectionalLight): BakedIndirectRuntimeSources {
  return {
    // The node's TSL expression is built at construction; these four inputs are
    // only read inside that expression, which is never evaluated on the CPU.
    sceneColor: null as never,
    sceneNormal: null as never,
    sceneViewZ: null as never,
    camera,
    sun,
  };
}

describe('bakeLightingFromSun', () => {
  it('quantises the sun so a moving time-of-day does not restart the bake every frame', () => {
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(0, 10, 0);
    const before = bakeLightingFromSun(sun);
    // A tenth of a degree of sun movement must not move the digest.
    sun.position.set(0.01, 10, 0);
    const after = bakeLightingFromSun(sun);
    expect(after.sunDirection).toEqual(before.sunDirection);
    expect(after.sunColour).toEqual(before.sunColour);
  });

  it('DOES move when the sun moves far enough to change the picture', () => {
    const noon = new THREE.DirectionalLight(0xffffff, 1);
    noon.position.set(0, 10, 0);
    const dusk = new THREE.DirectionalLight(0xffffff, 1);
    dusk.position.set(10, 1, 0);
    expect(bakeLightingFromSun(dusk).sunDirection).not.toEqual(bakeLightingFromSun(noon).sunDirection);
  });

  it('derives the sky from the sun rather than from an independent constant', () => {
    const warm = new THREE.DirectionalLight(0xff8040, 1.6);
    warm.position.set(10, 2, 0);
    const lighting = bakeLightingFromSun(warm);
    // A warm sun gives a horizon whose red exceeds its blue. A constant sky
    // would give the same numbers whatever the sun did.
    expect(lighting.skyHorizonColour[0]).toBeGreaterThan(lighting.skyHorizonColour[2]);
  });

  it('falls back to a usable sun rather than a zero vector when there is none', () => {
    const lighting = bakeLightingFromSun(null);
    expect(Math.hypot(...lighting.sunDirection)).toBeGreaterThan(0.5);
  });
});

describe('buildBakedIndirectRuntime', () => {
  it('does not bake before the debounce, and produces a real volume after it', () => {
    const { camera, sun } = arenaScene();
    let clock = 0;
    const runtime = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('low'), () => null, () => clock,
    );
    // First frame: the arena is still streaming as far as this layer knows.
    runtime.beforeRender();
    expect(runtime.source()).toBe('none');
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    runtime.beforeRender();
    expect(runtime.source()).toBe('baking');
    // Every subsequent frame advances it; a low-tier grid on this fixture
    // completes well inside a few hundred frames.
    for (let frame = 0; frame < 4000 && runtime.source() === 'baking'; frame += 1) runtime.beforeRender();
    expect(runtime.source()).toBe('baked');
    expect(runtime.progress()).toBe(1);
    const receipt = runtime.graph.receipt();
    expect(receipt.dimensions).toBe(BAKED_INDIRECT_RUNTIME_GRID.join('x'));
    // The extractor found the arena, not an empty scene. Zero here is the
    // "correct image of nothing" state and would mean the walk-up found the
    // wrong root or ran before the arena streamed in.
    expect(receipt.occluderShapes).toBeGreaterThan(0);
    expect(receipt.gain).toBeCloseTo(resolveBakedIndirectTuning('low').composite, 6);
    runtime.dispose();
  });

  it('takes a cached volume without baking when the digest matches', () => {
    const { camera, sun } = arenaScene();
    // Build the same volume the runtime would ask for: proxy extracted the same
    // way, lighting quantised the same way, tier the same.
    let clock = 0;
    let asked: string | null = null;
    const probe = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('low'),
      (digest) => { asked = digest; return null; }, () => clock,
    );
    probe.beforeRender();
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    probe.beforeRender();
    probe.dispose();
    expect(asked).toBeTruthy();

    const cachedScene = finaliseProxyScene([groundPlaneProxy(0, vec3(0.4, 0.4, 0.4))], 1);
    const cached = bakeIrradianceVolume(cachedScene, bakeLightingFromSun(sun), {
      arenaId: 'cache-fixture',
      tuning: resolveBakedIndirectTuning('low'),
      fixedDimensions: BAKED_INDIRECT_RUNTIME_GRID,
    });
    // The cache is keyed by digest; hand back a volume stamped with the digest
    // the runtime asked for, which is what a committed build-time bake is.
    const stamped = { ...cached, digest: asked as unknown as string };
    let secondClock = 0;
    const runtime = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('low'),
      () => stamped, () => secondClock,
    );
    runtime.beforeRender();
    secondClock += EXTRACTION_DEBOUNCE_MS + 1;
    runtime.beforeRender();
    expect(runtime.source()).toBe('cache');
    expect(runtime.progress()).toBe(1);
    expect(runtime.graph.receipt().digest).toBe(asked);
    runtime.dispose();
  });

  it('refuses a cached volume whose dimensions are not the runtime grid', () => {
    const { camera, sun } = arenaScene();
    const wrongSize = bakeIrradianceVolume(
      finaliseProxyScene([groundPlaneProxy(0, vec3(0.4, 0.4, 0.4))], 1),
      bakeLightingFromSun(sun),
      { arenaId: 'wrong', tuning: resolveBakedIndirectTuning('low'), fixedDimensions: [4, 4, 4] },
    );
    let clock = 0;
    const runtime = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('low'),
      (digest) => ({ ...wrongSize, digest }), () => clock,
    );
    runtime.beforeRender();
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    // A mismatched volume must fall through to a bake rather than throw from
    // setVolume or, worse, be uploaded into a texture of a different shape.
    runtime.beforeRender();
    expect(runtime.source()).toBe('baking');
    runtime.dispose();
  });

  it('does nothing at all while the tier is OFF', () => {
    const { camera, sun } = arenaScene();
    let clock = 0;
    const runtime = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('off'), () => null, () => clock,
    );
    clock += EXTRACTION_DEBOUNCE_MS * 10;
    for (let frame = 0; frame < 20; frame += 1) runtime.beforeRender();
    expect(runtime.source()).toBe('none');
    expect(runtime.graph.receipt().gain).toBe(0);
    runtime.dispose();
  });

  it('restarts the bake when the tier changes, rather than relabelling the old volume', () => {
    const { camera, sun } = arenaScene();
    let clock = 0;
    const runtime = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('low'), () => null, () => clock,
    );
    runtime.beforeRender();
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    runtime.beforeRender();
    for (let frame = 0; frame < 4000 && runtime.source() === 'baking'; frame += 1) runtime.beforeRender();
    expect(runtime.source()).toBe('baked');
    const lowDigest = runtime.graph.receipt().digest;
    runtime.applyTuning(resolveBakedIndirectTuning('high'));
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    runtime.beforeRender();
    expect(runtime.source()).toBe('baking');
    expect(runtime.graph.receipt().digest).not.toBe(lowDigest);
    runtime.dispose();
  });

  it('RE-BAKES when the arena is swapped under a live session (B1)', () => {
    // THE DEFECT THIS PINS. `maybeStartBake` used to return at
    // `boundDigest !== null && !digestDirty` BEFORE extracting or hashing, and
    // `digestDirty` was set only by a tier change. `legacy-main.ts` builds the
    // post graph once per session and an arena change only calls
    // `applyDefinition`, so the second and every later arena in a session
    // sampled the FIRST arena's volume, at the first arena's origin. Every
    // measurement row taken for this lane was a cold single-arena page load -
    // the one condition under which that is invisible.
    const { root, camera, sun } = arenaScene();
    let clock = 0;
    const runtime = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('low'), () => null, () => clock,
    );
    runtime.beforeRender();
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    runtime.beforeRender();
    for (let frame = 0; frame < 8000 && runtime.source() === 'baking'; frame += 1) runtime.beforeRender();
    expect(runtime.source()).toBe('baked');
    const firstArena = runtime.graph.receipt().digest;

    // Swap the arena: every mass out, a different set in, exactly what an arena
    // transition does to the scene root.
    for (const child of [...root.children]) {
      if (child.name.startsWith('wall-') || child.name === 'floor') root.remove(child);
    }
    for (let index = 0; index < 5; index += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(20, 8, 3),
        new THREE.MeshStandardMaterial({ color: 0x2050cc, roughness: 0.7 }),
      );
      mesh.name = `tower-${index}`;
      mesh.position.set(index * 9 - 18, 4, index % 2 === 0 ? 14 : -14);
      root.add(mesh);
    }
    root.updateMatrixWorld(true);
    clock += 1;
    runtime.beforeRender();                       // notices the new structure
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    runtime.beforeRender();                       // re-derives and restarts
    expect(runtime.source()).toBe('baking');
    expect(runtime.graph.receipt().digest).not.toBe(firstArena);
    runtime.dispose();
  });

  it('RE-BAKES when the sun leaves its quantisation cell under a live session (B1)', () => {
    // The other half of the same defect: "a noon bake can never be served at
    // dusk" was a comment, not a behaviour. A full day of sun travel changed
    // nothing, because the digest was never re-derived after the first bind.
    const { camera, sun } = arenaScene();
    let clock = 0;
    const runtime = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('low'), () => null, () => clock,
    );
    runtime.beforeRender();
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    runtime.beforeRender();
    for (let frame = 0; frame < 8000 && runtime.source() === 'baking'; frame += 1) runtime.beforeRender();
    expect(runtime.source()).toBe('baked');
    const noon = runtime.graph.receipt().digest;

    // Far past the 1/12-direction and 1/8-colour quantisers: high white noon to
    // a low warm-orange sun.
    sun.position.set(-80, 4, 0);
    sun.color.setRGB(1, 0.45, 0.2);
    sun.updateMatrixWorld(true);
    clock += 1;
    runtime.beforeRender();
    expect(runtime.source()).toBe('baking');
    expect(runtime.graph.receipt().digest).not.toBe(noon);
    runtime.dispose();
  });

  it('does NOT re-extract while nothing the digest covers has moved', () => {
    // The guard the fix must not lose: re-deriving is gated on a changed root
    // structure or a moved sun, not on a timer, so a settled arena under a
    // still sun extracts the proxy exactly once however long it is played.
    const { camera, sun } = arenaScene();
    let clock = 0;
    const runtime = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('low'), () => null, () => clock,
    );
    runtime.beforeRender();
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    runtime.beforeRender();
    for (let frame = 0; frame < 8000 && runtime.source() === 'baking'; frame += 1) runtime.beforeRender();
    expect(runtime.source()).toBe('baked');
    const settled = runtime.graph.receipt().digest;
    // Ten seconds of gameplay with a tenth of a degree of sun drift, which the
    // quantiser must absorb.
    for (let frame = 0; frame < 600; frame += 1) {
      clock += 16;
      sun.position.set(30 + frame * 0.0005, 60, 20);
      sun.updateMatrixWorld(true);
      runtime.beforeRender();
    }
    expect(runtime.source()).toBe('baked');
    expect(runtime.graph.receipt().digest).toBe(settled);
    runtime.dispose();
  });

  it('publishes a receipt a headless browser can read without a debug hook', () => {
    const { camera, sun } = arenaScene();
    let clock = 0;
    const runtime = buildBakedIndirectRuntime(
      sourcesFor(camera, sun), resolveBakedIndirectTuning('low'), () => null, () => clock,
    );
    runtime.beforeRender();
    clock += EXTRACTION_DEBOUNCE_MS + 1;
    runtime.beforeRender();
    const target = { dataset: {} as Record<string, string | undefined> };
    publishBakedIndirectReceipt(target, runtime.graph);
    expect(target.dataset.bakedIndirect).toMatch(/^24x12x24:[0-9a-f]{8}:\d+:0\.380$/);
    runtime.dispose();
  });
});

describe('the digest the runtime keys on', () => {
  it('is the same one the offline bake produces for the same inputs', () => {
    // If these ever diverge, a committed volume can never be served and the
    // whole cache silently degrades to a runtime bake on every load.
    const scene = finaliseProxyScene([groundPlaneProxy(0, vec3(0.4, 0.4, 0.4))], 1);
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(20, 40, 10);
    const lighting = bakeLightingFromSun(sun);
    const tuning = resolveBakedIndirectTuning('high');
    const offline = bakeIrradianceVolume(scene, lighting, {
      arenaId: 'digest-parity', tuning, fixedDimensions: BAKED_INDIRECT_RUNTIME_GRID,
    });
    expect(offline.digest).toBe(computeBakeDigest(scene, lighting, tuning));
  });
});
