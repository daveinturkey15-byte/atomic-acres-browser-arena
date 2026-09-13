# PASS 94 — HITL candidate 4 (integration)

Worktree `C:/Users/david/projects/aa-claude-hitl`, branch
`contrib/dave-gaming-pc/claude/pass93-candidate`. Preview served on
`http://127.0.0.1:4300` from `dist`.

## Merge order

1. `origin/contrib/dave-gaming-pc/claude/nuketown2-materials` — clean.
2. `origin/contrib/dave-gaming-pc/claude/nuketown2-lighting` — clean (auto-merged
   `src/legacy-main.ts`).
3. `origin/contrib/dave-gaming-pc/claude/nuketown2-techniques` — clean; all
   `src/nuketown2-arena.ts` hooks from every lane kept.
4. `origin/contrib/dave-gaming-pc/claude/animation-skins` — ONE conflict, in
   `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` (two additive owner sections).
   Both sides kept in full.
5. `origin/contrib/dave-gaming-pc/claude/load-time-verified` — **LEFT OUT.**
   Its own report (`docs/evidence/pass94/load-time/REPORT.md`) verdicts
   `admission-cadence-wait` **DO-NOT-SHIP** and measures the in-combat pipeline
   tripwire at **1, not 0**, on both builds. The exclusion rule fired on both
   counts. The forfeited win is real (-4.4 s / -2.9 s admission from
   `admission-rehearsal-scope`); that branch is worth its own follow-up merge
   without the cadence wait.
6. `nuketown2-bo2-accuracy` and `nuketown2-look` did not exist on `origin` at
   fetch time (15:53 and 17:0x). Not merged; a follow-up rebuild is needed if
   they land.

## Cross-lane defects found and fixed at cause

- **The glasshouse stood on a spawn.** `spawn-distribution` (already in the
  candidate) spreads EIGHT spawns per team; the techniques lane authored its
  yard props against SIX. `nuketown2-fidelity` failed with spawn `t0 (2, -34)`
  blocked. Root cause was worse than the placement: the lane's own clearance
  test compared the authored point and its 180-partner, `(x, z)` and `(-x, -z)`,
  but `pair()` builds `(-x, z)` and `(x, -z)`. The spawn table is 180-symmetric
  and NOT x-symmetric, so the test was measuring the x-mirror of the arena it
  was guarding. Corrected to the real instances (threshold unchanged at 3 m),
  and all three deep-yard bodies re-placed against it, the destructible-shed
  footprints (HF-407) and the pool: glasshouse `(-7.5, -34.2)`, garden pod
  `(11.2, -25.0)`, sand pit `(16.2, -28.4)`.
- **The appliance bank was unshootable.** Its name reaches no rule in
  `classifyBallisticMaterial`, so it landed as `reinforced`/`fallback` — two
  surfaces over nuketown2's ceiling of 0. Rated explicitly as
  `structural-metal` (penetrate), deliberately not `thin-metal`, which would
  perforate away the low cover the box exists to give.
- **Size ratchet** raised 37_365 -> 37_371, measured per lane: materials and
  techniques do not touch `legacy-main.ts`, lighting is +4/-4 (net 0),
  animation-skins is +6/-0. Arithmetic sum, not a fitted number.

## Muse SHIP-WITH-FIXES items applied

- techniques FINDING 1 — ground decal families staggered 1 mm
  (`GROUND_FAMILY_TIER`), so same-rect tyre+crack pairs stop sharing one depth.
  Still inside the deliberate 0.03 m fence window.
- techniques FINDING 2 — appliance-bank placement rationale recorded.
- skins F3 — the weapon socket now reads `lastPosture.sprint`, so lean and
  socket are one sprint.
- skins F5 — comment recording that node materials are skipped by
  `applyBotEmissiveBrightness` by design.
- skins F1/F2/F4 and techniques OPEN rows — corrections appended to both lane
  REPORTs (F4 retracts a stale VERIFIED bot-stance claim).

## Gates

