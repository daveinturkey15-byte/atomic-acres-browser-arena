# TAA and CSM on the PASS 94 candidate - a decision with numbers

**Lane: blind A/B critic + TAA/CSM evaluation, 2026-09-04 (HF-486 / HF-503).**
Measured against the pass93-candidate line at `465ae6b7` (candidate 5's
source) in worktree `aa-claude-critic`. No runtime file was changed by this
half: the in-combat pipeline tripwire stays at 0 because nothing new compiles,
and every threshold stays because nothing was re-pinned.

Claim-states: **VERIFIED** = read in this worktree's source or measured by an
instrument this session, file and line quoted; **CLAIMED** = a document or
upstream comment says it; **INFERRED** = arithmetic over verified numbers;
**OPEN** = needs a build and a capture, procedure stated.

---

## 0. The decision in one paragraph

**TAA: ADOPT AS A QUALITY/MAX OPT-IN, NEXT LANE, NOT THIS BOX.** Every input
it needs already exists on the scene pass - colour, depth, and a velocity MRT
attachment that motion blur already allocates - and Three r185 ships the
resolve (`TRAANode`: Halton jitter, history reprojection, neighbourhood
clamp, one `NodeMaterial`). Cost is one full-screen half-float resolve plus
one texture copy per frame, and the velocity attachment on profiles that do
not run motion blur today. What it buys is not mainly edge AA (SMAA/MSAA-4x
already own that): it is the temporal filter GTAO and SSGI both have switched
OFF "because this chain does not run a TRAA resolve" (source, quoted below),
which is where the stippled/crawling look on QUALITY comes from. It was NOT
prototyped here because the honest wiring is a registry control, and a new
control rotates the pinned control-set hashes in
`src/graphics-profile-contract.test.ts` - a tripwire that must be re-measured
against `docs/GRAPHICS_PROFILES_2026-09-03.md`, not re-pinned inside a 100
minute box - and an unwired module is the exact "fully tested, zero runtime
callers" defect AGENTS.md records three times.

**CSM: DECLINE FOR THE CURRENT ARENAS; RE-OPEN IF AN ARENA EXCEEDS ~60 m OF
SUN-LIT DEPTH.** The sun shadow is a single 2048x2048 map, but it is already
fitted per arena: Nuke Town's shadow volume is 44 x 92 m, which is 2.1 cm/texel
across and 4.5 cm/texel along the street - a density a two-cascade split
would improve to roughly 1.3 cm/texel in the first 16 m and leave unchanged
beyond it. The price is structural, not a slider: cascades follow the camera,
so QUALITY's `shadowUpdateMode: 'static'` (zero shadow-caster passes per
settled frame today) becomes two caster passes every frame, and the godrays
raymarch dereferences `light.shadow.map.depthTexture`, which a
`CSMShadowNode` sun never allocates - the HF-401 swallowed-throw failure
already paid for once.

---

## 1. What is on the scene pass today (VERIFIED)

`src/rendering/pass64-tsl-scene.ts` lines 962-986:

- `scenePass = pass(scene, camera, { samples: graphics.principalSamples })` -
  the principal target is MSAA when the preset says so (QUALITY and MAX:
  `antiAliasing: 'msaa-4x'`, BALANCED `'smaa'`, PERFORMANCE `'off'`,
  `src/graphics-settings-registry.ts` lines 739/849/888/941).
- MRT is declared once for every consumer: `normal` (GTAO/SSR/SSGI/baked
  probes), `material` (packed metalness/roughness for SSR and the trace) and
  `velocity` - gated on `screenSpaceMrt.velocity`, which
  `screenSpaceMrtRequirement()` in `src/rendering/screen-space-post.ts` line
  158 sets from `runtime.motionBlur.enabled` alone.
- `sceneDepth = scenePass.getTextureNode('depth')` is always available.

So: **velocity is present but only when motion blur is on.** Motion blur is
`0` on PERFORMANCE, BALANCED and QUALITY and `0.35` on MAX
(`graphics-settings-registry.ts` lines 745/855/894/947). On MAX the
attachment TAA needs is already paid for; on QUALITY it is not.

