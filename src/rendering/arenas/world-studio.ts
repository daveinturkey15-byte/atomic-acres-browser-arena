import { buildWorldStudio } from '../../world-studio/arena';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/** Fresh arena presentation adopts the builder's exact gameplay root. */
export const definition = createProceduralArenaVisualDefinition({
  id: 'world-studio', displayLabel: 'Atomic Acres - New World', moduleId: 'arena.visual.world-studio.v1',
  assetDependencies: [], sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xfff2dc, sunIntensity: 2.62,
    ambientColor: 0x93b6dd, ambientIntensity: 0.6,
    practicals: [{ id: 'world-studio-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false }],
  },
  fog: { color: 0xcdd8e2, near: 130, far: 760 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 140, normalBias: 0.041 },
  atmosphere: { preset: 'range-midmorning', mist: 0.04, dust: 0.08, clouds: true },
  colorPipeline: colorPipeline('world-studio.hdr.v1', 1.04),
  budgets: budgets({ maximumDrawCalls: 420, maximumTriangles: 700_000 }),
  reviewCameras: [
    camera('world-studio-overview', [38, 38, 48], [0, 2, 0], 'overview', 1.04),
    camera('world-studio-street', [0, 1.7, 28], [0, 2, -20], 'geometry', 1.04),
    camera('world-studio-west-house', [-8, 1.7, 9], [-20, 2.7, 0], 'light-occlusion', 1.04),
    camera('world-studio-east-house', [8, 1.7, -9], [20, 2.7, 0], 'light-occlusion', 1.04),
    camera('world-studio-west-living', [-14.4, 1.65, -6.6], [-19.5, 1.5, 1.5], 'light-occlusion', 1.04),
    camera('world-studio-east-living', [14.4, 1.65, -6.6], [19.5, 1.5, 1.5], 'light-occlusion', 1.04),
    camera('world-studio-west-bedroom', [-18.6, 4.95, -7.6], [-13.2, 4.8, -3], 'light-occlusion', 1.04),
    camera('world-studio-west-yard', [-36, 2.4, -7], [-25, 3.6, 0], 'geometry', 1.04),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'world-studio',
    evidence: 'Movement, physics, spawns and shot surfaces from buildWorldStudio',
    presentationMayMutateAuthority: false,
  },
  exceptions: [],
}, buildWorldStudio);
