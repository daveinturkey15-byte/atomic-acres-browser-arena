import type { ArenaVisualBudgets, ArenaReviewCamera, ArenaColorPipelineDefinition } from '../arena-visual-definition';
import { FIRST_PERSON_CAMERA_NEAR_METERS } from '../../viewmodel-body-fit';

export const SHARED_GAMEPLAY_ASSETS = Object.freeze([
  './assets/original/models/operators/pass65-third-person-operator-lod0.glb',
  './assets/original/models/operators/pass65-third-person-operator-lod1.glb',
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
    // Includes invisible GPU-prewarmed viewmodels/support assets as well as
    // the visible arena. This is deliberately tighter than the legacy 768 MiB
    // global guard while allowing the hitch-free reachable-weapon catalog.
    maximumResidentTextureBytes: 512 * 1024 * 1024,
    maximumShadowLights: 3,
    maximumShadowMapPixels: 6 * 2048 * 2048,
    maximumPostTextureSamples: 28,
    // A 2560x1440 High frame with 4x principal HDR MSAA, depth, resolved HDR,
    // and the conservative bloom-chain allowance is 225 MiB.
    maximumTransientBytes: 256 * 1024 * 1024,
    cpuFrameP95Ms: 16.7,
    gpuFrameP95Ms: 16.7,
    ...overrides,
  });
}

/**
 * PASS 87 Lane AR, item 6. `near` was the literal 0.08 until now, which is
 * exactly `FIRST_PERSON_CAMERA_NEAR_BEFORE_HF410_METERS` - the on-foot near
 * plane this build shipped with before HF-410 moved it to 0.02 in PASS 85.
 * `setArenaReviewCamera` assigns `camera.near = reviewCamera.near` verbatim
 * (src/legacy-main.ts), so every deterministic review capture and every
 * visual-regression instrument that drives one has been rendering at a near
 * plane the game no longer uses. A regression that moved
 * FIRST_PERSON_CAMERA_NEAR_METERS - the value the whole viewmodel fit is
 * graded against - would have been invisible to all of them, because the
 * review camera overwrote it on the way in.
 *
 * Deriving it costs the review captures the same 4x depth-precision reduction
 * the gameplay camera already pays (see the note on
 * FIRST_PERSON_CAMERA_NEAR_METERS); that is the point. The instrument must see
 * what the player sees, including the cost.
 */
export function camera(
  id: string,
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  purpose: ArenaReviewCamera['purpose'],
  exposure: number,
  far = 190,
): ArenaReviewCamera {
  return Object.freeze({
    id, position, target, fov: 70, near: FIRST_PERSON_CAMERA_NEAR_METERS, far,
    fixedTimeMs: 63_000, seed: 6401, exposure, hud: 'hidden', purpose,
  });
}
