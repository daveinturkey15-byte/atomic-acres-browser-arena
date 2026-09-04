# R3 — Material penetration and perforation design

Lane R3, research only, 2026-09-04. Repo `C:/Users/david/projects/aa-claude-research`,
branch `contrib/dave-gaming-pc/claude/research-2026-09-04`, base `e31cc869`.
No source was edited; every code claim below was read at that SHA.

**Claim states.** `VERIFIED` = I read the code (or ran a read-only reproduction of it)
in this repo at that SHA. `CLAIMED` = a source asserts it, I did not confirm.
`OPEN` = unknown, needs a measurement.

Owner statement being served (`docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`, HF-467):

> "glass or blocks have no penetration; metal and glass should be shot through,
> glass breaks; thin metal (the shed) should get a hole with no collision after"

and its neighbour HF-464: *"the windows upstairs need to be breakable"*.

---

## 1. Executive summary

The penetration **system** is not missing. It is built, tested and shipped: a shared
material resistance table, an energy-budget trace that continues through surfaces,
a dynamic aperture query that lets a bullet pass through a hole, a host-authoritative
perforation model with real hole geometry, and a glass authority with crack → breach →
detach phases. What is missing is that **Nuke Town Rebuild (`nuketown2`) — the arena
the owner is playing — was authored without connecting to any of it**, and the gate
that would have caught that iterates a hand-written list of six arena builders that
does not include it.

Concretely, and all VERIFIED:

| # | Finding | Evidence |
|---|---|---|
| F1 | `nuketown2` ships `breakableWindows: []` — **no pane in the arena can ever break**. | `src/nuketown2-arena.ts:1529` |
| F2 | `nuketown2` window glass is a **permanent static movement collider**, so even a hypothetical break would leave the frame solid, and bots can never see through a window. | `src/nuketown2-arena.ts:878-879` (no `solid:false`), `src/additional-maps.ts:145-149` |
| F3 | 22 shot surfaces in `nuketown2` classify as `fallback` → material `reinforced` (`entryCost: 1000`). They are **literally unshootable**. Four of them are the `m.block` yard "stores" and buttresses — the shed-looking boxes the owner most plausibly shot. | classifier replay, see §3 |
| F4 | The unit gate that forbids `classification === 'fallback'` iterates a **hardcoded six-builder literal**; `nuketown2`, `map3`, `raid2`, `test1`, `test2` are not in it. | `src/ballistics.test.ts:3-20, 170-189` |
| F5 | Name-rule misclassifications inside `nuketown2`: window **trim** rated as glass; the **ground-floor partitions** rated as packed earth; the car **cabin glass** rated as structural metal. | classifier replay, see §3.2 |
| F6 | Perforation admission uses **muzzle** energy (`power × fmj × 10`), not the trace's remaining energy at that surface, so a shot through two walls at 60 m perforates sheet metal exactly as hard as a point-blank shot. | `src/legacy-main.ts:4644-4647` |
| F7 | Perforation exists **only** for the field shed. Nothing else in any arena can gain a hole, including the `nuketown2` moving truck's box body — the map's only other obvious thin-metal object. | `src/destructible-shed-registry.ts`, `src/interactive-world-runtime.ts:536-570` |

The lane is therefore mostly **connect and rate**, not **build**. That is good news: the
2–3 hour plan in §10 can land the owner-visible behaviour without inventing a new
authority, and it leaves a clean, small interface (§9) for a later pass that gives
non-shed panels real holes.

---

## 2. What already exists (VERIFIED inventory)

### 2.1 The trace

`src/ballistics.ts` is the single shared shot authority — local fire, bots, host
verification of a guest's shot request, drone/chopper rays all go through it.

- `BALLISTIC_MATERIALS` (`src/ballistics.ts:66-81`) — one frozen table,
  `{entryCost, costPerMeter}` per `BallisticMaterialId`. Twelve ids:
  `glass, fence, wood, interior-wall, brick, concrete, thin-metal, structural-metal,
  vehicle, container, earth, reinforced`. `reinforced` is `1000/1000` — the deliberate
  "stops everything" sentinel.
- `classifyBallisticMaterial` (`:94-146`) resolves a material from evidence in
  priority order: **explicit** `ballisticMaterial` option → **rule** (regex over the
  mesh name) → **rule** (`impactSurface` for `glass`/`wood`/`soil`/`metal` only) →
  **fallback** `reinforced`. `classification` records which branch won. HF-390's
  comment is explicit that fallback is meant to be a *reported authoring failure*,
  not a shipped state.
- `traceBallisticPath` (`:293-380`) is the continuation model the owner is asking for
  and it already works: it slabs the ray against every candidate surface, sorts by
  entry distance, charges `entryCost + costPerMeter × thickness` against a distance-
  attenuated energy budget, stops at the first surface it cannot afford, and returns
  `impacts[]` with `penetrated: boolean` plus a `damageMultiplier`.
- `apertureQuery?: BallisticApertureQuery` (`:290-320`) — **the hole mechanism**. Any
  surface whose aperture query answers true *at the exact world entry point* is
  filtered out of the trace entirely. This is how "a hole with no collision after"
  is already implemented for the shed. No new raycast machinery is needed.
- Weapon budgets live in `src/combat/weapon-catalog.ts` (`penetration.power`,
  `fmjMultiplier`, `wallPenetrationMultiplier`, `maximumSurfaces`); e.g. carbine
  `5.8 × 1.12 = 6.50`, sniper `9.4 × 1.16 = 10.90`, 12ga pellet `2.15`.

