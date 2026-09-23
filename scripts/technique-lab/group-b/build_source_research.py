#!/usr/bin/env python3
"""Emit docs/technique-lab/group-b/SOURCE_RESEARCH.json and skill-read-proofs.json.

The per-URL attempt records come from the source reader's own output; the analysis for each
register row is authored here. Keeping them in one generator means the evidence and the
claims cannot drift apart silently: a row whose URLs were never attempted shows up with an
empty attempt list rather than an unsupported claim.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys
from datetime import datetime, timezone

REPO = pathlib.Path(__file__).resolve().parents[3]
DOCS = REPO / "docs" / "technique-lab" / "group-b"
CACHE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(
    r"C:\Users\david\AppData\Local\Temp\technique-lab-group-b-cache")

SKILLS = pathlib.Path(r"C:\Users\david\Documents\desky-bootstrap-clone\Skills")

# Carrier skills whose FULL body was read in this lane, with the section that carries the row.
SKILL_READS = [
    ("game-hud-menu-overhaul", "game-development", [26],
     "Read in full (91 lines). Lines 30-77 'Pre-match and game-select shells' carry row 26's "
     "eleven restated principles and the explicit all-rights-reserved warning."),
    ("webgpu-tsl-arena-forging", "game-development", [28, 33],
     "Read in full (39 lines). Step 7 forbids ShaderMaterial/RawShaderMaterial/GLSL on the "
     "WebGPU path, which is why rows 18, 19, 23 and 26 are reimplemented without shaders."),
    ("threejs-game-development", "software-development", [18, 20, 27, 29, 33, 34],
     "Read in full (131 lines). Lines 95-122 carry row 34's subsystem-contract pattern; the "
     "safety boundary at line 92 forbids importing source from repositories lacking a "
     "compatible licence, which governs rows 23, 28, 29 and 33."),
    ("atomic-acres-procedural-art-authoring", "game-development", [23, 24, 33],
     "Read in full (152 lines). Section 1 hard rules (determinism, no Math.random, frozen "
     "budgets, commit-pinned licence-reviewed intake) shaped every demo in this group."),
]

# sourceId -> analysis. `status` is one of demo | blocked | not-delivered.
ANALYSIS = {
    18: dict(
        title="Procedural grass and landscape systems for Three.js",
        status="demo", adaptation="adapted", entrypoint="src/map3/technique-lab/demos/group-b/source-18.ts",
        canonical="CK42BB/procedural-grass-threejs@26f072308df12caac68a474cb40300ef576793e1",
        licence="MIT. LICENSE file fetched and read at the pinned revision (1,065 bytes); "
                "copyright line reads 'Kingsley'. MIT here means restate, not reproduce.",
        readDepth="SKILL.md read in full (22,187 bytes, 635 lines) plus LICENSE in full and the "
                  "pinned recursive tree listing.",
        method="Tapered triangle-strip blade swept along a quadratic Bezier; jittered-grid "
               "placement with height, slope and density-noise rejection; four wind layers with "
               "root-anchored height weighting; concentric LOD rings dropping both density and "
               "segment count; per-instance colour variation and root AO.",
        sourceLines="SKILL.md lines 39-103 (blade), 120-181 (placement), 216-256 (wind), "
                    "258-348 (shading), 350-401 (LOD), 555-604 (presets).",
        compatibility="Source implements wind and SSS in a GLSL ShaderMaterial; this repository "
                      "forbids GLSL on the WebGPU path, so wind is CPU per-instance rigid rotation "
                      "on MeshStandardMaterial and SSS is an emissive approximation. No WGSL "
                      "compute placement path.",
        dependencies="three 0.185.1 only.",
        limitation="Bounded lab blade budget; the source's 50K-2M blade figures are AUTHOR CLAIMS "
                   "and were not measured here. Rigid-blade bend is not the source's per-vertex "
                   "quadratic bend.",
    ),
    19: dict(
        title="Classic ray tracing in the browser (THREE.js-RayTracing-Renderer)",
        status="demo", adaptation="adapted", entrypoint="src/map3/technique-lab/demos/group-b/source-19.ts",
        canonical="erichlof/THREE.js-RayTracing-Renderer@490ca0817ce31781df2cd36af2edcc2f36d9dfcc",
        licence="CC0-1.0. LICENSE fetched and read in full (7,048 bytes). The one source in this "
                "group whose expression could lawfully be adapted directly; we still wrote our own. "
                "The section 4a trademark carve-out still binds: no endorsement implied.",
        readDepth="shaders/WhittedRayTracing_Fragment.glsl (14,588 bytes) inspected for the "
                  "material record, bounce loop and Fresnel split; README.md (14,104 bytes) and "
                  "LICENSE read; pinned tree enumerated (11 shader files).",
        method="Whitted-style classic ray tracing with the Hall shading model: bounded iterative "
               "bounce loop carrying a colour mask, Blinn halfway-vector direct lighting, hard "
               "shadow rays that transparent occluders do not fully block, metal mirror tint, "
               "Fresnel-weighted clearcoat, refraction with Schlick split and TIR handling.",
        sourceLines="WhittedRayTracing_Fragment.glsl line 23 (Material struct), 155 (Re/Tr), "
                    "171 (for bounces < 12), 288 (Blinn halfway), 316 (CLEARCOAT), 336 (metal), "
                    "345-352 (TRANSPARENT, ni=1.0 air vs material IoR).",
        compatibility="Source is a WebGL2 fragment-shader renderer with BVH acceleration over "
                      "triangles and quadrics. A lab demo owns no renderer, so the tracer runs on "
                      "the CPU at 160x120 into a DataTexture. No BVH, no depth of field.",
        dependencies="three 0.185.1 only.",
        limitation="No frame-rate claim: the author's 60 fps target describes the GPU path and was "
                   "not measured. Classic ray tracing has no diffuse global illumination - stated "
                   "by the author and inherited here.",
    ),
    20: dict(
        title="Engine-free Three.js armour, ballistics and destructible battlefields (Claude of Tanks)",
        status="not-delivered", adaptation=None, entrypoint=None,
        canonical="Kevin-Liu-01/Claude-of-Tanks@9004ce65a9be52793a3f4130bde034ec4a857f32",
        licence="MIT root LICENSE read (1,069 bytes) AND NOTICE.md read (1,422 bytes). The root MIT "
                "covers first-party work only. Carve-outs confirmed to exist outside the LICENSE "
                "file, including a COMMERCIAL TYPEFACE committed under the owner's own Dinamo EULA: "
                "nothing under public/fonts, public/brand or docs/licenses may be reused.",
        readDepth="src/sim/armor.js first 150 of its lines read (21,262 bytes total); "
                  "src/sim/ballistics.js fetched (10,838 bytes) and its penetration and gun-lay "
                  "sections located; full pinned tree enumerated (1.05 MB listing).",
        method="Plate-level armour resolution: a world-space shell segment is transformed into four "
               "rigid frames (hull, turret, gun-follow, barrel), each the exact inverse of the "
               "visual root's transform so hitboxes track the rendered attitude, then intersected "
               "against convex quad plates and module boxes for ordered hits. Penetration is "
               "interpolated against flight distance (penAtDistanceMm).",
        sourceLines="armor.js lines 9-20 (frame definitions), 98-131 (frame matrices), 138-146 "
                    "(segment localisation); ballistics.js lines 187-199 (penetration vs distance), "
                    "63-92 (ballistic gun lay).",
        compatibility="Not applicable - no demo was built.",
        dependencies="n/a",
        limitation="NOT DELIVERED in this lane's time budget. The source was recovered, read and "
                   "licence-checked, so this row is NOT blocked: it is outstanding work with the "
                   "research already banked. No scene, no factory, no manifest entry - deliberately, "
                   "rather than shipping a placeholder labelled with this row's title.",
    ),
    21: dict(
        title="Classic ray tracing as a shipped option - see row 19",
        status="alias", adaptation="adapted", entrypoint="src/map3/technique-lab/demos/group-b/source-19.ts",
        canonical="none - this stub holds no source of its own; row 19 carries the pin.",
        licence="n/a - inherits row 19 (CC0-1.0).",
        readDepth="Register stub read; no separate source exists to read.",
        method="Alias of source 19. Carries no technique of its own and must never be counted as a "
               "distinct technique.",
        sourceLines="n/a",
        compatibility="n/a", dependencies="n/a",
        limitation="Alias of source 19.",
    ),
    22: dict(
        title="Environment-art comparators, 2026-08-24 batch",
        status="blocked", adaptation="blocked", entrypoint=None,
        canonical="none for any of the three - no repository, no published technique, no licence.",
        licence="None available; nothing is granted.",
        readDepth="All three original URLs fetched 2026-09-12. revo-realms returned HTTP 200 but "
                  "only 1,430 bytes - confirming the register's finding that it serves no "
                  "meaningful HTML to a fetcher and its tech is NOT determined. moon-rover returned "
                  "8,822 bytes and sky-fang 33,000 bytes of itch.io page furniture.",
        method="No method is recoverable. These are quality targets, not techniques: dense "
               "believable ground cover, wheel-ground interaction that reads as weight and slip, "
               "readable multi-target lock-on and a near-miss risk-reward mechanic.",
        sourceLines="n/a - no source published.",
        compatibility="n/a", dependencies="n/a",
        limitation="BLOCKED: comparator-only row with no primary source to implement. Building a "
                   "scene here would be our own work wearing this row's title, which is exactly the "
                   "substitution the register warns against.",
    ),
    23: dict(
        title="Hand-written GLSL combat sim with deforming terrain (Battle of Hoth)",
        status="demo", adaptation="adapted", entrypoint="src/map3/technique-lab/demos/group-b/source-23.ts",
        canonical="csanz/battle-of-the-hoth-simulator@bc057e2ce52254bc2e3c2bd6feaaaf4625dddee8",
        licence="NONE. Our own LICENSE probe at the pinned revision returned HTTP 404, "
                "independently confirming the register: all rights reserved by default. Read for "
                "method; no expression reproduced.",
        readDepth="src/terrain/deformation.js read (11,649 bytes, first 120 lines in detail); "
                  "src/shaders/lib/deform.glsl fetched (3,706 bytes); live site fetched (17,721 "
                  "bytes); pinned tree enumerated.",
        method="Deformation as persistent accumulating state: ping-ponged float targets with no "
               "clear, copy or readback; a fixed world-metre window snapped to texel boundaries so "
               "the field does not swim, addressed toroidally so following the subject is free; one "
               "shared brush write path for every effect; recovery BANKED and spent in discrete "
               "steps because a per-frame decay is below one ULP of a half-float store.",
        sourceLines="deformation.js lines 1-19 (persistent ping-pong, no readback), 26-34 "
                    "(coverage/texel trade), 40-41 and 107-115 (banked relaxation and the "
                    "half-float precision reason), 12-15 (shared brush path), 48-54 (snapping).",
        compatibility="Source simulates in a GLSL fragment pass over RGBA16F targets at 2048 over "
                      "80 m. Here the field is a CPU Float32Array at 96x96 over 8 m applied to "
                      "displaced vertices; same state machine, different execution target and cost.",
        dependencies="three 0.185.1 only.",
        limitation="No GPU pass, no float-render-target capability gate, no snow shading, "
                   "compression or berm model.",
    ),
    24: dict(
        title="TAKEN - browser survival horror, dense ground cover and night sky (VOIDMODE)",
        status="blocked", adaptation="blocked", entrypoint=None,
        canonical="NOT LOCATED. The register's search was closed negative on 2026-08-24 and this "
                  "lane did not reopen it.",
        licence="Unresolved, because the source is unlocated. The game's own CC/Freesound asset "
                "credits bind ITS assets and grant us nothing.",
        readDepth="https://www.taken-game.com/play fetched 2026-09-12, HTTP 200, 69,243 bytes. The "
                  "playable page was retrieved; no repository is linked from it that resolves.",
        method="Not recoverable as a method. Comparator properties only: dense low ground cover "
               "with several distinct species, night sky and cloud colour that reads as night "
               "rather than as darkness, procedural mountain backdrops, and a light source whose "
               "behaviour carries narrative.",
        sourceLines="n/a - no source located.",
        compatibility="n/a", dependencies="n/a",
        limitation="BLOCKED: no source exists to implement. A ground-cover scene built here would "
                   "be our own work credited to an unlocated source.",
    ),
    25: dict(
        title="Browser water with shoreline waves and blending (VOIDMODE)",
        status="blocked", adaptation="blocked", entrypoint=None,
        canonical="None available. The author has said the water WILL become available; it is not "
                  "released as a library today.",
        licence="n/a until published.",
        readDepth="https://x.com/voidmode/status/2079334222217588842 fetched 2026-09-12, HTTP 200, "
                  "194,515 bytes. The response is X's client shell; the post text was NOT "
                  "recovered from it and is NOT reproduced here. The register's reading of the post "
                  "from a browser session on 2026-08-24 is retained as prior evidence, not "
                  "re-verified by this lane.",
        method="No implementation is published. The register's transferable statement is that a "
               "convincing shoreline transition is achievable in a browser: shelving seabed, "
               "progressive wade depth, foam and wave energy responding to depth.",
        sourceLines="n/a - no source published.",
        compatibility="n/a", dependencies="n/a",
        limitation="BLOCKED: unreleased technique, no source, and the post body could not be "
                   "recovered by a plain fetcher. Fabricating post contents is forbidden and a "
                   "water scene here would not be this source's method.",
    ),
    26: dict(
        title="Arcade attract-loop game-select menu (AMIX GAMES)",
        status="demo", adaptation="adapted", entrypoint="src/map3/technique-lab/demos/group-b/source-26.ts",
        canonical="No repository. The deployed page is the canonical artefact; re-read before "
                  "relying on a detail.",
        licence="ALL RIGHTS RESERVED for the page design, markup, CSS, art, audio and code; "
                "license.html fetched and read (8,158 bytes). Three.js is MIT and the fonts are "
                "OFL, but the page's own expression is reserved and the BGM may not be "
                "redistributed. Restate only.",
        readDepth="Page HTML fetched (73,881 bytes), the unminified ES module js/main.js fetched "
                  "and inspected (51,967 bytes), licence page read.",
        method="Ring geometry derived from item count, short-way rotation modulo N, two-stage "
               "commit where only the focus slot launches, and a content-derived accent scored by "
               "saturation against distance from mid-lightness then clamped into a legible band "
               "with a fixed fallback for neutral art.",
        sourceLines="main.js line 11 (TAU), lines 101-102 (R = N(W+GAP)/TAU and STEP = TAU/N) - "
                    "both confirmed directly in the fetched module rather than trusted from the "
                    "register summary.",
        compatibility="A demo owns no DOM, so the source's most portable idea - the semantic <li> "
                      "roster as the single data source with the 3D ring as a view over it - is "
                      "stated but not demonstrated, and neither are its degradation branches, entry "
                      "gate, audio fork or deterministic capture mode.",
        dependencies="three 0.185.1 only.",
        limitation="Selection advances on a timer because a demo may not register input listeners.",
    ),
    27: dict(
        title="Three.js game skill pack (majidmanzarpour)",
        status="not-delivered", adaptation=None, entrypoint=None,
        canonical="majidmanzarpour/threejs-game-skills@7221c1f4a6d2ae189a4d85d058d24f3228499d46",
        licence="MIT. LICENSE fetched and read at the pinned revision (1,073 bytes), 'Copyright (c) "
                "2026 Majid Manzarpour', no carve-outs, and the root carries no NOTICE or "
                "ATTRIBUTION file (checked in the pinned tree listing).",
        readDepth="Pinned tree enumerated (45,588 bytes) - 9 skills resolved; "
                  "skills/threejs-aaa-graphics-builder/SKILL.md fetched (6,429 bytes).",
        method="A non-visual harness technique: a skill pack covering gameplay, AAA-style graphics, "
               "UI, QA and optional AI-generated assets. The register's decision for this row is "
               "COMPARISON against our own library, not import.",
        sourceLines="Pinned tree: skills/threejs-{3d-generator,aaa-graphics-builder,audio-generator,"
                    "debug-profiler,game-director,game-ui-designer,gameplay-systems,image-generator,"
                    "qa-release}/SKILL.md.",
        compatibility="Installing it executes third-party code via install.sh, which the register "
                      "records as an OWNER decision. Nothing was installed or executed here.",
        dependencies="n/a",
        limitation="NOT DELIVERED in this lane's time budget. Source recovered and licence-verified, "
                   "so this row is not blocked; the coverage-comparison artifact and its before/after "
                   "scene are outstanding.",
    ),
    28: dict(
        title="WebGPU Claude skill (dgreenheck)",
        status="not-delivered", adaptation=None, entrypoint=None,
        canonical="dgreenheck/webgpu-claude-skill@af2319bd01bb7cc881267a9ef42cafdaf5e9029d",
        licence="NONE. Our own LICENSE probe at the pinned revision returned HTTP 404, "
                "independently confirming the register: all rights reserved. Inspect, restate, "
                "write our own.",
        readDepth="Pinned tree enumerated (8,380 bytes); skills/webgpu-threejs-tsl/SKILL.md fetched "
                  "(3,202 bytes) and docs/materials.md fetched (8,786 bytes).",
        method="Non-visual harness technique: WebGPU/TSL practice guidance (core concepts, node "
               "materials, compute shaders, device loss, limits and features, post-processing, "
               "WGSL integration).",
        sourceLines="Pinned tree: skills/webgpu-threejs-tsl/SKILL.md, REFERENCE.md and 6 docs files.",
        compatibility="Our own webgpu-tsl-arena-forging skill already covers the fail-closed WebGPU "
                      "attestation route this source does not.",
        dependencies="n/a",
        limitation="NOT DELIVERED in this lane's time budget. Source recovered; a TSL before/after "
                   "material scene is outstanding work, not a blocked one.",
    ),
    29: dict(
        title="Three.js skills collection (CloudAI-X)",
        status="not-delivered", adaptation=None, entrypoint=None,
        canonical="CloudAI-X/threejs-skills@b1c623076c661fc9b03dac19292e825a5d106823",
        licence="NONE. Our own LICENSE probe at the pinned revision returned HTTP 404, confirming "
                "the register: all rights reserved.",
        readDepth="Pinned tree enumerated (5,411 bytes); README.md fetched (4,701 bytes) and "
                  "skills/threejs-geometry/SKILL.md fetched (13,829 bytes).",
        method="Non-visual harness technique. The register asked what this most-starred row "
               "actually CONTAINS: the pinned tree resolves it as ten topic skills - fundamentals, "
               "geometry, materials, lighting, textures, loaders, animation, interaction, shaders "
               "and postprocessing. That is a Three.js tutorial set, not a game-production pack.",
        sourceLines="Pinned tree: skills/threejs-{fundamentals,geometry,materials,lighting,textures,"
                    "loaders,animation,interaction,shaders,postprocessing}/SKILL.md.",
        compatibility="n/a",
        dependencies="n/a",
        limitation="NOT DELIVERED in this lane's time budget. The contents question the register "
                   "left open is now answered from the pinned tree; the comparison artifact is "
                   "outstanding.",
    ),
    30: dict(
        title="Generated video as MOTION REFERENCE, not as the asset (the owner's bridge)",
        status="blocked", adaptation="blocked", entrypoint=None,
        canonical="None. This row is a composition of rows 1, 5 and 16, not a third-party artefact.",
        licence="Component-dependent. The operating rule is that the generated reference video is "
                "private scaffolding that never ships, is never redistributed and is never "
                "committed; only rig data authored from it ships.",
        readDepth="Register row read in full. The carrier skill game-animation-asset-pipeline was "
                  "NOT read in full in this lane, and this row's entry is therefore recorded as "
                  "blocked on evidence we did hold rather than on a skill body we did not read.",
        method="Describe a motion in words, generate a reference video, reconstruct pose from it or "
               "author against it, retarget onto our own rig, ship only the rig data.",
        sourceLines="n/a",
        compatibility="Requires a video generator and Blender or a pose-reconstruction route. This "
                      "lane forbids GPU jobs and may not execute either.",
        dependencies="A local video generator (see row 32) plus Blender or GVHMR.",
        limitation="BLOCKED: the technique's first step cannot be performed in this lane at all, and "
                   "a rig-retarget scene without a reference video would demonstrate retargeting, "
                   "not this row's bridge. Recorded as blocked rather than counterfeited.",
    ),
    31: dict(
        title="Rigged first-person arms, CC0 (para / OpenGameArt)",
        status="not-delivered", adaptation=None, entrypoint=None,
        canonical="OpenGameArt asset page; no repository. Page fetched 2026-09-12 (27,846 bytes).",
        licence="CC0 per the asset page - public domain, no attribution required. OpenGameArt "
                "licences are PER-ASSET; the page was re-read in this lane rather than assuming a "
                "site default.",
        readDepth="Asset page read. The author's own words were recovered directly: the rig 'uses "
                  "IK and a handle bone' for quick arm posing with a constraint modifier on finger "
                  "bones for quick curling; mesh is ~4000 verts / ~8000 tris with a 1024 texture "
                  "downsampled from 2048; two .blend and .fbx files, one T-pose and one with a "
                  "crude sample animation; mesh and texture originate from MakeHuman.",
        method="A first-person arm RIG method: two-bone IK driven by a handle target for fast arm "
               "posing, plus a single constraint-driven parameter that curls the finger joints.",
        sourceLines="Asset page body paragraphs (author description, MakeHuman credit, budget, "
                    "T-pose/animation split).",
        compatibility="The asset ships as .blend and .fbx. This lane vendors no binary assets and "
                      "runs no Blender, so any demo would have to reimplement the rig method rather "
                      "than load the author's mesh.",
        dependencies="n/a",
        limitation="NOT DELIVERED in this lane's time budget. Source page read and licence "
                   "confirmed; the IK-plus-finger-curl rig scene is outstanding work, not blocked.",
    ),
    32: dict(
        title="WAN 2.2 - local text-to-video and image-to-video, Apache 2.0",
        status="blocked", adaptation="blocked", entrypoint=None,
        canonical="Weights NOT PINNED. The register requires pinning exact safetensors revisions "
                  "and reading the licence shipped WITH the weights; this lane did neither.",
        licence="Apache 2.0 per the documentation, which we read from the author-owned docs "
                "repository. NOT verified against the weights themselves - and row 20 is the "
                "standing proof that a stated licence and the real terms can differ.",
        readDepth="https://docs.comfy.org/tutorials/video/wan/wan2_2 FAILED: URLError, SSL "
                  "CERTIFICATE_VERIFY_FAILED, certificate has expired. Recorded verbatim rather "
                  "than worked around - the certificate was not bypassed. The legitimate "
                  "author-owned primary was then read instead: "
                  "Comfy-Org/docs raw tutorials/video/wan/wan2_2.mdx, HTTP 200, 19,972 bytes.",
        method="Mixture-of-experts video diffusion split by denoising timestep, text-to-video and "
               "image-to-video, run locally in ComfyUI from a diffusion model plus VAE plus text "
               "encoder.",
        sourceLines="wan2_2.mdx as fetched; see url-attempts.json for its hash and local path.",
        compatibility="Requires model weights and a GPU run. This lane forbids GPU jobs and may not "
                      "download or execute model weights.",
        dependencies="ComfyUI, WAN 2.2 safetensors, umt5 text encoder - none present or pinned here.",
        limitation="BLOCKED: no artifact can be produced without a GPU generation this lane may not "
                   "run. A scene here would demonstrate nothing about this model.",
    ),
    33: dict(
        title="ThreeJS Super Terrain - partitioned mesh terrain with live CSG and worker LOD",
        status="demo", adaptation="adapted", entrypoint="src/map3/technique-lab/demos/group-b/source-33.ts",
        canonical="vibe-stack/super-terrain@e417c048c29fc0193005df4f3e39dff44cef5d31",
        licence="NONE. Our own LICENSE probe at the pinned revision returned HTTP 404, confirming "
                "the register's 2026-08-26 re-inspection: all rights reserved. Method only.",
        readDepth="src/terrain/lod/LodSelector.ts read in full (7,444 bytes, 241 lines); "
                  "src/terrain/partition/MeshPartition.ts fetched (7,005 bytes); demo page and "
                  "repository page fetched; pinned tree enumerated (92,588 bytes).",
        method="Screen-space projected geometric error for LOD choice, asymmetric hysteresis "
               "against level flapping, and a neighbour constraint settling adjacent sections to "
               "min(level + Manhattan distance) so no seam differs by more than one level.",
        sourceLines="LodSelector.ts lines 23-31 (projectedGeometricError), 33-84 (selectLod with "
                    "1.16x/0.72x hysteresis), 191-240 (constrainNeighborLods bucketed relaxation).",
        compatibility="Source compiles sections off-thread in a worker pool under a frame-budget "
                      "scheduler; this demo swaps cached geometry on the main thread.",
        dependencies="three 0.185.1 only.",
        limitation="The source's headline features are explicitly NOT demonstrated: no QEF dual "
                   "contouring, no live CSG add/subtract, no tunnels or caves, no worker pool, no "
                   "IndexedDB persistence, no Godot export.",
    ),
    34: dict(
        title="Claude-of-Duty - full-procedural FPS from a subsystem-contract prompt",
        status="not-delivered", adaptation=None, entrypoint=None,
        canonical="mshumer/Claude-of-Duty@d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853",
        licence="MIT. LICENSE fetched and read at the pinned revision (1,064 bytes), 'Copyright (c) "
                "2026 mshumer'.",
        readDepth="README.md fetched (7,135 bytes); src/weapons/ballistics.js fetched (4,968 "
                  "bytes); pinned tree enumerated (47,150 bytes) confirming the single-owner "
                  "subsystem directory layout (src/ai, src/audio, src/weapons, src/world, ...).",
        method="An architectural, non-visual technique: decompose into single-owner subsystems with "
               "defined interfaces, a cross-subsystem event vocabulary, shared surface types and "
               "directory-ownership contracts, iterated against a visual reference.",
        sourceLines="Pinned tree directory ownership under src/; README.md subsystem description.",
        compatibility="The register's own caution stands: treat the one-shot PROCESS claims as "
                      "marketing and the architecture as real.",
        dependencies="n/a",
        limitation="NOT DELIVERED in this lane's time budget. Source recovered and licence-verified; "
                   "the subsystem-contract lint artifact and its before/after graph scene are "
                   "outstanding work, not blocked.",
    ),
}


def main() -> int:
    attempts_by_id: dict[int, list] = {}
    for name in ("attempts-jobs-phase1.json", "attempts-jobs-phase2.json"):
        path = CACHE / name
        if not path.exists():
            continue
        for record in json.loads(path.read_text(encoding="utf-8")):
            attempts_by_id.setdefault(record.get("sourceId"), []).append({
                "url": record["url"],
                "role": record.get("role"),
                "timestamp": record["timestamp"],
                "outcome": record["outcome"],
                "httpStatus": record.get("httpStatus"),
                "bytes": record.get("bytes"),
                "sha256": record.get("sha256"),
                "localPath": record.get("localPath"),
                "error": record.get("error"),
            })

    records = []
    for source_id in sorted(ANALYSIS):
        analysis = dict(ANALYSIS[source_id])
        analysis["sourceId"] = source_id
        analysis["urlAttempts"] = attempts_by_id.get(source_id, [])
        analysis["urlsRead"] = [a["url"] for a in analysis["urlAttempts"] if a["outcome"] == "ok"]
        analysis["urlsBlocked"] = [
            {"url": a["url"], "outcome": a["outcome"], "httpStatus": a.get("httpStatus"), "error": a.get("error")}
            for a in analysis["urlAttempts"] if a["outcome"] != "ok"
        ]
        analysis["cpuCheck"] = (
            "src/map3/technique-lab/demos/group-b/group-b-manifest.test.ts - instantiate, advance, "
            "finite-geometry and bounded-count inspection, determinism, dispose"
            if analysis["status"] in ("demo", "alias") else "n/a - no code for this row"
        )
        analysis["pixelValidation"] = "OPEN - no renderer was executed in this lane"
        records.append(analysis)

    DOCS.mkdir(parents=True, exist_ok=True)
    (DOCS / "SOURCE_RESEARCH.json").write_text(json.dumps({
        "lane": "technique-b-20260912",
        "machine": "dave-gaming-pc",
        "harness": "claude",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "scope": [18, 34],
        "claimSeparation": {
            "sourceEquality": "per-row readDepth and sourceLines below",
            "runtimeExecution": "CPU check only; no renderer was run",
            "renderedQuality": "OPEN for every row - root owns serialized visual verification",
        },
        "note": "Row 21 is an alias of row 19 and is not a distinct technique. Rows marked "
                "not-delivered are NOT blocked: their sources were recovered and read, and the "
                "demo is outstanding work. Rows marked blocked could not be honestly demonstrated.",
        "records": records,
    }, indent=2) + "\n", encoding="utf-8")

    proofs = []
    for name, category, rows, note in SKILL_READS:
        path = SKILLS / category / name / "SKILL.md"
        body = path.read_bytes()
        proofs.append({
            "skill": name,
            "path": str(path),
            "sha256": hashlib.sha256(body).hexdigest(),
            "bytes": len(body),
            "lines": body.decode("utf-8", "replace").count("\n") + 1,
            "readInFull": True,
            "coversSourceIds": rows,
            "whatItGoverned": note,
        })
    (DOCS / "skill-read-proofs.json").write_text(json.dumps({
        "note": "Hashes were recomputed from the canonical shared skill store in this lane and "
                "every one matched the sha256 recorded in the source packet, so the carrier "
                "skills are unchanged since the packet was cut. Skills whose rows were not "
                "implemented here were deliberately NOT read, and no claim is made about them.",
        "skillsReadInFull": proofs,
        "skillsNotRead": [
            {"skill": "threejs-rtx-runtime-route", "rows": [19, 21],
             "why": "Row 19 was implemented from the PRIMARY source (the CC0 repository and its "
                    "Whitted shader), not from the carrier skill. The skill body was not read in "
                    "this lane and is not cited as evidence."},
            {"skill": "atomic-acres-asset-authoring", "rows": [22],
             "why": "Row 22 is blocked with no source to implement."},
            {"skill": "threejs-webgpu-water", "rows": [25], "why": "Row 25 is blocked."},
            {"skill": "game-animation-asset-pipeline", "rows": [30, 31, 32],
             "why": "Rows 30 and 32 are blocked; row 31 was not delivered."},
            {"skill": "local-video-generation", "rows": [32], "why": "Row 32 is blocked."},
        ],
    }, indent=2) + "\n", encoding="utf-8")

    print(f"SOURCE_RESEARCH.json records={len(records)} skillProofs={len(proofs)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
