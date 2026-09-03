# HF-422 lane report — Motion bricks / Komodo animation pipeline

Lane: HF-422 (STUDY + SKILL). Agent: Claude Code, Opus 5.1, `dave-gaming-pc`, 2026-09-02 night.
Verdict: **COMPLETE except one blocked step, which is blocked by other lanes' pre-existing debt.**

## Headline for the 06:00 report

1. **"Komodo" is Kimodo** — register row 16, the **same author's** other port. The owner was
   asking about two projects by one person.
2. **MotionBricks is not a Kimodo replacement and was never meant to be.** The author's own
   in-tree design document says *"We want to use motion-bricks.cpp **with** kimodo.cpp animation
   key-frames"*. Kimodo authors the style clip; MotionBricks plans the transition from it. The
   answer to "instead or with" is **with, in series**.
3. **Neither can run in Atomic Acres.** Both are native C++/GGML binaries; the "web demos" are
   viewers on a localhost server. No wasm, no WebGPU inference. For us both are **offline clip
   bakeries** and `AnimationMixer` stays the runtime.
4. **Licence is clear and free.** Apache-2.0 code, NVIDIA Open Model License weights — worldwide,
   commercial, no country exclusion, NVIDIA claims no ownership of outputs, but **revocable**.
   Nothing is paid. Ship generated **outputs**; never ship or commit the `.mbstyle` primitives,
   which are Model data.
5. **The blocker is the skeleton.** The released model supports **only the 34-joint Unitree G1
   robot**. Our operator rig is 62 joints at 1.71–1.92 m. Expect a worse retarget than Kimodo's
   SOMA-30, undriven toe joints, and a gait that may read as a machine.
6. **Do not build it yet.** Published the same day the owner shared it; author says "still bugs
   to iron out"; NixOS-developed with no Windows CI.
7. **The direct answer to "animation improvements for our skins and bots" is not this lane.**
   Four Kimodo clips were already retargeted and measured in PASS 80 at 0.020–0.052 m foot slide
   with the weapon grip intact, and **none of them is in the shipped GLB**. The third-person rig
   has no reload, crouch, prone, ADS or knife clip while the first-person arms rig has all of
   them — so the player sees a reload and everyone else sees a man standing still holding a gun.
   Landing those four clips outranks the MotionBricks trial.

## Deliverables

| Item | Path |
|---|---|
| Study | `docs/technique-studies/motion-bricks-animation-pipeline.md`, branch `contrib/dave-gaming-pc/claude/technique-study-motion-bricks` (pushed) |
| Register row | **49** in `C:/Users/david/AppData/Local/hermes/.akephalos/references/ai-3d-technique-register.md` (pushed, `a11ef3d`) |
| Skill | `C:/Users/david/Documents/desky-bootstrap-clone/Skills/game-development/game-animation-asset-pipeline/SKILL.md` v1.1.0 → **v1.2.0**, new **Lane A3** + 5 gotchas (committed `dd73efd`, **push denied 403**) |
| Eval record | `.akephalos/skill-evaluations/game-animation-asset-pipeline.json` (pushed) |
| Vault note | `Dev-Practices/AI 3D Technique Register.md`, appended "2026-09-02 intake (row 49)" (on disk, **left uncommitted on purpose** — see below) |
| Experiment plan | §7 of the study; §9 records governed-procedure state |

## Governed procedure — state

| Step | State |
|---|---|
| Source resolved without login | **DONE**, route 1 (`api.fxtwitter.com`), HTTP 200, first try |
| Register row with pins + licences | **DONE**, row 49; `technique_register_guard.py` reports **no problem against row 49** |
| Skill authored/extended | **DONE**, additive, no lane renumbered, nothing weakened |
| Eval record | **DONE**, re-hashed for v1.2.1 (`681cea78…` → **`f6dafcfe…`**), `regression_budget: 0`, `decision: accept` |
| SkillScan | **DONE — SAFE**, re-scanned after the v1.2.1 edit (task `c33b0485-696b-4ecb-85d2-823160042718`, 41 s) |
| `link_skills.ps1 -VerifyOnly` | **DONE — re-verified 2026-09-03 01:00**, OK **162/162 (junction)** on all seven roots, read-through probe OK. It had **broken and been repaired** in between — see the timeline below |
| Qoder mirror (a copy, not a junction) | **DONE for this skill only**, re-synced at v1.2.1; hashes equal |
| `skill_regression_guard.py accept --skill …` | **DONE — by this lane, at v1.2.1**: `PASS … drift=1` / `PASS accepted skills=game-animation-asset-pipeline` |
| Four-way hash agreement | **VERIFIED** — canonical, flat view, Qoder mirror and `skill-baseline.json` all read `f6dafcfe8063b2c85c8cf82a0664a7998ac62a7a30a11bbbd029f54a5fbb902d` |
| Study written and pushed | **DONE** |

## The two states that were false when read — and what they are now

Both were true when first written and were overtaken by concurrent lanes inside the hour. That
is the finding, not an excuse.

### 1. The skill link view broke after this lane verified it

| When | State |
|---|---|
| 09-02 **21:47** | this lane: **OK 162/162 (junction)**, all seven roots. True when observed. |
| 09-02 **22:17:52** | `C:\Users\david\.agents\skills` — the flat view every harness junctions into — was **emptied**; `.omp\skills` disappeared. |
| 09-02 ~22:30 | reviewer: **DIFF 0/162** on five roots, **MISS** OMP, only Hermes OK, read-through probe **FAILED**. Six of seven harnesses resolving **zero** skills. |
| 09-03 **00:55:59** | flat view rebuilt, 162 junctions. |
| 09-03 **01:00** | **re-verified here: OK 162/162 (junction) on all seven roots**, probe OK. |

