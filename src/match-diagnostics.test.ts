import { describe, expect, it } from 'vitest';
import {
  MATCH_DIAGNOSTICS_SCHEMA_VERSION,
  MAX_DIAGNOSTIC_EVENTS,
  MAX_DAMAGE_LEDGER_EVENTS,
  MAX_DIAGNOSTIC_EXPORT_BYTES,
  MatchDiagnostics,
  sanitizeDiagnosticValue,
} from './match-diagnostics';
import {
  MATCH_DIAGNOSTIC_MAX_BODY_BYTES,
  MATCH_DIAGNOSTIC_MAX_EVENTS,
  validateMatchDiagnosticEnvelope,
} from '../shared/match-diagnostics-schema';

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
    expect(exported.filename).toMatch(/^atomic-acres-match-atomic-acres-p-[a-f0-9]{16}\.json$/);
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

  it('preserves a dedicated damage ledger and a sanitized final per-participant state', () => {
    const diagnostics = logger();
    diagnostics.record({
      monotonicMs: 10, localEpochMs: 20, matchTimeMs: 8, eventId: 'damage-1', eventType: 'damage-applied',
      actorId: 'real-attacker', actorKind: 'player', targetId: 'real-target', targetKind: 'practice-target',
      admission: 'accepted', damageApplied: 42, healthBefore: 100, healthAfter: 58, hitZone: 'head',
      critical: true, wallbang: true, penetrationMultiplier: 0.72, distanceMeters: 18.4,
    });
    for (let index = 0; index < MAX_DIAGNOSTIC_EVENTS + 10; index += 1) diagnostics.record({
      monotonicMs: index, localEpochMs: index, eventId: `noise-${index}`, eventType: 'state-reconciliation', admission: 'observed',
    });
    diagnostics.setFinalState({
      participants: [{ participantId: diagnostics.participantKey('real-attacker'), kills: 3 }],
      roomCode: 'must-not-export',
    });
    const parsed = JSON.parse(diagnostics.export().json);
    expect(parsed.damageLedger).toHaveLength(1);
    expect(parsed.damageLedger[0]).toMatchObject({ damageApplied: 42, hitZone: 'head', critical: true, wallbang: true });
    expect(parsed.finalState.participants[0]).toMatchObject({ kills: 3 });
    expect(parsed.finalState.roomCode).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('real-attacker');
    expect(MAX_DAMAGE_LEDGER_EVENTS).toBeGreaterThan(MAX_DIAGNOSTIC_EVENTS);
  });

  it('derives a compact remote envelope with ordered health, regen, admission, net, performance and final evidence', () => {
    const diagnostics = logger();
    diagnostics.record({
      monotonicMs: 10, localEpochMs: 20, matchTimeMs: 10, eventId: 'raw-network-nonce', eventType: 'damage-applied',
      actorId: 'Dave callsign peer-id', actorKind: 'player', targetId: 'guest-room-code', targetKind: 'player',
      weaponOrEffect: 'railgun', admission: 'accepted', reason: 'room_SECRET chat free text 192.168.1.4',
      healthBefore: 100, healthAfter: 50, damageRequested: 50, damageApplied: 50, wallbang: true,
    });
    diagnostics.record({
      monotonicMs: 20, localEpochMs: 30, matchTimeMs: 20, eventId: 'regen-1', eventType: 'health-regen',
      actorId: 'guest-room-code', actorKind: 'player', admission: 'accepted', healthBefore: 50, healthAfter: 51,
    });
    diagnostics.record({
      monotonicMs: 30, localEpochMs: 40, matchTimeMs: 30, eventId: 'state-1', eventType: 'state-reconciliation',
      actorId: 'guest-room-code', actorKind: 'player', admission: 'rejected', reason: 'raw peer id and stack text',
    });
    for (const sample of [8, 16, 16, 20, 50, 100]) diagnostics.recordFrame(sample);
    const envelope = diagnostics.remoteEnvelope({
      completedAtEpochMs: 1_800_000,
      pass: 'PASS 64',
      backend: 'webgpu',
      durationMs: 30,
      network: {
        rttMs: 23, jitterMs: 7, clockOffsetMs: -14, interpolationDelayMs: 71,
        receiverSequenceGaps: 2, receiverReordered: 1, droppedDamageEvents: 3,
      },
      participants: [
        { id: 'Dave callsign peer-id', kind: 'player', team: 'team-1', kills: 2, deaths: 1, damageDealt: 150, damageTaken: 50, finalHealth: 51 },
        { id: 'guest-room-code', kind: 'player', team: 'team-2', kills: 1, deaths: 2, damageDealt: 50, damageTaken: 150, finalHealth: 0 },
      ],
      local: { kills: 2, deaths: 1, shotsFired: 4, hitShots: 3, damageDealt: 150, damageTaken: 50, headshots: 1 },
    });
    expect(validateMatchDiagnosticEnvelope(envelope)).toEqual({ envelope, error: null });
    expect(envelope.events.map((event) => [event.sequence, event.category, event.atMs])).toEqual([
      [0, 'damage', 10], [1, 'regen', 20], [2, 'admission', 30],
    ]);
    expect(envelope.net).toMatchObject({ rttBucketMs: 20, jitterBucketMs: 5, clockOffsetBucketMs: -10, interpolationDelayBucketMs: 70 });
    expect(envelope.perf).toMatchObject({ sampleCount: 6, frameP50BucketMs: 16, frameP95BucketMs: 100, frameP99BucketMs: 100 });
    expect(envelope.final.participants).toHaveLength(2);
    const serialized = JSON.stringify(envelope);
    for (const forbidden of ['Dave', 'guest-room-code', 'raw-network-nonce', 'free text', '192.168.1.4', 'room_SECRET']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('caps the automatic envelope independently from the larger downloadable ledger', () => {
    const diagnostics = logger();
    for (let index = 0; index < MAX_DIAGNOSTIC_EVENTS; index += 1) diagnostics.record({
      monotonicMs: index, localEpochMs: index, matchTimeMs: index,
      eventId: `event-${index}`, eventType: 'damage-applied', actorId: `peer-${index % 8}`, targetId: `target-${index % 8}`,
      actorKind: 'player', targetKind: 'player', weaponOrEffect: 'carbine', admission: 'accepted',
      healthBefore: 100, healthAfter: 99, damageRequested: 1, damageApplied: 1,
    });
    const envelope = diagnostics.remoteEnvelope({
      completedAtEpochMs: 1_800_000, pass: 'PASS 64', backend: 'webgpu', durationMs: MAX_DIAGNOSTIC_EVENTS,
      network: { rttMs: null, jitterMs: 0, clockOffsetMs: 0, interpolationDelayMs: 0, receiverSequenceGaps: 0, receiverReordered: 0, droppedDamageEvents: 0 },
      participants: [{ id: 'peer-0', kind: 'player', team: 'team-1', kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0, finalHealth: 100 }],
      local: { kills: 0, deaths: 0, shotsFired: 0, hitShots: 0, damageDealt: 0, damageTaken: 0, headshots: 0 },
    });
    expect(envelope.events.length).toBeLessThanOrEqual(MATCH_DIAGNOSTIC_MAX_EVENTS);
    expect(new TextEncoder().encode(JSON.stringify(envelope)).byteLength).toBeLessThanOrEqual(MATCH_DIAGNOSTIC_MAX_BODY_BYTES);
    expect(envelope.droppedEvents).toBeGreaterThan(0);
  });
});
