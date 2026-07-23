import { DataConnection, Peer } from 'peerjs';
import {
  type GameMessage,
  isGameMessage,
  isHostAuthorityMessage,
  isStateTrafficMessage,
  messageBelongsToPlayer,
  type Team,
} from './protocol';
import { pingMatchesBoundTeam, shouldRelayMessageToTeam } from './social-ping';

export type NetworkRole = 'offline' | 'host' | 'client';

type MessageHandler = (message: GameMessage) => void;
type StatusHandler = (text: string, kind?: 'ok' | 'warn' | 'error') => void;
type ChannelKind = 'events' | 'state';

type GuestBundle = {
  playerId: string;
  peerId: string;
  team: Team;
  events: DataConnection;
  state: DataConnection | null;
};

type NetworkDiagnostics = Record<string, unknown> & {
  role: NetworkRole;
  eventChannels: number;
  stateChannels: number;
  stateChannelReliable: boolean | null;
  stateChannelOrdered: boolean | null;
  stateChannelMaxRetransmits: number | null;
  stateMessagesSent: number;
  stateMessagesRelayed: number;
  selfStateEchoesSuppressed: number;
  reconnectAttempts: number;
  stateFallbackActive: boolean;
  stateFallbackMessages: number;
};

const STATE_LABEL = 'atomic-acres-state-v1';
const EVENT_LABEL = 'atomic-acres-events-v1';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [500, 1_500, 3_000] as const;

function createArenaPeer(): Peer {
  const params = new URLSearchParams(window.location.search);
  const localQa = params.get('multiplayerQa') === '1' && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
  const port = Number(params.get('peerQaPort'));
  if (localQa && Number.isInteger(port) && port >= 1_024 && port <= 65_535) {
    return new Peer({
      host: window.location.hostname,
      port,
      path: '/peerjs',
      secure: false,
    });
  }
  return new Peer();
}

function channelKind(connection: DataConnection): ChannelKind {
  return connection.label === STATE_LABEL || connection.metadata?.channel === 'state' ? 'state' : 'events';
}

export function isCurrentGuestEventConnection(
  current: DataConnection | undefined,
  closing: DataConnection,
): boolean {
  return current === closing;
}

export function guestMessageEndsSession(message: GameMessage): boolean {
  return message.type === 'leave';
}

export function joinTimeoutAction(reconnecting: boolean): 'retry' | 'offline' {
  return reconnecting ? 'retry' : 'offline';
}

export function stateTrafficUsesFallback(stateOpen: boolean, eventOpen: boolean): boolean {
  return !stateOpen && eventOpen;
}

export function replaceGuestPeerOwner(
  owners: Map<string, string>,
  playerId: string,
  previousPeerId: string | undefined,
  nextPeerId: string,
): void {
  if (previousPeerId && previousPeerId !== nextPeerId) owners.delete(previousPeerId);
  owners.set(nextPeerId, playerId);
}

function connectLossyStateChannel(peer: Peer, roomCode: string): DataConnection {
  // PeerJS 1.5 only forwards `reliable` as RTCDataChannel.ordered. Intercept its
  // synchronous channel creation for this one labelled lane so stale movement is
  // never retransmitted behind current state. The receiver inherits these SCTP
  // properties from the DATA_CHANNEL_OPEN message.
  const prototype = RTCPeerConnection.prototype;
  const originalCreateDataChannel = prototype.createDataChannel;
  let intercepted = false;
  prototype.createDataChannel = function createAtomicStateChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
    if (label === STATE_LABEL) {
      intercepted = true;
      return originalCreateDataChannel.call(this, label, {
        ...options,
        ordered: false,
        maxRetransmits: 0,
      });
    }
    return originalCreateDataChannel.call(this, label, options);
  };
  try {
    const connection = peer.connect(roomCode, {
      label: STATE_LABEL,
      metadata: { channel: 'state' },
      reliable: false,
      serialization: 'json',
    });
    if (!intercepted) {
      connection.close();
      throw new Error('PeerJS did not synchronously create the transient state channel');
    }
    return connection;
  } finally {
    prototype.createDataChannel = originalCreateDataChannel;
  }
}

