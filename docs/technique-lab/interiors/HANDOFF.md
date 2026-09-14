# HANDOFF — lane `interiors-night-20260912`, wave 2 (NIGHT-06)

Machine `dave-gaming-pc`, harness `claude`, model `claude-opus-5`, effort `xhigh`.
Worktree `C:/Users/david/projects/worktrees/aa-interiors-night-20260912`,
branch `contrib/dave-gaming-pc/claude/interiors-night-20260912`,
frozen source anchor `6e9b2cafd318ca2b2f67f9eedcf8d624fee30453`. 2026-09-12.

Wave 1's headline was *"No GLB was exported. Blender never ran."* That is now superseded. The
wave-1 record below the line is kept because its falsifier list is what this wave was measured
against; nothing in it was rewritten to look better in hindsight.

> **Wave 6 (recovery, 2026-09-13) — see `REGENERATION.md`. Blender still has not run.** Wave 6 was
> the call authorised to regenerate, behind an orchestrator marker
> (`recovery/build18-house-probe-released.json`) that was absent for its whole duration. It was not
> bypassed. The ten GLBs are byte-identical — `generation.test.ts` re-hashes every one against
> `catalog.json` and fingerprints the set, and re-running `fit_report.py` reproduced
> `fit-report.json` byte-for-byte. What wave 6 did instead: fixed the last two of the five
> footprint overruns **at source** (credenza recentred on its occupied depth; kitchen run 0.62 →
> 0.60 m deep with the `length + 0.04` end overhang trimmed), so four of five are now fixed in
> `build_interiors.py` and queued behind one Blender run. The dinette overrun stays **OPEN** at
> +0.555 m by choice. No hash, catalog row, bounds figure or threshold was changed.

> **Wave 3 (morning phase, 2026-09-13) — see `ADAPTER.md`.** A typed adapter around the ten
> existing GLBs, 39 focused CPU tests, and no new geometry: every GLB, texture, report and render
> below is byte-for-byte unchanged and re-hashed by test. Wave 3 found and recorded three things
> this wave did not know. **(a)** The nine props are an *exact partition* of the hero — object,
> triangle and vertex counts sum to it and their AABBs union to it on all six faces — so hero and
> props are mutually exclusive, not additive; the loader now refuses the mix. **(b)** `sofa-frame`
> is rotated twice in `build_interiors.py` and sits at 180° while its fifteen siblings sit at −90°,
> putting the walnut plinth crosswise under the sofa (defect M1, fixed by one Blender run, not
> fixed here). **(c)** The mirrored-house note in wave 1's loader was wrong: `frontSign = −1` is a
> reflection `(x, z) → (−x, z)`, which `yaw → π − yaw` cannot express on the group. Full list of
> mismatches, including the footprint overhangs and the lost ballistic solids, in `ADAPTER.md`.
>
> **Wave 5 (recovery phase, same day) — the fit correction. See `FIT-REPORT.md`.** The sofa plinth
> defect (M1, falsifier 12) is **repaired at load time** — worst face 0.650 m outside the anchor
> footprint down to 0.155 m, measured from the shipped bytes — and fixed in `build_interiors.py` for
> the next export, which makes the script ahead of the GLBs for the first time in this lane. The
> credenza is nudged 12 mm and fits; the coffee-table top is fixed at source; the kitchen-run
> (0.020 m: door pulls and a worktop overhang) and dinette (0.555 m: chairs) overruns are kept
> deliberately, registered with measured values, and gated so they cannot grow. Falsifier 13 is
> **partially closed**. Three findings: overrun measured per face rather than per span makes it
> **five** of five props, not four; repairing the plinth narrows the *hero* from 13.090 m to
> 12.445 m across, because that plinth was the set's eastmost geometry; and wave 3's claim that
> `build_rug` shares the defect is wrong. 45 → 70 tests. No Blender, no browser, no commit.
>
> **Wave 4 (recovery phase, same day)** reviewed wave 3 and found the adapter sound, but corrected
> two of its integration claims — the published anchor id is `teal-house-sofa`, not `teal-sofa`, and
> the lost ballistic solids cannot be avoided by hiding meshes — and added the hero-versus-props
> cost (M8). 45 tests, still no geometry touched. Consumer wiring: `CONSUMER-PATCH.md`.