Sanity check against the table, at point-blank (energy = full):
`glass` 0.08 m pane costs `0.08 + 0.25×0.08 = 0.10` — every weapon crosses.
`interior-wall` 0.2 m costs `0.63`. `thin-metal` 0.1 m costs `1.25`.
`brick` 0.7 m costs `5.2`. `concrete` 0.5 m costs `6.0`. `reinforced` costs `1080`.

### 2.2 The per-box authoring surface

`box()` in `src/additional-maps.ts:90-150` is the one emitter every arena uses
(`nuketown2` wraps it with `pair`/`centred`/`streetVehicle`, `src/nuketown2-arena.ts:519-582`).
Its options are the data model we already have:

```ts
{ solid?: boolean;            // movement collider + physics collider
  shots?: boolean;            // default = solid; pushes a BallisticSurface
  ballisticMaterial?: BallisticMaterialId;   // the explicit authority
  breakableWindowId?: string; // binds this surface to a glass pane id
  rotation?, cast?, detail? }
```

`solid` and `shots` are independent, which is what makes a *shoot-through-but-solid*
or *walk-through-but-shot-rated* surface expressible today (the gun-range wallbang lab
uses `solid:false, shots:true`, `src/additional-maps.ts:2292-2296`).

### 2.3 Glass: breaks, and the break is authoritative

- `src/glass-authority.ts` — phases `intact → cracked → breached → detached`,
  damage thresholds `350 / 1000 / 1600` Q, profiles `knife|bullet|explosion`
  (`1000/1000/2000` Q), replay protection by `impactId`, and one canonical projection
  `glassAuthorityProjection` (`:82-94`) that emits `paneVisible, crackOverlayVisible,
  apertureOpen, movementSolid, ballisticSolid, aiLineOfSightSolid` from a single phase.
  **That projection is the class contract we should copy for every other material.**
- Registration: `ArenaMap.breakableWindows: BreakableWindow[]`
  (`src/map.ts:54, 73`), each `{id, mesh, broken, glassState?}`.
- Ballistic removal on breach: `activeBallisticSurfaces()` filters out every surface
  whose `breakableWindowId` is in the broken set (`src/legacy-main.ts:4510-4520`).
- Movement removal on breach: `activeGlassDynamicColliders()` →
  `deriveGlassColliderBounds` → `isGlassMovementSolid` returns false for breached
  panes, so the pane's collider simply stops being emitted
  (`src/legacy-main.ts:3750-3762`, `src/glass-collider-bounds.ts:33-40, 187-223`).
  Bounds resolve from authored house solids, an id→Box2 map, **or the pane mesh's own
  world-transformed geometry bounds** (`authoredMeshBounds`, `:141-186`) — the last
  fallback means an arena with no `houses[]` can still register panes correctly.
- Break entry point: `breakHouseWindow` (`src/legacy-main.ts:15864-15933`) and
  `breakWindowsAlongBallisticTrace` (`:15935-15962`), driven off `trace.impacts`.
- Replication: shooter-authored `window-break` message, canonicalised by the host
  (`canonicalHostWindowBreak`, `:15964`) and re-validated on receipt with an
  independent `traceWeaponPath` (`:16084-16091`). It is **not** in
  `isHostAuthorityMessage` — glass is deliberately a validated-broadcast, not a
  host-only mutation.
- Two shipped precedents to copy from:
  Atomic Acres houses (`kind:'glass'` solids → `breakable`, `src/house-navigation.ts:100`,
  registered at `src/map.ts:583-585, 707-709`), and Skyline Terminal's facade panes
  (`solid:false, shots:true, ballisticMaterial:'glass', breakableWindowId`,
  `src/additional-maps.ts:3345-3353`) — the second is the *no-house-architecture* pattern
  `nuketown2` needs.

### 2.4 Thin metal: perforates, with real holes

`src/destructible-world.ts` + `src/destructible-shed-definition.ts` +
`src/destructible-shed-presentation.ts` + `src/interactive-world-runtime.ts`.

- Per-surface state `DamageableSheetSurfaceState` (`destructible-world.ts:59-67`):
  `stage: 'intact'|'dented'|'perforated'|'detached'`, `apertures[]`, `dents[]`,
  `healthQ`.
- `BallisticAperture` (`:41-48`) is `{id, surfaceId, uQ, vQ, radiusUQ, radiusVQ}` in
  panel-local quantised coordinates (`SHED_PANEL_COORD_Q = 10_000`, so ±Q maps to
  ±halfU/±halfV). Caps: 96 apertures, 64 dents per shed.
- `applyShedSheetImpact` (`:837-910`) is host-only, epoch- and revision-checked, and
  decides `perforates = penetrationEnergyQ >= thresholds.perforateEnergyQ` (21),
  `dents = damageQ >= dentDamageQ` (20). The comment at
  `destructible-shed-definition.ts:83-86` records the owner requirement it encodes:
  *every catalogue firearm must punch a visible see-through hole in sheet metal.*
- Pass-through: `shedApertureContainsWorldPoint` (`:1265-1276`) →
  `InteractiveWorldRuntime.apertureQuery` (`interactive-world-runtime.ts:1335-1354`) →
  handed to `traceBallisticPath` by `traceWeaponPath` (`legacy-main.ts:4551-4562`).
- **Movement collision is deliberately unchanged by perforation**: the panel keeps
  pushing a `movementCollider` regardless of aperture count
  (`interactive-world-runtime.ts:536-546`). A bullet hole is not a doorway. This is the
  correct reading of "no collision after" — no *ballistic* collision at the hole.
