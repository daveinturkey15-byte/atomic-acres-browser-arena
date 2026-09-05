# High-seas arena-boot-smoke regression - independent bisect (Claude Code, second angle)

- Worktree: `C:/Users/david/projects/aa-bisect-highseas` (new, detached). Lane discipline:
  no shared worktree touched, port 4292 only, one headless installed Chrome at a time,
  `PASS73_NATIVE_WEBGPU=1`. **No test, timeout, threshold or config file was edited.**
- Bad head: candidate 8 `32d8dcb0` (runtime tip `4b5cc28b`). Good head: candidate 7 `452d7aba`.
- Time-boxed. Claims are [MEASURED] unless marked [GUESS] or [OPEN].

## 1. Reproduction harness

The documented harness (`playwright.config.ts` webServer -> `scripts/qa/playwright-web-server.mjs`)
could not be used inside the box: `vite build` takes 2.1 s but
`scripts/release/stage-release-topology.mjs` exceeds the config 180 s `webServer.timeout`,
and that timeout must not be raised. An external preview was driven instead, which the config
already supports unmodified via `QA_EXTERNAL_PREVIEW=1`:

    npx vite build
    npx vite preview --port 4292 --strictPort --host 127.0.0.1
    PASS73_NATIVE_WEBGPU=1 QA_EXTERNAL_PREVIEW=1 QA_PREVIEW_PORT=4292 \
      npx playwright test tests/e2e/pass74-arena-boot-smoke.spec.ts -g high-seas \
      --project=chromium --workers=1 --retries=0

`?release=latest` resolves to the candidate build on the raw root (`src/release-channel.ts:55`),
so skipping topology staging does not change what the smoke loads. Per-step setup fell from
over 180 s to about 13 s.

- [MEASURED] Harness self-check: the spec own "runs on a browser that can actually get a
  WebGPU device" test passes here (2.1 s). The timeouts below are the game, not the browser.

## 2. Bisect table - and why it does NOT name a candidate-8 merge

| # | Commit | Subject | Result | Wall |
|---|---|---|---|---|
| 0 | `32d8dcb0` | candidate 8 head (docs tip of runtime `4b5cc28b`) | BAD - `page.waitForFunction` 120 s timeout | 2.4 m |
| P | `32d8dcb0` | instrumented status/dataset probe (not a bisect step) | see section 3 | 2.2 m |
| 1 | `87c3dd71` | `merge(hitl8): cold-path-2 @ 30f92d2a` | BAD - same 120 s timeout | 1.9 m |
| 2 | `5b9010cd` | `merge(hitl8): v7-gate-audit-fixes @ 235432d5` | BAD - same 120 s timeout | 2.5 m |
| 3 | `452d7aba` | **candidate 7 head - the declared GOOD** | **BAD - same 120 s timeout** | 2.5 m |
| 4 | `1aad84ab` | PASS 93 head, `fix(webgpu): chrome153 tint - keep device-feature negotiation observable` | **GOOD - reaches active phase** | 1.3 m |

Five measured steps at the time of writing, plus an automated `git bisect run` over the newly
opened range (section 6). The candidate-8 bisect is **inconclusive by construction**: the declared good head
`452d7aba` reproduces the identical failure on this harness, so there is no good/bad boundary
inside `452d7aba..32d8dcb0` and no candidate-8 merge can be named as the first bad commit.
`git bisect start 32d8dcb0 452d7aba --first-parent` was opened and abandoned for this reason -
feeding it a "good" that is measurably bad would have manufactured a false culprit.

**This is the headline finding, and it is a claim about the cut evidence, not only about my
lane:** candidate 7 was recorded as 13/13 green on the arena boot smoke. On this machine, with
installed Chrome and a real WebGPU device, candidate 7 fails high-seas exactly the way
candidate 8 does.

Step 4 settles the obvious objection. `1aad84ab` - the PASS 93 head, 50 first-parent commits
before candidate 7 - **passes on this same harness in 1.3 m**. So the harness is sound, the
machine is sound, and the failure is a real source regression that simply **predates candidate 7**
and was already present when candidate 7 was recorded green. The live search range is
`1aad84ab..452d7aba`, not the candidate-8 merge set, and no candidate-8 lane owns this bug.

