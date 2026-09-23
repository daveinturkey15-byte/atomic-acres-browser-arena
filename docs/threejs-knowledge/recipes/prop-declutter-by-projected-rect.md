# Prop Declutter by Projected Rect

A deterministic, CPU-verifiable methodology for identifying, measuring, and removing decorative scene clutter in Three.js game levels without breaking gameplay cover, raycasting, or visual variety.

## 1. The Core Problem: Why CPU Raycasts Fail for Occlusion

Determining whether an interior prop is visible to a player cannot rely on CPU-side raycasting in complex scenes with batched or instanced geometry. In Atomic Acres `nuketown2`, CPU raycasts against the built scene return severe phantom hits:
- `nuketown2 north perimeter wall end` and `nuketown2 south perimeter wall end` both hit at 1.33 m from an eye standing inside the north living room.
- `nuketown2-avenue-sector-2-L0` hits at 10.70 m straight through an opaque building wall.
- `forest-conifers` hits at 59.35 m through the entire house structure.

Instanced meshes, merged batches, and custom bounding hierarchies corrupt CPU-side traversal. Instead of unreliable raycast tests, use **geometric projection to pixel coordinates paired with pixel-delta capture adjudication**.

## 2. Projection Mathematics

To map an authored 3D BoxGeometry body to its 2D screen footprint for a camera:

1. Transform the 8 local box vertices to world space coordinates:
   $$V_{world} = M_{world} \cdot V_{local}$$
2. Check for camera near-plane clipping in view space:
   $$V_{view} = M_{view} \cdot V_{world}$$
   If any vertex has $V_{view}.z > -z_{near}$ (where $z_{near} \approx 0.02\text{ m}$ or $-0.05\text{ m}$ margin), the geometry clips through the near plane.
3. Project the world points into Normalized Device Coordinates (NDC):
   $$V_{ndc} = P \cdot M_{view} \cdot V_{world}$$
   where $P$ is the camera projection matrix.
4. Map NDC $[-1, 1]$ to screen pixel coordinates $(W, H)$:
   $$x_{pixel} = (V_{ndc}.x + 1) \times 0.5 \times W$$
   $$y_{pixel} = (1 - V_{ndc}.y) \times 0.5 \times H$$
5. The projected bounding box is $[\min(x), \min(y)] - [\max(x), \max(y)]$. Clip the rect to $[0, 0, W, H]$ to determine the on-screen pixel footprint.

If a projected rect maps to a flat plaster color in the captured frame (e.g. 61 distinct colors across 19,796 pixels), the body is proven **occluded** by foreground architecture. If the rect contains high variance and removing the body changes pixels, the body is **visible**.

## 3. The Traps

### 3.1 The Presentation Batcher Trap
`batchPresentationOnlyBoxes` merges BoxGeometry meshes sharing identical materials and shadow configurations into static batch meshes (`*-presentation-batch-N`). It then sets `mesh.visible = false` on every source mesh while keeping it in the scene graph for inspection.
- In `nuketown2`, **3,809 of 4,441 meshes** report `visible === false` yet render fully on screen via batches.
- Never filter or discard meshes based on `mesh.visible`.
- Removing a mesh from the authored prefab eliminates it from the batch automatically during level assembly.

### 3.2 The Dual-Package `instanceof THREE.Mesh` Trap
When `node_modules` is shared or symlinked, standalone CLI execution via `tsx` or Node may resolve `three/build/three.cjs` while arena source code resolves the ESM build.
- Traversing with `node instanceof THREE.Mesh` returns **0 of 4,441 meshes**.
- Traversing with duck-typing `node.isMesh === true` returns **4,441 of 4,441 meshes**.
- Always verify nodes with `node.isMesh === true` and `node.geometry?.type === 'BoxGeometry'`, never `instanceof`.

### 3.3 `presentationOnly` Is Not a Removal Permit
In `nuketown2-arena.ts`, `pair()` silently drops `options.presentationOnly` because `box()` does not propagate it. Only `pairKit()` stamps `userData.presentationOnly = true` post-hoc on kit prefabs.
- Author-decorated props like `house living art frame` and `house living wall clock rim` have `presentationOnly: undefined` despite having zero colliders and zero shot surfaces.
- A removal permit must be evaluated strictly against authoritative registries:
  ```ts
  const removable = (hasCollider === false) && (typeof userData.ballisticSurfaceId !== 'string');
  ```
- Any body matching a collider AABB or carrying a `ballisticSurfaceId` is gameplay cover and must never be deleted.

## 4. The Two Instruments

1. `scripts/qa/inventory-arena-interior-props.ts`:
   - CPU-only, builds the arena in a headless `THREE.Scene`.
   - Iterates all BoxGeometry meshes using `isMesh`.
   - Checks AABB matches against `map.colliders` within $10^{-3}\text{ m}$ tolerance.
   - Checks `userData.ballisticSurfaceId`.
   - Projects 8 world corners through frozen review cameras to emit pixel rects and clipped screen areas.
   - Computes whole-frame `propCoveragePx` via the union mask of removable prop rects.

2. `scripts/qa/measure-rect-delta.mjs`:
   - CPU-only image comparison using `sharp`.
   - Computes ITU-R BT.709 relative luminance:
     $$Y = 0.2126R + 0.7152G + 0.0722B$$
   - Calculates `changedFraction8`: fraction of pixels where $|\Delta Y| > 8 / 255$.
   - Segregates deltas into `inside` the target rect, `outside` a 12 px dilation of the rect, and `whole` frame.
   - Tracks 24-bit distinct RGB counts to ensure frames do not collapse or flatten.

## 5. Decision Thresholds and Noise Floor

Deterministic review cameras have an empirical same-build noise floor:
- Whole frame mean absolute luma delta: $0.085 - 0.098$ ($< 0.1 / 255$).
- Whole frame `changedFraction8`: $0.00008 - 0.00010$ (fewer than 95 pixels out of 921,600).
- Candidate rect noise floor: $0.00000$.

Because the noise floor is essentially zero, thresholds are set orders of magnitude above noise:
- **Visible removal (inside rect):** `inside.changedFraction8 >= 0.15` (1,500x noise floor).
- **Occluded removal (e.g. hidden wall art):** `inside.meanAbsDeltaLuma <= 0.50` and `inside.changedFraction8 <= 0.001`.
- **Frame richness preservation:** `candidateDistinctRGB >= 36000` (above the 25,450 variety floor).
- **Non-interior stability:** Diff tool verdict must be `MATCH` or `DYNAMIC_ONLY` on all non-interior stations.
