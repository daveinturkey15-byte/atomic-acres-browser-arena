import { describe, expect, it } from 'vitest';
import {
  MATCH_DIAGNOSTICS_SCHEMA_VERSION,
  MAX_DIAGNOSTIC_EVENTS,
  MAX_DIAGNOSTIC_EXPORT_BYTES,
  MatchDiagnostics,
  sanitizeDiagnosticValue,
} from './match-diagnostics';

function logger(): MatchDiagnostics {
  return new MatchDiagnostics({
    buildId: 'pass-59', sourceId: 'f55529f', sessionId: 'ROOM-CODE-DO-NOT-EXPORT',
    role: 'guest', arena: 'atomic-acres', mode: 'tdm',
  });
}

describe('bounded downloadable match diagnostics', () => {
  it('pseudonymizes players and scrubs secret/private-network fields', () => {
    const diagnostics = logger();
    diagnostics.record({
      monotonicMs: 10, localEpochMs: 20, eventId: 'hit-1', eventType: 'damage',
      actorId: 'peer-real-id', targetId: 'other-real-id', admission: 'accepted',
      reason: 'relay 192.168.1.42 room_qwerty123 accepted',
    });
    const exported = diagnostics.export();
    expect(exported.filename).toMatch(/^atomic-acres-match-atomic-acres-p-[a-f0-9]{8}\.json$/);
    expect(exported.json).not.toContain('ROOM-CODE');
    expect(exported.json).not.toContain('peer-real-id');
    expect(exported.json).not.toContain('192.168.1.42');
    expect(exported.json).not.toContain('room_qwerty123');
    expect(JSON.parse(exported.json).schemaVersion).toBe(MATCH_DIAGNOSTICS_SCHEMA_VERSION);
    expect(sanitizeDiagnosticValue({ roomCode: 'ABC123', token: 'secret', ok: true })).toEqual({ ok: true });
  });

  it('includes sanitized game and runtime context for technical debugging', () => {
    const diagnostics = new MatchDiagnostics({
      buildId: 'pass-60', sourceId: 'source', sessionId: 'session', role: 'offline', arena: 'gun-range', mode: 'solo',
      technicalContext: { renderProfile: 'performance', weaponBalance: { sniper: { damage: 67, rpm: 55 } }, roomCode: 'private' },
    });
    const context = JSON.parse(diagnostics.export().json).context;
    expect(context.technicalContext).toMatchObject({ renderProfile: 'performance', weaponBalance: { sniper: { damage: 67, rpm: 55 } } });
    expect(context.technicalContext.roomCode).toBeUndefined();
  });

  it('keeps a shared network event id correlatable across scrubbed host and guest exports', () => {
    const host = new MatchDiagnostics({
      buildId: 'pass-59', sourceId: 'same-source', sessionId: 'host-private-session',
      role: 'host', arena: 'atomic-acres', mode: 'tdm',
    });
    const guest = new MatchDiagnostics({
      buildId: 'pass-59', sourceId: 'same-source', sessionId: 'guest-private-session',
      role: 'guest', arena: 'atomic-acres', mode: 'tdm',
    });
    for (const diagnostics of [host, guest]) diagnostics.record({
      monotonicMs: 100, localEpochMs: 200, matchTimeMs: 90,
      eventId: 'hit-nonce-771', eventType: 'damage', actorId: 'raw-peer-id',
      targetId: 'raw-target-id', admission: 'accepted', damageApplied: 31,
    });
    const hostEvent = JSON.parse(host.export().json).events[0];
    const guestEvent = JSON.parse(guest.export().json).events[0];
    expect(hostEvent.eventId).toBe('hit-nonce-771');
    expect(guestEvent.eventId).toBe(hostEvent.eventId);
    expect(hostEvent.actorId).not.toBe('raw-peer-id');
    expect(guestEvent.actorId).not.toBe('raw-peer-id');
    expect(hostEvent.actorId).not.toBe(guestEvent.actorId);
  });

  it('rotates noisy telemetry and remains under the export byte ceiling', () => {
    const diagnostics = logger();
    for (let index = 0; index < MAX_DIAGNOSTIC_EVENTS + 200; index += 1) {
      diagnostics.record({
        monotonicMs: index, localEpochMs: index, eventId: `state-${index}`,
        eventType: 'state-reconciliation', actorId: `peer-${index % 8}`,
        admission: 'observed', reason: 'bounded state telemetry '.repeat(8),
      });
    }
    const exported = diagnostics.export();
    const parsed = JSON.parse(exported.json);
    expect(diagnostics.size()).toBeLessThanOrEqual(MAX_DIAGNOSTIC_EVENTS);
    expect(parsed.droppedEvents).toBeGreaterThanOrEqual(200);
    expect(new TextEncoder().encode(exported.json).byteLength).toBeLessThanOrEqual(MAX_DIAGNOSTIC_EXPORT_BYTES);
  });
});
