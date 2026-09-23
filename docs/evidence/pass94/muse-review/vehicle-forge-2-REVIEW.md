# Muse review — vehicle-forge-2 lane (pass94)

Scope: `C:/Users/david/projects/aa-claude-vehicles`, branch
`contrib/dave-gaming-pc/claude/vehicle-forge-2` at `2861c320`.
Lane commits over `a0956d25` (also `0123a427`): `3e5e49a3` forge,
`e234c002` gates, `2861c320` evidence. Full `src/` diff read (10 files),
plus `docs/evidence/pass94/vehicle-forge-2/REPORT.md`.
No builds, browsers, tests, or `src/` edits per lane rules; every claim below
is static reading of the diff, the gate sources, and REPORT. No visual capture
was permitted in this lane either — silhouette/color-read verdicts rest on
gates and uniforms, stated as such.

## Claim-state ledger

| # | Claim | State | Evidence |
| --- | --- | --- | --- |
| 1 | Bodies stay inside prior collider boxes (+0.15 m); mirror/spawn/overdrive untouched | VERIFIED (static) | `src/vehicle-forge/vehicle-forge.test.ts:369-399`; `src/nuketown2-fidelity.test.ts` mirror + authority gates (quoted below) |
| 2 | Still one draw per material (11); paint is per-vehicle uniform, cream-everywhere bug fixed not inherited | VERIFIED (static) | `src/vehicle-forge/build.ts:143-210`, `:366-529`; `src/vehicle-forge/materials.ts:101-129`; `src/nuketown2-pipeline-budget.test.ts:155-167`; `src/nuketown2-arena.ts:2277-2410` |
| 3 | 45,988 triangles sane; heaviest part + cheapest cut named | REPORTED / sane by inspection | REPORT §Measured bounds; `src/vehicle-forge/specs.ts:154-157`; see note on the total |
| 4 | Chrome bumpers via existing metallic role; no new node graph | VERIFIED | `src/vehicle-forge/materials.ts:195-205`; `src/nuketown2-pipeline-budget.test.ts:143-173` |
| 5 | Loft is own implementation, not vendored (HF-472) | VERIFIED | `src/vehicle-forge/geometry.ts:12-24`, `:940-` (`surfaceBandAtHeights`) |

### 1. Collider envelope / mirror / spawn / overdrive

The silhouette gate (`vehicle-forge.test.ts:369-399`) builds each dressed
vehicle and asserts, verbatim in structure:

- `width + 0.15`, `height + 0.15`, `length + 0.15` upper bounds and
  `nose >= -0.15`, against envelopes coach `2.6 x 3.3 x 9.1`, truck
  `2.6 x 2.9 x 11.7` (cab spec dressed, cargo length), saloon
  `1.9 x 1.88 x 4.4`, plus `triangles <= budget` per vehicle.

Authority separation is gated in `nuketown2-fidelity.test.ts`: `dresses the
street vehicles with lofted skins WITHOUT moving any authority` asserts
`audit.retired == 110`, `mismatches == []`, every `vehicle-forge *` mesh is
`presentationOnly`, has no `BoxGeometry.parameters`, no `ballisticSurfaceId`,
and `forged == audit.drawCalls`. The mirror falsifier class has its own gate,
`lands every forged vehicle skin on the collider body it dresses`, holding each
skin centre within 0.35 m of its body plus a direct assertion that head-car box
and skin both sit at `hx(4.5)`. The truck-bogie exception is held to the deck
centre line (< 0.35 m in z).

Untouched-surface check: the lane diff touches 11 files, none of which is
`nuketown2-layout.ts`, `overdrive.ts`, or any spawn table. The 0.150 figure in
the brief is the **coach across-street offset** (`offsetAcross 0.150 L`,
fidelity gate), not an overdrive offset: the overdrive seat derives from the
truck (`OVERDRIVE_ARENA_POSITIONS.nuketown2`: `y = roofY + coreHeightOverRoof`,
`z = CENTRAL_TRUCK.z`, i.e. the 0.076 L truck placement). Both constants and
both gates live outside this diff.

### 2. Perf merge + paint uniform

Draw arithmetic (static): coach uses paint + accent (`surfaceBands`, arena
`:2305`) + stripe-as-chrome; truck cab uses paint only (grille/mirrors/seams
go to chrome/groove, no bands/stripes); saloon uses paint only (whitewalls go
to chrome, `build.ts` whitewall push). The truck/saloon accent *instances*
exist (`createForgeMaterialSet` always mints two paints) but receive no
geometry, and `mergeForgedPlacements` emits one mesh per material *with*
geometry — so 4 paint-ish meshes (coach paint, coach accent, truck paint incl.
reassigned cargo boxes, saloon paint) + 7 shared buckets
(glass/lining/groove/chrome/tyre/headLamp/tailLamp) = **11 draws**. Per-vehicle
cap is now 9 (`build.ts:11`, was 8: +whitewall path). Consistent with REPORT.

