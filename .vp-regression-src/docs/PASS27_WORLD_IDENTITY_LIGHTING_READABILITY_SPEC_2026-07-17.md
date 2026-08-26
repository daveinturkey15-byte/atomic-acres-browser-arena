---
title: Pass 27 World Identity, Lighting and Route Readability
status: in-progress
owner: Dave / Jigglyclaw
date: 2026-07-17
baseline: 9321a6df1493292c9d90b75354776e47767f82e1
---

# Pass 27 — World Identity, Lighting and Route Readability

## Overview

Implement Dave's selected priorities 5, 6 and 7 before the proposed Combat Presence work:

1. give Atomic Acres a distinctive original near-future fiction;
2. replace flat presentation with authored lighting and atmospheric depth;
3. strengthen environmental storytelling and the visual roles of the arena's routes.

The target is the rapid comprehension, grounded near-future confidence and route readability associated with excellent early-2010s arena shooters, translated into wholly original Atomic Acres expression using deterministic 2026 authoring. No commercial FPS geometry, asset, texture, logo, name, UI, sound, extracted data or exact audiovisual treatment may be copied.

## Art-direction north star

Atomic Acres is a sun-bleached automated agricultural suburb and civil-defence demonstration site converted into a live combat arena. Optimistic domestic architecture collides with weathered agritech, emergency retrofits and recent conflict.

Palette and material roles:

- chlorophyll green and greenhouse glass identify the west cultivation route;
- oxidized copper, warm asphalt and amber civil-defence markings identify central transit;
- graphite machinery, photovoltaic blue and grow-light violet identify east service;
- Aqua and Coral remain team-identification colors rather than becoming route colors;
- saturated values are reserved for navigation, interaction and team readability.

## Requirements

- **R1 — Gameplay authority:** Preserve gameplay constants, Rapier controller settings, movement traces, weapons, camera input, hit logic, spawn logic, networking, arena bounds, collision topology, route openings and all six semantic breakable-window bindings.
- **R2 — Original world identity:** Add only project-original, locally generated environment art with deterministic source, editable Blender source and manifest provenance.
- **R3 — Route roles:** Present three unmistakable macro routes without altering their collision authority:
  - west cultivation: concealed/flanking, greenhouse and irrigation language;
  - central transit: broad/exposed, public-mobility and civil-defence language;
  - east service: hard-cover/technical, solar, battery and maintenance language.
- **R4 — Lighting hierarchy:** Author a coherent sky/sun/fog palette, stronger sun-to-fill separation, atmospheric depth and restrained route-local illumination. Avoid post-processing that obscures opponents or destabilizes frame pacing.
- **R5 — Contact grounding:** Add bounded presentation-only grime/contact patches, facade wear, drainage, cables, rooftop retrofits and operational props without implying false cover or blocking routes.
- **R6 — Readability instrumentation:** Encode route identity as a pure checked contract and expose non-authoritative telemetry proving all three route roles, cue positions and current zone labels are present.
- **R7 — Profiles:** Keep exactly Performance and Blender Render visible. Performance receives the sky/fog/readability contract and bounded lightweight cues; Blender Render receives the full deterministic GLB detail pass.
- **R8 — Performance:** Preserve adaptive pixel ratio and static-shadow policy. Route lights cast no additional shadows. Keep release files and GLB within checked budgets.
- **R9 — Review boundary:** Do not alter canonical GitHub Pages until Dave explicitly approves promotion. Produce local exact-build screenshots and verification evidence first.
- **R10 — Deferred work:** Do not implement proposed points 1–4: hero M86, first-person arms, authored weapon audio or HUD reduction.

## Acceptance checks

- **C1:** `npm run verify:gameplay-contract` passes and the golden gameplay replay remains byte-identical.
- **C2:** Unit tests prove exactly three route roles, stable zone labels, bounded cue placement and no modification to `ARENA_BOUNDS`, `COVER_LAYOUT`, `HOUSE_LAYOUT` or `SPAWN_LAYOUT`.
- **C3:** Two consecutive deterministic authoring runs produce a byte-identical release GLB; GLB audit proves six semantic windows, three semantic route landmarks, zero external URIs, bounded triangles/materials/draw calls and manifest/checksum consistency. The editable `.blend` remains checksum-tracked for the revision but is not the byte-reproducibility target because Blender embeds volatile source metadata.
- **C4:** Browser debug telemetry reports the World Identity pass, three route identities, expected sky/fog/lighting profile and required hero landmark nodes.
- **C5:** Exact runtime screenshots demonstrate distinct west/central/east signatures, stronger near/mid/far separation, grounded large props, readable opponent silhouettes and no misleading visual collision.
- **C6:** Performance and Blender Render boot cleanly with no page/console errors; affected bounded Chromium groups pass with retries disabled for focused cases.
- **C7:** `npm run lint`, `npm test`, `npm run build`, `npm run verify:release-tree`, dependency audit and `git diff --check` pass.
- **C8:** Owner review evidence is produced without changing the canonical live root.

