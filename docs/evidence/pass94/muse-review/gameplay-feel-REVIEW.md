# Muse review — Pass 94 gameplay-feel lane (HF-497)

Reviewer: Meta Muse Spark 1.3 (skeptic). Scope: `8d6b41f2..HEAD` on
`contrib/dave-gaming-pc/claude/gameplay-feel` = 3 commits
(`d1d8fc62` stairs fix, `ffd3505b` feel bands, `ed5c1353` report).
Read: full `src` diff (5 files, only `src/physics.ts` modifies shipped runtime),
`docs/evidence/pass94/gameplay-feel/REPORT.md`, `src/physics.ts`,
`src/stair-traversal-feel.test.ts`, `src/movement-feel.ts`,
`src/movement-feel.test.ts`, plus the exact `src/legacy-main.ts` step the probe
claims to replicate. No builds, no browser, no `src` edits per lane brief.

## What the lane claims (and I accept)

- Root cause VERIFIED by code reading: `src/legacy-main.ts:27043`
  `if (playerGrounded) player.velocity.y = Math.max(0, player.velocity.y)` makes
  the desired vertical translation exactly 0 on grounded frames, so Rapier's
  snap-to-ground (strictly-negative-y gate) never runs. `enableSnapToGround(0.24)`
  configured at `src/physics.ts:211` but dead on flat frames. Plausible and
  consistent with the 59%-airborne descent measurement.
- Fix = post-solve re-acquisition only (`src/physics.ts:600-624`), generic, no
  arena file touched. Rejected alternative (commanded downward push costing the
  climb 155→207 frames) is recorded, not hidden.
- Feel bands retune nothing; shipped values already inside. Open rows (exterior
  flight, Terminal stairs, no browser run, combat feel not started) are stated in
  REPORT §5 with claim-states, not buried.

## (1) Re-acquisition safety on ledges and slopes — VERIFIED safe

Traced `src/physics.ts:70-76,606-607`:
`reach(h) = min(0.24, |h|·tan(50°) + 0.02)`, `tan50° ≈ 1.1918`.

- Numbers: walk step `6.15/120 ≈ 0.051m` → reach ≈ 0.081m; sprint
  `8.7/120 = 0.0725m` → reach ≈ 0.106m; standing `h=0` → 0.02m; any `huge h`
  caps at 0.24 (test pins `groundStickReach(100) == snapToGround`,
  `src/stair-traversal-feel.test.ts:159-163`). A roof edge / gap whose floor is
  farther than ~0.1m below the step cannot be snapped: the probe
  `computeColliderMovement({0,-reach,0})` finds no ground, `computedGrounded()`
  stays false, `grounded`/`groundStickApplied` unchanged. It can never pull the
  player down a ledge Rapier itself would not snap to — cap enforces exactly that.
- Single-attempt property (the important one): the branch requires
  `groundedBefore && !solvedGrounded` (`:606`) where `groundedBefore` is the
  *previous move's* result (`:584,632`). Frame 1 off a cliff: stick attempted,
  fails, `groundedLastMove=false`. Frame 2: `groundedBefore=false` → no second
  attempt. The controller cannot walk down a cliff face one 0.1m grab per frame.
- `desiredDelta.y <= 0` exclusion (`:606`) is the jump guard. Jump sets
  `player.velocity.y = profile.jumpVelocity > 0` (`legacy-main.ts:27038`), so the
  take-off frame and every rising frame carry positive desired-y and skip the
  branch. At the apex the desired-y crosses through zero while `groundedBefore`
  is false (left ground pages ago), so still skipped. Landing needs no stick:
  the primary solve already reports grounded.
- Slope disagreement impossible by construction: reach slope comes from
  `MAX_WALKABLE_SLOPE_TANGENT` derived from the same
  `maximumSlopeClimbDegrees: 50` the controller is configured with (`:65-67`,
  `:212-213`). Unwalkable (>50°) surfaces: the snap's own `computedGrounded()`
  (`:616`) respects the controller's slope limit, so a steep wall below does not
  convert to grounded. Flags `blockedX/Y/Z`, `slopeAdjusted` are computed from
  the primary solve only (`:593-598`, comment `:589-591`), so no existing caller
  sees a changed collision flag because of the rescue — as REPORT §4 claims.
