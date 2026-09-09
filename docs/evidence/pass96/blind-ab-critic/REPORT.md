# PASS 96 - blind A/B critic harness, the real 4b-vs-5 win-rate, and the TAA/CSM decision

Worktree `C:/Users/david/projects/aa-claude-critic`, branch
`contrib/dave-gaming-pc/claude/blind-ab-critic`, base
`origin/contrib/dave-gaming-pc/claude/pass93-candidate` at `465ae6b7`.
Lane: Claude Fable 5.1 (high), 2026-09-04, 100-minute box. Ledger HF-486
(blind A/B critic the store lacks; 9 of 11 look techniques run), HF-503
(owner: nice graphics, use the techniques, a really nice experience),
HF-472 (re-implement, never copy), HF-481 (three.js source priority: upstream
r185 source read first for TRAA and CSM).

Impact: **process-only** (scripts/loop, docs). No runtime file changed. The
in-combat pipeline tripwire stays 0 and every threshold stays because nothing
in `src/` moved.

Claim-states: **VERIFIED** = an instrument in this worktree produced the
number and it is quoted; **OBSERVED** = I read the file or capture;
**INFERRED** = arithmetic or judgement over verified numbers; **OPEN** = not
settled, falsifier stated.

---

## 1. Half 1 - the harness (`scripts/loop/blind-ab.mjs`)

How-to: `docs/loop/BLIND-AB.md`. Contract `blind-ab-v1`.

- Two capture directories of the same station list go in; per station the
  side is chosen by `sha256(blind-ab-v1|seed|station)` parity (derived, no
  argument can choose a side), both frames are re-encoded to bare PNGs as
  `left.png`/`right.png` in a fresh directory that is also the critic
  route's isolated cwd, a different probe token is stamped into each frame,
  the references go in as `reference-N`, and the critic is asked which is
  closer to the reference set and why. Unblinding happens after parse and
  validation. **VERIFIED** by `node --test scripts/loop/blind-ab.test.mjs`:
  14 tests, 14 pass (randomisation determinism and balance, unblinding,
  probe refusal on either side, schema refusal, aggregation and claim-state,
  Wilson edges, instruction leak check, metadata strip with a planted EXIF
  string, station intersection, a fixture-critic dry run end to end
  including one refused round, offline re-validation, admitted-critic and
  no-reference refusals).
- Reuses, unchanged, from `origin/contrib/dave-gaming-pc/claude/reference-loop-runner`
  (`32b0b057`): `probe.mjs` (15-glyph alphabet, token derivation),
  `image.mjs` (sharp stamp), `critic-schema.mjs` (`extractJson`),
  `adapters/{index,omp-muse,omp-gemini,fixture}.mjs` and their two tests.
  Those files are brought into this branch byte-identical so the two
  branches merge without conflict.
- Admitted critics: `omp-muse`, `omp-gemini`, `fixture`. `qwen-local` is
  refused in code (loop README: it cannot read a probe inside a critic task).
- Optional capture step: `--capture-a-url/--capture-b-url --arena` runs
  `scripts/qa/capture-arena-viewpoints.mjs` for each side **sequentially**
  (one installed-Chrome headless browser at a time, the authored review
  cameras, `--cameras` subset). Present, **not exercised against two live
  builds this session** (see 2.1).
- Receipt per run: `results.json` (side assignment, both probes expected and
  answered, source and shown sha256 per side, reference sha256s, route,
  model, elapsed), `WIN-RATE.md`, and per station `instruction.txt`,
  `critic-raw.txt`, `verdict.json`, `blind/left.png`, `blind/right.png`
  exactly as shown.

### 1.1 A harness defect found by the first real run (VERIFIED)

