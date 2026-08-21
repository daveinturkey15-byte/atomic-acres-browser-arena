export const PASS70_FIREFOX_GECKODRIVER_IDENTITY = Object.freeze({
  schema: 'atomic-acres/pass70-firefox-geckodriver@1',
  schemaVersion: 1,
  gate: 'firefox-geckodriver',
  releasePass: 'PASS 70',
  firefox: Object.freeze({
    version: '153.0.4',
    userAgentMajor: '153.0',
    executableName: 'firefox.exe',
    sha256: 'b0648cfd61ca4344177e940c8b44001b79344f81bba8f571790d0d3939d0cb2e',
  }),
  geckodriver: Object.freeze({
    version: '0.37.1',
    releaseTag: 'v0.37.1',
    releaseUrl: 'https://github.com/mozilla/geckodriver/releases/tag/v0.37.1',
    archiveName: 'geckodriver-v0.37.1-win64.zip',
    archiveUrl: 'https://github.com/mozilla/geckodriver/releases/download/v0.37.1/geckodriver-v0.37.1-win64.zip',
    archiveSize: 1_780_114,
    archiveSha256: 'dfed9315abe8d2fbc1b6161a2ee8002452e79cf05ee92fdc653a4e26bc35edd8',
    executableName: 'geckodriver.exe',
  }),
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OWNED_PEER_PATH = /^\/peerjs-[a-f0-9]{24}$/u;
const FIREFOX_USER_AGENT = new RegExp(`\\bFirefox\\/${PASS70_FIREFOX_GECKODRIVER_IDENTITY.firefox.userAgentMajor.replace('.', '\\.')}\\b`, 'u');
const FAULT_PATTERN = /AudioListener|positionX|can't access property\s+["']?value|SYSTEM PAUSED/iu;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function exactKeys(value, expectedKeys) {
  return record(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort());
}

export function normalizePass70BidiLogEntry(payload, phase) {
  if (!record(payload) || payload.type !== 'event' || payload.method !== 'log.entryAdded'
    || !record(payload.params) || typeof phase !== 'string' || phase.length === 0) return null;
  const entry = payload.params;
  return {
    phase,
    type: entry.type ?? null,
    level: entry.level ?? null,
    text: String(entry.text ?? '').slice(0, 4_096),
    method: entry.method ?? null,
    timestamp: entry.timestamp ?? null,
    source: {
      context: entry.source?.context ?? null,
      realm: entry.source?.realm ?? null,
    },
  };
}

export function pass70StagedCandidateFailures(value, expected) {
  const errors = [];
  if (!record(value)) return ['served candidate must be an object'];
  if (value.schemaVersion !== 4 || value.channel !== 'the-big-one'
    || value.releasePass !== PASS70_FIREFOX_GECKODRIVER_IDENTITY.releasePass
    || value.path !== 'channels/the-big-one') {
    errors.push('served candidate identity mismatch');
  }
  if (value.sourceSha !== expected.sourceSha) errors.push('served candidate source SHA mismatch');
  if (!SHA256.test(value.treeSha256 ?? '')) errors.push('served candidate tree digest is invalid');
  if (!Number.isSafeInteger(value.exactRootFileCount) || value.exactRootFileCount <= 0) {
    errors.push('served candidate file count is invalid');
  }
  if (value.treeSha256 !== expected.treeSha256) errors.push('served candidate tree digest mismatch');
  if (value.exactRootFileCount !== expected.exactRootFileCount) errors.push('served candidate file count mismatch');
  return errors;
}

function inputEventFailures(events, label) {
  if (!Array.isArray(events) || events.length < 8) return [`${label} trusted input event proof is incomplete`];
  const requirements = [
    ['solo', 'click', null, null, 'solo'],
    ['pointer-lock', 'mousedown', 0, null, 'game'],
    ['ads-down', 'mousedown', 2, null, 'game'],
    ['fire', 'mousedown', 0, null, 'game'],
    ['fire', 'mouseup', 0, null, 'game'],
    ['ads-up', 'mouseup', 2, null, 'game'],
    ['reload', 'keydown', null, 'KeyR', null],
    ['reload', 'keyup', null, 'KeyR', null],
  ];
  let cursor = 0;
  for (const [phase, type, button, code, targetId] of requirements) {
    const index = events.findIndex((event, candidateIndex) => candidateIndex >= cursor
      && event?.phase === phase && event.type === type && event.trusted === true
      && (button === null || event.button === button)
      && (code === null || event.code === code)
      && (targetId === null || event.targetId === targetId));
    if (index < 0) return [`${label} is missing trusted ${phase}/${type} input`];
    cursor = index + 1;
  }
  if (events.some((event) => event?.trusted !== true)) return [`${label} contains an untrusted input event`];
  return [];
}

function eventStreamFailures(inputEvents, pointerLockEvents, label) {
  if (!Array.isArray(inputEvents) || !Array.isArray(pointerLockEvents)) {
    return [`${label} global event order proof is incomplete`];
  }
  const locallyOrdered = (events) => events.every((event, index) => Number.isSafeInteger(event?.sequence)
    && event.sequence > 0 && finite(event.atMs) && event.atMs >= 0
    && (index === 0 || (event.sequence > events[index - 1].sequence && event.atMs >= events[index - 1].atMs)));
  if (!locallyOrdered(inputEvents) || !locallyOrdered(pointerLockEvents)) {
    return [`${label} global event order proof is invalid`];
  }
  const merged = [...inputEvents, ...pointerLockEvents].sort((left, right) => left.sequence - right.sequence);
  if (merged.some((event, index) => event.sequence !== index + 1
    || (index > 0 && event.atMs < merged[index - 1].atMs))) {
    return [`${label} global event order proof is invalid`];
  }
  return [];
}

function faultFailures(value, label) {
  if (!record(value)) return [`${label} fault proof is missing`];
  const errors = [];
  if (value.runtimeErrorLogPresent !== true) errors.push(`${label} runtime error log surface is missing`);
  if (value.bannerPresent !== true) errors.push(`${label} system banner surface is missing`);
  if (value.runtimeErrorLog !== '') errors.push(`${label} runtime error log is not empty`);
  if (value.systemPaused !== false) errors.push(`${label} entered SYSTEM PAUSED`);
  if (!Array.isArray(value.capturedErrors) || value.capturedErrors.length !== 0) {
    errors.push(`${label} captured browser errors are not empty`);
  }
  if (!Array.isArray(value.bidiErrors) || value.bidiErrors.length !== 0) {
    errors.push(`${label} WebDriver BiDi load/runtime errors are not empty`);
  }
  if (FAULT_PATTERN.test(String(value.faultText ?? ''))) errors.push(`${label} contains a forbidden Firefox/audio fault`);
  return errors;
}

function frameFailures(value, label) {
  if (!record(value)) return [`${label} frame proof is missing`];
  const errors = [];
  if (!finite(value.wallClockMs) || value.wallClockMs < 2_000) errors.push(`${label} frame window is shorter than 2 seconds`);
  if (!Number.isSafeInteger(value.frames) || value.frames <= 30) errors.push(`${label} presented too few animation frames`);
  if (!Number.isSafeInteger(value.frameDelta) || value.frameDelta <= 30) errors.push(`${label} game frame counter did not advance`);
  if (!finite(value.maxGapMs) || value.maxGapMs >= 500) errors.push(`${label} contains a 500 ms frame gap`);
  if (!finite(value.endGapMs) || value.endGapMs < 0 || value.endGapMs >= 500
    || !finite(value.maxGapMs) || value.maxGapMs < value.endGapMs) {
    errors.push(`${label} terminal frame recency is invalid`);
  }
  if (!finite(value.p95GapMs) || value.p95GapMs < 0) errors.push(`${label} p95 frame gap is invalid`);
  return errors;
}

const AUDIO_LISTENER_POSITION_PROPERTIES = ['positionX', 'positionY', 'positionZ'];
const AUDIO_LISTENER_ORIENTATION_PROPERTIES = ['forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'];

function deriveAudioListenerPoseMode(capabilities) {
  if (!record(capabilities) || capabilities.constructorSource !== 'standard'
    || !exactKeys(capabilities.properties, [...AUDIO_LISTENER_POSITION_PROPERTIES, ...AUDIO_LISTENER_ORIENTATION_PROPERTIES])
    || !exactKeys(capabilities.methods, ['setPosition', 'setOrientation'])) return null;
  const audioParam = (name) => capabilities.properties[name]?.propertyType === 'object'
    && capabilities.properties[name]?.valueType === 'number';
  const modernPosition = AUDIO_LISTENER_POSITION_PROPERTIES.every(audioParam);
  const modernOrientation = AUDIO_LISTENER_ORIENTATION_PROPERTIES.every(audioParam);
  const legacyPosition = capabilities.methods.setPosition === 'function';
  const legacyOrientation = capabilities.methods.setOrientation === 'function';
  if ((!modernPosition && !legacyPosition) || (!modernOrientation && !legacyOrientation)) return 'unavailable';
  if (modernPosition && modernOrientation) return 'modern-audio-param';
  if (!modernPosition && !modernOrientation) return 'legacy-setters';
  return 'hybrid';
}

function audioFailures(value, label) {
  if (!record(value)) return [`${label} audio proof is missing`];
  const errors = [];
  if (value.context?.source !== 'standard' || value.context?.state !== 'running') {
    errors.push(`${label} standard AudioContext is not running`);
  }
  if (!['modern-audio-param', 'legacy-setters', 'hybrid'].includes(value.listenerPoseMode)) {
    errors.push(`${label} listener pose mode is unavailable`);
  }
  const derivedListenerPoseMode = deriveAudioListenerPoseMode(value.capabilities);
  if (value.listenerPoseMode !== value.expectedListenerPoseMode
    || value.listenerPoseMode !== derivedListenerPoseMode) {
    errors.push(`${label} listener pose mode does not match native capabilities`);
  }
  if (derivedListenerPoseMode === null) {
    errors.push(`${label} native AudioListener capability probe is incomplete`);
  }
  return errors;
}

function soloCycleFailures(value, expectedLabel) {
  if (!record(value)) return [`${expectedLabel} solo cycle is missing`];
  const label = `${expectedLabel} solo cycle`;
  const errors = [];
  if (value.label !== expectedLabel) errors.push(`${label} label mismatch`);
  if (value.gameStarted !== true || value.matchPhase !== 'active' || value.botCount !== 1) {
    errors.push(`${label} did not enter an exact one-bot active match`);
  }
  if (value.requestedBackend !== 'webgpu' || value.backend !== 'webgpu' || value.failClosed !== true
    || value.deviceLost !== false || value.uncapturedErrors !== 0) {
    errors.push(`${label} did not use fail-closed native WebGPU`);
  }
  if (value.qualityAssetState !== 'ready' || value.post?.depthAwareBloom !== true
    || value.post?.advancedGraphics?.bloomStrength <= 0) {
    errors.push(`${label} did not retain Quality assets and post effects`);
  }
  if (!FIREFOX_USER_AGENT.test(value.userAgent ?? '')) errors.push(`${label} user agent is not pinned Firefox`);
  if (value.pointerLock !== true || value.adsHeldObserved !== true || value.adsReleasedObserved !== true) {
    errors.push(`${label} pointer-lock/ADS lifecycle is incomplete`);
  }
  if (value.canvasTarget?.elementId !== 'game' || value.canvasTarget?.topElementId !== 'game'
    || value.canvasTarget?.topElementTag !== 'canvas'
    || value.canvasTarget?.verifiedAtAction !== true
    || !Number.isSafeInteger(value.canvasTarget?.x) || value.canvasTarget.x < 0
    || !Number.isSafeInteger(value.canvasTarget?.y) || value.canvasTarget.y < 0
    || !finite(value.canvasTarget?.rect?.left) || !finite(value.canvasTarget?.rect?.top)
    || !finite(value.canvasTarget?.rect?.right) || !finite(value.canvasTarget?.rect?.bottom)
    || !finite(value.canvasTarget?.rect?.width) || value.canvasTarget.rect.width <= 0
    || !finite(value.canvasTarget?.rect?.height) || value.canvasTarget.rect.height <= 0
    || value.canvasTarget.rect.right <= value.canvasTarget.rect.left
    || value.canvasTarget.rect.bottom <= value.canvasTarget.rect.top
    || value.canvasTarget.x < value.canvasTarget.rect.left || value.canvasTarget.x > value.canvasTarget.rect.right
    || value.canvasTarget.y < value.canvasTarget.rect.top || value.canvasTarget.y > value.canvasTarget.rect.bottom) {
    errors.push(`${label} native canvas input target is not proven unobscured`);
  }
  if (value.preRetryPointerLock?.locked !== false || value.preRetryPointerLock?.surface !== 'hidden'
    || value.preRetryPointerLock?.pointerLockLifecycle !== 'denied'
    || !Number.isSafeInteger(value.preRetryPointerLock?.pointerRejectCount)
    || value.preRetryPointerLock.pointerRejectCount < 1) {
    errors.push(`${label} automatic pointer-lock request did not settle before native retry`);
  }
  errors.push(...eventStreamFailures(value.trustedEvents, value.pointerLockEvents, label));
  const soloClick = Array.isArray(value.trustedEvents)
    ? value.trustedEvents.find((event) => event?.phase === 'solo' && event.type === 'click'
      && event.button === 0 && event.trusted === true && event.targetId === 'solo')
    : null;
  const pointerLockMouseDown = Array.isArray(value.trustedEvents)
    ? value.trustedEvents.find((event) => event?.phase === 'pointer-lock' && event.type === 'mousedown'
      && event.button === 0 && event.trusted === true && event.targetId === 'game')
    : null;
  const successfulPointerLock = Array.isArray(value.pointerLockEvents)
    ? value.pointerLockEvents.find((event) => event?.type === 'pointerlockchange'
      && event.phase === 'pointer-lock' && event.trusted === true && event.lockedElementId === 'game'
      && Number.isSafeInteger(event.sequence) && Number.isSafeInteger(pointerLockMouseDown?.sequence)
      && event.sequence > pointerLockMouseDown.sequence && event.atMs >= pointerLockMouseDown.atMs)
    : null;
  const automaticPointerLockRejection = Array.isArray(value.pointerLockEvents)
    ? value.pointerLockEvents.find((event) => event?.type === 'pointerlockerror'
      && event.phase === 'solo' && event.trusted === true && event.lockedElementId === null
      && Number.isSafeInteger(event.sequence) && Number.isSafeInteger(soloClick?.sequence)
      && Number.isSafeInteger(pointerLockMouseDown?.sequence)
      && event.sequence > soloClick.sequence && event.sequence < pointerLockMouseDown.sequence
      && event.atMs >= soloClick.atMs && event.atMs <= pointerLockMouseDown.atMs)
    : null;
  if (!Array.isArray(value.pointerLockEvents)
    || !successfulPointerLock
    || !automaticPointerLockRejection
    || value.pointerLockEvents.some((event) => event?.type === 'pointerlockerror' && event.phase === 'pointer-lock')
    || value.pointerLockEvents.some((event) => !Number.isSafeInteger(event?.sequence)
      || !finite(event?.atMs) || event.atMs < 0)
    || value.pointerLockLifecycle?.surface !== 'hidden'
    || value.pointerLockLifecycle?.state !== 'locked'
    || !Number.isSafeInteger(value.pointerLockLifecycle?.rejectCount)
    || value.pointerLockLifecycle.rejectCount < 0) {
    errors.push(`${label} native pointer-lock event/lifecycle proof is incomplete`);
  }
  if (value.ammo?.beforeFire !== 2 || value.ammo?.afterFire !== 1
    || !Number.isSafeInteger(value.ammo?.afterReload) || value.ammo.afterReload <= 1
    || value.reload?.observedStart !== true || value.reload?.observedCompletion !== true) {
    errors.push(`${label} trusted fire/reload mutation is incomplete`);
  }
  errors.push(...inputEventFailures(value.trustedEvents, label));
  errors.push(...frameFailures(value.frames, label));
  errors.push(...audioFailures(value.audio, label));
  errors.push(...faultFailures(value.faults, label));
  return errors;
}

function screenshotFailures(value, expectedPath, label) {
  if (!record(value) || value.path !== expectedPath || !SHA256.test(value.sha256 ?? '')
    || !Number.isSafeInteger(value.bytes) || value.bytes < 1_024
    || !Number.isSafeInteger(value.width) || value.width < 800
    || !Number.isSafeInteger(value.height) || value.height < 400) {
    return [`${label} screenshot identity is invalid`];
  }
  return [];
}

function ownershipFailures(value, expected) {
  if (!record(value)) return ['owned endpoint proof is missing'];
  const errors = [];
  if (value.preview?.host !== '127.0.0.1' || value.preview?.port !== expected.previewPort
    || value.preview?.baseUrl !== expected.baseUrl || value.preview?.localOnly !== true) {
    errors.push('owned preview identity mismatch');
  }
  if (value.peer?.host !== '127.0.0.1' || value.peer?.port !== expected.peerPort
    || value.peer?.path !== expected.peerPath || value.peer?.localOnly !== true
    || !OWNED_PEER_PATH.test(value.peer?.path ?? '')) {
    errors.push('owned PeerJS identity mismatch');
  }
  if (!Array.isArray(value.drivers) || value.drivers.length !== 2) {
    errors.push('exactly two owned GeckoDriver endpoints are required');
  } else {
    const expectedRoles = ['host', 'guest'];
    for (const [index, role] of expectedRoles.entries()) {
      const driver = value.drivers[index];
      if (driver?.role !== role || driver.host !== '127.0.0.1'
        || driver.port !== expected.driverPorts[index] || driver.localOnly !== true
        || typeof driver.sessionId !== 'string' || driver.sessionId.length < 8
        || !Number.isSafeInteger(driver.geckodriverProcessId) || driver.geckodriverProcessId <= 0
        || !Number.isSafeInteger(driver.firefoxProcessId) || driver.firefoxProcessId <= 0
        || typeof driver.profile !== 'string' || driver.profile.length < 3
        || driver.bidiPort !== expected.bidiPorts[index] || driver.bidiSubscribed !== true
        || driver.bidiWebSocketUrl !== `ws://127.0.0.1:${expected.bidiPorts[index]}/session/${driver.sessionId}`) {
        errors.push(`${role} GeckoDriver ownership is incomplete`);
      }
    }
    if (value.drivers[0]?.sessionId === value.drivers[1]?.sessionId
      || value.drivers[0]?.geckodriverProcessId === value.drivers[1]?.geckodriverProcessId
      || value.drivers[0]?.firefoxProcessId === value.drivers[1]?.firefoxProcessId
      || value.drivers[0]?.profile === value.drivers[1]?.profile) {
      errors.push('host and guest must be independent Firefox sessions, processes and profiles');
    }
  }
  return errors;
}

function cleanupFailures(value, ownership, expected) {
  if (!record(value)) return ['owned cleanup proof is missing'];
  const expectedPorts = [expected.previewPort, expected.peerPort, ...expected.driverPorts, ...expected.bidiPorts];
  const expectedFirefoxProcessIds = ownership?.drivers?.map((driver) => driver.firefoxProcessId) ?? [];
  const expectedGeckodriverProcessIds = ownership?.drivers?.map((driver) => driver.geckodriverProcessId) ?? [];
  if (value.allOwnedPortsReleased !== true || value.allOwnedProcessesExited !== true
    || JSON.stringify(value.ports) !== JSON.stringify(expectedPorts.map((port) => ({ port, free: true })))
    || JSON.stringify(value.firefoxProcessIds) !== JSON.stringify(expectedFirefoxProcessIds)
    || JSON.stringify(value.geckodriverProcessIds) !== JSON.stringify(expectedGeckodriverProcessIds)) {
    return ['owned Firefox/GeckoDriver/port cleanup proof is incomplete'];
  }
  return [];
}

function toolchainFailures(value) {
  if (!record(value)) return ['toolchain proof is missing'];
  const errors = [];
  const expected = PASS70_FIREFOX_GECKODRIVER_IDENTITY;
  if (value.firefox?.executableName !== expected.firefox.executableName
    || value.firefox?.sha256 !== expected.firefox.sha256
    || value.firefox?.expectedVersion !== expected.firefox.version
    || value.firefox?.headless !== true
    || value.firefox?.automation !== 'raw-w3c-http+bidi'
    || !Array.isArray(value.firefox?.sessionVersions)
    || value.firefox.sessionVersions.length !== 2
    || value.firefox.sessionVersions.some((version) => version !== expected.firefox.version)
    || !Array.isArray(value.firefox?.userAgents)
    || value.firefox.userAgents.length !== 2
    || value.firefox.userAgents.some((userAgent) => !FIREFOX_USER_AGENT.test(userAgent))) {
    errors.push('Firefox binary/session provenance mismatch');
  }
  if (value.geckodriver?.version !== expected.geckodriver.version
    || value.geckodriver?.releaseTag !== expected.geckodriver.releaseTag
    || value.geckodriver?.releaseUrl !== expected.geckodriver.releaseUrl
    || value.geckodriver?.archive?.name !== expected.geckodriver.archiveName
    || value.geckodriver?.archive?.url !== expected.geckodriver.archiveUrl
    || value.geckodriver?.archive?.bytes !== expected.geckodriver.archiveSize
    || value.geckodriver?.archive?.sha256 !== expected.geckodriver.archiveSha256
    || value.geckodriver?.archive?.entries?.length !== 1
    || value.geckodriver.archive.entries[0] !== expected.geckodriver.executableName
    || !SHA256.test(value.geckodriver?.executableSha256 ?? '')
    || !String(value.geckodriver?.versionOutput ?? '').startsWith(`geckodriver ${expected.geckodriver.version}`)) {
    errors.push('official GeckoDriver archive/executable provenance mismatch');
  }
  return errors;
}

function multiplayerFailures(value) {
  if (!record(value)) return ['Firefox multiplayer proof is missing'];
  const errors = [];
  const initialHostMembers = value.initialMemberIds?.host;
  const initialGuestMembers = value.initialMemberIds?.guest;
  const rejoinedHostMembers = value.rejoinedMemberIds?.host;
  const rejoinedGuestMembers = value.rejoinedMemberIds?.guest;
  if (value.hostGuestIndependentSessions !== true || value.initiallyConverged !== true
    || !Array.isArray(initialHostMembers) || initialHostMembers.length !== 2
    || new Set(initialHostMembers).size !== 2
    || JSON.stringify(initialHostMembers) !== JSON.stringify(initialGuestMembers)
    || typeof value.initialHostId !== 'string' || !initialHostMembers.includes(value.initialHostId)
    || typeof value.initialGuestId !== 'string' || !initialHostMembers.includes(value.initialGuestId)
    || value.initialHostId === value.initialGuestId
    || value.hostedBotCountBefore?.host !== 0 || value.hostedBotCountBefore?.guest !== 0
    || value.remotePlayersBefore?.host !== 1 || value.remotePlayersBefore?.guest !== 1
    || value.guestPageDestroyed !== true || value.hostObservedDisconnect !== true
    || typeof value.originalGuestWindow !== 'string' || typeof value.replacementGuestWindow !== 'string'
    || value.originalGuestWindow === value.replacementGuestWindow
    || !Array.isArray(value.remainingGuestWindowsAfterClose)
    || value.remainingGuestWindowsAfterClose.includes(value.originalGuestWindow)
    || !value.remainingGuestWindowsAfterClose.includes(value.replacementGuestWindow)
    || value.rejoinAvailable !== true || value.rejoinIdentityPreserved !== true
    || value.rejoinedGuestId !== value.initialGuestId || value.activeAfterRejoin !== true
    || value.membersConnectedAfterRejoin !== true || value.rosterPreservedAfterRejoin !== true
    || JSON.stringify(rejoinedHostMembers) !== JSON.stringify(rejoinedGuestMembers)
    || JSON.stringify(rejoinedHostMembers) !== JSON.stringify(initialHostMembers)
    || value.hostedBotCountAfter?.host !== 0 || value.hostedBotCountAfter?.guest !== 0
    || value.remotePlayersAfter?.host !== 1 || value.remotePlayersAfter?.guest !== 1) {
    errors.push('Firefox host/guest disconnect/rejoin proof is incomplete');
  }
  const expectedActions = [
    ['host', value.trustedLobbyEvents?.host],
    ['guest', value.trustedLobbyEvents?.guest],
    ['rejoined guest', value.trustedLobbyEvents?.rejoinedGuest],
  ];
  const requiredPhases = {
    host: ['host', 'host-ready', 'host-start'],
    guest: ['join', 'guest-ready'],
    'rejoined guest': ['rejoin'],
  };
  for (const [label, events] of expectedActions) {
    if (!Array.isArray(events) || events.some((event) => event?.trusted !== true)) {
      errors.push(`${label} lobby input is not entirely trusted`);
      continue;
    }
    for (const phase of requiredPhases[label]) {
      if (!events.some((event) => event.phase === phase && event.type === 'click' && event.trusted === true)) {
        errors.push(`${label} is missing trusted ${phase} click`);
      }
    }
  }
  errors.push(...frameFailures(value.frames?.host, 'multiplayer host'));
  errors.push(...frameFailures(value.frames?.guest, 'multiplayer guest'));
  errors.push(...faultFailures(value.faults?.host, 'multiplayer host'));
  errors.push(...faultFailures(value.faults?.guest, 'multiplayer guest'));
  return errors;
}

export function pass70FirefoxGeckodriverReceiptFailures(value, expected) {
  const identity = PASS70_FIREFOX_GECKODRIVER_IDENTITY;
  if (!record(value)) return ['receipt must be an object'];
  const errors = [];
  if (value.schema !== identity.schema || value.schemaVersion !== identity.schemaVersion
    || value.status !== 'PASS' || value.gate !== identity.gate || value.releasePass !== identity.releasePass) {
    errors.push('receipt identity mismatch');
  }
  if (!SHA40.test(expected.sourceSha ?? '') || value.sourceSha !== expected.sourceSha) errors.push('receipt source SHA mismatch');
  if (!exactKeys(value.sourceState, ['startingSha', 'endingSha', 'cleanBefore', 'cleanAfter'])
    || value.sourceState.startingSha !== expected.sourceSha || value.sourceState.endingSha !== expected.sourceSha
    || value.sourceState.cleanBefore !== true || value.sourceState.cleanAfter !== true) {
    errors.push('clean exact source before/after proof is incomplete');
  }
  errors.push(...pass70StagedCandidateFailures(value.servedCandidateBefore, expected));
  errors.push(...pass70StagedCandidateFailures(value.servedCandidateAfter, expected));
  if (JSON.stringify(value.servedCandidateBefore) !== JSON.stringify(value.servedCandidateAfter)) {
    errors.push('served candidate drifted during Firefox verification');
  }
  errors.push(...toolchainFailures(value.toolchain));
  errors.push(...ownershipFailures(value.ownership, expected));
  errors.push(...cleanupFailures(value.cleanup, value.ownership, expected));
  if (!Array.isArray(value.soloCycles) || value.soloCycles.length !== 2) {
    errors.push('receipt requires exact cold and warm solo cycles');
  } else {
    errors.push(...soloCycleFailures(value.soloCycles[0], 'cold'));
    errors.push(...soloCycleFailures(value.soloCycles[1], 'warm'));
  }
  errors.push(...multiplayerFailures(value.multiplayer));
  errors.push(...screenshotFailures(
    value.screenshots?.solo,
    'artifacts/pass70/firefox-geckodriver/firefox-warm-one-bot.png',
    'Firefox solo',
  ));
  errors.push(...screenshotFailures(
    value.screenshots?.multiplayer,
    'artifacts/pass70/firefox-geckodriver/firefox-multiplayer-rejoin.png',
    'Firefox multiplayer',
  ));
  if (!Array.isArray(value.errors) || value.errors.length !== 0) errors.push('receipt errors must be empty');
  return errors;
}

export function assertPass70FirefoxGeckodriverReceipt(value, expected) {
  const failures = pass70FirefoxGeckodriverReceiptFailures(value, expected);
  if (failures.length > 0) throw new Error(`Invalid Pass 70 Firefox GeckoDriver receipt: ${failures.join('; ')}`);
}
