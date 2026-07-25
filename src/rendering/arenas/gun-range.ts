import { buildGunRange } from '../../additional-maps';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

export const definition = createProceduralArenaVisualDefinition({
  id: 'gun-range',
  displayLabel: 'Gun Range',
  moduleId: 'arena.visual.gun-range.v1',
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xffffff, sunIntensity: 0, ambientColor: 0x8999a4, ambientIntensity: 0.32,
    practicals: [
      { id: 'ceiling-panels', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'weapon-stations', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'range-inspection-key', policy: 'shadowed-local', maximumDistance: 45, castsShadow: true },
    ],
  },
  fog: { color: 0x28333a, near: 38, far: 94 },
  shadows: { enabled: true, mapSize: 1024, maximumDistance: 96, normalBias: 0.03 },
  atmosphere: { preset: 'indoor-range', mist: 0.08, dust: 0.08, clouds: false },
  colorPipeline: colorPipeline('pass64.gun-range.hdr.v1', 1),
  budgets: budgets({ maximumDrawCalls: 320, maximumTriangles: 700_000, maximumTextureBytes: 224 * 1024 * 1024, maximumShadowLights: 1 }),
  reviewCameras: [
    // Stay below the 7.1 m ceiling and behind the armory so the overview
    // actually frames firing booths, target lanes and the backstop.
    camera('gun-range-overview', [0, 6.2, 18], [0, 1.5, -28], 'overview', 1.04),
    camera('gun-range-armory-support', [10, 2.2, 12], [0, 2, 10], 'geometry', 1),
    camera('gun-range-lane-wall', [6, 2, -4], [0, 2, -4], 'light-occlusion', 1),
  ],
  collisionIdentity: { authoritativeArenaId: 'gun-range', evidence: 'ArenaMap gun-range collider and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['target plate animation is gameplay presentation attached to authoritative targets'],
}, buildGunRange);
