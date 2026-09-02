# Lane C - Farcrysis load path (PASS 84) - lane report

Worktree `C:/Users/david/projects/aa-farcrysis-load`, branch
`contrib/dave-gaming-pc/claude/farcrysis-load-fix` (base e046c130, live PASS 83).
Claim-state on every line: VERIFIED (measured/ran here) / CLAIMED / OPEN.
All browser measurements: headless installed Chrome (channel 'chrome'),
`--mute-audio`, WebGPU route, 1600x900, `dist` served on 127.0.0.1:41943,
arena selected via `__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis')` then
`startSolo()` - the same path the eight-arena boot smoke uses (no new backdoor).
Instrument: `scripts/qa/probe-farcrysis-boot-cdp.mjs`; raw data under
`artifacts/qa/farcrysis-load/`.

## 0. PASS 84 repair pass, 2026-09-02 - what changed after the skeptic review

The lane was reviewed independently as ACCEPT_WITH_FIXES. This section is the
repair; sections 1-8 are the original lane report with the three refuted
evidence lines corrected in place and marked `CORRECTED 2026-09-02`.

### 0.1 The headline, stated honestly - VERIFIED

**Farcrysis does NOT admit inside the 12 s fence.** It admits in 44-67 s.

The brief's step-5 target was "admission inside the existing 12 s fence on this
machine". That target is NOT met, and the original report's wording ("Admission
is inside the existing 12 s fence: every fenced submission completed") invited
the wrong reading. What is true:

- Every INDIVIDUAL fenced submission now completes inside its own bound; no
  `WebGPU queue completion exceeded` error appears in any AFTER run, the
  transition commits, and the session is no longer poisoned for the next arena.
- The whole select-to-admitted interval is 44-67 s across five runs of the two
  builds, against 38-45 s for Atomic Acres on the same instrument and machine.
- BEFORE the lane, farcrysis never admitted at all: the transition failed at the
  first 12 s fence, rolled back, and the rollback then failed Nuke Town's 4 s
  fence behind the same stuck submission.

So the pass-84 outcome for this arena is "boots reliably, at ~1.2-1.5x the load
time of the shipped arenas", not "12 s". It stays `selectable: false`.

### 0.2 Fix 3 - compiling LESS, not just later (commit 3b2c6e7a) - VERIFIED

The skeptic's blocking finding was that fix 2 DEFERS compilation (it moves the
PBR programs off the fenced submission into three's serial `compileAsync`)
rather than reducing it, while the residual cost - the distinct program count -
sat in files this lane owns. Correct, and now partly addressed.

`src/farcrysis-tsl-foliage.ts` bucketed its shading numbers (HF-374) but still
baked them into the node graph as literal nodes, and `NodeMaterial`'s program
cache key hashes node-object identity. Measured offline over the real
`buildFarcrysis` scene: **85 foliage node materials produced 9 distinct node
graphs**, each one its own WGSL program and its own render pipeline in both the
scene and the shadow pass.

The dapple strength and the three sway numbers now travel with the MATERIAL,
through four module-level `materialReference()` singletons
(`NodeUpdateType.OBJECT` - the same per-material mechanism `materialColor`
already used for the base hue). One shared node object serves every layer, so
the graph splits only on the two things that change the emitted WGSL: is there a
dapple term, is there a sway term.

| offline, real arena scene | before | after |
|---|---|---|
| foliage node materials | 85 | 85 |
| distinct node graphs | 9 | **4** (82 of 85 on ONE graph) |
| `TSL_FOLIAGE_MAX_DISTINCT_GRAPHS` | 16 | **4** (ceiling lowered, not raised) |

Measured in the browser with the same probe, identical instrument and arena
(`before-foliage.json` = this tree minus the foliage commit; `after-3.json` and
`after-4.json` = with it):

