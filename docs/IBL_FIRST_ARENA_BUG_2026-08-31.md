# The first arena of every session renders without environment lighting

**Status: FIXED 2026-08-31, owner-authorised, measured.** Evidence and the probes that
produced it: `docs/assets/ibl-fix-2026-08-31/`.

> **The diagnosis below found one of two defects.** Skipping the bootstrap was real and is
> fixed. But the environment was *also* inert on the arenas where it WAS bound: this module
> built its PMREM with `THREE.PMREMGenerator` — the **WebGL** implementation — against a
> `WebGPURenderer`. That cast does not throw and does not warn; it returns a texture that
> carries no light. Measured on the live build: with that texture bound, driving
> `scene.environmentIntensity` to 20 moved the mean frame luminance by **0.0000**, while
> binding a plain equirect texture at the arena's authored 0.22 moved it by **+7.8%**.
> `three/webgpu` exports its own `PMREMGenerator` built against the Renderer API, and that
> is the one this module now uses. So the "non-null after a map switch" state in the
> measurements below was non-null and still contributing nothing — map 2 was not the
> correct case, it was a second broken case that merely looked healthier from telemetry.

Found 2026-08-31 while diagnosing why Test1/Test2 looked underlit.

## What happens

`scene.environment` is `null` on the **first arena of every page load**, on every arena.
It is **not** null after an in-page map switch, where the PMREM path runs correctly.

So the shipped game renders map 1 differently from map 2, from the same build, in the
same session. Every metallic surface on the first map you load is lit with no environment
specular at all.

Measured on a fresh page, five arenas (atomic-acres, high-seas, farcrysis, test1,
gun-range), all identical:

```
scene.environment          = null
scene.environmentIntensity = 1          <- untouched default, never applied
scene.background           = real equirect Texture (valid)
console errors             = 0
```

After selecting a second arena in the same page:

```
scene.environment          = pass64-arena-environment-high-seas-256 (CubeUV)
scene.environmentIntensity = 0.2  == 1 x arenaEnvironmentScale('high-seas') x reflectionScale
```

## Why

The PMREM module is **not** dead code. Its only production entry point is skipped exactly
once per page load — and that once is the match every player actually plays.

| File | Line | What |
|---|---|---|
| `src/legacy-main.ts` | 3989 | `if (pass64TslSystems) pass64TslSystems.applyDefinition(...)` **`else { createPass64TslSceneSystems(...) }`** |
| `src/legacy-main.ts` | 2048 | `pass64TslSystems` is module-scoped, created once, disposed only on `beforeunload` — so the `else` branch runs exactly once, for the first arena |
| `src/rendering/pass64-tsl-scene.ts` | 1123–1148 | the constructor initialises `activeIblState` EMPTY and never calls `applyArenaEnvironmentIbl` |
| `src/rendering/pass64-tsl-scene.ts` | 1310 | inside `applyDefinition` — the **only** generation site in the program |
| `src/rendering/pass64-tsl-scene.ts` | 1332 | `applyGraphics` is guarded on `activeIblState.environmentTexture`, so a settings change can never bootstrap it either |
| `src/graphics-refinement.ts` | 232–234 | `applyEnvironmentIntensity` early-returns on `!scene.environment` — why intensity reads a pristine `1` |

Verified as **never called**, not "called and threw" or "called and discarded": a property
trap installed on `scene.environment` before arena load recorded **zero writes** across 25 s
and two match entries. `scene.uuid` was stable throughout, so it is not an attach-boundary
scene swap. The `throw` at `arena-environment-ibl.ts:68` never fires because
`scene.background` is always a valid Texture — the function containing it is simply not
reached.

## Why it wasn't caught

`src/graphics-settings-registry.ts:540` records its runtime evidence by **grepping for a
source symbol**, not by observing the scene. Nine unit tests pass against a code path that
never executes in production. That is the same failure shape as the three stale gate
rosters fixed on 2026-08-30 (`5ac48931`, `144ead77`, `60886c35`): the check confirms the
code *exists*, not that it *ran*.

## Why it is not fixed here

Turning it on is a **visual change to eight owner-approved arenas**, measured against a
temporal noise floor of ±0.25%:

