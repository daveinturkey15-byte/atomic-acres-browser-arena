import { multiplayerStabilityReceiptFailures } from './pass66-multiplayer-stability-contract.mjs';

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OWNED_PEER_PATH = /^\/peerjs-[a-f0-9]{24}$/u;
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic|fallback|unavailable|unknown/iu;
const PARITY_VIEWPORT = Object.freeze([2_560, 1_440]);
const PARITY_CONTRACT = 'same-content-matched-mode-native-webgpu-firefox-chrome-80pct-median-125pct-p95-v2';
const PARITY_ROUTE_PARAMETERS = Object.freeze({
  release: 'latest', map: 'atomic-acres', renderer: 'webgpu', requireWebGPU: '1', render: 'quality',
  externalServices: 'off', multiplayerQa: '1',
});

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function expectedParityRoute(baseUrl, seed) {
  try {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries({ ...PARITY_ROUTE_PARAMETERS, seed })) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function nextOuterRectForContentViewport(sample, target = PARITY_VIEWPORT) {
  if (!record(sample) || !Array.isArray(target) || target.length !== 2
    || ![sample.innerWidth, sample.innerHeight, sample.outerWidth, sample.outerHeight, ...target]
      .every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('content viewport resize requires positive integer inner, outer and target dimensions');
  }
  return Object.freeze({
    width: sample.outerWidth + target[0] - sample.innerWidth,
    height: sample.outerHeight + target[1] - sample.innerHeight,
  });
}

function ownedPeerFailures(value, expected, label) {
  if (!record(value) || value.host !== '127.0.0.1'
    || value.port !== expected.peerPort || value.path !== expected.peerPath
    || value.localOnly !== true || !OWNED_PEER_PATH.test(value.path ?? '')) {
    return [`${label} owned PeerJS identity mismatch`];
  }
  return [];
}

function exactParityViewport(value) {
  return JSON.stringify(value) === JSON.stringify(PARITY_VIEWPORT);
}

export function hardwareAdapterVendor(label) {
  if (typeof label !== 'string') return null;
  const normalized = label.toLowerCase();
  if (/\bnvidia\b|(?:^|\W)(?:0x)?10de(?:\W|$)/u.test(normalized)) return 'nvidia';
  if (/\bamd\b|\bradeon\b|advanced micro devices|(?:^|\W)(?:0x)?1002(?:\W|$)/u.test(normalized)) return 'amd';
  if (/\bintel\b|(?:^|\W)(?:0x)?8086(?:\W|$)/u.test(normalized)) return 'intel';
  if (/\bapple\b|(?:^|\W)(?:0x)?106b(?:\W|$)/u.test(normalized)) return 'apple';
  if (/\bqualcomm\b|\badreno\b|(?:^|\W)(?:0x)?5143(?:\W|$)/u.test(normalized)) return 'qualcomm';
  return null;
}

function userAgentMajorVersion(userAgent, family) {
  if (typeof userAgent !== 'string') return null;
  const match = family === 'firefox'
    ? /Firefox\/(\d+)/u.exec(userAgent)
    : /(?:Chrome|HeadlessChrome)\/(\d+)/u.exec(userAgent);
  return match?.[1] ?? null;
}

function browserMajorVersion(version) {
  return typeof version === 'string' ? /^(\d+)/u.exec(version)?.[1] ?? null : null;
}

function viewportControlFailures(value, mechanism, label) {
  if (!record(value) || value.mechanism !== mechanism || value.matched !== true
    || !exactParityViewport(value.requestedContentViewport)
    || value.final?.innerWidth !== PARITY_VIEWPORT[0]
    || value.final?.innerHeight !== PARITY_VIEWPORT[1]
    || value.final?.devicePixelRatio !== 1) {
    return [`${label} content viewport control is invalid`];
  }
  if (mechanism === 'webdriver-outer-compensation') {
    if (!Array.isArray(value.attempts) || value.attempts.length < 1 || value.attempts.length > 6) {
      return [`${label} content viewport compensation attempts are invalid`];
    }
    const lastAttempt = value.attempts.at(-1);
    const requested = lastAttempt?.requestedOuterRect;
    const sampled = lastAttempt?.sample;
    if (![requested?.width, requested?.height, sampled?.outerWidth, sampled?.outerHeight]
      .every((dimension) => Number.isSafeInteger(dimension) && dimension > 0)
      || sampled?.windowRect?.width !== requested.width || sampled?.windowRect?.height !== requested.height
      || sampled.outerWidth !== sampled.windowRect.width || sampled.outerHeight !== sampled.windowRect.height
      || JSON.stringify(value.final) !== JSON.stringify(sampled)) {
      return [`${label} content viewport compensation attempts are not bound to the final outer rect`];
    }
  }
  return [];
}

function nativeWebGpuCycleFailures(cycle, label) {
  const errors = [];
  if (!record(cycle) || cycle.label !== label || cycle.requestedBackend !== 'webgpu'
    || cycle.backend !== 'webgpu' || cycle.failClosed !== false || cycle.deviceLost !== false
    || cycle.uncapturedErrors !== 0 || cycle.softwareAdapter !== false
    || typeof cycle.adapterLabel !== 'string' || cycle.adapterLabel.length < 3
    || SOFTWARE_ADAPTER.test(cycle.adapterLabel) || cycle.adapterClass !== 'GPUAdapter'
    || cycle.deviceClass !== 'GPUDevice' || cycle.navigatorGpu !== true
    || cycle.adapterVendor !== hardwareAdapterVendor(cycle.adapterLabel)
    || cycle.adapterVendor === null
    || cycle.visibilityState !== 'visible' || cycle.documentHasFocus !== true
    || cycle.liveProfile !== 'blender'
    || cycle.qualityAssetState !== 'ready' || cycle.post?.depthAwareBloom !== true
    || !finite(cycle.post?.advancedGraphics?.bloomStrength)
    || cycle.post.advancedGraphics.bloomStrength <= 0
    || !finite(cycle.post?.advancedGraphics?.volumetricScale)
    || cycle.post.advancedGraphics.volumetricScale <= 0
    || !exactParityViewport(cycle.viewport) || cycle.pixelRatio !== 1
    || !exactParityViewport(cycle.drawingBuffer)
    || cycle.gameStarted !== true || cycle.matchPhase !== 'active'
    || typeof cycle.route !== 'string' || !cycle.route.includes('/channels/the-big-one/?')
    || typeof cycle.userAgent !== 'string' || cycle.userAgent.length < 12) {
    errors.push(`${label} native-WebGPU admission identity is invalid`);
  }
  const graphics = cycle?.graphicsContract;
  if (!record(graphics) || graphics.arenaId !== 'atomic-acres' || graphics.humanProfile !== 'quality'
    || graphics.internalRenderProfile !== 'blender' || graphics.assets?.qualityAssetState !== 'ready'
    || graphics.assets?.qualityArtRootVisible !== true
    || graphics.assets?.proceduralRootActuallyVisible !== false
    || graphics.assets?.overlappingPrimaryArenaRoots !== false
    || graphics.effects?.depthAwareBloom !== true
    || !finite(graphics.effects?.advancedGraphics?.bloomStrength)
    || graphics.effects.advancedGraphics.bloomStrength <= 0
    || !finite(graphics.effects?.advancedGraphics?.volumetricScale)
    || graphics.effects.advancedGraphics.volumetricScale <= 0
    || !record(graphics.effects?.lighting)
    || graphics.effects?.sky?.linearHdr !== true
    || graphics.effects?.grass?.enabled !== true
    || graphics.effects?.atmosphere?.enabled !== true
    || !record(graphics.effects?.water)
    || graphics.renderer?.requestedBackend !== 'webgpu'
    || graphics.renderer?.actualBackend !== 'webgpu'
    || graphics.renderer?.pixelRatio !== 1
    || !exactParityViewport(graphics.renderer?.drawingBuffer)
    || !exactParityViewport(graphics.renderer?.viewport)
    || graphics.renderer?.shadows !== true || graphics.renderer?.authoredShadows !== true
    || graphics.renderer?.shadowMode !== 'static' || graphics.renderer?.canvasAntialias !== true
    || graphics.renderer?.canvasSamples !== 4 || graphics.renderer?.principalHdrSamples !== 4
    || graphics.renderer?.bloomSamples !== 0
    || graphics.renderer?.renderPipelineApi !== 'three-r185-render-pipeline'
    || typeof graphics.assets?.asset !== 'string'
    || !graphics.assets.asset.includes('atomic-acres-blender-arena.glb')
    || !Number.isSafeInteger(graphics.assets?.meshCount) || graphics.assets.meshCount <= 0
    || !Number.isSafeInteger(graphics.assets?.triangleCount) || graphics.assets.triangleCount <= 0
    || graphics.assets?.surfaceSeparationPass !== true
    || graphics.assets?.worldIdentityPass !== true
    || graphics.assets?.proceduralWorldHidden !== true) {
    errors.push(`${label} matched Quality graphics/assets/effects contract is invalid`);
  }
  const performance = cycle?.performance;
  if (!record(performance) || performance.metricSource !== 'webgpu-submission'
    || !finite(performance.elapsedMs) || performance.elapsedMs < 5_000
    || !Number.isSafeInteger(performance.callbackSampleCount) || performance.callbackSampleCount < 150
    || !finite(performance.callbackFps) || performance.callbackFps < 30
    || Math.abs(performance.callbackFps - performance.callbackSampleCount * 1_000 / performance.elapsedMs) > 1e-9
    || performance.submissionSampleCount !== 180
    || !Number.isSafeInteger(performance.submissionDelta) || performance.submissionDelta < 180
    || !Number.isSafeInteger(performance.completionDelta)
    || performance.completionDelta < performance.submissionDelta - 4
    || !Number.isSafeInteger(performance.frameDelta) || performance.frameDelta < performance.submissionDelta
    || performance.completionCaughtUp !== true || !finite(performance.p50FrameTimeMs)
    || performance.p50FrameTimeMs <= 0 || performance.p50FrameTimeMs > 34
    || !finite(performance.p95FrameTimeMs) || performance.p95FrameTimeMs <= 0
    || performance.p95FrameTimeMs > 50 || !finite(performance.p99FrameTimeMs)
    || performance.p99FrameTimeMs < performance.p95FrameTimeMs
    || performance.p95FrameTimeMs < performance.p50FrameTimeMs
    || !finite(performance.maximumFrameTimeMs)
    || performance.maximumFrameTimeMs < performance.p99FrameTimeMs
    || performance.maximumFrameTimeMs <= 0 || performance.maximumFrameTimeMs > 250
    || !['healthy', 'synchronous'].includes(performance.finalPresentation?.status)
    || !Number.isSafeInteger(performance.finalPresentation?.submissionSequence)
    || !Number.isSafeInteger(performance.finalPresentation?.completedSequence)
    || !Number.isSafeInteger(performance.finalPresentation?.maximumInFlightSubmissions)
    || performance.finalPresentation.maximumInFlightSubmissions < 0
    || performance.finalPresentation.completedSequence
      < performance.finalPresentation.submissionSequence
        - performance.finalPresentation.maximumInFlightSubmissions) {
    errors.push(`${label} WebGPU submission performance evidence is invalid`);
  }
  return errors;
}

export function stagedTopologyFailures(
  value,
  expectedSourceSha,
  expectedReleasePass = 'PASS 66',
  expectedSchemaVersion = 4,
) {
  const errors = [];
  if (!SHA40.test(expectedSourceSha ?? '')) errors.push('expected source SHA is invalid');
  if (!Number.isSafeInteger(expectedSchemaVersion) || expectedSchemaVersion < 1) {
    errors.push('expected topology schemaVersion is invalid');
  }
  if (!record(value)) return [...errors, 'topology receipt must be an object'];
  if (value.schemaVersion !== expectedSchemaVersion) {
    errors.push(`topology schemaVersion must be ${expectedSchemaVersion}`);
  }
  if (value.sourceSha !== expectedSourceSha) errors.push('topology sourceSha mismatch');
  if (value.releasePass !== expectedReleasePass) errors.push(`topology releasePass must be ${expectedReleasePass}`);
  if (value.root?.kind !== 'chooser-only') errors.push('topology root must remain chooser-only');
  const candidate = value.channels?.experimental;
  if (!record(candidate)) return [...errors, 'topology experimental channel is missing'];
  if (candidate.schemaVersion !== expectedSchemaVersion || candidate.channel !== 'the-big-one'
    || candidate.releasePass !== expectedReleasePass || candidate.sourceSha !== expectedSourceSha
    || candidate.path !== 'channels/the-big-one') {
    errors.push('topology experimental identity mismatch');
  }
  if (!Number.isSafeInteger(candidate.exactRootFileCount) || candidate.exactRootFileCount < 2) {
    errors.push('topology experimental file count is invalid');
  }
  if (!SHA256.test(candidate.treeSha256 ?? '')) errors.push('topology experimental tree digest is invalid');
  return errors;
}

export function servedCandidateFailures(value, expected) {
  if (!record(value)) return ['served candidate provenance must be an object'];
  const errors = [];
  if (value.schemaVersion !== (expected.topologySchemaVersion ?? 4) || value.channel !== 'the-big-one'
    || value.releasePass !== (expected.releasePass ?? 'PASS 66') || value.path !== 'channels/the-big-one') {
    errors.push('served candidate identity mismatch');
  }
  if (value.sourceSha !== expected.sourceSha) errors.push('served candidate sourceSha mismatch');
  if (value.treeSha256 !== expected.treeSha256) errors.push('served candidate tree digest mismatch');
  if (value.exactRootFileCount !== expected.exactRootFileCount) errors.push('served candidate file count mismatch');
  return errors;
}

export function ownedBrowserVerifierReceiptFailures(value, expected) {
  if (!record(value)) return ['owned browser verifier receipt must be an object'];
  const errors = [];
  const expectedSchemaVersion = expected.gate === 'multiplayer-stability' ? 3 : 1;
  if (value.schemaVersion !== expectedSchemaVersion) {
    errors.push(`receipt schemaVersion must be ${expectedSchemaVersion}`);
  }
  if (value.status !== 'PASS') errors.push('receipt status must be PASS');
  if (value.gate !== expected.gate) errors.push('receipt gate mismatch');
  if (value.sourceSha !== expected.sourceSha) errors.push('receipt sourceSha mismatch');
  errors.push(...servedCandidateFailures(value.servedCandidate, expected));

  if (expected.gate === 'installed-firefox') {
    if (value.browser !== 'installed-firefox' || value.releasePass !== expected.releasePass
      || value.topologySchemaVersion !== expected.topologySchemaVersion) {
      errors.push('Firefox receipt release identity mismatch');
    }
    errors.push(...servedCandidateFailures(value.servedCandidateAfter, expected));
    if (!Array.isArray(value.cycles) || value.cycles.length !== 2
      || value.cycles[0]?.label !== 'cold' || value.cycles[1]?.label !== 'warm') {
      errors.push('Firefox receipt must contain cold then warm cycles');
    } else {
      errors.push(...nativeWebGpuCycleFailures(value.cycles[0], 'cold'));
      errors.push(...nativeWebGpuCycleFailures(value.cycles[1], 'warm'));
    }
    const warm = value.cycles?.[1];
    const parity = value.parity;
    const chrome = parity?.chrome;
    const chromeWarm = chrome?.cycles?.[1];
    const computedFirefoxMedianFps = 1_000 / warm?.performance?.p50FrameTimeMs;
    const computedChromeMedianFps = 1_000 / chromeWarm?.performance?.p50FrameTimeMs;
    const computedMedianRatio = computedFirefoxMedianFps / computedChromeMedianFps;
    const computedP95Ratio = warm?.performance?.p95FrameTimeMs / chromeWarm?.performance?.p95FrameTimeMs;
    const firefoxVersion = value.toolchain?.firefox?.browserVersion;
    const chromeVersion = chrome?.browserVersion;
    const firefoxUserAgent = value.toolchain?.firefox?.userAgent;
    const chromeUserAgent = chrome?.userAgent;
    const expectedColdRoute = expectedParityRoute(expected.baseUrl, 'pass73-installed-browser-webgpu-cold');
    const expectedWarmRoute = expectedParityRoute(expected.baseUrl, 'pass73-installed-browser-webgpu-parity');
    if (parity?.contract !== PARITY_CONTRACT
      || parity.seed !== 'pass73-installed-browser-webgpu-parity'
      || JSON.stringify(parity.routeParameters) !== JSON.stringify(PARITY_ROUTE_PARAMETERS)
      || !exactParityViewport(parity.viewport)
      || parity.profile !== 'quality' || parity.internalRenderProfile !== 'blender'
      || parity.map !== 'atomic-acres' || parity.backend !== 'webgpu'
      || !record(chrome) || !Array.isArray(chrome.cycles) || chrome.cycles.length !== 2
      || chrome.cycles[0]?.label !== 'cold' || chrome.cycles[1]?.label !== 'warm'
      || chrome.headless !== value.toolchain?.firefox?.headless
      || chrome.presentationMode !== value.toolchain?.firefox?.presentationMode
      || parity.presentationMode !== chrome.presentationMode
      || value.hiddenHeadful !== !value.toolchain?.firefox?.headless
      || chrome.nativeUserAgent !== true || value.toolchain?.firefox?.nativeUserAgent !== true
      || !['default', 'hardware'].includes(value.toolchain?.firefox?.graphicsMode)
      || !SHA256.test(chrome.executableSha256 ?? '')
      || !SHA256.test(value.toolchain?.firefox?.executableSha256 ?? '')
      || typeof chrome.browserVersion !== 'string' || chrome.browserVersion.length < 3
      || typeof value.toolchain?.firefox?.browserVersion !== 'string'
      || value.toolchain.firefox.browserVersion.length < 3
      || value.toolchain?.chrome?.executableSha256 !== chrome.executableSha256
      || value.toolchain?.chrome?.browserVersion !== chrome.browserVersion
      || value.toolchain?.chrome?.headless !== chrome.headless
      || value.toolchain?.chrome?.presentationMode !== chrome.presentationMode
      || value.toolchain?.chrome?.nativeUserAgent !== true
      || value.toolchain?.chrome?.userAgent !== chrome.userAgent
      || value.toolchain?.firefox?.executable !== value.executable
      || value.toolchain?.chrome?.executable !== chrome.executable
      || !/^Mozilla\/5\.0.*Firefox\/[0-9.]+/u.test(value.toolchain?.firefox?.userAgent ?? '')
      || !/^Mozilla\/5\.0.*(?:Chrome|HeadlessChrome)\/[0-9.]+/u.test(chrome.userAgent ?? '')
      || userAgentMajorVersion(firefoxUserAgent, 'firefox') !== browserMajorVersion(firefoxVersion)
      || userAgentMajorVersion(chromeUserAgent, 'chrome') !== browserMajorVersion(chromeVersion)
      || warm?.userAgent !== value.toolchain?.firefox?.userAgent
      || value.cycles[0]?.userAgent !== warm?.userAgent
      || chrome.cycles[1]?.userAgent !== chrome.userAgent
      || chrome.cycles[0]?.userAgent !== chrome.cycles[1]?.userAgent
      || warm?.adapterVendor !== chrome.cycles[1]?.adapterVendor
      || value.cycles[0]?.adapterVendor !== warm?.adapterVendor
      || chrome.cycles[0]?.adapterVendor !== chrome.cycles[1]?.adapterVendor
      || value.firefoxSessionClosedBeforeChrome !== true
      || parity.identicalGraphicsContract !== true
      || JSON.stringify(value.cycles?.[0]?.graphicsContract) !== JSON.stringify(chrome.cycles[0]?.graphicsContract)
      || JSON.stringify(warm?.graphicsContract) !== JSON.stringify(chrome.cycles[1]?.graphicsContract)
      || expectedColdRoute === null || value.cycles?.[0]?.route !== expectedColdRoute
      || chrome.cycles[0]?.route !== expectedColdRoute
      || expectedWarmRoute === null || warm?.route !== expectedWarmRoute
      || chrome.cycles[1]?.route !== expectedWarmRoute
      || !finite(parity.firefoxMedianThroughputFps) || parity.firefoxMedianThroughputFps <= 0
      || Math.abs(parity.firefoxMedianThroughputFps - computedFirefoxMedianFps) > 1e-9
      || !finite(parity.chromeMedianThroughputFps) || parity.chromeMedianThroughputFps <= 0
      || Math.abs(parity.chromeMedianThroughputFps - computedChromeMedianFps) > 1e-9
      || !finite(parity.medianThroughputRatio) || parity.medianThroughputRatio < 0.8
      || Math.abs(parity.medianThroughputRatio - computedMedianRatio) > 1e-9
      || !finite(parity.p95FrameTimeRatio) || parity.p95FrameTimeRatio <= 0
      || Math.abs(parity.p95FrameTimeRatio - computedP95Ratio) > 1e-9
      || parity.p95FrameTimeRatio > 1.25
      || parity.passed !== true) {
      errors.push('Firefox receipt lacks paired installed Chrome native-WebGPU parity');
    }
    if (record(chrome) && Array.isArray(chrome.cycles) && chrome.cycles.length === 2) {
      errors.push(...nativeWebGpuCycleFailures(chrome.cycles[0], 'cold'));
      errors.push(...nativeWebGpuCycleFailures(chrome.cycles[1], 'warm'));
    }
    errors.push(...viewportControlFailures(
      value.viewportControl?.firefox,
      'webdriver-outer-compensation',
      'Firefox',
    ));
    errors.push(...viewportControlFailures(
      value.viewportControl?.chrome,
      'playwright-content-viewport',
      'Chrome',
    ));
    if (!record(value.sourceState) || value.sourceState.startingSha !== expected.sourceSha
      || value.sourceState.endingSha !== expected.sourceSha
      || value.sourceState.cleanBefore !== true || value.sourceState.cleanAfter !== true) {
      errors.push('Firefox clean source before/after proof is incomplete');
    }
  } else if (expected.gate === 'private-lobby') {
    if (value.schema !== 'atomic-acres/pass66-private-lobby@2') errors.push('private-lobby schema mismatch');
    errors.push(...ownedPeerFailures(value.ownedPeer, expected, 'private-lobby'));
    if (!Array.isArray(value.errors) || value.errors.length !== 0) errors.push('private-lobby browser errors must be empty');
    if (value.soloHostNoBots?.startActsAsReadyCommit !== true || value.soloHostNoBots?.active !== true
      || value.soloHostNoBots?.humans !== 1 || value.soloHostNoBots?.bots !== 0
      || value.soloHostWithBots?.startActsAsReadyCommit !== true || value.soloHostWithBots?.active !== true
      || value.soloHostWithBots?.humans !== 1 || value.soloHostWithBots?.bots !== 4) {
      errors.push('private-lobby solo host-start proof is incomplete');
    }
    if (value.rejoinRecovered !== true || value.rejoinIdentityPreserved !== true
      || value.sixPlayersAdmitted !== true || value.allReady !== true) {
      errors.push('private-lobby convergence proof is incomplete');
    }
  } else if (expected.gate === 'pass61-netcode') {
    if (value.schema !== 'atomic-acres/pass61-authoritative-netcode@1') errors.push('Pass 61 netcode schema mismatch');
    errors.push(...ownedPeerFailures(value.ownedPeer, expected, 'Pass 61 netcode'));
    if (!Array.isArray(value.errors) || value.errors.length !== 0) errors.push('Pass 61 netcode browser errors must be empty');
    if (value.hostAccepted !== 7 || value.guestCreated !== 7 || value.guestConfirmed !== 7
      || !finite(value.hostHealthAfter) || value.hostHealthAfter >= 100) {
      errors.push('Pass 61 netcode authoritative damage counts are incomplete');
    }
    if (value.exactAgreement !== true || value.resolverMatchesReportedRewind !== true
      || value.delayFitsRewindBudget !== true || value.transportTimingCaptured !== true) {
      errors.push('Pass 61 netcode timing and agreement proof is incomplete');
    }
    if (!Array.isArray(value.resolutionTraces) || value.resolutionTraces.length !== 7) {
      errors.push('Pass 61 netcode must retain exactly seven resolution traces');
    }
  } else if (expected.gate === 'support-operate-prompt') {
    if (value.browser !== 'chromium' || typeof value.browserVersion !== 'string' || value.browserVersion.length < 3) {
      errors.push('support prompt browser identity is invalid');
    }
    if (value.rendererPaused !== true) errors.push('support prompt renderer must remain paused for paired evidence');
    if (!Array.isArray(value.errors) || value.errors.length !== 0) errors.push('support prompt browser errors must be empty');
    if (!record(value.sourceState) || value.sourceState.startingSha !== expected.sourceSha
      || value.sourceState.endingSha !== expected.sourceSha
      || value.sourceState.cleanBefore !== true || value.sourceState.cleanAfter !== true) {
      errors.push('support prompt clean source before/after proof is incomplete');
    }
    const expectedSupportCases = ['chopper', 'piloted-drone'];
    const expectedViewports = [
      ['700x720', 700, 720],
      ['960x540', 960, 540],
      ['1280x720', 1_280, 720],
      ['2560x1440', 2_560, 1_440],
      ['3840x2160', 3_840, 2_160],
    ];
    const expectedMatrix = expectedSupportCases.flatMap((supportId) => expectedViewports.map((viewport) => [supportId, ...viewport]));
    if (value.singleExistingSurface !== true
      || JSON.stringify(value.supportCases) !== JSON.stringify(expectedSupportCases)) {
      errors.push('support prompt must use one existing top-panel surface for Chopper and Piloted Drone');
    }
    if (!Array.isArray(value.viewports) || value.viewports.length !== expectedMatrix.length) {
      errors.push('support prompt viewport evidence matrix is incomplete');
    } else {
      for (const [index, [supportId, label, width, height]] of expectedMatrix.entries()) {
        const viewport = value.viewports[index];
        const action = viewport?.actionBounds;
        const info = viewport?.infoBounds;
        const identity = `${supportId}/${label}`;
        if (viewport?.supportId !== supportId || viewport?.label !== label
          || viewport?.width !== width || viewport?.height !== height) {
          errors.push(`support prompt viewport ${identity} identity mismatch`);
          continue;
        }
        if (!record(info) || ![info.left, info.top, info.right, info.bottom, info.width, info.height].every(finite)
          || info.left < 0 || info.top < 0 || info.right > width || info.bottom > height
          || info.width <= 0 || info.height <= 0) {
          errors.push(`support prompt viewport ${identity} information bounds escape the viewport`);
        }
        if (!record(action) || ![action.left, action.top, action.right, action.bottom, action.width, action.height].every(finite)
          || action.width <= 0 || action.height <= 0 || action.height > 64
          || !record(info) || action.left < info.left || action.top < info.top
          || action.right > info.right || action.bottom > info.bottom) {
          errors.push(`support prompt viewport ${identity} is not compact and contained inside the information panel`);
        }
        if (!finite(viewport.actionFontSize) || viewport.actionFontSize < 10 || viewport.actionFontSize > 13
          || viewport.actionCount !== 1 || viewport.legacyStandalonePromptCount !== 0
          || viewport.awaitingOperation !== 'true' || !finite(viewport.horizontalOverflow)
          || viewport.horizontalOverflow > 1
          || !Array.isArray(viewport.overlappingHudSurfaces) || viewport.overlappingHudSurfaces.length !== 0
          || typeof viewport.actionText !== 'string'
          || !viewport.actionText.includes(supportId === 'chopper' ? 'CHOPPER READY' : 'DRONE READY')
          || !viewport.actionText.includes(supportId === 'chopper' ? 'AGAIN TO OPERATE' : 'AGAIN TO PILOT')) {
          errors.push(`support prompt viewport ${identity} does not prove one readable highlighted action surface`);
        }
        if (!Number.isSafeInteger(viewport.actionChangedPixelCount)
          || !Number.isSafeInteger(viewport.hiddenBackgroundDriftPixelCount)
          || viewport.hiddenBackgroundDriftPixelCount < 0 || viewport.hiddenBackgroundDriftPixelCount > 32
          || viewport.actionChangedPixelCount <= Math.max(500, viewport.hiddenBackgroundDriftPixelCount * 50)) {
          errors.push(`support prompt viewport ${identity} deterministic pixel proof is invalid`);
        }
        for (const kind of ['full', 'visible', 'hidden']) {
          const artifact = viewport.artifacts?.[kind];
          if (artifact?.path !== `artifacts/pass66/support-operate-prompt/${supportId}-${label}-${kind}.png`
            || !SHA256.test(artifact?.sha256 ?? '')) {
            errors.push(`support prompt viewport ${identity} ${kind} artifact is invalid`);
          }
        }
      }
    }
  } else if (expected.gate === 'multiplayer-stability') {
    errors.push(...multiplayerStabilityReceiptFailures(value, expected));
  } else {
    errors.push(`unsupported owned browser verifier gate ${String(expected.gate)}`);
  }
  return errors;
}

export function assertStagedTopology(
  value,
  expectedSourceSha,
  expectedReleasePass = 'PASS 66',
  expectedSchemaVersion = 4,
) {
  const failures = stagedTopologyFailures(value, expectedSourceSha, expectedReleasePass, expectedSchemaVersion);
  if (failures.length > 0) throw new Error(`Invalid staged ${expectedReleasePass} topology: ${failures.join('; ')}`);
  return value.channels.experimental;
}

export function assertOwnedBrowserVerifierReceipt(value, expected) {
  const failures = ownedBrowserVerifierReceiptFailures(value, expected);
  if (failures.length > 0) throw new Error(`Invalid Pass 66 ${expected.gate} receipt: ${failures.join('; ')}`);
}
