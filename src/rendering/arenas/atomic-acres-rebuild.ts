import { buildAtomicAcresRebuild } from '../../atomic-acres-rebuild-arena';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * Graybox wave 2026-09-14 (ShellGray) — visual half of the Atomic Acres
 * layout-validation rebuild. Presentation ONLY: the graybox massing, the
 * reference plates it derives from and every dimension live in
 * src/atomic-acres-rebuild-arena.ts (LayoutGray); gameplay authority
 * (colliders, spawns, shots, cover) is AuthorityGray's
 * src/atomic-acres-rebuild-authority.ts and interior shells are
 * InteriorsGray's src/atomic-acres-rebuild-interiors.ts. This file is the
 * lighting rig, the colour pipeline and the fixed 5-camera judgeset the
 * layout pass is reviewed through — the same split the raid2 module documents.
 *
 * PLATES (all four graybox plates read 2026-09-14, batch-4-nuketown-graybox/):
 * gray_topdown_01 (loop road + south entry + twin houses + sheds + crates +
 * perimeter walls), gray_street_01 (south-entry crate choke + bus + semi +
 * island crates), gray_aerial_01/02 (gabled shells + patios + trees + rocks).
 * LAYOUT_CONTRACT facts: high-desert surround (fact 1), twin two-storey
 * houses teal-west / yellow-east (fact 2), loop spine with south entry
 * (fact 3 + BRIEF mirror note), bus + semi nose-to-nose (fact 4), sheds in
 * the back corners (facts 5/8), jeep + sandbags south (fact 6), pads +
 * hedges (fact 7), privacy fences + lamps (fact 9).
 *
 * THE RIG. Late-morning desert sun, derived the way raid2's is. Notes 1-3 were
 * re-derived in the 2026-09-15 look pass against the photoreal plates
 * (atomic-acres-catalog/batch-4-nuketown-graybox/photo_aerial_01_master.png,
 * photo_aerial_02.png, photo_street_01.png) and the lane's own captures
 * (repo-state/rb5-rebuild-*.png). Notes 4 and 5 are UNCHANGED. Nothing below
 * takes light out of a shaded surface: every number that moved either adds to
 * the sunlit side or is luminance-preserving by construction.
 * 1. KEY 0xffe9c8 at 3.2. The SPECTRUM is unchanged — warmer than raid2's
 *    neutral 0xfff2dc, because a desert late morning is golden, not white.
 *    The INTENSITY was 2.7, taken from raid2's 2.62 on a "same order of
 *    luminance" argument that does not actually transfer: raid2 is graded for
 *    a bleached midday under clouds: true, and this arena is pinned CLEAR
 *    (clouds: false, note 5) over a high-albedo sand surround. At 2.7 this was
 *    the DIMMEST key in the daylight roster, on the map with the least shade
 *    in it. 3.2 is not a new number — it is the roster's clear-day key,
 *    authored unchanged by nuketown2, atomic-acres and test1, all three of
 *    which hang it on the SAME standoff this arena uses: blender-lighting.ts
 *    DEFAULT_LIGHTING sunPosition [-62, 25, 38], aimed by
 *    graphics-refinement.ts at the arena centre at y = 2.4.
 *    WHAT IT BUYS, AND WHAT IT DELIBERATELY DOES NOT. The key contributes
 *    nothing to a surface it cannot reach, so the shade side does not move:
 *    composed shade/lit irradiance falls 0.562 -> 0.520 on horizontals and
 *    0.319 -> 0.279 on verticals with the shadow floor held EXACTLY where it
 *    was. Contrast is bought on the key and never taken out of the shadow a
 *    player stands in, which is the rule lighting-conditions.ts encodes for
 *    the hour excursion, applied here to the authored hour itself.
 * 2. FILL 0xb7b2af at 0.55 — RE-SPECTRALISED AT CONSTANT LUMINANCE, intensity
 *    untouched, and the intensity is the point: 0.55 STAYS. raid2's module
 *    records that 0.44, under a grade whose gain pulls green down, dropped
 *    every shaded vertical on that map to a silhouette; this arena runs the
 *    same DEFAULT_LIGHTING rig and carries a magenta gain of its own
 *    ([1.18, 0.82, 1.18], art-direction.ts), so that measurement is evidence
 *    about this arena too and the fill intensity is not available as a
 *    contrast lever. Only the HUE moves. 0x93b6dd is a pure SKY fill, correct
 *    for the grass-and-asphalt suburb raid2 borrowed it from; this arena sits
 *    on a high-desert surround (LAYOUT_CONTRACT fact 1) whose sunlit floor
 *    fills the half of the hemisphere every shaded vertical face looks into.
 *    So the one flat term this file owns is the hemispherical average of BOTH
 *    halves rather than the sky alone: 0.5 x sky 0x93b6dd + 0.5 x (key
 *    0xffe9c8 through this arena's own sand albedo 0xd6c49a, authored in
 *    atomic-acres-rebuild-arena.ts), renormalised to the authored colour's
 *    Rec.709 luminance so that nothing the ambient lights gets darker —
 *    composed shade luminance moves 0.8602 -> 0.8609 on the ground and
 *    0.9051 -> 0.9058 on a wall, i.e. +0.08%.
 *    THE INVARIANT THIS NOTE EXISTS TO PROTECT IS INTACT, AND NOW MEASURED.
 *    A warm fill must not make shadows warmer than the sun casting them: the
 *    composed shade stays 0.213 (ground) and 0.368 (wall) COOLER than the
 *    composed sunlit side on the r-b axis. What it stops being is violet.
 *    Composed ground shade goes r-b -0.238 -> -0.004, against the plates' own
 *    measured shade band of -0.036 (photo_street_01) to +0.075
 *    (photo_aerial_01_master); the lane captures measure -0.066 with green
 *    0.092 below the r/b mean, which is the lavender the reviewer sees.
 * 3. FOG IS PINNED BY THE DIAGONAL: SPREAD 1.6x diagonal hypot(90, 102) =
 *    136.1 m, so near 140 (eye-level sightlines stay clear of haze).
 *    Far follows at the same authored depth scaled likewise (140 m). BOTH ARE
 *    UNTOUCHED. The COLOUR is 0xe0ddd2, and it moved for the same reason the
 *    fill did: a cool grey haze is not what this arena's own atmosphere
 *    declares. Mix this arena's authored far-haze colours at this arena's
 *    authored ratio — art-direction.ts mistFar 0xeaf4fa with dustFar 0xf8f2e2,
 *    weighted by the mist 0.05 : dust 0.22 of note 5, so 18.5% mist to 81.5%
 *    dust — and renormalise to the authored fog colour's Rec.709 luminance
 *    (0.7233, identical before and after, so the haze BAND is unchanged and
 *    only its hue moves). That is 0xe0ddd2. It is also the only side of the
 *    horizon that agrees with the sky it fades into: the 'range-midmorning'
 *    horizon stop is #e7d9ba (sky-backdrop.ts), r-b +0.176, and 0xd8dee2 sat
 *    on the wrong side of it at -0.039. 0xe0ddd2 lands at +0.055 — warm, and
 *    still well short of the horizon band itself.
 * 4. SHADOW BIAS: the shadow camera covers the 64 x 72 m volume, so 2048 gives
 *    a 35.2 mm texel, and the authored value is 0.026. THE PREMISE THAT NUMBER
 *    WAS DERIVED FROM WAS NEVER TRUE OF THE RIG. The note used to read "the key
 *    sits near 55 degrees, so NdL = sin(55) = 0.819, giving
 *    0.0352 * (0.55 + 1.1 * 0.181) = 0.026"; but the key is aimed from
 *    blender-lighting.ts, and on the shared DEFAULT_LIGHTING standoff
 *    [-62, 25, 38] — aimed by graphics-refinement.ts at (centreX, 2.4, centreZ)
 *    — it sat at atan2(22.6, hypot(62, 38)) = 17.26 degrees, NdL 0.297, which
 *    the same formula prices at 0.047. The authored 0.026 was 44% BELOW its own
 *    derivation and the note asserted an angle the rig did not deliver.
 *    The 2026-09-16 rig pass fixed the ANGLE rather than the bias, because the
 *    angle was the thing that was wrong: ATOMIC_ACRES_REBUILD_LIGHTING
 *    (blender-lighting.ts) now routes this arena to 35.01 degrees — a pure
 *    elevation rotation of the same standoff, |offset| preserved at 76.87 m so
 *    graphics-refinement.ts's `far: 176` derivation stays true. At NdL 0.574
 *    the formula asks for 0.036, so the shipped 0.026 is now 28% below its
 *    derivation instead of 44%, and a HIGHER key elevation strictly REDUCES
 *    acne risk, so leaving it low is safer after the rotation than before it.
 *    THE NUMBER IS DELIBERATELY NOT MOVED. Raising it to 0.036 detaches contact
 *    shadows, which on a map being judged for its floor is the artefact raid2's
 *    note 3 refuses to risk, and no lane has yet captured this arena at 35
 *    degrees. Resolving the residual 0.026-vs-0.036 gap needs one capture pass:
 *    look for acne at grazing incidence on the loop road at 0.036, and for
 *    detached contact shadows under the crates and the fence posts.
 * 5. ATMOSPHERE reuses the EXISTING 'range-midmorning' preset (test1, map3):
 *    adding a preset means editing sky-backdrop.ts, which this slice does
 *    not own. clouds: false — the weather profile pins this arena clear, so
 *    rain would fall out of a sky with nothing in it. Dust runs higher than
 *    raid2's (0.22 vs 0.1): desert air, and the art-direction row grades it.
 * 6. WHAT LIGHTS THIS ARENA IS NOT ALL IN THIS FILE, AND THAT WAS THE BUG.
 *    A visual definition owns the key colour/intensity, the ambient, the fog and
 *    the sky preset; the HEMISPHERE, the shadow-side FILL and the sun STANDOFF
 *    come from blender-lighting.ts `arenaLightingProfile`, which had no branch
 *    for this arena — so a clear-midmorning map was lit by DEFAULT_LIGHTING, the
 *    SUNSET profile: a pink-lavender hemisphere (0xcbbacb) at 1.05, twice this
 *    file's ambient, a blue-violet fill (0xd8ddff), and a 17.26-degree sun. That
 *    is where the lavender and the hazy sun both came from, and it is why the
 *    three values Lane D placed here in the 2026-09-15 look pass could only
 *    close part of the gap. ATOMIC_ACRES_REBUILD_LIGHTING now routes the arena
 *    out of it, hue-only on the indirect (renormalised to the replaced
 *    luminances, so nothing gets darker) and elevation-only on the sun (so no
 *    shaded pixel moves at all). Its derivation is recorded with it, next to the
 *    values it sets. Nothing in THIS file changed in that pass.
 *
 * THE JUDGESET. Five fixed cameras, mirrored into
 * scripts/qa/viewpoint-catalog.mjs (which derives its roster from this
 * directory and fails until they are there): the whole plan, the exact
 * top-down the brief pins ([0,78,-8]→[0,0,-8]), both street-level ends of
 * the loop at 1.7 m eye height, and the yard geometry. yard-geometry carries
 * the light-occlusion purpose the definition validator requires — it frames
 * the fence/hedge lines where shade either reads or does not.
 */
