# Branch and worktree consolidation — salvage audit and retirement plan

Lane S of the PASS 85 sweep. Read-only audit; this file is the only thing the
lane wrote. Nothing was deleted, tagged, moved, pruned or fast-forwarded.

- **Shipping head measured against:** `75a4e508` (PASS 84, live 15:14 BST).
- **Measured:** 2026-09-02, 19:30–20:40 BST, from `C:\Users\david\projects\aa-gemini-audit`.
- **Owner instruction behind this:** 07:05 / 14:10 — "I want all of these
  branches/worktrees consolidated and merged", "yeah that sounds good, get 84
  live then do that".
- **Claim-states:** VERIFIED = this lane ran the command and read the output.
  CLAIMED = taken from another record without re-running. OPEN = unresolved.

---

## 1. Headline

| Fact | Value | State |
|---|---|---|
| Local branches | 395 | VERIFIED |
| Merged into `75a4e508` | 97 | VERIFIED |
| Not merged | 298 | VERIFIED |
| — of those, every commit patch-equivalent on the shipping line | 143 | VERIFIED |
| — active PASS 84/85 lane branches (2026-09-02) | 12 unmerged (+10 already merged) | VERIFIED |
| — Pass 71 candidate family | 82 | VERIFIED |
| — older, non-Pass-71, non-active | 55 | VERIFIED |
| — orphan `gh-pages` lineage | 4 | VERIFIED |
| — unrelated history (no merge-base) | 2 | VERIFIED |
| Registered worktrees | 412 | VERIFIED |
| — directory missing on disk | 3 | VERIFIED |
| — clean | 380 | VERIFIED |
| — dirty (uncommitted work) | 29 | VERIFIED |
| — carrying a `node_modules` tree | 370 | VERIFIED |
| — outside `C:\Users\david\projects` | 284 (272 under `Documents\Codex`) | VERIFIED |
| `.git` common dir size | 4.0 GB | VERIFIED |
| `origin/main` (`506d6142`) is a strict ancestor of `75a4e508` | 0 ahead, 506 behind | VERIFIED |
| Local `main` (`249a7ee7`) is a strict ancestor of `75a4e508` | yes | VERIFIED |
| Existing tags in the repo | 3 (`hitl-fallback-20260825-1440`, `…-1455`, `pass78-fallback`); 0 `archive/` | VERIFIED |

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
7. `git worktree list --porcelain`, then `git status --porcelain` and a
   `node_modules` stat per worktree (412 × ~0.15 s).

**Sampling declared.** Two things were sampled, not exhausted:

- The 82-branch Pass 71 family is one nested candidate lineage. Its
  branch-only file set was read in full for the maximal tip
  (`pass71-recovery-20260816`, 168 commits ahead) and its concepts checked
  against the shipping tree; the other 81 tips were classified from their
  file-set signature, not from per-hunk reading. Every one of them is
  archive-tagged before deletion, so the sampling costs nothing recoverable.
- On-disk worktree size: three worktrees were measured with `du -sh`
  (88 MB, 392 MB, 4.3 GB). A full `du` over 412 worktrees was not run — it
  would have consumed the lane's whole budget. Total reclaim is therefore
  **estimated, not measured** (§4).

---

## 3. Salvage — what is genuinely not on the shipping line

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

412 registered. Full table:
`git worktree list --porcelain` reproduces it; the per-worktree scan is
reproducible with the loop in §2.7.

| Class | Count | Action |
|---|---|---|
| Directory missing on disk | 3 | prune |
| Dirty (uncommitted changes) | 29 | **KEEP — reconcile first** |
| Clean, branch not an active lane | 363 | retire |
| Carrying `node_modules` | 370 | retire (this is the disk) |
| Under `C:\Users\david\Documents\Codex\**` (dead Codex sessions) | 272 | retire |
| Under `C:\Users\david\projects` | 128 | 21 are live lanes; rest retire |

