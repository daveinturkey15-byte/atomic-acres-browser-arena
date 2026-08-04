import { buildFarcrysis } from '../../farcrysis';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

export const definition = createProceduralArenaVisualDefinition({
  id: 'farcrysis',
  displayLabel: 'Farcrysis',
  moduleId: 'arena.visual.farcrysis.v1',
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xffd9a0, sunIntensity: 3.1, ambientColor: 0x9fbfa8, ambientIntensity: 0.42,
    practicals: [
      { id: 'farcrysis-beach-golden-hour', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'farcrysis-core-work-lights', policy: 'shadowed-local', maximumDistance: 22, castsShadow: true },
      { id: 'farcrysis-jungle-dapple', policy: 'shadowed-local', maximumDistance: 18, castsShadow: true },
    ],
  },
  fog: { color: 0xcfe0c8, near: 40, far: 96 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 120, normalBias: 0.03 },
  atmosphere: { preset: 'golden-hour-jungle', mist: 0.24, dust: 0.1, clouds: true },
  colorPipeline: colorPipeline('pass69.farcrysis.hdr.v1', 1.08),
  budgets: budgets({ maximumDrawCalls: 460, maximumTriangles: 1_100_000 }),
  reviewCameras: [
    camera('farcrysis-beach-golden', [-27, 3.2, -27], [0, 1.2, 0], 'overview', 1.08),
    camera('farcrysis-jungle-dapple', [-10, 1.9, -12], [0, 1.7, 0], 'light-occlusion', 1.08),
    camera('farcrysis-core-interior', [0, 2.6, 0], [0, 1.7, 4], 'geometry', 1.08),
    camera('farcrysis-seaplane-throwback', [24, 2.4, -24], [20, 1.2, -20], 'overview', 1.08),
  ],
  collisionIdentity: { authoritativeArenaId: 'farcrysis', evidence: 'ArenaMap farcrysis collider, cover and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['beach/jungle foliage may remain presentation-only while authoritative cover and shot surfaces remain unchanged'],
}, buildFarcrysis);
