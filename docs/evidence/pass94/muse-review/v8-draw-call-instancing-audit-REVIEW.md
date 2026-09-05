# Muse review - v8 draw-call / instancing audit (PASS 95 lane)

Scope: `contrib/dave-gaming-pc/claude/v8-draw-call-instancing-audit`, HEAD
`72163e2b` + `50a3548b` vs base `origin/contrib/dave-gaming-pc/claude/pass93-candidate @ 452d7aba`.
Report: `docs/evidence/pass95/draw-call-instancing-audit/REPORT.md` (329 lines).
Committed lane diff: 8 files, all `A` (add-only), 2148 insertions, 0 deletions.
Worktree at review time is DIRTY (3 modified + 4 untracked, §6) - not part of the verdict.

Claim-states: **[VERIFIED]** = I read the file/diff output quoted. **[MEASURED]** = number recomputed here.
**[OPEN]** = not proven. No builds, no browser, no `npm` run per lane rules; all checks are by reading
code/diff/JSON, plus one `python -c` recomputation over the committed JSON.

## Verdict: SHIP-WITH-FIXES

The two committed lane commits may enter candidate 9 **as HEAD commits only** (exclude all worktree dirt).
Three reasons:

1. **[VERIFIED] The ratchet is sound and honest.** All 10 budget rows recompute exactly to the published
   headroom rule (§1); the roster is registry-derived with the only exemption reasoned (§1); the committed
   diff touches zero runtime behaviour, so it cannot regress doors/windows/vehicles/breakables (§2); and no
   existing test or threshold was modified (§5). This is a measurement-plus-gate hand-over, exactly as advertised.
2. **[VERIFIED] The report marks its gaps OPEN instead of hiding them.** Browser `renderer.info` confirmation,
   per-frame CPU, oversize-texture-in-Node, both candidate fixes, and the heavy-gate lock-out are all stated as
   not-done with reasons (REPORT.md:301-329, 89-96, 292-299). Trustworthy evidence.
3. **Fixes required are small and bounded (§7):** the report references a `heavy-gates.md` that was never
   committed; the paused-agent worktree extension must be kept OUT of candidate 9 (or finished as its own lane);
   the raid2 residual footnote (0 vs 1) needs one reconciling line. None questions the committed numbers.

## 1. Budgets: derived, headroom justified, roster from registry - PASS

**[MEASURED]** Recomputed every row from `measured.json` submitted `drawCallsTypical` with
`budget = roundUp5(measured + max(10, ceil(measured * 0.15)))`:

- `nuketown2` 95 -> 110, `raid2` 10 -> 20, `atomic-acres` 53 -> 65, `skyline-terminal` 57 -> 70,
  `rustworks-1v1` 19 -> 30, `gun-range` 141 -> 165, `farcrysis` 182 -> 210, `high-seas` 42 -> 55,
  `test1` 24 -> 35, `test2` 30 -> 40. All 10 match `ARENA_DRAW_CALL_BUDGETS` exactly.
- `src/arena-draw-call-budget.ts:97-109` table matches REPORT.md:222-233 exactly.
- Headroom justification is published in-module (`src/arena-draw-call-budget.ts:24-33`: 10 draws = smallest real
  authoring addition; 15% = Nuke Town frame-loop ceiling; round to 5; gate fails on 3x regressions, not props)
  and executable: `withHeadroom` (`src/arena-draw-call-budget.ts:116-119`, HEAD name `drawCallBudgetFor`) is
  asserted per-row by `src/arena-draw-call-budget.test.ts:57-63`, plus a 60%-floor anti-slack assertion (:77-81).
- **[VERIFIED]** Roster: `ARENA_IDS` (`src/arena-identity.ts:8-25`) holds exactly 11 ids (the 10 budgeted +
  `map3`). `budgetedArenaIds()` (`src/arena-draw-call-budget.ts:127-129`) subtracts only `DRAW_CALL_BUDGET_EXEMPT`
  (`:88-90`: `map3`, lazy Rapier-wasm builder, reason >20 chars). The test asserts membership, a >= 10 floor,
  per-arena builder wiring, and exemption-reason length (`src/arena-draw-call-budget.test.ts:36-55`).
- `map3` exemption is reasoned, not an omission (REPORT.md:84-87). Agree.
- Minor: `baseline.json` vs `measured.json` are NOT byte-identical - `python` diff shows only `buildMs` timings
  plus one `farcrysis.authored.topRepeats[0].key` UUID churn (texture/material uuid, nondeterministic by
  construction). All 10 submitted-draw counts are identical. The report's "identical apart from build timings"
  (REPORT.md:250-255) is therefore accurate in substance; the uuid noise is expected and not a finding.

## 2. No dynamic breakage from the committed lane - PASS (by construction, with named checks)

