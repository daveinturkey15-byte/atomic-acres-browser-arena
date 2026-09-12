import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('v22 top-level full dispatch retains the v21 loop, live-artifact, and finalization path', async () => {
  const url = new URL('./mp-soak-gate-v22.mjs', import.meta.url);
  let source = readFileSync(url, 'utf8')
    .replace(/^#![^\n]*\n/, '')
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(url.href));
  const calls = [];
  const writes = [];
  for (const name of ['runStairScenarios', 'sampleReplication', 'scriptedPlay', 'scoreboardAtEnd']) {
    const pattern = new RegExp(`(async function ${name}\\([^)]*\\) \\{)`);
    assert.match(source, pattern);
    source = source.replace(pattern, `$1 calls.push('${name}'); return;`);
  }
  const pages = new Map();
  const fakePage = (role) => ({
    role,
    click: async () => {}, fill: async () => {}, selectOption: async () => {},
    waitForFunction: async () => {}, textContent: async () => 'ROOM',
    evaluate: async () => { throw Error('unexpected unmocked page evaluation'); },
  });
  const fakeProcess = { argv: ['node', 'v22', '--sha', 'b'.repeat(40)], env: {}, execPath: 'node', platform: 'test', pid: 1, exitCode: undefined };
  const dependencies = {
    process: fakeProcess, calls,
    spawnSync: () => ({ stdout: 'a'.repeat(40), status: 0 }),
    mkdirSync: () => {}, existsSync: () => false,
    writeFile: async (path, data) => writes.push({ path, data }), join, resolve, fileURLToPath,
    chromium: { launch: async () => { calls.push('browser'); return { close: async () => calls.push('closed') }; } },
     ACK_BUDGET_MS: 1_500,
     PEERS: ['host', 'guestA', 'guestB'],
     MP_SOAK_THRESHOLDS: { playDurationMs: 180000, sampleIntervalMs: 1000, rttMs: 120, positionBoundM: 1.5 },
     SOAK_V22_CONTRACT: 'mp-soak-gate-v2.2',
    RELOAD_V22_CONTRACT: 'real-shot-reload-transaction-v2',
    DEATH_V22_CONTRACT: 'causal-death-stages-v2',
    V22_SOAK_CONFIG: { hardTimeoutMs: 299000, reloadSamplePointMs: 350, reloadCompletionBudgetMs: 4000 },
    chromeArgs: () => [], multiplayerArenaRoster: () => [{ id: 'nuketown2' }],
    openPeer: async (_browser, role) => {
      const page = fakePage(role); pages.set(role, page); return { page, errors: { page: [], console: [] } };
    },
    serveDist: async () => { calls.push('server'); return { close: () => calls.push('server-close') }; },
    startPeerServer: async () => { calls.push('peer-server'); return { kill: () => calls.push('peer-stop') }; },
    viewOf: async (page) => ({ selfId: page.role, role: page.role, players: {}, gameStarted: true, matchPhase: 'active', remotes: 2 }),
    scenarioFire: () => {}, scenarioPickup: () => {}, scenarioReload: () => {}, scenarioScoreboard: () => {}, scenarioSwap: () => {},
    safeSkyShot: () => false, ammoAcknowledged: () => false, installReloadObserver: () => {}, collectReloadObserver: () => null,
     rejoinV2: async () => ({ ok: true }), damageBoundaryV2: async () => ({ report: {}, measurement: {} }), verifyLiveArtifact: async () => { calls.push('live-artifact'); return { host: { backend: 'webgpu', indexMatches: true, mainMatches: true }, guestA: { backend: 'webgpu', indexMatches: true, mainMatches: true }, guestB: { backend: 'webgpu', indexMatches: true, mainMatches: true } }; },
     calibrate: async () => [], CARBINE_MAGAZINE_CAPACITY: 30, v22LifeInPage: () => {}, reloadBaselineSignature: () => 'stable', evaluateReloadV22: () => ({ pass: true }), evaluateDeathV22: () => ({ pass: true }), evaluateMpSoakV22: () => ({ pass: true, rows: [{ id: 'full-loop' }] }),
     boundedStep: async (task) => task(), waitOrStop: async () => false, ensurePauseMenu: async () => { calls.push('menu'); },
    finalizationWriter: () => (row) => calls.push(`cleanup:${row.cleanup}`), traceOf: async () => ({ entries: [] }), sleep: async () => {},
    formatMpSoakTable: (rows) => JSON.stringify(rows), auditFindings: [], inspectConnectedSample: () => ({ pass: true, failures: [], directions: [] }),
     console: { log: () => {}, error: (...args) => calls.push(`error:${args.join(' ')}`) },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(...Object.keys(dependencies), source)(...Object.values(dependencies));
  assert.equal(calls.filter((call) => call === 'browser').length, 3);
  assert.ok(calls.includes('runStairScenarios'), `${calls.join(',')} writes=${writes.length} exit=${fakeProcess.exitCode}`);
  assert.ok(calls.includes('sampleReplication'));
  assert.ok(calls.includes('scriptedPlay'));
  assert.ok(calls.includes('scoreboardAtEnd'));
  assert.ok(calls.includes('server'));
  assert.ok(calls.includes('server-close'));
  assert.equal(calls.filter((call) => call === 'closed').length, 3);
  assert.equal(writes.length, 2);
  assert.match(writes[0].path, /-bundle\.json$/);
  assert.match(writes[1].path, /-table\.md$/);
  const bundle = JSON.parse(writes[0].data);
  assert.equal(bundle.contract, 'mp-soak-gate-v2.2');
  assert.equal(bundle.config.hardTimeoutMs, 299000);
  assert.equal(bundle.config.connectedSamples, 180);
  assert.equal(bundle.config.healthLatencyMs, 120);
  assert.equal(bundle.config.positionBoundM, 1.5);
  assert.equal(fakeProcess.exitCode, undefined);
});
