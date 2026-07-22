# Atomic Acres Pass 17 — High-Refinement Specification

**Date:** 2026-07-14  
**Branch:** `overhaul/high-refinement-pass-17`  
**Baseline:** immutable public Pass 16 (`293d15d` gameplay / `7a2c4b0` release docs)  
**Model policy:** GPT-5.6 Sol via OpenAI Codex; medium reasoning; DeepSeek emergency fallback capped at one call  
**Status:** anchored working specification

## 1. Purpose

Pass 17 is a cohesive refinement pass, not another feature pass. Dave's direct playtest is authoritative: Pass 16 feels regressed in several ways, the models and limbs look bad, and the house layout feels clunky. The goal is to make the existing original browser arena feel intentionally designed, visually coherent, readable, and good to control.

Pass 16 stays immutable. Pass 17 will not be published or promoted to canonical without Dave reviewing the candidate.

## 2. Baseline observations

Observed in the public Pass 16 Quality path on 2026-07-14:

- The carbine reads as a thin floating diagonal shape rather than a firearm held with two hands.
- First-person hands are oversized and heavily cropped; they read as disconnected dark/teal blobs.
- The support hand is not perceptually attached to the weapon.
- Forearms do not establish a believable shoulder-to-hand pose.
- Imported low-poly character parts and original environment primitives do not yet share a coherent scale/material language.
- House exteriors use large flat planes and openings without enough architectural hierarchy to communicate routes.
- Cover, foliage, utility structures, and houses vary in apparent scale and detail.

Claims still requiring controlled verification:

- third-person operator proportions and weapon mounting for every weapon family;
- first-person limb quality in Performance and during ADS, reload, sprint, pistol, scattergun, SMG, and knife;
- exact collision/navigation mismatches inside both houses;
- which changes caused the subjective regression versus Pass 15;
- normal Windows Chrome pacing after higher-quality presentation changes.

## 3. Requirements

### R1 — Cohesive first-person presentation

- Use a deliberate camera-space rig with believable visible forearm length and hand scale.
- Both hands must visibly contact intended grip sockets for carbine, SMG, scattergun, and pistol where anatomically appropriate.
- Eliminate disconnected hands, giant fists, floating weapons, severe wrist bends, camera clipping, and weapon/arm self-intersection.
- Weapon silhouette must remain readable in hip fire, ADS, sprint, reload, recoil, swap, and knife transitions.
- Performance may simplify materials/shadows, but not anatomy, grip contact, or silhouette.

### R2 — Cohesive third-person operators

- Operators must have plausible scale relative to doors, windows, cover, and weapons.
- Right-hand mounting and left-hand support contact must remain stable while idle, walking, running, firing, crouching, prone, taking damage, dying, and meleeing.
- Avoid additive animation conflicts that twist wrists, detach weapons, or blend firearms through torsos.
- Team readability must work through shape/value/color without glowing or toy-like over-emission.

### R3 — Original, navigable house redesign

- Preserve broad compact two-home arena qualities while using original Atomic Acres topology, dimensions, architecture, props, and route placement.
- Each house needs a legible ground-floor loop, a meaningful interior shortcut, coherent entrances/windows, and a deliberate relationship to yard/garage/spawn routes.
- Openings shown visually must correspond to traversable or intentionally blocked geometry.
- Collision must match visible walls, floors, stairs, doors, windows, railings, and cover.
- Remove dead pockets, awkward pinch points, accidental snag edges, oversized empty rooms, and routes that terminate without tactical purpose.
- Houses need distinct identities rather than mirrored recolors.

### R4 — Arena flow and readability

- Maintain rapid re-engagement without immediate spawn sightlines.
- Provide readable central, side, and interior route choices with deliberate risk/reward.
- Cover rhythm must support short movement decisions rather than scattered arbitrary blocks.
- Landmark hierarchy must orient a player within two seconds after spawning.
- Foliage, props, signs, and support effects must not hide enemy silhouettes or doorway boundaries.

### R5 — Art-direction polish

