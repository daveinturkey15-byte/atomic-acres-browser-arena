# Technique study: realtime water surfaces (HF-420)

**Lane:** HF-420, PASS 86 overnight sweep, 2026-09-02.
**Owner ask (verbatim, from `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`):** "Better water like
this guy and have little pools or ponds at very least in each level. Upgrade all water across
maps <https://x.com/dangreenheck/status/2095028187063280085> **dont pay, figure out how**."
**Canonical record:** AKP technique register row 46
(`%LOCALAPPDATA%\hermes\.akephalos\references\ai-3d-technique-register.md`).
**Carrying skill:** `threejs-webgpu-water` v1.1.0, canonical store
`C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\threejs-webgpu-water\`.

---

## 1. What the source actually is

The post was resolved on the **first route** of the governed no-login chain:
`https://api.fxtwitter.com/dangreenheck/status/2095028187063280085` returned HTTP 200 and
7,881 bytes of JSON. No login, no paywall, and no web-search substitute for the thread's
content.

- **Author:** Dan Greenheck (@dangreenheck), verified individual, 9,688 followers.
- **Posted:** Wed 02 Sep 2026, 05:56:58 UTC. 414 likes, 13,580 views at read time.
- **Media:** one 999x750 photo and one **10.046 s, 1920x1080 H.264 before/after video**.
- **Its entire technical content**, in his words: he had worked on Three.js Water Pro for nine
  months and had **missed** this — when air bubbles are trapped under the surface of turbulent
  water, the water **brightens and shifts towards green**; the phenomenon is called
  **"broadband backscattering"**; the video exaggerates it deliberately; it ships in **Water
  Pro v3.6** alongside other wave-simulation improvements.

That is a physics term and a before/after clip. It is not a tutorial and not a repository. The
useful work was finding out how much of the surrounding technique is public — and the answer
turned out to be *almost all of it*.

## 2. Paid vs public — the direct answer to "dont pay, figure out how"

### Paid (never purchased, downloaded, unpacked or inspected)

The **Three.js Water Pro** library: TypeScript sources, TSL shader files, four bundled foam
textures and eight environment presets. Sold at `threejsroadmap.com/assets/threejs-water-pro`
as a one-time perpetual commercial licence; a Water + Sky bundle was displayed at **$239**
(reduced from $278) on 2026-09-02. Current release **v3.5.1**, uploaded 19 Aug 2026. Minimum
**three.js r181.0** WebGPU build.

### Public and free — and, it turns out, sufficient

| Artefact | What it gives | Read on |
| --- | --- | --- |
| `docs.threejswaterpro.com` (whole site, no auth, HTTP 200) | Landing page naming the wave model; **full changelog** back through v2.x; **complete `WaterSystem` API reference** — every subsystem, property and parameter named and described; the licence text | 2026-09-02 |
| The X posts (this one, plus his v3 feature-list post of 30 May 2026) | The author's own summary of what each release added | 2026-09-02 |
| The live demo at `threejswaterpro.com` | Behaviour, and one honest warning in its own loading text: first load compiles all shaders and takes a while | 2026-09-02 |
| His free YouTube tutorial, "Create Realistic Water with Three.js — GLSL Shader Tutorial" (`jK4uXGY07vA`) | The earlier, non-commercial version of the same subject | still public |
| 80.lv (29 Apr 2026, 5 Jun 2026), therookies.co | Third-party technical write-ups; the April piece is where "FFT wave simulation" is stated plainly | 2026-09-02 |

**The documentation alone specifies the technique at a level a competent TSL engineer can
rebuild from.** Everything in section 4 comes from it, from the post, or from published
physics.

### There is no code to copy in any case

This was checked rather than assumed:

- `https://api.github.com/repos/dgreenheck/webgpu-water` — the product repository linked from
  the docs footer — returns **404**.
- `https://api.github.com/repos/dgreenheck/threejs-water-shader` — the companion repo to his
  free GLSL tutorial, still referenced by third-party wikis — **also returns 404**. It was
  public and is not now.
