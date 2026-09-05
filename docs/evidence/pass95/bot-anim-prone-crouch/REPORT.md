# PASS 95 - HF-509: bot crouch / prone leg tangle, and the two-prone-bot cap

Lane: `v7-bot-anim-prone-crouch`
Branch: `contrib/dave-gaming-pc/claude/v7-bot-anim-prone-crouch`
Base: `452d7aba` (candidate 7)
Worktree: `C:/Users/david/projects/aa-v-bot-anim-prone-crouch`
Browser port: 4255. Every browser session headless, installed Chrome, off-screen
(`--window-position=-2400,-2400`), `--mute-audio`, one at a time, under the
machine heavy lock.

Owner (HF-509), verbatim: *"The animations of the bots look pretty strange,
especially when they go prone and or crouch, their legs get tangled up ... we
definitely need to be trying some of the two or three animation techniques I've
provided ... and we should only ever have a maximum of two bots prone on maps."*

Claim-states: **[VERIFIED]** = command run, output quoted. **[MEASURED]** = a
number from an instrument I ran. **[OPEN]** = not proven.

---

## 1. Which of the owner's techniques were used, and why

**[VERIFIED]** Read `C:/Users/david/AppData/Local/hermes/skills/game-development/game-animation-asset-pipeline/SKILL.md`
(v1.2.1) and the animation rows of
`C:/Users/david/AppData/Local/hermes/.akephalos/references/ai-3d-technique-register.md`
(rows 1, 5, 16, 49).

**Rejected, with the reason, because this matters more than what was adopted:**

| Lane | What it is | Why it cannot fix HF-509 |
|---|---|---|
| A - video to skeletal clip (register row 1, `mixamo-llm-mocap`) | Offline GVHMR + Blender retarget | Heavy local GPU/Python dependencies. Produces a clip; the defect is in how clips are POSED at runtime, not in the clips. |
| A2 - text to motion (row 16, `kimodo.cpp`) | Native C++/GGML, SMPL-X out | The skill own runtime-boundary section: both reviewed generators are native binaries with **no wasm/emscripten target and no WebGPU inference path**, so they are offline clip bakeries and `AnimationMixer` stays the runtime. Row 16 **weights licence is recorded as not yet cleared for this jurisdiction**. |
| A3 - realtime planner (row 49, MotionBricks) | Streams the next 0.8-2.1 s | Same native runtime boundary; also emits a 34-joint Unitree G1 robot skeleton, not a humanoid game rig. |
| B - H3 sprite atlas (row 5) | 2D sprite/video | Not a 3D rig at all. |

**Adopted**, from the same skill, the parts that *are* runtime techniques:

1. **Constrained IK foot plant** - register row 16 names an "explicit IK
   foot-lock pass" as the remedy for a skating/incorrect retarget. Applied to the
   existing crouch plant, reusing the `solveTwoBoneElbow` already in `src/ik.ts`
   rather than a second solver.
