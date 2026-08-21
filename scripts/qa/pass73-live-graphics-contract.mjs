const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic|fallback|unavailable|unknown/iu;
const DEV_RESOURCE = /(?:\/@vite\/client|\/src\/|\/node_modules\/|\/@fs\/|\/@id\/|\.tsx?(?:\?|$))/iu;

export const PASS73_LIVE_GRAPHICS_SCHEMA = 'atomic-acres/pass73-live-graphics@2';
export const PASS73_LIVE_GRAPHICS_VIEWPORT = Object.freeze([2_560, 1_440]);
export const PASS73_LIVE_GRAPHICS_WATER_AMPLITUDE = 1.55;
export const PASS73_LIVE_GRAPHICS_PIXEL_FLOORS = Object.freeze({
  changedRatio: 0.01,
  meanAbsoluteChannelDifference: 0.5,
});

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function exactArray(value, expected) {
  return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);
}

function sameFinite(left, right, tolerance = 1e-9) {
  return finite(left) && finite(right) && Math.abs(left - right) <= tolerance;
}

function nativeRuntimeFailures(runtime, label) {
  const failures = [];
  const presentation = runtime?.presentation;
  if (!record(runtime) || runtime.requestedBackend !== 'webgpu' || runtime.actualBackend !== 'webgpu'
    || runtime.initialized !== true || runtime.failClosed !== false || runtime.deviceLost !== false
    || runtime.uncapturedErrors !== 0 || runtime.softwareAdapter !== false
    || runtime.adapterClass !== 'GPUAdapter' || runtime.deviceClass !== 'GPUDevice'
    || typeof runtime.adapterLabel !== 'string' || runtime.adapterLabel.length < 3
    || SOFTWARE_ADAPTER.test(runtime.adapterLabel)
    || runtime.canvasAlphaMode !== 'opaque'
    || runtime.renderPipelineApi !== 'three-r185-render-pipeline'
    || !record(presentation) || presentation.status !== 'healthy'
    || !Number.isSafeInteger(presentation.submissionSequence) || presentation.submissionSequence < 1
    || !Number.isSafeInteger(presentation.completedSequence) || presentation.completedSequence < 1
    || !Number.isSafeInteger(presentation.maximumInFlightSubmissions)
    || presentation.completedSequence < presentation.submissionSequence - presentation.maximumInFlightSubmissions
    || presentation.completionFailures !== 0 || presentation.lastFailure !== null) {
    failures.push(`${label} is not native hardware WebGPU`);
  }
  return failures;
}

function activeMatchFailures(phase, label) {
  const failures = [];
  if (!record(phase) || phase.gameStarted !== true || phase.matchPhase !== 'active'
    || phase.menuVisible !== false || !Number.isSafeInteger(phase.frameCount) || phase.frameCount <= 0
    || typeof phase.player?.id !== 'string' || phase.player.id.length < 1
    || !Number.isSafeInteger(phase.matchEpoch) || phase.matchEpoch < 1) {
    failures.push(`${label} is not one active gameplay match`);
  }
  return failures;
}

function ownerCoherenceFailures(phase, label, profile, constructionProfile, preset = profile) {
  const failures = [];
  const render = phase?.render;
  const post = render?.post;
  if (!record(render) || render.liveProfile !== profile
    || render.graphicsApplication?.requestedProfile !== profile
    || render.graphicsApplication?.constructionProfile !== constructionProfile
    || phase.settings?.displayedGraphicsPreset !== preset
    || phase.settings?.requestedPreset !== preset
    || phase.settings?.liveApplication?.profile !== profile
    || phase.ui?.graphicsPreset !== preset
    || phase.ui?.graphicsLiveProfile !== profile
    || post?.owner !== 'pass64-webgpu-tsl' || post?.liveProfile !== profile
    || render.refinement?.profile !== profile || render.contrast?.profile !== profile
    || render.atmosphere?.owner !== 'pass64.atmosphere.tsl'
    || render.atmosphere?.profile !== profile) {
    failures.push(`${label} profile labels and live runtime owners are incoherent`);
  }
  failures.push(...nativeRuntimeFailures(render?.runtime, `${label} renderer`));
  return failures;
}

