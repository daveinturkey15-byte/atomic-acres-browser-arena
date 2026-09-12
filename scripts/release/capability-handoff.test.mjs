import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { verifyCapabilityHandoff } from './capability-handoff.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../../artifacts/pipeline/capability-handoff-fixtures');
mkdirSync(fixtures, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (path, value) => writeFileSync(path, JSON.stringify(value));
function fixture(behavior = 'green') {
  const base = mkdtempSync(join(fixtures, 'case-'));
  const root = join(base, 'repo');
  const config = { executable: process.execPath, checker: join(base, 'checker.mjs') };
  mkdirSync(root);
  for (const key of ['recordsRoot', 'evidenceRoot', 'skillRoot', 'akpRoot']) {
    config[key] = join(base, key); mkdirSync(config[key]);
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '-q'); writeFileSync(join(root, 'source.txt'), 'source'); git('add', 'source.txt');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture');
  const headSha = git('rev-parse', 'HEAD');
  // A pinned synthetic executable tests the process boundary, not AKP checker internals.
  const stub = `const head=process.argv[process.argv.indexOf('--revision')+1];\n`
    + (behavior === 'red' ? `console.log('RED fixture'); process.exit(1);`
      : behavior === 'forged-green' ? `console.log('CAPABILITY_RECORD_GREEN records=1 red=0 adopted=1 head='+head); process.exit(1);`
      : behavior === 'no-green' ? `console.log('receipt says success');`
      : behavior === 'wrong-head' ? `console.log('CAPABILITY_RECORD_GREEN records=1 red=0 adopted=1 head='+'0'.repeat(40));`
      : behavior === 'research' ? `console.log('CAPABILITY_RECORD_GREEN records=1 red=0 adopted=1 head='+head); process.exit(3);`
      : `console.log('CAPABILITY_RECORD_GREEN records=1 red=0 adopted=1 head='+head);`);
  writeFileSync(config.checker, stub);
  const policy = { requiredIds: ['test-capability'], checkerSha256: hash(stub) };
  const rawPath = join(config.evidenceRoot, 'raw.json');
  write(rawPath, { revision: headSha, result: 'pass' });
  const wrapperPath = join(config.evidenceRoot, 'wrapper.json');
  const wrapper = { revision: headSha, result: 'pass', raw_evidence: [{ path: rawPath,
    revision: headSha, sha256: hash(readFileSync(rawPath)) }] };
  write(wrapperPath, wrapper);
  const block = { evidence_path: 'wrapper.json', evidence_sha256: hash(readFileSync(wrapperPath)),
    path: 'source.txt', sha256: hash('source') };
  const record = { id: 'test-capability', state: 'adopted', source: { pin: headSha },
    experiment: { ...block }, generator: { ...block }, consumer: { ...block },
    regression: { ...block }, second_use: { ...block } };
  const recordPath = join(config.recordsRoot, 'test-capability.json'); write(recordPath, record);
  const rebind = () => { write(wrapperPath, wrapper); for (const key of ['experiment', 'regression', 'second_use'])
    record[key].evidence_sha256 = hash(readFileSync(wrapperPath)); write(recordPath, record); };
  return { config, policy, headSha, candidateRoot: root, rawPath, wrapper, wrapperPath, record, recordPath, rebind };
}

test('live happy path binds candidate, record, source and raw proof hashes without granting acceptance', () => {
  const f = fixture(); const proof = verifyCapabilityHandoff(f);
  assert.equal(proof.headSha, f.headSha); assert.equal(proof.grantsAcceptance, false);
  assert.equal(proof.records[0].recordSha256, hash(readFileSync(f.recordPath)));
  assert.equal(proof.records[0].sourceProofs.consumer.sha256, hash('source'));
  assert.equal(proof.records[0].evidence[0].raw[0].sha256, hash(readFileSync(f.rawPath)));
});
for (const behavior of ['red', 'forged-green', 'no-green', 'wrong-head', 'research']) {
  test(`rejects actual checker ${behavior}`, () => assert.throws(() => verifyCapabilityHandoff(fixture(behavior)), /live checker/));
}
test('missing record fails', () => { const f = fixture(); unlinkSync(f.recordPath); assert.throws(() => verifyCapabilityHandoff(f)); });
test('missing machine binding fails even with caller GREEN receipt', () => {
  const f = fixture(); f.config = { receipt: { status: 'GREEN', head: f.headSha } };
  assert.throws(() => verifyCapabilityHandoff(f), /machine-local/);
});
test('changed checker cannot forge a green receipt', () => {
  const f = fixture(); writeFileSync(f.config.checker, "console.log('GREEN')");
  assert.throws(() => verifyCapabilityHandoff(f), /hash mismatch/);
});
test('non-adopted capability fails', () => {
  const f = fixture(); f.record.state = 'connected'; write(f.recordPath, f.record);
  assert.throws(() => verifyCapabilityHandoff(f), /adopted/);
});
test('stale wrapper fails even if live stub says GREEN and wrapper is rehashed', () => {
  const f = fixture(); f.wrapper.revision = '0'.repeat(40); f.rebind();
  assert.throws(() => verifyCapabilityHandoff(f), /current passing raw/);
});
test('stale raw revision fails after wrapper rehash', () => {
  const f = fixture(); f.wrapper.raw_evidence[0].revision = '0'.repeat(40); f.rebind();
  assert.throws(() => verifyCapabilityHandoff(f), /stale raw/);
});
test('missing raw hash fails even if a trusted stub reports GREEN', () => {
  const f = fixture(); delete f.wrapper.raw_evidence[0].sha256; f.rebind();
  assert.throws(() => verifyCapabilityHandoff(f), /raw evidence hash missing/);
});

test('missing raw file fails', () => { const f = fixture(); unlinkSync(f.rawPath); assert.throws(() => verifyCapabilityHandoff(f)); });
test('changed raw bytes fail despite wrapper GREEN', () => {
  const f = fixture(); write(f.rawPath, { revision: f.headSha, forged: true });
  assert.throws(() => verifyCapabilityHandoff(f), /hash mismatch/);
});
test('rehashing an old raw file cannot establish current HEAD', () => {
  const f = fixture(); write(f.rawPath, { revision: '0'.repeat(40) });
  f.wrapper.raw_evidence[0].sha256 = hash(readFileSync(f.rawPath)); f.rebind();
  assert.throws(() => verifyCapabilityHandoff(f), /raw evidence does not bind HEAD/);
});
test('raw proof cannot escape machine evidence root', () => {
  const f = fixture(); f.wrapper.raw_evidence[0].path = f.recordPath; f.rebind();
  assert.throws(() => verifyCapabilityHandoff(f), /escapes/);
});
test('dirty or different candidate HEAD fails', () => {
  const f = fixture(); assert.throws(() => verifyCapabilityHandoff({ ...f, headSha: '0'.repeat(40) }), /HEAD changed/);
  writeFileSync(join(f.candidateRoot, 'source.txt'), 'dirty'); assert.throws(() => verifyCapabilityHandoff(f), /dirty/);
});
test('native handoff is wired before receipt creation; contribute and CI release remain independent', () => {
  const guard = readFileSync(join(here, 'pipeline-guard.mjs'), 'utf8');
  assert.match(guard, /if \(mode === 'handoff'\) \{[\s\S]*receipt\.capabilityHandoff = verifyCapabilityHandoff/);
  assert.ok(guard.indexOf('receipt.capabilityHandoff = verifyCapabilityHandoff') < guard.indexOf('const receiptPath = writeReceipt'));
  assert.match(guard, /if \(mode === 'contribute' \|\| mode === 'handoff'\)/);
  const pkg = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf8'));
  assert.equal(pkg.scripts['pipeline:handoff'], 'node scripts/release/pipeline-guard.mjs handoff');
  assert.ok(pkg.scripts['pipeline:preflight'].endsWith('pipeline-guard.mjs contribute'));
});

for (const mode of ['contribute', 'handoff', 'release', 'lane-close']) {
  test(`${mode} cannot use offline`, () => {
    const f = fixture();
    assert.throws(() => execFileSync(process.execPath, [join(here, 'pipeline-guard.mjs'), mode, '--offline'],
      { cwd: f.candidateRoot, encoding: 'utf8', windowsHide: true, stdio: 'pipe' }), /doctor-only/);
  });
}
test('offline doctor retains real shallow ancestry and never claims authenticated or tested tools', () => {
  const f = fixture();
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/daveinturkey15-byte/atomic-acres-browser-arena.git'],
    { cwd: f.candidateRoot, windowsHide: true });
  writeFileSync(join(f.candidateRoot, '.git', 'shallow'), f.headSha + '\n');
  const report = JSON.parse(execFileSync(process.execPath, [join(here, 'pipeline-guard.mjs'), 'doctor', '--offline'],
    { cwd: f.candidateRoot, encoding: 'utf8', windowsHide: true }));
  assert.equal(report.ok, true); assert.equal(report.shallow, true); assert.equal(report.rootCommitCount, null);
  assert.equal(report.githubAuth.authenticated, false); assert.equal(report.githubAuth.status, 'skipped-offline');
  assert.equal(report.tools.status, 'skipped-offline'); assert.match(report.ancestryUnavailable, /Shallow boundaries/);
});
