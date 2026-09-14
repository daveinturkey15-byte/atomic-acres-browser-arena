# HF-481 - the quality gap, named technique by technique

Lane LOOK. Branch `contrib/dave-gaming-pc/claude/nuketown2-look`, base
`baece3b1` (`pass93-candidate`). 2026-09-04.

Owner: *"why do these other examples look so much cooler and modern than ours?
are you not using the same techniques?"*

The honest short answer is in two halves, and both halves matter:

1. **We are using most of the techniques.** SSR, SSGI, GTAO, godrays, DOF,
   motion blur, bloom, an ACES filmic grade chain with ASC-CDL, split tone,
   toe, grain and vignette, a baked-indirect probe volume and a Whitted trace
   are all built and all wired. `screen-space-post.ts` is 734 lines of real
   node graph. This is not a stack that is missing post-processing.
2. **The look is not decided by that stack.** It is decided upstream of it, by
   material albedo, by the sky, and by what happens to light between the camera
   and the far fence. Every one of the captures below fails in the *same three
   places*, and none of those three places is a post-processing effect.

---

## 0. What was actually compared

| Reference | What it is | Fair comparison? |
|---|---|---|
| [chrisgpt/2095399017723179173](https://x.com/chrisgpt/status/2095399017723179173) | "Fable 5.1 - FPS - Remake a call of duty demo from a screenshot. One shot, 30 hours." Video only, no repo. | **Yes** - same genre, same claim (built from a screenshot). |
| [threejs/2095697056900026435](https://x.com/threejs/status/2095697056900026435) -> **[cosy-japan.vercel.app](https://cosy-japan.vercel.app)** | *Natsu no Michi*, a playable three.js scene. **Live, and I opened it and looked at it.** | **Yes, and it is the single most useful reference** - same renderer family, same browser, a real frame I can put next to ours. |
| [rileybrown/2095632207813521534](https://x.com/rileybrown/status/2095632207813521534) | "Built this with Astra (GPT 6) this AM." Video only. | Partly - no stated engine. |
| [mattshumer_](https://x.com/mattshumer_) | Manhattan street-by-street, agents-in-a-world. Explicitly **Unreal Engine**, over **a week**. | **No.** Comparing our browser WebGPU arena to UE5 output is not a like-for-like on technique; it is a like-for-like on *ambition*, which is a fair thing for the owner to hold us to and an unfair thing to grade our renderer by. |
| `C:/Users/david/projects/morning-diner-ref` | The procedural diner. Read the source. Method carried as `photoreal-procedural-scene-forge`. | **Yes** - it is the method reference, not a look reference. |

One reply under the cosy-japan post is worth recording because it is the
counterweight: "i could fry an egg on my computer when I play this (it's a very
good computer) with how hot it got". That scene is not holding 240 Hz with
sixteen networked actors, hitscan authority and a shadow-casting sun. Some of
its budget is spent in places we structurally cannot spend it. That does **not**
excuse the failures below, all of which are cheap.

## 1. Three.js r185 `webgpu_*` examples relevant to look

Pulled from `examples/files.json` on `mrdoob/three.js@dev` (HF-481
source-priority policy: current source before memory). Grouped, with our status.

| Category | Upstream examples | Ours |
|---|---|---|
| Bloom | `webgpu_postprocessing_bloom`, `_bloom_emissive`, `_bloom_selective` | **present** - depth-guarded threshold bloom, `bloomQuality: 'cinematic'` |
| AO | `webgpu_postprocessing_ao` | **present** - GTAO, `ambientOcclusion: 'high'` at Quality |
| SSR / SSGI | `webgpu_postprocessing_ssr`, `_ssr_denoise`, `_ssgi`, `_ssgi_ballpool` | **present but throttled** - SSR `'low'`, SSGI **`'off'`** at Quality |
| DOF / motion blur / TAA | `_dof`, `_dof_basic`, `_motion_blur`, `_traa`, `_ssaa`, `_smaa`, `_fxaa` | DOF **off** at Quality, motion blur **0** at Quality, no TRAA |
| Colour grade | `webgpu_postprocessing_3dlut`, `webgpu_tonemapping` | ACES + ASC-CDL chain **present**; **no 3D LUT** |
| Godrays / volumetrics | `webgpu_postprocessing_godrays`, `webgpu_volume_lighting`, `_volume_lighting_rectarea`, `_volume_lighting_traa`, `webgpu_volume_perlin`, `webgpu_volume_cloud` | godrays **present**, `volumetricLightShafts: 'low'` at Quality, **`'off'` at Balanced and Performance** |
| Fog / atmosphere | `webgpu_custom_fog`, `webgpu_custom_fog_scattering`, `webgpu_custom_fog_background`, `webgpu_fog_height`, `webgpu_postprocessing_fog` | **MISSING** - we ship stock linear `THREE.Fog(near, far)` and nothing else |
| Sky | `webgpu_sky` | **MISSING** - we ship a painted gradient + procedural cloud band on a backdrop |
| Transmission / iridescence / sheen / clearcoat | `webgpu_materials_transmission`, `webgpu_clearcoat`, `webgpu_loader_gltf_iridescence`, `_sheen`, `_transmission`, `_dispersion` | **MISSING on this arena's glass** |
| Reflections | `webgpu_reflection`, `_reflection_blurred`, `_reflection_roughness`, `webgpu_mirror` | SSR only |
| Particles | `webgpu_particles`, `_particles_soft`, `webgpu_compute_particles`, `webgpu_tsl_vfx_*`, `webgpu_instance_points` | **present** - instanced ambient drift catalog, all eleven arenas |
| Instancing | `webgpu_instance_mesh`, `_instance_sprites`, `webgpu_mesh_batch` | **present** - grass, foliage, particles |
| Contact shadows | `webgpu_shadow_contact` | **MISSING** |

## 2. Grading our frames, technique by technique

Evidence: `C:/Users/david/projects/aa-claude-hitl/docs/evidence/pass94/candidate/nuketown2/*.png`
(headless native-WebGPU, `render=quality`, `renderer=webgpu` -
`scripts/qa/capture-arena-viewpoints.mjs:49,148`, so these frames *are* the
Quality profile with the post stack live, not the WebGL2 compat path).
Cross-checked against `aa-claude-nuketown6/.../pass93/nuketown2-tiptop/cycle-6/`.

| # | Technique that produces the "modern" read | Ours | Evidence |
|---|---|---|---|
| 1 | **Tone mapping + derived exposure** | **present** | ACES, exposure 1.08 derived per preset in the lighting lane's `presets.ts`. This one is genuinely good. |
| 2 | **Bloom discipline** (threshold on display-referred brightness, tight) | **present** | `nuketown2-north-interior.png`: the troffer is at threshold and does not smear. Correct - and invisible, because there is nothing else bright. |
| 3 | **Contact shadows / grounded AO** | **WEAK** | `nuketown2-front-porch.png`: the hedge, the kerb bollards and the parked sedan meet the ground on a hard line with no darkening. `nuketown2-north-interior.png`: **every wall-to-floor and wall-to-ceiling junction is a clean seam with zero occlusion**. GTAO is `'high'` and it is doing nothing visible, because there is no albedo or normal variation for it to modulate. |
| 4 | **Reflections / SSR** | **WEAK** | SSR `'low'` at Quality, and every surface in frame is roughness~1 matte, so it has nothing to reflect. The asphalt in `into-sun-street.png` has no specular response at a grazing angle into the sun - which is the one angle where road *always* reflects. |
| 5 | **Transmission glass** | **MISSING** | `front-porch.png` and `north-upper-window.png`: the windows are **opaque flat white-grey rectangles**. No reflection of the sky, no refraction, no roughness gradient, no dark interior showing through. This is the single loudest "code-made" tell in the exterior set. |
| 6 | **Atmosphere / aerial perspective** | **MISSING** | `front-porch.png`: the mountain ridge is a flat un-hazed purple silhouette sitting on a flat lavender sky. `overhead.png`: the ground plane outside the fence is a uniform cream with **no distance falloff at all**, and the far treeline is the same value as the near treeline. We ship `THREE.Fog` 58..148 m linear, which cannot produce height falloff, cannot produce sun-direction inscattering, and does not touch the backdrop. Compare cosy-japan: its road washes to pale desaturated blue by mid-distance and its far trees are lighter *and bluer* than its near trees. That single effect is most of the perceived gap. |
| 7 | **Volumetric light shafts** | **WEAK / OFF** | `volumetricLightShafts: 'low'` at Quality, **`'off'` at Balanced and Performance** (`graphics-settings-registry.ts:742,852,891,944`). `into-sun-street.png` is a straight shot into the sun through a treeline and a pole - the textbook shaft frame - and there is not one shaft in it. |
| 8 | **Particle life** | **present but invisible** | `particle-catalog.ts:294` gives nuketown2 road grit + lawn seed at density 0.42, opacity **0.10**. I cannot find a single mote in any of the seven exterior captures. Structurally shipped, perceptually absent. |
| 9 | **Motion / camera language** | **N/A for stills** | motion blur 0 at Quality by combat policy. Correct call; not the gap. |
| 10 | **Material micro-detail** | **WEAK - and this is the root cause** | The siding in `front-porch.png` is one flat blue with a lap-line normal and nothing else: no dirt gradient at the base, no sun-bleach at the top, no colour variance board to board. The skill's rule 4 is exactly this: "Anything the frame must show is a 10-30% albedo step or geometry. Roughness is the second layer, never the carrier." Our albedo steps are ~0%. That is why AO, SSR and GTAO are all on and all invisible. **Materials lane owns this; it is the largest single item and it is not mine.** |
| 11 | **Colour grading** | **WEAK** | We are at full saturation on pure hues - pure cyan house, pure yellow house, pure red fence, pure green hedge - with no hue convergence and no value hierarchy. cosy-japan holds its entire foreground inside a narrow, desaturated, cool value band and lets *only* the sky be bright. Ours is a full-range, full-saturation image in which nothing is more important than anything else. We have an ASC-CDL and a split tone; we have no per-time-of-day LUT and no saturation discipline. |

## 3. What cosy-japan actually does that we do not

Read off the live frame, not off a description:

- **Foliage is thousands of small overlapping leaf cards with per-leaf colour
  variance**, from yellow-green to deep shadow green. Ours (`overhead.png`) is
  flat green cones and spheres. High-frequency silhouette break-up is most of
  why theirs reads as a place and ours reads as a diagram. *(Techniques lane.)*
- **Value composition.** Their whole foreground sits in shade at a narrow value
  range; the sky is the only bright thing in frame. Ours has no such hierarchy.
- **Aerial perspective, hard.** Their mid-distance is visibly washed and cooled.
- **Saturation is pulled down globally** and hues converge toward teal/olive.
- **Overhead power lines crossing the sky.** Two draw calls of thin geometry,
  and it is worth more to the "a person made this" read than any post effect
  in the table above.
- It is **stylised, not photoreal**, and it commits. That is an art-direction
  decision, and it is free.

## 4. The verdict, stated plainly for the owner

We are not failing to use the techniques. We are running an advanced post stack
**on top of a scene that gives it nothing to work with**, and we are missing the
cheapest atmosphere techniques entirely:

- **Root cause (not my lane):** flat albedo. Materials lane.
- **Root cause (mine):** no aerial perspective, no transmission glass, no
  contact shadows, shafts throttled off, particles below visibility, no LUT.

The gap is closeable, and none of the closes are expensive. What this lane
actually built, measured, is in `REPORT.md`.

## 5. Lane coordination check

`origin/contrib/dave-gaming-pc/claude/nuketown2-lighting` head `974c56fa`
landed `src/nuketown2-lighting/{presets,writes,index}.ts` - **uniform-only
writes** (sun/ambient/fog colour, exposure, vignette numbers), no new pipeline,
and it explicitly does not own fog near/far, sky geometry or any post stage.
That branch is also **not** based on `pass93-candidate` (it predates the taser,
vehicle-forge and spawn work), so it must not be merged into this one. The
modules below are additive and adopt-able by it.

| Module | Owner check |
|---|---|
| Aerial perspective (depth + height inscattering) | New post stage. Lighting lane writes fog colour; it does not build stages. No collision. |
| Volumetric shaft budget within `volumetricLightShafts` | Existing setting, existing node. No new pipeline. |
| Ambient particle visibility | `particle-catalog.ts` data only. No collision. |
| Contact shadows | New. |
| Time-of-day grade LUT | New stage in the post contract. |
| Transmission glass / pool | Bounded by the glass-authority and water contracts. |
