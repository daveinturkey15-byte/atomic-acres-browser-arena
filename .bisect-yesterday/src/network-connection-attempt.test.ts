import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Peer } from 'peerjs';
import {
  ArenaNetwork,
  type ArenaPeerFactory,
  hostConnectionAttemptKey,
  hostRoomReclaimAction,
  joinConnectionAttemptKey,
} from './network';

type PeerHandler = (...args: unknown[]) => void;

class FakePeer {
  destroyed = false;
  destroyCalls = 0;
  reconnectCalls = 0;
  private readonly handlers = new Map<string, PeerHandler[]>();

  on(event: string, handler: PeerHandler): this {
    this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }

  destroy(): void {
    this.destroyCalls += 1;
    this.destroyed = true;
  }

  reconnect(): void {
    this.reconnectCalls += 1;
  }
}

function fakePeerFactory(): Readonly<{
  peers: FakePeer[];
  preferredIds: Array<string | undefined>;
  factory: ArenaPeerFactory;
}> {
  const peers: FakePeer[] = [];
  const preferredIds: Array<string | undefined> = [];
  return {
    peers,
    preferredIds,
    factory: (preferredId?: string) => {
      const peer = new FakePeer();
      peers.push(peer);
      preferredIds.push(preferredId);
      return peer as unknown as Peer;
    },
  };
}

