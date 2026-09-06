import type { HealthAuthorityMessage } from './protocol';

/**
 * HF-535 — host-authoritative health must reach every observer inside one RTT.
 *
 * MEASURED DEFECT (mp-repair REPORT §7.2, day-mp-fix-bundle.json): the host
 * applies damage to guestB, then re-broadcasts
 * `createCanonicalRemoteState(remote.snapshot, ...)`. That snapshot carries the
 * LAST sequence the host admitted from guestB, which guestA has already
 * applied, so `admitRemoteSnapshot` rejects it as an older sequence. guestA
 * only learns the new hp from guestB's NEXT self-authored state relayed by the
 * host — a three-leg path (host -> victim -> host -> observer) against a
 * one-RTT (120 ms) bound. Measured first-seen: host 0 ms, guestB 225 ms,
 * guestA never inside the window.
 *
 * This module is the ordering authority for a health fact that travels on its
 * OWN counter, independent of movement sequences, in both directions:
 *
 *   - `evaluateHealthAuthorityPublication` runs on the host and decides
 *     whether the stored authority has moved in a direction an observer must
 *     be told about immediately, and mints the message with the next revision.
 *   - `admitHealthAuthority` runs on an observer and is fail-closed: it admits
 *     only a message authored by the sitting host, for the current match epoch,
 *     for the life it is presenting, with a strictly newer revision in that
 *     epoch. A fact about a NEWER life is held, not presented: the observer's
 *     continuity has not advanced yet, so applying it would make a corpse
 *     visible at its death position; the state lane delivers the new life.
 *
 * It deliberately holds no movement authority: nothing here reads or writes a
 * position, a sequence, or an input acknowledgement, so guest prediction and
 * host reconciliation are untouched by a health fact.
 */

export const HEALTH_AUTHORITY_MAX_HP = 100;

/**
 * How many copies of ONE fact the host emits, and how far apart.
 *
 * MEASURED (day-mp-damage soak attempt 1, artifacts/qa/mp-soak-gate/day-mp-damage-bundle.json):
 * the gate impairs every send with a deterministic 60 ms one-way delay AND 1%
 * seeded loss, and that loss is applied BEFORE `connection.send`, so it hits the
 * reliable event lane too - a single-shot health fact has a 1-in-100 chance of
 * simply never existing for one observer, with no retransmit to save it. Three
 * copies 35 ms apart all land inside the 120 ms bound (60/95/130 ms one-way for
 * the first two) and are idempotent: the revision is unchanged, so an observer
 * that already applied the fact rejects the copies as `stale-revision`.
 */
export const HEALTH_AUTHORITY_EMIT_COPIES = 3;
export const HEALTH_AUTHORITY_RESEND_INTERVAL_MS = 35;

const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;

const clampHp = (hp: number): number => Math.min(HEALTH_AUTHORITY_MAX_HP, Math.max(0, hp));

/** What the host last told observers about one player. */
export type PublishedHealthAuthority = Readonly<{
  hp: number;
  alive: boolean;
  continuity: number;
  revision: number;
  /** Copies of THIS revision already emitted, and when the last one went out. */
  emits: number;
  lastEmittedAtMs: number;
}>;

export type HealthAuthorityPublishInput = Readonly<{
  playerId: string;
  /** The publishing host's own player id; becomes the message author. */
  hostPlayerId: string;
  hp: number;
  alive: boolean;
  continuity: number;
  matchEpoch: number;
  hostTimeMs: number;
  nonce: number;
  /** Monotonic local clock, for the resend cadence only. */
  nowMs: number;
  /**
   * Publish even if the change detector would call this unchanged. Set on the
   * paths that KNOW they just moved the stored authority (host damage), so a
   * ledger disagreement can never swallow the one fact an observer is owed.
   */
  force?: boolean;
  published: PublishedHealthAuthority | undefined;
}>;

export type HealthAuthorityPublishReason = 'published' | 'resent' | 'unchanged' | 'malformed';

export type HealthAuthorityPublishResult = Readonly<{
  message: HealthAuthorityMessage | null;
  reason: HealthAuthorityPublishReason;
  /**
   * The ledger row to store back. It is refreshed on EVERY well-formed
   * evaluation, including the ones that publish nothing, so a silent
   * regeneration back up to 100 cannot leave a stale low watermark that
   * swallows the next real drop.
   */
  published: PublishedHealthAuthority | undefined;
}>;

