export const PASS66_HIDDEN_TAB_GATE_SCHEMA = 'atomic-acres/pass66-hidden-tab-admission@1';

export const FORBIDDEN_BACKGROUND_BYPASS_FLAGS = Object.freeze([
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
]);

export const REQUIRED_BACKGROUND_CPU_PHASE = 'weapon-catalog-prewarm';

export function assertHeadedChromeLaunchContract({ headless, executablePath, args, ignoreDefaultArgs }) {
  if (headless !== false) throw new Error('Pass 66 hidden-tab admission requires headed Chrome');
  if (typeof executablePath !== 'string' || !/[/\\]Google[/\\]Chrome[/\\]Application[/\\]chrome\.exe$/i.test(executablePath)) {
    throw new Error('Pass 66 hidden-tab admission requires installed Google Chrome');
  }
  if (JSON.stringify(ignoreDefaultArgs) !== JSON.stringify(FORBIDDEN_BACKGROUND_BYPASS_FLAGS)) {
    throw new Error(`Pass 66 hidden-tab admission must remove exactly Playwright's forbidden defaults: ${FORBIDDEN_BACKGROUND_BYPASS_FLAGS.join(', ')}`);
  }
  const forbidden = FORBIDDEN_BACKGROUND_BYPASS_FLAGS.filter((flag) => args.includes(flag));
  if (forbidden.length > 0) {
    throw new Error(`Pass 66 hidden-tab admission forbids browser throttling bypasses: ${forbidden.join(', ')}`);
  }
}

function transitionPhaseNames(checkpoint) {
  return checkpoint.transition.profile?.phases.map((entry) => entry.phase) ?? [];
}

function audioStates(checkpoint) {
  return checkpoint.audio.contexts.map((context) => context.state);
}

export function hiddenCheckpointFailures({ beforeRelease, afterHidden, heldAssetRequests }) {
  const failures = [];
  const beforePhases = transitionPhaseNames(beforeRelease);
  const hiddenPhases = transitionPhaseNames(afterHidden);
  if (beforeRelease.document.visibilityState !== 'hidden' || beforeRelease.document.hasFocus) {
    failures.push('the game tab was not genuinely hidden before the asset barrier opened');
  }
  if (afterHidden.document.visibilityState !== 'hidden' || afterHidden.document.hasFocus) {
    failures.push('the game tab did not remain genuinely hidden during background preparation');
  }
  if (heldAssetRequests < 1 || afterHidden.assetResources.length < 1) {
    failures.push('the held Atomic Acres asset did not complete while hidden');
  }
  if (!hiddenPhases.includes(REQUIRED_BACKGROUND_CPU_PHASE)
    || hiddenPhases.length <= beforePhases.length) {
    failures.push(`background CPU preparation did not reach ${REQUIRED_BACKGROUND_CPU_PHASE}`);
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
    || afterHidden.streaming.constructedArenaIds[0] !== 'atomic-acres') {
    failures.push('the hidden deployment constructed more than one arena authority root');
  }
  return failures;
}

export function recoveredCheckpointFailures({ beforeRelease, afterHidden, recovered, maximumRecoveryMs }) {
  const failures = [];
  if (recovered.document.visibilityState !== 'visible' || !recovered.document.hasFocus) {
    failures.push('the game tab did not regain foreground ownership');
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
    || recovered.streaming.activeRoots.length !== 1
    || recovered.streaming.activeRoots[0] !== 'atomic-acres') {
    failures.push('foreground recovery did not retain exactly one active Atomic Acres root');
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
