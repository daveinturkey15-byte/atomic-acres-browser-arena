---
name: atomic-acres-combat-registry
description: Author, extend, rebalance, migrate, or verify Atomic Acres weapons, sidearms, grenades, projectiles, loadout eligibility, combat statistics, penetration policy, and exhaustive content-ID coverage. Use whenever a combat identity, schema, authority rule, balance value, bot/drop policy, or related protocol mapping changes.
---

# Atomic Acres Combat Registry

Keep combat definitions typed, exhaustive, host-authoritative, and presentation-independent.

## Workflow

1. Read repository instructions, the numbered pass specification, frozen decision receipts, current protocol/catalog, ballistics contract, acceptance manifest, and affected tests.
2. Classify the change as schema, authority, balance, loadout, presentation identity, or a bounded combination.
3. Change the canonical definition before adding runtime wiring. Keep catalog and reducer modules free of Three.js and WebAudio imports.
4. Extend strict protocol parsing and clean version-mismatch behavior whenever an identity or replicated field changes.
5. Compare definitions and coverage against validator-owned B1/F01 oracles; never let candidate data declare which IDs or channels are required.
6. Test boundary distances, radians-based deterministic recoil/spread, cadence, tactical/empty reload, movement, modifier ordering, and physically ordered energy penetration.
7. Compare role/TTK envelopes and actively challenge dominance, stale-life, replay, forged ammo/action, and missing-mapping falsifiers.
8. Return the exact source and integrated SHAs, changed paths, tests, evidence, assumptions, unknowns, and residual falsifiers.

## Invariants

- Authority: clients send bounded intents; the host owns ammo, action legality, projectile time, damage, death, score, and shared results.
- Architecture: do not add new weapon or grenade branch forests to `legacy-main.ts`; adapters may bridge only while typed seams migrate.
- Accessibility: recoil and motion presentation may scale, but camera-centered shot authority and shared outcomes cannot.
- Performance: bound pellets, penetration surfaces, projectiles, effects, audio voices, and transient allocations; prewarm hitch-sensitive paths.
- Provenance: require original or license-vetted models, textures, animation, audio, source records, and digests; never copy franchise content.
- Compatibility: preserve frozen existing statistics during behavior-only migration unless a numbered requirement explicitly changes them.
- Completion: reject generic release fallbacks and implicit default policies.

## Validate

Read [references/coverage-contract.md](references/coverage-contract.md) before changing registry shape. From this skill directory, run both contract fixtures:

`node scripts/verify-combat-registry.mjs scripts/fixtures/known-good.json`

`node scripts/verify-combat-registry.mjs scripts/fixtures/incomplete.json`

`node scripts/verify-combat-registry.mjs --self-test`

The first and third commands must exit zero and the second must exit nonzero. For a candidate manifest, run:

`node scripts/verify-combat-registry.mjs <combat-manifest.json>`

Treat an unknown key, missing mapping, unbounded number, illegal union/cross-field combination, self-declared completeness set, or missing policy/evidence as a hard failure.
