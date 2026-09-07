/**
 * HF-535 — pacing and readmission fences for a guest's mid-match rejoin.
 *
 * Pure policy, no THREE and no DOM, so `src/legacy-main.ts` stays at its
 * 37,396-line ceiling and these three decisions are reachable from a unit test.
 *
 * WHY THIS EXISTS, measured rather than assumed. In the day-mp soak at
 * 477c3ab6 (artifacts/qa/mp-soak-gate/day-mp-evidence-bundle.json, guestB
 * `225e2719-…`) the rejoining guest killed itself:
 *
 *   1. `sendClientWorldRepairReady` ran twice 0.4 ms apart — once from
 *      `startMatch`'s own client repair-ready, once from the parked
 *      `killstreak-state` that `replayParkedMatchAdmissionMessages` drained
 *      later in the SAME synchronous task. There is no inbound message between
 *      the two bursts in the trace: the second is not an answer to anything.
 *   2. The reconnect arm of that function had no spacing at all (its whole
 *      ledger was the counter `clientReconnectWorldRepairAttempts`), so both
 *      of `MAX_CLIENT_WORLD_REPAIR_ATTEMPTS` were spent inside one millisecond,
 *      355 ms before the host's first `guest-resume-authority` was even on the
 *      wire.
 *   3. The next inbound `killstreak-state` hit a terminal branch fenced on the
 *      raw count alone — no answer window, no host-contact fence — and ran
 *      `handleGuestResumeTimeout()`: hp 0, alive false, nothing sent. The
 *      host's authority arrived 0.4 ms later and was discarded silently
 *      because the guest was no longer awaiting one.
 *   4. With `player.alive === false` the guest's state pump is off, so the
 *      host's rejoin latch — released only by an ACK, re-driven only by an
 *      inbound guest state — could never open, and guestA pruned its guestB
 *      replica 12 s later. 91 divergences, 5/8 rows.
 *
 * The sibling admission branch already carried exactly these fences, for
 * exactly this reason (see `clientWorldRepairExhausted` in
 * `client-world-repair-admission.ts`: "a burst of stale start-of-match
 * snapshots kill the guest at spawn", HF-347/HF-322). This module gives the
 * resume path the same protection.
 *
 * FAIL-CLOSED. Every predicate here narrows behaviour or delays a verdict:
 *   - `canSpendReconnectRepairAttempt` only ever REFUSES a send 477c3ab6 would
 *     have made. It never admits a new one.
 *   - `shouldDeclareResumeTimeout` only ever DELAYS a terminal verdict
 *     477c3ab6 would have reached sooner. The hp-0 posture it guards is
 *     unchanged, and `CLIENT_WORLD_REPAIR_ARMING_CAP_MS` (60 s) is still the
 *     absolute backstop.
 *   - `shouldReadmitResumeAuthority` re-arms a guest that timed out LOCALLY so
 *     the host's own authority falls THROUGH to the unchanged
 *     `admitGuestResumeAuthority` checks (host id, recipient, connection
 *     epoch, match epoch, replay, inventory). It is not a bypass, and a
 *     host-declared `guest-resume-failure` stays final.
 */

/**
 * Minimum spacing between two reconnect repair-ready sends.
 *
 * A repair-ready is a REQUEST to the host; retrying it is only meaningful once
 * the previous request has had time to be answered. 1 s matches
 * `MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS`, the equivalent fence the
 * admission arm has carried since HF-347, so both arms of the same function
 * now pace identically.
 */
export const RECONNECT_REPAIR_MIN_SPACING_MS = 1_000;

/**
 * How long the FINAL attempt gets to be answered before a terminal local
 * verdict may be declared.
 *
 * 2.5 s is the guest's own `scheduleGuestResumeWorldTimeout` window, i.e. the
 * longest the guest is already willing to wait on one leg of this handshake.
 * In the recorded run the host's authority landed 355 ms after the last
 * repair-ready, so anything at or above ~0.4 s would have saved the guest;
 * 2.5 s is chosen because it is a number this handshake already uses rather
 * than one invented for this fix.
 */
