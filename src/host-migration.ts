/**
 * HF-325 — host loss, successor election, and the guarded path to a promoted host.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * Two things, both pure and deterministic:
 *
 *  1. The *decision layer* for guest-promoted host migration: who succeeds a
 *     dead host, under what proof, and — far more importantly — every reason a
 *     guest must REFUSE to promote itself.
 *  2. The guest-side host-loss state machine and its visible presentation, so a
 *     player whose host vanished is told exactly what happened and is handed a
 *     clean path, instead of silently grinding out a 90-second retry loop
 *     against a room that will never answer.
 *
 * WHY THE DECISION LAYER LOOKS PARANOID
 * -------------------------------------
 * The transport is a star: every guest holds exactly one link, to the host, and
 * the room code *is* the host's PeerJS id. Guests have no channel to each other,
 * so they cannot hold a vote. Any guest that promotes itself is therefore acting
 * on purely local evidence, and local evidence cannot distinguish "the host is
 * dead" from "I am partitioned away from a host that is happily serving everyone
 * else". Two hosts both believing they own the match is strictly worse than a
 * dead room, so this module is built so that a guest promotes only when four
 * independent guards agree:
 *
 *   G1 MANDATE      Only the host mints a SuccessionMandate, naming one
 *                   successor and one strictly increasing term. Guests never
 *                   mint one, so the successor's *identity* is host-decided,
 *                   never guest-claimed.
 *   G2 AGREEMENT    The promoting guest recomputes the election locally from
 *                   the same host-authored roster revision the mandate cites.
 *                   Any drift — different revision, different winner — refuses.
 *   G3 ROOM LOCK    Promotion requires claiming the room code's PeerJS id. That
 *                   id is a single global lock: while the old host holds it the
 *                   claim fails, and a failed claim ABORTS permanently. It is
 *                   never retried, because retrying is how you win a race you
 *                   were supposed to lose.
 *   G4 TERM FENCE   Followers accept a host only if it presents a term at least
 *                   as high as the highest term they have seen, and a host that
 *                   observes a higher term than its own must stand down. A stale
 *                   host cannot keep followers, and therefore cannot keep the
 *                   match.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No transport, no role flip, no authority transfer. Those live in network.ts /
 * protocol.ts / legacy-main.ts and are owned elsewhere; see
 * scratchpad/wave2-handoffs/hf325-host-migration.md for the exact deltas.
 * The authority a promoted guest would adopt is now built in
 * `host-authority-mirror.ts`: it reshapes a host checkpoint so the successor's
 * own entry becomes `hostPlayer`, and it re-expresses the document in the
 * receiver's clock so wall-clock skew cannot masquerade as downtime. That
 * removes the reason promotion could never be safe, but it does NOT enable
 * promotion: nothing ships the mirror over the wire yet, `network.ts` still has
 * no `role: 'client' -> 'host'` flip, and — decisively — the stale-host
 * stand-down path does not exist, so during a signalling blip two peers could
 * still both believe they own the match. `authorizeSelfPromotion` therefore
 * keeps refusing with `no-authority-to-adopt` for every real caller, because no
 * real caller can yet set `holdsMirroredAuthority`. Do not wire it until all
 * three land; the handoff spells out why.
 */

import { REJOIN_GRACE_MS } from './private-match';

export const HOST_SUCCESSION_MANDATE_SCHEMA_VERSION = 1;

/** Terms start at 1 so that "no term yet" is representable as 0. */
export const INITIAL_HOST_TERM = 1;
export const MAX_HOST_TERM = 1_000_000_000;

/**
 * A mandate is only meaningful inside the same window in which a disconnected
 * member keeps a roster reservation. Past it there is no match left to inherit.
 */
export const HOST_SUCCESSION_MANDATE_TTL_MS = REJOIN_GRACE_MS;

/**
 * Host silence long enough to warn about, but far short of declaring death.
 * Mirrors network.ts CLIENT_HOST_SILENCE_TIMEOUT_MS: at this point the transport
 * watchdog is already probing, so the player deserves to know the link is sick.
 */