/**
 * Decide whether the host owes observers a health fact about `playerId`.
 *
 * Publishes on: the first evaluation for a player (fail-open would mean a
 * damage hit between the player appearing and its first tick never reaching
 * anyone), a life/continuity change, an `alive` transition, or a drop in whole
 * hp. It does NOT publish on regeneration upward: an increase already rides
 * the victim's next relayed state within one snapshot period and no observer
 * decision is unsafe while it is briefly low, whereas a per-tick regeneration
 * broadcast would put ~10 reliable messages per second per player on the event
 * lane for no correctness gain.
 */
export function evaluateHealthAuthorityPublication(
  input: HealthAuthorityPublishInput,
): HealthAuthorityPublishResult {
  if (!PLAYER_ID_PATTERN.test(input.playerId)
    || !PLAYER_ID_PATTERN.test(input.hostPlayerId)
    || input.playerId === input.hostPlayerId
    || !Number.isFinite(input.hp)
    || !Number.isSafeInteger(input.continuity) || input.continuity < 0
    || !Number.isSafeInteger(input.matchEpoch) || input.matchEpoch < 0
    || !Number.isFinite(input.hostTimeMs) || input.hostTimeMs < 0
    || !Number.isFinite(input.nowMs)
    || !Number.isFinite(input.nonce)) {
    return { message: null, reason: 'malformed', published: input.published };
  }
  const hp = clampHp(input.hp);
  // `alive` is derived, never trusted: a stored authority claiming life at 0 hp
  // must not be able to publish a message that resurrects a corpse on an
  // observer. This is also what makes the wire predicate's
  // `alive === (hp > 0)` check satisfiable by every message this mints.
  const alive = input.alive && hp > 0;
  const prior = input.published;
  const changed = input.force === true
    || !prior
    || prior.continuity !== input.continuity
    || alive !== prior.alive
    || Math.floor(hp) < Math.floor(prior.hp);
  const mint = (
    factHp: number, factAlive: boolean, factContinuity: number, revision: number,
  ): HealthAuthorityMessage => ({
    type: 'health-authority',
    by: input.hostPlayerId,
    playerId: input.playerId,
    hp: factHp,
    alive: factAlive,
    continuity: factContinuity,
    matchEpoch: input.matchEpoch,
    revision,
    hostTimeMs: input.hostTimeMs,
    nonce: input.nonce,
  });
  if (changed) {
    const revision = (prior?.revision ?? -1) + 1;
    return {
      message: mint(hp, alive, input.continuity, revision),
      reason: 'published',
      published: Object.freeze({
        hp, alive, continuity: input.continuity, revision, emits: 1, lastEmittedAtMs: input.nowMs,
      }),
    };
  }
  // While a fact is still being emitted its stored hp IS the fact, so the
  // copies cannot disagree with each other; the watermark only resumes
  // tracking live hp once the last copy has gone out. Without that hold, a
  // regeneration between copies would put two different payloads on the wire
  // under one revision and the value an observer kept would depend on arrival
  // order.
  const emitting = prior.emits < HEALTH_AUTHORITY_EMIT_COPIES;
  if (emitting && input.nowMs - prior.lastEmittedAtMs >= HEALTH_AUTHORITY_RESEND_INTERVAL_MS) {
    // Same revision, same fact: a duplicate an observer rejects as stale, and
    // the only defence against the gate's 1% loss on a single-shot event.
    return {
      message: mint(prior.hp, prior.alive, prior.continuity, prior.revision),
      reason: 'resent',
      published: Object.freeze({ ...prior, emits: prior.emits + 1, lastEmittedAtMs: input.nowMs }),
    };
  }
  return {
    message: null,
    reason: 'unchanged',
    published: emitting ? prior : Object.freeze({ ...prior, hp, alive }),
  };
}

export type HealthAuthorityAdmissionInput = Readonly<{
  message: HealthAuthorityMessage;
  /** The receiving peer's network role. Only an observing client applies one. */
  role: 'offline' | 'host' | 'client';
  /** The lobby's host id as the receiver knows it; the only legal author. */
  expectedHostId: string | null | undefined;
  matchEpoch: number;
  /**
   * The life the receiver is presenting for the subject: `remote.continuity`
   * for a third party, the local continuity when the subject is the receiver
   * itself. `null` when the subject is unknown.
   */
  subjectContinuity: number | null;
  /** Highest revision already applied for the subject; -1 when none. */
  lastRevision: number;
  /**
   * Match epoch the stored `lastRevision` belongs to. When defined and
   * different from `matchEpoch` the stored revision is treated as absent: a
   * rematch restarts revisions at 0 while an observer that never reset would
   * otherwise reject the first facts as stale. `null`/undefined keeps the
   * legacy same-epoch comparison.
   */
  lastRevisionEpoch?: number | null;
}>;

