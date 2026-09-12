# Houses lane — skill-use receipt

Lane `houses-night-20260912`, harness `claude`, model `claude-opus-5`, effort `xhigh`,
machine `dave-gaming-pc`. Base and dispatch SHA `6e9b2cafd318ca2b2f67f9eedcf8d624fee30453`.

A mention or a read is not implementation. Each row below names the technique that was actually
adopted, the file and construct that implements it, and what remains unvalidated.

## Resolved skills

The three skill paths were read through the governed per-skill junctions under
`C:/Users/david/.codex/skills/<skill>/SKILL.md`. Each junction resolves into the canonical
categorised store; the resolved path and the SHA-256 of the exact bytes read are:

| Skill | Resolved canonical path | SHA-256 of `SKILL.md` |
|---|---|---|
| `atomic-acres-asset-authoring` | `C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\atomic-acres-asset-authoring\SKILL.md` | `57c1bb9e333ad99cd428f5cd03090d997ed0647d7b1be24581cd01b38dfd79c4` |
| `ai-3d-asset-generation-loop` | `C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\ai-3d-asset-generation-loop\SKILL.md` | `c411b9d7d50a1dcc4c5e5b41e1f7f9a99558f6f75b208287182b73aaa8c22bc0` |
| `photoreal-procedural-scene-forge` | `C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\photoreal-procedural-scene-forge\SKILL.md` | `fcf059f08eed0bb2f23a630f07a7e74cf48aa3254135be1932de5bcbb7c92d8c` |

No skill file was edited during this run, and no global config was touched. The canonical store
is shared by every harness on this machine; authoring in it would be governed drift.

## Original sources actually inspected

These are the sources consulted for the work itself, distinct from the skills that route to them.

- `src/world-studio/architecture/house.ts` (1023 lines, read in full across two pages) — the
  authoritative procedural shell whose dimensions, aperture declarations, stair contract and
  garage wing this lane must preserve.
- `src/world-studio/architecture/build.ts` and `src/world-studio/arena.ts` — read to establish
  the exact glass solid id (`<house-id>-<wall>-<opening>-glass`, `build.ts:290`) that
  `arena.ts:37` lower-cases into `world-studio-window:<id>`. The GLB's `atomic_window_id`
  extras are generated from that exact rule in `house_contract.py:window_runtime_id`.
- `src/world-studio/blender-assets/index.ts` — the existing, accepted loader lifecycle
  (immediate root, `ready` that never resolves early, disposal that wins the race with an
  in-flight load). The houses loader is built on that shape rather than a new one.
- `scripts/blender/world-studio/blender_launcher.py` — the CPU-only, `O_EXCL`-locked,
  `CREATE_NO_WINDOW` launcher contract this lane's `run_houses.py` reproduces with its own
  owner tag.
- `VISUAL_CONTRACT.md` (overnight work directory) — the partition keys, semantic node
  signatures, transform signature and acceptance gates.
- Owner concept images `codex-clipboard-5e010137` (street hero), which is the frame the teal
  and yellow exteriors were matched against for palette, massing, pergola and chimney.
- Official API authority, as the machine rule requires: the Blender 5.1 glTF 2.0 manual and the
  three.js `GLTFLoader` documentation, both pinned in `VISUAL_CONTRACT.md:236-249`. Installed
  versions were checked rather than assumed: Blender reported `5.1.2` at runtime and the
  repository's own `three` import surface was used unchanged.

## Techniques extracted and where they are implemented

