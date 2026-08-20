import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataConnection } from 'peerjs';
import {
  ArenaNetwork,
  CLIENT_HOST_LIVENESS_MAX_SCHEDULING_GAP_MS,
  CLIENT_HOST_SILENCE_TIMEOUT_MS,
  activeGuestCanBeReplaced,
  bindGuestResumeToken,
  boundGuestLeave,
  clientHostLivenessDecision,
  clientHostLivenessExpired,
  guestMessageEndsSession,
  hostRoomReclaimAction,
  initialLobbyJoinHasProtocolMismatch,
  isCurrentClientConnection,
  isCurrentGuestEventConnection,
  isCurrentGuestStateConnection,
  joinTimeoutAction,
  localQaPeerPath,
  localQaRtcConfiguration,
  nextTransportGeneration,
  replaceGuestPeerOwner,
  stateTrafficUsesFallback,
} from './network';
import { isGameMessage, MULTIPLAYER_PROTOCOL_VERSION } from './protocol';

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

type NetworkInternals = {
  role: 'host' | 'client';
  guestResumeTokens: Map<string, string>;
  guestBundles: Map<string, {
    transportEpoch: string | null;
    transportGeneration: number;
    connectionEpoch: string;
    resumeToken: string;
    admitted: boolean;
    events: DataConnection;
    state: DataConnection | null;
  }>;
  provisionalGuestReplacements: Map<string, {
    transportEpoch: string | null;
    transportGeneration: number;
    connectionEpoch: string;
    resumeToken: string;
    admitted: boolean;
    events: DataConnection;
    state: DataConnection | null;
  }>;
  guestPeerOwners: Map<string, string>;
  clientHostLivenessTimer: number | null;
  lastValidHostMessageMonoMs: number | null;
  foregroundProbeGraceUntilMonoMs: number | null;
  lastClientHostLivenessCheckMonoMs: number | null;
  wireGuestEvents(connection: DataConnection): void;
  wireGuestState(connection: DataConnection): void;
};

const lobbyJoin = (resumeToken: string, connectionEpoch = 'connection_epoch_player_1') => ({
  type: 'lobby-join' as const,
  protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
  playerId: 'player-1',
  connectionEpoch,
  name: 'Player 1',
  requestedTeam: 0 as const,
  resumeToken,
  nonce: 1,
});

afterEach(() => vi.unstubAllGlobals());

describe('local QA PeerJS path ownership', () => {
  it('admits only a fresh 96-bit hexadecimal child token path', () => {
    expect(localQaPeerPath('/peerjs-0123456789abcdef01234567')).toBe('/peerjs-0123456789abcdef01234567');
    expect(localQaPeerPath('/peerjs')).toBe('/peerjs');
    expect(localQaPeerPath('/peerjs-0123456789abcdef')).toBe('/peerjs');
    expect(localQaPeerPath('/peerjs-0123456789ABCDEF01234567')).toBe('/peerjs');
    expect(localQaPeerPath('/peerjs-0123456789abcdef01234567/peers')).toBe('/peerjs');
    expect(localQaPeerPath(null)).toBe('/peerjs');
    expect(localQaRtcConfiguration()).toEqual({ iceServers: [] });
  });
});

