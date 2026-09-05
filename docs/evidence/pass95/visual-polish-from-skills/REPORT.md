# PASS 95 visual-polish-from-skills lane (HF-509) - REPORT

Date: 2026-09-05. Branch `contrib/dave-gaming-pc/claude/v7-visual-polish-from-skills`
from candidate 7 (`452d7aba`, runtime bundle `legacy-main-CO_TtT3v.js`). Worktree
`C:/Users/david/projects/aa-v-visual-polish-from-skills`, browser port 4259, headless
installed Chrome, `PASS73_NATIVE_WEBGPU=1`, machine heavy-work lock taken and released
around every build, browser and full-suite step. Time box 120 minutes; this is what was
green when it ran out.

Claim states: `[VERIFIED]` I ran it and quote the output; `[MEASURED]` numbers from an
instrument I ran; `[OPEN]` not proven here.

## What the owner asked, and what the skill store actually says

`TECHNIQUE-MAP.md` (beside this file) reads every Three.js/WebGPU/TSL/material/lighting/
asset/VFX/post skill in the canonical store, the whole technique register and the repo's
r185 recipes, and maps 21 techniques onto the 12 authored Nuke Town stations with their
pipeline / cold / frame cost. `[VERIFIED]` by reading the source: most of the register's
methods are ALREADY in candidate 7 (three-scale albedo wear, tier -3 decal grime, 30
clustered practicals plus emissive ceiling fixtures, motes/seeds/shafts, three-layer
vegetation wind, baked-indirect + SSGI + SSR + godrays + aerial perspective, a searched
grade row). What was missing sat on the three surfaces register row 47 says carry a street
look first: the ROAD, the EDGES of every solid, and the WINDOWS of the facades.

## Implemented (three techniques, all inside the existing budgets)

| Technique | Where it lives | Skill / register row | Pipelines | Claim |
|---|---|---|---|---|
| Edge weathering: chips, arrises and splinters within 18-35 mm of every box-face edge, derived per fragment from screen-space derivatives (`edgeWear`, `src/nuketown2-materials/wear.ts`: metres-per-UV recovered from the 2x2 screen Jacobian), gated by the `edgeChip` uniform on kerb, block, garage door, appliance tops, sign and fence | concrete, painted-metal and timber shared graphs | photoreal-procedural-scene-forge ("wear in millimetres, at the corners"); register row 47 | 0 new `[VERIFIED]` (`nuketown2-visual-polish.test.ts` asserts kerb/drive, garageDoor/roofGlazing, fence/trim share the SAME colour node object; `nuketown2-pipeline-budget.test.ts` still <= 54) | implemented, rendered in the after captures |
| Wet asphalt and puddles: standing water in the kerb channel, wheel ruts and ~5 m relief hollows, hard water line, damp halo, roughness to 0.06 so the EXISTING env/SSR tier (`reflectNonMetals: true` at quality) reflects sky and sun; darkening capped at 0.62 of the dry value | shared asphalt graph, `asphaltWet` uniform, road and markings | open-world-city-art-loop (road first); interior-lighting-look (wet patches) | 0 new `[VERIFIED]` (asphalt/trimDecal share one node) | implemented, rendered |
| Lit windows: per-pane hashed warm emissive on the house panes, fading in 5 m -> 10 m so the interior side stays clear glass; peak 2.9 x 0.42 alpha = 1.22 linear, just over `MINIMUM_COMPOSED_BLOOM_THRESHOLD` 1.02 for a soft halo; no light object | `createNuketown2GlassMaterial`, `src/nuketown2-interior-materials.ts` | threejs-webgpu-interior-lighting-look; register row 48 | 0 new (one `emissiveNode` on an existing material) `[VERIFIED]` by the lane test | implemented, rendered |

Nothing gameplay-visible varies by profile; no collider, spawn, shot surface, light set,
art-direction row, fence, budget, threshold, timeout or ratchet was changed.
`src/legacy-main.ts` is untouched at exactly LINE_CEILING 37,396.

