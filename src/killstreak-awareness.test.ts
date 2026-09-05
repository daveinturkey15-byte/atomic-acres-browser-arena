import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import { HostKillstreakRuntime, type KillstreakDamageEvent, type KillstreakEntitySnapshot, type KillstreakImpactEvent } from './killstreak-runtime';
import {
  isKillstreakHostAuthorityMessage,
  isKillstreakProtocolMessage,
  killstreakMessageBelongsToPlayer,
} from './killstreak-protocol';
import { isGameMessage, isHostAuthorityMessage, messageBelongsToPlayer } from './protocol';
import { GAMEPAD_SUPPORT_LABELS } from './field-support';
import { KILLSTREAK_DISPLAY_LABELS } from './killstreak-awareness';
import {
  KILLSTREAK_AUDIO_ATTENUATION,
  KILLSTREAK_BANNER_VISIBLE_MS,
  KillstreakActivityTracker,
  KillstreakAnnouncementDeduper,
  KillstreakFlightAudioCollector,
  MAX_KILLSTREAK_FLIGHT_AUDIO_SOURCES,
  MAX_RETAINED_ANNOUNCEMENTS,
  admitKillstreakAnnounceMessage,
  createKillstreakBannerState,
  expireKillstreakBanner,
  killstreakAnnouncementBanner,
  killstreakAudioGain,
  killstreakAwarenessPhase,
  killstreakDamageSourceCue,
  showKillstreakBanner,
  supportDropCue,
  type KillstreakAnnounceMessage,
  type KillstreakBannerElement,
} from './killstreak-awareness';

const loadout = parseKillstreakLoadout({ schemaVersion: 1, slots: ['scout-sweep', 'yardhawk', 'carpet-bomber', 'chopper', 'drone-swarm'] });
const world = { bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40, floorY: 0, ceilingY: 32 }, targets: [] } as const;

function hostedRuntime(): HostKillstreakRuntime {
  const runtime = new HostKillstreakRuntime(7);
  runtime.registerActor('host', 0, 1, loadout);
  runtime.registerActor('guest-a', 1, 1, loadout);
  runtime.registerActor('guest-b', 1, 1, loadout);
  for (let index = 0; index < 15; index += 1) runtime.recordEligibleElimination('host', 'weapon');
  return runtime;
}

function activateChopper(runtime: HostKillstreakRuntime, nowMs = 1_000) {
  return runtime.activate({
    by: 'host', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 4,
    activationId: 'activation-chopper-awareness', expectedId: 'chopper', anchor: [0, 0, 0],
  }, nowMs, world);
}

function announce(overrides: Partial<Record<keyof KillstreakAnnounceMessage, unknown>> = {}): KillstreakAnnounceMessage {
  return {
    type: 'killstreak-announce', by: 'host', matchEpoch: 7, activationId: 'ks-activation-7-1',
    ownerId: 'host', ownerTeam: 0, source: 'chopper', position: [1, 20, -3], nonce: 11,
    ...overrides,
  } as KillstreakAnnounceMessage;
}

function fakeBanner(): KillstreakBannerElement {
  return { hidden: true, dataset: {}, headline: { textContent: null }, detail: { textContent: null }, kicker: { textContent: null } };
}

