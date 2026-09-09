# High Seas boot fix - adapter binding limits on the WebGPU device

- Branch: `contrib/dave-gaming-pc/claude/fix-high-seas-batching`
- Base: candidate 8 `32d8dcb0` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate`)
- Machine: dave-gaming-pc, installed Chrome **headless**, `PASS73_NATIVE_WEBGPU=1`,
  stock repo flags, preview on port 4293 only, machine lock held for every build,
  the 13-arena smoke and the cold-admission run.
- Directory name says "batching" because the branch was opened under the earlier
  hypothesis. **No batching change was made.** See "The hypothesis that was wrong".

---

## Verdict

`[MEASURED]` **Fixed.** High Seas never loaded because the WebGPU **device** was
created with the spec-default binding limits instead of the adapter's. The fix
makes the device inherit the adapter's per-stage limits. The full 13-arena boot
smoke is **13/13 green**, and two arenas that were *also* failing before the
change (nuketown2, skyline-terminal) now pass.

---

## The defect

`[MEASURED]` `selectArena('high-seas')` was rejected by the GPU:

> The number of sampled textures (17) in the Fragment stage exceeds the maximum
> per-stage limit (16). This adapter supports a higher
> `maxSampledTexturesPerShaderStage`

`[READ]` WebGPU does **not** give a device the adapter's capabilities. A limit
the caller does not request is granted at the **spec default**, not at what the
hardware can do. `src/rendering/render-runtime.ts` called `requestDevice()` with
no `requiredLimits`, so every device this game has ever created was capped at 16
sampled textures per shader stage while the adapter on this machine advertises 32.

`[READ]` The rejected bind group cascades into an invalid `CommandBuffer`, the
queue submit fails, `performArenaSelection` throws and rolls the player back to
the previously prepared arena - so the map simply never loads.

`[READ]` This is the **same defect class**, on the limits axis, as the
optional-features bug already documented in `render-runtime.ts` and pinned by
`src/rendering/render-runtime-device-features.test.ts` (SSGI dying on
`rg11b10ufloat-renderable` because the device was granted no optional features).
The renderer had been burned by exactly this shape once already.

### Why nobody saw it

`[MEASURED]` Two independent reasons the failure looked like a hang rather than
a rejection:

1. `[READ]` The rollback path set the status
   `"Map switch failed - <old arena> remains selected."`, which matches neither
   the boot gate's `/deployment preparation failed|renderer blocked/i` regex nor
   anything a player can act on. A real player's menu click silently did nothing.
2. `[MEASURED]` The boot gate could not tell a **boot** from a **rollback**. Its
   sentinel (`tests/e2e/pass74-arena-boot-smoke.spec.ts:152`) tests
   `matchPhase === 'active' && gameStarted` **before** it reads `#status`, and it
   never asserted *which* arena loaded. So a GPU-rejected High Seas rolled back
   to nuketown2, nuketown2 reached active, and the test named
   `high-seas: boots a clean visible solo match` returned `active` and **passed**.

   This was observed directly: on unmodified candidate 8 the single-arena
   high-seas smoke **passed in 58 s** on this machine. That green was false.

---

## Which lane pushed High Seas to 17 sampled textures

`[MEASURED]` **None - it arrived at 17.** There was no 16 to 17 regression in an
existing arena. `git log --diff-filter=A` shows `src/high-seas.ts` (2,982 lines),
the whole `src/water/` stack (`ocean-tsl.ts`, `ocean-spectrum.ts`,
`water-authoring.ts`, `swim-state.ts`, `water-quality.ts`) **and** the
`high-seas` entry in `src/arena-identity.ts` were all **added** in a single commit:

```
23b140c1 build(hitl6): integrate multiplayer-first candidate6 evidence
```

That is exactly the first-bad commit the bisect identified, and it explains it
without any regression: PASS 93 head `1aad84ab` passes because High Seas did not
exist yet. The arena was born binding 17 sampled textures, and the latent
device-limits bug had simply never been reached by an arena needing more than 16.

The limit fix remains the right fix regardless: **the adapter supports the higher
limit**, the game was just never asking for it.

---

## Changes

| File | Change |
| --- | --- |
| `src/rendering/render-runtime.ts` | `selectInheritedDeviceLimits()` - pure, exported, reads the named limits off `adapter.limits`, omitting any the adapter does not report. `requestNegotiatedDevice()` asks for features + limits and degrades **one axis at a time** so an adapter without the headroom still gets a device. |
| `src/rendering/render-runtime-device-limits.test.ts` | **New.** 7 tests. Pins the pure contract *and* drives the real `create()` against a fake `navigator.gpu`, so the helper staying green cannot hide `create()` dropping the descriptor. |
| `src/legacy-main.ts` | The arena-rollback status now says `"<arena> deployment preparation failed - <old arena> remains selected."` A GPU rejection is no longer indistinguishable from a hang. |
| `tests/e2e/pass74-arena-boot-smoke.spec.ts` | Asserts `document.documentElement.dataset.arenaId === arenaId` - the arena that booted must be the arena asked for. |

`[READ]` Nothing was widened. No timeout, fence, threshold or budget was changed.
Requesting the adapter's own value can never be rejected for being too high (per
spec a device request fails only when it asks for **more** than the adapter
exposes), so this lowers nothing and raises nothing - it stops the device being
built weaker than the hardware it runs on.

