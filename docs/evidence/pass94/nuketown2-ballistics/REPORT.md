# PASS 94 - Lane I1: Nuke Town Rebuild into the shipped penetration system

Machine `dave-gaming-pc`, harness Claude Code (Opus). Worktree
`C:/Users/david/projects/aa-claude-i1`, branch
`contrib/dave-gaming-pc/claude/nuketown2-ballistics`, base
`origin/contrib/dave-gaming-pc/claude/nuketown2-owner-round2` at `5da84097`.
Change impact: **runtime**. Nothing published.

Research read in full before coding:
`C:/Users/david/projects/aa-claude-research/docs/research/2026-09-04/R3-material-penetration-design.md`.

**Claim states.** `VERIFIED` = I ran it in this worktree and the output is in
this directory. `CLAIMED` = asserted by a source I did not re-measure.
`OPEN` = not established.

---

## 1. Owner statements served

- **HF-467** - "glass or blocks have no penetration; metal and glass should be
  shot through, glass breaks; thin metal (the shed) should get a hole with no
  collision after".
- **HF-464** - "the windows upstairs need to be breakable".

Both now carry ledger rows in `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` with an
owner lane, affected maps, mechanical falsifier, required evidence and an
explicit "not done in this lane" list.

---

## 2. What changed

**No new system was built.** R3's central finding held up under measurement: the
penetration system is shipped and works - one shared resistance table, a
continuation trace with power loss, a dynamic aperture query, a host-authoritative
shed perforation model and a glass authority with a real break lifecycle. Nuke
Town Rebuild had simply never been connected to any of it, and the gate that
should have said so was iterating a hand-written list of six arena builders.

### 2.1 Ratings - `src/nuketown2-arena.ts` (VERIFIED)

