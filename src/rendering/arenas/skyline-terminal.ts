import { buildSkylineTerminal } from '../../additional-maps';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

export const definition = createProceduralArenaVisualDefinition({
  id: 'skyline-terminal',
  displayLabel: 'Terminal',
  moduleId: 'arena.visual.skyline-terminal.v1',
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xeaf7ff, sunIntensity: 2.9, ambientColor: 0x8aa5af, ambientIntensity: 0.38,
    practicals: [
      { id: 'terminal-ceiling-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'aircraft-cabin-contrast-key', policy: 'shadowed-local', maximumDistance: 30, castsShadow: true },
      { id: 'concourse-contrast-key', policy: 'shadowed-local', maximumDistance: 34, castsShadow: true },
    ],
  },
  fog: { color: 0xa9bec4, near: 64, far: 156 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 182, normalBias: 0.035 },
  atmosphere: { preset: 'airport-dawn', mist: 0.28, dust: 0.08, clouds: true },
  colorPipeline: colorPipeline('pass64.terminal.hdr.v1', 1.06),
  budgets: budgets({ maximumDrawCalls: 590, maximumTriangles: 1_500_000 }),
  reviewCameras: [
    camera('terminal-overview', [42, 29, 42], [0, 3, -10], 'overview', 1.06),
    camera('terminal-cabin-ceiling', [-4, 4.05, 2], [10, 4.45, 2], 'geometry', 1.06),
    camera('terminal-concourse-wall-closed', [-13, 1.9, -32], [-21, 1.9, -34], 'light-occlusion', 1.06),
    camera('terminal-boarding-open', [0, 5, -7], [0, 4.2, 1], 'portal', 1.06),
    camera('terminal-port-wing-authority', [11, 7.8, 23], [0, 2.82, 12], 'geometry', 1.06),
    camera('terminal-starboard-wing-authority', [11, 7.8, -19], [0, 2.82, -8], 'geometry', 1.06),
  ],
  collisionIdentity: { authoritativeArenaId: 'skyline-terminal', evidence: 'ArenaMap skyline-terminal collider, portal and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['aircraft skin, windows and apron markings may remain presentation-only when authoritative hull surfaces remain unchanged'],
}, buildSkylineTerminal);
