import { evaluateCanonicalDeathReplay } from './mp-canonical-replay-consumer.mjs';
const finite = Number.isFinite;
const key = r => JSON.stringify([r.subjectId, r.revision, r.continuity, r.matchEpoch, r.authorId]);

// Explicit lifecycle proof; the strict single-fact verifier stays unchanged.
// No raw rows are removed. Only its distinct-key reason may be explained by
// independently observed old-life death -> next-life held -> next-life alive.
export function evaluateCanonicalDeathLifecycle(input) {
  const strict = evaluateCanonicalDeathReplay(input);
  if (strict.pass || strict.reasons.some(r => r !== 'distinct-lethal-revision-key')) return strict;
  const reasons = [];
  const fail = r => { if (!reasons.includes(r)) reasons.push(r); };
  const e = input.expected, next = e.continuity + 1, origin = input.trigger.origin;
  const trace = input.hostStageTrace;
  const rows = input.healthRows.filter(r => r.subjectId === e.subjectId);
  if (input.healthWindow?.complete !== true || !finite(origin)) fail('lifecycle-window-unproven');
  if (!trace || trace.dropped !== 0 || !Array.isArray(trace.rows)
    || !Number.isSafeInteger(trace.samples) || trace.samples < trace.rows.length) fail('lifecycle-stage-trace-incomplete');
  const pubs = rows.filter(r => r.stage === 'publish');
  const facts = new Map(pubs.map(r => [key(r), r]));
  const held = [...facts.values()].filter(r => r.hp === 0 && r.continuity === next);
  const alive = [...facts.values()].filter(r => r.hp === 100 && r.continuity === next);
  if (facts.size !== 3 || held.length !== 1 || alive.length !== 1
    || !facts.has(key(e))) fail('lifecycle-fact-census');
  const phases = new Map([[key(e), 0]]);
  if (held.length === 1) phases.set(key(held[0]), 1);
  if (alive.length === 1) phases.set(key(alive[0]), 2);
  if (held.length === 1 && alive.length === 1
    && !(e.revision < held[0].revision && held[0].revision < alive[0].revision)) fail('lifecycle-revision-order');
  let phase = -1, lastTime = -Infinity;
  const seen = new Set();
  const firstPublication = new Map();
  for (const r of rows) {
    const p = phases.get(key(r));
    if (r.authorId !== e.authorId || r.matchEpoch !== e.matchEpoch || p === undefined
      || r.hp !== (p === 2 ? 100 : 0)) fail('lifecycle-conflicting-copy');
    if (!finite(r.atMs) || r.timeOriginMs !== origin) fail('lifecycle-host-clock');
    if (!['publish', 'send-queued', 'send-call', 'send-drop'].includes(r.stage)) fail('lifecycle-unknown-host-stage');
    if (r.stage !== 'publish') continue; // Transport copies may arrive later.
    if (r.atMs < lastTime || p < phase || (phase === -1 && p !== 0)) fail('lifecycle-publication-order');
    phase = p; lastTime = r.atMs; seen.add(p);
    if (!firstPublication.has(p)) firstPublication.set(p, r.atMs);
  }
  if (![0,1,2].every(p => seen.has(p))) fail('lifecycle-missing-publication');
  // Host stage rows share the publication clock. Do not sort bad evidence or
  // select only convenient rows: validate the whole observed state sequence.
  let statePhase = -1, previousAt = -Infinity;
  const observed = new Set();
  for (const r of trace?.rows ?? []) {
    let p = -1;
    const scope = r.subjectId === e.subjectId && r.epoch === e.matchEpoch;
    if (scope && r.hp === 100 && r.alive === true && r.renderLife === e.continuity
      && r.supportLife === e.continuity && r.deathCount === input.baselineDeathCount) p = 0;
    if (scope && r.hp === 0 && r.alive === false && r.renderLife === e.continuity
      && r.supportLife === next && r.deathCount === input.baselineDeathCount + 1) p = 1;
    if (scope && r.hp === 0 && r.alive === false && r.renderLife === next
      && r.supportLife === next && r.deathCount === input.baselineDeathCount + 1) p = 2;
    if (scope && r.hp === 100 && r.alive === true && r.renderLife === next
      && r.supportLife === next && r.deathCount === input.baselineDeathCount + 1) p = 3;
    if (p < 0 || p < statePhase) fail('lifecycle-observed-state-conflict');
    if (!finite(r.atMs) || r.origin !== origin || r.atMs <= previousAt) fail('lifecycle-stage-clock');
    if (p >= 1 && (!(r.atMs >= firstPublication.get(p - 1))
      || (p < 3 && !(r.atMs < firstPublication.get(p))))) fail('lifecycle-stage-publication-order');
    statePhase = p; previousAt = r.atMs; observed.add(p);
  }
  if (![1,2,3].every(p => observed.has(p))) fail('lifecycle-missing-observed-stage');
  return { pass: reasons.length === 0, reasons,
    evidence: { ...strict.evidence, strictReasons: strict.reasons,
      canonicalDeathCount: reasons.length === 0 ? 1 : null,
      heldDeadKey: held.length === 1 ? key(held[0]) : null,
      publicationPhases: [...seen], observedPhases: [...observed] } };
}
