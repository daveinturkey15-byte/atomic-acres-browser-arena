# Muse review — v8-minimap-simplify (HF-510 structural-only minimap)

Reviewer: Meta Muse Spark 1.3 (skeptical second pair of eyes, static only).
Lane: `C:/Users/david/projects/aa-p-minimap-simplify`, branch
`contrib/dave-gaming-pc/claude/v8-minimap-simplify`.
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `452d7aba`.
Lane report: `docs/evidence/pass95/minimap-simplify/REPORT.md` (build-agent claims below are
marked **[CLAIMED]** — this review ran no builds, no browsers, no GPU per the lane rules, so
every dynamic number is restated from the report + committed artifacts, not independently executed).

Verdict: **SHIP-WITH-FIXES** (required fixes R1–R2 before candidate 9; recommendations F4–F5, U6).

Three reasons for the verdict:

1. The HF-491 repeat mode is structurally closed: classification is a geometric rule at the
   source with one renderer call site for every arena, and the per-arena ceiling test is
   roster-derived, so a new arena is gated the day it registers.
2. The six named exclusion families are excluded in code on all eleven arenas with large
   measured reductions (61.9–98.7%, none empty); the two known leaks are admitted in the
   report and bounded (2 of 10 elements on one arena), not an open-ended roster hole.
3. Markers are unified on one code path with HUD-readable sizes, the size ratchet is
   respected, and no test was weakened to reach green — the remaining gaps (live HUD clips,
   leak disposition) are bounded and candidate-pipeline-verifiable, not architectural.

## Check 1 — structural-only rule at the source, every arena, ceiling test

PASS.

- `src/minimap.ts:63-64` — thresholds `MINIMAP_STRUCTURAL_MIN_HEIGHT_M = 1.6`,
  `MINIMAP_STRUCTURAL_MIN_SPAN_M = 4` (world metres, not pixels — same wall classifies
  identically on a 192 m and a 36 m arena).
- `src/minimap.ts:105-110` — `isMinimapStructuralCollider` (height AND long-span). Exported so
  the budget test quotes the rule directly.
- `src/minimap.ts:197-198` — `buildMinimapStructuralElements` filters `input.colliders`
  through that rule plus explicit cover subtraction before merging. Only three classes exist
  (`src/minimap.ts:22` — `building | wall | road`); the HF-491 name table
  (`MINIMAP_CLASS_TABLE`), per-arena overrides (`MINIMAP_ARENA_OVERRIDES`) and the `vehicle`
  class are deleted.
- Single renderer call site: `src/legacy-main.ts:27944-27953` — `activeMinimapStructureLayer`
  with `activeWorldColliders()` + cover + houses + `shotSurfaces`, no `selectedArena.id`
  branch. The atomic-acres fork (`activeMinimapStaticLayer`), `drawMinimapLandmark` (108 lines),
  and the collider/cover layers are deleted in the same diff. The HF-491 failure (classifier
  never wired in) cannot recur silently: there is exactly one path.
- Roster derived, not hardcoded: `scripts/qa/collider-visual-parity-core.ts:734`
  (`ALL_ARENA_IDS = ARENA_IDS`); both the audit (`scripts/qa/minimap-structural-audit.mts`)
  and the budget test iterate it, and the test asserts measured keys equal the catalog
  (`src/minimap-semantic-layer.test.ts` — "covers every arena the catalog can name"). A newly
  registered arena fails rather than being skipped.
- Per-arena ceiling test exists: `MINIMAP_ELEMENT_CEILING = 32` (`src/minimap.ts:89`) asserted
  with `toBeLessThanOrEqual` for every catalog arena, alongside `< before`, `> 0`,
  class-membership, `>= MINIMAP_MIN_SEGMENT_PX`, and no-cover-drawn checks.
  **[CLAIMED]** counts: worst after = test2 at 27, min = farcrysis at 3
  (`minimap-element-counts.json`, `worstAfter: 27`).

## Check 2 — cover / props / furniture / scenery vehicles / vegetation / interior fixtures

MOSTLY EXCLUDED, with one admitted leak (required fix R1).

How each family is excluded (all at the source, `src/minimap.ts` + one call site):

