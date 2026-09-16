# Atomic Acres — afternoon pass, 2026-09-16

Session 15:00–18:00, dave-gaming-pc, Claude Code (Opus 5) as integrator with seven Opus
lanes. Branch `contrib/dave-gaming-pc/omp/atomic-acres-rebuild-20260914`, pushed.
Every frame below is a real-GPU capture (installed Chrome headless, nvidia,
`backend=webgpu`) — no software-rasteriser frames.

Supersedes `INSPECT-2026-09-16.md` (the morning pass), which stays valid for its own work.

## Open these

- **`C:\Users\david\Desktop\stuff\atomic-acres-catalog\catalogue.html`** — the catalogue
  you asked for. All 556 references, thumbnailed, grouped by what each set is FOR, each
  tagged with its capture station, and every *paired* one now showing the live in-engine
  frame beside it. Open in a browser.
- **`repo-state\cmp-INDEX-*.png`** — contact sheet, reference left / in-engine right.
- **`repo-state\rb16-interior-west.png`** — start here. This is the room that was an
  orange-plank ceiling over a lavender void this morning.
- **`repo-state\rb16-*.png`** — the 15 raw stills.

## The catalogue, and the number it produced

You were right that a catalogue existed — but it was `assets-batch1/index.html`, an **asset
gallery of our own output** (85 turnaround renders), not of your references. I searched the
machine: the largest HTML anywhere was 31 images. It did not exist, so I built it.

It produced the number this whole effort needed:

```
reference images   556
paired to a station  9    ->  15 after this pass
UNPAIRED           547    -> 541
corpus coverage    1.6%   ->  2.7%
```

**Even your 18-plate frozen bar only had 9 stations** — half your own bar was graded by
nothing. That is the structural reason lane output stopped moving the frame.

It stays uncomfortable on purpose. The remaining 541 are 176 time-of-day variants, 278
video frames and 58 plates; those need a time-of-day matrix and a motion harness, not more
static stations — and the matrix is blocked (below).

## What moved, measured

**The magenta cast is fixed at its source.** The CDL gain was `[1.18, 0.82, 1.18]` — red
and blue *identical at the ceiling* with green at the floor, a pure green cut, magenta by
construction. New evidence reframed it: **all 18 of your plates measure whole-frame green
deviation positive; 8 of the 9 shipped captures measured it negative.** The cast was
inverted against your bar arena-wide.

| set | mean gdev | mean r−b |
|---|---|---|
| this morning | **−0.0235** (magenta) | +0.0592 |
| now | **+0.0292** | +0.1276 |
| **your 18 plates** | **+0.0160** | +0.0948 |

Error down **67%**, sign right for the first time. Honest: slightly overshot warm.

The bound everyone believed blocked this was **conditional** — two earlier searches swept
the gain cube with every other axis pinned at raid2's values, and this row is a
byte-identical raid2 clone. `crosstalkDelta` is the axis neither swept and it dominates
hue. The gate margin was **improved, not spent**: 1.052 → 1.162 steps over the floor.

**Sun into interiors was geometric, not intensity** — the sun sat 58.51° off the glazed
wall normal, putting the whole patch within 1.75 m of the wall, behind the camera. One
azimuth rotation: patch depth, admitted flux and sunlit floor area each **+66%**.

**Per-family specular is now live on this arena.** `bindNuketownVehicleReflections` was
gated on nuketown2 but selected purely on `material.userData.forgeRole` — never
nuketown-specific in substance. Vehicles and glazing are tagged, and a late-bind replays
the binding for catalog GLBs, which arrive *after* the IBL traverses and hide the massing
they replace. Zero added texture memory. Glass (16 panes) gets ~4× lift; paint and chrome
read as a soft ambient lift, not a highlight, because those coats sit at roughness 0.9–1.0.

**Ambient air.** The arena authored dust and not one mote appeared in any capture — the
envelope was a birth-and-death curve on families that churn (mean 0.27 of authored), and
the volume sat 12 m above eye level against bright sky. Fixed for **zero** added draw
calls, triangles or per-frame allocation. Verified in pixels: ~11% of subpixels now shift
by ≥1 level, only 0.02–0.4% by ≥3. **Present, not obvious** — that is the honest read.

**The interiors are furnished.** Both living rooms now carry a stone chimney breast with
hearth, firebox and teak mantel; a starburst wall clock drawn in code; a teak credenza
dressed with bowl, books and a framed piece; curtains and pelmets at both glazed
elevations; a standard lamp, armchair, houseplants, framed pictures, and a dining set.
Upstairs: bedside tables with lamps, a dresser, pictures over the bed, a landing console
and runner. 17 merged meshes, 43,456 triangles, ~19 draw calls — merged per
(material, castShadow) pair rather than per piece, which would have been ~900 draws.
VRAM added: one 512² canvas, ~1.4 MB; every other material reuses a tiling this file
already binds, and every difference is a free tint.

Crucially it **protects the sun the lighting work bought**: every piece inside the
1.17–2.91 m sun band is emitted `cast: false`, and the drapes stop 5 cm clear of the
casting aperture, so the dressing physically cannot take back the +66%.

