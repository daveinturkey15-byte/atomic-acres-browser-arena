# Neural rendering, DLSS 5, and what is actually reachable from this build

**Ledger row:** HF-415. **Lane:** AI (graphics profiles and neural rendering).
**Written:** 2026-09-03. **Renderer:** three r185 WebGPU + TSL, WebGPU only
(the WebGL2 fallback was retired 2026-08-30).

Owner's question, verbatim (2026-09-02 ~17:50 BST):

> "Also this DLSS5 general stuff ... possible to use somehow as an option to
> make our game look cool? dont need better FPS via AI as that would reduce
> latency, but do need cooler looking stuff options?"

**The short answer.** DLSS 5 itself is unreachable — it is a driver/SDK feature
that a web page has no way to call, on any GPU, in any browser. But the thing
the owner actually wants ("cooler looking stuff, not more FPS") is reachable,
and the biggest win of the three has nothing to do with neural networks: it is
a path-traced lighting **bake** done at build time, which costs zero runtime
frames because the expensive part happens on this machine and ships as data.

Claim-states are marked per line. **VERIFIED** means this lane measured it or
read it in a primary source; **CLAIMED** means a source asserts it and this
lane did not check; **OPEN** means unresolved.

---

## 1. What DLSS 5 "3D-Guided Neural Rendering" actually is

Primary source: NVIDIA's own announcement page,
`https://www.nvidia.com/en-us/geforce/news/dlss-5-3d-guided-neural-rendering/`
(read 2026-09-03).