| during the load | before | after |
|---|---|---|
| render pipelines created | 326 | **298** |
| shader modules created | 329 | **311** |
| async precompiled pipelines | 92 | **74** |
| of those, > 200 ms to compile | 42-43 | **38** |
| of those, arena PBR programs | 32-33 | **28** |
| sync pipelines during load | 234 | **224** |
| largest sync warm-frame burst | 99 | **60** |

Wall-clock admission is NOT a clean A/B on this machine, and is reported as
such: the SAME 33 arena PBR pipelines cost 9,443 / 11,314 / 19,089 ms to
precompile in three different runs of the same build, depending on how much of
the GPU the owner's ComfyUI held. Admission across the five runs: 44.2, 46.9,
66.8 s (before) and 51.5, 65.6 s (after). At the observed per-pipeline cost
range (286-578 ms) removing 5 expensive programs is worth ~1.4-2.9 s - real, but
below this machine's run-to-run noise, so it is stated as a count reduction and
not as a time saving. OPEN.

The VALUES written into the new uniforms are still the bucketed ones, so the
render is identical to the bucketed build by construction; exact per-layer
values now cost no extra pipeline, but restoring them is an art call.

### 0.3 The arena-id branch is now pinned (commit 39bd0a1c) - VERIFIED

`performArenaSelection` takes a different prewarm sequence for one hardcoded
arena id and nothing pinned it - the same shape as this repo's documented
hardcoded-roster drift class. `src/presentation-prewarm-contract.test.ts` now
source-pins, inside the region bounded by the webgpu backend check and
`profileArenaTransition('quality-presentation')` (1607 chars, asserted
non-empty): the branch exists; it is gated on `selectedArena.id === 'farcrysis'`;
it precompiles under `withArenaFrustumCullingDisabled`; it sits strictly BEFORE
`requestStaticShadowRefresh(true)`, `submitForegroundWebGpuFrame(true)` and
`flushWebGpuFrames(12_000)`; it is the ONLY arena-id branch in the region
(measured: 1 match); and `flushWebGpuFrames` there still carries 12_000 and
nothing else. Checked non-vacuous against the real source (precompile at offset
1357, shadow refresh 1452, warm frame 1492, fence 1539).

### 0.4 Somebody looked at the arena (commit de283d74) - VERIFIED

The probe now takes one `page.screenshot()` immediately after admission,
headless, off the page it already has open. Same spawn camera, 1600x900:

| comparison | mean abs diff | pixels differing > 16 |
|---|---|---|
| CONTROL: same build, two runs | 5.70 | 6.80 % |
| before vs after, run 3 | 5.83 | 7.40 % |
| before vs after, run 4 | 6.23 | 8.02 % |

The wind is time-driven, so no two frames of the SAME build match either; the
before/after delta is the same magnitude as that control, i.e. not
distinguishable from animation phase at this camera. Both frames show the
jungle, palms, grass field, shoreline, HUD and viewmodel intact - no black
frame, no NaN geometry, no missing layer. Artifacts:
`before-foliage-admitted.png`, `after-3-admitted.png`, `after-4-admitted.png`.
This is NOT an art review: the vegetation still reads as flat low-poly
"lollipop" trees, which is the owner's own "dense-but-cheap-looking" complaint,
and the HUD frame counter reads 10-12 fps in headless while ComfyUI shares the
GPU.

### 0.5 Evidence is now in the branch (commit 7b50b82f) - VERIFIED

`artifacts/` is gitignored and the four files carrying the load-bearing facets
were disk-only. `before-v3.json` and `after-1.json` - the single-variable pair
that proves root cause 1 - are force-added, together with this pass's runs, the
offline graph censuses and the three frames.

### 0.6 Machine hygiene - VERIFIED

