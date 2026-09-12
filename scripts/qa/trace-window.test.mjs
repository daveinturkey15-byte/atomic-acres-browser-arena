import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceWindow, deathPublicationCandidates } from './trace-window.mjs';

const before = () => ({ origin: 100, trace: { enabled: true, recorded: 8, dropped: 2 } });
const after = () => ({ origin: 100, enabled: true, recorded: 11, dropped: 5,
  entries: [6, 7, 8, 9, 10, 11] });
test('FIFO window proves surviving rows despite eviction of older scenarios', () => {
  const result = traceWindow(before(), after(), 'entries');
  assert.deepEqual(result.entries, [9, 10, 11]);
  assert.equal(result.window.complete, true);
  assert.equal(result.recorded, 3);
  assert.equal(result.window.after.dropped, 5);
  assert.equal(result.window.before.dropped, 2);
});
test('empty window is empty, not the whole retained tail', () => {
  const start = before(); start.trace.recorded = 11; start.trace.dropped = 5;
  assert.deepEqual(traceWindow(start, after(), 'entries').entries, []);
});
test('overflow, resets, page replacement, disabled and inconsistent stores remain failing', () => {
  for (const mutate of [
    (b,a) => { b.trace.recorded = 4; },
    (b,a) => { b.trace.recorded = 12; },
    (b,a) => { b.trace.dropped = 6; },
    (b,a) => { a.origin = 101; },
    (b,a) => { a.enabled = false; },
    (b,a) => { a.entries.pop(); },
    (b,a) => { a.recorded = NaN; },
  ]) {
    const b = before(), a = after(); mutate(b,a);
    const result = traceWindow(b,a,'entries');
    assert.equal(result.window.complete, false);
    assert.ok(result.dropped > 0);
  }
});
test('health window retains malformed identities but requires contiguous ordinals', () => {
  const a = after(); a.rows = a.entries.map(ordinal => ({ordinal, authorId: null})); delete a.entries;
  const result = traceWindow(before(),a,'rows');
  assert.equal(result.window.complete,true);
  assert.equal(result.rows[0].authorId,null);
  a.rows[5].ordinal = 12;
  assert.equal(traceWindow(before(),a,'rows').window.complete,false);
});
test('canonical candidate count separates copies but never chooses between conflicting keys', () => {
  const baseline = { subjectId:'a', epoch:7, lifeId:3 };
  const row = { stage:'publish', subjectId:'a', matchEpoch:7, continuity:3, revision:2, authorId:'h', hp:0 };
  const rows = [row,{...row}];
  assert.equal(deathPublicationCandidates(rows,baseline).hostCandidateCount,1);
  assert.equal(deathPublicationCandidates(rows,baseline).hostTransportCount,2);
  rows.push({...row,revision:3});
  assert.equal(deathPublicationCandidates(rows,baseline).publication,null);
  assert.equal(rows.length,3); // Caller retains all raw conflicts for strict death verification.
});
