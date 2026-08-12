import { buildGunRange } from '../../additional-maps';
import { GUN_RANGE_RACK_ASSETS } from '../../gun-range-rack-presentation';
import type { ArenaInteriorVolumeDefinition } from '../arena-visual-definition';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

// Clear interior faces of the authored shell: side walls x=+/-20, rear wall
// z=19.5, backstop z=-48.4, floor y=0 and ceiling underside y=6.875.
// The small inset prevents a fixture or animated target from living exactly on
// a wall plane where floating-point drift could put the light outside.
export const GUN_RANGE_INTERIOR_VOLUME: ArenaInteriorVolumeDefinition = Object.freeze({
  id: 'gun-range-authored-shell-interior',
  minimum: [-19.95, 0.05, -48.35] as const,
  maximum: [19.95, 6.825, 19.45] as const,
});

export const GUN_RANGE_TEST_BAY_INTERIOR_VOLUME: ArenaInteriorVolumeDefinition = Object.freeze({
  id: 'gun-range-test-bay-interior',
  minimum: [52.05, 0.05, -25.95] as const,
  maximum: [99.95, 8.125, 37.95] as const,
});

export const GUN_RANGE_TEST_BAY_DOOR_APPROACH_VOLUME: ArenaInteriorVolumeDefinition = Object.freeze({
  id: 'gun-range-test-bay-door-approach-interior',
  minimum: [20.3, 0.05, 7.8] as const,
  maximum: [51.55, 7.15, 16.2] as const,
});

export const GUN_RANGE_TEST_BAY_DOOR_PORTAL_VOLUME: ArenaInteriorVolumeDefinition = Object.freeze({
  id: 'gun-range-test-bay-door-portal-interior',
  minimum: [50.9, 0.05, 7.8] as const,
  maximum: [52.1, 7.15, 16.2] as const,
});

