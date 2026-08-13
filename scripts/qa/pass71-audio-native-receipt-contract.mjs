import { createHash } from 'node:crypto';

export const PASS71_AUDIO_NATIVE = Object.freeze({
  schema: 'atomic-acres/pass71-audio-native@1',
  arenaSchema: 'atomic-acres/pass71-audio-native-arena@1',
  arenas: Object.freeze(['atomic-acres', 'rustworks-1v1', 'skyline-terminal', 'gun-range']),
  events: Object.freeze(['start', 'combat', 'grenade', 'glass', 'support', 'rematch', 'arena-transition']),
  durationMsPerArena: 65_000,
  profile: Object.freeze({ name: 'Quality', renderer: 'webgpu', render: 'blender' }),
  retainedSampleCount: 16,
  toolingPaths: Object.freeze([
    'src/audio.ts', 'tests/e2e/pass71-audio-native-long-run.spec.ts',
    'scripts/qa/pass71-audio-native-receipt-contract.mjs', 'scripts/qa/run-pass71-audio-native-receipt.mjs',
    'scripts/qa/run-playwright-with-topology.mjs', 'scripts/release/stage-release-topology.mjs',
    'playwright.config.ts', 'release-channels.json', 'vite.config.ts', 'package.json', 'package-lock.json',
  ]),
});

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

export function pass71AudioNativeFailures(receipt, expectedSourceSha) {
  const failures = [];
  if (!exactKeys(receipt, ['schema', 'status', 'sourceSha', 'endingSha', 'sourceTree', 'sourceBranch', 'cleanBefore', 'cleanAfter',
    'servedCandidate', 'profile', 'browser', 'durationMsPerArena', 'arenas', 'tooling', 'arenaReceipts', 'evidenceDigest'])) {
    failures.push('receipt shape is not exact'); return failures;
  }
  if (receipt.schema !== PASS71_AUDIO_NATIVE.schema || receipt.status !== 'PASS') failures.push('schema/status mismatch');
  if (receipt.sourceSha !== expectedSourceSha || receipt.endingSha !== expectedSourceSha || !/^[a-f0-9]{40}$/u.test(expectedSourceSha)) failures.push('source SHA mismatch');
  if (receipt.cleanBefore !== true || receipt.cleanAfter !== true) failures.push('source was not clean throughout');
  if (receipt.servedCandidate?.sourceSha !== expectedSourceSha || receipt.servedCandidate?.channel !== 'the-big-one'
    || receipt.servedCandidate?.schemaVersion !== 4 || !/^[a-f0-9]{64}$/u.test(receipt.servedCandidate?.treeSha256 ?? '')) failures.push('served candidate mismatch');
  if (canonicalJson(receipt.profile) !== canonicalJson(PASS71_AUDIO_NATIVE.profile)) failures.push('Quality profile mismatch');
  const exactBrowserIdentity = receipt.browser?.name === 'msedge'
    ? /\/msedge\.exe$/iu.test(receipt.browser?.executablePath ?? '') && /\bEdg\//u.test(receipt.browser?.userAgent ?? '')
    : receipt.browser?.name === 'chrome'
      ? /\/chrome\.exe$/iu.test(receipt.browser?.executablePath ?? '') && /\bChrome\//u.test(receipt.browser?.userAgent ?? '') && !/\bEdg\//u.test(receipt.browser?.userAgent ?? '')
      : false;
  if (!exactBrowserIdentity || receipt.browser?.installed !== true
    || receipt.browser?.softwareRenderer !== false || !/^[a-f0-9]{64}$/u.test(receipt.browser?.executableSha256 ?? '')
    || !receipt.browser?.executablePath || !receipt.browser?.version || !receipt.browser?.userAgent) failures.push('installed nonsoftware browser identity missing');
  if (receipt.durationMsPerArena !== PASS71_AUDIO_NATIVE.durationMsPerArena
    || canonicalJson(receipt.arenas) !== canonicalJson(PASS71_AUDIO_NATIVE.arenas)) failures.push('arena/duration mismatch');
  if (!Array.isArray(receipt.tooling)
    || canonicalJson(receipt.tooling.map((entry) => entry.path)) !== canonicalJson(PASS71_AUDIO_NATIVE.toolingPaths)
    || receipt.tooling.some((entry) => !entry.path || !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? ''))) failures.push('tooling identity missing');
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
