#!/usr/bin/env python3
"""Pass 80 team definitions — the AAA polish pass.

Dave's brief: "they are mainly about graphics, polish, features, better image and asset
pipelines and using video to help with rigging and a rigging thing, and some super threejs
skills ... get my game looking tip top ... use image gen and the local h3 video gen for some
of the new skills ... make it AAA quality from yesteryear."

Claude orchestrates and integrates; OMP on the free ox-alpha model implements.

File ownership is DISJOINT ACROSS TEAMS by construction. src/legacy-main.ts is the single
integration point, owned by gameplay-test alone; every other team hands it patches.
"""

SKILL_ROOT = r"C:\Users\david\.claude\skills"

SKILLS = {
    "graphics-aaa": ["threejs-rtx-runtime-route", "webgpu-tsl-arena-forging",
                     "threejs-frame-loop-audit", "visual-gauntlet-loop"],
    "assets-imagegen": ["ai-3d-asset-generation-loop", "img2threejs",
                        "atomic-acres-asset-authoring", "game-hud-menu-overhaul"],
    "rigging-motion": ["game-animation-asset-pipeline", "ai-3d-asset-generation-loop"],
    "polish-vfx": ["atomic-acres-procedural-art-authoring", "threejs-webgpu-water",
                   "threejs-frame-loop-audit"],
    "gameplay-test": ["threejs-game-development", "visual-gauntlet-loop"],
    "arena-fidelity": ["webgpu-tsl-arena-forging", "threejs-webgpu-water",
                       "atomic-acres-procedural-art-authoring", "threejs-game-development"],
}

