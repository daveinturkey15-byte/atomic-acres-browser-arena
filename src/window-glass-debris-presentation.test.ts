import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
  WINDOW_GLASS_DEBRIS_FALLBACK_MAX_STEP_SECONDS,
  WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS,
  WINDOW_GLASS_DEBRIS_MAX_PHYSICS_MS,
  WINDOW_GLASS_DEBRIS_NO_PROGRESS_MS,
  WINDOW_GLASS_DEBRIS_POSE_GRACE_MS,
  WINDOW_GLASS_DEBRIS_SETTLE_TOLERANCE_M,
  WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT,
  createFracturedWindowDebrisVisual,
  integrateWindowGlassDebrisFallback,
  prewarmFracturedWindowDebrisVisual,
  updateFracturedWindowDebrisVisual,
  windowGlassDebrisLifecycleMode,
  windowGlassDebrisMilestoneAdmitted,
  windowGlassDebrisFallbackInterval,
  windowGlassDebrisFallbackSweepSupport,
  windowGlassDebrisSettleMode,
} from './window-glass-debris-presentation';

describe('persistent window glass debris presentation', () => {
  it('rejects a physics sleep above floor height and settles only at the floor', () => {
    expect(windowGlassDebrisSettleMode(2.4, 0.6, false)).toBe('physics-active');
    expect(windowGlassDebrisSettleMode(2.4, 0.6, true)).toBe('presentation-fall');
    expect(windowGlassDebrisSettleMode(0.6 + WINDOW_GLASS_DEBRIS_SETTLE_TOLERANCE_M, 0.6, true))
      .toBe('settled');
    expect(windowGlassDebrisSettleMode(
      0.6 + WINDOW_GLASS_DEBRIS_SETTLE_TOLERANCE_M + 1e-6,
      0.6,
      true,
    )).toBe('presentation-fall');
    expect(() => windowGlassDebrisSettleMode(Number.NaN, 0.6, true)).toThrow(TypeError);
  });

  it('bounds pose admission, awake no-progress, dynamic collision and total fragment lifetime', () => {
    const sample = {
      ageMs: WINDOW_GLASS_DEBRIS_POSE_GRACE_MS - 1,
      positionY: 2.4,
      restY: 0.6,
      physicsActive: true,
      sleeping: false,
      receivedPhysicsPose: false,
      noProgressMs: 0,
      fallbackSettled: false,
    };
    expect(windowGlassDebrisLifecycleMode(sample)).toBe('physics-active');
    expect(windowGlassDebrisLifecycleMode({
      ...sample,
      ageMs: WINDOW_GLASS_DEBRIS_POSE_GRACE_MS,
    })).toBe('presentation-fall');
    expect(windowGlassDebrisLifecycleMode({
      ...sample,
      ageMs: WINDOW_GLASS_DEBRIS_NO_PROGRESS_MS,
      receivedPhysicsPose: true,
      noProgressMs: WINDOW_GLASS_DEBRIS_NO_PROGRESS_MS,
    })).toBe('presentation-fall');
    expect(windowGlassDebrisLifecycleMode({
      ...sample,
      ageMs: WINDOW_GLASS_DEBRIS_MAX_PHYSICS_MS,
      receivedPhysicsPose: true,
    })).toBe('presentation-fall');
    expect(windowGlassDebrisLifecycleMode({
      ...sample,
      ageMs: WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS,
      receivedPhysicsPose: true,
    })).toBe('expired');
    expect(windowGlassDebrisLifecycleMode({
      ...sample,
      ageMs: 700,
      positionY: sample.restY,
      receivedPhysicsPose: true,
      sleeping: true,
    })).toBe('settled');
    expect(windowGlassDebrisLifecycleMode({
      ...sample,
      ageMs: 700,
      receivedPhysicsPose: true,
      sleeping: true,
    })).toBe('presentation-fall');
    expect(windowGlassDebrisLifecycleMode({
      ...sample,
      restY: null,
      receivedPhysicsPose: true,
      sleeping: true,
    })).toBe('presentation-fall');
    expect(windowGlassDebrisLifecycleMode({
      ...sample,
      restY: null,
      receivedPhysicsPose: true,
      sleeping: false,
    })).toBe('physics-active');
    expect(() => windowGlassDebrisLifecycleMode({ ...sample, noProgressMs: Number.NaN })).toThrow(TypeError);
  });

  it('resolves only a crossed or already-overlapping collision-authoritative support', () => {
    const halfExtents = { x: 0.6, y: 0.63, z: 0.08 };
    const floor = {
      source: 'world-floor',
      collider: { minX: -5, maxX: 5, minY: -0.2, maxY: 0, minZ: -5, maxZ: 5 },
    };
    expect(windowGlassDebrisFallbackSweepSupport(
      { x: 0, y: 0.124, z: 0 },
      { x: 0, y: 0.05, z: 0 },
      halfExtents,
      [floor],
    )).toEqual({ restY: 0.63, source: 'world-floor', impactFraction: 0 });

    const crossing = windowGlassDebrisFallbackSweepSupport(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0.1, z: 0 },
      { x: 0.2, y: 0.2, z: 0.2 },
      [floor],
    );
    expect(crossing.source).toBe('world-floor');
    expect(crossing.restY).toBe(0.2);
    expect(crossing.impactFraction).toBeGreaterThan(0);
    expect(crossing.impactFraction).toBeLessThanOrEqual(1);

    const highest = windowGlassDebrisFallbackSweepSupport(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -0.4, z: 0 },
      { x: 0.2, y: 0.2, z: 0.2 },
      [floor, {
        source: 'world-collider:0',
        collider: { minX: -1, maxX: 1, minY: 0, maxY: 0.25, minZ: -1, maxZ: 1 },
      }],
    );
    expect(highest).toMatchObject({ restY: 0.45, source: 'world-collider:0' });

    for (const rejected of [
      windowGlassDebrisFallbackSweepSupport(
        { x: 0, y: 0.5, z: 0 }, { x: 0, y: 0.4, z: 0 }, halfExtents,
        [{ source: 'tall-wall', collider: { minX: -1, maxX: 1, minY: -1, maxY: 2, minZ: -1, maxZ: 1 } }],
      ),
      windowGlassDebrisFallbackSweepSupport(
        { x: 8, y: 0.5, z: 0 }, { x: 8, y: -0.5, z: 0 }, halfExtents, [floor],
      ),
      windowGlassDebrisFallbackSweepSupport(
        { x: 0, y: 5, z: 0 }, { x: 0, y: 4, z: 0 }, halfExtents, [floor],
      ),
    ]) expect(rejected).toEqual({ restY: null, source: null, impactFraction: null });
  });

  it('catches real elapsed fallback up in bounded substeps and retains motion before collision settle', () => {
    const steps: number[] = [];
    const halfExtents = { x: 0.5, y: 0.6, z: 0.05 };
    const floor = {
      source: 'world-floor',
      collider: { minX: -20, maxX: 20, minY: -0.2, maxY: 0, minZ: -20, maxZ: 20 },
    };
    const result = integrateWindowGlassDebrisFallback({
      position: { x: 0, y: 10, z: 0 },
      velocity: { x: 0.2, y: -0.9, z: 0.1 },
      rotation: { x: 0.2, y: 0.3, z: 0.4 },
      angular: { x: 0.8, y: 0.4, z: 0.6 },
    }, WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS / 1_000, (from, to, stepSeconds) => {
      steps.push(stepSeconds);
      return windowGlassDebrisFallbackSweepSupport(from, to, halfExtents, [floor]);
    }, { x: 0, y: 10, z: 0 });

    expect(steps.length).toBeGreaterThan(1);
    expect(Math.max(...steps)).toBeLessThanOrEqual(WINDOW_GLASS_DEBRIS_FALLBACK_MAX_STEP_SECONDS);
    expect(result.moving).not.toBeNull();
    expect(result.moving!.elapsedSeconds).toBeLessThan(result.settledAfterSeconds!);
    expect(result.settled).toBe(true);
    expect(result.settledAfterSeconds).toBeLessThan(WINDOW_GLASS_DEBRIS_MAX_LIFETIME_MS / 1_000);
    expect(result.state.position.y).toBe(halfExtents.y);
    expect(result.support).toEqual({ restY: halfExtents.y, source: 'world-floor' });
  });

  it('derives a sparse-callback catch-up interval from policy boundaries without moving retirement', () => {
    expect(windowGlassDebrisFallbackInterval({
      spawnedAt: 1_000,
      now: 6_100,
      physicsActive: true,
      receivedPhysicsPose: true,
      stateIncludesPhysicsPose: true,
      firstPhysicsPoseAt: 1_050,
      stateObservedAt: 1_050,
      lastProgressAt: 1_050,
      fallbackStartedAt: null,
    })).toEqual({ policyStartAt: 1_500, stateStartAt: 1_050, captureStartAt: 1_500, endAt: 5_500 });
    expect(windowGlassDebrisFallbackInterval({
      spawnedAt: 1_000,
      now: 6_100,
      physicsActive: true,
      receivedPhysicsPose: false,
      stateIncludesPhysicsPose: false,
      stateObservedAt: 1_000,
      lastProgressAt: 1_000,
      fallbackStartedAt: null,
    })).toEqual({ policyStartAt: 1_180, stateStartAt: 1_000, captureStartAt: 1_180, endAt: 5_500 });
    expect(windowGlassDebrisFallbackInterval({
      spawnedAt: 1_000,
      now: 6_100,
      physicsActive: true,
      receivedPhysicsPose: true,
      stateIncludesPhysicsPose: false,
      firstPhysicsPoseAt: 5_000,
      stateObservedAt: 1_000,
      lastProgressAt: 1_000,
      fallbackStartedAt: null,
    })).toEqual({ policyStartAt: 1_180, stateStartAt: 1_000, captureStartAt: 1_180, endAt: 5_500 });
    expect(windowGlassDebrisFallbackInterval({
      spawnedAt: 1_000,
      now: 6_100,
      physicsActive: true,
      receivedPhysicsPose: true,
      stateIncludesPhysicsPose: true,
      firstPhysicsPoseAt: 5_000,
      stateObservedAt: 5_000,
      lastProgressAt: 5_000,
      fallbackStartedAt: null,
    })).toEqual({ policyStartAt: 2_800, stateStartAt: 5_000, captureStartAt: 5_000, endAt: 5_500 });
    expect(windowGlassDebrisFallbackInterval({
      spawnedAt: 1_000,
      now: 1_100,
      physicsActive: true,
      receivedPhysicsPose: false,
      stateIncludesPhysicsPose: false,
      stateObservedAt: 1_000,
      lastProgressAt: 1_000,
      fallbackStartedAt: null,
    })).toBeNull();
  });

  it('rejects late, backwards, stale-phase and pre-fallback presentation milestones', () => {
    const initial = { phase: 'initial' as const, sampledAt: 1_050, physical: true };
    const moving = { phase: 'moving' as const, sampledAt: 1_500, physical: false };
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'initial', spawnedAt: 1_000, sampledAt: 1_050,
      previous: null, physical: true, fallbackStartedAt: null,
    })).toBe(true);
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'initial', spawnedAt: 1_000, sampledAt: 1_050,
      previous: null, physical: false, fallbackStartedAt: null,
    })).toBe(false);
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'moving', spawnedAt: 1_000, sampledAt: 1_500,
      previous: initial, physical: false, fallbackStartedAt: 1_500,
    })).toBe(true);
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'settled', spawnedAt: 1_000, sampledAt: 1_500,
      previous: moving, physical: false, fallbackStartedAt: 1_500,
    })).toBe(true);
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'settled', spawnedAt: 1_000, sampledAt: 1_500,
      previous: { phase: 'moving', sampledAt: 1_400, physical: true }, physical: false, fallbackStartedAt: null,
    })).toBe(true);
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'initial', spawnedAt: 1_000, sampledAt: 6_000,
      previous: null, physical: true, fallbackStartedAt: null,
    })).toBe(false);
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'moving', spawnedAt: 1_000, sampledAt: 1_200,
      previous: { phase: 'initial', sampledAt: 5_000, physical: true }, physical: false, fallbackStartedAt: 1_180,
    })).toBe(false);
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'settled', spawnedAt: 1_000, sampledAt: 1_600,
      previous: initial, physical: false, fallbackStartedAt: 1_180,
    })).toBe(false);
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'moving', spawnedAt: 1_000, sampledAt: 1_100,
      previous: initial, physical: false, fallbackStartedAt: 1_180,
    })).toBe(false);
  });

  it('retains valid sparse-callback chronology for an early or 1400ms pose and rejects a 5000ms pose', () => {
    const floor = [{
      source: 'world-floor',
      collider: { minX: -5, maxX: 5, minY: -0.2, maxY: 0, minZ: -5, maxZ: 5 },
    }];
    const halfExtents = { x: 0.5, y: 0.6, z: 0.05 };
    const catchUp = (stateObservedAt: number, policyStartAt: number) => {
      const interval = windowGlassDebrisFallbackInterval({
        spawnedAt: 0,
        now: 5_100,
        physicsActive: true,
        receivedPhysicsPose: true,
        stateIncludesPhysicsPose: true,
        firstPhysicsPoseAt: stateObservedAt,
        stateObservedAt,
        lastProgressAt: stateObservedAt,
        fallbackStartedAt: policyStartAt,
      })!;
      const initialState = {
        position: { x: 0, y: 1.5, z: 0 },
        velocity: { x: 0.1, y: -0.9, z: 0 },
        rotation: { x: 0.1, y: 0.2, z: 0.1 },
        angular: { x: 0.2, y: 0.3, z: 0.2 },
      };
      const preCapture = integrateWindowGlassDebrisFallback(
        initialState,
        (interval.captureStartAt - interval.stateStartAt) / 1_000,
        (from, to) => windowGlassDebrisFallbackSweepSupport(from, to, halfExtents, floor),
      );
      const result = integrateWindowGlassDebrisFallback(
        preCapture.state,
        (interval.endAt - interval.captureStartAt) / 1_000,
        (from, to) => windowGlassDebrisFallbackSweepSupport(from, to, halfExtents, floor),
        initialState.position,
      );
      return { interval, result };
    };

    const early = catchUp(50, 500);
    expect(early.result.moving).not.toBeNull();
    expect(early.result.settled).toBe(true);
    expect(early.interval.captureStartAt + early.result.moving!.elapsedSeconds * 1_000).toBeLessThan(2_500);
    expect(early.interval.captureStartAt + early.result.settledAfterSeconds! * 1_000).toBeLessThan(4_250);

    const delayed = catchUp(1_400, 180);
    expect(delayed.interval).toMatchObject({ policyStartAt: 180, stateStartAt: 1_400, captureStartAt: 1_400 });
    expect(delayed.result.moving).not.toBeNull();
    expect(delayed.interval.captureStartAt + delayed.result.moving!.elapsedSeconds * 1_000).toBeLessThan(2_500);
    expect(delayed.interval.captureStartAt + delayed.result.settledAfterSeconds! * 1_000).toBeLessThan(4_250);

    const lateInitial = { phase: 'initial' as const, sampledAt: 5_000, physical: true };
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'initial', spawnedAt: 0, sampledAt: lateInitial.sampledAt,
      previous: null, physical: true, fallbackStartedAt: null,
    })).toBe(false);
    expect(windowGlassDebrisMilestoneAdmitted({
      phase: 'moving', spawnedAt: 0, sampledAt: 1_200,
      previous: lateInitial, physical: false, fallbackStartedAt: 180,
    })).toBe(false);
  });

  it('leaves unsupported off-footprint fallback falling instead of fabricating a settle', () => {
    const result = integrateWindowGlassDebrisFallback({
      position: { x: 8, y: 0.2, z: 0 },
      velocity: { x: 0, y: -0.9, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    }, 1, (from, to) => windowGlassDebrisFallbackSweepSupport(
      from,
      to,
      { x: 0.5, y: 0.6, z: 0.05 },
      [{
        source: 'world-floor',
        collider: { minX: -5, maxX: 5, minY: -0.2, maxY: 0, minZ: -5, maxZ: 5 },
      }],
    ), { x: 8, y: 0.2, z: 0 });
    expect(result.settled).toBe(false);
    expect(result.support).toEqual({ restY: null, source: null });
    expect(result.state.position.y).toBeLessThan(0);
  });

  it('renders separated triangular shards instead of an intact falling pane', () => {
    const halfExtents = { x: 0.7, y: 0.6, z: 0.03 };
    const root = createFracturedWindowDebrisVisual({
      id: 'window-debris:test-pane',
      halfExtents,
      reducedRenderMode: false,
    });
    const shards = root.getObjectByName('window-debris:test-pane:shard-cluster');
    expect(root.userData).toMatchObject({
      windowGlassDebrisContract: WINDOW_GLASS_DEBRIS_VISUAL_CONTRACT,
      fragmentCount: WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
      intactPaneMeshCount: 0,
    });
    expect(shards).toBeInstanceOf(THREE.InstancedMesh);
    const instancedShards = shards as THREE.InstancedMesh;
    const geometry = instancedShards.geometry;
    expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(geometry).not.toBeInstanceOf(THREE.BoxGeometry);
    expect(geometry.getAttribute('position').count).toBe(3);
    expect(instancedShards.count).toBe(WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT);
    expect(geometry.userData).toMatchObject({
      fragmentCount: WINDOW_GLASS_DEBRIS_FRAGMENT_COUNT,
      intactPane: false,
    });

    let shardArea = 0;
    const shardAreas: number[] = [];
    const sideLengths: number[] = [];
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < instancedShards.count; index += 1) {
      instancedShards.getMatrixAt(index, matrix);
      const a = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
      const b = new THREE.Vector3(1, 0, 0).applyMatrix4(matrix);
      const c = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      shardAreas.push(area);
      shardArea += area;
      sideLengths.push(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    }
    const intactPaneArea = halfExtents.x * halfExtents.y * 4;
    expect(shardArea).toBeGreaterThan(intactPaneArea * 0.2);
    expect(shardArea).toBeLessThan(intactPaneArea * 0.6);
    expect(Math.min(...shardAreas)).toBeGreaterThan(1e-4);
    expect(Math.max(...sideLengths) - Math.min(...sideLengths)).toBeGreaterThan(0.25);
    expect(root.userData).toMatchObject({ independentShardTransforms: true, radialFracture: true });

    const before = new THREE.Matrix4();
    const after = new THREE.Matrix4();
    instancedShards.getMatrixAt(0, before);
    expect(updateFracturedWindowDebrisVisual(root, 0.4)).toBe(true);
    instancedShards.getMatrixAt(0, after);
    expect(after.equals(before)).toBe(false);
    const second = new THREE.Matrix4();
    instancedShards.getMatrixAt(1, second);
    expect(second.equals(after)).toBe(false);
  });

  it('reuses analysed shard buffers and submits them during deployment prewarm', async () => {
    const first = createFracturedWindowDebrisVisual({
      id: 'window-debris:first', halfExtents: { x: 0.7, y: 0.6, z: 0.03 }, reducedRenderMode: false,
    });
    const second = createFracturedWindowDebrisVisual({
      id: 'window-debris:second', halfExtents: { x: 0.5, y: 0.4, z: 0.02 }, reducedRenderMode: false,
    });
    expect((first.getObjectByName('window-debris:first:shard-cluster') as THREE.InstancedMesh).geometry)
      .toBe((second.getObjectByName('window-debris:second:shard-cluster') as THREE.InstancedMesh).geometry);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    scene.add(camera);
    let submittedRoot: THREE.Object3D | null = null;
    await prewarmFracturedWindowDebrisVisual({
      compileAndRender: async (root, submittedCamera, submittedScene) => {
        expect(root.parent).toBe(scene);
        expect(submittedCamera).toBe(camera);
        expect(submittedScene).toBe(scene);
        submittedRoot = root;
      },
    }, camera, scene, false);
    expect(submittedRoot).not.toBeNull();
    expect(submittedRoot!.parent).toBeNull();
  });

  it('retains the exact prewarmed instance and never allocates shard geometry on the breach frame', () => {
    const source = readFileSync('src/legacy-main.ts', 'utf8');
    const prewarmStart = source.indexOf('async function withStagedWindowGlassDebrisPool');
    const start = source.indexOf('function spawnPersistentWindowDebris');
    const end = source.indexOf('function clearPersistentWindowDebris', start);
    expect(prewarmStart).toBeGreaterThanOrEqual(0);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const prewarm = source.slice(prewarmStart, start);
    const block = source.slice(start, end);
    expect(prewarm).toContain('createFracturedWindowDebrisVisual({');
    expect(prewarm).toContain('await submit(stage);');
    expect(prewarm).toContain('(stage) => renderRuntime.compileAndRender(stage, camera, scene)');
    expect(prewarm).toContain('parent: pooled.root.parent,');
    expect(prewarm).toContain('visible: pooled.root.visible,');
    expect(prewarm).toContain('position: pooled.root.position.clone(),');
    expect(prewarm).toContain('quaternion: pooled.root.quaternion.clone(),');
    expect(prewarm).toContain('scale: pooled.root.scale.clone(),');
    expect(prewarm).toContain('instanceMatrix: new Float32Array(shards.instanceMatrix.array),');
    expect(prewarm).toContain('finally {');
    expect(prewarm).toContain('state.parent?.add(root);');
    expect(prewarm).toContain('root.visible = state.visible;');
    expect(prewarm).toContain('root.position.copy(state.position);');
    expect(prewarm).toContain('root.quaternion.copy(state.quaternion);');
    expect(prewarm).toContain('root.scale.copy(state.scale);');
    expect(prewarm).toContain('shards.instanceMatrix.array.set(state.instanceMatrix);');
    expect(prewarm).toContain('characterPhysics.prewarmMajorDebrisBodies(arena.breakableWindows.map((window) => {');
    expect(prewarm).toContain('id: persistentWindowDebrisId(window.id), halfExtents: pooled.halfExtents');
    expect(block).toContain('pooledWindowDebris.get(windowDebrisPoolKey(arena.id, window.id))');
    expect(block).not.toContain('createFracturedWindowDebrisVisual({');
    expect(block).not.toContain('new THREE.BoxGeometry');
    const support = source.slice(source.indexOf('function windowDebrisSupport('), source.indexOf('\nasync function withStagedWindowGlassDebrisPool'));
    expect(support).toContain('let supportY: number | null = null;');
    const canonicalFloor = support.indexOf("{ source: 'world-floor', collider: worldFloorCollider(arena.bounds) }");
    const authoredColliders = support.indexOf('...activeWorldColliders().map(');
    expect(canonicalFloor).toBeGreaterThanOrEqual(0);
    expect(authoredColliders).toBeGreaterThan(canonicalFloor);
    expect(support).toContain('supportY !== null && maxY <= supportY');
    expect(support).toContain('restY: supportY === null ? null : supportY + halfExtents.y');
    expect(support).not.toContain('arena.bounds.minY');
    expect(support).not.toContain("source = 'arena-bound'");
  });

  it('arms a narrow in-page lifecycle observer before every covered first-pane action', () => {
    const source = readFileSync('src/legacy-main.ts', 'utf8');
    const browser = readFileSync('tests/e2e/pass71-glass-lifecycle-matrix.spec.ts', 'utf8');
    const observerStart = browser.indexOf('async function armPaneDebrisLifecycleObservation');
    const observerEnd = browser.indexOf('\nasync function readPaneDebrisLifecycleObservation', observerStart);
    const observer = browser.slice(observerStart, observerEnd);
    expect(source).toContain('sampleWindowDebrisLifecycle: (paneIndex: number)');
    expect(source).toContain('const entry = persistentWindowDebris.get(id);');
    expect(source).toContain('const milestones = Object.freeze(lifecycleMilestones.slice(nextMilestone));');
    expect(observer).toContain('debug.sampleWindowDebrisLifecycle(options.paneIndex)');
    expect(observer).toContain('window.requestAnimationFrame(sampleAfterGameFrame)');
    expect(observer).not.toContain('debug.snapshot()');
    expect(observer).toContain('debris disappeared before a valid settled sample');
    expect(observer).toContain('last=${describeSample(lastSample)}');
    expect(observer).toContain('for (const milestone of batch.milestones) consumeSample(milestone, batch);');
    expect(observer).toContain('current.sampledAt < lastMilestoneAt');
    expect(observer).toContain('current.sampledAt >= current.spawnedAt + options.maxLifetimeMs');
    expect(observer).toContain("current.milestone === 'initial'");
    expect(observer).toContain("current.milestone === 'moving'");
    expect(observer).toContain("current.milestone === 'settled'");
    expect(observer).toContain('current.ageMs >= options.physicsTimeoutMs');
    expect(observer).toContain('current.ageMs >= options.movementTimeoutMs');
    expect(observer).toContain('current.ageMs >= options.settleTimeoutMs');
    expect(observer).toContain('current.physical === true');
    expect(observer).toContain("supportSource === 'world-floor'");
    expect(observer).toContain("supportSource?.startsWith('world-collider:') === true");
    expect(observer).toContain('finish(Object.freeze({ initial, moving, settled: cloneSample(current) }))');
    expect(browser).toContain('const DEBRIS_PHYSICS_TIMEOUT_MS = 1_500;');
    expect(browser).toContain('const DEBRIS_MOVEMENT_TIMEOUT_MS = 2_500;');
    expect(browser).toContain('const DEBRIS_SETTLE_TIMEOUT_MS = 4_250;');
    expect(browser).toContain('const DEBRIS_MAX_LIFETIME_MS = 4_500;');
    expect(browser.match(/await armPaneDebrisLifecycleObservation\(/gu)).toHaveLength(5);
    expect(browser.match(/await readPaneDebrisLifecycleObservation\(/gu)).toHaveLength(5);

    for (const [title, action] of [
      ['all six authored panes breach by bullet', 'debug.fireOnce();'],
      ['all six authored panes breach by knife', 'return debug.melee().accepted;'],
      ['all six authored panes breach by grenade', 'for (let pane = 0; pane < 6; pane += 1) debug.detonateGrenadeAtWindow(pane);'],
      ['real Flare Gun impacts breach all six Skyline panes', 'await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());'],
      ['real explosive-crossbow impact stays solid until detonation', 'const impactSample = await fireAndObserveLiveCrossbowImpact(page, pane);'],
    ] as const) {
      const start = browser.indexOf(title);
      const end = browser.indexOf('\n  test(', start);
      const testCase = browser.slice(start, end < 0 ? browser.length : end);
      expect(start, title).toBeGreaterThanOrEqual(0);
      expect(testCase.indexOf('await armPaneDebrisLifecycleObservation('), title).toBeGreaterThanOrEqual(0);
      expect(testCase.indexOf('await armPaneDebrisLifecycleObservation('), title)
        .toBeLessThan(testCase.indexOf(action));
    }
  });

  it('prewarms zero-light world glass and impact programs before staging the flare PointLight', () => {
    const source = readFileSync('src/legacy-main.ts', 'utf8');
    const start = source.indexOf('async function prewarmArenaBoundGameplayPresentations');
    const end = source.indexOf('function bootstrapMenuPreview', start);
    const prewarm = source.slice(start, end);
    const disableViewmodelFill = prewarm.indexOf('camera.layers.disable(VIEWMODEL_RENDER_LAYER);');
    const tracer = prewarm.indexOf('await tracerPool.prewarm(renderRuntime, camera, sceneGeneration);', disableViewmodelFill);
    const impact = prewarm.indexOf('await impactPresentation.prewarm(renderRuntime, camera, sceneGeneration);', disableViewmodelFill);
    const glass = prewarm.indexOf('prewarmWindowGlassDebrisPool(sceneGeneration),', disableViewmodelFill);
    const flarePointLight = prewarm.lastIndexOf('await flareProjectileSystem.prewarm(renderRuntime, camera, sceneGeneration);');
    const restoreViewmodelFill = prewarm.indexOf('camera.layers.mask = priorWorldPrewarmCameraLayerMask;');
    const flareFirstShot = prewarm.indexOf("setBootstrapStage('prewarming-flare-first-shot');");

    expect(disableViewmodelFill).toBeGreaterThanOrEqual(0);
    for (const zeroLightPresentation of [tracer, impact, glass]) {
      expect(zeroLightPresentation).toBeGreaterThan(disableViewmodelFill);
      expect(zeroLightPresentation).toBeLessThan(flarePointLight);
    }
    expect(flarePointLight).toBeGreaterThan(glass);
    expect(restoreViewmodelFill).toBeGreaterThan(flarePointLight);
    expect(flareFirstShot).toBeGreaterThan(restoreViewmodelFill);
    const preFlareWorldWave = prewarm.slice(disableViewmodelFill, flarePointLight);
    expect(preFlareWorldWave).not.toContain('flareProjectileSystem.prewarm(');
  });

  it('prewarms the exact glass Web Audio graph before deployment and uses it on the breach path', () => {
    const runtime = readFileSync('src/legacy-main.ts', 'utf8');
    const audio = readFileSync('src/audio.ts', 'utf8');
    const matchStart = runtime.slice(runtime.indexOf('async function startGame('), runtime.indexOf('\nfunction randomNonce()'));
    const breach = runtime.slice(runtime.indexOf('function breakHouseWindow('), runtime.indexOf('\nfunction breakWindowsAlongBallisticTrace('));
    expect(matchStart).toContain("document.documentElement.dataset.glassImpactAudioPrewarm = audio.prepareGlassImpact() ? 'ready' : 'unavailable';");
    expect(matchStart).toContain("document.documentElement.dataset.grenadeAudioPrewarm = audio.prepareGrenadeEffects() ? 'ready' : 'unavailable';");
    expect(matchStart).toContain("document.documentElement.dataset.chopperRotorAudioPrewarm = audio.prepareChopperRotors() ? 'ready' : 'unavailable';");
    expect(matchStart.indexOf('audio.prepareGlassImpact()')).toBeLessThan(matchStart.indexOf('prepareDeploymentTransition()'));
    expect(matchStart.indexOf('audio.prepareGrenadeEffects()')).toBeLessThan(matchStart.indexOf('prepareDeploymentTransition()'));
    expect(matchStart.indexOf('audio.prepareChopperRotors()')).toBeLessThan(matchStart.indexOf('prepareDeploymentTransition()'));
    expect(breach).toContain("audio.impact('glass', point.distanceTo(camera.position));");
    const prewarm = audio.slice(audio.indexOf('prepareGlassImpact(): boolean {'), audio.indexOf('\n  setLowHealthFeedback('));
    expect(prewarm).toContain('this.createRetainedEffectGraph([');
    expect(prewarm).toContain("{ type: 'triangle', frequency: 5_200, filter: 'highpass'");
    expect(prewarm).toContain("{ type: 'sine', frequency: 1_460, filter: 'bandpass'");
    const retainedGraph = audio.slice(audio.indexOf('private createRetainedEffectGraph('), audio.indexOf('\n  private registerContinuousVoice('));
    expect(retainedGraph).toContain('gain.gain.value = 0;');
    expect(retainedGraph).toContain("this.registerContinuousVoice(source, this.feedback, 5, 'combat-feedback'");
    const impact = audio.slice(audio.indexOf('impact(surface: ImpactSurface'), audio.indexOf('\n  coverImpact('));
    expect(impact).toContain('this.automateRetainedEffectVoice(this.glassImpactVoices[0]!');
    expect(impact).not.toContain('this.context.create');
  });
});
