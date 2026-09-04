import { buildNuketown2 } from '../../nuketown2-arena';
import {
  NUKETOWN2_REVIEW_CAMERA_ANCHORS,
  nuketown2HandedX as hx,
} from '../../nuketown2-layout';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * NUKETOWN2: Nuke Town Rebuild (PREVIEW), HF-407, re-pointed at the corrected
 * layout under HF-426. See `src/nuketown2-arena.ts` for the layout and
 * `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md` for the reference proportions
 * it is measured against (it replaces `docs/NUKETOWN_REBUILD_2026-09-02.md`,
 * whose proportions the owner rejected).
 *
 * HF-426 JOB 3 RE-LIT THIS ARENA, 2026-09-03. Owner: "then layer in all the
 * visual styles we had aimed for and approved in our older layout". The
 * approved look is the SHIPPED Nuke Town's, so the rig below now takes the
 * shipped map's key, fill, fog and time of day rather than deliberately
 * opposing them.
 *
 * WHAT THE PREVIOUS RIG WAS FOR, AND WHY IT GOES. Job 2 authored a hard,
 * colourless noon here ON PURPOSE, so the owner could judge the LAYOUT change
 * without the lighting confusing him about which map he was in. The layout is
 * judged and accepted; the brief is now the opposite one - the same place, the
 * same evening - so the separation moves off the LIGHT and onto the GRADE,
 * which is the layer that exists for it and the only layer the distinctiveness
 * metric actually measures.
 *
 * 1. KEY AND FILL ARE THE SHIPPED MAP'S, VERBATIM. sun 0xfff1ce at 3.2,
 *    ambient 0x8fb0bf at 0.42. Warm low key against a cool sky fill is the
 *    whole of the approved read, and the shipped map has real interiors too,
 *    so its 0.42 is already the value that survives two houses and a garage.
 * 2. FOG IS THE SHIPPED MAP'S CURVE, NOT A NEW ONE. 0xb1c0be, near 58,
 *    far 148. The previous rig started the fog at 95 m so nothing a player
 *    could shoot was ever hazed; the approved look does NOT do that - the
 *    shipped map's own longest in-bounds sightline is 89 m against a fog that
 *    starts at 58, so aerial perspective inside the playspace is part of what
 *    was approved. This map's diagonal is 91.4 m, so the same near/far give
 *    the same haze per metre on the same kind of sightline: at the far end of
 *    the longest run in the map the factor is 0.37, exactly where the shipped
 *    map's own longest run sits.
 * 3. SKY: 'estate-golden-hour', a LOW WARM SUN, and procedural. The shipped
 *    map's own 'sunset-farmland' is the closest preset of all, and it is the
 *    one preset this arena may not have: `skyBackdropAssetForPreset` resolves
 *    it to `atomic-acres-sunset.webp`, and this arena declares
 *    `assetDependencies: []` and imports no asset of any kind (see the header
 *    of src/nuketown2-arena.ts). 'estate-golden-hour' is fully authored in
 *    sky-backdrop.ts - warm horizon, violet valley, a real cloud deck - and
 *    resolves to no asset at all. Mist 0.42 / dust 0.28 / clouds true are the
 *    shipped map's own atmosphere numbers, unchanged.
 * 4. EXPOSURE 1.08, the shipped map's. A low sun needs the stop that the
 *    approved map takes; the seven review cameras take the same 1.08 so a
 *    capture is what the player sees.
 * 5. SHADOWS ARE NOT TOUCHED, because they are DERIVED rather than felt.
 *    graphics-refinement.ts fits this arena a 44 x 92 m shadow volume; at
 *    mapSize 2048 the longer side is 45 mm per texel, and upstream's
 *    normal-offset form texelWorld * (0.55 + 1.1 * (1 - NdL)) gives 0.044.
 *    The shipped map's 0.035 belongs to the shipped map's volume, and copying
 *    it here would be weakening a derived number to match a photograph.
 *
 * THE PLACE IDENTITY IS THE GRADE, AND IT DID NOT MOVE. `ARENA_ART_DIRECTIONS
 * .nuketown2` is the layer the distinctiveness gate measures, and it measures
 * ONLY the grade chain - `gradeThroughArena` never reads a light, a fog or a
 * sky. Its CDL was searched against that metric rather than felt, and it is
 * left EXACTLY as searched, so the weakest pair against atomic-acres stays at
 * the measured 0.02446 over the 0.02157 floor even though the two maps now
 * stand under the same evening. Warm gain with a gamma ramp that opens red and
 * closes blue is, if anything, more at home over a low sun than over the noon
 * it was searched under: the highlights go amber and the shade goes violet.
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
    sunColor: 0xfff1ce, sunIntensity: 3.2,
    ambientColor: 0x8fb0bf, ambientIntensity: 0.42,
    practicals: [
      { id: 'nuketown2-street-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
    ],
  },
  fog: { color: 0xb1c0be, near: 58, far: 148 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 150, normalBias: 0.044 },
  atmosphere: { preset: 'estate-golden-hour', mist: 0.42, dust: 0.28, clouds: true },
  colorPipeline: colorPipeline('pass85.nuketown2.hdr.v1', 1.08),
  budgets: budgets({ maximumDrawCalls: 420, maximumTriangles: 650_000 }),
  reviewCameras: [
    // The flow frame. High over the north-west quarter so the whole 36 x 84
    // rectangle is in shot: two houses either side of the turning head, a
    // garage at opposite ends of each, and both back yards running away to the
    // fences. This is the frame the layout rejig is judged on, and the one that
    // sits beside the reference overhead.
    //
    // MOVED IN under Job 3, [-30, 46, -52] -> [-15, 46, -30]. The old
    // station stood at 60 m radial, which is INSIDE the forest ring this pass
    // plants (44.5..70 m), so the first Job 3 capture reviewed the map through
    // a screen of conifers - half the frame was tree. 33.5 m radial is inside
    // the ring's inner edge, so the trees are behind the fence where a player
    // sees them. It reads through ~98 m of air to the far corner and therefore
    // through real aerial perspective; that is the approved fog curve doing
    // its job on a station no player ever stands on, not haze on a sightline.
    camera('nuketown2-overhead', [hx(-15), 46, -30], [hx(0), 2, 6], 'overview', 1.08),
    // Team 0's spawn yard, stood ON an actual spawn point (authored (-12, -31),
    // the fifth of team 0's eight) and looking at the back of its own house:
    // porch step, back door, yard cover and the fence behind.
    //
    // HF-473 RE-AIMED. Every x here is the AUTHORED x put through the
    // handedness mirror, so a flip of NUKETOWN2_HANDEDNESS moves the review
    // stations with the map instead of leaving them looking at the wrong half.
    // The aim point is the house's own centre line rather than an eyeballed
    // offset, because this frame is now the evidence for "the garage is on the
    // RIGHT of the house from behind it": with the camera on the spawn and the
    // house centre dead ahead, the garage wing has to appear on the right of
    // frame, and if it does not, HF-473 is not fixed.
    //
    // PASS 94 integration RE-SEATED it. The station's whole claim is that it
    // stands on a spawn, and the spawn table was re-solved when this lane's
    // fenced-yard band met the spawn lane's eight-point floor - the old
    // (-10, -29) is not a spawn any more. (-12, -31) is the nearest point in
    // the new table, 2.8 m away, so the frame is the same frame.
    camera('nuketown2-north-yard', [hx(-12), 1.75, -31], [hx(-1.25), 1.5, -21.5], 'geometry', 1.08),
    // Team 1's yard, the exact 180-degree partner. If these two frames are not
    // rotations of each other, the arena's rotational symmetry is broken and
    // one team has something the other does not.
    // INTEGRATION (candidate 4b): back to (12, 31). This station's whole
    // evidence value is that a player really starts a round there, and the
    // fidelity gate measures exactly that; (10, 29) is not in team 1's
    // authored spawn table, so the frame stopped being a spawn's-eye view.
    // The AIM is the accuracy lane's, unchanged.
    camera('nuketown2-south-yard', [hx(12), 1.75, 31], [hx(1.25), 1.5, 21.5], 'geometry', 1.08),
    // Along the street centre-line. HF-477 turned this into the LOLLIPOP frame
    // without moving it: the camera stands at the closed end of the cul-de-sac
    // and looks straight down the stem, so the bulb's kerb ring, the coach and
    // truck standing in it, and the green classic parked out in the stem are
    // all in one shot. The street-centre run the fidelity gate measures
    // numerically is this line, and the body that now closes it is the classic.
    // HF-477 moved the EYE, not the aim. At authored x = -15 the station stood
    // 1.1 m from the truck's rear doors, because the truck moved into the bulb
    // and the bulb moved to this end - the frame was the inside of a box van.
    // Backed onto the verge behind the bulb's closed kerb and raised to
    // standing-on-the-verge height, it now frames the whole lollipop: kerb
    // ring, coach and truck standing in the head, and the green classic out in
    // the stem beyond them.
    camera('nuketown2-street-centre', [hx(-14.5), 3.4, -6.5], [hx(8.0), 1.0, 1.5], 'geometry', 1.08),
    // The reference's strongest position: the north upper front window at
    // (-1.25, 4.5, -12.6), looking across the turning head at the south house's
    // driveway. Interior looking out through a real opening, so it is also the
    // map's hardest light-occlusion frame.
    camera('nuketown2-north-upper-window', [hx(-1.25), 4.5, -12.6], [hx(4), 2.6, 10], 'light-occlusion', 1.08),
    // Its rotational partner, from the south upper room.
    camera('nuketown2-south-upper-window', [hx(1.25), 4.5, 12.6], [hx(-4), 2.6, -10], 'geometry', 1.08),
    // Into-sun probe. Bears (-0.853, +0.522) - the key's own XZ bearing - from
    // the east verge, so the sun disc, the backlit coach roof rim and the long
    // shadows running toward the viewer are all in one frame. Nothing above
    // reviews any of them.
    // NOT mirrored, deliberately: this station exists to bear (-0.853, +0.522),
    // the key light's own XZ bearing, and the key does not move with the map's
    // handedness. Under the 180-degree symmetry both verges are the same place
    // to stand, so the frame keeps its subject (HF-473).
    camera('nuketown2-into-sun-street', [14, 1.85, -9], [-11.6, 4.2, 6.7], 'light-occlusion', 1.08),
    // Fixed judgeset interior stations (HF-440 Lane BA):
    camera('nuketown2-north-interior', [hx(-1.25), 1.7, -19.5], [hx(-1.25), 1.6, -12.0], 'geometry', 1.08),
    camera('nuketown2-south-interior', [hx(1.25), 1.7, 19.5], [hx(1.25), 1.6, 12.0], 'geometry', 1.08),
    camera('nuketown2-garage', [hx(6.75), 1.7, -20.5], [hx(6.75), 1.5, -14.0], 'geometry', 1.08),
    // HF-473: the rear balcony, its exterior flight and the upper back door,
    // from the yard at the flight's foot.
    // HF-465: the rear balcony, exterior flight and upper back door. These
    // poses are derived from the shared layout; hx() applies handedness once.
    camera('nuketown2-north-balcony', [
      hx(NUKETOWN2_REVIEW_CAMERA_ANCHORS.northBalcony.position[0]),
      NUKETOWN2_REVIEW_CAMERA_ANCHORS.northBalcony.position[1],
      NUKETOWN2_REVIEW_CAMERA_ANCHORS.northBalcony.position[2],
    ], [
      hx(NUKETOWN2_REVIEW_CAMERA_ANCHORS.northBalcony.target[0]),
      NUKETOWN2_REVIEW_CAMERA_ANCHORS.northBalcony.target[1],
      NUKETOWN2_REVIEW_CAMERA_ANCHORS.northBalcony.target[2],
    ], 'geometry', 1.08),
    // ...and the front climb chain: hedge, porch canopy, window ledge, upper
    // front window, in one frame off the verge.
    // Stood back on the carriageway rather than on the verge: from the verge
    // the hedge - the chain's first rung - sat 40 degrees off aim and out of
    // a 60 degree frame, which
    // scripts/qa/nuketown2-handedness-frame.mts measures rather than eyeballs.
    camera('nuketown2-front-porch', [
      hx(NUKETOWN2_REVIEW_CAMERA_ANCHORS.frontPorch.position[0]),
      NUKETOWN2_REVIEW_CAMERA_ANCHORS.frontPorch.position[1],
      NUKETOWN2_REVIEW_CAMERA_ANCHORS.frontPorch.position[2],
    ], [
      hx(NUKETOWN2_REVIEW_CAMERA_ANCHORS.frontPorch.target[0]),
      NUKETOWN2_REVIEW_CAMERA_ANCHORS.frontPorch.target[1],
      NUKETOWN2_REVIEW_CAMERA_ANCHORS.frontPorch.target[2],
    ], 'geometry', 1.08),
    // PASS 94 integration: the five vehicle stations below were authored on the
    // UNMIRRORED map, before HF-473. Every body they frame is placed through
    // `centred`/`streetVehicle`, which mirror x, so each eye and target x is
    // wrapped in `hx()` - otherwise the review set points at the empty half of
    // its own street.
    // VEHICLE REVIEW SET (HF-462 / HF-472, the lofted street bodies).
    //
    // Three distances, because a vehicle fails differently at each: a faceted
    // arch or a swirling wheel face only shows up close, wrong proportions
    // only show at a distance, and a silhouette that reads as a crate shows
    // from across the map. Every station is a place a PLAYER CAN STAND and was
    // checked clear of every collider before it was written down.
    //
    // ~4 m, front three-quarter of the head car: the arch cut, the shut lines,
    // the wheel cover's concavity and the glass over its lining, at the range
    // a player actually walks past a parked car.
    camera('nuketown2-vehicle-near', [hx(9.0), 1.55, -3.6], [hx(5.4), 1.0, -1.0], 'geometry', 1.08),
    // ~8 m across the turning head: the coach's nose and waistline with the
    // head car behind it, so the two bodies are judged against each other.
    camera('nuketown2-vehicle-mid', [hx(1.2), 1.7, -6.4], [hx(-5.4), 1.5, -2.65], 'geometry', 1.08),
    // ~16 m from the west end: coach, truck and head car in one frame. If any
    // of them reads as a box from here, the loft bought nothing.
    camera('nuketown2-vehicle-far', [hx(-16.0), 2.2, -6.0], [hx(2.0), 1.6, 0.6], 'geometry', 1.08),
    // TRUE SIDE ELEVATION of the coach at 12 m, square to its flank. This is
    // the frame proportions are measured on IN PIXELS - front overhang,
    // wheelbase, glass band height - because a three-quarter view cannot be
    // measured and an opinion about proportion is not evidence.
    camera('nuketown2-coach-elevation', [hx(-6.4), 1.6, 9.4], [hx(-6.4), 1.5, -2.65], 'geometry', 1.08),
    // The truck cab's front three-quarter at ~4 m: the cab-over rake, its
    // screen cut from the loft, and the steel wheels under the cargo box.
    camera('nuketown2-truck-cab-near', [hx(12.0), 1.6, 0.4], [hx(7.6), 1.5, 2.4], 'geometry', 1.08),
    // PASS 94 TECHNIQUES close-range evidence. These cameras are deliberately
    // authored against the prop/decal coordinates, not added to the gameplay
    // camera path: each makes one small visual claim legible in a capture.
    // The appliance pair is captured on both halves because its colour is the
    // chirality anchor; the remaining solid props are exact rotational pairs.
    camera('nuketown2-appliance-bank-north-close', [hx(-13.5), 1.55, -6.1], [hx(-10.4), 0.55, -8.4], 'geometry', 1.08),
    camera('nuketown2-appliance-bank-south-close', [hx(13.5), 1.55, 6.1], [hx(10.4), 0.55, 8.4], 'geometry', 1.08),
    camera('nuketown2-glasshouse-north-close', [hx(-5.4), 1.4, -29.1], [hx(-2.0), 1.1, -33.2], 'geometry', 1.08),
    camera('nuketown2-garden-pod-north-close', [hx(12.0), 1.35, -29.4], [hx(8.6), 1.0, -33.6], 'geometry', 1.08),
    camera('nuketown2-sand-pit-north-close', [hx(17.3), 1.2, -22.5], [hx(14.2), 0.20, -25.6], 'geometry', 1.08),
    camera('nuketown2-driveway-apron-close', [hx(10.8), 1.45, -10.7], [hx(6.75), 0.026, -12.1], 'geometry', 1.08),
    camera('nuketown2-border-path-close', [4.5, 1.35, -37.6], [0, 0.026, -39.0], 'geometry', 1.08),
    camera('nuketown2-perimeter-wall-long-close', [4.2, 1.45, -40.55], [0, 1.0, -41.588], 'geometry', 1.08),
    camera('nuketown2-perimeter-wall-end-close', [hx(-16.5), 1.45, -30.5], [hx(-17.588), 1.0, -29.0], 'geometry', 1.08),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'nuketown2',
    evidence: 'ArenaMap nuketown2 collider, spawn and shot-surface identity from buildNuketown2',
    presentationMayMutateAuthority: false,
  },
  exceptions: [],
}, buildNuketown2);
