import { describe, expect, it } from 'vitest';
import {
  HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_FLOOR_MS,
  HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_MS,
  HOST_MIGRATION_PROMOTION_ENABLED,
  HOST_SUCCESSION_MANDATE_RENEWAL_MS,
  acceptAuthorityMirror,
  acceptHostPromoted,
  acceptSuccessionMandate,
  buildHostPromotedMessage,
  createHostSuccessionPublisher,
  createSuccessorHoldings,
  evaluateSelfPromotion,
  observeHostPromotion,
  planAuthorityMirrorSend,
  publishSuccessionMandate,
  type SuccessorHoldings,
} from './host-succession-wire';
import {
  HOST_MATCH_CHECKPOINT_SCHEMA_VERSION,
  HOST_MATCH_CHECKPOINT_TTL_MS,
  checkpointRailgunAuthority,
  isHostMatchCheckpoint,
  restoreGuestAuthorities,
  type GuestAuthorityCheckpoint,
  type HostMatchCheckpoint,
} from './host-match-checkpoint';
import {
  HOST_SUCCESSION_MANDATE_TTL_MS,
  MIN_SURVIVORS_FOR_MIGRATION,
  evaluateHostLoss,
  type HostLossAssessment,
  type SuccessionRoster,
} from './host-migration';
import { CLIENT_HOST_SILENCE_TIMEOUT_MS } from './network';
import { isGameMessage, MULTIPLAYER_PROTOCOL_VERSION, type WeaponId } from './protocol';
import { WEAPON_IDS } from './protocol';
import { createGuestCombatInventory } from './guest-combat-inventory-authority';
import { createRailgunAuthorityState } from './railgun-authority';
import { FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION } from './flare-authority-checkpoint';
import { isHostSuccessionProtocolMessage, type HostAuthorityMirrorMessage } from './host-succession-protocol';

const ROOM = 'atomic-room-a';
const HOST_ID = 'host-1';
const SUCCESSOR_ID = 'guest-1';
const OTHER_GUEST_ID = 'guest-2';
const LOBBY_REVISION = 17;
/** Host-clock epoch. The guest fixtures run a different clock on purpose. */
const HOST_SAVED_AT = 1_700_000_000_000;
const ACTIVE_AT = HOST_SAVED_AT - 45_000;
const MATCH_EPOCH = Math.max(1, ACTIVE_AT % 1_000_000_000);

function weaponCounters(value: number): Record<WeaponId, number> {
  return Object.fromEntries(WEAPON_IDS.map((weapon) => [weapon, value])) as Record<WeaponId, number>;
}

function guestAuthority(id: string, name: string, team: 0 | 1, continuity: number): GuestAuthorityCheckpoint {
  return {
    snapshot: {
      id, name, team,
      x: -3, y: 1.7, z: 6, yaw: -0.2, pitch: 0.1,
      hp: 100,
      kills: team === 1 ? 2 : 6,
      deaths: team === 1 ? 4 : 1,
      primary: 'carbine', secondary: 'pistol', grenade: 'frag',
      weapon: 'carbine', stance: 'stand', seq: 119,
    },
    continuity,
    combatInventory: createGuestCombatInventory('carbine', 'pistol', 1),
    health: { hp: 100, alive: true, respawnRemainingMs: 0, diedAgeMs: null, lastDamageAgeMs: 0, lastAdvancedAgeMs: 0 },
  };
}

