# Asset and animation contract

## Required presentation identity

Each weapon presentation declares, against an independent capability oracle:

- distinct first-person and world LOD assets with recomputed digests, license records and derivative notes;
- a skeleton and semantic parts;
- right/left grip, magazine, muzzle, eject, optic, flashlight, bolt, pump, knife and grenade sockets when capability-applicable;
- an exact ordered action set, allowed transitions and one strictly shaped clip per action, including action-specific presentation markers;
- material family and finite triangle/draw/decoded-texture budgets;
- deterministic capture evidence for every required action.

Capability-conditioned actions include equip/unequip, idle variants, walk, sprint, ADS in/out, fire/dry fire, reload/empty reload, melee, inspect, pump, bolt, spin and grenade prime/hold/throw/cancel. Do not infer applicability from the candidate being tested: derive it from the independent weapon oracle. Do not require an irrelevant action; do not omit a relevant one.

## Capture identity

Declare one root identity containing an exact 40-hex source SHA, build ID, WebGPU backend, profile, viewport, fixed-step clock and seed. Every action capture then declares weapon ID, action, unique clock tick and an independent artifact path/SHA-256 digest. Resolve skeleton, LOD and capture paths from the manifest directory, contain real paths beneath it, bound file sizes and recompute each digest. Reject shared action artifacts, per-capture identity drift, moving aliases, ambient-time captures and 64-hex values masquerading as Git SHAs.

## Quality falsifiers

Reject missing/black materials, detached fingers, grip/socket error, duplicate or ambiguous semantic/socket node mappings, camera or world clipping, muzzle/eject mismatch, excessive passive motion, non-TSL custom material, LOD budget overflow, unordered or non-decreasing LODs, unapproved generic asset sharing, generic release fallback, missing provenance or derivative notes, or presentation that changes authority.

The staging validator consumes a strict schema-version-3 JSON fixture and currently carries the independent `a4-vanguard` oracle. After B1, replace only its loader and oracle source with the repository manifest/capture index and canonical registry; preserve the fail-closed nested schemas and failure rules.

Run `node scripts/verify-viewmodel-assets.mjs --self-test` after fixture checks. Its adversarial mutations must all be rejected before the validator can guard a candidate.
