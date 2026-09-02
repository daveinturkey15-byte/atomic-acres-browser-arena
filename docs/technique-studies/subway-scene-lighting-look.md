# Technique study — the subway-game lighting look (HF-421)

**Lane:** HF-421 (Atomic Acres overnight sweep, 2026-09-02). **Feeds:** Lane AL (lighting
quality tiers), Lane AB (dynamic lighting), HF-418 (graphics ladder), Map 3 corridor trial.
**Author:** Claude Code (Opus 5.1) on `dave-gaming-pc`. **Claim states are marked inline.**

---

## 1. Source resolution

- **Owner-shared:** <https://x.com/bijanbowen/status/2094931925513261273> — Dave, 2026-09-02
  ~21:50 BST: *"this looked incredible? how can we get this style of lighting and high
  graphics? Subway game."*
- **Resolved** without logging in, via `https://api.fxtwitter.com/bijanbowen/status/2094931925513261273`
  (HTTP 200, JSON). **State: RESOLVED.** No auth wall was hit; no search substitute was used.
- **Author:** BijanBowen (`@bijanbowen`), verified individual, Boston MA, YouTube
  <https://www.youtube.com/@bijanbowen>. **Posted:** Tue 01 Sep 2026 23:34 UTC.
- **Post text, verbatim and complete:** `Claude Fable 5.1 Ultracode subway fps game`
  That is the entire caption. **There is no thread, no reply chain of the author's, no linked
  repository, no linked article, and no linked video page.** The post is one line of text over
  one attached video.
- **Artefact:** a single 3 min 35 s (215.2 s) screen recording, 3840x2160, H.264/MP4, served
  from `video.twimg.com`. Engagement at read time: 1350 likes, 117,668 views, 84 replies.
- **Licence: UNKNOWN.** No licence is stated anywhere on the post, and no code exists to
  licence. The video is the author's own copyrighted screen recording. **Nothing from it may
  be copied** — not frames, not textures, not UI, not the station identity. This study records
  *observations and derived technique only*, which is the standing owner policy for
  no-licence sources (register Authority §2b).
- **Paid vs public:** entirely public. No paywall, no product, no sponsorship marking, nothing
  to buy. There is also **nothing to download or run** — the game is not published.

### What I did to observe it

Fetched the post JSON, the poster thumbnail, and the 1280x720 variant of the video
(42.4 MB, `DOgoipiVc2G5ZAwt.mp4`) into the session scratchpad, and extracted 17 frames at
13 s spacing with ffmpeg, plus two lanczos-upscaled crops for close inspection. Frames were
read directly. **No browser was launched** (owner rule), and no measurement was taken on this
machine's GPU (it was at 14.3/16.3 GiB used by the owner's own work throughout).

---

## 2. What it observably is

**VERIFIED from the frames themselves** — this is the single most important finding and it
changes the whole answer:

> The game is **running in Google Chrome, in a tab titled "Ashworth St", at
> `localhost:8080`, on a Linux desktop (GNOME)**. The Chrome chrome (tab strip, omnibox,
> "New Chrome available" button) is in every frame; the recording is a full-screen capture
> with a facecam PiP, not a captured game window.

So the answer to *"what engine/renderer produced it"* is not Unreal, not Unity, not a
path tracer. **It is a browser game served off a local dev server** — the same class of
artefact as Atomic Acres, made by the same tool we are using. The caption says the builder
was **Claude Fable 5.1 in Claude Code's `ultracode` mode** (a parallel multi-agent effort
setting; CLAIMED by the author, and consistent with the artefact).

**CLAIMED, not verified:** the renderer is three.js WebGL2 with a post-processing chain
(`UnrealBloomPass`-class bloom + a filmic tonemap). I could not read the source — it is not
published — so this stays CLAIMED. The evidence for it: browser + `localhost:8080`, the
specific soft wide bloom shape, the ACES-like highlight roll-off, and the fact that a single
agent session produced it (three.js is overwhelmingly the route agents take). It is
**not** WebGPU-specific in anything I can see.

### Scene content (VERIFIED by inspection)

A wave-defence FPS on a two-track underground station platform: tiled walls with a station
name frieze ("ASHWORTH ST"), cast-iron columns every few metres, a coffered concrete ceiling
with red service pipes, hanging fluorescent fixtures, benches, a vending machine, posters,
a yellow tactile platform edge, litter, and trains that arrive at the platform mid-wave.
HUD: wave counter, kill counter, health bar, weapon/ammo block, bracket crosshair.

---

## 3. Which lighting technology it is — the four hypotheses, decided

