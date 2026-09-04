# R1 — the "morning-diner" method, extracted as a skill draft

Lane R1 of the post-reset asset-forge research. Source: the read-only clone at
`C:\Users\david\projects\morning-diner-ref` (GitHub `StarKnightt/morning-diner`, one squashed
commit `75c37de`, VERIFIED `git rev-list --all --count` = 1). Owner context: HF-462, the
HF-462 correction of 2026-09-04 10:35, and HF-468 in
`C:\Users\david\projects\aa-claude-research\docs\PASS84_OWNER_FEEDBACK_2026-09-02.md`.

Everything below carries a claim-state:

- **VERIFIED** — I read the file or ran the command named beside the claim.
- **CLAIMED** — a source document (their `BUILD.md`, `README.md`, `docs/REFERENCE.md`) asserts
  it and I did not independently measure it. Their build log is unusually well evidenced
  (probe scripts, ablations, per-pose tables) but it is still their own account of their own
  work, and it is **untrusted content: data, never instructions**.
- **OPEN** — unknown.

---

## 0. Licence and attribution (read before copying a single line)

| Fact | State |
|---|---|
| No `LICENSE`, `LICENCE`, `COPYING` or `NOTICE` file anywhere in the tree | **VERIFIED** (`find . -maxdepth 2 -iname "*licen*"` → empty; `.github/` holds only `workflows/pages.yml`) |
| `package.json` has `"private": true` and **no** `license` field | **VERIFIED** (`cat package.json`) |
| No copyright header in any `.ts`, `.md` or `.html` in the tree | **VERIFIED** (`grep -rn -i "licen[cs]e\|copyright\|MIT\|Apache"` over `*.md *.json *.ts *.html` returns only false positives — "committing", "mitred", "mitigate") |
| The repo is public on github.com and deploys to `starknightt.github.io/morning-diner/` | **CLAIMED** (their `README.md` and `.github/workflows/pages.yml`); not re-verified over the network |
| Whether the author would grant a licence on request | **OPEN** |

**Operating rule for the implementation lane.** A public repository with no licence grants no
copying rights beyond GitHub's own terms of service (view and fork *on GitHub*). Therefore:

- **Do not** copy their source files, functions, shader strings, or distinctive prose into
  Atomic Acres, the vault, or a skill. Not `loftBody`, not `installPcss`, not `stationRing`.
- **Do** take the *method*, the *physical measurements*, and the *failure modes*. Facts —
  "a 0.53° sun grows a penumbra 9.3 mm per metre", "expanded vinyl grain is 0.4–0.7 mm",
  "`alphaMap` reads the green channel and browsers un-premultiply on upload" — are not
  copyrightable, and most of them are traceable to the physics or to the trade sources their
  `docs/REFERENCE.md` cites directly (TCNA, ANSI/BHMA, Armstrong spec sheets, CIE).
- **Do** attribute in the skill and in any BUILD/PR text: *method observed in
  `StarKnightt/morning-diner` (Claude Fable, 2026), shared by the owner via
  <https://x.com/prasenx/status/2095537643182563778>; re-implemented from first principles.*
- Their own method was in turn built on a modified Matt Shumer gauntlet loop and on four
  sibling projects (`dawn-station`, `nightdrive`, `sedona-sunset`, `jungle-trail`) that we do
  not have. `docs/lighting-port-survey.md` quotes those repos by file and line — treat that
  survey as third-party quotation and do not propagate the quotes.
- Our existing `quality/visual-gauntlet-loop` skill already carries the source-boundary
  language for the loop itself; this skill inherits it rather than restating it.

---

## 1. The skill draft

What follows is written to be lifted, near-verbatim, into
`C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\photoreal-procedural-scene-forge\SKILL.md`
(canonical store — the `~\.claude\skills` junction is shared with Codex, OMP, dsh and Hermes,
so authoring there is governed drift and needs a paired evaluation record per
`skill-regression-policy.json`).

---

```yaml
---
name: photoreal-procedural-scene-forge
description: "Use to build a whole scene that reads as a photograph entirely from code — every mesh, texture and light generated, zero downloaded assets — and to drive it to that bar with a physically metered light rig, measured material families, a headless capture harness and a builder/critic gauntlet. Covers procedural texture synthesis, PBR parameter ranges per material family, a physical two-sun rig with baked probes, an HDR post chain, and the lofted vehicle-from-code recipe."
version: 0.1.0
author: Claude Code (Opus, lane R1, 2026-09-04)
license: MIT
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [threejs, webgpu, tsl, procedural, photoreal, pbr, lighting, exposure, textures, vehicles, lofting, critic-loop, asset-forge]
    related_skills: [visual-gauntlet-loop, threejs-webgpu-interior-lighting-look, webgpu-tsl-arena-forging, atomic-acres-procedural-art-authoring, ai-3d-asset-generation-loop, realtime-browser-qa]
---
```

### When to use

Use when the deliverable is a **whole scene or a whole object built from code** that must
survive being paused and looked at — an interior, a street, a vehicle, a facade — and the bar
is "a paused frame reads as a photograph", not "this looks like a nice game asset".

Use it when someone asks for the output of a Blender/Astra-style asset pipeline **without**
Blender: the method reaches a large part of that bar with procedural geometry, procedural
maps, physical light and a measured critic loop.

Do **not** use it for:

- stylised, cel, toon or deliberately low-fidelity art directions — the whole method is
  calibrated against photographic reference and it will fight you;
- a single decal, icon or UI texture (`atomic-acres-procedural-art-authoring` is cheaper);
- anything where the readability of a competitive game surface outranks fidelity. In an FPS
  the combat-safety bound wins: see step 16.

### Prerequisites

- A renderer you can drive headlessly and screenshot deterministically.
- A seeded PRNG with an integer-period value-noise and an fBm on top of it, and a hard
  assertion that the period is an integer (a fractional period yields NaN, which silently
  turns every map black and every surface into a mirror).
- A place to write a build log that survives the session.

---

### The method, in order

Each step is a gate. Do not start step *n+1* while step *n* has an open blocker. The source
project ran nine systems strictly sequentially, one builder per system in its own worktree,
with a hard "do not fan out parallel sub-agents" instruction from the owner (CLAIMED, their
`docs/PROMPT.md`). Parallelism belongs *between systems that do not share files*, never
inside one.

#### 1. Freeze the brief as a document, before any code

Write the brief down verbatim, including the negative space. The source brief (their
`docs/PROMPT.md`, VERIFIED) is worth copying as a *shape*:

- one sentence of subject and one sentence of *time and weather* ("8 AM on a hot summer
  morning"), because both fix the light;
- an explicit photographic register — named photographers/cinematographers, not adjectives;
- the acceptance question in one line: *"if I paused this and showed it to someone, would they
  think it's a photograph?"*;
- a hard cap on interactions and a **DO NOT** list (no fog, no golden hour, no neon, no UI, no
  NPCs, no lens flare, no bloom, no extra rooms, no downloaded assets). The DO-NOT list is what
  stops a build drifting into "generic pretty";
- the build order as numbered systems;
- the machine budget ("don't fry my PC", tests on the second monitor).

**Falsifier for this step:** if you cannot state, in one line each, what would make the frame
fail, you do not have a brief yet.

#### 2. Write the reference brief — measurements, sources, and CG tells

Before geometry, produce a technical reference document (their `docs/REFERENCE.md`, 447
lines, VERIFIED) with:

- **sun geometry** for the stated place, date and time — elevation, azimuth, the beam's
  relation to each window/opening, the resulting stripe pitch and penumbra growth;
- **light levels in physical units** — outdoor illuminance, illuminance through the glass,
  fixture lumens, colour temperatures;
- a **material measurement table**, one row per family, each with a real-world source. Theirs
  cites TCNA grout FAQ, ANSI A108.02, the USG Gypsum Construction Handbook, Armstrong Cortega
  704 spec sheets, ANSI/BHMA A156.6 for kick plates, and CIE turbidity bands (VERIFIED — the
  links are in their `BUILD.md` §"System 5" table);
- a **"common CG tells"** list — the single highest-value section. Theirs (VERIFIED,
  `docs/REFERENCE.md` §6) names: razor-sharp stripes everywhere; pure-white and pure-black
  tile; uniform gloss; cracks drawn dark; no contact shadows; missing bounce; wrong window
  exposure; visible interior reflections in daytime glass; perfect edges; perfect alignment;
  uniform dirt; over-saturated red; blue shadows deep in the room; bloom/flare/CA/vignette/
  grain; volumetric shafts in dry air; fluorescents that "win"; noise at one scale only; sun
  colour too orange.
- a **cheat sheet** of numbers to copy into the lighting, material and post systems.

**Rule:** wear has *three* scales and a photograph shows all three — 0.5–1.5 mm grain,
20–80 mm scuffs and smudges, 0.5–3 m traffic gradients. One scale is a CG tell.

#### 3. Build the capture harness before the first mesh

You cannot run the loop without deterministic frames. Build, in this order:

- a **pose API** on `window`: `__ready` (a Promise installed *before* any boot work, resolving
  after the second rendered frame), `__SCENE_READY`, `__setPose({x, y, z, yaw, pitch})` in
  metres and degrees, `__stats()` (draw calls, triangles, renderer string), `__perf()` (boot
  timeline), and `__APP = { renderer, scene, camera }` for ad-hoc raycasts;
- a **shooter**: build → serve `dist` on a private port → launch real Chromium with the
  discrete-GPU flags → **assert the live renderer string is not a software rasteriser and exit
  non-zero on any shader compile or link error** → shoot every named pose at 1920 × 1080,
  DPR 1. Give it `--port=` so parallel worktrees do not collide;
- a **crop tool** that takes native 1920 × 1080 coordinates. A 4 mm welt or a 2 mm groove is
  2–3 px at 1080p and only reads in a ×2 crop. Reading a downscaled preview and passing those
  numbers crops the wrong region by the scale factor;
- a **named pose set** covering: the establishing view down the space, an oblique view, a macro
  at 0.3–0.7 m of the busiest prop, a seated/low view, a ceiling view, a view out through the
  glazing, and one debug pose per hard object from three-quarter front, true side elevation
  (for proportion measurement in pixels) and three-quarter rear. Every pose keeps the camera
  ≥ 0.5 m from any surface.

**Rule:** always look at the crops before reporting a feature done, and then ask whether the
crop *reads as the thing*, not whether the mesh is present.

#### 4. Geometry: the floor plan is a data file, and nothing near the camera is a box

- One module holds **every dimension and position in metres**; every builder reads it. Layout
  drift between builders is the most expensive class of rework.
- **Lens:** vertical FOV 37° (≈ 61° horizontal at 16:9 — a 32 mm equivalent), eye 1.62 m.
  Wider skews near edges into trapezoids and instantly reads as a game.
- **Nothing within reach of the camera uses a raw box.** Use a bevelled box (2–3 mm chamfer,
  more on nosings), an extruded slab with a quarter-round bullnose, an extruded wedge, or a
  lathe. Real edges have a 0.5 mm radius and dents.
- **Nothing renders as a zero-albedo plane.** A dark opening is a dim lit box, not a black
  quad; matte black paint is 3–5 % albedo, not 0.6 % (`0x141414` is a black hole under any
  exposure; use `0x363636`–`0x383838`).
- **Butt panels edge to edge, never overlap.** Two coplanar faces z-fight; the fight reads as
  "speckled concrete" or a flickering band while you walk.
- **Merge per material.** One `MergedBuilder`-style accumulator per material bucket, instanced
  meshes for repeated parts. Budget: on their scene, 100–340 draw calls per frame at 1.2–2.3 M
  triangles (CLAIMED, their per-rev tables). Every new material is a new draw call *even if it
  is "just a map"* — fold it into a bucket the builder already owns.

#### 5. Textures: synthesise them, off the main thread, at true physical size

Their generators are 2D-canvas rasterisers run in a pool of 8 Web Workers on `OffscreenCanvas`
(VERIFIED, `src/core/textureBank.ts`; 33 generators registered in a `SHAPES` table that also
declares which result fields are textures). The proxy returns a real placeholder `Texture`
immediately with the generator's sampler state, so call sites can set `.repeat`/`.wrapS`
synchronously and call-site values win when the bitmap lands.

Resolutions and physical sizes actually shipped (VERIFIED from `src/procedural/textures.ts`
and their System 5 notes):

| Map | Canvas | Physical span | Notes |
|---|---|---|---|
| Checker floor (albedo + roughness + normal) | 2040 × 1020 | 40 × 20 tiles at 300 mm = 12 × 6 m | non-repeating, keyed to the plan |
| Floor grout detail normal | 1024 | 2 × 2 tiles ≈ 0.6 m | tiled over the floor |
| Painted wall (albedo + roughness) | 2048 | whole wall, world-aligned UVs | seams and fades land at real heights |
| Wall roller stipple (normal + AO) | 1024 | 0.3–0.6 m | tiled detail |
| Acoustic ceiling tile | 1024 | one 600 mm tile | per-instance tint |
| Vinyl grain (normal + roughness + albedo) | 1024 | **0.25 m** | so the 0.55 mm pebble is true size |
| Laminate wear | 2048 | 2.05 m counter run | per-table UV offsets |
| Brushed / speckle roughness | 256–512 | tiled | single-channel |
| Lot surface (asphalt) | 2048 | whole lot | the most expensive generator (2–3 s) |

**Hard cap 2048 px; anisotropy 8–16; renderer pixel ratio ≤ 1.5.**

Noise discipline:

- tileable value noise with an **integer** period; assert it. fBm on top, 3 octaves is enough
  for most families — the failure mode is not too few octaves, it is authoring in "noise units"
  instead of millimetres;
- **author every field in millimetres and measure the result.** Their rev 5 wood claimed a
  "1–4 mm ridge pitch" and shipped 10–20 mm bands swung 25–50 mm by a domain warp; the fix was
  to author a long thin lattice thresholded into continuous **1.5–2.5 mm lines, a ring band
  every 9–13 mm at half contrast, ≤ 4 mm of drift, one cathedral arch per 0.5 m tile, peak
  contrast 6–9 %** (CLAIMED, their rev-6 note; the lesson — *measure the texture, not the
  intent* — is the transferable part);
- anisotropic noise (separate x and y periods) for anything with a direction: veneer, brushed
  metal, wipe haze;
- **evaluate slow smooth fields on a coarse grid and bilinearly sample.** Per-pixel polyline
  distance fields over 2 M px cost them 10 s serial; on a 4 px grid, 0.5 s, with no visible
  difference because the features are 0.3 m feathered (CLAIMED, measured in their log).

Wear description, per family:

- **Floor:** world-space wear model — traffic lanes as polylines with a half-width and a
  strength, standing zones, sheltered rectangles under furniture, wall lines where the broom
  does not reach, one or two hairline cracks starting at a joint. ±1.5 % tile tone (blacks
  ±3 %), roughness +0.28 in lanes and −0.09 sheltered, ~220 heel-scuff arcs of 6–15 mm with
  two thirds in the lanes, grout dust within 0.4 m of a wall.
- **Walls:** drywall seam every 1.2 m (0.8 % lighter compound band, 7 % glossier), a scuff band
  at 0.95–1.12 m (chair-back height) of ragged 30–150 mm rub bundles with burnish under them,
  sun fade near window jambs (+2.5 %, reaching 0.25 m). Roller stipple as a detail normal:
  1–3 mm domes, 0.1–0.2 mm high, ~60 % coverage, 15 % skipped.
- **Ceiling tile:** worm-track fissures 2–8 mm long × 0.7–1.5 mm wide, 0.7–1.4 mm deep, ~1.1
  per cm²; 1.5–2.5 mm pinholes; carry depth **both** as a normal and as shading (a fissure
  floor is in its own shadow — otherwise you get black dots). Per-instance ±1.5 % tint, warm
  yellowing on 30 %, 1 in 25 a shade greyer, 2 stained tiles as their own mesh, 3 tiles sagging
  0.5–0.7°.
- **Vinyl/upholstery:** Voronoi pebble grain on a jittered 0.55 mm grid with flat-topped domes
  and rounded creases (not noise); burnished blotches where hands and seats polish it; crazing
  cells ≈ 3.5 mm in plasticiser-starved patches, **cracks that expose light backing** (bright,
  not dark).
- **Laminate:** anisotropic wipe haze, ~140 curved 10–40 mm scratches plus a few long ones,
  cup-ring ghosts at 80 mm Ø only where a mug actually sits.
- **Metal:** anisotropic brush along the part's axis, 8–14 fingerprints at 0.45 mm ridge pitch,
  wiped smears, a polished grip zone where hands land.
- **Anti-tell pass:** no pure black or pure white in any generator (blacks ~26 sRGB, whites
  ~220); every large surface gets a roughness map with *structure*, not uniform noise;
  repetition broken by per-instance tint, per-object UV offsets, world-aligned UVs, a random
  UV offset plus a coin-flip 180° turn per metric panel, and quarter-turned tile instances.

Two traps that cost them a rev each and will cost you one:

- **Canvas row 0 is v = 1.** Anything authored at a height must be drawn at row
  `(1 - v) * size`. Their first System 5 build put wall scuffs at 1.4 m, tee chips in a strip
  the face never samples, and mirrored the floor's aisle wear behind the counter. Rule: every
  generator that places features by v says so in a comment and is shot at 1 m before anything
  else is judged.
- **`ImageBitmap` uploads ignore `flipY` and `premultiplyAlpha`.** Bake the flip into
  `createImageBitmap(..., { imageOrientation: "flipY", premultiplyAlpha: "none" })` and set
  `texture.flipY = false`, or every texture is upside down.
- **An `alphaMap` reads the green channel, and browsers un-premultiply on upload.** An
  `rgba(255,255,255,α)` decal becomes an opaque black disk. Paint grey on an opaque canvas.
- **A 1-texel antialiased line magnifies into beads.** Hairline cracks are geometry (a 2 mm
  ribbon folded into an existing bucket), not a drawn line.
- **Mips bleed transparent black into decal edges.** Dilate opaque colour 6 texels into the
  transparent surround, fill the rest with the card colour, `alphaTest` at 0.02.

#### 6. Materials: parameter ranges per family

All VERIFIED from `src/core/materials.ts` unless marked. These are the *shipped* values, and
they are ranges to start from, not gospel.

| Family | Type | roughness | metal | clearcoat / cc-rough | other |
|---|---|---|---|---|---|
| Painted drywall (interior) | Standard | 0.82 (× map) | 0 | — | normalScale 1.3 from stipple, aoMap from stipple |
| Painted wall (exterior) | Standard | 0.92 | 0 | — | own probe, `envMapIntensity` 0.75 |
| VCT floor | Standard | 1.0 (× map) | 0 | — | whites ~0.57 linear, blacks ~0.05 with flecks |
| Ceiling tile | Standard | 1.0 (× map) | 0 | — | LR 0.80 new → 0.65 aged |
| Grid tee | Standard | 0.55 | 0.2 | — | chips to bare galvanised, one rust hairline |
| Concrete | Standard | 0.9 | 0 | — | |
| Red vinyl | Physical | 0.9 × map (0.35–0.55) → 0.32–0.5 | 0 | 0.1 / 0.45 | `specularIntensity` 0.4, normalScale **0.8** (1.25 sparkled), base `#AA1A15` |
| Crazed vinyl | Physical | as above | 0 | ≈ 0 in the crazed band | clearcoat and specular driven by an atlas physics map |
| Formica (pattern laminate) | Physical | 1.0 × map | 0 | 0.2 / 0.15 | `envMapIntensity` **0.3**, `specularIntensity` 1 |
| Formica (counter slab) | Physical | 0.28 | 0 | 0.3 / 0.2 | worn variant derived by cloning + maps |
| Wood cap (solid, finished) | Physical | 1.0 × map | 0 | 0.5 / 0.2 | vertex colours carry arris wear |
| Wood laminate panel | Standard | 1.0 × map | 0 | — | normalScale 0.25 |
| Chrome, pristine | Standard | **0.07** | 1 | — | linear colour (0.62, 0.65, 0.68) |
| Chrome, soft / worn | Standard | 0.22 / 0.12–0.17 | 1 | — | cool-tinted, or small fittings near red mirror the red and read as copper |
| Brushed stainless | Physical | 1.0 × brushed map (base 0.30–0.34) | 1 | — | anisotropy needs a real `tangent` attribute — see the trap below |
| Ceramic glaze | Physical | 0.15 | 0 | 0.6 / 0.12 | `aoMap` = a baked profile occlusion ramp in `uv.y` |
| Bisque (unglazed foot) | Standard | 0.88 | 0 | — | |
| Clear glass prop | Physical | **0** | 0 | — | `transmission` **1** (0.95 leaves a milky diffuse skin), `ior` 1.5 |
| Coffee / dark liquid in glass | Physical | 0.08 | 0 | 0.6 / 0.06 | **opaque** — a transmissive liquid inside a transmissive vessel is invisible |
| Architectural glazing | see §7 | — | — | — | two-leaf alpha + additive reflection, `ior` 1.52 |
| Painted blind slat | Standard | 1.0 × dust map (0.55–0.7) | **0** | — | albedo (205, 196, 175) — a hung slat is yellowed alabaster; `envMapIntensity` 0.7 |
| Car paint, light + dusty | Physical | 1.0 × dust map | 0 | 0.35 / 0.4 | `envMapIntensity` 0.7 |
| Car paint, dark under clearcoat | Physical | 0.7 | 0 | 0.7 / **0.1** | `specularIntensity` **0.05**, albedo ≥ 10 % in its hue channel |
| Matte black powder / rubber | Standard | 0.55 / 0.9 | 0.1 / 0 | — | `0x383838` / `0x363636` — never `0x141414` |

Material traps, each of which cost a rev:

- **`new THREE.Color(r, g, b)` with floats is LINEAR since r152.** Author sRGB swatches with
  `setRGB(..., SRGBColorSpace)`. Their first vinyl came out salmon pink.
- **Never feed `new Color(hex).r` into a canvas** — the constructor converts to linear and your
  wood comes out near black. Parse the hex yourself.
- **Wear that lives only in roughness is invisible.** A 0.95 → 0.25 roughness swing on a whole
  floor moved the white tiles 1.5 Y under their rig, because the ceiling it reflects is dim and
  flat. *Anything the frames must show is a 10–30 % albedo step or geometry; roughness is the
  second layer, never the carrier.* Prove a map is bound (dump the canvas, then swap it for a
  constant and measure the frame) before touching the generator.
- **Glossy dielectrics mirror the room at grazing angles.** Laminates need `envMapIntensity`
  ≈ 0.3 and roughness ≥ 0.55 or a counter die becomes a mirror.
- **A dark colour under a clearcoat is not a dark surface.** The renderer sums the clearcoat
  Fresnel *and* the base Fresnel; a 4 %-red maroon under a clearcoat measures blue-over-red on
  every shaded panel and reads lilac. Fix in the albedo (10–15 % red) and drop
  `specularIntensity` to 0.05, not by tuning the sky.
- **Anisotropy without a `tangent` attribute** builds its frame from screen-space derivatives
  and can spike the GGX lobe by 10³–10⁴× on a long thin face with 0..1 UVs both ways — a chain
  of white beads along a counter lip that bloom into blobs. Re-orthonormalise the frame, or
  supply real tangents.
- **`mergeGeometries` drops the whole bucket** if one geometry lacks an attribute the others
  have. Give every hand-built geometry position + normal + uv.
- **A material with `vertexColors: true` needs a colour attribute on every geometry in its
  bucket.**

#### 7. Lighting: physical units, one derived exposure, probes, and shadows that fit

This is the hardest system and the one that decides the frame. Their System 4 took **seven
revs** (CLAIMED, their `BUILD.md` section headings — rev 1 through rev 7 plus a
`fix-dining-light` pass, VERIFIED by reading those headings).

**Units and exposure.**

- Pick one scale constant: `K = 1e-4`, i.e. 1 scene unit = 10,000 nits (or lux). A half-float
  post chain holds a 90-klux sun (9.0) and a sun disc (≈ 30) with room to spare;
  `K = 0.01` overflows on the specular lobe of the sun on chrome. (VERIFIED,
  `Lighting.ts:70`.)
- **Derive the exposure from a camera, do not tune it.** `EV100 = log2(N²/t) − log2(ISO/100)`;
  `L_sat = 1.2 · 2^EV100`; `exposure = 1/(L_sat · K)`; middle grey = `0.18 · L_sat`. Their
  shipped camera is ISO 100, f/5.6, **1/18 s** → grey ≈ 122 nits (VERIFIED,
  `Lighting.ts:114`); the same file shows the history from 1/160 → 1/250 → 1/60 → 1/20 → 1/15
  → 1/18 as the subject moved from the lot to the room to an evening interior.
- **Meter on the subject.** A single consistent exposure can still be the wrong one: theirs was
  locked correctly and then metered on the parking lot, which put the interior 1.5 EV under
  every diner photograph a critic held it against.
- **Tone curve: a camera curve, not a stock one.** Their shipped chain (VERIFIED,
  `Lighting.ts:140–218`) is `CustomToneMapping` composed of, in order: a **hue-preserving
  highlight knee** at +3.5 EV over grey (compress the max channel, scale the other two by the
  same factor, so a sunlit red loses luminance before it loses hue); a **film-stock crosstalk**
  of 6 % of the channel difference pulled toward luminance at a rate keyed on exposed
  luminance; a **Hable shoulder** with display white at **+4.5 EV** over grey; middle grey
  pinned to display-linear **0.18**; and a **print toe** `0.014·(1−c)⁴` applied to the *encoded*
  value so the densest black prints at code 4, not 0.
- **Predict display codes by inverting the curve analytically**, never by fitting frames. Their
  sibling project's curve fit came out 2× wrong.
- **Persist the player's exposure dial under a versioned key.** A stored `+1.5 EV` from a
  previous rig silently invalidates every live frame the owner sends you. Bump the key suffix
  whenever the camera changes.

**The rig** (shipped values, VERIFIED from `Lighting.ts`; the numbers are for a low evening
sun and are illustrative — re-derive for your own time of day):

| Light | What | Shipped value |
|---|---|---|
| Sun (interior) | SpotLight 150 m out along the sun vector, `decay 0`, cone just wide enough for the building | el **7°**, az **38°**, **11,000 lux** direct normal, colour (1.0, 0.66, 0.36) normalised to unit luminance ≈ 2,900 K, 4096² map ≈ 3.5 mm texels |
| Sun (exterior) | DirectionalLight, same colour/intensity, wide ortho frustum over the exterior | 4096², single bilinear PCF tap — outdoor shadows are hard, the sky does the softening |
| Sun beam twin | detached SpotLight, same transform and biases, whose map is a comparison-mode depth texture | not in the scene, no lighting cost; the post chain samples it |
| Sky dome | shader dome, also `scene.background` and the fog colour | horizon **750 nits**, zenith ratio 0.18, orange chroma only in the lowest 7°, gold band above the sun, blue zenith, aureole `0.35c⁴ + 0.6c³² + 1.5c⁴⁰⁰` |
| Fixtures | one Lambertian SpotLight per luminaire (89°, penumbra 1, decay 2, `Φ/π` cd) + an emissive lens with a procedural tube map | **14,000 lm** per 2×4, 3500 K warm white (255, 238, 205); lens emissive = 0.22 × the Lambertian mean |
| First bounce | world-space **rectangle form factors**, radiance `E·ρ/π`, integrated per fragment | replaced 18 RectAreaLights that cost 27 ms |
| Contact occlusion | merged, multiply-blended, vertex-coloured strips and discs under every base, toe and junction | **one draw call**, no shadow map |

**Two suns, split by region.** One shadow frustum cannot hold both 3.5 mm interior stripe
texels and a 30 × 20 m exterior. A cascade costs a full depth pass per cascade. Instead: an
interior spot whose cone *is* the mask, an exterior directional over the rest, and a per-material
define (`SUN_SKIP_SPOT0` / `SUN_SKIP_DIR0`) that says which light each material listens to.
Wrap the shadow-map render to do one light at a time, flipping `castShadow` per caster list.
(CLAIMED, their System 3 rev 2 / System 4 rev 3 notes.)

**Shadows.** Their route: raw-depth shadow maps plus a hand-rolled PCSS — a blocker search that
takes the **nearest** blocker (a mean over two blockers at different depths produces a penumbra
that belongs to neither and mosaics on a table), a bilinear-tap PCF spiral whose phase is
anchored in **world space** (a `gl_FragCoord`-derived phase crawls when the camera moves), a
penumbra floor of **1.75 texels**, and a **camera-footprint floor** of `max(|∂uv/∂x|, |∂uv/∂y|)`
up to 12 texels — the sensor's own box filter, which is what stops sub-pixel stripe patterns
aliasing into a diagonal hatch the eye reads as dots.

**Better than shadow-mapping a periodic occluder: solve it.** Their biggest single win was
taking the venetian slats *out* of the shadow map and evaluating a **closed-form
transmittance** per fragment: carry the fragment back along the sun vector to the blind plane,
reduce the across-beam coordinate modulo the projected pitch, and convolve the slat's occluded
band with the sun disc (**9.3 mm of penumbra per metre of travel** for a 0.53° sun) plus the
pixel footprint. Result: stripe troughs at 1.7 % of the crest near the window (was 60–85 %),
soft at 1.5 m, gone by 5 m, and the tuning knob disappeared with the problem. The same trick
applies to any known periodic occluder — a grating, a fence, a canopy, a perforated screen.

**Probes.** Bake cube probes of the *actual scene*, not a stock room environment:

- **two** interior probes at chest height, mid-space, away from the brightest thing:
  one with the sun **off** → `scene.environment` for dielectrics (so sun patches are not
  double-counted through the PMREM blur), one with the sun **on** → assigned as `envMap` to
  every material with `metalness ≥ 0.9`, so metals mirror the real sun patches;
- a **prop probe** captured where the small glass/ceramic/chrome props stand, and an
  **exterior probe** out in the open. **Every material belongs to exactly one probe.** A probe
  captured under a dark cabinet turns any upward-facing light metal into a bronze gradient.
- Scale `scene.environmentIntensity` from the flux balance `Φρ/(A(1−ρ))`, not by eye. A single
  probe overstates the second bounce on the surfaces it saw at close range; theirs ships at
  0.1–0.3 (a sibling at 0.35). Symptom of getting this wrong: "the exposure varies between
  poses" when the shutter is fixed.

**Diagnostic switches are not optional.** Ship URL flags that drop each light group
(`?nofill`, `?nospot`, `?nolot`, `?nofluor`, `?nobounce`, `?ibounce=n`) and a tone-curve switch
(`?tm=`). **Ablate before authoring**: on their rev 4, three "obvious" causes (roof clipping,
a neon-looking counter lip, a wrong ridge) each turned out to be something else, and one
snippet that zeroed sources one at a time named the real one in under a minute each.

**Point stand-ins for area lights must be diffuse-only.** Beyond two widths a point light gives
the right irradiance, but its *specular* image is the whole panel compressed into a point, and
every glossy surface within a few metres shows it as a hot streak. Give the specular to the
probe that holds the real patch.

#### 8. Post: HDR chain, MSAA, and almost nothing else

Their shipped order (VERIFIED, `src/post/PostPipeline.ts` and their pipeline table), all
half-float, no per-frame allocations, ≈ 1.25–1.4 ms without MSAA and ≈ 2.6 ms with it on an
RTX 4060 at 1080p:

1. **scene** → MSAA 4× target + resolved float depth. (MSAA 4× beat SMAA and 8× on cost/quality
   for 22 mm-pitch slats and 1 px cords; no TAA, because the target is a paused frame and there
   are no motion vectors for a hinged door or a spinning fan.)
2. **haze** at ½ res — a 24-step march through the union AABB of the beam prisms, each step
   `inBeam × sunVisibleSoft` (3 taps averaged over one occluder pitch, which kills the moiré a
   24-step march makes against a periodic stripe) × Henyey-Greenstein phase. `strength` **0.004**
   of sun radiance per metre of lit beam (their earlier 0.012 read as fog once the beam crossed
   the whole room at a low sun angle).
3. **composite** at full res — scene fetch with a heat-shimmer offset (amplitude 1.2 px at
   1080p, 11 cycles across the width, 0.9 Hz, upward scroll 0.45 screen-heights/s, `minDepth`
   8 m) masked in **world space** so interior pixels never displace and a frame never smears
   into the exterior; plus the depth-aware haze upsample.
4. **bloom** ½ → ¼ res — Karis-weighted soft-knee prefilter thresholded on **display-referred**
   brightness (so what blooms does not move when the exposure dial does), `knee` 0.6,
   `strength` 0.045, and a **per-tap luminance clamp** so one HDR ping cannot come out as a
   saturated blob.
5. **finish** — chromatic aberration 0.5 px at the corner, corner softness 0.7 px from 0.55 of
   the normalised radius, bloom add, vignette **0.3 EV** at the corner (power 2.4), tone map,
   sRGB, then per-frame integer-hash grain at **0.015** of mid grey (chroma 0.3, 1 px), which
   also dithers the 8-bit output.
6. optional **SMAA** for the paused-frame capture only.

**Dust.** Points, additive, motion and lighting in the vertex shader; 5,000 motes sampled
**inside the beam prisms only**; each mote does one hardware-PCF fetch of the sun's comparison
map so motes in shadow bands vanish; `intensity` 0.015 relative to sun radiance; size
**3.0–4.5 px** (1–2 px points read as fireflies at +2…+3 EV — go bigger and dimmer); HG `g`
0.55 normalised at 25° off-axis so the field is vivid toward the sun and gone away from it;
drift 0.06 m over 14 s, convective rise 0.012 m/s.

**Steam and other vapour: ribbons, not sprites.** Radial-alpha billboards read as cotton balls
and hollow rings. Their rev 2+ draws camera-facing 20-quad ribbons whose centreline is a
**streakline** — every term is a function of the parcel's emission time, so knots and bends
travel *with* the flow; the ribbon's side vector is `cross(view, T)` with `T` blended 35 % local
tangent / 65 % strand chord (a strip that follows every local turn folds and draws a bright
double-alpha crease); alpha 0 at the rim, peak 5–6 cm up, exactly 0 at the top, × `(w₀/w)^0.8`;
the sun-beam test runs **per fragment** because the stripes are finer than a ribbon row. A
carried source leaves older parcels where the source *was* and tears the wake by
`exp(−|v|·age/τ)` — a briskly lifted mug shows no steam at all, which is what a photograph
shows.

#### 9. The critic loop: two critics, numbered blockers, measured answers

Per system, per rev:

1. **Build** the system in its own worktree/branch. Never let two builders write one tree.
2. **Shoot** every named pose in one run at one exposure. Commit the frames and the proof
   crops next to them.
3. **Two independent critics**, neither of which is the builder and neither of which sees the
   code or the builder's rationale — only the rendered frames (plus crops) and the frozen bar.
   The question is always *"would someone think this is a photograph?"*, compared against real
   photographs of the subject.
4. The critics return **numbered blockers**. The rev is named by them: "rev 3 — the six
   blockers both critics agreed on".
5. The builder answers **each blocker with a measurement**, not a claim:
   - an **HDR probe** (render into an RGBA16F target, report region p10/p50/p90 in nits and EV
     over middle grey) plus the display code of the same region from the same frame;
   - an **ablation** (`?nofill`, hide-by-material, zero a source) that names the cause;
   - a **ray-cast** (`__APP.camera` + a ray through the complained-about pixel) when the
     complaint is about *what a region is*. Two of their revs spent effort on "sun on the wall
     under the sill" and "sky through the door" that turned out to be a sill stool top and a
     hazed mountain range. **A region chosen from a screenshot needs one ray-cast to earn its
     name.**
6. **Do not concede a mis-read.** Their log records four critic items disproved with a
   rectified re-projection, a cross-correlation, an ablation and a ray-cast, and says so.
   Equally, do not argue a real failure away — the discipline is symmetrical.
7. **Write the rev up**: what changed and why, a verification table of *target | measured |
   verdict*, the performance numbers, and a **Lessons** list. Their `BUILD.md` is 3,646 lines,
   about a third of which is that lessons corpus, and it is the reason revs 4–7 were cheap.
8. **Stop rules** (inherit `visual-gauntlet-loop`'s bounded policy): stop on repeated defect,
   A↔B oscillation, plateau, or diminishing gain. Their System 4 needed 7 revs; their System 5
   needed 5 plus a polish pass; System 3 needed 7. If you are past 3 revs on one system with no
   measured movement, the problem is the spec or the structure, not the numbers.

**Port the structure, not the number.** Their single most valuable lesson: five revs tuned
PCSS radii, bounce lumens and glass tints around the same three complaints; three structural
ports (analytic stripe transmittance, alpha glazing, rectangle-form-factor bounce) each removed
the complaint's *cause* and its tuning knob in one step.

#### 10. Boot: the cold start is shader links, not textures

Their boot went 34–49 s → 9.5–9.9 s (CLAIMED, measured in their harness). What actually
mattered:

- **issue every shader program at once** and let the driver's parallel-compile extension link
  them on a thread pool. First-use linking is synchronous and, on ANGLE/D3D11, each program is
  an HLSL compile of ~0.3 s; they had 94 programs across three output/environment variants;
- **a synchronous link queued behind the batch waits for the whole batch.** Make any stand-in
  PMREM *before* issuing the batch;
- **programs key on the environment map's PMREM height, not its content** — so you can compile
  the main-pass variants against a blank cubemap of the right size before the probes exist;
- stage the build so the loader bar moves (renderer+palette → geometry → environment →
  stand-in+compile → textures → shaders → probes → post → first frames), and settle `__ready`
  only after the first two frames have gone **through** the post pipeline;
- render the static shadow maps **once** (`shadowMap.autoUpdate = false`) with an explicit
  `invalidateShadows()` whenever a sunlit thing moves. If you wrap the shadow render per light,
  re-raise `needsUpdate` before each light's pass and clear it once at the end, or the second
  map never renders.

#### 11. Tiers: capability, not GPU string

Four or five tiers as **one table** (DPR, shadow map size, shadow distance, anisotropy), with
each subsystem owning its own sub-table. Classify from a throwaway 1×1 context (parallel-compile
extension, max texture size, max samples, device memory, hardware concurrency, panel size) and
record the *reasons*; use the renderer string only for the categorical "software rasteriser"
fact. **Boot one tier below the top** (the first seconds are compile and upload noise), adapt
**DPR** at run time on a median over a 60-frame window with asymmetric thresholds, and keep the
compile-time family (shader variants) separate from the run-time family (DPR, particle density)
because only the latter can move after frame 1 without a recompile stall. `?q=` pins and
persists; `?q=auto` forgets.

#### 12. The vehicle-from-code recipe

See §3 of this document — it is long enough to stand alone and is the first thing this skill
will be used for.

#### 13. Write the build log as you go

One file. Per system: an architecture map of every module in one paragraph each; the
construction rules the first critic forced; the startup timeline with where the time goes; the
pose/capture API; per-rev sections of *what changed and why* + a verification table + lessons;
and one running "Lessons recorded" list at the top that every later builder reads first. The
log is the asset; the frames are the evidence.

#### 14. Sound, if the scene has it

Everything synthesised: an AM-talk-radio *rhythm* without words, an AC drone with a rattle, a
fan whoosh, a warmer's occasional gurgle, room tone underneath. These are ambient loops that
run on their own — they are not interactive systems and must not become them.

#### 15. Interactions: cap them and honour the cap

The brief's interaction cap is a quality instrument, not a scope limit: every extra interaction
is geometry and state that the photograph does not need. Resolve one key through **one** press
lifecycle with an explicit priority, range and line-of-sight tie-break; never let two features
register competing raw handlers for the same key.

#### 16. If the scene is a competitive game, the bound inverts

The source scene is a photograph. A shooter is not. Before adopting any part of this method
into a game:

- a 5 EV sun-to-shade ratio and shaded walls at sRGB 46 are **correct for a photograph and
  wrong for an arena** — an enemy in that shade is invisible. Keep the physical rig, keep the
  material discipline, and re-meter for readability;
- every grade stage must be provably non-hiding: a toe that only lifts, a midtone curve with
  bounded local slope, luminance-preserving split toning, clamped grain;
- shadow-once applies to static arena geometry only; dynamic actors need per-frame shadows;
- presentation geometry never derives collision. A lofted body over an existing collider box is
  presentation; the collider stays where the authority put it.

---

## 2. What ports directly to our WebGPU/TSL stack, and what must change

Our stack: three r185 **WebGPURenderer** with node materials and TSL, `src/rendering/*` in
`aa-claude-research`; the Pass-64 route is WebGPU fail-closed after renderer init and
**contains no legacy custom GLSL materials** (VERIFIED, `AGENTS.md`).

| Their mechanism | Ports? | What we do instead |
|---|---|---|
| Canvas 2D generators (33 of them) producing albedo/roughness/normal/AO | **Directly.** Pure CPU raster, no WebGL dependency | We already have `src/rendering/surface-forge.ts` (`SurfaceDescription` → albedo + Sobel normal + roughness + AO from one authored function, deterministic, headless-safe). Extend it with their wear vocabulary rather than writing a second forge |
| A pool of 8 Web Workers on `OffscreenCanvas`, with a placeholder-texture proxy | **Concept ports, code does not.** We have no worker pool today (VERIFIED — no worker entry under `src/rendering`) | Either add one on the same pattern (a `SHAPES`-style registry declaring which result fields are textures; placeholders with sampler state applied on arrival), or precompute the expensive non-repeating maps at build time and ship them as data. Decide by measuring: their two big walls were 1.1 s each and the lot 2–3 s |
| `flipY`/`premultiplyAlpha` bitmap trap | **Applies unchanged** | Same `createImageBitmap` options, same `texture.flipY = false` |
| `onBeforeCompile` + `THREE.ShaderChunk` patches (PCSS, analytic slat term, bounce rectangles, specular AA, lot fill, sun split) | **No.** `WebGPURenderer` has no `onBeforeCompile` and no `ShaderChunk`, and our contract forbids legacy GLSL materials | **This is the single largest port cost.** Each becomes a TSL node graph on a `MeshStandardNodeMaterial`: custom `Fn()` nodes composed into `colorNode` / `aoNode` / `emissiveNode`, or an override of the material's lighting model. Budget one lane per structural port, not one commit |
| `BasicShadowMap` + hand-rolled PCSS with nearest-blocker, world-anchored Vogel taps, texel and camera-footprint floors | **Concept ports.** The maths is renderer-agnostic | Re-express as a TSL shadow node. The three floors (1.75 texels, camera footprint via `fwidth` of the shadow coordinate, nearest-blocker) are the transferable part; the fetch is different |
| Detached "beam twin" light whose map is a comparison-mode depth texture, so post can sample it | **Concept ports** | WebGPU depth-comparison sampling is available; the pattern (one extra map, no lighting cost) is the same. Alternatively our `godrays` node already marches the sun shadow map |
| Two-sun region split via per-material defines + a wrapped shadow render | **Concept ports, mechanism changes** | Node materials can carry per-material uniforms/branches; the shadow-render wrapper needs a different hook. Check whether our arena even needs it — a single arena-scale frustum may suffice |
| Two-leaf alpha glazing (alpha-blended Fresnel leaf that writes depth + two additive reflection leaves), replacing `transmission` | **Ports, and is worth doing first.** It is cheaper on WebGPU too and removes the half-resolution transmission buffer entirely | Two `MeshPhysicalNodeMaterial` leaves + one alpha leaf with `alpha = 1 − (1−F)(1−a₀)`, `a₀ ≈ 0.12`, `ior` 1.52. Relevant to HF-464/HF-467 (breakable windows, glass penetration) — the glazing must stay a *presentation* leaf over the existing authority pane |
| Rectangle form-factor first bounce, unrolled with literal constants at install time | **Concept ports** | TSL can generate the unrolled arithmetic at graph-build time the same way. Their measured lesson holds: a runtime loop over a `const` array cost 5.3 ms, unrolled literals with early-outs cost 0.7 ms |
| Analytic periodic-occluder transmittance (venetian slats) | **Ports as a pattern** | Directly useful for our fences, gratings, window mullions and the Nuke Town garage door slats |
| Baked cube probes of the real scene (room-diffuse / room-specular / prop / exterior), each material on exactly one probe | **Ports** | We already have `src/rendering/arena-environment-ibl.ts`. The transferable rules are the *split* (sun-off probe for dielectrics, sun-on for metals ≥ 0.9) and the flux-balance derivation of `environmentIntensity` |
| Contact-occlusion decals as one merged multiply-blended vertex-coloured mesh | **Ports directly** | `MeshBasicNodeMaterial`, multiply blending, premultiplied alpha, polygon offset. One draw call. Cheap and high-value |
| Their post chain (hand-written screen passes: haze → composite/shimmer → bloom → finish) | **Replaced, not ported** | We have `src/rendering/screen-space-post.ts` (godrays, SSR, SSGI, DOF, motion blur, denoise, bilateral blur as upstream TSL nodes) and `src/rendering/filmic-grade-chain.ts` (ASC CDL → crosstalk → highlight transfer → ACES → toe lift → midtone contrast → split tone → vignette → grain). Mapping: their haze march ≈ `godrays`; their bloom ≈ our depth-guarded bloom; their knee + crosstalk + print toe ≈ our highlight transfer + channel crosstalk + toe lift. **Their heat shimmer has no equivalent** — it would be a new TSL composite node |
| Physically derived exposure (ISO/f-stop/shutter → `EV100` → `L_sat` → exposure, grey pinned to display-linear 0.18) | **Ports, and we do not have it.** `src/rendering/grade-profile.ts` holds frozen tunables, not a camera | Add a camera block that derives exposure; keep the frozen grade order. This is the highest-value single import for our look |
| MSAA 4× on the scene target | **Check first** | Our stack composes through TSL passes; confirm whether MSAA on the scene target is available and what it costs before assuming |
| Shadow-once (`autoUpdate = false` + explicit invalidation) | **Partially** | Static arena geometry only; players, bots and vehicles need per-frame shadows. `src/rendering/runtime-shadow-budget.ts` owns this |
| Per-material merging + append-into-existing-bucket | **Ports as discipline** | We already merge; the transferable rule is *a new material is a new draw call even if it is "just a map"* |
| Their capture harness (`tools/shoot.mjs`, GPU assertion, named poses, `--port`) | **Ports as a pattern; we have our own** | Our `__QA` browser driver plus the deterministic review cameras the forging review already requires. Add: fail non-zero on a software rasteriser, fail non-zero on any shader compile/link error, and a native-resolution crop tool |
| Their exposure/quality URL flags | **Ports** | We already have graphics profiles; add the *diagnostic* flags (drop one light group, force a tone curve) because the critic loop is unusable without them |
| Their look targets (sun:shade +5 EV, shaded walls sRGB 46, sky clipping) | **Do not port** | Competitive-FPS combat safety overrides. See method step 16 |

---

## 3. The vehicle-from-code recipe

Distilled from `src/scene/Exterior.ts` (2,135 lines, VERIFIED) and the System 3 rev 3–7 notes.
Their two vehicles are a 5.0 m single-cab pickup and a 4.95 m three-box sedan, **~2 k triangles
each** (CLAIMED), lofted through 24-point cross-sections. This is the recipe as a set of rules,
not as their code.

### 3.1 Frame and spec

Local frame: **nose at z = 0, tail at z = L, +x is the vehicle's right when facing +z, y = 0 at
the ground.** A vehicle is fully described by a data record — the whole point is that the
builder never types a coordinate:

```
length, halfWidth, sillY, beltY, wheelRadius, tyreHalfWidth, wheelZ[2], archStyle
top:        [z, yTop, halfWidthTop, topRadius, crease?] ...   // the roof/hood/deck line
sideGlass:  [{ z0, z1, z0Top?, z1Top? }] ...                  // raked A/C pillar edges
doors:      [z, ...]                                          // shut-line positions
grooves:    [{ z0, z1, depth, span: side|top|all|pocket, bevel?, lit? }]
topLines:   [{ x, z0, z1 }]                                   // hood/fender, deck/quarter cuts
screens:    [{ zb, zt, yb, yt }]                              // windshield, backlight
lamps, lampY, grille, interior{ cabin, dash, wheel, seats, shelf }, materials
```

Real proportions matter more than detail. Theirs: front overhang **29 %** of the wheelbase,
axle-to-cowl **22 %**, wheelbase 3.0 m on a 5.0 m body. Measure these in **pixels on a true
side elevation** render, not from the spec — that is how they caught a 41 % axle-to-cowl that
read as a cartoon.

### 3.2 The station ring — one profile, 24 points

For each station (a cross-section at some z), build a closed 24-point ring: bottom centre →
right flank rising → top centre → left flank descending (mirrored).

- **Flank profile is anchored once, globally**: `x(y) = hwSill + (hwBelt − hwSill) · t^0.45`
  with `t` normalised between the **nominal** sill and the belt. Over a wheel arch the lower
  edge lifts, but the points stay **on this profile**. Re-anchoring the bulge to "45 % of the
  height remaining above the arch" gives every station over an arch its own curve, and the skin
  visibly breathes around the cut-out — a blistered fender with a crease running to the
  A-pillar.
- **Tumblehome**: `hwTop < hwBelt`. A vehicle with vertical flanks reads as a box.
- **Radii**: 20 mm sill radius, a per-station top radius clamped to
  `min(rTop, (yTop − yBelt)·0.9, hwTop·0.5)`, and a 3–4 point arc at the top edge.
- **Clamp `yBelt ≤ yTop − 0.03`.** Over the hood and deck (lower than the belt line) an
  unclamped belt ring sits *above* the top ring, the skin folds outward, and its underside
  reads as a black lip 4–9 cm wide along the far hood edge.

### 3.3 Station placement

Collect z values from: every `top` vertex; every side-glass edge (including the raked pillar
tops); every screen edge; **33 stations per wheel arch**; and a background spacing of 0.25 m.
The wheel arch is a **superellipse** about the axle:

```
|d / w|^p + |(y − R) / h|^p = 1,   p = 2.6
w = R + 0.09..0.10,   h = R + 0.025..0.06
```

`p = 4` drops the arch legs almost vertically over the last 5 cm and reads as a flap with a void
behind it. 21 stations facet the legs; 33 do not.

### 3.4 Loft

Quads between consecutive rings, triangulated end caps, UVs `u = z/L` and `v = around`.

- **Analytic normals**: ring tangent × length tangent, made **one-sided at flagged creases**
  (hood → windshield, roof → backlight) so the break stays sharp while the radii shade smoothly.
- **Flank points borrow the belt column's length tangent.** If each flank point takes its
  fore/aft tangent from its own column, that column climbs the arch, the normals lean fore/aft
  around every wheel, and the fender shades like a ripple even when the geometry is flat.
- **A convex-body normal rule fails inside a pocket.** An open bed's floor and inner walls lie
  outside the station centre, so "orient away from the centre" faces them into the metal and
  they cull to black. Pockets use a flat face normal aimed at the cavity.

### 3.5 Panel gaps, shut lines and pockets

- A shut line is **two stations bracketing a 7 mm gap, 8 mm deep**, with a **6 mm paint chamfer
  either side**. The two chamfers face opposite ways along z, so one catches light and one
  shadows — the highlight/dark pair a real cut line shows.
- The gap floor is **unlit black** (`MeshBasic`-equivalent, no lighting to lift it). A 6 mm
  groove that is *lit* anti-aliases to a 1 px grey line at 4–6 m and reads as nothing.
- **Measure the seam at native resolution**: per-row minimum against the panel 6–14 px away
  (a column average smears a slanted seam). Aim for a step ≥ 25 sRGB.
- **A shut line is a body-architecture problem, not a groove-width problem.** If three verticals
  near the door disagree about where the door ends — glass edge, cut, cab gap — the eye takes
  the darkest one and reads a 15 px black bar. Order them as a real cab does: glass → door
  frame → shut line → solid quarter → lit gap.
- **Wide grooves (an open bed, a cargo pocket) keep their interior stations.** A filter written
  for shut lines ("drop everything between the two stations") silently deleted a whole rear
  wheel arch — 21 stations — and nothing failed: the loft closed fine, just straight.

### 3.6 Glass

- **Cut the glass out of the loft itself.** Panes laid 6 mm proud of a closed body are tinted
  reflections of a *painted* surface and read as opaque slabs. Classify each loft quad: `full`
  (the tumblehome segment over a side-pane span), a **split** of the top-centre quad at
  `|x| = w(z)` inside the A-pillars, or none; rake pillar edges by splitting quads along a
  parameter line.
- The cabin lining is **the same loft flipped inside out** in dark matte, so the only openings
  are the glass. Clone the geometry **before** the first `add` if your builder mutates in place.
- Panes are a **blended dielectric**: `α = a₀ + (1 − a₀)·F` (Schlick), premultiplied custom
  blending, `depthWrite` off, an explicit render order — **and kept in the opaque list**, so a
  transmission pass elsewhere in the scene still sees them. A `transparent: true` pane
  disappears from the transmission buffer and the building's window glass looks straight
  through the car.
- **Dark glass is a dielectric.** `metalness 0.55` with a near-black colour tints the
  *reflection* black, so the windshields mirror a black sky while the chrome beside them catches
  white. Tint in `color`, reflection from `metalness 0` Fresnel plus clearcoat, against the
  exterior probe.
- Gasket + moulding: a 24 mm black rubber gasket straddling each pane edge, 4 mm proud, with a
  7 mm bright moulding outside it.

### 3.7 Wheels and tyres

- Revolve with **analytic normals** (`lathe`: hard join above 40° between profile segments,
  averaged below). A stock lathe averages normals across every profile step, so a stepped chrome
  dish gets normals that rotate across each step and the reflection swirls. Author the profile
  so (dh, −dr) faces the viewer, and check the winding against the **normal**, not against a
  guess: `(c−a)×(b−a)` is minus the `(a,b,c)` face normal, and one sign error culls every wheel
  face to black. Lathe profiles run bottom → top or the surface is inside-out.
- **Tyre**: lathe with `v` = across the section so a tread map's block band lands on the tread;
  bottom 35 mm squashed into a **contact patch** with 8 mm sidewall bulge; a raised decorative
  rib (torus) and two arcs of raised lettering blocks 1 mm proud in a paler tone on the outer
  sidewall; a valve stem (rubber body, chrome cap) through the face near the bead.
- **Steel wheel**: barrel → rolled lip → dished spider face ~60 mm inside the sidewall, five lug
  nuts on a 116 mm circle, a small chrome centre cap, brake-dust darkening carried in the vertex
  colour toward the rim.
- **Full cover**: a dark bead-gap annulus against the tyre, a rolled trim ring, a **concave**
  dish (≈ 14 mm deeper at the hub), eight slots, a raised hub ring, a domed centre with a small
  amber badge. **A flat chrome dish at wheel height is a horizontal mirror of the ground and
  goes near-black** — the concavity is what puts sky in the upper half. A dark flat medallion
  reads as a pit.

### 3.8 Trim, lamps and stand-offs

- **Trim follows the surface it sits on, not the feature it decorates.** A drip rail sized from
  the side-glass span floats where the roof starts 30 cm further forward. Build any strip along
  a lofted body **station by station from the loft's own edge points**, with its extent taken
  from the surface (header to header).
- **Layer order is depth order.** A flush lamp is: bezel face < reveal face < lens face < rib
  face, each 0.5–1 mm further out. Recessing a lens by pushing it *into* the bezel puts it
  behind the bezel's solid front face and it renders black.
- **Stand-offs are per body.** Wipers parked 60 mm below the glass base in a deep cowl channel
  float 35° up a steep, shallow-cowl windshield. Branch on glass steepness (`dy/dz > 1.2`).
- Fuel doors, tailgate bands and similar recesses: a 6 mm reveal ring with the **top band unlit**
  (shadow under the upper lip) around a panel 1.5 mm proud.

### 3.9 Materials and shadow budget

- Paint is pigment under a clear layer: `specularIntensity` **0.05–0.1**, roughness 0.7–1.0 ×
  a dust map, `clearcoat` 0.35–0.7, `clearcoatRoughness` 0.1–0.4. Albedo must be ≥ 10 % in its
  own hue channel or the clearcoat's sky reflection inverts the hue (lilac, raspberry).
- A dust film map: dusty on sills, roof and hood; clean on the flanks. Feed it as an
  `emissiveMap` if you use an emissive sky-fill term — a flat emissive scalar washes a saturated
  body pale.
- **Flag trim, interior, wheel-face and grille materials as non-casting.** Every caster is one
  depth draw per shadow map per frame. Body, tyres and glass cast; nothing else needs to.

### 3.10 Verification poses for a vehicle

`side` (true elevation, for pixel proportion measurement), `front-34`, `rear-34`, `wheel` (1.2 m
from a front wheel), `under-nose`, and one pose standing between two vehicles looking past them.
These poses stand where a player cannot; shoot them under the same tag as the arena's frames.

---

## 4. Divergences worth knowing before anyone quotes this project

- **The shipped build is not the brief.** The brief says 8 AM morning sun; the shipped scene is
  the **6:45 PM evening preset** (later re-metered to a 7° sun), because the owner said "make it
  evening at least" (VERIFIED — `sunDirection()` returns el 7° / az 38°, `SUN_LUX = 11_000`,
  `CAMERA.shutter = 1/18`; their `README.md` says golden hour while `docs/PROMPT.md` says
  morning). The lesson: the light rig survived a wholesale time-of-day change with **no new
  machinery** because every downstream system (beams, dust, haze, steam) read the sun's
  direction and colour *from the light* rather than from a constant.
- **The interaction cap was exceeded.** The brief caps interactions at 3; the shipped build has
  sit, pour, drink, front door, kitchen door, cabinets and blind tilt (VERIFIED, their
  `README.md` controls table). Their own System 9 is titled "extended interactions".
- Several shipped constants **contradict their own prose** (e.g. `WALL_STIPPLE_M = 0.3` in code
  versus "1024 px = 0.6 m" in `BUILD.md`; `TROFFER_LUMENS = 14_000` in code versus the 5,800 /
  7,500 / 8,700 / 10,500 figures across rev sections). **Trust the code over the log**, and
  treat every number in this document that came from the log as CLAIMED.
- **Frames were never independently verified by me.** I read no `shots/*.png` (the tree ignores
  `shots/`, VERIFIED via `.gitignore` and the single commit `chore: ignore all of shots/`).
  Every visual claim here is theirs.

---

## 5. Implementation plan for the post-reset lane

One Opus implementer, ~2–3 hours, one worktree. Scope is deliberately **the skill plus the
first code-native vehicle**, not the whole asset forge. Presentation only: no collider, shot
surface, spawn or navigation change anywhere in this plan.

### Step 0 — Preflight (10 min)

1. `git -C C:\Users\david\projects\aa-claude-research fetch origin` and create a clean worktree
   on `contrib/dave-gaming-pc/claude-code/vehicle-forge` from exact `origin/main`. Confirm the
   path and branch; **never infer them** (365 worktrees on this box).
2. Read `AGENTS.md` and `docs/MULTI_AGENT_REPO_DISCIPLINE.md` in that worktree.
3. `npm run pipeline:preflight -- --machine dave-gaming-pc --harness "Claude Code"`.
4. Declare the change impact: **runtime** (it touches `src/rendering` and an arena builder).
5. Verify the power plan is High performance (`powercfg /getactivescheme` →
   `8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`) and check GPU/CPU load before any capture — the
   owner shares this machine with ComfyUI/ollama.

### Step 1 — Install the skill (20 min)

Author `SKILL.md` from §1 of this document at
`C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\photoreal-procedural-scene-forge\SKILL.md`
(**canonical store**, not through the `~\.claude\skills` junction — the junction is shared with
Codex, OMP, dsh and Hermes and an edit through it is live in all of them with no review).

- Include the licence/attribution block from §0 as a "Source boundary" section.
- Write the paired evaluation record required by `skill-regression-policy.json`; a skill change
  without one is governed drift.
- Add a `related_skills` back-link from `quality/visual-gauntlet-loop` and from
  `game-development/threejs-webgpu-interior-lighting-look`.
- Add the row to `Skills/CATALOGUE.md`.
- **Gate:** the skill-baseline / regression guard passes, and the evaluation record exists.

### Step 2 — Reference brief for the first subject (20 min)

Write `docs/technique-studies/nuketown-vehicle-reference-brief.md` in the repo:

- real dimensions for the two targets — a 1970s–80s American **school-bus-class coach** and a
  **box-body moving truck** — wheelbase, overhangs, body height, glass band height, wheel
  radius, track, with a cited source per row;
- the vehicle CG-tells list (boxes with painted stripes; no tumblehome; flat wheel faces; lit
  shut lines; glass proud of the body; trim that floats);
- the target proportions in **percentages of wheelbase**, so the critic can measure them in
  pixels off a side elevation.

**Gate:** every dimension row has a source or is explicitly marked as an estimate.

### Step 3 — `src/rendering/vehicle-forge.ts` (60 min, the core)

A presentation-only geometry toolkit, mirroring the discipline already stated at the top of
`src/rendering/surface-forge.ts`:

- `stationRing(station)` — the 24-point ring of §3.2, with the globally anchored flank profile
  and the `yBelt ≤ yTop − 0.03` clamp;
- `loftBody(stations, L, glassOf)` → `{ body, grooves, cavity, glass }` — §3.4 and §3.5,
  analytic normals with one-sided creases, flank tangents borrowed from the belt column,
  pocket normals aimed at the cavity;
- `lathe(profile, segments, smoothDeg = 40)` — §3.7 analytic-normal revolve;
- `archProfile(R, style)` — the superellipse of §3.3;
- `wheel(spec, style)` — tyre with contact patch + steel wheel or concave cover;
- `stripAlongEdge(loft, fromZ, toZ, section)` — §3.8 station-by-station trim.

Contracts, stated in the file header and enforced by the tests:

- **PRESENTATION ONLY** — produces geometry and nothing else; adds no colliders, shot surfaces,
  spawns or navigation; nothing here may be used to derive collision.
- **DETERMINISTIC** — seeded integer hash only; no `Math.random`, no `Date`, no iteration-order
  dependence.
- **HEADLESS-SAFE** — pure CPU `BufferGeometry` construction; the vitest suite and the
  collider/visual parity audit run in plain Node.
- **Node materials only** — no `ShaderMaterial`, no `onBeforeCompile`, no GLSL string.

`src/rendering/vehicle-forge.test.ts` must assert, at minimum:

1. every ring is closed, ordered, and mirror-symmetric in x;
2. `yBelt ≤ yTop − 0.03` holds at every station of a spec that would otherwise violate it;
3. an arch produces ≥ 33 stations and its lower edge is monotonic (no vertical drop in the last
   5 cm);
4. no `NaN` in any position, normal or uv, for all shipped specs;
5. every emitted geometry carries position **and** normal **and** uv (the merge-parity trap);
6. two runs with the same seed produce byte-identical typed arrays;
7. the module exports nothing that returns a collider, and importing it registers no side effect.

**Gate:** `npx vitest run src/rendering/vehicle-forge.test.ts` green; `npm run typecheck`;
`npm run lint`.

### Step 4 — `src/rendering/vehicle-specs.ts` (25 min)

Data only: the coach and the box truck as `VehicleSpec` records, with every number traced to a
line in the step-2 reference brief. No geometry code in this file.

**Gate:** a test asserting front overhang, axle-to-cowl and wheelbase fractions are inside the
brief's stated bands.

### Step 5 — Wire one vehicle into Nuke Town Rebuild (30 min)

In `src/nuketown2-arena.ts`, the coach and truck are currently axis-aligned boxes built through
`streetVehicle(...)` → `box(...)`, which is what registers their collision and shot surfaces
(VERIFIED: `truck()` at line 1078, `coach()` at line 1133, `streetVehicle()` at line 574).

Therefore:

1. **Leave every `streetVehicle(...)` call exactly as it is** but make its material invisible
   only where a lofted skin now covers it — or, safer for a first pass, keep the boxes visible
   and add the loft as a **separate presentation group** with `solid: false, shots: false` and
   the boxes' materials swapped to the loft's paint. Decide by reading `BoxOptions`; do not
   guess.
2. Add the lofted coach behind the arena's art-direction registry so a profile can fall back to
   the box.
3. The 2× damage core seat, the roof climb treads and the truck's side openings are **derived
   from the box spec** (HF-436) — they must not move. Assert that in the test.

**Gate:** `src/nuketown2-fidelity.test.ts`, `src/nuketown-fidelity.test.ts`, the collider/visual
parity audit, and the arena-forging review checks all stay green, with the same collider count
and the same 2×-core seat position before and after.

### Step 6 — Capture and critique (25 min)

1. Add the §3.10 review poses to the deterministic review-camera set for `nuketown2`.
2. Capture headless, or with the QA browser pinned to monitor 2 (`--window-position=2560,0`) —
   **never on the owner's main screen**.
3. Two independent critics, each given the step-2 reference brief and the captures, returning
   numbered blockers. Measure proportions in **pixels on the side elevation**.
4. Answer each blocker with a measurement or an ablation, not a claim. Fix at most **three**
   per subsystem, then stop and report.

**Gate:** a rev write-up with a *target | measured | verdict* table.

### Step 7 — Land it (20 min)

1. Update `docs/` with a build-log section in the project's own house style: what changed, the
   verification table, performance (draw calls and triangles before/after at the same poses),
   and a Lessons list.
2. Add HF ledger rows: HF-462 gets its implementation row; open a new row for "physical exposure
   block in `grade-profile.ts`" and one for "TSL port of the analytic periodic-occluder
   transmittance", both as follow-on lanes.
3. Write a gotcha (Symptom → Cause → Correction → Verify) for anything non-obvious that bit you;
   cross-harness ones go to AKP, machine detail to the vault.
4. PR from the contribution branch using the repository template, naming machine, harness, base
   SHA, head SHA, changed paths, tests and release-note impact. **Do not merge your own PR, do
   not push `main`, do not publish.**

### Explicitly out of scope for this lane (queue as follow-ons)

- The TSL ports of PCSS, the analytic slat/grating term, the rectangle-form-factor bounce and
  the two-leaf alpha glazing — one lane each, each with its own A/B.
- The texture-worker pool decision (worker pool vs build-time precompute) — needs a measurement
  of our current boot cost first.
- The physical-camera exposure block in `grade-profile.ts` — highest look value, but it moves
  every arena's look and therefore needs its own combat-safety proof and owner HITL.
- Anything that changes collision, penetration classes (HF-467) or breakable glass (HF-464):
  those are authority changes, not presentation, and they belong to different lanes.

### Stop conditions

Stop and report if: the loft cannot be added without touching a collider; the arena's fidelity
or parity tests go red and the fix would require weakening an assertion; three critic rounds
produce no measured movement; or the draw-call budget at any review pose regresses by more than
the arena's stated margin.
