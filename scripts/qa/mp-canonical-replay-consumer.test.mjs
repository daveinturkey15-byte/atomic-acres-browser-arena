// Synthetic positive/negative projections based on curated guestA evidence
// (runtime729b/driver e884a bundle 335ab3...). Actual raw reload rows omit life,
// match epoch and connection epoch; these fixtures do NOT verify that receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCanonicalReloadReplay, evaluateCanonicalDeathReplay } from './mp-canonical-replay-consumer.mjs';
const SUB = '9dc21066-98d4-49c7-98ef-20e89f78100e';
const REQ = 'reload-l9jl2b8un073-4-s-0';
const EPOCH = 36250361;
const LIFE = 4;
// Synthetic connection domain: the historical raw trace omitted this field.
const CONNECTION = 'synthetic-connection-a';
const AUTH = '909a2388-3f2c-4c03-b7c3-5c9d269e61d2';
const REV = 3, CONT = 3;
const expR = { subjectId: SUB, requestId: REQ, actionSequence: 0, lifeId: LIFE, epoch: EPOCH, connectionEpoch: CONNECTION };
const commit = (o = {}) => ({ direction: 'send', action: 'result', status: 'committed', reason: 'committed', actorId: SUB, requestId: REQ, actionSequence: 0, lifeId: LIFE, epoch: EPOCH, connectionEpoch: CONNECTION, atMs: 98660, ...o });
const cacheHit = (o = {}) => ({ direction: 'cache-hit', actorId: SUB, requestId: REQ, action: 'result', status: 'committed', reason: 'committed', actionSequence: 0, lifeId: LIFE, epoch: EPOCH, connectionEpoch: CONNECTION, ...o });
const peerRecv = (o = {}) => ({ direction: 'receive', actorId: SUB, requestId: REQ, action: 'result', status: 'committed', reason: 'committed', actionSequence: 0, lifeId: LIFE, epoch: EPOCH, connectionEpoch: CONNECTION, ...o });
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

test('reload rejects unidentified replay rows before scope exclusion', () => {
  for (const traceScope of ['single', 'multi']) {
    for (const extra of [null, {}, { direction: 'cache-hit', action: 'result', status: 'committed', reason: 'committed' },
      cacheHit({ actorId: 'other', requestId: 'other', lifeId: undefined }),
      cacheHit({ actorId: 'other', requestId: 'other', actionSequence: undefined })]) {
      const r = evaluateCanonicalReloadReplay({ traceScope, expected: expR, hostProtocolRows: [commit(), extra] });
      assert.equal(r.pass, false);
      assert.ok(r.reasons.includes('unverifiable-retransmission-identity'));
      assert.equal(r.evidence.ignoredOutOfScopeCount, 0);
    }
  }
});

test('reload ignores fully identified unrelated transactions only in explicit multi scope', () => {
  // Another reload by the SAME actor is a separate transaction, not a cache
  // hit or a second commit of the transaction under review.
  const unrelated = [commit({ requestId: 'other-request' }), cacheHit({ actorId: 'other', requestId: 'other-request' })];
  const single = evaluateCanonicalReloadReplay({ expected: expR, hostProtocolRows: [commit(), ...unrelated] });
  assert.equal(single.pass, false);
  assert.ok(single.reasons.includes('out-of-scope-transaction'));
  const multi = evaluateCanonicalReloadReplay({ traceScope: 'multi', expected: expR, hostProtocolRows: [commit(), ...unrelated] });
  assert.equal(multi.pass, true);
  assert.equal(multi.evidence.ignoredOutOfScopeCount, 2);
  assert.equal(multi.evidence.rawTransportCount, 3);
  assert.equal(multi.evidence.canonicalCommitCount, 1);
  const conflict = evaluateCanonicalReloadReplay({ traceScope: 'multi', expected: expR,
    hostProtocolRows: [commit(), cacheHit({ actorId: 'other' })] });
  assert.equal(conflict.pass, false);
  assert.ok(conflict.reasons.includes('wrong-actor'));
});

