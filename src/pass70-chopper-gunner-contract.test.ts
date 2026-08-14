import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacy = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
const hudCss = readFileSync(new URL('./ui/pass65-hud.css', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('./killstreak-presentation.ts', import.meta.url), 'utf8');
const authoring = readFileSync(new URL('../scripts/blender/create-pass65-support-vehicles.py', import.meta.url), 'utf8');
const authoringRunner = readFileSync(new URL('../scripts/blender/run-authoring.mjs', import.meta.url), 'utf8');
const e2e = readFileSync(new URL('../tests/e2e/pass70-chopper-gunner.spec.ts', import.meta.url), 'utf8');
const controlledSupportE2e = readFileSync(new URL('../tests/e2e/pass71-controlled-support-native.spec.ts', import.meta.url), 'utf8');
const boundedE2e = readFileSync(new URL('../scripts/qa/run-bounded-e2e.mjs', import.meta.url), 'utf8');

describe('Pass 70 complete Chopper Gunner contract', () => {
  it('presents the complete authored cockpit while excluding exterior and rotors', () => {
    const start = presentation.indexOf('function setSupportFirstPersonVisibility(');
    const end = presentation.indexOf('\nfunction buildAuthoredSupportVehicle(', start);
    const block = presentation.slice(start, end);
    expect(block).toContain('isGunnerCockpitNode(root, node)');
    expect(block).toContain('node.visible = gunnerCockpitNode && !gunnerSightBlocker && !retiredStaticSource');
    expect(block).toContain('const gunnerSightBlocker = gunnerSightlineNode && !gunnerWeaponViewNode');
    expect(block).toContain('1 << SUPPORT_FIRST_PERSON_RENDER_LAYER');
    expect(block).toContain('node.layers.mask = node.userData.supportBaseLayerMask');
    expect(block).toContain('!entry.transparent && entry.opacity >= 1');
    expect(block).not.toContain('node.visible = gunnerSightlineNode && !retiredStaticSource');
  });

  it('keeps the centre reticle clear and all instruments bounded on desktop and mobile', () => {
    for (const id of [
      'gunner-hull', 'gunner-ammo', 'gunner-altitude', 'gunner-speed', 'gunner-time', 'gunner-damage',
      'gunner-target-confirm', 'gunner-platform', 'gunner-weapon-mode',
      'gunner-missile-status', 'gunner-missile-ammo', 'gunner-missile-cooldown',
    ]) expect(shell).toContain(`id="${id}"`);
    expect(shell).toContain('data-centre-clear="true"');
    expect(shell).not.toContain('class="gunner-reticle"><i></i><b></b>');
    expect(hudCss).toContain('.gunner-reticle .north { bottom: 58%; top: auto; }');
    expect(hudCss).toContain('.gunner-reticle .east { left: 58%; }');
    expect(hudCss).toContain('@media (max-width: 760px), (max-height: 520px)');
    expect(hudCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(hudCss).toContain('env(safe-area-inset-bottom)');
    expect(hudCss).toContain('top: max(54px, calc(env(safe-area-inset-top) + 52px));');
    expect(hudCss).toContain('#gunner-cockpit-hud[data-support-kind="chopper-gunner"]::before');
    expect(hudCss).toContain('height: clamp(280px, 58vh, 620px);');
    expect(hudCss).toContain('height: clamp(210px, 48vh, 390px);');
    expect(hudCss).toContain('#gunner-missile-status[data-ready="true"] em');
    expect(legacy).toContain("event.button === 2 && localKillstreakActorSnapshot()?.possession?.kind === 'chopper-gunner'");
    expect(legacy).toContain('missileFire: true');
  });

  it('uses authority geometry and target projection for shot and damage feedback', () => {
    const updateStart = legacy.indexOf('function updateKillstreakPossession(');
    const updateEnd = legacy.indexOf('\nfunction updatePass65KillstreakRuntime(', updateStart);
    const update = legacy.slice(updateStart, updateEnd);
    expect(update).toContain('chopperGunnerCameraOrigin(entity.position, entity.attitude)');
    expect(update).toContain('chopperGunnerAuthoritativeRay(entity.position, entity.attitude, player.yaw, player.pitch)');
    expect(update).toContain('new THREE.Vector3(...shotRay.tracerOrigin)');
    expect(update).toContain('new THREE.Vector3(...shotRay.direction)');

    const hitStart = legacy.indexOf('function showGunnerTargetConfirm(');
    const hitEnd = legacy.indexOf('\nfunction resetKillstreakPossessionPresentation(', hitStart);
    const hit = legacy.slice(hitStart, hitEnd);
    expect(hit).toContain("event.source !== 'chopper' || !anchor.visible");
    expect(hit).toContain('entity.activationId !== event.activationId');
    expect(hit).toContain('`${anchor.xPx}px`');
    expect(hit).toContain('`${anchor.yPx}px`');
  });

  it('cleans the cockpit, thermal overlay, target marker, cadence, and camera on every exit path', () => {
    const hideStart = legacy.indexOf('function hideGunnerCockpitHud(');
    const hideEnd = legacy.indexOf('\nfunction showGunnerTargetConfirm(', hideStart);
    const hide = legacy.slice(hideStart, hideEnd);
    expect(hide).toContain("hud.dataset.supportKind = 'none'");
    expect(hide).toContain("hud.dataset.hitConfirm = 'false'");
    expect(hide).toContain("element<HTMLElement>('#chopper-thermal').hidden = true");
    expect(hide).toContain("element<HTMLElement>('#gunner-missile-status')");
    expect(hide).toContain("missileStatus.dataset.ready = 'false'");
    expect(hide).toContain('nextLocalSupportGunReportAt = 0');
    expect(legacy).toContain('if (!possession || !player.alive)');
    expect(legacy).toContain('if (camera.near !== 0.08)');
  });

  it('authors and optimizes only Chopper LODs for this correction', () => {
    expect(authoring).toContain('{"all", "aircraft", "chopper"}');
    expect(authoring).toContain('if AUTHORING_SCOPE == "chopper"');
    expect(authoring).toContain('pass70-connected-rear-tail-airframe-v7');
    expect(authoring).toContain('continuous-rear-tail-silhouette-cockpit-clear-sightline-v7');
    expect(authoring).toContain('Chopper_TailRootCollar_LOD');
    expect(authoring).toContain('pass70-daylight-readable-olive-pbr-v1');
    const runnerStart = authoringRunner.indexOf('function authorSupportChopper()');
    const runnerEnd = authoringRunner.indexOf('\nfunction authorWeaponFamilies(', runnerStart);
    const runner = authoringRunner.slice(runnerStart, runnerEnd);
    expect(runner).toContain("env.PASS65_SUPPORT_AUTHORING_SCOPE = 'chopper'");
    expect(runner).toContain('pass65-chopper-gunner-lod${lod}.glb');
    expect(runner).not.toContain('pass65-care-aircraft');
    expect(runner).not.toContain('pass65-carpet-aircraft');
  });

  it('prewarms the exact shared LOD bands at near-field scale and restores the gameplay projection', () => {
    expect(presentation).toContain('export const SUPPORT_VEHICLE_LOD_DISTANCES = Object.freeze([0, 95, 190] as const);');
    expect(presentation).toContain('export const SUPPORT_VEHICLE_PREWARM_DISTANCES = deriveSupportVehiclePrewarmDistances();');
    expect(presentation).toContain('lod.addLevel(level, SUPPORT_VEHICLE_LOD_DISTANCES[index]');
    expect(presentation).toContain('SUPPORT_VEHICLE_PREWARM_DISTANCES.entries()');
    expect(presentation).toContain('projectionCamera.far = requiredPrewarmFar');
    expect(presentation).toContain('projectionCamera.far = originalPrewarmFar');
    expect(presentation).not.toContain('[24, 50, 88]');
  });

  it('fits exterior evidence to stable airframe geometry rather than transient fire actions', () => {
    expect(presentation).toContain('supportVehicleStableAirframeBounds(entry.root, camera, this.submittedScene)');
    expect(presentation).toContain("'chopper-tracer-action'");
    expect(presentation).toContain("'chopper-muzzle-flash'");
    expect(presentation).toContain("'chopper-impact-action'");
    expect(e2e).toContain('const visibleBounds = detail.stableAirframeBounds;');
    const exteriorBootstrap = e2e.slice(
      e2e.indexOf('const roughExteriorPlan'),
      e2e.indexOf('const exteriorPose'),
    );
    expect(exteriorBootstrap).toContain('deterministicReview.presentedCamera');
    expect(exteriorBootstrap).toContain('receipt.reviewedChopper.drawableStableMeshCount > 0');
    expect(exteriorBootstrap).toContain('Boolean(receipt.reviewedChopper.drawableStableBounds)');
    expect(exteriorBootstrap).toContain("__PASS70_ROUGH_CHOPPER_PRESENTATION__");
    expect(exteriorBootstrap).toContain('observer.transactionStartedAtMs = performance.now();');
    expect(exteriorBootstrap).toContain('observer.deadlineAtMs = observer.transactionStartedAtMs + 8_000;');
    expect(exteriorBootstrap).toContain('observer.watchdogId = window.setTimeout(onDeadline, 8_000);');
    expect(exteriorBootstrap).toContain('delete (globalThis as any)[key]');
    expect(exteriorBootstrap).toContain('requestAnimationFrame(inspect);');
    expect(exteriorBootstrap).toContain('const roughPresentedObservation = await page.evaluate');
    expect(exteriorBootstrap).toContain('const roughPresentedReceipt = roughPresentedObservation.receipt');
    expect(exteriorBootstrap).not.toContain('const roughPresentedHandle = await page.waitForFunction');
    expect(exteriorBootstrap.indexOf('const visibleBounds = detail.stableAirframeBounds;'))
      .toBeLessThan(exteriorBootstrap.indexOf('deterministicReview.presentedCamera'));
    const observerArm = exteriorBootstrap.indexOf('(globalThis as any)[key] = observer;');
    const presentationFrameArm = exteriorBootstrap.indexOf('requestAnimationFrame(inspect);', observerArm);
    const cameraTransaction = exteriorBootstrap.indexOf('observer.transactionStartedAtMs = performance.now();');
    const receiptConsumer = exteriorBootstrap.indexOf('const observation = await observer.promise;');
    expect(observerArm).toBeGreaterThan(-1);
    expect(observerArm).toBeLessThan(presentationFrameArm);
    expect(presentationFrameArm).toBeLessThan(cameraTransaction);
    expect(observerArm).toBeLessThan(cameraTransaction);
    expect(cameraTransaction).toBeLessThan(receiptConsumer);
    const presentationInspect = exteriorBootstrap.slice(
      exteriorBootstrap.indexOf('const inspect = () => {'),
      exteriorBootstrap.indexOf('const onDeadline = () => {'),
    );
    expect(presentationInspect.indexOf('performance.now() >= observer.deadlineAtMs'))
      .toBeLessThan(presentationInspect.indexOf('deterministicReview.presentedCamera'));
    const presentationWatchdog = exteriorBootstrap.slice(
      exteriorBootstrap.indexOf('const onDeadline = () => {'),
      observerArm,
    );
    expect(presentationWatchdog).toContain('rejectObservation(new Error(');
    expect(presentationWatchdog).not.toContain('resolveReceipt');
    expect(presentationWatchdog).not.toContain('debug.snapshot()');
    const finalExteriorPose = e2e.slice(
      e2e.indexOf('const exteriorPose'),
      e2e.indexOf('expect(exteriorPose)', e2e.indexOf('const exteriorPose')),
    );
    expect(finalExteriorPose).toContain('const detail = presentedReceipt.reviewedChopper;');
    expect(finalExteriorPose).toContain('const visibleBounds = detail.drawableStableBounds;');
    expect(finalExteriorPose).toContain('entityId: roughPose.entityId');
    expect(finalExteriorPose).not.toContain('window.__ATOMIC_ACRES_DEBUG__.snapshot()');
    expect(finalExteriorPose).not.toContain('snapshot.killstreakPresentation.entityDetails');
    expect(e2e).toContain('receipt.reviewedChopper.drawableStableMeshCount > 0');
    expect(e2e).toContain('rasterVisibility.visiblePixelRatio');
    expect(e2e).toContain('rasterVisibility.maximumLuminance');
    expect(e2e).toContain('captureChopperExteriorHiddenControl()');
    expect(e2e).toContain('attributableRasterDifference.materiallyChangedPixelRatio');
    expect(e2e).toContain('exterior-hidden-control.nonpublishable.png');
    expect(e2e).toContain('side * Math.PI / 3');
    expect(e2e.indexOf("page.screenshot({ path: resolve(evidence, 'exterior-front-quarter.png')"))
      .toBeLessThan(e2e.indexOf("{ kind: 'training-dummy', id: 'test-dummy-alpha' }"));
  });

  it('commits a zero-target exterior camera without loosening rigged actor receipts', () => {
    const genericStart = legacy.indexOf('function debugCommittedCameraPresentationReceipt(');
    const genericEnd = legacy.indexOf('\nfunction debugCapturePresentationReceipt(', genericStart);
    const generic = legacy.slice(genericStart, genericEnd);
    const riggedStart = genericEnd;
    const riggedEnd = legacy.indexOf('\nconst DEBUG_EVIDENCE_LOS_ENDPOINT_TOLERANCE_M', riggedStart);
    const rigged = legacy.slice(riggedStart, riggedEnd);
    expect(generic).toContain("contract: 'capture-camera-committed-frame-v1'");
    expect(generic).toContain('targetCount: lastKillstreakWorldTargetCount');
    expect(generic).toContain('chopperAutonomousFireHeld: currentDebugChopperExteriorReviewHoldActive()');
    expect(generic).toContain('activeChopperTransientActionNames()');
    expect(rigged).toContain("throw new Error('Rigged evidence presentation receipt requires registered capture targets')");
    expect(legacy).toContain('lastDebugCommittedCameraPresentation = debugCommittedCameraPresentationReceipt(frameCount)');
    expect(legacy).toContain('debugCaptureCameraActive && debugRiggedEvidenceCaptureTargets !== null');
    expect(legacy).toContain('if (!synchronizeDebugChopperExteriorReviewHold()) {');
    expect(legacy).toContain('synchronizeDebugChopperExteriorReviewHold();');
    expect(legacy).toContain('resetDebugChopperExteriorReviewHold();');
    const runtimeUpdate = legacy.slice(
      legacy.indexOf('function updatePass65KillstreakRuntime('),
      legacy.indexOf('\nfunction updateCarePackageCollection', legacy.indexOf('function updatePass65KillstreakRuntime(')),
    );
    expect(runtimeUpdate.indexOf('synchronizeDebugChopperExteriorReviewHold();'))
      .toBeLessThan(runtimeUpdate.indexOf('if (!gameStarted)'));
    const captureSetter = legacy.slice(
      legacy.indexOf('setCaptureCameraPose:'),
      legacy.indexOf('\n  setCaptureCameraFarPlane:', legacy.indexOf('setCaptureCameraPose:')),
    );
    expect(captureSetter).toContain('if (!debugCaptureCameraActive) {\n      resetDebugChopperExteriorReviewHold();');
    const holdSetter = legacy.slice(
      legacy.indexOf('setChopperExteriorReviewHold:'),
      legacy.indexOf('\n  setRiggedEvidenceCaptureTargets:', legacy.indexOf('setChopperExteriorReviewHold:')),
    );
    expect(holdSetter).toContain('matchPhase: matchState.phase');
    expect(holdSetter).toContain('menuSurface: menuLifecycle.surface');
    expect(holdSetter).toContain('if (!held) {\n      resetDebugChopperExteriorReviewHold();\n      return true;');
    expect(e2e).toContain('setChopperExteriorReviewTracking(true)');
    expect(e2e).toContain("pauseCompletedPresentedFrame(page, trackerRevision, 'camera-only')");
    expect(e2e).toContain('awaitCommittedCameraCompletion()');
    expect(e2e).toContain('setChopperExteriorReviewHold(true)');
    expect(e2e).toContain('targetCount: 0');
    expect(e2e).toContain('activeChopperTransientActions: []');
  });

  it('keeps rear-fuselage and tail continuity visible without flattening the whole airframe', () => {
    expect(presentation).toContain("'chopper-rear-fuselage'");
    expect(presentation).toContain("'chopper-tail-boom'");
    expect(presentation).toContain("const CHOPPER_REAR_TAIL_MATERIAL_NAME = 'MAT_Pass65Chopper_RearTailArmor_PBR';");
    expect(presentation).toContain('minimumRoughness: 0.78');
    expect(presentation).toContain('maximumMetalness: 0.28');
    expect(presentation).toContain('isolateAuthoredChopperRearTailArmor(root);');
  });

  it('captures only an exact completed WebGPU frame without weakening the watchdog', () => {
    const start = e2e.indexOf('async function pauseCompletedPresentedFrame(');
    const end = e2e.indexOf('\ntest(', start);
    const capture = e2e.slice(start, end);
    expect(capture).toContain('receipt?.captureRevision === revision');
    expect(capture).toContain('api.setRenderPaused(true)');
    expect(capture).toContain('awaitRiggedEvidenceCaptureCompletion()');
    expect(capture).toContain('paused.receipt.submissionSequence');
    expect(capture).toContain('completion.completedSequence).toBeGreaterThanOrEqual(completion.submissionSequence)');
    expect(e2e).toContain('targetDirectionDot');
    expect(e2e).toContain('quaternionDot');
    expect(e2e).toContain('exteriorReceipt.near');
    expect(e2e).toContain('exteriorReceipt.far');
    expect(capture.indexOf('api.setRenderPaused(true)')).toBeLessThan(capture.indexOf('awaitRiggedEvidenceCaptureCompletion()'));
    expect(e2e).not.toContain('Renderer presentation made no GPU progress');
    expect(e2e).not.toContain('errors.filter');
  });

  it('gates first possession and trusted controlled support through the required Chopper shard', () => {
    expect(e2e).toContain("captureFrameActionBaseline(page, 'chopper-first-possession-preaction-baseline')");
    expect(e2e).toContain('captureFirstChopperPossessionEntry(page)');
    expect(e2e).toContain('receipt.eventToPresentedFrameMs');
    expect(e2e).toContain('receipt.eventToCompletionMs');
    expect(e2e).toContain('receipt.maximumAnimationFrameGapMs');
    expect(e2e).toContain('budget.maximumActionMs');
    expect(e2e).toContain('budget.maximumSynchronousActionMs');
    const requiredGroup = boundedE2e.match(/name: 'pass70-chopper-gunner'[^\n]+/u)?.[0] ?? '';
    expect(requiredGroup).toContain("timeoutMs: 420_000");
    expect(requiredGroup).toContain("'tests/e2e/pass70-chopper-gunner.spec.ts'");
    expect(requiredGroup).toContain("'tests/e2e/pass71-controlled-support-native.spec.ts'");
    expect(requiredGroup).toContain("'--workers=1'");
  });

  it('proves real LMB splash, real RMB cadence/hardpoints, and one exact Piloted Drone rig', () => {
    expect(controlledSupportE2e).toContain('awaitSchedulerSafeMatchWarmupEvidence(page)');
    expect(controlledSupportE2e).toContain('MATCH_WARMUP_SCHEDULER_EVIDENCE_TIMEOUT_MS');
    expect(controlledSupportE2e).toContain("countdown.lastCue !== 'engage'");
    expect(controlledSupportE2e).not.toContain('MATCH_WARMUP_EVIDENCE_TIMEOUT_MS');
    for (const token of [
      "page.mouse.down({ button: 'left' })",
      "page.mouse.down({ button: 'right' })",
      'event.trusted === true',
      'stagePossessedChopperSplashTargets()',
      'aimPossessedChopperAtTarget(staged.primaryTargetId)',
      'awaitChopperRuntimePhase(',
      "expectedPhase === 'cooldown-ready' && firstMissileReceipt !== null",
      'entity.missileAmmo === 5',
      'debug.requestPossessedChopperEvidenceControl({ fire: false })',
      'expect(splashBaseline.remainingLifetimeMs).toBeGreaterThan(5_000)',
      'expect(secondMissileBefore.entity.expiresInMs).toBeGreaterThan(0)',
      'snapshot.chopperMissileAuthority',
      "contract: 'pass71-hf308-chopper-missile-authority-v1'",
      'controlAdmission.sequence).toBe(firstAuthority.controlSequence + 1)',
      'stagedSplash.splashRadiusM).toBe(3)',
      'stagedSplash.separationM).toBeGreaterThan(2.8)',
      'splashReceipt.primary.atMs).toBe(splashReceipt.splash.atMs)',
      'const immediateSecond = firstMissile',
      'expect(immediateSecond.impacts.recent.filter',
      'expect(immediateSecond.controlAdmission).toMatchObject',
      'secondDrop.atMs - firstDrop.atMs).toBeGreaterThanOrEqual(1_000)',
      'chopperMissileLaunchPosition(',
      "'chopper-hardpoint-missile.png'",
      'stagePossessedPilotedDroneSensorTarget(true)',
      'stagePossessedPilotedDroneSensorTarget(false)',
      "contract: 'occlusion-conditioned-single-exact-animated-thermal-operator-v2'",
      'geometryIdentity: true',
      'skeletonIdentity: true',
      'boneWorldMatrixIdentity: true',
      'visibleOriginalTargets: 1',
      'activeThermalLayers: 0',
      'activeHaloLayers: 0',
      'proxyMeshes: 0',
      "'piloted-drone-occluded-exact-thermal-rig.png'",
    ]) expect(controlledSupportE2e).toContain(token);
    expect(controlledSupportE2e).not.toContain('for (let attempt = 0; attempt < 24');
    const splashTransaction = controlledSupportE2e.slice(
      controlledSupportE2e.indexOf("const key = '__PASS71_CHOPPER_SPLASH_OBSERVER__'"),
      controlledSupportE2e.indexOf('const missileArmReceipt'),
    );
    const splashObserverArm = splashTransaction.indexOf("window.addEventListener('mousedown', onTrustedMouseDown, true)");
    const trustedLeftDown = splashTransaction.indexOf("await page.mouse.down({ button: 'left' })");
    expect(splashObserverArm).toBeGreaterThan(-1);
    expect(splashObserverArm).toBeLessThan(trustedLeftDown);
    expect(splashTransaction).toContain('event.isTrusted !== true');
    expect(splashTransaction).toContain('observer.deadlineAtMs = observer.trustedTriggerAtMs + 2_500;');
    expect(splashTransaction).toContain('observer.watchdogId = window.setTimeout(onDeadline, 2_500);');
    expect(splashTransaction).toContain('sample.atMs <= observer.deadlineAtMs');
    expect(splashTransaction).toContain('requestAnimationFrame(inspect);');
    expect(splashTransaction).toContain('observerActivationId: staged.activationId');
    expect(splashTransaction).toContain("observer.cancel('Trusted Chopper splash transaction was cancelled after input or protocol failure')");
    expect(splashTransaction).toContain('delete (globalThis as any)[key]');
    const splashWatchdog = splashTransaction.slice(
      splashTransaction.indexOf('const onDeadline = () => {'),
      splashTransaction.indexOf('const onTrustedMouseDown = (event: MouseEvent) => {'),
    );
    expect(splashWatchdog).toContain('finish(observer.latest)');
    expect(splashWatchdog).toContain('fail(new Error(');
    expect(splashWatchdog).not.toContain('debug.snapshot()');
    expect(splashWatchdog).not.toContain('aimPossessedChopperAtTarget');
    expect(splashTransaction).not.toContain('setTimeout(resolveDelay, 25)');
    expect(splashTransaction).not.toContain('requestPossessedChopperEvidenceControl({ fire: true })');
    const cadenceTransaction = controlledSupportE2e.slice(
      controlledSupportE2e.indexOf('const firstMissileWallClockMs'),
      controlledSupportE2e.indexOf('const firstMissile = cooldownReady.firstMissileReceipt'),
    );
    expect(cadenceTransaction.match(/page\.mouse\.down\(\{ button: 'right' \}\)/gu)).toHaveLength(2);
    expect(cadenceTransaction.match(/page\.mouse\.up\(\{ button: 'right' \}\)/gu)).toHaveLength(2);
    expect(cadenceTransaction.indexOf('const cooldownReady = await awaitChopperRuntimePhase'))
      .toBeGreaterThan(-1);
    expect(cadenceTransaction.lastIndexOf("page.mouse.up({ button: 'right' })"))
      .toBeLessThan(cadenceTransaction.indexOf('const cooldownReady = await awaitChopperRuntimePhase'));

    for (const method of [
      'stagePossessedChopperSplashTargets: () => {',
      'stagePossessedPilotedDroneSensorTarget: (occluded) => {',
      'aimPossessedChopperAtTarget: (targetId) => {',
      'aimPossessedPilotedDroneAtTarget: (targetId) => {',
    ]) {
      const start = legacy.indexOf(method, legacy.indexOf('debugWindow.__ATOMIC_ACRES_DEBUG__ = {'));
      const end = legacy.indexOf('\n  },', start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      const block = legacy.slice(start, end);
      expect(block).not.toContain('requestKillstreakControl');
      expect(block).not.toContain('applyKillstreakDamageEvent');
      expect(block).not.toContain('applyBotDamage');
      expect(block).not.toContain('sensorContacts.push');
      expect(block).not.toContain('impactEvents.push');
    }
  });
});
