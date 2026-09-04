// node --test scripts/loop/journal.test.mjs
// Every stop rule is a pure function of the journal. These tests are the
// mechanical evaluation the .cmd chain could not do: its whole state was
// "C" and "FINAL".

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openJournal, appendEvent, readJournal, cycleEvents, writeState, readState,
  evaluateStopState, meanValidTotal, modalLargestGap, STOP_RULES,
} from './journal.mjs';

function cycle(overrides = {}) {
  return {
    event: 'cycle-complete', subject: 'demo', cycle: 1, validCritics: 3, meanTotal: 70,
    allRowsPassGate: false, blockingRegression: false, tier0Worsening: false,
    largestGapRegions: ['r1c1'], ...overrides,
  };
}

test('a journal round-trips and tolerates a truncated final line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-journal-'));
  const path = join(dir, 'journal.jsonl');
  openJournal(path);
  appendEvent(path, cycle({ cycle: 1 }));
  appendEvent(path, cycle({ cycle: 2 }));
  appendFileSync(path, '{"event":"cycle-complete","cycl');  // a killed run
  const entries = readJournal(path);
  assert.equal(cycleEvents(entries).length, 2, 'the complete lines are still evidence');
  assert.equal(entries[0].event, 'journal-open');
});

test('state.json round-trips and is absent before a first write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-state-'));
  const path = join(dir, 'state.json');
  assert.equal(readState(path), null);
  writeState(path, { cycle: 4, phase: 'awaiting-build' });
  assert.equal(readState(path).cycle, 4);
});

test('no cycles yet is running, not a stop', () => {
  assert.deepEqual(evaluateStopState([]).state, 'running');
});

test('exit needs every row at gate on enough valid critics for two consecutive cycles', () => {
  const passing = cycle({ allRowsPassGate: true, meanTotal: 95 });
  assert.equal(evaluateStopState([passing]).stop, false, 'one good cycle is not an exit');
  const result = evaluateStopState([passing, { ...passing, cycle: 2 }]);
  assert.deepEqual({ stop: result.stop, state: result.state }, { stop: true, state: 'exit' });
});

test('exit is refused when a regression is blocking, even at full score', () => {
  const passing = cycle({ allRowsPassGate: true, meanTotal: 99 });
  const result = evaluateStopState([passing, { ...passing, cycle: 2, blockingRegression: true }]);
  assert.notEqual(result.state, 'exit');
});

test('exit is refused when tier 0 is worsening while the critics say it is fine', () => {
  const passing = cycle({ allRowsPassGate: true, meanTotal: 99 });
  const result = evaluateStopState([passing, { ...passing, cycle: 2, tier0Worsening: true }]);
  assert.notEqual(result.state, 'exit');
});

test('two consecutive cycles short of valid critics stops the run as a BROKEN HARNESS', () => {
  const broken = cycle({ validCritics: 1, meanTotal: null });
  const result = evaluateStopState([cycle(), broken, { ...broken, cycle: 3 }]);
  assert.deepEqual({ stop: result.stop, state: result.state }, { stop: true, state: 'invalid-streak' });
  assert.match(result.reason, /harness is broken, not the build/);
});

test('the invalid streak is diagnosed BEFORE a plateau - no scores means nothing to plateau', () => {
  const flat = [cycle({ cycle: 1, meanTotal: 80 }), cycle({ cycle: 2, meanTotal: 80 }), cycle({ cycle: 3, meanTotal: 80 })];
  const broken = [{ ...flat[2], cycle: 4, validCritics: 0 }, { ...flat[2], cycle: 5, validCritics: 0 }];
  assert.equal(evaluateStopState([...flat, ...broken]).state, 'invalid-streak');
});

test('the cycle ceiling stops the run', () => {
  const cycles = Array.from({ length: 6 }, (_, i) => cycle({ cycle: i + 1, meanTotal: 60 + i * 5 }));
  const result = evaluateStopState(cycles, { cyclesMax: 6 });
  assert.deepEqual({ stop: result.stop, state: result.state }, { stop: true, state: 'budget' });
});

