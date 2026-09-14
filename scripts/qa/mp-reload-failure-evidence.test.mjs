import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { safeSkyShot, safeSkyShotEvidence } from './mp-reload-stage-diagnostic.mjs';
import { evaluateReloadV22 } from './mp-soak-v22-consumer.mjs';

const roles = ['host', 'guestA', 'guestB'];
const pose = () => ({ player: { alive: true, hp: 100, weapon: 'carbine', pitch: 1.42, yaw: 0, position: [0, 1.7, 0] }, privateMatch: { hostedBotCount: 0 }, remotePlayers: [{ hp: 100, position: [5, 1.7, 0] }, { hp: 100, position: [-5, 1.7, 0] }] });

test('failed shot evidence retains damaged-remote and wrong-weapon causes without permitting a shot', () => {
  const sample = pose();
  sample.remotePlayers[1].hp = 75;
  sample.player.weapon = 'smg';
  const evidence = safeSkyShotEvidence(sample);
  assert.equal(evidence.safe, safeSkyShot(sample));
  assert.equal(evidence.safe, false);
  assert.equal(evidence.prerequisiteChecks.remotesFullHealth, false);
  assert.equal(evidence.prerequisiteChecks.carbine, false);
  sample.remotePlayers[1].position[0] = 999;
  assert.equal(evidence.remotes[1].position[0], -5);
});

test('real driver preserves observer evidence and a failed verdict when the shot prerequisite throws', async () => {
  const text = readFileSync(new URL('./mp-soak-gate-v22.mjs', import.meta.url), 'utf8');
  const source = text.slice(text.indexOf('async function reloadAfterNaturalLife('), text.indexOf('\nasync function runGuestScenarios('));
  const sample = pose(); sample.remotePlayers[1].hp = 75;
  let collections = 0;
  const peers = Object.fromEntries(roles.map(role => [role, { page: { evaluate: async fn => {
    if (fn.name === 'installReloadObserver') return {};
    if (fn.name === 'collectReloadObserver') { collections++; return { protocol: [{ reason: 'retained-marker' }], origin: 1000, rows: [], samples: 1, dropped: 0 }; }
    if (String(fn).includes('aimAtRemoteWithOffset')) return;
    if (String(fn).includes('snapshot()')) return sample;
    throw new Error('Unsafe shot must never fire or trigger reload');
  } } }]));
  const runtime = {
    peers, PEERS: roles, viewOf: async () => ({ selfId: 'subject' }), calibrate: async () => [],
    stableReloadBaseline: async () => ({ views: {}, life: { host: { supportLife: 4, epoch: 7, deathCount: 1 } } }),
    allPeerAmmo: () => ({ host: 30, guestA: 30, guestB: 30 }),
    installReloadObserver: function installReloadObserver() {}, collectReloadObserver: function collectReloadObserver() {},
    safeSkyShotEvidence, normalizedReloadObserver: observer => observer,
    RELOAD_V22_CONTRACT: 'real-shot-reload-v2', bundle: { config: {} }, CARBINE_MAGAZINE_CAPACITY: 30,
    evaluateReloadV22,
  };
  const run = runInNewContext(`${source}; reloadAfterNaturalLife`, runtime);
  const result = await run('guestA', { ok: true });
  assert.equal(collections, 3);
  assert.equal(result.report.completed, false);
  assert.match(result.report.failure, /safe sky-shot prerequisite failed/);
  assert.equal(result.report.realShot.safeShotEvidence.remotes[1].hp, 75);
  assert.equal(result.report.transaction.peers.host.protocol[0].reason, 'retained-marker');
  assert.equal(result.report.transaction.requestId, null);
  assert.equal(result.ok, false);
  assert.ok(result.evaluation.reasons.includes('incomplete-real-shot-reload'));
});
