# Pass 64 WebGPU, gameplay correctness, railgun, arena quality, and HUD overhaul

Date: 2026-07-25  
Impact: `runtime`  
Base candidate: Pass 63 accepted preview source `ac85e9b8b46cc2370aee903d564ecf3c4682b24c`; merged main comparator `1bd55076c952080d5f7a8a5b0b8869aaa0646a76`
Release intent: immutable WebGPU HITL candidate only; do not publish before Dave approves its exact preview.  
Rollback: byte-exact Pass 62 stable benchmark; Pass 63 remains the legacy-stack live comparator after its protected release completes.

## Claim states

- **Observed:** Pass 62 source `249a7ee77dce761eb237f3eb0e0d0ea1d0356317` and Pages `27c90967bdaf5387c0372933c7965a60ce75a765` are the owner-designated best-ever netcode benchmark. Its nested runtime digest covers 118 files excluding its original provenance; the copied subtree has 119 files.
- **Observed:** post-match lobby return clears one active-match timestamp but leaves the host-time twin populated, so mixed snapshots can reject Ready.
- **Observed:** guests visually regenerate after five seconds, while the host's remote health ledger does not; a later small host-authoritative hit can therefore kill a guest who sees high health.
- **Observed:** corpses choose a procedural bounded operator instead of the canonical rigged live operator family. The old style is generated runtime code, not a removable art file.
- **Observed:** the principal half-float HDR target does not declare samples, while antialias telemetry describes only the canvas context.
- **Observed:** all arena roots are constructed eagerly; renderer, networking, gameplay, and UI ownership remain concentrated in `main.ts`.
- **Observed:** Terminal's replacement aircraft shell is front-sided, so an interior ceiling/roof can disappear; local lights/effects can still read through opaque walls in Terminal and other arenas.
- **Inference:** Pass 62 netcode quality should be preserved by isolating renderer/UI work from combat authority and by comparing deterministic network traces, not by copying the whole old runtime into Pass 64.
- **Assumption:** the railgun's constant 50 damage ignores ordinary surface attenuation and has eight total rounds; a dropped railgun retains remaining rounds and can never receive ammo.
- **Unknown:** representative production WebGPU adapter/device performance and final visual preference require Dave's immutable-preview HITL session.
- **Falsifier:** any required WebGPU route silently falls back, any Pass 62 authority invariant changes without an explicit requirement, or a published Pass 64 candidate lacks exact preview approval.

## Fixed requirements

### R1 - Release and benchmark provenance

Pass 62 remains a byte-exact stable subtree and hard best-netcode benchmark. Pass 63 becomes Live through the protected exact-SHA workflow before Pass 64 claims it as the legacy comparator. Benchmark receipts distinguish the 118-file digest from the complete 119-file source subtree and separate wrapper provenance.

### R2 - Repeatable private-match lobby lifecycle

After a match ends, host and every connected guest return to one pure lobby snapshot, can all Ready again, and the host can start a second match without recreating the room. Both active-match timestamps, countdown, scores, life epochs, stale ready state, and transient match events reset consistently.

### R3 - Health authority and delayed-death correction

The host owns remote-player damage and deterministic regeneration using the same delay/rate/cap contract shown to the guest. Snapshots cannot reduce a guest's displayed health merely because the host ledger omitted regen. Duplicate/stale damage stays exactly-once and Pass 62 authored-shot timing is unchanged. Retain a sanitized last-completed multiplayer diagnostic summary for future causality checks; never retain chat, credentials, task titles, or private text.

### R4 - Canonical corpse presentation and clean redeploy

Human and bot corpses snapshot the same canonical rigged operator family, team appearance, and weapon presentation used in life. No procedural/blocky humanoid runtime fallback remains. Selecting a class in-match offers an authoritative redeploy that applies the class on respawn without emitting a kill, death, corpse, drop, score, streak, or combat-feed event. This supersedes Pass 62 R9's implementation detail while preserving its immediate class-change outcome.

### R5 - Host-authoritative Nuke Town railgun