function configuredLightingMatchesRuntime(phase, label) {
  const failures = [];
  const lighting = phase?.render?.lighting;
  const runtime = lighting?.runtime;
  if (!record(lighting) || !record(runtime)
    || runtime.hemisphere?.color !== lighting.hemisphereSky
    || runtime.hemisphere?.groundColor !== lighting.hemisphereGround
    || runtime.fill?.color !== lighting.fillColor
    || !exactArray(runtime.fill?.position, lighting.fillPosition)
    || !finite(runtime.hemisphere?.intensity) || !finite(runtime.fill?.intensity)) {
    failures.push(`${label} configured hemisphere/fill lighting does not match the real light objects`);
  }
  return failures;
}

function waterAmplitudeFailures(phase, expectedAmplitude, label) {
  const render = phase?.render;
  const amplitudes = [
    render?.water?.waveAmp,
    render?.post?.advancedGraphics?.oceanWaveAmplitude,
    render?.playableScene?.tslSystemVisibility?.waterWaveAmplitude,
  ];
  if (!finite(expectedAmplitude) || !amplitudes.every((value) => sameFinite(value, expectedAmplitude))) {
    return [`${label} authoritative CPU/TSL water amplitude diverged`];
  }
  if (typeof render?.water?.waveAuthority !== 'string'
    || render.water.waveAuthority !== render?.playableScene?.tslSystemVisibility?.waterWaveAuthority) {
    return [`${label} water presentation is not bound to the authoritative wave contract`];
  }
  return [];
}

