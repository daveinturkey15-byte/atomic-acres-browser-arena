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

## REVISION — HF-438 (2026-09-03): the RAY TRACED rung is retired; its trace
## folds into QUALITY (light) and MAX (full)

**Owner, verbatim:** "I don't think we should have a ray tracing AND an RTX
mode ... the RTX mode as a separate runtime is fine, and just bake some ray
tracing into the quality profile and then even more in the max."

What changed, mechanically:

- **The ladder is now PERFORMANCE, BALANCED, QUALITY, MAX (+ CUSTOM), and the
  RTX entry stays exactly what it was** — the native-runtime explainer, which
  never changed a renderer value and still does not. **VERIFIED** at head
  (`src/graphics-settings-registry.ts`, `src/ui/graphics-profile-descriptions.ts`,
  pinned by `src/graphics-profile-contract.test.ts`).
- **QUALITY (light tier):** `rayTracing` off → `reflections` and
  `ambientOcclusion` off → `high` (the retired rung's own tier: 0.5 resolution
  scale, 12 samples, denoise — "the lower sample count"). MSAA 4x and SSR LOW
  are KEPT: the owner said bake ray tracing INTO the profile, not trade for it.
  **VERIFIED** (control set at head).
- **MAX (full tier):** `rayTracing` off → `reflections` on top of the full
  stack (ultra AO, ultra PMREM probes, high SSGI were already MAX's).
  BALANCED and PERFORMANCE take none of it. Refractions stay a Custom opt-in.
  **VERIFIED** (control set at head).
- **Cold-compile fence: NOT widened.** Menu-time precompile keeps covering the
  named control sets — which now include the trace for QUALITY and MAX — and
  the tripwire (pipelines compiled during combat = 0) is re-verified per preset
  in the PASS 92 evidence run (`docs/evidence/pass92/graphics-fold/`).
  **Quality now compiles the reflection pipelines**: pipeline counts at
  admission move from 374/300/251 (old QUALITY) and 478/392/364 (old MAX) to
  the figures recorded in §3-R below. **Measured numbers there; nothing on
  this line is invented.**
- **Storage migration:** a saved `raytraced` preference loads as QUALITY on
  every machine — never as the automatic default. **VERIFIED** by unit test
  (`src/pass65-raytraced-capability.test.ts`).
- **Every control keeps its existing tier definition; only the presets'
  control sets changed.** §2's RAY TRACED column and §3's RAY TRACED rows are
  kept below as the HISTORICAL record of the retired rung — they describe a
  control set that no longer ships.


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
**A (VERIFIED, recomputed from the literals in
`src/graphics-settings-registry.ts`):** no — but it is not a pure trade
either. Against QUALITY it changes **ten** controls, not six. All ten:

| Control | QUALITY → RAY TRACED | Direction |
|---|---|---|
| `antiAliasing` | msaa-4x → smaa | **REDUCTION** — drops the 4-sample HDR target. The single biggest saving. |
| `screenSpaceReflections` | low → off | **REDUCTION** — the trace supersedes it; running both pays for reflected light twice. |
| `rayTracing` | off → reflections | addition — the point of the profile. |
| `ambientOcclusion` | off → high | addition, and the **largest per-frame addition in the delta** — GTAO at 0.5 resolution scale, 12 samples, plus a denoise pass (§2). |
| `reflectionQuality` | high → ultra | addition; PMREM tier 512 — load time, not per-frame. |
| `anisotropy` | 8 → 16 | addition; sampler cost only. |
| `rainDensity` | 1 → 1.15 | addition, and a genuine **per-frame fill-rate increase**. |
| `ambientLife` | 1 → 1.15 | addition, and a genuine **per-frame fill-rate increase** (the registry's own PERFORMANCE comment says ambient instances are per-frame fill rate). |
| `filmGrain` | 0.32 → 0.36 | addition; grade-chain constant, negligible. |
| `vignette` | 0.16 → 0.17 | addition; grade-chain constant, negligible. |

So: **two reductions and eight additions**, and **three** of the additions are
real per-frame cost rather than a rounding nudge: `ambientOcclusion`
off → high (a 12-sample gather at 0.5 resolution scale with a denoise pass —
the biggest of the three), and `rainDensity` and `ambientLife` at 1 → 1.15
(instance-count fill rate). The other five additions are load-time
(`reflectionQuality`'s PMREM tier), sampler-only (`anisotropy`) or
grade-chain constants (`filmGrain`, `vignette`, and the trace itself is the
point of the profile rather than an extra). The honest sentence is that
RAY TRACED **mostly** buys the trace — the two reductions are the two largest
per-frame items in the delta — while still stacking real extra fill rate on
top. Two drafts of this paragraph were wrong before this one: the first said
"six controls, two of them reductions, it buys the trace; it does not stack
it" (wrong count, too clean a story), and the second named only `rainDensity`
and `ambientLife` as genuine per-frame cost and silently omitted
`ambientOcclusion`, which is larger than either. **Corrected 2026-09-03 after
review; the in-game `turnsOn` copy already disclosed the AO and needed no
change.**

**Q: Does it only work on NVIDIA cards?**
**A (VERIFIED, measured on this machine's adapter):** no. It requires the
**WebGPU renderer** and nothing else. There is **no vendor check anywhere** —
not in `GRAPHICS_PRESET_VALUES`, not in `resolveGraphicsRuntime`, not in
`resolveDisplayedGraphicsPreset`, not in the renderer bring-up: no
`adapterInfo.vendor`, no `nvidia`, no `amd`, no `intel` string is read on any
preset path. AMD and Intel WebGPU adapters run it identically. It also uses
**no ray-tracing hardware at all**: no shipping browser exposes a ray-query or
acceleration-structure API, so RT cores are unreachable from a tab on any GPU.
See §5 for the measured adapter feature list.

**Correction, 2026-09-03 (this claim was refuted in review and is restated
here honestly).** An earlier draft of this paragraph said the gate "demotes
RAY TRACED to QUALITY on exactly one condition —
`capability.rayTracingCapable === false`, which is set when the renderer fell
back to WebGL2". The **first half is source-true and the second half is
false.** The demotion branches do exist
(`src/pass65-settings.ts:392` and `:575`) and the unit suite
`src/pass65-raytraced-capability.test.ts` exercises them, but **nothing in the
shipped build ever supplies a capability object.** Every production call site
— `src/legacy-main.ts:1815`, `:1845`, `:28070`, `:28093` and
`src/pass65-renderer-feature-inventory.ts:463` — calls the resolvers with the
third argument omitted, so `capability` defaults to `{}`,
`rayTracingCapable` is `undefined`, `=== false` is never true, and **neither
branch can fire at runtime.** The parameter's own JSDoc says "the one caller
that owns a renderer passes the real backend"; that caller does not exist.
So the demotion is **OPEN, not VERIFIED**: it is tested code with no
production wiring. The substance of the owner's answer is unaffected — the
vendor-independence and the no-RT-hardware findings were traced and measured
separately — but the mechanism sentence was wrong and the in-game RAY TRACED
copy that repeated it has been corrected to state only what is true (the trace
lives in the WebGPU/TSL graph and exists on no other route). Wiring it is a
runtime change and was out of this lane's scope; see §7.

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
| 4 | MAX | `max` | Every effect at its highest tier plus a 1.15x supersample — and, since HF-438, the ray-traced reflection stage at its full tier. |
| 5 | CUSTOM | `custom` | The last named profile plus the player's edits. |
| — | RTX — WHAT IS IT? | `rtx-native-runtime-info` | **Not a profile.** Opens an explainer; changes no renderer setting. |

*(HF-438: the former rung 4, RAY TRACED `raytraced`, is RETIRED. Its reflection
stage went to QUALITY at the light tier and MAX at the full tier; a stored
`raytraced` preference loads as QUALITY. The RTX explainer entry is unchanged.)*

Order matters and is pinned: before HF-418 the list led with QUALITY (because
it is the default), which made PERFORMANCE below it read as a step *up*.

## 2. The control sets, in rendering terms

All 40 controls, per profile. The "what it does" column is the rendering
meaning, not the label.

**RETIRED COLUMN (HF-438).** The RAY TRACED column below is the historical
record of the retired rung's control set. QUALITY now ALSO carries
`rayTracing: reflections` (light tier) and `ambientOcclusion: high`; MAX now
ALSO carries `rayTracing: reflections` (full tier). Every tier definition is
unchanged; only the presets' control sets moved.

| Control | Rendering meaning | PERFORMANCE | BALANCED | QUALITY | RAY TRACED *(retired)* | MAX |
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
| `ssrTemporalDenoise` | Temporal smoothing of the SSR term; one history buffer, fused blend | off | off | **on** (strength 0.55, history weight capped 0.85) | off | **on** (strength 0.55, history weight capped 0.85) |
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
| `performance` | `6990222a` |
| `balanced` | `1265dfaa` |
| `high` (QUALITY, HF-438 light tier) | `87a2c804` |
| `max` (HF-438 full tier) | `62d82ed1` |
| `high` (pre-denoise, historical) | `430da2ad` |
| `max` (pre-denoise, historical) | `03ee2e10` |
| `raytraced` (RETIRED — historical) | `d65fbd25` |
| `max` (pre-fold, historical) | `2be3a371` |
> **PASS 96 re-fingerprint (HF-486).** Every fingerprint above is new because
> ONE new control, `ssrTemporalDenoise`, joined the control set (tiers:
> `performance`/`balanced` off, `high`/`max` on; the toggle rides SSR and its
> off state restores the single-frame SSR path). Per-frame cost is a defended
> estimate, not a capture: ~0.35 ms at 1440p on the RTX 5080 (8 taps at SSR
> resolutionScale plus one SSR-sized texture copy per frame, zero new
> pipelines). A full headed capture of the ladder with the denoise live is an
> OPEN ITEM, not a claim made here. Pre-denoise rows are kept as historical
> record only — they pin nothing.
>
> **PASS 92 re-fingerprint (HF-438).** The `high` and `max` fingerprints above
> changed because the fold moved real values into those presets; `performance`
> and `balanced` are untouched. The retired `raytraced` row and the pre-fold
> `max` row are kept as historical record only — they pin nothing.
> **PASS 89 re-fingerprint (historical).** Every hash changed at the PASS 89
> integration, and not because a measured value moved: Lane AL added ONE new
> control, `bakedIndirect`, to the control set, so every preset's key-sorted
> fingerprint was new. The tiers were `performance` off, `balanced` low, `high`
> (QUALITY) low, `raytraced` high, `max` high; BALANCED's is argued at its row
> in `src/graphics-settings-registry.ts`. The tier ladder is pinned in
> `src/graphics-settings-registry.test.ts`, and Lane AL pins separately that LOW
> (`src/rendering/lighting/baked-indirect.test.ts`).
>
> **What is therefore NOT re-measured.** Section 3's frame times were captured
> before this control existed. Lane AL measured the layer itself at +0.7% median
> and +0.3% p95 on QUALITY against the layer switched off
> (`docs/evidence/pass85/lane-al/`), which is inside this machine's run-to-run
> noise, so no figure in section 3 was rewritten from it. A full re-capture of
> the 5x3 ladder with the baked layer live is an OPEN ITEM, not a claim made
> here.

---

## 3. Measured cost

**Method (VERIFIED).** `scripts/qa/audit-graphics-profiles.mjs`, one fresh
headless Chrome per row (fresh user-data dir, therefore a **cold** shader
cache), 2560x1440, real WebGPU backend confirmed per row, the real Options
surface driven exactly as the owner drives it (select → SAVE GRAPHICS → arena →
solo).

**Coverage (VERIFIED).** Three arenas were measured: `atomic-acres`,
`skyline-terminal`, `high-seas`. The selectable roster in
`src/map-selection.ts` has **eight** entries (`atomic-acres`,
`skyline-terminal`, `rustworks-1v1`, `gun-range`, `high-seas`, `test1`,
`test2`, `map3`; `farcrysis` is `selectable: false`). So this matrix covers
**3 of 8 selectable arenas — 5 x 3 = 15 rows, not the full roster.** The brief
asked for the registry roster; the remaining five are OPEN (§7). Do not read
the 5 x 3 matrix as full coverage.

Frame figures come from the renderer's own presented-frame sampler
(`completionPacing`); `rateHz` is frames ÷ elapsed over the retained window,
which is the only cadence figure that survives bursty pacing — a median gap is
not a frame rate. Draw calls and triangles are the last *admitted* frame.
Pipelines are counted by wrapping `GPUDevice.createRenderPipeline(+Async)`
before any page script runs.

**Honesty about the machine (VERIFIED).** This is the owner's shared
workstation. Five other PASS 86/87 lanes were running against the same GPU, and
partway through the sweep the owner's ComfyUI began a batch that ran for over an
hour; free VRAM moved between 0.7 GB and 9.3 GB. Rows taken while ComfyUI had
work queued were DISCARDED, not annotated, and the audit script now refuses to
launch in that state and stamps the queue into every row. Even so, run-to-run
spread on a single cell is large: read the AVERAGED ladder below and the
categorical facts (admitted / not admitted, pipelines in combat, draw counts),
which are not noise-sensitive. Do not read a single cell.

| Profile | Arena | Pass | Deploy (s, cold) | Frames/s | Median ms | p95 ms | p99 ms | >33 ms | Draws | Tris | Pipelines @admission | Pipelines in combat | GPU busy? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PERFORMANCE | atomic-acres | p2 | 35.2 | 55.3 | 14.3 | 38.5 | 48.1 | 16 | 155 | 289k | 297 | 0 | not stamped |
| PERFORMANCE | skyline-terminal | p2 | 19.5 | 73.8 | 11.4 | 25.8 | 29.8 | 2 | 215 | 51k | 225 | 0 | quiet |
| PERFORMANCE | high-seas | p2 | 23.9 | 75.7 | 10.9 | 24.1 | 31.5 | 1 | 103 | 233k | 222 | 0 | quiet |
| BALANCED | atomic-acres | p2 | 48.3 | 55.7 | 15.3 | 30.0 | 38.9 | 6 | 186 | 540k | 375 | 0 | not stamped |
| BALANCED | skyline-terminal | p2 | 33.3 | 82.8 | 10.2 | 25.5 | 28.5 | 1 | 126 | 59k | 301 | 0 | quiet |
| BALANCED | high-seas | p2 | 56.0 | 69.9 | 12.2 | 25.4 | 30.1 | 2 | 122 | 237k | 252 | 0 | quiet |
| QUALITY | atomic-acres | p2 | 41.2 | 47.8 | 16.8 | 36.2 | 42.3 | 26 | 189 | 536k | 374 | 0 | quiet |
| QUALITY | skyline-terminal | p2 | 30.2 | 75.9 | 11.0 | 25.1 | 28.7 | 2 | 127 | 58k | 300 | 0 | quiet |
| QUALITY | high-seas | p2 | 54.8 | 77.4 | 11.5 | 23.4 | 25.3 | 0 | 127 | 217k | 251 | 0 | quiet |
| RAY TRACED | atomic-acres | p2 | 54.4 | 72.8 | 12.3 | 25.5 | 28.5 | 1 | 188 | 541k | 382 | 0 | quiet |
| RAY TRACED | skyline-terminal | p2 | 36.2 | 57.5 | 15.3 | 31.3 | 37.0 | 6 | 125 | 59k | 307 | 0 | quiet |
| RAY TRACED | high-seas | p2 | 58.4 | 65.4 | 13.5 | 28.2 | 29.6 | 1 | 127 | 214k | 259 | 0 | quiet |
| MAX | atomic-acres | p2 | 42.1 | 45.6 | 21.1 | 41.6 | 48.1 | 17 | 345 | 656k | 478 | 0 | quiet |
| MAX | skyline-terminal | p2 | 49.8 | 48.0 | 18.7 | 36.6 | 41.4 | 17 | 241 | 84k | 392 | 0 | quiet |
| MAX | high-seas | p2 | 66.1 | 37.6 | 23.1 | 50.3 | 65.2 | 23 | 263 | 265k | 364 | 0 | quiet |

Pass `p2` is the complete ladder on one build. `quiet` in the last column means
the row itself recorded the owner's ComfyUI queue as empty before AND after the
run; 13 of 15 carry that stamp, and the **two** that say "not stamped"
(`performance-atomic-acres`, `balanced-atomic-acres`) were taken before the
gate existed. (An earlier draft said "three"; recounted from the raw JSON.) Every row: `backend: webgpu`, `admissionOutcome:
admitted`, `errors: 0`, `pipelinesInCombat: 0`.

**HF-438 (2026-09-03).** The RAY TRACED rows above are HISTORICAL — that rung
is retired. The re-measured post-fold ladder (performance, balanced, high,
max on atomic-acres) is recorded in §3-R below with its pipeline-count delta;
nothing in this historical table was rewritten.

### The ladder, averaged over the three arenas

Per-arena numbers move with machine load; the ladder does not. Mean over
atomic-acres, skyline-terminal and high-seas:

| Profile | Median frame (ms) | p95 (ms) | Frames/s | Draw calls (per arena) | Pipelines at admission |
|---|---|---|---|---|---|
| PERFORMANCE | **12.2** | 29.5 | 68.3 | 155 / 215 / 103 | 297 / 225 / 222 |
| BALANCED | **12.6** | **27.0** | 69.5 | 186 / 126 / 122 | 375 / 301 / 252 |
| QUALITY | **13.1** | 28.2 | 67.1 | 189 / 127 / 127 | 374 / 300 / 251 |
| RAY TRACED | **13.7** | 28.3 | 65.2 | 188 / 125 / 127 | 382 / 307 / 259 |
| MAX | **21.0** | **42.8** | 43.7 | 345 / 241 / 263 | 478 / 392 / 364 |

**Cold deploy range per profile (VERIFIED, from the same 15 rows).**
PERFORMANCE 20-35 s, BALANCED 33-56 s, QUALITY 30-55 s, RAY TRACED 36-58 s,
MAX 42-66 s. This is the ladder that is *not* gentle, and unlike the frame
figures the separation is large enough to read.

**The size of MAX'''s separation (VERIFIED).** Every rung below MAX has a mean
median frame between 12-14 ms and a mean p95 between 27-30 ms. MAX is at
21.0 ms and 42.8 ms. That is the one gap in this ladder wide enough to state
as measured rather than designed.

### What the table supports

**A correction, made after review (2026-09-03).** An earlier draft of this
section asserted items 1, 2 and 4 below as VERIFIED. They were not, and the
refutation is on this same page: the differences among the bottom four rungs
are 3-4.6%, and the paragraph headed "What the table does NOT support" already
says no single-cell comparison under about 15% carries signal and records a
21% run-to-run swing on an *identical* control set. Worse, **not one of the
three measured arenas is monotone**: on atomic-acres RAY TRACED (12.3 ms) is
the *fastest* cell of all five and beats PERFORMANCE (14.3 ms); on
skyline-terminal BALANCED (10.2) is below PERFORMANCE (11.4); on high-seas
QUALITY (11.5) is below BALANCED (12.2). The monotone ordering exists only in
the mean of three *different workloads*, and averaging different arenas does
not reduce within-cell noise — each cell is n=1 over one 14 s window. The
ordering among the bottom four rungs is therefore **OPEN**, not VERIFIED.

1. **MAX separates from the entire ladder, on every arena measured.**
   +7.3 ms median and +14.6 ms p95 over the next rung down (+53% and +51%),
   43.7 frames/s against 65-70, and ~1.8x the draw calls (345 on atomic-acres
   against QUALITY's 189). This is not a within-noise difference and it
   reproduces on all three arenas independently: atomic-acres 21.1 against
   12.3-16.8, skyline-terminal 18.7 against 10.2-15.3, high-seas 23.1 against
   11.5-13.5. "For very high-end machines" is a measurement, not a slogan.
   **VERIFIED.**
2. **RAY TRACED is nowhere near MAX — it is down with QUALITY, not above it.**
   13.7 ms mean against MAX's 21.0, and on every individual arena RAY TRACED
   is far below that arena's MAX cell (12.3 against 21.1; 15.3 against 18.7;
   13.5 against 23.1). This is the direct answer to "is RTX above or below
   max": **below**, categorically, on every arena. What is NOT established is
   the size of the step from QUALITY to RAY TRACED — see item 4.
   **VERIFIED (the categorical ordering against MAX).**
3. **BALANCED's p95 and long-frame counts are the best in the ladder**
   (27.0 ms mean p95, and 1-6 frames over 33 ms per window against QUALITY's
   2-26). This is *suggestive*, not established: the p95 spread across the
   bottom four is 27.0-29.5 ms, the same ~8% band this section refuses to read
   elsewhere. Only MAX's 42.8 ms p95 is outside the noise. **OPEN**, and the
   reason it is worth stating anyway is that the long-frame count is a count
   of events rather than a mean of a noisy quantity.
4. **The ordering among PERFORMANCE / BALANCED / QUALITY / RAY TRACED is
   OPEN.** The means (12.2 / 12.6 / 13.1 / 13.7 ms) are in the designed order,
   but the gaps are 3-4.6% and no measured arena reproduces the ordering.
   **To promote this to VERIFIED, run 3-5 repeats per cell on a quiet machine
   and report the spread, not the mean.** Until then the honest statement to a
   player is the one the in-game copy makes: what each profile turns on and
   leaves off, never a frame rate.
5. **BALANCED lands where designed in its CONTROL SET, which is the claim the
   product actually makes.** 18 controls separate it from PERFORMANCE and 8
   from QUALITY (recomputed from the registry literals). That is a fact about
   the build rather than a measurement, and it is what the in-game copy
   claims. **VERIFIED.**
6. **Every profile ADMITS on every arena, with zero page errors.** 15 rows.
   That is the headless boot smoke for the whole ladder. **VERIFIED.**
7. **Tripwire clean: `pipelinesInCombat` = 0 on all 15 rows.** 222-478
   pipelines are compiled during admission; not one is compiled while a settled
   match is being played. This is the measurement that matters most for the
   owner's freeze reports. **VERIFIED.**
8. **Nothing came close to the queue-completion fence:** peak completion
   latency 64.1-155.5 ms against a 12 000 ms fence. **VERIFIED.**
9. **The PASS 78 MAX cold-compile P0 (5.17-6.54 s against a 4000 ms bound) did
   not reproduce.** MAX admitted on all three arenas. Not a refutation —
   different head, different method — but the current state is "admits".
   **VERIFIED for these three arenas.**
10. **Deploy time is the real cost of the top rungs, not frame time.** Cold
   deploy runs 20-35 s on PERFORMANCE and 36-66 s on RAY TRACED and MAX. The
   frame ladder is gentle; the *loading* ladder is not. **VERIFIED**, and it is
   the strongest argument in this document for the menu-time precompile in
   `docs/NEURAL_RENDERING_OPTIONS_2026-09-03.md` §3 recommendation 2.

### What the table does NOT support, said plainly

- **Any single-cell comparison under about 15%.** atomic-acres in particular
  swung hard: PERFORMANCE measured 45.7 and 55.3 frames/s in two passes on an
  identical control set, and its RAY TRACED cell (12.3 ms median) came out
  *faster* than its PERFORMANCE cell (14.3 ms), which cannot be true of the
  control sets and is load. Read the averaged ladder, not one cell.
- **BALANCED being faster than QUALITY on a mid-range GPU.** On a 5080 the
  median gap is 0.5 ms, because the passes BALANCED drops are not what
  bottlenecks a 5080 at 1440p. Its p95 and long-frame advantages are the honest
  signal. **OPEN: BALANCED needs a mid-range measurement before "runs nice" is
  evidence rather than reasoning.** The in-game copy is written to survive that:
  it claims a control set and a set of omissions, never a frame rate.
- **VRAM.** `nvidia-smi` reports the whole GPU on a machine shared with the
  owner's ComfyUI and five other lanes; deltas ranged from -4488 to +8548 MiB
  and are noise. Collected for completeness, usable for nothing.

### One live observation the sweep produced for free

Every row records the canvas backing store. **PERFORMANCE renders a 1920x1080
canvas inside a 2560x1440 viewport on every arena** — exactly 0.75 — which is
direct runtime proof that `renderScale` executes, one of the 39 controls §4
lists as grep-verified only. It is the cheapest live observation in the whole
registry and it came from a field the harness was already collecting.

The same field answers a second question, and the answer is not the one an
earlier draft of this document gave. **MAX's canvas is also 2560x1440, not the
2944x1656 its 1.15 supersample would give.** The first draft blamed the
adaptive valve settling a tier below its own cap under load. **That was wrong.
It is now RESOLVED as a deterministic display clamp. VERIFIED.**

Every one of the four call sites that applies the render scale reads:

```
renderRuntime.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
```

— `src/legacy-main.ts` lines 2042, 2552, 2556 and 28108. Every one of the 15
audit rows records `devicePixelRatio: 1`. `Math.min(1, 1.15) = 1`, at any
load, on any frame. It is the same expression that makes PERFORMANCE's scale
visible: `Math.min(1, 0.75) = 0.75`, which is exactly the 1920x1080 canvas
above. A scale **below** 1 passes through the clamp; a scale **above** 1
cannot.

The valve is positively ruled out rather than merely unnecessary. Had the
valve downshifted MAX, `configuredAdaptiveQualityLevels('blender', 1.15,
true)` would have put it on 0.98, 0.86, 0.75 or 0.58 and the canvas would have
been 2509x1411 or smaller. It is exactly 2560x1440 — the valve is at its top
tier *and* the clamp is what removes the supersample.

**What this means for the owner.** He runs Chrome at 2560x1440 with a device
pixel ratio of 1, so **MAX never supersamples on his machine either.** Its
1.15 render scale is inert on any 1:1 display and only materialises on a
display whose device pixel ratio exceeds 1 (a HiDPI or OS-scaled panel). MAX
is still by a wide margin the most expensive profile on this hardware, and
every cost figure in this document was measured with the supersample inert —
so its +7.3 ms comes entirely from the effect tiers, not from extra pixels.
The in-game copy has been corrected to say this (§6), and
`src/graphics-profile-contract.test.ts` now pins the `Math.min(` expression at
all four call sites so the clamp cannot be silently removed nor the diagnosis
silently invalidated.

### Side by side: what each profile actually buys

`scripts/qa/capture-graphics-profile-views.mjs`, one browser per profile, the
same AUTHORED review camera each time (`nuke-town-overview` and
`nuke-town-street-axis` on atomic-acres), viewmodel hidden, bot frozen, the
presentation loop's own camera-commit receipt re-read immediately before every
screenshot. 5 profiles x 2 cameras, all OK, zero page errors. Halved PNGs in
`docs/evidence/pass87/graphics-profiles/views/`; manifest alongside.

**Capture coverage is narrower than measurement coverage, and the brief asked
for more than this.** Job 1 asked for "the same review camera per arena per
profile"; what exists is **one arena of the three measured, one of the eight
selectable**. `skyline-terminal` and `high-seas` have cost rows but no frames.
Everything in the table below is therefore a statement about `atomic-acres`
only. Tracked in §7.

| Comparison | What the pixels show | Claim-state |
|---|---|---|
| PERFORMANCE vs BALANCED | **The largest visual step in the whole ladder, and it is not close.** PERFORMANCE has no shadows at all, flat untextured surfaces, no road markings or decals, and visibly fewer props (reduced geometry detail drops the roof vehicle, the street lights, the wind turbine). BALANCED restores shadows, brick and asphalt detail, road markings, the full prop set and the storm sky. This is the owner's "doesn't look shit like performance", demonstrated. | VERIFIED |
| BALANCED vs QUALITY | **Near-identical at this camera.** The three things QUALITY adds — 4x multisampling, half-res SSR and a 24-step sun-shaft march — are edge-level and reflection-level effects that do not change the read of the scene at overview distance. That is the profile working exactly as designed: it was built to carry QUALITY's LOOK without QUALITY's per-frame structures. | VERIFIED |
| QUALITY vs RAY TRACED vs MAX | Differences are present but subtle at these two cameras, because atomic-acres is a largely matte, outdoor arena — there is little for a reflection to be reflected in. This is the coverage precondition the shared skill names: a correct tracer with nothing to reflect looks like a bug report. A wet-surface or interior camera would separate them; these two do not. | VERIFIED (as a limitation of the chosen cameras, not of the profiles) |

One corroborating detail that needed no analysis: the PERFORMANCE PNGs are
roughly half the byte size of every other profile's at the same camera
(421-545 KB vs 1078-1159 KB). A softer, upsampled, unshadowed frame has far
less high-frequency content to encode. It is the render-scale finding again,
arriving through a completely independent channel.

---

### §3-R. The re-measured post-fold ladder (HF-438, 2026-09-03)

`scripts/qa/audit-graphics-profiles.mjs`, one fresh headless Chrome per row,
2560x1440, real WebGPU backend confirmed per row, atomic-acres, 10 s sample,
an otherwise quiet GPU (ComfyUI queue empty before and after every row; the
pre-browser gate — queue empty AND ≥ 3000 MiB free — polled to open). Raw
rows: `docs/evidence/pass92/graphics-fold/*.json`; write-up with claim-states
in the README beside them.

| Preset | Cold admission (s) | Pipelines @admission | Pipelines in combat | Median ms | p95 ms | p99 ms | Rate Hz | Draws | Tris |
|---|---|---|---|---|---|---|---|---|---|
| PERFORMANCE | 24.1 | 297 | 0 | 14.6 | 36.4 | 45.7 | 53.7 | 152 | 289k |
| BALANCED | 31.1 | 375 | 0 | 10.2 | 26.3 | 35.0 | 79.0 | 186 | 540k |
| QUALITY (light trace) | 34.5 | 375 | 0 | 12.3 | 26.8 | 29.0 | 71.8 | 190 | 536k |
| MAX (full trace) | 40.2 | 478 | 0 | 29.0 | 60.2 | 63.9 | 31.6 | 373 | 688k |

Every row: `backend: webgpu`, `admissionOutcome: admitted`, `errors: 0`,
`pipelinesInCombat: 0`, peak completion latency 87-425.5 ms against the
12,000 ms fence. **VERIFIED.**

**The pipeline-count delta the fold was required to record (MEASURED).**
QUALITY on atomic-acres: 374 → 375 (+1). MAX on atomic-acres: 478 → 478 (the
count is unchanged; the trace's stage rides the existing composite-pass
pipeline structure rather than adding a pipeline variant here). The
cold-compile admission fence was NOT widened: no pipeline is compiled during
combat on any row, and refractions — the one tier that might — remain a
Custom opt-in.

**What this table does NOT establish.** It is n=1, one 10 s window, one
arena, one session. The frame-time cells are NOT comparable against §3's
historical rows as a measure of the fold's cost (different session, different
load, §3's own under-15%-per-cell rule). The fold's per-frame cost on
QUALITY/MAX frame time is **OPEN** and needs the repeats protocol from item 4
of §3. The pipeline deltas and the clean tripwire are direct, load-insensitive
measurements and are the evidence the fold needed.

---

## 4. Honesty column: what "verified" means for each control

`ADVANCED_GRAPHICS_RUNTIME_EVIDENCE` carries two different strengths of claim
and the registry now says which is which (the distinction was written into the
file after the 2026-08-31 IBL first-arena bug, where a row pointed at a real
symbol in a real file inside a function the first arena of every page load
never reached, and nine unit tests passed over the top of it for weeks).

**Measured at head (VERIFIED): 1 of 41 controls has a live observation.**

| Strength | Count | Controls |
|---|---|---|
| **Live, fail-closed observation of the running scene** | 1 | `environmentIntensity` |
| **Source grep only** — proves the consumer EXISTS, not that it RAN | 40 | `renderScale`, `adaptiveResolution`, `targetFps`, `frameRateLimit`, `antiAliasing`, `geometryDetail`, `shadows`, `shadowResolution`, `shadowUpdateMode`, `shadowFilter`, `indirectLighting`, `ambientOcclusion`, `screenSpaceReflections`, `screenSpaceGi`, `ssrTemporalDenoise`, `rayTracing`, `reflectionQuality`, `volumetricQuality`, `volumetricLightShafts`, `smokeQuality`, `particleQuality`, `anisotropy`, `decalQuality`, `bloomQuality`, `exposure`, `toneMapping`, `filmicProfile`, `sharpness`, `filmGrain`, `vignette`, `depthOfField`, `depthOfFieldStrength`, `motionBlur`, `spatialUpscaling`, `weatherIntensity`, `rainDensity`, `windStrength`, `lightning`, `wetSurfaces`, `ambientLife` |

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
5. **HF-438 (this revision): the fold.** The RAY TRACED rung retired; QUALITY
   carries the trace at the light tier (`rayTracing: reflections`, AO `high`),
   MAX at the full tier; BALANCED and PERFORMANCE take none of it; refractions
   stay a Custom opt-in; a stored `raytraced` preference loads as QUALITY. The
   control-set fingerprints for `high`/`max` were re-derived per the tripwire
   and the re-measured ladder is recorded in §3-R
   (`docs/evidence/pass92/graphics-fold/`). The cold-compile admission fence
   was not widened; the audit tripwire (zero pipelines in combat) is re-run per
   preset in the same evidence.

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
- **OPEN (capture coverage, narrower than measurement coverage):** the
  side-by-side review-camera captures in §3 cover **one arena of the three
  measured, and one of the eight selectable** — `atomic-acres`, 2 authored
  cameras x 5 profiles = 10 frames. `skyline-terminal` and `high-seas` were
  measured in all 15 cost rows but never captured, so the visual half of the
  ladder is demonstrated on a single map. Related and separate: **no captured
  frame demonstrates a ray-traced reflection**, because both authored cameras
  are matte outdoor views; the "the retired rung is a different trade, not a
  superset" half of Q1 is argued from the control set, not observed in a
  pixel. Re-run, one browser at a time on a quiet GPU:
  `node scripts/qa/capture-graphics-profile-views.mjs --arena skyline-terminal
  --presets performance,balanced,high,max`, and add a wet-surface or
  interior camera before claiming the reflection visually.
- **OPEN (dead capability wiring, refuted claim — see §0 Q3; partially
  resolved by HF-438):** the retired preset's whole-rung demotion branch is
  DELETED (`resolveGraphicsRuntime` no longer special-cases any preset; the
  surviving gate switches only the `rayTracing` control off, with a reason,
  keeping the player's rung — including the folded QUALITY/MAX). What remains
  unwired: `GraphicsRouteCapability.rayTracingCapable` is still supplied only
  by `src/pass65-raytraced-capability.test.ts`; the production call sites
  (`src/legacy-main.ts`, `src/pass65-renderer-feature-inventory.ts`) omit the
  argument, so on a non-WebGPU route the folded presets keep the trace flag
  until the TSL graph the WebGL2 fallback never builds. Either wire it — pass
  `{ rayTracingCapable: renderRuntime.backend === 'webgpu' }` at the
  `legacy-main` sites and prove the control-level switch-off headless — or
  delete the gate and the reason string
  `RAY_TRACED_REQUIRES_WEBGPU_REASON` as dead code. Both are runtime changes
  and remain outside a graphics-copy lane's boundary.
- **OPEN (coverage):** five of the eight selectable arenas were never measured
  — `rustworks-1v1`, `gun-range`, `test1`, `test2`, `map3`. The brief asked
  for the registry roster; this matrix is 3 of 8. `farcrysis` is
  `selectable: false` and out of scope until it is unhidden. Command, one launch per cell, on a quiet GPU, one browser at a time:
  `node scripts/qa/audit-graphics-profiles.mjs --url http://localhost:<port>
  --preset <performance|balanced|high|max> --arena <arena> --out
  artifacts/graphics-audit`.
- **OPEN (statistics):** every cell of §3 is n=1 over one 14 s window, and the
  ordering among the bottom four rungs sits inside the noise floor this
  document itself states (§3 "What the table supports", item 4). Promoting it
  needs 3-5 repeats per cell and a reported spread. Nothing in the shipped
  copy depends on it — the in-game lines claim control sets, not frame rates.
- **RESOLVED (was OPEN): MAX's missing supersample.** Diagnosed as
  `Math.min(window.devicePixelRatio, pixelRatioCap)` at `legacy-main.ts`
  2042/2552/2556/28108 with `devicePixelRatio: 1` on every audit row — a
  deterministic display clamp, not the adaptive valve. See §3. Pinned by
  `src/graphics-profile-contract.test.ts`.
- **OPEN (outside this lane's ownership — exact patch is in the lane report):**
  the `AGENTS.md` graphics-surface sentence says "The top-level graphics
  surface exposes exactly Performance, Quality, Max and Custom". It went stale
  when RAY TRACED shipped (HF-398) and is made triply false by BALANCED and the
  RTX explainer, so it now names a four-entry ladder against a shipped seven
  entries. This lane wrote a corrected sentence, **committed it, and then
  reverted it in the repair cut**: `AGENTS.md` is outside the lane's declared
  ownership and the standing machine rule is stop-and-report, not edit. The
  replacement text is in the lane report verbatim for whoever owns
  `AGENTS.md`. Do not leave the enumerated sentence standing — a false contract
  sentence is read as authority by the next lane.
- **LANDED, WITH A MERGE HAZARD THE INTEGRATOR MUST CLEAR (HF-418 item 3,
  changelog):** the BALANCED / per-mode-copy / RTX-explainer highlight is
  registered in `src/changelog.ts`, in the entry the release stamp names. On
  this branch that entry is `pass85`, which was the pending top entry at the
  lane's base `714d4121`. **PASS 86 published at 00:50 BST 2026-09-03 from
  integration `e1361b0f`**, which froze `pass85ReleasedAt` to a real receipt
  and put a `pass86` entry above it. A merge probe (`git merge-tree
  --write-tree HEAD e1361b0f`) merges **cleanly** — so without a guard the
  highlight would land silently inside an already-published release entry and
  advertise this work as PASS 85 content. A fail-closed guard was therefore
  added in the repair cut:
  `src/graphics-profile-contract.test.ts` → "registers the graphics-ladder
  highlight only in the unreleased top entry" asserts the highlight
  sits in `CHANGELOG[0]` **and** that `CHANGELOG[0].releasedAt` is still
  `PENDING_PRODUCTION`. On the integration line that assertion goes **RED**,
  which is the point: the integrator moves the one string into the new pending
  entry (and `'GRAPHICS'` into that entry's `areas`) and the gate goes green.
  It cannot merge silently any more.
- **OPEN:** the MAX cold-compile P0 from PASS 78 (5.17-6.54 s against a 4000 ms
  bound) did **not** reproduce here: MAX admitted on all three arenas measured.
  The old figure is not refuted — it was measured differently, on a different
  head — but the current state is "admits". Re-measure before quoting the old
  number.
- **OPEN (the real cost of the top rungs):** cold deploy time, not frame time,
  is where RAY TRACED and MAX are expensive — 36-66 s against PERFORMANCE's
  20-35 s, and 222-478 pipelines compiled inside admission. The frame ladder is
  gentle; the loading ladder is not. Menu-time precompile is the fix and is not
  implemented.
