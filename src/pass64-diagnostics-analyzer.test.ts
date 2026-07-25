import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  MatchDiagnosticUploadEnvelope,
  MatchDiagnosticUploadEvent,
} from '../shared/match-diagnostics-schema';
import {
  analyzePass64DiagnosticsJsonl,
  formatPass64DiagnosticsAnalysis,
} from './pass64-diagnostics-analyzer';
import { runPass64DiagnosticsAnalyzer } from '../scripts/qa/analyze-pass64-match-diagnostics';

const LOCAL = 'p-1111111111111111';
const REMOTE = 'p-2222222222222222';

function envelope(
  matchId: string,
  events: readonly MatchDiagnosticUploadEvent[] = [],
  overrides: Partial<MatchDiagnosticUploadEnvelope> = {},
): MatchDiagnosticUploadEnvelope {
  const role = overrides.role ?? 'host';
  return {
    schemaVersion: 1,
    idempotencyKey: `diagnostic:${matchId}:${role}`,
    matchId,
    completedAtEpochMinute: 1_800_000,
    buildId: 'pass64-analyzer-test',
    pass: 'PASS 64',
    backend: 'webgpu',
    arena: 'atomic-acres',
    mode: 'tdm',
    role,
    durationMs: 60_000,
    events,
    droppedEvents: 0,
    net: {
      rttBucketMs: 20,
      jitterBucketMs: 5,
      clockOffsetBucketMs: 0,
      interpolationDelayBucketMs: 35,
      receiverSequenceGaps: 0,
      receiverReordered: 0,
      droppedDamageEvents: 0,
    },
    perf: {
      sampleCount: 3_600,
      frameP50BucketMs: 16,
      frameP95BucketMs: 20,
      frameP99BucketMs: 33,
      maximumFrameBucketMs: 50,
    },
    final: {
      participantCount: 2,
      participants: [
        { participant: LOCAL, kind: 'player', team: 0, kills: 1, deaths: 0, damageDealt: 100, damageTaken: 0, finalHealth: 100 },
        { participant: REMOTE, kind: 'player', team: 1, kills: 0, deaths: 1, damageDealt: 0, damageTaken: 100, finalHealth: 0 },
      ],
      local: { kills: 1, deaths: 0, shotsFired: 4, hitShots: 2, damageDealt: 100, damageTaken: 0, headshots: 0 },
      fatalRuntimeErrorCategories: [],
    },
    ...overrides,
  };
}

function collectorLine(value: MatchDiagnosticUploadEnvelope, receipt = 'a'.repeat(32)): string {
  return JSON.stringify({
    receiptId: `local_md_${receipt}`,
    receivedAt: '2026-07-25T12:00:00.000Z',
    envelope: value,
  });
}

