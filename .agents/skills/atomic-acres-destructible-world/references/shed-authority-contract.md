# Shed authority contract

## Canonical state

Definitions declare stable IDs, collision/material policy, door trajectory and obstruction rules, damage thresholds, canonical aperture representation, pre-authored chunks, LOD/provenance and hard caps. Runtime state carries match epoch, monotonic revision, door command/target/ticks, bounded surface damage, detached IDs and bounded major-body poses.

## Mandatory parity consumers

- player movement
- ballistics and penetration
- grenade/explosion sweeps
- AI line of sight
- support targeting
- spawn safety and navigation
- rendering and minimap diagnostics where applicable

All consume one explicit world revision. Never mutate unrelated static arrays around a query.

## Pass 65 shed rules

- Unobstructed closed-to-open/open-to-closed door motion is nominally one second.
- Player, major debris and admitted bullets use explicit bounded interruption/reversal/resume semantics.
- Rendering and ballistics consume the exact same aperture region, including cap/merge behavior.
- Valid contact nudges non-flat major debris; admitted shots/explosions can wake flat or sleeping major debris.
- Holes/dents/detachment persist for the round, reconstruct late join and reset on rematch/arena change.
- At least two sheds appear in every map in the frozen outdoor classification only after the vertical slice passes.

Reject visual-only holes, render-only doors, arbitrary fracture, unbounded arrays/bodies, guest authority, missing consumer parity, absent provenance, or budget-free expansion.
