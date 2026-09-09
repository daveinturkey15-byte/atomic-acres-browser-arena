import { afterEach, describe, expect, it } from 'vitest';
import type { GameMessage } from './protocol';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { summarisePeer } from './netcode-diagnostics';
import {
  buildNetcodeEvidence,
  handleNetcodeKeydown,
  messagePeerId,
  messageSeq,
  netcodeDiagnosticsModel,
  netcodeRecordingActive,
  observeDisagreement,
  observeInbound,
  observeOutbound,
  observeRtt,
  resetNetcodeDiagnosticsRuntime,
  setNetcodeSession,
  startNetcodeEvidence,
  stopNetcodeEvidence,
  traceKindForMessageType,
} from './netcode-diagnostics-runtime';

/**
 * These tests exist because the model tests can only prove the arithmetic is
 * right. What breaks a diagnostics feature in practice is the WIRING: an
 * overlay that reads a peer id off the wrong field shows four rows of zeros
 * and nobody notices, because zeros are what a healthy session looks like too.
 * So every test here asserts against a message shaped exactly like the real
 * protocol type rather than a convenient stub.
 */

afterEach(() => {
  resetNetcodeDiagnosticsRuntime();
});

function stateMessage(peerId: string, seq: number): GameMessage {
  return {
    type: 'state',
    player: { id: peerId, seq, name: 'Sam', x: 1, y: 2, z: 3 },
    hostTimeMs: 0,
    continuity: 0,
    rateHz: 40,
  } as unknown as GameMessage;
}

function reloadResult(peerId: string, status: 'started' | 'rejected', reason: string): GameMessage {
  return {
    type: 'reload-result',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: peerId,
    forPlayerId: 'local',
    status,
    reason,
  } as unknown as GameMessage;
}

describe('message field extraction', () => {
  it('reads the peer from `by`, falling back to `player.id`', () => {
    expect(messagePeerId(stateMessage('guest-a', 7))).toBe('guest-a');
    expect(messagePeerId(reloadResult('host-1', 'started', 'accepted'))).toBe('host-1');
    // A message with neither attributes nothing rather than inventing a row.
    expect(messagePeerId({ type: 'lobby-balance', nonce: 1 } as unknown as GameMessage)).toBe('');
  });

  it('reads the snapshot sequence from player.seq', () => {
    expect(messageSeq(stateMessage('guest-a', 42))).toBe(42);
    // -1 means "this message is unsequenced", which keeps loss at 0 rather
    // than letting an unsequenced message look like a gap.
    expect(messageSeq({ type: 'ping' } as unknown as GameMessage)).toBe(-1);
  });

  it('maps unknown message types to `other` rather than passing them through', () => {
    expect(traceKindForMessageType('state')).toBe('state');
    expect(traceKindForMessageType('reload-result')).toBe('reload');
    expect(traceKindForMessageType('a-message-type-invented-next-year')).toBe('other');
  });
});

describe('inbound observation drives the peer row', () => {
  it('counts snapshots, acks, and request outcomes for the sending peer', () => {
    setNetcodeSession('guest', 'local', 'ROOM1');
    const model = netcodeDiagnosticsModel();
    observeInbound(stateMessage('host-1', 1), 1_000);
    observeInbound(stateMessage('host-1', 2), 1_025);
    observeInbound(stateMessage('host-1', 3), 1_050);
    observeInbound(reloadResult('host-1', 'started', 'accepted'), 1_060);
    observeInbound(reloadResult('host-1', 'rejected', 'life-mismatch'), 1_070);

    const peer = model.peers.get('host-1');
    expect(peer).toBeDefined();
    const summary = summarisePeer(peer!, 1_100);
    // Three snapshots 25 ms apart is 40 Hz measured off arrival timestamps.
    expect(summary.inboundRateHz).toBeCloseTo(40, 0);
    expect(summary.lossFraction).toBe(0);
    // The reload-result is the ack, so the ack is 40 ms old at t=1100.
    expect(summary.lastAckAgeMs).toBe(30);
    expect(summary.requestSummary).toBe('R+ R-');
    // We are the guest, so the peer we hear from is the host.
    expect(summary.role).toBe('host');
  });

  it('never attributes our own echoed message to a peer row', () => {
    setNetcodeSession('host', 'host-1', 'ROOM1');
    observeInbound(stateMessage('host-1', 1), 1_000);
    expect(netcodeDiagnosticsModel().peers.size).toBe(0);
  });

  it('derives loss from the sequence gap, not from a missing message count', () => {
    setNetcodeSession('guest', 'local', 'ROOM1');
    observeInbound(stateMessage('host-1', 10), 1_000);
    observeInbound(stateMessage('host-1', 11), 1_025);
    // 12 and 13 never arrive.
    observeInbound(stateMessage('host-1', 14), 1_100);
    const summary = summarisePeer(netcodeDiagnosticsModel().peers.get('host-1')!, 1_100);
    // Expected 10..14 = 5, received 3, so 2/5.
    expect(summary.lossFraction).toBeCloseTo(0.4, 5);
  });
});