2. **Procedural pose blending with derived joint limits** - the skill production
   gate list ("no foot sliding, contact penetration, **bone drift**", "no limb
   inversion") becomes a knee-flexion limit and a lateral-separation limit, both
   derived from the rig, both asserted in a test.
3. **Captures are the judge, and they are headless** - the skill Three.js
   adaptation note. A before/after station pair per stance, below.
4. Its warning that **static-matrix freezing and skinned rigs are in tension**
   was honoured: nothing here freezes or exempts a matrix; the settle is a
   quaternion slerp on six bones, evaluated per frame like the pose it replaces.

---

## 2. Diagnosis - four mechanisms, all in `src/operator-model.ts` `applyStancePose`

**[VERIFIED]** by reading the shipped source at `452d7aba`. Full write-up in the
module header of `src/operator-leg-pose.ts`.

1. **The crouch foot targets are the mixer, unfiltered.** `applyStancePose`
   snapshots `footLeft`/`footRight` **world** positions from whatever clip the
   mixer just wrote, drops the hips `0.44 * crouch`, then two-bone-IKs the ankles
   back onto that snapshot. The standing corpus contains `Run_Left`/`Run_Right`,
   whose mid-cycle feet cross the body midline. Plant a crossed pair on a leg
   shortened by 0.44 m and the two shins swap sides. Nothing in the chain ever
   asked whether the left foot was still left of the right one.
2. **No joint limit anywhere.** `plantCrouchLeg` calls `orientBoneTowardWorld`,
   which writes an arbitrary quaternion from a direction. `solveTwoBoneElbow`
   clamps a target onto the reachable sphere at `|upper - lower|`, which for this
   rig equal segments is **zero** - a leg folded flat against itself.
3. **The plant ran through the whole prone transition.** `crouch > 0.001` was the
   only gate, so on a crouch-to-prone move it kept planting ankles onto world
   targets captured before an **81-degree** (`pivotPitch = -1.42 rad`) pelvis
   rotation. The loudest of the four, and the one that matches "especially when
   they go prone".
4. **Prone kept the standing leg cycle.** Prone applied exactly one offset
   (`addLocalPose(chest, -0.025, ...)`). The legs still played a standing
   walk/run, at up to **3.3x** cadence (PASS 94 `cadenceScale` clamp), under a
   body laid down 81 degrees.

**[MEASURED]** live, `after/after-receipt.json`: the crouch-walk station plays
`Run_Shoot` and the prone-crawl station plays `Walk` - both **standing** clips,
confirming mechanisms 1 and 4 from the running game rather than from the source.
Prone `pivotPitch = -1.42`, `pivotHeight = 0.43`, confirming mechanism 3
rotation magnitude.

---

## 3. The fix

New pure module `src/operator-leg-pose.ts` (no THREE, no clocks), wired into
`operator-model.ts` at four points. **Every constant is derived, not tuned:**

| Constant | Value | Derivation |
|---|---|---|
| `OPERATOR_LEG_LATERAL_OFFSET_M` | 0.18 | `AUTHORITATIVE_HIT_PROXIES` leg rows sit at x = +-0.18 |
| `OPERATOR_BIND_LEG_SEPARATION_M` | 0.36 | 2 x the above |
| `MIN_LEG_LATERAL_SEPARATION_M` | **0.12** | one third of bind separation - the leg volumes (0.32 m wide) still overlap 0.20 m, so a knees-together crouch passes, but each centre is unambiguously on its own side |
| `MAX_KNEE_FLEXION_RADIANS` | **2.44** (140 deg) | inside the 135-150 deg human deep-squat band; the shipped 0.44 m crouch drop needs 134 deg |
| `PLANT_HANDOVER_PRONE_WEIGHT` | 0.08 | pelvis has turned about 6.5 deg of its 81 deg - below the 0.12 m threshold worth of target drag |
| `PRONE_LEG_SETTLE_WEIGHT` | 0.75 | beats the algebraic floor `(T - s)/(B - s)` = 0.4286 for T = 0.12, B = 0.36, s = -0.06, with margin for slerp non-linearity; deliberately not 1, so the crawl keeps a quarter of its drag |

1. **Lateral target separation** (`separateLegLateralTargets`) - corrects the
   crouch plant pair about the **body own** origin and lateral axis before the IK
   solve. Mean-preserving, so a stride genuinely shifted to one side stays
   shifted and only the crossing is removed.
2. **Knee limit** (`clampFootDistanceM`) - pulls a too-close foot target out to
   the closest distance a 140-degree knee can reach, before `solveTwoBoneElbow`.
3. **Plant withdrawal** (`crouchPlantAuthority`) - zero once prone weight passes
   the handover, so no world-space plant runs while the pelvis is rotating.
4. **Bind-pose settle** (`legSettleWeight`) - slerps the six leg bones toward
   their captured **authored bind** rotations, ramping to full strength at
   exactly the handover weight so 3 and 4 hand over without a step. Bind legs are
   straight and parallel at 0.36 m, so the blend cannot itself cross.

`legacy-main.ts` is **unchanged in size**: 37,396 lines before and after, the
ratchet `LINE_CEILING`. The occupancy count was hoisted into `bot-stance.ts`
rather than written at the call site.

---

## 4. Prone cap - at most two bots per map

`MAX_PRONE_BOTS_PER_MAP = 2`, `countOtherProneBots`, `admittedBotStance` in
`src/bot-stance.ts`; one call-site field in `legacy-main.ts`.

- A bot that wants prone while two others already are **crouches instead** - it
  still wanted to get small, and standing a wounded bot up would be worse than
  the rule it asked for.
- A bot **already prone keeps its slot**: it is excluded from its own occupancy
  count, so the third bot down can never permanently block itself.
- The substitution is applied **before hysteresis**, so a refused bot commits to
  its crouch for the full 700 ms hold rather than re-asking every frame.
- End-to-end test: six wounded bots run through the same funnel the host uses,
  four ticks; exactly 2 end prone and 4 end crouched.

---

## 5. Tests

`src/operator-leg-pose.test.ts` (21 tests) and 9 new tests in
`src/bot-stance.test.ts`.

The transition sampler is **not a mock of the fix**: it drives the shipped
posture blend (`advanceOperatorPosture`, whose durations come from
`DROP_SHOT_TIMING`) and the shipped correction functions over the same frames the
runtime does, at 120 Hz, across stand-crouch-stand, stand-prone-stand and
crouch-prone-crouch. Only the ankle positions a GPU would produce are modelled,
and they are modelled as the **worst** case the corpus produces (a lateral run
crossed by 0.06 m).

Asserted per frame inside the validity domain (`crouch + prone >= 0.25`): knee and
ankle lateral separation at least 0.12 m, and knee flexion within `[0, 2.44]` rad.
The domain boundary is documented and shared with the settle ramp - below it the
operator is substantially standing, where an authored lateral cross is the clip
doing its job.

A **falsifier** is included: the test named "is a real test: the pre-fix chain
crosses the legs on the same frames" reproduces the pre-HF-509 chain and asserts
it crosses on **every** frame of the asserted domain, so the passing assertions
are known to be measuring something that was actually broken.

---

## 6. Evidence captures

**[VERIFIED]** `node scripts/qa/capture-hf509-bot-legs.mjs --url http://localhost:4255 --label {before,after}`,
headless installed Chrome, one page, off-screen, arena `atomic-acres`, one bot
staged 3.4 m ahead with `placeBotAhead` and frozen with `setBotPresentation`.

- `before/` - built from base `452d7aba` (`git checkout 452d7aba -- src/`)
- `after/` - built from this branch

Five stations each: `stand-idle`, `crouch-idle`, `crouch-walk`, `prone-idle`,
`prone-crawl`. Receipts: `before/before-receipt.json`, `after/after-receipt.json`.

**[MEASURED]** both runs: `backend = "webgpu"`, **0 page errors**, 5/5 stations
captured. Prone stations report `pivotHeight 0.43`, `pivotPitch -1.42` in both.

**[OPEN]** The pixel pair is for the owner eye - I have not run a numerical image
diff, and I did not extract per-frame bone world positions from the running
build, because the debug API exposes no scene accessor and adding one would be
both a legacy-main size cost and the "gate drives a debug backdoor" pattern this
repo already has a gotcha for. The separation numbers in section 3 are from the
pure sampler, not from the GPU.

**[OPEN]** The captures freeze one bot per station via the debug presentation
override. They do not show a live firefight, so they do not by themselves prove
the cap of two prone bots on a real map - that is proven by test only.

---

## 7. Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **[VERIFIED]** exit 0 |
| `src/operator-leg-pose.test.ts` + `src/bot-stance.test.ts` | **[VERIFIED]** 46 passed |
| ratchet + presence probe + 8 animation/bot suites | **[VERIFIED]** 10 files, 190 passed |
| `npm run build` (under lock) | **[VERIFIED]** succeeded, twice (base and branch) |
| `npx vitest run` (full, under lock) | see below |

**Full-run honesty note.** The first full run reported **2 failed / 6272 passed**:

1. `weapon-display-name-contract` - **my fault**: a type name I introduced
   tripped the retired-fictional-label guard. Renamed to `LegPoseAssessment`.
   The guard was **not** weakened, skipped or widened.
2. `audio-music-rotation-runtime` - "Test timed out in 20000ms" on a suite that
   simulates ten ~90 s tracks. It passes on its own; the timeout is machine load
   during a 620-file run, not a regression from this change. **[MEASURED]**
   re-run of exactly those two suites plus the new one: **3 files, 31 tests, all
   passed.**

The second full `npx vitest run` result is recorded in the lane structured
result.
