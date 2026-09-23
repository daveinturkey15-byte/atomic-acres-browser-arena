# Row 36 — Blender execution evidence (2026-09-12)

Independent execution of the free lane register row 36 itself names: **"local Blender remesh+bake
remains the free lane"** (register row 36, Decision, 2026-08-30, direction unchanged 2026-09-03;
restated in carrier skill `ai-3d-asset-generation-loop` §"Mesh optimization station").

**This is not a claim about the upstream product.** Needle Mesh Baker is a client-side browser
WebGPU app; the register's own re-measurement read its shipped SvelteKit bundle and its renderer
selector. It does not use Blender, nothing here says it does, and no upstream source attribution is
invented. What is demonstrated is the documented alternative, executed by this lane.

## Environment

| Item | Value |
|---|---|
| Blender | 5.1.2, build hash `ec6e62d40fa9`, built 2026-05-19 01:37:34 |
| Binary | `C:/Program Files/Blender Foundation/Blender 5.1/blender.exe` |
| Mode | `--background --factory-startup`, CPU only. No render, no GPU bake, no window. |
| Launcher | `scripts/technique-lab/group-c/blender/run_blender.py` |
| Recipe | `scripts/technique-lab/group-c/blender/remesh_bake.py` |
| Lock | `C:/Users/david/Documents/Codex/2026-09-11/p-le/work/extra-quality-20260912/blender-execution.lock`, acquired by `O_EXCL` with tag `claude-group-c-quality-20260912` + PID + ISO time, released only on tag/PID match. Three acquisitions, three releases, no contention observed, no foreign lock touched, no process killed. |

## Command (build)

```
blender --background --factory-startup \
  --python scripts/technique-lab/group-c/blender/remesh_bake.py -- \
  --mode build \
  --json docs/technique-lab/group-c/blender/source-36-remesh.artifact.json \
  --ts   src/map3/technique-lab/demos/group-c/assets/source-36-blender-remesh.ts \
  --blend docs/technique-lab/group-c/blender/source-36-remesh.blend
```

## Recipe

1. Highpoly authored in Blender: icosphere, 5 subdivisions, radius 1.0, displaced by a fixed
   three-octave analytic field (no RNG, no noise texture, no import, no external asset).
   2,562 vertices / 5,120 triangles.
2. Reduced by Blender's own OpenVDB remesher, `bpy.ops.object.voxel_remesh`, voxel size **0.22 m**,
   adaptivity 0. That voxel size is the register's "silhouette control".
   464 vertices / 924 triangles — **81.95 %** reduction.
3. Normal bake: `mathutils.bvhtree.BVHTree.FromPolygons` over the highpoly, `find_nearest` per
   lowpoly vertex, then `barycentric_transform` of that triangle's three vertex normals. A
   nearest-surface interpolated transfer, the same class of operation as Blender's Data Transfer
   modifier, written out so the numbers are inspectable.
4. Export: Int16 positions about a centre/extent, Int8 normals, Uint16 indices, base64 in a typed
   TS module — no loader, no fetch, no runtime asset dependency.

## Measured

| Statistic | Value |
|---|---|
| Max transfer distance | 1.229e-07 m (the remesh output lies on the highpoly isosurface) |
| Mean transfer distance | 1.910e-08 m |
| Max deviation, baked vs Blender's own lowpoly normals | 97.739 ° |
| Mean deviation, baked vs Blender's own lowpoly normals | 3.561 ° |
| Max deviation, baked vs the normals THIS SCENE replaces | 11.006 ° |
| Flipped vertices (opposite hemisphere), this scene | **0** |

**Diagnosed 2026-09-12 (continuation window). It is a vertex-normal weighting convention, not a
transfer flip.** Both numbers are correct measurements of different quantities, and the difference is
now reproducible from the committed artefact alone, with no Blender and no GPU:

```
python scripts/technique-lab/group-c/blender/inspect_bake_outlier.py
```

The script decodes the committed lowpoly (464 vertices, 924 triangles; **0 degenerate triangles, 0
orphan vertices**) and recomputes each vertex's own normal three ways, then compares each against the
committed baked normals:

| Weighting of the face normals | Max deviation | Mean | Vertices past 90 ° |
|---|---|---|---|
| **Corner angle** — what Blender's `mesh.vertex_normals` uses | **97.924 °** | **3.561 °** | 1 |
| **Face area** — what three.js `computeVertexNormals` uses | 11.006 ° | 4.180 ° | 0 |
| Unweighted | 13.436 ° | 3.635 ° | 0 |

