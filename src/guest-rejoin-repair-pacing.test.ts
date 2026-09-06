import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  canSpendReconnectRepairAttempt,
  RECONNECT_REPAIR_ANSWER_WINDOW_MS,
  RECONNECT_REPAIR_MIN_SPACING_MS,
  shouldDeclareResumeTimeout,
  shouldReadmitResumeAuthority,
  type ReconnectRepairPacing,
} from './guest-rejoin-repair-pacing';

/**
 * HF-535, day-mp-repair lane — the guest half of the deterministic rejoin
 * self-kill.
 *
 * MEASURED MECHANISM (artifacts/qa/mp-soak-gate/day-mp-evidence-bundle.json,
 * guestB `225e2719-d4be-4cec-874a-c519ecf03f92`, soak label day-mp, 477c3ab6):
 *
 *   t=171792.1 ms  out join + state + killstreak-loadout-intent   (repair-ready #1)
 *   t=171792.3 ms  out leaderboard-sync                           (startMatch, same task)
 *   t=171792.5 ms  out join + state + killstreak-loadout-intent   (repair-ready #2)
 *   ... 355 ms of host traffic ...
 *   t=172148.0 ms  in  killstreak-state    -> the terminal branch fires
 *   t=172148.4 ms  in  guest-resume-authority  (0.4 ms TOO LATE)
 *   t=172148.6 ms  in  guest-resume-authority
 *   thereafter     out clock-ping only. Zero state, zero ack, zero nack.
 *
 * The two repair-ready sends are 0.4 ms apart with NO inbound message between
 * them: the second is not an answer to anything. Both spend one of the two
 * `MAX_CLIENT_WORLD_REPAIR_ATTEMPTS`, so by the time the host's authority is
 * on the wire the guest has already declared a terminal local timeout on a
 * bare counter, zeroed its own hp, switched off its state pump, and made the
 * host's latch unreleasable. Bundle: guestB hp 0 / alive false from soak
 * second 107 to 179; host `rejoin-latch-awaiting-replacement` +2 at second 107
 * and never again; guestA prunes its guestB replica 12 s later; 91 divergences.
 *
 * The three predicates below are the fences that branch was missing. They are
 * fail-closed by construction: `canSpendReconnectRepairAttempt` only ever
 * REFUSES a send 477c3ab6 would have made, `shouldDeclareResumeTimeout` only
 * ever DELAYS a verdict 477c3ab6 would have reached sooner, and
 * `shouldReadmitResumeAuthority` re-arms a locally-timed-out guest so the
 * host's authority falls THROUGH to the unchanged `admitGuestResumeAuthority`
 * checks — it admits no message those checks would reject.
 */

const pacing = (
  attempts: number,
  lastAttemptAtMs: number | null,
  overrides: Partial<ReconnectRepairPacing> = {},
): ReconnectRepairPacing => ({
  attempts,
  lastAttemptAtMs,
  hostContactAtMs: 171_208,
  awaitingCanonicalGuestAuthority: true,
  maxAttempts: 2,
  ...overrides,
});

const readmission = (overrides: Parameters<typeof shouldReadmitResumeAuthority>[0] | Record<string, unknown> = {}) => ({
  role: 'client',
  gameStarted: true,
  awaitingCanonicalGuestAuthority: false,
  timedOutLocally: true,
  hostDeclaredFailure: false,
  messageConnectionEpoch: 'epoch-2',
  localConnectionEpoch: 'epoch-2',
  ...overrides,
} as Parameters<typeof shouldReadmitResumeAuthority>[0]);

describe('guest reconnect repair pacing — the recorded day-mp burst', () => {
  it('admits the first repair-ready and refuses the 0.4 ms follow-up that spent the cap', () => {
    // startMatch's own repair-ready at 171792.1: nothing has been spent yet.
    expect(canSpendReconnectRepairAttempt(pacing(0, null), 171_792.1)).toBe(true);
    // replayParkedMatchAdmissionMessages -> killstreak-state handler -> a
    // second repair-ready 0.4 ms later. 477c3ab6 spends the last attempt here.
    expect(canSpendReconnectRepairAttempt(pacing(1, 171_792.1), 171_792.5)).toBe(false);
    // Still refused right up to the spacing window, admitted after it.
    expect(canSpendReconnectRepairAttempt(pacing(1, 171_792.1), 171_792.1 + RECONNECT_REPAIR_MIN_SPACING_MS - 1)).toBe(false);
    expect(canSpendReconnectRepairAttempt(pacing(1, 171_792.1), 171_792.1 + RECONNECT_REPAIR_MIN_SPACING_MS)).toBe(true);
  });

  it('does not let the 172148.0 ms killstreak-state declare a terminal timeout', () => {
    // With the burst paced, only one attempt is spent when the inbound
    // killstreak-state arrives — the branch must not fire at all.
    expect(shouldDeclareResumeTimeout(pacing(1, 171_792.1), 172_148.0)).toBe(false);
    // Even if both attempts HAD been spent, the answer window is not up:
    // the host's authority lands 0.4 ms later and must still be admissible.
    expect(shouldDeclareResumeTimeout(pacing(2, 171_792.5), 172_148.0)).toBe(false);
  });

  it('keeps the late host authority admissible after a local timeout', () => {
    expect(shouldReadmitResumeAuthority(readmission())).toBe(true);
  });
});