At host time +180 seconds in Nuke Town only, one railgun spawns uniformly at a validated upstairs-room point chosen from the eligible houses and announces `RAILGUN SPAWNED` once to all players. A host-validated pickup replaces the primary weapon. Each valid shot deals 50 damage, penetrates all map surfaces with multiplier 1, consumes one of eight total rounds exactly once, forces ADS exit, and requires a 1.5-second rechamber before ADS/fire. Ammo never replenishes through respawn, scavenging, pickups, support, or duplicate messages. A dropped/reclaimed railgun retains remaining ammunition. While ADS, its WebGPU thermal presentation marks living hostile players/bots through walls but never friendlies, corpses, or stale lives.

### R6 - Arena visual definitions and selected-only streaming

One `ArenaVisualDefinition` exists for every stable arena ID. It declares presentation assets/root, lighting, fog, shadows, atmosphere, HDR color settings, budgets, deterministic cameras, abort/generation, and idempotent disposal while authoritative `ArenaMap` remains separate. Only the selected arena module/assets are requested. Switching loads detached, validates, attaches atomically, rejects stale loads, disposes the prior arena, and returns stabilized memory/draw counts to frozen limits.

### R7 - Real WebGPU and TSL migration

Pass 64 uses an async backend-neutral renderer port. `renderer=webgpu&requireWebGPU=1` succeeds only after initialization proves an actual WebGPU backend; fallback, device loss, uncaptured error, or software-adapter policy violation rejects HITL. Every custom GLSL path is represented by TSL/node materials on the WebGPU route, with zero `ShaderMaterial`, `RawShaderMaterial`, or GLSL strings in the loaded WebGPU chunks. WebGL2 remains an isolated compatibility adapter, not the required preview.

### R8 - Controlled HDR, truthful AA, lighting, and geometry quality

Scene/depth, occluded bloom, exposure/tone mapping, grade, deterministic dither/grain, and output transform form one declared linear-HDR pipeline. Telemetry distinguishes canvas, principal HDR, and bloom samples; diagonal-edge quality tests validate the offscreen path. Opaque walls reject local-light/effect contribution by deterministic pixel ROI, while open apertures admit it. Terminal has a separately sided interior ceiling/roof that does not close boarding openings. All arenas pass floating/orphan geometry, door semantics, roof/floor, collider, asset-coherence, and review-camera gates in Performance and Quality.

### R9 - Canonical map labels and order

Player-facing current text and exports use Nuke Town, Terminal, RustRig, Gun Range in that order. Stable machine IDs remain compatible. `atomic_acres` and `rustworks` may appear only in explicit compatibility, historical, provenance, main public URL/repository identity, or source-asset filename boundaries; current UI and authored descriptions never emit the retired labels.

### R10 - Modern behavior-complete HUD and menu

The redesigned minimal tactical-tech shell preserves every chooser, callsign, lobby, ready/start/leave, map, class, option, chat, combat HUD, overlay, diagnostic, report, and accessibility surface in a typed inventory. UI dispatches intents rather than mutating authority. Keyboard focus is trapped/restored, tablists support arrow keys, chat/modal input suppresses gameplay, reduced motion and readable scale work, and deterministic desktop/laptop/short/ultrawide/narrow screenshots have no critical clipping or overflow.

### R11 - Performance, determinism, and immutable HITL

Before implementation-derived tuning, freeze Pass 63 per-arena/profile request, memory, draw-call, CPU/GPU frame-time, and review-camera baselines. Pass 64's full WebGPU matrix covers every arena in Performance and Quality; WebGL compatibility covers supported profiles; collision/gameplay identity and Pass 62 network traces remain green. The immutable preview receipt records backend/adapter/device features, pipeline hashes, samples, active arena/chunks, camera ID/seed/time/exposure, zero legacy shaders, errors/device loss, and budget results. Dave approves that exact SHA before merge or publication.

## Out of scope

- Rebuilding or adapting the Pass 62 stable bytes.
- Replacing PeerJS/WebRTC topology, adding public matchmaking, accounts, or chat persistence.
- Broadly renaming historical documents, provenance records, URLs, stable machine IDs, or source assets solely to erase legitimate history.
- Claiming structural telemetry as proof of lighting, roof, model, or HUD visual quality.

## Release gates

Freeze thresholds and camera IDs before implementation; keep unit/contract, two-peer lifecycle, deterministic visual, backend identity, streaming/disposal, performance, and release-topology gates distinct. Do not weaken one to compensate for another. The final candidate changes exactly one `acceptance/pass-64.json`, maps R1-R11 to evidence, and retains the protected Pass 62 rollback channel.
