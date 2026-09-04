// Reference-grounded loop - the journal and the mechanical stop rules.
// Contract: reference-loop-journal-v1.
//
// WHAT THIS REPLACES. The overnight .cmd chain's entire persistent state was
// two text files: artifacts/ba-critic.txt containing the single character "C",
// and artifacts/ba-cycle.txt containing "FINAL". From that state a resumed run
// cannot answer what cycle 5 scored, whether the score improved, how much
// budget is left, which correction was applied, or whether it helped - and the
// lane brief's own plateau rule could not have been evaluated from it at all.
//
// So: an append-only JSONL journal, one object per line, so a run killed
// mid-write is still readable up to the last complete line. state.json holds
// only the head; a resume replays the journal.
//
// Every stop rule below is a pure function of the journal. None of them asks a
// model whether it is finished.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const JOURNAL_CONTRACT = 'reference-loop-journal-v1';

export const STOP_RULES = Object.freeze({
  // Exit: every row at or above gate on >= 2 valid critics, for two cycles running.
  exitConsecutiveCycles: 2,
  minValidCritics: 2,
  // Plateau: mean total improves by less than this over two cycles.
  plateauDelta: 1.0,
  plateauWindow: 2,
  // Invalid streak: this many consecutive cycles with too few valid critics
  // means the harness is broken, not that the build is bad.
  invalidStreak: 2,
  // Oscillation: same largest-gap region at N and N+2 with a different one at N+1.
  oscillationWindow: 3,
});

export function openJournal(path) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), event: 'journal-open', contract: JOURNAL_CONTRACT })}\n`);
  return path;
}

export function appendEvent(path, event) {
  const line = { ts: new Date().toISOString(), ...event };
  appendFileSync(path, `${JSON.stringify(line)}\n`);
  return line;
}

/** Read a journal, tolerating a truncated final line from a killed run. */
export function readJournal(path) {
  if (!existsSync(path)) return [];
  const out = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* truncated tail; the rest is still evidence */ }
  }
  return out;
}

export function cycleEvents(entries) {
  return entries.filter((e) => e.event === 'cycle-complete');
}

export function writeState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export function readState(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/**
 * Evaluate every stop rule against the journal's cycle history.
 * Order matters and is deliberate: a broken harness is diagnosed before a
 * plateau, because a run producing no valid critics has no scores to plateau.
 *
 * Returns { stop, state, reason, detail }. state is one of
 * running | exit | invalid-streak | budget | oscillation | plateau | plateau-escalated.
 */
export function evaluateStopState(cycles, budget = {}) {
  const {
    cyclesMax = 6,
    wallClockMinLeft = null,
    plateauEscalationsUsed = 0,
    plateauEscalationsMax = 1,
  } = budget;

  if (cycles.length === 0) return { stop: false, state: 'running', reason: 'no cycles yet', detail: {} };

  // 1. Broken harness beats every other reading of the data.
  let streak = 0;
  for (let i = cycles.length - 1; i >= 0; i -= 1) {
    if ((cycles[i].validCritics ?? 0) < STOP_RULES.minValidCritics) streak += 1; else break;
  }
  if (streak >= STOP_RULES.invalidStreak) {
    return {
      stop: true,
      state: 'invalid-streak',
      reason: `${streak} consecutive cycles with fewer than ${STOP_RULES.minValidCritics} valid critics - the harness is broken, not the build`,
      detail: { streak },
    };
  }

  // 2. Exit gate.
  const scored = cycles.filter((c) => (c.validCritics ?? 0) >= STOP_RULES.minValidCritics);
  const tail = cycles.slice(-STOP_RULES.exitConsecutiveCycles);
  const exitReady = tail.length === STOP_RULES.exitConsecutiveCycles
    && tail.every((c) => (c.validCritics ?? 0) >= STOP_RULES.minValidCritics
      && c.allRowsPassGate === true
      && c.blockingRegression !== true
      && c.tier0Worsening !== true);
  if (exitReady) {
    return { stop: true, state: 'exit', reason: `every row at or above gate on >= ${STOP_RULES.minValidCritics} valid critics for ${STOP_RULES.exitConsecutiveCycles} consecutive cycles`, detail: {} };
  }

  // 3. Budget.
  if (cycles.length >= cyclesMax) {
    return { stop: true, state: 'budget', reason: `cycle ceiling ${cyclesMax} reached`, detail: { cyclesUsed: cycles.length, cyclesMax } };
  }
  if (wallClockMinLeft !== null && wallClockMinLeft <= 0) {
    return { stop: true, state: 'budget', reason: 'wall-clock ceiling reached', detail: { wallClockMinLeft } };
  }

  // 4. Oscillation: the same region is the largest gap at N and N+2, with a
  //    different one at N+1. That is two corrections fighting each other, and
  //    no further cycle will settle it. Ask a human.
  if (cycles.length >= STOP_RULES.oscillationWindow) {
    const [a, b, c] = cycles.slice(-STOP_RULES.oscillationWindow);
    const key = (cycle) => (cycle.largestGapRegions ?? []).slice().sort().join('+');
    if (key(a) && key(a) === key(c) && key(b) && key(b) !== key(a)) {
      return {
        stop: true,
        state: 'oscillation',
        reason: `largest gap returned to ${key(a)} after moving to ${key(b)} - corrections are fighting`,
        detail: { pattern: [key(a), key(b), key(c)] },
      };
    }
  }

  // 5. Plateau. Escalate to a STRUCTURAL pass (change the spec, not the code)
  //    exactly once, then stop. A plateau is not a licence to keep spending.
  if (scored.length > STOP_RULES.plateauWindow) {
    const window = scored.slice(-(STOP_RULES.plateauWindow + 1));
    const gain = (window[window.length - 1].meanTotal ?? 0) - (window[0].meanTotal ?? 0);
    if (gain < STOP_RULES.plateauDelta) {
      if (plateauEscalationsUsed >= plateauEscalationsMax) {
        return {
          stop: true,
          state: 'plateau',
          reason: `mean total gained ${gain.toFixed(2)} over ${STOP_RULES.plateauWindow} cycles and the structural escalation is already spent`,
          detail: { gain, plateauEscalationsUsed },
        };
      }
      return {
        stop: false,
        state: 'plateau-escalated',
        reason: `mean total gained ${gain.toFixed(2)} over ${STOP_RULES.plateauWindow} cycles - escalate once to a structural pass (refine-spec), not another code tweak`,
        detail: { gain, plateauEscalationsUsed },
      };
    }
  }

  return { stop: false, state: 'running', reason: 'no stop rule triggered', detail: {} };
}

/** Mean total across the valid critics of one cycle, or null when unscoreable. */
export function meanValidTotal(criticResults) {
  const valid = criticResults.filter((c) => c.valid && Number.isFinite(c.total));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((sum, c) => sum + c.total, 0) / valid.length) * 100) / 100;
}

/** The modal largest-gap row across valid critics; ties break alphabetically for determinism. */
export function modalLargestGap(criticResults) {
  const counts = new Map();
  for (const critic of criticResults) {
    if (!critic.valid || !critic.largestGap?.row) continue;
    const key = critic.largestGap.row;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0][0];
}
