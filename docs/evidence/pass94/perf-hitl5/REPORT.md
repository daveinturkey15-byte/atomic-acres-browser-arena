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
