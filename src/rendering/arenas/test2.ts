import { buildTest2 } from '../../test-maps';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { TERMINAL_GENERATED_SKY_ASSET_URL } from '../sky-backdrop';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * Test2 (owner 2026-08-30, docs/TEST2_MAP_BRIEF.md): sun-drenched hillside
 * mansion at late afternoon — long warm shadows over travertine, pool glint,
 * hedges. Open-air throughout; emissive-only practicals, golden key light.
 */
export const definition = createProceduralArenaVisualDefinition({
  id: 'test2',
  displayLabel: 'Test2',
  moduleId: 'arena.visual.test2.v1',
  assetDependencies: [TERMINAL_GENERATED_SKY_ASSET_URL],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    // Low golden-hour sun; cool sky ambient fills the long shadows.
    sunColor: 0xffd9a0, sunIntensity: 2.9, ambientColor: 0xa9c2d8, ambientIntensity: 0.46,
    practicals: [
      { id: 'test2-estate-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
    ],
  },
  fog: { color: 0xe4cfae, near: 52, far: 170 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 150, normalBias: 0.03 },
  atmosphere: { preset: 'estate-golden-hour', mist: 0.12, dust: 0.08, clouds: true },
  colorPipeline: colorPipeline('pass81.test2.hdr.v1', 1.07),
  budgets: budgets({ maximumDrawCalls: 420, maximumTriangles: 700_000 }),
  reviewCameras: [
    camera('test2-estate-overview', [26, 18, 30], [0, 2, 0], 'overview', 1.07),
    camera('test2-pool-lane', [-26, 2, -14], [0, 1.2, -14], 'geometry', 1.07),
    camera('test2-garden-occlusion', [14, 2.4, 18], [-10, 1.4, 12], 'light-occlusion', 1.07),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'test2',
    evidence: 'ArenaMap test2 collider, spawn and shot-surface identity from buildTest2',
    presentationMayMutateAuthority: false,
  },
  exceptions: ['pool water sheet is presentation-only; the basin slab beneath it is the movement/shot authority'],
}, buildTest2);
