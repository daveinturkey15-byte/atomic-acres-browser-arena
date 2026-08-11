const WEB_AUDIO_SOURCES = new Set(['standard', 'webkit']);
const PROBE_CONTEXT_STATES = new Set(['running', 'suspended']);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameContext(left, right) {
  return record(left) && record(right)
    && left.source === right.source
    && left.state === right.state;
}

function emptyRecord(value) {
  return record(value) && Object.keys(value).length === 0;
}

export function pass70ListenerPoseModeFromCapabilities(capabilities) {
  const properties = record(capabilities?.properties) ? capabilities.properties : {};
  const methods = record(capabilities?.methods) ? capabilities.methods : {};
  const audioParam = (name) => (
    properties[name]?.propertyType === 'object' && properties[name]?.valueType === 'number'
  );
  const modernPosition = ['positionX', 'positionY', 'positionZ'].every(audioParam);
  const modernOrientation = [
    'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ',
  ].every(audioParam);
  const legacyPosition = methods.setPosition === 'function';
  const legacyOrientation = methods.setOrientation === 'function';
  if ((!modernPosition && !legacyPosition) || (!modernOrientation && !legacyOrientation)) return 'unavailable';
  if (modernPosition && modernOrientation) return 'modern-audio-param';
  if (!modernPosition && !modernOrientation) return 'legacy-setters';
  return 'hybrid';
}

/**
 * Classifies what one browser run may truthfully claim about audio. Windows'
 * Playwright WebKit build can omit both Web Audio constructors. That is allowed
 * only as explicit playability-without-audio evidence after an independent
 * constructor/listener probe agrees. It is never Safari or Safari-audio proof.
 */
export function evaluatePass70BrowserAudioEvidence(input) {
  const failures = [];
  const gameContext = record(input?.gameContext) ? input.gameContext : {};
  const capabilities = record(input?.listenerCapabilities) ? input.listenerCapabilities : {};
  const expectedListenerMode = pass70ListenerPoseModeFromCapabilities(capabilities);
  const runtimeSource = gameContext.source;
  const runtimeState = gameContext.state;
  const constructorSource = capabilities.constructorSource;
  const probeContextState = capabilities.probeContextState;
  const runtimeHasAudio = WEB_AUDIO_SOURCES.has(runtimeSource) && runtimeState === 'running';
  const probeHasAudio = WEB_AUDIO_SOURCES.has(constructorSource)
    && PROBE_CONTEXT_STATES.has(probeContextState);
  const exactUnavailableProbe = constructorSource === 'unavailable'
    && probeContextState === 'unavailable'
    && emptyRecord(capabilities.properties)
    && emptyRecord(capabilities.methods);
  const exactUnavailableRuntime = runtimeSource === 'unavailable' && runtimeState === 'unavailable';
  const windowsPlaywrightWebKit = input?.engine === 'webkit'
    && input?.hostPlatform === 'win32'
    && input?.harness === 'playwright-webkit';

  if (!sameContext(gameContext, capabilities.gameContext)) {
    failures.push('runtime audio context does not match the context captured beside the independent capability probe');
  }
  if (input?.audioListenerMode !== expectedListenerMode) {
    failures.push('runtime listener pose mode does not match independently sampled listener capabilities');
  }

  let evidenceClass = 'invalid';
  if (runtimeHasAudio && probeHasAudio && runtimeSource === constructorSource
    && expectedListenerMode !== 'unavailable') {
    evidenceClass = 'full-web-audio';
  } else if (windowsPlaywrightWebKit && exactUnavailableRuntime && exactUnavailableProbe
    && input?.audioListenerMode === 'unavailable') {
    evidenceClass = 'playable-degraded-no-audio';
  } else {
    if (WEB_AUDIO_SOURCES.has(constructorSource) && !runtimeHasAudio) {
      failures.push('a Web Audio constructor is available but the game audio context is not running');
    }
    if (WEB_AUDIO_SOURCES.has(runtimeSource) && !probeHasAudio) {
      failures.push('the game reports Web Audio but the independent constructor probe did not confirm it');
    }
    if (exactUnavailableRuntime && exactUnavailableProbe && !windowsPlaywrightWebKit) {
      failures.push('degraded no-audio evidence is allowed only for Playwright WebKit running on Windows');
    }
    if (!exactUnavailableRuntime && !runtimeHasAudio) {
      failures.push('the game audio context is neither running nor exactly unavailable');
    }
    if (!exactUnavailableProbe && !probeHasAudio) {
      failures.push('the independent audio capability probe is neither usable nor exactly unavailable');
    }
    if (runtimeHasAudio && probeHasAudio && runtimeSource !== constructorSource) {
      failures.push('runtime and independent probe selected different Web Audio constructors');
    }
    if (runtimeHasAudio && expectedListenerMode === 'unavailable') {
      failures.push('Web Audio is running but no complete listener pose path is available');
    }
  }
  if (failures.length > 0) evidenceClass = 'invalid';

  return Object.freeze({
    schema: 'atomic-acres/pass70-browser-audio-evidence@1',
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    evidenceClass,
    engine: input?.engine ?? null,
    harness: input?.harness ?? null,
    hostPlatform: input?.hostPlatform ?? null,
    coverage: Object.freeze({
      webAudio: evidenceClass === 'full-web-audio',
      playableWithoutAudio: evidenceClass === 'playable-degraded-no-audio',
      nativeSafariAudio: false,
    }),
    qualification: evidenceClass === 'playable-degraded-no-audio'
      ? 'Windows Playwright WebKit playability only: Web Audio was absent in both runtime and independent probes.'
      : evidenceClass === 'full-web-audio'
        ? 'Web Audio runtime and listener path confirmed in this Playwright engine run.'
        : 'No browser-audio claim is permitted.',
    residual: input?.engine === 'webkit'
      ? 'Native Safari audio and long-session gameplay on iPhone 15+ require external HITL on Apple hardware.'
      : null,
    expectedListenerMode,
    failures: Object.freeze(failures),
  });
}
