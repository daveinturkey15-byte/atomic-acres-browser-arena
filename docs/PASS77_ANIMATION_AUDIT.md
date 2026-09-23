# Pass 77 — operator rig and animation audit (HF-375)

Owner finding: *"every bot and player model should have good rigs and animations,
differentiated by skin"*, shared alongside a reference about generating
animation/rig work, including generating reference video locally and describing
it into an implementation.

## 0. Reality check on the reference, stated plainly

**The generate-reference-video-then-describe-it workflow cannot be executed in
this repository or this environment. Nothing in this pass pretends otherwise.**

- There is no video-generation, video-understanding, or motion-extraction model
  available to this environment. No such dependency exists in `package.json`, no
  such service is reachable, and adding one would be an external-asset pipeline.
- Even with reference footage, the output would have to become keyframes on the
  canonical 62-joint skeleton, exported to GLB, digest-pinned into
  `assets.manifest.json`, and passed by `scripts/qa/verify-asset-provenance.mjs`
  (which recomputes sha256 for every manifest-declared path) plus the production
  asset gate in `.agents/skills/atomic-acres-production-asset-governance`. That
  gate requires editable `.blend` source or a licence-vetted source package, with
  source/export/runtime digests and provenance records, for every delivery.
- The honest path to new clips here is Blender authoring against the existing rig
  (the pattern `scripts/blender/create-pass65-third-person-operator.py` already
  follows), re-export, re-pin, re-review. That is art work, not code work.

**What this pass does instead:** fixes the animation *system*. Every defect below
is a code defect, and every one of them is visible in play without a single new
frame of authored motion. The measurements needed to fix them were recovered from
the existing asset, not invented.

## 1. What exists today

> Line numbers below are a snapshot taken while writing this audit. Several of
> the cited files were being edited by other lanes in the same session, so trust
> the **symbol names** — they are the stable reference.

### 1.1 The authored corpus is 24 clips; the runtime binds 13

`RIGGED_OPERATOR_RUNTIME_ACTION_NAMES` (`src/operator-model.ts:279`) binds:

```
Idle_Gun_Pointing, Idle_Gun, Idle_Gun_Shoot, Walk, Run_Shoot, Run,
Gun_Shoot, HitRecieve_2, HitRecieve, Death, Punch_Right, Kick_Right, Wave
```

The source asset carries 24 (verified by reading the animation list out of
`public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf`). The
**eleven unbound** clips are:

```
Idle, Idle_Neutral, Idle_Sword, Interact, Kick_Left, Punch_Left,
Roll, Run_Back, Run_Left, Run_Right, Sword_Slash
```

`Run_Back`, `Run_Left` and `Run_Right` matter enormously — see §2.2. The binding
budget is deliberate (binding every track of every clip at spawn is a
multi-hundred-millisecond main-thread task, per the comment at
`src/operator-model.ts:273`) and `src/operator-appearance-catalog.test.ts:39`
caps the bound set at 14. Any expansion must be paid for, not assumed.

### 1.2 Every skin is animated identically

`createOperatorSkinCatalog` (`src/operator-skin-catalog.ts`) *requires* every
skin to declare the same rig contract as `default`
(`pass65-third-person-operator-family-v1`, 62 joints, 24 clips) and throws
otherwise. `OPERATOR_SKIN_MODEL_URLS` (`src/operator-model.ts:328`) swaps the
mesh only. **There is currently zero per-skin animation differentiation of any
kind** — same clips, same timings, same posture, same everything.

### 1.3 The blend model

`switchBaseAction` (`src/operator-model.ts:1300`):

```ts
next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.14).play();
previous?.fadeOut(0.14);
```

So there *is* cross-fading, but it is a **single hard-coded 0.14 s for every
transition** — idle→run, run→idle, anything→death — and nothing constrains the
combined weight while two fades overlap. Interrupting a fade leaves a third
partly-faded action in the mixer with no bound on how many accumulate.

### 1.4 Clip selection is a scalar-speed ladder

`updateRiggedOperator` (`src/operator-model.ts:1494`, ladder at `1516`):

```ts
const next = stance !== 'stand'
  ? 'Idle_Gun_Pointing'
  : speed > 3.2 ? 'Run_Shoot' : speed > 0.18 ? 'Walk' : 'Idle_Gun_Pointing';
```

Two consequences, both visible in play:

