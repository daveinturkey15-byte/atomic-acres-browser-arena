# Pass 51 — Rustworks cleanup, collision cover, horizon ocean

## Overview
Remove the visibly disconnected/floating industrial pieces from Rustworks, simplify the middle/tower silhouette, restore a few useful collision-backed shipping cover objects away from the central lanes, and make the ocean visually continue to the camera horizon.

## Evidence / observed faults
- Screenshot shows a disconnected orange pulley ring, hanging cable/block, dark boom/slab pieces and loose light-like objects floating above/right of the tower.
- The central tower has overlapping crane/process/cable detail that reads as clutter rather than one coherent structure.
- The deck is too open after the prior declutter pass.
- The 360 m ocean plane ends at the camera far distance and can expose sky/void instead of a sea horizon.

## Requirements
- **R1:** Remove the crane boom/trolley/cable/hook/pulley family from both procedural and Blender Quality presentation.
- **R2:** Remove loose cable trays and decorative process-pipe runs from the tower middle/upper deck. Retain structural legs, bracing, decks, access ramp/ship ladder, compact control hut/manifold, canopy, and flood lighting.
- **R3:** Add 4 full-collision shipping-container/pallet-stack cover groups near outer deck quadrants, outside the central 12 m apron and clear of spawn points/cross lanes.
- **R4:** Containers/pallets must block players, physics, and shots; presentation and collision footprints must agree.
- **R5:** Keep the near animated ocean/wave mesh and add a far ocean ring extending beyond the 180 m camera far plane, overlapping below the near mesh so no seam/edge exposes void.
- **R6:** Preserve Passes 47–50: night/floods, score/leaderboard, headshot contract, and main-menu changelog.

## Mechanical acceptance checks
- **C1:** No runtime or GLB semantic/name includes crane boom/trolley/cable/hook/pulley.
- **C2:** No GLB cable-tray or process-pipe-run objects remain.
- **C3:** At least 3 `rustworks-shipping-container` and 3 `rustworks-pallet-stack` meshes exist with matching player/physics/shot colliders.
- **C4:** Every spawn remains outside all colliders and tower traversal tests pass in both directions.
- **C5:** Water telemetry reports near ocean size >= 400 m and horizon radius >= 1000 m; root has near + far ocean surfaces.
- **C6:** TypeScript, focused tests, full build, and browser smoke/visual checks pass.
- **C7:** Source branch is committed and an isolated HTTPS review serves the exact verified bytes. Production promotion requires Dave's visual acceptance.

## Out of scope
- No gameplay/netcode, weapon, scoring, or lighting-rule changes.
- No map resize or host/match changes.
