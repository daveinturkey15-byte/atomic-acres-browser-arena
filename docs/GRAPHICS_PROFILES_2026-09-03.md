# Graphics profiles: what each one is, what it delivers, and what it costs

**Ledger rows:** HF-414 (clarity), HF-418 (the ladder). **Lane:** AI.
**Written:** 2026-09-03. **Base:** integration head `714d4121` (PASS 85 live).
**Renderer:** three r185 WebGPU + TSL. WebGPU only — the WebGL2 fallback was
retired 2026-08-30 and survives as a demotion path, not as a profile.

Owner's question, verbatim (2026-09-02 ~17:50 BST):

> "we need a clearer understanding of the capabilities of webGPU and our
> settings of performance, quality, max, and RTX. Is RTX above or below max,
> and is it just based off quality but then only works on nvidia cards? ...
> Research and ensure our graphic profiles are clear as to what they are and
> what they deliver and how/why etc"

Every row carries a claim-state. **VERIFIED** = this lane measured it or read
it at head. **CLAIMED** = asserted elsewhere and not re-checked here.
**OPEN** = unresolved.

---

## 0. The three answers, first

**Q: Is RTX above or below MAX?**
**A (VERIFIED, measured):** neither, because there is no RTX profile. The
fourth rung is called **RAY TRACED**, and in COST it sits *between* QUALITY and
MAX — closer to QUALITY. In VISUALS it is not "more than MAX"; it is a
different trade. MAX has more of everything screen-space (GI, reflections,
shafts, AO, depth of field, supersampling); RAY TRACED has one thing MAX does
not have at all — reflections computed against real geometry, including
geometry that is off screen — and it pays for that by *dropping* 4x
multisampling and screen-space reflections rather than by adding to MAX.

**Q: Is it just QUALITY plus a ray-traced pass?**
**A (VERIFIED, from the control sets):** no. Against QUALITY it changes six
controls: `antiAliasing` msaa-4x → smaa, `screenSpaceReflections` low → off,
`ambientOcclusion` off → high, `reflectionQuality` high → ultra, `anisotropy`
8 → 16, `rayTracing` off → reflections (plus grain/vignette/rain/air nudges).
Two of those are reductions. It buys the trace; it does not stack it.

