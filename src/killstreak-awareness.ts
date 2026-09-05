/**
 * HF-509 killstreak awareness: every peer, not only the controller, must know
 * that a killstreak is live, where it is, what it is doing and who it is
 * hurting. This module is the pure, host-authoritative side of that contract:
 *
 *  - the `killstreak-announce` message the host broadcasts once per admitted
 *    activation (banner + sting on every peer, de-duplicated by activation);
 *  - the awareness phase projection (inbound / active / firing / dropping /
 *    leaving) derived from the replicated entity snapshot plus the public
 *    host-authored shot/impact reports;
 *  - the positional audio source projection and its attenuation curve, shared
 *    by every peer so the flight loops sit at the source position;
 *  - the damage-source cue (label + bearing) for a killstreak victim.
 *
 * Guests never relay any of it: the announce message is host-only, the entity
 * snapshot is host-only, and the shot/impact reports are host-only.
 */
import type { Pass65KillstreakId } from './killstreak-catalog';
import type {
  KillstreakDamageEvent,
  KillstreakEntitySnapshot,
  KillstreakImpactEvent,
  KillstreakSupportShotEvent,
  SupportVec3,
} from './killstreak-runtime';
import type { SpatialPoint } from './spatial-audio';

export const KILLSTREAK_DISPLAY_LABELS: Readonly<Record<Pass65KillstreakId, string>> = Object.freeze({
  'crimson-flamethrower': 'CRIMSON FLAMETHROWER',
  'scout-sweep': 'SCOUT SWEEP',
  adrenaline: 'ADRENALINE BOOST',
  'care-package': 'CARE PACKAGE',
  yardhawk: 'YARDHAWK',
  'piloted-drone': 'PILOTED DRONE',
  'tri-pass': 'TRI-PASS',
  'carpet-bomber': 'CARPET BOMBER',
  'hunter-swarm': 'HUNTER SWARM',
  chopper: 'CHOPPER GUNNER',
  'drone-swarm': 'DRONE SWARM',
  nuke: 'NUKE',
});

/** Killstreaks that put a host-authoritative entity into the world. */
export const WORLD_KILLSTREAK_IDS: readonly Pass65KillstreakId[] = Object.freeze([
  'care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm',
]);

// ---------------------------------------------------------------------------
// Announcement (host broadcast, once per activation)
// ---------------------------------------------------------------------------

export type KillstreakAnnounceMessage = Readonly<{
  type: 'killstreak-announce';
  /** Host id. A guest never authors one; network.ts drops guest-authored copies. */
  by: string;
  matchEpoch: number;
  /** Host-generated activation identity; the de-dup key on every peer. */
  activationId: string;
  ownerId: string;
  ownerTeam: 0 | 1;
  source: Pass65KillstreakId;
  /** Where the killstreak enters or anchors, for the first positional cue. */
  position: SupportVec3;
  nonce: number;
}>;

export type KillstreakAnnounceAdmission = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'forged-host' | 'match-epoch-mismatch' | 'duplicate-activation';
}>;

export const MAX_RETAINED_ANNOUNCEMENTS = 256;

/** Bounded once-per-activation memory shared by host presentation and guest admission. */
export class KillstreakAnnouncementDeduper {
  private readonly seen = new Set<string>();

  has(activationId: string): boolean {
    return this.seen.has(activationId);
  }

  /** Returns true exactly once per activation id. */
  admit(activationId: string): boolean {
    if (this.seen.has(activationId)) return false;
    this.seen.add(activationId);
    if (this.seen.size > MAX_RETAINED_ANNOUNCEMENTS) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }

  reset(): void {
    this.seen.clear();
  }
}

export function admitKillstreakAnnounceMessage(
  message: KillstreakAnnounceMessage,
  context: Readonly<{
    expectedHostId: string | null;
    expectedMatchEpoch: number;
    deduper: KillstreakAnnouncementDeduper;
  }>,
): KillstreakAnnounceAdmission {
  if (!context.expectedHostId || message.by !== context.expectedHostId) {
    return Object.freeze({ accepted: false, reason: 'forged-host' });
  }
  if (message.matchEpoch !== context.expectedMatchEpoch) {
    return Object.freeze({ accepted: false, reason: 'match-epoch-mismatch' });
  }
  if (!context.deduper.admit(message.activationId)) {
    return Object.freeze({ accepted: false, reason: 'duplicate-activation' });
  }
  return Object.freeze({ accepted: true, reason: 'accepted' });
}

