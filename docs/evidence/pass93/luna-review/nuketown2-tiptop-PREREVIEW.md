# Pass 93 Luna pre-review - Nuke Town Rebuild tip-top

Review date: 2026-09-04 (Europe/London)

## Review boundary and claim-state policy

- `VERIFIED`: directly read from this worktree or reproduced by a command in this review.
- `CLAIMED`: copied from a critic/evidence document or another authored assertion; not independently rendered by this review.
- `OPEN`: not proven by the allowed checks and still requiring owner/release evidence.

This is a source, test, and static-analysis pre-review. Per the overnight instruction, no browser was launched and `npm run build` was not run. The critic rows below are therefore `CLAIMED`, even where the critic files label their own image observations `OBSERVED`.

## Freeze and delta inventory

`VERIFIED` worktree: `C:\Users\david\projects\aa-claude-nuketown6`.

`VERIFIED` branch: `contrib/dave-gaming-pc/claude/nuketown2-tiptop`.

`VERIFIED` initial review head: `f35dcb06434ebdcbc32e005d3b37e7d0a1b77ac5` (`f35dcb06`). The one bounded pre-review repair moved the final head to `368f1f43`.

`VERIFIED` initial `git log --oneline ce1c8f76..HEAD` contained 43 commits. `VERIFIED` initial `git diff --stat ce1c8f76..HEAD` was 122 files changed, 6,044 insertions, and 151 deletions. Full diffs were read for every changed `src/` file; PNGs were skipped as directed.

Changed source files reviewed in full:

- `src/nuketown-lawn-field.ts`
- `src/nuketown2-arena.ts`
- `src/nuketown2-facade-materials.ts`
- `src/nuketown2-fidelity.test.ts`
- `src/nuketown2-interior-materials.ts`
- `src/nuketown2-layout.ts`
- `src/nuketown2-street-materials.ts`
- `src/nuketown2-vehicle-materials.ts`
- `src/rendering/arenas/nuketown2.ts`
- `src/rendering/raytracing/arena-proxy-registration.ts`

There was no new test file on the branch; `src/nuketown2-fidelity.test.ts` is the only changed test file.

## Per-cycle landing summary

| Cycle | What landed | Evidence state |
| --- | --- | --- |
| 1 | `c08f3acd` dressed the turning-head/east-lawn gap; `17400b22` authored carriageway, kerbs, aprons, and dashes; `383f3ef3` added street furniture; `41ffb882` added interior/garage review cameras; `1b2209a0` recorded captures. | `VERIFIED` source and camera/evidence files exist. Critic scores are `CLAIMED`. |
| 2 | `5d541b5d` added glazed window frames, muntins, and panes; `35f37c74` added interior lighting/materials/dressing; `12c2526a` added procedural siding, shingle, and fence materials; `7e27e4d6` added procedural vehicles and hero-prop detail; `b432a962` added the pool, patio/deck dressing, and obstacle skirts; `f65d5711` recorded captures. | `VERIFIED` source and evidence files exist. Critic scores are `CLAIMED`. |
| 3 | `ba8ea6bb` added the patio dining set; `561b4f19` added the interior foreground partition; `0999df12` added tactical crate dressing; `e4b0c07b` corrected coach/headlight/taillight presentation; `be5d0600` added warm siding albedo and interior drywall lining. | `VERIFIED` the cycle-3 directory contains critic files but no capture PNG/manifest set; all three critic scorecards consequently score 0. |
| 4 | `b350fda8` raised interior floors and smoothed stair ramps; `e1ce30f1` recorded Pass 93 evidence; `297a0a1d` recorded cycle-4 captures. | `VERIFIED` source and evidence files exist. Critic scores are `CLAIMED`; critics still reported drywall/envelope defects. |
| 5 | `0849e49d` decoupled stair-ramp material, sealed envelope gaps, and refined patio dressing; `b33c48e2` added interior drywall/upper walls and hid the review bot; `98b2a4f8` recorded cycle-5 captures. | `VERIFIED` source and evidence files exist. Critic scores are `CLAIMED`; all three still recorded a minor south-patio marker. |
| 6 | `9e2f2105` recorded cycle-6 captures; `aa8c1195`, `225066fb`, and `263887b6` recorded critics A/B/C; `f35dcb06` recorded the final native-WebGPU capture set and manifest. No new cycle-6 runtime source change landed after the cycle-5 source repairs. | `VERIFIED` documents and final capture/manifest files exist. Visual conclusions remain `CLAIMED` here because browser inspection was prohibited. |

## Critic score trajectory

The following rows are copied from the five-row rubric tables in each critic file. Each row is `CLAIMED` from its named critic file, not independently verified by Luna. The table uses the exact rubric labels, maximums, thresholds, scores, statuses, and primary rationales authored there.

