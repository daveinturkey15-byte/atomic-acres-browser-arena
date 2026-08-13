import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const PASS71_AUDIO_NATIVE_MACHINE_ID = 'dave-gaming-pc';
export const PASS71_AUDIO_NATIVE_MACHINE_HOSTNAME_SHA256 = createHash('sha256')
  .update('desktop-vi3cr5q', 'utf8')
  .digest('hex');

export const PASS71_AUDIO_NATIVE = Object.freeze({
  schemaVersion: 2,
  evidenceId: 'HF-302',
  kind: 'pass71-hf302-audio-native-long-run',
  contract: 'atomic-acres/pass71-hf302-audio-native-long-run@2',
  feedbackId: 'HF-302',
  schema: 'atomic-acres/pass71-audio-native@2',
  arenaSchema: 'atomic-acres/pass71-audio-native-arena@1',
  arenas: Object.freeze(['atomic-acres', 'rustworks-1v1', 'skyline-terminal', 'gun-range']),
  events: Object.freeze(['start', 'combat', 'grenade', 'glass', 'support', 'rematch', 'arena-transition']),
  durationMsPerArena: 65_000,
  profile: Object.freeze({ name: 'Quality', renderer: 'webgpu', render: 'blender' }),
  retainedSampleCount: 16,
  toolingPaths: Object.freeze([
    'src/audio.ts', 'tests/e2e/pass71-audio-native-long-run.spec.ts',
    'scripts/qa/pass71-audio-native-receipt-contract.mjs', 'scripts/qa/run-pass71-audio-native-receipt.mjs',
    'scripts/qa/pass71-edge-executable-identity.mjs',
    'scripts/qa/run-playwright-with-topology.mjs', 'scripts/release/stage-release-topology.mjs',
    'playwright.config.ts', 'release-channels.json', 'vite.config.ts', 'package.json', 'package-lock.json',
  ]),
});

