# PASS 94 - FARCRYSIS rework, SLICE 1

**Lane:** FARCRYSIS (implementation). **Agent:** Claude Opus 5.1, 2026-09-04.
**Worktree:** `C:\Users\david\projects\aa-claude-fc`.
**Branch:** `contrib/dave-gaming-pc/claude/farcrysis-rework`, cut from
`origin/contrib/dave-gaming-pc/omp/pass84-overnight` @ `c3ba5028`.
**Plan:** `C:\Users\david\projects\aa-claude-research\docs\research\2026-09-04\FARCRYSIS-rework-plan.md`
(read in full). **Brief:** frozen at `docs/farcrysis-rework/BRIEF.md`.

**Card state: PARKED.** `selectable: false` is untouched and stays untouched. Nothing in this
slice makes the arena selectable, so the publish admission guard is not yet being asked for
paired admission evidence to admit a visible card. The receipt below is the lane's **own**
baseline, taken at this head so later slices measure against it rather than inheriting the
02:10 / 03:22 discrepancy the plan's section 1 records as OPEN.

**Claim-state key.** `VERIFIED` = ran the command or read the file in this session and quote
what it said. `CLAIMED` = asserted elsewhere, not independently measured here. `OPEN` = named
as unknown.

---

## 1. The brief's first instruction, against what the plan permits

The lane brief asked for "menu-time precompile of every pipeline the rework needs".
**That is forbidden by the plan's own gate and by AGENTS.md, and it is not what the plan
prescribes.** Saying so rather than building it:

- Plan section 5.2, Menu row: *"shared retained-asset TSL/HDR pipeline only, one fenced
  isolated submission"*, with `menuPipelines` **0** for the arena.
- Plan section 5.1: *"The menu must construct zero gameplay arenas and `maxMenuPipelines` must
  stay 0."*
- AGENTS.md, HUD and menu forging (VERIFIED, quoted): *"Browsing the menu must construct zero
  gameplay arenas and run zero live preview rendering or physics. Only after the selected
  video's first frame is visible may one fenced, isolated submission compile the retained-asset
  TSL/HDR pipeline; it must not attach an arena root, render a gameplay scene, recur, or
  compete with the preview decoder."*

Compiling the arena's pipelines at menu time requires constructing the arena at menu time.
`maxMenuPipelines === 0` is a term of the admission-evidence contract, not a preference. The
shared retained-asset menu compile that IS permitted already exists on this branch, and the
receipt below confirms it still costs the arena zero menu pipelines
(`maxMenuPipelines: 0`, VERIFIED).

What the plan actually asks for in the admission budget is **section 5.3: compile less**, in
the order the levers pay. Lever 1 is the material vocabulary. Lever 1 is what this slice landed.

---

## 2. What changed

### 2.1 The measurement that set the target

`docs/evidence/pass87/lane-r/frame-time-at-head.json` (paired, same browser launch, quiet
machine): farcrysis **222 distinct materials** vs atomic-acres **110**; p50 frame 18.2 ms vs
13.6 ms. The previous lane named that as the lever and explicitly did not attempt it.

**VERIFIED, measured here** over `buildFarcrysis(scene)` in the deterministic unit environment:

| | at `c3ba5028` | after this slice |
|---|---|---|
| meshes | 990 | 990 |
| **distinct material objects** | **198** | **168** |
| distinct render-state signatures | 14 | 14 |

198 material objects for 14 genuinely different draw states. Worst offenders before the change:
`farcrysis-detail-rock-N` 11, `farcrysis-throwback-seaplane` 8,
`farcrysis-crate-N-shards-shard-M` 8, `farcrysis-atmos-god-ray-shaft-N` 7,
`farcrysis-art-tiki-post` 4, `farcrysis-art-tiki-band-N` 4.

### 2.2 src/farcrysis-material-vocabulary.ts (new) - the collapse pass, -20

One pass at the **end** of the build replaces exact-duplicate `MeshStandardMaterial` objects
with a single shared representative. Two materials merge only when their complete render state
is already identical, texture identity included, so the renderer cannot tell before from after.
Zero visual change **by construction**, not by inspection.

Four rules, each written against a hazard that was found first and then ruled out:

1. **`MeshStandardMaterial` by exact `type`.** `instanceof` would also have merged
   `MeshPhysicalMaterial` twins and lost transmission / clearcoat with them (the core's station
   glass). Node materials carry TSL graphs the key cannot see - their budget is
   `TSL_FOLIAGE_MAX_DISTINCT_GRAPHS` and its own gate (G3). And every farcrysis material
   mutated **per frame** (god-ray shaft opacity, foam rings, caustics, edge ripples, sun
   glitter, fireflies) is a `MeshBasicMaterial` or a `PointsMaterial` - VERIFIED by reading
   every `.material as THREE.Mesh*Material` write in `src/farcrysis-*.ts`. Excluding both
   classes excludes, mechanically, every material whose object identity is load-bearing after
   the build.