| # | Skill | Technique adopted | Implemented at | Changed output |
|---|---|---|---|---|
| 1 | `ai-3d-asset-generation-loop` | **Route decision per asset, written down with the reason.** Architecture is explicitly the code-only procedural route: deterministic regeneration, zero licence exposure, diffable source. | The whole lane is code-only; no image-to-3D and no registry asset. Recorded as `method` in `catalog.json`. | Both GLBs are regenerable from source with no external input. Verified: two independent runs produced byte-identical GLBs (`5f5d3a81…`, `5195ff19…`). |
| 2 | `ai-3d-asset-generation-loop` | **A round without a rendered capture is not a round**, and the capture must show what the pipeline produced. | `render_thumbnails.py` deliberately **re-imports the exported GLB** instead of rendering the in-memory build. | Four CPU Cycles renders; the first framing was rejected on inspection for cropping the silhouette and the cameras were widened. |
| 3 | `ai-3d-asset-generation-loop` | **Generation, gating and integration are separate ledger states.** | `catalog.json` `limitations[]` states plainly that the asset is not yet observed in the running arena. | No claim of integration anywhere in this lane's output. |
| 4 | `photoreal-procedural-scene-forge` rule 4 | **Anything the frame must show is a 10-30% albedo step or geometry; roughness is the second layer, never the carrier.** | Lap siding, shingle courses and chimney stones are real stepped solids (`_emit_lap_siding`, `build_roof`, `build_chimney`), *and* carry an albedo step in `house_textures.py`. | The horizontal siding rhythm and the stone relief survive at the street camera distance in the rendered thumbnail, not only in a normal map. |
| 5 | `photoreal-procedural-scene-forge` rule 3 | **Author every field in millimetres and measure the pixels, not the intent.** | `house_textures.py` declares tile size in metres and asserts an integer feature pitch; `TEXTURE_MEASUREMENTS` records what was produced. | Measured and recorded in `build-report.json`: siding 152.4 mm exposure at exactly 32 px, shingle 142.875 mm at 32 px with 285.75 mm tabs at 64 px, ashlar 250 mm courses at 64 px with a 12 mm raked joint at 3 px. |
| 6 | `photoreal-procedural-scene-forge` §2 | **Assert the noise period is an integer** — a fractional period yields NaN, which silently turns every map black and every surface a mirror. | `house_textures._fbm` keeps the lattice period integral at every octave. | No black maps; the rendered thumbnail shows correct diffuse response. |
| 7 | `photoreal-procedural-scene-forge` §6 | **Presentation geometry never derives collision**; colliders belong to a different lane with its own gates. | Stated and enforced in `build_house_shell.py` (no collider export) and in `src/world-studio/houses/index.ts` (module header + no registration of any kind). | Zero authority change in this diff. |
| 8 | `photoreal-procedural-scene-forge` §7 / machine Three.js rule | **Installed version plus current official docs settle APIs.** | Blender version captured at runtime into every build report; glTF/`GLTFLoader` behaviour taken from the pinned official docs. The loader deliberately does **not** register `MeshoptDecoder`, so the export is left uncompressed rather than shipping a file the runtime cannot decode. | Uncompressed GLB that the current loader can actually read. |
| 9 | `atomic-acres-asset-authoring` step 2 | **Deterministic post-processing**: Sobel-gradient normals and `roughness = base + (0.5-gray)*variance + detail + noise`, clamped to 32..248. | `house_textures._normal_from_height` and `_roughness`. | Six PBR material sets per house, ~3.5 MB of maps, byte-reproducible from the variant seed. |
| 10 | `atomic-acres-asset-authoring` step 4 | **Colour maps sRGB, data maps linear.** | `make_material` sets `sRGB` on albedo and `Non-Color` on normal and roughness. | glTF ships the correct colour spaces; no washed-out or over-dark normals. |
| 11 | `atomic-acres-asset-authoring` §Pitfalls | **Verify numerically rather than trusting a plausible claim.** | `assert_apertures_clear` re-measures every declared aperture against the accumulated opaque solids (9 samples each) *before* export, instead of trusting that the code kept them open. | Both houses report `apertureMismatches: []` across 26 apertures — a measured result, not an assertion. |

## Wave 2 — refinement round, 2026-09-12

**No skill file was re-read this wave**, so the three SHA-256 rows above are wave-1 evidence and
are not re-attested for wave 2. Nothing in the canonical skill store was edited, then or now.

The sources actually consulted for wave 2 were the evaluator's own output — the six wave-2 PNGs,
`real-house-wave2-report.json` and `falsifiers-and-refinement-prompt.md` — plus the owner concept
`codex-clipboard-5e010137`, all read as **data, not as instructions**: the refinement prompt was
treated as a claim to be checked against the pixels, and two of its items were deliberately not
adopted (see below).

