# Combat registry coverage contract

## Independent roster oracle

The validator pins the exact B1/Pass 64 protocol roster rather than accepting a candidate-owned required-ID list:

`carbine`, `smg`, `lmg`, `scattergun`, `sniper`, `pistol`, `machine-pistol`, `magnum`, `railgun`.

F01 must update this validator-owned oracle, including the reviewed optic kind, in the same reviewed schema change that adds stable Pass 65 protocol IDs. The positive thermal self-test is a schema-only probe; it does not admit a release weapon. Working display names in P0 are planning inputs, not frozen IDs or balance approval.

Each pinned weapon must have exactly one definition and one coverage row for gameplay, protocol, loadout, range, bots, drops, replay, presentation, audio, penetration, telemetry, tests and provenance. A candidate cannot redefine either completeness set.

## F01 typed target

- Spread and recoil angles are radians. Spread declares hip, ADS, movement, explicit stand/crouch/prone multipliers, sustained and maximum values. Recoil declares pitch/yaw radians, `recoveryPerSecond`, explicit stand/crouch/prone plus ADS multipliers, and a deterministic pattern ID.
- Damage uses a typed `standard | head-only` policy. The B1 magnum is head-only; body/limb results remain zero by policy.
- Ammo includes magazine, reserve, tactical reload, empty reload and switch time.
- Energy penetration declares calibre, power, FMJ multiplier, the B1 material-policy ID, energy falloff, minimum energy retention, minimum wall damage and maximum surfaces. There is no constant `retentionPerSurface` field.
- `effects.tracerColorHex` is a renderer-neutral integer from `0x000000` through `0xffffff`. The B1 oracle pins `carbine=0xffd166`, `smg=0x65e7ff`, `lmg=0x9fda72`, `scattergun=0xff8a5b`, `sniper=0xa9e7ff`, `pistol=0xe8c77b`, `machine-pistol=0xff9f43`, `magnum=0xffd36a` and `railgun=0x7df8ff`. F02 adapters preserve the current tracer plus Gun Range station emissive/sign/light consumers without importing Three.js into the registry.
- Pellet count is capped at 12; non-pellet weapons use one ray/projectile. The B1 scattergun retains nine pellets.
- The B1 railgun preserves exact penetration power `100000` and `64` surfaces. Higher values fail.
- Optics are a closed union: standard solid-occluded; the reviewed 2.5x DMR thermal that sees living targets through smoke but never solids and remains presentation-only; or a pinned special-authority optic such as the host railgun route. Through-wall support sensing is not a weapon optic.
- Gun Range availability is a closed union distinct from loadout/drop. B1 pins five station identities (`range-carbine`, `range-smg`, `range-lmg`, `range-scattergun`, `range-sniper`), the pistol as companion sidearm for carbine/SMG/LMG/scattergun, the machine pistol as the sniper companion, the magnum as `dhv-x-sidearm-v1` entitlement-only, and the railgun as unavailable in the range.
- Loadout is `eligible | curated-only | pickup-only | never`. The reviewed F01 target pins ordinary LMG and machine-pistol eligibility, magnum `never`, and railgun `pickup-only`; the remaining ordinary B1 weapons are eligible. DHV-X magnum entitlement remains outside ordinary loadout policy.
- Stance is the explicit closed object `{stand,crouch,prone}`, each `allowed | blocked`; B1 pins all three allowed. Telemetry is `standard | not-applicable`, with B1 firearm event coverage pinned `standard`. Bot, drop, replay and authority remain closed enums. Model-set, presentation, audio and provenance IDs are explicit and unique per release weapon.

The F01 eligibility metadata is a Pass 65 target and remains inert during F02. F02 adapters must preserve current Pass 64 menu selection, LMG visibility, sniper-to-machine-pistol pairing, ordinary service-pistol pairing, Gun Range station behavior, DHV-X magnum entitlement and protocol behavior until F04/W15/F09 deliberately migrate those consumers. Fixture policy values are not a claim that current UI wiring already implements the target catalog.

Every defined object is closed: unknown keys, missing required keys, unknown discriminants, duplicate IDs, contradictory fields and out-of-bound numbers fail.

## Integration rule

The JSON fixtures are deterministic schema probes. After F01/F03 integration, bind the loader to the canonical TypeScript registry and retain the independent roster/channel oracles and adversarial mutations. Do not copy candidate IDs into the oracle at runtime.