2. **It runs LAST, after every name-keyed mutator.** `applyFarcrysisTextures` assigns maps
   through a name classifier; `applyFarcrysisShadeLift` writes `emissive` from name patterns.
   VERIFIED by measurement: a key taken *before* classification merges **5** groups it must not
   (`[bark,none]`, `[rock,none]`, `[none,rock,bark]`, `[crate,none]`, `[leaf,none]`); the same
   key taken *after* merges none of them, because by then those differences are in the render
   state.
3. **Texture identity is in the key**, not "has a map".
4. **Nothing is disposed.** A dropped duplicate may still be held by a module-level capture and
   has never been uploaded to the GPU at that point in the build, so GC is its correct owner.

### 2.3 src/farcrysis-detail.ts - the rock family, -10

Eleven scattered stones owned eleven materials differing in nothing but `color`. The tint moves
off the material and onto the geometry as vertex colours: `vertexColors: true` makes three
multiply material colour by vertex colour, and white times the old per-rock grey is the old
per-rock grey exactly. `new THREE.Color(hex)` already converts sRGB to the working linear
space, so there is no second conversion (the usual way this idiom is got wrong). Every mesh in
the family is named `farcrysis-detail-rock-N`, so all eleven classify identically for the rock
PBR maps, which still multiply on top as before.

### 2.4 src/farcrysis-material-vocabulary.test.ts (new) - gate G4

A **one-way ratchet** at **168** with a `CEILING_HISTORY`, in the style of
`src/legacy-main-size-ratchet.test.ts`. Growth of one material object reds it; removal never
fails. Four more assertions beside the count:

- a **fixed-point check** - a second collapse pass over the built arena must merge **0**, which
  catches the hook being deleted *or moved earlier*;
- **rule 1 tested directly** on a synthetic scene: Basic, Points and Physical twins must survive
  untouched, Standard twins must merge;
- a **render-state signature ceiling** at 14, so the 168-to-14 gap cannot widen;
- a **source pin** on the ordering rule, in the style of
  `src/presentation-prewarm-contract.test.ts`.

**The plan asked for G4 red-first at the measured number; it landed as a ratchet instead.** A
knowingly-red gate on a shared branch teaches contributors to ignore red - the exact failure
`legacy-main-size-ratchet.test.ts` already documents in this repository. The **110 parity target
is not weakened by that**: it is a named constant in the test, it is quoted here, and it stays
**OPEN** until it is met.

### 2.5 Shared lines touched

Outside my own new modules and `src/farcrysis-detail.ts`, exactly two edits, both in
`src/farcrysis.ts`:

- line 10, one `import` of `collapseFarcrysisMaterialVocabulary`;
- one call plus its comment block, as the last statement before `buildFarcrysis` returns:
  `root.userData.farcrysisMaterialVocabulary = collapseFarcrysisMaterialVocabulary(root);`

No `src/legacy-main.ts` edit. **No nuketown2 file touched.** No test weakened, none deleted.

---

## 3. Gates

| # | Gate | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | **0 errors** (no output) |
| G2 | farcrysis unit set | `Test Files 26 passed (26) / Tests 176 passed (176)` - the 25 pre-existing files plus the new G4 file |
| G3 | `src/farcrysis-webgpu-pipeline-budget.test.ts` (unchanged) | green |
| G4 | `src/farcrysis-material-vocabulary.test.ts` (new) | `Test Files 1 passed (1) / Tests 5 passed (5)` |
| G5 | `src/farcrysis-boot-cost.test.ts` | green, digests unchanged |
| G7 | admission evidence, 3 paired runs | see below |
| G6, G9-G17 | not run this slice | **OPEN** - see section 5 |

**G2 note.** On a fresh worktree two of the 25 pre-existing files
(`farcrysis-shore-audit`, `farcrysis-elev-probe`) fail with
`ENOENT ... artifacts\elev-probe.json` because they are diagnostics that write into an
untracked `artifacts/` directory. Create it and they pass. Pre-existing, not caused by this
slice, and worth a follow-up so a clean checkout is green.

### G7 - admission evidence, VERIFIED

`PASS73_NATIVE_WEBGPU=1 node scripts/qa/collect-farcrysis-admission-evidence.mjs --dist dist --runs 3 --out docs/evidence/pass94/farcrysis-rework/farcrysis-admission.json`

Machine rule honoured: the run waited **13 polls at 60 s** for another lane's headless Chrome to
finish before launching (`[poll 14] headlessBrowsers=0 gpuFreeMiB=14171 comfyBusy=False`), one
browser at a time, ComfyUI queue empty at every launch.