export const HOST_SILENCE_WARNING_MS = 15_000;

/**
 * Fewer than this many surviving guests and migration buys nothing: a lone
 * survivor has nobody to host for, and "I alone cannot see the host" is the
 * single most likely false positive there is. Such a guest is sent to the lobby
 * with an honest message rather than allowed to claim a room.
 */
export const MIN_SURVIVORS_FOR_MIGRATION = 2;

const MAX_ID_LENGTH = 80;
/** Matches the room-code shape the host checkpoint already enforces. */
const ROOM_CODE_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isParticipantId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

// ---------------------------------------------------------------------------
// Roster and election
// ---------------------------------------------------------------------------

/** The election-relevant projection of a LobbyMember. */
export type SuccessionMember = Readonly<{
  id: string;
  connected: boolean;
}>;

/**
 * The host-authored roster the election is computed from. `revision` is the
 * agreement key: two participants that computed from the same revision computed
 * from the same input, and only then can their answers be compared.
 */
export type SuccessionRoster = Readonly<{
  revision: number;
  hostId: string;
  members: readonly SuccessionMember[];
}>;

export type ElectionRefusal =
  | 'malformed-roster'
  | 'duplicate-member-ids'
  | 'host-not-in-roster'
  | 'no-connected-guests';

export type HostSuccessorElection =
  | Readonly<{
    decided: true;
    successorId: string;
    /** Every eligible candidate, lowest id first. Order is part of the contract. */
    candidates: readonly string[];
    revision: number;
  }>
  | Readonly<{
    decided: false;
    reason: ElectionRefusal;
    candidates: readonly string[];
    revision: number;
  }>;

export function isSuccessionRoster(value: unknown): value is SuccessionRoster {
  if (!isRecord(value)
    || !isBoundedInteger(value.revision, 0, 1_000_000_000)
    || !isParticipantId(value.hostId)
    || !Array.isArray(value.members)
    || value.members.length < 1
    || value.members.length > 16) return false;
  return value.members.every((member) => isRecord(member)
    && isParticipantId(member.id)
    && typeof member.connected === 'boolean');
}

/**
 * The election rule, stated once so it can be relied on everywhere:
 *
 *   the successor is the lexicographically lowest `id` among roster members that
 *   are not the host and are marked connected.
 *
 * Lexicographic order over the host-authored id set is total and stable, so
 * every participant computing from the same roster revision reaches the same
 * answer with no messages exchanged. That is the whole point: agreement is
 * obtained by shared input, not by a round of chatter that a partition could
 * split. Ties are impossible because ids are unique, and a roster carrying
 * duplicates is refused rather than resolved.
 */
export function electHostSuccessor(roster: unknown): HostSuccessorElection {
  if (!isSuccessionRoster(roster)) {
    return Object.freeze({ decided: false, reason: 'malformed-roster', candidates: Object.freeze([]), revision: -1 });
  }
  const ids = roster.members.map((member) => member.id);
  if (new Set(ids).size !== ids.length) {
    return Object.freeze({
      decided: false,
      reason: 'duplicate-member-ids',
      candidates: Object.freeze([]),
      revision: roster.revision,
    });
  }
  if (!ids.includes(roster.hostId)) {
    return Object.freeze({
      decided: false,
      reason: 'host-not-in-roster',
      candidates: Object.freeze([]),
      revision: roster.revision,
    });
  }
  const candidates = Object.freeze(roster.members
    .filter((member) => member.id !== roster.hostId && member.connected)
    .map((member) => member.id)
    .sort());
  if (candidates.length === 0) {
    return Object.freeze({
      decided: false,
      reason: 'no-connected-guests',
      candidates,
      revision: roster.revision,
    });
  }
  return Object.freeze({
    decided: true,
    successorId: candidates[0]!,
    candidates,
    revision: roster.revision,
  });
}

