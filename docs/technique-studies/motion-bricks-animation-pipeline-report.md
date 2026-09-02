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
| Eval record | **DONE**, hash-matched (`681cea78…`), `decision: accept` |
| SkillScan | **DONE — SAFE** (static documentation; no executable code, network calls or system calls) |
| `link_skills.ps1 -VerifyOnly` | **DONE — 162/162** skills OK across all seven junctioned harness roots; read-through probe OK |
| Qoder mirror (a copy, not a junction) | **DONE for this skill only**, by scoped copy; hashes now equal |
| `skill_regression_guard.py accept --skill …` | **BLOCKED** — see below |
| Study written and pushed | **DONE** |

## The one blocked step — and the exact patch

```
FAIL skill-regression-guard problems=3 drift=1
- gem-nano-agent-debug: description 367 chars exceeds 360
- wow-spp-local-mod-restore: description 373 chars exceeds 360
- game-release-benchmark-guard: description 377 chars exceeds 360
```

The guard runs its description-policy check **library-wide before** applying the per-skill
scope, so **no accept can succeed anywhere in the library** until these three are fixed. All
three are committed and unmodified in the vault — pre-existing debt, not tonight's — and they
will block the HF-419/420/421 lanes identically. **This lane did not touch them (outside its
ownership) and did not weaken the 360-char threshold.** Exact patch, each under 360 chars with
every routing term preserved:

- **`gem-nano-agent-debug`** → 342: `, memory behavior` → `, memory`; `widget/desktop UI
  behavior` → `widget/desktop UI`; `or fixing leaks of raw reasoning` → `or leaks of raw
  reasoning`.
- **`wow-spp-local-mod-restore`** → 346: drop `/proficiencies` from
  `character gold/items/proficiencies/spells`; drop `default` from `new-character default
  grants`; drop `full ` from `full server/client restarts`.
- **`game-release-benchmark-guard`** → 345: drop the Oxford comma in `rendering, and release
  contracts`; drop `best-known build designations, ` from the use-list.

Then:

```
python scripts/skill_regression_guard.py accept --skill game-animation-asset-pipeline \
  --policy skill-regression-policy.json \
  --skill-root "C:/Users/david/Documents/desky-bootstrap-clone/Skills" \
  --baseline skill-baseline.json --evaluations skill-evaluations
```

The evaluation record is already written and hash-matched; nothing else is owed.

## Two process items the owner should see

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