/** Three humans, no bots, on atomic-acres. `guest-1` is the elected successor. */
function hostCheckpoint(overrides: Partial<HostMatchCheckpoint> = {}): HostMatchCheckpoint {
  const savedAtEpochMs = overrides.savedAtEpochMs ?? HOST_SAVED_AT;
  const expiresAtEpochMs = savedAtEpochMs + HOST_MATCH_CHECKPOINT_TTL_MS;
  return {
    schemaVersion: HOST_MATCH_CHECKPOINT_SCHEMA_VERSION,
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    savedAtEpochMs,
    expiresAtEpochMs,
    roomCode: ROOM,
    activeAtEpochMs: ACTIVE_AT,
    matchEpoch: MATCH_EPOCH,
    phase: 'active',
    elapsedSinceActiveMs: 45_000,
    lobbyRevision: LOBBY_REVISION,
    config: {
      arenaId: 'atomic-acres', mode: 'ffa', capacity: 4,
      hostedBotCount: 0, autoBalance: true, durationMs: 300_000,
    },
    members: [
      { id: HOST_ID, name: 'HOST', team: 0, ready: true, connected: true, pingMs: 0, dhv: 10 },
      { id: SUCCESSOR_ID, name: 'ALPHA', team: 1, ready: true, connected: true, pingMs: 42, dhv: 10 },
      { id: OTHER_GUEST_ID, name: 'BRAVO', team: 0, ready: true, connected: true, pingMs: 55, dhv: 10 },
    ],
    scores: [
      { id: HOST_ID, kills: 4, deaths: 2, damageDealt: 810, damageTaken: 400 },
      { id: SUCCESSOR_ID, kills: 2, deaths: 4, damageDealt: 400, damageTaken: 810 },
      { id: OTHER_GUEST_ID, kills: 6, deaths: 1, damageDealt: 1_200, damageTaken: 220 },
    ],
    hostPlayer: {
      id: HOST_ID, name: 'HOST', team: 0,
      x: 1, y: 1.7, z: -2, yaw: 0.4, pitch: -0.1, vx: 0.2, vy: 0, vz: -0.1,
      hp: 72, alive: true, kills: 4, deaths: 2,
      primary: 'm4a1', secondary: 'pistol', grenade: 'frag', weapon: 'm4a1',
      stance: 'crouch', grenades: 1,
      ammo: weaponCounters(9), reserve: weaponCounters(40),
      continuity: 3, seq: 221, respawnRemainingMs: 0, invulnerabilityRemainingMs: 0,
    },
    guests: [
      guestAuthority(SUCCESSOR_ID, 'ALPHA', 1, 5),
      guestAuthority(OTHER_GUEST_ID, 'BRAVO', 0, 2),
    ],
    bots: [],
    resumeTokenDigests: [
      { playerId: SUCCESSOR_ID, sha256: 'a'.repeat(64), expiresAtEpochMs },
      { playerId: OTHER_GUEST_ID, sha256: 'b'.repeat(64), expiresAtEpochMs },
    ],
    flareProjectiles: { schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION, snapshotSeq: 0, effects: [] },
    flareShotFeedback: [],
    railgun: checkpointRailgunAuthority(createRailgunAuthorityState('disabled', 0, 0, 7), 1_000)!,
    succession: { term: 1, successorId: SUCCESSOR_ID },
    ...overrides,
  };
}

function roster(overrides: Partial<SuccessionRoster> = {}): SuccessionRoster {
  return {
    revision: LOBBY_REVISION,
    hostId: HOST_ID,
    members: [
      { id: HOST_ID, connected: true },
      { id: SUCCESSOR_ID, connected: true },
      { id: OTHER_GUEST_ID, connected: true },
    ],
    ...overrides,
  };
}

/** `host-lost`: the transport's 90s rejoin window has expired. */
const HOST_LOST: HostLossAssessment = evaluateHostLoss({
  role: 'client',
  eventChannelOpen: false,
  reconnectPending: false,
  lastValidHostMessageMonoMs: 1_000,
  reconnectDeadlineMonoMs: 91_000,
  lobbyClosedByHost: false,
  nowMonoMs: 91_000,
});

const STILL_RECONNECTING: HostLossAssessment = evaluateHostLoss({
  role: 'client',
  eventChannelOpen: false,
  reconnectPending: true,
  lastValidHostMessageMonoMs: 1_000,
  reconnectDeadlineMonoMs: 91_000,
  lobbyClosedByHost: false,
  nowMonoMs: 20_000,
});

/**
 * Run the whole host half and hand back the message that goes on the wire.
 * `nowEpochMs` is the HOST's clock.
 */
function shipMirror(options: { checkpoint?: HostMatchCheckpoint; nowEpochMs?: number } = {}) {
  const published = publishSuccessionMandate(createHostSuccessionPublisher(1), {
    roster: roster(),
    roomCode: ROOM,
    nowEpochMs: options.nowEpochMs ?? HOST_SAVED_AT,
    nonce: 1,
  });
  expect(published.broadcast).not.toBeNull();
  const plan = planAuthorityMirrorSend(published.publisher, {
    checkpoint: options.checkpoint ?? hostCheckpoint(),
    nowMonoMs: 10_000,
    nowEpochMs: options.nowEpochMs ?? HOST_SAVED_AT,
    nonce: 2,
  });
  return { published, plan };
}

