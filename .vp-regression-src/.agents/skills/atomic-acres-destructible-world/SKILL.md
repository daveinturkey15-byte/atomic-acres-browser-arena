---
name: atomic-acres-destructible-world
description: Design, implement, place, network, render, or verify Atomic Acres interactive and destructible objects, dynamic collision authority, shed doors, sheet dents, perforation and fracture, ballistic apertures, Rapier debris, player and shot impulses, persistence, late join, reset, and destruction budgets.
---

# Atomic Acres Destructible World

Build bounded dynamic objects whose rendering, movement, ballistics, LOS, navigation and replication agree.

## Workflow

1. Read repo rules, canonical decision receipts, arena collision and ballistics consumers, Rapier integration, renderer/TSL contracts, budgets, acceptance rows and vertical-slice gate.
2. Load `DEC-09` from the canonical decision registry. Stop while it is `OPEN`; never treat the bundled synthetic fixture receipt as owner approval.
3. Define stable object, placement, surface, door, chunk, collider and aperture IDs plus strict bounded definitions and state. Use canonical machine arena IDs; display labels are presentation only.
4. Route movement, ballistics, grenades, AI LOS, support targeting, spawn and navigation through one revisioned world-collision snapshot.
5. Build one greybox vertical slice first: one-second `F` door, host-owned player-contact push, one damageable sheet, one canonical aperture, spatial corner weakening and one detachable major chunk.
6. Let the host admit interaction, obstruction, perforation, explosion damage/fracture, debris activation and impulse. Reject stale/replayed/impossible revisions.
7. Drive visual holes and ballistic pass-through from the identical canonical aperture region; keep player collision solid until authored detachment.
8. Use pre-authored chunks and bounded dents/deformation. Do not use arbitrary runtime CSG, soft bodies or client debris authority.
9. Prove interruption/reversal, flat-shot wake, packet chaos, late join, rematch reset, profile parity, disposal and frozen performance budgets before map rollout.

## Invariants

- Authority: host owns door, damage, aperture, detach, major-debris pose/impulse and revision; minor debris is presentation-only.
- Parity: mesh, movement collider, ballistic surface, grenade sweep, AI LOS and navigation consume the same revision.
- Accessibility: presentation quality may reduce cosmetic fragments/damage detail, never authoritative holes, panels, colliders or major bodies.
- Bounds: never exceed 32 apertures, 24 dents or six major chunks per shed, or 18 simultaneously awake major shed bodies arena-wide.
- Strictness: reject every unknown key, enum, arena alias, duplicate placement and candidate-authored completeness list.
- Provenance: require source, license, derivative notes and digest for models, materials, textures, fracture chunks and external code/data.
- Evidence: bind the canonical decision receipt, signed vertical-slice receipt and underlying artifact by digest and exact source/build identity.
- Rollout: do not place multiple sheds until one authored shed passes the signed authority/visual/network/budget stop gate.

## Validate

Read [references/shed-authority-contract.md](references/shed-authority-contract.md), then from this skill directory run:

`node scripts/verify-interactive-world.mjs --synthetic-fixture scripts/fixtures/known-good.json`

`node scripts/verify-interactive-world.mjs --synthetic-fixture scripts/fixtures/incomplete.json`

`node scripts/run-adversarial-mutations.mjs`

The first and third commands must exit zero and the second must exit nonzero. Synthetic mode is restricted to package fixtures and records that live `DEC-09` is still `OPEN`. For a candidate manifest, omit that flag so the verifier loads and digest-checks the canonical decision registry:

`node scripts/verify-interactive-world.mjs <interactive-world-manifest.json>`
