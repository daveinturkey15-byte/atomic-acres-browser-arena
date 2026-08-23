import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_WORLD_REPAIR_ATTEMPTS,
  MIN_CLIENT_WORLD_REPAIR_ATTEMPT_SPACING_MS,
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