export class ArenaNetwork {
  role: NetworkRole = 'offline';
  roomCode = '';
  private peer: Peer | null = null;
  private hostEventConnection: DataConnection | null = null;
  private hostStateConnection: DataConnection | null = null;
  private guestBundles = new Map<string, GuestBundle>();
  private guestPeerOwners = new Map<string, string>();
  private pendingStateConnections = new Map<string, DataConnection>();
  private joinDeadline: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onMessage: MessageHandler;
  private onStatus: StatusHandler;
  private onReady: (() => void) | null = null;
  private maximumPlayers = 4;
  private manualClose = false;
  private reconnectAttempts = 0;
  private stateMessagesSent = 0;
  private stateMessagesRelayed = 0;
  private selfStateEchoesSuppressed = 0;
  private stateFallbackMessages = 0;

  constructor(onMessage: MessageHandler, onStatus: StatusHandler) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  setCapacity(maximumPlayers: 4 | 6): void {
    this.maximumPlayers = maximumPlayers;
  }

  setPlayerTeam(playerId: string, team: Team): void {
    const bundle = this.guestBundles.get(playerId);
    if (bundle) bundle.team = team;
  }

  host(onReady: () => void): void {
    this.close();
    this.manualClose = false;
    this.role = 'host';
    this.onReady = onReady;
    this.onStatus('Opening a secure peer lobby…');
    const peer = createArenaPeer();
    this.peer = peer;
    peer.on('open', (id) => {
      this.roomCode = id;
      this.onStatus('Lobby ready — share the invite after setup', 'ok');
      onReady();
    });
    peer.on('connection', (connection) => this.wireIncomingGuest(connection));
    peer.on('error', (error) => this.onStatus(this.describeError(error), 'error'));
    peer.on('disconnected', () => this.onStatus('Signalling disconnected; existing peers may continue', 'warn'));
  }

  join(roomCode: string, onReady: () => void): void {
    this.close();
    this.manualClose = false;
    this.role = 'client';
    this.roomCode = roomCode.trim();
    this.onReady = onReady;
    this.reconnectAttempts = 0;
    if (!this.roomCode) {
      this.role = 'offline';
      this.onReady = null;
      this.onStatus('Enter a room code first', 'error');
      return;
    }
    this.connectClient(false);
  }

  send(message: GameMessage, exceptPlayerId?: string): void {
    if (!isGameMessage(message)) return;
    if (this.role === 'host') {
      this.broadcast(message, exceptPlayerId);
    } else if (this.role === 'client') {
      const stateFallback = isStateTrafficMessage(message) && !this.hostStateConnection?.open;
      const connection = isStateTrafficMessage(message)
        ? this.hostStateConnection?.open ? this.hostStateConnection : this.hostEventConnection
        : this.hostEventConnection;
      if (connection?.open) {
        connection.send(message);
        if (isStateTrafficMessage(message)) this.stateMessagesSent += 1;
        if (stateFallback) this.stateFallbackMessages += 1;
      }
    }
  }

  sendToPlayer(playerId: string, message: GameMessage): boolean {
    if (this.role !== 'host' || !isGameMessage(message)) return false;
    const bundle = this.guestBundles.get(playerId);
    const stateFallback = isStateTrafficMessage(message) && !bundle?.state?.open;
    const connection = isStateTrafficMessage(message)
      ? bundle?.state?.open ? bundle.state : bundle?.events
      : bundle?.events;
    if (!connection?.open) return false;
    connection.send(message);
    if (isStateTrafficMessage(message)) this.stateMessagesRelayed += 1;
    if (stateFallback) this.stateFallbackMessages += 1;
    return true;
  }

  connectedPlayerIds(): string[] {
    return [...this.guestBundles.keys()];
  }

  disconnectPlayer(playerId: string): void {
    if (this.role !== 'host') return;
    const bundle = this.guestBundles.get(playerId);
    if (!bundle) return;
    try { bundle.events.close(); } catch { /* no-op */ }
    try { bundle.state?.close(); } catch { /* no-op */ }
    this.dropGuest(playerId, bundle.events);
  }

  degradeStateChannelForQa(): boolean {
    if (this.role !== 'client' || !this.hostStateConnection) return false;
    const connection = this.hostStateConnection;
    this.hostStateConnection = null;
    try { connection.close(); } catch { /* The reliable lane remains authoritative. */ }
    this.onStatus('Movement channel degraded; using reliable fallback', 'warn');
    return true;
  }

