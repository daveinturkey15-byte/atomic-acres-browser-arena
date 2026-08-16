import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PASS71_NATIVE_SERIAL_FINAL_SEQUENCE,
  PASS71_NATIVE_SERIAL_PORTS,
  PASS71_NATIVE_SERIAL_PRE_SEQUENCE,
  PASS71_NATIVE_SERIAL_RECORD_CATALOG,
  assertPass71NativeSerialJsonBudget,
  assertPass71NativeSerialPorts,
  assertPass71NativeSerialRegistry,
  createPass71NativeSerialLanePlan,
  parsePass71NativeSerialChildSummary,
  parsePass71NativeSerialConfiguration,
  runPass71NativeEvidenceSerial,
  validatePass71NativeSerialRecords,
} from './run-pass71-native-evidence-serial.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const PREVIEW_CREATED_AT = '2026-08-13T23:00:00.000Z';
const STARTED_AT = '2026-08-14T00:00:00.000Z';
const COMPLETED_AT = '2026-08-14T00:01:00.000Z';
const HF313_STARTED_AT = '2026-08-14T00:02:00.000Z';
const HF313_COMPLETED_AT = '2026-08-14T00:03:00.000Z';
const NOW = '2026-08-14T00:04:00.000Z';

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digestUnsigned(record, digestField) {
  const unsigned = { ...record };
  delete unsigned[digestField];
  return createHash('sha256').update(`${JSON.stringify(canonical(unsigned))}\n`).digest('hex');
}

function signRecord(record, digestField = 'receiptSha256') {
  const signed = { ...record };
  signed[digestField] = digestUnsigned(signed, digestField);
  return signed;
}

function recordForKey(key, index = 0, overrides = {}) {
  const [evidenceId, kind] = key.split('\u0000');
  const hf313 = evidenceId === 'HF-313';
  const record = {
    schemaVersion: 1,
    evidenceId,
    kind,
    feedbackId: evidenceId,
    status: 'passed',
    sourceSha: SOURCE_SHA,
    startedAt: hf313 ? HF313_STARTED_AT : STARTED_AT,
    completedAt: hf313 ? HF313_COMPLETED_AT : COMPLETED_AT,
    ...overrides,
  };
  if (kind === 'pass71-hf298-grenade-native-component') {
    const scopes = [
      { mode: 'solo', renderer: 'webgl2' },
      { mode: 'solo', renderer: 'webgpu' },
      { mode: 'hosted', renderer: 'webgl2' },
      { mode: 'hosted', renderer: 'webgpu' },
    ];
    record.scope = { ...scopes[index], arenaId: 'atomic-acres' };
  }
  return signRecord(record, evidenceId === 'HF-302' ? 'evidenceDigest' : 'receiptSha256');
}

function recordsForSequence(sequence) {
  const occurrence = new Map();
  return sequence.map((key) => {
    const index = occurrence.get(key) ?? 0;
    occurrence.set(key, index + 1);
    return recordForKey(key, index);
  });
}

function mockRegistry(options = {}) {
  const missingKey = options.missingKey ?? null;
  const nonclosingKey = options.nonclosingKey ?? null;
  return PASS71_NATIVE_SERIAL_RECORD_CATALOG
    .filter((entry) => `${entry.evidenceId}\u0000${entry.kind}` !== missingKey)
    .map((entry) => {
      const key = `${entry.evidenceId}\u0000${entry.kind}`;
      return {
        descriptor: {
          evidenceId: entry.evidenceId,
          kind: entry.kind,
          minimumCount: 0,
          maximumCount: entry.count,
        },
        closesFeedback: key === nonclosingKey ? false : true,
        validate(record, context) {
          const digestField = record.evidenceDigest ? 'evidenceDigest' : 'receiptSha256';
          const failures = record[digestField] === digestUnsigned(record, digestField)
            ? [] : ['canonical-digest'];
          if (entry.evidenceId === 'HF-298' && entry.kind === 'pass71-hf298-full-scope-coverage') {
            const componentKey = 'HF-298\u0000pass71-hf298-grenade-native-component';
            if ((context.recordsByKey.get(componentKey) ?? []).length !== 4) failures.push('hf298-components');
          }
          if (entry.evidenceId === 'HF-313') {
            const allRecords = [...context.recordsByKey.values()].flatMap((values) => values);
            if (allRecords.length !== 22) failures.push('hf313-complete-context');
          }
          return failures;
        },
      };
    });
}

