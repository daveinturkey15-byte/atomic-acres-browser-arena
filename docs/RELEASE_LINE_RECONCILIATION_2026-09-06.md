# Release-line reconciliation — 2026-09-06

Status: evidence record for the main-line reconciliation ordered by the owner (HF-536).
Every claim below is followed by the git command that produced it. Per
`docs/MULTI_AGENT_REPO_DISCIPLINE.md` §6, a provenance claim without its command is not
evidence, and this file exists so the reconciliation merge is auditable *before* it lands
rather than explained afterwards.

Measurement worktree: `C:/Users/david/projects/aa-recon-guard`, cut from exact `origin/main`.
Reference SHAs used throughout:

| Symbol | SHA | What it is |
|---|---|---|
| `M` | `506d6142ce09b8317279a8c705d2de25fa2ab84b` | `origin/main` tip, 2026-08-21 (Pass 72.1 era) |
| `H` | `1dc5813827c9bd3589863ff26dc6590e6fa9af83` | Pass 95 HITL shipping head, 2026-09-06 |
| `B` | `5075a52d80c6db69a97ed53acc2df5368728371a` | released Pass 64 base; `merge-base(H, M)` |
| `P84` | `75a4e508` | PASS 84 shipping head, 2026-09-02 |
| `PAGES` | `98e3627c3ebaf5fdc8aae036bb1966e0fe7bb3dd` | `origin/gh-pages` at the start of this work |

---

## 1. The ancestry was severed, not diverged: 15 root commits vs 8

`origin/main` has 8 parentless commits. The shipping line has 15.

```bash
git rev-list --max-parents=0 origin/main | wc -l     # 8
git rev-list --max-parents=0 1dc58138 | wc -l        # 15
```

Eight orphan roots on `main` are a pre-existing Pass 58–64-era pathology and are **not**
part of this incident. They are the legitimate historical set and are the seed of the new
`.github/ancestry-roots.json` allowlist:

```bash
git rev-list --max-parents=0 origin/main
```

```text
090f074d9bc075364cf3b0cdc8c122f111570994  2026-07-25  test: retain stable WebGPU frame pacing
c98c93672567889d63eee4d522e9201c2a057b9c  2026-07-24  refactor: enforce unused code cleanup
fcce40e92e5b71b874bcf95f087936bbd8f2424a  2026-07-23  fix(pass60): keep authored spawns clear of earth banks
70f5bd86a567f9a83bf791a6091f33a470ec5072  2026-07-23  docs: record Pass 59 production release
36ada19041f9d85c9a0dea9d00c73cbd7843cd27  2026-07-23  test: stabilize bounded Pass 59 browser gates
8dafe47678ed5b8ace11469fec4e4eee6481bdd4  2026-07-22  Keep established menu baseline unchanged
65a92b957444abe554a5e6faa78a95d36cf9b255  2026-07-22  Record Pass 58 and harden Pages receipt wait
17fb328864f8b49f6dae9d219e049a4432da5f78  2026-07-22  Merge pull request #15 … release-ci-identity-20260722
```

### 1.1 The seven new roots are full-tree snapshot imports from 2026-09-03..05

```bash
git rev-list --max-parents=0 1dc58138 | sort > /tmp/hr.txt
git rev-list --max-parents=0 origin/main | sort > /tmp/mr.txt
comm -23 /tmp/hr.txt /tmp/mr.txt
```

Each is parentless and rewrites the entire tree in one commit
(`git show --stat --format='%ad' --date=short <sha> | tail -1`):