describe('client host liveness watchdog', () => {
  const sample = (overrides: Partial<Parameters<typeof clientHostLivenessExpired>[0]> = {}) => ({
    activeClient: true,
    eventChannelOpen: true,
    documentHidden: false,
    reconnectPending: false,
    lastValidHostMessageMonoMs: 1_000,
    foregroundProbeGraceUntilMonoMs: 1_000 + CLIENT_HOST_SILENCE_TIMEOUT_MS,
    nowMonoMs: 1_000 + CLIENT_HOST_SILENCE_TIMEOUT_MS,
    ...overrides,
  });

  it('keeps a normally active host session alive when accepted traffic refreshes the cadence', () => {
    expect(clientHostLivenessExpired(sample({
      lastValidHostMessageMonoMs: 14_000,
      nowMonoMs: 14_000 + CLIENT_HOST_SILENCE_TIMEOUT_MS - 1,
    }))).toBe(false);
  });

  it('does not expire an apparently-open lane while the document is hidden', () => {
    expect(clientHostLivenessExpired(sample({
      documentHidden: true,
      nowMonoMs: 1_000 + CLIENT_HOST_SILENCE_TIMEOUT_MS * 10,
    }))).toBe(false);
  });

  it('grants a full foreground probe interval after visibility or focus returns', () => {
    const returnedAt = 100_000;
    expect(clientHostLivenessExpired(sample({
      foregroundProbeGraceUntilMonoMs: returnedAt + CLIENT_HOST_SILENCE_TIMEOUT_MS,
      nowMonoMs: returnedAt + CLIENT_HOST_SILENCE_TIMEOUT_MS - 1,
    }))).toBe(false);
    expect(clientHostLivenessExpired(sample({
      foregroundProbeGraceUntilMonoMs: returnedAt + CLIENT_HOST_SILENCE_TIMEOUT_MS,
      nowMonoMs: returnedAt + CLIENT_HOST_SILENCE_TIMEOUT_MS,
    }))).toBe(true);
  });

  it('expires a foreground client only after an open lane has received no valid host message for the full interval', () => {
    expect(clientHostLivenessExpired(sample())).toBe(true);
    expect(clientHostLivenessExpired(sample({ eventChannelOpen: false }))).toBe(false);
  });

  it('grants a fresh probe interval after a delayed visible callback instead of destroying queued traffic', () => {
    const delayedNow = 1_000 + CLIENT_HOST_SILENCE_TIMEOUT_MS;
    expect(clientHostLivenessDecision({
      ...sample({ nowMonoMs: delayedNow }),
      lastWatchdogCheckMonoMs: delayedNow - CLIENT_HOST_LIVENESS_MAX_SCHEDULING_GAP_MS - 1,
    })).toBe('grant-probe-grace');
    expect(clientHostLivenessDecision({
      ...sample({
        nowMonoMs: delayedNow + CLIENT_HOST_SILENCE_TIMEOUT_MS - 1,
        foregroundProbeGraceUntilMonoMs: delayedNow + CLIENT_HOST_SILENCE_TIMEOUT_MS,
      }),
      lastWatchdogCheckMonoMs: delayedNow + CLIENT_HOST_SILENCE_TIMEOUT_MS - 2,
    })).toBe('hold');
  });

  it('still reconnects a genuinely silent host after normally scheduled checks exhaust the grace interval', () => {
    const nowMonoMs = 1_000 + CLIENT_HOST_SILENCE_TIMEOUT_MS;
    expect(clientHostLivenessDecision({
      ...sample({ nowMonoMs }),
      lastWatchdogCheckMonoMs: nowMonoMs - 1_000,
    })).toBe('reconnect');
  });

  it('suppresses duplicate watchdog ticks and becomes inert after client cleanup', () => {
    expect(clientHostLivenessExpired(sample({ reconnectPending: true }))).toBe(false);
    expect(clientHostLivenessExpired(sample({ activeClient: false }))).toBe(false);
  });

  it('cleans its timer and foreground listeners when the client session closes', () => {
    const clearIntervalSpy = vi.fn();
    const removeWindowListener = vi.fn();
    const removeDocumentListener = vi.fn();
    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      clearInterval: clearIntervalSpy,
      removeEventListener: removeWindowListener,
    });
    vi.stubGlobal('document', { removeEventListener: removeDocumentListener });
    const network = new ArenaNetwork(() => undefined, () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'client';
    internals.clientHostLivenessTimer = 27;
    internals.lastValidHostMessageMonoMs = 1;
    internals.foregroundProbeGraceUntilMonoMs = 2;

    network.close();

    expect(clearIntervalSpy).toHaveBeenCalledOnce();
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(network.diagnostics()).toMatchObject({
      role: 'offline',
      clientHostLivenessWatchdogActive: false,
      clientHostSilenceAgeMs: null,
      clientHostProbeGraceRemainingMs: 0,
    });
  });
});

describe('client-causal transport generations', () => {
  it('creates safe strictly increasing values before paired lanes are opened', () => {
    const first = nextTransportGeneration(1_800_000_000_000);
    const second = nextTransportGeneration(1_800_000_000_000);
    expect(Number.isSafeInteger(first)).toBe(true);
    expect(second).toBe(first + 1);
  });

  it('continues above the retained document generation after a reload', () => {
    let stored = '1900000000000000';
    vi.stubGlobal('sessionStorage', {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
    });
    const generation = nextTransportGeneration(1_700_000_000_000);
    expect(generation).toBe(1_900_000_000_000_001);
    expect(stored).toBe(String(generation));
  });

  it('rejects time origins that cannot be represented as a safe ordering value', () => {
    expect(() => nextTransportGeneration(Number.MAX_SAFE_INTEGER)).toThrow(/safe client transport generation/i);
  });
});

