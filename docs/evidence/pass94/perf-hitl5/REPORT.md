# PASS 94 - perf lane (HITL 5): the HITL 4 frame-time regression

Lane: Fable (high), branch `contrib/dave-gaming-pc/claude/perf-hitl5`, worktree
`C:/Users/david/projects/aa-claude-perf`, cut from `7733d37b` (HITL 4 candidate).
Owner verdict under test: HF-491, 2026-09-04 17:20, after playing HITL 4 on
`http://127.0.0.1:4300`: "the FPS is really bad" - PASS 93 (the published build)
he called smooth. Time box 55 min (17:15-18:10); integrator merges ~18:35.

## Method (measured, not guessed)

- Harness: `scripts/qa/hf399-fps-phase-probe-cdp.mjs` (existing). Headless
  installed Chrome on the real WebGPU device, `--disable-frame-rate-limit
  --disable-gpu-vsync`, so the numbers are frame COST, not a vsync cap.
  2560x1440, the machine-default graphics profile (resolves to HIGH on this
  16-core / 32 GB box: `graphicsPreset: high`, `EFFECTIVE: HIGH`, backend
  webgpu), Solo, bots frozen, 8 s warm-up, 10 s per phase.
- A = HITL 4 served from the untouched `:4300` preview (head `7733d37b`).
  B = PASS 93 live, `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass93/`.
- Runs interleaved A, B, A, B so ComfyUI/background noise cancels. One browser
  at a time, closed between runs. GPU load before each run is in
  `probe/log.txt`: 14-17 % / ~1.4 GB (ComfyUI idle) for A1/B1 on both arenas,
  0 % / 1.5-2.9 GB for A2/B2 (ComfyUI loading a model). All runs on the same
  machine minutes apart.
- Bisect: `scripts/qa/perf-hitl5-bisect-cdp.mjs` (NEW, headless, mute). ONE
  session, one boot, then a ladder of RUNTIME toggles applied to the live scene
  through `__ATOMIC_ACRES_DEBUG__.sampleSceneGraph()`, each sampled 8 s and
  REVERTED, so a toggle's delta is the per-frame cost of the thing it hides.
  The baseline rung also takes a CDP CPU profile (JS busy ms per frame, top
  self-time functions) and reads the presentation counters. It also writes a
  scene census by material (`bisect/*-census.json`).

Raw: `probe/*.json` + `probe/summary.md` (A/B phases), `bisect/*.json`.

## Numbers - A/B, before any fix

| run | arena | phase | fps | p50 ms | p95 ms | p99 ms | draws | tris | instances | pipelines | long tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 HITL 4 | nuketown2 | deployed-idle | 59.0 | 16.7 | 32.2 | 33.7 | 167 | 326k | 10835 | 418 | 0 |
| A1 HITL 4 | nuketown2 | move | 53.9 | 18.3 | 32.4 | 34.6 | 158 | 325k | 10699 | 419 | 2 |
| A2 HITL 4 | nuketown2 | deployed-idle | 62.9 | 15.5 | 22.6 | 34.2 | 167 | 326k | 10834 | 419 | 0 |
| A2 HITL 4 | nuketown2 | move | 54.9 | 17.2 | 35.9 | 42.0 | 158 | 325k | 10686 | 420 | 2 |
| B1 PASS 93 | nuketown2 | deployed-idle | 79.4 | 12.3 | 15.5 | 29.5 | 125 | 271k | 12018 | 250 | 0 |
| B1 PASS 93 | nuketown2 | move | 67.3 | 14.6 | 30.2 | 32.9 | 121 | 271k | 12004 | 250 | 1 |
| B2 PASS 93 | nuketown2 | deployed-idle | 67.7 | 13.8 | 22.9 | 37.5 | 126 | 273k | 12022 | 250 | 4 |
| B2 PASS 93 | nuketown2 | move | 62.0 | 15.3 | 27.5 | 36.8 | 122 | 273k | 12006 | 250 | 1 |
| A1 HITL 4 | atomic-acres | deployed-idle | 58.9 | 16.5 | 32.0 | 33.9 | 191 | 540k | 27297 | 454 | 0 |
| A1 HITL 4 | atomic-acres | lawn-idle | 59.1 | 15.9 | 31.3 | 33.9 | 113 | 511k | 26818 | 454 | 1 |
| B1 PASS 93 | atomic-acres | deployed-idle | 61.9 | 15.5 | 26.7 | 37.6 | 189 | 540k | 27293 | 375 | 0 |
| B1 PASS 93 | atomic-acres | lawn-idle | 65.0 | 15.1 | 24.0 | 29.4 | 131 | 529k | 26832 | 375 | 0 |

