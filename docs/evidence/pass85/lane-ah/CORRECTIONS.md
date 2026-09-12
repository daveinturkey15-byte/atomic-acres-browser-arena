# Lane AH — corrections after the skeptic pass (2026-09-03)

A skeptic re-measured this lane and refuted five things. All five are recorded below with what
was actually measured, what the repair was, and the resulting claim-state. **Nothing in the
lane's substance changed**: the node set, the licence verdicts, the rig-clip inventory and the
"step 5 is blocked" conclusion all survived independent re-measurement. What failed was evidence
integrity — a wrong digest, a wrong provenance line, a miscount, and an unsound method that
happened to reach the right answer.

The house rule this pass enforces on itself: **a claim is only as good as the method that could
have falsified it.** Three of the five failures are cases of an assertion that was true being
recorded with evidence that could not have shown it false.

---

## C1 — AKP commit `2644cdb` does NOT contain register row 45 (was: VERIFIED, now: REFUTED)

**The lane claimed** — filesChanged listed
`.akephalos/references/ai-3d-technique-register.md (AKP row 45, committed+pushed 2644cdb)`, and a
VERIFIED claim said "commits 2644cdb (register row 45 + two eval records) present in the log".

**Measured 2026-09-03:**

```
$ git show 2644cdb --name-only --format='%ci %s'
2026-09-02 21:47:45 +0100 Lane AH: register row 45 (...) + eval records for its two carrying skills
skill-evaluations/ai-3d-asset-generation-loop.json
skill-evaluations/comfyui-3d-native-pipeline.json

$ git log --oneline -S "45. Trellis.2 and Pixal3D as CORE ComfyUI nodes" -- references/ai-3d-technique-register.md
8414b3b Register row 47 (HF-419 GTA-style city art) + open-world-city-art-loop eval record   # 21:45:22
```

**True provenance.** Row 45's bytes were introduced by **`8414b3b`** — HF-419's commit, 2m23s
*before* Lane AH's own — which swept rows 45, 46, 47 and 48 out of the shared AKP working tree
together. `2644cdb` carries only the two evaluation records, and its subject names a change it
does not contain.

**Repair.** History is pushed and the content is correct on `origin/main`, so nothing was
rewritten. The provenance is corrected forward: AKP gotcha
`gotchas/commit-subject-names-a-change-a-sibling-lane-already-swept.md` (commit `c73b7c8`) records
the symptom, the cause (staging is by path, so the first lane to `git add` a shared reference
commits everyone's pending sections) and the correction (write the subject from
`git diff --cached --name-only`; attribute shared-file rows with `git log -S`, never with intent).

**Note the irony, which is the point.** This lane declined to commit the vault register note
precisely because committing a multi-owner file publishes other owners' prose under one lane's
authorship. The same thing happened to *it*, in the other direction, on the AKP copy — and it was
not noticed because the report asserted provenance from a commit subject rather than from the
file's history.

**State now:** REFUTED and corrected. Row 45 is present, correct and on `origin/main`
(`git rev-list --left-right --count origin/main...main` = `0 0`). Only the narrative was wrong.

---

## C2 — the animation note's published SHA-256 was wrong (was: VERIFIED, now: REFUTED)

**The lane published** `e881da8d647002478fccc0f7c4985512f4bdad9072043b76753db001427d5bcf` for
`Dev-Practices/Animation Pipeline Options 2026-09.md`.

**Measured 2026-09-03:** `b62eb7167ed0bfc7919915a6bef166ff2f6d0a10225c565ee64c2d9bb5fc49ca`.

This is **not** post-lane drift. The file is clean in vault git, was committed once at `7508f67`,
and `git show HEAD:<path> | sha256sum` returns the same `b62eb716…` as the bytes on disk. Nor is
it a line-ending artefact — the file is 130 LF / 0 CRLF, and neither a CRLF-normalised copy
(`a38e2367…`) nor a trailing-newline-stripped copy (`b1e8c722…`) produces `e881da8d…`. **No
representation of this file hashes to the published value**, so the digest was never measured
against the artefact it names.

A reviewer using ARTIFACTS.md as designed would have concluded the file had been tampered with.
That is the worst possible failure mode for the one document whose entire job is to be checkable.

**Repair.** ARTIFACTS.md now carries `b62eb716…`, states the vault commit (`7508f67`) it can be
checked against, and every row is now re-measured and split into *disk bytes* vs *committed blob*
so a reviewer can verify against git rather than only against a working tree they cannot see.

**State now:** REFUTED and corrected; all seven artefact digests re-measured this session.

---

## C3 — the session-1 guard count was 13, not 14 (was: VERIFIED, now: CORRECTED)

`GUARDS.md`'s own AFTER block reads `problems=13` and lists thirteen bullets. The lane report and
commit `80a17e11`'s subject both said 14. **13 is correct** — the guard's own output is the
authority and it was already in the evidence file; the report simply miscounted its own artefact.

**Repair.** GUARDS.md carries a correction note under the AFTER block, and the corrected series is
`47 → 13 → 9 → 8 → 6` (see C5 for the tail). The pushed commit subject stays as it is; a commit
message is not rewritten to fix a number that the evidence file already states correctly.

