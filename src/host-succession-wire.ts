/**
 * HF-325 — the fuel line between `host-authority-mirror.ts` and a real socket.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * `host-authority-mirror.ts` is a correct engine with no fuel line: it reshapes
 * a host checkpoint into one the elected successor can adopt, but nothing ever
 * carried that document across the wire, so on a real host disconnect the
 * successor had nothing to promote from. `host-succession-protocol.ts` gives the
 * document a legal wire form. THIS module is the state machine on both ends:
 * when the host ships a mirror, what the successor does with one on arrival, and
 * the single function that may answer "may I promote, and with which document".
 *
 * IT IS PURE. No timers, no sockets, no storage, no `Date.now()`, no
 * `performance.now()`. Every clock reading is an input, which is what makes the
 * cross-machine clock behaviour testable at all.
 *
 * THE NON-NEGOTIABLES, AND WHERE EACH ONE IS ENFORCED
 * ---------------------------------------------------
 * HOST-AUTHORITATIVE  Guests never author position, health, ammo or admission.
 *   The three succession messages are all host-authored
 *   (`isHostAuthorityMessage`), so `network.ts` drops any of them arriving on a
 *   guest connection. Nothing here lets a guest act as an authority: the only
 *   function that can say "promote" is `evaluateSelfPromotion`, and it delegates
 *   the decision to `authorizeSelfPromotion` in `host-migration.ts`.
 *
 * FAIL-CLOSED  Every refusal path leaves the caller in exactly the state it was
 *   in — which is today's behaviour, however bad. A missing mirror, a stale one,
 *   a malformed one, a mirror addressed to somebody else, a mirror stamped for a
 *   superseded term, or a mirror whose clock rebase refuses: all of them produce
 *   `promote: false` and a named reason. None of them produces a half-promoted
 *   peer authoring state from a bad document.
 *
 * THE MIRROR MODULE IS NOT WEAKENED  `mirrorHostAuthorityToSuccessor` and
 *   `rebaseMirroredCheckpointClock` are called exactly as specified and their
 *   refusals are propagated verbatim. In particular `mirror-expired` is
 *   propagated as a refusal and never clamped into freshness, and this module
 *   adds a SECOND, independent freshness check at promotion time against the
 *   rebased `expiresAtEpochMs`, because a mirror can go stale sitting in memory
 *   long after it arrived fresh.
 *
 * PROMOTION IS STILL OFF. See `HOST_MIGRATION_PROMOTION_ENABLED`.
 */

import {
  isHostMatchCheckpoint,
  type HostMatchCheckpoint,
} from './host-match-checkpoint';
import {
  HOST_AUTHORITY_MIRROR_INTERVAL_MS,
  mirrorGrantsAuthorityTo,
  mirrorHostAuthorityToSuccessor,
  rebaseMirroredCheckpointClock,
  type HostAuthorityMirrorRefusal,
  type MirrorClockRebaseRefusal,
} from './host-authority-mirror';
import {
  HOST_SUCCESSION_MANDATE_TTL_MS,
  acceptPromotedHost,
  authorizeSelfPromotion,
  electHostSuccessor,
  isSuccessionMandate,
  isSuccessionRoster,
  mintSuccessionMandate,
  resolveHostTermConflict,
  type FollowerAcceptance,
  type HostLossAssessment,
  type PromotionRefusal,
  type SuccessionMandate,
  type SuccessionRoster,
} from './host-migration';
import {
  HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION,
  type HostAuthorityMirrorMessage,
  type HostPromotedMessage,
  type HostSuccessionMandateMessage,
} from './host-succession-protocol';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';

/**
 * THE KILL SWITCH.
 *
 * False until all of the following exist, because a split brain is far worse
 * than a dead room:
 *
 *   1. `network.ts` `promoteToHost(roomCode, onReady)` — the `client -> host`
 *      role flip that claims the room code's PeerJS id, treats `unavailable-id`
 *      as a PERMANENT abort (never the existing 60s reclaim ramp, which is for a
 *      crashed host reclaiming its own room), and never falls back to a fresh
 *      room code.
 *   2. The stale-host stand-down: a host that observes a higher term must stop
 *      broadcasting authority and surrender the room. `observeHostPromotion`
 *      below computes that decision, but nothing acts on it yet.
 *   3. The `legacy-main.ts` call sites in
 *      scratchpad/wave2-handoffs/hf325-wire-path.md.
 *
 * Until then `evaluateSelfPromotion` refuses with `'migration-disabled'`, which
 * leaves today's behaviour — the 90-second rejoin window and the host-loss
 * banner from HF-325 Part 1 — completely untouched.
 */
