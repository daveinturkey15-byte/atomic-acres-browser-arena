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
| Register row 48 | AKP `references/ai-3d-technique-register.md` | LANDED, on `origin/main` (see B2 — it went in under another lane's commit) |
| Skill | vault `Skills/game-development/threejs-webgpu-interior-lighting-look/SKILL.md` | LANDED, `5e16b7b` + anchor repair `d3d7958`; **local only, push 403** (B3) |
| Eval record | AKP `skill-evaluations/threejs-webgpu-interior-lighting-look.json` | LANDED, `cbe9c52` + `025b9b3`, pushed |
| Vault note section | vault `Dev-Practices/AI 3D Technique Register.md` | LANDED locally, push blocked (B3) |
| SkillScan | v1.1.5 → **SAFE** (re-run after the anchor repair) | VERIFIED |
| Baseline acceptance | `skill-baseline.json` carries the skill at `f0a9ebbe…` | **ACCEPTED** (see B1 — swept in by another lane) |
| Flat-view relink | `link_skills.ps1` → 162/162 across all 7 harness roots | VERIFIED (after repairing a machine-wide break — B0) |

**Canonical identity of the skill, as of this repair pass — one hash, everywhere:**

| Where | SKILL.md sha256 |
| --- | --- |
| Vault canonical (`HEAD` = `d3d7958`, and on disk) | `f0a9ebbe4aba8dc2ab8c1912e3a4936eeff726b51fd63ee4320c974b409ee732` |
| Hermes canonical root, `~/.claude/skills` junction, `~/.qoder` copy | identical, all three |
| Eval record `candidate_sha256` | identical |
| Frozen `skill-baseline.json` | identical |

The earlier hash `f1a05724…` quoted in the first draft of this report is **superseded**: it was
the pre-repair file, before the skill's `surface-forge.ts` anchor was corrected to
`rendering/surface-forge.ts` (both anchors re-checked on disk — `src/rendering/surface-forge.ts`
and `src/map3/foliage-material.ts` exist). The matching SkillScan identifiers are `dir_sha256
569c3064b7c0622d429cf9723af8b6ea53b849c00317612076474e80f107cc03`, task
`8ba8e2e1-3a37-43ba-ac46-b17795f358eb`; the pre-repair scan (`8cf60ac4…` / `94c4855c-…`) was
also SAFE. Anyone verifying the skill against the old hash would have concluded it had drifted.

---

## 3. Claim register

| Claim | State | Evidence |
| --- | --- | --- |
| Source resolved without login; post is one line of text over one video, `replying_to` null, one media facet, no linked repo/article/video page | VERIFIED | `api.fxtwitter.com` HTTP 200 JSON, read in full three times (author, skeptic, repair). Text is exactly `Claude Fable 5.1 Ultracode subway fps game` |
| The author added no self-replies underneath | **CLAIMED** | The mirror returns the tweet object only and reports **85 replies** (84 at first read — the counter drifts); enumerating them needs a login, which is not permitted. Not verifiable by any allowed route |
| It is a browser game in Chrome at `localhost:8080`, tab "Ashworth St", Linux/GNOME | VERIFIED | Visible in all 17 extracted frames; independently reproduced by the skeptic from a fresh download at t=40 s and t=150 s |
| Not path traced / not real-time GI / not baked GI | VERIFIED by named falsifiers | §1; all three re-confirmed independently from a re-extracted frame |
| Emissive + fog + decals + motes + filmic post is the whole recipe | VERIFIED (consistent, nothing contradicts) | Study §4 |
| Built by Claude Fable 5.1 under `ultracode` | CLAIMED (author's caption) | Post text |
| Renderer is three.js WebGL2 with an UnrealBloom-class chain | CLAIMED — *attempted and negative*, not untried | Source not published. The containing YouTube video (chapter `28:36 — UltraCode Subway FPS Test`) was fetched login-free and names no renderer; its ASR track 404s without a session |
| Fixed exposure, no auto-exposure adaptation | CLAIMED | 13 s frame sampling would not catch a fast ramp |
| Film grain present | OPEN | Indistinguishable from H.264 noise at 2.1 Mbps |
| SSAO present | OPEN, probably absent | No junction darkening anywhere |
| Licence of the source | UNKNOWN → all-rights-reserved; method only | Nothing stated anywhere. Nothing was copied; no frame, image or media is committed in any repo, and the skill directory is `SKILL.md` only |
| Every repo anchor and art-direction bound the skill cites is exact | VERIFIED | Re-read at `0c7aab53`; `corridors.ts:357` = `headlightMat.emissiveNode = rgb(0xffe899, 2.5);`, `PARTICLE_MAX_LIGHT_SHAFTS = 6`, `bloomThresholdScale [1,1.3]`, `MINIMUM_COMPOSED_BLOOM_THRESHOLD 1.02`, `vignetteBase ≤ 0.24`. No fence weakened; both fences restated as fences |
| Skill discoverable from every harness | VERIFIED **now**, after a repair | `link_skills.ps1 -VerifyOnly`: OK 162/162 on all seven roots, junction, read-through probe OK. It was **broken** when the skeptic checked (B0) |
| Skill accepted into the frozen baseline | **VERIFIED — it is accepted** | `skill-baseline.json` carries `threejs-webgpu-interior-lighting-look` at sha256 `f0a9ebbe…`, matching disk; baseline `generated_at 2026-09-02T21:07:00Z`, committed on AKP main at `612b413` |
| The 360-char description ceiling is a hard guard failure that aborts *any* lane's accept, and the three trims that cleared it are uncommitted | VERIFIED | `skill_regression_guard.py:85` appends a **problem** above `max_chars` 360 (the WARN at :87 is the `elif` for `warn_chars` 220); `accept` returns on a non-zero `run_check` rc before writing the baseline. `HEAD` still holds 367/373/377; the working tree holds 326/330/330, mtimes 22:05-22:06, `git status` ` M`, no commit. See B1 |
| Any performance number for our repo | **NOT MEASURED** | Study lane; GPU at 14.3/16.3 GiB (owner's own work) all evening; no browser launched. All measurement deferred to §5 |

---

## 4. Blockers and process findings for the orchestrator

**B0 — RESOLVED, but the cause deserves a look: skill discovery was dead machine-wide.**
`C:/Users/david/.agents/skills` — the shared flat view — was an **empty real directory**
(0 entries, last written 2026-09-02 22:17). Claude Code, Codex, dsh, Continue and Antigravity
all junction into it and so discovered **zero skills**; OMP's root was missing; the
read-through probe failed. It also inflated `technique_register_guard.py` from 9 problems to 60
with spurious REG-8 "not mirrored to Codex" rows. Repaired with the sanctioned relink
(`link_skills.ps1`, no flags — additive, junctions only); **verified after: OK 162/162 on all
seven roots, probe OK, register guard back to 9.**

This is **a known failure mode with a written gotcha already in AKP** —
`gotchas/skill-mirror-tools-disagree-junctions-vs-copies.md` (commit `8dc73d0`, Hermes Desktop,
21:50 the same evening, recording the identical empty-flat-view event at 160 skills). It
records the hazard too: the obvious "fix", `sync_skill_mirrors.py --apply`, makes **real
copies** resolved by newest-wins mtime, and copy-into-a-junction is write-through — it would
overwrite canonical skills with stale Qoder copies. **Do not run it in this topology.** What is
still unknown is what emptied the flat view at 22:17 while lanes were running (a concurrent lane
invoking the linker in a mode that clears then aborts is the obvious suspect). Worth a guard,
because any lane can silently kill skill discovery for every harness on this machine.

**B1 — the original blocker was REAL, someone else fixed it mid-sweep, and the fix is
UNCOMMITTED. This is the one item on this page that still needs an owner.** The status here has
been wrong twice, so it is written out in full.

*What the first draft said:* `skill_regression_guard.py accept` refuses because
`gem-nano-agent-debug` (367), `wow-spp-local-mod-restore` (373) and
`game-release-benchmark-guard` (377) exceed the 360-char ceiling; one 37-character trim unblocks
four lanes. **That was correct when it was written.**

*What the skeptic pass said:* the blocker is false — those descriptions measure 326/330/330, are
under the ceiling, are untouched since commit `04b1468`, and the ceiling is WARN-only.
**That refutation was itself wrong, on both halves.**

*What is actually true, measured this pass:*

| Skill | at `HEAD` | in the working tree | trimmed at |
| --- | --- | --- | --- |
| `gem-nano-agent-debug` | **367** | 326 | 2026-09-02 22:05 |
| `wow-spp-local-mod-restore` | **373** | 330 | 2026-09-02 22:05 |
| `game-release-benchmark-guard` | **377** | 330 | 2026-09-02 22:06 |

- **The ceiling is not WARN-only.** `skill_regression_guard.py` line 85 appends a **problem**
  when `len(desc) > max_chars` (360); the WARN at line 87 is the *`elif`* branch for
  `warn_chars` (220) `< len ≤ 360`. The skeptic read the WARN branch and missed the ceiling
  above it. `description_policy` in `skill-regression-policy.json` is
  `{"max_chars": 360, "warn_chars": 220}` — two different thresholds.
- **A problem does abort the accept.** The `accept` path calls `run_check(...)` first and
  returns immediately on a non-zero rc, *before* it touches `skill-baseline.json`. So at
  367/373/377 the accept genuinely could not write the baseline, exactly as first reported.
- **"Untouched since `04b1468`" was an artefact of reading `git log`.** The trims were never
  committed — they are still uncommitted modifications in the shared vault working tree
  (`git status` shows ` M` on all three). `git log` cannot see them; only `git diff` and the
  file mtimes can. They are real edits: `Use when work involves` → `Use for`, and
  `preserve … compare` → `keep … block`.
- **Sequence.** The three descriptions were trimmed at 22:05–22:06 local, and
  `skill-baseline.json` was written at `generated_at 2026-09-02T21:07:00Z` (= 22:07 local) and
  committed as `612b413`. The blocker was cleared by whoever made those trims — not by this
  lane, which had explicitly declined to edit another skill's routing metadata — and this
  lane's skill went into the baseline in the same write.

*Where that leaves the four lanes:* **unblocked and complete.**
`threejs-webgpu-interior-lighting-look`, `comfyui-3d-native-pipeline` and
`open-world-city-art-loop` are all in the frozen baseline; a scoped re-accept now correctly
reports there is nothing to do:

```
PASS skill-regression-guard skills=162 drift=0 warnings=10
FAIL requested skills are not all drifted: ['threejs-webgpu-interior-lighting-look']
```

*The residual risk, and the actual owner item:* **the fix that unblocked four lanes exists only
as uncommitted working-tree edits in a store every harness on this machine reads through
junctions.** Any `git checkout`, `git restore` or `git stash` on the vault silently reverts all
three descriptions to 367/373/377, and the next skill acceptance — any lane's — fails again with
`FAIL description policy`, for a reason that will look unrelated to whatever that lane was doing.
Two things are owed, neither of them this lane's to do (they are other skills' routing metadata,
and per `skill-regression-policy.json` a description change is a routing change that wants its
own evaluation record):

1. **Commit the three trims**, with an evaluation record covering the routing change, so the
   unblock is durable rather than one `git restore` from vanishing.
2. **Decide whether the ceiling should fail the *accept* at all**, or only the skill being
   accepted. Today one unrelated over-length description blocks every lane's acceptance
   machine-wide, which is how a 37-character edit came to gate four lanes overnight. That is a
   policy question for the owner — **not something to "fix" by widening `max_chars`**, which
   would be weakening a verifier to get green.

**B2 — the shared AKP files are being committed wholesale by concurrent lanes.** My row 48 was
written into the working tree and then swept into commit `3776400` by the HF-420 lane, which
staged the whole register file; the baseline acceptance went the same way under `612b413` (B1).
Nothing was lost — the row is byte-identical on `origin/main` — but the ledger's authorship is
wrong, and a lane mid-edit could have had a half-written row published. Recommend: for shared
append-only files, stage a blob built from `HEAD` plus your own hunk (`git hash-object -w` +
`git update-index --cacheinfo`) rather than `git add <file>`. I used that route for the vault
note and it worked cleanly.

**B3 — STANDS. The vault cannot be pushed from this machine.** `git push origin master` on
`desky-bootstrap-clone` returns **403 Write access to repository not granted** (re-confirmed
this pass). Commits `5e16b7b` and the anchor repair `d3d7958` are local-only, as are the
HF-419/HF-420 skill commits ahead of them. Owner credential item; nothing an agent should work
around. Note the skill is nonetheless **live** for every harness — the harness roots junction to
the canonical store on disk, not to the remote.

**B4 — `link_skills.ps1` and the AKP register config still disagree about Qoder.** The link
script's harness roster has no Qoder entry, while `scripts/technique-register-config.json`
declares `~/.qoder/skills` as a mirror root, so REG-8 goes red for every new skill until it is
hand-copied. I copied mine (verified hash-identical to canonical at `f0a9ebbe…`). Per the B0
gotcha, Qoder is genuinely the one root that needs **copies**, must never be the source, and
must never be bulk-synced. Decide deliberately: add Qoder to `link_skills.ps1` as a copy-mode
root, or record a `mirror_exemptions` entry.

**B5 — pre-existing register-guard debt, untouched, and falling as other lanes land.** The
count is a moving target and none of it names this lane's skill (REG-4 and REG-8 are both clear
for `threejs-webgpu-interior-lighting-look`, confirmed by a grep of the guard output returning
zero hits). Measured this pass: **60 problems while the flat view was broken → 9 immediately
after the B0 repair → 6 an hour later**, as concurrent lanes accepted `threejs-webgpu-water` and
closed the HF-419 vault-note gap. The 13 quoted in the first draft matched no state at any point.

The six that remain, all other lanes' or older debt: rows 24 and 32 pin no commit (REG-5 ×2);
`local-video-generation` is absent from the baseline and drifted since its evaluation (REG-4 ×2);
`open-world-city-art-loop` is not mirrored to Qoder (REG-8); the `threejs-webgpu-water` Qoder
mirror disagrees with canonical (REG-7). The last two are both B4's Qoder gap, and per the B0
gotcha the fix is a **named, one-directional copy** canonical → Qoder, never a bulk sync. No
guard was weakened and nothing was forced.

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
