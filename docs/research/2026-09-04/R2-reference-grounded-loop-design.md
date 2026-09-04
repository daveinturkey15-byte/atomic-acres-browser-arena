# R2 — a code-native equivalent of the GPT-6 "Astra" loop

**Lane:** R2 (research only). **Author:** Opus research agent, 2026-09-04.
**Ledger:** HF-462, HF-462-correction, HF-468. **Owner bar:** "Blender + Astra
did this" quality, built in code — procedural, physically based, penetrable
materials, whole beautiful scenes; ideally our own light WebGPU-native tool;
Blender optional later on a test map.

**Claim-state key.** `VERIFIED` = I read the file or ran the command in this
session and quote what it said. `CLAIMED` = a source (an X post, a memory note,
another agent's report) says it and I did not independently confirm it. `OPEN` =
unknown, and named as unknown rather than filled in.

Nothing in this document copies text, geometry, textures or trade dress from any
external source. Where an external artefact is described, it is described in this
lane's own words.

---

## 1. What Astra's loop is, and the exact two pieces we are missing

**CLAIMED (owner-read X posts, ledger HF-468, 2026-09-04):** GPT-6 Astra works
inside Blender autonomously — it gathers reference photos, builds the scene,
renders test frames, compares those frames against the references, fixes what is
off, and exports a walkable UE5 level. Manhattan was built street by street over
a week; the Palace of Fine Arts was rebuilt from hundreds of photos by
render-and-compare; a house was built from a design drawing; a greybox became
three playable prototypes.

**CLAIMED (same posts):** nothing was published about how the loop is
implemented — no prompt, no repo, no tool list. This is the same trap the
`open-world-city-art-loop` skill already records for the city video
(**VERIFIED**, skill §1: *"Anyone who tells you 'the thread shows the method' has
not read the thread"*). Treat the Astra threads as a **bar and a shape**, never
as a pipeline.

Stripped of Blender, the shape is a loop we already run — with two additions:

| Loop stage | Do we have it? | Evidence |
|---|---|---|
| Decompose the subject into judgeable pieces | **Yes** | `open-world-city-art-loop` §5 street cell (VERIFIED); `src/map3/street-cell.ts` (VERIFIED) |
| Build in code, deterministic, TSL-only | **Yes** | `webgpu-tsl-arena-forging`, `atomic-acres-procedural-art-authoring` (VERIFIED) |
| Render test frames from a fixed judgeset | **Yes** | `scripts/qa/capture-arena-viewpoints.mjs` + `scripts/qa/viewpoint-catalog.mjs` (VERIFIED) |
| **Gather references and hold them as the target** | **No** | see §3 |
| **Compare the render AGAINST the reference** | **No** | see §2, §4 |
| Fix the largest gap, one bounded correction | **Yes** | `visual-gauntlet-loop` loop contract (VERIFIED) |
| Journal / resumable controller | **Barely** | see §5 |
| Export a walkable level | **N/A** | our render target *is* the walkable level |

Everything else already exists and is better instrumented than a Blender loop
could be, because our renders come out of the shipping runtime rather than an
offline renderer. The whole of this design is therefore about the two missing
rows plus a controller that can survive eight hours unattended.

---

## 2. What the overnight loop actually did — read, not assumed

**VERIFIED.** `docs/pass84-lanes/LANE-BA-nuketown-tiptop-overnight.md` specifies
"three fresh-context Gemini critics scoring headless captures on a 100-point
rubric (layout fidelity 25, material and texture quality 25, lighting and
atmosphere 20, dressing density and reading distances 15, technical hygiene 15;
gates >= 85% each), GLM repairs, three cycles or a plateau".

**VERIFIED.** The critic files under
`C:\Users\david\projects\aa-claude-nuketown6\docs\evidence\pass93\nuketown2-tiptop\cycle-*\critic-*.md`
(18 files, 2,869 lines total) each end in a rubric table. Cycle 1 critic A scored
**77/100, FAIL, 4 of 5 rows under threshold**. Cycle 6 critic A scored **97.0/100,
PASS, every row 96–99 %**.

**VERIFIED — and this is the finding this lane exists for:** not one line of any
critic file names a reference. The critics scored a **rubric held in their own
heads**. Their scale is anchored to nothing external, which is exactly why it
moved 77 → 97 in six cycles while the fix hints stayed at the level of "add
subtle beveling, hinge/handle dark accents, and procedural grime to wheelie bin
lids". A rubric-only critic converges on *the absence of things it can name*, and
once it can no longer name a missing thing, it awards 97.

**VERIFIED.** The judgeset itself is good and reusable:
`cycle-final/captures/manifest.json` declares contract
`nuketown2-judgeset-manifest-v1` with 10 cameras, each `{id, position, lookAt,
file, purpose}` — e.g. `nuketown2-north-upper-window` at `[-1.25, 4.5, -12.6]`
looking at `[4, 2.6, 10]`, purpose `light-occlusion`. The paired
`capture-manifest.json` is contract `arena-viewpoint-regression-capture-v1`,
verdict `PASS`, sha `263887b6…`, backend `webgpu`, adapter
`{vendor: nvidia, architecture: blackwell}`. So the captures carry a real
hardware receipt already.

**VERIFIED.** The controller's entire persistent state was two text files:
`artifacts/ba-critic.txt` containing the single character `C`, and
`artifacts/ba-cycle.txt` containing `FINAL`. That is the `.cmd`-chain journal.
It records which critic ran last and which cycle it is on, and nothing else — no
per-cycle score, no delta, no budget, no plateau detection, no reason for the
stop. The plateau rule in the lane brief could not have been evaluated
mechanically from that state.

**OPEN — and it needs a falsifier, not an assumption.** I cannot prove from the
artefacts that the Gemini critics ever received image bytes. Their prose is
specific enough to be suggestive (cycle 6 credits the removal of a "magenta/purple
debug marker on the south patio" that cycle 5 raised), but nothing in the evidence
tree is a receipt that pixels were attached to the request. §4.4 designs the
falsifier that settles this permanently.

---

## 3. Reference gathering — an honest policy

### 3.1 The precedent we already set, and why it is the right one

**VERIFIED.** `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md` (HF-426 / Lane AU)
is the best reference work this repository has produced, and it did four things
that should become the policy:

1. **It rejected the previous version for unresolvable citations.** §0 records a
   `curl` check of the Gemini-authored first cut: a Medium article that returns
   HTTP 200 but is Medium's page-not-found shell, a 403 bare domain, a 404 map
   database, and a bare `callofduty.com`. Only the Fandom URL resolved. *"Every
   dimension in that document was therefore an unsourced recollection presented
   with a citation marker beside it."*
2. **It graded its sources by first-partyness.** S2 and S3 are the in-game BO2
   and BO7 minimaps — **first-party Treyarch art**, obtained by direct download
   from the wiki's static image host. S5/S6 are first-party stills. S7 is
   Activision's own guide, and because a direct fetch returned `ECONNRESET` it is
   recorded as **"Indirect… Treated as *reported*, never as measured — every S7
   claim below is corroborated by S2/S3/S5 before it is used."**
3. **It measured rather than copied.** The two minimaps were thresholded into
   three masks and run through an 8-neighbour connected-component flood fill;
   the playable polygon came out at 944 × 400 px, so `1 px = L/400`, and every
   dimension in the document is a **ratio to street length**. The header states
   *"Nothing in this document is copied… What is recorded is measurement."*
4. **It cross-checked two independent sources and published the agreement.** S2
   and S3 are the same map fifteen years apart and agree to ~1 % on every shared
   ratio (2.360 vs 2.359 for the across-street extent). That agreement is what
   made the load-bearing correction — the long axis runs *across* the street, not
   along it — safe to act on.

It also published its **caveats as first-class rows**: vehicle widths are not
usable because the minimap stroke inflates them, and absolute scale "is NOT
measured, and cannot be".

**VERIFIED.** `docs/nuketown-rebuild/TASK_STATE.md` adds the discipline of
re-fetching to check a claim: both minimaps were re-fetched 2026-09-03 to test
the brief's assertion that stair footprints are drawn on them. They are not —
S3 came back HTTP 200, 2,761,702 bytes, served `image/webp`, 4096 × 4096, and
"the two house fills resolve as grey blocks with **no interior linework**". The
brief was wrong and the document says so.

### 3.2 The source ladder (policy)

A reference enters a set only at a named tier, and the tier travels with it into
every critic prompt.

| Tier | What qualifies | How it may be used |
|---|---|---|
| **T1 — first-party artefact** | The publisher's own image/drawing/data of the subject: in-game minimap or official still, an architect's drawing, a manufacturer's dimensioned drawing, a government/heritage survey | Measurable. May be put in front of a critic as the target. |
| **T2 — own capture** | A photograph we took, or our own earlier approved build | Measurable. Preferred where it exists — no licence question at all. |
| **T3 — permissive/public-domain third party** | CC0/CC-BY photo, PD survey, openly licensed drawing, with the licence read and dated | Measurable, with the licence line recorded. |
| **T4 — reported** | A written description, a search summary, an indirect fetch | **Corroboration only.** Never the sole basis for a number, never shown to a critic as a target. |
| **REJECTED** | A frame grab from a shipped commercial game used as the visual target; anything whose licence is UNKNOWN; anything whose URL does not resolve | Not a reference. |

**VERIFIED**, `open-world-city-art-loop` §3: *"A frame grab from a shipped game is
a comparison you cannot record, cannot commit, and must not put in front of an
automated critic that will then be asked to close the gap to it."* and *"If the
licence is UNKNOWN, it is not a bar."*

The BO2 minimaps sit at T1 for **measurement of layout** — which is what HF-426
used them for, and it converted them to dimensionless ratios rather than
reproducing them. They must **not** become the visual target a critic is told to
match pixel-for-pixel. The distinction the policy has to keep sharp:

> **Measure a T1 game artefact for geometry and proportion. Never hand a
> commercial game's art to a critic as "make it look like this."** For look, the
> bar is a T2/T3 photograph of the real-world thing (a suburban street, a moving
> truck, a 1960s intercity coach) or our own approved build.

That distinction is what lets the loop be reference-grounded *and* original: the
layout comes from measurement, the surface look comes from photographs of the
real world, and neither is a copy.

### 3.3 What a reference set looks like

One JSON file per subject, committed; the image cache is **not** committed.

```
docs/reference-sets/<subject>/reference-set.json     # committed: provenance + measurements
docs/reference-sets/<subject>/MEASUREMENTS.md        # committed: how numbers were derived
artifacts/reference-cache/<subject>/<sourceId>.<ext> # NOT committed (artifacts/ is gitignored)
```

**VERIFIED:** `.gitignore` line 1 of the artifacts block is `artifacts/`, so a
downloaded reference cache under `artifacts/reference-cache/` is untracked by
construction. This matches what HF-426 already did in practice — it committed the
measurements and no images.

Proposed `reference-set.json` shape (contract `reference-set-v1`):

```jsonc
{
  "contract": "reference-set-v1",
  "subject": "nuketown2-moving-truck",
  "subjectKind": "prop",              // arena | street-cell | building | prop | material
  "purpose": ["proportion", "silhouette", "material-read"],
  "sources": [
    {
      "id": "S1",
      "tier": "T3",
      "kind": "photo",                 // photo | drawing | minimap | measurement | own-capture
      "url": "…",
      "licence": "CC BY 4.0",
      "licenceReadAt": "2026-09-04",
      "fetchedAt": "2026-09-04T11:02:00Z",
      "httpStatus": 200,
      "bytes": 482113,
      "sha256": "…",
      "servedContentType": "image/jpeg",
      "pixels": [1600, 1067],
      "cachePath": "artifacts/reference-cache/nuketown2-moving-truck/S1.jpg",
      "commitCache": false,
      "viewpoint": "three-quarter front left, eye height",
      "usableFor": ["silhouette", "proportion"],
      "notUsableFor": ["colour"],      // e.g. heavy colour grade, or stroke inflation
      "caveats": "Lens ~24 mm; box length foreshortened. Do not measure length off this."
    }
  ],
  "measurements": [
    { "metric": "cargo-box length / overall length", "value": 0.554,
      "method": "connected-component bbox on S2 orthographic drawing, 8-neighbour flood fill",
      "sources": ["S2"], "crossCheck": { "source": "S3", "value": 0.549, "agreementPct": 0.9 },
      "state": "VERIFIED" }
  ],
  "unknowns": [
    "Absolute scale is not derivable from any source here; the arena anchors it on the door aperture (see MEASUREMENTS.md §4)."
  ],
  "criticTargets": [                   // what a vision critic is allowed to be shown
    { "sourceId": "S1", "asTarget": true,  "reason": "T3 CC BY photo of a real box truck" }
  ]
}
```

Rules the fetcher enforces, all of them lessons already paid for:

- **A source with no resolving fetch receipt is not a source.** Record status,
  bytes, served content-type and sha256 at fetch time. HF-426's rejected first
  cut is the reason.
- **Served content-type is recorded, not assumed** — `TASK_STATE.md` notes both
  `.png` URLs were served as `image/webp` (VERIFIED).
- **Two independent sources per load-bearing number**, with the agreement
  percentage published. One source is a hypothesis.
- **`notUsableFor` is mandatory where a source distorts.** Minimap stroke
  inflation, wide-angle foreshortening, a colour grade.
- **`criticTargets` is an allow-list.** A T1 commercial-game artefact defaults to
  `asTarget: false`; it feeds measurement only.
- **Cache stays out of git.** The committed artefact is provenance and numbers.

### 3.4 What we owe the register

**VERIFIED:** `C:\Users\david\AppData\Local\hermes\.akephalos\references\ai-3d-technique-register.md`
runs to row 50 (`### 50. fable51-worlds`) and contains **no Astra row** (grep for
`astra` returns nothing). HF-468 asks for the ingest. Row 51 is owed: the two
Stefan_3D_AI posts and the mattshumer_ Manhattan post, pinned by URL, described
as *output plus a described loop, with no published implementation*, licence
UNKNOWN, boundary "bar and loop-shape only; no asset, prompt or code derived".

---

## 4. The reference-grounded critic

Three tiers, cheapest first. A tier that fails blocks the ones above it, so a
vision model is never asked to adjudicate something a 40 ms script already knows.

### 4.1 Tier 0 — mechanical perceptual pre-check (no model, no quota)

**Dependency answer: `sharp` 0.34.5 is already a devDependency (VERIFIED,
`package.json`), and 21 scripts under `scripts/qa/` already import it
(VERIFIED).** `scripts/qa/diff-arena-viewpoints.mjs` already does exactly this
class of work — downscale to 640×360 grayscale raw, per-pixel deltas, a
4-connected largest-region flood fill, and a stacked base/candidate/heat-map
composite (VERIFIED). **No new dependency is needed, and none should be added:**
SSIM and a Sobel edge map are ~80 lines of pure JS over a `sharp` raw buffer.

Proposed `scripts/qa/reference-precheck.mjs`, contract
`reference-precheck-v1`, comparing one capture against one reference image:

| Metric | How | What it catches | Why not the others |
|---|---|---|---|
| **SSIM** (8×8 windows, C1=(0.01·255)², C2=(0.03·255)², on luma) | pure JS over `sharp().grayscale().raw()` | global structural agreement | Mean-abs-delta (what the viewpoint diff uses) is dominated by exposure; SSIM is not |
| **Edge-map IoU** | Sobel magnitude, Otsu threshold, intersection over union of the binary maps | proportion and silhouette agreement independent of colour and lighting | This is the metric that survives a reference photo shot under different light |
| **Silhouette IoU** (props only) | alpha or background-key mask of both sides | "is it the right shape at all" | Cheapest possible proportion falsifier |
| **Value-histogram EMD** on 32 luma bins | cumulative-difference earth-mover | tonal/value composition match | Catches "our version is one flat value" without judging hue |
| **Region grid** (3×3 or the reference set's named regions) | the same four metrics per cell | *where* the disagreement is, so the correction can be bounded | A single global score cannot produce a bounded correction |

Output is a JSON block the vision critic is **given alongside the images**, so
"looks fine" cannot outvote a 0.31 edge-IoU on the cab region. This is the same
discipline `open-world-city-art-loop` §9 already imposes with HUD telemetry:
*"Give it the capture PNGs and the HUD telemetry JSON together, so 'looks good'
cannot outvote '18 fps'."* (VERIFIED).

**Honest limits, to be written into the script header in this repo's house
style:** none of these metrics is a fidelity score. A reference photo and a
render never share a camera, so SSIM against a photo is a *relative* number —
useful across cycles of the same pair, meaningless as an absolute. Its job is
(a) direction of travel, (b) region localisation, (c) a plateau signal that does
not depend on a model's self-report. Say so in the file, or a later agent will
quote it as a fidelity percentage.

**One camera-solve caveat, OPEN:** the strongest version of this pre-check
requires the capture camera to approximate the reference's viewpoint. The
`img2threejs` skill already carries a camera-pose solver
(`stage1_intake/solve_camera_pose.py` → `referenceCamera`, VERIFIED in SKILL.md
step 2c) and a de-light step. Whether that Python route is worth wiring into the
arena loop, or whether the judgeset should simply carry a hand-authored
"reference-matched" camera per reference photo, is an open call. **Recommendation
for the first lane: hand-author one reference-matched review camera per reference
photo.** It is an hour of work, it is deterministic, and it removes the solver
from the critical path.

### 4.2 Tier 1 — the vision critic

The critic receives, in one message: the **reference image(s)**, the **capture at
the reference-matched camera**, the **tier-0 JSON**, the **reference set's
`caveats` and `notUsableFor` lines**, and the **contract rules it may not propose
breaking** (TSL-only, no imported assets, art-direction bounds, cold-compile
fence, 0 in-combat pipeline creations). It receives **no builder rationale and no
history** — `visual-gauntlet-loop` loop contract step 3 (VERIFIED).

Scoring schema, contract `reference-critic-v1`. Note the deliberate change from
the overnight rubric: **every row is scored as agreement with a named reference,
not as a quality opinion**, and every row must cite the region it is talking
about.

```jsonc
{
  "contract": "reference-critic-v1",
  "subject": "nuketown2-moving-truck",
  "cycle": 3,
  "criticId": "B",
  "model": "google-antigravity/gemini-3.8-flash-high",
  "referencePair": { "reference": "S1.jpg", "capture": "truck-three-quarter.png",
                     "referenceSha256": "…", "captureSha256": "…" },
  "sawImages": { "probe": "R7-K3", "answer": "R7-K3" },   // §4.4
  "rows": [
    { "row": "geometry-match",    "weight": 25, "score": 18,
      "regions": ["cab", "box-rear"],
      "finding": "Cab roof line is flat where the reference has a 0.12·H crown; box rear frame is a single plane where the reference shows a recessed door track.",
      "referenceEvidence": "S1 upper-left quadrant",
      "captureEvidence": "capture region r1c2",
      "severity": "P1", "boundedCorrection": "Add the cab crown and the rear door track recess. Change nothing else." },
    { "row": "proportion",        "weight": 25, "score": 22, "…": "…" },
    { "row": "material-read",     "weight": 25, "score": 14, "…": "…" },
    { "row": "lighting-match",    "weight": 25, "score": 20, "…": "…" }
  ],
  "largestGap": { "row": "material-read", "regions": ["box-side"],
                  "rootCauseClass": "implementation" },   // spec | implementation | camera-lighting | missing-evidence | performance
  "contractConflict": null,        // set when the only fix would break §6 rules
  "decision": "refine-code",       // continue | refine-spec | refine-code | request-input | stop
  "notMatchable": [ "Reference S1 is graded warmer than our sunset key; colour-temperature disagreement is expected and is NOT scored." ]
}
```

Four rows, 25 each. The rows are chosen so each is falsifiable against an image:

- **geometry-match** — is the structure present, and is it the structure the
  reference has? (Regions, not the whole frame.)
- **proportion** — do the ratios agree? The tier-0 edge-IoU per region is the
  evidence the critic must reconcile with.
- **material-read** — does the surface read as the same *material class* at this
  distance: aggregate, sheet metal with a paint sheen, weathered timber? Not
  "is it pretty".
- **lighting-match** — do the value relationships agree (which plane is
  brightest, where the terminator falls, how deep the contact shadow is)?
  Absolute colour temperature is explicitly excluded when the reference set says
  so, so the critic cannot quietly drag us toward a reference photo's grade —
  the trap `open-world-city-art-loop` §4 names as *"the critic scores the sky"*
  (VERIFIED).

`notMatchable` is mandatory and is the honesty valve: a critic that lists nothing
as not-matchable is over-claiming, and the controller should say so in the
journal.

**Three critics, distinct lenses, fresh context** (as the overnight lane did —
VERIFIED): A = geometry/proportion, B = material/surface, C = lighting/value
composition + technical hygiene. Blind ordering where the pair permits.

### 4.3 Gates

- Every row ≥ 85 % of its weight, **and** the largest gap's root-cause class must
  not be `missing-evidence` (that means the reference set is incomplete — a
  `request-input`, not a build failure).
- **Tier 0 blocks tier 1 from being believed:** if the critic scores
  geometry-match ≥ 22/25 while edge-IoU on a named region is < 0.4, the round is
  `INVALID` and re-runs with the region crop enlarged. A critic that disagrees
  with a mechanical measurement without saying why is not evidence.
- **No score without a reference pair.** A capture with no matched reference gets
  a `rubric-only` verdict which **cannot** contribute to the exit gate. This is
  the single rule that would have prevented the 77 → 97 drift.

### 4.4 The image-receipt falsifier (settles the §2 OPEN)

Before each critic call, the runner stamps a **small, deterministic, off-subject
probe token** into a 24×24 px corner patch of the capture copy handed to that
critic — a 4-character code rendered as high-contrast blocks, derived from
`sha256(cycle|criticId|captureSha)`. The critic prompt's first instruction is:
*"Report the four-character code in the bottom-right corner of the capture as
`sawImages.answer`."*

- Wrong or missing code ⇒ **the round is INVALID and is not journalled as a
  score.** The critic did not see pixels, whatever its prose implied.
- The patch is on the *critic's copy only*, never on the archived evidence
  capture, and never inside a scored region.
- Cost: one `sharp` composite per call, and it converts §2's OPEN into a
  per-round VERIFIED fact.

This is cheap and it is the highest-value single item in this design, because
every other guarantee here rests on "the model actually looked".

### 4.5 Where each model runs

**VERIFIED, `omp --help` on `C:\Users\david\Downloads\omp-windows-x64.exe`
(v17.3.4):** `ARGUMENTS  MESSAGES  Messages to send (prefix files with @)` — so
images attach as `@path.png` on the OMP command line. That is the image route for
every OMP-hosted model.

| Role | Route | Basis |
|---|---|---|
| Critic A/B/C (vision) | `omp -p "@ref.png @cap.png @precheck.json <prompt>" --model google-antigravity/gemini-3.8-flash-high --thinking high --no-session --allow-home --cwd <worktree>` | CLAIMED (memory `harness-delegation-routes`, verified live 2026-09-03 for text) + VERIFIED `@` attach syntax |
| Cheap/bulk pre-critic, offline triage | local Qwen on **:8090** with the F16 mmproj projector, OMP provider `qwen-local-8090` (input text+image) | CLAIMED (memory `local-qwen38-serving-config`, owner-enabled vision 2026-09-03 20:23) |
| Hard adjudication, contract conflicts | `codex exec --model gpt-5.6-luna -c model_reasoning_effort=high …` | CLAIMED (memory); Dave's Codex usage is limited — hardest calls only |
| Builder | GLM-5.3-flash or Gemini 3.8 Flash via OMP, one file per call, exact edit spec | HF-460 (VERIFIED in ledger): *"you can't be injecting thousands of context; just a bit, the tools it needs, be very specific"* |
| Verifier / ship decision | Opus | owner rule 2026-09-03 (CLAIMED, memory `feedback-gemini-flash-task-fit`): Gemini Flash fabricates research; mechanical verifiable tasks only, Opus verifies |

**Standing hazard, VERIFIED in the ledger and the memory index:** Gemini Flash
fabricated citations in exactly this repository (HF-426 §0, four dead URLs). It
is therefore allowed to *describe pixels it was handed* and **never** allowed to
gather references. Reference gathering is an Opus-or-owner task with a fetch
receipt per source.

---

## 5. The loop controller

### 5.1 What is wrong with the `.cmd` chain

**VERIFIED (§2):** the state was `ba-critic.txt` = `C` and `ba-cycle.txt` =
`FINAL`. From that state a resumed run cannot answer: what did cycle 5 score?
did the score improve by less than a point over two cycles? how much budget is
left? which correction was applied and did it help? which captures belong to
which score? It also cannot enforce the lane brief's own plateau rule.

**VERIFIED:** the repository already has a better shape to copy —
`C:\Users\david\projects\aa-claude-nuketown6\gauntlet_loop.py`: rounds against a
spec until a deadline, a JSON state file, per-round logs, a checkpoint commit per
round, disjoint lane ownership, and the explicit note that *"Exit code 0 is not
trusted; swarm_dispatch scans output for failure markers."*

### 5.2 Proposed `scripts/forge/reference-loop.mjs` (contract `reference-loop-v1`)

Node, not `.cmd`, because it must read JSON verdicts and make decisions on them.
Single process, resumable, one subject at a time.

```
scripts/forge/reference-loop.mjs        # controller
scripts/forge/reference-precheck.mjs    # tier 0 (§4.1)
scripts/forge/critic-prompt.mjs         # builds the critic message + probe stamp (§4.4)
artifacts/forge/<subject>/journal.jsonl # append-only, one line per event
artifacts/forge/<subject>/state.json    # resumable head
docs/evidence/<pass>/<subject>/cycle-N/ # captures + critic JSON + precheck JSON (committed)
```

Per cycle, in order:

1. **Preflight.** ComfyUI queue empty and ≥ 3000 MiB free VRAM (the capture
   harness refuses below that — VERIFIED, `open-world-city-art-loop` §6);
   headless only; one browser at a time; ports 4280–4289.
2. **Build** — one bounded correction, one builder, explicit file list.
3. **Capture** — `capture-arena-viewpoints.mjs --arenas <arena>` (or the
   subject's judgeset manifest), including the reference-matched cameras.
   Verdict must be `PASS` and `environmentInvalid` must be null, else `INVALID`.
4. **Regression guard** — `diff-arena-viewpoints.mjs` against the frozen
   pre-lane baseline for every *other* arena's viewpoints. A gain here that costs
   a `REGION_CHANGED` elsewhere is a rejected round (VERIFIED rule,
   `open-world-city-art-loop` §9).
5. **Tier 0** — precheck JSON per reference pair.
6. **Tier 1** — three critics, each with a fresh probe token.
7. **Adjudicate** — drop `INVALID` critics; require ≥ 2 valid; take the modal
   largest-gap row; write the journal line.
8. **Decide** — `continue | refine-spec | refine-code | request-input | stop`.

Journal line (one JSON object per line, so a crashed run is still readable):

```jsonc
{ "ts": "…", "subject": "…", "cycle": 4, "event": "cycle-complete",
  "sha": "…", "captureManifest": "…", "captureVerdict": "PASS",
  "precheck": { "ssim": 0.61, "edgeIoU": 0.48, "worstRegion": "r2c1" },
  "critics": [ { "id": "A", "valid": true, "total": 78, "largestGap": "material-read" },
               { "id": "B", "valid": false, "invalidReason": "probe-mismatch" } ],
  "validCritics": 2, "meanTotal": 79.5, "deltaFromPrev": 0.7,
  "budget": { "cyclesUsed": 4, "cyclesMax": 6, "wallClockMinLeft": 143 },
  "decision": "refine-code", "correction": "cab crown + rear door track recess",
  "files": ["src/nuketown2-vehicles.ts"] }
```

Stop states, all mechanical:

- **Exit** — every row ≥ 85 % on ≥ 2 valid critics for two consecutive cycles,
  no blocking regression, tier 0 not worsening.
- **Plateau** — `meanTotal` improves < 1.0 over two cycles ⇒ escalate to a
  structural pass (change the spec, not the code) exactly once, then stop.
- **Oscillation** — the same region is the largest gap in cycles N and N+2 with
  a different one at N+1 ⇒ `request-input`.
- **Budget** — cycle ceiling and wall-clock ceiling, whichever first
  (`visual-gauntlet-loop`: three corrections per subsystem, six total visual
  corrections, VERIFIED).
- **Invalid streak** — two consecutive cycles with < 2 valid critics ⇒ stop and
  report the harness as broken. This is the guard the `.cmd` chain could not have.

`state.json` holds only the head (`cycle`, `phase`, `lastDecision`,
`budgetRemaining`, `baselineDir`), so a resume replays from the journal.

**Non-negotiable, and worth writing into the header:** the controller **never**
lowers a threshold, never widens the cold-compile fence, never edits the
judgeset to remove a failing camera, and never re-runs a critic until it agrees.
The multi-agent discipline in `AGENTS.md` already forbids all four (VERIFIED);
the controller should refuse them in code so a builder cannot do it by hand at
03:00.

---

## 6. "Street by street" → our street cell

**CLAIMED:** Astra built Manhattan street by street over a week. **VERIFIED:**
we already have the decomposition and one implementation of it.

`open-world-city-art-loop` §5 defines the unit exactly:

> a **street cell** is one road segment between two cross-streets, both kerbs,
> the frontages on both sides, its furniture, its trees, its parked vehicles and
> its signage.

and names the sub-pieces that get their own loop when they keep losing:
`road-surface`, `kerb-and-pavement`, `facade-bay`, `furniture-set`,
`vehicle-silhouette`, `signage-and-wayfinding` (VERIFIED).

**VERIFIED:** `src/map3/street-cell.ts` (1,069 lines) is that unit as a **rule
set of the existing corridor-3 shape grammar**, not a second generator; it
exports `createStreetCell(seed = 419): StreetCell` returning
`{ group, dispose(), stats: { objects, materials, instances } }`, uses one
`mulberry32` stream, creates every material at construction, and exports no
`update()`. Its header also records an honest measured failure: eight pipelines
compile lazily at first sight of the corridor, ~13 s into a load, and the
recorded pipeline-census result is **FAIL** (`docs/evidence/pass86/hf419/
pipeline-census-after.json`, 36 post-mark creations with the cell vs 28 without).

The mapping is therefore direct, and it needs no new architecture:

| Astra's unit | Ours | Reference set | Judgeset |
|---|---|---|---|
| A Manhattan street | one `street-cell` instance | 3–6 T2/T3 photos of one real street: carriageway close, kerb line, a frontage bay, the furniture cluster, a parked-car row | 4 authored cameras: driving/eye height along the cell, kerbside 5 m, one frontage bay at 5 m, one 40 m distance check |
| A block | a cell *type* (residential terrace / avenue / intersection) | one set per type; the intersection gets its own because it is always the worst | per type |
| A landmark building | its own subject, `subjectKind: "building"` | drawing (T1) + photos (T2/T3) | silhouette + three-quarter + grazing + contact |
| A hero prop | `img2threejs` route, `subjectKind: "prop"` | ≥ 3 views + a dimensioned drawing where one exists | turntable, not one frame (`img2threejs` step 7a, VERIFIED) |

**The scaling rule Astra's week implies and we should adopt:** one subject, one
builder, one reference set, one judgeset, one journal — and cells run in
sequence, not in parallel, on this machine. Parallel cells share the GPU and the
capture harness's VRAM floor, and `open-world-city-art-loop` §6 already forbids
more than one browser at a time (VERIFIED). Breadth comes from running many
cycles overnight, not from many concurrent browsers.

**The distance rule carries over unchanged** (VERIFIED, §7 of that skill): the
fBM octave count, paint wear and facade recess all step down with distance, and
*"a cell that costs the same at 200 m as at 5 m is mis-built."* A reference-
grounded critic must be given the 40 m capture too, or it will optimise the 5 m
frame into an unaffordable one.

---

## 7. Budgets, quotas, and what runs where

**Machine-sharing rules (VERIFIED in skill/memory, and they are hard
constraints):** headless only; never a headed browser on this machine; one
browser at a time on ports 4280–4289; the capture harness refuses to start below
3000 MiB free VRAM; ComfyUI queue empty before captures; QA browsers never on
Dave's main screen. Dave runs ComfyUI / ollama / llama.cpp on this PC — check
load before heavy jobs and never kill his processes.

Per-cycle cost model (a subject with 3 reference pairs and 3 critics):

| Item | Count | Cost centre | Notes |
|---|---|---|---|
| Capture run | 1 | GPU, ~2–4 min | `--samples 1` for critic cycles; `--samples 3` only for the regression baseline (VERIFIED: samples exist for persistence-min diffing, which a critic does not need) |
| Tier 0 precheck | 3 pairs | CPU, < 5 s | `sharp`, no quota |
| Tier 1 critic calls | 3 | Gemini 3.8 Flash via OMP (Google account) | the only metered spend in the cycle |
| Builder call | 1–2 | GLM-5.3-flash via OMP (Z.ai) | HF-460: minimal context, one file per call |
| Regression diff | 1 | CPU, ~30 s | `diff-arena-viewpoints.mjs` vs frozen baseline |

Quota rules, each earned from a recorded incident:

- **Do not use OMP/GLM as the long-running orchestrator.** CLAIMED (memory,
  2026-09-02): an OMP/GLM session burned its 5-hour window from 2 % to 80 % while
  only coordinating, sat idle 23:42→06:44, then did the work itself in the
  morning. The Node controller is the orchestrator.
- **Launch workers detached, never as children of another harness.** CLAIMED
  (memory): agy lanes launched by OMP died when OMP crashed, leaving
  uncommitted work. `.cmd` launcher + `Start-Process -WindowStyle Hidden` +
  a log with a terminal marker.
- **Exit 0 is not success.** VERIFIED in `AGENTS.md`: *"Six of eleven workers
  once reported success having done nothing — quota rejections that still exit
  0."* The controller scans worker output for failure markers and, for critics,
  the probe token is the real receipt.
- **Local Qwen :8090 is free and quota-less** — use it for a pre-critic triage
  pass (does this capture even show the subject? is it black? did the arena
  load?) before spending a Gemini call. Note the WDDM spill hazard: a model that
  does not fit loads anyway and pages to system RAM at ~2 tok/s with one warning
  line (CLAIMED, memory `gotcha-wddm-silent-vram-spill`). Check free VRAM before
  and after, not just `nvidia-smi`.
- **Codex/Luna is rationed** — reserve it for contract conflicts and the final
  pre-review, which is what it was used for on the tiptop lane (VERIFIED: commit
  `368f1f43` "luna pre-review - fail closed on house-interior coplanar findings").

---

## 8. Risks this design is deliberately built against

| Risk | Where it bit us | Mitigation here |
|---|---|---|
| Critic scores its own memory of quality, drifts to 97 | VERIFIED, §2 | No score without a reference pair; `rubric-only` verdicts cannot reach the exit gate |
| Critic never actually saw the image | OPEN, §2 | Probe-token receipt, §4.4 |
| Fabricated references | VERIFIED, HF-426 §0 (four dead URLs) | Fetch receipts, tier ladder, two-source rule, Flash never gathers |
| Copying a commercial game's look | policy risk | T1 game artefacts feed measurement only; `criticTargets` allow-list; look bar is a real-world photo |
| Critic drags the grade toward a reference photo | VERIFIED trap, city skill §4 | `notMatchable` colour-temperature exclusion; art-direction bounds are a contract the critic may not propose breaking |
| Detail added until the still frame wins and the game does not run | VERIFIED trap | Telemetry JSON travels with the images; the 40 m capture is in the judgeset; pipeline census and cold-compile fence unchanged |
| Loop cannot be resumed or audited | VERIFIED, §5.1 (`ba-critic.txt` = `C`) | Append-only JSONL journal with scores, deltas, budget and decisions |
| A gain on the subject regresses another arena | VERIFIED rule | Frozen baseline + `diff-arena-viewpoints.mjs` every cycle |
| Reference images end up committed | licence risk | `artifacts/reference-cache/` is gitignored by construction; only provenance + measurements are committed |

---

## 9. Implementation plan for the post-reset lane

Sized for **one Opus implementer, ~2–3 hours**, in a fresh isolated worktree.
Everything below is additive: no existing gate, threshold, catalog entry or
arena source is modified. Subject for the first run: **the Nuke Town Rebuild
moving truck and coach** (HF-462's named first targets — vehicles "read as
code-made").

**Before anything.** Confirm the worktree path and branch explicitly; do not
infer them (`AGENTS.md`: 365 worktrees, 458 branches here). Branch
`contrib/dave-gaming-pc/claude/reference-grounded-forge`. Declare the change
impact: **process-only** — every file below is under `scripts/forge/`,
`docs/reference-sets/` or `docs/research/`, and no runtime or release-shell path
is touched. Run `npm run pipeline:preflight -- --machine dave-gaming-pc --harness claude`
before implementation and again before handoff.

---

**Step 1 (20 min) — the reference-set contract and one real set.**
Write `docs/reference-sets/README.md` (the tier ladder from §3.2 and the rules
from §3.3) and `docs/reference-sets/nuketown2-moving-truck/reference-set.json`
using the `reference-set-v1` shape.
*Gather the sources yourself, as Opus, with `curl` receipts* — status, bytes,
served content-type, sha256, pixel dimensions — into
`artifacts/reference-cache/nuketown2-moving-truck/`. Target 3 T2/T3 photographs
of a real box truck (three-quarter front, side elevation, rear with the door
track) plus, if one resolves, a manufacturer dimensioned drawing.
**Gate:** every source has a resolving receipt; every load-bearing measurement
has two sources and a published agreement percentage; `criticTargets` names
which images a critic may be shown. A source whose licence is UNKNOWN does not
go in the file.
**Do not** delegate this step. Reference gathering is the exact task Gemini Flash
fabricated last time.

**Step 2 (25 min) — `scripts/forge/reference-precheck.mjs`.**
Contract `reference-precheck-v1`. Imports `sharp` only (already a devDependency —
add nothing). Implements SSIM, Sobel edge-map IoU, silhouette IoU, 32-bin luma
EMD, each globally and per region (3×3 by default, or named regions from the
reference set). Writes `{contract, referenceSha256, captureSha256, global:{…},
regions:[…], worstRegion}` and a stacked reference/capture/edge-overlay composite,
copying the composite pattern in `diff-arena-viewpoints.mjs`.
Header must state the honest limit from §4.1: these are relative, cross-cycle
numbers against a photo, never an absolute fidelity score.
**Gate:** `node scripts/forge/reference-precheck.mjs --reference <a> --capture <a>`
against an image and itself returns SSIM 1.0 / edge-IoU 1.0; against two visibly
different captures it returns a worst region that a human agrees with. Add
`scripts/forge/reference-precheck.test.mjs` pinning both.

**Step 3 (20 min) — `scripts/forge/critic-prompt.mjs`.**
Builds one critic message: stamps the deterministic 4-character probe token into
a 24×24 corner patch of a **copy** of the capture (never the archived evidence
file, never inside a scored region), assembles the `omp -p` argv with `@` file
attachments for reference + stamped capture + precheck JSON, and emits the
critic instruction text including the `reference-critic-v1` output schema, the
`notMatchable` requirement, and the contract rules the critic may not propose
breaking.
**Gate:** a dry-run flag prints the exact argv and writes the stamped copy;
`sharp` reads the stamp back and the token round-trips.

**Step 4 (35 min) — `scripts/forge/reference-loop.mjs`.**
Contract `reference-loop-v1`. Implements §5.2: preflight (VRAM floor, ComfyUI
queue, single browser, port range), capture, regression diff, tier 0, three
critics, adjudication (drop probe-mismatch critics, require ≥ 2 valid), journal
append, decision. Stop states: exit, plateau, oscillation, budget, invalid
streak. `--dry-run` runs everything except the model calls, with recorded
fixture critic JSON.
**Gate:** `--dry-run` on the step-1 subject produces a complete `journal.jsonl`
with a decision line and a non-null `precheck`; a fixture with a wrong probe
token is journalled as `invalid`, never as a score; a fixture where a critic
scores geometry ≥ 22/25 against edge-IoU < 0.4 is journalled `INVALID`.
Refuse-in-code: no threshold argument, no judgeset-editing flag, no critic
re-roll.

**Step 5 (20 min) — the judgeset for the subject.**
Add `docs/reference-sets/nuketown2-moving-truck/judgeset.json` in the
`nuketown2-judgeset-manifest-v1` shape already in use (VERIFIED, cycle-final
manifest): 4 cameras — one per reference photo viewpoint, hand-authored to
approximate that photo's framing (§4.1's recommendation), plus one 40 m distance
check. Do **not** add these to `scripts/qa/viewpoint-catalog.mjs`: that file is
cross-checked against authored `reviewCameras` in `src/rendering/arenas/*.ts` by
`scripts/qa/arena-viewpoint-regression.test.mjs` and adding a non-authored id
there turns the instrument red (VERIFIED in the catalog's own header).
**Gate:** `node scripts/qa/arena-viewpoint-regression.test.mjs` still passes,
untouched.

**Step 6 (20 min) — one live cycle, end to end.**
Preflight the machine. Capture the subject at the judgeset. Run tier 0. Run one
Gemini critic for real via OMP with `@` attachments. Confirm the probe token
comes back correct — **this is the moment §2's OPEN becomes VERIFIED or the
whole route needs rethinking.** Write cycle-1 evidence to
`docs/evidence/<pass>/nuketown2-moving-truck/cycle-1/`.
**Gate:** journal line with `validCritics >= 1`, a `largestGap` with a named
region, and a bounded correction that names one file. If the probe fails, stop
and report — do not proceed to step 7 on an unproven critic.

**Step 7 (20 min) — the write-up and the register row.**
`docs/pass84-lanes/LANE-<x>-reference-grounded-forge.md`: what was built, the
cycle-1 evidence paths, the probe result with its claim-state, and what the
overnight run would do next. Draft register **row 51** for the Astra threads
(pinned URLs, "output + a described loop; no published implementation", licence
UNKNOWN, boundary "bar and loop-shape only") per HF-468 — AKP is a separate
governed write, so draft it in the repo doc and hand the AKP commit to the
orchestrator rather than writing to `.akephalos` from this lane.
**Gate:** every claim in the write-up carries VERIFIED / CLAIMED / OPEN.

---

### What the implementer must know before starting

- **The point of this lane is the anchor, not the score.** A prettier number is
  not the deliverable; a score that *can go down because a photograph says so*
  is.
- **`sharp` 0.34.5 is already there. Add no dependency.** Twenty-one QA scripts
  already import it, and `diff-arena-viewpoints.mjs` is the pattern to copy for
  raw-buffer work and composites.
- **Never edit the viewpoint catalog, thresholds, or the cold-compile fence** to
  make anything pass. `AGENTS.md`: *"A correct failure stays failing and its row
  stays OPEN."*
- **One browser, headless, VRAM floor 3000 MiB, ComfyUI queue empty, ports
  4280–4289, never on Dave's main screen.** Dave shares this machine.
- **Reference gathering is not delegable to Flash.** Everything else in the loop
  is; this is not.
- **Nothing here publishes.** Feature worktrees edit and test; they never
  publish, and this lane touches no runtime path at all.

---

## 10. Open items for the owner

1. **OPEN — Blender on test map 4.** Owner said Blender is acceptable later on a
   test map. This design does not need it and does not propose it. Recommend
   deciding only after one code-native subject has cleared a reference-grounded
   gate, so the comparison is against something real.
2. **OPEN — reference-photo sourcing for the vehicles.** The strongest T2 option
   is photographs Dave takes himself of a real box truck and a coach; the T3
   option is CC-licensed photography. Ask before spending the lane's time on T3
   search.
3. **OPEN — camera solving.** Hand-authored reference-matched cameras are the
   recommendation for lane 1. Whether to wire `img2threejs`'s Python camera
   solver in later is a decision, not a default.
4. **OPEN — whether the Gemini critics on the tiptop lane ever saw pixels.**
   Settled by step 6's probe. Until then, the 97/100 result stands as
   `rubric-only` and must not be cited as visual evidence.
