import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASS71_AUDIO_NATIVE, PASS71_AUDIO_NATIVE_DESCRIPTOR, assertPass71AudioNativeReceipt,
  createPass71AudioNativeEvidenceFixture, pass71AudioNativeFailures, sha256Canonical,
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

function fixture() { return createPass71AudioNativeEvidenceFixture({ sourceSha: SHA }); }

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
  assert.equal(assertPass71AudioNativeReceipt(fixture(), SHA).status, 'passed');
});

test('exports one optional strict manifest registry descriptor', () => {
  assert.deepEqual(PASS71_AUDIO_NATIVE_DESCRIPTOR, {
    evidenceId: 'HF-302', kind: 'pass71-hf302-audio-native-long-run', minimumCount: 0, maximumCount: 1,
  });
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
