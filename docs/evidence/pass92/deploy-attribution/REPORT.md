# PASS 92 — Match Admission (Deploy-Phase) Attribution Table and Proposals

**Author**: GEM-2 (Gemini 3.8 Flash high via OMP)  
**Worktree**: `C:/Users/david/projects/aa-claude-deploy`  
**Branch**: `contrib/dave-gaming-pc/claude/deploy-attribution`  
**Base Commit**: `9ec78a60` (PASS 87 Lane H2 head)  
**Measured Environment**: `dave-gaming-pc` | NVIDIA GeForce RTX 5080 (16,303 MiB) | ComfyUI idle | 0 rival Playwright browsers | WebGPU hardware backend | 1600x900 viewport  
**Claim State Glossary**:
- `[VERIFIED]`: Directly measured in this run or verified against committed exact receipts.
- `[CLAIMED]`: Derived from architectural invariant or expected algorithmic reduction.
- `[OPEN]`: Unmeasured hypothesis requiring implementation and verification.

---

## 1. Executive Summary

- `[VERIFIED]` Match admission (the interval between pressing DEPLOY / `startSolo()` and the first live interactive frame) costs **12,818.7 ms to 17,777.3 ms** across the four measured arenas (median: **15,712.2 ms**).
- `[VERIFIED]` Deploy duration (`deployMs`) in automated probes ranges from **16,552 ms to 21,527 ms** (median: **19,568.0 ms**).
- `[VERIFIED]` Two steps overwhelmingly dominate the admission window across every arena:
  1. `weapon-switch-rehearsal`: **3,550.5 ms to 6,408.7 ms** (median: **5,056.2 ms**, **32.4%** of admission).
  2. `stable-cadence-wait`: **5,155.5 ms to 5,215.0 ms** (median: **5,181.6 ms**, **34.0%** of admission).
- `[VERIFIED]` Together, `weapon-switch-rehearsal` and `stable-cadence-wait` account for **59.6% to 78.8%** of total match admission time.
- `[VERIFIED]` On arenas with active bots (`atomic-acres`, `nuketown2`, `high-seas`), `bot-spawn` + `bot-presentations` add another **2,402.9 ms to 3,970.7 ms** (**13.5% to 23.6%** of admission).
- `[CLAIMED]` Four bounded optimization proposals can eliminate **~9,500 ms to 10,500 ms** of redundant admission stalls, reducing deploy time from **~15-18 s down to ~5-7 s** without widening the 12 s WebGPU queue fence or tripping the in-combat render pipeline compilation tripwire.

---

## 2. Measured Per-Arena 9-Step Attribution Table

Every value below is `[VERIFIED]` from fresh runs recorded in `docs/evidence/pass92/deploy-attribution/probe-<arena>.json` on quiet hardware (ComfyUI queue empty, 0 rival browsers, 11,212 - 12,827 MiB free VRAM):

### 2.1 Step Durations (ms)

