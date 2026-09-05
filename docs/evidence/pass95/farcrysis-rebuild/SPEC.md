# PASS 95 — FARCRYSIS rebuild: research and spec

**Lane:** `rebuild-farcrysis-raid`, **research stage** (HF-512). **Agent:** Claude Opus 5.1.
**Worktree:** `C:/Users/david/projects/aa-m-farcrysis`.
**Branch:** `contrib/dave-gaming-pc/claude/v9-farcrysis`, cut from
`origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `452d7aba`
("build(hitl7): candidate 7 morning evidence").

**This stage produced no code.** It reads the record and writes the spec the layout stage
and the dressing stage build against.

**Claim-state key.**
`[VERIFIED]` = I read the file / ran the command in this session and quote what it said.
`[MEASURED]` = a number from a receipt or report in the repository, attributed to its file;
I did not re-measure it here.
`[OPEN]` = unknown, or a conflict I could not resolve, and named as unknown.

**Originality boundary, restated because it constrains every section below.** Nothing in
this rebuild copies geometry, texture data, shader code, audio or trade dress from any
external game. The frozen brief is explicit and I adopt it verbatim: *"A frame grab from
Far Cry or Crysis is a **REJECTED** reference: it may not be measured and it may never be
put in front of a critic as 'make it look like this.' The arena is an original homage; its
bar is photography of the real world."*
(`docs/farcrysis-rework/BRIEF.md`, Originality boundary) `[VERIFIED]`
The only trademark-adjacent string that stays is the arena's existing display name
(`Farcrysis` / selector `FARCrySIS`), which is already the shipped registry text.

---

## 1. The owner's requirements, verbatim, with HF ids and dates

Every quote below is copied from a repository document or from Claude's memory store; the
source is named on each. Nothing here is paraphrased into a requirement, and nothing is
added that the owner did not say.

### 1.1 HF-512 — 2026-09-05 07:05 — the request that opened this lane

> Owner: increase the parallelism; rebuild Farcrysis to the owner spec; make the Raid
> layout more accurate to the original game and add assets and textures similar and true to
> the original map; additional Opus/Fable highs allowed.

Source: `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`, HF-512 ledger row `[VERIFIED]`.
The row is a summary line, not a transcript quote — the ledger records it in the
orchestrator's words. **`[OPEN]`: the owner's own verbatim wording for HF-512 is not in the
repository.** The row's own routing text is what defines this stage:

> Workflow `rebuild-farcrysis-raid`: per map a research stage (Opus: spec/reference
> extraction with sources, no fabrication), a layout stage (Fable), a dressing stage (Opus:
> assets, textures, vegetation, props) chained on the layout branch, Opus verification
> after each build stage.

"Rebuild Farcrysis **to the owner spec**" is the operative phrase. There is no separate
document called "the owner spec". What exists is the accumulated owner record in §1.2–§1.6
below, distilled by the 2026-09-04 research lane into a **frozen brief** that is already in
the repository and was never withdrawn. §2 treats that frozen brief as the spec HF-512
points at, and says so as an assumption rather than a fact.

### 1.2 HF-429 — 2026-09-03 ~06:50 — the park, and the actual defect list

Owner statement, verbatim, after playing PASS 88 (the Farcrysis clause of a longer message):

> "Farcrysis needs a total re work its assets and texures are still a mess and it hasnt
> used the new techniques from threejs etc for its nature and water, that would need to be
> sorted, so remove that map and park that for later, focus on sorting out nuketown preview
> first then raid, and like i said be careful with compute"

Source: `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` §"HF-426..HF-429", verbatim block
`[VERIFIED]`. The ledger's own routing for that row:

> **HF-429 Farcrysis parked:** hidden again (`selectable: false`) in PASS 89; the block-2
> Farcrysis lane is cancelled; a future rework must use the new vegetation/water/
> interior-lighting skills. The admission guard keeps working for a parked build.

Four requirements are in that paragraph, and they are the core of this spec:
1. **total rework** — not a patch;
2. **assets and textures are a mess** — the surface/material layer is the named defect;
3. **the new three.js techniques are not used for nature and water** — named systems:
   vegetation, water (and the ledger adds interior lighting);
4. it stays **parked** until sorted.

### 1.3 HF-423 — 2026-09-02 22:25 — the unhide ask (superseded by HF-429, kept for intent)

> "ok thanks, get farcrysis sorted overnight too after nuke town and raid, i will sleep now
> see you at 6AM so i can play something good and hear more about it all, impress me with
> all the cool 3js skills etc and animation possibly too if time permits! night night"

Source: `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` §HF-423, verbatim block `[VERIFIED]`.
This is the ask that briefly un-hid the card in PASS 87. HF-429 reversed the card state one
day later; the *intent* ("impress me with all the cool 3js skills") is unchanged and is
restated more precisely in HF-429.

### 1.4 Owner, 2026-08-31 — the art direction, during the Raid playtest

> Rework: "remove all the messy clutter in the middle etc", reuse the techniques from
> test1/test2 and the third map thread. Label it **PROTOTYPE**. Goal is "look and feel and
> also have physics and lighting similar to playing crysis 1 and farcry back in the day"
> and "a fun mutupolayer map with jungle and beach".

Source: Claude memory `atomic-acres-art-lighting-direction.md` §3 Farcrysis, quoting the
owner `[VERIFIED as a memory record]`. The same memory carries the headline art ask for all
maps, which applies here too:

> "dynamic lighting, coloured, present in every map, neons and like i said, time of day,
> weather etc, can we get all this in and scale it up over time?"

Note the memory's own health warning: it is a point-in-time record (2026-08-31) and its
"blocking fact" section is stale — see §3.2. The **quotes** are the durable part.

### 1.5 Owner, 2026-08-03 — the original brief for the arena (still the identity)

> "A new map for pass 69. It should be called **f4rcry515** and inspired by the beach and
> jungle areas of **both Far Cry and Crysis** games. It should have a **bot mode** and be
> available for normal and multiplayer. … It should have similar physics and gameplay to
> the games I mentioned but feel like **COD multiplayer**. It's more about the map and
> subtle details and throwbacks. And graphics and physics and lighting. It should be so
> **delightful**. This should all be done with Nous Portal DeepSeek Flash V4 ultra and
> sub-agents using the same model. Use the new Three.js skills — especially the jungle one."

Source: `docs/PASS69_FARCRYSIS_ARENA_SPEC_2026-08-04.md` §0, marked "authoritative"
`[VERIFIED]`. The model-choice clause is spent (that lane is long finished); the *subject*,
*feel*, *bot mode*, *multiplayer intent*, and *"use the new Three.js skills"* clauses are
still live and are consistent with HF-429.

### 1.6 HF-455 — 2026-09-04 08:25 — the standing gate on shipping this

> "It would be good to get a human in the loop preview before you publish it that's been
> debugged"

Source: `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` §HF-455..457, verbatim `[VERIFIED]`.
Applied here: the card flip is the **last** commit and does not happen before the owner has
played a local build.

### 1.7 What the owner has NOT said — the negative space

- **`[OPEN]` — is the *layout* in scope?** No owner statement asks for a Farcrysis layout
  change beyond "remove all the messy clutter in the middle" (2026-08-31). HF-512's Raid
  clause explicitly asks for layout accuracy; its **Farcrysis clause does not**. The
  2026-09-04 research plan raised the same question and left it open (§9.1: *"if the owner
  means the layout too, that is a different and much larger lane and should be said before
  Phase 2"*) — and no answer to it exists in the ledger `[VERIFIED by grep]`. This spec
  therefore scopes the layout stage to **de-cluttering and re-composition inside the
  existing authority**, not a new floorplan, and flags the alternative in §6.
- **`[OPEN]` — multiplayer.** `multiplayer: false` today. The 2026-08-03 brief asks for
  multiplayer and the 2026-08-31 memory says "a fun mutupolayer map"; no owner statement
  since HF-429 asks to flip it. It stays false until he says otherwise.
- **`[OPEN]` — the PREVIEW/PROTOTYPE label wording** after the rebuild.

---

## 2. The frozen brief — what "rebuild to the owner spec" resolves to

`docs/farcrysis-rework/BRIEF.md` exists on
`origin/contrib/dave-gaming-pc/claude/farcrysis-slice-2` and is marked **FROZEN**, copied
verbatim from `docs/research/2026-09-04/FARCRYSIS-rework-plan.md` §3.1 (that plan lives on
`origin/contrib/dave-gaming-pc/claude/research-2026-09-04`, 505 lines, read in full here)
`[VERIFIED]`. It is *derived from* the owner quotes in §1, not from a separate owner
document.

**Assumption, stated as one:** this spec treats the frozen brief as "the owner spec" HF-512
names, because it is the only document in the repository that distils the owner's Farcrysis
words into buildable terms and because it was frozen one day before HF-512 and never
withdrawn. If the owner meant something else by "the owner spec", this assumption is the
thing to correct first. `[OPEN]`

Neither the brief nor the plan is on my base branch `452d7aba` — the plan is only on
`research-2026-09-04`, and the brief only on the slice branches `[VERIFIED]`. Both must be
carried onto the build branch before the layout stage starts (see §7, step L0).

### 2.1 The brief, condensed to its binding clauses

| Clause | Text (from `BRIEF.md`) |
|---|---|
| Subject | A small equatorial island research station, flooded and abandoned long enough for the jungle to have taken the concrete back: a lagoon-side beach ring, a dense mid-island jungle band, and a broken reinforced-concrete core. |
| Time / weather | 07:40, an hour after sunrise, clear with high haze after overnight rain — sun low and warm from the east, every horizontal surface still damp, one soft shaft through the canopy. *(fixes the whole light rig)* |
| Register | Documentary tropical-coast and dive/expedition photography: hard sun, deep but open shade, colour in the shadows. No orange grade. |
| Acceptance question | *"Would a paused frame read as a photograph, AND can I read an enemy silhouette at 20 m standing in the deepest shade on the map?"* Both, or it fails. |
| DO NOT | No golden hour, no orange grade, no fog bank (one haze shaft ≤ 0.004 of sun radiance per lit metre), no lens flare, no bloom beyond `strength ≈ 0.045`, no neon, **no imported assets of any kind**, no pure black / pure white in any generator (blacks ~26 sRGB, whites ~220), no flat single-colour surface a critic camera can see, **no new clutter in the middle of the map**. |
| Machine | Headless only, one browser at a time, ports 4280–4289, ≥ 3000 MiB free VRAM and an empty ComfyUI queue before any capture, never on the owner's main screen; if VRAM does not free in 20 min the browser rows are **OPEN**, not skipped. |

### 2.2 The line the brief draws through "total"

> Rework the presentation layer completely. Preserve the authority layer byte-for-byte
> unless a measurement says it is wrong.

`BRIEF.md` §"What is preserved" names the preserved set explicitly: the terrain authority
and its test, `farcrysis-constants.ts` (spawn table, patrol anchors, bounds, sightline and
cover constants), `farcrysis-physics.ts`, the `FARCRYSIS-LOAD` region in `legacy-main.ts`
and its cold-session precompile authority, **all 25 farcrysis test files**, and the
admission-evidence guard with its red test. `[VERIFIED]`

---

## 3. Current state of the arena, at `452d7aba`

### 3.1 Registry and card state

`src/map-selection.ts`, the `farcrysis` row `[VERIFIED]`:

| Field | Value |
|---|---|
| `id` / `routeId` | `farcrysis` |
| `selectable` | **`false`** — parked |
| `multiplayer` | `false` |
| `prototype` | `true` |
| `selectorLabel` / `displayName` | `FARCrySIS` / `Farcrysis` |
| `kind` | `team`, `soloBotCount: 2`, `maximumSoloBots: 2` |
| `rulesLabel` | `5 MIN · SOLO · 2 BOTS` |
| `authoring` / `authoringNote` | `'code'` / `'ALL CODE BUILD, NO ASSET IMPORT'` |
| `legacyAliases` | `['f4rcry515', 'farcry', 'f4rcry']` (decode at the storage/network boundary only, never emitted as UI text) |
| Display position | seventh, after Gun Range |

The row's inline comment is the park record, and it is emphatic that parking is **not** a
rollback (quoted verbatim) `[VERIFIED]`:

> **PARKED AGAIN 2026-09-03 (HF-429, owner decision at the PASS 89 candidate).**
> `selectable: false` and the PREVIEW word is off the card copy … Everything Lane R landed
> stays exactly as it is: the solved spawn table, the terrain collision proxy in
> `raycastMeshes` … the admission receipts, and the admission-evidence guard. A parked build
> passes that guard with no receipt, because the guard asks for a receipt from arenas that
> are OFFERED. **Nothing was deleted to make a gate green.**

### 3.2 Why it is hidden — the two distinct reasons, in order

1. **2026-08-28 (superseded).** Measured against the live build through the real player
   path: *"the only arena of six that never reached an active match — 279 s, then the tab
   crashed. The other five reached playable in 49–69 s."* `[MEASURED — registry comment]`
   **This reason is fixed.** PASS 84 Lane C's `FARCRYSIS-LOAD` work made every fenced WebGPU
   submission complete and the arena transition commit; PASS 87 Lane R un-hid it on that
   basis. The memory note `atomic-acres-art-lighting-direction.md` still records the 279 s
   crash as the "blocking fact" — **that part of the memory is stale.** `[VERIFIED]`
2. **2026-09-03, HF-429 (current).** The owner parked it for **art**: assets and textures a
   mess, the new nature/water techniques unused. This is the only live reason. `[VERIFIED]`

So: the load path is not what keeps the card hidden today. The surface layer is.

### 3.3 Derived rosters — what the one flag moves

The registry comment records, and `src/arena-selectability.test.ts:45` confirms
(`expect(SELECTABLE_ARENAS.some(e => e.id === 'farcrysis')).toBe(false)`), that the hidden
set is asserted **by flag**, never by a hardcoded id list `[VERIFIED]`. Selectable count is
10 with farcrysis parked; the eye-clearance and cross-browser contract floors are computed
from the derived roster. The MP lab roster is `multiplayer && selectable`. Flipping either
field is a gated change, and `src/map-selection.test.ts:43` pins the display order of all
eleven arenas including `Farcrysis`. `[VERIFIED]`

### 3.4 What exists in code today

48 `src/farcrysis*` files: 23 source + 25 tests `[VERIFIED by ls]`. Largest source files:

| File | Bytes |
|---|---|
| `src/farcrysis-vegetation.ts` | 133,283 |
| `src/farcrysis-physics.ts` | 61,418 |
| `src/farcrysis-art.ts` | 54,744 |
| `src/farcrysis.ts` | 53,709 |
| `src/farcrysis-textures.ts` | 47,701 |
| `src/farcrysis-terrain-authority.ts` | 30,841 |
| `src/farcrysis-water-fx.ts` | 28,824 |

**Authority layer (preserve).**
- `src/farcrysis-constants.ts` `[VERIFIED]`: `FARCRYSIS_BOUNDS` = ±64 m in X and Z (128 m
  across, 16,384 m², grown 4× from the Pass 69 ±32 m by HF-396);
  `FARCRYSIS_MAX_SIGHTLINE = 22`; `FARCRYSIS_COVER_MIN = 14`; `FARCRYSIS_SPAWNS_XZ` = 8
  points per team, solved by `scripts/qa/solve-farcrysis-spawns.ts` against the HF-402
  constraint set. It is the arena's **designated leaf module** (no imports from
  `farcrysis.ts`) precisely so the vegetation layer can derive from it without a cycle — a
  hand-copied duplicate in the vegetation layer previously drifted and put an undergrowth
  card 2.68 m from a spawn against a 3.19 m rule.
- `src/farcrysis-terrain-authority.ts` + its 30 KB test — the terrain collision proxy that
  took the HF-402 spawn-floor rule from 6.44 % to 100 % coverage and made the island stop
  bullets `[MEASURED — registry comment]`.
- `src/farcrysis-physics.ts` — interactables, fuel drums, crate-lid / tower-deck / dish /
  cave-crown authority.
- One `FARCRYSIS-LOAD` marked region in `src/legacy-main.ts`.

**Layout as built** (`src/farcrysis.ts`) `[VERIFIED by grep]`: the core has six wall boxes
(`farcrysis-core-wall-{n-west,n-east,s-west,s-east,w,e}`, 3.2 m tall), a catwalk at y 2.5
(`farcrysis-core-catwalk`, ballistic class `structural-metal`), a command desk, and a stair
run `core-catwalk-stairs` from `[2.9, 0, 4.6]` to `[2.9, 2.59, 1.35]` registered as both a
ladder-ish traversal and a walkable deck. The three-loop rhythm from
`docs/PASS69_FARCRYSIS_ARENA_SPEC_2026-08-04.md` §R3 (beach/lagoon outer ring, dense jungle
mid ring, research-core inner loop with one vertical crossing) is the documented intent
`[VERIFIED in the spec doc]`; I did not re-measure the built loops.

**Mid-map dressing** is generated from four quadrant landmark frames
(`src/farcrysis-midmap-landmarks.ts`: `FARCRYSIS_LANDMARKS` tagged `nw|ne|sw|se`, with
outward offsets `LANDMARK_FRINGE_OUTWARD 7.6`, `LANDMARK_WALL_OUTWARD 5.2`,
`LANDMARK_CRATE_OUTWARD 4.1`, `LANDMARK_HEDGE_OUTWARD 6.3`, keep-out radius 8.0 m) plus
`farcrysis-detail.ts` and the visual-dressing layer `[VERIFIED]`. This is the mass the owner
calls "messy clutter in the middle".

**Water.** `src/water/water-authoring.ts` registers a `farcrysis` body `[VERIFIED]`:
`level: -0.25`, `swimmable: true`, `amplitudeScale: 0.2`, `dryFootprintMask: 'rectangular'`,
and — importantly — `presentationOwner: 'arena-builder'`, i.e. *"The retained Pass 69
terrain builder still owns this surface. Recording that exception prevents the shared runtime
from drawing a duplicate sea."* The file's own HF-358 history records that registering it
naively once built a **second** ocean 20 mm below the real one and put ~2.36 m swells over a
1.6 m eye height. So the water rebuild is a *migration with a known trap*, not a fresh
registration. Presentation lives in `farcrysis-water-surface.ts` / `-water-fx.ts` /
`-water-ripples.ts` / `-shore-bands.ts`; the shore ramp `(chebyshev − 15) / 22` is already
cross-checked against `farcrysisTerrainHeight` by `water-authoring.test.ts` `[VERIFIED per
the 2026-09-04 plan §3.5; I read the registration, not that test]`.

**Lighting today** (`src/rendering/arenas/farcrysis.ts`) `[VERIFIED]`: sun `0xffeed2` at
2.4, ambient `0xb8d4de` at 0.3; three declared practicals
(`farcrysis-beach-golden-hour` emissive-only, `farcrysis-core-work-lights` shadowed-local
max 22 m casting, `farcrysis-jungle-dapple` shadowed-local max 18 m casting); fog
`0xa8cfe0` near 78 far 200; shadows 2048 / 200 m / normalBias 0.03; atmosphere preset
`jungle-golden-hour`, mist 0.12, dust 0.05; colour pipeline `pass69.farcrysis.hdr.v1` at
1.08; budgets `maximumDrawCalls: 460`, `maximumTriangles: 1_100_000`. Nine review cameras
including `farcrysis-core-interior`, `farcrysis-island-topdown` and `farcrysis-west-shoreline`.

**`[OPEN]` — the practicals contradiction.** The 2026-09-04 plan §3.6 says the core has "no
floor, no walls, no practical light (owed by the previous lane)". The walls and catwalk
plainly exist (above), and `farcrysis-core-work-lights` is a declared practical in the
arena definition. What I could **not** verify is whether emissive fixture geometry actually
exists for that practical, or whether the core interior has its own floor distinct from the
terrain. Resolve by reading, not by assuming, before the dressing stage.

### 3.5 Numbers on record (attributed, not re-measured)

From `docs/evidence/pass87/lane-r/frame-time-at-head.json` via the 2026-09-04 plan §1
(paired, same browser launch, quiet machine, 1600×900 WebGPU headless) `[MEASURED]`:

| | farcrysis | atomic-acres (control) |
|---|---|---|
| p50 frame | **18.2 ms** | 13.6 ms |
| p95 / p99 | 24.6 / 28.1 ms | 20.4 / 23.6 ms |
| meshes | 253 | 161 |
| instances | 93,194 | 27,133 |
| triangles | 866,727 | 538,735 |
| shadow casters | 99 | 64 |
| **distinct materials** | **222** | **110** |
| transparent | 48 | 36 |
| pipelines during sample | 0 | 0 |

Admission, `docs/evidence/pass87/lane-r/farcrysis-admission.json`, contract
`farcrysis-admission-evidence-v1`, 3 paired runs, uncontended `[MEASURED]`:
`selectToAdmittedMs` farcrysis mean 46,072 / max 48,199 vs control mean 36,390 / max 37,160;
worst pair ratio **1.2971**; `allAdmitted: true`, `anyCrashed: false`, `anyPageErrors:
false`, `maxMenuPipelines: 0`.

**`[OPEN]` — an admission-number discrepancy the record itself flags.** The ledger's 02:10
entry records farcrysis 30.5/34.4/31.1 s vs 25.2/26.8/24.9 s and "worst pair ratio 1.283
over twelve pairs"; the receipt above is a later 03:22 three-pair run of a **different
field**. Both are honest, they are not the same measurement, and the 2026-09-04 plan §9.5
asks for the ledger row to be corrected. **This lane must re-measure at its own head and
inherit neither.**

Material census on the slice-1 branch head `c3ba5028` (deterministic unit environment)
`[MEASURED — `docs/evidence/pass94/farcrysis-rework/REPORT.md` §2.1]`: 990 meshes, **198
distinct material objects** for only **14 distinct render-state signatures**. Worst
offenders: `farcrysis-detail-rock-N` 11, `farcrysis-throwback-seaplane` 8,
`farcrysis-crate-N-shards-shard-M` 8, `farcrysis-atmos-god-ray-shaft-N` 7.
**`[OPEN]` — the material count at *my* base `452d7aba` is unmeasured.** 222 (PASS 87 head)
and 198 (`c3ba5028`) are different heads; neither is my base.

### 3.6 What already exists but is NOT on my base branch

`[VERIFIED by `git merge-base --is-ancestor`]` — none of `87acde4f`, `d9395579`, `19d6f2cf`,
`eabb24c0` is an ancestor of `452d7aba`. Concretely, candidate 7 **does not contain**:

- `src/farcrysis-material-vocabulary.ts` — the end-of-build collapse pass that merges
  exact-duplicate `MeshStandardMaterial` objects (four rules, each written against a hazard
  that was found and ruled out first: Standard-by-exact-`type` so Physical twins keep
  transmission/clearcoat; runs **last**, after the name-keyed texture and shade-lift
  mutators, because a key taken before classification wrongly merges 5 groups; texture
  identity in the key; nothing disposed). Measured effect at `c3ba5028`: **198 → 168**.
- `src/farcrysis-material-vocabulary.test.ts` — gate G4, a one-way ratchet with
  `CEILING_HISTORY`, a fixed-point check (a second collapse pass must merge 0), rule-1
  tested on a synthetic scene, a render-state-signature ceiling at 14, and a source pin on
  the ordering rule.
- Slice 1's detail-rock family collapse (−10) and slice 2's boulder-family collapse
  (168 → **166**), the latter landing per-set tint through `InstancedMesh.setColorAt` /
  `instanceColor` after Luna's review rejected the cloned-geometry vertex-colour route as
  not the repository-approved per-instance path.
- The frozen `docs/farcrysis-rework/BRIEF.md`.

`[VERIFIED]` `ls src/farcrysis-material-vocabulary*` in this worktree → *"No such file or
directory"*.

**Review verdicts on that work** (`docs/evidence/pass95/farcrysis-slice-2/LUNA-REVIEW.md`)
`[VERIFIED]`: review 1 **DO-NOT-SHIP** on the material-rule finding; review 2, after the fix,
**SHIP-WITH-FIXES** — tsc 0, the explicitly-named 7-file set 7 files / 50 tests green,
`find-coplanar-pairs.ts` 0 different-material findings at exit 0; the broad 28-file run timed
out under machine contention and is *not* represented as green. The one finding still open is
**visual/runtime evidence**: no exact-SHA WebGPU parity or frame capture, because the review
ran under a no-browser/no-GPU boundary.

The forward-port workflow (HF-508 fleet note) lists "Farcrysis slice 2" among the 11 reviewed
lanes candidate 7 left out, each forward-ported onto `452d7aba` in its own `aa-fp-*` worktree
`[VERIFIED in the ledger]`. **`[OPEN]` — whether `fp-farcrysis-slice-2` has landed, and its
verified result.** Those worktrees are not mine and I did not enter them.

---

## 4. The gaps between the spec and the state

Ordered by what blocks the card, not by size. Each row names the evidence it rests on.

| # | Gap | Spec clause | State at `452d7aba` | Claim |
|---|---|---|---|---|
| **A** | **Material vocabulary.** 222 distinct materials for 14 render states; 2× the control's 110. The single largest lever on both admission and frame time, and the PASS 87 lane explicitly did not attempt it. | Plan §5.3 lever 1; budget ≤ 110 | Collapse pass + ratchet exist **only on the slice branches**; my base has neither. | `[MEASURED]` 222 @ PASS 87 head, 198→166 on slice branches; `[OPEN]` at my base |
| **B** | **Textures / surfaces are "a mess" (HF-429).** The technical translation: wear at **one scale only**, where a photograph shows three (0.5–1.5 mm grain, 20–80 mm scuffs, 0.5–3 m traffic gradients). Arena-private generators in `farcrysis-textures.ts` (47.7 KB) + `-ground-textures` + `-ground-materials` instead of one vocabulary through `src/rendering/surface-forge.ts`. | Brief register + plan §3.3 | Arena-private, single-scale. | `[VERIFIED]` files exist as described; `[OPEN]` I did not measure the wear scales |
| **C** | **Vegetation does not use the new technique (HF-429).** Several parallel systems: `farcrysis-vegetation.ts` (133 KB) + `-palms-enhanced` + `-tsl-foliage` + `-grass-field`. | `threejs-procedural-vegetation` (Fibonacci lattice, trunk/canopy split, per-instance jitter) + cluster geometry (merge N blades per instance) | Four systems, 93,194 instances. Instances are not the problem; programs are. | `[VERIFIED]` files; `[MEASURED]` instance count |
| **D** | **Water does not use the new technique (HF-429).** Four arena-private modules; `presentationOwner: 'arena-builder'` is a recorded exception to the shared runtime. | `threejs-webgpu-water`: one declared spectrum with **two consumers** (TSL displacement + CPU `sample(x,z,t)`), Beer-Lambert absorption colour, persistent breaking foam, shoreline band, swimmable volume | Registered body with level/swimmable/amplitude, presentation owned by the arena builder. | `[VERIFIED]` |
| **E** | **Core interior.** Owed since PASS 87; named by HF-429's "interior-lighting skills". | `threejs-webgpu-interior-lighting-look`: emissive fixtures carrying value composition, fog falloff, decal grime, filmic post; *a dark opening is a dim lit box, never a black quad* | Walls, catwalk, desk and stairs exist; floor and emissive fixtures unconfirmed. | `[OPEN]` — see §3.4 |
| **F** | **Mid-map clutter.** Owner, 2026-08-31: "remove all the messy clutter in the middle etc". | Every mid-map mass either blocks a sightline the metric says needs blocking, or it is not placed. | Four generated quadrant landmark frames + detail + dressing. | `[VERIFIED]` the generators exist; `[OPEN]` no current sightline measurement |
| **G** | **Frame time.** p50 18.2 ms vs 13.6 ms = 1.34× at p50, and the shipped caveat was 1.34–1.89×, median 1.64×. | Plan G6 tightens the target to **p50 ratio ≤ 1.25** with `pipelinesDuringSample === 0` | 1.64× median shipped caveat. | `[MEASURED]` |
| **H** | **Eye clearance.** 25 genuine runtime rows remain (the other 373 of 441 were a stage-1 instrument limitation on heightfields). | Plan G11: genuine runtime rows **0** | 25 open. | `[MEASURED — HF-423 lane result]` |
| **I** | **Penetration classes (HF-467).** Every re-authored surface must be classified as it is authored. R3 recorded 22 unshootable surfaces on `nuketown2` from doing this after the fact. | glass breaks/passes, thin metal (drums, corrugated sheet, dish) perforates and loses collision at the hole, concrete and core walls stop | Some ballistic classes present (e.g. catwalk `structural-metal`). | `[VERIFIED]` one example; `[OPEN]` full coverage |
| **J** | **Lighting rig is not derived.** The brief's one weather sentence should fix the whole rig; today's values are hand-tuned per pass (the comments record a Pass 76 regrade off a "beige golden-hour wash"). | Derived exposure `EV100 = log2(N²/t) − log2(ISO/100)`, `L_sat = 1.2·2^EV100`, `exposure = 1/(L_sat·K)`, `K = 1e-4`, **metered on the shaded jungle floor, not the beach**; two IBL probes with every material in exactly one | Authored constants, atmosphere preset `jungle-golden-hour`. | `[VERIFIED]` the constants |
| **K** | **Combat readability is not a gate.** | Deepest-shade operator separation at 20 m measured from a capture, in **both** graphics profiles; every grade stage provably non-hiding | No such gate on this arena. | `[OPEN]` |
| **L** | **Reference sets do not exist.** | Four sets under `docs/reference-sets/<subject>/reference-set.json`, contract `reference-set-v1`, T2 (our own capture) or T3 (permissively licensed real-world photography), fetch receipts, two sources per load-bearing number with a published agreement % | None — `docs/reference-sets/` does not exist on this base at all. | `[VERIFIED by ls]` |
| **M** | **Documents not on the build branch.** Brief and plan live on other branches. | — | — | `[VERIFIED]` |

---

## 5. Constraints that apply to this arena

Every number here is a **floor or ceiling that may be tightened and never loosened**. None
of them may be relaxed to reach green; a correct failure stays failing and its row stays
OPEN.

### 5.1 Pipeline and admission

- **The 12 s WebGPU fence is per fenced submission, not per arena.**
  `legacy-main.ts`'s `profileArenaTransition('coverage-submit-fence')` fences the single
  full-coverage draw that `withArenaFrustumCullingDisabled` forces through
  (`src/rendering/arena-coverage-prewarm.ts`). HF-374's failure was ~86 distinct TSL foliage
  graphs realised inside that one submission. **Never widen it.** `[per plan §5.1, VERIFIED
  there]`
- **Wall-clock admission is not the fence.** No arena on this machine admits in 12 s (Lane H
  measured deploy at 14–20 s everywhere). The gate is a **ratio ≤ 1.60** to a same-window
  `atomic-acres` control: `FARCRYSIS_ADMISSION_RATIO_CEILING = 1.60` at
  `scripts/orchestration/publish_pass93.py:83` `[VERIFIED]`. Target: **beat 1.297**, not
  merely clear the ceiling.
- **Menu constructs zero gameplay arenas; `maxMenuPipelines` must stay 0.** This is a term
  of the `farcrysis-admission-evidence-v1` contract, not a preference. "Precompile at menu
  time" can only ever mean the one fenced isolated submission that compiles the shared
  retained-asset TSL/HDR pipeline, and it must not attach an arena root or render a gameplay
  scene. The slice-1 report records this brief instruction being **refused** for exactly that
  reason — the correct reading of the plan is §5.3, *compile less*. `[VERIFIED]`
- **In-combat pipeline creations stay 0** (`pipelinesDuringSample`). This is the tripwire and
  it may not be traded for anything.
- **`TSL_FOLIAGE_MAX_DISTINCT_GRAPHS = 16`** (`src/farcrysis-tsl-foliage.ts:116`), asserted by
  `farcrysis-tsl-foliage.test.ts:120` and `farcrysis-webgpu-pipeline-budget.test.ts:125`
  `[VERIFIED]`. **A ceiling to lower, never to raise.**
- **Publish guard.** `assert_farcrysis_admission_evidence` (`publish_pass93.py:234`) plus its
  deliberate red test `farcrysis_guard_red_test` (`:355`) — the guard must fire red on
  absent / stale-digest / contended / fewer-than-3-run receipts and then pass on a real one
  `[VERIFIED]`. **Never delete the guard or its red test.** This lane does not edit a publish
  script for a pass it does not own; it writes the carry-forward patch into its report.

### 5.2 Fidelity and layout

- `FARCRYSIS_MAX_SIGHTLINE = 22`, `FARCRYSIS_COVER_MIN = 14` — unchanged, and re-measured
  after the clear-out with a **real occlusion test**. The PASS 74 audit recorded that this
  assertion had once been replaced with a vacuous `>= 0` check; that must never come back.
- `FARCRYSIS_BOUNDS` ±64 m — the single constant every consumer derives from (terrain
  authority `ARENA_HALF`, physics plates, bot platform grid, vegetation rings, bound walls).
- Spawn table unchanged; `farcrysis-spawns.test.ts` stays. HF-456's spawn-distribution work
  applies here when it lands, not before.
- **Presentation never derives collision.** A re-forged body over an existing collider stays
  presentation; the collider stays where the authority put it. Every substantial
  player-reachable visible object needs matching movement and shot authority in **both**
  graphics profiles.

### 5.3 Repository-wide gates that this arena sits inside

Coplanar checker classes (HOUSE-INTERIOR / STREET / same-material-visible) at **0**;
collider-visual parity walk-through at **0**; walkable-surface parity; the legacy-main size
ratchet `LINE_CEILING = 37,396` (hoist, never raise) — `src/legacy-main.ts` edits by `sed`
ranges inside the `FARCRYSIS-LOAD` region only, LF preserved. Per-arena pipeline budgets and
the 10 s cold-admission budgets are unchanged. **All 25 farcrysis test files stay.** A test
may be extended; none may be weakened, and none may be deleted because its subject was
rewritten — if a subject is rewritten, its test is rewritten to hold the new implementation
to the same or a tighter bound.

### 5.4 Machine

Headless only, installed Chrome, `PASS73_NATIVE_WEBGPU=1`, stock flags, `--mute-audio`,
off-screen, one browser at a time, ports 4280–4289 for this lane, every session under 4
minutes with a hard kill, never on the owner's screen. Before any capture: ComfyUI queue
empty and ≥ 3000 MiB free VRAM. If VRAM does not free within 20 minutes of polling, the
browser rows are marked **OPEN** — not skipped, not assumed. Heavy steps (build, full
vitest, any browser step) take the machine lock and release it immediately, grouped into one
block at the end.

### 5.5 The two rules with a bad history

- **Stock-flags boot is a named gate.** HF-454: every QA smoke passed `--enable-unsafe-webgpu`
  and hid a Tint swizzle bug that made the live site unlaunchable. Green gates over a build
  the owner cannot launch is the exact failure to design against.
- **Reference gathering is not delegable to Gemini Flash.** HF-426 §0 recorded four dead URLs
  presented as citations. Two independent sources per load-bearing number, with the agreement
  percentage published.

---

## 6. The scope decision the owner should confirm

The layout stage cannot start honestly without this, and it is `[OPEN]`.

- **Interpretation 1 (this spec's default): presentation-total, authority-preserved.**
  "Total rework" = rebuild everything a player *sees*; keep the spawn table, terrain
  collision, physics authority, the load fix and the 25 tests. Justified by HF-429's own
  words — the defects he names are *assets, textures, nature, water* — and by the brief's
  preservation list.
- **Interpretation 2: layout too.** HF-512 asks for layout accuracy **for Raid**; it does not
  say so for Farcrysis. If the owner wants a new Farcrysis floorplan, that is a much larger
  lane, it re-opens spawns, sightlines, eye clearance and parity, and it should be said before
  the layout stage cuts geometry.

Until answered, the layout stage does interpretation 1: **de-clutter and re-compose inside
the existing bounds, loops and spawn table.** That is a defensible reading of every owner
sentence on record and it is reversible; a floorplan rebuild is not.

---

## 7. Build order — layout stage

Owner: Fable, on `contrib/dave-gaming-pc/claude/v9-farcrysis` (or a branch cut from it).
The card stays `selectable: false` throughout. Nothing in this stage flips a registry field.

**L0 — carry the documents and take the lane's own baseline.**
Cherry-pick or copy `docs/farcrysis-rework/BRIEF.md` (frozen, do not edit) and
`docs/research/2026-09-04/FARCRYSIS-rework-plan.md` onto the build branch. Capture the
**pre-lane arena-viewpoint baseline for every arena** — G16 depends on it existing before
anything changes. Re-measure the material census, frame time and admission **at this head**
so the lane owns its numbers instead of inheriting the §3.5 discrepancy.
*Exit:* baseline files committed; three receipts at this head.

**L1 — land the material-vocabulary gate red, then green.**
Bring `src/farcrysis-material-vocabulary.ts` + `.test.ts` forward from the slice branches
(or from `fp-farcrysis-slice-2` if it landed — check first, §3.6). Set the ratchet at the
**measured** count at this head, not at 166 or 168 inherited. Keep every rule and every
extra assertion: the fixed-point check, the synthetic-scene rule-1 test, the render-state
signature ceiling, the source pin on ordering. The boulder tint must use the per-instance
`setColorAt` / `instanceColor` path, not cloned-geometry vertex colours — Luna's review 1
rejected that route explicitly.
*Exit:* G1 tsc 0; G3 pipeline budget green; G4 green at the new ceiling; no other test
touched.

**L2 — clear the middle.**
Delete the decorative mid-map mass and re-compose from the four quadrant landmark frames
under one hard rule: **every mid-map mass either blocks a sightline the metric says needs
blocking, or it is not placed.** No new clutter (brief DO NOT list).
*Exit:* mass count before/after recorded; nothing else changed in the same commit.

**L3 — re-measure sightline and cover with a real occlusion test.**
`FARCRYSIS_MAX_SIGHTLINE = 22` and `FARCRYSIS_COVER_MIN = 14` unchanged. The vacuous
`>= 0` assertion the PASS 74 audit found must not return.
*Exit:* measured sightline distribution and cover count committed as a receipt; G12 ground
contract, spawn tests and spawn-layout-quality unchanged green.

**L4 — the core interior shell.**
Resolve the §3.4 `[OPEN]` first by reading the code: does the core have a floor distinct
from the terrain, and does `farcrysis-core-work-lights` have emissive fixture geometry? Then
build what is missing — floor, wall inner faces, one **practical**. A dark opening is a dim
lit box, never a black quad. Combat readability rules from
`threejs-webgpu-interior-lighting-look` apply from the first commit, not at the end.
*Exit:* G1, G2 (25 farcrysis test files), G3, G4 green; coplanar classes 0; collider-visual
parity 0.

**L5 — eye clearance to zero and penetration classes.**
Fix the 25 genuine runtime eye rows (the 373 stage-1 heightfield rows are an instrument
limitation and belong to a separate lane — do not "fix" them here by loosening the
instrument). Classify every surface L2–L4 touched per HF-467/R3 **as it lands**: glass
breaks and passes, thin metal perforates and loses collision at the hole, concrete and core
walls stop.
*Exit:* G11 genuine runtime eye rows 0; the R3 unshootable-surface sweep at 0 for this arena;
no new invisible walls on the beach or jungle routes.

**L6 — layout-stage close.** G13 derived rosters green **with the card still parked**. G16
`diff-arena-viewpoints` against the L0 baseline: **no `REGION_CHANGED` on any other arena** —
a gain here that costs a regression there is a rejected round.

---

## 8. Build order — dressing stage

Owner: Opus, chained on the layout branch. Each step is one bounded correction per cycle:
capture → tier-0 precheck → critics → journal. The card still does not move.

**D0 — reference sets (not delegable to Flash).**
Four subjects under `docs/reference-sets/`, contract `reference-set-v1`, image cache under
`artifacts/reference-cache/` (gitignored); provenance and measurements committed, images not.
T2 = our own capture, T3 = permissively licensed real-world photography, with a resolving
fetch receipt (status, bytes, served content-type, sha256, pixel dimensions) per source.
**No game frame grab anywhere, at any tier.**

| Subject | Must contain | Feeds |
|---|---|---|
| `farcrysis-beach-and-lagoon` | wet sand at grazing sun, dry sand at 1 m, waterline foam, shallow lagoon over pale sand at two depths | sand families, water absorption tint, foam |
| `farcrysis-jungle-canopy` | canopy from below against sky, understory in shade, palm trunk at 0.5 m, fronds backlit | foliage translucency, shade colour, bark |
| `farcrysis-concrete-ruin` | weathered board-formed concrete, rebar staining, a spalled edge, moss/algae at the damp line | the core's material family |
| `farcrysis-corroded-steel` | painted steel with rust bloom, a corrugated sheet, a shipping-crate corner | drums, crates, tower, dish |

*Exit:* every source resolves; every load-bearing number has two sources and a published
agreement %; no UNKNOWN-licence source.

**D1 — the surface vocabulary on `surface-forge`.**
One material per family, authored **in millimetres and measured**, through
`src/rendering/surface-forge.ts` (`SurfaceDescription`, `forgeSurface`, `sharedSurfaceMaps`,
`surfaceStandardMaterial`, `MICRO_TILE_METRES = 0.25`). Per-instance tint and per-object UV
offset instead of a new material per variant — *a new material is a new draw call even if it
is "just a map"*. Starting ranges (ranges, not gospel; every row is one of the ≤ 110):

| Family | Type | roughness | metal | clearcoat / cc-rough | note |
|---|---|---|---|---|---|
| Dry sand | Standard | 0.94 × map | 0 | — | albedo step, not roughness-only; ±1.5 % macro tone |
| Wet sand (waterline band) | Physical | 0.35 × map | 0 | 0.25 / 0.35 | ~18 % albedo darkening, not a gloss trick |
| Coral rubble / shingle | Standard | 0.88 × map | 0 | — | 20–80 mm is the readable scale |
| Weathered concrete | Standard | 0.90 × map | 0 | — | board-form lines at a true 150 mm pitch; spall is geometry |
| Rebar stain / algae damp line | map on concrete | — | — | — | a 10–30 % **albedo** step, never roughness-only |
| Painted steel, worn | Standard | 0.55 × map | 0.15 | — | `0x383838` floor for dark paint, never `0x141414` |
| Corroded steel / rust bloom | Standard | 0.82 × map | 0.3 | — | rust is an albedo family, not a normal map |
| Palm bark | Standard | 1.0 × map | 0 | — | anisotropic noise along the trunk axis |
| Frond / broadleaf | Physical | 0.62 | 0 | 0.1 / 0.4 | thin-surface translucency; cards MID/FAR only |
| Undergrowth tuft | Standard | 0.85 | 0 | — | 3-blade Bezier cluster geometry, one node graph |
| Lagoon surface | see D2 | — | — | — | one spectrum, two consumers |
| Crate ply / canvas tarp | Standard | 0.88 × map | 0 | — | penetration class from R3 |

**Wear has three scales and a photograph shows all three:** 0.5–1.5 mm grain, 20–80 mm
scuffs and blooms, 0.5–3 m traffic and weathering gradients. One scale is a CG tell — and
one scale is exactly what the arena has today, which is the honest technical translation of
"the textures are a mess".

**Anti-tell checklist:** razor-sharp shadows everywhere; uniform gloss; cracks drawn dark
instead of built as geometry; no contact shadows; missing bounce; perfect edges and perfect
alignment; uniform dirt; noise at one scale only; sun colour too orange.
**Traps that each cost a rev:** canvas row 0 is `v = 1` (anything authored at a height must
be drawn at `(1 − v) * size`); `ImageBitmap` uploads ignore `flipY` / `premultiplyAlpha`;
`new THREE.Color(r,g,b)` with floats is **linear** since r152; wear that lives only in
roughness is invisible.

**D2 — water on the `threejs-webgpu-water` contract.**
One deterministic spectrum module; **the CPU/GPU parity assertion is written before the
shader**. TSL displacement + analytic normal on the GPU; `sample(x, z, t)` on the CPU for
buoyancy, swim state, VFX and audio — never tune visual waves and physics waves
independently. Colour by **Beer-Lambert absorption** over the measured lagoon depth, not a
tinted plane. Persistent breaking foam at the shoreline band; **reuse** the existing shore
ramp `(chebyshev − 15) / 22`, do not author a second one. Swimmable volume through
`src/water/swim-state.ts`. Respect `presentationOwner: 'arena-builder'` deliberately: the
HF-358 history in `water-authoring.ts` records that a naive registration built a second ocean
20 mm below the real one and put ~2.36 m swells over a 1.6 m eye height.

**D3 — vegetation on `threejs-procedural-vegetation`.**
Fibonacci lattice, trunk/canopy split meshes, per-instance jitter; **cluster geometry** —
merge N blades/cards into one instance for N× density at the same instance count. Solid
procedural geometry inside ~25 m, merged cards for MID/FAR fill. Stay inside
`TSL_FOLIAGE_MAX_DISTINCT_GRAPHS = 16`. The vegetation layer keeps deriving spawn keep-outs
from `farcrysis-constants.ts` — never a second copy.

**D4 — lighting rig, derived not tuned.**
`EV100 = log2(N²/t) − log2(ISO/100)`, `L_sat = 1.2·2^EV100`, `exposure = 1/(L_sat·K)`,
`K = 1e-4`. **Meter on the shaded jungle floor, not the beach**, or the playable half ships
1.5 EV under. Keep the frozen grade order in `src/rendering/filmic-grade-chain.ts` and add
the camera block that derives exposure. Two probes through
`src/rendering/arena-environment-ibl.ts`: sun-off as `scene.environment` for dielectrics,
sun-on as `envMap` for `metalness ≥ 0.9`; **every material belongs to exactly one probe**.
Solve the periodic occluders (canopy dapple, tower grating) analytically per fragment instead
of shadow-mapping them — it removes 99-vs-64 shadow casters and a tuning knob at once.

**D5 — core interior look.** Emissive fixtures carrying the value composition, fog falloff,
decal grime, filmic post, under the skill's readability rules.

**D6 — mid-map re-composition, art half.** Dressing only, against L2's cleared middle. No new
clutter.

**D7 — budget close (GPU-serialized, one browser at a time).**
G6 frame time paired, 3 runs, **p50 ratio ≤ 1.25** and `pipelinesDuringSample === 0` in every
run. G7 admission, 3 runs, contract `farcrysis-admission-evidence-v1`, `contended === false`,
worst pair ratio ≤ 1.60 and **beating 1.297**. G9 stock-flags boot (no
`--enable-unsafe-webgpu`). G10 solo 60 s, zero page and console errors.
**If G6 or G7 misses, the fix is compiling less** — never widening a fence, never re-running
until a number flatters.

**D8 — the critic and readability gates.**
G14: reference-grounded critic loop with probe-token receipts; every row ≥ 85 % on ≥ 2 valid
critics for two consecutive cycles; a `rubric-only` verdict cannot reach the exit gate; a
probe-token mismatch is journalled `INVALID`, never as a score.
G15: capture the deepest-shade sightline at 20 m and measure operator-vs-background
separation above the shipped floor in **both** graphics profiles.
G16: no `REGION_CHANGED` on any other arena.

**D9 — report and the guard patch.** Write the `assert_farcrysis_admission_evidence` +
`farcrysis_guard_red_test` carry-forward patch **into the report**; do not edit a publish
script for a pass this lane does not own.

**D10 — HITL (orchestrator, not the agents).** Local build on `127.0.0.1:4300`, owner plays
it, with a checklist: the middle of the map, the water at the shoreline and from in it, the
core interior, enemy readability in the deepest shade, load time against the other maps, FPS.
**No card flip and no publish before his word** (HF-455).

**D11 — unhide, one commit, last.** `selectable: false → true` in `src/map-selection.ts`,
PROTOTYPE/PREVIEW copy per the owner's word, `multiplayer` left `false`. Re-run G13. The
admission receipt for the built bundle must exist and be current or the publish guard will —
correctly — refuse.

---

## 9. Gate table the build stages are held to

Carried from the 2026-09-04 plan §6, unchanged except where a number is **tightened**.
Every named `scripts/qa/*farcrysis*` script in the table exists on this base
(`collect-farcrysis-admission-evidence.mjs`, `measure-farcrysis-frame-time.mjs`,
`sweep-farcrysis-traversal.mjs`, `verify-farcrysis-ground-contract.mjs`,
`verify-farcrysis-solo-60s.mjs`, and 13 more) — `[VERIFIED by ls]`. So do
`src/rendering/surface-forge.ts`, `filmic-grade-chain.ts`, `arena-environment-ibl.ts` and
`src/water/swim-state.ts` — `[VERIFIED by ls]`.

| # | Gate | Command / file | Pass condition |
|---|---|---|---|
| G1 | Type check | `npx tsc --noEmit` | 0 errors |
| G2 | Farcrysis unit set (25 files) | explicit file list, not a shell glob (Windows/Vitest expanded `src/farcrysis*.test.ts` to **2 files** in the slice-2 review — a green there proves nothing) | all green; no test deleted or weakened |
| G3 | Pipeline budget | `src/farcrysis-webgpu-pipeline-budget.test.ts` (unchanged) | foliage graphs ≤ 16 **and** `distinct.size < keys.length / 4` |
| G4 | Distinct-material ceiling | `src/farcrysis-material-vocabulary.test.ts`, ratcheted downward only | ≤ 110 distinct `customProgramCacheKey()` values across the built arena |
| G5 | Boot cost | `src/farcrysis-boot-cost.test.ts` | unchanged digests or a stated, reviewed re-pin |
| G6 | Frame time, paired | `scripts/qa/measure-farcrysis-frame-time.mjs` via `run-with-preview-server.mjs`, 3 runs, quiet machine | p50 ratio **≤ 1.25** and `pipelinesDuringSample === 0` every run |
| G7 | Admission evidence | `scripts/qa/collect-farcrysis-admission-evidence.mjs --runs 3` | contract v1; `allAdmitted`, `!anyCrashed`, `!anyPageErrors`, `maxMenuPipelines === 0`, `contended === false`, worst pair ratio ≤ 1.60 (beat 1.297) |
| G8 | Publish guard | `assert_farcrysis_admission_evidence` + `farcrysis_guard_red_test` carried into the next `publish_pass<N>.py` | guard fires red on absent / stale-digest / contended / < 3 runs, then passes on the real receipt; **patch written into the report** |
| G9 | Stock-flags boot | `npm run qa:stock-boot` extended to `farcrysis` | menu → Solo → live frame in installed Chrome with **no** `--enable-unsafe-webgpu` |
| G10 | Solo 60 s | `scripts/qa/verify-farcrysis-solo-60s.mjs` | zero page errors, zero console errors |
| G11 | Traversal + eye clearance | `sweep-farcrysis-traversal.mjs`, eye-clearance stages | genuine runtime eye rows **0** (from 25); no new invisible walls |
| G12 | Ground contract / spawn quality | `verify-farcrysis-ground-contract.mjs`, `farcrysis-spawns.test.ts`, `spawn-layout-quality.test.ts` | unchanged green |
| G13 | Derived rosters | `arena-selectability.test.ts`, `arena-switch-matrix-roster.test.ts`, `walkable-surface-parity-gate.test.ts`, `collider-visual-parity-gate.test.ts` | green with the card parked, then green again after the unhide commit |
| G14 | Reference-grounded critic | precheck + 3 critics with probe-token receipts | ≥ 85 % on ≥ 2 valid critics, two consecutive cycles; `rubric-only` cannot reach the exit gate |
| G15 | Combat readability | deepest-shade sightline capture at 20 m | separation above the shipped floor in both graphics profiles |
| G16 | Other-arena regression | `diff-arena-viewpoints.mjs` vs the L0 frozen baseline | no `REGION_CHANGED` on any other arena |
| G17 | HITL (HF-455) | local build on `127.0.0.1:4300` | the owner's word; no card flip and no publish before it |

---

## 10. Open items, collected

1. `[OPEN]` **The owner's verbatim HF-512 wording.** The ledger row is the orchestrator's
   summary; no transcript quote exists in the repository.
2. `[OPEN]` **"The owner spec".** No document by that name exists. §2 assumes the frozen
   `BRIEF.md` is what HF-512 points at, on the reasoning given there. Correct this first if
   wrong.
3. `[OPEN]` **Is the layout in scope?** Raised in the 2026-09-04 plan §9.1 and never
   answered. §6 records the default and the alternative.
4. `[OPEN]` **Material count at `452d7aba`.** 222 (PASS 87 head) and 198→166 (slice branches)
   are other heads. L0 must measure this one.
5. `[OPEN]` **The §3.5 admission discrepancy** between the ledger's 02:10 twelve-pair figure
   and the 03:22 three-pair receipt of a different field. Re-measure; do not inherit either;
   correct the ledger row when the new number exists.
6. `[OPEN]` **Core interior contradiction.** The plan says no floor / no walls / no practical;
   the walls, catwalk, desk and stairs demonstrably exist and a `farcrysis-core-work-lights`
   practical is declared. Whether emissive fixture geometry and a distinct interior floor exist
   is unread. Resolve by reading before L4.
7. `[OPEN]` **`fp-farcrysis-slice-2` landing state.** The forward-port workflow lists it; I did
   not enter that worktree. Check before L1 so the vocabulary work is carried once, not twice.
8. `[OPEN]` **Multiplayer flip.** `multiplayer: false` stays until the owner plays it solo and
   says otherwise; flipping it enters an MP sweep nobody has run against this arena.
9. `[OPEN]` **Post-rebuild card label** (PREVIEW vs PROTOTYPE wording).
10. `[OPEN]` **Reference photography tier.** T2 (our own capture) is strongest; absent it, T3
    CC-licensed photography costs D0 real time. The 2026-09-04 plan §9.2 asks the owner before
    spending it.
11. `[OPEN]` **Priority against the other live lanes** (HITL-7 verdict lanes, the massive
    polish pass, the forward-ports). This is sized as a multi-hour two-agent pass.

---

## 11. Sources

Every reference used, with what it supplied. No external game asset, frame grab or trade
dress was consulted, downloaded or measured at any point in this research stage.

| Source | Read as | Supplied |
|---|---|---|
| `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md` (rows HF-423, HF-426..429, HF-455..457, HF-508, HF-512, PASS 87/89 publish records) | repository ledger, owner quotes verbatim | §1.1–§1.3, §1.6, §3.6 |
| `C:/Users/david/.claude/projects/C--Users-david-Desktop-stuff/memory/atomic-acres-art-lighting-direction.md` | Claude memory, point-in-time | §1.4, and the stale-blocking-fact correction in §3.2 |
| `docs/PASS69_FARCRYSIS_ARENA_SPEC_2026-08-04.md` §0, §1–§5 | original arena spec | §1.5, §3.4 layout intent |
| `docs/research/2026-09-04/FARCRYSIS-rework-plan.md` (505 lines, on `origin/contrib/dave-gaming-pc/claude/research-2026-09-04`) | prior research lane, read in full | §2, §4, §5, §7–§9 |
| `docs/farcrysis-rework/BRIEF.md` (on `…/farcrysis-slice-2`) | the frozen brief | §2.1, §2.2 |
| `docs/evidence/pass94/farcrysis-rework/REPORT.md` (slice 1) | prior lane report | §3.5 census, §3.6 collapse-pass rules, §5.1 menu-precompile refusal |
| `docs/evidence/pass95/farcrysis-slice-2/REPORT.md` + `LUNA-REVIEW.md` | prior lane report + review | §3.6, and the G2 glob warning in §9 |
| `src/map-selection.ts`, `src/arena-selectability.test.ts`, `src/map-selection.test.ts` | current registry and its gates | §3.1, §3.3 |
| `src/farcrysis-constants.ts`, `src/farcrysis.ts`, `src/farcrysis-midmap-landmarks.ts`, `src/farcrysis-tsl-foliage.ts`, `src/rendering/arenas/farcrysis.ts`, `src/water/water-authoring.ts` | current implementation | §3.4, §5.1, §5.2 |
| `scripts/orchestration/publish_pass93.py` | current publish guard | §5.1 |
| Skills named by HF-429 and the plan: `threejs-procedural-vegetation`, `threejs-webgpu-water`, `threejs-webgpu-interior-lighting-look`, `photoreal-procedural-scene-forge`, `atomic-acres-procedural-art-authoring`, `webgpu-tsl-arena-forging` | technique contracts, cited by the plan | §4, §8 |

Real-world reference **photography has not yet been gathered** — D0 is the first step that
does, and it is not delegable.
