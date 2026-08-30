import { buildTest1 } from '../../test-maps';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { TERMINAL_GENERATED_SKY_ASSET_URL } from '../sky-backdrop';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * Test1 (owner 2026-08-30, docs/TEST1_MAP_BRIEF.md): sun-bleached range
 * training ground. Hard mid-morning sun, dry dust, no interior volumes —
 * every structure is open-air, so the light rig is pure sun + ambient with
 * emissive-only practicals (the D3D12 pipeline-budget posture all outdoor
 * arenas share).
 */
export const definition = createProceduralArenaVisualDefinition({
  id: 'test1',
  displayLabel: 'Test1',
  moduleId: 'arena.visual.test1.v1',
  assetDependencies: [TERMINAL_GENERATED_SKY_ASSET_URL],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    // High, slightly warm sun — the hard late-morning desert key.
    sunColor: 0xfff0d2, sunIntensity: 3.2, ambientColor: 0xc9d4dd, ambientIntensity: 0.42,
    practicals: [
      { id: 'test1-range-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
    ],
  },
  fog: { color: 0xd9cdb2, near: 46, far: 150 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 130, normalBias: 0.03 },
  atmosphere: { preset: 'range-midmorning', mist: 0.08, dust: 0.22, clouds: false },
  colorPipeline: colorPipeline('pass81.test1.hdr.v1', 1.05),
  budgets: budgets({ maximumDrawCalls: 380, maximumTriangles: 600_000 }),
  reviewCameras: [
    camera('test1-tower-overview', [20, 16, 26], [0, 2.4, 0], 'overview', 1.05),
    camera('test1-firing-line', [-24, 1.7, -14], [-14, 1.4, 8], 'geometry', 1.05),
    camera('test1-container-occlusion', [10, 2.2, -12], [18, 1.6, 4], 'light-occlusion', 1.05),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'test1',
    evidence: 'ArenaMap test1 collider, spawn and shot-surface identity from buildTest1',
    presentationMayMutateAuthority: false,
  },
  exceptions: [],
}, buildTest1);
