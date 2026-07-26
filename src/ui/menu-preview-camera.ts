import { DeterministicRng } from '../deterministic-rng';
import type { ArenaId } from '../map-selection';

export type MenuPreviewFrame = 'helicopter' | 'cat';
type Vector3Tuple = readonly [number, number, number];

export type MenuPreviewVariance = Readonly<{
  pitchDegrees: number;
  yawDegrees: number;
  bankDegrees: number;
  altitudeM: number;
  directionBiasDegrees: number;
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

type PreviewDefinitionBase = Readonly<{
  label: string;
  durationMs: number;
  fov: number;
  path: readonly Vector3Tuple[];
  presentationId: string;
}>;

type HelicopterDefinition = PreviewDefinitionBase & Readonly<{
  frame: 'helicopter';
  lookAt: Vector3Tuple;
  phase: number;
  cockpitAssetId: 'pass65-sleek-cockpit-v1';
}>;

type CatDefinition = PreviewDefinitionBase & Readonly<{
  frame: 'cat';
  lookAtPath: readonly Vector3Tuple[];
  momentLabels: readonly string[];
}>;

export type MenuPreviewDefinition = HelicopterDefinition | CatDefinition;

type VarianceKeyframe = Readonly<{
  pitchDegrees: number;
  yawDegrees: number;
  bankDegrees: number;
  altitudeM: number;
  directionBiasRadians: number;
}>;

const ZERO_VARIANCE = Object.freeze({
  pitchDegrees: 0,
  yawDegrees: 0,
  bankDegrees: 0,
  altitudeM: 0,
  directionBiasDegrees: 0,
  speedScale: 1,
});

const HELICOPTER_VARIANCE_KEYFRAMES = 16;
const HELICOPTER_VARIANCE_ORBITS = 4;
const HELICOPTER_VARIANCE_CACHE_LIMIT = 256;
export const MENU_PREVIEW_VISIT_SEED_SLOTS = 64;
const varianceTrackCache = new Map<string, readonly VarianceKeyframe[]>();

const DEFINITIONS = Object.freeze({
  'atomic-acres': Object.freeze({
    frame: 'helicopter',
    label: 'HELO FLYOVER // NUKE TOWN',
    lookAt: [0, 2.4, 0] as const,
    path: Object.freeze([
      [38, 18.0, -1], [27, 18.7, 22], [2, 18.35, 31], [-26, 17.9, 24],
      [-38, 18.6, 0], [-28, 18.2, -23], [-3, 17.7, -31], [27, 18.15, -22],
    ] as const),
    phase: -0.78,
    durationMs: 18_000,
    fov: 58,
    cockpitAssetId: 'pass65-sleek-cockpit-v1',
    presentationId: 'menu-helo-nuke-town-v1',
  }),
  'skyline-terminal': Object.freeze({
    frame: 'helicopter',
    label: 'HELO FLYOVER // TERMINAL',
    lookAt: [0, 3.8, -5] as const,
    path: Object.freeze([
      [42, 17.0, -6], [30, 17.8, 18], [0, 17.35, 29], [-31, 17.9, 17],
      [-42, 17.25, -6], [-28, 17.8, -31], [0, 17.1, -39], [31, 17.65, -28],
    ] as const),
    phase: 0.72,
    durationMs: 20_000,
    fov: 57,
    cockpitAssetId: 'pass65-sleek-cockpit-v1',
    presentationId: 'menu-helo-terminal-v1',
  }),
  'rustworks-1v1': Object.freeze({
    frame: 'helicopter',
    label: 'HELO ORBIT // RUSTRIG',
    lookAt: [0, 6.2, 0] as const,
    path: Object.freeze([
      [34, 20.0, 0], [24, 20.8, 21], [0, 20.25, 30], [-24, 21.0, 22],
      [-34, 20.2, 0], [-23, 19.5, -22], [0, 20.05, -30], [24, 20.85, -21],
    ] as const),
    phase: -1.9,
    durationMs: 16_000,
    fov: 56,
    cockpitAssetId: 'pass65-sleek-cockpit-v1',
    presentationId: 'menu-helo-rustrig-v1',
  }),
  'gun-range': Object.freeze({
    frame: 'cat',
    label: 'CAT-CAM // GUN RANGE',
    path: Object.freeze([
      [0.0, 1.18, 16.4], [5.8, 1.24, 16.0], [8.2, 1.2, 14.3], [5.6, 1.26, 13.7],
      [0.8, 1.22, 13.8], [-4.8, 1.2, 14.0], [-7.8, 1.25, 15.0], [-3.7, 1.17, 17.0],
    ] as const),
    lookAtPath: Object.freeze([
      [0, 3.8, 8.5], [10.5, 2.1, 7.8], [8.2, 1.6, 3.5], [3.5, 4.3, -3.0],
      [0, 2.0, -28], [-4.0, 3.0, -4.0], [-10.5, 2.3, 7.5], [-4.0, 3.8, 9.0],
    ] as const),
    momentLabels: Object.freeze([
      'ARMORY REVEAL', 'BENCH INSPECTION', 'WEAPON PROWL', 'LIVE-FIRE GLANCE',
      'DOWNRANGE HERO MOMENT', 'CONTROL-ROOM CURIO', 'WINDOW WATCH', 'HOME STRETCH',
    ] as const),
    durationMs: 24_000,
    fov: 70,
    presentationId: 'menu-cat-gun-range-v1',
  }),
} satisfies Record<ArenaId, MenuPreviewDefinition>);

function finiteElapsed(elapsedMs: number): number {
  return Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(from: number, to: number, blend: number): number {
  return from + (to - from) * blend;
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

function buildVarianceTrack(arenaId: ArenaId, seed: number | string): readonly VarianceKeyframe[] {
  const key = `${arenaId}:${String(seed)}`;
  const cached = varianceTrackCache.get(key);
  if (cached) return cached;
  const random = new DeterministicRng(`pass65-menu-helicopter:${key}`);
  const track = Object.freeze(Array.from({ length: HELICOPTER_VARIANCE_KEYFRAMES }, (_, index) => {
    // Most holds stay near trim; occasional holds make a restrained, coupled correction.
    const correction = random.next() < 0.38;
    const amount = correction ? 0.42 + random.next() * 0.58 : 0.04 + random.next() * 0.14;
    const turn = (random.next() * 2 - 1) * amount;
    const vertical = (random.next() * 2 - 1) * amount;
    const direction = (random.next() * 2 - 1) * amount;
    return Object.freeze({
      pitchDegrees: vertical * 0.75 - Math.abs(turn) * 0.08,
      yawDegrees: turn * 1.35,
      bankDegrees: -turn * 2.1 + (random.next() * 2 - 1) * 0.18 * amount,
      altitudeM: vertical * 0.82,
      directionBiasRadians: direction * Math.PI / 225,
      // Alternating the first weak hold avoids a visually obvious all-zero reset while preserving the exact loop seam.
      ...(index === 0 && !correction ? { pitchDegrees: vertical * 0.3 } : {}),
    });
  }));
  varianceTrackCache.set(key, track);
  if (varianceTrackCache.size > HELICOPTER_VARIANCE_CACHE_LIMIT) {
    const oldestKey = varianceTrackCache.keys().next().value;
    if (oldestKey !== undefined) varianceTrackCache.delete(oldestKey);
  }
  return track;
}

function rawHelicopterVariance(
  arenaId: ArenaId,
  elapsedMs: number,
  durationMs: number,
  seed: number | string,
): Omit<MenuPreviewVariance, 'speedScale' | 'directionBiasDegrees'> & Readonly<{ directionBiasRadians: number }> {
  const track = buildVarianceTrack(arenaId, seed);
  const cycleMs = durationMs * HELICOPTER_VARIANCE_ORBITS;
  const scaled = wrapUnit(elapsedMs / cycleMs) * track.length;
  const index = Math.floor(scaled) % track.length;
  const blend = quintic(scaled - Math.floor(scaled));
  const start = track[index]!;
  const end = track[(index + 1) % track.length]!;
  return {
    pitchDegrees: lerp(start.pitchDegrees, end.pitchDegrees, blend),
    yawDegrees: lerp(start.yawDegrees, end.yawDegrees, blend),
    bankDegrees: lerp(start.bankDegrees, end.bankDegrees, blend),
    altitudeM: lerp(start.altitudeM, end.altitudeM, blend),
    directionBiasRadians: lerp(start.directionBiasRadians, end.directionBiasRadians, blend),
  };
}

function helicopterPhase(
  arenaId: ArenaId,
  elapsedMs: number,
  definition: HelicopterDefinition,
  seed: number | string,
): number {
  const correction = rawHelicopterVariance(arenaId, elapsedMs, definition.durationMs, seed);
  return definition.phase + elapsedMs / definition.durationMs * Math.PI * 2 + correction.directionBiasRadians;
}

function helicopterVariance(
  arenaId: ArenaId,
  elapsedMs: number,
  definition: HelicopterDefinition,
  seed: number | string,
): MenuPreviewVariance {
  const raw = rawHelicopterVariance(arenaId, elapsedMs, definition.durationMs, seed);
  const sampleWindowMs = 8;
  const before = helicopterPhase(arenaId, Math.max(0, elapsedMs - sampleWindowMs), definition, seed);
  const after = helicopterPhase(arenaId, elapsedMs + sampleWindowMs, definition, seed);
  const actualWindowMs = elapsedMs < sampleWindowMs ? elapsedMs + sampleWindowMs : sampleWindowMs * 2;
  const baseRadiansPerMs = Math.PI * 2 / definition.durationMs;
  const speedScale = Math.min(1.08, Math.max(0.92, (after - before) / Math.max(1, actualWindowMs) / baseRadiansPerMs));
  return Object.freeze({
    pitchDegrees: raw.pitchDegrees,
    yawDegrees: raw.yawDegrees,
    bankDegrees: raw.bankDegrees,
    altitudeM: raw.altitudeM,
    directionBiasDegrees: raw.directionBiasRadians * 180 / Math.PI,
    speedScale,
  });
}

function adjustedLookAt(position: Vector3Tuple, target: Vector3Tuple, pitchDegrees: number, yawDegrees: number): Vector3Tuple {
  const yaw = yawDegrees * Math.PI / 180;
  const dx = target[0] - position[0];
  const dz = target[2] - position[2];
  const horizontal = Math.max(0.001, Math.hypot(dx, dz));
  const rotatedX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const rotatedZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return [
    position[0] + rotatedX,
    target[1] + Math.tan(pitchDegrees * Math.PI / 180) * horizontal,
    position[2] + rotatedZ,
  ];
}

export function menuPreviewDefinition(arenaId: ArenaId): MenuPreviewDefinition {
  return DEFINITIONS[arenaId];
}

export function menuPreviewVisitSeed(seed: number | string, visitSerial: number): string {
  const boundedSerial = Number.isSafeInteger(visitSerial) && visitSerial >= 0
    ? visitSerial % MENU_PREVIEW_VISIT_SEED_SLOTS
    : 0;
  return `pass65-menu-visit:${String(seed)}:${boundedSerial}`;
}

export function menuPreviewPose(
  arenaId: ArenaId,
  elapsedMs: number,
  reducedMotion = false,
  seed: number | string = 'pass65-review',
): MenuPreviewPose {
  const definition = menuPreviewDefinition(arenaId);
  const elapsed = finiteElapsed(elapsedMs);
  if (definition.frame === 'cat') {
    const pathProgress = reducedMotion ? 0 : wrapUnit(elapsed / definition.durationMs);
    const basePosition = closedSpline(definition.path, pathProgress);
    const bob = reducedMotion ? 0 : Math.sin(pathProgress * Math.PI * 16) * 0.028;
    const position = [basePosition[0], basePosition[1] + bob, basePosition[2]] as const;
    const target = reducedMotion ? definition.lookAtPath[0]! : closedSpline(definition.lookAtPath, pathProgress);
    const segment = Math.floor(pathProgress * definition.momentLabels.length) % definition.momentLabels.length;
    const headRollDegrees = reducedMotion ? 0 : Math.sin(pathProgress * Math.PI * 8) * 1.1;
    return Object.freeze({
      frame: definition.frame,
      label: definition.label,
      position,
      target,
      fov: definition.fov,
      phase: pathProgress * Math.PI * 2,
      pathProgress,
      bankRadians: headRollDegrees * Math.PI / 180,
      variance: ZERO_VARIANCE,
      presentationId: definition.presentationId,
      momentLabel: reducedMotion ? 'CURIOUS RANGE WATCH' : definition.momentLabels[segment]!,
    });
  }

  const phase = reducedMotion ? definition.phase : helicopterPhase(arenaId, elapsed, definition, seed);
  const pathProgress = wrapUnit(phase / (Math.PI * 2));
  const variance = reducedMotion ? ZERO_VARIANCE : helicopterVariance(arenaId, elapsed, definition, seed);
  const basePosition = closedSpline(definition.path, pathProgress);
  const position = [basePosition[0], basePosition[1] + variance.altitudeM, basePosition[2]] as const;
  const target = adjustedLookAt(position, definition.lookAt, variance.pitchDegrees, variance.yawDegrees);
  return Object.freeze({
    frame: definition.frame,
    label: definition.label,
    position,
    target,
    fov: definition.fov,
    phase,
    pathProgress,
    bankRadians: variance.bankDegrees * Math.PI / 180,
    variance,
    presentationId: definition.presentationId,
    momentLabel: reducedMotion ? 'STABILIZED SHOWCASE' : 'PILOTED ORBIT',
  });
}