function installTimerWindow(): void {
  vi.stubGlobal('window', {
    location: { search: '', hostname: 'localhost' },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function peerError(type: string, message: string): Error & { type: string } {
  return Object.assign(new Error(message), { type });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ArenaNetwork exactly-once connection attempts', () => {
  it('does not destroy, restart, or allocate for duplicate host calls with the same normalized intent', () => {
    const harness = fakePeerFactory();
    const firstReady = vi.fn();
    const duplicateReady = vi.fn();
    const network = new ArenaNetwork(() => undefined, () => undefined, () => undefined, harness.factory);

    network.host(firstReady, '  retained-room  ', true);
    expect(network.pendingConnectionAttempt()).toEqual({
      kind: 'host',
      key: hostConnectionAttemptKey('retained-room', true),
    });

    network.host(duplicateReady, 'retained-room', true);
    network.join('different-room', duplicateReady);
    expect(harness.peers).toHaveLength(1);
    expect(harness.peers[0].destroyCalls).toBe(0);

    harness.peers[0].emit('open', 'retained-room');
    expect(firstReady).toHaveBeenCalledOnce();
    expect(duplicateReady).not.toHaveBeenCalled();
    expect(network.pendingConnectionAttempt()).toBeNull();

    network.host(duplicateReady, 'retained-room', true);
    expect(harness.peers).toHaveLength(1);
    expect(harness.peers[0].destroyCalls).toBe(0);
  });

  it('does not destroy, restart, or allocate for duplicate join calls and rejects a different target until cancellation', () => {
    const harness = fakePeerFactory();
    const statuses: string[] = [];
    const network = new ArenaNetwork(
      () => undefined,
      (status) => statuses.push(status),
      () => undefined,
      harness.factory,
    );

    network.join('  host-room  ', () => undefined);
    expect(network.pendingConnectionAttempt()).toEqual({
      kind: 'join',
      key: joinConnectionAttemptKey('host-room'),
    });
    network.join('host-room', () => undefined);
    network.join('other-room', () => undefined);

    expect(harness.peers).toHaveLength(1);
    expect(harness.peers[0].destroyCalls).toBe(0);
    expect(network.roomCode).toBe('host-room');
    expect(statuses.at(-1)).toMatch(/cancel the current connection/i);
  });

  it('releases a failed pending host attempt so an explicit retry creates one fresh Peer', () => {
    const harness = fakePeerFactory();
    const network = new ArenaNetwork(() => undefined, () => undefined, () => undefined, harness.factory);

    network.host(() => undefined);
    harness.peers[0].emit('error', peerError('network', 'signalling failed'));

    expect(harness.peers[0].destroyCalls).toBe(1);
    expect(network.role).toBe('offline');
    expect(network.pendingConnectionAttempt()).toBeNull();

    network.host(() => undefined);
    expect(harness.peers).toHaveLength(2);
    expect(harness.peers[1].destroyCalls).toBe(0);
  });

  it('releases a synchronous Peer construction failure before retrying', () => {
    const peer = new FakePeer();
    const factory = vi.fn<ArenaPeerFactory>()
      .mockImplementationOnce(() => { throw new Error('browser transport unavailable'); })
      .mockReturnValue(peer as unknown as Peer);
    const network = new ArenaNetwork(() => undefined, () => undefined, () => undefined, factory);

    network.join('host-room', () => undefined);
    expect(network.role).toBe('offline');
    expect(network.pendingConnectionAttempt()).toBeNull();

    network.join('host-room', () => undefined);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(network.pendingConnectionAttempt()).toEqual({
      kind: 'join',
      key: joinConnectionAttemptKey('host-room'),
    });
  });

  it('releases a timed-out initial join so the same room can be retried explicitly', () => {
    vi.useFakeTimers();
    const harness = fakePeerFactory();
    const network = new ArenaNetwork(() => undefined, () => undefined, () => undefined, harness.factory);

    network.join('host-room', () => undefined);
    vi.advanceTimersByTime(12_000);

    expect(harness.peers[0].destroyCalls).toBe(1);
    expect(network.role).toBe('offline');
    expect(network.pendingConnectionAttempt()).toBeNull();

    network.join('host-room', () => undefined);
    expect(harness.peers).toHaveLength(2);
  });

  it('keeps host reclaim recursion inside one logical pending attempt', () => {
    vi.useFakeTimers();
    installTimerWindow();
    const harness = fakePeerFactory();
    const onReady = vi.fn();
    const network = new ArenaNetwork(() => undefined, () => undefined, () => undefined, harness.factory);

    network.host(onReady, 'retained-room', true);
    const logicalAttempt = network.pendingConnectionAttempt();
    harness.peers[0].emit('error', peerError('unavailable-id', 'room is still releasing'));

    expect(harness.peers[0].destroyCalls).toBe(1);
    expect(harness.peers).toHaveLength(1);
    expect(network.pendingConnectionAttempt()).toEqual(logicalAttempt);

    vi.advanceTimersByTime(350);
    expect(harness.peers).toHaveLength(2);
    expect(harness.preferredIds).toEqual(['retained-room', 'retained-room']);
    expect(network.pendingConnectionAttempt()).toEqual(logicalAttempt);

    harness.peers[1].emit('open', 'retained-room');
    expect(onReady).toHaveBeenCalledOnce();
    expect(network.pendingConnectionAttempt()).toBeNull();
  });

  it('reclaims the exact retained room after a long signalling release without opening a fresh room', () => {
    vi.useFakeTimers();
    installTimerWindow();
    const harness = fakePeerFactory();
    const onReady = vi.fn();
    const network = new ArenaNetwork(() => undefined, () => undefined, () => undefined, harness.factory);

    network.host(onReady, 'retained-room', true);
    const logicalAttempt = network.pendingConnectionAttempt();
    let waitedMs = 0;
    for (let attempt = 0; attempt <= 16; attempt += 1) {
      const reclaim = hostRoomReclaimAction(true, attempt);
      expect(reclaim.action).toBe('retry');
      if (reclaim.action !== 'retry') throw new Error(`unexpected reclaim decision at ${attempt}`);
      harness.peers[attempt]!.emit('error', peerError('unavailable-id', 'room is still releasing'));
      vi.advanceTimersByTime(reclaim.delayMs);
      waitedMs += reclaim.delayMs;
      expect(network.pendingConnectionAttempt()).toEqual(logicalAttempt);
    }

    expect(waitedMs).toBe(57_100);
    expect(harness.peers).toHaveLength(18);
    expect(harness.preferredIds).toEqual(Array.from({ length: 18 }, () => 'retained-room'));
    harness.peers.at(-1)!.emit('open', 'retained-room');

    expect(network.roomCode).toBe('retained-room');
    expect(onReady).toHaveBeenCalledOnce();
    expect(network.pendingConnectionAttempt()).toBeNull();
  });

  it('manual close cancels the logical attempt and permits a clean same-intent restart', () => {
    const harness = fakePeerFactory();
    const network = new ArenaNetwork(() => undefined, () => undefined, () => undefined, harness.factory);

    network.host(() => undefined, 'room');
    network.close();
    expect(harness.peers[0].destroyCalls).toBe(1);
    expect(network.pendingConnectionAttempt()).toBeNull();

    network.host(() => undefined, 'room');
    expect(harness.peers).toHaveLength(2);
    expect(harness.peers[1].destroyCalls).toBe(0);
  });

  it('ignores stale callbacks from a superseded physical Peer during reclaim', () => {
    vi.useFakeTimers();
    installTimerWindow();
    const harness = fakePeerFactory();
    const onReady = vi.fn();
    const network = new ArenaNetwork(() => undefined, () => undefined, () => undefined, harness.factory);

    network.host(onReady, 'retained-room', true);
    const stale = harness.peers[0];
    stale.emit('error', peerError('unavailable-id', 'room is still releasing'));
    vi.advanceTimersByTime(350);
    const current = harness.peers[1];

    stale.emit('open', 'stale-room');
    stale.emit('error', peerError('network', 'late failure'));
    stale.emit('disconnected');

    expect(harness.peers).toHaveLength(2);
    expect(current.destroyCalls).toBe(0);
    expect(stale.reconnectCalls).toBe(0);
    expect(network.roomCode).toBe('');
    expect(onReady).not.toHaveBeenCalled();

    current.emit('open', 'retained-room');
    expect(network.roomCode).toBe('retained-room');
    expect(onReady).toHaveBeenCalledOnce();
  });
});