- Establish one low-poly visual language for imported operators/weapons and authored world assets.
- Normalize scale, edge treatment, material roughness, palette saturation, and lighting response.
- Replace placeholder-looking slabs, cylinders, and unsupported floating details where they dominate the frame.
- Quality should add controlled depth, shadows, and material variation; Performance should retain semantic readability at lower cost.
- HUD must remain useful but should not compete with combat framing.

### R6 — Preserve combat and authority

- Do not regress authoritative firing, damage, melee admission, reload timing, class loadouts, field support, collision, identity binding, multiplayer interpolation, match flow, or bounded effects.
- No copied Call of Duty, Black Ops, or Nuketown assets, geometry, dimensions, names, or exact layouts.
- Quaternius imports remain CC0 with existing provenance.

## 4. Mechanical acceptance criteria

- **C1 — Source gates:** lint, TypeScript, all unit tests, and production build pass with no new warnings beyond documented existing bundle-size warnings.
- **C2 — First-person contact:** debug telemetry reports valid right/support grip contact for every deployed weapon; screenshot review shows connected hands/forearms in hip, ADS, reload midpoint, sprint, and recovery.
- **C3 — Limb framing:** no first-person arm/hand bounding box intersects the near plane or leaves only detached hands visible at 16:9 1920×1080 in either graphics mode.
- **C4 — Weapon readability:** each weapon has a recognizable full receiver silhouette and consistent screen occupancy; no paper-thin edge-on view in hip or ADS.
- **C5 — Third-person mounting:** deterministic operator snapshots for all weapons and movement/stance states remain within configured hand/socket error tolerances and show no torso/weapon penetration beyond tolerance.
- **C6 — House traversal:** automated route probes can enter, cross, and exit both houses through intended openings without collision snags; every visible opening has a tested collision contract.
- **C7 — Spawn safety:** deterministic spawn tests preserve minimum enemy separation and prevent direct initial line-of-sight through house/yard routes.
- **C8 — Navigation quality:** controlled playthrough records no dead-end route that lacks cover, pickup, vantage, or return path; both houses have at least two tactically distinct exits.
- **C9 — Visual comparison:** matched-camera before/after screenshots in Performance and Quality demonstrate improved limb connection, weapon silhouette, architectural hierarchy, and enemy readability.
- **C10 — Browser scenarios:** full Chromium suite passes, including explicit Performance/Quality, every weapon, knife, reload, interior traversal, operator visibility, support effects, and match flow.
- **C11 — Multiplayer:** bounded two-browser WebRTC verification passes with remote operators, weapon identity, stance, firing, melee, reload, death, and respawn presentation intact.
- **C12 — Performance:** normal Windows Chrome remains smooth on the actual remote-display path in both modes; Performance must not lose combat readability and Quality must not introduce severe frame pacing.
- **C13 — Effects bounds:** renderer/effect telemetry remains bounded during firefights, support use, reload/melee animation, and repeated respawns.
- **C14 — Originality:** source/release documentation explicitly records original topology and licensed asset provenance; no protected names/assets/exact geometry are introduced.
- **C15 — Review discipline:** Pass 17 is committed and pushed only after all gates; immutable public review publication requires Dave's explicit confirmation.

## 5. Quality bar — polished beta / playable sanctuary

### Independent baseline tribunal — 2026-07-14

The live Pass 17 work-in-progress was independently scored **5.9/10** against the qualities of a polished early-2010s arena shooter. This is a failed release gate, not an acceptable review candidate.

| Category | Baseline |
|---|---:|
| First-person presentation | 6.1 |
| Third-person characters | 5.7 |
| Animation | 6.0 |
| House/arena architecture | 5.1 |
| Combat feedback | 6.3 |
| Audio | 5.5 |
| UI | 6.8 |
| Lighting/art cohesion | 5.0 |
| Multiplayer/social readiness | 5.2 |
| Performance | 5.1 |
| Reliability | 5.4 |
| Replayability | 5.7 |

The principal gap is cohesive sensory authorship: anatomy, weapon handling, enemy readability, architecture, lighting, animation, impacts and audio do not yet read as one convincing world. Engineering breadth and telemetry are not substitutes for perceptual quality.