| Fact | Claim-state | Source |
|---|---|---|
| It is **not** upscaling and **not** frame generation. It is a generative stage that repaints lighting, materials and shadowing on an already-rendered frame. | VERIFIED (NVIDIA page) | "the final rendering stage of the graphics pipeline" |
| Its inputs are the engine's finished frame plus engine buffers: colour, motion vectors, surface albedo, detailed lighting, surface normals. | VERIFIED (NVIDIA page) | quoted list of "engine data" |
| It runs on the Tensor Cores of **GeForce RTX 50-series only**, locally, on one GPU. | VERIFIED (NVIDIA page) | "all GeForce RTX 50 Series GPUs and laptops" |
| It ships through the **NVIDIA Streamline** framework and an Unreal Engine 5 plugin. | VERIFIED (NVIDIA page) | named integration channels |
| Artists keep control through "Structure Intensity", "Tone Intensity", semantic AI masking and engine-level per-object masking. | VERIFIED (NVIDIA page) | named controls |
| Launch title NBA 2K27, 2026-09-03. The headline "370 fps at 4K on a 5090" figure leans on Multi Frame Generation 6x and Performance-mode upscaling, i.e. it is not a neural-rendering figure. | CLAIMED (press paraphrase — Tom's Hardware, TheFPSReview) | not on the NVIDIA page in that form |
| Press framing ("biggest leap in rendering since 3D itself") is marketing, not a measurement. | VERIFIED as press paraphrase (wccftech) | — |

### Why it is not reachable from a browser

This is a hard boundary, not a missing flag. **VERIFIED** by reading the shape
of the integration and the shape of the web platform:

1. **It is delivered as a driver/SDK feature.** Streamline is a native C++
   layer that sits between a DirectX 12 or Vulkan renderer and the driver. A
   web page has no DirectX and no Vulkan; it has WebGPU, which is a separate
   API with no vendor-extension escape hatch.
2. **WebGPU has no binding for it, and no mechanism that could grow one
   privately.** WebGPU deliberately exposes no vendor extensions: the feature
   list is a fixed enumeration in the specification. There is no
   `navigator.gpu` route to Streamline, DLSS, NGX, or any NVIDIA SDK.
3. **The inputs it needs are not the blocker; the execution path is.** We
   could produce albedo/normal/motion buffers in TSL tomorrow. There is
   nothing to hand them to.
4. **The same boundary already bites one rung down.** WebGPU exposes no
   hardware ray tracing either: no ray-query, no acceleration-structure API.
   Ray tracing is blocked on bindless resources and is not committed to by the
   working group (**CLAIMED** — gpuweb issue #535 and the implementation-status
   wiki; earliest plausible 2027 "if ever"). This is why the build's RAY TRACED
   preset is genuine software recursive ray tracing and is never called RTX.

**Corollary the owner should hear plainly:** any future "DLSS in the browser"
would require NVIDIA to ship it through a standardised WebGPU feature that all
browser vendors implement. That is not on any roadmap this lane could find.

### The one neural-rendering primitive that *is* on a standards track

**Cooperative vectors / cooperative matrix** — the hardware path that makes
small neural networks cheap enough to run *inside* a pixel shader. It is
shipped in DirectX 12 (Shader Model 6.9) and Vulkan, and NVIDIA's Neural
Texture Compression SDK uses it for a claimed 2-4x inference throughput on Ada
and Blackwell (**CLAIMED** — NVIDIA-RTX/RTXNTC; arXiv 2506.06040 reports up to
23x over a compute FMA implementation). In WebGPU, subgroup-based cooperative
matrix multiplication is listed as **under active development** in the
implementation-status wiki (**CLAIMED**, not shipped).

What *is* shipped in Chrome today and usable by us: **`shader-f16`**,
**`subgroups`** and **`subgroup-size-control`** — **VERIFIED on the owner's own
adapter**, not inferred from release notes. `probe-webgpu-adapter-features.mjs`
run headless on this machine on 2026-09-03 reports an `nvidia` / `blackwell`
adapter (`isFallbackAdapter: false`) advertising all three, and **no**
cooperative-matrix or cooperative-vector feature. The same probe reports the
adapter's ray-tracing surface as **an empty list**: none of its 24 features
matches `/ray|accel|bvh|rtx|traversal/`. That is the measured basis for §1's
boundary rather than a repeated assertion.

This build requests none of the three: `OPTIONAL_WEBGPU_DEVICE_FEATURES` in
`src/rendering/render-runtime.ts` is exactly
`['rg11b10ufloat-renderable', 'float32-filterable']` (**VERIFIED** — read at
head, and both were granted on the device). So the primitives for a small
learned pass are present and unused. §3 explains why this lane recommends
leaving them unused.

---

## 2. What IS reachable, ranked by visual payoff per frame-millisecond

Nine candidates were considered. Feasibility is against *this* stack: three
r185, WebGPU, TSL/NodeMaterial only, original procedural art only, and an
admission fence that a preset must not blow.

| # | Option | Feasible here? | Cost class | Visual payoff | First experiment |
|---|---|---|---|---|---|
| A | **Path-traced lightmap / irradiance-probe BAKE at build time** (three-gpu-pathtracer class, offline) | **Yes** — arenas are code-authored and deterministic, so a build step can trace them once and ship the result as data | **Zero runtime cost**; build time and asset bytes only | **Highest.** Soft indirect light, colour bleed and contact darkening on every static surface. This is what "beautiful lighting" looks like when it is not being chased per frame | Bake ONE arena (Nuke Town / atomic-acres) at low resolution, ship as a second UV set + lightmap, A/B the review cameras |
| B | **Classic ray-traced preset, sized to the fence** (route 3 — already shipped as RAY TRACED) | **Already shipped**; the remaining work is menu-time precompile and coverage | Measured: see the audit doc | High for reflective surfaces; zero for matte ones | Precompile the trace pipeline while the menu preview plays, then re-measure cold admission |
| C | **Hybrid soft shadows + one bounce over a BVH** (route 2) | Yes, but it is the big one: BVH build, compute rays, temporal denoiser | High, and a new per-frame structure | High — soft area shadows are the single most "RTX-looking" thing there is | Soft shadow rays only, one arena, one light, behind a Custom toggle |
| D | **Screen-space GI + GTAO done properly** (route 4) | Already shipped at MAX; the work is making it affordable lower down | Moderate | Moderate — it cannot bounce light from outside the frustum, and it shows | Measure SSGI low vs off on BALANCED-class settings |
| E | **Learned tonemap / material-response post pass** (a tiny MLP in WGSL, `shader-f16` + `subgroups`) | Yes, technically | Low per frame; high in authoring effort and risk | **Low, and dangerous.** It repaints the image, which is exactly the class of change that breaks the combat-safety envelope the grade chain is bounded by | Not recommended — see below |
| F | **Neural texture compression run as WGSL** | Only as a compute-FMA implementation (no cooperative vectors in WebGPU yet) | Moderate per sample | Low here — this build authors its materials procedurally and imports no textures, so there is nothing to compress | Not applicable to this project |
| G | **Better temporal AA quality modes** | Yes | Low | Moderate — stabilises the shimmer BALANCED's SMAA leaves | Prototype TAA behind Custom, compare edge stability on the review cameras |
| H | **HDR output** (`configureHighDynamicRange`) | Browser + OS + display dependent | Low | High *on an HDR display only*; nothing on an SDR one | Probe display capability headless, then gate the control on it |
| I | **Volumetrics done as a froxel grid rather than a per-pixel march** | Yes | Moderate | Moderate — cheaper shafts, which would let BALANCED have them | Replace the 24-step march on QUALITY, measure |

### Why option E is a recommendation *against*

The owner explicitly does not want AI that costs latency. A learned post pass
is cheap in milliseconds, so latency is not the objection. The objection is
this: this build's entire grading chain is bounded by an enforced
combat-safety envelope — shadow toe never lifts blacks above ~5% display
luminance, midtone contrast never exceeds 0.3, bloom thresholds stay above 1.0
so nothing washes out a sightline, and `assertScreenSpacePostCombatSafety`
throws at graph construction if a value escapes (**VERIFIED** — read in
`src/rendering/grade-profile.ts` and `screen-space-post-profile.ts`). A learned
network has no such bound and cannot be given one by inspection: you cannot
prove a trained function will not darken the pixel an enemy is standing in.
DLSS 5's own answer to this is artist masking and intensity sliders, which is
an admission that the model changes the image in ways the author did not choose.

In a competitive FPS that is not a look setting; it is a fairness setting.
**Recommend: no learned pass over the final image, in any profile, unless it is
provably bounded the way every other stage in this chain already is.**

---

## 3. The recommendation: three options, in this order

**1. Path-traced lighting BAKE at build time (option A). Do this one.**
It is the biggest visible win available, it costs zero frames, and it is the
one that answers what the owner actually asked for on 2026-09-02 19:10 — "when
i say ray tracing i mean the beautiful lighting etc, get it all working in a
nice way that wont murder FPS ... its more about the assets and sensible
lighting than balls to the wall". Bounded first experiment: one arena, one
bake, one A/B against the existing review cameras. It also composes: baked
irradiance is precisely the indirect-light supply that classic ray tracing
(the RAY TRACED preset) does not compute, so it makes that preset look better
without touching its frame cost.

**2. Finish the RAY TRACED preset properly (option B).**
It already ships and it already admits (measured — see the audit doc). What it
lacks is menu-time pipeline precompile, so its cold first frame is paid where
the fence does not apply, and reflective coverage in the arenas that currently
have little to reflect. Bounded first experiment: precompile during the menu
preview, then re-measure cold admission on the same three arenas.

**3. Hybrid soft shadows, one light, behind Custom (option C) — stretch only.**
Soft area shadows are the single most convincing "ray-traced" cue, and unlike
reflections they improve matte surfaces, which is most of every arena. But it
is a BVH plus a compute pass plus a temporal denoiser, and it lands on the
admission frame. It should not be started until (1) has shipped and been
looked at, because a good bake may make it unnecessary.

**Explicitly not recommended:** any learned/neural pass over the final image
(option E), and neural texture compression (option F), which has nothing to
compress in a build with no imported textures.

---

## 4. Open items

- CLOSED (VERIFIED 2026-09-03): the owner's adapter advertises `shader-f16`,
  `subgroups` and `subgroup-size-control`, and no cooperative-matrix feature.
  The build requests none of them, so nothing depends on this today; it is the
  capability floor for option E if that recommendation is ever overturned.
- OPEN: option A (the bake) needs a second UV set per arena and a build step.
  Neither exists. Sizing that is the first hour of the experiment, not this doc.
- OPEN (owner decision): the native RTX runtime (route 1 of the shared skill
  `threejs-rtx-runtime-route`). It is the only route that reaches RT cores, and
  it is a second product with its own installer, updates and visual baseline —
  never an agent's call. The in-game RTX entry now explains exactly this and
  changes nothing (HF-418).
- OPEN: HDR output (option H) needs a display-capability probe before it can
  be offered as a control, or it becomes an orphan option.

## Sources

- [NVIDIA — DLSS 5: 3D-Guided Neural Rendering](https://www.nvidia.com/en-us/geforce/news/dlss-5-3d-guided-neural-rendering/)
- [Tom's Hardware — DLSS 5 launch date and first benchmarks](https://www.tomshardware.com/pc-components/gpus/nvidias-controversial-dlss-5-will-launch-september-3-with-nba2k27-available-on-all-rtx-50-series-gpus-laptops-and-geforce-now)
- [gpuweb — Ray Tracing extension (issue #535)](https://github.com/gpuweb/gpuweb/issues/535)
- [gpuweb — Implementation Status wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- [Chrome for Developers — What's New in WebGPU (subgroups, shader-f16)](https://developer.chrome.com/blog/new-in-webgpu-133)
- [NVIDIA-RTX/RTXNTC — Neural Texture Compression SDK](https://github.com/NVIDIA-RTX/RTXNTC)
- [Hardware Accelerated Neural Block Texture Compression with Cooperative Vectors (arXiv 2506.06040)](https://arxiv.org/pdf/2506.06040)
- [gkjohnson/three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)
