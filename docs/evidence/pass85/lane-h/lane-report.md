# Lane H — HF-417 Gun Range switch failure + load-time deep cut (PASS 85)

Worktree `C:/Users/david/projects/aa-claude-loadcut`, branch
`contrib/dave-gaming-pc/claude/load-time-deep-cut`, base `c13ec02c`
(VERIFIED: `git diff --stat 75a4e508 c13ec02c -- src/ scripts/` is empty, so
the base is the shipped PASS 84 source).

Commits: `b082bc83` (gate), `ff938fd9` (HF-417 fix), `2f8cc780` (prewarm cut),
the evidence commits, and the repair pass `8c6538cd` (flare predicate) and
`fb349dd8` (instrument).

Every line is VERIFIED (measured or run in this session), CLAIMED (believed,
not verified here) or OPEN.

---

## REPAIR PASS, 2026-09-02 21:45-22:20 BST

A skeptic returned ACCEPT_WITH_FIXES: the code was sound, the reporting was
not. Four of its five substantive findings were about numbers this report
published, and all four are upheld. What changed:

| finding | outcome |
|---|---|
| the "moved off the fence" metric cannot measure that | UPHELD. Claim downgraded; instrument split (`fb349dd8`) |
| "whole-switch time is essentially flat" | UPHELD. Replaced with the paired distribution below |
| candidate first-load timings measured and omitted | UPHELD. Published below, with a control column |
| baseline sweep reported quiet, was not | UPHELD. Disclosed below; probe now samples for the whole run |
| `arenaCanAcquireFlareGun` misses the Gun Range rack | UPHELD, and it was a real correctness defect. Fixed in `8c6538cd` |
| after receipt records the wrong SHA | UPHELD. Artifact renamed, provenance section added, probe now stamps a dirty tree |

**BLOCKED, with evidence: no new browser measurement was possible during the
repair.** The owner's ComfyUI is generating (`GET /queue` shows a running
qwen-image-edit job) and the GPU reads 13560 / 16303 MiB used — 2.7 GB free,
below the 3000 MiB floor the machine rules set for launching a browser at all,
and any timing taken beside a live generation is void by the same rules. Every
repair below is therefore a re-analysis of the two committed JSONs, a source
fix, or an instrument fix. The re-runs that are owed are listed as OPEN items.

---

## HEADLINE

**VERIFIED — HF-417's failure mode is fixed, and it was never about Gun Range.**
The full 56-pair in-session switch matrix on the shipped PASS 84 source fails
`atomic-acres -> high-seas` with the exact HF-417 signature. On the candidate
it is 56/56 with zero fence-exceeded errors. That is the lane's one solid win
and it is a correctness win.

**VERIFIED — this lane does not make map loads faster, and this run cannot
even establish that it does not make them slower.** Paired over the 55 edges
that committed in BOTH runs (the only valid comparison; the two runs are not
independent samples of the same thing):

| statistic | value |
|---|---|
| median delta | **+488 ms**, 95% CI (bootstrap, 4000 draws) **[-863, +1374]** |
| mean delta | **+728 ms**, 95% CI **[-120, +1613]** |
| edges slower after | **31 / 55**, sign test two-sided **p = 0.42** |
| per-edge sd | 3441 ms, at n = 1 per edge |
| worst edge | `gun-range->rustworks-1v1` 27810 -> 34257 ms |
| best edge | `skyline-terminal->rustworks-1v1` 29131 -> 23266 ms |

Both intervals span zero. The point estimates are on the SLOWER side, six of
eight arenas are slower to switch into, and the baseline was contaminated in
the direction that flatters the fix (below), so the honest reading is: **the
lane costs somewhere between nothing and about 1.5 s of median switch time and
buys reachability with it.** The previous version of this section said
"essentially flat (+1.2%)" and quoted p90 (-2.0%), the single tail statistic
that improved, from two independent percentile ladders. That was wrong and the
summariser now computes the paired distribution automatically so it cannot
recur. **The owner's "load every map much faster" is NOT delivered by this
lane** — what is delivered is a measured map of where the 21 s goes, a
correctness fix, a gate, and one specified ~3.5 s cut left OPEN with its risk.

---

## Job 0 — HF-417

### The instrument that was missing (commit `b082bc83`)

