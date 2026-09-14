// Negative + positive replay of curated guestA evidence (runtime729b/driver e884a bundle 335ab3…).
// Real IDs inline; protocol rows are synthetic projections (fixture host.protocol is depth-limited).
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCanonicalReloadReplay, evaluateCanonicalDeathReplay } from './mp-canonical-replay-consumer.mjs';
const SUB = '9dc21066-98d4-49c7-98ef-20e89f78100e';
const REQ = 'reload-l9jl2b8un073-4-s-0';
const EPOCH = 36250361;
const LIFE = 4;
const AUTH = '909a2388-3f2c-4c03-b7c3-5c9d269e61d2';
const REV = 3, CONT = 3;
const expR = { subjectId: SUB, requestId: REQ, actionSequence: 0, lifeId: LIFE, epoch: EPOCH };
const commit = (o = {}) => ({ direction: 'send', action: 'result', status: 'committed', reason: 'committed', actorId: SUB, requestId: REQ, actionSequence: 0, lifeId: LIFE, epoch: EPOCH, atMs: 98660, ...o });
const cacheHit = (o = {}) => ({ direction: 'cache-hit', actorId: SUB, requestId: REQ, action: 'result', status: 'committed', reason: 'committed', actionSequence: 0, lifeId: LIFE, epoch: EPOCH, ...o });
const peerRecv = (o = {}) => ({ direction: 'receive', actorId: SUB, requestId: REQ, action: 'result', status: 'committed', reason: 'committed', actionSequence: 0, lifeId: LIFE, epoch: EPOCH, ...o });
// Real death rows (fixture ordinals 84/85 guestA 40/41/42/44/45) + real death event.
const H = (o) => ({ subjectId: SUB, authorId: AUTH, revision: REV, continuity: CONT, matchEpoch: EPOCH, hp: 0, observedHp: null, ...o });
const healthPos = [H({ ordinal: 84, stage: 'publish', observedHp: 0 }), H({ ordinal: 85, stage: 'send-queued' }), H({ ordinal: 40, stage: 'receive' }), H({ ordinal: 41, stage: 'admit', observedHp: 100, reason: 'accepted' }), H({ ordinal: 42, stage: 'apply', observedHp: 0 }), H({ ordinal: 44, stage: 'admit', observedHp: 0, reason: 'stale-revision' }), H({ ordinal: 45, stage: 'reject', reason: 'health-authority-stale-revision' })];
const trig = (afterDeath = 1) => ({ before: { subjectId: SUB, epoch: EPOCH, hp: 100, alive: true, deathCount: 0 }, after: { subjectId: SUB, epoch: EPOCH, hp: 0, alive: false, deathCount: afterDeath }, applied: { targetId: SUB, storedBefore: 100, canonicalBefore: 100, storedAfter: 0 } });
const expD = { subjectId: SUB, matchEpoch: EPOCH, revision: REV, continuity: CONT, authorId: AUTH };
const evt = (o = {}) => ({ kind: 'canonical-death', subjectId: SUB, revision: REV, continuity: CONT, matchEpoch: EPOCH, authorId: AUTH, transportCopies: 2, ...o });
test('reload positive: one commit vs cache-hit replays + peer receive', () => {
  const r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit(), cacheHit(), cacheHit(), peerRecv()] });
  assert.equal(r.pass, true); assert.equal(r.evidence.canonicalCommitCount, 1); assert.equal(r.evidence.rawTransportCount, 4); assert.equal(r.evidence.cacheHitCount, 2);
});
test('reload negative: duplicate real host commit', () => {
  const r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit({ atMs: 1 }), commit({ atMs: 2 })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('duplicate-host-commit'));
});
test('reload negative: missing canonical commit (only cache-hit + receive)', () => {
  const r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [cacheHit(), peerRecv()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('missing-single-host-commit')); assert.equal(r.evidence.canonicalCommitCount, 0);
});
test('reload negative: wrong actor/request/actionSequence', () => {
  for (const [rows, code] of [[ [commit({ actorId: 'other' })], 'wrong-actor'], [[commit({ requestId: 'reload-other' })], 'wrong-request'], [[commit({ actionSequence: 7 })], 'wrong-action-sequence']]) {
    const r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: rows });
    assert.equal(r.pass, false, code); assert.ok(r.reasons.includes(code), code);
  }
});
test('reload negative: stale life/epoch + cancelled + conflicting fields', () => {
  let r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit({ lifeId: 3 })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('stale-mismatched-life'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit({ epoch: 1 })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('stale-mismatched-epoch'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit(), { direction: 'send', action: 'cancel', status: 'cancelled', reason: 'cancelled', actorId: SUB, requestId: REQ, actionSequence: 0 }] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('cancelled-reload-transaction'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit(), commit({ actionSequence: 1 })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('conflicting-replay-fields'));
});
test('death positive: one lethal fact vs retransmissions + one canonical event', () => {
  const r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: healthPos, deathEvents: [evt()] });
  assert.equal(r.pass, true); assert.equal(r.evidence.canonicalLethalFactCount, 1); assert.equal(r.evidence.rawTransportCount, healthPos.length); assert.equal(r.evidence.transportCopies, 2); assert.equal(r.evidence.deathIncrement, 1);
});
test('death negative: distinct lethal revision/key', () => {
  const r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: [...healthPos, H({ ordinal: 99, stage: 'publish', revision: 4 })], deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('distinct-lethal-revision-key'));
});
test('death negative: conflicting same-key HP', () => {
  const r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: [...healthPos, H({ ordinal: 98, stage: 'publish', hp: 100, observedHp: 100 })], deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('conflicting-same-key-hp'));
});
test('death negative: extra death count (trigger + duplicate event)', () => {
  let r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(2), healthRows: healthPos, deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('extra-death-count'));
  r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: healthPos, deathEvents: [evt(), evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('extra-death-count'));
});
test('death negative: missing counter/trace/key evidence + revision alone insufficient', () => {
  let r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: { before: null, after: null, applied: null }, healthRows: healthPos, deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('missing-counter-evidence'));
  r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: [], deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('missing-trace-evidence') || r.reasons.includes('missing-canonical-lethal-fact'));
  r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: healthPos, deathEvents: [] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('missing-canonical-death-event'));
});
test('reload negative: expected missing life/epoch is unverifiable, never wildcard success', () => {
  for (const [exp, code] of [[{ subjectId: SUB, requestId: REQ, actionSequence: 0, epoch: EPOCH }, 'unverifiable-expected-identity'], [{ subjectId: SUB, requestId: REQ, actionSequence: 0, lifeId: LIFE }, 'unverifiable-expected-identity']]) {
    const r = evaluateCanonicalReloadReplay({ expected: exp, hostProtocolRows: [commit()] });
    assert.equal(r.pass, false, code); assert.ok(r.reasons.includes(code), code);
  }
});
test('reload negative: commit row missing life/epoch/actor/request/sequence is unverifiable', () => {
  let r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit({ lifeId: undefined, continuity: undefined, renderLife: undefined })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-replay-life'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit({ epoch: undefined, matchEpoch: undefined, connectionEpoch: undefined })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-replay-epoch'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit({ actorId: undefined, subjectId: undefined, forPlayerId: undefined })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-replay-actor'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit({ actionSequence: undefined })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-replay-action-sequence'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit({ requestId: undefined })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-replay-request'));
});
test('reload negative: cache-hit/peer rows with conflicting or redacted identity fail', () => {
  let r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit(), cacheHit({ lifeId: 3 })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('conflicting-replay-identity'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit(), cacheHit({ epoch: 1 })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('conflicting-replay-identity'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit(), peerRecv({ actorId: 'other' })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('conflicting-replay-identity'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit(), cacheHit({ lifeId: undefined, continuity: undefined, renderLife: undefined })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-retransmission-identity'));
});
test('reload negative: unrelated request commit is scope failure, never a duplicate canonical commit', () => {
  const other = commit({ requestId: 'reload-other', actorId: 'other', actionSequence: 1, lifeId: 9, epoch: 9, atMs: 2 });
  let r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit(), other] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('out-of-scope-transaction'));
  assert.ok(!r.reasons.includes('duplicate-host-commit'));
  r = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [other] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('out-of-scope-transaction'));
  assert.ok(r.reasons.includes('wrong-request')); assert.ok(!r.reasons.includes('duplicate-host-commit'));
});
test('death negative: expected missing author/revision/continuity/epoch is unverifiable', () => {
  for (const exp of [[{ subjectId: SUB, matchEpoch: EPOCH, revision: REV, continuity: CONT }], [{ subjectId: SUB, matchEpoch: EPOCH, continuity: CONT, authorId: AUTH }], [{ subjectId: SUB, revision: REV, continuity: CONT, authorId: AUTH }]]) {
    const r = evaluateCanonicalDeathReplay({ expected: exp[0], baselineDeathCount: 0, trigger: trig(), healthRows: healthPos, deathEvents: [evt()] });
    assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-expected-death-key'));
  }
});
test('death negative: death event missing or conflicting identity fails closed', () => {
  let r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: healthPos, deathEvents: [evt({ revision: undefined })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-death-event-identity'));
  r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: healthPos, deathEvents: [evt({ authorId: undefined, by: undefined })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-death-event-identity'));
  r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: healthPos, deathEvents: [evt({ matchEpoch: undefined, epoch: undefined })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-death-event-identity'));
  r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: healthPos, deathEvents: [evt({ authorId: 'other-author' })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('conflicting-death-event-identity'));
});
test('death negative: health row missing identity fails closed, never wildcard success', () => {
  let r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: [...healthPos, H({ revision: undefined })], deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-health-identity'));
  r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: [...healthPos, H({ authorId: undefined, by: undefined })], deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-health-identity'));
  r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: [...healthPos, H({ matchEpoch: undefined, epoch: undefined })], deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('unverifiable-health-identity'));
});
test('death negative: unrelated subject rows/events are scope failures, not silent filters', () => {
  let r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: [...healthPos, H({ subjectId: 'other-subject', hp: 100, observedHp: 100 })], deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('out-of-scope-health-row'));
  r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: healthPos, deathEvents: [evt(), evt({ subjectId: 'other-subject' })] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('out-of-scope-death-event'));
});
test('death negative: same-key retransmission with different author fails', () => {
  const r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger: trig(), healthRows: [...healthPos, H({ ordinal: 100, stage: 'publish', authorId: 'other-author' })], deathEvents: [evt()] });
  assert.equal(r.pass, false); assert.ok(r.reasons.includes('distinct-lethal-revision-key'));
});
