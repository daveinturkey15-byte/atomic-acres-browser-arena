#!/usr/bin/env python3
"""Pass 81 — the refinement pass, launched when ComfyUI frees the machine at 15:00.

Pass 80 completed gameplay-test 4/4 and arena-fidelity 5/5, and Claude agents delivered the
ray-traced preset and the first-person arms lift. These tasks are NOT a repeat of that list:
each one targets something pass 80 actually established, or a gap it exposed.

The owner's standing bar, in his words: "make it AAA quality from yesteryear", and he has
rejected three builds for feeling unchanged. Refinement here means the player NOTICES.
"""

SKILL_ROOT = r"C:\Users\david\.claude\skills"

SKILLS = {
    "arms-and-skins": ["game-animation-asset-pipeline", "local-video-generation",
                       "img2threejs", "atomic-acres-asset-authoring", "realtime-browser-qa"],
    "arena-polish": ["webgpu-tsl-arena-forging", "threejs-procedural-vegetation",
                     "atomic-acres-procedural-art-authoring", "threejs-webgpu-water"],
    "look-and-feel": ["game-hud-menu-overhaul", "threejs-rtx-runtime-route",
                      "threejs-frame-loop-audit", "atomic-acres-procedural-art-authoring",
                      "visual-gauntlet-loop"],
    "multiplayer-hardening": ["browser-multiplayer-netcode", "atomic-acres-gameplay-patterns",
                              "realtime-browser-qa", "browser-game-runtime-debugging",
                              "browser-game-dev-server-troubleshooting"],
    "assets-generation": ["comfyui", "ai-3d-asset-generation-loop", "img2threejs",
                          "atomic-acres-asset-authoring"],
    "perf-and-boot": ["threejs-frame-loop-audit", "webgpu-tsl-arena-forging",
                      "typescript-bundler-development-patterns",
                      "atomic-acres-live-reconciliation", "hitl-candidate-verification"],
}

