# Combat registry coverage contract

## Independent roster oracle

The validator pins the exact B1/Pass 64 protocol roster rather than accepting a candidate-owned required-ID list:

`carbine`, `smg`, `lmg`, `scattergun`, `sniper`, `pistol`, `machine-pistol`, `magnum`, `railgun`.

F01 must update this validator-owned oracle, including the reviewed optic kind, in the same reviewed schema change that adds stable Pass 65 protocol IDs. The positive thermal self-test is a schema-only probe; it does not admit a release weapon. Working display names in P0 are planning inputs, not frozen IDs or balance approval.

Each pinned weapon must have exactly one definition and one coverage row for gameplay, protocol, loadout, bots, drops, replay, presentation, audio, penetration, telemetry, tests and provenance. A candidate cannot redefine either completeness set.

## F01 typed target

- Spread and recoil angles are radians. Spread declares hip, ADS, movement, explicit stand/crouch/prone multipliers, sustained and maximum values. Recoil declares pitch/yaw radians, `recoveryPerSecond`, explicit stand/crouch/prone plus ADS multipliers, and a deterministic pattern ID.
- Damage uses a typed `standard | head-only` policy. The B1 magnum is head-only; body/limb results remain zero by policy.
- Ammo includes magazine, reserve, tactical reload, empty reload and switch time.
- Energy penetration declares calibre, power, FMJ multiplier, the B1 material-policy ID, energy falloff, minimum energy retention, minimum wall damage and maximum surfaces. There is no constant `retentionPerSurface` field.
- Pellet count is capped at 12; non-pellet weapons use one ray/projectile. The B1 scattergun retains nine pellets.
- The B1 railgun preserves exact penetration power `100000` and `64` surfaces. Higher values fail.
- Optics are a closed union: standard solid-occluded; the reviewed 2.5x DMR thermal that sees living targets through smoke but never solids and remains presentation-only; or a pinned special-authority optic such as the host railgun route. Through-wall support sensing is not a weapon optic.
- Loadout, bot, drop, replay, telemetry, stance and authority policies are closed enums. Model-set, presentation, audio and provenance IDs are explicit and unique per release weapon.

Every defined object is closed: unknown keys, missing required keys, unknown discriminants, duplicate IDs, contradictory fields and out-of-bound numbers fail.

## Integration rule

The JSON fixtures are deterministic schema probes. After F01/F03 integration, bind the loader to the canonical TypeScript registry and retain the independent roster/channel oracles and adversarial mutations. Do not copy candidate IDs into the oracle at runtime.