/** The guest side of a clean handshake: mandate then mirror, both accepted. */
function successorHoldings(options: {
  receivedAtEpochMs?: number;
  hostClockOffsetMs?: number | null;
  checkpoint?: HostMatchCheckpoint;
} = {}): { holdings: SuccessorHoldings; mirror: HostAuthorityMirrorMessage } {
  const { published, plan } = shipMirror({ checkpoint: options.checkpoint });
  expect(plan.send).not.toBeNull();
  const afterMandate = acceptSuccessionMandate(createSuccessorHoldings(), published.broadcast!, ROOM);
  expect(afterMandate.accepted).toBe(true);
  const accepted = acceptAuthorityMirror(afterMandate.holdings, plan.send!, {
    selfId: SUCCESSOR_ID,
    roomCode: ROOM,
    receivedAtEpochMs: options.receivedAtEpochMs ?? HOST_SAVED_AT + 120,
    // `??` would swallow a deliberate null, which is the "no offset measured" case.
    hostClockOffsetMs: 'hostClockOffsetMs' in options ? options.hostClockOffsetMs! : 0,
  });
  expect(accepted.reason).toBe('accepted');
  return { holdings: accepted.holdings, mirror: plan.send! };
}

describe('HF-325 host succession wire — host side', () => {
  it('mints and broadcasts a mandate naming the elected successor', () => {
    const { publisher, broadcast, reason } = publishSuccessionMandate(createHostSuccessionPublisher(), {
      roster: roster(), roomCode: ROOM, nowEpochMs: HOST_SAVED_AT, nonce: 7,
    });
    expect(reason).toBe('published');
    expect(broadcast?.mandate.successorId).toBe(SUCCESSOR_ID);
    expect(broadcast?.by).toBe(HOST_ID);
    expect(publisher.term).toBe(1);
    expect(isGameMessage(broadcast)).toBe(true);
  });

  it('does not burn a term re-minting an unchanged, still-fresh mandate', () => {
    const first = publishSuccessionMandate(createHostSuccessionPublisher(), {
      roster: roster(), roomCode: ROOM, nowEpochMs: HOST_SAVED_AT, nonce: 7,
    });
    const second = publishSuccessionMandate(first.publisher, {
      roster: roster(), roomCode: ROOM, nowEpochMs: HOST_SAVED_AT + 1_000, nonce: 8,
    });
    expect(second.reason).toBe('unchanged');
    expect(second.broadcast).toBeNull();
    expect(second.publisher.term).toBe(first.publisher.term);
  });

  it('renews the mandate before it can expire mid-match', () => {
    const first = publishSuccessionMandate(createHostSuccessionPublisher(), {
      roster: roster(), roomCode: ROOM, nowEpochMs: HOST_SAVED_AT, nonce: 7,
    });
    expect(HOST_SUCCESSION_MANDATE_RENEWAL_MS).toBeLessThan(HOST_SUCCESSION_MANDATE_TTL_MS);
    const renewed = publishSuccessionMandate(first.publisher, {
      roster: roster(),
      roomCode: ROOM,
      nowEpochMs: HOST_SAVED_AT + HOST_SUCCESSION_MANDATE_RENEWAL_MS,
      nonce: 8,
    });
    expect(renewed.reason).toBe('published');
    expect(renewed.publisher.term).toBe(first.publisher.term + 1);
  });

  it('re-elects when the successor disconnects', () => {
    const first = publishSuccessionMandate(createHostSuccessionPublisher(), {
      roster: roster(), roomCode: ROOM, nowEpochMs: HOST_SAVED_AT, nonce: 7,
    });
    const next = publishSuccessionMandate(first.publisher, {
      roster: roster({
        revision: LOBBY_REVISION + 1,
        members: [
          { id: HOST_ID, connected: true },
          { id: SUCCESSOR_ID, connected: false },
          { id: OTHER_GUEST_ID, connected: true },
        ],
      }),
      roomCode: ROOM,
      nowEpochMs: HOST_SAVED_AT + 5_000,
      nonce: 8,
    });
    expect(next.broadcast?.mandate.successorId).toBe(OTHER_GUEST_ID);
  });

  it('publishes nothing when there is no connected guest to hand the match to', () => {
    const result = publishSuccessionMandate(createHostSuccessionPublisher(), {
      roster: roster({ members: [{ id: HOST_ID, connected: true }, { id: SUCCESSOR_ID, connected: false }] }),
      roomCode: ROOM, nowEpochMs: HOST_SAVED_AT, nonce: 7,
    });
    expect(result.reason).toBe('no-successor');
    expect(result.broadcast).toBeNull();
  });

  it('ships a legal, unicast mirror addressed to the mandate holder', () => {
    const { plan } = shipMirror();
    expect(plan.reason).toBe('sent');
    expect(plan.send?.forPlayerId).toBe(SUCCESSOR_ID);
    expect(plan.send?.by).toBe(HOST_ID);
    expect(isGameMessage(plan.send)).toBe(true);
    expect(isHostSuccessionProtocolMessage(plan.send)).toBe(true);
    // The successor is the host of record in the document it receives.
    expect(plan.send?.checkpoint.hostPlayer.id).toBe(SUCCESSOR_ID);
    expect(plan.send?.checkpoint.succession?.term).toBe(plan.send!.mandate.term + 1);
  });

  it('throttles steady-state refreshes but never a change of succession', () => {
    const { plan } = shipMirror();
    const throttled = planAuthorityMirrorSend(plan.publisher, {
      checkpoint: hostCheckpoint(), nowMonoMs: 10_000 + HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_MS - 1,
      nowEpochMs: HOST_SAVED_AT, nonce: 3,
    });
    expect(throttled.reason).toBe('throttled');
    expect(throttled.send).toBeNull();

    const due = planAuthorityMirrorSend(plan.publisher, {
      checkpoint: hostCheckpoint(), nowMonoMs: 10_000 + HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_MS,
      nowEpochMs: HOST_SAVED_AT, nonce: 4,
    });
    expect(due.reason).toBe('sent');

    // A brand-new successor bypasses the throttle: a mirror addressed to
    // somebody who has left is worth nothing.
    const reelected = publishSuccessionMandate(plan.publisher, {
      roster: roster({
        revision: LOBBY_REVISION + 1,
        members: [
          { id: HOST_ID, connected: true },
          { id: SUCCESSOR_ID, connected: false },
          { id: OTHER_GUEST_ID, connected: true },
        ],
      }),
      roomCode: ROOM, nowEpochMs: HOST_SAVED_AT + 10, nonce: 5,
    });
    const immediate = planAuthorityMirrorSend(reelected.publisher, {
      checkpoint: hostCheckpoint({
        members: [
          { id: HOST_ID, name: 'HOST', team: 0, ready: true, connected: true, pingMs: 0, dhv: 10 },
          { id: SUCCESSOR_ID, name: 'ALPHA', team: 1, ready: true, connected: false, pingMs: null, dhv: 10 },
          { id: OTHER_GUEST_ID, name: 'BRAVO', team: 0, ready: true, connected: true, pingMs: 55, dhv: 10 },
        ],
        succession: { term: 1, successorId: OTHER_GUEST_ID },
      }),
      nowMonoMs: 10_001, nowEpochMs: HOST_SAVED_AT, nonce: 6,
    });
    expect(immediate.reason).toBe('sent');
    expect(immediate.send?.forPlayerId).toBe(OTHER_GUEST_ID);
  });

  it('propagates a mirror refusal instead of shipping a degraded document', () => {
    const published = publishSuccessionMandate(createHostSuccessionPublisher(1), {
      roster: roster(), roomCode: ROOM, nowEpochMs: HOST_SAVED_AT, nonce: 1,
    });
    const plan = planAuthorityMirrorSend(published.publisher, {
      // Same room code in the mandate, different room in the checkpoint.
      checkpoint: hostCheckpoint({ roomCode: 'other-room' }),
      nowMonoMs: 10_000, nowEpochMs: HOST_SAVED_AT, nonce: 2,
    });
    expect(plan.reason).toBe('mandate-room-mismatch');
    expect(plan.send).toBeNull();
    expect(plan.publisher.lastMirrorSentAtMonoMs).toBeNull();
  });

  it('sends nothing at all before a mandate exists', () => {
    const plan = planAuthorityMirrorSend(createHostSuccessionPublisher(), {
      checkpoint: hostCheckpoint(), nowMonoMs: 1, nowEpochMs: HOST_SAVED_AT, nonce: 1,
    });
    expect(plan.reason).toBe('no-mandate');
  });

  it('stands a superseded host down and silences it permanently', () => {
    const { published } = shipMirror();
    const claim = buildHostPromotedMessage(
      { promote: true, term: published.publisher.term + 1, roomCode: ROOM, successorId: SUCCESSOR_ID,
        checkpoint: hostCheckpoint(), mandate: published.publisher.mandate! },
      11,
    )!;
    const conflict = observeHostPromotion(published.publisher, claim);
    expect(conflict.action).toBe('stand-down');
    expect(conflict.publisher.standDown).toBe(true);
    // A stood-down host publishes nothing further, in either channel.
    expect(publishSuccessionMandate(conflict.publisher, {
      roster: roster(), roomCode: ROOM, nowEpochMs: HOST_SAVED_AT, nonce: 12,
    }).reason).toBe('stood-down');
    expect(planAuthorityMirrorSend(conflict.publisher, {
      checkpoint: hostCheckpoint(), nowMonoMs: 99_000, nowEpochMs: HOST_SAVED_AT, nonce: 13,
    }).reason).toBe('stood-down');
  });

  it('retains the room against an equal or lower term', () => {
    const { published } = shipMirror();
    const mandate = published.publisher.mandate!;
    const replay = buildHostPromotedMessage(
      { promote: true, term: mandate.term, roomCode: ROOM, successorId: SUCCESSOR_ID,
        checkpoint: hostCheckpoint(), mandate: { ...mandate, term: mandate.term - 1 } },
      14,
    )!;
    expect(observeHostPromotion(published.publisher, replay).action).toBe('retain');
  });
});

