# Muse review — nuke-backdrop-and-windows (pass95) — SHIP

Branch: `contrib/dave-gaming-pc/muse/nuke-backdrop-and-windows` @ `a2425015`.
Base for this review: `452d7aba` (the SHA REPORT.md pins as
`origin/contrib/dave-gaming-pc/claude/pass93-candidate`).
Note: that remote tip has since advanced (candidate-8 merge/gate evidence);
the 127-file tip-vs-HEAD diff is dominated by that forward motion, not by
this branch. Functional diff is 7 files: 6 source/test + REPORT.md.
Lane: no builds, no browsers, no GPU; no `npm install/ci/rebuild`.
Power plan verified High performance (`8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`).
AKP adoption guard: PASS for OMP on dave-gaming-pc (with `--bootstrap`).

## Check 1 — smoothed ridge profile: PASS

- Segments rise only on the silhouette rings:
  `src/nuketown-mountain-backdrop.ts:428` foothills stay 108,
  `:447` main ridge 144→168, `:470` far range 120→144.
- `smoothVar` (`:162`) uses integer frequencies (`baseFreq`,
  `2*baseFreq+1`, `3*baseFreq+2`), so the ring is 2π-periodic and closes
  with no seam; same ±0.2 variation range as the old hash jitter, none of
  its per-segment steps. `mulberry32`/`SEED` deleted.
- No new material family: foothills/ridge/far-range all share the existing
  `ridgeMaterial` (`:439`, `:458`, `:481`); skirt keeps `skirtMaterial`.
  `RIDGE_FOG` stays false, skirt stays scene-fogged.
- Haze tint is fog-derived, and the arithmetic checks out:
  fog `0xb1c0be` × 0.45 = (79.7, 86.4, 85.5) ≈ `0x505656` (`:136`).
  Two-plane layering as claimed: haze 0.34 near (`:436`) vs 0.6/0.82 far
  (`:455`, `:478`). Ring count unchanged (3 rings + optional skirt).
- Shoulder clamp (`Math.min`/`Math.max` on `innerShoulderR`) is new
  hardening against crest/inner-radius crossing; not a behavior change.

## Check 2 — window frame depth: PASS

- Back power-window jambs (`src/nuketown2-arena.ts:1607,1609`) are an exact
  mirror of the front recipe (`:1510,1512`): same `[0.07, 2.70, WALL_T+0.02]`,
  same `UPPER_Y0 + 1.35`, same ±0.035 insets, same `m.trim`,
  same `{solid:false, shots:false, cast:true}`. Merged static geometry via
  `pair()`; opening, sill and head already matched the front.
- Glow strips (`:1465`) use the existing `m.warmLight` hook — the same
  material as the four ceiling lenses — `solid:false, shots:false`, so no
  cover/collider/ballistic change. Center `zFront + WALL_T/2 + 0.02` with
  0.05 depth puts the inner face 5 mm inside the head band (construction
  contact) and 45 mm proud — clears the 0.03 coplanar band by construction.
  Glass family untouched: `createNuketown2GlassMaterial`
  (`src/nuketown2-interior-materials.ts:241`) has no `transmission`
  (opacity 0.42 transparent standard material); no glass call-site changed.
- Checker output is quoted in REPORT.md (`boxes=962, pairs=288,
  FINDINGS 0, SAME-VISIBLE 0`). Reviewer did not re-execute the checker
  (no-build lane); geometry reasoning above supports the zero claim, and
  the one plausible new contact (strip-vs-head-band bedding) is the benign
  identical-fragment class the instrument already buckets as CONTACT.

## Check 3 — vehicle roofs: PASS

- Crown rides the existing generator: `roofCrownM` on the spec
  (`src/vehicle-forge/specs.ts:67` coach 0.03, `:107` cab 0.015; sedan
  absent = flat), `crownSurfaceY` (`src/vehicle-forge/geometry.ts:341`)
  with cos falloff to the top-arc edge, consumed by `stationRing`
  (`:391`, centre vertex only — a 30 mm shallow peak, not a re-loft).
  Peaks stay in-box: 3.29 < 3.3 coach, 2.895 < 2.9 cab. Same
  stations/quads, topology unchanged.
