# PASS 95 - draw-call and instancing audit, every arena

Lane: `contrib/dave-gaming-pc/claude/v8-draw-call-instancing-audit`
Base: `contrib/dave-gaming-pc/claude/pass93-candidate` @ `452d7aba` (candidate 7)
Machine: `dave-gaming-pc` - Skill: `threejs-frame-loop-audit`
Assigned browser port: 4264 (not used - see "What was not done and why")

Claim-states: **[VERIFIED]** = I ran it and the output is quoted here.
**[MEASURED]** = a number from an instrument I ran. **[OPEN]** = not proven.

---

## Headline

**[MEASURED] The arenas are already well batched and well instanced.** The
authored graphs are large - 104 to 540 meshes - but the runtime static batch
(`batchStaticMeshes`) collapses 39-95 % of them before the first frame, and
Farcrysis and Nuke Town already push their repeats through `InstancedMesh`
(92,630 and 9,783 instances respectively). There is no unmerged-static-mesh or
non-instanced-repeat offender left that is both large and safe to fix inside
this time box.

So the deliverable this lane leaves behind is **measurement plus a ratchet**,
not a rewrite: three reusable instruments, a per-arena submitted-draw budget
test derived from the measured numbers, and a named, evidence-backed list of
the offenders that remain - with the reason each was **not** touched.

**No runtime `src/` behaviour was changed.** The only `src/` additions are
`arena-draw-call-budget.ts` (a table plus a pure counting function, imported by
nothing in the game) and its test. The "0 new in-combat pipelines" and "no
cold-transition addition above 300 ms" conditions therefore hold by
construction; they are stated as such below and not claimed as measured.

---

## Instruments added

| Path | What it answers |
|---|---|
| `scripts/qa/audit-arena-draw-calls.mts` | Per arena: draw calls, triangles, geometries, materials, textures, mipmap/oversize flags, shadow casters/receivers, instancing, residual `matrixAutoUpdate` nodes - **both as authored and as actually submitted** |
| `scripts/qa/audit-arena-draw-call-offenders.mts` | For each draw that survived the static batch, *why* the batcher refused to merge it |
| `scripts/qa/audit-arena-residual-auto-matrices.mts` | Which nodes still pay the r185 per-frame matrix recompose after `freezeStaticArenaMatrices` |
| `src/arena-draw-call-budget.ts` + `.test.ts` | The ratchet: per-arena submitted-draw budget, roster derived from `ARENA_IDS` |

### Why the measurement is in Node and not in a browser

The counts above are properties of the scene graph the arena builder returns,
not of a GPU. Counting them in Node is deterministic, reruns in 8.3 s, and can
be asserted by a unit test that runs on every commit. A browser
`renderer.info.render.calls` reading is a *confirmation* of this walk, not its
source - and on this machine, shared with ComfyUI and about fifteen other lanes,
it is also the noisiest possible instrument. The instrument counts the way a
renderer counts: one draw per visible mesh, an `InstancedMesh` is one draw, a
`THREE.LOD` is one draw at the level the review station selects, and meshes the
batcher left `visible = false` are **not** counted - counting the hidden batch
sources is how a "batching saved N draws" claim gets silently reversed.

---

## The measured table

**[MEASURED]** `npx tsx scripts/qa/audit-arena-draw-calls.mts` at `452d7aba`.
Raw JSON: `measured.json` (identical to `baseline.json` - see "Before/after").

*Authored* = the graph the builder returns. *Submitted* = after
`batchStaticMeshes(root, root, () => '', 'preserve')` and
`freezeStaticArenaMatrices(root)` - the exact pair the arena transition runs at
`legacy-main.ts:36993` and `legacy-main.ts:30173`, on the owner's default
Quality (`blender`) profile.