export type KillstreakBannerTone = 'own' | 'friendly' | 'hostile';

export type KillstreakBanner = Readonly<{
  label: string;
  headline: string;
  detail: string;
  tone: KillstreakBannerTone;
}>;

export function killstreakAnnouncementBanner(input: Readonly<{
  source: Pass65KillstreakId;
  ownerId: string;
  ownerName: string;
  ownerTeam: 0 | 1;
  localId: string;
  localTeam: 0 | 1 | null;
  freeForAll: boolean;
}>): KillstreakBanner {
  const label = KILLSTREAK_DISPLAY_LABELS[input.source];
  const tone: KillstreakBannerTone = input.ownerId === input.localId
    ? 'own'
    : !input.freeForAll && input.localTeam !== null && input.localTeam === input.ownerTeam ? 'friendly' : 'hostile';
  const prefix = tone === 'own' ? 'YOUR' : tone === 'friendly' ? 'FRIENDLY' : 'ENEMY';
  return Object.freeze({
    label,
    headline: `${prefix} ${label} INBOUND`,
    detail: tone === 'own' ? 'ALL PEERS WARNED' : `CALLED BY ${input.ownerName.toUpperCase()}`,
    tone,
  });
}

/** Minimal element contract so the banner can be driven without a DOM in tests. */
export type KillstreakBannerElement = {
  hidden: boolean;
  dataset: { tone?: string; activationId?: string; source?: string };
  headline: { textContent: string | null };
  detail: { textContent: string | null };
  kicker: { textContent: string | null };
};

/** Binds the shell's `#killstreak-alert` section (small / strong / span) to the element contract. */
export function bindKillstreakBannerElement(root: HTMLElement): KillstreakBannerElement {
  const child = (selector: string): { textContent: string | null } => root.querySelector(selector) ?? { textContent: null };
  return {
    get hidden() { return root.hidden === true; },
    set hidden(value: boolean) { root.hidden = value; },
    dataset: root.dataset,
    kicker: child('small'),
    headline: child('strong'),
    detail: child('span'),
  };
}

export const KILLSTREAK_BANNER_VISIBLE_MS = 4_200;

export type KillstreakBannerState = Readonly<{ activationId: string | null; hideAtMs: number }>;

export function createKillstreakBannerState(): KillstreakBannerState {
  return Object.freeze({ activationId: null, hideAtMs: Number.NEGATIVE_INFINITY });
}

export function showKillstreakBanner(
  element: KillstreakBannerElement,
  banner: KillstreakBanner,
  activationId: string,
  source: Pass65KillstreakId,
  nowMs: number,
): KillstreakBannerState {
  element.kicker.textContent = 'KILLSTREAK';
  element.headline.textContent = banner.headline;
  element.detail.textContent = banner.detail;
  element.dataset.tone = banner.tone;
  element.dataset.activationId = activationId;
  element.dataset.source = source;
  element.hidden = false;
  return Object.freeze({ activationId, hideAtMs: nowMs + KILLSTREAK_BANNER_VISIBLE_MS });
}

/** Hides the banner once its window has elapsed; returns the (possibly cleared) state. */
export function expireKillstreakBanner(
  element: KillstreakBannerElement,
  state: KillstreakBannerState,
  nowMs: number,
): KillstreakBannerState {
  if (state.activationId === null || nowMs < state.hideAtMs) return state;
  element.hidden = true;
  return createKillstreakBannerState();
}

// ---------------------------------------------------------------------------
// Awareness phase projection
// ---------------------------------------------------------------------------

export type KillstreakAwarenessPhase = 'inbound' | 'active' | 'firing' | 'dropping' | 'leaving';

/** A public shot report counts as "firing" for this long after it was reported. */
export const FIRING_PHASE_HOLD_MS = 450;
/** A public drop report counts as "dropping" for this long after it was reported. */
export const DROPPING_PHASE_HOLD_MS = 700;

export type KillstreakActivityLedger = Readonly<{
  lastShotAtMs: ReadonlyMap<string, number>;
  lastDropAtMs: ReadonlyMap<string, number>;
}>;

/**
 * Bounded per-entity memory of the host's public shot/impact reports, so that
 * every peer can derive "firing" and "dropping" without any extra message.
 */
export class KillstreakActivityTracker implements KillstreakActivityLedger {
  readonly lastShotAtMs = new Map<string, number>();
  readonly lastDropAtMs = new Map<string, number>();