```
wrote C:\Users\david\projects\aa-claude-fc\docs\evidence\pass94\farcrysis-rework\farcrysis-admission.json
  all admitted: true; max menu pipelines: 0; worst farcrysis/atomic-acres pair ratio: 1.2372
```

| field | value |
|---|---|
| contract | `farcrysis-admission-evidence-v1` |
| measuredAt | `2026-09-04T13:08:50.601Z` |
| sha / bundle sha256 | `87acde4f` / `bf057149ec2f2598db085bc7dcfe819a826c73799d2eb9a234e75bf009f9e815` (47 files) |
| runs | 3 paired |
| `contended` | **false** - "no ComfyUI work queued at any launch" |
| `allAdmitted` | **true** |
| `anyCrashed` / `anyPageErrors` | **false** / **false** |
| `maxMenuPipelines` | **0** |
| farcrysis selectToAdmitted | mean **38,501 ms**, max 40,338 |
| atomic-acres selectToAdmitted | mean **33,307 ms**, max 33,801 |
| pair ratios | 1.0798, 1.1537, **1.2372** |
| **worst pair ratio** | **1.2372** (ceiling `FARCRYSIS_ADMISSION_RATIO_CEILING = 1.60`) |

Against the PASS 87 receipt's worst pair ratio of **1.2971**. **CLAIMED, not VERIFIED, that
this slice caused the difference** - the two receipts are different machine windows, and I did
not run a same-window A/B against the pre-slice bundle. What is VERIFIED is that this head
measures 1.2372, uncontended, on its own bundle digest.

**OPEN - a drift inside the run, named rather than smoothed.** The three farcrysis runs got
monotonically slower (36,498 to 38,667 to 40,338 ms) while atomic-acres stayed flat (33,801 to
33,516 to 32,604), so the pair ratio climbs across the run and the *worst* pair is the last one.
That is a within-run trend, not noise around a mean. A later slice that re-measures should take
more than three pairs, or alternate the starting arena, before trusting a small improvement.

---

## 4. Deferral of non-critical work - designed, not landed

Plan section 5.2 row 3 wants detail-tier decals, the distant-band card material and the
rain-damp variant compiled in post-admission safe windows behind a synchronous fallback, citing
the `admission-rehearsal-scope` pattern. **VERIFIED: that pattern is not on this branch** -
`src/weapon-rehearsal-scheduler.ts` does not exist here, exactly as the plan's own CLAIMED note
warned.

It is also not a small change. `withArenaFrustumCullingDisabled(scene, ...)` forces **every**
renderable through the fenced coverage submission by design, so "defer" means not attaching
those objects to the arena root until after admission - which changes what the coverage draw
proves. Landing half of that is worse than landing none: it would move work off the fence while
quietly weakening the guarantee the fence exists to give. Deferred to its own slice, with the
scheduler and its synchronous fallback written first and gated.

---

## 5. OPEN

1. **The 110 parity target.** 168 today. The remaining mass is structural, not duplication:
   **65 `farcrysis-vege-*` layers each own one material**, and 83 node materials sit behind
   them. Collapsing those needs per-instance tint on a shared family material - `instanceColor`
   is already written by `varyInstanceColors` / `varyPalmInstanceColors`, so the mechanism
   exists - and it is the vegetation slice, not this one.
2. **G6 frame time** (p50 ratio, target tightened to 1.25 from the measured 1.64 median) not
   re-measured at this head. The material cut should help it more than it helps admission, and
   it is the number the owner actually feels.
3. **G9 stock-flags boot, G10 solo 60 s, G11 traversal and eye clearance, G14 critic loop, G15
   combat readability, G16 cross-arena regression diff, G17 HITL** - none run this slice.
4. **The plan's section 9 questions are still unanswered by the owner**, in particular whether
   "total" includes the *layout*. This slice is layout-neutral, so nothing here forecloses
   either answer.
5. **Pre-existing:** `farcrysis-shore-audit` and `farcrysis-elev-probe` need an `artifacts/`
   directory that no fixture creates.
6. **Within-run admission drift**, section 3.

---

## 6. Reproduce

```
cd C:\Users\david\projects\aa-claude-fc
npx tsc --noEmit
npx vitest run src/farcrysis-material-vocabulary.test.ts
mkdir artifacts
npx vitest run $(ls src/farcrysis*.test.ts)
npm run build
PASS73_NATIVE_WEBGPU=1 node scripts/qa/collect-farcrysis-admission-evidence.mjs \
  --dist dist --runs 3 --out docs/evidence/pass94/farcrysis-rework/farcrysis-admission.json
```

Machine preconditions before the last command: `curl -s http://127.0.0.1:8188/queue` shows both
lists empty, `nvidia-smi` shows at least 3000 MiB free, **no other headless Chrome is running**
(poll, do not assume), headless only, one at a time, never on the owner's main screen.
