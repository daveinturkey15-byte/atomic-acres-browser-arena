# Muse review — nuketown2 circular turning head (pass94)

Range: `origin/contrib/dave-gaming-pc/claude/layout-hitl5..HEAD` = one commit,
`686798eb feat(nuketown2): turning head - circular kerbed bulb`.
Files: `src/nuketown2-layout.ts`, `src/nuketown2-arena.ts`,
`src/nuketown2-fidelity.test.ts`, `src/nuketown-lawn-field.ts`,
`scripts/qa/find-coplanar-pairs.ts`,
`docs/evidence/pass94/nuketown2-turning-head/REPORT.md`.
Static review only — no builds, no browsers, no test runs per this lane.
REPORT's `tsc` / vitest / coplanar outputs are taken as reported, not re-executed.

## REPORT assessment

REPORT accurately describes the construction: 16 m disc at the authored centre,
20-segment paved head, 20-segment kerb ring, `centred()` bodies with z-mirror
partners, circle-aware ground cut plus explicit lawn keep-out circle. The two
OPEN items (daylight HITL capture; segmented-ring read in WebGPU/TSL + WebGL2)
are correctly left OPEN. One interpretation flip is correctly disclosed by the
diff but underplayed in REPORT: the old cut read the square-minus-disc corners
as a pale concrete kerb apron (kerb islands over the same asphalt slab); this
cut returns the four corner pockets to ground/verge. That is a reference-reading
change (`nt2025-aerial-boii.jpg`), not a pure geometry fix — HITL must confirm
it (see F4).

## Claim states

(1) Bulb centre/diameter derived from NUKETOWN2_CUL_DE_SAC — VERIFIED.
`src/nuketown2-layout.ts:176-187` authors `centreX: -8.5`,
`radius: NUKETOWN2_TURNING_HEAD_HALF` (= 8, `:122-123`), `mouthX`/`closedX`
derived arithmetically. The carriageway footprint (`:296-306`) reuses the same
fields: `centreX: NUKETOWN2_CUL_DE_SAC.centreX, centreZ: 0,
radius: NUKETOWN2_CUL_DE_SAC.radius`. The disc emitter
(`src/nuketown2-arena.ts:2598-2599`) passes `head.radius` and
`NUKETOWN2_TURNING_HEAD_SEGMENTS`, and the fidelity test (`:554-555`,
`:560-561`) asserts footprint and cylinder parameters equal the layout fields.
Diameter 16 m is `2 * radius` by construction, checked via world bounds
(`:563-564`). No literal re-typing of -8.5/8.0 at any consumer.

(2) No vehicle centre moved; 0.150 L offset intact — VERIFIED (static; numbers
untouched by this diff).
`NUKETOWN2_CENTRAL_TRUCK` (`layout.ts:454-487`: `x: -10.6, z: 2.75`) and
`NUKETOWN2_STREET_COACH` (`:506-524`: `offsetAlong 6.4, offsetAcross 5.4`,
`x: truck.x + along, z: truck.z - across`) have zero hunks in this diff, as do
`NUKETOWN2_STREET_CARS` (`:543-548`). The gate still quotes the exact contract:
```ts
expect(NUKETOWN2_STREET_COACH.offsetAlong / L, 'coach offset along the street').toBeCloseTo(0.178, 3);
expect(NUKETOWN2_STREET_COACH.offsetAcross / L, 'coach offset across the street').toBeCloseTo(0.150, 3);
// ...and the offsets are what the placement is actually built from, so the
// two can never describe different things.
expect(Math.abs(NUKETOWN2_STREET_COACH.x - NUKETOWN2_CENTRAL_TRUCK.x))
  .toBeCloseTo(NUKETOWN2_STREET_COACH.offsetAlong, 10);
expect(NUKETOWN2_CENTRAL_TRUCK.z - NUKETOWN2_STREET_COACH.z).toBeCloseTo(NUKETOWN2_STREET_COACH.offsetAcross, 10);
```
(`src/nuketown2-fidelity.test.ts:693-703`). Opposite-sides assertion (`:709`)
unchanged.

(3) Kerb ring colliders vs parity gate and spawn fairness bands — DERIVED, with
one coverage note.
Ring: 20 `centred()` boxes with yaw (`arena.ts:2609-2620`), solid by default
(`box()` in `src/additional-maps.ts:121` — `solid !== false`), rotation carried
on the collider (`:124-132`), top `max.y <= 0.30` gated (`fidelity:580`), ring
radius `radius + width/2` gated (`:581-582`), exact z-mirror partner per segment
(`:584-592`). Parity core (`scripts/qa/collider-visual-parity-core.ts:255-275`,
`:319-335`, `:360-383`) collects meshes via `Box3.setFromObject` (cylinder-safe)
and rotation-aware footprints for surfaces, so the disc's bounding-square
collider and the yawed kerb boxes are explainable — [INFERENCE: suite not run
in this lane]. Spawns (`layout` spawn tables, `fidelity:1617-1705`) are
untouched by this diff and sit at `|z| >= 24`, an order of magnitude outside the
ring (`radius ~8.1`); no spawn hunk exists. The parity-exception list correctly
grows by the 20 ring segments (`fidelity:1841`) rather than by re-pairing them.

