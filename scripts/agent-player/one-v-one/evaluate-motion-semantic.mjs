#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRenderedMotionSemanticGate } from './rendered-motion-semantic.mjs';

const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const distance = (left, right) => Math.hypot(left.target.x - right.target.x, left.target.y - right.target.y);
const ratio = (left, right) => Math.max(left / right, right / left);

function splitGroups(actions, maximumGap = 8) {
  const groups = [];
  for (const action of actions) {
    if (groups.length === 0 || action.sourceSequence - groups.at(-1).at(-1).sourceSequence > maximumGap) groups.push([]);
    groups.at(-1).push(action);
  }
  return groups;
}

function bodyShaped(action) {
  const bounds = action.target.bounds;
  return bounds.height >= 5 && bounds.width / bounds.height <= 1.2;
}

function motionEligible(group) {
  if (group.length < 3 || group.some((action) => !bodyShaped(action))) return false;
  for (let index = 1; index < group.length; index += 1) {
    const previous = group[index - 1].target;
    const current = group[index].target;
    if (distance(group[index - 1], group[index]) > 18) return false;
    if (ratio(previous.pixels, current.pixels) > 4) return false;
    if (ratio(previous.bounds.width / previous.bounds.height, current.bounds.width / current.bounds.height) > 2.5) return false;
  }
  return Math.max(...group.map((action) => distance(group[0], action))) >= 2;
}

function evaluateFixture(fixture) {
  return fixture.sequences.map((sequence) => {
    const gate = createRenderedMotionSemanticGate();
    const receipts = sequence.frames.map((entry) => gate.update(
      entry.targets,
      { sequence: entry.sequence },
      { cameraMoved: entry.cameraMoved, movementMoved: entry.movementMoved },
    ));
    const acceptedFrames = receipts.filter((receipt) => receipt.detections.length > 0).length;
    const passed = sequence.expectedAcceptedFrames !== undefined
      ? acceptedFrames === sequence.expectedAcceptedFrames
      : acceptedFrames >= sequence.minimumAcceptedFrames;
    return {
      sequenceId: sequence.id,
      acceptedFrames,
      expectedAcceptedFrames: sequence.expectedAcceptedFrames ?? null,
      minimumAcceptedFrames: sequence.minimumAcceptedFrames ?? null,
      reasons: receipts.map((receipt) => receipt.receipt.reason),
      passed,
    };
  });
}