const VALIDATION_SUPPORT = Object.freeze({
  pass71GrenadeTooling: Object.freeze({}),
  registryOptions: Object.freeze({}),
});

function configuration(repositoryRoot, overrides = {}) {
  return {
    repositoryRoot,
    sourceSha: SOURCE_SHA,
    previewCreatedAt: PREVIEW_CREATED_AT,
    machine: 'dave-gaming-pc',
    browsers: {
      edge: resolve(repositoryRoot, 'bin/msedge.exe'),
      chrome: resolve(repositoryRoot, 'bin/chrome.exe'),
      firefox: resolve(repositoryRoot, 'bin/firefox.exe'),
      geckodriver: resolve(repositoryRoot, 'bin/geckodriver.exe'),
    },
    artifactRoot: resolve(repositoryRoot, 'artifacts/pass71/native-evidence-serial', SOURCE_SHA),
    adoptExisting: false,
    adoptHf303Path: null,
    ...overrides,
  };
}

function temporaryRepository() {
  return mkdtempSync(join(tmpdir(), 'pass71-native-serial-test-'));
}

function outputPathForLane(lane, config) {
  if (lane.output.kind === 'fixed') return lane.output.absolutePath;
  if (lane.id === 'hf303') {
    return resolve(
      config.repositoryRoot,
      `artifacts/pass71/hf303-quality-visual/${SOURCE_SHA}-2026-08-14T00-00-00Z/native-evidence.json`,
    );
  }
  throw new Error(`Unhandled test lane ${lane.id}`);
}

function writeLaneEvidence(lane, config) {
  const outputPath = outputPathForLane(lane, config);
  const records = recordsForSequence(lane.expectedSequence);
  const value = lane.output.shape === 'array' ? records : records[0];
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return { outputPath, records };
}

function executionSummary(lane, outputPath) {
  return {
    status: lane.id === 'hf312' || lane.id === 'hf313' ? undefined : 'passed',
    ok: lane.id === 'hf312' || lane.id === 'hf313' ? true : undefined,
    sourceSha: SOURCE_SHA,
    [lane.output.pathField]: outputPath,
  };
}

function assertSidecar(path) {
  const bytes = readFileSync(path);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(readFileSync(`${path}.sha256`, 'utf8'), `${digest}  ${basename(path)}\n`);
}

test('catalog freezes exact 21-record prearray and 22-record final array', () => {
  assert.equal(PASS71_NATIVE_SERIAL_PRE_SEQUENCE.length, 21);
  assert.equal(PASS71_NATIVE_SERIAL_FINAL_SEQUENCE.length, 22);
  assert.deepEqual(
    PASS71_NATIVE_SERIAL_FINAL_SEQUENCE.slice(0, -1),
    PASS71_NATIVE_SERIAL_PRE_SEQUENCE,
  );
  assert.equal(PASS71_NATIVE_SERIAL_FINAL_SEQUENCE.at(-1), 'HF-313\u0000pass71-hf313-protected-release-readiness');
  assert.equal(PASS71_NATIVE_SERIAL_PRE_SEQUENCE.filter((key) => key.startsWith('HF-298\u0000')).length, 5);
  assert.equal(PASS71_NATIVE_SERIAL_PRE_SEQUENCE.includes(
    'HF-297\u0000pass71-hf297-first-person-arms-component',
  ), false);
  assert.equal(PASS71_NATIVE_SERIAL_PRE_SEQUENCE.includes(
    'HF-304\u0000pass71-hf304-glass-full-mechanical-component',
  ), false);
});

test('port plan is globally collision-free and reserves each multi-scope range', () => {
  const ports = assertPass71NativeSerialPorts();
  assert.equal(ports.length, new Set(ports).size);
  assert.equal(PASS71_NATIVE_SERIAL_PORTS.hf299.preview.length, 8);
  assert.equal(PASS71_NATIVE_SERIAL_PORTS.hf304.preview.length, 4);
  assert.equal(PASS71_NATIVE_SERIAL_PORTS.hf307.peer.length, 2);
  assert.equal(PASS71_NATIVE_SERIAL_PORTS.hf308.preview.length, 16);
  assert.equal(PASS71_NATIVE_SERIAL_PORTS.hf311.driver.length, 2);
  assert.throws(
    () => assertPass71NativeSerialPorts({
      left: { preview: [50_000] },
      right: { peer: [50_000] },
    }),
    /shared by left\/preview and right\/peer/u,
  );
});

