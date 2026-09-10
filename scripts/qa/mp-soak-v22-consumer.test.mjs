import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDeathV22, evaluateReloadV22, evaluateMpSoakV22, reloadBaselineSignature, v22LifeInPage, V22_SOAK_CONFIG } from './mp-soak-v22-consumer.mjs';

const subjectId = '334f066f-9a11-4a9a-bac8-c0716e815cd4';
const requestId = 'reload-cf85t24wdwtu-3-s-0';
const actionSequence = 0;
const lifeId = 4;

function retainedConfig() {
  return { ...V22_SOAK_CONFIG, ackBudgetMs: 1_500, reloadScenarioDeadlineMs: 5_850, rttMs: 120, no350msResponsivenessCeilingClaim: true };
}

function calibration() {
  const peers = Object.fromEntries(['host', 'guestA', 'guestB'].map((role) => [role, {
    before: [{ now: 0, origin: 1000, date: 1000, nodeBefore: 1000, nodeAfter: 1000 }],
    after: [{ now: 300, origin: 1000, date: 1300, nodeBefore: 1300, nodeAfter: 1300 }],
  }]));
  return { before: Object.fromEntries(Object.entries(peers).map(([role, value]) => [role, value.before])), after: Object.fromEntries(Object.entries(peers).map(([role, value]) => [role, value.after])) };
}

function finalPlayer(ammo = 30) {
  return { subjectId, hp: 100, alive: true, continuity: lifeId, deaths: 2, renderLife: lifeId, supportLife: lifeId, weapon: 'carbine', primary: 'carbine', ammo, reserve: 120, reloading: false };
}

function reloadProtocol(role) {
  if (role === 'host') return [
    { atMs: 10, direction: 'admit', actorId: subjectId, requestId, action: 'start', status: 'accepted', reason: 'accepted', actionSequence },
    { atMs: 20, direction: 'send', actorId: subjectId, requestId, action: 'result', status: 'started', reason: 'accepted', actionSequence },
    { atMs: 30, direction: 'cache-hit', actorId: subjectId, requestId, action: 'start', status: 'started', reason: 'accepted', actionSequence },
    { atMs: 200, direction: 'send', actorId: subjectId, requestId, action: 'result', status: 'committed', reason: 'committed', actionSequence },
  ];
  const rows = [
    { atMs: 25, direction: 'receive', actorId: subjectId, requestId, action: 'result', status: 'started', reason: 'accepted', actionSequence },
    { atMs: 210, direction: 'receive', actorId: subjectId, requestId, action: 'result', status: 'committed', reason: 'committed', actionSequence },
  ];
  if (role === 'guestA') rows.unshift({ atMs: 6, direction: 'send', actorId: subjectId, requestId, action: 'start', status: 'requested', reason: 'reliable-retry-lane', actionSequence });
  return rows;
}