Pass 17 remains blocked until three independent reviewers score every category at least 8.0 with an overall mean of at least 8.5, in addition to the objective gates below.

Pass 17 is not an MVP gate. It must feel like a deliberately authored place where people can repeatedly play complete matches, interact, rematch, and trust the controls and state.

- An independent quality tribunal scores first-person presentation, third-person characters, animation, architecture, combat feedback, audio, UI, lighting/art cohesion, multiplayer/social readiness, performance, reliability, and replayability from 0–10.
- An overall score below **8.5/10** blocks the review candidate.
- No category may remain below **8/10** without Dave explicitly accepting the limitation.
- The comparison target is the responsiveness, readability, cadence, spatial flow, cohesion, and reliability associated with a polished classic arena shooter. It is not permission to copy protected assets, exact commercial maps, names, geometry, or tuning.
- Owner preference in matched Pass 16/Pass 17 A/B captures is mandatory; machine telemetry cannot approve perceptual quality.
- Multiplayer acceptance includes repeated host/join/play/rematch cycles, reciprocal combat, disconnect/focus recovery, and zero known high-severity state or authority bugs.
- **Performance gate:** on the active 30 Hz Windows display, normal Chrome must sustain at least 95% of refresh (28.5 presented frames/s) during representative combat, with p95 frame time no worse than 1.25 refresh intervals (41.7 ms), p99 no worse than two intervals (66.7 ms), and no post-warmup hitch over 100 ms. A separate unlocked AMD/D3D11 run must demonstrate at least 60 FPS median and p95 at most 22 ms as GPU/update headroom evidence.
- **Renderer margin:** Quality must remain at or below 160 draw calls and Performance at or below 120 in the authored combat benchmark, with bounded triangles and effect pools.
- **Multiplayer soak:** ten consecutive host/join/match/rematch cycles plus a 20-minute latency/loss run must complete without disconnect, state corruption, identity failure, or unbounded effects.
- **Interaction gate:** fresh players must be able to host or join opposing-team play in under 60 seconds median without developer assistance.
- **Bounded social layer:** provide identity-bound, rate-limited team pings for Enemy, Regroup, Push, and Nice; pings expire promptly and cannot carry arbitrary text, links, or persistent personal data. Quick rematch and recoverable reconnect state are part of the loop.

## 6. Out of scope

- New game modes, weapons, streak tiers, progression systems, backend services, accounts, monetization, or content expansion.
- Exact reproduction of any commercial map.
- Replacing the engine or rebuilding the game in another framework.
- Canonical promotion without Dave's acceptance.

## 6. Work sequence

1. Independent model/limb, map, and holistic audits.
2. Freeze visual scale/style and route-flow decisions.
3. Correct first-person presentation and third-person mounting.
4. Rebuild house architecture and collision around explicit route contracts.
5. Harmonize world materials, scale, lighting, props, and HUD hierarchy.
6. Run deterministic and browser gates continuously.
7. Run matched visual, multiplayer, and Windows performance acceptance.
8. Present Dave with a review candidate and evidence before publication.

## 7. Integrated evidence checkpoint — 2026-07-14

This checkpoint records engineering evidence only. It does not replace the independent `5.9/10` perceptual baseline or satisfy the release gate.