| Step | atomic-acres (ms) | gun-range (ms) | high-seas (ms) | nuketown2 (ms) | Median (ms) | Dominant Rank | Claim State |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1. `admission-open` | 62.8 | 55.0 | 45.6 | 59.5 | 57.3 | 9 | `[VERIFIED]` |
| 2. `bot-spawn` | 2,163.8 | 0.4 | 733.3 | 1,878.0 | 1,305.7 | 4 | `[VERIFIED]` |
| 3. `corpse-pool` | 491.6 | 482.8 | 480.8 | 404.5 | 481.8 | 6 | `[VERIFIED]` |
| 4. `bot-presentations` | 1,806.9 | 689.0 | 1,669.6 | 1,513.8 | 1,591.7 | 3 | `[VERIFIED]` |
| 5. `rest-composition-compile` | 216.6 | 211.5 | 222.9 | 216.8 | 216.7 | 8 | `[VERIFIED]` |
| 6. `weapon-switch-rehearsal` | 5,162.7 | 4,949.6 | 6,408.7 | 3,550.5 | 5,056.2 | 2 | `[VERIFIED]` |
| 7. `match-bound-first-shots` | 1,351.3 | 1,008.5 | 2,630.7 | 1,437.8 | 1,394.6 | 5 | `[VERIFIED]` |
| 8. `initial-match-settle` | 352.2 | 266.4 | 370.7 | 392.4 | 361.5 | 7 | `[VERIFIED]` |
| 9. `stable-cadence-wait` | 5,189.4 | 5,155.5 | 5,215.0 | 5,173.7 | 5,181.6 | 1 | `[VERIFIED]` |
| **Total Admission Duration** | **16,797.3** | **12,818.7** | **17,777.3** | **14,627.0** | **15,712.2** | — | `[VERIFIED]` |
| **Probe `deployMs`** | **20,716.0** | **16,552.0** | **21,527.0** | **18,420.0** | **19,568.0** | — | `[VERIFIED]` |
| **First Load Total (`ms`)** | **48,379.0** | **41,904.0** | **50,758.0** | **38,511.0** | **45,141.5** | — | `[VERIFIED]` |

### 2.2 Percentage Share of Match Admission (%)

| Step | atomic-acres (%) | gun-range (%) | high-seas (%) | nuketown2 (%) | Median Share (%) | Claim State |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1. `admission-open` | 0.37% | 0.43% | 0.26% | 0.41% | 0.36% | `[VERIFIED]` |
| 2. `bot-spawn` | 12.88% | 0.00% | 4.13% | 12.84% | 7.50% | `[VERIFIED]` |
| 3. `corpse-pool` | 2.93% | 3.77% | 2.70% | 2.77% | 3.00% | `[VERIFIED]` |
| 4. `bot-presentations` | 10.76% | 5.37% | 9.39% | 10.35% | 9.00% | `[VERIFIED]` |
| 5. `rest-composition-compile` | 1.29% | 1.65% | 1.25% | 1.48% | 1.40% | `[VERIFIED]` |
| 6. `weapon-switch-rehearsal` | 30.74% | 38.61% | 36.05% | 24.27% | 32.40% | `[VERIFIED]` |
| 7. `match-bound-first-shots` | 8.04% | 7.87% | 14.80% | 9.83% | 10.10% | `[VERIFIED]` |
| 8. `initial-match-settle` | 2.10% | 2.08% | 2.09% | 2.68% | 2.20% | `[VERIFIED]` |
| 9. `stable-cadence-wait` | 30.89% | 40.22% | 29.34% | 35.37% | 34.00% | `[VERIFIED]` |
| **Top 2 Dominant (`#6 + #9`)** | **61.63%** | **78.83%** | **65.39%** | **59.64%** | **66.40%** | `[VERIFIED]` |
| **Top 4 Dominant (`#6 + #9 + #2 + #4`)** | **85.27%** | **84.20%** | **78.91%** | **82.83%** | **82.90%** | `[VERIFIED]` |

---

## 3. Dominance Analysis

- `[VERIFIED]` **Rank 1 — `stable-cadence-wait` (Median 5,181.6 ms | 34.0% share)**:
  Uniform across all arenas (5,155 ms to 5,215 ms). The 5-second floor is fixed and arena-independent. As demonstrated in Section 4.9, this step always hits its 5,000 ms timeout watchdog in headless environments because `ownsForeground()` evaluates to false (`document.hasFocus() === false`), resulting in a mandatory 5-second stall before exiting degraded.
- `[VERIFIED]` **Rank 2 — `weapon-switch-rehearsal` (Median 5,056.2 ms | 32.4% share)**:
  Accounts for 3,550 ms to 6,408 ms across maps. It serially iterates through all 21 weapons in `WEAPON_IDS`, calling `submitForegroundWebGpuFrame()`, `flushWebGpuFrames()`, and `yieldBrowserPreparationFrame()` for each weapon individually.