function reloadFixture() {
  const peers = Object.fromEntries(['host', 'guestA', 'guestB'].map((role) => [role, {
    protocol: reloadProtocol(role),
    rows: [
      { subjectId, readStart: 50, readEnd: 100, timeOrigin: 1000, continuity: lifeId, reloading: true, hp: 100, alive: true, weapon: 'carbine', ammo: 29 },
    ],
  }]));
  return {
    contract: 'real-shot-reload-transaction-v2',
    completed: true,
    subjectId,
    config: retainedConfig(),
    transaction: {
      subjectId,
      requestId,
      actionSequence,
      initiatorRole: 'guestA',
      trigger: {
        subjectId, requestId, actionSequence, atMs: 5.5, afterAtMs: 6.5, origin: 1000, initiatedAtMs: 6,
        beforeAmmo: 29, afterAmmo: 29, reloading: true,
        beforeLife: { subjectId, epoch: 7, hp: 100, alive: true, lifeId, supportLife: lifeId, deathCount: 2 },
        afterLife: { subjectId, epoch: 7, hp: 100, alive: true, lifeId, supportLife: lifeId, deathCount: 2 },
      },
      expected: { subjectId, lifeId, epoch: 7, deathCount: 2 },
      calibration: calibration(),
      host: { lifeId, lifeEvidence: { subjectId, lifeId, renderLife: lifeId, epoch: 7, deathCount: 2, hp: 100, alive: true, capturedAtMs: 1 }, protocolOrigin: 1000, protocol: peers.host.protocol },
      peers,
    },
    realShot: {
      naturalRespawn: true,
      safeSkyShot: true,
      safeShotEvidence: { safe: true, playerPosition: [0, 0, 0], pitch: 1.5, yaw: 0 },
      ammoAcknowledged: true,
      weapon: 'carbine',
      ammoBefore: 30,
      ammoAfter: 29,
      allPeersBeforeAmmo: 30,
      allPeersAfterAmmo: 29,
      allPeersBefore: { host: 30, guestA: 30, guestB: 30 },
      allPeersAfter: { host: 29, guestA: 29, guestB: 29 },
      acknowledgement: { stableForMs: 250, nodeBeforeMs: 500, nodeAfterMs: 750 },
    },
    precondition: { reloadBeforeAmmo: 29, fullMagazine: false, expectedLifeId: lifeId, expectedEpoch: 7, expectedDeathCount: 2 },
    timing: { reloadNodeBefore: 1000, reloadNodeAfter: 1001, deadlineNodeMs: 6850, samplePointNodeBefore: 1400, samplePointNodeAfter: 1401, finalObservationNodeBefore: 2000, finalObservationNodeAfter: 2001, finalObservedWithinDeadline: true },
    finalByPeer: Object.fromEntries(['host', 'guestA', 'guestB'].map((role) => [role, { players: { [subjectId]: finalPlayer() } }])),
  };
}

function deathStage(atMs, fields = {}) {
  return { subjectId, atMs, epoch: 7, deathCount: 3, hp: 0, alive: false, renderLife: 3, supportLife: 4, ...fields };
}

function deathFixture() {
  const stages = Object.fromEntries(['host', 'guestA', 'guestB'].map((role) => {
    const rows = [
      deathStage(10),
      deathStage(20, { renderLife: 4 }),
      { subjectId, atMs: 40, epoch: 7, deathCount: 3, hp: 100, alive: true, renderLife: 4, supportLife: 4, weapon: 'carbine', primary: 'carbine', ammo: 30, reserve: 120 },
    ];
    return [role, { rows, samples: rows.length, dropped: 0 }];
  }));
  stages.guestB.rows.unshift({ subjectId, atMs: 5, epoch: 7, deathCount: 2, hp: 100, alive: true, renderLife: 3, supportLife: 3, weapon: 'carbine', primary: 'carbine', ammo: 30, reserve: 120 });
  return {
    contract: 'causal-death-stages-v2',
    completed: true,
    baseline: { subjectId, epoch: 7, lifeId: 3, deathCount: 2 },
    trigger: {
      before: { subjectId, epoch: 7, hp: 100, alive: true, deathCount: 2 },
      after: { subjectId, epoch: 7, hp: 0, alive: false, deathCount: 3 },
      applied: { targetId: subjectId, storedBefore: 100, storedAfter: 0 },
    },
    stages,
    traces: {
      host: { health: { enabled: true, recorded: 1, dropped: 0, rows: [{ ordinal: 1, stage: 'publish', subjectId, authorId: 'host', revision: 11, matchEpoch: 7, continuity: 3, hp: 0, observedHp: 0 }] }, message: { enabled: true, recorded: 1, dropped: 0, entries: [{ type: 'death', subjectId, atMs: 15, direction: 'out' }] } },
      guestA: { health: { enabled: true, recorded: 1, dropped: 0, rows: [{ ordinal: 1, stage: 'apply', subjectId, authorId: 'host', revision: 11, matchEpoch: 7, continuity: 3, hp: 0, observedHp: 0 }] }, message: { enabled: true, recorded: 0, dropped: 0, entries: [] } },
      guestB: { health: { enabled: true, recorded: 1, dropped: 0, rows: [{ ordinal: 1, stage: 'apply', subjectId, authorId: 'host', revision: 11, matchEpoch: 7, continuity: 3, hp: 0, observedHp: 0 }] }, message: { enabled: true, recorded: 0, dropped: 0, entries: [] } },
    },
    traceScope: { publication: { subjectId, revision: 11, continuity: 3, matchEpoch: 7, authorId: 'host' }, hostCandidateCount: 1 },
    deathEvents: [{ kind: 'canonical-death', subjectId, atMs: 15, direction: 'out', transportCopies: 2, revision: 11, continuity: 3, matchEpoch: 7, authorId: 'host' }],
    ordering: { captured: true },
  };
}

