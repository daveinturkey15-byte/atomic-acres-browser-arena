# Shed authority contract

## Canonical state

Definitions declare stable IDs, collision/material policy, door trajectory and obstruction rules, damage thresholds, canonical aperture representation, pre-authored chunks, LOD/provenance and hard caps. Runtime state carries match epoch, monotonic revision, door command/target/ticks, bounded surface damage, detached IDs and bounded major-body poses.

Manifest objects and every nested object are strict: unknown keys, unknown enums, duplicate identifiers and retired arena aliases fail. Internal arena IDs are exactly `atomic-acres`, `skyline-terminal`, `rustworks-1v1` and `gun-range`; Nuke Town, Terminal, RustRig and Gun Range are display labels only.

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
- A host-observed player contact with an intact closed/closing door pushes it towards open without forging or consuming an `F` interaction sequence. Repeated overlap while already opening is revision-free; major debris and admitted bullets retain explicit bounded interruption/reversal/resume semantics.
- Rendering and ballistics consume the exact same aperture region, including cap/merge behavior.
- Valid contact nudges non-flat major debris; admitted shots/explosions can wake flat or sleeping major debris.
- Three or more marks inside the same quantized panel-corner zone can detach exactly one pre-authored major panel only after that surface also reaches its damage threshold. Equally damaged centre-line hits do not collapse a corner; the event is host-owned, bounded and late-join reconstructible.
- Holes/dents/detachment persist for the round, reconstruct late join and reset on rematch/arena change.
- The canonical Pass 65 shed definition uses exact ceilings of 32 apertures, 24 dents and six major chunks per shed, plus 18 simultaneously awake major shed bodies arena-wide; runtime occupancy may remain lower. The contract fixture exercises those ceilings.
- At least two sheds appear in every eligible arena zone in frozen `DEC-09` only after the vertical slice passes. Placement rows are unique by canonical arena/zone.

## Decision and evidence binding

Candidate validation reads `DEC-09` from `docs/PASS65_DECISION_RECEIPTS.json`, requires a structured `FROZEN` value, and compares its canonical SHA-256 with the manifest binding. While the live receipt is `OPEN`, candidate validation must fail.

The package's separate receipt and evidence files are synthetic forward-test data. They mirror the recommended DEC-09 classification—including the Terminal apron—but explicitly state `syntheticFixtureOnly` and `sourceDecisionStatus: OPEN`; they are not Dave approval. Synthetic mode is CLI-gated and restricted to the package fixture directory.

The vertical-slice claim is not a boolean. The manifest binds a strict evidence receipt by digest; that receipt binds its artifact by SHA-256 and records source SHA, build ID, verifier identity, requirement coverage, reviewer identity, timestamp and attestation.

Reject visual-only holes, render-only doors, arbitrary fracture, unbounded arrays/bodies, guest authority, missing consumer parity, absent provenance, unsigned evidence or budget-free expansion.