Read: on nuketown2 the candidate costs **+3 to +4.4 ms at p50** (16.1 vs 13.0,
mean of the pairs) and its p95 is **1.4-2x** PASS 93's; on atomic-acres it is
+1 ms p50 / +5 ms p95. So it is mostly a **Nuke Town Rebuild regression** with a
smaller engine-wide tail component. The candidate draws **+42 draws/frame,
+55k triangles/frame** and has compiled **418 vs 250 render pipelines** by the
time the match is live (which is also why the 12 s first-submission fence is
"close", candidate-4 REPORT OPEN 2).

## Bisect (HITL 4, nuketown2, one session, toggles reverted between rungs)

| rung | fps | p50 | p95 | draws | tris | note |
|---|---|---|---|---|---|---|
| baseline (CDP profiler ON) | 48.8 | 19.8 | 39.3 | 169 | 326k | JS busy **15.2 ms/frame**, (program) 7.4 ms/frame, idle 0.1 ms - the main thread is saturated |
| wear graphs stripped (50 nuketown2 node materials -> flat PBR) | 66.9 | **14.7** | **18.3** | 169 | 325k | largest single delta |
| vegetation group hidden | 63.8 | 15.3 | 20.2 | 158 | 317k | |
| lawn (no-op: selector hit 0) | 62.0 | 16.0 | 20.7 | 169 | 325k | effective no-profiler baseline |
| vehicle-forge groups hidden (6) | 57.9 | 16.7 | 32.4 | 169 | 326k | hidden groups are still walked; see CPU profile |
| grime decals hidden (6) | 60.7 | 16.2 | 24.5 | 163 | 326k | |
| yard props hidden (9) | 56.7 | 16.6 | 33.3 | 160 | 318k | |
| pool water hidden | 56.5 | 16.7 | 35.2 | 168 | 326k | |
| operator visuals hidden (28) | 58.2 | 16.6 | 33.0 | 160 | 318k | |
| shadows off / baseline-again | - | - | - | 21 | 40k | INVALID: the castShadow revert triggered a pipeline storm (p95 1.6 s); rungs after it are not comparable |

The ladder drifts upward after the fourth rung (a ComfyUI model load started
around 17:32 - B2's GPU read 2.9 GB, and by 17:45 the GPU held 14.2 GB at
20 %), so only the ordering of the early rungs is trusted: **wear graphs >
vegetation > grime**, everything else inside noise.

CPU profile, baseline window (self time per frame, profiler overhead
included): `updateMatrixWorld` 1.67, `multiplyMatrices` 1.49,
`updateWorldMatrix` 0.82, `_renderObjectDirect` 0.77, `QEe` (legacy-main) 0.66,
node-material `updateByType/update/updateForRender/updateNumber` 1.4 total,
`writeBuffer` 0.47, `_projectObject` 0.32. Scene census: HITL 4 has **7075
meshes (145 visible), 1822 materials** vs PASS 93 **6366 (98 visible), 1770** -
+709 nodes walked by `updateMatrixWorld` every frame and +47 visible draws.
The +47 visible meshes are: vehicle-forge 6 groups -> ~40 meshes (7 tyre, 7
chrome, 6 lining, 6 glass, 6 groove, 6+5 lamps, 6 paints/accents), hedges 25
LOD meshes, trees 12, grime 6, props 9, pool 1.

## Offenders (top three, with numbers)

1. **Vehicle forge: ~40 draws/frame for six static vehicles** (3 material
   sets x 9 buckets, each vehicle its own group + wheel groups). Three copies
   of identical tyre/chrome/glass/lining/groove/lamp materials = 3x the
   pipelines to compile in the fenced first submission. Measured: +42
   draws/frame A vs B, most of it here (census).
