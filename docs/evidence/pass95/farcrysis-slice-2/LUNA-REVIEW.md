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
