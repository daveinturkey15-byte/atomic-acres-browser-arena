# Lane M — HF-401 chopper pilot lag: verify OMP's fix with enemies in reveal range, and finish it

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-401.

Worktree: `C:\Users\david\projects\aa-claude-chopper`
Branch: `contrib/dave-gaming-pc/claude/hf401-chopper-pilot` (base 7a083e48)

## State
- The pilot lag is the handoff's "highest-value unfixed defect, reported
  repeatedly". Every earlier profiler instrumented the OBSERVING peer.
- OMP (2026-09-02 morning) landed on this base: lifetime `ghostBuildCount`
  / `ghostReleaseCount` counters in `src/thermal-ghost-presentation.ts`, a
  debug hook `__ATOMIC_ACRES_DEBUG__.sampleChopperPilotLoad()`, the
  instrument `scripts/qa/profile-chopper-pilot-thermal-cdp.mjs`, and the fix:
  `updateThermalGhosts` now calls `sync(targets, true, !thermalRevealWasActive)`
  (flush once per activation edge instead of every frame).
- OMP's own ledger row says: the before-run (`artifacts/qa/chopper-pilot/pilot-before.json`
  in `C:\Users\david\projects\aa-omp-pass84`) flushed 8 prewarm ghost records
  in one ride, BUT "staging did not light up active thermal layers, so the
  visual-cost half stays unproven and is NOT claimed fixed by mechanism
  alone". `activeModelLayers` was 0 during the ride: the selector chose no
  targets, so the ~550 unculled skinned ghost draws (cap 16 targets x up to
  62 layers, every ghost mesh `frustumCulled = false`) were never measured.
- Staging recipe that works: real hosted lobby via the DOM (`page.goto`
  first, wait `.map-card`, click `#host`, set `#lobby-bots` to max, click
  `#lobby-start`), then `api.earnSupport(15)`, `api.activateKillstreak('chopper')`,
  poll `api.toggleChopperGunnerControl()` until possessed. Bots must be ALIVE
  and within thermal reveal range/LOS during the ride; read
  `src/systems/thermal-reveal-selection.ts` for what the selector requires
  and steer the ride (or stage bots with `stageHostedBotAgainstRemote` /
  debug helpers) until `activeModelLayers` is non-zero and near the cap.
- `arenaVisualBudgetAudit()` returns 0 draw calls in headless; count ghost
  draws from the telemetry (`activeModelLayers`, `activeHaloLayers`) and
  frame time instead.
- BEFORE build: `C:\Users\david\projects\aa-omp-pass83` is a clean worktree
  at e046c130 (the code before OMP's fix); build it (read-only use, do not
  edit or commit there) to measure the old per-frame flush under identical
  staging. AFTER: your worktree.

## Job
1. Make the instrument reproduce the target-active state (assert
   `activeModelLayers > 0` during the ride or the run is invalid). Record
   per second: frame time p50/p95, presented-frame gaps, `ghostBuildCount`
   / `ghostReleaseCount` deltas, `activeModelLayers`, bot deaths.
2. Measure BEFORE (pass83 build) and AFTER (your build) under the same
   staging, ideally with the machine quiet (check CPU; if other lanes are
   building, wait a minute and retry; say in the report how loaded it was).
3. If the draw floor dominates after the churn fix (frame time still high
   with high `activeModelLayers`), implement culling for ghost layers:
   mirror the source mesh's frustum culling with conservative bounds
   (source bounds grown by a margin), so off-screen ghosts are not
   submitted; keep visible-flag mirroring intact. Add a unit test for the
   bounds/culling decision and a contract test pinning the activation-edge
   flush (`thermalRevealWasActive`) in `src/systems/thermal-reveal-selection.test.ts`
   style.
4. Pipeline tripwire (in-combat creations 0), `npx tsc --noEmit`, thermal
   focused tests (`src/thermal-ghost-presentation.test.ts`,
   `src/pass73-thermal-reveal-lifecycle.test.ts`, `src/railgun-presentation.test.ts`,
   `src/systems/thermal-reveal-selection.test.ts`), commits with explicit paths.

## Boundaries
- You own: `src/thermal-ghost-presentation.ts`, the thermal-reveal region of
  `src/legacy-main.ts` (`updateThermalGhosts`, `// HF-401:` marks, LF
  preserved), `scripts/qa/profile-chopper-pilot-thermal-cdp.mjs`, the debug
  sample hook, thermal tests.
- Do NOT touch: weapons/viewmodel (Lane B), arenas (A), lobby/netcode (G),
  spawns (D). Machine rules as every lane.

## Report
BEFORE/AFTER table with `activeModelLayers` proving the state was real,
churn counters, frame times, what dominated, the culling change if made,
tests, commits. Claim-state every line.