| Hypothesis | Verdict | The observation that decides it |
| --- | --- | --- |
| Path traced | **NO** | Zero sampling noise anywhere, including in the dark platform ends where a path tracer is noisiest; hard-edged flat decals; no soft indirect shadowing; a live 4K 60-ish capture in a browser tab. |
| Real-time GI | **NO** | **The falsifier is colour bleed.** A saturated red vending machine (frame 002) and red doors (crop) sit against grey concrete with **no red on the adjacent floor or wall**. Any RTGI/DDGI/SDFGI solution would bleed there. Nothing in any frame bounces colour. |
| Baked GI / lightmaps | **NO** | **There are no cast shadows at all.** In the close crop, a 40 cm cast-iron column standing under lit ceiling fixtures casts *nothing* on the floor; benches have no contact shadow; the litter and the vending machine have none. A lightmap bake gives you those shadows for free and they are the cheapest thing in the image — a "baked" look with no shadows is a contradiction. There are also no lightmap seams and no second UV set behaviour. And an agent building in one session has no bake step in the loop. |
| **Clever emissive + fog + post** | **YES — this is what it is** | Everything is consistent with it, and nothing contradicts it. Details in §4. |

**So: the look Dave is asking for is not bought with lighting technology we do not have. It
is bought with art, value composition and a post chain — all of which we already own.**
That is the good news of this study, and it is the sentence that should reach the graphics
ladder (HF-418).

---

## 4. The actual recipe, read off the frames

Ranked by how much each contributes to the "high graphics" impression:

1. **Architecture that is correct and repetitive.** A real subway platform module: columns on
   a regular pitch, a coffered ceiling with a service-pipe run, a tile course with a dado band
   and a frieze, a tactile edge strip. Strong one-point perspective down a long corridor. This
   alone does more than any shader: repetition at a known human scale reads as "built by
   someone who knew what they were doing".
2. **Value composition.** ~85% of every frame sits in a narrow desaturated grey-green band.
   Against that: a handful of small blown-white highlights (the fixtures), and three or four
   *saturated* accents (yellow edge strip, red posters/vending machine/doors, amber signage).
   Almost all the perceived "richness" is this contrast discipline, not lighting.
3. **Surface break-up.** Four or five overlay layers on plain tile/concrete: stains, damp
   blotches, cracks, moss-green patches on the ceiling, paint chips, plus loose litter quads
   and dark wet-patch decals on the floor. Frame 001 crop: the "puddles" are **flat dark
   polygons with a hard-ish edge and no reflection of the ceiling lamps** — decals, not
   reflective water. The eye reads "grimy real place"; the GPU pays almost nothing.
4. **Emissive fixtures + wide bloom.** Fixture faces are pure white emissive bars; the halo
   around them is a wide, soft, thresholded bloom. Wall brightness around each small lamp
   falls off broadly and smoothly — a point light with inverse-square decay and a short
   range, one per *visible* fixture only.
5. **Aggressive distance darkening.** The far end of the platform goes to near-black within
   ~40 m. This is doing double duty: it is the mood, *and* it is why only a handful of lights
   ever need to be real. Fog colour is dark and slightly green, matched to the concrete.
6. **Dust motes.** A sparse white point-particle field with a slow drift, densest in the lit
   volume near fixtures. Cheap; sells "volume" without volumetrics.
7. **One dynamic exposure/bloom event.** When the train arrives its headlight blows the entire
   frame to white with streaked light shafts through the dust (frame 009). This single moment
   is what makes viewers say "incredible" — it reads as a camera with real exposure. It is a
   moving bright emissive + a light + bloom, nothing more.
8. **Emissive train windows** spilling onto the platform when the train is in (frame 013).

### Post chain (CLAIMED, inferred from pixels)

- **Tonemap:** filmic with a soft shoulder — ACES-ish. Highlights roll to white without hue
  shifting to cyan; the blown headlight stays neutral.
- **Exposure:** roughly fixed, with the headlight simply overdriving it. I see **no**
  convincing auto-exposure adaptation (the frame does not recover over the seconds after the
  headlight passes in the frames I sampled). CLAIMED, sampled at 13 s spacing — a denser
  sample could refute it.
- **Bloom:** high radius, moderate threshold, high intensity. It is the loudest post effect.
- **Grade:** desaturated with a green-grey shadow tint and a slight warm highlight tint —
  a classic split tone, plus mild contrast.
- **Vignette:** mild.
- **Grain:** possible but **OPEN** — the video is 2.1 Mbps H.264 at 720p and compression
  noise cannot be separated from film grain at that bitrate. Do not assume grain is present.
- **AO:** **not observed.** No darkening in the wall/floor or column/floor junctions beyond
  what the light falloff itself gives. If SSAO is on, it is very weak.

---

