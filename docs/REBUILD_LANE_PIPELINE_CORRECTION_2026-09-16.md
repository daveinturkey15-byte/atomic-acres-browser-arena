# Rebuild lane pipeline — what broke, and the corrected workflow

**2026-09-16, dave-gaming-pc.** Written after taking over the `atomic-acres-rebuild`
day-set from the previous harness. The owner's verdict on two to three days of lane
output was that it "doesn't feel like it's done much at all". That verdict is correct,
and the cause is the workflow, not the effort. This document records the specific
failures with evidence and states the corrected loop.

## What actually went wrong

### 1. The reference loop was never closed

`atomic-acres-catalog/_judge/refs/` holds 18 photoreal references that define the bar —
`living-room-eye.png`, `bedroom-eye.png`, the four cutaways, the street and road plates.
No step in the pipeline ever put a render next to one of them. Lanes were briefed in
prose ("wear kit", "worn crates", "value patch") and graded against their own briefs.

The result is a pipeline that optimised things nobody was looking at. A single crate was
given nine 1024x1024 baked maps — 11.19 MB for 580 triangles — while the interior ceiling
the player actually stares at was orange planks and the walls had no material at all.
Nothing in the process could have caught that, because nothing compared the frame to the
reference.

**Corrected:** `scripts/qa/compare-refs-vs-render.mjs` (new) composes reference-left /
render-right sheets for every pairing and writes them to `repo-state/`. Every ref is
mapped to a capture station. A lane is not done until its station's sheet is regenerated.

### 2. A scene-graph census was accepted as visual evidence

The midday entry recorded "21/21 worn crates resolved, 21/21 fallbacks hidden, zero page
errors" and treated the crates as integrated. That census proves the *graph*, not the
*frame*. The crates were simultaneously reported as reading gray in captures, and the
contradiction was parked as "needs an eyeball on a real-GPU browser" rather than resolved.

It was resolvable in minutes. A real-GPU capture (`--url` against the live preview,
installed Chrome headless, nvidia blackwell adapter confirmed) plus per-patch variance
measurement settles it mechanically:

```
patch                   mean   stddev   reading
lawn foreground        161.4     1.62   near-flat - texture barely present
lawn mid               163.0     0.21   FLAT - no texture detail at all
road/asphalt           163.9    19.27   textured
house wall teal        190.2    10.39   textured
fence panel            149.3    12.01   textured
```

and the bake itself is fine (`LawnPatchy_BAKE_DIFFUSE.png`, 1024x1024, stddev 14.98,
range 73-155). So the texture is good and simply is not reaching those surfaces: large
areas of the arena are still flat-colour `standard()` materials. That is a five-minute
diagnosis that went un-run for days.

**Corrected:** a census is never evidence. Pixels are. Any claim about how something
looks is backed by a real-GPU capture at a named station, and "flat" is decided by
measured local variance, not by eye — because a lighting wash and a missing texture look
identical in a thumbnail and have opposite fixes.

### 3. Verification claims outran what was actually true

Three claims in `FIXLOG.md` did not survive checking:

- The day-set and midday-set entries record the work as "integrated ... (pushed)". The
  lane assets were committed, but the registration layer underneath them — 30 modified
  files plus `atomic-acres-rebuild-authority.ts` (355 lines) and `-interiors.ts` (719
  lines) — was in **no commit on any branch**. Without it there is no arena at all.
- Gate failures were recorded as 2. There are 3, across 2 files.
- Captures were published as the state of the build while `play` served a different
  directory (`dist-compare/`) than the one being rebuilt (`dist/`). The midday entry
  caught this one itself, which is exactly why it must be a standing check.

**Corrected:** "integrated" has a fixed meaning (below). Nothing is logged as integrated
until every item in it has actually happened.

### 4. Lanes were given a budget on the wrong quantity