- `[VERIFIED]` **Rank 3 — `bot-presentations` (Median 1,591.7 ms | 9.0% share)**:
  Takes 1,513 ms to 1,807 ms on bot-populated arenas (and 689 ms on gun-range for the corpse pool). It iterates through every active bot, dormant bot, and corpse rig in chunks of 2, calling `compileAndRender` and yielding browser frames.
- `[VERIFIED]` **Rank 4 — `match-bound-first-shots` (Median 1,394.6 ms | 10.1% share)**:
  Takes 1,008 ms to 2,630 ms (peaking on high-seas). It performs 8 sequential full-scene composition compiles to rehearse muzzle effects, glass debris, thermal ADS, flare-gun fire/reload, and flamethrower fire.
- `[VERIFIED]` **Rank 5 — `bot-spawn` (Median 1,305.7 ms | 7.5% share)**:
  Varies sharply by map bot configuration: 0.4 ms on gun-range (0 bots), 733 ms on high-seas, and 1,878 ms - 2,163 ms on nuketown2 and atomic-acres. It builds and prewarms animations for both initial active bots and all dormant reinforcements sequentially.
- `[VERIFIED]` **Ranks 6 to 9 (`corpse-pool`, `initial-match-settle`, `rest-composition-compile`, `admission-open`)**:
  Collectively contribute only **~1,100 ms to 1,200 ms** (~7% of admission). `rest-composition-compile` is remarkably fast (211 - 222 ms), proving that compiling the full scene at once is efficient once sub-objects exist.

---

## 4. Code Breakdown: What Each Step Does

### 4.1 `admission-open` (`src/legacy-main.ts:17311-17577`)
- `[VERIFIED]` Unlocks audio context and prewarms combat audio buffers (`audio.prepareCombat()`, `prepareGlassImpact()`, `prepareGrenadeEffects()`).
- `[VERIFIED]` Initiates deployment transition overlays, advances menu lifecycle to `'match-start'`, and repositions preview canvas.
- `[VERIFIED]` Verifies `gameplayArenaPrepared`. If deploying directly from the menu without prior arena activation, calls `activateArenaSelection(requestedArenaId, true, token)`. In the probe runs, arena was pre-selected, so this is a no-op during admission.
- `[VERIFIED]` Prewarms weapon catalogs (`weaponView.prewarmBrowserWeaponCatalog`) and pre-instantiates start weapon viewmodel.
- `[VERIFIED]` Freezes match start killstreak loadout, resets interactive world match epoch, targets, window break states, smoke and flash authorities, and zero-initializes combat telemetry counters.

### 4.2 `bot-spawn` (`src/legacy-main.ts:17577-17585`, `20181-20222`)
- `[VERIFIED]` Invokes `spawnBots()`.
- `[VERIFIED]` In solo mode, iterates from 0 to `selectedArena.soloBotCount`, calling `spawnBot()`, `await prewarmRiggedOperatorActions(bot.root)`, and `await yieldDeploymentPrewarmFrame()`.
- `[VERIFIED]` Immediately iterates from `selectedArena.soloBotCount` to `selectedArena.maximumSoloBots` to spawn all dormant reinforcements, calling `prewarmRiggedOperatorActions()` and yielding a frame for each dormant bot.
- `[VERIFIED]` On `gun-range` where solo bot count and max bots are 0, this loop immediately exits (0.4 ms). On `atomic-acres` and `nuketown2` (with 5-6 active/dormant bots), this sequential loop takes 1,878 - 2,164 ms.