## Out of scope

- Hero weapon/arm replacement, weapon-audio replacement, HUD redesign or combat rebalance.
- New authoritative cover, new paths, changed map bounds, changed spawns or changed house collision.
- WebGPU-only rendering, mandatory post-processing, copied map geometry or copied near-future military branding.
- Public canonical deployment before owner approval.

## Decision record

- Dave selected points 5, 6 and 7 before points 1–4 on 2026-07-17.
- Preserve gameplay and treat Blender/Three.js additions as presentation-only.
- Use WebGL as production authority; optional future WebGPU work remains separate because current broad-browser availability is not universal.
- The three world routes are now named **Verdant Array**, **Civic Transit** and **Helio Service**. Their palette is environmental rather than team-IFF: chlorophyll/violet, amber/alloy and photovoltaic/violet respectively.
- Semantic route contracts export as three named empty GLB nodes so visible geometry can stay material-batched. One atlas-backed runtime mesh carries all three labels. This preserves checked route identity while keeping stable Blender gameplay at **92 draw calls**, inside the reviewed **95-call cap**.
- World-space ring cues and decorative dust were removed after measurement: the authored GLB already supplies flush route cues and contact grounding, while the redundant runtime layers cost seven draws without materially improving the sight picture.
- Headless SwiftShader can update the full Blender frame near 1–2 Hz on this WSL harness. The production target remains a stable 60 FPS floor on supported hardware; the heavy browser verifier therefore uses a 120-second case limit and a 30-second transient-cleanup window without changing simulation assertions.
- Two consecutive Blender authoring runs produced the same release GLB SHA-256. The `.blend` and preview remain revision-checksummed rather than byte-reproducibility targets because Blender source metadata is volatile.

## Implemented presentation

### Verdant Array — cultivation flank

- low, visibly traversable hydroponic beds;
- overhead irrigation pipework and violet grow rails;
- reclamation tank, greenhouse language and green route framing;
- relocated route sign with a clear west-route approach view.

### Civic Transit — exposed centre

- overhead civil-defence signal gantry;
- flush evacuation lane cues which do not alter collision;
- public-transit coach/truck composition retained as the principal hard-cover read;
- warm roadway, amber signal and long-sightline hierarchy.

### Helio Service — technical hard-cover route

- photovoltaic canopy spines, battery diagnostics and coolant hardware;
- violet service accents separated from Aqua/Coral team IFF;
- relocated label away from the atomic beacon mast;
- existing authoritative service walls remain the hard-cover boundary.

### Shared world language

- habitat roof sensors and civil-defence retrofits;
- distant original agricultural wind-energy silhouettes beyond collision bounds;
- contact-grime patches beneath large authored objects;
- profile-specific procedural sky, sun disc, cloud bands, fog, warm sun and cool fill;
- three bounded non-shadow route lights and one atlas-backed sign draw.

## Measured asset and runtime contract

| Measure | Pass 27 result |
|---|---:|
| Release GLB | 4,757,008 bytes |
| GLB meshes | 26 |
| Exported materials | 20 |
| Triangles | 24,176 |
| Embedded images | 21 |
| Texture bindings | 28 |
| PBR materials | 8 |
| Breakable-window nodes | 6 |
| Semantic route landmarks | 3 |
| Blender menu draw-call cap | 70 |
| Stable Blender gameplay draw-call cap | 95 |
| Observed stable Blender gameplay draws | 92 |

The authoritative golden replay remains byte-identical at `edf1393d958452a8c73fea14055822b30febd18a0e57c197d0f94fc2bdc2df03`. `ARENA_BOUNDS`, `COVER_LAYOUT`, `HOUSE_LAYOUT`, `SPAWN_LAYOUT`, weapon constants, controller settings, collision, bots and networking are unchanged.

## Verification record