| Root | Date | Subject | Files | Insertions |
|---|---|---|---|---|
| `93dacd33` | 2026-09-03 | qa(hf419): shadow-pass cut, a findability metric, and a Map 3 pipeline census | 5,811 | 1,827,433 |
| `f94d50dd` | 2026-09-03 | docs: HF-432 Nuke Town refinement + HF-433 crouch speed (Lane AU2 brief) | 6,400 | 2,047,564 |
| `567b4a31` | 2026-09-03 | fix(movement): HF-433 — crouching cancels sprint, and crouch keeps its own speed | 6,400 | 2,048,553 |
| `4132e7c0` | 2026-09-03 | docs(nuketown2-tiptop): cycle 3 critic A scores | 6,509 | 2,069,148 |
| `9bf869c5` | 2026-09-05 | fix(qa): soak triage — bound cold boot and preserve evidence | 6,970 | 2,597,510 |
| `23b140c1` | 2026-09-05 | build(hitl6): integrate multiplayer-first candidate6 evidence | 7,068 | 2,790,143 |
| `13addcba` | 2026-09-05 | fix(mp): muse review — harden audit row verdicts | 6,965 | 2,597,059 |

A commit with no parent and 6,000+ files is not a code change. It is a directory imported
as a fresh history — `git checkout --orphan`, or `git init` plus a copy. Each one discards
the ancestry of everything it replaces.

**This is the root cause of the incident.** Nothing executable in this repository refused
them, so they accumulated for three days without a single red gate.

### 1.2 `fc3cf948` grafted ancestry back only partially

On 2026-09-05 an attempt was made to restore the link:

```bash
git log -1 --format='%H %ad %s%nparents: %P' --date=iso fc3cf948
```

```text
fc3cf948abf60461b7cf987358dd872ecf8f769f  2026-09-05 03:10:22 +0100  fix(hitl6): restore Pass 64 ancestry
parents: 88d7ae68c58d98c41189db187947deaad9d47a91 5075a52d80c6db69a97ed53acc2df5368728371a
```

Its first parent `88d7ae68` heads a 22-commit orphan chain that shares **no** ancestor at
all with `origin/main`:

```bash
git merge-base 88d7ae68 origin/main    # exit 1, no output — no common ancestor
```

The second parent is the Pass 64 base `B`. That graft is the only reason
`merge-base(H, M)` resolves to anything at all:

```bash
git merge-base 1dc58138 origin/main    # 5075a52d80c6db69a97ed53acc2df5368728371a
```

So the shipping line's *apparent* relationship to `main` is an artefact of one hand-made
merge, not of continuous history. It restored a merge-base; it did not restore containment.

---

## 2. Proof this is regression, not divergence: PASS 84 already contained `origin/main`

Eleven days ago, reconciliation was a lossless fast-forward. `docs/BRANCH_CONSOLIDATION_AUDIT_2026-09-02.md`
§5 Step 4 said so at the time, and it is still mechanically true of that SHA:

```bash
git merge-base --is-ancestor origin/main 75a4e508   # exit 0 — YES
git rev-list --count 75a4e508..origin/main          # 0   (main has nothing P84 lacks)
git rev-list --count origin/main..75a4e508          # 506 (P84 is 506 ahead)
```

Between PASS 84 and PASS 95 the seven snapshot imports destroyed that:

```bash
git merge-base --is-ancestor 75a4e508 1dc58138       # exit 1 — NO
git merge-base 75a4e508 1dc58138                     # 5075a52d… (back to the Pass 64 base)
```

### 2.1 Today's tree is nevertheless a strict superset of the tree that contained main

```bash
git diff --name-status 75a4e508 1dc58138 | awk '{print substr($1,1,1)}' | sort | uniq -c
```

```text
   1856 A
    269 M
      2 R
```

**Zero deletions.** Content-wise, `H` is a clean continuation of `P84`: everything `P84`
had, `H` still has, plus 1,856 new paths. Since `P84` contained all of `origin/main`, the
shipping tree already carries main's Pass 65–73 work — it merely lost the *ancestry* record
of doing so.

### 2.2 The concrete breakage this causes today