(4) Coplanar STREET 0 and grass keep-out over the disc — DERIVED, with one
instrument-precision finding.
Coplanar: `find-coplanar-pairs.ts:107-112` now skips non-box geometry
(cylinders) instead of crashing on `parameters.width`, and `:170-173` mirrors
carriageway footprints into the world frame (fixes the false-STREET class of
bug). STREET 0 therefore covers axis-aligned boxes; the disc (cylinder) and all
20 yawed kerb segments are counted as skipped/unaudited, which is sound (their
tops are at 0.0 vs 0.18 — no coplanar pair by construction) but must be read as
"0 box findings", not "all geometry audited". `overlapInsideCarriageway`
(`:175-180`) still tests the circle footprint by its bounding square — see F1.
Grass: `nuketown-lawn-field.ts:208-212` adds `NuketownLawnKeepOutCircle`;
placement rejects disc interior (`:297-299`); the arena passes the mirrored
centre with the authored radius (`arena.ts:3086-3091`); the collider-driven
root-outside-keep-outs test is unchanged (`fidelity:1112-1145`). Corner pockets
remain lawn-free by construction (no lawn region is authored there), and ground
tiles survive there via the circle-aware cut (`arena.ts:2513-2523`).

(5) Any test loosened; bays/verge ceilings still hold — VERIFIED (no loosening;
one lowered-but-tightened ratchet).
Removed assertions (13 `-` lines): box-only `solidMeshes`/`planFootprint`
narrowings (widened to cylinders via `userData.nuketown2Solid` + `Box3`
fallback — strictly wider coverage), rect-only overlap helpers (replaced by
circle-aware versions), the 16-island name list (superseded by the 20-segment
ring), and `expect(blades).toBeGreaterThanOrEqual(8928)` → replaced by
`expect(blades, '...circular-head population').toBe(8910)` (`fidelity:2854`).
The last is 18 lower but `toBe` exact, matching REPORT's "measured cost of the
new real kerb keep-out, ratcheted exactly" — tighter form, disclosed delta, not
a loosening. Verge ceilings untouched and still exact:
furniture `<= 36`, aggregate `<= 51` (`:2636-2642`); bays keep exact z-mirror
partners in table and built slabs (`:2702-2743`), mouth/driveway clearance
(`:2759-2807`), and full stem-band cover (`:2868-2895`).

## Findings

F1 — `scripts/qa/find-coplanar-pairs.ts:175-180`: circle footprint tested as
bounding square. Why: `overlapInsideCarriageway` intersects every footprint as
`x0/x1/z0/z1`, so the turning-head circle is its 16x16 square; a verge-decal
pair sitting wholly in a corner pocket (inside the square, outside the disc)
would report STREET-FINDING. Conservative direction (over-reports, never hides),
currently 0, but the instrument disagrees with the arena's own
`circleOverlapsPlanRect`. Smallest fix: mirror the arena test —
nearest-point-to-centre vs radius — in `overlapInsideCarriageway`.

F2 — `src/nuketown2-arena.ts:2613-2616`: mouth "fillet" taper (`width * 0.9`
when `|z| < halfWidth + 0.5 && x > centreX`) makes the ring non-uniform with no
authored constant. Why: two segments differ from the other eighteen; the
uniform-ring claim in REPORT and the `KERB_WIDTH` constant no longer describe
all segments. Smallest fix: delete the taper (uniform `KERB_WIDTH`), or promote
it to `NUKETOWN2_TURNING_HEAD_FILLET_WIDTH` in layout with a comment and assert
it in the ring test.

F3 — `src/nuketown2-arena.ts:971-973` (`centredPolygon`): disc collider is the
bounding square while the visual is a disc. Why: corners inside the square but
outside the disc carry movement/shot authority with no visual — currently benign
[INFERENCE: floor-level slab, top y = 0, parity explains via `Box3`], but the
next reader will copy the pattern for a wall. Smallest fix: one comment at the
push site stating the collider is a floor-level AABB deliberately, or scope the
overstatement (shots projected from the disc mesh, not the square).

F4 — Corner-pocket reference reading (design, not code): square-minus-disc
apron → ground/verge. Why: the old islands cited the aerial's pale ring; this
cut paves only the disc and leaves corners to ground/verge. Both cannot be the
reference. Smallest fix: none in code — REPORT already leaves the daylight
overhead + low stem-facing captures OPEN; HITL must confirm no pale apron and
that corner verge reads intentionally, in both profiles.

## Verdict: SHIP-WITH-FIXES

(1) The safety properties all hold structurally: derived centre/diameter,
untouched vehicle offsets with the 0.150 gate quoted verbatim, closed
mirror-checked kerb ring, circle-aware ground/lawn cuts, exact grass ratchet,
and unloosened bay/verge ceilings. (2) The two code findings are small,
isolated, and specified above (F1 instrument precision, F2 ring uniformity;
F3 is a one-line comment). (3) The one real risk is the reference-reading flip
in F4, which only a daylight capture can settle — and REPORT already gates on
exactly those captures rather than claiming them.