The first real Muse round read both probes correctly, named the decisive
region, and wrote `confidence: 78`. The first validator required 0..1 and
refused the round as `schema-invalid` - it would have discarded a
receipted vote over a unit. Fixed in code (`normaliseConfidence`: a value
above 1 and up to 100 is a percentage; `1` is certainty, never 1%; covered
by a test) and in the prompt (the example now says "a fraction, e.g. 0.78 -
not a percentage"). Because the six raw verdicts were stored, the run was
**re-validated offline** (`--revalidate <dir>`, no critic called again; the
original verdicts are kept as `verdict.original.json` and the original
aggregate as `originalAggregate` in `results.json`). This is a parser fix,
not a re-roll: the critic's words are unchanged.

## 2. The real A/B: candidate 4b versus candidate 5, Muse Spark 1.3, blind

### 2.1 What was compared, and why from disk

- A = **candidate4b** captures
  `C:/Users/david/projects/aa-claude-hitl/docs/evidence/pass94/candidate4b/captures/nuketown2`
  (26 stations, `arena-viewpoint-regression-capture-v1`, webgpu, nvidia
  blackwell, 1280x720, seed `viewpoint`, settle 5000 ms). **OBSERVED.**
- B = **candidate5** captures
  `C:/Users/david/projects/aa-claude-hitl/docs/evidence/pass94/candidate5/nuketown2`
  (6-station subset, same instrument, sha `4bb245a1`, served from
  `127.0.0.1:4189` at capture time). **OBSERVED.**
- Stations = the intersection, **6**: appliance-bank-south-close, garage,
  north-yard, overhead, street-centre, vehicle-near.
- References attached (4, BO2-2025 first-party, the same set the Gemini
  reference critics used): `nt2025-street-boii.jpg`, `nt2025-aerial-boii.jpg`,
  `nt2025-sniper-boii.jpg`, `nt2025-hero-boii.png`. Their sha256s are in
  `results.json`; the copies shown to the critic were deleted from the
  evidence tree before commit because they are T1 commercial artefacts
  ("reference only, not shipped"). The tier note - T1 may anchor a ranking,
  never a target - is in `docs/loop/BLIND-AB.md`.
- **Why not two fresh captures:** candidate 5 is the owner's served dist on
  `:4300` (aa-claude-hitl), which this lane must not touch; candidate 4b's
  dist is not served anywhere; building both in this worktree and running
  two capture sessions would have been ~8 minutes of a GPU the owner is
  sharing with ComfyUI and several lanes, for frames the same instrument
  had already produced at the same stations, seed and viewport. The
  on-disk captures ARE the instrument's output; the harness's own capture
  step exists for the next run.

### 2.2 The win-rate table (VERIFIED - `run-muse-4b-vs-5/WIN-RATE.md`)

Critic `omp-muse` (`meta-contributor/muse-spark-1.3`), seed `pass96-4b-vs-5`,
liveness ok, **12 of 12 probes read correctly**, 6 of 6 rounds valid after
re-validation (0 of 6 before it - the unit defect above). Wall time 7 min 36 s
for six sequential calls (54-161 s each).

| Candidate | Wins | Ties | Invalid | Win rate (decisive, n=5) | Win rate (ties as half, n=6) | 95% Wilson (decisive) |
|---|---:|---:|---:|---:|---:|---|
| A: candidate4b | 1 | 1 | 0 | 20% | 25% | 3.6% - 62.5% |
| B: candidate5 | 4 | 1 | 0 | **80%** | 75% | 37.6% - 96.4% |

Claim-state: **VERIFIED** (5 decisive votes, exactly the floor). The
interval **includes 50%**, so five votes do not statistically separate the
two builds; the direction is consistent and every vote is receipted.
Mean critic confidence 0.75.

| Station | Left | Right | Critic | Winner | Conf. | Probes L/R | Elapsed |
|---|---|---|---|---|---:|---|---:|
| appliance-bank-south-close | B | A | left | **5** | 0.78 | AAYN ok / ATHC ok | 56 s |
| garage | B | A | left | **5** | 0.85 | NRNT ok / DYEY ok | 63 s |
| north-yard | B | A | right | **4b** | 0.62 | TMNM ok / KKEC ok | 161 s |
| overhead | A | B | right | **5** | 0.62 | EJXE ok / HXHE ok | 67 s |
| street-centre | B | A | left | **5** | 0.70 | MKTA ok / RRMM ok | 55 s |
| vehicle-near | A | B | tie | tie | 0.95 | AXWM ok / HWHW ok | 54 s |

Candidate 5 sat on the LEFT in 4 of 6 stations and on the RIGHT in 2; it
won from both sides (overhead from the right), and the one 4b win came
from the right. No side effect is visible in five votes (INFERRED; a
position-swap pass is the OPEN item that would prove it).

### 2.3 What the critic said, blind (OBSERVED from `critic-raw.txt`)

- **appliance-bank-south-close -> 5.** 4b shows "an isolated bright-red
  tower with white cap in r1c2 extending into r2c2, which has no counterpart
  in the reference set's yards"; 5 "preserves the open grass foreground".
  (That is the HITL-4 clutter item the layout lane deleted - the critic
  found it without being told.)
- **garage -> 5.** Geometry identical; "LEFT's off-white horizontal siding
  matches the pale house siding in the references, while RIGHT's saturated
  pure-red full walls introduce a wall material class not shown in any
  reference" - the interior wall albedo, r1c0/r1c2.
- **north-yard -> 4b.** "RIGHT preserves a directional-sun read with house
  shadow over the west patio/lawn in r1c0-r2c0 ... while LEFT washes the
  shadow away to flat" - candidate 5's north yard is flatter-lit than 4b's.
  A real regression signal for the lighting lane, region-bounded.
- **overhead -> 5.** 4b "crushes the southern roof and the western
  outbuilding roof to near-black"; 5 reads them as "textured mid-gray
  shingle/metal like the reference roofs" and holds the sand-to-lawn
  separation.
- **street-centre -> 5.** 5 keeps "pale sky, light atmospheric mountains,
  asphalt detail and the lane line, matte beige bus rear without blowout";
  4b "crushes the road to pure black and blows the bus roof out to white".
- **vehicle-near -> tie (0.95).** "Geometrically identical and equidistant
  from the reference set"; both disagree equally with the references' varied
  vehicle colours and bright high-sun asphalt. Largest difference named
  anyway: road value near-black on one side.

**INFERRED, for the lanes:** the direction agrees with the Gemini reference
critic (`candidate5-REVIEW.md`), but this is the first receipt that says so
without the critic knowing which build was which. The two recurring gaps
the blind critic named against BOTH builds - road/asphalt crushed to black,
vehicles all off-white - are the same "~0% albedo variation" finding in
HF-486 and belong to the materials lane, not to a post-processing stack.

## 3. Half 2 - TAA and CSM: decision with numbers

Full write-up with every source line, the texel arithmetic, the cost table,
the exact wiring plan and the falsifiers: **`TAA-CSM-DECISION.md`** beside
this file. The decision:

| Technique | Decision | The numbers that decide it | Claim-state |
|---|---|---|---|
| **TAA** | **ADOPT as a QUALITY/MAX opt-in, next lane** (registry control, `pipeline-rebuild`, default OFF on every preset). Not prototyped in this box: a new control rotates the pinned control-set hashes in `graphics-profile-contract.test.ts`, which must be re-measured, not re-pinned; and an unwired module is the "zero runtime callers" defect AGENTS.md records. | Inputs exist: colour, depth, and the `velocity` MRT attachment `screenSpaceMrtRequirement` already allocates when motion blur is on (MAX today; QUALITY would add RG16F, 14.7 MB/frame at 1440p). Upstream r185 `TRAANode`: one `NodeMaterial` resolve, two RGBA16F targets, one copy per frame - **one new pipeline, compiled at admission**. Arithmetic bound: 3.7 Mpx resolve + 29.5 MB copy at 1440p, under 1 ms median on this GPU (the measured BALANCED->QUALITY step, which adds MSAA-4x + AO high + light trace, is +0.5 ms median). Upstream requires MSAA OFF, so on QUALITY/MAX it REMOVES the 4x principal target (~177 MB/frame at 1440p): net plausibly neutral or negative. What it buys: GTAO and SSGI `useTemporalFiltering` are both OFF in source "because this chain does not run a TRAA resolve" - TAA is the prerequisite for the temporal AO/GI look, plus shading-alias stability SMAA/MSAA cannot give, plus the `TAAUNode` upscaling route. | VERIFIED (source lines), INFERRED (ms bound), OPEN (measured ms + shimmer: procedure in the decision doc, falsifier +1.0 ms median) |
| **CSM** | **DECLINE for the current arenas; re-open for map3 or any arena over ~60 m of sunlit depth.** A 4096 sun map on MAX is the cheaper alternative (OPEN). | The sun shadow is one 2048 map but already **fitted per arena**: Nuke Town's volume is 44 x 92 m = **2.1 / 4.5 cm per texel**; map3 is 176 x 176 m = 8.6 cm. A two-cascade practical split (break ~16 m at maxFar 60) gives ~1.4 cm inside 16 m and ~4.4 cm beyond - the whole gain is within 16 m of the player and only 1.5x across Nuke Town's street. The price is structural: cascades follow the camera, so QUALITY's `shadowUpdateMode 'static'` (zero caster passes per settled frame) becomes **two caster passes every frame**; `CSMShadowNode` never allocates `light.shadow.map` on the parent sun, so the godrays raymarch hits the HF-401 swallowed null dereference and composites a default material unless re-pointed at cascade 0; map pixels double or cascades shrink to 1448^2 to hold the per-arena budget. | VERIFIED (source lines, upstream structure), INFERRED (texel arithmetic) |

Tripwire and thresholds: unchanged by construction - no `src/` change in
this branch.

## 4. Gates (VERIFIED, this worktree, this session)

- `npx tsc --noEmit` - exit 0, no output.
- `npx vitest run src/rendering/screen-space-post src/graphics-profile-contract.test.ts src/rendering/cold-session-precompile-reach src/pipeline-metrics src/legacy-main-size-ratchet.test.ts`
  - 6 files, 57 tests, 57 passed, exit 0. (The brief's globs
  `src/cold-session-precompile-reach*.test.ts` and `src/pipeline-metrics*.test.ts`
  resolve to `src/rendering/cold-session-precompile-reach.test.ts` and
  `src/pipeline-metrics.test.ts` in this tree; both ran.)
- `node --test scripts/loop/blind-ab.test.mjs` - 14 tests, 14 pass.
- Real run: `run-muse-4b-vs-5/results.json`, 6/6 valid after re-validation.
- Power plan at bootstrap: `8c5e7fda-...` High performance (VERIFIED,
  `powercfg /getactivescheme`).

## 5. Open items

1. **Position-swap pass** (show every pair both ways, count consistent
   votes) and a second critic (`omp-gemini`) on the same six stations, to
   turn "80%, interval includes 50%" into a separating number. Cost ~15 min
   of Muse/Gemini wall time, no GPU.
2. **Capture step against two live builds** through the harness's own
   `--capture-*-url` path - the next candidate pair, on port 4214, one
   browser at a time.
3. **north-yard lighting**: the blind critic preferred 4b's directional
   shadow read over 5's flatter yard (r1c0-r2c0). Region-bounded; for the
   lighting lane to confirm on the live build before HITL 6.
4. **TAA wiring and measurement** per `TAA-CSM-DECISION.md` section 2.5;
   **4096 sun map on MAX** as the CSM alternative (section 4).
5. The `reference-loop-runner` branch and this one carry byte-identical
   copies of nine `scripts/loop/` files; whichever lands second merges
   clean, but `docs/loop/README.md` (on that branch) should gain one line
   pointing at `BLIND-AB.md`.
