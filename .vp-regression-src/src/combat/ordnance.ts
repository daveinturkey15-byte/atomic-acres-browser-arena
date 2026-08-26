import type { GrenadeId } from '../protocol';

export const GRENADE_SPAWN_COUNT = 1 as const;
export const GRENADE_CARRY_CAP = 1 as const;

export type GrenadeInventory = Readonly<{
  selected: GrenadeId;
  count: 0 | 1;
  consumedCorpseIds: readonly string[];
}>;

export type GrenadeInventoryResult = Readonly<{
  inventory: GrenadeInventory;
  accepted: boolean;
  grenadeGranted: 0 | 1;
}>;

function freezeInventory(
  selected: GrenadeId,
  count: number,
  consumedCorpseIds: readonly string[],
): GrenadeInventory {
  return Object.freeze({
    selected,
    count: (count > 0 ? 1 : 0) as 0 | 1,
    consumedCorpseIds: Object.freeze([...consumedCorpseIds].slice(-128)),
  });
}

export function spawnGrenadeInventory(selected: GrenadeId): GrenadeInventory {
  return freezeInventory(selected, GRENADE_SPAWN_COUNT, []);
}

export function spendSelectedGrenade(inventory: GrenadeInventory): GrenadeInventoryResult {
  if (inventory.count !== 1) {
    return Object.freeze({ inventory, accepted: false, grenadeGranted: 0 });
  }
  return Object.freeze({
    inventory: freezeInventory(inventory.selected, 0, inventory.consumedCorpseIds),
    accepted: true,
    grenadeGranted: 0,
  });
}

/** A kill is deliberately not an ordnance refill source. */
export function recordGrenadeKill(inventory: GrenadeInventory): GrenadeInventoryResult {
  return Object.freeze({ inventory, accepted: false, grenadeGranted: 0 });
}

/**
 * Applies the grenade portion of a corpse-ammo pickup exactly once. A consumed
 * corpse remains consumed even when the player was already at the carry cap.
 */
export function replenishGrenadeFromCorpse(
  inventory: GrenadeInventory,
  corpseId: string,
): GrenadeInventoryResult {
  if (corpseId.length === 0 || inventory.consumedCorpseIds.includes(corpseId)) {
    return Object.freeze({ inventory, accepted: false, grenadeGranted: 0 });
  }
  const grenadeGranted = (inventory.count === 0 ? 1 : 0) as 0 | 1;
  return Object.freeze({
    inventory: freezeInventory(
      inventory.selected,
      inventory.count + grenadeGranted,
      [...inventory.consumedCorpseIds, corpseId],
    ),
    accepted: true,
    grenadeGranted,
  });
}

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export type SmokeVolume = Readonly<{
  id: string;
  centre: Vec3;
  radiusM: number;
  startsAtMs: number;
  expiresAtMs: number;
  corridors?: readonly SmokeCorridor[];
}>;

export type SmokeCorridor = Readonly<{
  start: Vec3;
  end: Vec3;
  radiusM: number;
  expiresAtMs: number;
}>;

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function lengthSquared(value: Vec3): number {
  return dot(value, value);
}

function segmentIntersectsSphere(start: Vec3, end: Vec3, centre: Vec3, radius: number): boolean {
  const segment = subtract(end, start);
  const relative = subtract(centre, start);
  const denominator = lengthSquared(segment);
  const alpha = denominator > 1e-9 ? Math.max(0, Math.min(1, dot(relative, segment) / denominator)) : 0;
  const nearest = {
    x: start.x + segment.x * alpha,
    y: start.y + segment.y * alpha,
    z: start.z + segment.z * alpha,
  };
  return lengthSquared(subtract(nearest, centre)) <= radius * radius;
}

function nearestPointOnSegment(start: Vec3, end: Vec3, point: Vec3): Vec3 {
  const segment = subtract(end, start);
  const denominator = lengthSquared(segment);
  const alpha = denominator > 1e-9 ? clamp01(dot(subtract(point, start), segment) / denominator) : 0;
  return {
    x: start.x + segment.x * alpha,
    y: start.y + segment.y * alpha,
    z: start.z + segment.z * alpha,
  };
}

function smokeCorridorOpensRay(observer: Vec3, target: Vec3, volume: SmokeVolume, nowMs: number): boolean {
  return (volume.corridors ?? []).some((corridor) => (
    nowMs < corridor.expiresAtMs
    && corridor.radiusM > 0
    && lengthSquared(subtract(
      nearestPointOnSegment(observer, target, volume.centre),
      nearestPointOnSegment(corridor.start, corridor.end, volume.centre),
    )) <= corridor.radiusM * corridor.radiusM
  ));
}

