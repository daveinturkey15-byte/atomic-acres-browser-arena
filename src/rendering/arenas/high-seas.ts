import { buildHighSeas } from '../../high-seas';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { TERMINAL_GENERATED_SKY_ASSET_URL } from '../sky-backdrop';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

export const definition = createProceduralArenaVisualDefinition({
  id: 'high-seas',
  displayLabel: 'High Seas',
  moduleId: 'arena.visual.high-seas.v1',
  assetDependencies: [TERMINAL_GENERATED_SKY_ASSET_URL],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xffe3bb, sunIntensity: 3, ambientColor: 0x9fc7cf, ambientIntensity: 0.4,
    practicals: [
      { id: 'high-seas-deck-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'high-seas-cabin-contrast-key', policy: 'shadowed-local', maximumDistance: 24, castsShadow: true },
      { id: 'high-seas-upper-deck-key', policy: 'shadowed-local', maximumDistance: 28, castsShadow: true },
    ],
  },
  fog: { color: 0xb8d6dc, near: 42, far: 132 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 150, normalBias: 0.03 },
  atmosphere: { preset: 'open-ocean-day', mist: 0.16, dust: 0.04, clouds: true },
  colorPipeline: colorPipeline('pass75.high-seas.hdr.v1', 1.06),
  budgets: budgets({ maximumDrawCalls: 480, maximumTriangles: 950_000 }),
  reviewCameras: [
    camera('high-seas-starboard-overview', [22, 18, 54], [0, 4.8, 0], 'overview', 1.06),
    camera('high-seas-stern-main-deck', [-8, 5.2, 34], [0, 4.9, 12], 'geometry', 1.06),
    camera('high-seas-upper-deck-occlusion', [8, 7.8, 5], [0, 6.6, -16], 'light-occlusion', 1.06),
    camera('high-seas-bow-lane', [-8, 4.9, -34], [0, 4.9, -12], 'portal', 1.06),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'high-seas',
    evidence: 'ArenaMap high-seas collider, elevated-deck navigation and shot-surface identity',
    presentationMayMutateAuthority: false,
  },
  exceptions: ['surrounding ocean remains presentation/float-zone authority and never becomes a shot or movement collider'],
}, buildHighSeas);
