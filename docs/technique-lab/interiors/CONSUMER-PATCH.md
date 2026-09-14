# Consumer integration patch — wiring the interior set into `arena.ts`

Lane `interiors-night-20260912`, wave 4 (recovery phase), 2026-09-13. Machine `dave-gaming-pc`,
harness `claude`, model `claude-opus-5`, effort `xhigh`.

**This lane did not apply this patch.** `arena.ts` is outside its write paths and nothing here has
been compiled, built or run in a browser. What follows is the exact edit root would make, written
against the real call sites as they stand at lane HEAD `6b41cef51`, with the decisions root has to
take *before* applying it called out. `grep -rn interior-assets src/` still matches only
`src/world-studio/interior-assets/`.

## Decide these three things first

The patch below is mechanical. These are not.

1. **Collision (M3, blocking — and narrower than wave 3 said).** Removing the five anchors from
   `createStudioInteriors(...)` removes their `solids` as well as their meshes, and `arena.ts:34`
   feeds `interiors.solids` into the ballistic surface list. Applied as written, bullets and
   movement pass straight through the Blender sofa, coffee table, credenza, dinette and kitchen
   run.

   Wave 3 wrote *"decide the collision question before filtering anything"*, which reads as though
   "hide the procedural meshes, keep their solids" were available. **It is not.**
   `src/world-studio/interiors/index.ts:147` merges geometry **per role across every anchor of both
   houses** into one `Mesh`, and `:157` points every solid of that role at it. No anchor has a mesh
   of its own. Hiding the mesh carrying the teal sofa also blanks furniture in the *yellow* house,
   which this set does not dress. Measured, not assumed: `catalog.test.ts` →
   *"merges furniture per role across both houses, so no anchor has a mesh of its own"*.

   So the real options are exactly three, and none is this lane's to pick: **(a)** accept non-solid
   Blender furniture, **(b)** author replacement collision for the five footprints, or **(c)** give
   the procedural kit per-anchor geometry so meshes and solids can be separated. The Blender set
   publishes no solids and must not be made to — its measured bounds are presentation AABBs, and
   `interior-assets` deliberately exposes no collider authority. Step 2 below is written for (a),
   the only one that needs no change outside `arena.ts`; it is not a recommendation.
2. **Footprint overhang (M2).** Four of the five anchored props exceed their anchor footprint, the
   sofa by 1.30 m in X — which is defect M1, the double-rotated plinth. `createStudioInteriors`
   throws in that situation; the Blender set is under no such constraint. Do not relax the
   procedural containment check to match.
3. **Hero or props (M8, new this wave).** Load the hero. See "cost" below — the nine props are 51%
   more bytes for identical geometry.

## The patch

Three hunks in `src/world-studio/arena.ts`. Nothing else changes; no other file is touched.

### 1. Import

```diff
-import { createStudioArchitecture } from './architecture';
+import { STUDIO_HOUSES, createStudioArchitecture } from './architecture';
 ...
 import { createStudioBlenderAssets } from './blender-assets';
+import { createStudioInteriorAssets, interiorHousePlacement, publishedAnchorIdsFor, INTERIOR_HERO_ID } from './interior-assets';
 import { createStudioLighting } from './lighting';
```

`STUDIO_HOUSES[0]` is the teal house (`id: 'teal-house'`, `centreX: -20`, `frontSign: 1`). This set
dresses that house only.

### 2. Filter the five dressed anchors out of the procedural kit

`arena.ts:25` currently reads:

```ts
const interiors = createStudioInteriors(architecture.root.userData.furnitureAnchors as StudioInteriorAnchor[]);
```

```diff
-const interiors = createStudioInteriors(architecture.root.userData.furnitureAnchors as StudioInteriorAnchor[]);
+const allAnchors = architecture.root.userData.furnitureAnchors as StudioInteriorAnchor[];
+// The Blender hero dresses these five teal-house anchors, so the procedural pieces would stand
+// inside it. Filtering is the only way to remove them: the kit merges geometry per role across
+// both houses, so there is no per-anchor mesh to hide (ADAPTER.md M3). This also drops their
+// ballistic solids from `interiors.solids` below - decision (a) above.
+const dressedAnchorIds = new Set(publishedAnchorIdsFor(TEAL_HOUSE.id, [INTERIOR_HERO_ID]));
+const interiors = createStudioInteriors(allAnchors.filter(anchor => !dressedAnchorIds.has(anchor.id)));
```

with `const TEAL_HOUSE = STUDIO_HOUSES[0];` added alongside, and `STUDIO_HOUSES` imported from
`./architecture` (`arena.ts:4` already imports `createStudioArchitecture` from there).

**Do not** filter `architecture.root.userData.furnitureAnchors` itself — filter only the argument.
The full array is republished at `arena.ts:31` and passed to `createStudioLighting` at `arena.ts:33`;
the practicals still belong to those rooms whichever furniture stands in them. That is why the diff
introduces `allAnchors` rather than reassigning `userData.furnitureAnchors`.

**If you take option (b) or (c) instead**, this hunk is where it changes: (b) keeps the filter and
adds replacement solids for the five footprints; (c) needs a per-anchor geometry change inside
`src/world-studio/interiors/index.ts` first, after which meshes and solids can be separated and the
filter is not needed at all.

> `publishedAnchorIdsFor` takes the house **`id`** (`'teal-house'`), not the **`side`** (`'teal'`).
> Every wave-3 example had this wrong; `teal-sofa` is an id nothing publishes, and filtering on it
> matches nothing and reports no error. Read it from `STUDIO_HOUSES` rather than spelling it.
> Pinned by `catalog.test.ts` → *"produces ids the built architecture actually publishes"*.