2. **Nuke Town wear node graphs** (50 `nuketown2-*` node materials, 1-3 octave
   value-noise fBm per scale, `cameraPosition` falloff): stripping them in
   session took p50 16.0 -> 14.7 ms and p95 20.7 -> 18.3 ms. The cost is split
   between fragment ALU and the per-object node update on the CPU
   (`updateByType`/`updateForRender` 1.4 ms/frame in the profile).
3. **Per-frame matrix recompose over a bigger scene**: 7075 auto-updating
   nodes (+709 vs PASS 93); `updateMatrixWorld` + `multiplyMatrices` +
   `updateWorldMatrix` = **~4 ms/frame** of main-thread time in the profile;
   vegetation LOD subtrees, forge groups and ~700 arena solids all recompose
   every frame although nothing moves them.

## Fixes shipped in this lane

### perf(hitl5): merge the forged street vehicles into one draw per material

`src/vehicle-forge/build.ts`: `createForgeSharedMaterials()` (one instance of
each colourless bucket material), `createForgeMaterialSet(..., shared)`,
`mergeForgedPlacements(placements)` - bakes each vehicle's world transform
into its geometry, merges per material, returns one static mesh per material
(`matrixAutoUpdate = false`, shadow flags / renderOrder / presentationOnly
carried from the source meshes) plus per-vehicle baked plan centres.
`src/nuketown2-arena.ts` `forgedStreetVehicles` uses both; the forge audit now
carries `skins` (per-vehicle centres from the baked geometry) and the HF-473
mirror gate in `nuketown2-fidelity.test.ts` reads those - same falsifier
("a skin placed in the authored frame lands one mirror away"), measured from
the geometry the player sees. Result: 6 groups / ~40 meshes -> **13 meshes
(3 paint, 3 accent, 7 shared)**; three duplicate material sets -> one.

AFTER numbers: see "After" below - neutral at the spawn pose; read it before claiming a win.

## After (this lane's build, `dist` served on :4188, same harness)

Same bisect harness, this lane's `dist` (head `2ed026e2`) served on :4188,
nuketown2, one session. **ComfyUI was generating during this run** (GPU 42 %,
15.7 GB at 17:47 vs 14-17 % / 1.4 GB for the A/B set), so absolute numbers are
not comparable with the A/B table; only within-session rung deltas are.

| rung | fps | p50 | p95 | draws | tris | note |
|---|---|---|---|---|---|---|
| baseline (profiler ON) | 58.4 | 16.8 | 31.3 | 169 | 325k | JS busy 12.6 ms/frame (was 15.2 on HITL 4, same profiler); updateMatrixWorld 1.40 / multiplyMatrices 1.13 / updateWorldMatrix 0.61 (were 1.67 / 1.49 / 0.82) |
| lawn (no-op) | 59.3 | 16.3 | 31.8 | 169 | 326k | |
| freeze-arena (1087 nodes) | 58.8 | 16.8 | 31.9 | 169 | 326k | no measurable change -> the per-frame matrix cost is NOT in the arena root; the freeze patch was NOT shipped |
| wear stripped | 60.3 | 16.0 | 31.4 | 169 | 326k | inside noise on this run |
| vegetation hidden | 56.6 | 17.3 | 32.2 | **147** | 295k | vegetation = 22 draws/frame (12 LOD L0 + shadow-pass duplicates) |

Honest reading of the forge merge:

- Draws/frame at the spawn pose are **unchanged (169)**. Before, only the
  vehicles inside the frustum were drawn (per-vehicle bounding spheres);
  merged, the whole street's vehicles are one mesh per material and always
  draw. So the ~40-draw "saving" is real only when most of the street is in
  view (mid-street poses), and at the spawn pose it is a wash: -31 scene
  meshes, -13 materials, +0.7k tris/frame, draws equal.
