import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

describe('current owner feedback is reachable beyond the frozen Pass65 graph', () => {
  it('retains explicit HF566 ownership, falsifiers and executable test targets', () => {
    const graph = read('docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json');
    expect(graph.continuationRegisters).toContain('docs/OWNER_FEEDBACK_CONTINUATION.json');
    const register = read('docs/OWNER_FEEDBACK_CONTINUATION.json');
    expect(register.grantsAcceptance).toBe(false);
    const rows = register.requirements;
    expect(new Set(rows.map((r: {id: string}) => r.id)).size).toBe(rows.length);
    expect(new Set(rows.map((r: {feedbackId: string}) => r.feedbackId)).size).toBe(rows.length);
    const row = rows.find((r: {feedbackId: string}) => r.feedbackId === 'HF-566');
    expect(row).toBeDefined();
    expect(row.id).toBe('LOBBY-LIFETIME-001');
    expect(row.owner).toBe('delivery-integration-20260911 / Codex integrator');
    expect(row.outcomes).toHaveLength(3);
    expect(row.tests).toEqual([
      'src/lobby-lifetime-storage.test.ts',
      'src/network-lobby-lifetime.test.ts',
      'src/lobby-lifetime-main.test.ts',
    ]);
    expect(['OPEN', 'IMPLEMENTED', 'VERIFIED']).toContain(row.state);
    const source = readFileSync(resolve(root, register.source), 'utf8');
    expect(source).toContain('| HF-566 | P1 |');
    expect(source).toContain('Create-close-create reuses a code');
    // OPEN is a registered obligation, never evidence of implemented behavior.
    if (row.state !== 'OPEN') {
      for (const test of row.tests) expect(existsSync(resolve(root, test)), test).toBe(true);
    }
    if (row.state === 'VERIFIED') {
      expect(row.evidence.length).toBeGreaterThan(0);
      for (const evidence of row.evidence) {
        expect(evidence.sourceSha).toMatch(/^[a-f0-9]{40}$/);
        expect(existsSync(resolve(root, evidence.path)), evidence.path).toBe(true);
      }
    }
  });
});