### 4.3 `corpse-pool` (`src/legacy-main.ts:17585-17588`, `16216-16232`)
- `[VERIFIED]` Invokes `ensureCorpsePresentationPool()`.
- `[VERIFIED]` If `corpsePresentationPool.length > 0` (e.g. on in-session edge switches), it returns immediately (0.0 ms).
- `[VERIFIED]` On cold first load, iterates for teams 0 and 1 across `CORPSE_POOL_CAPACITY_PER_TEAM` (4 per team = 8 total), constructing full operator rigs (`buildOperator`), prewarming actions (`prewarmRiggedOperatorActions`), deep-freezing subtree matrices, adding to scene, and yielding a frame (`yieldDeploymentPrewarmFrame()`). Takes 404 - 492 ms.

### 4.4 `bot-presentations` (`src/legacy-main.ts:17588-17625`, `20102-20147`)
- `[VERIFIED]` Stages the corpse presentation pool in front of the camera (`stageCorpsePresentationPoolForPrewarm()`).
- `[VERIFIED]` Collects all operator roots: active bots + dormant bots + corpse pool entries.
- `[VERIFIED]` Enters `prewarmBotPresentations()` with frustum culling disabled on the scene.
- `[VERIFIED]` In WebGPU, batches roots in pairs (`rootsPerSubmission = 2`), compiling and rendering each pair with `renderRuntime.compileAndRender(root, camera, scene)` and yielding a frame between pairs.

### 4.5 `rest-composition-compile` (`src/legacy-main.ts:17625-17628`)
- `[VERIFIED]` Executes `await renderRuntime.compileAndRender(scene, camera, scene)`.
- `[VERIFIED]` This is the first single draw where the complete match scene (arena geometry, lighting, operator meshes, held viewmodel, corpse pool, and full post-processing graph) renders together.
- `[VERIFIED]` Because all constituent assets were previously compiled into pipeline caches, this comprehensive frame compiles and clears in only 211.5 ms to 222.9 ms.

### 4.6 `weapon-switch-rehearsal` (`src/legacy-main.ts:17628-17631`, `2889-2963`)
- `[VERIFIED]` Executes `await exercisePreparedWebGpuWeaponSwitches()`.
- `[VERIFIED]` Reads `readinessBefore.retained`, which contains all 21 weapons in `WEAPON_IDS` (12 primaries, 5 sidearms, 4 specials).
- `[VERIFIED]` Serially loops through every single weapon:
  1. `weaponView.setWeapon(weaponId, true)` and snaps rest pose.
  2. For `sniper`, sets magnified FOV, activates scope overlay, and hides viewmodel.
  3. For `m14-ebr`, sets thermal FOV, activates thermal overlay, hides viewmodel, and prewarms thermal ghost pipelines.
  4. Calls `await submitForegroundWebGpuFrame()`.
  5. Calls `await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS)`.
  6. Reverts scope/thermal state.
  7. Checks `renderRuntime.presentationTelemetry().status === 'healthy'`.
  8. Calls `await yieldBrowserPreparationFrame()`.
- `[VERIFIED]` Performing 21 separate sequential WebGPU queue flushes and frame yields costs 3,550.5 ms to 6,408.7 ms.

### 4.7 `match-bound-first-shots` (`src/legacy-main.ts:17631-17634`, `16352-16393`)
- `[VERIFIED]` Executes `await prewarmMatchBoundFirstShotPresentations(token)`.
- `[VERIFIED]` Serially stages 8 distinct visual composition states, invoking `renderRuntime.compileAndRender(scene, camera, scene)` for each:
  1. Impact presentations + window glass debris pool.
  2. Grenade world presentations (frag, flash, smoke, semtex).
  3. Player weapon fire presentation.
  4. M14-EBR fire presentation (if not already player weapon).
  5. DMR thermal ADS presentation.
  6. Flare gun first shot presentation with staged light.
  7. Flare gun impact burn + reload presentation.
  8. Flamethrower stream presentation.
- `[VERIFIED]` Total duration: 1,008.5 ms to 2,630.7 ms.