A `vite preview` on 127.0.0.1:41960 (PID 8164) started by this lane's earlier
session was still listening. Its teardown ran
`taskkill $(cat artifacts/qa/farcrysis-load/preview.pid)`, but `preview.pid` held
the backgrounded shell's `$!` (244712) rather than the node process, so the
teardown killed nothing. Stopped here - verified first that the parent command
line is this worktree's own boot-smoke run, and that the port was free
afterwards - and the stale `preview.pid` deleted. The probe itself never leaks a
server: it serves `dist` from its own in-process `node:http` listener and closes
it. NOTE, not fixed: several older `vite preview` processes belonging to OTHER
lanes and worktrees are still listening on 41930, 41961, 41963, 41971, 41988 and
42100. They are not mine and were not touched.

### 0.7 The shared stall-probe patch is a landed fix, not an ownership overreach

`scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` (commit 285f44fb) gained an
8-line hidden-arena fallback. The skeptic's recommendation, adopted: KEEP it.
The previous `document.querySelector('.map-card[data-arena-id=...]')?.click()`
was a silent no-op for every hidden arena, so the probe measured the DEFAULT
arena while reporting the requested one. Consequence for the pass log: any
earlier hidden-arena stall measurement taken with this probe is suspect.

### 0.8 Gates re-run on the repaired tree - VERIFIED

- `npx tsc --noEmit`: clean (`tsc-3.log`).
- `vitest src/farcrysis`: 23 files, 151 tests, all green - including
  `farcrysis-tree-materials.test.ts`, which the first session reported as a
  20 s hook timeout under contention. It passed here, which supports the
  original CLAIMED reading that the timeout was contention fragility rather
  than a lane regression; it is still not a proof.
- `vitest src/presentation-prewarm-contract src/rendering/pass64-tsl-scene
  src/farcrysis-instance-capacity src/farcrysis-webgpu-pipeline-budget
  src/farcrysis-boot-cost src/farcrysis-tsl-foliage`: 47/47 green.
- No fence, threshold, timeout or assertion weakened. The one test whose
  expectation changed - `gives different sway buckets their own uniform` -
  pinned the graph SPLIT that was the cost; it is replaced by a strictly
  stronger case plus a new one asserting the four referenced properties are
  finite on every material the factory returns.
- Full vitest suite: still not run here (orchestrator runs it on the merged
  tree).

## 1. BEFORE (live PASS 83 head, e046c130) - VERIFIED

- Farcrysis NEVER admitted. `selectArena` "resolved" after 28 s only because the
  transition failed and rolled back: console
  `[Farcrysis map selection failed] Error: WebGPU queue completion exceeded
  12000 ms for submission 1 (... fenced draws 1017)`; the rollback to Nuke Town
  then failed its own 4 s fence behind the same stuck submission
  (`pending 20133 ms`). `startSolo` afterwards started ATOMIC ACRES, active at
  108-118 s (three runs: before.json 117.6 s, before-v2 107.9 s, before-v3 111.8 s).
  The "279 s then the tab dies" figure in map-selection.ts is the same defect
  on the live page through the real menu; here the session survives as a
  fallback arena.
- First fenced submission (the god-rays shadow-target warm frame in
  `visual-definition`, the first WebGPU submission of a cold session) created
  **217 render pipelines from 196 distinct vertex shader modules and 92 distinct
  fragment modules (288 distinct modules)**, all synchronously inside one 6.3 s
  main-thread task.
  CORRECTED 2026-09-02 (skeptic review): the first version of this line said
  "313 shader modules". 313 is `shaderModules.byPhase.unbucketed` in
  before-v3.json - modules created outside any profiler phase interval - not the
  burst. Recomputed from the burst records: 196 vertex + 92 fragment = 288. The
  pipeline count (217) and vertex-module count (196) were exact.
