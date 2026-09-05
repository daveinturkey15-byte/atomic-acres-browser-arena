# Luna review — nuketown2 yard-props graph sharing

Verdict: **SHIP-WITH-FIXES**

Reviewed revision: `d3293b15ccc940e67b1e1683f612bf2a936011ec`
Base: `3e2fd273f385713f8e645ba39bdf12d530b546f4`
Worktree: clean at review start and before this review write-back.

Three reasons:

1. **VERIFIED — mechanical gates pass.** `npx tsc --noEmit` passed. The exact
   report set plus the arena collider parity test passed: 8 files, 122 tests.
   The cold-session reach/prewarm contract follow-up also passed: 2 files, 26
   tests. `npx tsx scripts/qa/find-coplanar-pairs.ts` reported 0
   HOUSE-INTERIOR and 0 STREET findings; its 4 collision-only ramps are the
   documented excluded class.
2. **VERIFIED — graph and safety rules hold.** The branch lowers
   `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS` from 54 to 42; no test file changed,
   no ceiling was raised, and `legacy-main.ts`, the cold-session reach module,
   and the precompile/tripwire implementation are unchanged. Family colors are
   carried by `uniformSwatch`; the new deck/transparent-glass variants are
   reachable through the existing arena-scoped `nuketown2` cold-session path.
3. **OPEN — release evidence is incomplete.** No browser, GPU, or real cold boot
   was run by instruction. The report's unchanged roles/colours are source
   evidence, but the replacement of bespoke cooker/cabinet/glass/sand/floor
   detail needs a real review-camera comparison, and the 42-graph count needs a
   hardware fence measurement before a release-candidate claim.

No product-code fix was sufficiently certain within this constrained review.
The two OPEN items are recorded as TODOs in `REPORT.md`.
