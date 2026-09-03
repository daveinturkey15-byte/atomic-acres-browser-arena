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
    // The flow frame. High and back over the north-west corner so the whole
    // 36 x 84 rectangle is in shot: two houses either side of the turning head,
    // a garage at opposite ends of each, and both back yards running away to
    // the fences. This is the frame the layout rejig is actually judged on, and
    // it is the one that has to sit beside the reference overhead.
    camera('nuketown2-overhead', [-30, 46, -52], [0, 2, 0], 'overview', 1.08),
    // Team 0's spawn yard, stood where a player actually spawns (-12, -30),
    // looking at the back of their own house: porch step, back door, yard cover
    // and the fence behind.
    camera('nuketown2-north-yard', [-12, 1.75, -30], [-2, 1.5, -22], 'geometry', 1.08),
    // Team 1's yard, the exact 180-degree partner. If these two frames are not
    // rotations of each other, the arena's rotational symmetry is broken and
    // one team has something the other does not.
    camera('nuketown2-south-yard', [12, 1.75, 30], [2, 1.5, 22], 'geometry', 1.08),
    // Along the street centre-line, from the west end of the road into the
    // truck's open cargo box. The bulkhead at x = +3.17 should close the far
    // half of this frame; that is the property the fidelity test measures
    // numerically as the street-centre run, and this is what it looks like.
    camera('nuketown2-street-centre', [-15, 1.7, 0], [17, 1.6, 0.4], 'geometry', 1.08),
    // The reference's strongest position: the north upper front window at
    // (-1.25, 4.5, -12.6), looking across the turning head at the south house's
    // driveway. Interior looking out through a real opening, so it is also the
    // map's hardest light-occlusion frame.
    camera('nuketown2-north-upper-window', [-1.25, 4.5, -12.6], [4, 2.6, 10], 'light-occlusion', 1.08),
    // Its rotational partner, from the south upper room.
    camera('nuketown2-south-upper-window', [1.25, 4.5, 12.6], [-4, 2.6, -10], 'geometry', 1.08),
    // Into-sun probe. Bears (-0.853, +0.522) - the key's own XZ bearing - from
    // the east verge, so the sun disc, the backlit coach roof rim and the long
    // shadows running toward the viewer are all in one frame. Nothing above
    // reviews any of them.
    camera('nuketown2-into-sun-street', [14, 1.85, -9], [-11.6, 4.2, 6.7], 'light-occlusion', 1.08),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'nuketown2',
    evidence: 'ArenaMap nuketown2 collider, spawn and shot-surface identity from buildNuketown2',
    presentationMayMutateAuthority: false,
  },
  exceptions: [],
}, buildNuketown2);