| Arena | Mean luminance | Pixels moved >0.01 |
|---|---|---|
| atomic-acres (intensity 0.24) | 0.2808 → 0.2923 (**+4.09%**) | 63.2% |
| high-seas (intensity 0.20) | 0.4502 → 0.4818 (**+7.03%**) | 53.6% |

That is an art decision, not a bug fix to land quietly.

**Blocking coupling.** The 2026-08-30 art pass set `metalness` to 0 on several Test1/Test2
materials *on the explicit premise that `scene.environment` is permanently null*
(`src/test-maps-art.ts`, which states the premise and the 0.0011 linear-Y container
measurement that followed from it). Switching the environment on while leaving those at 0
bakes a wrong premise in permanently. **The switch-on and the metalness revisit have to be
one change, with fresh measurements.**

## What was actually landed (2026-08-31)

1. `three/webgpu`'s `PMREMGenerator` replaces `THREE.PMREMGenerator`. Pinned in
   `arena-environment-ibl.test.ts` in source, because the failure is invisible at runtime.
2. `createPass64TslSceneSystems` exposes `applyArenaEnvironment()`, sharing the single
   generation site with `applyDefinition`. `legacy-main.ts` awaits it after
   `waitForSkyBackdropAdmission`, so BOTH paths convolve the arena's **admitted** sky
   rather than the procedural placeholder that goes in synchronously ahead of it (verified:
   atomic-acres reports `sourceTextureName: pass66-generated-sky-backdrop-sunset-farmland`).
3. `applyDefinition` is now awaited at the call site.
4. `applyArenaEnvironmentIbl` no longer calls `applySkyBackdrop` itself — doing so bumped
   the backdrop application counter and invalidated the admission the caller was awaiting.
5. `assertArenaEnvironmentLive` runs on every arena commit and fails closed on
   null-environment, wrong-texture, and intensity != budget x arenaScale x reflectionScale.
6. The `environmentIntensity` registry row's evidence is now that live observation instead
   of a grep for a source symbol.

Measured, fresh page, first arena, at the arenas' own authored review cameras (full numbers
in `docs/assets/ibl-fix-2026-08-31/first-arena-environment-report.json`):

| Arena | mean luminance | pixels moved | clipped pixels | crushed (<0.005 linear Y) |
|---|---|---|---|---|
| atomic-acres | +4.24% .. +6.03% | 26% | 0% -> 0% | 1.34% -> 0.13% |
| high-seas | +4.78% .. +14.86% | 39-72% | 0% -> 0% | 7.0% -> 1.7% |
| test2 | +7.04% .. +8.90% | 44-63% | 0% -> 0% | 3.67% -> 2.07% |
| test1 | +4.38% .. +5.63% | 38-42% | 0% -> 0% | 16.72% -> 7.24% |

Nothing blows out — the p99 highlight moves by at most 0.02 on any frame — and the crushed
fraction falls everywhere. The container yard and the galvanised roofs, whose `metalness: 0`
the 2026-08-30 art pass justified with the (now retired) permanently-null premise, get
brighter shadow sides, not darker ones.

## The fix, as originally scoped

Roughly 3–6 lines. Give the object returned by `createPass64TslSceneSystems` an explicit
async environment bootstrap that shares `applyDefinition`'s call at
`pass64-tsl-scene.ts:1310`, and await it right after construction at
`legacy-main.ts:4009–4018`.

Do **not** simply call `applyDefinition()` again after construction — that re-runs
`applyArenaSystemLayout` and more besides.

Then close the false green: add a live gate asserting `scene.environment` is non-null and
`scene.environmentIntensity === budgetEnvironmentIntensity * arenaEnvironmentScale(arenaId)
* reflectionScale` **on the first arena of a fresh page**. It would fail today, which is
the point — land it with the fix.

## Separate, and worth fixing either way

`src/legacy-main.ts:3989` calls the async `applyDefinition` **without awaiting it**. On the
map-switch path the environment was measured landing at t=20862 ms, after the selection
promise had already resolved. It happens to be in time today, but nothing enforces that,
and a rejection there would surface as an unhandled promise rejection rather than a visible
failure.
