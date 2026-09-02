import { buildMap3 } from '../../map3-arena';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * MAP3: Map 3 — the Corridor Gallery (PREVIEW). See `src/map3-arena.ts` for
 * what this arena is and, more importantly, what it deliberately is not.
 *
 * LIGHTING. The gallery is a stone map whose whole read is VALUE: paving,
 * piers, and the shadows the pier lines throw across eight radial lanes. That
 * makes it the one arena where the key:fill ratio matters more than hue, so
 * the rig is deliberately plain and hard.
 *
 * 1. KEY. `blender-lighting.ts`' shared non-Atomic sun position
 *    [-62, 25, 38] is 18.4 degrees of elevation, which is exactly what this
 *    map wants: a low sun rakes ACROSS the eight spokes instead of down them,
 *    so four bays are lit down their length and four are lit across, and a
 *    player crossing the hub reads which is which. Intensity 3.0 against
 *    Test1's 3.2 because there is no dust here to carry the extra.
 * 2. FILL, NOT AMBIENT-AS-EXPOSURE. `scene.environment` measures NULL on every
 *    arena on this route (the measurement is written up in test1.ts), so the
 *    flat ambient term is the ONLY fill these maps have, and cutting it is
 *    just taking stops off the shadows. 0.44 is a touch above Test1's 0.42
 *    because this map's shadowed pixels are inside a 4.2 m pier canyon rather
 *    than beside a 3 m fence, and its colour is the cool sky against the warm
 *    key — the warm-light/blue-shadow separation, authored rather than
 *    computed.
 * 3. FOG STARTS PAST THE MAP. MAP3_BOUNDS is 168 x 168 m, diagonal 237 m. A
 *    near plane inside that hazes the far bays, and the far bays are the whole
 *    vista. near 120 m is past the longest in-bounds sightline a player can
 *    stand on (hub centre to a bay end wall is 78 m; corner to corner across
 *    the scrub is 237 m and there is nothing out there to see), so haze is
 *    aerial perspective on the backdrop only.
 * 4. SHADOW BIAS DERIVED. graphics-refinement.ts fits this arena a 176 x 176 m
 *    shadow volume; at mapSize 2048 that is 86 mm per texel. Upstream's
 *    normal-offset form texelWorld * (0.55 + 1.1 * (1 - NdL)) at a midmorning
 *    NdL of ~0.6 gives 0.085, so that is the authored value — three times
 *    Test1's because this arena is three times its span, not because anything
 *    was eyeballed.
 *
 * SKY. 'range-midmorning' is reused rather than authored fresh. It is the only
 * shipped preset whose brief is a hard clear sky with a dust horizon, which is
 * what a stone gallery on open scrub sits under; the arena's PLACE identity is
 * carried by `ARENA_ART_DIRECTIONS.map3` (cool stone, no golden cast), which is
 * the layer that exists for exactly that purpose. If Map 3 graduates out of
 * PREVIEW it should get its own preset.
 */
export const definition = createProceduralArenaVisualDefinition({
  id: 'map3',
  displayLabel: 'Map 3',
  moduleId: 'arena.visual.map3.v1',
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xfff4de, sunIntensity: 3.0,
    ambientColor: 0xa6c2e4, ambientIntensity: 0.44,
    practicals: [
      { id: 'map3-gallery-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
    ],
  },
  fog: { color: 0xc6d0d6, near: 120, far: 260 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 150, normalBias: 0.085 },
  atmosphere: { preset: 'range-midmorning', mist: 0.04, dust: 0.14, clouds: false },
  colorPipeline: colorPipeline('pass84.map3.hdr.v1', 1.02),
  budgets: budgets({ maximumDrawCalls: 400, maximumTriangles: 700_000 }),
  reviewCameras: [
    // Hub vista: the one shot that has to work, because it is what the player
    // sees on spawn and it is the frame the owner judged the showcase on.
    camera('map3-hub-vista', [0, 2.6, 6], [0, 1.6, -30], 'overview', 1.02),
    // Down a bay, from its mouth: pier rhythm, gap cadence, end wall.
    camera('map3-bay-nature', [0, 1.7, -20], [0, 1.5, -66], 'geometry', 1.02),
    // The volume bay's slit wall and roof slab — the map's one dark interior,
    // and therefore the only place a light-occlusion failure would show.
    camera('map3-volume-hall', [30.5, 1.7, -30.5], [46, 1.6, -46], 'light-occlusion', 1.02),
    // Into-sun probe. The three cameras above all look across or away from the
    // key, so nothing above reviews the sun disc, backlit pier rims or the long
    // shadows running toward the viewer. Bears (-0.853, +0.522) — the key's own
    // XZ bearing — from the hub kerb out over the maths bay.
    camera('map3-into-sun-hub', [8.5, 1.85, -6.0], [-25.6, 4.2, 14.9], 'light-occlusion', 1.02),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'map3',
    evidence: 'ArenaMap map3 collider, spawn and shot-surface identity from buildMap3',
    presentationMayMutateAuthority: false,
  },
  exceptions: [],
}, buildMap3);