| Arena | Authored draws | Submitted draws | Collapse | Triangles | Geometries | Materials | Textures | Instanced meshes / instances | Shadow casters | Nodes frozen | Residual auto-matrix nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `nuketown2` | 538 | **95** | 82 % | 295,033 | 79 | 63 | 0 | 16 / 9,783 | 38 | 990 | 153 / 1,128 |
| `raid2` | 216 | **10** | 95 % | 2,592 | 10 | 10 | 0 | 0 / 0 | 5 | 227 | 0 / 227 |
| `atomic-acres` | 277 | **53** | 81 % | 7,184 | 53 | 17 | 28 | 0 / 0 | 44 | 255 | 94 / 365 |
| `skyline-terminal` | 277 | **57** | 79 % | 12,110 | 57 | 50 | 0 | 1 / 2 | 30 | 912 | 1 / 919 |
| `rustworks-1v1` | 104 | **19** | 82 % | 3,666 | 19 | 19 | 6 | 0 / 0 | 14 | 307 | 17 / 324 |
| `gun-range` | 230 | **141** | **39 %** | 9,982 | 140 | 97 | 0 | 0 / 0 | 50 | 241 | 127 / 397 |
| `farcrysis` | 540 | **182** | 66 % | 795,118 | 164 | 167 | 9 | 101 / 92,630 | 92 | 505 | 352 / 1,113 |
| `high-seas` | 260 | **42** | 84 % | 5,716 | 42 | 15 | 40 | 0 / 0 | 38 | 247 | 0 / 275 |
| `test1` | 296 | **24** | 92 % | 16,760 | 24 | 23 | 0 | 5 / 510 | 17 | 314 | 10 / 325 |
| `test2` | 401 | **30** | 93 % | 15,756 | 30 | 25 | 0 | 11 / 438 | 17 | 409 | 14 / 424 |

`map3` is not in the table: it is the registry's only lazy arena and its builder
initialises the Rapier wasm through an asynchronous `prepareMap3()`, so it
cannot be built by a synchronous Node gate. It is an explicit, reasoned
exemption in `DRAW_CALL_BUDGET_EXEMPT`, not an omission.

**[MEASURED] Textures.** Zero textures without mipmaps and zero textures over
1024 px were found on any arena. Most arenas report 0 textures because their
surfaces are procedural or vertex-coloured; `high-seas` (40), `atomic-acres`
(28) and `farcrysis` (9) carry the authored ones. In Node the authored images
are never decoded (`art-kit.ts` returns a bare `THREE.Texture` when `document`
is undefined), so **the oversize check is [OPEN] in Node** and would need the
browser harness to be conclusive. The mipmap and filter flags *are* real,
because they are set at construction.

---

## Top offenders, named

### 1. `gun-range` - 141 submitted draws, the worst collapse ratio in the game

**[MEASURED]** `npx tsx scripts/qa/audit-arena-draw-call-offenders.mts gun-range`:

```text
gun-range: surviving visible draws by refusal reason
  targetRoot               82
  batch-output             30
  dynamic-ancestor         29

top surviving draw owners (reason:name):
    30  batch-output:Acres Indoor Gun Range arena-render-batches
    15  targetRoot:gun-range-scoring-target
    15  targetRoot:range-bullseye
     6  targetRoot:50-point-range-plate
     3  targetRoot:100-point-range-plate
     3  targetRoot:200-point-range-plate
     3  targetRoot:300-point-range-plate
     2  targetRoot:gun-range-lateral-target-plate
     2  targetRoot:flying-black-cat-ear
     2  targetRoot:flying-black-cat-eye

distinct surviving material VALUES: 50
```

**The finding:** 82 of the 141 draws are `userData.targetRoot` meshes - 15
scoring targets, each a small stack of identical parts, that opt out of the
static batch because they must keep individual identity for scoring and
movement. Textbook `InstancedMesh` candidates: fifteen copies of one geometry
with one material.

**Why it was not fixed here [OPEN]:** the targets move and change state
individually, and the scoring path holds direct `Object3D` references to them
(`targetRoot`). Converting them to per-instance matrices is a change to the
scoring, hit and animation paths - gameplay code, not art - and there is no way
to prove it safe inside this time box without the browser gauntlet. It is the
single largest remaining draw-call win in the game (about 82 draws down to
about 8) and is the right first task for a follow-up lane. The bullseye and
plate parts in particular are pure presentation and could be instanced without
touching scoring identity at all.

### 2. `farcrysis` - 182 draws, but the instancing is already right

**[MEASURED]** offenders: `instanced 101`, `batch-output 81`. The 101 are one
draw each for `farcrysis-gameplay-palm-trunks`, `-fronds`, `-coconuts`,
`-canopy-crown-*`, `-jungle-bushes`, `-instanced-ferns`, and the throwback and
interactable drum/crate/log/boulder/sandbag families - 92,630 instances in 101
draws. That is the vegetation system working as designed. **No finding.** The
795,118 triangles are the real cost on this arena, not the draws.

### 3. `nuketown2` - 143 static-candidate meshes still recomposing every frame

**[MEASURED]** `npx tsx scripts/qa/audit-arena-residual-auto-matrices.mts nuketown2`:

```text
nuketown2: nodes still matrixAutoUpdate after batch + freeze
    143  static-candidate:mesh
         e.g. nuketown2 street-vehicle truck cab, ... truck bumper front,
              ... truck grille, ... truck windshield, ... truck headlight -1
     16  DYNAMIC-SUBTREE:mesh   (window glass - correctly dynamic, breakable)
      3  static-candidate:Group (Nuketown2 arena, nuketown2-lawn, nuketown2-vegetation)
      2  DYNAMIC-SUBTREE:Group  (forest surround, mountain backdrop)
```

`freezeStaticArenaMatrices` (HF-491) freezes only LOD subtrees,
`*-render-batches` groups and `staticBatchRendered` sources. The residue is
exactly the set `batchStaticMeshes` refused: `targetRoot`,
`pass73CollisionVisualOwner`, multi-material and instanced meshes. Across the
roster that residue is **[MEASURED]** farcrysis 352, nuketown2 153, gun-range
127, atomic-acres 94, rustworks-1v1 17, test2 14, test1 10, skyline-terminal 1,
raid2 0, high-seas 0 - against 1,113 / 1,128 / 397 / 365 total nodes.

**Why it was not fixed here [OPEN]:** the tempting fix is to broaden the freeze
to "every node without a `userData.dynamic` ancestor". That is wrong, and the
evidence above says why: the residue includes `gun-range-test-dummy-alpha-torso`
and the Nuke Town street-vehicle parts - things that *are* moved at runtime by
systems that never marked them dynamic, because they were never batched either.
Freezing them would silently stop them moving, which is precisely the failure
mode this repository's rules exist to prevent. A correct fix marks each residual
family static or dynamic deliberately, one family at a time, each with its own
falsifier. That is a lane, not a line.

### 4. Duplicate materials - real, but they do **not** cost draws

**[MEASURED]** authored duplicate-material waste: `skyline-terminal` 68,
`gun-range` 57, `farcrysis` 35, `nuketown2` 11, `test2` 5, `atomic-acres` 4,
`test1` 2, `rustworks-1v1` 1.

**The correction to the obvious reading:** `batchStaticMeshes` keys its batches
on `materialBatchKey(material)` - a *by-value* JSON key, not object identity
(`art-kit.ts:73`). Two distinct material objects with identical values already
merge into one batch and one draw. So this figure is a GPU-memory and
material-object-count finding, **not** a draw-call finding, and fixing it would
not move a single number in the table above. It is recorded here so a later lane
does not spend a day on it expecting draws back.

### 5. Shadow casters

**[MEASURED]** submitted casters: farcrysis 92, gun-range 50, atomic-acres 44,
high-seas 38, nuketown2 38, skyline-terminal 30, test1 17, test2 17,
rustworks-1v1 14, raid2 5. After batching these are batch outputs - one caster
per material group - which is the correct shape. **No finding.** The `blender`
profile's `shadowMode: 'static'` means they are not re-rendered per frame
anyway.

---

## The per-arena draw-call budget (deliverable 4)

`src/arena-draw-call-budget.ts` + `src/arena-draw-call-budget.test.ts`.

**The headroom rule, published and executable:**
`budget = roundUpTo5(measured + max(10, ceil(measured * 0.15)))`.
Ten draws is the smallest addition a real authoring change makes (a prop with
its own material); 15 % is the ceiling the existing Nuke Town frame-loop audit
already uses. Both are deliberately generous: this gate exists to fail on a
threefold regression, not to police a prop. A second assertion fails if an arena
drops below 60 % of its recorded measurement - a large *improvement* also means
the ratchet has gone slack and the row must be re-measured downward.

| Arena | Measured | Budget |
|---|---:|---:|
| `nuketown2` | 95 | 110 |
| `raid2` | 10 | 20 |
| `atomic-acres` | 53 | 65 |
| `skyline-terminal` | 57 | 70 |
| `rustworks-1v1` | 19 | 30 |
| `gun-range` | 141 | 165 |
| `farcrysis` | 182 | 210 |
| `high-seas` | 42 | 55 |
| `test1` | 24 | 35 |
| `test2` | 30 | 40 |

**The roster is derived, never listed.** `budgetedArenaIds()` reads `ARENA_IDS`
from `src/arena-identity.ts` and subtracts only the documented `map3` exemption;
the first test fails if any registry arena has no budget row and no builder
wired in. That is the failure this repository has actually shipped at least
three times (`scripts/qa/arena-roster.mjs` records all three), so the floor is
asserted as well as the membership. A third test holds every row to the headroom
rule, so the table cannot silently drift away from its own stated policy.

**A budget is raised only by a measurement, never by a failure.** The assertion
message says so, and so does the module header.

---

## Before / after

