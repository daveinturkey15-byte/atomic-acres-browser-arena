// MP-LAB contract: the host+guest harness sweeps the arena registry, not a list
// someone typed. Every hand-kept roster this repo has had eventually skipped
// the newest arena while its gate stayed green (AKP gotcha, 2026-08-31), so
// this test pins three things without opening a browser:
//   1. the harness gets its arenas from ./arena-roster.mts, which imports the
//      real src/map-selection.ts and filters on `multiplayer`;
//   2. the harness source carries no arena id literal at all;
//   3. the roster the harness actually computes equals the registry's
//      multiplayer + selectable entries, in registry order.
// It also pins the falsifier constants so the 250 ms / 5 s floors cannot drift.
//
//   node --test tests/e2e/mp-lab-registry-contract.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = resolve(ROOT, 'scripts/qa/mp-lab/run-host-guest.mjs');
const ROSTER = resolve(ROOT, 'scripts/qa/mp-lab/arena-roster.mts');
const REGISTRY = resolve(ROOT, 'src/map-selection.ts');

const harnessSource = readFileSync(HARNESS, 'utf8');
const rosterSource = readFileSync(ROSTER, 'utf8');
const registrySource = readFileSync(REGISTRY, 'utf8');

/** Every arena the registry declares, with the two flags the harness cares about. */
function registryArenas() {
  const rows = [];
  for (const block of registrySource.split(/Object\.freeze\(\{\s*\n\s*id:\s*'/).slice(1)) {
    const id = block.match(/^([a-z0-9-]+)'/)?.[1];
    if (!id) continue;
    const body = block.slice(0, block.indexOf('\n  }),') >= 0 ? block.indexOf('\n  }),') : undefined);
    rows.push({ id, multiplayer: /multiplayer:\s*true/.test(body), selectable: !/selectable:\s*false/.test(body) });
  }
  return rows;
}

test('the registry declares arenas and the parser sees them', () => {
  const arenas = registryArenas();
  assert.ok(arenas.length >= 5, `expected at least five registry arenas, parsed ${arenas.length}`);
  assert.ok(arenas.some((arena) => arena.id === 'atomic-acres'), 'atomic-acres must be in the registry');
  assert.ok(arenas.some((arena) => !arena.selectable), 'the parser must recognise a hidden arena (selectable: false)');
});

test('arena-roster.mts derives from src/map-selection.ts and filters on multiplayer', () => {
  assert.match(rosterSource, /from '\.\.\/\.\.\/\.\.\/src\/map-selection'/, 'roster must import the real registry module');
  assert.match(rosterSource, /SELECTABLE_ARENAS/, 'roster must start from the selectable set');
  assert.match(rosterSource, /\.filter\(\(entry\) => entry\.multiplayer\)/, 'roster must filter on the multiplayer flag');
  for (const arena of registryArenas()) {
    assert.ok(!rosterSource.includes(`'${arena.id}'`), `arena-roster.mts must not name ${arena.id}`);
  }
});

test('the harness spawns arena-roster.mts and names no arena id itself', () => {
  assert.match(harnessSource, /arena-roster\.mts/, 'harness must run arena-roster.mts');
  assert.match(harnessSource, /tsx\/dist\/cli\.mjs/, 'harness must run the roster under tsx so the TypeScript registry is the source');
  for (const arena of registryArenas()) {
    const literal = new RegExp(`['"\`]${arena.id}['"\`]`);
    assert.ok(!literal.test(harnessSource), `run-host-guest.mjs must not contain the arena id literal ${arena.id}`);
  }
});

test('the computed roster equals the registry multiplayer + selectable set in registry order', async () => {
  const harness = await import(pathToFileURL(HARNESS).href);
  const computed = harness.multiplayerArenaRoster().map((arena) => arena.id);
  const expected = registryArenas().filter((arena) => arena.multiplayer && arena.selectable).map((arena) => arena.id);
  assert.deepEqual(computed, expected);
  assert.ok(computed.length >= 5, `expected at least five multiplayer arenas, got ${computed.length}`);
  assert.ok(!computed.includes('farcrysis'), 'a hidden arena must not be swept');
});

test('the falsifier floors are the ledger values', async () => {
  const harness = await import(pathToFileURL(HARNESS).href);
  assert.equal(harness.STALL_FLOOR_MS, 250);
  assert.equal(harness.DEADLOCK_WINDOW_MS, 5_000);
  assert.equal(harness.DEADLOCK_DISTANCE_M, 0.05);
  assert.equal(harness.MIN_FREE_VRAM_MIB, 3_000);
  assert.ok(!/--stall-ms|--deadlock-ms/.test(harnessSource), 'the floors must not be CLI-tunable');
});

test('a verdict fails on any stall over the floor, any deadlock, any page error, or a failed step', async () => {
  const { arenaVerdict, flowsIdentical } = await import(pathToFileURL(HARNESS).href);
  const clean = () => ({
    join: { ok: true }, arenaSync: { ok: true }, deploy: { ok: true, hostOk: true, guestOk: true },
    host: { frames: 900, stalls: [], worstStallMs: 40, deadlockCount: 0 },
    guest: { frames: 900, stalls: [], worstStallMs: 40, deadlockCount: 0 },
    errors: { host: { page: [], console: [] }, guest: { page: [], console: [] } },
    failure: null,
  });
  assert.equal(arenaVerdict(clean()).pass, true);
  const stalled = clean(); stalled.guest.stalls = [{ durationMs: 251, playable: true }]; stalled.guest.worstStallMs = 251;
  assert.equal(arenaVerdict(stalled).pass, false);
  const deadlocked = clean(); deadlocked.guest.deadlockCount = 1;
  assert.equal(arenaVerdict(deadlocked).pass, false);
  const errored = clean(); errored.host.page = undefined; errored.errors.host.page = ['TypeError'];
  assert.equal(arenaVerdict(errored).pass, false);
  const undeployed = clean(); undeployed.deploy = { ok: false, hostOk: true, guestOk: false };
  assert.equal(arenaVerdict(undeployed).pass, false);
  assert.equal(flowsIdentical([
    { verdict: { pass: true }, flow: ['boot', 'joined', 'deployed'] },
    { verdict: { pass: true }, flow: ['boot', 'joined', 'deployed'] },
  ]), true);
  assert.equal(flowsIdentical([
    { verdict: { pass: true }, flow: ['boot', 'joined', 'deployed'] },
    { verdict: { pass: true }, flow: ['boot', 'joined', 'bots-select-disabled', 'deployed'] },
  ]), false);
});

test('the join-flow gate compares every arena, not only the ones that passed', async () => {
  const { flowsIdentical, joinFlowAudit } = await import(pathToFileURL(HARNESS).href);
  // The defect this pins: flowsIdentical() used to filter on verdict.pass, so a
  // sweep where nothing passed compared ZERO flows and reported a vacuous true,
  // and a sweep with one wedged arena excluded exactly the divergent one.
  const failing = (flow) => ({ arenaId: flow.join('-'), verdict: { pass: false }, flow });
  assert.equal(flowsIdentical([
    failing(['boot', 'joined', 'deployed']),
    failing(['boot', 'joined', 'bots-select-disabled', 'deployed']),
  ]), false, 'two failing arenas with different flows must be caught');
  const auditAllFailed = joinFlowAudit([
    failing(['boot', 'joined', 'deployed']),
    failing(['boot', 'joined', 'deployed']),
  ]);
  assert.equal(auditAllFailed.identical, true);
  assert.equal(auditAllFailed.comparedCount, 2, 'a sweep where nothing passed must still compare both flows');
  // A run cut short mid-flow diverged nowhere: a strict prefix stays identical,
  // and the artifact says which arena was truncated so the true is not silent.
  const truncated = joinFlowAudit([
    failing(['boot', 'joined', 'arena-synced']),
    failing(['boot', 'joined', 'arena-synced', 'deployed']),
  ]);
  assert.equal(truncated.identical, true);
  assert.deepEqual(truncated.truncatedArenas, ['boot-joined-arena-synced']);
  assert.equal(joinFlowAudit([]).comparedCount, 0, 'an empty sweep must report that it compared nothing');
  assert.match(harnessSource, /joinFlowComparedCount: flowAudit\.comparedCount/, 'the summary must carry the compared count beside the verdict');
});

test('the verdict counts every playable stall, not just the ones the artifact stores', async () => {
  const { arenaVerdict } = await import(pathToFileURL(HARNESS).href);
  const record = {
    join: { ok: true }, arenaSync: { ok: true }, deploy: { ok: true, hostOk: true, guestOk: true },
    // `stalls` is a worst-20 sample; `stallsWhilePlayable` is the full count.
    host: { frames: 900, stalls: [], stallsWhilePlayable: 37, worstStallMs: 857, deadlockCount: 0 },
    guest: { frames: 900, stalls: [], stallsWhilePlayable: 0, worstStallMs: 40, deadlockCount: 0 },
    errors: { host: { page: [], console: [] }, guest: { page: [], console: [] } },
    failure: null,
  };
  const verdict = arenaVerdict(record);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.reasons.some((reason) => reason.includes('37 stall(s)')), `expected the full stall count in ${JSON.stringify(verdict.reasons)}`);
});

test('the stored stall and long-task evidence is the worst sample, not the first', () => {
  // 2p-after/atomic-acres reported longTasksOver100Ms 37 next to a first-20
  // slice containing 3 tasks over 100 ms: an artifact that cannot show what its
  // own counter counted.
  assert.match(harnessSource, /stalls: \[\.\.\.stalls\]\.sort\(\(a, b\) => b\.durationMs - a\.durationMs\)\.slice\(0, 20\)/);
  assert.match(harnessSource, /longTasks: \[\.\.\.probe\.longTasks\]\.sort\(\(a, b\) => b\.durationMs - a\.durationMs\)\.slice\(0, 20\)/);
  assert.match(harnessSource, /longTasksRecorded: probe\.longTasks\.length/, 'the artifact must say how many long tasks the sample held');
});

test('package.json exposes the harness and this contract', () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['qa:mp-lab'], 'node scripts/qa/mp-lab/run-host-guest.mjs');
  assert.equal(pkg.scripts['qa:mp-lab:contract'], 'node --test tests/e2e/mp-lab-registry-contract.test.mjs tests/e2e/mp-lab-state-admission-contract.test.mjs');
  assert.equal(pkg.scripts['qa:mp-lab:perimeter'], 'node scripts/qa/mp-lab/probe-perimeter-replication.mjs');
});