## 5. The closest achievable equivalent in this repo

Under the repo contract (three r185, `three/webgpu` NodeMaterial + TSL only, original
procedural art, no imported meshes/images/LUTs, cold-compile admission fence never widened):

| Element in the source | Our route | Where it already lives |
| --- | --- | --- |
| Emissive fixture + halo | `material.emissiveNode` driven above the bloom threshold, one instanced fixture material | `src/map3/corridors.ts:357` already does exactly this for a headlight (`rgb(0xffe899, 2.5)`) |
| Bloom, tonemap, split tone, vignette | Already shipped, per-arena | `src/rendering/filmic-grade-chain.ts`, `src/rendering/art-direction.ts`, `src/rendering/screen-space-post.ts` |
| Distance darkening | Per-arena atmosphere density + fog, **not** vignette (see gotcha) | `src/atmosphere-system.ts`, `ArenaArtDirection.atmosphere` |
| A few real lights, the rest faked | Authored spot lights with occlusion audit; everything else emissive + a light-pool decal | `src/arena-contrast-lighting.ts`, `src/rendering/light-occlusion.ts` |
| Dust motes and shafts | Particle field with up to 6 light shafts | `src/particles/particle-field.ts` (`PARTICLE_MAX_LIGHT_SHAFTS = 6`) |
| Grime/stain/crack break-up | Procedural TSL masks over the base material — never an imported texture | `src/rendering/surface-forge.ts`, `src/map3/foliage-material.ts` as the pattern |
| God rays for the train moment | Existing preset field | `src/blender-lighting.ts` (`godRayStrength`, `godRayLobes`) |

**The honest summary for the ladder:** we are not missing a renderer feature. We are missing
(a) a corridor-scale *emitter kit* (fixture + halo + light-pool decal as one prewarmed set),
(b) a *value target* per arena that is actually dark enough, and (c) the grime layer. All
three are art-authoring work inside the existing fence, not renderer work.

### Two repo-specific gotchas this study produced

1. **You cannot get the halo by lowering the bloom threshold.**
   `ART_DIRECTION_SAFETY_BOUNDS.bloomThresholdScale` is `[1, 1.3]` and
   `MINIMUM_COMPOSED_BLOOM_THRESHOLD` is `1.02` linear — thresholds may only move **up**.
   The halo must come from driving `emissiveNode` intensity above the threshold, not from
   letting more of the scene bloom. (This is deliberate: it keeps sightlines readable.)
2. **You cannot get the black tunnel end from the vignette.**
   `vignetteBase` is capped at `0.24` and `DISPLAY_VIGNETTE_MAXIMUM` is `0.5`, precisely so
   the screen periphery enemies enter from keeps ≥ ~79% luminance. The falloff has to come
   from atmosphere/fog density (`atmosphereDensity` ≤ 1.35) and from **not lighting** the far
   end — which is also how the source does it.

### What must NOT be copied

The station identity ("Ashworth St"), any signage, poster or UI layout, the wave/HUD
presentation, and any frame of the video. No licence exists. We take the *method* — emissive
fixtures, dark fog, decal grime, value discipline, one exposure event — and author our own
place. Our corridor is a Map 3 service corridor, not a subway station.

---

## 6. Claim register

| Claim | State | Evidence |
| --- | --- | --- |
| The post is one line of text plus one 215 s video; no repo, no article, no thread | VERIFIED | fxtwitter JSON, read in full |
| It is a browser game in Chrome at `localhost:8080`, tab "Ashworth St", on Linux | VERIFIED | Visible in every extracted frame |
| Built by Claude Fable 5.1 under Claude Code `ultracode` | CLAIMED (author's own caption) | Post text |
| Not path traced; not real-time GI; not baked GI | VERIFIED by falsifier | No sampling noise; **no colour bleed** off saturated props; **no cast shadows at all** |
| Emissive + fog + bloom + filmic grade is the whole recipe | VERIFIED (consistent, nothing contradicts) | §4 frame observations |
| Renderer is three.js WebGL2 with an UnrealBloom-class chain | CLAIMED | Bloom shape, roll-off, platform; source not published |
| Fixed exposure (no auto-exposure adaptation) | CLAIMED | 13 s frame sampling; a denser sample could refute |
| Film grain present | OPEN | Indistinguishable from H.264 noise at 2.1 Mbps |
| SSAO present | OPEN — probably absent | No junction darkening observed |
| Licence of anything in the source | UNKNOWN, treated as all-rights-reserved | Nothing stated |

---

## 7. Experiment plan — the Map 3 trial (for the next agent)

See `subway-scene-lighting-look-report.md` §Experiment plan for the executable version with
budgets and the pass/fail bar.
