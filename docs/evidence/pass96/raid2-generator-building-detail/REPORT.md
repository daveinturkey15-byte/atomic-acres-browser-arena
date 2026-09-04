# REPORT — raid2 procedural facade detail (r185 technique #6, Raid art pass)

Branch: `contrib/dave-gaming-pc/claude/raid2-generator-building-detail`
Base: `origin/contrib/dave-gaming-pc/claude/raid2-slice-2` @ d5c9d887
Worktree: `C:/Users/david/projects/aa-muse-genbuild` (this lane only; no other
worktree, preview, or `aa-claude-hitl` touched; `npm ci` run only here)

## What was built

`src/raid2-facade-detail.ts` — a seeded, deterministic facade-detail
generator for raid2: window panes, mullions + transoms, sill ledges, string
courses, downpipes, AC units. Derived from 19 authored wall faces across 7
building masses (house, pool wing, laundry, gallery, service, carport,
garage); mouth arrays transcribed verbatim from `src/raid2-arena.ts`, solids
taken as their complement, bays never placed over an opening. Glazing is one
`box()` mesh per pane (`shots: true`, per-pane ballistic surface); the five
presentation classes are each one `THREE.InstancedMesh` over a unit box (one
draw per class), with per-instance names/buildings/centres/sizes in
`userData.facadeInstances` and `userData.perInstanceAudit` opting them into
per-instance census expansion.
`src/raid2-arena.ts` — `buildRaid2(scene, options)` threads the canonical
`geometryDetail` value into `generateRaid2FacadeDetail` (default `full`);
`src/legacy-main.ts` (1 line, still 37100) passes the boot-time
`reducedRenderMode` at the raid2 factory, the same pattern every other
`reducedRenderMode` consumer uses.
`src/raid2-facade-detail.test.ts` (10 tests) — derivation, ceilings,
no-collider, glazing rating, determinism, generator off switch, arena-level
off-switch threading, per-class instanced draws, raid2 coplanar scan. The
suite, the parity census (`collectMeshes`), and the fidelity `meshBoxes`
census all expand opted-in instances exactly; nothing audits a union box.

Measured output: 54 rated glass panes (individual meshes) + 5 InstancedMesh
(mullion 216 / sillLedge 54 / stringCourse 26 / downpipe 38 / acUnit 6 = 340
instances); `reduced` arena build carries 0 facade nodes. Per-building maxima
(unchanged instance counts):
house 8/9/36/9/8/2, wing 3/7/28/7/6/1, laundry 5/9/36/9/6/1,
gallery 4/9/36/9/6/1, service 2/6/24/6/4/0, carport 2/6/24/6/4/0,
garage 2/8/32/8/4/1 (string/glass/mullion/sill/downpipe/ac).

## Claim states

- VERIFIED — detail derived from footprints: every facade mesh within 0.12 m
  of a solid collider (`derives every piece from an authored face` green).
- VERIFIED — instance counts under per-building ceilings, which may only go
  down (`keeps per-building instance counts under the ceilings` green).
- VERIFIED — no collider added: fresh-builder generation leaves
  `colliders`/`physicsColliders` empty; only glazing contributes
  `raycastMeshes`/`shotSurfaces`, all material 'glass'.
- VERIFIED — coplanar: `npx tsx scripts/qa/find-coplanar-pairs.ts` →
  `FINDINGS (different materials, no offset): 0`, exit 0 (instrument audits
  nuketown2 by construction); in-suite raid2 scan → zero pairs involving
  facade detail in the 0.03 m window on different materials. Pre-existing
  raid2 same-top construction pairs (pavilion walls/roof @3.400, colonnade
  piers/floors @3.400, plinth/planters @1.900) are out of this lane's scope
  and untouched.
- VERIFIED — parity gate green (no new walk-through, no ballistic ghosts, no
   NaN): trim instances audit per instance via the opt-in `perInstanceAudit`
   expansion (same boxes as the pre-instancing meshes); classes sized out of
   both censuses except glazing, which is directly rated (same pattern as
   shipped C3/hoop glass).
- VERIFIED — gates quoted below; `src/legacy-main.ts` 1 line changed, still
   37100 lines (ratchet green — growth of even one line would red it).
- DESIGNED (needs capture) — visual look: no browser/GPU on this machine
  (owner running ComfyUI); no contact sheet taken. Geometry is spec-placed
  boxes in forged family materials; request a headed review before merge.
