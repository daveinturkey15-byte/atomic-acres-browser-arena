# Atomic Acres — Combat Presentation Pass 07

Date: 2026-07-12
Branch: `overhaul/combat-presentation-pass-07`
Base: Pass 06 documentation head `a04aec6` / hardened game source `86bf2be`

## Overview

Pass 07 targets the largest remaining moment-to-moment quality gap: the first-person carbine, hands, weapon motion, combat transients, sound, and third-person operator response. The first deliverable is one highly coherent carbine vertical slice whose systems can later be transferred to the SMG and scattergun.

The quality reference is the immediacy, readability, mechanical layering, and animation discipline of a polished early-2010s console arena FPS. Atomic Acres remains an original work: no commercial weapon model, animation, audio sample, texture, UI, character, branding, or proprietary data may be copied or extracted.

## Requirements

### R1 — Carbine silhouette and material hierarchy

- Replace the long primitive rectangular read with an original, mechanically legible silhouette: receiver shell, handguard, barrel assembly, stock/cheek rest, grip/trigger guard, magazine, optic, sights, charging/bolt details and controlled accent panels.
- Preserve the existing physical sight axis and camera-ray authority.
- Use original generated/procedural materials only.
- Keep compatibility mode comfortably under existing call/triangle budgets.

### R2 — First-person hands and weapon motion

- Make both arms/hands visibly read as articulated operator limbs rather than dark tubes.
- Preserve IK socket solving and keep animation presentation-only.
- Add coherent fire-cycle timing, bolt travel, magazine extraction/insertion, support-hand motion, sprint posture, recoil recovery and landing response.
- Avoid camera-obscuring motion and motion sickness.

### R3 — Combat transients

- Use bounded pooled effects for muzzle flash, smoke, casings and surface impacts.
- Give the carbine a multi-stage flash and heat-aware smoke response without unbounded allocations.
- Surface deterministic presentation state through testable pure helpers and the existing debug API.

### R4 — Original layered audio

- Improve the carbine shot with separate transient, body, mechanism and outdoor tail layers.
- Add surface-specific footsteps for asphalt/concrete, soil and wood.
- Keep all audio synthesized through Web Audio; no external samples.
- Preserve throttling and bounded duration for repeated events.

### R5 — Operators and hit response

- Improve team silhouette/readability with asymmetric original gear, stronger shoulder/torso identification and better limb proportions.
- Add short presentation-only flinch/reaction poses for body/head hits.
- Do not move, resize or detach authoritative hit-zone meshes as a consequence of visual recoil/flinch.
- Preserve stance and weapon replication.

## Out of scope

- Literal Black Ops 2/Nuketown recreation or copyrighted assets.
- New maps, traversal systems, game modes, progression, attachments or additional bot lethality.
- Replacing the network authority model.
- Ragdolls or a new physics-body system.
- A full simultaneous art overhaul of all three weapons before the carbine slice is proven.

## Acceptance checks

- **C1:** TypeScript lint and production build pass.
- **C2:** Unit tests cover deterministic fire-cycle/heat state, reload transform continuity, surface-footstep classification and hit-reaction envelopes.
- **C3:** Existing gameplay, input, bounds, multiplayer and combat tests remain green.
- **C4:** Chromium verifies the carbine model sockets/details, bounded pooled transients, menu identity, stance flow and debug presentation telemetry.
- **C5:** Isolated Chromium performance remains `>=40 FPS`; threshold is not weakened.
- **C6:** Compatibility remains `<=180` calls and `<=350,000` triangles; full-quality telemetry is recorded.
- **C7:** Normal, compatibility and two-browser multiplayer QA report zero console errors.
- **C8:** Visual review confirms a materially improved carbine/arms silhouette at hip and ADS with no clipping, black geometry, sight misalignment or HUD obstruction.
- **C9:** Credential-pattern scan and `git diff --check` pass before any push.
- **C10:** Any public candidate changes only `review/pass07/`; canonical and prior review paths remain untouched.

## Initial observed baseline

The public Pass 06 first-person capture shows the carbine as a long dark rectangular mass with minimal side-plane breakup. The optic ring reads, but the receiver, handguard, stock, magazine and barrel do not separate clearly. Hands/arms mostly collapse into dark cylindrical silhouettes, and the muzzle assembly is visually weak from the normal hip pose. Existing source already supplies useful foundations—IK sockets, staged reload markers, pooled casings/smoke, bolt motion, layered synthesized audio and pooled surface impacts—so Pass 07 should deepen those systems rather than replace them wholesale.

## Implemented candidate

- Rebuilt the original M86 carbine with separated receiver, upper, fore-end, stock, grip, trigger components, magazine ribs, barrel/gas assembly, rail, optic frame/lens/reticle, charging handle and animated bolt.
- Rebuilt the first-person limbs with capsule upper/forearms, cuffs, palms, thumbs and finger silhouettes. The first-person-only stock pieces that entered the camera were hidden without changing the third-person weapon.
- Added a deterministic `weapon-presentation-state` seam for heat, flash, bolt/casing timing and presentation-only hit reaction.
- Added heat-aware smoke, a short multi-stage muzzle flash, bolt-open case ejection and a fuller magazine extraction/insertion path.
- Added surface-classified synthesized footsteps and changed scheduling from held input/time to actual applied horizontal displacement.
- Added asymmetric operator radio/shoulder/utility gear and presentation-only reactions. Operator weapon meshes are explicitly non-raycast presentation objects, so visual recoil cannot move authoritative hit proxies.
- Added fixed-capacity one-draw tracer and impact-mark pools. Tracer endpoints remain the authoritative camera-ray result while visual starts come from the current weapon muzzle.
- Hardened remote shot presentation with connection identity binding plus known-sender, weapon, direction, origin, nonce and cadence admission. This bounds tracer/audio work without changing the existing damage-authority design.
- Gated ADS accuracy and crosshair suppression on the actual viewmodel ADS blend reaching `0.9`; camera-ray firing remains authoritative.
- Centralized reload interruption so pre-seat reloads cancel cleanly on menu interruption and all reload visuals are reset on completion, death, respawn, mode reset and weapon switch.
- Compatibility construction removes the viewmodel point light and hides micro-geometry/presentation gear while retaining required sockets and semantic debug nodes.

## Candidate evidence

- TypeScript lint: passed.
- Unit tests: **80/80** across 16 files.
- Functional Chromium: **11/11** scenarios passed.
- Isolated Chromium `>=40 FPS` gate: passed after compatibility-only micro-geometry reductions; threshold unchanged.
- Local full-quality release QA: passed, zero console errors, **547 calls / 333,258 triangles**.
- Local compatibility release QA: passed, zero console errors, **75 calls / 70,486 triangles**.
- Local two-browser PeerJS QA: passed; one remote each, prone stance replicated, spawn separation `24.19 m`, zero errors.
- Final full-quality visual review: ADS axis centered, gold optic reticle visible, lens readable, stock fragments removed, no catastrophic clipping or HUD obstruction.
- Known limitation: first-person gloves and operator bodies remain deliberately procedural/stylized rather than skeletal AAA character assets. Physical controller feel remains a manual review item.

## Audit reconciliation

Two independent read-only audits completed and one operator audit timed out. Confirmed high-priority findings were corrected: ADS/physical-sight synchronization, reload lifecycle interruption, carbine silhouette/material hierarchy, bolt/magazine timing, distance/surface footsteps, pooled tracers, remote-shot admission, compatibility construction, operator presentation safety and bounded debug telemetry. The timeout produced no evidence; operator behavior was instead covered by local source review plus deterministic browser assertions for gear presence and non-raycast weapon presentation.
