import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const scenePass = readFileSync(new URL('./rendering/pass64-tsl-scene.ts', import.meta.url), 'utf8');

/**
 * HF-363. The filmic grade chain moved grain to a display-referred stage and the
 * linear-side ordered dither was removed. Both are correct, but together they cut
 * the only path the arena's AUTHORED grain strength had to the picture:
 * `setGradeGrainStrength` existed with no production caller, so every arena would
 * have fallen back to the chain's default while the scene pass kept updating a
 * grain uniform that fed nothing.
 *
 * An independent audit had already flagged setGradeGrainStrength as unwired while
 * it was merely redundant. Removing the dither made it load-bearing. These are
 * source-text assertions on purpose: the defect is a missing CALL, and a renderer
 * with no grain looks like a renderer with subtle grain until someone compares
 * screenshots.
 */
describe('HF-363 authored grain reaches the display-referred grade stage', () => {
  it('legacy-main hands each applied arena definition to setGradeGrainStrength', () => {
    expect(source).toContain('renderRuntime.setGradeGrainStrength(');
    expect(source).toContain('module.definition.colorPipeline.grain.strength * graphicsRuntime.post.filmGrainScale');
  });

  it('applies grain on the same path that applies the arena definition', () => {
    const applyIndex = source.indexOf('appliedTslArenaDefinitions += 1;');
    const grainIndex = source.indexOf('renderRuntime.setGradeGrainStrength(');
    const telemetryIndex = source.indexOf('renderRuntime.setRenderTargetTelemetry(');
    expect(applyIndex).toBeGreaterThanOrEqual(0);
    // Grain must be set on every definition change, not once at boot: arenas author
    // different strengths, so a call outside this path would pin the first arena's.
    expect(grainIndex).toBeGreaterThan(applyIndex);
    expect(grainIndex).toBeLessThan(telemetryIndex);
  });

  it('the scene pass no longer adds a linear-side ordered dither', () => {
    // The linear dither piled noise into the shadows and, measured, made shadow
    // grain about 50% WORSE once display-referred grain was added on top of it.
    expect(scenePass).not.toContain('orderedDither');
    expect(scenePass).toContain('hdrWithBloom.mul(float(1).sub(vignetteFalloff))');
  });
});