## Headline

**Blender ran. The export is real.** Ten GLBs, twelve maps, a Cycles CPU thumbnail, a measured
geometry census and a populated catalog now exist, and the hero frame has been compared against
the owner concept. The script executed on the **first** attempt with no API failure — the four
defects wave 1 predicted (`bmesh.ops.bevel(affect=...)`, `export_scene.gltf` argument names,
`scene.cycles` availability, the `--python` argv split) were all wrong. The five real defects
were somewhere else entirely, and four of them were invisible without a frame.

## Blender and the exact commands

| | |
|---|---|
| Executable | `C:/Program Files/Blender Foundation/Blender 5.1/blender.exe` |
| Version | **`Blender 5.1.2`**, build hash `ec6e62d40fa9`, build date `2026-05-19 01:37:34`, branch `blender-v5.1-release`, Windows Release — from `--version`, not from the install directory name |
| Build | `"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --threads 4 --python scripts/blender/world-studio/interiors/build_interiors.py -- --repo C:/Users/david/projects/worktrees/aa-interiors-night-20260912 --render --props` |
| Renderer | Cycles, `device = CPU`, `threads_mode = FIXED`, `threads = 4`, 24 samples, 640×360, denoised. No GPU, no browser, no build, no server. |

Run six times end to end (first bare run, then once per repair, then twice more for the
determinism check). Every run exited 0. The only Blender diagnostics in any log are two
`DeprecationWarning: 'Material.use_nodes'/'World.use_nodes' is expected to be removed in Blender
6.0` — noted, not acted on: `use_nodes` is still the 5.1 API and changing it here would be
speculative.

## Defects found by running it, and what was done

1. **The first thumbnail was an empty frame.** 221 KB of flat world-background grey. The camera
   Euler triple was hand-written and the Z rotation had the wrong sign, so the camera looked out
   through the wall, away from the set. Fixed by deriving the rotation from a look-at target
   (`_aim`) instead of asserting three angles.
2. **Two different PNG encoders for the same maps.** `build_interiors._write_image` pushed the
   array through Blender's *scene-linear* float buffer and saved, which re-encodes to sRGB;
   `interior_textures.write_png` writes the array as 8-bit texels directly. Same seed, different
   bytes. The first real run therefore **silently invalidated all twelve sha256 pins in
   `texture-report.json`** (verified: 12/12 drifted), and every albedo entered the shader far too
   bright — walnut's 0.34 arriving as 0.34 *linear* instead of 0.34 sRGB ≈ 0.095 linear, about a
   stop and a half. That is what made the first non-empty frame read washed out. Fixed by
   deleting the second encoder: `build_textures` now calls `interior_textures.generate_all`,
   rewrites `texture-report.json` from the same run, and loads the files it just wrote. The pins
   are back to the wave-1 module values and re-verified (`0` mismatches).
3. **The superseded duplicate texture implementation is gone** (wave-1 falsifier 3). 183 lines of
   dead `tex_*`/`_fbm`/`_tileable_noise` and the unused module-level `RNG` were removed;
   `interior_textures` is the sole authority for the arrays *and* now for the bytes.
4. **The preview shell was built 80 mm too high** — my own bug, introduced in this wave. The set
   origin *is* floor level (the loader adds `GROUND_FLOOR_Y` when it places the group), so
   building a preview floor at `y = 0.08` sank the whole set into it and **completely buried the
   area rug**, whose top sits at 20 mm. Three frames were rendered before the missing rug was
   noticed. Fixed; the rug now reads, and the exported rug bounds `Y [0.001, 0.020]` confirm the
   asset was always correct.
5. **The preview rig lit nothing directionally.** The ceiling bounce faced *up* at a set with no
   ceiling, and there was no hard key at all, so the frame had no contact shadow anywhere. The
   rig now has a preview-only shell (floor, three walls, shadow-transparent ceiling) and a sun
   standing in for the picture window, with the area lights dropped to fills.

None of this touched `arena.ts`, `lighting/`, shared config, skills or another lane.

## Outputs, with hashes

All under `public/assets/world-studio/blender/interiors/`. `sha256` and `bytes` are from the
final run and are reproduced in `build-report.json` and `catalog.json`.