/** Count of connected non-host members — the survivor population G-check. */
export function survivingGuestCount(roster: SuccessionRoster): number {
  return roster.members.filter((member) => member.id !== roster.hostId && member.connected).length;
}

// ---------------------------------------------------------------------------
// Succession mandate (G1) — minted only by the host
// ---------------------------------------------------------------------------

/**
 * A host-issued, term-stamped statement of "if I die, this exact guest is next".
 * Issuing it ahead of time is what removes the need for a guest-side vote: the
 * host is the arbiter while it is still alive to arbitrate.
 */
export type SuccessionMandate = Readonly<{
  schemaVersion: typeof HOST_SUCCESSION_MANDATE_SCHEMA_VERSION;
  /** Strictly increasing across the life of a room. Fences a stale host. */
  term: number;
  roomCode: string;
  successorId: string;
  /** The roster revision the host elected from. Followers must match it. */
  lobbyRevision: number;
  issuedByHostId: string;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}>;

export function isSuccessionMandate(value: unknown): value is SuccessionMandate {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    'schemaVersion', 'term', 'roomCode', 'successorId', 'lobbyRevision',
    'issuedByHostId', 'issuedAtEpochMs', 'expiresAtEpochMs',
  ]);
  if (Object.keys(value).length !== allowed.size
    || !Object.keys(value).every((key) => allowed.has(key))) return false;
  return value.schemaVersion === HOST_SUCCESSION_MANDATE_SCHEMA_VERSION
    && isBoundedInteger(value.term, INITIAL_HOST_TERM, MAX_HOST_TERM)
    && typeof value.roomCode === 'string' && ROOM_CODE_PATTERN.test(value.roomCode)
    && isParticipantId(value.successorId)
    && isParticipantId(value.issuedByHostId)
    && value.successorId !== value.issuedByHostId
    && isBoundedInteger(value.lobbyRevision, 0, 1_000_000_000)
    && isBoundedInteger(value.issuedAtEpochMs, 1, 10_000_000_000_000)
    && value.expiresAtEpochMs === Number(value.issuedAtEpochMs) + HOST_SUCCESSION_MANDATE_TTL_MS;
}

export type MintMandateInput = Readonly<{
  roster: SuccessionRoster;
  roomCode: string;
  /** Highest term this host has already minted or observed; 0 when brand new. */
  previousTerm: number;
  nowEpochMs: number;
}>;

/**
 * Mint the next mandate. Returns null rather than a degraded mandate whenever
 * anything is off — a missing mandate costs a dead room, a wrong one costs a
 * split brain, and those are not close in severity.
 */
export function mintSuccessionMandate(input: MintMandateInput): SuccessionMandate | null {
  if (!isSuccessionRoster(input.roster)
    || typeof input.roomCode !== 'string' || !ROOM_CODE_PATTERN.test(input.roomCode)
    || !isBoundedInteger(input.previousTerm, 0, MAX_HOST_TERM)
    || !isBoundedInteger(input.nowEpochMs, 1, 10_000_000_000_000)) return null;
  const election = electHostSuccessor(input.roster);
  if (!election.decided) return null;
  const term = Math.max(INITIAL_HOST_TERM, input.previousTerm + 1);
  if (term > MAX_HOST_TERM) return null;
  const mandate: SuccessionMandate = Object.freeze({
    schemaVersion: HOST_SUCCESSION_MANDATE_SCHEMA_VERSION,
    term,
    roomCode: input.roomCode,
    successorId: election.successorId,
    lobbyRevision: input.roster.revision,
    issuedByHostId: input.roster.hostId,
    issuedAtEpochMs: input.nowEpochMs,
    expiresAtEpochMs: input.nowEpochMs + HOST_SUCCESSION_MANDATE_TTL_MS,
  });
  return isSuccessionMandate(mandate) ? mandate : null;
}