VERIFIED: every arena-loading gate in this repo boots STRAIGHT INTO an arena —
the eight-arena boot smoke, the pipeline-compile probe, the player-path probe.
None performs an in-session map switch. That is how Gun Range shipped in
PASS 84 unreachable by a map switch with every gate green; Lane I found it from
the game, not from a gate.

`scripts/qa/probe-arena-switch-matrix.mjs`
(`npm run qa:pass85:arena-switch-matrix`) walks EVERY ordered pair of selectable
arenas as a real menu round trip plus deploy, and exits non-zero when any switch
does not commit. It asserts no duration — commitment is the contract — and the
12 s admission fence is untouched.

### Reproduction

- VERIFIED: HF-417 does **not** reproduce as "gun-range specifically". All 7
  in-session switches into gun-range on the shipped build committed
  (18.5–23.9 s, 234–284 pipelines each) —
  `qa/hf417-repro-gun-range-shipped-build.json`.
- VERIFIED: the same failure class **does** reproduce, on a different arena.
  In the full baseline matrix, `atomic-acres -> high-seas` failed:

  `[High Seas map selection failed] WebGPU queue completion exceeded 12000 ms
  for submission 1378 (completed 1377, mode serialized, in-flight 1, pending
  12015 ms, probes 1378, prior latency 1 ms, fenced draws 1327)`

  and rolled back with atomic-acres still committed — the previous arena left
  live, exactly as the ledger describes.

### The mechanism, measured

VERIFIED. The failure is inside `visual-definition`, the transition phase that
holds the warm frame and its 12 s fence:

| baseline, `visual-definition` | value |
|---|---|
| p50 | 4035.2 ms |
| p90 | 5988.7 ms |
| max (the failing edge) | **13932.3 ms**, 76 pipelines built inside the fenced submission |
| edges within 3 s of the fence | 3 (10713.5, 10374.4, 6797.5 ms) |
| edges over the fence | 1 |

So the arena entered second in a session pays for its whole cold pipeline
vocabulary inside one fenced submission, and whichever arena that is decides
whether 12 s is enough. Nothing about it is farcrysis- or gun-range-specific.

### The fix (commit `ff938fd9`)

Lane C's relief — realise the exact ScenePass vocabulary through
`compileAsync` → `createRenderPipelineAsync`, which Dawn compiles on worker
threads outside any submission — was gated on
`selectedArena.id === 'farcrysis'`. That gate is removed; the relief runs for
every arena. `src/presentation-prewarm-contract.test.ts` is re-pinned
**stricter**: the region must now contain ZERO arena-id branches where it
previously allowed exactly one, and the precompile must still precede the
shadow refresh, the warm frame and the flush. The fence is untouched at 12 s.

**DOWNGRADED to CLAIMED (skeptic finding, upheld).** This report previously
called the phase timings "the proof that work MOVED rather than shrank". They
are not proof of that, because the instrument that produced them could not tell
the two apart: `probe-arena-switch-matrix.mjs` pushed `createRenderPipeline`
AND `createRenderPipelineAsync` into ONE sink, and the derived "in-fence"
figure is the pipelines attributed to the `visual-definition` +
`coverage-submit-fence` phases. The fix's relief IS
`createRenderPipelineAsync`, and it runs inside the `visual-definition`
WINDOW, so the off-fence work was counted as fenced work. Computed for the
after build — a column the summariser printed for `before` only, now printed
for both — it rises on every arena: atomic-acres 107 -> 151, rustworks
108 -> 141, skyline 83 -> 118, gun-range 80 -> 110, test2 66 -> 89,
test1 53 -> 62, high-seas 39 -> 52, map3 33 -> 34.

What survives:
- **VERIFIED**: `visual-definition` p50 rose 4035 -> 6518 ms, its longest edge
  rose 10713 -> 15220 ms, and **that 15.2 s edge COMMITTED where a 13.9 s one
  previously rolled back**. The phase is longer AND survivable. That is a fact
  about outcomes, not about which side of the fence the work sits on.
- **VERIFIED**: 56/56 committed with zero fence-exceeded errors, against
  55/56 with one. This is the only sound evidence that the fenced submission
  got cheaper, and it is sufficient to land the fix.
