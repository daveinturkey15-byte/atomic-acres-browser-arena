import { buildRaid2 } from '../../raid2-arena';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * RAID2 "Raid Rebuild" (owner 2026-09-02, HF-408): the visual half of the Raid
 * LAYOUT rethink. The geometry, the reference study it derives from and the
 * reason behind every gate band live in src/raid2-arena.ts and
 * docs/raid-rebuild/SPATIAL_PLAN.md; this file is the lighting rig, the colour
 * pipeline and the fixed judgeset the pass is reviewed through.
 *
 * WHAT THIS IS NOT. It is not the art pass. The owner's sentence had two halves
 * - "the layout AND artstyle" - and this lane owns the first. The materials are
 * a clean, readable, wholly procedural first pass whose job is to let a reviewer
 * see the PLAN: which rooms are rooms, where the lanes run, what is cover and
 * what is architecture. Anything that reads as finished art here is incidental.
 *
 * WHY THE TIME OF DAY MOVED, AND WHY THAT IS A LAYOUT DECISION.
 *
 * test2 is graded for deep golden hour. This arena is graded for high late
 * morning, and the two reasons are worth writing down because a reviewer will
 * otherwise read it as an art liberty taken in a layout lane:
 *
 *   1. A low sun is the worst possible light for reading a plan. At 18 degrees
 *      of elevation every mass on a 100 x 76 m map throws a shadow tens of
 *      metres long, and the thing this lane has to be judged on - is the ground
 *      open, or is it broken up - is exactly what those shadows hide. At 52
 *      degrees the shadows are short enough that the paving reads as paving.
 *   2. These two arenas sit next to each other in the menu. If they graded
 *      alike the owner could not tell which one he had loaded, which would
 *      defeat the entire point of shipping the rebuild BESIDE the shipped map
 *      rather than in place of it.
 *
 * The grade itself is in src/rendering/art-direction.ts under 'raid2'.
 *
 * THE RIG, AND WHAT IS ACTUALLY TRUE ON THIS ROUTE.
 *
 * 0. `scene.environment` measures NULL on the WebGPU quality route (2026-08-30,
 *    recorded in test1.ts and test2.ts and NOT re-measured by this lane - it is
 *    carried as a CLAIM, not a verified fact). Every consequence those files
 *    draw from it applies here unchanged: `arenaEnvironmentScale('raid2') =
 *    0.22` is inert, the preset's authored ground hemisphere lights nothing,
 *    and metalness is a pure subtraction. The numbers below are authored for
 *    the route as it runs, not for the route as it is documented.
 * 1. THE FLAT AMBIENT STAYS COOL, for the reason test2.ts sets out at length:
 *    lerping a warm bounce into the fill instead of normal-gating it makes
 *    shadows warmer than the sun casting them. The one flat term this file owns
 *    is held cool and the warmth is left to the key. It is COOLER than test2's
 *    0x8fb2d8 because a midday sky is a bluer fill than a golden-hour one.
 * 2. THE KEY IS RE-SPECTRALISED AT CONSTANT LUMINANCE, the same arithmetic
 *    test2.ts uses. test2's key is 0xffcf92 at 3.0, Rec.709 luminance 0.835 x
 *    3.0 = 2.505. A late-morning key is much less golden: 0xfff2dc measures
 *    0.955, so 2.62 reproduces 2.503 - the same luminous key with a neutral
 *    spectrum. This arena is not brighter than the shipped one; it is whiter.
 * 3. SHADOW BIAS DERIVED, NOT COPIED. graphics-refinement.ts fits raid2 the
 *    same 108 x 84 m volume it fits test2 (RAID2_BOUNDS is the same 100 x 76 m
 *    box), so 2048 gives the same 52.7 mm texel. Upstream's normal-offset bias
 *    is texelWorld * (0.55 + 1.1 * (1 - NdL)). The difference is the sun: this
 *    arena's key sits at 52 degrees, so NdL = sin(52) = 0.788 against test2's
 *    0.315, giving 0.0527 * (0.55 + 1.1 * 0.212) = 0.0413. Copying test2's
 *    0.069 through a sun 34 degrees higher would peel contact shadows off the
 *    paving, which on a map being judged for its FLOOR is the one artefact
 *    that would actively mislead the review.
 * 4. FOG IS PINNED BY THE DIAGONAL, exactly as test2's is. hypot(100, 76) =
 *    125.7 m, so near 128 keeps the whole playfield in front of the haze band
 *    and far follows at the same authored 88 m depth. The colour is the horizon
 *    band of a midday sky rather than test2's lilac golden-hour pair.
 *
 * THE JUDGESET. `reviewCameras` below IS the fixed judgeset from
 * docs/raid-rebuild/SPATIAL_PLAN.md section 5, in authored order, and every
 * capture in the lane report is taken through it so a reviewer compares like
 * with like. It is longer than the four-camera convention on purpose: this
 * arena's whole claim is about ten specific places, and a judgeset that could
 * not see the defining lane from both ends, or the power position's arc, could
 * not falsify the claim. The ids are mirrored into
 * scripts/qa/viewpoint-catalog.mjs, which derives its roster from this
 * directory and fails until they are there.
 */
