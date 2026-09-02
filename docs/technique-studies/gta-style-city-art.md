# HF-419 technique study — "GTA art" (open-world city art)

**Lane:** AK-study (Claude Code, Opus 5.1, `dave-gaming-pc`), PASS 86/87 overnight sweep
2026-09-02. **Owner row:** HF-419 in `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`.
**Source state:** RESOLVED (public, no login, two independent routes).
**Register row:** 47. **Skill:** `game-development/open-world-city-art-loop` v1.0.0.

---

## 1. The source, pinned

| Field | Value |
| --- | --- |
| URL | <https://x.com/mattshumer_/status/2095187868746383758> |
| Author | Matt Shumer (@mattshumer_), id 1194889317388374016, verified |
| Date | 2 Sep 2026, 16:31:29 UTC |
| Kind | note-tweet, 266 characters, plus **one 31.19 s video** |
| Media | 3024x1474 @ 10.37 Mbps master; 1476x720, 738x360, 552x270; one m3u8 |
| Engagement at read time | 103,757 views, 1,254 likes, 171 replies, 24 quotes |
| Links inside the post | **none** — the only entity is its own video |
| Resolution route | `api.fxtwitter.com/mattshumer_/status/…` HTTP 200 (full text, author, media list), then `cdn.syndication.twimg.com/tweet-result?id=…` HTTP 200 as an independent confirmation |
| Login used | none. No search substitute was used for the thread's content. |

**What the text says**, in substance: it is an early preview of a GTA-style open-world
multiplayer game set in NYC, built by spending the author's Fable 5.1 tokens; the agent
will keep iterating; others will be able to play it later.

**What the text does not contain:** a prompt, a repository, a tool list, an engine name, a
renderer name, an asset pipeline, a licence, or any link at all.

### Linked material followed

The post links nothing, so the author's own public writing was followed instead, via his
profile link:

- <https://somethingbig.ai/gauntlet-loop> — "How to Run a Gauntlet Loop", 27 Jul 2026, HTTP
  200, free to read behind a dismissible newsletter interstitial. This is the **method**
  article, and it is already technique-register row 13. It predates this post by five weeks
  and contains nothing specific to city art.
- <https://github.com/mshumer/Claude-of-Duty> and its `prompt.md` — the method's canonical
  worked example, already register row 34, MIT, pinned at
  `d9b237b75c9304ab8d9ef4cfa0c3568c7c11a853`.
- <https://somethingbig.ai/> — index; confirms the article set and that the newsletter is free.

## 2. Licences and what is paid vs public

| Artefact | Licence | Paid or public |
| --- | --- | --- |
| The post text | copyrighted (X post) | public, free |
| The 31 s video | copyrighted | public, free; fetched to a session scratchpad for observation only, **not committed, not redistributed** |
| `somethingbig.ai/gauntlet-loop` prose | copyrighted marketing | public, free (newsletter interstitial, dismissible) |
| `mshumer/Claude-of-Duty` | **MIT** (row 34, LICENSE read 2026-08-30) | public, free |
| The NYC city build itself | **UNKNOWN — unpublished** | not available at any price |

No paywall was crossed, no API was paid for, no login was used, and nothing was copied
from any of them. Everything in §3 below is this machine's own observation.

## 3. What it observably is

Frames were extracted locally with ffmpeg at 3 s intervals from the 1476x720 variant, and
targeted HUD crops were taken from the 3024x1474 master (the telemetry line is illegible at
720p, which is why the master was fetched).

**Presentation.** Browser-rendered third-person driving through a Manhattan-shaped grid.
HUD: a street-name / neighbourhood ribbon (WEST END AVENUE, WEST 81ST STREET, RIVERSIDE
DRIVE, HENRY HUDSON PARKWAY — all "UPPER WEST SIDE (CENTRAL)"), a road-graph minimap, an
MPH readout, a score, an ADMIN nameplate above the player vehicle, and a "1 in the city"
player counter. It is multiplayer, and at capture time it had one player in it.

**Art content, ordered by screen area at the demo's own camera** — this ordering is the
transferable finding:

1. **Road surface** (30–50% of frame): aggregate speckle, cold-patch repairs with visible
   edges, longitudinal tar seams, crack networks, utility plates, kerb-side staining, and
   lane paint that is worn, dirty and slightly misaligned.
