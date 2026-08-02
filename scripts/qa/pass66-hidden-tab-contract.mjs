export const PASS66_HIDDEN_TAB_GATE_SCHEMA = 'atomic-acres/pass66-hidden-tab-admission@2';

export const FORBIDDEN_BACKGROUND_BYPASS_FLAGS = Object.freeze([
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
]);

export const REQUIRED_BACKGROUND_CPU_PHASE = 'weapon-catalog-prewarm';

// This is deliberately frozen in the external gate instead of trusting the
// candidate's own expectedIds field. A candidate cannot make an incomplete
// catalog pass by shrinking both its implementation and its self-report.
export const REQUIRED_BROWSER_WEAPON_IDS = Object.freeze([
  'carbine',
  'smg',
  'lmg',
  'scattergun',
  'sniper',
  'mini-uzi',
  'mp5',
  'm4a1',
  'ak-47',
  'minigun',
  'm14-ebr',
  'slug-shotgun',
  'pistol',
  'machine-pistol',
  'magnum',
  'flashlight-pistol',
  'explosive-crossbow',
  'railgun',
  'flamethrower',
  'flare-gun',
]);

// The active carbine is loaded by shared menu readiness. Hold the first missing
// catalog-only source before releasing the tab; the exact 20-ID catalog,
// loaded-count advance and zero hidden GPU-submission checks below then force
// the remaining 19 viewmodels through genuine background CPU preparation.
export const REQUIRED_HELD_CPU_ASSET = '/assets/original/models/weapons/pass65-firearms/smg/smg-fp-lod0.glb';

// These paths are frozen outside the runtime's self-report. Every outdoor map
// must prove that at least one selected-map image finishes fetch and decode
// while the real game tab is hidden. Atomic Acres also holds its authored GLB,
// so the highest-cost arena cannot pass on the sky sentinel alone.
export const REQUIRED_SELECTED_ARENA_CONTRACTS = Object.freeze({
  'atomic-acres': Object.freeze({
    skyPreset: 'sunset-farmland',
    skyAsset: '/assets/original/skies/atomic-acres-sunset.webp',
    heldAssets: Object.freeze([
      '/assets/original/skies/atomic-acres-sunset.webp',
      '/assets/original/models/atomic-acres-blender-arena.glb',
    ]),
    qualityState: 'ready',
  }),
  'rustworks-1v1': Object.freeze({
    skyPreset: 'industrial-night',
    skyAsset: '/assets/original/skies/rustworks-industrial-night.webp',
    heldAssets: Object.freeze(['/assets/original/skies/rustworks-industrial-night.webp']),
    qualityState: 'ready',
  }),
  'skyline-terminal': Object.freeze({
    skyPreset: 'airport-dawn',
    skyAsset: '/assets/original/skies/terminal-airport-dawn.webp',
    heldAssets: Object.freeze(['/assets/original/skies/terminal-airport-dawn.webp']),
    qualityState: null,
  }),
});

export function assertHeadedChromeLaunchContract({ headless, executablePath, args, automation, seedUrls }) {
  if (headless !== false) throw new Error('Pass 66 hidden-tab admission requires headed Chrome');
  if (typeof executablePath !== 'string' || !/[/\\]Google[/\\]Chrome[/\\]Application[/\\]chrome\.exe$/i.test(executablePath)) {
    throw new Error('Pass 66 hidden-tab admission requires installed Google Chrome');
  }
  if (automation !== 'direct-cdp') {
    throw new Error('Pass 66 hidden-tab admission requires direct CDP so Playwright cannot force focus emulation');
  }
  if (!Array.isArray(args)) throw new Error('Pass 66 hidden-tab admission requires explicit Chrome arguments');
  const forbidden = args.filter((argument) => (
    FORBIDDEN_BACKGROUND_BYPASS_FLAGS.includes(argument)
    || /(?:disable|bypass).*(?:background|renderer|occlusion|throttl)/i.test(argument)
  ));
  if (forbidden.length > 0) {
    throw new Error(`Pass 66 hidden-tab admission forbids browser throttling bypasses: ${forbidden.join(', ')}`);
  }
  if (args.filter((argument) => argument.startsWith('--remote-debugging-port=')).length !== 1
    || args.filter((argument) => argument.startsWith('--user-data-dir=')).length !== 1
    || !args.includes('--enable-unsafe-webgpu')) {
    throw new Error('Pass 66 hidden-tab admission requires one direct CDP port, one isolated Chrome profile and native WebGPU');
  }
  if (!Array.isArray(seedUrls) || seedUrls.length !== 2
    || !seedUrls.every((url) => typeof url === 'string' && url.startsWith('file:///') && args.includes(url))) {
    throw new Error('Pass 66 hidden-tab admission requires exactly two command-line-seeded native Chrome tabs');
  }
}

function transitionPhaseNames(checkpoint) {
  return checkpoint.transition.profile?.phases.map((entry) => entry.phase) ?? [];
}

