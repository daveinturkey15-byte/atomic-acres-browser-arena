import { buildRustworks1v1 } from '../../additional-maps';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

export const definition = createProceduralArenaVisualDefinition({
  id: 'rustworks-1v1',
  displayLabel: 'RustRig',
  moduleId: 'arena.visual.rustworks-1v1.v1',
  assetDependencies: ['./assets/original/models/rustworks-central-tower.glb?v=pass62-20260724-1'],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xe2ebff, sunIntensity: 3.6, ambientColor: 0x718aa5, ambientIntensity: 0.6,
    practicals: [
      { id: 'tower-work-light-lenses', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'tower-mounted-work-light', policy: 'shadowed-local', maximumDistance: 34, castsShadow: true },
      { id: 'tower-mounted-work-light-south', policy: 'shadowed-local', maximumDistance: 34, castsShadow: true },
    ],
  },
  fog: { color: 0x293747, near: 58, far: 152 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 180, normalBias: 0.038 },
  atmosphere: { preset: 'industrial-night', mist: 0.28, dust: 0.1, clouds: true },
  colorPipeline: colorPipeline('pass64.rustrig.hdr.v1', 1.58),
  // One directional moon plus two opposed, bounded shadowed deck keys.
  budgets: budgets({ maximumDrawCalls: 500, maximumTriangles: 1_250_000, maximumShadowLights: 3 }),
  reviewCameras: [
    camera('rustrig-overview', [38, 31, 42], [0, 5, 0], 'overview', 1.58),
    camera('rustrig-tower-support', [14, 2.4, 12], [0, 5, 0], 'geometry', 1.58),
    camera('rustrig-container-wall', [10, 2.1, -18], [4, 2.1, -18], 'light-occlusion', 1.58),
    camera('rustrig-mounted-work-lights', [11, 5.4, -12], [0, 6.4, 0], 'light-occlusion', 1.58),
    camera('rustrig-deck-surface', [18, 2.2, 18], [0, 0.04, 0], 'geometry', 1.58),
  ],
  collisionIdentity: { authoritativeArenaId: 'rustworks-1v1', evidence: 'ArenaMap rustworks-1v1 collider and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['animated Welsh flag cloth is presentation-only'],
}, buildRustworks1v1);
