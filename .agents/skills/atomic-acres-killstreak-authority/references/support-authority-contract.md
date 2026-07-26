# Support authority contract

## Catalog split

- Authored `KillstreakCatalogSourceDefinition`: exact cost/tier, typed `selectable | care-only | retired` availability, exact non-negative safe-integer `carePackageBaseWeightUnits`, alternative/duplication, activation, duration and repeatability.
- Derived `KillstreakDefinition`: copies the authored source and adds `carePackageWeightUnits` from the one canonical projection; callers cannot supply this field.
- Manifest support binding: strict support-definition references, authority, presentation, audio and evidence IDs augment the same canonical rows without creating a second roster.
- Per-kind support definitions: explicit targetability/health/hitbox, immutable gun profile, ammo/reload, lifetime/fuel, targeting, sensor, navigation, privacy, lifecycle and budgets.
- Runtime state: references immutable definitions and carries only bounded changing values.
- Host/private and recipient snapshots are separate types.

Every manifest and nested definition uses exact key allowlists and enum membership. The separately loaded, digest-bound canonical DEC-13 receipt fixes the authored values and relative order of the baseline 11 rows. Strict extension rows may be inserted without editing an eligibility list, but cannot shadow, reorder or mutate frozen rows; every derived weight is recomputed across the combined catalog.

## Pass 65 exact contracts

- Five slots bind keys 3-7 at match start: slot 1 is Scout Sweep, Adrenaline Boost or Care Package; slot 2 is Yardhawk or Piloted Drone; slots 3 and 4 are distinct choices from Tri-Pass Strike, Carpet Bomber, Hunter Swarm and Chopper Gunner; slot 5 is Nuke or Drone Swarm. Nuke and Drone Swarm are both selectable, mutually exclusive alternatives.
- Adrenaline lasts 15 seconds under frozen modifier/stack/death rules.
- `shippable` means `availability !== 'retired'`. Derive reward eligibility directly from the unique catalog as `availability !== 'retired' && id !== 'care-package'`; never maintain a second eligible-ID list.
- Every eligible non-Nuke definition has a positive safe-integer base weight; `care-package`, retired definitions and Nuke have authored base zero. Let `S` be the sum of eligible non-Nuke base weights. Derive non-Nuke weights as `base*99`, Nuke as `S`, and total as `100*S`, making Nuke exactly 1%. The current frozen catalog has `S=123`, derived total `12300`, and Scout Sweep in the highest base-weight band.
- Any future non-retired, nonrecursive catalog row with a positive base weight auto-enrolls exactly once. Addition, ID/display rename, retirement, cost change or base-weight change reruns the projection and rejects stale derived mirrors. Care-only extensions require no selection-policy edit; an extension marked selectable must also belong to an explicitly frozen slot family, so selectable-but-unreachable content fails mechanically.
- Chopper is targetable at the frozen 800 HP, lasts 30 seconds, uses host-seeded band-limited motion, respects LOS/smoke/cover, and binds the four-second pressure/four-to-five-second escape calibration.
- Carpet Bomber uses only a strip-midpoint activation anchor, host-seeded random valid ingress and exactly 20 bounded impacts.
- Drone Swarm creates 12 targetable 50-HP drones, each with 20-round magazines and unlimited host reloads until 60-second expiry; eligible targets are opposing living players and bots under LOS/smoke/cover policy.
- Piloted Drone has 50 HP, 30 seconds fuel and exactly two 20-round magazines. It alone owns the 50m/90-degree/250ms presentation-only wall sensor, which never grants ballistic authority.
- Swarm and piloted variants reference the identical externally pinned, digest-verified drone gun profile. Every armed support reserves at least one loaded magazine per active entity; Chopper's canonical cap is exactly 64.

## Decision and evidence binding

The synthetic fixture mirrors the frozen DEC-13 decision, including costs, tiers, availability, slot families, per-item activation/duration/repeatability, authored base weights, derived weights, earning, activation and privacy rules. It uses the canonical receipt's digest but remains explicitly `synthetic-fixture-only` because its runtime evidence is synthetic; it cannot pass candidate mode. Normal validation reads the same canonical receipt and requires candidate evidence.

Candidate evidence binds a strict signed/attested receipt and its underlying artifact by SHA-256, exact Git source SHA, build, verifier and R500-R512 coverage.

Reject missing or self-declared decision authority, unknown fields, boolean availability, secondary reward pools, nonzero ineligible weights, cost-inverted odds, client-owned outcomes, mismatched gun profiles, impossible caps, missing nav/LOS policy, hidden-state leakage, unsigned evidence or absent provenance.