- Scene census after: 7044 meshes (145 visible), 1809 materials.
- `renderPipelinesTotal` read **533** on this build vs **420** on the :4300
  HITL 4 build in the same harness. UNEXPLAINED. Three duplicate forge material
  sets -> one cannot add pipelines; the difference is most likely the serving
  path (`--dist` static server on :4188 with `?release=latest&renderer=webgpu`
  vs the :4300 preview) reaching a different precompile/coverage route. The
  integrator should read this number on its own :4300 serve of the merged
  head before trusting either. In-combat pipeline creation during every rung
  was 0 on both builds (`pipes+0`).
- Net: the merge is a simplification (13 meshes / 1 shared material set
  instead of ~44 meshes / 3 sets) that is neutral at the spawn pose and only
  positive with the street in view; it does NOT, on its own, close the +3-4 ms
  p50 gap to PASS 93. The gap is in offenders 2 and 3 above, and those are
  measured, not fixed, in this box.

## Claim states

- VERIFIED: A/B table above (two interleaved pairs on nuketown2, one pair on
  atomic-acres, same harness, same machine, ComfyUI load noted per run).
- VERIFIED: bisect ordering wear > vegetation > grime for the first four rungs;
  CPU profile shares. ASSUMPTION: the drift after rung 4 is ComfyUI (GPU memory
  1.4 GB -> 2.9 GB -> 14.2 GB across the session); not re-measured.
- VERIFIED (unit): the forge merge keeps every named gate green (tsc, 10 test
  files / 137 tests, build). VERIFIED (browser census): the merged meshes are
  in the live scene (`vehicle-forge merged <bucket>`, 13 of them) and in-combat
  pipeline creation stayed 0. NOT VERIFIED in a browser capture: that the
  merged vehicles render exactly where the groups did (the fidelity gate proves
  the baked centres land on their bodies; a review capture is owed).
- NOT ACHIEVED: the target (candidate p50/p95 at or better than PASS 93 on
  nuketown2) is not met by this lane. Measured after-numbers are within noise
  of before at the spawn pose, under a ComfyUI-loaded GPU.
- OPEN: offenders 2 and 3 are measured, not fixed (see "Still open").

## Still open (for the next lane)

- Wear graphs: replace per-fragment fBm with a CPU-generated tileable noise
  LUT (`DataTexture`, same 256-cell tile, 1/2/3-octave channels) sampled in
  `signedNoise`; keeps every authored scale, drops ~24 hash+sin per fragment
  on the lawn/asphalt/concrete, and (more importantly for the CPU) fewer
  update nodes per material. The materials test "loads no texture" only checks
  the classic map slots, so a TSL `texture()` node passes it; say so in the
  test when doing it.
- Freeze static arena subtrees after build (`matrixAutoUpdate = false` after
  one `updateMatrix()` for vegetation LOD levels, lawn field meshes, presentation
  batches and the arena solids that nothing animates). The bisect harness has a
  `freeze-arena` rung ready to measure it (`--toggles baseline,lawn,freeze-arena`).
- `scripts/qa/browser-visibility-contract.test.mjs` is RED on the candidate
  before this lane touched anything: `scripts/pass94/capture-operator-looks.mjs`
  is a headed launcher without the mute/off-screen contract. Not mine; not
  fixed here.
- The pipeline count (418 vs 250) is only partly addressed (three duplicate
  forge sets -> one); the wear materials (50) and operator looks are the rest.

## Fix lane (Fable, 17:55-18:35): the three offenders, measured before and after

Worktree `C:/Users/david/projects/aa-claude-perf`, cut from `145d33c5`. Same
harness, extended (`scripts/qa/perf-hitl5-bisect-cdp.mjs`): the census now
reports per top-level root the nodes three walks each frame, how many still
auto-recompose, how many subtrees carry the walk-skip, and the in-page cost of
one `updateMatrixWorld()` of that root (median of 50 - CPU only, ComfyUI on
the GPU cannot distort it); `--cpu-all` profiles every rung; and every matrix
sample is charged to the app/renderer function that started the walk. All
runs: headless installed Chrome, real WebGPU device, 2560x1440, HIGH, Solo,
bots frozen, `dist` served on :4188, one browser at a time. GPU before each
run is in `bisect/*-gpu.txt`.

### Where the nodes are (pre-fix census, `bisect/pre-census-nuketown2.json`)