`scripts/release/pipeline-guard.mjs` runs
`git merge-base --is-ancestor origin/main HEAD` in `contribute` mode. It now returns
false, so `npm run pipeline:preflight` throws
`Contribution does not contain current origin/main; reconcile and rerun checks`
for **every** lane cut from this line.

---

## 3. What is genuinely main-only: exactly 2 paths

Derived two independent ways.

**Way 1 — changed-path set subtraction from the merge base:**

```bash
git diff --name-only 5075a52d origin/main | sort -u > /tmp/base_main.txt   # 1817 paths
git diff --name-only 5075a52d 1dc58138    | sort -u > /tmp/base_head.txt   # 7159 paths
comm -23 /tmp/base_main.txt /tmp/base_head.txt
```

```text
src/atomic-support-authority.test.ts
src/atomic-support-authority.ts
```

1,815 paths changed on both sides; of those, 1,403 are already byte-identical between `H`
and `M`, and 412 still differ:

```bash
comm -12 /tmp/base_main.txt /tmp/base_head.txt > /tmp/both.txt      # 1815
git diff --name-only 1dc58138 origin/main | sort -u > /tmp/differ_now.txt
comm -23 /tmp/both.txt /tmp/differ_now.txt | wc -l                  # 1403 identical
comm -12 /tmp/both.txt /tmp/differ_now.txt | wc -l                  # 412 still differ
```

**Way 2 — the added-on-main side of the two-tip diff:**

```bash
git diff --name-status 1dc58138 origin/main | grep -E '^A'
```

```text
A  src/atomic-support-authority.test.ts
A  src/atomic-support-authority.ts
A  src/shadow-refresh.test.ts
A  src/shadow-refresh.ts
```

Whole-diff shape for context:

```bash
git diff --name-status 1dc58138 origin/main | awk '{print substr($1,1,1)}' | sort | uniq -c
#    4 A   5270 D    484 M
```

The 5,270 `D` entries are paths that exist on the shipping line and have never existed on
`main` — essentially all of Passes 74–95.

### 3.1 The four files, and why only two are a true divergence

| Path | Lines on main | Status |
|---|---|---|
| `src/atomic-support-authority.ts` | 475 | arm/support authority gate; added to main by `8c59907e` (2026-08-21) |
| `src/atomic-support-authority.test.ts` | 195 | its test |
| `src/shadow-refresh.ts` | 18 | present on main, deleted on the shipping line |
| `src/shadow-refresh.test.ts` | 25 | its test |

```bash
git log --oneline --diff-filter=A -1 origin/main -- src/atomic-support-authority.ts
# 8c59907e test: strengthen arm and support authority gates
git show origin/main:src/atomic-support-authority.ts | wc -l    # 475
```

`H` has no equivalent gate — the identifiers do not exist anywhere in its tree:

```bash
git grep -c 'procedural-support-authority-set-equality' 1dc58138   # no matches
git grep -c 'unboundBallisticSurfaces' 1dc58138                    # no matches
```

Neither of these is a *divergence*. Both file pairs were silently deleted **from the
shipping line** by `ccfeec86` "test(HF-378): pin enemy-radar gunfire reveal wiring"
(2026-08-23), a commit whose message names none of the deletions:

```bash
git show --stat ccfeec86 | tail -1
# 23 files changed, 52 insertions(+), 6259 deletions(-)
```

`main` simply predates that deletion. See
`docs/BRANCH_CONSOLIDATION_AUDIT_2026-09-02.md` §3.1.

### 3.2 The larger loss is not recoverable by this reconciliation

`ccfeec86` also destroyed 18 further files that are missing from **both** lines and that no
main/shipping reconciliation can restore — `src/feel/**`, `src/coplanar-surface-audit.*`,
`src/arena-grade-identity.*`, `src/invisible-blocker-audit.*`,
`src/ui/carpet-corridor-map-overlay.*`, `src/arena-deployment-briefing.*`,
`src/ui/deployment-briefing-surface.*`. Their source of truth is `ccfeec86^`, which still
exists in this object store. This is audit item **S1** and belongs in its own salvage lane
(PR-C), not in the reconciliation.

