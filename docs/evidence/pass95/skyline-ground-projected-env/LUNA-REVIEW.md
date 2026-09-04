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

## Review 2

Revision reviewed: `1f19100c0a5162f7e7a766c31a3b19f4d36ab56d`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (`3e2fd273`)
Status: clean; current head includes the Muse fix/evidence commits.

Verdict: **SHIP-WITH-FIXES**

1. Finding 1 is fixed by evidence: independent `npx --no-install tsc --noEmit
   --pretty false` exited 0; the named 12-file set plus
   `src/collider-visual-parity-gate.test.ts` passed 13 files / 176 tests; and
   the coplanar instrument reported 0 different-material findings with exit 0.
2. Finding 3 remains coherent on the current head: exactly one new pipeline is
   ledger-registered and in the cold-session reach, the settings off switch
   writes visibility/uniform state, per-arena values are uniform data, no test
   or threshold was weakened, legacy-main remains under its ceiling, and the
   implementation is an HF-472 reimplementation rather than vendored code.
3. Finding 2 is still open: no permitted WebGPU review-camera capture or
   representative frame-cost measurement exists. The lane report now anchors
   the capture TODO to `src/rendering/arenas/nuketown2.ts:100` and
   `src/rendering/arenas/skyline-terminal.ts:25`; complete that owner-side
   evidence before final shipment.

The prior gate blocker is therefore closed, while the visual/cost evidence
blocker is not. No product code was changed by Luna in Review 2.