describe('terminal resume verdict requires all three fences', () => {
  it('refuses until the cap is actually spent', () => {
    expect(shouldDeclareResumeTimeout(pacing(1, 171_792.1), 999_999)).toBe(false);
    expect(shouldDeclareResumeTimeout(pacing(2, 171_792.1), 999_999)).toBe(true);
  });

  it('refuses until the final attempt has had a full answer window', () => {
    expect(shouldDeclareResumeTimeout(pacing(2, 171_792.1), 171_792.5)).toBe(false);
    expect(
      shouldDeclareResumeTimeout(pacing(2, 171_792.1), 171_792.1 + RECONNECT_REPAIR_ANSWER_WINDOW_MS - 1),
    ).toBe(false);
    expect(
      shouldDeclareResumeTimeout(pacing(2, 171_792.1), 171_792.1 + RECONNECT_REPAIR_ANSWER_WINDOW_MS),
    ).toBe(true);
  });

  it('refuses without proof the host was ever in contact', () => {
    // A host that never transacted at all is the arming cap's problem, not a
    // reason to kill this guest — same rule the admission path already carries.
    expect(shouldDeclareResumeTimeout(pacing(2, 171_792.1, { hostContactAtMs: null }), 999_999)).toBe(false);
  });

  it('refuses when no attempt was ever made, and when the guest is not awaiting one', () => {
    expect(shouldDeclareResumeTimeout(pacing(2, null), 999_999)).toBe(false);
    expect(
      shouldDeclareResumeTimeout(pacing(2, 171_792.1, { awaitingCanonicalGuestAuthority: false }), 999_999),
    ).toBe(false);
  });

  it('never admits a spend 477c3ab6 would have refused', () => {
    // Fail-closed property, stated as an assertion: the cap and the awaiting
    // flag are still hard gates; pacing is only ever additional refusal.
    expect(canSpendReconnectRepairAttempt(pacing(2, null), 999_999)).toBe(false);
    expect(canSpendReconnectRepairAttempt(pacing(0, null, { awaitingCanonicalGuestAuthority: false }), 999_999)).toBe(false);
  });
});

describe('late-authority readmission is fenced, and is not a second admission path', () => {
  it('refuses a stale connection epoch', () => {
    expect(shouldReadmitResumeAuthority(readmission({ messageConnectionEpoch: 'epoch-1' }))).toBe(false);
  });

  it('refuses after the host itself declared the resume failed', () => {
    expect(shouldReadmitResumeAuthority(readmission({ hostDeclaredFailure: true }))).toBe(false);
  });

  it('refuses when the guest never timed out, so it cannot widen normal admission', () => {
    expect(shouldReadmitResumeAuthority(readmission({ timedOutLocally: false }))).toBe(false);
  });

  it('refuses when the guest is already awaiting authority, when not a client, or before the match', () => {
    expect(shouldReadmitResumeAuthority(readmission({ awaitingCanonicalGuestAuthority: true }))).toBe(false);
    expect(shouldReadmitResumeAuthority(readmission({ role: 'host' }))).toBe(false);
    expect(shouldReadmitResumeAuthority(readmission({ gameStarted: false }))).toBe(false);
  });
});

describe('src/legacy-main.ts carries the fences (source fence)', () => {
  const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('does not fence the terminal resume verdict on a raw attempt count', () => {
    expect(
      source,
      'The terminal guest-resume timeout must not be reachable from a bare counter: '
        + 'two repair-ready sends 0.4 ms apart spend the whole cap in one task.',
    ).not.toContain(
      'awaitingCanonicalGuestAuthority && clientReconnectWorldRepairAttempts >= MAX_CLIENT_WORLD_REPAIR_ATTEMPTS',
    );
    expect(source).toContain('shouldDeclareResumeTimeout(');
  });

  it('does not let the reconnect arm bypass repair-ready pacing', () => {
    expect(source).not.toContain('&& !reconnectRepair) return;');
    expect(source).toContain('canSpendReconnectRepairAttempt(');
  });

  it('readmits a late host authority instead of discarding it silently', () => {
    expect(source).toContain('shouldReadmitResumeAuthority(');
  });

  it('lets the host resend an authority for the pending-repair half of the latch', () => {
    const send = source.slice(
      source.indexOf('function sendGuestResumeAuthority'),
      source.indexOf('function sendAuthoritativeRemoteSnapshotToPlayer'),
    );
    expect(send.length).toBeGreaterThan(200);
    expect(send).toContain('pendingGuestAuthorityRepairs.has(playerId)');
  });

  it('holds the legacy-main line ceiling', () => {
    expect(source.split('\n').length - 1).toBeLessThanOrEqual(37_396);
  });
});
