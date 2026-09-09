# Pass 69 — f4rcry515 Arena Spec (HITL-testing lane)

Status: implementation spec — Pass 69  \
Author of record: Jigglyclaw (Nous Portal `deepseek-v4-flash-0731`, max reasoning)  \
Collaborator: Desky (same route)  \
Baseline: pass 68 (`contrib/dave-gaming-pc/hermes/v68-bugfixes`); pass 68 stays untouched  \
Purpose: new-map lane for human-in-the-loop (HITL) testing while pass 68 is refined/published.  \
Codename: **f4rcry515** (Dave's original brief spelling) — displayed as **FARCrySIS**.

## 0. Dave's original brief (2026-08-03, authoritative)

> "A new map for pass 69. It should be called **f4rcry515** and inspired by the beach and
> jungle areas of **both Far Cry and Crysis** games. It should have a **bot mode** and be
> available for normal and multiplayer. … It should have similar physics and gameplay to
> the games I mentioned but feel like **COD multiplayer**. It's more about the map and
> subtle details and throwbacks. And graphics and physics and lighting. It should be so
> **delightful**. This should all be done with Nous Portal DeepSeek Flash V4 ultra and
> sub-agents using the same model. Use the new Three.js skills — especially the jungle one."

That brief is the source of truth for the art/feel lane; the mechanical integration contract
in this document (sections 1–6) translates it into the Atomic Acres engine.

## 1. Overview

Add a **fourth selectable arena** to Atomic Acres: **Farcrysis** — a dense, overgrown
tropical-island arena that reads as a flooded coastal research station swallowed by jungle.
The name is an original homage to the *Far Cry / Crysis* family (tropical island, decayed
military/research infrastructure, jungle cover); no protected assets, names, or geometry are
copied. It is a legal, original arena with the same browser FPS contract as the existing maps.

Farcrysis is the **HITL-testing lane** for Pass 69: it must expose debug/test hooks that let
Dave and the agent-player harnesses verify layout, spawns, cover, sightlines, and match flow
without affecting pass 68 production.

## 2. Design intent / observed context

- Current arenas: `atomic-acres` (neighbourhood team arena, 68×86), `rustworks-1v1`
  (industrial tower, 54×58, private lobbies up to 6), `gun-range` (timed solo lane),
  plus `skyline-terminal` on newer `origin/main` (arena registry grew after the local
  Pass-51 checkout; Farcrysis integrates additively against the latest upstream registry).
- Research basis (FPS level-design literature — Hullett & Whitehead 2010; CritPoints
  "Good FPS Map Design"; MAP-Elites FPS-map studies): good arenas overlay **~3 loops**,
  avoid **absolute chokepoints**, control **line of sight** with cover, keep **spawn
  fairness**, and balance cover vs open ground.
- The game is a low-cost browser arena (Three.js, Box2 collision, primitive + procedural +
  GLB quality art). Farcrysis must respect the existing engine budgets and the
  `ArenaMap` contract in `src/map.ts`.

## 3. Product requirements

### R1 — Arena identity & selection
- New `ArenaId`: `'farcrysis'`; add to `ArenaMap['id']` union, `ARENA_SELECTIONS`, and
  `buildFarcrysis(scene)` alongside `buildRustworks1v1`.
- Selector label: **FARCrySIS**; display name **Farcrysis**; summary
  `Jungle island research station · dense cover · HITL test lane`.
- Rules label: `5 MIN · HOST UP TO 6 · 2 BOT SOLO`.
- `multiplayer: true`, `fieldSupport: false`, `overdrive: false`,
  `soloBotCount: 2`, `maximumSoloBots: 2`, standard 5-minute match rules.

### R2 — World bounds & ground
- Bounds: `{ minX: -32, maxX: 32, minZ: -32, maxZ: 32 }` (64×64 — denser than
  Rustworks so close-quarters jungle play dominates).
- Ground: flooded island plate. Water plane at `y = -0.25` covering the full bounds
  (shallow lagoon, no swim mechanic — colliders keep players on the island paths);
  terrain plate at `y = 0` with a sandy-beach ring and mud/grass interior.
- Horizon: reuse the ocean-horizon ring pattern from pass 51 so no void is exposed.

### R3 — Layout: three loops, no absolute chokepoints
Overlay three circular lanes around the central research core (research-backed):
- **Outer ring (beach/lagoon loop):** wide, open-ish, sightline breaks via palms,
  rocks, and beached skiffs. Travel time ~10–12s.
- **Mid ring (jungle loop):** dense tree clusters, ruined walls, and overgrown crates;
  cover-heavy, tight turns, short sightlines (~4–8m). Travel time ~8–10s.
- **Inner core (research station loop):** central 16×16 station with two entrances,
  interior catwalks, and a raised command desk. Vertical accent (one upper catwalk
  ~2.5m above ground, reachable by ramp — one Z-axis crossing like de_dust2's
  catwalk, kept tasteful).
- Cross connectors at NW/NE/SW/SE so no single lane is a dead end; at least **two
  independent routes between any two spawns** (no absolute chokepoint).

### R4 — Spawn fairness
- Team spawns mirrored across the core: Team A at the NW lagoon edge, Team B at the
  SE jungle edge, rotationally symmetric (180° rotation maps A→B).
- Spawn points must be ≥6m from any collider, not in direct line of sight of the
  opposing spawn, and ≥4m apart within a team.
- Spawn protection: existing engine spawn-protection applies; verify no spawn is
  inside a kill volume or a cross-lane.
- Solo bot spawns (2) at two mid-ring points, symmetric.

### R5 — Cover & sightlines
- **Collision-backed cover** (blocks movement + shots + physics), minimum 14 distinct
  pieces across the three loops:
  - Outer: 4 palm clusters (trunk + frond hitbox), 2 beached skiff hulls, 2 rock clusters.
  - Mid: 4 ruined-wall fragments, 4 overgrown cargo crates.
  - Core: station walls are cover by structure; 2 interior crate stacks.
- **Sightline discipline:** no straight sightline longer than ~22m from any spawn or
  common lane; longest cross-map sightline intentionally blocked by the core.
- Presentation and collision footprints must agree (existing `physicalCover` contract).

### R6 — Entities / props (non-collision dressing)
- 6–10 palm trees (dressing; trunk collision optional via cover list), 8–12 jungle
  bushes (no collision, render-only), 2 beached skiffs, 4 floodlights on poles,
  riptide marker buoys at the lagoon edge, moss/decal patches.
- Research-station dressing: antenna mast, 2 satellite dishes, generator, control desk,
  flickering work light, warning barrels (non-explosive).
- All props use existing material/art-kit helpers (`standard`, `texturedMaterial`,
  `classifyImpactSurface`) so impact feedback works.

### R7 — HITL test hooks (Pass 69 core)
Expose a dev-only `farcrysisHITL` overlay toggled by a URL flag (e.g. `?hitl=1`):
- **Spawn markers:** colored diamond markers at every spawn (Team A amber, Team B
  cyan, bots white) with id labels.
- **Sightline renderer:** toggleable lines from selected spawns to key cover nodes,
  colored green (≤22m clear) / red (blocked).
- **Cover integrity:** small wireframe boxes on every collision-backed cover piece so
  Dave can verify presentation/collision agreement at a glance.
- **Kill-volume check:** bounding box flash + console line if any spawn or patrol
  point intersects a collider or kill volume.
- **Match-flow gate:** a dev status line (SPAWNED → LOOP → ENGAGED → SCORED) so the
  harness can assert the match is progressing, not stuck.
- Hooks must be no-ops when `?hitl=1` is absent and must not change production
  gameplay or pass 68.

### R8 — Performance & budgets
- Target: ≤150 draw calls core (≤240 quality), ≤25k triangles, no new heavy textures
  (reuse art-kit materials), 60fps on the existing baseline hardware with
  performance preset.
- Static geometry eligible for the existing presentation batching (like
  `rustworks-presentation-batch-*`).

### R9 — Art/feel lane (Dave's brief: Far Cry + Crysis beach/jungle, COD-feel, delightful)
- **Throwbacks (subtle, original, non-copying):** recognizable-but-original nods to the
  Far Cry/Crysis beach+jungle canon — a crashed seaplane half-buried in sand, a
  derelict research tower with an antenna mast, a flooded cave entrance, warning
  barrels, tiki-style markers, signal-fire beacon on the beach, overgrown military
  crates stamped with the f4rcry515 wordmark (original text, not game logos).
- **Jungle techniques from the `StarKnightt/jungle-trail` skill (MIT, Three.js r170
  case study, pinned `073e6eb8`):** dense layered foliage via **instancing** (many
  palms/ferns/bushes sharing one draw call), **generated procedural plants**
  (branch/palm geometry with slight per-instance variation), effect-specific visual
  probes, and deterministic capture controls for QA screenshots. Adopt concepts;
  re-verify every example import against the project's installed Three.js revision
  and never copy unlicensed code (see `browser-multiplayer-game-development`
  reference `threejs-web3d-source-verification.md` for the four-source licence gate).
- **Physics/gameplay feel (COD-multiplayer, not sim):** keep the engine's existing
  fast arcade controller (sprint/jump/crouch/prone/ADS, hitscan feel) — no
  simulation-weight or stamina mechanics. The COD feel comes from **map rhythm**:
  short sightlines, frequent cover, predictable flank routes, no long open fields.
- **Graphics/lighting delight:** golden-hour beach lighting on the outer ring
  (warm tint, long shadows), dappled jungle canopy light mid-ring (darker, cooler
  green shadow), warm interior work-lights in the research core. One tone-map at the
  output boundary; no stacked post-processing without a measured reason. Palm
  shadows, water sparkle on the lagoon, and subtle ambient dust motes in the jungle.
- **Bot mode:** 2 solo bots (spec R1) with the existing bot-AI; bots navigate the
  three loops without getting stuck (patrol points on all three lanes).

## 4. Mechanical acceptance checks

- **C1:** `ArenaId` union, `ARENA_SELECTIONS`, map builder, and minimap registry all
  include `farcrysis`; `npm run build` passes.
- **C2:** TypeScript strict check and existing unit tests pass; new unit tests cover
  bounds, spawn-outside-collider, symmetric spawn mapping, and ≥2 routes between
  spawn pairs.
- **C3:** At least 14 `farcrysis-*` cover pieces exist with matching player/physics/shot
  colliders; presentation and collision footprints agree (no cover that blocks shots
  but not movement, and vice versa).
- **C4:** No straight sightline >22m from any spawn or patrol point (asserted by a
  test over the cover list).
- **C5:** Spawns are ≥6m from colliders, ≥4m apart, and no spawn is inside a kill
  volume (asserted by test).
- **C6:** `?hitl=1` overlay renders spawn markers, sightline lines, cover boxes, and
  the match-flow line; with no flag, the overlay is absent and production behavior
  is unchanged.
- **C7:** Two-browser smoke: host+client connect, spawn at mirrored positions, movement
  validates, shooting/damage/death/respawn work on Farcrysis.
- **C8:** Visual QA captures: beach loop, jungle loop, research-station interior +
  catwalk, both spawns, two cover pieces, and the HITL overlay at desktop resolution.
- **C9:** Commit on `contrib/dave-gaming-pc/hermes/pass69-farcrysis` (or a documented
  pass-69 branch), push, and serve the exact verified bytes for Dave's HITL review.
- **C10:** Pass 68 untouched — no changes to pass-68 branches or production files
  other than additive arena registration.
- **C11 (art/feel):** at least 3 throwback props (seaplane, tower, beacon, cave, etc.)
  exist with original names; ≥3 instanced foliage types (palms/ferns/bushes) share
  draw calls; beach/jungle/core lighting tints differ measurably; `?hitl=1` visual
  QA captures include the golden-hour beach, dappled jungle, and research core.

## 5. HITL test script (Dave / harness)

1. Open `index.html?hitl=1&arena=farcrysis` (solo, 2 bots).
2. Walk the outer ring: confirm 4 palms + 2 skiffs + 2 rock cover blocks shots AND movement.
3. Walk the mid ring: confirm ruined walls + crates behave; no dead ends.
4. Enter the research station: two entrances, catwalk reachable, no stuck spots.
5. From each team spawn, confirm no opposing-spawn sightline and ≥2 routes to the enemy side.
6. Confirm match flow line advances and scoreboard works.
7. Retest with `?hitl=1` removed: identical production behavior to other arenas.

## 6. Out of scope (pass 69)

- No netcode, weapon, scoring, bot-AI, or lighting-rule changes.
- No changes to `atomic-acres`, `rustworks-1v1`, or `gun-range` gameplay.
- No swim mechanic, vehicles, destructible cover, or new audio assets.
- Production promotion of Farcrysis is **not** part of pass 69 — it stays a HITL lane
  until Dave's visual acceptance, mirroring the repo's release discipline.