describe('HF-509 killstreak-announce protocol', () => {
  it('has an exact host-only shape and is public to every peer', () => {
    const message = announce();
    expect(isKillstreakProtocolMessage(message)).toBe(true);
    expect(isGameMessage(message)).toBe(true);
    expect(isKillstreakHostAuthorityMessage(message)).toBe(true);
    expect(isHostAuthorityMessage(message)).toBe(true);
    for (const peer of ['host', 'guest-a', 'guest-b']) {
      expect(killstreakMessageBelongsToPlayer(message, peer)).toBe(true);
      expect(messageBelongsToPlayer(message, peer)).toBe(true);
    }
    expect(killstreakMessageBelongsToPlayer(message, '')).toBe(false);
  });

  it('rejects malformed, unbounded, cross-epoch and extra-key announcements', () => {
    expect(isKillstreakProtocolMessage(announce({ source: 'not-a-killstreak' }))).toBe(false);
    expect(isKillstreakProtocolMessage(announce({ activationId: 'ks-activation-8-1' }))).toBe(false);
    expect(isKillstreakProtocolMessage(announce({ activationId: 'activation-guest-supplied' }))).toBe(false);
    expect(isKillstreakProtocolMessage(announce({ ownerTeam: 2 }))).toBe(false);
    expect(isKillstreakProtocolMessage(announce({ position: [0, Number.NaN, 0] }))).toBe(false);
    expect(isKillstreakProtocolMessage(announce({ position: [0, 0] }))).toBe(false);
    expect(isKillstreakProtocolMessage(announce({ by: 'bad id with spaces' }))).toBe(false);
    expect(isKillstreakProtocolMessage(announce({ nonce: -1 }))).toBe(false);
    expect(isKillstreakProtocolMessage({ ...announce(), extra: true })).toBe(false);
    const { position: _position, ...missing } = announce();
    expect(isKillstreakProtocolMessage(missing)).toBe(false);
  });

  it('admits only the authenticated host, the current epoch, and each activation once', () => {
    const deduper = new KillstreakAnnouncementDeduper();
    const context = { expectedHostId: 'host', expectedMatchEpoch: 7, deduper };
    expect(admitKillstreakAnnounceMessage(announce({ by: 'guest-a' }), context)).toEqual({ accepted: false, reason: 'forged-host' });
    expect(admitKillstreakAnnounceMessage(announce(), { ...context, expectedHostId: null })).toEqual({ accepted: false, reason: 'forged-host' });
    expect(admitKillstreakAnnounceMessage(announce({ matchEpoch: 6 }), context)).toEqual({ accepted: false, reason: 'match-epoch-mismatch' });
    expect(admitKillstreakAnnounceMessage(announce(), context)).toEqual({ accepted: true, reason: 'accepted' });
    // A replay with a fresh nonce is still the same activation: exactly one banner.
    expect(admitKillstreakAnnounceMessage(announce({ nonce: 12 }), context)).toEqual({ accepted: false, reason: 'duplicate-activation' });
    expect(admitKillstreakAnnounceMessage(announce({ activationId: 'ks-activation-7-2', nonce: 13 }), context).accepted).toBe(true);
  });

  it('keeps the de-dup memory bounded without forgetting the newest activation', () => {
    const deduper = new KillstreakAnnouncementDeduper();
    for (let index = 0; index < MAX_RETAINED_ANNOUNCEMENTS + 5; index += 1) expect(deduper.admit(`ks-activation-7-${index}`)).toBe(true);
    expect(deduper.has(`ks-activation-7-${MAX_RETAINED_ANNOUNCEMENTS + 4}`)).toBe(true);
    expect(deduper.has('ks-activation-7-0')).toBe(false);
    expect(deduper.admit(`ks-activation-7-${MAX_RETAINED_ANNOUNCEMENTS + 4}`)).toBe(false);
    deduper.reset();
    expect(deduper.admit('ks-activation-7-0')).toBe(true);
  });
});

