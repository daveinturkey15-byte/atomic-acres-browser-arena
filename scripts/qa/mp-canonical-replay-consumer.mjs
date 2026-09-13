// Canonical-replay consumer: exactly-one host reload commit + exactly-one lethal death fact.
// Transport/publication copies are retained separately and never counted as canonical.
// Basis: src/legacy-main.ts:6533..6560 cache key actor+connectionEpoch+lifeId+requestId,
// cache-hit + network.send(cached) returns before admission; host-health-authority-broadcast
// emits up to 3 copies 35ms apart with unchanged revision; observers reject stale-revision.
// Fail-closed strong identity: missing actor/request/actionSequence/life/epoch (reload) and
// missing subject/revision/continuity/epoch/author (death, rows and events) are UNVERIFIABLE
// failures, never wildcard success. Replay/cache rows are checked for conflicting identity,
// not just canonical commit rows. Unrelated transactions are scope failures, never silently
// filtered and never labelled duplicate canonical commits. Same-key retransmissions pass only
// with full consistent identity plus exactly-one canonical action/death increment evidence.
// Input scope defaults to `single`: every row belongs to the named transaction
// (reload) or subject (death). Explicit traceScope:`multi` permits other fully
// identified transactions/subjects and reports their ignored counts. Malformed
// rows never qualify for that exclusion. Numeric epoch/matchEpoch and the string
// connectionEpoch are DISTINCT domains, both required on reload evidence. Never
// fill missing raw identity from expected.
const isObj = (v) => typeof v === 'object' && v !== null;
const textId = (v) => typeof v === 'string' && v.trim().length > 0;
const natural = (v) => Number.isSafeInteger(v) && v >= 0;
const aliasesValid = (row, keys, valid) => {
  const values = keys.filter((key) => row[key] !== undefined).map((key) => row[key]);
  return values.length > 0 && values.every((v) => valid(v) && v === values[0]);
};
const reloadIdentityValid = (row) => isObj(row)
  && aliasesValid(row, ['actorId', 'subjectId', 'forPlayerId'], textId)
  && textId(row.requestId) && natural(row.actionSequence)
  && aliasesValid(row, ['lifeId', 'continuity', 'renderLife'], natural)
  && aliasesValid(row, ['epoch', 'matchEpoch'], natural)
  && textId(row.connectionEpoch);
const deathIdentityValid = (row) => isObj(row) && textId(row.subjectId)
  && natural(row.revision) && natural(row.continuity)
  && aliasesValid(row, ['matchEpoch', 'epoch'], natural)
  && aliasesValid(row, ['authorId', 'by'], textId);
const scopeOf = (input, reasons) => {
  const scope = input.traceScope ?? 'single';
  if (scope !== 'single' && scope !== 'multi') fail(reasons, 'invalid-trace-scope');
  return scope;
};
const actorOf = (r) => r.actorId ?? r.subjectId ?? r.forPlayerId ?? null;
const epochOf = (r) => r.epoch ?? r.matchEpoch ?? null;
const lifeOf = (r) => r.lifeId ?? r.continuity ?? r.renderLife ?? null;
const fail = (reasons, code) => { if (!reasons.includes(code)) reasons.push(code); };
const isCommit = (r) => isObj(r) && r.direction === 'send' && r.action === 'result'
  && r.status === 'committed' && r.reason === 'committed';