## 3. Mechanism - measured, not inferred

A read-only probe (`status-probe.mjs`, same launch flags as the spec chromium project) drove
`selectArena('high-seas')` then `startSolo()` on candidate 8 and sampled `#status`,
`documentElement.dataset` and `snapshot()` once a second for 130 s. Full output:
`status-probe-32d8dcb0.txt`.

    SELECTED-ARENA-DATASET: nuketown2
    t+0.1s {"status":"","stage":null,"arenaId":"nuketown2",
            "gameplayArena":"deferred-until-deployment","phase":"warmup","started":false}
       ...state never changed again for 130 s...
    CONSOLE ERRORS (15):
      THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The number of sampled
        textures (17) in the Fragment stage exceeds the maximum per-stage limit (16). This
        adapter supports a higher maxSampledTexturesPerShaderStage...
      ... [Invalid BindGroupLayout] -> [Invalid PipelineLayout] ->
      Render pipeline creation failed (renderPipeline_MAT_Pass65_Crossbow_Armor_PBR_1886)
      ... -> [Invalid CommandBuffer from CommandEncoder "renderContext_4"]
      [High Seas map selection failed] Error: WebGPU queue completion failed: WebGPU
        uncaptured error: GPUError: [Invalid CommandBuffer ...]

The chain, in order:

1. Root cause. A fragment stage needs 17 sampled textures; the device allows 16.
   `src/rendering/render-runtime.ts:1325-1327` calls
   `adapter.requestDevice({ requiredFeatures })` / `adapter.requestDevice()` with no
   `requiredLimits`, so the device is created at the WebGPU default
   `maxSampledTexturesPerShaderStage = 16` even though - as the validation error itself
   states - this adapter supports a higher value.
2. The invalid bind-group layout poisons the pipeline layout;
   `renderPipeline_MAT_Pass65_Crossbow_Armor_PBR_1886` fails creation. That weapon material is
   a cascade victim ("invalid due to a previous error"), not the origin - the first error
   carries no material label, which is consistent with the batched static arena material.
3. The invalid command buffer fails the fenced submission: "WebGPU queue completion failed",
   thrown inside `performArenaSelection`.
4. "[High Seas map selection failed]" is logged and the transition rolls back:
   `dataset.arenaId` stays `nuketown2` (the HF-495 lead card) and `gameplayArena` stays
   `deferred-until-deployment`.
5. `startSolo()` never reaches `matchPhase === 'active'`, `#status` stays EMPTY, and the spec
   120 s `waitForFunction` times out. The spec sees 0 console errors because the failure is
   caught and logged, never surfaced to `#status`.

### The candidate-7 green does not reproduce

The breach is a WebGPU **spec default limit** (`maxSampledTexturesPerShaderStage = 16`), not a
load-dependent budget: given the same shader permutation set and the same device request, it is
deterministic. Two things follow.

- [MEASURED] The release cut's own `high-seas-probe.txt` records `CONSOLE ERRORS (0)` and
  `PAGE ERRORS (0)` on candidate 8. My probe on the same commit records **15** console errors
  led by the 17-vs-16 breach. The two runs are therefore **not observing the same failure**,
  even though both end in the same 120 s timeout with the app parked on the menu.
- [MEASURED] `1aad84ab` passing and `452d7aba` failing on the identical harness rules out
  "environment-bound" as the whole story: something in those 50 commits pushes the fragment
  stage across the 16-texture boundary and keeps it there through candidate 8.
- [GUESS] The candidate-7 green was most likely recorded on a session whose resident material
  permutation set was smaller (different arena visited first, warmer cache, different Chrome
  build), leaving the count at 16 rather than 17. That makes 16 a **cliff edge the build has
  been sitting on since somewhere in `1aad84ab..452d7aba`**, which is exactly the kind of
  boundary that produces an intermittent gate.
- [MEASURED] GPU was not saturated during these runs: RTX 5080, 8,990 / 16,303 MiB used, 8 %
  utilisation, no heavy compute client. Resource exhaustion is not the explanation.

## 4. Which coordinator lead the evidence supports