- Atomic Acres, same instrument (compare-atomic-acres.json): 75 pipelines /
  107 modules in that phase, selectArena 38.4 s, active at 59.5 s (second run
  compare-atomic-acres-2: 44.8 s / 69.9 s while the owner's ComfyUI was busy).
- Main thread: 5.5 s arena-construction long task; offline timing
  (build-timing.txt) puts 3.9 s of it in the 14 procedural fallback textures
  (`ensureTextures`, byte-pinned by farcrysis-boot-cost.test.ts), 0.36 s in
  ground textures, ~1.1-1.5 s in geometry. Heap after admission ~350 MB used.
- Offline pipeline census of the arena alone (census-before.txt, mirrors three
  r185's cache-key composition): 545 renderables, 187 unique materials, 51
  programs, 9 vertex layouts, 358 shadow casters in 10 caster variants.

## 2. Root cause, in numbers - VERIFIED

1. **Instance count baked into WGSL.** three r185 `nodes/accessors/Instance.js`
   keeps InstancedMesh matrices in a uniform array while
   `instanceMatrix.count * 64 <= 65536` (<= 1024 instances) and declares it as
   `array<mat4x4<f32>, COUNT>`, so the allocated capacity is part of the shader
   text. 108 farcrysis layers were allocated at ~100 different placement
   counts -> identical materials compiled to different programs and pipelines,
   once for the scene pass and again per shadow pass. That is 196 distinct
   vertex modules for a few dozen materials.
   EVIDENCE CORRECTED 2026-09-02 (skeptic review): the original line cited a
   contrast between the vertex-buffer facets `12:instance:3float32x3` and
   `64:instance:...`, which does NOT discriminate - both descriptors appear in
   both runs (before-v3 has 3 pipelines carrying a 64-byte matrix buffer;
   after-1 still has 5 instanced pipelines without one). The real discriminator,
   recomputed here over the first fenced burst, is per-pipeline presence of the
   64-byte instance-matrix vertex buffer:
     BEFORE  116 instanced pipelines, 113 of them with NO 64-byte matrix buffer
             (the uniform-array path), and those 113 use 113 DISTINCT vertex
             modules - a 1:1 ratio, the signature of a count-baked shader.
     AFTER   71 instanced pipelines, 66 on the 64-byte attribute path sharing
             33 distinct vertex modules; 5 remain off it.
   The conclusion stands; the evidence line as first written did not.
2. **Cold vocabulary realised inside one 12 s fence.** The arena's remaining
   vocabulary is dominated by full PBR scene-pass programs (~70-80 KB WGSL,
   vertex+fragment) that Dawn/DXC compiles at **530-710 ms each** (measured
   per-pipeline via createRenderPipelineAsync resolve latency, after-2b.json:
   median of the expensive class 600 ms; descriptor-identical duplicates 1-2 ms,
   basic/points/post 25-60 ms). Farcrysis puts **59 PBR pipelines** into its
   first frame where Atomic Acres puts **6** (its remaining 72 are compiled
   later through the async `precompileExactScenePass`). 59 x ~0.6 s cannot
   complete inside a 12 s fence; 6 can. Shader size is NOT the difference:
   fragment WGSL median 70.5 KB (farcrysis) vs 71.4 KB (atomic-acres).
3. Secondary, not fixed: 3.9 s of procedural texture generation on the main
   thread during arena construction (a typed-array lattice memo was tried:
   3.9 -> 3.5 s only, byte-identical, reverted as not worth the code).

## 3. Fixes landed - VERIFIED

Commit ce270e50 `fix(farcrysis): one count-free instancing path`
- `src/farcrysis-instancing.ts` (new): `farcrysisInstancedMesh(geometry,
  material, count)` allocates capacity `max(count, 1025)` (above the uniform
  path, identical for every layer that fits) and keeps `mesh.count = count`;
  three draws/culls/raycasts/bounds over `count`, so placement, LOD pairs,
  per-instance colour and gameplay are unchanged. Cost ~65 KB per layer, ~7 MB once.
- 76 construction sites in farcrysis.ts, -art, -detail, -grass-field,
  -palms-enhanced, -physics, -vegetation now go through it.
- `src/farcrysis-instance-capacity.test.ts` (new) pins it.
- Measured (after-1.json vs before-v3.json): first fenced submission 217 -> 134
  pipelines, 196 -> 81 distinct vertex modules, 313 -> 172 shader modules.
  Fence still failed on its own (134 still contained ~59 expensive PBR programs).

Commit 7211da16 `fix(farcrysis): realise the arena vocabulary before the first fenced frame`
- `src/legacy-main.ts`, arena-load region, one block marked `// FARCRYSIS-LOAD:`
  (20 lines, LF preserved): for `selectedArena.id === 'farcrysis'` only, run
  `withArenaFrustumCullingDisabled(scene, () => pass64TslSystems.precompileExactScenePass(scene))`
  BEFORE the shadow-target warm frame. That is the engine's own exact-ScenePass
  compile (three `compileAsync` -> `createRenderPipelineAsync`, no fence), so the
  warm frame and the committing coverage draw find the pipelines already built.
  The 12 s fence, its call sites and the pinned coverage-frame sequence are
  untouched; every other arena takes exactly the sequence it took before.
  (`presentation-prewarm-contract.test.ts` still green.)
- Measured (after-2.json, after-2b.json):

| metric | BEFORE (e046c130) | AFTER (7211da16) |
|---|---|---|
| farcrysis transition outcome | FAILED at 12 s fence, rolled back, session poisoned | committed, 0 console/page errors |
| selectArena -> admitted | never (28 s to failure) | 63.6 s / 66.8 s (two runs) |
| startSolo -> active | n/a (atomic-acres fallback) | 23.4 s / 23.8 s |
| select -> live farcrysis match | never | 87.1 s / 90.6 s |
| pipelines in first fenced submission | 217 (sync) | 60 sync in the largest warm-frame burst, after 92 async precompiled |
| shader modules during load | 712 | 329 |
| distinct vertex modules, first frame | 196 | 81 |
| arena in live scene | 0 farcrysis meshes | 675 meshes, 164 instanced / 93,630 instances, 184 arena materials |
| 75 s in-combat window | (atomic-acres) 1 pipeline | **0 pipelines, 0 shader modules**, 27 rAF gaps >=100 ms, max 167 ms |
| phase profile (farcrysis) | none (never committed) | shared-assets 2.4-3.4, arena-construction 3.3, visual-definition 35.2-37.7 (26-28 s serial async precompile + ~8.6 s warm frame+fence), weapon-catalog 6.1-6.2, prewarm-batched-effects 11.9, coverage-submit-fence 3.8-4.1 s |
| Atomic Acres, same instrument | selectArena 38.4-44.8 s, active 59.5-69.9 s | unchanged (not touched) |

- Residual vs Atomic Acres: three's `compileAsync` is serial by design
  (per object: build nodes, `await` that object's `createRenderPipelineAsync`,
  yield), so the precompiled pipelines cost the sum of their latencies.
  CORRECTED 2026-09-02 (skeptic review): the first version said "78 pipelines,
  sum 22.3 s"; 78 was a sub-window. after-2b.json records **92** async render
  pipelines, every one of them from `precompileExactScenePass`, latency sum
  **24,446 ms**. 43 of the 92 cost more than 200 ms (23,246 ms between them) and
  33 of those are arena PBR programs (19,089 ms). Farcrysis has ~35
  distinct expensive PBR program variants (17 legacy MeshStandardMaterial
  programs: split by map/normalMap/roughnessMap presence, metalness 0 vs non-0,
  flatShading, vertexColors, polygonOffset, transparent/depthWrite, side;
  and ~17 TSL foliage programs: 6 wind/dapple graphs x texture-slot sets x
  alphaMap/transparent x polygonOffset) - census-variants.txt lists every one
  with a representative mesh. Collapsing them further means changing which
  materials share texture slots or material constants, i.e. art, which this
  lane does not own.

Commit adf6da0d `qa(farcrysis): timed cold-boot probe` - the instrument plus
BEFORE evidence. Commit 285f44fb `qa(farcrysis): stall probe reaches hidden
arenas` - `probe-pipeline-compile-stalls-cdp.mjs` gains a hidden-arena fallback
(`selectArena` when there is no `.map-card`; it used to probe the default arena
silently) plus the AFTER evidence files.

## 4. Gates - VERIFIED

- `npx tsc --noEmit`: clean after each commit (tsc-1.log, tsc-2.log).
- Focused vitest: `src/farcrysis*` 24/25 files, 145 passed / 7 skipped; the one
  failure was `farcrysis-tree-materials.test.ts` "Hook timed out in 20000ms"
  under 25-file contention (its hook builds the arena; 20 s testTimeout) and it
  passes alone in 19 s (7/7). CLAIMED pre-existing fragility, not caused here:
  the hook time is arena construction, which this lane made no slower
  (build-timing: whole-arena build 1.1-1.6 s offline).
- `presentation-prewarm-contract`, `rendering/pass64-tsl-scene`,
  `farcrysis-instance-capacity`, `farcrysis-webgpu-pipeline-budget`,
  `farcrysis-boot-cost`: 40/40 green on the final tree.
- `probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75 --arena farcrysis`
  (commit 285f44fb adds the hidden-arena fallback it needed): **326 pipelines /
  329 shader modules before the window, 0 / 0 during it** - the brief's target.
  Frame pacing in that window: 810 rAF callbacks in 75.5 s (~10.7 fps), 317
  gaps >= 100 ms, median 139 ms, max 217 ms, 59.75 % of the window in gaps -
  steady per-frame cost, not compile bursts (nothing to attribute them to).
  My lighter combat driver saw 16.5-30 fps, 24-27 gaps, max 167-250 ms. OPEN:
  farcrysis in-combat render cost is poor in headless 1600x900 (93,630
  instances, two 2048 shadowed suns, grass field); that is HF-399/art territory,
  not load path, and the owner's ComfyUI shared the GPU during every run here.
- Repo boot smoke `tests/e2e/pass74-arena-boot-smoke.spec.ts -g farcrysis`
  (unchanged assertions: active phase, visible sized canvas, backend stamped,
  zero page errors, zero console errors) on the real WebGPU route in HEADLESS
  installed Chrome: **PASS, 1.3 min** (boot-smoke-webgpu-headless-farcrysis.log),
  plus the spec's own "browser can get a WebGPU device" test. Run through a
  scratch Playwright config (baseURL 127.0.0.1:41960 owned `vite preview`,
  channel chrome, headless, muted) because the repo config forces a VISIBLE
  window with `PASS73_NATIVE_WEBGPU=1`, which the machine rules forbid; the
  scratch config was deleted afterwards. The spec's default
  `?renderer=webgl2&render=compat` URL on bundled headless Chromium reaches
  the "GAMEPLAY RENDERER BLOCKED - no GPU adapter" screen and times out
  (boot-smoke-webgl2-farcrysis.log) - the WebGL2 fallback was retired
  2026-08-30, so that instrument path is stale for every arena, not a
  farcrysis regression (CLAIMED for the other arenas, VERIFIED for farcrysis).
- Full vitest suite: not run (orchestrator runs it on the merged tree).

## 5. Older farcrysis branches - VERIFIED file-level, CLAIMED feature-level

`git cherry e046c130 <branch>` says none of their commits are in the base by
patch-id: hermes/pass69-hidden-farcrysis 21, jigglyclaw/pass69-farcrysis 6,
hotfix/pass80-hide-farcrysis 1 (the other of its 2 is in). File-set diff: the
only farcrysis sources that exist in those branches and not in the base are
`src/farcrysis-terrain.ts` (superseded 2026-08-23 by
`farcrysis-terrain-authority.ts`, commit ccd53e4a "one terrain authority") and
a docs contact-sheet jpg. Every other file was carried forward and reworked
through Aug 22-28 (HF-360/374/375/393-398). CLAIMED: nothing in those branches
is a feature the current tree lacks; not re-verified visually. Nothing merged.

## 6. Still needed before unhiding - OPEN (not this lane)

- `selectable: false` kept. The documented unhide gate
  (`scripts/qa/verify-player-path-cdp.mjs`, the REAL menu card path) cannot run
  while hidden; run it after flipping the flag.
- Load: 44-67 s to admission here vs 38-45 s for Atomic Acres. Owner's target
  is "fast"; the residual is the serial compile of the remaining 28 expensive
  arena PBR programs (was 32-33; see 0.2). Options, in order of yield:
  unify texture-slot sets per material family (1x1 neutral maps) so the
  map/normalMap/roughnessMap-presence splits collapse (art-owned - it changes
  which textures a surface samples); collapse the remaining constant-only
  MeshStandardMaterial splits (metalness 0 vs non-0, flatShading, side,
  polygonOffset, depthWrite, transparent) named in census-variants.txt - each
  single-property collapse was worth only 1-2 programs of 51 in the offline
  census and each one IS an appearance change, so it needs an art decision
  rather than a load-path one; or generalise the precompile-before-warm-frame
  to every arena and make the coverage precompile parallel (engine-owned,
  Lane A / faster map loads).
- Art quality (owner: "poor, dense-but-cheap-looking vegetation"), the 55+6
  eye-clearance RED spots, collision/cover audit on the real player path,
  spawn reasonableness (HF-402 lane), water crest foam / slope roughness
  (documented unreachable by constants).
- Real-device and Firefox/Edge runs; this lane measured headless Chrome only.

## 7. What I could not verify - OPEN

- Owner-facing look of the arena as ART. Two frames now exist and the
  before/after delta is inside the same-build run-to-run control (see 0.4), so
  "no visual regression from these changes" is measured, not asserted; whether
  the arena is GOOD is untouched and unjudged here.
- A time saving from fix 3. The count reduction is deterministic and
  reproducible (326 -> 298 pipelines in every run); the seconds it is worth are
  below this machine's GPU-contention noise and were not resolved.
- Behaviour on a device whose `maxUniformBufferBindingSize` exceeds 65536:
  the shared capacity still yields one program per material variant (by
  construction), not measured.
- Whether the same precompile-before-warm-frame would help other arenas
  (deliberately not enabled for them).

## 8. Files changed

- `scripts/qa/probe-farcrysis-boot-cdp.mjs` (new) - the instrument.
- `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` - hidden-arena fallback.
- `src/farcrysis-instancing.ts` (new), `src/farcrysis-instance-capacity.test.ts` (new).
- `src/farcrysis.ts`, `-art.ts`, `-detail.ts`, `-grass-field.ts`,
  `-palms-enhanced.ts`, `-physics.ts`, `-vegetation.ts` - construction sites.
- `src/legacy-main.ts` - one `// FARCRYSIS-LOAD:` block in the arena-load region.
- `src/farcrysis-tsl-foliage.ts` + `.test.ts` - per-material shading uniforms,
  9 -> 4 live node graphs, ceiling 16 -> 4 (repair pass, 3b2c6e7a).
- `src/presentation-prewarm-contract.test.ts` - source-pins the farcrysis
  branch, its position before the fence, and that it is the only arena-id
  branch in that region (repair pass, 39bd0a1c).
- `scripts/qa/probe-farcrysis-boot-cdp.mjs` - one screenshot at admission
  (repair pass, de283d74).
- `artifacts/qa/farcrysis-load/*` (force-added; `artifacts/` is gitignored),
  now including the root-cause pair before-v3.json / after-1.json, the repair
  runs and the three frames (7b50b82f).
- Not committed, deleted: two scratch vitest files used for the offline census
  and build timing (their outputs are in artifacts).