- Cover: `arena.physicalCover` footprints subtracted explicitly
  (`src/minimap.ts:125-128` `containedIn`, applied at `:198`) whatever the size — this is what
  keeps a coach or cargo stack off the map. Cover landmarks are no longer drawn anywhere:
  `drawMinimapLandmark`, `MinimapLandmarkKind`, `physicalCoverMinimapKind` deleted.
- Props / furniture / small colliders / interior fixtures: height gate (waist-high cover,
  crates, planters, benches, bins, kerbs) + span gate (barrels, appliances, debris, posts) at
  `:105-110`; pixel fence `MINIMAP_MIN_SEGMENT_PX = 2` (`:71`) applied after merging.
- Vehicles-as-scenery: the old `vehicle` class is gone; a vehicle draws only if it passes the
  wall geometry AND is not cover-declared.
- Vegetation: nothing name-matches it into the set; only `wall`-passing blockers survive —
  farcrysis (128 m jungle, 236 colliders before) draws 3 walls after, which is the expected
  signature of vegetation exclusion.
- Road trim: `MINIMAP_ROAD_TRIM_PATTERN` (`:100`) drops kerbs/dashes/islands/markings;
  **[CLAIMED]** 36 kerb slivers removed on Nuke Town.

Still drawing (admitted in REPORT §8, 2 of atomic-acres' 10 elements):

- R1 (REQUIRED): two large scenery colliders pass the wall rule and are not cover-subtracted —
  the report names "the parked vans on atomic-acres". Caution: `src/map.ts:837-838` DOES push
  van bounds into `physicalCover`, so the leakers are either different assets or containment
  failed — and the committed audit JSON carries class counts but no element ids/bounds, so the
  leak is not identifiable from evidence. Smallest fix: emit per-element `{id, className,
  bounds}` rows from the audit, identify the two, then either declare them as cover
  (authoring, preferred) or land the proposed solid-box heuristic explicitly. Candidate 9 MUST
  NOT enter with unnamed leaks.
- F4 (recommended): cover subtraction is containment-only (`containedIn` — collider fully
  inside cover). A wall piece straddling a cover edge survives and can merge into a silhouette
  that still inks cover area; the test's cover check has the matching hole (element must
  contain the cover within 0.35 m AND be within +1 m of its size — a merged wall is larger, so
  the assertion passes while cover ground is inked). Smallest fix: subtract on overlap
  fraction (e.g. >50% of the collider inside cover) and assert no element overlaps a cover
  footprint beyond epsilon.
- F5 (recommended): fail-open missing-Y — `src/minimap.ts:105-108` defaults absent `maxY` to
  `+Infinity`, so a future Y-less collider admits on span alone. Authored `Box2`s carry
  `minY/maxY` today (`src/map.ts:248-251`), so the gate is live, but the default should be
  closed. Smallest fix: default missing height to 0, or assert finiteness in the budget test.
- F6 (info, not blocking): `arena.houses` bypass the structural filter (added directly as
  `building`; only the readability fence applies). Correct by design (authored footprints),
  but note nuketown2's after-set is `road 1, wall 12` with zero `building` — its houses arrive
  as merged wall silhouettes via colliders. Consistent with the counts; worth one line in the
  lane report.

## Check 3 — markers consistent and HUD-readable

PASS (code-verified; visual confirmation still owed — see U1).

- One marker path for every arena: `src/legacy-main.ts:27959-28084`. Domination ringed letters
  (`:27959-27979`, ring r=8, 9 px font) and practice targets (`:27980-27984`, r=5 active /
  2.5 inactive) moved out of the deleted non-atomic branch, so the set no longer changes
  map-to-map. Remaining markers on the same path: rare-weapon ping (`:27900-27914`),
  remotes/bots r=6 (`:27990-28002`), Overdrive ring (`:28003-28019`, lineWidth 4 + 15 px `2×`
  — the largest marker, fine), scout sweep (`:28027-28053`), player arrow + cone
  (`:28054-28077`), north `N` 22 px (`:28081-28082`).
