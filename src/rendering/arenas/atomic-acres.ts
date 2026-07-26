import { buildArena } from '../../map';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

export const definition = createProceduralArenaVisualDefinition({
  id: 'atomic-acres',
  displayLabel: 'Nuke Town',
  moduleId: 'arena.visual.atomic-acres.v1',
  assetDependencies: ['./assets/original/models/atomic-acres-blender-arena.glb?v=pass63-20260724-apertures1'],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xfff1ce, sunIntensity: 3.2, ambientColor: 0x8fb0bf, ambientIntensity: 0.42,
    practicals: [
      { id: 'house-fixtures', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'exterior-contrast-keys', policy: 'shadowed-local', maximumDistance: 32, castsShadow: true },
    ],
  },
  fog: { color: 0xb1c0be, near: 58, far: 148 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 176, normalBias: 0.035 },
  atmosphere: { preset: 'sunset-farmland', mist: 0.42, dust: 0.28, clouds: true },
  colorPipeline: colorPipeline('pass64.nuke-town.hdr.v1', 1.08),
  budgets: budgets({ maximumDrawCalls: 560, maximumTriangles: 1_600_000 }),
  reviewCameras: [
    camera('nuke-town-overview', [42, 28, 48], [0, 2, 0], 'overview', 1.08),
    camera('nuke-town-aqua-upper-roof', [-23, 6, -31], [-9, 5, -28], 'geometry', 1.08),
    // Keep the occluded wall and open portal probes at one legal room position.
    // The retired wall probe sat inside a narrow wall cavity and measured two
    // sunlit backfaces, making its HDR result depend on geometry overlap rather
    // than whether light was actually retained through the doorway.
    camera('nuke-town-aqua-wall-closed', [-9, 2.2, -23], [-14, 2.2, -28], 'light-occlusion', 1.08),
    camera('nuke-town-aqua-door-open', [-9, 2.2, -23], [-9, 2.2, -28], 'portal', 1.08),
  ],
  collisionIdentity: { authoritativeArenaId: 'atomic-acres', evidence: 'ArenaMap atomic-acres collider and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['grass, decals, particles and overhead dressing remain presentation-only'],
}, buildArena);