function smokeChordDensity(observer: Vec3, target: Vec3, volume: SmokeVolume): number {
  const nearest = nearestPointOnSegment(observer, target, volume.centre);
  const offsetSq = lengthSquared(subtract(nearest, volume.centre));
  const radiusSq = volume.radiusM * volume.radiusM;
  if (offsetSq >= radiusSq) return 0;
  const chordLength = Math.sqrt(Math.max(0, radiusSq - offsetSq)) * 2;
  return clamp01(chordLength / Math.max(0.001, volume.radiusM * 2));
}

/**
 * Semantic visibility density used by host AI. It is derived from the same
 * authoritative volumes/corridors as presentation and never from particles.
 */
export function smokeDensityAlongRay(
  observer: Vec3,
  target: Vec3,
  volumes: readonly SmokeVolume[],
  nowMs: number,
): number {
  let transmittance = 1;
  for (const volume of volumes) {
    if (nowMs < volume.startsAtMs || nowMs >= volume.expiresAtMs || volume.radiusM <= 0
      || smokeCorridorOpensRay(observer, target, volume, nowMs)) continue;
    const density = smokeChordDensity(observer, target, volume);
    transmittance *= 1 - density;
  }
  return clamp01(1 - transmittance);
}

export function smokeBlocksTargetAcquisition(
  observer: Vec3,
  target: Vec3,
  volumes: readonly SmokeVolume[],
  nowMs: number,
): boolean {
  return volumes.some((volume) => (
    nowMs >= volume.startsAtMs
    && nowMs < volume.expiresAtMs
    && volume.radiusM > 0
    && segmentIntersectsSphere(observer, target, volume.centre, volume.radiusM)
    && !smokeCorridorOpensRay(observer, target, volume, nowMs)
  ));
}

export function targetAcquisitionAllowed(input: Readonly<{
  observer: Vec3;
  target: Vec3;
  smokeVolumes: readonly SmokeVolume[];
  nowMs: number;
  thermalSmokeOnly: boolean;
  solidOccluded: boolean;
}>): boolean {
  if (input.solidOccluded) return false;
  return input.thermalSmokeOnly
    || !smokeBlocksTargetAcquisition(input.observer, input.target, input.smokeVolumes, input.nowMs);
}

export type FlashExposure = Readonly<{
  accepted: boolean;
  intensity: number;
  durationMs: number;
}>;

export type FlashOwnerKind = 'player' | 'remote' | 'bot';
export type FlashSimulationRole = 'offline' | 'host' | 'client';

export function shouldResolveFlashAgainstBots(
  role: FlashSimulationRole,
  ownerKind: FlashOwnerKind,
): boolean {
  return role !== 'client'
    && (ownerKind === 'player' || ownerKind === 'remote' || ownerKind === 'bot');
}

export function calculateFlashExposure(input: Readonly<{
  origin: Vec3;
  eyes: Vec3;
  lookDirection: Vec3;
  maximumRadiusM: number;
  solidOccluded: boolean;
  friendly: boolean;
}>): FlashExposure {
  if (input.solidOccluded || input.maximumRadiusM <= 0) {
    return Object.freeze({ accepted: false, intensity: 0, durationMs: 0 });
  }
  const toFlash = subtract(input.origin, input.eyes);
  const distance = Math.sqrt(lengthSquared(toFlash));
  if (!Number.isFinite(distance) || distance > input.maximumRadiusM) {
    return Object.freeze({ accepted: false, intensity: 0, durationMs: 0 });
  }
  const direction = distance > 1e-6
    ? { x: toFlash.x / distance, y: toFlash.y / distance, z: toFlash.z / distance }
    : input.lookDirection;
  const lookLength = Math.sqrt(lengthSquared(input.lookDirection));
  const facing = lookLength > 1e-6 ? Math.max(0, dot(direction, input.lookDirection) / lookLength) : 0;
  const distanceFactor = 1 - Math.min(1, distance / input.maximumRadiusM);
  const teamFactor = input.friendly ? 0.5 : 1;
  const hostileIntensity = Math.max(0, Math.min(1, distanceFactor * distanceFactor * (0.2 + facing * 0.8)));
  const intensity = hostileIntensity * teamFactor;
  return Object.freeze({
    accepted: intensity > 0.01,
    intensity,
    durationMs: Math.round((220 + hostileIntensity * 2_580) * teamFactor),
  });
}

