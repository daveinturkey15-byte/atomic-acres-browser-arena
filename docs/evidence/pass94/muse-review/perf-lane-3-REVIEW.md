# Perf lane 3 review (Muse Spark skeptic) — HF-491

Scope: `C:/Users/david/projects/aa-claude-perf`, branch
`contrib/dave-gaming-pc/claude/perf-hitl5`, base `0123a427`..HEAD.
Read-only review; no builds, no browsers, no test runs (per lane constraints).
AGENTS.md + multi-agent discipline observed: this worktree/branch only, one new
file, no `src/` edits.

## Lane under review

`git log --oneline 0123a427..HEAD` (8 commits):

- `285b28a9` skip dormant killstreak matrix walks
- `9dd2c270` bound viewmodel IK matrix updates
- `af1fce7d` share wear and vehicle material graphs
- `93844d52` make shared wear uniforms clone-safe
- `4e8cb9c8` finish shared material uniform binding
- `47605e1d` preserve shared glass offset tiers
- `927c3067` record lane 3 evidence
- `aa4979ed` record handoff gate state

Diff over `src/`: 18 files, +851/-466. Three mechanisms: (a) killstreak pool
ROOT walk-skip, (b) viewmodel IK path-only matrix updates, (c) shared uniform
material graphs (registry 8 / arena 40 pipelines, `pipes+0` in-combat).
Lane claims no absolute FPS/p50 win (ComfyUI-loaded GPU); evidence is
within-session CPU-only + census + graph counts + gates.

## Claim-states

