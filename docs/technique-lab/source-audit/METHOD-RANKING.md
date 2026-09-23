# Deep-read ranking — houses / interiors / lighting / nature / weather

Lane: sources-night-20260912, wave 1. Ranked from INSPECTED file bodies (not post text alone).
`→ lane` = primary consumer. Only rows with a transferable IMPLEMENTED or ADOPTED method are ranked;
blocked/comparator rows name the alternate.

## Houses (exterior shells, construction detail)

1. Row 35 gas-station-highway (method-extracted) → houses. One-page-brief pattern + all-procedural
   clause + departures appendix: the contract format for the teal/yellow shell authoring itself.
   Authority 2b: pattern only, no expression (no licence file at pin).
2. Row 7 night-street (implemented) → houses. Measured light budget + emissive-first rule for porch/
   garage practicals without adding real lights; TECHNIQUE.md display-transform section WITHDRAWN —
   quote no constant from it.
3. Row 10 vibe3d/thaikit (implemented) → houses. Editable-source prop pattern (sidecars with measured
   metres, pivots, sockets, destruction groups) for porch/pergola/trim dressing; peer-three rule
   (exactly one copy) already handled by host-namespace injection. three peer >= 0.185.0 matches
   installed 0.185.1.
4. Row 6 img2threejs (implemented) → houses. ObjectSculptSpec + action-ready gate
   (root.userData.sculptRuntime: pivots, sockets, colliders, destruction groups) as the acceptance
   shape for any generated shell dressing.
5. Row 50 fable51 (method-extracted) → houses. Passability-sweep QA pattern for porch/door/stair
   headroom checks (mechanical, never a hardcoded roster).

## Interiors (mid-century living/kitchen hero view)

1. GLM restaurant/bar brief (recovered, see GLM-BRIEF-RECOVERY.md) → interiors. Kitchen-line family,
   coved junctions, heat-darkened metal, neutral task light, critic lenses. Highest-priority read.
2. Row 48 subway (implemented/ADOPTED) → interiors. Value composition over lighting tech: emissive
   fixtures, restrained palette, fog falloff, decal grime, filmic post — while keeping readability.
   Interiors still needs REAL lights for gameplay; the look is not bought with tech alone.
3. Row 7 night-street (implemented) → interiors. Same budget rule applied to table/cove practicals.
4. Row 45 Trellis.2/Pixal3D (implemented/ADOPTED) → interiors. Bounded supply route for ONE static
   hero prop at a time (e.g. a period appliance shell is overreach — static dressing only, never
   deforming/rigged; procedural rebuild preferred for repeated dressing).
5. Row 43 Lumera (blocked) → interiors. Principle only: keep objects separable, lighting parametric
   (row 6 already does this). Re-check for code release before depending on it.

## Lighting (daylight into new interiors, contact depth, weather compatibility)

1. Row 7 night-street (implemented) → lighting. THE budget method: measure the removed rig, derive
   artificial levels, emissive-first. Direct input to the daylight-rig defaults.
2. Row 48 subway (implemented) → lighting. Metering discipline + non-hiding grade bound (toe lifts
   only, bounded midtone slope, clamped grain) — matches the no-washout requirement for teal/yellow siding.
3. Row 9 react-doctor (implemented) → lighting. Per-frame allocation/disposal audit for the new rig
   (no per-frame allocation; luminance-preserving post).
4. Row 2 abyssal-ocean (implemented) → lighting (secondary). JONSWAP/TMA-corrected spectral water is
   overkill for the arena, but the foam-where-Jacobian-folds test is the cheapest credible surf cue.
5. Row 46 Water Pro (blocked) → lighting. Bubble-backscatter colour term restated; product out of
   bounds (commercial v2.2). Alternate: rows 2+4 terms.

## Nature (rocks, Joshua tree/pine, hedge with clustered leaves)

1. Row 18 procedural-grass (implemented) → nature. Blade sweep + jittered-grid placement with
   slope/density rejection + 4-layer root-anchored wind + LOD rings + root AO. CPU rigid-rotation
   wind + emissive SSS approximation carry directly (GLSL forbidden on WebGPU path).
2. Row 38 super-terrain forest (method-extracted) → nature. Spline-field scatter + species/mask
   separation as the upgrade path for existing tuft-grass/scatter; tree editor is a product question.
   UNLICENSED — restate, never copy; re-pin (row 33's pin predates the forest work).
3. Row 8 jungle-trail (implemented) → nature. Bake-correctness checklist: premultiplied-alpha leaf
   edges, quad winding + moss compounding — the two defects any clustered-leaf hedge pass reproduces.
4. Row 33 super-terrain LOD (implemented) → nature. Projected-error LOD + asymmetric hysteresis +
   neighbour seam constraint for scatter density at distance. Headline features (QEF, live CSG,
   workers) explicitly NOT demonstrated.
5. Row 24 TAKEN (blocked) → nature. Comparator only (dense low cover, night sky). Alternate: row 18
   method under our own title; never credit this source.

## Weather / sky / atmosphere

1. Row 7 night-street (implemented) → lighting/weather. Blue-hour balance + exposure discipline from
   the same budget method; layered-skyline depth without flat-black backdrops.
2. Row 2 abyssal-ocean (implemented) → weather/water. Wind/fetch/depth-driven JONSWAP+TMA as the
   reference surf model; lab CPU N=32 single-cascade is the honest subset.
3. Rows 3/4/25 (comparator/implemented/blocked) → weather/water. Comparator lists only (shore foam,
   caustic depth, wade depth, depth-responsive energy); row 4's cut explicitly UNSOLVED — show no
   waterline cut as solved.
4. Row 32 WAN 2.2 (blocked) → none today. No sky/video generation without pinned weights + GPU run;
   procedural sky stays.

## Explicitly NOT ranked (no transferable method)

Rows 14, 17, 22, 24, 39, 41, 44 (comparators/format), row 21 (alias), row 37 (archive), row 15
(native-runtime product decision), rows 5/30/32 (licence/composition/GPU-blocked — alternates named
in catalog).

## Wave-2 addendum (2026-09-12)

- Rows 45/48 re-staged `implemented` → `method-extracted` in the catalog: ADOPTED (a recorded decision with pinned evidence) is not EXECUTED (a demo on record). Every "implemented/ADOPTED" above now reads as decision-recorded, execution OPEN for both. Flagged for root confirm/reverse in HANDOFF.
- super-terrain re-pin target: HEAD `b82e823` (2026-09-01) with an MIT LICENSE file added; pin `e417c04` (2026-08-23) predates the foliage-sheen, firefly-rejection, material-octave and scatter-rock commits. The nature upgrade path (rows 18/38/33) still starts from row 18's implemented method; re-pin before restating anything newer.
- Row 46: public feature-page terms (JONSWAP 3-cascade swell/waves/ripples, subsurface scattering, Jacobian + procedural foam) confirmed restatable; the bubble-backscatter term stays register-only (not on the page re-read 2026-09-12).
- Row 42 shelf fully censused at file level (see catalog row 42): ggez / three-maps / freed / three-roads / procedural-bank / vibeviz carry MIT-style grants read as files; fenix has no licence file and stays excluded. Prop/houses ingestion proceeds per threejs-source-prop-ingestion pin + licence gates.
