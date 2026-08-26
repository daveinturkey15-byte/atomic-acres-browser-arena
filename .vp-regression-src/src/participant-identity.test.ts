import { describe, expect, it } from 'vitest';
import { isReservedMultiplayerParticipantId } from './participant-identity';

describe('multiplayer participant identity namespaces', () => {
  it.each([
    'map:carpet-bomber',
    'map:future-hazard',
    'host-bot-0',
    'host-bot-future',
  ])('reserves protocol-owned identity %s', (playerId) => {
    expect(isReservedMultiplayerParticipantId(playerId)).toBe(true);
  });

  it.each([
    '35bff532-7307-41ca-a869-4fc8482c73c4',
    'player-1',
    'host-bot',
    'map',
  ])('retains ordinary participant identity %s', (playerId) => {
    expect(isReservedMultiplayerParticipantId(playerId)).toBe(false);
  });
});