| file | objects | verts | tris | mats | bytes | sha256 |
|---|---|---|---|---|---|---|
| `interior-hero-teal-living-kitchen.glb` | 182 | 16956 | 33184 | 19 | 4603156 | `ded7d8cd183276805cff23f221d653269a4606564c2882189c4a261788c5132e` |
| `interior-prop-sofa.glb` | 16 | 1888 | 3712 | 2 | 1185944 | `8e3eb48e5913d37915f3baa40fab3d2393082c289eb371091925fa08472575c7` |
| `interior-prop-coffee-table.glb` | 10 | 1006 | 1972 | 4 | 590796 | `3840a2733a24830f69d1acbd20e2259a16196e53f6d00bc58c4e9bebc07526e8` |
| `interior-prop-credenza.glb` | 14 | 1240 | 2424 | 5 | 627744 | `f2440a734dd5fb0049730f9f581ddd6c78cffdf17f627fb701798130a1069cd8` |
| `interior-prop-armchair.glb` | 12 | 1168 | 2288 | 2 | 624944 | `08cae114c71283d2bd50704a2a980a2db1614618ebc5744b7a59c22dcab78369` |
| `interior-prop-kitchen-run.glb` | 35 | 3044 | 5948 | 5 | 966432 | `3749ea5f4ef1a27485729a7e0b7f9bca1b8de42c2ad9e950874485feb46624c9` |
| `interior-prop-fridge.glb` | 5 | 600 | 1180 | 4 | 85824 | `ccecbce36d9c890d394a7be6637392988127722cfd064b9b4386d12d09e2eba0` |
| `interior-prop-dinette.glb` | 48 | 4198 | 8204 | 5 | 910816 | `af18cb87a90e1c6d33efe70592e8de09bcbd66c62dd2b14439a98dffa145038b` |
| `interior-prop-area-rug.glb` | 2 | 152 | 296 | 2 | 1036024 | `45e60576c5d46fdb785a1d0b27dca0f2070abb9ccbef62bbc9770c6f6f447f5b` |
| `interior-prop-accents.glb` | 40 | 3660 | 7160 | 9 | 940140 | `16a5fae4f1119ac40bc08b7943325ac4476c4c9c3b7206b86563ff1f63fa7cc5` |
| `thumb-interior-hero-teal.png` | — | — | — | — | 302869 | `ee43f441750b1da7c9a30d595a241ad1a92b7b9c9cd28a05fd99e73b7330cb03` |

`catalog.json` is no longer hand-maintained: `write_catalog()` emits it **from the measured
report only**, so a row exists if and only if that run wrote the file it names, and
`thumbnailUrl` is `null` unless that run actually rendered it. `assets[]` now holds 10 rows and
`pendingAssets` is gone.

Source maps: `source-assets/world-studio/interiors/textures/` — 12 PNGs (6 albedo + 6 roughness,
512²) plus `texture-report.json`, pinned per file and re-pinned by the same run that writes them
(`build-report.json.texturePins`).

## Independent audit of the container

The build script reporting its own census is the thing under test, so it cannot also be the
evidence. `scripts/blender/world-studio/interiors/inspect_glb.py` (stdlib only, no Blender, no
network) reads the GLB container itself:

```
interior-hero-teal-living-kitchen.glb  nodes=182 meshes=182 prims=182 verts=57828 tris=33184
  mats=19 imgs=12 ext=['KHR_texture_transform']
  bounds min=[-6.59, -0.0054, -7.5675] max=[6.5, 2.5314, 7.42]
  OK container, extensions loader-supported, no rig leak, 6/12 images byte-identical
```

* **Bounds sit inside the published envelope** X `[-7,7]`, Z `[-9,9]`, and the kitchen-run prop
  measures X `[-6.525,-5.861]`, Z `[2.98,7.42]` — the 4.4 m × 0.65 m footprint at anchor
  `(-6.2, 5.2)`, from the file rather than from the source.
* **No preview rig leaked**: 0 cameras, 0 lights in every GLB.
* **`KHR_texture_transform` is `extensionsRequired`.** three 0.185.1's `GLTFLoader` implements it
  natively (verified in `node_modules`), so this needs no decoder — unlike Draco/Meshopt, which
  the audit still fails on. It comes from the per-material UV `ShaderNodeMapping`.
