import { DataConnection, Peer } from 'peerjs';
import {
  type GameMessage,
  isGameMessage,
  isHostAuthorityMessage,
  isStateTrafficMessage,
  messageBelongsToPlayer,
  type LeaveMessage,
  type Team,
} from './protocol';
import { pingMatchesBoundTeam, shouldRelayMessageToTeam } from './social-ping';
import { clientRuntimeLogEntryFromError, type ClientRuntimeLogEntry } from './client-runtime-log';

export type NetworkRole = 'offline' | 'host' | 'client';

export type NetworkConnectionAttempt = Readonly<{
  kind: 'host' | 'join';
  key: string;
}>;

export type ArenaPeerFactory = (preferredId?: string) => Peer;

type MessageHandler = (message: GameMessage) => void;
type StatusHandler = (text: string, kind?: 'ok' | 'warn' | 'error') => void;
type DiagnosticHandler = (entry: Omit<ClientRuntimeLogEntry, 'timestamp'>) => void;
type ChannelKind = 'events' | 'state';

export const LOCAL_MULTIPLAYER_QA_HOST_DAMAGE_RESULT_EVENT = 'atomic-acres:qa-host-killstreak-damage-result';

type GuestBundle = {
  playerId: string;
  peerId: string;
  transportEpoch: string | null;
  transportGeneration: number;
  connectionEpoch: string;
  resumeToken: string;
  admitted: boolean;
  team: Team;
  events: DataConnection;
  state: DataConnection | null;
  lastValidMessageMonoMs: number;
};

type LobbyRejectReason = Extract<GameMessage, { type: 'lobby-reject' }>['reason'];

type LiveConnectionAttempt = NetworkConnectionAttempt & {
  id: number;
  phase: 'pending' | 'active';
};

type NetworkDiagnostics = Record<string, unknown> & {
  role: NetworkRole;
  eventChannels: number;
  eventChannelOrdered: boolean | null;
  eventLaneBufferedBytes: number;
  eventLaneBufferedPressure: number;
  stateChannels: number;
  stateChannelReliable: boolean | null;
  stateChannelOrdered: boolean | null;
  stateChannelMaxRetransmits: number | null;
  stateMessagesSent: number;
  stateMessagesRelayed: number;
  reliableStateCommitMirrors: number;
  selfStateEchoesSuppressed: number;
  reconnectAttempts: number;
  clientHostLivenessWatchdogActive: boolean;
  clientHostSilenceAgeMs: number | null;
  clientHostProbeGraceRemainingMs: number;
  clientHostLivenessRecoveries: number;
  stateFallbackActive: boolean;
  stateFallbackMessages: number;
  qaEventDelayMs: number;
  qaEventJitterMs: number;
};

const STATE_LABEL = 'atomic-acres-state-v1';
const EVENT_LABEL = 'atomic-acres-events-v1';
const RECONNECT_WINDOW_MS = 90_000;
const RECONNECT_DELAYS_MS = [500, 1_500, 3_000, 5_000] as const;
const HOST_ROOM_RECLAIM_DELAYS_MS = [350, 750, 1_500, 2_500, 4_000] as const;
export const HOST_ROOM_RECLAIM_WINDOW_MS = 60_000;
export const CLIENT_HOST_SILENCE_TIMEOUT_MS = 15_000;
const CLIENT_HOST_LIVENESS_POLL_MS = 1_000;
export const CLIENT_HOST_LIVENESS_MAX_SCHEDULING_GAP_MS = CLIENT_HOST_LIVENESS_POLL_MS * 3;
const CLIENT_TRANSPORT_GENERATION_RESOLUTION = 1_000;
const CLIENT_TRANSPORT_GENERATION_STORAGE_KEY = 'atomic-acres.transport-generation.v1';
let lastClientTransportGeneration = 0;

export type ClientHostLivenessSample = Readonly<{
  activeClient: boolean;
  eventChannelOpen: boolean;
  documentHidden: boolean;
  reconnectPending: boolean;
  lastValidHostMessageMonoMs: number | null;
  foregroundProbeGraceUntilMonoMs: number | null;
  nowMonoMs: number;
}>;

export type ClientHostLivenessDecisionSample = ClientHostLivenessSample & Readonly<{
  lastWatchdogCheckMonoMs: number | null;
}>;

export type ClientHostLivenessDecision = 'hold' | 'grant-probe-grace' | 'reconnect';

export function clientHostLivenessExpired(sample: ClientHostLivenessSample): boolean {
  if (!sample.activeClient || !sample.eventChannelOpen || sample.documentHidden || sample.reconnectPending) return false;
  if (sample.lastValidHostMessageMonoMs === null || sample.foregroundProbeGraceUntilMonoMs === null) return false;
  return sample.nowMonoMs >= sample.foregroundProbeGraceUntilMonoMs
    && sample.nowMonoMs - sample.lastValidHostMessageMonoMs >= CLIENT_HOST_SILENCE_TIMEOUT_MS;
}

export function clientHostLivenessDecision(sample: ClientHostLivenessDecisionSample): ClientHostLivenessDecision {
  if (!sample.activeClient || !sample.eventChannelOpen || sample.documentHidden || sample.reconnectPending) return 'hold';
  if (sample.lastWatchdogCheckMonoMs !== null
    && sample.nowMonoMs - sample.lastWatchdogCheckMonoMs > CLIENT_HOST_LIVENESS_MAX_SCHEDULING_GAP_MS) {
    return 'grant-probe-grace';
  }
  return clientHostLivenessExpired(sample) ? 'reconnect' : 'hold';
}

/**
 * A client creates the ordering value before opening either PeerJS lane. Epoch
 * microseconds make a reload newer than the document it replaces; the process
 * local increment makes repeated attempts from one document strictly ordered.
 */
export function nextTransportGeneration(timeOriginMs = performance.timeOrigin): number {
  const epochMicros = Math.floor(timeOriginMs * CLIENT_TRANSPORT_GENERATION_RESOLUTION);
  if (!Number.isSafeInteger(epochMicros) || epochMicros <= 0) {
    throw new Error('Could not create a safe client transport generation');
  }
  let persistedGeneration = 0;
  try {
    const persisted = typeof sessionStorage === 'undefined'
      ? Number.NaN
      : Number(sessionStorage.getItem(CLIENT_TRANSPORT_GENERATION_STORAGE_KEY));
    if (Number.isSafeInteger(persisted) && persisted > 0) persistedGeneration = persisted;
  } catch {
    // Storage can be disabled; document-local ordering still protects retries.
  }
  const generation = Math.max(epochMicros, lastClientTransportGeneration + 1, persistedGeneration + 1);
  if (!Number.isSafeInteger(generation)) throw new Error('Client transport generation exceeded the safe integer range');
  lastClientTransportGeneration = generation;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(CLIENT_TRANSPORT_GENERATION_STORAGE_KEY, String(generation));
    }
  } catch {
    // The generation remains valid even when persistence is unavailable.
  }
  return generation;
}

