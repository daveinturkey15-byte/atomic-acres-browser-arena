import { PASS65_KILLSTREAK_CATALOG, type SelectableKillstreakId } from './killstreak-catalog';

export const KILLSTREAK_DEMO_CAPTURE_SCHEMA_VERSION = 5;
export const KILLSTREAK_DEMO_MEDIA_MANIFEST_SCHEMA_VERSION = 4;
export const KILLSTREAK_DEMO_CAPTURE_ROUTE = '/?release=latest&map=gun-range&renderer=webgl2&render=blender&signal=off&grass=off&mist=off&rays=off&externalServices=off&seed=pass66-killstreak-demo';
export const KILLSTREAK_DEMO_CAPTURE_VIEWPORT = Object.freeze({ width: 960, height: 540 });
export const KILLSTREAK_DEMO_MINIMUM_PRESENTED_FPS = 24;
export const KILLSTREAK_DEMO_MAXIMUM_P95_PRESENTED_GAP_MS = 80;
export const KILLSTREAK_DEMO_MAXIMUM_PRESENTED_GAP_MS = 250;
export const KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RATIO = 0.35;
export const KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RUN = 6;
/**
 * HF-334: demos exist for killstreaks a player can put in a slot. A
 * care-package-only weapon reward has no activation to film, so it is excluded
 * here rather than given a fabricated capture plan — the exclusion is derived
 * from availability, so a future care-only reward is handled automatically.
 */
export const KILLSTREAK_DEMO_CAPTURE_IDS = Object.freeze(
  PASS65_KILLSTREAK_CATALOG.definitions
    .filter(({ availability }) => availability !== 'care-only')
    .map(({ id }) => id as SelectableKillstreakId),
);
export const KILLSTREAK_DEMO_CAPTURE_SOURCE_ROOTS = Object.freeze(['src', 'public', 'shared'] as const);
export const KILLSTREAK_DEMO_CAPTURE_EXCLUDED_SOURCE_PREFIXES = Object.freeze([
  'public/assets/original/killstreak-demo/',
] as const);
export const KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS = Object.freeze([
  '.env.production',
  'package.json',
  'package-lock.json',
  'index.html',
  'tsconfig.json',
  'vite.config.ts',
  'playwright.config.ts',
  'release-channels.json',
  'release-shell/index.html',
  'release-shell/release-shell.css',
  'release-shell/release-shell.js',
  'scripts/qa/playwright-web-server.mjs',
  'scripts/release/stage-release-topology.mjs',
  'tests/e2e/pass66-gun-range-killstreak-demo-capture.spec.ts',
  'scripts/qa/finalize-pass66-killstreak-demo-media.ts',
  'scripts/qa/pass66-killstreak-demo-source-closure.ts',
  'scripts/qa/pass66-killstreak-demo-video-probe.ts',
  'scripts/qa/run-pass66-killstreak-demo-capture.mjs',
  'source-assets/menu/pass65-preview-masters/choreography.json',
  'docs/PASS66_KILLSTREAK_DEMO_VIDEO_CAPTURE.md',
] as const);

/**
 * The retained tail is deliberately short enough for a menu loop while giving
 * every real support time to become legible after the normal F-key commit.
 */
export const KILLSTREAK_DEMO_CLIP_DURATION_MS: Readonly<Record<SelectableKillstreakId, number>> = Object.freeze({
  'scout-sweep': 4_500,
  adrenaline: 4_500,
  'care-package': 7_000,
  yardhawk: 6_000,
  'piloted-drone': 6_000,
  'tri-pass': 7_000,
  'carpet-bomber': 8_000,
  'hunter-swarm': 7_000,
  chopper: 7_000,
  'drone-swarm': 7_000,
  nuke: 8_500,
});

export type KillstreakDemoProofKind =
  | 'scout-active'
  | 'adrenaline-active'
  | 'care-entities'
  | 'yardhawk-active'
  | 'piloted-drone-entity'
  | 'tri-pass-launches'
  | 'carpet-aircraft-entity'
  | 'hunter-swarm-launches'
  | 'chopper-entity'
  | 'drone-swarm-entities'
  | 'nuke-sequence';

export const KILLSTREAK_DEMO_EXPECTED_PROOF: Readonly<Record<SelectableKillstreakId, Readonly<{
  kind: KillstreakDemoProofKind;
  minimumCount: number;
}>>> = Object.freeze({
  'scout-sweep': Object.freeze({ kind: 'scout-active', minimumCount: 1 }),
  adrenaline: Object.freeze({ kind: 'adrenaline-active', minimumCount: 1 }),
  'care-package': Object.freeze({ kind: 'care-entities', minimumCount: 2 }),
  yardhawk: Object.freeze({ kind: 'yardhawk-active', minimumCount: 1 }),
  'piloted-drone': Object.freeze({ kind: 'piloted-drone-entity', minimumCount: 1 }),
  'tri-pass': Object.freeze({ kind: 'tri-pass-launches', minimumCount: 3 }),
  'carpet-bomber': Object.freeze({ kind: 'carpet-aircraft-entity', minimumCount: 1 }),
  'hunter-swarm': Object.freeze({ kind: 'hunter-swarm-launches', minimumCount: 5 }),
  chopper: Object.freeze({ kind: 'chopper-entity', minimumCount: 1 }),
  'drone-swarm': Object.freeze({ kind: 'drone-swarm-entities', minimumCount: 24 }),
  nuke: Object.freeze({ kind: 'nuke-sequence', minimumCount: 1 }),
});

export type KillstreakDemoVisualProofKind =
  | 'scout-pulse-hud'
  | 'adrenaline-hud'
  | 'care-aircraft-crate'
  | 'yardhawk-projectile-explosion'
  | 'piloted-drone-airframe'
  | 'tri-pass-missiles-impacts'
  | 'carpet-aircraft-bombs-impacts'
  | 'hunter-drone-flight-impacts'
  | 'chopper-airframe'
  | 'drone-swarm-formation'
  | 'nuke-warning-detonation';

export type KillstreakDemoCameraStrategy = 'dynamic-world-subjects' | 'bay-hud-overview';

