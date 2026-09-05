# High-seas deployment sentinel diagnosis (Muse Spark 1.3, read-only)

- Refs: candidate 8 `32d8dcb0` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate`)
  vs candidate 7 `452d7aba`. All `file:line` below is candidate 8 unless noted.
- Method: `git show` / `git diff` only. No builds, no browsers, no GPU, no source edits.
- Symptom (as reported): arena boot smoke for `high-seas` times out deterministically
  (120 s, 0 console errors, app stays on the deployment menu); candidate 7 passed 13/13.

## The sentinel the smoke waits for ([READ])

`tests/e2e/pass74-arena-boot-smoke.spec.ts:152` returns `'active'` only when
`snapshot().matchPhase === 'active' && snapshot().gameStarted === true`, else
`tests/e2e/pass74-arena-boot-smoke.spec.ts:154` returns `deploy-failed:` only when
`#status` matches `/deployment preparation failed|renderer blocked/i`, all inside a
`tests/e2e/pass74-arena-boot-smoke.spec.ts:158` 120 s `waitForFunction`.

`src/gameplay.ts:388` `createMatch` starts every match at `phase: 'warmup'`; the flip to
`'active'` happens in `advanceMatch` (same file, `now >= state.endsAt`) driven by the
live frame loop. So the sentinel needs: (a) admission to complete (`gameStarted = true`,
`src/legacy-main.ts:17859`), (b) the menu to hide, (c) frames to run past warmup.

The decisive routing ([READ], `src/legacy-main.ts:10249-10312` `handleMatchAdmissionFailure`):

- Non-renderer solo failure sets `Deployment preparation failed: ${error.message}...`
  (`:10312`) — MATCHES the spec regex, so a throw there fails FAST, not via 120 s timeout.
- Renderer-class failure (`/webgpu|pipeline|commandbuffer|queue completion|device lost|tint/i`,
  `:10249`) sets `Renderer hiccup while preparing deployment - rebuilding and retrying
  (attempt N of 4)...` (`:10261`), waits 1.5 s, purges errored pipelines, then
  `void startGame('solo')` again — up to 4 attempts (`:10210`, `:30573`), ending with
  `The graphics driver kept refusing this deployment...` (`:10308`). NEITHER status text
  matches the spec regex. Four cold attempts at ~25 s each (cold-path-2 measured a 26.3 s
  candidate-7 baseline transition) sum to ~105–120 s: a deterministic 120 s TIMEOUT with
  the app on the menu and no console errors (the error is caught; only status changes).

Discriminator for the re-run: read `#status` during the stall. Cycling
`Renderer hiccup...(attempt N of 4)` proves the retry livelock (suspects 1–2). Static menu
text with no admission attempt proves a pre-admission hang (nothing below supports that —
every per-arena await I found is bounded: sky admission has a timeout in
`src/rendering/sky-backdrop.ts:844`, art-texture failure THROWS in `src/art-kit.ts:373`,
stable-cadence is capped at 5 s in `src/legacy-main.ts:3027`).

## Ranked suspects (deploy → active awaits, high-seas-specific)

### 1. Cold WebGPU fence loss on high-seas → solo renderer-retry livelock ([READ] mechanism, [GUESS] trigger)

- Await/branch: `await flushWebGpuFrames(12_000)` in the warm-frame window and the
  `coverage-submit-fence` block of `performArenaSelection` (`src/legacy-main.ts:30130-30240`
  region), plus `await renderRuntime.compileAndRender(scene, camera, scene)` in the
  rest-composition block (`:17702`). A fence breach throws `WebGPU queue completion
  exceeded ...` (text referenced at `:30065`, `:30078`), which matches the renderer-class
  regex (`:10249`) and enters the retry loop above — invisible to the spec.
- Why ONLY high-seas: it builds the real shared-ocean water body
  (`src/water/water-authoring.ts:121-178`, `HIGH_SEAS_WATER`, `presentationOwner:
  'shared-ocean'`) plus ship, contained feature water and a 1,400 far plane
  (`src/legacy-main.ts:29775`, `:29782`, `:35864`). Cold-path-2 measured the candidate-7
  baseline `coverage-submit-fence` at 9,763 ms of a 12,000 ms fence — headroom of ~2.2 s.