2. **Pavement and kerb**: paving-slab joint grid with slab-to-slab tonal variance, split
   kerb top/face, tree pits, a darker damp band where pavement meets building.
3. **Facade bays**: window openings with real recesses, sills, lintels, spandrels, a
   distinct ground floor, string courses, and a parapet/cornice terminal. This is a shape
   grammar, not a texture.
4. **Street furniture density**: mast-arm traffic signals, street-name blades, lamp
   standards, hydrants, bins. Density is doing the work, not individual fidelity.
5. **Street trees** with visible trunk-to-branch structure and translucent canopies.
6. **Traffic**: parked vehicles flush to the kerb plus moving traffic; low-poly silhouettes,
   dark glass, emissive tail lamps, contact darkening under the sills.
7. **Wayfinding text**: the street-name ribbon and minimap carry a disproportionate share of
   the "this is a real city" impression for almost no cost.

**Lighting.** Overcast and ambient-dominant: near-white sky, no hard sun, almost no cast
shadows, low saturation.

**Completeness note.** Pedestrian figures are present on the pavements in the reference.
They are omitted from the ordering above because that ordering is by screen area and they
occupy a negligible share of it, and they are out of scope for the street-cell
decomposition — not because the reference lacks them.

### The measurement that matters

The demo's own telemetry line, under the street name, reads:

| Timestamp | Reading |
| --- | --- |
| t = 4.5 s | `151 ms · 20 fps` |
| t = 24 s | `197 ms · 18 fps` |

**The reference look runs at 18–20 fps in the author's own capture.** (The millisecond value
is not the reciprocal of the fps value, so it is probably a network RTT or a rolling worst
frame time rather than the mean frame time — the interpretation is OPEN; the fps figure is
unambiguous.) This is a screenshot-grade target. Matching its density and surface detail at
a 60 fps gameplay bar is a different and harder problem, and any brief that omits this will
produce a loop that buys detail with frame rate.

## 4. Method — and the honest finding

**HF-419 is not a new technique.** The method the demo used is the **gauntlet loop**, which
this project registered five weeks ago as rows 13 and 34 and carries in the
`visual-gauntlet-loop` skill: a lead agent gets a goal and a concrete bar; it splits the goal
into the smallest independently judgeable pieces; each piece gets a builder and a *separate*
critic with fresh context; the critic inspects the real artifact (not a summary), compares it
blind against the bar, names the single biggest remaining gap; repeat with no fixed round
count; a live progress page for the human; an optional end-of-wave smoothing pass.

The post's contribution is **a bar, not a pipeline** — evidence that the loop scales from an
FPS to open-world environment and vehicle art. Anyone reporting that "the thread shows the
GTA art pipeline" has not read the thread.

What is genuinely new, and what the new skill owns, is everything the loop does not say:

- **The street cell** as the unit of decomposition: one road segment between two
  cross-streets, both kerbs, both frontages, its furniture, trees, vehicles and signage.
  "Buildings / roads / props" produces pieces no critic can judge as a whole. Intersections
  are their own cell type and are always the hardest.
- **The screen-area ordering** in §3, which tells the lead agent where to spend the loop.
  The intuitive order — hero buildings first — spends it on the least visible surface.
- **Two traps.** (a) The overcast ambient-dominant grade is cheap, hides weak procedural
  materials because there is no crisp specular to get wrong, and is the exact opposite of
  the owner's standing dynamic / coloured / time-of-day / weather lighting direction. Adopt
  the surface detail and furniture density; **do not adopt the grade**, or the critic will
  quietly delete our lighting art direction while winning every A/B. (b) Winning the
  still-frame A/B at 18 fps — bind the critic to the telemetry line, not just the pixels.
- **The originality boundary.** A shipped commercial game's screenshot is not a bar we may
  hold, record, commit, or hand to an automated critic that will then be told to close the
  gap to it. The substitute is named: our own photographs, permissive or public-domain
  photography, or our own earlier build — with the licence recorded in the register before
  the loop starts. Real-world street photography is the better bar anyway; it is legal, it
  is inspectable, and it produces a more original result.

## 5. Transfer to this stack