- Domination lookup uses `TEST2_DOMINATION_ZONES` (`:27962`) with `continue` on unknown zones —
  domination only runs on test2, so cross-arena consistency there is vacuous but the code is
  unconditional. No per-arena marker fork remains.
- Readability: structure strokes 2–2.5 px on the 256 px backing
  (`src/minimap-static-layers.ts:54-57`), road fill-only; marker radii ≥2.5 px, fonts 9–22 px.
  Contrast 16.3:1 / 13:1 (commit `4ce384df`) is **[UNVERIFIED HERE]** — repeated from the
  report, not recomputed in this static review.

## Check 4 — tests, fixtures, ratchet

PASS with one intentional contract change (not a loosening to green).

- No skips, no `TODO`/`FIXME`, no fixture hand-edits in the diff (grep over the four touched
  test files is clean; no arena/fixture files touched at all — 32 changed files are
  `src/minimap*.ts`, `src/legacy-main.ts`, two probe/harness files, report + PNGs + counts).
- `src/minimap.test.ts`: deleted only the two tests covering the deleted API
  (`physicalCoverMinimapKind`, `minimapLandmarkLabel`); the surviving footprint-projection
  test is kept, not widened. Dead-code tests leaving with dead code.
- `src/radar-fire-reveal-main-integration.test.ts`: one-line anchor retarget
  (`minimapLandmarksRendered = structure.records`), assertions byte-identical. Mechanical.
- `src/minimap-semantic-layer.test.ts`: contract intentionally changed — the exact Nuke
  macro-set pin (`house 2 / garage 2 / perimeter 1 / road 1 / vehicle 6`) is replaced by
  per-arena budget assertions (`<= 32`, `< before`, `> 0`, structural-only, readable,
  no-cover). Appropriate for the new spec and strictly broader (11 arenas vs 1), but Nuke's
  exact composition is no longer pinned — record as deliberate, not silent.
- Ratchet respected: `LINE_CEILING = 37_396`
  (`src/legacy-main-size-ratchet.test.ts:78`); `src/legacy-main.ts` is 37,215 lines (`wc -l`),
  under the ceiling (report states 37,202; delta is line-counting convention, immaterial).
  Growth-direction-only gate: removal never fails.

Perf note (not a finding): on the gun range the structure cache keys on collider-array
identity while `activeWorldColliders` returns a fresh array every call when dummy colliders
exist (`src/legacy-main.ts:3850-3852`), so that arena repaints the layer each minimap frame.
Pre-existing pattern (the old collider layer behaved the same), cost bounded by one small
repaint + `drawImage`; no action required.

## UNFINISHED (brief requirements vs diff)

- U1. Live HUD clips: harness added (`scripts/qa/capture-minimap-hud-clips.mjs`, commit
  `f5bdc19e`) but never run — zero `*-minimap-hud-*.png` / clips JSON in
  `docs/evidence/pass95/minimap-simplify/`; REPORT §8 admits. Owner-visible confirmation in
  the running game is still owed, and AGENTS.md's "boot the app" rule makes this
  candidate-9-required (R2).
- U2. Scenery-leak disposition (R1 above): authoring declaration vs solid-box heuristic
  explicitly deferred in REPORT §8.
- U3. `rustworks-1v1` merges nothing (24 isolated runs, −61.9% — least simplified, under the
  ceiling, reads correctly). Epsilon tuning deferred.
- U4. No owner HITL judgement; lane candidate only, nothing published.
- U5. `tsc` / vitest / build greens are **[CLAIMED]** by the build agent; no verifier has run
  (this review is second eyes, static-only per lane rules). Candidate pipeline must re-prove.
- U6 (optional): ceiling not lowered after the −195-line shrink (slack ~181 lines). The
  ratchet test prints the 3-step lowering procedure; lowering never needs review.

## Required before candidate 9

- R1: identify the 2 leaking atomic-acres elements (extend audit output with element
  ids/bounds) and dispose them via authoring (declare as cover) or an explicit, tested
  heuristic.
- R2: run `capture-minimap-hud-clips.mjs` per catalog arena and commit the clips + summary
  JSON; confirm WebGPU backend, laid-out `#minimap`, and decluttered ink in the live HUD.
