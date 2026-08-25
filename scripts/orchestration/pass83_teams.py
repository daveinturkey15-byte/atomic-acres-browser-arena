#!/usr/bin/env python3
"""Pass 83 - the overnight pass, built from the owner's OWN WORDS after playing the build.

His verdict, 2026-08-25 19:00, verbatim:

    "atomic acres feels similar and maybe even regressed to yesterday that aint good for a
     start?"
    "and lots of invisible geometry, annoying"
    "hijacked looks like its needs alot of refinement and improvment too"
    "farcrysis is still a mess"
    "have really large swarms of ox alpha agents on max actually PLAYING the game,
     debugging it, doing the 3d work"
    "work continuously to get it to 100% of my spec and maybe even more, just make it
     amazing"

Four complaints, and every team here exists to answer one of them. Nothing in this file is
speculative polish - if a task does not trace to a sentence above or to a logged HF row,
it does not belong in this pass.

READ THESE FIRST. A three-way audit already produced file:line evidence and paste-ready
diffs for twenty of his logged requests:
    artifacts/cloud-audit/hf380-386.md
    artifacts/cloud-audit/hf387-393.md
    artifacts/cloud-audit/hf394-399.md

THE PATTERN THAT DOMINATES THIS PROJECT - now TEN instances in three days. Generated
portrait art the menu never rendered; farcrysisLightShafts() imported only by its own test;
fogDensityMultiplier and skyDarkenAmount orphaned; a RAY TRACED preset with no <option>; a
weather route that fell back to CLEAR; sun shafts compositing a DEFAULT MATERIAL as light
while telemetry reported "enabled"; farcrysisWadeSpeedScale; releaseHudSway;
auditSurfaceImpactCoverage; grovePositions. BEFORE BUILDING ANYTHING, check whether it
already exists unconnected: find the export, grep its importers, EXCLUDE *.test.ts. If its
only importer is its own test, you have found a whole feature for one import line.

THIS IS WHY HE SAYS BUILDS FEEL UNCHANGED. The work was done. It never reached his screen.
"Feels similar to yesterday" is the symptom of exactly this, and it is the single highest
value thing you can hunt tonight.

PLAY THE GAME. He asked for agents that actually play it. A test that passes while the
player walks into an invisible wall has told you nothing. Drive installed Chrome headless
over CDP (copy scripts/qa/verify-arena-boot-cdp.mjs), move the player, shoot, take
screenshots, and READ them. Headless installed Chrome gets a real hardware WebGPU device
and needs no browser slot; Playwright's bundled Chromium does NOT - it fails at
requestDevice, and every historic "green" taken with it was WebGL2 while the owner plays
WebGPU.
"""

SKILL_ROOT = r"C:\Users\david\.claude\skills"

SKILLS = {
    "invisible-geometry": ["atomic-acres-gameplay-patterns", "realtime-browser-qa",
                           "browser-game-runtime-debugging", "webgpu-tsl-arena-forging"],
    "atomic-acres-regression": ["atomic-acres-gameplay-patterns", "realtime-browser-qa",
                                "browser-game-runtime-debugging", "visual-gauntlet-loop"],
    "hijacked-refinement": ["webgpu-tsl-arena-forging", "atomic-acres-procedural-art-authoring",
                            "threejs-webgpu-water", "atomic-acres-asset-authoring"],
    "farcrysis-rebuild": ["threejs-procedural-vegetation", "threejs-webgpu-water",
                          "webgpu-tsl-arena-forging", "atomic-acres-procedural-art-authoring"],
    "playtest-and-debug": ["realtime-browser-qa", "browser-game-runtime-debugging",
                           "atomic-acres-gameplay-patterns", "hitl-candidate-verification"],
    "weapons-fidelity": ["atomic-acres-gameplay-patterns", "atomic-acres-asset-authoring",
                         "webgpu-tsl-arena-forging", "realtime-browser-qa"],
}