export const KILLSTREAK_DEMO_VISUAL_REQUIREMENTS: Readonly<Record<SelectableKillstreakId, Readonly<{
  kind: KillstreakDemoVisualProofKind;
  cameraStrategy: KillstreakDemoCameraStrategy;
  minimumSubjectCount: number;
  minimumInFrameCount: number;
  hudSelector: string | null;
  requiredMilestones: readonly string[];
}>>> = Object.freeze({
  'scout-sweep': Object.freeze({
    kind: 'scout-pulse-hud', cameraStrategy: 'bay-hud-overview', minimumSubjectCount: 0, minimumInFrameCount: 0,
    hudSelector: '#minimap', requiredMilestones: Object.freeze(['scout-pulse-visible', 'minimap-visible']),
  }),
  adrenaline: Object.freeze({
    kind: 'adrenaline-hud', cameraStrategy: 'bay-hud-overview', minimumSubjectCount: 0, minimumInFrameCount: 0,
    hudSelector: '#adrenaline-hud', requiredMilestones: Object.freeze(['adrenaline-runtime-active', 'adrenaline-hud-visible']),
  }),
  'care-package': Object.freeze({
    kind: 'care-aircraft-crate', cameraStrategy: 'dynamic-world-subjects', minimumSubjectCount: 2, minimumInFrameCount: 2,
    hudSelector: null, requiredMilestones: Object.freeze(['care-aircraft-visible', 'care-crate-visible']),
  }),
  yardhawk: Object.freeze({
    kind: 'yardhawk-projectile-explosion', cameraStrategy: 'dynamic-world-subjects', minimumSubjectCount: 1, minimumInFrameCount: 1,
    hudSelector: null, requiredMilestones: Object.freeze(['yardhawk-projectile-visible', 'yardhawk-explosion-visible']),
  }),
  'piloted-drone': Object.freeze({
    kind: 'piloted-drone-airframe', cameraStrategy: 'dynamic-world-subjects', minimumSubjectCount: 1, minimumInFrameCount: 1,
    hudSelector: null, requiredMilestones: Object.freeze(['piloted-drone-authoritative', 'piloted-drone-rendered']),
  }),
  'tri-pass': Object.freeze({
    kind: 'tri-pass-missiles-impacts', cameraStrategy: 'dynamic-world-subjects', minimumSubjectCount: 3, minimumInFrameCount: 3,
    hudSelector: null, requiredMilestones: Object.freeze(['tri-pass-three-missiles-visible', 'tri-pass-three-impacts-visible']),
  }),
  'carpet-bomber': Object.freeze({
    kind: 'carpet-aircraft-bombs-impacts', cameraStrategy: 'dynamic-world-subjects', minimumSubjectCount: 1, minimumInFrameCount: 1,
    hudSelector: null, requiredMilestones: Object.freeze(['carpet-aircraft-visible', 'carpet-bombs-visible', 'carpet-impacts-visible']),
  }),
  'hunter-swarm': Object.freeze({
    kind: 'hunter-drone-flight-impacts', cameraStrategy: 'dynamic-world-subjects', minimumSubjectCount: 5, minimumInFrameCount: 5,
    hudSelector: null, requiredMilestones: Object.freeze(['hunter-five-drones-visible', 'hunter-impact-visible']),
  }),
  chopper: Object.freeze({
    kind: 'chopper-airframe', cameraStrategy: 'dynamic-world-subjects', minimumSubjectCount: 1, minimumInFrameCount: 1,
    hudSelector: null, requiredMilestones: Object.freeze(['chopper-authoritative', 'chopper-rendered']),
  }),
  'drone-swarm': Object.freeze({
    kind: 'drone-swarm-formation', cameraStrategy: 'dynamic-world-subjects', minimumSubjectCount: 24, minimumInFrameCount: 24,
    hudSelector: null, requiredMilestones: Object.freeze(['drone-swarm-24-authoritative', 'drone-swarm-24-rendered']),
  }),
  nuke: Object.freeze({
    kind: 'nuke-warning-detonation', cameraStrategy: 'bay-hud-overview', minimumSubjectCount: 0, minimumInFrameCount: 0,
    hudSelector: '#nuke-warning', requiredMilestones: Object.freeze(['nuke-warning-visible', 'nuke-detonated', 'nuke-flash-visible']),
  }),
});

type KillstreakDemoCameraPlan = Readonly<{
  azimuthRadians: number;
  elevationRatio: number;
  minimumElevationM: number;
  minimumDistanceM: number;
  fov: number;
}>;

const KILLSTREAK_DEMO_CAMERA_PLANS: Readonly<Record<SelectableKillstreakId, KillstreakDemoCameraPlan>> = Object.freeze({
  'scout-sweep': Object.freeze({ azimuthRadians: 0.62, elevationRatio: 0.2, minimumElevationM: 3.6, minimumDistanceM: 24, fov: 68 }),
  adrenaline: Object.freeze({ azimuthRadians: -0.58, elevationRatio: 0.16, minimumElevationM: 2.8, minimumDistanceM: 20, fov: 62 }),
  'care-package': Object.freeze({ azimuthRadians: 0.78, elevationRatio: 0.22, minimumElevationM: 4, minimumDistanceM: 16, fov: 72 }),
  yardhawk: Object.freeze({ azimuthRadians: -0.82, elevationRatio: 0.14, minimumElevationM: 2.4, minimumDistanceM: 8, fov: 58 }),
  'piloted-drone': Object.freeze({ azimuthRadians: 0.42, elevationRatio: 0.14, minimumElevationM: 2.2, minimumDistanceM: 8, fov: 54 }),
  'tri-pass': Object.freeze({ azimuthRadians: -0.52, elevationRatio: 0.28, minimumElevationM: 5, minimumDistanceM: 18, fov: 70 }),
  'carpet-bomber': Object.freeze({ azimuthRadians: 0.92, elevationRatio: 0.24, minimumElevationM: 5, minimumDistanceM: 22, fov: 74 }),
  'hunter-swarm': Object.freeze({ azimuthRadians: -0.34, elevationRatio: 0.2, minimumElevationM: 3.2, minimumDistanceM: 13, fov: 66 }),
  chopper: Object.freeze({ azimuthRadians: 0.68, elevationRatio: 0.18, minimumElevationM: 3, minimumDistanceM: 11, fov: 58 }),
  'drone-swarm': Object.freeze({ azimuthRadians: -0.72, elevationRatio: 0.24, minimumElevationM: 4, minimumDistanceM: 18, fov: 74 }),
  nuke: Object.freeze({ azimuthRadians: 0.18, elevationRatio: 0.24, minimumElevationM: 5.2, minimumDistanceM: 28, fov: 72 }),
});