- 7→8 delta that spends the headroom: `batchSelectedArenaPresentation()` was moved EARLIER,
  to authority-commit (`src/legacy-main.ts:30035`, new line, `if (... !== 'gun-range')`),
  while the original post-weapon-prewarm call remains (`:30166`; the second call is a no-op
  via the `pass65StaticBatchReady` guard in `batchPresentationRootOnce`, `:36960-36966`).
  Batching now happens BEFORE `configurePlayableArenaVisuals` (PMREM regen + sky + IBL env),
  `ensureSelectedQualityPresentation`, `tuneMaterialsForAtomicSignal` and the shadow-target
  warm frame. Three r185 folds the visible light graph into each render object's cache key
  (stated in the transition comments); material/light tuning AFTER the batch invalidates
  batched programs, so the coverage fence recompiles what the warm frame just built.
  High-seas carries the most tuned material families (pearl hull, teal trim, glass, deck,
  engine set, upholstery — `src/high-seas.ts:2638-2700` region), so it pays the most.
- Aggravating [READ] fact: `src/rendering/cold-session-precompile-reach.ts` names ONLY
  `farcrysis` in `MEASURED_COLD_SESSION_FENCE_LOSERS`. High-seas gets NO off-fence
  `precompileExactScenePass` relief on a cold session, so its ocean vocabulary is realised
  inside the fenced warm frame.
- Smallest fix: delete the early-batching line (`src/legacy-main.ts:30035`, the
  `profileArenaTransition('presentation-batching'); if (selectedArena.id !== 'gun-range')
  batchSelectedArenaPresentation();` statement), restoring the single post-material-tuning
  batch site at `:30166`. One line, no fence/threshold touched. Then re-run ONLY the
  `high-seas` boot smoke. If it still trips, do NOT widen the fence: measure first, and only
  then consider high-seas for the cold-session authority with the measurement that module
  demands.

### 2. Tint/pipeline-creation failure on high-seas water programs → same livelock ([GUESS])

- Same routing as suspect 1 via `:10249` (`tint|pipeline|device lost` alternatives) and the
  `sweepErroredPipelines` + time-boxed `renderRuntime.compile` recovery (`:10280-10300`).
- Why high-seas: the open-ocean TSL water + contained water + ship glass/deck graphs are the
  largest per-arena program set admitted on a cold first load; Chrome 153 Tint intermittents
  are already documented in this function. Deterministic (not intermittent) failure argues
  against Tint and for the fence (suspect 1), but the two are indistinguishable from the
  spec side — both show `Renderer hiccup...` cycling. Check `document.documentElement.dataset`
  `tintAdmissionSweeps` / `tintAdmissionLastPurge` after a failed run to separate them.

### 3. `waitForStableMatchAdmissionCadence` never seeing a stable second on the ocean ([READ] bounded — downgraded)

- `src/legacy-main.ts:3027`: bounded by `maximumWaitMs = 5_000`, resolves degraded rather
  than hanging. It CANNOT produce a 120 s timeout by itself. Listed only because it is the
  one await between deploy and active whose input (frame cadence over open water) is
  high-seas-shaped; at most it donates 5 s per attempt to suspect 1's budget.

### 4. Thin-metal verge-body registry — CLEARED ([READ])

- `createAndAttachThinMetalPerforationRuntime` returns `null` when the arena defines no
  `thinMetalPanels` (`src/thin-metal-perforation-runtime.ts:40-52`); high-seas defines none
  (no `thinMetalPanels` in `src/high-seas.ts`). The 7→8 verge-body fix (`8ce2482d`) removed
  four dead rows from `NUKETOWN2_THIN_METAL_PANELS` only. The commit/rollback/dispose wiring
  in `performArenaSelection` is null-safe. Cannot stall high-seas.

### 5. Killstreak/announce hooks in solo — CLEARED ([READ])

- `announceKillstreakActivation` (`src/legacy-main.ts:24382`) is host-presentation-only and
  runs on activation, not admission; `admitKillstreakAnnounceMessage` is guest-side
  (`:12942`); per-frame `killstreakActivity.retain` / flight-loop sync (`:24796ff`) and
  `expireKillstreakBanner` (`:14957`) are synchronous and allocation-bounded. None sits
  between deploy and active on a solo boot.

## Honest gaps

- [GUESS] is marked above wherever I infer GPU-side causation without a GPU receipt. The
  retry-livelock ROUTING is [READ]; that the trigger is the fence (rather than Tint) is
  inferred from determinism + the 9.76 s/12 s baseline + the batching move.
- I did not find any unbounded high-seas-specific await; every per-arena wait I traced
  (sky, art textures, cadence, fences, precompiles) is timeout- or throw-bounded. If the
  re-run shows static menu text (no `Renderer hiccup` cycling), suspects 1–2 are wrong and
  the next place to look is `CharacterPhysics.create` on the high-seas collider set and the
  `arenaVisualStream.adoptGameplayRoot` coordinator — both unchanged 7→8, hence ranked out.