describe('guest event connection lifecycle', () => {
  it('does not let a stale same-peer close callback evict the replacement session', () => {
    const oldConnection = { peer: 'stable-peer' } as DataConnection;
    const replacement = { peer: 'stable-peer' } as DataConnection;
    expect(isCurrentGuestEventConnection(replacement, oldConnection)).toBe(false);
    expect(isCurrentGuestEventConnection(replacement, replacement)).toBe(true);
  });

  it('rejects queued event and state traffic from stale same-peer replacement lanes', () => {
    const oldEvents = { peer: 'stable-peer' } as DataConnection;
    const replacementEvents = { peer: 'stable-peer' } as DataConnection;
    const oldState = { peer: 'stable-peer' } as DataConnection;
    const replacementState = { peer: 'stable-peer' } as DataConnection;

    expect(isCurrentGuestEventConnection(replacementEvents, oldEvents)).toBe(false);
    expect(isCurrentGuestEventConnection(replacementEvents, replacementEvents)).toBe(true);
    expect(isCurrentGuestStateConnection(replacementState, oldState)).toBe(false);
    expect(isCurrentGuestStateConnection(replacementState, replacementState)).toBe(true);
  });

  it.each([
    ['events-first', 'events-first'],
    ['events-first', 'state-first'],
    ['state-first', 'events-first'],
    ['state-first', 'state-first'],
  ] as const)('pairs %s initial lanes and %s replacement lanes by transport epoch', (initialOrder, replacementOrder) => {
    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const delivered: Array<{ type: string }> = [];
    const network = new ArenaNetwork((message) => delivered.push(message), () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const token = '12345678-1234-1234-1234-123456789abc';
    const wireGeneration = (
      events: FakeConnection,
      state: FakeConnection,
      order: 'events-first' | 'state-first',
      connectionEpoch: string,
    ): void => {
      if (order === 'state-first') internals.wireGuestState(state as unknown as DataConnection);
      internals.wireGuestEvents(events as unknown as DataConnection);
      events.emit('data', lobbyJoin(token, connectionEpoch));
      expect(network.confirmPlayerAdmission('player-1', token, connectionEpoch)).toBe(true);
      if (order === 'events-first') internals.wireGuestState(state as unknown as DataConnection);
    };
    const oldTransportEpoch = 'old_transport_epoch';
    const oldEvents = new FakeConnection('stable-peer', 'events', oldTransportEpoch, 1);
    const oldState = new FakeConnection('stable-peer', 'state', oldTransportEpoch, 1);
    wireGeneration(oldEvents, oldState, initialOrder, 'old_connection_epoch');

    const replacementTransportEpoch = 'replacement_transport_epoch';
    const replacementEvents = new FakeConnection('stable-peer', 'events', replacementTransportEpoch, 2);
    const replacementState = new FakeConnection('stable-peer', 'state', replacementTransportEpoch, 2);
    wireGeneration(replacementEvents, replacementState, replacementOrder, 'replacement_connection_epoch');
    const deliveredAfterReplacement = delivered.length;
    const state = {
      type: 'state' as const,
      player: {
        id: 'player-1', name: 'Player 1', team: 0 as const,
        x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0, hp: 100, kills: 0, deaths: 0,
        primary: 'm4a1' as const, secondary: 'pistol' as const, grenade: 'frag' as const,
        weapon: 'm4a1' as const, stance: 'stand' as const, seq: 1,
      },
      hostTimeMs: 1_000,
      continuity: 2,
      rateHz: 40 as const,
    };

    oldState.emit('open');
    expect(internals.guestBundles.get('player-1')?.state).toBe(replacementState);
    expect(internals.guestBundles.get('player-1')?.transportEpoch).toBe(replacementTransportEpoch);
    expect(replacementState.open).toBe(true);
    oldEvents.emit('data', { type: 'lobby-ready', by: 'player-1', ready: true, nonce: 2 });
    oldState.emit('data', state);
    expect(delivered).toHaveLength(deliveredAfterReplacement);

    replacementEvents.emit('data', { type: 'lobby-ready', by: 'player-1', ready: true, nonce: 3 });
    replacementState.emit('data', { ...state, player: { ...state.player, seq: 2 } });
    replacementEvents.emit('data', {
      type: 'guest-resume-ack', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'player-1', connectionEpoch: 'replacement_connection_epoch',
      matchEpoch: 3, authorityNonce: 4, nonce: 5,
    });
    expect(delivered.slice(deliveredAfterReplacement).map((message) => message.type)).toEqual([
      'lobby-ready', 'state', 'guest-resume-ack',
    ]);
    expect(internals.guestBundles.get('player-1')).toMatchObject({
      events: replacementEvents,
      state: replacementState,
    });
    expect(internals.guestPeerOwners.get('stable-peer')).toBe('player-1');
  });

  it('retains the admitted transport when a provisional same-token replacement closes before confirmation', () => {
    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const delivered: Array<{ type: string }> = [];
    const network = new ArenaNetwork((message) => delivered.push(message), () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const token = '12345678-1234-1234-1234-123456789abc';
    const admitted = new FakeConnection('peer-admitted', 'events', 'admitted_transport_epoch', 1);
    internals.wireGuestEvents(admitted as unknown as DataConnection);
    admitted.emit('data', lobbyJoin(token, 'admitted_connection_epoch'));
    expect(network.confirmPlayerAdmission('player-1', token, 'admitted_connection_epoch')).toBe(true);

    const provisional = new FakeConnection('peer-provisional', 'events', 'provisional_transport_epoch', 2);
    internals.wireGuestEvents(provisional as unknown as DataConnection);
    provisional.emit('data', lobbyJoin(token, 'provisional_connection_epoch'));

    expect(admitted.open).toBe(true);
    expect(internals.guestBundles.get('player-1')).toMatchObject({
      admitted: true,
      events: admitted,
      connectionEpoch: 'admitted_connection_epoch',
    });
    expect(internals.provisionalGuestReplacements.get('player-1')).toMatchObject({
      admitted: false,
      events: provisional,
      connectionEpoch: 'provisional_connection_epoch',
    });

    provisional.close();
    expect(internals.provisionalGuestReplacements.has('player-1')).toBe(false);
    expect(internals.guestBundles.get('player-1')).toMatchObject({ admitted: true, events: admitted });
    expect(network.connectedPlayerIds()).toEqual(['player-1']);

    const deliveredBeforeReady = delivered.length;
    admitted.emit('data', { type: 'lobby-ready', by: 'player-1', ready: true, nonce: 91 });
    expect(delivered.slice(deliveredBeforeReady).map((message) => message.type)).toEqual(['lobby-ready']);
  });

  it('retains and restores the same-peer owner index when the active transport closes before provisional promotion', () => {
    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const network = new ArenaNetwork(() => undefined, () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const token = '12345678-1234-1234-1234-123456789abc';
    const active = new FakeConnection('stable-peer', 'events', 'active_transport_epoch', 1);
    internals.wireGuestEvents(active as unknown as DataConnection);
    active.emit('data', lobbyJoin(token, 'active_connection_epoch'));
    expect(network.confirmPlayerAdmission('player-1', token, 'active_connection_epoch')).toBe(true);

    const replacement = new FakeConnection('stable-peer', 'events', 'replacement_transport_epoch', 2);
    internals.wireGuestEvents(replacement as unknown as DataConnection);
    replacement.emit('data', lobbyJoin(token, 'replacement_connection_epoch'));
    expect(internals.provisionalGuestReplacements.get('player-1')?.events).toBe(replacement);

    active.close();
    expect(internals.guestPeerOwners.get('stable-peer')).toBe('player-1');
    const replacementState = new FakeConnection('stable-peer', 'state', 'replacement_transport_epoch', 2);
    internals.wireGuestState(replacementState as unknown as DataConnection);
    expect(network.confirmPlayerAdmission('player-1', token, 'replacement_connection_epoch')).toBe(true);
    expect(internals.guestPeerOwners.get('stable-peer')).toBe('player-1');
    expect(internals.guestBundles.get('player-1')).toMatchObject({
      admitted: true,
      events: replacement,
      state: replacementState,
    });
  });

  it.each(['events-first', 'state-first'] as const)(
    'does not let an older delayed %s lane displace a newer authenticated transport',
    (olderOrder) => {
      vi.stubGlobal('window', {
        location: { search: '', hostname: 'localhost' },
        setTimeout: (callback: () => void) => { callback(); return 0; },
      });
      const delivered: Array<{ type: string }> = [];
      const network = new ArenaNetwork((message) => delivered.push(message), () => undefined);
      const internals = network as unknown as NetworkInternals;
      internals.role = 'host';
      const token = '12345678-1234-1234-1234-123456789abc';
      const newEpoch = 'new_current_transport';
      const newEvents = new FakeConnection('new-peer', 'events', newEpoch, 2);
      const newState = new FakeConnection('new-peer', 'state', newEpoch, 2);
      internals.wireGuestState(newState as unknown as DataConnection);
      internals.wireGuestEvents(newEvents as unknown as DataConnection);
      newEvents.emit('data', lobbyJoin(token, 'new_connection_epoch'));
      expect(network.confirmPlayerAdmission('player-1', token, 'new_connection_epoch')).toBe(true);

      // The stale transport itself reaches the host after the replacement; host
      // callback order therefore cannot be used as the authority ordering.
      const oldEpoch = 'old_delayed_transport';
      const oldEvents = new FakeConnection('old-peer', 'events', oldEpoch, 1);
      const oldState = new FakeConnection('old-peer', 'state', oldEpoch, 1);
      if (olderOrder === 'state-first') internals.wireGuestState(oldState as unknown as DataConnection);
      internals.wireGuestEvents(oldEvents as unknown as DataConnection);

      oldEvents.emit('data', lobbyJoin(token, 'old_connection_epoch'));

      expect(oldEvents.sent).toEqual([expect.objectContaining({ type: 'lobby-reject', reason: 'rejoin-denied' })]);
      expect(oldEvents.open).toBe(false);
      expect(internals.guestBundles.get('player-1')).toMatchObject({
        events: newEvents,
        state: newState,
        admitted: true,
        transportGeneration: 2,
        connectionEpoch: 'new_connection_epoch',
      });
      expect(delivered.map((message) => message.type)).toEqual(['lobby-join']);
    },
  );

  it('holds gameplay traffic fail-closed until admission and releases a rejected provisional credential', () => {
    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const delivered: Array<{ type: string }> = [];
    const network = new ArenaNetwork((message) => delivered.push(message), () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const badToken = '12345678-1234-1234-1234-123456789abc';
    const connection = new FakeConnection('peer-provisional');
    internals.wireGuestEvents(connection as unknown as DataConnection);
    connection.emit('data', lobbyJoin(badToken));
    connection.emit('data', { type: 'lobby-ready', by: 'player-1', ready: true, nonce: 2 });
    expect(delivered.map((message) => message.type)).toEqual(['lobby-join']);
    expect(network.connectedPlayerIds()).toEqual([]);
    expect(network.sendToPlayer('player-1', { type: 'lobby-reject', reason: 'rejoin-denied', nonce: 3 })).toBe(false);

    expect(network.rejectPlayerAdmission('player-1', badToken, 'connection_epoch_player_1', 'rejoin-denied')).toBe(true);
    expect(internals.guestResumeTokens.has('player-1')).toBe(false);
    expect(internals.guestBundles.has('player-1')).toBe(false);
    expect(connection.sent).toEqual([expect.objectContaining({ type: 'lobby-reject', reason: 'rejoin-denied' })]);
    expect(delivered.map((message) => message.type)).toEqual(['lobby-join']);

    const validToken = '87654321-4321-4321-4321-cba987654321';
    const retry = new FakeConnection('peer-valid-retry');
    internals.wireGuestEvents(retry as unknown as DataConnection);
    retry.emit('data', lobbyJoin(validToken, 'valid_retry_epoch'));
    expect(network.confirmPlayerAdmission('player-1', validToken, 'valid_retry_epoch')).toBe(true);
    retry.emit('data', { type: 'lobby-ready', by: 'player-1', ready: true, nonce: 4 });
    expect(delivered.map((message) => message.type)).toEqual(['lobby-join', 'lobby-join', 'lobby-ready']);
  });

  it('scopes asynchronous admission completion to the exact application connection epoch', () => {
    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const network = new ArenaNetwork(() => undefined, () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const token = '12345678-1234-1234-1234-123456789abc';
    const oldConnection = new FakeConnection('peer-old', 'events', 'old_transport_epoch', 1);
    internals.wireGuestEvents(oldConnection as unknown as DataConnection);
    oldConnection.emit('data', lobbyJoin(token, 'old_connection_epoch'));

    const replacement = new FakeConnection('peer-new', 'events', 'new_transport_epoch', 2);
    internals.wireGuestEvents(replacement as unknown as DataConnection);
    replacement.emit('data', lobbyJoin(token, 'new_connection_epoch'));

    expect(network.confirmPlayerAdmission('player-1', token, 'old_connection_epoch')).toBe(false);
    expect(network.rejectPlayerAdmission('player-1', token, 'old_connection_epoch', 'rejoin-denied')).toBe(false);
    expect(internals.guestBundles.get('player-1')).toMatchObject({
      connectionEpoch: 'new_connection_epoch',
      transportGeneration: 2,
      admitted: false,
      events: replacement,
    });
    expect(replacement.open).toBe(true);
    expect(network.confirmPlayerAdmission('player-1', token, 'new_connection_epoch')).toBe(true);
  });

  it('rejects event metadata without a valid causal generation before binding a player', () => {
    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const delivered: unknown[] = [];
    const network = new ArenaNetwork((message) => delivered.push(message), () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const connection = new FakeConnection('invalid-peer');
    delete connection.metadata.transportGeneration;
    internals.wireGuestEvents(connection as unknown as DataConnection);
    connection.emit('data', lobbyJoin('12345678-1234-1234-1234-123456789abc'));

    expect(delivered).toEqual([]);
    expect(connection.sent).toEqual([expect.objectContaining({ type: 'lobby-reject', reason: 'protocol-mismatch' })]);
    expect(connection.open).toBe(false);
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

  it('rejects a retained-token mismatch before provisional binding or app delivery', () => {
    const retained = '12345678-1234-1234-1234-123456789abc';
    const stale = '87654321-4321-4321-4321-cba987654321';
    const tokens = new Map([['player-1', retained]]);
    expect(bindGuestResumeToken(tokens, 'player-1', retained)).toBe(true);
    expect(bindGuestResumeToken(tokens, 'player-1', stale)).toBe(false);
    expect(tokens.get('player-1')).toBe(retained);

    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const delivered: unknown[] = [];
    const network = new ArenaNetwork((message) => delivered.push(message), () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    internals.guestResumeTokens.set('player-1', retained);
    const connection = new FakeConnection('peer-stale');
    internals.wireGuestEvents(connection as unknown as DataConnection);
    connection.emit('data', lobbyJoin(stale));

    expect(delivered).toEqual([]);
    expect(internals.guestResumeTokens.get('player-1')).toBe(retained);
    expect(connection.sent).toEqual([expect.objectContaining({ type: 'lobby-reject', reason: 'rejoin-denied' })]);
    expect(connection.open).toBe(false);
  });

  it('admits the first credential and an exact retained-token reconnect', () => {
    const token = '12345678-1234-1234-1234-123456789abc';
    const tokens = new Map<string, string>();
    expect(bindGuestResumeToken(tokens, 'player-1', token)).toBe(true);
    expect(tokens.get('player-1')).toBe(token);
    expect(bindGuestResumeToken(tokens, 'player-1', token)).toBe(true);
    expect(tokens.get('player-1')).toBe(token);
  });

  it('fails an initial bad room cleanly while retaining bounded retry for a dropped session', () => {
    expect(joinTimeoutAction(false)).toBe('offline');
    expect(joinTimeoutAction(true)).toBe('retry');
  });

  it('never silently abandons a required active-match room reclaim', () => {
    expect(hostRoomReclaimAction(false, 0)).toEqual({ action: 'fresh', delayMs: 0 });
    expect(hostRoomReclaimAction(true, 0)).toEqual({ action: 'retry', delayMs: 350 });
    expect(hostRoomReclaimAction(true, 4)).toEqual({ action: 'retry', delayMs: 4_000 });
    expect(hostRoomReclaimAction(true, 16)).toEqual({ action: 'retry', delayMs: 4_000 });
    expect(hostRoomReclaimAction(true, 17)).toEqual({ action: 'fail', delayMs: 0 });
    expect(hostRoomReclaimAction(true, -1)).toEqual({ action: 'fail', delayMs: 0 });
  });

  it('rejects a predecessor-version initial lobby handshake as a protocol mismatch', () => {
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
    const predecessorVersion = MULTIPLAYER_PROTOCOL_VERSION - 1;
    expect(initialLobbyJoinHasProtocolMismatch({ ...join, protocolVersion: predecessorVersion })).toBe(true);
    expect(initialLobbyJoinHasProtocolMismatch({ type: 'chat-submit', protocolVersion: predecessorVersion })).toBe(false);
  });

  it('rejects a v17 peer before it can mix with the required v18 support-shot schema', () => {
    expect(MULTIPLAYER_PROTOCOL_VERSION).toBe(18);
    const currentSupportResult = {
      type: 'killstreak-damage-result' as const,
      by: 'host',
      matchEpoch: 7,
      revision: 1,
      events: [],
      shots: [{
        activationId: 'ks-activation-7-1',
        entityId: 'ks-7-chopper-1',
        source: 'chopper' as const,
        ownerId: 'owner',
        ownerTeam: 0 as const,
        ordinal: 0,
        atMs: 1_000,
      }],
      impacts: [],
      nonce: 1,
    };
    expect(isGameMessage(currentSupportResult)).toBe(true);
    const { shots: _requiredShots, ...v17SupportResult } = currentSupportResult;
    expect(isGameMessage(v17SupportResult)).toBe(false);

    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const delivered: unknown[] = [];
    const network = new ArenaNetwork((message) => delivered.push(message), () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const connection = new FakeConnection('peer-v17');
    internals.wireGuestEvents(connection as unknown as DataConnection);
    connection.emit('data', { ...lobbyJoin('12345678-1234-1234-1234-123456789abc'), protocolVersion: 17 });

    expect(delivered).toEqual([]);
    expect(internals.guestBundles.has('player-1')).toBe(false);
    expect(connection.sent).toEqual([expect.objectContaining({ type: 'lobby-reject', reason: 'protocol-mismatch' })]);
    expect(connection.open).toBe(false);
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

  it('preserves an intentional leave while keeping the authenticated transport identity', () => {
    expect(boundGuestLeave('bound-player', true)).toEqual({
      type: 'leave',
      playerId: 'bound-player',
      voluntary: true,
    });
    expect(boundGuestLeave('bound-player')).toEqual({ type: 'leave', playerId: 'bound-player' });

    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const delivered: unknown[] = [];
    const statuses: Array<[string, string | undefined]> = [];
    const network = new ArenaNetwork(
      (message) => delivered.push(message),
      (text, kind) => statuses.push([text, kind]),
    );
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const connection = new FakeConnection('peer-voluntary');
    internals.wireGuestEvents(connection as unknown as DataConnection);
    const token = '12345678-1234-1234-1234-123456789abc';
    connection.emit('data', lobbyJoin(token));
    expect(network.confirmPlayerAdmission('player-1', token, 'connection_epoch_player_1')).toBe(true);
    delivered.length = 0;
    connection.emit('data', { type: 'leave', playerId: 'player-1', voluntary: true });

    // dropGuest removes the current bundle before close(), so the close callback
    // cannot emit a second non-voluntary leave after this authenticated notice.
    expect(delivered).toEqual([{ type: 'leave', playerId: 'player-1', voluntary: true }]);
    expect(statuses).toEqual([['1 guest connection', 'ok'], ['A guest left the lobby', 'ok']]);
    expect(connection.open).toBe(false);
  });

  it('expires an admitted zombie channel by authenticated message activity, not its open bit', () => {
    vi.stubGlobal('window', {
      location: { search: '', hostname: 'localhost' },
      setTimeout: (callback: () => void) => { callback(); return 0; },
    });
    const network = new ArenaNetwork(() => undefined, () => undefined);
    const internals = network as unknown as NetworkInternals;
    internals.role = 'host';
    const connection = new FakeConnection('peer-zombie');
    internals.wireGuestEvents(connection as unknown as DataConnection);
    const token = '12345678-1234-1234-1234-123456789abc';
    connection.emit('data', lobbyJoin(token));
    expect(network.confirmPlayerAdmission('player-1', token, 'connection_epoch_player_1')).toBe(true);
    const bundle = internals.guestBundles.get('player-1') as unknown as { lastValidMessageMonoMs: number };
    expect(network.activePlayerIds(12_000, bundle.lastValidMessageMonoMs + 11_999)).toEqual(['player-1']);
    expect(network.activePlayerIds(12_000, bundle.lastValidMessageMonoMs + 12_001)).toEqual([]);
    expect(connection.open).toBe(true);
  });
});
