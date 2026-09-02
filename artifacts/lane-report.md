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
  **217 render pipelines from 196 distinct vertex shader modules (313 shader
  modules)**, all synchronously inside one 6.3 s main-thread task.
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
| pipelines in first fenced submission | 217 (sync) | 78 sync in the warm frame after 78 async precompiled |
| shader modules during load | 712 | 329 |
| distinct vertex modules, first frame | 196 | 81 |
| arena in live scene | 0 farcrysis meshes | 675 meshes, 164 instanced / 93,630 instances, 184 arena materials |
| 75 s in-combat window | (atomic-acres) 1 pipeline | **0 pipelines, 0 shader modules**, 27 rAF gaps >=100 ms, max 167 ms |
| phase profile (farcrysis) | none (never committed) | shared-assets 2.4-3.4, arena-construction 3.3, visual-definition 35.2-37.7 (26-28 s serial async precompile + ~8.6 s warm frame+fence), weapon-catalog 6.1-6.2, prewarm-batched-effects 11.9, coverage-submit-fence 3.8-4.1 s |
| Atomic Acres, same instrument | selectArena 38.4-44.8 s, active 59.5-69.9 s | unchanged (not touched) |

- Residual vs Atomic Acres (~25 s): three's `compileAsync` is serial by design
  (per object: build nodes, `await` that object's `createRenderPipelineAsync`,
  yield), so 78 precompiled pipelines cost the sum of their latencies = 22.3 s
  wall (after-2b: latency sum 22,306 ms over a 28.4 s span). Farcrysis has ~35
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
- Load: 63-67 s to admission here vs 38-45 s for Atomic Acres. Owner's target
  is "fast"; the residual is the serial compile of ~35 expensive PBR program
  variants (see 3). Options, in order of yield: unify texture-slot sets per
  foliage graph (1x1 neutral maps) and material constants so variants collapse
  (art-owned); or generalise the precompile-before-warm-frame to every arena
  and make the coverage precompile parallel (engine-owned).
- Art quality (owner: "poor, dense-but-cheap-looking vegetation"), the 55+6
  eye-clearance RED spots, collision/cover audit on the real player path,
  spawn reasonableness (HF-402 lane), water crest foam / slope roughness
  (documented unreachable by constants).
- Real-device and Firefox/Edge runs; this lane measured headless Chrome only.

## 7. What I could not verify - OPEN

- Owner-facing look of the arena after the instancing change (no screenshots
  taken; the change is capacity-only by construction, and the arena's
  structural tests are green).
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
- `artifacts/qa/farcrysis-load/*` (force-added; `artifacts/` is gitignored).
- Not committed, deleted: two scratch vitest files used for the offline census
  and build timing (their outputs are in artifacts).
