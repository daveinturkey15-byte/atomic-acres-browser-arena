import { describe, expect, it, vi } from 'vitest';
import { MatchDiagnostics } from './match-diagnostics';
import {
  MATCH_DIAGNOSTICS_QUEUE_LIMIT,
  MATCH_DIAGNOSTICS_QUEUE_STORAGE_KEY,
  MatchDiagnosticUploader,
} from './match-diagnostics-upload';
import type { MatchDiagnosticUploadEnvelope } from '../shared/match-diagnostics-schema';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function envelope(session = 'session'): MatchDiagnosticUploadEnvelope {
  const diagnostics = new MatchDiagnostics({
    buildId: 'pass64-local-candidate', sourceId: 'pass64-test', sessionId: session,
    role: 'offline', arena: 'atomic-acres', mode: 'solo',
  });
  diagnostics.record({
    monotonicMs: 1, localEpochMs: 2, matchTimeMs: 1, eventId: 'damage', eventType: 'damage-applied',
    actorId: 'local', targetId: 'bot', actorKind: 'player', targetKind: 'solo-bot',
    admission: 'accepted', damageApplied: 25, healthBefore: 100, healthAfter: 75,
  });
  return diagnostics.remoteEnvelope({
    completedAtEpochMs: 1_800_000, pass: 'PASS 64', backend: 'webgpu', durationMs: 1_000,
    network: { rttMs: null, jitterMs: 0, clockOffsetMs: 0, interpolationDelayMs: 0, receiverSequenceGaps: 0, receiverReordered: 0, droppedDamageEvents: 0 },
    participants: [{ id: 'local', kind: 'player', team: 'team-1', kills: 1, deaths: 0, damageDealt: 25, damageTaken: 0, finalHealth: 100 }],
    local: { kills: 1, deaths: 0, shotsFired: 1, hitShots: 1, damageDealt: 25, damageTaken: 0, headshots: 0 },
  });
}

describe('automatic completed-match diagnostic delivery', () => {
  it('never starts a request while a match is active, including page-lifecycle flushes', async () => {
    const storage = new MemoryStorage();
    storage.setItem(MATCH_DIAGNOSTICS_QUEUE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [envelope()] }));
    const fetcher = vi.fn();
    const beacon = vi.fn<(url: string | URL, data?: BodyInit | null) => boolean>(() => true);
    const uploader = new MatchDiagnosticUploader('https://diagnostics.example', storage, fetcher, beacon);
    uploader.beginMatch();
    expect(await uploader.flushPending()).toBe(0);
    expect(uploader.flushForPageLifecycle()).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(uploader.telemetry()).toMatchObject({ activeMatch: true, pending: 1, requestsDuringActiveMatch: 0 });
  });

  it('uses a CORS-safelisted text/plain beacon first after completion', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn();
    const beacon = vi.fn<(url: string | URL, data?: BodyInit | null) => boolean>(() => true);
    const uploader = new MatchDiagnosticUploader('https://diagnostics.example', storage, fetcher, beacon);
    uploader.beginMatch();
    expect(await uploader.completeMatch(envelope())).toBe(1);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe('https://diagnostics.example/v1/match-diagnostics');
    const body = beacon.mock.calls[0][1] as Blob;
    expect(body.type).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(await body.text())).toMatchObject({ schemaVersion: 1, pass: 'PASS 64' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(storage.getItem(MATCH_DIAGNOSTICS_QUEUE_STORAGE_KEY)).toBeNull();
  });

  it('falls back to a credential-free keepalive fetch and requires a receipt', async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ accepted: true, receiptId: 'md_receipt' }), { status: 201 }));
    const uploader = new MatchDiagnosticUploader('https://diagnostics.example', storage, fetcher, () => false);
    expect(await uploader.completeMatch(envelope())).toBe(1);
    expect(fetcher).toHaveBeenCalledWith('https://diagnostics.example/v1/match-diagnostics', expect.objectContaining({
      method: 'POST', keepalive: true, credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'application/json' },
    }));
    expect(storage.getItem(MATCH_DIAGNOSTICS_QUEUE_STORAGE_KEY)).toBeNull();
    expect(uploader.telemetry()).toMatchObject({ delivered: 1, lastDelivery: 'fetch' });
  });

  it('keeps one offline envelope and retries it once from the capped local queue', async () => {
    const storage = new MemoryStorage();
    const offlineFetch = vi.fn(async () => { throw new TypeError('offline'); });
    const first = new MatchDiagnosticUploader('https://diagnostics.example', storage, offlineFetch, () => false);
    expect(await first.completeMatch(envelope())).toBe(0);
    expect(first.telemetry().pending).toBe(1);
    expect(offlineFetch).toHaveBeenCalledTimes(1);

    const retryBeacon = vi.fn<(url: string | URL, data?: BodyInit | null) => boolean>(() => true);
    const retryFetch = vi.fn();
    const later = new MatchDiagnosticUploader('https://diagnostics.example', storage, retryFetch, retryBeacon);
    expect(await later.flushPending()).toBe(1);
    expect(retryBeacon).toHaveBeenCalledTimes(1);
    expect(retryFetch).not.toHaveBeenCalled();
    expect(later.telemetry().pending).toBe(0);
  });

  it('loads at most the newest four valid completed envelopes', () => {
    const storage = new MemoryStorage();
    const items = Array.from({ length: MATCH_DIAGNOSTICS_QUEUE_LIMIT + 3 }, (_, index) => envelope(`session-${index}`));
    storage.setItem(MATCH_DIAGNOSTICS_QUEUE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items }));
    const uploader = new MatchDiagnosticUploader('https://diagnostics.example', storage, vi.fn(), vi.fn(() => false));
    expect(uploader.telemetry().pending).toBe(MATCH_DIAGNOSTICS_QUEUE_LIMIT);
  });
});
