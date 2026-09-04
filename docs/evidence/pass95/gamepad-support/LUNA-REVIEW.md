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

## Review 2

Verdict: **SHIP-WITH-FIXES**

1. **VERIFIED — the blocking poll allocation is fixed.** `reconcile()` now
   reuses one `pollEvent` object and `safeGamepads()` returns a shared empty
   list for null/throw fallback. The steady-state path otherwise reuses the
   sample pool, button buffers, action arrays, vectors, d-pad records, live
   frame, and callbacks; no `new`, array method, map, closure, or object literal
   remains on the connected stable-poll path.
2. **VERIFIED — the test mechanism now covers the missed object.**
   `src/input/gamepad/gamepad-pass95.test.ts` asserts the same frame, nested
   objects, callbacks, action arrays, sample array/pool, and `pollEvent` across
   1000 polls; the suite passed `Test Files 1 passed (1)` / `Tests 13 passed
   (13)`. The input-plus-ratchet suite passed 10 files/83 tests, and settings
   gates passed 4 files/42 tests.
3. **OPEN — typecheck and owner-visible evidence remain outstanding.**
   `npx tsc --noEmit` was attempted after the fix with a 180-second bound but
   produced no result before timeout; no TypeScript failure is inferred. Real
   Bluetooth/mobile behavior and headed Options/menu review remain unrun under
   the explicit no-browser/no-GPU constraint. These are recorded as Review 2
   TODOs in `REPORT.md`.

### Re-review scope

- VERIFIED: HEAD at review was `2e61d476876ac02a977f73c4b8950074ac629800`;
  branch status was clean before the fix; base was `3e2fd273`.
- VERIFIED: product changes are limited to the gamepad implementation/test
  fix; no threshold, fence, roster, pipeline, or legacy-main ceiling was
  weakened.
- VERIFIED: product source fix committed locally in this review with the
  required Codex trailer. Remote push remains to be confirmed.
