// forge-run tests: dry-run plan shape (no heavy work) and preflight units.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acquireHeavyLock,
  buildPlan,
  checkFreeRam,
  checkPowerPlan,
  HIGH_PERF_GUID,
  STAGES,
} from './forge-run.mjs';

const FORGE_RUN = fileURLToPath(new URL('./forge-run.mjs', import.meta.url));

describe('forge-run plan', () => {
  it('builds all 8 stages with label, base and camera subset', () => {
    const plan = buildPlan({ label: 'p1', base: 'some/base', cameras: ['nuketown2-overhead'] });
    assert.equal(plan.dist, 'dist-forge-p1');
    assert.deepEqual(plan.stages.map((s) => s.name), STAGES);
    assert.match(plan.stages[2].runs, /--cameras nuketown2-overhead/);
    assert.match(plan.stages[2].runs, /--serve-dist dist-forge-p1/);
    assert.match(plan.stages[3].runs, /--base some\/base/);
    assert.match(plan.stages[5].runs, /score-stations\.mjs/);
  });

  it('--no-build skips stage 1 and missing label throws', () => {
    const plan = buildPlan({ label: 'p1', noBuild: true });
    assert.equal(plan.stages[1].skip, true);
    assert.throws(() => buildPlan({ label: '' }), /label/);
  });

  it('--dry-run prints the plan and touches nothing heavy', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'forge-dry-'));
    const lockPath = join(tmpdir(), 'aa-heavy.lock');
    const lockExistedBefore = existsSync(lockPath);
    const run = spawnSync(process.execPath, [FORGE_RUN, '--label', 'dry1', '--base', 'some/base', '--dry-run'], { cwd, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /DRY-RUN plan for --label dry1/);
    for (const name of STAGES) assert.match(run.stdout, new RegExp(`stage \\d ${name}`));
    assert.match(run.stdout, /nothing heavy executed/);
    assert.equal(existsSync(lockPath), lockExistedBefore, 'dry-run must not touch the heavy lock');
    assert.ok(!readdirSync(cwd).some((f) => f.startsWith('dist-forge-')), 'dry-run must not build');
  });
});

describe('forge-run preflight units', () => {
  it('accepts the High performance GUID and rejects anything else', () => {
    assert.ok(checkPowerPlan(() => `High performance\n${HIGH_PERF_GUID}`).includes(HIGH_PERF_GUID));
    assert.throws(() => checkPowerPlan(() => 'Balanced'), /POWER-PLAN-FAIL/);
  });

  it('enforces the 4 GiB floor', () => {
    assert.ok(checkFreeRam({ freemem: () => 8 * 2 ** 30 }) > 0);
    assert.throws(() => checkFreeRam({ freemem: () => 1 * 2 ** 30 }), /RAM-FAIL/);
  });

  it('acquires the lock by mkdir and records owner metadata', () => {
    const calls = [];
    const fakeFs = {
      mkdirSync: (p) => { calls.push(['mkdir', p]); },
      writeFileSync: (p, c) => { calls.push(['write', p, c]); },
    };
    const { owner } = acquireHeavyLock(fakeFs, 'lane-x', 41931);
    assert.equal(owner.lane, 'lane-x');
    assert.equal(owner.port, 41931);
    assert.ok(owner.started);
    assert.equal(calls.length, 2);
  });
});
