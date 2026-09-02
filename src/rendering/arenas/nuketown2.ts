import { buildNuketown2 } from '../../nuketown2-arena';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * NUKETOWN2: Nuke Town Rebuild (PREVIEW), HF-407. See `src/nuketown2-arena.ts`
 * for the layout and `docs/NUKETOWN_REBUILD_2026-09-02.md` for the reference
 * proportions it is measured against.
 *
 * THE JOB OF THIS RIG. The shipped Nuke Town sits directly above this one in
 * the menu, and the owner has to be able to judge the LAYOUT change without the
 * lighting confusing him about which map he is in. So this rig deliberately
 * does the opposite of `atomic-acres.ts`: that arena is a warm low sunset with
 * cloud and heavy mist; this one is a hard, high, colourless noon over a test
 * town with no weather in it. The two are the same place, and they must not
 * look like the same photograph.
 *
 * 1. KEY. The shared non-Atomic sun position [-62, 25, 38] is 18.4 degrees of
 *    elevation, which rakes ALONG the street rather than across it - the light
 *    runs down the one 58 m axis the whole map is organised on, so each house
 *    throws its shadow over the road toward the other, and the bus in the
 *    middle casts across both kerbs. Intensity 3.1, a touch above Map 3's 3.0
 *    and below Test1's 3.2: there is less dust here than the range and more
 *    surface than the gallery.
 * 2. FILL. `scene.environment` measures NULL on every arena on this route (the
 *    measurement is written up in test1.ts), so the flat ambient term is the
 *    only fill these maps get. 0.40 is the lowest of the three midday arenas
 *    because this is the only one with real INTERIORS - two houses, two garages
 *    and an enterable bus - and lifting the fill to flatter the exteriors is
 *    what turns those interiors into grey boxes. The colour is the cool sky
 *    against the warm key: warm-light/blue-shadow separation, authored.
 * 3. FOG STARTS PAST THE MAP. The playable rectangle is 58 x 52 m, so the
 *    longest in-bounds sightline a player can stand on is the 78 m diagonal.
 *    near 82 m is past it: nothing a player can shoot is ever hazed, and the
 *    fog is aerial perspective on the backdrop alone.
 * 4. SHADOW BIAS DERIVED, NOT EYEBALLED. graphics-refinement.ts fits this arena
 *    a 66 x 60 m shadow volume; at mapSize 2048 that is 32 mm per texel.
 *    Upstream's normal-offset form texelWorld * (0.55 + 1.1 * (1 - NdL)) at a
 *    midmorning NdL of ~0.6 gives 0.032. Test1 carries 0.033 for a 68 m volume,
 *    which is the same rule at the same scale, so the two agree by derivation
 *    rather than by copying.
 *
 * SKY. 'range-midmorning' is reused rather than authored fresh: it is the one
 * shipped preset whose brief is a hard clear sky with a dust horizon and no
 * cloud, which is exactly what a bleached test town stands under. The PLACE
 * identity is carried by `ARENA_ART_DIRECTIONS.nuketown2` - the brightest gain
 * in the catalog, maximum legal lift, and a gamma ramp that puts violet in the
 * shade - which is the layer that exists for exactly that purpose, and which
 * was searched against the distinctiveness metric rather than felt.
 *
 * REVIEW CAMERAS. Every frame the brief asks for, and one it does not: the
 * overhead that shows the whole flow, both spawn yards, the street centre-line
 * through the bus, both upper front windows (the reference's power position, so
 * the frame that proves the window is a real opening and not a painted one),
 * and an into-sun probe, because the six cameras above all look across or away
 * from the key and none of them would ever review a backlit rim or the sun
 * disc.
 */
export const definition = createProceduralArenaVisualDefinition({
  id: 'nuketown2',
  displayLabel: 'Nuke Town Rebuild',
  moduleId: 'arena.visual.nuketown2.v1',
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xfff6e2, sunIntensity: 3.1,
    ambientColor: 0xa8c4e6, ambientIntensity: 0.4,
    practicals: [
      { id: 'nuketown2-street-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
    ],
  },
  fog: { color: 0xcdd6dd, near: 82, far: 168 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 130, normalBias: 0.032 },
  atmosphere: { preset: 'range-midmorning', mist: 0.05, dust: 0.16, clouds: false },
  colorPipeline: colorPipeline('pass85.nuketown2.hdr.v1', 1.03),
  budgets: budgets({ maximumDrawCalls: 420, maximumTriangles: 650_000 }),
  reviewCameras: [
    // The flow frame. High and back over the west cul-de-sac so the whole
    // rectangle is in shot: two offset houses either side of the road, a garage
    // at each outboard end, the bus on the centre line, and both back yards.
    // This is the frame the layout rejig is actually judged on.
    camera('nuketown2-overhead', [-34, 30, -30], [2, 1.5, 2], 'overview', 1.03),
    // Team 0's spawn yard, stood where a player actually spawns, looking at the
    // back of their own house: porch step, back door, yard cover and the fence.
    camera('nuketown2-north-yard', [-14, 1.75, -20.5], [-1, 1.5, -13.5], 'geometry', 1.03),
    // Team 1's yard, the exact 180-degree partner. If these two frames are not
    // mirror images of each other, the arena's rotational symmetry is broken
    // and one team has something the other does not.
    camera('nuketown2-south-yard', [14, 1.75, 20.5], [1, 1.5, 13.5], 'geometry', 1.03),
    // Down the street centre-line. The bus should block the far half of this
    // frame; that is the whole reason it is there, and it is the property the
    // fidelity test measures numerically.
    //
    // x = -18, NOT the -24 this camera was first authored at. -24 is the west
    // cul-de-sac truck's own position, so the first capture of this frame was
    // taken from INSIDE the truck's cargo box and reviewed a brown slab. -18 is
    // inside the 15 m clear run the fidelity test measures (x -20.5 to -5.5),
    // which is exactly the stretch this camera is supposed to be looking along.
    camera('nuketown2-street-centre', [-18, 1.7, 0], [24, 1.6, 0.4], 'geometry', 1.03),
    // The reference's strongest position: the north upper front window,
    // looking diagonally across the road at the south house's driveway rather
    // than straight into its own reflection. Interior looking out through a
    // real opening, so it is also the map's hardest light-occlusion frame.
    camera('nuketown2-north-upper-window', [-4, 4.5, -5.6], [7, 2.6, 7], 'light-occlusion', 1.03),
    // Its rotational partner, from the south upper room.
    camera('nuketown2-south-upper-window', [4, 4.5, 5.6], [-7, 2.6, -7], 'geometry', 1.03),
    // Into-sun probe. Bears (-0.853, +0.522) - the key's own XZ bearing - from
    // the east end of the road, so the sun disc, the backlit bus roof rim and
    // the long shadows running toward the viewer are all in one frame. Nothing
    // above reviews any of them.
    camera('nuketown2-into-sun-street', [20, 1.85, -7.5], [-5.6, 4.2, 8.2], 'light-occlusion', 1.03),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'nuketown2',
    evidence: 'ArenaMap nuketown2 collider, spawn and shot-surface identity from buildNuketown2',
    presentationMayMutateAuthority: false,
  },
  exceptions: [],
}, buildNuketown2);
