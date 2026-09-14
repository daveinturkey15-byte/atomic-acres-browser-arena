# Interior asset adapter — placement, ownership and the mismatches root inherits

Lane `interiors-night-20260912`, wave 3 (morning phase), 2026-09-13. Machine `dave-gaming-pc`,
harness `claude`, model `claude-opus-5`, effort `xhigh`. Branch
`contrib/dave-gaming-pc/claude/interiors-night-20260912`, dispatched from
`6b41cef51` (the orchestrator's checkpoint of `6e9b2cafd`).

This wave added no geometry and re-ran no Blender. Every GLB, texture, report and render from
wave 2 is byte-for-byte as it was — `catalog.test.ts` re-hashes all ten and fails if that stops
being true. What is new is a typed adapter around them, tests that measure the claims instead of
repeating them, and the list of mismatches below.

> **Wave 4 (recovery phase, same day) — review of the above.** Re-ran the suite, re-derived the
> placement, ownership and extension claims from source, and found them accurate: `house.ts:148`
> `wx() = centreX + frontSign * lx` with Z unchanged, `house.ts:981` `π − yaw` for anchors only, and
> `KHR_texture_transform` genuinely implemented by the installed loader
> (`three@0.185.1 GLTFLoader.js:524/2001`), so the required-extension risk is closed. No defect was
> found in the loader or the catalog and **no GLB, no build script and no source asset was
> touched.** Three changes: **M4 named a house id that does not exist** and is corrected below;
> **M3 offered an alternative that does not exist** and is narrowed below; and **M8**, the
> hero-versus-props cost, is new. Tests went 39 → 45. The consumer wiring root asked for is
> `CONSUMER-PATCH.md`.

## What was added

| file | what it is |
|---|---|
| `src/world-studio/interior-assets/catalog.ts` | Typed catalog of the ten assets: id, path, kind, the `house.ts` anchor each dresses, measured house-local bounds, plus selection validation and the anchor-filter helper. |
| `src/world-studio/interior-assets/index.ts` | Unchanged loader contract, plus `assetIds` (checked selection), `mirrored`, `interiorHousePlacement`, `resolveInteriorAssetUrl`, and a corrected mirror comment. |
| `src/world-studio/interior-assets/catalog.test.ts` | 32 tests measured from the shipped bytes, from `house.ts`, and (wave 4) from the built architecture and the procedural kit. |
| `src/world-studio/interior-assets/loader.test.ts` | 13 tests driving the load/dispose race through a stubbed GLTFLoader. |
| `docs/technique-lab/interiors/CONSUMER-PATCH.md` | Wave 4. The exact `arena.ts` edit root would apply, the three decisions that precede it, and the selection cost. Not applied — `arena.ts` is outside this lane's write paths. |

Nothing is wired into `arena.ts`. `grep -rn interior-assets src/` still matches only this folder
and its own tests, which is the state this lane is supposed to hand over in.

## The two facts that decide the integration

**1. The nine props are an exact partition of the hero, not alternatives to it.**
`build_interiors.py` exports the hero from all 182 objects, then exports nine disjoint subsets of
*those same objects* by name prefix, with `use_selection=True` and no re-origin. Measured from the
containers, not from the build report: object counts sum to 182, triangles to 33184, vertices to
16956, and the union of the nine prop AABBs equals the hero AABB on **all six faces**. Loading the
hero together with any prop draws that furniture twice, coincident. `selectInteriorAssets` throws
on the mix rather than leaving it to be noticed in a frame.

**2. Every GLB is authored in the house-local frame, already at its anchor.** No prop sits at its
own origin. `interior-prop-kitchen-run.glb` measures X `[-6.525, -5.861]`, Z `[2.98, 7.42]` — the
4.4 × 0.65 m footprint at anchor `(-6.2, 5.2)` under yaw π/2, read out of the container. Props are
placed by loading them, not by positioning them.

## Authoritative placement

House-local metres, `y = 0` at floor level, bounds composed from the GLB node transforms.
Accessor `min`/`max` alone are mesh-local and report about ±2.22 m for a 14 m room.

| asset | dresses anchor | X | Y | Z |
|---|---|---|---|---|
| `interior-hero-teal-living-kitchen` | all five | −6.590 … 6.500 | −0.0054 … 2.5314 | −7.5675 … 7.420 |
| `interior-prop-sofa` | `sofa` | 4.300 … 6.500 | −0.0054 … 0.9511 | −5.655 … −3.145 |
| `interior-prop-coffee-table` | `coffee-table` | 2.930 … 4.270 | −0.0031 … 0.4906 | −4.6137 … −4.1863 |
| `interior-prop-credenza` | `tv-unit` | 0.780 … 1.262 | −0.0020 … 1.3000 | −5.180 … −3.620 |
| `interior-prop-armchair` | — | 2.9479 … 3.8521 | −0.0031 … 0.9605 | −7.0846 … −6.1696 |
| `interior-prop-kitchen-run` | `kitchen-run` | −6.525 … −5.861 | 0 … 2.240 | 2.980 … 7.420 |
| `interior-prop-fridge` | — | −6.590 … −5.855 | 0 … 1.710 | 1.690 … 2.410 |
| `interior-prop-dinette` | `dining-table` | −4.5754 … −2.2246 | 0 … 0.8647 | −4.4554 … −2.3446 |
| `interior-prop-area-rug` | — | 2.230 … 5.570 | 0.001 … 0.020 | −5.670 … −3.330 |
| `interior-prop-accents` | — | −1.712 … 5.160 | 0 … 2.5314 | −7.5675 … −0.888 |

**Two prop names do not match their anchor names.** `interior-prop-credenza` dresses `tv-unit`,
and `interior-prop-dinette` dresses `dining-table`. A filter written against prop names rather
than `InteriorAssetEntry.anchorId` silently keeps two procedural pieces under the Blender ones.

**Four props have no published anchor.** The armchair (3.4, −6.6, yaw 28°), fridge (−6.25, 2.05,
yaw π/2), area rug (3.9, −4.5) and accents (table lamp 1.05/−6.1; starburst clock −0.6/−7.55 at
2.15 m; wall art 4.9/−7.55 at 1.72 m; snake plant −1.5/−1.1) were placed at coordinates
`build_interiors.py` chose for itself. They have no procedural counterpart to remove and no
published anchor authority behind them, so moving one is an owner decision, not a build change.

## World transform, and a correction

`house.ts` maps house-local to world with `x = centreX + frontSign * lx`, `z = lz`, and lifts
furniture to `GROUND_FLOOR_Y = 0.08`. `interiorHousePlacement({ centreX, frontSign })` returns
exactly that, so the transform is derived from the same two numbers rather than re-guessed.

**The mirrored (yellow) house needs a reflection, not a rotation.** An earlier comment in
`index.ts` said the mirrored house is reached by `yaw → π − yaw`. That rule is `house.ts`'s own and
it is correct *for an anchor's orientation*, but it is not a transform this group can apply.
`frontSign = −1` maps `(x, z)` to `(−x, z)`; a yaw of π maps it to `(−x, −z)`, which also flips Z
and would put the kitchen run at the wrong end of the house. The `mirrored` option applies
`scale.x = −1`. three 0.185.1 flips triangle winding for a negative-determinant world matrix
(`WebGLRenderer`: `object.matrixWorld.determinantAffine() < 0`, verified in `node_modules`), so the
`FrontSide` closed-volume contract survives the reflection. `loader.test.ts` asserts both the
correct mapping and the wrong one, so the distinction cannot quietly regress.

This has never been run for the yellow house, because nothing has run at all — see "still untrue".

## Disposal and ownership

`dispose()` is broader than it looks, so the boundary is now stated in `index.ts` and tested:

* **Everything under `root` belongs to the loader.** `dispose()` ends with `root.clear()`, so a
  child a caller parents *into* `root` is detached — though not disposed, because the loader never
  owned it. Park sibling content next to `root`, not inside it.
* **A payload that arrives after `dispose()` is released, not attached.** This is the case a real
  teardown hits, and the one that leaks GPU memory if it is handled by assuming it cannot happen.
  `loader.test.ts` drives it deterministically by resolving the stubbed loader *after* teardown and
  asserting the geometry, both materials and the texture each got exactly one `dispose()`.
* **A partial failure still leaves the loader owning what landed.** With two assets where the
  second rejects, `ready` rejects and the first is attached; `dispose()` then frees it.
* **`dispose()` is idempotent** — three calls, one disposal each.
* **`root` is not removed from its parent**, because the loader did not attach it. The caller that
  parented it owns unparenting it.

## Exact remaining mismatches

> **Wave 5 (recovery, same day) — M1 and M2 are answered as far as CPU work can answer them. See
> `FIT-REPORT.md`.** The sofa plinth is repaired **at load time** (worst face +0.650 → +0.155 m) and
> fixed in `build_interiors.py` for the next export; the credenza is nudged 12 mm and now fits; the
> coffee-table top is fixed at source (1.34 → 1.20 m) and still overruns in the shipped bytes; the
> kitchen-run and dinette overruns are deliberately kept and registered with their measured values.
> Three corrections to what M1/M2 say below: **(a)** measured per face rather than per span, it is
> **five** of five anchored props that overrun, not four — the credenza's 12 mm was hidden by the
> span measure; **(b)** the plinth was the whole set's eastmost geometry, so repairing it narrows
> the *hero* from 13.090 m to 12.445 m across; **(c)** `build_rug` does **not** have the same defect
> shape — it never calls `_rotate_group`, so its yaw is applied once, and nothing was changed there.
> 70 tests in three files; still no Blender, no browser, no commit.

**M1 — DEFECT: the sofa plinth is rotated twice.** `build_interiors.py:417` sets
`frame.rotation_euler.z = yaw`, then `_rotate_group` at `:478` applies `+= yaw` to every part, so
`sofa-frame` alone receives the yaw twice. Read straight out of `interior-prop-sofa.glb`: that node
sits at **180°** while all fifteen others sit at −90° (legs at −89.36/−90.64, which is their
authored ±0.03 splay). Its 2.20 × 0.88 m walnut plinth therefore lies **crosswise** under a sofa
whose body runs along Z, protruding ≈0.64 m past the arms at each end, and it accounts for the
whole of the sofa's 1.30 m X overhang in M2. Not fixed here: correcting the script without
re-running Blender would make every pinned sha256 describe geometry the script no longer produces,
and this lane may not run Blender. Pinned by test so it cannot change silently. `build_rug` at
`:773`/`:775` has the same `= yaw` then `+= yaw` shape and is currently harmless only because it is
called with `yaw = 0`; a future re-anchor of the rug would reproduce M1. **One Blender run fixes
both.**

**M2 — the Blender set exceeds published anchor footprints; the procedural kit cannot.**
`createStudioInteriors` throws `Furniture exceeds anchor footprint` if any part leaves its anchor
box. The Blender set is under no such constraint. Declared span is the footprint after the anchor
yaw; Δ is measured minus declared, metres:

| prop | anchor | declared X × Z | measured X × Z | ΔX | ΔZ |
|---|---|---|---|---|---|
| sofa | `sofa` 2.2 × 0.9 @ −90° | 0.900 × 2.200 | 2.200 × 2.510 | **+1.300** | +0.310 |
| coffee-table | `coffee-table` 1.2 × 0.6 @ 0° | 1.200 × 0.600 | 1.340 × 0.427 | +0.140 | −0.173 |
| credenza | `tv-unit` 1.6 × 0.5 @ +90° | 0.500 × 1.600 | 0.482 × 1.560 | −0.018 | −0.040 |
| kitchen-run | `kitchen-run` 4.4 × 0.65 @ +90° | 0.650 × 4.400 | 0.664 × 4.440 | +0.014 | +0.040 |
| dinette | `dining-table` 1.6 × 1.0 @ 0° | 1.600 × 1.000 | 2.351 × 2.111 | +0.751 | +1.111 |

Of these, the sofa's ΔX is M1. The dinette's is ordinary — the anchor footprint is the *table* and
the four chairs stand outside it. Arms and a worktop lip account for the rest. Nothing here was
relaxed to pass: the measured overhang is pinned, so a change to any of it fails the test. **Root's
decision, not this lane's:** either the anchor footprints are advisory for Blender dressing, or
these props need re-authoring inside them. Whichever is chosen, do not weaken the procedural
containment check to match.

**M3 — replacing the five anchors deletes their ballistic solids, and there is no way around it.**
`createStudioInteriors` returns `solids` (`StudioInteriorSolid` with a `Box2` and a
`BallisticMaterialId`). This set returns none, by design — it is presentation only. So the filter
wave 2 recommended (remove `sofa`, `coffee-table`, `tv-unit`, `dining-table`, `kitchen-run` from the
array passed to `createStudioInteriors`) removes collision from those five footprints as well as
their geometry. Bullets and movement would pass through the Blender furniture. Use
`publishedAnchorIdsFor(houseId, ids)` to get the exact ids to filter.

**Corrected in wave 4.** This entry previously ended "decide the collision question before filtering
anything", which implies the obvious alternative — hide the procedural meshes, keep their solids —
is available. It is not. `src/world-studio/interiors/index.ts:147` merges geometry **per role across
every anchor of both houses** into one `Mesh`, and `:157` assigns that shared mesh to every solid of
the role. No anchor has a mesh of its own, so hiding the mesh that carries the teal sofa also blanks
furniture in the yellow house, which this set does not dress. Measured against the built
architecture, not read off the source. The genuine options are: accept non-solid furniture, author
replacement collision for the five footprints, or give the procedural kit per-anchor geometry.
All three are root's; see `CONSUMER-PATCH.md`.

**M4 — anchors are published prefixed by the house `id`, which is not the house `side`.**
`house.ts` emits `` id: `${id}-${anchorId}` ``, so `endsWith('-sofa')` would strip the yellow
house's sofa too, and this set dresses only the teal house. `publishedAnchorIdsFor` takes the house
id for that reason.

**Corrected in wave 4 — this entry named the wrong id.** It said the published ids are `teal-sofa`
and `yellow-sofa`. They are not. `STUDIO_HOUSES[0].id` is **`teal-house`**, so the published anchor
is **`teal-house-sofa`**; `teal` is the house's `side`, not its `id`. Every wave-3 example had this
wrong — this table, the `catalog.ts` comment, the `HANDOFF.md` wiring note and the test's own
expected values. `publishedAnchorIdsFor` itself was always correct, because it takes the house id as
a parameter, but an integrator copying the documented example would have filtered on ids nothing
publishes: the filter matches nothing, raises nothing, and leaves all five procedural pieces
standing inside the Blender furniture — the exact double-draw this entry exists to prevent. Now
bound to the built architecture by `catalog.test.ts` → *"produces ids the built architecture actually
publishes, not a plausible-looking one"*, which asserts `teal-sofa` is absent and `teal-house-sofa`
present. Read the id from `STUDIO_HOUSES`; do not spell it.

**M5 — `inspect_glb.py --textures` defaults to `None`, and the check silently inverts.** Run
without it, `source_hashes` is empty, every image is "unmatched", and the audit prints
`FAIL embedded albedo not byte-identical to source-assets` for all six albedo maps on a perfectly
good export. With `--textures source-assets/world-studio/interiors/textures` all ten files pass at
6/12, 2/4 or 1/2 images matched, exactly as wave 2 recorded. A gate that reads FAIL by default is a
broken instrument; the flag is not optional. All 12 source PNGs still match their pins in both
`texture-report.json` and `build-report.texturePins` (12/12, re-verified this wave).

**M6 — carried forward, unchanged and still open.** Byte-level reproducibility (index ordering;
`PYTHONHASHSEED=0` still untested), `KHR_texture_transform` as a required extension, the thumbnail
being a preview-rig fiction, no second critic, no owner acceptance, no GLM prompt recovery, no
yellow-house palette variation, no upstairs room. See `HANDOFF.md` falsifiers 5–11.

**M8 — the nine props cost 51% more than the hero they partition (new in wave 4).** Every GLB
embeds its own copy of every map its materials use, and nothing is shared between files.

| selection | files | transfer | embedded images | textures created |
|---|---|---|---|---|
| hero | 1 | 4,603,156 B | 12 distinct, 2,548,382 B | 12 |
| all nine props | 9 | 6,968,664 B | 22 copies of those same 12, 4,882,973 B | 22 |

Identical geometry — the same 182 objects and 33,184 triangles — for **2,365,508 bytes more**, of
which 2,334,591 B is duplicated texture and the remaining ~31 KB is per-file container overhead.
`interior-walnut-albedo` alone is embedded in six of the ten files. Each file is a separate
`GLTFLoader` parse, so those copies become separate `THREE.Texture` objects and separate GPU
uploads. The props exist to let root dress *part* of a house; they are not the cheaper route, they
are the more expensive one. **Load the hero unless a strict subset is needed.** The same absence of
sharing is why per-file disposal is safe: freeing one prop's textures cannot affect another's.
Measured from the shipped bytes by `catalog.test.ts` → *"transfer and texture cost of a selection"*.

**M7 — the 5.4 mm dip below the floor plane is real.** Hero, sofa, coffee table, credenza and
armchair all bevel slightly through `y = 0`; deepest is −0.0054 m. Invisible, and well inside the
80 mm the loader lifts by, but an integrator assuming a strictly non-negative set is assuming
something false. Pinned by test.

## What this wave verified, and how

```
node node_modules/vitest/vitest.mjs run src/world-studio/interior-assets --reporter=dot
python scripts/blender/world-studio/interiors/inspect_glb.py \
  --textures source-assets/world-studio/interiors/textures \
  --glb public/assets/world-studio/blender/interiors/*.glb
```

39 tests pass in the two new files (**45 after wave 4**, all in the same two files); the whole
`src/world-studio` tree is 175 passing across 17
files, unchanged from before this wave apart from the additions. The container audit passes on all
ten GLBs: no cameras, no lights, `asset.version` 2.0, only `KHR_texture_transform` required, and
all ten file hashes equal to the pins in `catalog.json` and `build-report.json`.

One honest note on that run. Full-tree `vitest run src/world-studio` invocations crash
intermittently on this machine: `[vitest-pool]: Worker forks emitted error / Worker exited
unexpectedly`, with `FATAL ERROR: Committing semi space failed. Allocation failed - JavaScript
heap out of memory` and `Zone Allocation failed` in the output, a raw V8 stack dump, and a pass
count that varies run to run. **No assertion ever failed** — forked workers die mid-run. It is a
host memory-pressure OOM, not a test defect, and it reproduced on an invocation that **excluded**
both new files. Three full-tree invocations completed cleanly at 175/175, and
`vitest run src/world-studio/interior-assets` is 39/39 in ~330 ms every time.

Recorded rather than filed as green-and-forgotten, because a pool that dies silently can hide a
real failure later: a run that reports "13 passed (17)" with four unhandled pool errors has **not**
passed, and must be re-run or narrowed, never read as green. Narrowing to one directory is the
reliable workaround. `--poolOptions.forks.maxForks=N` is *not* accepted by vitest 4.1.9's CLI here
— it exits with a parse error. Root cause beyond "the host was out of memory" is not investigated:
out of scope for this lane.

No Blender, no GPU, no browser, no build, no `tsc`, no server, no dependency install, no commit.

## Still untrue, and this adapter does not change it

**No runtime has ever loaded one of these GLBs.** `loader.test.ts` stubs the GLTFLoader — it proves
the lifecycle, the race and the ownership boundary, and it proves nothing at all about three
parsing these bytes, about how the set reads under arena lighting, or about frame cost. Falsifier 7
stays open. The first genuinely new information will come from putting one file in front of a real
`GLTFLoader` in a browser, which is not this lane's to do.