/** Monotonic term comparison. Equal terms do NOT supersede. */
export function termSupersedes(candidateTerm: number, heldTerm: number): boolean {
  return isBoundedInteger(candidateTerm, INITIAL_HOST_TERM, MAX_HOST_TERM)
    && isBoundedInteger(heldTerm, 0, MAX_HOST_TERM)
    && candidateTerm > heldTerm;
}

// ---------------------------------------------------------------------------
// Guest-side host-loss state machine
// ---------------------------------------------------------------------------

export type HostLinkSample = Readonly<{
  role: 'offline' | 'host' | 'client';
  eventChannelOpen: boolean;
  reconnectPending: boolean;
  lastValidHostMessageMonoMs: number | null;
  /** performance.now() deadline at which the 90s rejoin window expires. */
  reconnectDeadlineMonoMs: number | null;
  /** Set once a 'lobby-closed' farewell arrives. A reset is not a crash. */
  lobbyClosedByHost: boolean;
  nowMonoMs: number;
}>;

export type HostLossState =
  /** Not a guest in a live room; nothing to say. */
  | 'inactive'
  /** Host is talking. */
  | 'healthy'
  /** Channel open but the host has gone quiet past the warning threshold. */
  | 'unstable'
  /** Transport dropped; the bounded retry loop is running. */
  | 'reconnecting'
  /** Retry window expired. The host is gone as far as this client can tell. */
  | 'host-lost'
  /** The host deliberately closed this lobby. The old room code is dead. */
  | 'closed-by-host';

export type HostLossAssessment = Readonly<{
  state: HostLossState;
  /** Milliseconds of retry window left, when a window is running. */
  remainingMs: number | null;
  /** How long the host has been silent, when that is knowable. */
  silentForMs: number | null;
}>;

/**
 * Classify the guest's view of its host. Ordering matters: a deliberate close
 * outranks everything (retrying against a reset room is pure waste), and an
 * expired window outranks a still-pending retry.
 */
export function evaluateHostLoss(sample: HostLinkSample): HostLossAssessment {
  const now = sample.nowMonoMs;
  const silentForMs = Number.isFinite(now) && sample.lastValidHostMessageMonoMs !== null
    && Number.isFinite(sample.lastValidHostMessageMonoMs)
    ? Math.max(0, now - sample.lastValidHostMessageMonoMs)
    : null;
  const frozen = (state: HostLossState, remainingMs: number | null): HostLossAssessment =>
    Object.freeze({ state, remainingMs, silentForMs });

  if (sample.role !== 'client') return frozen('inactive', null);
  if (sample.lobbyClosedByHost) return frozen('closed-by-host', null);

  const deadline = sample.reconnectDeadlineMonoMs;
  const windowRunning = deadline !== null && Number.isFinite(deadline) && Number.isFinite(now);
  if (windowRunning && now >= deadline) return frozen('host-lost', 0);

  const remainingMs = windowRunning ? Math.max(0, deadline - now) : null;
  if (sample.reconnectPending || !sample.eventChannelOpen) return frozen('reconnecting', remainingMs);
  if (silentForMs !== null && silentForMs >= HOST_SILENCE_WARNING_MS) return frozen('unstable', remainingMs);
  return frozen('healthy', remainingMs);
}

export type HostLossActionKind = 'none' | 'wait' | 'rejoin' | 'return-to-lobby';

export type HostLossPresentation = Readonly<{
  visible: boolean;
  tone: 'ok' | 'warn' | 'error';
  headline: string;
  detail: string;
  action: HostLossActionKind;
  actionLabel: string;
}>;

/**
 * Turn the assessment into something a player actually sees. The owner's
 * complaint was that a lost host is silent — every terminal state here names
 * what happened and offers exactly one obvious next step.
 */