**[VERIFIED]** The committed diff adds 8 files and modifies 0. `src/arena-draw-call-budget.ts` is imported by
nothing in the game (only the test and `scripts/qa/audit-arena-draw-calls.mts:37,257` import it); the three audit
scripts run in Node and never mount an arena. There is no mechanism by which HEAD could stop a door, window,
vehicle, or breakable moving. The report states this plainly (REPORT.md:28-32) instead of claiming a test it
never ran - correct.

Named checks (why the *underlying* batch/freeze the lane measures is safe for dynamics):

- `src/art-kit.ts:121-131` - `batchStaticMeshes` refuses `userData.dynamic` subtrees, `userData.targetRoot`,
  `pass73CollisionVisualOwner`, multi-material, and `InstancedMesh`. Gun-range scoring targets (15 roots, 82
  draws, REPORT.md:104-125) survive batching precisely because of the `targetRoot` opt-out - identity preserved.
- Breakables/doors carry `userData.dynamic = true`: skyline breakable panes (`src/additional-maps.ts:149-152`),
  gun-range secure door + fixtures (`src/additional-maps.ts:1975,2039`), blender-bound panes
  (`src/blender-environment.ts:218-219`), high-seas glass (`src/high-seas.ts:1226-1228`).
- The report's §3 (REPORT.md:152-182) explicitly refuses the tempting broad freeze ("every node without a
  `userData.dynamic` ancestor") with counter-evidence (gun-range test dummies, Nuke Town street-vehicle parts
  move without dynamic markers). That refusal is the load-bearing safety decision of this lane. Agree.
- Farcrysis instancing (101 draws / 92,630 instances) is correctly read as no-finding (REPORT.md:143-150);
  duplicate-material waste correctly read as not-a-draw-finding because the batcher keys by value
  (`src/art-kit.ts:73`, REPORT.md:184-196). Both corrections prevent a future lane wasting a day.

## 3. Disposal on arena exit - OPEN (not verified by this lane)

**[OPEN]** The lane ran no arena-exit/teardown check. Disposal machinery exists -
`disposeRetiredArena` (`src/legacy-main.ts:3539`), `disposeArenaPresentationRoot` (`:3574`), arena-switch
retirement loop (`:30973`) - but nothing in the 8-file diff exercises it, and the report never claims otherwise.
Batch outputs (`*-render-batches` groups) and the counted hidden sources are not shown disposed-or-retained here.
Correct handling: record as known gap for candidate 9, do not block on it (committed lane changes nothing about
teardown, so it cannot have regressed it).

## 4. Pipelines and cold-transition timing - construction fact + OPEN

- **[VERIFIED]** "0 new in-combat pipelines": true by file list - the diff contains no renderer, pipeline,
  material, or profile file (8 Adds: 1 report, 2 JSON, 3 scripts, 2 budget src). Quote: "The only `src/`
  additions are `arena-draw-call-budget.ts` ... imported by nothing in the game" (REPORT.md:28-32). Holds by
  construction; stated as such, not claimed as measured. Accept.
- **[OPEN]** "Cold addition under 300 ms": no evidence either way. The lane's own timing datum (new gate alone,
  41.3 s for all arenas in Node, REPORT.md:285) is a unit-test wall time, not a cold arena-transition
  measurement. Mark OPEN; needs the browser harness (suggested next lane, REPORT.md:327-329).

## 5. Test loosening - NONE in the committed lane

**[VERIFIED]** `git diff --name-status ...HEAD` shows 8 rows, all `A`. Zero modifications to existing tests,
thresholds, timeouts, or tolerances. The one sharp edge is handled honestly: the `cold-session-precompile-reach*`
glob matches no file at this head, and the report leaves the glob verbatim and says so (REPORT.md:287-290)
rather than quietly dropping it. Not loosening.

## 6. The worktree is NOT the lane (paused-agent extension, uncommitted, unverified)

At review time `git status` shows `M src/arena-draw-call-budget.ts`, `M src/arena-draw-call-budget.test.ts`,
`M src/static-matrix-freeze.ts`, plus untracked `scripts/qa/audit-arena-matrix-walk-cost.mts`,
`scripts/qa/tmp/probe-hidden.mts`, `scripts/qa/tmp/probe-residual.mts`,
`src/arena-static-matrix-freeze-reach.test.ts`. Per my instructions I stage/commit only my review file, so this
dirt stays untouched - but candidate 9 must understand what it is:

- `src/static-matrix-freeze.ts:74-129` (worktree) is a **runtime behaviour change**: freezes authored hidden
  `collisionProxy` / `supersededByVehicleForge` meshes and fixes the child-walk orphan bug (frozen batch sources
  no longer return early, so farcrysis `-moss`/`-vines` decals get visited). Base shape (`git show
  pass93-candidate:src/static-matrix-freeze.ts`) returned early after `freezeLeaf`. The extension's safety
  argument (hitscan reads bit-identical matrices via `legacy-main.ts:4597`; forced-pass identity test;
  dynamic-subtree refusal) lives only in the **uncommitted** `arena-static-matrix-freeze-reach.test.ts:80-149`.
  No verifier has run on it. It must NOT ride into candidate 9 silently - finish as its own lane or revert.
