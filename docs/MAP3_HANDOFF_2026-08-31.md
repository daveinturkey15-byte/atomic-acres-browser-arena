# Map 3 Demo Showcase — handoff, 2026-08-31

You are picking up a half-built feature from another model. Everything you need
is here; read the **Gotchas** section before you write a line of shader code,
because four of the five bugs in this session were things that look like a
different bug than they are.

---

## 1. What this is

Dave wants a new Atomic Acres map that is **100% procedural** — no Blender, no
GLB, no image file, no font. You spawn in the centre of a hub; corridors radiate
out; each is signed at both ends with the technique it demonstrates and takes
5–10 seconds to walk. It is a test bed: once a technique reads well in its
corridor, we know what it costs and what it looks like before deciding whether
to retrofit it into the shipped arenas.

**It is a prototype.** Not published, not on GitHub Pages, local preview only.

### Where it lives

| | |
| --- | --- |
| Worktree | `C:\Users\david\projects\aa-map3` |
| Branch | `contrib/dave-gaming-pc/claude/map3-demo-showcase` |
| Forked from | `atomic-acres-gauntlet` @ `02d9058f` |
| Run | `npx vite --port 41931 --strictPort`, then `http://localhost:41931/map3.html` |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` — must be **0 errors** |
| Geometry check | `npx tsx scripts/map3-validate-geometry.mts` — must be **PASS** |

`node_modules` is a junction to the gauntlet worktree's. Do not `npm install`.

### The shipping line, which is NOT where you might expect

The line that ships PASS 81 is **`atomic-acres-gauntlet`** on
`gauntlet/pass79-omp-20260823`. The older `atomic-acres-highseas` worktree is
**not an ancestor of it** — verified with `git merge-base --is-ancestor`. An
audit earlier today measured the whole codebase on highseas and produced
findings that were already fixed on the shipping line. Confirm with the ancestor
check before believing anything about "the codebase".

**Another Claude thread is working in `atomic-acres-gauntlet` concurrently.**
Never edit that worktree. Map 3 merges later.

---

## 2. Why this is a separate HTML entry

Registering a real arena touches **~80 files across 21 hardcoded rosters**, two
of which are frozen rollback benchmarks (`src/gameplay-contract.ts:54` and the
Pass 65 receipt contract) that must not be edited at all. Doing that before
anyone has looked at the art spends the risky half of the work on content that
may change.

So `map3.html` → `src/map3/main.ts` is a second Vite page. It imports `three`
and `three/webgpu` exactly as the game does and touches **no existing file**.
When the corridors are approved, the corridor modules move into an arena
unchanged and only the registration work remains.

**Consequence you must not forget:** this entry bypasses `legacy-main.ts`'s
bootstrap, so anything that bootstrap installs, this page must install itself.
That has already bitten once — see Gotcha 1.

---

## 3. Current state

### Files

| File | What it is |
| --- | --- |
| `map3.html` | the page |
| `src/map3/main.ts` | bootstrap, hub, signage, FPS controls, diagnostics, wiring |
| `src/map3/leaf-geometry.ts` | cupped/twisted/asymmetric leaf cards, sprays, litter skirts, `mergeGeometries` |
| `src/map3/plants.ts` | tree, conifer, shrub, fallen log, grass tuft, `poissonScatter` |
| `src/map3/foliage-material.ts` | the foliage/bark/floor materials, `rgb()`, wind, `setSun` |
| `src/map3/noise.ts` | value noise, fBM, ridged fBM, domain warp — all as node expressions |
| `src/map3/corridors.ts` | corridors 1–3 and the `Corridor` interface |
| `src/map3/corridors-extra.ts` | corridors 4–6 |
| `src/map3/sky.ts` | dome, SDF sun, SDF planet, clouds, orbit |
| `src/map3/corridor-physics.ts` | corridor 7 — Rapier playground |
| `src/map3/corridor-colosseum.ts` | corridor 8 — **may still be in progress, check it exists** |
| `scripts/map3-validate-geometry.mts` | headless geometry validator |

### The corridors

1. **Nature** — three zones (broadleaf with a before/after split, conifer stand
   with grass and fallen logs, autumn grove). Leaf translucency, cupped leaf
   cards, abaxial shading, senescence, litter skirts, canopy excluded from the
   shadow map.
2. **Maths** — three SDF stations on one parameterised marcher: smooth-union
   blobs, a *limited* domain-repeated lattice, a gyroid.
3. **Grammar** — three rule sets on one pipeline: towers, cottages, and a ruin
   built by a *subtractive* seeded survival test.
4. **Water** — Gerstner shoreline whose foam gate is derived from the band table.
5. **Weather** — four bays, spring→winter, one points cloud serving rain, storm
   rain and snow via per-particle bay index.
6. **Volume** — god-ray march. **Weak — reads as a wash, not distinct beams.**
7. **Physics** — Rapier: Jenga tower, 8 instanced balls with motion ribbons,
   76-brick running-bond wall, `B` rebuilds it.
8. **Colosseum** — amphitheatre, pyramids, better beams. *Verify it landed.*

### Controls

`WASD` walk · `Shift` sprint · `Space` jump · click to look · `Esc` release ·
`1`–`6` solo a corridor · `0` all · `O` shadows · `P` foliage · `H` half-res ·
`B` rebuild the brick wall.

### The HUD line is a diagnostic, read it

`fps · draws · tris · backend · shim N/M · GPU`. If it says `WebGL2-fallback`,
`SOFTWARE RENDERER`, or `shim OFF`, **the numbers below it are meaningless** and
you are looking at a different problem than you think.

---

## 4. Gotchas — read these before writing shader code

Every one of these cost real time today. They all present as something else.

### 1. The Tint chained-swizzle bug — an empty world at full frame rate

**Symptom:** on Chrome 153 + real WebGPU the scene rendered **8 draws / 96
triangles at 57 fps**. Healthy frame rate, empty world, nothing logged on
screen. Everything rendered correctly on the WebGL2 fallback.

**Cause:** three r185's DFGLUT helper returns `texture(lut, uv).rg` and
consumers read `.x`/`.y` off it, so the WGSL builder emits chained swizzles
(`nodeVar.xy.x`). Chrome 153's Tint IR lowering rejects those deterministically
— *"swizzle view instruction still has usages after lowering"* — failing every
pipeline lit via GGX multiscatter, i.e. **every `MeshStandardNodeMaterial`**.
three logs it and carries on. `MeshBasicMaterial` is not lit that way, which is
why the signs were the only survivors.

**Fix:** `installTintSwizzleShim()` from `src/webgpu-tint-swizzle-shim.ts`,
**before `renderer.init()`**. Already wired in `main.ts`. The game installs it at
`legacy-main.ts:1847`; any entry that bypasses that bootstrap needs its own.

**Status: the fix is UNVERIFIED on real hardware.** Dave has not confirmed since
it landed. Get him to check the HUD reads `WebGPU · shim N/M` with N non-zero.

### 2. `vec3(color.toArray())` renders black

TSL's `vec3()` takes scalar components or a node. Handing it a JS array
silently produces a broken node — the material compiles, renders **black**, and
looks exactly like a lighting bug. Use `rgb(hex, scale?)` from
`foliage-material.ts`.

### 3. JS arithmetic on a node produces a literal `NaN` in the shader

`f * 1.7` where `f` is a node evaluates to `NaN`, and three bakes it into the
source as `NaN.0`. The whole fragment program then fails to compile. **Node
arithmetic must use `.mul()`/`.add()`/`.sub()`/`.div()`.** Swept once; keep an
eye out when adding code.

### 4. A raymarcher on a BackSide proxy must march from the CAMERA

Every fragment is on the far wall of the proxy, so starting there and stepping
along the view ray leaves the volume on the first step and always misses. Start
at `cameraPosition`. **Flat colour out of a raymarcher is nearly always a
ray-origin bug, not a distance-function bug.**

### 5. Products of sines are a GRID

`sin(x*a) * cos(z*b)` is a checkerboard by construction, and no number of
octaves of that shape fixes it because they share two axes. Use `noise.ts`,
which hashes and **rotates the domain 0.5 rad between octaves** — the step
people leave out.

### 6. Measurement traps that wasted a whole optimisation round

- The Claude Code preview pane runs **Microsoft Basic Render Driver** and falls
  back to a **WebGL2 backend** — two silent downgrades stacked. An fps measured
  there is not a number.
- `renderer.info` is populated by the render, and `renderAsync` may not have
  completed in the same tick. Sample it at the top of the *next* frame.

**The rule: never optimise a frame you have not bisected, and never trust a
number without knowing which backend and which GPU produced it.**

### 7. `Fn(() => ...)()` for `colorNode` — investigated, NOT the bug

The repo's production TSL assigns built node **expressions** directly
(`farcrysis-tsl-foliage.ts:215`, `farcrysis-water-surface.ts:207`) and this code
now matches that. But the repo *does* ship `Fn(() => ...)()` at
`raytraced-light-node.ts:342`, so `Fn` is not inherently broken. Reserve it for
where `Loop()` needs statement scope. Recorded so you don't re-investigate it.

### 8. `THREE.Points` size does nothing on WebGPU

`PointsNodeMaterial.sizeNode` and `sizeAttenuation` are **inert on the WebGPU
backend**. three's own doc for the class says it: WebGPU supports point
primitives only *"with a pixel size of 1, it's not possible to define a size"*,
and `setupVertex` skips the size branch for an `isPoints` object. On the WebGL2
fallback `gl_PointSize` honours it and everything looks right; on WebGPU every
particle collapses to a single pixel.

Correct on the fallback, wrong on the hardware — the same shape as Gotchas 1
and 6. The precipitation in `corridors-extra.ts` had exactly this and is now
**instanced billboard quads**: same single draw call, size in metres, so
attenuation is the perspective divide. `sky.ts` clouds use the same approach
for the same reason. Do not reach for `THREE.Points` here.

Related: TSL's `pointUV` exists but its `generate()` emits `gl_PointCoord` and
its doc says WebGL-only — it produces invalid WGSL. Use a real `uv` attribute.

### 9. The agent browser console accumulates across page loads

`read_console_messages` returns history from previous navigations, so a fixed
error keeps reappearing and looks live. The **on-screen error panel** only ever
contains errors from the current load — trust that, or check the served module
directly with `fetch('/src/...')`. This nearly caused a second round of chasing
an already-fixed bug.

---

## 5. Codebase rules that are not negotiable

1. **No `ShaderMaterial`, no `RawShaderMaterial`, no `onBeforeCompile`.**
   `three/webgpu` NodeMaterial + TSL only. This is a repo contract.
2. **Batch.** Merge geometry per material, one mesh per material. A pass took
   373 draw calls to 21 this way. `mergeGeometries` expects
   `position/normal/uv/aSpan/aSide/aDead`.
3. **Wood casts shadows; canopy does not.** Excluding the canopy from the shadow
   map is what lets direct sun reach the floor instead of leaf mush. Deliberate.
4. **No coplanar surfaces.** Ground planes sit at −0.35 (world), 0 (hub), +0.03
   (corridor floors). Anything overlaid needs ≥3 cm standoff and polygonOffset.
5. **Everything procedural.** No imported mesh, image, font, or LUT.
6. **`dispose()` must release every geometry and material** the corridor made.
7. `tsc` clean before every commit.

### The `Corridor` interface

```ts
interface Corridor {
  group: THREE.Group;
  update(elapsed: number, dt: number): void;
  dispose(): void;
  foliage?: FoliageUniforms;   // expose so the real sun drives leaf transmission
  length: number;
  title: string;
  skill: string;               // printed on the sign at both ends
}
```

---

## 6. What is left — Dave's spec, verbatim intent

Ordered as he asked for it. Estimates are agent-hours.

### A. Water rework — 1.5–2 h
His words: *"I can see you've tried to make the shoreline but it doesn't look
good, so adjust it and expand it, and actually see it interacting with objects
and physics objects."* Needs buoyancy against the Gerstner height field, and
objects that float, bob and splash.

### B. Vehicle through vegetation — 2.5–3 h, **read the warning**
*"a basic truck or car, wheel and gently steering it around, pushing the trees
aside, pushing the grass down, maybe rebound."*

**Architectural tension, flagged before you start:** the forest is merged into
batched static meshes for performance. Per-tree bending needs per-instance
state. The right answer is `InstancedMesh` with a per-instance bend attribute
the vertex graph reads, **not** un-batching. Budget accordingly — this is why
it is 2.5–3 h and not 1.

### C. Car through water → splash — 0.5 h, after A and B
### D. Heavier-rain zones — 0.5 h
Weather corridor already keys everything off a bay index; extend that field.
### E. Animated machinery from physics — 1 h
`corridor-physics.ts` already has a machinery section; extend it.
### F. Volumetrics reacting to physics objects — 1 h
### G. Fix corridor 6's beams — 0.5 h
Currently a wash rather than distinct beams. The colosseum corridor may already
have solved this; check it and reuse.
### H. Integration, perf pass, verification — 1 h

**Total ~8–9 h agent time.**

### Later, not now
Register as a real arena (~80 files, 21 rosters). Only after Dave approves the
art. The `ARENA_SELECTIONS` list in `src/map-selection.ts` is the one that
silently falls back to Nuke Town if you miss it — the "published but
unselectable" failure.

---

## 7. How to verify anything

1. `npx tsc --noEmit -p tsconfig.json` → 0 errors.
2. `npx tsx scripts/map3-validate-geometry.mts` → PASS.
3. Load the page and **read the HUD**. Backend, shim and GPU must all be right
   before any visual or performance claim.
4. Watch for the red error panel at the top — it captures shader compile
   failures that would otherwise be invisible.
5. **You cannot verify WebGPU from an agent preview pane.** It has no WebGPU
   adapter. Ask Dave to look, and ask him what the HUD says. Do not substitute a
   guess; that mistake has already been made twice in this session.

---

## 8. Working agreements

- Dave runs ComfyUI, ollama and llama.cpp on this machine. Check load before
  heavy jobs; never kill his processes.
- Never open a QA browser on his main screen — headless, or
  `--window-position=2560,0`.
- MiniMax H3 is **licence-blocked** here: its Community Licence excludes the UK
  for the model *and its output*. WAN 2.2 is Apache-2.0, already downloaded at
  `Desktop/stuff/Comfy Fun/ComfyUI_portable/ComfyUI/models/diffusion_models/`,
  and is the substitute.
- Report honestly. If something is weak, say so. Two corrections in this session
  came from claiming quality without looking at the output — the procedural
  jungle was called "better" than a reference on renderer version and line count
  alone, and it was not.