describe('HF-509 replication to every guest', () => {
  it('projects the same chopper entity, position and phase to two guests and the controller each snapshot', () => {
    const runtime = hostedRuntime();
    const admission = activateChopper(runtime);
    expect(admission.accepted).toBe(true);
    expect(admission.activationId).toMatch(/^ks-activation-7-/);
    for (const nowMs of [1_000, 1_500, 4_000]) {
      runtime.advance(nowMs, world);
      const host = runtime.snapshotFor('host', nowMs);
      const guestA = runtime.snapshotFor('guest-a', nowMs);
      const guestB = runtime.snapshotFor('guest-b', nowMs);
      const chopper = host.entities.find((entity) => entity.kind === 'chopper');
      expect(chopper).toBeDefined();
      for (const guest of [guestA, guestB]) {
        const replica = guest.entities.find((entity) => entity.id === chopper!.id);
        expect(replica).toBeDefined();
        expect(replica!.position).toEqual(chopper!.position);
        expect(replica!.phase).toBe(chopper!.phase);
        expect(replica!.activationId).toBe(admission.activationId);
        expect(replica!.ownerId).toBe('host');
        expect(['inbound', 'orbiting', 'outbound']).toContain(replica!.phase);
      }
      // Every recipient snapshot is a valid host-authority message for that recipient only.
      for (const [recipient, snapshot] of [['guest-a', guestA], ['guest-b', guestB]] as const) {
        const message = { type: 'killstreak-state' as const, by: 'host', forPlayerId: recipient, snapshot, nonce: nowMs };
        expect(isKillstreakProtocolMessage(message)).toBe(true);
        expect(killstreakMessageBelongsToPlayer(message, recipient)).toBe(true);
        expect(killstreakMessageBelongsToPlayer(message, recipient === 'guest-a' ? 'guest-b' : 'guest-a')).toBe(false);
      }
    }
  });

  it('derives inbound / active / firing / dropping / leaving from the replicated phase plus public reports', () => {
    const tracker = new KillstreakActivityTracker();
    const chopper = { id: 'ks-7-chopper-1', activationId: 'ks-activation-7-1', kind: 'chopper', phase: 'inbound' } as const;
    expect(killstreakAwarenessPhase(chopper, tracker, 0)).toBe('inbound');
    expect(killstreakAwarenessPhase({ ...chopper, phase: 'orbiting' }, tracker, 0)).toBe('active');
    tracker.recordShots([{ activationId: chopper.activationId, entityId: chopper.id, source: 'chopper', ownerId: 'host', ownerTeam: 0, ordinal: 0, atMs: 0 }], 1_000);
    expect(killstreakAwarenessPhase({ ...chopper, phase: 'orbiting' }, tracker, 1_200)).toBe('firing');
    expect(killstreakAwarenessPhase({ ...chopper, phase: 'orbiting' }, tracker, 2_000)).toBe('active');
    tracker.recordImpacts([{ activationId: chopper.activationId, source: 'chopper', ordinal: 0, phase: 'drop', position: [0, 0, 0], impactAtMs: 2_780, atMs: 2_000 }], 2_000);
    expect(killstreakAwarenessPhase({ ...chopper, phase: 'orbiting' }, tracker, 2_100)).toBe('dropping');
    expect(killstreakAwarenessPhase({ ...chopper, phase: 'outbound' }, tracker, 2_100)).toBe('leaving');
    const bomber = { id: 'ks-7-carpet-2', activationId: 'ks-activation-7-2', kind: 'aircraft', phase: 'active' } as const;
    expect(killstreakAwarenessPhase(bomber, tracker, 3_000)).toBe('active');
    tracker.recordImpacts([{ activationId: bomber.activationId, source: 'carpet-bomber', ordinal: 3, phase: 'drop', position: [0, 0, 0], impactAtMs: 3_400, atMs: 3_000 }], 3_000);
    expect(killstreakAwarenessPhase(bomber, tracker, 3_500)).toBe('dropping');
    expect(killstreakAwarenessPhase(bomber, tracker, 5_000)).toBe('active');
    const drone = { id: 'ks-7-swarm-drone-3', activationId: 'ks-activation-7-3', kind: 'drone', phase: 'active' } as const;
    tracker.recordShots([{ activationId: drone.activationId, entityId: drone.id, source: 'drone-swarm', ownerId: 'host', ownerTeam: 0, ordinal: 1, atMs: 0 }], 6_000);
    expect(killstreakAwarenessPhase(drone, tracker, 6_100)).toBe('firing');
    expect(killstreakAwarenessPhase({ ...drone, phase: 'reloading' }, tracker, 9_000)).toBe('active');
    tracker.retain([]);
    expect(tracker.lastShotAtMs.size).toBe(0);
    expect(tracker.lastDropAtMs.size).toBe(0);
  });
});

