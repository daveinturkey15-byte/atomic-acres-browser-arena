import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fingerprintProfile, loadPlayerProfile } from './one-v-one/profile-contract.mjs';
import { runReplay } from './one-v-one/replay-evaluator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..');
const profilesRoot = resolve(here, 'profiles');
const sha256 = (content) => createHash('sha256').update(content).digest('hex');

async function verifyFile(entry) {
  const path = isAbsolute(entry.path) ? entry.path : resolve(repositoryRoot, entry.path);
  const content = await readFile(path);
  if (content.byteLength !== entry.bytes) throw new Error(`${entry.path}: byte mismatch ${content.byteLength} != ${entry.bytes}`);
  const observed = sha256(content);
  if (observed !== entry.sha256) throw new Error(`${entry.path}: SHA-256 mismatch ${observed} != ${entry.sha256}`);
  return path;
}

export async function verifyPlayerProfiles(indexPath = resolve(profilesRoot, 'index.json')) {
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  if (index.kind !== 'atomic-player-profile-registry' || index.schemaVersion !== 1) throw new Error('invalid player profile registry');
  for (const entry of [...index.profiles, ...index.implementation, ...index.launcherSurfaces]) await verifyFile(entry);

  const legacyEntry = index.profiles.find((entry) => entry.profileId === index.preservedCurrentProfileId);
  const candidateEntry = index.profiles.find((entry) => entry.profileId === index.candidateProfileId);
  if (!legacyEntry || !candidateEntry) throw new Error('registry profile selection is incomplete');
  const legacy = JSON.parse(await readFile(resolve(repositoryRoot, legacyEntry.path), 'utf8'));
  const candidate = await loadPlayerProfile(resolve(repositoryRoot, candidateEntry.path));
  if (fingerprintProfile(candidate) !== candidateEntry.configurationFingerprint) throw new Error('candidate configuration fingerprint mismatch');
  if (candidate.selected || candidate.promoted || candidate.activation.liveEnabled || candidate.activation.aimInputEnabled || candidate.activation.automaticFireEnabled) throw new Error('candidate profile is not default-off');
  if (candidate.detector.model.status === 'verified') throw new Error('candidate unexpectedly claims a verified detector before new-build data');

  for (const immutable of Object.values(legacy.immutableSnapshots)) {
    const path = immutable.path.startsWith('snapshots/') ? resolve(profilesRoot, immutable.path) : resolve(repositoryRoot, immutable.path);
    const content = await readFile(path);
    if (content.byteLength !== immutable.bytes || sha256(content) !== immutable.sha256) throw new Error(`legacy snapshot drift: ${immutable.path}`);
  }
  const commit = spawnSync('git', ['cat-file', '-e', `${legacy.source.savedHarnessCommit}^{commit}`], { cwd: repositoryRoot, encoding: 'utf8' });
  if (commit.status !== 0) throw new Error(`saved harness commit is missing: ${legacy.source.savedHarnessCommit}`);

  const fixture = JSON.parse(await readFile(resolve(repositoryRoot, index.replay.fixturePath), 'utf8'));
  const replay = runReplay(candidate, fixture);
  if (replay.replayFingerprint !== index.replay.expectedFingerprint) throw new Error('offline replay fingerprint mismatch');
  for (const [key, expected] of Object.entries(index.replay.expectedSummary)) {
    if (JSON.stringify(replay.summary[key]) !== JSON.stringify(expected)) throw new Error(`offline replay summary mismatch: ${key}`);
  }
  return {
    ok: true,
    preservedCurrentProfileId: index.preservedCurrentProfileId,
    candidateProfileId: index.candidateProfileId,
    candidateConfigurationFingerprint: candidateEntry.configurationFingerprint,
    verifiedProfiles: index.profiles.length,
    verifiedImplementationFiles: index.implementation.length,
    verifiedLauncherSurfaces: index.launcherSurfaces.length,
    replayFingerprint: replay.replayFingerprint,
    replaySummary: replay.summary,
  };
}

async function main() {
  process.stdout.write(`${JSON.stringify(await verifyPlayerProfiles(process.argv[2]), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
