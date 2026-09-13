# Normal contract migration (2026-09-12)

Source pinned at `df933ec48750eb73d113a7c77d29b1a89bc1a7aa`. Installed three `0.185.1`.
Root-reviewed implementation; game and owner acceptance remain OPEN.

## What was wrong

Two vehicle-forge tests pinned a derived state instead of the invariant they name.

1. `normal-winding.test.ts` carried 27 b63 position/UV SHA-256 rows and vertex
   counts from 2026-09-10 (`c93eed84a`). Their job was to prove the *normal repair*
   had not moved a vertex. Later commits re-authored shapes on purpose, so at this
   head 12 of 27 cases fail on the count or hash lines while the real invariant,
   `opposing === 0` over nondegenerate faces, still holds for all 27.
2. `coach-detail-visibility.test.ts` pinned the skirt span 2.25 / 6.85, which is
   `axle ± (wheelRadius + archGap + 0.13)` evaluated at `wheelRadius 0.42`. The coach
   is authored and independently pinned at `0.47` (`coach-polish.test.ts`), so the
   literal is unsatisfiable without an authority change.

## What the migration does

- **Historical bytes preserved.** The exact fixture array is kept verbatim as
  `normal-winding-b63-baseline.json` (27 rows) for audit. No repin.
- **normal-winding keeps every case** and the orientation invariant, plus two additive
  structural checks (triangle-soup count, one normal per position). The stale
  before/after lines are removed, replaced by the method-level property below.
- **`geometry.ts`: minimal extraction.** The order decision inside `pushTriangle` is
  lifted to an exported `orientTriangle`; `pushTriangle` iterates its result and
  `needsFlip` gains `export`. Output is byte-identical at this head: 47 products
  (27 unit geometries plus every merged mesh of the coach, sedan and truck-cab
  builds, 111 426 vertices) hash identically for position, normal and UV before and
  after the change. Zero-length normals: 0.
- **`triangle-orientation.test.ts` (new)** drives `orientTriangle` and `needsFlip`
  with 3 500 seeded arbitrary quads (general, opposed normals, 1e-6-scale, collinear,
  repeated vertex, all-zero normals, random normals, random index permutations, both
  decision paths) and proves: the result is the identity or the second/third swap of
  the given indices; input records are never mutated; the emitted
  position/normal/UV records are exactly the input records under that permutation;
  every nondegenerate emitted face winds with its analytic reference; degenerate
  faces keep the caller's decision; an all-zero reference never flips. The checker
  is itself validated against seven reference faults that must be rejected:
  inverted winding, detached UVs, perturbed position, zeroed normals, negated normal
  on flip, dropped degenerate triangles, mutated input.
- **Skirt clearance becomes a derived physical property.** Each skirt end must lie
  beyond the nearer arch opening `wheelRadius + archGap` by the same positive margin
  fore and aft and stay inside the authored skirt span; two skirts and 12 triangles
  are retained. Perturbation evidence: building the coach with a 50 mm smaller wheel
  widens the skirt by exactly 50 mm at each end.

## Falsifiers (staging, all red as intended)

| Mutant | Goes red in |
| --- | --- |
| `orientTriangle` never flips | normal-winding (opposed faces) and triangle-orientation |
| skirt clearance uses fixed 0.42 instead of `spec.wheelRadius` | coach-detail-visibility perturbation |
| skirt clearance = `archGap` (crosses the arch) | coach-detail-visibility margin > 0 |

## Out of scope, unchanged

Budgets, collision, materials, counts and every other assertion. The rejected
default-off geometry experiment from another tree was not used.

## Independent root verification

The historical before/after fixture was a bounded proof for the normal repair,
not a permanent freeze on subsequent authored geometry. All 27 orientation cases
remain; the retired fixture bytes remain available for audit. No geometry budget
or collision assertion is changed by this migration.

Root independently compared the pinned original files to Git and reran the census:
47 products, 111,426 vertices, identical position/normal/UV buffers. Root corrected
the proposed preservation test to invoke the actual production `pushTriangle`
copy loop. All 43 focused cases pass. Three staging-only mutations of that loop
(position corruption, zeroed normals and detached UVs) fail the preservation test.
The 3,500 seeded cases are sampled property coverage, not an exhaustive proof over
all floating-point values. The seven reference faults test the checker separately.