test('the wall-clock ceiling stops the run', () => {
  const result = evaluateStopState([cycle()], { cyclesMax: 99, wallClockMinLeft: 0 });
  assert.deepEqual({ stop: result.stop, state: result.state }, { stop: true, state: 'budget' });
});

test('oscillation: the same region returning after a detour asks for input', () => {
  const cycles = [
    cycle({ cycle: 1, largestGapRegions: ['r1c1'], meanTotal: 60 }),
    cycle({ cycle: 2, largestGapRegions: ['r2c0'], meanTotal: 70 }),
    cycle({ cycle: 3, largestGapRegions: ['r1c1'], meanTotal: 80 }),
  ];
  const result = evaluateStopState(cycles, { cyclesMax: 10 });
  assert.deepEqual({ stop: result.stop, state: result.state }, { stop: true, state: 'oscillation' });
});

test('a steadily improving run with a moving gap does not read as oscillation', () => {
  const cycles = [
    cycle({ cycle: 1, largestGapRegions: ['r1c1'], meanTotal: 60 }),
    cycle({ cycle: 2, largestGapRegions: ['r2c0'], meanTotal: 70 }),
    cycle({ cycle: 3, largestGapRegions: ['r0c2'], meanTotal: 80 }),
  ];
  assert.equal(evaluateStopState(cycles, { cyclesMax: 10 }).state, 'running');
});

test('a plateau escalates ONCE to a structural pass, then stops', () => {
  const cycles = [
    cycle({ cycle: 1, meanTotal: 80.0, largestGapRegions: ['r0c0'] }),
    cycle({ cycle: 2, meanTotal: 80.3, largestGapRegions: ['r0c1'] }),
    cycle({ cycle: 3, meanTotal: 80.5, largestGapRegions: ['r0c2'] }),
  ];
  const first = evaluateStopState(cycles, { cyclesMax: 10, plateauEscalationsUsed: 0 });
  assert.deepEqual({ stop: first.stop, state: first.state }, { stop: false, state: 'plateau-escalated' });
  assert.match(first.reason, /structural pass/);
  const second = evaluateStopState(cycles, { cyclesMax: 10, plateauEscalationsUsed: 1 });
  assert.deepEqual({ stop: second.stop, state: second.state }, { stop: true, state: 'plateau' });
});

test('real improvement is not a plateau', () => {
  const cycles = [
    cycle({ cycle: 1, meanTotal: 60, largestGapRegions: ['r0c0'] }),
    cycle({ cycle: 2, meanTotal: 70, largestGapRegions: ['r0c1'] }),
    cycle({ cycle: 3, meanTotal: 79, largestGapRegions: ['r0c2'] }),
  ];
  assert.equal(evaluateStopState(cycles, { cyclesMax: 10 }).state, 'running');
});

test('meanValidTotal ignores invalid critics entirely and reports null when none survive', () => {
  assert.equal(meanValidTotal([{ valid: true, total: 80 }, { valid: false, total: 99 }, { valid: true, total: 90 }]), 85);
  assert.equal(meanValidTotal([{ valid: false, total: 99 }]), null);
});

test('modalLargestGap takes the mode over valid critics and breaks ties deterministically', () => {
  const gaps = [
    { valid: true, largestGap: { row: 'material-read' } },
    { valid: true, largestGap: { row: 'material-read' } },
    { valid: true, largestGap: { row: 'proportion' } },
    { valid: false, largestGap: { row: 'lighting-match' } },
  ];
  assert.equal(modalLargestGap(gaps), 'material-read');
  assert.equal(modalLargestGap([
    { valid: true, largestGap: { row: 'proportion' } },
    { valid: true, largestGap: { row: 'geometry-match' } },
  ]), 'geometry-match', 'a tie must resolve the same way every run');
  assert.equal(modalLargestGap([{ valid: false, largestGap: { row: 'proportion' } }]), null);
});

test('the stop rules are pinned constants, not tunables', () => {
  assert.deepEqual(STOP_RULES, {
    exitConsecutiveCycles: 2, minValidCritics: 2, plateauDelta: 1.0,
    plateauWindow: 2, invalidStreak: 2, oscillationWindow: 3,
  });
});
