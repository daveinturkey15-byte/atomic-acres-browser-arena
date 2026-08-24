#!/usr/bin/env python3
"""Team definitions for the Pass 79 blitz.

Two layers, by the owner's design:
  - CLAUDE orchestrates, reviews and integrates (judgement, cross-team wiring).
  - OMP/ox-alpha does the volume (5-10 agents per team, several teams at once).

FILE OWNERSHIP IS DISJOINT ACROSS TEAMS BY CONSTRUCTION. That is the only thing
preventing 45 concurrent writers from destroying each other's work in one worktree.
src/legacy-main.ts is the exception every project has: it is the integration point, so
exactly ONE team (mp-core) may write it, and every other team hands its wiring over as a
patch for the integration owner to apply.

Each team spec is builders + a critic that `depends_on` all of them. The critic is not a
formality: this project's single most expensive recurring failure is code that ships
correct, tested, and reachable by nothing at all.
"""

BUILDER_PREAMBLE = """Read these before doing anything, in order:
1. C:/Users/david/projects/atomic-acres-gauntlet/GAUNTLET-SPEC.md - four failure modes
   that have each cost this project a rejected build.
2. C:/Users/david/projects/atomic-acres-gauntlet/artifacts/OWNER-REQUESTS-LAST-3-DAYS.md
   - the owner's own words. Find your HF rows.
3. C:/Users/david/projects/atomic-acres-gauntlet/artifacts/RESOURCES-AND-TECHNIQUES-2026-08-24.md
   - techniques he shared, already read and distilled with working parameters.

THE RULE THAT MATTERS MOST: green tests are NOT evidence a player can see your change.
Four separate systems here shipped fully unit-tested and imported by nothing - the
animation director, the particle system, setOperatorSkin(), and four photoreal portraits
that sat on disk while the menu drew a placeholder the owner called "so stupid". Trace
your change to a LIVE CALL SITE and name it in your report, or write NOT WIRED and say why.

HARD RULES:
- Never weaken a test, gate, threshold or timeout to get green. A test change must pin
  NEW behaviour at EQUAL OR GREATER strictness and you must say you proved it red first.
  A mechanical regression gate runs after you and WILL catch a lowered bar.
- Never fabricate a measurement or claim a command you did not run. "I could not verify
  this" is a respected answer; a confident false claim is the most expensive thing you
  can produce.
- NEVER run 'git add -A'. Many agents share this worktree. Stage explicit paths only.
- Do not push, merge or deploy. Do not touch ports 41900/41901.
- No Math.random in state networked peers must agree on - derive from the seeded match
  RNG (hostId:matchEpoch) or host and guest desync.
- Work ONLY on files your team owns (listed below). Anything else goes in your report as
  a paste-ready patch with line anchors.

VERIFY: 'npx tsc --noEmit' clean and 'npx vitest run' on your own tests. Headless CANNOT
create a WebGPU device on this machine - every historic "green" was WebGL2 while the
owner plays WebGPU. For anything visual or gameplay-facing, drive installed Chrome over
CDP: copy scripts/qa/verify-arena-boot-cdp.mjs. Then CAPTURE FRAMES AND READ THEM.

YOUR ASSIGNMENT:
"""

CRITIC_PREAMBLE = """You are the CRITIC for a team of agents that has just finished. Your
job is to falsify their claims, not to summarise them. Assume good faith and bad memory.

For every claim the builders made, answer with evidence:
1. Is the change actually WIRED? Find the live call site yourself. A module imported only
   by its own test is DEAD - say so plainly. This is the failure mode that has burned
   this project four times.
2. Was any test, gate or threshold WEAKENED to get green? Diff the test files against
   git HEAD and check. Report any lowered bar as a defect regardless of what the builder
   said about it.
3. Does 'npx tsc --noEmit' pass, and does 'npx vitest run' show no NEW failures?
4. Is any claimed measurement reproducible? Re-run at least one and compare.

Do not fix anything. Produce a verdict per claim: CONFIRMED, UNWIRED, WEAKENED-GATE,
UNREPRODUCIBLE, or FALSE. Be specific with file paths and line numbers. A clean report
that missed a dead module is worse than useless.

THE TEAM'S CLAIMS AND CONTEXT:
"""

