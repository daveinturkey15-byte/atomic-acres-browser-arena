import choreographyJson from '../../source-assets/menu/pass65-preview-masters/choreography.json';
import highSeasChoreographyJson from '../../source-assets/menu/pass75-high-seas-preview/choreography.json';
import farcrysisChoreographyJson from '../../source-assets/menu/pass77-farcrysis-preview/choreography.json';
import testArenasChoreographyJson from '../../source-assets/menu/pass79-test-arena-previews/choreography.json';
import map3ChoreographyJson from '../../source-assets/menu/pass84-map3-preview/choreography.json';
import nuketown2ChoreographyJson from '../../source-assets/menu/pass85-nuketown2-preview/choreography.json';
import raid2ChoreographyJson from '../../source-assets/menu/pass87-raid2-preview/choreography.json';
import type { ArenaId } from '../map-selection';

// Deterministic evaluator for authoring/tests only. The menu runtime consumes
// the rendered WebM/MP4/poster set and never constructs this camera or an arena.

export type MenuPreviewFrame = 'helicopter' | 'cat';
type Vector3Tuple = readonly [number, number, number];

type Bounds = Readonly<{
  x: readonly [number, number];
  y: readonly [number, number];
  z: readonly [number, number];
}>;

type ArenaRecipeBase = Readonly<{
  kind: MenuPreviewFrame;
  label: string;
  presentationId: string;
  seed: number;
  fovDegrees: number;
  posterFrame: number;
  safeVolume: Bounds;
  reviewLabel: string;
}>;

type HelicopterRecipe = ArenaRecipeBase & Readonly<{
  kind: 'helicopter';
  cockpitAssetId: 'pass66-compact-cockpit-overlay-v1';
  centre: Vector3Tuple;
  radius: readonly [number, number];
  altitudeM: number;
  lookAt: Vector3Tuple;
  phaseRadians: number;
}>;

type CatRecipe = ArenaRecipeBase & Readonly<{
  kind: 'cat';
  path: readonly Vector3Tuple[];
  lookAtPath: readonly Vector3Tuple[];
  momentLabels: readonly string[];
  motionBounds: Readonly<{
    maximumLinearSpeedMps: number;
    maximumLinearAccelerationMps2: number;
    maximumAngularVelocityRadPerSecond: number;
    maximumAngularAccelerationRadPerSecond2: number;
  }>;
}>;