- Enumerating **all 42 public repositories** on the `dgreenheck` account returned **no water
  repository of any kind**. His public MIT WebGPU/TSL exemplars are `webgpu-galaxy` and
  `webgpu-black-hole`; `webgpu-claude-skill` is the no-licence repo already recorded as
  register row 28.

## 3. Licence position

The shipped library is under a **Commercial Software License Agreement, version 2.2, dated
14 August 2026**, DRG Software Solutions LLC (a Wisconsin LLC), All Rights Reserved — read in
full at `docs.threejswaterpro.com/license.html` on 2026-09-02 (22,550 characters of text, read
as a document rather than trusted from a summary). Non-exclusive, non-transferable,
non-sublicensable; Source Files confidential to Authorized Personnel; no redistribution of
Source Files; no Competing Product.

**Section 1.4 is the operative clause and it is explicit:** technology the licensee "develops
independently, without use of or reference to the Software, is not a Competing Product."

**We are not a licensee at all.** Nothing is purchased, downloaded or installed, so no contract
term binds this project. The only law that applies is copyright, which protects the author's
*expression* — his code and his prose — and not the published physics, the algorithms as such,
or the fact that a good ocean uses an FFT.

Two boundaries follow, and the second is stricter than AKP Authority 2b:

1. **Never copy his wording.** The documentation prose is copyrighted. Restate; never paste.
   Nothing in row 46 or in the skill is quoted from it.
2. **Do not reverse-engineer the shipped demo bundle** at `threejswaterpro.com`. Authority 2b
   permits inspecting *unlicensed open source* to learn a general technique; deobfuscating a
   minified commercial bundle is a different act with a different risk. The bundle
   (`main-fUecaATv.js`) was identified in the landing page markup and **deliberately not
   fetched**. It is not needed — the free documentation already specifies the technique.

## 4. The technique, restated

Each item below is named in the public documentation, and each is published graphics or
oceanography rather than the author's expression.

1. **Multi-cascade FFT, not noise.** Three FFT bands — swell, waves, ripples — over a
   **JONSWAP** spectrum with a **Phillips** seed; largest tile settable in metres (default
   1024 m). Directional spreading is a frequency-dependent curve scaled by a "spectral
   sharpness", not a constant cosine exponent. The spectrum is **physically calibrated**:
   heights, speeds and wavelengths in real metres and seconds, driven by a settable **peak
   wavelength** plus wind speed. In v3.3 the separate Gerstner swell layer was **deleted**
   because a calibrated spectrum produces swell on its own — a direct comment on where our own
   Gerstner band table sits.
2. **Quality tiers select which frequency BANDS render**, not how coarsely all of them render.
   Wave shape and height stay quality-invariant. For a competitive shooter this is the single
   most important structural lesson in the whole study, and it is the opposite of the usual
   "lower the resolution on low" tier.
3. **Distance fade of wave detail and of reflection sharpness** where waves are too small or
   too far to resolve — the stated cure for distant shimmer and for the flat-mirror horizon.
4. **Beer-Lambert per-channel absorption** as the colour model, replacing a shallow/deep lerp.
   A later release adds a **spectral physical mode seeded from the ten Jerlov oceanic and
   coastal water types**, with adjustable algae, silt and stain, alongside an artist-authored
   mode. Above-water fog and underwater fog derive from the **same** absorption.
5. **Subsurface scattering** — transmission through wave crests, the characteristic ocean glow.
6. **Broadband backscattering** — the subject of the post. Entrained bubble clouds scatter
   light almost **spectrally flat**; the water's own absorption then filters what comes back,
   and because absorption is near its minimum in the green (~500–570 nm) and strong in the red,
   flat backscatter emerges **brighter and green-shifted**. See section 5 for the consequence.
