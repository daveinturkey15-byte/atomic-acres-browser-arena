import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_WORLD_REPAIR_ATTEMPTS,
  acknowledgeClientWorldRepairActor,
  beginClientWorldRepair,
  clientWorldRepairCanAttempt,
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

    admission = recordClientWorldRepairAttempt(admission);
    for (const _earlyActiveLobbyRevision of [49, 50, 51, 52]) {
      // Lobby phase is not a receiver-ready input; elapsed time and repeated
      // early active revisions cannot consume the second attempt.
      expect(admission.attempts).toBe(1);
    }
    expect(clientWorldRepairPending(admission)).toBe(true);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch, matchEpoch: 41, exactActorAcknowledged: false,
    })).toBe(true);

    admission = recordClientWorldRepairAttempt(admission);
    expect(admission.attempts).toBe(MAX_CLIENT_WORLD_REPAIR_ATTEMPTS);
    expect(clientWorldRepairCanAttempt(admission)).toBe(false);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch, matchEpoch: 41, exactActorAcknowledged: false,
    })).toBe(false);
    expect(recordClientWorldRepairAttempt(admission)).toBe(admission);

    admission = acknowledgeClientWorldRepairActor(admission, { actorId: 'guest-1', lifeId: 2 })!;
    expect(clientWorldRepairPending(admission)).toBe(false);
  });

  it('starts a same-connection rematch with a fresh match and actor identity', () => {
    const connectionEpoch = 'connection_epoch_002';
    const firstRound = acknowledgeClientWorldRepairActor(
      recordClientWorldRepairAttempt(beginClientWorldRepair({
        playerId: 'guest-1', connectionEpoch, matchEpoch: 41, lifeId: 2,
      })),
      { actorId: 'guest-1', lifeId: 2 },
    );
    expect(clientWorldRepairPending(firstRound)).toBe(false);

    const rematch = beginClientWorldRepair({
      playerId: 'guest-1', connectionEpoch, matchEpoch: 42, lifeId: 3,
    });
    expect(rematch.attempts).toBe(0);
    expect(rematch.acknowledged).toBe(false);
    expect(rematch.identity).toEqual({
      playerId: 'guest-1', connectionEpoch, matchEpoch: 42, lifeId: 3,
    });
  });

  it('does not resend or acknowledge across an epoch, connection, actor, or life boundary', () => {
    const admission = recordClientWorldRepairAttempt(beginClientWorldRepair({
      playerId: 'guest-1', connectionEpoch: 'connection_epoch_002', matchEpoch: 42, lifeId: 3,
    }));
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch: 'connection_epoch_003', matchEpoch: 42, exactActorAcknowledged: false,
    })).toBe(false);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch: 'connection_epoch_002', matchEpoch: 41, exactActorAcknowledged: false,
    })).toBe(false);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch: 'connection_epoch_002', matchEpoch: 42, exactActorAcknowledged: true,
    })).toBe(false);
    expect(clientWorldRepairReceiverReady(admission, {
      connectionEpoch: 'connection_epoch_002', matchEpoch: 42, exactActorAcknowledged: false,
    })).toBe(true);
    expect(acknowledgeClientWorldRepairActor(admission, { actorId: 'other', lifeId: 3 })).toBe(admission);
    expect(acknowledgeClientWorldRepairActor(admission, { actorId: 'guest-1', lifeId: 4 })).toBe(admission);
    expect(clientWorldRepairPending(
      acknowledgeClientWorldRepairActor(admission, { actorId: 'guest-1', lifeId: 4 }),
    )).toBe(true);
  });
});
