import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { WEAPON_IDS, type WeaponId } from '../../src/protocol';

declare global {
  interface Window {
    __ATOMIC_ACRES_DEBUG__: any;
  }
}

type Renderer = 'webgl2' | 'webgpu';
type PoseKind = 'hip' | 'ads' | 'fire-kick' | 'reload';

const requestedRenderer = process.env.PASS69_3_NEAR_PLANE_RENDERER ?? 'webgl2';
if (requestedRenderer !== 'webgl2' && requestedRenderer !== 'webgpu') {
  throw new Error(`Pass 69.3 authored near-plane renderer must be webgl2 or webgpu; received ${requestedRenderer}`);
}
const renderer: Renderer = requestedRenderer;
const renderProfile = process.env.PASS69_3_NEAR_PLANE_RENDER_PROFILE ?? 'blender';
if (renderProfile !== 'blender') {
  throw new Error(`Pass 69.3 authored near-plane evidence requires the Blender profile; received ${renderProfile}`);
}

const expectedSourceSha = process.env.PASS69_3_NEAR_PLANE_SOURCE_SHA ?? '';
const expectedTarget = process.env.PASS69_3_NEAR_PLANE_TARGET ?? '';
const officialEvidence = expectedSourceSha !== '' || expectedTarget !== '';
const expectedTargetForRenderer = `edge-${renderer}`;
if (officialEvidence && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha) || expectedTarget !== expectedTargetForRenderer)) {
  throw new Error(`Pass 69.3 authored near-plane evidence has incomplete target provenance for ${expectedTargetForRenderer}`);
}

const repositoryRoot = process.cwd();
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
}).trim();
const sourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
}).trim();
const artifactBase = resolve(repositoryRoot, 'artifacts/pass69-3/authored-near-plane-catalog');
const artifactRoot = resolve(artifactBase, renderer);
const receiptPath = resolve(artifactBase, `receipt-${renderer}.json`);
const viewport = Object.freeze({ width: 1_600, height: 900 });

// Independent release expectation. Do not import the runtime table here: a
// changed table must fail this gate until a new real-GLB calibration is reviewed.
const EXPECTED_CONTACT_RETREAT = Object.freeze({
  carbine: 0,
  smg: 0,
  lmg: 0.1,
  scattergun: 0.03,
  sniper: 0.14,
  'mini-uzi': 0,
  mp5: 0,
  m4a1: 0,
  'ak-47': 0.03,
  minigun: 0,
  'm14-ebr': 0.05,
  'slug-shotgun': 0.03,
  pistol: 0,
  'machine-pistol': 0,
  magnum: 0,
  'flashlight-pistol': 0,
  'explosive-crossbow': 0,
  railgun: 0.1,
  flamethrower: 0,
  'flare-gun': 0,
} satisfies Readonly<Record<WeaponId, number>>);

const FIRE_KICK_AGES_MS = Object.freeze([0, 4, 8, 12, 16, 24, 36, 52, 78, 105, 150, 225, 310]);
const RELOAD_PROGRESS_SAMPLES = Object.freeze([0.08, 0.22, 0.38, 0.52, 0.68, 0.84]);
const FULLSCREEN_OPTIC_WEAPONS = new Set<WeaponId>(['sniper', 'm14-ebr']);
const CONVERGENCE = Object.freeze({
  contract: 'consecutive-presented-transform-and-depth-v1',
  requiredStableTransitions: 8,
  minimumStableElapsedMs: 50,
  maximumPositionDelta: 0.0005,
  maximumRotationDelta: 0.0005,
  maximumDepthDelta: 0.0005,
  timeoutMs: 8_000,
});
const CONTACT_FIXTURE = Object.freeze({
  contract: 'gun-range-west-wall-prone-pose-v2',
  map: 'gun-range',
  stance: 'prone',
  teleportPosition: Object.freeze([-19.65, 1.7, -14.5] as const),
  // Repeatable post-controller grounded state. The old 0.61m eye height was
  // only the transient teleport/setStance value before the controller settled.
  settledPosition: Object.freeze([-19.6465, 0.6363, -14.5] as const),
  yaw: Math.PI / 2,
  pitch: 0,
  maximumPositionAxisError: 0.005,
  maximumAngularError: 0.000001,
  minimumSurfaceLift: 0.13,
});
const CONTACT_FIXTURE_CONVERGENCE = Object.freeze({
  contract: 'consecutive-presented-contact-fixture-v1',
  requiredStableTransitions: 8,
  minimumStableElapsedMs: 50,
  maximumPositionDelta: 0.0005,
  maximumYawDelta: 0.000001,
  maximumPitchDelta: 0.000001,
  maximumSurfaceRetreatDelta: 0.0005,
  maximumSurfaceLiftDelta: 0.0005,
  timeoutMs: 10_000,
});
const ROUND_CONTINUITY = Object.freeze({
  contract: 'gun-range-production-rematch-round-refresh-v1',
  minimumResetTimerSeconds: 119,
});

type FirearmSpec = Readonly<{ id: WeaponId; designId: string }>;
const firearmSpecs = (JSON.parse(readFileSync(
  resolve(repositoryRoot, 'source-assets/blender/pass65-weapon-family-specs.json'),
  'utf8',
)) as { weapons: FirearmSpec[] }).weapons;
const designIds = new Map<WeaponId, string>(firearmSpecs.map((entry) => [entry.id, entry.designId]));
designIds.set('explosive-crossbow', 'pass65-explosive-crossbow-project-original-v1');

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function repositoryRelative(path: string): string {
  return relative(repositoryRoot, path).replaceAll('\\', '/');
}

function matchTimerSeconds(value: string | null): number {
  const match = /^(\d{2}):(\d{2})$/u.exec(value ?? '');
  if (!match) return Number.NaN;
  const seconds = Number(match[2]);
  return seconds < 60 ? Number(match[1]) * 60 + seconds : Number.NaN;
}

function expectedAssetSource(weapon: WeaponId): string {
  return weapon === 'explosive-crossbow'
    ? './assets/original/models/weapons/pass65-crossbow/pass65-crossbow-fp-lod0.glb'
    : `./assets/original/models/weapons/pass65-firearms/${weapon}/${weapon}-fp-lod0.glb`;
}

function expectedFirstPersonSource(weapon: WeaponId): string {
  return weapon === 'explosive-crossbow'
    ? 'project-original-blender-pass65-crossbow'
    : 'project-original-blender-pass65-firearm';
}

function expectedFireCycle(weapon: WeaponId, ageMs: number): Readonly<{
  flash: number;
  kick: number;
  boltTravel: number;
  casingReady: boolean;
}> {
  const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
  const age = Math.max(0, ageMs);
  const fastAuto = weapon === 'smg' || weapon === 'machine-pistol';
  const cycleMs = fastAuto ? 44 : weapon === 'scattergun' ? 620 : weapon === 'sniper' ? 920
    : weapon === 'lmg' ? 84 : 62;
  const flashDuration = weapon === 'scattergun' ? 82 : weapon === 'sniper' ? 78
    : weapon === 'lmg' ? 62 : fastAuto ? 36 : 52;
  const flashProgress = clamp01(age / flashDuration);
  const kickDuration = weapon === 'scattergun' ? 170 : weapon === 'sniper' ? 310
    : weapon === 'magnum' ? 150 : weapon === 'lmg' ? 105 : fastAuto ? 50
      : weapon === 'pistol' ? 58 : 62;
  const kickProgress = clamp01(age / kickDuration);
  const actionAge = weapon === 'scattergun' ? Math.max(0, age - 180)
    : weapon === 'sniper' ? Math.max(0, age - 130) : age;
  const actionDuration = weapon === 'scattergun' ? 440 : weapon === 'sniper' ? 700 : cycleMs;
  const actionProgress = clamp01(actionAge / actionDuration);
  return {
    flash: (1 - flashProgress) ** 2,
    kick: kickProgress >= 1 ? 0 : (1 - kickProgress) ** 1.35,
    boltTravel: actionProgress >= 1 ? 0 : Math.sin(actionProgress * Math.PI),
    casingReady: age >= (weapon === 'scattergun' ? 230 : weapon === 'sniper' ? 150 : fastAuto ? 24 : 34),
  };
}