function substantialLiveOwnerChanges(quality, performance) {
  const failures = [];
  const before = quality?.render;
  const after = performance?.render;
  const beforeAdvanced = before?.post?.advancedGraphics;
  const afterAdvanced = after?.post?.advancedGraphics;
  const changedDown = [
    ['pixel ratio', before?.pixelRatio, after?.pixelRatio],
    ['hemisphere intensity', before?.lighting?.runtime?.hemisphere?.intensity, after?.lighting?.runtime?.hemisphere?.intensity],
    ['fill intensity', before?.lighting?.runtime?.fill?.intensity, after?.lighting?.runtime?.fill?.intensity],
    ['TSL volumetric scale', beforeAdvanced?.volumetricActual?.scale, afterAdvanced?.volumetricActual?.scale],
    ['TSL mist opacity', beforeAdvanced?.volumetricActual?.mistOpacity, afterAdvanced?.volumetricActual?.mistOpacity],
    ['TSL smoke opacity', beforeAdvanced?.volumetricActual?.smokeOpacity, afterAdvanced?.volumetricActual?.smokeOpacity],
    ['TSL dust opacity', beforeAdvanced?.volumetricActual?.dustOpacity, afterAdvanced?.volumetricActual?.dustOpacity],
    ['TSL dust mote count', beforeAdvanced?.volumetricActual?.dustMotes, afterAdvanced?.volumetricActual?.dustMotes],
    ['bloom strength', beforeAdvanced?.bloomStrength, afterAdvanced?.bloomStrength],
    ['film grain scale', beforeAdvanced?.filmGrainScale, afterAdvanced?.filmGrainScale],
    ['refinement environment intensity', before?.refinement?.budget?.environmentIntensity, after?.refinement?.budget?.environmentIntensity],
    ['refinement bloom strength', before?.refinement?.budget?.bloomStrength, after?.refinement?.budget?.bloomStrength],
    ['refinement particle density', before?.refinement?.budget?.particleDensityScale, after?.refinement?.budget?.particleDensityScale],
    ['atmosphere dust mote count', before?.atmosphere?.dustMotes, after?.atmosphere?.dustMotes],
    ['atmosphere mist opacity', before?.atmosphere?.mistOpacity, after?.atmosphere?.mistOpacity],
    ['atmosphere smoke opacity', before?.atmosphere?.smokeOpacity, after?.atmosphere?.smokeOpacity],
    ['atmosphere dust opacity', before?.atmosphere?.dustOpacity, after?.atmosphere?.dustOpacity],
  ];
  for (const [name, qualityValue, performanceValue] of changedDown) {
    if (!finite(qualityValue) || !finite(performanceValue) || !(performanceValue < qualityValue)) {
      failures.push(`Quality -> Performance did not lower real ${name}`);
    }
  }
  if (!exactArray(before?.drawingBuffer, PASS73_LIVE_GRAPHICS_VIEWPORT)
    || !Array.isArray(after?.drawingBuffer)
    || !(after.drawingBuffer[0] < before.drawingBuffer[0])
    || !(after.drawingBuffer[1] < before.drawingBuffer[1])) {
    failures.push('Quality -> Performance did not lower the real drawing buffer');
  }
  if (before?.shadows !== true || before?.authoredShadows !== true
    || before?.lighting?.runtime?.sun?.castShadow !== true
    || before?.playableScene?.actualArenaVisualPolicy?.shadows?.enabled !== true
    || before?.playableScene?.actualArenaVisualPolicy?.shadows?.sunCastShadow !== true
    || after?.shadows !== false || after?.authoredShadows !== false
    || after?.lighting?.runtime?.sun?.castShadow !== false
    || after?.playableScene?.actualArenaVisualPolicy?.shadows?.enabled !== false
    || after?.playableScene?.actualArenaVisualPolicy?.shadows?.sunCastShadow !== false) {
    failures.push('Quality -> Performance did not change every real shadow owner');
  }
  if (!(before?.contrast?.activeLights > 0) || !(before?.contrast?.shadowCastingLights > 0)
    || after?.contrast?.activeLights !== 0 || after?.contrast?.shadowCastingLights !== 0) {
    failures.push('Quality -> Performance did not retire real arena contrast lights');
  }
  return failures;
}

function qualityPhaseFailures(quality) {
  const failures = [...activeMatchFailures(quality, 'Quality phase')];
  failures.push(...ownerCoherenceFailures(quality, 'Quality phase', 'blender', 'blender', 'high'));
  failures.push(...configuredLightingMatchesRuntime(quality, 'Quality phase'));
  const render = quality?.render;
  if (render?.profile !== 'blender' || render?.representation !== 'blender'
    || render?.pixelRatio !== 1 || !exactArray(render?.drawingBuffer, PASS73_LIVE_GRAPHICS_VIEWPORT)
    || render?.graphicsApplication?.state !== 'fully-effective'
    || render?.graphicsApplication?.fullPresetEffective !== true
    || render?.graphicsApplication?.pendingRendererReload !== false
    || !exactArray(render?.graphicsApplication?.stagedReconstruction, [])
    || render?.post?.canvasAntialias !== true || render?.post?.canvasSamples !== 4
    || render?.post?.principalHdrSamples !== 4
    || render?.post?.advancedGraphics?.principalSamples !== 4
    || render?.roots?.proceduralRootActuallyVisible !== false
    || render?.roots?.qualityArtRootVisible !== true
    || render?.roots?.overlappingPrimaryArenaRoots !== false
    || render?.qualityAssetState !== 'ready'
    || quality?.ui?.graphicsModeLabel !== 'QUALITY'
    || !quality?.ui?.effectiveLabel?.startsWith('EFFECTIVE: HIGH')) {
    failures.push('Quality phase is not the fully constructed Quality renderer/assets profile');
  }
  return failures;
}

