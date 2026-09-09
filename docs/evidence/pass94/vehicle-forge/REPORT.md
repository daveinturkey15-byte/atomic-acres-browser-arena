# Lane I2 - vehicle forge

Nuke Town Rebuild's coach, moving-truck cab and three cars are no longer boxes
with painted stripes. They are lofted bodies built from data-only specs by a new
`src/vehicle-forge/`, added as a PRESENTATION-ONLY layer over the authored boxes
that keep every collider and shot surface they ever had.

- Worktree: `C:/Users/david/projects/aa-claude-i2`
- Branch: `contrib/dave-gaming-pc/claude/vehicle-forge`
- Base: `origin/contrib/dave-gaming-pc/claude/nuketown2-tiptop` @ `07388f97`
- Owner asks: HF-462 (vehicles read as code-made; a code-native asset forge, no
  Blender), the HF-462 correction of 2026-09-04 10:35 (the shared post is
  `StarKnightt/morning-diner`), HF-472 (re-implement in our own likeness).

## Source boundary

The method - one globally anchored flank profile with tumblehome, superellipse
wheel arches, analytic crease normals, shut lines as bracketed inset stations
with opposed chamfers, glass cut out of the loft over an inside-out lining,
analytic-normal lathe wheels with a concave cover, paint as pigment under
clearcoat - was OBSERVED in the public repository `StarKnightt/morning-diner`
(Claude Fable, 2026), shared by the owner via
<https://x.com/prasenx/status/2095537643182563778>, and audited in
`aa-claude-research/docs/research/2026-09-04/R1-diner-method-skill-draft.md`.

That repository carries NO LICENCE. Per HF-472 and the R1 operating rule, the
implementation here takes only the physical measurements and the named failure
modes - facts, not expression - and is written from first principles. No source
line, identifier, shader string or distinctive prose was copied. The provenance
note is repeated in the header of `src/vehicle-forge/geometry.ts`, where anyone
editing the module will read it.

## What changed

| Path | What |
|---|---|
| `src/vehicle-forge/geometry.ts` | Station rings, flank profile, arches, loft, shut lines, glass classification, lining, analytic-normal lathe, chamfered bar, surface-following trim |
| `src/vehicle-forge/wheels.ts` | Tyre with a contact patch and sidewall bulge, concave cover / steel spider, layered lamps |
| `src/vehicle-forge/materials.ts` | Paint (pigment under clearcoat), blended-dielectric glass, matte lining, unlit shut-line floor, chrome, rubber, lamp lenses |
| `src/vehicle-forge/specs.ts` | Data only: `COACH_SPEC`, `TRUCK_CAB_SPEC`, `SEDAN_SPEC` |
| `src/vehicle-forge/build.ts` | Per-vehicle merge into one mesh per material bucket |
| `src/vehicle-forge/vehicle-forge.test.ts` | 16 gates |
| `src/nuketown2-arena.ts` | `forgedStreetVehicles()`, the superseded-box register and its audit |
| `src/nuketown2-fidelity.test.ts` | The gate that reads that audit |
| `src/rendering/arenas/nuketown2.ts`, `scripts/qa/viewpoint-catalog.mjs` | Five vehicle review cameras |
| `scripts/qa/measure-nuketown2-vehicle-budget.ts` | The before/after instrument used below |

### The authority boundary, concretely

`forgedStreetVehicles()` hides 110 authored meshes and DELETES, MOVES, RESIZES
OR UNREGISTERS NONE OF THEM. Each is marked `supersededByVehicleForge`, set
invisible, and withdrawn from `batchPresentationOnlyBoxes` - hiding a batch
CANDIDATE is not enough, because the batcher folds its geometry into a merged
mesh that is itself visible, and the box would go on drawing inside the lofted
body that replaced it.

The truck's CARGO BOX STAYS A BOX ON PURPOSE. Its deck, bulkhead, pierced flanks
and roof are the HF-436 gameplay - three mouths you walk in through - and one
lofted skin over the whole vehicle would seal all three. Only the cab is lofted;
the rear axles are dressed as a separate wheel set.

## Budget, same instrument before and after

`npx tsx scripts/qa/measure-nuketown2-vehicle-budget.ts`
(`budget-before.txt`, `budget-after.txt` beside this report):

```
                     before      after
street vehicles      21 calls    54 calls        252 tris ->  43,740 tris
rest of the arena   266 calls   259 calls     10,897 tris ->   9,685 tris
ARENA TOTAL         287 calls   313 calls     11,149 tris ->  53,425 tris
colliders                 226         226
physics colliders         228         228
shot surfaces             238         238
```

+26 draw calls (+9.1 %) and +42,276 triangles for six lofted bodies, against the
arena's declared budget of 420 draw calls and 650,000 triangles
(`src/rendering/arenas/nuketown2.ts`): 74.5 % of the draw-call budget and 8.2 %
of the triangle budget. Merging is per vehicle, not across vehicles, and that is
deliberate - see failure 4 below. No per-frame allocation: every geometry is
built once at arena construction. Only the paint and tyre buckets cast shadows.

## Gates

```
npx tsc --noEmit                                          clean
npm run qa:text-integrity                                 { "ok": true, "checked": 2842 }
npx vitest run src/vehicle-forge/vehicle-forge.test.ts    Test Files  1 passed (1) - Tests 16 passed (16)
npx vitest run src/nuketown2-fidelity.test.ts             Test Files  1 passed (1) - Tests 24 passed (24)
npx vitest run src/collider-visual-parity-gate.test.ts    Test Files  1 passed (1) - Tests  6 passed (6)
npx vitest run src/walkable-surface-parity-gate.test.ts   Test Files  1 passed (1) - Tests  9 passed (9)
npx vitest run src/rendering/arenas                       Test Files  1 passed (1) - Tests  5 passed (5)
```

