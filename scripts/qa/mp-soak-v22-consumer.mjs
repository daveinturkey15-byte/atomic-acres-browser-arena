// v2.2 QA-only consumer. It evaluates evidence; it never mutates a browser,
// canonical multiplayer state, or a retained v1/v2/v2.1 report.

import { evaluateMpSoakV21 } from './mp-soak-v21-life.mjs';
import { clockEnvelope } from './health-latency-v2.mjs';
import { evaluateCanonicalDeathReplay } from './mp-canonical-replay-consumer.mjs';

export const V22_PEERS = Object.freeze(['host', 'guestA', 'guestB']);
export const SOAK_V22_CONTRACT = 'mp-soak-gate-v2.2';
export const RELOAD_V22_CONTRACT = 'real-shot-reload-transaction-v2';
export const DEATH_V22_CONTRACT = 'causal-death-stages-v2';
export const CARBINE_MAGAZINE_CAPACITY = 30;
export const REAL_SHOT_ACK_STABILITY_MS = 250;

// These are retained v2/v2.1 values. The 350 ms value is an observation point,
// never a responsiveness ceiling or a negative claim.
export const V22_SOAK_CONFIG = Object.freeze({
  playDurationMs: 180_000,
  hardTimeoutMs: 299_000,
  sampleIntervalMs: 1_000,
  connectedSamples: 180,
  positionBoundM: 1.5,
  healthLatencyMs: 120,
  reloadSamplePointMs: 350,
  reloadCompletionBudgetMs: 4_000,
});

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const integer = (value) => Number.isSafeInteger(value);
const identity = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const object = (value) => value !== null && typeof value === 'object';

// Equal raw timestamps occur when a cheap read fits within the browser clock's
// precision. Enclose it with the previous read instead of inventing precision.
// This widens uncertainty: the ENTIRE bracket must still fit the transaction.
export function reloadReadEnvelope(row) {
  if (!finite(row?.readStart) || !finite(row?.readEnd) || row.readEnd < row.readStart) return null;
  if (row.readEnd > row.readStart) return { low: row.readStart, high: row.readEnd };
  if (!finite(row.previousReadEnd) || row.previousReadEnd >= row.readStart) return null;
  return { low: row.previousReadEnd, high: row.readEnd };
}

function reason(result, value) {
  if (value) result.reasons.push(value);
  return result;
}

function baseResult(contract) {
  return { contract, pass: false, reasons: [], evidence: {} };
}

// Serializable callback for Playwright. The phase is intentionally ignored so
// the callback cannot manufacture a stage by changing game state.
export function v22LifeInPage({ id }) {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const self = snapshot.player?.id === id;
  const player = self ? snapshot.player : snapshot.remotePlayers?.find((candidate) => candidate.id === id);
  if (!player) return false;
  return {
    subjectId: id,
    atMs: performance.now(),
    origin: performance.timeOrigin,
    epoch: snapshot.killstreak?.matchEpoch ?? null,
    hp: player.hp,
    alive: self ? player.alive : player.hp > 0,
    renderLife: self ? snapshot.networkSync?.localContinuity ?? null : player.continuity ?? null,
    supportLife: snapshot.killstreak?.actors?.find((actor) => actor.actorId === id)?.lifeId ?? null,
    deathCount: snapshot.privateMatch?.scores?.find((score) => score.id === id)?.deaths ?? null,
    weapon: player.weapon ?? null,
    primary: self ? player.primaryWeapon ?? null : player.primary ?? null,
    ammo: self ? player.ammo ?? null : player.combatInventory?.ammo?.[player.weapon] ?? null,
    reserve: self ? player.reserve ?? null : player.combatInventory?.reserve?.[player.weapon] ?? null,
    reloading: player.reloading ?? null,
  };
}