describe('HF-509 positional audio projection', () => {
  it('attenuates monotonically from full gain at the reference distance to silence at the max', () => {
    const { referenceDistanceM, maxDistanceM, altitudeFloor } = KILLSTREAK_AUDIO_ATTENUATION;
    expect(killstreakAudioGain(0)).toBe(1);
    expect(killstreakAudioGain(referenceDistanceM)).toBe(1);
    expect(killstreakAudioGain(maxDistanceM)).toBe(0);
    expect(killstreakAudioGain(maxDistanceM + 1)).toBe(0);
    expect(killstreakAudioGain(Number.NaN)).toBe(0);
    expect(killstreakAudioGain(Number.POSITIVE_INFINITY)).toBe(0);
    let previous = 1;
    for (let distance = 0; distance <= maxDistanceM; distance += 2.5) {
      const gain = killstreakAudioGain(distance);
      expect(gain).toBeGreaterThanOrEqual(0);
      expect(gain).toBeLessThanOrEqual(previous);
      previous = gain;
    }
    // Audible where it matters: a chopper orbiting 60 m out must still read.
    expect(killstreakAudioGain(60)).toBeGreaterThan(0.05);
    expect(killstreakAudioGain(30)).toBeGreaterThan(killstreakAudioGain(60));
    // Altitude thins the loop but never mutes a live source.
    expect(killstreakAudioGain(20, 70)).toBeCloseTo(killstreakAudioGain(20) * 0.5, 5);
    expect(killstreakAudioGain(20, 10_000)).toBeCloseTo(killstreakAudioGain(20) * altitudeFloor, 5);
    expect(killstreakAudioGain(20, -50)).toBe(killstreakAudioGain(20));
  });

  it('admits the nearest flight sources into a bounded reused pool, choppers excluded', () => {
    const collector = new KillstreakFlightAudioCollector();
    const tracker = new KillstreakActivityTracker();
    const base: KillstreakEntitySnapshot = {
      id: 'ks-7-swarm-drone-0', activationId: 'ks-activation-7-1', ownerId: 'host', team: 0, kind: 'drone', mode: 'swarm', phase: 'active',
      position: [0, 10, 0], velocity: [0, 0, 0], attitude: [0, 0, 0], health: 50, expiresInMs: 5_000, magazine: 10, reserveClips: null,
      gunProfileId: 'swarm-drone-cannon-v1' as never, gunController: null, missileAmmo: null, missileCooldownMs: null, taserCharges: null,
      captureActorId: null, captureProgress: null, revealedReward: null, revision: 1,
    };
    const entities: KillstreakEntitySnapshot[] = [];
    for (let index = 0; index < 12; index += 1) {
      entities.push({ ...base, id: `ks-7-swarm-drone-${index}`, position: [(12 - index) * 9, 10, 0] });
    }
    entities.push({ ...base, id: 'ks-7-chopper-9', kind: 'chopper', mode: null, phase: 'orbiting', position: [1, 1, 1] });
    entities.push({ ...base, id: 'ks-7-carpet-8', kind: 'aircraft', mode: null, phase: 'inbound', position: [5, 30, 5] });
    entities.push({ ...base, id: 'ks-7-swarm-drone-dead', expiresInMs: 0, position: [0, 0, 0] });
    entities.push({ ...base, id: 'ks-7-swarm-drone-far', position: [KILLSTREAK_AUDIO_ATTENUATION.maxDistanceM + 5, 0, 0] });
    const first = collector.collect(entities, { x: 0, y: 0, z: 0 }, tracker, 0);
    expect(first).toHaveLength(MAX_KILLSTREAK_FLIGHT_AUDIO_SOURCES);
    expect(first.map((source) => source.id)).not.toContain('ks-7-chopper-9');
    expect(first.map((source) => source.id)).not.toContain('ks-7-swarm-drone-dead');
    expect(first.map((source) => source.id)).not.toContain('ks-7-swarm-drone-far');
    for (let index = 1; index < first.length; index += 1) expect(first[index].distanceM).toBeGreaterThanOrEqual(first[index - 1].distanceM);
    expect(first[0]).toMatchObject({ id: 'ks-7-swarm-drone-11', family: 'drone', phase: 'active', distanceM: Math.hypot(9, 10) });
    expect(first.find((source) => source.id === 'ks-7-carpet-8')).toMatchObject({ family: 'aircraft', phase: 'inbound' });
    const pooled = first.map((source) => source);
    const second = collector.collect(entities, { x: 0, y: 0, z: 0 }, tracker, 0);
    expect(second).toBe(first);
    for (const source of second) expect(pooled).toContain(source);
    expect(collector.collect([], { x: 0, y: 0, z: 0 }, tracker, 0)).toHaveLength(0);
  });

  it('plays the missile at its rail and the bomb at its drop point on every peer', () => {
    const drop: KillstreakImpactEvent = { activationId: 'ks-activation-7-1', source: 'carpet-bomber', ordinal: 2, phase: 'drop', position: [4, 28, 6], impactAtMs: 900, atMs: 500 };
    expect(supportDropCue(drop)).toEqual({ kind: 'bomb', emitter: { x: 4, y: 28, z: 6 } });
    expect(supportDropCue({ ...drop, source: 'chopper', ordinal: 0, impactAtMs: 1_280, launchPosition: [1, 2, 3] })).toEqual({ kind: 'missile', emitter: { x: 1, y: 2, z: 3 } });
    expect(supportDropCue({ ...drop, source: 'chopper', ordinal: 0, impactAtMs: 1_280 })).toEqual({ kind: 'missile', emitter: undefined });
    expect(supportDropCue({ ...drop, phase: 'impact', atMs: 900 })).toBeNull();
  });
});