- VERIFIED — live `geometryDetail=reduced` → arena plumbing:
   `buildRaid2(scene, { geometryDetail })` maps the canonical setting through
   `raid2FacadeDetailLevelForGeometryDetail`; the raid2 factory in
   `legacy-main.ts` passes boot-time `reducedRenderMode` (same pattern as
   every other consumer; arena-reload re-evaluates the module). Generator,
   arena, and reduced-arena builds all tested; no new settings control added
   (registry fingerprints untouched).

## Per-frame cost estimate (defended)

Generation runs once inside `buildRaid2` (arena stream, never combat). After
that: zero per-frame allocation (static meshes, no update hooks), zero new
pipelines, zero new materials (uuid-subset of the forged families), all trim
 `cast: false`. Steady state worst case: +54 tiny glass draws (one per rated
 pane, frustum-culled, shared glass material) plus exactly five instanced
 presentation draws (one per class, frustum-culled per class field); 0
 facade draws in `reduced`. No uniforms added; per-instance variation does
 not exist by design.

## Gates (quoted)

```
npx tsc --noEmit → (no output) TSC_EXIT=0
npx vitest run src/raid2-facade-detail.test.ts → Test Files 1 passed (1) / Tests 10 passed (10)
npx vitest run src/raid2-facade-detail.test.ts src/raid2-slice2.test.ts src/raid2-fidelity.test.ts → Test Files 3 passed (3) / Tests 49 passed (49)
npx vitest run src/collider-visual-parity-gate.test.ts src/graphics-profile-contract.test.ts src/pipeline-metrics.test.ts src/nuketown2-fidelity.test.ts src/legacy-main-size-ratchet.test.ts → Test Files 5 passed (5) / Tests 47 passed (47)
npx vitest run src/presentation-prewarm-contract.test.ts src/walkable-surface-parity-gate.test.ts → Test Files 2 passed (2) / Tests 33 passed (33)
npx tsx scripts/qa/find-coplanar-pairs.ts → boxes=239 · pairs<=0.03m: 66 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 33 · SAME-MATERIAL (benign): 33 / EXIT=0
```

Notes: `src/cold-session-precompile-reach*.test.ts` names no file in this
worktree (precompile authority is covered by
`src/presentation-prewarm-contract.test.ts`, green above); no new pipeline
exists to register. Deviations from the brief, stated: (1) glazing panes stay
individual draws by ballistic necessity (an instanced pane field cannot carry
per-pane shot surfaces; same as shipped C3/hoop glazing), bounded by the
glass ceilings (54 total). That is the only deviation; "one draw per class"
holds literally — five InstancedMesh, one per presentation class. (2) UV note:
instanced trim shares one unit-box geometry so the per-mesh `worldTiled` UV
rescale does not apply per instance (0..1 box UVs, stretched on long string
courses); trim materials are forged near-flat tints, glazing keeps tiled UVs.

## Blocking findings fixed (LUNA-REVIEW.md DO-NOT-SHIP → re-verify)

1. Per-class instancing — FIXED (VERIFIED). Five presentation classes emit
   one `THREE.InstancedMesh` each over a unit box (mullion 216 / sillLedge 54
   / stringCourse 26 / downpipe 38 / acUnit 6); glazing stays per-pane
   `box()` meshes with per-pane `ballisticSurfaceId`. Acceptance census
   expands instance transforms: `collectMeshes` honors opt-in
   `userData.perInstanceAudit` (no other arena changes audit), the suite
   expands every instance independently, and the fidelity `meshBoxes` census
   does the same. The prior "census cannot see instances" rationale was
   re-checked against three r185 (`Box3.expandByObject` consumes
   `InstancedMesh.boundingBox`, which `computeBoundingBox()` expands over
   every instance matrix) and found wrong; the opt-in expansion holds
   regardless. Suite asserts exactly 5 class meshes, per-class instance
   totals equal to the returned counts, and union bounding boxes computed.
2. `geometryDetail` threading — FIXED (VERIFIED).
   `buildRaid2(scene, { geometryDetail })` maps the canonical value;
   `legacy-main.ts` passes boot-time `reducedRenderMode` at the raid2 factory
   (1 changed line, file still 37100, ratchet green). Reduced arena build
   carries 0 facade nodes (measured + tested at both layers).
3. Full gate re-run with completed `tsc` — DONE (VERIFIED). `tsc --noEmit`
   completes in ~23–35 s with no output, exit 0 (the review's timeout did not
   reproduce). All quoted gates above are post-fix runs.

No finding was closed by deleting an assertion or hiding geometry: the stale
`WHY NOT INSTANCEDMESH` rationale is corrected in-source, the fidelity burial
falsifier caught the union-box regression mid-lane and now audits per
instance, and every census change is opt-in strengthening (more boxes
checked, none removed).