describe('HF-325 host succession wire — a mirror that arrives and promotes', () => {
  it('promotes the successor from a mirror that crossed the wire', () => {
    const { holdings } = successorHoldings();
    const decision = evaluateSelfPromotion(holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
      nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true,
    });
    expect(decision.promote).toBe(true);
    if (!decision.promote) return;
    expect(decision.successorId).toBe(SUCCESSOR_ID);
    expect(decision.term).toBe(decision.mandate.term + 1);
    // The adopted document is a real checkpoint that names this peer as host and
    // still carries every other member, so nobody is kicked.
    expect(isHostMatchCheckpoint(decision.checkpoint, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    expect(decision.checkpoint.hostPlayer.id).toBe(SUCCESSOR_ID);
    expect(decision.checkpoint.members.map((member) => member.id).sort())
      .toEqual([HOST_ID, SUCCESSOR_ID, OTHER_GUEST_ID].sort());
    expect(decision.checkpoint.scores.find((score) => score.id === OTHER_GUEST_ID)?.kills).toBe(6);
    // The demoted host survives as an ordinary guest, restorable by the
    // existing recovery path rather than a bespoke adoption routine.
    const restored = restoreGuestAuthorities(decision.checkpoint);
    expect(restored).not.toBeNull();
    expect(restored?.map((entry) => entry.snapshot.id).sort()).toEqual([HOST_ID, OTHER_GUEST_ID].sort());
  });

  it('announces the promotion in a message every follower accepts', () => {
    const { holdings } = successorHoldings();
    const decision = evaluateSelfPromotion(holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
      nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true,
    });
    const claim = buildHostPromotedMessage(decision, 42);
    expect(claim).not.toBeNull();
    expect(isGameMessage(claim)).toBe(true);

    // A follower that saw the same mandate accepts, and drops any mirror of its
    // own — somebody else is the authority now.
    const follower = acceptSuccessionMandate(createSuccessorHoldings(), {
      type: 'host-succession-mandate', schemaVersion: 1, by: HOST_ID,
      mandate: holdings.mandate!, nonce: 3,
    }, ROOM);
    const accepted = acceptHostPromoted(follower.holdings, claim!, { roomCode: ROOM, roster: roster() });
    expect(accepted.acceptance.accept).toBe(true);
    expect(accepted.holdings.mirror).toBeNull();
    expect(accepted.holdings.highestObservedTerm).toBe(holdings.mandate!.term + 1);

    // Replaying the same claim no longer supersedes, so a stale host cannot
    // reclaim followers with a term they already honoured.
    expect(acceptHostPromoted(accepted.holdings, claim!, { roomCode: ROOM, roster: roster() })
      .acceptance.accept).toBe(false);
  });

  it('rejects a claimant the mandate does not name', () => {
    const { holdings } = successorHoldings();
    const rogue = acceptHostPromoted(holdings, {
      type: 'host-promoted', schemaVersion: 1, by: OTHER_GUEST_ID,
      mandate: holdings.mandate!, term: holdings.mandate!.term + 1, nonce: 5,
    }, { roomCode: ROOM, roster: roster() });
    expect(rogue.acceptance.accept).toBe(false);
    if (rogue.acceptance.accept) return;
    expect(rogue.acceptance.reason).toBe('claimant-not-the-successor');
  });

  it('neutralises host/guest clock skew rather than turning it into downtime', () => {
    // Guest clock runs six hours behind the host's. Without the rebase this
    // would read as six hours of downtime and expire the document instantly.
    const offsetMs = 6 * 60 * 60 * 1_000;
    const receivedAtEpochMs = HOST_SAVED_AT - offsetMs + 200;
    const { holdings } = successorHoldings({ receivedAtEpochMs, hostClockOffsetMs: offsetMs });
    expect(holdings.mirrorOffsetTrusted).toBe(true);
    expect(holdings.mirror?.savedAtEpochMs).toBe(receivedAtEpochMs - 200);
    const decision = evaluateSelfPromotion(holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
      nowEpochMs: receivedAtEpochMs + 1_000, promotionEnabled: true,
    });
    expect(decision.promote).toBe(true);
  });

  it('treats an unmeasurable offset as fresh-on-arrival instead of guessing', () => {
    const receivedAtEpochMs = HOST_SAVED_AT + 9_000_000;
    const { holdings } = successorHoldings({ receivedAtEpochMs, hostClockOffsetMs: null });
    expect(holdings.mirrorOffsetTrusted).toBe(false);
    expect(holdings.mirror?.savedAtEpochMs).toBe(receivedAtEpochMs);
  });
});

