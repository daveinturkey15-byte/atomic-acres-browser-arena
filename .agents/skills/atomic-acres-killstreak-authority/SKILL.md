---
name: atomic-acres-killstreak-authority
description: Add, change, select, balance, network, simulate, or verify Atomic Acres killstreaks and Field Support, including earning, five-slot loadouts, Adrenaline, care packages, aircraft, bombs, choppers, drones, possession, sensors, rewards, and support health, ammo, fuel, targeting, navigation, and exactly-once outcomes.
---

# Atomic Acres Killstreak Authority

Keep support selection data-driven and every shared outcome host-authored.

## Workflow

1. Read repo rules, frozen product decisions, killstreak and support-definition catalogs, protocol, combat-result reducer, remote admission, arena nav/visibility metadata, budgets, and acceptance rows.
2. Define exact cost, tier, typed `selectable | care-only | retired` availability, alternative/duplication, activation, earning/death/carry/repeatability, catalog-owned care-package weight, entity, authority and presentation policy.
3. Reference strict per-kind support definitions for health, hitbox, gun profile, ammo, lifetime/fuel, targeting, sensor, navigation, audio/effects and budgets.
4. Model activation with host-owned ID, seed, canonical time, life/epoch/revision and idempotent consume.
5. Simulate stateful support on the host fixed step. Use reliable lifecycle/results and bounded lossy pose snapshots.
6. Route support hits, deaths, rewards and score through the canonical combat-result path; bind targetable entities to pose-history hit proxies.
7. Test exact costs, counts, HP, magazines, durations, probabilities, LOS/smoke/cover, nav recovery, possession exits, cleanup and forged client claims.
8. Run fixed-seed delay/loss/duplication/reorder/reconnect/late-join/rematch scenarios and compare canonical result counts/state hashes.

## Invariants

- Authority: never accept client-authored reward, seed, path, target, pose, ammo, health, hit, damage, death or score.
- Privacy: keep care reward/seed/roll and hidden acquisition state host-only until a frozen reveal policy permits a recipient projection.
- RNG: derive reward eligibility from the unique catalog as every non-retired ID except `care-package`; use its canonical integer weights and seeded time, never a second eligibility list or ambient `Math.random()` for shared outcomes.
- Visibility: hard cover and semantic smoke govern AI support; the piloted wall sensor is presentation-only and cannot authorize a shot.
- Accessibility: sensory reduction may change local flash/audio/outline presentation, never host targeting or damage.
- Performance: pool, prewarm, cap and dispose entities, poses, projectiles, bombs, effects, lights, audio and navigation work.
- Provenance: manifest every model, texture, sound, animation and derived asset; no copied franchise content.

## Validate

Read [references/support-authority-contract.md](references/support-authority-contract.md), then from this skill directory run both contract fixtures:

`node scripts/verify-killstreak-catalog.mjs scripts/fixtures/known-good.json`

`node scripts/verify-killstreak-catalog.mjs scripts/fixtures/incomplete.json`

The first command must exit zero and the second must exit nonzero. For a candidate manifest, run:

`node scripts/verify-killstreak-catalog.mjs <support-manifest.json>`
