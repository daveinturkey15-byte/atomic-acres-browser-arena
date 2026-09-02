# HF-410 integration prep — the HF-413 gates on the fitted rig, and the two residuals

Branch `contrib/dave-gaming-pc/claude/hf410-integration-prep`, base `c75c452f`
(the PASS 85 publish head) with
`contrib/dave-gaming-pc/claude/hf395-396-viewmodel` merged **clean** (one
auto-merge, `src/weapon-presentation.ts`, exactly as the merge audit predicted).

## F2 — the HF-413 gates against the fitted rig

### `qa:pass85:arms-handedness` (static GLB gate) — **PASS, 0 violations**

136 files, 4,989 nodes, 485 sockets, `verdict: pass`, `violations: []`. Identical
to the PASS 85 baseline: the body fit is a runtime uniform scale about the eye
and touches no authored glTF node transform, which is exactly what this gate
grades.

### Focused vitest — **349 passed, 1 failed, and the failure is not Lane W's**

30 files (Lane W's 28 plus `src/hf413-arms-handedness.test.ts` and
`src/viewmodel-framing.test.ts`): **29 files / 349 tests pass**.

The single failure is `src/presentation-prewarm-contract.test.ts` →
*"keeps continuous endurance telemetry allocation-light"*. It is **pre-existing
on the shipping line and shipped in PASS 85**. Proof, by slicing
`src/legacy-main.ts` between `function sampleEnduranceHealth(` and
`const debugWindow = window` at four refs:

| ref | region length | forbidden token found |
|---|---|---|
| `75a4e508` (Lane W's base) | 17,077 | none |
| `contrib/.../hf395-396-viewmodel` (Lane W head) | 17,077 | none |
| **`c75c452f` (PASS 85 publish head)** | 19,156 | **`snapshot()`** |
| `HEAD` (this merge) | 19,156 | `snapshot()` |

Lane W's merge does not change that region at all (identical length). The token
was introduced by **Lane Y / HF-412, commit `6e5ab7bf`**, and it is a *doc
comment*, not a call:

> `* \`snapshot()\` rebuilds the whole operator report (every bone chain in the`

So the contract's intent (allocation-light telemetry) is not violated; the
assertion is matching a comment. **Not fixed here** — it is Lane Y's text, and
the honest repair (reword the comment, or teach the assertion to strip comments)
is a call for its owner, not a silent edit from this lane. One-line fix
available: drop the backticked parens from that comment.

### `qa:pass65:first-person-arms-visual` (browser gate) — **11 → 2 violations**

**The committed gate aborts before it can count.** It does not fail an
assertion; it times out on a *precondition*:

```
page.waitForFunction(() => ...weaponPresentation.surfaceRetreat > 0.15)  // line 479
```

That precondition asserts the wall-pullback symptom layer HF-410 deliberately
removes. Measured on the merged tree at the gate's own poses:

| precondition | gate expected | measured |
|---|---|---|
| `contact/m4a1/wall-hip` | `surfaceRetreat > 0.15` | **0** |
| `contact/m4a1/prone-wall-floor-hip` | `surfaceRetreat > 0.25` **and** `surfaceLift >= 0.13` | retreat **0**, lift **0.2** |

Note the prone precondition fails *only* on retreat — the floor lift (0.2) still
satisfies it.

To get the number the cut needs without touching the committed gate, the gate
was copied and **only those two waits** were converted into recorded
observations (`pass65-arms-visual-probe.patch`, 61 lines, the whole deviation).
Everything before line 479 — every weapon representative, the ADS strips, the
six-frame reload and melee strips, the knife bind-pose restore — ran unmodified
and **clean**.

Result: `verdict: fail`, **`violationCount: 2`**, 47 evidence frames, backend
`webgpu`, `softwareAdapter: false`, `browserErrors: []`
(`pass65-arms-visual-probe-receipt.json`).

```
1. contact/m4a1/prone-wall-floor-hip/left: sleeve entry
   [0.1103, -0.6915, 0.9848] does not continue below frame
2. contact/m4a1/prone-wall-floor-ads/left: sleeve entry
   [-0.0249, -0.8997, 0.9843] does not continue below frame
```

**Against the PASS 85 baseline of 11, all "clipped by the near plane": 2, and
neither is near-plane class.** Every near-plane violation is gone — which is
what the fit was for. What remains is the HF-413 shoulder-entry contract
(floor −0.98) on the **left** arm in the two prone-wall poses: entry y −0.6915
and −0.8997 sit above the floor. That is precisely the HF-413 × HF-410
interaction F2 predicted — the uniform 7.7x shrink about the eye preserves NDC
for the quantities HF-413 mostly asserts, but the sleeve no longer reaches the
bottom edge in a prone contact pose.

**Two decisions are owed to the integrator, and neither is this lane's to take:**

1. The gate's retreat/lift preconditions now describe a removed design. They
   should be re-pinned to what the reworked rig contracts for, *with the reason*
   — an owner-directed rework is not a weakened gate — or the gate will keep
   aborting rather than reporting. Leaving it aborting is worse than red: it
   yields no number at all.
2. The two left-sleeve entries need either a pose fix or a re-pin of the HF-413
   floor for prone contact poses.

## The pass69-3 near-plane catalog spec — re-pinned to DERIVE

The spec pinned `cameraNear: 0.08` as a literal and the runner hardcoded
`requiredDepth = 0.1`. Both were **second and third copies of a number they do
not own**: the runtime publishes the *live* gameplay camera near into
`nearPlaneClearance.cameraNear`, so the moment
`FIRST_PERSON_CAMERA_NEAR_METERS` moved, the spec pinned a stale value.

- `tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts` now imports and
  asserts `cameraNear: FIRST_PERSON_CAMERA_NEAR_METERS`.
- `scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs` derives
  `requiredDepth = FIRST_PERSON_CAMERA_NEAR_METERS + 0.02`, reading the constant
  out of `src/viewmodel-body-fit.ts` and **throwing** if it cannot be read or is
  non-positive.
- `src/pass69-3-authored-near-plane-catalog-runner.test.ts`'s token grep follows
  the spec it greps.

**`requiredMargin` is untouched at 0.02.** The clearance demanded above the plane
is not reduced — it is re-based onto the plane actually in force. Nothing is
hardcoded to the new number anywhere.

`npx tsc --noEmit` → 0. `src/pass69-3-authored-near-plane-catalog-runner.test.ts`
→ 7/7 pass.

### Running it headless: **FAILS, for a pre-existing reason upstream of the near plane**

```
QA_PREVIEW_PORT=4190 PASS73_NATIVE_WEBGPU=1 PASS69_3_NEAR_PLANE_RENDERER=webgpu   npx playwright test tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts --project=chromium
```

It never reaches a near-plane assertion. It fails at **line 960**, in setup:

```
Error: one exact authored design identity per canonical weapon
expect(designIds.size).toBe(WEAPON_IDS.length)   Expected: 21   Received: 20
```

`designIds` is built from `source-assets/blender/pass65-weapon-family-specs.json`
plus one explicit `designIds.set('explosive-crossbow', ...)`. **`crimson-flamethrower`
is in `SPECIAL_WEAPON_IDS` (`src/protocol.ts:105`) and has no entry in either.**

Measured at three refs — the map is **20 at every one**, including Lane W's own
base:

| ref | `WEAPON_IDS.length` | `designIds.size` |
|---|---|---|
| `75a4e508` (Lane W base) | 21 | **20** |
| `c75c452f` (PASS 85 head) | 21 | **20** |
| `HEAD` (this merge) | 21 | **20** |

So this spec has been red since `crimson-flamethrower` joined the roster, and
nobody had run it — which is also why the stale `cameraNear: 0.08` pin survived
unnoticed. **Not caused by Lane W, not caused by the re-pin, and not fixable by
it.**

**Not fixed here, deliberately.** The fix is one line mirroring the crossbow
precedent — `designIds.set('crimson-flamethrower', '<authored design id>')` —
but the *value* is compared at line 711 against the identity the runtime reports
for that weapon, so it must be **read from the runtime, not invented**. There is
no crimson entry anywhere in the family specs to derive it from (the flamethrower
it reskins is `m2-pressure-wand-twin-tank-v1`; whether crimson shares that
identity or owns one is an authoring decision). Guessing it would put a made-up
authored identity into a uniqueness contract.

## `tests/e2e/pass70-chopper-gunner.spec.ts` — **PASSES**

Lane W edited this spec's near-plane receipt and never ran it. Run headless on
the merged tree: **exit 0** (`1 flaky` — the first attempt timed out during Gun
Range asset load at 95% inside the spec's own 60 s window on a box at 80% CPU
with 24 node processes and six lanes running; Playwright's retry passed).

Configuration matters and cost two wasted runs: the spec's renderer defaults to
`webgl2`, so it must be told `PASS70_CHOPPER_RENDERER=webgpu` when the harness
launches installed Chrome with `PASS73_NATIVE_WEBGPU=1`, or it fails on
`renderer: "webgl2"` vs `"webgpu"` — an environment mismatch, not a regression.
On bundled Chromium (no `PASS73_NATIVE_WEBGPU`) the debug handle never appears
inside 45 s on this loaded machine.

```
QA_PREVIEW_PORT=4190 PASS73_NATIVE_WEBGPU=1 PASS70_CHOPPER_RENDERER=webgpu \
  npx playwright test tests/e2e/pass70-chopper-gunner.spec.ts --project=chromium
```

## The two HF-399 residuals

### 1. Socket caching — **already done, by Lane W's own repair**

Not outstanding. `src/weapon-presentation.ts:4546` carries
`private readonly socketCache = new WeakMap<THREE.Object3D, Map<string, THREE.Object3D>>()`
with per-model revalidation, and `src/hf399-viewmodel-socket-cache.test.ts` gates
it (green in the focused run). Lane W measured, like-for-like on one program
instrumented two ways: carbine 9.00 → 2.03 `getObjectByName` calls/frame and
1850.0 → 126.1 nodes visited/frame; lmg 9.00 → 2.03 / 2025.0 → 176.9; sniper
9.00 → 3.03 / 2060.0 → 279.1; pistol 9.00 → 2.03 / 1619.0 → 59.0.

A fresh ms/frame reading was **not** taken. A profiled per-frame number measured
on a box at 80% CPU with six lanes running would be noise, and the census above
is the load-bearing evidence anyway.

### 2. The frozen-subtree matrix walk — **NOT DONE, because it is already fixed**

Lane W handed this back as OPEN: *"deepFreezeSubtreeMatrices clears
matrixAutoUpdate but NOT matrixWorldAutoUpdate, and the viewmodel's own
`this.root.updateMatrixWorld(true)` passes force=true, which in three r185 makes
the walk recurse into every child regardless of either flag."*

That is **refuted on the merged tree**. `src/static-matrix-freeze.ts` already
replaces the frozen root's method outright:

```ts
root.updateMatrixWorld = skipUpdateMatrixWorldWhileFrozen;   // a no-op
```

landed by `8b2e4cc9` *"freezing a subtree must not walk it"* and present in
`c75c452f`. Because three's `updateMatrixWorld` recurses by calling
`child.updateMatrixWorld(force)`, a `force=true` parent walk hits that no-op and
stops dead at the frozen root. Measured directly against three r185 — a frozen
root with two descendants, instrumented, then walked with `force=true` from its
parent:

```
force=true parent walk -> nodes touched inside frozen subtree: 0
matrixWorldAutoUpdate on frozen nodes: true,true,true
```

**Zero.** Setting `matrixWorldAutoUpdate = false` would therefore buy nothing
measurable, while `deepUnfreezeSubtreeMatrices` would have to restore it — and
a blanket restore to `true` would clobber any node that deliberately had it
`false`, on a rig with a documented history of frozen-part bugs. Left alone,
deliberately, per the brief's "otherwise leave them and say so".

The remaining per-frame cost Lane A named is the **active** rig's own
`this.root.updateMatrixWorld(true)` (`src/weapon-presentation.ts:5045`), which is
not a frozen subtree and must walk. Reducing it is a redesign, not a residual.