- Source gate: `31/31` unit-test files and `137/137` deterministic tests pass; `git diff --check`, TypeScript/lint, and production build pass.
- Architecture: both original house declarations pass forward/reverse ground-route simulation, bidirectional stair traversal, opening/collision consistency, human-scale dimensions, and team transforms. The fresh matched architecture harness completed `20/20` Quality/Performance captures with zero runtime/page errors. Aqua uses one 12-tread service stair; Coral uses a two-flight 12-tread dogleg.
- Presentation: first-person arms are merged into six render meshes while preserving named shoulder/elbow/wrist structures. Accepted melee now shows the knife immediately and remains visible for `620 ms`. QA-only capture controls pin reload at `0.34`/`0.68` and melee at `0.42` after real gameplay admission; normal gameplay remains clock-driven. The durable `artifacts/pass17-refinement` matrix completed `56/56` Quality/Performance frames across all three class primaries plus the pistol with zero errors. Across those actions, Performance peaks at `80` calls / `69,940` triangles and Quality at `158` calls / `143,200` triangles, inside the `120/160` call limits. Pistol reload remains a perceptual polish blocker because magazine separation is still too subtle.
- Renderer and normal display: foreground Windows Chrome 150 with normal vsync sustained Performance at `28.6946 FPS` (64 calls / 53,872 triangles / DPR 0.75) and Quality at `28.8619 FPS` (125 calls / 100,070 triangles / DPR 1.0) on the active 30 Hz display. Both were visible/focused, exceeded the `28.5 FPS` gate, and did not adaptively downshift. The isolated Chrome profile and CDP listener were fully cleaned afterward.
- Bounded social loop: arbitrary chat remains absent from the accepted protocol. Enemy, Regroup, Push, and Nice are identity-bound fixed-enum messages; guest team claims are bound to the validated join; host relay is filtered by team; admission is one ping per second with a bounded 32-nonce replay window; presentation is capped at eight markers with five-second expiry.
- Browser evidence: the complete suite passes `20/20` in 3.2 minutes, including invalid-room timeout/retry, fixed social cooldown/expiry, visible arms/operators, Performance and Quality renderer budgets, class-primary plus service-pistol restriction, knife misses, all three supports, movement, reload interruption cleanup, grenades, match/rematch, damage recovery, and bounded effects.
- Multiplayer evidence: the current tree passes reciprocal host/client WebRTC with zero page errors, one remote each, `33 ms` state cadence, `24 s^-1` interpolation, `189.5 ms` sampled snapshot age, `0.1764401384 m` interpolation error, carbine-primary/pistol-active replication, and authoritative melee admitted at `0 HP / 1 death` before respawn.
- Remaining blockers: the official perceptual score remains `5.9/10` until the fresh three-reviewer tribunal reports; first-person anatomy and pistol reload still look procedural; architecture captures remain sparse/blockout-like despite mapped surfaces; audio/combat motion evidence is incomplete; ten-cycle multiplayer soak and 20-minute latency/loss evidence remain outstanding; Dave's controlled Pass 16/17 preference is still mandatory.

## 8. Corrected independent tribunal — 2026-07-14

The first attempted tribunal was invalid because the full Playwright suite had cleaned a weapon/action matrix stored under its disposable `test-results/` directory. Durable evidence was regenerated under `artifacts/`: `56/56` refinement frames and `20/20` architecture frames, all with zero capture errors. Three fresh GPT-5.6 Sol reviewers confirmed they could inspect all requested evidence.

### Verdict

- Character/action specialist: **5.8/10**, high confidence (`0.86`).
- Architecture specialist: **5.3/10**, high confidence (`0.88`); Quality alone approximately `6.3`, Performance approximately `4.4`.
- Release-quality director: **5.3/10**, medium-high confidence (`0.82`).
- **Decision:** retain the official `5.9/10` baseline; do not raise or formally lower it without matched Pass 16/17 evidence.
- **Release gate:** failed. The required `8.5` overall and `8.0` per category are not met. Only technically evidenced Performance (`8.0`) and Reliability (`8.6`) reached 8 in the release director's rubric.

The tribunal separates a strong technical foundation from mid-prototype visual/product polish. Highest-impact blockers are:

1. Tube-like first-person anatomy, disconnected-looking wrists/hands, and weak pose-specific contact.
2. Reload/fire states with insufficient physical distinction, recoil, muzzle flash, moving magazines/shells, and support-hand interaction.
3. Sparse, wall-dominated interiors and structurally unresolved stairs/landings.
4. Flat lighting and repetitive materials, especially the conspicuous Performance-mode downgrade.
5. Rigid third-person operators and insufficient motion evidence for locomotion, fire, reload, melee, hit, death, and respawn.

Static screenshots cannot validly score audio, temporal animation smoothness, replayability, or complete multiplayer lifecycle reliability. Pass 17 remains unpublished and non-canonical.
