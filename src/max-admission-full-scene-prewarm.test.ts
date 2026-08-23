import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Pass 79: every match-bound prewarm batch renders ONE DEEP through
// renderRuntime.compileAndRender's suppressUnrelatedRenderables, so the
// complete composition (arena + operators + viewmodel + corpse pool through
// the full preset post graph) has never drawn together before the first
// guarded MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS flush runs inside
// startGame. Cold first-use work on that combined frame measured 4.5-6.5s on
// the owner's RTX 5080 - over the 4000ms bound - bouncing MAX deployments to
// the menu ("WebGPU queue completion exceeded 4000 ms"). This pins that an
// exact full-scene compilation is submitted behind the runtime's 12s
// cold-generation fence BEFORE the first guarded submission, without touching
// the guard itself.
const legacy = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('MAX admission full-scene prewarm contract', () => {
  it('submits one exact full-scene compile before the first guarded admission flush', () => {
    const branchStart = legacy.lastIndexOf(
      "if (renderRuntime.backend === 'webgpu') {",
      legacy.indexOf('await exercisePreparedWebGpuWeaponSwitches();'),
    );
    expect(branchStart).toBeGreaterThan(0);
    const settlement = legacy.indexOf("await settleWebGpuPresentation('Initial match');", branchStart);
    expect(settlement).toBeGreaterThan(branchStart);
    const branch = legacy.slice(branchStart, settlement);

    const fullSceneCompile = branch.indexOf('await renderRuntime.compileAndRender(scene, camera, scene);');
    const guardedExercise = branch.indexOf('await exercisePreparedWebGpuWeaponSwitches();');
    expect(fullSceneCompile, 'startGame must run one unsuppressed renderRuntime.compileAndRender(scene) prewarm').toBeGreaterThanOrEqual(0);
    expect(fullSceneCompile).toBeLessThan(guardedExercise);

    // It must be the runtime's own cold fence doing the waiting, not a bare
    // submit: compileAndRender fences its forced submission with
    // waitForSubmittedWork(12_000) - the sanctioned cold-generation allowance -
    // so no guarded 4s flush ever carries first-use pipeline creation.
    expect(branch.slice(fullSceneCompile, guardedExercise)).not.toContain('submitForegroundWebGpuFrame');
  });

  it('keeps the guarded admission bound itself untouched', () => {
    expect(legacy).toContain('MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS = 4_000');
  });
});
