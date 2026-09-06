// keep-rule tests: the four outcomes (KEEP, HOLD on critic regression,
// FAIL on newly-black, FAIL on protected-box regression) plus a CLI smoke.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './keep-rule.mjs';

const KEEP_RULE = fileURLToPath(new URL('./keep-rule.mjs', import.meta.url));

const box = (p50, stddev, extra = {}) => ({
  rect: [0, 0, 10, 10], kind: 'sky', protected: true, n: 100,
  luma: { p10: p50, p50, p90: p50 }, meanRGB: [p50, p50, p50], hueDeg: 0, stddev, ...extra,
});

const scoreWith = (stationPatch) => ({
  version: 1, candidate: 'c', base: 'b',
  stations: { st1: { file: 'st1.png', newlyBlack: 0, healed: 0, boxes: { sky: box(150, 10) } }, ...stationPatch },
});

const criticKeep = {
  base: { st1: { lighting: 3.0 }, st2: { lighting: 3.5 } },
  candidate: { st1: { lighting: 3.5 }, st2: { lighting: 4.5 } },
};

describe('keep-rule', () => {
  it('waives ONLY a declared protected box and prints the waiver', () => {
    const prev = scoreWith({ st2: { file: 'st2.png', newlyBlack: 0, healed: 0, boxes: { sky: box(150, 10), road: box(40, 5) } } });
    const cand = scoreWith({ st2: { file: 'st2.png', newlyBlack: 0, healed: 0, boxes: { sky: box(120, 10), road: box(40, 5) } } });
    const undeclared = decide(prev, cand, { critic: criticKeep, targetAxis: 'lighting', judged: ['st1', 'st2'] });
    assert.equal(undeclared.verdict, 'FAIL');
    const declared = decide(prev, cand, { critic: criticKeep, targetAxis: 'lighting', judged: ['st1', 'st2'], declaredMoves: ['st2::sky'] });
    assert.equal(declared.verdict, 'KEEP');
    assert.ok(declared.reasons.some((r) => r.startsWith('DECLARED move st2::sky')));
    const wrongBox = decide(prev, cand, { critic: criticKeep, targetAxis: 'lighting', judged: ['st1', 'st2'], declaredMoves: ['st2::road'] });
    assert.equal(wrongBox.verdict, 'FAIL');
  });
  it('KEEPs a targeted-axis gain on two judged stations', () => {
    const prev = scoreWith();
    const cand = scoreWith();
    const { verdict, reasons } = decide(prev, cand, { critic: criticKeep, targetAxis: 'lighting', judged: ['st1', 'st2'] });
    assert.equal(verdict, 'KEEP');
    assert.ok(reasons.some((r) => r.startsWith('KEEP')));
  });

  it('HOLDs a critic axis regression of >= 0.5', () => {
    const prev = scoreWith();
    const cand = scoreWith();
    const critic = {
      base: { st1: { lighting: 4.0 } },
      candidate: { st1: { lighting: 3.0 } },
    };
    const { verdict } = decide(prev, cand, { critic, targetAxis: 'lighting', judged: ['st1'] });
    assert.equal(verdict, 'HOLD');
  });

  it('FAILs any station at or above the newly-black gate', () => {
    const prev = scoreWith();
    const cand = scoreWith({ st1: { file: 'st1.png', newlyBlack: 0.02, healed: 0, boxes: { sky: box(150, 10) } } });
    const { verdict, reasons } = decide(prev, cand, { critic: criticKeep, targetAxis: 'lighting', judged: ['st1', 'st2'] });
    assert.equal(verdict, 'FAIL');
    assert.ok(reasons.some((r) => r.includes('newly-black')));
  });

  it('FAILs a protected-box p50 move beyond +-8', () => {
    const prev = scoreWith();
    const cand = scoreWith({ st1: { file: 'st1.png', newlyBlack: 0, healed: 0, boxes: { sky: box(170, 10) } } });
    const { verdict, reasons } = decide(prev, cand, {});
    assert.equal(verdict, 'FAIL');
    assert.ok(reasons.some((r) => r.includes('p50')));
  });

  it('FAILs a protected-box stddev change beyond 25 %', () => {
    const prev = scoreWith();
    const cand = scoreWith({ st1: { file: 'st1.png', newlyBlack: 0, healed: 0, boxes: { sky: box(150, 20) } } });
    const { verdict } = decide(prev, cand, {});
    assert.equal(verdict, 'FAIL');
  });

  it('HOLDs without critic evidence and prints VERDICT (CLI, exit 1)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-keep-'));
    const prevPath = join(tmp, 'prev.json');
    const candPath = join(tmp, 'cand.json');
    writeFileSync(prevPath, JSON.stringify(scoreWith()));
    writeFileSync(candPath, JSON.stringify(scoreWith()));
    const run = spawnSync(process.execPath, [KEEP_RULE, '--prev', prevPath, '--candidate', candPath], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stdout, /VERDICT: HOLD/);
  });

  it('CLI exits 0 on KEEP', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-keep-'));
    const prevPath = join(tmp, 'prev.json');
    const candPath = join(tmp, 'cand.json');
    const criticPath = join(tmp, 'critic.json');
    writeFileSync(prevPath, JSON.stringify(scoreWith()));
    writeFileSync(candPath, JSON.stringify(scoreWith()));
    writeFileSync(criticPath, JSON.stringify(criticKeep));
    const run = spawnSync(process.execPath, [KEEP_RULE, '--prev', prevPath, '--candidate', candPath,
      '--critic', criticPath, '--target-axis', 'lighting', '--judged', 'st1,st2'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /VERDICT: KEEP/);
  });
});