**State now:** CORRECTED. 13, from the guard's own stdout.

---

## C4 — weight absence was checked in a models tree the server does not read (method REFUTED, conclusion UPHELD)

**The lane's evidence** was `ls` of `ComfyUI_portable/ComfyUI/models/diffusion_models/` and
`models/vae/`.

**Measured 2026-09-03**, `GET /system_stats` → `system.argv`:

```
["ComfyUI/main.py", "--windows-standalone-build", "--port", "8188", "--disable-auto-launch",
 "--log-stdout", "--use-sage-attention", "--disable-pinned-memory",
 "--models-directory", "C:\\Users\\david\\Downloads\\ComfyUI-H3-setup\\downloads-current"]
```

The portable tree's own `models/` folder is **not** the root this process resolves. The lane's
conclusion was right by luck: the method could not have detected the weights had they been
installed, and it was written into a shared skill that five other harnesses read.

**Re-measured the sound way**, asking the server which files each folder resolves to:

| Endpoint | Response, 2026-09-03 |
|---|---|
| `GET /models/diffusion_models` | `["minimax_h3_fl2va_pruned_int8_convrot.safetensors", "minimax_music3_dit_fp16.safetensors"]` |
| `GET /models/vae` | `["minimax_h3_audio_vae_fp32.safetensors", "minimax_h3_video_vae_fp16.safetensors", "minimax_music3_dav.safetensors"]` |
| `GET /models/clip_vision` | `[]` |
| `GET /models/geometry_estimation` | `[]` |
| `GET /models/background_removal` | `[]` |

Zero of the six Trellis.2 / Pixal3D weights. **Step 5 is genuinely blocked**, now on evidence that
could have gone the other way.

**Repair.** Three places, because the unsound method had propagated:

1. `comfyui-3d-native-pipeline/SKILL.md` preflight — resolve the root from
   `/system_stats.argv` `--models-directory` (absent ⇒ install default), then check
   `GET /models/<folder>`; with an explicit "do not `ls` a guessed path" and this lane's own
   mistake named as the worked example. Vault commit `fd7149d`.
2. AKP register row 45 — a **Method correction (2026-09-03)** bullet. AKP commit `de10716`.
3. `SOURCES.md` in this directory.

Because the skill body changed (`b95258caf3cc` → `61202ad0e934`), its paired evaluation record was
rewritten to `change_type: update` with the sixth paired scenario, SkillScan v1.1.5 was re-run
(**SAFE**, `dir_sha256 f6b24a9ff052…`, task `9f235861-b2ac-4218-bbda-bf834459bfe5`), and the accept
was **scoped by name**. No ceiling, policy or gate was touched. The frontmatter and the 165-char
description are byte-identical, so `description_sha256` in `skill-baseline.json` is unchanged.

**State now:** METHOD REFUTED and repaired; CONCLUSION VERIFIED by the sound method.

---

## C5 — the LF assertion on the vault register note does not hold on disk (was: VERIFIED, now: DOWNGRADED)

**The lane claimed** "The vault note edit preserved LF line endings as the repo contract requires."

**Measured 2026-09-03:** `Dev-Practices/AI 3D Technique Register.md` is **766 CRLF / 0 bare LF** in
the vault working tree. The vault sets `core.autocrlf=true`, and the blob at `HEAD` is **275 LF /
0 CRLF**, so the *committed* form is LF and nothing is broken — but the assertion as written is
not reproducible, because it describes the working tree, which is CRLF by design on this machine.

**Repair.** The claim is restated honestly: *LF in the committed blob; CRLF in the working tree
under `core.autocrlf=true`.* That is the correct way to state a line-ending fact in either of
these repositories, and it is the form used everywhere in the corrected report. The AKP register
is the same shape (working tree CRLF, blob LF), and this session's edit to it preserved the file's
existing convention exactly — `git diff --stat` showed `2 insertions(+)`, `0 deletions`, i.e. no
whole-file line-ending rewrite.

**Still open, unchanged:** the vault register note remains uncommitted at 505 insertions / 14
deletions across ten owners' sections. That is a multi-owner reconciliation, not this lane's to
land — and C1 above is the freshly-measured evidence for *why* it is not.

**State now:** DOWNGRADED to a correctly-scoped VERIFIED claim.

---

## What did NOT change

Re-measured by the skeptic independently and by this pass again where cheap:

- ComfyUI **0.34.0** carries the whole Trellis.2 / Pixal3D node set from `comfy_extras.nodes_trellis2`
  with no custom pack; the SAM 3D Body mocap chain is present; the queue was idle both times.
- The 62-joint third-person operator rig has **24 clips and none of reload, crouch, prone, ADS or
  knife**, against the 37-joint first-person arms rig which has all five; no `Kimodo_` clip appears
  in any of the five shipped operator GLBs.
- Licence verdicts, including the three Comfy-Org repos with no LICENSE file and the DINOv3
  attribution condition.
- The branch is evidence-only, touches no game source, and the 360-char description ceiling is
  untouched at its original commit.
