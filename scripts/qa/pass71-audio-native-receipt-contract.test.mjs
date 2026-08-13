import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASS71_AUDIO_NATIVE, assertPass71AudioNativeReceipt, pass71AudioNativeFailures, sha256Canonical,
} from './pass71-audio-native-receipt-contract.mjs';

const SHA = 'a'.repeat(40);
const HASH = 'b'.repeat(64);
const buses = Object.fromEntries(['master', 'sfx', 'movement', 'ui', 'announcements', 'ambience', 'menu-music', 'game-music']
  .map((id) => [id, { configuredGain: 100, muted: false, effectiveGain: 0.25 }]));

function phase(elapsedMs, peak, registrations, disposals) {
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

function lockedPhase() {
  const value = phase(0, 0, 0, 0);
  value.contextState = 'locked';
  value.outputProbe = { ...value.outputProbe, available: false, sampleRate: 0, fftSize: 0, logBandsDb: [], timeDomainSamples: [] };
  return value;
}

function fixture() {
  const servedCandidate = { schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha: SHA, treeSha256: HASH, exactRootFileCount: 42, path: 'channels/the-big-one' };
  const browser = { name: 'msedge', installed: true, executablePath: 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', executableSha256: HASH, version: '140.0.0.0', userAgent: 'Edg/140', softwareRenderer: false };
  const arenaReceipts = PASS71_AUDIO_NATIVE.arenas.map((arenaId, arenaIndex) => ({
    schema: PASS71_AUDIO_NATIVE.arenaSchema, status: 'PASS', sourceSha: SHA, servedCandidate,
    arenaId, transitionArenaId: PASS71_AUDIO_NATIVE.arenas[(arenaIndex + 1) % 4], browserName: browser.name,
    browserVersion: browser.version, userAgent: browser.userAgent,
    adapter: { description: 'NVIDIA GeForce RTX', vendor: 'NVIDIA', architecture: 'ada', software: false },
    physicalAudioUnlock: true, profile: PASS71_AUDIO_NATIVE.profile, durationMs: 65_000,
    timeline: PASS71_AUDIO_NATIVE.events.map((id, index) => ({
      id, action: `debug-${id}`, before: id === 'start' ? lockedPhase() : phase(index * 1_000, 0.001, 12 + index, index),
      during: phase(index * 1_000 + 20, 0.02, 13 + index, index),
      after: phase(index * 1_000 + 800, 0.001, 13 + index, index + 1), audibleDelta: 0.019, returnedToBaseline: true,
    })),
    postMinuteSamples: [60, 61, 62, 63, 64, 65].map((second) => phase(second * 1_000, 0.001, 30, 18)),
    clientRuntimeLog: [], faults: [],
  }));
  const receipt = {
    schema: PASS71_AUDIO_NATIVE.schema, status: 'PASS', sourceSha: SHA, endingSha: SHA, sourceTree: SHA,
    sourceBranch: 'candidate', cleanBefore: true, cleanAfter: true, servedCandidate,
    profile: PASS71_AUDIO_NATIVE.profile, browser, durationMsPerArena: 65_000,
    arenas: PASS71_AUDIO_NATIVE.arenas,
    tooling: PASS71_AUDIO_NATIVE.toolingPaths.map((path) => ({ path, sha256: HASH })), arenaReceipts,
  };
  return { ...receipt, evidenceDigest: sha256Canonical(receipt) };
}

function mutate(path, value) {
  const copy = structuredClone(fixture());
  let target = copy;
  for (const key of path.slice(0, -1)) target = target[key];
  target[path.at(-1)] = value;
  const withoutDigest = { ...copy }; delete withoutDigest.evidenceDigest;
  copy.evidenceDigest = sha256Canonical(withoutDigest);
  return copy;
}

test('accepts one exact four-arena installed-browser Quality receipt', () => {
  assert.equal(assertPass71AudioNativeReceipt(fixture(), SHA).status, 'PASS');
});

for (const [name, path, value, fragment] of [
  ['source substitution', ['sourceSha'], 'c'.repeat(40), 'source SHA'],
  ['software adapter', ['arenaReceipts', 0, 'adapter', 'software'], true, 'software/unknown adapter'],
  ['missing event', ['arenaReceipts', 0, 'timeline'], [], 'timeline missing'],
  ['silent cue', ['arenaReceipts', 0, 'timeline', 1, 'audibleDelta'], 0, 'combat invalid'],
  ['semantic counter forgery', ['arenaReceipts', 0, 'timeline', 3, 'after', 'counters', 'glassPulses'], 15, 'glass invalid'],
  ['unbounded FFT evidence', ['arenaReceipts', 0, 'timeline', 2, 'during', 'outputProbe', 'logBandsDb'], Array(17).fill(-80), 'grenade invalid'],
  ['unclean ending', ['cleanAfter'], false, 'not clean'],
  ['wrong profile', ['profile', 'name'], 'Performance', 'Quality profile'],
  ['browser identity omission', ['browser', 'executableSha256'], '', 'browser identity'],
]) test(`rejects ${name}`, () => {
  assert.ok(pass71AudioNativeFailures(mutate(path, value), SHA).some((failure) => failure.includes(fragment)));
});

test('rejects receipt byte-identity tampering', () => {
  const changed = fixture();
  changed.sourceBranch = 'tampered';
  assert.ok(pass71AudioNativeFailures(changed, SHA).includes('evidence digest mismatch'));
});
