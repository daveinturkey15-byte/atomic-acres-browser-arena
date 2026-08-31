# The first arena of every session renders without environment lighting

**Status: diagnosed, reproduced, NOT fixed — needs an owner decision, because the fix
changes how eight approved arenas look.**

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

## The fix, when approved

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