| Cycle | Critic | Rubric row | Max | 85% threshold | Score | Status | Primary rationale |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| 1 | A | 1. Layout fidelity | 25 | 21.25 | 22 | PASS | Cul-de-sac macro layout, house positions, vehicle choke points, and sniper sightlines are faithfully captured. |
| 1 | A | 2. Material and texture quality | 25 | 21.25 | 18 | FAIL | Street asphalt and curbs are strong, but house walls, vehicles, interior surfaces, and fences remain flat monochrome blocks. |
| 1 | A | 3. Lighting and atmosphere | 20 | 17.00 | 15 | FAIL | Exterior sun and shadows are well balanced, but interiors completely lack emissive practicals and localized light falloff. |
| 1 | A | 4. Dressing density and reading distances | 15 | 12.75 | 10 | FAIL | Curbside verge furniture is present, but house interiors are totally empty shells and backyards have large undressed expanses. |
| 1 | A | 5. Technical hygiene | 15 | 12.75 | 12 | FAIL | Zero coplanar z-fighting and zero walkable fall-throughs, but windows lack glass and muntins, and interior joints are bare. |
| 1 | B | 1. Layout fidelity | 25 | 21.25 | 22 | PASS | Macro layout, house placement, vehicle cover positioning, street alignment, and symmetrical sniper lines are accurately established. |
| 1 | B | 2. Material and texture quality | 25 | 21.25 | 16 | FAIL | Critical failure: house siding, vehicle bodies, interior walls/floors, roofs, and window glass are completely flat untextured solid colors. |
| 1 | B | 3. Lighting and atmosphere | 20 | 17.00 | 14 | FAIL | Critical failure: interiors completely lack emissive practical fixtures and light falloff; exterior direct sun is functional but lacks atmospheric depth. |
| 1 | B | 4. Dressing density and reading distances | 15 | 12.75 | 10 | FAIL | Curbside verge dressing is started, but house interiors are completely empty hollow boxes and backyards have large barren expanses. |
| 1 | B | 5. Technical hygiene | 15 | 12.75 | 12 | FAIL | Geometry alignment is clean without coplanar z-fighting, but window glass and muntins are completely missing, leaving bare geometric holes, plus a stray purple light artifact. |
| 1 | C | 1. Layout fidelity | 25 | 21.25 | 22 | PASS | Macro layout, cul-de-sac geometry, building footprints, vehicle placement, and symmetrical sniper corridors are faithfully arranged. |
| 1 | C | 2. Material and texture quality | 25 | 21.25 | 17 | FAIL | Wall siding, roofs, vehicles, interior surfaces, and fences are predominantly flat untextured monochrome solids. |
| 1 | C | 3. Lighting and atmosphere | 20 | 17.00 | 14 | FAIL | Interiors completely lack practical light sources and falloff; exterior features shadow map stair-stepping and a rogue magenta point artifact. |
| 1 | C | 4. Dressing density and reading distances | 15 | 12.75 | 10 | FAIL | Curbside verge dressing is initiated, but house interiors are completely bare hollow voids and backyards lack signature props. |
| 1 | C | 5. Technical hygiene | 15 | 12.75 | 11 | FAIL | Critical failures: completely missing window glass/frames across all windows (P0), grass clipping through cover blocks (P1), rogue magenta light artifact (P1), and un-trimmed wall junctions (P1). |
| 2 | A | 1. Layout fidelity | 25 | 21.25 | 20.0 | FAIL | Symmetrical layout, sniper sightlines, and hero vehicle placements are excellent, but texturing BOTH houses in identical cyan-blue siding breaks canonical Nuketown team identity and orientation (P0 blocker). |
| 2 | A | 2. Material and texture quality | 25 | 21.25 | 22.0 | PASS | Exceptional progress: hardwood floor planks with staggered joints, butcher-block workbench, lap siding, shingle roofs, vehicle headlights, and driveway oil marks elevate the scene above the 85% bar. |
| 2 | A | 3. Lighting and atmosphere | 20 | 17.00 | 17.5 | PASS | Emissive ceiling panels in kitchens, glowing garage tube fixture, vehicle headlights, and warm sunset shadows pass the threshold, though interior ceiling contact AO needs tuning. |
| 2 | A | 4. Dressing density and reading distances | 15 | 12.75 | 12.5 | FAIL | Curbside verge and vehicles are dense and well-scaled, but massive interior foreground walls (>65% screen area) remain completely barren flat drywall, and yard cover blocks lack detailed dressing. |
| 2 | A | 5. Technical hygiene | 15 | 12.75 | 13.0 | PASS | Double-hung window frames with glass and baseboard trim cleanly seal geometry with zero z-fighting; stray purple debug cubes and rear bus headlight colors require cleanup next cycle. |
| 2 | B | 1. Layout fidelity | 25 | 21.25 | 20.0 | FAIL | Macro placement, vehicle choke points, and symmetrical sniper corridors are well-engineered, but texturing BOTH houses with identical cyan-blue siding breaks canonical Nuketown team identity and orientation (P0 blocker). |
| 2 | B | 2. Material and texture quality | 25 | 21.25 | 21.5 | PASS | Substantial progress: wood floor planks with staggered joints, butcher-block workbench slats, procedural lap siding, roof shingle noise, vehicle headlights/glass, and driveway tire stains push materials above the 85% bar. |
| 2 | B | 3. Lighting and atmosphere | 20 | 17.00 | 17.0 | PASS | Emissive kitchen ceiling light panels, garage fluorescent tube fixture, sedan headlights, and directional sunset shadows achieve the 85% threshold, though interior ceiling contact AO and forward atmospheric haze need tuning. |
| 2 | B | 4. Dressing density and reading distances | 15 | 12.75 | 12.0 | FAIL | Curbside verge dressing (mailbox, bins) and garage workbench are strong, but massive interior foreground walls (>65% screen area) remain completely barren flat drywall, and backyard cover blocks lack surface dressing. |
| 2 | B | 5. Technical hygiene | 15 | 12.75 | 12.5 | FAIL | Double-hung window frames with transparent glass cleanly resolve Cycle 1 voids, but stray bright purple debug cubes/points on the patio slab and north garage, plus white bus rear headlight lamps, require cleanup. |
| 2 | C | 1. Layout fidelity | 25 | 21.25 | 20.0 | FAIL | Symmetrical layout, sniper sightlines, and hero vehicle placements are excellent, but texturing BOTH houses with identical cyan-blue siding breaks canonical Nuketown team identity and orientation (P0 blocker). |
| 2 | C | 2. Material and texture quality | 25 | 21.25 | 22.0 | PASS | Substantial progress: hardwood floor planks with staggered joints, butcher-block workbench, lap siding, roof shingle noise, vehicle headlights/glass, and driveway tire stains exceed the 85% bar. |
| 2 | C | 3. Lighting and atmosphere | 20 | 17.00 | 17.5 | PASS | Emissive ceiling panels in kitchens, glowing garage tube fixture, vehicle headlights, and warm sunset shadows pass the threshold, though interior ceiling contact AO needs tuning. |
| 2 | C | 4. Dressing density and reading distances | 15 | 12.75 | 12.0 | FAIL | Curbside verge dressing (mailbox, bins) and garage workbench are strong, but massive interior foreground walls (>65% screen area) remain completely barren flat drywall, and backyard cover blocks lack surface dressing. |
| 2 | C | 5. Technical hygiene | 15 | 12.75 | 12.5 | FAIL | Double-hung window frames with transparent glass and baseboard moldings cleanly resolve Cycle 1 voids and seams, but stray purple debug marker cubes on the patio and north garage, white bus rear headlight lamps, and primitive rectangular wheel blocks fall just short of the 85% bar. |
| 3 | A | 1. Layout fidelity | 25 | 21.25 | 0.0 | FAIL | No visual captures exist to verify layout fidelity, house siding colors, or sniper sightlines. |
| 3 | A | 2. Material and texture quality | 25 | 21.25 | 0.0 | FAIL | No visual captures exist to verify procedural siding, drywall lining, timber finishes, or vehicle materials. |
| 3 | A | 3. Lighting and atmosphere | 20 | 17.00 | 0.0 | FAIL | No visual captures exist to verify emissive fixtures, shadow falloff, or headlight/taillight bloom tuning. |
| 3 | A | 4. Dressing density and reading distances | 15 | 12.75 | 0.0 | FAIL | No visual captures exist to verify domestic partition dressing, patio umbrella, crate strapping, or verge density. |
| 3 | A | 5. Technical hygiene | 15 | 12.75 | 0.0 | FAIL | No visual captures exist to verify absence of geometry seams, light leaks, purple marker cubes, or alignment defects. |
| 3 | B | 1. Layout fidelity | 25 | 21.25 | 0.0 | FAIL | No visual captures exist to verify layout fidelity, house siding colors, or sniper sightlines. |
| 3 | B | 2. Material and texture quality | 25 | 21.25 | 0.0 | FAIL | No visual captures exist to verify procedural siding, drywall lining, timber finishes, or vehicle materials. |
| 3 | B | 3. Lighting and atmosphere | 20 | 17.00 | 0.0 | FAIL | No visual captures exist to verify emissive fixtures, shadow falloff, or headlight/taillight bloom tuning. |
| 3 | B | 4. Dressing density and reading distances | 15 | 12.75 | 0.0 | FAIL | No visual captures exist to verify domestic partition dressing, patio umbrella, crate strapping, or verge density. |
| 3 | B | 5. Technical hygiene | 15 | 12.75 | 0.0 | FAIL | No visual captures exist to verify absence of geometry seams, light leaks, purple marker cubes, or alignment defects. |
| 3 | C | 1. Layout fidelity | 25 | 21.25 | 0.0 | FAIL | No visual captures exist to verify layout fidelity, house siding colors, or sniper sightlines. |
| 3 | C | 2. Material and texture quality | 25 | 21.25 | 0.0 | FAIL | No visual captures exist to verify procedural siding, drywall lining, timber finishes, or vehicle materials. |
| 3 | C | 3. Lighting and atmosphere | 20 | 17.00 | 0.0 | FAIL | No visual captures exist to verify emissive fixtures, shadow falloff, or headlight/taillight bloom tuning. |
| 3 | C | 4. Dressing density and reading distances | 15 | 12.75 | 0.0 | FAIL | No visual captures exist to verify domestic partition dressing, patio umbrella, crate strapping, or verge density. |
| 3 | C | 5. Technical hygiene | 15 | 12.75 | 0.0 | FAIL | No visual captures exist to verify absence of geometry seams, light leaks, purple marker cubes, or alignment defects. |
| 4 | A | 1. Layout fidelity | 25 | 21.25 | 24.0 | PASS | South house yellow siding restoration cleanly solves the canonical Nuketown team polarity across all street, yard, overhead, sniper, and garage sightlines. |
| 4 | A | 2. Material and texture quality | 25 | 21.25 | 21.5 | PASS | Excellent hardwood floors, butcher-block bench, shingle roofs, vehicle lighting, and amber taillights pass the bar, though interior walls need drywall instead of lap siding. |
| 4 | A | 3. Lighting and atmosphere | 20 | 17.00 | 18.0 | PASS | Well-balanced warm directional sun, soft shadows, emissive interior fixtures, garage fluorescent tube, and illuminated headlights create authentic atmosphere. |
| 4 | A | 4. Dressing density and reading distances | 15 | 12.75 | 13.5 | PASS | Yard cover crates now feature tan top tiering and strapping bands, curbside verge is richly dressed, and interior walls feature light switches and framed wall art. |
| 4 | A | 5. Technical hygiene | 15 | 12.75 | 11.5 | FAIL | Ground-floor interior partition walls in both residences have missing drywall geometry, rendering as hollow frame outlines with see-through voids (P0 blocker), alongside stray purple cubes. |
| 4 | B | 1. Layout fidelity | 25 | 21.25 | 24.0 | PASS | South house yellow siding restoration cleanly solves the canonical Nuketown team polarity across all street, yard, overhead, sniper, and garage sightlines. |
| 4 | B | 2. Material and texture quality | 25 | 21.25 | 21.5 | PASS | High-quality hardwood floors, butcher-block bench, shingle roofs, vehicle paint, and amber taillights pass the 85% bar, though interior walls still need drywall instead of lap siding. |
| 4 | B | 3. Lighting and atmosphere | 20 | 17.00 | 18.0 | PASS | Well-balanced warm directional sun, soft shadows, emissive interior fixtures, garage fluorescent tube, and illuminated headlights create authentic atmosphere. |
| 4 | B | 4. Dressing density and reading distances | 15 | 12.75 | 13.5 | PASS | Yard cover crates now feature tan top tiering and strapping bands, curbside verge is richly dressed, and interior walls feature light switches and framed wall art. |
| 4 | B | 5. Technical hygiene | 15 | 12.75 | 10.5 | FAIL | Ground-floor interior partition walls in both residences have missing drywall geometry, rendering as hollow frame outlines with see-through voids (P0 blocker), alongside severe upper wall gaps and stray purple cubes. |
| 4 | C | 1. Layout fidelity | 25 | 21.25 | 24.0 | PASS | Canonical yellow siding restoration on the south house cleanly resolves team polarity across all street, yard, overhead, sniper, and garage viewpoints. |
| 4 | C | 2. Material and texture quality | 25 | 21.25 | 21.5 | PASS | High-quality hardwood flooring, butcher-block workbench, roof shingles, vehicle paint, and bus amber taillights pass the 85% bar, though interior walls still need drywall instead of lap siding. |
| 4 | C | 3. Lighting and atmosphere | 20 | 17.00 | 18.0 | PASS | Warm directional sunlight, sharp window muntin shadows, interior emissive panels, fluorescent garage tube, and vehicle headlights create convincing suburban atmosphere. |
| 4 | C | 4. Dressing density and reading distances | 15 | 12.75 | 13.5 | PASS | Yard cover blocks feature tiered crates with strapping bands, curbside verge is richly dressed with mailbox and bins, and interior spaces feature switch plates and framed art. |
| 4 | C | 5. Technical hygiene | 15 | 12.75 | 10.0 | FAIL | Severe P0 blockers: ground-floor interior partition walls in both houses are hollow outline skeletons with missing drywall, and wide horizontal gaps above rear openings leak exterior sky and mountains into rooms. |
| 5 | A | 1. Layout fidelity | 25 | 21.25 | 24.5 | PASS | Cul-de-sac macro layout, team color polarity (yellow south vs cyan-blue north), vehicle chokepoints, reciprocal sniper sightlines, and garage framing are authentic and canonical. |
| 5 | A | 2. Material and texture quality | 25 | 21.25 | 22.5 | PASS | Rich hardwood plank flooring, butcher-block workbench, vehicle taillights/clearcoat, drywall lining, and shingle roofing present convincing material variety. |
| 5 | A | 3. Lighting and atmosphere | 20 | 17.00 | 18.5 | PASS | Warm directional sunlight, soft shadow casting, vehicle headlight/taillight emissives, interior ceiling light panels, and garage fluorescent fixtures establish rich atmosphere. |
| 5 | A | 4. Dressing density and reading distances | 15 | 12.75 | 14.0 | PASS | Street verge features mailbox, refuse bins, hedges, and sedans; yards feature tiered cover crates, coolers, and grills; interiors feature counters, switch plates, and framed art. |
| 5 | A | 5. Technical hygiene | 15 | 12.75 | 13.5 | PASS | Cycle 4 P0 blocker (hollow partition walls with see-through voids) and horizontal envelope light leaks are completely resolved with solid drywall and header panels; only minor purple marker persists on south patio. |
| 5 | B | 1. Layout fidelity | 25 | 21.25 | 24.5 | PASS | Cul-de-sac macro geometry, team color polarity (golden-yellow south vs cyan-blue north), vehicle chokepoints, reciprocal sniper sightlines, and garage framing are authentic and canonical. |
| 5 | B | 2. Material and texture quality | 25 | 21.25 | 22.5 | PASS | High-quality hardwood plank flooring, butcher-block workbench slats, vehicle paint/specular glints, drywall lining, and shingle roofing present rich procedural material variety. |
| 5 | B | 3. Lighting and atmosphere | 20 | 17.00 | 18.5 | PASS | Warm directional sunlight, natural shadow penumbras, active vehicle headlight/taillight emissives, ceiling light panels, and garage fluorescent fixtures establish rich atmosphere without light leaks. |
| 5 | B | 4. Dressing density and reading distances | 15 | 12.75 | 14.0 | PASS | Street verge features mailbox, refuse bins, hedges, and sedans; yards feature tiered crates, patio cooler, and grill; interiors feature island counters, switch plates, and framed art. |
| 5 | B | 5. Technical hygiene | 15 | 12.75 | 13.5 | PASS | The critical Cycle 4 P0 blocker (hollow partition walls with see-through voids) and horizontal envelope light leaks are completely resolved with solid drywall and header panels; only a minor purple marker persists on south patio. |
| 5 | C | 1. Layout fidelity | 25 | 21.25 | 24.5 | PASS | Cul-de-sac macro layout, canonical team house color polarity (yellow south vs cyan-blue north), vehicle chokepoints, reciprocal sniper sightlines, and garage framing are authentic and canonical. |
| 5 | C | 2. Material and texture quality | 25 | 21.25 | 22.5 | PASS | Rich procedural hardwood plank flooring, butcher-block workbench slats, vehicle taillights/clearcoat glints, drywall lining, and shingle roofing present convincing material variety. |
| 5 | C | 3. Lighting and atmosphere | 20 | 17.00 | 18.5 | PASS | Warm directional sunlight, soft shadow penumbras, active vehicle headlight/taillight emissives, interior ceiling light panels, and garage fluorescent fixtures establish rich atmosphere without light leaks. |
| 5 | C | 4. Dressing density and reading distances | 15 | 12.75 | 14.0 | PASS | Street verge features mailbox, refuse bins, hedges, and sedans; yards feature tiered crates, patio cooler, and grill; interiors feature counters, switch plates, and framed art. |
| 5 | C | 5. Technical hygiene | 15 | 12.75 | 13.5 | PASS | All critical Cycle 4 P0 blockers (hollow partition walls with see-through voids and horizontal envelope light leaks) are completely resolved with solid drywall and header panels; second-story window apron gaps sealed; only a minor P1 purple marker entity persists on south patio. |
| 6 | A | 1. Layout fidelity | 25 | 21.25 | 24.8 | PASS | Cul-de-sac macro layout, team color polarity (yellow south vs cyan-blue north), vehicle chokepoints, reciprocal sniper sightlines, and garage framing are authentic and canonical. |
| 6 | A | 2. Material and texture quality | 25 | 21.25 | 24.0 | PASS | Both north and south rear ground-floor facades now carry full horizontal lap siding matching the upper levels; timber hardwood flooring, butcher-block bench, and vehicle lighting provide rich material variety. |
| 6 | A | 3. Lighting and atmosphere | 20 | 17.00 | 19.0 | PASS | Warm directional sunlight, soft cast shadows, vehicle headlight and taillight emissive blooms, interior ceiling panels, and soft mountain horizon gradients establish rich atmosphere. |
| 6 | A | 4. Dressing density and reading distances | 15 | 12.75 | 14.5 | PASS | Street verge features mailbox, refuse bins, hedges, and sedans; yards feature tiered cover crates, coolers, and grills; interiors feature counters, switch plates, wall art, and ceiling lights. |
| 6 | A | 5. Technical hygiene | 15 | 12.75 | 14.7 | PASS | The cycle 5 P1 defect (magenta/purple debug marker on south patio) is completely resolved. Solid drywall partitions, zero hollow gaps, zero light leaks, clean floor seams. |
| 6 | B | 1. Layout fidelity | 25 | 21.25 | 24.8 | PASS | Cul-de-sac macro geometry, team color polarity (golden-yellow south vs cyan-blue north), vehicle chokepoints, reciprocal sniper sightlines, and garage framing are authentic and canonical. |
| 6 | B | 2. Material and texture quality | 25 | 21.25 | 24.2 | PASS | High-quality hardwood flooring, butcher-block workbench slats, vehicle paint and specular glints, full exterior lap siding on both rear ground floors, and crisp architectural trim present exceptional procedural material variety. |
| 6 | B | 3. Lighting and atmosphere | 20 | 17.00 | 19.0 | PASS | Warm directional sunlight, natural shadow penumbras, active vehicle headlight and taillight emissives, ceiling light panels, and garage fluorescent fixtures establish rich atmosphere without light leaks. |
| 6 | B | 4. Dressing density and reading distances | 15 | 12.75 | 14.5 | PASS | Street verge features mailbox, refuse bins, hedges, and sedans; yards feature tiered crates, patio furniture, cooler, and grill; interiors feature island counters, switch plates, and framed art. |
| 6 | B | 5. Technical hygiene | 15 | 12.75 | 14.8 | PASS | The cycle 5 P1 defect (magenta/purple debug marker on south patio) is completely resolved; solid drywall partitions, zero hollow gaps, zero light leaks, and clean geometry across all captures. |
| 6 | C | 1. Layout fidelity | 25 | 21.25 | 24.8 | PASS | Cul-de-sac macro layout, team color polarity (golden-yellow south vs cyan-blue north), vehicle chokepoints, reciprocal sniper sightlines, and garage framing are authentic and canonical. |
| 6 | C | 2. Material and texture quality | 25 | 21.25 | 24.0 | PASS | Both north and south rear ground-floor facades now carry full horizontal lap siding matching the upper levels; timber hardwood flooring, butcher-block bench, and vehicle lighting provide rich material variety. |
| 6 | C | 3. Lighting and atmosphere | 20 | 17.00 | 19.0 | PASS | Warm directional sunlight, natural shadow penumbras, active vehicle headlight and taillight emissives, ceiling light panels, and garage fluorescent fixtures establish rich atmosphere without light leaks. |
| 6 | C | 4. Dressing density and reading distances | 15 | 12.75 | 14.5 | PASS | Street verge features mailbox, refuse bins, hedges, and sedans; yards feature tiered crates, patio furniture, cooler, and grill; interiors feature island counters, switch plates, wall art, and ceiling lights. |
| 6 | C | 5. Technical hygiene | 15 | 12.75 | 14.8 | PASS | The cycle 5 P1 defect (magenta/purple debug marker on south patio) is completely resolved; solid drywall partitions, zero hollow gaps, zero light leaks, watertight building envelopes, and clean contact seams across all captures. |