- Rails are a new `roofRail` primitive (`:971`) but dress through the
  existing path: `RoofRails` interface + `parts[rails.bucket]` push in
  `src/vehicle-forge/build.ts`, both call-sites bucket `'chrome'`
  (`src/nuketown2-arena.ts:2656,2671`). No new material, no new draw call.
  8 mm bedding + 45 mm height clears the coplanar band; base samples the
  same `crownSurfaceY` the rings loft, so rails cannot float off the skin.
- Box ribs (`src/nuketown2-arena.ts:2303`) reuse `m.truckBox`, 10 mm bedded,
  40 mm proud, ±0.9/±2.3 keeps the 2x core seat clear; `solid:false,
  shots:false`; roofY derivation, deck and treads untouched.

## Check 4 — verge/aggregate + pipeline budget: PASS

- Verge/aggregate caps untouched: `src/nuketown2-fidelity.test.ts:2833,2835`
  still ratchet furniture ≤36 and bodies ≤51; REPORT's "45 bodies"
  observation sits under both caps. No count moved.
- Pipeline constants untouched: `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS`
  still 54, clustered 54-pipeline ceiling still asserted, forge fences
  still coach ≤10k / truck ≤6k (`src/vehicle-forge/specs.ts:161-162`).
  REPORT quotes forged tris 55224→55948 (+724, rails + crown + ribs),
  graphs within ceiling, tripwire 0 — consistent with the diff; only the
  asymmetric enumeration grew (see check 5).

## Check 5 — test strictness + ratchet: PASS

- Sole test edit is `src/nuketown2-fidelity.test.ts:1943-1946`: four rib
  names appended to the EXACT-EQUALITY `EXPECTED_ASYMMETRIC` list with the
  mandated reason comment. That list fails on any add/move/delete until
  deliberately updated — appending with reason is the required pattern
  (cf. HF-426/HF-432/HF-436 precedents above it), not a loosening.
- No threshold, timeout, tolerance or assertion weakened anywhere else in
  the diff; `legacy-main` not in the diff stat (ratchet holds).
- `git status` clean at review time; all four commits use explicit paths;
  probe script deleted before push as REPORT.md states.

## Findings

No blocking findings. One non-blocking nit (optional, integrator's call):

- `src/vehicle-forge/geometry.ts:971` (`roofRail` comment): "Both sides
  sample |xOffset| for the surface height" — true only indirectly, via
  `Math.abs` inside `crownSurfaceY` (`:341-350`); the rail body itself
  passes the signed `xOffset` through. Why: a future reader may "fix" the
  call-site to `Math.abs` and churn nothing. Smallest fix: reword to
  "crownSurfaceY takes |x| internally, so a mirrored pair beds evenly."

## Verdict: SHIP

1. Every claimed invariant is present in the diff with exact-recipe
   evidence: silhouette-only segment density, fog-hue haze with verified
   0.45 scaling, trim/chrome/truckBox/warmLight reuse everywhere, bedding
   depths that clear the coplanar band, peaks inside dressed boxes.
2. Zero verifier weakening: the only test change is the required
   exact-equality enumeration with reason; all budget constants, fences,
   verge caps and the legacy-main ratchet are byte-identical.
3. REPORT.md quotes the full verification table (4/4, 26/26, 39/39,
   10/10, 20/20, 19/19, 4/4, coplanar 0/0, `tsc --noEmit` 0) with
   before/after numbers that match the diff's geometry.

## UNFINISHED (integrator owns)

- Visual confirmation: no-browser lane, no captures taken. Reviewer did
  not see pixels. Integrator must cover the changed surfaces with the
  deterministic review cameras in both profiles: ridge silhouette layering,
  back power-window reveals, glow strips at golden-hour/overcast, crowned
  coach/cab roofs with rails, box ribs.
- Re-execution: all green tables, the coplanar checker and `tsc --noEmit`
  are quoted, not re-run, by this review. Re-run from the candidate
  checkout before admission.
- Candidate-9 intake: branch forks at `452d7aba`; the pass93-candidate tip
  has advanced with candidate-8 material. Rebase/merge onto the live tip
  and re-verify; this SHIP covers the feature delta, not the merge.