export const PASS71_AUDIO_NATIVE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_AUDIO_NATIVE.evidenceId,
  kind: PASS71_AUDIO_NATIVE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export function pass71AudioNativeToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('HF-302 tooling source must be a full SHA');
  return PASS71_AUDIO_NATIVE.toolingPaths.map((path) => ({
    path,
    sha256: createHash('sha256').update(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    )).digest('hex'),
  }));
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function exactKeys(value, keys) {
  return value && typeof value === 'object'
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function finite(value, lower = Number.NEGATIVE_INFINITY, upper = Number.POSITIVE_INFINITY) {
  return Number.isFinite(value) && value >= lower && value <= upper;
}

function validProbe(probe) {
  return exactKeys(probe, [
    'available', 'sampleRate', 'fftSize', 'rms', 'peak', 'crestFactor', 'spectralFlatness',
    'highFrequencyEnergyRatio', 'dominantFrequencyHz', 'dominantPowerRatio',
    'narrowbandTonePresent', 'suspiciousBroadbandHiss', 'logBandsDb', 'timeDomainSamples',
  ]) && probe.available === true && probe.sampleRate >= 8_000 && probe.fftSize === 2_048
    && finite(probe.rms, 0, 1) && finite(probe.peak, probe.rms, 1)
    && Array.isArray(probe.logBandsDb) && probe.logBandsDb.length === PASS71_AUDIO_NATIVE.retainedSampleCount
    && probe.logBandsDb.every((value) => finite(value, -120, 0))
    && Array.isArray(probe.timeDomainSamples) && probe.timeDomainSamples.length === PASS71_AUDIO_NATIVE.retainedSampleCount
    && probe.timeDomainSamples.every((value) => finite(value, -1, 1))
    && probe.suspiciousBroadbandHiss === false;
}

function validLifecycle(lifecycle) {
  return lifecycle && ['voiceRegistrations', 'voiceDisposals', 'continuousOwnerRegistrations',
    'continuousOwnerDisposals', 'continuousNodeDisposals'].every((key) => Number.isSafeInteger(lifecycle[key]) && lifecycle[key] >= 0)
    && exactKeys(lifecycle.owners, ['arena', 'combatFeedback', 'nodes'])
    && Object.values(lifecycle.owners).every((value) => Number.isSafeInteger(value) && value >= 0);
}

function validPhase(phase) {
  return exactKeys(phase, ['elapsedMs', 'frameCount', 'contextState', 'outputProbe', 'runtime', 'lifecycle', 'counters', 'buses'])
    && Number.isSafeInteger(phase.elapsedMs) && phase.elapsedMs >= 0
    && Number.isSafeInteger(phase.frameCount) && phase.frameCount > 0
    && phase.contextState === 'running'
    && validProbe(phase.outputProbe)
    && phase.runtime && Number.isSafeInteger(phase.runtime.voices) && phase.runtime.voices >= 0
    && phase.runtime.voices <= phase.runtime.globalCap
    && phase.runtime.retainedSources === phase.lifecycle.owners.arena + phase.lifecycle.owners.combatFeedback
    && phase.runtime.spatialChains <= phase.runtime.spatialCap
    && validLifecycle(phase.lifecycle)
    && exactKeys(phase.counters, ['glassPulses', 'grenadeAutomations', 'supportCues', 'countdownCues'])
    && Object.values(phase.counters).every((value) => Number.isSafeInteger(value) && value >= 0)
    && phase.buses && ['master', 'sfx', 'movement', 'ui', 'announcements', 'ambience', 'menu-music', 'game-music']
      .every((key) => finite(phase.buses[key]?.effectiveGain, 0, 1) && phase.buses[key]?.muted === false);
}

function validLockedStartPhase(phase) {
  return exactKeys(phase, ['elapsedMs', 'frameCount', 'contextState', 'outputProbe', 'runtime', 'lifecycle', 'counters', 'buses'])
    && Number.isSafeInteger(phase.elapsedMs) && phase.elapsedMs >= 0
    && Number.isSafeInteger(phase.frameCount) && phase.frameCount > 0
    && phase.contextState === 'locked' && phase.outputProbe?.available === false
    && Array.isArray(phase.outputProbe?.logBandsDb) && phase.outputProbe.logBandsDb.length === 0
    && Array.isArray(phase.outputProbe?.timeDomainSamples) && phase.outputProbe.timeDomainSamples.length === 0
    && validLifecycle(phase.lifecycle)
    && exactKeys(phase.counters, ['glassPulses', 'grenadeAutomations', 'supportCues', 'countdownCues']);
}

function validEvent(event, expectedId) {
  if (!exactKeys(event, ['id', 'action', 'before', 'during', 'after', 'audibleDelta', 'returnedToBaseline'])) return false;
  if (event.id !== expectedId || typeof event.action !== 'string' || event.action.length === 0) return false;
  if (!(expectedId === 'start' ? validLockedStartPhase(event.before) : validPhase(event.before))
    || !validPhase(event.during) || !validPhase(event.after)) return false;
  if (!(event.before.elapsedMs <= event.during.elapsedMs && event.during.elapsedMs <= event.after.elapsedMs)) return false;
  if (!(event.before.frameCount <= event.during.frameCount && event.during.frameCount <= event.after.frameCount)) return false;
  if (!finite(event.audibleDelta, 0.000001, 1) || event.returnedToBaseline !== true) return false;
  if (event.during.outputProbe.peak < event.before.outputProbe.peak + event.audibleDelta) return false;
  if (event.after.outputProbe.rms > Math.max(0.004, event.before.outputProbe.rms + 0.002)) return false;
  if (event.after.lifecycle.voiceDisposals < event.before.lifecycle.voiceDisposals) return false;
  if (event.after.lifecycle.continuousOwnerDisposals < event.before.lifecycle.continuousOwnerDisposals) return false;
  const semanticCounterAdvanced = expectedId === 'combat'
    ? event.after.lifecycle.voiceRegistrations > event.before.lifecycle.voiceRegistrations
    : expectedId === 'grenade'
      ? event.after.counters.grenadeAutomations > event.before.counters.grenadeAutomations
      : expectedId === 'glass'
        ? event.after.counters.glassPulses > event.before.counters.glassPulses
        : expectedId === 'support'
          ? event.after.counters.supportCues > event.before.counters.supportCues
          : event.after.counters.countdownCues > event.before.counters.countdownCues;
  return semanticCounterAdvanced;
}

function isoTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function pass71AudioNativeFailures(receipt, expected = {}) {
  const failures = [];
  const expectedSourceSha = typeof expected === 'string' ? expected : expected.sourceSha;
  const expectedTooling = typeof expected === 'string' ? null : expected.tooling;
  if (!exactKeys(receipt, ['schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'schema', 'status',
    'startedAt', 'completedAt', 'invocation', 'environment', 'sourceSha', 'endingSha', 'sourceTree', 'sourceBranch', 'cleanBefore', 'cleanAfter',
    'servedCandidate', 'profile', 'browser', 'durationMsPerArena', 'arenas', 'tooling', 'arenaReceipts', 'evidenceDigest'])) {
    failures.push('receipt shape is not exact'); return failures;
  }
  if (receipt.schemaVersion !== PASS71_AUDIO_NATIVE.schemaVersion
    || receipt.evidenceId !== PASS71_AUDIO_NATIVE.evidenceId
    || receipt.kind !== PASS71_AUDIO_NATIVE.kind
    || receipt.contract !== PASS71_AUDIO_NATIVE.contract
    || receipt.feedbackId !== PASS71_AUDIO_NATIVE.feedbackId
    || receipt.schema !== PASS71_AUDIO_NATIVE.schema || receipt.status !== 'passed') failures.push('schema/status mismatch');
  if (receipt.sourceSha !== expectedSourceSha || receipt.endingSha !== expectedSourceSha || !SHA40.test(expectedSourceSha ?? '')) failures.push('source SHA mismatch');
  if (!SHA40.test(receipt.sourceTree ?? '') || typeof receipt.sourceBranch !== 'string' || receipt.sourceBranch.length === 0) failures.push('source tree/branch missing');
  if (!isoTimestamp(receipt.startedAt) || !isoTimestamp(receipt.completedAt)
    || Date.parse(receipt.startedAt) > Date.parse(receipt.completedAt)) failures.push('run timestamps invalid');
  if (receipt.invocation !== 'npm run qa:pass71:audio-native -- --expected-source-sha=<A> --browser=msedge --machine=dave-gaming-pc') failures.push('invocation mismatch');
  if (!exactKeys(receipt.environment, ['machine', 'hostnameSha256', 'platform', 'arch'])
    || receipt.environment.machine !== PASS71_AUDIO_NATIVE_MACHINE_ID
    || receipt.environment.hostnameSha256 !== PASS71_AUDIO_NATIVE_MACHINE_HOSTNAME_SHA256
    || receipt.environment.platform !== 'win32' || receipt.environment.arch !== 'x64') {
    failures.push('release machine or physical-host attestation mismatch');
  }
  if (receipt.cleanBefore !== true || receipt.cleanAfter !== true) failures.push('source was not clean throughout');
  if (!exactKeys(receipt.servedCandidate, ['schemaVersion', 'channel', 'releasePass', 'sourceSha', 'treeSha256', 'exactRootFileCount', 'path'])
    || receipt.servedCandidate?.sourceSha !== expectedSourceSha || receipt.servedCandidate?.channel !== 'the-big-one'
    || receipt.servedCandidate?.releasePass !== 'PASS 71' || receipt.servedCandidate?.schemaVersion !== 4
    || !SHA256.test(receipt.servedCandidate?.treeSha256 ?? '')
    || !Number.isSafeInteger(receipt.servedCandidate?.exactRootFileCount) || receipt.servedCandidate.exactRootFileCount < 1
    || receipt.servedCandidate?.path !== 'channels/the-big-one') failures.push('served candidate mismatch');
  if (canonicalJson(receipt.profile) !== canonicalJson(PASS71_AUDIO_NATIVE.profile)) failures.push('Quality profile mismatch');
  const exactBrowserIdentity = exactKeys(receipt.browser, [
    'name', 'installed', 'executablePath', 'executableSha256', 'productVersion', 'installRoot',
    'authenticodeStatus', 'authenticodeSigner', 'version', 'userAgent', 'softwareRenderer',
  ]) && receipt.browser?.name === 'msedge'
    && /\/msedge\.exe$/iu.test(receipt.browser?.executablePath ?? '') && /\bEdg\//u.test(receipt.browser?.userAgent ?? '')
    && /[\\/]Microsoft[\\/]Edge[\\/]Application$/iu.test(receipt.browser?.installRoot ?? '')
    && receipt.browser?.authenticodeStatus === 'Valid' && /\bMicrosoft Corporation\b/iu.test(receipt.browser?.authenticodeSigner ?? '');
  if (!exactBrowserIdentity || receipt.browser?.installed !== true
    || receipt.browser?.softwareRenderer !== false || !SHA256.test(receipt.browser?.executableSha256 ?? '')
    || !/^\d+(?:\.\d+){3}$/u.test(receipt.browser?.productVersion ?? '')
    || !receipt.browser?.executablePath || !receipt.browser?.version || !receipt.browser?.userAgent
    || receipt.browser.productVersion.split('.')[0] !== String(receipt.browser.version).split('.')[0]
    || receipt.browser.productVersion.split('.')[0] !== String(receipt.browser.userAgent).match(/Edg\/(\d+)/u)?.[1]) {
    failures.push('installed nonsoftware browser identity missing');
  }
  if (receipt.durationMsPerArena !== PASS71_AUDIO_NATIVE.durationMsPerArena
    || canonicalJson(receipt.arenas) !== canonicalJson(PASS71_AUDIO_NATIVE.arenas)) failures.push('arena/duration mismatch');
  if (!Array.isArray(receipt.tooling)
    || canonicalJson(receipt.tooling.map((entry) => entry.path)) !== canonicalJson(PASS71_AUDIO_NATIVE.toolingPaths)
    || receipt.tooling.some((entry) => !entry.path || !SHA256.test(entry.sha256 ?? ''))
    || (expectedTooling && canonicalJson(receipt.tooling) !== canonicalJson(expectedTooling))) failures.push('tooling identity missing');
  if (!Array.isArray(receipt.arenaReceipts) || receipt.arenaReceipts.length !== PASS71_AUDIO_NATIVE.arenas.length) failures.push('arena receipts missing');
  else for (const [index, arena] of receipt.arenaReceipts.entries()) {
    if (!exactKeys(arena, ['schema', 'status', 'sourceSha', 'servedCandidate', 'arenaId', 'transitionArenaId', 'browserName', 'browserVersion',
      'userAgent', 'adapter', 'physicalAudioUnlock', 'profile', 'durationMs', 'timeline', 'postMinuteSamples', 'clientRuntimeLog', 'faults'])) failures.push(`${PASS71_AUDIO_NATIVE.arenas[index]} shape mismatch`);
    if (arena.schema !== PASS71_AUDIO_NATIVE.arenaSchema || arena.status !== 'PASS' || arena.sourceSha !== expectedSourceSha
      || arena.arenaId !== PASS71_AUDIO_NATIVE.arenas[index] || arena.durationMs !== PASS71_AUDIO_NATIVE.durationMsPerArena
      || arena.transitionArenaId !== PASS71_AUDIO_NATIVE.arenas[(index + 1) % PASS71_AUDIO_NATIVE.arenas.length]
      || arena.physicalAudioUnlock !== true || canonicalJson(arena.profile) !== canonicalJson(PASS71_AUDIO_NATIVE.profile)) failures.push(`${arena.arenaId ?? index} identity mismatch`);
    if (arena.servedCandidate?.sourceSha !== expectedSourceSha || arena.browserName !== receipt.browser.name
      || arena.browserVersion !== receipt.browser.version || arena.userAgent !== receipt.browser.userAgent) failures.push(`${arena.arenaId ?? index} browser/served mismatch`);
    if (arena.adapter?.software === true || typeof arena.adapter?.description !== 'string') failures.push(`${arena.arenaId ?? index} software/unknown adapter`);
    if (!Array.isArray(arena.timeline) || arena.timeline.length !== PASS71_AUDIO_NATIVE.events.length) failures.push(`${arena.arenaId ?? index} timeline missing`);
    else PASS71_AUDIO_NATIVE.events.forEach((eventId, eventIndex) => {
      if (!validEvent(arena.timeline[eventIndex], eventId)) failures.push(`${arena.arenaId ?? index}/${eventId} invalid`);
    });
    if (!Array.isArray(arena.postMinuteSamples) || arena.postMinuteSamples.length !== 6 || arena.postMinuteSamples.some((sample, sampleIndex) => (
      !validPhase(sample) || Math.abs(sample.elapsedMs - (60_000 + sampleIndex * 1_000)) > 250
    ))) failures.push(`${arena.arenaId ?? index} post-minute samples invalid`);
    if (arena.clientRuntimeLog?.length !== 0 || arena.faults?.length !== 0) failures.push(`${arena.arenaId ?? index} runtime faults`);
  }
  const withoutDigest = { ...receipt };
  delete withoutDigest.evidenceDigest;
  if (receipt.evidenceDigest !== sha256Canonical(withoutDigest)) failures.push('evidence digest mismatch');
  return failures;
}

export function assertPass71AudioNativeReceipt(receipt, expectedSourceSha) {
  const failures = pass71AudioNativeFailures(receipt, expectedSourceSha);
  if (failures.length > 0) throw new Error(`Invalid Pass 71 audio-native receipt: ${failures.join('; ')}`);
  return receipt;
}

export function createPass71AudioNativeEvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_AUDIO_NATIVE_DESCRIPTOR,
    validate(record, context) {
      try {
        const tooling = context?.options?.pass71AudioNativeTooling
          ?? pass71AudioNativeToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha);
        return pass71AudioNativeFailures(record, { sourceSha: context?.sourceSha, tooling });
      } catch (error) {
        return [`hf302-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_AUDIO_NATIVE_REGISTRY_ENTRY = createPass71AudioNativeEvidenceRegistryEntry();

function audioFixturePhase(elapsedMs, peak, registrations, disposals) {
  const buses = Object.fromEntries(['master', 'sfx', 'movement', 'ui', 'announcements', 'ambience', 'menu-music', 'game-music']
    .map((id) => [id, { configuredGain: 100, muted: false, effectiveGain: 0.25 }]));
  return {
    elapsedMs, frameCount: 10 + elapsedMs, contextState: 'running',
    outputProbe: {
      available: true, sampleRate: 48_000, fftSize: 2_048, rms: peak / 2, peak, crestFactor: 2,
      spectralFlatness: 0.1, highFrequencyEnergyRatio: 0.1, dominantFrequencyHz: 440,
      dominantPowerRatio: 0.5, narrowbandTonePresent: false, suspiciousBroadbandHiss: false,
      logBandsDb: Array(16).fill(-80), timeDomainSamples: Array(16).fill(0.001),
    },
    runtime: { voices: 12, retainedSources: 12, retainedAudibleGains: 0, spatialChains: 0, spatialPoolSize: 0, stolen: 0, dropped: 0, globalCap: 48, spatialCap: 18 },
    lifecycle: { voiceRegistrations: registrations, voiceDisposals: disposals, continuousOwnerRegistrations: 12, continuousOwnerDisposals: 0, continuousNodeDisposals: 0, owners: { arena: 0, combatFeedback: 12, nodes: 20 } },
    counters: { glassPulses: registrations, grenadeAutomations: registrations, supportCues: registrations, countdownCues: registrations },
    buses,
  };
}

export function createPass71AudioNativeEvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const hash = 'b'.repeat(64);
  const tooling = options.tooling ?? PASS71_AUDIO_NATIVE.toolingPaths.map((path) => ({ path, sha256: hash }));
  const servedCandidate = { schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha, treeSha256: hash, exactRootFileCount: 500, path: 'channels/the-big-one' };
  const browser = {
    name: 'msedge', installed: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    executableSha256: hash, productVersion: '140.0.0.0', installRoot: 'C:/Program Files (x86)/Microsoft/Edge/Application',
    authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Microsoft Corporation',
    version: '140.0.0.0', userAgent: 'Mozilla/5.0 Edg/140.0.0.0', softwareRenderer: false,
  };
  const arenaReceipts = PASS71_AUDIO_NATIVE.arenas.map((arenaId, arenaIndex) => ({
    schema: PASS71_AUDIO_NATIVE.arenaSchema, status: 'PASS', sourceSha, servedCandidate,
    arenaId, transitionArenaId: PASS71_AUDIO_NATIVE.arenas[(arenaIndex + 1) % PASS71_AUDIO_NATIVE.arenas.length],
    browserName: browser.name, browserVersion: browser.version, userAgent: browser.userAgent,
    adapter: { description: 'NVIDIA GeForce RTX', vendor: 'NVIDIA', architecture: 'ada', software: false },
    physicalAudioUnlock: true, profile: PASS71_AUDIO_NATIVE.profile, durationMs: PASS71_AUDIO_NATIVE.durationMsPerArena,
    timeline: PASS71_AUDIO_NATIVE.events.map((id, index) => {
      const before = audioFixturePhase(index * 1_000, 0.001, 12 + index, index);
      if (id === 'start') {
        before.contextState = 'locked';
        before.outputProbe = { ...before.outputProbe, available: false, sampleRate: 0, fftSize: 0, logBandsDb: [], timeDomainSamples: [] };
      }
      return {
        id, action: `canonical-${id}`, before,
        during: audioFixturePhase(index * 1_000 + 20, 0.02, 13 + index, index),
        after: audioFixturePhase(index * 1_000 + 800, 0.001, 13 + index, index + 1),
        audibleDelta: 0.019, returnedToBaseline: true,
      };
    }),
    postMinuteSamples: [60, 61, 62, 63, 64, 65].map((second) => audioFixturePhase(second * 1_000, 0.001, 30, 18)),
    clientRuntimeLog: [], faults: [],
  }));
  const unsigned = {
    schemaVersion: PASS71_AUDIO_NATIVE.schemaVersion, evidenceId: PASS71_AUDIO_NATIVE.evidenceId,
    kind: PASS71_AUDIO_NATIVE.kind, contract: PASS71_AUDIO_NATIVE.contract, feedbackId: PASS71_AUDIO_NATIVE.feedbackId,
    schema: PASS71_AUDIO_NATIVE.schema, status: 'passed',
    startedAt: options.startedAt ?? '2026-07-24T09:01:00.000Z', completedAt: options.completedAt ?? '2026-07-24T09:08:00.000Z',
    invocation: 'npm run qa:pass71:audio-native -- --expected-source-sha=<A> --browser=msedge --machine=dave-gaming-pc',
    environment: {
      machine: PASS71_AUDIO_NATIVE_MACHINE_ID,
      hostnameSha256: PASS71_AUDIO_NATIVE_MACHINE_HOSTNAME_SHA256,
      platform: 'win32',
      arch: 'x64',
    },
    sourceSha, endingSha: sourceSha, sourceTree: 'c'.repeat(40), sourceBranch: 'candidate', cleanBefore: true, cleanAfter: true,
    servedCandidate, profile: PASS71_AUDIO_NATIVE.profile, browser,
    durationMsPerArena: PASS71_AUDIO_NATIVE.durationMsPerArena, arenas: PASS71_AUDIO_NATIVE.arenas,
    tooling, arenaReceipts,
  };
  return { ...unsigned, evidenceDigest: sha256Canonical(unsigned) };
}