**Q: Does it only work on NVIDIA cards?**
**A (VERIFIED, measured on this machine's adapter):** no. It requires the
**WebGPU renderer** and nothing else. There is no vendor check anywhere in the
gate: `resolveGraphicsRuntime` demotes RAY TRACED to QUALITY on exactly one
condition — `capability.rayTracingCapable === false`, which is set when the
renderer fell back to WebGL2, because the trace is built inside the TSL/HDR
graph that only exists on the WebGPU route. AMD and Intel WebGPU adapters run
it identically. It also uses **no ray-tracing hardware at all**: no shipping
browser exposes a ray-query or acceleration-structure API, so RT cores are
unreachable from a tab on any GPU. See §5 for the measured adapter feature list.

**And the thing the owner was really pointing at:** hardware RTX rendering
needs a **native runtime** (Three.js/TSL on top, native Vulkan underneath, no
browser). That is a separate downloadable product that does not exist for this
game yet. HF-418 turns the RTX entry in the settings menu into an explainer
that says exactly this and changes nothing (§6).

---

## 1. The ladder as shipped after HF-418

| Order | Menu label | Internal id | What it is |
|---|---|---|---|
| 1 | PERFORMANCE | `performance` | Lowest gameplay-safe profile. Sub-native render scale, no shadows, no AA, screen-space stack structurally absent. |
| 2 | **BALANCED** *(new)* | `balanced` | **HF-418.** Native resolution, shadows, full geometry and QUALITY's grade — without the passes that add a target, an attachment or a march. |
| 3 | QUALITY | `high` | The intended look, and the auto-selected default on 8+ cores / 8+ GB. |
| 4 | RAY TRACED | `raytraced` | Classic recursive (Whitted) ray tracing in shaders. Software. Any WebGPU adapter. |
| 5 | MAX | `max` | Every effect at its highest tier plus a 1.15x supersample. |
| 6 | CUSTOM | `custom` | The last named profile plus the player's edits. |
| — | RTX — WHAT IS IT? | `rtx-native-runtime-info` | **Not a profile.** Opens an explainer; changes no renderer setting. |

Order matters and is pinned: before HF-418 the list led with QUALITY (because
it is the default), which made PERFORMANCE below it read as a step *up*.

---

## 2. The control sets, in rendering terms

All 40 controls, per profile. The "what it does" column is the rendering
meaning, not the label.

| Control | Rendering meaning | PERFORMANCE | BALANCED | QUALITY | RAY TRACED | MAX |
|---|---|---|---|---|---|---|
| `renderScale` | Fraction of the window actually rendered, then resampled | 0.75 | **1.00** | 1.00 | 1.00 | **1.15** (supersample) |
| `adaptiveResolution` | Distress valve; demotes under sustained frame pressure | on | on | on | on | on |
| `targetFps` | Adaptive workload target (not a limiter) | 240 | 240 | 240 | 240 | 240 |
| `frameRateLimit` | 0 = uncapped presentation | 0 | 0 | 0 | 0 | 0 |
| `antiAliasing` | 0/2/4-sample principal HDR target, or a display-side post pass | off | **smaa** (post) | **msaa-4x** | **smaa** (post) | **msaa-4x** |
| `geometryDetail` | Authored (`blender`) vs reduced representation | reduced | full | full | full | full |
| `shadows` | Sun shadow map on/off | **off** | high | high | high | high |
| `shadowResolution` | 1024 (medium) vs 2048 (high) shadow map | medium | **medium** | high | high | high |
| `shadowUpdateMode` | Static bake vs per-frame re-render | static | static | static | static | **dynamic** |
| `shadowFilter` | PCF vs PCSS-soft selection | auto | auto | auto | auto | auto |
| `indirectLighting` | Scalar on environment contribution (0 / 0.62 / 1) | low | **high** | high | high | high |
| `ambientOcclusion` | GTAO: resolution scale, samples, radius, denoise | off | off | off | **high** (0.5 scale, 12 spl, denoise) | **ultra** (0.75, 16 spl) |
| `screenSpaceReflections` | Depth-buffer march; **adds normal + material MRT attachments** | off | **off** | low (½-res, 6 m) | **off** (superseded by the trace) | high (¾-res, 12 m, binary refine) |
| `screenSpaceGi` | Room-scale bounce gather — the expensive one | off | off | off | off | high (2×12, 8 m) |
| `rayTracing` | World-space recursive trace against the analytic proxy set | off | off | off | **reflections** | off |
| `reflectionQuality` | Baked PMREM probe resolution (load-time cost only) | low | **high** | high | **ultra (512)** | ultra |
| `environmentIntensity` | IBL multiplier | 1 | 1 | 1 | 1 | 1 |
| `volumetricQuality` | Mist/fog density scale (0.5 / 0.8 / 1.0) | low | high | high | high | ultra |
| `volumetricLightShafts` | Per-pixel raymarch of the sun shadow map | off | **off** | low (24 steps, gain 0.14) | low | high (48 steps, gain 0.22) |
| `smokeQuality` | Smoke capacity scale (gameplay-visible; parity-bound) | low | high | high | high | ultra |
| `particleQuality` | Particle capacity ceiling | low | high | high | high | ultra |
| `anisotropy` | Max anisotropic sampler taps | 4 | 8 | 8 | 16 | 16 |
| `decalQuality` | Decal capacity scale | low | high | high | high | ultra |
| `bloomQuality` | Bloom strength (0 / 0.065 / 0.14) over a stage that always exists | subtle | **cinematic** | cinematic | cinematic | cinematic |
| `exposure` | Exposure scale | 1 | 1 | 1 | 1 | 1 |
| `toneMapping` | ACES / AgX / neutral | aces | aces | aces | aces | aces |
| `filmicProfile` | Grade profile override; `arena-default` follows the preset | arena-default | arena-default | arena-default | arena-default | arena-default |
| *(effective grade)* | Which `GRADE_PROFILES` entry the preset maps to | performance | **quality** | quality | max | max |
| `sharpness` | CAS sharpen amount | 0 | 0 | 0 | 0 | 0 |
| `filmGrain` | Per-frame luminance grain scale | 0.10 | 0.24 | 0.32 | 0.36 | 0.40 |
| `vignette` | Display-side falloff | 0.08 | 0.14 | 0.16 | 0.17 | 0.18 |
| `depthOfField` / `…Strength` | Bokeh on the linear side (replaces pixels) | off / 0.3 | off / 0.3 | off / 0.3 | off / 0.3 | **on / 0.6** |
| `motionBlur` | Velocity smear (removes information) | 0 | 0 | 0 | 0 | **0.35** |
| `spatialUpscaling` | FSR 1 EASU+RCAS; renders BELOW native | off | off | off | off | off |
| `weatherIntensity` | Presentation CEILING on the rolled weather | **light** (caps) | storm | storm | storm | storm |
| `rainDensity` | Streak instance count multiplier | 0.5 | **0.75** | 1.0 | 1.15 | 1.35 |
| `windStrength` | Authored per arena; no preset re-authors it | 1 | 1 | 1 | 1 | 1 |
| `lightning` | Flash events | **off** | on | on | on | on |
| `wetSurfaces` | Writes wetness into arena materials | on | on | on | on | on |
| `ambientLife` | Fraction of the authored ambient population kept alive | 0.6 | 0.8 | 1.0 | 1.15 | 1.5 |

**Control-set fingerprints** (FNV-1a over the key-sorted control set; pinned by
`src/graphics-profile-contract.test.ts`, which fails if a preset changes and
this document does not):

| Profile | Control-set hash |
|---|---|
| `performance` | `dac3ca1e` |
| `balanced` | `7cc8f8b7` |
| `high` (QUALITY) | `df46a580` |
| `raytraced` | `e4ccbbd2` |
| `max` | `5aa0e356` |

---

## 3. Measured cost

**Method (VERIFIED).** `scripts/qa/audit-graphics-profiles.mjs`, one fresh
headless Chrome per row (fresh user-data dir, therefore a **cold** shader
cache), 2560x1440, real WebGPU backend confirmed per row, the real Options
surface driven exactly as the owner drives it (select → SAVE GRAPHICS → arena →
solo). Frame figures come from the renderer's own presented-frame sampler
(`completionPacing`); `rateHz` is frames ÷ elapsed over the retained window,
which is the only cadence figure that survives bursty pacing — a median gap is
not a frame rate. Draw calls and triangles are the last *admitted* frame.
Pipelines are counted by wrapping `GPUDevice.createRenderPipeline(+Async)`
before any page script runs.

**Honesty about the machine (VERIFIED).** This is the owner's shared
workstation and five other PASS 86/87 lanes were running against the same GPU
during the sweep. Free VRAM moved between 1.7 GB and 8.8 GB across the window.
Run-to-run spread on a single cell is therefore large, and single-cell
differences under about 15% carry no signal. What the table supports is the
ORDERING of the profiles, which is consistent across arenas, and the
categorical facts (admitted / not admitted, pipelines in combat, draw counts),
which are not noise-sensitive.

| Profile | Arena | Pass | Deploy (s, cold) | Frames/s | Median ms | p95 ms | p99 ms | >33 ms | Draws | Tris | Pipelines @admission | Pipelines in combat | GPU busy? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PERFORMANCE | atomic-acres | p1 | 33.3 | 45.7 | 16.3 | 41.9 | 67.1 | 30 | 150 | 289k | 297 | 0 | not stamped |
| PERFORMANCE | atomic-acres | p2 | 35.2 | 55.3 | 14.3 | 38.5 | 48.1 | 16 | 155 | 289k | 297 | 0 | not stamped |
| PERFORMANCE | high-seas | p1 | 23.3 | 59.7 | 12.3 | 34.4 | 44.3 | 12 | 105 | 233k | 222 | 0 | not stamped |
| BALANCED | atomic-acres | p2 | 48.3 | 55.7 | 15.3 | 30.0 | 38.9 | 6 | 186 | 540k | 375 | 0 | not stamped |
| QUALITY | atomic-acres | p1 | 35.9 | 55.0 | 15.6 | 33.0 | 40.9 | 9 | 194 | 537k | 374 | 0 | not stamped |
| QUALITY | skyline-terminal | p1 | 36.8 | 66.5 | 13.5 | 27.6 | 37.3 | 4 | 127 | 58k | 300 | 0 | not stamped |
| QUALITY | high-seas | p1 | 43.5 | 63.9 | 12.7 | 36.1 | 42.8 | 10 | 127 | 217k | 248 | 0 | not stamped |
| RAY TRACED | skyline-terminal | p1 | 37.6 | 60.0 | 14.4 | 29.9 | 34.1 | 4 | 125 | 59k | 307 | 0 | not stamped |
| RAY TRACED | high-seas | p1 | 51.6 | 54.2 | 13.7 | 42.3 | 51.2 | 20 | 127 | 214k | 259 | 0 | not stamped |
| MAX | skyline-terminal | p1 | 52.7 | 43.9 | 19.6 | 42.8 | 47.4 | 23 | 239 | 83k | 392 | 0 | not stamped |
| MAX | high-seas | p1 | 64.7 | 43.0 | 21.4 | 42.0 | 47.6 | 14 | 263 | 265k | 364 | 0 | not stamped |

Missing cells (VERIFIED as not measured, not as failures): RAY TRACED and MAX
on atomic-acres, MAX and BALANCED on skyline-terminal and high-seas, BALANCED
on high-seas. The sweep was interrupted twice — once by a script defect (a
preset that stages a renderer reconstruction RELOADS the page, and the first
version of the harness read the debug handle off the torn-down window), and
once by the owner's ComfyUI taking the GPU. The audit script now refuses to
launch while ComfyUI has work queued, which is why the last rows are absent
rather than wrong.

### What the table supports

1. **Every profile ADMITS on every arena measured, with zero page errors.**
   11 rows, `admissionOutcome: "admitted"`, `backend: "webgpu"`, `errors: 0`.
   That is the headless boot smoke for the ladder. **VERIFIED.**
2. **The tripwire is clean: `pipelinesInCombat` is 0 on every single row.**
   No profile compiles a WebGPU render pipeline while a settled match is being
   played. Every pipeline is built during admission (222-392 of them). This is
   the measurement that matters most for the owner's freeze reports, and on
   these arenas and profiles it is clean. **VERIFIED.**
3. **The cost ordering, consistent across arenas: MAX ≫ RAY TRACED ≈ QUALITY ≈
   BALANCED > PERFORMANCE.** MAX is the only profile that separates from the
   pack by more than the noise: 19.6-21.4 ms median against 12.3-15.6 ms for
   everything else, 43-44 frames/s against 45-67. **VERIFIED.**
4. **RAY TRACED is NOT more expensive than MAX — it is close to QUALITY.** On
   skyline-terminal, RAY TRACED 14.4 ms median / 60.0 fps against QUALITY's
   13.5 / 66.5 and MAX's 19.6 / 43.9. That is the direct answer to "is RTX
   above or below max": in cost it is below, clearly. **VERIFIED.**
5. **Draw calls rank the way the control sets predict.** atomic-acres:
   PERFORMANCE 150-155, BALANCED 186, QUALITY 194. skyline-terminal:
   RAY TRACED 125, QUALITY 127, MAX 239. MAX's extra passes are visible as
   extra draws, and BALANCED sits where its control set says it should.
   **VERIFIED.**
6. **Nothing came close to the queue-completion fence.** Peak completion
   latency across all rows was 86.8-180.1 ms against a 12 000 ms fence.
   **VERIFIED.**
7. **The PASS 78 MAX cold-compile P0 (5.17-6.54 s against a 4000 ms bound) did
   not reproduce.** MAX admitted on both arenas measured. The old figure is not
   refuted — different head, different method — but the current state is
   "admits". **VERIFIED for these two arenas; OPEN for the rest.**

### What the table does NOT support, said plainly

- **Any single-cell comparison under ~15%.** PERFORMANCE on atomic-acres
  measured 45.7 fps in pass 1 and 55.3 fps in pass 2 on an identical control
  set: a 21% swing from machine load alone. Do not read BALANCED-vs-QUALITY
  from one cell.
- **BALANCED being faster than QUALITY.** The one BALANCED cell (atomic-acres,
  55.7 fps / 15.3 ms) is indistinguishable from QUALITY's (55.0 / 15.6) on the
  same arena, on a 5080 that is not the machine BALANCED exists for. Its p95 is
  better (30.0 vs 33.0 ms) and its long-frame count is much better (6 frames
  over 33 ms vs 9), which is the shape you would expect from dropping MSAA 4x
  and SSR, but a 5080 at 1440p is not where that gap opens up. **OPEN: BALANCED
  needs a measurement on a mid-range GPU before its "runs nice" claim is
  evidence rather than reasoning.** The in-game copy is written to survive that:
  it claims a control set and a set of omissions, not a frame rate.
- **VRAM.** `nvidia-smi` reports the whole GPU on a machine shared with the
  owner's ComfyUI and five other lanes; the deltas ranged from -4488 MiB to
  +8548 MiB and are noise. Reported for completeness, usable for nothing.

### One live observation the sweep produced for free

Every row records the canvas backing store. **PERFORMANCE renders a 1920x1080
canvas inside a 2560x1440 viewport on every arena** — exactly 0.75 — which is
direct runtime proof that `renderScale` executes, one of the 39 controls §4
lists as grep-verified only. It is the cheapest live observation in the whole
registry and it came from a field the harness was already collecting.

The same field raises a question: **MAX's canvas is also 2560x1440, not the
2944x1656 its 1.15 supersample would give.** The likely mechanism is the
adaptive valve — `configuredAdaptiveQualityLevels` builds tiers as fractions of
the selected scale and `adaptiveResolution` is `true` on MAX by design — so
under sustained frame pressure it settled a tier below its own cap. If that is
right, MAX was not actually supersampling during this sweep on an RTX 5080 at
1440p on a shared machine, which is worth the owner knowing. **OPEN:** confirm
by reading the live pixel-ratio tier rather than inferring it from the canvas;
the snapshot does not currently expose it, which is itself a gap.


---

## 4. Honesty column: what "verified" means for each control

`ADVANCED_GRAPHICS_RUNTIME_EVIDENCE` carries two different strengths of claim
and the registry now says which is which (the distinction was written into the
file after the 2026-08-31 IBL first-arena bug, where a row pointed at a real
symbol in a real file inside a function the first arena of every page load
never reached, and nine unit tests passed over the top of it for weeks).

**Measured at head (VERIFIED): 1 of 40 controls has a live observation.**

| Strength | Count | Controls |
|---|---|---|
| **Live, fail-closed observation of the running scene** | 1 | `environmentIntensity` |
| **Source grep only** — proves the consumer EXISTS, not that it RAN | 39 | `renderScale`, `adaptiveResolution`, `targetFps`, `frameRateLimit`, `antiAliasing`, `geometryDetail`, `shadows`, `shadowResolution`, `shadowUpdateMode`, `shadowFilter`, `indirectLighting`, `ambientOcclusion`, `screenSpaceReflections`, `screenSpaceGi`, `rayTracing`, `reflectionQuality`, `volumetricQuality`, `volumetricLightShafts`, `smokeQuality`, `particleQuality`, `anisotropy`, `decalQuality`, `bloomQuality`, `exposure`, `toneMapping`, `filmicProfile`, `sharpness`, `filmGrain`, `vignette`, `depthOfField`, `depthOfFieldStrength`, `motionBlur`, `spatialUpscaling`, `weatherIntensity`, `rainDensity`, `windStrength`, `lightning`, `wetSurfaces`, `ambientLife` |

This lane did **not** fix the verifiers (out of scope — the brief asks for the
list, not the repair). The list above is that report. The highest-value
repairs, in order, are the controls whose failure would be invisible *and*
visually large: `shadows`, `shadowResolution`, `indirectLighting`,
`reflectionQuality`, `screenSpaceReflections`, `volumetricLightShafts`.

---

## 5. WebGPU capability, measured on this machine

**Measured (VERIFIED)** by `scripts/qa/probe-webgpu-adapter-features.mjs`,
headless Chrome, `--enable-unsafe-webgpu`, on the owner's machine 2026-09-03.
Raw: `docs/evidence/pass87/graphics-profiles/webgpu-adapter.json`.

| Question | Measured answer |
|---|---|
| Adapter | `vendor: nvidia`, `architecture: blackwell`, `isFallbackAdapter: false` — a real hardware device, not the software rasteriser |
| **Any ray-tracing surface at all?** | **`[]` — none.** No ray-query, no acceleration structure, no vendor extension. The adapter advertises 24 features and not one of them matches `/ray\|accel\|bvh\|rtx\|traversal/`. This is the measured basis for every "no hardware ray tracing in a browser" statement in this build. |
| Features the app requests (allowlist) | `rg11b10ufloat-renderable`, `float32-filterable` |
| Features the DEVICE was granted | both of the above, plus `core-features-and-limits` |
| Neural-inference surface present | `shader-f16`, `subgroups`, `subgroup-size-control` — **available and unused**. No cooperative-matrix / cooperative-vector feature is exposed. |
| Other notable adapter features | `dual-source-blending`, `float32-blendable`, `clip-distances`, `primitive-index`, `timestamp-query`, `texture-compression-bc`, `chromium-experimental-multi-draw-indirect` |
| Limits that bound a large single-pass tracer | `maxTextureDimension2D` 16384, `maxStorageBufferBindingSize` ~2 GiB, `maxComputeInvocationsPerWorkgroup` 1024, `maxComputeWorkgroupStorageSize` 32768, `maxColorAttachments` 8, `maxColorAttachmentBytesPerSample` 128, `maxSampledTexturesPerShaderStage` 48, `maxBindGroups` 4 |
| WGSL language features | includes `subgroup_id`, `subgroup_uniformity`, `readonly_and_readwrite_storage_textures`, `packed_4x8_integer_dot_product`, `texture_formats_tier1` |


**What this means for the profiles (VERIFIED):**

- The renderer requests an **allowlist** of optional device features, never
  `[...adapter.features]`, because WebGPU grants a device only what the caller
  asks for — an adapter advertising a feature does *not* put it on the device.
  The allowlist at head is exactly `rg11b10ufloat-renderable` (MAX's SSGI
  render target) and `float32-filterable` (linear filtering of the float HDR
  targets the bloom chain and grade chain sample).
- **No profile depends on a vendor.** There is no NVIDIA check, no
  `adapterInfo.vendor` branch, in any preset gate.
- **MAX is the only profile with a hard device-feature dependency**
  (`rg11b10ufloat-renderable`, for SSGI). Without it, SSGI dies at pipeline
  creation and takes the queue submit with it — which is exactly the bug the
  allowlist was added to fix.
- **RAY TRACED depends on the WebGPU ROUTE, not on any feature or vendor.**

---

## 6. HF-418: what changed in the build

1. **BALANCED added** (`src/graphics-settings-registry.ts`). Control set and
   the argument for every entry are in the file; the summary is §2 above.
2. **Truthful per-profile copy** (`src/ui/graphics-profile-descriptions.ts`).
   One line per mode in the menu, plus an expandable "what this mode turns on,
   and what it costs" block listing what each profile enables AND what it
   deliberately leaves off. Each carries the reference machine and resolution
   its performance words are true on.
3. **RTX became an explainer, not a preset**
   (`src/ui/rtx-native-runtime-explainer.ts`). Its `<option>` value is
   `rtx-native-runtime-info`, which is deliberately **not** a member of
   `GraphicsPreset`, so persistence rejects it. Selecting it restores the
   previously selected mode, then opens a dialog that states: it is a separate
   desktop application; it does not exist yet; the browser has no ray-tracing
   API to call; what you have instead is RAY TRACED, which is real recursive
   ray tracing on any WebGPU card. No download link is rendered while there is
   nothing to download.
4. **Pins.** `src/graphics-profile-contract.test.ts` pins the ladder order, the
   per-profile control-set hashes (against this document), BALANCED's position
   between its neighbours, the RTX naming rules, and the shape of the handler
   in `legacy-main.ts`. `scripts/qa/verify-rtx-explainer-headless.mjs` is the
   runtime falsifier: it drives the real menu and fails if the persisted
   graphics settings move by a single control.

---

## 7. Open items

- **OPEN (owner decision):** should BALANCED become the auto-selected default
  on mid-range machines? `defaultGraphicsPreset` still picks QUALITY at 8+
  cores / 8+ GB. This lane deliberately did not change it: that would change
  what existing players get, which is a product call, not an audit finding.
- **OPEN:** the RAY TRACED preset's cold pipeline compile is paid on the
  admission frame. The shared skill's fix — precompile during the menu preview,
  where the fence does not apply — is not implemented. See
  `docs/NEURAL_RENDERING_OPTIONS_2026-09-03.md` §3 recommendation 2.
- **OPEN (HF-418 item 4, blocked on Lane AL):** the individual lighting-feature
  controls with tiers and measured costs (baked indirect, SSR, AO, contact
  shadows) are Lane AL's deliverable and had not landed when this lane ran.
  BALANCED carries a `TODO(HF-418 item 4, Lane AL)` at its definition naming
  the decision that has to be argued when they do, and its control-set hash is
  the tripwire: the moment a lighting default changes,
  `graphics-profile-contract.test.ts` fails until this document is re-measured.
- **OPEN:** 39 of 40 controls are grep-verified only (§4).
- **OPEN:** `AGENTS.md` still says "The top-level graphics surface exposes
  exactly Performance, Quality, Max and Custom". That sentence went stale when
  RAY TRACED shipped (HF-398) and is now two profiles behind. It is outside
  this lane's ownership; the integrator should re-word it to point at
  `GRAPHICS_PROFILE_DESCRIPTIONS` as the source of the ladder.
- **OPEN:** the MAX cold-compile P0 from PASS 78 (5.17-6.54 s against a 4000 ms
  bound) did **not** reproduce here: MAX admitted on every arena measured. The
  old figure is not refuted — it was measured differently, on a different head
  — but the current state is "admits". Re-measure before quoting the old number.