export function v22ReloadInPage({ id }) {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const self = snapshot.player?.id === id;
  const player = self ? snapshot.player : snapshot.remotePlayers?.find((candidate) => candidate.id === id);
  if (!player) return false;
  return {
    subjectId: id,
    atMs: performance.now(),
    origin: performance.timeOrigin,
    epoch: snapshot.killstreak?.matchEpoch ?? null,
    hp: player.hp,
    alive: self ? player.alive : player.hp > 0,
    renderLife: self ? snapshot.networkSync?.localContinuity ?? null : player.continuity ?? null,
    supportLife: snapshot.killstreak?.actors?.find((actor) => actor.actorId === id)?.lifeId ?? null,
    deathCount: snapshot.privateMatch?.scores?.find((score) => score.id === id)?.deaths ?? null,
    weapon: player.weapon ?? null,
    primary: self ? player.primaryWeapon ?? null : player.primary ?? null,
    ammo: self ? player.ammo ?? null : player.combatInventory?.ammo?.[player.weapon] ?? null,
    reserve: self ? player.reserve ?? null : player.combatInventory?.reserve?.[player.weapon] ?? null,
    reloading: player.reloading ?? null,
  };
}

// Stability keys deliberately exclude the sampled browser clock. The clock is
// evidence for ordering/brackets, not part of whether the same settled state
// persisted across reads.
export function reloadBaselineSignature(life, views, subjectId) {
  return JSON.stringify(Object.fromEntries(V22_PEERS.map((role) => {
    const lifeRow = life?.[role] ?? {};
    const player = views?.[role]?.players?.[subjectId] ?? {};
    return [role, {
      subjectId: lifeRow.subjectId,
      epoch: lifeRow.epoch,
      renderLife: lifeRow.renderLife,
      supportLife: lifeRow.supportLife,
      deathCount: lifeRow.deathCount,
      hp: lifeRow.hp,
      alive: lifeRow.alive,
      weapon: player.weapon,
      ammo: player.ammo,
    }];
  })));
}

function protocolRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.protocol)) return value.protocol;
  return [];
}

function sampleRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
}

function finalPlayer(value, subjectId) {
  if (!object(value)) return null;
  if (value.subjectId === subjectId) return value;
  if (value.player && value.subjectId === undefined) return value.player;
  if (value.players?.[subjectId]) return value.players[subjectId];
  return null;
}

function expectedConfig(report) {
  const config = report.config ?? {};
  return config.playDurationMs === V22_SOAK_CONFIG.playDurationMs
    && config.hardTimeoutMs === V22_SOAK_CONFIG.hardTimeoutMs
    && config.sampleIntervalMs === V22_SOAK_CONFIG.sampleIntervalMs
    && config.connectedSamples === V22_SOAK_CONFIG.connectedSamples
    && config.positionBoundM === V22_SOAK_CONFIG.positionBoundM
    && config.healthLatencyMs === V22_SOAK_CONFIG.healthLatencyMs
    && config.reloadSamplePointMs === V22_SOAK_CONFIG.reloadSamplePointMs
    && config.reloadCompletionBudgetMs === V22_SOAK_CONFIG.reloadCompletionBudgetMs;
}