export const definition = createProceduralArenaVisualDefinition({
  id: 'raid2',
  displayLabel: 'Raid Rebuild',
  moduleId: 'arena.visual.raid2.v1',
  // Nothing is downloaded for this arena. The sky is the procedural
  // 'range-midmorning' preset, which is also its (inert, see note 0) IBL source.
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    // Note 2: 0xfff2dc at 2.62 is test2's luminous key with a neutral spectrum.
    sunColor: 0xfff2dc, sunIntensity: 2.62,
    // Note 1: cooler than test2's 0x8fb2d8 because a midday sky is a bluer fill.
    //
    // RAISED 0.44 -> 0.60 and desaturated 0x86aede -> 0x93b6dd in the repair
    // pass. `scene.environment` is NULL on this route (note 0), so the flat
    // ambient is the ONLY thing lighting a face the sun does not reach; at 0.44
    // under a grade whose gain pulls green down, every shaded vertical on the
    // map fell to a silhouette. 0.60 is inside the shipped envelope, not past
    // it - rustworks-1v1 runs 0.72 and gun-range 0.64 - and the fill stays cool,
    // which is the argument this note exists to protect. It is not a
    // brightness dial for the arena: the key is untouched at 2.62, so only the
    // shadow side moves.
    ambientColor: 0x93b6dd, ambientIntensity: 0.6,
    practicals: [
      { id: 'raid2-estate-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
    ],
  },
  // Note 4. Same box as test2, so the same near/far pin; midday horizon colour
  // rather than test2's golden-hour lilac.
  fog: { color: 0xcdd8e2, near: 128, far: 216 },
  // maximumDistance 150 covers the 125.7 m diagonal with 24 m spare.
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 150, normalBias: 0.041 },
  // 'range-midmorning' is an EXISTING preset (test1, map3), reused rather than
  // authored: adding a preset means editing sky-backdrop.ts, which this lane
  // does not own. It is also the honest match for the grade - high sun, neutral
  // spectrum. Mist is low because the whole point of this arena is its long
  // lines and haze in the lane would flatter the metric this lane is judged on.
  atmosphere: { preset: 'range-midmorning', mist: 0.06, dust: 0.1, clouds: true },
  colorPipeline: colorPipeline('pass87.raid2.hdr.v1', 1.04),
  // The rebuild carries FEWER masses than the shipped Raid (34 eye-blocking
  // clusters against 59) but more open ground, so the draw budget is set at
  // test2's rather than below it: consolidation moved wall area into bigger
  // pieces, it did not delete it.
  budgets: budgets({ maximumDrawCalls: 420, maximumTriangles: 700_000 }),
  reviewCameras: [
    // 1. The whole plan from the south-east, high enough to read all three lanes,
    //    the open courtyard and the four upper rooms in one frame.
    camera('raid2-estate-overview', [46, 36, 52], [-2, 2, -6], 'overview', 1.04),
    // 2. Team 0's apron looking down the map. This is the frame that shows the
    //    west approach is an APRON and not the 10 m neck it was before the blob
    //    was extended north to z -20.
    camera('raid2-west-apron', [-45, 1.7, -4], [-18, 1.6, -4], 'geometry', 1.04),
    // 3. Team 1's garage looking back, bay piers on its own west face. The
    //    shipped map's garage was unreachable to a bot (HF-402); this frame is
    //    where a reviewer checks the kerb line is gapped and walkable.
    camera('raid2-garage-fan', [45, 1.7, -2], [18, 1.6, -2], 'geometry', 1.04),
    // 4. THE DEFINING LANE, from the sunken sport court at its west end: 52 m of
    //    unbroken line across the court, the pool basin and the deck, ending in
    //    the colonnade you can shoot through. If anything is ever added into
    //    this line, this is the camera that shows it.
    camera('raid2-defining-lane', [-33, 1.7, -28], [17, 1.6, -28], 'geometry', 1.04),
    // 5. The same lane from the other end, so the reverse angle is never the
    //    unfinished one.
    camera('raid2-pool-deck-return', [16, 1.7, -28], [-33, 1.6, -28], 'geometry', 1.04),
    // 6. The courtyard: four mouths, four piers, open to sky. The one place on
    //    the map with no roof, slab or upper room over it, which makes it the
    //    honest light-occlusion probe - the piers are the only thing between the
    //    key and the floor.
    camera('raid2-courtyard', [0.5, 1.7, -7], [0.5, 2.6, -19], 'light-occlusion', 1.04),
    // 7. The house spine from the living room: one building end to end, cut by
    //    architecture (the interleaved partition mouths) rather than by a wall
    //    parked in the middle of a room.
    camera('raid2-house-spine', [-24, 1.7, -12], [-9, 1.6, -12], 'geometry', 1.04),
    // 8. U1, the power position, looking west down the pool lane from +3.40 m.
    //    It must see the lane and must NOT see into the west apron; that is a
    //    layout claim and this is the frame that falsifies it.
    camera('raid2-upper-bedroom', [28, 5.1, -25], [-20, 3.6, -28], 'light-occlusion', 1.04),
    // 9. Balcony to balcony over the drive - U3 (team 0) watching U4 (team 1)
    //    across the island, each counterable from the other.
    camera('raid2-drive-balcony', [-18, 5.1, 7], [22, 4.5, 7], 'light-occlusion', 1.04),
    // 10. Into-sun from the drive approach: the circle, the island and both
    //     balconies share one frame, backlit, so rim light, shadows running
    //     toward the viewer and the cloud deck's lit tops are all judged at once.
    camera('raid2-drive-approach', [0, 1.9, 30], [0, 3.2, 8], 'light-occlusion', 1.04),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'raid2',
    evidence: 'ArenaMap raid2 collider, spawn and shot-surface identity from buildRaid2',
    presentationMayMutateAuthority: false,
  },
  exceptions: ['pool water sheet is presentation-only; the basin slab beneath it is the movement/shot authority'],
}, buildRaid2);
