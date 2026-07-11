import { DataConnection, Peer } from 'peerjs';
import { GameMessage, isGameMessage } from './protocol';

export type NetworkRole = 'offline' | 'host' | 'client';

type MessageHandler = (message: GameMessage) => void;
type StatusHandler = (text: string, kind?: 'ok' | 'warn' | 'error') => void;

export class ArenaNetwork {
  role: NetworkRole = 'offline';
  roomCode = '';
  private peer: Peer | null = null;
  private hostConnection: DataConnection | null = null;
  private guests = new Set<DataConnection>();
  private onMessage: MessageHandler;
  private onStatus: StatusHandler;
  private onReady: (() => void) | null = null;

  constructor(onMessage: MessageHandler, onStatus: StatusHandler) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  host(onReady: () => void): void {
    this.close();
    this.role = 'host';
    this.onReady = onReady;
    this.onStatus('Opening a secure peer lobby…');
    const peer = new Peer();
    this.peer = peer;
    peer.on('open', (id) => {
      this.roomCode = id;
      this.onStatus('Lobby ready — share the room code', 'ok');
      onReady();
    });
    peer.on('connection', (connection) => this.wireGuest(connection));
    peer.on('error', (error) => this.onStatus(this.describeError(error), 'error'));
    peer.on('disconnected', () => this.onStatus('Signalling disconnected; existing peers may continue', 'warn'));
  }

  join(roomCode: string, onReady: () => void): void {
    this.close();
    this.role = 'client';
    this.roomCode = roomCode.trim();
    this.onReady = onReady;
    if (!this.roomCode) {
      this.onStatus('Enter a room code first', 'error');
      return;
    }
    this.onStatus('Connecting to peer lobby…');
    const peer = new Peer();
    this.peer = peer;
    peer.on('open', () => {
      const connection = peer.connect(this.roomCode, { reliable: true, serialization: 'json' });
      this.hostConnection = connection;
      this.wireHost(connection);
    });
    peer.on('error', (error) => this.onStatus(this.describeError(error), 'error'));
    peer.on('disconnected', () => this.onStatus('Signalling disconnected; attempting to preserve session', 'warn'));
  }

  send(message: GameMessage): void {
    if (!isGameMessage(message)) return;
    if (this.role === 'host') {
      this.broadcast(message);
    } else if (this.role === 'client' && this.hostConnection?.open) {
      this.hostConnection.send(message);
    }
  }

  close(): void {
    if (this.hostConnection) {
      try { this.hostConnection.close(); } catch { /* no-op */ }
    }
    for (const connection of this.guests) {
      try { connection.close(); } catch { /* no-op */ }
    }
    this.guests.clear();
    this.hostConnection = null;
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* no-op */ }
    }
    this.peer = null;
    this.roomCode = '';
    this.role = 'offline';
    this.onReady = null;
  }

  private wireGuest(connection: DataConnection): void {
    this.guests.add(connection);
    let playerId = '';
    connection.on('open', () => this.onStatus(`${this.guests.size} guest connection${this.guests.size === 1 ? '' : 's'}`, 'ok'));
    connection.on('data', (payload) => {
      if (!isGameMessage(payload)) return;
      if (payload.type === 'join') playerId = payload.player.id;
      this.onMessage(payload);
      this.broadcast(payload, connection);
    });
    connection.on('close', () => {
      this.guests.delete(connection);
      if (playerId) {
        const leave: GameMessage = { type: 'leave', playerId };
        this.onMessage(leave);
        this.broadcast(leave);
      }
      this.onStatus('A guest left the lobby', 'warn');
    });
    connection.on('error', () => this.onStatus('Guest data channel failed', 'error'));
  }

  private wireHost(connection: DataConnection): void {
    connection.on('open', () => {
      this.onStatus('Connected to host', 'ok');
      this.onReady?.();
    });
    connection.on('data', (payload) => {
      if (isGameMessage(payload)) this.onMessage(payload);
    });
    connection.on('close', () => this.onStatus('Host connection closed', 'error'));
    connection.on('error', () => this.onStatus('Could not establish peer data channel', 'error'));
  }

  private broadcast(message: GameMessage, except?: DataConnection): void {
    for (const connection of this.guests) {
      if (connection !== except && connection.open) connection.send(message);
    }
  }

  private describeError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    if (/peer-unavailable/i.test(text)) return 'Room not found. Check the code and try again.';
    if (/network|server/i.test(text)) return 'Peer signalling is unavailable. Check the connection and retry.';
    return `Network error: ${text.slice(0, 120)}`;
  }
}
