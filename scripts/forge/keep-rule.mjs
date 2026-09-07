#!/usr/bin/env node
// PASS 0 keep rule (HF-536 ART-FORGE-RULESET R33, stages 3+5+6 combined).
//
// Usage:
//   node scripts/forge/keep-rule.mjs --prev <score.json> --candidate <score.json> \
//     [--critic <critic.json> --target-axis <axis> --judged <station,station>] \
//     [--newly-black-fail 0.005] [--declared-moves station::box,station::box]
//
//   --declared-moves waives the protected-box gate for the named boxes ONLY,
//   because the pass brief declares them as its targets (e.g. every sky box for
//   a sky-preset pass). Each waiver is printed as a DECLARED reason line.
//
// Verdicts:
//   FAIL - a hard gate tripped: a station gained newly-black area at or above
//          the pinned diff threshold (default 0.005, the exact
//          newlyBlackFraction in scripts/qa/diff-arena-viewpoints.mjs), or a
//          protected box moved p50 by > 8 (THRESHOLDS.deltaSoft) or stddev by
//          > 25 % relative (noise floor, R33).
//   HOLD - gates green but the pass is not proven: a critic axis regressed by
//          >= 0.5 on any station, or no critic evidence proves the targeted
//          gain (or the gain is below bar).
//   KEEP - gates green, no critic regression, and the targeted axis gained
//          >= +0.5 on >= 2 judged stations.
//
// critic.json shape (stage 6): { base: { <station>: { <axis>: score } },
//   candidate: { <station>: { <axis>: score } } }, axes 1-5 in 0.5 steps.
// Prints VERDICT plus one line per reason. Exit codes: KEEP 0, HOLD 1, FAIL 2.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

export const P50_TOLERANCE = 8;
export const STDDEV_REL_TOLERANCE = 0.25;
export const CRITIC_STEP = 0.5;

