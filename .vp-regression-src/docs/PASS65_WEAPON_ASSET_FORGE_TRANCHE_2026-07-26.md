# Pass 65 weapon asset forge tranche

Date: 2026-07-26
Owner: weapon-asset-forge specialist
Impact: `runtime`
Base: `eb1367019c864d66905cb7dd525f87909a86035b`

## Overview

Close the highest-priority honest production gaps in the fail-closed Pass 65 weapon/arms gate without weakening it. This tranche owns the explosive crossbow and dedicated first-person operator arms. The remaining canonical weapon and support-aircraft families stay blocked unless they independently meet the same source, runtime, provenance, action, LOD, and review standard.

## Context

The current public crossbow is a runtime pistol derivative with attached limbs. The current selected first-person arms are runtime-built anatomy because the retained licensed candidate failed framing and grip acceptance. Both are explicit blockers under R105, R108, R223, HF-021, HF-025, HF-026, and HF-044.

## Requirements

- `WF-R1` Author a project-original TAC-15-inspired explosive-crossbow silhouette in Blender 5.1, with no copied proprietary game mesh, texture, logo, UI, or animation.
- `WF-R2` Give the crossbow a dedicated compact 1.5x optic, unambiguous transverse limbs/string/rail/bolt geometry, and canonical runtime `-Z` forward orientation.
- `WF-R3` Export two unique first-person LODs, three unique world LODs, and one dedicated drop LOD with embedded PBR textures, decreasing triangle budgets, sockets, and a capability-complete action corpus.
- `WF-R4` Ingest the first-person asset into the actual camera-space weapon path and the world asset into authored world/operator consumers; the former pistol-plus-addon fallback must not be selected for the crossbow.
- `WF-R5` Author a project-original opaque first-person arm skeleton with sleeves, gloves, palms, thumbs, and articulated fingers; include grip/action clips and PBR maps.
- `WF-R6` Select the authored arms in runtime, retain two-bone grip solving, keep materials opaque in hip/ADS/action states, and never alter authoritative camera rays or shot geometry.
- `WF-R7` Check in editable `.blend`, canonical generators, optimized self-contained GLBs, standalone source PBR maps, provenance, exact synchronized hashes, technical audits, and fixed-camera review renders/contact sheets.
- `WF-R8` Keep `qa:pass65:weapon-assets` fail closed for every uncompleted weapon/vehicle. Release-ready entries must pass structure, digest, glTF, Blender-source, socket, LOD, PBR, animation, and runtime-source checks.

## Acceptance criteria

- `WF-C1` Blender 5.1 opens each checked-in source and finds the expected asset identities, armature/bones, semantic parts, materials, images, and actions.
- `WF-C2` Official glTF validation passes; LOD hashes are unique and triangle counts strictly decrease within each family.
- `WF-C3` Crossbow GLBs contain the required semantic sockets and all required core action names; first-person/world/drop files are distinct.
- `WF-C4` Runtime tests prove the selected crossbow source is project-original, required detail/sockets resolve once, and the retired pistol source is absent for this ID.
- `WF-C5` Runtime tests prove the selected arm asset is the project-original skeleton, both arm chains resolve, visible materials remain opaque, and grip diagnostics are finite.
- `WF-C6` Fixed-camera crossbow and arm review sheets visibly show a coherent silhouette, compact optic, connected hands/fingers, opaque materials, and no detached geometry.
- `WF-C7` `verify:provenance`, `qa:asset-provenance`, focused tests, lint, and build pass. `qa:pass65:weapon-assets` reports only genuinely unfinished entries.

## Out of scope

- Crossbow projectile authority, fuse, stick, beep, blast, and network semantics are unchanged.
- Weapon balance, camera ray, hit admission, and collision authority are unchanged.
- The other seventeen weapon hero families and two blocked support-aircraft families are not declared complete by association.
- Publication, merge, or owner-HITL approval.

## Decisions and open questions

- The crossbow uses a restrained project-original graphite/gunmetal/tan palette with amber optic illumination. Real-world naming does not authorize copied trade dress.
- The first-person and world roots use metres and local `-Z` forward. Embedded sockets are the runtime source of truth; adapters may not duplicate them.
- Visual taste, final optic readability, action feel, and hand framing remain owner-HITL after all mechanical gates are green.
- Canonical rebuilds preserve audited structure, triangle budgets, semantics, maps, and action contracts. Blender container/render encoding is not claimed byte-deterministic; the finalizer refreshes exact hashes and every provenance gate verifies the checked-in result.