TEAMS = {
    # ---------------------------------------------------------------- graphics
    "graphics-aaa": {
        "owns": ("src/rendering/** EXCEPT arenas/, src/graphics-settings-registry.ts, "
                 "src/pass65-settings.ts, new ray-tracing modules, and their tests"),
        "tasks": [
            ("gx-raytrace-preset",
             "Ship the classic ray-traced preset the owner asked for. Register ROW 19 - "
             "erichlof/THREE.js-RayTracing-Renderer @ 490ca081, CC0-1.0 verified from the "
             "LICENSE FILE - is the ONLY source in the whole register whose code may be "
             "ADAPTED DIRECTLY rather than merely restated. Read the skill "
             "threejs-rtx-runtime-route in full: it now carries four routes and this is "
             "ROUTE 3, the one an agent may implement without an owner decision. Classic "
             "Whitted recursive RT with BVH in WebGL2 fragment shaders: real reflections, "
             "refractions, pixel-perfect shadows with caustics through glass, depth of field "
             "via aperture and focal distance, Fresnel, four material types. HARD RULES: it "
             "must deploy inside the 4000ms cold-compile admission fence (MAX already busts "
             "it at 5.17-6.54s and bounces the player to the menu) - DO NOT weaken that "
             "guard; and NEVER name an in-browser preset 'RTX', because no browser exposes a "
             "hardware ray-tracing pipeline. Author-stated limit to carry honestly: classic "
             "RT has no diffuse GI bounce, so it trades colour bleed for low noise."),
            ("gx-beautiful",
             "The owner asked for 'beautiful implementations', not just a working toggle. "
             "Make the new preset LOOK authored: choose which material type suits which "
             "surface class in our arenas, pick aperture and focal distance so depth of field "
             "reads as intent rather than blur, and decide where caustics earn their cost. "
             "Combat readability outranks beauty - state the bound you enforce and prove an "
             "enemy stays readable at typical engagement range with reflections and "
             "refractions active. Capture before/after on real WebGPU and READ the frames."),
            ("gx-grade-polish",
             "Per-arena grade identity already exists in src/rendering/art-direction.ts with "
             "a ratcheted test: the weakest arena pair must differ by 4.5/255 mean. Do not "
             "flatten it. Gun-range is the deliberate NEUTRAL CONTROL (red and blue within "
             "one 8-bit step on a neutral probe) - a previous agent made it warm and broke "
             "both that property and its distinctness from rustworks. Push the OTHER arenas "
             "further apart and richer without touching gun-range's neutrality."),
            ("gx-max-budget",
             "STANDING P0: the MAX preset still cannot deploy inside the 4s cold-compile "
             "fence (measured 5.17/5.59/6.48/6.54s). A previous agent built a cold-start "
             "allowance and reverted it TWICE - the one-shot budget is spent on the menu's "
             "first flush so it never reaches the arena rebuild, and an unconditional "
             "extension turns a graceful failure into a browser crash. Fix it properly at the "
             "arena-rebuild boundary or by pre-warming pipelines. DO NOT weaken the guard. "
             "Report measured cold-compile per arena, before and after."),
        ],
    },
    # ------------------------------------------------------------ image assets
    "assets-imagegen": {
        "owns": ("public/**, source-assets/**, assets.manifest.json, scripts/art-gen/**, "
                 "src/ui/** , src/operator-*.ts, and their tests"),
        "tasks": [
            ("ai-operator-roster",
             "HF-380: 'the operators do not look like what I specced and wanted, with venom, "
             "lara croft etc?'. The catalog already gestures at these archetypes - Carapace "
             "Bulwark is the symbiote, Sunspire Wayfarer the explorer. Push each archetype to "
             "read FAR more strongly as its character type, and build distinctive ORIGINAL "
             "operators in those archetypes - do NOT attempt likenesses of trademarked "
             "characters. Generate locally with ComfyUI on the owner's own RTX 5080: read "
             "docs/LANE_I_LOCAL_IMAGE_GEN_2026-08-23.md for the working generator and "
             "scripts/art-gen/. NEVER call a paid or hosted API. Shut ComfyUI down when done "
             "- it contends for the same GPU as the game's own QA."),
            ("ai-textures",
             "Raise texture quality across arenas using locally generated material maps. "
             "Target the surfaces a player is closest to and looks at longest: ground, walls "
             "at cover height, and anything within a weapon's length. Respect box-projected "
             "UVs for world-space texel density - our arenas had a 140x texel-density spread "
             "before it was fixed, so measure yours. Every generated asset needs a provenance "
             "record; NEVER author a provenance row for an asset you did not generate."),
            ("ai-menu-art",
             "Loading and menu art for every arena, plus a main-menu backdrop, generated "
             "locally and actually WIRED. Precedent that must not repeat: four photoreal "
             "operator portraits sat on disk unused for a day while the menu drew a "
             "procedural placeholder the owner called 'so stupid'. Trace each new image to "
             "the live call site that renders it, and give every <img> a graceful fallback so "
             "a missing file degrades rather than blanking a card."),
        ],
    },
    # ---------------------------------------------------------- rigging/motion
    "rigging-motion": {
        "owns": ("src/rigged-*.ts, src/animation*.ts, src/operator-model.ts, "
                 "src/weapon-presentation.ts, scripts/motion/**, and their tests"),
        "tasks": [
            ("rg-arms-finish",
             "HF-388: 'the arms the animations are better but they still need some work'. "
             "Known residual, measured: the trigger hand sits off-frame beneath the ammo "
             "panel at NDC y -0.75 to -0.89. Bringing it into view means moving the weapon - "
             "reason about that trade-off explicitly and say what you chose, rather than "
             "silently moving it. Capture first-person frames on real WebGPU and READ them."),
            ("rg-motion-pipeline",
             "Build the text-to-motion bridge as a REPEATABLE PIPELINE, per register ROW 16 "
             "and the game-animation-asset-pipeline skill's new Lane A2: text prompt -> "
             "SMPL-X -> retarget onto our operator rig. LICENCE POSITION, read it before you "
             "start: kimodo.cpp has NO LICENCE FILE (verified 2026-08-24, GitHub license "
             "field null, only a NOTICE that grants nothing), so under the owner's standing "
             "Authority 2b rule you may INSPECT it to learn the general technique and then "
             "write our own - you may NOT copy files, functions or vendor the repo, and the "
             "GGUF model weights carry their own separate terms. Author-stated hard limit: a "
             "single generation is capped at 10 SECONDS and must be stitched for anything "
             "longer, so a looping locomotion cycle is not one generation - plan for seams "
             "and verify each one. Deliver the pipeline and its verification, even if the "
             "model itself is not run."),
            ("rg-per-skin",
             "Bots now cycle four skins via BOT_SKIN_ROTATION. The animation director keys "
             "posture, idle preference, aim response and breathing rate off the skin's "
             "archetype. VERIFY that actually differentiates on screen rather than only in "
             "unit tests - a live probe previously observed archetypes:['standard'] only, "
             "because every bot was built with no skin id. Capture third-person frames of "
             "several bots and show they read differently."),
        ],
    },
    # ------------------------------------------------------------------- vfx
    "polish-vfx": {
        "owns": ("src/particles/**, src/weather/**, src/farcrysis-atmosphere.ts, "
                 "src/arena-ambient-events.ts, and their tests"),
        "tasks": [
            ("vfx-density",
             "HF-371: 'we need more like dust and particle effects and ambient sounds all "
             "sorts'. The instanced particle system is wired and live (4 instanced draws, "
             "zero per-frame allocation - keep both properties). Enrich per-arena ambient "
             "life so each place feels inhabited: motes in light shafts, wind-carried debris, "
             "surface-appropriate impact puffs, interior dust. State your draw count and "
             "per-frame allocation after. Nothing may obscure an enemy or fog screen centre - "
             "state the bound."),
            ("vfx-weather",
             "Weather and rain still have NO player-facing Options controls (register status: "
             "NOT-STARTED). Add them with plain-language labels, and raise the simulation: "
             "rain that reads as volume rather than a flat overlay, surface wetness response, "
             "coherent wind gusts rather than uniform noise. Weather is seeded from "
             "hostId:matchEpoch so all peers agree - NEVER Math.random."),
            ("vfx-deforming-ground",
             "Register ROW 23 (Battle of Hoth) records the batch's most novel idea: terrain "
             "that DEFORMS AND REMEMBERS - persistent deformation accumulated into a render "
             "target rather than reset each frame. That repository has NO LICENCE, so under "
             "Authority 2b you may inspect it to learn the technique and must then implement "
             "our own; copy nothing. Apply it where it earns its cost: vehicle tracks, "
             "explosion craters, impact scarring. If the cost cannot be justified inside our "
             "frame budget, say so and stop - a measured no is a valid result."),
        ],
    },
    # --------------------------------------------------------- gameplay + test
    "gameplay-test": {
        "owns": ("src/legacy-main.ts (EXCLUSIVE), src/network*.ts, src/lobby*.ts, "
                 "src/private-match.ts, src/host-migration.ts, src/client-world-repair*.ts, "
                 "src/killstreak-*.ts, scripts/qa/**, and their tests"),
        "tasks": [
            ("gt-mp-matrix",
             "Build and RUN the definitive host+guest matrix: two real browser windows, real "
             "key input, every arena, both TDM and FFA. Copy the working pattern in "
             "scripts/qa/verify-hf347-arena-movement-matrix.mjs. Report REPRODUCED or "
             "NOT-REPRODUCED with evidence for each owner-reported fault: 'cant move alot in "
             "host and guest lobby', 'game starts before all people join', 'cant type in "
             "lobby', 'cant move when spawn into rustrig', 'sometimes randomly cant shoot or "
             "reload', 'very laggy when a chopper gunner is flying and I am not controlling "
             "it'. FIX NOTHING in this task - the honest verdicts ARE the deliverable, and "
             "every other task depends on knowing which faults are real. TAKE A BROWSER SLOT "
             "before launching browsers (see the coordination contract) - two windows is two "
             "slots, so this task uses the entire machine-wide budget; do not run it "
             "alongside another browser task."),
            ("gt-mp-fix",
             "Fix whatever the matrix reproduced. A known residual to finish: the admission "
             "acknowledgement lands after the 5s bound on this machine, so the guest takes "
             "one death at spawn and auto-respawns ~1.9s later, leaving a permanent status "
             "line accusing a healthy host. Forensics: failure at 24614ms, first host contact "
             "19059ms, attempts 1 of 2 - the client HAD a retry in hand and never used it, "
             "because sendClientWorldRepairReady is driven only by an incoming host snapshot. "
             "A previous agent wrote the timer-driven retry, the next run wedged, and it "
             "reverted rather than ship unproven changes to admission code. Finish it "
             "properly and prove it."),
            ("gt-hit-feedback",
             "HF-386: shooting the world rather than a player must give feedback - a "
             "surface-appropriate impact sound, a visible marker, and an explicit no-damage "
             "indicator that is UNMISTAKABLY different from a real hitmarker. State the "
             "distinction you chose. Must work for ordinary weapons AND the chopper gunner. "
             "NOTE: src/sound-event-inventory.ts pins every audio.* call site plus a SHA-256 "
             "digest over canonical JSON - a new call site needs an inventory row and a "
             "recomputed digest, never a loosened scan."),
            ("gt-clipping",
             "HF-387: 'clipping still happens if I go prone or near walls I still clip "
             "through them'. The owner says 'we did actually not flip through walls at one "
             "point', so this is archaeology as much as engineering - search history; HF-345 "
             "authored a prone clearance solver that was recorded as 'never connected'. "
             "REPRODUCE the clipping with a harness BEFORE fixing it; a fix you cannot "
             "demonstrate is a guess."),
        ],
    },
    # ---------------------------------------------------------- arena fidelity
    "arena-fidelity": {
        "owns": ("src/farcrysis*.ts, src/high-seas.ts, src/rendering/arenas/**, "
                 "src/arena-layout.ts, src/additional-maps.ts, and their tests"),
        "tasks": [
            ("ar-farcrysis-grass",
             "HF-396: farcrysis needs GRASS and to be 'a little bit more jungle like'. "
             "Register ROW 18 distils two MIT repos - but note they are DOCUMENTATION-ONLY "
             "(SKILL.md and prose, no src/), so there is nothing to import, only a method to "
             "restate: instanced Bezier blades, layered wind (global sway + rolling gusts + "
             "per-blade turbulence), subsurface scattering for backlit translucency, "
             "slope-aware placement, distance LOD, a tropical preset. State your instanced "
             "draw count and per-frame allocation (target zero). Density must never conceal "
             "an enemy - state the bound."),
            ("ar-farcrysis-water",
             "HF-393/HF-394: walking off the beach is a FALL, not a wade, and the water needs "
             "to look better. Register ROW 25 is the closest comparator we have - the same "
             "developer is publicly working on 'shoreline waves and blending', which is "
             "exactly this defect, and it proves a convincing transition is achievable in a "
             "browser. Build our own: shelving seabed, progressive wade depth that slows "
             "movement, foam and wave energy responding to depth, and a blend between shore "
             "and open water rather than a hard edge. HARD CONSTRAINTS: OCEAN_BANDS identical "
             "CPU-side and in-shader; water level/swimmable/amplitudeScale host-authoritative "
             "and profile-invariant."),
            ("ar-farcrysis-scale",
             "HF-396: 3-4x the current area, and HF-395: the mid-map assets 'feel a bit "
             "thrown together, they're not very well coordinated'. Register ROW 26 and the "
             "Agentic-3D paper both diagnose that second point: brittle absolute-coordinate "
             "placement produces scenes that read as scattered. Re-compose with RELATIONAL "
             "placement - aligned, distributed, grouped into readable landmarks with intent. "
             "Preserve the single terrain authority: the physics surface MUST follow the "
             "authored terrain, or players walk inside hills as they once did. Measure arena "
             "boot before and after - farcrysis is already the slowest at ~45-51s."),
            ("ar-hijacked-windows",
             "HF-392: 'issues with the windows in the top of the ship and some of the "
             "details'. Diagnose specifically before changing anything: wrong transparency or "
             "refraction, z-fighting between pane and frame, panes opaque or invisible from "
             "one side, missing frames, inconsistent shootability. Verify from inside the "
             "deckhouse looking out AND from outside looking in. The owner holds Hijacked up "
             "as the fidelity benchmark the other arenas are measured against - protect that."),
            ("ar-nuketown-finish",
             "HF-383: finish the BO2 Nuketown fidelity pass. A previous agent already "
             "decluttered the street and restaged the vans kerb-side (commit 0269334d) - "
             "build on it, do not redo it. Remaining: verify corner-to-corner traversal sits "
             "in the 25-30s window that makes Nuketown feel like Nuketown, confirm strict "
             "side-to-side symmetry, and check the two mid-street vehicles actually function "
             "as cover (sightline breaks, mantle-able, not a movement trap). Report measured "
             "footprint and traversal time."),
        ],
    },
}