- Rendering: real geometry, not a decal. `panelShape` builds a `THREE.Shape` and pushes
  a `THREE.Path.absellipse` **hole** per aperture, then `ShapeGeometry`
  (`destructible-shed-presentation.ts:48-108`), plus an `InstancedMesh` of torus rims
  capped at `SHED_MAX_APERTURES` (`:449-452, 538-607`). Geometry is rebuilt only when a
  revision-keyed signature changes (`:370-372`), and retired behind a GPU fence.
- Replication: host mutates, then `broadcastInteractiveWorldState()` sends the whole
  `interactive-world-snapshot` envelope (`legacy-main.ts:12496-12511`); guests apply it
  through `applyAuthoritativeEnvelope` (`interactive-world-runtime.ts:687-720`).
  `'interactive-world-snapshot'` **is** in `isHostAuthorityMessage`
  (`src/protocol.ts:1395`), so a guest can never author one.
- Sheds are placed in `nuketown2`: two of them, one per back yard
  (`src/destructible-shed-registry.ts:59-66`), and the eligibility row requires them
  (`:14-16`).

### 2.5 Where the shot is decided in multiplayer

- Host resolves a guest's shot request with the *same* trace and *then* applies world
  damage: `traceWeaponPath(...)` immediately followed by
  `applyInteractiveWorldBallisticTrace(...)` (`legacy-main.ts:14790-14791`).
- `applyInteractiveWorldBallisticTrace` (`:4636-4700`) early-returns unless
  `interactiveWorldRuntime.hasHostAuthority()`. Guests never mutate; they mirror.
- The killstreak lane's `src/taser-protocol.ts` (branch
  `origin/contrib/dave-gaming-pc/claude/killstreak-tuning`) is the reference shape for a
  *new* message if one is ever needed: a `Readonly<{type, schemaVersion, by,
  forPlayerId, result, nonce}>`, an `exactKeys` + per-field validator, an entry in
  `isHostAuthorityMessage` so `network.ts` drops it on a guest connection, and a
  victim-side consumer that replays it. **This lane needs no new message** (§7).

### 2.6 Bots

`botHasLineOfSight` (`legacy-main.ts:20385-20399`) tests
`activeWorldColliders().some(segmentIntersectsBox(...))` — i.e. **movement colliders
only**, never `shotSurfaces`. Consequences, both intended:

- A breached glass pane loses its movement collider, so bots immediately see and shoot
  through it. Free, correct, already wired.
- A perforated sheet keeps its movement collider, so bots do **not** see through a
  5 cm hole. Also correct.
- But it also means F2 bites bots hardest: `nuketown2` window glass is a permanent
  static collider in `arena.colliders`, so **bots can never see out of a window on that
  map**, before or after any break.

### 2.7 The QA surface that already exists

- `src/ballistics.test.ts:170-189` — "classifies every current arena shot blocker with
  unique authority": asserts `shotSurfaces.filter(classification === 'fallback')` is
  empty. **Hardcoded six-builder roster** (F4).
- `src/collider-visual-parity-gate.test.ts` — the permanent vitest gate that builds
  **every** arena via `runColliderVisualParityAudit(ALL_ARENA_IDS)` and already computes
  `shotSurfaceStats.byClassification` and a full `shotSurfaceRoster`
  (`scripts/qa/collider-visual-parity-core.ts:636-646`). It gates *unrated ghost meshes*
  but **never looks at `byClassification.fallback`**. This is the correct, derived place
  to gate F3 — the roster cannot go stale there.
- `scripts/qa/audit-ballistic-parity.ts` (`npm run qa:ballistic-parity`) — writes a
  per-arena ledger with `shotSurfaceStats` and a ratchet; ceilings are pinned twice
  (`scripts/qa/ballistic-parity-ledger.ts:129-150` and the gate test's mirror at
  `:160-190`) so raising one takes two edits in review.
- `scripts/qa/verify-hf390-ballistics-cdp.mjs` — live Chrome/WebGPU sweep that reads
  `snapshot().ballistics.arenas[id].fallbackSurfaces` (produced at
  `legacy-main.ts:34008-34016`) and asserts zero fallbacks, plus a deterministic ray fan
  that must actually penetrate. Its roster is derived from `scripts/qa/arena-roster.mjs`,
  so it *would* catch F3 — on a run that visits `nuketown2`. (OPEN: whether that sweep
  has been run against `nuketown2` since HF-407 landed; `artifacts/qa/` is the receipt.)
- The **gun-range wallbang lab** (`src/additional-maps.ts:2283-2306`): four labelled
  lanes — `GLASS 8 CM`, `WOOD 24 CM`, `PLASTER 42 CM`, `BRICK 70 CM` — each a
  `solid:false, shots:true` panel with an explicit `ballisticMaterial` and a scored plate
  behind it, boxed in by two `structural-metal` walls. This is exactly the probe fixture
  this lane needs; it is missing a **thin metal** and a **structural metal** lane.

---

## 3. Why it feels like "no penetration": the measured root causes

### 3.1 Twenty-two unshootable surfaces in `nuketown2` (VERIFIED)

I extracted every name literal passed to `pair` / `centred` / `streetVehicle` in
`src/nuketown2-arena.ts` (82 templates) and ran the exact regex chain from
`classifyBallisticMaterial` plus the `classifyImpactSurface` rescue
(`src/combat-feedback.ts:34-43`) and each call site's material metalness. The
name-rule stage produced 26 `FALLBACK` names; after the `impactSurface` rescue
(`glass`/`wood`/`soil`/`metal` only — `concrete` is **not** a rescue) these are the
shot-rated surfaces that end at `reinforced`:

| Name (each emitted twice by `pair`) | Material arg (metalness) | Line | Why it falls through |
|---|---|---|---|
| `yard side store` | `m.block` (0.01) | 1379 | no name rule; impact `concrete` |
| `yard far store` | `m.block` (0.01) | 1390 | ditto |
| `yard butt` | `m.block` (0.01) | 1411 | ditto |
| `path buttress east` / `west` | `m.block` (0.01) | 1403-1404 | ditto |
| `yard patio table` | `m.planter` (0.01) | 1367 | ditto |
| `yard far crate` | `m.planter` (0.01) | 1396 | ditto |
| `yard porch` | `m.drive` (0.02) | 1363 | ditto |
| `street kerb 0` / `1` | `m.kerb` (0.02) | 1275 | ditto |
| `verge drive edge` | `m.kerb` (0.02) | 1305 | ditto |
| `verge sign board` | `m.sign` (0.06) | 1331 | ditto |

That is 11 templates × 2 (the fairness involution) = **22 `reinforced` shot surfaces**,
including the four `m.block` hard-cover boxes named *"store"* and *"buttress"*. A
6.0 × 2.6 m box called a **store** in a back yard is a shed to a player's eye, and it
costs 1080 energy to enter against a sniper's 10.9. **This is almost certainly the
object behind "blocks have no penetration"**, and quite possibly behind "thin metal
(the shed)" too — the real destructible field sheds are in the same yards
(`destructible-shed-registry.ts:59-66`), so the owner may have shot one of each and
concluded neither works.

Note the audit blind spot: these surfaces are **rated** in the parity sense (a
`BallisticSurface` exists with a footprint), so `qa:ballistic-parity`'s ghost-mesh
ratchet — pinned at 0 for `nuketown2` — passes. Nothing anywhere asserts that the
rating is *usable*.

### 3.2 Three misclassifications that invert the owner's expectation (VERIFIED)

| Surface | Resolves to | Should be | Why |
|---|---|---|---|
| `house front window head N`, `house front window sill N`, `house upper window sill` (`nuketown2-arena.ts:877,879,899`) | **`glass`** (0.08/0.25) | `wood` or `interior-wall` | the name contains "window"; these are the solid **trim** boxes above and below the pane. Bullets pass through the window *frame* like air. |
| `house ground partition N` (`:990`, `storey ∈ {'ground','upper'}`) | **`earth`** (4.0/12.0) | `interior-wall` (0.42/1.05) | the name contains "ground". The **same wall one storey up** is `interior-wall`. A ground-floor plaster partition is currently harder than brick. |
| `car cabin`, `head car cabin` (`:1204,1181`, `m.carGlass` metalness 0.50) | **`structural-metal`** (2.15/6.4) | `glass` | rescued by metalness before any glass rule fires. The car windscreens are rated as steel. |

