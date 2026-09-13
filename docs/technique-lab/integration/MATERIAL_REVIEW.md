# Material review — Build15 house siding (critique only, no acceptance)

Lane `night-integration-20260912-material-review` · model `claude-fable-5-1` · effort `xhigh` · 2026-09-13.
This is a visual critique of two screenshots against five concepts. Nothing was rendered, measured
with a tool, or changed. No acceptance is granted or implied.

## Evidence

**Screenshots reviewed** (`captures/build15-house-final-review/`, receipt `at 2026-09-12T23:35:50Z`,
`pbrStatus: ready`, both houses `substituted: true`, so the frames show the **GLB shells**, not
the procedural house):

- `quality-house.png` — teal front, porch-close first-person camera.
- `performance-house.png` — same camera, Performance profile.

**Verified by eye in both frames**

1. The teal siding shows strong horizontal dark bands, roughly one band every second or third
   course, running the full width of every wall. On the left garage wall the bands are wide and
   nearly black-teal; on the main wall they repeat at a fixed vertical pitch across the whole
   two-storey height. The eye reads a stripe pattern before it reads "boards".
2. Local contrast inside the siding is far higher than any concept: the light courses are near
   `#3fd6c8`-class saturated teal, the dark bands are close to `#0f5a5c`-class. The concept teal
   houses (files `...5e010137...`, `...37cd28a5...`) are a chalky mint `#7fd9b8`-class with course
   lines that are a thin, subtle darker line, never a wide dark band.
3. The band pitch is visibly coarser than 152.4 mm exposure at this camera distance: the visible
   courses on the lower wall are in the same order of size as the window casing width.
4. Performance profile is brighter overall (no shadow, flatter sky) but the **same** stripe pattern
   and the same dark-band positions appear, so the banding is not a shadow or lighting artefact.
5. Trim, balustrade, pergola, casings, porch slab and flower beds read clean and close to concept.

**Source facts (read, not inferred)**

- `scripts/blender/world-studio/houses/house_textures.py:31` — siding tile is 512 px over
  2.4384 m, 16 courses at 32 px each.
- `house_textures.py:149-208` — `lap_siding`: per-board tone `±6.5 %` (`:166`, 13 % peak to peak),
  albedo course step with a 3 px shadow lip and 2 px lit lip (`:152-154`, `:171`), a dirt band in
  the lower fifth of the tile (`:187`), and the normal map halved because the course step is also
  real geometry (`:199-201`).
- `scripts/blender/world-studio/houses/build_house_shell.py:51-53` — `TILE_M["siding"] = T.SIDING_M`;
  UVs are planar per face in metres divided by the tile (`:145-172`, `:211-215`), so a two-storey
  wall of about 6 m wraps the 2.44 m tile roughly 2.5 times vertically and every wall of the same
  height repeats the same 16-course pattern at the same world Y.
- `public/assets/world-studio/blender/houses/catalog.json:36,120` — the producer already recorded:
  "Siding, shingle and stone maps are 512px procedural tiles; close-camera … will show the tile
  repeat."
- `src/world-studio/houses/index.ts:211-233` — runtime only flips `side`/`transparent`; it does not
  touch `map`, `color`, `roughness`, `repeat` or colour space of any GLB material.
- `src/world-studio/arena.ts:76-106` — the PBR library only rewrites `ground.surfaces[0..1]`
  (asphalt, concrete). No house material is touched by `pbr-library.ts`.
- `src/world-studio/lighting/index.ts:8-17` — the studio rig owns no sun, exposure or tone
  mapping; it adds interior practicals only. It cannot be the source of exterior banding.

## Diagnosis

**Verified:** the siding reads as a large-scale repeating stripe, not as boards. It is a texture
authoring problem on the GLB, not an integration or lighting problem: the same pattern is in the
lit Quality frame and the unlit Performance frame, and no runtime code modifies the GLB siding
material.

**Inferred (most likely cause, not measured):** the per-board tone variation was raised in wave 2
to 13 % peak to peak and is applied per course over a 16-course tile (`house_textures.py:163-167`).
With the tile wrapped ~2.5× vertically and identically on every wall, the darkest two or three
courses of the 16 become world-aligned dark bands at a fixed pitch. The course-lip shadow (`:171`)
and lower-fifth dirt (`:187`) stack on the same courses and widen the bands. The saturated base
palette then turns "darker board" into "near-black stripe" in sRGB.

**Unknown:** the exact palette values (`palette["siding"]` / `siding_shade`, `house_textures.py:383`)
were not read; whether the exporter writes the albedo as sRGB (correct) or linear-tagged (would
also over-darken) was not inspected in the GLB bytes; the exact repeat count on each wall was not
measured. None of these change the verified stripe reading.

## One repair

Reduce the per-board tone amplitude in `lap_siding` (`house_textures.py:166`) from 0.13 back
toward 0.05 **and** break the per-course tone with a low-frequency, per-column component so no
whole course shares one tone across the tile. Regenerate the two shell GLBs. Nothing else
(geometry, contract, UV density, runtime) changes. This is one function in one generator file.

## Falsifier

Re-capture `quality-house.png` from the same camera after the change. If the same-pitch dark bands
are still visible across the full wall width, board tone was not the cause and the bands come from
the course-lip shadow / dirt gradient (`:171`, `:187`) or from an sRGB/linear mismatch in the
exported albedo, and the repair above should be reverted, not extended.

## Remaining mismatch

- Concept teal is chalky mint; Build15 teal is saturated cyan. Palette, not addressed by this repair.
- The concepts show stone chimneys, roof overhangs with visible shingle edge, and soft ambient
  occlusion under the porch. Build15's front frame shows none of these from this camera.
- Grass, road and flower beds are flat-shaded card colour against the concepts' dense grass.
- Two garage windows per house remain empty apertures (handoff, glass decision).
- No browser acceptance, no measurement, no repair performed here.
