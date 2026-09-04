# Luna review — skyline-ground-projected-env

## Review 1

Verdict: **DO-NOT-SHIP**

1. **OPEN — required gates are not independently green.** The branch is clean
   at `96ac213bed18ee7bd3cb0be3a8eafd71cd2f768d`, but `npx tsc --noEmit`
   exceeded the 120-second review window while another process in this worktree
   was running `npm ci`; the Vitest and coplanar gates therefore were not
   completed by this reviewer. The report's prior claims remain claims about
   an earlier run, not this review's proof.
2. **OPEN — player-visible proof is absent.** The lane report explicitly marks
   the horizon cameras and frame-cost measurement as needing capture. This
   review was constrained to no browser, build, or GPU work, so visual quality,
   composition behind aerial perspective, and representative cost remain
   unverified.
3. **VERIFIED — static contract is coherent but insufficient for shipment.**
   The diff from base `3e2fd273` adds one ledger-registered pipeline, routes
   per-arena radius/height through uniforms, retains the settings off switch,
   and does not lower a test, threshold, or legacy-main ceiling. The installed
   r185 `GroundedSkybox.js` was read for comparison; the branch is a distinct
   equirectangular implementation and does not vendor it.

### Checks and scope

- VERIFIED: worktree status was clean at review start; branch is
  `contrib/dave-gaming-pc/claude/skyline-ground-projected-env`.
- VERIFIED: lane base is `origin/contrib/dave-gaming-pc/claude/pass93-candidate`
  at the report's `3e2fd273`.
- OPEN: `npx tsc --noEmit` timed out at 120 seconds under concurrent install
  activity; no product failure is inferred from that timeout.
- OPEN: named Vitest and coplanar gates were not run after the timeout.
- OPEN: no browser/GPU/rendered evidence by explicit review constraint.

No product-source fix was made; the larger acceptance gaps are recorded in the
lane report's Luna review TODOs.