export const HOST_MIGRATION_PROMOTION_ENABLED = false;

/**
 * How often the host re-ships the mirror to its current mandate holder.
 *
 * Deliberately SLOWER than the 2s local checkpoint persist cadence
 * (`HOST_CHECKPOINT_PERSIST_INTERVAL_MS`) and slower than the mirror module's
 * suggested floor, because the wire cost is real and the freshness benefit is
 * not:
 *
 *  - The mirror can never be the limiting factor on how current the adopted
 *    state is. A guest cannot even CONSIDER promoting until `evaluateHostLoss`
 *    reports `host-lost`, which requires the transport's 15s host-silence
 *    timeout plus the 90s reconnect window to have played out. Against a
 *    detection latency measured in tens of seconds, the difference between a
 *    2-second-old and a 5-second-old ledger is not observable.
 *  - The document is the whole match ledger — roughly 10KB for a typical room
 *    and up to the 64KB cap at schema maximums. In a competitive FPS the host's
 *    uplink is already carrying every guest's state traffic. Sending this 2.5x
 *    less often is a ~60% cut in that overhead for no practical loss.
 *  - It stays enormously inside the document's own 90s TTL, so a held mirror is
 *    never anywhere near expiry while the host is healthy.
 *
 * The throttle is bypassed whenever the successor or the term changes: a mirror
 * addressed to somebody who has left, or stamped for a superseded succession, is
 * worth nothing, so a fresh one goes out immediately.
 */
export const HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_MS = 5_000;

/**
 * Re-mint the mandate once it is half-used, so a live mandate is never within
 * half its TTL of expiring. Re-minting only on roster change would let a stable
 * lobby's mandate expire mid-match and silently disarm succession.
 */
export const HOST_SUCCESSION_MANDATE_RENEWAL_MS = Math.floor(HOST_SUCCESSION_MANDATE_TTL_MS / 2);

// ---------------------------------------------------------------------------
// Host side — mint, broadcast, ship
// ---------------------------------------------------------------------------

export type HostSuccessionPublisher = Readonly<{
  /** Highest term this host has minted or observed. 0 before the first mint. */
  term: number;
  /** The mandate currently broadcast, or null when none is outstanding. */
  mandate: SuccessionMandate | null;
  lastMirrorSentAtMonoMs: number | null;
  lastMirroredSuccessorId: string | null;
  lastMirroredTerm: number;
  /** Set once a higher term is observed. A stood-down host publishes nothing. */
  standDown: boolean;
}>;

export function createHostSuccessionPublisher(initialTerm = 0): HostSuccessionPublisher {
  return Object.freeze({
    term: Number.isSafeInteger(initialTerm) && initialTerm >= 0 ? initialTerm : 0,
    mandate: null,
    lastMirrorSentAtMonoMs: null,
    lastMirroredSuccessorId: null,
    lastMirroredTerm: 0,
    standDown: false,
  });
}

export type MandatePublishReason =
  | 'published'
  /** The standing mandate still names the right guest at the right revision. */
  | 'unchanged'
  | 'stood-down'
  /** No connected non-host member to elect. Nothing to hand over to. */
  | 'no-successor'
  /** `mintSuccessionMandate` refused — malformed input or term exhaustion. */
  | 'mint-refused';

export type MandatePublishResult = Readonly<{
  publisher: HostSuccessionPublisher;
  /** Broadcast to every admitted guest, or null when there is nothing to say. */
  broadcast: HostSuccessionMandateMessage | null;
  reason: MandatePublishReason;
}>;

export type MandatePublishInput = Readonly<{
  /** The host-authored roster, at its current revision. */
  roster: SuccessionRoster;
  roomCode: string;
  nowEpochMs: number;
  nonce: number;
}>;