export function hostLossPresentation(assessment: HostLossAssessment): HostLossPresentation {
  const seconds = assessment.remainingMs === null
    ? null
    : Math.max(0, Math.ceil(assessment.remainingMs / 1_000));
  switch (assessment.state) {
    case 'inactive':
    case 'healthy':
      return Object.freeze({
        visible: false,
        tone: 'ok',
        headline: '',
        detail: '',
        action: 'none',
        actionLabel: '',
      });
    case 'unstable':
      return Object.freeze({
        visible: true,
        tone: 'warn',
        headline: 'HOST CONNECTION UNSTABLE',
        detail: 'No update from the host for a few seconds. Holding your place in the match.',
        action: 'wait',
        actionLabel: 'WAITING',
      });
    case 'reconnecting':
      return Object.freeze({
        visible: true,
        tone: 'warn',
        headline: 'RECONNECTING TO HOST',
        detail: seconds === null
          ? 'Lost the host connection. Retrying inside the rejoin window.'
          : `Lost the host connection. Retrying for another ${seconds}s before the match is given up.`,
        action: 'wait',
        actionLabel: 'WAITING',
      });
    case 'host-lost':
      return Object.freeze({
        visible: true,
        tone: 'error',
        headline: 'HOST LEFT THE MATCH',
        detail: 'The host never came back inside the rejoin window, so this match cannot continue. '
          + 'Your room code is saved — if the host reopens the same lobby, REJOIN LAST MATCH will take you straight back.',
        action: 'rejoin',
        actionLabel: 'REJOIN LAST MATCH',
      });
    case 'closed-by-host':
      return Object.freeze({
        visible: true,
        tone: 'error',
        headline: 'HOST CLOSED THE LOBBY',
        detail: 'The host reset this room. The old invite code will not work again — ask for the new one.',
        action: 'return-to-lobby',
        actionLabel: 'BACK TO LOBBY',
      });
  }
}

// ---------------------------------------------------------------------------
// Self-promotion authorization — the split-brain gate
// ---------------------------------------------------------------------------

export type PromotionRefusal =
  /** The host is not confirmed gone. Silence alone is never enough. */
  | 'host-not-confirmed-lost'
  /** The host closed the lobby on purpose. There is nothing to inherit. */
  | 'lobby-closed-by-host'
  /** No host-issued mandate. A guest may never appoint itself. */
  | 'no-mandate'
  | 'malformed-mandate'
  /** The mandate names a different guest. Stand down for them. */
  | 'mandate-names-another-guest'
  /** The mandate is for a different room. */
  | 'mandate-room-mismatch'
  /** A newer term exists, so this mandate is stale. */
  | 'mandate-superseded'
  /** The mandate outlived the rejoin window. */
  | 'mandate-expired'
  /** This guest's roster is not the revision the host elected from. */
  | 'roster-revision-mismatch'
  /** Local election disagrees with the mandate. Refuse rather than race. */
  | 'election-disagrees-with-mandate'
  | 'election-undecided'
  /** Too few survivors for migration to mean anything; likely a lone partition. */
  | 'insufficient-survivors'
  /** No mirrored authority to adopt, so a promoted host would resume a fiction. */
  | 'no-authority-to-adopt';

export type SelfPromotionSample = Readonly<{
  selfId: string;
  roomCode: string;
  assessment: HostLossAssessment;
  mandate: SuccessionMandate | null;
  /** Highest term this guest has ever observed from any host. 0 if none. */
  highestObservedTerm: number;
  /** The newest host-authored roster this guest holds. */
  roster: SuccessionRoster;
  /**
   * Whether this guest actually holds mirrored match authority for the room.
   * Compute it with `mirrorGrantsAuthorityTo` from `host-authority-mirror.ts`,
   * never by inspecting a checkpoint by hand: the mirror must name THIS peer,
   * THIS room and THIS term, or it authorises nothing.
   *
   * False today for every guest, because no wire message ships a mirror yet.
   * Promotion without one would resume a match nobody can reconstruct, so it is
   * a hard refusal rather than a best-effort guess.
   */
  holdsMirroredAuthority: boolean;
  nowEpochMs: number;
}>;

