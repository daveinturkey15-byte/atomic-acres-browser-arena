# PASS 94 - gameplay feel lane (HF-497)

Machine `dave-gaming-pc`, harness Claude Code (Opus 5).
Worktree `C:/Users/david/projects/aa-claude-feel`,
branch `contrib/dave-gaming-pc/claude/gameplay-feel`,
base `8d6b41f2` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate`).

Owner, ledger HF-497 (2026-09-04 19:20): the remaining asks include "gameplay
feeling good". Earlier, twice: **"the stairs are still sticky to navigate"**
(HITL 1 and HITL 3).

---

## 1. What was actually wrong with the stairs

### 1.1 Why every existing stair gate was green while the owner was reporting sticky

`src/nuketown2-fidelity.test.ts` already walks a standing capsule up and down
both Nuke Town Rebuild flights on the real `CharacterPhysics` against the real
built colliders, and it passes, and it always did.

It passes because its walker commands **a fixed 3.6 m/s step every frame**
regardless of what the previous frame achieved (`walkStandingDetailed`, the
`const advance = Math.min(distance, 3.6 * dt)` line). A walker that cannot lose
momentum cannot measure momentum loss. Every stair gate in the repository asked
*can this flight be climbed*. None asked *what does climbing it cost you*.

### 1.2 The measurement that does ask

`src/stair-traversal-feel.test.ts` runs the **real** loop instead:
`integrateHorizontalVelocity` on the profile `movementProfile` returns for the
contact state the controller actually reported, then `CharacterPhysics.move`,
then the exact post-contact velocity rules `src/legacy-main.ts` applies. The
velocity carried between frames is the whole measurement.

Both houses, interior flight, both directions, walking and sprinting, 120 Hz.

### 1.3 The finding

**Descending, the controller reported NOT GROUNDED on 74 of 125 frames - 59 %
of the descent.**

Every one of those frames put `movementProfile` on its airborne branch:

|               | grounded | airborne |
| ------------- | -------- | -------- |
| acceleration  | 48 m/s^2 | **10.5 m/s^2** |
| deceleration  | 62 m/s^2 | **2.4 m/s^2** |
| `wantsSprint` | possible | **impossible** (it requires `playerGrounded`) |

That is the sticky. The player is not being blocked - they are being put in the
air two frames in three and handed air control on a staircase, which is exactly
what unresponsive feels like at the stick.

### 1.4 Root cause - VERIFIED

The game clamps a grounded player's vertical velocity to `Math.max(0, v)`
(`src/legacy-main.ts`), so **the desired vertical translation on a grounded
frame is exactly zero**. Rapier runs its snap-to-ground pass only when the
desired translation has a *strictly negative* vertical component; at exactly
zero it is skipped. `enableSnapToGround(0.24)` was configured, enabled, and
never ran on a normal grounded frame. Walking off the nose of a descending
surface therefore left the capsule in free flight until gravity re-acquired the
ground a frame or two later, over and over, all the way down.

### 1.5 The fix - `src/physics.ts`, generic, no arena touched

A **post-solve ground re-acquisition** in `CharacterPhysics.move`. On a frame
that *started* grounded, was not commanded upward, and *ended* ungrounded, the
controller performs one bounded downward `computeColliderMovement` and adopts
it if it lands. Reach:

    groundStickReach(h) = min(snapToGround, h * tan(maximumSlopeClimbDegrees) + groundStickFloor)

- the drop the steepest surface the controller will walk produces over this
frame's horizontal step, capped by the snap distance so it can never pull a
player down a ledge Rapier would not have snapped to anyway. It is derived from
`maximumSlopeClimbDegrees` so the two can never disagree.

**A commanded downward push was measured first and rejected.** It fixed the
descent and cost the climb - the interior walk-up went 155 -> 207 frames -
because a downward component projected onto an up-slope fights the climb. The
re-acquisition cannot do that: a climbing capsule never leaves the ground, so
the branch never runs on an ascent (measured: `groundStickFrames` = 0 on every
ascent, 27-38 on every descent).

### 1.6 Before / after - interior flight, both houses identical to 3 d.p.

Stall frame = the simulation had already reached 30 % of the commanded speed
and the world took it away. Stall run = longest unbroken sequence of those.

| leg          | metric             | before              | after |
| ------------ | ------------------ | ------------------- | ----- |
| down, sprint | ungrounded frames  | **74 / 125 (59 %)** | **0 / 99 (0 %)** |
| down, sprint | stall frames       | 24                  | **0** |
| down, sprint | worst stall run    | 19                  | **0** |
| down, sprint | mean forward speed | 6.312 m/s           | **7.886 m/s** (+24.9 %) |
| down, sprint | frames to descend  | 125                 | **99** (-20.8 %) |
| down, walk   | ungrounded frames  | **74 / 136 (54 %)** | **0 / 135 (0 %)** |
| down, walk   | stall frames       | 4                   | **0** |
| down, walk   | mean forward speed | 5.819 m/s           | 5.818 m/s |
| up, walk     | stall frames       | 3                   | 3 |
| up, walk     | mean forward speed | 4.104 m/s           | 4.090 m/s |
| up, sprint   | stall frames       | 3                   | 3 |
| up, sprint   | mean forward speed | 5.624 m/s           | 5.597 m/s |

The three remaining ascent stall frames are the capsule meeting the 36.0 degree
ramp at its foot and losing forward speed for 25 ms. That is what a stair *is*;
the band tolerates a run of 6 and they never form a run longer than 3. The
ascent mean forward speed of 4.09 m/s against a 6.15 m/s walk is the slope
projection (6.15 x cos^2 36 = 4.02), not a defect.

The "before" column was produced by the same probe against base `8d6b41f2`
before the `physics.ts` change; the "after" column is the shipped gate output,
reproducible with
`STAIR_FEEL_REPORT=1 npx vitest run src/stair-traversal-feel.test.ts`.

An earlier version of the probe reported 7-8 "stall" frames on every ASCENT.
Those were false: the trace read v = 0.26, 0.52, 0.79, 1.05 ... which is
exactly 48 m/s^2 from a standing start. The metric was counting the character
spinning up as the world refusing. A frame now only counts when the simulation
had ALREADY reached stall speed and the world took it away. This is recorded
because the naive metric would have sent a future lane hunting a defect that is
not there.

### 1.7 Agreement with the rooflines lane

`origin/contrib/dave-gaming-pc/claude/nuketown2-rooflines` rebuilds both
exterior flights as timber carpentry (risers 11 -> 17, going 0.42 -> 4.2/16)
but keeps **the single rotated ramp cuboid as the movement authority** and the
treads as presentation, and leaves the run at 4.2 m so the ramp angle is
unchanged. This lane's change is in the controller and touches no arena file,
so the two compose: their carpentry sits on the same ramp this controller now
follows down correctly.

---

## 2. Movement feel - `src/movement-feel.ts`, `src/movement-feel.test.ts`

"Feels good" is not a test, so it is turned into measurable quantities with
stated bands, measured through the shipped integrator.

**Nothing was retuned.** Every shipped value was measured first and every one
already lands inside its band. That is itself the finding: the owner's "sticky"
was never the ground character. The bands exist so a future pass cannot drift
out of the reference class without reddening a gate.

| quantity                         | band          | shipped | source |
| -------------------------------- | ------------- | ------- | ------ |
| time to 99 % top speed, walk     | 0.06 - 0.24 s | 0.128 s | 6.15 / 48 |
| time to top speed, sprint        | 0.06 - 0.24 s | 0.161 s | 8.7 / 54 |
| stop distance (upper bound only) | <= 0.65 m     | walk 0.305, sprint 0.610, crouch 0.105 | v^2 / 2a |
| stop time                        | 0.05 - 0.22 s | walk 0.099, sprint 0.140, crouch 0.075, prone 0.062 | v / a |
| jump apex time                   | 0.20 - 0.33 s | 0.259 s | 6.35 / 24.5 |
| jump apex height                 | 0.62 - 1.05 m | 0.823 m | 6.35^2 / 49 |
| air control (air / ground accel) | 0.10 - 0.36   | 0.219   | 10.5 / 48 |
| crouch / walk speed              | 0.42 - 0.58   | 0.512   | HF-433 recorded why this sits below the reference's ~0.6 and must not be raised |
| sprint / walk speed              | 1.30 - 1.55   | 1.415   | 8.7 / 6.15 |

A stop-**distance** floor was written first and crouch failed it at 0.105 m
against 0.12 m. The band was wrong, not the stance: stop distance is v^2/2a, so
a stance at half the speed stops in a quarter of the distance however much
weight it has. What the floor was protecting - that releasing the stick is a
deceleration, not a snap to zero - is a **time**, and it holds in every stance.
The floor was replaced with `stopTimeSeconds`, which is a stricter statement of
the same intent, not a relaxation.

Two ordering contracts are asserted alongside the bands: every tighter stance
is slower (prone < crouch < ads < walk < sprint), and sprint must still take
*longer* to reach its higher top speed than a walk takes to reach its own, or
sprinting would be strictly better in every situation.

**CLAIM-STATE.** The band *edges* are an INFERENCE from the BO2-class reference
and from what these numbers already produce; they are not measurements of Black
Ops 2. The values inside them are VERIFIED against the shipped
`movementProfile`.

---

## 3. Killstreak tuning (HF-458) - already merged, verified, no change made

Branch `517b7491` is an ancestor of
`origin/contrib/dave-gaming-pc/claude/pass93-candidate`
(`git merge-base --is-ancestor` -> merged). Values read back from
`src/killstreak-tuning.ts` and checked against the HF-458 ledger row in
`docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`:

| owner's number             | constant                             | value | matches |
| -------------------------- | ------------------------------------ | ----- | ------- |
| helicopter rockets 6 -> 12 | `CHOPPER_MISSILE_CAPACITY_AFTER`     | 12    | yes |
| autopilot may spend 6      | `CHOPPER_AUTOPILOT_MISSILE_BUDGET`   | 6     | yes |
| MG damage -25 %            | `CHOPPER_GUN_DAMAGE_MULTIPLIER`      | 0.75  | yes |
| swarm fire +25 %           | `DRONE_SWARM_FIRE_RATE_MULTIPLIER`   | 1.25  | yes |
| swarm move +15 %           | `DRONE_SWARM_SPEED_MULTIPLIER`       | 1.15  | yes |
| piloted drone fire +25 %   | `PILOTED_DRONE_FIRE_RATE_MULTIPLIER` | 1.25  | yes |
| piloted drone move +15 %   | `PILOTED_DRONE_SPEED_MULTIPLIER`     | 1.15  | yes |
| right-click taser, 3 ammo  | `PILOTED_DRONE_TASER_CHARGES`        | 3     | yes |

The lane brief phrased the piloted drone as "+15 % / +25 %"; the canonical
HF-458 ledger row reads "movement speed +15 %, fire rate +25 %", which is what
is implemented. No transposition.

---

## 4. Gates

| gate | result |
| ---- | ------ |
| `npx tsc --noEmit` | clean (exit 0) |
| `src/stair-traversal-feel.test.ts` (new) | 2 passed |
| `src/movement-feel.test.ts` (new) | 6 passed |
| `src/collider-visual-parity-gate.test.ts` | passed |
| `src/legacy-main-size-ratchet.test.ts` | passed |
| `src/nuketown2-fidelity.test.ts` | passed - the pre-existing stair walk stays green under the controller change |
| `src/nuketown-traversal.test.ts` | passed |
| `src/house-navigation.test.ts` | passed |
| `src/gameplay.test.ts` | passed |
| combined run of the eight above | **8 files, 118 tests, all passed** |
| `src/*controller* src/*movement* src/*weapon* src/*killstreak* src/*hud*` | **60 files, 490 passed, 2 skipped, 0 failed** |

No verifier, threshold or assertion was weakened. `CharacterMoveResult` gained
one field (`groundStickApplied`); the `blockedX/Y/Z` and `slopeAdjusted` flags
are deliberately still computed from the **primary** solve, so no existing
caller sees a changed value because of the re-acquisition.

---

## 5. OPEN rows - stated, not hidden

1. **Exterior yard flight not asserted.** It was probed with the same harness
   and produced frames reading -8.1 m/s "backwards". That trace is **not
   trustworthy as a defect**: its route waypoints were hand-authored from
   `NUKETOWN2_YARD_STAIR` rather than derived, and a hand-authored waypoint
   that is overshot flips the measured forward axis and manufactures exactly
   that signature - the decay that follows it is 0.40 m/s per frame = 48 m/s^2,
   i.e. the walker re-accelerating toward a waypoint now behind it. Asserting a
   band on a route I cannot defend would be a gate that passes for the wrong
   reason. The exterior flight is also mid-rebuild on the rooflines lane.
   **Next step:** derive the route from the exported ramp end-points rather
   than by hand, then re-run and either extend the band or open a real row.
   Claim-state: **UNRESOLVED**, not "clean".
2. **Skyline Terminal stairs not probed.** No terminal stair geometry is
   exported the way `NUKETOWN2_STAIRWELL` is, so a defensible route could not
   be derived inside this lane's time box. Claim-state: **UNKNOWN**.
3. **No headless browser run.** The evidence above comes from the real
   `CharacterPhysics` and the real integrator in Node, which is a *stricter*
   instrument than a browser trace for this claim - per-frame velocity and the
   exact contact flags. A 4197 run was not performed: the owner's ComfyUI holds
   this GPU and the lane was already past its time box. Claim-state: the fix is
   VERIFIED at the simulation layer and **UNVERIFIED in-browser**.
4. **Combat feel was not reached** - hit-marker timing, damage-direction
   indicator, headshot feedback, recoil recovery bands, ADS time bands. The
   stair root-cause hunt consumed the box. Nothing is half-changed: no combat
   file is touched by this branch. Claim-state: **NOT STARTED**.

---

## 6. Files changed

| path | change |
| ---- | ------ |
| `src/physics.ts` | `groundStickFloor` config, `MAX_WALKABLE_SLOPE_TANGENT`, `groundStickReach()`, the post-solve ground re-acquisition in `move()`, `groundStickApplied` on the result |
| `src/movement-feel.ts` | new - `MOVEMENT_FEEL_BANDS`, `STAIR_FEEL_BANDS`, `measureTimeToTopSpeed`, `measureStop`, `measureJumpApex` |
| `src/movement-feel.test.ts` | new - the feel contract |
| `src/stair-traversal-feel.test.ts` | new - the real-loop stair gate |
| `docs/evidence/pass94/gameplay-feel/REPORT.md` | this file |

No arena file, no renderer file, no render pass and no HUD file is touched.