- Scene: **10,643 nodes, 3,029 auto-updating**; one full-scene walk
  **0.9 ms** in-page. `Nuketown2 arena`: 976 nodes / 965 auto / 958 meshes
  (89 visible) / **0.2 ms** of that walk. `pass65-killstreak-presentations`:
  4,233 nodes, 280 auto, 29 walk-skipped subtrees, 0 ms. Camera subtree
  (viewmodel): 906 nodes, 199 auto. Two bot rigs: 187 + 167 nodes, 0.1 ms each.
- The **+709 meshes vs PASS 93 are NOT the operator-look clones.** The census
  diff by material shows the 56 `through-wall-exact:operator-look-*` meshes
  replaced 56 `through-wall-exact:Swat*` meshes one-for-one (63 through-wall
  meshes in both builds); likewise `operator-look-*-garment*` (+56) replaced
  `Swat`/`Swat_Black` (-56). They are not a capture-time artefact and not
  net-new. The growth is the arena's own authored source meshes under the
  new named node materials: `nuketown2-trim` +239 (228 of which left the
  unnamed `MeshStandardMaterial` row), `nuketown2-drywall` +77,
  `nuketown2-ground-scrub` +67, `nuketown2-automotive-chrome` +57, hedge LOD
  +25, `nuketown2-block` +25, `nuketown2-tire-rubber` +25, glasshouse frame
  +24, and so on - the Rebuild's material split and dressing. They are hidden
  batch sources, walked every frame but never drawn.

### Who spends the matrix time (`bisect/pre-callers-nuketown2.json`, profiled ms/frame)

| caller | baseline | lawn (no-op) |
|---|---|---|
| three `_renderScene` (the per-frame full-scene walk) | 1.72 | 1.81 |
| `getWorldPosition` / `getWorldQuaternion` (parent-chain refreshes) | 0.36 | 0.60 |
| `solveRiggedArms` + `orientRiggedBone` + `alignRiggedPalmWorld` + `beforeRender` (viewmodel arm IK: repeated `updateWorldMatrix(true, true)` over the 906-node camera subtree, art-kit.ts) | 1.07 | 0.88 |
| gameplay (`Sw`) | 0.15 | 0.14 |
| total matrix | **3.8** | **4.0** |

So of the ~4 ms the previous lane saw, roughly half is the renderer's own
walk over 10.6k nodes (the arena is a fifth of it) and a quarter is the
first-person arm solver re-multiplying the weapon subtree several times a
frame. Freezing the arena could never have been worth more than ~0.2 ms.

### Fix 1 - `perf(hitl5): freeze the batched arena's static matrices after mount` (`f7f16d92`)

`freezeStaticArenaMatrices()` (static-matrix-freeze.ts, tested): after
batching, hidden batch sources (`userData.staticBatchRendered`),
`*-render-batches` groups and LOD subtrees compose once and stop;
`userData.dynamic` subtrees are skipped; no walk-skip, so forced refreshes
stay correct. Measured: scene auto nodes **3,029 -> 2,206**, arena auto
**965 -> 139**, arena walk **0.2 -> 0.1 ms**, full-scene walk 0.9 -> 0.8 ms
in-page. The profiled `_renderScene` share did not move outside noise
(1.7-1.8 before, 1.8-2.1 after under a heavier machine, below). Node count is
unchanged (freezing removes recompose, not nodes): the +709 are real authored
sources and stay for raycast/collision references. **Small, real, not the
win.** Collider-visual parity, fidelity and viewmodel gates green.

### Fix 2 - `perf(hitl5): sample one shared CPU-generated noise tile in the Nuke Town wear graphs` (`a0956d25`)

`nuketown2-materials/noise-lut.ts`: one 512x512 RGBA8 `DataTexture`
(R/G/B = 1/2/3-octave fBm, A = ridged) generated on the CPU at first use,
64-cell tile with integer octave periods (seam pinned on the bytes in
`noise-lut.test.ts`); `signedNoise()` and the asphalt/interior/vehicle
`fbm2`/`valueNoise2`/`ridgedFbm2` terms are one `texture()` fetch each.
Every authored feature size, albedo/roughness swing and falloff is unchanged.
`nuketown2-materials.test.ts` "loads no texture" now says a CPU-generated
DataTexture is generated, not loaded, and asserts it on the bytes (no URL).