function livePerformancePhaseFailures(quality, performance) {
  const failures = [...activeMatchFailures(performance, 'live Performance phase')];
  failures.push(...ownerCoherenceFailures(performance, 'live Performance phase', 'performance', 'blender'));
  failures.push(...configuredLightingMatchesRuntime(performance, 'live Performance phase'));
  const render = performance?.render;
  const expectedStaged = ['antiAliasing', 'geometryDetail'];
  if (render?.profile !== 'blender' || render?.representation !== 'blender'
    || !(render?.pixelRatio <= 0.75) || !(render?.pixelRatio < quality?.render?.pixelRatio)
    || render?.graphicsApplication?.state !== 'live-safe-applied-topology-pending'
    || render?.graphicsApplication?.fullPresetEffective !== false
    || render?.graphicsApplication?.pendingRendererReload !== true
    || !exactArray([...(render?.graphicsApplication?.stagedReconstruction ?? [])].sort(), [...expectedStaged].sort())
    || render?.post?.canvasAntialias !== true || render?.post?.canvasSamples !== 4
    || render?.post?.principalHdrSamples !== 4
    || render?.post?.advancedGraphics?.principalSamples !== 4
    || render?.roots?.proceduralRootActuallyVisible !== false
    || render?.roots?.qualityArtRootVisible !== true
    || render?.roots?.overlappingPrimaryArenaRoots !== false
    || performance?.ui?.graphicsModeLabel !== 'PERFORMANCE'
    || !performance?.ui?.effectiveLabel?.includes('APPLIED LIVE: PERFORMANCE')
    || !performance?.ui?.effectiveLabel?.includes('FULL PRESET NEXT ARENA:')) {
    failures.push('live Performance phase did not retain topology while staging exactly AA and geometry reconstruction');
  }
  if (quality?.document?.id !== performance?.document?.id
    || quality?.document?.timeOrigin !== performance?.document?.timeOrigin) {
    failures.push('live graphics apply replaced the active document');
  }
  failures.push(...substantialLiveOwnerChanges(quality, performance));
  return failures;
}

function liveMatchContinuityFailures(quality, performance, lifecycle) {
  const failures = [];
  if (performance?.player?.id !== quality?.player?.id
    || performance?.player?.team !== quality?.player?.team
    || performance?.matchEpoch !== quality?.matchEpoch
    || performance?.gameStarted !== true || performance?.matchPhase !== 'active'
    || !(performance?.frameCount >= quality?.frameCount)
    || !exactArray(performance?.player?.position, quality?.player?.position)
    || !sameFinite(performance?.player?.yaw, quality?.player?.yaw, 1e-6)
    || !sameFinite(performance?.player?.pitch, quality?.player?.pitch, 1e-6)) {
    failures.push('live graphics apply reset or replaced player/match authority');
  }
  if (!record(lifecycle?.liveApply) || lifecycle.liveApply.navigationCountDelta !== 0
    || !finite(lifecycle.liveApply.elapsedMs) || lifecycle.liveApply.elapsedMs <= 0
    || lifecycle.liveApply.elapsedMs > 15_000) {
    failures.push('live graphics apply was not immediate inside the active document');
  }
  return failures;
}