describe('HF-509 banner and damage source', () => {
  it('names the killstreak and tells own, friendly and enemy apart', () => {
    const input = { source: 'chopper' as const, ownerId: 'host', ownerName: 'Dave', ownerTeam: 0 as const, localId: 'guest-a', localTeam: 1 as const, freeForAll: false };
    expect(killstreakAnnouncementBanner(input)).toEqual({ label: 'CHOPPER GUNNER', headline: 'ENEMY CHOPPER GUNNER INBOUND', detail: 'CALLED BY DAVE', tone: 'hostile' });
    expect(killstreakAnnouncementBanner({ ...input, localTeam: 0 })).toMatchObject({ headline: 'FRIENDLY CHOPPER GUNNER INBOUND', tone: 'friendly' });
    expect(killstreakAnnouncementBanner({ ...input, localTeam: 0, freeForAll: true })).toMatchObject({ tone: 'hostile' });
    expect(killstreakAnnouncementBanner({ ...input, localId: 'host' })).toMatchObject({ headline: 'YOUR CHOPPER GUNNER INBOUND', tone: 'own' });
    expect(killstreakAnnouncementBanner({ ...input, source: 'carpet-bomber' })).toMatchObject({ label: 'CARPET BOMBER' });
    expect(killstreakAnnouncementBanner({ ...input, source: 'drone-swarm' })).toMatchObject({ label: 'DRONE SWARM' });
    expect(killstreakAnnouncementBanner({ ...input, source: 'piloted-drone' })).toMatchObject({ label: 'PILOTED DRONE' });
  });

  it('shows the banner once and hides it after its window', () => {
    const element = fakeBanner();
    const banner = killstreakAnnouncementBanner({ source: 'drone-swarm', ownerId: 'host', ownerName: 'Dave', ownerTeam: 0, localId: 'guest-a', localTeam: 1, freeForAll: false });
    let state = showKillstreakBanner(element, banner, 'ks-activation-7-1', 'drone-swarm', 1_000);
    expect(element.hidden).toBe(false);
    expect(element.headline.textContent).toBe('ENEMY DRONE SWARM INBOUND');
    expect(element.dataset).toEqual({ tone: 'hostile', activationId: 'ks-activation-7-1', source: 'drone-swarm' });
    state = expireKillstreakBanner(element, state, 1_000 + KILLSTREAK_BANNER_VISIBLE_MS - 1);
    expect(element.hidden).toBe(false);
    state = expireKillstreakBanner(element, state, 1_000 + KILLSTREAK_BANNER_VISIBLE_MS);
    expect(element.hidden).toBe(true);
    expect(state).toEqual(createKillstreakBannerState());
    expect(expireKillstreakBanner(element, state, 99_999)).toBe(state);
  });

  it('points the victim at the killstreak weapon origin and labels it', () => {
    const event: KillstreakDamageEvent = {
      resultId: 'ks-result-7-1', activationId: 'ks-activation-7-1', source: 'chopper', ownerId: 'host', targetId: 'guest-a', targetLifeId: 1,
      targetPosition: [0, 0, 0], damage: 18, origin: [12, 26, -8], endpoint: [0, 1, 0], tracerOrigin: [12, 25, -8], atMs: 500,
    };
    expect(killstreakDamageSourceCue(event, 900)).toEqual({
      sourceId: 'killstreak:ks-activation-7-1', label: 'CHOPPER GUNNER', source: 'chopper', position: [12, 26, -8], damage: 18, atMs: 900,
    });
    expect(killstreakDamageSourceCue({ ...event, source: 'carpet-bomber' }, 900)).toMatchObject({ label: 'CARPET BOMBER' });
  });
});

// ---------------------------------------------------------------------------
// Candidate 8 merge reconciliation (integrator)
// ---------------------------------------------------------------------------
// `v7-care-package-grant-once` moved the killstreak label table verbatim out of
// `legacy-main.ts` into `field-support.ts` (to pay the legacy size ratchet);
// `v7-killstreak-awareness` independently introduced `KILLSTREAK_DISPLAY_LABELS`
// here for the announce banner. Both tables are authored, identical, and now
// live in the same build. Rather than couple this pure module to
// `field-support.ts`'s dependency chain, this test pins them equal so the two
// copies cannot drift: a label added or renamed on one side reds this line.
describe('candidate 8: the two authored killstreak label tables agree', () => {
  it('matches the field-support gamepad/HUD label table exactly', () => {
    expect({ ...KILLSTREAK_DISPLAY_LABELS }).toEqual({ ...GAMEPAD_SUPPORT_LABELS });
  });
});
