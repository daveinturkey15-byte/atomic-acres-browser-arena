# Raid Rebuild (`raid2`) — asset inventory

Lane AQ, HF-408. Required by the lane brief's protocol (`SPATIAL_PLAN`,
`ASSET_INVENTORY`, `TASK_STATE`). This file answers one question with numbers
rather than assurances: **what is this arena made of, and where did every part
of it come from?**

Claim-state on every row. Measured at commit `ec0e33d7`+repair
(`artifacts/raid2/inventory.ts`, `scripts/qa/audit-collider-visual-parity.ts`).

---

## 1. The short answer

**Nothing is imported.** No mesh, no image, no font, no LUT, no HDRI, no audio
file, no texture, no geometry from any reference, and nothing copied from any
other arena's source. `raid2` is 218 axis-aligned boxes and ten
`MeshStandardMaterial`s, authored as extents in `src/raid2-arena.ts` and lit by
a rig authored in `src/rendering/arenas/raid2.ts`.

| claim | state | evidence |
|---|---|---|
| `assetDependencies: []` — the arena downloads nothing of its own | VERIFIED | `src/rendering/arenas/raid2.ts`, asserted by `src/rendering/arena-visual-definition.test.ts` |
| No `ShaderMaterial` / `RawShaderMaterial` / `onBeforeCompile` anywhere in the lane's diff | VERIFIED | `git diff 49f5ff6b..HEAD` scanned; repo contract is three/webgpu NodeMaterial + TSL |
| Every visible mesh is a `THREE.BoxGeometry` emitted by one `rect()` helper | VERIFIED | `src/raid2-arena.ts`; there is exactly one geometry call site |
| The sky is an EXISTING preset (`range-midmorning`), reused not authored | VERIFIED | `atmosphere.preset` in `src/rendering/arenas/raid2.ts`; also used by `test1` and `map3` |
| Shared gameplay assets (operator rig, weapons, HUD) are inherited, not new | VERIFIED | `sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS` |

---

## 2. Geometry census (VERIFIED)

| quantity | value |
|---|---|
| movement colliders | 212 |
| physics colliders | 212 |
| visible meshes | 218 |
| distinct named families | 125 |
| invisible colliders (a collider with no mesh) | **0** |
| walk-through meshes (a mesh with no collider) | **0** |
| walkable visuals censused / fully supported | 42 / 42 |
| fall-through floors | **0** |

Source: `npx tsx scripts/qa/audit-collider-visual-parity.ts --arenas raid2` and
`audit-walkable-surface-parity.ts --arenas raid2`. Both ledgers were entered
EMPTY at the strictest floor and are hardened in vitest by
`src/collider-visual-parity-gate.test.ts` and
`src/walkable-surface-parity-gate.test.ts`.

The 218 meshes exceed the 212 colliders by exactly six presentation-only
surfaces, each declared and each with the movement/shot authority named beside
it:

| presentation-only mesh | why it has no collider | what IS the authority |
|---|---|---|
| `raid2 pool water` | a water sheet you swim/wade through | `raid2 pool basin` slab under it |
| `raid2 courtyard fountain basin` | 0.25 m of water inside a kerb | `raid2 courtyard fountain kerb` |
| `raid2 hillside skirt` | outside the playable boundary entirely | the boundary wall |
| `raid2 wing glazing` | glass: shots pass, bodies do not enter | `shots: true`, `solid: false` |
| `raid2 c3 window glazing` | same | same |
| `raid2-presentation-presentation-batch-0` | the batched draw of the above | n/a |

---

## 3. Element inventory, by zone

Counts are meshes. A "stair run" is nine risers emitted by one `stairRun()`
call; it is listed once.

### Ground and boundary
| family | n |
|---|---|
| `paving` (one per footprint rectangle) | 5 |
| `boundary north` / `boundary south` | 5 / 5 |
| `boundary jog north` / `boundary jog south` | 4 / 4 |
| `boundary west cap` / `boundary east cap` | 1 / 1 |
| `hillside skirt` (presentation only) | 1 |

