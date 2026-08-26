import { describe, expect, it } from 'vitest';
import {
  CLIENT_WORLD_REPAIR_ARMING_CAP_MS,
  CLIENT_WORLD_REPAIR_DEADLINE_CHECK_INTERVAL_MS,
  CLIENT_WORLD_REPAIR_HANDSHAKE_TIMEOUT_MS,
  MAX_CLIENT_WORLD_REPAIR_ATTEMPTS,
  MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS,
  evaluateClientWorldRepairDeadline,
  acknowledgeClientWorldRepairActor,
  beginClientWorldRepair,
  clientWorldRepairCanAttempt,
  clientWorldRepairExhausted,
  clientWorldRepairPending,
  clientWorldRepairReceiverReady,
  recordClientWorldRepairAttempt,
} from './client-world-repair-admission';

describe('client world-repair admission', () => {
  it('holds a 3.8s guest-first initial admission at one attempt through early active lobby revisions', () => {
    const connectionEpoch = 'connection_epoch_002';
    let admission = beginClientWorldRepair({
      playerId: 'guest-1', connectionEpoch, matchEpoch: 41, lifeId: 2,
    });
    const guestActiveAtMs = 36_160;
    const hostReceiverReadyAtMs = 39_917;
    expect(hostReceiverReadyAtMs - guestActiveAtMs).toBe(3_757);

    admission = recordClientWorldRepairAttempt(admission, guestActiveAtMs);
    for (const _earlyActiveLobbyRevision of [49, 50, 51, 52]) {
      // Lobby phase is not a receiver-ready input; elapsed time and repeated
      // early active revisions cannot consume the second attempt.
      expect(admission.attempts).toBe(1);
    }
    expect(clientWorldRepairPending(admission)).toBe(true);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch, matchEpoch: 41, exactActorAcknowledged: false,
    }, hostReceiverReadyAtMs)).toBe(true);

    admission = recordClientWorldRepairAttempt(admission, hostReceiverReadyAtMs);
    expect(admission.attempts).toBe(MAX_CLIENT_WORLD_REPAIR_ATTEMPTS);
    expect(clientWorldRepairCanAttempt(admission, hostReceiverReadyAtMs + 10_000)).toBe(false);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch, matchEpoch: 41, exactActorAcknowledged: false,
    }, hostReceiverReadyAtMs + 10_000)).toBe(false);
    expect(recordClientWorldRepairAttempt(admission, hostReceiverReadyAtMs + 10_000)).toBe(admission);

    admission = acknowledgeClientWorldRepairActor(admission, { actorId: 'guest-1', lifeId: 2 })!;
    expect(clientWorldRepairPending(admission)).toBe(false);
  });

  it('refuses to burn the attempt cap on a burst of stale snapshots (HF-347 spawn soft-lock)', () => {
    // The reproduced fault: around match start the host emits several
    // force-reliable killstreak snapshots within milliseconds, each carrying
    // the guest's actor at a stale lifeId. Attempts used to be spent one per
    // stale snapshot, so the whole cap was gone before the first repair-ready
    // had round-tripped and the guest spawned permanently dead.
    const connectionEpoch = 'connection_epoch_004';
    const receiver = { connectionEpoch, matchEpoch: 7, exactActorAcknowledged: false };
    let admission = beginClientWorldRepair({
      playerId: 'guest-1', connectionEpoch, matchEpoch: 7, lifeId: 5,
    });

    // t=0: first stale snapshot arrives; the first attempt goes out.
    expect(clientWorldRepairReceiverReady(admission, receiver, 0)).toBe(true);
    admission = recordClientWorldRepairAttempt(admission, 0);

    // t=15/40/230ms: the burst. None of these may trigger or record attempts,
    // and none may declare exhaustion.
    for (const burstMs of [15, 40, 230]) {
      expect(clientWorldRepairCanAttempt(admission, burstMs)).toBe(false);
      expect(clientWorldRepairReceiverReady(admission, receiver, burstMs)).toBe(false);
      expect(clientWorldRepairExhausted(admission, burstMs)).toBe(false);
    }
    expect(admission.attempts).toBe(1);

    // After the spacing window the second (final) attempt is allowed.
    const secondAt = MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS;
    expect(clientWorldRepairCanAttempt(admission, secondAt)).toBe(true);
    admission = recordClientWorldRepairAttempt(admission, secondAt);
    expect(admission.attempts).toBe(MAX_CLIENT_WORLD_REPAIR_ATTEMPTS);

    // Cap reached, but exhaustion may not be declared until the final attempt
    // has had its own full window to be answered.
    expect(clientWorldRepairExhausted(admission, secondAt + 100)).toBe(false);
    expect(clientWorldRepairExhausted(admission, secondAt + MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS)).toBe(true);

    // An ack at any point ends the story - never exhausted once acknowledged.
    const acked = acknowledgeClientWorldRepairActor(admission, { actorId: 'guest-1', lifeId: 5 })!;
    expect(clientWorldRepairExhausted(acked, secondAt + 60_000)).toBe(false);
  });

  it('starts a same-connection rematch with a fresh match and actor identity', () => {
    const connectionEpoch = 'connection_epoch_002';
    const firstRound = acknowledgeClientWorldRepairActor(
      recordClientWorldRepairAttempt(beginClientWorldRepair({
        playerId: 'guest-1', connectionEpoch, matchEpoch: 41, lifeId: 2,
      }), 1_000),
      { actorId: 'guest-1', lifeId: 2 },
    );
    expect(clientWorldRepairPending(firstRound)).toBe(false);

    const rematch = beginClientWorldRepair({
      playerId: 'guest-1', connectionEpoch, matchEpoch: 42, lifeId: 3,
    });
    expect(rematch.attempts).toBe(0);
    expect(rematch.acknowledged).toBe(false);
    expect(rematch.lastAttemptAtMs).toBeNull();
    expect(rematch.identity).toEqual({
      playerId: 'guest-1', connectionEpoch, matchEpoch: 42, lifeId: 3,
    });
  });

  it('does not resend or acknowledge across an epoch, connection, actor, or life boundary', () => {
    const attemptAt = 5_000;
    const wellAfter = attemptAt + MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS;
    const admission = recordClientWorldRepairAttempt(beginClientWorldRepair({
      playerId: 'guest-1', connectionEpoch: 'connection_epoch_002', matchEpoch: 42, lifeId: 3,
    }), attemptAt);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch: 'connection_epoch_003', matchEpoch: 42, exactActorAcknowledged: false,
    }, wellAfter)).toBe(false);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch: 'connection_epoch_002', matchEpoch: 41, exactActorAcknowledged: false,
    }, wellAfter)).toBe(false);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch: 'connection_epoch_002', matchEpoch: 42, exactActorAcknowledged: true,
    }, wellAfter)).toBe(false);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch: 'connection_epoch_002', matchEpoch: 42, exactActorAcknowledged: false,
    }, wellAfter)).toBe(true);
    expect(acknowledgeClientWorldRepairActor(admission, { actorId: 'other', lifeId: 3 })).toBe(admission);
    expect(acknowledgeClientWorldRepairActor(admission, { actorId: 'guest-1', lifeId: 4 })).toBe(admission);
    expect(clientWorldRepairPending(
      acknowledgeClientWorldRepairActor(admission, { actorId: 'guest-1', lifeId: 4 }),
    )).toBe(true);
  });
});