export type KillstreakDemoWorldPoint = readonly [number, number, number];

export type KillstreakDemoCameraPose = Readonly<{
  strategy: KillstreakDemoCameraStrategy;
  position: KillstreakDemoWorldPoint;
  target: KillstreakDemoWorldPoint;
  yaw: number;
  pitch: number;
  fov: number;
}>;

export type KillstreakDemoProjectedSubject = Readonly<{
  id: string;
  worldPosition: KillstreakDemoWorldPoint;
  ndcX: number;
  ndcY: number;
  depthM: number;
}>;

function finitePoint(value: readonly number[]): value is KillstreakDemoWorldPoint {
  return value.length === 3 && value.every(Number.isFinite);
}

function approximatelyEqual(left: number, right: number, tolerance = 0.001): boolean {
  return Math.abs(left - right) <= tolerance;
}

function approximatelyEqualPoint(left: KillstreakDemoWorldPoint, right: KillstreakDemoWorldPoint): boolean {
  return left.every((value, axis) => approximatelyEqual(value, right[axis]!));
}

function normalize3(value: KillstreakDemoWorldPoint): KillstreakDemoWorldPoint {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!(length > 0)) throw new TypeError('camera vector must have non-zero length');
  return Object.freeze([value[0] / length, value[1] / length, value[2] / length]);
}

function cross3(left: KillstreakDemoWorldPoint, right: KillstreakDemoWorldPoint): KillstreakDemoWorldPoint {
  return Object.freeze([
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]);
}

function dot3(left: KillstreakDemoWorldPoint, right: KillstreakDemoWorldPoint): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function projectKillstreakDemoWorldPoint(
  pose: KillstreakDemoCameraPose,
  point: KillstreakDemoWorldPoint,
): Readonly<{ ndcX: number; ndcY: number; depthM: number }> {
  const forward = normalize3(Object.freeze([
    pose.target[0] - pose.position[0],
    pose.target[1] - pose.position[1],
    pose.target[2] - pose.position[2],
  ]));
  const right = normalize3(cross3(forward, Object.freeze([0, 1, 0])));
  const up = normalize3(cross3(right, forward));
  const relative = Object.freeze([
    point[0] - pose.position[0],
    point[1] - pose.position[1],
    point[2] - pose.position[2],
  ]) as KillstreakDemoWorldPoint;
  const depthM = dot3(relative, forward);
  const verticalTangent = Math.tan(pose.fov * Math.PI / 360);
  const aspect = KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width / KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height;
  return Object.freeze({
    ndcX: dot3(relative, right) / (depthM * verticalTangent * aspect),
    ndcY: dot3(relative, up) / (depthM * verticalTangent),
    depthM,
  });
}

export function resolveKillstreakDemoCameraPose(
  id: SelectableKillstreakId,
  subjectPositions: readonly KillstreakDemoWorldPoint[],
): KillstreakDemoCameraPose {
  if (subjectPositions.length === 0 || subjectPositions.some((point) => !finitePoint(point))) {
    throw new TypeError(`${id} camera framing requires finite runtime subject positions`);
  }
  const plan = KILLSTREAK_DEMO_CAMERA_PLANS[id];
  const minimum = [0, 1, 2].map((axis) => Math.min(...subjectPositions.map((point) => point[axis]!)));
  const maximum = [0, 1, 2].map((axis) => Math.max(...subjectPositions.map((point) => point[axis]!)));
  const target = Object.freeze([
    (minimum[0]! + maximum[0]!) / 2,
    (minimum[1]! + maximum[1]!) / 2,
    (minimum[2]! + maximum[2]!) / 2,
  ]) as KillstreakDemoWorldPoint;
  const radius = Math.max(0.5, ...subjectPositions.map((point) => Math.hypot(
    point[0] - target[0], point[1] - target[1], point[2] - target[2],
  )));
  let distance = Math.max(plan.minimumDistanceM, radius * 2.8);
  let pose: KillstreakDemoCameraPose | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const elevation = Math.max(plan.minimumElevationM, distance * plan.elevationRatio);
    const horizontalDistance = Math.sqrt(Math.max(1, distance * distance - elevation * elevation));
    const position = Object.freeze([
      target[0] + Math.sin(plan.azimuthRadians) * horizontalDistance,
      target[1] + elevation,
      target[2] + Math.cos(plan.azimuthRadians) * horizontalDistance,
    ]) as KillstreakDemoWorldPoint;
    pose = Object.freeze({
      strategy: KILLSTREAK_DEMO_VISUAL_REQUIREMENTS[id].cameraStrategy,
      position,
      target,
      yaw: Math.atan2(position[0] - target[0], position[2] - target[2]),
      pitch: Math.atan2(target[1] - position[1], horizontalDistance),
      fov: plan.fov,
    });
    const projections = subjectPositions.map((point) => projectKillstreakDemoWorldPoint(pose!, point));
    if (projections.every(({ ndcX, ndcY, depthM }) => depthM > 0 && Math.abs(ndcX) <= 0.82 && Math.abs(ndcY) <= 0.82)) return pose;
    distance *= 1.35;
  }
  return pose!;
}

export type KillstreakDemoRuntimeCadenceSample = Readonly<{
  elapsedMs: number;
  presentedFrame: number;
}>;

export type KillstreakDemoRuntimeCadence = Readonly<{
  durationMs: number;
  frameCountStart: number;
  frameCountEnd: number;
  presentedFrameStart: number;
  presentedFrameEnd: number;
  averagePresentedFps: number;
  p95PresentedGapMs: number;
  maximumPresentedGapMs: number;
  samples: readonly KillstreakDemoRuntimeCadenceSample[];
}>;