/**
 * Called on every roster change and on a slow housekeeping tick. Returns the
 * mandate message to broadcast, or null when the standing one still holds.
 *
 * Minting is idempotent against an unchanged roster on purpose: every mint burns
 * a term, and a term burnt for no reason is a term a follower has to catch up
 * to. It re-mints only when the elected successor changes, the roster revision
 * changes, or the standing mandate is more than half-way to expiry.
 */
export function publishSuccessionMandate(
  publisher: HostSuccessionPublisher,
  input: MandatePublishInput,
): MandatePublishResult {
  const unchanged = (reason: MandatePublishReason): MandatePublishResult =>
    Object.freeze({ publisher, broadcast: null, reason });

  if (publisher.standDown) return unchanged('stood-down');
  if (!isSuccessionRoster(input.roster)) return unchanged('mint-refused');
  const election = electHostSuccessor(input.roster);
  if (!election.decided) return unchanged('no-successor');

  const standing = publisher.mandate;
  if (standing !== null
    && standing.successorId === election.successorId
    && standing.lobbyRevision === input.roster.revision
    && standing.roomCode === input.roomCode
    && standing.issuedByHostId === input.roster.hostId
    && input.nowEpochMs < standing.issuedAtEpochMs + HOST_SUCCESSION_MANDATE_RENEWAL_MS) {
    return unchanged('unchanged');
  }

  const mandate = mintSuccessionMandate({
    roster: input.roster,
    roomCode: input.roomCode,
    previousTerm: publisher.term,
    nowEpochMs: input.nowEpochMs,
  });
  // A missing mandate costs a dead room; a wrong one costs a split brain. Those
  // are not close in severity, so a refusal is simply propagated.
  if (mandate === null) return unchanged('mint-refused');

  return Object.freeze({
    publisher: Object.freeze({ ...publisher, term: mandate.term, mandate }),
    broadcast: Object.freeze({
      type: 'host-succession-mandate',
      schemaVersion: HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION,
      by: mandate.issuedByHostId,
      mandate,
      nonce: input.nonce,
    }) as HostSuccessionMandateMessage,
    reason: 'published',
  });
}

export type MirrorSendReason =
  | 'sent'
  | 'stood-down'
  | 'no-mandate'
  /** Within the wire interval and nothing about the succession changed. */
  | 'throttled'
  /** Propagated verbatim from `mirrorHostAuthorityToSuccessor`. */
  | HostAuthorityMirrorRefusal;

export type MirrorSendPlan = Readonly<{
  publisher: HostSuccessionPublisher;
  /** Unicast to `mandate.successorId` ONLY. Never broadcast. */
  send: HostAuthorityMirrorMessage | null;
  reason: MirrorSendReason;
  /** Which sections the size ladder had to shed, for diagnostics. */
  droppedForSize: readonly string[];
}>;

export type MirrorSendInput = Readonly<{
  /** The live host checkpoint, exactly as it would be persisted locally. */
  checkpoint: HostMatchCheckpoint;
  nowMonoMs: number;
  /** The host's own `Date.now()`, stamped so the receiver can measure skew. */
  nowEpochMs: number;
  nonce: number;
  /** SHA-256 of a resume token the host minted for its own post-handover rejoin. */
  outgoingHostResumeTokenSha256?: string | null;
}>;

/**
 * Called on the host's existing checkpoint tick, with the SAME checkpoint object
 * that gets persisted, so what the successor holds is exactly what the host
 * would itself have recovered from.
 */