function transactionResult(report) {
  const result = baseResult(RELOAD_V22_CONTRACT);
  const transaction = report.transaction ?? {};
  const config = report.config ?? {};
  const subjectId = report.subjectId ?? transaction.subjectId;
  const expected = transaction.expected ?? {};
  const hostRows = protocolRows(transaction.host?.protocol ?? transaction.hostTrace);
  const requestId = transaction.requestId;
  const actionSequence = transaction.actionSequence;
  const trigger = transaction.trigger;
  const initiatorRole = transaction.initiatorRole;

  if (report.contract !== RELOAD_V22_CONTRACT) reason(result, 'wrong-reload-contract');
  if (report.completed !== true) reason(result, 'incomplete-real-shot-reload');
  if (!expectedConfig({ config })) reason(result, 'retained-soak-config-changed');
  if (config.reloadSamplePointMs !== V22_SOAK_CONFIG.reloadSamplePointMs) reason(result, '350ms-samplepoint-missing');
  if (config.reloadCompletionBudgetMs !== V22_SOAK_CONFIG.reloadCompletionBudgetMs) reason(result, '4000ms-completion-budget-changed');
  if (config.ackBudgetMs !== 1_500 || config.reloadScenarioDeadlineMs !== config.reloadSamplePointMs + config.reloadCompletionBudgetMs + config.ackBudgetMs) reason(result, 'original-reload-deadline-changed');
  if (config.rttMs !== undefined && config.rttMs !== 120) reason(result, 'rtt-bound-changed');
  if (config.responsivenessCeilingMs !== undefined) reason(result, 'responsiveness-ceiling-claim-present');
  if (config.no350msResponsivenessCeilingClaim !== true) reason(result, 'missing-no-350ms-ceiling-attestation');
  if (!identity(subjectId)) reason(result, 'missing-subject-id');
  if (!identity(requestId)) reason(result, 'missing-request-id');
  if (!integer(actionSequence) || actionSequence < 0) reason(result, 'missing-action-sequence');

  const shot = report.realShot ?? {};
  if (shot.safeSkyShot !== true || shot.safeShotEvidence?.safe !== true) reason(result, 'safe-sky-shot-not-proven');
  if (shot.naturalRespawn !== true) reason(result, 'natural-respawn-not-proven');
  if (shot.ammoAcknowledged !== true) reason(result, 'real-ammo-consumption-not-acknowledged');
  if (shot.weapon !== 'carbine' || shot.ammoBefore !== CARBINE_MAGAZINE_CAPACITY || shot.ammoAfter !== CARBINE_MAGAZINE_CAPACITY - 1) {
    reason(result, 'real-shot-did-not-consume-one-carbine-round');
  }
  const allPeersBefore = shot.allPeersBefore;
  const allPeersAfter = shot.allPeersAfter;
  if (!object(allPeersBefore) || !object(allPeersAfter)
    || !V22_PEERS.every((role) => allPeersBefore[role] === CARBINE_MAGAZINE_CAPACITY)
    || !V22_PEERS.every((role) => allPeersAfter[role] === CARBINE_MAGAZINE_CAPACITY - 1)) {
    reason(result, 'shot-ammo-not-agreed-by-all-peers');
  }
  const acknowledgement = shot.acknowledgement ?? {};
  if (!finite(acknowledgement.stableForMs) || acknowledgement.stableForMs < REAL_SHOT_ACK_STABILITY_MS
    || !integer(acknowledgement.nodeBeforeMs) || !integer(acknowledgement.nodeAfterMs)
    || acknowledgement.nodeAfterMs < acknowledgement.nodeBeforeMs) reason(result, 'shot-ammo-acknowledgement-not-stable-250ms');

  const precondition = report.precondition ?? {};
  if (precondition.reloadBeforeAmmo >= CARBINE_MAGAZINE_CAPACITY || precondition.fullMagazine === true) {
    reason(result, 'full-magazine-reload-precondition');
  }
  if (precondition.reloadBeforeAmmo !== CARBINE_MAGAZINE_CAPACITY - 1) reason(result, 'reload-precondition-not-the-real-shot-result');
  if (precondition.expectedLifeId === undefined || !integer(precondition.expectedLifeId)) reason(result, 'missing-expected-life');
  if (precondition.expectedEpoch !== expected.epoch || precondition.expectedDeathCount !== expected.deathCount
    || precondition.reloadBeforeAmmo !== trigger?.beforeAmmo) reason(result, 'reload-precondition-not-trigger-correlated');
  if (expected.subjectId !== subjectId || expected.lifeId !== precondition.expectedLifeId
    || !integer(expected.epoch) || !integer(expected.deathCount)) reason(result, 'request-subject-life-not-correlated');

  if (!V22_PEERS.includes(initiatorRole)) reason(result, 'reload-initiator-role-missing');
  if (!object(trigger) || trigger.subjectId !== subjectId || trigger.requestId !== requestId
    || trigger.actionSequence !== actionSequence || !finite(trigger.atMs) || !finite(trigger.afterAtMs)
    || !finite(trigger.origin) || trigger.afterAtMs < trigger.atMs) reason(result, 'reload-trigger-window-missing');
  if (trigger?.beforeAmmo !== CARBINE_MAGAZINE_CAPACITY - 1
    || trigger?.afterAmmo !== CARBINE_MAGAZINE_CAPACITY - 1 || trigger?.reloading !== true) {
    reason(result, 'reload-trigger-precondition-not-observed');
  }
  const triggerBeforeLife = trigger?.beforeLife;
  const triggerAfterLife = trigger?.afterLife;
  if (!triggerBeforeLife || !triggerAfterLife
    || triggerBeforeLife.subjectId !== subjectId || triggerBeforeLife.epoch !== expected.epoch
    || triggerBeforeLife.lifeId !== precondition.expectedLifeId || triggerBeforeLife.deathCount !== expected.deathCount
    || triggerBeforeLife.hp !== 100 || triggerBeforeLife.alive !== true
    || triggerAfterLife.subjectId !== subjectId || triggerAfterLife.epoch !== expected.epoch
    || triggerAfterLife.lifeId !== precondition.expectedLifeId || triggerAfterLife.deathCount !== expected.deathCount
    || triggerAfterLife.hp !== 100 || triggerAfterLife.alive !== true) {
    reason(result, 'reload-trigger-life-not-correlated');
  }

  const admitted = hostRows.filter((row) => row.direction === 'admit'
    && row.action === 'start' && row.status === 'accepted' && row.reason === 'accepted'
    && row.requestId === requestId);
  if (admitted.length !== 1) reason(result, admitted.length === 0 ? 'missing-host-acceptance' : 'duplicate-host-acceptance');
  const hostRelevant = hostRows.filter((row) => row.requestId === requestId);
  if (hostRelevant.some((row) => row.actorId !== subjectId || row.actionSequence !== actionSequence)) reason(result, 'host-request-identity-mismatch');
  const lifeEvidence = transaction.host?.lifeEvidence;
  if (!lifeEvidence || lifeEvidence.subjectId !== subjectId || lifeEvidence.lifeId !== precondition.expectedLifeId
    || lifeEvidence.renderLife !== precondition.expectedLifeId || lifeEvidence.epoch !== expected.epoch
    || lifeEvidence.deathCount !== expected.deathCount || lifeEvidence.hp !== 100 || lifeEvidence.alive !== true
    || !finite(lifeEvidence.capturedAtMs)) reason(result, 'host-acceptance-life-evidence-missing');
  const calibration = transaction.calibration ?? {};
  const started = hostRows.filter((row) => row.direction === 'send' && row.action === 'result'
    && row.status === 'started' && row.reason === 'accepted' && row.requestId === requestId);
  const committed = hostRows.filter((row) => row.direction === 'send' && row.action === 'result'
    && row.status === 'committed' && row.reason === 'committed' && row.requestId === requestId);
  if (started.length === 0) reason(result, 'missing-host-start-result');
  if (committed.length !== 1) reason(result, committed.length === 0 ? 'missing-single-host-commit' : 'duplicate-host-commit');
  if (started.length === 1 && committed.length === 1 && (!finite(started[0].atMs) || !finite(committed[0].atMs) || committed[0].atMs <= started[0].atMs)) {
    reason(result, 'host-commit-order-invalid');
  }
  if (hostRelevant.some((row) => row.status === 'cancelled' || row.action === 'cancel')) reason(result, 'cancelled-reload-transaction');

  const peerEvidence = transaction.peers ?? {};
  const finalByPeer = report.finalByPeer ?? {};
  const timing = report.timing ?? {};
  const expectedDeadline = timing.reloadNodeBefore + config.reloadSamplePointMs + config.reloadCompletionBudgetMs + config.ackBudgetMs;
  if (!integer(timing.reloadNodeBefore) || !integer(timing.reloadNodeAfter)
    || timing.reloadNodeAfter < timing.reloadNodeBefore
    || timing.deadlineNodeMs !== expectedDeadline
    || !integer(timing.samplePointNodeBefore) || !integer(timing.samplePointNodeAfter)
    || timing.samplePointNodeAfter < timing.samplePointNodeBefore
    || !integer(timing.finalObservationNodeBefore) || !integer(timing.finalObservationNodeAfter)
    || timing.finalObservationNodeAfter < timing.finalObservationNodeBefore
    || timing.finalObservationNodeAfter > timing.deadlineNodeMs
    || timing.finalObservedWithinDeadline !== true) reason(result, 'reload-deadline-not-evidenced-by-node-bracket');

  if (V22_PEERS.includes(initiatorRole)) {
    const initiationRows = protocolRows(peerEvidence[initiatorRole]?.protocol).filter((row) => row.requestId === requestId
      && row.actorId === subjectId && row.action === 'start' && row.actionSequence === actionSequence
      && row.direction === 'send' && row.status === 'requested' && row.reason === 'reliable-retry-lane');
    if (initiationRows.length === 0 || !finite(trigger?.initiatedAtMs)
      || !initiationRows.some((row) => row.atMs === trigger.initiatedAtMs && row.atMs >= trigger.atMs - 2)) {
      reason(result, 'reload-request-not-initiated-by-local-actor-in-current-window');
    }
  }
  for (const role of V22_PEERS) {
    const peer = peerEvidence[role] ?? {};
    const rows = protocolRows(peer.protocol);
    const relevant = rows.filter((row) => row.requestId === requestId);
    if (relevant.some((row) => row.actorId !== subjectId || row.actionSequence !== actionSequence)) reason(result, `${role}-request-identity-mismatch`);
    const peerStarted = relevant.filter((row) => row.action === 'result' && row.status === 'started' && row.reason === 'accepted');
    const peerCommitted = relevant.filter((row) => row.action === 'result' && row.status === 'committed' && row.reason === 'committed');
    if (peerStarted.length === 0) reason(result, `${role}-missing-start-observation`);
    if (peerCommitted.length !== 1) reason(result, peerCommitted.length === 0 ? `${role}-missing-commit-observation` : `${role}-duplicate-commit-observation`);
    const startAt = peerStarted.map((row) => row.atMs).filter(finite).sort((a, b) => a - b)[0];
    const commitAt = peerCommitted.map((row) => row.atMs).filter(finite).sort((a, b) => a - b)[0];
    const hostCommit = committed[0];
    const hostClock = clockEnvelope(calibration.before?.host, calibration.after?.host, {
      atMs: hostCommit?.atMs,
      timeOriginMs: transaction.host?.protocolOrigin,
    });
    const observedReload = sampleRows(peer).find((row) => row.subjectId === subjectId
      && row.continuity === precondition.expectedLifeId && row.reloading === true
      && row.hp === 100 && row.alive === true && row.weapon === 'carbine' && row.ammo === CARBINE_MAGAZINE_CAPACITY - 1
      // The observer exposes a read bracket, not an exact apply timestamp.
      // Start is compared in the observer's own page clock. Completion is
      // compared across calibrated clock envelopes, never by midpoint.
      && finite(startAt) && finite(commitAt) && finite(row.readStart) && finite(row.readEnd)
      && reloadReadEnvelope(row) !== null && reloadReadEnvelope(row).low >= startAt
      && clockEnvelope(calibration.before?.[role], calibration.after?.[role], {
        atMs: row.readEnd, timeOriginMs: row.timeOrigin,
      }).verdict === 'MAPPED'
      && hostClock.verdict === 'MAPPED'
      && row.readEnd + clockEnvelope(calibration.before?.[role], calibration.after?.[role], {
        atMs: row.readEnd, timeOriginMs: row.timeOrigin,
      }).high < hostCommit.atMs + hostClock.low);
    if (!observedReload) reason(result, `${role}-no-reload-during-correlated-transaction`);
    const final = finalPlayer(finalByPeer[role], subjectId);
    const finalDeathCount = final?.deaths ?? final?.score?.deaths;
    if (!final || final.alive !== true || final.hp !== 100 || final.continuity !== precondition.expectedLifeId
      || finalDeathCount !== expected.deathCount || final.weapon !== 'carbine'
      || final.ammo !== CARBINE_MAGAZINE_CAPACITY || !(final.reserve > 0) || final.reloading === true) {
      reason(result, `${role}-final-ammo-not-agreed-after-transaction`);
    }
  }

  result.evidence = {
    requestId,
    subjectId,
    actionSequence,
    expectedLifeId: precondition.expectedLifeId,
    hostAcceptanceCount: admitted.length,
    hostStartedCount: started.length,
    hostCommitCount: committed.length,
    observerReloadDuringTransaction: V22_PEERS.map((role) => ({
      role,
      observed: !result.reasons.includes(`${role}-no-reload-during-correlated-transaction`),
    })),
    samplePointMs: config.reloadSamplePointMs,
    completionBudgetMs: config.reloadCompletionBudgetMs,
    no350msResponsivenessCeilingClaim: config.no350msResponsivenessCeilingClaim === true,
  };
  result.pass = result.reasons.length === 0;
  return result;
}