Measured, within-session `wear` rung (strip the graphs -> flat PBR) on the
fixed build: JS busy **17.42 -> 15.54** (run 1) and **16.32 -> 15.80** (run 2)
ms/frame; p50 22.6 -> 21.3 and 21.4 -> 21.2. Read honestly: the LUT removed
the fragment ALU, but **the remaining wear cost is CPU-side and is still
there** - 50 distinct graphs are 50 distinct pipelines, so the per-object
node update and pipeline switching the profile showed (`_renderObjectDirect`
0.7, `_update` 0.6, `update`/`updateNumber`/`updateForRender` ~0.9 ms/frame)
did not collapse. Collapsing it needs the spec constants turned into
per-material uniforms so structurally identical family graphs share one
pipeline (concrete x4, lawn x2, painted-metal x3, siding x2); not done in
this box. Look: capture pair at the spawn pose, same harness pose, before
(`bisect/pre-census-nuketown2.png`) vs after (`bisect/post-fixes-2-nuketown2.png`),
`scripts/qa/perf-hitl5-capture-diff.mjs`: mean abs difference **4.2/255**
over the frame, 11.8 % of pixels moved by >8, 3.0 % by >32; the station crop
(`bisect/wear-lut-pair-crop.png`, 900x500 at 880,560) 4.5 / 11.1 % / 3.6 %.
Eyeballed side by side: block wall, drive, garage door, both sidings, lawn
checker and desire lines read the same; the >32 pixels are the wind-animated
grass blades and the viewmodel between two captures, not the wear. What did
change and is visible on inspection: the exact mottle pattern (octaves are
decorrelated by seed, not by domain rotation) and a 64-cell period instead of
256 (1 mm grain repeats every 6.4 cm, 60 mm scuff every 3.8 m, 2.4 m traffic
every 154 m - beyond the arena).

### Fix 3 - vegetation: measured, NOT changed

- On HIGH the sun shadow map is **static** (`shadowUpdateMode: 'static'`;
  `configureLightShadows` sets `shadow.autoUpdate = false`, refreshed only on
  `requestStaticShadowRefresh`). There is no per-frame shadow pass and so no
  "shadow duplicate" draw to remove; `veg` measured **-11 to -12 draws/frame**
  (169.5 -> 158, 170.6 -> 159.6), all main-pass, i.e. the 12 LOD level
  draws. The previous lane's 22 was a different session.
- The JS delta of hiding vegetation was -1.0, +0.7 (fixed build run 1: veg
  17.03 vs lawn 18.44) and +1.8 ms across three runs - noise, not cost.
- The arena solids cast no shadows (`nuketown2-arena.ts` sets none), so the
  hedge L0 shadow is the only shadow a hedge has; dropping it is a visual
  change, not a free win. Left as is; breakable-grass API and vegetation
  tests untouched and green.

### The pipeline-total discrepancy (533 on :4188 vs 420 on :4300) - explained