function reconstructedPhaseFailures(reconstructed) {
  const failures = [...activeMatchFailures(reconstructed, 'reconstructed Performance phase')];
  failures.push(...ownerCoherenceFailures(reconstructed, 'reconstructed Performance phase', 'performance', 'performance'));
  failures.push(...configuredLightingMatchesRuntime(reconstructed, 'reconstructed Performance phase'));
  const render = reconstructed?.render;
  if (render?.profile !== 'performance' || render?.representation !== 'responsive'
    || !(render?.pixelRatio <= 0.75)
    || render?.graphicsApplication?.state !== 'fully-effective'
    || render?.graphicsApplication?.fullPresetEffective !== true
    || render?.graphicsApplication?.pendingRendererReload !== false
    || !exactArray(render?.graphicsApplication?.stagedReconstruction, [])
    || reconstructed?.settings?.liveApplication?.pendingRendererReload !== false
    || !exactArray(reconstructed?.settings?.liveApplication?.stagedReconstruction, [])
    || render?.post?.canvasAntialias !== false || render?.post?.canvasSamples !== 1
    || render?.post?.principalHdrSamples !== 1
    || render?.post?.advancedGraphics?.principalSamples !== 1
    || render?.roots?.proceduralRootActuallyVisible !== true
    || render?.roots?.qualityArtRootVisible !== false
    || render?.roots?.overlappingPrimaryArenaRoots !== false
    || render?.qualityAssetState !== 'ready'
    || render?.playableScene?.authoritativeArenaRoots !== 1
    || render?.playableScene?.authoritativeArenaRootIsGameplayRoot !== true
    || render?.playableScene?.duplicateArenaRoots !== false
    || render?.playableScene?.actualArenaVisualPolicy?.definitionId !== 'atomic-acres'
    || reconstructed?.ui?.graphicsStaged !== ''
    || reconstructed?.ui?.graphicsModeLabel !== 'PERFORMANCE'
    || !reconstructed?.ui?.effectiveLabel?.startsWith('EFFECTIVE: PERFORMANCE')
    || reconstructed?.ui?.effectiveLabel?.includes('FULL PRESET NEXT ARENA:')) {
    failures.push('renderer reconstruction did not consume Performance AA/geometry choices coherently');
  }
  return failures;
}

function reconstructionLifecycleFailures(receipt) {
  const failures = [];
  const lifecycle = receipt?.lifecycle?.reconstruction;
  const quality = receipt?.phases?.quality;
  const menu = receipt?.phases?.postReloadMenu;
  const reconstructed = receipt?.phases?.performanceReconstructed;
  if (!record(lifecycle) || lifecycle.returnedVia !== 'main-menu-button'
    || lifecycle.navigationCount < 1 || lifecycle.documentReplaced !== true
    || lifecycle.qualityDocumentId !== quality?.document?.id
    || lifecycle.reconstructedDocumentId !== reconstructed?.document?.id
    || lifecycle.qualityDocumentId === lifecycle.reconstructedDocumentId
    || !(reconstructed?.document?.timeOrigin > quality?.document?.timeOrigin)) {
    failures.push('required safe return/reload was not observed as a renderer reconstruction');
  }
  if (!record(menu) || menu.gameStarted !== false || menu.menuVisible !== true
    || menu.render?.profile !== 'performance'
    || menu.render?.graphicsApplication?.constructionProfile !== 'performance'
    || menu.render?.graphicsApplication?.pendingRendererReload !== false
    || !exactArray(menu.render?.graphicsApplication?.stagedReconstruction, [])) {
    failures.push('post-reload menu did not own a consumed Performance construction profile');
  }
  return failures;
}