### 3. Load the set, following the `createStudioBlenderAssets` precedent at `arena.ts:90`

```diff
     const heroes = createStudioBlenderAssets({ headingRadians: Math.PI });
+    const interiorSet = createStudioInteriorAssets({
+      ...interiorHousePlacement(TEAL_HOUSE),  // { position: [centreX, 0.08, 0], headingRadians: 0, mirrored: frontSign < 0 }
+      assetIds: [INTERIOR_HERO_ID],
+    });
+    root.userData.worldStudioInteriorStatus = 'loading';
+    void interiorSet.ready.then(() => {
+      // Same retirement check the hero vehicles use: a load that lands after the arena is
+      // replaced must free itself, not attach to a detached root.
+      if (root.parent !== scene) { interiorSet.dispose(); return; }
+      root.add(interiorSet.root);
+      interiorSet.root.traverse(object => {
+        if (!(object instanceof THREE.Mesh)) return;
+        object.castShadow = true; object.receiveShadow = true;
+        raycastMeshes.push(object);
+      });
+      root.userData.worldStudioInteriorStatus = 'ready';
+    }).catch(error => {
+      interiorSet.dispose();
+      if (root.parent === scene) root.userData.worldStudioInteriorStatus = `failed: ${String(error)}`;
+    });
```

`interiorHousePlacement` spreads directly into the options because it returns exactly
`{ position, headingRadians, mirrored }`. Do not hand-write the transform: `house.ts` maps
house-local to world as `x = centreX + frontSign * lx`, `z = lz`, and the mirrored house is a
**reflection** (`scale.x = -1`), not a half turn — a yaw of π would also flip Z and put the kitchen
run at the wrong end of the house.

**`raycastMeshes` is a judgement call.** The vehicles precedent adds its meshes, so this mirrors it.
If raycasts are used for anything with gameplay meaning rather than picking, leave it out: this set
is presentation only.

**Ownership on teardown.** Wherever the arena disposes, call `interiorSet.dispose()`. It is
idempotent, it releases a payload that arrives after teardown rather than attaching it, and it ends
with `root.clear()` — so do not park anything else inside `interiorSet.root`. It does not unparent
`interiorSet.root` from `root`; the caller that added it removes it.

## Wave 5: the loader now corrects fit on the way in

Two additions to the call above, both additive — the snippet still works unchanged.

* **`repairFit` defaults to `true`.** Each payload is corrected before it is attached: the
  `sofa-frame` double rotation is undone (that plinth is 0.65 m outside the anchor footprint in the
  shipped bytes, and it is the whole set's eastmost geometry, so the hero also becomes 0.645 m
  narrower than `catalog.json` says), and the credenza is nudged 12 mm inside its footprint. Pass
  `repairFit: false` to load exactly what the file contains. Both repairs test for the defect first,
  so they go quiet after a re-export that fixes it in Blender.
* **`interiorSet.repairs`** is a `readonly string[]` of what was applied, meaningful once `ready`
  settles. Log it rather than inferring from a frame:
  `void interiorSet.ready.then(() => console.info(interiorSet.repairs.join('; ')))`.
* `assertInteriorFitPolicy()` is exported for a startup assertion: it throws if any asset overruns
  its anchor by more than the measured, registered amount. The dinette's chairs and the kitchen-run's
  door pulls are registered overruns, not failures — `FIT-REPORT.md` has the per-asset numbers.

**One caution about the snippet above, unrelated to fit.** Its `root.parent !== scene` retirement
check is the older arena pattern; root's current staged/fenced finalizer is the authority and should
be used instead. Left in place rather than rewritten because `arena.ts` is outside this lane.

## Cost of the selection (M8)

Measured from the shipped bytes by `catalog.test.ts` → *"transfer and texture cost of a selection"*.

| selection | files | transfer | embedded images | textures created |
|---|---|---|---|---|
| hero | 1 | 4,603,156 B | 12 distinct, 2,548,382 B | 12 |
| all nine props | 9 | 6,968,664 B | 22 copies of those same 12, 4,882,973 B | 22 |

The nine props are the same 182 objects and the same 33,184 triangles as the hero, and cost
**2,365,508 bytes more** — a 51% penalty, of which 2,334,591 bytes is duplicated texture and the
remaining ~31 KB is per-file container overhead. Every GLB embeds its own copy of every map its
materials use: `interior-walnut-albedo` alone is embedded in six of the ten files. Each file is a
separate `GLTFLoader` parse, so those copies become separate `THREE.Texture` objects and separate
GPU uploads — nothing is shared between GLBs.

**Load the hero unless you need a strict subset.** The props exist to let root dress part of a
house, not as the cheaper route; they are the more expensive one. The same lack of sharing is why
per-file disposal is safe: freeing one prop's textures cannot affect another's.

And do not load the hero *with* a prop. They are the same objects sliced two ways, so it draws that
furniture twice, coincident. `createStudioInteriorAssets({ assetIds })` throws on the mix before any
request goes out; the raw `assetPaths` route does not check, so prefer `assetIds`.

## What applying this still will not tell you

No runtime has ever loaded one of these GLBs. `loader.test.ts` stubs the `GLTFLoader` to make the
dispose race deterministic, so 44 passing tests say nothing about three parsing these bytes, how the
set reads under arena lighting, or frame cost. The first genuinely new information comes from
putting one file in front of a real loader in a browser. Falsifier 7 stays open until then.