* **6/12 images are byte-identical to `source-assets`; the other 6 are the roughness maps**,
  which glTF carries in the green channel of a packed `metallicRoughness` image, so the exporter
  legitimately rewrites them. My first version of the audit called that a failure — that was the
  checker being wrong, not the export, and both over-strict checks were corrected rather than
  relaxed to get green.
* Vertex counts differ by convention: 16956 (Blender, shared verts) vs 57828 (glTF, split per
  face for flat shading). Triangles agree exactly at 33184.

## Reproducibility: measured, and not yet clean

Two consecutive runs of the identical command, identical inputs:
`docs/technique-lab/interiors/renders/compare_runs.py` reports **7 of 10 files byte-identical, 3
differing** (hero, coffee-table, dinette) with *identical triangle counts*. `diff_glb.py` then
localises it:

```
binary chunk: 4439480 vs 4439480 bytes, DIFFERENT
json chunk exact: identical
embedded image payloads (as a set): identical
differing bytes: 3954 of 4439480 (0.0891%)
  INDICES: 3954 differing bytes
largest absolute float difference: 0
```

**Every position, normal, UV and image byte is identical between runs. Only triangle index
ordering varies.** The asset is deterministic; its *byte stream* is not, so a sha256 pin on a GLB
is not yet a reproducibility guarantee. Most likely cause is unordered iteration inside the glTF
exporter, which per-process string hash randomisation would explain; the usual mitigation is to
launch with `PYTHONHASHSEED=0`. **That hypothesis is UNTESTED here** — the owner authorisation
for this lane covers the Blender executable with no shell wrapper, and an `export PYTHONHASHSEED=0 &&`
prefix was refused by the harness, correctly. Root can test it in one run.

## Concept comparison — what actually improved, and what did not

Frames kept in `docs/technique-lab/interiors/renders/`:

* `wave2-a-albedo-fixed-flat-light.png` — after the camera and encoder fixes: correct albedo,
  but flat ambient light, no contact shadows, and no rug (defect 4 still live).
* `wave2-b-sunlit-rug-visible.png` — final: hard warm key, real contact shadows under the sofa,
  coffee table, credenza and dinette, and the banded rust/ochre/cream rug with its asterisk
  motif on the floor where it belongs. This is the frame shipped as the catalog thumbnail.

Against owner concept `codex-clipboard-edd0e997-…png`, judged by looking at both:

* **Matches**: sage three-seat sofa, walnut surfboard coffee table with brass bowl and book
  stack, walnut credenza with a wood-cased television, avocado-vinyl dinette chairs on chrome,
  ochre kitchen run with white enamel fridge, sansevieria, berber field, and the banded
  geometric rug.
* **Does not match, and is not claimed to**: the concept's richness is largely *architecture* —
  stone fireplace, picture window with curtains, plaster arch to the kitchen, stair with rail,
  patterned vinyl kitchen floor, daylight shafts. None of that is in this asset, because none of
  it is furniture; walls and apertures belong to `house.ts`. The frame's empty floor is real: the
  published house envelope is ~14 m × 18 m and these five anchors do not fill it. That is a
  layout observation for root, not something this lane may fix by moving anchors.
* Material changes made this wave were confined to the encoder correction (defect 2), which
  changed every albedo's *interpretation*, not its authored value. No colour constant was
  retuned to flatter a frame.

## Circulation and gameplay apertures

Unchanged from wave 1 and now measurable rather than asserted: hero bounds X `[-6.59, 6.50]`,
Z `[-7.57, 7.42]` sit inside the envelope; nothing was added, moved or re-anchored this wave, so
the hall route around local X `0…2`, Z `0…8` and every door, window and stair aperture remain as
authored. Still **not** measured by a navigation or shot test — no runtime has loaded this set.

One honest wrinkle the audit surfaced: hero `Y` min is `-0.0054`, i.e. something dips 5.4 mm
below the floor plane (a bevel at floor level). Cosmetically invisible, but it is a real number
and root should know it exists before assuming the set is strictly `y ≥ 0`.

## Falsifiers — current state

