# Combat coverage contract

The canonical registry is pure data. Runtime adapters consume it; they do not become a second source of truth.

## Required definition fields

- Stable `id`, slot, family, fire kind/mode, RPM, pellets, spin-up, movement multiplier.
- Damage/falloff/head/limb, spread/recoil/recovery, magazine/reserve/reload/switch.
- Penetration power/retention/surface cap and optic/projectile policy.
- Explicit loadout, bot, drop, replay and telemetry policies.
- Presentation, audio, provenance and test identities.

## Exhaustive mapping domains

Every combat ID must occur exactly once in each applicable domain:

- gameplay
- protocol
- loadout
- bots
- drops
- replay
- presentation
- audio
- penetration
- telemetry
- tests
- provenance

An explicit `never` or `not-applicable` policy is coverage; absence is not.

## Failure fixtures

Reject duplicate/unknown IDs, NaN/infinity, negative or unreasonable timings/ammo, illegal slot/fire combinations, projectile fields on hitscan weapons, missing projectile identity, incomplete mappings, implicit policies, and missing source/digest evidence.

The staging JSON shape exercised by the bundled validator is a contract fixture. After B1, adapt its input loader to the repository's canonical catalog without weakening these checks.