  recordShots(shots: readonly KillstreakSupportShotEvent[], nowMs: number): void {
    for (const shot of shots) this.lastShotAtMs.set(shot.entityId, nowMs);
  }

  recordImpacts(impacts: readonly KillstreakImpactEvent[], nowMs: number): void {
    for (const impact of impacts) {
      if (impact.phase === 'drop') this.lastDropAtMs.set(impact.activationId, nowMs);
    }
  }

  /** Forget entities that no longer exist so the maps stay bounded. */
  retain(entities: readonly KillstreakEntitySnapshot[]): void {
    const liveEntityIds = new Set<string>();
    const liveActivationIds = new Set<string>();
    for (const entity of entities) {
      liveEntityIds.add(entity.id);
      liveActivationIds.add(entity.activationId);
    }
    for (const id of this.lastShotAtMs.keys()) if (!liveEntityIds.has(id)) this.lastShotAtMs.delete(id);
    for (const id of this.lastDropAtMs.keys()) if (!liveActivationIds.has(id)) this.lastDropAtMs.delete(id);
  }

  reset(): void {
    this.lastShotAtMs.clear();
    this.lastDropAtMs.clear();
  }
}

export function killstreakAwarenessPhase(
  entity: Pick<KillstreakEntitySnapshot, 'id' | 'activationId' | 'kind' | 'phase'>,
  ledger: KillstreakActivityLedger,
  nowMs: number,
): KillstreakAwarenessPhase {
  const shotAt = ledger.lastShotAtMs.get(entity.id);
  const firing = shotAt !== undefined && nowMs - shotAt <= FIRING_PHASE_HOLD_MS;
  const dropAt = ledger.lastDropAtMs.get(entity.activationId);
  const dropping = dropAt !== undefined && nowMs - dropAt <= DROPPING_PHASE_HOLD_MS;
  if (entity.phase === 'inbound') return 'inbound';
  if (entity.phase === 'outbound') return 'leaving';
  if (entity.kind === 'chopper') return dropping ? 'dropping' : firing ? 'firing' : 'active';
  if (entity.kind === 'aircraft') return dropping ? 'dropping' : 'active';
  if (entity.kind === 'drone') return firing ? 'firing' : 'active';
  return 'active';
}

/** Human-readable killstreak identity for a replicated entity. */
export function killstreakEntitySourceId(entity: Pick<KillstreakEntitySnapshot, 'kind' | 'mode' | 'id'>): Pass65KillstreakId {
  if (entity.kind === 'chopper') return 'chopper';
  if (entity.kind === 'drone') return entity.mode === 'swarm' ? 'drone-swarm' : 'piloted-drone';
  if (entity.kind === 'care-crate') return 'care-package';
  return /-carpet-/.test(entity.id) ? 'carpet-bomber' : 'care-package';
}

// ---------------------------------------------------------------------------
// Positional audio projection
// ---------------------------------------------------------------------------

export type KillstreakAudioFamily = 'chopper' | 'aircraft' | 'drone';

export type KillstreakFlightAudioSource = {
  id: string;
  family: KillstreakAudioFamily;
  phase: KillstreakAwarenessPhase;
  position: { x: number; y: number; z: number };
  distanceM: number;
};

/** Attenuation curve shared by every killstreak flight loop on every peer. */
export const KILLSTREAK_AUDIO_ATTENUATION = Object.freeze({
  /** Full gain inside this radius. */
  referenceDistanceM: 10,
  /** Silence beyond this radius; keeps far entities out of the voice budget. */
  maxDistanceM: 220,
  /** Inverse-power rolloff exponent between reference and max. */
  rolloff: 1.35,
  /** Altitude above the listener that halves the loop. */
  altitudeHalfGainM: 70,
  /** Gain floor for a live-but-high source so an inbound aircraft is never silent. */
  altitudeFloor: 0.42,
});

/**
 * Distance + altitude attenuation in [0, 1]. Monotonically non-increasing in
 * distance, exactly 1 at the reference distance and 0 at/after the max.
 */