export const EXPLOSIVE_BOLT_ARM_DELAY_MS = 1_250;
export const EXPLOSIVE_BOLT_MAX_LIFE_MS = 5_000;
/** Pass 65: bolts fly 3x the legacy 36 m/s so mid-range shots land without heavy lead. */
export const EXPLOSIVE_BOLT_PREVIOUS_SPEED_MPS = 36;
export const EXPLOSIVE_BOLT_SPEED_MULTIPLIER = 3;
export const EXPLOSIVE_BOLT_SPEED_MPS = EXPLOSIVE_BOLT_PREVIOUS_SPEED_MPS * EXPLOSIVE_BOLT_SPEED_MULTIPLIER;
/** Bolts stuck to a combatant detonate with double damage and double blast area. */
export const EXPLOSIVE_BOLT_STUCK_MULTIPLIER = 2;
export const EXPLOSIVE_BOLT_DIRECT_DAMAGE = 45;
export const EXPLOSIVE_BOLT_BLAST_MAX_DAMAGE = 60;
export const EXPLOSIVE_BOLT_BLAST_MIN_DAMAGE = 15;
export const EXPLOSIVE_BOLT_BLAST_RADIUS_M = 3.5;

export type ExplosiveBoltAttachment =
  | Readonly<{ kind: 'world'; position: Vec3 }>
  | Readonly<{ kind: 'combatant'; targetId: string; targetLifeId: number; localOffset: Vec3 }>;

export type ExplosiveBoltState = Readonly<{
  id: string;
  ownerId: string;
  ownerLifeId: number;
  launchedAtMs: number;
  expiresAtMs: number;
  impactAtMs: number | null;
  armedAtMs: number | null;
  attachment: ExplosiveBoltAttachment | null;
  detonatedAtMs: number | null;
}>;

export function launchExplosiveBolt(
  id: string,
  ownerId: string,
  ownerLifeId: number,
  nowMs: number,
): ExplosiveBoltState {
  return Object.freeze({
    id,
    ownerId,
    ownerLifeId,
    launchedAtMs: nowMs,
    expiresAtMs: nowMs + EXPLOSIVE_BOLT_MAX_LIFE_MS,
    impactAtMs: null,
    armedAtMs: null,
    attachment: null,
    detonatedAtMs: null,
  });
}

/** Only the first host-admitted impact can attach and arm a bolt. */
export function impactExplosiveBolt(
  state: ExplosiveBoltState,
  attachment: ExplosiveBoltAttachment,
  nowMs: number,
): ExplosiveBoltState {
  if (state.impactAtMs !== null || state.detonatedAtMs !== null || nowMs < state.launchedAtMs || nowMs > state.expiresAtMs) {
    return state;
  }
  return Object.freeze({
    ...state,
    impactAtMs: nowMs,
    armedAtMs: Math.min(state.expiresAtMs, nowMs + EXPLOSIVE_BOLT_ARM_DELAY_MS),
    attachment: Object.freeze({ ...attachment }),
  });
}

export function explosiveBoltReadyToDetonate(state: ExplosiveBoltState, nowMs: number): boolean {
  if (state.detonatedAtMs !== null) return false;
  return nowMs >= state.expiresAtMs || state.armedAtMs !== null && nowMs >= state.armedAtMs;
}

export function detonateExplosiveBolt(state: ExplosiveBoltState, nowMs: number): ExplosiveBoltState {
  if (!explosiveBoltReadyToDetonate(state, nowMs)) return state;
  return Object.freeze({ ...state, detonatedAtMs: nowMs });
}

export function explosiveBoltBlastRadiusM(stuck = false): number {
  return EXPLOSIVE_BOLT_BLAST_RADIUS_M * (stuck ? EXPLOSIVE_BOLT_STUCK_MULTIPLIER : 1);
}

/** Pure balance oracle shared by local and host-admitted remote crossbolt damage. */
export function explosiveBoltBlastDamage(distanceM: number, stuck = false): number {
  const radiusM = explosiveBoltBlastRadiusM(stuck);
  if (!Number.isFinite(distanceM) || distanceM < 0 || distanceM > radiusM) return 0;
  const alpha = distanceM / radiusM;
  return (EXPLOSIVE_BOLT_BLAST_MAX_DAMAGE
    + (EXPLOSIVE_BOLT_BLAST_MIN_DAMAGE - EXPLOSIVE_BOLT_BLAST_MAX_DAMAGE) * alpha)
    * (stuck ? EXPLOSIVE_BOLT_STUCK_MULTIPLIER : 1);
}
