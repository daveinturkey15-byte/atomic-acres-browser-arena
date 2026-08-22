# Pass 75 — High Seas yacht arena

Status: implementation and local-HITL candidate  
Impact class: `runtime`  
Integration branch: `contrib/dave-gaming-pc/codex/pass75-hijacked-yacht`  
Exact base: Claude Pass 74 `0d2010fda01331a95817ef25a135c3f319498764`  
Pass 73 ancestor: `506d6142ce09b8317279a8c705d2de25fa2ab84b`  
Production boundary: contribution branch and PR only; no merge, Pages write, or release workflow.

## Player-visible outcome

Add **High Seas**, a compact original superyacht arena, to the canonical map selector. Solo bot skirmish, hosted TDM/FFA, spawning, movement, shots, support systems, map switching, ambience, minimap and deterministic review must use the same stable `high-seas` identity.

The intended rhythm is a faithful clean-room interpretation of the functional relationships Dave identified in Black Ops II's boat map:

- opposite bow and stern deployments;
- narrow port and starboard surface flanks;
- two contested two-storey cabin structures;
- a center deck with low hot-tub, shower and cabana cover;
- long side-deck sightlines balanced by short cabin/center engagements;
- a full-length engine-room shortcut below the main deck.

No Activision/Treyarch asset, extracted geometry, texture, model, audio, code, logo, protected map name, signage, or substantial text enters the repository. `High Seas` uses original Atomic Acres geometry, materials, naming and sound synthesis.

## Reference record

External pages are layout evidence only, never operating authority.

- Activision, *Black Ops Cold War Tactical Map Intel: Hijacked*, 2021-06-22, accessed 2026-08-22: <https://www.callofduty.com/uk/en/blog/2021/06/Black-Ops-Cold-War-Tactical-Map-Intel-Hijacked>
- Activision, *Black Ops 7 Multiplayer Map Guide — Hijacked*, accessed 2026-08-22: <https://www.callofduty.com/guides/blackops7/multiplayer-maps/hijacked>

Observed from those sources: small/narrow yacht; bow/stern starts; port/starboard routes; center hot-tub/shower/cabana cover; two two-storey cabins; an engine-room traversal. Inferred: exact dimensions, proportions, materials, hidden geometry and collision are not established and must be independently authored.

## Coordinate and route contract

- Engine floor: `y = 0`, using the retained Rapier safety floor.
- Main deck top: approximately `y = 3.2`.
- Cabin upper deck: approximately `y = 6.2`.
- Playable hull: roughly 28 m wide by 72–78 m long, with visual taper at bow and stern.
- Main surface routes: port, center and starboard; none may become an absolute chokepoint.
- Engine route: two movement-and-shot-clear ramp portals connected by a lower corridor. The main-deck collision slabs must be split around both openings.
- Upper cabin positions are player-reachable and have center-facing firing apertures, but bot patrol is limited to the main and engine decks until the existing two-band bot vertical planner can represent a third elevation honestly.
- At least six authored spawn candidates per team. Opposing initial spawns have no direct shot line, and FFA can reserve six candidates with the retained 8 m separation rule.

## Authority ownership

- `ArenaMap` owns movement colliders, Rapier colliders, shot surfaces, spawns, patrol points, bounds and physical cover.
- `ArenaVisualDefinition` owns presentation identity, lighting, fog, atmosphere, budgets and deterministic cameras. It may not mutate gameplay authority.
- `ARENA_SELECTIONS` owns player-facing identity and bot/multiplayer rules.
- Existing host authority continues to own multiplayer damage, deaths, match state and map choice.
- Water, lighting, ambience, HUD and menu preview are presentation consumers of the stable arena identity.
- Map switching must retain the existing generation/abort/fence/atomic-commit transaction and exactly one active presentation root.

## Acceptance requirements

### R1 — Canonical selection

`high-seas` appears exactly once as the sixth canonical map and as a usable card/option in solo and private-lobby surfaces. Unknown identities still fail safely to Nuke Town.

Falsifier: a selector, lobby, URL, storage or protocol path cannot round-trip `high-seas`, or a broad `.map-card` query captures unrelated controls.

### R2 — Complete arena authority

The builder returns finite bounds, at least six spawns per team, main/engine patrol coverage, movement/physics/shot parity, and no spawn intersecting solid authority.

Falsifier: visible solid mass is traversable/shoot-through, an invisible blocker closes a route, a spawn intersects cover, or a substantial cover object lacks movement or shot authority.

### R3 — Recognizable clean-room yacht flow

