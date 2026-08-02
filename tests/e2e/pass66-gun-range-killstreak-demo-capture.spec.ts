import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { chromium, expect, test, type Browser, type BrowserContext, type Page, type Video } from '@playwright/test';
import { GUN_RANGE_TEST_BAY_CONTRACT } from '../../src/gun-range-test-bay';
import {
  KILLSTREAK_DEMO_CAPTURE_IDS,
  KILLSTREAK_DEMO_CAPTURE_ROUTE,
  KILLSTREAK_DEMO_CAPTURE_VIEWPORT,
  KILLSTREAK_DEMO_CLIP_DURATION_MS,
  KILLSTREAK_DEMO_EXPECTED_PROOF,
  KILLSTREAK_DEMO_VISUAL_REQUIREMENTS,
  projectKillstreakDemoWorldPoint,
  resolveKillstreakDemoCameraPose,
  summarizeKillstreakDemoRuntimeCadence,
  validateKillstreakDemoCaptureReceipt,
  type KillstreakDemoCameraPose,
  type KillstreakDemoCaptureEntry,
  type KillstreakDemoCaptureReceipt,
  type KillstreakDemoProjectedSubject,
  type KillstreakDemoProofKind,
  type KillstreakDemoRuntimeCadence,
  type KillstreakDemoRuntimeCadenceSample,
  type KillstreakDemoWorldPoint,
} from '../../src/killstreak-demo-capture-contract';
import type { Pass65KillstreakId } from '../../src/killstreak-catalog';
import {
  collectKillstreakDemoSourceClosure,
  killstreakDemoSourceClosureSha256,
} from '../../scripts/qa/pass66-killstreak-demo-source-closure';
import { probeH264Mp4 } from '../../scripts/qa/pass66-killstreak-demo-video-probe';