## Gates

`[VERIFIED]` `npx tsc --noEmit`: exit 0, no output.

`[VERIFIED]` `npx tsx scripts/qa/find-coplanar-pairs.ts` (`coplanar.txt`):
`HOUSE-INTERIOR pairs<=0.03m: 0 / STREET pairs<=0.03m: 0 / HF-497 SAME-MATERIAL-VISIBLE
FINDINGS: 0 / boxes=950 · pairs<=0.03m: 288 · FINDINGS (different materials, no offset): 0 ·
FENCED: 274 · CONTACT: 4 · SAME-MATERIAL (benign): 10` - identical to candidate 7.

`[VERIFIED]` focused vitest (`src/pipeline-metrics*.test.ts src/graphics-profile-contract.test.ts
src/rendering/cold-session-precompile-reach*.test.ts src/legacy-main-size-ratchet.test.ts
src/nuketown2-visual-polish.test.ts src/nuketown2-pipeline-budget.test.ts src/nuketown2-materials
src/nuketown2-fidelity.test.ts src/nuketown2-grime-decals.test.ts`): `Test Files 10 passed (10)
/ Tests 137 passed (137)`.

`[VERIFIED]` under the lock, `npm run build`: exit 0, bundle `legacy-main-DJeLE_NH.js`. The
base (`git checkout 452d7aba -- src`, then restored) built to `legacy-main-CO_TtT3v.js`, the
same hash candidate 7 reports, which is the proof the "before" is the candidate.