`renderPipelinesTotal` is the harness's cumulative `createRenderPipeline`
count from page init. On the `--dist` static serve **every run today tripped
the 12 s first-submission fence** ("WebGPU queue completion exceeded 12000 ms
for submission 1", 5 of 5 runs, GPU idle at 4 % or loaded at 33 %), the app's
map selection failed and retried, and the pipelines compiled for the failed
attempt are counted: the SAME dist read 532, 623, 621 and 619 across four
runs. The :4300 preview did not trip the fence in the previous lane's A/B
(418-420). The number is therefore not comparable across serves; in-match
creation was **0 on every rung of every run** (`pipes+0`). The fence trip on
the static-server route is itself the candidate-4 OPEN 2 "fence is close"
finding reproducing; the fence was not widened.

### Absolute numbers - why there is no "after" table you should trust

Both after-runs ran under heavier background load than the before-runs:
ComfyUI loaded a model during `post-fixes-2` (GPU 1.4 -> 2.9 GB by the end)
and a 100 % CPU spike was sampled right after `post-fixes`; baseline JS busy
read 16.3-17.4 ms/frame after vs 13.6-14.1 before, and the no-op `lawn` rung
moved **+1.0 / +2.1 ms** against its own baseline within one session. That is
larger than either fix's effect, so this lane makes **no absolute p50/p95 or
JS-busy improvement claim**, and the target (JS busy <= 10 ms at the spawn
pose) is **NOT demonstrated**. What is claimed is the within-session,
CPU-only evidence above.

### Claim states

- VERIFIED: census, caller attribution, fix 1 node/walk numbers (in-page, CPU
  only), the +709 provenance, the static-shadow reading, the fence/retry
  explanation of the pipeline count, the capture-pair numbers.
- VERIFIED (gates): `npx tsc --noEmit`; vitest 20 files / 216 tests (the
  named gates plus noise-lut, static-matrix-freeze, corpse-presentation,
  viewmodel motion/socket, weapon-runtime-behavior); `npm run build`;
  `legacy-main.ts` under the ratchet (37,368 <= 37,371: the freeze call is
  one line and two dead `updateMatrixWorld(true)` calls after
  `deepFreezeSubtreeMatrices` went).
- ASSUMPTION: the after-run inflation is background load, not the fixes; the
  in-page walk (0.9 -> 0.8 ms, fewer auto nodes) says the freeze cannot have
  added CPU, and the wear rung says the LUT build still strips 0.5-1.9 ms.
  Falsifier: an interleaved A/B (old dist vs new dist, same session order)
  on a quiet machine.
- NOT ACHIEVED: JS busy <= 10 ms; node count "back near 6366" (the nodes are
  real authored sources, frozen not removed); pipeline sharing.

### Still open (next lane, in order of measured size)

1. Viewmodel arm IK: `solveRiggedArms` / `orientRiggedBone` /
   `alignRiggedPalmWorld` / `beforeRender` call `updateWorldMatrix(true, true)`
   on shoulder/wrist bones several times a frame; each re-multiplies the whole
   weapon subtree. ~1.1-1.3 ms/frame profiled. Refresh the arm chain only.
2. The renderer's full-scene walk (~2 ms profiled, 0.8 ms in-page): the
   4,233-node killstreak root is walked even though its pools are frozen;
   a walk-skip on the pool ROOT (not per entry) when nothing is checked out.
3. Wear pipelines: uniforms for spec constants so family graphs share
   pipelines; that is where the remaining 0.5-1.9 ms wear CPU is.
4. The 12 s fence on the static-serve route (integrator: reproduce on :4300).

## Perf lane 3 (Codex, HF-491)

VERIFIED: This lane was run from `0123a427` on `contrib/dave-gaming-pc/claude/perf-hitl5`, with the existing install, headless installed Chrome, `PASS73_NATIVE_WEBGPU=1`, HIGH/WebGPU, Solo, `nuketown2`, port `4188`, and ComfyUI left running. The complete final rung is `bisect/codex-perf3-final-47605e1d-nuketown2.json`; the pre-lane rung is `bisect/codex-perf3-pre-0123a427-nuketown2.json`. GPU telemetry was observed before the final material rung at 48 C / 9% / 1,963 MiB; a later read was 47 C / 9% / 3,182 MiB. These measurements are CPU-only within-session evidence, not absolute FPS claims.

### Changes

| fix | implementation | evidence |
|---|---|---|
| dormant killstreak pool | `285b28a9`: `freezeMatrixWorldWalk()` makes `pass65-killstreak-presentations` a static traversal boundary; active entities, effects, markers and sensors refresh explicit world roots. | VERIFIED: the root remains 4,233 nodes and reports `walkMs=0`; the final renderer attribution is 1.94 ms/frame for `_renderScene` versus 1.95 ms/frame in the pre-lane sample. The root-node count is unchanged by design. OPEN: because the previous lane had already deep-frozen pooled entry descendants, total scene auto nodes moved only 2,203 -> 2,198, not by 4,233; the census cannot truthfully claim a 4,233 auto-node drop. |
| viewmodel arm IK | `9dd2c270`: `ViewmodelMatrixPathUpdater` deduplicates camera-to-target ancestor paths and updates parents once, with children only on the moving IK/socket chains. | VERIFIED (unit): viewmodel motion/socket tests pass. In the combined final rung, the named IK callers account for about 1.02 -> 0.92 ms/frame by CDP attribution (`alignRiggedPalmWorld`, `solveRiggedArms`/its updated path, `beforeRender`, `orientRiggedBone`); no absolute win is claimed. OPEN: this lane did not obtain a separately rebuilt pre-fix screenshot pair at a pinned spawn pose. |
| wear graphs | `af1fce7`, `93844d52`, `4e8cb9c8`, `47605e1d`: shared family graph nodes use per-material uniforms; the vehicle paint family is clone-safe and cached; the pre-existing coach-glass offset tier is preserved. | VERIFIED: registry graph count is 8 and built-arena graph count is 40 (`npx tsx` structural and `customProgramCacheKey()` census); budget ceiling is 40, lowered from 54. Final in-combat pipeline creation is `pipes+0` for both toggles. OPEN: no absolute JS/FPS win is claimed under the loaded GPU. |

### Bisect measurements

| rung | toggle | JS busy ms/frame | matrix ms/frame | p50 / p95 frame ms | draws | pipelines created |
|---|---|---:|---:|---:|---:|---:|
| VERIFIED pre `0123a427` | baseline | 17.86 | 4.12 | 23.60 / 44.20 | 171.3 | 0 |
| VERIFIED pre `0123a427` | wear | 15.87 | 4.62 | 20.90 / 42.80 | 170.0 | 0 |
| VERIFIED final `47605e1d` | baseline | 21.08 | 4.09 | 25.50 / 36.00 | 167.4 | 0 |
| VERIFIED final `47605e1d` | wear | 14.88 | 3.75 | 19.40 / 32.60 | 166.0 | 0 |

VERIFIED: The final presentation telemetry was healthy, the 12 s WebGPU fence did not fail, and every final in-match toggle reported `pipes+0`. The final census was 10,639 nodes / 2,198 auto nodes, with 4,233 killstreak nodes / 279 auto / 0 ms root walk and 906 camera nodes / 199 auto. The pre-lane census was 10,643 / 2,203, 4,233 / 280 / 0 ms, and 906 / 199.

VERIFIED: Final graph probes reported 18 registry materials across 8 distinct graphs and 72 arena node materials across 40 distinct `customProgramCacheKey()` values. The strengthened `src/nuketown2-pipeline-budget.test.ts` and material tests passed.

OPEN: The before/after rows are different short headless sessions with ComfyUI active and are therefore not a claim of an absolute p50, p95, FPS, or JS-busy improvement. The final baseline JS busy value was higher while the final wear rung was lower; treat the per-fix mechanism, census, graph count, pipeline-zero fence and tests as the evidence. OPEN: the requested pinned visual-diff pair was not obtained for this lane; a raw pre/final full-frame comparison was 25.80/255 mean absolute difference and is not presented as visual equivalence because the sessions were not pose-locked.

### Gates

VERIFIED: `npx tsc --noEmit` passed after the final source change. VERIFIED: `npm run build` passed after the final source change. VERIFIED: the exact requested Vitest glob command selected 5 files / 58 tests. VERIFIED: the corrected expanded relevant set covering the nested material, vehicle-forge, cold-precompile and direct killstreak/viewmodel files passed 43 files / 430 tests with 1 skipped file / 2 skipped tests. The earlier coach-glass offset assertion was corrected before this final expanded run.

VERIFIED: Commits `285b28a9`, `9dd2c270`, `af1fce7d`, `93844d52`, `4e8cb9c8`, and `47605e1d` use explicit paths, the `perf(hitl5):` prefix, the required Codex trailer, and were pushed to `origin/contrib/dave-gaming-pc/claude/perf-hitl5`. OPEN: the branch is not a production publication and no `:4300` or release deployment was performed.

OPEN: The required `npm run pipeline:preflight -- --machine dave-gaming-pc --harness Codex` rerun passed `qa:lockfile` but the contribution guard refused the handoff because this worktree contains 41 untracked evidence paths. I did not sweep or delete those unrelated artifacts; the tracked branch head is clean and pushed. AKP adoption `check` was VERIFIED as trusted, and the filtered `audit` emitted no Codex FAIL/AMBER row.