test('lane plan uses exact truthful machine CLIs and closing output paths', () => {
  const root = resolve('C:/pass71-native-serial-plan-test');
  const config = configuration(root);
  const plan = createPass71NativeSerialLanePlan(config);
  assert.deepEqual(plan.map(({ id }) => id), [
    'hf296', 'hf297', 'hf298', 'hf299', 'hf300', 'hf301', 'hf302', 'hf303', 'hf304',
    'hf305', 'hf306', 'hf307', 'hf308', 'hf309', 'hf310', 'hf311', 'hf312',
  ]);
  const hf302 = plan.find(({ id }) => id === 'hf302');
  assert.deepEqual(hf302.args.slice(-3), [
    `--expected-source-sha=${SOURCE_SHA}`, '--browser=msedge', '--machine=dave-gaming-pc',
  ]);
  const hf311 = plan.find(({ id }) => id === 'hf311');
  assert.deepEqual(hf311.args, ['--expected-source-sha', SOURCE_SHA, '--machine', 'dave-gaming-pc']);
  assert.equal(hf311.environment.PASS71_CHROME_PATH, config.browsers.chrome);
  assert.equal(hf311.environment.PASS71_FIREFOX_PATH, config.browsers.firefox);
  assert.equal(hf311.environment.PASS71_GECKODRIVER_PATH, config.browsers.geckodriver);
  const hf297 = plan.find(({ id }) => id === 'hf297');
  assert.match(hf297.output.absolutePath.replaceAll('\\', '/'), /hf297-full-arms\/[a-f0-9]{40}-receipt\.json$/u);
  const hf304 = plan.find(({ id }) => id === 'hf304');
  assert.match(hf304.output.absolutePath.replaceAll('\\', '/'), /hf304-live-hosted\/[a-f0-9]{40}-receipt\.json$/u);
  assert.equal(plan.find(({ id }) => id === 'hf303').output.kind, 'hf303-stdout');
});

test('HF-303 final stdout JSON is parsed after noisy nested contract output', () => {
  const receiptPath = `C:/repo/artifacts/pass71/hf303-quality-visual/${SOURCE_SHA}-2026-08-14T00-00-00Z/native-evidence.json`;
  const stdout = [
    '> npm run qa:pass71:hf303-quality-visual:contract',
    '{"contract":{"status":"passed"}}',
    'more bounded child output',
    JSON.stringify({
      status: 'passed',
      sourceSha: SOURCE_SHA,
      receiptPath,
      comparison: { webgl2: 'passed', webgpu: 'passed' },
    }, null, 2),
    '',
  ].join('\n');
  const summary = parsePass71NativeSerialChildSummary(stdout, 'hf303');
  assert.equal(summary.receiptPath, receiptPath);
  assert.equal(summary.sourceSha, SOURCE_SHA);
  assert.throws(
    () => parsePass71NativeSerialChildSummary('noise only', 'hf303'),
    /did not end with one parseable JSON summary/u,
  );
});

test('final registry loading fails closed on missing or nonclosing closure entries', () => {
  const hf304Key = 'HF-304\u0000pass71-hf304-live-hosted-native';
  const hf308Key = 'HF-308\u0000pass71-hf308-chopper-missile-full-closure';
  assert.throws(
    () => assertPass71NativeSerialRegistry(mockRegistry({ missingKey: hf304Key })),
    /final acceptance registry is incomplete.*HF-304/u,
  );
  assert.throws(
    () => assertPass71NativeSerialRegistry(mockRegistry({ nonclosingKey: hf308Key })),
    /does not mark HF-308.*as closing evidence/u,
  );
  assert.doesNotThrow(() => assertPass71NativeSerialRegistry(mockRegistry()));
});

