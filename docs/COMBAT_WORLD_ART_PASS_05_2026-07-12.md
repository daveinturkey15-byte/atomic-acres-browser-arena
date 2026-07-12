# Atomic Acres — Combat & World Art Pass 05

Date: 2026-07-12
Branch: `overhaul/combat-world-art-pass-05`
Base: Pass 04 branch head `292e79d`; review build `5ac4b7c`

## Overview

Pass 05 should make the existing compact original arena feel materially more authored and responsive. It must deepen the three existing weapons and replace the most conspicuous prototype-looking world dressing before adding weapons, modes, or another map rescale.

The quality reference is the clarity, cadence, audiovisual layering, and grounded responsiveness of a polished early-2010s compact console FPS. No Call of Duty, Black Ops, Nuketown, or other protected geometry, assets, interfaces, names, sounds, signs, or exact layouts may be copied.

## Requirements

- **R1 — Synchronized weapon actions:** weapon animation, hand contact, muzzle/ejection points, casing/shell ejection, bolt/pump movement, magazine travel, and audio must derive from one authored action timeline per weapon.
- **R2 — Distinct discharge identity:** carbine, SMG, and scattergun must have distinct original close report, mechanical transient, low-frequency body, and short environmental tail generated with Web Audio.
- **R3 — Material-readable impacts:** world hits must select restrained concrete/metal/soil-or-vegetation/wood effects from explicit surface metadata or a deterministic material classifier; no copied particle textures or samples.
- **R4 — Incoming-fire readability:** near-miss rays should produce bounded crack/whizz feedback without leaking shooter location through walls or creating unbounded audio nodes.
- **R5 — Reload credibility:** the current magazine/pump hierarchy must gain weapon-specific staged actions. Gameplay ammo commitment remains authoritative and visual timelines may not alter rules or grant ammunition.
- **R6 — World-art replacement:** replace the most visible primitive cover/utility/garden dressing with original layered procedural assemblies while preserving all existing logical colliders, shot-blocker flags, hit zones, and traversal widths.
- **R7 — Performance preservation:** compatibility mode must retain `>=40 FPS`, `<=180` calls, and `<=350,000` triangles. Full-quality telemetry must not regress above Pass 04's verified `302` calls / `311,410` triangles without an explicitly documented reason.
- **R8 — Public stability:** canonical Pass 03 and the Pass 04 review path remain unchanged. Pass 05 may publish only to a separate review path after every gate passes.

## Acceptance checks

- **C1:** `npm run lint`, the full unit suite, and production build pass.
- **C2:** existing `9/9` functional Chromium scenarios pass; new deterministic tests cover any new material classification/action timeline helpers.
- **C3:** isolated clean-process Chromium performance gate passes unchanged.
- **C4:** normal and compatibility release QA report zero console errors and telemetry within R7.
- **C5:** two-browser PeerJS room/join, reciprocal remote presence, and prone replication pass.
- **C6:** visual review covers all three weapons in hip/ADS/fire/reload, scattergun pump-hand contact, representative impacts, menu composition, and revised world props.
- **C7:** git diff/check, asset provenance, and secret scan are clean; branch commit is pushed.
- **C8:** project note and PersonalBrain record contain exact evidence and limitations; any reusable surprising failure is written to AKP in Symptom → Cause → Correction → Verify form and synced immediately.
- **C9:** if published, the exact public revision passes release and multiplayer QA and a Pages tree diff proves canonical and Pass 04 files unchanged.

## Out of scope

- Literal recreation of Nuketown or Black Ops 2 assets/design.
- Additional weapons.
- Sliding, wall-running, advanced traversal, or wholesale movement rewrite.
- New objective modes, killcam, or server-authoritative networking.
- Mobile/touch controls.
- Replacing logical collision with visual-mesh collision.

## Decisions

- Improve depth, not breadth: finish three weapons before adding inventory.
- Keep the current physical camera-ray ADS and socket-driven arm IK authoritative.
- Prefer pooled particles and shared geometries/materials over per-event allocation.
- Use generated/synthesized original assets only.
- Preserve Pass 04 as the user-comparable baseline.

