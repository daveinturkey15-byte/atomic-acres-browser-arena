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
 *     for a life that is not older than the one it is presenting, with a
 *     strictly newer revision.
 *
 * It deliberately holds no movement authority: nothing here reads or writes a
 * position, a sequence, or an input acknowledgement, so guest prediction and
 * host reconciliation are untouched by a health fact.
 */

export const HEALTH_AUTHORITY_MAX_HP = 100;

const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;

const clampHp = (hp: number): number => Math.min(HEALTH_AUTHORITY_MAX_HP, Math.max(0, hp));

/** What the host last told observers about one player. */
export type PublishedHealthAuthority = Readonly<{
  hp: number;
  alive: boolean;
  continuity: number;
  revision: number;
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
  published: PublishedHealthAuthority | undefined;
}>;

export type HealthAuthorityPublishReason = 'published' | 'unchanged' | 'malformed';

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
  const changed = !prior
    || prior.continuity !== input.continuity
    || alive !== prior.alive
    || Math.floor(hp) < Math.floor(prior.hp);
  const revision = changed ? (prior?.revision ?? -1) + 1 : (prior?.revision ?? 0);
  const published: PublishedHealthAuthority = Object.freeze({ hp, alive, continuity: input.continuity, revision });
  if (!changed) return { message: null, reason: 'unchanged', published };
  return {
    message: {
      type: 'health-authority',
      by: input.hostPlayerId,
      playerId: input.playerId,
      hp,
      alive,
      continuity: input.continuity,
      matchEpoch: input.matchEpoch,
      revision,
      hostTimeMs: input.hostTimeMs,
      nonce: input.nonce,
    },
    reason: 'published',
    published,
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
}>;

export type HealthAuthorityAdmissionReason =
  | 'accepted'
  | 'not-observer'
  | 'forged-author'
  | 'stale-epoch'
  | 'unknown-subject'
  | 'stale-life'
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
 *   stale-life     a fact about a life older than the one being presented. A
 *                  fact for a NEWER life is admitted: continuity only ever
 *                  advances, so it cannot be a replay, and `alive` is derived
 *                  from hp, so it can never resurrect anybody.
 *   stale-revision a duplicate or reordered fact inside the same life.
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
  if (!Number.isSafeInteger(input.lastRevision) || message.revision <= input.lastRevision) return reject('stale-revision');
  return { accepted: true, reason: 'accepted', hp, alive, revision: message.revision };
}