### Score trajectory summary

| Cycle | Critic A total | Critic B total | Critic C total | Mean total | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 77.0 | 74.0 | 74.0 | 75.0 | `CLAIMED` visual baseline below the 85-point total, with material, lighting, dressing, and technical gaps. |
| 2 | 85.0 | 83.0 | 84.0 | 84.0 | `CLAIMED` major art progress, but identity, dressing, and debug-artifact objections remain. |
| 3 | 0.0 | 0.0 | 0.0 | 0.0 | `VERIFIED` no capture set existed; the zeros are not a quality measurement. |
| 4 | 88.5 | 87.5 | 87.0 | 87.67 | `CLAIMED` art rows pass, but technical row remains below threshold because of drywall/envelope defects. |
| 5 | 93.0 | 93.0 | 93.0 | 93.0 | `CLAIMED` all rows pass; minor south-patio marker remains in every critic's rationale. |
| 6 | 97.0 | 97.3 | 97.1 | 97.13 | `CLAIMED` all rows pass and critics report the marker removed and rear siding completed. |

## Skeptic pass and findings

### F-01 - Missing breakable ground-floor glass lifecycle

`VERIFIED P1 - OPEN: fix before ship.` The addendum requires ground-floor glass to use the shipped breakable-window `breakableWindowId` and dynamic-collider path. Current `src/nuketown2-arena.ts:944-946` creates each ground pane with `ballisticMaterial: 'glass'` but no `breakableWindowId`, and `src/nuketown2-arena.ts:2133` returns `breakableWindows: []`. The shared `box()` API does support the option and forwards it to ballistic surfaces (`src/additional-maps.ts:96-150`), while the shipped Skyline implementation registers each dynamic pane and sets `userData.breakableWindowId` (`src/additional-maps.ts:3345-3353`). This is not the addendum's required dynamic behavior.

