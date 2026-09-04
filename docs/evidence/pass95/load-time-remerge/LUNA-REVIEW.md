# Luna review — load-time remerge

Verdict: **SHIP-WITH-FIXES**

Reviewed revision before review fix: `b0d6b097913cd8777bcfccf04a6a28f7ac3f90de`
Base: `3e2fd273f385713f8e645ba39bdf12d530b546f4`
Review fix: fail-closed combat switch guard plus source-contract assertion.

Three reasons:

1. **VERIFIED — targeted gates pass after the fix.** `npx tsc --noEmit`
   passed. The exact report set passed: 6 files, 54 tests. The legacy file
   remains 37,318 lines against the unchanged 37,396 ceiling.
2. **VERIFIED — the combat compile path is removed from the candidate.** The
   deferred frame scheduler returns an empty slice for `combat`; safe windows
   call only `prepareBrowserWeapon`. The new active-combat fallback is now an
   immediate fail-closed return, so it cannot reach the injected WebGPU
   prewarmer's `renderRuntime.compileAndRender`. No threshold was weakened, no
   roster was added, and the 12 s fence/precompile authority is unchanged.
3. **OPEN — hardware/runtime proof remains outstanding.** No browser, GPU, build,
   or full suite was run by instruction. The exact 75-second in-combat tripwire,
   admission timing and switch probe must be recaptured on the post-fix head
   before a release-candidate claim; the report's inherited pre-existing count
   of 1 remains a separate lane issue.

The source-level tripwire violation found during review was fixed on this branch;
the remaining item is evidence recapture, not a request to relax a gate.