/**
 * What an observer holds per subject once a health fact is applied: the
 * epoch-scoped revision (fix 1) plus the applied hp and life the state lane
 * is clamped against (fix 4). Recorded only on a path that actually applied.
 */
export type AppliedHealthAuthority = Readonly<{
  matchEpoch: number;
  revision: number;
  hp: number;
  continuity: number;
}>;

export type HealthAuthorityAdmissionReason =
  | 'accepted'
  | 'not-observer'
  | 'forged-author'
  | 'stale-epoch'
  | 'unknown-subject'
  | 'stale-life'
  | 'newer-life-held'
  | 'stale-revision';

export type HealthAuthorityAdmissionResult = Readonly<{
  accepted: boolean;
  reason: HealthAuthorityAdmissionReason;
  hp: number;
  alive: boolean;
  /** The revision to store when accepted; the unchanged one when rejected. */
  revision: number;
}>;

/**
 * Fail-closed observer admission.
 *
 * Every clause is a reason a health fact could be forged or replayed:
 *
 *   not-observer   the host authored it; it never applies its own broadcast,
 *                  and an offline peer has no host to trust.
 *   forged-author  a guest-authored packet relayed by the host, or one arriving
 *                  before the lobby host id is known. This is the clause that
 *                  keeps the privilege host-only INSIDE the app, independently
 *                  of `isHostAuthorityMessage` dropping it at the transport.
 *   stale-epoch    a fact from a previous match.
 *   stale-life     a fact about a life older than the one being presented.
 *   newer-life-held
 *                  a fact about a life NEWER than the one being presented. It
 *                  is not a replay (continuity only advances) but applying it
 *                  ahead of the local life would present a corpse as alive at
 *                  its death position, so it is held: it burns no revision and
 *                  applies once the local continuity reaches its life. `alive`
 *                  derived from hp only bars same-life resurrection.
 *   stale-revision a duplicate or reordered fact inside the same life and
 *                  match epoch. The applied revision is scoped to the epoch:
 *                  a revision stored under a different match epoch is treated
 *                  as absent, so the first facts of a rematch are admissible.
 */
export function admitHealthAuthority(input: HealthAuthorityAdmissionInput): HealthAuthorityAdmissionResult {
  const { message } = input;
  const hp = clampHp(message.hp);
  const alive = message.alive && hp > 0;
  const reject = (reason: HealthAuthorityAdmissionReason): HealthAuthorityAdmissionResult => ({
    accepted: false, reason, hp, alive, revision: input.lastRevision,
  });
  if (input.role !== 'client') return reject('not-observer');
  if (typeof input.expectedHostId !== 'string' || input.expectedHostId.length === 0
    || message.by !== input.expectedHostId) {
    return reject('forged-author');
  }
  if (!Number.isSafeInteger(input.matchEpoch) || message.matchEpoch !== input.matchEpoch) return reject('stale-epoch');
  if (input.subjectContinuity === null || !Number.isSafeInteger(input.subjectContinuity)) return reject('unknown-subject');
  if (message.continuity < input.subjectContinuity) return reject('stale-life');
  if (message.continuity > input.subjectContinuity) return reject('newer-life-held');
  // The observer ledger is cleared only on host-side paths while the host
  // restarts revisions at 0 every match, so a stored revision from another
  // epoch must not fence the new match out.
  const effectiveLastRevision = input.lastRevisionEpoch === undefined || input.lastRevisionEpoch === null
    || input.lastRevisionEpoch === input.matchEpoch
    ? input.lastRevision
    : -1;
  if (!Number.isSafeInteger(input.lastRevision) || message.revision <= effectiveLastRevision) return reject('stale-revision');
  return { accepted: true, reason: 'accepted', hp, alive, revision: message.revision };
}