- **CLAIMED, from the source and Dawn's documented behaviour, NOT from this
  instrument**: `compileAsync` uses `createRenderPipelineAsync`, which Dawn
  compiles on worker threads outside any submission, so the work is off the
  fence by construction.
- `fb349dd8` splits the sinks (`pipelinesSyncByPhase` /
  `pipelinesAsyncByPhase`) and redefines in-fence as SYNC-ONLY, so the next run
  measures the mechanism directly. Until that run exists the mechanism claim
  stays CLAIMED. **OPEN.**

### Switch matrix, before vs after (56 ordered pairs each)

| | before (`c13ec02c`) | after (`b082bc83` + uncommitted, see Provenance) |
|---|---|---|
| edges committed | **55 / 56** | **56 / 56** |
| fence-exceeded errors | 1 | **0** |
| PAIRED median delta (55 edges) | — | **+488 ms**, 95% CI [-863, +1374] |
| PAIRED mean delta | — | **+728 ms**, 95% CI [-120, +1613] |
| edges slower after | — | **31 / 55**, sign p = 0.42 |

The unpaired percentile ladders that used to sit here (p50 18806 -> 19029,
p90 29131 -> 28534, mean 17889 -> 18866) are omitted deliberately: comparing
two independent ladders let this report quote the one percentile that improved.
The paired table above is what `summarize-arena-switch-matrix.mjs` now prints,
so it cannot be selected around.

Median switch INTO each arena (7 sources each), and the pipelines built inside
the two fenced phases:

Corrected against the summariser's own output — the previous version of this
table repeated the before pipeline counts in the after column, and printed the
fenced-phase column for `before` only:

| arena | before ms | after ms | delta | pipelines b/a | fenced-phase pipelines b/a* |
|---|---|---|---|---|---|
| gun-range | 22611 | 23756 | +5% | 227 / 259 | 80 / 110 |
| high-seas | 21610** | 28534 | +32%** | 195 / 206 | 39 / 52 |
| rustworks-1v1 | 21276 | 23266 | +9% | 245 / 276 | 108 / 141 |
| atomic-acres | 20173 | 21615 | +7% | 288 / 333 | 107 / 151 |
| skyline-terminal | 18806 | 16905 | **-10%** | 228 / 263 | 83 / 118 |
| test1 | 11829 | 11308 | **-4%** | 167 / 176 | 53 / 62 |
| test2 | 10960 | 12108 | +10% | 177 / 200 | 66 / 89 |
| map3 | 8903 | 9391 | +5% | 138 / 134 | 33 / 34 |

**Six of eight arenas are slower to switch into.** Read that beside the paired
distribution above: per-edge sd is 3441 ms at n = 1, so no single row here is
significant on its own, and the ensemble cannot establish a direction either.

\* sync + async summed, which is what the old probe recorded. It CANNOT be read
as "work moved onto the fence" — see the downgraded claim above. The split
lands with `fb349dd8` and only a re-run produces the honest column.

\*\* the before high-seas median includes the FAILED edge, which aborted early
at 14483 ms and therefore drags that median DOWN, so the +32% is inflated by
that artefact. It is not zero, though: paired, `map3->high-seas` went
19267 -> 27899 ms and `test2->high-seas` 19260 -> 28534 ms.

### Phase table (median over every edge)

| phase | before ms | after ms |
|---|---|---|
| prewarm-batched-effects | 9151.0 | 7347.9 |
| visual-definition | 4079.6 | 6517.8 |
| coverage-submit-fence | 3069.4 | 2770.9 |
| weapon-catalog-prewarm | 2229.7 | 1532.7 |
| material-tuning | 175.9 | 178.4 |
| everything else | < 12 ms each | < 12 ms each |

Four phases are 92% of the switch. Everything else — arena construction,
physics, batching, authority commit, retirement — is single-digit milliseconds
and is not worth touching.

Render pipelines by phase (median per switch): prewarm-batched-effects 131/131,
visual-definition 41 -> 74, coverage-submit-fence 30 -> 24,
weapon-catalog-prewarm 6/6. The rise in `visual-definition` is the precompile
now doing the work there instead of the fenced frame downstream.

---

## Job 1 / Job 2 — per-arena costs and attribution

