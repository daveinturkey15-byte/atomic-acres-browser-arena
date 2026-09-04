# REPORT — raid2 procedural facade detail (r185 technique #6, Raid art pass)

Branch: `contrib/dave-gaming-pc/claude/raid2-generator-building-detail`
Base: `origin/contrib/dave-gaming-pc/claude/raid2-slice-2` @ d5c9d887
Worktree: `C:/Users/david/projects/aa-muse-genbuild` (this lane only; no other
worktree, preview, or `aa-claude-hitl` touched; `npm ci` run only here)

## What was built

`src/raid2-facade-detail.ts` (new) — a seeded, deterministic facade-detail
generator for raid2: window panes, mullions + transoms, sill ledges, string
courses, downpipes, AC units. Derived from 19 authored wall faces across 7
building masses (house, pool wing, laundry, gallery, service, carport,
garage); mouth arrays transcribed verbatim from `src/raid2-arena.ts`, solids
taken as their complement, bays never placed over an opening.
`src/raid2-arena.ts` (+4 lines) — import + `generateRaid2FacadeDetail(builder, m)`
between `dressRaid2` and `batchPresentationOnlyBoxes`, so presentation classes
merge through the shared batcher and glazing stays individually rated.
`src/raid2-facade-detail.test.ts` (new, 8 tests) — derivation, ceilings,
no-collider, glazing rating, determinism, off switch, raid2 coplanar scan.

Measured output: 394 meshes (54 rated glass panes; 340 presentation boxes that
merge into the shared per-material batches). Per-building maxima:
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
  NaN): classes sized out of both censuses except glazing, which is directly
  rated (same pattern as shipped C3/hoop glass).
- VERIFIED — gates quoted below; `src/legacy-main.ts` untouched (37100 lines,
  at ceiling).
- DESIGNED (needs capture) — visual look: no browser/GPU on this machine
  (owner running ComfyUI); no contact sheet taken. Geometry is spec-placed
  boxes in forged family materials; request a headed review before merge.
- OPEN — live `geometryDetail=reduced` → arena plumbing: the module honours
  `reduced` (emits nothing, tested) and reuses the canonical `geometryDetail`
  entry as its off switch, but `buildRaid2` is still always called full
  because threading the setting through `legacy-main.ts` construction would
  grow the file past its 37100-line ratchet. No new settings control was
  added (registry fingerprints untouched).

## Per-frame cost estimate (defended)

Generation runs once inside `buildRaid2` (arena stream, never combat). After
that: zero per-frame allocation (static meshes, no update hooks), zero new
pipelines, zero new materials (uuid-subset of the forged families), all trim
`cast: false`. Steady state worst case: +54 tiny glass draws (one per rated
pane, frustum-culled, shared glass material) plus presentation boxes merged
into the existing per-material batches (net new presentation draws ~0); 0 in
`reduced`. No uniforms added; per-instance variation does not exist by design.

## Gates (quoted)

```
npx tsc --noEmit → (no output) TSC_EXIT=0
npx vitest run src/raid2-facade-detail.test.ts → Test Files 1 passed (1) / Tests 8 passed (8)
npx vitest run src/raid2-facade-detail.test.ts src/raid2-slice2.test.ts src/raid2-fidelity.test.ts → Test Files 3 passed (3) / Tests 47 passed (47)
npx vitest run src/collider-visual-parity-gate.test.ts src/graphics-profile-contract.test.ts src/pipeline-metrics.test.ts src/nuketown2-fidelity.test.ts src/legacy-main-size-ratchet.test.ts → Test Files 5 passed (5) / Tests 47 passed (47)
npx vitest run src/presentation-prewarm-contract.test.ts src/walkable-surface-parity-gate.test.ts → Test Files 2 passed (2) / Tests 33 passed (33)
npx tsx scripts/qa/find-coplanar-pairs.ts → boxes=239 · pairs<=0.03m: 66 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 33 · SAME-MATERIAL (benign): 33 / EXIT=0
```

Notes: `src/cold-session-precompile-reach*.test.ts` names no file in this
worktree (precompile authority is covered by
`src/presentation-prewarm-contract.test.ts`, green above); no new pipeline
exists to register. Deviations from the brief, stated: (1) "one draw per
class" holds for the five presentation classes via the shared batcher;
glazing panes stay individual draws by ballistic necessity (a merged pane
field cannot carry per-pane shot surfaces; same as shipped C3/hoop glazing),
bounded by the glass ceilings (54 total). (2) No `InstancedMesh`: the parity
census measures `Box3.setFromObject`, which does not expand instance
matrices — instancing would audit as a 1 m box at the origin and flag.
