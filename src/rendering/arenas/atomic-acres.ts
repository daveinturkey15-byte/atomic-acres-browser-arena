import { buildArena } from '../../map';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { ATOMIC_ACRES_GENERATED_SKY_ASSET_URL } from '../sky-backdrop';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

export const definition = createProceduralArenaVisualDefinition({
  id: 'atomic-acres',
  displayLabel: 'Nuke Town',
  moduleId: 'arena.visual.atomic-acres.v1',
  assetDependencies: [
    './assets/original/models/atomic-acres-blender-arena.glb?v=pass73-20260821-route-authority1',
    ATOMIC_ACRES_GENERATED_SKY_ASSET_URL,
  ],
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
    camera('nuke-town-overview', [30, 20, 34], [0, 2, 0], 'overview', 1.08),
    // REDESIGN 2026-08-29: the flow rotated end-to-end (docs/
    // NUKETOWN_REDESIGN_2026-08-29.md). Two cams pin the new axis: the full
    // plan view, and the defender's read down the street from the west
    // spawn-fence trail mouth toward the east gardens.
    camera('nuke-town-plan', [0, 62, 0.01], [0, 0, 0], 'overview', 1.08),
    camera('nuke-town-street-axis', [-27, 1.7, 0], [34, 1.5, 0], 'overview', 1.08),
    camera('nuke-town-aqua-upper-roof', [-10, 6, -20.4], [4, 5, -17.4], 'geometry', 1.08),
    // Keep the occluded wall and open portal probes at one legal room position.
    // The retired wall probe sat inside a narrow wall cavity and measured two
    // sunlit backfaces, making its HDR result depend on geometry overlap rather
    // than whether light was actually retained through the doorway.
    camera('nuke-town-aqua-wall-closed', [4, 2.2, -12.4], [-1, 2.2, -17.4], 'light-occlusion', 1.08),
    camera('nuke-town-aqua-door-open', [4, 2.2, -12.4], [6, 2.2, -17.4], 'portal', 1.08),
  ],
  collisionIdentity: { authoritativeArenaId: 'atomic-acres', evidence: 'ArenaMap atomic-acres collider and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['grass, decals, particles and overhead dressing remain presentation-only'],
}, buildArena);