`useTemporalFiltering = false` is set on GTAO (pass64-tsl-scene.ts ~line
1001: "only stable underneath a TRAA resolve this chain does not run;
without one it reads as shimmer and breaks deterministic review frames") and
on SSGI (screen-space-post.ts line 387: "Upstream's temporal filter needs a
TRAA resolve this chain does not run"). Both fall back to the spatial
denoise. **That is the thing TAA actually buys here.**

## 2. TAA - what a minimal stage is, and what it costs

### 2.1 The stage (VERIFIED from `node_modules/three/examples/jsm/tsl/display/TRAANode.js`, r185.1)

`traa(beautyNode, depthNode, velocityNode, camera)`:

- Jitters the camera projection with a 16-entry Halton sequence through
  `camera.setViewOffset` (`setViewOffset` / `clearViewOffset`, one sub-pixel
  offset per frame), and hands the UNJITTERED projection to the velocity node
  so motion vectors stay clean.
- Owns two half-float render targets, `TRAANode.history` and
  `TRAANode.resolve`, plus a depth texture for the previous frame, and ONE
  `NodeMaterial` (`TRAA.resolve`).
- Per frame in `updateBefore`: renders the resolve quad into the resolve
  target (reprojection of history by velocity, neighbourhood clamp with
  `depthThreshold 0.0005`, `edgeDepthDiff 0.001`, `maxVelocityLength 128`,
  sub-pixel correction on), then `copyTextureToTexture(resolve -> history)`.
- Upstream note, quoted from the file header: "MSAA must be disabled when
  TRAA is in use." That is `principalSamples` on the scene pass.

**Pipelines (INFERRED):** one new render pipeline for the resolve material.
Any velocity-attachment change is a material-variant change on the scene
pass and is the same set MAX already compiles at admission (478 pipelines
@admission, 0 in combat, `docs/GRAPHICS_PROFILES_2026-09-03.md` row MAX).
Both compile in the arena admission's `compileAsync` sweep, so the in-combat
count stays 0 provided the stage is built before the fence - which is where
every other post stage is built today.

### 2.2 Cost, stated as arithmetic and as a measured comparison

Per-frame work TAA adds (INFERRED from the node):

| Item | 1280x720 | 2560x1440 (owner's monitor) |
|---|---|---|
| Resolve quad, 1 full-screen pass, ~5 texture taps (history, beauty x3 neighbourhood, depth, velocity) | 0.92 Mpx | 3.69 Mpx |
| Resolve target write, RGBA16F | 7.4 MB | 29.5 MB |
| History copy (`copyTextureToTexture`), RGBA16F | 7.4 MB | 29.5 MB |
| Velocity attachment write on the scene pass (RG16F), profiles that do not run motion blur | 3.7 MB | 14.7 MB |
| Resident memory: history + resolve + previous depth | ~22 MB | ~88 MB |

Measured neighbour for scale (VERIFIED, `docs/GRAPHICS_PROFILES_2026-09-03.md`
table at line 330, 3-arena means on this machine at 1440p): PERFORMANCE
12.2 ms median -> BALANCED 12.6 ms (+SMAA, a comparable single full-screen
display pass, +shadows, +AO low) -> QUALITY 13.1 ms (+MSAA-4x, +AO high, +light
trace). The whole BALANCED->QUALITY step, which includes a 4x MSAA principal
target, is +0.5 ms median. A single half-float full-screen resolve plus one
copy on a 5080-class GPU at 1440p is therefore **bounded well under 1 ms
median** (INFERRED; the honest number is the OPEN measurement in 2.4).

What it REMOVES on QUALITY/MAX when it replaces MSAA-4x (upstream requires
it): the 4x colour+depth principal target and its resolve. At 1440p that is
4 x (RGBA16F + depth24) x 3.69 Mpx ~= 177 MB of multisampled target traffic
per frame that goes away. **The net on QUALITY/MAX is plausibly negative or
neutral, not a cost** (INFERRED). On BALANCED it would replace SMAA (one
display-side pass) with one linear-side pass plus the velocity attachment:
roughly a wash on the pass and +14.7 MB/frame on the attachment.

### 2.3 What it buys (VERIFIED as the source's own statement, OPEN as pixels)

1. GTAO `useTemporalFiltering` and SSGI `useTemporalFiltering` can be
   switched back on. Upstream rotates the sample pattern per frame and
   relies on the TRAA resolve to integrate it; today both run the spatial
   denoise instead, which blurs contact occlusion and bounce light
   spatially. This is the "modern" look difference HF-481 is asking about
   more than edge AA is.
2. Sub-pixel edge stability on grass blades, chain-link and roof edges under
   camera motion (the shimmer). SMAA/MSAA fix geometric edges, not shading
   aliasing (specular sparkle on wet surfaces, thin emissive edges), which
   only a temporal integrator fixes.
3. It opens `TAAUNode` (same file family, r185): temporal upscaling as an
   alternative to FSR 1's spatial EASU, i.e. render at 0.67x and resolve to
   native with history - the only route to "render less, look the same" the
   browser has.

### 2.4 What it costs beyond the frame (the real reasons to do it next lane)

- **The deterministic review cameras.** Every capture instrument in
  `scripts/qa/` assumes a settled frame is byte-stable. Jitter makes
  consecutive frames differ sub-pixel by design. The viewpoint differ's
  persistence-min sampling already tolerates transient noise, but the
  `diff-arena-viewpoints` thresholds were not measured under jitter.
  Mitigation: the review-camera path can pin the jitter index (TRAANode
  exposes `_jitterIndex`; a frozen review frame sets it to 0 and stops
  advancing), so a review capture is one fixed sub-pixel offset and stays
  comparable. OPEN until measured.
- **Ghosting on the viewmodel and on tracers.** History reprojection needs
  correct velocity for everything that moves; the viewmodel is rendered by
  the same pass and its velocity is its own. Disocclusion around the weapon
  silhouette and additive tracers (no depth write) will ghost unless the
  neighbourhood clamp catches them. Measure at `nuketown2-street-centre`
  with a fired burst.
- **The pipeline-rebuild contract.** TAA on/off is topology
  (`applyMode: 'pipeline-rebuild'`, like motion blur), so it lives in the
  same rebuild path and compiles at admission. Not a live uniform.
- **The registry tripwire.** A new control changes `GRAPHICS_PRESET_VALUES`
  and rotates `PINNED_CONTROL_SET_HASHES`; the doc row has to be re-measured
  (docs/GRAPHICS_PROFILES). That is the intended cost of a preset change
  and is why this lane did not add one.

### 2.5 The exact plan (next lane, runtime, one bounded change)

1. `src/rendering/screen-space-post-profile.ts`: add `temporalAntiAliasing:
   { enabled, mode: 'traa' }` to `ScreenSpacePostRuntime`, resolved from a
   new registry control `temporalAntiAliasing` (`kind: 'toggle'`, `category:
   'post'`, `applyMode: 'pipeline-rebuild'`, `runtimeConsumer:
   'temporal-anti-aliasing'`), default OFF on every named preset so the
   control-set hashes rotate only when the preset defaults are argued.
2. `screenSpaceMrtRequirement`: `velocity: runtime.motionBlur.enabled ||
   runtime.temporalAntiAliasing.enabled`.
3. `pass64-tsl-scene.ts`: when enabled, force `principalSamples = 1` on the
   scene pass (upstream requirement; the AA control's MSAA value is reported
   as overridden in the receipt, not silently ignored), build
   `traa(sceneColor, sceneDepth, sceneVelocity, camera)` as the FIRST linear
   stage (before motion blur, which reads the resolved colour), name the
   stage `traa-temporal-resolve`, add it to `LINEAR_SOURCE_STAGE_ORDER`, and
   flip `useTemporalFiltering = true` on GTAO and SSGI only when the stage is
   built (never on the request alone).
4. Review-camera pin: on `setArenaReviewCamera`, freeze the jitter index.
5. Inventory row in `src/pass65-renderer-feature-inventory.ts` (the orphan
   gate), `runtimeEvidence` line in the registry, the audit doc row
   re-measured and the hash re-pinned WITH the measurement.
6. Measure: `scripts/qa/capture-arena-viewpoints.mjs` at
   `nuketown2-street-centre` and `nuketown2-north-yard`, three consecutive
   frames each, before/after; shimmer = mean absolute luma delta between
   consecutive frames after a 3x3 high-pass, reported per station; ms from
   the existing frame-pacing receipt (`p50/p95` at 1440p) with and without.
   Acceptance: shimmer down on both stations, p95 within the existing
   profile's own noise band (docs/GRAPHICS_PROFILES lists +-1 ms), tripwire
   0, ghosting on a fired burst absent at 2x zoom.

## 3. CSM - what the sun shadow is today, and what a split would do

### 3.1 Today (VERIFIED)

- One `DirectionalLight` sun (`src/legacy-main.ts` line 3362) with one
  orthographic shadow camera. Construction defaults 96 x 108 m, near 10,
  far 150 (lines 3366-3371), then **fitted per arena** by
  `graphicsRefinement.applyArena` (`src/graphics-refinement.ts` lines
  355-362) from `SHADOW_VOLUMES`: Nuke Town `halfWidth 22, halfHeight 46,
  near 4, far 180` (line 59) = **44 x 92 m**; atomic-acres 108 x 120 m;
  map3 176 x 176 m (the widest).
- Map size: `min(definition.shadows.mapSize, activeRenderConfig.shadowMapSize)`
  (legacy-main line 4386); Nuke Town authors 2048 and `maximumDistance 150`
  (`src/rendering/arenas/nuketown2.ts` line 96); the preset gives 2048 on
  `shadowResolution: 'high'` (QUALITY, MAX) and 1024 on `'medium'`
  (BALANCED). PERFORMANCE: shadows off.
- Update mode: `shadowUpdateMode 'static'` on PERFORMANCE, BALANCED and
  QUALITY; `'dynamic'` on MAX only (registry lines 739/849/888/941). Static
  means the map is rendered on demand (`needsUpdate`), not every frame.
- Filter: PCF / PCF-soft through `renderer.shadowMap.type`
  (`shadowMapTypeForFilter`, legacy-main line 2047).
- Consumers of THIS map besides the materials: the godrays raymarch
  (`godrays(sceneDepth, camera, volumetricLight)`) reads
  `light.shadow.map.depthTexture`; `refreshShaftStage` watches the map's
  identity to rebuild the shaft when three replaces it
  (screen-space-post.ts lines 606-637).

### 3.2 Texel density arithmetic (INFERRED from the verified numbers)

| Arena | Fitted volume | 2048 map: cm/texel (x, z) | 1024 map |
|---|---|---|---|
| nuketown2 | 44 x 92 m | **2.1 / 4.5** | 4.3 / 9.0 |
| atomic-acres | 108 x 120 m | 5.3 / 5.9 | 10.5 / 11.7 |
| map3 | 176 x 176 m | 8.6 / 8.6 | 17.2 / 17.2 |

Two-cascade `practical` split (upstream `CSMShadowNode`, lambda 0.5) with
camera near 0.1 and `maxFar 60`: uniform break 30 m, logarithmic break
sqrt(0.1 x 60) = 2.45 m, practical break **~16 m**. Cascade 0 covers 0-16 m:
the light-space bounding box of that frustum slice at the player's 75 deg
FOV is ~28 m across, so 2048 texels give **~1.4 cm/texel** near the player
(3x Nuke Town's along-street density, 1.5x its across-street density).
Cascade 1 covers 16-60 m with a box ~90 m across: **~4.4 cm/texel**, i.e. what
Nuke Town has along the street today. Beyond 60 m: no sun shadow unless
`fade`/a third cascade is added.

**So for Nuke Town the whole gain is inside 16 m of the camera, and it is
2.1 -> 1.4 cm across the street.** At the owner's 1440p, a 4.5 cm shadow
texel at 10 m subtends about 4 px, a 1.4 cm one about 1.3 px - visible on
contact shadows under the appliance banks and the truck, invisible past the
turning head. For map3 (8.6 cm/texel) the arithmetic favours CSM strongly;
for Nuke Town it favours a **tighter fit or a 4096 map on MAX** (one map,
1.1 / 2.2 cm, four times the pixels, zero structural change).

### 3.3 What a split costs (VERIFIED structure, INFERRED numbers)

- `CSMShadowNode` (`node_modules/three/examples/jsm/csm/CSMShadowNode.js`,
  WebGPU-only, r185) builds one internal light per cascade
  (`_shadowNodes.push(shadow(lwLight, lShadow))`, line 182) and re-derives
  every cascade's ortho box from the camera each frame (`updateFrustums` /
  `update`). **Cascades follow the camera**, so the map must be re-rendered
  when the camera moves: `'static'` shadow mode (zero caster passes per
  settled frame on QUALITY today) becomes **two caster passes per frame** -
  on QUALITY's Nuke Town that is two passes over every `castShadow` mesh
  (~190 draws per frame become ~190 + 2 x N_casters, N_casters is a large
  fraction of 190). That is a bigger per-frame delta than TAA's resolve.
- Map pixels double at equal cascade size (2 x 2048^2), or stay equal at
  1448^2 per cascade. The renderer-feature inventory names "per-arena
  maximum shadow lights, map pixels" as the budget row.
- `light.shadow.map` on the parent sun is **never allocated** by
  `CSMShadowNode` (the cascades own their maps). `GodraysNode.setup()`
  dereferences `light.shadow.map.depthTexture`; three swallows the throw and
  composites a default `NodeMaterial` as the shaft light (HF-401, documented
  at screen-space-post.ts lines 96-119). The shafts must be re-pointed at
  cascade 0's internal light, and `refreshShaftStage`'s map-identity watch
  must follow it. That is a rendering-owner change, not a flag.
- The baked-indirect volume and the Whitted trace take the sun for
  DIRECTION and colour only; unaffected (VERIFIED: they receive
  `sources.volumetricLight` and read no shadow map).

### 3.4 The CSM plan, if an arena ever needs it

1. Behind `graphics.shadowCascades: 1 | 2` (registry, `pipeline-rebuild`,
   default 1 everywhere), in the arena admission path only:
   `sunLight.shadow.shadowNode = new CSMShadowNode(sunLight, { cascades: 2,
   maxFar: min(definition.shadows.maximumDistance, 60), mode: 'practical',
   lightMargin: 40 })`, `.camera = camera`, `.fade = true`.
2. Force `shadowUpdateMode 'dynamic'` while cascades > 1 and report it in the
   receipt; the static mode is meaningless under a camera-following split.
3. Godrays: pass the cascade-0 light to `createPass64TslSceneSystems` as the
   `volumetricLight`; the shaft rebuild watch follows that light's map.
4. Budget: cascade map size = `floor(mapSize / sqrt(cascades))` so the
   per-arena pixel budget is unchanged (2 x 1448^2 ~= 2048^2).
5. Measure on map3 (the only arena whose density arithmetic favours it),
   not on Nuke Town, with the same before/after capture at two stations and
   the frame-pacing receipt; tripwire 0 because the cascade materials
   compile at admission.

## 4. Open items

1. **OPEN - the TAA ms number.** Bounded by arithmetic and by the measured
   BALANCED->QUALITY step; the exact median/p95 needs the wiring in 2.5 and
   one headless frame-pacing run. Falsifier: if the resolve+copy adds more
   than +1.0 ms median at 1440p on QUALITY with MSAA removed, the "neutral or
   negative" claim is wrong.
2. **OPEN - the shimmer number.** Procedure in 2.5 step 6. Falsifier: no
   reduction in consecutive-frame high-pass delta at either station means
   the review-camera pin has frozen the jitter for the capture but the
   history is not integrating.
3. **OPEN - the review-camera jitter pin.** Whether a frozen jitter index
   keeps `diff-arena-viewpoints` quiet is unmeasured.
4. **OPEN - 4096 sun map on MAX** as the cheaper alternative to CSM for the
   arenas <= 92 m: four times the shadow pixels, zero structural change,
   static mode preserved. One line in `render-profile.ts` and the preset,
   plus the budget row. Not done here for the same hash-tripwire reason.