- Claim-state: **VERIFIED** (code trace + bound arithmetic). Residual risk is a
  slow walk off a ≤0.1m lip reading as sticky-grounded for one frame instead of
  airborne — that is the intended trade, identical to what snap-to-ground would
  have done.

## (2) Jump apex, crouch, vehicles, drone/heli — VERIFIED no interaction

- Jump apex: covered in (1). Coyote (`now - lastGroundedAt <= 95`) and jump buffer
  (`legacy-main.ts:27035-27040`) run before `move`; the stick does not touch
  `player.velocity`, only the adopted `allowed.y` on a rescued frame, and rescued
  frames set `grounded=true` which the post-contact rules (`:27123-27125`) treat
  like any grounded frame. No apex hover introduced: apex frames are excluded by
  both guards simultaneously.
- Crouch/prone: `setStance` (`src/physics.ts:298-334`) changes shape and
  autostep (prone disables autostep, `:331-332`) but never touches
  `groundedLastMove` or reach. Reach uses horizontal distance only, stance
  independent — correct, since the stair drop does not depend on capsule height.
  `requestStance` (`legacy-main.ts:17171`) already forbids stand/prone swaps
  mid-air (crouch excepted); a mid-air crouch keeps `groundedBefore=false`, so no
  stick. VERIFIED.
- Vehicles: no drivable vehicle controller exists on this branch; "vehicle" is a
  ballistics/cover material (`src/ballistics.ts`) and parked-van staging. Nothing
  calls `CharacterPhysics.move` except the on-foot step. VERIFIED by grep: the
  sole gameplay caller is `src/legacy-main.ts:27086`.
- Killstreak drone/heli: piloted-drone velocity comes from
  `pilotedDroneWorldVelocity` in `killstreak-drone-input.ts` integrated by
  `killstreak-runtime.ts` (`:2781-2785`); chopper likewise. While possessed,
  `playerSimulationEnabled()` returns false (`legacy-main.ts:7054-7055`,
  `updatePhysics` early-return `:26941`), so the foot `move` does not run at all
  for the possessed body. The stick cannot steer a drone or gunner. VERIFIED.
- Minor non-finding (no fix asked): `teleportEye` (`:283-290`) and `setStance`
  do not reset `groundedLastMove` (initial `true`, `:193`). After a spawn the
  first falling frame attempts one snap with reach ≈ 0.02m, finds no ground,
  harmless. After a teleport from air to floor the primary solve grounds anyway.
  One wasted `computeColliderMovement` per teleport, no state corruption. Noted
  so a future lane does not "fix" it into a behavior change; smallest fix if ever
  wanted: set `groundedLastMove=false` in `teleportEye` — deliberately NOT
  requested now because it would alter first-frame-after-spawn semantics for zero
  benefit.

## (3) Multiplayer divergence — VERIFIED none introduced

- `move()` is deterministic: no RNG, no clock, no `network.role` branch; both
  roles execute the same `updatePhysics` step (`SIMULATION_HZ=120`) with the same
  Rapier 0.19.3 compat bundle. `groundStickApplied` is a local result field only
  — not written into protocol snapshots (no reference in `killstreak-protocol.ts`
  or movement replication; `blockedX/Y/Z` semantics preserved). Host and guest
  given the same inputs compute the same rescue. It removes a divergence source
  (59% airborne probability mass on descents, where air/ground profiles differ)
  rather than adding one.
- Claim-state: determinism of the function **VERIFIED**; end-to-end host/guest
  frame parity **INFERENCE** (no netcode run in this review, per brief), but
  there is no mechanism in the diff by which parity could worsen.

## (4) The stair test drives the REAL loop — VERIFIED (with one honest delta)