export function hostRoomReclaimAction(
  recoveryRequired: boolean,
  attempt: number,
): Readonly<{ action: 'retry'; delayMs: number } | { action: 'fresh' | 'fail'; delayMs: 0 }> {
  if (!recoveryRequired) return { action: 'fresh', delayMs: 0 };
  if (!Number.isSafeInteger(attempt) || attempt < 0) return { action: 'fail', delayMs: 0 };
  const delayMs = HOST_ROOM_RECLAIM_DELAYS_MS[Math.min(attempt, HOST_ROOM_RECLAIM_DELAYS_MS.length - 1)]!;
  const rampTotalMs = HOST_ROOM_RECLAIM_DELAYS_MS.reduce((sum, delay, index) => (
    index < attempt ? sum + delay : sum
  ), 0);
  const saturatedAttempts = Math.max(0, attempt - HOST_ROOM_RECLAIM_DELAYS_MS.length);
  const elapsedBeforeDelayMs = rampTotalMs
    + saturatedAttempts * HOST_ROOM_RECLAIM_DELAYS_MS[HOST_ROOM_RECLAIM_DELAYS_MS.length - 1];
  return elapsedBeforeDelayMs + delayMs > HOST_ROOM_RECLAIM_WINDOW_MS
    ? { action: 'fail', delayMs: 0 }
    : { action: 'retry', delayMs };
}

export function hostConnectionAttemptKey(preferredRoomCode?: string, recoveryRequired = false): string {
  return JSON.stringify(['host', recoveryRequired ? 'recover' : 'create', preferredRoomCode?.trim() || null]);
}

export function joinConnectionAttemptKey(roomCode: string): string {
  return JSON.stringify(['join', roomCode.trim()]);
}

export function localQaPeerPath(value: string | null): string {
  return value !== null && /^\/peerjs-[a-f0-9]{24}$/.test(value) ? value : '/peerjs';
}

export function localQaRtcConfiguration(): RTCConfiguration {
  // Owned localhost QA peers never require NAT traversal. Inheriting PeerJS's
  // public STUN/TURN defaults adds external DNS/network variance to a gate
  // whose signalling and media path are intentionally machine-local.
  return { iceServers: [] };
}

function createArenaPeer(preferredId?: string): Peer {
  const params = new URLSearchParams(window.location.search);
  const localQa = params.get('multiplayerQa') === '1' && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
  const port = Number(params.get('peerQaPort'));
  if (localQa && Number.isInteger(port) && port >= 1_024 && port <= 65_535) {
    const options = {
      host: window.location.hostname,
      port,
      path: localQaPeerPath(params.get('peerQaPath')),
      secure: false,
      config: localQaRtcConfiguration(),
    };
    return preferredId ? new Peer(preferredId, options) : new Peer(options);
  }
  return preferredId ? new Peer(preferredId) : new Peer();
}

function localMultiplayerQaEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('multiplayerQa') === '1'
    && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
}

function publishHostDamageResultForLocalQa(message: Extract<GameMessage, { type: 'killstreak-damage-result' }>): void {
  if (!localMultiplayerQaEnabled()) return;
  const detail = Object.freeze({
    by: message.by,
    matchEpoch: message.matchEpoch,
    revision: message.revision,
    nonce: message.nonce,
    events: Object.freeze(message.events.map((event) => Object.freeze({
      resultId: event.resultId,
      activationId: event.activationId,
      source: event.source,
      targetId: event.targetId,
      atMs: event.atMs,
    }))),
  });
  window.dispatchEvent(new CustomEvent(LOCAL_MULTIPLAYER_QA_HOST_DAMAGE_RESULT_EVENT, { detail }));
}

function qaEventImpairment(): Readonly<{ delayMs: number; jitterMs: number }> {
  const params = new URLSearchParams(window.location.search);
  if (!localMultiplayerQaEnabled()) return { delayMs: 0, jitterMs: 0 };
  const delayMs = Math.max(0, Math.min(250, Number(params.get('eventDelayQaMs')) || 0));
  const jitterMs = Math.max(0, Math.min(100, Number(params.get('eventJitterQaMs')) || 0));
  return { delayMs, jitterMs };
}

function channelKind(connection: DataConnection): ChannelKind {
  return connection.label === STATE_LABEL || connection.metadata?.channel === 'state' ? 'state' : 'events';
}

function connectionTransportEpoch(connection: DataConnection): string | null {
  const epoch = connection.metadata?.transportEpoch;
  return typeof epoch === 'string'
    && epoch.length >= 8
    && epoch.length <= 128
    && /^[a-zA-Z0-9_-]+$/.test(epoch)
    ? epoch
    : null;
}

function connectionTransportGeneration(connection: DataConnection): number | null {
  const generation = connection.metadata?.transportGeneration;
  return Number.isSafeInteger(generation) && generation > 0 ? generation : null;
}

function pendingStateConnectionKey(
  peerId: string,
  transportEpoch: string | null,
  transportGeneration: number | null,
): string {
  return JSON.stringify([peerId, transportEpoch, transportGeneration]);
}

export function isCurrentGuestEventConnection(
  current: DataConnection | undefined,
  closing: DataConnection,
): boolean {
  return current === closing;
}

export function isCurrentGuestStateConnection(
  current: DataConnection | null | undefined,
  candidate: DataConnection,
): boolean {
  return current === candidate;
}

export function isCurrentClientConnection(
  current: DataConnection | null,
  candidate: DataConnection,
): boolean {
  return current === candidate;
}

export function activeGuestCanBeReplaced(
  existingOpen: boolean,
  knownResumeToken: string | undefined,
  incomingResumeToken: string | undefined,
): boolean {
  return existingOpen && Boolean(knownResumeToken && incomingResumeToken && knownResumeToken === incomingResumeToken);
}

/** Bind the first credential for a player, or admit an exact retained-token
 * reconnect. A mismatch never overwrites the credential that owns the slot. */
export function bindGuestResumeToken(
  tokens: Map<string, string>,
  playerId: string,
  incomingResumeToken: string,
): boolean {
  const knownResumeToken = tokens.get(playerId);
  if (knownResumeToken !== undefined && knownResumeToken !== incomingResumeToken) return false;
  tokens.set(playerId, incomingResumeToken);
  return true;
}

export function guestMessageEndsSession(message: GameMessage): message is LeaveMessage {
  return message.type === 'leave';
}

/** Preserve only the authenticated transport identity and the intentional-leave
 * bit. The guest cannot use a leave payload to evict another player. */
export function boundGuestLeave(playerId: string, voluntary = false): LeaveMessage {
  return voluntary
    ? { type: 'leave', playerId, voluntary: true }
    : { type: 'leave', playerId };
}

export function joinTimeoutAction(reconnecting: boolean): 'retry' | 'offline' {
  return reconnecting ? 'retry' : 'offline';
}

export function stateTrafficUsesFallback(stateOpen: boolean, eventOpen: boolean): boolean {
  return !stateOpen && eventOpen;
}

