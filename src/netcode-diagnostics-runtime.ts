/**
 * PASS 95 — the bridge between the netcode diagnostics model and the running
 * game. This is the only file in the feature that knows what a `GameMessage`
 * is; `src/netcode-diagnostics.ts` stays a pure model and
 * `src/netcode-diagnostics-overlay.ts` stays pure DOM.
 *
 * WHY A SINGLETON, WHICH IS NORMALLY A SMELL
 * ------------------------------------------
 * The two observation points are in different modules that do not otherwise
 * know about each other: outbound messages leave through `ArenaNetwork.send`
 * and `sendToPlayer` in `src/network.ts`, inbound messages arrive at
 * `onNetworkMessage` in `src/legacy-main.ts`. Threading a diagnostics handle
 * from legacy-main into ArenaNetwork's constructor would mean changing the
 * network constructor signature and every test that builds one. A module-level
 * singleton with a hard off switch costs both call sites one import and one
 * line, and `resetNetcodeDiagnosticsRuntime()` gives the tests a clean slate.
 *
 * THE OFF SWITCH IS THE WHOLE PERFORMANCE STORY
 * ---------------------------------------------
 * `observeOutbound` / `observeInbound` run on the message path at up to 40 Hz
 * per peer. They are split into two tiers, and which tier runs is decided by
 * one boolean read:
 *
 *   ALWAYS (allocation-free): peer rings for rtt, jitter, snapshot arrival and
 *   send timestamps, sequence-derived loss, ack age, request outcomes. These
 *   push numbers into preallocated Float64Arrays. No object is constructed, no
 *   string is built, nothing is serialised. This tier runs whether or not the
 *   overlay is visible, because a netgraph that only starts measuring when you
 *   open it shows you a blank graph exactly when you needed the last 30
 *   seconds of history.
 *
 *   ONLY WHILE RECORDING (opt-in, allocates): the evidence trace, which needs a
 *   byte count and therefore one `JSON.stringify` per message. That cost is
 *   real and is why recording is opt-in, bounded to 120 s, and off by default.
 *   `messageBytes` returns 0 without serialising when the recorder is idle, so
 *   a player who never presses the record key never pays it.
 */

import type { GameMessage } from './protocol';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import {
  createNetcodeDiagnosticsModel,
  forgetPeer,
  recordAck,
  recordInboundSnapshot,
  recordOutboundSnapshot,
  recordPositionDisagreement,
  recordRequestOutcome,
  recordRttSample,
  type NetDiagnosticsRole,
  type NetcodeDiagnosticsModel,
} from './netcode-diagnostics';
import {
  createNetcodeOverlay,
  isNetcodeOverlayToggle,
  type NetcodeOverlayHandle,
} from './netcode-diagnostics-overlay';
import {
  createNetcodeEvidenceRecorder,
  sanitiseTraceKind,
  type EvidenceBundle,
  type EvidenceTraceKind,
  type NetcodeEvidenceRecorder,
} from './netcode-evidence-recorder';
import { downloadEvidenceBundle, type EvidenceSaveResult } from './netcode-evidence-export';

/** Ctrl+F3 records; bare F3 toggles the overlay. Neither is a gameplay bind. */
export const NETCODE_EVIDENCE_TOGGLE_CODE = 'F3';

/**
 * Maps a protocol message type onto the recorder's allowlisted trace kinds.
 * A message type absent from this table records as 'other' — deliberately, so
 * that adding a protocol message never silently starts naming a new thing
 * inside a bundle a friend emails to the owner.
 */
const TRACE_KIND_BY_MESSAGE_TYPE: Readonly<Record<string, EvidenceTraceKind>> = Object.freeze({
  state: 'state',
  join: 'join',
  leave: 'leave',
  'bot-state': 'state',
  shot: 'shot',
  'shot-request': 'shot',
  'shot-result': 'shot',
  'trigger-state': 'input',
  melee: 'melee',
  'grenade-throw': 'explosion',
  'grenade-result': 'explosion',
  hit: 'damage',
  'bot-damage': 'damage',
  death: 'damage',
  'support-activate': 'shot',
  reload: 'reload',
  'reload-request': 'reload',
  'reload-result': 'reload',
  pickup: 'pickup',
  'pickup-result': 'pickup',
  'state-feedback': 'ack',
  ping: 'ping',
  'team-ping': 'ping',
  'text-chat': 'chat',
  'lobby-config': 'lobby',
  'lobby-state': 'lobby',
  'lobby-start': 'lobby',
  'lobby-balance': 'lobby',
  'lobby-reject': 'lobby',
  'lobby-closed': 'lobby',
});

export function traceKindForMessageType(type: string): EvidenceTraceKind {
  return sanitiseTraceKind(TRACE_KIND_BY_MESSAGE_TYPE[type] ?? 'other');
}

