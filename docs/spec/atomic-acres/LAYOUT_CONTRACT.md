# Atomic Acres — New World: LAYOUT CONTRACT (generation-spec authority)

Source of truth: the 18 owner-approved concept images at
`C:/Users/david/Documents/Codex/2026-09-11/p-le/work/fresh-world-20260912/references/`
(layout-topdown.png + layout-angle.png are the authoritative views; street-teal/street-yellow/
road-entrance/road-far-end are ground-level truth; *-cutaway/*-eye cover interiors).
Owner directive 2026-09-13: **every generated image must stay true to this layout. No drift.**

## Non-negotiable layout facts (from layout-topdown + layout-angle)

1. **Setting: high-desert.** Sand, scrub, Joshua trees, rocks, utility poles surround the map.
   Green lawns exist ONLY inside the two fenced residential lots.
2. **Two facing two-story houses, gray shingled roofs, front porches:**
   - WEST/LEFT house: **TEAL/turquoise siding** (team-teal identity), white trim, chimney,
     porch with railing; silver sedan parked at its driveway.
   - EAST/RIGHT house: **YELLOW siding** (team-yellow identity), stone chimney accent;
     back patio with red umbrella + BBQ.
3. **Central horseshoe/loop asphalt road**: enters at NORTH, loops, exits at SOUTH. This loop is
   the arena spine.
4. **Center-loop cover (fixed props):** yellow SCHOOL BUS + red-cab semi truck with white
   trailer, parked nose-to-nose inside the loop.
5. **North entrance:** rusty/burnt car + wooden WELCOME SIGN between the two back-yard sheds.
6. **South exit:** military jeep + sandbag emplacement across the road.
7. **Four concrete pads** in the front yards (southwest, southeast, mid-west, mid-east): flat
   concrete slabs with low concrete walls + hedge rows — paved utility/parking pads.
8. **Back yards:** NW teal shed (white/teal), NE yellow shed, clotheslines with white laundry,
   hedges, deck furniture.
9. **Fencing:** wooden privacy fences divide every lot; street lamps line the loop; low hedges
   along the road edges.
10. **Color blocking = team identity: teal vs yellow**, everything else neutral (gray roofs,
    asphalt, concrete, sand).

## Style (from the concept plates)

Warm late-morning desert light, long soft shadows, slight miniature/diorama readability at aerial
views, game-screenshot realism at ground level. Textures: weathered wood, sun-baked stucco/siding,
cracked asphalt with road markings, sand rakes.

## Variant system (owner directive: time-of-day × weather)

Each composition is generated ONCE (base = late-morning clear), then variant passes reproduce the
SAME composition under: {dawn-mist, golden-dusk, overcast, night+rain-wet-street}. Variants must
not change layout, props, or camera — light and weather only. Outcome maths: ~55 unique
compositions × 4-5 variants ≈ 220-275 outcome images.

## Prompt binding rule

Every environment prompt MUST cite this contract's facts (house colors/sides, loop, center props,
entrances, pads, desert surround) and contains: "layout exactly as described — do not add buildings,
do not change the road shape, do not replace the desert with greenery." Weapons/characters: use
fixed identity descriptions; environment plates need no weapon.
