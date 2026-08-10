import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBlocked } from './collision';
import { SPAWN_LAYOUT } from './arena-layout';
import { SIMULATION_HZ } from './gameplay';
import { buildArena } from './map';
import { CharacterPhysics } from './physics';
import {
  RIGGED_BOT_EXPECTED_SKINNED_MESH_NAMES,
  RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT,
  fixedGunRangeDummyFixtureMatchesAuthoredMotion,
  waitForAtomicPlayerConvergenceInPage,
} from './rigged-bot-visual-evidence-contract';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fixed rigged actor visual evidence fixtures', () => {
  it('pins the retained LOD0 asset and resolved operator clone to the shipped nine-mesh manifest', async () => {
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('ProgressEvent', class ProgressEvent {
      readonly type: string;
      constructor(type: string) { this.type = type; }
    });
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 1,
      height: 1,
      close: () => undefined,
    }) as unknown as ImageBitmap);
    const bytes = await readFile('public/assets/original/models/operators/pass65-third-person-operator-lod0.glb');
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const asset = await new Promise<GLTF>((resolveAsset, rejectAsset) => {
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(arrayBuffer, '', resolveAsset, rejectAsset);
    });
    const dummyRoot = new THREE.Group();
    dummyRoot.name = 'gun-range-retained-operator-fixture';
    dummyRoot.add(cloneSkeleton(asset.scene));
    const resolvedNames: string[] = [];
    dummyRoot.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh && node.userData.authoritativeProxy !== true) {
        resolvedNames.push(node.name);
      }
    });
    expect(resolvedNames.sort()).toEqual([...RIGGED_BOT_EXPECTED_SKINNED_MESH_NAMES].sort());
    expect(resolvedNames).toHaveLength(9);
    expect(new Set(resolvedNames).size).toBe(9);
  });

  it('retains one immutable open-road Atomic staging line', () => {
    const fixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic;
    expect(fixture).toMatchObject({
      id: 'atomic-south-road-crosslane-spawn-fixed-v4',
      commandedPlayerPosition: [-3, 1.7, 40],
      settlementPositionAnchor: [-3, 1.7, 40],
      playerYaw: -Math.PI / 2,
      botDistanceM: 5.2,
      nominalBotPosition: [2.2, 0, 40],
      expectedBotYaw: Math.PI / 2,
      placement: {
        contract: 'debug-place-bot-ahead-synchronous-transaction-v1',
        source: '__ATOMIC_ACRES_DEBUG__.placeBotAhead',
        distanceM: 5.2,
        rootY: 0,
        requiredYawOffsetRadians: 0,
        arithmeticEpsilonM: 1e-9,
        nominalPositionEnvelopeM: [0.0005, 0, 0.0005],
      },
    });
    expect(fixture.settlement).toEqual({
      contract: 'grounded-distinct-presented-frame-axis-envelope-convergence-v3',
      minimumObservedTransitions: 8,
      minimumDurationMs: 50,
      maximumAxisDeltaM: 0.0005,
      maximumAxisSpanM: 0.0005,
      maximumAbsoluteAxisErrorM: [0.0005, 0.00225, 0.0005],
      groundedRequired: true,
    });
    expect(fixture.mediumCamera.position).toEqual([-2.2, 1.08, 40]);
    expect(fixture.closeCamera.position).toEqual([0.2, 1.08, 40]);
    expect(fixture.mediumCamera.target).toEqual(fixture.closeCamera.target);
    expect(fixture.mediumCamera.yaw).toBeCloseTo(-Math.PI / 2, 12);
    expect(fixture.closeCamera.yaw).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('falsifies the retired ramp point and keeps the v3 player/bot line clear at player radius', () => {
    const map = buildArena(new THREE.Scene());
    const fixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic;
    expect(SPAWN_LAYOUT[1]).toContainEqual([
      fixture.commandedPlayerPosition[0], fixture.commandedPlayerPosition[2],
    ]);
    expect(isBlocked({ x: 0, y: 1.7, z: -24 }, map.physicsColliders, 0.42)).toBe(true);
    expect(isBlocked({
      x: fixture.commandedPlayerPosition[0],
      y: fixture.commandedPlayerPosition[1],
      z: fixture.commandedPlayerPosition[2],
    }, map.physicsColliders, 0.42)).toBe(false);
    expect(isBlocked({
      x: fixture.nominalBotPosition[0],
      y: fixture.nominalBotPosition[1] + 1.7,
      z: fixture.nominalBotPosition[2],
    }, map.physicsColliders, 0.42)).toBe(false);
  });

  it('settles through the real game-order Rapier controller inside the fixed axis envelope', async () => {
    const map = buildArena(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    const fixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic;
    try {
      physics.teleportEye({
        x: fixture.commandedPlayerPosition[0],
        y: fixture.commandedPlayerPosition[1],
        z: fixture.commandedPlayerPosition[2],
      });
      let grounded = false;
      let verticalVelocity = 0;
      const step = 1 / SIMULATION_HZ;
      for (let frame = 0; frame < 32; frame += 1) {
        verticalVelocity -= 24.5 * step;
        if (grounded) verticalVelocity = Math.max(0, verticalVelocity);
        const movement = physics.move({ x: 0, y: verticalVelocity * step, z: 0 }, step);
        grounded = movement.grounded;
        if (movement.blockedY && verticalVelocity < 0) verticalVelocity = 0;
      }
      const settled = physics.eyePosition();
      expect(grounded).toBe(true);
      expect(Math.abs(settled.x - fixture.settlementPositionAnchor[0])).toBeLessThanOrEqual(0.0005);
      expect(Math.abs(settled.y - fixture.settlementPositionAnchor[1])).toBeLessThanOrEqual(0.00225);
      expect(Math.abs(settled.z - fixture.settlementPositionAnchor[2])).toBeLessThanOrEqual(0.0005);
    } finally {
      physics.dispose();
    }
  });

  it('pins every dummy and camera to an authored time-zero front view', () => {
    const fixture = RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.gunRange;
    expect(fixture.fixedVisualTimeMs).toBe(0);
    expect(fixedGunRangeDummyFixtureMatchesAuthoredMotion()).toBe(true);
    expect(fixture.dummies).toHaveLength(4);
    for (let index = 0; index < fixture.dummies.length; index += 1) {
      const { actor, camera } = fixture.dummies[index];
      expect(actor.position[1]).toBeCloseTo(Math.abs(Math.sin(index)) * 0.025, 12);
      const actorForward = [-Math.sin(actor.yaw), 0, -Math.cos(actor.yaw)];
      const actorToCamera = camera.position.map((value, axis) => value - actor.position[axis]);
      expect(actorToCamera[0]).toBeCloseTo(actorForward[0] * 2.1, 12);
      expect(actorToCamera[2]).toBeCloseTo(actorForward[2] * 2.1, 12);
      expect(camera.target).toEqual([actor.position[0], 1.08, actor.position[2]]);
    }
  });

  it('requires committed camera frames, compositor boundaries, and all six LOS sentinels', () => {
    expect(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT).toMatchObject({
      schemaVersion: 6,
      contract: 'pass69-3-fixed-rigged-actor-los-fixtures-v6',
    });
    expect(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation).toEqual({
      contract: 'capture-camera-committed-frame-v2',
      order: 'pause-final-submission-await-completion-then-compositor-v1',
      compositorBoundariesAfterCommit: 2,
      mainCameraDraw: {
        contract: 'rigged-main-camera-draw-stamp-v1',
        pixelProof: false,
        expectedSkinnedMeshCount: 9,
        expectedSkinnedMeshNames: RIGGED_BOT_EXPECTED_SKINNED_MESH_NAMES,
      },
      productionRgbRasterProof: {
        contract: 'gun-range-dummy-production-rgb-raster-proof-v1',
        principalWriteControl: 'rigged-principal-write-control-v1',
        rasterRoi: 'rigged-live-deformed-raster-roi-v1',
        modes: ['visible-observe', 'principal-write-suppressed', 'visible-restored'],
        pngModes: ['principal-write-suppressed', 'visible-restored'],
        viewport: { width: 1_600, height: 900, devicePixelRatio: 1 },
        changedPixelDefinition: 'any-rgb-byte-differs',
        insideMinimumChangedPixels: 1,
        outsideMaximumChangedPixels: 0,
        alphaMustMatch: true,
        roiPaddingPixels: 0,
        ownerAcceptance: 'PENDING_OWNER_INSPECTION',
      },
      rendererCompletion: {
        webgl2: 'synchronous-render-return',
        webgpu: 'submission-sequence-covered-by-completion-frontier',
      },
    });
    expect(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.los.sentinels).toEqual([
      'head', 'shoulder-left', 'shoulder-right', 'pelvis', 'wrist-left', 'wrist-right',
    ]);
    expect(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.los.actorSelfOcclusionExcluded).toBe(true);
    expect(RIGGED_BOT_EXPECTED_SKINNED_MESH_NAMES).toEqual([
      'Cube018', 'Cube018_1', 'Cube018_2', 'Swat_Feet',
      'Cube037', 'Cube037_1', 'Cube037_2', 'Cube023', 'Cube023_1',
    ]);
    expect(new Set(RIGGED_BOT_EXPECTED_SKINNED_MESH_NAMES).size).toBe(9);
    expect(RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.handSelfOcclusion).toEqual({
      contract: 'submitted-frame-hand-self-occlusion-v1',
      actorSelfOcclusionIncluded: true,
      actorAttachmentsIncluded: true,
      heldWeaponTerminalHitAccepted: false,
      terminalHandToleranceM: 0.06,
      cameraInsideOpaqueDistanceM: 0.1,
      sentinelNames: ['wrist-hand', 'thumb', 'index', 'middle', 'ring', 'pinky'],
    });
  });

  it('fails closed with bounded, sanitized and exact convergence timeout diagnostics', async () => {
    type Observation = Readonly<{
      frame: unknown;
      position: unknown;
      grounded: boolean;
    }>;
    const callbacks: FrameRequestCallback[] = [];
    let now = 0;
    let observation: Observation = { frame: 99, position: [0, 1, 0], grounded: true };
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal('window', {
      __ATOMIC_ACRES_DEBUG__: {
        admissionState: () => ({ presentedGameplayFrame: observation.frame }),
        snapshot: () => ({ player: { position: observation.position, grounded: observation.grounded } }),
      },
    });

    const completion = waitForAtomicPlayerConvergenceInPage({
      commandedFrame: 99,
      positionAnchor: [0, 1, 0],
      settlement: {
        contract: 'diagnostic-test',
        minimumObservedTransitions: 1_000,
        minimumDurationMs: 50,
        maximumAxisDeltaM: 0.0005,
        maximumAxisSpanM: 0.0005,
        maximumAbsoluteAxisErrorM: [0.0005, 0.00225, 0.0005],
        groundedRequired: true,
      },
    }).then(
      () => null,
      (error: unknown) => error,
    );
    const runObservation = (next: Observation, atMs: number) => {
      observation = next;
      now = atMs;
      const callback = callbacks.shift();
      expect(callback, 'a bounded waiter callback must remain scheduled').toBeTypeOf('function');
      callback!(atMs);
    };

    runObservation({ frame: 100, position: [Number.NaN, Number.POSITIVE_INFINITY, 0], grounded: true }, 1);
    runObservation({ frame: 100, position: [0, 1, 0], grounded: true }, 2);
    runObservation({ frame: 100, position: [0, 1, 0], grounded: true }, 3);
    runObservation({ frame: 101, position: [0.0005, 1, 0], grounded: true }, 4);
    runObservation({ frame: 100, position: [0, 1, 0], grounded: true }, 5);
    runObservation({ frame: 101, position: [-0.0005, 1, 0], grounded: true }, 6);
    runObservation({ frame: 102, position: [0.000001, 1, 0], grounded: true }, 7);
    for (let index = 0; index < 20; index += 1) {
      runObservation({ frame: 99, position: [0, 1, 0], grounded: true }, 8 + index);
    }
    runObservation({ frame: 103, position: [Number.NaN, Number.NEGATIVE_INFINITY, 0], grounded: true }, 10_001);

    const error = await completion;
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    const jsonStart = message.indexOf('{');
    expect(jsonStart).toBeGreaterThan(0);
    const diagnostics = JSON.parse(message.slice(jsonStart));
    expect(diagnostics).toMatchObject({
      outcome: 'timeout',
      diagnosticRingCapacity: 16,
      callbackCount: 28,
      acceptedSampleCount: 5,
      currentAcceptedStreak: 0,
      longestAcceptedStreak: 2,
      duplicatePresentedFrameDecision: 'ignore-without-reset-or-acceptance',
      reasonCounters: {
        'invalid-position-vector': 2,
        'accepted-first-sample': 1,
        'duplicate-presented-frame-ignored': 1,
        'accepted-transition': 2,
        'reversed-presented-frame': 1,
        'transition-axis-delta': 1,
        'pre-command-frame': 20,
      },
    });
    expect(diagnostics.recentRawObservations).toHaveLength(16);
    expect(diagnostics.recentResetEvents).toHaveLength(16);
    expect(diagnostics.recentRawObservations.at(-1)).toMatchObject({
      decision: 'reset-invalid-position-vector',
      position: ['NaN', '-Infinity', 0],
    });
    expect(diagnostics.observedAbsoluteAxisErrorRangesM).toEqual([
      { minimum: 0, maximum: 0.0005 },
      { minimum: 0, maximum: 0 },
      { minimum: 0, maximum: 0 },
    ]);
    expect(diagnostics.acceptedAbsoluteAxisErrorRangesM).toEqual([
      { minimum: 0, maximum: 0.0005 },
      { minimum: 0, maximum: 0 },
      { minimum: 0, maximum: 0 },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('null,null');
  });

  it('recovers from an early span violation and accepts nine later stable presentations', async () => {
    const callbacks: FrameRequestCallback[] = [];
    let now = 0;
    let frame = 100;
    let position = [-3, 1.7, 40];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal('window', {
      __ATOMIC_ACRES_DEBUG__: {
        admissionState: () => ({ presentedGameplayFrame: frame }),
        snapshot: () => ({ player: { position, grounded: true } }),
      },
    });
    const completion = waitForAtomicPlayerConvergenceInPage({
      commandedFrame: 100,
      positionAnchor: [-3, 1.7, 40],
      settlement: {
        contract: 'axis-recovery-test',
        minimumObservedTransitions: 8,
        minimumDurationMs: 50,
        maximumAxisDeltaM: 0.0005,
        maximumAxisSpanM: 0.0005,
        maximumAbsoluteAxisErrorM: [0.0005, 0.00225, 0.0005],
        groundedRequired: true,
      },
    });
    const present = (nextPosition: number[], atMs: number) => {
      frame += 1;
      position = nextPosition;
      now = atMs;
      const callback = callbacks.shift();
      expect(callback).toBeTypeOf('function');
      callback!(atMs);
    };
    present([-3, 1.69775, 40], 1);
    present([-3, 1.69824, 40], 9);
    present([-3, 1.69873, 40], 17);
    for (let index = 0; index < 9; index += 1) present([-3, 1.700099, 40], 25 + index * 8);
    const convergence = await completion;
    expect(convergence.samples).toHaveLength(9);
    expect(convergence.samples.every((sample) => sample.position[1] === 1.700099)).toBe(true);
    expect(convergence.maximumObservedAxisSpanM).toEqual([0, 0, 0]);
    expect(convergence.maximumObservedAbsoluteAxisErrorM[1]).toBeCloseTo(0.000099, 12);
  });

  it('accepts the exact mathematical X/Y/Z envelope boundaries despite representation rounding', async () => {
    const callbacks: FrameRequestCallback[] = [];
    let now = 0;
    let frame = 100;
    const position = [-3 + 0.0005, 1.7 + 0.00225, 40 + 0.0005];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal('window', {
      __ATOMIC_ACRES_DEBUG__: {
        admissionState: () => ({ presentedGameplayFrame: frame }),
        snapshot: () => ({ player: { position, grounded: true } }),
      },
    });
    const completion = waitForAtomicPlayerConvergenceInPage({
      commandedFrame: 100,
      positionAnchor: [-3, 1.7, 40],
      settlement: {
        contract: 'axis-boundary-rounding-test',
        minimumObservedTransitions: 8,
        minimumDurationMs: 50,
        maximumAxisDeltaM: 0.0005,
        maximumAxisSpanM: 0.0005,
        maximumAbsoluteAxisErrorM: [0.0005, 0.00225, 0.0005],
        groundedRequired: true,
      },
    });
    for (let index = 0; index < 9; index += 1) {
      frame += 1;
      now = 1 + index * 8;
      const callback = callbacks.shift();
      expect(callback).toBeTypeOf('function');
      callback!(now);
    }
    const convergence = await completion;
    expect(convergence.maximumObservedAbsoluteAxisErrorM).toEqual(position.map((value, axis) => (
      Math.abs(value - [-3, 1.7, 40][axis])
    )));
  });

  it('rejects malformed axis tolerances before sampling', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    await expect(waitForAtomicPlayerConvergenceInPage({
      commandedFrame: 100,
      positionAnchor: [-3, 1.7, 40],
      settlement: {
        contract: 'malformed-axis-tolerance-test',
        minimumObservedTransitions: 8,
        minimumDurationMs: 50,
        maximumAxisDeltaM: 0.0005,
        maximumAxisSpanM: 0.0005,
        maximumAbsoluteAxisErrorM: [0.0005, Number.NaN, 0.0005],
        groundedRequired: true,
      },
    })).rejects.toThrow('invalid-configuration');
  });
});