---

## 4. There is no main-only CI or release work to lose — the opposite is true

Taking the shipping line wholesale for `.github/**` and `scripts/release/**` is a
**strengthening**, measured:

```bash
git show 'origin/main:.github/workflows/release-production.yml' \
  | grep -nE '^name:|^permissions:|  contents:|deploy:ci'
```

```text
1:name: release-production
15:permissions:
18:  contents: write
127:  run: npm run deploy:ci -- -m "${{ inputs.release_pass }} from ${{ inputs.source_sha }}"
```

```bash
git show '1dc58138:.github/workflows/release-production.yml' \
  | grep -nE '^name:|^permissions:|  contents:'
```

```text
28:name: release-verification
44:permissions:
47:  contents: read
```

`main` still carries the pre-PASS-80 publisher: `contents: write` plus a live
`npm run deploy:ci` step and the retired six-channel topology. A single dispatch of it
would have deleted the pinned safe backup and resurrected six retired trees over the live
site (Lane F / PASS 84 finding). `H`'s copy is the hardened verification-only rewrite that
cannot publish.

Likewise:

```bash
git show 'origin/main:.github/workflows/verify.yml'          | grep -cE 'pass74|pass84'   # 0
git show '1dc58138:.github/workflows/verify.yml'             | grep -cE 'pass74|pass84'   # 2
git show 'origin/main:scripts/release/change-impact.mjs'     | grep -cE 'pass74|pass84'   # 0
git ls-tree origin/main scripts/orchestration/ | wc -l                                    # 0
git ls-tree 1dc58138   scripts/orchestration/ | wc -l                                     # 44
```

`main` has never seen the Pass 74 chopper-HUD wiring, the Pass 84 gamepad wiring, or the
entire `scripts/orchestration/` publisher family that has published every pass since 74.

`scripts/release/pipeline-guard.mjs` is byte-identical on both sides:

```bash
git diff --quiet origin/main 1dc58138 -- scripts/release/pipeline-guard.mjs   # exit 0
```

---

## 5. What the tree-identical merge deliberately DROPS

The reconciliation merge takes the shipping tree wholesale. With respect to `main` it is an
`-s ours` merge, and that shape is **permanently lossy by design**: after it lands, git will
never again try to bring main's side of these paths across. Recovering any of it later means
reading `origin/main`'s own history explicitly.

This section is the itemised statement of that loss, so the merge is never mistaken by a
future reader for an accidental revert.

### 5.1 Measured

Reproduced 2026-09-06 with
`C:/Users/david/AppData/Local/Temp/.../scratchpad/lineset.mjs` (per path: added lines from
`git diff -U0 5075a52d origin/main -- <path>` that do not appear as whole lines anywhere in
`git show 1dc58138:<path>`; blank lines excluded):

```text
484 paths differ between H and main (M entries)
  103 binary
  381 text
      237 text files carry >= 1 main-added line absent from H
      144 text files carry none
Total main-added lines absent from H:  4,302
```

### 5.2 By class

| Class | Files (M) | Files with dropped lines | Dropped lines |
|---|---|---|---|
| 1 — generated imagery + authored binaries (`docs/assets/`, `public/assets/`, `source-assets/`) | 25 text + 103 binary | 25 | 620 |
| 2 — workflows and release tooling (`.github/workflows/`, `scripts/release|qa|blender|assets/`) | 63 | 30 | 146 |
| 3 — top-level manifests and configuration | 17 | 7 | 114 |
| 4 — baselines and acceptance/QA contracts (`baselines/`, `acceptance/`, `tests/`, `src/**.test.ts`) | 150 | 100 | 1,007 |
| 5 — runtime source (`src/**`) | 126 | 75 | 2,415 |

Largest single contributors:

```text
869  src/legacy-main.ts
463  baselines/pass65-candidate/gameplay-contract.json
283  source-assets/blender/pass65-weapon-production.manifest.json
270  src/ui/pass66-overhaul.css
142  src/rendering/pass64-tsl-scene.ts
130  src/ui/tactical-ui.css
124  src/weapon-presentation.ts
109  src/audio.ts
```

### 5.3 Why every class is supersession rather than loss

- **Class 1** — the binaries are re-renders of the same Blender sources; sizes differ by
  roughly 1% (e.g. `carbine-contact-sheet.png` is 1,100,902 bytes on `H` vs 1,116,088 on
  `M`). `assets.manifest.json` records a sha256 per source and only the shipping line's
  manifest matches the shipping line's bytes, so mixing sides breaks
  `npm run verify:provenance`.
- **Class 2** — quantified in §4: main's copies are the older, weaker, in one case actively
  dangerous versions.
- **Class 3** — `assets.manifest.json`, `release-channels.json`, `package.json`,
  `playwright.config.ts`, `vite.config.ts`, `index.html` are mutually consistent with the
  published PASS 94 bytes. A per-hunk merge would produce a manifest matching neither tree.
- **Class 4** — main's `src/release-topology.test.ts`, `src/release-pipeline.test.ts` and
  `tests/e2e/release-channel-chooser.spec.ts` assert the retired PASS 73 /
  `pass72-retained` / `pass70-retained` / `pass69-retained` chooser topology that production
  no longer has. Taking them would fail the browser gates against the live two-channel
  config — the `release-line-reconciliation` skill's named "stale release-shell e2e specs"
  pitfall, avoided entirely by a whole-side resolution.
- **Class 5** — spot-checked, not assumed. `src/combat/weapon-catalog.ts` on `main` carries
  "Pass 72 balance correction: reduce the complete damage envelope by exactly 40%"
  (m14-ebr base 37.2); `H:src/combat/weapon-catalog.ts:227` explicitly retires it —
  *"Pass 72 'envelope -40%' correction is superseded by this instruction"* (HF-398, base
  52.1). `src/ui/*.css`, `src/rendering/pass64-tsl-scene.ts`, `src/audio.ts` and the
  `source-assets/blender/pass65-*` provenance manifests are Pass 65–73-era text that was
  later rewritten.

### 5.4 Declared uncertainty

The classification is a **strong sample, not an exhaustive proof**. The 4,302 lines were
classified by whole-line set membership plus targeted reading of the highest-count files;
they were not diffed hunk-by-hunk across all 237 files. A line that was reworded rather
than deleted counts as "dropped" here even though its intent survives, so 4,302 is an upper
bound on real loss.

The prior read-only analysis (`aa-day-2026-09-06/lanes/reconciliation/ANALYSIS.md`)
reported 104 binary / 336 text / 4,030 lines using a slightly different partition. The
figures in §5.1 are the ones reproducible from the script named there and should be
preferred; the difference is methodological (blank-line handling and how files with zero
main-side delta are bucketed), not a disagreement about what is being dropped.

### 5.5 What is DEFERRED rather than dropped

Three things are explicitly **not** resolved by this reconciliation and remain owed:

1. `src/atomic-support-authority.ts` + `.test.ts` (475 + 195 lines) — the only genuinely
   main-only work. Restored in **PR-C**, the S1 salvage lane, with its own acceptance
   manifest and its own approval.
2. `src/shadow-refresh.ts` + `.test.ts` (18 + 25 lines) — same lane.
3. The remaining `ccfeec86` (S1) set — 18 files, ~6,259 lines, absent from both lines,
   recoverable only from `ccfeec86^`. Needs a per-module restore-and-rewire /
   restore-as-gate-only / retire-with-a-note decision. Multi-hour work; not part of PR-B.