function deathRows(report, role) {
  return sampleRows(report.stages?.[role] ?? report.samples?.[role]);
}

function traceEnabledAndComplete(trace) {
  return object(trace) && trace.enabled === true && trace.dropped === 0
    && Array.isArray(trace.rows ?? trace.entries)
    && integer(trace.recorded) && trace.recorded >= (trace.rows ?? trace.entries).length;
}

function exactDeathRow(row, subjectId, epoch, deathCount) {
  return object(row) && row.subjectId === subjectId && row.epoch === epoch
    && row.deathCount === deathCount;
}

function causalDeathResult(report) {
  const result = baseResult(DEATH_V22_CONTRACT);
  const baseline = report.baseline ?? {};
  const trigger = report.trigger ?? {};
  const subjectId = baseline.subjectId ?? report.subjectId;
  const epoch = baseline.epoch;
  const oldLife = baseline.lifeId;
  const oldDeaths = baseline.deathCount;
  const nextLife = integer(oldLife) ? oldLife + 1 : null;
  const nextDeaths = integer(oldDeaths) ? oldDeaths + 1 : null;

  if (report.contract !== DEATH_V22_CONTRACT) reason(result, 'wrong-death-contract');
  if (report.completed !== true) reason(result, 'incomplete-causal-death');
  if (!identity(subjectId) || !integer(epoch) || !integer(oldLife) || !integer(oldDeaths)) reason(result, 'invalid-death-baseline-identity');
  if (trigger.applied?.targetId !== subjectId || trigger.applied?.storedBefore !== 100 || trigger.applied?.storedAfter !== 0) reason(result, 'lethal-trigger-not-authoritatively-applied');
  if (trigger.before?.subjectId !== subjectId || trigger.before?.epoch !== epoch || trigger.before?.hp !== 100) reason(result, 'missing-hp100-before-trigger');
  if (trigger.before?.deathCount !== oldDeaths) reason(result, 'trigger-before-death-count-mismatch');
  if (trigger.after?.subjectId !== subjectId || trigger.after?.epoch !== epoch || trigger.after?.hp !== 0) reason(result, 'missing-hp0-after-trigger');
  if (trigger.after?.deathCount !== nextDeaths) reason(result, 'trigger-death-count-not-single-increment');

  const stageSummary = {};
  for (const role of V22_PEERS) {
    const stageTrace = report.stages?.[role];
    if (!object(stageTrace) || !Array.isArray(stageTrace.rows) || stageTrace.dropped !== 0) reason(result, `${role}-causal-observer-clipped`);
    const allRows = deathRows(report, role).filter((row) => object(row) && row.subjectId === subjectId);
    if (allRows.some((row) => row.epoch !== epoch)) reason(result, `${role}-stale-or-mismatched-death-epoch`);
    const rows = allRows.filter((row) => exactDeathRow(row, subjectId, epoch, nextDeaths));
    const dead = rows.find((row) => row.hp === 0 && row.alive === false);
    const supportInvalidated = rows.find((row) => row.hp === 0 && row.alive === false && row.supportLife === nextLife);
    const newLifeHeld = rows.find((row) => row.hp === 0 && row.alive === false
      && (row.renderLife === nextLife || row.supportLife === nextLife));
    const alive = rows.find((row) => row.hp === 100 && row.alive === true
      && row.renderLife === nextLife && row.supportLife === nextLife
      && row.weapon === row.primary && row.ammo > 0 && row.reserve > 0);
    if (!dead) reason(result, `${role}-missing-death-hp0-stage`);
    if (!supportInvalidated) reason(result, `${role}-missing-support-invalidation`);
    if (!newLifeHeld) reason(result, `${role}-missing-new-life-held-dead-stage`);
    if (!alive) reason(result, `${role}-missing-final-agreed-new-life`);
    if (dead && alive && (!finite(dead.atMs) || !finite(alive.atMs) || dead.atMs >= alive.atMs)) reason(result, `${role}-alive-before-hp0-ordering`);
    if (supportInvalidated && alive && (!finite(supportInvalidated.atMs) || !finite(alive.atMs) || supportInvalidated.atMs >= alive.atMs)) reason(result, `${role}-support-invalidation-after-alive`);
    if (newLifeHeld && alive && (!finite(newLifeHeld.atMs) || !finite(alive.atMs) || newLifeHeld.atMs >= alive.atMs)) reason(result, `${role}-new-life-held-after-alive`);
    // A peer can legitimately retain the old death count immediately after
    // the host trigger, before health/death delivery. Those rows are allowed;
    // the accepted stage rows above still require the single increment.
    stageSummary[role] = {
      sampled: rows.length,
      deathHp0AtMs: dead?.atMs ?? null,
      supportInvalidatedAtMs: supportInvalidated?.atMs ?? null,
      newLifeHeldAtMs: newLifeHeld?.atMs ?? null,
      finalAliveAtMs: alive?.atMs ?? null,
      observedDeadRenderLife: dead?.renderLife ?? null,
      observedDeadSupportLife: dead?.supportLife ?? null,
    };
  }

  const traces = report.traces ?? {};
  const traceScope = report.traceScope ?? {};
  const publication = traceScope.publication;
  if (!publication || publication.subjectId !== subjectId || !integer(publication.revision)
    || !integer(publication.continuity) || !integer(publication.matchEpoch) || !identity(publication.authorId)
    || traceScope.hostCandidateCount !== 1) reason(result, 'single-correlated-death-publication-missing');
  for (const role of V22_PEERS) {
    const health = traces[role]?.health;
    const message = traces[role]?.message;
    if (!traceEnabledAndComplete(health)) reason(result, `${role}-health-trace-missing-or-clipped`);
    if (!traceEnabledAndComplete(message)) reason(result, `${role}-message-trace-missing-or-clipped`);
  }
  const samePublication = (row) => object(row) && publication && row.subjectId === publication.subjectId
    && row.revision === publication.revision && row.continuity === publication.continuity
    && row.matchEpoch === publication.matchEpoch && row.authorId === publication.authorId;
  const hostHealth = sampleRows(traces.host?.health);
  // HealthTrace calls the match identity `matchEpoch`; accept only that exact
  // field and never infer causality from a bare HP value.
  const hostPublishExact = hostHealth.filter((row) => row.stage === 'publish' && samePublication(row)
    && row.subjectId === subjectId && row.matchEpoch === epoch && row.continuity === oldLife && row.hp === 0);
  if (hostPublishExact.length === 0) reason(result, 'missing-host-lethal-health-publication');
  // Identical health retransmissions are not additional deaths. Require the
  // independently captured counter increment and complete canonical identity;
  // conflicting copies, extra lethal revisions and missing evidence stay red.
  const canonicalDeath = evaluateCanonicalDeathReplay({
    traceScope: 'multi', expected: publication, baselineDeathCount: oldDeaths,
    trigger: report.trigger, healthRows: hostHealth, deathEvents: report.deathEvents,
  });
  if (!canonicalDeath.pass) for (const entry of canonicalDeath.reasons) reason(result, `canonical-death-${entry}`);
  for (const role of ['guestA', 'guestB']) {
    const health = sampleRows(traces[role]?.health);
    const applied = health.filter((row) => row.stage === 'apply' && samePublication(row)
      && row.subjectId === subjectId && row.matchEpoch === epoch && row.hp === 0 && row.observedHp === 0);
    if (applied.length !== 1) reason(result, applied.length === 0
      ? `${role}-missing-health-apply-ordering` : `${role}-duplicate-health-apply-ordering`);
  }
  if (report.ordering?.captured !== true) reason(result, 'async-ordering-not-captured');
  const deathEvents = Array.isArray(report.deathEvents) ? report.deathEvents : [];
  const scopedDeathEvents = deathEvents.filter((event) => event.subjectId === subjectId && event.kind === 'canonical-death');
  if (scopedDeathEvents.length !== 1 || !samePublication(scopedDeathEvents[0])
    || !integer(scopedDeathEvents[0]?.transportCopies) || scopedDeathEvents[0].transportCopies < 1) reason(result, 'duplicate-or-missing-correlated-canonical-death-event');

  result.evidence = {
    subjectId,
    epoch,
    baselineLifeId: oldLife,
    nextLifeId: nextLife,
    baselineDeathCount: oldDeaths,
    nextDeathCount: nextDeaths,
    stageSummary,
    nonAtomicDeadTupleAllowed: true,
    hostLethalPublicationCount: hostPublishExact.length,
    canonicalDeath: canonicalDeath.evidence,
    publicationKey: publication ?? null,
    asyncOrderingCaptured: report.ordering?.captured === true,
  };
  result.pass = result.reasons.length === 0;
  return result;
}

