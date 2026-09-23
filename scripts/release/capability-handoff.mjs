import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const SHA256 = /^[a-f0-9]{64}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const fail = (message) => { throw new Error(`Capability handoff refused: ${message}`); };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Live local verification only: no cached or caller-authored GREEN receipts are accepted. */
export function verifyCapabilityHandoff({ candidateRoot, headSha, policy, config }) {
  if (!SHA40.test(headSha ?? '')) fail('full candidate HEAD required');
  if (!Array.isArray(policy?.requiredIds) || !policy.requiredIds.length
      || new Set(policy.requiredIds).size !== policy.requiredIds.length
      || policy.requiredIds.some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
      || !SHA256.test(policy.checkerSha256 ?? '')) fail('reviewed project capability policy missing or malformed');
  const root = realpathSync(candidateRoot);
  const pins = new Map();
  const readPinned = (path, expected) => {
    const bytes = readFileSync(path);
    const hash = digest(bytes);
    if (expected !== undefined && (!SHA256.test(expected) || hash !== expected)) fail(`hash mismatch: ${path}`);
    if (pins.has(path) && pins.get(path) !== hash) fail(`changed during verification: ${path}`);
    pins.set(path, hash);
    return { bytes, hash };
  };
  const localPath = (key) => {
    if (typeof config?.[key] !== 'string' || !isAbsolute(config[key])) fail(`machine-local absolute ${key} required`);
    return realpathSync(config[key]);
  };
  const executable = localPath('executable');
  const checker = localPath('checker');
  const recordsRoot = localPath('recordsRoot');
  const evidenceRoot = localPath('evidenceRoot');
  const skillRoot = localPath('skillRoot');
  const akpRoot = localPath('akpRoot');
  const contained = (base, path) => {
    if (typeof path !== 'string' || !path) fail('proof path required');
    const actual = realpathSync(resolve(base, path));
    const rel = relative(base, actual);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`proof escapes configured root: ${path}`);
    return actual;
  };
  const git = (...args) => {
    const result = spawnSync('git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) fail('cannot inspect candidate Git state');
    return result.stdout.trim();
  };
  const assertCandidate = () => {
    if (git('rev-parse', 'HEAD') !== headSha) fail('candidate HEAD changed');
    if (git('status', '--porcelain=v1')) fail('candidate is dirty');
  };
  assertCandidate();
  readPinned(checker, policy.checkerSha256);
  const records = [];
  for (const id of policy.requiredIds) {
    const recordPath = contained(recordsRoot, `${id}.json`);
    const recordFile = readPinned(recordPath);
    const record = JSON.parse(recordFile.bytes.toString('utf8'));
    if (record.id !== id || record.state !== 'adopted') fail(`${id} must be an adopted record`);
    const result = spawnSync(executable, [checker, 'check', recordPath, '--root', root, '--revision', headSha,
      '--evidence-root', evidenceRoot, '--skill-root', skillRoot, '--akp-root', akpRoot], {
      cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 120000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' },
    });
    const output = result.stdout ?? '';
    const green = output.split(/\r?\n/).find((line) => line.startsWith('CAPABILITY_RECORD_GREEN records=1 red=0 '));
    if (result.status !== 0 || !green || !green.split(/\s+/).includes('adopted=1')
        || !green.split(/\s+/).includes(`head=${headSha}`) || /^RED /m.test(output)) {
      fail(`${id}: live checker did not certify this HEAD (exit ${result.status}): ${(result.stderr || output).trim()}`);
    }
    const evidence = [];
    const seen = new Set();
    for (const blockName of ['experiment', 'regression', 'second_use']) {
      const block = record[blockName];
      const wrapperPath = contained(evidenceRoot, block?.evidence_path);
      const wrapperFile = readPinned(wrapperPath, block.evidence_sha256);
      if (seen.has(wrapperPath)) continue;
      seen.add(wrapperPath);
      const wrapper = JSON.parse(wrapperFile.bytes.toString('utf8'));
      if (wrapper.revision !== headSha || wrapper.result !== 'pass'
          || !Array.isArray(wrapper.raw_evidence) || !wrapper.raw_evidence.length) fail(`${id}: current passing raw evidence required`);
      const raw = wrapper.raw_evidence.map((proof) => {
        if (proof.revision !== headSha) fail(`${id}: stale raw evidence revision`);
        if (!SHA256.test(proof.sha256 ?? '')) fail(`${id}: raw evidence hash missing or malformed`);
        const path = contained(evidenceRoot, proof.path);
        const file = readPinned(path, proof.sha256);
        if (!file.bytes.toString('utf8').includes(headSha)) fail(`${id}: raw evidence does not bind HEAD`);
        return { path, sha256: file.hash, revision: headSha };
      });
      evidence.push({ path: wrapperPath, sha256: wrapperFile.hash, raw });
    }
    records.push({ id, recordPath, recordSha256: recordFile.hash,
      sourcePin: record.source?.pin,
      sourceProofs: Object.fromEntries(['generator', 'consumer', 'second_use'].map((key) => [key,
        { path: key === 'second_use' ? record[key]?.consumer_path : record[key]?.path, sha256: record[key]?.sha256 }])), evidence });
  }
  for (const [path, hash] of pins) readPinned(path, hash);
  assertCandidate();
  return { schemaVersion: 1, headSha, checkerSha256: policy.checkerSha256, records, grantsAcceptance: false };
}