  diagnostics(): NetworkDiagnostics {
    const eventChannels = this.role === 'host'
      ? [...this.guestBundles.values()].filter((bundle) => bundle.events.open).length
      : Number(this.hostEventConnection?.open ?? false);
    const stateChannels = this.role === 'host'
      ? [...this.guestBundles.values()].filter((bundle) => bundle.state?.open).length
      : Number(this.hostStateConnection?.open ?? false);
    const clientStateReliable = this.hostStateConnection?.reliable;
    const hostStateConnection = [...this.guestBundles.values()].find((bundle) => bundle.state)?.state ?? null;
    const hostStateReliability = hostStateConnection?.reliable;
    const stateDataChannel = this.hostStateConnection?.dataChannel ?? hostStateConnection?.dataChannel ?? null;
    return {
      role: this.role,
      roomCodeLength: this.roomCode.length,
      peerPresent: this.peer !== null,
      peerOpen: this.peer?.open ?? false,
      peerDisconnected: this.peer?.disconnected ?? false,
      peerDestroyed: this.peer?.destroyed ?? false,
      hostConnectionPresent: this.hostEventConnection !== null,
      hostConnectionOpen: this.hostEventConnection?.open ?? false,
      guestConnections: this.guestBundles.size,
      boundGuestTeams: this.guestBundles.size,
      openGuestConnections: eventChannels,
      joinDeadlineActive: this.joinDeadline !== null,
      capacity: this.maximumPlayers,
      eventChannels,
      stateChannels,
      stateChannelReliable: clientStateReliable ?? hostStateReliability ?? null,
      stateChannelOrdered: stateDataChannel?.ordered ?? null,
      stateChannelMaxRetransmits: stateDataChannel?.maxRetransmits ?? null,
      stateMessagesSent: this.stateMessagesSent,
      stateMessagesRelayed: this.stateMessagesRelayed,
      selfStateEchoesSuppressed: this.selfStateEchoesSuppressed,
      reconnectAttempts: this.reconnectAttempts,
      pendingStateChannels: this.pendingStateConnections.size,
      stateFallbackActive: this.role === 'client'
        ? stateTrafficUsesFallback(Boolean(this.hostStateConnection?.open), Boolean(this.hostEventConnection?.open))
        : [...this.guestBundles.values()].some((bundle) => stateTrafficUsesFallback(Boolean(bundle.state?.open), bundle.events.open)),
      stateFallbackMessages: this.stateFallbackMessages,
    };
  }

