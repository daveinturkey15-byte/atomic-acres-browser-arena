#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PASS71_NATIVE_SERIAL_REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), '..', '..');
export const PASS71_NATIVE_SERIAL_MAX_EVIDENCE_BYTES = 80 * 1024 * 1024;

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const MAX_CHILD_OUTPUT_BYTES = 64 * 1024 * 1024;

function evidenceKey(value) {
  return `${value?.evidenceId ?? ''}\u0000${value?.kind ?? ''}`;
}

function catalogEntry(laneId, evidenceId, kind, count, options = {}) {
  return Object.freeze({ laneId, evidenceId, kind, count, ...options });
}

export const PASS71_NATIVE_SERIAL_RECORD_CATALOG = Object.freeze([
  catalogEntry('hf296', 'HF-296', 'pass71-hf296-player-viewmodel-contact-component', 1),
  catalogEntry('hf297', 'HF-297', 'pass71-hf297-first-person-arms-full-closure', 1, { requiresClosingRegistry: true }),
  catalogEntry('hf298', 'HF-298', 'pass71-hf298-grenade-native-component', 4),
  catalogEntry('hf298', 'HF-298', 'pass71-hf298-full-scope-coverage', 1),
  catalogEntry('hf299', 'HF-299', 'pass71-hf299-exact-thermal-operator-coverage', 1),
  catalogEntry('hf300', 'HF-300', 'pass71-hf300-piloted-drone-exact-thermal', 1),
  catalogEntry('hf301', 'HF-301', 'pass71-hf301-renderer-forward-progress-closure', 1),
  catalogEntry('hf302', 'HF-302', 'pass71-hf302-audio-native-long-run', 1),
  catalogEntry('hf303', 'HF-303', 'pass71-hf303-atomic-quality-visual-parity', 1),
  catalogEntry('hf304', 'HF-304', 'pass71-hf304-live-hosted-native', 1, { requiresClosingRegistry: true }),
  catalogEntry('hf305', 'HF-305', 'pass71-hf305-nuke-warning-native', 1),
  catalogEntry('hf306', 'HF-306', 'pass71-hf306-chopper-cockpit-framing-closure', 1),
  catalogEntry('hf307', 'HF-307', 'pass71-hf307-exact-chopper-mg-splash-coverage', 1),
  catalogEntry('hf308', 'HF-308', 'pass71-hf308-chopper-missile-full-closure', 1, { requiresClosingRegistry: true }),
  catalogEntry('hf309', 'HF-309', 'pass71-hf309-chopper-first-entry-native', 1),
  catalogEntry('hf310', 'HF-310', 'pass71-hf310-stuck-two-peer-raster-component', 1),
  catalogEntry('hf311', 'HF-311', 'pass71-firefox-chrome-quality-parity', 1),
  catalogEntry('hf312', 'HF-312', 'pass71-hf312-bounded-consolidation-audit', 1),
  catalogEntry('hf313', 'HF-313', 'pass71-hf313-protected-release-readiness', 1, { requiresClosingRegistry: true }),
]);

const CATALOG_BY_LANE = new Map();
for (const entry of PASS71_NATIVE_SERIAL_RECORD_CATALOG) {
  const entries = CATALOG_BY_LANE.get(entry.laneId) ?? [];
  entries.push(entry);
  CATALOG_BY_LANE.set(entry.laneId, entries);
}

function sequenceForLane(laneId) {
  return Object.freeze((CATALOG_BY_LANE.get(laneId) ?? []).flatMap((entry) => (
    Array.from({ length: entry.count }, () => evidenceKey(entry))
  )));
}

export const PASS71_NATIVE_SERIAL_PRE_SEQUENCE = Object.freeze([
  'hf296', 'hf297', 'hf298', 'hf299', 'hf300', 'hf301', 'hf302', 'hf303', 'hf304',
  'hf305', 'hf306', 'hf307', 'hf308', 'hf309', 'hf310', 'hf311', 'hf312',
].flatMap(sequenceForLane));

export const PASS71_NATIVE_SERIAL_FINAL_SEQUENCE = Object.freeze([
  ...PASS71_NATIVE_SERIAL_PRE_SEQUENCE,
  ...sequenceForLane('hf313'),
]);

function range(start, count) {
  return Object.freeze(Array.from({ length: count }, (_, index) => start + index));
}

export const PASS71_NATIVE_SERIAL_PORTS = Object.freeze({
  hf296: Object.freeze({ preview: range(50_000, 1), peer: range(50_050, 1) }),
  hf297: Object.freeze({ preview: range(50_200, 1), peer: range(50_250, 1) }),
  hf298: Object.freeze({ preview: range(50_400, 1), peer: range(50_450, 1) }),
  hf299: Object.freeze({ preview: range(50_600, 8), peer: range(50_650, 8) }),
  hf300: Object.freeze({ preview: range(50_800, 1), peer: range(50_850, 1) }),
  hf301: Object.freeze({ preview: range(51_000, 1) }),
  hf302: Object.freeze({ preview: range(51_200, 1) }),
  hf303: Object.freeze({ candidate: range(51_400, 1), baseline: range(51_450, 1) }),
  hf304: Object.freeze({ preview: range(51_600, 4), peer: range(51_650, 4) }),
  hf305: Object.freeze({ preview: range(51_800, 2) }),
  hf306: Object.freeze({ preview: range(52_000, 1) }),
  hf307: Object.freeze({ preview: range(52_200, 2), peer: range(52_250, 2) }),
  hf308: Object.freeze({ preview: range(52_400, 16), peer: range(52_450, 16) }),
  hf309: Object.freeze({ preview: range(52_600, 2) }),
  hf310: Object.freeze({ preview: range(52_800, 1), peer: range(52_850, 1) }),
  hf311: Object.freeze({ preview: range(53_000, 1), peer: range(53_050, 1), driver: range(53_100, 2) }),
});

export function assertPass71NativeSerialPorts(portPlan = PASS71_NATIVE_SERIAL_PORTS) {
  const owners = new Map();
  for (const [laneId, groups] of Object.entries(portPlan)) {
    for (const [group, ports] of Object.entries(groups)) {
      for (const port of ports) {
        if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
          throw new Error(`Pass 71 serial ${laneId}/${group} port is invalid: ${port}`);
        }
        const prior = owners.get(port);
        if (prior) throw new Error(`Pass 71 serial port ${port} is shared by ${prior} and ${laneId}/${group}`);
        owners.set(port, `${laneId}/${group}`);
      }
    }
  }
  return Object.freeze([...owners.keys()].sort((left, right) => left - right));
}