The boundary is **generated from** `RAID2_BLOB`, the five-rectangle footprint
table, so the outline and the wall cannot drift apart. That is why the counts
above are 5/5/4/4 and not authored numbers.

### North lane — the pool terrace
| family | n |
|---|---|
| `court floor`, `court kerb north/south`, `court equipment store` | 4 |
| `pavilion north/west/east/south` + `pavilion roof` | 6 |
| `pool basin`, `pool water`, `pool coping`, `pool step sw/ne lower` | 8 |
| `pool bar west/east/south` + `pool bar roof` | 4 |
| `pergola pier`, `deck planter run`, `deck planter run east` | 4 |
| `wing north/west/east/spine`, `wing colonnade pier`, `wing glazing` | 10 |
| `wing floor west/head/landing/east` (the stairwell is the hole) | 4 |
| `wing stair` (9 risers) + `u1 rail` | 10 |
| `u1 wall north/east/west/south` | 6 |

### Centre lane — the house
| family | n |
|---|---|
| `house north/south/west/east` (split around their mouths) | 14 |
| `house partition west/east` (two mouths each, interleaved) | 6 |
| `c1 roof`, `c1 hearth block`, `c1 sofa run`, `c1 stair` (9) | 12 |
| `courtyard pier` ×4, `courtyard fountain kerb`, `courtyard fountain basin` | 6 |
| `c3 roof`, `c3 counter run`, `c3 island`, `c3 window sill/head/glazing` | 6 |
| `u2 floor west/landing/east`, `u2 wall north/west`, `u2 rail south/east/stairwell` | 11 |

### South lane — the circular drive
| family | n |
|---|---|
| `laundry west/east/south` + three floor slabs + `laundry stair` (9) + `bench` | 17 |
| `u3 wall west/east/north`, `u3 balcony floor` + three rails | 7 |
| `gallery west/east/south` + four floor slabs + `gallery stair` (9) + `sculpture` | 18 |
| `u4 wall east/west/north`, `u4 balcony floor` + three rails | 7 |
| `service west block`, `carport block` | 2 |
| `drive island kerb`, `drive fountain plinth`, `drive planter` ×4 | 6 |
| `drive kerb west/east`, `drive planting west/east` | 4 |

### The two ends
| family | n |
|---|---|
| `apron garden wall north/south`, `apron planter`, `apron screen` | 4 |
| `garage north/south/back`, `garage roof`, `garage bay pier` ×3 | 7 |
| `garage kerb` ×3, `garage workbench`, `garage crate stack` | 5 |

---

## 4. Material inventory (VERIFIED)

Ten materials, all `standard()` (`MeshStandardMaterial`) with an authored
albedo, roughness and metalness. No map, no texture, no LUT.

Luminance is Rec.709 relative luminance of the packed sRGB triple, computed by
`raid2PaletteLuminance()` in `src/raid2-arena.ts` — the same function fidelity
tests 22 and 23 assert against, so the readability rule below is a gate and not
a preference.

| family | hex | luminance | rough | metal | used on |
|---|---|---|---|---|---|
| `glass` | `0xbfd8de` | 0.828 | 0.10 | 0.10 | wing + office glazing (shots pass) |
| `stucco` | `0xc4b6a2` | 0.720 | 0.88 | 0.02 | every wall, every floor slab |
| `stone` | `0xa8a496` | 0.643 | 0.90 | 0.02 | **all hard cover**: piers, kerbs, plinths, counter runs, sculpture, stair treads, rails |
| `travertine` | `0x9a8f7d` | **0.565** | 0.93 | 0.02 | **the paving — the reference value** |
| `water` | `0x2e9cb0` | 0.526 | 0.12 | 0.05 | pool sheet, fountain basin |
| `hillside` | `0x79805f` | 0.487 | 0.98 | 0.00 | the skirt outside the boundary |
| `timber` | `0x8f6f4e` | 0.453 | 0.86 | 0.02 | furniture, crates, pergola piers |
| `court` | `0x386b63` | 0.375 | 0.95 | 0.02 | the sunken sport court |
| `planting` | `0x4a6540` | 0.363 | 0.97 | 0.01 | planters (hard cover at 1.9 m) |
| `poolTile` | `0x2f5f74` | 0.338 | 0.60 | 0.04 | the pool basin |