/**
 * The peer a message concerns. `by` is the sender on every combat message;
 * `player.id` is the subject on join/state. Returns '' when neither exists,
 * and the caller then attributes nothing rather than inventing a peer row.
 */
export function messagePeerId(message: GameMessage): string {
  const candidate = message as unknown as { by?: unknown; player?: { id?: unknown } };
  if (typeof candidate.by === 'string') return candidate.by;
  if (candidate.player && typeof candidate.player.id === 'string') return candidate.player.id;
  return '';
}

/** Snapshot sequence when the message carries one, else -1 ("unsequenced"). */
export function messageSeq(message: GameMessage): number {
  const candidate = message as unknown as { player?: { seq?: unknown }; seq?: unknown };
  if (candidate.player && typeof candidate.player.seq === 'number') return candidate.player.seq;
  if (typeof candidate.seq === 'number') return candidate.seq;
  return -1;
}

export type NetcodeDiagnosticsRuntime = {
  readonly model: NetcodeDiagnosticsModel;
  readonly recorder: NetcodeEvidenceRecorder | null;
  overlay: NetcodeOverlayHandle | null;
};

let model = createNetcodeDiagnosticsModel();
let recorder: NetcodeEvidenceRecorder | null = null;
let overlay: NetcodeOverlayHandle | null = null;
let recording = false;

export function netcodeDiagnosticsModel(): NetcodeDiagnosticsModel {
  return model;
}

export function netcodeRecordingActive(): boolean {
  return recording;
}

/**
 * Called when the role or room changes; peers are cleared on a role change.
 * Idempotent and early-outs when nothing moved, because `tickNetcodeDiagnostics`
 * calls it every frame and a per-frame `revision += 1` would defeat the
 * overlay's whole reason for having a revision counter.
 */
export function setNetcodeSession(role: NetDiagnosticsRole, localPeerId: string, roomCode: string): void {
  if (model.localRole === role && model.localPeerId === localPeerId && model.roomCode === roomCode) return;
  if (model.localRole !== role) model.peers.clear();
  model.localRole = role;
  model.localPeerId = localPeerId;
  model.roomCode = roomCode;
  model.revision += 1;
}

/**
 * The single per-frame call legacy-main makes. Keeping the session sync and the
 * repaint behind one function is what holds this feature's footprint in a
 * 37,000-line module to one line, which the size ratchet cares about and which
 * also means there is exactly one place to look when the overlay misbehaves.
 */
export function tickNetcodeDiagnostics(
  role: NetDiagnosticsRole,
  localPeerId: string,
  roomCode: string,
  nowMs: number,
): boolean {
  setNetcodeSession(role, localPeerId, roomCode);
  return updateNetcodeOverlay(nowMs);
}

export function forgetNetcodePeer(peerId: string): void {
  forgetPeer(model, peerId);
}

/**
 * Serialised size, and ONLY while recording. The `recording` check is first so
 * an idle session never serialises a message it is not going to store.
 */
function messageBytes(message: GameMessage): number {
  if (!recording) return 0;
  try {
    return JSON.stringify(message).length;
  } catch {
    return 0;
  }
}

/** The role we attribute to a remote peer, given our own. */
function remoteRole(): NetDiagnosticsRole {
  return model.localRole === 'host' ? 'guest' : 'host';
}

export function observeInbound(message: GameMessage, nowMs: number): void {
  const peerId = messagePeerId(message);
  if (peerId.length === 0 || peerId === model.localPeerId) return;
  const role = remoteRole();
  if (message.type === 'state' || message.type === 'join') {
    recordInboundSnapshot(model, peerId, messageSeq(message), nowMs, role);
  }
  // A state-feedback is the host telling a guest it processed its stream: the
  // closest thing this protocol has to an explicit ack, so it is what the
  // "last ack age" column measures rather than a synthetic keepalive.
  if (message.type === 'state-feedback' || message.type === 'shot-result'
    || message.type === 'reload-result' || message.type === 'pickup-result') {
    recordAck(model, peerId, nowMs, role);
  }
  if (message.type === 'reload-result') {
    recordRequestOutcome(model, peerId, 'reload',
      message.status === 'rejected' ? 'rejected' : 'accepted', nowMs, 0, message.reason);
  }
  if (message.type === 'pickup-result') {
    recordRequestOutcome(model, peerId, 'pickup',
      message.status === 'rejected' ? 'rejected' : 'accepted', nowMs, 0, message.reason);
  }
  if (recording && recorder) {
    recorder.recordTrace(nowMs, 'in', traceKindForMessageType(message.type), peerId,
      messageSeq(message), messageBytes(message));
    if (message.type === 'reload-result' || message.type === 'pickup-result') {
      recorder.recordRequest(nowMs, peerId, message.type === 'reload-result' ? 'reload' : 'pickup',
        message.status === 'rejected' ? 'rejected' : 'accepted', 0, message.reason);
    }
  }
}