| # | Wave-1 falsifier | State |
|---|---|---|
| 1 | No export exists | **CLOSED** — 10 GLBs, census, hashes, thumbnail, catalog |
| 2 | `build_interiors.py` has never executed | **CLOSED** — ran on Blender 5.1.2, six times, exit 0; none of the four predicted API failures occurred |
| 3 | Duplicate texture code | **CLOSED** — deleted; shared module is sole authority for arrays and bytes |
| 4 | Concept fidelity unjudged | **PARTIALLY CLOSED** — hero frame compared by me against `edd0e997`, findings above. No second critic, no owner acceptance |
| 5 | GLM kitchen prompt not recovered | **OPEN, unchanged.** No new search was run this wave. Every design choice remains a labelled adaptation, not a recovery |
| 6 | No yellow-house variation, no upstairs room | **OPEN** — out of scope this wave |
| 7 | Loader untested at runtime | **PARTIALLY CLOSED (wave 3; 45 tests after wave 4)** — CPU tests now cover URL resolution, catalog/hash consistency, measured bounds, the hero/prop partition, the anchor contract with `house.ts`, dispose-wins-the-race, partial-failure ownership and the mirror transform. Still **no browser and no GLB ever fetched by three.js**: `loader.test.ts` stubs the GLTFLoader, so nothing here says three can parse these bytes |

New falsifiers opened this wave:

8. **Byte-level reproducibility is not achieved** (index ordering, above). `PYTHONHASHSEED=0`
   untested.
9. **The thumbnail's light is a preview fiction.** Sun, fills, floor, walls and ceiling exist
   only in the `preview-rig` collection, are built after every export call, and are absent from
   every GLB (0 lights, 0 cameras, audited). Nothing is baked into a texture. The frame is
   therefore evidence that the *geometry and materials* read — it is not evidence of how the set
   will look under the arena's runtime lighting.
10. **`KHR_texture_transform` is a required extension.** Supported by this runtime's loader, but
    it constrains any future consumer (validator, `gltfpack`, another engine). Bakeable into the
    UVs if root wants it gone.
11. **No frame has been reviewed by anyone but me.** Visual acceptance is root's, unclaimed here.

New falsifiers opened by wave 3 (detail and evidence in `ADAPTER.md`):

12. **`sofa-frame` is rotated twice** (`build_interiors.py:417` sets `= yaw`, `_rotate_group` at
    `:478` then adds it again): 180° against its fifteen siblings' −90°, so the walnut plinth lies
    crosswise under the sofa and protrudes ≈0.64 m past the arms at each end. Measured from
    `interior-prop-sofa.glb`, not from the source. `build_rug` at `:773`/`:775` has the same shape
    and is harmless only while its yaw is 0. One Blender run fixes both; this lane may not run it.