const repositoryRoot = process.cwd();
const artifactRoot = resolve(repositoryRoot, 'artifacts/pass66/killstreak-demo-capture');
const stagingRoot = resolve(artifactRoot, 'staged');
const rawRoot = resolve(artifactRoot, 'raw-playwright');
const receiptPath = resolve(artifactRoot, 'capture-receipt.json');
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.QA_PREVIEW_PORT ?? '4173'}`;
const expectedSourceSha = process.env.PASS66_KILLSTREAK_CAPTURE_SOURCE_SHA ?? '';
const captureExplicitlyEnabled = /^[a-f0-9]{40}$/u.test(expectedSourceSha)
  && process.env.QA_REQUIRE_OWNED_FRESH_PREVIEW === '1'
  && process.env.QA_EXTERNAL_PREVIEW === '0';
test.skip(
  !captureExplicitlyEnabled,
  'Run via npm run author:pass66:killstreak-demo-videos from a clean source-freeze commit',
);
const chromeCandidates = [
  process.env.PASS66_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter((candidate): candidate is string => Boolean(candidate));

type CaptureBaseline = Readonly<{
  revision: number;
  activationIds: readonly string[];
  triPassLaunches: number;
  triPassImpacts: number;
  hunterSwarmLaunches: number;
  hunterSwarmImpacts: number;
  yardhawkExplosions: number;
  nukeActivations: number;
  nukeDetonations: number;
}>;

type RuntimeProof = Readonly<{
  revision: number;
  kind: KillstreakDemoProofKind;
  count: number;
  activationIds: readonly string[];
}>;

type RuntimeHealth = KillstreakDemoCaptureEntry['runtimeHealth'];
type VisualSubject = Readonly<{ id: string; position: KillstreakDemoWorldPoint }>;
type HudRegion = NonNullable<KillstreakDemoCaptureEntry['visualProof']['hudRegion']>;
type CaptureVisualSetup = Readonly<{
  pose: KillstreakDemoCameraPose;
  subjects: readonly VisualSubject[];
  projectedSubjects: readonly KillstreakDemoProjectedSubject[];
  hudRegion: HudRegion | null;
  sampledAtPresentedFrame: number;
}>;

type CaptureTelemetryResult = Readonly<{
  cadence: KillstreakDemoRuntimeCadence;
  milestones: readonly string[];
}>;

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function jpegDimensions(bytes: Buffer): Readonly<{ width: number; height: number }> {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('capture is not a JPEG');
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) throw new Error('capture JPEG segment is invalid');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return Object.freeze({ height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) });
    }
    offset += 2 + segmentLength;
  }
  throw new Error('capture JPEG dimensions are missing');
}

function relativeArtifact(path: string): string {
  return relative(repositoryRoot, path).replaceAll('\\', '/');
}

function installedChromePath(): string {
  const executable = chromeCandidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error('real killstreak video capture requires machine-installed Google Chrome');
  return executable;
}

type ServedCandidateProvenance = Readonly<{
  sourceSha: string;
  treeSha256: string;
  exactRootFileCount: number;
}>;

async function servedCandidateProvenance(): Promise<ServedCandidateProvenance> {
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceSha)) {
    throw new Error('PASS66_KILLSTREAK_CAPTURE_SOURCE_SHA must be the clean source-freeze SHA');
  }
  const provenanceUrl = new URL('/channels/the-big-one/channel-provenance.json', baseURL);
  const response = await fetch(provenanceUrl);
  if (!response.ok) throw new Error(`Candidate provenance request failed: ${response.status} ${provenanceUrl}`);
  const value = await response.json() as Record<string, unknown>;
  if (value.schemaVersion !== 4 || value.channel !== 'the-big-one' || value.releasePass !== 'PASS 66'
    || value.path !== 'channels/the-big-one' || value.sourceSha !== expectedSourceSha
    || typeof value.treeSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.treeSha256)
    || !Number.isSafeInteger(value.exactRootFileCount) || (value.exactRootFileCount as number) <= 0) {
    throw new Error(`Served candidate provenance does not bind the clean source freeze: ${JSON.stringify(value)}`);
  }
  return Object.freeze({
    sourceSha: value.sourceSha as string,
    treeSha256: value.treeSha256,
    exactRootFileCount: value.exactRootFileCount as number,
  });
}

function ffmpegVersion(): string {
  return execFileSync('ffmpeg', ['-version'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/u)[0]?.trim() ?? '';
}

function rawVideoDurationMs(path: string): number {
  const value = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ], { encoding: 'utf8', windowsHide: true }).trim();
  const milliseconds = Math.round(Number(value) * 1_000);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error(`raw recording duration is invalid: ${path}`);
  return milliseconds;
}

function encodeClip(rawPath: string, outputPath: string, trimStartMs: number, durationMs: number): void {
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', rawPath,
    '-ss', (trimStartMs / 1_000).toFixed(3),
    '-t', (durationMs / 1_000).toFixed(3),
    '-an',
    '-vf', 'fps=30,scale=960:540:flags=lanczos,format=yuv420p',
    '-map_metadata', '-1',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '25',
    '-profile:v', 'high',
    '-level:v', '3.1',
    '-g', '60',
    '-keyint_min', '60',
    '-sc_threshold', '0',
    '-threads:v', '1',
    '-flags:v', '+bitexact',
    '-movflags', '+faststart',
    outputPath,
  ], { windowsHide: true, stdio: 'pipe' });
}

async function startRealTestBay(page: Page): Promise<void> {
  await page.goto(KILLSTREAK_DEMO_CAPTURE_ROUTE);
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.bootstrap?.stage === 'ready'
      && !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true);
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(false);
  });
}

async function activationBaseline(page: Page): Promise<CaptureBaseline> {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      revision: snapshot.killstreak.revision,
      activationIds: [...new Set(snapshot.killstreak.entities.map((entity: { activationId: string }) => entity.activationId))],
      triPassLaunches: snapshot.fieldSupport.triPassLaunches,
      triPassImpacts: snapshot.fieldSupport.triPassImpacts,
      hunterSwarmLaunches: snapshot.fieldSupport.hunterSwarmLaunches,
      hunterSwarmImpacts: snapshot.fieldSupport.hunterSwarmImpacts,
      yardhawkExplosions: snapshot.fieldSupport.yardhawkExplosions,
      nukeActivations: snapshot.fieldSupport.nukeActivations,
      nukeDetonations: snapshot.fieldSupport.nukeDetonations,
    };
  });
}

async function completeTargeting(page: Page, id: Pass65KillstreakId): Promise<void> {
  if (id === 'care-package' || id === 'carpet-bomber') {
    await expect.poll(async () => page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.crosshairTarget
    ))).not.toBeNull();
    await page.keyboard.press('f');
    await expect.poll(async () => page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.targetingMode
    ))).toBeNull();
    return;
  }
  if (id !== 'tri-pass') return;
  const overlay = page.locator('#strike-map-overlay');
  await expect(overlay).toBeVisible();
  const map = page.locator('#strike-map');
  await map.click({ position: { x: 135, y: 190 } });
  await map.click({ position: { x: 240, y: 260 } });
  await map.click({ position: { x: 345, y: 325 } });
  await expect(overlay).toBeHidden();
}

async function runtimeProof(page: Page, id: Pass65KillstreakId, baseline: CaptureBaseline): Promise<RuntimeProof> {
  return page.evaluate(({ supportId, before }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const newEntities = snapshot.killstreak.entities.filter((entity: { activationId: string }) => (
      !before.activationIds.includes(entity.activationId)
    ));
    const ids = [...new Set(newEntities.map((entity: { activationId: string }) => entity.activationId))] as string[];
    const actorAdrenaline = Math.max(0, ...snapshot.killstreak.actors.map((actor: { adrenalineRemainingMs: number }) => actor.adrenalineRemainingMs));
    const proof = (kind: KillstreakDemoProofKind, count: number, activationIds: readonly string[] = []): RuntimeProof => ({
      revision: snapshot.killstreak.revision,
      kind,
      count,
      activationIds,
    });
    switch (supportId) {
      case 'scout-sweep': return proof('scout-active', snapshot.fieldSupport.scoutActive ? 1 : 0);
      case 'adrenaline': return proof('adrenaline-active', actorAdrenaline > 0 ? 1 : 0);
      case 'care-package': return proof('care-entities', newEntities.filter((entity: { kind: string }) => entity.kind === 'aircraft' || entity.kind === 'care-crate').length, ids);
      case 'yardhawk': return proof('yardhawk-active', snapshot.fieldSupport.yardhawk.active ? 1 : 0);
      case 'piloted-drone': {
        const entities = newEntities.filter((entity: { kind: string; mode: string | null }) => entity.kind === 'drone' && entity.mode === 'piloted');
        return proof('piloted-drone-entity', entities.length, [...new Set(entities.map((entity: { activationId: string }) => entity.activationId))]);
      }
      case 'tri-pass': return proof('tri-pass-launches', snapshot.fieldSupport.triPassLaunches - before.triPassLaunches);
      case 'carpet-bomber': {
        const entities = newEntities.filter((entity: { kind: string }) => entity.kind === 'aircraft');
        return proof('carpet-aircraft-entity', entities.length, [...new Set(entities.map((entity: { activationId: string }) => entity.activationId))]);
      }
      case 'hunter-swarm': return proof('hunter-swarm-launches', snapshot.fieldSupport.hunterSwarmLaunches - before.hunterSwarmLaunches);
      case 'chopper': {
        const entities = newEntities.filter((entity: { kind: string }) => entity.kind === 'chopper');
        return proof('chopper-entity', entities.length, [...new Set(entities.map((entity: { activationId: string }) => entity.activationId))]);
      }
      case 'drone-swarm': {
        const entities = newEntities.filter((entity: { kind: string; mode: string | null }) => entity.kind === 'drone' && entity.mode === 'swarm');
        return proof('drone-swarm-entities', entities.length, [...new Set(entities.map((entity: { activationId: string }) => entity.activationId))]);
      }
      case 'nuke': return proof('nuke-sequence', snapshot.fieldSupport.nuke.active
        ? snapshot.fieldSupport.nukeActivations - before.nukeActivations
        : 0);
      default: throw new Error(`unsupported capture proof ${String(supportId)}`);
    }
  }, { supportId: id, before: baseline });
}

async function runtimeHealth(page: Page): Promise<RuntimeHealth> {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const admission = window.__ATOMIC_ACRES_DEBUG__.admissionState();
    const health = {
      bootstrapStage: snapshot.bootstrap.stage,
      bootstrapError: snapshot.bootstrap.error,
      matchPhase: snapshot.matchPhase,
      arenaId: snapshot.arenaSelection.id,
      actualBackend: snapshot.render.runtime.actualBackend,
      webglVersion: snapshot.render.webglVersion,
      softwareAdapter: snapshot.render.runtime.softwareAdapter,
      contextLost: snapshot.render.contextLifecycle.lost,
      presentationStatus: snapshot.render.runtime.presentation.status,
      runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false,
      presentedGameplayFrame: admission.presentedGameplayFrame,
      webglContext: document.documentElement.dataset.webglContext ?? null,
    };
    if (health.bootstrapStage !== 'ready' || health.bootstrapError !== null || health.matchPhase !== 'active'
      || health.arenaId !== 'gun-range' || health.actualBackend !== 'webgl2'
      || !String(health.webglVersion).includes('WebGL 2') || health.softwareAdapter !== false
      || health.contextLost !== false || !['synchronous', 'healthy'].includes(health.presentationStatus)
      || health.runtimeErrorVisible || !(health.presentedGameplayFrame > 0) || health.webglContext !== 'ready') {
      throw new Error(`capture renderer/admission is unhealthy: ${JSON.stringify(health)}`);
    }
    return {
      bootstrapStage: 'ready' as const,
      bootstrapError: null,
      matchPhase: 'active' as const,
      arenaId: 'gun-range' as const,
      actualBackend: 'webgl2' as const,
      webglVersion: String(health.webglVersion),
      softwareAdapter: false as const,
      contextLost: false as const,
      presentationStatus: health.presentationStatus as 'synchronous' | 'healthy',
      runtimeErrorVisible: false as const,
    };
  });
}

function point(x: number, y: number, z: number): KillstreakDemoWorldPoint {
  return Object.freeze([x, y, z]);
}

function overviewCameraPose(id: Pass65KillstreakId, station: Readonly<{ x: number; y: number; z: number }>): KillstreakDemoCameraPose {
  return resolveKillstreakDemoCameraPose(id, [
    point(station.x, 1.1, station.z),
    point(69, 1.3, Math.max(-16, Math.min(14, station.z))),
  ]);
}

async function applyCameraPose(page: Page, pose: KillstreakDemoCameraPose): Promise<void> {
  await page.evaluate((cameraPose) => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(
    cameraPose.position[0], cameraPose.position[1], cameraPose.position[2],
    cameraPose.yaw, cameraPose.pitch, cameraPose.fov,
  ), pose);
  const beforeFrame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame);
  await page.waitForFunction((frame) => (
    window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame >= frame + 2
  ), beforeFrame, { timeout: 5_000 });
}

async function runtimeVisualSubjects(
  page: Page,
  id: Pass65KillstreakId,
  baseline: CaptureBaseline,
): Promise<readonly VisualSubject[]> {
  return page.evaluate(({ supportId, before }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const newEntities = snapshot.killstreak.entities.filter((entity: { activationId: string }) => (
      !before.activationIds.includes(entity.activationId)
    ));
    const subject = (subjectId: string, position: readonly number[]) => ({
      id: subjectId,
      position: [Number(position[0]), Number(position[1]), Number(position[2])] as const,
    });
    switch (supportId) {
      case 'care-package': return newEntities
        .filter((entity: { kind: string }) => entity.kind === 'aircraft' || entity.kind === 'care-crate')
        .map((entity: { id: string; kind: string; position: readonly number[] }) => subject(`${entity.kind}:${entity.id}`, entity.position));
      case 'yardhawk': return snapshot.fieldSupport.yardhawk.active
        ? [subject(`yardhawk:${snapshot.fieldSupport.yardhawk.targetId ?? 'target'}`, snapshot.fieldSupport.yardhawk.position)]
        : [];
      case 'piloted-drone': return newEntities
        .filter((entity: { kind: string; mode: string | null }) => entity.kind === 'drone' && entity.mode === 'piloted')
        .map((entity: { id: string; position: readonly number[] }) => subject(`piloted-drone:${entity.id}`, entity.position));
      case 'tri-pass': return snapshot.fieldSupport.strikeMissiles
        .map((missile: { position: readonly number[] }, index: number) => subject(`tri-pass-missile:${index}`, missile.position));
      case 'carpet-bomber': return newEntities
        .filter((entity: { kind: string }) => entity.kind === 'aircraft')
        .map((entity: { id: string; position: readonly number[] }) => subject(`carpet-aircraft:${entity.id}`, entity.position));
      case 'hunter-swarm': return snapshot.fieldSupport.hunterDrones
        .map((drone: { index: number; position: readonly number[] }) => subject(`hunter-drone:${drone.index}`, drone.position));
      case 'chopper': return newEntities
        .filter((entity: { kind: string }) => entity.kind === 'chopper')
        .map((entity: { id: string; position: readonly number[] }) => subject(`chopper:${entity.id}`, entity.position));
      case 'drone-swarm': return newEntities
        .filter((entity: { kind: string; mode: string | null }) => entity.kind === 'drone' && entity.mode === 'swarm')
        .map((entity: { id: string; position: readonly number[] }) => subject(`swarm-drone:${entity.id}`, entity.position));
      default: return [];
    }
  }, { supportId: id, before: baseline });
}

async function visibleHudRegion(page: Page, selector: string): Promise<HudRegion | null> {
  return page.evaluate((hudSelector) => {
    const element = document.querySelector<HTMLElement>(hudSelector);
    if (!element || element.hidden) return null;
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0
      || bounds.width < 20 || bounds.height < 20) return null;
    return {
      selector: hudSelector,
      left: Number(bounds.left.toFixed(3)),
      top: Number(bounds.top.toFixed(3)),
      width: Number(bounds.width.toFixed(3)),
      height: Number(bounds.height.toFixed(3)),
      visible: true as const,
    };
  }, selector);
}

async function establishVisualSetup(
  page: Page,
  id: Pass65KillstreakId,
  baseline: CaptureBaseline,
  station: Readonly<{ x: number; y: number; z: number }>,
): Promise<CaptureVisualSetup> {
  const requirement = KILLSTREAK_DEMO_VISUAL_REQUIREMENTS[id];
  if (requirement.hudSelector !== null) {
    if (id === 'scout-sweep') {
      await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.scoutPulseVisible), {
        timeout: 4_000,
      }).toBe(true);
    }
    const pose = overviewCameraPose(id, station);
    await applyCameraPose(page, pose);
    const hudRegion = await visibleHudRegion(page, requirement.hudSelector);
    expect(hudRegion, `${id} must expose its real HUD effect inside the recorded viewport`).not.toBeNull();
    const sampledAtPresentedFrame = await page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame
    ));
    return Object.freeze({
      pose, subjects: Object.freeze([]), projectedSubjects: Object.freeze([]), hudRegion,
      sampledAtPresentedFrame,
    });
  }

  await expect.poll(async () => (await runtimeVisualSubjects(page, id, baseline)).length, {
    timeout: 5_000,
  }).toBeGreaterThanOrEqual(requirement.minimumSubjectCount);
  const subjects = await runtimeVisualSubjects(page, id, baseline);
  const pose = resolveKillstreakDemoCameraPose(id, subjects.map(({ position }) => position));
  await applyCameraPose(page, pose);
  const projectedSubjects = subjects.map(({ id: subjectId, position }) => {
    const projection = projectKillstreakDemoWorldPoint(pose, position);
    return Object.freeze({ id: subjectId, worldPosition: position, ...projection });
  });
  const inFrameCount = projectedSubjects.filter(({ ndcX, ndcY, depthM }) => (
    depthM > 0 && Math.abs(ndcX) <= 0.9 && Math.abs(ndcY) <= 0.9
  )).length;
  expect(inFrameCount, `${id} camera must frame its real runtime subjects`).toBeGreaterThanOrEqual(requirement.minimumInFrameCount);
  const sampledAtPresentedFrame = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame
  ));
  return Object.freeze({
    pose,
    subjects: Object.freeze(subjects),
    projectedSubjects: Object.freeze(projectedSubjects),
    hudRegion: null,
    sampledAtPresentedFrame,
  });
}

async function startCaptureTelemetryProbe(
  page: Page,
  id: Pass65KillstreakId,
  baseline: CaptureBaseline,
): Promise<void> {
  await page.evaluate(({ supportId, before }) => {
    type ProbeState = {
      startedAt: number;
      frameCountStart: number;
      presentedFrameStart: number;
      lastPresentedFrame: number;
      samples: Array<{ elapsedMs: number; presentedFrame: number }>;
      milestones: Set<string>;
      rafId: number;
      intervalId: number;
    };
    const captureWindow = window as unknown as { __PASS66_KILLSTREAK_CAPTURE_PROBE__?: ProbeState };
    if (captureWindow.__PASS66_KILLSTREAK_CAPTURE_PROBE__) throw new Error('capture telemetry probe already active');
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const startedAt = performance.now();
    const initial = api.snapshot();
    const presentedFrameStart = Number(api.admissionState().presentedGameplayFrame);
    const state: ProbeState = {
      startedAt,
      frameCountStart: Number(initial.frameCount),
      presentedFrameStart,
      lastPresentedFrame: presentedFrameStart,
      samples: [{ elapsedMs: 0, presentedFrame: presentedFrameStart }],
      milestones: new Set<string>(),
      rafId: 0,
      intervalId: 0,
    };
    const visible = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
        && bounds.width >= 20 && bounds.height >= 20;
    };
    const sampleMilestones = () => {
      const snapshot = api.snapshot();
      const newEntities = snapshot.killstreak.entities.filter((entity: { activationId: string }) => (
        !before.activationIds.includes(entity.activationId)
      ));
      if (snapshot.fieldSupport.scoutPulseVisible) state.milestones.add('scout-pulse-visible');
      if (visible('#minimap')) state.milestones.add('minimap-visible');
      if (snapshot.adrenalineRuntime.active) state.milestones.add('adrenaline-runtime-active');
      if (visible('#adrenaline-hud')) state.milestones.add('adrenaline-hud-visible');
      if (supportId === 'care-package'
        && newEntities.some((entity: { kind: string }) => entity.kind === 'aircraft')
        && snapshot.killstreakPresentation.entities >= 2) {
        state.milestones.add('care-aircraft-visible');
      }
      if (supportId === 'care-package'
        && newEntities.some((entity: { kind: string }) => entity.kind === 'care-crate')
        && snapshot.killstreakPresentation.entities >= 2) state.milestones.add('care-crate-visible');
      if (snapshot.fieldSupport.yardhawk.active) state.milestones.add('yardhawk-projectile-visible');
      if (snapshot.fieldSupport.yardhawkExplosions > before.yardhawkExplosions
        && snapshot.fieldSupport.explosionPresentation.active > 0) state.milestones.add('yardhawk-explosion-visible');
      if (newEntities.some((entity: { kind: string; mode: string | null }) => entity.kind === 'drone' && entity.mode === 'piloted')) {
        state.milestones.add('piloted-drone-authoritative');
        if (snapshot.killstreakPresentation.entities > 0) state.milestones.add('piloted-drone-rendered');
      }
      if (snapshot.fieldSupport.strikeMissiles.length >= 3) state.milestones.add('tri-pass-three-missiles-visible');
      if (snapshot.fieldSupport.triPassImpacts - before.triPassImpacts >= 3
        && snapshot.fieldSupport.explosionPresentation.active > 0) state.milestones.add('tri-pass-three-impacts-visible');
      if (supportId === 'carpet-bomber'
        && newEntities.some((entity: { kind: string }) => entity.kind === 'aircraft')
        && snapshot.killstreakPresentation.entities > 0) {
        state.milestones.add('carpet-aircraft-visible');
      }
      if (supportId === 'carpet-bomber' && snapshot.killstreakPresentation.bombShells > 0) state.milestones.add('carpet-bombs-visible');
      if (supportId === 'carpet-bomber' && snapshot.killstreakPresentation.impactFlashes > 0) state.milestones.add('carpet-impacts-visible');
      if (snapshot.fieldSupport.hunterDrones.length >= 5) state.milestones.add('hunter-five-drones-visible');
      if (snapshot.fieldSupport.hunterSwarmImpacts > before.hunterSwarmImpacts
        && snapshot.fieldSupport.explosionPresentation.active > 0) state.milestones.add('hunter-impact-visible');
      if (newEntities.some((entity: { kind: string }) => entity.kind === 'chopper')) {
        state.milestones.add('chopper-authoritative');
        if (snapshot.killstreakPresentation.entities > 0) state.milestones.add('chopper-rendered');
      }
      const swarmEntities = newEntities.filter((entity: { kind: string; mode: string | null }) => (
        entity.kind === 'drone' && entity.mode === 'swarm'
      ));
      if (swarmEntities.length >= 24) state.milestones.add('drone-swarm-24-authoritative');
      if (snapshot.killstreakPresentation.swarmRenderedInstances >= 24
        && snapshot.killstreakPresentation.swarmVisibleRenderBatches > 0) state.milestones.add('drone-swarm-24-rendered');
      if (visible('#nuke-warning')) state.milestones.add('nuke-warning-visible');
      if (snapshot.fieldSupport.nukeDetonations > before.nukeDetonations && snapshot.fieldSupport.nuke.detonated) {
        state.milestones.add('nuke-detonated');
      }
      if (visible('#nuke-flash')) state.milestones.add('nuke-flash-visible');
    };
    const sampleFrame = (now: number) => {
      const presentedFrame = Number(api.admissionState().presentedGameplayFrame);
      if (presentedFrame > state.lastPresentedFrame) {
        state.samples.push({ elapsedMs: Number((now - state.startedAt).toFixed(3)), presentedFrame });
        state.lastPresentedFrame = presentedFrame;
      }
      state.rafId = requestAnimationFrame(sampleFrame);
    };
    sampleMilestones();
    // Support snapshots are intentionally sampled below frame cadence: this
    // records effect milestones without making the evidence probe the thing
    // that depresses renderer throughput. The shortest impact presentation is
    // still several samples wide at this 100 ms interval.
    state.intervalId = window.setInterval(sampleMilestones, 100);
    state.rafId = requestAnimationFrame(sampleFrame);
    captureWindow.__PASS66_KILLSTREAK_CAPTURE_PROBE__ = state;
  }, { supportId: id, before: baseline });
}

async function stopCaptureTelemetryProbe(
  page: Page,
  id: Pass65KillstreakId,
): Promise<CaptureTelemetryResult> {
  const raw = await page.evaluate(() => {
    type ProbeState = {
      startedAt: number;
      frameCountStart: number;
      presentedFrameStart: number;
      lastPresentedFrame: number;
      samples: Array<{ elapsedMs: number; presentedFrame: number }>;
      milestones: Set<string>;
      rafId: number;
      intervalId: number;
    };
    const captureWindow = window as unknown as { __PASS66_KILLSTREAK_CAPTURE_PROBE__?: ProbeState };
    const state = captureWindow.__PASS66_KILLSTREAK_CAPTURE_PROBE__;
    if (!state) throw new Error('capture telemetry probe is not active');
    cancelAnimationFrame(state.rafId);
    clearInterval(state.intervalId);
    const endedAt = performance.now();
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const presentedFrameEnd = Number(window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame);
    if (presentedFrameEnd > state.lastPresentedFrame) {
      state.samples.push({ elapsedMs: Number((endedAt - state.startedAt).toFixed(3)), presentedFrame: presentedFrameEnd });
    }
    delete captureWindow.__PASS66_KILLSTREAK_CAPTURE_PROBE__;
    return {
      durationMs: Number((endedAt - state.startedAt).toFixed(3)),
      frameCountStart: state.frameCountStart,
      frameCountEnd: Number(snapshot.frameCount),
      presentedFrameStart: state.presentedFrameStart,
      presentedFrameEnd,
      samples: state.samples,
      milestones: [...state.milestones],
    };
  });
  const samples = raw.samples.map((sample): KillstreakDemoRuntimeCadenceSample => Object.freeze({ ...sample }));
  const summary = summarizeKillstreakDemoRuntimeCadence({
    durationMs: raw.durationMs,
    presentedFrameStart: raw.presentedFrameStart,
    presentedFrameEnd: raw.presentedFrameEnd,
    samples,
  });
  const requiredMilestones = KILLSTREAK_DEMO_VISUAL_REQUIREMENTS[id].requiredMilestones;
  const milestones = requiredMilestones.filter((milestone) => raw.milestones.includes(milestone));
  expect(milestones, `${id} video must contain every real visible effect milestone`).toEqual(requiredMilestones);
  return Object.freeze({
    cadence: Object.freeze({
      durationMs: raw.durationMs,
      frameCountStart: raw.frameCountStart,
      frameCountEnd: raw.frameCountEnd,
      presentedFrameStart: raw.presentedFrameStart,
      presentedFrameEnd: raw.presentedFrameEnd,
      ...summary,
      samples: Object.freeze(samples),
    }),
    milestones: Object.freeze(milestones),
  });
}

async function saveRawRecording(video: Video, context: BrowserContext, path: string): Promise<number> {
  await context.close();
  const recordingClosedAt = Date.now();
  await video.saveAs(path);
  return recordingClosedAt;
}

async function captureSupport(
  browser: Browser,
  id: Pass65KillstreakId,
  pageErrors: string[],
  testInfo: Parameters<Parameters<typeof test>[1]>[1],
): Promise<KillstreakDemoCaptureEntry> {
  const recordingContextId = randomUUID();
  const context = await browser.newContext({
    baseURL,
    viewport: KILLSTREAK_DEMO_CAPTURE_VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: rawRoot, size: KILLSTREAK_DEMO_CAPTURE_VIEWPORT },
  });
  let page: Page | undefined;
  let contextClosed = false;
  try {
    page = await context.newPage();
    const video = page.video();
    if (!video) throw new Error(`${id} did not receive a Playwright video recorder`);
    page.on('pageerror', (error) => pageErrors.push(`${id}: ${error.stack ?? error.message}`));
    await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await startRealTestBay(page);
    const station = GUN_RANGE_TEST_BAY_CONTRACT.supportStations.find((candidate) => candidate.id === id);
    expect(station, `${id} must project into a test-bay station`).toBeDefined();
    await page.evaluate(({ x, z }) => {
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z, Math.PI / 2, -0.38);
    }, station!.position);
    const expectedTargetId = `test-bay-support:${id}`;
    await expect.poll(async () => page!.evaluate((targetId) => {
      const support = window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport;
      return support.fInteraction.inputEligible
        && support.fInteraction.candidates.some((candidate: { kind: string; targetId: string; enabled: boolean }) => (
          candidate.kind === 'test-bay-support' && candidate.targetId === targetId && candidate.enabled !== false
        ));
    }, expectedTargetId)).toBe(true);
    const baseline = await activationBaseline(page);
    await runtimeHealth(page);
    await applyCameraPose(page, overviewCameraPose(id, station!.position));
    await startCaptureTelemetryProbe(page, id, baseline);
    const clipStartedAt = Date.now();
    await page.waitForTimeout(750);

    // Wall-clock anchors are reconciled against the completed raw recording.
    // The encoded clip starts at clipStartedAt, retains the real station/F lead,
    // and then moves to its support-specific runtime subject framing.
    const activationPressedAt = Date.now();
    await page.keyboard.down('f');
    await page.waitForTimeout(45);
    await page.keyboard.up('f');
    await expect.poll(async () => page!.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.lastCommit?.candidate?.targetId ?? null
    ))).toBe(expectedTargetId);
    await completeTargeting(page, id);

    const expectedProof = KILLSTREAK_DEMO_EXPECTED_PROOF[id];
    try {
      await expect.poll(async () => {
        const current = await runtimeProof(page!, id, baseline);
        return current.kind === expectedProof.kind
          && current.count >= expectedProof.minimumCount
          && current.revision > baseline.revision;
      }, { timeout: 20_000 }).toBe(true);
    } catch (error) {
      const diagnostic = await page.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          actors: snapshot.killstreak.actors,
          killstreakRevision: snapshot.killstreak.revision,
          localContinuity: snapshot.netcode.localContinuity,
          available: snapshot.fieldSupport.available,
          candidates: snapshot.fieldSupport.fInteraction.candidates,
          lastCommit: snapshot.fieldSupport.fInteraction.lastCommit,
          targetingMode: snapshot.fieldSupport.targetingMode,
          feed: document.querySelector('#feed')?.textContent ?? '',
        };
      });
      throw new Error(`${id} normal activation proof failed: ${JSON.stringify(diagnostic)}\n${error instanceof Error ? error.message : String(error)}`);
    }
    const proof = await runtimeProof(page, id, baseline);
    expect(proof.count, `${id} must produce its support-specific runtime evidence`).toBeGreaterThanOrEqual(expectedProof.minimumCount);
    expect(proof.revision, `${id} must advance canonical killstreak authority`).toBeGreaterThan(baseline.revision);

    const visualSetup = await establishVisualSetup(page, id, baseline, station!.position);
    const visualProofObservedAt = Date.now();
    expect(visualProofObservedAt - clipStartedAt, `${id} must establish useful framing early in the clip`).toBeLessThanOrEqual(3_000);
    await page.waitForTimeout(id === 'yardhawk' ? 80 : 180);
    const artifactPath = resolve(stagingRoot, `${id}.jpg`);
    await page.screenshot({ path: artifactPath, type: 'jpeg', quality: 88 });
    const posterBytes = readFileSync(artifactPath);
    const dimensions = jpegDimensions(posterBytes);
    expect(dimensions).toEqual(KILLSTREAK_DEMO_CAPTURE_VIEWPORT);

    const clipDurationMs = KILLSTREAK_DEMO_CLIP_DURATION_MS[id];
    const remainingTailMs = clipStartedAt + clipDurationMs - Date.now();
    if (remainingTailMs > 0) await page.waitForTimeout(remainingTailMs);
    const captureTelemetry = await stopCaptureTelemetryProbe(page, id);
    const finalRuntimeHealth = await runtimeHealth(page);
    const rawPath = resolve(rawRoot, `${id}-${recordingContextId}.webm`);
    const recordingClosedAt = await saveRawRecording(video, context, rawPath);
    contextClosed = true;
    const rawBytes = readFileSync(rawPath);
    const rawDuration = rawVideoDurationMs(rawPath);
    const inferredVideoStartedAt = recordingClosedAt - rawDuration;
    const clipStartTimelineMs = clipStartedAt - inferredVideoStartedAt;
    const activationTimelineMs = activationPressedAt - inferredVideoStartedAt;
    const visualProofTimelineMs = visualProofObservedAt - inferredVideoStartedAt;
    const trimStartMs = Math.max(0, clipStartTimelineMs);
    const activationOffsetMs = Math.round(activationTimelineMs - trimStartMs);
    const visualProofOffsetMs = Math.round(visualProofTimelineMs - trimStartMs);
    const videoArtifactPath = resolve(stagingRoot, `${id}.mp4`);
    encodeClip(rawPath, videoArtifactPath, trimStartMs, clipDurationMs);
    const videoBytes = readFileSync(videoArtifactPath);
    const videoProbe = await probeH264Mp4(videoArtifactPath);
    expect(videoProbe.width).toBe(KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width);
    expect(videoProbe.height).toBe(KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height);
    expect(videoProbe.hasAudio).toBe(false);

    await testInfo.attach(`real-test-bay-${id}-poster`, { path: artifactPath, contentType: 'image/jpeg' });
    await testInfo.attach(`real-test-bay-${id}-video`, { path: videoArtifactPath, contentType: 'video/mp4' });
    return Object.freeze({
      id,
      artifactPath: relativeArtifact(artifactPath),
      sha256: sha256(posterBytes),
      sizeBytes: posterBytes.length,
      ...dimensions,
      videoArtifactPath: relativeArtifact(videoArtifactPath),
      videoSha256: sha256(videoBytes),
      videoSizeBytes: videoBytes.length,
      videoWidth: videoProbe.width,
      videoHeight: videoProbe.height,
      videoDurationMs: videoProbe.durationMs,
      videoFrameCount: videoProbe.frameCount,
      videoSampleFrameSha256: videoProbe.sampleFrameSha256,
      videoMotionFrameCount: videoProbe.motionFrameCount,
      videoNearDuplicateFrameCount: videoProbe.nearDuplicateFrameCount,
      videoNearDuplicateFrameRatio: videoProbe.nearDuplicateFrameRatio,
      videoLongestNearDuplicateRun: videoProbe.longestNearDuplicateRun,
      videoCodec: videoProbe.codec,
      videoProfile: videoProbe.profile,
      videoContainer: videoProbe.container,
      videoPixelFormat: videoProbe.pixelFormat,
      videoFastStart: videoProbe.fastStart,
      videoHasAudio: false,
      videoActivationOffsetMs: activationOffsetMs,
      videoVisualProofOffsetMs: visualProofOffsetMs,
      recordingContextId,
      rawRecordingSha256: sha256(rawBytes),
      fCandidateTargetId: expectedTargetId,
      fCommitTargetId: expectedTargetId,
      revisionBefore: baseline.revision,
      revisionAfter: proof.revision,
      proof: Object.freeze({ kind: proof.kind, count: proof.count, activationIds: Object.freeze([...proof.activationIds]) }),
      runtimeHealth: finalRuntimeHealth,
      cameraPose: visualSetup.pose,
      visualProof: Object.freeze({
        kind: KILLSTREAK_DEMO_VISUAL_REQUIREMENTS[id].kind,
        sampledAtPresentedFrame: visualSetup.sampledAtPresentedFrame,
        subjectCount: visualSetup.projectedSubjects.length,
        inFrameCount: visualSetup.projectedSubjects.filter(({ ndcX, ndcY, depthM }) => (
          depthM > 0 && Math.abs(ndcX) <= 0.9 && Math.abs(ndcY) <= 0.9
        )).length,
        subjects: visualSetup.projectedSubjects,
        hudRegion: visualSetup.hudRegion,
        milestones: captureTelemetry.milestones,
      }),
      runtimeCadence: captureTelemetry.cadence,
    });
  } finally {
    if (!contextClosed) await context.close().catch(() => undefined);
  }
}

test('records one unique real-bay video after every canonical support passes F arbitration and normal activation', async ({}, testInfo) => {
  test.setTimeout(1_200_000);
  rmSync(receiptPath, { force: true });
  rmSync(rawRoot, { recursive: true, force: true });
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(rawRoot, { recursive: true });
  mkdirSync(stagingRoot, { recursive: true });
  const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
  }).trim();
  const cleanBefore = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
  }).trim();
  expect(gitHead).toBe(expectedSourceSha);
  expect(cleanBefore, 'killstreak capture requires a clean source-freeze worktree').toBe('');
  const servedCandidate = await servedCandidateProvenance();
  const sourceInputsBefore = await collectKillstreakDemoSourceClosure(repositoryRoot);
  const sourceClosureSha256 = killstreakDemoSourceClosureSha256(sourceInputsBefore);
  const pageErrors: string[] = [];
  const executablePath = installedChromePath();
  const encoderVersion = ffmpegVersion();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--enable-gpu',
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--disable-software-rasterizer',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  try {
    const captures: KillstreakDemoCaptureEntry[] = [];
    for (const id of KILLSTREAK_DEMO_CAPTURE_IDS) {
      captures.push(await captureSupport(browser, id, pageErrors, testInfo));
    }
    const sourceInputs = await collectKillstreakDemoSourceClosure(repositoryRoot);
    expect(sourceInputs).toEqual(sourceInputsBefore);
    expect(killstreakDemoSourceClosureSha256(sourceInputs)).toBe(sourceClosureSha256);
    expect(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
    }).trim()).toBe(gitHead);
    expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: repositoryRoot, encoding: 'utf8', windowsHide: true,
    }).trim(), 'killstreak capture source changed during authoring').toBe('');
    const receipt: KillstreakDemoCaptureReceipt = Object.freeze({
      schemaVersion: 5,
      captureKind: 'real-gun-range-test-bay-runtime',
      capturedAt: new Date().toISOString(),
      gitHead,
      servedSourceSha: servedCandidate.sourceSha,
      servedRuntimeTreeSha256: servedCandidate.treeSha256,
      servedRuntimeFileCount: servedCandidate.exactRootFileCount,
      browserName: 'Google Chrome',
      browserVersion: browser.version(),
      encoderName: 'ffmpeg/libx264',
      encoderVersion,
      renderer: 'webgl2',
      route: KILLSTREAK_DEMO_CAPTURE_ROUTE,
      seed: 'pass66-killstreak-demo',
      viewport: KILLSTREAK_DEMO_CAPTURE_VIEWPORT,
      sourceClosureSha256,
      sourceInputs: Object.freeze(sourceInputs),
      captures: Object.freeze(captures),
      pageErrors: Object.freeze(pageErrors),
    });
    expect(validateKillstreakDemoCaptureReceipt(receipt)).toEqual([]);
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await testInfo.attach('real-test-bay-video-capture-receipt', { path: receiptPath, contentType: 'application/json' });
  } finally {
    await browser.close();
  }
});
