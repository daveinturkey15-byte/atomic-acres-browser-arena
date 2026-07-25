import {
  validateMatchDiagnosticEnvelope,
  type MatchDiagnosticUploadEnvelope,
  type MatchDiagnosticUploadEvent,
} from '../shared/match-diagnostics-schema';

export const DEFAULT_BAD_FRAME_P95_MS = 33;

export type DiagnosticFlagSeverity = 'info' | 'warning' | 'error';

export type DiagnosticAnalysisFlag = Readonly<{
  code: string;
  severity: DiagnosticFlagSeverity;
  message: string;
  eventSequence?: number;
  participant?: string;
  observed?: number | string;
  expected?: number | string;
  count?: number;
}>;

export type DiagnosticMatchAnalysis = Readonly<{
  match: string;
  buildId: string;
  pass: string;
  backend: MatchDiagnosticUploadEnvelope['backend'];
  arena: MatchDiagnosticUploadEnvelope['arena'];
  mode: MatchDiagnosticUploadEnvelope['mode'];
  role: MatchDiagnosticUploadEnvelope['role'];
  eventCount: number;
  droppedEvents: number;
  flags: readonly DiagnosticAnalysisFlag[];
}>;

export type DiagnosticGroupAnalysis = Readonly<{
  buildId: string;
  arena: MatchDiagnosticUploadEnvelope['arena'];
  mode: MatchDiagnosticUploadEnvelope['mode'];
  role: MatchDiagnosticUploadEnvelope['role'];
  matches: number;
  events: number;
  droppedEvents: number;
  rejectedAdmissions: number;
  receiverSequenceGaps: number;
  receiverReordered: number;
  droppedDamageEvents: number;
  healthAnomalies: number;
  fatalMatches: number;
  badFrameP95Matches: number;
  errors: number;
  warnings: number;
}>;

export type DiagnosticAnalysisReport = Readonly<{
  schemaVersion: 1;
  thresholds: Readonly<{ badFrameP95Ms: number }>;
  totals: Readonly<{
    lines: number;
    validLines: number;
    invalidLines: number;
    matches: number;
    flags: number;
    errors: number;
    warnings: number;
  }>;
  groups: readonly DiagnosticGroupAnalysis[];
  matches: readonly DiagnosticMatchAnalysis[];
  invalidLines: readonly Readonly<{ line: number; error: string }>[];
}>;

type MutableGroup = {
  buildId: string;
  arena: MatchDiagnosticUploadEnvelope['arena'];
  mode: MatchDiagnosticUploadEnvelope['mode'];
  role: MatchDiagnosticUploadEnvelope['role'];
  matches: number;
  events: number;
  droppedEvents: number;
  rejectedAdmissions: number;
  receiverSequenceGaps: number;
  receiverReordered: number;
  droppedDamageEvents: number;
  healthAnomalies: number;
  fatalMatches: number;
  badFrameP95Matches: number;
  errors: number;
  warnings: number;
};

type HealthState = {
  health: number;
  deathObserved: boolean;
  lastAtMs: number;
  lastBefore?: number;
  lastAfter?: number;
};

