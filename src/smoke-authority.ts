import type { SmokeCorridor, SmokeVolume, Vec3 } from './combat/ordnance';

export const SMOKE_AUTHORITY_SCHEMA_VERSION = 2;
export const SMOKE_VOLUME_MIN_LIFETIME_MS = 5_000;
export const SMOKE_VOLUME_LIFETIME_MS = 10_000;
export const SMOKE_VOLUME_RADIUS_M = 4.2;
/**
 * Each smoke grenade picks one of these deterministically from its action hash,
 * so every deployment reads as a visibly distinct coloured cloud while staying
 * replicated identically on every peer. Saturation is deliberately raised over
 * the original near-grey set so the colours are actually tellable apart.
 */
export const SMOKE_COLOUR_PALETTE = Object.freeze([
  0x3f7f96,
  0x4f9163,
  0x7a5aa6,
  0xb2653f,
  0xa89a3c,
  0x9c4560,
] as const);
export const SMOKE_CORRIDOR_LIFETIME_MS = 900;
export const SMOKE_CORRIDOR_RADIUS_M = 0.42;
export const MAX_ACTIVE_SMOKE_VOLUMES = 12;
export const MAX_SMOKE_CORRIDORS_PER_VOLUME = 8;
export const MAX_SMOKE_SHOT_SEGMENTS = 12;
export const MAX_SMOKE_SHOT_SEGMENT_METERS = 256;
export const MAX_REMEMBERED_SMOKE_SHOTS = 256;
export const SMOKE_SHOT_REPLAY_WINDOW_MS = 60_000;

export type SmokeAuthorityRole = 'host' | 'replica';

export type SmokeCorridorSnapshot = SmokeCorridor & Readonly<{
  id: string;
  shotResultId: string;
  pelletIndex: number;
  createdAtHostTimeMs: number;
}>;

export type SmokeVolumeSnapshot = Omit<SmokeVolume, 'corridors'> & Readonly<{
  ownerId: string;
  actionNonce: number;
  colourHex: number;
  corridors: readonly SmokeCorridorSnapshot[];
}>;

export type SmokeAuthoritySnapshot = Readonly<{
  schemaVersion: typeof SMOKE_AUTHORITY_SCHEMA_VERSION;
  matchEpoch: number;
  revision: number;
  hostTimeMs: number;
  volumes: readonly SmokeVolumeSnapshot[];
}>;

export type SmokeShotSegment = Readonly<{
  pelletIndex: number;
  start: Vec3;
  end: Vec3;
}>;

export type SmokeShotAdmission = Readonly<{
  matchEpoch: number;
  shotResultId: string;
  resolvedAtHostTimeMs: number;
  segments: readonly SmokeShotSegment[];
}>;

export type SmokeAuthorityResult = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'not-host' | 'wrong-epoch' | 'malformed' | 'replay';
  createdCorridorIds: readonly string[];
}>;

export type SmokeAuthorityTelemetry = Readonly<{
  role: SmokeAuthorityRole;
  matchEpoch: number;
  revision: number;
  activeVolumes: number;
  activeCorridors: number;
  rememberedShots: number;
  rejectedNotHost: number;
  rejectedWrongEpoch: number;
  rejectedMalformed: number;
  rejectedReplay: number;
}>;

function finiteTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function finiteVec3(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
    && Math.abs(value.x) <= 4_096 && Math.abs(value.y) <= 4_096 && Math.abs(value.z) <= 4_096;
}

function canonicalActorId(value: string): boolean {
  return value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
}

function canonicalResultId(value: string): boolean {
  return value.length >= 3 && value.length <= 128 && /^[a-zA-Z0-9:_.|-]+$/.test(value);
}