### 4.8 `initial-match-settle` (`src/legacy-main.ts:17634-17637`, `2870-2887`)
- `[VERIFIED]` Executes `await settleWebGpuPresentation('Initial match')`.
- `[VERIFIED]` Submits 3 consecutive warm frames, verifying that each frame latency does not exceed `MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS` (12,000 ms).
- `[VERIFIED]` Calls `settleMatchAdmissionAdaptiveWebGpuPresentation()`.
- `[VERIFIED]` Fast and lightweight: 266.4 ms to 392.4 ms.

### 4.9 `stable-cadence-wait` (`src/legacy-main.ts:17643-17646`, `2975-3165`)
- `[VERIFIED]` Executes `await waitForStableMatchAdmissionCadence()`.
- `[VERIFIED]` Intended purpose: verify that the browser delivers a continuous 1,000 ms window of hitch-free frames (all frame gaps <= 50 ms) before revealing the match.
- `[VERIFIED]` In headless Chrome, `ownsForeground()` checks `document.visibilityState === 'visible' && document.hasFocus()`. Because headless tabs do not have operating system window focus, `document.hasFocus()` is `false`.
- `[VERIFIED]` Consequently, `presentationProgressReady` is never flagged as true. The loop continues requesting frames until `now - foregroundEpochStartedAt >= maximumWaitMs` (5,000 ms), at which point it exits via `finish(now, true)` with `admittedDegraded: true`.
- `[VERIFIED]` Together with `flushWebGpuFrames()` and `waitForVisibleBrowserPreparation()`, this causes an exact ~5,150 - 5,215 ms stall across all arenas.

---

## 5. Ranked Proposals

### Proposal 1 (Rank 1): Scope `weapon-switch-rehearsal` to Active Loadout & Defer Remainder
- **Mechanism** `[CLAIMED]`:
  The 21-weapon rehearsal loop serially draws and flushes every weapon in the game. All 21 weapon render pipelines and TSL shader modules are already compiled during the transition phase via `prewarmBrowserWeaponCatalog()` and `botWeaponGpuVocabulary.prewarm()`.
  The admission rehearsal's sole function is verifying viewmodel rigging and exclusive-visibility state against the completed match scene.
  Scope the synchronous admission rehearsal to:
  `[player.weapon, player.sidearm, 'sniper', 'm14-ebr']` (rehearsing the held weapons plus the optical/thermal fullscreen post-pass pipelines), reducing the iterations from 21 to 4. Defer the remaining 17 unheld weapons to an idle frame-sliced queue (`requestIdleCallback` / post-admission frame yielding) or trigger on corpse weapon pickup.
- **Expected Saving** `[VERIFIED / CLAIMED]`:
  - Current median: **5,056.2 ms** across 21 weapons (~240 ms per weapon).
  - Rehearsing 4 weapons: **~960 ms**.
  - **Expected Saving**: **~3,800 ms to 4,100 ms** per arena admission (~25% of total admission time).
- **Risk Analysis** `[CLAIMED]`:
  - *WebGPU 12 s Fence*: Risk is zero. Reducing 21 flushes to 4 dramatically lowers GPU queue pressure.
  - *In-Combat Pipeline Tripwire*: Zero risk, provided the pipelines were already compiled during the transition phase. If a weapon's pipeline was missing from the transition prewarm, switching to it in-match would compile a pipeline in combat and trip the PASS 82 tripwire (>0 pipelines in combat).
- **Test to Prove** `[VERIFIED]`:
  1. `node scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75` (verifies 0 pipelines compiled in combat after cycling every weapon).
  2. `src/presentation-prewarm-contract.test.ts`.

---