export function planAuthorityMirrorSend(
  publisher: HostSuccessionPublisher,
  input: MirrorSendInput,
): MirrorSendPlan {
  const skip = (reason: MirrorSendReason): MirrorSendPlan =>
    Object.freeze({ publisher, send: null, reason, droppedForSize: Object.freeze([]) });

  if (publisher.standDown) return skip('stood-down');
  const mandate = publisher.mandate;
  if (mandate === null || !isSuccessionMandate(mandate)) return skip('no-mandate');

  // A change of successor or of term invalidates whatever the holder has, so it
  // bypasses the throttle. Only a steady-state refresh is rate limited.
  const successionChanged = publisher.lastMirroredSuccessorId !== mandate.successorId
    || publisher.lastMirroredTerm !== mandate.term;
  if (!successionChanged
    && publisher.lastMirrorSentAtMonoMs !== null
    && Number.isFinite(input.nowMonoMs)
    && input.nowMonoMs - publisher.lastMirrorSentAtMonoMs < HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_MS) {
    return skip('throttled');
  }

  const mirror = mirrorHostAuthorityToSuccessor({
    checkpoint: input.checkpoint,
    mandate,
    outgoingHostResumeTokenSha256: input.outgoingHostResumeTokenSha256 ?? null,
  });
  if (!mirror.mirrored) return skip(mirror.reason);

  return Object.freeze({
    publisher: Object.freeze({
      ...publisher,
      lastMirrorSentAtMonoMs: input.nowMonoMs,
      lastMirroredSuccessorId: mandate.successorId,
      lastMirroredTerm: mandate.term,
    }),
    send: Object.freeze({
      type: 'host-authority-mirror',
      schemaVersion: HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION,
      by: mandate.issuedByHostId,
      forPlayerId: mandate.successorId,
      mandate,
      checkpoint: mirror.checkpoint,
      hostEpochMs: input.nowEpochMs,
      nonce: input.nonce,
    }) as HostAuthorityMirrorMessage,
    reason: 'sent',
    droppedForSize: mirror.droppedForSize,
  });
}

/**
 * G4, host half. A host that learns of a term higher than its own has been
 * superseded and must stand down: stop broadcasting authority, stop admitting
 * guests, surrender the room. Equal terms retain, so a host is never talked out
 * of its own room by a replay of its own term.
 *
 * Note that `network.ts` never delivers `host-promoted` from a guest connection
 * (it is a host-authority message), so this fires only where it should: on a
 * peer that has rejoined and is hearing the new host directly.
 */
export function observeHostPromotion(
  publisher: HostSuccessionPublisher,
  message: HostPromotedMessage,
): Readonly<{ publisher: HostSuccessionPublisher; action: 'retain' | 'stand-down' }> {
  if (!isSuccessionMandate(message.mandate) || !Number.isSafeInteger(message.term)) {
    return Object.freeze({ publisher, action: 'retain' });
  }
  const action = resolveHostTermConflict(publisher.term, message.term);
  if (action === 'retain') return Object.freeze({ publisher, action });
  return Object.freeze({
    publisher: Object.freeze({ ...publisher, term: message.term, standDown: true, mandate: null }),
    action,
  });
}

// ---------------------------------------------------------------------------
// Guest side — hold, rebase, promote
// ---------------------------------------------------------------------------

export type SuccessorHoldings = Readonly<{
  /** The newest mandate this peer has seen, whoever it names. */
  mandate: SuccessionMandate | null;
  /** Highest term observed from any host. Feeds G4 on both sides. */
  highestObservedTerm: number;
  /**
   * The held mirror, ALREADY rebased into this machine's clock, exactly once, on
   * arrival. Never rebase this object again: without a trusted offset the rebase
   * treats the document as fresh, so re-running it would ratchet the 90-second
   * lease forward on every call.
   */
  mirror: HostMatchCheckpoint | null;
  /** The term the held mirror authorises, i.e. its mandate's term + 1. */
  mirrorTerm: number;
  mirrorReceivedAtEpochMs: number | null;
  /** False when the clock offset was absent or beyond the 24h trust bound. */
  mirrorOffsetTrusted: boolean;
}>;

export function createSuccessorHoldings(): SuccessorHoldings {
  return Object.freeze({
    mandate: null,
    highestObservedTerm: 0,
    mirror: null,
    mirrorTerm: 0,
    mirrorReceivedAtEpochMs: null,
    mirrorOffsetTrusted: false,
  });
}

export type MandateAcceptRefusal =
  | 'malformed-mandate'
  | 'room-mismatch'
  /** An older term than one already observed. Some succession already moved on. */
  | 'stale-term';

export type MandateAcceptResult = Readonly<{
  holdings: SuccessorHoldings;
  accepted: boolean;
  reason: 'accepted' | MandateAcceptRefusal;
}>;

/**
 * Every guest tracks the mandate, not just the one it names. A guest that is NOT
 * the successor still needs the term to validate the promotion claim it is about
 * to receive, and still needs to know it is not the successor so it refuses to
 * promote itself.
 */
