// HF-499: pure assertions for the multiplayer soak evidence bundle.
// Keep this module browser-free so the gate's own pass/fail logic is tested
// without depending on WebGPU, PeerJS, or a live browser run.

export const MP_SOAK_THRESHOLDS = Object.freeze({
  playDurationMs: 180_000,
  sampleIntervalMs: 1_000,
  positionBoundM: 1.5,
  rttMs: 120,
});

const PEERS = Object.freeze(['host', 'guestA', 'guestB']);
const DIRECTED_PAIRS = Object.freeze(
  PEERS.flatMap((from) => PEERS.filter((to) => to !== from).map((to) => `${from}->${to}`)),
);

function object(value) {
  return value !== null && typeof value === 'object' ? value : {};
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boolean(value) {
  return value === true;
}

function row(id, requirement, pass, evidence) {
  return Object.freeze({ id, requirement, pass: Boolean(pass), evidence });
}

function allConsoleErrors(bundle) {
  const errors = object(bundle.consoleErrors);
  return PEERS.flatMap((peer) => Array.isArray(errors[peer]) ? errors[peer] : []);
}

function configured(bundle, key, fallback) {
  const config = object(bundle.config);
  return finite(config[key]) ?? fallback;
}

export function evaluateMpSoakBundle(bundle, thresholds = MP_SOAK_THRESHOLDS) {
  const evidence = object(bundle);
  const config = object(evidence.config);
  const duration = finite(object(evidence.timing).playDurationMs);
  const requiredDuration = finite(thresholds.playDurationMs) ?? MP_SOAK_THRESHOLDS.playDurationMs;
  const requiredSampleInterval = finite(thresholds.sampleIntervalMs) ?? MP_SOAK_THRESHOLDS.sampleIntervalMs;
  const positionBound = configured(evidence, 'positionBoundM', finite(thresholds.positionBoundM) ?? MP_SOAK_THRESHOLDS.positionBoundM);
  const rtt = configured(evidence, 'rttMs', finite(thresholds.rttMs) ?? MP_SOAK_THRESHOLDS.rttMs);
  const expectedSamples = Math.floor(requiredDuration / requiredSampleInterval);
  const replication = object(evidence.replication);
  const samples = Array.isArray(replication.samples) ? replication.samples : [];
  const divergences = Array.isArray(replication.divergences) ? replication.divergences : [];
  const directions = object(replication.pairDirections);
  const missingDirections = DIRECTED_PAIRS.filter((pair) => directions[pair] !== true);
  const rejoin = object(evidence.rejoin);
  const damage = object(rejoin.damage);
  const damageLatency = finite(damage.maxLatencyMs);
  const guests = object(evidence.scenarios?.guests);
  const scoreboard = object(evidence.scoreboard);
  const consoleErrors = allConsoleErrors(evidence);

  const rows = [
    row(
      'MP-SOAK-DURATION',
      'scripted play lasts at least three minutes',
      evidence.completed === true && duration !== null && duration >= requiredDuration,
      { completed: evidence.completed === true, durationMs: duration, requiredDurationMs: requiredDuration },
    ),
    row(
      'MP-SOAK-REPLICATION',
      `all directed peer pairs replicate every one-second sample within ${positionBound} m`,
      samples.length >= expectedSamples && divergences.length === 0 && missingDirections.length === 0,
      { samples: samples.length, expectedSamples, divergences: divergences.length, missingDirections, positionBoundM: positionBound },
    ),
    row(
      'MP-SOAK-REJOIN-DAMAGE',
      `guest B leaves/rejoins and damage is observed by everyone within one ${rtt} ms RTT`,
      rejoin.role === 'guestB'
        && boolean(rejoin.leaveObserved)
        && boolean(rejoin.rejoinObserved)
        && boolean(rejoin.seenByEveryoneAfter)
        && boolean(damage.triggered)
        && damageLatency !== null
        && damageLatency <= rtt,
      {
        role: rejoin.role ?? null,
        leaveObserved: boolean(rejoin.leaveObserved),
        rejoinObserved: boolean(rejoin.rejoinObserved),
        seenByEveryoneAfter: boolean(rejoin.seenByEveryoneAfter),
        damageTriggered: boolean(damage.triggered),
        damageLatencyMs: damageLatency,
        rttMs: rtt,
      },
    ),
    row(
      'MP-SOAK-RELOAD-AFTER-DEATH',
      'both guests complete a reload after a death',
      PEERS.filter((peer) => peer !== 'host').every((peer) => guests[peer]?.reloadAfterDeath === true),
      { guestA: guests.guestA?.reloadAfterDeath === true, guestB: guests.guestB?.reloadAfterDeath === true },
    ),
    row(
      'MP-SOAK-RESPAWN-RESET',
      'respawn restores the authored loadout and usable ammo for both guests',
      PEERS.filter((peer) => peer !== 'host').every((peer) => guests[peer]?.respawnLoadoutReset === true),
      { guestA: guests.guestA?.respawnLoadoutReset === true, guestB: guests.guestB?.respawnLoadoutReset === true },
    ),
    row(
      'MP-SOAK-STAIR-FIRE',
      'both guests fire successfully while staged on a house stair',
      PEERS.filter((peer) => peer !== 'host').every((peer) => guests[peer]?.stairFire === true),
      { guestA: guests.guestA?.stairFire === true, guestB: guests.guestB?.stairFire === true },
    ),
    row(
      'MP-SOAK-CONSOLE-CLEAN',
      'the three peers emit no page or console errors',
      consoleErrors.length === 0,
      { total: consoleErrors.length, byPeer: Object.fromEntries(PEERS.map((peer) => [peer, errorsForPeer(evidence, peer)])) },
    ),
    row(
      'MP-SOAK-SCOREBOARD',
      'all three peers agree on the final scoreboard',
      scoreboard.agreement === true && PEERS.every((peer) => scoreboard[peer] !== undefined),
      { agreement: scoreboard.agreement === true, peersPresent: PEERS.filter((peer) => scoreboard[peer] !== undefined) },
    ),
  ];

  return Object.freeze({
    pass: rows.every((candidate) => candidate.pass),
    rows: Object.freeze(rows),
    thresholds: Object.freeze({
      playDurationMs: requiredDuration,
      sampleIntervalMs: requiredSampleInterval,
      positionBoundM: positionBound,
      rttMs: rtt,
    }),
  });
}

function errorsForPeer(bundle, peer) {
  const errors = object(bundle.consoleErrors);
  return Array.isArray(errors[peer]) ? errors[peer].length : 0;
}

export function formatMpSoakTable(rows) {
  const values = [
    ['ID', 'REQUIREMENT', 'RESULT', 'EVIDENCE'],
    ...rows.map((candidate) => [candidate.id, candidate.requirement, candidate.pass ? 'PASS' : 'FAIL', JSON.stringify(candidate.evidence)]),
  ];
  const widths = values[0].map((_, index) => Math.max(...values.map((line) => line[index].length)));
  return values.map((line) => `| ${line.map((value, index) => value.padEnd(widths[index])).join(' | ')} |`).join('\n');
}