First load, boot -> live match, chunk-start sessions only. n = 1 per arena per
run, and the rows are taken at different points inside a ~50 minute sweep, so a
first-load delta is NOT on its own a measurement of the change. `control` is the
mean of the seven prewarm families this change does not touch (tracers-impacts,
explosions, smoke-volumes, world-ordnance, nuke-overdrive-bolts,
bot-world-weapons, death-drops-glass) — the internal control that says how much
of a row is the machine.

The first version of this table published the BEFORE timings and the
before/after pipeline counts, and omitted the after timings, which existed in
the same rows. They are published here in full:

| arena | menu | transition | deploy | **total b -> a** | control b -> a | pipelines b/a | modules b/a | materials | triangles |
|---|---|---|---|---|---|---|---|---|---|
| atomic-acres | 920 -> 1638 | 28973 -> 31914 | 18809 -> 13752 | **47908 -> 45749** (x0.95) | 3824 -> 3284 (x0.86) | 360 / 384 | 415 / 441 | 104 | 537 259 |
| skyline-terminal | 3550 -> 1685 | 28733 -> 22477 | 20397 -> 17471 | **49276 -> 40050** (x0.81) | 3474 -> 2882 (x0.83) | 289 / 307 | 330 / 344 | 97 | 55 658 |
| rustworks-1v1 | 1625 -> 1569 | 34959 -> 34643 | 18895 -> 15407 | **54000 -> 50169** (x0.93) | 3141 -> 2191 (x0.70) | 280 / 296 | 325 / 342 | 67 | 194 606 |
| gun-range | 1683 -> 2487 | 28360 -> 46373 | 14402 -> 18695 | **42972 -> 65409** (x1.52) | 2871 -> 3857 (x1.34) | 255 / 272 | 287 / 303 | 192 | 117 678 |
| high-seas | 920 -> 2202 | 29902 -> 47915 | 19295 -> 22989 | **49294 -> 71029** (x1.44) | 6240 -> 6703 (x1.07) | 2426* / 243 | 2655* / 285 | 60 | 212 682 |

\* the before high-seas row is an anomalous chunk start (2426 pipelines before
admission against 236 on its other row); its second before row totals 46826 ms.

- **VERIFIED, and it contradicts the first version of this report**: the two
  regressed first loads are real, not purely machine noise. gun-range is
  x1.52 against a control of x1.34, so roughly a third of that row is the code;
  high-seas is x1.44 against a control of x1.07, so most of that row is the
  code. Inside them `killstreak-vocabulary` reads **6770 ms** (gun-range) and
  **6997 ms** (high-seas) against 3374 / 3895 before, and
  `flamethrower-first-shot` 5977 and 7927 ms against 614 / 572.
- **The killstreak migration this report called a future risk "at 2.1-2.3 s
  today" is therefore ALREADY OBSERVED on first load, at 6.8-7.0 s.** The
  open item below is rewritten accordingly.
- OPEN: test1, test2 and map3 never fell on a chunk boundary, so they have no
  first-load row in either run. Their switch rows (7 sources each) are complete.

- OPEN: test1, test2 and map3 never fell on a chunk boundary, so they have no
  first-load row. Their switch rows are complete.
- VERIFIED: pipelines compiled before admission are **flat across arenas**
  (236–360), while triangles vary 10x (55k–537k) and unique materials 3x
  (60–192). **Load time is not a function of arena size.** The dominant cost is
  the shared gameplay vocabulary recompiled per arena entry, not the arena.
- VERIFIED: the candidate compiles slightly MORE before admission (+7 to +24
  pipelines) — the intended direction: compile earlier, not later. Note this
  counter is sync + async summed; the split only exists from `fb349dd8` on.
- VERIFIED: `deploy` (match admission) is 14.4–20.4 s, roughly 30–40% of the
  wall time between clicking deploy and playing. It is outside this lane's
  ownership and untouched. It is the single largest unexamined block.

### Where `prewarm-batched-effects` goes (median ms per switch, before)

| family | before | after |
|---|---|---|
| smoke-volumes | 3524.7 | 2893.0 |
| world-ordnance | 2755.5 | 2146.9 |
| bot-world-weapons | 2755.1 | 2146.6 |
| nuke-overdrive-bolts | 2719.7 | 2105.4 |
| flare-first-shot | 2560.6 | **0** |
| killstreak-vocabulary | 2288.1 | 2136.5 |
| tracers-impacts | 515.8 | 502.8 |
| explosions | 515.5 | 502.4 |
| flamethrower-first-shot | 415.4 | 2253.2 |
| death-drops-glass | 0.9 | 0.8 |