No runtime repair was attempted: converting the pane to `solid: false` would violate the existing ground-floor-solid contract, and inventing a dynamic lifecycle without the arena's destruction authority would be a non-small behavioral change.

### F-02 - Ground-floor glass blinds bot LOS

`VERIFIED P1 - OPEN: fix before ship.` Bot LOS in `src/legacy-main.ts:20385-20398` computes `solidLineOfSight` from `activeWorldColliders()`, and that path includes `activeArena.colliders` (`src/legacy-main.ts:3774-3789`). A direct build probe at the north ground-floor pane (`x=-4.6`, `y=1.55`, `z=-14` to `z=-8`) found one intersecting collider: the pane bounds `[-5.6, -3.6] x [1.0, 2.1] x [-10.18, -10.12]`. The same probe reported `breakableWindows: 0`; the pane mesh does carry a glass ballistic class, but its static movement collider remains in the bot LOS set. The existing fidelity test only checks that the pane is solid and has a glass surface (`src/nuketown2-fidelity.test.ts:769-803`); it does not prove bot LOS through it.

This directly fails addendum item 2. No repair was attempted because the correct fix must reconcile the dynamic collider, bot LOS, player movement, and breakable state together; weakening the static collider would break HF-435.

### F-03 - Coplanar instrument could pass with house-interior findings

