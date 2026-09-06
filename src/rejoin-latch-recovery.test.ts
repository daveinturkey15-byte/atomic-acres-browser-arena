import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  armRejoinLatch,
  clearAllRejoinLatches,
  clearRejoinLatch,
  evaluateRejoinLatchRecovery,
  noteRejoinLatchResend,
  rejoinLatchArmedAtMs,
  rejoinLatchLastResendAtMs,
  REJOIN_LATCH_DEADLINE_MS,
  REJOIN_LATCH_RESEND_INTERVAL_MS,
} from './rejoin-latch-recovery';

/**
 * HF-535, day-mp-repair lane — the host half of the rejoin deadlock.
 *
 * The host releases a rejoin latch on exactly one event: a matching
 * `guest-resume-ack`. ef32a3e7 added a retransmit, but hung it off an inbound
 * guest `state` — and a guest sitting in `awaitingCanonicalGuestAuthority`, or
 * one the guest-side bug had already killed, sends no state at all. The
 * recovery was therefore edge-triggered by the exact signal the failure mode
 * switches off. In the day-mp bundle the host's copy of guestB froze at seq
 * 1689 from second 107 to the end of the run while the host kept advertising a
 * two-player roster, because guestB's clock-pings on the reliable event lane
 * kept it inside `network.activePlayerIds(12_000)`.
 *
 * This suite is the mechanism stated twice: once as a source invariant (the
 * recovery must be reachable from the host tick, not only from an inbound
 * guest state), and once as a behaviour driven over a virtual clock against a
 * guest modelled verbatim from the source under test.
 */

const GUEST = '225e2719-d4be-4cec-874a-c519ecf03f92';

