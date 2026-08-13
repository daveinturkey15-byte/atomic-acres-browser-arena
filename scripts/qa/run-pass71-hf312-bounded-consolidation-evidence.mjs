import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  PASS71_HF312_BASE_SOURCE_SHA,
  PASS71_HF312_BOUNDED_CONSOLIDATION_EVIDENCE,
  PASS71_HF312_GATE_COMMANDS,
  pass71Hf312EvidenceFailures,
  pass71Hf312RecordSha256,
  pass71Hf312SourceAuditAtSource,
  pass71Hf312ToolingAtSource,
} from './pass71-hf312-bounded-consolidation-evidence-contract.mjs';

const root = resolve(process.cwd());
const SHA40 = /^[a-f0-9]{40}$/u;

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
}

function clean() {
  return git('status', '--porcelain', '--untracked-files=all') === '';
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root, env: process.env, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) throw result.error;
  if (result.signal || (result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.signal}): ${output.slice(-8_000)}`);
  }
  return output;
}

function npmCli() {
  const inherited = process.env.npm_execpath;
  if (inherited && existsSync(inherited)) return inherited;
  const candidate = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!existsSync(candidate)) throw new Error('HF-312 could not locate npm-cli.js');
  return candidate;
}

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--expected-source-sha' || !SHA40.test(args[1] ?? '')) {
  throw new Error('Usage: node scripts/qa/run-pass71-hf312-bounded-consolidation-evidence.mjs --expected-source-sha <candidate-A-SHA>');
}
const expectedSourceSha = args[1];
const checkoutSourceSha = git('rev-parse', 'HEAD');
if (checkoutSourceSha !== expectedSourceSha || !clean()) {
  throw new Error('HF-312 requires one completely clean exact candidate A');
}
git('merge-base', '--is-ancestor', PASS71_HF312_BASE_SOURCE_SHA, expectedSourceSha);
const startedAt = new Date().toISOString();
const npm = npmCli();
const coreOutput = run(process.execPath, [npm, 'run', 'verify:pass25a:core']);
const preflightOutput = run(process.execPath, [npm, 'run', 'pipeline:preflight', '--', '--machine', 'dave-gaming-pc', '--harness', 'codex']);
const diffOutput = run('git', ['diff', '--check']);
const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
if (endingCheckoutSourceSha !== expectedSourceSha || !clean()) {
  throw new Error('HF-312 candidate A changed or became dirty during full validation');
}
const sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`);
const sourceAudit = pass71Hf312SourceAuditAtSource(root, expectedSourceSha);
const tooling = pass71Hf312ToolingAtSource(root, expectedSourceSha);
const completedAt = new Date().toISOString();
const record = {
  ...PASS71_HF312_BOUNDED_CONSOLIDATION_EVIDENCE,
  startedAt,
  completedAt,
  source: {
    expectedSourceSha, checkoutSourceSha, endingCheckoutSourceSha, sourceTreeSha,
    baseSourceSha: PASS71_HF312_BASE_SOURCE_SHA, cleanBefore: true, cleanAfter: true,
  },
  sourceAudit,
  tooling,
  gates: [coreOutput, preflightOutput, diffOutput].map((output, index) => ({
    ...PASS71_HF312_GATE_COMMANDS[index], status: 'passed', completedAt, outputSha256: hash(output),
  })),
  faults: [],
};
record.receiptSha256 = pass71Hf312RecordSha256(record);
const failures = pass71Hf312EvidenceFailures(record, { sourceSha: expectedSourceSha, sourceTreeSha, sourceAudit, tooling });
if (failures.length) throw new Error(`HF-312 receipt rejected: ${failures.join(', ')}`);
const outputPath = resolve(root, 'artifacts/pass71/hf312-bounded-consolidation/native-evidence.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
writeFileSync(`${outputPath}.sha256`, `${hash(readFileSync(outputPath))}  native-evidence.json\n`, 'utf8');
console.log(JSON.stringify({ ok: true, outputPath, receiptSha256: record.receiptSha256 }, null, 2));