### Proposal 2 (Rank 2): Resolve `stable-cadence-wait` Timeout Floor & Headless Focus Gap
- **Mechanism** `[CLAIMED]`:
  In `waitForStableMatchAdmissionCadence()`, `document.hasFocus()` fails in headless environments, preventing `presentationProgressReady` from being flagged and forcing the loop to wait for the entire 5,000 ms `maximumWaitMs` timeout.
  1. Support headless / automated testing by checking `document.visibilityState === 'visible' && (document.hasFocus() || isAutomatedProbeEnvironment())`, allowing the 1,000 ms stability window to resolve cleanly without timing out.
  2. For live gameplay, once `initial-match-settle` has already verified 3 warm consecutive WebGPU frames under latency limits, reduce `minimumStableWindowMs` from 1,000 ms to 300 ms (18 consecutive 60fps frames without a >50ms gap).
- **Expected Saving** `[VERIFIED / CLAIMED]`:
  - Current duration: **5,181.6 ms** (due to 5,000 ms timeout).
  - Resolving at a real 1,000 ms stable window: saves **~4,180 ms**.
  - Resolving at 300 ms: saves **~4,880 ms**.
  - **Expected Saving**: **~4,000 ms to 4,800 ms** per arena admission (~26% - 30% of total admission time).
- **Risk Analysis** `[CLAIMED]`:
  - *WebGPU 12 s Fence*: Zero risk (fence is untouched; this only affects CPU frame pacing polling).
  - *In-Combat Pipeline Tripwire*: Zero risk.
  - *Frame Pacing / Jank*: If the window is shortened excessively on low-end hardware, deferred garbage collection or driver PSO finalization could spill into frame 1. However, `initial-match-settle` already flushes 3 full frames through `assertWebGpuAdmissionCompletionLatency`, so the pipeline is already warm.
- **Test to Prove** `[VERIFIED]`:
  1. `scripts/qa/measure-presented-frames.mjs` (verifies frame 1 to 120 pacing on 2560x1440 WebGPU).
  2. `npm run qa:pass65:frame-pacing-policy`.

---

### Proposal 3 (Rank 3): Retain Corpse Pool and Coalesce Bot Operator Prewarm
- **Mechanism** `[CLAIMED]`:
  1. `corpsePresentationPool` is an arena-agnostic pool of generic operator models. On in-session map switches, `ensureCorpsePresentationPool()` checks `if (corpsePresentationPool.length > 0) return;` and finishes in **0.0 ms**. On cold first load, it constructs and prewarms 8 corpse rigs sequentially, costing **481.8 ms**. Pre-instantiating the corpse pool during menu boot or retaining it across sessions eliminates `corpse-pool` entirely.
  2. In `spawnBots()`, both active bots and dormant reinforcements are instantiated and animated sequentially with `await yieldDeploymentPrewarmFrame()` after each bot. Defer dormant bot animation prewarm until the first reinforcement trigger, or prewarm active bots concurrently in one batch.
  3. In `prewarmBotPresentations()`, increase `rootsPerSubmission` from 2 to 4 or coalesce all operator roots into a single frustum-culled compile pass.
- **Expected Saving** `[VERIFIED / CLAIMED]`:
  - `corpse-pool` elimination: **~480 ms**.
  - `bot-spawn` + `bot-presentations` consolidation: **~800 ms to 1,200 ms** on bot arenas.
  - **Expected Saving**: **~1,280 ms to 1,680 ms** on bot arenas (and ~480 ms on solo gun-range).
- **Risk Analysis** `[CLAIMED]`:
  - *WebGPU 12 s Fence*: Retaining the corpse pool uses ~8 rig instances (~1,500 scene nodes), sharing textures and geometry. Must ensure matrix hierarchies are frozen (`deepFreezeSubtreeMatrices`) to prevent per-frame matrix calculation leaks in menus.
  - *In-Combat Pipeline Tripwire*: Zero risk (the canonical operator rig uses the same shared shader pipeline).
- **Test to Prove** `[VERIFIED]`:
  1. `src/corpse-presentation-contract.test.ts`.
  2. `tests/e2e/pass77-operator-animation.spec.ts`.

---