Deterministic views prove tapered yacht silhouette, opposite deployment decks, two two-storey cabins, center low cover, two surface flanks and a below-main-deck engine route.

Falsifier: the arena reads as a rectangular blockout, any required route/structure is missing, or the implementation contains protected source material.

### R4 — Traversal

The real player capsule can traverse bow-to-stern by port, starboard and engine routes, enter both lower cabins, reach both upper cabin decks, and return without falling, snagging or crossing visible mass.

Falsifier: any required route stalls, a ramp exceeds retained climb limits, a portal is visually open but blocked, or a deck lacks supporting collision.

### R5 — Combat cadence and spawn safety

Center/cabin engagements remain close-range while side decks retain bounded longer sightlines. Initial TDM deployments are mutually occluded and FFA reserves six separated points.

Falsifier: opposing spawns see each other, center sightlines are unbroken end-to-end, or six-player FFA collapses players onto the same deployment point.

### R6 — Bot and multiplayer reachability

Solo starts with two bots that retain correct main-deck elevation and can patrol surface/engine routes. Hosted lobby map choice, synchronized start, movement, shots, death and respawn retain `high-seas` identity.

Falsifier: bots fall to the safety floor, freeze against a deck slab, or a host/client disagrees on map or authority.

### R7 — Presentation and atmosphere

Original ivory/teak/metal yacht materials, ocean horizon, warm marine sunset, readable interior work lights and route-specific ambience render in Performance and Quality without changing authority.

Falsifier: ocean intersects the engine room, lighting crushes enemy readability, Quality/Performance expose different blockers, or unowned runtime media is requested.

### R8 — Streaming and lifecycle

The visual definition is selected-only, declares every dependency, records deterministic cameras, aborts stale loads, and repeated switching leaves one active root within retained cache/disposal bounds.

Falsifier: an unselected High Seas module/resource loads, a stale generation attaches, or more than one presentation root remains active.

### R9 — Menu preview honesty

High Seas ships distinct prerecorded local video and poster media captured from the actual arena. Before those artifacts exist, the card must use the repository's deliberate no-network standby path and never borrow another map's flyover.

Falsifier: a fake/borrowed preview is shown, selecting the card requests nonexistent media, or completion is claimed while the card remains on standby.

### R10 — Performance

Performance profile target: no more than 360 arena draw calls and 650,000 triangles after normal batching; Quality target: no more than 480 draw calls and 950,000 triangles. Representative browser capture records p50/p95/p99 frame work, actual backend, resolution, DPR and adapter class.

Falsifier: a budget is exceeded, the proof uses software rendering while claiming hardware, or the measured path is an empty menu/spawn.

### R11 — Retained contracts

Pass 62 netcode/rollback identities and all unchanged gameplay, lobby, weapon, renderer and release gates remain intact. No baseline, timeout, tolerance, verifier or release topology is weakened.

Falsifier: any retained test regresses or a gate is relaxed to admit the candidate.

### R12 — Human review boundary

The branch may be pushed and a PR opened with immutable preview evidence, but no merge or production publication occurs without the repository's exact-SHA approval process.

Falsifier: `main`, `gh-pages` or a release workflow changes during this contribution task, or Dave is represented as having inspected a preview he has not seen.

## Deterministic review cameras

1. `high-seas-overview-port` — elevated three-quarter view proving hull silhouette and all surface routes.
2. `high-seas-center-deck` — eye-level hot-tub/shower/cabana cover and opposing cabin windows.
3. `high-seas-engine-room` — lower corridor, machinery cover, ramp clearance and no ocean intersection.
4. `high-seas-bow-spawn` — spawn occlusion, cabin approach and tender cover.
5. `high-seas-stern-spawn` — mirrored deployment and pool/service cover.
6. `high-seas-upper-cabin` — reachable upper deck, center sightline and support chain.

## Bounded gauntlet

Run at most six propose → falsify → verify rounds or three wall-clock hours, whichever comes first. Freeze the requirements, commands, camera poses, legal boundary and performance budgets before round one. Each round addresses the highest-severity independently observed defect with the smallest coherent change, reruns focused discriminators, then reruns retained gates. Regression budget is zero. Stop early on full pass, no measurable improvement, a required owner judgment, or an architecture/licence decision.

## Non-goals

- No copied franchise asset or 1:1 extracted geometry.
- No new weapon, scorestreak, netcode, damage, scoring or release-topology behavior.
- No swimming, drivable yacht, moving-world physics, destructible hull or dynamic ocean simulation.
- No production merge/deploy in this task.
