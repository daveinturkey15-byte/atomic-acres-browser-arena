# Atomic Acres — Technical Lighting Reference Brief

Scene: two-house high-desert suburban cul-de-sac, clear morning, Mojave. Consumer: the
arena lighting rig (`src/blender-lighting.ts`, `src/rendering/arenas/atomic-acres-rebuild.ts`,
`src/rendering/art-direction.ts`). All distances are in **authored metres** — note that
`atomic-acres-rebuild-arena.ts` multiplies x and z (not y) by `ATOMIC_ACRES_REBUILD_SPREAD`
= 1.6, so a house authored 7.2 m wide stands 11.52 m wide in world space and every
*horizontal* number below is given in the space it was measured in.

Where a value is an estimate rather than a measured or published figure it is marked
*(est.)*. Where a number cannot be established honestly this brief says so instead of
inventing one — see §7.

Conventions: sRGB triplets are 8-bit display values; "linear" is linear-light 0–1;
Y is Rec.709 relative luminance; K = correlated colour temperature; nits = cd/m²;
lux = lm/m². "Display luminance" means the sRGB-encoded frame value 0–1 after the
shipped grade.

---

## 1. Place and time of day — derived, not chosen

### Place

`batch-4-nuketown-graybox/gray_topdown_01.png` (the layout authority) fixes the biome
without ambiguity: **Joshua trees** (*Yucca brevifolia*) along both verges and against the
ridge, **Mojave yucca** and agave in the yards, and piled **monzogranite boulder stacks**
on the skyline. Joshua trees are a Mojave Desert endemic and grow essentially only between
about 34°N and 37°N at 400–1,800 m; the rounded boulder piles are the Joshua Tree /
Yucca Valley monzogranite. So:

- **Joshua Tree / Yucca Valley, CA — 34.13°N, 116.31°W, ~950 m elevation** *(est., inferred
  from flora and geology in the plate; no location is authored anywhere in the repo)*.
- Consistent with the repo's own text: `art-direction.ts` calls the arena a
  "High-desert suburb ... bleached asphalt and siding, blue shade, dust in the air".

### Time

Three authored statements, and they do not agree:

| Source | Says |
|---|---|
| `arenas/atomic-acres-rebuild.ts` → `atmosphere.preset` | `range-midmorning` |
| `art-direction.ts` → `brief` | "clear **late** morning" |
| `blender-lighting.ts` → `sunPosition` (after round 1) | 35.01° elevation |

**35.01° of solar elevation is mid-morning, not late morning**, at this latitude. Solving
sin h = sin φ sin δ + cos φ cos δ cos H at φ = 34.13°N for h = 35.01°:

| Date | Declination δ | Hour angle H | Solar time | Azimuth (from N) |
|---|---|---|---|---|
| Equinox (20 Mar / 22 Sep) | 0° | 46.2° | **08:55** | 118.3° (ESE) |
| Summer solstice | +23.44° | 62.5° | 07:50 | 83.6° (E) |
| Late Oct / mid Feb | −12° | 31.5° | 09:54 | 141.4° (SE) |