7. **Jacobian-based breaking detection for foam**, plus a **persistent** foam field held in a
   world-fixed texture that follows the camera, accumulating on crests and windward faces and
   decaying over a time constant — so foam rolls off the back of a breaker instead of blinking.
   Surface, wave-crest and shoreline foam are three independent layers.
8. **Unified Fresnel from an index ratio of 1.33** driving both directions: grazing reflectance
   above, correct **Snell's window** with total internal reflection below. A refraction term
   warps what is seen through the surface, and **local Fresnel transparency** makes thin water
   see-through when looked at steeply down while staying opaque at grazing angles or over deep
   water.
9. **Screen-space reflections at constant cost**, sun sparkle, and sun shafts centred on the
   sun's *refracted* apparent position rather than its true one.
10. **Caustics visible from ABOVE through the surface**, refracted by the surface waves,
    attenuated by the same absorption, and occluded by sun shadows.
11. **Geometry clipmap LOD rings, camera-tracked**, for water out to the horizon.
12. **Determinism as a first-class feature:** fixed-step accumulate-and-substep, an integer
    tick and an O(1) tick sync; same seed plus same parameters gives the same surface on every
    client. The docs state plainly that **sampled heights are not bit-exact across GPU
    vendors**, so buoyant object state must be networked rather than re-derived — which is our
    own host-authority rule, arrived at independently.
13. **Water masking to hide water inside enclosed objects** — the enabling piece for per-arena
    pools and ponds rather than one global sea.
14. Wake as a **dispersive iWave displacement field** with automatic foam on breaking crests;
    rain as wind-driven streaks plus surface ripples; spray emitters with probes that fire on a
    water-velocity threshold.

## 5. The one insight worth the whole lane

The post gives a name and a picture. The engineering consequence has to be derived, and it is
the thing that will decide whether our implementation looks right or looks broken:

> The bubble term is **scattering, and it must be injected upstream of the absorption
> integral.**

Bubbles return spectrally flat light. The green shift is not a property of the bubbles — it is
produced by the water's absorption acting *on the light the bubbles returned*. So if the term
is added as a white tint on top of an already-absorbed colour, the absorption never touches it
and the result is **grey milk**, not green glow. That is the mistake an agent implementing
"make turbulent water brighter and greener" will make by default, and it is now written into
the skill and into register row 46 as the primary gotcha.

Three corollaries:

- Drive bubble density from **the same turbulence estimator that drives foam**, not a separate
  noise. Foam is the bubbles that reached the surface; backscatter is the ones that did not. If
  they disagree you get glowing water with no whitecap, or a whitecap on unchanged water.
- It must **decay on the same time constant as its foam**. Bubbles outlive the crest that made
  them; that lag is most of the realism.
- It must be **exactly zero in calm water**. A global constant raises the black point of every
  still pond in the game — and we are about to add a still pond to every level.

## 6. Where Atomic Acres actually stands (read at PASS 85 HEAD, not recalled)

| | Water Pro (public docs) | Atomic Acres today |
| --- | --- | --- |
| Wave model | 3-cascade FFT, JONSWAP, calibrated in metres | `src/water/ocean-spectrum.ts` — a frozen Gerstner band table, sum of sines |
| Colour | Beer-Lambert per-channel absorption, Jerlov water types | `mix(palette.deep, palette.shallow, ...)` — a two-colour lerp |
| Foam | Jacobian breaking detection, persistent decaying field, 3 layers | `smoothstep(0.88, 1.28)` over normalised crest height, times `smoothstep(0.06, 0.2)` over slope, broken up by one sine "shimmer" |
| Backscatter | shipping in v3.6 | none |
| Refraction / local transparency | index ratio 1.33, Snell's window, thin-water see-through | none |
| SSR | constant-cost | none |
| Caustics | from above and below, shadow-occluded | none |
| Subsurface scattering | yes | none |
| LOD | camera-tracked geometry clipmap rings | fixed near plane (`nearSize`) plus a far skirt (`horizonRadius`) |
| Coverage | one system, masked per body | `WATER_BODIES` registers **3 of 9 arenas** — `rustworks-1v1`, `farcrysis`, `high-seas` |