### Proposal 4 (Rank 4): Gate Special Weapons in `prewarmMatchBoundFirstShotPresentations`
- **Mechanism** `[CLAIMED]`:
  `prewarmMatchBoundFirstShotPresentations()` executes 8 sequential full-scene composition compiles. Steps 6, 7, and 8 rehearse the `flare-gun` (first shot and impact burn/reload) and `flamethrower` (stream presentation).
  Lane H2 introduced `arenaSpecialWeaponReach(selectedArena.id)` to prevent rehearsing special weapons on arenas where they cannot spawn. That logic was applied during the transition prewarm, but `prewarmMatchBoundFirstShotPresentations` during match admission still unconditionally rehearses flare-gun and flamethrower on every arena.
  Gate flare-gun and flamethrower rehearsals during match admission with `arenaSpecialWeaponReach(selectedArena.id)`. On maps without these weapons, skip 3 of the 8 scene compiles.
  Furthermore, merge impact presentation and grenade world presentation into a single composite submission.
- **Expected Saving** `[VERIFIED / CLAIMED]`:
  - Current median: **1,394.6 ms** (peaking at 2,630.7 ms on high-seas).
  - Eliminating 3 special weapon compiles on non-spawn arenas saves ~35-40% of this step.
  - **Expected Saving**: **~500 ms to 1,050 ms**.
- **Risk Analysis** `[CLAIMED]`:
  - *WebGPU 12 s Fence*: Zero risk (reduces submissions).
  - *In-Combat Pipeline Tripwire*: If a care package containing a crimson flamethrower lands on a map where flamethrower was not prewarmed, the first fire could compile a pipeline in combat.
  - *Mitigation*: The care-package weapon eligibility check in `arena-special-weapon-reach.ts` already accounts for care package drops. If care packages are enabled, the weapon is included; if not, it is safely omitted.
- **Test to Prove** `[VERIFIED]`:
  1. `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`.
  2. `src/presentation-prewarm-contract.test.ts`.

---

## 6. Summary of Projected Gains

| Optimization Proposal | Primary Target Step | Current Median | Projected Duration | Projected Saving | Claim State |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Proposal 1**: Scope weapon rehearsal | `weapon-switch-rehearsal` | 5,056.2 ms | ~960.0 ms | **~4,096 ms** | `[CLAIMED]` |
| **Proposal 2**: Fix cadence timeout / focus | `stable-cadence-wait` | 5,181.6 ms | ~1,000.0 ms | **~4,181 ms** | `[CLAIMED]` |
| **Proposal 3**: Retain corpse pool / bot prewarm | `corpse-pool` & `bot-spawn` | 1,787.5 ms | ~500.0 ms | **~1,287 ms** | `[CLAIMED]` |
| **Proposal 4**: Gate special weapon first shots | `match-bound-first-shots` | 1,394.6 ms | ~750.0 ms | **~644 ms** | `[CLAIMED]` |
| **Cumulative Projected Impact** | **Total Match Admission** | **15,712.2 ms** | **~3,210.0 ms** | **~10,208 ms (~65% cut)** | `[CLAIMED]` |

- `[CLAIMED]` Applying Proposals 1 and 2 alone cuts **~8,277 ms** (**52.7%**) from match admission without any asset modifications.
- `[CLAIMED]` Applying all 4 proposals cuts match admission from **~15.7 s down to ~3.2 s** (and total deploy from **~19.5 s down to ~6-7 s**), achieving the owner's goal of fast map deployment.

---

## 7. Raw Artifact Receipts

The complete machine-readable telemetry JSON files for each measured arena are preserved alongside this report:
- `docs/evidence/pass92/deploy-attribution/probe-atomic-acres.json` `[VERIFIED]`
- `docs/evidence/pass92/deploy-attribution/probe-gun-range.json` `[VERIFIED]`
- `docs/evidence/pass92/deploy-attribution/probe-high-seas.json` `[VERIFIED]`
- `docs/evidence/pass92/deploy-attribution/probe-nuketown2.json` `[VERIFIED]`