const HEALTH_ANOMALY_CODES = new Set([
  'damage-transition-incomplete',
  'health-arithmetic-mismatch',
  'regen-transition-invalid',
  'death-transition-invalid',
  'death-without-lethal-transition',
  'duplicate-death-transition',
  'post-death-health-transition',
  'health-continuity-gap',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameHealth(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.1;
}

function healthSubject(event: MatchDiagnosticUploadEvent): string | undefined {
  if (event.category === 'regen') return event.actor;
  if (event.category === 'damage' || event.category === 'death') return event.target;
  return event.target ?? event.actor;
}

function flag(
  flags: DiagnosticAnalysisFlag[],
  code: string,
  severity: DiagnosticFlagSeverity,
  message: string,
  details: Omit<DiagnosticAnalysisFlag, 'code' | 'severity' | 'message'> = {},
): void {
  flags.push({ code, severity, message, ...details });
}

function analyzeHealthEvents(envelope: MatchDiagnosticUploadEnvelope, flags: DiagnosticAnalysisFlag[]): void {
  const states = new Map<string, HealthState>();
  for (const event of envelope.events) {
    const participant = healthSubject(event);
    const mutatesHealth = event.admission !== 'rejected';
    const hasCompleteDamage = event.healthBefore !== undefined
      && event.healthAfter !== undefined
      && event.damageApplied !== undefined;
    const canonicalCatchDown = event.category === 'damage'
      && hasCompleteDamage
      && event.damageRequested !== undefined
      && event.damageApplied! > event.damageRequested + 0.1;
    const canonicalUpward = event.category === 'damage'
      && hasCompleteDamage
      && (event.damageRequested ?? 0) > 0
      && event.damageApplied === 0
      && event.healthAfter! > event.healthBefore! + 0.1;

    if (event.category === 'damage' && mutatesHealth) {
      if (!hasCompleteDamage || !participant) {
        flag(flags, 'damage-transition-incomplete', 'warning', 'Accepted or observed damage lacks a complete target health transition.', {
          eventSequence: event.sequence,
          ...(participant ? { participant } : {}),
        });
      } else {
        const expectedAfter = Math.max(0, event.healthBefore! - event.damageApplied!);
        if (canonicalCatchDown) {
          flag(flags, 'host-canonical-catch-down', 'warning', 'Canonical health applied more loss than the newly admitted hit, indicating client catch-down.', {
            eventSequence: event.sequence,
            participant,
            observed: event.damageApplied,
            expected: event.damageRequested,
          });
        }
        if (canonicalUpward) {
          flag(flags, 'host-canonical-upward', 'info', 'Canonical host health moved upward while the admitted hit restarted regeneration delay.', {
            eventSequence: event.sequence,
            participant,
            observed: event.healthAfter,
            expected: event.healthBefore,
          });
        } else if (!sameHealth(event.healthAfter!, expectedAfter)) {
          flag(flags, 'health-arithmetic-mismatch', 'error', 'Health before minus applied damage does not equal health after.', {
            eventSequence: event.sequence,
            participant,
            observed: event.healthAfter,
            expected: expectedAfter,
          });
        }
      }
    }

    if (event.category === 'regen' && mutatesHealth) {
      const valid = Boolean(participant)
        && event.healthBefore !== undefined
        && event.healthAfter !== undefined
        && event.healthAfter > event.healthBefore + 0.1
        && event.healthAfter <= 100;
      if (!valid) {
        flag(flags, 'regen-transition-invalid', 'error', 'Regeneration must increase a known participant health value without exceeding 100.', {
          eventSequence: event.sequence,
          ...(participant ? { participant } : {}),
          ...(event.healthAfter !== undefined ? { observed: event.healthAfter } : {}),
        });
      }
    }

    if (event.category === 'death' && mutatesHealth) {
      if (!participant || event.healthAfter === undefined || !sameHealth(event.healthAfter, 0)) {
        flag(flags, 'death-transition-invalid', 'error', 'Death must identify a target and end at zero health.', {
          eventSequence: event.sequence,
          ...(participant ? { participant } : {}),
          ...(event.healthAfter !== undefined ? { observed: event.healthAfter, expected: 0 } : {}),
        });
      }
    }

    if (!mutatesHealth || !participant) continue;
    const previous = states.get(participant);
    const isLifecycleReset = event.source === 'spawn' || event.source === 'redeploy';
    const duplicateTransition = previous
      && event.healthBefore !== undefined
      && event.healthAfter !== undefined
      && previous.lastBefore !== undefined
      && previous.lastAfter !== undefined
      && sameHealth(event.healthBefore, previous.lastBefore)
      && sameHealth(event.healthAfter, previous.lastAfter)
      && event.atMs === previous.lastAtMs;

    if (event.category === 'death') {
      if (previous?.deathObserved && envelope.droppedEvents === 0) {
        flag(flags, 'duplicate-death-transition', 'error', 'A participant died again without an observed lifecycle reset.', {
          eventSequence: event.sequence,
          participant,
        });
      } else if (previous && previous.health > 0.1 && event.healthBefore === undefined && envelope.droppedEvents === 0) {
        flag(flags, 'death-without-lethal-transition', 'error', 'Death followed a positive health state without an observed lethal transition.', {
          eventSequence: event.sequence,
          participant,
          observed: previous.health,
          expected: 0,
        });
      }
      states.set(participant, { health: 0, deathObserved: true, lastAtMs: event.atMs, lastAfter: 0 });
      continue;
    }

    if (previous?.deathObserved && !isLifecycleReset && (event.healthBefore ?? event.healthAfter ?? 0) > 0.1 && envelope.droppedEvents === 0) {
      flag(flags, 'post-death-health-transition', 'error', 'Positive health appeared after death without an observed spawn or redeploy.', {
        eventSequence: event.sequence,
        participant,
        observed: event.healthBefore ?? event.healthAfter,
        expected: 0,
      });
    }
    if (previous
      && event.healthBefore !== undefined
      && !sameHealth(event.healthBefore, previous.health)
      && !isLifecycleReset
      && !duplicateTransition
      && !canonicalCatchDown
      && !canonicalUpward
      && envelope.droppedEvents === 0) {
      flag(flags, 'health-continuity-gap', 'warning', 'The next health transition did not begin at the preceding canonical health.', {
        eventSequence: event.sequence,
        participant,
        observed: event.healthBefore,
        expected: previous.health,
      });
    }
    if (event.healthAfter !== undefined) {
      states.set(participant, {
        health: event.healthAfter,
        deathObserved: isLifecycleReset ? false : previous?.deathObserved ?? false,
        lastAtMs: event.atMs,
        ...(event.healthBefore !== undefined ? { lastBefore: event.healthBefore } : {}),
        lastAfter: event.healthAfter,
      });
    }
  }
}

function analyzeEnvelope(envelope: MatchDiagnosticUploadEnvelope, badFrameP95Ms: number): DiagnosticMatchAnalysis {
  const flags: DiagnosticAnalysisFlag[] = [];
  analyzeHealthEvents(envelope, flags);
  if (envelope.droppedEvents > 0) {
    flag(flags, 'dropped-event-truncation', 'warning', 'The retained event timeline is truncated; continuity conclusions may be incomplete.', {
      count: envelope.droppedEvents,
    });
  }
  const rejected = envelope.events.filter((event) => event.admission === 'rejected');
  if (rejected.length > 0) {
    flag(flags, 'rejected-admissions', 'warning', 'One or more gameplay admissions were rejected.', { count: rejected.length });
  }
  if (envelope.net.receiverSequenceGaps > 0) {
    flag(flags, 'network-sequence-gaps', 'warning', 'The receiver observed missing network sequence positions.', {
      count: envelope.net.receiverSequenceGaps,
    });
  }
  if (envelope.net.receiverReordered > 0) {
    flag(flags, 'network-reordering', 'warning', 'The receiver observed reordered network state.', {
      count: envelope.net.receiverReordered,
    });
  }
  if (envelope.net.droppedDamageEvents > 0) {
    flag(flags, 'network-dropped-damage', 'error', 'Damage evidence was dropped before collection.', {
      count: envelope.net.droppedDamageEvents,
    });
  }
  for (const category of envelope.final.fatalRuntimeErrorCategories) {
    flag(flags, 'fatal-runtime-category', 'error', 'The match reported a fatal runtime category.', { observed: category });
  }
  if (envelope.perf.sampleCount > 0 && envelope.perf.frameP95BucketMs > badFrameP95Ms) {
    flag(flags, 'bad-frame-p95', 'warning', 'Frame-time p95 exceeded the configured operator threshold.', {
      observed: envelope.perf.frameP95BucketMs,
      expected: badFrameP95Ms,
    });
  }
  return {
    match: envelope.matchId,
    buildId: envelope.buildId,
    pass: envelope.pass,
    backend: envelope.backend,
    arena: envelope.arena,
    mode: envelope.mode,
    role: envelope.role,
    eventCount: envelope.events.length,
    droppedEvents: envelope.droppedEvents,
    flags,
  };
}

function parseCollectorLine(value: unknown): { envelope: MatchDiagnosticUploadEnvelope | null; error: string | null } {
  if (!isRecord(value)) return { envelope: null, error: 'invalid collector record' };
  const keys = Object.keys(value);
  if (keys.length !== 3 || !keys.every((key) => ['receiptId', 'receivedAt', 'envelope'].includes(key))) {
    return { envelope: null, error: 'invalid collector record shape' };
  }
  if (typeof value.receiptId !== 'string' || !/^local_md_[a-f0-9]{32}$/.test(value.receiptId)) {
    return { envelope: null, error: 'invalid collector receipt' };
  }
  if (typeof value.receivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.receivedAt)
    || !Number.isFinite(Date.parse(value.receivedAt))) {
    return { envelope: null, error: 'invalid collector timestamp' };
  }
  return validateMatchDiagnosticEnvelope(value.envelope);
}

function groupKey(match: Pick<DiagnosticMatchAnalysis, 'buildId' | 'arena' | 'mode' | 'role'>): string {
  return `${match.buildId}\u0000${match.arena}\u0000${match.mode}\u0000${match.role}`;
}

export function analyzePass64DiagnosticsJsonl(
  jsonl: string,
  options: Readonly<{ badFrameP95Ms?: number }> = {},
): DiagnosticAnalysisReport {
  const badFrameP95Ms = options.badFrameP95Ms ?? DEFAULT_BAD_FRAME_P95_MS;
  if (!Number.isSafeInteger(badFrameP95Ms) || badFrameP95Ms < 1 || badFrameP95Ms > 1_000) {
    throw new Error('bad frame p95 threshold must be an integer from 1 to 1000 milliseconds');
  }
  const rawLines = jsonl.split(/\r?\n/);
  if (rawLines.at(-1) === '') rawLines.pop();
  const invalidLines: { line: number; error: string }[] = [];
  const matches: DiagnosticMatchAnalysis[] = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index];
    if (!raw.trim()) {
      invalidLines.push({ line: index + 1, error: 'blank JSONL line' });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      invalidLines.push({ line: index + 1, error: 'invalid JSON' });
      continue;
    }
    const validated = parseCollectorLine(parsed);
    if (!validated.envelope) {
      invalidLines.push({ line: index + 1, error: validated.error ?? 'invalid envelope' });
      continue;
    }
    matches.push(analyzeEnvelope(validated.envelope, badFrameP95Ms));
  }

  const groups = new Map<string, MutableGroup>();
  for (const match of matches) {
    const key = groupKey(match);
    const current = groups.get(key) ?? {
      buildId: match.buildId,
      arena: match.arena,
      mode: match.mode,
      role: match.role,
      matches: 0,
      events: 0,
      droppedEvents: 0,
      rejectedAdmissions: 0,
      receiverSequenceGaps: 0,
      receiverReordered: 0,
      droppedDamageEvents: 0,
      healthAnomalies: 0,
      fatalMatches: 0,
      badFrameP95Matches: 0,
      errors: 0,
      warnings: 0,
    };
    current.matches += 1;
    current.events += match.eventCount;
    current.droppedEvents += match.droppedEvents;
    current.rejectedAdmissions += match.flags.find((item) => item.code === 'rejected-admissions')?.count ?? 0;
    current.receiverSequenceGaps += match.flags.find((item) => item.code === 'network-sequence-gaps')?.count ?? 0;
    current.receiverReordered += match.flags.find((item) => item.code === 'network-reordering')?.count ?? 0;
    current.droppedDamageEvents += match.flags.find((item) => item.code === 'network-dropped-damage')?.count ?? 0;
    current.healthAnomalies += match.flags.filter((item) => HEALTH_ANOMALY_CODES.has(item.code)).length;
    current.fatalMatches += Number(match.flags.some((item) => item.code === 'fatal-runtime-category'));
    current.badFrameP95Matches += Number(match.flags.some((item) => item.code === 'bad-frame-p95'));
    current.errors += match.flags.filter((item) => item.severity === 'error').length;
    current.warnings += match.flags.filter((item) => item.severity === 'warning').length;
    groups.set(key, current);
  }
  const orderedMatches = [...matches].sort((left, right) => groupKey(left).localeCompare(groupKey(right)) || left.match.localeCompare(right.match));
  const orderedGroups = [...groups.values()].sort((left, right) => groupKey(left).localeCompare(groupKey(right)));
  const flags = matches.flatMap((match) => match.flags);
  return {
    schemaVersion: 1,
    thresholds: { badFrameP95Ms },
    totals: {
      lines: rawLines.length,
      validLines: matches.length,
      invalidLines: invalidLines.length,
      matches: matches.length,
      flags: flags.length,
      errors: flags.filter((item) => item.severity === 'error').length,
      warnings: flags.filter((item) => item.severity === 'warning').length,
    },
    groups: orderedGroups,
    matches: orderedMatches,
    invalidLines,
  };
}