describe('client world-repair deadline (HF-347 residual: load must not consume the handshake clock)', () => {
  const armed = (lifeId = 2) => beginClientWorldRepair({
    playerId: 'guest-1', connectionEpoch: 'connection_epoch_003', matchEpoch: 7, lifeId,
  });

  it('waits through an arena load longer than the old 5s deadline (the owner reproduction)', () => {
    // Lobby-start at t=0; the guest is still loading/priming at t=5s..t=20s.
    const admission = armed();
    for (const nowMs of [5_000, 9_999, 20_000]) {
      expect(evaluateClientWorldRepairDeadline({
        nowMs, armedAtMs: 0, pumpEligibleSinceMs: null, hostContactAtMs: null, admission,
      })).toBe('wait');
    }
  });

  it('starts the 5s handshake clock only once the pump is eligible', () => {
    const admission = armed();
    // Pump became eligible at t=12s after a heavy load.
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 16_999, armedAtMs: 0, pumpEligibleSinceMs: 12_000, hostContactAtMs: 12_000, admission,
    })).toBe('wait');
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 17_000, armedAtMs: 0, pumpEligibleSinceMs: 12_000, hostContactAtMs: 12_000, admission,
    })).toBe('failed');
  });

  it('measures inactivity from the LAST attempt, so a host that answered once cannot stall forever', () => {
    let admission = armed();
    admission = recordClientWorldRepairAttempt(admission, 14_500);
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 19_499, armedAtMs: 0, pumpEligibleSinceMs: 12_000, hostContactAtMs: 12_000, admission,
    })).toBe('wait');
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 19_500, armedAtMs: 0, pumpEligibleSinceMs: 12_000, hostContactAtMs: 12_000, admission,
    })).toBe('failed');
  });

  it('holds an absolute cap for a live-but-silent host even while loading claims to continue', () => {
    const admission = armed();
    expect(evaluateClientWorldRepairDeadline({
      nowMs: CLIENT_WORLD_REPAIR_ARMING_CAP_MS - 1, armedAtMs: 0, pumpEligibleSinceMs: null, hostContactAtMs: null, admission,
    })).toBe('wait');
    expect(evaluateClientWorldRepairDeadline({
      nowMs: CLIENT_WORLD_REPAIR_ARMING_CAP_MS, armedAtMs: 0, pumpEligibleSinceMs: null, hostContactAtMs: null, admission,
    })).toBe('failed');
  });

  it('never fails an acknowledged or absent admission', () => {
    const acknowledged = acknowledgeClientWorldRepairActor(armed(), { actorId: 'guest-1', lifeId: 2 });
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 500_000, armedAtMs: 0, pumpEligibleSinceMs: 1, hostContactAtMs: 1, admission: acknowledged,
    })).toBe('wait');
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 500_000, armedAtMs: 0, pumpEligibleSinceMs: 1, hostContactAtMs: 1, admission: null,
    })).toBe('wait');
  });

  it('does not run the 5s clock before the host has been heard from at all', () => {
    // Lane J: both peers start their arena load from the same START. Until the
    // host transacts, silence means "still loading", which is indistinguishable
    // from "gone" except by the arming cap — so only the cap may fail it here.
    // Reproduced pre-fix: the guest was killed at spawn in 3 of 4 idle matches
    // with the host's acknowledgement arriving moments afterwards.
    const admission = armed();
    for (const nowMs of [6_000, 20_000, CLIENT_WORLD_REPAIR_ARMING_CAP_MS - 1]) {
      expect(evaluateClientWorldRepairDeadline({
        nowMs, armedAtMs: 0, pumpEligibleSinceMs: 1_000, hostContactAtMs: null, admission,
      })).toBe('wait');
    }
    expect(evaluateClientWorldRepairDeadline({
      nowMs: CLIENT_WORLD_REPAIR_ARMING_CAP_MS, armedAtMs: 0, pumpEligibleSinceMs: 1_000,
      hostContactAtMs: null, admission,
    })).toBe('failed');
  });

  it('fails 5s after a host that DID answer once goes silent', () => {
    // The precondition the bound was always documented against: first contact
    // at 30s, then nothing. Failure at exactly 35s, well inside the cap.
    const admission = armed();
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 34_999, armedAtMs: 0, pumpEligibleSinceMs: 1_000, hostContactAtMs: 30_000, admission,
    })).toBe('wait');
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 35_000, armedAtMs: 0, pumpEligibleSinceMs: 1_000, hostContactAtMs: 30_000, admission,
    })).toBe('failed');
  });

  it('keeps first contact as progress even when it lands after the last attempt', () => {
    let admission = armed();
    admission = recordClientWorldRepairAttempt(admission, 2_000);
    // Attempts are spent early; contact at 25s must reset the inactivity clock.
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 29_999, armedAtMs: 0, pumpEligibleSinceMs: 1_000, hostContactAtMs: 25_000, admission,
    })).toBe('wait');
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 30_000, armedAtMs: 0, pumpEligibleSinceMs: 1_000, hostContactAtMs: 25_000, admission,
    })).toBe('failed');
  });
  it('Lane J residual: a timer-spent retry converts late-ack survival; a frozen attempt count does not', () => {
    // Exact forensic timeline from this machine (Pass 79): match armed near
    // t=0, first attempt at the startGame tail, pump eligible ~15s, first
    // host contact 19059 ms, admission failure 24614 ms with attempts frozen
    // at 1 of 2. The wiring fix spends the held retry from the deadline
    // timer through clientWorldRepairReceiverReady; this pins the pure
    // interplay that makes that spend load-bearing.
    const contactAtMs = 19_059;
    let admission = recordClientWorldRepairAttempt(armed(), 15_000);

    // Counterfactual (the shipped fault): no second attempt is ever spent,
    // so last progress stays at first contact and the deadline kills the
    // guest ~5s later - one spawn death plus the accusing status line.
    expect(clientWorldRepairCanAttempt(admission, contactAtMs)).toBe(true);
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 24_614, armedAtMs: 0, pumpEligibleSinceMs: 15_000,
      hostContactAtMs: contactAtMs, admission,
    })).toBe('failed');

    // With the timer-driven retry: the same receiver-ready gate the snapshot
    // path uses admits the spend (cap 2 not reached, >=1s spacing), the new
    // attempt becomes handshake progress, and the acknowledgement that lands
    // moments after contact finds the admission alive to acknowledge.
    const retriedAtMs = 19_559; // first 500ms cadence tick after contact with spacing satisfied
    expect(admission.identity.matchEpoch).toBe(7);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch: 'connection_epoch_003',
      matchEpoch: admission.identity.matchEpoch,
      exactActorAcknowledged: false,
    }, retriedAtMs)).toBe(true);
    admission = recordClientWorldRepairAttempt(admission, retriedAtMs);
    expect(admission.attempts).toBe(MAX_CLIENT_WORLD_REPAIR_ATTEMPTS);
    expect(evaluateClientWorldRepairDeadline({
      nowMs: 24_100, armedAtMs: 0, pumpEligibleSinceMs: 15_000,
      hostContactAtMs: contactAtMs, admission,
    })).toBe('wait');
    // The cap is now spent: no third send is admissible, ever.
    expect(clientWorldRepairCanAttempt(admission, retriedAtMs + MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS * 10))
      .toBe(false);
    // And the ack that motivated the fix closes the handshake cleanly.
    expect(acknowledgeClientWorldRepairActor(admission, { actorId: 'guest-1', lifeId: 2 }))
      .toMatchObject({ acknowledged: true });
  });


  it('keeps the handshake bound exactly at the historical 5s once eligible', () => {
    expect(CLIENT_WORLD_REPAIR_HANDSHAKE_TIMEOUT_MS).toBe(5_000);
    expect(CLIENT_WORLD_REPAIR_ARMING_CAP_MS).toBeGreaterThan(CLIENT_WORLD_REPAIR_HANDSHAKE_TIMEOUT_MS);
    expect(CLIENT_WORLD_REPAIR_DEADLINE_CHECK_INTERVAL_MS).toBeLessThan(CLIENT_WORLD_REPAIR_HANDSHAKE_TIMEOUT_MS);
  });
});