export type SelfPromotionDecision =
  | Readonly<{
    promote: true;
    /** The term the promoted host must run at and advertise. */
    term: number;
    roomCode: string;
    successorId: string;
  }>
  | Readonly<{ promote: false; reason: PromotionRefusal }>;

/**
 * The one function that may ever say "yes, become the host".
 *
 * Every guard is a separate named refusal so that a wiring mistake surfaces as
 * a specific, greppable reason instead of a silent fallthrough. The checks run
 * cheapest-and-most-decisive first, but the order carries no safety meaning:
 * all of them must pass.
 */
export function authorizeSelfPromotion(sample: SelfPromotionSample): SelfPromotionDecision {
  const refuse = (reason: PromotionRefusal): SelfPromotionDecision =>
    Object.freeze({ promote: false, reason });

  if (sample.assessment.state === 'closed-by-host') return refuse('lobby-closed-by-host');
  // G-precondition: only a confirmed-dead host, never mere silence. 'unstable'
  // and 'reconnecting' both mean the host may still be serving other guests.
  if (sample.assessment.state !== 'host-lost') return refuse('host-not-confirmed-lost');

  // G1: the mandate.
  if (sample.mandate === null) return refuse('no-mandate');
  if (!isSuccessionMandate(sample.mandate)) return refuse('malformed-mandate');
  const mandate = sample.mandate;
  if (!isParticipantId(sample.selfId)) return refuse('mandate-names-another-guest');
  if (mandate.successorId !== sample.selfId) return refuse('mandate-names-another-guest');
  if (typeof sample.roomCode !== 'string' || mandate.roomCode !== sample.roomCode) {
    return refuse('mandate-room-mismatch');
  }
  if (!isBoundedInteger(sample.nowEpochMs, 1, 10_000_000_000_000)
    || sample.nowEpochMs >= mandate.expiresAtEpochMs) return refuse('mandate-expired');

  // G4 (issuing half): a mandate older than a term already seen is stale — some
  // other succession already happened and this guest simply has not caught up.
  // Equality is allowed: the newest mandate a guest holds is normally the same
  // term as the newest one it has observed.
  if (!isBoundedInteger(sample.highestObservedTerm, 0, MAX_HOST_TERM)
    || mandate.term < sample.highestObservedTerm) return refuse('mandate-superseded');

  // G2: recompute the election from the very revision the host cited.
  if (!isSuccessionRoster(sample.roster)) return refuse('roster-revision-mismatch');
  if (sample.roster.revision !== mandate.lobbyRevision) return refuse('roster-revision-mismatch');
  if (sample.roster.hostId !== mandate.issuedByHostId) return refuse('roster-revision-mismatch');
  const election = electHostSuccessor(sample.roster);
  if (!election.decided) return refuse('election-undecided');
  if (election.successorId !== mandate.successorId) return refuse('election-disagrees-with-mandate');

  // Partition guard: a lone survivor is far more likely isolated than correct.
  if (survivingGuestCount(sample.roster) < MIN_SURVIVORS_FOR_MIGRATION) {
    return refuse('insufficient-survivors');
  }

  // Nothing to inherit means nothing to host. This is the guard that keeps
  // migration disabled until a host->guest authority mirror actually exists.
  if (!sample.holdsMirroredAuthority) return refuse('no-authority-to-adopt');

  return Object.freeze({
    promote: true,
    // The successor runs one term above the mandate that appointed it, so the
    // old host's term can never match or outrank it.
    term: mandate.term + 1,
    roomCode: mandate.roomCode,
    successorId: mandate.successorId,
  });
}

// ---------------------------------------------------------------------------
// G3 — the room-code claim is the mutual-exclusion lock
// ---------------------------------------------------------------------------

export type RoomClaimOutcome = 'claimed' | 'unavailable-id' | 'signalling-error';

