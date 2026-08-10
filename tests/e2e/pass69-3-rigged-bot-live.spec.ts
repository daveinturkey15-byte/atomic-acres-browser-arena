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
const MINIMUM_BIND_ROTATION_RADIANS = 0.005;
const ARM_BONES = Object.freeze([
  Object.freeze({ side: 'left', role: 'shoulder', bone: 'UpperArmL' }),
  Object.freeze({ side: 'left', role: 'elbow', bone: 'LowerArmL' }),
  Object.freeze({ side: 'left', role: 'wrist-hand', bone: 'WristL' }),
  Object.freeze({ side: 'right', role: 'shoulder', bone: 'UpperArmR' }),
  Object.freeze({ side: 'right', role: 'elbow', bone: 'LowerArmR' }),
  Object.freeze({ side: 'right', role: 'wrist-hand', bone: 'WristR' }),
]);

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
      contract: 'source-glb-bind-arm-chain-v1',
      reference: 'authored-glb-local-transform-before-animation',
      expectedBoneCount: 6,
      allPresent: true,
      allFinite: true,
    },
  });
  expect(model.skinnedMeshes, `${label}: real skinned renderables`).toBeGreaterThan(0);
  expect(model.visibleSkinnedMeshes, `${label}: visible skinned renderables`).toBeGreaterThan(0);
  expect(model.animationContract.speed, `${label}: active locomotion pose`).toBeGreaterThan(0.18);
  expect(model.armPose.bones.map(({ side, role, bone }: any) => ({ side, role, bone })), `${label}: both complete arm chains`)
    .toEqual(ARM_BONES);
  for (const bone of model.armPose.bones) {
    expect(bone.finite, `${label}: ${bone.bone} finite transform`).toBe(true);
    expect(bone.bindQuaternionDeltaRadians, `${label}: ${bone.bone} leaves authored T/bind pose`)
      .toBeGreaterThanOrEqual(MINIMUM_BIND_ROTATION_RADIANS);
  }
  expect(model.armPose.chains).toHaveLength(2);
  for (const chain of model.armPose.chains) {
    expect(chain, `${label}: ${chain.side} shoulder/elbow/wrist-hand chain`).toMatchObject({ complete: true });
    expect(chain.upperArmLength).toBeGreaterThan(0.1);
    expect(chain.forearmLength).toBeGreaterThan(0.1);
    expect(chain.elbowBendRadians).toBeGreaterThan(0);
    expect(chain.elbowBendRadians).toBeLessThan(Math.PI);
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
      socketName: 'support-socket-l',
      dominantGrip: { finite: true, socketName: 'grip-socket-r' },
    });
    expect(model.supportGrip.supportError).toBeLessThanOrEqual(0.055);
    expect(model.supportGrip.dominantGrip.supportError).toBeLessThanOrEqual(0.055);
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

async function captureAtPose(page: Page, testInfo: TestInfo, target: number[], distance: number, name: string) {
  const pose = cameraPose(target, distance);
  await page.evaluate(({ x, y, z, yaw, pitch }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setRenderPaused(false);
    api.setCaptureCameraPose(x, y, z, yaw, pitch, 58);
  }, pose);
  await waitForPresentedFrame(page);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  const screenshot = await screenshotWithHash(page, testInfo, name);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  return screenshot;
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
  await expect.poll(async () => page.evaluate(() => {
    const bot = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots[0];
    const model = bot?.operatorModel;
    return Boolean(bot?.alive && bot?.weapon === 'carbine'
      && model?.activeClip === 'Walk'
      && model?.weaponChildren === 1
      && model?.supportGrip?.bothHandsConnected === true
      && model?.armPose?.bones?.length === 6
      && model.armPose.bones.every((bone: any) => bone.bindQuaternionDeltaRadians >= 0.005));
  }), { timeout: 12_000 }).toBe(true);
  const armedFirst = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots[0]);
  await page.waitForTimeout(420);
  const armedSecond = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).bots[0]);
  expectArmPose(armedFirst.operatorModel, 'armed live bot first pose', true);
  expectArmPose(armedSecond.operatorModel, 'armed live bot second pose', true);
  const armedMotion = poseMotion(armedFirst, armedSecond);
  expectPoseMotion(armedMotion, 'armed live bot', false);
  const armedScreenshots = {
    medium: await captureAtPose(page, testInfo, armedSecond.position, 4.4, 'armed-live-bot-medium'),
    close: await captureAtPose(page, testInfo, armedSecond.position, 2.15, 'armed-live-bot-close'),
  };
  const armedRuntime = await captureSurfaceEvidence(page, testInfo, 'atomic-acres');

  await deploy(page, 'gun-range');
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
  });
  const expectedDummyIds = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map(({ id }) => id);
  await expect.poll(async () => page.evaluate((ids) => {
    const dummies = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).rangePractice.targets
      .filter((target: any) => target.kind === 'training-dummy');
    return dummies.length === ids.length
      && dummies.every((dummy: any, index: number) => dummy.id === ids[index]
        && dummy.armed === false
        && dummy.operatorModel?.activeClip === 'Walk'
        && dummy.operatorModel?.weaponChildren === 0
        && dummy.operatorModel?.weaponMount === null
        && dummy.operatorModel?.armPose?.bones?.length === 6
        && dummy.operatorModel.armPose.bones.every((bone: any) => bone.bindQuaternionDeltaRadians >= 0.005));
  }, expectedDummyIds), { timeout: 12_000 }).toBe(true);
  const dummyFirst = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).rangePractice.targets
    .filter((target: any) => target.kind === 'training-dummy'));
  await page.waitForTimeout(460);
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
  const overviewScreenshot = await screenshotWithHash(page, testInfo, 'gun-range-dummies-medium');
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  const dummyEvidence = [];
  for (const dummy of dummies) {
    const current = await page.evaluate((id) => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).rangePractice.targets
      .find((target: any) => target.id === id), dummy.id);
    const closeScreenshot = await captureAtPose(page, testInfo, current.position, 2.1, `${dummy.id}-close`);
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
    schemaVersion: 1,
    status: 'PASS',
    contract: 'atomic-acres/pass69-3-rigged-bot-live@1',
    evidenceScope: 'real-glb-armed-bot-and-four-unarmed-moving-dummies-arm-chain-pose',
    target: officialEvidence ? expectedTarget : `development-${renderer}`,
    sourceSha,
    endingSourceSha,
    cleanSource: sourceStatus === '' && endingSourceStatus === '',
    renderer,
    renderProfile,
    viewport: [1_600, 900],
    minimumBindRotationRadians: MINIMUM_BIND_ROTATION_RADIANS,
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
