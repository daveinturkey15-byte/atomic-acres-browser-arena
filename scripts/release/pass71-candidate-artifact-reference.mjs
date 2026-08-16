const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/u;

export const PASS71_WINDOWS_SUPPLEMENTAL_GROUPS = Object.freeze([
  'pass71-grenade-first-action',
  'pass70-chopper-gunner',
]);

export const PASS71_LINUX_SUPPLEMENTAL_GROUPS = Object.freeze([
  'pass71-glass-quality-bullet',
  'pass71-glass-quality-knife',
  'pass71-glass-quality-grenade',
  'pass71-glass-quality-flare',
  'pass71-glass-quality-crossbow',
  'pass71-glass-performance-bullet',
  'pass71-glass-performance-knife',
  'pass71-glass-performance-grenade',
  'pass71-glass-performance-flare',
  'pass71-glass-performance-crossbow',
  'pass71-nuke-warning',
]);

export function pass71CandidateAArtifactNames(sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 candidate artifact source must be a full lowercase SHA');
  return Object.freeze([
    ...PASS71_WINDOWS_SUPPLEMENTAL_GROUPS.map((group) => `pass71-windows-supplemental-${group}-${sourceSha}`),
    ...PASS71_LINUX_SUPPLEMENTAL_GROUPS.map((group) => `pass71-linux-supplemental-${group}-${sourceSha}`),
  ]);
}

export function parsePass71CandidateAArtifactReference(reference, sourceSha) {
  if (typeof reference !== 'string') throw new Error('Pass 71 candidate artifact reference must be text');
  const match = /^artifact:\/\/candidate-a\/([a-z0-9-]+)\/([A-Za-z0-9._/-]+)\?sha256=([0-9a-f]{64})&bytes=([1-9][0-9]*)$/u.exec(reference);
  if (!match) throw new Error('Pass 71 candidate artifact reference has an invalid canonical shape');
  const [, artifactName, path, expectedSha256, byteLengthText] = match;
  if (!SAFE_PATH.test(path) || path.startsWith('/') || path.endsWith('/') || path.includes('//')) {
    throw new Error('Pass 71 candidate artifact reference path is not canonical');
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Pass 71 candidate artifact reference path is unsafe');
  }
  if (!SHA256.test(expectedSha256)) throw new Error('Pass 71 candidate artifact reference SHA-256 is invalid');
  const byteLength = Number(byteLengthText);
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > 1024 * 1024 * 1024) {
    throw new Error('Pass 71 candidate artifact reference byte length is invalid');
  }
  if (!pass71CandidateAArtifactNames(sourceSha).includes(artifactName)) {
    throw new Error('Pass 71 candidate artifact reference is not an exact required candidate-A shard');
  }
  return Object.freeze({ artifactName, path, sha256: expectedSha256, byteLength });
}
