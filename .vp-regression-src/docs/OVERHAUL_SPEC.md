# Atomic Acres V2 — Production Overhaul Specification

Status: research-backed specification in progress  
Model of record: OpenAI Codex `gpt-5.6-sol`, high reasoning (verified 2026-07-11)  
Owner playtest verdict: V1 is not fit for purpose; it presents as primitive geometry and lacks the required gameplay depth.

## 1. Overview

Replace the current technical prototype with a polished, original, near-future suburban arena FPS that captures the fast two-house, central-vehicle, close-quarters rhythm requested by Dave without copying protected Black Ops II assets, branding, textures, sounds, or extracted map geometry.

The public V1 remains available while V2 is developed on `overhaul/production-fps-v2`. V2 must not replace production until its vertical-slice and release gates pass.

## 2. Claim state

### Observations

- V1 compiles and its 10 existing unit tests pass.
- V1 world art is built almost entirely from runtime primitive geometry in `src/map.ts`.
- V1 uses one four-primitive first-person weapon model for all weapons in `src/main.ts`.
- V1 collision is a horizontal circle against axis-aligned boxes with a flat ground height.
- V1 audio is synthesized oscillator/noise output.
- V1 PeerJS host relays client-reported state, hits, deaths, and scores.
- Dave's direct playtest says V1 is not fit for purpose and barely contains the basic mechanics.

### Inferences

- Passing compilation and narrow unit tests did not validate the product brief.
- Incrementally decorating V1's primitive map will not reach the target; the art, controller, combat, match simulation, and networking layers need architectural replacement.

### Unknowns to resolve during research

- Final rendering baseline: WebGL2-only Three.js versus progressive WebGPU with WebGL fallback.
- Physics choice and measured bundle/runtime cost.
- Asset production mix: Blender-authored original GLB assets, CC0 source materials, and generated textures.
- Free-tier authoritative-host options and TURN constraints.
- Supported player count after real network/performance testing.

## 3. Product requirements

- **R1 — Original arena identity:** a legally distinct retro-future suburban test town with two opposing hero houses, traversable interiors, back gardens, garages, central vehicles, flank routes, readable landmarks, and deliberate combat sightlines.
- **R2 — Authored visual assets:** replace placeholder primitives with UV-mapped modular environment kits, proper materials, props, decals, foliage, sky/lighting treatment, weapon models, character rigs, and effects. Primitive geometry may remain only for invisible collision/debugging or intentionally simple distant dressing.
- **R3 — FPS controller:** fixed-timestep movement with stable collision, grounded state, slopes/steps where supported, acceleration/deceleration, sprint, jump, crouch, camera motion, configurable sensitivity, and deterministic tests.
- **R4 — Combat:** distinct weapon models and animations, ADS, hip-fire, recoil patterns, spread/bloom rules, reload stages, weapon switching, muzzle flash, impact effects, damage falloff, head/body hit regions, hit confirmation, elimination flow, and data-driven tuning.
- **R5 — Multiplayer:** host-authoritative match state and damage validation; bounded inputs; snapshot interpolation; client prediction/reconciliation where justified; sequence/timestamp handling; disconnect/rejoin behavior; synchronized timer, scores, spawns, deaths, and match transitions.
- **R6 — Game loop:** lobby, team assignment, warm-up, active match, score/time victory, scoreboard, rematch, spawn protection, spawn selection, and useful solo practice.
- **R7 — Audio:** spatial weapon reports, tails, impacts, footsteps, reload/foley, UI feedback, ambience, buses, and user volume controls using original or license-audited assets.
- **R8 — UX/accessibility:** coherent menu/HUD, loading progress, settings, keybind guidance, reduced motion, color-safe team identification, readable feedback, failure recovery, and desktop-browser support messaging.
- **R9 — Performance:** explicit budgets for draw calls, triangles, textures, compressed asset payload, frame time, memory, network bandwidth, and long-task/freezing behavior; adaptive quality presets.
- **R10 — Legal/source hygiene:** an asset manifest records creator/source, license, modification, and attribution requirement for every external asset. No ripped game content or trademark-dependent public branding.
- **R11 — Free deployment:** static client hosting remains free; any signaling/relay/authoritative component must fit a documented free tier or have a zero-cost peer-host fallback with limitations disclosed.
- **R12 — Reliability:** errors are visible and recoverable; malformed or hostile peer messages cannot mutate authoritative state; automated and browser-level tests cover critical gameplay and multiplayer flows.

## 4. Mechanical acceptance criteria

- **C1:** TypeScript strict check, unit tests, integration tests, production build, and asset-license audit all exit 0.
- **C2:** Automated controller tests cover collision, sliding, jumping, crouching, stairs/slopes if implemented, fixed-step consistency, and out-of-bounds recovery.
- **C3:** Combat tests cover fire cadence, ammo/reload, recoil/spread bounds, range falloff, hit regions, death/respawn, and impossible client hit rejection.
- **C4:** A two-browser test proves connect, synchronized spawn, movement replication, validated shooting, damage, death, respawn, timer/score agreement, match end, rematch, and disconnect cleanup.
- **C5:** Visual QA captures named viewpoints for both bases, interiors, gardens, central lane, side lanes, each weapon, combat effects, HUD, and settings at desktop target resolutions.
- **C6:** The map contains no visible placeholder blockout geometry in release mode; debug collision rendering is disabled in production.
- **C7:** Performance capture meets the final research-backed frame/bundle/network budgets on Dave's desktop browser and a constrained test profile.
- **C8:** Asset manifest contains no unknown or incompatible license entries; repository secret scan is clean.
- **C9:** Public release candidate returns HTTP 200 over HTTPS and passes the same two-browser smoke test on the deployed origin.
- **C10:** Dave confirms the vertical slice is directionally fit before the V2 branch replaces the public deployment.

## 5. Milestones

1. **Research and teardown** — source-backed architecture, V1 gap matrix, asset/legal plan, performance budgets.
2. **Foundation slice** — modular runtime, fixed-step controller/physics, loading/settings/diagnostics, test harness.
3. **Combat slice** — one production-quality weapon, target, hit regions, effects, animation and sound.
4. **Environment slice** — one hero house, central street/vehicle encounter, one flank route, authored materials/props/lighting.
5. **Multiplayer slice** — authoritative host, prediction/interpolation, synchronized combat and match state.
6. **Full arena** — second house, complete lanes/interiors/gardens, all weapons, teams, full game loop.
7. **Release hardening** — visual/performance/network QA, accessibility, license audit, deployed multiplayer proof.

## 6. Explicitly out of scope for the first V2 release

- Activision/Treyarch assets, names, logos, sounds, exact extracted geometry, or a 1:1 copyrighted map reproduction.
- Ranked matchmaking, accounts, progression, cosmetics store, anti-cheat suitable for public competition, or paid infrastructure.
- Mobile touch controls unless later requested and separately scoped.
- Claiming “bug-free”; the release claim will instead cite the exact tested surfaces and residual risks.

## 7. Release rule

The V1 public deployment remains unchanged during local V2 development. A public V2 deployment is an external side effect and requires Dave's approval after C1–C8 pass and a playable vertical slice is presented.
