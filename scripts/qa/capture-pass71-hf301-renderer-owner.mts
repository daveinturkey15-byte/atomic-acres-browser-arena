import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  detectLivePresentationStall,
  shouldResetPresentationAfterSchedulerGap,
} from '../../src/rendering/render-runtime';
import {
  PASS71_HF301_TOOL_PATHS,
  pass71Hf301OwnerSourceFailures,
} from './pass71-hf301-renderer-progress-evidence-contract.mjs';
import { readFileSync } from 'node:fs';

function outputPath(argv: readonly string[]): string {
  const index = argv.indexOf('--output');
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || index + 2 !== argv.length) {
    throw new Error('HF-301 owner replay requires exactly --output <path>');
  }
  return resolve(value);
}

const input = Object.freeze({
  activeMatch: true,
  menuHidden: true,
  documentVisible: true,
  documentFocused: true,
  arenaSelectionReady: true,
  debugRenderPaused: false,
  renderSubmissionPaused: false,
  backpressureActive: true,
  currentSubmissionGapMs: 1_146,
  pendingForMs: 1_146,
  stallThresholdMs: 1_000,
  submissionSequence: 2,
  completedSequence: 0,
});
const detected = detectLivePresentationStall(input);
const missingSubmissionDetected = detectLivePresentationStall({
  ...input,
  backpressureActive: false,
  pendingForMs: 0,
});
const hiddenOwnershipExcluded = detectLivePresentationStall({
  ...input,
  documentVisible: false,
}) === null;
const sourceAuditFailures = pass71Hf301OwnerSourceFailures({
  legacyMain: readFileSync(resolve(PASS71_HF301_TOOL_PATHS.frameOwner), 'utf8'),
  renderRuntime: readFileSync(resolve(PASS71_HF301_TOOL_PATHS.rendererOwner), 'utf8'),
});
const exactFailure = detected
  ? `Renderer presentation made no GPU progress for ${Math.round(detected.elapsedMs)}ms`
    + ` (${input.submissionSequence - input.completedSequence} submission pending)`
  : null;
const receipt = {
  schemaVersion: 1,
  contract: 'atomic-acres/pass71-hf301-renderer-owner-replay@1',
  input,
  detected,
  exactFailure,
  missingSubmissionDetected,
  hiddenOwnershipExcluded,
  schedulerGapDetectedAtThreshold: shouldResetPresentationAfterSchedulerGap(1_000, 1_000),
  sourceAuditFailures,
};
if (JSON.stringify(detected) !== JSON.stringify({ kind: 'pending-completion', elapsedMs: 1_146 })
  || exactFailure !== 'Renderer presentation made no GPU progress for 1146ms (2 submission pending)'
  || JSON.stringify(missingSubmissionDetected) !== JSON.stringify({ kind: 'missing-submission', elapsedMs: 1_146 })
  || !hiddenOwnershipExcluded || !receipt.schedulerGapDetectedAtThreshold || sourceAuditFailures.length > 0) {
  throw new Error(`HF-301 real-owner replay failed: ${JSON.stringify(receipt)}`);
}
writeFileSync(outputPath(process.argv.slice(2)), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