export function evaluateReloadV22(report) {
  if (object(report.guests)) {
    const perGuest = Object.fromEntries(Object.entries(report.guests).map(([role, guest]) => [role, transactionResult(guest)]));
    const result = baseResult(RELOAD_V22_CONTRACT);
    for (const role of ['guestA', 'guestB']) {
      const guest = perGuest[role];
      if (!guest) {
        result.reasons.push(`${role}-missing-guest-report`);
        continue;
      }
      if (!guest.pass) result.reasons.push(...guest.reasons.map((entry) => `${role}-${entry}`));
    }
    result.evidence = { guests: Object.fromEntries(Object.entries(perGuest).map(([role, guest]) => [role, guest.evidence])) };
    result.pass = result.reasons.length === 0 && perGuest.guestA !== undefined && perGuest.guestB !== undefined;
    return result;
  }
  return transactionResult(report);
}

export function evaluateDeathV22(report) {
  if (object(report.guests)) {
    const perGuest = Object.fromEntries(Object.entries(report.guests).map(([role, guest]) => [role, causalDeathResult(guest)]));
    const result = baseResult(DEATH_V22_CONTRACT);
    for (const role of ['guestA', 'guestB']) {
      const guest = perGuest[role];
      if (!guest) {
        result.reasons.push(`${role}-missing-guest-report`);
        continue;
      }
      if (!guest.pass) result.reasons.push(...guest.reasons.map((entry) => `${role}-${entry}`));
    }
    result.evidence = { guests: Object.fromEntries(Object.entries(perGuest).map(([role, guest]) => [role, guest.evidence])) };
    result.pass = result.reasons.length === 0 && perGuest.guestA !== undefined && perGuest.guestB !== undefined;
    return result;
  }
  return causalDeathResult(report);
}