TEAMS = {
    "mp-core": {
        "owns": "src/legacy-main.ts (EXCLUSIVE - no other team may write it), src/network*.ts, src/lobby*.ts, src/private-match.ts, src/host-migration.ts, src/client-world-repair*.ts, src/team-*.ts, src/killstreak-*.ts, and their tests",
        "tasks": [
            ("mp-repro-matrix", "Build the definitive host+guest reproduction matrix and RUN it. Two real browser windows, real key input, every arena, both TDM and FFA. The pattern to copy is scripts/qa/verify-hf347-arena-movement-matrix.mjs. For EACH of the owner's reported problems, report REPRODUCED or NOT-REPRODUCED with evidence: 'cant move alot in host and guest lobby', 'game starts before all people join', 'cant type in lobby', 'cant move when spawn into rustrig', 'sometimes randomly cant shoot or reload my gun or after picked one up', 'when chopper gunner is flying and I am against it or on the same team but not controlling it I am very laggy'. Do not fix anything in this task - the matrix and honest verdicts ARE the deliverable, and every later task depends on knowing which faults are real."),
            ("mp-admission", "The admission handshake. A prior fix parked and replayed the admission triple (join, reliable state, killstreak-loadout-intent) that onNetworkMessage silently discarded at 'if (!gameStarted) return' while a peer was still loading. Verify that fix is still present and sufficient. A KNOWN RESIDUAL remains: acknowledgement lands after the 5s bound on this machine, so the guest takes one death at spawn and auto-respawns ~1.9s later, leaving a permanent status line accusing a healthy host. Forensics recorded: failure at 24614ms, first host contact 19059ms, attempts 1 of 2 - the client had a retry in hand and never used it, because sendClientWorldRepairReady is driven only by an incoming host snapshot. A previous agent wrote the timer-driven retry, the next run wedged, and it reverted rather than ship an unproven change to admission code. Finish that properly."),
            ("mp-movement", "Guest and host movement parity on every arena, especially the reported RustRig spawn freeze. Prove with real key input in two windows that both roles can move, on every map."),
            ("mp-visibility", "Everyone must be SEEN by everyone. Verify remote player presentation, interpolation and spawn visibility for both roles on every arena. Report the remotes count each peer observes."),
            ("mp-weapons", "'sometimes randomly cant shoot or reload my gun or after picked one up'. A known named cause exists: viewmodel-contact-raise (HF-343, src/weapon-presentation-state.ts) refuses the trigger outright and was measured blocking the HOST 3/3 at spawn on atomic-acres. The owner asked for a BALANCE there, not removal. Note weapon-presentation-state is owned by the combat team - reproduce and diagnose here, hand them the patch."),
            ("mp-chopper-lag", "'when chopper gunner is flying and I am against it or on the same team but not controlling it I am very laggy'. Reproduce with a chopper active and a second peer observing, measure the frame cost on the NON-controlling peer, find what is being replicated or presented per-frame that should not be, and fix it."),
            ("mp-lobby-flow", "Lobby correctness: teams prescribed in TDM with no colour or name picking (owner's explicit instruction), FFA as the lobby default, match must not start before everyone has joined, and late-joiner handling. Verify each against a real two-window run."),
            ("mp-host-migration", "Host migration must hand over authority when the host drops instead of kicking everyone. HOST_SUCCESSION_MANDATE_TTL_MS was once mis-derived so promotion was unreachable. Verify it fires end to end in a real two-window run, including the succession mandate and mirror freshness."),
        ],
    },
    "farcrysis": {
        "owns": "src/farcrysis*.ts, src/rendering/arenas/farcrysis.ts, new vegetation/terrain/grass modules, and their tests",
        "tasks": [
            ("fc-size", "HF-396: make the arena 3-4x its current area. Report before/after dimensions in metres. The single terrain authority MUST be preserved - the physics surface follows the authored terrain, and an earlier bug had a flat collision floor under sculpted hills so players walked inside the island. Also measure arena boot before and after: farcrysis is already the slowest to deploy (~45-51s vs 28-35s) and there is a hard 4s cold-compile admission fence."),
            ("fc-grass", "HF-396: the owner asked for GRASS explicitly. Section 2 of the resources file distils an MIT procedural grass system - instanced Bezier blades, layered wind (global sway plus rolling gusts plus per-blade turbulence), subsurface scattering for backlit translucency, slope-aware placement, distance LOD, a TROPICAL preset. Implement an equivalent natively; do not add an npm dependency without justifying it. State your instanced draw count and per-frame allocation (target zero). Density must never conceal an enemy - state the bound you enforce."),
            ("fc-jungle", "HF-396/HF-398: 'a little bit more jungle like'. The owner points at cadle.gg as the bar - 'the grass, trees, mountains are incredible'. Build layered jungle: canopy, midstorey, undergrowth, with instanced vegetation constrained by terrain slope and height. Register row 8 records an MIT fully-procedural jungle case study already assimilated into the threejs-game-development skill - read it."),
            ("fc-water-look", "HF-394: 'the water needs to look better'. HARD CONSTRAINT: OCEAN_BANDS must be identical CPU-side and in-shader, and water level/swimmable/amplitudeScale are host-authoritative and profile-invariant. Improve appearance without touching those semantics."),
            ("fc-beach-wade", "HF-393: 'when you walk off the beach you fall down into the water so that needs to be smooth so you can sort of paddle'. Today it is a FALL. Make it a wade: shelving seabed, progressive wade depth that slows movement, then swim engaging smoothly. The swim reducers already exist and are host-authoritative - the fault is terrain shape and transition. scripts/qa/verify-farcrysis-ground-contract.mjs walks the beach; read its header first, it documents three ways an earlier version of it lied."),
            ("fc-composition", "HF-395: 'all the assets in the middle of the map just feel a bit thrown together they're not very well coordinated so that probably needs to be redone'. Section 4 of the resources file diagnoses exactly this: brittle absolute-coordinate placement produces scenes that look scattered. Re-compose the middle of the map with RELATIONAL placement - aligned, distributed, grouped into readable landmarks with intent."),
            ("fc-perf", "Guard the budget for the whole team. Farcrysis arena construction was taken 13.4s -> 2.5s by memoising a value-noise lattice (V8 cannot use its fast sin path at ~1e11 magnitude and falls back to full Payne-Hanek reduction). Do not regress that. Measure draw calls, unique materials, shadow casters and pipeline count before and after the team's work, and report the numbers."),
            ("fc-audit", "Run the arena forging review on the enlarged map: no floating geometry, no buried props, safe spawns, no out-of-bounds escapes, sane sightlines. Use the 8-view / 45-degree / 1024x1024 / 15-degree-elevation critic protocol from section 4 of the resources file, and cross-reference what you see against program state so you do not report a hallucinated defect."),
        ],
    },
    "nuketown": {
        "owns": "src/rendering/arenas/atomic-acres.ts, src/arena-layout.ts, src/additional-maps.ts, and their tests",
        "tasks": [
            ("nt-measure", "MEASURE FIRST, and this measurement is the deliverable every other nuketown task depends on: current footprint in metres, route topology, corner-to-corner traversal time at the game's real movement speed, and side-to-side symmetry. Then list every divergence from BO2 Nuketown with coordinates. Change nothing in this task."),
            ("nt-vehicles", "HF-383: 'put the two vehicles that are open or whatever in the middle of the street'. The two vehicles mid-road are BO2 Nuketown's signature central hard cover. Place them so they actually function as cover - sightline breaks, mantle-able, not a movement trap."),
            ("nt-declutter", "HF-383: 'remove all the bulky items that are in the way of stuff'. Identify every prop obstructing movement or a sightline that should be open, and remove or resize it. Name each one and say why it went."),
            ("nt-scale", "HF-383: 'maybe make it a tad bigger because it feels a little bit clustered'. Scale up, judged against the traversal measurement, and keep corner-to-corner inside the 25-30 second target that makes Nuketown feel like Nuketown. State the factor you applied."),
            ("nt-topology", "HF-383: 'just make it all have a better topology'. Two mirrored single-storey houses across a central road, a yard with fences each side, a garage each side, very short sightlines, strict symmetry. Clean routes, fewer snag points, readable lanes. Verify spawn safety and no out-of-bounds escapes afterwards."),
            ("nt-spawn-damage", "HF-384: adjust the rare weapon spawn on this map. HF-385: adjust the 2X damage on this map. Investigate what each currently does, decide what is wrong for a map this size, and state your reasoning with numbers rather than vibes."),
        ],
    },
    "hijacked": {
        "owns": "src/high-seas.ts, src/rendering/arenas/high-seas.ts, and their tests",
        "tasks": [
            ("hj-windows", "HF-392: 'some issues with the windows in the top of the ship'. Diagnose specifically before changing anything - candidates are wrong transparency or refraction, z-fighting between pane and frame, panes opaque or invisible from one side, missing frames, panes not matching the deckhouse geometry, or inconsistent shootability. Verify from inside the deckhouse looking out AND from outside looking in."),
            ("hj-details", "HF-392: 'and some of the details'. Sweep the superyacht for detail defects at the standard the owner already praises - he holds Hijacked up as the fidelity benchmark the other maps are measured against, so protect that. Seams, coplanar surfaces, missing trim, props at wrong scale, materials reading as untextured."),
            ("hj-lighting-guard", "A previous lane raised below-deck lighting, and grating emissive had to be cut to 0.436 because grating is the one filled family with deck-plane exposure. Do not undo it - the leak gate will catch you. Verify below-deck is still playable-bright by sampling actual rendered luminance at eye height at each station, and report numbers."),
            ("hj-layout", "Verify the below-deck layout still matches BO2 Hijacked: long central corridor, symmetric bow and stern spawns, mid-ship engine bulge, stairwells to the sun deck. Report any divergence with coordinates."),
            ("hj-audit", "Run the arena forging review: floating geometry, buried props, spawn safety, out-of-bounds escapes. Use the 8-view / 45-degree / 1024x1024 / 15-degree critic protocol from the resources file."),
        ],
    },
    "combat": {
        "owns": "src/ballistics.ts, src/combat/**, src/weapon-presentation-state.ts, impact and hitmarker presentation modules, collision/stance/prone modules, src/audio*.ts, src/sound-event-inventory.ts, and their tests",
        "tasks": [
            ("cb-penetration", "HF-390: 'make sure certain things that should have penetration on them like wood brick glass or whatever - I gave them all like piercing and penetration rating - to make sure that's all up to date on all the assets we have'. Partial work already landed and found a real crash: farcrysis passed 'metal', an ImpactSurface rather than a BallisticMaterialId, through an 'as' cast, so every shot meeting one of 21 surfaces threw 'Cannot read properties of undefined'. Finish the audit across EVERY arena: surface -> material family -> penetration rating -> correct yes/no. Add a mechanical gate that FAILS if any collidable surface ships without a rating."),
            ("cb-world-hit", "HF-386: 'when you're doing damage with things like the chopper gunner or just any gun and it's not hitting anyone but it's hitting like the floor it should have like an impact sound and marker and just say zero damage or have like a little picture of nothing'. Deliver a surface-appropriate impact sound, a visible marker, and an explicit no-damage indicator that is UNMISTAKABLY different from a real hitmarker - state the distinction. Must work for ordinary weapons AND the chopper gunner. NOTE: src/sound-event-inventory.ts pins every audio.* call site plus a SHA-256 digest over canonical JSON; a new call site needs an inventory row and a recomputed digest, never a loosened scan."),
            ("cb-clipping", "HF-387: 'clipping still happens if I go prone or near walls I still clip through them'. The owner also says 'we did actually not flip through walls at one point', so search history - HF-345 authored a prone clearance solver that was recorded as 'never connected'. REPRODUCE the clipping with a harness before fixing it; a fix you cannot demonstrate is a guess."),
            ("cb-chopper-hud", "HF-389: 'the HUD from the helicopter has regressed and that needs to be improved'. This is archaeology - it worked before. Search history and branches (contrib/dave-gaming-pc/codex/pass74-next has chopper HUD work, and scripts/qa/pass74-chopper-hud-wiring-contract.mjs may exist there). Diff what shipped then against now, identify exactly what regressed, restore it, and say which commit you recovered it from."),
            ("cb-arms", "HF-388: 'the arms the animations are better but they still need some work'. Known specific residual: the trigger hand still sits off-frame beneath the ammo panel, at NDC y -0.75 to -0.89. Bringing it into view means moving the weapon - reason about that trade-off explicitly rather than silently doing it. Capture first-person frames on real WebGPU and READ them."),
            ("cb-audio-reach", "The owner said 'the sounds are all so bad' and later that they had become good - protect that. Verify the re-authored source synthesis reaches EVERY audio event rather than a handful, and find any event still using the old single-oscillator-into-one-exponential-decay shape, which is the literal definition of a synth beep."),
            ("cb-m14", "The M14/EBR was given roughly 50% more wall penetration and a -40% damage adjustment in earlier passes. Verify BOTH survived, with the damage, range and headshot tests to prove it."),
        ],
    },
    "graphics": {
        "owns": "src/rendering/art-direction.ts, src/rendering/filmic-grade-chain.ts, src/rendering/pass64-tsl-scene.ts, src/rendering/render-runtime.ts, src/rendering/screen-space-post-profile.ts, src/graphics-settings-registry.ts, src/pass65-settings.ts, src/ui/pass77-hud-sway.ts, src/ui/hud-impact-response.ts, and their tests",
        "tasks": [
            ("gx-rtx-decision", "HF-397, and READ SECTION 1 OF THE RESOURCES FILE FIRST - it corrects a mistake that nearly sent this work down the wrong road. The owner asked for a 4th preset called 'RTX RUNTIME' between QUALITY and MAX. What he linked (SamG's ThreeRuntime) is a NATIVE runtime that REPLACES the browser - 'Three.js / WebGPU -> Native WebGPU layer -> C++ -> Vulkan + RTX. No browser rendering.' It CANNOT power an in-browser preset. Also: WebGPU exposes NO hardware ray-tracing pipeline in any browser, so anything called RTX in the web build is BVH or screen-space ray marching. Your job in THIS task is the decision and the design, written up honestly - what is achievable in-browser, at what cost - not the implementation."),
            ("gx-rtx-build", "Implement the 'RTX RUNTIME' preset in-browser, positioned between QUALITY and MAX, working across ALL maps, without changing any existing preset's behaviour. THE BUDGET IS THE HARD PART AND YOU MUST NOT CHEAT IT: MAX already exceeds a 4000ms cold-compile admission fence (measured 5.17/5.59/6.48/6.54s) and bounces the player to the menu; a previous agent built a cold-start allowance and reverted it twice. Deploy inside the budget by pre-warming behind the fence, tracing at reduced resolution, or a smaller effect set. DO NOT WEAKEN THE 4s GUARD. Report cold-compile time per arena for the new preset."),
            ("gx-hud-motion", "HF-391: 'the HUD seems to bounce and move around a lot in Hijacked but I don't think I've noticed that in Atomic Acres - that definitely needs to be consistent across all the maps - and it feels like it's bouncing around maybe like double the speed it should so maybe you need to adjust that to be a bit smoother, like the way it interpolates'. He LIKES the effect, so this is calibration not removal. TWO defects: (a) per-map inconsistency - something map-dependent feeds the motion; prime suspects are the ship's own motion on High Seas, a movement-speed-derived signal, or an unclamped frame delta. MEASURE it: sample the HUD custom properties on High Seas and Atomic Acres under identical scripted input and report both traces. (b) roughly 2x too fast - travel was raised ~10px to ~34px and SATURATION_RAD lowered 0.085 to 0.055. His words point at RATE and INTERPOLATION, so consider damping and smoothing before simply halving travel. Do not remove the stationary breathing idle; he asked for it specifically."),
            ("gx-artstyle", "Verify the per-arena grade identity and the warm bone/ink/burnt-orange direction survive and are visible on real WebGPU. A test ratchets the weakest arena pair to 4.5/255 mean separation - do not flatten it. Gun-range is the deliberate NEUTRAL CONTROL (red and blue within one 8-bit step on a neutral probe); a previous agent made it warm, which broke both that property and its distinctness from rustworks. Capture all six arenas and read the frames."),
            ("gx-max-budget", "MAX still cannot deploy inside the 4s fence. This is a standing P0. Fix it properly at the arena-rebuild boundary or by pre-warming pipelines. DO NOT weaken the guard. Report measured cold-compile per arena before and after."),
            ("gx-device-features", "A real bug was found and fixed here: adapter.requestDevice() was called with NO descriptor, so every optional WebGPU feature was structurally absent, SSGI failed pipeline creation on rg11b10ufloat-renderable, and the invalid command buffer failed the whole queue submit and took arena admission down. Verify that fix is still present, that deviceFeatures are actually requested, and add a test that FAILS if the descriptor is ever dropped again."),
        ],
    },
    "assets-ui": {
        "owns": "src/ui/** (EXCEPT pass77-hud-sway.ts and hud-impact-response.ts, owned by graphics), public/**, source-assets/**, assets.manifest.json, src/operator-*.ts, src/weapon-presentation.ts, and their tests",
        "tasks": [
            ("au-orphan-sweep", "The owner: 'it does seem like there's a lot of things on disc that exist that you're retro patching in - why don't you scan for them all now and get them all in rather than doing it bit by bit'. Build a complete inventory of every asset under public/ and source-assets/, determine which are referenced at runtime (careful: references can be string literals, template interpolation, manifest lookups or constructed paths - a naive grep produces false orphans, so state your method), classify each as SHOULD-BE-WIRED / SUPERSEDED / BUILD-INPUT, and WIRE every should-be-wired one. Precedent: four photoreal operator portraits sat unused while the menu drew a placeholder."),
            ("au-operators", "HF-380: 'the operators do not look like what I specced and wanted, with venom, lara croft etc?'. The catalog already gestures at these archetypes - Carapace Bulwark is the symbiote, Sunspire Wayfarer the explorer. Push each archetype to read FAR more strongly as its character type. Build distinctive ORIGINAL operators in those archetypes - do not attempt likenesses of trademarked characters. Generation is local via ComfyUI on the owner's own GPU; see docs/LANE_I_LOCAL_IMAGE_GEN_2026-08-23.md for the working generator, and never call a paid or hosted API."),
            ("au-stance-preview", "HF-382: 'i adjust how they carry gun and it doesnt even preview it in third or first person?'. The IDLE STANCE selector (Weapon Ready / Low Carry / On The Trigger) changes nothing visible in either the 3D turntable or the first-person arms. Make it drive BOTH."),
            ("au-provenance", "'npm run qa:asset-provenance' is RED on a hash mismatch (atomic-acres-rustworks-central-tower). Fix it honestly. NEVER author a provenance row for an asset you did not generate - that is a fabricated record. If files are genuinely orphaned and superseded, delete them instead."),
            ("au-menu-polish", "The header still reads 'PASS 73' - stale. Sweep the menu and HUD for any surface still on the old teal-on-white deck and bring it onto the committed warm bone/ink/burnt-orange identity. Keep layout, sizing and functionality unchanged; change only how it LOOKS. Verify no text under 9px and no horizontal overflow at 1280x720, 1920x1080, 3440x1440 and 390x844."),
        ],
    },
}
