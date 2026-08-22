import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const legacy = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
const hudCss = readFileSync(new URL('./ui/pass65-hud.css', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('./killstreak-presentation.ts', import.meta.url), 'utf8');
const authoring = readFileSync(new URL('../scripts/blender/create-pass65-support-vehicles.py', import.meta.url), 'utf8');
const authoringRunner = readFileSync(new URL('../scripts/blender/run-authoring.mjs', import.meta.url), 'utf8');
const e2e = readFileSync(new URL('../tests/e2e/pass70-chopper-gunner.spec.ts', import.meta.url), 'utf8');

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
      'gunner-control-strip', 'gunner-gun-control', 'gunner-control-gun-ammo',
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
    // HF-335: the taller authored canopy frame restored from the unmerged
    // Pass 71 candidate lane, desktop and narrow-viewport values both locked.
    expect(hudCss).toContain('height: clamp(280px, 58vh, 620px);');
    expect(hudCss).toContain('height: clamp(210px, 48vh, 390px);');
    expect(hudCss).toContain('#gunner-missile-status[data-ready="true"] em');
    expect(legacy).toContain("event.button === 2 && localKillstreakActorSnapshot()?.possession?.kind === 'chopper-gunner'");
    expect(legacy).toContain('missileFire: true');
  });

  it('HF-335: shows one legible LMB GUN / RMB MISSILES control strip that never crosses the sight corridor', () => {
    // The owner asked for `LMB GUN | RMB MISSILES xN`, not a tutorial panel.
    expect(shell).toContain('<kbd>LMB</kbd><span>GUN</span>');
    expect(shell).toContain('<kbd>RMB</kbd><span>MISSILES</span>');
    expect(shell).toContain('<i aria-hidden="true">&times;</i><b id="gunner-missile-ammo">');
    // The missile readout keeps its own id/hidden/data-ready contract so the
    // existing typed HUD lifecycle in legacy-main stays the only writer.
    expect(shell).toMatch(/id="gunner-missile-status"[^>]*hidden[^>]*data-ready="false"/u);
    // Gated by the HUD root's existing data-support-kind lifecycle only.
    expect(hudCss).toContain('#gunner-cockpit-hud[data-support-kind="chopper-gunner"] #gunner-control-strip { display: flex; }');
    expect(hudCss).toContain('#gunner-cockpit-hud[data-support-kind] #gunner-control-strip[hidden] { display: none; }');
    // Bottom-right rail: opposite the instruments, clear of the centre reticle,
    // the top-centre status band and the top-right thermal banner.
    const strip = hudCss.slice(hudCss.indexOf('#gunner-control-strip {'), hudCss.indexOf('#gunner-control-strip .gunner-control {'));
    expect(strip).toContain('right: max(18px, env(safe-area-inset-right));');
    expect(strip).toContain('bottom: max(20px, calc(env(safe-area-inset-bottom) + 10px));');
    expect(strip).not.toContain('left:');
    expect(strip).not.toContain('top:');
    // Legible from 1280x720 through ultrawide and high-DPI: every type ramp is
    // clamp()ed against the viewport rather than pinned to one pixel size.
    expect(hudCss).toContain('font: 900 clamp(11px, 0.86vw, 18px)/1 Inter, system-ui, sans-serif;');
    expect(hudCss).toContain('font: 950 clamp(17px, 1.3vw, 27px)/1 Inter, system-ui, sans-serif;');
    expect(hudCss).toContain('font: 900 clamp(9px, 0.62vw, 14px)/1 Inter, system-ui, sans-serif;');
    // The cockpit-frame pillars are ::after content and paint over children, so
    // the strip and both telemetry rails claim their own layer.
    expect(strip).toContain('z-index: 1;');
    expect(hudCss).toMatch(/\.gunner-instruments \{ z-index: 1; \}/u);
    // Narrow viewports stack the strip above the instruments instead of over them.
    const narrow = hudCss.slice(hudCss.indexOf('@media (max-width: 760px), (max-height: 520px)'));
    expect(narrow).toContain('bottom: max(104px, calc(env(safe-area-inset-bottom) + 94px));');
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
    expect(e2e).toContain('const visibleBounds = detail.drawableStableAirframeBounds;');
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

  it('HF-336: casts chopper shadows from one merged silhouette, applied after the shared-asset pass', () => {
    const start = presentation.indexOf('function buildAuthoredSupportVehicle(');
    const end = presentation.indexOf('\nfunction buildProceduralChopperFallback(', start);
    const build = presentation.slice(start, end);
    // markSharedPresentationAsset sets castShadow = true on every mesh it
    // touches, so the shadow budget has to be the last word or LOD0's full
    // caster set is silently reinstated for every non-possessing player.
    const sharedAssetPass = build.lastIndexOf('markSharedPresentationAsset(root);');
    const shadowBudget = build.indexOf("applyAuthoredSupportShadowBudget(root, 'chopper', { castShadows: false });");
    expect(sharedAssetPass).toBeGreaterThan(-1);
    expect(shadowBudget).toBeGreaterThan(sharedAssetPass);
    expect(build).toContain("buildAuthoredSupportShadowSilhouette('chopper', shadowSilhouetteSource)");
    expect(build).not.toContain('applyAuthoredSupportShadowBudget(level,');
    // The proxy stays visible so three.js submits it to the shadow map, but it
    // writes neither colour nor depth in the beauty pass.
    expect(presentation).toContain('colorWrite: false,');
    expect(presentation).toContain('silhouette.castShadow = true;');
    expect(presentation).toContain('silhouette.receiveShadow = false;');
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
});