export const definition = createProceduralArenaVisualDefinition({
  id: 'atomic-acres-rebuild',
  displayLabel: 'Atomic Acres',
  moduleId: 'arena.visual.atomic-acres-rebuild.v1',
  // Nothing is downloaded for this arena. The sky is the procedural
  // 'range-midmorning' preset, which is also its (inert) IBL source.
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    // Note 1. 3.2 is the roster's clear-day key on the shared
    // DEFAULT_LIGHTING [-62, 25, 38] standoff (nuketown2, atomic-acres, test1).
    sunColor: 0xffe9c8, sunIntensity: 3.2,
    // Note 2. Hue-only: the half-sky/half-sunlit-sand hemisphere a shaded
    // vertical actually sees, at the authored colour's Rec.709 luminance.
    // The INTENSITY is deliberately unmoved (raid2's 0.44 silhouette finding).
    ambientColor: 0xb7b2af, ambientIntensity: 0.55,
    practicals: [
      { id: 'atomic-acres-rebuild-loop-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
    ],
  },
  // Note 3. SPREAD 1.6x: diagonal hypot(90, 102) = 136.1 m pins near 140;
  // far follows at the authored 88 m depth scaled likewise (140). Near and far
  // are UNTOUCHED; the colour is this arena's own mist:dust far-haze mix at the
  // authored fog luminance (0.7233), so the haze band moves in hue only.
  fog: { color: 0xe0ddd2, near: 140, far: 280 },
  // maximumDistance 165 covers the 136.1 m diagonal with 25 m spare.
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 165, normalBias: 0.026 },
  atmosphere: { preset: 'range-midmorning', mist: 0.05, dust: 0.22, clouds: false },
  colorPipeline: colorPipeline('pass98.atomic-acres-rebuild.hdr.v1', 1.04),
  // The graybox carries fewer masses than the shipped suburb (massing only,
  // no interiors yet), so the draw budget is set at raid2's rather than below
  // it: consolidation into bigger pieces did not delete wall area.
  budgets: budgets({ maximumDrawCalls: 420, maximumTriangles: 700_000 }),
  reviewCameras: [
    // 1. The whole plan from the south-east, high enough to read the loop,
    //    both houses, the garages, the sheds and the south-entry choke.
    // RE-FRAMED 2026-09-16. At [64,54,77] the eye stood 117 m from the aim point
    // and the built area occupied a small patch in the middle of bare apron -
    // `layout-angle.png` is a TIGHT three-quarter of the compound, and the pair
    // was comparing a full frame against a distant island. The playfield is
    // |x| <= 38.4, z in [-41.6, +38.4], so the built extent is ~77 x 80 m and a
    // 70-degree review camera needs roughly 70 m of standoff, not 117.
    camera('atomic-acres-rebuild-overview', [40, 33, 48], [0, 3, -1], 'overview', 1.04),
    // RE-FRAMED with the overview and for the same reason: y=100 put ~55% of the
    // frame outside the perimeter walls, where `layout-topdown.png` crops to the
    // compound. 68 m frames the 77 x 80 m playfield with a modest margin.
    camera('atomic-acres-rebuild-topdown', [0, 68, -2], [0, 0, -2], 'overview', 1.04),
    // 3. North end at eye height, looking south down the loop past the sheds
    //    toward the bus + semi pair. This is the frame that shows the north
    //    entrance reads as a gap, not a wall.
    camera('atomic-acres-rebuild-street-north', [10, 1.7, -32], [0, 1.6, 16], 'geometry', 1.04),
    // 4. South entry at eye height, looking north through the crate-barricade
    //    choke at the bus + semi nose-to-nose pair and the island crates.
    //    If anything is ever added into this lane, this is the camera that
    //    shows it.
    camera('atomic-acres-rebuild-street-south', [0, 1.7, 45], [0, 2.0, -16], 'geometry', 1.04),
    // 5. The west yard side-on: house flank, garage, driveway car, patio set,
    //    hedge and fence lines. Carries the light-occlusion purpose — the
    camera('atomic-acres-rebuild-yard-geometry', [-32, 5, 26], [22, 2, -16], 'light-occlusion', 1.04),
    // 6. West living room toward the stair + kitchen opening: proves the
    //    open great-room, the stair massing and the link door read.
    camera('atomic-acres-rebuild-interior-west', [-17, 1.7, 5.5], [-19.7, 1.2, 2.0], 'geometry', 1.04),
    // 7. Above the stair run toward the landing + front-bedroom door: proves
    //    the stair arrives, the landing connects and the rail stands.
    //    Restored 2026-09-16: this comment survived but its camera() call did
    //    not, leaving 7 authored cameras against 8 catalogued. That is not a
    //    cosmetic gap - arena-viewpoint-regression.test.mjs was RED on
    //    "catalog entry 'atomic-acres-rebuild-upper-landing' no longer exists",
    //    and the upper storey had zero camera coverage, so nothing could have
    //    caught a regression up there. Placed one storey (REBUILD_UPPER_FLOOR_Y
    //    = 3.0) directly above the known-good interior-west station rather than
    //    derived from houseFrame(): the interiors module's frame for west is
    //    x -16.8..-10.2, z -1.2..4.2, which does NOT contain the working
    //    interior-west eye at x=-17, so the arena's placement frame and the
    //    interiors frame do not share a convention and deriving from the latter
    //    would have put this camera through a wall.
    camera('atomic-acres-rebuild-upper-landing', [-17, 4.7, 5.5], [-19.7, 4.2, 2.0], 'geometry', 1.04),
    // 9. West great room looking NORTH at the glazed elevation. Added
    //    2026-09-16 alongside the shell-wall aperture split, because that work
    //    was unreviewable without it: a sun raycast proved 0.68 m2 of direct
    //    sun now reaches the west floor where 0.00 m2 reached it before, but
    //    the pool lands at z 5.73-6.13, just inside the north wall, and station
    //    6 sits at z=5.5 looking toward z=2.0 - so the only lit floor in the
    //    house is directly BEHIND that camera. A change that cannot be seen at
    //    any authored station is a change nobody can regress. This station
    //    faces the glazing the way `living-room-eye.png` does, so the pair is
    //    also a fair comparison rather than a blank wall against a window wall.
    //    West house spans x -27.4..-15.8, z -2.4..7.2 (cx/cz/w/d in the house
    //    table are pre-SPREAD; SPREAD is 1.6), so this eye stands in the room's
    //    south half and looks back at the north elevation.
    camera('atomic-acres-rebuild-interior-sunlit', [-19, 1.7, 1.5], [-20.6, 0.85, 6.8], 'light-occlusion', 1.04),
    // 8. Bus closeup (kitbash proof): catalog GLB over massing placeholder.
    camera('atomic-acres-rebuild-bus-closeup', [3, 2.4, 1.5], [-5.5, 1.4, 0.8], 'geometry', 1.04),
    // 15. The centre loop, slightly elevated, looking down the carriageway with
    //     both houses flanking and the bus + semi nose-to-nose in the middle.
    //     This is the composition of batch-2-layout/map__center-loop.png, which
    //     is the single most complete statement of what this map is meant to
    //     look like - and nothing was framing it. -bus-closeup stands ON the
    //     vehicles and -street-south stands 45 m back at eye height, so neither
    //     produces the plate's elevated centred read.
    // Stood at z=30 on the first attempt, which is SOUTH of the entry choke: the
    //     merged barricade filled the middle of the frame and hid the whole
    //     turnaround. Moved north of it. `aarr-road-entry-south` spans z 12..34
    //     and the centre island sits at z 7.68, so z=18 clears the choke and
    //     still holds both houses in the flanks.
    camera('atomic-acres-rebuild-center-loop', [0, 3.6, 18], [0, 1.9, -2], 'overview', 1.04),
    // 10-14. ADDED 2026-09-16 to make more of the reference corpus gradeable.
    //
    // RE-AIMED after the first capture: three of the five framed badly because
    // they were placed against the house table's RAW cx/cz, and `centred()`
    // multiplies plan positions AND sizes by ATOMIC_ACRES_REBUILD_SPREAD (1.6).
    // The real extents, spread applied: west house x -27.36..-15.84 z -2.4..7.2;
    // east house x 15.36..27.84 z -7.52..2.72; centre island r 7.68 at z 7.68;
    // perimeter walls |x| <= 38.4, z in [-41.6, +38.4] (line 96 of the arena
    // module states this outright and I did not read it the first time).
    // side-lane-east sat 1.2 m off the east flank and filled the frame with one
    // siding panel; road-far-end sat at z -34, past the road entirely, on bare
    // apron; balcony-backyard sat OUTSIDE the west house's south wall at 4.6 m,
    // looking at a utility pole. All three now derive from the spread extents.
    // `npm run qa:catalogue` reports 556 reference images against 9 paired
    // stations - 1.6% coverage - so almost nothing the owner authored is
    // actually being measured against. Even the 18-plate frozen bar only had 9
    // stations. These five pair the plates that had none.
    //
    // Placed from the arena's own authored extents rather than guessed: side
    // lawns sit at x = +/-21 z = -2, back lawns at x = +/-14 z = -16, front
    // lawns at z = +12, service roads at x = +/-31, apron 140 x 150. Front is
    // +z, back is -z (aarr-lawn-front / aarr-lawn-back).
    //
    // `teal-side-lane.png` / `yellow-side-lane.png`: eye-level down the lane
    // between a house flank and the boundary fence - fence one side, siding and
    // hedges the other, garage and ridge line closing the far end.
    camera('atomic-acres-rebuild-side-lane-west', [-22, 1.65, -10], [-22, 1.5, 14], 'geometry', 1.04),
    // NOT the mirror of the west lane, and that is the finding. x = -22 puts the
    // west camera in open lane (29,002 distinct colours, healthy); x = +22 put
    // the east camera INSIDE the east house, filling the frame with one ochre
    // siding panel - 3,942 distinct colours, which the harness's own
    // frame-variety gate failed the whole run on. The two houses are not
    // symmetric: east is the wider of the pair (w 7.8 against 7.2) and sits at
    // cz -1.5 against the west's +1.5, so mirroring the x was never going to
    // land. Moved outboard to sit between the east house and the x = +31
    // service road.
    camera('atomic-acres-rebuild-side-lane-east', [33, 1.65, -12], [29, 1.5, 8], 'geometry', 1.04),
    // `yellow-backyard.png`: the east house's rear yard. -yard-geometry already
    // covers the west/north sweep; this is the matching east station, and it is
    // also the first camera this arena has ever pointed at the east house.
    camera('atomic-acres-rebuild-backyard-east', [22, 2.6, -26], [12, 1.4, -12], 'light-occlusion', 1.04),
    // `road-far-end.png`: the loop road from its far end, held low and straight
    // down the carriageway so the road surface itself is the subject - it is the
    // most-resolved material in the build and nothing was framing it.
    camera('atomic-acres-rebuild-road-far-end', [0, 1.5, -20], [0, 1.8, 10], 'geometry', 1.04),
    // `balcony-backyard.png`: from the west upper storey out over its own back
    // lawn. Second station on the upper floor, which until today had none at all.
    camera('atomic-acres-rebuild-balcony-backyard', [-21, 4.7, 2], [-21, 2.2, -16], 'light-occlusion', 1.04),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'atomic-acres-rebuild',
    evidence: 'ArenaMap atomic-acres-rebuild collider, spawn and shot-surface identity from buildAtomicAcresRebuild',
    presentationMayMutateAuthority: false,
  },
  exceptions: ['graybox massing is presentation-only; every solid below it is AuthorityGray movement/shot authority'],
}, buildAtomicAcresRebuild);