function expectRendererProvenance(runtime: any, label: string): void {
  expect(runtime, `${label}: requested renderer reaches the actual renderer`).toMatchObject({
    requestedBackend: renderer,
    actualBackend: renderer,
    initialized: true,
    failClosed: false,
    deviceLost: false,
    uncapturedErrors: 0,
  });
  if (officialEvidence) expect(runtime.softwareAdapter, `${label}: hardware renderer provenance`).toBe(false);
  if (renderer === 'webgpu') {
    expect(runtime.adapterClass, `${label}: native WebGPU adapter`).toBe('GPUAdapter');
    expect(runtime.deviceClass, `${label}: native WebGPU device`).toBe('GPUDevice');
    expect(runtime.presentation, `${label}: native WebGPU presentation remains healthy`).toMatchObject({ status: 'healthy' });
  } else {
    expect(runtime.adapterClass, `${label}: WebGL2 context provenance`).toBe('WebGL2RenderingContext');
    expect(runtime.presentation, `${label}: WebGL2 stays synchronous`).toMatchObject({ status: 'synchronous' });
  }
}

async function presentedFrame(page: Page): Promise<number> {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.admissionState().presentedGameplayFrame);
}

async function waitForPresentedFrames(page: Page, before: number, count = 3): Promise<number> {
  await page.waitForFunction(({ baseline, required }) => (
    window.__ATOMIC_ACRES_DEBUG__!.admissionState().presentedGameplayFrame >= baseline + required
  ), { baseline: before, required: count }, { timeout: 10_000 });
  return presentedFrame(page);
}

type PoseConvergenceOptions = Readonly<{
  weapon: WeaponId;
  action: 'hip' | 'ads' | 'reload';
  effectiveViewmodelVisible: boolean;
  reloadProgress?: number;
}>;

type ContactFixtureConvergenceReceipt = Readonly<{
  contract: string;
  fixtureContract: string;
  label: string;
  requiredStableTransitions: number;
  stableTransitions: number;
  stableSampleCount: number;
  startedPresentedFrame: number;
  endedPresentedFrame: number;
  stableElapsedMs: number;
  totalElapsedMs: number;
  maximumPositionDelta: number;
  maximumYawDelta: number;
  maximumPitchDelta: number;
  maximumSurfaceRetreatDelta: number;
  maximumSurfaceLiftDelta: number;
  thresholds: Readonly<{
    position: number;
    yaw: number;
    pitch: number;
    surfaceRetreat: number;
    surfaceLift: number;
  }>;
  requirements: Readonly<{
    matchPhase: 'active';
    map: string;
    stance: string;
    settledPosition: readonly number[];
    maximumPositionAxisError: number;
    yaw: number;
    pitch: number;
    maximumAngularError: number;
    saturatedSurfaceRetreat: true;
    minimumSurfaceLift: number;
  }>;
  observed: Readonly<{
    matchPhase: 'active';
    map: string;
    stance: string;
    presentedGameplayFrame: number;
    position: number[];
    yaw: number;
    pitch: number;
    surfaceRetreat: number;
    maximumSurfaceRetreat: number;
    surfaceLift: number;
  }>;
}>;

