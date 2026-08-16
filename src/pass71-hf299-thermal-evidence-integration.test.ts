import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('./thermal-ghost-presentation.ts', import.meta.url), 'utf8');
const evidence = readFileSync(new URL('../tests/e2e/pass71-hf299-thermal-operator.spec.ts', import.meta.url), 'utf8');

describe('Pass 71 HF-299 exact thermal operator evidence integration', () => {
  it('freezes one exact occluded target before the same-frame hidden control', () => {
    const freezeStart = main.indexOf('async function freezeDebugThermalOperatorEvidenceFrame(');
    const freezeEnd = main.indexOf('\nfunction currentDebugThermalOperatorEvidenceFrame()', freezeStart);
    const freeze = main.slice(freezeStart, freezeEnd);
    expect(freeze).toContain('thermal.activeTargets !== 1');
    expect(freeze).toContain('thermal.activeTargetIds[0] !== targetId');
    expect(freeze).toContain('thermal.occludedTargetIds[0] !== targetId');
    expect(freeze.indexOf('debugThermalOperatorEvidenceState = state'))
      .toBeLessThan(freeze.indexOf("await flushWebGpuFrames(8_000)"));
    expect(freeze).toContain('debugRenderPaused = true');
    expect(freeze).toContain("if (renderRuntime.backend === 'webgpu') await flushWebGpuFrames(8_000)");
    expect(freeze).toContain('completed.completedSequence < officialPresentation.submissionSequence');

    const frameStart = main.indexOf('function frame(now: number, scheduleNext = true)');
    const frameEnd = main.indexOf('\nfunction resize()', frameStart);
    const frame = main.slice(frameStart, frameEnd);
    expect(frame).toContain('if (debugRenderPaused && debugThermalOperatorEvidenceState)');
    expect(frame.indexOf('if (debugRenderPaused && debugThermalOperatorEvidenceState)'))
      .toBeLessThan(frame.indexOf('updateThermalGhosts()'));
  });

  it('submits only the thermal-hidden control and restores the shared material', () => {
    const controlStart = main.indexOf('async function captureDebugThermalOperatorHiddenControl()');
    const controlEnd = main.indexOf('\nfunction releaseDebugThermalOperatorEvidenceFrame()', controlStart);
    const control = main.slice(controlStart, controlEnd);
    expect(control).toContain('thermalGhostPresentation.setEvidenceControlHidden(true)');
    expect(control).toContain("await submitForegroundWebGpuFrame(true, 'serialized')");
    expect(control).toContain('atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER)');
    expect(control).toContain('finally {\n    thermalGhostPresentation.setEvidenceControlHidden(false);');
    expect(control).toContain("contract: 'thermal-operator-hidden-control-v1'");

    const hideStart = presentation.indexOf('setEvidenceControlHidden(hidden: boolean): boolean');
    const hideEnd = presentation.indexOf('\n  terminalDispose()', hideStart);
    const hide = presentation.slice(hideStart, hideEnd);
    expect(hide).toContain('this.sharedThermalMaterial.visible = !hidden');
    expect(hide).not.toContain('.traverse(');
    expect(hide).not.toContain('new ');
  });

  it('requires trusted RMB and retains the exact visible/control PNG pair', () => {
    expect(evidence).toContain("observer.mouse.down({ button: 'right' })");
    expect(evidence).toContain("event.type === 'mousedown' && event.button === 2 && event.trusted === true");
    expect(evidence).toContain('captureThermalOperatorHiddenControl()');
    expect(evidence).toContain('pass71Hf299ThermalRasterAttribution(occludedPng, controlPng)');
    expect(evidence).toContain('occludedControlImage: pngEvidence(controlPng)');
    expect(evidence).toContain('releaseSwapDeathCleanup: true');
  });
});