export const RECONNECT_REPAIR_ANSWER_WINDOW_MS = 2_500;

export type ReconnectRepairPacing = Readonly<{
  /** `clientReconnectWorldRepairAttempts` — repair-ready sends spent so far. */
  attempts: number;
  /** Monotonic time of the last spend, or null if none has been spent. */
  lastAttemptAtMs: number | null;
  /** `hostMatchContactAtMs` — first host traffic in this match, or null. */
  hostContactAtMs: number | null;
  /** Whether the guest is still waiting for a canonical resume authority. */
  awaitingCanonicalGuestAuthority: boolean;
  /** `MAX_CLIENT_WORLD_REPAIR_ATTEMPTS`, passed in so the cap stays one number. */
  maxAttempts: number;
}>;

/**
 * May the guest spend a reconnect repair-ready attempt right now?
 *
 * Refuses when the cap is spent, when the guest is not awaiting an authority,
 * or when the previous attempt has not yet had its spacing window. This is the
 * fence that stops two sends 0.4 ms apart from burning the whole cap.
 */
export function canSpendReconnectRepairAttempt(
  pacing: ReconnectRepairPacing,
  nowMs: number,
): boolean {
  if (!pacing.awaitingCanonicalGuestAuthority) return false;
  if (!Number.isFinite(nowMs)) return false;
  if (!(pacing.attempts < pacing.maxAttempts)) return false;
  if (pacing.lastAttemptAtMs === null) return true;
  return nowMs - pacing.lastAttemptAtMs >= RECONNECT_REPAIR_MIN_SPACING_MS;
}

/**
 * May the guest declare its resume terminally timed out?
 *
 * Three fences, all required:
 *   - the attempt cap is genuinely spent (not "reached in the same tick it was
 *     armed"),
 *   - the last attempt has had a full answer window, so an authority already
 *     in flight still counts, and
 *   - the host has been in contact at all this match. Pre-contact silence is a
 *     host that is still loading, and is already bounded by
 *     `CLIENT_WORLD_REPAIR_ARMING_CAP_MS`; it is not this guest's fault.
 */
export function shouldDeclareResumeTimeout(
  pacing: ReconnectRepairPacing,
  nowMs: number,
): boolean {
  if (!pacing.awaitingCanonicalGuestAuthority) return false;
  if (!Number.isFinite(nowMs)) return false;
  if (!(pacing.attempts >= pacing.maxAttempts)) return false;
  if (pacing.hostContactAtMs === null) return false;
  if (pacing.lastAttemptAtMs === null) return false;
  return nowMs - pacing.lastAttemptAtMs >= RECONNECT_REPAIR_ANSWER_WINDOW_MS;
}

export type ResumeAuthorityReadmission = Readonly<{
  role: string;
  gameStarted: boolean;
  awaitingCanonicalGuestAuthority: boolean;
  /** Set by `handleGuestResumeTimeout`; cleared by any lobby/match reset. */
  timedOutLocally: boolean;
  /** Set by `acceptGuestResumeFailure`. The host's verdict is final. */
  hostDeclaredFailure: boolean;
  messageConnectionEpoch: string;
  localConnectionEpoch: string;
}>;

/**
 * Should a `guest-resume-authority` that arrived after a LOCAL timeout re-arm
 * the guest?
 *
 * Returning true re-arms `awaitingCanonicalGuestAuthority` and then falls
 * through to the ordinary `admitGuestResumeAuthority` admission — it grants
 * nothing on its own. The connection-epoch equality is what makes this safe:
 * an authority for a retired connection, or one that arrives after the host
 * declared the resume failed, is still refused.
 */
export function shouldReadmitResumeAuthority(input: ResumeAuthorityReadmission): boolean {
  if (input.role !== 'client' || !input.gameStarted) return false;
  if (input.awaitingCanonicalGuestAuthority) return false;
  if (!input.timedOutLocally || input.hostDeclaredFailure) return false;
  if (input.localConnectionEpoch.length === 0) return false;
  return input.messageConnectionEpoch === input.localConnectionEpoch;
}