Late morning (10:30 solar) at the equinox puts the sun at **49.9°**, not 35°. The rig
matches the `range-midmorning` preset and contradicts the art-direction brief's "late
morning". **Recommendation: keep 35.01° and correct the brief string to "mid-morning"**
(that string is Lane I's file). The equinox row is the one used throughout below.

The `batch-3/variants/` set (176 images: `dawn-mist`, `golden-dusk`, `night-rain`,
`overcast` for each of 44 plates) is a *variant* set, not the authored intent — the
18 frozen plates in `_judge/refs/` are all clear-day and the arena ships one static
time of day. The variants pin what a future time-of-day cycle must be able to reach;
they do not move the authored hour.

---

## 2. Sun geometry (35.01° elevation, equinox, 34.13°N)

- **Elevation 35.01°**, owner-re-pinned 2026-08-29 and preserved by round 1 of the
  `blender-lighting.ts` block. `sin h = 0.5736`, `cos h = 0.8191`, `tan h = 0.70053`,
  **`cot h = 1.4275`** — a cast shadow is 1.43× the caster's height.
- **Air mass** (Kasten–Young, `m = 1/(sin h + 0.50572·(h + 6.07995)^−1.6364)`) = **1.740**;
  at 950 m the pressure-corrected absolute air mass ≈ **1.56**. Clean, dry, low-turbidity
  air: a high-transmission sun.
- **Angular diameter 0.533°** (mean solar disc, 31.99′). Penumbra full width
  = 2·d·tan(0.2666°) = **9.31 mm per metre** of blocker-to-receiver distance. This is a
  solar constant, not a scene choice — it is the same number as any other outdoor scene.
- Sun angular *radius* 0.2666° → half-penumbra 4.65 mm/m, the figure a PCSS
  implementation takes.
- **Real sun colour at m = 1.74, clean dry air: ≈ 5,000–5,200 K** *(est., from the
  elevation-dependence literature: JOSA A 33, 1049 (2016); Granada 2-year CCT record,
  EURASIP J. Image Video Process. 2013:14)*. In a D65 sRGB pipeline that is
  ≈ **sRGB (255, 230, 210)**.
  The shipped `sunColor 0xffe9c8` = (255, 233, 200), linear (1.000, 0.8148, 0.6568),
  Y = 0.843 — a touch more yellow and less pink than 5,100 K but within a few percent.
  **The shipped sun colour is right and needs no change.**
- Sky colour: clear high-desert skylight is 10,000–20,000 K, D65 sRGB ≈ (150, 185, 255)
  near zenith, (200, 215, 235) hazy near the horizon.

### Illuminance budget outdoors *(est. — clear-sky model, not a site measurement)*

| Quantity | Value |
|---|---|
| Direct normal irradiance, clear, m = 1.74, 950 m | ≈ 900–950 W/m² |
| Direct luminous efficacy | 100–110 lm/W (Perez 1990 as implemented in ladybug / EnergyPlus) |
| **Direct normal illuminance** | **≈ 95,000 lux** |
| Direct on horizontal ground (× sin 35.01°) | **≈ 54,500 lux** |
| Diffuse sky on horizontal, very clear desert | ≈ 10,000 lux |
| Global horizontal | ≈ 64,500 lux |
| **Direct : diffuse on a horizontal surface** | **5.45 : 1 = 2.45 stops** |

That last row is the one the rig has to reproduce. §6 measures what it actually does.

### Sky and ground albedo

| Surface | Real albedo | Authored in this repo | Note |
|---|---|---|---|
| Mojave desert sand / decomposed granite | **0.30–0.35** | `0xd6c49a`, linear Y **0.561** | 1.6–1.9× too reflective |
| Aged asphalt (3–5 yr asymptote) | **0.12** | not authored in the rebuild | LBNL-49283 |
| Concrete drive / porch slab | 0.30–0.40 | — | |
| Painted siding, pale | 0.55–0.75 | massing `0xb9bcc0`, Y 0.501 | plausible |
| Interior plaster wall | 0.50–0.70 (eggshell) | `0x8f9296`, Y **0.286** | graybox grey, dark for plaster |
| Sky (luminance, not albedo) | horizon 5,000–7,000 nits, zenith 2,000–3,000, circumsolar 10,000–30,000 *(est.)* | procedural `range-midmorning` | |

The sand row matters: an 0.56-albedo ground under a 54,500-lux sun returns a bounce
roughly 1.7× what the reference photographs' ground can return, which is why the map's
shade reads flatter than the plates (§6). That material is not this lane's file.

---

## 3. The house apertures, as authored

Every number here is read out of `src/atomic-acres-rebuild-arena.ts` (read-only for this
lane) and `src/rendering/arenas/atomic-acres-rebuild.ts`.

| Quantity | Value | Source |
|---|---|---|
| Sill height | **0.95 m** | `DRESS_SILL_Y` |
| Head height | **2.35 m** | `DRESS_HEAD_Y` |
| Glazed band height | **1.40 m** | derived |
| Casing width | **1.80 m** | `DRESS_WIN_W` (widened 0.95 → 1.80 by the integrator, 2026-09-16) |
| Openings per elevation | 2, at cx ± 1.80 m | `DRESS_WIN_OFFSETS` |
| Aperture cut in the **casting** shell | casing − 2 × 0.02 m per edge = **1.76 × 1.36 m = 2.394 m²** | `DRESS_APERTURE_MARGIN` |
| Glazed elevations | the **±z faces only** (`'south'` = z0 = cz − d/2, `'north'` = z1 = cz + d/2) | house dress loop |
| Pane | `MeshStandardMaterial`, opacity **0.42**, `0x9fb8c8`, `cast: false` | `windowGlass` |
| West house | cx −13.5, cz +1.5, 7.2 × 6.0 (authored) → **11.52 × 9.60 m world**, z ∈ [−2.4, +7.2] | `houseSpec` × SPREAD 1.6 |
| East house | cx +13.5, cz −1.5, 7.8 × 6.4 → 12.48 × 10.24 m world | " |
| GLB elevation sills (when the catalog house resolves) | west **1.05 m**, east **1.15 m** | interior fit-out note |
| `interior-west` review camera | eye (−17, 1.7, 5.5) → target (−19.7, 1.2, 2.0) | arena definition |

**The two facts that decide everything below.** (1) The only glazed elevations face ±z.
(2) The `interior-west` camera stands 1.7 m in front of the +z ("north") glazed wall with
its back to it, looking down the room toward −z. So the camera's useful floor band is
**d ≈ 1.7 m to 6.2 m measured out from the north glazed wall**; anything closer than 1.7 m
is behind the camera plane.

---

## 4. Profile angle and floor hit — the table this arena never had

Profile angle **β = atan(tan h / cos γ)**, where γ is the angle in plan between the sun's
azimuth and the glazed wall's outward normal. Floor hit **d = y / tan β** for sill
y = 0.95 m and head y = 2.35 m. Sideways skew of the whole patch per metre of depth
= **tan γ**. Flux admitted per unit of glazing = **cos θ_inc = cos h · cos γ**. Sunlit
floor area per opening = A_aperture · cos h · cos γ / sin h = **3.418 · cos γ m²**.

All rows at the pinned elevation **h = 35.01°**, aperture 1.76 × 1.36 m.

| γ (sun vs. glazed-wall normal) | β | Floor hit from 0.95 m sill | Floor hit from 2.35 m head | Patch depth | Skew per m of depth | cos θ_inc (flux admitted) | Sunlit floor per opening |
|---|---|---|---|---|---|---|---|
| **58.5° — HEAD, as shipped** | **53.3°** | **0.71 m** | **1.75 m** | **1.04 m** | 1.63 m | **0.428** | **1.79 m²** |
| 45° | 44.7° | 0.96 m | 2.37 m | 1.41 m | 1.00 m | 0.579 | 2.42 m² |
| **30° — this lane's solve** | **39.0°** | **1.17 m** | **2.91 m** | **1.73 m** | 0.58 m | **0.709** | **2.96 m²** |
| 20° | 36.7° | 1.27 m | 3.15 m | 1.88 m | 0.36 m | 0.770 | 3.22 m² |
| 0° (square to the wall) | 35.0° | 1.36 m | 3.36 m | 2.00 m | 0.00 m | 0.819 | 3.42 m² |

**Read the head row against §3's camera band.** At the shipped γ = 58.5° the entire sun
patch lies between 0.71 m and 1.75 m of the north glazed wall — that is, **entirely behind
or level with the `interior-west` camera plane at 1.7 m**. The room is lit, the floor patch
exists, and the review camera cannot see it. That, and not an intensity, is why the
measured frame reads peak display luminance 0.859 with 0.14 % of pixels over 0.8 while
`living-room-eye.png` reads 1.000 and 4.4 %.

The second half of the same fact: at γ = 58.5° the glazed elevations are nearly edge-on to
the sun and admit only **42.8 %** of the direct normal irradiance, so the whole map's two
glazed elevations receive **3.57 m² of sunlit floor per house**, out of a 96 m² ground floor.

**No intensity can fix either half.** Raising the key raises the sunlit *exterior* by the
same factor (it is the same directional light); it cannot move a patch into frame and it
cannot widen it. Only the sun's **azimuth** can, and it is the one geometric term round 1
deliberately left alone.

### Where the sun *should* land

Requirements, in order:

1. The patch must be inside the review camera's floor band, d ∈ [1.7, 6.2] m.
2. The head-hit line should sit roughly a third of the way across the room, which is where
   `living-room-eye.png` puts the far edge of its beam relative to that room's depth
   *(est., read off the plate — the far edge of the floor patch lands short of the coffee
   table in an ≈ 5 m room)*. For the west house's 9.6 m-deep great room that is
   **d_head ≈ 2.9–3.2 m**.
3. Elevation stays at the owner-pinned 35.01° (it sets every exterior shadow length in the
   map and the whole sunlit-side exposure; it is not in dispute).

Requirement 1 alone cannot be met at h = 35.01°: d_sill ≥ 1.7 m needs β ≤ 29.2°, i.e.
cos γ = tan 35.01° / tan 29.2° = 1.25 — impossible. The sill hit maxes out at 1.36 m even
with the sun square to the wall. So the achievable target is requirement 2: put the *body*
of the patch in frame and accept that its near edge starts just behind the camera plane.

d_head = 2.9 m ⇒ tan β = 2.35 / 2.9 = 0.8103 ⇒ β = 39.02° ⇒ **cos γ = 0.70053 / 0.8103 =
0.8645 ⇒ γ = 30.2°**. Rounded to **γ = 30.0°**, which gives d_head 2.905 m.

---

## 5. As applied — the one value this lane changed

`ATOMIC_ACRES_REBUILD_LIGHTING.sunPosition`, in `src/blender-lighting.ts`, arena-scoped to
`atomic-acres-rebuild` on every render profile exactly as round 1 left it.

| | Before | After |
|---|---|---|
| `sunPosition` | `[-52.7, 45.7, 32.3]` | `[-30.9, 45.7, 53.5]` |
| Elevation above the aim point (y = 2.4) | 35.01° | **35.03°** (held) |
| Azimuth γ from the glazed-wall normal (+z) | 58.51° | **30.00°** |
| Standoff magnitude \|sunPosition\| | 76.87 m | **76.85 m** (−0.02 m) |
| Profile angle β on the glazed elevations | 53.3° | **39.0°** |
| Floor hit, sill 0.95 m | 0.71 m | **1.17 m** |
| Floor hit, head 2.35 m | 1.75 m | **2.91 m** |
| Patch depth | 1.04 m | **1.73 m** (+66 %) |
| Flux admitted, cos θ_inc | 0.428 | **0.709** (+66 %) |
| Sunlit floor per glazed elevation (2 openings) | 3.57 m² | **5.92 m²** (+66 %) |
| Sunlit-side horizontal irradiance | ∝ sin 35.01° | **unchanged** |
| Exterior cast-shadow length | 1.43 × height | **unchanged** |
| Exterior cast-shadow **direction in plan** | | **rotated 28.5°** |

It is a **pure azimuth rotation of the shared standoff about the vertical through the aim
point**, the exact counterpart of round 1's pure elevation rotation. The magnitude is held
so `graphics-refinement.ts`'s derivation of this arena's shadow `far: 176` from "the
volume's own diagonal (96.3 m) plus the sun standoff (76.9 m)" stays true without editing
the file it lives in (that file belongs to another lane).

**PASS 82**: no light is created, destroyed, parented, hidden or toggled. One `sunPosition`
triple on the `DirectionalLight` every profile already builds. No intensity, exposure,
count, bias, budget or threshold moves.

**The decision the owner has to make, stated plainly.** Shadow *direction* in plan is
gameplay-visible, and round 1 froze the azimuth for exactly that reason. This lane is
unfreezing it on a derivation rather than a guess — but it is still a 28.5° rotation of
every cast shadow in the map. The revert is one line. If it is rejected, the finding in §4
stands and the only remaining route to the plates' 4.4 % is to glaze a *second* wall
orientation, which is the arena module's file, not this one.

---

## 6. Exposure and the tone chain — what it actually is

The shipped chain, in order, for this arena on the `blender` profile (which is what every
capture and the owner's own session resolve to: `capture-arena-viewpoints.mjs` hardcodes
`render=quality` and `render-profile.ts:24` maps `quality → blender`, and line 29's
no-preference fallback is `blender` too):

1. `DirectionalLight` key, intensity **3.2**, `0xffe9c8` — from the arena *definition*
   (`arenas/atomic-acres-rebuild.ts:156`), which **overrides**
   `BLENDER_LIGHTING.sunIntensity 3.15` at `legacy-main.ts:4534` / `:30021`.
2. `AmbientLight` **0.55**, `0xb7b2af` — also from the definition.
3. `HemisphereLight` **0.26**, sky `0xc3bebb` / ground `0xaf9261` — from the profile.
4. `shadow-side-arena-fill` `DirectionalLight` **0.482** at `[54, 20, -42]`,
   `castShadow = false` — from the profile. The one directional that reaches inside a
   closed house.
5. `scene.environment`, PMREM of the `range-midmorning` backdrop, bound at
   `environmentIntensity = 1.0 × arenaEnvironmentScale 0.24`, measured Y **0.3105** on a
   vertical interior wall — 37 % of the light in that room.
6. **ACES filmic**, `toneMappingExposure` **1.04** (the arena's `colorPipeline` row, which
   supersedes `BLENDER_LIGHTING.exposure 1.02`).
7. The arena's CDL: gain `[1.18, 0.82, 1.18]`, lift `[0.002, 0.003, 0.006]`,
   gamma `[1.1, 0.96, 1.04]`, saturation 1.12, contrast 1.02, crosstalk −0.06,
   split-tone shadow `0x2f6f86` / highlight `0xfff4e2` at 1.45, vignette 0.06 —
   `art-direction.ts`, pinned by `art-direction.test.ts`, another lane's file.

### The shipped rig's shadow depth, against the real sky

Rig terms on a horizontal up-facing surface, blender base, Y-weighted:

| Term | Computation | Y |
|---|---|---|
| Key | 3.2 × sin 35.01° × Y(`0xffe9c8` = 0.843) | **1.546** |
| Ambient | 0.55 × Y(`0xb7b2af` = 0.4336) | 0.238 |
| Hemisphere (up normal takes the full sky colour) | 0.26 × Y(`0xc3bebb` = 0.5082) | 0.132 |
| Fill (N·L = 20/71.28 = 0.2806) | 0.482 × 0.2806 × Y(`0xe4deda` = 0.7252) | 0.098 |
| Environment IBL on a horizontal | measured 0.3105 on a *vertical*; on a horizontal it is larger | ≈ 0.31–0.50 *(est.)* |
| **Indirect total** | | **0.78–0.97** |

**Direct : indirect = 1.6 : 1 … 2.0 : 1 = 0.67–0.97 stops**, against the real clear-Mojave
**2.45 stops** of §2. The rig's shadow is **1.5–1.8 stops shallower than the sky it claims
to be**. That is the single largest remaining physical error in this arena's lighting.

**This lane did not act on it, deliberately.** Round 2 already cut the hemisphere 0.7 → 0.26
and re-solved the fill by bisection precisely to hold raid2's measured 0.44 silhouette
finding at the exterior shadow-side wall; cutting further would break that hold, and the
`NUKETOWN2_SHADOW_FLOOR` / silhouette-separation numbers are exactly the class of threshold
this project forbids weakening from the other direction. Closing the remaining 1.5 stops is
a coordinated move that needs a fresh silhouette measurement, and it is not a 90-minute
change.

---

## 7. What could not be established honestly

- **There is no EV100 for this arena, and this brief will not invent one.** `sunIntensity
  3.2` is a bare three.js `DirectionalLight` intensity with no unit attached, and
  `toneMappingExposure 1.04` is a multiplier, not a camera. Nothing in the chain is
  anchored to lux or nits. *If* one anchors the key at the §2 figure of 95,000 lux of
  direct normal illuminance, then **1 intensity unit = 29,700 lux** and the rig's
  horizontal indirect of 0.78–0.97 becomes 23,000–29,000 lux — 2.3–2.9× the real clear-sky
  diffuse of ~10,000 lux, which is the same 1.5-stop error §6 reports by a different route.
  That anchoring is a statement about what the numbers *would* mean, not a measurement.
- **Predicted display luminance for the new sun patch.** Round 2's numbers were obtained by
  inverting the full shipped chain on measured pixels from a capture. This lane may not run
  a build or a capture (the integrator owns both), so every §5 row is a *geometric*
  prediction — patch position, patch area, admitted flux — and none of them is a predicted
  display value. The honest claim is: the sunlit floor area in the `interior-west` frame
  should rise by roughly the +66 % of §5 *plus* whatever fraction of the patch crosses from
  behind the camera into frame, which is the larger of the two effects and which only the
  capture can measure.
- **Peak display luminance 1.000 may not be reachable from the rig at all.** A large share
  of the reference plate's 4.4 %-over-0.8 is the **blown-out exterior seen through the
  glass** — the street, the yellow house and the sky in the window aperture, all several
  stops over the interior. The rebuild's pane is `opacity 0.42` over `0x9fb8c8` with an
  emissive floor, so it veils the exterior to 58 % and adds a blue-grey plate on top; it
  cannot produce a blown window. That is a material, in the arena module — reported here,
  not attempted.
- **Shadow-map resolution vs. the true penumbra.** At 2048² over a shadow frustum whose far
  is 176 m, one texel is ≈ 86 mm *(est. — the ortho span is set in
  `graphics-refinement.ts`, another lane's file, and is assumed equal to the far distance
  here)*. Indoors, blocker-to-receiver distance is 1–3 m, so the sun's true penumbra is
  9–28 mm: **3–9× finer than one texel**. Window-edge softness inside the houses is
  therefore set by the shadow map, not by the sun, and the 9.31 mm/m figure of §2 cannot be
  observed anywhere in this arena at the shipped map size. Reported so nobody re-derives a
  penumbra that the rasteriser cannot show.
- **The `interior-west` camera's field of view** is not read here; the floor band
  d ∈ [1.7, 6.2] m of §3 is computed from the eye/target pair and the room's extents, and
  the far limit assumes the camera sees the floor as far as the opposite wall. A narrower
  FOV shortens the band and makes the §4 solve *more* necessary, not less.
- **Azimuth against the graybox plate.** `gray_topdown_01.png` shows long shadows running
  diagonally across the street, and it is tempting to read a solar azimuth off them. It is
  an uncalibrated oblique aerial with an unknown camera yaw, so it is **not** used as a
  derivation here, exactly as round 1 refused to use it for elevation. The γ = 30° solve of
  §4 comes from the authored sill/head heights and the review camera's geometry.

---

## 8. Cheat sheet

| Quantity | Value |
|---|---|
| Place | Joshua Tree / Yucca Valley CA, 34.13°N, ~950 m *(est.)* |
| Time | mid-morning, ≈ 08:55 solar at the equinox (NOT "late morning") |
| Sun elevation / cot | **35.01° / 1.4275** (cast shadow = 1.43 × height) |
| Sun azimuth vs. glazed-wall normal | **30.0°** (was 58.5°) |
| Sun angular diameter / penumbra | 0.533° → **9.31 mm per metre** of blocker distance |
| Air mass | 1.74 relative, 1.56 absolute at 950 m |
| Direct normal illuminance | ≈ 95,000 lux *(est.)* |
| Direct on horizontal / diffuse horizontal | 54,500 / 10,000 lux → **2.45 stops** *(est.)* |
| Sun colour | 5,000–5,200 K ≈ sRGB (255, 230, 210); shipped `0xffe9c8` is correct |
| Sill / head / band | 0.95 m / 2.35 m / 1.40 m |
| Casting aperture | 1.76 × 1.36 m = 2.394 m², two per glazed elevation |
| Profile angle β at γ = 30° | **39.0°** |
| Floor hit, sill → head | **1.17 m → 2.91 m** from the glazed wall |
| Patch skew | 0.58 m sideways per metre of depth |
| Flux admitted per unit glazing | cos θ_inc = **0.709** |
| Sunlit floor per glazed elevation | **5.92 m²** (was 3.57) |
| Ground albedo, real Mojave sand | 0.30–0.35 (authored `0xd6c49a` is Y 0.561 — too bright) |
| Rig direct : indirect, horizontal | 1.6–2.0 : 1 = 0.67–0.97 stops (real: 2.45) |
| Exposure | ACES, `toneMappingExposure` 1.04; **no EV anchor exists** (§7) |
| Shadow texel indoors | ≈ 86 mm *(est.)*, 3–9× coarser than the true penumbra |

---

## 9. Time of day — the pin, and why it stays for now

Asked by the coordinator mid-lane. `ARENA_DAYLIGHT_PROFILES['atomic-acres-rebuild']`
(`src/rendering/lighting-conditions.ts:276`) is
`pinned: true, authoredHour 10.5, hourRange [10.5, 10.5], dayWindow [6, 19],
elevationRange [10, 68], azimuthSwing 30`.

### Does `?tod=` (or `?todhour=`) override the pin? No. Three independent locks.

Proven mechanically by calling `resolveLightingConditions` for this arena at every
`LightingTimeChoice` and at `fixedHour` 6 / 8 / 10.5 / 13 / 17 / 19 — **all twelve return
`hour 10.5`, `sunElevationDeltaDegrees 0`, `sunAzimuthDeltaDegrees 0`,
`sunIntensityScale 1`.**

1. `resolveLightingHour:460` — `if (daylight.pinned || choice === 'authored') return
   daylight.authoredHour;` The `choice` that `?tod=` feeds is consulted only *after* this
   short-circuit.
2. `resolveLightingConditionsWithProfile:571` — `fixedHour` is clamped into
   `[min(low, high), max(low, high)]`, which for a zero-width band is the single value
   10.5. So `?todhour=` collapses even before the pin is read.
3. `resolveLightingConditionsWithProfile:574` — `const hour = daylight.pinned ?
   daylight.authoredHour : requested;` The pin beats the `fixedHour` escape hatch outright.

**Consequence for a capture matrix: there is no runtime route that sweeps time of day on
this arena.** Unpinning alone is not enough either — lock 2 means the band must widen too.
Both `pinned` and `hourRange` have to move together.

### Recommendation: keep it pinned this pass. Four reasons, in order of weight.

1. **The row's anchor is wrong by 26° and unpinning would apply that error to every
   frame.** `arcElevationDegrees` is `low + (high − low)·sin(π·phase)` with
   `phase = (hour − 6)/13`. At `authoredHour` 10.5 that is
   `10 + 58·sin(62.31°) = **61.35°**` — while the rig's actual sun, after round 1 and
   round 3, stands at **35.01°**. Every write in `LightingConditionWrites` is a *delta from
   the authored hour*, so the moment `pinned` goes false the model starts measuring
   excursions from a 61° sun that does not exist. The arena's own arc puts a 35° sun at
   **hour 7.85 or 17.15**; §1's independent solar solve puts it at **08:55 solar** at the
   equinox. Both disagree with 10.5. **`authoredHour`, `elevationRange` and `dayWindow`
   have to be reconciled with the rig before the pin can safely come off** — and that
   reconciliation is a change to gameplay lighting, not to review frames.
2. **The four variants are not four hours.** Of `dawn-mist` / `golden-dusk` / `night-rain` /
   `overcast`: `overcast` is a *weather* state the model already has
   (`skyDarkenAmount`, which explicitly pulls excursion back toward identity);
   `night-rain` is night, and `elevationRange[0] = 10` means this model **structurally
   cannot put the sun below 10°**, let alone below the horizon. Only `dawn-mist` and
   `golden-dusk` are hours, and both sit at 2–10° of elevation — under the model's floor.
   A band alone will not make those 176 plates gradeable; two of the four need model work
   that is nobody's lane today.
3. **The module's own comment names the procedure and this lane cannot run it**: "A later
   lane fills this row in with a measured band using the procedure in section 4 of
   `docs/DYNAMIC_LIGHTING_2026-09-03.md`", and `assertLightingConditionSafety` checks every
   arena at every hour in every weather against `LIGHTING_CONDITION_BOUNDS`. That needs
   captures and a readability pass; this lane may not build or capture.
4. **Two things under this arena's sun moved today** — the apertures (integrator) and the
   sun azimuth (§5). Adding a live time-of-day band on top of both, unverified, in the same
   pass, is the change that cannot be reviewed.

### The band, derived, for whoever does unpin it

At 34.13°N (§1), so the next lane does not pick by feel:

| Field | Shipped | Derived | Why |
|---|---|---|---|
| `authoredHour` | 10.5 | **8.93** (08:56) | the hour at which a real equinox arc at this latitude reaches the rig's pinned 35.01° |
| `elevationRange` | [10, 68] | **[10, 56]** | equinox solar noon at 34.13°N is 90 − 34.13 = **55.87°**; 68° is a declination of about +12°, i.e. an early-May arc, not this scene's |
| `dayWindow` | [6, 19] | **[6, 18]** | equinox day length is 12 h, sunrise 06:00 / sunset 18:00 solar |
| `hourRange` | [10.5, 10.5] | **[8.0, 11.0]** *(est.)* | 24.4° → 46.7° of elevation: a mid-morning band that keeps the map's identity and stays inside the model's 10° floor. Dawn and dusk need the floor lowered first (reason 2) and belong to a later, wider pass. |

Nothing in this section was applied. `lighting-conditions.ts` is unmodified by this lane.