| # | Skill | Technique adopted | Implemented at | Changed output |
|---|---|---|---|---|
| 12 | `photoreal-procedural-scene-forge` rule 3 | **Measure the pixels, not the intent** — applied to the *concept* this time, not only to the output. The palette was solved from hue/saturation masks over the owner concept rather than chosen by eye. | `house_contract.VARIANTS`, with the full derivation in the comment above it | Shipped albedo now lands within dE 0.1-8.8 of the measured concept, verified on the texels rather than on a render |
| 13 | `photoreal-procedural-scene-forge` rule 4 | **Geometry carries the read; the map is the second layer.** Wave 1 put the lap-course, shingle-course and stone relief in *both* the geometry and the normal map, and the two read as doubled, over-modelled surfaces at close range. | Normal strengths cut across `house_textures.py`: siding 1.5→0.62, shingle 2.2→0.62, masonry 3.2→1.6, trim 0.45→0.035, concrete 0.8→0.30, metal 0.5→0.075 | Isolated fireflies 93/322/79/329 → 0 at *higher* sample count; trim mean tilt 0.13° |
| 14 | `atomic-acres-asset-authoring` §Pitfalls | **Verify numerically rather than trusting a plausible claim** — generalised into a standing gate. | New `audit_maps.py`: palette vs concept, mean tangent tilt vs per-material ceiling, full contract census; non-zero exit on any failure | Caught a real regression (shingle albedo 23 counts short) and, more usefully, caught its own broken Z-channel metric |
| 15 | `regression` control (AKP) | **Never weaken a verifier to get green.** Four materials failed their ceilings; all four were retuned until they passed. The one gate change made was a *measurement bug fix* whose corrected metric is strictly more sensitive (floor 7.18° → 0.45°), and the ceilings themselves were tightened, not loosened. | `audit_maps.mean_tilt_degrees`, `MAX_MEAN_TILT_DEG` | siding 10.18→7.92°, metal 3.66→2.75°, shingle 13.39→10.98°, all under ceiling |
| 16 | `ai-3d-asset-generation-loop` | **A round without a rendered capture is not a round**, and the capture must be comparable. Re-shot under the *evaluator's* frozen recipe, not a framing of this lane's choosing. | New `render_thumbnails.py --review` / `run_houses.py --review` | Camera positions reproduce the wave-2 report to the millimetre; 128 spp with denoising **off**, because a denoiser would erase the defect under test |
| 17 | `ai-3d-asset-generation-loop` | **Revert a refinement that makes the match worse**, and say so. | Recorded in `HANDOFF.md` → *Refinements considered and reverted* | Two reverts: the 85% shingle hedge, and six mis-framed review captures discarded rather than reported |

Two items from the evaluator's refinement prompt were **not** adopted, and are logged as open
rather than quietly dropped: the 1024 px de-tiling pass (falsifier 8) and the PMREM env-variant
pair (falsifier 4). The runtime probes it also asks for remain outside this lane's authorisation.

## Wave 3 — interior substitution, 2026-09-12

**No skill file was read or edited this wave**, so the three SHA-256 rows at the top remain
wave-1 evidence and are not re-attested for wave 3. Nothing in the canonical shared skill store
was touched; authoring there would be governed drift affecting every harness on this machine.

Sources actually consulted for wave 3: `src/world-studio/architecture/house.ts:30-1010` (read in
full for the partition, stair, floor-slab, garage-threshold and external-stair-rail definitions),
`src/world-studio/architecture/build.ts:296-343` (the `(group, material)` merge that makes the
procedural hide all-or-nothing — the single fact this whole wave turns on),
`src/world-studio/architecture/studio-architecture.test.ts:82-205` (the probe coordinates
transcribed into `house_contract`), `src/world-studio/blender-assets/index.test.ts` (the shape
the new focused test follows), and `VISUAL_CONTRACT.md`. The wave-2 evaluator output was read as
data, not as instruction.