`[MEASURED]` `src/legacy-main.ts` is **37,390** lines against its **37,396**
ceiling. No ratchet bump needed; `src/legacy-main-size-ratchet.test.ts` untouched
and green.

### On the spec change

The added assertion **strengthens** the gate; it does not weaken one. The test is
named `<arena>: boots a clean visible solo match`, and until now it could pass
without that arena ever booting. The assertion makes the test true to its own
name and closes the exact hole that let a broken arena ship behind a green 13/13.

---

## Evidence

### Falsification - the fix is load-bearing

`[MEASURED]` With the status fix and the spec assertion in place, the *only*
variable changed was `src/rendering/render-runtime.ts` (via `git stash`):

| Build | high-seas one-arena smoke |
| --- | --- |
| **Without** the limits fix | **FAIL** - 2.3 m timeout |
| **With** the limits fix | **PASS** - 1.0 m, `dataset.arenaId === high-seas` |

### Full 13-arena boot smoke

`[MEASURED]` `13 passed (11.9m)`, exit 0 - installed Chrome headless, native
WebGPU, external preview on 4293, machine lock held.

nuketown2, raid2, atomic-acres, skyline-terminal, rustworks-1v1, gun-range,
farcrysis, high-seas and the rest, plus the two roster/device guard tests.

`[MEASURED]` **Baseline for comparison.** The same full smoke on *unmodified*
candidate 8 was **not** 13/13. Before being stopped at test 9 it had already
recorded:

- `nuketown2` - **FAIL** (3.2 m)
- `skyline-terminal` - **FAIL** (18.7 s)

So the reported symptom "fails only on high-seas" did not hold on this machine;
the device-limits fix repaired all three.

### Other gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | `[MEASURED]` clean, exit 0 |
| `render-runtime-device-limits.test.ts` (new) | `[MEASURED]` 7/7 pass |
| `render-runtime-device-features.test.ts` | `[MEASURED]` pass |
| `render-runtime.test.ts` | `[MEASURED]` pass |
| `cold-session-precompile-reach.test.ts` | `[MEASURED]` pass |
| `pipeline-metrics.test.ts` | `[MEASURED]` pass |
| `legacy-main-size-ratchet.test.ts` | `[MEASURED]` pass |

Combined: **69 tests, 68 passed / 1 failed** on the first run - the one failure
was a bug in my own new test (a default parameter swallowing the "adapter reports
no limits" case), fixed, then **7/7**.

### Cold admission (nuketown2)

`[MEASURED]` `npm run qa:pass65:cold-webgpu-admission`, `PASS65_COLD_ADMISSION_PORT=4293`,
machine lock held, clean tracked worktree at `3f7633cb`:

| | Candidate 8 | This branch |
| --- | --- | --- |
| Cold Nuke Town transition | 21,807.6 ms | **20,919.6 ms** |
| Combined cold preparation work | 22,341.7 ms | 21,457.8 ms |
| Cold-admission long tasks | 298 (max 1,855.0 ms) | 235 (max 1,779.0 ms) |

`[MEASURED]` **888 ms better**, not worse. The script still exits 1, with the
**same** failure shape candidate 8 recorded: `admittedDegraded: true` plus the
transition exceeding the preserved 10,000 ms budget. That overrun is pre-existing
and untouched by this change.

---

## The hypothesis that was wrong

The branch was opened to test the Muse static diagnosis: that cold-path-2 hoisting
`batchSelectedArenaPresentation()` earlier (to authority-commit,
`src/legacy-main.ts:30035`) invalidated batched programs and blew the 12 s
coverage-submit fence.

`[MEASURED]` **No batching change was made, and none was needed.** The bisect
(`bisect/high-seas`) established that the admission retry livelock is never
entered, `#status` never shows "Renderer hiccup", and candidate 7 `452d7aba`
fails high-seas too. The batching order in this branch is candidate 8's, unchanged.

`[READ]` The hoist is nonetheless real and worth recording, because it was not a
free move. Commit `f7ce7dff` ("hoist static batching without growing legacy
entrypoint") paid for its new line by **deleting two things**:

- `prepareMenuArenaEnvironment()` / `menuArenaEnvironmentPrewarmPromise` - the
  menu arena environment prewarm, now referenced nowhere in `src` or `tests`.
- `setBootstrapStage('batching-static-meshes')` - so the deployment loading bar
  no longer reports its 95% "Batching arena geometry" step, which is still
  defined and now unreachable in `src/deployment-loading-progress.ts:24,63`.

`[OPEN]` Whether the menu prewarm should be restored is a separate decision for
the cold-path lane. Removing the hoist would free the line budget for it. This
branch deliberately does not touch it.

---

## Open items

- `[OPEN]` The cold Nuke Town transition remains ~2x its preserved 10,000 ms
  budget and admission still reports `admittedDegraded: true`. Pre-existing;
  improved but not resolved here.
- `[OPEN]` `handleMatchAdmissionFailure` (`src/legacy-main.ts:10261`) sets
  `"Renderer hiccup while preparing deployment ..."`, which likewise matches
  neither the boot gate's regex nor the deploy-failed contract. This fix closed
  the *selection* rollback path; the *admission retry* path can still present a
  renderer failure as a 120 s silence. Worth the same treatment.
- `[OPEN]` `MEASURED_COLD_SESSION_FENCE_LOSERS` in
  `src/rendering/cold-session-precompile-reach.ts` still names only `farcrysis`.
  High Seas gets no off-fence precompile relief. Not needed for boot correctness
  now, but unmeasured.
