# Luna review — ssr-temporal-denoise

## Review 1

Revision reviewed: `c1dc6df7` plus the Luna fix below, based on `465ae6b7`.
Branch and worktree were clean before review. The review ran without npm
install/ci/rebuild, browser, build, or GPU work.

Verdict: **SHIP-WITH-FIXES**

Reasons:

1. **VERIFIED** — `npx tsc --noEmit` passed; the report files plus the
   required `src/legacy-main-size-ratchet.test.ts` and
   `src/collider-visual-parity-gate.test.ts` passed: 15 files, 163 tests.
   `find-coplanar-pairs.ts` reported `HOUSE-INTERIOR ...: 0`, `STREET ...: 0`,
   and `FINDINGS ...: 0`.
2. **VERIFIED** — the denoise stays fused into the SSR term with one history
   target, a settings-registry off switch, uniform-driven strength/gates,
   explicit arena invalidation, no new pipeline/stage, and no per-frame scene
   graph mutation. The Luna fix removes per-frame `sourceSize()` and result
   object allocation; the test now asserts refresh result identity reuse.
3. **OPEN** — the report correctly marks moving-enemy smear safety, velocity
   sign/ordering, and the 0.35 ms/cold-session claims as needing headed
   runtime evidence. Static CPU/reference gates do not prove rendered SSR
   behaviour, and this review cannot supply that evidence by instruction.

Luna fix:

- `src/rendering/ssr-temporal-denoise.ts` now uses scalar width/height locals
  and one closure-owned refresh result record in the pre-frame hot path.
- `src/rendering/ssr-temporal-denoise.test.ts` now checks that repeated
  refreshes return the same result record.

Claim-state notes: **VERIFIED** for the static gates and source-level history
contract; **DESIGNED/OPEN** for live reprojection, visual smearing, and timing.