The first seven run CONCURRENTLY (`Promise.all`); the last three are
SERIALIZED, because each stages a transient world PointLight and three r185
folds the visible light graph into every render object's cache key. So the
phase ≈ max(concurrent) + sum(serialized), which is why the serialized tail is
where the leverage is.

---

## Job 3 — the cut that landed (commit `2f8cc780`)

**CORRECTED in `8c6538cd`. Commit `2f8cc780`'s message and the first version of
this section both said the flare gun has exactly one route onto a map and that
"nothing else grants it". That is false.** `src/gun-range-test-bay.ts:113`
racks a station for EVERY `WEAPON_IDS` entry, and
`grantTrainingTimedMapWeapon` (`src/timed-map-weapon-authority.ts:175`) accepts
on `context.arenaId === 'gun-range'` alone — it never reads the definition's own
`arenaId`. A solo/host player on Gun Range can take a flare gun off the rack and
fire it, and the cut was skipping its rehearsal there. Not a live hazard,
because `prewarmMatchBoundFirstShotPresentations` still rehearses both exact
compositions unconditionally before admission on both backends — but the module,
the test and the commit message all pinned a false model of the world, which is
the exact defect class the module exists to prevent. `8c6538cd` derives the rack
route from the same authorities and source-pins all three of them.

Neither the flare gun nor the flamethrower is a loadout weapon. The flare gun
has two routes: skyline-terminal's timed map weapon spawn and the Gun Range
rack. The flamethrower has three: rustworks-1v1's spawn, the care package's
crimson roll wherever field support can be activated, and the same rack.
`src/arena-special-weapon-reach.ts` asks those authorities
(`TIMED_MAP_WEAPON_DEFINITIONS`, and the field-support predicate the activation
path itself applies) so that **no arena id is written into the gate** — pinned
by `src/arena-special-weapon-reach.test.ts`, which also asserts the gate region
contains no `selectedArena.id === '` at all.

Nothing leaves the admitted vocabulary: the full weapon catalogue is still
prewarmed immediately before this, and `prewarmMatchBoundFirstShotPresentations`
still rehearses both exact fire compositions against the complete match scene
on every arena before admission (also pinned).

**Measured result, stated honestly:**

| arena | flare rehearsal b -> a | flamethrower rehearsal b -> a | net |
|---|---|---|---|
| atomic-acres | 3273.5 -> 0 | 438.3 -> 3555.5 | ~0 |
| rustworks-1v1 | 3276.5 -> 0 | 589.4 -> 2973.8 | ~0 |
| gun-range | 3014.1 -> 0 | 595.5 -> 3301.3 | ~0 |
| high-seas | 3229.6 -> 0 | 468.7 -> 3335.6 | ~0 |
| skyline-terminal | 2393.9 -> 1803.4 (kept) | 487.5 -> 391.4 | ~ -0.7 s |
| test1 | 385.4 -> 0 | 21.4 -> 368.3 | ~ -0.04 s |
| test2 | 552.6 -> 0 | 22.2 -> 482.1 | ~ -0.09 s |
| map3 | 246.2 -> 0 | 18.5 -> 0 | **-0.26 s** |

The cost did not disappear; on the four heavy arenas it MIGRATED to whichever
staged-light rehearsal is now first. skyline-terminal keeps the flare rehearsal
and its flamethrower stays cheap (488 -> 391 ms) — that contrast is what
identifies the ~3 s as a **fixed warm-up paid by the first staged-light
rehearsal in the sequence**, not as the flare's own cost. This is the lane's
most useful finding and it could only be found by cutting one of them.

It is landed because it stops compiling a weapon the arena's own authority can
never produce, and because it is what measured the fixed cost. It is NOT a
load-time win on the arenas that matter, and the commit says so.

## Left uncut, and why

- **OPEN — the ~3.5 s follow-up.** Drop BOTH arena-side serialized rehearsals
  (`prewarmMatchBoundFirstShotPresentations` at deploy already rehearses both
  exact compositions on every arena, unconditionally, before admission). The
  data predicts ~3.5 s off every switch on the four heavy arenas. The risk,
  and the reason it is not landed tonight: the fixed warm-up may simply migrate
  onto `killstreak-vocabulary`, which runs next and is 2.1–2.3 s today. That is
  one 50-minute matrix run to settle and it needs its own before/after.
