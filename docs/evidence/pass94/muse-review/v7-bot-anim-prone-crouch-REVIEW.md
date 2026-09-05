# Muse independent review — v7-bot-anim-prone-crouch (HF-509)

Scope: `docs/evidence/pass95/bot-anim-prone-crouch/REPORT.md` + full diff
`origin/contrib/dave-gaming-pc/claude/pass93-candidate...HEAD`
(`452d7aba...988cfd39`), read-only. No builds, no browsers, no GPU.
Lane brief: third pair of eyes on what the Opus verifier did NOT check —
(a) per-frame cost/allocation, (b) gameplay coupling of the prone cap,
(c) coverage across presentation paths. Verifier issues V1–V10 re-checked
statically below only where they intersect a/b/c or a verdict blocker.

Claim-states: **[VERIFIED]** = read in tree. **[COUNTED]** = counted call sites
/ allocations from source. **[INFERENCE]** = reasoned, not measured.

## (a) Per-frame cost and allocation

### A1. Delta is ~+7 temp objects per crouched bot per frame; no new matrix recompose — NOT the hitch driver

**[COUNTED]** `src/operator-model.ts:944-975` (new laterals block) +
`src/operator-model.ts:794-815` (`plantCrouchLeg` additions) +
`src/ik.ts:41-51` (`solveTwoBoneElbow` allocates 4 `Vector3` per solve: return
+ `toTarget`/`perpendicular`/`projection` scratch).

Added temps per crouched bot per frame, all short-lived:
- `applyStancePose`: `bodyOrigin` (1) + `leftFootTarget.clone()` (1) +
  `rightFootTarget.clone()` (1). `bodyRotation`/`forward`/`right`/foot targets
  already existed pre-change (verified against
  `origin/.../pass93-candidate:src/operator-model.ts` lines ~770-950: same two
  `getWorldPosition`, same `bodyRotation`/`forward`/`right`, same
  `visual.updateWorldMatrix(true, true)`).
- `plantCrouchLeg` ×2 legs: `toTarget` clone (1) + `hip.clone()` for the
  constrained target (1) each = 4. `clampFootDistanceM`/`minimumFootDistanceM`
  are pure arithmetic, zero allocation **[VERIFIED]** `src/operator-leg-pose.ts:120-148`.
- Prone-blend > 0.001 only: 6-entry `legBindPose` slerp loop, zero allocation
  **[VERIFIED]** `src/operator-model.ts:990-992`.

