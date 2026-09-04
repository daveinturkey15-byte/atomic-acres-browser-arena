# Luna review — volume-fire-emitters

## Review 1

Revision reviewed: `462ec8dd` plus the Luna fix below, based on `465ae6b7`.
Branch and worktree were clean before review. The review ran without npm
install/ci/rebuild, browser, build, or GPU work.

Verdict: **SHIP-WITH-FIXES**

Reasons:

1. **VERIFIED** — `npx tsc --noEmit` passed; the report gate set plus
   `src/collider-visual-parity-gate.test.ts` passed: 13 files, 145 tests.
   `find-coplanar-pairs.ts` reported `HOUSE-INTERIOR ...: 0`, `STREET ...: 0`,
   and `FINDINGS ...: 0`.
2. **VERIFIED** — the fixed-capacity pool has one shared graph shape, five
   uniform-driven slots, a settings-registry `off` tier, no dynamic lights,
   no authored roster growth, and no per-frame scene-graph mutation. The
   canonical `ARENA_IDS` projection now supplies the authored-ID list; the
   previous hardcoded roster list/loop was removed by Luna.
3. **OPEN** — visual native-WebGPU capture and a real cold-session timing
   receipt are absent, as the report honestly records. The defended estimate
   and structural tests are useful but do not substitute for those runtime
   observations.

Luna fix:

- `src/volume-fire-presentation.ts` now derives
  `VOLUME_FIRE_AUTHORED_ARENAS` from `ARENA_IDS` through a keyed placement
  factory map, rather than maintaining a second arena roster.
- `src/volume-fire-presentation.test.ts` now checks the canonical `ARENA_IDS`
  catalog instead of enumerating the non-fire arenas.

Claim-state notes: **VERIFIED** for the static gates and source-level pool
contract; **DESIGNED/OPEN** for visual appearance and live cold-boot cost.