30 shot surfaces classified `fallback` -> material `reinforced`
(`entryCost 1000` against a sniper's `10.90` budget). They were literally
unshootable. All 30 are now explicitly rated; 15 authoring templates x the
180-degree fairness involution:

| Surface | was | now | why |
|---|---|---|---|
| `yard side store`, `yard far store` | reinforced | `concrete` | 6.0 x 2.6 m yard boxes; a shed to the eye, hard cover by design |
| `path buttress east` / `west`, `yard butt` | reinforced | `concrete` | `m.block`, HARD_COVER |
| `yard porch` | reinforced | `concrete` | 0.2 m poured step |
| `yard patio table`, `yard far crate` | reinforced | `wood` | furniture and a crate |
| `verge drive edge` | reinforced | `concrete` | kerb-family edging |
| `verge sign board`, `verge speed limit sign` | reinforced | `thin-metal` | sheet sign faces |
| `verge wheelie bin 0` / `1` | reinforced | `wood` | moulded plastic; `wood` is the cheapest penetrable family the shared table ships and no plastic id exists |
| `car body` | reinforced | `vehicle` | the driveway cars carry no `street-vehicle` name prefix |
| `car cabin` | reinforced | `glass` | it is the windscreen |

Misclassifications repaired in the same pass:

| Surface | was | now | why |
|---|---|---|---|
| `house front window sill/head 0..1`, `house upper window sill` | `glass` | `wood` | these are the solid TRIM boxes; their names contain "window", so bullets crossed the window FRAME like air |
| `house upper back sill` | `interior-wall` | `wood` | the same trim family as its front twin; the two had drifted apart |
| `house ground partition 0..1` | `earth` (4.0/12.0) | `interior-wall` (0.42/1.05) | the name contains "ground"; a plaster partition was harder than brick while the identical wall one storey up was not |
| `head car cabin` | `vehicle` | `glass` | windscreen rated as bodywork |
| `head car body` | `vehicle` (rule) | `vehicle` (explicit) | pinned so it cannot drift |
| `street asphalt 0..1`, `street turning head` | `wood` | `concrete` | bullets crossed the ROAD |
| `street kerb 0..1` | `wood` | `concrete` | cast kerb |
| `yard cover crate` | `concrete` | `wood` | the same crate as `yard far crate`; the word "cover" in its name sent it to a different material than its twin |

Post-state (VERIFIED, `gate-ballistic-parity.txt`):

```
=== nuketown2: census 205 | direct 198 | footprint 6 | targets 0 | excluded 1 | accepted 0 | UNRATED 0 (ceiling 0) | completion 100%
  surfaces: {"total":274,"byMaterial":{"earth":78,"concrete":21,"interior-wall":82,"wood":36,"glass":11,"structural-metal":16,"thin-metal":6,"fence":6,"vehicle":18},"byClassification":{"rule":203,"explicit":71}}
```

No `reinforced` surface remains on the arena.

### 2.2 Breakable glass, both floors - HF-464 (VERIFIED)

The base branch (Luna's owner round 2, `5da84097`) had already given the panes
`solid:false, shots:true, ballisticMaterial:'glass'` and per-half
`breakableWindowId`s through `pair()`, and `box()` pushes them into
`builder.breakableWindows`. **What this lane added is the falsifier**, because
the registration had no test and three separate one-word edits can silently
undo it.

`src/nuketown2-glass-authority.test.ts` (new, 5 tests) asserts on a built arena:

- 8 panes with unique ids - 2 ground-front + 1 upper-front + 1 upper-back per
  house - and 4 of them upstairs, asserted by name because upstairs is the
  owner's explicit ask;
- every pane carries a `glass`, `classification: 'explicit'` ballistic surface
  bound to its window id, and `BALLISTIC_MATERIAL_CLASS` puts it in `shatter`;
- **no pane appears in `arena.colliders`** - a static collider is baked at build
  time and never removed, so `solid: true` would break the glass visually and
  leave the frame shut, and would also blind bots through that window forever
  (bot LOS reads movement colliders, never shot surfaces);
- driving the shipped `admitGlassImpact` machine to `breached` flips
  `movementSolid`/`aiLineOfSightSolid` false and `apertureOpen` true, and drops
  that pane - and only that pane - from `deriveGlassDynamicColliders` (8 -> 7);
- the weakest firearm in the catalogue crosses every pane through the real
  `traceBallisticPath`.

**Mutation check (VERIFIED).** Flipping one pane to `solid: true` fails with
`nuketown2-ground-window-0:north must not have a static movement collider`;
reverted immediately. The gate has teeth.

### 2.3 The gate that missed it - `src/ballistics.test.ts` (VERIFIED)

The zero-fallback assertion imported six builders by name and had never built
`nuketown2`, `map3`, `raid2`, `test1` or `test2`. It is now derived from the
canonical registry (`ARENA_IDS` -> `loadArenaFactories`, the same source the
collider, walkable and ballistic-parity audits use), so registering an arena
enrols it on the same commit. `expect(Object.keys(factories).sort()).toEqual(ALL_ARENA_IDS)`
makes a registry/builder mismatch fail rather than silently shorten the sweep.

**The RED run is the deliverable** (`step2-red-derived-roster-gate.txt`):

```
FAIL src/ballistics.test.ts > gives every registered arena an explicit fallback ceiling that only shrinks
AssertionError: nuketown2: 30 unshootable reinforced fallback surface(s) over ceiling 0:
nuketown2 north car body | nuketown2 north car cabin | nuketown2 north path buttress east | ...
| nuketown2 south yard side store: expected 30 to be less than or equal to 0
```

Two ratchet ledgers were added rather than narrowing the roster to stay green:

- `ACCEPTED_BALLISTIC_FALLBACK` - 0 for the seven clean arenas **and for
  `nuketown2`**; measured debt for `test1: 58`, `test2: 135`, `map3: 21`,
  `raid2: 105`. Those four are other lanes' geometry. Pinning their real number
  is strictly more coverage than a literal that never built them.
- `ACCEPTED_UNBACKED_SHOT_SURFACES` - the reverse census direction, which the
  six-builder literal also never asked. Ten arenas are 0; `map3: 205`
  (its godrays colonnade, physics kerbs, guide rails and grammar clusters author
  `BallisticSurface`s directly instead of through `box()`, so the trace charges
  for cover whose mesh the impact path cannot resolve).

Both keyed to `ALL_ARENA_IDS` with a keys-equality assertion, so a new arena
cannot enter without a row. Both may only go down.

### 2.4 Material classes - `src/ballistics.ts` (VERIFIED)

`BallisticMaterialClass` + a frozen `BALLISTIC_MATERIAL_CLASS` projection over
the existing `BallisticMaterialId`, so the owner's sentence is one derived map
and not a second hand-maintained roster.

**Two of R3's proposed assertions were wrong and were not forced green.** R3
specified "every `stop` material's `entryCost` exceeds the strongest non-railgun
budget" and "every non-`stop` material's 0.1 m cost is under the weakest
budget". Measured against the shipped table: brick's entry cost is **1.7**
against a sniper's **10.90**, and `thin-metal` at 0.1 m costs **1.25** against
the weakest firearm's (m14-ebr) **0.957**. Asserting R3's version would have
been a false gate. What replaced them, all true and all with teeth:

- an exact mirror pin of the whole class map (re-rating needs a two-file edit);
- `shatter` = exactly `['glass']`, `perforate` = exactly `['thin-metal']` -
  both shipped authorities are single-material by construction, so a second
  member would be a surface with a promise and no authority behind it;
- no `shatter` or `perforate` material may cost as much to enter as the cheapest
  `stop` material (0.08 and 0.95 against brick's 1.7);
- the weakest firearm breaks a 6 cm pane; sheet metal is crossable from the
  scattergun up and deliberately not by the m14-ebr;
- `reinforced` is unreachable by every catalogue firearm - which is precisely
  why a `fallback` surface is a defect and not a material choice.

The `stop` doc comment in `src/ballistics.ts` was rewritten to say what the
table actually encodes: a rifle wallbang through half a metre of brick is
intended and separately measured.

### 2.5 Perforation energy from the trace - `src/ballistics.ts`, `src/legacy-main.ts` (VERIFIED)

`BallisticSurfaceImpact` gained a readonly `energyAtEntryQ` (x10, the scale the
shed's thresholds already use), populated from the energy local that
`traceBallisticPath` has always had. `applyInteractiveWorldBallisticTrace` now
charges perforation against `impact.energyAtEntryQ` instead of the muzzle
constant `penetrationPower x fmjMultiplier x 10` - the same number point-blank
and at 60 m through two walls - and `damageQ` carries the trace's wallbang
attenuation via the existing `applyPenetrationDamage`.

`perforateEnergyQ` was **not** retuned in the same change, per R3, so any
falloff complaint stays attributable to one edit. Three new assertions pin that
a point-blank pellet still clears the frozen 21Q threshold, that the same shot
through 24 cm of wood is charged strictly less, and that a distant sheet is
charged less than a near one. **No shed test needed editing**, which is the
signal R3 asked for that the change corrected the input rather than shed
behaviour.

`src/legacy-main.ts` stayed at exactly 37,100 lines - the size ratchet's
ceiling - by trimming the comment rather than raising the ceiling.

### 2.6 Penetration lab - `src/additional-maps.ts` (VERIFIED)

The gun range's wallbang lab shipped four lanes (glass, wood, plaster, brick)
and **no metal of either kind**, so the two families the owner named could not
be compared anywhere: the only sheet metal in the game was on a destructible
shed in a back yard. It now has six lanes covering all four classes -
`GLASS 8 CM`, `THIN METAL 6 CM`, `WOOD 24 CM`, `PLASTER 42 CM`, `STEEL 18 CM`,
`BRICK 70 CM` - with lane x positions derived from the lane count and panels
narrowed 2.05 m -> 1.50 m so six fit between the lab's own side walls. Two
`ACCEPTED_WALK_THROUGH` centres moved with the re-pitch (the panels are the same
authored `shots:true/solid:false` targets) and the scored-plate census is now
derived from the lane census instead of a literal.

The lab assertion is stated against shipped budgets: a **pistol** crosses every
penetrable lane and is stopped by brick; a **sniper** crosses all six. (The
carbine crosses 0.7 m of brick - 5.2 cost against a 6.50 budget - so R3's
"stopped by brick" phrasing would also have been a false gate.)

### 2.7 New QA probe - `scripts/qa/verify-hf467-material-classes-cdp.mjs` (added, NOT RUN)

No probe shoots each material class on `nuketown2`. `verify-hf390-ballistics-cdp.mjs`
proves zero fallbacks and that *some* rays penetrate, which is satisfied by a map
whose glass works and whose sheet metal does not. The new probe fires two dense
fans (pistol and sniper) through the shipped `debug.traceBallistics`, buckets
every impact by material, and holds each material to its class contract, failing
if `glass` or `thin-metal` were never met at all. Its class map is **derived by
strict source scrape** from `src/ballistics.ts` with a count floor, following
`scripts/qa/arena-roster.mjs`, rather than copied. It opens headless at
`--window-position=2560,0`, never on the owner's main screen.

---

## 3. Gates

All run in this worktree, output in this directory.

```
tsc --noEmit -p tsconfig.json                                  exit 0   (gate-tsc.txt, empty)

vitest run (18 files)                                          exit 0   (gate-vitest.txt)
  Test Files  18 passed (18)
       Tests  201 passed (201)
  ballistics, nuketown2-glass-authority, nuketown2-fidelity,
  collider-visual-parity-gate, walkable-surface-parity-gate,
  additional-maps, destructible-world, destructible-shed-{definition,
  map-parity,presentation,registry}, shed-structural-authority,
  interactive-world-runtime, arena-factory-registry, arena-selectability,
  glass-authority, glass-collider-bounds, legacy-main-size-ratchet

npx tsx scripts/qa/audit-ballistic-parity.ts --arenas nuketown2,gun-range   exit 0
  nuketown2:  UNRATED 0 (ceiling 0) | completion 100%
  gun-range:  UNRATED 0 (ceiling 0) | completion 100%

npm run qa:pass65:owner-feedback                               exit 0   ("ok": true)
```

Additional targeted regression batches, both green and not re-saved:
`arena-factory-registry, arena-selectability, gun-range-test-bay,
gun-range-test-bay-world, gun-range-rules, gun-range-armory,
gun-range-rack-presentation, surface-impact-registry, gun-range-leaderboard`
(55 tests); `farcrysis-terrain-proxy, persistent-window-debris-integration,
remote-hit-admission, test1-roof-traversal, window-glass-debris-presentation,
world-perception-main-integration, chopper-gunner-fire-ray` (45 tests).

The parity gate's `nuketown2` walk-through budget stayed at 0 - `nuketown2` has
no `ACCEPTED_WALK_THROUGH` rows before or after this lane.

**Not run:** the full vitest suite (per lane instruction).

---

## 4. OPEN

- **OPEN - browser evidence.** The GPU rule was never satisfiable during the
  lane: ComfyUI's queue was empty and no other headless Chrome was running, but
  free VRAM sat at **873-922 MiB** against the 3000 MiB floor for the whole
  20-minute poll (the owner's `llama-server` holds it persistently). Neither
  `scripts/qa/verify-hf467-material-classes-cdp.mjs` nor
  `verify-hf390-ballistics-cdp.mjs --arenas nuketown2` was run. Both are ready;
  they need a slot. The new probe has therefore never executed past its source
  scrape and browser launch, so its runtime behaviour is **CLAIMED, not
  VERIFIED**.
- **OPEN - perforation authority outside the field shed.** `verge sign board`,
  `verge speed limit sign` and `verge street name blade` are now RATED
  `thin-metal` but cannot gain a hole: only `destructible-shed-*` implements
  apertures. The owner's "thin metal gets a hole with no collision after" is
  therefore satisfied **on the sheds** (which `nuketown2` has two of) and not
  yet on the arena's other sheet metal. R3 section 9 specifies the sibling
  module (`perforable-panel-authority/registry/presentation`) and why
  `DestructibleShedDefinition` cannot be loosened to fit - its validator
  requires exactly one door surface and exactly six pre-authored chunks, and
  relaxing it would be weakening a verifier. First targets in order: the moving
  truck's box body, the garage doors, RustRig's container skins.
- **OPEN - 419 fallback surfaces on four other arenas.** `test2: 135`,
  `raid2: 105`, `test1: 58`, `map3: 21`. Now measured and pinned for the first
  time; each is a prop no weapon in the game can shoot through. Owned by the
  lanes that build those arenas.
- **OPEN - 205 unbacked ballistic surfaces on `map3`.** Cover the trace charges
  for whose mesh the impact/decal/audio path cannot resolve.
- **OPEN - bot LOS through perforation.** Deliberately unchanged: a ~5 cm hole
  is not a sightline. The escalation path (a "shredded" stage derived from the
  existing `shedRegionalDamageAt` query, dropping the panel's movement collider
  so ballistics, traversal and bot sight open through one flag) is specified in
  R3 section 8 and not built.
- **OPEN - cross-harness gotcha not yet written to AKP.** Text below; it belongs
  in the AKP gotcha set, which is outside this worktree.

---

## 5. Gotcha

**Symptom** - an arena's props are unshootable and its windows unbreakable while
every ballistics test in the repository is green.

**Cause** - the zero-fallback assertion (`src/ballistics.test.ts`) iterated a
hardcoded six-builder literal written when six arenas was the whole game. Five
arenas shipped afterwards and the assertion never built any of them. The
per-arena ghost-mesh ratchet passed too, because the surfaces *were* rated in
the parity sense - a `BallisticSurface` existed with a footprint. Nothing
anywhere asserted that the rating was **usable**. This is the fourth recorded
instance of the same failure in this repository; `scripts/qa/arena-roster.mjs`
documents the first three.

**Correction** - derive the roster from the canonical registry
(`ARENA_IDS` -> `loadArenaFactories`), assert `Object.keys(factories)` equals it
so a builder gap fails loudly, and give every arena an explicit ceiling keyed to
`ALL_ARENA_IDS` that may only shrink. Record out-of-lane debt as its exact
measured number rather than narrowing the roster back to what is green.

**Verify** - the gate must go RED naming the real surfaces before any fix
lands. A green run before the fix means the gate is still not looking at the
arena. Recorded here as
`docs/evidence/pass94/nuketown2-ballistics/step2-red-derived-roster-gate.txt`.

**Second gotcha, same lane** - a research plan's proposed assertions are not
pre-verified. Two of R3's ("no catalogue firearm enters a `stop` material";
"the carbine is stopped by brick") are false against the shipped resistance
table. The correct response to a red assertion copied from a plan is to measure
the table and write a true one, never to relax the material costs until the
plan's sentence becomes true.