Matrix recompositions: unchanged in count. Pre-change already did per
crouch-active bot: 1× `visual.updateWorldMatrix(true, true)` (full-subtree
recompose — the repo's known hitch gotcha) + per leg 1× `upper.updateWorldMatrix`
+ 2× `orientBoneTowardWorld` internals (`bone.updateWorldMatrix(true,true)` +
  `bone.updateWorldMatrix(false,true)`) + 1× `foot.updateWorldMatrix` ≈ 13
recompositions/bot/frame. The lane adds zero `update*` calls; `slerp` writes
quaternions in place without recomposing (recompose happens once downstream in
the normal skin update). Prone bots (plant withdrawn) actually do LESS matrix
work than before: they skip both `plantCrouchLeg` calls entirely.

Scale: hosted bots are 2–4 per map (changelog contract), not dozens. Worst case
4 crouched bots ≈ +28 temps/frame against a baseline that already allocates
~50+/bot/frame in this function alone. Real but dwarfed by the existing
`updateWorldMatrix(true, true)` cost this lane does not touch.

Why it matters: the owner's co-reported frame hitch cannot be pinned on this
lane — the dominant term (full-subtree recompose per bot per frame) is
bit-identical before/after.

Smallest fix (optional hygiene, not a blocker): hoist the six temps in
`applyStancePose`/`plantCrouchLeg` to module scratch (the file already keeps
scratch at `src/operator-model.ts:2527-2535` for the wrist path) or early-out
when `crouchPlantAuthority` returns 0 before snapshotting foot targets (already
done) — nothing further required for ship.

### A2. `countOtherProneBots` is O(B²) with in-loop mutation — order-dependent admission

**[VERIFIED]** `src/legacy-main.ts:21092-21098`: `resolveBotStance` is called
inside the per-bot `updateBots` loop with `proneOccupancy:
countOtherProneBots(bots.values(), bot)`, and `bot.stance` is assigned in place
before the next bot is evaluated. `countOtherProneBots` itself is O(B)
**[VERIFIED]** `src/bot-stance.ts:122-131`. Total O(B²)/frame; with B ≤ 4 this
is trivially cheap (no perf finding), but iteration order decides who gets the
two slots: earlier map-order bots see stale-later stances, later bots see
already-updated earlier stances. Combined with the 700 ms hold
(`src/bot-stance.ts:142-153`), a freed slot mid-hold is invisible until holds
expire, and two bots flipped in the same frame can both be admitted against a
stale count.

Smallest fix: snapshot all stances (or all occupancies) once before the loop in
`updateBots` and pass the snapshot value per bot; single-site change in
`src/legacy-main.ts:21092`, no signature change to `bot-stance.ts`.

## (b) Gameplay coupling of MAX_PRONE_BOTS_PER_MAP = 2

### B1. Refusing prone changes hitbox, authority, speed, eye height — correctly coupled, but it IS a gameplay change

**[VERIFIED]** `src/art-kit.ts:1970-1973` (`poseOperator` applies
`hitProxyRootTransform(stance)` to the visible proxy root every pose);
`src/remote-hit-admission.ts:38` (admission rewinds against `target.stance`);
`src/legacy-main.ts:7015,7021,35413,35527,35541` (shot resolution uses
`hitProxyZoneCentre(zone, stance)`); `src/bot-stance.ts:161-180`
(`botStanceSpeedCap`/`botStanceEyeHeightM` switch on stance via the shared
`movementProfile`); `src/legacy-main.ts:21105` (host caps bot speed by stance);
replication carries `stance: bot.stance` (`src/legacy-main.ts:8826,21004,20333`).

So a wounded (hp ≤ 25) bot denied prone keeps a crouch hitbox/authority
profile, crouch speed cap, and crouch eye height while its hp says "should be
prone". Visual, authority, and movement agree with each other (no
collider/visual mismatch — the forging invariant holds), but the third-prone
bot is a bigger, taller, faster target than the same bot would be uncapped.
That is the owner-asked rule working as specified, not a desync — but it needs
owner sign-off as a gameplay tradeoff, not just a cosmetic fix, because low-hp
bots 3+ are now easier to hit than before.

Smallest fix: none in code; record the tradeoff in the lane evidence and confirm
with Dave. If he wants equal survivability, scale the refused bot's speed cap
toward prone while keeping the crouch silhouette — one line in
`resolveBotStance` callers, explicitly NOT done here without approval.

### B2. CONFIRMED — over-quota arrival never drains (verifier V8 is correct)

**[VERIFIED]** `src/bot-stance.ts:133-140`: `admittedBotStance` returns `'prone'`
unconditionally when `context.stance === 'prone'`. A roster arriving with 3+
prone (guest mirroring a pre-cap host snapshot, or `adoptMirroredHostAuthority`
on host succession — both paths write `bot.stance` directly from snapshots at
`src/legacy-main.ts:20435,8821-8822`, bypassing `admittedBotStance`) stays 3+
forever: each bot excludes itself from its own count, so every one of them
observes occupancy ≤ 2 and holds. The end-to-end test only drives the funnel
from stand (`src/bot-stance.test.ts` six-bot test), never the pre-prone arrival
state, so it cannot catch this.

Smallest fix: in `admittedBotStance`, when `context.stance === 'prone'`, admit
only if this bot ranks within the cap under a stable order (e.g. admit if
`proneOccupancy < MAX` as computed excluding self — which already forces the
3rd+ holder out — instead of returning early). One-branch change at
`src/bot-stance.ts:137`; add a test that seeds 3 bots prone and ticks once.

### B3. Contested-cap flip-flop is bounded but order-biased