test('reload rejects conflicting aliases, malformed numeric identities and empty ids', () => {
  for (const extra of [cacheHit({ subjectId: 'other' }), cacheHit({ connectionEpoch: EPOCH + 1 }),
    cacheHit({ continuity: LIFE + 1 }), cacheHit({ lifeId: -1 }), cacheHit({ epoch: NaN }),
    cacheHit({ actorId: '' }), cacheHit({ requestId: ' ' }), cacheHit({ actionSequence: 0.5 })]) {
    const r = evaluateCanonicalReloadReplay({ traceScope: 'multi', expected: expR, hostProtocolRows: [commit(), extra] });
    assert.equal(r.pass, false);
    assert.ok(r.reasons.includes('unverifiable-retransmission-identity'));
  }
  const conflict = evaluateCanonicalReloadReplay({ expected: { ...expR, life: LIFE + 1 }, hostProtocolRows: [commit()] });
  assert.equal(conflict.pass, false);
  assert.ok(conflict.reasons.includes('unverifiable-expected-identity'));
});

test('reload connection identity is required and cannot alias numeric match epoch', () => {
  for (const connectionEpoch of [undefined, EPOCH, 'other-connection']) {
    const r = evaluateCanonicalReloadReplay({ expected: expR,
      hostProtocolRows: [commit(), cacheHit({ connectionEpoch })] });
    assert.equal(r.pass, false);
    assert.ok(r.reasons.includes(connectionEpoch === 'other-connection'
      ? 'wrong-connection-epoch' : 'unverifiable-retransmission-identity'));
  }
  const missingExpected = evaluateCanonicalReloadReplay({ expected: { ...expR, connectionEpoch: undefined }, hostProtocolRows: [commit()] });
  assert.equal(missingExpected.pass, false);
  assert.ok(missingExpected.reasons.includes('unverifiable-expected-identity'));
});

test('death rejects malformed extra events and rows even in multi scope', () => {
  for (const traceScope of ['single', 'multi']) {
    for (const extra of [{ kind: 'canonical-death' }, evt({ subjectId: undefined }),
      evt({ subjectId: 'other', revision: undefined }), evt({ by: 'conflicting-author' }),
      evt({ epoch: EPOCH + 1 }), evt({ kind: 'unknown' })]) {
      const r = evaluateCanonicalDeathReplay({ traceScope, expected: expD, baselineDeathCount: 0,
        trigger: trig(), healthRows: healthPos, deathEvents: [evt(), extra] });
      assert.equal(r.pass, false);
    }
    const r = evaluateCanonicalDeathReplay({ traceScope, expected: expD, baselineDeathCount: 0,
      trigger: trig(), healthRows: [...healthPos, H({ subjectId: 'other', authorId: undefined })], deathEvents: [evt()] });
    assert.equal(r.pass, false);
    assert.ok(r.reasons.includes('unverifiable-health-identity'));
  }
});

test('death multi scope reports fully identified unrelated subjects without losing target conflicts', () => {
  const input = { traceScope: 'multi', expected: expD, baselineDeathCount: 0, trigger: trig(),
    healthRows: [...healthPos, H({ subjectId: 'other' })], deathEvents: [evt(), evt({ subjectId: 'other' })] };
  const r = evaluateCanonicalDeathReplay(input);
  assert.equal(r.pass, true);
  assert.equal(r.evidence.ignoredOutOfScopeHealthCount, 1);
  assert.equal(r.evidence.ignoredOutOfScopeDeathEventCount, 1);
  assert.equal(r.evidence.canonicalLethalFactCount, 1);
  const conflict = evaluateCanonicalDeathReplay({ ...input, deathEvents: [...input.deathEvents, evt({ authorId: 'other-author' })] });
  assert.equal(conflict.pass, false);
  assert.ok(conflict.reasons.includes('conflicting-death-event-identity'));
});

test('death trigger epoch and trace scope cannot be missing or contradictory', () => {
  for (const epoch of [undefined, EPOCH + 1]) {
    const trigger = trig(); trigger.before.epoch = epoch;
    const r = evaluateCanonicalDeathReplay({ expected: expD, baselineDeathCount: 0, trigger,
      healthRows: healthPos, deathEvents: [evt()] });
    assert.equal(r.pass, false);
    assert.ok(r.reasons.includes(epoch === undefined ? 'unverifiable-trigger-epoch' : 'conflicting-trigger-epoch'));
  }
  assert.equal(evaluateCanonicalReloadReplay({ traceScope: 'typo', expected: expR, hostProtocolRows: [commit()] }).pass, false);
  assert.equal(evaluateCanonicalDeathReplay({ traceScope: 'typo', expected: expD, baselineDeathCount: 0,
    trigger: trig(), healthRows: healthPos, deathEvents: [evt()] }).pass, false);
});