function fixedOutput(repositoryRoot, relativePath, pathField, shape = 'record') {
  return Object.freeze({
    kind: 'fixed',
    absolutePath: resolve(repositoryRoot, relativePath),
    pathField,
    shape,
  });
}

function dynamicHf303Output(pathField = 'receiptPath') {
  return Object.freeze({ kind: 'hf303-stdout', pathField, shape: 'record' });
}

function lane(id, runner, args, environment, output, ports = []) {
  return Object.freeze({
    id,
    runner,
    args: Object.freeze(args),
    environment: Object.freeze(environment),
    output,
    ports: Object.freeze(ports),
    expectedSequence: sequenceForLane(id),
  });
}

function flattenPorts(groups) {
  return Object.values(groups ?? {}).flat();
}

export function createPass71NativeSerialLanePlan(config) {
  const root = config.repositoryRoot;
  const sha = config.sourceSha;
  const machine = config.machine;
  const edge = config.browsers.edge;
  const chrome = config.browsers.chrome;
  const firefox = config.browsers.firefox;
  const geckodriver = config.browsers.geckodriver;
  const ports = PASS71_NATIVE_SERIAL_PORTS;
  assertPass71NativeSerialPorts(ports);
  return Object.freeze([
    lane('hf296', 'scripts/qa/run-pass71-hf296-contact-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--port', String(ports.hf296.preview[0]), '--peer-port', String(ports.hf296.peer[0]),
      '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf296-contact-evidence/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf296)),
    lane('hf297', 'scripts/qa/run-pass71-hf297-full-arms-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--preview-port', String(ports.hf297.preview[0]), '--peer-port', String(ports.hf297.peer[0]),
      '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf297-full-arms/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf297)),
    lane('hf298', 'scripts/qa/run-pass71-hf298-coverage.mjs', [
      '--expected-source-sha', sha,
      '--port', String(ports.hf298.preview[0]), '--peer-port', String(ports.hf298.peer[0]),
      '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/grenade-native/${sha}-hf298-native-evidence.json`, 'manifestEvidencePath', 'array'), flattenPorts(ports.hf298)),
    lane('hf299', 'scripts/qa/run-pass71-hf299-thermal-operator-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--preview-port', String(ports.hf299.preview[0]), '--peer-port', String(ports.hf299.peer[0]),
      '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf299-thermal-operator/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf299)),
    lane('hf300', 'scripts/qa/run-pass71-hf300-drone-thermal-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--port', String(ports.hf300.preview[0]), '--peer-port', String(ports.hf300.peer[0]),
      '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf300-drone-thermal-evidence/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf300)),
    lane('hf301', 'scripts/qa/run-pass71-hf301-renderer-progress-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--preview-port', String(ports.hf301.preview[0]), '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf301-renderer-progress/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf301)),
    lane('hf302', 'scripts/qa/run-pass71-audio-native-receipt.mjs', [
      `--expected-source-sha=${sha}`, '--browser=msedge', `--machine=${machine}`,
    ], {
      PASS71_AUDIO_BROWSER_PATH: edge,
      PASS71_AUDIO_PREVIEW_PORT: String(ports.hf302.preview[0]),
    }, fixedOutput(root, `artifacts/pass71/audio-native/${sha}-msedge-receipt.json`, 'receiptPath'), flattenPorts(ports.hf302)),
    lane('hf303', 'scripts/qa/run-pass71-quality-visual-parity.mjs', [
      '--expected-source-sha', sha,
      '--candidate-port', String(ports.hf303.candidate[0]), '--baseline-port', String(ports.hf303.baseline[0]),
      '--edge-executable', edge,
    ], {}, dynamicHf303Output(), flattenPorts(ports.hf303)),
    lane('hf304', 'scripts/qa/run-pass71-hf304-live-hosted-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--preview-port', String(ports.hf304.preview[0]), '--peer-port', String(ports.hf304.peer[0]),
      '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf304-live-hosted/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf304)),
    lane('hf305', 'scripts/qa/run-pass71-hf305-nuke-warning-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--preview-port', String(ports.hf305.preview[0]),
    ], {
      PASS71_HF305_BROWSER_PATH: edge,
    }, fixedOutput(root, `artifacts/pass71/hf305-nuke-warning/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf305)),
    lane('hf306', 'scripts/qa/run-pass71-hf306-cockpit-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--preview-port', String(ports.hf306.preview[0]), '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf306-cockpit/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf306)),
    lane('hf307', 'scripts/qa/run-pass71-hf307-chopper-mg-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--preview-port', String(ports.hf307.preview[0]), '--peer-port', String(ports.hf307.peer[0]),
      '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf307-chopper-mg/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf307)),
    lane('hf308', 'scripts/qa/run-pass71-hf308-chopper-missile-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--preview-port', String(ports.hf308.preview[0]), '--peer-port', String(ports.hf308.peer[0]),
      '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf308-chopper-missile/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf308)),
    lane('hf309', 'scripts/qa/run-pass71-hf309-chopper-first-entry-evidence.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
      '--preview-port', String(ports.hf309.preview[0]), '--edge-executable', edge,
    ], {}, fixedOutput(root, `artifacts/pass71/hf309-chopper-first-entry/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf309)),
    lane('hf310', 'scripts/qa/run-pass71-stuck-evidence.mjs', [
      '--expected-source-sha', sha,
      '--preview-port', String(ports.hf310.preview[0]), '--peer-port', String(ports.hf310.peer[0]),
      '--chrome-executable', chrome,
    ], {}, fixedOutput(root, `artifacts/pass71/stuck-evidence/${sha}-native-evidence.json`, 'evidencePath'), flattenPorts(ports.hf310)),
    lane('hf311', 'scripts/qa/run-pass71-native-browser-parity.mjs', [
      '--expected-source-sha', sha, '--machine', machine,
    ], {
      PASS71_PARITY_PREVIEW_PORT: String(ports.hf311.preview[0]),
      PASS71_PARITY_PEER_PORT: String(ports.hf311.peer[0]),
      PASS71_PARITY_FIREFOX_HOST_DRIVER_PORT: String(ports.hf311.driver[0]),
      PASS71_PARITY_FIREFOX_GUEST_DRIVER_PORT: String(ports.hf311.driver[1]),
      PASS71_CHROME_PATH: chrome,
      PASS71_FIREFOX_PATH: firefox,
      PASS71_GECKODRIVER_PATH: geckodriver,
    }, fixedOutput(root, `artifacts/pass71/native-browser-parity/${sha}-receipt.json`, 'receiptPath'), flattenPorts(ports.hf311)),
    lane('hf312', 'scripts/qa/run-pass71-hf312-bounded-consolidation-evidence.mjs', [
      '--expected-source-sha', sha,
    ], {}, fixedOutput(root, 'artifacts/pass71/hf312-bounded-consolidation/native-evidence.json', 'outputPath')),
  ]);
}

function createHf313Lane(config, preArrayPath) {
  return lane('hf313', 'scripts/qa/run-pass71-hf313-release-evidence.mjs', [
    '--expected-source-sha', config.sourceSha,
    '--native-evidence', preArrayPath,
  ], {}, fixedOutput(
    config.repositoryRoot,
    'artifacts/pass71/hf313-release-readiness/native-evidence.json',
    'outputPath',
  ));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIso(value) {
  if (typeof value !== 'string' || !ISO.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const canonical = new Date(value).toISOString();
  return value === canonical || value === canonical.replace('.000Z', 'Z');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function canonicalDigest(value) {
  return sha256(Buffer.from(`${JSON.stringify(canonical(value))}\n`, 'utf8'));
}

function normalizePathForState(repositoryRoot, path) {
  const normalized = relative(repositoryRoot, resolve(path)).replaceAll('\\', '/');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || isAbsolute(normalized)) {
    throw new Error(`Pass 71 serial output is outside the repository: ${path}`);
  }
  return normalized;
}

function samePath(left, right) {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function pathInside(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value === '' || (value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function assertHf303Path(config, path) {
  const root = resolve(config.repositoryRoot, 'artifacts/pass71/hf303-quality-visual');
  const absolute = resolve(path);
  if (!pathInside(root, absolute) || basename(absolute) !== 'native-evidence.json') {
    throw new Error(`HF-303 stdout receipt path is outside its exact artifact root: ${absolute}`);
  }
  const runName = basename(dirname(absolute));
  const escapedSha = config.sourceSha.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = runName.match(new RegExp(
    `^${escapedSha}-(\\d{4}-\\d{2}-\\d{2})T(\\d{2})-(\\d{2})-(\\d{2})(\\.\\d{3})?Z$`,
    'u',
  ));
  const timestamp = match
    ? `${match[1]}T${match[2]}:${match[3]}:${match[4]}${match[5] ?? ''}Z`
    : null;
  if (!timestamp || !isIso(timestamp)) {
    throw new Error(`HF-303 stdout receipt path does not bind exact source/timestamp: ${absolute}`);
  }
  return absolute;
}

function assertLaneOutputPath(laneDefinition, path, config) {
  if (!nonEmpty(path)) throw new Error(`${laneDefinition.id} did not name its evidence output path`);
  if (laneDefinition.output.kind === 'hf303-stdout' && !isAbsolute(path)) {
    throw new Error('HF-303 stdout receiptPath must be absolute');
  }
  const absolute = resolve(config.repositoryRoot, path);
  if (laneDefinition.output.kind === 'fixed') {
    if (!samePath(absolute, laneDefinition.output.absolutePath)) {
      throw new Error(`${laneDefinition.id} emitted an unexpected output path: ${absolute}`);
    }
    return absolute;
  }
  if (laneDefinition.output.kind === 'hf303-stdout') return assertHf303Path(config, absolute);
  throw new Error(`${laneDefinition.id} has an unsupported output path contract`);
}

function readJsonEvidence(path) {
  if (!existsSync(path)) throw new Error(`Pass 71 serial evidence output is missing: ${path}`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Pass 71 serial evidence output must be one regular non-symlink file: ${path}`);
  }
  const bytes = readFileSync(path);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Pass 71 serial evidence output is not JSON (${path}): ${error instanceof Error ? error.message : String(error)}`);
  }
  return Object.freeze({ bytes, value, fileSha256: sha256(bytes) });
}

function recordsFromEvidence(laneDefinition, value) {
  if (laneDefinition.output.shape === 'array') {
    if (!Array.isArray(value)) throw new Error(`${laneDefinition.id} output must be an evidence array`);
    return value;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${laneDefinition.id} output must be one evidence object`);
  }
  return [value];
}

function exactSequence(records) {
  return records.map(evidenceKey);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertExpectedSequence(records, expectedSequence, label) {
  const actual = exactSequence(records);
  if (!sameJson(actual, expectedSequence)) {
    throw new Error(`${label} evidence sequence mismatch; expected ${JSON.stringify(expectedSequence)}, received ${JSON.stringify(actual)}`);
  }
}

function getPath(value, path) {
  return path.reduce((current, key) => current?.[key], value);
}

function candidateSourceClaims(record) {
  const paths = [
    ['sourceSha'], ['expectedSourceSha'], ['endingSha'],
    ['source', 'sourceSha'], ['source', 'expectedSourceSha'], ['source', 'checkoutSourceSha'],
    ['source', 'servedSourceSha'], ['source', 'endingCheckoutSourceSha'],
    ['source', 'candidate', 'sourceSha'], ['source', 'candidate', 'expectedSourceSha'],
    ['source', 'candidate', 'checkoutSourceSha'], ['source', 'candidate', 'endingCheckoutSourceSha'],
    ['servedCandidate', 'sourceSha'],
  ];
  return paths.map((path) => getPath(record, path)).filter((value) => typeof value === 'string' && SHA40.test(value));
}

function recordDigest(record) {
  const digest = record?.receiptSha256 ?? record?.evidenceDigest;
  if (!SHA256.test(digest ?? '')) {
    throw new Error(`${record?.evidenceId ?? 'unknown'}/${record?.kind ?? 'unknown'} has no canonical SHA-256 digest`);
  }
  return digest;
}

function recordInstants(record) {
  const startField = isIso(record?.startedAt) ? 'startedAt' : isIso(record?.finalizedAt) ? 'finalizedAt' : null;
  const endField = isIso(record?.completedAt) ? 'completedAt' : isIso(record?.finalizedAt) ? 'finalizedAt' : null;
  if (!startField || !endField) {
    throw new Error(`${record?.evidenceId ?? 'unknown'}/${record?.kind ?? 'unknown'} has no complete evidence chronology`);
  }
  return Object.freeze({ startField, endField, startedAt: record[startField], completedAt: record[endField] });
}

function assertRecordBoundary(record, sourceSha, previewCreatedAt) {
  const claims = candidateSourceClaims(record);
  if (claims.length === 0 || claims.some((claim) => claim !== sourceSha)) {
    throw new Error(`${record?.evidenceId ?? 'unknown'}/${record?.kind ?? 'unknown'} does not bind only exact candidate A ${sourceSha}`);
  }
  recordDigest(record);
  const instants = recordInstants(record);
  if (Date.parse(instants.startedAt) < Date.parse(previewCreatedAt)) {
    throw new Error(`${record.evidenceId}/${record.kind}.${instants.startField} precedes immutable preview creation`);
  }
  if (Date.parse(instants.completedAt) < Date.parse(instants.startedAt)) {
    throw new Error(`${record.evidenceId}/${record.kind} completes before it starts`);
  }
  return instants;
}

function assertHf298ExactScopes(records) {
  const components = records.filter((record) => evidenceKey(record) === evidenceKey({
    evidenceId: 'HF-298', kind: 'pass71-hf298-grenade-native-component',
  }));
  const expected = ['solo/webgl2', 'solo/webgpu', 'hosted/webgl2', 'hosted/webgpu'];
  const actual = components.map((record) => `${record?.scope?.mode ?? ''}/${record?.scope?.renderer ?? ''}`);
  if (!sameJson(actual, expected)) {
    throw new Error(`HF-298 must flatten the exact ordered four-scope component matrix; received ${JSON.stringify(actual)}`);
  }
}

export function assertPass71NativeSerialRegistry(registry) {
  if (!Array.isArray(registry)) throw new Error('Pass 71 acceptance registry did not load as an array');
  const byKey = new Map();
  for (const entry of registry) {
    const descriptor = entry?.descriptor;
    const key = evidenceKey(descriptor);
    if (!nonEmpty(descriptor?.evidenceId) || !nonEmpty(descriptor?.kind)
      || !Number.isSafeInteger(descriptor?.minimumCount) || descriptor.minimumCount < 0
      || !Number.isSafeInteger(descriptor?.maximumCount) || descriptor.maximumCount < descriptor.minimumCount
      || typeof entry?.validate !== 'function') {
      throw new Error('Pass 71 acceptance registry contains an invalid entry');
    }
    if (byKey.has(key)) throw new Error(`Pass 71 acceptance registry duplicates ${descriptor.evidenceId}/${descriptor.kind}`);
    byKey.set(key, entry);
  }
  const missing = [];
  for (const expected of PASS71_NATIVE_SERIAL_RECORD_CATALOG) {
    const entry = byKey.get(evidenceKey(expected));
    if (!entry) {
      missing.push(`${expected.evidenceId}/${expected.kind}`);
      continue;
    }
    if (entry.descriptor.maximumCount < expected.count) {
      throw new Error(`Pass 71 registry maximum for ${expected.evidenceId}/${expected.kind} cannot hold ${expected.count}`);
    }
    if (expected.requiresClosingRegistry && entry.closesFeedback !== true) {
      throw new Error(`Pass 71 registry does not mark ${expected.evidenceId}/${expected.kind} as closing evidence`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Pass 71 final acceptance registry is incomplete; integrate the exact closing entries before native execution: ${missing.join(', ')}`);
  }
  return byKey;
}

async function liveGrenadeTooling(repositoryRoot, sourceSha) {
  const url = pathToFileURL(resolve(repositoryRoot, 'scripts/qa/pass71-grenade-native-receipt-contract.mjs'));
  const module = await import(`${url.href}?pass71-native-serial=${sourceSha}`);
  if (typeof module.pass71GrenadeNativeToolingHashesAtSource !== 'function') {
    throw new Error('Pass 71 HF-298 tooling hash function is unavailable');
  }
  return module.pass71GrenadeNativeToolingHashesAtSource(repositoryRoot, sourceSha);
}

async function liveHf304ValidationOptions(repositoryRoot, sourceSha) {
  const path = resolve(repositoryRoot, 'scripts/qa/pass71-hf304-live-hosted-evidence-contract.mjs');
  if (!existsSync(path)) throw new Error('Pass 71 HF-304 live-hosted closing contract is not integrated');
  const module = await import(`${pathToFileURL(path).href}?pass71-native-serial=${sourceSha}`);
  if (typeof module.pass71Hf304LiveHostedToolingHashesAtSource !== 'function') {
    throw new Error('Pass 71 HF-304 live-hosted tooling hash function is unavailable');
  }
  const sourceTreeSha = execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
  return Object.freeze({
    pass71Hf304LiveHostedTooling: module.pass71Hf304LiveHostedToolingHashesAtSource(repositoryRoot, sourceSha),
    pass71Hf304LiveHostedSourceTreeSha: sourceTreeSha,
  });
}

export async function createPass71NativeSerialValidationSupport(config, overrides = {}) {
  const registryOptions = { ...(overrides.registryOptions ?? {}) };
  if (!registryOptions.pass71Hf304LiveHostedTooling || !registryOptions.pass71Hf304LiveHostedSourceTreeSha) {
    Object.assign(registryOptions, await liveHf304ValidationOptions(config.repositoryRoot, config.sourceSha));
  }
  return Object.freeze({
    pass71GrenadeTooling: overrides.pass71GrenadeTooling
      ?? await liveGrenadeTooling(config.repositoryRoot, config.sourceSha),
    registryOptions: Object.freeze(registryOptions),
  });
}

function recordsByKey(records) {
  const result = new Map();
  for (const [index, record] of records.entries()) {
    const key = evidenceKey(record);
    const values = result.get(key) ?? [];
    values.push({ index, record });
    result.set(key, values);
  }
  return result;
}

export async function validatePass71NativeSerialRecords(records, options) {
  const expectedSequence = options.expectedSequence;
  assertExpectedSequence(records, expectedSequence, options.label ?? 'Pass 71 serial');
  if (records.some((record) => evidenceKey(record) === evidenceKey({
    evidenceId: 'HF-297', kind: 'pass71-hf297-first-person-arms-component',
  }))) throw new Error('Pass 71 serial rejects the representative non-closing HF-297 component');
  if (records.some((record) => evidenceKey(record) === evidenceKey({
    evidenceId: 'HF-304', kind: 'pass71-hf304-glass-full-mechanical-component',
  }))) throw new Error('Pass 71 serial rejects the non-closing mechanical HF-304 component');

  const registryByKey = assertPass71NativeSerialRegistry(options.registry);
  const contextRecords = options.contextRecords ?? records;
  const grouped = recordsByKey(contextRecords);
  const instants = records.map((record) => assertRecordBoundary(
    record, options.sourceSha, options.previewCreatedAt,
  ));
  if (records.some((record) => record?.evidenceId === 'HF-298')) assertHf298ExactScopes(records);
  const context = {
    sourceSha: options.sourceSha,
    repositoryRoot: options.repositoryRoot,
    options: options.validationSupport.registryOptions,
    recordsByKey: grouped,
    pass71GrenadeTooling: options.validationSupport.pass71GrenadeTooling,
  };
  for (const [index, record] of records.entries()) {
    const entry = registryByKey.get(evidenceKey(record));
    if (!entry) throw new Error(`Pass 71 serial record ${index} is unknown to the acceptance registry`);
    let failures;
    try {
      failures = entry.validate(record, context);
    } catch (error) {
      throw new Error(`Pass 71 serial registry validator threw for ${record.evidenceId}/${record.kind}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Array.isArray(failures)) {
      throw new Error(`Pass 71 serial registry validator returned a non-array for ${record.evidenceId}/${record.kind}`);
    }
    if (failures.length > 0) {
      throw new Error(`Pass 71 serial registry rejected ${record.evidenceId}/${record.kind}: ${failures.join(', ')}`);
    }
  }

  const hf313Index = records.findIndex((record) => record?.evidenceId === 'HF-313');
  if (hf313Index >= 0) {
    const priorRecords = contextRecords.filter((record) => record?.evidenceId !== 'HF-313');
    const priorCompletedAt = priorRecords.map((record) => recordInstants(record).completedAt)
      .sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1);
    if (priorRecords.length !== PASS71_NATIVE_SERIAL_PRE_SEQUENCE.length || !priorCompletedAt
      || Date.parse(instants[hf313Index].startedAt) < Date.parse(priorCompletedAt)) {
      throw new Error('HF-313 must start only after every pre-HF313 record completes');
    }
  }
  return Object.freeze({
    recordCount: records.length,
    recordDigests: Object.freeze(records.map(recordDigest)),
    startedAt: Object.freeze(instants.map(({ startedAt }) => startedAt)),
    completedAt: Object.freeze(instants.map(({ completedAt }) => completedAt)),
  });
}

export function assertPass71NativeSerialJsonBudget(records, maximumBytes = PASS71_NATIVE_SERIAL_MAX_EVIDENCE_BYTES) {
  const json = JSON.stringify(records);
  const jsonBytes = Buffer.byteLength(json, 'utf8');
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || jsonBytes > maximumBytes) {
    throw new Error(`Pass 71 serial native evidence is ${jsonBytes} JSON bytes; maximum is ${maximumBytes}`);
  }
  return Object.freeze({ json, jsonBytes });
}

function writeAtomic(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, bytes);
  renameSync(temporary, path);
}

function writeMinifiedJsonWithSidecar(path, value, maximumBytes = null) {
  const encoded = JSON.stringify(value);
  const jsonBytes = Buffer.byteLength(encoded, 'utf8');
  if (maximumBytes !== null && jsonBytes > maximumBytes) {
    throw new Error(`Pass 71 serial output ${path} is ${jsonBytes} JSON bytes; maximum is ${maximumBytes}`);
  }
  const bytes = Buffer.from(`${encoded}\n`, 'utf8');
  const fileSha256 = sha256(bytes);
  writeAtomic(path, bytes);
  writeAtomic(`${path}.sha256`, Buffer.from(`${fileSha256}  ${basename(path)}\n`, 'utf8'));
  return Object.freeze({ path, jsonBytes, fileBytes: bytes.length, fileSha256 });
}

export function parsePass71NativeSerialChildSummary(stdout, label = 'Pass 71 child') {
  const value = String(stdout).replace(/\u001b\[[0-9;]*m/gu, '').trim();
  const starts = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '{' && (index === 0 || value[index - 1] === '\n')) starts.push(index);
  }
  for (const index of starts.reverse()) {
    try {
      const parsed = JSON.parse(value.slice(index));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Earlier line-start braces may contain nested tool output; keep scanning.
    }
  }
  throw new Error(`${label} did not end with one parseable JSON summary`);
}

function sanitizedChildEnvironment(overrides) {
  const blocked = /^(?:VITE_|PASS71_|PASS70_|PASS66_|QA_|SOURCE_SHA$|RELEASE_PASS$)/iu;
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !blocked.test(key))),
    ...overrides,
  };
}

export async function executePass71NativeSerialChild(laneDefinition, config) {
  const runnerPath = resolve(config.repositoryRoot, laneDefinition.runner);
  if (!existsSync(runnerPath)) throw new Error(`${laneDefinition.id} runner is not integrated: ${laneDefinition.runner}`);
  const child = spawn(process.execPath, [runnerPath, ...laneDefinition.args], {
    cwd: config.repositoryRoot,
    env: sanitizedChildEnvironment(laneDefinition.environment),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  const capture = (stream, target) => stream.on('data', (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > MAX_CHILD_OUTPUT_BYTES) {
      child.kill();
      return;
    }
    const text = chunk.toString('utf8');
    if (target === 'stdout') stdout += text;
    else stderr += text;
    (target === 'stdout' ? process.stdout : process.stderr).write(text);
  });
  capture(child.stdout, 'stdout');
  capture(child.stderr, 'stderr');
  const result = await new Promise((resolveChild, rejectChild) => {
    child.once('error', rejectChild);
    child.once('close', (code, signal) => resolveChild({ code, signal }));
  });
  if (outputBytes > MAX_CHILD_OUTPUT_BYTES) {
    throw new Error(`${laneDefinition.id} exceeded the ${MAX_CHILD_OUTPUT_BYTES}-byte child-output cap`);
  }
  if (result.signal || result.code !== 0) {
    throw new Error(`${laneDefinition.id} child failed (${result.code ?? result.signal}): ${stderr.slice(-4_000)}`);
  }
  return Object.freeze({
    stdout,
    stderr,
    summary: parsePass71NativeSerialChildSummary(stdout, laneDefinition.id),
  });
}

function summaryOutputPath(laneDefinition, execution, config) {
  const summary = execution?.summary;
  if (!summary || typeof summary !== 'object') throw new Error(`${laneDefinition.id} child returned no JSON summary`);
  if (summary.sourceSha !== undefined && summary.sourceSha !== config.sourceSha) {
    throw new Error(`${laneDefinition.id} stdout summary names stale source ${summary.sourceSha}`);
  }
  const passed = summary.status === 'passed' || summary.status === 'PASS' || summary.ok === true;
  if (!passed) throw new Error(`${laneDefinition.id} stdout summary did not report a pass`);
  return assertLaneOutputPath(laneDefinition, summary[laneDefinition.output.pathField], config);
}

export function assertPass71NativeSerialSource(config) {
  const git = (...args) => execFileSync('git', ['-C', config.repositoryRoot, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024,
  }).trim();
  const head = git('rev-parse', 'HEAD');
  const status = git('status', '--porcelain', '--untracked-files=all');
  if (head !== config.sourceSha || status !== '') {
    throw new Error(`Pass 71 serial requires one completely clean exact candidate A (${head}/${config.sourceSha}; clean=${status === ''})`);
  }
  const type = git('cat-file', '-t', config.sourceSha);
  if (type !== 'commit') throw new Error(`Pass 71 serial expected source is not a commit: ${config.sourceSha}`);
  return head;
}

export async function loadPass71NativeSerialRegistry(config) {
  const path = resolve(config.repositoryRoot, 'scripts/release/acceptance-gate.mjs');
  const module = await import(`${pathToFileURL(path).href}?pass71-native-serial=${config.sourceSha}`);
  return module.PASS71_NATIVE_EVIDENCE_REGISTRY;
}

function stateConfiguration(config, lanePlan) {
  return {
    sourceSha: config.sourceSha,
    previewCreatedAt: config.previewCreatedAt,
    machine: config.machine,
    browsers: config.browsers,
    catalog: PASS71_NATIVE_SERIAL_RECORD_CATALOG,
    lanes: lanePlan.map((entry) => ({
      id: entry.id,
      runner: entry.runner,
      args: entry.args,
      environment: entry.environment,
      ports: entry.ports,
      expectedSequence: entry.expectedSequence,
      output: entry.output.kind === 'fixed'
        ? { kind: entry.output.kind, path: normalizePathForState(config.repositoryRoot, entry.output.absolutePath) }
        : { kind: entry.output.kind },
    })),
  };
}

function newState(config, lanePlan, now) {
  const stateConfig = stateConfiguration(config, lanePlan);
  return {
    schemaVersion: 1,
    kind: 'pass71-native-evidence-serial-state',
    sourceSha: config.sourceSha,
    previewCreatedAt: config.previewCreatedAt,
    machine: config.machine,
    configurationSha256: canonicalDigest(stateConfig),
    createdAt: now(),
    updatedAt: now(),
    lanes: {},
    readyForApproval: null,
  };
}

function readOrCreateState(statePath, config, lanePlan, now) {
  const expectedConfigurationSha256 = canonicalDigest(stateConfiguration(config, lanePlan));
  if (!existsSync(statePath)) return newState(config, lanePlan, now);
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (state?.schemaVersion !== 1 || state?.kind !== 'pass71-native-evidence-serial-state'
    || state.sourceSha !== config.sourceSha || state.previewCreatedAt !== config.previewCreatedAt
    || state.machine !== config.machine || state.configurationSha256 !== expectedConfigurationSha256
    || !state.lanes || typeof state.lanes !== 'object' || Array.isArray(state.lanes)) {
    throw new Error(`Pass 71 serial checkpoint does not match this exact candidate/configuration: ${statePath}`);
  }
  return state;
}

function writeState(statePath, state, now) {
  state.updatedAt = now();
  writeAtomic(statePath, Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8'));
}

function evidenceMetadata(config, laneDefinition, outputPath, evidence) {
  const records = recordsFromEvidence(laneDefinition, evidence.value);
  return Object.freeze({
    outputPath: normalizePathForState(config.repositoryRoot, outputPath),
    outputFileSha256: evidence.fileSha256,
    outputFileBytes: evidence.bytes.length,
    recordSequence: exactSequence(records),
    recordDigests: records.map(recordDigest),
  });
}

async function validateLaneOutput(
  laneDefinition,
  outputPath,
  config,
  registry,
  validationSupport,
  expectedState = null,
  contextRecords = null,
) {
  const exactPath = assertLaneOutputPath(laneDefinition, outputPath, config);
  const evidence = readJsonEvidence(exactPath);
  const records = recordsFromEvidence(laneDefinition, evidence.value);
  const metadata = evidenceMetadata(config, laneDefinition, exactPath, evidence);
  if (expectedState && (expectedState.outputPath !== metadata.outputPath
    || expectedState.outputFileSha256 !== metadata.outputFileSha256
    || expectedState.outputFileBytes !== metadata.outputFileBytes
    || !sameJson(expectedState.recordSequence, metadata.recordSequence)
    || !sameJson(expectedState.recordDigests, metadata.recordDigests))) {
    throw new Error(`${laneDefinition.id} checkpointed evidence bytes or canonical digests changed`);
  }
  await validatePass71NativeSerialRecords(records, {
    label: laneDefinition.id,
    expectedSequence: laneDefinition.expectedSequence,
    registry,
    sourceSha: config.sourceSha,
    previewCreatedAt: config.previewCreatedAt,
    repositoryRoot: config.repositoryRoot,
    validationSupport,
    contextRecords: contextRecords ? [...contextRecords, ...records] : records,
  });
  if (laneDefinition.id === 'hf303') {
    const expectedRunName = `${config.sourceSha}-${records[0].startedAt.replaceAll(':', '-').replace('.000Z', 'Z')}`;
    if (basename(dirname(exactPath)) !== expectedRunName) {
      throw new Error('HF-303 stdout receipt path timestamp does not match the receipt startedAt');
    }
  }
  return Object.freeze({ exactPath, records, metadata });
}

function adoptionPath(laneDefinition, config) {
  if (!config.adoptExisting) return null;
  if (laneDefinition.output.kind === 'fixed') {
    return existsSync(laneDefinition.output.absolutePath) ? laneDefinition.output.absolutePath : null;
  }
  if (laneDefinition.id === 'hf303' && config.adoptHf303Path) {
    return assertHf303Path(config, config.adoptHf303Path);
  }
  return null;
}

async function completeOneLane({
  laneDefinition,
  config,
  state,
  statePath,
  registry,
  validationSupport,
  sourceGuard,
  executeLane,
  now,
  contextRecords = null,
}) {
  sourceGuard(config);
  const prior = state.lanes[laneDefinition.id];
  if (prior?.status === 'complete') {
    const path = resolve(config.repositoryRoot, prior.outputPath);
    const validated = await validateLaneOutput(
      laneDefinition, path, config, registry, validationSupport, prior, contextRecords,
    );
    sourceGuard(config);
    return validated.records;
  }

  const adoptPath = adoptionPath(laneDefinition, config);
  if (adoptPath) {
    const validated = await validateLaneOutput(
      laneDefinition, adoptPath, config, registry, validationSupport, null, contextRecords,
    );
    sourceGuard(config);
    state.lanes[laneDefinition.id] = {
      status: 'complete',
      adopted: true,
      attempts: prior?.attempts ?? 0,
      completedAt: now(),
      ...validated.metadata,
    };
    writeState(statePath, state, now);
    return validated.records;
  }

  state.lanes[laneDefinition.id] = {
    status: 'running',
    adopted: false,
    attempts: (prior?.attempts ?? 0) + 1,
    startedAt: now(),
  };
  writeState(statePath, state, now);
  try {
    const execution = await executeLane(laneDefinition, config);
    const outputPath = summaryOutputPath(laneDefinition, execution, config);
    sourceGuard(config);
    const validated = await validateLaneOutput(
      laneDefinition, outputPath, config, registry, validationSupport, null, contextRecords,
    );
    sourceGuard(config);
    state.lanes[laneDefinition.id] = {
      status: 'complete',
      adopted: false,
      attempts: state.lanes[laneDefinition.id].attempts,
      completedAt: now(),
      summarySha256: canonicalDigest(execution.summary),
      ...validated.metadata,
    };
    writeState(statePath, state, now);
    return validated.records;
  } catch (error) {
    state.lanes[laneDefinition.id] = {
      ...state.lanes[laneDefinition.id],
      status: 'failed',
      failedAt: now(),
      error: (error instanceof Error ? error.message : String(error)).slice(0, 4_000),
    };
    writeState(statePath, state, now);
    throw error;
  }
}

function validateConfiguration(config) {
  if (!config || !isAbsolute(config.repositoryRoot) || !SHA40.test(config.sourceSha ?? '')
    || !isIso(config.previewCreatedAt) || config.machine !== 'dave-gaming-pc') {
    throw new Error('Pass 71 serial configuration requires absolute repositoryRoot, exact source SHA, immutable preview-created-at, and logical machine dave-gaming-pc');
  }
  for (const name of ['edge', 'chrome', 'firefox', 'geckodriver']) {
    if (!isAbsolute(config.browsers?.[name] ?? '')) throw new Error(`Pass 71 serial requires an explicit absolute ${name} executable path`);
  }
  if (Date.parse(config.previewCreatedAt) > Date.now()) {
    throw new Error('Pass 71 immutable preview-created-at cannot be in the future');
  }
}

export async function runPass71NativeEvidenceSerial(config, dependencies = {}) {
  validateConfiguration(config);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const sourceGuard = dependencies.sourceGuard ?? assertPass71NativeSerialSource;
  const executeLane = dependencies.executeLane ?? executePass71NativeSerialChild;
  const lanePlan = dependencies.lanePlan ?? createPass71NativeSerialLanePlan(config);
  if (lanePlan.at(-1)?.id !== 'hf312' || lanePlan.some((entry) => entry.id === 'hf313')) {
    throw new Error('Pass 71 serial lane plan must end pre-HF313 with HF-312');
  }
  assertPass71NativeSerialPorts();
  sourceGuard(config);
  const registry = dependencies.registry ?? await loadPass71NativeSerialRegistry(config);
  assertPass71NativeSerialRegistry(registry);
  const validationSupport = dependencies.validationSupport
    ?? await createPass71NativeSerialValidationSupport(config, dependencies.validationSupportOverrides);
  const expectedArtifactRoot = resolve(
    config.repositoryRoot, 'artifacts/pass71/native-evidence-serial', config.sourceSha,
  );
  const artifactRoot = resolve(config.artifactRoot ?? expectedArtifactRoot);
  if (!samePath(artifactRoot, expectedArtifactRoot)) {
    throw new Error(`Pass 71 serial checkpoint/artifact root must be exactly ${expectedArtifactRoot}`);
  }
  mkdirSync(artifactRoot, { recursive: true });
  const statePath = resolve(artifactRoot, 'state.json');
  const state = readOrCreateState(statePath, config, lanePlan, now);
  writeState(statePath, state, now);

  const recordsByLane = new Map();
  for (const laneDefinition of lanePlan) {
    const records = await completeOneLane({
      laneDefinition, config, state, statePath, registry, validationSupport,
      sourceGuard, executeLane, now,
    });
    recordsByLane.set(laneDefinition.id, records);
  }
  const preRecords = lanePlan.flatMap((entry) => recordsByLane.get(entry.id) ?? []);
  await validatePass71NativeSerialRecords(preRecords, {
    label: 'Pass 71 pre-HF313 array',
    expectedSequence: PASS71_NATIVE_SERIAL_PRE_SEQUENCE,
    registry,
    sourceSha: config.sourceSha,
    previewCreatedAt: config.previewCreatedAt,
    repositoryRoot: config.repositoryRoot,
    validationSupport,
  });
  assertPass71NativeSerialJsonBudget(preRecords);
  const preArrayPath = resolve(artifactRoot, 'native-evidence-pre-hf313.json');
  const preArray = writeMinifiedJsonWithSidecar(
    preArrayPath, preRecords, PASS71_NATIVE_SERIAL_MAX_EVIDENCE_BYTES,
  );

  const hf313Lane = createHf313Lane(config, preArrayPath);
  const hf313Records = await completeOneLane({
    laneDefinition: hf313Lane, config, state, statePath, registry, validationSupport,
    sourceGuard, executeLane, now, contextRecords: preRecords,
  });
  const finalRecords = [...preRecords, ...hf313Records];
  const validation = await validatePass71NativeSerialRecords(finalRecords, {
    label: 'Pass 71 final native evidence array',
    expectedSequence: PASS71_NATIVE_SERIAL_FINAL_SEQUENCE,
    registry,
    sourceSha: config.sourceSha,
    previewCreatedAt: config.previewCreatedAt,
    repositoryRoot: config.repositoryRoot,
    validationSupport,
  });
  assertPass71NativeSerialJsonBudget(finalRecords);
  const finalArrayPath = resolve(artifactRoot, 'native-evidence-final.json');
  const finalArray = writeMinifiedJsonWithSidecar(
    finalArrayPath, finalRecords, PASS71_NATIVE_SERIAL_MAX_EVIDENCE_BYTES,
  );
  sourceGuard(config);

  const latestCompletedAt = [...validation.completedAt]
    .sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1);
  const emittedAt = now();
  if (!latestCompletedAt || !isIso(emittedAt) || Date.parse(emittedAt) < Date.parse(latestCompletedAt)) {
    throw new Error('Pass 71 ready-for-approval timestamp must follow every evidence completion');
  }
  const readiness = {
    schemaVersion: 1,
    kind: 'pass71-native-evidence-ready-for-approval',
    status: 'ready-for-approval',
    sourceSha: config.sourceSha,
    previewCreatedAt: config.previewCreatedAt,
    machine: config.machine,
    preHf313RecordCount: preRecords.length,
    finalRecordCount: finalRecords.length,
    preArray: {
      path: normalizePathForState(config.repositoryRoot, preArray.path),
      jsonBytes: preArray.jsonBytes,
      fileSha256: preArray.fileSha256,
    },
    finalArray: {
      path: normalizePathForState(config.repositoryRoot, finalArray.path),
      jsonBytes: finalArray.jsonBytes,
      fileSha256: finalArray.fileSha256,
    },
    allEvidenceCompletedAt: latestCompletedAt,
    emittedAt,
    approvalBoundary: {
      approvalRecorded: false,
      requiresApprovedAtAfter: latestCompletedAt,
      ownerInspectionClaim: 'not-made',
      nextMutationBoundary: 'candidate-B-may-change-only-acceptance/pass-71.json',
    },
  };
  const readinessPath = resolve(artifactRoot, 'ready-for-approval.json');
  const readinessFile = writeMinifiedJsonWithSidecar(readinessPath, readiness);
  state.readyForApproval = {
    status: readiness.status,
    emittedAt,
    path: normalizePathForState(config.repositoryRoot, readinessPath),
    fileSha256: readinessFile.fileSha256,
    approvalRecorded: false,
  };
  writeState(statePath, state, now);
  return Object.freeze({
    ok: true,
    status: readiness.status,
    sourceSha: config.sourceSha,
    previewCreatedAt: config.previewCreatedAt,
    statePath,
    preArray,
    finalArray,
    readiness: Object.freeze({ ...readiness, path: readinessPath, fileSha256: readinessFile.fileSha256 }),
  });
}

function parseArgs(argv) {
  const allowed = new Set([
    'expected-source-sha', 'preview-created-at', 'machine',
    'edge-executable', 'chrome-executable', 'firefox-executable', 'geckodriver-executable',
    'adopt-existing', 'adopt-hf303-path', 'help',
  ]);
  const booleans = new Set(['adopt-existing', 'help']);
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) throw new Error(`Pass 71 serial rejected argument: ${token ?? '(missing)'}`);
    const equals = token.indexOf('=');
    const name = token.slice(2, equals > 2 ? equals : undefined);
    if (!allowed.has(name) || Object.hasOwn(values, name)) throw new Error(`Pass 71 serial rejected --${name}`);
    if (booleans.has(name)) {
      if (equals > 2) throw new Error(`Pass 71 serial --${name} does not accept a value`);
      values[name] = true;
      continue;
    }
    const value = equals > 2 ? token.slice(equals + 1) : argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Pass 71 serial --${name} requires one value`);
    values[name] = value;
    if (equals < 0) index += 1;
  }
  return values;
}

function assertExecutable(path, expectedName, label) {
  if (!isAbsolute(path ?? '') || !existsSync(path) || !lstatSync(path).isFile()
    || basename(path).toLowerCase() !== expectedName) {
    throw new Error(`Pass 71 serial requires explicit installed ${label} path ending in ${expectedName}`);
  }
  return resolve(path);
}

export function parsePass71NativeSerialConfiguration(argv, repositoryRoot = PASS71_NATIVE_SERIAL_REPOSITORY_ROOT) {
  const values = parseArgs(argv);
  if (values.help) return Object.freeze({ help: true });
  const sourceSha = values['expected-source-sha'];
  const previewCreatedAt = values['preview-created-at'];
  const machine = values.machine;
  if (!SHA40.test(sourceSha ?? '') || !isIso(previewCreatedAt) || machine !== 'dave-gaming-pc') {
    throw new Error('Pass 71 serial requires --expected-source-sha <A> --preview-created-at <ISO UTC> --machine dave-gaming-pc');
  }
  const config = {
    repositoryRoot: resolve(repositoryRoot),
    sourceSha,
    previewCreatedAt,
    machine,
    browsers: {
      edge: assertExecutable(values['edge-executable'], 'msedge.exe', 'Microsoft Edge'),
      chrome: assertExecutable(values['chrome-executable'], 'chrome.exe', 'Google Chrome'),
      firefox: assertExecutable(values['firefox-executable'], 'firefox.exe', 'Mozilla Firefox'),
      geckodriver: assertExecutable(values['geckodriver-executable'], 'geckodriver.exe', 'GeckoDriver'),
    },
    adoptExisting: values['adopt-existing'] === true,
    adoptHf303Path: values['adopt-hf303-path'] ? resolve(values['adopt-hf303-path']) : null,
  };
  if (config.adoptHf303Path && !config.adoptExisting) {
    throw new Error('--adopt-hf303-path requires --adopt-existing; HF-303 is never selected by latest-file glob');
  }
  validateConfiguration(config);
  return Object.freeze({ ...config, browsers: Object.freeze(config.browsers) });
}

export const PASS71_NATIVE_SERIAL_USAGE = `Usage:
  node scripts/qa/run-pass71-native-evidence-serial.mjs \\
    --expected-source-sha <candidate-A-SHA> \\
    --preview-created-at <immutable-preview-ISO-UTC> \\
    --machine dave-gaming-pc \\
    --edge-executable <absolute-msedge.exe> \\
    --chrome-executable <absolute-chrome.exe> \\
    --firefox-executable <absolute-firefox.exe> \\
    --geckodriver-executable <absolute-geckodriver.exe>

Optional exact reuse:
  --adopt-existing
  --adopt-hf303-path <exact-path-reported-by-HF303-stdout>

The final acceptance registry must already contain the closing HF-304 live-hosted and HF-308 missile entries.
The assembler writes no approval; it emits a ready-for-approval boundary only after all 22 records validate.`;

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  try {
    const config = parsePass71NativeSerialConfiguration(process.argv.slice(2));
    if (config.help) {
      process.stdout.write(`${PASS71_NATIVE_SERIAL_USAGE}\n`);
    } else {
      const result = await runPass71NativeEvidenceSerial(config);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