**[VERIFIED]** cap applied before hysteresis (`src/bot-stance.ts:147`), so a
refused bot commits to crouch for `BOT_STANCE_MIN_HOLD_MS` 700 ms and cannot
buzz the slot every frame — good. Residual: with A2's in-loop mutation, which
two bots hold slots is map-iteration order, not lowest-hp or first-wounded.
No animation-commit hazard found: stance blends are continuous
(`crouchBlend`/`proneBlend` lerp in `applyStancePose`), and death resets to
stand (`src/bot-stance.ts:142-143`, `src/legacy-main.ts:20689-20690`), so a
denied bot cannot be stuck mid-prone-clip — it just blends back to crouch.

Smallest fix: same snapshot fix as A2; tie-break by `(hp, continuity)` if Dave
wants determinism beyond map order.

### B4. No coupling to cover selection, heal, or revive found

**[VERIFIED]** `chooseBotIntent` (`src/bot-ai.ts:258-274`) reads
`health/hasLineOfSight/distanceToPlayer`, never `stance`; waypoint/cover
scoring (`src/bot-ai.ts:130-253`) is stance-free. Health regen paths
(`src/local-health-regen.ts`, `src/remote-health-authority.ts`) contain no
stance/prone/crouch references **[COUNTED]** (grep, zero hits). Respawn resets
stance to stand (`src/legacy-main.ts:20242-20243,20689-20690,36773`). The cap
therefore does not strand healing, revives, or cover choice.

## (c) Coverage across presentation paths

### C1. Single funnel — third-person, guest replica, killcam/spectator all covered

**[COUNTED]** every 3D operator pose flows through `updateRiggedOperator`
(`src/operator-model.ts:2382`) via `poseOperator` (`src/art-kit.ts:1944-1982`).
Call sites: host bots `src/legacy-main.ts:21150`, guest replicas
`src/legacy-main.ts:20436` (stance from `hostedBotSnapshotStance`, replicated
like a peer), debug override `src/legacy-main.ts:21009`, remote players
`src/legacy-main.ts:12238-12241/27402`, respawn/recovery poses
`src/legacy-main.ts:35359,36175,36785`. Killcam/spectator have no separate
operator path (no killcam/spectator operator construction found in `src/` —
they re-drive the same scene rigs), so the lateral-separation + knee-limit +
plant-withdrawal + settle corrections apply everywhere the diagnosed clips
(`Run_Shoot` crouch-walk, `Walk` prone-crawl per REPORT §2) can play. Both LODs
share the funnel: `lod0`/`lod1` differ only in asset URL
(`src/operator-model.ts:85-86,679-688`), bone lookup is by name, bind capture
is post-build (`src/operator-model.ts:2246-2252`).

### C2. GAP — hand-built runtimes silently skip the settle