**There is no "after" that differs from "before", and that is the honest
result.** No runtime code was changed, so `baseline.json` and `measured.json`
are identical apart from build timings. Both are committed: `baseline.json` is
the first run, `measured.json` the confirming re-run after the review-station
table was deduplicated into `src/arena-draw-call-budget.ts`. Identical numbers
across that refactor is the evidence that the refactor changed nothing.

| Arena | Submitted draws before | after | delta |
|---|---:|---:|---:|
| `nuketown2` | 95 | 95 | 0 |
| `raid2` | 10 | 10 | 0 |
| `atomic-acres` | 53 | 53 | 0 |
| `skyline-terminal` | 57 | 57 | 0 |
| `rustworks-1v1` | 19 | 19 | 0 |
| `gun-range` | 141 | 141 | 0 |
| `farcrysis` | 182 | 182 | 0 |
| `high-seas` | 42 | 42 | 0 |
| `test1` | 24 | 24 | 0 |
| `test2` | 30 | 30 | 0 |

A zero-delta table with a ratchet under it is a better hand-over than a non-zero
one that could not be proven safe. Every candidate fix found either changes
gameplay identity (the gun-range targets) or risks silently freezing something
that moves (the matrix residue); both are named above with their evidence, so
the next lane starts from a measurement instead of a hunch.

---

## Gates

| Gate | Claim | Result |
|---|---|---|
| `npx tsc --noEmit` | **[VERIFIED]** | exit 0, no output |
| `npx tsx scripts/qa/find-coplanar-pairs.ts` | **[VERIFIED]** | `boxes=950 - pairs<=0.03m: 288 - FINDINGS (different materials, no offset): 0 - FENCED: 274 - SAME-MATERIAL-VISIBLE: 0 - CONTACT: 4 - SAME-MATERIAL (benign): 10`; HOUSE-INTERIOR 0, STREET 0, HF-497 0 - identical to candidate 7 |
| named gate set (`pipeline-metrics*`, `graphics-profile-contract`, `cold-session-precompile-reach*`, `legacy-main-size-ratchet`, `arena-draw-call-budget`) | **[VERIFIED]** | `Test Files 4 passed (4) - Tests 32 passed (32)` |
| `npx vitest run src/arena-draw-call-budget.test.ts` (the new gate alone) | **[VERIFIED]** | `Test Files 1 passed (1) - Tests 12 passed (12)`, 41.3 s |

**Note on `cold-session-precompile-reach*.test.ts`:** that glob matches no file
at this head (`ls src/ | grep cold-session-precompile` is empty), which is why
the gate set reports 4 files and not 5. The glob was left in the command
verbatim rather than quietly dropped, so the discrepancy is visible here.

**Heavy-work lock.** The machine lock
(`C:/Users/david/AppData/Local/Temp/aa-heavy.lock`) was held by another lane
from 07:07. The first `until mkdir` wait spun for a full ten-minute command
window without acquiring it, and the lock was then 23 minutes old - inside the
35-minute staleness threshold - so breaking it would have corrupted another
lane's run. It was not broken, the heavy steps were not run outside it, and the
wait was not weakened. The heavy-gate results are recorded in `heavy-gates.md`
beside this report.

---

## What was not done, and why

- **No browser run on port 4264.** The static counts do not need one, and the
  time the lock consumed left no room for a bounded, hard-killed session inside
  the four-minute rule. The browser confirmation of
  `renderer.info.render.calls` against this walk stays **[OPEN]**.
- **No per-frame CPU measurement at the review stations.** Same reason. The
  existing `scripts/qa/audit-nuketown2-frame-loop.mts` already measures the Nuke
  Town frame hook in Node (one entry point,
  `root.userData.nuketownLawnWind`); this lane did not extend that to the other
  arenas.
- **No fix applied.** Both candidate fixes are documented above with the exact
  evidence that makes them unsafe to land blind.

## Suggested next lane, in priority order

1. **Instance the `gun-range` target presentation parts** (`range-bullseye`,
   the four plate families, the cat parts) while leaving the 15 scoring roots as
   individual identities. About 82 draws down to about 25, with no scoring-path
   change.
2. **Classify the residual auto-matrix families** one at a time (`nuketown2`
   street vehicles, `gun-range` test dummies, `farcrysis` palm collision
   visuals), marking each static or `userData.dynamic` deliberately, with a
   falsifier per family.
3. **Extend `audit-arena-draw-calls.mts` with a browser mode** that reads
   `renderer.info` at each authored review station and asserts agreement with
   the Node walk, so the budget gate gains an end-to-end confirmation.