Also worth an explicit rating even though they resolve acceptably: `car body` /
`head car body` → `structural-metal` (should be `vehicle`), and the moving truck's box
body → `structural-metal` (it is the map's obvious `thin-metal` candidate; see §9).

### 3.3 The gate that should have caught all of this (VERIFIED)

`src/ballistics.test.ts:3-20` imports exactly six builders and `:173` iterates that
literal. `nuketown2`, `map3`, `raid2`, `test1`, `test2` have never been through the
zero-fallback assertion. This is the *"Hardcoded gate rosters"* failure mode the repo
has already written a gotcha about, and `scripts/qa/arena-roster.mjs:1-45` documents
three prior instances of it by name.

### 3.4 Perforation energy is measured at the muzzle (VERIFIED)

`legacy-main.ts:4644-4647`:

```ts
const penetrationEnergyQ = Math.max(0, Math.round(
  spec.penetration.penetrationPower * spec.penetration.fmjMultiplier * 10,
));
```

This is a per-weapon constant. The trace already knows the real answer — energy is
tracked through `traceBallisticPath` and every `impact` carries its `entryDistance` —
but none of it reaches the perforation threshold. Symptoms: a shot that has already
crossed a brick wall still punches a clean hole in sheet metal; distance falloff is
invisible to the shed. `damageQ` has the same flaw (`Math.round(spec.damage)`, ignoring
`trace.damageMultiplier`).

---

## 4. Material classes: the design

One canonical projection, derived from the existing `BallisticMaterialId` — **no second
hand-maintained list** (AGENTS.md: *"a second hand-maintained eligibility list is a
release blocker"*). Add to `src/ballistics.ts`:

```ts
export type BallisticMaterialClass =
  | 'shatter'     // penetrable, and the surface breaks open on admitted damage
  | 'perforate'   // penetrable, and each admitted hit leaves a persistent aperture
  | 'penetrate'   // penetrable, energy-costed, no persistent state change
  | 'stop';       // not penetrable by any catalogue firearm; cover you must go around

export const BALLISTIC_MATERIAL_CLASS:
  Readonly<Record<BallisticMaterialId, BallisticMaterialClass>> = Object.freeze({
    glass: 'shatter',
    'thin-metal': 'perforate',
    fence: 'penetrate',
    wood: 'penetrate',
    'interior-wall': 'penetrate',
    vehicle: 'penetrate',
    container: 'penetrate',
    'structural-metal': 'penetrate',
    brick: 'stop',
    concrete: 'stop',
    earth: 'stop',
    reinforced: 'stop',
  });
```

`reinforced` keeps its sentinel meaning and gains an explicit second one: **an arena
that ships a `reinforced` surface has an authoring bug**, gated in §8.

Per-class contract, stated the way `glassAuthorityProjection` already states it, so
every consumer derives instead of re-deciding:

| Class | Ballistic | On admitted hit | Movement collider | Bot LOS | Presentation | Replication |
|---|---|---|---|---|---|---|
| `shatter` (glass) | crosses at `0.08 + 0.25·t` | glass authority phase advances; at `breached` the surface leaves `activeBallisticSurfaces()` and the pane's dynamic collider stops being emitted | **removed** at `breached` | **opens** at `breached` (free — LOS reads movement colliders) | pane hidden, crack overlay at `cracked`, persistent debris | validated-broadcast `window-break` (existing) |
| `perforate` (thin metal) | crosses at `0.95 + 3.0·t`; at an aperture the surface is **skipped entirely** by `apertureQuery` | aperture appended if remaining energy ≥ `perforateEnergyQ`, else a dent if damage ≥ `dentDamageQ`; both capped | **kept** — a bullet hole is not a doorway | **closed** in v1 (see §6 for the shredding escalation) | `ShapeGeometry` hole + instanced rim (existing shed path) | host-only mutation + `interactive-world-snapshot` (existing) |
| `penetrate` (wood, plaster, fence, vehicle, container, structural metal) | crosses if the energy budget affords it; damage attenuated by `damageMultiplier` down to `minimumWallDamageMultiplier` | nothing persistent (v1) | kept | closed | existing impact flash / decal / audio via `ballisticImpactSurface` | none needed |
| `stop` (brick, concrete, earth, reinforced) | absorbs; `trace.stoppedBy` names it | nothing | kept | closed | impact flash + `concrete`/`soil` audio | none |

Two deliberate non-goals for this lane, both to be stated in the ledger rather than
quietly skipped:

- **Wood does not gain persistent holes.** The owner asked for glass and thin metal.
  Wood already has damage falloff through the shared trace. Adding a fourth stateful
  class multiplies the replication and budget surface for no owner-visible win.
- **`stop` materials never become penetrable by tuning.** If a `concrete` box reads as
  a shootable prop, the fix is to re-rate the box, not to soften the table. The table is
  shared by six shipped arenas.

---

## 5. Data model — what to add

The per-box `ballisticMaterial` already is the authority. Three additions, in
increasing order of cost:

**(a) Nothing, for `stop`/`penetrate`.** Correcting `nuketown2`'s ratings is pure
authoring: add explicit `ballisticMaterial` to the 22 fallback surfaces and the three
misclassified families. This alone resolves "blocks have no penetration".

**(b) `breakableWindowId` + an `ArenaMap.breakableWindows` row, for `shatter`.**
Already in `box()`'s options (`additional-maps.ts:102`). For `nuketown2` follow the
Skyline Terminal shape (`additional-maps.ts:3345-3353`) rather than the Atomic Acres
house-architecture shape:

```ts
const paneId = `nuketown2-${side}-house-front-window-${index}`;
const pane = box(builder, `${side} house front window glass ${index}`, …, m.windowGlass, {
  solid: false,            // <- the static collider must go; the pane gets a DYNAMIC one
  shots: true,
  ballisticMaterial: 'glass',
  breakableWindowId: paneId,
  cast: false,
});
pane.userData.breakableWindowId = paneId;
pane.userData.dynamic = true;
breakableWindows.push({ id: paneId, mesh: pane, broken: false });
```

`solid:false` is **required and sufficient**: with it, the pane's only movement collider
comes from `activeGlassDynamicColliders()`, whose bounds resolve from
`authoredMeshBounds(pane.mesh)` (`glass-collider-bounds.ts:141-195`) while intact and
vanish at `breached`. HF-435's contract — *"bullets cross but shoulders do not"* — is
preserved exactly, and the break now actually opens the hole. `pair()` must mint a
distinct pane id per half; the north/south involution makes that a one-line change.

**(c) A perforable-panel placement registry, for `perforate` outside the shed.**
Deferred out of the 2–3 h lane; interface specified in §9.

---

## 6. Runtime

**Raycast continuation: no change.** `traceBallisticPath` already continues after a
penetrable hit with power loss, already respects `maxPenetratedSurfaces`, already
returns per-impact entry/exit/thickness, and already consults an aperture query. Every
line of "raycast continuation" work in this lane is a *data* change.

**Perforation admission: use the trace's real energy (F6).** Replace the muzzle constant
in `applyInteractiveWorldBallisticTrace` with a per-impact value derived from the same
trace that produced the impact:

- Energy retained at that surface = `weaponPenetrationEnergy(spec.penetration) ×
  penetrationEnergyRetention(spec.penetration, impact.entryDistance)`, minus the
  traversal cost of every earlier `impacts[]` entry. Both helpers are already exported
  (`ballistics.ts:271-291`). Cheapest correct form: have `traceBallisticPath` record
  `energyAtEntryQ` on each `BallisticSurfaceImpact` (it already has the number in a
  local; adding one readonly field is additive and cannot change any existing outcome),
  then `penetrationEnergyQ = impact.energyAtEntryQ`.
- `damageQ` should likewise be `applyPenetrationDamage(spec.damage, trace.damageMultiplier)`
  (`ballistics.ts:388-395`) rather than the raw base.
- **Do not** re-tune `perforateEnergyQ: 21` in the same change. The shed's threshold was
  set so the weakest round (12ga pellet, 22Q) clears it
  (`destructible-shed-definition.ts:83-86`); changing the input scale and the threshold
  together makes the regression un-attributable. Land the input fix with a test that
  pins the point-blank pellet still perforating, and open a separate row if the falloff
  then reads wrong.

**Hole geometry: reuse, do not invent.** `panelShape` + `ShapeGeometry` + instanced
torus rims (`destructible-shed-presentation.ts:48-108, 449-452`) is the shipped
approach and it is the right one: real geometry participates in depth, shadow and the
WebGPU colour pass, where a stencil/alpha decal on a thin box would z-fight (see the
HF-434/HF-463 street-decal history) and would not read as a hole from behind. A decal
is acceptable *only* for `penetrate`-class scuffs, which this lane does not add.

**Collider updates: prefer none.** The `perforate` class never removes a movement
collider, so Rapier is untouched by perforation — the existing `syncInteractiveWorldPhysics()`
call after a shed mutation only exists for detached debris bodies. For `shatter`,
collider removal is already handled by the dynamic-collider list plus
`invalidateActiveWorldCollisionCache()` (`legacy-main.ts:15898`), which is O(1) per break.

**Performance.**

- `traceBallisticPath` allocates ~8 `THREE` objects **per candidate surface per trace**
  inside `surfaceInterval` (`ballistics.ts:204-225`: two `Vector3` for centre/half, two
  `Quaternion`, three more `Vector3`, plus `.map/.filter/.sort` arrays). That is per
  *shot*, not per frame, so it is not a frame-pacing risk today, but it scales with the
  arena's shot-surface count and `nuketown2` is dense. **OPEN:** measure
  `snapshot().ballistics.arenas.nuketown2.shotSurfaces`. If it is over ~600, hoist the
  scratch vectors to module scope and add an AABB broad-phase reject before the slab
  test — a mechanical, behaviour-preserving change with a byte-identical-output test.
- The per-frame eye-clearance probe uses `segmentBoxHitTime` against a cached nearby
  subset, not `traceBallisticPath` (`legacy-main.ts:4590-4614`) — no risk there.
- Decal/aperture budget: keep the shed's shape — a hard global cap enforced in the
  authority (`aperture-cap` / `dent-cap` rejection reasons,
  `destructible-world.ts:865-867`), not in presentation. Any new panel registry inherits
  the same cap discipline and one shared `InstancedMesh` rim pool.
- Geometry rebuild must stay revision-keyed (`destructible-shed-presentation.ts:370-372`)
  so a static panel costs zero per frame.

---

## 7. Multiplayer replication

**No new wire message is required.** Both mechanisms already exist and are already
gated:

- **`shatter`** rides the existing `window-break` path: shooter authors, host
  canonicalises (`canonicalHostWindowBreak`), receivers re-validate with an independent
  `traceWeaponPath` and a `windowBreakPathBlocked` check
  (`legacy-main.ts:16084-16091`). Guests may author it *by design* — that is what makes
  a guest's own glass break feel instant. Adding `nuketown2` panes inherits all of it.
- **`perforate`** rides `interactive-world-snapshot`: host-only mutation
  (`applyInteractiveWorldBallisticTrace` early-returns unless `hasHostAuthority()`),
  then a full hashed envelope with revision monotonicity, epoch match and per-shed
  identity checks on the guest (`interactive-world-runtime.ts:669-720`);
  `'interactive-world-snapshot'` is listed in `isHostAuthorityMessage`
  (`protocol.ts:1395`) so `network.ts` drops a guest-authored one.

If a later pass adds panels outside the shed, extend the **existing envelope** with a
`panels: readonly PerforablePanelState[]` field and bump
`INTERACTIVE_WORLD_SCHEMA_VERSION` — do not mint a parallel message. `exactKeys` in
`isInteractiveWorldStateEnvelope` (`interactive-world-runtime.ts:128-140`) makes the
schema change fail closed on a mismatched peer, which is the desired behaviour.

The taser lane's shape (`taser-protocol.ts`) remains the template if a *new* message
ever is needed: typed readonly message, `exactKeys` + per-field validator, an entry in
`isHostAuthorityMessage`, a consumer that replays it. Recording it here so the next
implementer does not re-derive it.

---

## 8. Bot awareness

- **Glass:** already correct and free. Bot LOS reads `activeWorldColliders()`
  (`legacy-main.ts:20392`); a breached pane's dynamic collider stops being emitted, so
  bots see and shoot through the opening on the very next query. Fixing F2 (making
  `nuketown2` panes `solid:false` + dynamic) is what *gives* `nuketown2` bots windows at
  all — today the static pane collider blocks their sight permanently.
- **Perforation:** deliberately does **not** open LOS in v1. A ~5 cm hole is not a
  sightline, and opening one would let a bot shoot a player it cannot plausibly see.
- **Escalation, specified but not built:** `shedRegionalDamageAt`
  (`destructible-world.ts:740-760`) already returns `{apertureCount, dentCount,
  markCount, maximumDentDepthQ}` inside a bounded panel region, and
  `cornerWeakeningTriggersCollapse` already uses it. A future "shredded" stage would be
  *derived from the same query* — e.g. `markCount ≥ K` inside `SHED_DAMAGE_REGION_RADIUS_Q`
  — and would drop the movement collider for that panel, which opens bot LOS, player
  traversal and ballistics together through one flag. Do not add a separate
  bot-only see-through flag; that is exactly the profile-only-authority divergence
  AGENTS.md forbids.
- **Cover valuation:** bots score cover from `activeWorldColliders()` too
  (`legacy-main.ts:16734, 19910`), so re-rating a `reinforced` box to `interior-wall`
  changes nothing about how bots *use* it, only about whether bullets cross it. That
  asymmetry is intended (a bot hiding behind a plaster wall should still be shootable)
  but it is worth one sentence in the ledger so it is not later "fixed".

---

## 9. Deferred: the generic perforable panel (interface only)

Not in the 2–3 h lane. Written down so the next lane starts from a decision.

`DestructibleShedDefinition` cannot be reused for arbitrary arena panels: its validator
requires **exactly one** `role:'door'` surface, **exactly six** pre-authored chunks in a
one-to-one map with detachable surfaces, and outward-facing normals relative to the
placement origin (`destructible-world.ts:376-434`). Loosening it to fit a truck box
would be weakening a verifier — forbidden. Instead, add a small sibling:

```
src/perforable-panel-authority.ts     // definition, state, applyPanelImpact, reset
src/perforable-panel-registry.ts      // per-arena placements, mirroring PASS65_SHED_PLACEMENTS
src/perforable-panel-presentation.ts  // reuses panelShape/ShapeGeometry + one shared rim pool
```

reusing, not copying, the exported primitives `apertureContainsPanelPoint`,
`SHED_PANEL_COORD_Q`, and the `BallisticAperture` type. It plugs into
`InteractiveWorldRuntime` at three points that already exist:
`rebuildCollisionView()` (emit the panel's `BallisticSurface` + movement collider),
`applyBulletImpact()` (route by a `perforablePanel` discriminator on the surface,
beside the existing `destructibleSurface` / `majorDebris` / `houseFragment` ones), and
`apertureQuery` (add the panel lookup). First targets, in order: the `nuketown2` moving
truck's box body (`truck box flank/roof/bulkhead`, currently `structural-metal`), then
the garage doors, then RustRig's open-container skins.

---

## 10. Implementation plan for the post-reset lane

**Shape.** One Opus implementer, one isolated worktree, ~2–3 h. Change impact:
`runtime`. Every step ends in a runnable check; steps 1–5 are independently
revertable. Do **not** attempt §9 in this lane.

**Step 0 — set up (10 min).**
Fetch `origin/main`; create `contrib/dave-gaming-pc/claude/<slug>` in a clean isolated
worktree (never reuse another lane's). Run
`npm run pipeline:preflight -- --machine dave-gaming-pc --harness "Claude Code"`.
Read `src/ballistics.ts:66-146` and `src/nuketown2-arena.ts:519-582` before touching
anything.

**Step 1 — the derived material-class projection (20 min).**
Add `BallisticMaterialClass` + `BALLISTIC_MATERIAL_CLASS` to `src/ballistics.ts`
exactly as in §4. Add to `src/ballistics.test.ts`: every `BallisticMaterialId` has
exactly one class; every `stop` material's `entryCost` exceeds the strongest
non-railgun budget (`weaponPenetrationEnergy(WEAPONS.sniper.penetration)` = 10.90);
every non-`stop` material's point-blank 0.1 m cost is under the weakest budget
(12ga pellet, 2.15). This is the mutation guard that stops a future re-rating from
silently making a `stop` material shootable.
*Gate:* `npx vitest run src/ballistics.test.ts`.

**Step 2 — the derived-roster fallback gate, RED first (20 min).**
Add one `it(...)` to `src/collider-visual-parity-gate.test.ts` (which already audits
`ALL_ARENA_IDS`): for every arena, `shotSurfaceStats.byClassification.fallback ?? 0`
must be `0`, and the failure message must list the offending
`shotSurfaceRoster[].name`s. Separately, replace the six-builder literal in
`src/ballistics.test.ts:173` with the same derived audit (or delete that assertion in
favour of the new one — do not leave two rosters).
*Expected:* RED, naming ~22 `nuketown2` surfaces. **Record the red output in the PR.**
A green here before Step 3 means the gate is not looking at the arena.

**Step 3 — rate `nuketown2` (30 min).**
In `src/nuketown2-arena.ts`, add explicit `ballisticMaterial` to every surface in the
§3.1 table and the §3.2 misclassifications:

- `yard side store`, `yard far store`, `yard butt`, `path buttress east`/`west` →
  `'concrete'` (they are hard cover by design: `HARD_COVER` height, `m.block`).
- `yard patio table`, `yard far crate` → `'wood'`; `yard porch` → `'concrete'`.
- `street kerb 0/1`, `verge drive edge` → `'concrete'`.
- `verge sign board` → `'thin-metal'` (a sign board is sheet; and it becomes the
  arena's first non-shed perforation candidate later).
- `house front window head N`, `house front window sill N`, `house upper window sill`
  → `'wood'` (trim, not glazing).
- `house ${storey} partition N` → `'interior-wall'` for **both** storeys.
- `car cabin`, `head car cabin` → `'glass'`; `car body`, `head car body` → `'vehicle'`.
- `truck box bulkhead/flank/roof`, `truck cab` → `'vehicle'` for now (leave
  `thin-metal` for §9, so this lane does not create a perforable surface with no
  perforation authority behind it).

Every one of these is an added option on an existing call — no geometry, no collider,
no position changes.
*Gate:* Step 2's test goes GREEN. `npm run qa:ballistic-parity -- --arenas nuketown2`
still within ceiling 0. `npx vitest run src/nuketown2-fidelity.test.ts` unchanged
(that suite measures size/position, never material — confirm, do not assume).

**Step 4 — breakable glass on `nuketown2`, including upstairs (HF-464) (35 min).**
In `src/nuketown2-arena.ts`:

- Give `pair()` a way to mint per-half ids, or emit the panes through two explicit
  `box()` calls; each pane needs a unique `breakableWindowId`.
- Change each pane call to `{ solid: false, shots: true, ballisticMaterial: 'glass',
  breakableWindowId: paneId, cast: false }` and set
  `pane.userData.breakableWindowId` / `pane.userData.dynamic = true`.
- Cover **all eight** windows the arena claims in `houseTelemetry.windows`
  (`nuketown2-arena.ts:1556`): two ground-front + one upper-front + one upper-back per
  house. The upper ones are the owner's explicit ask.
- Collect them into a local `breakableWindows` array and return it instead of `[]`
  at `:1529`.

*Gate:* new `src/nuketown2-glass-authority.test.ts` asserting, on a built
`buildNuketown2(new THREE.Scene())`: (a) `breakableWindows.length === 8`; (b) every id
is unique and every mesh carries the matching `userData.breakableWindowId`; (c) none of
the eight pane bounds appears in `arena.colliders` (proving `solid:false` landed);
(d) `deriveGlassDynamicColliders(map.breakableWindows, map)` returns 8 colliders while
intact and 7 after one pane's `glassState` reaches `breached` via `admitGlassImpact`;
(e) the pane's `BallisticSurface` carries `breakableWindowId` and material `'glass'`.
Also run `npx vitest run src/glass-collider-bounds.test.ts src/glass-authority.test.ts`.

**Step 5 — perforation energy from the trace, not the muzzle (25 min).**
Add a readonly `energyAtEntryQ: number` to `BallisticSurfaceImpact` in
`src/ballistics.ts`, populated in `traceBallisticPath` from the energy local at the
moment the interval is admitted (quantised ×10 to match the existing scale). Consume it
in `applyInteractiveWorldBallisticTrace` (`legacy-main.ts:4644-4647`) for
`penetrationEnergyQ`, and use `applyPenetrationDamage(spec.damage, trace.damageMultiplier)`
for `damageQ`.
*Gate:* extend `src/ballistics.test.ts` — a point-blank 12ga pellet still yields
`energyAtEntryQ ≥ 21` on a first `thin-metal` surface (the shed's frozen perforate
threshold), and the same shot through a `wood` panel first yields a strictly lower
value. Then `npx vitest run src/destructible-world.test.ts src/destructible-shed-*.test.ts`
— none of them may need editing; if one does, stop and reconcile, because that means
the change altered shed behaviour rather than its input.

**Step 6 — the probe fixture: two new wallbang lanes (20 min).**
In `src/additional-maps.ts:2285-2306`, add `THIN METAL 6 CM` (`'thin-metal'`, 0.06) and
`STEEL 18 CM` (`'structural-metal'`, 0.18) to the `wallbangPanels` array, each with its
scored plate and label, keeping the existing `solid:false, shots:true` shape and moving
the lane x positions to fit. This makes the gun range the one place a human or a script
can shoot all six classes side by side.
*Gate:* extend `src/gun-range-test-bay.test.ts` (or the ballistics suite) with a
per-lane assertion driven off `BALLISTIC_MATERIAL_CLASS`: carbine at 10 m penetrates
glass / thin-metal / wood / plaster, is stopped by brick, and the `structural-metal`
lane is penetrated by the sniper but not the pistol. Derive the lane list from the array
so a future lane cannot be added untested.

**Step 7 — ledger, docs, evidence (20 min).**
- Add `HF-467` and `HF-464` rows to the owner-feedback ledger with one owner lane,
  affected maps (`nuketown2`), the mechanical falsifier (the Step 2 gate + the Step 4
  test), required evidence, and planning mapping; update
  `docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json`. Run
  `npm run qa:pass65:owner-feedback`.
- Write the gotcha (Symptom → Cause → Correction → Verify): *"an arena's props are
  unshootable while every ballistic test is green → the zero-fallback assertion iterated
  a hardcoded six-builder literal → assert `byClassification.fallback === 0` inside the
  gate that already derives `ALL_ARENA_IDS` → the new test names the offending surfaces
  on failure."*
- Record explicitly in the PR what this lane did **not** do: no perforable panel outside
  the shed (§9), no wood holes, no LOS change on perforation, no change to
  `perforateEnergyQ`.

**Step 8 — full-suite and browser evidence (remaining time).**
`npx vitest run` (whole suite — the material table is shared by six shipped arenas, so a
partial run is not evidence). Then, if a browser slot is available and monitor 2 is
free: `node scripts/qa/verify-hf390-ballistics-cdp.mjs --arenas nuketown2` and confirm
`fallbackSurfaces: []` at runtime plus a penetrating ray fan. Attach
`artifacts/qa/hf390-ballistics-cdp.json`.

**Explicitly out of scope for this lane:** re-tuning `BALLISTIC_MATERIALS`; weakening
any ceiling in `scripts/qa/ballistic-parity-ledger.ts` or its mirror pin; touching
`src/destructible-world.ts`'s validator; publishing anything.

**What the implementer must know before starting.**
1. `traceBallisticPath` already does continuation-with-power-loss and already supports
   holes. Do not write a new raycast.
2. `apertureQuery` returning true means *the surface is not there for this ray* — that
   is the whole "no collision after" mechanism, and it is per-entry-point, not
   per-surface.
3. `solid` and `shots` are independent in `box()`. `solid:false` on a pane is
   **required** for a break to open the frame, because static colliders are baked into
   `arena.colliders` at build time and are never removed.
4. Bot LOS reads movement colliders, never shot surfaces. Glass breaks open bot sight
   for free; perforation must not.
5. Guests never mutate the interactive world. Host applies, guests mirror the hashed
   envelope. Glass is the one deliberate exception (validated broadcast) — keep it that
   way; do not "unify" the two.
6. `reinforced` is not a material, it is a defect report. If a surface needs it, the
   authoring is wrong.
7. A red gate that names 22 real surfaces is the deliverable of Step 2. Do not make it
   green by narrowing the roster.