Paint bug: the old channel-lift (`peak`/`floorScale`, removed in this diff) is
gone; `createForgePaintMaterial` (`materials.ts:101-129`) now carries pigment
in `TSL.uniform(Vector3(linear))` (`:126`) with an explicit never-normalise
comment (`:122-125`). The gate (`nuketown2-pipeline-budget.test.ts:155-167`)
asserts navy vs cream share one graph key AND the navy uniform equals the exact
unlifted sRGB->linear triple. This lane **fixes** the bug: per-vehicle color
via uniform value, one shared graph shape. (Trivia: the source comment says
"candidate 4b", the brief says "candidate 5" — naming drift only, see F4.)

### 3. Triangle budget

Per-vehicle REPORT figures sit inside their fences (`specs.ts:154-157`):
coach 9,476/10,000, truck 5,164/6,000, saloon 8,516/9,000. Six street
placements (coach + cab + bogie + 3 saloons) at ~9.5k + ~5.2k + 3x~8.5k + bogie
wheels land in the mid-40s k, so the brief's **45,988** is magnitude-plausible
as the merged audit total — but I did not recompute it (no runtime per lane
rules); treat the exact integer as REPORTED, the fences as gated.
Sanity: ~46k static tris is noise against the 1.1M arena budget. Heaviest
single item is the **coach loft system** (9.1 m body, most stations + glass +
band + stripe + grille, 9,476). Cheapest cut if a fence ever trips: arch
stations `33 -> 21` (`geometry.ts:38`, whose own comment admits 21 facets the
legs) or wheel `RADIAL_SEGMENTS 20 -> 16` (`wheels.ts`). Headroom warning: coach
(94.8% of fence) and saloon (94.6%) leave ~5% for future trim — fine, but thin.

### 4. Chrome role

`createForgeChromeMaterial` (`materials.ts:195-205`) is a plain
`MeshStandardMaterial` (`metalness: 1`); the lane adds only
`userData.forgeRole = 'chrome'` (`:202`). No `colorNode`/`roughnessNode`
assignments anywhere in the chrome path, so **zero new TSL graph shapes**.
Bumpers, grille, mirrors, wheel faces, whitewalls all share the one shared
chrome instance. The 54-graph fence gate (`nuketown2-pipeline-budget.test.ts:
143-153`, `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS`) plus the explicit
`forgeRole == 'chrome'` assertions (`:169-173`, forge test `:403-409`) cover
both graph-count and never-purple regressions.

### 5. Loft provenance (HF-472)

`geometry.ts:12-24` states the method was observed in
`StarKnightt/morning-diner`, shared by the owner, and **re-implemented from
first principles** — no line/identifier/shader copied. The lane's new geometry,
`surfaceBandAtHeights` (`geometry.ts:940`), is in-repo code reusing the same
flank points, analytic normals, and `classifyQuad` glass-skip as the existing
loft; the only mention of the outside repo in the diff is that provenance
comment. No new dependencies, no vendored files.

## Findings (file:line, why, smallest fix)

- F1 `src/vehicle-forge/build.ts:170` — merge detects the paint body by parsing
  the mesh name (`child.name.split(' ').pop()`). A future rename silently
  degrades the fidelity-mirror anchor to full-bounds (including the
  cargo-running seams). Fix: set `mesh.userData.forgeBucket` at creation in
  `buildForgedVehicle`/`buildForgedWheelSet`, read it here. Non-blocking.
- F2 `src/nuketown2-arena.ts:2278,2282` — truck accent (same hex as its paint)
  and saloon cream accent are instantiated but never receive geometry (no
  bands/stripes in those dressings): two live materials, zero meshes. Harmless
  at runtime, misleading to readers. Fix: optional accent in
  `createForgeMaterialSet` (skip when unused). Non-blocking.
- F3 `src/vehicle-forge/specs.ts:154-157` — coach/saloon fences at ~95% full
  (see claim 3). Fix only if tripped: `ARCH_STATIONS 33 -> 21`
  (`geometry.ts:38`). Watch-item, not a defect.
- F4 `src/vehicle-forge/vehicle-forge.test.ts:334` — test still named `at most
  eight draw calls` while asserting `<= 9` (header `build.ts:11` says nine).
  Stale name from the whitewall bucket addition. Fix: rename to nine. Cosmetic.
- F5 fidelity mirror tolerance — skin-to-body `< 0.35 m` is looser than the
  `0.15 m` silhouette envelope; a 0.3 m-skewed skin could pass the former while
  the latter still holds. The direct `hx(4.5)` assertion covers the exact case,
  so this is defense-in-depth only. Optional fix: tighten to 0.20 m.

## Verdict: SHIP-WITH-FIXES (all fixes non-blocking)

1. Authority is untouched with exact-tolerance gates to prove it: silhouette
   envelope +0.15 m per vehicle, 110 retired boxes with zero shot-surface
   growth, mirror held per-skin, and every spawn/overdrive constant outside the
   diff byte-identical.
2. The two perf-critical properties are both gated, not prose: 11 merged draws
   fall out of bucket-mapping arithmetic, and the paint-uniform graph test pins
   the purple/cream failure mode with exact linear values.
3. The five findings are nits and watch-items (stale test name, name-derived
   bucket label, two unused material instances, thin fence headroom, loose
   mirror tolerance) — none moves authority, adds a graph, or widens a draw.

Condition: REPORT's visual-read row stays OPEN until a permitted capture
confirms cream/maroon coach, dark seamed truck, navy bubble saloon with
whitewalls. Nothing in this review substitutes for that frame.
