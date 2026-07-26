---
name: atomic-acres-destructible-world
description: Design, implement, place, network, render, or verify Atomic Acres interactive and destructible objects, dynamic collision authority, shed doors, sheet dents, perforation and fracture, ballistic apertures, Rapier debris, player and shot impulses, persistence, late join, reset, and destruction budgets.
---

# Atomic Acres Destructible World

Build bounded dynamic objects whose rendering, movement, ballistics, LOS, navigation and replication agree.

## Workflow

1. Read repo rules, frozen object/map decisions, arena collision and ballistics consumers, Rapier integration, renderer/TSL contracts, budgets, acceptance rows and vertical-slice gate.
2. Define stable object, placement, surface, door, chunk, collider and aperture IDs plus strict bounded definitions and state.
3. Route movement, ballistics, grenades, AI LOS, support targeting, spawn and navigation through one revisioned world-collision snapshot.
4. Build one greybox vertical slice first: one-second door, one damageable sheet, one canonical aperture and one detachable major chunk.
5. Let the host admit interaction, obstruction, perforation, explosion damage/fracture, debris activation and impulse. Reject stale/replayed/impossible revisions.
6. Drive visual holes and ballistic pass-through from the identical canonical aperture region; keep player collision solid until authored detachment.
7. Use pre-authored chunks and bounded dents/deformation. Do not use arbitrary runtime CSG, soft bodies or client debris authority.
8. Prove interruption/reversal, flat-shot wake, packet chaos, late join, rematch reset, profile parity, disposal and frozen performance budgets before map rollout.

## Invariants

- Authority: host owns door, damage, aperture, detach, major-debris pose/impulse and revision; minor debris is presentation-only.
- Parity: mesh, movement collider, ballistic surface, grenade sweep, AI LOS and navigation consume the same revision.
- Accessibility: presentation quality may reduce cosmetic fragments/damage detail, never authoritative holes, panels, colliders or major bodies.
- Performance: definitions and parsers hard-cap apertures, dents, chunks, awake bodies, particles, replication, CPU/GPU work and memory.
- Provenance: require source, license and digest for models, materials, textures, fracture chunks and external code/data.
- Rollout: do not place multiple sheds until one authored shed passes the signed authority/visual/network/budget stop gate.

## Validate

Read [references/shed-authority-contract.md](references/shed-authority-contract.md), then from this skill directory run both contract fixtures:

`node scripts/verify-interactive-world.mjs scripts/fixtures/known-good.json`

`node scripts/verify-interactive-world.mjs scripts/fixtures/incomplete.json`

The first command must exit zero and the second must exit nonzero. For a candidate manifest, run:

`node scripts/verify-interactive-world.mjs <interactive-world-manifest.json>`