function pixelEvidenceFailures(receipt) {
  const failures = [];
  const paired = receipt?.pixels?.qualityToLivePerformance;
  if (!record(paired) || !exactArray(paired.dimensions, PASS73_LIVE_GRAPHICS_VIEWPORT)
    || !Number.isSafeInteger(paired.totalPixels)
    || paired.totalPixels !== PASS73_LIVE_GRAPHICS_VIEWPORT[0] * PASS73_LIVE_GRAPHICS_VIEWPORT[1]
    || !Number.isSafeInteger(paired.changedPixels) || paired.changedPixels <= 0
    || !finite(paired.changedRatio) || paired.changedRatio <= PASS73_LIVE_GRAPHICS_PIXEL_FLOORS.changedRatio
    || paired.changedPixels <= paired.totalPixels * PASS73_LIVE_GRAPHICS_PIXEL_FLOORS.changedRatio
    || Math.abs(paired.changedRatio - paired.changedPixels / paired.totalPixels) > 1e-12
    || !finite(paired.meanAbsoluteChannelDifference)
    || paired.meanAbsoluteChannelDifference <= PASS73_LIVE_GRAPHICS_PIXEL_FLOORS.meanAbsoluteChannelDifference) {
    failures.push('paired gameplay pixels are missing or weaker than the retained floor');
  }
  const screenshots = receipt?.screenshots;
  const expectedIds = ['quality', 'performance-live', 'performance-reconstructed'];
  if (!Array.isArray(screenshots) || screenshots.length !== expectedIds.length
    || screenshots.some((entry, index) => entry?.id !== expectedIds[index]
      || !SHA256.test(entry?.sha256 ?? '') || !Number.isSafeInteger(entry?.bytes) || entry.bytes <= 0
      || !exactArray(entry?.dimensions, PASS73_LIVE_GRAPHICS_VIEWPORT)
      || typeof entry?.path !== 'string' || !entry.path.endsWith('.png'))) {
    failures.push('screenshot identities/hashes are incomplete');
  }
  if (Array.isArray(screenshots) && screenshots[0]?.sha256 === screenshots[1]?.sha256) {
    failures.push('Quality and live Performance screenshots are byte-identical');
  }
  return failures;
}

function provenanceFailures(receipt, expected) {
  const failures = [];
  const source = receipt?.sourceState;
  if (!record(source) || !SHA40.test(source.startingSha ?? '') || !SHA40.test(source.endingSha ?? '')
    || !SHA40.test(source.expectedSha ?? '') || source.startingSha !== source.endingSha
    || source.startingSha !== source.expectedSha || source.startingSha !== expected.sourceSha
    || !SHA40.test(source.startingTree ?? '') || source.startingTree !== source.endingTree
    || source.startingTree !== source.expectedTree || source.startingTree !== expected.sourceTree
    || source.cleanBefore !== true || source.cleanAfter !== true) {
    failures.push('source HEAD/tree/clean identity drifted');
  }
  const topology = receipt?.topology;
  const staged = topology?.stagedCandidate;
  const served = topology?.servedCandidate;
  const servedAfter = topology?.servedCandidateAfter;
  if (!record(topology) || topology.serverKind !== 'built-staged-release-topology-vite-preview'
    || topology.buildMode !== 'production' || topology.devServer === true
    || topology.baseUrl !== expected.baseUrl
    || !SHA256.test(topology.receiptSha256 ?? '')
    || topology.receiptSha256 !== expected.topologyReceiptSha256
    || !record(staged) || staged.schemaVersion !== expected.topologySchemaVersion
    || staged.channel !== 'the-big-one' || staged.releasePass !== expected.releasePass
    || staged.path !== 'channels/the-big-one' || staged.sourceSha !== expected.sourceSha
    || staged.treeSha256 !== expected.treeSha256 || staged.exactRootFileCount !== expected.exactRootFileCount
    || JSON.stringify(served) !== JSON.stringify(staged)
    || JSON.stringify(servedAfter) !== JSON.stringify(staged)) {
    failures.push('built/staged/served release topology identity is invalid');
  }
  const resources = topology?.resources;
  const urls = Array.isArray(resources?.urls) ? resources.urls : [];
  const devUrls = urls.filter((url) => typeof url === 'string' && DEV_RESOURCE.test(url));
  const sourceEvidenceFiles = topology?.sourceEvidenceFiles;
  if (urls.length < 2 || !urls.some((url) => /\/assets\/[^/]+-[A-Za-z0-9_-]+\.js(?:\?|$)/u.test(url))
    || devUrls.length > 0 || !exactArray(resources?.devServerUrls, [])
    || !exactArray(sourceEvidenceFiles, expected.sourceEvidenceFiles)
    || sourceEvidenceFiles.length < 1
    || sourceEvidenceFiles.some((path) => !/^channels\/the-big-one\/assets\/[^/]+\.js$/u.test(path)
      || !urls.some((url) => url.split('?')[0] === `/${path}`))) {
    failures.push('served bytes are not a production asset graph or contain dev-server resources');
  }
  try {
    const route = new URL(receipt.route);
    const base = new URL(expected.baseUrl);
    if (route.origin !== base.origin || route.pathname !== base.pathname
      || route.searchParams.get('renderer') !== 'webgpu'
      || route.searchParams.get('requireWebGPU') !== '1'
      || route.searchParams.get('externalServices') !== 'off'
      || route.searchParams.get('map') !== 'atomic-acres'
      || route.searchParams.get('seed') !== '7301'
      || route.searchParams.has('render')) {
      failures.push('served gameplay route is not the staged native-WebGPU candidate route');
    }
  } catch {
    failures.push('served gameplay route is invalid');
  }
  return failures;
}