export function killstreakAudioGain(distanceM: number, altitudeAboveListenerM = 0): number {
  const curve = KILLSTREAK_AUDIO_ATTENUATION;
  if (!Number.isFinite(distanceM) || distanceM >= curve.maxDistanceM) return 0;
  const clampedDistance = Math.max(0, distanceM);
  const distanceGain = clampedDistance <= curve.referenceDistanceM
    ? 1
    : Math.pow(curve.referenceDistanceM / clampedDistance, curve.rolloff)
      * (1 - (clampedDistance - curve.referenceDistanceM) / (curve.maxDistanceM - curve.referenceDistanceM));
  const altitude = Number.isFinite(altitudeAboveListenerM) ? Math.max(0, altitudeAboveListenerM) : 0;
  const altitudeGain = Math.max(curve.altitudeFloor, 1 - 0.5 * (altitude / curve.altitudeHalfGainM));
  return Math.min(1, Math.max(0, distanceGain * altitudeGain));
}

export const MAX_KILLSTREAK_FLIGHT_AUDIO_SOURCES = 6;

/**
 * Allocation-bounded collector: reuses a fixed pool, admits the nearest
 * non-chopper flight sources (aircraft and drones - choppers keep their own
 * rotor loop) and returns them ordered nearest-first.
 */
export class KillstreakFlightAudioCollector {
  private readonly pool: KillstreakFlightAudioSource[] = Array.from(
    { length: MAX_KILLSTREAK_FLIGHT_AUDIO_SOURCES },
    () => ({ id: '', family: 'drone', phase: 'active', position: { x: 0, y: 0, z: 0 }, distanceM: 0 }),
  );
  private readonly active: KillstreakFlightAudioSource[] = [];

  collect(
    entities: readonly KillstreakEntitySnapshot[],
    listener: SpatialPoint,
    ledger: KillstreakActivityLedger,
    nowMs: number,
  ): readonly KillstreakFlightAudioSource[] {
    this.active.length = 0;
    for (const entity of entities) {
      if (entity.expiresInMs <= 0 || (entity.kind !== 'aircraft' && entity.kind !== 'drone')) continue;
      const distanceM = Math.hypot(
        entity.position[0] - listener.x,
        entity.position[1] - listener.y,
        entity.position[2] - listener.z,
      );
      if (distanceM >= KILLSTREAK_AUDIO_ATTENUATION.maxDistanceM) continue;
      // Insert nearest-first into the bounded pool; the farthest falls off.
      let index = this.active.length;
      while (index > 0 && this.active[index - 1].distanceM > distanceM) index -= 1;
      if (index >= this.pool.length) continue;
      let slot: KillstreakFlightAudioSource;
      if (this.active.length < this.pool.length) {
        slot = this.pool[this.active.length];
        this.active.push(slot);
      } else {
        slot = this.active[this.active.length - 1];
      }
      for (let shift = this.active.length - 1; shift > index; shift -= 1) this.active[shift] = this.active[shift - 1];
      this.active[index] = slot;
      slot.id = entity.id;
      slot.family = entity.kind;
      slot.phase = killstreakAwarenessPhase(entity, ledger, nowMs);
      slot.position.x = entity.position[0];
      slot.position.y = entity.position[1];
      slot.position.z = entity.position[2];
      slot.distanceM = distanceM;
    }
    return this.active;
  }
}

export type SupportDropCue = Readonly<{ kind: 'missile' | 'bomb'; emitter: SpatialPoint | undefined }>;

/** Which positional release sound a public drop report plays, on every peer. */
export function supportDropCue(impact: KillstreakImpactEvent): SupportDropCue | null {
  if (impact.phase !== 'drop') return null;
  const origin = impact.launchPosition ?? (impact.source === 'carpet-bomber' ? impact.position : undefined);
  const emitter = origin ? { x: origin[0], y: origin[1], z: origin[2] } : undefined;
  return Object.freeze({ kind: impact.source === 'chopper' ? 'missile' : 'bomb', emitter });
}

// ---------------------------------------------------------------------------
// Damage source cue (victim side)
// ---------------------------------------------------------------------------

export type KillstreakDamageSourceCue = Readonly<{
  sourceId: string;
  label: string;
  source: Pass65KillstreakId;
  /** World position the indicator points at: the authoritative weapon origin. */
  position: SupportVec3;
  damage: number;
  atMs: number;
}>;

/** The victim's cue: bearing to the killstreak itself, never to its controller's body. */
export function killstreakDamageSourceCue(event: KillstreakDamageEvent, nowMs: number): KillstreakDamageSourceCue {
  return Object.freeze({
    sourceId: `killstreak:${event.activationId}`,
    label: KILLSTREAK_DISPLAY_LABELS[event.source],
    source: event.source,
    position: event.origin,
    damage: event.damage,
    atMs: nowMs,
  });
}
