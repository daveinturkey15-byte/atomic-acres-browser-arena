# Branch and worktree consolidation — salvage audit and retirement plan

Lane S of the PASS 85 sweep. Read-only audit; this file is the only thing the
lane wrote. Nothing was deleted, tagged, moved, pruned or fast-forwarded.

- **Shipping head measured against:** `75a4e508` (PASS 84, live 15:14 BST).
- **Measured:** first scan 2026-09-02 **19:30–20:04 BST** (it ends at commit
  `f1169a3e`, 20:04:40 +0100 — the earlier "19:30–20:40" header was impossible
  and is corrected); **re-measured and repaired 20:27–21:20 BST** after an
  independent skeptic review. Both from `C:\Users\david\projects\aa-gemini-audit`
  (detached at `75a4e508`, read-only).
- **Owner instruction behind this:** 07:05 / 14:10 — "I want all of these
  branches/worktrees consolidated and merged", "yeah that sounds good, get 84
  live then do that".
- **Claim-states:** VERIFIED = this lane ran the command and read the output.
  CLAIMED = taken from another record without re-running. OPEN = unresolved.
  ESTIMATED = derived from a declared sample, not measured per row.
- **Committed evidence (new, this repair):** `docs/evidence/pass85/lane-s/`
  — `branch-scan.tsv` (396 rows, one per local branch), `worktree-scan.tsv`
  (410 rows, one per registered worktree), `worktree-size-samples.tsv`
  (17 `du -sk` measurements). These are the only record that survives the
  323 branch and ~325 worktree deletions the plan performs.

---

## 1. Headline

**Counts as of the re-measurement, 2026-09-02 20:27–21:05 BST, ship `75a4e508`.**
Live lane branches move these daily — 396/95/301 now versus 395/97/298 at the
19:30 scan, entirely because three PASS 85 lane branches committed in between.
Re-derive with the commands in §2 before acting on any of it. Every row below is
reproducible from `docs/evidence/pass85/lane-s/branch-scan.tsv` and
`worktree-scan.tsv`, which are the per-row tables behind these aggregates.

| Fact | 19:30 scan | 20:27 re-scan | State |
|---|---|---|---|
| Local branches | 395 | **396** | VERIFIED |
| Merged into `75a4e508` | 97 | **95** | VERIFIED |
| Not merged | 298 | **301** | VERIFIED |
| — of those, every commit patch-equivalent on the shipping line (`SUPERSEDED`) | 143 | **143** | VERIFIED |
| — active PASS 84/85 lane branches (2026-09-02) | 12 | **15** | VERIFIED |
| — Pass 71 candidate family | 82 | **82** | VERIFIED |
| — older, non-Pass-71, non-active | 55 | **55** | VERIFIED |
| — unrelated history, **no merge-base at all** (all six `gh-pages`-lineage) | 4 + 2 (wrong) | **6** | VERIFIED, corrected |
| Registered worktrees | 412 | **410** | VERIFIED |
| — directory missing on disk | 3 | **0** | VERIFIED, see §4 |
| — clean | 380 | **379** | VERIFIED |
| — dirty (uncommitted work) | 29 | **31** | VERIFIED |
| — with a `node_modules` entry | 370 | **371** (198 real, **173 junctions**) | VERIFIED, corrected |
| — clean worktrees holding git-**ignored** evidence files | not measured | **319 (58,069 files)** | VERIFIED, new |
| — under `C:\Users\david\Documents\Codex\**` | 272 | **272** | VERIFIED |
| `.git` common dir size | 4.0 GB | 4.0 GB | VERIFIED |
| `origin/main` (`506d6142`) is a strict ancestor of `75a4e508` | 0 ahead, 506 behind | same | VERIFIED |
| Local `main` (`249a7ee7`) is a strict ancestor of `75a4e508` | yes | yes | VERIFIED |
| Existing tags in the repo | 3 (`hitl-fallback-20260825-1440`, `…-1455`, `pass78-fallback`); 0 `archive/` | same | VERIFIED |

Two rows above are **corrections, not drift**:

- The 19:30 scan split the orphan branches "4 `gh-pages` lineage + 2 with no
  merge-base". Measured: `git merge-base <b> 75a4e508` is **empty for all six**
  (`gh-pages`, `gh-pages-deploy-temp`, `gh-pages-update`, `gh-pages-v68-pin`,
  `desky/final-publish-45a6a37`, `desky/gh-pages-v68-live`). `gh-pages` is an
  orphan branch, so every branch cut from it is an unrelated history.
- "370 carrying a `node_modules` tree — retire, **this is the disk**" was wrong
  on both halves. 173 of the 371 are Windows **junctions** into ~20 hub
  worktrees and occupy essentially zero bytes (`du -sk` on one reports `0`;
  `Get-Item … LinkType` reports `Junction`). Disk is dominated by `dist-*`
  build copies at ~264 MB each — one sampled worktree carries 30 of them and
  measures 8.0 GB. §4 has the consequences, one of which is a new hazard.

**The single most important finding is not a branch.** It is a commit on the
shipping line — see §3.1.

---

## 2. Method

