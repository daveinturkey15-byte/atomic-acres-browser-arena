// QA trace stores are chronological FIFOs. Their counters never reset while
// the same page is alive. Scope by local cursors, not another page's clock.
const natural = value => Number.isSafeInteger(value) && value >= 0;
export function traceWindow(before, after, field) {
  const rows = Array.isArray(after?.[field]) ? after[field] : [];
  const start = before?.trace;
  const end = after;
  const errors = [];
  if (!['rows', 'entries'].includes(field)) errors.push('invalid-row-field');
  if (start?.enabled !== true || end?.enabled !== true) errors.push('disabled-trace');
  for (const trace of [start, end]) {
    if (!natural(trace?.recorded) || !natural(trace?.dropped)
      || trace.dropped > trace.recorded) errors.push('invalid-counters');
  }
  if (!Number.isFinite(before?.origin) || before.origin !== after?.origin) errors.push('page-clock-changed');
  if (end?.recorded < start?.recorded || end?.dropped < start?.dropped) errors.push('counter-reset');
  if (end?.recorded - end?.dropped !== rows.length) errors.push('inconsistent-retained-tail');
  const delta = end?.recorded - start?.recorded;
  if (!natural(delta)) errors.push('invalid-window-length');
  const missing = natural(delta) ? Math.max(0, delta - rows.length) : null;
  if (missing > 0) errors.push('window-overflow');
  const selected = natural(delta) ? (delta === 0 ? [] : rows.slice(-delta)) : [];
  // Health traces also expose ordinals: verify every raw row is contiguous.
  if (field === 'rows' && selected.some((row, index) => row?.ordinal !== start?.recorded + index + 1)) errors.push('noncontiguous-health-ordinals');
  return {
    ...after, [field]: selected, recorded: natural(delta) ? delta : null,
    dropped: errors.length ? Math.max(1, missing ?? 1) : 0,
    window: { complete: errors.length === 0, errors, missingRows: missing,
      origin: before?.origin, before: { recorded: start?.recorded, dropped: start?.dropped },
      after: { recorded: end?.recorded, dropped: end?.dropped, retained: rows.length } },
  };
}

export function deathPublicationCandidates(rows, baseline) {
  const candidates = rows.filter(row => row?.stage === 'publish'
    && row.subjectId === baseline.subjectId && row.matchEpoch === baseline.epoch
    && row.continuity === baseline.lifeId && row.hp === 0);
  const keys = new Map();
  for (const row of candidates) {
    if (!natural(row.revision) || typeof row.authorId !== 'string' || !row.authorId.trim()) continue;
    const publication = { subjectId: row.subjectId, revision: row.revision,
      continuity: row.continuity, matchEpoch: row.matchEpoch, authorId: row.authorId };
    keys.set(JSON.stringify(publication), publication);
  }
  return { publication: keys.size === 1 ? [...keys.values()][0] : null,
    hostCandidateCount: keys.size, hostTransportCount: candidates.length };
}
