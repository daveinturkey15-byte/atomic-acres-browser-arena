# Skill-use receipt — lane `interiors-night-20260912`, wave 1

Machine `dave-gaming-pc`, harness `claude`, model `claude-opus-5`, effort `xhigh`,
branch `contrib/dave-gaming-pc/claude/interiors-night-20260912`, base
`6e9b2cafd318ca2b2f67f9eedcf8d624fee30453`. 2026-09-12.

A read is not an implementation. Each row below names the changed output that would not exist
without that skill, and states what is still unvalidated.

## Resolved skills

| Skill | Junction path read | Canonical resolved path | sha256 |
|---|---|---|---|
| atomic-acres-asset-authoring | `C:/Users/david/.codex/skills/atomic-acres-asset-authoring/SKILL.md` | `C:/Users/david/Documents/desky-bootstrap-clone/Skills/game-development/atomic-acres-asset-authoring/SKILL.md` | `57c1bb9e333ad99cd428f5cd03090d997ed0647d7b1be24581cd01b38dfd79c4` |
| photoreal-procedural-scene-forge | `C:/Users/david/.codex/skills/photoreal-procedural-scene-forge/SKILL.md` | `C:/Users/david/Documents/desky-bootstrap-clone/Skills/game-development/photoreal-procedural-scene-forge/SKILL.md` | `fcf059f08eed0bb2f23a630f07a7e74cf48aa3254135be1932de5bcbb7c92d8c` |
| threejs-webgpu-interior-lighting-look | `C:/Users/david/.codex/skills/threejs-webgpu-interior-lighting-look/SKILL.md` | `C:/Users/david/Documents/desky-bootstrap-clone/Skills/game-development/threejs-webgpu-interior-lighting-look/SKILL.md` | `f0a9ebbe4aba8dc2ab8c1912e3a4936eeff726b51fd63ee4320c974b409ee732` |

The junction resolves into the categorised canonical store, not a flat `Skills/<skill>` path,
as the spec says. No skill file was edited during this run.

## `photoreal-procedural-scene-forge` — adopted, with one deliberate deviation

* **Original source inspected:** the skill's own section 0 source boundary. The method is
  recorded there as *observed in `StarKnightt/morning-diner` (Claude Fable, 2026), shared by the
  owner via <https://x.com/prasenx/status/2095537643182563778>, re-implemented from first
  principles*, and that repository carries **no licence**. I did **not** clone, fetch or read
  that repository in this run, and nothing from it is copied here. The attribution is
  propagated because the method is; the third-party quotations the skill warns about are not.
* **Technique extracted:** rule 3 (*author every field in millimetres and measure the pixels*),
  rule 4 (*anything the frame must show is a 10-30% albedo step or geometry, roughness is the
  second layer*), gate 4 (*nothing near the camera is a raw box*), and the hard assertion that
  a tileable noise period must be an integer.
* **Changed output:**
  * `scripts/blender/world-studio/interiors/interior_textures.py` — every generator's docstring
    states tile size, px/mm and the resulting feature pitch (boucle 1.5 mm at 2.56 px; walnut
    rings 4.0 mm at 3.4 px; berber gauge 4.0 mm at 2.05 px; 100 mm field tile at 64 px with a
    2.5 mm grout joint at 1.6 px). `tileable_noise` carries the integer-period `assert`.
  * The generated report records **measured** `albedoSpread` per map, not intended spread, so
    rule 4 is checkable: e.g. tile `0.6413`, counter `0.6368`.
  * Every prop in `build_interiors.py` is bevelled (`bmesh.ops.bevel`, 2-5 segments) or lathed;
    there is no raw box in the set, and legs are tapered and splayed rather than extruded.
* **Deliberate deviation:** the skill's derived-exposure rig and two-critic gauntlet are
  **not** adopted. This lane's output is an asset for a shooter, and section 6 of the same
  skill inverts the bound for competitive games: the runtime owns exposure, weather and time of
  day, so baking a photographic light rig into these surfaces would be wrong. Nothing in the
  exported materials encodes light.
