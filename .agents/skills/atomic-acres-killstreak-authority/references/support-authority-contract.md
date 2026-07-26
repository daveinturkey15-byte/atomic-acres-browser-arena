# Support authority contract

## Catalog split

- `KillstreakDefinition`: cost/tier, typed `selectable | care-only | retired` availability, exact non-negative safe-integer `carePackageWeightUnits`, slot/alternative/duplication policy, activation, earning/carry/repeatability, support definition, authority and presentation IDs.
- `SupportEntityDefinition`: strict per-kind health/hitbox, shared gun profile, ammo/reload, lifetime/fuel, targetability, navigation/sensor, effects/audio and caps.
- Runtime state: references immutable definitions and carries only bounded changing values.
- Host/private and recipient snapshots are separate types.

## Pass 65 exact contracts

- Five slots obey the frozen roster/cost/alternative/duplication receipt.
- Adrenaline lasts 15 seconds under frozen modifier/stack/death rules.
- `shippable` means `availability !== 'retired'`. Derive reward eligibility directly from the unique catalog as `availability !== 'retired' && id !== 'care-package'`; never maintain a second eligible-ID list.
- Every reward-eligible definition has one positive exact safe-integer weight; `care-package` and every retired definition have zero. Weights are cost-monotonic under frozen exceptions, and care-only Nuke is exactly 1% if retained.
- Chopper lasts 30 seconds and passes frozen cover/pressure calibration.
- Carpet Bomber uses host-seeded random valid ingress and exactly 20 bounded impacts.
- Swarm creates 12 targetable 50-HP drones, each with 20-round magazines and unlimited host reloads until 60-second expiry.
- Piloted drone has 50 HP, 30 seconds fuel and exactly two 20-round magazines.
- Swarm and piloted variants reference the identical immutable drone gun profile.

## Failure conditions

Reject missing decision receipts or frozen roster IDs, boolean/implicit availability, a second reward-eligibility list, catalog/receipt roster mismatch, nonzero ineligible weights, unbounded or floating probability semantics, client-owned outcome fields, mismatched shared gun profiles, missing nav/LOS policy, undefined targetability, hidden-state leakage, missing evidence IDs, or absent entity/effect budgets.

The staging validator verifies a minimal deterministic fixture; wire its loader to canonical B1 catalogs without weakening these invariants.