- **NOT CUT — `weaponPrewarmCatalogForArena` returns every weapon on purpose.**
  `src/weapon-prewarm-catalog.ts` documents why: shrinking it for Gun Range
  forces every normal-match model through a second decode/compile cycle on the
  next map switch. Left alone.
- **NOT CUT — `bot-world-weapons` (2.76 s).** Any remote combatant can carry any
  weapon, so there is no arena-derived predicate that can scope it. An
  arena-scoped guess here would be a correctness bug.
- **NOT CUT — nuke and overdrive prewarm.** `selectedArena.overdrive` is true
  only for atomic-acres, so gating looked attractive, but both are
  session-cached booleans inside the CONCURRENT block whose length is set by
  `smoke-volumes` (3.5 s). Gating them would be diff with no measured benefit.
- **NOT TOUCHED — the admission fence, the light-set freeze, and the deploy
  path.** The fence stays 12 s; no light toggling was added; match admission is
  another lane's surface.

---

## Verification

- **Switch matrix**: before 55/56, after **56/56**, 0 fence-exceeded errors.
  Roster derived and floored: 9 registry ids, 8 selectable, menu cross-checked.
- **In-combat pipeline tripwire** (candidate build, atomic-acres — the case
  where the flare rehearsal is skipped and the flamethrower is now first),
  75 s: 398 pipelines before the window, **1 during**, 0 inside a stall
  (enrichment 0x); shader modules 457 before / 0 during; 5 stalls, 0.76% frozen.
  **Phrased correctly: UNCHANGED FROM THE SHIPPED BASELINE, STILL 1.** Lane A's
  shipped-build baseline is 374 / 1 / 0, so this is not a regression — but the
  brief states the PASS 82 invariant as in-combat creations MUST stay 0, and 1
  is not 0. The previous wording ("PASS 82 invariant holds") implied the zero
  was met. It is not met, on this build or on the shipped one, and the
  pre-existing single creation (`renderPipeline_MeshBasicMaterial_774`) is a
  standing item for whoever owns that invariant.
  OPEN: the tripwire was run on ONE arena while this change alters the
  transition on every arena. gun-range and high-seas — the two whose first
  loads regressed — are the two that most want it, and neither could be run
  during the repair (GPU below the floor, ComfyUI generating).
- **Eight-arena boot smoke**: **11/11 passed**, all 9 arenas
  (atomic-acres, skyline-terminal, rustworks-1v1, gun-range, farcrysis,
  high-seas, test1, test2, map3), headless installed Chrome, native WebGPU.
- **`npx tsc --noEmit`: exit 0** (VERIFIED after the final source commit).
- **Focused vitest after the repair**: **14 files / 133 tests pass, 0 fail** —
  `arena-switch-matrix-roster` (new), `arena-special-weapon-reach` (new, now 6
  tests), `presentation-prewarm-contract`, `gun-range-rack-presentation`,
  `match-admission-main-integration`, `cold-visitor-deploy`,
  `combat-first-damage-prewarm`, `admission-debug-contract`,
  `timed-map-weapon-authority` and `timed-map-weapon-main-integration` (added on
  repair: they own the grant route the flare predicate now depends on),
  `rendering/pass64-tsl-scene`, `rendering/arena-coverage-prewarm`,
  `rendering/art-direction`, `rendering/arena-visual-definition`. Earlier in the
  lane, `src/rendering/` in full: 26 files / 359 tests pass. Full suite NOT run,
  per brief.
- **`node --check scripts/qa/probe-arena-switch-matrix.mjs`**: passes. The
  summariser was re-run against both committed JSONs to regenerate
  `qa/switch-matrix-before-after.txt`.
- **Visual regression**: OPEN. No screenshot comparison was run. The changes
  add no material, geometry, light or art-direction value — they reorder and
  gate *prewarm* submissions only, and `src/rendering/art-direction.test.ts`
  (bounds + distinctiveness floor) passes unchanged. That is an argument, not a
  measurement, and the pixel comparison is the honest open item.

## Provenance of the after evidence (READ THIS BEFORE USING ITS NUMBERS)