**[VERIFIED]** `legBindPose` is optional (`src/operator-model.ts:466-467`) and
only populated in `createRiggedOperator` (`src/operator-model.ts:2246-2252`).
The Gun Range training dummy hand-builds its runtime (comment at
`src/operator-model.ts:1993-1996`, `src/additional-maps.ts:1639-1643`), so
`runtimeState.legBindPose ?? []` (`src/operator-model.ts:991`) is empty there:
prone keeps the standing leg cycle (mechanism 4 untreated) and crouch gets only
the lateral/knee half of the fix. Silent by design ("degrade to no settle
rather than crash"), but it is an untreated presentation of the exact reported
defect.

Smallest fix: populate `legBindPose` in the runtime-completion helper that
already backfills the Pass 77 fields (`src/operator-model.ts:1993+`,
`ensureRiggedRuntime`-style fill), or document the dummy as intentionally
excluded. ~10 lines, one site.

### C3. Menu preview never exercises the fix (not a bug)

**[VERIFIED]** `src/ui/operator-preview.ts:308,365` both call
`updateRiggedOperator(model, 0, 'stand')` unconditionally; stance-card text is
2D. The fix is present but unreachable there. No change needed; do not add
stance posing to the preview to "cover" it.

## Verifier V1–V10 spot-checks (static only, where they touch a/b/c or ship)

- V8 (prone latch): CONFIRMED, see B2.
- V9 (one-frame plant→settle step at `PLANT_HANDOVER_PRONE_WEIGHT`):
  PLAUSIBLE from source — `crouchPlantAuthority` is a boolean gate at prone ≥
  0.08 (`src/operator-leg-pose.ts:199-204`) while `legSettleWeight` is already
  0.75 there (`src/operator-leg-pose.ts:284-288`, `smoothstep01(1)=1`). The
  report's "hand over without a step" (REPORT §3) is therefore a claim about
  intent, with no bone-distance measurement backing it (REPORT §6 openly marks
  this **[OPEN]**). Smallest fix: ramp `crouchPlantAuthority` down over prone
  0→0.08 (mirror the settle smoothstep) instead of a hard cut; or delay full
  settle until just past handover.
- V1/V2 (0.18/0.36 from hit proxies vs ±0.1206/0.2412 m from the GLB; equal
  0.36 m segments vs 0.4331/0.5110 m; 134° vs ~116°): could not re-measure
  without asset tooling in this read-only pass, but the module header itself
  states the numbers are "read off AUTHORITATIVE_HIT_PROXIES"
  (`src/operator-leg-pose.ts:61-66`) — i.e. collision boxes, not the rig — so
  the derivation basis V1 disputes is admitted in-tree. If V1's GLB numbers are
  right, `proneLegSettleFloor`/`PRONE_LEG_SETTLE_WEIGHT` margin and every
  `0.36`-based test expectation need re-derivation from bind bone positions.
  Recommend one authoritative measurement (bind hip/knee/ankle from
  `pass65-third-person-operator-lod0.glb`, both LODs) before ship.
- V3 (tautological falsifier), V4 (uncontrolled before/after: differing
  `rootPosition`/yaw, stand-idle 92.97% pixels differ), V5 (3.4 m first-person
  occlusion), V6 (`--ignore-gpu-blocklist`, `PASS73_NATIVE_WEBGPU` unset):
  consistent with what I read (`scripts/qa/capture-hf509-bot-legs.mjs:48,71`,
  receipt `staged`/`sample` shape), not independently re-run here; collectively
  they mean no pixel or bone-level proof of the leg claim exists in-tree.
- V7 (head SHA not a real object): both SHAs I touched resolve (`452d7aba`,
  `988cfd39` as commits); the report names only its base, so no finding either
  way from this pass.
- V10 (no bone-level measurement): CONFIRMED — REPORT §6 marks it **[OPEN]**
  itself.

## Verdict: SHIP-WITH-FIXES

Three reasons:
1. **Gameplay latch (B2).** Over-quota prone arrival never drains — the one
   defect here that changes match state for a whole match, not just pixels.
   One-branch fix + seeded test.
2. **Continuity + derivation gaps (V9 + V1/V2).** The handover is a boolean cut
   against a 0.75 settle with no bone-distance proof, and the constants' basis
   (hit proxies vs rig) is disputed with the module itself citing proxies.
   Ramp the plant authority and take one authoritative GLB bind measurement;
   re-derive `proneLegSettleFloor`/test spans from it.
3. **No controlled visual proof (V4/V5 + V10, REPORT §6 [OPEN]).** Ship the
   logic after fixes 1–2, but do not claim the tangle visibly fixed until a
   same-pose controlled capture (or bone-level trace) exists; the current pairs
   differ in staging and the harness occludes the legs it judges.

Not blockers: per-frame cost (A1 — no new recompose, delta dwarfed by baseline;
bot count 2–4 keeps O(B²) trivial), presentation coverage (C1 — single funnel
covers third-person/guest/LOD; C2 dummy gap is bounded and fixable in ~10
lines), cover/heal/revive coupling (B4 — none found).

Suggested fix list, smallest first: `src/bot-stance.ts:137` drain rule + test;
`src/operator-leg-pose.ts:199-204` ramp plant authority; `src/operator-model.ts:1993+`
backfill `legBindPose` for hand-built runtimes; `src/legacy-main.ts:21092`
snapshot occupancies pre-loop; GLB bind re-measurement; controlled capture.