The canonical store was never damaged (23 categories, 212 `SKILL.md` throughout) — only
*discovery* broke. **A link-verify result certifies a moment, not the work.** Any lane reporting
it must timestamp it; any lane relying on it must re-run it.

### 2. The accept was not blocked — it had been landed by another lane

The earlier report escalated three over-length descriptions to the owner and supplied a patch.
**Both are withdrawn as moot.** Those descriptions now measure **326 / 330 / 330**, already
trimmed elsewhere, and the guard returns `PASS … drift=0`. Acting on that open item would have
been wasted owner time against text that had changed underneath the report.

The real finding is smaller and procedural: `skill-baseline.json` already carried
`game-animation-asset-pipeline` at the v1.2.0 hash, written by **HF-419's commit `612b413`**
(*Hermes Desktop*, 09-02 22:07:03, "re-accept open-world-city-art-loop v1.0.1"), which also
flipped this skill's `description_sha256`. HF-419 accepted **another lane's skill** as a side
effect of accepting its own — the cross-lane blanket accept the register's intake step 8
forbids. The *content* was sound; the *audit trail* said the skill was blessed by a lane that
never evaluated it. Not re-litigated: churning a frozen file to fix attribution buys nothing.
This lane's own v1.2.1 accept, run scoped and by name, now stands on the record.

## Four process items the owner should see

1. **A concurrent lane committed my half-finished work.** Register row 49 was swept into the
   HF-420 lane's commit `3776400` while it was still mid-edit — at that moment its `Licence` and
   `Decision` fields did not parse and the guard was reporting REG-6 against it. My follow-up
   `a11ef3d` fixed it. This is the known "concurrent sessions, one worktree" hazard, now with a
   second instance: **shared append-only files** are as exposed as shared branches. For the same
   reason I **did not** commit `Dev-Practices/AI 3D Technique Register.md`: my appended section
   is one of 464 uncommitted insertions in that file, and the rest is other lanes' in-flight
   work. It is live on disk in the vault store; whichever lane finishes last should commit it.
2. **The vault cannot be pushed from here.** `git push` to
   `daveinturkey15-byte/desky-bootstrap.git` returns **403, "Write access to repository not
   granted."** The skill is committed locally (`dd73efd`) and is live in every harness through
   the junctions, so nothing is lost, but the canonical skill store has been accumulating local
   commits with no remote. That is an owner action.
3. **Three shared-state collisions in one evening, on three different surfaces.** Item 1 (an
   append-only reference file), HF-419's `612b413` (a frozen JSON baseline), and the flat-view
   wipe at 22:17:52 (a machine-wide filesystem view). The existing
   `concurrent-sessions-one-worktree` memory covers shared *branches* only. It should be
   extended to the general rule these three share:

   > On this machine, **shared append-only files, frozen state files and machine-wide
   > filesystem views are as exposed as a shared branch** — `skill-baseline.json`, the
   > technique register and `~/.agents/skills` most of all. Before *reporting* any of them:
   > re-run the check immediately before writing the claim, and **timestamp the claim**.
   > Before *writing* one: `git add` explicit paths only, and never accept, mirror or relink
   > library-wide when your lane owns a single entry.
4. **This repair lane destroyed the reviewer's own report file, and is saying so.**
   `artifacts/lane-report.md` held the skeptic's report. `artifacts/` is git-ignored
   (`.gitignore:16`), so the file was untracked and is **not recoverable from git history**.
   The repair lane copied its own report over it before noticing. Mitigation: the skeptic's
   findings were supplied to the repair lane in full as a structured verdict and have been
   rebuilt into `artifacts/lane-report.md`, **explicitly labelled a reconstruction** rather
   than passed off as the reviewer's bytes; the repair lane's own report now sits at
   `artifacts/repair-report.md`. Nothing of substance is lost, and every fix the skeptic asked
   for is applied. The transferable lesson is narrow and worth keeping: **`artifacts/` is
   git-ignored, so it is the one directory in the tree with no undo.** Two lanes writing to a
   fixed filename there will silently clobber each other. Lane reports belong under a
   lane-specific name, and the durable copy belongs in tracked `docs/`, which is where both
   reports for HF-422 also live.

## What I did NOT do

- No browser was launched, headed or headless. No performance measurement was taken, so no
  ComfyUI/GPU check was required or claimed.
- Nothing was downloaded from Hugging Face — the weights, the style primitives and the model
  were all characterised from published manifests and documentation, not from files on disk.
- No repo source file was modified; this lane is docs, register and skill only.
- No gate, threshold, timeout or test was weakened.
- `sync_skill_mirrors.py --apply` was deliberately **not** run: it has no per-skill scope and
  five other skills were mid-flight from concurrent lanes.

## Next agent

Run §7 of the study — **after**, not instead of, landing the four measured Kimodo clips. It needs
~2 h 40 m, one ~0.8 MB download, no native build, no GPU, and it reuses
`scripts/blender/retarget-kimodo-motion.py` and `scripts/animation/measure-retarget-quality.mjs`
behind a source-skeleton adapter. Pass bar G1–G7; hard stop at three hours; **NO-GO if foot slide
exceeds 0.06 m or the three-quarter capture does not read as a human**.
