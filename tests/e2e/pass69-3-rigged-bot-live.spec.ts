import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { GUN_RANGE_TEST_BAY_CONTRACT } from '../../src/gun-range-test-bay';

type Renderer = 'webgl2' | 'webgpu';

const requestedRenderer = process.env.PASS69_3_RIGGED_BOT_RENDERER ?? 'webgl2';
if (requestedRenderer !== 'webgl2' && requestedRenderer !== 'webgpu') {
  throw new Error(`Pass 69.3 rigged-bot renderer must be webgl2 or webgpu; received ${requestedRenderer}`);
}
const renderer: Renderer = requestedRenderer;
const renderProfile = process.env.PASS69_3_RIGGED_BOT_RENDER_PROFILE ?? 'blender';
if (renderProfile !== 'blender') {
  throw new Error(`Pass 69.3 rigged-bot evidence requires the Blender profile; received ${renderProfile}`);
}
const expectedSourceSha = process.env.PASS69_3_RIGGED_BOT_SOURCE_SHA ?? '';
const expectedTarget = process.env.PASS69_3_RIGGED_BOT_TARGET ?? '';
const officialEvidence = expectedSourceSha !== '' || expectedTarget !== '';
const targetForRenderer = `edge-${renderer}`;
if (officialEvidence && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha) || expectedTarget !== targetForRenderer)) {
  throw new Error(`Pass 69.3 rigged-bot evidence has incomplete target provenance for ${targetForRenderer}`);
}

const repositoryRoot = process.cwd();
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
}).trim();
const sourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
}).trim();
const artifactBase = resolve(repositoryRoot, 'artifacts/pass69-3/rigged-bot-live');
const artifactRoot = resolve(artifactBase, renderer);
const receiptPath = resolve(artifactBase, `receipt-${renderer}.json`);
const OPERATOR_SOURCE = 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative';
const OPERATOR_ASSET = './assets/original/models/operators/pass65-third-person-operator-lod0.glb';
const ANTI_T_THRESHOLDS = Object.freeze({
  minimumVerticalDropM: 0.08,
  minimumVerticalDropRatio: 0.18,
  maximumHorizontalReachRatio: 0.9,
  maximumOutwardReachRatio: 0.82,
  minimumElbowFlexRadians: 0.12,
});
const ARM_BONES = Object.freeze([
  Object.freeze({ side: 'left', role: 'shoulder', sourceBone: 'UpperArm.L', bone: 'UpperArmL', minimumBindRadians: 0.5 }),
  Object.freeze({ side: 'left', role: 'elbow', sourceBone: 'LowerArm.L', bone: 'LowerArmL', minimumBindRadians: 0.15 }),
  Object.freeze({ side: 'left', role: 'wrist-hand', sourceBone: 'Wrist.L', bone: 'WristL', minimumBindRadians: 0.05 }),
  Object.freeze({ side: 'right', role: 'shoulder', sourceBone: 'UpperArm.R', bone: 'UpperArmR', minimumBindRadians: 0.5 }),
  Object.freeze({ side: 'right', role: 'elbow', sourceBone: 'LowerArm.R', bone: 'LowerArmR', minimumBindRadians: 0.15 }),
  Object.freeze({ side: 'right', role: 'wrist-hand', sourceBone: 'Wrist.R', bone: 'WristR', minimumBindRadians: 0.05 }),
]);
const HAND_BONES = Object.freeze([
  Object.freeze({ side: 'left', digit: 'middle', joint: 2, sourceBone: 'Middle2.L', bone: 'Middle2L' }),
  Object.freeze({ side: 'left', digit: 'ring', joint: 2, sourceBone: 'Ring2.L', bone: 'Ring2L' }),
  Object.freeze({ side: 'right', digit: 'middle', joint: 2, sourceBone: 'Middle2.R', bone: 'Middle2R' }),
  Object.freeze({ side: 'right', digit: 'ring', joint: 2, sourceBone: 'Ring2.R', bone: 'Ring2R' }),
]);
const MINIMUM_FINGER_BIND_RADIANS = 0.12;
const CLOSE_ROI_NDC = Object.freeze({ minX: -0.46, maxX: 0.46, minY: -0.7, maxY: 0.7 });
const MEDIUM_ROI_NDC = Object.freeze({ minX: -0.68, maxX: 0.68, minY: -0.82, maxY: 0.82 });
const OVERVIEW_ROI_NDC = Object.freeze({ minX: -0.97, maxX: 0.97, minY: -0.95, maxY: 0.95 });

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function repositoryRelative(path: string): string {
  return relative(repositoryRoot, path).replaceAll('\\', '/');
}