export function summarizeKillstreakDemoRuntimeCadence(input: Readonly<{
  durationMs: number;
  presentedFrameStart: number;
  presentedFrameEnd: number;
  samples: readonly KillstreakDemoRuntimeCadenceSample[];
}>): Readonly<{ averagePresentedFps: number; p95PresentedGapMs: number; maximumPresentedGapMs: number }> {
  const frameDelta = input.presentedFrameEnd - input.presentedFrameStart;
  const averagePresentedFps = input.durationMs > 0 ? frameDelta / input.durationMs * 1_000 : 0;
  const intervals: number[] = [];
  for (let index = 1; index < input.samples.length; index += 1) {
    const previous = input.samples[index - 1]!;
    const current = input.samples[index]!;
    const advanced = current.presentedFrame - previous.presentedFrame;
    if (advanced <= 0) continue;
    const interval = (current.elapsedMs - previous.elapsedMs) / advanced;
    for (let ordinal = 0; ordinal < advanced; ordinal += 1) intervals.push(interval);
  }
  const sorted = [...intervals].sort((left, right) => left - right);
  const percentileIndex = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return Object.freeze({
    averagePresentedFps: Number(averagePresentedFps.toFixed(3)),
    p95PresentedGapMs: Number((sorted[percentileIndex] ?? input.durationMs).toFixed(3)),
    maximumPresentedGapMs: Number((sorted.at(-1) ?? input.durationMs).toFixed(3)),
  });
}

export type KillstreakDemoCaptureSourceInput = Readonly<{
  path: string;
  sha256: string;
}>;

export type KillstreakDemoCaptureEntry = Readonly<{
  id: SelectableKillstreakId;
  artifactPath: string;
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
  videoArtifactPath: string;
  videoSha256: string;
  videoSizeBytes: number;
  videoWidth: number;
  videoHeight: number;
  videoDurationMs: number;
  videoFrameCount: number;
  videoSampleFrameSha256: readonly [string, string, string];
  videoMotionFrameCount: number;
  videoNearDuplicateFrameCount: number;
  videoNearDuplicateFrameRatio: number;
  videoLongestNearDuplicateRun: number;
  videoCodec: 'h264';
  videoProfile: 'High';
  videoContainer: 'mp4';
  videoPixelFormat: 'yuv420p';
  videoFastStart: true;
  videoHasAudio: false;
  videoActivationOffsetMs: number;
  videoVisualProofOffsetMs: number;
  recordingContextId: string;
  rawRecordingSha256: string;
  fCandidateTargetId: string;
  fCommitTargetId: string;
  revisionBefore: number;
  revisionAfter: number;
  proof: Readonly<{
    kind: KillstreakDemoProofKind;
    count: number;
    activationIds: readonly string[];
  }>;
  runtimeHealth: Readonly<{
    bootstrapStage: 'ready';
    bootstrapError: null;
    matchPhase: 'active';
    arenaId: 'gun-range';
    actualBackend: 'webgl2';
    webglVersion: string;
    softwareAdapter: false;
    contextLost: false;
    presentationStatus: 'synchronous' | 'healthy';
    runtimeErrorVisible: false;
  }>;
  cameraPose: KillstreakDemoCameraPose;
  visualProof: Readonly<{
    kind: KillstreakDemoVisualProofKind;
    sampledAtPresentedFrame: number;
    subjectCount: number;
    inFrameCount: number;
    subjects: readonly KillstreakDemoProjectedSubject[];
    hudRegion: Readonly<{
      selector: string;
      left: number;
      top: number;
      width: number;
      height: number;
      visible: true;
    }> | null;
    milestones: readonly string[];
  }>;
  runtimeCadence: KillstreakDemoRuntimeCadence;
}>;