- **Lead 1 (Muse: cold WebGPU fence loss on high-seas): PARTLY SUPPORTED, MECHANISM CORRECTED,
  BISECT NOT CONFIRMED.** Muse's static reading of the deployment path is sound and its
  discriminator was the right one to run. But the measured failure is **not** the
  `flushWebGpuFrames(12_000)` budget expiring and **not** the `handleMatchAdmissionFailure`
  renderer-retry livelock: across 130 one-second samples `#status` never showed
  `Renderer hiccup while preparing deployment - rebuilding and retrying (attempt N of 4)`
  (`src/legacy-main.ts:10261`) - it stayed empty the whole time. The throw happens inside
  `performArenaSelection`, which rolls back and logs, so match admission is never reached and
  the retry ladder is never entered. And cold-path-2 cannot be the first bad commit, because
  its parent and candidate 7 fail identically.
- Muse's aggravating fact is confirmed verbatim:
  `src/rendering/cold-session-precompile-reach.ts:87` is `Object.freeze(['farcrysis'])` - it
  names **farcrysis only**, so high-seas gets no off-fence precompile relief. (The coordinator
  brief said this list names `nuketown2`; it does not.)
- **Lead 2 (Luna: smoke harness artefact after the HF-495 map reorder): REFUTED as the cause,
  but their observable is real.** `SELECTED-ARENA-DATASET: nuketown2` after
  `selectArena('high-seas')` reproduces the rollback they are chasing, so `4dae1863` /
  `a4f67671` / `b205adf6` would give a much sharper failure message and are worth having. But
  HF-495 (`09980a5a feat(menu): HF-495 map order`) is an **ancestor of candidate 7**
  (`git merge-base --is-ancestor 09980a5a 452d7aba` -> yes), so it cannot be a 7 -> 8
  regression; and the selection rolls back because the GPU rejected the pipeline, not because
  the harness picked the wrong card. Their commits would document the failure, not remove it.

### Can a real player deploy high-seas on candidate 8?

- [MEASURED, debug-API path] No. `selectArena('high-seas')` fails and rolls back with **no
  status text shown to the player** - the menu simply does nothing and stays on Nuke Town.
  That is worse for a player than for the smoke, which at least times out visibly.
- [OPEN] The click-through menu path was not driven inside the time box. The debug API calls
  the same `performArenaSelection`, so a player-path difference is unlikely but unmeasured.

## 5. Smallest fix I would apply

Request the limit the adapter already advertises, at `src/rendering/render-runtime.ts:1325-1327`:

    const requiredLimits = {
      maxSampledTexturesPerShaderStage: adapter.limits.maxSampledTexturesPerShaderStage,
    };
    const device = requiredFeatures.length > 0
      ? await adapter.requestDevice({ requiredFeatures, requiredLimits })
          .catch(() => adapter.requestDevice({ requiredLimits }))
          .catch(() => adapter.requestDevice())
      : await adapter.requestDevice({ requiredLimits }).catch(() => adapter.requestDevice());

It weakens no test, timeout or threshold. It stops asking for a 16-sampled-texture device on an
adapter whose own validation message says it supports more, and it keeps the existing fall-back
ladder so a stricter adapter still gets a bare device. Note that `1aad84ab` - the PASS 93 head -
is itself `fix(webgpu): chrome153 tint - keep device-feature negotiation observable`, i.e. this
exact negotiation site is already under active repair; the limits half of it was never done.

Second, independent of the fix: make this failure **visible**. The catch that logs
`[High Seas map selection failed]` should also `setStatus(...)` with text the boot smoke's
`deploy-failed` branch matches (`tests/e2e/pass74-arena-boot-smoke.spec.ts:154`). As shipped, a
GPU-rejected arena selection is indistinguishable from a hang, for the smoke and for the player
alike. That is why this took a browser probe rather than a log read.

## 6. Next step handed over

`1aad84ab` passes, so the search range is `1aad84ab..452d7aba` - 50 first-parent commits,
about 5 automated steps. An unattended

    git bisect start 452d7aba 1aad84ab --first-parent
    git bisect run bash fast-step.sh high-seas

