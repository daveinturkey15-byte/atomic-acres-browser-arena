---
name: atomic-acres-killstreak-authority
description: Add, change, select, balance, network, simulate, or verify Atomic Acres killstreaks and Field Support, including earning, five-slot loadouts, Adrenaline, care packages, aircraft, bombs, choppers, drones, possession, sensors, rewards, and support health, ammo, fuel, targeting, navigation, and exactly-once outcomes.
---

# Atomic Acres Killstreak Authority

Keep support selection data-driven and every shared outcome host-authored.

## Workflow

1. Read repo rules, canonical decision receipts, killstreak and support-definition catalogs, protocol, combat-result reducer, remote admission, arena nav/visibility metadata, budgets and acceptance rows.
2. Load frozen `DEC-13` from the canonical decision registry and bind its canonical digest. Synthetic fixtures may exercise the frozen contract, but never substitute for candidate evidence.
3. Author one typed catalog with exact cost, tier, `selectable | care-only | retired` availability, slot family, activation, duration and a non-negative `carePackageBaseWeightUnits`. Never author a second eligibility list or independently authored derived weight.
4. Reference strict per-kind support definitions for health, hitbox, immutable gun profile, ammo/reload, lifetime/fuel, targeting, sensor, navigation, audio/effects and budgets.
5. Model activation with host-owned ID, seed, canonical time, life/epoch/revision and idempotent consume.
6. Simulate stateful support on the host fixed step. Use reliable lifecycle/results and bounded lossy pose snapshots.
7. Route support hits, deaths, rewards and score through the canonical combat-result path; bind targetable entities to pose-history hit proxies and target-world-position feedback rather than the caller reticle.
8. Test exact costs, counts, HP, magazines, durations, probabilities, LOS/smoke/cover, nav recovery, possession exits, cleanup and forged client claims.
9. Run fixed-seed delay/loss/duplication/reorder/reconnect/late-join/rematch scenarios and compare canonical result counts/state hashes.

## Invariants

- Authority: never accept client-authored reward, seed, path, target, pose, ammo, health, hit, damage, death or score.
- Privacy: keep care reward/seed/roll and hidden acquisition state host-only until the frozen reveal policy permits a recipient projection.
- Selection: enforce the five frozen families exactly: Scout/Adrenaline/Care; Yardhawk/Piloted Drone; two distinct choices from Tri-Pass/Carpet Bomber/Hunter Swarm/Chopper; then Nuke/Drone Swarm. Both top-tier choices remain selectable and mutually exclusive.
- Earning/death lifecycle: each selected reward earns once per ladder cycle. Reaching the final threshold starts a fresh zero-progress cycle while the same life remains active. Death resets per-life progress/cycle markers but never deletes an earned unconsumed reward; retain it through any number of respawns until exactly-once consumption or match-epoch reset.
- RNG: derive reward eligibility from the unique catalog as every non-retired ID except `care-package`. For non-Nuke eligible base-weight sum `S`, derive each non-Nuke weight as `baseWeight*99`, Nuke as `S`, and total as `100*S`; never maintain a second eligibility list or use ambient `Math.random()` for shared outcomes.
- Future content: additions, ID/display renames, retirement, cost changes and base-weight changes must rerun the projection. Adversarial tests must add at least two future entries, prove exactly-once enrollment/reachability, and reject stale mirrors. A future care-only row auto-enrolls without changing slots; a future selectable row must also be placed by an explicitly updated slot receipt.
- Visibility: hard cover and semantic smoke govern AI support; the piloted wall sensor is presentation-only and cannot authorize a shot.
- Drone variants: the standalone and Swarm definitions reference one canonical authored asset family and immutable drone gun profile. Both originate in host-admitted deterministic valid centre-map volumes and never trust a caller anchor. Standalone deployment requires an admitted `autonomous | first-person-owner-control` mode choice; variant rules may differ only in the frozen control, reserve, lifetime and sensor fields.
- Piloted Drone control: direct keyboard, mouse and gamepad axes follow one non-inverted screen-space convention. Autonomous standalone travel is exactly `2 *` the manual horizontal speed (currently 20m/s versus 10m/s), and every enter/exit/forced-restore transition clears stale motion and fire input.
- Drone Swarm: exactly 24 targetable drones spawn in a deterministic separated centre-map formation, enter fast, blend continuously to ordinary speed, remain distributed and split into host-seeded divergent individual/small-group routes. Entity/projectile/audio/navigation budgets scale explicitly to 24; behind-caller origin, an old 12-drone cap or a clustered shared route fails.
- Targeting presentation: Care Package and Carpet Bomber use the caller's host-admitted crosshair ground anchor without an overview map and display a large shared X. Carpet follows the Care Package-style arm, preview, commit and inbound-aircraft lifecycle, adds a caller-only map-bounded payload corridor, exactly 20 visible falling shells, 3× the preceding frozen impact damage and bounded explosion/smoke/fire audiovisual presentation; every cancel/reject/commit/expiry path disposes state exactly once.
- Damage presentation: chopper and every drone variant use the canonical non-placeholder gun profile. Feedback carries authoritative target ID/life/position and projects over that target, with explicit off-screen/behind-camera policy; it never uses the caller's current reticle as a substitute.
- Interaction: an eligible nearby world action—care-crate collection, door, weapon pickup or future catalogued sibling—outranks support enter/exit in the shared `F` arbiter; support toggle wins otherwise. Support code must not install a raw competing key listener, and every overlap remains exactly once.
- Definition integrity: reject unknown keys/enums, orphan definitions, contradictory targetability/health/hitbox, entity caps below counts, projectile caps below loaded ammunition and gun-profile digest drift.
- Accessibility: sensory reduction may change local flash/audio/outline presentation, never host targeting or damage.
- Performance: pool, prewarm, cap and dispose entities, poses, projectiles, bombs, effects, lights, audio and navigation work.
- Provenance: manifest every model, texture, sound, animation and derived asset; no copied franchise content.

## Validate

Read [references/support-authority-contract.md](references/support-authority-contract.md), then from this skill directory run:

`node scripts/verify-killstreak-catalog.mjs --synthetic-fixture scripts/fixtures/known-good.json`

`node scripts/verify-killstreak-catalog.mjs --synthetic-fixture scripts/fixtures/incomplete.json`

`node scripts/run-adversarial-mutations.mjs`

The first and third commands must exit zero and the second must exit nonzero. Synthetic mode is restricted to package fixtures, still digest-binds the canonical frozen `DEC-13`, and carries synthetic evidence only. For a candidate manifest, omit that flag so the verifier also requires canonical candidate evidence:

`node scripts/verify-killstreak-catalog.mjs <support-manifest.json>`