export type KillstreakDemoCaptureReceipt = Readonly<{
  schemaVersion: 5;
  captureKind: 'real-gun-range-test-bay-runtime';
  capturedAt: string;
  gitHead: string;
  servedSourceSha: string;
  servedRuntimeTreeSha256: string;
  servedRuntimeFileCount: number;
  browserName: 'Google Chrome';
  browserVersion: string;
  encoderName: 'ffmpeg/libx264';
  encoderVersion: string;
  renderer: 'webgl2';
  route: string;
  seed: 'pass66-killstreak-demo';
  viewport: Readonly<{ width: number; height: number }>;
  sourceClosureSha256: string;
  sourceInputs: readonly KillstreakDemoCaptureSourceInput[];
  captures: readonly KillstreakDemoCaptureEntry[];
  pageErrors: readonly string[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string, errors: string[]): void {
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  const unknown = actual.filter((key) => !expected.includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    errors.push(`${label} keys invalid; missing=[${missing.join(',')}] unknown=[${unknown.join(',')}]`);
  }
}

function validSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

export function validateKillstreakDemoCaptureReceipt(value: unknown): readonly string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return Object.freeze(['receipt must be an object']);
  exactKeys(value, [
    'schemaVersion', 'captureKind', 'capturedAt', 'gitHead', 'servedSourceSha',
    'servedRuntimeTreeSha256', 'servedRuntimeFileCount', 'browserName', 'browserVersion',
    'encoderName', 'encoderVersion', 'renderer', 'route', 'seed', 'viewport', 'sourceInputs',
    'sourceClosureSha256', 'captures', 'pageErrors',
  ], 'receipt', errors);
  if (value.schemaVersion !== KILLSTREAK_DEMO_CAPTURE_SCHEMA_VERSION) errors.push('receipt schemaVersion mismatch');
  if (value.captureKind !== 'real-gun-range-test-bay-runtime') errors.push('receipt captureKind must identify the real test-bay runtime');
  if (typeof value.capturedAt !== 'string' || Number.isNaN(Date.parse(value.capturedAt))) errors.push('receipt capturedAt must be ISO-compatible');
  if (typeof value.gitHead !== 'string' || !/^[a-f0-9]{40}$/u.test(value.gitHead)) errors.push('receipt gitHead must be a full SHA');
  if (typeof value.servedSourceSha !== 'string' || !/^[a-f0-9]{40}$/u.test(value.servedSourceSha)) {
    errors.push('receipt servedSourceSha must be a full SHA');
  } else if (value.servedSourceSha !== value.gitHead) {
    errors.push('receipt servedSourceSha must equal the clean capture gitHead');
  }
  if (!validSha256(value.servedRuntimeTreeSha256)) errors.push('receipt servedRuntimeTreeSha256 is invalid');
  if (!Number.isSafeInteger(value.servedRuntimeFileCount) || (value.servedRuntimeFileCount as number) <= 0) {
    errors.push('receipt servedRuntimeFileCount is invalid');
  }
  if (value.browserName !== 'Google Chrome') errors.push('receipt must identify installed Google Chrome');
  if (typeof value.browserVersion !== 'string' || !/^\d+(?:\.\d+){1,3}$/u.test(value.browserVersion)) {
    errors.push('receipt browserVersion is invalid');
  }
  if (value.encoderName !== 'ffmpeg/libx264') errors.push('receipt encoderName mismatch');
  if (typeof value.encoderVersion !== 'string' || !/^ffmpeg version \S+/u.test(value.encoderVersion)) {
    errors.push('receipt encoderVersion is invalid');
  }
  if (value.renderer !== 'webgl2') errors.push('receipt renderer must be webgl2');
  if (value.route !== KILLSTREAK_DEMO_CAPTURE_ROUTE) errors.push('receipt route mismatch');
  if (value.seed !== 'pass66-killstreak-demo') errors.push('receipt seed mismatch');
  if (!isRecord(value.viewport)
    || value.viewport.width !== KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width
    || value.viewport.height !== KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height) errors.push('receipt viewport mismatch');
  if (!Array.isArray(value.pageErrors) || value.pageErrors.length > 0) errors.push('receipt pageErrors must be an empty array');
  if (!validSha256(value.sourceClosureSha256)) errors.push('receipt sourceClosureSha256 is invalid');

  if (!Array.isArray(value.sourceInputs) || value.sourceInputs.length < KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS.length) {
    errors.push(`receipt requires at least ${KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS.length} bound source inputs`);
  } else {
    const sourcePaths = new Set<string>();
    const orderedSourcePaths: string[] = [];
    for (const [index, input] of value.sourceInputs.entries()) {
      if (!isRecord(input)) {
        errors.push(`sourceInputs[${index}] must be an object`);
        continue;
      }
      exactKeys(input, ['path', 'sha256'], `sourceInputs[${index}]`, errors);
      const inputPath = typeof input.path === 'string' ? input.path : '';
      const pathAllowed = inputPath !== ''
        && !inputPath.includes('\\')
        && !inputPath.split('/').some((part) => !part || part === '.' || part === '..')
        && (KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS.includes(inputPath as typeof KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS[number])
          || KILLSTREAK_DEMO_CAPTURE_SOURCE_ROOTS.some((root) => inputPath.startsWith(`${root}/`)))
        && !KILLSTREAK_DEMO_CAPTURE_EXCLUDED_SOURCE_PREFIXES.some((prefix) => inputPath.startsWith(prefix));
      if (!pathAllowed) {
        errors.push(`sourceInputs[${index}] path invalid`);
      } else if (sourcePaths.has(inputPath)) {
        errors.push(`source input duplicated: ${inputPath}`);
      } else {
        sourcePaths.add(inputPath);
        orderedSourcePaths.push(inputPath);
      }
      if (!validSha256(input.sha256)) errors.push(`sourceInputs[${index}] sha256 invalid`);
    }
    if (KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS.some((path) => !sourcePaths.has(path))) {
      errors.push('receipt sourceInputs do not bind every fixed capture/build/topology recipe input');
    }
    if (KILLSTREAK_DEMO_CAPTURE_SOURCE_ROOTS.some((root) => (
      !orderedSourcePaths.some((path) => path.startsWith(`${root}/`))
    ))) {
      errors.push('receipt sourceInputs must bind every recursive source root');
    }
    if (orderedSourcePaths.join('\n') !== [...orderedSourcePaths].sort().join('\n')) {
      errors.push('receipt sourceInputs must be sorted by repository path');
    }
  }

  if (!Array.isArray(value.captures)) return Object.freeze([...errors, 'receipt captures must be an array']);
  const expectedIds = [...KILLSTREAK_DEMO_CAPTURE_IDS];
  const actualIds: string[] = [];
  const captureDigests = new Set<string>();
  const videoDigests = new Set<string>();
  const rawRecordingDigests = new Set<string>();
  const recordingContextIds = new Set<string>();
  for (const [index, capture] of value.captures.entries()) {
    if (!isRecord(capture)) {
      errors.push(`captures[${index}] must be an object`);
      continue;
    }
    exactKeys(capture, [
      'id', 'artifactPath', 'sha256', 'sizeBytes', 'width', 'height', 'videoArtifactPath',
      'videoSha256', 'videoSizeBytes', 'videoWidth', 'videoHeight', 'videoDurationMs',
      'videoFrameCount', 'videoSampleFrameSha256', 'videoMotionFrameCount', 'videoNearDuplicateFrameCount',
      'videoNearDuplicateFrameRatio', 'videoLongestNearDuplicateRun', 'videoCodec', 'videoProfile',
      'videoContainer', 'videoPixelFormat', 'videoFastStart', 'videoHasAudio', 'videoActivationOffsetMs',
      'videoVisualProofOffsetMs', 'recordingContextId', 'rawRecordingSha256', 'fCandidateTargetId',
      'fCommitTargetId', 'revisionBefore', 'revisionAfter', 'proof', 'runtimeHealth', 'cameraPose',
      'visualProof', 'runtimeCadence',
    ], `captures[${index}]`, errors);
    const id = capture.id;
    if (typeof id !== 'string' || !expectedIds.includes(id as SelectableKillstreakId)) {
      errors.push(`captures[${index}] has unknown id`);
      continue;
    }
    actualIds.push(id);
    const expectedTargetId = `test-bay-support:${id}`;
    if (capture.fCandidateTargetId !== expectedTargetId) errors.push(`${id} F candidate did not target its station`);
    if (capture.fCommitTargetId !== expectedTargetId) errors.push(`${id} F commit did not target its station`);
    const expectedArtifactPath = `artifacts/pass66/killstreak-demo-capture/staged/${id}.jpg`;
    if (capture.artifactPath !== expectedArtifactPath) errors.push(`${id} artifactPath invalid`);
    if (!validSha256(capture.sha256)) errors.push(`${id} sha256 invalid`);
    else if (captureDigests.has(capture.sha256)) errors.push(`${id} capture is byte-identical to another support`);
    else captureDigests.add(capture.sha256);
    if (!Number.isSafeInteger(capture.sizeBytes) || (capture.sizeBytes as number) < 12_000) errors.push(`${id} capture is implausibly small`);
    if (capture.width !== KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width
      || capture.height !== KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height) errors.push(`${id} dimensions mismatch`);
    const expectedVideoArtifactPath = `artifacts/pass66/killstreak-demo-capture/staged/${id}.mp4`;
    if (capture.videoArtifactPath !== expectedVideoArtifactPath) errors.push(`${id} videoArtifactPath invalid`);
    if (!validSha256(capture.videoSha256)) errors.push(`${id} videoSha256 invalid`);
    else if (videoDigests.has(capture.videoSha256)) errors.push(`${id} video is byte-identical to another support`);
    else videoDigests.add(capture.videoSha256);
    if (!Number.isSafeInteger(capture.videoSizeBytes)
      || (capture.videoSizeBytes as number) < 50_000
      || (capture.videoSizeBytes as number) > 3_000_000) errors.push(`${id} video size is outside the compact media budget`);
    if (capture.videoWidth !== KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width
      || capture.videoHeight !== KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height) errors.push(`${id} video dimensions mismatch`);
    const expectedDurationMs = KILLSTREAK_DEMO_CLIP_DURATION_MS[id as SelectableKillstreakId];
    if (typeof capture.videoDurationMs !== 'number'
      || Math.abs(capture.videoDurationMs - expectedDurationMs) > 650) errors.push(`${id} video duration is outside the authored tail window`);
    if (!Number.isSafeInteger(capture.videoFrameCount)
      || (capture.videoFrameCount as number) < Math.floor(expectedDurationMs / 1_000 * 24)) {
      errors.push(`${id} video frame count is implausibly low`);
    }
    if (!Array.isArray(capture.videoSampleFrameSha256)
      || capture.videoSampleFrameSha256.length !== 3
      || capture.videoSampleFrameSha256.some((digest) => !validSha256(digest))) {
      errors.push(`${id} decoded video sample digests invalid`);
    } else if (new Set(capture.videoSampleFrameSha256).size < 2) {
      errors.push(`${id} video is frozen across decoded samples`);
    }
    const encodedTransitions = Number.isSafeInteger(capture.videoFrameCount)
      ? Math.max(0, (capture.videoFrameCount as number) - 1)
      : 0;
    if (!Number.isSafeInteger(capture.videoMotionFrameCount)
      || !Number.isSafeInteger(capture.videoNearDuplicateFrameCount)
      || (capture.videoMotionFrameCount as number) < 0
      || (capture.videoNearDuplicateFrameCount as number) < 0
      || (capture.videoMotionFrameCount as number) + (capture.videoNearDuplicateFrameCount as number) !== encodedTransitions) {
      errors.push(`${id} encoded cadence frame accounting is invalid`);
    }
    const expectedDuplicateRatio = encodedTransitions > 0
      ? (capture.videoNearDuplicateFrameCount as number) / encodedTransitions
      : 1;
    if (typeof capture.videoNearDuplicateFrameRatio !== 'number'
      || Math.abs(capture.videoNearDuplicateFrameRatio - Number(expectedDuplicateRatio.toFixed(6))) > 0.000001
      || capture.videoNearDuplicateFrameRatio > KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RATIO) {
      errors.push(`${id} encoded near-duplicate frame ratio exceeds the motion budget`);
    }
    if (!Number.isSafeInteger(capture.videoLongestNearDuplicateRun)
      || (capture.videoLongestNearDuplicateRun as number) < 0
      || (capture.videoLongestNearDuplicateRun as number) > KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RUN) {
      errors.push(`${id} encoded near-duplicate run exceeds the motion budget`);
    }
    if (capture.videoCodec !== 'h264' || capture.videoProfile !== 'High' || capture.videoContainer !== 'mp4'
      || capture.videoPixelFormat !== 'yuv420p' || capture.videoFastStart !== true || capture.videoHasAudio !== false) {
      errors.push(`${id} video encoding contract mismatch`);
    }
    const videoActivationOffsetMs = typeof capture.videoActivationOffsetMs === 'number'
      ? capture.videoActivationOffsetMs
      : Number.NaN;
    if (!Number.isFinite(videoActivationOffsetMs)
      || videoActivationOffsetMs < 400 || videoActivationOffsetMs > 1_500) {
      errors.push(`${id} video does not retain a bounded pre-activation lead`);
    }
    if (typeof capture.videoVisualProofOffsetMs !== 'number'
      || capture.videoVisualProofOffsetMs < videoActivationOffsetMs
      || capture.videoVisualProofOffsetMs > 3_000) {
      errors.push(`${id} video does not establish visible subject proof near activation`);
    }
    if (typeof capture.recordingContextId !== 'string'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(capture.recordingContextId)) {
      errors.push(`${id} recordingContextId invalid`);
    } else if (recordingContextIds.has(capture.recordingContextId)) errors.push(`${id} did not use a fresh recording context`);
    else recordingContextIds.add(capture.recordingContextId);
    if (!validSha256(capture.rawRecordingSha256)) errors.push(`${id} raw recording digest invalid`);
    else if (rawRecordingDigests.has(capture.rawRecordingSha256)) errors.push(`${id} raw recording reused another context`);
    else rawRecordingDigests.add(capture.rawRecordingSha256);
    if (!Number.isSafeInteger(capture.revisionBefore) || !Number.isSafeInteger(capture.revisionAfter)
      || (capture.revisionAfter as number) <= (capture.revisionBefore as number)) errors.push(`${id} runtime revision did not advance`);
    if (!isRecord(capture.proof)) {
      errors.push(`${id} activation proof missing`);
    } else {
      exactKeys(capture.proof, ['kind', 'count', 'activationIds'], `${id}.proof`, errors);
      const expectedProof = KILLSTREAK_DEMO_EXPECTED_PROOF[id as SelectableKillstreakId];
      if (capture.proof.kind !== expectedProof.kind) errors.push(`${id} activation proof kind mismatch`);
      if (!Number.isSafeInteger(capture.proof.count) || (capture.proof.count as number) < expectedProof.minimumCount) {
        errors.push(`${id} activation proof count is below ${expectedProof.minimumCount}`);
      }
      const activationIds = capture.proof.activationIds;
      if (!Array.isArray(activationIds)
        || activationIds.some((activationId) => typeof activationId !== 'string'
          || !/^ks-activation-[0-9]+-[0-9]+$/u.test(activationId))) {
        errors.push(`${id} activation IDs invalid`);
      } else if (activationIds.length !== new Set(activationIds).size) {
        errors.push(`${id} activation IDs duplicated`);
      }
    }

    if (!isRecord(capture.runtimeHealth)) errors.push(`${id} runtime health proof missing`);
    else {
      exactKeys(capture.runtimeHealth, [
        'bootstrapStage', 'bootstrapError', 'matchPhase', 'arenaId', 'actualBackend', 'webglVersion',
        'softwareAdapter', 'contextLost', 'presentationStatus', 'runtimeErrorVisible',
      ], `${id}.runtimeHealth`, errors);
      if (capture.runtimeHealth.bootstrapStage !== 'ready' || capture.runtimeHealth.bootstrapError !== null
        || capture.runtimeHealth.matchPhase !== 'active' || capture.runtimeHealth.arenaId !== 'gun-range'
        || capture.runtimeHealth.actualBackend !== 'webgl2'
        || typeof capture.runtimeHealth.webglVersion !== 'string' || !capture.runtimeHealth.webglVersion.includes('WebGL 2')
        || capture.runtimeHealth.softwareAdapter !== false || capture.runtimeHealth.contextLost !== false
        || !['synchronous', 'healthy'].includes(String(capture.runtimeHealth.presentationStatus))
        || capture.runtimeHealth.runtimeErrorVisible !== false) {
        errors.push(`${id} renderer/admission health is not hardware WebGL2 ready`);
      }
    }

    const visualRequirement = KILLSTREAK_DEMO_VISUAL_REQUIREMENTS[id as SelectableKillstreakId];
    let validatedCameraPose: KillstreakDemoCameraPose | null = null;
    if (!isRecord(capture.cameraPose)) errors.push(`${id} support-specific camera pose missing`);
    else {
      exactKeys(capture.cameraPose, ['strategy', 'position', 'target', 'yaw', 'pitch', 'fov'], `${id}.cameraPose`, errors);
      if (capture.cameraPose.strategy !== visualRequirement.cameraStrategy
        || !Array.isArray(capture.cameraPose.position) || !finitePoint(capture.cameraPose.position as number[])
        || !Array.isArray(capture.cameraPose.target) || !finitePoint(capture.cameraPose.target as number[])
        || ![capture.cameraPose.yaw, capture.cameraPose.pitch, capture.cameraPose.fov].every(Number.isFinite)
        || !approximatelyEqual(capture.cameraPose.fov as number, KILLSTREAK_DEMO_CAMERA_PLANS[id as SelectableKillstreakId].fov)) {
        errors.push(`${id} support-specific camera pose is invalid`);
      } else {
        validatedCameraPose = {
          strategy: capture.cameraPose.strategy as KillstreakDemoCameraStrategy,
          position: capture.cameraPose.position as unknown as KillstreakDemoWorldPoint,
          target: capture.cameraPose.target as unknown as KillstreakDemoWorldPoint,
          yaw: capture.cameraPose.yaw as number,
          pitch: capture.cameraPose.pitch as number,
          fov: capture.cameraPose.fov as number,
        };
      }
    }

    if (!isRecord(capture.visualProof)) errors.push(`${id} visible subject/effect proof missing`);
    else {
      exactKeys(capture.visualProof, [
        'kind', 'sampledAtPresentedFrame', 'subjectCount', 'inFrameCount', 'subjects', 'hudRegion', 'milestones',
      ], `${id}.visualProof`, errors);
      if (capture.visualProof.kind !== visualRequirement.kind
        || !Number.isSafeInteger(capture.visualProof.sampledAtPresentedFrame)
        || (capture.visualProof.sampledAtPresentedFrame as number) <= 0
        || !Number.isSafeInteger(capture.visualProof.subjectCount)
        || !Number.isSafeInteger(capture.visualProof.inFrameCount)) {
        errors.push(`${id} visible subject/effect proof identity is invalid`);
      }
      const subjects = capture.visualProof.subjects;
      let computedInFrame = 0;
      const subjectPositions: KillstreakDemoWorldPoint[] = [];
      if (!Array.isArray(subjects) || subjects.length !== capture.visualProof.subjectCount) {
        errors.push(`${id} visual subject roster is invalid`);
      } else {
        const subjectIds = new Set<string>();
        for (const [subjectIndex, subject] of subjects.entries()) {
          if (!isRecord(subject)) {
            errors.push(`${id}.visualProof.subjects[${subjectIndex}] must be an object`);
            continue;
          }
          exactKeys(subject, ['id', 'worldPosition', 'ndcX', 'ndcY', 'depthM'], `${id}.visualProof.subjects[${subjectIndex}]`, errors);
          if (typeof subject.id !== 'string' || subject.id.length === 0 || subjectIds.has(subject.id)) {
            errors.push(`${id} visual subject IDs are invalid or duplicated`);
          } else subjectIds.add(subject.id);
          if (!Array.isArray(subject.worldPosition) || !finitePoint(subject.worldPosition as number[])
            || ![subject.ndcX, subject.ndcY, subject.depthM].every(Number.isFinite)
            || (subject.depthM as number) <= 0) errors.push(`${id} projected visual subject is invalid`);
          else {
            const worldPosition = subject.worldPosition as unknown as KillstreakDemoWorldPoint;
            subjectPositions.push(worldPosition);
            if (validatedCameraPose) {
              const projected = projectKillstreakDemoWorldPoint(validatedCameraPose, worldPosition);
              if (!approximatelyEqual(projected.ndcX, subject.ndcX as number)
                || !approximatelyEqual(projected.ndcY, subject.ndcY as number)
                || !approximatelyEqual(projected.depthM, subject.depthM as number)) {
                errors.push(`${id} stored visual subject projection does not match its camera pose`);
              }
              if (projected.depthM > 0 && Math.abs(projected.ndcX) <= 0.9 && Math.abs(projected.ndcY) <= 0.9) {
                computedInFrame += 1;
              }
            }
          }
        }
      }
      if (visualRequirement.cameraStrategy === 'dynamic-world-subjects'
        && validatedCameraPose && subjectPositions.length >= visualRequirement.minimumSubjectCount) {
        const expectedPose = resolveKillstreakDemoCameraPose(id as SelectableKillstreakId, subjectPositions);
        if (!approximatelyEqualPoint(validatedCameraPose.position, expectedPose.position)
          || !approximatelyEqualPoint(validatedCameraPose.target, expectedPose.target)
          || !approximatelyEqual(validatedCameraPose.yaw, expectedPose.yaw)
          || !approximatelyEqual(validatedCameraPose.pitch, expectedPose.pitch)
          || !approximatelyEqual(validatedCameraPose.fov, expectedPose.fov)) {
          errors.push(`${id} camera pose does not match its support-specific runtime-subject solver`);
        }
      }
      if ((capture.visualProof.subjectCount as number) < visualRequirement.minimumSubjectCount
        || capture.visualProof.inFrameCount !== computedInFrame
        || computedInFrame < visualRequirement.minimumInFrameCount) {
        errors.push(`${id} does not visibly frame enough canonical subjects`);
      }
      if (visualRequirement.hudSelector === null) {
        if (capture.visualProof.hudRegion !== null) errors.push(`${id} world-subject proof must not substitute a HUD region`);
      } else if (!isRecord(capture.visualProof.hudRegion)) errors.push(`${id} required HUD effect region is missing`);
      else {
        exactKeys(capture.visualProof.hudRegion, ['selector', 'left', 'top', 'width', 'height', 'visible'], `${id}.visualProof.hudRegion`, errors);
        const region = capture.visualProof.hudRegion;
        if (region.selector !== visualRequirement.hudSelector || region.visible !== true
          || ![region.left, region.top, region.width, region.height].every(Number.isFinite)
          || (region.width as number) < 20 || (region.height as number) < 20
          || (region.left as number) < 0 || (region.top as number) < 0
          || (region.left as number) + (region.width as number) > KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width + 1
          || (region.top as number) + (region.height as number) > KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height + 1) {
          errors.push(`${id} required HUD effect is not visibly inside the capture viewport`);
        }
      }
      if (!Array.isArray(capture.visualProof.milestones)
        || capture.visualProof.milestones.join('\n') !== visualRequirement.requiredMilestones.join('\n')) {
        errors.push(`${id} visible effect milestones are incomplete or out of canonical order`);
      }
    }

    if (!isRecord(capture.runtimeCadence)) errors.push(`${id} presented-frame cadence proof missing`);
    else {
      exactKeys(capture.runtimeCadence, [
        'durationMs', 'frameCountStart', 'frameCountEnd', 'presentedFrameStart', 'presentedFrameEnd',
        'averagePresentedFps', 'p95PresentedGapMs', 'maximumPresentedGapMs', 'samples',
      ], `${id}.runtimeCadence`, errors);
      const cadence = capture.runtimeCadence;
      const samples = Array.isArray(cadence.samples) ? cadence.samples : [];
      const cadenceSamples: KillstreakDemoRuntimeCadenceSample[] = [];
      const cadenceNumbers = [
        cadence.durationMs, cadence.frameCountStart, cadence.frameCountEnd, cadence.presentedFrameStart,
        cadence.presentedFrameEnd, cadence.averagePresentedFps, cadence.p95PresentedGapMs, cadence.maximumPresentedGapMs,
      ];
      let samplesValid = samples.length >= 2;
      if (samplesValid) {
        for (const [sampleIndex, sample] of samples.entries()) {
          if (!isRecord(sample)) {
            samplesValid = false;
            errors.push(`${id}.runtimeCadence.samples[${sampleIndex}] must be an object`);
            continue;
          }
          exactKeys(sample, ['elapsedMs', 'presentedFrame'], `${id}.runtimeCadence.samples[${sampleIndex}]`, errors);
          const elapsedMs = typeof sample.elapsedMs === 'number' ? sample.elapsedMs : Number.NaN;
          const presentedFrame = typeof sample.presentedFrame === 'number' ? sample.presentedFrame : Number.NaN;
          const previous = cadenceSamples.at(-1);
          if (!Number.isFinite(elapsedMs) || !Number.isSafeInteger(presentedFrame)
            || elapsedMs < 0 || elapsedMs > (cadence.durationMs as number) + 5
            || previous && (!(elapsedMs > previous.elapsedMs) || !(presentedFrame > previous.presentedFrame))) {
            samplesValid = false;
            errors.push(`${id} runtime cadence samples are not strictly monotonic`);
            continue;
          }
          cadenceSamples.push({ elapsedMs, presentedFrame });
        }
      }
      if (!cadenceNumbers.every(Number.isFinite) || !Number.isSafeInteger(cadence.frameCountStart)
        || !Number.isSafeInteger(cadence.frameCountEnd) || !Number.isSafeInteger(cadence.presentedFrameStart)
        || !Number.isSafeInteger(cadence.presentedFrameEnd)
        || (cadence.durationMs as number) < expectedDurationMs - 250
        || (cadence.frameCountEnd as number) <= (cadence.frameCountStart as number)
        || (cadence.presentedFrameEnd as number) <= (cadence.presentedFrameStart as number)
        || !samplesValid) {
        errors.push(`${id} runtime cadence envelope is invalid`);
      } else {
        const summary = summarizeKillstreakDemoRuntimeCadence({
          durationMs: cadence.durationMs as number,
          presentedFrameStart: cadence.presentedFrameStart as number,
          presentedFrameEnd: cadence.presentedFrameEnd as number,
          samples: cadenceSamples,
        });
        if (Math.abs(summary.averagePresentedFps - (cadence.averagePresentedFps as number)) > 0.001
          || Math.abs(summary.p95PresentedGapMs - (cadence.p95PresentedGapMs as number)) > 0.001
          || Math.abs(summary.maximumPresentedGapMs - (cadence.maximumPresentedGapMs as number)) > 0.001) {
          errors.push(`${id} runtime cadence summary does not match its frame-time samples`);
        }
        if (summary.averagePresentedFps < KILLSTREAK_DEMO_MINIMUM_PRESENTED_FPS
          || summary.p95PresentedGapMs > KILLSTREAK_DEMO_MAXIMUM_P95_PRESENTED_GAP_MS
          || summary.maximumPresentedGapMs > KILLSTREAK_DEMO_MAXIMUM_PRESENTED_GAP_MS) {
          errors.push(`${id} runtime presented-frame cadence is below the capture budget`);
        }
      }
    }
  }
  if (actualIds.length !== expectedIds.length || new Set(actualIds).size !== expectedIds.length
    || expectedIds.some((id) => !actualIds.includes(id))) errors.push('captures must cover every canonical killstreak exactly once');
  return Object.freeze(errors);
}

export function killstreakDemoPosterPath(id: SelectableKillstreakId): string {
  return `./assets/original/killstreak-demo/${id}.jpg`;
}

export function killstreakDemoVideoPath(id: SelectableKillstreakId): string {
  return `./assets/original/killstreak-demo/${id}.mp4`;
}
