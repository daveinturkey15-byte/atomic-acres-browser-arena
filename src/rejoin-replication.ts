import type { JoinMessage, PlayerSnapshot, StateMessage } from './protocol';

export type RejoinReplicationRecipient = Readonly<{
  playerId: string;
  messages: readonly [JoinMessage, StateMessage];
}>;

export type RejoinReplicationPlan = Readonly<{
  rejoiner: RejoinReplicationRecipient;
  observers: readonly RejoinReplicationRecipient[];
  creditSession: Readonly<{
    playerId: string;
    connectionEpoch: string;
    key: string;
  }>;
}>;

export type RejoinReplicationInput = Readonly<{
  rejoinerId: string;
  connectionEpoch: string;
  snapshot: PlayerSnapshot;
  continuity: number;
  hostTimeMs: number;
  rateHz: StateMessage['rateHz'];
  observerIds: readonly string[];
}>;

/**
 * A player id survives a transport replacement. Combat credit must therefore
 * include the authenticated peer epoch or a late message from the retired
 * document can be attributed to the replacement session.
 */
export function sessionBoundCreditKey(playerId: string, connectionEpoch: string): string {
  return `${playerId}:${connectionEpoch}`;
}

function messagesFor(
  snapshot: PlayerSnapshot,
  continuity: number,
  hostTimeMs: number,
  rateHz: StateMessage['rateHz'],
): readonly [JoinMessage, StateMessage] {
  return [
    { type: 'join', player: snapshot },
    { type: 'state', player: snapshot, hostTimeMs, continuity, rateHz },
  ];
}

/**
 * Build the host's replacement transaction once, then deliver the same fresh
 * replication slot to the rejoiner and every currently admitted observer.
 */
export function buildRejoinReplicationPlan(input: RejoinReplicationInput): RejoinReplicationPlan {
  const rejoinerMessages = messagesFor(input.snapshot, input.continuity, input.hostTimeMs, input.rateHz);
  const recipient = (playerId: string): RejoinReplicationRecipient => ({
    playerId,
    messages: messagesFor(input.snapshot, input.continuity, input.hostTimeMs, input.rateHz),
  });
  return {
    rejoiner: { playerId: input.rejoinerId, messages: rejoinerMessages },
    observers: input.observerIds
      .filter((playerId) => playerId !== input.rejoinerId)
      .map(recipient),
    creditSession: {
      playerId: input.rejoinerId,
      connectionEpoch: input.connectionEpoch,
      key: sessionBoundCreditKey(input.rejoinerId, input.connectionEpoch),
    },
  };
}
