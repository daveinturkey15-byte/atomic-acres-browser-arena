import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

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
});
