#!/usr/bin/env python3
"""Pass 82 - the 3D blitz. Owner directive 2026-08-25 16:20:

    "once we hit 1645, spin up as many omp ox alpha sub agents as possible to blitz all
     the 3d work, claude should only orchestrate as we have low usage"

So the team set is weighted to WORLD, MODEL and MATERIAL work rather than plumbing, and
every task carries the coordinates a three-way cloud audit already established. Those
reports are the difference between this pass and a briefing:

    artifacts/cloud-audit/hf380-386.md   (732 lines)
    artifacts/cloud-audit/hf387-393.md   (1086 lines)
    artifacts/cloud-audit/hf394-399.md   (802 lines)

They contain file:line evidence and paste-ready diffs. READ YOUR ROW BEFORE YOU DESIGN
ANYTHING - the work of finding the defect is already done and paid for, and re-deriving it
is the one way to waste this pass.

THE PATTERN THAT DOMINATES THIS PROJECT. Nine separate instances of BUILT-NOT-WIRED have
now been found in three days: generated portrait art the menu never rendered;
farcrysisLightShafts() imported by nothing but its own test; fogDensityMultiplier and
skyDarkenAmount orphaned; a RAY TRACED preset with no <option>; a weather route that fell
back to CLEAR; sun shafts compositing a DEFAULT MATERIAL as light while telemetry said
"enabled"; farcrysisWadeSpeedScale; releaseHudSway; auditSurfaceImpactCoverage.

Before you build anything new, check whether it already exists and is simply not connected.
The test: find the export, grep its importers, EXCLUDE *.test.ts. If its only importer is
its own test, you have found a whole feature for the cost of one import line. That is the
highest-value work available in this repo and it is why the owner keeps saying builds feel
unchanged - the work was done, it just never reached his screen.
"""

SKILL_ROOT = r"C:\Users\david\.claude\skills"

SKILLS = {
    "arms-animation": ["game-animation-asset-pipeline", "local-video-generation",
                       "atomic-acres-asset-authoring", "realtime-browser-qa",
                       "browser-game-runtime-debugging"],
    "farcrysis-world": ["threejs-procedural-vegetation", "threejs-webgpu-water",
                        "webgpu-tsl-arena-forging", "atomic-acres-procedural-art-authoring"],
    "nuketown-world": ["atomic-acres-gameplay-patterns", "webgpu-tsl-arena-forging",
                       "atomic-acres-procedural-art-authoring", "realtime-browser-qa"],
    "operator-identity": ["ai-3d-asset-generation-loop", "comfyui", "img2threejs",
                          "game-animation-asset-pipeline", "atomic-acres-asset-authoring"],
    "materials-penetration": ["atomic-acres-gameplay-patterns", "webgpu-tsl-arena-forging",
                              "atomic-acres-asset-authoring", "realtime-browser-qa"],
    "hud-cascade": ["game-hud-menu-overhaul", "threejs-frame-loop-audit",
                    "visual-gauntlet-loop", "realtime-browser-qa"],
}

