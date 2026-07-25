import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createPass64DiagnosticsCollector } from '../scripts/qa/collect-pass64-match-diagnostics';
import { MatchDiagnostics } from './match-diagnostics';

function validEnvelope() {
  const diagnostics = new MatchDiagnostics({
    buildId: 'pass64-collector-test', sourceId: 'collector-test', sessionId: randomUUID(),
    role: 'offline', arena: 'atomic-acres', mode: 'solo',
  });
  return diagnostics.remoteEnvelope({
    completedAtEpochMs: 1_800_000, pass: 'PASS 64', backend: 'webgpu', durationMs: 1_000,
    network: { rttMs: null, jitterMs: 0, clockOffsetMs: 0, interpolationDelayMs: 0, receiverSequenceGaps: 0, receiverReordered: 0, droppedDamageEvents: 0 },
    participants: [{ id: 'local', kind: 'player', team: 'team-1', kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0, finalHealth: 100 }],
    local: { kills: 0, deaths: 0, shotsFired: 0, hitShots: 0, damageDealt: 0, damageTaken: 0, headshots: 0 },
  });
}

describe('localhost Pass 64 diagnostic collector', () => {
  it('writes one validated envelope and denies public origins and reads', async () => {
    const outputFile = resolve('artifacts', 'pass64', `collector-test-${randomUUID()}.jsonl`);
    const server = createPass64DiagnosticsCollector(outputFile);
    await new Promise<void>((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
    const port = (server.address() as AddressInfo).port;
    const endpoint = `http://127.0.0.1:${port}/v1/match-diagnostics`;
    const envelope = validEnvelope();
    try {
      const denied = await fetch(endpoint, { method: 'POST', headers: { Origin: 'https://public.example', 'Content-Type': 'text/plain' }, body: '{}' });
      expect(denied.status).toBe(403);
      const read = await fetch(endpoint, { headers: { Origin: 'http://127.0.0.1:4173' } });
      expect(read.status).toBe(404);
      const accepted = await fetch(endpoint, {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1:4173', 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(envelope),
      });
      expect(accepted.status).toBe(201);
      const receipt = await accepted.json() as { receiptId: string };
      expect(receipt).toMatchObject({ accepted: true, idempotent: false });
      const duplicate = await fetch(endpoint, {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1:4173', 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(envelope),
      });
      expect(duplicate.status).toBe(200);
      expect(await duplicate.json()).toMatchObject({ accepted: true, idempotent: true, receiptId: receipt.receiptId });
      const rows = (await readFile(outputFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
      expect(rows).toHaveLength(1);
      expect(rows[0].envelope).toMatchObject({ schemaVersion: 1, pass: 'PASS 64', role: 'offline' });
    } finally {
      await new Promise<void>((resolveClosed, rejectClosed) => server.close((error) => error ? rejectClosed(error) : resolveClosed()));
    }
  });
});
