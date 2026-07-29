import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createOneVOneController } from './one-v-one-controller.mjs';
import { canonicalJson, loadPlayerProfile } from './profile-contract.mjs';

export function runReplay(profile, fixture) {
  const controller = createOneVOneController(profile, { offlineFixture: true });
  const receipts = fixture.frames.map((observation) => controller.step(observation));
  const states = {}; const semanticRejectReasons = {}; const aimPhases = {}; const fireGateReasons = {};
  let fireCandidateCount = 0; let fireAuthorizedCount = 0; let inputCommandsIssued = 0;
  let semanticAcceptedCount = 0; let semanticRejectedCount = 0; let reacquisitionCount = 0;
  const uncertainties = []; const absoluteAimErrors = []; const trackIds = new Set();
  for (const receipt of receipts) {
    states[receipt.track.state] = (states[receipt.track.state] ?? 0) + 1;
    aimPhases[receipt.aim.phase] = (aimPhases[receipt.aim.phase] ?? 0) + 1;
    fireGateReasons[receipt.fire.reason] = (fireGateReasons[receipt.fire.reason] ?? 0) + 1;
    fireCandidateCount += Number(receipt.fire.fireCandidate);
    fireAuthorizedCount += Number(receipt.fire.fireAuthorized);
    inputCommandsIssued += Number(receipt.inputIssued);
    semanticAcceptedCount += receipt.semantic.accepted.length;
    semanticRejectedCount += receipt.semantic.rejected.length;
    reacquisitionCount += Number(receipt.track.reacquired);
    if (receipt.track.trackId) trackIds.add(receipt.track.trackId);
    if (Number.isFinite(receipt.track.uncertainty)) uncertainties.push(receipt.track.uncertainty);
    if (Number.isFinite(receipt.aim.errorX) && Number.isFinite(receipt.aim.errorY)) absoluteAimErrors.push(Math.hypot(receipt.aim.errorX, receipt.aim.errorY));
    for (const rejected of receipt.semantic.rejected) semanticRejectReasons[rejected.reason] = (semanticRejectReasons[rejected.reason] ?? 0) + 1;
  }
  const serializableReceipts = receipts.map(({ telemetry, track, aim, fire, semantic }) => ({ telemetry, track, aim, fire, semantic: { provider: semantic.provider, accepted: semantic.accepted, rejected: semantic.rejected } }));
  const replayFingerprint = createHash('sha256').update(canonicalJson({ profileId: profile.profileId, fixtureId: fixture.replayId, receipts: serializableReceipts })).digest('hex');
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return { schemaVersion: 1, kind: 'atomic-one-v-one-offline-replay-result', profileId: profile.profileId, fixtureId: fixture.replayId, replayFingerprint, summary: { frames: receipts.length, states, aimPhases, fireGateReasons, semanticRejectReasons, semanticAcceptedCount, semanticRejectedCount, uniqueTrackCount: trackIds.size, reacquisitionCount, meanTrackUncertainty: mean(uncertainties), meanAbsoluteAimErrorPixels: mean(absoluteAimErrors), fireCandidateCount, fireAuthorizedCount, inputCommandsIssued }, receipts: serializableReceipts };
}

async function main() {
  const [profilePath, fixturePath] = process.argv.slice(2);
  if (!profilePath || !fixturePath) throw new Error('usage: node replay-evaluator.mjs <profile.json> <fixture.json>');
  const profile = await loadPlayerProfile(profilePath);
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  process.stdout.write(`${JSON.stringify(runReplay(profile, fixture), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