describe('outbound observation and rtt', () => {
  it('measures the outbound snapshot rate we actually achieved', () => {
    setNetcodeSession('host', 'host-1', 'ROOM1');
    for (let index = 0; index < 5; index += 1) {
      observeOutbound(stateMessage('host-1', index), 'guest-a', 1_000 + index * 50);
    }
    const summary = summarisePeer(netcodeDiagnosticsModel().peers.get('guest-a')!, 1_300);
    expect(summary.outboundRateHz).toBeCloseTo(20, 0);
    expect(summary.role).toBe('guest');
  });

  it('feeds rtt and jitter from the runtime clock sync', () => {
    setNetcodeSession('guest', 'local', 'ROOM1');
    observeRtt('host-1', 40);
    observeRtt('host-1', 40);
    observeRtt('host-1', 120);
    const summary = summarisePeer(netcodeDiagnosticsModel().peers.get('host-1')!, 0);
    // EMA from 40 toward 120 at alpha 0.25 lands between the two, never above.
    expect(summary.rttMs).toBeGreaterThan(40);
    expect(summary.rttMs).toBeLessThan(120);
    // An 80 ms swing moves the RFC 3550 filter off zero but not to 80.
    expect(summary.jitterMs).toBeGreaterThan(0);
    expect(summary.jitterMs).toBeLessThan(80);
  });
});

describe('recording is opt-in and costs nothing while idle', () => {
  it('records no traces until start() and stops on save', () => {
    setNetcodeSession('guest', 'local', 'ROOM1');
    observeInbound(stateMessage('host-1', 1), 1_000);
    expect(netcodeRecordingActive()).toBe(false);
    // Nothing to build from: no recorder was ever allocated.
    expect(buildNetcodeEvidence(1_000)).toBeNull();

    startNetcodeEvidence(2_000);
    observeInbound(stateMessage('host-1', 2), 2_100);
    observeOutbound(stateMessage('local', 2), 'host-1', 2_110);
    observeDisagreement('host-1', 0.35, 2_120, 2);
    const bundle = buildNetcodeEvidence(2_200, 1_700_000_000_000);
    expect(bundle).not.toBeNull();
    expect(bundle!.traces.length).toBe(2);
    expect(bundle!.diffs.length).toBe(1);
    expect(bundle!.protocolVersion).toBe(MULTIPLAYER_PROTOCOL_VERSION);
    expect(bundle!.roomCode).toBe('ROOM1');

    stopNetcodeEvidence();
    observeInbound(stateMessage('host-1', 3), 2_300);
    expect(buildNetcodeEvidence(2_400)!.traces.length).toBe(2);
  });

  it('keeps the player name out of the serialised bundle', () => {
    setNetcodeSession('guest', 'local', 'ROOM1');
    startNetcodeEvidence(0);
    // stateMessage carries name: 'Sam'. A trace records its SIZE, not its text.
    observeInbound(stateMessage('host-1', 1), 10);
    const serialised = JSON.stringify(buildNetcodeEvidence(20));
    expect(serialised).not.toContain('Sam');
    // The size did survive, which is the point of recording bytes at all.
    expect(JSON.parse(serialised).traces[0].bytes).toBeGreaterThan(0);
  });

  it('records zero bytes while idle, proving the serialisation is skipped', () => {
    setNetcodeSession('guest', 'local', 'ROOM1');
    startNetcodeEvidence(0);
    observeInbound(stateMessage('host-1', 1), 10);
    stopNetcodeEvidence();
    startNetcodeEvidence(100);
    observeInbound(stateMessage('host-1', 2), 110);
    const bundle = buildNetcodeEvidence(200)!;
    // Only the post-restart trace survives, and it carries a real byte count.
    expect(bundle.traces.length).toBe(1);
    expect(bundle.traces[0]!.bytes).toBeGreaterThan(0);
  });
});

describe('keydown routing', () => {
  type FakeEl = {
    id: string; hidden: boolean; textContent: string; children: FakeEl[];
    setAttribute(name: string, value: string): void;
    appendChild(child: FakeEl): FakeEl;
    remove(): void;
    click(): void;
    href: string; download: string; rel: string; style: Record<string, string>;
  };
  function makeDoc(): Document {
    const make = (): FakeEl => ({
      id: '', hidden: false, textContent: '', children: [], href: '', download: '', rel: '', style: {},
      setAttribute() {}, appendChild(child) { this.children.push(child); return child; },
      remove() {}, click() {},
    });
    const body = make();
    return {
      body,
      documentElement: body,
      createElement: () => make(),
      getElementById: (id: string) => body.children.find((child) => child.id === id) ?? null,
    } as unknown as Document;
  }

  it('bare F3 toggles the overlay and Ctrl+F3 drives the recorder', () => {
    const doc = makeDoc();
    expect(handleNetcodeKeydown({ code: 'F3', repeat: false }, 0, doc)).toBe('overlay-on');
    expect(handleNetcodeKeydown({ code: 'F3', repeat: false }, 0, doc)).toBe('overlay-off');
    // A repeat must not strobe the overlay while F3 is held.
    expect(handleNetcodeKeydown({ code: 'F3', repeat: true }, 0, doc)).toBe('none');
    expect(handleNetcodeKeydown({ code: 'F4', repeat: false }, 0, doc)).toBe('none');

    expect(handleNetcodeKeydown({ code: 'F3', repeat: false, ctrlKey: true }, 1_000, doc)).toBe('record-start');
    expect(netcodeRecordingActive()).toBe(true);
    // The second Ctrl+F3 saves; without Blob support the export reports why.
    expect(handleNetcodeKeydown({ code: 'F3', repeat: false, ctrlKey: true }, 2_000, doc)).toBe('record-save');
    expect(netcodeRecordingActive()).toBe(false);
  });
});