test('record validation rejects stale chronology, partial HF-297, obsolete HF-304, and sequence drift', async () => {
  const root = resolve('C:/pass71-native-serial-validation-test');
  const registry = mockRegistry();
  const common = {
    registry,
    sourceSha: SOURCE_SHA,
    previewCreatedAt: PREVIEW_CREATED_AT,
    repositoryRoot: root,
    validationSupport: VALIDATION_SUPPORT,
  };
  const stale = recordForKey(PASS71_NATIVE_SERIAL_PRE_SEQUENCE[0], 0, {
    startedAt: '2026-08-13T22:59:59.000Z',
    completedAt: '2026-08-14T00:01:00.000Z',
  });
  await assert.rejects(
    validatePass71NativeSerialRecords([stale], {
      ...common, expectedSequence: [PASS71_NATIVE_SERIAL_PRE_SEQUENCE[0]],
    }),
    /precedes immutable preview creation/u,
  );
  const partialKey = 'HF-297\u0000pass71-hf297-first-person-arms-component';
  await assert.rejects(
    validatePass71NativeSerialRecords([recordForKey(partialKey)], {
      ...common, expectedSequence: [partialKey],
    }),
    /representative non-closing HF-297/u,
  );
  const obsoleteHf304Key = 'HF-304\u0000pass71-hf304-glass-full-mechanical-component';
  await assert.rejects(
    validatePass71NativeSerialRecords([recordForKey(obsoleteHf304Key)], {
      ...common, expectedSequence: [obsoleteHf304Key],
    }),
    /non-closing mechanical HF-304/u,
  );
  const complete = recordsForSequence(PASS71_NATIVE_SERIAL_PRE_SEQUENCE);
  await assert.rejects(
    validatePass71NativeSerialRecords(complete.slice(0, -1), {
      ...common, expectedSequence: PASS71_NATIVE_SERIAL_PRE_SEQUENCE,
    }),
    /evidence sequence mismatch/u,
  );
  const duplicated = [...complete, complete[0]];
  await assert.rejects(
    validatePass71NativeSerialRecords(duplicated, {
      ...common, expectedSequence: PASS71_NATIVE_SERIAL_PRE_SEQUENCE,
    }),
    /evidence sequence mismatch/u,
  );
});

test('JSON budget counts minified UTF-8 bytes for the whole array', () => {
  const records = recordsForSequence(PASS71_NATIVE_SERIAL_PRE_SEQUENCE);
  const exact = Buffer.byteLength(JSON.stringify(records), 'utf8');
  assert.equal(assertPass71NativeSerialJsonBudget(records, exact).jsonBytes, exact);
  assert.throws(
    () => assertPass71NativeSerialJsonBudget(records, exact - 1),
    /maximum is/u,
  );
});

test('mocked end-to-end run is serial, resumable, digest-bound, and emits no approval', async (t) => {
  const root = temporaryRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = configuration(root);
  const registry = mockRegistry();
  let active = 0;
  let maximumActive = 0;
  const executed = [];
  let sourceGuardCalls = 0;
  const executeLane = async (lane, currentConfig) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    executed.push(lane.id);
    if (lane.id === 'hf313') {
      assert.equal(lane.args.length, 4);
      assert.deepEqual(lane.args.slice(0, 3), [
        '--expected-source-sha', SOURCE_SHA, '--native-evidence',
      ]);
      assert.match(lane.args[3].replaceAll('\\', '/'), /native-evidence-pre-hf313\.json$/u);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1));
    const { outputPath } = writeLaneEvidence(lane, currentConfig);
    active -= 1;
    const summary = executionSummary(lane, outputPath);
    return { summary, stdout: JSON.stringify(summary), stderr: '' };
  };
  const sourceGuard = () => { sourceGuardCalls += 1; };
  const result = await runPass71NativeEvidenceSerial(config, {
    registry,
    validationSupport: VALIDATION_SUPPORT,
    sourceGuard,
    executeLane,
    now: () => NOW,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready-for-approval');
  assert.deepEqual(executed, [
    'hf296', 'hf297', 'hf298', 'hf299', 'hf300', 'hf301', 'hf302', 'hf303', 'hf304',
    'hf305', 'hf306', 'hf307', 'hf308', 'hf309', 'hf310', 'hf311', 'hf312', 'hf313',
  ]);
  assert.equal(maximumActive, 1);
  assert.ok(sourceGuardCalls > executed.length);
  const preBytes = readFileSync(result.preArray.path, 'utf8');
  const finalBytes = readFileSync(result.finalArray.path, 'utf8');
  assert.equal(preBytes.includes('\n  '), false);
  assert.equal(finalBytes.includes('\n  '), false);
  assert.equal(JSON.parse(preBytes).length, 21);
  assert.equal(JSON.parse(finalBytes).length, 22);
  assertSidecar(result.preArray.path);
  assertSidecar(result.finalArray.path);
  assertSidecar(result.readiness.path);
  const readiness = JSON.parse(readFileSync(result.readiness.path, 'utf8'));
  assert.equal(readiness.approvalBoundary.approvalRecorded, false);
  assert.equal(readiness.approvalBoundary.ownerInspectionClaim, 'not-made');
  assert.equal(readiness.approvalBoundary.requiresApprovedAtAfter, HF313_COMPLETED_AT);
  const state = JSON.parse(readFileSync(result.statePath, 'utf8'));
  assert.equal(Object.keys(state.lanes).length, 18);
  assert.equal(state.readyForApproval.approvalRecorded, false);
  assert.match(state.lanes.hf303.outputPath, new RegExp(
    `^artifacts/pass71/hf303-quality-visual/${SOURCE_SHA}-2026-08-14T00-00-00Z/native-evidence\\.json$`,
    'u',
  ));

  const resumedExecutions = [];
  const resumed = await runPass71NativeEvidenceSerial(config, {
    registry,
    validationSupport: VALIDATION_SUPPORT,
    sourceGuard,
    executeLane: async (lane) => {
      resumedExecutions.push(lane.id);
      throw new Error('completed lane should not execute');
    },
    now: () => NOW,
  });
  assert.equal(resumed.ok, true);
  assert.deepEqual(resumedExecutions, []);

  const hf296Path = resolve(root, state.lanes.hf296.outputPath);
  const tampered = JSON.parse(readFileSync(hf296Path, 'utf8'));
  tampered.status = 'tampered';
  writeFileSync(hf296Path, `${JSON.stringify(tampered)}\n`, 'utf8');
  await assert.rejects(
    runPass71NativeEvidenceSerial(config, {
      registry,
      validationSupport: VALIDATION_SUPPORT,
      sourceGuard,
      executeLane: async () => { throw new Error('tampered checkpoint must not rerun silently'); },
      now: () => NOW,
    }),
    /checkpointed evidence bytes or canonical digests changed/u,
  );
});