**Missing directories (prune):** all three are detached, under
`C:\Users\david\AppData\Local\Temp\`:
`aa-merge-audit-w2d-w`, `aa-merge-audit-w2d-x`, `aa-merge-audit-w2d-y`.
Note `git worktree prune --dry-run -v` printed **nothing** for them (VERIFIED),
so `git worktree remove --force` by path is needed, not `prune`.

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

**Disk.** ESTIMATED, not measured. Sampled `du -sh`: 88 MB / 392 MB / 4.3 GB
for three worktrees; 370 carry `node_modules`. A realistic reclaim is
**150–400 GB** but the lane did not measure it. `.git` itself is 4.0 GB
VERIFIED and will not shrink from branch deletion alone (archive tags keep
every object reachable — by design).

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
  deletion is reversible with `git branch <name> archive/<name>`. Merged
  branches get no tag: their tips are already ancestors of the shipping head,
  so there is nothing to preserve.

### Step 0 — prerequisites (manual, blocking)

```bash
# 0a. Reconcile or accept the 1,670 uncommitted entries in the main checkout.
git -C C:/Users/david/projects/atomic-acres-production-27e0858 status
# 0b. Reconcile the two heavy dirty Codex worktrees (75 and 82 entries).
# 0c. Confirm with the owner: S2 (mobile rail), S3 (High Seas provenance) and
#     S4 (Azure Coil) are salvaged or explicitly abandoned. S1 is independent
#     of this plan and can proceed on its own lane at any time.
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
      [ -n "$(git -C "$p" status --porcelain)" ] && echo "${b#refs/heads/}"
    done
} | sort -u > "$PROTECT"
echo "protected branches: $(wc -l < "$PROTECT")"
```

Run it with no argument first. It prints every action it would take and
changes nothing.

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
    # a branch checked out anywhere must lose its worktree first
    git worktree list --porcelain |
      awk -v want="refs/heads/$b" '/^worktree /{p=substr($0,10)} $0=="branch "want{print p}' |
      while read -r p; do run "git worktree remove --force '$p'"; done
    if git merge-base --is-ancestor "$b" "$SHIP" 2>/dev/null; then
      run "git branch -d '$b'"          # merged: safe delete, refuses if wrong
    else
      git rev-parse -q --verify "refs/tags/archive/$b" >/dev/null \
        || { echo "REFUSING $b: no archive tag"; continue; }
      run "git branch -D '$b'"
    fi
  done
```

`git branch -d` for merged branches is deliberate: it refuses if the merge
assumption is wrong, which is the check, not an inconvenience.

Expected effect, VERIFIED by running the protect-list derivation read-only on
2026-09-02 20:35 (no deletions performed):

```
branches touched in the last 14 days   62
protect-list total                     72
deletable total                       323
  of which already merged (no tag)      69
  of which unmerged (archive-tagged)   254
```

So: **72 branches survive, 323 are retired, 254 `archive/*` tags are created.**
Those counts move with the protect-list at run time — that is the point of
deriving it rather than pasting it. The 14-day window is deliberately generous;
it keeps every PASS 79–85 branch, not just today's lanes. Narrow it to 3 days
only if the owner wants the Pass 79–83 names gone too, and only after they are
tagged.

### Step 3 — (b) remove worktrees

```bash
# stale registrations whose directory is gone (prune does NOT catch these)
git worktree list --porcelain |
  awk '/^worktree /{print substr($0,10)}' |
  while read -r p; do [ -d "$p" ] || run "git worktree remove --force '$p'"; done
run "git worktree prune -v"

# every clean worktree whose branch is now gone or is fully merged,
# excluding the canonical checkout and the two frozen trees
git worktree list --porcelain |
  awk '/^worktree /{p=substr($0,10); b="(detached)"} /^branch /{b=substr($0,8)} /^$/{if(p!=""){print p"\t"b; p=""}}' |
  while IFS=$'\t' read -r p b; do
    case "$p" in
      */atomic-acres-browser-arena|*/atomic-acres-gauntlet*|*/pass74-parked*) continue;;
    esac
    [ -d "$p" ] || continue
    [ -n "$(git -C "$p" status --porcelain)" ] && continue        # dirty: keep
    br=${b#refs/heads/}
    if [ "$br" = "(detached)" ] || ! git rev-parse -q --verify "refs/heads/$br" >/dev/null; then
      run "git worktree remove --force '$p'"
    fi
  done
```

Order matters: branches first (Step 2 removes the worktrees that block a
delete), then this sweep catches detached and now-branchless trees.

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

**In flight, noted 20:45 (VERIFIED, uncommitted in `aa-omp-pass84`):** the
orchestrator has added `scripts/orchestration/roll_pass.py`, which *generates*
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
   `publish_pass84.py` guards this at publish time (lines 507–547), so it is
   not live-broken — but the checked-in manifest disagreeing with production is
   the exact shape of the `gotcha-published-but-unselectable-pass` failure.
   OPEN: owner/release lane to decide whether the manifest is trimmed to two.

---

## 6. Could not classify

| Item | Why | State |
|---|---|---|
| 82 Pass 71 branches, per-hunk | Nested candidate lineage; only the maximal tip was read in full (§2). All are archive-tagged, so nothing is lost. | CLAIMED |
| Total disk reclaim | `du` over 412 worktrees exceeds the lane budget; three sampled (88 MB / 392 MB / 4.3 GB). | ESTIMATED |
| `desky/final-publish-45a6a37`, `desky/gh-pages-v68-live` | **No merge-base with the shipping line at all** — separate `gh-pages` publish lineages, 94 and 0 commits not on `origin/gh-pages`. Content not diffable against `src/`; archive-tag and delete. | VERIFIED unrelated / CLAIMED disposable |
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