## Implemented review candidate

### Synchronized actions

- Added `weapon-actions.ts` with normalized, deterministic reload markers and poses.
- Carbine/SMG timelines now emit `mag-release`, `mag-out`, `mag-in`, `mag-seat`, and `bolt-release` from the same progress value driving magazine position and the left-hand IK target.
- Scattergun reload uses four authored shell insertion markers plus a final action event; a visible shell follows the loading-port pose.
- Added weapon-specific reload sockets. Magazine-fed reload sockets are parented to their moving magazines; the scattergun socket targets its loading port.
- Scattergun spent-shell ejection is delayed until the pump-rear phase instead of occurring at muzzle flash time.
- Added pooled single-draw-call muzzle smoke and retained the existing pooled casing/shell system.

### Combat feedback

- Added deterministic surface classification and finite-segment near-miss strength helpers with unit coverage.
- Hitscan results now preserve world impact point, transformed face normal, and classified metal/concrete/wood/soil evidence.
- Added a 72-particle, one-draw-call pooled impact presentation rather than per-hit geometry/material allocation.
- Ground and road planes now participate in shot raycasting with explicit soil/concrete metadata.
- Added original synthesized material-specific impacts, weapon tails, synchronized reload mechanisms, and bounded incoming crack/whizz feedback.
- Near-miss evaluation uses only the visible tracer segment after collider clipping, preventing through-cover audio leakage.

### World art and budgets

- Rebuilt cover dressing as framed modular test barriers with feet, recessed faces, and warning stripes while retaining the exact logical cover boxes.
- Added shared-material streetlamp heads, lower-density varied shrubs, and trellis foliage anchored to the upper lattice.
- Reduced tree-crown geometry from icosahedron detail 2 to detail 1 while retaining nine overlapping clusters per tree.
- Replaced decorative rounded barrier panels with simple box subassemblies after telemetry proved the bevels added roughly 37k unnecessary triangles.
- Full-quality release telemetry is `302` calls / `302,706` triangles: the same calls and 8,704 fewer triangles than Pass 04 (`302` / `311,410`).
- Compatibility telemetry is `59` calls / `73,054` triangles, below Pass 04's `59` / `76,894`.

## Local verification evidence

- TypeScript: passed.
- Unit tests: `59/59` across 11 files.
- Functional Chromium: `9/9`, including runtime verification that firing activates pooled impact particles and a complete SMG reload emits the exact authored event sequence.
- Clean isolated performance gate: passed unchanged (`>=40 FPS`, `<=180` calls, `<=350,000` triangles).
- Normal and compatibility release QA: zero console errors.
- Two-browser PeerJS QA: room creation/join, reciprocal remote presence, and prone replication passed; observed spawn separation `24.19 m`.
- Visual review covered menu composition, optimized modular barriers, tree/trellis dressing, carbine hip presentation, and reload framing.

## Remaining limitations

- Gameplay ammo still commits atomically at the existing reload-completion boundary; the staged presentation never changes ammunition rules.
- World operators do not yet replicate reload events or death-collapse actions.
- No sampled convolution/reverb is used; the environmental tails are deliberately lightweight synthesized layers.
- Impact particles classify authored visual/raycast materials, but analytic bot/remote cover collisions conservatively use concrete feedback.
- Multiplayer remains peer/victim validated rather than server authoritative.
- No mobile controls, new mode, killcam, or additional weapon was added in this pass.

## Public review deployment

- Source revision: `239a1da`.
- Pages revision: `e97b9fb`.
- Review URL: `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass05/?release=239a1da`.
- The Pages diff from Pass 04 contained 15 files, all under `review/pass05/`; canonical root and `review/pass04/` were unchanged.
- Public full-quality release QA: zero console errors, `302` calls / `302,706` triangles.
- Public compatibility release QA: zero console errors, `59` calls / `73,054` triangles.
- Public two-browser PeerJS QA passed room creation/join, reciprocal remote presence and prone replication with `24.19 m` observed spawn separation.
- Public menu and first-person gameplay smoke checks found no missing assets, catastrophic clipping or release blocker.
