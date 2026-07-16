# Ramp Traversal Feel Correction

**Date:** 2026-07-16
**Branch:** `overhaul/house-loot-grenade-pass-22`
**Status:** Verified local checkpoint; canonical Pages remains unchanged pending owner deployment direction.

## Owner Report

Running up the interior stair-like slope felt difficult. The exterior house ramp also required review.

## Reproduction

Both house routes already used a single rotated Rapier cuboid rather than hidden AABB stairs. A deterministic harness reproduced the actual movement loop, including sprint acceleration, gravity, kinematic movement, and blocked-axis feedback.

Before correction:

| Route | Average horizontal sprint | Time to top | Horizontally “blocked” frames |
|---|---:|---:|---:|
| Exterior ramp | approximately 3.32 m/s | approximately 3.13 s | approximately 98.5% |
| Interior ramp | approximately 1.43 m/s | approximately 4.63 s | 100% |

The authored sprint target is 8.7 m/s.

## Root Cause

Rapier projects a horizontal desired delta onto the slope tangent. This legitimate correction changes the returned X/Z components, so `blockedX`/`blockedZ` are expected on a climb. The game loop treated those differences as a wall collision and replaced player horizontal velocity with the smaller applied component every frame. Acceleration then had to fight the same reduction continuously.

The top landings also extended too far downhill over each incline. Their vertical leading face was still autosteppable, but it produced an unnecessary transition lip—especially on the 29.3° interior slope.

## Correction

### Controller response

`CharacterMoveResult` now exposes `slopeAdjusted` when:

- Rapier reports the player grounded;
- applied vertical movement differs from the requested vertical delta;
- horizontal movement was applied.

`src/main.ts` preserves authored horizontal velocity when a blocked axis is part of this grounded slope adjustment. True wall collisions still feed the applied X/Z component back into velocity.

### Landing geometry

Both top landings now overlap their incline by only `0.06` world units. Deterministic geometry assertions require:

- downhill overlap no more than `0.08`;
- calculated transition lip below `0.10`;
- existing floor and side overlaps remain positive;
- every forward/reverse route still traverses with the real standing capsule.

## Measured Result

| Route | Corrected average horizontal sprint | Corrected time to top |
|---|---:|---:|
| Exterior ramp | approximately 7.63 m/s | approximately 1.43 s |
| Interior ramp | approximately 6.61 m/s | approximately 1.08 s |

The steeper interior incline remains physically distinct, but it no longer collapses to walking speed or catches at the landing.

## Regression Coverage

- Deterministic sprint simulation for both ramps and both mirrored houses.
- Forward and reverse capsule traversal for exterior and interior routes.
- Calculated landing-overlap and lip ceilings.
- Chromium test using the real `ShiftLeft + KeyW` path from each ramp foot to its upper landing.
- Browser test waits for both elapsed time and a minimum number of completed frames so software-WebGL throttling cannot create a false movement failure.

## Verification

```bash
npx tsc --noEmit
npx vitest run src/physics.test.ts src/house-navigation.test.ts
npm run verify
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4175 npx playwright test --project=chromium --workers=1 --shard=2/3
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4175 npx playwright test --project=chromium --workers=1 --shard=3/3
QA_BASE_URL=http://127.0.0.1:4175/ QA_RENDER_MODE=compat npm run qa:multiplayer
npm audit --omit=dev --audit-level=high
```

Results:

- deterministic: `176/176` passed;
- Chromium: `27/27` scenarios completed green across the initial run and bounded remaining shards;
- production build: passed;
- release tree: `29` files, zero rejected-candidate files, zero oversized files;
- Performance and Quality rendering budgets: passed;
- multiplayer: `errors=[]` with stance/window/scavenge/pickup replication green;
- dependency audit: zero vulnerabilities;
- source diff check: clean.

The first aggregate Chromium wrapper expired after ten green scenarios because software WebGL exceeded the ten-minute outer bound. No assertion failed. The remaining scenarios were completed in non-overlapping bounded shards rather than restarting the same aggregate run.

## Release Boundary

This correction is verified locally. It does not modify the canonical GitHub Pages build until Dave explicitly asks to publish it.
