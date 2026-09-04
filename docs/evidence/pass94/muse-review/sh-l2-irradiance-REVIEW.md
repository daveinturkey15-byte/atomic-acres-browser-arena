# Muse review — SH-L2 irradiance volume (pass96 lane, 7f9b14b6..a8fde644)

Reviewer: OMP on dave-gaming-pc (model meta-contributor/muse-spark-1.3-contributor), 2026-09-04.
Scope: `git log --oneline 7f9b14b6..a8fde644` (3 commits), `git diff` over `src`
(4 new files, +2010), `docs/evidence/pass96/sh-l2-irradiance-volume/REPORT.md`,
`docs/threejs-knowledge/r185/sh-l2-irradiance-ours.md`.
Method: read-only source inspection + `git show` on the base. No builds, no browser, no GPU.
Adoption: OMP trusted (`akp_adoption_guard PASS`, digest 7057aa9d); power High performance.
Branch: `contrib/dave-gaming-pc/claude/sh-l2-irradiance-volume`, tree clean at review time.

Verdict: **SHIP-WITH-FIXES** (landable as staged-not-wired; the two fixes below are
pre-install, not pre-merge). Three reasons:
1. The maths, packing, and TSL node are correct and pinned by the right tests
   (white furnace, orthonormality, L1-compatibility, pack round-trip).
2. Blast radius today is zero: staged, not wired into any material, 0 pipelines,
   no existing file touched, no test loosened.
3. The residual defects cannot corrupt the running game yet but will once wired:
   the digest ignores geometry content (stale-serve), and the dering guarantee is
   discrete + synthetic-only. Both are bounded pre-install fixes.

## Claim-state ledger

| # | Claim | State |
|---|---|---|
| 1 | SH-L2 projection/evaluation math correct | VERIFIED (constants + 3 analytic tests) |
| 2 | Relative dering guarantee asserted on the real arena bake | FALSIFIED as stated — asserted on a synthetic cone, not on the 3520-probe arena bake; REPORT bake numbers are unasserted provenance |
| 3 | Windowed probe cannot show visible negative lobes on a flat interior wall | VERIFIED with a caveat — final `max(0,…)` clamp makes negative display impossible; discrete 42-dir search leaves inter-sample undershoot that reads as over-darkening, not negativity |
| 4 | Intersector normal fix local; shared intersector still carries the bug | VERIFIED — fix is local, shared box path unchanged, reflections unaffected, future diffuse consumers at risk |
| 5 | Digest keyed by conditionId; stale bake after sky edit | PARTLY VERIFIED — sky-value edits are covered; geometry/albedo/seed edits are NOT (count-only key) |
| 6 | No test loosened; ratchet breach inherited | VERIFIED — diff adds 6 files, touches zero existing files; base already 37,101 > 37,100 |

## (1) SH-L2 projection and evaluation math — CORRECT

Quoted constants (`src/rendering/lighting/sh-l2-irradiance.ts:124-131`,
inheriting `baked-indirect.ts:262-266`):

```
SH_A0 = 3.141593 (pi), SH_A1 = 2.094395 (2pi/3), SH_A2 = 0.785398 (pi/4)
SH_Y00 = 0.282095, SH_Y1 = 0.488603
SH_Y2_XY = 1.092548, SH_Y2_YZ = 1.092548, SH_Y2_ZZ = 0.315392,
SH_Y2_XZ = 1.092548, SH_Y2_XXYY = 0.546274
```

All five band-2 values are the standard real-SH normalisations
(sqrt(15/4pi) ≈ 1.092548 for xy/yz/xz; sqrt(5/16pi) ≈ 0.315392 for 3z²−1;
sqrt(15/16pi) ≈ 0.546274 for x²−y²). `SH_A2 = pi/4` is the Ramamoorthi–Hanrahan
`A_2`. Convention (raw `L_lm` projection, `A_l` only in reconstruction,
outgoing radiance = irradiance/pi) matches the L1 lane, and the order
`(L0, L1y, L1z, L1x)` + `(xy, yz, zz, xz, xxyy)` is identical in
`projectShL2Sample`, `evaluateShL2`, the TSL node (`sh-l2-irradiance-node.ts`
`l01`/`l2` closures), and `packShL2Volume`. Pinned by:
white-furnace (`sh-l2-irradiance.test.ts:99-115`), band-2 orthonormality
(`:117-135`), L1-exact-when-band2-zero (`:148-161`), and texture-level
L1-compatibility (`:529-531`). Truncated `3.141593` vs `Math.PI` (≈3.5e-7) is
shared with the L1 lane so the compatibility check holds; not a defect.