export function decide(prev, cand, options = {}) {
  const reasons = [];
  const failReasons = [];
  const holdReasons = [];
  const newlyBlackFail = options.newlyBlackFail ?? 0.005;
  const declaredMoves = new Set(options.declaredMoves ?? []);
  const prevStations = prev.stations ?? {};
  const candStations = cand.stations ?? {};

  // Hard gate 1: newly-black area (diff verdict NEWLY_BLACK tier parity).
  for (const station of Object.keys(candStations).sort()) {
    const nb = candStations[station].newlyBlack ?? 0;
    if (nb >= newlyBlackFail) {
      failReasons.push(`FAIL newly-black station ${station}: newlyBlack=${nb.toFixed(4)} >= ${newlyBlackFail}`);
    } else if (nb > 0) {
      reasons.push(`note ${station}: newlyBlack=${nb.toFixed(4)} below gate ${newlyBlackFail}`);
    }
  }

  // Hard gate 2: protected-box regressions vs the previous kept pass.
  for (const station of Object.keys(candStations).sort()) {
    const p = prevStations[station];
    if (!p) {
      failReasons.push(`FAIL station ${station} has no previous-kept row to compare`);
      continue;
    }
    for (const [name, box] of Object.entries(candStations[station].boxes ?? {}).sort()) {
      if (!box.protected) continue;
      if (declaredMoves.has(`${station}::${name}`)) {
        // A pass may DECLARE that a protected box is one of its targets (e.g. a
        // global sky preset change). The declaration is printed so the verdict
        // shows exactly which protections were waived; nothing else is relaxed.
        reasons.push(`DECLARED move ${station}::${name}: protected-box gate waived by the pass brief`);
        continue;
      }
      const pb = p.boxes?.[name];
      if (!pb) {
        failReasons.push(`FAIL protected box ${station}::${name} missing from previous-kept score`);
        continue;
      }
      const dp50 = Math.abs(box.luma.p50 - pb.luma.p50);
      if (dp50 > P50_TOLERANCE) {
        failReasons.push(`FAIL protected box ${station}::${name}: p50 ${pb.luma.p50} -> ${box.luma.p50} (|d|=${dp50.toFixed(1)} > ${P50_TOLERANCE})`);
      }
      const denom = Math.max(pb.stddev, 1.0);
      const rel = Math.abs(box.stddev - pb.stddev) / denom;
      if (rel > STDDEV_REL_TOLERANCE) {
        failReasons.push(`FAIL protected box ${station}::${name}: stddev ${pb.stddev} -> ${box.stddev} (rel ${(rel * 100).toFixed(1)}% > 25%)`);
      }
    }
  }

  if (failReasons.length > 0) return { verdict: 'FAIL', reasons: [...failReasons, ...reasons] };

  // Critic gates (stage 6 parity): regression check, then targeted-gain check.
  const critic = options.critic ?? null;
  const targetAxis = options.targetAxis ?? null;
  const judged = options.judged ?? [];
  if (!critic) {
    holdReasons.push('HOLD no critic.json: targeted-axis gain is unproven (R33 needs >= +0.5 on >= 2 judged stations)');
    return { verdict: 'HOLD', reasons: [...holdReasons, ...reasons] };
  }
  for (const station of Object.keys(critic.candidate ?? {}).sort()) {
    const cAxes = critic.candidate[station] ?? {};
    const bAxes = critic.base?.[station] ?? {};
    for (const [axis, score] of Object.entries(cAxes).sort()) {
      if (typeof bAxes[axis] !== 'number' || typeof score !== 'number') continue;
      if (bAxes[axis] - score >= CRITIC_STEP - 1e-9) {
        holdReasons.push(`HOLD critic regression ${station} axis ${axis}: ${bAxes[axis]} -> ${score} (drop >= ${CRITIC_STEP})`);
      }
    }
  }
  if (holdReasons.length > 0) return { verdict: 'HOLD', reasons: [...holdReasons, ...reasons] };

  if (!targetAxis || judged.length === 0) {
    holdReasons.push('HOLD no --target-axis/--judged: keep bar cannot be evaluated');
    return { verdict: 'HOLD', reasons: [...holdReasons, ...reasons] };
  }
  let gains = 0;
  for (const station of judged) {
    const b = critic.base?.[station]?.[targetAxis];
    const c = critic.candidate?.[station]?.[targetAxis];
    if (typeof b !== 'number' || typeof c !== 'number') {
      holdReasons.push(`HOLD critic has no ${targetAxis} row for judged station ${station}`);
      return { verdict: 'HOLD', reasons: [...holdReasons, ...reasons] };
    }
    if (c - b >= CRITIC_STEP - 1e-9) gains += 1;
  }
  if (gains >= 2) {
    reasons.push(`KEEP targeted axis ${targetAxis} gained >= +${CRITIC_STEP} on ${gains}/${judged.length} judged stations`);
    return { verdict: 'KEEP', reasons };
  }
  holdReasons.push(`HOLD targeted axis ${targetAxis} gained >= +${CRITIC_STEP} on ${gains}/${judged.length} judged stations (need >= 2)`);
  return { verdict: 'HOLD', reasons: [...holdReasons, ...reasons] };
}

async function main() {
  const prevPath = arg('--prev');
  const candPath = arg('--candidate');
  if (!prevPath || !candPath) {
    process.stderr.write('[keep-rule] ERROR missing --prev <score.json> or --candidate <score.json>\n');
    process.exit(2);
  }
  const read = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));
  const prev = read(prevPath);
  const cand = read(candPath);
  const criticPath = arg('--critic');
  const critic = criticPath ? read(criticPath) : null;
  const judged = (arg('--judged', '') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const declaredMoves = (arg('--declared-moves', '') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const { verdict, reasons } = decide(prev, cand, {
    critic,
    targetAxis: arg('--target-axis'),
    judged,
    declaredMoves,
    newlyBlackFail: Number(arg('--newly-black-fail', '0.005')),
  });
  process.stdout.write(`VERDICT: ${verdict}\n${reasons.map((r) => `- ${r}\n`).join('')}`);
  process.exit(verdict === 'KEEP' ? 0 : verdict === 'HOLD' ? 1 : 2);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) await main();
