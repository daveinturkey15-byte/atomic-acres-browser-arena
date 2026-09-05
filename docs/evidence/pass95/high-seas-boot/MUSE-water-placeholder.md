# Muse diagnosis: high-seas arena-boot stall on candidate 8 (water-placeholder angle)

- Candidate 8: `32d8dcb0` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate`). Candidate 7: `452d7aba`. All `file:line` below is candidate 8 unless noted.
- Symptom (as briefed): arena boot smoke for `high-seas` times out deterministically (120 s, 0 console errors, app stays on deployment menu). Candidate 7 and PASS 93 passed 13/13.
- Sentinel the smoke waits on: `snapshot.matchPhase === 'active' && snapshot.gameStarted === true` — `scripts/qa/verify-arena-boot-cdp.mjs:118-119` (per-arena budget `PER_ARENA_MS` = 120000 at `:35`); spec resolves `'active'` vs `` `deploy-failed` `` (status matching `/deployment preparation failed|renderer blocked/i`) vs 120 s timeout at `tests/e2e/pass74-arena-boot-smoke.spec.ts:152-158`.
- Observed signature = the **timeout** branch with **no** `deploy-failed` text and **zero** console errors. That means `selectArena('high-seas')` never resolved AND never threw: `performArenaSelection` is still pending inside some await (or a sync block), with `bootstrapStage` stuck. Every fence/compile/readiness failure in that function throws (`console.error('[<Arena> map selection failed]')` + rollback + `deployment preparation failed` status), so a fence trip would have produced errors + the `deploy-failed` branch — not this symptom.

## Net cold-path-2 delta on candidate 8 (what actually survived)

The cold-path-2 merge (`87c3dd71`, `@ 30f92d2a`) contained placeholder + batch hoist + async precompile + menu env prewarm, but most of it was reverted before candidate 8: Nuke precompile reverted (`7ae131c9`), Nuke material modes reverted (`79a0e6b0` over `d3585665`), menu IBL/sky gating reverted (`bd7fabe2`; candidate 8 `bootstrapMenuPreview` at `src/legacy-main.ts:37367` is the old ungated form, `arenaSelectionReady = true` immediately, no `menuArenaEnvironmentPrewarmPromise` remains). Net surviving delta vs candidate 7 in the boot path: **(a)** placeholder `BufferGeometry` → `PlaneGeometry(1,1)` (`src/rendering/pass64-tsl-scene.ts:910`), **(b)** hoisted `batchSelectedArenaPresentation()` before visual-definition (`src/legacy-main.ts:30035`).

## Eliminations (read, not guessed)

- **E1 [READ]: the placeholder branch is not taken for high-seas.** `sharedWaterBodyForArena('high-seas')` returns the registered `HIGH_SEAS_WATER` shared-ocean body (`src/water/water-authoring.ts:187-196`; pinned by `src/water/water-authoring.test.ts:20-21`), so `makeWater` (`pass64-tsl-scene.ts:898-920`) takes the real-water return (`:917+`), never the placeholder return (`:915`). The `PlaneGeometry` change cannot touch high-seas' water mesh.
- **E2 [READ]: the static batch cannot touch ANY TSL water mesh.** Initial build parents water into a scene-level `Pass 64 WebGPU TSL presentation systems` group (`pass64-tsl-scene.ts:1274-1289`, `scene.add(root)` at `:1289`); the apply-definition swap splices in place there (`:756-761`). `batchSelectedArenaPresentation` only ever batches `arena.root` (+ atomic-acres art/life roots) (`legacy-main.ts:36966-36989`). disjoint trees — the hoist cannot merge, hide, or freeze high-seas' ocean. (Batch filter also skips invisible nodes, `src/art-kit.ts` traverse guard.)
- **E3 [READ]: the async cold precompile does not run for high-seas on candidate 8.** `MEASURED_COLD_SESSION_FENCE_LOSERS` is `['farcrysis']` only (`src/rendering/cold-session-precompile-reach.ts:87`; the `nuketown2` add was reverted). High-seas compiles its ocean vocabulary inside the fenced warm frame like candidate 7 did.
- **E4 [READ]: narrowed search.** `high-seas` is an eager arena (`legacy-main.ts:3439`, `eagerArena(buildHighSeas)`) so the `arena-factory-load` await is skipped; `ensureSelectedQualityPresentation('high-seas')` hits no branch (only atomic-acres/rustworks/gun-range load, `:5156-5165`); on a cold smoke boot every `prewarmArenaBoundGameplayPresentations` group resolves immediately via `coldArenaOperation(!gameplayArenaPrepared, …)` (`:37235`, flare/flame `:37252/:37260`); `bootstrapMenuPreview` is ungated (`:37367`).

## Ranked suspects (max 5)

### S1 [GUESS, top]: `waitForPendingArtTextures()` pends forever — the only timeout-less, error-less await in the transition
- File:line: `src/art-kit.ts:373-379` (`while (pendingTextureLoads.size > 0) await Promise.all(…)` — no timeout; throws only on recorded *failures*, pends silently if a load never settles). Callsite: `src/legacy-main.ts:30161` (`art-texture-settle` phase, after `material-tuning`).
- Exact await/branch that would stall ONLY high-seas: this await resolving depends on exactly which `texture()` loader promises the admitted arena pulled. High-seas-only pulls exist: `containedWaterMaterial` → `generateMaterialTextureSet('water', …)` (`src/high-seas.ts:1100-1116`) feeding the hot-tub / stern-pool contained waters (`:2391-2457`, `waterScope: 'contained-feature-only'`, pinned by `src/high-seas.test.ts:189-190`). If any high-seas-reachable loader promise neither resolves nor rejects on candidate 8, the transition sits at `art-texture-settle` forever: 0 console errors, deployment menu stuck, smoke timeout — exactly the observed signature.
- Honesty: the candidate-8-only link is NOT established from reads (texture/loader code is unchanged c7→c8; loader `onError` resolves, so a 404 would throw, not pend). Needs the smoke receipt: `diagnostics.bootstrapStage` (`verify-arena-boot-cdp.mjs:124-129`) should read the stage mapped below; if it is `waiting-for-authored-textures`/`art-texture-settle`, S1 is confirmed.
- Smallest fix: bound it so a stall becomes a named error the spec already surfaces on the `deploy-failed` branch:
  ```ts
  // src/art-kit.ts — waitForPendingArtTextures()
  export async function waitForPendingArtTextures(arenaId = '', timeoutMs = 30_000): Promise<void> {
    const startedAt = Date.now();
    while (pendingTextureLoads.size > 0) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Authored texture settle exceeded ${timeoutMs} ms for ${arenaId}: ${pendingTextureLoads.size} pending`);
      }
      await Promise.race([
        Promise.all([...pendingTextureLoads]),
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
    }
    …existing failure check unchanged…
  }
  ```
  plus pass `selectedArena.id` at the `:30161` call. Zero behavior change when nothing stalls; converts a silent hang into `deployment preparation failed` text instead of a 120 s mystery.

### S2 [READ code / GUESS causation]: early-batch hoist hides high-seas authored sources before visual-definition; late call is a proved no-op
- File:line: early `profileArenaTransition('presentation-batching'); if (selectedArena.id !== 'gun-range') batchSelectedArenaPresentation();` at `src/legacy-main.ts:30035` (before `visual-definition` at `:30043`); idempotence flag `if (root.userData.pass65StaticBatchReady === true) return;` at `:36960-36963`, so the post-weapon-prewarm call at `:30166` is a no-op and `freezeStaticArenaMatrices` at `:30167` freezes that state.
- Exact state change for high-seas: hundreds of authored meshes (hull, rails, contained tub/pool waters) are merged into `<root>-render-batches` and hidden (`source.visible = false`, `src/art-kit.ts` batch tail) ~15 phases earlier than candidate 7. High-seas-conditional downstream readers of those sources: none found in production (contained-water meshes have no non-test readers; TSL water is scene-parented per E2; `waterSystem.configure` at `src/water-system.ts:130` is synchronous CPU-authority only).
- Honesty: the batcher is fully synchronous — it **cannot pend** the transition itself. Its plausible harms (changed warm/coverage submission contents, frozen contained-water matrices) predict fence/readiness *throws*, i.e. the `deploy-failed` signature, not this timeout. Kept at #2 only because it is the largest surviving behavioral delta on the assigned angle.
- Smallest fix (if S1 is eliminated): revert the three hoisted lines at `:30035` (restore single post-prewarm batch), or — less invasive — delete `arena.root.userData.pass65StaticBatchReady` immediately before `:30166` so late-attaching children are considered again. Do NOT touch the placeholder: it fixed the `AttributeNode` fatal.

### S3 [READ code, predicts the OPPOSITE signature — kept to prevent misdiagnosis]: warm/coverage fence on the un-precompiled high-seas ocean
- File:line: warm `requestStaticShadowRefresh(true); await submitForegroundWebGpuFrame(true); await flushWebGpuFrames(12_000);` (`:30147`); coverage `await flushWebGpuFrames(12_000)` after `precompileExactScenePass` inside `withDetachedRoots` (`:30199+`); precompile gate `arenaNeedsColdSessionPrecompile` false for high-seas (`cold-session-precompile-reach.ts:87` + `:30060-30140` region, cold root = `arena.root` only).
- High-seas-only hook: the ocean is the heaviest single TSL surface in the smoke set (`PlaneGeometry(nearSize, nearSize, ≥256, ≥256)` + analytic Gerstner/foam graph + horizon ring, `src/water/ocean-tsl.ts:102-260`, `waveBands` at `:229`, `frustumCulled = false`).
- Why it is NOT this bug: a fence trip throws `[High Seas map selection failed] WebGPU queue completion exceeded 12000 ms`, rolls back, sets `deployment preparation failed` status — 1+ console errors and the spec's `deploy-failed` branch. Observed: 0 errors, timeout. If a future receipt shows `deploy-failed`, promote this to #1 and put high-seas into `MEASURED_COLD_SESSION_FENCE_LOSERS` behind a measurement.

### S4 [GUESS]: merge-set confound — new per-selection code outside cold-path-2 that high-seas data reaches first
- File:line: `audio.setArena(selectedArena.id)` at `src/legacy-main.ts:30036` (`src/audio.ts` +135 lines in c8, incl. metal/wood/concrete impact prewarm paths); thin-metal `createAndAttachThinMetalPerforationRuntime(…)` at `:29998` → `commit…` at `:30033` (new `src/thin-metal-perforation*.ts`, ~900 lines; runs for every arena incl. the metal-heavy yacht); killstreak-awareness match-reset path (new `src/killstreak-awareness.ts`, 417 lines).
- Exact await/branch: none isolated from reads — all three execute inside the pending window on candidate 8 and did not exist on candidate 7. A high-seas-only sync block (not pend) in any of them also matches the signature (main-thread block ⇒ no console output, waitForFunction starves, 120 s timeout).
- Fix: bisect, not guess — staged revert order: thin-metal attach → audio prewarm → killstreak-awareness, re-running the single-arena boot (`verify-arena-boot-cdp.mjs --arenas high-seas` / the pass74 spec filtered to high-seas) after each. Read `bootstrapStage` first: it discriminates S1/S4 immediately (see map).

### S5 [GUESS]: harness/sentinel artifact rather than game stall
- File:line: the spec only polls `window.__ATOMIC_ACRES_DEBUG__.snapshot()` (`pass74 spec :148-158`); `selectArena` serializes on `arenaSelectionTask` (`legacy-main.ts:30364-30372`); the guard `|| !arenaSelectionReady ||` at `:29933-29936` makes a not-ready `selectArena` return silently (no throw, no log).
- Branch: if the page was still `matchStartPreparing`/not-ready when the script called `selectArena('high-seas')`, the evaluate resolves without doing anything, `startSolo` then throws `did not commit before match start` inside `startGame`… which would surface as `deploy-failed`, not timeout — so this path alone does NOT match either, unless the throw is swallowed before status text updates. Included only as the last check: capture `record.diagnostics.status` text (`verify :124-131`) — if it still reads `Preparing High Seas deployment assets…`, the transition is genuinely pending (S1/S4); if it reads anything else, the sentinel (not the game) is suspect.

## Stage→await map (triage the next receipt by `diagnostics.bootstrapStage`)

| bootstrapStage / phase | exact await at candidate 8 |
|---|---|
| `loading-gameplay-assets` | `prepareMenuDeploymentAssets()` (`:30002`) |
| `previous-webgpu-fence` | `flushWebGpuFrames()` (`:30006`, throws on 12 s) |
| `physics-construction` | `CharacterPhysics.create(…)` (`:30025`) |
| `presentation-batching` | sync batch (`:30035`) — stage advances immediately |
| `waiting-for-authored-textures` / `visual-definition` | `configurePlayableArenaVisuals` → PMREM `applyDefinition`, `waitForSkyBackdropAdmission` (has `SKY_BACKDROP_WEBGPU_ADMISSION_TIMEOUT_MS`), (`:30043`) |
| warm frame | `submitForegroundWebGpuFrame` + `flushWebGpuFrames(12_000)` (`:30147`, throws) |
| `quality-presentation` | bloom refresh only for high-seas (`:5156-5165`) |
| `art-texture-settle` | **`waitForPendingArtTextures()` (`:30161`) — unbounded (S1)** |
| `prewarming-weapon-catalog` | `weaponView.prewarmBrowserWeaponCatalog(…)` (`:30163`) |
| `compiling-scene` / `coverage-submit-fence` | `precompileExactScenePass` + `flushWebGpuFrames(12_000)` (`:30199+`, throws) |

## Limits of this diagnosis (read-only by brief: no builds, no browser, no GPU)

- No smoke receipt was available in this pass, so `bootstrapStage` at stall time is unknown; S1 vs S4 is decided by that single field.
- High-seas-only settlement behavior of `pendingTextureLoads` (S1) and main-thread cost of the new thin-metal/audio paths on yacht data (S4) were not observable without running.
- Recommendation: (1) re-run the high-seas boot once and record `bootstrapStage`/status text; (2) if `art-texture-settle`, apply the S1 bound; (3) otherwise bisect S4 in the given order. Do not revert the placeholder (E1+E4) and do not widen any fence to get green.