- `npm run verify:pass25a:core`: passed.
- TypeScript: passed.
- Gameplay contract: passed after reviewing an environment-lighting-only contract diff.
- Golden replay: byte-identical.
- Unit/property tests: **225/225 passed across 47 files**.
- Production build: passed.
- Release-tree audit: passed (`44` files, zero rejected candidates, zero oversized files).
- Dependency audit: zero vulnerabilities.
- Pass 26 FPS-HUD verifier: passed; WSL software rendering reported slow pacing and is not treated as a native-GPU 60 FPS measurement.
- Two-run GLB determinism: passed.
- Focused complete-Blender/window binding case: passed with retries disabled.
- Focused three-route presentation case: passed with retries disabled and captured west/centre/east evidence.
- Seeded menu visual changed by an intentional 7% for the new Pass 27 hierarchy, mandatory callsign and records card; the actual was visually audited before the screenshot baseline was regenerated and re-passed.
- The six-weapon authoritative-ray matrix was partitioned into one independently timed case per viewport without dropping assertions; 960×540, 1280×720 and 1920×1080 all passed retries-disabled.
- Exact-final bounded E2E: passed end to end with exit `0` across `pass25a-baseline`, headed `pointer-lock-headed`, Chromium capability, `boot-and-authored`, headed `field-kit-persistence`, `solo-mechanics`, fresh-browser `tri-pass-support`, `performance-and-stability`, Firefox capability and WebKit capability.

## Pass 27B — continuous streaks and persistent records

Dave's owner review added three release requirements while this branch was still private:

1. Field-support eligibility may repeat on its 3/5/7 cadence, but the player-facing streak must continue from 7 to 8, 9, 10 and beyond until death.
2. A player must provide an intentional callsign before solo, host or join can start.
3. Completed-match high scores must survive build updates and surface in real time where the static hosting architecture permits.

### State separation

`FieldSupportState` now owns two explicit counters:

- `streak`: continuous life streak; resets only on death or a fresh match;
- `rewardCycle`: repeatable 3/5/7 eligibility progress; resets to zero after Tri-Pass without changing `streak`.

`bestStreakThisMatch` retains the match peak after death so the completed record reports the actual best run.

### Callsign gate

The deployment menu begins blank unless a previously validated callsign exists in `atomic-acres:player-name:v1`. Solo, host and join handlers validate before network/reset side effects. Allowed names are 1–16 visible alphanumeric/space/underscore/hyphen characters after normalization. Invalid input remains in the menu with an accessible error.

### Persistent score contract

`src/high-scores.ts` defines schema `1` under stable-origin storage key:

```text
atomic-acres:high-scores:v1
```

A record contains a bounded ID, normalized name, match kills, deaths, best streak, win flag and epoch timestamp. Match kills and best streak are capped at 100 so legitimate multi-elimination overshoot beyond the 25-point team limit is preserved while hostile payloads remain bounded; deaths are capped at 200. Ranking is deterministic: kills descending, best streak descending, deaths ascending, victory, timestamp, ID. Duplicate IDs collapse and the top 20 records persist.

This survives GitHub Pages build replacements because browser storage is origin-scoped, not asset-hash/build scoped. It does **not** pretend static Pages can safely append to a global server log.

### Real-time synchronization

- same-origin tabs merge through `BroadcastChannel` plus the browser `storage` event;
- active multiplayer peers exchange bounded `leaderboard-sync` payloads after join and bounded `high-score` payloads after match completion;
- the host binds both message types to the already established peer player ID;
- score payloads accept at most 20 records and reject malformed names, impossible kill/streak bounds, oversized IDs and future timestamps;
- direct completed-score claims must match the established sender's callsign.

The result is a serverless, peer-carried leaderboard: durable on each browser, live inside an active lobby, and propagated between players who meet. A tamper-resistant globally shared ladder across disconnected users would require a separately authorized HTTPS backend and server-side authority.

### Pass 27B verification added

- unit coverage for continuous streak/reward-cycle separation;
- unit coverage for name normalization, versioned persistence, ranking, deduplication and hostile payload rejection;
- protocol coverage for bounded score and leaderboard messages plus player-ID binding;
- browser coverage for name gating, stored-name reuse, persistent leaderboard rendering, same-origin live updates and completed-match recording;
- multiplayer transport QA seeded a host record and proved it reached the guest through the real PeerJS connection;
- three-cycle host/join/leave lifecycle QA verified mandatory callsigns do not regress lobby reuse.