* **Independent validation:** PENDING. No critic has looked at a frame of this set.

## `atomic-acres-asset-authoring` — adopted in part

* **Original source inspected:** the skill file, plus the in-repo precedent it points at,
  `src/world-studio/blender-assets/index.ts` (the shipped hero bus/truck loader), read at this
  branch's HEAD.
* **Technique extracted:** the deterministic-script + pinned-sha256 + provenance chain; the
  "script and parameters are required regardless" rule; the loader shape (immediate root,
  honest `ready`, dispose that wins the race with an in-flight load, `presentationOnly`
  userData, base-relative URL resolution).
* **Changed output:** `src/world-studio/interior-assets/index.ts` follows that lifecycle
  contract deliberately rather than inventing a second shape; `interior_textures.py` writes a
  `texture-report.json` with a sha256 and byte count per map.
* **Not adopted:** step 1 (`image_generate`) and the AI-image pitfalls. Nothing here is AI-image
  generated, so the vision-artifact diagnosis does not apply. `assets.manifest.json` is
  root-owned and untouched.
* **Independent validation:** PENDING.

## `threejs-webgpu-interior-lighting-look` — read, and consciously **not** applied

* **Original source inspected:** the skill file; its study doc
  `docs/technique-studies/subway-scene-lighting-look.md` was not opened in this run.
* **Why it is not applied:** the skill's own "when to use" excludes daylight interiors, and its
  first instruction is to check whether the reference is actually buying its look with lighting
  technology. The concept target (`edd0e997`) is a *bright daylit* mid-century interior whose
  richness is material and composition, not emissive fixtures and fog. Applying the value
  composition rule here would invert it.
* **What it did change:** it is the reason this lane ships **no** lights, no art-direction row
  and no post change, and instead records the runtime lighting needs for the Qwen/lighting lane
  in the handoff rather than acting on them. Per the spec, arena/lighting shared files are out
  of scope for this lane and were not opened for writing.
* **Independent validation:** N/A — nothing was implemented from it.

## Honest source-recovery statement (NIGHT-06)

The spec asks for the original shared **GLM kitchen prompt and its followup**.

**NOT RECOVERED.** Searched, all read-only, in this run:

* `C:/Users/david/AppData/Local/hermes/.akephalos/references/ai-3d-technique-register.md` —
  no match for `GLM` or `kitchen`.
* `.akephalos/references/game-techniques-intake-2026-09-11.md` and
  `game-techniques-followup-2026-09-11.md` — no match for `GLM` or `kitchen`.
* The whole `.akephalos` tree — no file matches `kitchen`.
* This worktree — no co-occurrence of `GLM` and `kitchen` anywhere.
* The operational vault `C:/Users/david/Documents/desky-bootstrap-clone` — the only `kitchen`
  matches are five dated `Skills/.curator_backups/*/cron-jobs.json` snapshots, which are
  unrelated personal scheduling data and were **not** ingested.

Therefore **every design decision in this set is method-inspired adaptation from the concept
image and the three skills above, and none of it is a recovered prompt.** The concrete visual
sources actually used were the owner concept renders
`codex-clipboard-edd0e997-…png` (inspected: teal living room, ochre kitchen beyond a plaster
arch, brass starburst clock, berber field with a banded geometric rug, walnut surfboard table,
sage three-seat sofa, rust lounge chair, chrome-and-laminate dinette with avocado vinyl chairs,
white enamel fridge) and the published anchor table in
`src/world-studio/architecture/house.ts`. If root holds the GLM prompt elsewhere, this row
should be reopened rather than treated as closed.

---

# Wave 2 (2026-09-12) — the same three skills, now with a frame to judge them by

No skill file was read again this wave and **none was edited**; the resolved paths and sha256s
above are the ones this lane is still working from. What changed is that wave 1's adoptions were
claims about a script, and there is now an executed run to check them against.