function freezeVec3(value: Vec3): Vec3 {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function lengthSquared(value: Vec3): number {
  return dot(value, value);
}

function segmentIntersectsSphere(start: Vec3, end: Vec3, centre: Vec3, radiusM: number): boolean {
  const segment = subtract(end, start);
  const denominator = lengthSquared(segment);
  if (denominator <= 1e-8) return false;
  const centreOffset = subtract(centre, start);
  const fraction = Math.max(0, Math.min(1, dot(centreOffset, segment) / denominator));
  const nearest = {
    x: start.x + segment.x * fraction,
    y: start.y + segment.y * fraction,
    z: start.z + segment.z * fraction,
  };
  return lengthSquared(subtract(nearest, centre)) <= radiusM * radiusM;
}

function validSegment(segment: SmokeShotSegment): boolean {
  if (!Number.isSafeInteger(segment.pelletIndex)
    || segment.pelletIndex < 0 || segment.pelletIndex >= MAX_SMOKE_SHOT_SEGMENTS
    || !finiteVec3(segment.start) || !finiteVec3(segment.end)) return false;
  const lengthSq = lengthSquared(subtract(segment.end, segment.start));
  return lengthSq > 1e-8 && lengthSq <= MAX_SMOKE_SHOT_SEGMENT_METERS ** 2;
}

function freezeCorridor(corridor: SmokeCorridorSnapshot): SmokeCorridorSnapshot {
  return Object.freeze({
    ...corridor,
    start: freezeVec3(corridor.start),
    end: freezeVec3(corridor.end),
  });
}

function freezeVolume(volume: SmokeVolumeSnapshot): SmokeVolumeSnapshot {
  return Object.freeze({
    ...volume,
    centre: freezeVec3(volume.centre),
    corridors: Object.freeze(volume.corridors.map(freezeCorridor)),
  });
}

function freezeSnapshot(snapshot: SmokeAuthoritySnapshot): SmokeAuthoritySnapshot {
  return Object.freeze({
    ...snapshot,
    volumes: Object.freeze(snapshot.volumes.map(freezeVolume)),
  });
}

function volumeId(ownerId: string, actionNonce: number): string {
  return `smoke-${ownerId}-${actionNonce}`;
}

function corridorId(volume: SmokeVolumeSnapshot, shotResultId: string, pelletIndex: number): string {
  return `${volume.id}:corridor:${shotResultId}:${pelletIndex}`;
}

function appearanceHash(matchEpoch: number, ownerId: string, actionNonce: number): number {
  let hash = (2166136261 ^ matchEpoch ^ actionNonce) >>> 0;
  for (let index = 0; index < ownerId.length; index += 1) {
    hash ^= ownerId.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= actionNonce >>> 16;
  return Math.imul(hash, 2246822519) >>> 0;
}

export function smokeAppearanceFor(
  matchEpoch: number,
  ownerId: string,
  actionNonce: number,
): Readonly<{ lifetimeMs: number; colourHex: number }> {
  const hash = appearanceHash(matchEpoch, ownerId, actionNonce);
  const lifetimeRange = SMOKE_VOLUME_LIFETIME_MS - SMOKE_VOLUME_MIN_LIFETIME_MS;
  return Object.freeze({
    lifetimeMs: SMOKE_VOLUME_MIN_LIFETIME_MS + (hash % (lifetimeRange + 1)),
    colourHex: SMOKE_COLOUR_PALETTE[(hash >>> 16) % SMOKE_COLOUR_PALETTE.length]!,
  });
}

export class SmokeAuthority {
  private role: SmokeAuthorityRole;
  private matchEpoch: number;
  private revision = 0;
  private readonly volumes = new Map<string, SmokeVolumeSnapshot>();
  private readonly processedShots = new Map<string, number>();
  private rejectedNotHost = 0;
  private rejectedWrongEpoch = 0;
  private rejectedMalformed = 0;
  private rejectedReplay = 0;

  constructor(matchEpoch: number, role: SmokeAuthorityRole) {
    this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
    this.role = role;
  }

  reset(matchEpoch: number, role: SmokeAuthorityRole): void {
    this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
    this.role = role;
    this.revision = 0;
    this.volumes.clear();
    this.processedShots.clear();
    this.rejectedNotHost = 0;
    this.rejectedWrongEpoch = 0;
    this.rejectedMalformed = 0;
    this.rejectedReplay = 0;
  }

  registerVolume(input: Readonly<{
    matchEpoch: number;
    ownerId: string;
    actionNonce: number;
    centre: Vec3;
    startsAtHostTimeMs: number;
    radiusM?: number;
    lifetimeMs?: number;
  }>): boolean {
    if (this.role !== 'host') {
      this.rejectedNotHost += 1;
      return false;
    }
    if (input.matchEpoch !== this.matchEpoch) {
      this.rejectedWrongEpoch += 1;
      return false;
    }
    const radiusM = input.radiusM ?? SMOKE_VOLUME_RADIUS_M;
    const appearance = smokeAppearanceFor(this.matchEpoch, input.ownerId, input.actionNonce);
    const lifetimeMs = input.lifetimeMs ?? appearance.lifetimeMs;
    if (!canonicalActorId(input.ownerId)
      || !Number.isSafeInteger(input.actionNonce) || input.actionNonce < 0 || input.actionNonce > 0xffffffff
      || !finiteVec3(input.centre) || !finiteTime(input.startsAtHostTimeMs)
      || !Number.isFinite(radiusM) || radiusM < 0.25 || radiusM > 8
      || !Number.isFinite(lifetimeMs)
      || lifetimeMs < SMOKE_VOLUME_MIN_LIFETIME_MS || lifetimeMs > SMOKE_VOLUME_LIFETIME_MS) {
      this.rejectedMalformed += 1;
      return false;
    }
    const id = volumeId(input.ownerId, input.actionNonce);
    if (this.volumes.has(id)) return false;
    this.advance(input.startsAtHostTimeMs);
    while (this.volumes.size >= MAX_ACTIVE_SMOKE_VOLUMES) {
      const oldest = [...this.volumes.values()].sort((left, right) => (
        left.startsAtMs - right.startsAtMs || left.id.localeCompare(right.id)
      ))[0];
      if (!oldest) break;
      this.volumes.delete(oldest.id);
    }
    this.volumes.set(id, freezeVolume({
      id,
      ownerId: input.ownerId,
      actionNonce: input.actionNonce,
      colourHex: appearance.colourHex,
      centre: input.centre,
      radiusM,
      startsAtMs: input.startsAtHostTimeMs,
      expiresAtMs: input.startsAtHostTimeMs + lifetimeMs,
      corridors: [],
    }));
    this.revision += 1;
    return true;
  }

  admitShot(input: SmokeShotAdmission): SmokeAuthorityResult {
    const rejected = (reason: SmokeAuthorityResult['reason']): SmokeAuthorityResult => Object.freeze({
      accepted: false,
      reason,
      createdCorridorIds: Object.freeze([]),
    });
    if (this.role !== 'host') {
      this.rejectedNotHost += 1;
      return rejected('not-host');
    }
    if (input.matchEpoch !== this.matchEpoch) {
      this.rejectedWrongEpoch += 1;
      return rejected('wrong-epoch');
    }
    if (!canonicalResultId(input.shotResultId) || !finiteTime(input.resolvedAtHostTimeMs)
      || input.segments.length < 1 || input.segments.length > MAX_SMOKE_SHOT_SEGMENTS
      || !input.segments.every(validSegment)
      || new Set(input.segments.map((segment) => segment.pelletIndex)).size !== input.segments.length) {
      this.rejectedMalformed += 1;
      return rejected('malformed');
    }
    this.advance(input.resolvedAtHostTimeMs);
    this.pruneProcessedShots(input.resolvedAtHostTimeMs);
    if (this.processedShots.has(input.shotResultId)) {
      this.rejectedReplay += 1;
      return rejected('replay');
    }
    this.processedShots.set(input.shotResultId, input.resolvedAtHostTimeMs);
    while (this.processedShots.size > MAX_REMEMBERED_SMOKE_SHOTS) {
      this.processedShots.delete(this.processedShots.keys().next().value!);
    }

    const createdCorridorIds: string[] = [];
    for (const [id, volume] of this.volumes) {
      if (input.resolvedAtHostTimeMs < volume.startsAtMs || input.resolvedAtHostTimeMs >= volume.expiresAtMs) continue;
      const corridors = [...volume.corridors];
      for (const segment of input.segments) {
        if (!segmentIntersectsSphere(segment.start, segment.end, volume.centre, volume.radiusM)) continue;
        const idForCorridor = corridorId(volume, input.shotResultId, segment.pelletIndex);
        if (corridors.some((corridor) => corridor.id === idForCorridor)) continue;
        corridors.push(freezeCorridor({
          id: idForCorridor,
          shotResultId: input.shotResultId,
          pelletIndex: segment.pelletIndex,
          start: segment.start,
          end: segment.end,
          radiusM: SMOKE_CORRIDOR_RADIUS_M,
          createdAtHostTimeMs: input.resolvedAtHostTimeMs,
          expiresAtMs: input.resolvedAtHostTimeMs + SMOKE_CORRIDOR_LIFETIME_MS,
        }));
        createdCorridorIds.push(idForCorridor);
      }
      if (corridors.length > MAX_SMOKE_CORRIDORS_PER_VOLUME) {
        corridors.splice(0, corridors.length - MAX_SMOKE_CORRIDORS_PER_VOLUME);
      }
      if (createdCorridorIds.some((corridor) => corridor.startsWith(`${id}:corridor:`))) {
        this.volumes.set(id, freezeVolume({ ...volume, corridors }));
      }
    }
    if (createdCorridorIds.length > 0) this.revision += 1;
    return Object.freeze({
      accepted: true,
      reason: 'accepted',
      createdCorridorIds: Object.freeze(createdCorridorIds),
    });
  }

  /** Host-only pruning. Replicas filter expired state by host time without inventing revisions. */
  advance(nowHostTimeMs: number): boolean {
    if (this.role !== 'host' || !finiteTime(nowHostTimeMs)) return false;
    let changed = false;
    for (const [id, volume] of this.volumes) {
      if (nowHostTimeMs >= volume.expiresAtMs) {
        this.volumes.delete(id);
        changed = true;
        continue;
      }
      const corridors = volume.corridors.filter((corridor) => nowHostTimeMs < corridor.expiresAtMs);
      if (corridors.length !== volume.corridors.length) {
        this.volumes.set(id, freezeVolume({ ...volume, corridors }));
        changed = true;
      }
    }
    this.pruneProcessedShots(nowHostTimeMs);
    if (changed) this.revision += 1;
    return changed;
  }

  snapshot(nowHostTimeMs: number): SmokeAuthoritySnapshot {
    if (this.role === 'host') this.advance(nowHostTimeMs);
    const volumes = [...this.volumes.values()]
      .filter((volume) => nowHostTimeMs >= volume.startsAtMs && nowHostTimeMs < volume.expiresAtMs)
      .map((volume) => freezeVolume({
        ...volume,
        corridors: volume.corridors.filter((corridor) => nowHostTimeMs < corridor.expiresAtMs),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    return freezeSnapshot({
      schemaVersion: SMOKE_AUTHORITY_SCHEMA_VERSION,
      matchEpoch: this.matchEpoch,
      revision: this.revision,
      hostTimeMs: nowHostTimeMs,
      volumes,
    });
  }

  applyAuthoritativeSnapshot(snapshot: SmokeAuthoritySnapshot): boolean {
    if (this.role !== 'replica') {
      this.rejectedNotHost += 1;
      return false;
    }
    if (snapshot.matchEpoch !== this.matchEpoch) {
      this.rejectedWrongEpoch += 1;
      return false;
    }
    if (snapshot.revision <= this.revision) return false;
    this.volumes.clear();
    for (const volume of snapshot.volumes) this.volumes.set(volume.id, freezeVolume(volume));
    this.revision = snapshot.revision;
    return true;
  }

  telemetry(nowHostTimeMs: number): SmokeAuthorityTelemetry {
    const snapshot = this.snapshot(nowHostTimeMs);
    return Object.freeze({
      role: this.role,
      matchEpoch: this.matchEpoch,
      revision: this.revision,
      activeVolumes: snapshot.volumes.length,
      activeCorridors: snapshot.volumes.reduce((total, volume) => total + volume.corridors.length, 0),
      rememberedShots: this.processedShots.size,
      rejectedNotHost: this.rejectedNotHost,
      rejectedWrongEpoch: this.rejectedWrongEpoch,
      rejectedMalformed: this.rejectedMalformed,
      rejectedReplay: this.rejectedReplay,
    });
  }

  private pruneProcessedShots(nowHostTimeMs: number): void {
    for (const [shotResultId, resolvedAt] of this.processedShots) {
      if (nowHostTimeMs - resolvedAt > SMOKE_SHOT_REPLAY_WINDOW_MS) this.processedShots.delete(shotResultId);
    }
  }
}