test('exact existing artifacts can be adopted without launching a child, including explicit HF-303 path', async (t) => {
  const root = temporaryRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseConfig = configuration(root);
  const plan = createPass71NativeSerialLanePlan(baseConfig);
  let hf303Path = null;
  for (const lane of plan) {
    const written = writeLaneEvidence(lane, baseConfig);
    if (lane.id === 'hf303') hf303Path = written.outputPath;
  }
  const hf313Path = resolve(root, 'artifacts/pass71/hf313-release-readiness/native-evidence.json');
  mkdirSync(dirname(hf313Path), { recursive: true });
  writeFileSync(hf313Path, `${JSON.stringify(recordForKey(PASS71_NATIVE_SERIAL_FINAL_SEQUENCE.at(-1)), null, 2)}\n`, 'utf8');
  const config = configuration(root, {
    adoptExisting: true,
    adoptHf303Path: hf303Path,
  });
  let executions = 0;
  const result = await runPass71NativeEvidenceSerial(config, {
    registry: mockRegistry(),
    validationSupport: VALIDATION_SUPPORT,
    sourceGuard: () => undefined,
    executeLane: async () => {
      executions += 1;
      throw new Error('valid adopted evidence must not launch a child');
    },
    now: () => NOW,
  });
  assert.equal(result.ok, true);
  assert.equal(executions, 0);
  const state = JSON.parse(readFileSync(result.statePath, 'utf8'));
  assert.equal(Object.values(state.lanes).every((laneState) => laneState.adopted === true), true);
});

test('HF-303 cannot be adopted through a latest-file guess', async (t) => {
  const root = temporaryRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = configuration(root, { adoptExisting: true, adoptHf303Path: null });
  const plan = createPass71NativeSerialLanePlan(config);
  for (const lane of plan) writeLaneEvidence(lane, config);
  const executed = [];
  await assert.rejects(
    runPass71NativeEvidenceSerial(config, {
      registry: mockRegistry(),
      validationSupport: VALIDATION_SUPPORT,
      sourceGuard: () => undefined,
      executeLane: async (lane) => {
        executed.push(lane.id);
        throw new Error('HF-303 exact stdout path is required');
      },
      now: () => NOW,
    }),
    /HF-303 exact stdout path is required/u,
  );
  assert.deepEqual(executed, ['hf303']);
});

