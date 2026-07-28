import { buildRustworks1v1, RUSTWORKS_CONTAINER_LIGHTS, RUSTWORKS_WORK_LIGHTS } from '../../additional-maps';
import { createProceduralArenaVisualDefinition, type ArenaPracticalDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

const towerPracticals: readonly ArenaPracticalDefinition[] = RUSTWORKS_WORK_LIGHTS.map((fixture, index) => Object.freeze({
  id: `tower-mounted-work-light${fixture.id === 'north' ? '' : `-${fixture.id}`}`,
  policy: 'shadowed-local' as const,
  maximumDistance: fixture.distance,
  castsShadow: true,
  light: Object.freeze({
    kind: 'spot' as const,
    position: fixture.position,
    target: fixture.target,
    color: fixture.color,
    intensity: fixture.intensity,
    distance: fixture.distance,
    angle: fixture.angle,
    penumbra: 0.7,
    decay: 2,
    shadowMapSize: 512,
    intendedVolume: Object.freeze({
      id: `rustrig-tower-work-light-${fixture.id}-volume`,
      minimum: [-18, 0.05, fixture.id === 'north' ? -5.5 : -18] as const,
      maximum: [18, 8.8, fixture.id === 'north' ? 18 : 5.5] as const,
    }),
    motion: Object.freeze({
      intensity: Object.freeze({ amplitudeRatio: 0.075, frequencyHz: 0.115, phaseRadians: index * 1.73 }),
    }),
  }),
}));

const containerPracticals: readonly ArenaPracticalDefinition[] = RUSTWORKS_CONTAINER_LIGHTS.map((fixture) => Object.freeze({
  id: `container-dynamic-${fixture.id}`,
  policy: 'shadowed-local' as const,
  maximumDistance: fixture.distance,
  castsShadow: true,
  light: Object.freeze({
    kind: 'spot' as const,
    position: fixture.position,
    target: fixture.target,
    color: fixture.color,
    intensity: fixture.intensity,
    distance: fixture.distance,
    angle: fixture.angle,
    penumbra: 0.76,
    decay: 2,
    shadowMapSize: 256,
    intendedVolume: Object.freeze({
      id: `rustrig-container-${fixture.id}-interior`,
      minimum: fixture.volume.minimum,
      maximum: fixture.volume.maximum,
    }),
    motion: Object.freeze({
      intensity: Object.freeze({
        amplitudeRatio: 0.12,
        frequencyHz: fixture.frequencyHz,
        phaseRadians: fixture.phaseRadians,
      }),
    }),
  }),
}));

export const definition = createProceduralArenaVisualDefinition({
  id: 'rustworks-1v1',
  displayLabel: 'RustRig',
  moduleId: 'arena.visual.rustworks-1v1.v1',
  // The duplicate Blender tower is retained as source evidence only. Runtime
  // presentation uses the procedural authority and requests no retired GLB.
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xe2ebff, sunIntensity: 3.6, ambientColor: 0x718aa5, ambientIntensity: 0.72,
    practicals: [
      { id: 'tower-work-light-lenses', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'container-interior-warm-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      ...towerPracticals,
      ...containerPracticals,
    ],
  },
  fog: { color: 0x293747, near: 58, far: 152 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 180, normalBias: 0.038 },
  atmosphere: { preset: 'industrial-night', mist: 0.28, dust: 0.1, clouds: true },
  colorPipeline: colorPipeline('pass64.rustrig.hdr.v1', 2),
  // One directional moon, two deck keys and four 256px container volumes.
  // Performance/Compatibility construct none of the local volumes.
  budgets: budgets({ maximumDrawCalls: 500, maximumTriangles: 1_250_000, maximumShadowLights: 7 }),
  reviewCameras: [
    camera('rustrig-overview', [38, 31, 42], [0, 5, 0], 'overview', 2),
    camera('rustrig-tower-support', [14, 2.4, 12], [0, 5, 0], 'geometry', 2),
    camera('rustrig-container-wall', [10, 2.1, -18], [4, 2.1, -18], 'light-occlusion', 2),
    camera('rustrig-container-dynamic-northwest', [-1.4, 1.7, -13], [-8, 1.15, -13], 'light-occlusion', 1.3),
    camera('rustrig-container-dynamic-southeast', [18, 1.7, 1.4], [18, 1.15, 8], 'light-occlusion', 1.3),
    camera('rustrig-mounted-work-lights', [11, 5.4, -12], [0, 6.4, 0], 'light-occlusion', 2),
    camera('rustrig-deck-surface', [18, 2.2, 18], [0, 0.04, 0], 'geometry', 2),
  ],
  collisionIdentity: { authoritativeArenaId: 'rustworks-1v1', evidence: 'ArenaMap rustworks-1v1 collider and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['animated Welsh flag cloth is presentation-only'],
}, buildRustworks1v1);