`VERIFIED P1 - FIXED in 368f1f43.` The branch added `HOUSE-INTERIOR-FINDING` classification in `scripts/qa/find-coplanar-pairs.ts:160-166`, but the exit condition at the end only tested `findings === 0`. A non-zero house-interior count could therefore be printed while the command exited 0. The repair changes the condition to require both `findings === 0` and `houseInteriorFindings === 0`. The post-repair exact instrument remains zero, so this repair did not weaken or hide a current finding.

### F-04 - New TSL material vocabulary has no Nuke Town cold-session roster entry

`VERIFIED P1 - OPEN: obtain measured precompile evidence or add the correct authority entry before ship.` The Nuke Town source calls 25 new procedural material factories (`src/nuketown2-arena.ts:762-789`), backed by 24 factory definitions using `MeshStandardNodeMaterial` in the new material modules, with the lap-siding factory called twice. The only named cold-session precompile roster is `MEASURED_COLD_SESSION_FENCE_LOSERS = ['farcrysis']` (`src/rendering/cold-session-precompile-reach.ts:47-60`); `nuketown2` is absent. The transition only invokes that exact ScenePass precompile for `hadPreparedArena || coldSessionNeedsPrecompile` (`src/legacy-main.ts:29918-29922`). The existing generic final coverage precompile is real, but a fresh Nuke Town load can encounter its arena vocabulary in the fenced warm-frame path unless a measured authority entry covers it.

