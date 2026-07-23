import { describe, expect, it } from 'vitest';
import type { DataConnection } from 'peerjs';
import { guestMessageEndsSession, isCurrentGuestEventConnection, joinTimeoutAction, replaceGuestPeerOwner, stateTrafficUsesFallback } from './network';

describe('guest event connection lifecycle', () => {
  it('does not let a stale same-peer close callback evict the replacement session', () => {
    const oldConnection = { peer: 'stable-peer' } as DataConnection;
    const replacement = { peer: 'stable-peer' } as DataConnection;
    expect(isCurrentGuestEventConnection(replacement, oldConnection)).toBe(false);
    expect(isCurrentGuestEventConnection(replacement, replacement)).toBe(true);
  });

  it('fails an initial bad room cleanly while retaining bounded retry for a dropped session', () => {
    expect(joinTimeoutAction(false)).toBe('offline');
    expect(joinTimeoutAction(true)).toBe('retry');
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