`[VERIFIED]` under the lock, full `npx vitest run` (`vitest-full.log`):
`Test Files 622 passed | 1 skipped (623) / Tests 6248 passed | 2 skipped (6250) / Duration 102.07s`
(candidate 7: 621 files / 6243 tests; +1 file, +5 tests are this lane's).

`[VERIFIED]` cold-admission smoke (`PASS73_NATIVE_WEBGPU=1 PASS65_COLD_ADMISSION_PORT=4259`,
3 trials requested, under the lock, `cold-admission.txt`): **FAILED on trial 1** with the
preserved fence: `WebGPU queue completion exceeded 12000 ms for submission 1 (completed 0,
mode serialized, in-flight 1, pending 12016 ms, probes 1, fenced draws 687)` and
`Nuke Town Rebuild did not become the playable arena`. The draw count under the fence (687)
is identical to the fence trip candidate 7 recorded on its own first stock-boot chain,
and candidate 7's isolated retry then passed; this lane had no time left to retry in
isolation or to run the same smoke on the base build in the same machine state, so
**whether this lane's graphs moved the first-submission compile is `[OPEN]`**, and the
"< 500 ms cold addition" requirement is `[OPEN]`, not met. No fence, budget or trial count
was changed. Two earlier attempts were refused by the script itself (port 4259 held by this
lane's own leftover preview server; then a dirty tree while the blind A/B was still writing
its verdicts) and are not evidence either way.

`[OPEN]` frame cost at QUALITY (`perf-hitl5-bisect-cdp.mjs` spawn/street rung): not run -
the lock was contended for most of the box (taken by other lanes at 07:07, 07:34, 07:36,
07:39, 07:51, 07:57) and the cold smoke took priority. Source-level estimate only: six
`dFdx/dFdy` and a 2x2 solve per fragment on three families, one extra LUT fetch on the
road, one hash on ~20 panes; expected well under 1.5 ms, NOT measured.

`[OPEN]` in-combat pipeline tripwire (`probe-pipeline-compile-stalls-cdp.mjs`): not run.
By construction the lane creates no material, light or graph at runtime (every term is a
uniform inside a graph that already existed at build time), but that is an argument, not
a probe reading.

## Captures and blind A/B

`[VERIFIED]` after captures: `capture-arena-viewpoints.mjs --url http://127.0.0.1:4259
--arenas nuketown2 --cameras <the 12 authored> --samples 1`, served `dist` on 4259 under
the lock: `verdict PASS, backend webgpu, adapterVendor nvidia, failed []`, 12/12 shots in
`after/`. The same run against `dist-vr-before` on the same port FAILED at 72 s with
`page.waitForFunction: Target page, context or browser has been closed` (0 shots), so the
"before" set used below is candidate 7's own committed capture of the identical runtime
bundle (`docs/evidence/pass94/candidate7/nuketown2/nuketown2/`, 3 samples). The existing
runner was used; the capture-harness warm-up fix (`capture-harness-warmup` lane) needs an
11-line `legacy-main.ts` hook that the ratchet forbids at 37,396 and was reverted in
candidate 7 (`ae795724`), so it was not applied. `[OPEN]`.

`[VERIFIED]` `node scripts/loop/blind-ab.mjs --critic omp-muse` (Muse Spark 1.3 through
OMP, liveness ok), A = candidate 7, B = this lane, references = the four candidate-6 frames
candidate 7 used, seed `candidate7-vs-visual-polish`, 12 stations requested. The run hit
this lane's 540 s wall clock after 11 stations (front-porch not judged); per-station
verdicts are in `blind-ab/<station>/verdict.json`:

| Station | Winner (unblinded) | Muse confidence |
|---|---|---|
| overhead | tie | 0.97 |
| north-yard | B (visual-polish) | 0.96 |
| south-yard | A (candidate 7) | 0.82 |
| street-centre | A (candidate 7) | 0.93 |
| north-upper-window | A (candidate 7) | 0.76 |
| south-upper-window | A (candidate 7) | 0.81 |
| into-sun-street | A (candidate 7) | 0.72 |
| north-interior | tie | 0.90 |
| south-interior | tie | 0.90 |
| garage | B (visual-polish) | 0.72 |
| north-balcony | invalid (probe not read) | - |
| front-porch | not judged (wall clock) | - |

| Candidate | Wins | Ties | Invalid | Win rate (decisive, n=7) | Win rate (ties as half, n=10) |
|---|---|---|---|---|---|
| A: candidate7 | 5 | 3 | 1 | 71% | 65% |
| B: visual-polish | 2 | 3 | 1 | 29% | 35% |

Read this honestly and read what it measures: the critic's question is "which is CLOSER
to these references", and the references are candidate-6 frames of the dry, unlit-window
road, so agreement with the old look is what wins here. The street-centre and into-sun
stations - exactly where the puddles and lit windows show - went to candidate 7 at
0.93/0.72. That is `[VERIFIED]` evidence that Muse finds the new road LESS like the
reference; it is not evidence about whether the owner would prefer it, and the lane did not
have time to run the intended second A/B against photographic references. The A/B table is
the instrument and it did not go this lane's way.

## Open items (in priority order)

1. `[OPEN]` Cold-admission smoke red on trial 1 at the preserved 12 s fence (687 fenced
   draws, same as candidate 7's known first-chain fence trip). Rerun in isolation and rerun
   the base build in the same machine state before any attribution; do not merge until the
   smoke is green on this SHA.
2. `[OPEN]` Frame-cost rung and pipeline tripwire not run (lock contention).
3. `[OPEN]` Blind A/B: candidate 7 5-2-3 over this lane against candidate-6 references;
   re-judge against photographic references (own photographs / permissive photography per
   register row 47) before deciding whether puddle coverage or window glow should be
   dialled down. Both are single uniforms (`asphaltWet`, `NUKETOWN2_WINDOW_GLOW_INTENSITY`).
4. `[OPEN]` Before capture on this port failed (browser closed at 72 s); candidate 7's
   committed capture of the identical bundle stands in for it.
5. `[OPEN]` Lit windows assume the arena's fixed golden hour; under the `late-morning`
   sky preset the glow would read as lights left on by day. A `LightingConditionWrites`
   hook for the glow uniform is the follow-up.
