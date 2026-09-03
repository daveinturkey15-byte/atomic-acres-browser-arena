import { buildFarcrysis } from '../../farcrysis';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { ATOMIC_ACRES_GENERATED_SKY_ASSET_URL } from '../sky-backdrop';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

export const definition = createProceduralArenaVisualDefinition({
  id: 'farcrysis',
  displayLabel: 'Farcrysis',
  moduleId: 'arena.visual.farcrysis.v1',
  assetDependencies: [ATOMIC_ACRES_GENERATED_SKY_ASSET_URL],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    // Pass 76 regrade: the engine lights STACK on the arena's own light rig
    // (farcrysis-art buildInlineLighting), and together the old warm-orange
    // values washed the whole island beige. Daylight brief: warm-white sun,
    // pale sky-blue ambient, lower totals so the greens keep saturation.
    sunColor: 0xffeed2, sunIntensity: 2.4, ambientColor: 0xb8d4de, ambientIntensity: 0.3,
    practicals: [
      { id: 'farcrysis-beach-golden-hour', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'farcrysis-core-work-lights', policy: 'shadowed-local', maximumDistance: 22, castsShadow: true },
      { id: 'farcrysis-jungle-dapple', policy: 'shadowed-local', maximumDistance: 18, castsShadow: true },
    ],
  },
  // Fog has to agree with the sky. Pass 76: the previous beige band
  // (0xe8cba4, 46-138) tinted every distant palm, island and wave the same
  // sand colour — the audit's "beige golden-hour wash" P0 — and fogged the
  // vista islands into salmon cones. Retinted to a pale marine aqua drawn
  // from the jungle-golden-hour sky's mid stops (#4d8f92→#96b585) and pushed
  // out so the playfield keeps its saturation and only the true distance
  // hazes off. Mist halved for the same reason.
  // Fog agrees with the daylight sky above it: a faint blue-green marine haze,
  // not the sage band that read as the same beige wash as the old dusk sky.
  fog: { color: 0xa8cfe0, near: 78, far: 200 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 200, normalBias: 0.03 },
  atmosphere: { preset: 'jungle-golden-hour', mist: 0.12, dust: 0.05, clouds: true },
  colorPipeline: colorPipeline('pass69.farcrysis.hdr.v1', 1.08),
  budgets: budgets({ maximumDrawCalls: 460, maximumTriangles: 1_100_000 }),
  // HF-396: cameras track the rescaled landmarks — spawn-side beach (doubled
  // corner), jungle mid-ring, core interior, and the seaplane throwback now
  // at (48, -48). maximumDistance for shadows raised to cover the island.
  reviewCameras: [
    camera('farcrysis-beach-golden', [-54, 3.2, -54], [0, 1.2, 0], 'overview', 1.08),
    camera('farcrysis-jungle-dapple', [-20, 1.9, -24], [0, 1.7, 0], 'light-occlusion', 1.08),
    // HF-423: this camera sat at [0, 2.6, 0] - INSIDE farcrysis-core-catwalk,
    // whose slab spans x -3.5..3.5, z -1.2..1.2 at y 2.41..2.59. MEASURED by
    // casting the frame's own rays through the built arena: the nearest opaque
    // surface was 0.01 m away and the catwalk filled 64.3 % of the frame, so
    // the arena's only 'geometry' review camera was reviewing a plank pressed
    // against the lens. Moved to the west wall at eye height looking across to
    // the stair run: nearest surface 1.24 m, 32 distinct surfaces (was 23),
    // and the frame is catwalk 24 % / terrain 20 % / desk 9 % / east wall 6 %
    // - the interior it is named for.
    camera('farcrysis-core-interior', [-4.3, 1.65, 0], [3.4, 1.9, 2.4], 'geometry', 1.08),
    camera('farcrysis-seaplane-throwback', [48, 2.4, -48], [40, 1.2, -40], 'overview', 1.08),
    // Shore-band audit cameras (HF-395/396 round 4): the top-down frame proves
    // every vegetation band hugs the square shoreline instead of a legacy
    // circular radius, and the west-shoreline frame proves it at eye level
    // where beach grass meets the actual waterline.
    camera('farcrysis-island-topdown', [0, 95, 2], [0, 0, 0], 'overview', 1.08),
    camera('farcrysis-west-shoreline', [-62, 5, -6], [-50, 1.2, 12], 'overview', 1.08),
  ],
  collisionIdentity: { authoritativeArenaId: 'farcrysis', evidence: 'ArenaMap farcrysis collider, cover and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['beach/jungle foliage may remain presentation-only while authoritative cover and shot surfaces remain unchanged'],
}, buildFarcrysis);