/**
 * A promoted guest must claim the room code's PeerJS id, which only one peer on
 * the signalling server may hold. That makes the claim a global lock and the
 * strongest anti-split-brain guard available to this topology.
 *
 * `unavailable-id` therefore means "someone else already owns this room" — very
 * possibly the original host, whose data channels can outlive a signalling
 * blip. The only safe response is to abort the promotion for good. Retrying,
 * backing off, or falling back to a fresh room code would all end with two peers
 * believing they own the same match, which is exactly the outcome this module
 * exists to prevent.
 */
export function resolveRoomClaimOutcome(outcome: RoomClaimOutcome): 'promote' | 'abort' {
  return outcome === 'claimed' ? 'promote' : 'abort';
}

// ---------------------------------------------------------------------------
// G4 — follower-side validation and stale-host stand-down
// ---------------------------------------------------------------------------

export type FollowerAcceptanceRefusal =
  | 'malformed-mandate'
  | 'room-mismatch'
  | 'stale-term'
  | 'claimant-not-the-successor'
  | 'roster-revision-mismatch'
  | 'election-disagrees-with-mandate';

export type FollowerAcceptance =
  | Readonly<{ accept: true; term: number; hostId: string }>
  | Readonly<{ accept: false; reason: FollowerAcceptanceRefusal }>;

export type FollowerAcceptanceSample = Readonly<{
  roomCode: string;
  /** Identity the peer claiming to be the new host presents. */
  claimantId: string;
  /** The mandate that peer presents as its right to host. */
  presentedMandate: SuccessionMandate | null;
  /** Term the claimant says it is running at. */
  presentedTerm: number;
  /** Highest term this follower has seen. A claimant must meet or beat it. */
  highestObservedTerm: number;
  roster: SuccessionRoster;
}>;

/**
 * Followers validate a new host rather than voting for one. A guest that
 * promoted itself without a valid mandate is rejected by everybody and so never
 * owns the match no matter what it believes about itself — which is what turns
 * "one guest went rogue" from a split brain into a harmless no-op.
 */
export function acceptPromotedHost(sample: FollowerAcceptanceSample): FollowerAcceptance {
  const refuse = (reason: FollowerAcceptanceRefusal): FollowerAcceptance =>
    Object.freeze({ accept: false, reason });
  if (!isSuccessionMandate(sample.presentedMandate)) return refuse('malformed-mandate');
  const mandate = sample.presentedMandate;
  if (typeof sample.roomCode !== 'string' || mandate.roomCode !== sample.roomCode) {
    return refuse('room-mismatch');
  }
  if (!isParticipantId(sample.claimantId) || mandate.successorId !== sample.claimantId) {
    return refuse('claimant-not-the-successor');
  }
  // The successor advertises mandate.term + 1; anything lower is a stale or
  // replayed host, and anything at or below what we already saw is not new.
  if (!isBoundedInteger(sample.presentedTerm, INITIAL_HOST_TERM, MAX_HOST_TERM)
    || sample.presentedTerm !== mandate.term + 1
    || !termSupersedes(sample.presentedTerm, sample.highestObservedTerm)) {
    return refuse('stale-term');
  }
  if (!isSuccessionRoster(sample.roster) || sample.roster.revision !== mandate.lobbyRevision) {
    return refuse('roster-revision-mismatch');
  }
  const election = electHostSuccessor(sample.roster);
  if (!election.decided || election.successorId !== mandate.successorId) {
    return refuse('election-disagrees-with-mandate');
  }
  return Object.freeze({ accept: true, term: sample.presentedTerm, hostId: sample.claimantId });
}

/**
 * A host that learns of a term higher than its own has been superseded and must
 * stand down immediately — stop broadcasting authority, stop admitting guests,
 * and surrender the room. This is the half of the term fence that guarantees a
 * recovered old host cannot go on believing it owns a match that moved on
 * without it. Equal terms retain, so a host is never talked out of its own room
 * by a replay of its own term.
 */
export function resolveHostTermConflict(ownTerm: number, observedTerm: number): 'retain' | 'stand-down' {
  return termSupersedes(observedTerm, ownTerm) ? 'stand-down' : 'retain';
}