The corner-angle row reproduces Blender's recorded mean to four decimal places (3.561 vs **3.5609**)
and its maximum to within 0.19 ° (97.92 vs **97.7394**; the residue is the Int8 normal quantisation
in the artefact, amplified precisely because this vertex's direction is ill-conditioned — see below).
The area-weighted row reproduces the scene's 11.006 ° exactly. So the 97.7 ° was never a property of
the bake: it is the angle to a *differently averaged* vertex normal.

**The one vertex, exactly.** v46, at (−0.1993, −0.0097, −1.0399), has a four-face fan:

| Face | Normal | Area | Corner angle at v46 |
|---|---|---|---|
| (60, 46, 59) | (−0.313, −0.016, −0.950) | 0.00540 | 40.5 ° |
| (60, 47, 46) | (−0.295, −0.013, −0.955) | 0.00702 | 58.8 ° |
| (152, 59, 46) | **(+0.288, −0.014, +0.957)** | **0.00006** | **106.6 °** |
| (152, 46, 47) | (−0.194, −0.135, −0.972) | 0.00001 | 7.4 ° |

Two ordinary faces point −Z; a near-degenerate sliver 90× smaller points almost exactly the opposite
way, and its corner at v46 is the *largest* angle in the fan. Weighted by area the sliver is ignored
(‖Σ‖/Σw = 0.9910, i.e. the fan agrees) and the vertex normal is (−0.303, −0.015, −0.953), 9.01 ° from
the baked normal. Weighted by corner angle the sliver outvotes both real faces, the sum cancels to
1.85 % of its possible magnitude (‖Σ‖/Σw = 0.0185) and what survives is numerical residue pointing
(−0.182, −0.982, +0.055) — a direction **no face in the fan has** — which is 97.92 ° from the baked
normal (−0.292, +0.142, −0.946).

**What this changes and what it does not.** The bake is not implicated: the baked normal at v46 is
9.01 ° from the area-weighted surface normal, in line with the rest of the mesh. Nothing is re-run,
re-tuned or re-exported, and the raw 97.739 ° stays in the artefact JSON exactly as Blender recorded
it. The voxel remesher emitting occasional slivers is a real property of this recipe at a 0.22 m
voxel, retained rather than smoothed away. It is still **not** a nearest-surface transfer flip, and
it is still not described as one anywhere.

## Hashes (build run)

| File | sha256 | bytes |
|---|---|---|
| `source-36-remesh.artifact.json` | `ec45b076e8a3a991e554b6d96ae727ca72e2ea82397f8ec0b4799cea350ac944` | — |
| `assets/source-36-blender-remesh.ts` | `db571f244e445d59a455756016f14c45508b41f1befb8cae0de8265cc7b0cc16` | 87,091 |
| `source-36-remesh.blend` | `0e69b5ef2155d813680ce533c425429d80051960fd758216eb65dd298e28a9f3` | 246,423 |

## Reopen proof

```
blender --background --factory-startup --python ...remesh_bake.py -- \
  --mode reopen --blend docs/technique-lab/group-c/blender/source-36-remesh.blend
```

A fresh Blender opened the retained `.blend`, found objects `["highpoly", "lowpoly_voxel_remesh"]`,
and **re-derived the bake from them**: identical counts (2562/5120, 464/924) and identical bake
statistics to the build run, with the re-exported lowpoly buffer hashing to
`d7c3cef22d1de46e6298ddf7a7ddf98e96b96b909e8c3d6316dcf1a1d5c5b224`. The committed `.blend` therefore
contains the meshes the committed data module was made from.

## Licence

Nothing of the upstream product is used, run, purchased, downloaded or reverse-engineered. The
highpoly, the recipe and the exported data are this lane's own work. Blender itself is GPL and is
used as a tool; no Blender code, asset or template is redistributed here.

## What the CPU check enforces

`group-c-demos.test.ts` decodes the committed module, asserts the counts match what Blender
reported, asserts every index addresses an existing vertex, asserts the baked normals are unit
length, and cross-checks the mean deviation against the value Blender recorded at bake time — which
is what makes the committed typed data provably that run's output rather than something regenerated
differently. Rendered acceptance remains OPEN.
