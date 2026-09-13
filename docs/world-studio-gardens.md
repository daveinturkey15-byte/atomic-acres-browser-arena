# World Studio gardens — midcentury backyard kit (lane `gardens-author-20260912`)

Author: Claude Fable 5.1 (native route `claude-fable-5-1`, high effort, no subagents, no
other model calls). Machine `dave-gaming-pc`, harness `claude`. Worktree
`C:/Users/david/projects/aa-gardens-author-20260912`, branch
`contrib/dave-gaming-pc/claude/gardens-author-20260912`, base `e25a938916233a3e4972e5f012580fa898bb00eb`.

Lane ownership: `src/world-studio/gardens/**` and this file only. `arena.ts` was **not**
edited; root integrates the returned factory.

## Commits

| SHA | Content |
|---|---|
| `d11d4e8b6` | First usable checkpoint: factory, material family, focused tests (8 passing). |
| _(second commit, see final message)_ | Refinement pass: stepping stones, shed door hardware fix, cedar tint, stats note. |

## Callable API (`src/world-studio/gardens/index.ts`)

```ts
import { createStudioGardens } from './gardens';
const gardens = createStudioGardens();          // or createStudioGardens({ yards, spawns, spawnClearanceM })
root.add(gardens.root);                          // one Group at the origin, world coordinates, no enclosing transform
solids.push(...gardens.solids);                  // StudioGardenSolid = { id, mesh, bounds: Box2, material: BallisticMaterialId }
reviewPoints.push(...gardens.reviewPoints);      // teal/yellow-garden-deck, teal/yellow-garden-shed
gardens.stats;                                   // triangles, drawGroups, solids, components, textures, perYard
gardens.dispose();                               // idempotent; also on root.userData.dispose
```

- Shape matches the existing `StudioSolid` consumed by `arena.ts` (`ground.ts`, interiors, architecture).
  Every solid's `mesh` is the merged per-role mesh so root's `raycastMeshes` de-duplication works as
  for interiors. `minY`/`maxY` are always set; turned chairs carry `rotation: [0, yaw, 0]` OBBs.
- Ballistic materials used: `wood`, `concrete`, `thin-metal`, `structural-metal` (all existing ids).
- Exports for integrators and tests: `STUDIO_GARDEN_YARDS`, `STUDIO_GARDEN_CLEAR_LANES`,
  `STUDIO_GARDEN_BUDGET` (60k tris / 16 draw groups), `STUDIO_GARDEN_SPAWN_CLEARANCE_M` (1 m),
  `STUDIO_GARDEN_YARD_EXTENT`.

## Placement contract and defaults

Every part is authored in yard-local metres: `lx` = depth behind the house rear wall (0 = wall
face at |X| = 27, positive = toward the boundary fence), `z` = world Z, `y` = world height.
World X = `centreX - frontSign * (HOUSE_HALF_WIDTH + lx)`. Yaw/roll are mirrored for the teal
yard (`frontSign = +1`), pitch is not. Verified against code: teal `centreX -20 / frontSign +1`,
yellow `centreX +20 / frontSign -1` (`architecture/index.ts` `STUDIO_HOUSES`), rear wall at
|X| = 27, balcony |X| 27..29.4 at Z -6.6..-0.8, external stair |X| 28..29.25 at Z -0.8..3.7,
rear ground-floor openings: dining slider Z -3.9..-2.1, kitchen window Z 3.6..5.6 (y ≥ 1.05).

Default yards are derived from `STUDIO_HOUSES`; pass `yards` to override. Default spawn set is
`studioSpawnPositions(0|1)` from `layout.ts` (16 points at |X| 32/37 along Z); every solid must
keep 1 m from each, or the factory throws.