function audioStates(checkpoint) {
  return checkpoint.audio.contexts.map((context) => context.state);
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function hasExactBrowserWeaponCatalog(checkpoint) {
  return exactArray(checkpoint.weaponCatalog?.retained, REQUIRED_BROWSER_WEAPON_IDS)
    && checkpoint.weaponCatalog?.retainedCount === REQUIRED_BROWSER_WEAPON_IDS.length
    && checkpoint.weaponCatalog?.loaded === REQUIRED_BROWSER_WEAPON_IDS.length
    && checkpoint.weaponCatalog?.available === REQUIRED_BROWSER_WEAPON_IDS.length
    && checkpoint.weaponCatalog?.maximumRetained === REQUIRED_BROWSER_WEAPON_IDS.length;
}

function completedHeldCpuAsset(checkpoint) {
  return checkpoint.assetResources.some((resource) => (
    typeof resource.name === 'string'
    && resource.name.endsWith(REQUIRED_HELD_CPU_ASSET)
    && Number.isFinite(resource.responseEnd)
    && resource.responseEnd > 0
  ));
}

function completedHeldMapAsset(checkpoint, asset) {
  return checkpoint.assetResources.some((resource) => (
    typeof resource.name === 'string'
    && resource.name.endsWith(asset)
    && Number.isFinite(resource.responseEnd)
    && resource.responseEnd > 0
  ));
}

export function hiddenCheckpointFailures({
  beforeRelease,
  afterHidden,
  heldAssetRequests,
  selectedArenaId = 'atomic-acres',
  heldMapAssetRequests = {},
}) {
  const failures = [];
  const arenaContract = REQUIRED_SELECTED_ARENA_CONTRACTS[selectedArenaId];
  if (!arenaContract) failures.push(`no frozen selected-map contract exists for ${selectedArenaId}`);
  const beforePhases = transitionPhaseNames(beforeRelease);
  const hiddenPhases = transitionPhaseNames(afterHidden);
  if (beforeRelease.document.visibilityState !== 'hidden' || beforeRelease.document.hasFocus) {
    failures.push('the game tab was not genuinely hidden before the asset barrier opened');
  }
  if (beforeRelease.coverDocument?.visibilityState !== 'visible' || !beforeRelease.coverDocument?.hasFocus) {
    failures.push('the real cover tab did not own the foreground before the asset barrier opened');
  }
  if (afterHidden.document.visibilityState !== 'hidden' || afterHidden.document.hasFocus) {
    failures.push('the game tab did not remain genuinely hidden during background preparation');
  }
  if (afterHidden.coverDocument?.visibilityState !== 'visible' || !afterHidden.coverDocument?.hasFocus) {
    failures.push('the real cover tab did not remain foreground during background preparation');
  }
  if (heldAssetRequests < 1 || !completedHeldCpuAsset(afterHidden)) {
    failures.push('the exact held first-person weapon CPU asset did not complete while hidden');
  }
  if (arenaContract) {
    for (const asset of arenaContract.heldAssets) {
      if ((heldMapAssetRequests[asset] ?? 0) < 1 || !completedHeldMapAsset(afterHidden, asset)) {
        failures.push(`the exact held ${selectedArenaId} asset ${asset} did not complete while hidden`);
      }
    }
    if (afterHidden.skyBackdrop?.preset !== arenaContract.skyPreset
      || afterHidden.skyBackdrop?.status !== 'asset-ready'
      || afterHidden.skyBackdrop?.assetUrl !== arenaContract.skyAsset) {
      failures.push(`the selected ${selectedArenaId} sky image did not finish decode and admission while hidden`);
    }
    if (arenaContract.qualityState !== null
      && afterHidden.qualityAssetStreaming?.[selectedArenaId === 'atomic-acres' ? 'atomicAcres' : 'rustworks'] !== arenaContract.qualityState) {
      failures.push(`the selected ${selectedArenaId} quality presentation did not reach ${arenaContract.qualityState} while hidden`);
    }
  }
  if (!hiddenPhases.includes(REQUIRED_BACKGROUND_CPU_PHASE)
    || hiddenPhases.length <= beforePhases.length) {
    failures.push(`background CPU preparation did not reach ${REQUIRED_BACKGROUND_CPU_PHASE}`);
  }
  if (hasExactBrowserWeaponCatalog(beforeRelease)) {
    failures.push('the browser weapon CPU catalog was already complete before the held asset was released');
  }
  if (!hasExactBrowserWeaponCatalog(afterHidden)) {
    failures.push(`hidden CPU preparation did not commit the exact ${REQUIRED_BROWSER_WEAPON_IDS.length}-weapon retained catalog`);
  }
  if (!Number.isSafeInteger(beforeRelease.weaponCatalog?.loaded)
    || afterHidden.weaponCatalog?.loaded <= beforeRelease.weaponCatalog.loaded) {
    failures.push('the browser weapon loaded-model count did not advance while hidden');
  }
  if (afterHidden.presentation.submissionSequence !== beforeRelease.presentation.submissionSequence) {
    failures.push('WebGPU submissionSequence advanced while hidden');
  }
  if (afterHidden.frameCount !== beforeRelease.frameCount) {
    failures.push('the gameplay presentation frame count advanced while hidden');
  }
  if (!Number.isSafeInteger(beforeRelease.interactiveWorldTick) || beforeRelease.interactiveWorldTick < 0
    || !Number.isSafeInteger(afterHidden.interactiveWorldTick) || afterHidden.interactiveWorldTick < 0) {
    failures.push('the canonical interactiveWorldTick was missing or non-integral');
  } else if (afterHidden.interactiveWorldTick !== beforeRelease.interactiveWorldTick) {
    failures.push('offline interactive-world authority advanced while hidden');
  }
  if (afterHidden.presentationScheduling.mode !== 'paused-offline') {
    failures.push(`offline authority was not paused while hidden (${afterHidden.presentationScheduling.mode})`);
  }
  if (afterHidden.audio.contexts.length !== 1 || audioStates(afterHidden).some((state) => state !== 'suspended')) {
    failures.push(`Web Audio was not suspended while hidden (${audioStates(afterHidden).join(', ') || 'no-context'})`);
  }
  if (afterHidden.transition.generation !== beforeRelease.transition.generation
    || afterHidden.admission.matchAdmissionGeneration !== beforeRelease.admission.matchAdmissionGeneration) {
    failures.push('the hidden deployment replaced its transition or match-admission generation');
  }
  if (afterHidden.streaming.constructionCount !== 1
    || afterHidden.streaming.constructedArenaIds.length !== 1
    || afterHidden.streaming.constructedArenaIds[0] !== selectedArenaId) {
    failures.push('the hidden deployment constructed more than one arena authority root');
  }
  return failures;
}

export function recoveredCheckpointFailures({
  beforeRelease,
  afterHidden,
  recovered,
  maximumRecoveryMs,
  selectedArenaId = 'atomic-acres',
}) {
  const failures = [];
  if (recovered.document.visibilityState !== 'visible' || !recovered.document.hasFocus) {
    failures.push('the game tab did not regain foreground ownership');
  }
  if (recovered.coverDocument?.visibilityState !== 'hidden' || recovered.coverDocument?.hasFocus) {
    failures.push('the native cover tab did not yield foreground ownership on recovery');
  }
  if (recovered.foregroundRecoveryMs > maximumRecoveryMs) {
    failures.push(`foreground recovery ${recovered.foregroundRecoveryMs}ms exceeded ${maximumRecoveryMs}ms`);
  }
  if (recovered.presentationScheduling.recoveryCount !== afterHidden.presentationScheduling.recoveryCount + 1) {
    failures.push('foreground recovery was not coalesced into exactly one lifecycle recovery');
  }
  if (recovered.transition.generation !== beforeRelease.transition.generation
    || recovered.admission.matchAdmissionGeneration !== beforeRelease.admission.matchAdmissionGeneration) {
    failures.push('foreground recovery restarted the transition or match-admission generation');
  }
  if (recovered.streaming.constructionCount !== 1
    || recovered.streaming.residentArenaRoots !== 1
    || recovered.playableScene?.arenaId !== selectedArenaId
    || recovered.playableScene?.authoritativeArenaRoots !== 1
    || recovered.playableScene?.authoritativeArenaRootIsGameplayRoot !== true
    || recovered.playableScene?.duplicateArenaRoots !== false) {
    failures.push(`foreground recovery did not retain exactly one authoritative ${selectedArenaId} gameplay root`);
  }
  if (!recovered.gameStarted || recovered.matchPhase === 'ended'
    || recovered.transition.phase !== 'idle' || recovered.transition.failure !== null
    || recovered.transition.renderSubmissionPaused) {
    failures.push('the existing admission did not complete into a playable match');
  }
  if (recovered.runtime.actualBackend !== 'webgpu' || recovered.runtime.softwareAdapter
    || recovered.runtime.deviceLost || recovered.runtime.uncapturedErrors !== 0) {
    failures.push('hardware WebGPU was not healthy after focus recovery');
  }
  if (recovered.presentation.status !== 'healthy'
    || recovered.presentation.completionFailures !== 0
    || recovered.presentation.completedSequence > recovered.presentation.submissionSequence) {
    failures.push('WebGPU presentation was not healthy after focus recovery');
  }
  const cadence = recovered.bootstrap.matchAdmissionCadence;
  if (!cadence || cadence.backend !== 'webgpu' || cadence.admittedDegraded !== false
    || cadence.visibilityState !== 'visible' || cadence.drained !== true
    || cadence.endingCompletedSequence !== cadence.endingSubmissionSequence) {
    failures.push('match admission completed with degraded or hidden cadence evidence');
  }
  if (recovered.admission.presentedGameplayFrame < 1) {
    failures.push('no gameplay frame was presented after foreground recovery');
  }
  if (recovered.audio.contexts.length !== 1 || audioStates(recovered).some((state) => state !== 'running')) {
    failures.push(`Web Audio did not resume after foreground recovery (${audioStates(recovered).join(', ') || 'no-context'})`);
  }
  return failures;
}