export function evaluateCanonicalReloadReplay(input = {}) {
  const reasons = [];
  const traceScope = scopeOf(input, reasons);
  const expected = isObj(input.expected) ? input.expected : {};
  const rows = Array.isArray(input.hostProtocolRows) ? input.hostProtocolRows : null;
  if (!textId(expected.subjectId) || !textId(expected.requestId)
    || !natural(expected.actionSequence)
    || !aliasesValid(expected, ['lifeId', 'life'], natural)
    || !natural(expected.epoch) || !textId(expected.connectionEpoch)) fail(reasons, 'unverifiable-expected-identity');
  const expLife = Number.isInteger(expected.lifeId) ? expected.lifeId
    : (Number.isInteger(expected.life) ? expected.life : null);
  const expEpoch = Number.isInteger(expected.epoch) ? expected.epoch : null;
  if (!rows) fail(reasons, 'unverifiable-host-protocol-absent');
  const raw = rows ?? [];
  const rawTransportCount = raw.length;
  let ignoredOutOfScopeCount = 0;
  const list = raw.filter((row) => {
    if (!reloadIdentityValid(row)) {
      fail(reasons, 'unverifiable-retransmission-identity');
      return true; // Retain malformed rows for existing diagnostic classification.
    }
    if (row.requestId !== expected.requestId) {
      if (traceScope === 'multi') { ignoredOutOfScopeCount += 1; return false; }
      fail(reasons, 'out-of-scope-transaction');
    }
    return true;
  });
  const cacheHitCount = list.filter((r) => isObj(r) && r.direction === 'cache-hit').length;
  const commits = list.filter(isCommit);
  // Scope partition: only rows carrying this transaction's requestId are canonical
  // candidates. Unrelated request commits are scope failures, never duplicates.
  const scopedCommits = commits.filter((r) => r.requestId === expected.requestId);
  const unscopedCommits = commits.filter((r) => r.requestId !== expected.requestId);
  if (unscopedCommits.length > 0) fail(reasons, 'out-of-scope-transaction');
  for (const row of unscopedCommits) {
    // Unrelated transactions are scope failures and keep their wrong-*/stale
    // classification so conflicts are never silently filtered or mislabelled.
    if (row.requestId !== expected.requestId) fail(reasons, 'wrong-request');
    if (row.requestId === null || row.requestId === undefined) fail(reasons, 'unverifiable-replay-request');
    const actor = actorOf(row);
    if (actor === null || actor === undefined) fail(reasons, 'unverifiable-replay-actor');
    else if (actor !== expected.subjectId) fail(reasons, 'wrong-actor');
    if (!Number.isInteger(row.actionSequence)) fail(reasons, 'unverifiable-replay-action-sequence');
    else if (row.actionSequence !== expected.actionSequence) fail(reasons, 'wrong-action-sequence');
    if (row.connectionEpoch !== expected.connectionEpoch) fail(reasons, 'wrong-connection-epoch');
    const life = lifeOf(row);
    const epoch = epochOf(row);
    if (life === null || life === undefined) fail(reasons, 'unverifiable-replay-life');
    else if (Number.isInteger(expLife) && life !== expLife) fail(reasons, 'stale-mismatched-life');
    if (epoch === null || epoch === undefined) fail(reasons, 'unverifiable-replay-epoch');
    else if (Number.isInteger(expEpoch) && epoch !== expEpoch) fail(reasons, 'stale-mismatched-epoch');
  }
  const match = [];
  const mismatch = [];
  for (const row of scopedCommits) {
    const problems = [];
    const actor = actorOf(row);
    if (actor === null || actor === undefined) { problems.push('unverifiable-replay-actor'); problems.push('wrong-actor'); }
    else if (actor !== expected.subjectId) problems.push('wrong-actor');
    if (row.requestId === null || row.requestId === undefined) problems.push('unverifiable-replay-request');
    else if (row.requestId !== expected.requestId) problems.push('wrong-request');
    if (!Number.isInteger(row.actionSequence)) { problems.push('unverifiable-replay-action-sequence'); problems.push('wrong-action-sequence'); }
    else if (row.actionSequence !== expected.actionSequence) problems.push('wrong-action-sequence');
    if (row.connectionEpoch !== expected.connectionEpoch) problems.push('wrong-connection-epoch');
    const life = lifeOf(row);
    if (life === null || life === undefined) problems.push('unverifiable-replay-life');
    else if (Number.isInteger(expLife) && life !== expLife) problems.push('stale-mismatched-life');
    const epoch = epochOf(row);
    if (epoch === null || epoch === undefined) problems.push('unverifiable-replay-epoch');
    else if (Number.isInteger(expEpoch) && epoch !== expEpoch) problems.push('stale-mismatched-epoch');
    if (problems.length === 0) match.push(row);
    else mismatch.push({ row, problems });
  }
  // Replay/cache/peer rows claiming this transaction must carry full consistent
  // identity; contradictory or redacted retransmissions fail instead of passing.
  for (const row of list) {
    if (!isObj(row) || isCommit(row)) continue;
    const claimsScope = row.requestId === expected.requestId || actorOf(row) === expected.subjectId;
    if (!claimsScope) continue;
    if (row.requestId !== expected.requestId) { fail(reasons, 'conflicting-replay-identity'); continue; }
    const problems = [];
    if (actorOf(row) !== expected.subjectId) problems.push('wrong-actor');
    if (Number.isInteger(row.actionSequence) && row.actionSequence !== expected.actionSequence) problems.push('wrong-action-sequence');
    if (row.connectionEpoch !== expected.connectionEpoch) problems.push('wrong-connection-epoch');
    const life = lifeOf(row);
    const epoch = epochOf(row);
    if (actorOf(row) === null || actorOf(row) === undefined) problems.push('unverifiable-retransmission-identity');
    if (!Number.isInteger(row.actionSequence)) problems.push('unverifiable-retransmission-identity');
    if (life === null || life === undefined) problems.push('unverifiable-retransmission-identity');
    else if (Number.isInteger(expLife) && life !== expLife) problems.push('stale-mismatched-life');
    if (epoch === null || epoch === undefined) problems.push('unverifiable-retransmission-identity');
    else if (Number.isInteger(expEpoch) && epoch !== expEpoch) problems.push('stale-mismatched-epoch');
    if (problems.length > 0) {
      for (const p of problems) fail(reasons, p);
      fail(reasons, 'conflicting-replay-identity');
    }
  }
  const cancelled = list.filter((r) => isObj(r) && (r.status === 'cancelled' || r.action === 'cancel')
    && (r.requestId === expected.requestId || actorOf(r) === expected.subjectId));
  if (cancelled.length > 0) fail(reasons, 'cancelled-reload-transaction');
  if (scopedCommits.length === 0) fail(reasons, 'missing-single-host-commit');
  else if (scopedCommits.length > 1) {
    fail(reasons, 'duplicate-host-commit');
    const keys = new Set(scopedCommits.map((r) => JSON.stringify([actorOf(r), r.requestId, r.actionSequence, lifeOf(r), epochOf(r), r.connectionEpoch])));
    if (keys.size > 1) fail(reasons, 'conflicting-replay-fields');
  } else if (mismatch.length === 1) {
    for (const p of mismatch[0].problems) fail(reasons, p);
    if (mismatch[0].problems.some((p) => p.startsWith('wrong-') || p.startsWith('stale-') || p.startsWith('unverifiable-'))) fail(reasons, 'conflicting-replay-fields');
  }
  // Peer receives / cache-hits must never satisfy the commit count; evaluated above as non-commits.
  const pass = reasons.length === 0 && match.length === 1;
  if (!pass && reasons.length === 0) fail(reasons, 'missing-single-host-commit');
  return { pass, reasons, evidence: { traceScope, ignoredOutOfScopeCount, canonicalCommitCount: match.length, rawTransportCount, cacheHitCount, structuralCommitCount: commits.length, scopedCommitCount: scopedCommits.length, outOfScopeCommitCount: unscopedCommits.length, peerNonCanonicalIgnored: list.length - commits.length } };
}