- **Crouched or prone movement plays the IDLE clip.** A crouched operator moves
  at 3.15 m/s (`movementProfile`, `src/gameplay.ts:63`) while standing perfectly
  still and sliding along the floor.
- Standing locomotion is a two-rung ladder with a hard threshold at 3.2 m/s.

## 2. Measured defects

### 2.1 Foot sliding: nothing rescales playback, ever

No call site sets a `timeScale` on a locomotion action. `mixer.update(dt)` is
called with real time, so every clip always runs at its authored cadence.

`scripts/blender/measure-pass77-operator-locomotion.py` (new, in this pass)
recovers the ground speed each clip was authored for, by forward-kinematicking
the ankle bones out of the source glTF and taking the median backward ankle
velocity over the contact phase — the speed at which a planted foot genuinely
stays planted:

| Clip | Duration (s) | Authored ground speed (m/s) |
|---|---|---|
| `Walk` | 1.3333 | 1.3416 |
| `Run` | 0.8 | 3.0832 |
| `Run_Shoot` | 0.8333 | 3.0832 |
| `Run_Back` | 0.8333 | 3.1215 (backward) |
| `Run_Left` | 0.8 | 3.0856 (left) |
| `Run_Right` | 0.8 | 3.0856 (right) |

Against the authored movement speeds in `src/gameplay.ts:63`:

| Situation | Real speed | Clip played | Clip's authored speed | Slide |
|---|---|---|---|---|
| Walking (hip fire) | 6.15 m/s | `Run_Shoot` | 3.08 m/s | **+100 %** |
| Sprinting | 8.7 m/s | `Run_Shoot` | 3.08 m/s | **+182 %** |
| ADS move | 4.05 m/s | `Run_Shoot` | 3.08 m/s | +31 % |
| Just under the ladder threshold | 3.19 m/s | `Walk` | 1.34 m/s | **+138 %** |
| Crouch move | 3.15 m/s | `Idle_Gun_Pointing` | 0 m/s | **infinite** |
| Bot patrol | 5.85 m/s | `Run_Shoot` | 3.08 m/s | +90 % |

This is the single largest contributor to "the animation looks bad". The feet
never touch the ground the body is actually crossing.

### 2.2 Bots moonwalk

`chooseBotIntent` returns `strafe-left` / `strafe-right` / `retreat`
(`src/bot-ai.ts:19`), and `src/legacy-main.ts:18493` drives bots sideways at
4.05 m/s and backwards at 4.65–5.85 m/s. But `poseOperator` takes a **scalar**
speed, so a bot moving backwards or sideways plays a forward run. The three
authored directional clips that would fix this exist in the asset and are not
bound (§1.1).

### 2.3 Aim pitch is received and thrown away

`poseOperator` (`src/art-kit.ts:1813`) declares its aim parameter as
`_aimPitch = 0` and never reads it. `src/legacy-main.ts:24128` passes the real
replicated `renderedSnapshot.pitch` into it; every bot call site
(`17889`, `18369`, `18528`) passes a literal `0`. `_phase` and `_blend` are
dropped the same way.

Result: bodies always aim at the horizon. An operator shooting up a stairwell or
down off the yacht's superstructure stands level while its bullets leave at 30°.
Nothing in the repo applies a spine/chest/neck/head aim offset.

### 2.4 One-shot clips are never released — they stay mixed forever

`playOneShot` (`src/operator-model.ts:1310`):

```ts
action.clampWhenFinished = true;
action.setLoop(THREE.LoopOnce, 1);
action.fadeIn(0.035).play();
```

There is **no `finished` listener anywhere in `src/operator-model.ts`** and no
fade-out. Three.js (`node_modules/three/src/animation/AnimationAction.js:771`)
handles a finished LoopOnce action as:

```js
if ( this.clampWhenFinished ) this.paused = true;
else this.enabled = false;
```

