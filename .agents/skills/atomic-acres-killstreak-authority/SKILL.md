---
name: atomic-acres-killstreak-authority
description: Add, change, select, balance, network, simulate, or verify Atomic Acres killstreaks and Field Support, including earning, five-slot loadouts, Adrenaline, care packages, aircraft, bombs, choppers, drones, possession, sensors, rewards, and support health, ammo, fuel, targeting, navigation, and exactly-once outcomes.
---

# Atomic Acres Killstreak Authority

Keep support selection data-driven and every shared outcome host-authored.

## Workflow

1. Read repo rules, canonical decision receipts, killstreak and support-definition catalogs, protocol, combat-result reducer, remote admission, arena nav/visibility metadata, budgets and acceptance rows.
2. Load `DEC-13` from the canonical decision registry. Stop while it is `OPEN`; never use the bundled synthetic recommended roster as owner approval.
3. Define exact cost, tier, typed `selectable | care-only | retired` availability, alternative/duplication, activation, earning/death/carry/repeatability, catalog-owned care-package weight, entity, authority and presentation policy.
4. Reference strict per-kind support definitions for health, hitbox, immutable gun profile, ammo/reload, lifetime/fuel, targeting, sensor, navigation, audio/effects and budgets.
5. Model activation with host-owned ID, seed, canonical time, life/epoch/revision and idempotent consume.
6. Simulate stateful support on the host fixed step. Use reliable lifecycle/results and bounded lossy pose snapshots.
7. Route support hits, deaths, rewards and score through the canonical combat-result path; bind targetable entities to pose-history hit proxies.
8. Test exact costs, counts, HP, magazines, durations, probabilities, LOS/smoke/cover, nav recovery, possession exits, cleanup and forged client claims.
9. Run fixed-seed delay/loss/duplication/reorder/reconnect/late-join/rematch scenarios and compare canonical result counts/state hashes.

## Invariants

- Authority: never accept client-authored reward, seed, path, target, pose, ammo, health, hit, damage, death or score.
- Privacy: keep care reward/seed/roll and hidden acquisition state host-only until the frozen reveal policy permits a recipient projection.
- RNG: derive reward eligibility from the unique catalog as every non-retired ID except `care-package`; use its canonical integer weights and seeded time, never a second eligibility list or ambient `Math.random()` for shared outcomes.
- Visibility: hard cover and semantic smoke govern AI support; the piloted wall sensor is presentation-only and cannot authorize a shot.
- Definition integrity: reject unknown keys/enums, orphan definitions, contradictory targetability/health/hitbox, entity caps below counts, projectile caps below loaded ammunition and gun-profile digest drift.
- Accessibility: sensory reduction may change local flash/audio/outline presentation, never host targeting or damage.
- Performance: pool, prewarm, cap and dispose entities, poses, projectiles, bombs, effects, lights, audio and navigation work.
- Provenance: manifest every model, texture, sound, animation and derived asset; no copied franchise content.

## Validate

Read [references/support-authority-contract.md](references/support-authority-contract.md), then from this skill directory run:

`node scripts/verify-killstreak-catalog.mjs --synthetic-fixture scripts/fixtures/known-good.json`

`node scripts/verify-killstreak-catalog.mjs --synthetic-fixture scripts/fixtures/incomplete.json`

`node scripts/run-adversarial-mutations.mjs`

The first and third commands must exit zero and the second must exit nonzero. Synthetic mode is restricted to package fixtures and records that live `DEC-13` is still `OPEN`. For a candidate manifest, omit that flag so the verifier loads and digest-checks the canonical decision registry:

`node scripts/verify-killstreak-catalog.mjs <support-manifest.json>`
