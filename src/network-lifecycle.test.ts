import { describe, expect, it } from 'vitest';
import type { DataConnection } from 'peerjs';
import {
  activeGuestCanBeReplaced,
  guestMessageEndsSession,
  initialLobbyJoinHasProtocolMismatch,
  isCurrentClientConnection,
  isCurrentGuestEventConnection,
  joinTimeoutAction,
  replaceGuestPeerOwner,
  stateTrafficUsesFallback,
} from './network';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';

describe('guest event connection lifecycle', () => {
  it('does not let a stale same-peer close callback evict the replacement session', () => {
    const oldConnection = { peer: 'stable-peer' } as DataConnection;
    const replacement = { peer: 'stable-peer' } as DataConnection;
    expect(isCurrentGuestEventConnection(replacement, oldConnection)).toBe(false);
    expect(isCurrentGuestEventConnection(replacement, replacement)).toBe(true);
  });

  it('does not let a stale client channel callback tear down a newer join transport', () => {
    const oldConnection = { peer: 'host-peer' } as DataConnection;
    const replacement = { peer: 'host-peer' } as DataConnection;
    expect(isCurrentClientConnection(replacement, oldConnection)).toBe(false);
    expect(isCurrentClientConnection(replacement, replacement)).toBe(true);
  });

  it('atomically replaces an abandoned open channel only with the same rejoin credential', () => {
    const token = '12345678-1234-1234-1234-123456789abc';
    expect(activeGuestCanBeReplaced(true, token, token)).toBe(true);
    expect(activeGuestCanBeReplaced(true, token, '87654321-4321-4321-4321-cba987654321')).toBe(false);
    expect(activeGuestCanBeReplaced(false, token, token)).toBe(false);
  });

  it('fails an initial bad room cleanly while retaining bounded retry for a dropped session', () => {
    expect(joinTimeoutAction(false)).toBe('offline');
    expect(joinTimeoutAction(true)).toBe('retry');
  });

  it('rejects a pre-v5 initial lobby handshake as a protocol mismatch', () => {
    const join = {
      type: 'lobby-join',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      playerId: 'player-1',
      connectionEpoch: 'connection_epoch_player_1',
      name: 'Player 1',
      requestedTeam: 0,
      resumeToken: '12345678-1234-1234-1234-123456789abc',
      nonce: 1,
    };
    expect(initialLobbyJoinHasProtocolMismatch(join)).toBe(false);
    expect(initialLobbyJoinHasProtocolMismatch({ ...join, protocolVersion: 4 })).toBe(true);
    expect(initialLobbyJoinHasProtocolMismatch({ type: 'chat-submit', protocolVersion: 4 })).toBe(false);
  });

  it('keeps movement flowing over the reliable event lane when the transient lane degrades', () => {
    expect(stateTrafficUsesFallback(false, true)).toBe(true);
    expect(stateTrafficUsesFallback(true, true)).toBe(false);
    expect(stateTrafficUsesFallback(false, false)).toBe(false);
  });

  it('removes the previous peer owner when a player reconnects with a new peer ID', () => {
    const owners = new Map([['peer-old', 'player-1'], ['peer-other', 'player-2']]);
    replaceGuestPeerOwner(owners, 'player-1', 'peer-old', 'peer-new');
    expect([...owners.entries()].sort()).toEqual([
      ['peer-new', 'player-1'],
      ['peer-other', 'player-2'],
    ]);
  });

  it('keeps the owner binding when a player reconnects with the same peer ID', () => {
    const owners = new Map([['peer-stable', 'player-1']]);
    replaceGuestPeerOwner(owners, 'player-1', 'peer-stable', 'peer-stable');
    expect([...owners.entries()]).toEqual([['peer-stable', 'player-1']]);
  });

  it('terminates a bound guest session when that guest emits leave', () => {
    expect(guestMessageEndsSession({ type: 'leave', playerId: 'player-1', voluntary: true })).toBe(true);
    expect(guestMessageEndsSession({
      type: 'ping', by: 'player-1', team: 0, kind: 'enemy', position: [0, 0, 0], nonce: 1,
    })).toBe(false);
  });
});
