# HF-421 lane report — subway-scene lighting look

**Lane:** HF-421 (study + skill). **Agent:** Claude Code, Opus 5.1, `dave-gaming-pc`.
**Date:** 2026-09-02, overnight sweep. **Study:** `subway-scene-lighting-look.md` (same folder).
**Branch:** `contrib/dave-gaming-pc/claude/technique-study-subway-lighting`, worktree
`C:/Users/david/projects/aa-claude-study-subway-lighting`, off `0c7aab53`.

---

## 1. Headline for the 06:00 report

**The look Dave wants is not blocked on a renderer feature we do not have.** The source is a
**browser game in Chrome at `localhost:8080`** — same class of artefact as Atomic Acres,
built by Claude Fable 5.1 in Claude Code `ultracode` — and it uses **no GI, no lightmaps and
no ray tracing**. Three falsifiers, all visible in the frames:

- **no sampling noise anywhere** → not path traced;
- **no colour bleed** from a saturated red vending machine or red doors onto the grey
  concrete beside them → no real-time GI;
- **no cast shadows at all** — a thick cast-iron column standing directly under lit ceiling
  fixtures casts nothing, benches and litter have no contact shadow → no baked GI (a lightmap
  gives those away for free; a "baked" look without them is a contradiction).

What is actually there: emissive fixture bars driven above a bloom threshold, a handful of
short-range point lights on *visible* fixtures only, heavy dark-green fog reaching near-black
in ~40 m, four or five decal grime layers over plain tile and concrete, a dust-mote field, a
filmic tonemap with a green-grey shadow tint and warm highlights, a mild vignette, and **one**
exposure event (an arriving train's headlight blowing the frame with shafts through the dust).

**Consequence for the graphics ladder (HF-418): proposing GI, lightmapping or ray tracing *in
order to get this look* is now explicitly out of bounds.** The gap is art authoring — an
emitter kit, a dark-enough value target and a grime layer — all inside the existing fence.

---

## 2. What landed

| Item | Path | State |
| --- | --- | --- |
| Study | `docs/technique-studies/subway-scene-lighting-look.md` (this worktree) | LANDED |
| Register row 48 | AKP `references/ai-3d-technique-register.md` | LANDED, pushed (see §4 note — it went in under another lane's commit) |
| Skill | vault `Skills/game-development/threejs-webgpu-interior-lighting-look/SKILL.md` | LANDED, committed `5e16b7b` |
| Eval record | AKP `skill-evaluations/threejs-webgpu-interior-lighting-look.json` | LANDED, committed `cbe9c52`, pushed |
| Vault note section | vault `Dev-Practices/AI 3D Technique Register.md` | LANDED locally, push blocked (§4) |
| SkillScan | v1.1.5 → **SAFE** | VERIFIED |
| Flat-view relink | `link_skills.ps1` → 162/162 across all 7 harness roots | VERIFIED |
| Scoped guard accept | `skill_regression_guard.py accept` | **BLOCKED** (§4) |

---

## 3. Claim register

| Claim | State | Evidence |
| --- | --- | --- |
| Source resolved without login; post is one line + one video, no repo/article/thread | VERIFIED | `api.fxtwitter.com` HTTP 200 JSON read in full |
| It is a browser game in Chrome at `localhost:8080`, tab "Ashworth St", Linux | VERIFIED | Visible in all 17 extracted frames |
| Not path traced / not real-time GI / not baked GI | VERIFIED by named falsifiers | §1 |
| Emissive + fog + decals + filmic post is the whole recipe | VERIFIED (consistent, nothing contradicts) | Study §4 |
| Built by Claude Fable 5.1 under `ultracode` | CLAIMED (author's caption) | Post text |
| Renderer is three.js WebGL2 with an UnrealBloom-class chain | CLAIMED | Source not published |
| Fixed exposure, no auto-exposure adaptation | CLAIMED | 13 s frame sampling |
| Film grain present | OPEN | Indistinguishable from H.264 noise at 2.1 Mbps |
| SSAO present | OPEN, probably absent | No junction darkening |
| Licence of the source | UNKNOWN → all-rights-reserved; method only | Nothing stated anywhere |
| Skill discoverable from every harness | VERIFIED | 162/162, junction, read-through probe OK |
| Skill accepted into the frozen baseline | **NO — blocked** | §4 |
| Any performance number for our repo | **NOT MEASURED** | Study lane; GPU was at 14.3/16.3 GiB (owner's work) all evening; no browser launched |

---

## 4. Blockers and process findings for the orchestrator

**B1 — the scoped baseline accept is blocked by three unrelated skills, and this blocks all
four skill lanes tonight.** `skill_regression_guard.py accept --skill
threejs-webgpu-interior-lighting-look` exits 1 and refuses to write `skill-baseline.json`
because of three pre-existing policy failures in skills nobody in this sweep owns:

| Skill | Description length | Over the 360 ceiling by |
| --- | --- | --- |
| `gem-nano-agent-debug` | 367 | 7 chars |
| `wow-spp-local-mod-restore` | 373 | 13 chars |
| `game-release-benchmark-guard` | 377 | 17 chars |

Mine is 271 (a WARN only). `--force` exists and was **not** used: forcing would launder that
unreviewed drift into the baseline, which the intake procedure forbids in as many words.
`comfyui-3d-native-pipeline` and `open-world-city-art-loop` are absent from the baseline for
exactly the same reason, so this is one 37-character fix that unblocks four lanes. It needs
an owner or a lane that owns those three skills; trimming another skill's description is a
routing change and needs its own eval record.

**B2 — the shared AKP register file is being committed wholesale by concurrent lanes.** My
row 48 was written into the working tree and then swept into commit `3776400` by the HF-420
lane, which staged the whole file. Nothing was lost (the row is byte-identical on
`origin/main`), but the ledger's authorship is wrong and a lane that had been mid-edit could
have had a half-written row published. Recommend: for shared append-only files, stage a blob
built from `HEAD` plus your own hunk (`git hash-object -w` + `git update-index --cacheinfo`)
rather than `git add <file>`. I used that route for the vault note and it worked cleanly.

**B3 — the vault cannot be pushed from this machine.** `git push origin master` on
`desky-bootstrap-clone` returns **403 Write access to repository not granted**. My commit
`5e16b7b` is local-only, and so are the HF-419 and HF-420 skill commits ahead of it. Owner
credential item; nothing an agent should work around.

**B4 — `link_skills.ps1` and the AKP register config disagree about Qoder.** The link script's
harness roster has no Qoder entry, so the register guard's REG-8 stays red for every new skill
until someone copies it there by hand (I copied mine; hash-identical to canonical). Either add
Qoder to `link_skills.ps1` or record a `mirror_exemptions` entry — one of the two, deliberately.

**B5 — pre-existing register-guard debt, untouched:** rows 24 and 32 pin no commit; the Qoder
mirrors of `ai-3d-asset-generation-loop` and `threejs-webgpu-water` have diverged from
canonical; `local-video-generation` is unaccepted and drifted. All other lanes' or older debt.

---

## 5. EXPERIMENT PLAN — Map 3 corridor lighting trial (next agent, 2–3 h Opus)

**Goal:** land the interior look on **one** Map 3 corridor and prove with captures that it
cost nothing we care about. Do **not** touch other corridors or any other arena.

### Preconditions (fail closed)
1. `curl http://127.0.0.1:8188/queue` shows the owner's ComfyUI **idle**; if it is generating,
   every performance number is void — wait or report BLOCKED WITH EVIDENCE.
2. `nvidia-smi` shows **≥ 3000 MiB free**; retry every 60 s up to 10 times, then stop.
3. **Headless only.** Never a headed browser. `PASS73_NATIVE_WEBGPU=1` is headless by default.
4. Own worktree off the PASS 86 head, own branch, private preview port **4221**.

### Build (target ~90 min of the budget)
Scope: one corridor of Map 3's eight (`src/map3/corridors.ts` builds them around a hub).

1. **Emitter kit, prewarmed** — instanced ceiling fixture (emissive bar via `emissiveNode`,
   the `corridors.ts:357` headlight precedent), a halo card, a floor light-pool decal.
   **Four new materials maximum, all created at load/prewarm, none in combat.**
2. **Dressing** — column pitch, ceiling beam run with a service pipe, wall dado + frieze band,
   floor edge stripe. Boxes and planes; no imported anything.
3. **Grime** — one TSL procedural mask stack (fBM + worley, world-position driven, per-surface
   seed) shared by the wall and floor materials. Stains, damp blotches, cracks. Matte.
4. **Lights** — ≤ 2 shadowed spots at the chunk's focal points, ≤ 6 short-range unshadowed
   points at visible fixtures, everything beyond the first depth band emissive-only.
5. **Atmosphere** — raise this arena's `atmosphere.density` and fog so the far end goes
   near-black. **Do not touch the vignette** (`vignetteBase` ≤ 0.24 by design).
6. **Art direction row** — desaturated green-grey shadow tint, warm highlight tint,
   `bloomIntensityScale` up, `bloomThresholdScale` ≥ 1.0. Let `assertArtDirectionSafety` judge
   it; if it throws, the row is wrong, not the bounds.
7. **One exposure moment** — a single moving bright emissive with ≤ 4 shafts through the motes
   (`PARTICLE_MAX_LIGHT_SHAFTS` is 6 and extra shafts are silently dropped).

### Measure (~45 min)
- **Before:** `node scripts/qa/capture-map3-views.mjs --out artifacts/hf421/before --only <the
  views that see the corridor>` on the unmodified build. Keep `hud.json`.
- **After:** same command, same views, `--out artifacts/hf421/after`.
- **Tripwire:** `node scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` — in-combat creations
  must read **0**.
- **Focused vitest only** for the files you touched. Never the full suite.
- **Readability metric:** from the after-capture PNGs of the *darkest* authored view, compute
  the median luminance separation between enemy-silhouette pixels and their local background
  at ~15 m, and compare with the before-capture. Script it; do not eyeball it.

### Pass/fail bar (all must hold)
1. Pipeline tripwire **0** in-combat material creations.
2. `hud.json` frame time within **10%** of the before run at 2560x1440, ComfyUI idle.
3. Draw calls **+≤ 12**, triangles **+≤ 40k** for the chunk.
4. Enemy silhouette separation in the darkest view **≥ the before value**. A prettier corridor
   that hides an enemy fails, full stop.
5. `assertArtDirectionSafety` passes with no bound changed and no threshold widened.
6. No `ShaderMaterial` / `RawShaderMaterial` / `onBeforeCompile`; no imported mesh, image,
   font or LUT; no content derived from the reference video.
7. Focused vitest green; `tsc` 0.
8. Evidence committed under `docs/evidence/pass86/hf421/` (gzip JSON > 400 KB, halve PNGs
   > 600 KB). `artifacts/` is git-ignored and is never force-added.

### Budget and stop rule
One build, one browser, one preview server, ~2–3 h. **Stop and report** rather than widen a
fence: if the halo needs a lower bloom threshold, or the far end needs more vignette, the
answer is more emissive intensity and more fog — not a bound change. If the frame-time bar
fails, cut the second shadowed spot before cutting the grime; the grime is most of the look
and costs the least.

### Read first
`Skills/game-development/threejs-webgpu-interior-lighting-look/SKILL.md` (canonical vault
store; visible from every harness as `threejs-webgpu-interior-lighting-look`) and the study
document beside this report.