test('HF-303 stdout path is absolute and its timestamp is receipt-bound', async (t) => {
  const root = temporaryRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = configuration(root);
  const dependencies = {
    registry: mockRegistry(),
    validationSupport: VALIDATION_SUPPORT,
    sourceGuard: () => undefined,
    now: () => NOW,
  };
  await assert.rejects(
    runPass71NativeEvidenceSerial(config, {
      ...dependencies,
      executeLane: async (lane, currentConfig) => {
        const { outputPath } = writeLaneEvidence(lane, currentConfig);
        const summary = executionSummary(lane, outputPath);
        if (lane.id === 'hf303') summary.receiptPath = relative(root, outputPath);
        return { summary, stdout: JSON.stringify(summary), stderr: '' };
      },
    }),
    /HF-303 stdout receiptPath must be absolute/u,
  );

  await assert.rejects(
    runPass71NativeEvidenceSerial(config, {
      ...dependencies,
      executeLane: async (lane, currentConfig) => {
        if (lane.id !== 'hf303') throw new Error(`unexpected rerun of ${lane.id}`);
        const outputPath = resolve(
          root,
          `artifacts/pass71/hf303-quality-visual/${SOURCE_SHA}-2026-08-14T00-00-01Z/native-evidence.json`,
        );
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, `${JSON.stringify(recordForKey(lane.expectedSequence[0]), null, 2)}\n`, 'utf8');
        const summary = executionSummary(lane, outputPath);
        return { summary, stdout: JSON.stringify(summary), stderr: '' };
      },
    }),
    /timestamp does not match the receipt startedAt/u,
  );
});

test('checkpoint root is fixed to artifacts/pass71/native-evidence-serial/<A>', async (t) => {
  const root = temporaryRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = configuration(root, {
    artifactRoot: resolve(root, 'artifacts/pass71/native-evidence-serial/not-candidate-a'),
  });
  await assert.rejects(
    runPass71NativeEvidenceSerial(config, {
      registry: mockRegistry(),
      validationSupport: VALIDATION_SUPPORT,
      sourceGuard: () => undefined,
      executeLane: async () => { throw new Error('invalid root must fail before execution'); },
      now: () => NOW,
    }),
    /checkpoint\/artifact root must be exactly/u,
  );
});

test('CLI parser requires explicit installed-browser paths and couples HF-303 adoption', (t) => {
  const root = temporaryRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = resolve(root, 'bin');
  mkdirSync(bin, { recursive: true });
  for (const name of ['msedge.exe', 'chrome.exe', 'firefox.exe', 'geckodriver.exe']) {
    writeFileSync(resolve(bin, name), name, 'utf8');
  }
  const common = [
    '--expected-source-sha', SOURCE_SHA,
    '--preview-created-at', PREVIEW_CREATED_AT,
    '--machine', 'dave-gaming-pc',
    '--edge-executable', resolve(bin, 'msedge.exe'),
    '--chrome-executable', resolve(bin, 'chrome.exe'),
    '--firefox-executable', resolve(bin, 'firefox.exe'),
    '--geckodriver-executable', resolve(bin, 'geckodriver.exe'),
  ];
  const parsed = parsePass71NativeSerialConfiguration(common, root);
  assert.equal(parsed.sourceSha, SOURCE_SHA);
  assert.equal(parsed.machine, 'dave-gaming-pc');
  assert.throws(
    () => parsePass71NativeSerialConfiguration([
      ...common, '--adopt-hf303-path', resolve(root, 'native-evidence.json'),
    ], root),
    /requires --adopt-existing/u,
  );
  assert.throws(
    () => parsePass71NativeSerialConfiguration(common.map((value) => (
      value === 'dave-gaming-pc' ? 'spoofed-machine' : value
    )), root),
    /machine dave-gaming-pc/u,
  );
  assert.throws(
    () => parsePass71NativeSerialConfiguration(common.map((value) => (
      value === PREVIEW_CREATED_AT ? '2026-02-30T00:00:00.000Z' : value
    )), root),
    /requires --expected-source-sha/u,
  );
});

test('orchestrator source contains no latest-file or directory-enumeration fallback', () => {
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'run-pass71-native-evidence-serial.mjs');
  const source = readFileSync(scriptPath, 'utf8');
  assert.equal(/\breaddir(?:Sync)?\s*\(|\bglob(?:Sync)?\s*\(/u.test(source), false);
  assert.match(source, /hf303-stdout/u);
  assert.match(source, /never selected by latest-file glob/u);
  assert.match(source, /ready-for-approval/u);
  assert.equal(existsSync(scriptPath), true);
});