No repair was attempted. Adding Nuke Town to a measured-failure roster without a cold-session measurement would be an unsupported performance claim, and changing the fence or prewarm path would not be a small certain fix.

### F-05 - Final visual acceptance remains open in this constrained review

`CLAIMED / OPEN P1 evidence gap.` Cycle-6 critics report 97.0-97.3 totals and all five rows passing, but those scores are claims copied from the critic documents. Per instruction this review did not launch a browser or inspect the PNG pixels. The morning Opus review must inspect the immutable final capture set and manifest before treating the visual trajectory as release evidence. Cycle 3's absent captures are independently `VERIFIED`, not a quality pass.

### F-06 - No verified symmetry, fidelity, parity, originality, or frozen-light regression found

`VERIFIED PASS, subject to F-01 through F-05.` The fidelity test still pins the 4.7 m authored verge/kerb strip datum and its re-derived street bands (`src/nuketown2-layout.ts:75-91`, `src/nuketown2-fidelity.test.ts:343-360`), exact 180-degree house partner geometry, and the intentional asymmetric vehicle set. The test still verifies both stair directions complete, stay within the 2,400-frame budget, maintain ground contact, and use slope adjustment (`src/nuketown2-fidelity.test.ts:643-717`). It still verifies ground-floor panes are solid plus glass-ballistic, upstairs windows have no collider and can be exited (`src/nuketown2-fidelity.test.ts:769-866`), and the truck is open through its rear and both side mouths while retaining its structural cover (`src/nuketown2-fidelity.test.ts:444-505`). The diff re-derived the raised-floor/riser relation rather than removing these checks.

