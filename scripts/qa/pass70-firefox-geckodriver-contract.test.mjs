import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PASS70_FIREFOX_GECKODRIVER_IDENTITY,
  assertPass70FirefoxGeckodriverReceipt,
  normalizePass70BidiLogEntry,
  pass70FirefoxGeckodriverReceiptFailures,
  pass70StagedCandidateFailures,
} from './pass70-firefox-geckodriver-contract.mjs';

const runnerSource = readFileSync(new URL('./run-pass70-firefox-geckodriver.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const sourceSha = 'a'.repeat(40);
const treeSha256 = 'b'.repeat(64);
const peerPath = '/peerjs-0123456789abcdef01234567';
const firefoxUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0';
const expected = {
  sourceSha,
  treeSha256,
  exactRootFileCount: 1_234,
  baseUrl: 'http://127.0.0.1:4551/channels/the-big-one/',
  previewPort: 4_551,
  peerPort: 9_091,
  peerPath,
  driverPorts: [4_467, 4_468],
  bidiPorts: [4_477, 4_478],
};

function candidate() {
  return {
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: 'PASS 70',
    path: 'channels/the-big-one',
    sourceSha,
    treeSha256,
    exactRootFileCount: expected.exactRootFileCount,
  };
}

function trustedSoloEvents() {
  return [
    { phase: 'solo', type: 'click', trusted: true, button: 0, code: null, targetId: 'solo' },
    { phase: 'pointer-lock', type: 'mousedown', trusted: true, button: 0, code: null, targetId: 'game' },
    { phase: 'ads-down', type: 'mousedown', trusted: true, button: 2, code: null, targetId: 'game' },
    { phase: 'fire', type: 'mousedown', trusted: true, button: 0, code: null, targetId: 'game' },
    { phase: 'fire', type: 'mouseup', trusted: true, button: 0, code: null, targetId: 'game' },
    { phase: 'ads-up', type: 'mouseup', trusted: true, button: 2, code: null, targetId: 'game' },
    { phase: 'reload', type: 'keydown', trusted: true, button: null, code: 'KeyR', targetId: null },
    { phase: 'reload', type: 'keyup', trusted: true, button: null, code: 'KeyR', targetId: null },
  ].map((event, index) => ({ sequence: index + 2, atMs: 100 + index, ...event }));
}

function frames() {
  return { wallClockMs: 2_100, frames: 90, frameDelta: 88, maxGapMs: 33, endGapMs: 17, p95GapMs: 19 };
}

function faults() {
  return {
    runtimeErrorLogPresent: true,
    bannerPresent: true,
    runtimeErrorLog: '',
    systemPaused: false,
    capturedErrors: [],
    bidiErrors: [],
    faultText: '',
  };
}

function audio() {
  return {
    context: { source: 'standard', state: 'running' },
    listenerPoseMode: 'modern-audio-param',
    expectedListenerPoseMode: 'modern-audio-param',
    capabilities: {
      constructorSource: 'standard',
      properties: Object.fromEntries([
        'positionX', 'positionY', 'positionZ',
        'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ',
      ].map((name) => [name, { propertyType: 'object', valueType: 'number' }])),
      methods: { setPosition: 'function', setOrientation: 'function' },
    },
  };
}

function soloCycle(label) {
  return {
    label,
    gameStarted: true,
    matchPhase: 'active',
    botCount: 1,
    backend: 'webgl2',
    webglVersion: 'WebGL 2.0',
    userAgent: firefoxUserAgent,
    pointerLock: true,
    canvasTarget: {
      x: 204,
      y: 130,
      elementId: 'game',
      topElementId: 'game',
      topElementTag: 'canvas',
      rect: { left: 0, top: 0, right: 1_280, bottom: 720, width: 1_280, height: 720 },
      verifiedAtAction: true,
    },
    preRetryPointerLock: { locked: false, surface: 'hidden', pointerLockLifecycle: 'denied', pointerRejectCount: 1, status: 'Mouse capture was blocked. Click the match to retry.' },
    pointerLockEvents: [
      { sequence: 1, atMs: 99, phase: 'solo', type: 'pointerlockerror', trusted: true, lockedElementId: null },
      { sequence: 4, atMs: 102, phase: 'pointer-lock', type: 'pointerlockchange', trusted: true, lockedElementId: 'game' },
    ],
    pointerLockLifecycle: { surface: 'hidden', state: 'locked', rejectCount: 1 },
    adsHeldObserved: true,
    adsReleasedObserved: true,
    ammo: { beforeFire: 2, afterFire: 1, afterReload: 30, reserveAfterReload: 1 },
    reload: { observedStart: true, observedCompletion: true },
    trustedEvents: trustedSoloEvents(),
    frames: frames(),
    audio: audio(),
    faults: faults(),
  };
}

function lobbyEvents(phases) {
  return phases.map((phase) => ({ phase, type: 'click', trusted: true, targetId: phase }));
}

function screenshot(path, shaCharacter) {
  return { path, sha256: shaCharacter.repeat(64), bytes: 12_345, width: 1_280, height: 720 };
}

function validReceipt() {
  const staged = candidate();
  return {
    schema: PASS70_FIREFOX_GECKODRIVER_IDENTITY.schema,
    schemaVersion: PASS70_FIREFOX_GECKODRIVER_IDENTITY.schemaVersion,
    status: 'PASS',
    gate: 'firefox-geckodriver',
    releasePass: 'PASS 70',
    sourceSha,
    sourceState: { startingSha: sourceSha, endingSha: sourceSha, cleanBefore: true, cleanAfter: true },
    servedCandidateBefore: structuredClone(staged),
    servedCandidateAfter: structuredClone(staged),
    toolchain: {
      node: { version: 'v24.12.0', platform: 'win32', arch: 'x64' },
      firefox: {
        executablePath: 'C:/Program Files/Mozilla Firefox/firefox.exe',
        executableName: 'firefox.exe',
        sha256: PASS70_FIREFOX_GECKODRIVER_IDENTITY.firefox.sha256,
        expectedVersion: '153.0.4',
        sessionVersions: ['153.0.4', '153.0.4'],
        userAgents: [firefoxUserAgent, firefoxUserAgent],
        headless: true,
        automation: 'raw-w3c-http+bidi',
      },
      geckodriver: {
        version: '0.37.1',
        releaseTag: 'v0.37.1',
        releaseUrl: PASS70_FIREFOX_GECKODRIVER_IDENTITY.geckodriver.releaseUrl,
        archive: {
          path: 'C:/owned/geckodriver-v0.37.1-win64.zip',
          name: 'geckodriver-v0.37.1-win64.zip',
          url: PASS70_FIREFOX_GECKODRIVER_IDENTITY.geckodriver.archiveUrl,
          bytes: 1_780_114,
          sha256: PASS70_FIREFOX_GECKODRIVER_IDENTITY.geckodriver.archiveSha256,
          entries: ['geckodriver.exe'],
        },
        executableSha256: 'c'.repeat(64),
        versionOutput: 'geckodriver 0.37.1 (release build)',
      },
    },
    ownership: {
      preview: { host: '127.0.0.1', port: 4_551, baseUrl: expected.baseUrl, localOnly: true },
      peer: { host: '127.0.0.1', port: 9_091, path: peerPath, localOnly: true },
      drivers: [
        { role: 'host', host: '127.0.0.1', port: 4_467, bidiPort: 4_477, localOnly: true, sessionId: 'host-session', geckodriverProcessId: 9_001, firefoxProcessId: 10_001, profile: 'C:/profiles/host', bidiWebSocketUrl: 'ws://127.0.0.1:4477/session/host-session', bidiSubscribed: true },
        { role: 'guest', host: '127.0.0.1', port: 4_468, bidiPort: 4_478, localOnly: true, sessionId: 'guest-session', geckodriverProcessId: 9_002, firefoxProcessId: 10_002, profile: 'C:/profiles/guest', bidiWebSocketUrl: 'ws://127.0.0.1:4478/session/guest-session', bidiSubscribed: true },
      ],
    },
    cleanup: {
      ports: [4_551, 9_091, 4_467, 4_468, 4_477, 4_478].map((port) => ({ port, free: true })),
      firefoxProcessIds: [10_001, 10_002],
      geckodriverProcessIds: [9_001, 9_002],
      allOwnedPortsReleased: true,
      allOwnedProcessesExited: true,
    },
    soloCycles: [soloCycle('cold'), soloCycle('warm')],
    multiplayer: {
      hostGuestIndependentSessions: true,
      initiallyConverged: true,
      initialMemberIds: { host: ['firefox-guest', 'firefox-host'], guest: ['firefox-guest', 'firefox-host'] },
      initialHostId: 'firefox-host',
      initialGuestId: 'firefox-guest',
      hostedBotCountBefore: { host: 0, guest: 0 },
      remotePlayersBefore: { host: 1, guest: 1 },
      guestPageDestroyed: true,
      hostObservedDisconnect: true,
      originalGuestWindow: 'guest-original-window',
      replacementGuestWindow: 'guest-replacement-window',
      remainingGuestWindowsAfterClose: ['guest-replacement-window'],
      rejoinAvailable: true,
      rejoinIdentityPreserved: true,
      rejoinedGuestId: 'firefox-guest',
      rejoinedMemberIds: { host: ['firefox-guest', 'firefox-host'], guest: ['firefox-guest', 'firefox-host'] },
      activeAfterRejoin: true,
      membersConnectedAfterRejoin: true,
      rosterPreservedAfterRejoin: true,
      hostedBotCountAfter: { host: 0, guest: 0 },
      remotePlayersAfter: { host: 1, guest: 1 },
      trustedLobbyEvents: {
        host: lobbyEvents(['host', 'host-ready', 'host-start']),
        guest: lobbyEvents(['join', 'guest-ready']),
        rejoinedGuest: lobbyEvents(['rejoin']),
      },
      frames: { host: frames(), guest: frames() },
      faults: { host: faults(), guest: faults() },
    },
    screenshots: {
      solo: screenshot('artifacts/pass70/firefox-geckodriver/firefox-warm-one-bot.png', 'd'),
      multiplayer: screenshot('artifacts/pass70/firefox-geckodriver/firefox-multiplayer-rejoin.png', 'e'),
    },
    errors: [],
  };
}

function mutation(name, mutate, expectedFailure) {
  test(`fails closed when ${name}`, () => {
    const receipt = validReceipt();
    mutate(receipt);
    const failures = pass70FirefoxGeckodriverReceiptFailures(receipt, expected);
    assert.ok(failures.some((failure) => expectedFailure.test(failure)), failures.join('\n'));
    assert.throws(() => assertPass70FirefoxGeckodriverReceipt(receipt, expected), /Invalid Pass 70 Firefox GeckoDriver receipt/u);
  });
}

test('accepts one exact complete Firefox GeckoDriver receipt', () => {
  const receipt = validReceipt();
  assert.deepEqual(pass70FirefoxGeckodriverReceiptFailures(receipt, expected), []);
  assert.doesNotThrow(() => assertPass70FirefoxGeckodriverReceipt(receipt, expected));
});

test('accepts an earlier automatic pointer-lock rejection followed by a sequenced trusted retry', () => {
  const receipt = validReceipt();
  const solo = receipt.soloCycles[0];
  assert.equal(solo.pointerLockEvents[0].type, 'pointerlockerror');
  assert.ok(solo.pointerLockEvents[0].sequence < solo.trustedEvents[1].sequence);
  assert.ok(solo.pointerLockEvents[1].sequence > solo.trustedEvents[1].sequence);
  assert.deepEqual(pass70FirefoxGeckodriverReceiptFailures(receipt, expected), []);
});

test('normalizes the direct WebDriver BiDi log.entryAdded params shape without dropping error severity', () => {
  assert.deepEqual(normalizePass70BidiLogEntry({
    type: 'event',
    method: 'log.entryAdded',
    params: {
      type: 'javascript',
      level: 'error',
      text: "TypeError: can't access property 'value', n.positionX is undefined",
      timestamp: 1_723_456_789,
      source: { context: 'context-id', realm: 'realm-id' },
    },
  }, 'cold:load'), {
    phase: 'cold:load',
    type: 'javascript',
    level: 'error',
    text: "TypeError: can't access property 'value', n.positionX is undefined",
    method: null,
    timestamp: 1_723_456_789,
    source: { context: 'context-id', realm: 'realm-id' },
  });
  assert.equal(normalizePass70BidiLogEntry({ type: 'event', method: 'other.event', params: {} }, 'cold:load'), null);
});

test('rejects malformed staged candidate digests and counts independently of expected equality', () => {
  const malformed = { ...candidate(), treeSha256: null, exactRootFileCount: 0 };
  const failures = pass70StagedCandidateFailures(malformed, { ...expected, treeSha256: null, exactRootFileCount: 0 });
  assert.ok(failures.includes('served candidate tree digest is invalid'));
  assert.ok(failures.includes('served candidate file count is invalid'));
});

mutation('the source SHA changes', (receipt) => { receipt.sourceSha = 'f'.repeat(40); }, /source SHA mismatch/u);
mutation('the worktree is dirty after the run', (receipt) => { receipt.sourceState.cleanAfter = false; }, /clean exact source/u);
mutation('the served candidate drifts', (receipt) => { receipt.servedCandidateAfter.treeSha256 = 'f'.repeat(64); }, /tree digest mismatch|drifted/u);
mutation('the Firefox binary hash changes', (receipt) => { receipt.toolchain.firefox.sha256 = '0'.repeat(64); }, /Firefox binary\/session provenance/u);
mutation('a Firefox session version changes', (receipt) => { receipt.toolchain.firefox.sessionVersions[1] = '152.0'; }, /Firefox binary\/session provenance/u);
mutation('a Firefox user agent is not Mozilla Firefox', (receipt) => { receipt.toolchain.firefox.userAgents[0] = 'Chrome/153.0'; }, /Firefox binary\/session provenance/u);
mutation('the GeckoDriver archive hash changes', (receipt) => { receipt.toolchain.geckodriver.archive.sha256 = '0'.repeat(64); }, /official GeckoDriver/u);
mutation('the GeckoDriver archive contains another entry', (receipt) => { receipt.toolchain.geckodriver.archive.entries.push('payload.exe'); }, /official GeckoDriver/u);
mutation('the two sessions share a Firefox process', (receipt) => { receipt.ownership.drivers[1].firefoxProcessId = receipt.ownership.drivers[0].firefoxProcessId; }, /independent Firefox sessions/u);
mutation('an owned Firefox process survives cleanup', (receipt) => { receipt.cleanup.allOwnedProcessesExited = false; }, /cleanup proof/u);
mutation('the solo match contains more than one bot', (receipt) => { receipt.soloCycles[0].botCount = 2; }, /exact one-bot/u);
mutation('the solo pointer lock is absent', (receipt) => { receipt.soloCycles[0].pointerLock = false; }, /pointer-lock\/ADS/u);
mutation('the native canvas hit point is obscured', (receipt) => { receipt.soloCycles[0].canvasTarget.topElementId = 'banner'; }, /native canvas input target/u);
mutation('the automatic request is still pending at native retry', (receipt) => {
  receipt.soloCycles[0].preRetryPointerLock.pointerLockLifecycle = 'requesting';
}, /did not settle before native retry/u);
mutation('Firefox emits pointerlockerror', (receipt) => {
  receipt.soloCycles[0].pointerLockEvents.push({ sequence: 5, atMs: 103, phase: 'pointer-lock', type: 'pointerlockerror', trusted: true, lockedElementId: null });
}, /pointer-lock event\/lifecycle proof/u);
mutation('an earlier automatic lock is misattributed to the explicit retry', (receipt) => {
  receipt.soloCycles[0].pointerLockEvents[1].sequence = 2;
}, /pointer-lock event\/lifecycle proof/u);
mutation('a required native input event is missing', (receipt) => { receipt.soloCycles[0].trustedEvents.splice(3, 1); }, /trusted input event proof|missing trusted fire/u);
mutation('an input event is synthetic', (receipt) => {
  receipt.soloCycles[0].trustedEvents.push({ phase: 'extra', type: 'click', trusted: false, targetId: 'game' });
}, /untrusted input/u);
mutation('trusted fire does not consume one round', (receipt) => { receipt.soloCycles[0].ammo.afterFire = 2; }, /fire\/reload mutation/u);
mutation('the game frame counter stalls', (receipt) => { receipt.soloCycles[0].frames.frameDelta = 0; }, /frame counter did not advance/u);
mutation('a half-second frame gap occurs', (receipt) => { receipt.soloCycles[0].frames.maxGapMs = 500; }, /500 ms frame gap/u);
mutation('rendering freezes at the end of the observation window', (receipt) => {
  receipt.soloCycles[0].frames.endGapMs = 1_500;
  receipt.soloCycles[0].frames.maxGapMs = 1_500;
}, /terminal frame recency/u);
mutation('native audio capability and runtime mode disagree', (receipt) => { receipt.soloCycles[0].audio.expectedListenerPoseMode = 'legacy-setters'; }, /does not match native capabilities/u);
mutation('a claimed modern listener omits native orientation AudioParams', (receipt) => {
  delete receipt.soloCycles[0].audio.capabilities.properties.forwardX;
}, /native AudioListener capability probe|does not match native capabilities/u);
mutation('the standard AudioContext is not running', (receipt) => { receipt.soloCycles[0].audio.context.state = 'suspended'; }, /AudioContext is not running/u);
mutation('the real runtime error surface is absent', (receipt) => { receipt.soloCycles[0].faults.runtimeErrorLogPresent = false; }, /runtime error log surface/u);
mutation('WebDriver BiDi captures a bootstrap exception', (receipt) => {
  receipt.soloCycles[0].faults.bidiErrors.push({ level: 'error', type: 'javascript', text: 'bootstrap failed' });
}, /WebDriver BiDi load\/runtime errors/u);
mutation('the Firefox positionX regression appears', (receipt) => { receipt.soloCycles[0].faults.faultText = "can't access property 'value', n.positionX is undefined"; }, /forbidden Firefox\/audio fault/u);
mutation('SYSTEM PAUSED appears', (receipt) => { receipt.soloCycles[0].faults.systemPaused = true; }, /entered SYSTEM PAUSED/u);
mutation('the guest identity changes on rejoin', (receipt) => { receipt.multiplayer.rejoinedGuestId = 'new-guest'; }, /disconnect\/rejoin proof/u);
mutation('host and guest report split-brain rosters', (receipt) => { receipt.multiplayer.rejoinedMemberIds.guest[0] = 'other-guest'; }, /disconnect\/rejoin proof/u);
mutation('the old guest page was not destroyed', (receipt) => { receipt.multiplayer.remainingGuestWindowsAfterClose.push(receipt.multiplayer.originalGuestWindow); }, /disconnect\/rejoin proof/u);
mutation('a lobby click is synthetic', (receipt) => { receipt.multiplayer.trustedLobbyEvents.guest[0].trusted = false; }, /lobby input is not entirely trusted/u);
mutation('the rejoined pair stalls', (receipt) => { receipt.multiplayer.frames.guest.frames = 1; }, /presented too few animation frames/u);
mutation('the multiplayer page captures an exception', (receipt) => { receipt.multiplayer.faults.host.capturedErrors.push({ type: 'error', message: 'boom' }); }, /captured browser errors/u);
mutation('a screenshot is not byte-bound', (receipt) => { receipt.screenshots.solo.sha256 = 'not-a-sha'; }, /screenshot identity/u);
mutation('the receipt contains errors', (receipt) => { receipt.errors.push('failure'); }, /receipt errors must be empty/u);

test('runner uses raw W3C HTTP and native trusted actions without automation dependencies or debug input shortcuts', () => {
  for (const required of [
    "this.request('POST', '/session'",
    "this.sessionRoute('/actions')",
    "this.sessionRoute('/window/new')",
    'webSocketUrl: true',
    "this.bidiCommand('session.subscribe', { events: ['log.entryAdded'] })",
    "this.bidiCommand('session.status', {})",
    "event.isTrusted",
    "document.querySelector('#runtime-error-log')",
    "document.pointerLockElement?.id === 'game'",
    'document.elementFromPoint(x, y)',
    "origin: 'viewport', x: canvasTarget.x, y: canvasTarget.y",
    "document.addEventListener('pointerlockerror'",
    "{ type: 'keyDown', value: 'r' }",
    "debug.setAmmo('carbine', 2, 30)",
    'debug.setBotsFrozen(true)',
  ]) assert.ok(runnerSource.includes(required), `missing runner proof: ${required}`);
  for (const forbidden of [
    '@playwright/test',
    'selenium-webdriver',
    'debug.startSolo',
    'debug.setAds',
    'debug.fireOnce',
    'debug.reload()',
    "document.querySelector('#runtime-error')",
  ]) assert.ok(!runnerSource.includes(forbidden), `forbidden false-green shortcut: ${forbidden}`);
});

test('runner pins and safely extracts the exact official GeckoDriver archive', () => {
  const gecko = PASS70_FIREFOX_GECKODRIVER_IDENTITY.geckodriver;
  assert.equal(gecko.archiveName, 'geckodriver-v0.37.1-win64.zip');
  assert.equal(gecko.archiveSize, 1_780_114);
  assert.equal(gecko.archiveSha256, 'dfed9315abe8d2fbc1b6161a2ee8002452e79cf05ee92fdc653a4e26bc35edd8');
  for (const required of [
    'basename(archivePath) !== identity.geckodriver.archiveName',
    'statSync(archivePath).size !== identity.geckodriver.archiveSize',
    'sha256File(archivePath) !== identity.geckodriver.archiveSha256',
    "['-tf', archivePath]",
    'entries.length !== 1',
    "entry.includes('..')",
    "entry.includes('/')",
    "entry.includes('\\\\')",
  ]) assert.ok(runnerSource.includes(required), `missing archive guard: ${required}`);
});

test('runner creates a pass receipt only after cleanup and exact clean-SHA revalidation', () => {
  const cleanup = runnerSource.indexOf("['guest Firefox/GeckoDriver', () => guestDriver?.stop()]");
  const endingSha = runnerSource.indexOf('const endingSha = gitSha();');
  const assertion = runnerSource.indexOf('assertPass70FirefoxGeckodriverReceipt(completed.receipt, completed.expected);');
  const write = runnerSource.indexOf('writeFileSync(temporaryReceiptPath');
  assert.ok(cleanup >= 0 && endingSha > cleanup && assertion > endingSha && write > assertion);
  assert.ok(runnerSource.includes('if (failure || cleanupErrors.length > 0 || !completed)'));
  assert.ok(runnerSource.includes('rmSync(evidenceRoot, { recursive: true, force: true })'));
});

test('package exposes a separate contract gate and a contract-first real Firefox command', () => {
  assert.equal(
    packageJson.scripts['qa:pass70:firefox-geckodriver:contract'],
    'node --test scripts/qa/pass70-firefox-geckodriver-contract.test.mjs',
  );
  assert.equal(
    packageJson.scripts['qa:pass70:firefox-geckodriver'],
    'npm run qa:pass70:firefox-geckodriver:contract && node scripts/qa/run-pass70-firefox-geckodriver.mjs',
  );
});
