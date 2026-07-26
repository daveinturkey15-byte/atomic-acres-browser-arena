# Support authority contract

## Catalog split

- `KillstreakDefinition`: exact cost/tier, typed `selectable | care-only | retired` availability, exact non-negative safe-integer `carePackageWeightUnits`, alternative/duplication, activation, earning/carry/repeatability, strict support-definition bindings, authority, presentation, audio and evidence IDs.
- Per-kind support definitions: explicit targetability/health/hitbox, immutable gun profile, ammo/reload, lifetime/fuel, targeting, sensor, navigation, privacy, lifecycle and budgets.
- Runtime state: references immutable definitions and carries only bounded changing values.
- Host/private and recipient snapshots are separate types.

Every manifest and nested definition uses exact key allowlists and enum membership. Catalog completeness comes from the separately loaded, digest-bound canonical DEC-13 receipt; a candidate cannot nominate its own allegedly frozen roster.

## Pass 65 exact contracts

- Five slots obey the frozen roster/cost/alternative/duplication receipt and bind keys 3–7 at match start.
- Adrenaline lasts 15 seconds under frozen modifier/stack/death rules.
- `shippable` means `availability !== 'retired'`. Derive reward eligibility directly from the unique catalog as `availability !== 'retired' && id !== 'care-package'`; never maintain a second eligible-ID list.
- Every reward-eligible definition has one positive safe-integer weight; `care-package` and retired definitions have zero. The recommended synthetic weights total exactly 100 and care-only nullable-cost Nuke has one unit.
- Chopper is targetable at the synthetic recommended 800 HP, lasts 30 seconds, uses host-seeded band-limited motion, respects LOS/smoke/cover, and binds the recommended four-second pressure/four-to-five-second escape calibration. These values remain synthetic until DEC-13 is owner-frozen.
- Carpet Bomber uses only a strip-midpoint activation anchor, host-seeded random valid ingress and exactly 20 bounded impacts.
- Drone Swarm creates 12 targetable 50-HP drones, each with 20-round magazines and unlimited host reloads until 60-second expiry; eligible targets are opposing living players and bots under LOS/smoke/cover policy.
- Piloted Drone has 50 HP, 30 seconds fuel and exactly two 20-round magazines. It alone owns the 50m/90-degree/250ms presentation-only wall sensor, which never grants ballistic authority.
- Swarm and piloted variants reference the identical externally pinned, digest-verified drone gun profile. Every armed support reserves at least one loaded magazine per active entity; Chopper's canonical cap is exactly 64.

## Decision and evidence binding

The package's separate DEC-13 receipt mirrors the full 11-row decision-packet recommendation, including costs, tiers, availability, alternatives, per-item activation/duration/repeatability, integer weights, selection, earning, global activation and privacy rules. It is explicitly `syntheticFixtureOnly`, records live DEC-13 as `OPEN`, and cannot pass candidate mode. Normal validation reads the canonical repository receipt and must fail until Dave freezes it.

Candidate evidence binds a strict signed/attested receipt and its underlying artifact by SHA-256, exact Git source SHA, build, verifier and R500-R512 coverage.

Reject missing or self-declared decision authority, unknown fields, boolean availability, secondary reward pools, nonzero ineligible weights, cost-inverted odds, client-owned outcomes, mismatched gun profiles, impossible caps, missing nav/LOS policy, hidden-state leakage, unsigned evidence or absent provenance.