TEAMS = {
    "arms-and-skins": {
        "owns": ("src/rigged-*.ts, src/animation*.ts, src/operator-model.ts, "
                 "src/operator-skin-catalog.ts, src/operator-appearance-catalog.ts, "
                 "src/weapon-presentation*.ts and their tests"),
        "tasks": [
            ("ar-reduced-render-arms",
             "DONE, DO NOT REDO: the pale-forearm read and the dark-interior risk were both fixed "
             "and verified on real WebGPU 2026-08-25 - near-clipping 3.59% to 0.19% at the hip, "
             "16.39% to 0.46% in ADS, below-deck mean 101.1 against a 53.1 arena floor. The cause "
             "was never the palette constants: first-person-viewmodel-fill was a white specular "
             "veil at 17.5cd sitting 0.61m from the arm (not the authored 0.4m, because it hangs "
             "off a SCALED root), and forcing arm albedo to BLACK still rendered 100.5 of the "
             "shipped 140.5. It is 4.5 now, and normalScale is driven at 2.4. "
             "YOUR TASK is the one path that fix deliberately did NOT touch. The REDUCED-RENDER "
             "path runs with the viewmodel fill at zero, so emissive really is its only floor "
             "there and its higher values were left alone on purpose. Verify the arms read "
             "correctly on that path in a bright AND a dark arena, measured from SCREENSHOTS, not "
             "canvas readbacks - WebGPU canvases cannot be read with drawImage. If it is already "
             "fine, say so and stop; do not tune something that works."),
            ("ar-bot-skin-visibility",
             "The owner believes bots now show four skins. They largely do NOT, and this was "
             "measured: bots are built with the 'neon-purple' appearance, and materialForTeam "
             "overrides swat/swat_black/grey with fixed purple for it - so the only per-skin "
             "COLOUR reaching a bot is the visor. Per-skin identity on bots is animation plus "
             "visor, not garment. That purple is a deliberate team-readability choice, so do NOT "
             "simply remove it: find a way to carry visible per-skin identity (silhouette, "
             "material finish, kit shape, accent placement) WITHOUT losing instant "
             "friend-or-foe reading. State the readability property you preserve."),
            ("ar-operator-preview",
             "HF-382, still open: the IDLE STANCE selector (Weapon Ready / Low Carry / On The "
             "Trigger) changes nothing visible in the 3D turntable or the first-person arms. "
             "Make it drive both, so a choice the player makes is a choice they can see."),
        ],
    },
    "arena-polish": {
        "owns": ("src/farcrysis*.ts, src/high-seas.ts, src/rendering/arenas/**, "
                 "src/arena-layout.ts, src/additional-maps.ts and their tests"),
        "tasks": [
            ("ap-nuketown-feel",
             "Nuke Town's street was decluttered and the vans restaged kerb-side, and the "
             "traversal harness was repaired. Now judge whether it FEELS like BO2 Nuketown: two "
             "mirrored single-storey houses across a central road, vehicles as the central hard "
             "cover, yards with fences, a garage each side, very short sightlines, and about "
             "25-30 seconds corner to corner. Measure traversal time at real movement speed and "
             "report it. Fix what changes how it PLAYS before anything cosmetic."),
            ("ap-farcrysis-density",
             "Farcrysis has grass tracking the 128m island and a wadeable shore. The owner wants "
             "it 'a little bit more jungle like'. Build layered depth - canopy, midstorey, "
             "undergrowth - with instanced vegetation constrained by terrain slope and height. "
             "Read the threejs-procedural-vegetation skill in full first; it exists precisely "
             "for this and was invisible to agents until today. Density must never conceal an "
             "enemy: state the bound you enforce and prove it."),
            ("ap-midmap-composition",
             "HF-395, still open: 'all the assets in the middle of the map just feel a bit thrown "
             "together, they're not very well coordinated'. Brittle absolute-coordinate placement "
             "is what produces that read. Re-compose the middle of farcrysis with RELATIONAL "
             "placement - aligned, distributed, grouped into landmarks with intent - so the eye "
             "finds structure rather than scatter."),
            ("ap-hijacked-detail",
             "The windows work landed and addCabin gained a ceilingMaterial. Sweep the rest of "
             "the superyacht at the same standard: seams, coplanar surfaces, missing trim, props "
             "at wrong scale, materials reading as untextured. The owner holds Hijacked up as the "
             "fidelity benchmark the other arenas are judged against - protect that."),
            ("ap-arena-audit",
             "ALSO, from the UI sweep, out of its reach and inside yours: world-space arena signage (ARMORY - PICK UP WITH F, weapon pickup labels) still renders with CYAN edges from arena/renderer source. It is drawn in the world, so no stylesheet can reach it. Warm it to match the deck without lowering its legibility - it is a gameplay affordance first. "
             "Run the forging review on every arena: floating geometry, buried props, spawn "
             "safety, out-of-bounds escapes, sightlines. Use the 8-view / 45-degree / 1024x1024 / "
             "15-degree-elevation critic protocol and cross-reference what you see against "
             "program state, so you never report a defect that is not there."),
        ],
    },
    "look-and-feel": {
        "owns": ("src/ui/** EXCEPT pass64-shell.ts, src/rendering/filmic-grade-chain.ts, "
                 "src/rendering/art-direction.ts and their tests"),
        "tasks": [
            ("lf-identity-residuals",
             "The menu/HUD sweep is DONE and measured: 659 cold DOM nodes across 47 surfaces "
             "reduced to 61 across 12 (90.7%), by rotating hue at CONSTANT WCAG relative "
             "luminance - worst deviation 0.0013, so no contrast ratio moved and no legibility "
             "bound can regress behind a colour change. Read that method before you touch a "
             "colour; rotating at fixed HSL lightness silently loses contrast and is the trap. "
             "A guard test now forbids the PROPERTY (any colour whose blue channel beats its "
             "red) across 11 sheets, naming the semantic families where cold means something. "
             "YOUR TASK is the residue it could not reach inside its ownership: "
             "(1) index.html still ships <meta name=theme-color content=#10171b> and a cyan "
             "#00d4ff favicon - the browser tab and the installed-app chrome are the FIRST "
             "thing the owner sees and they are still the rejected identity. "
             "(2) #color-grade carries rgba(24,73,92,.09), a cold wash over the whole frame. "
             "(3) The AQUA team score reads teal in solo and gun-range where there is no "
             "opposing team. That one is a BEHAVIOUR fix (which span the matchbar uses), not a "
             "colour fix - the guard forbids retuning the team token, and it is right to. "
             "Do not touch --ui-cyan or --aqua; use --ui-signal for chrome."),
            ("lf-hud-impact",
             "The HUD impact response is wired: measured 3.8px kick for a bullet, 22px for a "
             "close explosion, with directional bearing. Play with it and judge whether it reads "
             "as IMPACT or as noise. The owner also asked for the HUD to breathe when stationary "
             "- verify that is present and perceptible, since it was once driven by speed and "
             "was therefore exactly zero when standing still."),
            ("lf-grade-depth",
             "Per-arena grade identity is ratcheted so the weakest pair differs by 5.5/255 and "
             "gun-range is a deliberate NEUTRAL CONTROL (red and blue within one 8-bit step). Do "
             "not flatten either. Push the themed arenas further into their own worlds - "
             "tropical farcrysis, maritime high-seas, rust-industrial rustworks - without "
             "touching gun-range's neutrality or crushing shadows enough to hide a player."),
        ],
    },
    "multiplayer-hardening": {
        "owns": ("src/legacy-main.ts (EXCLUSIVE), src/network*.ts, src/lobby*.ts, "
                 "src/private-match.ts, src/host-migration.ts, src/client-world-repair*.ts, "
                 "src/killstreak-*.ts, scripts/qa/** and their tests"),
        "tasks": [
            ("mh-rerun-matrix",
             "Re-run the full host+guest matrix now that a pass of fixes has landed, and report "
             "REPRODUCED / NOT-REPRODUCED per owner-reported fault with evidence. Two real "
             "browser windows, real key input, every arena, both TDM and FFA. This needs the two "
             "HEADED browser slots - take them, and do not run alongside another browser task."),
            ("mh-admission-residual",
             "Known residual: the admission acknowledgement lands after the 5s bound on this "
             "machine, so the guest takes one death at spawn, auto-respawns ~1.9s later, and is "
             "left with a permanent status line accusing a healthy host. Forensics: failure at "
             "24614ms, first host contact 19059ms, attempts 1 of 2 - the client HAD a retry and "
             "never used it, because sendClientWorldRepairReady is driven only by an incoming "
             "host snapshot. A previous agent wrote the timer-driven retry, the next run wedged, "
             "and it reverted rather than ship unproven changes to admission code. Finish it."),
            ("mh-chopper-lag",
             "'when chopper gunner is flying and I am against it or on the same team but not "
             "controlling it I am very laggy'. Reproduce with a chopper active and a second peer "
             "observing, measure the frame cost on the NON-controlling peer, find what is "
             "replicated or presented per-frame that should not be, and fix it."),
            ("mh-two-machine-prep",
             "Two-machine multiplayer has NEVER been tested and is the real close-out bar - "
             "everything to date is two windows on one PC. You cannot do the second machine, so "
             "prepare it: document exactly what the owner must run on each machine, what to look "
             "for, and what evidence to capture. Make it a checklist he can follow in ten "
             "minutes, not a research project."),
        ],
    },
    "assets-generation": {
        "owns": ("public/**, source-assets/**, assets.manifest.json, scripts/art-gen/**, "
                 "src/ui/pass64-shell.ts and their tests"),
        "tasks": [
            ("ag-operator-roster",
             "HF-380: 'the operators do not look like what I specced and wanted, with venom, lara "
             "croft etc?'. Push each archetype to read FAR more strongly as its character type - "
             "Carapace Bulwark the symbiote, Sunspire Wayfarer the explorer - as distinctive "
             "ORIGINAL operators. Do NOT attempt likenesses of trademarked characters. Generate "
             "locally with ComfyUI on the owner's RTX 5080; read the comfyui skill in full and "
             "docs/LANE_I_LOCAL_IMAGE_GEN_2026-08-23.md for the working generator. Never call a "
             "paid or hosted API. SHUT COMFYUI DOWN WHEN DONE - an earlier agent left it running "
             "and it held 5+ GB for twelve hours."),
            ("ag-textures",
             "Raise texture quality on the surfaces a player is closest to and looks at longest: "
             "ground, walls at cover height, and anything within a weapon's length. Respect "
             "box-projected UVs for world-space texel density - the arenas once had a 140x "
             "density spread. Every generated asset needs a provenance record, and NEVER author "
             "a provenance row for an asset you did not generate."),
            ("ag-menu-art",
             "Loading and menu art for all six arenas plus a main-menu backdrop, generated "
             "locally and actually WIRED. The precedent that must not repeat: four photoreal "
             "operator portraits sat on disk unused while the menu drew a placeholder the owner "
             "called 'so stupid'. Trace every image to the live call site that renders it, and "
             "give each one a graceful fallback so a missing file degrades rather than blanks."),
        ],
    },
    "perf-and-boot": {
        "owns": ("src/rendering/render-runtime.ts, src/rendering/pass64-tsl-scene.ts, "
                 "src/browser-preparation-scheduler.ts, src/arena-visual-stream.ts "
                 "and their tests"),
        "tasks": [
            ("pb-farcrysis-cliff",
             "MEASURED RISK: farcrysis cold-compiles in 13.97s against a 12s single-fence bound. "
             "It only admits because 8.24s of that is in a YIELDING compileAsync - collapse that "
             "into one fenced submission and it exceeds the bound and stops booting, exactly as "
             "HF-374 recorded. It is one slower machine from failing. Reduce the real cost: "
             "pipeline and material count, shadow casters, duplicate suns. Measure before and "
             "after and report both. DO NOT raise the bound."),
            ("pb-frame-rate",
             "Measure sustained frame rate on every arena at QUALITY and at RAY TRACED, on real "
             "WebGPU, and report a median rather than a best case. Then fix the worst offender. "
             "Use the threejs-frame-loop-audit skill: frame-loop cost, GPU leaks, per-frame "
             "allocation. The owner plays this - a stutter is worth more to fix than a feature."),
            ("pb-boot-time",
             "MEASURED 2026-08-25 14:35 on a QUIET machine, PRODUCTION bundle, real WebGPU, six for "
             "six OK: atomic-acres 34.7s, skyline-terminal 32.0s, rustworks-1v1 40.1s, "
             "gun-range 35.8s, high-seas 31.4s, farcrysis 61.2s. Those are your baselines and "
             "they are honest ones - nothing else was running. A player stares at a loading "
             "screen for a MINUTE on farcrysis. Find what dominates (shared asset streaming, "
             "pipeline compile, texture decode) and reduce it. Report per-phase numbers before "
             "and after so the win is attributable rather than asserted. Re-measure with "
             "scripts/qa/verify-arena-boot-cdp.mjs against a PRODUCTION build, never the dev "
             "server, and never while a swarm is running."),
        ],
    },
}