async function waitForPoseConvergence(page: Page, options: PoseConvergenceOptions): Promise<Record<string, unknown>> {
  return page.evaluate(async ({ expected, limits }) => new Promise<Record<string, unknown>>((resolvePromise, rejectPromise) => {
    const startedAt = performance.now();
    let previous: Readonly<{
      frame: number;
      rootPosition: number[];
      rootRotation: number[];
      weaponDepth: number | null;
      armDepth: number | null;
    }> | null = null;
    let stableStartedAt = 0;
    let stableStartedFrame = 0;
    let stableTransitions = 0;
    let maximumPositionDelta = 0;
    let maximumRotationDelta = 0;
    let maximumDepthDelta = 0;
    let lastReason = 'no sample';

    const resetStableRun = (): void => {
      stableStartedAt = 0;
      stableStartedFrame = 0;
      stableTransitions = 0;
      maximumPositionDelta = 0;
      maximumRotationDelta = 0;
      maximumDepthDelta = 0;
    };
    const vectorDelta = (left: readonly number[], right: readonly number[]): number => (
      Math.max(...left.map((value, index) => Math.abs(value - right[index]!)))
    );
    const tick = (): void => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const state = api.snapshot();
      const presentation = state.weaponPresentation;
      const frame = api.admissionState().presentedGameplayFrame;
      const rootPosition = presentation.viewmodelViewport?.rootPosition;
      const rootRotation = presentation.viewmodelViewport?.rootRotation;
      const effectiveVisible = state.sniperScope.viewmodelVisible === true;
      const poseReady = presentation.weapon === expected.weapon
        && presentation.actionContract?.state === expected.action
        && effectiveVisible === expected.effectiveViewmodelVisible
        && (expected.reloadProgress === undefined
          || Math.abs(presentation.actionContract?.reloadProgress - expected.reloadProgress) <= 0.015);
      const weaponDepth = effectiveVisible ? presentation.weaponFraming?.nearestDepth : null;
      const armDepth = effectiveVisible ? presentation.armFraming?.nearestDepth : null;
      const telemetryReady = Array.isArray(rootPosition) && rootPosition.length === 3
        && rootPosition.every(Number.isFinite)
        && Array.isArray(rootRotation) && rootRotation.length === 3
        && rootRotation.every(Number.isFinite)
        && (!effectiveVisible || Number.isFinite(weaponDepth) && Number.isFinite(armDepth));
      if (!poseReady || !telemetryReady) {
        lastReason = !poseReady ? 'pose-not-ready' : 'convergence-telemetry-missing';
        previous = null;
        resetStableRun();
      } else if (previous && frame === previous.frame + 1) {
        const positionDelta = vectorDelta(rootPosition, previous.rootPosition);
        const rotationDelta = vectorDelta(rootRotation, previous.rootRotation);
        const depthDelta = effectiveVisible
          ? Math.max(
            Math.abs(weaponDepth - previous.weaponDepth!),
            Math.abs(armDepth - previous.armDepth!),
          )
          : 0;
        if (positionDelta <= limits.maximumPositionDelta
          && rotationDelta <= limits.maximumRotationDelta
          && depthDelta <= limits.maximumDepthDelta) {
          if (stableTransitions === 0) {
            stableStartedAt = performance.now();
            stableStartedFrame = previous.frame;
          }
          stableTransitions += 1;
          maximumPositionDelta = Math.max(maximumPositionDelta, positionDelta);
          maximumRotationDelta = Math.max(maximumRotationDelta, rotationDelta);
          maximumDepthDelta = Math.max(maximumDepthDelta, depthDelta);
          const stableElapsedMs = performance.now() - stableStartedAt;
          if (stableTransitions >= limits.requiredStableTransitions
            && stableElapsedMs >= limits.minimumStableElapsedMs) {
            resolvePromise({
              contract: limits.contract,
              effectiveViewmodelVisible: effectiveVisible,
              requiredStableTransitions: limits.requiredStableTransitions,
              stableTransitions,
              stableSampleCount: stableTransitions + 1,
              startedPresentedFrame: stableStartedFrame,
              endedPresentedFrame: frame,
              stableElapsedMs,
              totalElapsedMs: performance.now() - startedAt,
              maximumPositionDelta,
              maximumRotationDelta,
              maximumDepthDelta,
              thresholds: {
                position: limits.maximumPositionDelta,
                rotation: limits.maximumRotationDelta,
                depth: limits.maximumDepthDelta,
              },
            });
            return;
          }
        } else {
          lastReason = `unstable:${positionDelta}:${rotationDelta}:${depthDelta}`;
          resetStableRun();
        }
      } else if (previous && frame !== previous.frame) {
        lastReason = `non-consecutive-presented-frame:${previous.frame}->${frame}`;
        resetStableRun();
      }
      if (poseReady && telemetryReady && (!previous || frame !== previous.frame)) {
        previous = { frame, rootPosition: [...rootPosition], rootRotation: [...rootRotation], weaponDepth, armDepth };
      }
      if (performance.now() - startedAt >= limits.timeoutMs) {
        rejectPromise(new Error(`Pose convergence timed out for ${expected.weapon}/${expected.action}: ${lastReason}`));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { expected: options, limits: CONVERGENCE });
}

async function waitForContactFixtureConvergence(page: Page, label: string): Promise<ContactFixtureConvergenceReceipt> {
  return page.evaluate(async ({ fixture, limits, evidenceLabel }) => new Promise<ContactFixtureConvergenceReceipt>((resolvePromise, rejectPromise) => {
    type ContactSample = Readonly<{
      frame: number;
      position: number[];
      yaw: number;
      pitch: number;
      surfaceRetreat: number;
      maximumSurfaceRetreat: number;
      surfaceLift: number;
    }>;
    const startedAt = performance.now();
    let previous: ContactSample | null = null;
    let stableStartedAt = 0;
    let stableStartedFrame = 0;
    let stableTransitions = 0;
    let maximumPositionDelta = 0;
    let maximumYawDelta = 0;
    let maximumPitchDelta = 0;
    let maximumSurfaceRetreatDelta = 0;
    let maximumSurfaceLiftDelta = 0;
    let lastReason = 'no-sample';

    const resetStableRun = (): void => {
      stableStartedAt = 0;
      stableStartedFrame = 0;
      stableTransitions = 0;
      maximumPositionDelta = 0;
      maximumYawDelta = 0;
      maximumPitchDelta = 0;
      maximumSurfaceRetreatDelta = 0;
      maximumSurfaceLiftDelta = 0;
    };
    const vectorDelta = (left: readonly number[], right: readonly number[]): number => (
      Math.max(...left.map((value, index) => Math.abs(value - right[index]!)))
    );
    const angularDelta = (left: number, right: number): number => Math.abs(Math.atan2(
      Math.sin(left - right),
      Math.cos(left - right),
    ));
    const tick = (): void => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const state = api.snapshot();
      const frame = api.admissionState().presentedGameplayFrame as number;
      const position = state.player.position as number[];
      const yaw = state.player.yaw as number;
      const pitch = state.player.pitch as number;
      const surfaceRetreat = state.weaponPresentation.surfaceRetreat as number;
      const maximumSurfaceRetreat = state.weaponPresentation.nearPlaneClearance?.maximumSurfaceRetreat as number;
      const surfaceLift = state.weaponPresentation.surfaceLift as number;
      const positionReady = Array.isArray(position)
        && position.length === fixture.settledPosition.length
        && position.every(Number.isFinite);
      const positionAxisError = positionReady
        ? vectorDelta(position, fixture.settledPosition)
        : Number.POSITIVE_INFINITY;
      const yawError = Number.isFinite(yaw) ? angularDelta(yaw, fixture.yaw) : Number.POSITIVE_INFINITY;
      const pitchError = Number.isFinite(pitch) ? Math.abs(pitch - fixture.pitch) : Number.POSITIVE_INFINITY;
      const authorityReady = state.matchPhase === 'active'
        && state.arenaSelection.id === fixture.map
        && state.player.stance === fixture.stance
        && Number.isSafeInteger(frame)
        && positionAxisError <= fixture.maximumPositionAxisError
        && yawError <= fixture.maximumAngularError
        && pitchError <= fixture.maximumAngularError
        && Number.isFinite(surfaceRetreat)
        && Number.isFinite(maximumSurfaceRetreat)
        && surfaceRetreat >= maximumSurfaceRetreat
        && Number.isFinite(surfaceLift)
        && surfaceLift >= fixture.minimumSurfaceLift;
      const sample = authorityReady ? {
        frame,
        position: [...position],
        yaw,
        pitch,
        surfaceRetreat,
        maximumSurfaceRetreat,
        surfaceLift,
      } : null;

      if (!sample) {
        lastReason = `authority-not-ready:${state.matchPhase}:${state.arenaSelection.id}:${state.player.stance}:${positionAxisError}:${yawError}:${pitchError}:${surfaceRetreat}:${maximumSurfaceRetreat}:${surfaceLift}`;
        previous = null;
        resetStableRun();
      } else if (previous && frame === previous.frame + 1) {
        const positionDelta = vectorDelta(sample.position, previous.position);
        const yawDelta = angularDelta(sample.yaw, previous.yaw);
        const pitchDelta = Math.abs(sample.pitch - previous.pitch);
        const surfaceRetreatDelta = Math.abs(sample.surfaceRetreat - previous.surfaceRetreat);
        const surfaceLiftDelta = Math.abs(sample.surfaceLift - previous.surfaceLift);
        if (positionDelta <= limits.maximumPositionDelta
          && yawDelta <= limits.maximumYawDelta
          && pitchDelta <= limits.maximumPitchDelta
          && surfaceRetreatDelta <= limits.maximumSurfaceRetreatDelta
          && surfaceLiftDelta <= limits.maximumSurfaceLiftDelta) {
          if (stableTransitions === 0) {
            stableStartedAt = performance.now();
            stableStartedFrame = previous.frame;
          }
          stableTransitions += 1;
          maximumPositionDelta = Math.max(maximumPositionDelta, positionDelta);
          maximumYawDelta = Math.max(maximumYawDelta, yawDelta);
          maximumPitchDelta = Math.max(maximumPitchDelta, pitchDelta);
          maximumSurfaceRetreatDelta = Math.max(maximumSurfaceRetreatDelta, surfaceRetreatDelta);
          maximumSurfaceLiftDelta = Math.max(maximumSurfaceLiftDelta, surfaceLiftDelta);
          const stableElapsedMs = performance.now() - stableStartedAt;
          if (stableTransitions >= limits.requiredStableTransitions
            && stableElapsedMs >= limits.minimumStableElapsedMs) {
            resolvePromise({
              contract: limits.contract,
              fixtureContract: fixture.contract,
              label: evidenceLabel,
              requiredStableTransitions: limits.requiredStableTransitions,
              stableTransitions,
              stableSampleCount: stableTransitions + 1,
              startedPresentedFrame: stableStartedFrame,
              endedPresentedFrame: frame,
              stableElapsedMs,
              totalElapsedMs: performance.now() - startedAt,
              maximumPositionDelta,
              maximumYawDelta,
              maximumPitchDelta,
              maximumSurfaceRetreatDelta,
              maximumSurfaceLiftDelta,
              thresholds: {
                position: limits.maximumPositionDelta,
                yaw: limits.maximumYawDelta,
                pitch: limits.maximumPitchDelta,
                surfaceRetreat: limits.maximumSurfaceRetreatDelta,
                surfaceLift: limits.maximumSurfaceLiftDelta,
              },
              requirements: {
                matchPhase: 'active',
                map: fixture.map,
                stance: fixture.stance,
                settledPosition: fixture.settledPosition,
                maximumPositionAxisError: fixture.maximumPositionAxisError,
                yaw: fixture.yaw,
                pitch: fixture.pitch,
                maximumAngularError: fixture.maximumAngularError,
                saturatedSurfaceRetreat: true,
                minimumSurfaceLift: fixture.minimumSurfaceLift,
              },
              observed: {
                matchPhase: state.matchPhase,
                map: state.arenaSelection.id,
                stance: state.player.stance,
                presentedGameplayFrame: frame,
                position: sample.position,
                yaw: sample.yaw,
                pitch: sample.pitch,
                surfaceRetreat: sample.surfaceRetreat,
                maximumSurfaceRetreat: sample.maximumSurfaceRetreat,
                surfaceLift: sample.surfaceLift,
              },
            });
            return;
          }
        } else {
          lastReason = `unstable:${positionDelta}:${yawDelta}:${pitchDelta}:${surfaceRetreatDelta}:${surfaceLiftDelta}`;
          resetStableRun();
        }
      } else if (previous && frame !== previous.frame) {
        lastReason = `non-consecutive-presented-frame:${previous.frame}->${frame}`;
        resetStableRun();
      }
      if (sample && (!previous || frame !== previous.frame)) previous = sample;
      if (performance.now() - startedAt >= limits.timeoutMs) {
        rejectPromise(new Error(`Contact fixture convergence timed out for ${evidenceLabel}: ${lastReason}`));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { fixture: CONTACT_FIXTURE, limits: CONTACT_FIXTURE_CONVERGENCE, evidenceLabel: label });
}

async function stageStableContactFixture(page: Page, label: string): Promise<ContactFixtureConvergenceReceipt> {
  await page.evaluate((fixture) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setMovement(false);
    api.setAds(false);
    api.setFireCaptureAgeMs(null);
    api.setReloadCaptureProgress(null);
    api.setMeleeCaptureProgress(null);
    // The shared fixture helper deliberately waits past teleport/setStance's
    // transient 0.61m eye height for the live controller's grounded pose.
    api.teleportPlayer(...fixture.teleportPosition, fixture.yaw, fixture.pitch);
    api.setStance(fixture.stance);
  }, CONTACT_FIXTURE);
  try {
    return await waitForContactFixtureConvergence(page, label);
  } catch (error) {
    const diagnostic = await page.evaluate((fixture) => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      const position = state.player.position as number[];
      return {
        matchPhase: state.matchPhase,
        map: state.arenaSelection.id,
        stance: state.player.stance,
        position,
        positionAxisError: position.map((value, index) => Math.abs(value - fixture.settledPosition[index]!)),
        yaw: state.player.yaw,
        pitch: state.player.pitch,
        surfaceRetreat: state.weaponPresentation.surfaceRetreat,
        maximumSurfaceRetreat: state.weaponPresentation.nearPlaneClearance.maximumSurfaceRetreat,
        surfaceLift: state.weaponPresentation.surfaceLift,
      };
    }, CONTACT_FIXTURE);
    throw new Error(`Stable contact fixture staging failed for ${label}: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
}

async function deploy(page: Page): Promise<ContactFixtureConvergenceReceipt> {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.setViewportSize(viewport);
  await page.goto(`/?release=latest&map=gun-range&renderer=${renderer}${requireWebGpu}&render=${renderProfile}&grass=off&mist=off&rays=off&externalServices=off&seed=pass69-3-authored-near-plane-${renderer}`);
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state.weaponReady === true;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
    api.setMovement(false);
  });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
  return stageStableContactFixture(page, 'initial-deploy');
}

async function rematchGunRangeRoundAndRestoreContact(
  page: Page,
  afterWeapon: WeaponId,
  nextWeapon: WeaponId,
): Promise<Record<string, unknown>> {
  const timerBeforeText = await page.locator('#timer').textContent();
  const timerBeforeSeconds = matchTimerSeconds(timerBeforeText);
  expect(Number.isFinite(timerBeforeSeconds), `${afterWeapon}: readable pre-refresh Gun Range timer`).toBe(true);
  expect(timerBeforeSeconds, `${afterWeapon}: round is still active before refresh`).toBeGreaterThan(0);
  const roundBefore = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
    return {
      matchPhase: state.matchPhase,
      matchEpoch: state.killstreak.matchEpoch,
      playerContinuity: state.player.continuity,
      playerAlive: state.player.alive,
    };
  });
  expect(roundBefore.playerAlive, `${afterWeapon}: player is alive before production rematch`).toBe(true);

  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.setFireCaptureAgeMs(null);
    api.setReloadCaptureProgress(null);
    api.setMeleeCaptureProgress(null);
    api.rematch();
  });
  await page.waitForFunction(({ continuity, previous, timerBefore }) => {
    const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
    const text = document.querySelector<HTMLElement>('#timer')?.textContent ?? '';
    const match = /^(\d{2}):(\d{2})$/u.exec(text);
    const secondsField = match ? Number(match[2]) : Number.NaN;
    const seconds = match && secondsField < 60 ? Number(match[1]) * 60 + secondsField : Number.NaN;
    return state.matchPhase === 'active'
      && state.killstreak.matchEpoch > previous.matchEpoch
      && state.player.continuity > previous.playerContinuity
      && seconds >= continuity.minimumResetTimerSeconds
      && seconds > timerBefore;
  }, { continuity: ROUND_CONTINUITY, previous: roundBefore, timerBefore: timerBeforeSeconds }, { timeout: 30_000 });
  const rematchObservation = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
    return {
      matchPhase: state.matchPhase,
      matchEpoch: state.killstreak.matchEpoch,
      playerContinuity: state.player.continuity,
      playerAlive: state.player.alive,
      timerText: document.querySelector<HTMLElement>('#timer')?.textContent ?? '',
    };
  });
  const timerAfterSeconds = matchTimerSeconds(rematchObservation.timerText);
  expect(rematchObservation.matchPhase, `${afterWeapon}: production rematch returns to an active round`).toBe('active');
  expect(rematchObservation.playerAlive, `${afterWeapon}: player is alive after production rematch`).toBe(true);
  expect(rematchObservation.matchEpoch, `${afterWeapon}: production rematch advances match authority exactly once`).toBe(
    roundBefore.matchEpoch + 1,
  );
  expect(rematchObservation.playerContinuity, `${afterWeapon}: production rematch advances player life exactly once`).toBe(
    roundBefore.playerContinuity + 1,
  );
  expect(timerAfterSeconds, `${afterWeapon}: production rematch restores the two-minute clock`).toBeGreaterThanOrEqual(
    ROUND_CONTINUITY.minimumResetTimerSeconds,
  );
  expect(timerAfterSeconds, `${afterWeapon}: production rematch advances the visible deadline`).toBeGreaterThan(timerBeforeSeconds);

  const fixtureConvergence = await stageStableContactFixture(page, `${afterWeapon}->${nextWeapon}`);
  const returnedState = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot());
  return {
    contract: ROUND_CONTINUITY.contract,
    afterWeapon,
    nextWeapon,
    timerBefore: { text: timerBeforeText, seconds: timerBeforeSeconds },
    rematch: {
      before: roundBefore,
      after: {
        matchPhase: rematchObservation.matchPhase,
        matchEpoch: rematchObservation.matchEpoch,
        playerContinuity: rematchObservation.playerContinuity,
        playerAlive: rematchObservation.playerAlive,
      },
    },
    timerAfter: { text: rematchObservation.timerText, seconds: timerAfterSeconds },
    minimumResetTimerSeconds: ROUND_CONTINUITY.minimumResetTimerSeconds,
    returnedFixture: {
      ...assertFixturePose(returnedState, `${afterWeapon}: restored contact for ${nextWeapon}`),
      convergence: fixtureConvergence,
    },
  };
}

function assertIdentity(state: any, weapon: WeaponId, label: string): Record<string, unknown> {
  const presentation = state.weaponPresentation;
  const expectedDesignId = designIds.get(weapon);
  expect(expectedDesignId, `${label}: checked-in exact design identity`).toBeTruthy();
  expect(state.player.weapon, `${label}: player weapon identity`).toBe(weapon);
  expect(presentation.weapon, `${label}: presentation weapon identity`).toBe(weapon);
  expect(presentation.modelKind, `${label}: real authored model kind`).toBe('project-original-blender');
  expect(presentation.firstPersonSource, `${label}: real authored first-person source`).toBe(expectedFirstPersonSource(weapon));
  expect(presentation.weaponModelId, `${label}: exact authored design id`).toBe(expectedDesignId);
  expect(presentation.weaponFinishId, `${label}: exact authored finish id`).toBe(`${weapon}-project-original-pbr-v1`);
  expect(presentation.detailsReady, `${label}: authored sockets/details ready`).toBe(true);
  expect(presentation.importedModel, `${label}: exact live GLB telemetry`).toMatchObject({
    source: expectedAssetSource(weapon),
    weapon,
    socketContractReady: true,
  });
  expect(presentation.importedModel.meshes, `${label}: non-empty authored meshes`).toBeGreaterThan(0);
  expect(presentation.importedModel.triangles, `${label}: non-empty authored topology`).toBeGreaterThan(0);
  expect(presentation.armsSource, `${label}: authored two-chain arms`).toBe('authored-two-chain');
  expect(presentation.authoredFingerBoneCount, `${label}: full authored finger rig`).toBe(30);
  expect(presentation.armMaterials, `${label}: visible authored arms are opaque depth writers`).toMatchObject({
    contract: 'opaque-depth-writing', transparent: 0, nonOpaque: 0, depthWriteDisabled: 0,
  });
  return {
    weapon,
    modelKind: presentation.modelKind,
    firstPersonSource: presentation.firstPersonSource,
    weaponModelId: presentation.weaponModelId,
    weaponFinishId: presentation.weaponFinishId,
    importedModel: presentation.importedModel,
    armsSource: presentation.armsSource,
    authoredFingerBoneCount: presentation.authoredFingerBoneCount,
  };
}

function assertFixturePose(state: any, label: string): Record<string, unknown> {
  const position = state.player.position as number[];
  expect(state.arenaSelection.id, `${label}: exact fixture map`).toBe(CONTACT_FIXTURE.map);
  expect(state.player.stance, `${label}: exact fixture stance`).toBe(CONTACT_FIXTURE.stance);
  expect(position, `${label}: finite fixture position`).toHaveLength(3);
  expect(position.every(Number.isFinite), `${label}: finite fixture position`).toBe(true);
  const positionAxisError = position.map((value, index) => (
    Math.abs(value - CONTACT_FIXTURE.settledPosition[index]!)
  ));
  const yawError = Math.abs(Math.atan2(
    Math.sin(state.player.yaw - CONTACT_FIXTURE.yaw),
    Math.cos(state.player.yaw - CONTACT_FIXTURE.yaw),
  ));
  const pitchError = Math.abs(state.player.pitch - CONTACT_FIXTURE.pitch);
  expect(Math.max(...positionAxisError), `${label}: bounded fixture position`).toBeLessThanOrEqual(
    CONTACT_FIXTURE.maximumPositionAxisError,
  );
  expect(yawError, `${label}: bounded fixture yaw`).toBeLessThanOrEqual(CONTACT_FIXTURE.maximumAngularError);
  expect(pitchError, `${label}: bounded fixture pitch`).toBeLessThanOrEqual(CONTACT_FIXTURE.maximumAngularError);
  return {
    contract: CONTACT_FIXTURE.contract,
    map: state.arenaSelection.id,
    stance: state.player.stance,
    position,
    yaw: state.player.yaw,
    pitch: state.player.pitch,
    positionAxisError,
    maximumPositionAxisError: Math.max(...positionAxisError),
    yawError,
    pitchError,
  };
}

function assertContactContract(state: any, weapon: WeaponId, label: string): Record<string, unknown> {
  const presentation = state.weaponPresentation;
  const clearance = presentation.nearPlaneClearance;
  const fixturePose = assertFixturePose(state, label);
  expect(presentation.surfaceRetreat, `${label}: real maximum wall contact`).toBeGreaterThanOrEqual(0.28);
  expect(presentation.surfaceLift, `${label}: live prone floor lift`).toBeGreaterThanOrEqual(0.13);
  expect(clearance, `${label}: exact cached retreat contract`).toMatchObject({
    contract: 'authored-glb-contact-retreat-2026-08-09-v1',
    cameraNear: 0.08,
    requiredMargin: 0.02,
    baseRetreat: 0.06,
    maximumSurfaceRetreat: 0.28,
    cachedRetreat: EXPECTED_CONTACT_RETREAT[weapon],
    blendedRetreat: EXPECTED_CONTACT_RETREAT[weapon],
  });
  return {
    contract: clearance.contract,
    surfaceRetreat: presentation.surfaceRetreat,
    surfaceLift: presentation.surfaceLift,
    cameraNear: clearance.cameraNear,
    requiredMargin: clearance.requiredMargin,
    baseRetreat: clearance.baseRetreat,
    maximumSurfaceRetreat: clearance.maximumSurfaceRetreat,
    cachedRetreat: clearance.cachedRetreat,
    blendedRetreat: clearance.blendedRetreat,
    fixturePose,
  };
}

function assertStructuralSuppression(
  state: any,
  label: string,
  active: boolean,
): Record<string, unknown> {
  const suppression = state.weaponPresentation.fullscreenSuppression;
  expect(suppression, `${label}: structural fullscreen suppression telemetry`).toMatchObject({
    contract: 'retained-structural-lights-fullscreen-suppression-v1',
    active,
    suppressedScale: 0.0001,
    rootVisible: true,
    structuralLightCount: 2,
  });
  expect(suppression.rootScale, `${label}: root scale is finite`).toEqual(expect.any(Number));
  if (active) expect(suppression.rootScale, `${label}: exact retained suppression scale`).toBe(0.0001);
  else expect(suppression.rootScale, `${label}: visible hierarchy is not tiny-scale suppressed`).toBeGreaterThan(0.0001);
  expect(suppression.structuralLights, `${label}: both structural PointLights remain in the hierarchy`).toHaveLength(2);
  expect(
    suppression.structuralLights.map((light: { name: string }) => light.name).sort(),
    `${label}: exact structural PointLight identities`,
  ).toEqual(['first-person-muzzle-light', 'first-person-viewmodel-fill']);
  for (const light of suppression.structuralLights) {
    const expectedIntensityContract = light.name === 'first-person-viewmodel-fill'
      ? 'zero-when-suppressed'
      : 'transient-fire-decay';
    expect(light, `${label}: ${light.name} remains attached and visible`).toMatchObject({
      attachedToRoot: true,
      visible: true,
      intensityContract: expectedIntensityContract,
    });
    expect(Number.isFinite(light.intensity) && light.intensity >= 0, `${label}: ${light.name} finite intensity`).toBe(true);
    if (active) {
      expect(light.intensity, `${label}: suppressed structural light remains resident without lighting the optic`).toBe(0);
    }
  }
  return suppression;
}

function assertVisibleClearance(
  state: any,
  weapon: WeaponId,
  pose: PoseKind,
  sample: number | null,
  convergence: Record<string, unknown>,
): Record<string, unknown> {
  const presentation = state.weaponPresentation;
  const label = `${weapon}/${pose}${sample === null ? '' : `/${sample}`}`;
  const contract = assertContactContract(state, weapon, label);
  const fullscreenSuppression = assertStructuralSuppression(state, label, false);
  expect(state.sniperScope.viewmodelVisible, `${label}: effective viewmodel hierarchy is visible`).toBe(true);
  expect(presentation.armsVisible, `${label}: authored arms are visible`).toBe(true);
  expect(presentation.modelVisibleMeshCount, `${label}: authored weapon has visible meshes`).toBeGreaterThan(0);
  const requiredDepth = contract.cameraNear as number + (contract.requiredMargin as number);
  for (const [kind, framing] of [
    ['weapon', presentation.weaponFraming],
    ['authored-arms', presentation.armFraming],
  ] as const) {
    expect(framing, `${label}: ${kind} framing exists`).not.toBeNull();
    expect(framing, `${label}: ${kind} finite visible framing`).toMatchObject({
      finite: true,
      nearPlaneClear: true,
      intersectsViewport: true,
    });
    expect(framing.nearestDepth, `${label}: ${kind} clears camera.near + 0.02`).toBeGreaterThanOrEqual(requiredDepth);
  }
  const nearestDepth = Math.min(presentation.weaponFraming.nearestDepth, presentation.armFraming.nearestDepth);
  return {
    pose,
    sample,
    effectiveViewmodelVisible: true,
    convergence,
    action: presentation.actionContract,
    contact: contract,
    fullscreenSuppression,
    weaponFraming: presentation.weaponFraming,
    armFraming: presentation.armFraming,
    nearestDepth,
    requiredDepth,
    clearanceMargin: nearestDepth - requiredDepth,
    fireCycle: pose === 'fire-kick' ? presentation.fireCycle : undefined,
  };
}

function assertFullscreenOpticSuppression(
  state: any,
  weapon: WeaponId,
  convergence: Record<string, unknown>,
): Record<string, unknown> {
  const label = `${weapon}/ads/fullscreen-optic`;
  const contact = assertContactContract(state, weapon, label);
  const fullscreenSuppression = assertStructuralSuppression(state, label, true);
  expect(FULLSCREEN_OPTIC_WEAPONS.has(weapon), `${label}: explicit applicable set`).toBe(true);
  expect(state.sniperScope.viewmodelVisible, `${label}: hierarchy-suppressed viewmodel is not misclassified as visible`).toBe(false);
  expect(state.weaponPresentation.actionContract.state, `${label}: settled ADS action`).toBe('ads');
  if (weapon === 'sniper') {
    expect(state.sniperScope.active, `${label}: sniper fullscreen optic owns the frame`).toBe(true);
  } else {
    expect(state.dmrThermal.active, `${label}: M14 fullscreen thermal optic owns the frame`).toBe(true);
  }
  return {
    pose: 'ads',
    sample: null,
    effectiveViewmodelVisible: false,
    convergence,
    suppressionReason: weapon === 'sniper' ? 'sniper-fullscreen-optic' : 'm14-fullscreen-thermal-optic',
    action: state.weaponPresentation.actionContract,
    contact,
    fullscreenSuppression,
  };
}

async function equipAtContact(page: Page, weapon: WeaponId): Promise<Readonly<{
  state: any;
  convergence: Record<string, unknown>;
}>> {
  await page.evaluate((weaponId) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.setFireCaptureAgeMs(null);
    api.setReloadCaptureProgress(null);
    api.setMeleeCaptureProgress(null);
    api.equipWeapon(weaponId);
  }, weapon);
  await page.waitForFunction((weaponId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
    return state.player.weapon === weaponId
      && state.weaponPresentation.weapon === weaponId
      && state.weaponPresentation.importedModel?.weapon === weaponId
      && state.weaponPresentation.detailsReady === true
      && state.weaponPresentation.adsProgress < 0.02
      && state.sniperScope.viewmodelVisible === true;
  }, weapon, { timeout: 30_000 });
  const convergence = await waitForPoseConvergence(page, {
    weapon, action: 'hip', effectiveViewmodelVisible: true,
  });
  return {
    state: await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot()),
    convergence,
  };
}

test('proves canonical authored first-person weapons satisfy the scoped maximum-contact hip, settled-ADS, fire-kick, and reload presentation contracts', async ({ browser, page }, testInfo) => {
  test.setTimeout(renderer === 'webgpu' ? 720_000 : 540_000);
  rmSync(artifactRoot, { recursive: true, force: true });
  rmSync(receiptPath, { force: true });
  mkdirSync(artifactRoot, { recursive: true });
  expect(Object.keys(EXPECTED_CONTACT_RETREAT).sort()).toEqual([...WEAPON_IDS].sort());
  expect(designIds.size, 'one exact authored design identity per canonical weapon').toBe(WEAPON_IDS.length);
  if (officialEvidence) {
    expect(sourceSha, 'official authored near-plane evidence starts at requested HEAD').toBe(expectedSourceSha);
    expect(sourceStatus, 'official authored near-plane evidence starts from a clean worktree').toBe('');
  }

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  const initialContactConvergence = await deploy(page);

  const servedCandidate = await page.evaluate(async () => {
    const response = await fetch('/channels/the-big-one/channel-provenance.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Authored near-plane candidate provenance returned HTTP ${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  });
  expect(servedCandidate, 'near-plane page is bound to the staged candidate').toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: 'PASS 69',
    path: 'channels/the-big-one',
    sourceSha,
  });
  expect(servedCandidate.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(servedCandidate.exactRootFileCount).toEqual(expect.any(Number));
  expect(servedCandidate.exactRootFileCount as number).toBeGreaterThanOrEqual(2);

  const runtimeBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().render.runtime as any);
  expectRendererProvenance(runtimeBefore, 'initial authored near-plane runtime');
  const contactFixtureObservation = await page.evaluate((fixture) => {
    const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
    const playerPosition = state.player.position as number[];
    const positionAxisError = playerPosition.map((value, index) => (
      Math.abs(value - fixture.settledPosition[index]!)
    ));
    const yawError = Math.abs(Math.atan2(
      Math.sin(state.player.yaw - fixture.yaw),
      Math.cos(state.player.yaw - fixture.yaw),
    ));
    const pitchError = Math.abs(state.player.pitch - fixture.pitch);
    const surfaceRetreat = state.weaponPresentation.surfaceRetreat as number;
    const maximumSurfaceRetreat = state.weaponPresentation.nearPlaneClearance.maximumSurfaceRetreat as number;
    return {
      contract: fixture.contract,
      map: state.arenaSelection.id,
      stance: state.player.stance,
      teleportCommand: {
        position: fixture.teleportPosition,
        yaw: fixture.yaw,
        pitch: fixture.pitch,
      },
      expectedSettledPose: {
        position: fixture.settledPosition,
        yaw: fixture.yaw,
        pitch: fixture.pitch,
      },
      tolerances: {
        maximumPositionAxisError: fixture.maximumPositionAxisError,
        maximumAngularError: fixture.maximumAngularError,
      },
      observedSettledPose: {
        position: playerPosition,
        yaw: state.player.yaw,
        pitch: state.player.pitch,
      },
      errors: {
        positionAxis: positionAxisError,
        maximumPositionAxis: Math.max(...positionAxisError),
        yaw: yawError,
        pitch: pitchError,
      },
      surfaceRetreat,
      surfaceLift: state.weaponPresentation.surfaceLift,
      maximumSurfaceRetreat,
      contactAuthority: {
        contract: 'saturated-viewmodel-surface-retreat-v1',
        observedSurfaceRetreat: surfaceRetreat,
        maximumSurfaceRetreat,
        saturated: surfaceRetreat >= maximumSurfaceRetreat,
      },
    };
  }, CONTACT_FIXTURE);
  const contactFixture = {
    ...contactFixtureObservation,
    convergence: initialContactConvergence,
  };
  expect(contactFixture).toMatchObject({
    contract: CONTACT_FIXTURE.contract,
    map: CONTACT_FIXTURE.map,
    stance: CONTACT_FIXTURE.stance,
    teleportCommand: {
      position: CONTACT_FIXTURE.teleportPosition,
      yaw: CONTACT_FIXTURE.yaw,
      pitch: CONTACT_FIXTURE.pitch,
    },
    expectedSettledPose: {
      position: CONTACT_FIXTURE.settledPosition,
      yaw: CONTACT_FIXTURE.yaw,
      pitch: CONTACT_FIXTURE.pitch,
    },
    tolerances: {
      maximumPositionAxisError: CONTACT_FIXTURE.maximumPositionAxisError,
      maximumAngularError: CONTACT_FIXTURE.maximumAngularError,
    },
    maximumSurfaceRetreat: 0.28,
    contactAuthority: {
      contract: 'saturated-viewmodel-surface-retreat-v1',
      maximumSurfaceRetreat: 0.28,
      saturated: true,
    },
    convergence: {
      contract: CONTACT_FIXTURE_CONVERGENCE.contract,
      fixtureContract: CONTACT_FIXTURE.contract,
      label: 'initial-deploy',
      requiredStableTransitions: CONTACT_FIXTURE_CONVERGENCE.requiredStableTransitions,
      stableSampleCount: expect.any(Number),
      thresholds: {
        position: CONTACT_FIXTURE_CONVERGENCE.maximumPositionDelta,
        yaw: CONTACT_FIXTURE_CONVERGENCE.maximumYawDelta,
        pitch: CONTACT_FIXTURE_CONVERGENCE.maximumPitchDelta,
        surfaceRetreat: CONTACT_FIXTURE_CONVERGENCE.maximumSurfaceRetreatDelta,
        surfaceLift: CONTACT_FIXTURE_CONVERGENCE.maximumSurfaceLiftDelta,
      },
      requirements: {
        matchPhase: 'active',
        map: CONTACT_FIXTURE.map,
        stance: CONTACT_FIXTURE.stance,
        settledPosition: CONTACT_FIXTURE.settledPosition,
        maximumPositionAxisError: CONTACT_FIXTURE.maximumPositionAxisError,
        yaw: CONTACT_FIXTURE.yaw,
        pitch: CONTACT_FIXTURE.pitch,
        maximumAngularError: CONTACT_FIXTURE.maximumAngularError,
        saturatedSurfaceRetreat: true,
        minimumSurfaceLift: CONTACT_FIXTURE.minimumSurfaceLift,
      },
      observed: {
        matchPhase: 'active',
        map: CONTACT_FIXTURE.map,
        stance: CONTACT_FIXTURE.stance,
      },
    },
  });
  expect(contactFixture.observedSettledPose.position).toHaveLength(3);
  expect(contactFixture.observedSettledPose.position.every(Number.isFinite), 'fixture: finite settled player position').toBe(true);
  CONTACT_FIXTURE.settledPosition.forEach((expected, index) => {
    expect(
      Math.abs(contactFixture.observedSettledPose.position[index]! - expected),
      `fixture: settled player position axis ${index}`,
    ).toBeLessThanOrEqual(CONTACT_FIXTURE.maximumPositionAxisError);
  });
  const observedYawError = Math.abs(Math.atan2(
    Math.sin(contactFixture.observedSettledPose.yaw - CONTACT_FIXTURE.yaw),
    Math.cos(contactFixture.observedSettledPose.yaw - CONTACT_FIXTURE.yaw),
  ));
  const observedPitchError = Math.abs(contactFixture.observedSettledPose.pitch - CONTACT_FIXTURE.pitch);
  expect(observedYawError, 'fixture: exact west-wall yaw').toBeLessThanOrEqual(CONTACT_FIXTURE.maximumAngularError);
  expect(observedPitchError, 'fixture: exact level pitch').toBeLessThanOrEqual(CONTACT_FIXTURE.maximumAngularError);
  expect(contactFixture.errors.maximumPositionAxis).toBeCloseTo(Math.max(...contactFixture.errors.positionAxis), 12);
  expect(contactFixture.errors.yaw).toBeCloseTo(observedYawError, 12);
  expect(contactFixture.errors.pitch).toBeCloseTo(observedPitchError, 12);
  expect(contactFixture.surfaceRetreat).toBeGreaterThanOrEqual(contactFixture.maximumSurfaceRetreat);
  expect(contactFixture.contactAuthority.observedSurfaceRetreat).toBe(contactFixture.surfaceRetreat);
  expect(contactFixture.surfaceLift).toBeGreaterThanOrEqual(0.13);
  expect(contactFixture.convergence.stableTransitions).toBeGreaterThanOrEqual(
    CONTACT_FIXTURE_CONVERGENCE.requiredStableTransitions,
  );
  expect(contactFixture.convergence.stableSampleCount).toBe(contactFixture.convergence.stableTransitions + 1);
  expect(
    contactFixture.convergence.endedPresentedFrame - contactFixture.convergence.startedPresentedFrame,
  ).toBe(contactFixture.convergence.stableTransitions);
  expect(contactFixture.convergence.stableElapsedMs).toBeGreaterThanOrEqual(
    CONTACT_FIXTURE_CONVERGENCE.minimumStableElapsedMs,
  );

  const weaponEvidence: Array<Record<string, unknown>> = [];
  const roundContinuity: Array<Record<string, unknown>> = [];
  for (const [index, weapon] of WEAPON_IDS.entries()) {
    const equipped = await equipAtContact(page, weapon);
    const identityState = equipped.state;
    const identity = assertIdentity(identityState, weapon, `${weapon}/identity`);
    expect(identityState.weaponPresentation.actionContract.state, `${weapon}/hip: action owner`).toBe('hip');
    const hip = assertVisibleClearance(identityState, weapon, 'hip', null, equipped.convergence);

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.setAds(true));
    await page.waitForFunction(({ weaponId, fullscreen }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      if (state.weaponPresentation.weapon !== weaponId
        || state.weaponPresentation.adsProgress <= 0.98
        || state.weaponPresentation.actionContract.state !== 'ads') return false;
      if (!fullscreen) return state.sniperScope.viewmodelVisible === true;
      return weaponId === 'sniper'
        ? state.sniperScope.active === true && state.sniperScope.viewmodelVisible === false
        : state.dmrThermal.active === true && state.sniperScope.viewmodelVisible === false;
    }, { weaponId: weapon, fullscreen: FULLSCREEN_OPTIC_WEAPONS.has(weapon) }, { timeout: 12_000 });
    const adsConvergence = await waitForPoseConvergence(page, {
      weapon,
      action: 'ads',
      effectiveViewmodelVisible: !FULLSCREEN_OPTIC_WEAPONS.has(weapon),
    });
    const adsState = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot());
    assertIdentity(adsState, weapon, `${weapon}/ads/identity`);
    const ads = FULLSCREEN_OPTIC_WEAPONS.has(weapon)
      ? assertFullscreenOpticSuppression(adsState, weapon, adsConvergence)
      : assertVisibleClearance(adsState, weapon, 'ads', null, adsConvergence);

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.setAds(false));
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return state.weaponPresentation.adsProgress < 0.02
        && state.sniperScope.active === false
        && state.dmrThermal.active === false
        && state.sniperScope.viewmodelVisible === true;
    }, undefined, { timeout: 12_000 });

    const fireKickSamples: Array<Record<string, unknown>> = [];
    let kickScreenshot: Buffer | null = null;
    let kickScreenshotPath = '';
    for (const ageMs of FIRE_KICK_AGES_MS) {
      await page.evaluate((age) => window.__ATOMIC_ACRES_DEBUG__!.setFireCaptureAgeMs(age), ageMs);
      const fireConvergence = await waitForPoseConvergence(page, {
        weapon, action: 'hip', effectiveViewmodelVisible: true,
      });
      const fireState = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot());
      expect(fireState.weaponPresentation.actionContract.state, `${weapon}/fire-kick/${ageMs}: action owner`).toBe('hip');
      const expectedCycle = expectedFireCycle(weapon, ageMs);
      expect(fireState.weaponPresentation.fireCycle.flash, `${weapon}/${ageMs}: applied fire flash age`).toBeCloseTo(expectedCycle.flash, 10);
      expect(fireState.weaponPresentation.fireCycle.kick, `${weapon}/${ageMs}: applied fire kick age`).toBeCloseTo(expectedCycle.kick, 10);
      expect(fireState.weaponPresentation.fireCycle.boltTravel, `${weapon}/${ageMs}: applied authored action age`).toBeCloseTo(expectedCycle.boltTravel, 10);
      expect(fireState.weaponPresentation.fireCycle.casingReady, `${weapon}/${ageMs}: applied casing age`).toBe(expectedCycle.casingReady);
      const sample = {
        ...assertVisibleClearance(fireState, weapon, 'fire-kick', ageMs, fireConvergence),
        expectedFireCycle: expectedCycle,
      };
      fireKickSamples.push(sample);
      if (ageMs === 0) {
        kickScreenshotPath = resolve(artifactRoot, `${String(index + 1).padStart(2, '0')}-${weapon}-maximum-contact-fire-kick.png`);
        kickScreenshot = await page.screenshot({
          path: kickScreenshotPath,
          animations: 'disabled',
          clip: { x: 400, y: 180, width: 800, height: 620 },
          timeout: 60_000,
        });
        await testInfo.attach(`${weapon}-maximum-contact-fire-kick`, { body: kickScreenshot, contentType: 'image/png' });
      }
    }
    expect(kickScreenshot, `${weapon}: fire-kick evidence screenshot`).not.toBeNull();
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.setFireCaptureAgeMs(null));

    const reloadSamples: Array<Record<string, unknown>> = [];
    for (const progress of RELOAD_PROGRESS_SAMPLES) {
      await page.evaluate((value) => window.__ATOMIC_ACRES_DEBUG__!.setReloadCaptureProgress(value), progress);
      await page.waitForFunction((value) => {
        const contract = window.__ATOMIC_ACRES_DEBUG__!.snapshot().weaponPresentation.actionContract;
        return contract.state === 'reload'
          && Math.abs(contract.reloadProgress - value) <= 0.015;
      }, progress, { timeout: 8_000 });
      const reloadConvergence = await waitForPoseConvergence(page, {
        weapon,
        action: 'reload',
        effectiveViewmodelVisible: true,
        reloadProgress: progress,
      });
      const reloadState = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot());
      reloadSamples.push(assertVisibleClearance(reloadState, weapon, 'reload', progress, reloadConvergence));
    }
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.setReloadCaptureProgress(null));

    const visibleSamples = [hip, ...(!FULLSCREEN_OPTIC_WEAPONS.has(weapon) ? [ads] : []), ...fireKickSamples, ...reloadSamples];
    const minimumClearanceMargin = Math.min(...visibleSamples.map((sample) => Number(sample.clearanceMargin)));
    expect(minimumClearanceMargin, `${weapon}: complete visible-pose clearance margin`).toBeGreaterThanOrEqual(0);
    const perWeaponEvidence = {
      weapon,
      identity,
      hip,
      ads,
      fireKick: { agesMs: FIRE_KICK_AGES_MS, samples: fireKickSamples },
      reload: { progressSamples: RELOAD_PROGRESS_SAMPLES, samples: reloadSamples },
      minimumClearanceMargin,
      screenshot: {
        path: repositoryRelative(kickScreenshotPath),
        sha256: sha256(kickScreenshot!),
      },
    };
    const artifactPath = resolve(artifactRoot, `${String(index + 1).padStart(2, '0')}-${weapon}.json`);
    const artifactBytes = Buffer.from(`${JSON.stringify(perWeaponEvidence, null, 2)}\n`, 'utf8');
    writeFileSync(artifactPath, artifactBytes);
    weaponEvidence.push({
      ...perWeaponEvidence,
      artifact: { path: repositoryRelative(artifactPath), sha256: sha256(artifactBytes) },
    });
    const nextWeapon = WEAPON_IDS[index + 1];
    if (nextWeapon) {
      roundContinuity.push(await rematchGunRangeRoundAndRestoreContact(page, weapon, nextWeapon));
    }
  }

  const runtimeAfter = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().render.runtime as any);
  expectRendererProvenance(runtimeAfter, 'final authored near-plane runtime');
  const userAgent = await page.evaluate(() => navigator.userAgent);
  if (officialEvidence) expect(userAgent, 'official authored near-plane evidence uses installed Edge').toMatch(/Edg\//u);
  expect(browserErrors).toEqual([]);

  const endingSourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
  }).trim();
  const endingSourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
  }).trim();
  if (officialEvidence) {
    expect(endingSourceSha, 'official authored near-plane evidence ends at the same exact HEAD').toBe(sourceSha);
    expect(endingSourceStatus, 'official authored near-plane evidence ends with a clean worktree').toBe('');
  }

  writeFileSync(receiptPath, `${JSON.stringify({
    schemaVersion: 3,
    status: 'PASS',
    contract: 'atomic-acres/pass69-3-authored-near-plane-catalog@3',
    evidenceScope: 'maximum-contact-hip-settled-ads-fire-kick-reload-near-plane-clearance',
    target: officialEvidence ? expectedTarget : `development-${renderer}`,
    sourceSha,
    endingSourceSha,
    cleanSource: sourceStatus === '' && endingSourceStatus === '',
    renderer,
    renderProfile,
    viewport: [viewport.width, viewport.height],
    servedCandidate,
    browser: {
      project: testInfo.project.name,
      channel: officialEvidence ? 'msedge' : 'configured-chromium',
      version: browser.version(),
      userAgent,
    },
    runtimeBefore,
    runtimeAfter,
    contactFixture,
    roundContinuity: {
      contract: ROUND_CONTINUITY.contract,
      refreshCount: roundContinuity.length,
      entries: roundContinuity,
    },
    catalog: {
      weapons: WEAPON_IDS,
      weaponCount: WEAPON_IDS.length,
      contactRetreatTable: EXPECTED_CONTACT_RETREAT,
      fireKickAgesMs: FIRE_KICK_AGES_MS,
      reloadProgressSamples: RELOAD_PROGRESS_SAMPLES,
      fullscreenOpticWeapons: [...FULLSCREEN_OPTIC_WEAPONS],
      requiredVisibleDepth: 'cameraNear + requiredMargin',
    },
    weapons: weaponEvidence,
    browserErrors,
  }, null, 2)}\n`, 'utf8');
});
