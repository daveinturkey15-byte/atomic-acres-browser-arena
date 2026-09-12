# Lane AV — HF-427: Raid Rebuild - the shipped Raid's level of detail on the new layout, layout accuracy corrected, then lighting/texture/asset style toward the original (code only)

Priority 2 of 2026-09-03, after Lane AU. Worktree `C:\Users\david\projects\aa-claude-raid3`,
branch `contrib/dave-gaming-pc/claude/raid2-detail-accuracy` (base = current
integration head). Owner (07:00, verbatim): "Raid layout feels better but is
missing all the nice detail you had in the old version, get the same level of
detail to the new layout and then enhance it to be closer to the original map in
lighthing texture and asset style too, ideally with just code and our new skills
techniques. There are also some issues with the raid map layout not being true
and accurate so you need to do better research there too."

## Job 1 — layout accuracy (research first, like Lane AU)
Fetch public overhead/callout maps and gameplay stills of Black Ops 2 Raid; LOOK
at them; draw `docs/raid-rebuild/REFERENCE_SCHEMATIC.md` (the hillside mansion
and its wings, the pool and pool house, the garage and driveway with the cars,
the basketball court, the main house's two levels and its central sightlines,
the three lanes, the spawn zones); cite each source beside each fact; diff table
against `src/raid2-arena.ts`; correct the layout where it is not true (record
what moved and why); re-derive the fidelity bands from the schematic.

## Job 2 — the shipped Raid's level of detail on the new layout
Inventory the shipped Raid's dressing (`src/test-maps.ts` buildTest2 and
`src/test-maps-art.ts`: furniture, planters, lights, pool furniture, kitchen and
living room props, garage contents, court hoops, hedges, wall trims, decals) and
author the same density and kinds of detail for raid2's rooms and yards in
code, with colliders where players can touch them and parity/walkable audits at
0; three-reading-distances rule; the critical-failure list (no floating or
intersecting props, no default materials).

## Job 3 — lighting, texture and asset style toward the original
Use the new skills: `threejs-webgpu-interior-lighting-look` for the interiors
(emissive fixtures, value composition, filmic post, readability kept), the
`open-world-city-art-loop` street-cell ordering for the driveway/street and the
court, `threejs-webgpu-water` for the pool (a real water surface), the
brief-driven critic loop with three fresh critics on headless captures from the
judgeset. Art-direction row above the distinctiveness floor; the warm-key
quadrant is full - stay cool-keyed with warmth in the key light unless the owner
moves another arena. Time of day hook if Lane AB is merged.

## Gates
tsc; raid2 fidelity test (re-derived); map-selection/selectability; spawn-quality;
parity + walkable audits at 0; art-direction floor; boot smoke headless; 60 s
solo run zero errors; tripwire 0; explicit-path commits; LF in legacy-main;
never touch the shipped Raid. Report with claim-states, the schematic, the diff
table, the detail inventory before/after, the judgeset captures, critic scores.
