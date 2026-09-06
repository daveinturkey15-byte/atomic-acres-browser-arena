/**
 * HF-535 — clock-driven recovery for the host's rejoin latch.
 *
 * WHAT THE LATCH IS. When a guest rejoins an active match the host rebuilds its
 * remote from `retainedRemoteAuthorities` and sets `awaitingReplacementState`,
 * so the replacement document's own claimed pose cannot overwrite the retained
 * host authority before the resume transaction closes. Exactly one event opens
 * it again: a matching `guest-resume-ack`.
 *
 * WHY THIS MODULE EXISTS, measured rather than assumed. ef32a3e7 added a
 * retransmit for a lost authority, but hung it off the host's guest-state DROP
 * path — and a guest holding `awaitingCanonicalGuestAuthority` (or one the
 * guest-side self-kill had already put at hp 0) has its 20 Hz state pump
 * switched off and sends no state at all. The recovery was edge-triggered by
 * precisely the signal the failure mode removes. In the day-mp soak at
 * 477c3ab6 the whole repair fired twice, both within 4 ms of the join, and the
 * host's copy of guestB then sat frozen at seq 1689 from second 107 to the end
 * of the run — while the host still advertised a two-player roster, because
 * guestB's clock-pings on the reliable event lane kept it inside
 * `network.activePlayerIds(12_000)`. Every other guest lost the replica after
 * 12 s and never got it back: 91 divergences.
 *
 * Two supporting defects made the second disjunct unrecoverable even in
 * principle: `sendGuestResumeAuthority` refused to send at all unless
 * `awaitingReplacementState` was set (so a `rejoin-latch-pending-repair` drop
 * could never resend), and `acceptGuestResumeAck` returned on a late ACK
 * without deleting the pending record. Both are fixed at their call sites.
 *
 * THE FIX IS TIME-TRIGGERED AND FAIL-CLOSED. The latch is armed the moment it
 * closes, driven from the host's existing `updateRemotes` tick, and resolved
 * one of two ways: the guest ACKs, or the deadline sends the EXISTING
 * `guest-resume-failure` — which the guest already handles by dropping to 0 HP
 * and showing "Canonical rejoin failed … Use Rejoin to retry safely."
 *
 * IT MUST NEVER "CLEAR AND ADMIT". Silently clearing `awaitingReplacementState`
 * at the deadline would start admitting the replacement's self-authored pose,
 * which is exactly the laundering the latch exists to stop. A visible bounded
 * failure in 8 s beats an invisible player for 73 s; an invisible pose
 * substitution beats neither.
 */

/**
 * How often a pending authority is retransmitted while the latch is held.
 *
 * The drive now sits on the render tick, so without a throttle a host with a
 * quiet guest would re-send a ~1.3 KB authority every frame. 1 s is the
 * interval ef32a3e7 already used on the drop path; it is kept, not loosened.
 */
export const REJOIN_LATCH_RESEND_INTERVAL_MS = 1_000;

/**
 * Absolute bound on how long a rejoin may hold the latch before the host
 * declares the resume failed.
 *
 * Chosen against the slowest LEGITIMATE resume rather than picked round. The
 * guest's `scheduleGuestResumeWorldTimeout` NACKs `world-repair-timeout` after
 * 2.5 s when its world revision lags, and `guestResumeRetryAllowed` admits
 * attempts 0 and 1 only (`MAX_GUEST_RESUME_RETRIES = 2`), so the longest
 * lawful handshake is two 2.5 s legs — 5 s — after which the host's own retry
 * ceiling already sends `guest-resume-failure`. 8 s sits 3 s above that, and
 * 8 s + one resend interval still lands inside the 12 s freshness prune every
 * client applies to a remote, so a rejoin can never outlive the replica it is
 * trying to repair. Lowering this below 5 s would re-introduce the HF-347
 * regression of failing out a slow heavy-arena resume mid-handshake.
 */
export const REJOIN_LATCH_DEADLINE_MS = 8_000;

export type RejoinLatchAction = 'idle' | 'resend' | 'fail-closed';

export type RejoinLatchRecoveryInput = Readonly<{
  nowMs: number;
  /** When the latch closed, or null if it is not armed. */
  armedAtMs: number | null;
  /** When an authority was last retransmitted, or null if none has been. */
  lastResendAtMs: number | null;
  /**
   * Whether the guest is still transacting on the reliable event lane, i.e.
   * whether `network.activePlayerIds(12_000)` still lists it. A guest that is
   * genuinely gone is the freshness prune's business, not this policy's.
   */
  guestEventLaneActive: boolean;
  /** `remote.awaitingReplacementState || pendingGuestAuthorityRepairs.has(id)`. */
  latched: boolean;
}>;

export function evaluateRejoinLatchRecovery(input: RejoinLatchRecoveryInput): RejoinLatchAction {
  if (!input.latched || input.armedAtMs === null) return 'idle';
  if (!Number.isFinite(input.nowMs)) return 'idle';
  if (!input.guestEventLaneActive) return 'idle';
  if (input.nowMs - input.armedAtMs >= REJOIN_LATCH_DEADLINE_MS) return 'fail-closed';
  if (input.lastResendAtMs === null) return 'resend';
  return input.nowMs - input.lastResendAtMs >= REJOIN_LATCH_RESEND_INTERVAL_MS ? 'resend' : 'idle';
}

const armedAtMsById = new Map<string, number>();
const lastResendAtMsById = new Map<string, number>();

/**
 * Arm the latch for a player. Deliberately idempotent: re-arming an already
 * armed latch keeps the ORIGINAL time, so a guest that keeps tripping the
 * state-admission drop cannot push its own deadline out indefinitely.
 */
export function armRejoinLatch(playerId: string, nowMs: number): void {
  if (armedAtMsById.has(playerId)) return;
  armedAtMsById.set(playerId, nowMs);
  lastResendAtMsById.delete(playerId);
}

export function noteRejoinLatchResend(playerId: string, nowMs: number): void {
  lastResendAtMsById.set(playerId, nowMs);
}

export function clearRejoinLatch(playerId: string): void {
  armedAtMsById.delete(playerId);
  lastResendAtMsById.delete(playerId);
}

export function clearAllRejoinLatches(): void {
  armedAtMsById.clear();
  lastResendAtMsById.clear();
}

export function rejoinLatchArmedAtMs(playerId: string): number | null {
  return armedAtMsById.get(playerId) ?? null;
}

export function rejoinLatchLastResendAtMs(playerId: string): number | null {
  return lastResendAtMsById.get(playerId) ?? null;
}