No finding on the maths. No fix.

## (2) Relative dering guarantee — implemented correctly, tested on the wrong input

`deringShL2InPlace` (`sh-l2-irradiance.ts:347-395`) implements exactly what the
recipe claims: baseline = `min(0, rawL1)` per direction per channel on the
unwindowed coefficients, ladder `Infinity,12,8,6,5,4,3.5,3,2.75,2.5,2.25,2.1`
(`:277-279`), widest-first, `hanningWindow` never touches band 0, failure zeroes
band 2. The test at `sh-l2-irradiance.test.ts:200-232` asserts the relative
property on a synthetic narrow bright cone and correctly refuses the absolute
bar (L1 rings too — the fixture proves `worseBefore` first). Honest test.

What is NOT asserted: REPORT.md §2/§4's "measured on the real arena bake:
453/3520 deringed at 48 rays, 287/3520 at 128 rays, 0 demoted". No test bakes the
3520-probe `NUKETOWN2_BOUNDS` grid and asserts dering/demote counts or the
relative property across all probes. The node test's "Nuke Town Rebuild volume"
block (`sh-l2-irradiance-node.test.ts:239-298`) checks band, budget, coverage,
one 1-probe darkening contrast, and byte counts — never dering. So claim (2) as
"asserted by a test on the real arena bake" is false; the numbers are
provenance prose, and bake-time prohibition (correctly) keeps them out of tests.

Visible-negative-lobe question: no. Both `evaluateShL2` and the TSL node end in
`max(0,…)` per channel, so a flat interior wall samples one clamped value —
it can read too dark (clamped to 0 where truth is positive) but never negative
on screen. The residual risk is over-darkening between the 42 fixed spiral
check directions (`:266-276`): the guarantee is discrete, tolerance 1e-6
(`:390`), and a band-2 lobe narrower than the spiral spacing can slip through.
Effect: a slightly too-dark wall under a harsh sky, bounded by the L1 baseline
+ 1e-6 at the checked directions. Acceptable for staged; document before install.

FINDING-1 — `src/rendering/lighting/sh-l2-irradiance.ts:266-279` + `sh-l2-irradiance.test.ts:200-232`.
Why: guarantee checked on 42 fixed dirs against a synthetic cone; inter-sample
lobes and the real-arena bake counts are unasserted, so a future lighting change
can silently move demote counts. Smallest fix (pre-install, not pre-merge):
add one deterministic test that bakes a small real-footprint grid (e.g. the
existing 1-probe `single()` harness over 8–16 fixed positions, seed pinned) and
asserts `rawL2 >= min(0, rawL1) - 1e-6` on all `DERING_PROBE_DIRECTIONS` for
every probe plus reports demote count; keep wall-clock out (assert counts, not ms).

## (3) Intersector normal bug — fix correctly local; shared path still inverted

Verified by reading `intersectBox` (`src/rendering/raytracing/analytic-proxy-scene.ts:122-167`):
`axisSign` initialises to `-sign(d)` and the entry-face normal is exactly
along the ray (e.g. −z ray into +z face yields `(0,0,-1)`; `dot(n,dir) = +1`).
The lane's flip in `traceShL2Radiance` (`sh-l2-irradiance.ts:625-628`,
`dot < 0 ? n : -n`) is correct and minimal. Deliberately not changing the shared
intersector is the right call for a concurrent lane.

Consequence stated honestly: reflections are safe — `r = d − 2·dot(d,n)·n` is
sign-symmetric, which is why the ray-traced lane never noticed. Any current or
future **diffuse** consumer of the shared box path (`N·L`, cosine sampling,
albedo bounce) inherits the black-bounce bug: every sun-facing `N·L` goes
negative, the bounce returns black, and the output looks plausible (pure sky).
Note the API is now inconsistent: sphere returns outward normals
(`:184-188`), plane faces the ray (`:200`), box goes along the ray. That
inconsistency is the hazard, not the local flip.