What we already do well and must not lose: **one spectrum with two consumers** (`OCEAN_BANDS`
is shared verbatim between `sampleOcean()` on the CPU and the TSL displacement, with the
comment saying so), analytic normals derived from the same field, and host-authoritative,
profile-invariant `level` / `swimmable` / `amplitudeScale`. The lateral chop is already
correctly marked presentation-only and kept out of the height query.

The last row of that table is the measurable form of the owner's "a pond or pool in every
level", and it is a **roster** problem, not a shader problem.

## 7. Ordering — what to build, and what not to

The ordering that buys the most picture per millisecond on our stack:

1. **Beer-Lambert absorption + depth-driven colour** — biggest visual delta, no new pass.
2. **Broadband backscatter** — the owner's actual ask, no new pass, cheap once (1) exists.
3. **Persistent, breaking-derived foam** — one small render target.
4. **Refraction and local Fresnel transparency** — needs a scene colour copy.

Everything after that (FFT cascades, SSR, caustics, subsurface scattering, clipmap LOD) is a
new pass or a new compute step and is a **separate budgeted decision**. Do not open it until
1–4 have shipped and been measured. Cost classes are written into the skill.

---

# 8. EXPERIMENT PLAN — Map 3 trial (for the next agent)

**Sized for 2–3 hours of Opus work.** Prove the colour model and the backscatter term on
**one** Map 3 water body. Do not touch any other arena's water in this pass.

### 8.0 Preconditions (all four, before anything else)

- `http://127.0.0.1:8188/queue` shows both queues empty; `nvidia-smi` shows **≥ 3000 MiB free**
  (retry 60 s, up to 10 times). Numbers taken while the owner's ComfyUI generates are void.
- Power plan is High performance (`8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`).
- **Headless only.** Never launch a headed browser of any kind — a guard kills headed
  Playwright-profile browsers within 15 s, and the owner's mouse is not ours to take. If a
  measurement cannot be done headless it is **BLOCKED WITH EVIDENCE**, not done anyway.
- Own worktree, own branch, private preview port in 4200–4299.

### 8.1 What to build (four commits, in this order)

**Commit 1 — the pond exists as data.** Add one small non-swimmable pond body to Map 3 in
`src/water/water-authoring.ts`: extents ~8 x 6 m, `amplitudeScale` ~0.03, shore band ~0.6 m,
no horizon skirt, murky palette. **No new shader file.** This commit is also the falsifier for
the module design: *if authoring a pond requires shader code, stop and report that the module
is wrong* rather than writing the shader.

**Commit 2 — extinction replaces the palette lerp.** In `src/water/ocean-tsl.ts`, add a
`vec3` extinction uniform and compute colour as `exp(-sigma * pathLength)` over the depth
behind the surface, with the existing `mix(deep, shallow)` retained behind a boolean so the
change reverts in one line. Seed `sigma` for two water types only: clear lagoon and murky
pond. Keep every existing constant (`OCEAN_ROUGHNESS_FLAT/ROUGH`, chop gains) untouched — this
commit changes colour, nothing else.

**Commit 3 — the backscatter term.** A scattering contribution injected **before** the
absorption integral, density driven by the existing crest/slope estimator, with an explicit
decay and a hard zero at zero wave energy. One uniform for strength, one for decay.

**Commit 4 — the roster test.** A focused vitest file asserting that every arena id in the
arena roster has a `WATER_BODIES` entry **or** an explicit, commented opt-out — with the list
**derived** from the arena roster, never hardcoded. Prove it red first by adding a scratch
arena id with no entry, then remove the scratch. This is the gate that makes "a pond in every
level" real rather than aspirational; the remaining eight bodies are authored in a later pass
under it.

### 8.2 How to measure