`VERIFIED PASS` the forest follow-up already landed before this delta: `forest-contact-skirts` has polygon offset factor and units `-3` (`src/nuketown-forest-surround.ts:370-393`), and the forest/mountain far-edge meshes remain in the coplanar instrument's unaudited list.

`VERIFIED PASS` the addendum's ground patch is represented by the paired `street lawn turning infill` tier-2 decal (`src/nuketown2-arena.ts:1684-1688`, `1795-1800`). The lawn blade instancer deliberately excludes IDs containing `infill` (`src/nuketown-lawn-field.ts:211-221`), but the visible paired decal is present and the coplanar output records both partner infill surfaces as fenced. This exclusion does not mean the patch is absent.

`VERIFIED PASS` no new runtime light objects or runtime light toggles were added in the changed Nuke Town source. The new warm/cold interior and vehicle light elements are emissive materials; no `PointLight`, `SpotLight`, `DirectionalLight`, or `HemisphereLight` construction was added. The visual definition continues to declare one emissive-only practical (`src/rendering/arenas/nuketown2.ts:84-95`).

`VERIFIED PASS` originality/provenance in changed source: the new facade, street, interior, and vehicle materials use procedural TSL/noise code and no texture, GLTF, image, or copied mesh import. The arena visual definition keeps `assetDependencies: []` (`src/rendering/arenas/nuketown2.ts:84-95`). The PNGs are evidence captures and were not treated as source assets.

`VERIFIED PASS with margin, not a release performance receipt.` The direct arena census found 697 total meshes, 287 visible meshes, 13 InstancedMeshes, 230 movement colliders, and 232 physics colliders. The visual definition's declared budget is 420 draw calls and 650,000 triangles (`src/rendering/arenas/nuketown2.ts:95`); the conservative visible-mesh upper bound was 287 draw calls and 221,347 triangles. The changed source has 25 new procedural NodeMaterial allocations plus one hidden ramp MeshBasicMaterial, and no added `requestAnimationFrame`, `setAnimationLoop`, or `performance.now()` allocation path. This is static headroom only; no GPU frame-pacing/browser receipt was generated.

### F-07 - Coach window-band dimensions changed without a numeric re-derivation

