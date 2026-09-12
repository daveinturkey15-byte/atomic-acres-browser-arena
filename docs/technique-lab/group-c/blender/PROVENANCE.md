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

**Unresolved, and recorded as unresolved.** Blender's bake-time maximum of 97.739 ° is a single
vertex measured against Blender's own `vertex_normals` on the remeshed mesh. Recomputing the same
comparison against the normals the exhibit actually replaces — `computeVertexNormals` on the same
positions and indices — gives a maximum of 11.006 ° and zero hemisphere flips. The outlier does not
reproduce, its cause was not diagnosed in this window (a degenerate normal on Blender's side is the
suspicion, not a finding), and it is **not** described anywhere as a nearest-surface transfer flip.
The raw number stays in the artefact JSON.

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