export const definition = createProceduralArenaVisualDefinition({
  id: 'gun-range',
  displayLabel: 'Gun Range',
  moduleId: 'arena.visual.gun-range.v1',
  assetDependencies: GUN_RANGE_RACK_ASSETS.map((asset) => asset.url),
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xffffff, sunIntensity: 0, ambientColor: 0xc8e2e6, ambientIntensity: 0.64,
    practicals: [
      { id: 'ceiling-panels', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'weapon-stations', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      {
        id: 'range-inspection-key',
        policy: 'shadowed-local',
        maximumDistance: 38,
        castsShadow: true,
        light: {
          kind: 'spot',
          position: [0, 6.05, 13.4],
          target: [0, 1.7, -17.5],
          color: 0xbdefff,
          intensity: 30,
          distance: 38,
          angle: 0.44,
          penumbra: 0.82,
          decay: 2,
          shadowMapSize: 512,
          intendedVolume: GUN_RANGE_INTERIOR_VOLUME,
          motion: {
            intensity: { amplitudeRatio: 0.06, frequencyHz: 0.09, phaseRadians: -Math.PI / 2 },
            target: { amplitude: [2.25, 0.18, 0], frequencyHz: 0.045, phaseRadians: 0 },
          },
        },
      },
      {
        id: 'range-cyan-lane-key',
        policy: 'shadowed-local',
        maximumDistance: 30,
        castsShadow: true,
        light: {
          kind: 'spot',
          position: [-11.5, 6.02, -6],
          target: [-6.5, 1.55, -28],
          color: 0x53e9e1,
          intensity: 21,
          distance: 30,
          angle: 0.5,
          penumbra: 0.86,
          decay: 2,
          shadowMapSize: 256,
          intendedVolume: GUN_RANGE_INTERIOR_VOLUME,
          motion: {
            intensity: { amplitudeRatio: 0.1, frequencyHz: 0.07, phaseRadians: 0.4 },
            target: { amplitude: [1.1, 0.12, 0], frequencyHz: 0.035, phaseRadians: 0.8 },
          },
        },
      },
      {
        id: 'range-amber-lane-key',
        policy: 'shadowed-local',
        maximumDistance: 30,
        castsShadow: true,
        light: {
          kind: 'spot',
          position: [11.5, 6.02, -13],
          target: [6.5, 1.55, -35],
          color: 0xffb84f,
          intensity: 19,
          distance: 30,
          angle: 0.5,
          penumbra: 0.86,
          decay: 2,
          shadowMapSize: 256,
          intendedVolume: GUN_RANGE_INTERIOR_VOLUME,
          motion: {
            intensity: { amplitudeRatio: 0.09, frequencyHz: 0.055, phaseRadians: 2.1 },
            target: { amplitude: [1.05, 0.1, 0], frequencyHz: 0.03, phaseRadians: 2.4 },
          },
        },
      },
      {
        id: 'test-bay-door-approach-key',
        policy: 'shadowed-local',
        maximumDistance: 16,
        castsShadow: true,
        light: {
          kind: 'spot',
          position: [51.04, 6.7, 12],
          target: [47.5, 2.5, 12],
          color: 0x72f4ed,
          intensity: 12,
          distance: 16,
          angle: 0.82,
          penumbra: 0.84,
          decay: 2,
          shadowMapSize: 256,
          intendedVolume: GUN_RANGE_TEST_BAY_DOOR_APPROACH_VOLUME,
        },
      },
      {
        id: 'test-bay-door-bay-key',
        policy: 'shadowed-local',
        maximumDistance: 16,
        castsShadow: true,
        light: {
          kind: 'spot',
          position: [52.1, 6.7, 12],
          target: [55.8, 2.5, 12],
          color: 0xffc06a,
          intensity: 14,
          distance: 16,
          angle: 0.76,
          penumbra: 0.86,
          decay: 2,
          shadowMapSize: 256,
          intendedVolume: GUN_RANGE_TEST_BAY_INTERIOR_VOLUME,
        },
      },
      {
        id: 'test-bay-inspection-key',
        policy: 'shadowed-local',
        maximumDistance: 54,
        castsShadow: true,
        light: {
          kind: 'spot',
          position: [70, 7.75, 27],
          target: [73, 1.2, -5],
          color: 0xc8f7ff,
          intensity: 38,
          distance: 54,
          angle: 0.68,
          penumbra: 0.86,
          decay: 2,
          shadowMapSize: 512,
          intendedVolume: GUN_RANGE_TEST_BAY_INTERIOR_VOLUME,
          motion: {
            intensity: { amplitudeRatio: 0.055, frequencyHz: 0.045, phaseRadians: 1.2 },
            target: { amplitude: [2.2, 0.1, 0], frequencyHz: 0.028, phaseRadians: 0.6 },
          },
        },
      },
      {
        id: 'test-bay-support-key',
        policy: 'shadowed-local',
        maximumDistance: 36,
        castsShadow: true,
        light: {
          kind: 'spot',
          position: [92, 7.75, 12],
          target: [88, 0.35, 5],
          color: 0xffbf66,
          intensity: 29,
          distance: 36,
          angle: 0.78,
          penumbra: 0.88,
          decay: 2,
          shadowMapSize: 256,
          intendedVolume: GUN_RANGE_TEST_BAY_INTERIOR_VOLUME,
          motion: {
            intensity: { amplitudeRatio: 0.06, frequencyHz: 0.052, phaseRadians: 2.25 },
            target: { amplitude: [0.8, 0.08, 1.5], frequencyHz: 0.024, phaseRadians: 1.8 },
          },
        },
      },
    ],
  },
  fog: { color: 0x28333a, near: 48, far: 148 },
  shadows: { enabled: true, mapSize: 1024, maximumDistance: 128, normalBias: 0.03 },
  atmosphere: { preset: 'indoor-range', mist: 0.08, dust: 0.08, clouds: false },
  colorPipeline: colorPipeline('pass64.gun-range.hdr.v1', 1),
  budgets: budgets({ maximumDrawCalls: 402, maximumTriangles: 780_000, maximumTextureBytes: 224 * 1024 * 1024, maximumShadowLights: 7 }),
  reviewCameras: [
    // Stay below the 7.1 m ceiling and offset from the armory header so the
    // overview frames the booths, target lanes and backstop instead of ceiling.
    camera('gun-range-overview', [10, 3.2, 15.5], [0, 1.7, -28], 'overview', 1.12),
    camera('gun-range-armory-support', [10, 2.2, 12], [0, 2, 10], 'geometry', 1),
    camera('gun-range-lane-wall', [6, 2, -4], [0, 2, -4], 'light-occlusion', 1),
    camera('gun-range-neon-lanes', [0, 2.55, -1], [0, 1.7, -36], 'light-occlusion', 1.16),
    camera('gun-range-lateral-targets', [0, 2.45, -18.5], [0, 1.72, -29], 'geometry', 1.18),
    camera('gun-range-test-bay-corridor', [24, 2.25, 10.25], [51.5, 2.15, 12], 'geometry', 1.08),
    camera('gun-range-test-bay-door-approach', [44.5, 2.3, 10.1], [51.5, 3.05, 12], 'geometry', 1.02),
    camera('gun-range-test-bay-door-relief', [43.2, 3.15, 12], [51.5, 3.15, 12], 'geometry', 0.84),
    camera('gun-range-test-bay-door-bay-face', [59, 2.55, 13.9], [51.5, 3.05, 12], 'light-occlusion', 1.02),
    camera('gun-range-test-bay-overview', [92, 4.3, 34], [72, 1.2, 1], 'overview', 1.05),
  ],
  collisionIdentity: { authoritativeArenaId: 'gun-range', evidence: 'ArenaMap gun-range collider and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['target plate animation is gameplay presentation attached to authoritative targets'],
}, buildGunRange);
