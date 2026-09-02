# PASS 86 gate repairs — the three defects the HF-410 prep left, and what each one really was

Branch `contrib/dave-gaming-pc/claude/pass86-gate-repairs`, off
`contrib/dave-gaming-pc/claude/hf410-integration-prep` at `14524454`. Every
number below was measured on this tree, headless, in installed Chrome on real
WebGPU (`softwareAdapter: false`, `browserErrors: []`), one browser at a time.

## 1. `qa:pass65:first-person-arms-visual` — it aborted; it now reports

**Was:** a `waitForFunction` on `surfaceRetreat > 0.15`, then `> 0.25`, timed
out after 10 s and threw. The gate produced no violation count at all, which is
strictly worse than red.

**Why:** that precondition asserts the wall-pullback symptom layer HF-410
deliberately removes. `VIEWMODEL_WALL_PULLBACK_SCALE` is **0** on this tree, by
design and with the reason in the source — "there is no wall for it to be
pulled out of", because the rig now lives inside the 0.38 m capsule.

**What was actually wrong with the assertion**, and this is the part that lets
the thresholds survive: since HF-387, `surfaceRetreat` publishes the **applied**
camera-space translation, which is the exact quantity HF-410 zeroes. The
**probe demand** is untouched and still published as `requestedSurfaceRetreat`
— the source says so explicitly ("the retreat is still probed, still reported in
telemetry"). Measured at the gate's own three poses:

| pose | `requestedSurfaceRetreat` | `surfaceRetreat` (applied) | `surfaceLift` | `wallBlend` | fold |
|---|---|---|---|---|---|
| `contact/m4a1/wall-hip` | **0.82** | 0 | 0 | 1 | engaged |
| `contact/m4a1/prone-wall-floor-hip` | **0.82** | 0 | 0.2 | 1 | engaged |
| `contact/m4a1/prone-wall-floor-ads` | **0.82** | 0 | 0.2 | 1 | engaged |

So the gate's original numbers — 0.15 and 0.25 — are **kept verbatim** and
re-pinned onto the demand, where they still mean what they were written to
mean, and they pass with 3-5x of margin. The floor-lift half of the prone
precondition was already satisfied (0.2 m, at the
`VIEWMODEL_PRONE_BASE_LIFT_METERS` cap) and is kept as a wait.

**What replaced the retreat as the falsifier.** The retreat existed to keep the
rig out of walls. That is now asserted *directly*, on the two margins the lane
itself ships and measures (`sampleViewmodelRigExtent`):

| pose | `capsuleMarginM` | `floorClearanceMinM` | `bodyFitScale` | `viewportForwardMinM` | near-plane cut on screen |
|---|---|---|---|---|---|
| `wall-hip` | 0.138 | 1.643 | 0.13 | 0.078 | 0 |
| `prone-wall-floor-hip` | 0.138 | 0.573 | 0.13 | 0.078 | 0 |
| `prone-wall-floor-ads` | 0.168 | 0.618 | 0.13 | 0.0979 | 0 |

`capsuleMarginM > 0` says the rig stays inside the body that carries it, so no
wall the capsule may touch can contain it; `floorClearanceMinM > 0` says the
lowest visible vertex stays above the surface the player stands on. Before the
fit those were **-1.593** and **-0.776**
(`src/viewmodel-body-fit.ts`, `docs/evidence/pass85/hf410/`). The live fit scale
is pinned to `VIEWMODEL_BODY_FIT_SCALE` read out of the source, so a silent
revert of the fit fails here rather than passing quietly.

Both new checks are **assertions, not waits**: a pose that stops being a wall
pose goes red with a number, never times out with none. Nothing in the anatomy
contract, the −0.98 shoulder-entry continuation floor, or any near-plane
assertion was touched.

**Result: `verdict: fail`, `violationCount: 2`, 47 evidence frames, backend
`webgpu`, `softwareAdapter: false`, `browserErrors: []`.** Receipt:
`pass65-arms-visual-gate-receipt.json`. Both violations are the HF-413
left-sleeve entry, below.

## 2. The two remaining violations — NOT FIXED, and not fixable by the named levers

```
contact/m4a1/prone-wall-floor-hip/left: sleeve entry [ 0.1098, -0.6830, 0.9848] does not continue below frame
contact/m4a1/prone-wall-floor-ads/left: sleeve entry [-0.0249, -0.8990, 0.9843] does not continue below frame
```

**The constraint is reach, not lane depth.** `shoulderEntryNdc` is not a value
the lane sets — for these rows it is the **minimum projection the solver found**
over three direction arcs x 17 steps on the reachable sphere
(`constrainRiggedShoulderEntryToReach`; `shoulderReachAdjusted: true` means the
socket was out of reach and the shoulder was placed on that sphere). The lane
only sets where the search *stops*. Measured
(`hf413-left-sleeve-reach-analysis.json`):

| pose | side | socket | physical reach | max socket reach | entry NDC y |
|---|---|---|---|---|---|
| `long-gun/m4a1/hip` | left | `support-socket-l` | 1.0614 | 0.9046 | **-1.0475** ✅ |
| `long-gun/m4a1/hip` | right | `grip-socket-r` | 1.0614 | 0.9046 | -1.0514 ✅ |
| `prone-wall-floor-hip` | left | `support-socket-l` | **0.9128** | 0.7766 | **-0.6830** ❌ |
| `prone-wall-floor-hip` | right | `grip-socket-r` | 0.9128 | 0.7766 | -1.0193 ✅ |
| `prone-wall-floor-ads` | left | `support-socket-l` | **0.6721** | 0.5692 | **-0.8990** ❌ |
| `prone-wall-floor-ads` | right | `grip-socket-r` | 0.6721 | 0.5692 | -1.0006 ✅ |

Two things follow, and they are why no lane constant helps:

1. **The arm is shorter in a contact pose.** `contactFold.scale` multiplies the
   whole viewmodel root (`src/weapon-presentation.ts:6332`), and the arms hang
   off that root, so the fold shortens them with everything else: upper-arm
   0.4603 m folded against 0.5352 m at hip, a 14% loss of reach. The
   shoulder-entry contract is a **fixed screen-space lane**. A shortened arm
   cannot put its shoulder that far below a socket that has not moved
   correspondingly.
2. **Only the support side is affected**, with identical bone lengths and an
   identical sphere radius in the same frame — because `support-socket-l` sits
   further forward and higher than `grip-socket-r`, so the sphere around it
   projects higher.

Therefore: changing `FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.left` (-1.04) or
`FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC` (-0.99) **cannot move these
numbers at all** — the search already failed to reach either, and reports its
sphere minimum. Nor can the elbow pole: by construction it rotates the elbow
about the shoulder-to-grip axis and **does not move the shoulder**. The two
levers the brief named are both no-ops here, which is a measurement, not an
opinion.

**The -0.98 floor was NOT re-pinned.** These two rows describe a real visual
defect — a proximal sleeve that terminates in mid-air instead of running off the
bottom edge, the same class the owner called "arms ... strange" — so the gate is
correctly red and should stay red.

### Proposed fix, for whoever owns the next pass

Two levers, in order of confidence:

- **Fold the weapon, not the operator.** Exempt the arm chains from
  `contactFold.scale` at `src/weapon-presentation.ts:6332` (fold the model
  root, leave the authored arm root at presentation scale). This restores the
  14% of reach the lane's screen-space contract assumes, and it matches the
  intent: the fold exists to tuck the *weapon* against cover. It is a
  structural change to how the fold applies and it repaints every contact pose,
  so it needs a visual review pass and a re-run of the contact/anatomy gates —
  it is not a change to make unreviewed against a cut.
- **Let the direction search look toward the eye.** Every direction family the
  search samples (`initialDirection`, `anatomicalDirection` with its +0.31
  camera-back component, and `cameraDown`) sits at or behind the socket's depth.
  Moving the shoulder *toward* the eye magnifies the same metres into a larger
  screen offset — which is exactly the mechanism the existing HF-413 comment
  identifies when it explains why pure camera-down made a pose worse. A fourth
  arc toward `cameraDown - cameraBack` is bounded and is measured by this gate,
  but it must be paired with a near-plane guard on the shoulder joint, and
  HF-413 already records one attempt at assuming a direction that regressed the
  reading. Measure, do not assume.

## 3. `tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts` — the missing livery identity

The spec failed in setup at `expect(designIds.size).toBe(WEAPON_IDS.length)`,
20 against 21. `crimson-flamethrower` is a **HF-334 livery** of `flamethrower`
(`WEAPON_LIVERY_ALIASES`, `src/weapon-model.ts`): it reuses that weapon's GLB
and ships no second authored delivery, so it is in no family spec and had no
explicit entry. The spec has been red in setup since crimson joined the roster —
at Lane W's base and at the PASS 85 publish head alike — which is why the stale
`cameraNear: 0.08` pin survived unnoticed here.

**The value was read, not derived and not invented**
(`crimson-flamethrower-runtime-identity.json`, live snapshot, installed Chrome,
WebGPU, gun-range):

| weapon | `weaponModelId` | `importedModel.source` |
|---|---|---|
| `flamethrower` | `m2-pressure-wand-twin-tank-v1` | `.../pass65-firearms/flamethrower/flamethrower-fp-lod0.glb` |
| `crimson-flamethrower` | **`pass65-crimson-flamethrower-project-original-v1`** | **`.../pass65-firearms/flamethrower/flamethrower-fp-lod0.glb`** |
| `explosive-crossbow` | `pass65-explosive-crossbow-project-original-v1` | `.../pass65-crossbow/pass65-crossbow-fp-lod0.glb` |

It is **not** `m2-pressure-wand-twin-tank-v1`: `instantiateWeaponAsset()`
resolves identity from the node tagged `pass65-weapon-<id>`, the shared GLB
carries only the flamethrower's tag, so crimson falls through to
`pass65-<id>-project-original-v1` — the same shape as the crossbow precedent,
and the reason this stays a *uniqueness* contract rather than two weapons
sharing one identity.

The livery also reports its **donor's** asset URL with
`importedModel.weapon` still `crimson-flamethrower`, so `expectedAssetSource()`
gained a livery-donor branch. `weaponFinishId`
(`crimson-flamethrower-project-original-pbr-v1`) and `firstPersonSource`
already match the generic rules and are unchanged.

## 4. Static checks

`npx tsc --noEmit` → **0**.

Focused vitest (never the full suite) — `src/hf413-arms-handedness.test.ts`,
`src/weapon-presentation-anatomy.test.ts`, `src/viewmodel-framing.test.ts`,
`src/pass69-3-authored-near-plane-catalog-runner.test.ts`,
`src/presentation-prewarm-contract.test.ts`:

**4 files / 74 tests pass, 1 fails, and the failure is pre-existing and not
this branch's.** `presentation-prewarm-contract` →
*"keeps continuous endurance telemetry allocation-light"*, at
`expect(enduranceHealth).not.toContain('snapshot()')`. The assertion greps the
SOURCE TEXT of `src/legacy-main.ts` between `function sampleEnduranceHealth(`
and `const debugWindow = window`, and the token it matches is a **doc comment**,
not a call:

> `* \`snapshot()\` rebuilds the whole operator report (every bone chain in the`

Counted in that region at three refs on this machine:

| ref | occurrences of `snapshot()` |
|---|---|
| `75a4e508` (Lane W base) | **0** |
| `c75c452f` (PASS 85 publish head) | **1** |
| `HEAD` (this branch) | **1** |

Introduced by Lane Y / HF-412 and **shipped in PASS 85**; nothing in this branch
touches that region. The contract's intent — allocation-light telemetry — is not
violated; the grep is matching prose. Left for its owner rather than silently
edited, exactly as the HF-410 prep left it. Two honest repairs exist and both
belong to Lane Y or to whoever owns the verifier: reword the comment (drop the
backticked parens), or teach the assertion to strip comments before grepping —
the latter removes a false positive rather than weakening the check, and would
need its own evidence record under the regression policy.

`npm run qa:pass85:arms-handedness` (the static GLB gate) was not re-run: this
branch changes no glTF and no authored node transform, and the prep measured it
`pass`, 0 violations, on the same tree.

## 5. The pass69-3 run — the setup defect is fixed and proven; the run still does not finish

```
QA_EXTERNAL_PREVIEW=1 QA_PREVIEW_PORT=4196 PASS73_NATIVE_WEBGPU=1 \
  PASS69_3_NEAR_PLANE_RENDERER=webgpu \
  npx playwright test tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts --project=chromium
```

**What is now proven:** the run gets **past line 993**
(`expect(designIds.size, 'one exact authored design identity per canonical
weapon').toBe(WEAPON_IDS.length)`) and into the test body — it reaches
`deploy()` at line 1002, boots the arena and starts the solo match. The 20-vs-21
setup failure this job existed to fix is **gone**, and with it the reason the
spec could never reach a near-plane assertion at all.

**It still does not reach one.** Both attempts (the run plus Playwright's retry)
fail at **line 649**, `page.waitForFunction(... matchPhase === 'active')`,
`TimeoutError: 60000ms exceeded` — *before* any weapon is equipped and before
any identity or near-plane assertion runs. The captured page snapshot shows the
game **visibly in the match** — "Gun Range multiplayer arena", "TARGET DRILL",
"SOLO RANGE", a live score/hits HUD — with the round timer already down to
`00:01`, so the app is alive and the round is running out while the probe waits
for a phase string that never reads `active`.

**Claim-state, honestly:** *unverified* whether that is environment or a second
latent defect in this spec. Two facts bound it:

- The HF-410 prep never got past line 960 either, so **nothing on this line has
  ever executed `deploy()`**. There is no prior green run of this spec to call
  this a regression against.
- The box was carrying six lanes, 20+ node processes and a second browser gate
  in the same window, which is the same load the prep blamed for a Playwright
  flake on `pass70-chopper-gunner`.

**Also not equivalent to the harness path**, and this is worth recording rather
than glossing: the run used an **external preview** because the harness's own
`webServer` (`scripts/qa/playwright-web-server.mjs`, `timeout: 180000`) does
`build()` **plus** `stage-release-topology.mjs`, and on this loaded box that
staging did not finish inside 180 s — two separate attempts died there, the
first leaving `dist/` with `channels/` and no root `index.html`. So the preview
served the **candidate build without the staged channel topology**. The spec
requests `?release=latest`, which is the candidate, and the page snapshot
confirms it loaded and played — but this is **not** the byte-exact topology the
committed harness serves, and no near-plane number should be quoted from it.

**Owed to the next runner, in order:** re-run on a quiet box through the
committed harness (no `QA_EXTERNAL_PREVIEW`), giving the build+stage step room
to finish; if `deploy()` still times out at line 649 with the match visibly
running, the next question is what `snapshot().matchPhase` actually reports on
gun-range solo, which is one `page.evaluate` away.

`docs/evidence/pass86/gate-repairs/pass69-3-run.txt` is the head of that run.