`three` 0.185.1, WebGPURenderer, NodeMaterial + TSL only; no `ShaderMaterial`,
`RawShaderMaterial` or `onBeforeCompile`; no imported mesh, image, font or LUT; every
surface in §3 is a node graph (fBM for aggregate and staining, distance-to-line fields for
lane paint and joint grids, seeded scatter for cracks and patches).

Hard constraints the loop must not be allowed to negotiate away:

- **0 in-combat pipeline creations** — `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs`.
  A city art pass is the most likely thing in this repo to ship a stutter, because each new
  visual idea wants a new NodeMaterial. Parameterise one graph with uniforms instead.
- **The cold-compile admission fence is never widened** to admit a new material family.
- **`ART_DIRECTION_SAFETY_BOUNDS`** (`src/rendering/art-direction.ts`, fail-closed at module
  init): gain 0.82–1.18, gamma 0.92–1.10, lift 0–0.006, saturationScale 0.85–1.30,
  contrastScale 0.95–1.14, atmosphereDensity 0.60–1.35. A look that needs a value outside
  the bounds is a rejected look, not a bounds change.
- **Determinism**: `mulberry32(ownSeed)` per system, never `Math.random`, never consume a
  shared module-level RNG after another system — it moves every existing placement and the
  before/after captures stop being comparable.
- **Headless only**, via `scripts/qa/capture-map3-views.mjs`, which launches
  `headless: true` unconditionally (line 113) and refuses to start below 3000 MiB of free
  VRAM on this shared machine (lines 98–103), and which already logs a HUD telemetry line
  per view into `hud.json` — so an fps claim has a file behind it. A capture with no
  telemetry behind it is not evidence. `PASS73_NATIVE_WEBGPU=1` is **not** read by this
  harness or by the pipeline tripwire — `grep -rl PASS73_NATIVE_WEBGPU scripts/ src/`
  returns only the `run-pass73-*` native gates and one test — so setting it for a Map 3
  capture is inert.
- **Parity audits** are part of the pass, not a follow-up:
  `scripts/qa/audit-collider-visual-parity.ts` and
  `scripts/qa/audit-walkable-surface-parity.ts`. Kerb heights, tree pits and parked vehicles
  are the classic sources of new invisible walls and transposed colliders.

Per-street-cell authoring targets (the binding gate is the arena's existing budget, and it
is never loosened to pass): ≤ 12 added draw calls, ≤ 60k triangles for a residential cell
and ≤ 120k for an avenue cell, ≤ 4 NodeMaterial pipelines per cell **type** and 0 per cell
instance, 0 per-frame allocations, and fBM stepped from ≤ 3 octaves down to 1 beyond ~40 m.

## 6. Where it lands in the repo

Map 3 is a hub with eight themed corridors. **Corridor 3 ("grammar")** already implements a
shape grammar with fixed stages and swappable rule sets — `src/map3/corridors.ts` documents
it at line 12 as "a shape-grammar tower, rebuilt from a seed as you walk past", with a
footprint → mass → podium/shaft/crown → facade pipeline. The correct move is to add a
**street-scale rule set** to that grammar, not to build a second generator beside it.

That is what the HF-419 Map 3 experiment does. Its plan is in
`gta-style-city-art-report.md` beside this file.

## 7. Claim states

| Claim | State | Evidence |
| --- | --- | --- |
| Source resolved without login | VERIFIED | fxtwitter + syndication both HTTP 200 |
| The post publishes no prompt/repo/pipeline | VERIFIED | post JSON has zero link entities; article read in full |
| The method is the already-registered gauntlet loop | VERIFIED | article read; register rows 13 and 34 |
| Reference runs at 18–20 fps | VERIFIED | HUD crops from the 3024x1474 master at t=4.5 s and t=24 s |
| The `ms` figure is RTT rather than frame time | OPEN | 151 ms is not 1/20 s; not stated on screen |
| Art-content ordering by screen area | VERIFIED (observation) | frames extracted and inspected locally |
| Overcast grade is partly a cost/quality dodge | CLAIMED | reasoned from the frames; not measured |
| Per-cell budgets in §5 | CLAIMED | authoring targets, not measurements |
| The technique transfers to our TSL stack at 60 fps | OPEN | the Map 3 experiment exists to answer this |