export function initialLobbyJoinHasProtocolMismatch(payload: unknown): boolean {
  return Boolean(payload && typeof payload === 'object'
    && (payload as { type?: unknown }).type === 'lobby-join'
    && !isGameMessage(payload));
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

function connectLossyStateChannel(
  peer: Peer,
  roomCode: string,
  transportEpoch: string,
  transportGeneration: number,
): DataConnection {
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
      metadata: { channel: 'state', transportEpoch, transportGeneration },
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
  /**
   * A reconnect cannot own the live slot until application-level credential
   * verification completes. Keeping it separate lets the admitted transport
   * continue serving traffic while an asynchronous digest check is pending.
   */
  private provisionalGuestReplacements = new Map<string, GuestBundle>();
  private guestPeerOwners = new Map<string, string>();
  private guestResumeTokens = new Map<string, string>();
  private guestTransportGenerations = new Map<string, number>();
  private pendingStateConnections = new Map<string, DataConnection>();
  private joinDeadline: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onMessage: MessageHandler;
  private onStatus: StatusHandler;
  private onDiagnostic: DiagnosticHandler;
  private onReady: (() => void) | null = null;
  private maximumPlayers = 4;
  private manualClose = false;
  private reconnectAttempts = 0;
  private reconnectDeadlineMonoMs: number | null = null;
  private clientHostLivenessTimer: number | null = null;
  private lastValidHostMessageMonoMs: number | null = null;
  private foregroundProbeGraceUntilMonoMs: number | null = null;
  private clientHostLivenessRecoveries = 0;
  private stateMessagesSent = 0;
  private stateMessagesRelayed = 0;
  private reliableStateCommitMirrors = 0;
  private selfStateEchoesSuppressed = 0;
  private stateFallbackMessages = 0;
  private clientReadyNotified = false;
  private lastClientHostLivenessCheckMonoMs: number | null = null;
  private qaEventSendSequence = 0;
  private qaEventLastDue = new WeakMap<DataConnection, number>();
  private connectionAttemptSequence = 0;
  private liveConnectionAttempt: LiveConnectionAttempt | null = null;
  private readonly peerFactory: ArenaPeerFactory;
  private readonly grantForegroundProbeGrace = (): void => {
    if (this.manualClose || this.role !== 'client') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.foregroundProbeGraceUntilMonoMs = performance.now() + CLIENT_HOST_SILENCE_TIMEOUT_MS;
  };

  constructor(
    onMessage: MessageHandler,
    onStatus: StatusHandler,
    onDiagnostic: DiagnosticHandler = () => undefined,
    peerFactory: ArenaPeerFactory = createArenaPeer,
  ) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onDiagnostic = onDiagnostic;
    this.peerFactory = peerFactory;
  }

  setCapacity(maximumPlayers: 4 | 6): void {
    this.maximumPlayers = maximumPlayers;
  }

  setPlayerTeam(playerId: string, team: Team): void {
    const bundle = this.guestBundles.get(playerId);
    if (bundle) bundle.team = team;
  }

  forgetPlayerRejoinCredential(playerId: string): void {
    if (this.role === 'host') {
      this.guestResumeTokens.delete(playerId);
      this.guestTransportGenerations.delete(playerId);
    }
  }

  /** Promote the exact provisional credential only after the lobby authority has
   * completed any asynchronous digest verification. Until this call, no guest
   * traffic other than the initial lobby-join can enter gameplay. */
  confirmPlayerAdmission(playerId: string, resumeToken: string, connectionEpoch: string): boolean {
    if (this.role !== 'host') return false;
    const replacement = this.provisionalGuestReplacements.get(playerId);
    if (replacement && replacement.resumeToken === resumeToken && replacement.connectionEpoch === connectionEpoch) {
      const previous = this.guestBundles.get(playerId);
      replacement.admitted = true;
      this.provisionalGuestReplacements.delete(playerId);
      this.guestBundles.set(playerId, replacement);
      // The prior active close callback may have run while this same-peer
      // replacement was still provisional. Promotion must always restore the
      // reverse owner index used to bind the state lane.
      this.guestPeerOwners.set(replacement.peerId, playerId);
      if (previous) {
        if (previous.peerId !== replacement.peerId && this.guestPeerOwners.get(previous.peerId) === playerId) {
          this.guestPeerOwners.delete(previous.peerId);
        }
        try { previous.events.close(); } catch { /* The admitted replacement already owns the slot. */ }
        if (previous.state !== replacement.state) {
          try { previous.state?.close(); } catch { /* The admitted replacement already owns the state lane. */ }
        }
      }
      return true;
    }
    const bundle = this.guestBundles.get(playerId);
    if (!bundle || bundle.resumeToken !== resumeToken || bundle.connectionEpoch !== connectionEpoch) return false;
    bundle.admitted = true;
    return true;
  }

  /** Reject only the currently provisional credential. A failed recovered-host
   * digest must release its transport token without evicting an already
   * admitted replacement or poisoning the identity for a later valid retry. */
  rejectPlayerAdmission(
    playerId: string,
    resumeToken: string,
    connectionEpoch: string,
    reason: LobbyRejectReason,
  ): boolean {
    if (this.role !== 'host') return false;
    const replacement = this.provisionalGuestReplacements.get(playerId);
    if (replacement && replacement.resumeToken === resumeToken && replacement.connectionEpoch === connectionEpoch) {
      if (replacement.events.open) {
        this.transmit(replacement.events, { type: 'lobby-reject', reason, nonce: Date.now() } satisfies GameMessage, false);
      }
      this.provisionalGuestReplacements.delete(playerId);
      const active = this.guestBundles.get(playerId);
      if (active?.peerId !== replacement.peerId && this.guestPeerOwners.get(replacement.peerId) === playerId) {
        this.guestPeerOwners.delete(replacement.peerId);
      }
      this.pendingStateConnections.delete(pendingStateConnectionKey(
        replacement.peerId,
        replacement.transportEpoch,
        replacement.transportGeneration,
      ));
      window.setTimeout(() => {
        try { replacement.state?.close(); } catch { /* no-op */ }
        try { replacement.events.close(); } catch { /* no-op */ }
      }, 50);
      return true;
    }
    const bundle = this.guestBundles.get(playerId);
    if (!bundle || bundle.admitted || bundle.resumeToken !== resumeToken || bundle.connectionEpoch !== connectionEpoch) return false;
    if (bundle.events.open) {
      this.transmit(bundle.events, { type: 'lobby-reject', reason, nonce: Date.now() } satisfies GameMessage, false);
    }
    this.guestBundles.delete(playerId);
    if (this.guestPeerOwners.get(bundle.peerId) === playerId) this.guestPeerOwners.delete(bundle.peerId);
    this.pendingStateConnections.delete(pendingStateConnectionKey(
      bundle.peerId,
      bundle.transportEpoch,
      bundle.transportGeneration,
    ));
    if (this.guestResumeTokens.get(playerId) === resumeToken) this.guestResumeTokens.delete(playerId);
    if (this.guestTransportGenerations.get(playerId) === bundle.transportGeneration) {
      this.guestTransportGenerations.delete(playerId);
    }
    window.setTimeout(() => {
      try { bundle.state?.close(); } catch { /* no-op */ }
      try { bundle.events.close(); } catch { /* no-op */ }
    }, 50);
    return true;
  }

  pendingConnectionAttempt(): NetworkConnectionAttempt | null {
    const attempt = this.liveConnectionAttempt;
    return attempt?.phase === 'pending' ? { kind: attempt.kind, key: attempt.key } : null;
  }

  host(onReady: () => void, preferredRoomCode?: string, recoveryRequired = false): void {
    const preferred = preferredRoomCode?.trim() ?? '';
    const attempt = this.beginExplicitConnectionAttempt('host', hostConnectionAttemptKey(preferred, recoveryRequired));
    if (!attempt) return;
    this.manualClose = false;
    this.role = 'host';
    this.onReady = onReady;
    this.onStatus('Opening a secure peer lobby…');
    // A crashed host must reclaim the previous room code so guests who still
    // have it saved rejoin the same lobby. Fresh hosts may fall back to a random
    // room, but recovery retains the exact ID throughout its bounded retries.
    this.startHostPeer(attempt, onReady, preferred, recoveryRequired, 0);
  }

  private startHostPeer(
    attempt: LiveConnectionAttempt,
    onReady: () => void,
    preferred: string,
    recoveryRequired: boolean,
    reclaimAttempt: number,
  ): void {
    if (!this.isCurrentConnectionAttempt(attempt) || this.role !== 'host' || this.manualClose) return;
    let peer: Peer;
    try {
      peer = preferred ? this.peerFactory(preferred) : this.peerFactory();
    } catch (error) {
      this.reportNetworkIssue('peerjs:host-create', error, 'Host signalling could not start');
      this.onStatus(this.describeError(error), 'error');
      this.closeCurrentConnectionAttempt(attempt);
      return;
    }
    this.peer = peer;
    peer.on('open', (id) => {
      if (this.peer !== peer || !this.isCurrentConnectionAttempt(attempt) || this.role !== 'host' || this.manualClose) return;
      const signallingRestored = this.roomCode.length > 0;
      this.roomCode = id;
      this.markConnectionAttemptActive(attempt);
      this.onStatus(signallingRestored ? 'Lobby signalling restored' : 'Lobby ready — share the invite after setup', 'ok');
      if (!signallingRestored) onReady();
    });
    peer.on('connection', (connection) => {
      if (this.peer === peer && this.isCurrentConnectionAttempt(attempt) && this.role === 'host' && !this.manualClose) this.wireIncomingGuest(connection);
      else connection.close();
    });
    peer.on('error', (error) => {
      if (this.peer !== peer || !this.isCurrentConnectionAttempt(attempt) || this.role !== 'host' || this.manualClose) return;
      this.reportNetworkIssue('peerjs:host-signalling', error, 'Host signalling failed');
      if (preferred && (error as { type?: string }).type === 'unavailable-id') {
        const reclaim = hostRoomReclaimAction(recoveryRequired, reclaimAttempt);
        if (reclaim.action === 'retry') {
          this.onStatus(`Previous room code is still releasing; retrying in ${reclaim.delayMs} ms`, 'warn');
          this.destroyPeerForAttemptRetry(peer, attempt);
          window.setTimeout(() => {
            if (this.isCurrentConnectionAttempt(attempt) && this.role === 'host' && !this.manualClose) {
              this.startHostPeer(attempt, onReady, preferred, true, reclaimAttempt + 1);
            }
          }, reclaim.delayMs);
          return;
        }
        if (reclaim.action === 'fail') {
          this.onStatus('Could not safely reclaim the previous room yet. Try Resume Hosted Match again.', 'error');
          this.close();
          return;
        }
        this.onStatus('Previous room code is still locked — opening a fresh lobby', 'warn');
        this.destroyPeerForAttemptRetry(peer, attempt);
        this.startHostPeer(attempt, onReady, '', false, 0);
        return;
      }
      this.onStatus(this.describeError(error), 'error');
      if (attempt.phase === 'pending') this.closeCurrentConnectionAttempt(attempt);
    });
    peer.on('disconnected', () => {
      if (this.peer !== peer || !this.isCurrentConnectionAttempt(attempt) || this.role !== 'host' || this.manualClose) return;
      this.onStatus('Lobby signalling interrupted; reconnecting while active data channels continue', 'warn');
      try { peer.reconnect(); } catch (error) {
        this.reportNetworkIssue('peerjs:host-reconnect', error, 'Host signalling reconnect failed');
        // Active data channels remain usable if signalling recovery fails.
      }
    });
  }

  join(roomCode: string, onReady: () => void): void {
    const normalizedRoomCode = roomCode.trim();
    const attempt = this.beginExplicitConnectionAttempt('join', joinConnectionAttemptKey(normalizedRoomCode));
    if (!attempt) return;
    this.manualClose = false;
    this.role = 'client';
    this.roomCode = normalizedRoomCode;
    this.onReady = onReady;
    this.reconnectAttempts = 0;
    if (!this.roomCode) {
      this.role = 'offline';
      this.onReady = null;
      this.finishConnectionAttempt(attempt);
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
        this.transmit(connection, message, isStateTrafficMessage(message));
        if (isStateTrafficMessage(message)) this.stateMessagesSent += 1;
        if (stateFallback) this.stateFallbackMessages += 1;
      }
    }
  }

  sendStateCommitReliably(message: GameMessage, exceptPlayerId?: string): void {
    if (!isGameMessage(message) || !isStateTrafficMessage(message)) return;
    if (this.role === 'host') {
      for (const bundle of this.guestBundles.values()) {
        if (!bundle.admitted || bundle.playerId === exceptPlayerId || !shouldRelayMessageToTeam(message, bundle.team)) continue;
        if (!bundle.events.open) continue;
        this.transmit(bundle.events, message, false);
        this.reliableStateCommitMirrors += 1;
      }
    } else if (this.role === 'client' && this.hostEventConnection?.open) {
      this.transmit(this.hostEventConnection, message, false);
      this.reliableStateCommitMirrors += 1;
    }
  }

  sendStateCommitReliablyToPlayer(playerId: string, message: GameMessage): boolean {
    if (this.role !== 'host' || !isGameMessage(message) || !isStateTrafficMessage(message)) return false;
    const bundle = this.guestBundles.get(playerId);
    const connection = bundle?.admitted ? bundle.events : null;
    if (!connection?.open) return false;
    this.transmit(connection, message, false);
    this.reliableStateCommitMirrors += 1;
    return true;
  }

  sendToPlayer(playerId: string, message: GameMessage): boolean {
    if (this.role !== 'host' || !isGameMessage(message)) return false;
    const bundle = this.guestBundles.get(playerId);
    if (!bundle?.admitted) return false;
    const stateFallback = isStateTrafficMessage(message) && !bundle?.state?.open;
    const connection = isStateTrafficMessage(message)
      ? bundle?.state?.open ? bundle.state : bundle?.events
      : bundle?.events;
    if (!connection?.open) return false;
    this.transmit(connection, message, isStateTrafficMessage(message));
    if (isStateTrafficMessage(message)) this.stateMessagesRelayed += 1;
    if (stateFallback) this.stateFallbackMessages += 1;
    return true;
  }

  connectedPlayerIds(): string[] {
    return [...this.guestBundles.values()].filter((bundle) => bundle.admitted).map((bundle) => bundle.playerId);
  }

  activePlayerIds(maxSilenceMs: number, nowMonoMs = performance.now()): string[] {
    if (!Number.isFinite(maxSilenceMs) || maxSilenceMs < 0 || !Number.isFinite(nowMonoMs)) return [];
    return [...this.guestBundles.values()]
      .filter((bundle) => bundle.admitted && nowMonoMs - bundle.lastValidMessageMonoMs <= maxSilenceMs)
      .map((bundle) => bundle.playerId);
  }

  stateBufferedPressure(playerId?: string): number {
    const amount = this.role === 'client'
      ? this.hostStateConnection?.dataChannel?.bufferedAmount ?? this.hostEventConnection?.dataChannel?.bufferedAmount ?? 0
      : playerId
        ? this.guestBundles.get(playerId)?.state?.dataChannel?.bufferedAmount
          ?? this.guestBundles.get(playerId)?.events.dataChannel?.bufferedAmount ?? 0
        : Math.max(0, ...[...this.guestBundles.values()].map((bundle) =>
          bundle.state?.dataChannel?.bufferedAmount ?? bundle.events.dataChannel?.bufferedAmount ?? 0));
    return Math.max(0, Math.min(1, amount / 65_536));
  }

  eventBufferedAmount(playerId?: string): number {
    const amount = this.role === 'client'
      ? this.hostEventConnection?.dataChannel?.bufferedAmount ?? 0
      : playerId
        ? this.guestBundles.get(playerId)?.events.dataChannel?.bufferedAmount ?? 0
        : Math.max(0, ...[...this.guestBundles.values()].map((bundle) => bundle.events.dataChannel?.bufferedAmount ?? 0));
    return Math.max(0, amount);
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
    const qaImpairment = qaEventImpairment();
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
    const eventDataChannel = this.hostEventConnection?.dataChannel
      ?? [...this.guestBundles.values()].find((bundle) => bundle.events.dataChannel)?.events.dataChannel
      ?? null;
    const eventLaneBufferedBytes = this.eventBufferedAmount();
    const nowMonoMs = performance.now();
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
      eventChannelOrdered: eventDataChannel?.ordered ?? null,
      eventLaneBufferedBytes,
      eventLaneBufferedPressure: Math.max(0, Math.min(1, eventLaneBufferedBytes / 65_536)),
      stateChannels,
      stateChannelReliable: clientStateReliable ?? hostStateReliability ?? null,
      stateChannelOrdered: stateDataChannel?.ordered ?? null,
      stateChannelMaxRetransmits: stateDataChannel?.maxRetransmits ?? null,
      stateMessagesSent: this.stateMessagesSent,
      stateMessagesRelayed: this.stateMessagesRelayed,
      reliableStateCommitMirrors: this.reliableStateCommitMirrors,
      selfStateEchoesSuppressed: this.selfStateEchoesSuppressed,
      reconnectAttempts: this.reconnectAttempts,
      clientHostLivenessWatchdogActive: this.clientHostLivenessTimer !== null,
      clientHostSilenceAgeMs: this.lastValidHostMessageMonoMs === null
        ? null
        : Math.max(0, nowMonoMs - this.lastValidHostMessageMonoMs),
      clientHostProbeGraceRemainingMs: this.foregroundProbeGraceUntilMonoMs === null
        ? 0
        : Math.max(0, this.foregroundProbeGraceUntilMonoMs - nowMonoMs),
      clientHostLivenessRecoveries: this.clientHostLivenessRecoveries,
      pendingStateChannels: this.pendingStateConnections.size,
      stateFallbackActive: this.role === 'client'
        ? stateTrafficUsesFallback(Boolean(this.hostStateConnection?.open), Boolean(this.hostEventConnection?.open))
        : [...this.guestBundles.values()].some((bundle) => stateTrafficUsesFallback(Boolean(bundle.state?.open), bundle.events.open)),
      stateFallbackMessages: this.stateFallbackMessages,
      qaEventDelayMs: qaImpairment.delayMs,
      qaEventJitterMs: qaImpairment.jitterMs,
    };
  }

  close(): void {
    this.manualClose = true;
    this.liveConnectionAttempt = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopClientHostLivenessWatchdog();
    this.clearJoinDeadline();
    try { this.hostEventConnection?.close(); } catch { /* no-op */ }
    try { this.hostStateConnection?.close(); } catch { /* no-op */ }
    for (const bundle of this.guestBundles.values()) {
      try { bundle.events.close(); } catch { /* no-op */ }
      try { bundle.state?.close(); } catch { /* no-op */ }
    }
    for (const bundle of this.provisionalGuestReplacements.values()) {
      try { bundle.events.close(); } catch { /* no-op */ }
      try { bundle.state?.close(); } catch { /* no-op */ }
    }
    for (const connection of this.pendingStateConnections.values()) {
      try { connection.close(); } catch { /* no-op */ }
    }
    this.guestBundles.clear();
    this.provisionalGuestReplacements.clear();
    this.guestPeerOwners.clear();
    this.guestResumeTokens.clear();
    this.guestTransportGenerations.clear();
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
    this.reconnectDeadlineMonoMs = null;
  }

  private connectClient(reconnecting: boolean): void {
    if (this.manualClose || this.role !== 'client') return;
    const attempt = this.liveConnectionAttempt;
    if (!attempt || attempt.kind !== 'join') return;
    this.clientReadyNotified = false;
    this.clearJoinDeadline();
    this.onStatus(reconnecting ? `Reconnecting to host (attempt ${this.reconnectAttempts})…` : 'Connecting to peer lobby…', reconnecting ? 'warn' : undefined);
    this.joinDeadline = setTimeout(() => {
      if (!this.isCurrentConnectionAttempt(attempt) || this.role !== 'client' || this.channelsReady()) return;
      this.destroyClientTransport();
      if (joinTimeoutAction(reconnecting) === 'retry') {
        this.scheduleReconnect('Connection timed out');
      } else {
        this.role = 'offline';
        this.roomCode = '';
        this.onReady = null;
        this.finishConnectionAttempt(attempt);
        this.onStatus('Connection timed out. Check the room code and try again.', 'error');
      }
    }, 12_000);
    let peer: Peer;
    try {
      peer = this.peerFactory();
    } catch (error) {
      this.reportNetworkIssue('peerjs:client-create', error, 'Client signalling could not start');
      this.role = 'offline';
      this.roomCode = '';
      this.onReady = null;
      this.finishConnectionAttempt(attempt);
      this.clearJoinDeadline();
      this.onStatus(this.describeError(error), 'error');
      return;
    }
    this.peer = peer;
    peer.on('open', () => {
      if (this.peer !== peer || !this.isCurrentConnectionAttempt(attempt) || this.manualClose || this.role !== 'client') return;
      if (this.hostEventConnection || this.hostStateConnection) {
        this.onStatus('Signalling restored; active data channels preserved', 'ok');
        return;
      }
      const transportEpoch = globalThis.crypto.randomUUID();
      const transportGeneration = nextTransportGeneration();
      const events = peer.connect(this.roomCode, {
        label: EVENT_LABEL,
        metadata: { channel: 'events', transportEpoch, transportGeneration },
        reliable: true,
        serialization: 'json',
      });
      this.hostEventConnection = events;
      this.wireHostChannel(events, 'events');
      try {
        const state = connectLossyStateChannel(peer, this.roomCode, transportEpoch, transportGeneration);
        this.hostStateConnection = state;
        this.wireHostChannel(state, 'state');
      } catch (error) {
        this.hostStateConnection = null;
        this.reportNetworkIssue('webrtc:client-state-channel', error, 'Movement channel creation failed');
        this.onStatus('Movement channel degraded; using reliable fallback', 'warn');
      }
    });
    peer.on('error', (error) => {
      if (this.peer === peer && this.isCurrentConnectionAttempt(attempt) && this.role === 'client' && !this.manualClose) {
        this.reportNetworkIssue('peerjs:client-signalling', error, 'Client signalling failed');
        this.onStatus(this.describeError(error), 'error');
      }
    });
    peer.on('disconnected', () => {
      if (this.peer !== peer || !this.isCurrentConnectionAttempt(attempt) || this.manualClose || this.role !== 'client') return;
      this.onStatus(this.channelsReady()
        ? 'Signalling interrupted; reconnecting while active data channels continue'
        : 'Signalling interrupted before the host connection opened; reconnecting', 'warn');
      try { peer.reconnect(); } catch (error) {
        this.reportNetworkIssue('peerjs:client-reconnect', error, 'Client signalling reconnect failed');
        if (!this.channelsReady()) this.scheduleReconnect('Signalling disconnected');
      }
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
    const transportEpoch = connectionTransportEpoch(connection);
    const transportGeneration = connectionTransportGeneration(connection);
    const pendingStateKey = pendingStateConnectionKey(connection.peer, transportEpoch, transportGeneration);
    connection.on('data', (payload) => {
      if (!isGameMessage(payload)) {
        if (!playerId && initialLobbyJoinHasProtocolMismatch(payload)) {
          this.rejectConnection(connection, 'protocol-mismatch');
        }
        return;
      }
      if (!playerId) {
        if (payload.type !== 'lobby-join') return;
        if (transportEpoch === null || transportGeneration === null) {
          this.rejectConnection(connection, 'protocol-mismatch');
          return;
        }
        const requestedId = payload.playerId;
        const requestedTeam = payload.requestedTeam;
        const existing = this.guestBundles.get(requestedId);
        const existingProvisional = this.provisionalGuestReplacements.get(requestedId);
        const incomingResumeToken = payload.resumeToken;
        // The guest creates this generation before opening either lane. Unlike
        // host callback order, it remains causal when an old transport reaches
        // the host after the replacement has already authenticated.
        const latestTransportGeneration = this.guestTransportGenerations.get(requestedId);
        if (latestTransportGeneration !== undefined && transportGeneration <= latestTransportGeneration) {
          this.rejectConnection(connection, 'rejoin-denied');
          return;
        }
        const replaceActiveConnection = activeGuestCanBeReplaced(
          Boolean(existing?.events.open),
          this.guestResumeTokens.get(requestedId),
          incomingResumeToken,
        );
        if (existing?.events.open && !replaceActiveConnection) {
          this.rejectConnection(connection, 'rejoin-denied');
          return;
        }
        if (!existing && this.guestBundles.size >= this.maximumPlayers - 1) {
          this.rejectConnection(connection, 'room-full');
          return;
        }
        if (!bindGuestResumeToken(this.guestResumeTokens, requestedId, payload.resumeToken)) {
          this.rejectConnection(connection, 'rejoin-denied');
          return;
        }
        playerId = requestedId;
        const bundle: GuestBundle = {
          playerId,
          peerId: connection.peer,
          transportEpoch,
          transportGeneration,
          connectionEpoch: payload.connectionEpoch,
          resumeToken: payload.resumeToken,
          admitted: false,
          team: requestedTeam,
          events: connection,
          state: this.pendingStateConnections.get(pendingStateKey) ?? null,
          lastValidMessageMonoMs: performance.now(),
        };
        this.pendingStateConnections.delete(pendingStateKey);
        this.guestTransportGenerations.set(playerId, transportGeneration);
        this.guestPeerOwners.set(connection.peer, playerId);
        if (existing?.admitted) {
          this.provisionalGuestReplacements.set(playerId, bundle);
        } else {
          this.guestBundles.set(playerId, bundle);
        }
        if (existingProvisional && existingProvisional !== bundle) {
          if (existingProvisional.peerId !== existing?.peerId
            && existingProvisional.peerId !== connection.peer
            && this.guestPeerOwners.get(existingProvisional.peerId) === playerId) {
            this.guestPeerOwners.delete(existingProvisional.peerId);
          }
          try { existingProvisional.events.close(); } catch { /* The newer provisional attempt owns admission. */ }
          if (existingProvisional.state !== bundle.state) {
            try { existingProvisional.state?.close(); } catch { /* The newer provisional attempt owns admission. */ }
          }
        } else if (existing && !existing.admitted) {
          if (existing.peerId !== connection.peer && this.guestPeerOwners.get(existing.peerId) === playerId) {
            this.guestPeerOwners.delete(existing.peerId);
          }
          try { existing.events.close(); } catch { /* The newer initial attempt owns admission. */ }
          if (existing.state !== bundle.state) {
            try { existing.state?.close(); } catch { /* The newer initial attempt owns admission. */ }
          }
        }
        this.onStatus(`${this.guestBundles.size} guest connection${this.guestBundles.size === 1 ? '' : 's'}`, 'ok');
        this.onMessage(payload);
        return;
      }
      const current = this.guestBundles.get(playerId);
      if (!current || !isCurrentGuestEventConnection(current.events, connection)) return;
      if (!current.admitted) return;
      if (isHostAuthorityMessage(payload) || !messageBelongsToPlayer(payload, playerId)) return;
      current.lastValidMessageMonoMs = performance.now();
      if (payload.type === 'state') {
        // The sender selects exactly one lane. Always admit state arriving on
        // the reliable lane so a remotely closed transient channel cannot
        // leave the host believing the stale channel is still usable.
        this.onMessage(payload);
        return;
      }
      if (payload.type === 'overdrive-state' || payload.type === 'death') return;
      if (guestMessageEndsSession(payload)) {
        this.dropGuest(playerId, connection, payload.voluntary === true);
        try { connection.close(); } catch { /* no-op */ }
        return;
      }
      if (payload.type === 'overdrive-claim' || payload.type === 'hit' || payload.type === 'window-break'
        || payload.type === 'join' || payload.type === 'shot' || payload.type === 'shot-request' || payload.type === 'trigger-state' || payload.type === 'state-feedback' || payload.type === 'melee'
        || payload.type === 'support-activate' || payload.type === 'grenade-throw'
        || payload.type === 'lobby-ready' || payload.type === 'lobby-team' || payload.type === 'lobby-handicap'
        || payload.type === 'lobby-balance' || payload.type === 'redeploy-request' || payload.type === 'clock-ping'
        || payload.type === 'railgun-claim-request' || payload.type === 'railgun-shot-request'
        || payload.type === 'timed-map-weapon-claim-request'
        || payload.type === 'guest-resume-ack' || payload.type === 'guest-resume-nack'
        || payload.type === 'reload-intent'
        || payload.type === 'chat-submit') {
        this.onMessage(payload);
        return;
      }
      if (payload.type === 'ping' && !pingMatchesBoundTeam(payload, this.guestBundles.get(playerId)?.team)) return;
      this.onMessage(payload);
      this.broadcast(payload, playerId);
    });
    connection.on('close', () => this.dropGuest(playerId, connection));
    connection.on('error', (error) => {
      this.reportNetworkIssue('webrtc:host-guest-events', error, 'Guest event channel failed');
      this.onStatus('Guest event channel failed', 'error');
    });
  }

  private wireGuestState(connection: DataConnection): void {
    const transportEpoch = connectionTransportEpoch(connection);
    const transportGeneration = connectionTransportGeneration(connection);
    if (transportEpoch === null || transportGeneration === null) {
      try { connection.close(); } catch { /* Invalid lanes never enter the pending set. */ }
      return;
    }
    const pendingStateKey = pendingStateConnectionKey(connection.peer, transportEpoch, transportGeneration);
    this.pendingStateConnections.set(pendingStateKey, connection);
    const owner = this.guestPeerOwners.get(connection.peer);
    if (owner) {
      const provisional = this.provisionalGuestReplacements.get(owner);
      const bundle = provisional?.transportEpoch === transportEpoch
        && provisional.transportGeneration === transportGeneration
        ? provisional
        : this.guestBundles.get(owner);
      if (bundle && bundle.transportEpoch === transportEpoch && bundle.transportGeneration === transportGeneration) {
        bundle.state = connection;
        this.pendingStateConnections.delete(pendingStateKey);
      }
    }
    connection.on('open', () => {
      const boundOwner = this.guestPeerOwners.get(connection.peer);
      const provisional = boundOwner ? this.provisionalGuestReplacements.get(boundOwner) : undefined;
      const bundle = provisional?.transportEpoch === transportEpoch
        && provisional.transportGeneration === transportGeneration
        ? provisional
        : boundOwner ? this.guestBundles.get(boundOwner) : undefined;
      const pending = this.pendingStateConnections.get(pendingStateKey);
      if (bundle && bundle.transportEpoch === transportEpoch && bundle.transportGeneration === transportGeneration
        && (bundle.state === connection || pending === connection)) {
        bundle.state = connection;
        if (pending === connection) this.pendingStateConnections.delete(pendingStateKey);
      }
    });
    connection.on('data', (payload) => {
      if (!isGameMessage(payload) || payload.type !== 'state') return;
      const playerId = this.guestPeerOwners.get(connection.peer);
      if (!playerId || !messageBelongsToPlayer(payload, playerId)) return;
      const bundle = this.guestBundles.get(playerId);
      if (!bundle?.admitted || !isCurrentGuestStateConnection(bundle.state, connection)) return;
      bundle.lastValidMessageMonoMs = performance.now();
      this.onMessage(payload);
    });
    connection.on('close', () => {
      if (this.pendingStateConnections.get(pendingStateKey) === connection) {
        this.pendingStateConnections.delete(pendingStateKey);
      }
      const playerId = this.guestPeerOwners.get(connection.peer);
      const bundle = playerId ? this.guestBundles.get(playerId) : undefined;
      const provisional = playerId ? this.provisionalGuestReplacements.get(playerId) : undefined;
      if (bundle?.state === connection) bundle.state = null;
      if (provisional?.state === connection) provisional.state = null;
    });
    connection.on('error', (error) => {
      this.reportNetworkIssue('webrtc:host-guest-state', error, 'Guest movement channel degraded');
      this.onStatus('Guest movement channel degraded', 'warn');
    });
  }

  private wireHostChannel(connection: DataConnection, kind: ChannelKind): void {
    const current = () => isCurrentClientConnection(
      kind === 'events' ? this.hostEventConnection : this.hostStateConnection,
      connection,
    );
    connection.on('open', () => {
      if (!current()) return;
      if (kind === 'events') this.startClientHostLivenessWatchdog();
      this.maybeClientReady();
    });
    connection.on('data', (payload) => {
      if (!current() || !isGameMessage(payload)) return;
      if (kind === 'state' && !isStateTrafficMessage(payload)) return;
      this.noteValidHostMessage();
      if (payload.type === 'killstreak-damage-result') publishHostDamageResultForLocalQa(payload);
      this.onMessage(payload);
    });
    connection.on('close', () => {
      if (this.manualClose || this.role !== 'client' || !current()) return;
      if (kind === 'events') this.scheduleReconnect('Host connection closed');
      else {
        this.hostStateConnection = null;
        this.onStatus('Movement channel degraded; using reliable fallback', 'warn');
      }
    });
    connection.on('error', (error) => {
      if (!current()) return;
      this.reportNetworkIssue(`webrtc:client-${kind}`, error, `Client ${kind} channel failed`);
      if (kind === 'events') this.onStatus('Could not establish peer event channel', 'error');
      else this.onStatus('Could not establish movement channel', 'warn');
    });
  }

  private maybeClientReady(): void {
    if (!this.channelsReady() || this.clientReadyNotified) return;
    this.clientReadyNotified = true;
    this.clearJoinDeadline();
    this.reconnectAttempts = 0;
    this.reconnectDeadlineMonoMs = null;
    if (this.liveConnectionAttempt?.kind === 'join') this.markConnectionAttemptActive(this.liveConnectionAttempt);
    this.onStatus('Connected to host', 'ok');
    this.onReady?.();
  }

  private channelsReady(): boolean {
    return Boolean(this.hostEventConnection?.open);
  }

  private scheduleReconnect(reason: string): void {
    if (this.manualClose || this.role !== 'client' || this.reconnectTimer) return;
    this.destroyClientTransport();
    const now = performance.now();
    this.reconnectDeadlineMonoMs ??= now + RECONNECT_WINDOW_MS;
    if (now >= this.reconnectDeadlineMonoMs) {
      const attempt = this.liveConnectionAttempt;
      this.role = 'offline';
      this.roomCode = '';
      this.onReady = null;
      if (attempt) this.finishConnectionAttempt(attempt);
      this.onStatus(`${reason}. Rejoin from the lobby.`, 'error');
      return;
    }
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempts] ?? RECONNECT_DELAYS_MS.at(-1)!;
    this.reconnectAttempts += 1;
    this.onStatus(`${reason}; retrying within the 90-second rejoin window`, 'warn');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectClient(true);
    }, delay);
  }

  private destroyClientTransport(): void {
    this.clearJoinDeadline();
    this.stopClientHostLivenessWatchdog();
    try { this.hostEventConnection?.close(); } catch { /* no-op */ }
    try { this.hostStateConnection?.close(); } catch { /* no-op */ }
    this.hostEventConnection = null;
    this.hostStateConnection = null;
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* no-op */ }
    }
    this.peer = null;
  }

  private beginExplicitConnectionAttempt(kind: LiveConnectionAttempt['kind'], key: string): LiveConnectionAttempt | null {
    const existing = this.liveConnectionAttempt;
    if (existing) {
      if (existing.kind === kind && existing.key === key) {
        this.onStatus(`${kind === 'host' ? 'Host' : 'Join'} connection is already ${existing.phase}`, 'warn');
      } else {
        this.onStatus('Leave or cancel the current connection before starting a different lobby connection', 'warn');
      }
      return null;
    }
    this.close();
    const attempt: LiveConnectionAttempt = {
      id: ++this.connectionAttemptSequence,
      kind,
      key,
      phase: 'pending',
    };
    this.liveConnectionAttempt = attempt;
    return attempt;
  }

  private isCurrentConnectionAttempt(attempt: LiveConnectionAttempt): boolean {
    return this.liveConnectionAttempt?.id === attempt.id;
  }

  private markConnectionAttemptActive(attempt: LiveConnectionAttempt): void {
    if (this.isCurrentConnectionAttempt(attempt)) attempt.phase = 'active';
  }

  private finishConnectionAttempt(attempt: LiveConnectionAttempt): void {
    if (this.isCurrentConnectionAttempt(attempt)) this.liveConnectionAttempt = null;
  }

  private destroyPeerForAttemptRetry(peer: Peer, attempt: LiveConnectionAttempt): void {
    if (this.peer !== peer || !this.isCurrentConnectionAttempt(attempt)) return;
    try { peer.destroy(); } catch { /* The retry still owns the connection attempt. */ }
    this.peer = null;
  }

  private closeCurrentConnectionAttempt(attempt: LiveConnectionAttempt): void {
    if (this.isCurrentConnectionAttempt(attempt)) this.close();
  }

  private noteValidHostMessage(): void {
    if (this.role === 'client') this.lastValidHostMessageMonoMs = performance.now();
  }

  private startClientHostLivenessWatchdog(): void {
    this.stopClientHostLivenessWatchdog();
    if (this.manualClose || this.role !== 'client' || !this.hostEventConnection?.open) return;
    const nowMonoMs = performance.now();
    this.lastValidHostMessageMonoMs = nowMonoMs;
    this.foregroundProbeGraceUntilMonoMs = nowMonoMs + CLIENT_HOST_SILENCE_TIMEOUT_MS;
    this.lastClientHostLivenessCheckMonoMs = nowMonoMs;
    this.clientHostLivenessTimer = window.setInterval(() => this.checkClientHostLiveness(), CLIENT_HOST_LIVENESS_POLL_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.grantForegroundProbeGrace);
    window.addEventListener('focus', this.grantForegroundProbeGrace);
  }

  private stopClientHostLivenessWatchdog(): void {
    if (this.clientHostLivenessTimer !== null) window.clearInterval(this.clientHostLivenessTimer);
    this.clientHostLivenessTimer = null;
    this.lastValidHostMessageMonoMs = null;
    this.foregroundProbeGraceUntilMonoMs = null;
    this.lastClientHostLivenessCheckMonoMs = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.grantForegroundProbeGrace);
    if (typeof window !== 'undefined') window.removeEventListener('focus', this.grantForegroundProbeGrace);
  }

  private checkClientHostLiveness(): void {
    const nowMonoMs = performance.now();
    const decision = clientHostLivenessDecision({
      activeClient: !this.manualClose && this.role === 'client',
      eventChannelOpen: Boolean(this.hostEventConnection?.open),
      documentHidden: typeof document !== 'undefined' && document.hidden,
      reconnectPending: this.reconnectTimer !== null,
      lastValidHostMessageMonoMs: this.lastValidHostMessageMonoMs,
      foregroundProbeGraceUntilMonoMs: this.foregroundProbeGraceUntilMonoMs,
      lastWatchdogCheckMonoMs: this.lastClientHostLivenessCheckMonoMs,
      nowMonoMs,
    });
    this.lastClientHostLivenessCheckMonoMs = nowMonoMs;
    if (decision === 'grant-probe-grace') {
      this.foregroundProbeGraceUntilMonoMs = nowMonoMs + CLIENT_HOST_SILENCE_TIMEOUT_MS;
      return;
    }
    if (decision !== 'reconnect') return;
    this.clientHostLivenessRecoveries += 1;
    this.scheduleReconnect('Host stopped responding');
  }

  private dropGuest(playerId: string, connection: DataConnection, voluntary = false): void {
    const peerId = connection.peer;
    const pendingStateKey = pendingStateConnectionKey(
      peerId,
      connectionTransportEpoch(connection),
      connectionTransportGeneration(connection),
    );
    if (!playerId) {
      this.pendingStateConnections.delete(pendingStateKey);
      return;
    }
    const provisional = this.provisionalGuestReplacements.get(playerId);
    if (provisional && isCurrentGuestEventConnection(provisional.events, connection)) {
      this.provisionalGuestReplacements.delete(playerId);
      this.pendingStateConnections.delete(pendingStateKey);
      const active = this.guestBundles.get(playerId);
      if (active?.peerId !== peerId && this.guestPeerOwners.get(peerId) === playerId) {
        this.guestPeerOwners.delete(peerId);
      }
      try { provisional.state?.close(); } catch { /* The admitted transport remains authoritative. */ }
      return;
    }
    const bundle = this.guestBundles.get(playerId);
    // A close callback can arrive after a same-peer reconnect installed a
    // replacement bundle. Stable peer IDs cannot distinguish those sessions.
    if (!bundle || !isCurrentGuestEventConnection(bundle.events, connection)) return;
    this.guestBundles.delete(playerId);
    const samePeerReplacementPending = provisional !== undefined
      && provisional.peerId === peerId
      && !isCurrentGuestEventConnection(provisional.events, connection);
    if (!samePeerReplacementPending) this.guestPeerOwners.delete(peerId);
    this.pendingStateConnections.delete(pendingStateKey);
    try { bundle.state?.close(); } catch { /* no-op */ }
    if (!bundle.admitted) {
      if (this.guestResumeTokens.get(playerId) === bundle.resumeToken) this.guestResumeTokens.delete(playerId);
      if (this.guestTransportGenerations.get(playerId) === bundle.transportGeneration) {
        this.guestTransportGenerations.delete(playerId);
      }
      return;
    }
    const leave = boundGuestLeave(playerId, voluntary);
    this.onMessage(leave);
    this.broadcast(leave, playerId);
    this.onStatus(
      voluntary ? 'A guest left the lobby' : 'A guest disconnected; rejoin slot held for 90 seconds',
      voluntary ? 'ok' : 'warn',
    );
  }

  private rejectConnection(connection: DataConnection, reason: 'room-full' | 'identity-in-use' | 'rejoin-denied' | 'protocol-mismatch'): void {
    if (connection.open) this.transmit(connection, { type: 'lobby-reject', reason, nonce: Date.now() } satisfies GameMessage, false);
    window.setTimeout(() => connection.close(), 50);
  }

  private broadcast(message: GameMessage, exceptPlayerId?: string): void {
    for (const bundle of this.guestBundles.values()) {
      if (!bundle.admitted) continue;
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
      this.transmit(connection, message, isStateTrafficMessage(message));
      if (isStateTrafficMessage(message)) this.stateMessagesRelayed += 1;
      if (stateFallback) this.stateFallbackMessages += 1;
    }
  }

  private clearJoinDeadline(): void {
    if (this.joinDeadline) clearTimeout(this.joinDeadline);
    this.joinDeadline = null;
  }

  private transmit(connection: DataConnection, message: GameMessage, stateTraffic: boolean): void {
    const impairment = qaEventImpairment();
    if (stateTraffic || impairment.delayMs <= 0 && impairment.jitterMs <= 0) {
      connection.send(message);
      return;
    }
    const phase = (this.qaEventSendSequence % 5) - 2;
    this.qaEventSendSequence += 1;
    const requestedDue = performance.now() + impairment.delayMs + phase * impairment.jitterMs / 2;
    const due = Math.max(requestedDue, (this.qaEventLastDue.get(connection) ?? 0) + 0.1);
    this.qaEventLastDue.set(connection, due);
    window.setTimeout(() => {
      if (connection.open) connection.send(message);
    }, Math.max(0, due - performance.now()));
  }

  private reportNetworkIssue(source: string, error: unknown, fallbackMessage: string): void {
    try {
      this.onDiagnostic(clientRuntimeLogEntryFromError('network-warning', error, source, fallbackMessage));
    } catch {
      // Diagnostics must never interfere with live connection recovery.
    }
  }

  private describeError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    if (/peer-unavailable/i.test(text)) return 'Room not found. Check the code and try again.';
    if (/network|server/i.test(text)) return 'Peer signalling is unavailable. Check the connection and retry.';
    return `Network error: ${text.slice(0, 120)}`;
  }
}
