# Asset and animation contract

## Required presentation identity

Each weapon presentation declares:

- distinct first-person and world LOD assets with digests and license records;
- a skeleton and semantic parts;
- right/left grip, magazine, muzzle, eject, optic, flashlight, bolt, pump, knife and grenade sockets when capability-applicable;
- `requiredActions`, allowed transitions and one clip per required action;
- material family and finite triangle/draw/decoded-texture budgets;
- deterministic capture evidence for every required action.

Capability-conditioned actions include equip, idle, walk, sprint, ADS, fire/dry fire, reload/empty reload, melee, inspect, pump, bolt, spin and grenade prime/hold/throw/cancel. Do not require an irrelevant action; do not omit a relevant one.

## Capture identity

Index source SHA, build ID, backend, profile, viewport, clock, seed, weapon ID and action. Reject moving aliases or ambient-time captures.

## Quality falsifiers

Reject missing/black materials, detached fingers, grip/socket error, camera or world clipping, muzzle/eject mismatch, excessive passive motion, non-TSL custom material, LOD budget overflow, generic fallback, missing provenance, or presentation that changes authority.

The staging validator consumes a compact JSON fixture. After B1, replace only its loader with the repository manifest/capture index; preserve the failure rules.
