import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataConnection, Peer } from 'peerjs';
import { ArenaNetwork, LOBBY_CLOSED_FAREWELL_FLUSH_MS } from './network';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';

// HF-326 residual polish: an intentional lobby reset sends a best-effort
// 'lobby-closed' farewell so guests of the invalidated room stop the
// 90-second rejoin loop, without delaying the reset itself by more than
// LOBBY_CLOSED_FAREWELL_FLUSH_MS and without ever blocking it (fail-open).

class FakeConnection {
  readonly peer: string;
  readonly label: string;
  readonly metadata: { channel: 'events' | 'state'; transportEpoch?: string; transportGeneration?: number };
  open = true;
  readonly sent: unknown[] = [];
  private readonly handlers = new Map<string, Array<(payload?: unknown) => void>>();

  constructor(
    peer: string,
    channel: 'events' | 'state' = 'events',
    transportEpoch = 'default_transport_epoch',
    transportGeneration = 1,
  ) {
    this.peer = peer;
    this.label = channel === 'state' ? 'atomic-acres-state-v1' : 'atomic-acres-events-v1';
    this.metadata = { channel, transportEpoch, transportGeneration };
  }
  on(event: string, handler: (payload?: unknown) => void): this {
    this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]);
    return this;
  }
  emit(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
  send(payload: unknown): void { this.sent.push(payload); }
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
  }
}

class FakePeer {
  destroyed = false;
  private readonly handlers = new Map<string, Array<(payload?: unknown) => void>>();
  on(event: string, handler: (payload?: unknown) => void): this {
    this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]);
    return this;
  }
  emit(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
  destroy(): void { this.destroyed = true; }
  reconnect(): void { /* no-op */ }
}

type NetworkInternals = {
  role: 'offline' | 'host' | 'client';
  hostEventConnection: DataConnection | null;
  wireGuestEvents(connection: DataConnection): void;
  wireHostChannel(connection: DataConnection, kind: 'events' | 'state'): void;
};

type CapturedTimeout = { callback: () => void; delayMs: number };

function stubWindow(timeouts: CapturedTimeout[]): void {
  vi.stubGlobal('window', {
    location: { search: '', hostname: 'localhost' },
    setTimeout: (callback: () => void, delayMs: number) => {
      timeouts.push({ callback, delayMs });
      return timeouts.length;
    },
    clearInterval: () => undefined,
    removeEventListener: () => undefined,
    addEventListener: () => undefined,
  });
}

const lobbyJoin = (playerId: string, connectionEpoch = `connection_epoch_${playerId}`) => ({
  type: 'lobby-join' as const,
  protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
  playerId,
  connectionEpoch,
  name: playerId.slice(0, 20),
  requestedTeam: 0 as const,
  resumeToken: `12345678-1234-1234-1234-${playerId.padEnd(12, '0').slice(0, 12)}`,
  nonce: 1,
});

function admitGuest(network: ArenaNetwork, playerId: string, peerId: string): FakeConnection {
  const internals = network as unknown as NetworkInternals;
  const connection = new FakeConnection(peerId);
  internals.wireGuestEvents(connection as unknown as DataConnection);
  const join = lobbyJoin(playerId);
  connection.emit('data', join);
  expect(network.confirmPlayerAdmission(playerId, join.resumeToken, join.connectionEpoch)).toBe(true);
  return connection;
}

afterEach(() => vi.unstubAllGlobals());