  close(): void {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearJoinDeadline();
    try { this.hostEventConnection?.close(); } catch { /* no-op */ }
    try { this.hostStateConnection?.close(); } catch { /* no-op */ }
    for (const bundle of this.guestBundles.values()) {
      try { bundle.events.close(); } catch { /* no-op */ }
      try { bundle.state?.close(); } catch { /* no-op */ }
    }
    for (const connection of this.pendingStateConnections.values()) {
      try { connection.close(); } catch { /* no-op */ }
    }
    this.guestBundles.clear();
    this.guestPeerOwners.clear();
    this.pendingStateConnections.clear();
    this.hostEventConnection = null;
    this.hostStateConnection = null;
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* no-op */ }
    }
    this.peer = null;
    this.roomCode = '';
    this.role = 'offline';
    this.onReady = null;
  }

  private connectClient(reconnecting: boolean): void {
    if (this.manualClose || this.role !== 'client') return;
    this.clearJoinDeadline();
    this.onStatus(reconnecting ? `Reconnecting to host (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…` : 'Connecting to peer lobby…', reconnecting ? 'warn' : undefined);
    this.joinDeadline = setTimeout(() => {
      if (this.role !== 'client' || this.channelsReady()) return;
      this.destroyClientTransport();
      if (joinTimeoutAction(reconnecting) === 'retry') {
        this.scheduleReconnect('Connection timed out');
      } else {
        this.role = 'offline';
        this.roomCode = '';
        this.onReady = null;
        this.onStatus('Connection timed out. Check the room code and try again.', 'error');
      }
    }, 12_000);
    const peer = createArenaPeer();
    this.peer = peer;
    peer.on('open', () => {
      if (this.manualClose || this.role !== 'client') return;
      const events = peer.connect(this.roomCode, {
        label: EVENT_LABEL,
        metadata: { channel: 'events' },
        reliable: true,
        serialization: 'json',
      });
      this.hostEventConnection = events;
      this.wireHostChannel(events, 'events');
      try {
        const state = connectLossyStateChannel(peer, this.roomCode);
        this.hostStateConnection = state;
        this.wireHostChannel(state, 'state');
      } catch {
        this.hostStateConnection = null;
        this.onStatus('Movement channel degraded; using reliable fallback', 'warn');
      }
    });
    peer.on('error', (error) => this.onStatus(this.describeError(error), 'error'));
    peer.on('disconnected', () => {
      if (this.role === 'client') this.onStatus('Signalling disconnected; preserving active data channels', 'warn');
    });
  }

  private wireIncomingGuest(connection: DataConnection): void {
    if (this.role !== 'host') {
      connection.close();
      return;
    }
    if (channelKind(connection) === 'state') {
      this.wireGuestState(connection);
      return;
    }
    this.wireGuestEvents(connection);
  }

  private wireGuestEvents(connection: DataConnection): void {
    let playerId = '';
    connection.on('data', (payload) => {
      if (!isGameMessage(payload)) return;
      if (!playerId) {
        if (payload.type !== 'lobby-join' && payload.type !== 'join') return;
        const requestedId = payload.type === 'lobby-join' ? payload.playerId : payload.player.id;
        const requestedTeam = payload.type === 'lobby-join' ? payload.requestedTeam : payload.player.team;
        const existing = this.guestBundles.get(requestedId);
        if (existing?.events.open) {
          this.rejectConnection(connection, 'identity-in-use');
          return;
        }
        if (!existing && this.guestBundles.size >= this.maximumPlayers - 1) {
          this.rejectConnection(connection, 'room-full');
          return;
        }
        playerId = requestedId;
        const bundle: GuestBundle = {
          playerId,
          peerId: connection.peer,
          team: requestedTeam,
          events: connection,
          state: this.pendingStateConnections.get(connection.peer) ?? null,
        };
        this.pendingStateConnections.delete(connection.peer);
        this.guestBundles.set(playerId, bundle);
        replaceGuestPeerOwner(this.guestPeerOwners, playerId, existing?.peerId, connection.peer);
        this.onStatus(`${this.guestBundles.size} guest connection${this.guestBundles.size === 1 ? '' : 's'}`, 'ok');
        this.onMessage(payload);
        return;
      }
      if (isHostAuthorityMessage(payload) || !messageBelongsToPlayer(payload, playerId)) return;
      if (payload.type === 'state') {
        // The sender selects exactly one lane. Always admit state arriving on
        // the reliable lane so a remotely closed transient channel cannot
        // leave the host believing the stale channel is still usable.
        this.onMessage(payload);
        return;
      }
      if (payload.type === 'overdrive-state' || payload.type === 'death') return;
      if (guestMessageEndsSession(payload)) {
        this.dropGuest(playerId, connection);
        try { connection.close(); } catch { /* no-op */ }
        return;
      }
      if (payload.type === 'overdrive-claim' || payload.type === 'hit'
        || payload.type === 'join' || payload.type === 'shot' || payload.type === 'melee'
        || payload.type === 'support-activate' || payload.type === 'grenade-throw'
        || payload.type === 'lobby-ready' || payload.type === 'lobby-team'
        || payload.type === 'lobby-balance' || payload.type === 'clock-ping') {
        this.onMessage(payload);
        return;
      }
      if (payload.type === 'ping' && !pingMatchesBoundTeam(payload, this.guestBundles.get(playerId)?.team)) return;
      this.onMessage(payload);
      this.broadcast(payload, playerId);
    });
    connection.on('close', () => this.dropGuest(playerId, connection));
    connection.on('error', () => this.onStatus('Guest event channel failed', 'error'));
  }

  private wireGuestState(connection: DataConnection): void {
    this.pendingStateConnections.set(connection.peer, connection);
    const owner = this.guestPeerOwners.get(connection.peer);
    if (owner) {
      const bundle = this.guestBundles.get(owner);
      if (bundle) bundle.state = connection;
      this.pendingStateConnections.delete(connection.peer);
    }
    connection.on('open', () => {
      const boundOwner = this.guestPeerOwners.get(connection.peer);
      const bundle = boundOwner ? this.guestBundles.get(boundOwner) : undefined;
      if (bundle) {
        bundle.state = connection;
        this.pendingStateConnections.delete(connection.peer);
      }
    });
    connection.on('data', (payload) => {
      if (!isGameMessage(payload) || payload.type !== 'state') return;
      const playerId = this.guestPeerOwners.get(connection.peer);
      if (!playerId || !messageBelongsToPlayer(payload, playerId)) return;
      this.onMessage(payload);
    });
    connection.on('close', () => {
      this.pendingStateConnections.delete(connection.peer);
      const playerId = this.guestPeerOwners.get(connection.peer);
      const bundle = playerId ? this.guestBundles.get(playerId) : undefined;
      if (bundle?.state === connection) bundle.state = null;
    });
    connection.on('error', () => this.onStatus('Guest movement channel degraded', 'warn'));
  }

  private wireHostChannel(connection: DataConnection, kind: ChannelKind): void {
    connection.on('open', () => this.maybeClientReady());
    connection.on('data', (payload) => {
      if (!isGameMessage(payload)) return;
      if (kind === 'state' && !isStateTrafficMessage(payload)) return;
      this.onMessage(payload);
    });
    connection.on('close', () => {
      if (this.manualClose || this.role !== 'client') return;
      if (kind === 'events') this.scheduleReconnect('Host connection closed');
      else {
        if (this.hostStateConnection === connection) this.hostStateConnection = null;
        this.onStatus('Movement channel degraded; using reliable fallback', 'warn');
      }
    });
    connection.on('error', () => {
      if (kind === 'events') this.onStatus('Could not establish peer event channel', 'error');
      else this.onStatus('Could not establish movement channel', 'warn');
    });
  }

  private maybeClientReady(): void {
    if (!this.channelsReady()) return;
    this.clearJoinDeadline();
    this.reconnectAttempts = 0;
    this.onStatus('Connected to host', 'ok');
    this.onReady?.();
  }

  private channelsReady(): boolean {
    return Boolean(this.hostEventConnection?.open);
  }

  private scheduleReconnect(reason: string): void {
    if (this.manualClose || this.role !== 'client' || this.reconnectTimer) return;
    this.destroyClientTransport();
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.role = 'offline';
      this.roomCode = '';
      this.onReady = null;
      this.onStatus(`${reason}. Rejoin from the lobby.`, 'error');
      return;
    }
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempts] ?? RECONNECT_DELAYS_MS.at(-1)!;
    this.reconnectAttempts += 1;
    this.onStatus(`${reason}; retrying…`, 'warn');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectClient(true);
    }, delay);
  }

  private destroyClientTransport(): void {
    this.clearJoinDeadline();
    try { this.hostEventConnection?.close(); } catch { /* no-op */ }
    try { this.hostStateConnection?.close(); } catch { /* no-op */ }
    this.hostEventConnection = null;
    this.hostStateConnection = null;
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* no-op */ }
    }
    this.peer = null;
  }

  private dropGuest(playerId: string, connection: DataConnection): void {
    const peerId = connection.peer;
    if (!playerId) {
      this.pendingStateConnections.delete(peerId);
      return;
    }
    const bundle = this.guestBundles.get(playerId);
    // A close callback can arrive after a same-peer reconnect installed a
    // replacement bundle. Stable peer IDs cannot distinguish those sessions.
    if (!bundle || !isCurrentGuestEventConnection(bundle.events, connection)) return;
    this.guestBundles.delete(playerId);
    this.guestPeerOwners.delete(peerId);
    this.pendingStateConnections.delete(peerId);
    try { bundle.state?.close(); } catch { /* no-op */ }
    const leave: GameMessage = { type: 'leave', playerId };
    this.onMessage(leave);
    this.broadcast(leave, playerId);
    this.onStatus('A guest disconnected; rejoin slot held briefly', 'warn');
  }

  private rejectConnection(connection: DataConnection, reason: 'room-full' | 'identity-in-use'): void {
    if (connection.open) connection.send({ type: 'lobby-reject', reason, nonce: Date.now() } satisfies GameMessage);
    window.setTimeout(() => connection.close(), 50);
  }

  private broadcast(message: GameMessage, exceptPlayerId?: string): void {
    for (const bundle of this.guestBundles.values()) {
      if (bundle.playerId === exceptPlayerId) {
        if (isStateTrafficMessage(message)) this.selfStateEchoesSuppressed += 1;
        continue;
      }
      if (!shouldRelayMessageToTeam(message, bundle.team)) continue;
      const stateFallback = isStateTrafficMessage(message) && !bundle.state?.open;
      const connection = isStateTrafficMessage(message)
        ? bundle.state?.open ? bundle.state : bundle.events
        : bundle.events;
      if (!connection?.open) continue;
      connection.send(message);
      if (isStateTrafficMessage(message)) this.stateMessagesRelayed += 1;
      if (stateFallback) this.stateFallbackMessages += 1;
    }
  }

  private clearJoinDeadline(): void {
    if (this.joinDeadline) clearTimeout(this.joinDeadline);
    this.joinDeadline = null;
  }

  private describeError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    if (/peer-unavailable/i.test(text)) return 'Room not found. Check the code and try again.';
    if (/network|server/i.test(text)) return 'Peer signalling is unavailable. Check the connection and retry.';
    return `Network error: ${text.slice(0, 120)}`;
  }
}