export async function evaluateMotionSemantic({ archiveRoot, manifestPath, fixturePath }) {
  const manifestContent = await readFile(manifestPath);
  const fixtureContent = await readFile(fixturePath);
  const manifest = JSON.parse(manifestContent);
  const fixture = JSON.parse(fixtureContent);
  const gameDirectory = resolve(archiveRoot, 'games/G0134');
  const telemetryPath = resolve(gameDirectory, 'telemetry.json');
  const shadowPath = resolve(gameDirectory, 'one-v-one-shadow-telemetry.json');
  const telemetryContent = await readFile(telemetryPath);
  const shadowContent = await readFile(shadowPath);
  const telemetry = JSON.parse(telemetryContent);
  const shadow = JSON.parse(shadowContent);
  const captures = telemetry.actions.filter((action) => action.kind === 'rendered-candidate-capture');
  const captureBySequence = new Map(captures.map((action) => [action.sourceSequence, action]));
  const labelsBySequence = new Map(manifest.examples
    .filter((example) => example.gameId === 'G0134')
    .map((example) => [example.sourceSequence, example.label]));
  const finalLabelledSequence = Math.max(...captures.map((action) => action.sourceSequence));
  const gate = createRenderedMotionSemanticGate();
  const accepted = [];
  for (const frame of shadow.frames) {
    if (frame.frameSequence > finalLabelledSequence) break;
    const capture = captureBySequence.get(frame.frameSequence);
    const result = gate.update(
      capture?.candidates ?? [],
      { sequence: frame.frameSequence },
      capture?.observerMotion ?? { cameraMoved: false, movementMoved: false },
    );
    if (result.detections.length > 0) accepted.push({
      frameSequence: frame.frameSequence,
      label: labelsBySequence.get(frame.frameSequence) ?? null,
      receipt: result.receipt,
    });
  }
  const positiveActions = captures.filter((action) => labelsBySequence.get(action.sourceSequence) === 'visible-live-bot');
  const eligibleGroups = splitGroups(positiveActions).filter(motionEligible);
  const acceptedSequences = eligibleGroups.filter((group) => group.some((action) => accepted.some((receipt) => receipt.frameSequence === action.sourceSequence)));
  const fixtureResults = evaluateFixture(fixture);
  const summary = {
    labelledCandidateFrames: captures.length,
    visibleBotLabelledFrames: positiveActions.length,
    acceptedFrames: accepted.length,
    acceptedVisibleBotFrames: accepted.filter((receipt) => receipt.label === 'visible-live-bot').length,
    acceptedHardNegativeFrames: accepted.filter((receipt) => receipt.label === 'hard-negative').length,
    acceptedAmbiguousFrames: accepted.filter((receipt) => receipt.label === 'ambiguous-reject').length,
    eligibleVisibleBotSequences: eligibleGroups.length,
    acceptedVisibleBotSequences: acceptedSequences.length,
    visibleBotSequenceAcceptanceRate: eligibleGroups.length > 0 ? acceptedSequences.length / eligibleGroups.length : 0,
    fixturePasses: fixtureResults.filter((result) => result.passed).length,
    fixtureCount: fixtureResults.length,
  };
  const acceptance = {
    allKnownHardNegativeFramesRejected: summary.acceptedHardNegativeFrames === 0,
    allAmbiguousFramesRejected: summary.acceptedAmbiguousFrames === 0,
    visibleBotSequenceAcceptanceAtLeast80Percent: summary.visibleBotSequenceAcceptanceRate >= 0.8,
    eligibleVisibleBotSequencesAtLeast3: summary.eligibleVisibleBotSequences >= 3,
    allSyntheticRegressionSequencesPass: fixtureResults.every((result) => result.passed),
    datasetAcceptancePassed: Object.values(manifest.acceptance).every(Boolean),
    noLiveInputAuthority: manifest.fairnessBoundary.hiddenStateUsedLive === false && manifest.fairnessBoundary.motionAloneMayAuthorizeFire === false,
  };
  return {
    schemaVersion: 1,
    kind: 'atomic-player-rendered-motion-semantic-evaluation',
    evaluatorId: 'rendered-motion-semantic-v1-g0134-held-sequence',
    sources: {
      manifest: { path: manifestPath, sha256: sha256(manifestContent) },
      fixture: { path: fixturePath, sha256: sha256(fixtureContent) },
      telemetry: { path: telemetryPath, sha256: sha256(telemetryContent) },
      shadowTelemetry: { path: shadowPath, sha256: sha256(shadowContent) },
    },
    frozenThresholds: {
      requiredStationaryFrames: 3,
      minimumIndependentMotionPixels: 2,
      maximumAssociationDistancePixels: 18,
      minimumAssociationMarginPixels: 3,
      maximumSizeRatio: 4,
      maximumCandidateAspect: 1.2,
      minimumCandidateHeight: 5,
      maximumAspectRatioChange: 2.5,
      maximumObservationSequenceGap: 12,
      maximumFreshMotionSequenceGap: 12,
    },
    summary,
    acceptance,
    fixtureResults,
    acceptedFrameReceipts: accepted,
    passed: Object.values(acceptance).every(Boolean),
  };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((value, index, values) => value.startsWith('--') ? [value.slice(2), values[index + 1]] : null).filter(Boolean));
  if (!args.archive || !args.manifest || !args.fixture || !args.output) throw new Error('--archive, --manifest, --fixture and --output are required');
  const receipt = await evaluateMotionSemantic({
    archiveRoot: resolve(args.archive),
    manifestPath: resolve(args.manifest),
    fixturePath: resolve(args.fixture),
  });
  await writeFile(resolve(args.output), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: resolve(args.output), summary: receipt.summary, acceptance: receipt.acceptance, passed: receipt.passed }, null, 2)}\n`);
  if (!receipt.passed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