/**
 * DAY-MP-DAMAGE-FIXES fix 3 — respawn classification needs a continuity
 * advance, not just a 0 -> positive hp edge.
 *
 * The observer applies a lethal health fact directly onto `remote.snapshot`
 * while the matching pre-death canonical state is still in flight on the
 * lossy state lane (no cross-lane ordering). That ordinary state then reads
 * as `snapshot.hp <= 0 && incoming.hp > 0` and was classified as a respawn,
 * admitting an unbounded teleport through `admitRemoteSnapshotMovement`,
 * pushing `claimEligibleAt` and bypassing the loadout-change gates. A genuine
 * respawn always advances the life, so the hp edge alone is never enough.
 */
export type RemoteRespawnClassificationInput = Readonly<{
  snapshotHp: number;
  incomingHp: number;
  remoteContinuity: number;
  incomingContinuity: number;
  redeployed: boolean;
}>;

export function classifyRemoteRespawn(input: RemoteRespawnClassificationInput): boolean {
  if (input.redeployed) return true;
  if (!Number.isFinite(input.snapshotHp) || !Number.isFinite(input.incomingHp)) return false;
  return input.snapshotHp <= 0
    && input.incomingHp > 0
    && input.incomingContinuity > input.remoteContinuity;
}

/**
 * DAY-MP-DAMAGE-FIXES fix 4 — an admitted state cannot revert a held health
 * authority inside the same life.
 *
 * `remote.snapshot = admittedIncoming` overwrote an applied authority hp with
 * any newer-sequence state, including one the host relayed before it applied
 * the damage. While a fact is held for the subject's current continuity, an
 * admitted state is clamped DOWN to the authority value (never up: this path
 * must not heal) unless the state carries a newer life.
 */
export type HealthAuthorityHpClampInput = Readonly<{
  admittedHp: number;
  heldHp: number | undefined;
  heldContinuity: number | undefined;
  subjectContinuity: number;
  incomingContinuity: number;
}>;

export function clampAdmittedHpToHealthAuthority(input: HealthAuthorityHpClampInput): number {
  if (input.heldHp === undefined || input.heldContinuity === undefined) return input.admittedHp;
  if (!Number.isFinite(input.admittedHp) || !Number.isFinite(input.heldHp)) return input.admittedHp;
  if (input.heldContinuity !== input.subjectContinuity) return input.admittedHp;
  if (input.incomingContinuity > input.subjectContinuity) return input.admittedHp;
  return Math.min(input.admittedHp, input.heldHp);
}

/**
 * DAY-MP-DAMAGE-FIXES fix 2 — re-mint the host's current published fact for
 * a (re)joining observer.
 *
 * A fact published while an observer was inside its rejoin blind window was
 * rejected as unknown-subject and never retried (the publisher only re-mints
 * on change and the copy window is 70 ms). The seed carries the SAME
 * revision, so it is idempotent: an observer that already applied the fact
 * rejects it as stale-revision, one that missed it applies it. Null when the
 * host never published for the subject — the join/state repair already seeds
 * that hp. Host-side only; the caller sends it directly to the joiner.
 */
export type HealthAuthoritySeedInput = Readonly<{
  playerId: string;
  hostPlayerId: string;
  matchEpoch: number;
  hostTimeMs: number;
  nonce: number;
  published: PublishedHealthAuthority | undefined;
}>;

export function mintHealthAuthoritySeed(input: HealthAuthoritySeedInput): HealthAuthorityMessage | null {
  const prior = input.published;
  if (!prior) return null;
  if (!PLAYER_ID_PATTERN.test(input.playerId)
    || !PLAYER_ID_PATTERN.test(input.hostPlayerId)
    || input.playerId === input.hostPlayerId
    || !Number.isSafeInteger(input.matchEpoch) || input.matchEpoch < 0
    || !Number.isFinite(prior.hp)
    || !Number.isSafeInteger(prior.continuity) || prior.continuity < 0
    || !Number.isSafeInteger(prior.revision) || prior.revision < 0
    || !Number.isFinite(input.hostTimeMs) || input.hostTimeMs < 0
    || !Number.isFinite(input.nonce)) {
    return null;
  }
  const hp = clampHp(prior.hp);
  const alive = prior.alive && hp > 0;
  return {
    type: 'health-authority',
    by: input.hostPlayerId,
    playerId: input.playerId,
    hp,
    alive,
    continuity: prior.continuity,
    matchEpoch: input.matchEpoch,
    revision: prior.revision,
    hostTimeMs: input.hostTimeMs,
    nonce: input.nonce,
  };
}
