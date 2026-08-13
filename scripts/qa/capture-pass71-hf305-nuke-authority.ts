import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  NUKE_WARNING_AUDIO_PROFILE,
  nukeWarningAudioCueProfile,
} from '../../src/audio';
import {
  NUKE_DAMAGE,
  NUKE_WARNING_MS,
  nukeDamageForTarget,
} from '../../src/field-support';
import { sampleNukeWarningPresentation } from '../../src/nuke-warning-presentation';

function argument(name: string): string {
  const prefixed = `--${name}=`;
  const inline = process.argv.find((entry) => entry.startsWith(prefixed));
  if (inline) return inline.slice(prefixed.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? '' : '';
}

function failUnless(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`HF-305 mechanical capture failed: ${message}`);
}

const output = resolve(argument('output'));
const sourceSha = process.env.PASS71_HF305_SOURCE_SHA ?? '';
const sourceTreeSha = process.env.PASS71_HF305_SOURCE_TREE_SHA ?? '';
failUnless(output.length > 0, '--output is required');
failUnless(/^[a-f0-9]{40}$/u.test(sourceSha), 'PASS71_HF305_SOURCE_SHA must be exact candidate A');
failUnless(/^[a-f0-9]{40}$/u.test(sourceTreeSha), 'PASS71_HF305_SOURCE_TREE_SHA must be exact candidate A tree');
failUnless(NUKE_WARNING_MS === 5_000, 'warning duration authority drifted');
failUnless(NUKE_DAMAGE === 1_000, 'Nuke damage authority drifted');

const elapsedSamples = [0, 1_250, 2_500, 3_750, 5_000];
const standardSamples = elapsedSamples.map((elapsedMs) => ({
  elapsedMs,
  ...sampleNukeWarningPresentation(elapsedMs, NUKE_WARNING_MS, false),
}));
const reducedSamples = elapsedSamples.map((elapsedMs) => ({
  elapsedMs,
  ...sampleNukeWarningPresentation(elapsedMs, NUKE_WARNING_MS, true),
}));
for (let index = 1; index < standardSamples.length; index += 1) {
  const before = standardSamples[index - 1]!;
  const after = standardSamples[index]!;
  failUnless(after.charge > before.charge, 'charge must increase monotonically');
  failUnless(after.scale > before.scale, 'beacon scale must increase monotonically');
  failUnless(after.rotationY > before.rotationY, 'beacon rotation must increase monotonically');
  failUnless(after.coreOpacity > before.coreOpacity, 'core opacity must increase monotonically');
  failUnless(after.ringOpacity > before.ringOpacity, 'ring opacity must increase monotonically');
  failUnless(after.fogBlend > before.fogBlend, 'fog blend must increase monotonically');
}
for (let index = 0; index < standardSamples.length; index += 1) {
  const standard = standardSamples[index]!;
  const reduced = reducedSamples[index]!;
  failUnless(reduced.charge === standard.charge, 'reduced sensory must not change timing');
  failUnless(reduced.scale <= standard.scale, 'reduced sensory must cap scale');
  failUnless(reduced.rotationY <= standard.rotationY, 'reduced sensory must cap rotation');
  failUnless(reduced.coreOpacity < standard.coreOpacity, 'reduced sensory must cap core opacity');
  failUnless(reduced.ringOpacity < standard.ringOpacity, 'reduced sensory must cap ring opacity');
  failUnless(reduced.skyFlash <= standard.skyFlash, 'reduced sensory must cap sky flash');
}

function audioSummary(reducedSensory: boolean) {
  const profile = nukeWarningAudioCueProfile(reducedSensory);
  return {
    gainScale: profile.gainScale,
    maximumLayerGain: Math.max(
      ...profile.pressurePulses.map(({ volume }) => volume),
      ...profile.alarmPulses.map(({ volume }) => volume),
      profile.pressureBed.volume,
    ),
    scheduledVoices: profile.pressurePulses.length + profile.alarmPulses.length + 1,
    broadbandNoiseLayers: NUKE_WARNING_AUDIO_PROFILE.broadbandNoiseLayers,
    durationSeconds: NUKE_WARNING_AUDIO_PROFILE.durationSeconds,
  };
}

const authorityCases = [
  { ownerTeam: 0 as const, targetTeam: 1 as const, alive: true },
  { ownerTeam: 0 as const, targetTeam: 0 as const, alive: true },
  { ownerTeam: 0 as const, targetTeam: 1 as const, alive: false },
].map((entry) => ({ ...entry, damage: nukeDamageForTarget(entry.ownerTeam, entry.targetTeam, entry.alive) }));
failUnless(JSON.stringify(authorityCases.map(({ damage }) => damage)) === JSON.stringify([1_000, 0, 0]), 'hostile-only authority changed');

const receipt = {
  schemaVersion: 1,
  contract: 'atomic-acres/pass71-hf305-nuke-mechanical@1',
  status: 'PASS',
  sourceSha,
  sourceTreeSha,
  warningDurationMs: NUKE_WARNING_MS,
  nukeDamage: NUKE_DAMAGE,
  authorityCases,
  standardSamples,
  reducedSamples,
  audio: {
    standard: audioSummary(false),
    reduced: audioSummary(true),
  },
  faults: [],
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: receipt.status, output, warningDurationMs: receipt.warningDurationMs })}\n`);