**The after receipt does not name the source it measured, and the artifact has
been renamed to say so:**
`qa/switch-matrix-after-b082bc83-dirty.json` (was `...-after-2f8cc780.json`).

- Its `gitSha` is `b082bc83`, the QA-gate commit, which contains NEITHER
  `ff938fd9` nor `2f8cc780`. The dist was built from an uncommitted working
  tree at 19:21 and the source was committed afterwards. This repo runs on
  exact-SHA receipts and this receipt is not one.
- VERIFIED from the data itself that the measured build DID contain the lane
  changes: `flare-first-shot` is 0 ms on seven of eight arenas in that run,
  which only `2f8cc780`'s gate produces, and `ff938fd9` is its parent in the
  same working tree. That is a sound inference, not a SHA match, so the
  claim-state is CLAIMED, not VERIFIED.
- `fb349dd8` adds `gitDirty` / `gitDirtyFiles` to the probe header so a future
  receipt states this on its face instead of leaving a reviewer to find it.
- The same applies to `qa/arena-boot-smoke-after.txt` and
  `qa/pipeline-tripwire-after-atomic-acres.json`; the boot smoke now carries a
  provenance header saying exactly this.
- **And the after run is now one commit STALE in the other direction**:
  `8c6538cd` restores the flare rehearsal on gun-range. That only ADDS back
  work the shipped PASS 84 build already did, on one arena, so every other
  arena's numbers stand unchanged — but gun-range's after numbers are
  optimistic by up to its flare rehearsal cost, and a re-run at an exact SHA is
  an OPEN item.

## Measurement hygiene (things that would otherwise silently corrupt this)

- **CORRECTED, and this is the finding that most affects the comparison.** The
  first version of this section said "both reported runs launched with ComfyUI
  idle and 0 rival browsers". True and misleading: the guard SAMPLES ONLY AT
  LAUNCH. This lane's own probe source records that a Lane V Playwright run
  started at 19:04 with eight headless Chromes live. The baseline sweep ran
  18:27 -> ~19:20; the after sweep started 19:21. **So another lane's browsers
  were competing for this GPU's submission queue through the middle of the
  BASELINE and none of the after run.** The bias runs in the direction that
  flatters the fix, which means the paired regression in the HEADLINE is if
  anything understated. `fb349dd8` makes the probe sample every 60 s for the
  whole run against a self baseline and stamp the maximum. Re-running the
  baseline on a quiet GPU is an OPEN item.
- CAVEAT: `npx tsc` and focused vitest runs also overlapped the first ~5 edges
  of the baseline sweep. Nothing overlapped the after sweep.
- The probe waits for an idle ComfyUI queue, ≥3000 MiB free VRAM, AND for rival
  Playwright browsers to clear before it starts.
- Headless installed Chrome only, `--window-position=-32000,-32000` as belt and
  braces. No headed browser was launched at any point, in the lane or the
  repair. No process this lane did not start was killed. No server or browser is
  left running (VERIFIED at repair handoff: `Get-CimInstance Win32_Process`
  reports 0 chrome.exe with a playwright command line).
- The probe's Windows "cleanup" was `spawnSync('cmd', ['/c', 'exit', '0'])` — a
  no-op under a comment claiming it stopped orphans. `fb349dd8` replaces it with
  an orphan REPORT that kills nothing. A QA instrument that claims a cleanup it
  does not perform is the same failure shape this lane documents elsewhere.

## Gotcha worth keeping

**Symptom → Cause → Correction → Verify.** A baseline build served from
`.qa-dist/before` rendered SEVEN map cards while the identical source built into
`dist` rendered eight, and the switch matrix silently planned 42 ordered pairs
instead of 56 → `.qa-dist/before` and `.qa-dist/after` are **tracked directories
holding Lane A's committed HF-399 builds**, so `cp -r dist .qa-dist/before`
nested my build at `.qa-dist/before/dist/` and left Lane A's older, pre-Map-3
`index.html` at the root being served; `rm -rf` on the sibling deleted 576
tracked files of another lane's evidence (restored with `git checkout --`) →
build QA dists OUTSIDE the repo (this lane uses the session scratchpad) and
never `cp -r` into a path that may already exist → verify with
`git status --short -- .qa-dist` clean, `grep -c "MAP 3" <dist>/assets/legacy-main-*.js`
non-zero on every dist served, and the probe's own roster line reporting the
full arena count.