function route(map: 'atomic-acres' | 'gun-range', seed: string): string {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  return `/?release=latest&map=${map}&renderer=${renderer}${requireWebGpu}&render=${renderProfile}`
    + `&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=${seed}-${renderer}`;
}

function quaternionDelta(left: number[], right: number[]): number {
  const dot = Math.abs(left.reduce((sum, value, index) => sum + value * right[index], 0));
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}

function positionDelta(left: number[], right: number[]): number {
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

function subtract(left: number[], right: number[]): number[] {
  return left.map((value, index) => value - right[index]);
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function length(vector: number[]): number {
  return Math.hypot(...vector);
}

function armGeometry(model: any, side: 'left' | 'right', chain: any) {
  const shoulder = model.armPose.bones.find((bone: any) => bone.side === side && bone.role === 'shoulder');
  const elbow = model.armPose.bones.find((bone: any) => bone.side === side && bone.role === 'elbow');
  const wrist = model.armPose.bones.find((bone: any) => bone.side === side && bone.role === 'wrist-hand');
  const shoulderToElbow = subtract(elbow.worldPosition, shoulder.worldPosition);
  const elbowToWrist = subtract(wrist.worldPosition, elbow.worldPosition);
  const shoulderToWrist = subtract(wrist.worldPosition, shoulder.worldPosition);
  const elbowToShoulder = shoulderToElbow.map((value) => -value);
  const upperArmLength = length(shoulderToElbow);
  const forearmLength = length(elbowToWrist);
  const armLength = upperArmLength + forearmLength;
  const elbowBendRadians = Math.acos(Math.min(1, Math.max(-1,
    dot(elbowToShoulder, elbowToWrist) / Math.max(upperArmLength * forearmLength, 1e-9))));
  const shoulderToWristVerticalDrop = shoulder.worldPosition[1] - wrist.worldPosition[1];
  const shoulderToWristHorizontalReach = Math.hypot(shoulderToWrist[0], shoulderToWrist[2]);
  const shoulderToWristOutwardReach = dot(shoulderToWrist, chain.shoulderOutwardAxis);
  return {
    upperArmLength,
    forearmLength,
    armLength,
    elbowBendRadians,
    elbowFlexRadians: Math.PI - elbowBendRadians,
    shoulderToWristVerticalDrop,
    shoulderToWristVerticalDropRatio: shoulderToWristVerticalDrop / armLength,
    shoulderToWristHorizontalReach,
    shoulderToWristHorizontalReachRatio: shoulderToWristHorizontalReach / armLength,
    shoulderToWristOutwardReach,
    shoulderToWristOutwardReachRatio: Math.abs(shoulderToWristOutwardReach) / armLength,
  };
}

function expectArmPose(model: any, label: string, armed: boolean): void {
  expect(model, `${label}: canonical authored operator GLB`).toMatchObject({
    source: OPERATOR_SOURCE,
    assetUrl: OPERATOR_ASSET,
    license: 'CC0-1.0',
    lod: 0,
    materialContract: 'opaque-embedded-pbr-depth-writing',
    activeClip: 'Walk',
    armBonesPresent: 6,
    visibleEmbeddedWeapons: 0,
    armPose: {
      contract: 'source-glb-skinned-anti-t-arm-chain-v2',
      reference: 'authored-glb-local-transform-before-animation',
      expectedBoneCount: 6,
      allPresent: true,
      allFinite: true,
      allHierarchyValid: true,
      allInEffectivelyVisibleSkinnedMesh: true,
      allAntiTPoseGeometry: true,
      thresholds: ANTI_T_THRESHOLDS,
    },
    handPose: {
      contract: 'source-glb-animated-middle-ring-finger-descendants-v1',
      reference: 'shipped-lod0-walk-animated-second-phalanges',
      expectedBoneCount: 4,
      allPresent: true,
      allDescendantOfWrist: true,
      allInEffectivelyVisibleSkinnedMesh: true,
      allFinite: true,
    },
  });
  expect(model.skinnedMeshes, `${label}: real skinned renderables`).toBeGreaterThan(0);
  expect(model.visibleSkinnedMeshes, `${label}: visible skinned renderables`).toBeGreaterThan(0);
  expect(model.effectivelyVisibleSkinnedMeshes.length, `${label}: effective skinned renderables`).toBeGreaterThan(0);
  expect(model.animationContract.speed, `${label}: active locomotion pose`).toBeGreaterThan(0.18);
  expect(model.armPose.commonEffectiveSkinnedMeshes.length, `${label}: one visible skin owns arms and hands`).toBeGreaterThan(0);
  expect(model.armPose.bones.map(({ side, role, sourceBone, bone }: any) => ({ side, role, sourceBone, bone })), `${label}: both complete authored arm chains`)
    .toEqual(ARM_BONES.map(({ minimumBindRadians: _minimum, ...bone }) => bone));
  for (const [index, bone] of model.armPose.bones.entries()) {
    const expected = ARM_BONES[index];
    expect(bone.finite, `${label}: ${bone.bone} finite transform`).toBe(true);
    expect(bone.inEffectivelyVisibleSkinnedMesh, `${label}: ${bone.bone} drives a visible skin`).toBe(true);
    expect(bone.effectiveSkinnedMeshes, `${label}: ${bone.bone} shares a rendered skeleton`)
      .toEqual(expect.arrayContaining(model.armPose.commonEffectiveSkinnedMeshes));
    expect(bone.bindQuaternionDeltaRadians, `${label}: ${bone.bone} leaves authored T/bind pose`)
      .toBeGreaterThanOrEqual(expected.minimumBindRadians);
  }
  expect(model.handPose.bones.map(({ side, digit, joint, sourceBone, bone }: any) => ({ side, digit, joint, sourceBone, bone })), `${label}: shipped animated finger joints`)
    .toEqual(HAND_BONES);
  for (const finger of model.handPose.bones) {
    expect(finger.descendantOfWrist, `${label}: ${finger.bone} descends from ${finger.wristBone}`).toBe(true);
    expect(finger.wristDescendantPath, `${label}: ${finger.bone} has a real phalanx chain`).toHaveLength(3);
    expect(finger.wristDescendantPath[0]).toBe(finger.wristBone);
    expect(finger.wristDescendantPath.at(-1)).toBe(finger.bone);
    expect(finger.inEffectivelyVisibleSkinnedMesh, `${label}: ${finger.bone} drives the rendered hand`).toBe(true);
    expect(finger.bindQuaternionDeltaRadians, `${label}: ${finger.bone} has a nontrivial authored pose`)
      .toBeGreaterThanOrEqual(MINIMUM_FINGER_BIND_RADIANS);
  }
  expect(model.armPose.chains).toHaveLength(2);
  for (const chain of model.armPose.chains) {
    expect(chain, `${label}: ${chain.side} shoulder/elbow/wrist-hand chain`).toMatchObject({ complete: true });
    const expectedBones = ARM_BONES.filter((bone) => bone.side === chain.side).map((bone) => bone.bone);
    expect(chain.hierarchyPath, `${label}: ${chain.side} real descendant hierarchy`).toEqual(expectedBones);
    expect(chain.directHierarchy, `${label}: ${chain.side} direct shoulder to elbow to wrist`).toBe(true);
    expect(chain.shoulderOutwardAxis, `${label}: ${chain.side} finite outward axis`).toHaveLength(3);
    expect(length(chain.shoulderOutwardAxis)).toBeCloseTo(1, 6);
    const observed = armGeometry(model, chain.side, chain);
    for (const [key, value] of Object.entries(observed)) {
      expect(chain[key], `${label}: independently recomputed ${chain.side} ${key}`).toBeCloseTo(value, 7);
    }
    expect(observed.upperArmLength).toBeGreaterThan(0.1);
    expect(observed.forearmLength).toBeGreaterThan(0.1);
    expect(observed.elbowFlexRadians, `${label}: ${chain.side} meaningful elbow bend`)
      .toBeGreaterThanOrEqual(ANTI_T_THRESHOLDS.minimumElbowFlexRadians);
    expect(observed.shoulderToWristVerticalDrop, `${label}: ${chain.side} wrist materially below shoulder`)
      .toBeGreaterThanOrEqual(ANTI_T_THRESHOLDS.minimumVerticalDropM);
    expect(observed.shoulderToWristVerticalDropRatio).toBeGreaterThanOrEqual(ANTI_T_THRESHOLDS.minimumVerticalDropRatio);
    expect(observed.shoulderToWristHorizontalReachRatio).toBeLessThanOrEqual(ANTI_T_THRESHOLDS.maximumHorizontalReachRatio);
    expect(observed.shoulderToWristOutwardReachRatio).toBeLessThanOrEqual(ANTI_T_THRESHOLDS.maximumOutwardReachRatio);
    expect(chain.antiTPoseGeometry, `${label}: ${chain.side} cannot be a horizontal T arm`).toBe(true);
  }
  if (armed) {
    expect(model.weaponChildren, `${label}: one mounted authored weapon`).toBe(1);
    expect(model.weaponMount, `${label}: direct finite authored weapon mount`).toMatchObject({
      directChild: true,
      finite: true,
      forwardCorrection: 'stable-body-mount-minus-z',
    });
    expect(model.weaponMount.modelId).toEqual(expect.any(String));
    expect(model.supportGrip, `${label}: both hands solve onto the weapon`).toMatchObject({
      bothHandsConnected: true,
      finite: true,
      torsoClear: true,
      torsoRelativeBendHint: true,
      socketName: 'support-socket-l',
      weaponLocalBounds: { containsTarget: true },
      dominantGrip: {
        finite: true,
        torsoClear: true,
        torsoRelativeBendHint: true,
        socketName: 'grip-socket-r',
        weaponLocalBounds: { containsTarget: true },
      },
    });
    for (const grip of [model.supportGrip, model.supportGrip.dominantGrip]) {
      expect(grip.supportError, `${label}: grip reaches authored socket`).toBeLessThanOrEqual(0.025);
      expect(grip.minimumOutwardClearance, `${label}: nonzero torso clearance floor`).toBeGreaterThan(0);
      expect(grip.elbowTorsoOutward, `${label}: elbow remains outward of torso floor`)
        .toBeGreaterThanOrEqual(grip.minimumOutwardClearance);
      expect(grip.weaponLocalBounds.distanceToTarget, `${label}: grip socket lies inside weapon bounds`).toBe(0);
    }
  } else {
    expect(model.weaponChildren, `${label}: unarmed socket remains empty`).toBe(0);
    expect(model.weaponMount, `${label}: no mounted weapon`).toBeNull();
    expect(model.supportGrip, `${label}: no fabricated grip telemetry`).toBeNull();
    expect(model.meleeKnifeVisible, `${label}: hidden melee prop is not an armed dummy`).toBe(false);
  }
}

function poseMotion(first: any, second: any): Record<string, unknown> {
  const boneDeltas = ARM_BONES.map(({ side, role, bone }) => {
    const before = first.operatorModel.armPose.bones.find((entry: any) => entry.side === side && entry.role === role);
    const after = second.operatorModel.armPose.bones.find((entry: any) => entry.side === side && entry.role === role);
    return { side, role, bone, radians: quaternionDelta(before.localQuaternion, after.localQuaternion) };
  });
  return {
    positionM: positionDelta(first.position, second.position),
    boneDeltas,
    movingChains: (['left', 'right'] as const).map((side) => ({
      side,
      maximumRadians: Math.max(...boneDeltas.filter((entry) => entry.side === side).map((entry) => entry.radians)),
    })),
  };
}

function expectPoseMotion(motion: any, label: string, movingInWorld: boolean): void {
  if (movingInWorld) expect(motion.positionM, `${label}: target moves in world`).toBeGreaterThan(0.12);
  expect(motion.boneDeltas).toHaveLength(6);
  for (const chain of motion.movingChains) {
    expect(chain.maximumRadians, `${label}: ${chain.side} arm animation advances`).toBeGreaterThan(0.001);
  }
}

async function captureSurfaceEvidence(page: Page, testInfo: TestInfo, expectedMap: string): Promise<any> {
  const evidence = await page.evaluate(async (expectedRenderer) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    const gl = expectedRenderer === 'webgl2' ? canvas?.getContext('webgl2') ?? null : null;
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    const response = await fetch('/channels/the-big-one/channel-provenance.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Rigged-bot candidate provenance returned HTTP ${response.status}`);
    return {
      map: snapshot.arenaSelection.id,
      runtime: snapshot.render.runtime,
      contextLifecycle: snapshot.render.contextLifecycle,
      runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false,
      servedCandidate: await response.json(),
      userAgent: navigator.userAgent,
      webgl: gl ? {
        adapterClass: 'WebGL2RenderingContext',
        unmaskedRenderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null,
        version: String(gl.getParameter(gl.VERSION)),
      } : null,
    };
  }, renderer);
  expect(evidence.map, 'exact served arena').toBe(expectedMap);
  expect(evidence.runtimeErrorVisible, 'runtime error surface remains hidden').toBe(false);
  expect(evidence.runtime, 'exact renderer runtime').toMatchObject({
    requestedBackend: renderer,
    actualBackend: renderer,
    initialized: true,
    failClosed: false,
    softwareAdapter: false,
    deviceLost: false,
    uncapturedErrors: 0,
  });
  expect(evidence.runtime.adapterLabel).toEqual(expect.any(String));
  expect(evidence.runtime.adapterLabel.trim().length).toBeGreaterThan(0);
  expect(evidence.runtime.adapterLabel).not.toMatch(/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu);
  if (renderer === 'webgpu') {
    expect(evidence.runtime).toMatchObject({
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      presentation: { status: 'healthy' },
    });
  } else {
    expect(evidence.runtime).toMatchObject({
      adapterClass: 'WebGL2RenderingContext',
      presentation: { status: 'synchronous' },
    });
    expect(evidence.contextLifecycle).toEqual({ lost: false, losses: 0, restorations: 0 });
    expect(evidence.webgl).toMatchObject({
      adapterClass: 'WebGL2RenderingContext',
      unmaskedRenderer: evidence.runtime.adapterLabel,
    });
  }
  expect(evidence.servedCandidate).toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: 'PASS 69',
    path: 'channels/the-big-one',
    sourceSha,
  });
  expect(evidence.servedCandidate.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(evidence.servedCandidate.exactRootFileCount).toEqual(expect.any(Number));
  expect(evidence.servedCandidate.exactRootFileCount).toBeGreaterThanOrEqual(2);
  if (officialEvidence) {
    expect(testInfo.project.name).toBe('chromium');
    expect(evidence.userAgent, 'installed Edge user agent').toMatch(/Edg\//u);
  }
  return evidence;
}

async function deploy(page: Page, map: 'atomic-acres' | 'gun-range'): Promise<void> {
  await page.goto(route(map, `pass69-3-rigged-bot-live-${map}`));
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state.weaponReady === true;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
}

async function waitForPresentedFrame(page: Page): Promise<void> {
  const frame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  await page.waitForFunction((before) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > before, frame, { timeout: 5_000 });
}

async function screenshotWithHash(page: Page, testInfo: TestInfo, name: string): Promise<{ path: string; sha256: string }> {
  const path = resolve(artifactRoot, `${name}.png`);
  const screenshot = await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
  return { path: repositoryRelative(path), sha256: sha256(screenshot) };
}

type CaptureActor = Readonly<{ kind: 'bot' | 'training-dummy'; id: string }>;
type CaptureRoi = Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;

async function captureFraming(page: Page, actors: readonly CaptureActor[], roiNdc: CaptureRoi): Promise<any[]> {
  const evidence = await page.evaluate(({ requestedActors, roi }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const canvasBounds = document.querySelector<HTMLCanvasElement>('#game')!.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    return requestedActors.map((actor) => {
      const target = actor.kind === 'bot'
        ? snapshot.bots.find((candidate: any) => candidate.id === actor.id)
        : snapshot.rangePractice.targets.find((candidate: any) => candidate.id === actor.id);
      if (!target) return { actor, missing: true };
      const [x, y, z] = target.screenPosition;
      const withinRoi = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
        && x >= roi.minX && x <= roi.maxX && y >= roi.minY && y <= roi.maxY
        && z >= -1 && z <= 1;
      const projectedPixel = {
        x: canvasBounds.left + (x + 1) * 0.5 * canvasBounds.width,
        y: canvasBounds.top + (1 - y) * 0.5 * canvasBounds.height,
      };
      const onScreen = withinRoi && canvasBounds.width > 0 && canvasBounds.height > 0
        && projectedPixel.x >= Math.max(0, canvasBounds.left)
        && projectedPixel.x <= Math.min(viewport.width, canvasBounds.right)
        && projectedPixel.y >= Math.max(0, canvasBounds.top)
        && projectedPixel.y <= Math.min(viewport.height, canvasBounds.bottom);
      return {
        actor,
        missing: false,
        screenPosition: [x, y, z],
        roiNdc: roi,
        withinRoi,
        onScreen,
        rootVisible: actor.kind === 'bot' ? target.rootVisible : target.visible,
        rootEffectivelyVisible: target.rootEffectivelyVisible,
        effectivelyVisibleMeshCount: target.effectivelyVisibleMeshCount,
        effectivelyVisibleSkinnedMeshes: target.operatorModel?.effectivelyVisibleSkinnedMeshes ?? [],
        armSkinVisible: target.operatorModel?.armPose?.allInEffectivelyVisibleSkinnedMesh === true,
        handSkinVisible: target.operatorModel?.handPose?.allInEffectivelyVisibleSkinnedMesh === true,
        canvas: {
          left: canvasBounds.left,
          top: canvasBounds.top,
          width: canvasBounds.width,
          height: canvasBounds.height,
        },
        viewport,
        projectedPixel,
      };
    });
  }, { requestedActors: actors, roi: roiNdc });
  for (const framing of evidence) {
    const label = `${framing.actor.kind}:${framing.actor.id}`;
    expect(framing.missing, `${label}: capture actor exists`).toBe(false);
    expect(framing.rootVisible, `${label}: root visible`).toBe(true);
    expect(framing.rootEffectivelyVisible, `${label}: visible through every ancestor`).toBe(true);
    expect(framing.effectivelyVisibleMeshCount, `${label}: effective renderables`).toBeGreaterThan(0);
    expect(framing.effectivelyVisibleSkinnedMeshes.length, `${label}: effective skinned renderables`).toBeGreaterThan(0);
    expect(framing.armSkinVisible, `${label}: arm bones drive visible skin`).toBe(true);
    expect(framing.handSkinVisible, `${label}: finger bones drive visible skin`).toBe(true);
    expect(framing.screenPosition.every(Number.isFinite), `${label}: finite projection`).toBe(true);
    expect(framing.withinRoi, `${label}: bounded live screenshot ROI ${JSON.stringify(framing)}`).toBe(true);
    expect(framing.onScreen, `${label}: projected actor point is inside the visible canvas and viewport`).toBe(true);
  }
  return evidence;
}

function cameraPose(target: number[], distance: number): { x: number; y: number; z: number; yaw: number; pitch: number } {
  const x = target[0] + distance * 0.72;
  const y = target[1] + 1.08;
  const z = target[2] + distance * 0.69;
  return {
    x,
    y,
    z,
    yaw: Math.atan2(-(target[0] - x), -(target[2] - z)),
    pitch: -0.035,
  };
}

async function captureAtPose(
  page: Page,
  testInfo: TestInfo,
  target: number[],
  distance: number,
  name: string,
  actor: CaptureActor,
  roiNdc: CaptureRoi,
) {
  const pose = cameraPose(target, distance);
  await page.evaluate(({ x, y, z, yaw, pitch }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setRenderPaused(false);
    api.setCaptureCameraPose(x, y, z, yaw, pitch, 58);
  }, pose);
  await waitForPresentedFrame(page);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  const [framing] = await captureFraming(page, [actor], roiNdc);
  const screenshot = await screenshotWithHash(page, testInfo, name);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  return { ...screenshot, framing };
}

async function waitForStrictPose(
  page: Page,
  kind: 'armed-bot' | 'unarmed-dummies',
  expectedIds: readonly string[] = [],
): Promise<void> {
  await expect.poll(async () => page.evaluate(({ actorKind, ids, armBones, fingerBones, fingerMinimum }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const actors = actorKind === 'armed-bot'
      ? snapshot.bots.slice(0, 1)
      : snapshot.rangePractice.targets.filter((target: any) => target.kind === 'training-dummy');
    if (actorKind === 'armed-bot' && !(actors[0]?.alive && actors[0]?.weapon === 'carbine')) return false;
    if (actorKind === 'unarmed-dummies'
      && (actors.length !== ids.length || actors.some((actor: any, index: number) => actor.id !== ids[index]))) return false;
    return actors.every((actor: any) => {
      const model = actor.operatorModel;
      const grip = model?.supportGrip;
      return model?.activeClip === 'Walk'
        && model.armPose?.allHierarchyValid === true
        && model.armPose?.allInEffectivelyVisibleSkinnedMesh === true
        && model.armPose?.allAntiTPoseGeometry === true
        && model.armPose.bones?.length === armBones.length
        && model.armPose.bones.every((bone: any, index: number) => (
          bone.bindQuaternionDeltaRadians >= armBones[index].minimumBindRadians
        ))
        && model.handPose?.allDescendantOfWrist === true
        && model.handPose?.allInEffectivelyVisibleSkinnedMesh === true
        && model.handPose.bones?.length === fingerBones.length
        && model.handPose.bones.every((bone: any) => bone.bindQuaternionDeltaRadians >= fingerMinimum)
        && (actorKind === 'armed-bot'
          ? model.weaponChildren === 1
            && grip?.bothHandsConnected === true
            && grip.torsoClear === true
            && grip.elbowTorsoOutward >= grip.minimumOutwardClearance
            && grip.dominantGrip?.torsoClear === true
            && grip.dominantGrip.elbowTorsoOutward >= grip.dominantGrip.minimumOutwardClearance
          : actor.armed === false && model.weaponChildren === 0 && model.weaponMount === null);
    });
  }, {
    actorKind: kind,
    ids: expectedIds,
    armBones: ARM_BONES,
    fingerBones: HAND_BONES,
    fingerMinimum: MINIMUM_FINGER_BIND_RADIANS,
  }), { timeout: 12_000 }).toBe(true);
}

test('real armed bot and all four unarmed Gun Range dummies leave the authored T/bind pose', async ({ browser, page }, testInfo) => {
  test.setTimeout(renderer === 'webgpu' ? 180_000 : 140_000);
  rmSync(artifactRoot, { recursive: true, force: true });
  rmSync(receiptPath, { force: true });
  mkdirSync(artifactRoot, { recursive: true });
  if (officialEvidence) {
    expect(sourceSha, 'official rigged-bot evidence starts at requested exact HEAD').toBe(expectedSourceSha);
    expect(sourceStatus, 'official rigged-bot evidence starts from a clean worktree').toBe('');
  }
  await page.setViewportSize({ width: 1_600, height: 900 });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });

  await deploy(page, 'atomic-acres');
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setCaptureViewmodelHidden(true);
    api.setBotsFrozen(true);
    api.placeBotAhead(5.2);
    api.setBotPresentation('stand', 1.2, 'carbine');
  });
  await waitForStrictPose(page, 'armed-bot');
  const armedFirst = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots[0]);
  await page.waitForTimeout(420);
  await waitForStrictPose(page, 'armed-bot');
  const armedSecond = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots[0]);
  expectArmPose(armedFirst.operatorModel, 'armed live bot first pose', true);
  expectArmPose(armedSecond.operatorModel, 'armed live bot second pose', true);
  const armedMotion = poseMotion(armedFirst, armedSecond);
  expectPoseMotion(armedMotion, 'armed live bot', false);
  const armedActor = { kind: 'bot' as const, id: armedSecond.id };
  const armedScreenshots = {
    medium: await captureAtPose(page, testInfo, armedSecond.position, 4.4, 'armed-live-bot-medium', armedActor, MEDIUM_ROI_NDC),
    close: await captureAtPose(page, testInfo, armedSecond.position, 2.15, 'armed-live-bot-close', armedActor, CLOSE_ROI_NDC),
  };
  const armedRuntime = await captureSurfaceEvidence(page, testInfo, 'atomic-acres');

  await deploy(page, 'gun-range');
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
  });
  const expectedDummyIds = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map(({ id }) => id);
  await waitForStrictPose(page, 'unarmed-dummies', expectedDummyIds);
  const dummyFirst = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).rangePractice.targets
    .filter((target: any) => target.kind === 'training-dummy'));
  await page.waitForTimeout(460);
  await waitForStrictPose(page, 'unarmed-dummies', expectedDummyIds);
  const dummySecond = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).rangePractice.targets
    .filter((target: any) => target.kind === 'training-dummy'));
  expect(dummyFirst.map(({ id }: any) => id)).toEqual(expectedDummyIds);
  expect(dummySecond.map(({ id }: any) => id)).toEqual(expectedDummyIds);
  const dummies = dummyFirst.map((first: any, index: number) => {
    const second = dummySecond[index];
    const definition = GUN_RANGE_TEST_BAY_CONTRACT.dummies[index];
    expect(first.armed, `${first.id}: explicitly unarmed`).toBe(false);
    expect(second.armed, `${first.id}: remains unarmed`).toBe(false);
    expectArmPose(first.operatorModel, `${first.id} first pose`, false);
    expectArmPose(second.operatorModel, `${first.id} second pose`, false);
    expect(first.operatorModel.animationContract.speed).toBeCloseTo(definition.speedMps, 5);
    expect(second.operatorModel.animationContract.speed).toBeCloseTo(definition.speedMps, 5);
    const motion = poseMotion(first, second);
    expectPoseMotion(motion, first.id, true);
    return { id: first.id, definition, first, second, motion };
  });

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera('gun-range-test-bay-overview'))).toBe(true);
  await waitForPresentedFrame(page);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  const overviewFraming = await captureFraming(
    page,
    expectedDummyIds.map((id) => ({ kind: 'training-dummy' as const, id })),
    OVERVIEW_ROI_NDC,
  );
  const overviewScreenshot = {
    ...await screenshotWithHash(page, testInfo, 'gun-range-dummies-medium'),
    framing: overviewFraming,
  };
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  const dummyEvidence = [];
  for (const dummy of dummies) {
    const current = await page.evaluate((id) => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).rangePractice.targets
      .find((target: any) => target.id === id), dummy.id);
    const closeScreenshot = await captureAtPose(
      page,
      testInfo,
      current.position,
      2.1,
      `${dummy.id}-close`,
      { kind: 'training-dummy', id: dummy.id },
      CLOSE_ROI_NDC,
    );
    dummyEvidence.push({ ...dummy, closeScreenshot });
  }
  const gunRangeRuntime = await captureSurfaceEvidence(page, testInfo, 'gun-range');
  expect(gunRangeRuntime.servedCandidate).toEqual(armedRuntime.servedCandidate);
  expect(browserErrors).toEqual([]);

  const endingSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
  }).trim();
  const endingSourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
  }).trim();
  if (officialEvidence) {
    expect(endingSourceSha, 'official rigged-bot evidence ends at the same exact HEAD').toBe(sourceSha);
    expect(endingSourceStatus, 'official rigged-bot evidence ends with a clean worktree').toBe('');
  }
  writeFileSync(receiptPath, `${JSON.stringify({
    schemaVersion: 2,
    status: 'PASS',
    contract: 'atomic-acres/pass69-3-rigged-bot-live@2',
    evidenceScope: 'real-glb-skinned-hierarchy-anti-t-hands-grip-and-live-framing',
    target: officialEvidence ? expectedTarget : `development-${renderer}`,
    sourceSha,
    endingSourceSha,
    cleanSource: sourceStatus === '' && endingSourceStatus === '',
    renderer,
    renderProfile,
    viewport: [1_600, 900],
    armBindThresholds: ARM_BONES.map(({ side, role, sourceBone, bone, minimumBindRadians }) => (
      { side, role, sourceBone, bone, minimumBindRadians }
    )),
    minimumFingerBindRadians: MINIMUM_FINGER_BIND_RADIANS,
    antiTThresholds: ANTI_T_THRESHOLDS,
    captureRoisNdc: { close: CLOSE_ROI_NDC, medium: MEDIUM_ROI_NDC, overview: OVERVIEW_ROI_NDC },
    visualReview: {
      required: true,
      status: 'PENDING_OWNER_INSPECTION',
      automatedFramingIsNotVisualAcceptance: true,
      inspectionScope: 'armed medium/close plus four dummy closeups and shared overview',
    },
    browser: {
      project: testInfo.project.name,
      channel: officialEvidence ? 'msedge' : 'configured-chromium',
      version: browser.version(),
      userAgent: gunRangeRuntime.userAgent,
    },
    armedBot: {
      id: armedFirst.id,
      weapon: armedFirst.weapon,
      alive: armedFirst.alive,
      first: armedFirst,
      second: armedSecond,
      motion: armedMotion,
      screenshots: armedScreenshots,
    },
    gunRangeDummies: {
      expectedIds: expectedDummyIds,
      overviewScreenshot,
      entries: dummyEvidence,
    },
    surfaces: { armedBot: armedRuntime, gunRange: gunRangeRuntime },
    browserErrors,
  }, null, 2)}\n`, 'utf8');
});