was launched at 12:33 against this range; its first candidate was
`94aa2170 fix(hitl6): isolate cold coverage roots`. Raw output is `AUTORUN.log` in this
directory, and whatever it had reached at the time box is appended below.

Whoever picks this up should note that the candidate-8 fix lanes (Luna's
`fix-high-seas-boot`, and any lane acting on cold-path-2) are aimed at the wrong range.

## 7. Not done

- No fix applied, per instruction.
- cold-path-2's own 13 commits not bisected internally (the enclosing bisect never became valid).
- Staged-topology harness not used; see section 1. `?release=latest` resolves identically on the
  raw root, but this is the one harness difference from the cut and it is [OPEN] whether it
  matters.
- The full 13-arena roster was not run, so it is [OPEN] whether other arenas also fail here on
  candidate 7 - which would settle the environment question in one run.

---

## 8. Range-2 result (automated `git bisect run`, completed after the time box)

    git bisect start 452d7aba 1aad84ab --first-parent
    git bisect run bash fast-step.sh high-seas

| # | Commit | Subject | Result |
|---|---|---|---|
| 5 | `94aa2170` | `fix(hitl6): isolate cold coverage roots` | BAD |
| 6 | `cfc71824` | `fix(hitl6): retain stock nuke fence relief` | BAD |
| 7 | `0a79f340` | `fix(hitl6): hoist pickup authority from legacy main` | BAD |
| 8 | `e0d445f9` | `fix(hitl6): merge multiplayer audit remediation` | BAD |
| 9 | `fad765f4` | `build(hitl6): record preflight gate outcome` | BAD |
| 10 | `23b140c1` | `build(hitl6): integrate multiplayer-first candidate6 evidence` | BAD |

**`23b140c1 build(hitl6): integrate multiplayer-first candidate6 evidence` is the first bad
commit** - the oldest commit in `1aad84ab..452d7aba`, i.e. the very first step after the PASS 93
head. Ten measured steps in total across both ranges.

### Read this result carefully - the failure MODE changes at the boundary

`23b140c1` does not fail the way candidate 8 fails. Its run reaches the active phase and then
fails the spec's final `no console errors` assertion with:

    [High Seas map selection failed] Error: WebGPU queue completion exceeded 12000 ms for
      submission 1 (completed 0, mode serialized, in-flight 1, pending 12004 ms, probes 1,
      prior latency none, fenced draws 735)

That is **exactly Muse's lead 1**: the 12,000 ms cold fence expiring, here surviving on a retry.
By candidate 7 and candidate 8 the same arena instead dies earlier, on the 17-vs-16
sampled-texture GPU validation error, and never reaches active at all.

So the honest reading is **two stacked defects on one cliff edge**, not one:

1. From `23b140c1` on, the high-seas cold transition no longer fits the preserved 12,000 ms
   queue fence (735 fenced draws). That is a real, bisected regression at the oldest commit of
   the range - which means it entered with the candidate-6 integration, not with any PASS 94/95
   lane, and every candidate since has carried it.
2. Somewhere later, the fragment stage crosses `maxSampledTexturesPerShaderStage = 16` and the
   failure hardens from "slow, survives a retry" into "GPU-rejected, rolls back silently". That
   transition is inside `23b140c1..452d7aba` and was not narrowed further inside the box.

Because a single pass/fail predicate cannot separate two mechanisms, `git bisect` collapsed them
onto the oldest commit. Anyone continuing this should bisect **on the error text**, not on
exit code: treat "queue completion exceeded" as GOOD and "sampled textures (17)" as BAD to find
where defect 2 enters.

### What this means for the pass-95 cut

- No candidate-8 lane owns this bug. cold-path-2 (`87c3dd71`) is not the first bad commit; nor
  is v7-gate-audit-fixes. Both merely inherit it.
- Candidate 7's recorded 13/13 arena-boot-smoke green is not reproducible on this machine.
  Candidate 7 fails high-seas here in 2.5 m, deterministically, and so does everything back to
  `23b140c1`.
- The Luna fix lane on `contrib/dave-gaming-pc/claude/fix-high-seas-boot` and any lane reverting
  cold-path-2 are both working the wrong range.