type ArenaRecipe = HelicopterRecipe | CatRecipe;
type ChoreographyRecipe = Readonly<{
  schemaVersion: 4;
  recipeId: string;
  fps: number;
  durationSeconds: number;
  frameCount: number;
  reviewFrames: readonly number[];
  helicopter: Readonly<{
    varianceAlgorithm: 'xorshift32-cyclic-quintic-hold-v1';
    segmentCount: number;
    holdFraction: number;
    rotorTurnsPerLoop: number;
    rotorPresentation: Readonly<{
      id: 'perspective-elliptic-cockpit-rotor-rig-v1';
      mainTurnsPerLoop: number;
      tailTurnsPerLoop: number;
      mainDiscPitchDegrees: number;
      mainStageTopPercent: number;
      mainStageWidthPercent: number;
      mainStageHeightPercent: number;
      mainBladeCount: 4;
      mainArcCount: 3;
      mainBladeMode: 'elliptic-motion-arcs-with-subdued-spokes-v1';
      mainContrastMode: 'graphite-low-contrast-motion-v1';
      mainFilledDisc: false;
      mainMinimumLegibleBladeSweeps: 2;
      mainMinimumProjectedBladeLengthPixels: number;
      mainMinimumProjectedSweepSpanPixels: number;
      mainMinimumProjectedArcSpanPixels: number;
      mainMinimumAuthoredBladeThicknessPixels: number;
      mainMinimumBladeOpacity: number;
      mainMaximumBladeOpacity: number;
      mainMinimumScreenWidthFraction: number;
      mainMaximumScreenWidthFraction: number;
      mainMinimumScreenHeightFraction: number;
      mainMaximumScreenHeightFraction: number;
      mainMinimumScreenAreaFraction: number;
      mainMaximumScreenAreaFraction: number;
      mainMaximumStageTopFraction: number;
      mainMinimumStageBottomFraction: number;
      mainMaximumStageBottomFraction: number;
      mainMaximumPoseShiftPixels: number;
      mainMaximumVerticalPoseShiftPixels: number;
      mainMaximumPoseBankDegrees: number;
      mainMaximumDiscPitchResponseDegrees: number;
      mainMaximumDiscYawResponseDegrees: number;
      mainMinimumHubDiameterPixels: number;
      mainMinimumHubCanopyOverlapPixels: number;
      mainMaximumHubCanopyOcclusionFraction: number;
      mainMinimumMastCanopyOverlapPixels: number;
      mainCanopyHeaderWidthPercent: number;
      tailDiscYawDegrees: number;
      mainMotionBlurTrailCount: 2;
      mainNearTrailDegrees: number;
      mainFarTrailDegrees: number;
      mainMotionBlurOpacity: number;
      poseResponsive: true;
      tailCameraReflection: true;
      occlusionLayers: readonly ['mast-hub', 'canopy-header', 'tail-boom'];
    }>;
    maximumPitchDegrees: number;
    maximumYawDegrees: number;
    maximumBankDegrees: number;
    maximumAltitudeOffsetM: number;
    maximumDirectionBiasDegrees: number;
    maximumRadiusScaleDelta: number;
    maximumLinearSpeedMps: number;
    maximumLinearAccelerationMps2: number;
    maximumAngularVelocityRadPerSecond: number;
    maximumAngularAccelerationRadPerSecond2: number;
  }>;
  arenas: Readonly<Record<ArenaId, ArenaRecipe>>;
}>;

const RETAINED_CHOREOGRAPHY = choreographyJson as unknown as ChoreographyRecipe;
const HIGH_SEAS_CHOREOGRAPHY = highSeasChoreographyJson as unknown as Readonly<{
  recipeId: string;
  arenas: Readonly<{ 'high-seas': HelicopterRecipe }>;
}>;
// HF-372: farcrysis had no camera recipe at all, so the menu could only ever
// show a "PREVIEW STANDBY" placeholder for it. Its recipe lives in its own
// extension file for the same reason high-seas does: the Pass 66 masters
// choreography is digest-pinned by the retained production gate, so a new
// arena is added beside it rather than by rewriting accepted history.
const FARCRYSIS_CHOREOGRAPHY = farcrysisChoreographyJson as unknown as Readonly<{
  recipeId: string;
  arenas: Readonly<{ farcrysis: HelicopterRecipe }>;
}>;
// Test1/Test2 (owner 2026-08-30): same extension pattern — the Pass 66 masters
// choreography stays digest-pinned, so the new arenas ride beside it.
const TEST_ARENAS_CHOREOGRAPHY = testArenasChoreographyJson as unknown as Readonly<{
  recipeId: string;
  arenas: Readonly<{ test1: HelicopterRecipe; test2: HelicopterRecipe }>;
}>;
// MAP3 (owner 2026-09-02, HF-405): same extension pattern again. The camera
// recipe is authored here even though no media has been captured against it
// yet - a card cannot leave standby without one, and authoring it now is what
// makes the capture a mechanical step rather than a design step.
const MAP3_CHOREOGRAPHY = map3ChoreographyJson as unknown as Readonly<{
  recipeId: string;
  arenas: Readonly<{ map3: HelicopterRecipe }>;
}>;
// NUKETOWN2 (owner 2026-09-02, HF-407): same extension pattern again. The
// camera recipe is authored here BEFORE any capture exists, for the reason the
// Map 3 note gives: a card cannot leave standby without one, and authoring it
// now makes the capture a mechanical step rather than a design step. The orbit
// runs along the street rather than around a roof, because the street IS the
// map - see the note in the JSON.
const NUKETOWN2_CHOREOGRAPHY = nuketown2ChoreographyJson as unknown as Readonly<{
  recipeId: string;
  arenas: Readonly<{ nuketown2: HelicopterRecipe }>;
}>;
// RAID2 (owner 2026-09-02, HF-408): same extension pattern once more, and the
// same honesty as Map 3's entry - the camera recipe is authored here before any
// media has been captured against it, because a card cannot leave standby
// without one and authoring it now makes the capture a mechanical step rather
// than a design step. The orbit is fitted to RAID2_BOUNDS, not inherited.
const RAID2_CHOREOGRAPHY = raid2ChoreographyJson as unknown as Readonly<{
  recipeId: string;
  arenas: Readonly<{ raid2: HelicopterRecipe }>;
}>;
const CHOREOGRAPHY: ChoreographyRecipe = Object.freeze({
  ...RETAINED_CHOREOGRAPHY,
  arenas: Object.freeze({
    ...RETAINED_CHOREOGRAPHY.arenas,
    // ARENA_SELECTIONS order: farcrysis is fifth, high-seas sixth. The offline
    // authoring roster check compares against that order, so keep it here too.
    ...FARCRYSIS_CHOREOGRAPHY.arenas,
    ...HIGH_SEAS_CHOREOGRAPHY.arenas,
    ...TEST_ARENAS_CHOREOGRAPHY.arenas,
    ...MAP3_CHOREOGRAPHY.arenas,
    ...NUKETOWN2_CHOREOGRAPHY.arenas,
    ...RAID2_CHOREOGRAPHY.arenas,
  }),
});
const DURATION_MS = CHOREOGRAPHY.durationSeconds * 1_000;