TEAMS = {
    "arms-animation": {
        "owns": ("src/operator-model.ts, src/animation*.ts, src/rigged-*.ts, "
                 "src/weapon-presentation*.ts and their tests"),
        "tasks": [
            ("aa-arm-tracks-stripped",
             "HF-388, and it is ARCHITECTURAL - the audit deliberately did not invent a small "
             "fix, and neither should you until you have read artifacts/cloud-audit/hf387-393.md. "
             "Three separate defects compound: operator-model.ts:102 has a filter that STRIPS "
             "EVERY ARM-CHAIN TRACK from the loaded clips; 7 of 13 clips are therefore never "
             "played at all; and restoreRiggedArmBindPose (weapon-presentation.ts:4326) destroys "
             "the mixer's output before IK runs, so even surviving tracks are overwritten. "
             "The arm MATERIAL was fixed separately today and is NOT your problem - do not touch "
             "FIRST_PERSON_ARM_* constants or the viewmodel fill light, both are correct now. "
             "Design the fix as a whole before writing any of it, say which of the three you are "
             "changing and why, and CAPTURE FRAMES of the arms actually moving. The owner's words "
             "are 'the animations are better but they still need some work' - he is looking at "
             "motion, so a still frame proves nothing here. Record a short capture sequence."),
            ("aa-stance-cache-stale",
             "HF-388 companion, small and precise, paste-ready diff already in the audit: "
             "legacy-main.ts:27593 PERSISTS the carry stance but never calls "
             "setActiveOperatorStance, so the chosen stance does not reach the arms until a "
             "reload. NOTE legacy-main.ts is owned by NO team this pass, so you may edit it - "
             "but it is 30k+ lines and other lanes read it; change only the lines the audit "
             "names and say so in your commit."),
            ("hc-clipping-telemetry-lies",
             "HF-387, the owner's 'clipping still happens if I go prone or near walls'. AUDITED "
             "FACT with a nasty twist: the viewmodel retreat is CAPPED at 0.28 m "
             "(weapon-presentation.ts:670, applied at :4801) while the profile allows 0.78 m "
             "(weapon-presentation-state.ts:113) - and telemetry() at weapon-presentation.ts:3825 "
             "publishes the UNCAPPED value. So every instrument reading that telemetry has been "
             "reporting a retreat the renderer never performed, which is why this keeps being "
             "called fixed. Fix the telemetry to report what actually happens FIRST - otherwise "
             "you cannot measure your own change - then decide whether the cap or the profile is "
             "wrong. Keep this SEPARATE from your animation commit - a retreat cap and a "
             "track filter are unrelated defects that happen to share a module, and merging "
             "them makes both harder to revert."),
        ],
    },
    "farcrysis-world": {
        "owns": ("src/farcrysis*.ts, src/water/**, src/rendering/arenas/farcrysis* "
                 "and their tests"),
        "tasks": [
            ("fw-wade-not-wired",
             "HF-393, and it is the cheapest win in this pass. The owner said 'when you walk off "
             "the beach you fall down into the water so that needs to be smooth so you can sort "
             "of paddle'. farcrysisWadeSpeedScale ALREADY EXISTS at "
             "farcrysis-terrain-authority.ts:116 and its ONLY importer is its own test. The "
             "feature was built and never connected. A paste-ready two-part diff (the import, and "
             "the call site next to the existing samplePhysics call) is in "
             "artifacts/cloud-audit/hf387-393.md around line 989. Verify the diff against current "
             "line numbers rather than trusting them - other lanes have been editing. Then walk "
             "into the water on real WebGPU and confirm it reads as a wade, not a fall."),
            ("fw-no-mountains",
             "The owner asked for farcrysis to be 'more jungle like' and pointed at cadle.gg for "
             "'grass, trees, mountains are incredible'. AUDITED FACT: there is NO mountain system "
             "at all - the terrain maxes out at 2.2 m. Grass is genuinely live (~103,600 Bezier "
             "blades over 108x108 m) and the island was already grown 4x, so those are NOT your "
             "task. Elevation is. Build terrain relief that gives the map a horizon and sightline "
             "variety without breaking the existing collision mesh or the grass field's placement "
             "assumptions. Measure the boot-time cost before and after: farcrysis is ALREADY the "
             "slowest arena at 52-61 s cold, and it sits against a documented 12 s single-fence "
             "compile bound that it only clears because 8.24 s is inside a yielding compileAsync. "
             "If your relief pushes it over, you have broken the map to decorate it."),
            ("fw-vegetation-radii",
             "AUDITED FACT, and probably the real reason the owner says the mid-map 'assets just "
             "feel a bit thrown together': ~25 of 39 vegetation layers still use PRE-RESCALE "
             "radii from before the island was grown 4x. The concrete symptom is beach grass "
             "sitting about 23 m INLAND of the actual beach. Re-derive every layer's radius from "
             "the current island extent rather than scaling the old numbers by a constant, and "
             "make the shoreline bands actually follow the shoreline. Capture a top-down and an "
             "eye-level frame before and after."),
            ("fw-water-quality",
             "HF-394. AUDITED FACT: farcrysis water has NO reflection and NO refraction, and is "
             "EXCLUDED from the shared TSL ocean by water-authoring.ts:81. Decide deliberately "
             "whether to bring it into the shared ocean or give it its own treatment, say which "
             "and why, and be careful: OCEAN_BANDS must stay identical between CPU and shader - "
             "that is a hard project constraint, not a style note. Use the threejs-webgpu-water "
             "skill. Measure frame cost; water that halves the frame rate is not an improvement."),
        ],
    },
    "nuketown-world": {
        "owns": ("src/arena-layout.ts, src/map.ts, src/house-navigation.ts, src/overdrive.ts, "
                 "src/nuketown-*.ts and their tests"),
        "tasks": [
            ("nw-core-sealed-in-bus",
             "HF-385, and it is NOT a tuning task despite the owner phrasing it as 'the 2X damage "
             "needs adjusting'. AUDITED FACT: OVERDRIVE_POSITION is (0, 0.82, 0) and the Pass 78 "
             "rebuild put CENTRAL_BUS - a solid 12.6 x 3.8 x 5.6 m collider - on the origin. "
             "Nearest standable point is 3.25 m against a 1.65 m pickup radius and the bus roof "
             "is unreachable. The 2x Damage Core has been UNCLAIMABLE since the rebuild, while "
             "legacy-main.ts:22686 still announces '2X DAMAGE CORE ONLINE - VISIBLE MID-MAP ICON'. "
             "The map is 180-degree symmetric about the origin, so every fix trades symmetry, "
             "visibility or scope - artifacts/cloud-audit/hf380-386.md gives three options with "
             "costs. PICK ONE, implement it, and state the trade you made in the commit. Then add "
             "a guard that DERIVES reachability from the live collider set rather than pinning a "
             "coordinate - a hand-written position cannot know the map moved, which is exactly "
             "how this happened, and how the railgun spawns ended up outside the map too."),
            ("nw-vans-mid-street",
             "HF-383, the half the owner asked for and did not get. His words were 'remove all "
             "the bulky items that are in the way of stuff' AND 'put the two vehicles that are "
             "open or whatever in the middle of the street'. Commit 0269334d moved the two vans "
             "FROM mid-road TO kerb-side to answer the declutter half - deliberate, but the "
             "opposite of the other half. Put them back in the street as PLAYABLE COVER: enterable "
             "or shootable-through where that is what 'open' meant, positioned so they break the "
             "long sightline without blocking the route. Do not undo the declutter. Check "
             "nuketown-traversal tests still pass and that both routes stay connected."),
            ("nw-scale-and-routes",
             "HF-383 remainder plus a live contradiction worth resolving first. The owner asked "
             "for the map 'a tad bigger because it feels a little bit clustered'; the audit says "
             "the scale-up is blocked by a test and could not confirm whether four named test "
             "files are red at HEAD (last commit to touch arena-layout.ts is c736d48c 'gate "
             "REGRESSED'). RUN THOSE FIRST and report their state before you change anything. "
             "SEPARATELY: artifacts/aa-measure.txt:5-6 reports 'NAV NW->SE: NO ROUTE' and 'NAV "
             "NE->SW: NO ROUTE' on the current layout, contradicting the measurement doc's 'fully "
             "connected'. If diagonal routes really are severed, that is a bigger gameplay defect "
             "than the size and it takes priority. NOTE artifacts/NUKETOWN-MEASUREMENT-2026-08-24.md "
             "is STALE - written before the declutter landed. Do not quote it."),
        ],
    },
    "operator-identity": {
        "owns": ("src/operator-skin-catalog.ts, src/operator-appearance-catalog.ts, "
                 "scripts/blender/**, source-assets/art-gen/** and their tests"),
        "tasks": [
            ("oi-character-silhouettes",
             "HF-380, the owner's oldest unmet ask: 'the operations do not look like what I "
             "specced and wanted, with venom, lara croft etc?'. AUDITED FACT, decisive: decoding "
             "the glTF of all three skin GLBs shows THE SAME FOUR BASE MESH NAMES in every file "
             "(Cube.018/024/037/023). It is one shared male tactical body plus bolt-on Blender "
             "accessory props plus recoloured textures. There is no female body and no character "
             "silhouette anywhere in the deliveries. Meanwhile the 2D CARD ART ALREADY READS as "
             "Lara Croft and Venom - source-assets/art-gen/hf380-jobs.json literally prompts for "
             "them, and those portraits ship and render. So the mismatch is 2D vs 3D. "
             "THE BLOCKING PREREQUISITE, stated plainly: the current Blender script "
             "(create-pass74-operator-archetype-skins.py) CANNOT produce a different silhouette "
             "by construction. Changing palettes again will not help - that was commit 84037dd9 "
             "and it is why this row is still open. You need a character-shaped body that still "
             "satisfies the 62-joint rig contract, or the catalog throws at module load. Start by "
             "proving you can generate ONE distinct silhouette on that rig; if you cannot, say so "
             "with evidence rather than shipping another recolour. Use ai-3d-asset-generation-loop "
             "and game-animation-asset-pipeline. The owner has an RTX 5080 and ComfyUI locally."),
            ("oi-bot-skin-identity",
             "Carried from Pass 81, still true: bots are built with the 'neon-purple' appearance "
             "and materialForTeam overrides swat/swat_black/grey with fixed purple, so the only "
             "per-skin COLOUR reaching a bot is the visor. That purple is a deliberate "
             "team-readability choice - do NOT simply remove it. Carry per-skin identity through "
             "silhouette, material finish, kit shape or accent placement instead, without losing "
             "instant friend/foe reads. Measure friend/foe discriminability before and after."),
        ],
    },
    "materials-penetration": {
        "owns": ("src/ballistics*.ts, src/surface-impact-registry.ts, "
                 "src/material-penetration*.ts and their tests"),
        "tasks": [
            ("mp-untagged-meshes",
             "HF-390. The owner asked to 'make sure certain things that should have penetration "
             "on them like wood brick glass or whatever ... that's all up to date on all the "
             "assets we have'. AUDITED FACT: 100 farcrysis meshes carry NO penetration tag "
             "(farcrysis-physics.ts:142 against the fixed values at farcrysis.ts:179-180), and "
             "the gate at ballistics.test.ts:169 SKIPS 2 OF 6 ARENAS - so the coverage number "
             "everyone has been quoting is measured over two-thirds of the game. Extend the gate "
             "to all six arenas FIRST so you can see the real number, report it honestly however "
             "bad it is, then close the gap. Do not weaken the gate to make the number look "
             "better; that is the one move that is never the fix here."),
            ("mp-impact-registry-dead",
             "auditSurfaceImpactCoverage (surface-impact-registry.ts:67) has exactly one importer "
             "- its own test. Another BUILT-NOT-WIRED. Find out what it was meant to guard, then "
             "either wire it into the real coverage gate or delete it with a reason. A dead "
             "auditor is worse than none, because its existence implies coverage is being checked."),
        ],
    },
    "hud-cascade": {
        "owns": ("src/ui/**.css, src/ui/pass77-hud-sway.ts, src/bootstrap.ts and their tests"),
        "tasks": [
            ("hc-chopper-regression",
             "HF-389, and the audit has ALREADY SOLVED IT - your job is to land the fix carefully, "
             "not to re-investigate. The owner said 'the HUD from the helicopter has regressed'. "
             "MECHANISM: pass65-hud.css:1 wraps the whole chopper cockpit in @layer pass65.hud, "
             "and bootstrap.ts:6-18 deliberately imports three later sheets UNLAYERED so they "
             "outrank every layer regardless of specificity. Commit 2050e5eb (2026-08-23 07:16) "
             "was the first to reach into the cockpit from an unlayered sheet "
             "(pass75-hud-redesign.css:236-243); 3b79d9a2 added pass77-instrument-hud.css:658-667, "
             "which wins. Their 'border: 1px solid' and 'background-image:' overwrite pass65's "
             "border-block-only green hairline and edge-fading gradient, turning two diegetic "
             "canopy rails into rounded opaque blurred cards. DO NOT revert either commit "
             "wholesale - that would undo the whole HUD redesign. Surgical diffs for both sheets "
             "are in artifacts/cloud-audit/hf387-393.md. "
             "AND FIX WHY IT WENT UNSEEN: pass70-chopper-gunner-contract.test.ts:6 reads ONLY the "
             "layered sheet, so it stayed green through the entire regression. A contract test "
             "that cannot see the sheet that wins is not a contract. Make it read the composed, "
             "winning style - the Pass 79 sweep did exactly this by walking computed DOM styles "
             "in headless Chrome, so copy that approach rather than inventing one."),
            ("hc-hud-sway-not-wired",
             "HF-391. The owner likes the HUD bounce but says it is inconsistent across maps and "
             "'maybe like double the speed it should'. TWO SEPARATE THINGS, do not conflate them. "
             "(1) releaseHudSway (pass77-hud-sway.ts:311) is BUILT-NOT-WIRED - only its own test "
             "imports it. Paste-ready diff in the audit. (2) legacy-main.ts:28277 feeds the sway "
             "'deltaMs: rawFrameMs' - the RAW frame time, while the rest of the frame clamps to "
             "50 ms. That is the strongest candidate for both the double-speed feel and the "
             "per-map difference, and it is a one-line change to test. HONEST GAP the audit "
             "reported: it could NOT reproduce the per-map difference from code - ship motion, "
             "movement speed and impact response are all ruled out by grep, and frame pacing alone "
             "measures ~1 px at these frame rates. So this row needs a HEADED SIDE-BY-SIDE "
             "capture on two maps before you conclude anything. Note HF-391 calibration already "
             "landed in 7c0a6219 - read it before re-tuning."),
        ],
    },
}