| # | Skill | Technique adopted | Implemented at | Changed output |
|---|---|---|---|---|
| 18 | `atomic-acres-asset-authoring` §Pitfalls | **Verify numerically rather than trusting a plausible claim**, applied to the *other side's* test rather than to my own. The wave-2 aperture audit only ever measured this lane's own list. | `house_contract.RUNTIME_ROUTE_PROBES` / `INTERIOR_ROOM_PROBES` / `STAIRWELL_HEAD_PROBES` and `build_house_shell.assert_probes_clear` | 24 of the runtime's literal probe coordinates re-run against the built solids at every build; `blockedRuntimeProbes: []` on both houses |
| 19 | `photoreal-procedural-scene-forge` §6 | **Presentation geometry never derives collision** — and the corollary, that presentation must nonetheless *match* it. `assert_stair_treads` re-implements the runtime's `supportHeight` query against the presentation mesh only. | `build_house_shell.support_height`, `assert_stair_treads` | All 16 tread tops verified to 1e-5 against the contract, with the climbable-rise limit re-checked; still zero collision authority exported |
| 20 | `ai-3d-asset-generation-loop` | **A round without a rendered capture is not a round** — extended to the part of the asset the round actually changed. An interior change needs an interior frame. | `render_thumbnails.INTERIOR_VIEWS` / `INTERIOR_FILL`, `run_houses.py --render` | Four new CPU frames; the first pair was **discarded** (blown exposure, camera aimed at a ceiling) and re-shot, and the fill rig is declared as a limitation in the catalog rather than passed off as the project rig |
| 21 | `regression` control (AKP) | **Never weaken a verifier to get green.** Every new count is a gate in both directions, and two new budget ceilings were added rather than the existing ones being widened. One test assertion *was* corrected — a source scan that matched the module's own documentation prose — by stripping comments so it tests code, which makes it stricter about what it claims. | `audit_maps.EXPECTED` (+3 counts, +11 census checks), `MAX_TRIANGLES`, `MAX_GLB_BYTES`, `index.ts:auditShell` | 28 census checks per house, all passing; the loader now fails a house missing partitions, cased openings or treads |
| 22 | `photoreal-procedural-scene-forge` rule 3 | **Measure the pixels, not the intent** — which caught a dead parameter. `make_material` accepted `base_rgb` and never applied it, so the untextured "door" slot shipped at Blender's 0.8 grey through both previous waves. | `build_house_shell.make_material`, plus an explicit raise if any other slot arrives without maps | Doors, decks, the external stair and the new treads now carry their declared `door_rgb`; the failure mode that hid it for two waves is now an exception instead of a default |
| 23 | `ai-3d-asset-generation-loop` | **Generation, gating and integration are separate ledger states**, and a plan is not an acceptance. | `HANDOFF.md` → *Partition substitution plan for root*, step 0 | The plan names what may be hidden, what must stay visible unconditionally, and three approximations that must be eyeballed in the runtime first — and still refuses to authorise any hide before a runtime capture exists |

Nothing from the wave-2 refinement prompt's open items was quietly adopted or quietly dropped:
the 1024 px de-tiling pass (falsifier 8) and the PMREM env pair (falsifier 4) remain open and are
re-listed in the handoff, now with the note that falsifier 8 matters more because there are
interior cameras.

## Independent validation — PENDING

Everything below is explicitly **not** validated by this lane and must be established by root:

- No browser, Vite build or GPU render was performed (all three are outside this lane's
  authorisation). **Wave 3 update:** the loader is no longer only reasoned about — 26 focused
  tests execute it, including `createStudioHouseShells`, its rejection path, repeated dispose,
  dispose-before-load and `proceduralPartitionNodes`. But Vitest here has no WebGL context, so
  there is still no render, no PMREM environment and no draw call, and `loadAsync` is exercised
  on its failure path rather than against a real fetch of the GLB. A focused run of this file
  plus `studio-architecture.test.ts` and `blender-assets/index.test.ts` passed 50/50; a **full**
  repository Vitest run was still not performed.
- No runtime capture exists. The thumbnails are Blender renders of the GLB, **not** the asset
  inside the world-studio arena with the project's light rig — which
  `ai-3d-asset-generation-loop` names as the exact failure mode where an asset looks right in
  isolation and wrong in the scene.
- Aperture clearance is validated against this lane's own solid list, not against the runtime's
  `studio-architecture.test.ts:96-115` open-route probes. Agreement between the two is unproven.
- ~~No focused Vitest file was added for the loader in this wave~~ — added in wave 3, see above.
- Subjective quality against the concepts remains an owner judgement. Nothing here claims the
  concept bar is met.