That near-miss is why the probe now derives its roster from
`src/map-selection.ts`, cross-checks it against the live menu, floors both, and
refuses to run on a mismatch — and why `src/arena-switch-matrix-roster.test.ts`
pins that the Eulerian walk covers every ordered pair exactly once. The
corrupted dist did not error. It just measured less and called itself green.

## Open items for the orchestrator

1. **OPEN, and now the top one — three re-runs are owed, and none could be
   taken during the repair.** The GPU was at 13560 / 16303 MiB with ComfyUI
   generating, below the 3000 MiB floor for launching a browser at all, so this
   is BLOCKED WITH EVIDENCE rather than skipped. In priority order:
   a. **the baseline sweep, on a genuinely quiet GPU** — the committed baseline
      shared the machine with eight of Lane V's headless Chromes through its
      middle (see Measurement hygiene). Every before/after number in this
      report rests on it.
   b. **both sweeps with the split-sink probe** (`fb349dd8`), which is the only
      way to state the "work moved off the fence" mechanism from measurement
      rather than from the source.
   c. **one sweep at an exact committed SHA**, which no run in this lane has
      been (see Provenance), and which must post-date `8c6538cd` because that
      commit restores the flare rehearsal on gun-range.
2. **OPEN — the ~3.5 s follow-up cut, now with a WORSE risk estimate.** Remove
   both arena-side serialized first-shot rehearsals;
   `prewarmMatchBoundFirstShotPresentations` at deploy already rehearses both
   exact compositions on every arena before admission. **The risk this report
   called hypothetical is already observed**: `killstreak-vocabulary` reads
   6770 ms (gun-range) and 6997 ms (high-seas) in the committed after run's
   first loads, against 3374 / 3895 before — not the "2.1–2.3 s today" the
   switch medians suggested. The fixed staged-light warm-up migrates onto
   whichever rehearsal runs first, so removing both may buy far less than
   3.5 s. Do not land it on the arithmetic; measure it.
3. **OPEN — visual regression not measured.** No screenshot comparison was run
   (argument given in Verification, not a measurement). Job 4 of the brief says
   "look at them"; no PNG exists in this lane's evidence.
4. **OPEN — Job 3's deep cut was not attempted.** Shared materials across props
   with identical parameters, collapsed permutation drivers, streaming
   non-critical props behind admission: none of it. The one cut that landed nets
   about zero on the four heavy arenas because the warm-up migrates.
5. **OPEN — deploy/match-admission is 14.4–20.4 s**, roughly 30–40% of the wall
   time between pressing deploy and playing, and no lane has examined it. It is
   the largest unexamined block in "faster map loads".
6. **OPEN — commit trailer conflict.** The lane brief and the repair instruction
   mandate `Co-Authored-By: Claude Opus 5.1`; the harness system prompt mandates
   `Claude Fable 5.1`. All eight commits follow the brief. Lane A flagged the
   same conflict as an orchestrator decision; it is unresolved.
7. **ORCHESTRATOR DECISION — wire the gate in, or record why not.**
   `npm run qa:pass85:arena-switch-matrix` is registered as an npm script and is
   in no CI group or workflow — precisely the state the eight-arena boot smoke
   sat in for months while never executing, which is this lane's own thesis. It
   was NOT wired during the repair, for two reasons that are the orchestrator's
   to weigh, not this lane's:
   - it takes ~50 minutes for 56 edges, against a 2100 s ceiling on the largest
     existing bounded-e2e group, and
   - it needs a REAL WebGPU device (installed Chrome). The bounded groups run
     under SwiftShader, where a 12 s admission fence means something different.
   Wiring it also needs `scripts/qa/run-bounded-e2e.mjs`, which invokes the
   Playwright CLI for every group and cannot run a node probe. That file is
   outside this lane's ownership, so the exact patch is in the lane report
   handoff rather than applied here.
8. **OPEN — the in-combat tripwire covers one arena and reports 1, not 0.** See
   Verification. gun-range and high-seas are the two that most want it.
9. **NOTE — `8c6538cd` also carries the rename** of the after evidence JSON
   (`git mv` was staged before that commit's `git add`). The rename is
   described in the Provenance section; no evidence content changed.
