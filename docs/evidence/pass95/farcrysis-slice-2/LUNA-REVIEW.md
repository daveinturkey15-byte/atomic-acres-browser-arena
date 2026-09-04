# Luna review — farcrysis-slice-2

## Review 1

Verdict: **DO-NOT-SHIP**

1. **BLOCKING — standing material rule is not met by the new code.** The three
   boulder-set tints are moved from three materials into cloned geometry color
   attributes (`src/farcrysis-art.ts`); they are not explicit uniform values.
   This is the central new consolidation and needs the repository-approved
   uniform implementation or a deliberate, recorded exception before ship.
2. **OPEN — required gates were not independently completed.** The exact
   `npx tsc --noEmit` and the expanded farcrysis Vitest gate both exceeded the
   bounded 120-second review window under machine contention. The shorter
   literal-glob command ran only 2 files/20 tests because Windows/Vitest did not
   expand the report's glob as intended; that is not proof for the 28-file set.
   The report's earlier green claims remain claims about its prior run.
3. **OPEN — visual/runtime evidence is absent.** The report marks boulder pixel
   identity and frame/admission evidence as unrun, and this review was expressly
   forbidden from browser, build, and GPU work. CPU construction reasoning and
   unchanged counts do not prove rendered parity.

### Checks and scope

- VERIFIED: worktree branch is
  `contrib/dave-gaming-pc/claude/farcrysis-slice-2`; HEAD at freeze was
  `b286912812b176b43770358e517dfb2b9898da18`; status was clean at the initial
  freeze.
- VERIFIED: lane base is `d9395579` (`farcrysis-rework`), matching the report.
- VERIFIED: diff from base is limited to `src/farcrysis-art.ts`,
  `src/farcrysis-material-vocabulary.test.ts`, and the lane report.
- VERIFIED: the changed test lowers the material ceiling from 168 to 166 and
  adds a `CEILING_HISTORY` entry; no threshold was raised and no assertion was
  weakened.
- VERIFIED: static diff shows no new pipeline and no legacy-main ceiling edit;
  build-time geometry construction has no per-frame allocation path.
- OPEN: complete typecheck, 28-file suite, budget/boot/legacy/collider gates,
  and coplanar script were not independently green in this review.

The material-rule finding and acceptance gaps are also recorded as TODOs in the
lane report. No product-source fix was made because the correct uniform design
needs an explicit repository-compatible choice rather than a speculative edit.

## Review 2

Revision reviewed: `a2a9d61f9f7bef563047d3c1829fc714f309e4a1`
Base: `origin/contrib/dave-gaming-pc/claude/farcrysis-rework` (`d9395579`)
Status: clean; current head includes the Muse fix/evidence commits.

Verdict: **SHIP-WITH-FIXES**

1. Finding 1 is fixed: the three boulder sets share one geometry and one
   white material, and their original tints are written with
   `InstancedMesh.setColorAt`/`instanceColor`; the added square-shore test pins
   no baked color attribute and shared material/geometry.
2. Finding 2 is fixed by independent gates: `npx --no-install tsc --noEmit
   --pretty false` exited 0; the explicitly named 7-file set passed 7 files /
   50 tests; and `find-coplanar-pairs.ts` reported 0 different-material
   findings with exit 0. The broader explicit 28-file attempt timed out, so it
   is not represented as green evidence.
3. Finding 3 remains open only as the required visual/runtime evidence: no
   exact-SHA WebGPU boulder parity or frame-cost capture was run under the
   review's no-browser/no-GPU boundary. The report records this as the
   remaining blocking TODO; no product-code defect is inferred.

Standing-rule checks: no assertion or threshold was weakened; the material
ceiling was reduced from 168 to 166 and preserved with history; no new
pipeline, roster, legacy-main change, per-frame allocation, or vendored HF-472
implementation was found. No product code was changed by Luna in Review 2.