`probeFlight` (`src/stair-traversal-feel.test.ts:53-145`):
`movementProfile({…grounded})` → `integrateHorizontalVelocity` → gravity +
  `Math.max(0,·)` clamp (`:96-97`, identical to `legacy-main.ts:27042-27043`) →
  `physics.move` (`:100`) → post-contact `blocked/slopeAdjusted` rules (`:108-110`,
  identical to `legacy-main.ts:27123-27125` modulo `/DT` vs `/max(dt,0.001)`,
  equal at `DT=1/120`) → forward speed from actual eye displacement (`:112`).
Velocity is carried between frames; nothing commands a fixed step. The old
`walkStandingDetailed` fixed-`3.6·dt` walker critique (REPORT §1.1) is accurate —
  that harness cannot lose momentum by construction.
- Stall metric fix (spin-up no longer counted; only frames where commanded speed
  already exceeded `stallSpeedFraction` count, `:121-127`) is the correct
  correction, and the REPORT admits the earlier 7–8 false ascent stalls. The
  remaining 3-frame ascent stalls at the 36° ramp foot are transition physics,
  tolerated by `maxStallRunFrames: 6`.
- Honest delta, not a defect: the probe omits jump buffering, coyote, water,
  taser, ADS — all irrelevant on a held-forward stair walk, and jump/coyote
  state is correctly *absent* (no jump queued during the probe). Route waypoints
  are hand-derived for the interior flight only; the exterior flight is left OPEN
  (REPORT §5.1 + test comment `:176-188`) rather than asserted on a route the
  author could not defend. That restraint is correct.
- Claim-state: **VERIFIED** real-loop for the asserted interior flights; exterior
  and Terminal **UNRESOLVED/UNKNOWN** as the REPORT itself states.

## (5) Any test loosened — VERIFIED none

`git diff --name-only 8d6b41f2..HEAD`: `REPORT.md`, `src/movement-feel.ts`,
`src/movement-feel.test.ts`, `src/physics.ts`, `src/stair-traversal-feel.test.ts`.
Zero existing test, threshold, or assertion modified. `movement-feel.test.ts`
pins the shipped profile (upper-bound-only stop distance + `stopTimeSeconds`
instead of a distance floor — REPORT §2 admits the first distance floor failed
on crouch at 0.105m vs 0.12m and was replaced; the replacement is a stricter
statement of intent, time-based, and holds in every stance: walk 0.099s, sprint
0.140s, crouch 0.075s, prone 0.062s). Band *edges* are declared INFERENCE from
the BO2 reference class, values VERIFIED against the profile — the claim-state
labeling is honest. `517b7491` confirmed ancestor of base (killstreak-tuning
readback §3 needs no re-review).

## Findings (file:line + smallest fix)

1. None blocking. No `src` change requested by this review.
2. Informational only — `src/physics.ts:283` `teleportEye` leaves
   `groundedLastMove` stale (see §2). Harmless in every traced path. IF a future
   lane wants hygiene: one line `this.groundedLastMove = false;` in
   `teleportEye`. Not requested now; do not bundle it silently into another
   lane's diff.

## Verdict: SHIP

1. The rescue is bounded (`min(snap, h·tan50°+0.02)`), single-attempt
   (`groundedBefore` latch), upward-excluded, and invisible to collision flags —
   it restores the snap Rapier was already configured to do but skipped at
   exactly-zero desired-y, and it cannot convert a real ledge, gap, apex, or
   steep slope into ground.
2. The gate measures the real loop (carried velocity, shipped integrator, exact
   post-contact rules), asserts the previously-unmeasured quantity (momentum
   cost, not reachability), touches no existing test, and labels its inferences
   (band edges, exterior/Terminal/broader-browser rows) as inferences.
3. No cross-controller or multiplayer mechanism: foot `move` is the only caller,
   possession gates it off, drone/heli/vehicles run separate authorities, and the
   new result field is local-only and deterministic across roles.