export function acceptSuccessionMandate(
  holdings: SuccessorHoldings,
  message: HostSuccessionMandateMessage,
  roomCode: string,
): MandateAcceptResult {
  const refuse = (reason: MandateAcceptRefusal): MandateAcceptResult =>
    Object.freeze({ holdings, accepted: false, reason });

  if (!isSuccessionMandate(message.mandate)) return refuse('malformed-mandate');
  const mandate = message.mandate;
  if (typeof roomCode !== 'string' || mandate.roomCode !== roomCode) return refuse('room-mismatch');
  if (mandate.term < holdings.highestObservedTerm) return refuse('stale-term');

  return Object.freeze({
    holdings: Object.freeze({
      ...holdings,
      mandate,
      highestObservedTerm: Math.max(holdings.highestObservedTerm, mandate.term),
    }),
    accepted: true,
    reason: 'accepted',
  });
}

export type MirrorAcceptRefusal =
  /**
   * Defensive floor. The envelope validator already guarantees a well-formed
   * mandate, so reaching this means the message did not come through
   * `isGameMessage` and something is wired wrong.
   */
  | 'malformed-mandate'
  /** Addressed to another peer. Holding somebody else's mirror authorises nothing. */
  | 'not-addressed-to-self'
  | 'room-mismatch'
  /** A newer succession already exists; this mirror is for a dead one. */
  | 'mandate-superseded'
  /** The carried document is not a valid checkpoint for this protocol version. */
  | 'malformed-checkpoint'
  /** Valid checkpoint, but it does not name this peer as host at this term. */
  | 'checkpoint-not-adoptable'
  /** Propagated verbatim from `rebaseMirroredCheckpointClock`. */
  | MirrorClockRebaseRefusal;

export type MirrorAcceptResult = Readonly<{
  holdings: SuccessorHoldings;
  accepted: boolean;
  reason: 'accepted' | MirrorAcceptRefusal;
  /** Age in receiver-clock ms credited to the mirror; null when refused. */
  appliedAgeMs: number | null;
}>;

export type MirrorAcceptInput = Readonly<{
  selfId: string;
  roomCode: string;
  /** This machine's own `Date.now()` at the moment the message arrived. */
  receivedAtEpochMs: number;
  /**
   * The RAW value from `estimateHostClockOffset(...).offsetMs` in
   * `private-match.ts`, i.e. `hostClock - localClock`, or null when no offset
   * has been established or the sample was rejected.
   *
   * It is negated internally to the `receiver - sender` convention
   * `rebaseMirroredCheckpointClock` expects. Taking the raw host-side value and
   * doing the flip in one audited place is deliberate: a sign error here does
   * not fail loudly, it silently invents or erases downtime — which is exactly
   * the desync the owner reported on a re-hosted lobby.
   */
  hostClockOffsetMs: number | null;
}>;

/**
 * Receive a mirror. Validates it end to end, rebases its clock exactly once, and
 * stores the result. Any refusal leaves the previously held mirror untouched: a
 * bad new document must never destroy a good old one.
 */
