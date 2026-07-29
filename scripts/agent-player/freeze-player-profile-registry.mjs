import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fingerprintProfile, loadPlayerProfile } from './one-v-one/profile-contract.mjs';
import { runReplay } from './one-v-one/replay-evaluator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..');
const profilesRoot = resolve(here, 'profiles');
const implementationPaths = [
  'package.json',
  'scripts/agent-player/atomic-player-driver.mjs',
  'scripts/agent-player/one-v-one/profile-contract.mjs',
  'scripts/agent-player/one-v-one/semantic-detector.mjs',
  'scripts/agent-player/one-v-one/single-target-tracker.mjs',
  'scripts/agent-player/one-v-one/visual-servo.mjs',
  'scripts/agent-player/one-v-one/fresh-frame-fire-gate.mjs',
  'scripts/agent-player/one-v-one/one-v-one-controller.mjs',
  'scripts/agent-player/one-v-one/replay-evaluator.mjs',
  'scripts/agent-player/freeze-player-profile-registry.mjs',
  'scripts/agent-player/verify-player-profiles.mjs',
  'scripts/agent-player/one-v-one-profile.test.mjs',
  'scripts/agent-player/one-v-one/fixtures/scaffold-replay-v1.json',
  'scripts/agent-player/profiles/datasets/one-v-one-operator-v1.manifest.json',
  'scripts/agent-player/profiles/README.md',
];
const launcherPaths = [
  '/root/.hermes/scripts/run_atomic_player_campaign.sh',
  '/root/.hermes/scripts/run_atomic_player_game.ps1',
];
const digest = (content) => createHash('sha256').update(content).digest('hex');

async function fileEntry(path, extra = {}) {
  const absolute = isAbsolute(path) ? path : resolve(repositoryRoot, path);
  const content = await readFile(absolute);
  return { path, sha256: digest(content), bytes: content.byteLength, ...extra };
}

export async function freezeRegistry({ expectedCandidateFingerprint, createdAt }) {
  if (!/^[a-f0-9]{64}$/.test(expectedCandidateFingerprint ?? '')) throw new Error('exact --candidate-fingerprint is required');
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) throw new Error('exact --created-at ISO timestamp is required');
  const legacyPath = 'scripts/agent-player/profiles/legacy-offensive-accuracy-v2.profile.json';
  const candidatePath = 'scripts/agent-player/profiles/one-v-one-semantic-v1.profile.json';
  const candidate = await loadPlayerProfile(resolve(repositoryRoot, candidatePath));
  const observedCandidateFingerprint = fingerprintProfile(candidate);
  if (observedCandidateFingerprint !== expectedCandidateFingerprint) throw new Error(`candidate fingerprint mismatch: ${observedCandidateFingerprint}`);
  const fixturePath = 'scripts/agent-player/one-v-one/fixtures/scaffold-replay-v1.json';
  const fixture = JSON.parse(await readFile(resolve(repositoryRoot, fixturePath), 'utf8'));
  const replay = runReplay(candidate, fixture);
  if (replay.summary.fireAuthorizedCount !== 0 || replay.summary.inputCommandsIssued !== 0) throw new Error('default-off replay emitted authority or input');
  const index = {
    schemaVersion: 1,
    kind: 'atomic-player-profile-registry',
    createdAt,
    preservedCurrentProfileId: 'legacy-offensive-accuracy-v2-frozen-20260729',
    candidateProfileId: 'one-v-one-semantic-v1-scaffold',
    selectionRule: 'The preserved current profile remains the rollback reference. The candidate is default-off, non-promoted and replay-only until explicit authorization plus hash-bound build, detector and calibration receipts.',
    profiles: [
      await fileEntry(legacyPath, { profileId: 'legacy-offensive-accuracy-v2-frozen-20260729', status: 'frozen-legacy-reference' }),
      await fileEntry(candidatePath, { profileId: 'one-v-one-semantic-v1-scaffold', status: 'scaffold-default-off', configurationFingerprint: observedCandidateFingerprint }),
    ],
    implementation: await Promise.all(implementationPaths.map((path) => fileEntry(path))),
    launcherSurfaces: await Promise.all(launcherPaths.map((path) => fileEntry(path))),
    replay: { fixturePath, expectedFingerprint: replay.replayFingerprint, expectedSummary: replay.summary },
  };
  const indexPath = resolve(profilesRoot, 'index.json');
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return { indexPath, indexSha256: digest(await readFile(indexPath)), candidateConfigurationFingerprint: observedCandidateFingerprint, replayFingerprint: replay.replayFingerprint, replaySummary: replay.summary };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((value, index, values) => value.startsWith('--') ? [value.slice(2), values[index + 1]] : null).filter(Boolean));
  process.stdout.write(`${JSON.stringify(await freezeRegistry({ expectedCandidateFingerprint: args['candidate-fingerprint'], createdAt: args['created-at'] }), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