**THE READABILITY RULE, AND THE FACT THAT IT SHIPPED BROKEN.**
`src/raid2-arena.ts` states it in its own material header: *every vertical
surface a player shoots at sits well above the paving in value, so a silhouette
reads against it at range.* The arena's first revision broke it. `stone` — the
family that carries **every piece of hard cover on the map** — shipped at
`0x7b7466`, luminance 0.457, i.e. **below** the 0.565 paving it stands on.
Under this arena's grade (`gain [0.92, 0.86, 1.0]`, and green carries 72% of
luminance) those faces read as holes in the frame; the skeptic photographed it
in the first `raid2-courtyard.png`. `hillside` at `0x5d6247` (0.372) did the
same to the ground beyond the boundary.

Both are corrected here, and **the rule is now a gate**: fidelity test 22
asserts `stone >= travertine` and `stucco >= travertine`; test 23 keeps
`hillside` below the estate but above a void. Both assertions FAIL on the
palette as it shipped.

The three saturated families (`court`, `planting`, `poolTile`) sit below the
paving deliberately and are exempt from the rule by kind, not by exception:
they are *floor* surfaces and *foliage*, not vertical shooting backdrops. The
one that is a backdrop — `planting`, which is authored at 1.9 m hard cover in
the drive island — carries its own floor (`> 0.35`) in test 22.

---

## 5. Lighting and grade inventory

| element | value | provenance |
|---|---|---|
| key | `0xfff2dc` @ 2.62 | DERIVED: test2's key re-spectralised at constant Rec.709 luminance (0.835×3.0 = 2.505 ≈ 0.955×2.62 = 2.503). Same luminous key, neutral spectrum. |
| flat ambient | `0x93b6dd` @ 0.60 | Cool by argument (see note 1 in `raid2.ts`). Raised from 0.44 in the repair pass because `scene.environment` is NULL on this route, so this is the ONLY light on a face the sun misses. Inside the shipped envelope: rustworks-1v1 runs 0.72, gun-range 0.64. |
| shadow normal bias | 0.041 | DERIVED, not copied: 2048 over the same 108×84 m volume test2 fits gives a 52.7 mm texel; upstream's `texel × (0.55 + 1.1(1−NdL))` with this arena's 52° sun (NdL 0.788) gives 0.0413. |
| fog | `0xcdd8e2`, near 128 far 216 | PINNED BY GEOMETRY: hypot(100, 76) = 125.7 m, so near 128 keeps the whole playfield ahead of the haze band. |
| sky | `range-midmorning` | EXISTING preset. Authoring a new one means editing `sky-backdrop.ts`, outside this lane. |
| CDL grade | gain `[0.92, 0.86, 1.0]`, lift `[0.002, 0.003, 0.006]`, gamma `[1.1, 1.08, 1.04]` | Cool/lifted/low-contrast. Distinctiveness 0.02562 against a 0.02157 floor (18.8% headroom), nearest neighbour gun-range. The warm quadrant of the catalog is FULL — see `SPATIAL_PLAN` §6 and the lane report. |

`ART_DIRECTION_SAFETY_BOUNDS` were **not widened**: two drafts escaped them
(lift 0.009 > 0.006, atmosphere density 0.55 < 0.60) and the grade was
re-authored to fit, not the bound moved.

---

## 6. What this arena still owes (OPEN)

| item | state | note |
|---|---|---|
| Textures of any kind | OPEN | Everything is flat albedo. This is a LAYOUT lane with a clean first-pass style, per the brief; the art lane (Lane L) is shelved at the owner's instruction. |
| Menu preview clip | see `TASK_STATE.md` row 16 | The camera recipe is authored and fitted to `RAID2_BOUNDS`. |
| Eye-clearance stages 2–3 | OPEN | Browser stages; ledger carries the `-1` UNMEASURED sentinel, so the ratchet is RED for `raid2` by design until they run. |
| Two-client mp-lab run | OPEN | The registry row ships `multiplayer: true` and the spawn table is solved for two teams, but no lab run has been done. |