13. **Four of the five anchored props exceed their published anchor footprint**, by up to 1.30 m
    in X (the sofa, which is falsifier 12) and 1.11 m in Z (the dinette, whose chairs legitimately
    stand outside the table's footprint). The procedural kit *throws* in this situation. Whether
    anchor footprints bind Blender dressing is root's call.
14. **Filtering the five anchors deletes their ballistic solids.** The procedural kit returns
    `StudioInteriorSolid`s; this set returns none. Wave 2's wiring step 3 removes collision from
    those five footprints with nothing replacing it.
15. **Nothing has still ever been fetched by three.js.** Wave 3's loader tests stub the GLTFLoader
    on purpose, to make the dispose race deterministic. They say nothing about parsing these bytes.

New falsifiers opened by wave 4:

16. **The five anchors' ballistic solids cannot be kept while their geometry goes.** The procedural
    kit merges geometry per role across both houses, so filtering is the only removal route and it
    takes the solids with it. Root must accept non-solid furniture, author replacement collision,
    or change the kit. This supersedes the "decide first" wording of falsifier 14; the decision is
    real, but one of the options wave 3 implied was never available. ADAPTER M3.
17. **Loading the nine props costs 51% more than the hero for identical geometry** — 2,365,508
    bytes, almost all duplicated texture, plus 22 GPU texture uploads against the hero's 12. The
    props are the expensive route, not the cheap one. ADAPTER M8.
18. **The wave-3 documentation named a house id that does not exist** (`teal`/`teal-sofa` instead of
    `teal-house`/`teal-house-sofa`). Corrected and pinned, but it is worth recording that four
    separate documents agreed with each other and all four were wrong: they were checked against
    one another rather than against the built architecture. The correction is a test that builds
    the architecture and reads the ids it really publishes.

## Root wiring still needed (unchanged; not this lane's to do)

1. Fill nothing by hand — `catalog.json` is generated. Re-run the build to refresh it.
2. Wire `createStudioInteriorAssets` from `src/world-studio/interior-assets` in `arena.ts`,
   parented to the teal house, disposed with the arena.
3. **Remove the corresponding old dressing**: filter the five ground-floor anchors `sofa`,
   `coffee-table`, `tv-unit`, `dining-table`, `kitchen-run` out of the array passed to
   `createStudioInteriors(...)` so procedural and Blender dressing do not co-occupy a footprint.
   **Keep** the procedural `bed`, `wardrobe`, `desk`, `bed2`, `workbench`. The lighting-planner
   call on `arena.ts:33` should keep the **full** anchor list — the practicals still belong to
   those rooms.
4. Re-run `src/world-studio/interiors/interiors.test.ts` after that filter. Its "all 20 anchors"
   assertion describes the procedural kit and may legitimately need a decision. **Do not weaken
   it to get green.**
5. Runtime lighting needs for the Qwen/lighting lane are unchanged from wave 1 and still stand:
   a separate kitchen daylight zone, contact darkening, an interior IBL or cheap reflection probe
   for the chrome/brass family, warm practicals at the table lamp and over the dinette, and the
   silhouette-separation bound from `threejs-webgpu-interior-lighting-look`.

## Next best improvement, in order

1. Load one GLB in three.js and look at it — every remaining visual claim is a Cycles claim.
2. Test `PYTHONHASHSEED=0` and close falsifier 8 (one run).
3. The focused CPU vitest for the loader wave 1 specified: URL base resolution, dispose-wins-the-
   race, and `INTERIOR_ANCHOR_REFERENCE` still equalling what `house.ts` publishes.
4. Then the yellow-house palette variation and the upstairs room.

**Wave 3 amendment.** Item 3 is **done** — `catalog.test.ts` and `loader.test.ts`, 39 tests, all
three of the things it named plus catalog/hash consistency, measured bounds and the hero/prop
partition. Items 1, 2 and 4 stand. Two corrections to the wiring list above, which wave 2 could
not have known:

* **Wiring step 3 is incomplete as written.** It removes the five procedural anchors' *collision*
  as well as their geometry (falsifier 14). Decide the collision question first. Use
  `publishedAnchorIdsFor(houseId, ids)` rather than a hand-written list: the published ids are
  prefixed (`teal-house-sofa` — corrected in wave 4, see below), and two prop names do not match
  their anchor names — `interior-prop-credenza` dresses `tv-unit` and `interior-prop-dinette`
  dresses `dining-table`.
* **Do not load the hero and any prop together.** They are the same 182 objects sliced two ways.
  `createStudioInteriorAssets({ assetIds })` now refuses the mix; the raw `assetPaths` route does
  not check, so prefer `assetIds`.

**Wave 4 amendment (recovery phase, 2026-09-13).** A review pass over wave 3. No GLB, build script
or source asset was touched, and no defect was found in the loader or the catalog: the placement,
ownership and mirror claims were re-derived from `house.ts` and from `three@0.185.1` and hold.
Three things changed, and the full consumer wiring is now written out in `CONSUMER-PATCH.md`:

* **The house id in every wave-3 example was wrong.** The published anchor is `teal-house-sofa`,
  not `teal-sofa`: `STUDIO_HOUSES[0].id` is `teal-house`, and `teal` is the house's `side`.
  `publishedAnchorIdsFor` was always correct — it takes the house id as an argument — but anyone
  filtering on the documented example would have matched nothing, been told nothing, and left all
  five procedural pieces standing inside the Blender furniture. Corrected in `catalog.ts`, ADAPTER
  M4 and the bullet above, and now pinned against the built architecture.
* **"Decide the collision question first" overstated the options.** There is no hide-the-mesh
  alternative: the procedural kit merges geometry per role across both houses
  (`interiors/index.ts:147`, `:157`), so no anchor has a mesh of its own and hiding the teal sofa's
  mesh blanks yellow-house furniture too. Filtering — and losing those solids — is forced unless
  the kit itself changes. ADAPTER M3, falsifier 14.
* **The nine props cost 51% more than the hero** (ADAPTER M8, new): 6,968,664 B against 4,603,156 B
  for identical geometry, because every GLB embeds its own copy of every map and nothing is shared
  between files. Load the hero unless a strict subset is needed.

Tests: 39 → 45, same two files, no existing assertion relaxed.

---

# Wave 1 record (2026-09-12, kept verbatim in substance)

Wave 1 authored the deterministic Blender source, the six procedural PBR maps, the runtime
loader and the placement contract, and **could not run Blender at all**: four invocations naming
the executable were refused with *"Permission to use Bash has been denied because Claude Code is
running in don't ask mode."* No bypass was attempted. It shipped `catalog.json` with
`"assets": []` deliberately, parking the intended row under `pendingAssets` with
`status: "authored-not-exported"`, on the grounds that a catalog row without a real GLB and a
real render of that GLB is exactly the phantom-thumbnail failure NIGHT-04 names. That judgement
was right and is why wave 2 had a clean thing to falsify.

Gates it ran and passed: AKP adoption `check` (`trust=trusted`, control digest
`628f270a…c940967`) and `audit` (`AKP_ADOPTION_GREEN`, amber rows belonging to other
harnesses/machines, no receipt borrowed); lane preflight emitting a routed receipt with
`laneId interiors-night-20260912` and base/dispatch SHA `6e9b2cafd…`; texture synthesis; and
`tsc --noEmit` clean within `world-studio/interior-assets`. Not run, deliberately: Vite build,
any browser, any GPU work, full vitest.

What the set contains, authored directly in the house-local frame `house.ts` publishes —
living room (three-seat sage sofa with separate seat and back cushions, upholstered arms with
walnut caps, welt, splayed tapered legs; walnut surfboard coffee table pinched to a boomerang
plan with apron, dowel legs, brass bowl, book stack; rust vinyl lounge chair on an exposed
walnut frame; walnut credenza with door reveals, brass pulls and a wood-cased television;
ceramic and brass table lamp; 16-ray brass starburst clock; framed abstract art; patterned area
rug with a bound edge), kitchen (4.4 m ochre-enamel run with toe kick, five doors, chrome pulls,
laminate worktop with bullnose and splash lip, recessed steel sink, bent chrome tap, four-burner
hob, wall cabinets, tiled backsplash; rounded-shoulder white enamel refrigerator), dinette
(chrome-and-laminate table, four avocado-vinyl chairs, ceramic fruit bowl) and a sansevieria at
the stair foot. Nothing is a raw box: every panel is bevelled and every leg is a tapered,
splayed lathe. Those counts were source claims in wave 1; the census above now measures them.

## Wave 7 (2026-09-13) — gate open, launch denied, no byte changed

The `build18-house-probe-released.json` marker wave 6 waited for now exists and was verified first.
Blender still did not run: the pinned one-line command was refused three times by the harness
permission layer (`don't ask mode`) before any process started, in three spellings of the executable
path. No substitute launcher was used, because this lane is not allowed one. The ten GLBs,
`catalog.json` and `build-report.json` were sha256'd before the first attempt and after the last and
are byte-identical, so every hash, catalog row, build report and measured bound in this document is
unchanged and still describes the shipped bytes. `fit_report.py` re-measured all ten and reproduced
wave 5's table exactly.

What wave 7 did change, all inside the lane's allowed paths: `build_interiors.py` can now actually be
run by the command every document here pins — `--repo` had been `required=True` with no `--` payload
in that line (argparse would have exited 2), and `--props` had been opt-in, which would have exported
the hero alone and left nine props stale beside a refreshed catalog. Three tests in
`generation.test.ts` pin the new shape, including that the catalog still refuses a `thumbnailUrl` it
did not render. Focused suite: 91 passed (91), 4 files. Gameplay authority untouched — no collider,
spawn, patrol point or shot surface moved, the procedural kit keeps ballistic authority, and no
loader or disposal code was opened. Full account in `REGENERATION.md`.