(1) Failed test file: NONE FAILED. VERIFIED (lane's own REPORT gates):
"the exact requested Vitest glob command selected 5 files / 58 tests" passed,
and "the corrected expanded relevant set … passed 43 files / 430 tests with
1 skipped file / 2 skipped tests". So 43/44 passed, 1 file skipped, 0 failed.
INFERENCE on identity (suite not re-run here): the skipped file is
`src/killstreak-demo-published-media.test.ts`, the only lane-adjacent file
with exactly 2 skips, both intentional manifest gates, not regressions:

```ts
it.skip('retains exact capture provenance, unique bytes and source-drift protection', async () => {
it.skip('wires every menu definition to its verified real-bay video and poster fallback', () => {
```

`src/killstreak-demo-published-media.test.ts:14,21`. Environmental (needs
regenerated schemaVersion-1 manifest / explicit capture), unrelated to this
lane's `src/` diff (which touches no demo-media code). The pre-existing RED
`scripts/qa/browser-visibility-contract.test.mjs` (headed launcher vs
mute/off-screen contract, RED before this lane) is likewise untouched, not a
regression.

(2) Pool-root walk-skip activation: TRACEABLE and covered at every site
EXCEPT one — see F1. `freezeMatrixWorldWalk(this.root)` at
`src/killstreak-presentation.ts:3027`; explicit-refresh helper
`updateLiveWorldMatrices()` at `:3902`, called at end of `sync()` (`:3882`)
AFTER all mutations. Covered: entity checkout (`acquirePresentedEntity`
`:3685` deep-unfreezes + refreshes, end-of-sync refreshes children with
`(true, true)`); prewarm staging (`:3560` per-root refresh added by lane);
live activation roots (`:3616` refresh added); markers/sensors (mutated in
`syncPlacementMarkers`/`syncSensorContacts`, refreshed by `:3882` since both
run before it). NOT covered: `presentImpacts()` (`:3985`) — separate public
method, no refresh call — F1.

(3) IK path-only staleness: NO stale bone found for any same-frame CPU read.
All cross-mutation reads are either inside the updated target lists
(`src/weapon-presentation.ts:4681,4685,5052,5167,5176,5386,5400,5475,5536,5623`)
or self-refreshing (`getWorldPosition`/`getWorldQuaternion`,
`updateWorldMatrix(true, …)`, `resolveSocketWorld` which does
`socket.updateWorldMatrix(true, false)` first —
`src/character-presentation-contract.ts:57`). Muzzle/grip/support/reload
sockets, shoulder/elbow/wrist/finger/palmContact, sight, camera (stopAt is
inclusive in `src/viewmodel-matrix-paths.ts`) all covered; final render walk
is untouched so draw-time matrices are always fresh. Narrowed
`orientRiggedBone` refresh (`:5116`) is safe only under the current top-down
single-pass order — F2 (fragility, not a live bug; all callers `:5396-5399`
verified in order).

(4) Pipeline budget + wear equivalence: STRENGTHENING, with two honest
caveats — F3, F4. Ceiling `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS = 40`
(`src/nuketown2-materials/index.ts:121`), enforced by new
`src/nuketown2-pipeline-budget.test.ts:85`, lowered from measured 54.
Registry 8 graphs + arena 40 `customProgramCacheKey()` values + `pipes+0`
in-combat is genuine pipeline sharing (one node identity via
`SHARED_NODES`, `src/nuketown2-materials/material-uniforms.ts:81,149`;
per-material values via `userData.nuketown2Uniforms` loaded in
`onObjectUpdate`, `:72-74,148`). Wear visual equivalence for THIS lane's
sharing is NOT shown by a pose-locked pair (REPORT OPEN: requested pinned
pair not obtained; raw 25.80/255 full-frame diff not pose-locked). Grounded
instead in exact value preservation (same spec numbers through uniforms),
prior lane's LUT pair (4.2/255), and green material/fidelity gates.
Coach-glass offset tiers preserved by deliberately NOT sharing the
transparent path (`:47605e1d`).

(5) Per-frame allocation introduced: NONE. `ViewmodelMatrixPathUpdater`
reuses its node array + set and sorts in place
(`src/viewmodel-matrix-paths.ts`); `updateLiveWorldMatrices` is
allocation-free loops; uniform `onObjectUpdate` callbacks assign/copy
(`material-uniforms.ts:72-74`; vehicle paint `.copy()`) with no alloc.
`createNuketown2Uniforms` + doubled buildWear graph construction are
construction-time. Pre-existing per-frame allocs unchanged (not introduced):
`solveArms` clones/vectors, `presentImpacts` `new THREE.Vector3` per chopper
drop.

## Findings

F1 — `presentImpacts` activates visible roots under a skipped walk.
`src/killstreak-presentation.ts:4040` (shell), `:4058` (flash), `:4085`
(ember): `position`/`scale`/`quaternion` set + `visible = true` with no
`updateWorldMatrix`, and the pool root (`:3027`) no longer descends in the
renderer walk. If render lands between `presentImpacts()` and the next
`sync()`, the effect draws one stale frame at its pooled/rest transform
(previous lane: scene walk auto-fixed this). Why: only activation site
outside `sync()`'s `:3882` coverage. Smallest fix: call
`this.updateLiveWorldMatrices()` at the end of `presentImpacts()`.

F2 — `orientRiggedBone` narrowed refresh is order-fragile.
`src/weapon-presentation.ts:5116` (`(false, false, true)`; third arg inert):
correct today because `poseRiggedArmToWristTarget` updates paths at `:5386`,
mutates strictly top-down (`:5396` shoulder → `:5397` elbow → `:5399`
wrist, each self-recomposed), and re-updates at `:5400`. Any future
bottom-up reorder or repeated ancestor mutation reads stale parents
silently. Why: leading parent refresh was the safety. Smallest fix (only if
contact error ever drifts; not now): restore leading
`bone.updateWorldMatrix(true, false)` — two parent-chain walks per bone,
negligible against the saved 906-node subtree walks.

F3 — Unified wear graph evaluates both branches per fragment.
`src/nuketown2-materials/wear.ts:234-240`: every material now builds surface
AND backdrop subgraphs and `select()`s. TSL `select` lowers to WGSL
`select` (both sides evaluated): backdrop pixels (the 220 m scrub plain)
now pay 3 LUT fetches whose results are zeroed by `grainEnabled`/
`scuffEnabled`; same both-variants pattern in every family (concrete
variant, siding wainscot, timber orientation). Why: pipeline-count vs ALU
tradeoff, unmeasured this lane; consistent with the still-large within-
session wear-strip delta (final: JS 21.08 → 14.88, p50 25.5 → 19.4 when
stripped — the per-object CPU cost is NOT collapsed by sharing). Smallest
fix: none required now; if fragment cost matters, split backdrop back out
as a 9th graph (cheap: 3 sines, no LUT) and re-measure with the `wear` rung.

F4 — Budget ratchet has zero headroom (by design, note only).
`src/nuketown2-pipeline-budget.test.ts:85` pins `<= 40` with measured
exactly 40 (`index.ts:121`); registry `<= 8` test treats uniform values as
`<uniform>` by construction, so it proves shared topology, not shared
values — value-correctness rests on the `userData` binding (`:148`) +
`customProgramCacheKey()` census + `pipes+0`. Why note: any new family
variant must deliberately bump the ceiling. No fix; this is the ratchet
working as intended.

## Verdict: SHIP-WITH-FIXES

Three reasons: (a) both perf mechanisms are sound — walk-skip is refreshed
at every activation site except `presentImpacts` (F1, one-line fix), and the
IK updater is provably consistent since every cross-mutation read
self-refreshes or is path-listed; (b) the budget ceiling is a genuine
strengthening (54 → 40, new enforcing test, `pipes+0` in-combat) with the
remaining costs stated honestly as OPEN (no absolute FPS claim, no
pose-locked wear pair, wear-strip delta persists); (c) gates are green
(tsc, build, 5-file glob + 43-file expanded set, zero failures) and no
per-frame allocation was introduced. Apply F1, note F2/F3 for the next
lane, then ship.