describe('HF-325 host succession wire — a stale mirror is refused', () => {
  it('refuses a document older than its own TTL rather than clamping it fresh', () => {
    const { plan } = shipMirror();
    const mandateAccepted = acceptSuccessionMandate(createSuccessorHoldings(), {
      type: 'host-succession-mandate', schemaVersion: 1, by: HOST_ID, mandate: plan.send!.mandate, nonce: 1,
    }, ROOM);
    const result = acceptAuthorityMirror(mandateAccepted.holdings, plan.send!, {
      selfId: SUCCESSOR_ID, roomCode: ROOM,
      receivedAtEpochMs: HOST_SAVED_AT + HOST_MATCH_CHECKPOINT_TTL_MS,
      hostClockOffsetMs: 0,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('mirror-expired');
    expect(result.holdings.mirror).toBeNull();
  });

  it('keeps a good held mirror when a bad one arrives', () => {
    const { holdings, mirror } = successorHoldings();
    const corrupted = {
      ...mirror,
      checkpoint: { ...mirror.checkpoint, hostPlayer: { ...mirror.checkpoint.hostPlayer, hp: 9_999 } },
    } as HostAuthorityMirrorMessage;
    const result = acceptAuthorityMirror(holdings, corrupted, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, receivedAtEpochMs: HOST_SAVED_AT + 500, hostClockOffsetMs: 0,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('malformed-checkpoint');
    expect(result.holdings.mirror).toBe(holdings.mirror);
  });

  it('refuses a mirror addressed to another peer', () => {
    const { holdings, mirror } = successorHoldings();
    const result = acceptAuthorityMirror(createSuccessorHoldings(), mirror, {
      selfId: OTHER_GUEST_ID, roomCode: ROOM, receivedAtEpochMs: HOST_SAVED_AT + 100, hostClockOffsetMs: 0,
    });
    expect(result.reason).toBe('not-addressed-to-self');
    // And an intercepted mirror grants the interceptor nothing.
    expect(evaluateSelfPromotion(
      { ...holdings, mandate: { ...holdings.mandate!, successorId: OTHER_GUEST_ID } },
      { selfId: OTHER_GUEST_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
        nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true },
    ).promote).toBe(false);
  });

  it('refuses a mirror for another room and a mandate from a superseded term', () => {
    const { holdings, mirror } = successorHoldings();
    expect(acceptAuthorityMirror(createSuccessorHoldings(), mirror, {
      selfId: SUCCESSOR_ID, roomCode: 'other-room', receivedAtEpochMs: HOST_SAVED_AT + 100, hostClockOffsetMs: 0,
    }).reason).toBe('room-mismatch');
    expect(acceptAuthorityMirror(
      { ...holdings, highestObservedTerm: mirror.mandate.term + 5 },
      mirror,
      { selfId: SUCCESSOR_ID, roomCode: ROOM, receivedAtEpochMs: HOST_SAVED_AT + 100, hostClockOffsetMs: 0 },
    ).reason).toBe('mandate-superseded');
  });

  it('refuses to promote from a mirror that went stale sitting in memory', () => {
    // With both clocks agreeing, the mandate's own TTL expires first and
    // `authorizeSelfPromotion` refuses with 'mandate-expired' — also correct,
    // also fail-closed. The window this test targets is the skewed one: a guest
    // whose clock trails the host's still sees a live mandate (that check reads
    // the HOST's issuedAtEpochMs against the GUEST's now, unrebased — see the
    // note in the handoff) long after the mirror it holds has aged out in its
    // own clock. The mirror freshness check is what catches that.
    const offsetMs = 6 * 60 * 60 * 1_000;
    const receivedAtEpochMs = HOST_SAVED_AT - offsetMs + 200;
    const { holdings } = successorHoldings({ receivedAtEpochMs, hostClockOffsetMs: offsetMs });
    const decision = evaluateSelfPromotion(holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
      nowEpochMs: receivedAtEpochMs + HOST_MATCH_CHECKPOINT_TTL_MS,
      promotionEnabled: true,
    });
    expect(decision.promote).toBe(false);
    if (decision.promote) return;
    expect(decision.reason).toBe('mirror-stale');
  });

  it('refuses to promote from a mirror stamped for a superseded succession', () => {
    const { holdings } = successorHoldings();
    // The host re-minted at a later term; the held mirror is for the old one.
    const stale = acceptSuccessionMandate(holdings, {
      type: 'host-succession-mandate', schemaVersion: 1, by: HOST_ID,
      mandate: { ...holdings.mandate!, term: holdings.mandate!.term + 1 }, nonce: 9,
    }, ROOM);
    const decision = evaluateSelfPromotion(stale.holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
      nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true,
    });
    expect(decision.promote).toBe(false);
    if (decision.promote) return;
    expect(decision.reason).toBe('mirror-not-adoptable');
  });
});

describe('HF-325 host succession wire — no mirror falls back to current behaviour', () => {
  it('refuses promotion when no mirror ever arrived', () => {
    const mandateOnly = acceptSuccessionMandate(createSuccessorHoldings(), {
      type: 'host-succession-mandate', schemaVersion: 1, by: HOST_ID,
      mandate: shipMirror().published.broadcast!.mandate, nonce: 1,
    }, ROOM);
    const decision = evaluateSelfPromotion(mandateOnly.holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
      nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true,
    });
    expect(decision.promote).toBe(false);
    if (decision.promote) return;
    expect(decision.reason).toBe('no-authority-to-adopt');
  });

  it('refuses promotion when nothing at all was received', () => {
    const decision = evaluateSelfPromotion(createSuccessorHoldings(), {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
      nowEpochMs: HOST_SAVED_AT, promotionEnabled: true,
    });
    expect(decision.promote).toBe(false);
    if (decision.promote) return;
    expect(decision.reason).toBe('no-mandate');
  });

  it('ships promotion disabled, so production behaviour is unchanged', () => {
    expect(HOST_MIGRATION_PROMOTION_ENABLED).toBe(false);
    const { holdings } = successorHoldings();
    const decision = evaluateSelfPromotion(holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
      nowEpochMs: HOST_SAVED_AT + 130,
    });
    expect(decision.promote).toBe(false);
    if (decision.promote) return;
    expect(decision.reason).toBe('migration-disabled');
  });

  it('never announces a promotion it was refused', () => {
    expect(buildHostPromotedMessage({ promote: false, reason: 'migration-disabled' }, 1)).toBeNull();
  });
});

