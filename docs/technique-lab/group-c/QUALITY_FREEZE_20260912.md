# Group-C showcase-quality freeze — 2026-09-12

Frozen BEFORE any change, at `2b5c7e2111806e4ea6c43ba74969e9d8bbbfbd36`, routed preflight green
(`artifacts/pipeline/20260912T161855472Z-contribute.json`, `routing.mode: "routed"`, lane
`showcase-c-quality-20260912`, clean).

**The three largest concrete quality/source implementation gaps in the delivered group-C set, and
nothing else this window.** (1) **Row 46** claims the register's items 4 and 6, but the bubble
source is driven by `min(1, |∇h|·1.15)` — a slope proxy — while the register states the term must be
"driven by the same turbulence estimator that drives foam", and names that estimator in item 7:
*Jacobian-based breaking detection*, feeding a *persistent* world-fixed foam field that decays, "so
foam rolls off the back of a breaker instead of appearing and vanishing with a threshold". Slope
magnitude is not a Jacobian, a fold is not a slope, and a field with no memory is the exact failure
mode the source calls out; the demo currently asserts the causal chain in prose and implements
neither end of it. (2) **Row 36** demonstrates remesh-plus-bake entirely inside the browser factory
on a wobbled icosahedron, so the register's own operative decision — "**Blender remesh+bake remains
the free lane**", the free alternative it recommends over the proprietary hosted product — is
recorded and never exercised, and the panel pair shows highpoly-vs-baked-lowpoly, which cannot show
what the bake bought because the un-baked lowpoly is never rendered beside it. (3) **Row 38** is the
only row whose two carrier bodies were both unread at delivery, and its scene implements exactly one
of the register's six named technique atoms (mask-before-density); splines that "conform to terrain"
run over flat ground, and per-**species** parameter sets, clump geometry with a blade material for
ground cover, and the forest-floor blend that ties scatter back into the ground material are all
absent, so the exhibit reads as a scatter test rather than the source's forest.

**Method for closing them, declared in advance.** Row 46 gets a real Jacobian determinant of the
horizontal displacement map with the fold test `J < 1` driving one shared turbulence scalar, that
scalar feeding both a persistent decaying foam field and the in-integral bubble source, and the
before/after panels retained so the tint-after-absorption failure stays inspectable. Row 36 gets an
independently authored, deterministic, CPU-only headless Blender recipe (voxel remesh plus a
BVH-nearest normal transfer), its `.blend`, its exported artefact, its command and hashes retained
under owned folders, a reopen proof, and a third panel so un-baked and baked lowpoly sit side by
side — declared as *our* adaptation of the register's free lane, **never** as a claim that the
upstream product used Blender, which the evidence contradicts (it is a browser WebGPU app). Row 38
gets its carriers read to EOF first, then species parameter sets, clump/blade ground cover, the
forest-floor blend and a sculpted ground its spline field is projected onto.

**What is deliberately NOT touched:** all sixteen source IDs 35–50 keep their identity, row 44 stays
`blocked`, every surviving limitation stays, no existing assertion is relaxed, and rendered/pixel
acceptance stays OPEN for every factory.

---

## Outcome against this freeze (written at the end of the same window)

**Gap 1 (row 46) — closed.** `46a99247c`. Analytic Jacobian of the applied displacement, verified
against central finite differences; turbulence exactly zero off the fold; one decaying field read as
both surface foam and in-integral bubble source; the shipped sea's inability to fold measured and
reported rather than hidden.

**Gap 2 (row 36) — closed.** `cc43b1819`. Headless Blender 5.1.2 executed, `.blend` + artefact +
command + hashes + reopen proof retained, third panel added so the bake is isolated. Full evidence:
`blender/PROVENANCE.md`.

**Gap 3 (row 38) — closed in the continuation window (2026-09-12, 17:26–), `d02b442a9`.** Both
carrier bodies are now read to EOF in the window that used them: `threejs-procedural-vegetation`
(444 lines, sha256 `7aa8c750…`) and `atomic-acres-procedural-art-authoring` (152 lines, sha256
`19f93b23…`), both matching the packet with no drift, plus the ground-clutter reference. Five of the
register's six technique atoms are implemented against a sculpted terrain that carries the mask's own
features — the watercourse is a carved channel, the glade is a levelled pad — and the sixth (the tree
editor with GLB export) is declared deliberately absent because the register calls it a product
question. Species parameter sets gate on slope and moisture per species, clump geometry under a sheen
blade material carpets what the canopy leaves, and a baked floor blend ties the scatter back into the
ground material with both panels sharing one base bake so the blend is isolated. Re-editability is a
control rather than a prose claim: `update()` steps three authored curve poses and re-derives
everything downstream. Tests 37 → 42; `tsc --noEmit` clean project-wide. Rendered acceptance OPEN.

**Follow-up outside the three gaps, same window: row 36's 97.7 ° outlier is diagnosed.** It is a
vertex-normal weighting convention, not a transfer flip and not a bake defect: Blender's
`mesh.vertex_normals` weights face normals by corner angle, three.js `computeVertexNormals` weights
by area, and at one vertex (v46) a sliver face 90× smaller than its neighbours points the opposite
way while holding the fan's largest corner angle, so corner-angle weighting cancels the sum to 1.85 %
of its magnitude. Reproduced from the committed artefact alone, with no Blender:
`scripts/technique-lab/group-c/blender/inspect_bake_outlier.py` matches Blender's recorded mean to
four decimals. Nothing was re-run or re-exported; the raw number stays in the artefact. Full working:
`blender/PROVENANCE.md`.

---

**Superseded record of the previous window's outcome for gap 3, kept for the audit trail:** One of its two carrier
bodies was read to EOF (`threejs-procedural-vegetation`, 444 lines, sha256
`7aa8c750c461d9741ccd760354664372ff64813b3fa043c0b515202895b9881e`, matching the packet with no
drift), which closes that half of the recorded source hole; `atomic-acres-procedural-art-authoring`
(sha256 `19f93b23…`) remains unread. The scene is unchanged: it still implements only
mask-before-density, still runs over flat ground, and still has no species parameter sets, no clump
geometry or blade material, and no forest-floor blend. It was left alone rather than rushed, because
a half-authored vegetation pass with unverified tests would have cost more than it delivered. The
gap as written above stands as the next unit of work.