## `photoreal-procedural-scene-forge` — one rule vindicated, one previously mis-applied

* **Rule 3 ("author every field in millimetres and *measure the pixels*") is what found defect
  2.** The measured `albedoSpread` per map was already in `texture-report.json`; comparing the
  *file hashes* against that report is the same discipline one level up, and it showed all
  twelve maps had drifted the moment Blender first ran. A skill that said "the generator is
  shared, so the output is shared" would have missed it — the generator was shared and the
  **encoder** was not.
* **Gate 4 ("nothing near the camera is a raw box") is now checkable**: 182 objects, 33184
  triangles, 19 materials, measured from the container by `inspect_glb.py` rather than counted in
  the source.
* **The wave-1 "deliberate deviation" was right, and is reaffirmed**: the skill's derived-exposure
  rig and two-critic gauntlet are still not adopted into the *asset*. The preview sun, fills,
  floor, walls and ceiling added this wave live in a `preview-rig` collection built after every
  export call, and the audit confirms 0 lights and 0 cameras in all ten GLBs. Nothing photographic
  is baked into a surface; the runtime still owns exposure, weather and time of day.
* **Independent validation: still PENDING.** I compared the hero frame with the concept myself.
  That is one critic, and it is the author. No gauntlet was run.

## `atomic-acres-asset-authoring` — the provenance chain now has real links

* The "deterministic script + pinned sha256 + provenance chain" technique is what made defect 2
  *visible as a failure* rather than a mystery: the chain had a pin, the pin broke, and the break
  was diagnosable. Wave 2 closed the loop by making the run that writes the files also rewrite
  the pins (`build-report.json.texturePins`), so a stale pin becomes a build-time fact instead of
  something a later reader has to notice.
* The loader-shape adoption is unchanged and **still unexercised**: `tsc` is clean for the
  namespace, no vitest exists, and no GLB has been fetched by three.js. `assets.manifest.json`
  remains root-owned and untouched; this lane's `catalog.json` is generated, not hand-written.
* **Independent validation: PENDING.**

## `threejs-webgpu-interior-lighting-look` — still consciously not applied to the asset

Unchanged in substance. Its "check whether the reference is buying its look with lighting
technology" instruction did, however, shape the preview rig: the concept `edd0e997` is bright
*daylight*, so the thumbnail rig is one hard warm key plus fills, not emissive fixtures and fog,
and it is preview-only. The runtime lighting needs recorded in the handoff are still handed to
the Qwen/lighting lane rather than acted on here. **Independent validation: N/A.**

## Honest source-recovery statement (NIGHT-06) — UNCHANGED AND OPEN

The original shared **GLM kitchen prompt and its followup remain NOT RECOVERED.** No new search
was performed this wave, so wave 1's search record above stands as the whole evidence. Nothing in
this wave's output is a recovered prompt, seed, model output or provenance line: every design
decision is still **method-inspired adaptation** from the owner concept image and the three
skills, and the wave-2 additions (preview shell, sun, camera aim, catalog generation, container
audit) are engineering, not recovered method. If root holds the prompt elsewhere, this row should
be reopened rather than treated as closed.

## Wave-2 tools added to this lane

* `scripts/blender/world-studio/interiors/inspect_glb.py` — Blender-free container audit
  (counts, materials, world-space bounds via node-transform composition, embedded-image hashes
  against `source-assets`, rig-leak and extension checks). Two of its checks were **corrected,
  not relaxed**, when the export proved them wrong: `KHR_texture_transform` is supported natively
  by three 0.185.1 so it is allowed by name while Draco/Meshopt still fail, and roughness maps are
  expected to be repacked by the exporter into `metallicRoughness`.
* `docs/technique-lab/interiors/renders/compare_runs.py` and `diff_glb.py` — measure
  reproducibility instead of asserting it; they are what showed the residual variation is index
  ordering alone.