Headless native-WebGPU captures (`PASS73_NATIVE_WEBGPU=1`) at **four** Map 3 cameras — one
wide, one on the shoreline, one grazing across the surface, one looking straight down into the
shallow end — at 2560x1440, same seed, same simulation time, before and after each of commits
2 and 3. Then:

- `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` — in-combat pipeline creations.
- Frame time: median and p95 after warm-up, three runs, machine idle.
- Focused vitest for the water files only (never the full suite), plus `tsc`.
- A run-to-run **noise floor** from three captures of the *unchanged* build, so the before/after
  delta can be compared against noise rather than against zero. HF-410 is the precedent: an
  effect 2.5x smaller than its own build's noise is not an effect.

### 8.3 Budget

| Item | Budget |
| --- | --- |
| Wall clock | 2–3 h total, including captures |
| Frame time | **≤ 0.30 ms** median added at 2560x1440 for commits 2 + 3 combined, on the four cameras |
| New pipelines | **0** created in combat; any new variant warmed at load |
| Cold compile | admission fence **unchanged** — never widened to admit this |
| New passes | **0** (both commits are surface-shader terms) |
| Files touched | `src/water/*` and one new test; nothing outside water ownership |

### 8.4 Pass / fail bar

**PASS** requires all of:

1. The pond exists in Map 3 with **no new shader file** (commit 1's falsifier holds).
2. The shoreline and shallow-end captures show a **visible** colour change — shallow water
   reads shallow — and the wide and grazing captures show the surface **silhouette against the
   horizon unchanged**, pixel-delta within the measured noise floor. Colour changed, geometry
   did not.
3. Backscatter is **visibly green-shifted and brighter** in the turbulent capture *and*
   **exactly zero** in the still-pond capture (that capture must be byte-comparable to the
   commit-2 build). If it is grey rather than green, the term is downstream of absorption —
   that is a **FAIL**, and the fix is the injection point, not the colour constant.
4. Compile-stall probe at **0** in-combat creations; frame-time delta within budget; `tsc`
   clean; focused vitest green; the roster test proved red before it went green.
5. Buoyancy unaffected: the CPU `sampleOcean()` path is untouched and a floating-body check
   still tracks the crest. **No presentation term may reach the height query.**

**FAIL / STOP conditions** — report rather than push through:

- Any need to widen the admission fence, relax a threshold, or weaken a test.
- Any requirement to edit a file outside water ownership (put the exact patch in the report).
- Any measurement that would need a headed browser.
- Wave height or shape changing between quality tiers.

### 8.5 Explicitly out of scope for this trial

FFT cascades, SSR, caustics, subsurface scattering, clipmap LOD, wake, rain, spray, the
remaining eight arena water bodies, and any wide rollout. Each is a separate budgeted decision
and the ledger's own falsifier puts the pond roster before wide deployment of anything else.

---

## 9. Claim states

| Claim | State | Evidence |
| --- | --- | --- |
| Source resolved without login on the first governed route | **VERIFIED** | `api.fxtwitter.com` HTTP 200, 7,881 bytes, 2026-09-02 |
| The post's technical content is one physics term plus a before/after | **VERIFIED** | Full note-tweet text read |
| The library is paid, all-rights-reserved, and its docs are entirely public | **VERIFIED** | Licence v2.2 and the docs site read in full, no auth |
| The author publishes no water code | **VERIFIED** | 42 repos enumerated; both water repos 404 |
| The technique list in section 4 is what the product does | **CLAIMED** | Author's documentation and changelog — his claims about his own product, not measured by us |
| Backscatter must be injected before absorption | **CLAIMED** | Derived from the stated physics; not yet implemented or measured here |
| Atomic Acres has no absorption, refraction, SSR, caustics, SSS, backscatter or persistent foam, and 3 of 9 arenas have water | **VERIFIED** | `src/water/*` and `src/water-system.ts` read at PASS 85 HEAD |
| The Map 3 experiment produces the predicted result | **OPEN** | Not run. Section 8 is the plan, not a result. |