export function formatPass64DiagnosticsAnalysis(report: DiagnosticAnalysisReport): string {
  const lines = [
    `Pass 64 diagnostics: ${report.totals.validLines}/${report.totals.lines} valid lines; ${report.totals.errors} errors, ${report.totals.warnings} warnings.`,
    `Bad frame p95 threshold: ${report.thresholds.badFrameP95Ms} ms.`,
  ];
  if (report.groups.length > 0) {
    lines.push('Groups:');
    for (const group of report.groups) {
      lines.push(`- ${group.buildId} | ${group.arena}/${group.mode}/${group.role}: ${group.matches} matches, ${group.events} events, ${group.healthAnomalies} health anomalies, ${group.errors} errors, ${group.warnings} warnings`);
    }
  }
  const flagged = report.matches.filter((match) => match.flags.length > 0);
  if (flagged.length > 0) {
    lines.push('Flagged matches:');
    for (const match of flagged) {
      lines.push(`- ${match.match} | ${match.buildId} | ${match.arena}/${match.mode}/${match.role}`);
      for (const item of match.flags) {
        const context = [
          item.eventSequence !== undefined ? `event=${item.eventSequence}` : '',
          item.participant ? `participant=${item.participant}` : '',
          item.count !== undefined ? `count=${item.count}` : '',
          item.observed !== undefined ? `observed=${item.observed}` : '',
          item.expected !== undefined ? `expected=${item.expected}` : '',
        ].filter(Boolean).join(' ');
        lines.push(`  ${item.severity.toUpperCase()} ${item.code}${context ? ` (${context})` : ''}: ${item.message}`);
      }
    }
  }
  if (report.invalidLines.length > 0) {
    lines.push('Invalid lines:');
    for (const invalid of report.invalidLines) lines.push(`- line ${invalid.line}: ${invalid.error}`);
  }
  return lines.join('\n');
}