export type MenuPreviewVariance = Readonly<{
  pitchDegrees: number;
  yawDegrees: number;
  bankDegrees: number;
  altitudeM: number;
  directionBiasDegrees: number;
  radiusScaleDelta: number;
  speedScale: number;
}>;

export type MenuPreviewPose = Readonly<{
  frame: MenuPreviewFrame;
  label: string;
  position: Vector3Tuple;
  target: Vector3Tuple;
  fov: number;
  phase: number;
  pathProgress: number;
  bankRadians: number;
  variance: MenuPreviewVariance;
  presentationId: string;
  momentLabel: string;
}>;

export type MenuPreviewDefinition = ArenaRecipe & Readonly<{
  durationMs: number;
  recipeId: string;
  reviewFrames: readonly number[];
}>;

type VarianceTarget = Readonly<{
  pitchDegrees: number;
  yawDegrees: number;
  bankDegrees: number;
  altitudeM: number;
  directionBiasRadians: number;
  radiusScaleDelta: number;
}>;

const ZERO_VARIANCE = Object.freeze({
  pitchDegrees: 0,
  yawDegrees: 0,
  bankDegrees: 0,
  altitudeM: 0,
  directionBiasDegrees: 0,
  radiusScaleDelta: 0,
  speedScale: 1,
});

const varianceTrackCache = new Map<number, readonly VarianceTarget[]>();

class XorShift32 {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  next(): number {
    let value = this.state;
    value = (value ^ (value << 13)) >>> 0;
    value = (value ^ (value >>> 17)) >>> 0;
    value = (value ^ (value << 5)) >>> 0;
    this.state = value;
    return value / 0x1_0000_0000;
  }

  signed(): number {
    return this.next() * 2 - 1;
  }
}