describe('rejoin latch recovery — reachability contract', () => {
  const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('drives the recovery from the host tick, not only from an inbound guest state', () => {
    const tick = source.slice(source.indexOf('function updateRemotes('));
    const body = tick.slice(0, tick.indexOf('\n}\n'));
    expect(body.length).toBeGreaterThan(400);
    expect(
      body,
      'updateRemotes must drive the rejoin latch. A recovery reachable only from '
        + 'onNetworkMessage is gated on the guest state a latched guest never sends.',
    ).toMatch(/driveRejoinLatchRecovery|sendGuestResumeAuthority/u);
  });

  it('arms the latch where it closes, so a guest that never sends state is still covered', () => {
    expect(source).toContain('armRejoinLatch(');
    // Both places the latch closes must arm it: the remote rebuilt from a
    // retained authority, and the authenticated replacement reset.
    expect(source.match(/armRejoinLatch\(/gu)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(source).not.toContain('rejoinLatchResendAtMs');
  });

  it('fails closed through the existing guest-resume-failure path, never by clearing and admitting', () => {
    const drive = source.slice(source.indexOf('function driveRejoinLatchRecovery'));
    const body = drive.slice(0, drive.indexOf('\nfunction ', 1));
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain('sendGuestResumeFailure(');
    expect(
      body,
      'The deadline must not clear awaitingReplacementState: that admits the '
        + 'replacement document\'s own pose, which is the laundering the latch exists to stop.',
    ).not.toContain('awaitingReplacementState = false');
  });

  it('lets a late ACK delete its pending repair record instead of orphaning it', () => {
    const accept = source.slice(
      source.indexOf('function acceptGuestResumeAck'),
      source.indexOf('function sendGuestResumeFailure'),
    );
    const lateAck = accept.slice(accept.indexOf('if (!remote || !remote.awaitingReplacementState)'));
    expect(lateAck.slice(0, 200)).toContain('pendingGuestAuthorityRepairs.delete(message.by)');
  });
});

describe('evaluateRejoinLatchRecovery — the policy', () => {
  it('is idle when nothing is latched or nothing is armed', () => {
    const base = { nowMs: 10_000, armedAtMs: 0, lastResendAtMs: null, guestEventLaneActive: true, latched: true };
    expect(evaluateRejoinLatchRecovery({ ...base, latched: false })).toBe('idle');
    expect(evaluateRejoinLatchRecovery({ ...base, armedAtMs: null })).toBe('idle');
  });

  it('leaves a guest whose event lane is gone to the 12 s prune', () => {
    expect(evaluateRejoinLatchRecovery({
      nowMs: 100_000, armedAtMs: 0, lastResendAtMs: null, guestEventLaneActive: false, latched: true,
    })).toBe('idle');
  });

  it('resends immediately, then no faster than the throttle', () => {
    const base = { armedAtMs: 0, guestEventLaneActive: true, latched: true };
    expect(evaluateRejoinLatchRecovery({ ...base, nowMs: 0, lastResendAtMs: null })).toBe('resend');
    expect(evaluateRejoinLatchRecovery({
      ...base, nowMs: REJOIN_LATCH_RESEND_INTERVAL_MS - 1, lastResendAtMs: 0,
    })).toBe('idle');
    expect(evaluateRejoinLatchRecovery({
      ...base, nowMs: REJOIN_LATCH_RESEND_INTERVAL_MS, lastResendAtMs: 0,
    })).toBe('resend');
  });

  it('fails closed at the deadline, and the deadline outlives the whole legitimate resume', () => {
    expect(evaluateRejoinLatchRecovery({
      nowMs: REJOIN_LATCH_DEADLINE_MS, armedAtMs: 0, lastResendAtMs: 0, guestEventLaneActive: true, latched: true,
    })).toBe('fail-closed');
    // A legitimate resume can take two world-revision NACK round trips before
    // the host's own MAX_GUEST_RESUME_RETRIES ceiling fires: 2 x 2.5 s = 5 s.
    // The deadline must sit above that and below a client's 12 s prune, or it
    // re-introduces the HF-347 regression of failing out a slow heavy arena.
    expect(REJOIN_LATCH_DEADLINE_MS).toBeGreaterThan(2 * 2_500);
    expect(REJOIN_LATCH_DEADLINE_MS + REJOIN_LATCH_RESEND_INTERVAL_MS).toBeLessThan(12_000);
  });

  it('caps resend amplification: the deadline bounds how many authorities a rejoin can cost', () => {
    expect(Math.ceil(REJOIN_LATCH_DEADLINE_MS / REJOIN_LATCH_RESEND_INTERVAL_MS)).toBeLessThanOrEqual(10);
  });
});

describe('latch ledger', () => {
  beforeEach(() => clearAllRejoinLatches());

  it('arms once and does not let a repeated arm push the deadline out forever', () => {
    armRejoinLatch(GUEST, 1_000);
    armRejoinLatch(GUEST, 9_000);
    expect(rejoinLatchArmedAtMs(GUEST)).toBe(1_000);
    expect(rejoinLatchLastResendAtMs(GUEST)).toBeNull();
    noteRejoinLatchResend(GUEST, 2_000);
    expect(rejoinLatchLastResendAtMs(GUEST)).toBe(2_000);
    clearRejoinLatch(GUEST);
    expect(rejoinLatchArmedAtMs(GUEST)).toBeNull();
    armRejoinLatch(GUEST, 20_000);
    expect(rejoinLatchArmedAtMs(GUEST)).toBe(20_000);
    clearAllRejoinLatches();
    expect(rejoinLatchArmedAtMs(GUEST)).toBeNull();
  });
});

/**
 * The two documented state machines, driven against each other over a virtual
 * clock. No browser, no network, no timers.
 *
 * Guest, taken verbatim from `src/legacy-main.ts`:
 *   - holds `awaitingCanonicalGuestAuthority`, so its 20 Hz state pump is off
 *     and it emits nothing but a `clock-ping` every 2 s on the event lane,
 *     which keeps it inside `network.activePlayerIds(12_000)`;
 *   - discards the first N authorities silently (any of the six rejection
 *     reasons at `admitGuestResumeAuthority`) - no ACK, no NACK, no telemetry;
 *   - ACKs the first authority it does accept.
 * Host: latch armed, one pending repair record, recovery driven only by
 * `evaluateRejoinLatchRecovery` on the tick; every inbound guest `state` is
 * dropped while latched.
 */
type SimulationOptions = Readonly<{
  /** How many authorities the guest silently discards before accepting one. */
  silentRejections: number;
  /** false models the pending-repair half of the latch (awaitingReplacementState off). */
  awaitingReplacementState?: boolean;
  /** Set false to model 477c3ab6: recovery reachable only from an inbound guest state. */
  tickRecovery?: boolean;
  /** Guest never accepts; used to exercise the deadline. */
  guestNeverAccepts?: boolean;
}>;

type SimulationResult = {
  authoritiesSent: number[];
  resolution: 'ack' | 'fail-closed' | 'still-latched';
  latchedAtEndMs: number | null;
  maxRemoteSnapshotAgeMs: number;
};

function simulateRejoinLatch(options: SimulationOptions): SimulationResult {
  const id = 'sim-guest';
  clearAllRejoinLatches();
  const tickRecovery = options.tickRecovery ?? true;
  const awaitingReplacementState = options.awaitingReplacementState ?? true;
  let pendingRepair = true;
  let latched = true;
  let rejectionsLeft = options.silentRejections;
  let lastAdmittedGuestSampleAtMs = 0;
  const authoritiesSent: number[] = [];
  const result: SimulationResult = {
    authoritiesSent,
    resolution: 'still-latched',
    latchedAtEndMs: null,
    maxRemoteSnapshotAgeMs: 0,
  };

  // `sendGuestResumeAuthority`: refuses unless the remote is awaiting a
  // replacement state OR a pending repair record exists.
  const sendAuthority = (nowMs: number): boolean => {
    if (!(awaitingReplacementState || pendingRepair)) return false;
    authoritiesSent.push(nowMs);
    if (options.guestNeverAccepts) return true;
    if (rejectionsLeft > 0) { rejectionsLeft -= 1; return true; } // silent discard
    // Accepted: the guest ACKs and immediately commits a state.
    latched = false;
    pendingRepair = false;
    clearRejoinLatch(id);
    lastAdmittedGuestSampleAtMs = nowMs;
    result.resolution = 'ack';
    return true;
  };

  // Seed with the real burst: one authority from the host's join handler, then
  // the two the guest's two reliable state commits triggered 4 ms later. At
  // 477c3ab6 these three are the only ones that ever go out.
  armRejoinLatch(id, 0);
  sendAuthority(0);
  if (latched) { armRejoinLatch(id, 4); if (!tickRecovery) sendAuthority(4); else sendAuthority(4); }
  if (latched) sendAuthority(4);

  for (let nowMs = 50; nowMs <= 75_000 && latched; nowMs += 50) {
    // The guest's clock-ping keeps the event lane alive for the whole freeze.
    const guestEventLaneActive = true;
    if (tickRecovery) {
      const action = evaluateRejoinLatchRecovery({
        nowMs,
        armedAtMs: rejoinLatchArmedAtMs(id),
        lastResendAtMs: rejoinLatchLastResendAtMs(id),
        guestEventLaneActive,
        latched,
      });
      if (action === 'resend') {
        noteRejoinLatchResend(id, nowMs);
        sendAuthority(nowMs);
      } else if (action === 'fail-closed') {
        // The EXISTING guest-resume-failure path: visible, bounded, and it does
        // NOT clear awaitingReplacementState.
        clearRejoinLatch(id);
        pendingRepair = false;
        latched = false;
        result.resolution = 'fail-closed';
      }
    }
    result.maxRemoteSnapshotAgeMs = Math.max(result.maxRemoteSnapshotAgeMs, nowMs - lastAdmittedGuestSampleAtMs);
  }
  result.latchedAtEndMs = latched ? 75_000 : null;
  if (!latched && result.resolution === 'still-latched') result.resolution = 'ack';
  return result;
}

describe('rejoin latch recovery — behavioural falsifier over a virtual clock', () => {
  beforeEach(() => clearAllRejoinLatches());

  it('reproduces 477c3ab6: three authorities, latched forever, host record older than a client prune', () => {
    // Positive control. This is the run in the bundle, not an assumption.
    const before = simulateRejoinLatch({ silentRejections: 3, tickRecovery: false });
    expect(before.authoritiesSent).toHaveLength(3);
    expect(before.resolution).toBe('still-latched');
    expect(before.latchedAtEndMs).toBe(75_000);
    expect(before.maxRemoteSnapshotAgeMs).toBeGreaterThan(12_000);
  });

  it('recovers a guest that discarded the whole opening burst', () => {
    const after = simulateRejoinLatch({ silentRejections: 3 });
    expect(after.authoritiesSent.length).toBeGreaterThan(3);
    expect(after.resolution).toMatch(/^(ack|fail-closed)$/u);
    expect(after.latchedAtEndMs ?? 0).toBeLessThanOrEqual(REJOIN_LATCH_DEADLINE_MS + REJOIN_LATCH_RESEND_INTERVAL_MS);
    expect(after.maxRemoteSnapshotAgeMs).toBeLessThan(12_000);
  });

  it('recovers the pending-repair half of the latch, which was unrecoverable by construction', () => {
    const after = simulateRejoinLatch({ silentRejections: 3, awaitingReplacementState: false });
    expect(after.authoritiesSent.length).toBeGreaterThan(3);
    expect(after.resolution).toBe('ack');
    expect(after.maxRemoteSnapshotAgeMs).toBeLessThan(12_000);
  });

  it('fails closed within the deadline when the guest never accepts, well inside a client prune', () => {
    const after = simulateRejoinLatch({ silentRejections: 0, guestNeverAccepts: true });
    expect(after.resolution).toBe('fail-closed');
    expect(after.maxRemoteSnapshotAgeMs).toBeLessThan(12_000);
    expect(after.maxRemoteSnapshotAgeMs).toBeGreaterThanOrEqual(REJOIN_LATCH_DEADLINE_MS - 50);
    expect(after.authoritiesSent.length).toBeLessThanOrEqual(
      3 + Math.ceil(REJOIN_LATCH_DEADLINE_MS / REJOIN_LATCH_RESEND_INTERVAL_MS),
    );
  });
});
