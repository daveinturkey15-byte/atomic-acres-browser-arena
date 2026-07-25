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
    sunColor: 0xe2ebff, sunIntensity: 3.05, ambientColor: 0x647b94, ambientIntensity: 0.4,
    practicals: [{ id: 'industrial-floods', policy: 'emissive-only', maximumDistance: 0, castsShadow: false }],
  },
  fog: { color: 0x293747, near: 58, far: 152 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 180, normalBias: 0.038 },
  atmosphere: { preset: 'industrial-night', mist: 0.28, dust: 0.1, clouds: true },
  colorPipeline: colorPipeline('pass64.rustrig.hdr.v1', 1.18),
  budgets: budgets({ maximumDrawCalls: 500, maximumTriangles: 1_250_000, maximumShadowLights: 1 }),
  reviewCameras: [
    camera('rustrig-overview', [38, 31, 42], [0, 5, 0], 'overview', 1.18),
    camera('rustrig-tower-support', [14, 2.4, 12], [0, 5, 0], 'geometry', 1.18),
    camera('rustrig-container-wall', [10, 2.1, -18], [4, 2.1, -18], 'light-occlusion', 1.18),
  ],
  collisionIdentity: { authoritativeArenaId: 'rustworks-1v1', evidence: 'ArenaMap rustworks-1v1 collider and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['animated Welsh flag cloth is presentation-only'],
}, buildRustworks1v1);