function finiteElapsed(elapsedMs: number): number {
  return Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(start: number, end: number, blend: number): number {
  return start + (end - start) * blend;
}

function catmullRom(from: number, start: number, end: number, to: number, progress: number): number {
  const progress2 = progress * progress;
  const progress3 = progress2 * progress;
  return 0.5 * (
    2 * start
    + (-from + end) * progress
    + (2 * from - 5 * start + 4 * end - to) * progress2
    + (-from + 3 * start - 3 * end + to) * progress3
  );
}

function closedSpline(path: readonly Vector3Tuple[], progress: number): Vector3Tuple {
  const scaled = wrapUnit(progress) * path.length;
  const index = Math.floor(scaled) % path.length;
  const local = scaled - Math.floor(scaled);
  const before = path[(index - 1 + path.length) % path.length]!;
  const start = path[index]!;
  const end = path[(index + 1) % path.length]!;
  const after = path[(index + 2) % path.length]!;
  return [
    catmullRom(before[0], start[0], end[0], after[0], local),
    catmullRom(before[1], start[1], end[1], after[1], local),
    catmullRom(before[2], start[2], end[2], after[2], local),
  ];
}

function buildVarianceTrack(seed: number): readonly VarianceTarget[] {
  const cached = varianceTrackCache.get(seed);
  if (cached) return cached;
  const random = new XorShift32(seed);
  const limits = CHOREOGRAPHY.helicopter;
  const track = Object.freeze(Array.from({ length: limits.segmentCount }, () => {
    const amount = random.next() < 0.42
      ? 0.46 + random.next() * 0.54
      : 0.04 + random.next() * 0.14;
    const turn = random.signed() * amount;
    const vertical = random.signed() * amount;
    const direction = random.signed() * amount;
    return Object.freeze({
      pitchDegrees: (vertical * 0.92 - Math.abs(turn) * 0.08) * limits.maximumPitchDegrees,
      yawDegrees: turn * limits.maximumYawDegrees,
      bankDegrees: (-turn * 0.88 + random.signed() * 0.12 * amount) * limits.maximumBankDegrees,
      altitudeM: vertical * limits.maximumAltitudeOffsetM,
      directionBiasRadians: direction * limits.maximumDirectionBiasDegrees * Math.PI / 180,
      radiusScaleDelta: random.signed() * amount * limits.maximumRadiusScaleDelta,
    });
  }));
  varianceTrackCache.set(seed, track);
  return track;
}

function sampleHoldTrack(track: readonly VarianceTarget[], progress: number): VarianceTarget {
  const scaled = wrapUnit(progress) * track.length;
  const index = Math.floor(scaled) % track.length;
  const local = scaled - Math.floor(scaled);
  const hold = CHOREOGRAPHY.helicopter.holdFraction;
  const blend = local <= hold ? 0 : quintic((local - hold) / (1 - hold));
  const start = track[index]!;
  const end = track[(index + 1) % track.length]!;
  return Object.freeze({
    pitchDegrees: lerp(start.pitchDegrees, end.pitchDegrees, blend),
    yawDegrees: lerp(start.yawDegrees, end.yawDegrees, blend),
    bankDegrees: lerp(start.bankDegrees, end.bankDegrees, blend),
    altitudeM: lerp(start.altitudeM, end.altitudeM, blend),
    directionBiasRadians: lerp(start.directionBiasRadians, end.directionBiasRadians, blend),
    radiusScaleDelta: lerp(start.radiusScaleDelta, end.radiusScaleDelta, blend),
  });
}

function adjustedLookAt(position: Vector3Tuple, target: Vector3Tuple, pitchDegrees: number, yawDegrees: number): Vector3Tuple {
  const yaw = yawDegrees * Math.PI / 180;
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const horizontal = Math.max(0.001, Math.hypot(dx, dz));
  return [
    position[0] + dx * Math.cos(yaw) - dz * Math.sin(yaw),
    position[1] + dy + Math.tan(pitchDegrees * Math.PI / 180) * horizontal,
    position[2] + dx * Math.sin(yaw) + dz * Math.cos(yaw),
  ];
}

export function menuPreviewDefinition(arenaId: ArenaId): MenuPreviewDefinition {
  return Object.freeze({
    ...CHOREOGRAPHY.arenas[arenaId],
    durationMs: DURATION_MS,
    recipeId: arenaId === 'high-seas' ? HIGH_SEAS_CHOREOGRAPHY.recipeId : CHOREOGRAPHY.recipeId,
    reviewFrames: CHOREOGRAPHY.reviewFrames,
  });
}

export function menuPreviewPose(arenaId: ArenaId, elapsedMs: number, reducedMotion = false): MenuPreviewPose {
  const definition = menuPreviewDefinition(arenaId);
  const progress = reducedMotion
    ? (definition.posterFrame - 1) / (CHOREOGRAPHY.frameCount - 1)
    : wrapUnit(finiteElapsed(elapsedMs) / definition.durationMs);

  if (definition.kind === 'cat') {
    const basePosition = closedSpline(definition.path, progress);
    const bob = reducedMotion ? 0 : Math.sin(progress * Math.PI * 8) * 0.018;
    const position = [basePosition[0], basePosition[1] + bob, basePosition[2]] as const;
    const target = closedSpline(definition.lookAtPath, progress);
    const segment = Math.floor(progress * definition.momentLabels.length) % definition.momentLabels.length;
    return Object.freeze({
      frame: definition.kind,
      label: definition.label,
      position,
      target,
      fov: definition.fovDegrees,
      phase: progress * Math.PI * 2,
      pathProgress: progress,
      bankRadians: reducedMotion ? 0 : Math.sin(progress * Math.PI * 4) * 0.75 * Math.PI / 180,
      variance: ZERO_VARIANCE,
      presentationId: definition.presentationId,
      momentLabel: reducedMotion ? 'STATIC POSTER' : definition.momentLabels[segment]!,
    });
  }

  const sampled = reducedMotion ? undefined : sampleHoldTrack(buildVarianceTrack(definition.seed), progress);
  const directionBias = sampled?.directionBiasRadians ?? 0;
  const theta = definition.phaseRadians + progress * Math.PI * 2 + directionBias;
  const radiusScale = 1 + (sampled?.radiusScaleDelta ?? 0);
  const position = [
    definition.centre[0] + Math.cos(theta) * definition.radius[0] * radiusScale,
    definition.altitudeM + (sampled?.altitudeM ?? 0),
    definition.centre[2] + Math.sin(theta) * definition.radius[1] * radiusScale,
  ] as const;
  const pitchDegrees = sampled?.pitchDegrees ?? 0;
  const yawDegrees = sampled?.yawDegrees ?? 0;
  const epsilon = 1 / 10_000;
  const next = reducedMotion ? undefined : sampleHoldTrack(buildVarianceTrack(definition.seed), progress + epsilon);
  const directionDelta = next
    ? Math.atan2(
      Math.sin(next.directionBiasRadians - directionBias),
      Math.cos(next.directionBiasRadians - directionBias),
    )
    : 0;
  const speedScale = Math.min(1.08, Math.max(0.92, 1 + directionDelta / (epsilon * Math.PI * 2)));
  const variance = sampled ? Object.freeze({
    pitchDegrees,
    yawDegrees,
    bankDegrees: sampled.bankDegrees,
    altitudeM: sampled.altitudeM,
    directionBiasDegrees: directionBias * 180 / Math.PI,
    radiusScaleDelta: sampled.radiusScaleDelta,
    speedScale,
  }) : ZERO_VARIANCE;
  return Object.freeze({
    frame: definition.kind,
    label: definition.label,
    position,
    target: adjustedLookAt(position, definition.lookAt, pitchDegrees, yawDegrees),
    fov: definition.fovDegrees,
    phase: theta,
    pathProgress: progress,
    bankRadians: variance.bankDegrees * Math.PI / 180,
    variance,
    presentationId: definition.presentationId,
    momentLabel: reducedMotion ? 'STATIC POSTER' : 'SEEDED PILOT CORRECTION',
  });
}