const healthKey = (r) => JSON.stringify([r.subjectId ?? null, r.revision ?? null, r.continuity ?? null, r.matchEpoch ?? r.epoch ?? null, r.authorId ?? r.by ?? null]);
const healthEpochOf = (r) => r.matchEpoch ?? r.epoch ?? null;
const healthAuthorOf = (r) => r.authorId ?? r.by ?? null;

export function evaluateCanonicalDeathReplay(input = {}) {
  const reasons = [];
  const traceScope = scopeOf(input, reasons);
  const expected = isObj(input.expected) ? input.expected : {};
  const trigger = isObj(input.trigger) ? input.trigger : {};
  const before = isObj(trigger.before) ? trigger.before : null;
  const after = isObj(trigger.after) ? trigger.after : null;
  const applied = isObj(trigger.applied) ? trigger.applied : null;
  const healthRows = Array.isArray(input.healthRows) ? input.healthRows : null;
  const deathEvents = Array.isArray(input.deathEvents) ? input.deathEvents : null;
  if (!deathIdentityValid(expected)) fail(reasons, 'unverifiable-expected-death-key');
  if (!Number.isInteger(input.baselineDeathCount)) fail(reasons, 'missing-counter-evidence');
  if (!before || !after || !applied) fail(reasons, 'missing-counter-evidence');
  else {
    if (!aliasesValid(before, ['epoch', 'matchEpoch'], natural)
      || !aliasesValid(after, ['epoch', 'matchEpoch'], natural)) fail(reasons, 'unverifiable-trigger-epoch');
    else if (healthEpochOf(before) !== expected.matchEpoch
      || healthEpochOf(after) !== expected.matchEpoch) fail(reasons, 'conflicting-trigger-epoch');
    if (before.subjectId !== expected.subjectId || before.hp !== 100 || before.deathCount !== input.baselineDeathCount) fail(reasons, 'missing-hp100-before-trigger');
    if (after.subjectId !== expected.subjectId || after.hp !== 0) fail(reasons, 'missing-hp0-after-trigger');
    if (Number.isInteger(before?.deathCount) && Number.isInteger(after?.deathCount)) {
      if (after.deathCount - before.deathCount !== 1) fail(reasons, after.deathCount - before.deathCount > 1 ? 'extra-death-count' : 'trigger-death-count-not-single-increment');
    } else fail(reasons, 'missing-counter-evidence');
    if (applied.targetId !== expected.subjectId || applied.storedBefore !== 100 || applied.storedAfter !== 0) fail(reasons, 'lethal-trigger-not-authoritatively-applied');
    if (applied.canonicalBefore !== undefined && applied.canonicalBefore !== 100) fail(reasons, 'lethal-trigger-not-authoritatively-applied');
  }
  if (!healthRows || healthRows.length === 0) fail(reasons, 'missing-trace-evidence');
  const rawRows = healthRows ?? [];
  const rawTransportCount = rawRows.length;
  let ignoredOutOfScopeHealthCount = 0;
  const rows = rawRows.filter((row) => {
    if (!deathIdentityValid(row)) { fail(reasons, 'unverifiable-health-identity'); return true; }
    if (row.subjectId !== expected.subjectId && traceScope === 'multi') {
      ignoredOutOfScopeHealthCount += 1;
      return false;
    }
    return true;
  });
  const expKey = JSON.stringify([expected.subjectId, expected.revision, expected.continuity, expected.matchEpoch, expected.authorId ?? null]);
  let matchingLethal = 0;
  const lethalKeys = new Set();
  for (const row of rows) {
    if (!isObj(row)) { fail(reasons, 'unverifiable-health-identity'); continue; }
    if (typeof row.subjectId !== 'string' || !Number.isInteger(row.revision)
      || !Number.isInteger(row.continuity) || !Number.isInteger(healthEpochOf(row))
      || typeof healthAuthorOf(row) !== 'string') fail(reasons, 'unverifiable-health-identity');
    if (typeof row.subjectId === 'string' && row.subjectId !== expected.subjectId) {
      if (row.hp === 0) fail(reasons, 'conflicting-identity-subject');
      else fail(reasons, 'out-of-scope-health-row');
    }
    const key = healthKey(row);
    if (row.hp === 0 && (row.subjectId === expected.subjectId)) {
      lethalKeys.add(key);
      if (key === expKey) matchingLethal += 1;
    }
    if (key === expKey && Number.isFinite(row.hp) && row.hp !== 0) fail(reasons, 'conflicting-same-key-hp');
    if (row.hp === 0 && row.subjectId === expected.subjectId && key !== expKey) fail(reasons, 'distinct-lethal-revision-key');
    if (row.hp === 0 && row.subjectId !== undefined && row.subjectId !== expected.subjectId) fail(reasons, 'conflicting-identity-subject');
  }
  if (matchingLethal === 0) fail(reasons, 'missing-canonical-lethal-fact');
  let ignoredOutOfScopeDeathEventCount = 0;
  if (!deathEvents) fail(reasons, 'missing-key-evidence');
  else {
    for (const e of deathEvents) {
      if (!deathIdentityValid(e)) { fail(reasons, 'unverifiable-death-event-identity'); continue; }
      const deathKind = e.kind === 'canonical-death' || e.kind === 'death';
      if (!deathKind) fail(reasons, 'unverifiable-death-event-kind');
      if (deathKind && e.subjectId !== expected.subjectId) {
        if (traceScope === 'multi') ignoredOutOfScopeDeathEventCount += 1;
        else fail(reasons, 'out-of-scope-death-event');
      }
    }
    const scoped = deathEvents.filter((e) => isObj(e) && e.subjectId === expected.subjectId && (e.kind === 'canonical-death' || e.kind === 'death'));
    for (const e of scoped) {
      if (!Number.isInteger(e.revision) || !Number.isInteger(e.continuity)
        || !Number.isInteger(e.matchEpoch ?? e.epoch ?? null) || typeof (e.authorId ?? e.by ?? null) !== 'string') fail(reasons, 'unverifiable-death-event-identity');
      else if (e.revision !== expected.revision || e.continuity !== expected.continuity
        || (e.matchEpoch ?? e.epoch) !== expected.matchEpoch || (e.authorId ?? e.by) !== expected.authorId) fail(reasons, 'conflicting-death-event-identity');
    }
    const exact = scoped.filter((e) => e.revision === expected.revision
      && e.continuity === expected.continuity
      && (e.matchEpoch ?? e.epoch) === expected.matchEpoch
      && (e.authorId ?? e.by) === expected.authorId);
    if (exact.length !== 1) fail(reasons, exact.length === 0 ? 'missing-canonical-death-event' : 'extra-death-count');
    const copies = exact[0]?.transportCopies;
    if (exact.length === 1 && (!Number.isInteger(copies) || copies < 1)) fail(reasons, 'missing-key-evidence');
    var transportCopies = Number.isInteger(copies) ? copies : 0;
  }
  // Same revision alone is never sufficient: trigger single-increment above is required.
  const pass = reasons.length === 0 && matchingLethal >= 1;
  return { pass, reasons, evidence: { traceScope, ignoredOutOfScopeHealthCount, ignoredOutOfScopeDeathEventCount, canonicalLethalFactCount: lethalKeys.size === 1 && matchingLethal >= 1 ? 1 : 0, distinctLethalKeys: [...lethalKeys].length, rawTransportCount, transportCopies: typeof transportCopies === 'number' ? transportCopies : 0, deathIncrement: before && after && Number.isInteger(before.deathCount) && Number.isInteger(after.deathCount) ? after.deathCount - before.deathCount : null } };
}