1. `git for-each-ref refs/heads` for every branch's tip, date, author, subject.
2. `git branch --merged 75a4e508` for the merged set; the rest is the unmerged set.
3. Per unmerged branch: `git rev-list --count 75a4e508..<b>` (commits ahead) and
   `git rev-list --count --cherry-pick --right-only 75a4e508...<b>` (commits with
   **no patch-id equivalent** anywhere on the shipping line — the one-command
   form of `git cherry`'s `+` count). `uniq == 0` ⇒ every hunk already landed.
4. Per candidate (`uniq > 0`): `git diff --diff-filter=A 75a4e508 <b>` for files
   present on the branch and absent from the shipping tree, then a **basename**
   join against every path under `src/`, `scripts/`, `tests/` on the shipping
   tree — because the shipping line reorganised `src/` into subdirectories
   (`src/systems/`, `src/combat/`, `src/rendering/`), a raw path diff reports
   moved files as missing. The basename join removes that noise.
5. For each surviving basename-novel file: `git log --diff-filter=D` on the
   shipping line to find whether it was **deleted** from the shipping line
   (and by which commit) or **never existed** there.
6. Per-feature judgement on the survivors, and byte-level `git diff` of the
   specific artefacts the brief named as known-stranded.
7. `git worktree list --porcelain`, then per worktree: `git status --porcelain`,
   `git status --porcelain --ignored=matching -- artifacts docs/evidence
   test-results playwright-report`, a `find -type f` count under those four
   paths, a `node_modules` / `dist*` / `public` probe, `readlink` on
   `node_modules`, and `git merge-base --is-ancestor` against the ship
   (410 worktrees, ~6 min total).

**The two per-row tables the brief asks for are committed, not summarised.**
Job 1 (per branch) and Job 2 (per worktree) are delivered as evidence files,
because 396 + 410 rows do not belong in prose and because they are the only
thing that survives the deletions:

| File | Rows | Columns |
|---|---|---|
| `docs/evidence/pass85/lane-s/branch-scan.tsv` | 396 | `branch, tip, committerdate_iso, author, merged, ahead, patch_unique, files_changed, insertions, deletions, class, subject` |
| `docs/evidence/pass85/lane-s/worktree-scan.tsv` | 410 | `path, branch, head, dirty_entries, ignored_evidence_files, node_modules, node_modules_kind, node_modules_target, dist_dirs, has_public, has_artifacts, has_test_results, merged_into_ship, structural_size_class` |
| `docs/evidence/pass85/lane-s/worktree-size-samples.tsv` | 17 | `structural_cell, kilobytes, path` — the `du -sk` calibration |

`class` in `branch-scan.tsv` is the one-line judgement the brief asks for, and
is derived, not typed: `MERGED` (ancestor of ship) → `UNRELATED` (no merge-base)
→ `SUPERSEDED` (`patch_unique == 0`) → `ACTIVE_LANE` (committed 2026-09-02) →
`PASS71_FAMILY` (name match) → `OLDER_UNMERGED`. The named STRANDED items in §3
are the per-feature reading on top of that machine classification.

**Sampling declared.** Two things were sampled, not exhausted:

- The 82-branch Pass 71 family is one nested candidate lineage. Its
  branch-only file set was read in full for the maximal tip
  (`pass71-recovery-20260816`, 168 commits ahead) and its concepts checked
  against the shipping tree; the other 81 tips were classified from their
  file-set signature, not from per-hunk reading. Every one of them is
  archive-tagged before deletion, so the sampling costs nothing recoverable.
- On-disk worktree size. **17** worktrees are measured with `du -sk`
  (`worktree-size-samples.tsv`), stratified across the five structural cells;
  every one of the 410 rows carries a `structural_size_class`. A full `du` is
  **not** run: measured cost is 32 s for a 2.8 GB worktree and two samples
  exceeded a 120 s timeout, so 410 of them is ≈3.5 h — outside this lane's
  budget and outside the brief's one-minute-per-item rule. Command if the owner
  wants the real inventory: `git worktree list --porcelain | awk '/^worktree
  /{print substr($0,10)}' | while read -r p; do du -sk "$p"; done`.

---

## 3. Salvage — what is genuinely not on the shipping line

### 3.0 The 301 unmerged branches, batched (Job 1)

Codex branches batched by pass number, as the brief asks. All VERIFIED from
`branch-scan.tsv`; `files` is the summed `git diff --shortstat 75a4e508...<b>`
file count across the batch.

| Batch | Unmerged | of which SUPERSEDED | with patch-unique commits | files vs ship |
|---|---|---|---|---|
| `codex/pass60` | 1 | 1 | 0 | 2 |
| `codex/pass63` | 4 | 3 | 1 | 67 |
| `codex/pass64` | 8 | 5 | 3 | 90 |
| `codex/pass65` | 64 | 45 | 19 | 1,589 |
| `codex/pass66` | 22 | 16 | 6 | 722 |
| `codex/pass69` | 11 | 9 | 2 | 168 |
| `codex/pass70` | 37 | 34 | 3 | 432 |
| `codex/pass71` | 78 | 0 | 78 | 18,044 |
| `codex/pass73` | 15 | 11 | 4 | 180 |
| `codex/pass74` | 1 | 0 | 1 | 22 |
| `codex/pass75` | 7 | 2 | 5 | 196 |
| `codex/*` no pass number | 4 | 3 | 1 | 131 |
| **Codex subtotal** | **252** | **129** | **123** | |

Non-Codex unmerged, by harness prefix: `claude/` 14 (0 superseded — these are
today's live lanes), `hermes/` 13 (9), `agent/` 5 (4), `gh-pages`-lineage 4 (0,
unrelated histories), `backup/` 3 (0), `desky/` 3 (1), `omp/` 1 (0),
`integration/` 1 (0), other 5 (0). **Subtotal 49.** 252 + 49 = 301.

The `pass71` row is the whole story of the "0 superseded / 18,044 files"
anomaly: it is one nested candidate lineage where every tip carries the same
large re-landed tree, which is why none of it is patch-equivalent and why §2's
basename join was needed to stop it reading as 51 stranded modules per branch.

### 3.1 STRANDED (S1) — a commit on the shipping line silently deleted 22 files

**VERIFIED. This is the biggest item in the audit and it needs no branch to fix.**

```
ccfeec867ec77635f6da83965451a4616411d809
Dave Hatton, Sun Aug 23 22:45:26 2026 +0100
test(HF-378): pin enemy-radar gunfire reveal wiring
23 files changed, 52 insertions(+), 6259 deletions(-)
```

The message describes a red-first integration pin — `+52` lines in
`src/radar-fire-reveal-main-integration.test.ts`. The commit also deleted
**22 files and 6,259 lines** that the message does not mention. It is an
ancestor of `75a4e508`, so those files are gone from the live game's tree.

Deleted (all VERIFIED absent from `75a4e508`, and **never re-added** —
`git log --diff-filter=A 75a4e508` since 2026-08-23 returns nothing for any
of these paths):

| Path | Lines | Added by |
|---|---|---|
| `src/feel/index.ts` | 430 | `3b79d9a2` fix(HF-374) farcrysis boots on WebGPU, 2026-08-23 |
| `src/feel/index.test.ts` | 400 | same |
| `src/feel/health-state.ts` | 350 | same |
| `src/feel/health-state.test.ts` | 212 | same |
| `src/feel/impact-response.ts` | 491 | same |
| `src/feel/impact-response.test.ts` | 242 | same |
| `src/coplanar-surface-audit.ts` | 504 | `970d4c52` feat(pass74) visual grading…, 2026-08-22 |
| `src/coplanar-surface-audit.test.ts` | 500 | same |
| `src/arena-grade-identity.ts` | 499 | `cbca7f68` feat(pass74) graphics wiring…, 2026-08-22 |
| `src/arena-grade-identity.test.ts` | 263 | same |
| `src/ui/carpet-corridor-map-overlay.ts` | 479 | `fe68d1dc` checkpoint(pass78), 2026-08-23 |
| `src/ui/carpet-corridor-map-overlay.test.ts` | 273 | same |
| `src/atomic-support-authority.ts` | 475 | `8c59907e` test: strengthen arm and support authority gates, 2026-08-21 |
| `src/atomic-support-authority.test.ts` | 205 | same |
| `src/invisible-blocker-audit.ts` | 397 | `3ee81399` fix(HF-346/344/321/348), 2026-08-23 |
| `src/invisible-blocker-audit.test.ts` | 241 | same |
| `src/arena-deployment-briefing.ts` | 89 | `cbca7f68` |
| `src/arena-deployment-briefing.test.ts` | 39 | same |
| `src/ui/deployment-briefing-surface.ts` | 71 | `cbca7f68` |
| `src/ui/deployment-briefing-surface.test.ts` | 56 | same |
| `src/shadow-refresh.ts` | 18 | pre-Pass-65 |
| `src/shadow-refresh.test.ts` | 25 | same |

**Why the build stayed green.** VERIFIED at `ccfeec86^`: nothing imported any
of them except their own tests. `src/environment-assets.ts`,
`src/farcrysis-art.ts` and `src/rendering/art-direction.ts` only *mention*
them in comments. So this was not caught by tsc or by the suite — it removed
six verifiers and one unwired subsystem without a single red test.

**What it cost, concretely.** Four of the deleted modules were gates, and the
AKP/AGENTS rule "never weaken a verifier, threshold or test" applies whether
the weakening was deliberate or accidental:

- `invisible-blocker-audit` — the *static* collider/visual parity audit. Two
  live comments on `75a4e508` still point at it and are now dangling:
  `scripts/qa/verify-invisible-blockers.mjs:4` ("The static parity audit
  (`src/invisible-blocker-audit.ts`) proves collider …") and
  `src/environment-assets.ts:164` ("`src/invisible-blocker-audit.test.ts` pins
  the parity"). The experiential walker survived; its static counterpart did not.
- `coplanar-surface-audit` (1,004 lines with its test) — z-fighting/coplanar
  surface gate, added the day the Terminal z-fighting fix landed.
- `arena-grade-identity` (762 lines) — arena grade identity. Note PASS 84's
  own head commit `75a4e508` had to "give Map 3 a grade that clears the
  distinctiveness floor"; the module that pinned grade identity was deleted
  ten days earlier.
- `atomic-support-authority` (680 lines) — the arm/support authority gate that
  `8c59907e` was explicitly committed to *strengthen*.
- `src/feel/**` (2,125 lines) — a "game feel" subsystem (health state, impact
  response) added by the HF-374 commit **the same day** it was deleted, and
  never wired to a caller. Relevant to the owner's live "it feels off"
  complaints (HF-399, 17:05).

**Salvage recipe — no branch needed.** `ccfeec86^` is on the shipping line:

```bash
git checkout ccfeec86^ -- \
  src/feel src/arena-grade-identity.ts src/arena-grade-identity.test.ts \
  src/coplanar-surface-audit.ts src/coplanar-surface-audit.test.ts \
  src/invisible-blocker-audit.ts src/invisible-blocker-audit.test.ts \
  src/atomic-support-authority.ts src/atomic-support-authority.test.ts \
  src/arena-deployment-briefing.ts src/arena-deployment-briefing.test.ts \
  src/ui/carpet-corridor-map-overlay.ts src/ui/carpet-corridor-map-overlay.test.ts \
  src/ui/deployment-briefing-surface.ts src/ui/deployment-briefing-surface.test.ts \
  src/shadow-refresh.ts src/shadow-refresh.test.ts
```

Restoring them wholesale is **not** the recommendation: they are ten days
stale against a tree that has moved 500+ commits, and `src/feel/**` was never
wired. The recommendation is a follow-up lane that, per module, decides
restore-and-rewire / restore-as-gate-only / retire-deliberately-with-a-note,
starting with the four gates. Everything above is the evidence that lane needs.

> This is also the reason 40+ old branches in §3.6 look like they carry
> "novel" `src/` work: they are simply older than `ccfeec86` and still hold
> `shadow-refresh` / `atomic-support-authority` / `coplanar-surface-audit`.
> Those branches are not the salvage source. `ccfeec86^` is.

### 3.2 STRANDED (S2) — Dave's own commit `19d6586d`, mobile compact rail

**VERIFIED absent from `75a4e508`.** Branch
`contrib/dave-gaming-pc/codex/pass75-mobile-compact-six-card-fix`, commit
`19d6586d` "wip(pass75): preserve compact mobile and six-card fixes",
Dave Hatton, 2026-08-22. Three files; two of the three hunks never landed.

- **LANDED:** `tests/e2e/pass64-hud-menu.spec.ts` `mapCardCount: 4 → 6`.
  `75a4e508:tests/e2e/pass64-hud-menu.spec.ts:435` already reads
  `mapCardCount: 6`. SUPERSEDED.
- **STRANDED:** `src/ui/pass66-overhaul.css`, two identical hunks. Ship still
  has the old rule at **lines 1858 and 1942**:

  ```css
  left: calc(var(--mtc-safe-left) + var(--mtc-stick-size) + 4px);
  ```

  Dave's fix (absent — `git grep` on `75a4e508` returns nothing):

  ```css
  left: calc(var(--mtc-safe-left) + max(var(--mtc-stick-size), var(--mtc-action-width)) + var(--mtc-button-gap));
  ```

  Owner-visible effect: on the compact mobile layout the combat action buttons
  are positioned from the stick width only, so they sit under the wider
  left-side action rail whenever `--mtc-action-width > --mtc-stick-size`.
- **STRANDED:** its pin in `src/ui/pass66-overhaul.test.ts` — the test
  `'positions compact combat actions after the wider left-side touch rail'`
  is VERIFIED absent from `75a4e508`.

This is a two-line CSS change with its own test, in the owner's own hand, on
the mobile/touch surface he asked about on 08-31 and again for gamepad work.
It should go to whichever lane owns `src/ui/pass66-overhaul.css` this pass.
Exact patch: `git show 19d6586d -- src/ui/pass66-overhaul.css src/ui/pass66-overhaul.test.ts`.

### 3.3 STRANDED (S3) — High Seas menu-preview provenance recipe

**VERIFIED.** Branch
`contrib/dave-gaming-pc/codex/pass75-high-seas-preview-provenance`, commit
`58e1817d`, 2026-08-22.

The **media landed**: `public/assets/original/menu-previews/high-seas.{mp4,webm,webp}`
are present on `75a4e508`. The **recipe that produced it did not** — these
paths have zero commits in the shipping line's history:

```
scripts/assets/generate-pass75-high-seas-runtime-menu-preview.ts   803
scripts/assets/finalize-pass75-high-seas-menu-preview.mjs          845
scripts/assets/pass75-high-seas-preview-dependencies.ts             52
scripts/assets/print-pass75-high-seas-preview-dependencies.ts        8
scripts/qa/verify-pass75-high-seas-menu-preview.mjs                912
scripts/qa/verify-pass75-high-seas-menu-preview-webgpu.mjs         197
baselines/menu/pass75-high-seas-preview/**  (provenance.json 276, runtime-capture-receipt.json 6955, choreography.json, cache-family-lock.json, README.md)
```

`baselines/menu/` does not exist at all on `75a4e508` (VERIFIED —
`git ls-tree 75a4e508 -- baselines/menu` is empty). AGENTS.md requires that
"the deterministic offline render recipe remains source/provenance evidence"
for arena previews. A shipped preview video with no reproducible recipe and
no verifier is exactly the provenance hole that contract exists to prevent.

**Recommendation:** restore the six scripts and the `baselines/menu/…` tree
before this branch is deleted, or record an explicit owner decision that
High Seas previews are provenance-exempt. Not a gameplay item; a contract item.

### 3.4 STRANDED (S4) — Azure Coil leviathan island patrol

**VERIFIED never on the shipping line** (0 commits in `75a4e508`'s history for
any of these paths; `git grep -i 'azure.coil\|leviathan'` on `75a4e508` returns
nothing). Branch `contrib/dave-gaming-pc/hermes/sea-dragon-island-patrol`,
2026-07-28, 1 commit, 18 files, +1,734.

```
src/azure-coil-presentation.ts / .test.ts
tests/e2e/azure-coil-island-patrol.spec.ts
scripts/blender/create-azure-coil-leviathan.py
```

A sea-dragon patrolling an island arena. High Seas ships, so this is plausible
live content, but it is a whole authored creature that no owner row asks for
and it arrives via a Blender authoring script. **Owner call, not an agent
call.** Its worktree (`C:\Users\david\projects\atomic-acres-sea-dragon-island-patrol`)
is **dirty (4 entries)** — reconcile before removing anything.

### 3.5 UNKNOWN — needs a human look (3 items)

- **`shouldEliminateArenaOverboard`** (`src/arena-overboard.ts`, on
  `contrib/dave-gaming-pc/codex/pass75-high-seas-audio-audit`): "High Seas has
  no swimming route: reaching the surrounding ocean is an overboard
  elimination." The shipping line solved the same problem differently —
  `75a4e508:src/high-seas.test.ts:454-456` pins a `HIGH_SEAS_SAFETY_FLOOR_Y`
  catch instead of an elimination. Two competing designs; the owner should say
  which he wants. Not a regression either way.
- **`src/rendering/webgpu-review-entry.ts`**
  (`contrib/dave-gaming-pc/codex/pass64-diagnostics`) — never shipped; a
  WebGPU review entry point. Probably superseded by the current review-camera
  tooling, unverified.
- **`scripts/blender/finalize-pass65-m4a1-anchor.mjs`**
  (`contrib/dave-gaming-pc/codex/pass65-weapon-asset-forge`) — never shipped;
  an M4A1 anchor finaliser. Relevant to the live HF-413 arms/socket work; the
  arms lane should glance at it before it is archived away.

### 3.6 SUPERSEDED — verified, not stranded

- **`contrib/dave-gaming-pc/codex/pass74-next`** (the brief's headline
  candidate: readable killstreak selector, chopper gunner controls, low-health
  audio, wallbang locks). **VERIFIED byte-identical on the shipping line** for
  `src/ui/pass74-killstreak-selector.css`, `src/pass74-selector-ci-wiring.test.ts`
  and `scripts/qa/pass74-chopper-hud-wiring-contract.mjs`;
  `tests/e2e/pass74-chopper-hud.spec.ts` is present on ship in a **larger**
  form. Its only branch-only files are `shadow-refresh` and
  `atomic-support-authority`, i.e. the §3.1 deletion set. **Safe to retire.**
- **Pass 71 family, 82 branches.** The 51 branch-only `src/` files on the
  maximal tip are Pass 71 evidence-contract scaffolding (`src/pass71-*.test.ts`,
  `scripts/qa/pass71-*`) plus ten modules whose concepts are all present on
  `75a4e508` under the reorganised names: `projectile-glass-*` /
  `weapon-glass-break-policy` → `src/glass-authority.ts`,
  `src/crossbow-glass-authority.ts`, `src/glass-collider-bounds.ts`,
  `src/window-glass-debris-presentation.ts`, `src/pass72-crossbow-glass-contract.test.ts`;
  `sticky-attachment-receipt` → `src/remote-sticky-attachment-authority.ts`;
  `viewmodel-contact-probe` → `src/systems/viewmodel-contact-probe.ts`;
  `explosive-bolt-impact-receipt` → `src/combat/explosive-bolt-target-buffer.ts`;
  nuke warning → the shipped `src/killstreak-catalog.ts` nuke entry.
  Classified SUPERSEDED by sampling (§2), archive-tagged before deletion.
- **`sanctified-frag` / `create-holy-hand-frag.py`** — appears branch-only on
  every pre-Pass-64 branch. Deliberately superseded by `d90f4ce9` (2026-07-25,
  "fix: harden Pass 64 multiplayer and arena feedback"), which replaced
  `src/sanctified-frag-audio.test.ts` with `src/frag-grenade-audio.test.ts` in
  the same commit. Intentional. VERIFIED.
- **`src/farcrysis-terrain.ts`** — deleted deliberately by `ff5e5ca5`
  "refactor(pass75): streamline farcrysis — wire what was orphaned, delete…".
  Intentional. VERIFIED.
- **143 branches with zero patch-unique commits** — every commit has a
  patch-id twin on the shipping line. VERIFIED mechanically, no reading needed.

---

## 4. Worktrees

410 registered at the re-scan. **Per-worktree table:
`docs/evidence/pass85/lane-s/worktree-scan.tsv`, 410 rows** — path, branch,
head, dirty count, ignored-evidence file count, `node_modules` kind and target,
`dist*` count, `public`/`artifacts`/`test-results` presence, merged-or-not,
structural size class. The aggregates below are `awk` over that file.

| Class | Count | Action |
|---|---|---|
| Directory missing on disk | **0** | nothing to do (see below) |
| Dirty (uncommitted changes) | 31 | **KEEP — reconcile first** |
| Clean | 379 | candidates |
| — of those, holding git-**ignored** evidence files | **319 (58,069 files)** | **inventory before removal — see the hazard below** |
| `node_modules` present | 371 | 198 real, **173 junctions** |
| Under `C:\Users\david\Documents\Codex\**` (dead Codex sessions) | 272 | retire |
| Under `C:\Users\david\projects` | 126 | live lanes excepted; rest retire |
| Modelled removal set under this plan | **325 removed / 85 survive** | |

**Missing directories: the earlier claim is withdrawn.** The 19:30 scan found
three (`aa-merge-audit-w2d-{w,x,y}` under `AppData\Local\Temp`) and asserted
that `git worktree prune --dry-run -v` would not catch them. At 20:35 all three
are **already unregistered** — 410 registered worktrees, 409 dirs in
`.git/worktrees`, **zero** registered directories missing, and
`git worktree prune --dry-run -v` prints nothing because there is nothing left
to prune. No remove step was ever run against them, so the most likely
explanation is exactly the one the earlier claim denied: `prune` (via auto-gc)
collected them. **The "prune does NOT catch these" instruction is unsupported
and has been removed from Step 3.** State: the original observation is
NOT REPRODUCIBLE; the mechanism is OPEN.

**HAZARD (new, VERIFIED) — `node_modules` is a junction in 173 worktrees.**
`ls -la` shows `node_modules -> …`, `Get-Item … | Select LinkType` reports
`Junction`, and `du -sk` on one reports `0`. They point at ~20 hub worktrees:

| Hub | Junctions into it | Hub's fate under this plan |
|---|---|---|
| `Documents\Codex\2026-07-25\…\atomic-acres-pass65-integration` | 43 | not a registered worktree — survives |
| `Documents\Codex\2026-08-09\…\atomic-acres-pass71-integration` | 33 | removed |
| `Documents\Codex\2026-08-09\…\atomic-acres-pass70-candidate` | 17 | removed |
| `Documents\Codex\2026-08-09\…\atomic-acres-pass71-owner-fixes` | 10 | removed |
| `C:\Users\david\projects\aa-omp-pass84` | 10 | **survives — live integration tree** |
| `Documents\Codex\2026-07-25\…\atomic-acres-pass66-integration` | 9 | removed |
| `C:\Users\david\projects\atomic-acres-production-27e0858` | 7 | survives (holds `main`) |
| `C:\Users\david\projects\atomic-acres-gauntlet` | 7 | survives (frozen) |

Two consequences, both measured against the plan's own removal set:

1. **Only 2 breakages**, and both are between worktrees nobody is using:
   `Documents\Codex\…\atomic-acres-rigged-bot-gate` (survives, dirty) links into
   `…\atomic-acres-pass69-3-surgical` (removed), and
   `projects\atomic-acres-verify-99da1d9` links into
   `projects\atomic-acres-desky-backlog-86dc167`. Both just need `npm ci` if
   anyone ever returns to them. Not a blocker; noted so it is not a surprise.
2. **The real risk is deletion through the reparse point.** 10 junctions point
   into `aa-omp-pass84` and 7 into the `main` checkout. Whether
   `git worktree remove --force` deletes the junction or recurses into its
   target is version- and filesystem-dependent, and this lane will **not** test
   it destructively on a live tree. State: **OPEN**. The safe, cheap pre-step
   is in Step 3: `cmd //c rmdir "<path>\node_modules"` removes a junction and
   never touches its target. Do it for every worktree before removing it.

**Dirty worktrees — do not touch (29).** Branch-carrying ones:

```
contrib/dave-gaming-pc/claude/eye-clearance-triage        aa-claude-eyeclear        4
contrib/dave-gaming-pc/claude/farcrysis-playable-preview  aa-farcrysis-load         2
contrib/dave-gaming-pc/claude/load-time-deep-cut          aa-claude-loadcut         2
contrib/dave-gaming-pc/claude/map3-demo-showcase          aa-map3                   3
contrib/dave-gaming-pc/codex/pass65-djmaesen-arms-integration   Documents\Codex\... 2
contrib/dave-gaming-pc/codex/pass65-killstreak-blockers   Documents\Codex\aa65ksb   2
contrib/dave-gaming-pc/codex/pass65-shed-release-blockers Documents\Codex\aa65shed  1
contrib/dave-gaming-pc/codex/pass65-wave2-arms            Documents\Codex\...       75
contrib/dave-gaming-pc/codex/pass69-3-rigged-bot-live     Documents\Codex\...        3
contrib/dave-gaming-pc/hermes/sea-dragon-island-patrol    atomic-acres-sea-dragon…   4
contrib/dave-gaming-pc/hermes/v68-live-test               atomic-acres-v68-live-test 4
desky/ci-evidence-timeouts-20260722                       atomic-acres-ci-evidence…  1
evidence/dave-gaming-pc/codex/pass69-2-rejected-squash    Documents\Codex\...       82
integration/pass74-plus-high-seas-20260822                atomic-acres-highseas      1
main                                                      atomic-acres-production-27e0858  1670
```

plus 14 detached ones. Two need naming:

- **`C:\Users\david\projects\atomic-acres-production-27e0858` holds branch
  `main` with 1,670 uncommitted entries.** The `main` fast-forward in §5(c)
  **cannot** be done with `git branch -f main`: git refuses to move a branch
  that is checked out. It must be `git -C <that worktree> merge --ff-only`,
  and that worktree's 1,670 entries must be reconciled or confirmed
  disposable first. This is the single blocking item in the whole plan.
- **`pass65-wave2-arms` (75) and `pass69-2-rejected-squash` (82)** carry real
  uncommitted volume in dead Codex sessions. Per AGENTS.md ("Do not clean,
  reset, stash, move, or delete another task's worktree") these are read-only
  until someone looks. The arms one may matter to the live HF-413 lane.

**Also flag, not delete:**

- `C:\Users\david\projects\atomic-acres-browser-arena` — the **canonical
  repository checkout** is sitting on `agent/rig-weapon-hud-source-20260722`
  (2026-07-22). It should be on `main`. Doing so is also a prerequisite for
  deleting that branch.
- `C:/c/Users/david/projects/atomic-acres-pass68-benchmark-fetch-fix` — a
  registered worktree whose path has a **doubled drive prefix**
  (`C:/c/Users/...`). Broken registration; verify before removing.
- `C:\Users\david\projects\pass74-parked\` — **never delete** (brief: the only
  copy of something). It is not a registered worktree, so no plan step touches it.
- `C:\Users\david\projects\atomic-acres-gauntlet` (+ its `.gauntlet-tmp\wt-head`)
  — frozen; leave.

**One worktree has a corrupt index and reads as clean (new, VERIFIED).**
`C:\Users\david\Documents\Codex\2026-08-09\i-ve\work\pass71-chopper-ci-257b-fix2`
(branch `contrib/dave-gaming-pc/codex/pass71-chopper-ci-257b-fix2`) answers
`git status` with `error: bad signature 0x00000000 / fatal: index file corrupt`.
Its index file is dated **Aug 14 10:35**, three weeks before this lane, so the
damage is pre-existing and was not caused by these scans. Two consequences, both
now fixed in the plan: the error goes to stderr, so a `$(git status --porcelain)`
test sees an empty string and classes the worktree **clean and deletable**; and
under `set -euo pipefail` the non-zero exit **kills the whole run** — it did, on
the first execution of the fixed script. Per AGENTS.md ("Do not clean, reset,
stash, move, or delete another task's worktree") this lane did not repair it.
State of the underlying work: **OPEN**, one worktree, nobody's active lane.

**HAZARD (new, VERIFIED) — `--force` destroys git-ignored evidence, and
`git status --porcelain` cannot see it.** `--porcelain` alone does not report
ignored files, and it is the only "is there work here?" test the original plan
had. Measured with `git status --porcelain --ignored=matching -- artifacts
docs/evidence test-results playwright-report` plus a `find -type f` in every
worktree: **319 of the 379 clean worktrees hold ignored evidence, 58,069 files
in total** — 30,591 in `atomic-acres-gauntlet` (excluded by path anyway), 2,952
in `Documents\Codex\…\atomic-acres-pass66-final-adjustments`, 2,611 in
`projects\atomic-acres-highseas`, 1,293 in `atomic-acres-pass69-2-runtime`, and
four-figure counts across the Pass 69–71 Codex sessions. `git worktree remove
--force` deletes the whole directory, ignored files included.

**Say it plainly: worktree removal is NOT covered by the archive tags.** The
`archive/<branch>` tags make every *branch* deletion reversible because the
commits stay reachable. Nothing in this plan makes a *worktree* removal
reversible: uncommitted work, ignored `artifacts/`, `test-results/` and
screenshot trees are gone permanently. Step 3 therefore inventories ignored
content and skips any worktree that has it, and prints the skip list.

**Disk.** ESTIMATED from a declared sample of 17 `du -sk` measurements
(`worktree-size-samples.tsv`), not measured per row. Spread **51.9 MB to
8.0 GB**; median ≈ 0.78 GB, mean ≈ 1.63 GB. Two worktrees
(`atomic-acres-browser-arena` and the doubled-prefix registration) exceeded a
120 s `du` timeout and are not in the mean. Applying median×325 and mean×325 to
the modelled removal set gives a reclaim of roughly **250–530 GB**, superseding
the earlier 150–400 GB guess. The structural size class is a **poor** size
predictor — the cells overlap badly (`E_noinstall_nodist` samples span 51.9 MB
to 984 MB, while `C_installed_nodist` measures 288 MB) — so use it as an
inventory key, not as a size. What actually dominates is `dist-*` build copies
at ~264 MB each: `aa-base-c736d48c` carries about thirty of them and measures
8.0 GB. `.git` itself is 4.0 GB VERIFIED and will not shrink from branch
deletion alone (archive tags keep every object reachable — by design).

---

## 5. The plan — exact, ordered, idempotent, dry-run first

**Do not run any of this from a lane worktree.** Run it from
`C:\Users\david\projects\atomic-acres-browser-arena` (the canonical checkout)
after the PASS 85 lanes have merged, and only with the owner's go-ahead.

Design notes, both taken from this repo's own scars:

- The retirement list is **enumerated at run time from a protect-list**, never
  hardcoded — the same rule `publish_pass84.py` states for channel retirement
  ("a hardcoded list is how a tree survives a retirement it was meant for"),
  and the same failure the `gotcha-hardcoded-gate-rosters` record describes.
- Every unmerged branch gets `archive/<branch>` **before** deletion, so every
  **branch** deletion is reversible with `git branch <name> archive/<name>`.
  Merged branches get no tag: their tips are already ancestors of the shipping
  head, so there is nothing to preserve. **This reversibility does not extend
  to worktree removal** — see §4: `--force` destroys uncommitted *and*
  git-ignored files and no tag brings them back.

### Step 0 — prerequisites (manual, blocking)

```bash
# 0a. Reconcile or accept the 1,670 uncommitted entries in the main checkout.
git -C C:/Users/david/projects/atomic-acres-production-27e0858 status
# 0b. Reconcile the two heavy dirty Codex worktrees (75 and 82 entries).
# 0c. Confirm with the owner: S2 (mobile rail), S3 (High Seas provenance) and
#     S4 (Azure Coil) are salvaged or explicitly abandoned. S1 is independent
#     of this plan and can proceed on its own lane at any time.
#
# 0d. BLOCKING — move the canonical checkout off a deletable branch.
#     `atomic-acres-browser-arena` IS the main working tree (VERIFIED:
#     `git rev-parse --git-common-dir` -> that path's .git) and it is checked
#     out on `agent/rig-weapon-hud-source-20260722`, which the derivation puts
#     on the DELETABLE list (VERIFIED: present in the 323, absent from the 73).
#     Step 2(a2)'s worktree lookup resolves exactly that path for that branch
#     (VERIFIED by running the awk read-only), and git refuses to remove a main
#     working tree — so the run dies there. It is also the directory this plan
#     tells you to run from. Because APPLY=0 only echoes, the dry run passes
#     and this surfaces for the first time under --apply.
git -C C:/Users/david/projects/atomic-acres-browser-arena status --porcelain   # must be reconcilable
git -C C:/Users/david/projects/atomic-acres-browser-arena checkout main
#     (Alternative if the checkout cannot be moved yet: add
#      agent/rig-weapon-hud-source-20260722 to the PROTECT heredoc in Step 1.
#      Step 2 also carries a path guard now, but 0d is the real fix — leaving
#      the canonical checkout on a July feature branch is the underlying bug.)
```

### Step 1 — the protect-list and the dry run

Write `scripts/orchestration/consolidate_branches.sh` (new file; this lane did
not create it — the exact content is below and is safe to paste):

```bash
#!/usr/bin/env bash
# Branch/worktree consolidation. DRY RUN unless --apply is passed.
set -euo pipefail
SHIP="${SHIP:-75a4e508}"                 # PASS 84 shipping head (or later)
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
run() { if [ "$APPLY" = 1 ]; then eval "$@"; else echo "DRY: $*"; fi; }

# --- protect-list, derived, not hardcoded -----------------------------------
PROTECT=$(mktemp)
{
  echo main
  echo gh-pages                                   # production output
  echo gauntlet/pass79-omp-20260823               # shipping lineage anchor
  echo contrib/dave-gaming-pc/omp/pass83-lobby-identity
  # every branch touched in the last 14 days (live lanes)
  git for-each-ref --format='%(refname:short) %(committerdate:unix)' refs/heads |
    awk -v c="$(( $(date +%s) - 14*86400 ))" '$2>c{print $1}'
  # every branch checked out in a worktree that is DIRTY
  git worktree list --porcelain |
    awk '/^worktree /{p=substr($0,10)} /^branch /{print p"\t"substr($0,8)}' |
    while IFS=$'\t' read -r p b; do
      [ -d "$p" ] || continue
      # `|| true`: exactly one worktree on this machine has a CORRUPT index
      # and `git status` exits non-zero there. Without this, set -e kills the
      # whole run inside a command substitution. Protect it either way — an
      # unreadable worktree is the last thing that should be auto-deleted.
      st=$(git -C "$p" status --porcelain 2>/dev/null) || { echo "${b#refs/heads/}"; continue; }
      if [ -n "$st" ]; then echo "${b#refs/heads/}"; fi
      : # the loop body MUST end true: with pipefail, a while-loop that ends on
        # a false test makes the whole pipeline false and set -e kills the run
        # before the protect-list is ever written. Found by executing the dry
        # run rather than reading it (VERIFIED: the first draft died here,
        # silently, with zero output and exit 1).
    done
} | sort -u > "$PROTECT"
echo "protected branches: $(wc -l < "$PROTECT")"

# --- ONE guarded worktree removal, used by BOTH Step 2 and Step 3 -----------
# Never remove: the main working tree, the frozen trees, the parked extraction.
SKIPPED=$(mktemp)
protected_path() {
  case "$1" in
    */atomic-acres-browser-arena|*/atomic-acres-gauntlet*|*/pass74-parked*) return 0;;
  esac
  # the MAIN working tree reports a RELATIVE common dir; linked ones report the
  # absolute path of the main tree's .git (VERIFIED both ways on this repo)
  [ "$(git -C "$1" rev-parse --git-common-dir 2>/dev/null)" = ".git" ] && return 0
  return 1
}
safe_remove_worktree() {
  local p="$1"
  [ -d "$p" ] || return 0
  if protected_path "$p"; then echo "SKIP (protected path): $p"; return 0; fi
  # (i) uncommitted work — and an UNREADABLE worktree counts as work
  local st
  if ! st=$(git -C "$p" status --porcelain 2>/dev/null); then
    echo "SKIP (git status failed - corrupt index?): $p" | tee -a "$SKIPPED"; return 0; fi
  if [ -n "$st" ]; then
    echo "SKIP (dirty): $p" | tee -a "$SKIPPED"; return 0; fi
  # (ii) git-IGNORED evidence: --porcelain alone cannot see this. 319 of 379
  #      clean worktrees hold 58,069 such files (VERIFIED, see section 4).
  local n
  # `|| true` INSIDE the group, not after the pipeline: find exits non-zero for
  # every path that does not exist, and with pipefail that kills the run
  # (VERIFIED: it did, on the second branch of the first dry run). Putting the
  # `||` after `| wc -l` instead is worse than the crash — it silently
  # overwrites a correct non-zero count with 0 and disarms this whole guard
  # (VERIFIED: that version reported 0 skips where 319 are due).
  n=$( { find "$p/artifacts" "$p/docs/evidence" "$p/test-results" \
              "$p/playwright-report" -type f 2>/dev/null || true; } | wc -l )
  if [ "$n" -gt 0 ]; then
    echo "SKIP ($n ignored evidence files): $p" | tee -a "$SKIPPED"; return 0; fi
  # (iii) node_modules is a JUNCTION in 173 worktrees. Drop the link first so
  #       --force cannot recurse into a shared or live target.
  if [ -L "$p/node_modules" ]; then run "cmd //c rmdir \"$(cygpath -w "$p")\\node_modules\""; fi
  run "git worktree remove --force '$p'"
}
```

Run it with no argument first. It prints every action it would take and
changes nothing — **except** the SKIP lines, which are real measurements and
are the point of the dry run. Read the skip list before passing `--apply`:
under the plan's own removal set (325 of 410) the ignored-evidence guard alone
takes ~300 worktrees off the removal list, and each one is a deliberate
decision (`rm -rf` it yourself, or archive the evidence first), not something
this script should make for you.

### Step 2 — (a) archive-tag, then delete branches

```bash
# --- (a1) tag every UNMERGED, unprotected branch --------------------------
git for-each-ref --format='%(refname:short)' refs/heads | sort |
  comm -23 - "$PROTECT" |
  while read -r b; do
    git merge-base --is-ancestor "$b" "$SHIP" 2>/dev/null && continue   # merged: no tag
    git rev-parse -q --verify "refs/tags/archive/$b" >/dev/null && continue  # idempotent
    run "git tag 'archive/$b' '$b'"
  done

# --- (a2) delete, worktree first, branch second ---------------------------
git for-each-ref --format='%(refname:short)' refs/heads | sort |
  comm -23 - "$PROTECT" |
  while read -r b; do
    # a branch checked out anywhere must lose its worktree first.
    # safe_remove_worktree (Step 1) refuses the main working tree, the frozen
    # trees, dirty trees, and trees holding git-ignored evidence.
    git worktree list --porcelain |
      awk -v want="refs/heads/$b" '/^worktree /{p=substr($0,10)} $0=="branch "want{print p}' |
      while read -r p; do safe_remove_worktree "$p"; done
    # if the worktree survived the guard, the branch is still checked out:
    # leave it alone rather than fighting git for it. Only meaningful under
    # --apply; in DRY mode nothing was actually removed, so testing it there
    # would report every branch as skipped and hide the real plan.
    if [ "$APPLY" = 1 ] && git worktree list --porcelain | grep -qx "branch refs/heads/$b"; then
      echo "SKIP branch (still checked out): $b"; continue
    fi
    if git merge-base --is-ancestor "$b" "$SHIP" 2>/dev/null; then
      run "git branch -D '$b'"          # see the design note below: -D, not -d
    else
      git rev-parse -q --verify "refs/tags/archive/$b" >/dev/null \
        || { echo "REFUSING $b: no archive tag (expected for every unmerged branch in DRY mode - a1 only echoed its tags)"; continue; }
      run "git branch -D '$b'"
    fi
  done
```

**Design note, corrected — it is `-D`, and the ancestry test above is the
guard.** The first draft used `git branch -d` here on the reasoning that "it
refuses if the merge assumption is wrong, which is the check". That reasoning
is **REFUTED, by measurement.** `git branch -d` validates against the branch's
configured *upstream* when it has one, and against *HEAD* otherwise — it never
looks at `$SHIP`. Modelling that exactly over the 69 merged-and-deletable
branches, from the checkout this plan tells you to run in
(`atomic-acres-browser-arena`, HEAD `1fe03af1`, 2026-07-22):

```
-d succeeds via HEAD          1
-d succeeds via upstream     53
-d REFUSES                   15   <- all 15 are genuine ancestors of 75a4e508
```

Of the 15, **10 have no upstream at all** and **5 have an upstream that does not
contain them** (their `origin/…` ref is behind the local branch). The guard
fires on branches whose merge assumption is *right*, and under
`set -euo pipefail` the first refusal kills the run — invisibly, because
`APPLY=0` only echoes. The 15: `codex/pass61-experimental-netcode`,
`pass61-release-browser-prereq`, `pass64-gameplay`, `pass65-final-stability-fixes`,
`pass66-integration`, `pass69-3-arms-author-20260810`,
`pass69-3-rigged-evidence-integration`, `pass69-live-soak`, `pass70-candidate`,
`pass70-hands`, `pass70-optic-aperture`, `hermes/pass59-favicon-console-hygiene`,
`pass59-menu-baseline-normalization`, `pass59-release-metadata`, and
`evidence/dave-gaming-pc/codex/pass69-2-rejected-squash-main-mispoint`.

The enclosing `git merge-base --is-ancestor "$b" "$SHIP"` already performs the
check `-d` was believed to perform, against the *right* reference, so `-D`
loses nothing: every branch reaching that arm is an ancestor of the shipping
head and its commits stay reachable from `$SHIP`.

Expected effect, VERIFIED by running the protect-list derivation read-only twice
— at 20:00 and again at **20:50** on 2026-09-02, no deletions performed:

```
                                       20:00   20:50
branches touched in the last 14 days      62      63
protect-list total                        72      73
deletable total                          323     323
  of which already merged (no tag)        69      69
  of which unmerged (archive-tagged)     254     254
worktrees in the modelled removal set      —     325   (85 survive)
```

So: **73 branches survive, 323 are retired, 254 `archive/*` tags are created**,
and at most 325 worktrees are offered for removal — of which the Step 1 guards
will skip roughly 300 on ignored-evidence grounds until someone decides about
them one by one.
Those counts move with the protect-list at run time — that is the point of
deriving it rather than pasting it. The 14-day window is deliberately generous;
it keeps every PASS 79–85 branch, not just today's lanes. Narrow it to 3 days
only if the owner wants the Pass 79–83 names gone too, and only after they are
tagged.

### Step 3 — (b) remove worktrees

```bash
# stale registrations whose directory is gone.
# `prune` is the right tool and it does catch these: at the 20:35 re-scan zero
# registered directories were missing and the three the 19:30 scan had seen
# (aa-merge-audit-w2d-{w,x,y}) were already gone with no remove ever run.
run "git worktree prune -v"

# every clean worktree whose branch is now gone or is fully merged.
# safe_remove_worktree (Step 1) is the ONLY removal path: it refuses the main
# working tree, the frozen trees and pass74-parked, refuses anything dirty,
# refuses anything holding git-IGNORED evidence, and drops a node_modules
# junction before --force can recurse through it.
git worktree list --porcelain |
  awk '/^worktree /{p=substr($0,10); b="(detached)"} /^branch /{b=substr($0,8)} /^$/{if(p!=""){print p"\t"b; p=""}}' |
  while IFS=$'\t' read -r p b; do
    [ -d "$p" ] || continue
    br=${b#refs/heads/}
    if [ "$br" = "(detached)" ] || ! git rev-parse -q --verify "refs/heads/$br" >/dev/null; then
      safe_remove_worktree "$p"
    fi
  done

echo "--- worktrees deliberately kept ---"; cat "$SKIPPED"
```

Order matters: branches first (Step 2 removes the worktrees that block a
delete), then this sweep catches detached and now-branchless trees.

### Step 3b — the dry run was executed, and that is how three more defects were found

**VERIFIED, 2026-09-02 21:15–21:55 BST.** Steps 1–3 were extracted from this
document verbatim, `bash -n`-checked, and **run to completion in DRY mode** from
`aa-gemini-audit`. The first draft of this plan had never been executed. It does
not survive its own first run:

| # | Defect found by running it | Fix |
|---|---|---|
| 1 | The protect-list loop ends on `[ -n "$st" ] && echo …`. When the last worktree is clean that test is false, so the `while` is false, so with `pipefail` the whole group is false and **`set -e` kills the run before `$PROTECT` is ever written** — silently, zero output, exit 1. | end the loop body with `:` |
| 2 | `n=$(find "$p/artifacts" … \| wc -l)` — `find` exits non-zero for every path that does not exist, and `pipefail` propagates it, killing the run on the second branch. | `{ find … \|\| true; } \| wc -l` |
| 3 | The obvious repair for #2, `… \| wc -l) \|\| n=0`, is **worse than the crash**: it overwrites a correct non-zero count with 0 and silently disarms the ignored-evidence guard. That version ran to completion and reported **0 skips where 270 are due**. | put the `\|\| true` inside the group, not after the pipe |

Defect 3 is the one worth remembering: a guard that fails open looks exactly
like a guard that passed. Final DRY run, exit 0, no `fatal:`, no `error:`:

```
protected branches                  80     (live lanes kept committing during the run)
DRY: git tag archive/*             254
DRY: git branch -D                  69     == the 69 merged deletable, exactly
REFUSING (no archive tag)          254     expected in DRY: a1 only echoed its tags
DRY: git worktree remove            54     unique paths
DRY: cmd //c rmdir <junction>       19
SKIP (ignored evidence)            270     unique paths
SKIP (dirty)                        15     unique paths
SKIP (protected path)                4     browser-arena + 3 gauntlet trees
```

`SKIP (protected path): C:/Users/david/projects/atomic-acres-browser-arena` is
B1 fixed and demonstrated: the main working tree is refused by the guard rather
than removed. The corrupt-index worktree never reaches a removal call, because
the protect-list now treats an unreadable worktree as dirty.

**Expect this step to skip far more than it removes, and that is correct.**
319 of the 379 clean worktrees hold git-ignored evidence (§4). The skip list is
the deliverable: it turns "delete 325 directories" into a reviewable inventory,
and only the owner should decide which evidence trees are disposable. Deleting
a worktree is the one irreversible action in this whole plan.

### Step 4 — (c) fast-forward `main`

`origin/main` is **0 ahead / 506 behind** the shipping head and a strict
ancestor: the fast-forward is lossless (VERIFIED). `main` is checked out in
`atomic-acres-production-27e0858`, so it must be moved *in that worktree*:

```bash
git -C C:/Users/david/projects/atomic-acres-production-27e0858 status --porcelain   # must be empty
run "git -C C:/Users/david/projects/atomic-acres-production-27e0858 merge --ff-only $SHIP"
run "git -C C:/Users/david/projects/atomic-acres-browser-arena checkout main"   # canonical checkout back onto main
# push is the owner's call — AGENTS.md forbids contributors pushing main
echo "then, with owner approval:  git push origin main"
```

Also retire the stale local `gh-pages` lineage. `origin/gh-pages` (`13521e78`,
2026-09-02) is current and carries exactly `channels/pass83` + `channels/pass84`
— **HF-400 is satisfied in production, VERIFIED**. The local copies are stale
publish attempts and are a live hazard: a careless `git push` from any of them
would clobber production.

```bash
# `gh-pages` is on the protect-list, so Step 2 leaves it alone. Reset it,
# don't delete it: the name itself must keep meaning "production output".
run "git tag archive/gh-pages-local gh-pages"      # its 5 commits not on origin/gh-pages
run "git branch -f gh-pages origin/gh-pages"
```

The other four stale publish branches — `gh-pages-deploy-temp` (0 commits not
on `origin/gh-pages`), `gh-pages-update` (2), `gh-pages-v68-pin` (1),
`desky/gh-pages-v68-live` (0) — plus `desky/final-publish-45a6a37` (94) are
**not** protected, so Step 2 already archive-tags and deletes them. Do not add
a second loop for them here; it would only fail on the existing tag.

### Step 5 — (d) the salvage list handed to a follow-up lane

Do **not** run any of this in the consolidation pass; it is code change.

| Id | Item | Exact source | Owner lane |
|---|---|---|---|
| S1 | 22 files / 6,259 lines silently deleted by `ccfeec86` — four gates + `src/feel/**` | `git checkout ccfeec86^ -- <paths in §3.1>` | new lane; gates first |
| S2 | Mobile compact combat-rail offset, 2 CSS hunks + 1 test | `git show 19d6586d -- src/ui/pass66-overhaul.css src/ui/pass66-overhaul.test.ts` | whoever owns `src/ui/pass66-overhaul.css` |
| S3 | High Seas preview provenance recipe + verifiers + `baselines/menu/**` | `git checkout contrib/dave-gaming-pc/codex/pass75-high-seas-preview-provenance -- scripts/assets scripts/qa baselines/menu` | release/provenance |
| S4 | Azure Coil leviathan island patrol (owner call) | branch `contrib/dave-gaming-pc/hermes/sea-dragon-island-patrol` | owner decision |
| S5 | `shouldEliminateArenaOverboard` vs the shipped safety-floor design | `contrib/dave-gaming-pc/codex/pass75-high-seas-audio-audit:src/arena-overboard.ts` | owner decision |
| S6 | `finalize-pass65-m4a1-anchor.mjs` — glance before archiving | `contrib/dave-gaming-pc/codex/pass65-weapon-asset-forge` | HF-413 arms lane |
| S7 | `src/rendering/webgpu-review-entry.ts` | `contrib/dave-gaming-pc/codex/pass64-diagnostics` | probably retire |

Every one of S3–S7 survives deletion via its `archive/*` tag, so Step 2 does
not have to wait for them. S1 and S2 are not on any branch's critical path and
can start immediately.

### Step 6 — (e) the two release mechanisms

There are two, and only one is being used:

| Mechanism | State | Last used |
|---|---|---|
| `.github/workflows/release-production.yml` — the serialized GitHub Actions publisher AGENTS.md names as canonical ("Production promotion is serialized by …; never deploy from a feature branch or local dirty tree") | present, **untouched since `65b5e3a8`, 2026-08-21 (PASS 73)** | PASS 73 |
| `scripts/orchestration/publish_pass8N.py` — five local Python publishers: 80 (260 lines), 81 (579), 82 (572), 83 (578), 84 (917) | the de-facto publisher; PASS 82/83/84 shipped this way | PASS 84, 15:14 today |

`publish_pass84.py` is not a copy of `publish_pass83.py` — 813 lines differ. It
carries guards its siblings do not (build-freshness, farcrysis-unselectable
checked against minified bytes, content-addressed root chooser, run-time
enumeration of the retirement set, a HF-400 post-state assertion) and its own
red test `publish_pass84_plan.test.mjs`.

**Noted at commit time, 20:04 BST; landed immediately after this report in
`d606290c` (20:06:15) — the earlier "uncommitted, noted 20:45" was wrong on
both counts (VERIFIED):** the orchestrator added
`scripts/orchestration/roll_pass.py`, which *generates*
`publish_pass{N}.py` from `publish_pass{N-1}.py` with every pass number rolled
and each edit asserted to match exactly once, plus `publish_pass85.py` (913
lines) and its plan test. That removes the hand-copy drift risk, which was the
worst part of the problem. It does not remove the proliferation: the repository
still gains one ~900-line publisher per pass, permanently.

**Recommendation, in order:**

1. **Do not delete `publish_pass80..84.py` in this pass.** They are the only
   record of how PASS 80–84 were cut, and one of them is the fallback if a
   PASS 85 publish has to be rolled back to a PASS 83-shaped tree.
2. Once `roll_pass.py` has cut PASS 85 successfully, invert it: keep one
   parameterised `scripts/orchestration/publish_pass.py --pass N --backup N-1`
   (built **from `publish_pass85.py`**, so no guard is weakened) and let
   `roll_pass.py` roll only the *stamp* files it already handles — steps 3–7 of
   its own docstring — rather than also cloning step 1's 900 lines. Then, and
   only then, retire the superseded copies (git history keeps them). This is a
   PASS 86 item, not a PASS 85 one: do not touch the publisher during a cut.
3. Make `release-production.yml` **call that script** rather than re-implement
   publishing, so AGENTS.md's "one serialized publisher" is true again instead
   of aspirational. Until that lands, the workflow is a loaded gun: it is 12
   days stale, knows nothing about HF-400, and would republish the old
   multi-channel topology if anyone triggered it.
4. Reconcile `release-channels.json` at head: it still declares **eight**
   channels (`latest`, `experimental`, `previous`, `retained`, `historical`,
   `stable`, `rollback`, `pass83Backup`) while production carries **two** trees.
   `publish_pass84.py` guards this at publish time in
   `resolve_in_game_fallback()` / `assert_in_game_fallback_exists()` — cite the
   symbols, not line numbers: `roll_pass.py` regenerates this file every pass,
   so the "507–547" in the first draft is already ~494/526 at `75a4e508` and
   will be wrong again by PASS 86. So it is
   not live-broken — but the checked-in manifest disagreeing with production is
   the exact shape of the `gotcha-published-but-unselectable-pass` failure.
   OPEN: owner/release lane to decide whether the manifest is trimmed to two.

---

## 6. Could not classify

| Item | Why | State |
|---|---|---|
| 82 Pass 71 branches, per-hunk | Nested candidate lineage; only the maximal tip was read in full (§2). All are archive-tagged, so nothing is lost. | CLAIMED |
| Total disk reclaim | `du` over 410 worktrees is ≈3.5 h (measured 32 s for one 2.8 GB tree, two >120 s); 17 sampled, spread 51.9 MB–8.0 GB. Median×325 to mean×325 = **250–530 GB**. | ESTIMATED |
| Per-worktree size class | The structural class (`node_modules` / `dist*` / `public`) is a **poor** predictor — cells overlap by two orders of magnitude. Delivered as an inventory key only. | ESTIMATED |
| All six `gh-pages`-lineage branches | **No merge-base with the shipping line at all** (VERIFIED for each: `git merge-base <b> 75a4e508` empty). `desky/final-publish-45a6a37` is 94 commits not on `origin/gh-pages`, `desky/gh-pages-v68-live` and `gh-pages-v68-pin` 8 each, `gh-pages` 5, the other two 2. Content not diffable against `src/`; archive-tag and delete. | VERIFIED unrelated / CLAIMED disposable |
| Whether `git worktree remove --force` recurses through a `node_modules` junction | 173 worktrees link into ~20 hubs, 10 of them into the live `aa-omp-pass84` and 7 into the `main` checkout. Testing it means risking a live tree, so it was not tested. Step 1 drops the junction with `cmd //c rmdir` first, which makes the answer irrelevant. | OPEN |
| Why the three `aa-merge-audit-w2d-*` registrations disappeared between 19:30 and 20:35 | No remove step was run by anyone. `prune` via auto-gc is the only mechanism that fits. The first draft's "prune does NOT catch these" is withdrawn. | NOT REPRODUCIBLE / OPEN |
| `C:/c/Users/david/projects/atomic-acres-pass68-benchmark-fetch-fix` | Doubled drive prefix in the registered path. | OPEN |
| Whether `ccfeec86`'s deletion was intentional | The message says nothing about it and the +52-line pin it describes is unrelated to all 22 files. Consistent with a stale working tree / `git add -A` — the `concurrent-sessions-one-worktree` failure mode. No record found either way. | OPEN |

---

## 7. Gotcha (Symptom → Cause → Correction → Verify)

**Symptom:** an audit reports dozens of old branches carrying "novel" runtime
modules that the shipping tree lacks, implying mass stranded work.
**Cause:** two independent effects, neither of which is stranding — (i) the
shipping line reorganised `src/` into subdirectories, so a path-level
`--diff-filter=A` reports every *moved* file as missing; (ii) one commit on the
shipping line silently deleted 22 files, so every branch older than it appears
to "add" them back.
**Correction:** join branch-only files against a **basename** index of the whole
shipping tree, then run `git log --diff-filter=D` on each survivor to separate
"never existed on the shipping line" (real) from "deleted from the shipping
line" (a shipping-line bug, not a branch to salvage).
**Verify:** the survivor set drops from ~51 files per Pass 71 branch to zero
real stranded modules, and the deletion query names a single commit — here
`ccfeec86`, whose `--stat` shows 52 insertions against 6,259 deletions.

### 7.2 Gotcha — a worktree-cleanup plan that only asks `git status`

**Symptom:** a bulk `git worktree remove --force` sweep is presented as safe
because every target reported clean, and archive tags are said to make "every
deletion reversible".
**Cause:** `git status --porcelain` does not report **ignored** files, and
`.gitignore` is exactly where this repo puts the evidence a QA pass produces —
`artifacts/`, `test-results/`, `playwright-report/`. Measured here: 319 of 379
clean worktrees hold 58,069 ignored evidence files. Separately, `node_modules`
is a Windows **junction** in 173 worktrees (10 of them pointing into the live
integration tree, 7 into the `main` checkout), which is both why "carrying
`node_modules` — this is the disk" was wrong (a junction costs ~0 bytes; the
disk is `dist-*` copies at ~264 MB each) and a live risk if `--force` recurses
through a reparse point.
**Correction:** never remove a worktree without (i)
`git status --porcelain --ignored=matching -- artifacts docs/evidence
test-results playwright-report` plus a `find -type f` count, skipping and
reporting anything with hits; (ii) `cmd //c rmdir "<path>\node_modules"` first
to drop a junction without touching its target; (iii) a `git rev-parse
--git-common-dir` test — it returns the literal `.git` only in the MAIN working
tree — so the sweep can never be pointed at the repository itself. And say out
loud that archive tags cover branches, never directories.
**Verify:** the dry run prints a skip list rather than a clean removal list;
`git rev-parse --git-common-dir` in `atomic-acres-browser-arena` returns `.git`
while every linked worktree returns the absolute path, so the guard fires; and
`du -sk` on a junction `node_modules` returns `0`, confirming it is not disk.

---

## 8. Repair record (2026-09-02, 20:27–21:20 BST)

An independent skeptic reviewed `f1169a3e` and returned ACCEPT_WITH_FIXES: the
**findings** (§3.1–§3.6, S1–S7) survived every attempt to refute them, including
an attack on S1 using this report's own basename caveat; the **plan** did not.
Everything below was re-measured by this repair pass, not accepted on report.

| # | Issue | Severity | Disposition |
|---|---|---|---|
| B1 | Step 2 would `git worktree remove --force` the repository's **main** working tree (`atomic-acres-browser-arena`, on the deletable branch `agent/rig-weapon-hud-source-20260722`), which is also the directory the plan says to run from. Invisible in the dry run. | blocker | FIXED — blocking Step 0d; `safe_remove_worktree` refuses any tree whose `--git-common-dir` is `.git`; both Step 2 and Step 3 now go through it. Reproduced: the branch is in the 323, not the 73; Step 2's awk resolves that exact path. |
| B2 | `git branch -d` refuses on **15 of the 69** correctly-merged branches (it checks upstream-or-HEAD, never `$SHIP`), aborting the run under `set -euo pipefail`. | blocker | FIXED — `-D`, with the ancestry test named as the guard. Reproduced exactly: 1 via HEAD, 53 via upstream, 15 refuse; 10 of the 15 have no upstream, 5 have one that is behind. The skeptic's "all 15 have no upstream" is itself corrected here. |
| M3 | `--force` destroys git-ignored evidence that `git status --porcelain` cannot see; "every deletion is reversible" was false for worktrees. | major | FIXED — measured across **all 410** worktrees (the skeptic sampled 60): 319 clean trees, 58,069 ignored files. Guard added, §4 states plainly that tags do not cover directories, §7.2 records the gotcha. |
| M4 | Brief Job 1 (per-branch rows) and Job 2 (per-worktree rows) undelivered; the `scan.tsv` / `wtfull.tsv` cited as evidence did not exist. | major | FIXED — `docs/evidence/pass85/lane-s/branch-scan.tsv` (396 rows), `worktree-scan.tsv` (410 rows), `worktree-size-samples.tsv` (17 `du` measurements), all committed. Codex branches batched by pass number in §3.0. On-disk size now attempted properly and declared ESTIMATED with its measured cost. |
| M5 | Impossible measurement window (claimed 19:30–20:40 and "noted 20:45" for a commit that landed 20:04:40). | minor | FIXED — header and §5(e) corrected against `git log -1 --format=%cI`. |
| M6 | No "as of" anchor on the headline counts. | minor | FIXED — §1 now carries both scans side by side with the anchor and the reason for the drift. |
| M7 | `publish_pass84.py` guard cited by line number into a file regenerated every pass. | minor | FIXED — cited by symbol. |
| — | "`git worktree prune --dry-run -v` printed nothing for the 3 missing directories, so `prune` does NOT catch them." | refuted | **WITHDRAWN.** Not reproducible: 0 missing directories at re-scan, all three already unregistered with no remove step run. §4 and Step 3 restated; mechanism OPEN. |
| — | "4 orphan `gh-pages` lineage + 2 with no merge-base." | corrected | All **six** have no merge-base (VERIFIED per branch). |
| — | "370 carrying `node_modules` — retire, this is the disk." | corrected | 173 of 371 are junctions costing ~0 bytes; disk is `dist-*` copies. New hazard section in §4. |
| B3 | **Found by this repair, not by the skeptic: the plan script had never been executed and dies on its own first run**, twice, silently — `set -e` + `pipefail` on a false loop tail and on `find` over non-existent paths. | blocker | FIXED and demonstrated: §5 Step 3b. The whole of Steps 1–3 now runs to completion in DRY mode, exit 0, and its output is quoted. |
| B4 | Found by this repair: one worktree (`…\pass71-chopper-ci-257b-fix2`) has a **corrupt index** dated 3 weeks before this lane. `git status` errors to stderr, so a `$(…)` test reads it as **clean and deletable**, and the non-zero exit kills the run under `set -e`. | blocker | FIXED — both call sites now check git's exit status and treat an unreadable worktree as dirty. The index itself was NOT repaired (AGENTS.md forbids touching another task's worktree); recorded OPEN in §4. |
| B5 | Found by this repair: the natural fix for B3 (`… \| wc -l) \|\| n=0`) makes the ignored-evidence guard **fail open** — it ran clean and reported 0 skips where 270 are due. | blocker | FIXED — `\|\| true` moved inside the group; the re-run reports the 270. This is why the dry run had to be executed rather than read. |

Nothing in §3 changed. S1 — `ccfeec86`, an ancestor of the shipping head,
deleting four verifiers and the 2,125-line `src/feel/**` subsystem under a
message about an unrelated radar pin — was independently reproduced twice,
including a basename search across all 5,613 paths at `75a4e508`, and remains
the most important thing in this document. It needs no branch and no
consolidation go-ahead: it can start now.