```
npx tsc --noEmit                                    TSC_EXIT=0
find-coplanar-pairs  HOUSE-INTERIOR 0 · STREET 0 · FINDINGS 0 · FENCED 170 · SAME-MATERIAL 26
npx vitest run (named gate list + new lanes)        20 files / 321 tests passed
npx vitest run (vehicle-forge)                       1 file / 16 tests passed
npx vitest run (FULL)   Test Files 597 passed | 1 skipped (598) · Tests 5971 passed | 2 skipped (5973)
npm run build                                       built in 2.43s
qa:stock-boot                                       4 passed (2.9m)
pass74 arena boot smoke -g nuketown2                1 passed (1.5m)
```

## OPEN — blocking the candidate-4 visual evidence

0. **ROOT CAUSE, and it links OPEN 1 and OPEN 2.**
   `configurePlayableArenaVisuals` (`src/legacy-main.ts:4431`) awaits
   `flushWebGpuFrames()` FIRST and only then sets
   `activeArenaVisualDefinition = module.definition`. When the 12 s fence
   rejects, the function throws before the assignment: the gameplay root is
   already attached so the map still renders, but no visual definition is
   installed - which is exactly `setArenaReviewCamera returned false - authored
   camera missing` for all 17 stations, and exactly the boot smoke's
   `[Nuke Town Rebuild map selection failed] WebGPU queue completion exceeded
   12000 ms for submission 1 (fenced draws 568)`. One defect, two symptoms. The
   merged art has pushed nuketown2's cold first submission onto the fence.
   The fix belongs in the art/compile cost, NOT in the fence: the load-time
   lane's contract pins `await flushWebGpuFrames(12_000)` verbatim and the
   relief must never become a fence change.

1. **The 12-station review capture cannot run.**
   `node scripts/qa/capture-arena-viewpoints.mjs --arenas nuketown2` reports
   `0/17 shots` with `setArenaReviewCamera returned false - authored camera
   missing` for every station, twice, on a real hardware WebGPU device
   (`nvidia/blackwell`). The 17 cameras are present in
   `src/rendering/arenas/nuketown2.ts`; `activeArenaVisualDefinition` is null
   when the harness asks, i.e. the arena's visual-definition module is not
   installed at that point. The same head boots a clean visible solo match, so
   this is a capture-path defect, not a dead arena — but it means **candidate 4
   has NO reviewed captures and no one has looked at the merged art**. Log:
   `capture-FAILED.txt`.
2. **The 12 s WebGPU fence is close.** The first arena-boot-smoke attempt failed
   with `WebGPU queue completion exceeded 12000 ms for submission 1 (pending
   12001 ms, fenced draws 568)`; the retry passed. One stock-boot attempt failed
   the same way before two clean runs. The merged art has moved nuketown2's
   cold first submission onto the fence.
3. Carried from the lane reviews: hob<->house colour mapping needs a one-line
   swap plus a gate once siding settles; skin separability at gameplay range is
   an ASSUMPTION until a GPU re-capture is pixel-sampled.

4. **The shared install lost `@playwright/test` mid-session.**
   `C:/Users/david/projects/aa-shared-install/node_modules` (the junction every
   worktree here shares) has `playwright` and `playwright-core` but no
   `@playwright` scope directory as of ~16:50 local. `qa:stock-boot` and the
   pass74 boot smoke ran and passed BEFORE that, so those receipts stand, but
   no browser gate or capture can be re-run until it is restored. Not repaired
   here: this worktree must never run `npm install/ci/rebuild` against the
   shared install. Reported for the owner/orchestrator.

5. **`nuketown2-bo2-accuracy` and `nuketown2-look` landed AFTER this build.**
   Both were absent at the 15:53 fetch and present at the 16:38 fetch, after
   the candidate had been built, gated and pushed. They are NOT in candidate 4.
   A follow-up merge + rebuild is owed, and it should be sequenced after the
   fence work above, since more art is what moved the first submission onto the
   12 s bound in the first place.