FINDING-2 — `src/rendering/raytracing/analytic-proxy-scene.ts:122-167`
(docs-only, pre-install). Why: next diffuse caller will re-discover this silently.
Smallest fix: 3-line doc comment on `intersectBox` stating "box normals point
along the incident ray (historic convention, depended on by mirror traces);
diffuse consumers must flip with `dot(n,dir) < 0 ? n : -n` as `traceShL2Radiance`
does", plus one negative test asserting the current convention
(`dot(hit.normal, dir) > 0` for an exterior −z box hit) so a future "fix" of the
shared function fails loudly instead of silently changing reflections. Do NOT
flip the shared function in this lane.

## (4) Digest keyed by conditionId — sky edits safe; geometry edits NOT

`shL2Digest` (`sh-l2-irradiance.ts:727-750`) keys on `arenaId, conditionId`,
grid dims/spacing/origin, all five lighting vectors, `raysPerProbe, bounces`,
and `occluders.shapes.length`. A sky edit that moves sun/sky values changes the
digest regardless of `conditionId`, and a `conditionId` rename alone correctly
forces a distinct key (rebake, never stale). So "stale bake served after a sky
edit" does not hold for value edits.

The hole: geometry content is keyed by **count only**. Same count + moved box,
changed albedo, swapped `bounceAlbedo`, or different `seed` → identical digest,
different volume. Contrast the L1 lane's `computeBakeDigest`
(`baked-indirect.ts:437+`, base SHA): per-shape kind/centre/halfExtents/yaw/albedo
at 1e-3 plus lighting plus tuning. The SH-L2 key is strictly weaker than the lane
it extends, and the bake reads `shape.albedo` per hit (`:610-616`) so an albedo-only
edit is a silent stale serve once any runtime cache exists. Today there is no
runtime cache (staged, §6 of REPORT), so impact is zero-today / wrong-volume-
tomorrow.

FINDING-3 (the one required fix before wiring) —
`src/rendering/lighting/sh-l2-irradiance.ts:727-750`. Why: count-only occluder
key + missing seed/albedo inputs. Smallest fix: hash what the bake reads —
append per-shape `kind, centre, halfExtents, yaw, albedo` (same 1e-3 quantiser as
L1), plus `String(options.seed ?? default)` and the resolved bounce albedo mode,
to `parts` before the FNV-1a hash. One test: same-count moved-box and
albedo-swapped bakes must differ in digest (mirror the existing
`changes its digest when the lighting changes` test at
`sh-l2-irradiance.test.ts:452-467`).

## (5) No test loosened; ratchet breach inherited — VERIFIED

`git diff --name-only 7f9b14b6..a8fde644`: 6 files, all new
(2 implementation + 2 tests + 2 docs). Zero modifications to existing tests,
thresholds, or timeouts. `git show 7f9b14b6:src/legacy-main.ts | wc -l` = 37101
against `LINE_CEILING = 37_100` (`src/legacy-main-size-ratchet.test.ts:78`);
`git diff` over `src/legacy-main.ts` is empty. Breach predates the lane; leaving
it red is correct per "never weaken a verifier". Owning lane bumps with a
`CEILING_HISTORY` entry.

## Minor notes (no action required)

- `bakeShL2Volume` deringed-counter (`:663`): `Number.isFinite(window)` counts
  finite windows only, so `Infinity` (untouched) is excluded and demoted
  (`window: 0`) is included in both counters. Matches REPORT semantics.
- `setBlend()` no-op (`sh-l2-irradiance-node.ts`) is honest (single-bake
  shipping route); keep until the two-texture blend exists.
- Node TSL channel swizzle (`p3.x..p4.x` / `p4.y..p5.y` / `p5.z..p6.z`) matches
  `packShL2Volume` channel-major + zero pad; `uploadShL2Volume` dimension guard
  and fixed-lifetime textures keep rebakes pipeline-safe. Strength/additive
  double clamp (`SH_L2_MAXIMUM_STRENGTH = 0.55`, `SH_L2_MAXIMUM_ADDITIVE = 0.18`)
  preserves the additive-never-darkens property.

## Re-check performed

- `git status --short --branch` clean on the lane before writing; this review
  stages/commits only its own file.
- Line references above re-read from the working tree (`grep -n`), not from memory.
