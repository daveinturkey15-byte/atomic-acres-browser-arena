# Rustworks tower and combat-lane overhaul

Date: 2026-07-22  
Branch: `codex/rustworks-tower-overhaul`  
Base: `6b0495dae308878bb969916e4f5d80539f90157e` (`origin/main` at branch creation)

## Overview

Rebuild Rustworks' central tower as one coherent oil-rig structure and turn the
open deck around it into a stronger close-quarters PvP loop. The design borrows
only abstract combat ideas from classic compact tower maps: contested vertical
power, protected routes under the tower, an asymmetric side trench, and
walk-through freight cover. Geometry, materials, names, and arrangement remain
original to Rustworks.

## Claim states

- **Observed:** the current source has a physically serviceable two-level tower,
  but the procedural and authored versions use dense repeated X-braces, a flat
  canopy slab, and 24 closed containers (six per side).
- **Inference:** the repeated small parts and four identical six-container rows
  are the main causes of the clunky silhouette and visually overfilled yard.
- **Assumption:** "another 3–4 on each side" means a final total of 3–4 per side,
  because the user explicitly set the target at 12–16 total. This contribution chooses
  four per side (16 total), not 24.
- **Constraint:** the character physics currently creates one continuous world
  floor across the arena. A literally sunken trench would require a shared
  physics-floor redesign, so this contribution authors a deck-level maintenance trench:
  a recessed-looking grated lane with waist-high blast walls and crossovers.
- **Unknown:** final human preference for the exact tower silhouette and trench
  cover rhythm remains a visual-review decision.
- **Falsifier:** if browser traversal cannot pass through the under-tower routes
  and open containers, or if the new tower is more visually fragmented than the
  base asset, the design is rejected.

## Requirements

- **R1 — coherent tower:** replace the cage-like lower bracing and slab canopy
  with a readable three-part silhouette: armored undercroft, two retained
  playable decks, and a tapered derrick crown.
- **R2 — preserve authority:** retain TypeScript as player, physics, shot, and
  traversal authority; the Blender/GLB remains presentation-only and must match
  the authoritative layout.
- **R3 — under-tower PvP:** create two intersecting, player-width maintenance
  tunnels beneath the lower deck, with four open portals and solid corner
  service modules that provide useful close cover.
- **R4 — side trench:** add one asymmetric west-side service trench running
  north/south, with at least three lateral entry gaps and no spawn overlap.
- **R5 — container count and spacing:** author exactly 16 container placements,
  four per side, with at least 3 m clear space between adjacent container ends.
- **R6 — walk-through cover:** make exactly four placements (one per side) open
  end-to-end containers with authoritative wall/roof collision and a clear
  player passage.
- **R7 — traversal retained:** both existing climb routes must remain within the
  50-degree controller limit and pass forward/reverse traversal checks.
- **R8 — provenance:** regenerate the deterministic `.blend` and `.glb` from the
  checked-in Blender generator, bump the asset version, and validate semantic
  metadata and layout parity.
- **R9 — bounded performance:** record before/after asset bytes, scene/object
  telemetry, and browser frame telemetry. Any material regression must be
  reported to central integration rather than hidden.

## Acceptance checks

- **C1:** focused Vitest suites pass for Rustworks map and Blender contracts.
- **C2:** map inspection reports 16 placements, four per side, exactly four open
  pass-throughs, and no spawn within any authoritative collider.
- **C3:** mechanical clearance checks prove every open container passage and both
  under-tower axes admit the standing player capsule.
- **C4:** trench metadata reports the west lane, three or more exits, and collider
  parity across player/physics/shot authority.
- **C5:** the Blender test reports the new version and semantic parts for tower
  undercroft, derrick crown, service trench, closed containers, and open
  containers; authored placement counts match TypeScript.
- **C6:** deterministic Blender authoring completes and writes both source and
  runtime assets; hashes and byte sizes are recorded.
- **C7:** TypeScript lint, production build, provenance checks, and relevant
  bounded browser tests pass without weakening existing verifiers.
- **C8:** before/after browser captures show the tower from the same staged views,
  plus ground-level evidence for the undercroft, trench, and an open container.
- **C9:** `git diff --check` is clean and the final branch is one clean commit
  descended from the recorded base.

## Out of scope

- Shared character-physics changes required for a genuinely below-deck trench.
- New weapons, networking rules, bot-navigation architecture, water, lighting,
  global renderer changes, production publishing, deployment, or `main` merges.
- Copying proprietary art, branding, dimensions, or exact layout from another
  game.