**Clearance exclusions (world rects, both signs, `STUDIO_GARDEN_CLEAR_LANES`)** — no solid enters:
rear-door corridor |X| 27..31 × Z -6..0; stair foot |X| 27.6..29.7 × Z 3.5..4.6; concrete side
path |X| 28.15..29.85 × Z -19..19; cross path |X| 13..37 × Z -13.9..-12.1; exit lanes
|X| 11..40 × Z -14.5..-9.5 and Z 18.5..23.5 (the nature lane's `HEDGE_LANES`). Also asserted:
no solid inside a house footprint, inside the boundary fence, or above the 0.42 m autostep for
decks/steps/beds.

**Where things are (per yard, yard-local):**

| Prop | lx | z | Solid |
|---|---|---|---|
| Paved patio (7×8 pavers, 0.6 m) | 0.35..4.75 | 4.45..9.35 | no |
| Cedar sun deck 1.5×4.2, top 0.30 m, two 0.15 m steps | 3.0..4.5 | 5.0..9.2 | yes (deck, steps) |
| Teal: white pergola (4 posts, beams, braces, 8 rafters, 6 slats) | 3.12/4.38 | 5.12/9.08 | posts |
| Yellow: cedar guard rail on the yard edge (33 balusters) | 4.5 | 5.0..9.2 | thin barrier |
| Teal: 2 slatted lounge chairs + round side table | 3.72 | 6.0, 8.25, 7.12 | seat masses, table |
| Yellow: Ø0.95 table, pedestal, 2 chairs, red canvas umbrella Ø2.4 | 3.75 | 7.1 | top, pedestal, seats, pole |
| Teal: kettle barbecue · Yellow: hooded barbecue with gas bottle | 3.75 | 10.2 / 10.3 | mass box |
| Shed 3.2×3.0 in the brief's 4×3.5 slot at |X| 34, Z -21 (door on the house side) | 5.35..8.55 | -22.5..-19.5 | 4 walls + roof AABB |
| Water butt, downpipe, gutter (door-end corner) | 4.9 | -19.13 | barrel |
| Teal: galvanised dustbin · Yellow: two terracotta pots | 4.55 | -22.0 | yes |
| Teal: T-post clothesline, 3 lines, 3 hung items, pegs | 7.6 | -17.7..-14.7 | 2 posts |
| Yellow: rotary hoist, 4 arms, 3 line rings, 4 hung items | 8.0 | -16.0 | pole |
| Teal: two raised cedar beds 0.9×2.0×0.38 with plants | 8.7..9.6 | 0..2, 16..18 | yes (steppable) |
| Yellow: two half-barrel planters with shrubs | 3.4 | 4.35, 11.9 | yes |
| Stepping stones (27) patio → laundry, skipping the cross path | 4.6 | 3.6..-17.3 | no |
| Condenser unit on a pad, louvres, pipes (between wall and stair) | 0.1..0.46 | 1.2..2.1 | yes |
| Meter box + conduit | 0.13 | 3.1 | no |
| Hose reel, tap, spout (below the dining window) | 0.1..0.5 | -8.3 | no |
| Two wheelie bins against the garage side wall | -2.95..-2.35 | 10.2..11.55 | yes |

Known conflict for root: the existing `teal-yard` / `yellow-yard` review cameras in `layout.ts`
stand at |X| 36, Z -20, i.e. 0.45 m outside the shed's west/east wall. The shed honours the
HF-571 nature `SHEDS` slot (hedge skirt, flower bed and keep-outs already expect it there), so
the camera will see a shed corner at frame right. Moving the camera or the shed is root's call;
the shed slot is `S` in `index.ts`.

## Measured geometry and material counts (read from built meshes, `gardens.test.ts`)

| Measure | Value |
|---|---|
| Triangles | 19,940 (teal 9,672 · yellow 10,268) |
| Draw groups (merged meshes, one per material role) | 15 |
| Solids | 49 (teal 25 · yellow 24) |
| Authored components | 801 |
| Textures (DataTexture 256²) | 12 (4 raster sets × albedo/normal/roughness) |
| Materials | 15 (8 textured sharing 4 raster sets, 7 flat) |

Per role: concrete 3,792 · galvanised 3,620 · foliage 2,080 · blackSteel 2,016 · cedar 1,888 ·
linen 1,820 · paintedWhite 1,068 · plasticGreen 928 · paintedTeal 828 · paintedYellow 828 ·
paintedGreen 576 · terracotta 224 · soil 152 · shingle 72 · canvasRed 48.

Draw-call estimate for the integrated scene: +15 (no instancing; all parts are merged per role).

## Skill / source method → consumer mapping (native `Read` of the literal canonical paths)

Files read natively this session (host verifies events):
`C:/Users/david/Documents/desky-bootstrap-clone/Skills/software-development/threejs-game-development/SKILL.md`,
`.../Skills/game-development/atomic-acres-procedural-art-authoring/SKILL.md`,
`.../Skills/game-development/photoreal-procedural-scene-forge/SKILL.md`,
`SKILL_ALLOCATION.json` (hashes recorded there; not recomputed here), the five concept PNGs
(`teal-backyard`, `yellow-backyard`, `teal-side-lane`, `yellow-side-lane`, `layout-topdown`),
repo `AGENTS.md`, `docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md` (§Contributor flow),
`docs/MULTI_AGENT_REPO_DISCIPLINE.md` (§8–10, checklist), AKP `adoption-policy.json`,
`arena.ts`, `layout.ts`, `ground.ts`, `architecture/index.ts`, `architecture/house.ts`
(constants, openings, balcony/stair), `interiors/index.ts`, `interiors/materials.ts`,
`interiors/interiors.test.ts`, `nature/index.ts`, `nature/gardens.ts`, `nature/layout.ts`,
`nature/seeded.ts`, `rendering/surface-forge.ts` (interfaces), `collision.ts` `Box2`.
No linked reference bodies were read; no method from an unread reference is claimed.

| Method (skill, section) | Consumer | What was actually checked |
|---|---|---|
| threejs-game-development "Start with live truth": record Three.js version, worktree state, contracts | `index.ts` header, this doc | three 0.185.1, vitest 4.1.9, TS 6.0.3 from `package.json`; clean tree; preflight receipt green at e25a938. |
| threejs-game-development "Preserve authority boundaries": presentation never silently becomes authority | `part(... { solid })` explicit opt-in; `DEFAULT_SOLID_MATERIAL` | Only 49 of 801 parts emit colliders; cloth, slats, rafters, foliage and pavers do not. |
| atomic-acres-procedural-art-authoring §1 "Deterministic, no Math.random" | `mulberry32(0x6a7de211)` in `index.ts`; fixed seeds 9101–9104 in `materials.ts` | Test "is deterministic across builds" compares ids, bounds, stats and first 3,000 position floats. |
| atomic-acres-procedural-art-authoring §2 "generator = data-in, parts-out; focused regression pins behaviour" | `createStudioGardens(options)`, `gardens.test.ts` | 8 behavioural tests; budgets frozen as exported constants. |
| atomic-acres-procedural-art-authoring §5 "coplanar faces are z-fights; author a setback" | lap cladding `proud` offsets, meter/hose bracket at lx ≥ 0.06, condenser pad | Offsets are in code; visual z-fight check is OPEN (no render here). |
| atomic-acres-procedural-art-authoring §6 "noUnused* on; baseline tsc before editing" | — | `tsc --noEmit -p tsconfig.json`: 0 errors before and after. |
| photoreal-procedural-scene-forge rule 3 "author in millimetres, measure the result" | `materials.ts` tile sizes (cedar 0.6 m / 4 boards, lap 0.95 m / 5 courses, canvas 48 mm, shingle 1.2 m / 4 courses); `projectUvs` world-metre UVs | Tile metres are recorded on each material; pixel measurement of the rendered tile is OPEN. |
| photoreal-procedural-scene-forge rule 4 "what the frame must show is an albedo step or geometry" | Course shadow lines and board gaps baked into albedo AND stepped as geometry (cladding courses, deck boards, balusters) | Geometry counts above. |
| photoreal-procedural-scene-forge §6 "presentation geometry never derives collision; keep the bound readable" | Solids are hand-declared conservative boxes; roof is an enclosing AABB | Lane/spawn self-check throws on violation (exercised by the refusal test). |
| photoreal-procedural-scene-forge §0 source boundary | — | No text or code from `morning-diner` or any external repo was copied; the kit is original. |

Not used: Blender (not invoked; no source retained), the forge-kit facade parts, TSL node
materials (module stays on `MeshStandardMaterial` like every sibling world-studio module),
`?ablation` flags, capture harness. No external source was copied; no external asset was fetched.

## Focused test output

```
node node_modules/vitest/vitest.mjs run src/world-studio/gardens --reporter=verbose
 ✓ follows the architecture house records for its default yards
 ✓ builds finite, non-indexed, role-merged geometry inside the frozen budget
 ✓ emits unique canonical lowercase collider ids with finite bounds, each on a merged root mesh
 ✓ is deterministic across builds
 ✓ keeps every solid out of the access lanes, the spawn discs and the house footprints
 ✓ refuses a yard whose solids would land on a spawn or lane
 ✓ differentiates the yards and mirrors them about the road
 ✓ disposes idempotently and releases every generated texture
 Test Files  1 passed (1)   Tests  8 passed (8)
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json   → 0 errors
```

The first run of the lane test caught a real placement fault (the water butt sat 0.9 m from
spawn (-37, -20)); it was moved to the door-end corner rather than loosening the clearance.

Guards: `npm run pipeline:preflight -- --machine dave-gaming-pc --harness claude --project
atomic-acres-browser-arena --lane gardens-author-20260912` → `ok: true`, `routing.mode:
"routed"`, head e25a938 before work (rerun after the final commit, see final message).
AKP `akp_adoption_guard.py check --harness "Claude Code"` → PASS; `audit` → RED on
**Antigravity** (stale/expired receipt, not this harness) — reported, not borrowed or repaired.

## Known limitations

- **Rendering acceptance is OPEN.** No browser, renderer, build or screenshot was run in this
  lane. Nothing here claims the yards look right; that is class 2/3 evidence root owns.
- Sheds are closed volumes (doors are dressing on the wall); no interior, no enterable door.
- Roof collision is an enclosing box, slightly larger than the pitched slabs.
- Clotheslines are straight members; sheets are fixed billowed slabs, no animation loop.
- Yellow chairs sit two to a table on the 1.5 m deep deck (four would breach the side path).
- The nature lane's knee-high "shed skirt" hedge at Z -18.6 now runs 0.9 m in front of the
  shed's Z -19.5 wall; the door faces the house (lx side), so it is not blocked.
- Stepping stones and pavers overlap the presentation-only concrete side/cross paths by a few
  millimetres of height; both are non-solid.
- `perYard` triangle sums exclude nothing, but draw groups are shared across yards (15 total, not per yard).