`paused` — not `enabled = false`. The action stays enabled at effective weight 1
and keeps contributing to the mix for the rest of the operator's life. This is
pinned as a passing regression test in
`src/rigged-operator-animation-director.test.ts` ("three keeps a clamped action
mixed forever").

Affected clips: `Gun_Shoot`, `Idle_Gun_Shoot`, `HitRecieve`, `HitRecieve_2`,
`Punch_Right`, `Kick_Right`, `Death`. An operator that has fired once, been hit
once and meleed once is a **running average of three frozen poses and whatever it
is actually doing.** Only `resetRiggedOperator` (respawn) clears it, via
`action.stop()` on everything.

This is very likely the dominant cause of "bots look wrong after their first
firefight".

### 2.5 Hit reactions replace locomotion instead of layering

`reactRiggedOperator` plays `HitRecieve` at full weight as a base-clip one-shot.
A hit therefore erases the run rather than flinching through it — and then never
goes away (§2.4).

### 2.6 Yaw snaps; there is no turn-in-place

Bot and remote yaw is assigned directly — `bot.root.rotation.y = snapshot.yaw`
(`src/legacy-main.ts:7812`, `17858`, `17885`), `= operatorYawToward(...)`
(`18527`, `30820`, `30853`, `30970`). No rate limit, no pivot animation, no
hysteresis. A bot that acquires a target behind it rotates 180° in one frame with
its feet planted.

## 3. Modern-shooter gap list

| Capability | State before Pass 77 | State after |
|---|---|---|
| Per-transition cross-fade durations | ✗ one 0.14 s for everything | ✓ table + per-archetype scale |
| Weights provably sum to 1 through a blend | ✗ | ✓ tested |
| Speed-matched locomotion playback | ✗ always 1× | ✓ measured calibration |
| Synchronised cadence across a blend | ✗ | ✓ one shared stride frequency |
| Directional (strafe/back) locomotion | ✗ clips unbound | ✓ solver supports; needs the binding budget (§5) |
| Additive aim pitch | ✗ parameter dropped | ✓ clamped spine distribution |
| Lean | ✗ | ✓ velocity-driven, clamped |
| Turn-in-place | ✗ instant snap | ✓ hysteresis + rate limit; shuffle needs the lateral clips |
| Hit reactions as an additive layer | ✗ full-weight clip swap | ✓ bounded envelope under 1 |
| One-shots that end | ✗ clamped forever | ✓ envelopes that return to exactly 0 |
| Per-skin differentiation | ✗ none at all | ✓ posture/breath/response/gain (see §4) |
| Crouch/prone locomotion | ✗ plays idle | ✗ still absent — needs authored clips |
| Foot planting to ground / slope IK | ✗ | ✗ not attempted this pass |
| Weapon-specific idles | ✗ (`Idle_Gun*` only) | ✗ needs authored clips |
| Upper/lower body split (aim while running) | ✗ | ✗ needs a bone-mask layer in the runtime |

## 4. Per-skin differentiation — exactly what is and is not per-skin

The catalog forbids the obvious answer: every archetype is animated by the *same*
clips on the *same* skeleton, enforced by `createOperatorSkinCatalog`. A per-skin
clip library needs new authored art and a new rig contract, and is not available.

**Genuinely per-skin** (`src/rigged-operator-skin-animation.ts`, keyed on the
catalog's `archetype`, not on skin id, so a re-skin inherits its movement
identity):

| | `standard` | `explorer` | `symbiote` | `navalops` |
|---|---|---|---|---|
| Preferred idle | `Idle_Gun_Pointing` | `Idle_Gun` (low ready) | `Idle_Gun_Pointing` | `Idle_Gun_Pointing` |
| Spine posture bias | 0 | +0.05 rad | +0.12 rad (hunched) | +0.07 rad (low profile) |
| Aim response | 6 Hz | 7 Hz | 4.2 Hz | 8.5 Hz |
| Breathing | 0.26 Hz / 0.018 rad | 0.32 / 0.026 | 0.19 / 0.031 | 0.22 / 0.013 |
| Turn rate | 3.4 rad/s | 4.2 | 2.4 | 3.9 |
| Hit-reaction gain | 1.0 | 1.25 | 0.6 (plated) | 0.85 |
| Transition scale | 1.0 | 0.86 (quick) | 1.24 (committed) | 0.92 |
| Playback-rate ceiling | 1.75 | 1.9 | 1.5 | 1.75 |

Plus a per-operator idle **phase offset**, hashed (FNV-1a) from
`skinId:operatorName` so six bots of one archetype do not breathe in lockstep and
every peer agrees on the phase. Never `Math.random`.

**Shared by every skin, and stated so nobody claims otherwise:** the clip corpus,
the skeleton, the locomotion calibration measured from it, the blend arithmetic,
the additive maths, and the hit envelope shape.

## 5. What was NOT done, and what it would cost

1. **Binding the three directional run clips.** The solver already handles them
   and the tests already cover them, but binding them is a change to
   `RIGGED_OPERATOR_RUNTIME_ACTION_NAMES` in `src/operator-model.ts`, which this
   lane does not own, and it would take the bound set from 13 to 16 — past the
   `<= 14` cap in `src/operator-appearance-catalog.test.ts:39`. That cap exists
   for a measured spawn-cost reason and must be re-measured, not merely raised.
   Exact instructions are in this pass's wiring notes.
2. **Wiring the director into the runtime.** `src/operator-model.ts`,
   `src/art-kit.ts` and `src/legacy-main.ts` are owned by other lanes this pass.
   The director is deliberately shaped so the wiring is *apply these weights,
   apply these bone offsets* — see the wiring notes.
3. **Crouch/prone locomotion, weapon-specific idles, a proper sprint clip.**
   All need authored motion. The sprint gap is the sharpest: the fastest authored
   clip is 3.08 m/s against an 8.7 m/s sprint, a 2.8× gap that no playback
   multiplier closes. `solveLocomotion` reports that residual as
   `footSlideMps` / `footSlideRatio` rather than hiding it, so the case for the
   art is now a number instead of an opinion.
4. **Ground/slope foot IK.** The two-bone leg solver in `applyStancePose` already
   exists and is used to hold the feet during a crouch; extending it to plant on
   the terrain normal is a follow-up in the rig lane.
5. **Upper/lower body bone-mask split.** The correct way to aim while running.
   It needs a masked additive layer in the runtime mixer, which is an
   `operator-model.ts` change.

## 6. New this pass

| File | Role |
|---|---|
| `scripts/blender/measure-pass77-operator-locomotion.py` | Re-derivable measurement of every clip's authored ground speed |
| `src/animation-blend-graph.ts` | Per-transition cross-fades; weights that sum to 1; monotonic |
| `src/animation-locomotion.ts` | Measured calibration, speed matching, directional blend, slide metrics |
| `src/animation-additive-pose.ts` | Aim-pitch distribution, lean, turn-in-place, breathing |
| `src/animation-hit-reaction.ts` | Bounded additive impulse layer that returns to zero |
| `src/rigged-operator-skin-animation.ts` | Per-archetype movement identity from the skin catalog |
| `src/rigged-operator-animation-director.ts` | The composition: one call per operator per frame |

All seven are pure, deterministic and GPU-free, which is why every rule above is
covered by a test rather than by a screenshot.


---

# Pass 77b — the wiring, and what the running game now does

Everything above described a system that existed and did nothing. Verified
before starting this lane: `animation-blend-graph`, `animation-locomotion`,
`animation-additive-pose`, `animation-hit-reaction`,
`rigged-operator-skin-animation` and `rigged-operator-animation-director` were
imported by **their own tests and nothing else**. Not one frame of the game had
changed. This section records the wiring and the live evidence.

## 7. What was wired, and how the call sites were left alone

`src/rigged-operator-animation-runtime.ts` (new) is the binding layer: a pure
`planOperatorMixer` that decides which clips are mixed, at what weight, and —
the part that matters — which clips must be **released**; plus the three-side
`applyOperatorMixerPlan` and `applyOperatorAnimationPose`.

`updateRiggedOperator` now drives the director every frame. Three inputs the
old signature had no room for are **measured** rather than demanded, which is
why six of the seven `poseOperator` call sites needed no change at all:

- **Direction.** Local-frame velocity is recovered from the operator's own root
  motion (`localGroundVelocity`), using the yaw convention `operatorYawToward`
  establishes. Magnitude still comes from the caller's `speed`
  (`directedGroundVelocity`), which is what keeps the frozen debug presentation
  route — it declares a speed while the operator does not move — working.
- **Yaw error.** Turn-in-place is **presentation only**. The authoritative root
  yaw is never written by the animation system; the visible body lags it on the
  stance pivot (the channel the prone clearance solve already owns) and catches
  up at the archetype's turn rate. Hit registration, replication and bot aim are
  untouched, and the live probe measures that directly.
- **Aim pitch.** `poseOperator`'s `_aimPitch` became `aimPitch` and reaches the
  spine. Bots had always passed a literal `0`; `operatorPitchToward`
  (`src/bot-ai.ts`) now computes it, but only when the bot has line of sight —
  a patrol waypoint is a floor position, and pitching at one would have every
  patrolling bot staring at its own feet.

`switchBaseAction` and `playOneShot` are **deleted**. Their replacements are
the per-transition table and the bounded envelopes.

### The directional clips, without touching the spawn budget

`RIGGED_OPERATOR_DIRECTIONAL_ACTION_NAMES` (`Run_Back`, `Run_Left`,
`Run_Right`) are added to the operator's clip map but deliberately **not** to
`RIGGED_OPERATOR_RUNTIME_ACTION_NAMES`. That list is the spawn-time prewarm
budget, capped at 14 by `operator-appearance-catalog.test.ts` for a measured
main-thread cost; raising the cap without re-measuring would be weakening a gate
to get green. The three are bound lazily by `actionFor` on the first frame an
operator actually moves sideways or backwards. Spawn cost is unchanged, and
`lazilyBoundDirectionalClips` reports what the lazy path cost (observed: 3).

## 8. Live evidence

`scripts/qa/probe-pass77-operator-animation.mjs` — real renderer, real bots, no
overrides in the sampling phase. Receipt and frames:
`artifacts/pass77/operator-animation/`.

| Claim | Measured |
|---|---|
| The director drives the game | 90/90 live bot frames carry `pass77` telemetry |
| Weights sum to 1 | `baseWeightSum` min 1, max 1, over 90 + 80 samples |
| Blending is real, not snapping | 75/90 frames had more than one base layer |
| Bots stop moonwalking | `Run_Back`, `Run_Left`, `Run_Right` all mixed live |
| Spawn budget untouched | 3 directional clips bound lazily, prewarm set still 13 |
| Speed matching | `Walk` at 1.3 m/s → timeScale 0.969, foot slide ratio **0** |
| Residual slide is reported, not hidden | sprint 8.7 m/s → rate clamped 1.75, slide ratio 0.3798 |
| Turn-in-place | peak presentation lag 0.4735 rad, monotonic decay to exactly 0 |
| …and it is presentation only | authoritative yaw moved **0** rad during the decay |
| Aim pitch reaches the spine | 29/80 combat frames non-zero; joint offsets sum to the pitch |
| One-shots end | `Gun_Shoot` mixed for at most 5 consecutive samples, then gone |
| Nothing accumulates | at most 3 actions ever contributing to the mix |

Third-person frames at `third-person-{sprint,walk,idle}.png` show the same
operator in three plainly different poses: full split stride under `Run_Shoot`
at 1.75× playback, a settled `Walk`, and an upright low-ready idle.

### What the live run did NOT show, stated plainly

- **`archetypes: ['standard']` only.** Bots are built by
  `buildOperator(botTeam, 'bot-operator', …, 'neon-purple')` with **no skin id**,
  so every bot is the default archetype today — not just in animation, in
  everything. Per-skin movement identity is real and unit-tested (the four
  archetypes' resting spine postures are ordered and separated by >0.1 rad), and
  it reaches remote players, who are built with `memberOperatorSkinId(...)`. It
  reaches **bots** the moment that one call site passes a skin id. That was left
  alone deliberately: it is an appearance decision, and another lane is mid-pass
  on exactly that colour path (HF-366).
- **Aim pitch magnitude was small** (max 0.0596 rad) because the staged
  firefight was on flat ground at 4 m. The angle is geometrically correct; what
  changed is that it is no longer structurally zero.
- **Hit reactions were never triggered** in the sampled window
  (`maxHitReactionWeight: 0`) — the bots shot the player, not each other. The
  layer is covered by unit test instead: a head impulse peaks between 0.3 and 1
  while locomotion keeps the base at exactly 1.

## 9. Two real defects the evidence caught, that reasoning had not

Both were found by running the thing, and both are now pinned by tests.

1. **Phase seeding read a stopped clock.** `applyOperatorMixerPlan` released
   clips before reading the phase source, and the usual case is exactly the one
   where the phase source is the clip being released — a walk handing its stride
   to a run. `stop()` zeroes an action's clock, so every entering clip was
   silently seeded at frame zero. Phases are now captured before any release.
2. **The telemetry predicate reported bound-but-never-played actions as live.**
   The first live run showed all thirteen prewarmed actions "contributing" at
   weight 1. A freshly bound three action is `enabled` with weight 1 but is not
   in the mixer's active list and writes nothing. `isScheduled() && enabled &&
   weight > 0` is the honest predicate — and `isRunning()` is the opposite
   mistake, because it excludes paused actions, and a clamped finished one-shot
   is precisely a paused action that still writes its frozen pose.