test('v22 reload accepts only the real shot-correlated single-commit transaction', () => {
  const result = evaluateReloadV22(reloadFixture());
  assert.equal(result.pass, true, JSON.stringify(result.reasons));
});

test('v22 reload baseline stability ignores advancing sample clocks', () => {
  const fixture = reloadFixture();
  const life = Object.fromEntries(['host', 'guestA', 'guestB'].map((role) => [role, {
    subjectId, atMs: 10, epoch: 7, hp: 100, alive: true, renderLife: lifeId, supportLife: lifeId, deathCount: 2,
  }]));
  const views = fixture.finalByPeer;
  const first = reloadBaselineSignature(life, views, subjectId);
  for (const row of Object.values(life)) row.atMs += 50;
  const second = reloadBaselineSignature(life, views, subjectId);
  assert.equal(first, second);
});

test('v22 reload encloses quantized reads conservatively and retains transaction timing', () => {
  const fixture = reloadFixture();
  for (const peer of Object.values(fixture.transaction.peers)) {
    Object.assign(peer.rows[0], { previousReadEnd: 50, readStart: 100, readEnd: 100 });
  }
  assert.equal(evaluateReloadV22(fixture).pass, true);
  for (const previousReadEnd of [undefined, null, 100, 101, 0]) {
    const invalid = structuredClone(fixture);
    invalid.transaction.peers.guestA.rows[0].previousReadEnd = previousReadEnd;
    assert.equal(evaluateReloadV22(invalid).pass, false, `previous read ${previousReadEnd}`);
  }
  const reversed = structuredClone(fixture);
  reversed.transaction.peers.guestA.rows[0].readEnd = 99;
  assert.equal(evaluateReloadV22(reversed).pass, false);
});

test('v22 reload needs an actual post-acknowledgement sample even when state is unchanged', () => {
  const fixture = reloadFixture();
  const peer = fixture.transaction.peers.guestA;
  const later = { ...peer.rows[0], changed: false };
  Object.assign(peer.rows[0], { readStart: 5, readEnd: 10 });
  assert.equal(evaluateReloadV22(fixture).pass, false);
  peer.rows.push(later);
  assert.equal(evaluateReloadV22(fixture).pass, true);
});

test('v22 reload ignores an older same-subject admission when selecting the current trigger', () => {
  const fixture = reloadFixture();
  fixture.transaction.host.protocol.unshift({ atMs: 1, direction: 'admit', actorId: subjectId, requestId: 'reload-old-3-s-9', action: 'start', status: 'accepted', reason: 'accepted', actionSequence: 9 });
  assert.equal(evaluateReloadV22(fixture).pass, true, JSON.stringify(evaluateReloadV22(fixture).reasons));
});

test('v22 reload rejects eventual ammo without causal transaction evidence', () => {
  const fixture = reloadFixture();
  fixture.transaction.host.protocol = [];
  for (const peer of Object.values(fixture.transaction.peers)) {
    peer.protocol = [];
    peer.rows = [];
  }
  assert.equal(evaluateReloadV22(fixture).pass, false);
});