function browserIdentityFailures(receipt, expected) {
  const browser = receipt?.browser;
  const ua = browser?.userAgent;
  const failures = [];
  if (!record(browser) || browser.channel !== 'installed-chrome' || browser.headless !== false
    || typeof browser.version !== 'string' || browser.version.length < 3
    || typeof ua !== 'string' || !/Chrome\//u.test(ua) || /HeadlessChrome\//u.test(ua)
    || typeof browser.executablePath !== 'string' || browser.executablePath.length < 3
    || browser.executablePath !== expected.browserExecutablePath.replaceAll('\\', '/')
    || browser.executableSha256 !== expected.browserExecutableSha256
    || browser.endingExecutableSha256 !== expected.browserExecutableSha256
    || !exactArray(browser.contentViewport, PASS73_LIVE_GRAPHICS_VIEWPORT)
    || browser.devicePixelRatio !== 1) {
    failures.push('browser is not exact installed headed Chrome at the required content viewport');
  }
  return failures;
}

export function pass73LiveGraphicsFailures(receipt, expected) {
  const failures = [];
  if (!record(receipt)) return ['receipt must be an object'];
  if (!record(expected)) return ['expected provenance must be an object'];
  if (receipt.schema !== PASS73_LIVE_GRAPHICS_SCHEMA || receipt.verdict !== 'pass'
    || receipt.zeroSkips !== true || !exactArray(receipt.browserErrors, [])) {
    failures.push('receipt header, zero-skip, or browser-error contract is invalid');
  }
  failures.push(...provenanceFailures(receipt, expected));
  failures.push(...browserIdentityFailures(receipt, expected));
  const quality = receipt.phases?.quality;
  const performance = receipt.phases?.performanceLive;
  const reconstructed = receipt.phases?.performanceReconstructed;
  failures.push(...qualityPhaseFailures(quality));
  failures.push(...livePerformancePhaseFailures(quality, performance));
  failures.push(...liveMatchContinuityFailures(quality, performance, receipt.lifecycle));
  failures.push(...waterAmplitudeFailures(quality, PASS73_LIVE_GRAPHICS_WATER_AMPLITUDE, 'Quality phase'));
  failures.push(...waterAmplitudeFailures(performance, PASS73_LIVE_GRAPHICS_WATER_AMPLITUDE, 'live Performance phase'));
  failures.push(...reconstructionLifecycleFailures(receipt));
  failures.push(...reconstructedPhaseFailures(reconstructed));
  failures.push(...waterAmplitudeFailures(reconstructed, PASS73_LIVE_GRAPHICS_WATER_AMPLITUDE, 'reconstructed Performance phase'));
  failures.push(...pixelEvidenceFailures(receipt));
  return [...new Set(failures)];
}

export function assertPass73LiveGraphicsReceipt(receipt, expected) {
  const failures = pass73LiveGraphicsFailures(receipt, expected);
  if (failures.length > 0) throw new Error(`Pass 73 live graphics receipt failed:\n${failures.join('\n')}`);
  return receipt;
}