export function evaluateMpSoakV22(report) {
  const reload = evaluateReloadV22(report.reload ?? {});
  const death = evaluateDeathV22(report.death ?? {});
  // Preserve the immutable full v2.1 soak evaluator and replace only its
  // scoped reload/respawn/death rows. This keeps duration, replication,
  // rejoin/health, stair-fire, console, scoreboard, config, and live-artifact
  // coverage in the v2.2 full gate.
  const retained = evaluateMpSoakV21({ ...report, contract: 'mp-soak-gate-v2.1' });
  const replaced = new Set([
    'MP-SOAK-RELOAD-AFTER-DEATH',
    'MP-SOAK-RESPAWN-RESET',
    'MP-V21-MAPPED-DEATH-RESPAWN',
  ]);
  const rows = retained.rows.filter((row) => !replaced.has(row.id));
  rows.push(
    { id: 'MP-V22-REAL-SHOT-RELOAD', requirement: 'real-shot request/subject/life transaction, observer reload, one unique commit, all-peer refill', pass: reload.pass, evidence: reload.evidence },
    { id: 'MP-V22-CAUSAL-DEATH-STAGES', requirement: 'causal HP0, support invalidation, held new life, final agreed life and async ordering', pass: death.pass, evidence: death.evidence },
  );
  return { ...retained, contract: SOAK_V22_CONTRACT, rows, pass: rows.every((row) => row.pass), reload, death };
}
