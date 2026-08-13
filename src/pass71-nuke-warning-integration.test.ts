import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const evidence = readFileSync(new URL('../tests/e2e/pass71-nuke-warning.spec.ts', import.meta.url), 'utf8');

describe('Pass 71 dramatic Nuke warning integration', () => {
  it('prewarms both warning and detonation vocabulary before gameplay', () => {
    const start = main.indexOf('async function prewarmNukePresentation()');
    const end = main.indexOf('\nnukeShockwave.raycast', start);
    const prewarm = main.slice(start, end);
    expect(prewarm).toContain('compileAndRender(nukeWarningBeacon, camera, scene)');
    expect(prewarm).toContain('compileAndRender(nukeShockwave, camera, scene)');
    expect(prewarm.indexOf('nukeWarningBeacon.visible = true')).toBeLessThan(prewarm.indexOf('compileAndRender(nukeWarningBeacon'));
    expect(prewarm).toContain('nukePresentationPrewarmed = true');
  });

  it('stages the beacon inside the Gun Range room for the whole warning and hides it at detonation', () => {
    const beginStart = main.indexOf('function beginNuke(');
    const beginEnd = main.indexOf('\nfunction detonateNuke(', beginStart);
    const begin = main.slice(beginStart, beginEnd);
    expect(begin).toContain("selectedArena.id === 'gun-range' ? GUN_RANGE_NUKE_WARNING_POSITION");
    expect(begin).toContain('nukeWarningBeacon.visible = true');
    expect(begin).toContain('warningBeacon: nukeWarningBeacon');

    const detonateStart = beginEnd;
    const detonateEnd = main.indexOf('\nfunction updateNuke(', detonateStart);
    const detonate = main.slice(detonateStart, detonateEnd);
    expect(detonate).toContain('sequence.warningBeacon.visible = false');
    expect(detonate).toContain('sequence.shockwave.visible = true');
    expect(detonate.indexOf('sequence.warningBeacon.visible = false'))
      .toBeLessThan(detonate.indexOf('sequence.shockwave.scale.setScalar(0.1)'));
  });

  it('drives the warning from the bounded sensory-aware sampler and tears it down on every reset', () => {
    const updateStart = main.indexOf('function updateNuke(');
    const updateEnd = main.indexOf('\nconst triPassMissileBodyGeometry', updateStart);
    const update = main.slice(updateStart, updateEnd);
    expect(update).toContain('sampleNukeWarningPresentation(');
    expect(update).toContain('accessibilityRuntime.reducedSensory');
    expect(update).toContain('warningPresentation.skyFlash');

    const clearStart = main.indexOf('function clearFieldSupport()');
    const clearEnd = main.indexOf('\nfunction deactivateRailgunScopePresentation', clearStart);
    const clear = main.slice(clearStart, clearEnd);
    expect(clear).toContain('nukeWarningBeacon.visible = false');
    expect(clear).toContain('nukeWarningCoreMaterial.opacity = 0');
    expect(clear).toContain('nukeWarningRingMaterial.opacity = 0');
    expect(clear).not.toContain('nukeWarningLight');
  });

  it('attributes the release raster to the exact pre-detonation beacon rather than the red HUD', () => {
    const freezeStart = main.indexOf('async function freezeDebugNukeWarningEvidenceFrame()');
    const freezeEnd = main.indexOf('\nfunction currentDebugNukeWarningEvidenceFrame()', freezeStart);
    const freeze = main.slice(freezeStart, freezeEnd);
    expect(freeze).toContain('official.frame !== lastGameplayPresentedFrame');
    expect(freeze).toContain('debugNukeWarningEvidenceState = state');
    expect(freeze).toContain('debugRenderPaused = true');
    expect(freeze).toContain("if (renderRuntime.backend === 'webgpu') await flushWebGpuFrames(8_000);");
    expect(freeze).toContain('completed.completedSequence < official.submissionSequence');
    expect(freeze).toContain("contract: 'nuke-warning-frozen-visible-frame-v1'");

    const frameStart = main.indexOf('function frame(now: number, scheduleNext = true)');
    const frameEnd = main.indexOf('\nfunction resize()', frameStart);
    const frame = main.slice(frameStart, frameEnd);
    expect(frame).toContain('if (debugRenderPaused && debugNukeWarningEvidenceState)');
    expect(frame.indexOf('if (debugRenderPaused && debugNukeWarningEvidenceState)'))
      .toBeLessThan(frame.indexOf('updateFieldSupport(frameDt, now)'));

    const controlStart = main.indexOf('async function captureDebugNukeWarningHiddenControl()');
    const controlEnd = main.indexOf('\nfunction releaseDebugNukeWarningEvidenceFrame()', controlStart);
    const control = main.slice(controlStart, controlEnd);
    expect(control).toContain('root.visible = false');
    expect(control).toContain("await submitForegroundWebGpuFrame(true, 'serialized')");
    expect(control).toContain('atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER)');
    expect(control).toContain('finally {\n    root.visible = true;');
    expect(control).toContain("contract: 'nuke-warning-hidden-control-v1'");

    expect(evidence).toContain('redWarningAttributionDelta(hiddenControlPng, active, attributableCrop)');
    expect(evidence).toContain('expect(attributableCrop.top).toBeGreaterThan(activation.framing.hud.bottom)');
    expect(evidence).toContain('expect(visibleCaptureReceipt).toEqual(activation.frozen)');
    expect(evidence).toContain('expect(activation.frozen.detonateInMs).toBeGreaterThan(2_000)');
    expect(evidence).toContain('expect(raster.maximumRedDelta).toBeGreaterThanOrEqual(72)');
    expect(evidence).toContain('expect(raster.changedWarningPixels).toBeGreaterThanOrEqual(240)');
    expect(evidence.indexOf('page.setViewportSize({ width: 1_920, height: 1_080 })'))
      .toBeGreaterThan(evidence.indexOf("snapshot().matchPhase === 'active'"));
    expect(evidence).not.toContain('redWarningDelta(before, active)');
  });
});