describe('HF-325 host succession wire — a guest may not author before promotion', () => {
  it('refuses a guest the mandate does not name, however complete its evidence', () => {
    const { holdings } = successorHoldings();
    const decision = evaluateSelfPromotion(holdings, {
      selfId: OTHER_GUEST_ID, roomCode: ROOM, assessment: HOST_LOST, roster: roster(),
      nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true,
    });
    expect(decision.promote).toBe(false);
    if (decision.promote) return;
    expect(decision.reason).toBe('mandate-names-another-guest');
  });

  it('refuses while the host may still be serving everybody else', () => {
    const { holdings } = successorHoldings();
    for (const assessment of [STILL_RECONNECTING, evaluateHostLoss({
      role: 'client', eventChannelOpen: true, reconnectPending: false,
      lastValidHostMessageMonoMs: 1_000, reconnectDeadlineMonoMs: null,
      lobbyClosedByHost: false, nowMonoMs: 1_100,
    })]) {
      const decision = evaluateSelfPromotion(holdings, {
        selfId: SUCCESSOR_ID, roomCode: ROOM, assessment, roster: roster(),
        nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true,
      });
      expect(decision.promote).toBe(false);
      if (decision.promote) return;
      expect(decision.reason).toBe('host-not-confirmed-lost');
    }
  });

  it('refuses a lone survivor, the likeliest false positive there is', () => {
    const { holdings } = successorHoldings();
    expect(MIN_SURVIVORS_FOR_MIGRATION).toBe(2);
    const decision = evaluateSelfPromotion(holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST,
      roster: roster({
        members: [
          { id: HOST_ID, connected: true },
          { id: SUCCESSOR_ID, connected: true },
          { id: OTHER_GUEST_ID, connected: false },
        ],
      }),
      nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true,
    });
    expect(decision.promote).toBe(false);
    if (decision.promote) return;
    expect(decision.reason).toBe('insufficient-survivors');
  });

  it('refuses when the guest is not on the revision the host elected from', () => {
    const { holdings } = successorHoldings();
    const decision = evaluateSelfPromotion(holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM, assessment: HOST_LOST,
      roster: roster({ revision: LOBBY_REVISION + 3 }),
      nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true,
    });
    expect(decision.promote).toBe(false);
    if (decision.promote) return;
    expect(decision.reason).toBe('roster-revision-mismatch');
  });

  it('refuses after a deliberate host reset — there is nothing to inherit', () => {
    const { holdings } = successorHoldings();
    const decision = evaluateSelfPromotion(holdings, {
      selfId: SUCCESSOR_ID, roomCode: ROOM,
      assessment: evaluateHostLoss({
        role: 'client', eventChannelOpen: false, reconnectPending: false,
        lastValidHostMessageMonoMs: 1_000, reconnectDeadlineMonoMs: 91_000,
        lobbyClosedByHost: true, nowMonoMs: 91_000,
      }),
      roster: roster(), nowEpochMs: HOST_SAVED_AT + 130, promotionEnabled: true,
    });
    expect(decision.promote).toBe(false);
    if (decision.promote) return;
    expect(decision.reason).toBe('lobby-closed-by-host');
  });

  it('refuses a mandate for another room outright', () => {
    const { published } = shipMirror();
    expect(acceptSuccessionMandate(createSuccessorHoldings(), published.broadcast!, 'other-room').reason)
      .toBe('room-mismatch');
  });
});

describe('HF-325 host succession wire — cadence', () => {
  it('refreshes far more often than the document can go stale', () => {
    expect(HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_MS).toBeLessThan(HOST_MATCH_CHECKPOINT_TTL_MS / 10);
  });

  it('refreshes at least twice inside the host-silence window', () => {
    // A guest cannot consider promoting until well past this timeout, so the
    // mirror's age is never the limiting factor on how current the adopted
    // ledger is — which is exactly why the wire cadence can afford to be slower
    // than the host's local checkpoint persist tick.
    expect(HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_MS * 2).toBeLessThanOrEqual(CLIENT_HOST_SILENCE_TIMEOUT_MS);
  });

  it('never ships more often than the mirror module recommends refreshing', () => {
    expect(HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_MS)
      .toBeGreaterThanOrEqual(HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_FLOOR_MS);
  });
});