Coplanar audit, `npx tsx scripts/qa/find-coplanar-pairs.ts`, byte-identical
before and after (`coplanar-before.txt`, `coplanar-after.txt`):

```
# boxes=646 - pairs<=0.03m: 100 - FINDINGS (different materials, no offset): 0 - FENCED (material offset): 77 - SAME-MATERIAL (benign): 23
```

That the box count is unchanged is the point: the audit still sees all 646
authored boxes, because none of them was removed.

PRE-EXISTING FAILURE, NOT MINE. `node --test
scripts/qa/arena-viewpoint-regression.test.mjs` fails one case, "diff CLI
refuses real invalid fixture pair on disk". It fails identically on the base
commit with my two changed files stashed out, so it is inherited from
`nuketown2-tiptop`. Left failing; it must not be weakened to get green.

## Failures the gates caught, and what they cost

1. EQUAL-ANGLE ARCH STATIONS FACET THE LEGS. The superellipse's legs approach
   vertical, so 33 stations spread by parameter put almost all of them on the
   crown and walked each leg in one 8 cm chord - the same faceted flap a p = 4
   arch produces, arrived at from the other direction. Stations are now placed
   at equal ARC LENGTH, and the gate measures the chord between consecutive
   stations rather than the parameter. My first version of that gate was also
   wrong: it asserted "no vertical drop", which contradicts what a real wheel
   arch looks like.
2. A SHUT LINE'S DEPTH IS PERPENDICULAR, NOT LATERAL. The ring is displaced
   along each point's own normal, so at the belt corner the x component alone is
   legitimately shallower than 8 mm. The gate measures the perpendicular
   distance at three ring indices.
3. A LINING THAT REACHES THE SILL SPANS TWO AUTHORED BOXES AND NEITHER EXPLAINS
   IT. Folding the four knee-high inboard wheel discs into the lining bucket
   dragged its bounds below the sill; then neither the `car body` shot surface
   nor the `car cabin` one covered 60 % of its height range, and Direction C of
   the collider/visual parity audit correctly reported a car's own interior as
   unrated ghost cover. The discs belong to the tyre bucket, and the lining is
   now the greenhouse band (ring quads 6-17). The audit was right and the
   geometry was wrong.
4. MERGING ACROSS VEHICLES DEFEATS THE PARITY AUDIT. One merged mesh per
   material across the whole street has an axis-aligned bounds that no single
   collider can explain, and Direction B would report it as a walk-through prop.
   Merging is per vehicle; the truck's rear axles are their own group for the
   same reason.

## Two deliberate compromises, stated

THE SEDAN IS A TALL ESTATE, NOT A LOW SALOON. The arena's own boxes are
`car body` 0.22-1.22 m plus `car cabin` 1.22-1.88 m. 1.88 m is tall for a 4.4 m
car, but lowering the roof to a "correct" 1.45 m would leave 0.43 m of collider
with no visible mass under it - an authority change dressed as art, which is what
the forging review exists to catch. The loft's silhouette IS the two boxes, with
radii, a crease at the cowl and another at the backlight.

PAINT KEEPS A 0.20 BASE ROUGHNESS. The physical answer is 0.7-1.0 with every
highlight belonging to the clearcoat. `nuketown2-arena.ts`'s own materials header
records that the ray-traced preset admits a reflective proxy at roughness <= 0.22
over 6 m2, and that the parked cars are the only surfaces on this map clearing
both bounds. Our SSR reads base roughness from the material MRT and knows nothing
about clearcoat, so shipping the physical value would have silently retired the
map's only reflective surfaces. The forge ships a 0.20 base under
`specularIntensity` 0.08 - the base lobe contributes almost nothing to the lit
result - and lets the dust film lift roughness exactly where dust sits. The
reasoning lives in `PaintOptions.roughness`, not only here.

## Visual review

See `VISUAL.md` beside this report.

## OPEN

- HF LEDGER ROWS. `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` on this branch ends
  at HF-454; HF-455-473 exist only in the research worktree's copy. No row was
  added here rather than invent one out of sequence. The integrator should land
  HF-462's implementation row on the branch that carries HF-455 onward.
- NO LOD. Distance LOD was optional in the brief and was not built. The cheapest
  next win is a coarse LOD ring set swapped by distance, or instancing the three
  identical sedans once the parity audit's bounds test can be satisfied for an
  `InstancedMesh`.
- DEAD MATERIALS. `m.busTrim` and `m.coachGlass` in `nuketown2-arena.ts` are now
  referenced only by hidden boxes. Left in place because the materials record is
  typed and shared; a tidy pass should retire them with their boxes.
- NO LUG NUTS, GASKETS OR WINDOW MOULDINGS. R1's recipe calls for a 24 mm gasket
  straddling each pane edge with a 7 mm bright moulding outside it, and five lug
  nuts per steel wheel. Neither is built; both are pure additions.
- TRUCK CARGO BOX. Still a box, on purpose. If it is ever to be lofted, the loft
  needs pocket support (a flat face normal aimed at the cavity), which
  `geometry.ts` documents as absent and `classifyQuad` would have to grow.
