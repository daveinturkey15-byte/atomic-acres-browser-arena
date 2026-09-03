import { buildNuketown2 } from '../../nuketown2-arena';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * NUKETOWN2: Nuke Town Rebuild (PREVIEW), HF-407, re-pointed at the corrected
 * layout under HF-426. See `src/nuketown2-arena.ts` for the layout and
 * `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md` for the reference proportions
 * it is measured against (it replaces `docs/NUKETOWN_REBUILD_2026-09-02.md`,
 * whose proportions the owner rejected).
 *
 * WHAT THIS PASS CHANGED HERE, AND WHAT IT DID NOT. HF-426's layout job
 * re-proportioned the arena from 58 x 52 m to 36 x 84 m, so every number in
 * this file that was DERIVED FROM THE FOOTPRINT is re-derived below: the seven
 * review-camera stations, the fog near plane and the shadow normal bias. The
 * LOOK - key, fill, sky preset, colour pipeline, art-direction row - is
 * deliberately untouched, because porting the shipped Nuke Town's approved
 * style onto this layout is HF-426 Job 3 and it has not run yet.
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
 *    elevation. On the corrected footprint it rakes mostly ACROSS the street
 *    and along the map's own long lot-to-lot axis, so each house throws its
 *    shadow down its own yard and the truck in the turning head casts over both
 *    kerbs. Intensity 3.1, a touch above Map 3's 3.0 and below Test1's 3.2:
 *    there is less dust here than the range and more surface than the gallery.
 * 2. FILL. `scene.environment` measures NULL on every arena on this route (the
 *    measurement is written up in test1.ts), so the flat ambient term is the
 *    only fill these maps get. 0.40 is the lowest of the three midday arenas
 *    because this is the only one with real INTERIORS - two houses, two garages
 *    and an enterable truck box - and lifting the fill to flatter the exteriors
 *    is what turns those interiors into grey boxes. The colour is the cool sky
 *    against the warm key: warm-light/blue-shadow separation, authored.
 * 3. FOG STARTS PAST THE MAP. The playable rectangle is 36 x 84 m, so the
 *    longest in-bounds sightline a player can stand on is the 91.4 m diagonal.
 *    near 95 m is past it: nothing a player can shoot is ever hazed, and the
 *    fog is aerial perspective on the backdrop alone. (It was 82 m against the
 *    old 78 m diagonal; the rule is unchanged, the diagonal moved.)
 * 4. SHADOW BIAS DERIVED, NOT EYEBALLED. graphics-refinement.ts now fits this
 *    arena a 44 x 92 m shadow volume; at mapSize 2048 the longer side is 45 mm
 *    per texel. Upstream's normal-offset form texelWorld * (0.55 + 1.1 *
 *    (1 - NdL)) at a midmorning NdL of ~0.6 gives 0.044. Same rule as before,
 *    same rule as Test1's; only the volume changed.
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
 * through the turning head, both upper front windows (the reference's power
 * position, so the frame that proves the window is a real opening and not a
 * painted one), and an into-sun probe, because the six cameras above all look
 * across or away from the key and none of them would ever review a backlit rim
 * or the sun disc. EVERY STATION MOVED under HF-426: the old ones were authored
 * against the 58 x 52 footprint, and both yard cameras (at |z| = 20.5) would
 * now stand INSIDE a house.
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
  fog: { color: 0xcdd6dd, near: 95, far: 190 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 150, normalBias: 0.044 },
  atmosphere: { preset: 'range-midmorning', mist: 0.05, dust: 0.16, clouds: false },
  colorPipeline: colorPipeline('pass85.nuketown2.hdr.v1', 1.03),
  budgets: budgets({ maximumDrawCalls: 420, maximumTriangles: 650_000 }),
  reviewCameras: [
    // The flow frame. High and back over the north-west corner so the whole
    // 36 x 84 rectangle is in shot: two houses either side of the turning head,
    // a garage at opposite ends of each, and both back yards running away to
    // the fences. This is the frame the layout rejig is actually judged on, and
    // it is the one that has to sit beside the reference overhead.
    camera('nuketown2-overhead', [-30, 46, -52], [0, 2, 0], 'overview', 1.03),
    // Team 0's spawn yard, stood where a player actually spawns (-12, -30),
    // looking at the back of their own house: porch step, back door, yard cover
    // and the fence behind.
    camera('nuketown2-north-yard', [-12, 1.75, -30], [-2, 1.5, -22], 'geometry', 1.03),
    // Team 1's yard, the exact 180-degree partner. If these two frames are not
    // rotations of each other, the arena's rotational symmetry is broken and
    // one team has something the other does not.
    camera('nuketown2-south-yard', [12, 1.75, 30], [2, 1.5, 22], 'geometry', 1.03),
    // Along the street centre-line, from the west end of the road into the
    // truck's open cargo box. The bulkhead at x = +3.17 should close the far
    // half of this frame; that is the property the fidelity test measures
    // numerically as the street-centre run, and this is what it looks like.
    camera('nuketown2-street-centre', [-15, 1.7, 0], [17, 1.6, 0.4], 'geometry', 1.03),
    // The reference's strongest position: the north upper front window at
    // (-1.25, 4.5, -12.6), looking across the turning head at the south house's
    // driveway. Interior looking out through a real opening, so it is also the
    // map's hardest light-occlusion frame.
    camera('nuketown2-north-upper-window', [-1.25, 4.5, -12.6], [4, 2.6, 10], 'light-occlusion', 1.03),
    // Its rotational partner, from the south upper room.
    camera('nuketown2-south-upper-window', [1.25, 4.5, 12.6], [-4, 2.6, -10], 'geometry', 1.03),
    // Into-sun probe. Bears (-0.853, +0.522) - the key's own XZ bearing - from
    // the east verge, so the sun disc, the backlit coach roof rim and the long
    // shadows running toward the viewer are all in one frame. Nothing above
    // reviews any of them.
    camera('nuketown2-into-sun-street', [14, 1.85, -9], [-11.6, 4.2, 6.7], 'light-occlusion', 1.03),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'nuketown2',
    evidence: 'ArenaMap nuketown2 collider, spawn and shot-surface identity from buildNuketown2',
    presentationMayMutateAuthority: false,
  },
  exceptions: [],
}, buildNuketown2);