describe('Pass 64 diagnostics analyzer', () => {
  it('accepts a coherent regen, lethal damage and death sequence without health anomalies', () => {
    const events: MatchDiagnosticUploadEvent[] = [
      { sequence: 0, atMs: 1_000, category: 'regen', admission: 'accepted', actor: REMOTE, actorKind: 'player', source: 'state', healthBefore: 20, healthAfter: 100 },
      { sequence: 1, atMs: 2_000, category: 'damage', admission: 'accepted', actor: LOCAL, target: REMOTE, source: 'firearm', healthBefore: 100, healthAfter: 77, damageRequested: 23, damageApplied: 23 },
      { sequence: 2, atMs: 3_000, category: 'damage', admission: 'accepted', actor: LOCAL, target: REMOTE, source: 'railgun', healthBefore: 77, healthAfter: 0, damageRequested: 77, damageApplied: 77 },
      { sequence: 3, atMs: 3_000, category: 'death', admission: 'accepted', actor: LOCAL, target: REMOTE, source: 'railgun', healthAfter: 0 },
    ];
    const report = analyzePass64DiagnosticsJsonl(`${collectorLine(envelope('p-0123456789abcdef', events))}\n`);
    expect(report.totals).toMatchObject({ lines: 1, validLines: 1, invalidLines: 0, errors: 0, warnings: 0 });
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]).toMatchObject({
      buildId: 'pass64-analyzer-test', arena: 'atomic-acres', mode: 'tdm', role: 'host', matches: 1, healthAnomalies: 0,
    });
  });

  it('flags semantic health failures and distinguishes canonical reconciliation patterns', () => {
    const events: MatchDiagnosticUploadEvent[] = [
      { sequence: 0, atMs: 10, category: 'damage', admission: 'accepted', actor: LOCAL, target: REMOTE, source: 'firearm', healthBefore: 100, healthAfter: 70, damageRequested: 20, damageApplied: 20 },
      { sequence: 1, atMs: 20, category: 'regen', admission: 'accepted', actor: REMOTE, source: 'state', healthBefore: 70, healthAfter: 60 },
      { sequence: 2, atMs: 30, category: 'damage', admission: 'observed', actor: LOCAL, target: REMOTE, source: 'firearm', healthBefore: 100, healthAfter: 70, damageRequested: 10, damageApplied: 30 },
      { sequence: 3, atMs: 40, category: 'damage', admission: 'observed', actor: LOCAL, target: REMOTE, source: 'firearm', healthBefore: 70, healthAfter: 80, damageRequested: 10, damageApplied: 0 },
      { sequence: 4, atMs: 50, category: 'death', admission: 'accepted', actor: LOCAL, target: REMOTE, source: 'firearm', healthAfter: 10 },
    ];
    const report = analyzePass64DiagnosticsJsonl(collectorLine(envelope('p-0123456789abcdef', events)));
    const flags = report.matches[0].flags;
    expect(flags.map((item) => item.code)).toEqual(expect.arrayContaining([
      'health-arithmetic-mismatch',
      'regen-transition-invalid',
      'host-canonical-catch-down',
      'host-canonical-upward',
      'death-transition-invalid',
      'death-without-lethal-transition',
    ]));
    expect(flags.find((item) => item.code === 'host-canonical-catch-down')).toMatchObject({
      severity: 'warning', participant: REMOTE, observed: 30, expected: 10,
    });
    expect(flags.find((item) => item.code === 'host-canonical-upward')?.severity).toBe('info');
  });

  it('summarizes truncation, admissions, network failures, fatal categories and bad p95 by context', () => {
    const events: MatchDiagnosticUploadEvent[] = [
      { sequence: 0, atMs: 10, category: 'admission', admission: 'rejected', actor: REMOTE, source: 'state' },
    ];
    const first = envelope('p-0123456789abcdef', events, {
      droppedEvents: 12,
      net: { rttBucketMs: 40, jitterBucketMs: 10, clockOffsetBucketMs: 0, interpolationDelayBucketMs: 50, receiverSequenceGaps: 3, receiverReordered: 2, droppedDamageEvents: 1 },
      perf: { sampleCount: 300, frameP50BucketMs: 20, frameP95BucketMs: 50, frameP99BucketMs: 100, maximumFrameBucketMs: 100 },
      final: {
        participantCount: 2,
        participants: [
          { participant: LOCAL, kind: 'player', team: 0, kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0, finalHealth: 100 },
          { participant: REMOTE, kind: 'player', team: 1, kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0, finalHealth: 100 },
        ],
        local: { kills: 0, deaths: 0, shotsFired: 0, hitShots: 0, damageDealt: 0, damageTaken: 0, headshots: 0 },
        fatalRuntimeErrorCategories: ['network'],
      },
    });
    const second = envelope('p-fedcba9876543210', [], {
      buildId: 'pass64-second-build', arena: 'skyline-terminal', mode: 'ffa', role: 'guest',
      idempotencyKey: 'diagnostic:p-fedcba9876543210:guest',
    });
    const report = analyzePass64DiagnosticsJsonl(`${collectorLine(first)}\n${collectorLine(second, 'b'.repeat(32))}`, { badFrameP95Ms: 33 });
    expect(report.groups).toHaveLength(2);
    expect(report.groups.find((group) => group.buildId === 'pass64-analyzer-test')).toMatchObject({
      matches: 1,
      droppedEvents: 12,
      rejectedAdmissions: 1,
      receiverSequenceGaps: 3,
      receiverReordered: 2,
      droppedDamageEvents: 1,
      fatalMatches: 1,
      badFrameP95Matches: 1,
    });
    const codes = report.matches.find((match) => match.match === first.matchId)?.flags.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining([
      'dropped-event-truncation', 'rejected-admissions', 'network-sequence-gaps', 'network-reordering',
      'network-dropped-damage', 'fatal-runtime-category', 'bad-frame-p95',
    ]));
  });

  it('reports invalid line numbers without echoing records or collector identifiers', () => {
    const rawSecret = 'raw-collector-secret-should-not-echo';
    const valid = collectorLine(envelope('p-0123456789abcdef'));
    const wrongReceipt = JSON.stringify({ receiptId: rawSecret, receivedAt: '2026-07-25T12:00:00.000Z', envelope: envelope('p-fedcba9876543210') });
    const report = analyzePass64DiagnosticsJsonl(`${valid}\n{${rawSecret}\n${wrongReceipt}\n\n`);
    expect(report.totals).toMatchObject({ lines: 4, validLines: 1, invalidLines: 3 });
    expect(report.invalidLines).toEqual([
      { line: 2, error: 'invalid JSON' },
      { line: 3, error: 'invalid collector receipt' },
      { line: 4, error: 'blank JSONL line' },
    ]);
    const json = JSON.stringify(report);
    const text = formatPass64DiagnosticsAnalysis(report);
    expect(json).not.toContain(rawSecret);
    expect(json).not.toContain('receiptId');
    expect(json).not.toContain('idempotencyKey');
    expect(text).not.toContain(rawSecret);
  });

  it('does not report a same-timestamp duplicate presentation as a continuity gap', () => {
    const transition: MatchDiagnosticUploadEvent = {
      sequence: 0, atMs: 20, category: 'damage', admission: 'observed', actor: LOCAL, target: REMOTE,
      source: 'firearm', healthBefore: 100, healthAfter: 77, damageRequested: 23, damageApplied: 23,
    };
    const report = analyzePass64DiagnosticsJsonl(collectorLine(envelope('p-0123456789abcdef', [
      transition,
      { ...transition, sequence: 1 },
    ])));
    expect(report.matches[0].flags.find((item) => item.code === 'health-continuity-gap')).toBeUndefined();
  });

  it('runs the JSON CLI without changing the supplied log or exposing collector identifiers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pass64-diagnostics-analyzer-'));
    const inputFile = join(directory, 'matches.jsonl');
    const contents = `${collectorLine(envelope('p-0123456789abcdef'))}\n`;
    await writeFile(inputFile, contents, 'utf8');
    const output: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((value) => output.push(String(value)));
    try {
      expect(await runPass64DiagnosticsAnalyzer([inputFile, '--json'])).toBe(0);
      expect(await readFile(inputFile, 'utf8')).toBe(contents);
      const rendered = output.join('\n');
      expect(rendered).toContain('"validLines": 1');
      expect(rendered).not.toContain('local_md_');
      expect(rendered).not.toContain('receivedAt');
      expect(rendered).not.toContain('idempotencyKey');
    } finally {
      log.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