TEAMS = {
    "invisible-geometry": {
        "owns": ("src/map.ts, src/house-navigation.ts, src/arena-layout.ts, "
                 "src/destruction*.ts and their tests"),
        "tasks": [
            ("ig-hidden-fragments",
             "THE OWNER'S SECOND COMPLAINT, and the one with a named mechanism already: "
             "'lots of invisible geometry, annoying'. STRONG HYPOTHESIS, verify before you "
             "act on it: src/map.ts:463 sets rendered.visible = false on pre-authored house "
             "fragments and marks them userData.dynamicAuthorityReplacement = true, moving "
             "their collider into staticHouseFragmentColliders. That is deliberate - a runtime "
             "replacement is supposed to arrive. IF THAT REPLACEMENT NEVER SPAWNS, the player "
             "collides with a wall that is not drawn. Prove or disprove it by counting, at "
             "runtime, hidden fragments against spawned replacements. If they do not match, "
             "you have found his bug."),
            ("ig-collider-mesh-audit",
             "Do the MECHANICAL version of the same question across ALL SIX arenas, because a "
             "single named mechanism will not explain every instance. Walk the live scene: for "
             "every physics collider, is there a VISIBLE mesh whose bounds overlap it? Report "
             "the count per arena and dump the offenders with world coordinates. Then do the "
             "inverse, which the owner will notice just as fast: visible meshes the player "
             "walks THROUGH. Write this as a reusable QA script under scripts/qa/ so it "
             "becomes a permanent gate, not a one-off - this class of defect will come back "
             "every time an arena is rebuilt, exactly as the railgun spawn coordinates did."),
            ("ig-prone-and-wall-clip",
             "HF-387, his oldest unfixed complaint: 'clipping still happens if I go prone or "
             "near walls I still clip through them'. The viewmodel half was fixed today (the "
             "retreat was capped at 0.28 m while telemetry published the uncapped 0.78 m - "
             "read that commit). The PLAYER-BODY half is yours. Go prone against every wall "
             "type on atomic-acres and high-seas, in a real browser, and record where the "
             "camera enters geometry. Fix the solver, not the symptom, and do not raise a "
             "clearance constant without saying what it costs elsewhere."),
        ],
    },
    "atomic-acres-regression": {
        "owns": ("src/legacy-main.ts, src/gameplay.ts, src/gameplay-contract.ts, "
                 "src/nuketown-*.ts and their tests"),
        "tasks": [
            ("ar-find-the-regression",
             "HIS FIRST AND MOST IMPORTANT SENTENCE: 'atomic acres feels similar and maybe even "
             "regressed to yesterday'. Treat 'regressed' as literal and FIND IT. This is a "
             "bisect, not a vibe: git log the last 48 hours for commits touching atomic-acres "
             "geometry, lighting, spawns or movement, and compare the arena as it renders now "
             "against the same arena at yesterday's commit - same viewpoints, same preset, "
             "screenshots side by side. Known-suspicious already: nuketown-sightline-fidelity, "
             "gameplay-contract and grass-placement tests are RED at HEAD from a round that "
             "committed while it could not typecheck. Start there. Report the named commit. A "
             "named commit turns 'feels regressed' into a revert."),
            ("ar-two-x-core-unreachable",
             "HF-385, and it is NOT tuning despite his phrasing. AUDITED: OVERDRIVE_POSITION is "
             "(0, 0.82, 0) and the Pass 78 rebuild put CENTRAL_BUS - a solid 12.6 x 3.8 x 5.6 m "
             "collider - on the origin. Nearest standable point 3.25 m against a 1.65 m pickup "
             "radius; the roof is unreachable. The 2x Damage Core has been UNCLAIMABLE since "
             "the rebuild while legacy-main.ts:22686 still announces it as visible mid-map. "
             "artifacts/cloud-audit/hf380-386.md has three options with costs - pick one, state "
             "the trade, and guard reachability by DERIVING it from the live collider set. A "
             "hand-written position cannot know the map moved, which is how this happened and "
             "how the railgun spawns ended up outside the map."),
            ("ar-bo2-layout-and-vans",
             "HF-383. He asked for TWO things and got one: 'remove all the bulky items' AND "
             "'put the two vehicles that are open or whatever in the middle of the street'. "
             "Commit 0269334d moved the vans to the kerb - the opposite. Put them back in the "
             "street as playable cover without undoing the declutter. ALSO artifacts/"
             "aa-measure.txt:5-6 reports 'NAV NW->SE: NO ROUTE' and 'NAV NE->SW: NO ROUTE' on "
             "the current layout. If diagonal routes really are severed that is a bigger defect "
             "than any of this - check it FIRST and say so. NOTE artifacts/"
             "NUKETOWN-MEASUREMENT-2026-08-24.md is STALE; do not quote it."),
        ],
    },
    "hijacked-refinement": {
        "owns": "src/high-seas.ts, src/rendering/arenas/high-seas* and their tests",
        "tasks": [
            ("hj-refinement",
             "HIS THIRD COMPLAINT: 'hijacked looks like its needs alot of refinement and "
             "improvment too'. That is broad, so make it specific YOURSELF before changing "
             "anything: play the map in a real browser, capture the same viewpoints a player "
             "actually occupies (spawn, mid-deck, below deck, both ends), and write down the "
             "ten things that look worst. Fix them in that order and show before/after frames "
             "for each. Do not report 'improved lighting' - report what a player will now see "
             "that they did not before."),
            ("hj-windows-and-detail",
             "HF-392 verbatim: 'Hijacked has some issues with the windows in the top of the "
             "ship and some of the details'. The audit found addCabin at high-seas.ts:1599 is "
             "live and that commit 554a8f45 was a crash fix, NOT window work - so this row has "
             "never actually been done. Look at the windows at the top of the ship in a real "
             "frame and fix what is wrong with them."),
            ("hj-below-deck-readability",
             "Below deck is the darkest playable interior in the game and the arms fix was "
             "verified against it today (mean 101.1 against a 53.1 arena floor) - do NOT "
             "regress that. If you change interior lighting, re-measure with "
             "scripts/qa/capture-below-deck.mjs and report both numbers. Crushing shadows to "
             "look moody is the one change that hides a player, and combat readability "
             "outranks atmosphere every time."),
        ],
    },
    "farcrysis-rebuild": {
        "owns": ("src/farcrysis*.ts, src/water/**, src/rendering/arenas/farcrysis* "
                 "and their tests"),
        "tasks": [
            ("fr-still-a-mess",
             "HIS FOURTH COMPLAINT, unchanged from yesterday: 'farcrysis is still a mess'. "
             "AUDITED FACTS so you do not rediscover them: grass IS live (~103,600 Bezier "
             "blades) and the island was already grown 4x - those are NOT the problem. What IS: "
             "~25 of 39 vegetation layers still use PRE-RESCALE radii, which puts beach grass "
             "about 23 m INLAND of the actual beach. That is almost certainly what reads as "
             "'thrown together'. Re-derive every layer's radius from the CURRENT island extent "
             "- do not scale the old numbers by a constant - and make the shoreline bands "
             "follow the shoreline. Top-down and eye-level frames, before and after."),
            ("fr-no-mountains",
             "He pointed at cadle.gg for 'grass, trees, mountains are incredible'. AUDITED: "
             "there is NO mountain system at all - terrain maxes at 2.2 m, so the map has no "
             "horizon and no sightline variety. Build real elevation. HARD BOUND: farcrysis is "
             "already the slowest arena at 52-66 s cold boot and sits against a documented 12 s "
             "single-fence compile bound it only clears because 8.24 s is inside a yielding "
             "compileAsync. Measure boot before and after. If your relief pushes it over the "
             "bound you have broken the map to decorate it - and DO NOT raise the bound."),
            ("fr-water-and-wade",
             "HF-393 first, it is the cheapest win in the pass: farcrysisWadeSpeedScale EXISTS "
             "at farcrysis-terrain-authority.ts:116 and its ONLY importer is its own test. He "
             "said 'when you walk off the beach you fall down into the water so that needs to "
             "be smooth so you can sort of paddle'. Paste-ready diff in "
             "artifacts/cloud-audit/hf387-393.md near line 989 - verify line numbers, they "
             "have moved. THEN HF-394: the water has NO reflection and NO refraction and is "
             "excluded from the shared TSL ocean by water-authoring.ts:81. OCEAN_BANDS must "
             "stay identical between CPU and shader - hard project constraint."),
            ("fr-trees-untextured",
             "AUDITED: the 12 procedural tree species carry ZERO textures. On a map he wants "
             "'more jungle like', untextured trees are why it reads as programmer art no matter "
             "how many there are. Give them real material treatment. Use the "
             "threejs-procedural-vegetation skill and the technique register rows on foliage - "
             "they are there precisely for this."),
        ],
    },
    "playtest-and-debug": {
        "owns": "scripts/qa/**, tests/e2e/** and QA artifacts only - NO src/ edits",
        "tasks": [
            ("pt-actually-play-every-arena",
             "THE OWNER ASKED FOR THIS DIRECTLY: agents 'actually PLAYING the game, debugging "
             "it'. You do not edit src/. You PLAY, in installed Chrome headless over CDP with a "
             "real WebGPU device, and you file precise defects other teams can act on. For each "
             "of the six arenas: spawn, walk the whole playable area, go prone against walls, "
             "shoot every surface type, pick up weapons, trigger a killstreak, and SCREENSHOT "
             "throughout. Then READ the screenshots. Report every defect with arena, world "
             "coordinates, what you did, and what happened - file:line where you can find it. "
             "A defect report a team can reproduce in one step is worth ten vague ones."),
            ("pt-invisible-wall-sweep",
             "Specifically hunt the owner's complaint: walk into everything. Sweep each arena "
             "on a grid, log every position where movement is blocked, and cross-reference "
             "against what is VISIBLE at that position from the player camera. Produce a map of "
             "invisible walls with coordinates. Hand it to invisible-geometry; do not fix it "
             "yourself, you do not own src/."),
            ("pt-regression-vs-yesterday",
             "He said atomic-acres may have REGRESSED. Build the instrument that answers that "
             "question repeatably: capture fixed viewpoints on every arena at a given commit, "
             "and diff them against the same viewpoints at another commit. Put it in scripts/qa/ "
             "so it can run every round. Right now nothing in this repo can answer 'is it worse "
             "than yesterday', which is exactly the question he keeps asking."),
        ],
    },
    "weapons-fidelity": {
        "owns": ("src/weapons*.ts, src/ballistics*.ts, src/flamethrower*.ts, "
                 "src/killstreak-runtime.ts and their tests"),
        "tasks": [
            ("wf-crimson-flamethrower-fire",
             "OWNER REQUEST, verbatim and specific: 'ensure crimson flamethrower has same fire "
             "style as the original btw, just with the adjusted dmg?'. So the VISUAL fire "
             "effect must match the original flamethrower exactly - same particles, same "
             "colour ramp, same spread, same lifetime - and ONLY the damage numbers differ. "
             "Find both, diff their effect parameters, and make the crimson variant reuse the "
             "original's effect rather than carrying a divergent copy. If they already share "
             "it, say so and show the shared call. Capture both firing, side by side, as "
             "proof - this is a VISUAL claim and only a frame can settle it."),
            ("wf-penetration-coverage",
             "HF-390. AUDITED: 100 farcrysis meshes carry NO penetration tag, and the gate at "
             "ballistics.test.ts:169 SKIPS 2 OF 6 ARENAS - so every coverage number quoted so "
             "far was measured over two-thirds of the game. Extend the gate to all six FIRST so "
             "the real number is visible, report it honestly however bad, then close the gap. "
             "Do not weaken the gate to improve the number."),
            ("wf-world-hit-feedback",
             "HF-386 was audited as WIRED for all three sub-behaviours, but ONLY STATICALLY - "
             "the auditor flagged that a HUD z-index collision would not show up in source "
             "(zero-hit-feedback.ts:63 is z-index 19 while other layers reach 95). So go and "
             "LOOK: shoot the floor with an ordinary gun and with the chopper gunner, and "
             "confirm the impact marker, the sound and the zero-damage indicator all actually "
             "appear on screen. scripts/qa/verify-hf386-zero-hit-cdp.mjs is the instrument."),
        ],
    },
}