**The desert is planted.** 34 procedural Joshua trees with nine-blade spike rosettes (the
plates' signal, and no bake on disk carries one), ~700 foliage clumps breaking the hedges'
machined edges, 12 flowering shrubs, ~35 agave rosettes.

**The white boxes beside the bus are fixed, and the cause was not what anyone guessed.**
`crateAge(a, b)` indexes a material array by grid position and was written for integer
loop counters. The island cluster passed fractional spot offsets, so
`crateAge(-0.8, 2.2)` produced index **0.5999999999999996**, `crateAges[0.6]` is
`undefined`, and a non-null assertion swallowed it — four crates were built with **no
material at all** and fell back to three.js default white. The fifth sits at (0, 3), lands
on a whole number, and rendered correctly, which is why the cluster looked partly right
and read as a texturing problem. Hardened inside the helper so no caller can reintroduce it.

**Assets:** four placement-identical upgrades, worst world-AABB delta **0.000 m**. Their
real problem was texture, not triangles. Decoded VRAM 388.0 → **358.7 MB**.

**Asphalt:** service roads rendered as brown streaks that read as timber decking. I
suspected a materials regression; it was not — `AsphaltLoop` was byte-identical to HEAD. A
flat repeat (5,5) on a 7 × 90 m strip draws a tile 1.4 m across and **18 m along**, 13:1.
Now 1.6:1.

**Cameras:** `layout-angle` and `layout-topdown` were comparing a full reference frame
against a distant island. Re-framed to the real playfield; the map now fills both. Six new
stations added, including `center-loop` for `map__center-loop.png` — the most complete
single statement of what this map is meant to look like, which nothing was framing.

## Things I got wrong, and corrected

1. **I told you `assets-batch1` was multi-view sheets ready for Trellis 2.** It is not —
   156 baked PBR maps plus build scripts, i.e. our own output.
2. **My time-of-day and weather probes were invalid.** Both returned identical luma 0.1055
   for every setting; 0.1055 is the dark *menu* screen — I never entered the arena. The
   time-of-day conclusion survives only because a lane proved it from the code.
   **Weather remains unestablished.**
3. **A brief I wrote carried a stale number** — lawn stddev 0.21, from a capture predating
   the fix. The lane re-measured to 10.99–25.72 before acting.
4. **Three of five new stations framed badly** — placed against raw `cx/cz` while
   `centred()` multiplies by SPREAD 1.6. One failed the harness's variety gate at 3,942
   distinct colours. All 15 now clear it.
5. **The window-glass veil hypothesis was wrong.** 0.42 → 0.14 moved nothing (max 0.812 →
   0.805). Kept, because 42%-opaque glass is wrong anyway — but it falsifies the leading
   explanation for the interior gap.
6. **The batched-placeholder fix is real but small.** `mesh.visible = false` genuinely does
   nothing once the static batcher has merged that mesh, and every massing placeholder here
   was a batch candidate by construction. I expected that to be why the hero vehicles read
   as boxes. Measured across all 15 stations: only `side-lane-west` moved (3.32%);
   everything else under 0.35%. The white boxes are something else — the semi's trailer is
   legitimately white, and the rest are `aarr-island-crate-*` rendering untextured.

## Still open

1. **Time of day is hard-pinned and no matrix can sweep it.** Profile is `[10.5, 10.5]`,
   zero width, `pinned: true` — three separate locks, proven by 12 resolve calls.
   **Recommendation: keep it pinned**, recorded as your decision. `preview-pinned` is a
   shared convention (world-studio, nuketown2, raid2, map3), the row's arc anchor is wrong
   by 26°, and the model's 10° elevation floor structurally cannot reach dawn or dusk. The
   derived band is written down in `docs/ATOMIC_ACRES_REFERENCE.md` §9.
2. **Interior dynamic range is a scene-radiance defect, not a grade defect** — best
   reachable anywhere in the grade file's envelope still leaves interior p05 at 0.40
   against your plate's 0.14.
3. **The choke barricade** reads as flat coloured rectangles rather than crates.
4. **A dark patch reads through the upper-storey ceiling board** at the landing's high
   corner — the roof underside showing through. Not chased.
5. **Kitchen, bathroom and garage interiors got nothing** beyond dining chairs; the
   furnishing budget went to the two living rooms and the bedroom.
6. **Two placements in the new dressing are unverified by eye** and were flagged as such:
   the standard lamp sits ~39° off the interior-west axis and may fall outside frame, and
   the bedroom side tables assume `bed-double.glb` is ≤2 m and centred. Both are
   single-number fixes if wrong.
5. **Real specular highlights need lower roughness**, which below 0.22 crosses
   `REFLECTIVE_ROUGHNESS_CEILING` and admits new ray-traced proxies. Owner call.
6. **Light shafts are structurally inert** where an arena authors motes at the family
   opacity ceiling — the clamp binds before the multiply, so `shaftResponse: 0.55` is a
   dead number today. The presence floor has now created the headroom; this is the obvious
   next pass and costs no draw call.
7. **Three cutaway plates remain unpairable** — roof-off aerials, no cutaway camera.
8. **Trellis 2 was not used.** ComfyUI is not running and standing it up would have cost
   GPU time I needed for captures. Said plainly rather than quietly skipped.

## Not committed, deliberately

A full-suite run auto-rewrote `docs/evidence/pass95/killstreak-audio/inventory-baseline.json`
(148 lines, including float drift like `1.0000000000000009`). That is another pass's
recorded evidence and nothing here asked for it. Reverted.

## Standing commands

```bash
npm run qa:catalogue
npm run qa:compare-refs -- --captures artifacts/viewpoint-regression/<label>/atomic-acres-rebuild
npm run qa:glb-vram -- public/assets/rebuild --budget 500
node scripts/qa/capture-arena-viewpoints.mjs --url http://127.0.0.1:41922 \
  --arenas atomic-acres-rebuild --label <label> --settle-ms 40000 --samples 1
```
