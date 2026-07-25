import type { ArenaVisualBudgets, ArenaReviewCamera, ArenaColorPipelineDefinition } from '../arena-visual-definition';

export const SHARED_GAMEPLAY_ASSETS = Object.freeze([
  './assets/third-party/quaternius/ultimate-modular-males/Swat.gltf',
  './assets/third-party/quaternius/animated-guns/',
]);

export function colorPipeline(id: string, exposure: number): ArenaColorPipelineDefinition {
  return Object.freeze({
    id,
    workingSpace: 'linear-srgb-hdr',
    toneMap: 'aces-filmic',
    exposure,
    grade: Object.freeze({ contrast: 1.025, saturation: 1.02, shadowTint: 0x274356, highlightTint: 0xffd5a2 }),
    grain: Object.freeze({ mode: 'ordered-dither', strength: 0.72, deterministic: true }),
    output: 'srgb',
  });
}

export function budgets(overrides: Partial<ArenaVisualBudgets> = {}): ArenaVisualBudgets {
  return Object.freeze({
    maximumDrawCalls: 520,
    maximumTriangles: 1_400_000,
    maximumTextureBytes: 384 * 1024 * 1024,
    maximumShadowLights: 3,
    maximumShadowMapPixels: 6 * 2048 * 2048,
    maximumPostTextureSamples: 28,
    maximumTransientBytes: 192 * 1024 * 1024,
    cpuFrameP95Ms: 16.7,
    gpuFrameP95Ms: 16.7,
    ...overrides,
  });
}

export function camera(
  id: string,
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  purpose: ArenaReviewCamera['purpose'],
  exposure: number,
): ArenaReviewCamera {
  return Object.freeze({ id, position, target, fov: 70, near: 0.08, far: 190, fixedTimeMs: 63_000, seed: 6401, exposure, hud: 'hidden', purpose });
}