`VERIFIED P2 - later owner review.` The delta changes the presentation-only coach window band from `[c.length - 1.6, 0.8, 0.08]` at the Pass 92 base to `[c.length - 0.6, 0.9, 0.08]` (`src/nuketown2-arena.ts:1542-1545`). The surrounding comment explains the four-sided visual treatment, but the cycle-4 commit rationale is about lamp orientation and the fidelity test enumerates the presentation-only names without pinning these band dimensions. This does not change colliders or shot surfaces, and the pair/symmetry inventory still accounts for the band names; it is a fidelity-band bookkeeping gap, not a verified gameplay defect. No visual-uncertain revert was made.

### Symmetry-pair and band audit

`VERIFIED` the `pair()` helper emits the exact `(-x, y, -z)` partner from one authoring call (`src/nuketown2-arena.ts:576-606`). The fidelity test retains the explicit asymmetric vehicle list and its documented reasons (`src/nuketown2-fidelity.test.ts:1174-1236`). The layout band tests retain the 4.7 m strip and the 0.328/0.294 L road derivations. No symmetry pair or band test was removed or numerically loosened in the diff; the ground datum and stair riser were re-derived against the intentionally raised 0.08 m floor.

## Repair performed

One repair was safe and certain:

- `VERIFIED` commit `368f1f43`: `fix(nuketown2): luna pre-review - fail closed on house-interior coplanar findings`
- Explicit path: `scripts/qa/find-coplanar-pairs.ts`
- Change: include `houseInteriorFindings === 0` in the command exit condition.
- Trailer: `Co-Authored-By: Codex Luna 5.6 <noreply@openai.com>`
- `VERIFIED` pushed to `origin/contrib/dave-gaming-pc/claude/nuketown2-tiptop`.

The unresolved runtime items were deliberately not patched: breakable glass/bot LOS and cold-session precompile authority require coordinated behavior or measured evidence, not a guessed constant or a weakened fence.

## Required gates

The following are quoted from the commands run after the repair. No full Vitest suite, browser, or build was run.

```text
$ npx tsc --noEmit
Exit code: 0
```

```text
$ npx vitest run src/nuketown2-fidelity.test.ts src/collider-visual-parity-gate.test.ts src/arena-factory-registry.test.ts src/map-selection.test.ts src/graphics-profile-contract.test.ts src/legacy-main-size-ratchet.test.ts
Test Files  6 passed (6)
Tests  66 passed (66)
Exit code: 0
```

```text
$ npx tsx scripts/qa/find-coplanar-pairs.ts
# nuketown2 coplanar top-face pairs (HF-434 instrument)
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# COLLISION-ONLY SLOPES (audited by parity/traversal, excluded from horizontal top-face scan): 2 - nuketown2 north house stair ramp, nuketown2 south house stair ramp
# head 368f1f43
# boxes=646 ... pairs<=0.03m: 100 ... FINDINGS (different materials, no offset): 0 ... FENCED (material offset): 77 ... SAME-MATERIAL (benign): 23
# UNAUDITED meshes ...: 16 - nuketown2-lawn-region-0 (instanced), nuketown2-lawn-region-1 (instanced), nuketown2-lawn-region-2 (instanced), nuketown2-lawn-region-3 (instanced), nuketown2-lawn-region-4 (instanced), nuketown2-lawn-region-5 (instanced), nuketown2-lawn-region-6 (instanced), nuketown2-lawn-region-7 (instanced), forest-conifers (instanced), forest-broadleaf-trunks (instanced), forest-broadleaf-canopies (instanced), forest-understory (instanced), forest-contact-skirts (instanced), nuketown-mountain-foothills (non-box), nuketown-mountain-ridge (non-box), nuketown-mountain-far-range (non-box)
Exit code: 0
```

```text
$ npx tsx scripts/qa/audit-collider-visual-parity.ts
=== nuketown2: 0 invisible collider(s), 0 walk-through mesh(es) [232 colliders, 8 boundary, 0 runtime-replaced statics, 287 visible meshes]
Exit code: 0
```

The repository preflight was also attempted as required. The prescribed `--harness Codex` form exits 1 because this checkout's guard requires a lowercase slug. The lowercase equivalent exits 1 because the guard requires a `contrib/dave-gaming-pc/codex/<slug>` branch while the user-mandated branch is `contrib/dave-gaming-pc/claude/nuketown2-tiptop`. The lockfile subcheck was green in both attempts. This is a tooling/branch-contract mismatch, not a source-test failure.

## Verdict

# DO-NOT-SHIP

Three most important reasons:

1. `P1 / VERIFIED`: ground-floor panes are not registered as breakable dynamic windows, and `P1 / VERIFIED`: the same static pane collider blocks the authoritative bot LOS ray. This fails both glass-related addendum gates.
2. `P1 / VERIFIED and fixed`: the new coplanar instrument classification had a fail-open exit path. The repair is pushed, but the changed geometry still needs release-level evidence on the repaired exact SHA.
3. `P1 / VERIFIED`: 25 new procedural material instances are absent from the named Nuke Town cold-session precompile authority; a measured admission/precompile decision is still required. The visual score trajectory is also `CLAIMED` until Opus inspects the immutable captures.

The candidate is structurally healthy on the requested TypeScript/Vitest/collider-parity checks, retains the HF-434..437 stair/window/truck/kerb assertions, has zero current coplanar findings with no UNAUDITED-list growth, and has no verified frozen-light or provenance violation. Those positives do not close the three P1 release conditions above.