test('v22 reload negative fixtures remain failures', () => {
  const cases = {
    'missing-host-acceptance': (fixture) => { fixture.transaction.host.protocol = fixture.transaction.host.protocol.filter((row) => row.direction !== 'admit'); },
    'late-only-observer': (fixture) => { for (const peer of Object.values(fixture.transaction.peers)) { peer.rows[0].readStart = 250; peer.rows[0].readEnd = 300; } },
    'stale-request': (fixture) => { fixture.transaction.host.protocol[0].requestId = 'stale-request'; },
    'cancelled': (fixture) => { fixture.transaction.host.protocol.push({ atMs: 40, actorId: subjectId, requestId, action: 'cancel', status: 'cancelled', reason: 'cancelled', actionSequence }); },
    'duplicate-commit': (fixture) => { fixture.transaction.host.protocol.push({ atMs: 201, direction: 'send', actorId: subjectId, requestId, action: 'result', status: 'committed', reason: 'committed', actionSequence }); },
    'full-mag-precondition': (fixture) => { fixture.precondition.reloadBeforeAmmo = 30; fixture.precondition.fullMagazine = true; },
    '350ms-responsiveness-ceiling': (fixture) => { fixture.config.responsivenessCeilingMs = 350; },
    'peer-refill-disagreement': (fixture) => { fixture.finalByPeer.guestB.players[subjectId].ammo = 29; },
    'missing-local-initiation': (fixture) => { fixture.transaction.peers.guestA.protocol = fixture.transaction.peers.guestA.protocol.filter((row) => row.status !== 'requested'); },
    'unstable-shot-ack': (fixture) => { fixture.realShot.acknowledgement.stableForMs = 100; },
    'trigger-before-ammo': (fixture) => { fixture.transaction.trigger.beforeAmmo = 30; },
    'late-final-observation': (fixture) => { fixture.timing.finalObservationNodeAfter = fixture.timing.deadlineNodeMs + 1; fixture.timing.finalObservedWithinDeadline = false; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const fixture = structuredClone(reloadFixture());
    mutate(fixture);
    assert.equal(evaluateReloadV22(fixture).pass, false, name);
  }
});

test('v22 death accepts causal HP0/support/new-life ordering with non-atomic dead tuple', () => {
  const result = evaluateDeathV22(deathFixture());
  assert.equal(result.pass, true, JSON.stringify(result.reasons));
  assert.equal(result.evidence.nonAtomicDeadTupleAllowed, true);
});

test('v22 death negative fixtures remain failures', () => {
  const cases = {
    'stale-stage-epoch': (fixture) => { fixture.stages.guestA.rows[0].epoch = 6; },
    'stale-life-stage': (fixture) => { fixture.stages.guestA.rows[0].supportLife = 2; fixture.stages.guestA.rows[1].supportLife = 2; },
    'duplicate-death-event': (fixture) => { fixture.deathEvents.push({ kind: 'canonical-death', subjectId, atMs: 16, direction: 'out' }); },
    'missing-death': (fixture) => { fixture.stages.host.rows = fixture.stages.host.rows.filter((row) => row.hp !== 0); },
    'missing-newlife': (fixture) => { fixture.stages.guestA.rows = [deathStage(10, { supportLife: 3 }) , fixture.stages.guestA.rows[2]]; },
    'missing-final-newlife': (fixture) => { fixture.stages.guestB.rows = fixture.stages.guestB.rows.slice(0, 2); },
    'missing-health-publication': (fixture) => { fixture.traces.host.health.rows = []; },
    'duplicate-health-apply': (fixture) => { fixture.traces.guestA.health.rows.push({ ...fixture.traces.guestA.health.rows[0] }); },
    'missing-canonical-death': (fixture) => { fixture.deathEvents = []; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const fixture = structuredClone(deathFixture());
    mutate(fixture);
    assert.equal(evaluateDeathV22(fixture).pass, false, name);
  }
});

test('v22 death separates identical transport copies from independently proven canonical death', () => {
  const fixture = deathFixture();
  fixture.traces.host.health.rows.push({ ...fixture.traces.host.health.rows[0], ordinal: 2 });
  fixture.traces.host.health.recorded = 2;
  const result = evaluateDeathV22(fixture);
  assert.equal(result.pass, true, JSON.stringify(result.reasons));
  assert.equal(result.evidence.hostLethalPublicationCount, 2);
  assert.equal(result.evidence.canonicalDeath.canonicalLethalFactCount, 1);
  for (const mutate of [
    f => { f.traces.host.health.rows[1].revision += 1; },
    f => { f.traces.host.health.rows[1].hp = 100; },
    f => { delete f.traces.host.health.rows[1].authorId; },
    f => { f.trigger.after.deathCount += 1; },
    f => { f.deathEvents.push({ ...f.deathEvents[0] }); },
    f => { delete f.trigger.applied; },
  ]) {
    const invalid = structuredClone(fixture);
    mutate(invalid);
    assert.equal(evaluateDeathV22(invalid).pass, false);
  }
});

test('v22 page life callback is read-only and returns causal identity fields', () => {
  const original = {
    player: { id: 'host', hp: 100, alive: true, weapon: 'carbine', primaryWeapon: 'carbine', ammo: 30, reserve: 120, reloading: false },
    killstreak: { matchEpoch: 7, actors: [{ actorId: subjectId, lifeId: 4 }] },
    privateMatch: { scores: [{ id: subjectId, deaths: 3 }] },
    remotePlayers: [{ id: subjectId, hp: 0, continuity: 4, weapon: 'carbine', primary: 'carbine', combatInventory: { ammo: { carbine: 30 }, reserve: { carbine: 120 } }, reloading: false }],
    networkSync: { localContinuity: 4 },
  };
  globalThis.window = { __ATOMIC_ACRES_DEBUG__: { snapshot: () => structuredClone(original) } };
  const value = v22LifeInPage({ id: subjectId });
  assert.equal(value.subjectId, subjectId);
  assert.equal(value.hp, 0);
  assert.equal(value.supportLife, 4);
  assert.deepEqual(original.remotePlayers[0].combatInventory.ammo, { carbine: 30 });
  delete globalThis.window;
});

test('v22 top-level gate keeps original soak thresholds in its config', () => {
  const result = evaluateMpSoakV22({
    contract: 'mp-soak-gate-v2.2', sourceSha: 'a'.repeat(40), completed: true,
    config: { ...retainedConfig(), packetLossPct: 1, sampleIntervalMs: 1000, playDurationMs: 180000, positionBoundM: 1.5, hardTimeoutMs: 299000 },
    timing: { playDurationMs: 180000 }, replication: { samples: [], divergences: [], pairDirections: {} },
    lifecycle: { transition: null, samples: [] }, rejoin: { role: 'guestB', damage: {} },
    scenarios: { guests: { guestA: {}, guestB: {} } }, consoleErrors: { host: [], guestA: [], guestB: [] },
    scoreboard: { agreement: false }, liveArtifact: {},
    reload: { guests: { guestA: reloadFixture(), guestB: reloadFixture() } },
    death: { guests: { guestA: deathFixture(), guestB: deathFixture() } },
  });
  assert.equal(result.contract, 'mp-soak-gate-v2.2');
  assert.ok(result.rows.length > 2);
  assert.deepEqual(result.rows.slice(-2).map((row) => row.id), ['MP-V22-REAL-SHOT-RELOAD', 'MP-V22-CAUSAL-DEATH-STAGES']);
  assert.equal(V22_SOAK_CONFIG.hardTimeoutMs, 299000);
  assert.equal(V22_SOAK_CONFIG.healthLatencyMs, 120);
  assert.equal(V22_SOAK_CONFIG.connectedSamples, 180);
  assert.equal(V22_SOAK_CONFIG.positionBoundM, 1.5);
});