- Worktree `ARENA_BUILDERS` move (test-local `BUILDERS` -> exported from `arena-draw-call-budget.ts:68-80`) is a
  genuine improvement (one roster, shared by both gates and the walk-cost script) but equally uncommitted.
- Residual numbers therefore disagree across the seam: report (base freeze) says nuketown2 153 / farcrysis 352 /
  gun-range 127 / atomic-acres 94 (REPORT.md:166-172), while the uncommitted reach-test ceilings say nuketown2 32
  / farcrysis 166 / atomic-acres 59 / gun-range 157
  (`src/arena-static-matrix-freeze-reach.test.ts:37-49`). Both can be true (different freeze shapes), but the
  report's table must not be quoted against the new test's ceilings without a reconciling line.
- Footnote inconsistency: report residual table gives `raid2` 0/227 (REPORT.md:170-172) but the reach test records
  `raid2: { before: 1, measured: 1 }`. One line of reconciliation needed (all-nodes vs mesh-only counting?).

## 7. Findings (file:line, why, smallest fix)

1. `docs/evidence/pass95/draw-call-instancing-audit/REPORT.md:292-299` - references `heavy-gates.md` "beside this
   report", but `ls docs/evidence/pass95/draw-call-instancing-audit/` shows only REPORT.md, baseline.json,
   measured.json. The lock narrative (held from 07:07, 10-min wait, 23 min old < 35-min threshold, correctly not
   broken) is credible, but the promised file is missing. Fix: commit the `heavy-gates.md` stub recording exactly
   which heavy steps were skipped and why, or delete the two sentences pointing at it.
2. Worktree `src/static-matrix-freeze.ts:116-123` - runtime freeze reach change, uncommitted, no verifier run.
   Fix: keep OUT of candidate 9; either `git stash -u`/revert the 3 M + 4 ?? files into a follow-up lane, or finish
   that lane (commit + full gate run + browser confirmation) separately. Do not half-merge.
3. `src/arena-static-matrix-freeze-reach.test.ts:37-49` vs REPORT.md:170-172 - residual ceilings vs report table
   disagree (nuketown2 153->32, farcrysis 352->166, atomic-acres 94->59; raid2 0 vs 1). Fix: one reconciling
   paragraph in the follow-up lane stating the freeze shape each number was measured under.
4. Cold-transition timing - no file, no line: the "<300 ms" condition has zero measurement. Fix: browser-harness
   mode for `audit-arena-draw-calls.mts` (REPORT.md:327-329) reading `renderer.info.render.calls` at each
   `ARENA_REVIEW_STATIONS` entry; assert agreement with the Node walk and time the cold switch.
5. Disposal - no verification artifact. Fix (follow-up, not this lane): mount + retire one arena per id through
   `disposeRetiredArena`/`disposeArenaPresentationRoot` and assert geometry/material/footprint return to baseline.

## UNFINISHED (lane brief requirements vs delivered diff)

Delivered: 3 Node instruments + budget module + 12-assertion gate + measured/baseline JSON + claim-stated report.
Left unfinished (all admitted in REPORT.md:301-329 unless noted):

1. Browser `renderer.info.render.calls` confirmation at review stations - OPEN (port 4264 assigned, unused; 4-min
   rule + heavy lock consumed the window).
2. Per-frame CPU measurement beyond Nuke Town (`audit-nuketown2-frame-loop.mts` covers one arena only).
3. Oversize-texture (>1024) conclusiveness - OPEN in Node by construction (`art-kit.ts` bare Texture when
   `document` undefined; REPORT.md:89-96). Mipmap/filter flags are real.
4. gun-range target instancing (82 draws -> ~8): documented with evidence, deliberately not attempted (gameplay
   identity risk). Right first task for a follow-up lane; presentation-only parts (bullseye, plates, cat parts)
   separable from scoring roots.
5. Residual auto-matrix family classification (nuketown2 street vehicles, gun-range dummies, farcrysis palm
   collision visuals): deliberately not broadened. Correct refusal; needs one-family-at-a-time lanes with
   falsifiers.
6. Heavy gates: not run under the lock (correctly not broken); `heavy-gates.md` missing (§7.1).
7. `map3` measured coverage: exempt by design, needs the browser harness path.
8. Paused-agent extension (§6): freeze-reach fix, `ARENA_BUILDERS` refactor, walk-cost instrument, reach ratchet -
   all uncommitted, no verifier run. Either complete or shelve; candidate 9 takes HEAD only.

## Gate note

Report gates (REPORT.md:280-290: `tsc --noEmit` exit 0, coplanar-pairs identical to candidate 7, named set 4 files
/ 32 tests, new gate 12 tests) are quoted outputs I did not re-execute (lane forbids builds; no verifier has run -
that is why this review exists). The quotes are internally consistent (41.3 s Node gate, zero-delta table,
uuid-noise-only JSON diff recomputed here). Recommend the integrator re-run the named gate set once on the clean
HEAD before stamping candidate 9.