export function acceptAuthorityMirror(
  holdings: SuccessorHoldings,
  message: HostAuthorityMirrorMessage,
  input: MirrorAcceptInput,
): MirrorAcceptResult {
  const refuse = (reason: MirrorAcceptRefusal): MirrorAcceptResult =>
    Object.freeze({ holdings, accepted: false, reason, appliedAgeMs: null });

  if (!isSuccessionMandate(message.mandate)) return refuse('malformed-mandate');
  const mandate = message.mandate;
  if (typeof input.selfId !== 'string' || input.selfId.length === 0
    || message.forPlayerId !== input.selfId
    || mandate.successorId !== input.selfId) return refuse('not-addressed-to-self');
  if (typeof input.roomCode !== 'string' || mandate.roomCode !== input.roomCode) return refuse('room-mismatch');
  if (mandate.term < holdings.highestObservedTerm) return refuse('mandate-superseded');

  // THE deep schema check. `host-succession-protocol.ts` bounds the envelope; a
  // checkpoint only ever becomes adoptable here, and only after this passes.
  if (!isHostMatchCheckpoint(message.checkpoint, MULTIPLAYER_PROTOCOL_VERSION)) {
    return refuse('malformed-checkpoint');
  }
  const checkpoint = message.checkpoint;
  const term = mandate.term + 1;
  if (checkpoint.roomCode !== mandate.roomCode
    || checkpoint.hostPlayer.id !== input.selfId
    || checkpoint.succession === undefined
    || checkpoint.succession.term !== term) {
    return refuse('checkpoint-not-adoptable');
  }

  const rebase = rebaseMirroredCheckpointClock(checkpoint, {
    receivedAtEpochMs: input.receivedAtEpochMs,
    // estimateHostClockOffset yields sender - receiver; the rebase wants
    // receiver - sender. This is the one place that flip happens.
    clockOffsetMs: input.hostClockOffsetMs === null ? null : -input.hostClockOffsetMs,
  });
  // 'mirror-expired' means genuinely stale, not merely skewed. Drop it and wait
  // for the next one; never clamp it into freshness.
  if (!rebase.rebased) return refuse(rebase.reason);

  return Object.freeze({
    holdings: Object.freeze({
      ...holdings,
      mandate,
      highestObservedTerm: Math.max(holdings.highestObservedTerm, mandate.term),
      mirror: rebase.checkpoint,
      mirrorTerm: term,
      mirrorReceivedAtEpochMs: input.receivedAtEpochMs,
      mirrorOffsetTrusted: rebase.offsetTrusted,
    }),
    accepted: true,
    reason: 'accepted',
    appliedAgeMs: rebase.appliedAgeMs,
  });
}

export type WirePromotionRefusal =
  /** The kill switch is off. This is the production answer today. */
  | 'migration-disabled'
  /** Held mirror does not name this peer, this room and this exact term. */
  | 'mirror-not-adoptable'
  /** The mirror arrived fresh but has since aged past its own TTL in memory. */
  | 'mirror-stale';

export type WirePromotionDecision =
  | Readonly<{
    promote: true;
    term: number;
    roomCode: string;
    successorId: string;
    /**
     * The document to adopt, already in this machine's clock. Feed it to the
     * EXISTING recovery path — `restoreGuestAuthorities`,
     * `restoreRailgunAuthority`, `restoreTimedMapWeaponAuthorities`,
     * `resolveHostMatchResumeTiming` — not to a bespoke adoption routine.
     */
    checkpoint: HostMatchCheckpoint;
    mandate: SuccessionMandate;
  }>
  | Readonly<{ promote: false; reason: PromotionRefusal | WirePromotionRefusal }>;

export type SelfPromotionInput = Readonly<{
  selfId: string;
  roomCode: string;
  /** From `evaluateHostLoss(network.hostLinkSample())`. */
  assessment: HostLossAssessment;
  /** The newest host-authored roster this guest holds, from `lobby-state`. */
  roster: SuccessionRoster;
  nowEpochMs: number;
  /** Defaults to the kill switch. Tests pass true explicitly. */
  promotionEnabled?: boolean;
}>;

/**
 * The one function on the wire path that may answer "become the host".
 *
 * It does not re-implement any guard: the decision is `authorizeSelfPromotion`'s,
 * and all this adds is the honest computation of `holdsMirroredAuthority` — via
 * `mirrorGrantsAuthorityTo`, never by inspecting a checkpoint by hand — plus the
 * second freshness check the in-memory hold makes necessary.
 */