Separately OPEN and untouched here: `release-channels.json` still declares eight channels
while production carries two (2026-09-02 audit §5(e) item 4 — an owner/release-lane
decision), and local branch `main` in
`C:/Users/david/projects/atomic-acres-production-27e0858` stays stale at `249a7ee7` with
~1,670 uncommitted entries. This plan only moves `origin/main`, through the PR path.

---

## 6. Live PASS 94 is unaffected, and that is structural

Nothing in this reconciliation writes `gh-pages` or runs a publisher. The freeze reference,
read before the work started:

```bash
git ls-remote origin refs/heads/gh-pages
# 98e3627c3ebaf5fdc8aae036bb1966e0fe7bb3dd

git ls-tree origin/gh-pages channels/
# 040000 tree 7c58c6b0…  channels/pass93
# 040000 tree b2ce4529…  channels/pass94

git ls-tree -r origin/gh-pages channels/pass94 | wc -l    # 606
```

The HF-400 two-channel policy is satisfied (exactly the live pass and its pinned safe
backup). The runtime commit that produced those bytes, `10fa6141`, is already an ancestor
of `H`; `refs/heads/release/pass95` holds only two further commits and both touch nothing
outside `docs/evidence/pass95/publish2/**`.

Byte-exactness after the merge is therefore **structural, not a promise**: the merge tree is
byte-identical to `H`'s tree, and `H`'s tree is what built the live bytes.

---

## 7. Why a tree-identical ancestry-restoration merge, and not a textual merge

A textual merge between the two tips reproduces 385 conflicting paths:

```bash
git merge-tree --write-tree 1dc58138 origin/main    # exit 1, 385 conflicting paths
```

110 have a stage-1 entry (true modify/modify); 275 have none (add/add — files created
independently on both sides *because the September orphan roots removed the common
ancestor git needs to see them as the same file*).

None of those 385 is real work. They are a textual merge being attempted between a tree and
its own eleven-day-younger self across a severed history. Resolving them by hand would mean
385 chances to corrupt the tree that is currently live as PASS 94, in exchange for a tree we
already have byte-for-byte.

The merge instead restores ancestry with the shipping tree intact:

```bash
M=$(git commit-tree "$(git rev-parse H'^{tree}')" -p H' -p origin/main -F msg.txt)
```

Post-conditions asserted before any push:

```bash
git diff --quiet $M H'                              # empty tree delta
git merge-base --is-ancestor origin/main $M         # exit 0 — containment restored
git rev-list --max-parents=0 $M | wc -l             # 15 — no NEW root introduced
grep -rn '<<<<<<<' src scripts tests                # nothing (no textual merge occurred)
```

`origin/main` becomes an ancestor of the merge, so `main` advances by fast-forward (or a
trivial merge commit) through the PR path, and `pipeline-guard` stops throwing for every
lane cut from this line.

---

## 8. What stops this recurring

The 385 conflicts and the 21-pass drift were both silent. Nothing executable in the
repository refused a parentless 6,000-file import, and nothing refused a publish from a line
that did not contain `origin/main`. PR-A adds the two that would have caught this on
2026-09-03:

1. **`scripts/release/pipeline-guard.mjs` root-set assertion.** `git rev-list --max-parents=0 HEAD`
   must equal the checked-in allowlist `.github/ancestry-roots.json` (seeded with the 8
   roots in §1). `93dacd33` would have been refused the day it was created.
2. **`containsOriginMain` promoted to a hard failure** in every non-doctor mode, not only
   `contribute`.

plus the fail-closed `--phase reconciliation` mode in
`scripts/release/acceptance-gate.mjs`, which is what makes *this* merge legal without
weakening anything: it accepts only a two-parent merge whose tree is identical to its first
parent's and whose second parent is the PR base, and it asserts a tree identity that nothing
in this repository asserts today.

The contract changes are written into `AGENTS.md`,
`docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md` and `docs/MULTI_AGENT_REPO_DISCIPLINE.md` in the
same PR, so the prose and the executable agree.