Lane briefs carried triangle budgets ("within +10% tris"). Triangles were never the
problem: the whole rebuild set is ~512k triangles, which is nothing. The unbudgeted
quantity was texture residency — 128.4 MB of download decoding to **1594.7 MB of VRAM**
across 272 textures, with 0 of 39 GLBs using any texture compression.

Download size does not reveal it: `vehicles/semi.glb` is 1.33 MB on disk and 138.7 MB in
VRAM. And the defect is in the *authoring recipe*, not the assets — the roof lane, running
while this was being written, emitted a fresh GLB at 1.98 MB / 3,184 triangles / **96 MB
VRAM**, replacing an 85.3 MB-VRAM house. A file-size review passes it; the budget that
matters fails it.

**Corrected:** `scripts/qa/measure-glb-vram.mjs` (new) reports file size, decoded VRAM,
triangles and compression presence, and exits 1 over `--budget`. Every lane that emits a
GLB reports VRAM before and after. Resolution targets are set per asset class up front
rather than defaulted to 1024 by the bake.

*Caveat, stated honestly:* the owner's GPU is an RTX 5080 with 16 GB, so 1.6 GB does not
by itself explain untextured props on **this** machine. The VRAM work is justified by
load time and by lower-end targets, not by a proven link to the gray-crate symptom. The
measured flat-material finding in section 2 is the better explanation of that symptom.

### 5. Catalogue and authored content silently diverged

`viewpoint-catalog.mjs` listed 8 stations for this arena; the arena authored 7. The
comment for station 7 survived, its `camera()` call did not. This left the upper storey
with **zero** camera coverage and `arena-viewpoint-regression.test.mjs` RED. A red test
that names a missing camera is the pipeline working; leaving it red for days is not.

**Corrected:** restored as `atomic-acres-rebuild-upper-landing`; that test is green
(23 pass, 0 fail). Red gates are fixed or explicitly owner-deferred in writing, never
carried silently.

## The corrected loop

Per lane, in order. A lane that skips a step is not done.

1. **Pair before briefing.** Name the reference image and the capture station the lane is
   judged against. A lane with no station is a lane nobody can grade.
2. **Measure the delta first.** Capture the station on a real GPU, compose the
   side-by-side, and state the gap in measured terms (variance, palette, value step).
   The brief is the delta, not a wish.
3. **Work in the lane directory only.** Strict single-file-owner discipline when lanes run
   concurrently; base-pin touched files with `git hash-object`.
4. **Budget both quantities.** Triangles *and* decoded VRAM, reported before and after.
5. **Re-capture and re-compose.** Same station, real GPU, fresh sheet into `repo-state/`.
6. **Gate honestly.** `npx tsc --noEmit`, the arena's own tests, and
   `verify-public-asset-provenance.mjs`. Never weaken a verifier to get green. Pre-existing
   failures are named and left, not absorbed.

### "Integrated" means all of this, or it is not written down

- `npx tsc --noEmit` exit 0.
- The arena's own tests green; any failure named, attributed and shown to pre-date the work.
- **Both** `dist/` and `dist-compare/` rebuilt (play serves the latter).
- A staged asset URL curl-checked for a real byte count — and the *filename* checked, because
  a wrong path also returns `200` with a 1206-byte SPA fallback.
- A real-GPU capture at the affected station, with the adapter vendor recorded. A capture on
  a software rasteriser is invalidated, never written as a baseline.
- The side-by-side sheet regenerated into `repo-state/`.
- Committed. Work that exists only in a working tree is not integrated, whatever the log says.

## Standing commands

```bash
npm run qa:glb-vram -- public/assets/rebuild --budget <MB>
npm run qa:compare-refs -- --captures artifacts/viewpoint-regression/<label>/atomic-acres-rebuild
node scripts/qa/capture-arena-viewpoints.mjs --url http://127.0.0.1:41922 \
  --arenas atomic-acres-rebuild --label <label> --settle-ms 45000 --samples 1
```
