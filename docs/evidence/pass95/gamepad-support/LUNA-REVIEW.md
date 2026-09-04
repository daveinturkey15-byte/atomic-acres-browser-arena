# Luna review — gamepad support

Verdict: DO-NOT-SHIP

Revision reviewed: `cea9c8f064520611458ae31241f72b6a5691bd43`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate`
Worktree: clean before review; no product source fix was applied.

Reasons:

1. VERIFIED — `npx tsc --noEmit` passed; the report-named gates passed: the
   dedicated gamepad suite was 1 file/12 tests, the input plus ratchet suite
   was 10 files/82 tests, and the four settings gates were 4 files/42 tests.
   The ratchet is 37240 <= 37396.
2. VERIFIED — standard mapping, radial deadzone/outer saturation, sensitivity,
   last-device arbitration, keyboard/mouse quietness with no connected pad,
   settings persistence, and d-pad/A/B menu wiring are covered by the source
   and passing tests. No test, threshold, fence, roster, material, or pipeline
   was weakened/added by the review.
3. BLOCKING — the advertised zero-allocation poll is false. The exact code
   allocates in `samplePads()` at lines 200-203 and in `poll()` at lines
   318-391, including arrays, objects, frame closures, and the returned frame;
   `reduceHotplug()` additionally creates a `Set` per poll. The retained-frame
   assertion relies on those allocations, so the core performance contract is
   unresolved. This is recorded as a blocking TODO in `REPORT.md`.

Bluetooth/mobile and headed visual checks remain unexecuted under the explicit
no-browser/no-GPU constraint.