export function observeOutbound(message: GameMessage, peerId: string, nowMs: number): void {
  if (peerId.length === 0) return;
  if (message.type === 'state' || message.type === 'join') {
    recordOutboundSnapshot(model, peerId, nowMs, remoteRole());
  }
  if (recording && recorder) {
    recorder.recordTrace(nowMs, 'out', traceKindForMessageType(message.type), peerId,
      messageSeq(message), messageBytes(message));
  }
}

/**
 * The client's only send target is the host, and the host's row is created by
 * the first inbound message from it. Attributing an outbound message to "the
 * peer we believe is the host" keeps the in and out rates on ONE row — if the
 * client invented a second row keyed by something else, the overlay would show
 * a peer with traffic out and none in, which is exactly the picture of a broken
 * connection. Before any inbound message has landed there is no row yet and
 * this records nothing, which is honest: we do not yet know who the host is.
 */
export function observeOutboundToHost(message: GameMessage, nowMs: number): void {
  for (const peer of model.peers.values()) {
    if (peer.role !== 'host') continue;
    observeOutbound(message, peer.peerId, nowMs);
    return;
  }
}

/** RTT in milliseconds, from whatever clock-sync the runtime already keeps. */
export function observeRtt(peerId: string, sampleMs: number): void {
  if (peerId.length === 0) return;
  recordRttSample(model, peerId, sampleMs, remoteRole());
}

/**
 * Metres between where we are DRAWING a peer and where host authority puts it.
 * On the host this is measured against its own authoritative pose, so a host
 * bundle carries the zero-by-construction control row the divergence table
 * compares guest rows against.
 */
export function observeDisagreement(peerId: string, metres: number, nowMs: number, seq = -1): void {
  if (peerId.length === 0) return;
  recordPositionDisagreement(model, peerId, metres, remoteRole());
  if (recording && recorder) recorder.recordDiff(nowMs, peerId, metres, seq);
}

// ---------------------------------------------------------------------------
// Overlay and recorder control. These are the four entry points legacy-main
// touches, which is what keeps the size-ratchet cost of this feature small.
// ---------------------------------------------------------------------------

export function ensureNetcodeOverlay(doc: Document = document): NetcodeOverlayHandle {
  if (!overlay) overlay = createNetcodeOverlay(doc);
  return overlay;
}

export function updateNetcodeOverlay(nowMs: number): boolean {
  return overlay ? overlay.update(model, nowMs) : false;
}

/**
 * The single keydown entry point. Returns what it did so the caller can
 * `preventDefault` only on a press it actually consumed — F3 is the browser's
 * find-again on some platforms and swallowing it unconditionally would be rude.
 */
export type NetcodeKeyAction = 'none' | 'overlay-on' | 'overlay-off' | 'record-start' | 'record-save';

export function handleNetcodeKeydown(
  event: Readonly<{ code: string; repeat: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }>,
  nowMs: number,
  doc: Document = document,
): NetcodeKeyAction {
  if (event.code === NETCODE_EVIDENCE_TOGGLE_CODE && !event.repeat && event.ctrlKey === true
    && event.metaKey !== true && event.altKey !== true) {
    if (!recording) {
      startNetcodeEvidence(nowMs);
      return 'record-start';
    }
    saveNetcodeEvidence(nowMs, doc);
    return 'record-save';
  }
  if (!isNetcodeOverlayToggle(event)) return 'none';
  const visible = ensureNetcodeOverlay(doc).toggle();
  return visible ? 'overlay-on' : 'overlay-off';
}

/**
 * Opt-in. The recorder's rings are allocated HERE rather than at module load,
 * because they are 28,000 preallocated slot objects and a player who never
 * records must not carry them.
 */
export function startNetcodeEvidence(nowMs: number): void {
  if (!recorder) recorder = createNetcodeEvidenceRecorder();
  recorder.start(nowMs);
  recording = true;
}

export function stopNetcodeEvidence(): void {
  recording = false;
  recorder?.stop();
}

export function buildNetcodeEvidence(nowMs: number, epochMs = Date.now()): EvidenceBundle | null {
  if (!recorder) return null;
  return recorder.build(nowMs, model, {
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    pass: 'pass95',
    generatedAtEpochMs: epochMs,
  });
}

export function saveNetcodeEvidence(nowMs: number, doc: Document = document): EvidenceSaveResult | null {
  const bundle = buildNetcodeEvidence(nowMs);
  if (!bundle) return null;
  stopNetcodeEvidence();
  return downloadEvidenceBundle(bundle, doc);
}

/** Test-only reset; also what a return-to-lobby uses to drop stale peer rows. */
export function resetNetcodeDiagnosticsRuntime(): void {
  model = createNetcodeDiagnosticsModel();
  recorder?.reset();
  recorder = null;
  recording = false;
  overlay?.destroy();
  overlay = null;
}