export function evaluateSelfPromotion(
  holdings: SuccessorHoldings,
  input: SelfPromotionInput,
): WirePromotionDecision {
  const refuse = (reason: PromotionRefusal | WirePromotionRefusal): WirePromotionDecision =>
    Object.freeze({ promote: false, reason });

  if (!(input.promotionEnabled ?? HOST_MIGRATION_PROMOTION_ENABLED)) return refuse('migration-disabled');

  const mandate = holdings.mandate;
  const expectedTerm = mandate === null ? 0 : mandate.term + 1;
  const mirror = holdings.mirror;

  // Identity- and term-bound: holding *a* mirror is not holding *your own*
  // mirror, and a mirror stamped for an earlier succession authorises nothing.
  const adoptable = mirror !== null
    && holdings.mirrorTerm === expectedTerm
    && mirrorGrantsAuthorityTo(mirror, input.selfId, input.roomCode, expectedTerm);

  // A mirror that arrived fresh can go stale sitting in memory. The rebase wrote
  // `expiresAtEpochMs` in THIS machine's clock, so this is a straight local
  // comparison with no second clock in it.
  const fresh = adoptable
    && mirror !== null
    && Number.isFinite(input.nowEpochMs)
    && input.nowEpochMs < mirror.expiresAtEpochMs;

  const decision = authorizeSelfPromotion({
    selfId: input.selfId,
    roomCode: input.roomCode,
    assessment: input.assessment,
    mandate,
    highestObservedTerm: holdings.highestObservedTerm,
    roster: input.roster,
    holdsMirroredAuthority: adoptable && fresh,
    nowEpochMs: input.nowEpochMs,
  });
  if (!decision.promote) {
    // Report the specific mirror problem rather than the generic
    // 'no-authority-to-adopt' when the mirror is what actually failed, so a
    // wiring mistake is distinguishable from a genuinely absent mirror.
    if (decision.reason === 'no-authority-to-adopt' && mirror !== null) {
      return refuse(adoptable ? 'mirror-stale' : 'mirror-not-adoptable');
    }
    return refuse(decision.reason);
  }
  // Unreachable while the guards above hold; kept as a hard fail-closed floor so
  // a future edit cannot produce a promotion with no document attached.
  if (mirror === null || mandate === null) return refuse('mirror-not-adoptable');

  return Object.freeze({
    promote: true,
    term: decision.term,
    roomCode: decision.roomCode,
    successorId: decision.successorId,
    checkpoint: mirror,
    mandate,
  });
}

/**
 * The claim a promoted peer broadcasts to its followers, before any gameplay
 * traffic. Returns null for a decision that did not authorise promotion, so a
 * caller cannot announce a promotion it was refused.
 */
export function buildHostPromotedMessage(
  decision: WirePromotionDecision,
  nonce: number,
): HostPromotedMessage | null {
  if (!decision.promote) return null;
  return Object.freeze({
    type: 'host-promoted',
    schemaVersion: HOST_SUCCESSION_PROTOCOL_SCHEMA_VERSION,
    by: decision.successorId,
    mandate: decision.mandate,
    term: decision.term,
    nonce,
  }) as HostPromotedMessage;
}

export type FollowerAcceptResult = Readonly<{
  holdings: SuccessorHoldings;
  acceptance: FollowerAcceptance;
}>;

/**
 * G4, follower half. Followers validate a new host rather than voting for one, so
 * a guest that promoted itself without a valid mandate is rejected by everybody
 * and owns nothing — which turns "one guest went rogue" into a harmless no-op.
 *
 * On acceptance the held mirror is discarded: somebody else is the authority now,
 * and a stale mirror left lying around is a second claim waiting to happen.
 */
export function acceptHostPromoted(
  holdings: SuccessorHoldings,
  message: HostPromotedMessage,
  input: Readonly<{ roomCode: string; roster: SuccessionRoster }>,
): FollowerAcceptResult {
  const acceptance = acceptPromotedHost({
    roomCode: input.roomCode,
    claimantId: message.by,
    presentedMandate: isSuccessionMandate(message.mandate) ? message.mandate : null,
    presentedTerm: message.term,
    highestObservedTerm: holdings.highestObservedTerm,
    roster: input.roster,
  });
  if (!acceptance.accept) return Object.freeze({ holdings, acceptance });
  return Object.freeze({
    holdings: Object.freeze({
      ...holdings,
      highestObservedTerm: acceptance.term,
      mandate: null,
      mirror: null,
      mirrorTerm: 0,
      mirrorReceivedAtEpochMs: null,
      mirrorOffsetTrusted: false,
    }),
    acceptance,
  });
}

/**
 * The mirror module's own recommended refresh floor, re-exported so the cadence
 * relationship between the two is pinned by a test rather than by a comment: the
 * wire interval sits at or above this floor and far below the checkpoint TTL.
 */
export const HOST_AUTHORITY_MIRROR_WIRE_INTERVAL_FLOOR_MS = HOST_AUTHORITY_MIRROR_INTERVAL_MS;