describe('HF-326 lobby-closed farewell on intentional reset', () => {
  it('farewells admitted guests on the open reliable lane, then resets after the bounded flush', () => {
    const timeouts: CapturedTimeout[] = [];
    stubWindow(timeouts);
    const peers: FakePeer[] = [];
    const statuses: Array<[string, string | undefined]> = [];
    const network = new ArenaNetwork(
      () => undefined,
      (text, kind) => statuses.push([text, kind]),
      () => undefined,
      () => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as Peer; },
    );
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const guest = admitGuest(network, 'player-1', 'peer-1');
    let ready = 0;

    expect(network.resetLobby(() => { ready += 1; })).toBe(true);

    // The farewell left before any channel closed, and the reset is pending
    // behind exactly the bounded flush delay.
    expect(guest.sent.at(-1)).toEqual(expect.objectContaining({ type: 'lobby-closed', reason: 'host-reset' }));
    expect(guest.open).toBe(true);
    expect(ready).toBe(0);
    expect(timeouts.map((entry) => entry.delayMs)).toContain(LOBBY_CLOSED_FAREWELL_FLUSH_MS);
    expect(LOBBY_CLOSED_FAREWELL_FLUSH_MS).toBeLessThanOrEqual(250);
    expect(network.diagnostics()).toMatchObject({ pendingLobbyReset: true, lobbyClosedFarewells: 1 });

    const flush = timeouts.find((entry) => entry.delayMs === LOBBY_CLOSED_FAREWELL_FLUSH_MS)!;
    flush.callback();

    // The deferred reset closed the old room and re-hosted a fresh code.
    expect(guest.open).toBe(false);
    expect(peers).toHaveLength(1);
    peers[0]!.emit('open', 'fresh-room-code');
    expect(network.roomCode).toBe('fresh-room-code');
    expect(ready).toBe(1);
    expect(network.diagnostics()).toMatchObject({ role: 'host', pendingLobbyReset: false });
  });

  it('resets immediately with no farewell timer when nobody is admitted (fail-open)', () => {
    const timeouts: CapturedTimeout[] = [];
    stubWindow(timeouts);
    const peers: FakePeer[] = [];
    const network = new ArenaNetwork(
      () => undefined,
      () => undefined,
      () => undefined,
      () => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as Peer; },
    );
    (network as unknown as NetworkInternals).role = 'host';

    expect(network.resetLobby(() => undefined)).toBe(true);

    expect(timeouts.map((entry) => entry.delayMs)).not.toContain(LOBBY_CLOSED_FAREWELL_FLUSH_MS);
    expect(peers).toHaveLength(1);
    expect(network.diagnostics()).toMatchObject({ lobbyClosedFarewells: 0 });
  });

  it('coalesces a second reset request during the flush window into the pending reset', () => {
    const timeouts: CapturedTimeout[] = [];
    stubWindow(timeouts);
    const peers: FakePeer[] = [];
    const network = new ArenaNetwork(
      () => undefined,
      () => undefined,
      () => undefined,
      () => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as Peer; },
    );
    (network as unknown as NetworkInternals).role = 'host';
    const guest = admitGuest(network, 'player-1', 'peer-1');

    expect(network.resetLobby(() => undefined)).toBe(true);
    expect(network.resetLobby(() => undefined)).toBe(true);

    expect(guest.sent.filter((message) => (message as { type?: string }).type === 'lobby-closed')).toHaveLength(1);
    expect(timeouts.filter((entry) => entry.delayMs === LOBBY_CLOSED_FAREWELL_FLUSH_MS)).toHaveLength(1);

    timeouts.find((entry) => entry.delayMs === LOBBY_CLOSED_FAREWELL_FLUSH_MS)!.callback();
    expect(peers).toHaveLength(1);
  });

  it('never lets a stale flush callback resurrect a session the host already closed', () => {
    const timeouts: CapturedTimeout[] = [];
    stubWindow(timeouts);
    const peers: FakePeer[] = [];
    const network = new ArenaNetwork(
      () => undefined,
      () => undefined,
      () => undefined,
      () => { const peer = new FakePeer(); peers.push(peer); return peer as unknown as Peer; },
    );
    (network as unknown as NetworkInternals).role = 'host';
    admitGuest(network, 'player-1', 'peer-1');
    expect(network.resetLobby(() => undefined)).toBe(true);

    network.close();
    timeouts.find((entry) => entry.delayMs === LOBBY_CLOSED_FAREWELL_FLUSH_MS)!.callback();

    expect(peers).toHaveLength(0);
    expect(network.diagnostics()).toMatchObject({ role: 'offline', pendingLobbyReset: false });
  });

  it('refuses the farewell broadcast for any non-host role', () => {
    const timeouts: CapturedTimeout[] = [];
    stubWindow(timeouts);
    const network = new ArenaNetwork(() => undefined, () => undefined);
    expect(network.announceLobbyClosed('host-reset')).toBe(0);
    (network as unknown as NetworkInternals).role = 'client';
    expect(network.announceLobbyClosed('host-reset')).toBe(0);
  });

  it('ends a client session terminally on the host farewell instead of the 90-second retry loop', () => {
    const timeouts: CapturedTimeout[] = [];
    stubWindow(timeouts);
    const delivered: Array<{ type: string }> = [];
    const statuses: Array<[string, string | undefined]> = [];
    const network = new ArenaNetwork(
      (message) => delivered.push(message),
      (text, kind) => statuses.push([text, kind]),
    );
    const internals = network as unknown as NetworkInternals;
    internals.role = 'client';
    const hostConnection = new FakeConnection('host-peer');
    internals.hostEventConnection = hostConnection as unknown as DataConnection;
    internals.wireHostChannel(hostConnection as unknown as DataConnection, 'events');

    // A malformed farewell (unknown reason) is dropped before app delivery.
    hostConnection.emit('data', { type: 'lobby-closed', reason: 'rage-quit', nonce: 1 });
    expect(delivered).toEqual([]);

    hostConnection.emit('data', { type: 'lobby-closed', reason: 'host-reset', nonce: 2 });

    expect(delivered.map((message) => message.type)).toEqual(['lobby-closed']);
    expect(hostConnection.open).toBe(false);
    expect(network.diagnostics()).toMatchObject({ role: 'offline' });
    expect(statuses.some(([text]) => /fresh room/i.test(text))).toBe(true);
    expect(statuses.some(([text]) => /90-second/i.test(text))).toBe(false);
  });

  it('drops a forged guest lobby-closed before app delivery or relay', () => {
    const timeouts: CapturedTimeout[] = [];
    stubWindow(timeouts);
    const delivered: Array<{ type: string }> = [];
    const network = new ArenaNetwork((message) => delivered.push(message), () => undefined);
    (network as unknown as NetworkInternals).role = 'host';
    const forger = admitGuest(network, 'player-1', 'peer-1');
    const bystander = admitGuest(network, 'player-2', 'peer-2');
    delivered.length = 0;

    forger.emit('data', { type: 'lobby-closed', reason: 'host-reset', nonce: 3 });

    expect(delivered).toEqual([]);
    expect(bystander.sent.filter((message) => (message as { type?: string }).type === 'lobby-closed')).toHaveLength(0);
    expect(network.connectedPlayerIds()).toEqual(['player-1', 'player-2']);
  });
});
