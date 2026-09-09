# Lane H2 — load-time deep cut, second pass (PASS 87)

Worktree `C:/Users/david/projects/aa-claude-loadcut`, branch
`contrib/dave-gaming-pc/claude/load-time-deep-cut`.
Integration head merged: `aa9befca` (PASS 86 live 00:50 BST) at merge commit
`a2efa280`. Every line below is VERIFIED (measured or run in this session),
CLAIMED (believed, not verified here) or OPEN.

> This report supersedes the held first-pass report, which is preserved verbatim
> at `docs/evidence/pass85/lane-h/lane-report.md`. The first pass's own
> conclusions are NOT restated as fact here; only what this pass re-measured.

---

## HEADLINE

**VERIFIED — the hold was right, and the cause is one phase, not the change.**
The first pass generalised an off-fence precompile from farcrysis to every arena.
That fixed a real correctness defect (the 56-pair in-session switch matrix went
55/56 -> 56/56, zero fence-exceeded errors) and it regressed first loads. This
pass reproduced the regression on a design contention cannot bias, attributed it
to the `visual-definition` phase alone, and cut it in two measured steps:

| gun-range cold load, `visual-definition` | ms | vs PASS 86 baseline |
|---|---|---|
| PASS 86 baseline `aa9befca` | 4 398 / 4 404 | — |
| first pass (relief over the whole scene) | **12 981** | **+8 583** |
| this pass, step 1 (relief over the arena root) | **10 049** | +5 645 |
| **this pass, step 2 (cold session asks an evidenced authority)** | **4 453** | **+158, control +146** |

The last row is the whole result: the phase that carried the entire regression is
back on its baseline, and the first load with it (57 093 -> 57 484 ms, x1.01,
against an internal control of x1.04). **The exit gate's first-load criterion is
MET on the arena that failed it worst.**

**VERIFIED — what is landed and why it is worth landing.** The in-session-switch
relief, which is the HF-417 correctness fix, is untouched and unconditional. The
cold-session relief now runs only where a cold session has been MEASURED to lose
the 12 s fence, through a tested authority module rather than an `id ===` inline
in a 35 000-line transition; the transition region still contains zero arena ids
and that is now pinned twice.

**VERIFIED — `deploy` is attributed for the first time.** Match admission is
18.2-24.7 s per arena on a cold load, beside a 32-40 s transition, and until this
pass no instrument in the repo could see inside it. It now publishes per-step
durations, and the first reading already names its two biggest steps.

**PARTIAL — the 72-pair switch gate did not complete, and the first version of
this report overstated how far it got.** **34** genuine distinct ordered pairs
committed, 0 failed, 0 fence-exceeded; **38 are OPEN**. The full run aborted when
the headless browser was closed under 47 rival Chrome processes, and the
continuation spent its window on `nuketown2` — the arena that shipped hours ago
and had never been switch-tested. **CORRECTION (repair pass):** that continuation
was claimed as "8/8 outgoing". It is **2 of 8**. Seven of its eight rows ran
before this lane's own probe fix and departed the PREVIOUS target, not
`nuketown2`; the receipt's own `firstLoads` (399-1 147 ms against a genuine
41 648 ms) prove it, and a re-run through the fixed probe measured the same
source re-establishment at 28 980 ms. Full derivation and the re-totalled
coverage table in section 13.

**VERIFIED, and it is the repair pass's headline — the hold's SECOND cause is
NOT repaired, and it is bigger than anyone had measured.** Paired over the same
ten ordered pairs on both builds, **10 of 10 in-session switches are slower on
the candidate: median +7 857 ms, ratios 1.23-1.87.** The mechanism is attributed
and is contention-immune: `async` pipelines created per switch go from 13-40 on
PASS 86 to **56-76** on this branch while `sync` stays flat — the off-fence
precompile widened from farcrysis-only to every arena, which is the HF-417
correctness fix doing more work by design. The cold-load internal control in the
same receipts is 3.8% FASTER on the candidate, and a second candidate run in a
louder room agrees (+8 500 ms), so this is the build, not the room. Section 13a.

**NOT DELIVERED.** The owner's "load every map much faster" is still not
delivered by this lane. What is delivered is: a correctness fix that survives,
its cost measured and mostly removed, a gate no other instrument provides, an
attributed map of the two blocks that hold the remaining ~50 s, and three cuts
specified with the experiment that decides each.

## 1. What the stopped first pass left, and what was kept

VERIFIED: the branch was clean (`git status --porcelain` empty), nothing
uncommitted, nine commits `b082bc83..d2835404` on top of `c13ec02c`.
Nothing was discarded. All nine were kept and merged forward:

| commit | what | kept because |
|---|---|---|
| `b082bc83` | roster-derived arena switch-matrix gate | the only instrument in the repo that performs an in-session map switch |
| `ff938fd9` | HF-417: off-fence precompile for EVERY arena, not just farcrysis | took the 56-pair matrix from 55/56 to 56/56, zero fence-exceeded errors |
| `2f8cc780` | stop rehearsing special weapons an arena cannot spawn | the measurement that identified the fixed staged-light warm-up |
| `62a63384`, `0c585f71`, `5a8cd36d` | evidence + open items + boot-smoke receipt | evidence |
| `8c6538cd` | flare-gun reach fix (Gun Range secure test bay) | a real correctness defect the skeptic found |
| `fb349dd8` | split sync/async pipeline sinks in the probe | the instrument could not measure its own claim |
| `d2835404` | report corrected against the same data | evidence |

VERIFIED: merging `aa9befca` produced ONE conflict, `package.json`, where this
lane's `qa:pass85:arena-switch-matrix` script and PASS 86's `qa:pass84:gamepad`
script were added on the same line. Both were kept; `JSON.parse` passes.
`src/legacy-main.ts` auto-merged and is still pure LF (0 CRLF).

## 2. Measurement conditions — the quiet GPU the addendum asked for did not exist

**VERIFIED, and it shapes every number below.** The addendum's job 1 is
"re-measure the baseline and the candidate on a quiet GPU (ComfyUI queue empty,
no rival browsers)". ComfyUI was idle for the whole window (`GET /queue`
`{"queue_running":[],"queue_pending":[]}`). Rival browsers were NOT absent, and
they were not mine:

| PID | started | owner |
|---|---|---|
| 42020 (+8 children) | 01:02:09 | `node scripts/qa/capture-lane-ab-time-of-day.mjs --serve-dist dist-lane-ab` |
| 53960 (+8 children) | 01:06:47 | `node scripts/qa/sweep-farcrysis-traversal.mjs --out docs/evidence/pass87/lane-r/traversal-sweep.json` |

Two other PASS 87 lanes were driving headless Chrome on this GPU throughout, and
the load rose as the night went on. **No process belonging to them was killed.**
Across this lane's runs the probe recorded 9 to 40 rival Playwright Chrome
processes and free VRAM between 3 877 and 8 180 MiB; at one sample the GPU was at
15 012 / 16 303 MiB with another lane's work. Every receipt stamps its own
reading, and the run guard still refuses to launch below 3 000 MiB free.

The first pass's fatal reporting defect was exactly this: its baseline sweep ran
under contention its candidate sweep did not, biasing the comparison. Repeating
a two-block design tonight would have repeated that defect with the sign
flipped — the first block ran at 9 rivals / 7442 MiB free, the second at
27 rivals / 3877 MiB free. So the design was changed:

**Tightly interleaved A/B.** For each arena, the baseline dist and the candidate
dist are measured BACK TO BACK, one arena at a time, minutes apart, so
contention is common-mode rather than assigned to one arm. Each run is its own
process, its own port and its own receipt, and each stamps its own rival count
and free VRAM. This does not make the room quiet; it makes the two arms share
the same room.

**SKEPTIC CORRECTION (2026-09-03, accepted).** "Contention is common-mode" was
claim-stated VERIFIED. It is not: it is a DESIGN INTENT that the receipts only
approximate, and the claim is hereby downgraded to **CLAIMED**. The rival counts
differ per arm in the final pairs (gun-range base 31 vs candidate 35; high-seas
base 27 vs candidate 38), and `playwrightChromeProcessSamples` is **1** on every
first-load receipt — one sample, taken at launch — so the
`rivalPlaywrightBrowsersMaxDuringRun: 0` those receipts publish means "never
sampled again", not "no rivals". A reader would take it for the opposite of what
this lane's own gotcha (section 7) warns about.

Two consequences, both acted on:
- The probe no longer publishes that field as a number when the room was sampled
  at most once; it publishes `null`. Landed this repair pass in
  `scripts/qa/probe-arena-switch-matrix.mjs` ("not sampled" must not be
  publishable as "zero").
- What actually carries the first-load A/B rows is therefore **the internal
  control** (the mean of seven untouched prewarm families, reported per row) and
  **build equivalence** (after `2a72720d` a cold session executes PASS 86's exact
  precompile behaviour on every arena) — NOT common-mode contention. The
  conclusion in section 3a is unchanged; its support is narrower than was
  written, and n=1 per arm.

## 3. Job 1 — the held regression REPRODUCES, and it is one phase

> **Claim-state note.** "The 56-pair matrix went 55/56 -> 56/56" is a FIRST-PASS
> result (`switch-matrix-before-c13ec02c.json` vs `switch-matrix-after-b082bc83-dirty.json`,
> both committed under `docs/evidence/pass85/lane-h/`). This pass did not re-run
> that comparison — the roster has since grown to nine selectable arenas, so the
> equivalent run is 72 pairs, and it is section 13. Wherever "56/56" appears
> below it is **CLAIMED from the first pass's committed receipts**, never
> re-verified here.

**VERIFIED. The hold was correct.** Interleaved A/B, baseline dist `aa9befca`
against the lane candidate, back to back per arena:

| arena | build | first load | menu | transition | deploy | control | `visual-definition` | `coverage-submit-fence` | rivals / free VRAM |
|---|---|---|---|---|---|---|---|---|---|
| gun-range | base `aa9befca` | 58 038 | 2 156 | 37 746 | 19 905 | 3 320 | **4 398** | 6 703 | 26 / 5 500 MiB |
| gun-range | candidate | **74 637** | 2 196 | 52 720 | 20 763 | 4 496 | **12 981** | 8 493 | 18 / 8 180 MiB |
| high-seas | base `aa9befca` | 65 224 | — | 39 657 | 24 746 | 6 285 | **5 015** | 4 417 | 18 / 5 822 MiB |
| high-seas | candidate | **70 252** | — | 45 393 | 24 579 | 6 403 | **8 494** | 4 948 | 40 / 3 996 MiB |

`control` is the mean of the seven prewarm families this lane does not touch —
the internal control that says how much of a row is the machine.

- **high-seas is the clean row**: control moved x1.02 (the room was the same),
  the first load moved +7.7%, and `visual-definition` moved **+3 479 ms
  (x1.69)**. That is the code.
- **gun-range**: control x1.35 and `visual-definition` **x2.95**, +8 583 ms. The
  phase moved far outside the machine's own movement.
- **`coverage-submit-fence` does NOT fall to pay for it** (6 703 -> 8 493 and
  4 417 -> 4 948). The second precompile is not finding the first one's work
  waiting, so on a cold session the two cover largely DISJOINT object sets and
  the first one is added cost, not moved cost.
- Both arenas' async pipeline counts rise before admission (gun-range 23 -> 50)
  while sync falls (232 -> 222): the off-fence mechanism does what it says. It is
  simply doing it to a scene the fenced warm frame did not need realised.

**That is the whole regression.** It is not spread across the transition, it is
not the prewarm families, and it is not the deploy block: it is one phase, and
its cause is the ROOT the precompile is given, not the fact that it runs.

### The fix (commit `43247daf`), and why it keeps both protections

On an **in-session switch** the whole scene is at risk, because the renderer's
pipeline cache holds the PREVIOUS arena's permutations. That case is unchanged,
byte for byte — it is the case that took the 56-pair matrix from 55/56 to 56/56.

On a **cold session** nothing has been realised yet, the retained gameplay roots
are suppressed and are prewarmed by their own passes downstream, and the only
vocabulary the fenced warm frame can be surprised by is the arena's own — which
is exactly what farcrysis's `submission 1 ... fenced draws 1017` was made of. So
the cold-session root becomes `arena.root`.

No arena id is read (`hadPreparedArena`, already computed at the top of
`performArenaSelection`). The attachment walk is load-bearing:
`precompileExactScenePass` throws on a root not attached to the submitted scene,
and the fallback is the whole scene — more compiled, never less.

### Step 1 measured, and it was not enough (commit `43247daf` -> `b4ee52d9`)

VERIFIED, interleaved A/B again on the arena-root-scoped build:

| gun-range cold load | base | candidate | ratio |
|---|---|---|---|
| first load total | 57 025 | 63 809 | **x1.12** |
| CONTROL (7 untouched families) | 3 407 | 3 388 | **x0.99** |
| `visual-definition` | 4 404 | 10 049 | **x2.28** |
| `coverage-submit-fence` | 7 318 | 7 303 | x1.00 |
| `prewarm-batched-effects` | 14 986 | 15 120 | x1.01 |
| `weapon-catalog-prewarm` | 6 151 | 6 130 | x1.00 |

This is the cleanest measurement in the lane: the control is x0.99 and three of
the four other phases are x1.00-x1.01, so the room did not move at all and every
millisecond of the +6 784 ms sits in one phase. Scoping the root recovered
**2 932 ms of the 8 583** — and left 5 645 ms that the downstream phases still do
not give back. The conclusion is forced: **on a cold session this relief is added
work, not moved work.**

### Step 2 — the cold session asks an evidenced authority (commit `89d760ba`)

The in-session-switch relief stays exactly as it is; the cold-session relief runs
only for arenas whose cold session has been MEASURED to lose the 12 s fence.
Today that is one arena, farcrysis, on pass 84 lane C's evidence
(`submission 1 ... fenced draws 1017`, rollback, and a stuck submission that then
failed the next arena's fence; Atomic Acres compiles 75 there and passes).

It is expressed as `src/rendering/cold-session-precompile-reach.ts` — an
authority with the evidence in its docstring and a test that pins that the set is
non-empty and that every member is a real `ARENA_ID` — rather than the
`selectedArena.id === 'farcrysis'` that used to sit inline in the transition. The
transition region contains zero arena ids and that is now pinned by TWO test
files. Removing an entry requires the measurement that a cold boot of that arena
survives without it, not an argument.

**Predicted result on every arena except farcrysis: the cold-session path takes
the same sequence PASS 86 takes (one extra boolean, one skipped branch), so
`visual-definition` returns to its baseline and the first-load regression goes to
zero.** The final measurement is in section 3a.

### Step 3 — and the step-2 code carried a defect of its own (commit `2a72720d`)

Step 2 stopped running the cold-session relief except where the authority names
an arena. That left step 1's narrowed root (`arena.root`) reachable in exactly
one case: **the named arena**. In other words the code, as of `89d760ba`, would
have shipped farcrysis a relief NARROWER than the whole-scene one PASS 86 gives
it today — on no evidence, in the one place where losing the 12 s fence is
documented to wedge the queue for the NEXT arena as well.

Caught by re-reading the guard against its own reachability, not by a test.
Both surviving cases now take the whole scene, exactly as PASS 86 does, and the
ancestor walk and its fallback go with the narrowed root. **Every arena's relief
is now either PASS 86's or absent-as-in-PASS-86; none is narrower than what it
ships with.**

This is the state the branch is merge-ready in.

## 3a. THE RESULT — the first-load regression is gone

**VERIFIED, interleaved A/B on the final build `89d760ba` against baseline dist
`aa9befca`, gun-range:**

| gun-range cold load | base | candidate | ratio |
|---|---|---|---|
| **first load total** | 57 093 | **57 484** | **x1.01** |
| CONTROL (7 untouched families) | 3 397 | 3 543 | **x1.04** |
| transition | 36 564 | 37 470 | x1.02 |
| deploy (admission) | 19 968 | 19 580 | **x0.98** |
| `visual-definition` | 4 295 | **4 453** | **x1.04** |
| `coverage-submit-fence` | 7 522 | 7 300 | x0.97 |
| `prewarm-batched-effects` | 15 209 | 15 372 | x1.01 |
| `weapon-catalog-prewarm` | 6 211 | 6 383 | x1.03 |

Every ratio equals the control to within a percent, `visual-definition` included
— it is x1.04 against a control of x1.04, i.e. it moved with the machine and not
at all with the code. The phase that carried the entire regression is back on its
baseline.

**high-seas, same build, same design:**

| high-seas cold load | base | candidate | ratio |
|---|---|---|---|
| first load total | 64 519 | 65 652 | x1.02 |
| CONTROL | 6 103 | 6 050 | **x0.99** |
| `visual-definition` | 5 154 | **5 453** | x1.06 (pre-fix: x1.69) |
| `coverage-submit-fence` | 4 369 | 3 676 | x0.84 |

**Read against the baseline's own spread, not against zero.** The `aa9befca`
baseline was measured three times tonight per arena, interleaved with the
candidate: gun-range 58 038 / 57 025 / 57 093 (mean 57 385, spread ±0.9%),
high-seas 65 224 / 63 881 / 64 519 (mean 64 541, spread ±1.0%). The final
candidate reads 57 484 (**+0.2% of the gun-range baseline mean**) and 65 652
(**+1.7% of the high-seas mean**), against a pre-fix +29% and +8%. Both are
inside or within a whisker of the baseline's own run-to-run spread, and the
phase that carried the regression is at x1.04 / x1.06 against controls of x1.04 /
x0.99.

**CLAIM-STATE: VERIFIED that the regression is removed to within the baseline's
own measurement spread on the two arenas that carried it. CLAIMED, not verified,
for the other seven selectable arenas** — the cold-session path now takes the
same sequence PASS 86 takes for every arena the authority does not name, so there is no
mechanism by which they could differ, but only these two were measured.

The whole arc, one phase, one arena, four interleaved A/Bs:

| build | `visual-definition` on a gun-range cold load | vs its own paired baseline |
|---|---|---|
| PASS 86 `aa9befca` | 4 295 - 4 404 ms | — |
| first pass (held) | 12 981 ms | **+8 583** |
| step 1, arena-root scoped | 10 049 ms | +5 645 |
| **final `89d760ba`** | **4 453 ms** | **+158, and the control moved +146** |

## 4. Job 3, item by item — two of the three routes are blocked, and by what

The addendum's job 3 is "make the off-fence precompile NOT serialise into first
load: parallel compileAsync, menu-time prewarm scoped to the picked arena,
nothing rehearsed twice". Each route was investigated to the point of a decision:

### 4a. "parallel compileAsync" — BLOCKED inside three r185 itself. VERIFIED from source.

`node_modules/three/build/three.webgpu.js` (three 0.185.1),
`Renderer.compileAsync`, lines 60218-60246. The synchronous half builds a render
list and fills `compilationPromises`; the tail then processes them **strictly one
at a time**:

```js
for ( const item of compilationPromises ) {
  ...
  await this._nodes.getForRenderAsync( renderObject );
  ...
  const pipelinePromises = [];
  this._pipelines.getForRender( renderObject, pipelinePromises );
  if ( pipelinePromises.length > 0 ) await Promise.all( pipelinePromises );
  ...
  await yieldToMain();
}
```

`createRenderPipelineAsync` is therefore awaited **per render object**, so Dawn's
worker pool never has more than one pipeline in flight from this path no matter
how many workers it has. The parallelism the addendum asks for is not a knob this
repo owns: it is a `for await` in three's build.

The only userland route to real concurrency is running several `compileAsync`
calls over disjoint subtrees at once. **Not attempted, deliberately.** Two
concurrent calls interleave their awaits over `_objects`, `_nodes`, `_geometries`,
`_bindings` and `_pipelines` — shared renderer caches whose save/restore of
`_currentRenderContext` / `_compilationPromises` happens synchronously BEFORE the
await loop (lines 60208-60216), so a second call entering while the first is
suspended is not protected by that restore. A corruption there presents as a
wrong-permutation pipeline, which is a visual defect this lane could not have
detected tonight with no screenshot comparison in budget. **OPEN, specified:**
it is a real ~N-fold lever on every precompile in the game and it wants its own
lane with a pixel gate, not a load lane's last hour.

### 4b. "menu-time prewarm scoped to the picked arena" — BLOCKED by the repo contract.

`AGENTS.md`, "HUD and menu forging": *"Browsing the menu must construct zero
gameplay arenas and run zero live preview rendering or physics. Only after the
selected video's first frame is visible may one fenced, isolated submission
compile the retained-asset TSL/HDR pipeline; it must not attach an arena root,
render a gameplay scene, recur, or compete with the preview decoder."*

Prewarming the picked arena's vocabulary at menu time requires that arena's roots
and materials to exist and to be submitted, which is precisely what that clause
forbids, and the one permitted submission is explicitly retained-asset-only and
non-recurring. **NOT IMPLEMENTED, and it should be struck from the job list
rather than carried forward, unless the owner changes that contract.**

### 4c. "nothing rehearsed twice" — investigated, and the obvious cut is unsafe. VERIFIED from source.

The transition runs `precompileExactScenePass(scene)` twice: once in
`visual-definition` (legacy-main.ts:29430, the HF-417 relief) and once in
`coverage-submit-fence` (legacy-main.ts:29506). Both disable frustum culling, so
both walk the whole scene.

The tempting cut is to leave culling ON for the first one — the fenced warm
frame it protects is an ordinary culled render, so it only needs the visible set.
**That is wrong, and the reason is worth recording:** the camera is not aimed at
the new arena at that point. `setArenaMenuCamera()` runs at legacy-main.ts:29477,
*after* `visual-definition` (legacy-main.ts:29377); between `authority-commit` and the warm frame the
camera still holds the PREVIOUS arena's transform (or the boot default on a first
load). A culled precompile there would compile an arbitrary, non-deterministic
subset — sometimes almost nothing — and HF-417 is exactly the failure that
happens when the fenced submission meets an unrealised vocabulary. Left
uncut, with the reason pinned here so the next lane does not rediscover it.

## 5. Job 5 — match admission, attributed for the first time (commit `8715aa8c`)

VERIFIED (source + tsc + focused tests): `deploy` — everything between
`startSolo()` and the first live frame — is **the largest block in "faster map
loads" that no instrument in this repo could see inside**. Tonight's baseline
first loads put it at 18.2-23.9 s per arena beside a 32-40 s transition. The
arena TRANSITION has had a phase profiler since pass 79, and every load cut this
repo has landed was aimed by it; admission had exactly one number, so "attribute
it and cut it" was not actionable.

`bootstrap.matchAdmissionProfile` now publishes per-step durations for
`admission-open`, `bot-spawn`, `corpse-pool`, `bot-presentations`,
`rest-composition-compile`, `weapon-switch-rehearsal`,
`match-bound-first-shots`, `initial-match-settle` and `stable-cadence-wait`
(plus the WebGL branch's `webgl-rest-composition`).

**It is markers only.** Every call in that block is pinned by exact source string
in `src/presentation-prewarm-contract.test.ts` (`await
prewarmMatchBoundFirstShotPresentations(token);`, `await
renderRuntime.compileAndRender(scene, camera, scene);`, `await
exercisePreparedWebGpuWeaponSwitches();`, `await settleWebGpuPresentation('Initial
match');`, `await waitForStableMatchAdmissionCadence();`, and the exact
try/catch around `prewarmBotPresentations`). Nothing is wrapped, reordered,
added or removed: `markMatchAdmission()` stamps `performance.now()` BETWEEN the
existing statements exactly as `profileArenaTransition()` does inside the
transition, and the profile is closed in the existing `finally`. Those four
pinned test files pass unchanged (36 tests) — the pins were NOT relaxed to fit
the marks; the marks were shaped to fit the pins.
### The first reading — and it names two steps, one of which is a constant

VERIFIED, 8 admission rows across 4 candidate runs (2 arenas x cold load + one
in-session switch into test1 each):

| step | min | median | max | what it is |
|---|---|---|---|---|
| `weapon-switch-rehearsal` | 5 786 | **7 199** | 8 858 | `exercisePreparedWebGpuWeaponSwitches()` |
| `stable-cadence-wait` | 5 193 | **5 262** | 5 298 | `waitForStableMatchAdmissionCadence()` |
| `match-bound-first-shots` | 1 564 | 2 003 | 3 402 | `prewarmMatchBoundFirstShotPresentations()` |
| `bot-presentations` | 940 | 1 926 | 2 919 | `prewarmBotPresentations()` |
| `bot-spawn` | 0 | 1 006 | 1 250 | `spawnBots()` |
| `corpse-pool` | 0 | 475 | 675 | `ensureCorpsePresentationPool()` |
| `initial-match-settle` | 424 | 480 | 565 | `settleWebGpuPresentation('Initial match')` |
| `rest-composition-compile` | 183 | 262 | 317 | the exact rest composition |
| `admission-open` | 3 | 33 | 242 | bookkeeping |

Two observations the orchestrator should act on:

1. **`stable-cadence-wait` is 5 193-5 298 ms on EVERY arena and EVERY run** —
   a spread of 105 ms across cold loads and switches, heavy arenas and test1.
   That is not compile work that happens to take five seconds; it is a fixed
   wait. It is ~25% of every deploy and it is the same on the cheapest arena as
   on the most expensive. **This is the most promising single cut in the whole
   load path and nobody has looked at it, because until this commit it was
   invisible.** It must not be shortened blindly — it exists so deferred driver
   work or a collection cannot spill into the first controllable frame, and pass
   79's evidence for that is real — but "is the bound still the right bound on
   this machine in 2026" is now a question with an instrument behind it.
2. **`weapon-switch-rehearsal` is the largest step, 5.8-8.9 s**, and it does not
   scale with the arena (test1 pays 5.8-6.6 s). Like the weapon catalogue
   prewarm it is deliberately arena-independent; unlike it, nobody has measured
   what it costs until now.

Together those two are **12.5 s of a 20-25 s admission**. Neither is touched by
this pass — attributing them was the job; cutting them needs its own lane with
the frame-pacing evidence pass 79 built.

## 6. Job 4 — the ~3.5 s serialized rehearsal cut: NOT LANDED, and why that is the right call

VERIFIED from tonight's baseline first loads: inside `prewarm-batched-effects`
(13.2-19.7 s on a first load, the largest phase of the transition) the seven
concurrent families run under one `Promise.all` and the last three are
SERIALIZED, because each stages a transient world PointLight and three r185
folds the visible light graph into every render object's cache key. So the phase
is `max(concurrent) + sum(serialized)`, and on a first load the serialized tail
is the majority of it:

| arena (baseline first load) | max(concurrent) | flare | flamethrower | killstreak | serialized tail | phase |
|---|---|---|---|---|---|---|
| gun-range | 4474 | 3955 | 697 | 4118 | **8770** | 13247 |
| atomic-acres | 5897 | 6456 | 573 | 2615 | **9644** | 15547 |
| high-seas | 8118 | 5667 | 788 | 5116 | **11571** | 19696 |

The proposed cut is to drop BOTH arena-side first-shot rehearsals, because
`prewarmMatchBoundFirstShotPresentations` at deploy already rehearses both exact
compositions on every arena before admission.

**It is not landed, on this lane's own measured evidence.** The first pass ran
exactly half of this experiment: `2f8cc780` dropped the flare rehearsal on the
arenas whose authority cannot spawn a flare gun, and the measured result over 56
switches was that the cost did not disappear — it MIGRATED to whichever
staged-light rehearsal ran first (flare 3273 -> 0 while flamethrower 438 -> 3556
on atomic-acres, and the same shape on three more arenas), netting ~0 ms. That
identifies the ~3 s as a **fixed warm-up paid by the first staged-light
rehearsal in the sequence**, not as any one weapon's cost. Removing the other
one predicts the warm-up simply lands on `killstreak-vocabulary`, which is the
next light-graph flip and already reads 4.1-5.1 s on tonight's baseline first
loads. Landing that on arithmetic, in a window with no capacity to run the
before/after that would settle it, is precisely the mistake that got the first
pass held.

**OPEN, specified for the next lane, with the experiment written out:** remove
both arena-side rehearsals, run the interleaved A/B in section 3 on the four
heavy arenas, and read `flare-first-shot` + `flamethrower-first-shot` +
`killstreak-vocabulary` + the new `match-bound-first-shots` admission step
together. The cut only wins if the SUM of those four falls; if only the first two
fall it has moved work, not removed it, and the `match-bound-first-shots` step
that commit `8715aa8c` now publishes is the counter that will show it.

### Also left uncut, with reasons

- **`weaponPrewarmCatalogForArena` returns every weapon on purpose.**
  `src/weapon-prewarm-catalog.ts` documents that shrinking it for Gun Range
  forces every normal-match model through a second decode/compile cycle on the
  next switch. Untouched. (It is nonetheless 5.8-7.4 s of a first load; a cut
  here needs the cross-switch cost measured, not assumed.)
- **`bot-world-weapons` (4.2 s on a first load).** Any remote combatant can carry
  any weapon; there is no arena-derived predicate that can scope it, and an
  arena-scoped guess would be a correctness bug.
- **The admission fence, the light-set freeze.** `flushWebGpuFrames(12_000)` is
  untouched — VERIFIED: 0 occurrences in this pass's diff, all call sites intact.
  No light is toggled at runtime by anything in this pass.

## 7. Gotcha worth keeping (cross-harness)

**Symptom → Cause → Correction → Verify.**

*Symptom.* Two load-time measurements of the same pair of builds, taken 40
minutes apart on the same machine, disagreed about a first load by 30% — and the
first pass of this lane published one of them as a 52% regression while a later
run of the same baseline read 15% differently.

*Cause.* Every browser QA harness on this machine samples the room ONCE, at
launch, and stamps that number. On a workstation running three PASS 87 lanes,
another lane's headless Chrome can start after your guard has passed and
compete for the same GPU submission queue for the whole sweep. Free VRAM does
not show it: contention is for the queue, not the memory, and a 12 s admission
fence is exactly the thing that loses to it.

*Correction.* Do not compare two BLOCKS of measurements. Interleave the arms:
for each unit of work (here, each arena) run baseline then candidate back to
back, minutes apart, each as its own process with its own receipt. Contention
then lands on both arms instead of being assigned to one. Keep an INTERNAL
CONTROL in every row — a quantity the change cannot touch — and read every
delta against it; a row whose control moved as much as its total did not
measure the code.

*Verify.* `machine.rivalPlaywrightBrowsersAtLaunch` and the 60 s sample max in
each receipt, plus the control column: in this lane's decisive row (high-seas)
the control moved x1.02 while the phase under test moved x1.69, which is what
makes that row evidence rather than an anecdote.

## 8. Open items for the orchestrator

1. **OPEN — the eight/ten-arena boot smoke was not re-run in this window.**
   PASS 86 ran it 12/12 on `aa9befca`, the head this branch merges. This pass's
   source change alters the cold-session transition on every arena, so it wants
   the boot smoke, and farcrysis (not selectable, therefore not in the switch
   matrix) is the arena whose cold-session protection this change reasons about.
   The switch matrix run below does first-load into all NINE selectable arenas as
   its chunk starts, which covers everything except farcrysis. **Run
   `PASS73_NATIVE_WEBGPU=1 npm run qa:pass74:arena-boot-smoke` before merging.**
2. **OPEN — no screenshot comparison.** Job 4 of the brief says "look at them".
   No PNG was produced by this lane, in either pass. The changes add no material,
   geometry, light or art-direction value — they choose a precompile root and
   stamp timing markers — and `src/rendering/art-direction.test.ts` passes
   unchanged. That is an argument, not a measurement.
3. **OPEN, AND NOW THE LANE'S BIGGEST DEBT — the in-session switch relief costs
   a measured median +7.9 s (section 13a) and it is not cut.** The mechanism is
   named: ~46 extra `async` pipelines realised off the fence on every switch,
   for every arena, where PASS 86 realised them for farcrysis only. Three
   candidate cuts, in the order this lane would try them, each needing a full
   72-pair paired sweep to accept:
   - **Scope the switch relief the way step 1 scoped the cold-session one**
     (`arena.root` rather than the whole scene). On a cold session that
     recovered 2 932 ms of 8 583. `2a72720d` deliberately refused to narrow it
     because a narrower relief is what loses the 12 s fence — so this needs the
     matrix, not an argument.
   - **Ask the same evidenced authority the cold session asks**
     (`src/rendering/cold-session-precompile-reach.ts`): give the wide relief
     only to the ordered pairs MEASURED to blow the fence (the failing class was
     `atomic-acres -> high-seas`, plus HF-417's Gun Range), and PASS 86's
     behaviour to the rest. The module and its floors already exist.
   - **Overlap it with the transition instead of preceding it** — the relief is
     off-fence but it is still serial with the switch. Blocked behind three
     r185's serial `for await` (section 4a) for anything better than one
     pipeline in flight.
   **Do not land any of these without the paired 72-pair sweep.** Landing an
   unmeasured relief narrowing is what got the first pass held.
4. **OPEN — Job 4's serialized-rehearsal cut**, specified in section 6 with the
   experiment and the counter (`match-bound-first-shots`) that decides it.
5. **OPEN — Job 3's parallel compileAsync**, blocked inside three r185's own
   `for await` (section 4a). It is the largest remaining lever on every
   precompile in the game and it needs a lane with a pixel gate.
6. **STRIKE — Job 3's "menu-time prewarm scoped to the picked arena"** is
   forbidden by `AGENTS.md` ("Browsing the menu must construct zero gameplay
   arenas..."). It should come off the job list, not be carried forward.
7. **ORCHESTRATOR DECISION — wire `qa:pass85:arena-switch-matrix` into a group,
   or record why not.** Unchanged from the first pass: it is an npm script in no
   CI group, which is the exact state the boot smoke sat in for months. It needs
   a real WebGPU device (installed Chrome) and ~60-75 min for 72 edges, against a
   2100 s ceiling on the largest bounded-e2e group, and `run-bounded-e2e.mjs`
   (outside this lane's ownership) invokes the Playwright CLI and cannot run a
   node probe.
8. **NOTE — the in-combat tripwire reads 1, not 0, on other builds too.**
   The brief states the PASS 82 invariant as "in-combat creations MUST stay 0".
   `renderPipeline_MeshBasicMaterial_774` is created once in window on HF-410's
   atomic-acres receipts (374/1) and on lane H's own PASS 85 after-build
   (398/1) — builds this lane did not touch. CORRECTED from the first version,
   which credited these to "Lane A on the shipped build" and implied a
   high-seas precedent: **there is no shipped-build high-seas tripwire receipt
   in this repository**, so "this lane did not introduce the 1" is CLAIMED. The
   falsifier is one 75 s tripwire run on the baseline dist against high-seas.
9. **OPEN — 38 of the 72 ordered pairs were not walked** (was stated as 31; see
   the re-totalled coverage table in section 13). **10 of the 38 involve
   nuketown2**, whose real switch coverage is 2 of 8 outgoing and 4 of 8
   incoming, not the 8/8 the first version of this report claimed. Buy those ten
   first. The probe fix `e89492af` is now exercised (the two re-run outgoing
   edges and the paired sweep in section 13a both run through it).
10. **NOTE — commit trailer conflict, unresolved.** The brief mandates
   `Co-Authored-By: Claude Opus 5.1`; the harness system prompt mandates
   `Claude Fable 5.1`. Every commit in this lane follows the brief.

## 9. Ownership and boundaries

- Files changed by this pass: `src/legacy-main.ts` (the `// LOAD-CUT:` region of
  the arena transition and the match-admission block — both explicitly in this
  lane's ownership per the addendum), `src/rendering/cold-session-precompile-reach.ts`
  and its test (new, under `src/rendering/`), `src/presentation-prewarm-contract.test.ts`
  (this lane's own pin, made tighter), `scripts/qa/*` (this lane's instruments),
  `package.json` (merge conflict resolution only, both sides kept).
- **Not touched**: viewmodel, weapons, thermal, lobby/netcode, spawns, water
  constants, `src/rendering/arenas/farcrysis.ts` (Lane C's). The farcrysis
  cold-session relief is expressed in a NEW module rather than by editing Lane
  C's arena file, so this pass creates no conflict with Lane C.
- **`src/arena-special-weapon-reach.ts` and its test sit at `src/` root, not
  under `src/rendering/`, and they gate WEAPON prewarm reach — a word the
  brief's boundary list excludes.** They are carried under an **explicit
  orchestrator exception**: the 22:18 cut instruction said to keep the flare-gun
  reach fix when the rest of lane H was held. Recorded here so no future lane
  reads it as precedent for a lane touching `weapons` on its own authority.
- **PROPOSED PATCH, OUTSIDE THIS LANE'S OWNERSHIP — not applied.**
  `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` writes receipts that cannot
  name the build they measured. Port the `distBundle` stamp from `b4ee52d9`
  into it — line 116, the `report` initialiser:
  ```js
  // add alongside `dist: DIST,`
  distBundle: (readdirSync(join(DIST, 'assets')).find((f) => /^legacy-main-.*\.js$/u.test(f)) ?? null),
  gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  gitDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  ```
  (`readdirSync` is already imported at line 61; `execFileSync` is not — add it
  to the `node:child_process` import.) Purely additive: no behaviour, no
  threshold, no timeout changes. The owner of that instrument applies it.
- **No gate, threshold, timeout or test was weakened.** `flushWebGpuFrames(12_000)`
  is untouched (4 call sites intact; 0 hits in the source diff). The one pin
  this pass edited is this lane's own, and every edit ADDED assertions:
  the exact precompile guard, the exact root expression, the ancestor walk, the
  attachment fallback, exactly-one-precompile-call, plus the pre-existing
  zero-arena-id assertion which still passes.
- No ShaderMaterial / RawShaderMaterial / onBeforeCompile introduced. No imported
  mesh, image, font or LUT. No art-direction value changed.
- `src/legacy-main.ts` remains pure LF (0 CRLF) after every edit; all edits were
  made with `newline=''` writers.

## 10. Commits in this pass (on top of the merge `a2efa280`)

| commit | what it lands |
|---|---|
| `8715aa8c` | match-admission phase profiler — markers only, every pinned string intact |
| `2535686c` | probe reads the admission profile; `--rival-wait-attempts`; summariser prints first-load per-phase attribution and admission steps |
| `43247daf` | the off-fence precompile's cold-session root scoped to the arena (measured: -2.9 s of the +8.6 s) |
| `81f6d2c1` | first-load A/B summariser that reads every delta against an internal control |
| `b4ee52d9` | receipts stamp `distBundle` — the build measured, not the tree the probe ran from |
| `89d760ba` | cold-session relief asked of an evidenced authority; switch relief unconditional and unchanged |
| `193138eb`, `44c0a35b`, `b32116f6` | evidence: six interleaved A/B pairs, three tripwires |
| `8a82ff95`, `1c80b083` | this report |
| `2a72720d` | both surviving cases take the whole scene — no arena gets a narrower relief than it ships with |
| `e89492af` | probe floors: no no-op first load, and the live match must be on the arena that was asked for |
| `5d5517ab`, `6f263a2d`, `0635ff04` | report, switch-matrix receipts, exit-gate table |
| `bbf2b6f5` | drop the comment for the attachment check `2a72720d` removed |
| `a196a3ae` | complete the commit table |
| **repair pass, after the skeptic** | |
| `b6178399` | probe: `rivalPlaywrightBrowsersMaxDuringRun` is `null` when the room was sampled <= once; `--max-edges` for a bounded PAIRED sweep |
| `2ccd58ad` | the "nuketown2 8/8 outgoing" correction, the re-totalled coverage (33/34 of 72), and three claim-state downgrades |
| `9ec78a60` | **the paired switch sweep: 10/10 pairs slower, median +7 857 ms, async pipelines 13-40 -> 56-76** |
| `56c41644` | boot smoke 12/12 on this branch, farcrysis and nuketown2 included |

## 11. Verification

**Repair pass (2026-09-03), re-run after the skeptic's findings:**
- `npx tsc --noEmit` -> **exit 0**.
- `npx vitest run src/rendering/cold-session-precompile-reach.test.ts
  src/presentation-prewarm-contract.test.ts src/arena-special-weapon-reach.test.ts
  src/arena-switch-matrix-roster.test.ts src/rendering/art-direction.test.ts
  src/rendering/arena-coverage-prewarm.test.ts` -> **6 files / 53 tests passed**.
- `node --check` on all four touched `scripts/qa/*.mjs` -> clean.
- Line endings by byte count: `src/legacy-main.ts` **0 CRLF / 36 553 LF**; every
  other edited file 0 CRLF, this report included.
- `git diff aa9befca..HEAD -- src/ | grep -cE
  'ShaderMaterial|RawShaderMaterial|onBeforeCompile'` -> **0**;
  `grep -c 'flushWebGpuFrames(12_000)' src/legacy-main.ts` -> **4**.
- `git ls-files artifacts` -> **empty**. The repair pass changed **no source
  file**: its diff is `scripts/qa/probe-arena-switch-matrix.mjs`, this report and
  evidence under `docs/evidence/pass87/lane-h2/`.
- Boot smoke **12/12** (section 13b); paired switch sweep 10/10 + 6/10 edges
  committed, 0 failed (section 13a).


- **`npx tsc --noEmit`: exit 0** at both source commits that changed behaviour,
  `89d760ba` and `2a72720d`. (It was
  NOT clean on the first attempt — `cold-session-precompile-reach.ts` had an
  unsound type predicate, caught and fixed before the build that every
  measurement below used.)
- **Focused vitest: 7 files / 64 tests pass at `89d760ba`, and the two pinned
  files re-run at `2a72720d` (2 files / 26 tests)** —
  `rendering/cold-session-precompile-reach` (new),
  `presentation-prewarm-contract`, `arena-special-weapon-reach`,
  `arena-switch-matrix-roster`, `rendering/arena-coverage-prewarm`,
  `rendering/pass64-tsl-scene`, `rendering/art-direction`. Then the whole of
  `src/rendering/` — **28 files / 367 tests pass, 0 fail**, which includes the
  art-direction bounds and cross-arena distinctiveness floor. Full suite NOT run,
  per brief.
- **`flushWebGpuFrames(12_000)` untouched**: **4 call sites intact** in
  `src/legacy-main.ts`, and **0 hits in the SOURCE diff**. (Correction: the first
  version said "0 occurrences in this pass's diff". `git diff a2efa280..HEAD |
  grep -c flushWebGpuFrames` is **3**, not 0 — all three are prose inside this
  report. Cosmetically wrong, substantively right; the fence is not touched.)
- **No ShaderMaterial / RawShaderMaterial / onBeforeCompile** introduced: 0
  occurrences in the diff.
- **`src/legacy-main.ts` is pure LF** (0 CRLF) after every edit.
- **Worktree clean**, every change committed to this lane's branch with explicit
  paths. Nothing force-added under `artifacts/`; tracked evidence is under
  `docs/evidence/pass87/lane-h2/` and is 168 KB total, no file over 400 KB.
- **Headless only.** Every browser this pass launched was
  `chromium.launch({ headless: true, channel: 'chrome' })` with
  `--window-position=-32000,-32000`. No headed browser at any point, no window
  focused, no pointer lock.
- **No process this lane did not start was killed.** Two other PASS 87 lanes'
  browsers were live throughout and were left alone. The one chain this lane
  stopped mid-run was its own (a superseded gate run measuring a build about to
  be replaced), stopped by PID after confirming the parent was this session's
  own `bash`/`node`.
- **ComfyUI idle** for the whole window (`GET /queue` empty), and every receipt
  stamps its own free-VRAM and rival-browser reading.

## 12. What the orchestrator has to decide

1. **Merge or hold — and the trade has to be named, because the hold had TWO
   measured causes and this pass repaired one.**
   The 22:18 hold (ledger, "Lane H decision 22:18") cited (a) first loads
   regressed and (b) paired whole-switch time slower, median **+488 ms** on
   31/55 edges. (a) is repaired and measured (section 3a). (b) is this lane's
   single remaining behavioural delta versus PASS 86 — the off-fence precompile
   widened to every arena on an IN-SESSION switch — and section 13a is the only
   paired re-measurement of it taken in this pass; read it before deciding.
   Net measured first-load delta versus PASS 86 is approximately **zero**
   (gun-range 57 093 -> 57 484, high-seas 64 519 -> 65 652). Against the owner's
   "load every map much faster" this is therefore a **correctness and
   instrumentation** pass, not a speed pass.
   **What the +488 ms buys is an arena that an in-match switch could not enter
   at all** (HF-417: switching into Gun Range blew the 12 s fence and left the
   previous arena committed). That is the trade. Either:
   - **(a) merge on the correctness case**, and record in the cut report that
     in-session switch time is accepted as slower-by-about-half-a-second for
     PASS 87, with a paired 72-pair before/after booked for PASS 88; or
   - **(b) hold again** and spend one quiet window on the full paired sweep.
     `--max-edges` (landed this pass) makes a bounded version of it affordable;
     the full 72 needs ~70 min per arm.
2. **Which of the three specified cuts gets a PASS 88 lane**, in the order this
   lane would rank them by measured size:
   - `stable-cadence-wait`, a **fixed 5.2-5.3 s on every deploy on every arena**
     (section 5). Largest, most constant, entirely unexamined, and it is a
     safety bound from pass 79 — so it needs the frame-pacing evidence, not a
     smaller number.
   - `weapon-switch-rehearsal`, **5.8-8.9 s per deploy**, arena-independent.
   - three r185's serial `compileAsync` (section 4a), which is the multiplier
     under every precompile in the game.
3. **Strike "menu-time prewarm" from the job list** (section 4b) — `AGENTS.md`
   forbids it.
4. **The boot smoke** (section 8, item 1). Note the reasoning in section 13: after
   `2a72720d` the cold-boot path this branch takes is PASS 86's on every arena,
   so the boot smoke's marginal value against THIS diff is low — but PASS 86's
   12/12 was taken on `aa9befca`, not on this branch, and running it is cheap
   next to a publish.

## 13. Gate results (this pass, final build `89d760ba`)

### In-combat pipeline tripwire (PASS 82 invariant), 75 s each

**Which build these three receipts measured — corrected.** The first version said
"the final build". They were taken 00:50-00:57 and committed at `b32116f6`,
*before* the final source commit `2a72720d`, and
`probe-pipeline-compile-stalls-cdp.mjs` records **no `distBundle` and no
`gitSha`** — only `dist: <path>`. So the receipt **cannot name the build it
measured**, which is precisely the defect commit `b4ee52d9` fixed for the
switch-matrix probe and did not fix here. The argument that it does not matter is
sound and independently checkable — `git diff 89d760ba..2a72720d` touches only
the `precompileRoot` expression, reachable only on a **cold load of farcrysis**,
which is `selectable: false` and is not one of these three arenas — but that is
an argument, not the receipt. **CLAIM-STATE: counts VERIFIED; build attribution
CLAIMED.** The one-line patch that would close it is in section 9 (it lives in a
file outside this lane's ownership, so it is proposed, not applied).

| arena | pipelines before window | **in window** | in a stall | shader modules in window |
|---|---|---|---|---|
| gun-range | 264 | **0** | 0 | 0 |
| high-seas | 251 | **1** | 0 | 0 |
| atomic-acres | 374 | **0** | 0 | 0 |

The counts are VERIFIED. The **provenance** of the `1` was mis-stated in the
first version of this report and is corrected here.

- **VERIFIED:** the probe's `samplePipelineLabels` names the in-window creation
  `renderPipeline_MeshBasicMaterial_774`, with its creation stack.
- **VERIFIED:** the same pipeline label appears, one creation in window, on
  builds this lane did not touch — `docs/evidence/pass85/hf410/pipeline-compile-repair-run1.json`
  and `run2.json` (**HF-410's receipts, arena atomic-acres, 374 before / 1
  during**) and `docs/evidence/pass85/lane-h/qa/pipeline-tripwire-after-atomic-acres.json`
  (**lane H's own PASS 85 after-build, atomic-acres, 398 / 1**).
- **CORRECTED:** the first version credited those to "Lane A on the SHIPPED
  build" and to **high-seas**. Neither is right. They are HF-410's and lane H's
  own, and all three are **atomic-acres**. **No shipped-build tripwire receipt
  for high-seas exists anywhere in this repository** (`find docs/evidence -name
  '*tripwire*'` returns five files: the three above plus this lane's four, and
  none of the prior ones is high-seas).
- **CLAIM-STATE: CLAIMED, not VERIFIED** — "this lane did not introduce the
  high-seas creation" rests on (a) the label being pre-existing elsewhere and (b)
  this lane's diff containing no material, geometry or light change that could
  create a `MeshBasicMaterial`, not on a high-seas before/after. The honest
  falsifier is one 75 s tripwire run on the baseline dist against high-seas; it
  was not taken.

Two of the three arenas read **0**, including atomic-acres at 374 before where
HF-410's atomic-acres receipt at the same 374 read **1** — so on this build the
invariant is met on gun-range and atomic-acres and missed by one on high-seas.
The brief states the invariant as "in-combat creations MUST stay 0";
that is not the shipped state either, and it is a standing item for whoever owns
that invariant — not something to be silently reported as green.

Note the room: the high-seas window recorded 219 stalls and 33.3% frozen with 36
rival Chrome processes on the GPU. The tripwire is a COUNT gate, not a timing
gate, so contention does not invalidate the counts — but the stall figures in
that receipt are not a frame-pacing measurement and must not be quoted as one.


## 13a. THE PAIRED SWITCH MEASUREMENT — the hold's SECOND cause, measured for the first time

**This section is new in the repair pass, it is the most important thing in this
report, and it does not say what the lane hoped it would say.**

The 22:18 hold had two measured causes. Cause (a), first loads, is repaired
(section 3a). Cause (b) — **paired whole-switch time slower, median +488 ms on
31/55 edges** — had never been re-measured, and the first version of this report
recorded it as "NOT ESTABLISHED" and left it there. It is now measured.

**Instrument.** `--max-edges 10` (landed this pass) walks the first ten ordered
pairs of the same Eulerian chain on both builds, so the two arms walk the
IDENTICAL pair sequence. Baseline dist = `aa9befca` (`legacy-main-BOIBEQDQ.js`,
worktree `aa-loadcut-base`); candidate dist = this branch
(`legacy-main-BZjJAeqa.js`). Both through the FIXED probe (`e89492af`), headless
installed Chrome, hardware WebGPU, ComfyUI idle.

### The result

| ordered pair | baseline ms | candidate ms | delta | ratio | baseline pipelines (sync/async) | candidate pipelines (sync/async) |
|---|---|---|---|---|---|---|
| atomic-acres -> skyline-terminal | 15 143 | 18 699 | **+3 556** | 1.23 | 238 (215/23) | 295 (226/**69**) |
| skyline-terminal -> atomic-acres | 16 312 | 21 541 | **+5 229** | 1.32 | 256 (218/38) | 292 (226/**66**) |
| atomic-acres -> rustworks-1v1 | 24 442 | 34 667 | **+10 225** | 1.42 | 289 (268/21) | 335 (260/**75**) |
| rustworks-1v1 -> atomic-acres | 19 273 | 24 762 | **+5 489** | 1.28 | 279 (241/38) | 325 (258/**67**) |
| atomic-acres -> gun-range | 23 876 | 41 182 | **+17 306** | 1.72 | 275 (255/20) | 321 (245/**76**) |
| gun-range -> atomic-acres | 18 445 | 34 545 | **+16 100** | 1.87 | 315 (275/40) | 355 (279/**76**) |
| atomic-acres -> high-seas | 30 576 | 51 319 | **+20 743** | 1.68 | 244 (231/13) | 274 (216/**58**) |
| high-seas -> atomic-acres | 20 658 | 32 968 | **+12 310** | 1.60 | 288 (250/38) | 336 (263/**73**) |
| atomic-acres -> test1 | 11 868 | 15 737 | **+3 869** | 1.33 | 192 (174/18) | 223 (167/**56**) |
| test1 -> atomic-acres | 17 658 | 22 076 | **+4 419** | 1.25 | 291 (253/38) | 339 (263/**76**) |

**VERIFIED: 10 of 10 ordered pairs are SLOWER on the candidate. Paired median
delta +7 857 ms; ratios 1.23 to 1.87. Zero edges failed on either arm; the
switch-matrix gate itself is still 10/10 committed on both builds.**

### Why this is not the room

The lane's own gotcha says a two-block design under contention is worthless, and
this measurement is a two-block design. Three things carry it anyway:

1. **An internal control inside the same receipts.** Each arm's chunk begins with
   a COLD first load into atomic-acres — same page, same probe, same code path in
   both builds after `2a72720d`. Baseline 48 373 / 49 111 ms (mean 48 742);
   candidate 47 859 / 45 920 ms (mean 46 890). **The candidate's control is 3.8%
   FASTER.** A room slow enough to add 23-87% to every switch would not leave the
   cold load faster.
2. **Two independent candidate runs, in two different rooms, agree.** The first
   candidate arm ran at 17 rival Playwright Chromes (it died at edge 7 of 10 with
   `Target page, context or browser has been closed` — an environment failure,
   6/6 edges committed): paired median vs the same baseline **+8 500 ms**. The
   second ran at 9-10 rivals: **+7 857 ms**. Receipts
   `paired-switch-cand-loud.json` and `paired-switch-cand-quiet.json`.
3. **A contention-IMMUNE quantity moves with it.** Pipeline COUNT does not depend
   on how busy the GPU is. The candidate creates **+30 to +57 more render
   pipelines per switch**, and the split says exactly where: **`sync` is flat
   (±10) while `async` goes from 13-40 to 56-76 on every single edge.** Shader
   modules rise with it (+37 to +61). That is the off-fence (async, `compileAsync`)
   precompile, widened from farcrysis-only to every arena — this lane's one
   remaining behavioural delta versus PASS 86, doing more work on every switch,
   by design.

### What it means

**The mechanism is now attributed, not inferred.** The HF-417 relief realises
~46 more async pipelines per in-session switch, and on this bounded prefix that
costs a median **+7.9 s** of whole-switch time — an order of magnitude more than
the +488 ms the first pass measured, on a different (atomic-acres-hubbed) edge
set and against a baseline that was not itself contended.

**CLAIM-STATE.** VERIFIED: 10/10 pairs slower, the median, the ratios, the
async-pipeline attribution, the internal control, and the agreement of two
candidate runs. CLAIMED: that the effect size generalises to all 72 ordered
pairs — n=1 per arm per edge, one prefix, ten pairs, and this prefix is
atomic-acres-hubbed (8 of its 10 edges touch the heaviest arena in the game).
OPEN: the full 72-pair paired sweep, ~70 minutes per arm.

**This does NOT change what is landed, and deliberately so.** The obvious cut —
narrow the switch relief the way step 1 narrowed the cold-session one — is
exactly the change `2a72720d` refused to make, because a narrower relief is what
loses the 12 s fence, and there is no window left to re-walk 72 pairs and prove
it did not. Landing an unmeasured relief narrowing at 04:00 is what got the first
pass held. It is specified in section 8 instead.

### The trade, stated plainly for the orchestrator

Merging this lane buys **an arena an in-match switch could not enter at all**
(HF-417: switching into Gun Range blew the 12 s fence and left the previous arena
committed) and pays **a median +7.9 s, worst measured 1.87x, on in-session
switches**, on top of a first-load delta of approximately zero. That is the whole
decision. It is not the "load every map much faster" the owner asked for.

**Receipts:** `docs/evidence/pass87/lane-h2/qa/paired-switch-base-aa9befca.json`,
`paired-switch-cand-quiet.json`, `paired-switch-cand-loud.json` — each names its
own `distBundle`, its rival-browser samples and its free VRAM.


### Arena switch matrix — 72 ordered pairs (9 selectable arenas)

The roster GREW since the first pass: PASS 86 shipped Nuke Town Rebuild
(`nuketown2`) as a ninth selectable arena, so the matrix is 72 ordered pairs, not
56, and **no instrument has ever exercised an in-session switch into or out of
nuketown2**. That alone is worth the run.

**What the run measures, and what it transfers to.** It was launched against the
dist built from `89d760ba`. The final source commit is `2a72720d`, and the ONLY
behavioural difference between them is the precompile ROOT on a cold session **of
an arena the authority names** — i.e. farcrysis, which is `selectable: false` and
therefore appears in neither the matrix roster nor any of its first loads. For
every pair and every cold load this run performs, `89d760ba` and `2a72720d`
execute the same code. The receipt names the bundle it measured (`distBundle`,
added this pass) so that is checkable rather than asserted.

**Why this is the run worth the remaining window, and not the boot smoke.** After
`2a72720d` the only path in this branch that differs from PASS 86 at all is the
in-session switch (unconditional relief). Cold sessions take PASS 86's sequence:
identical for the named arena, identical-with-no-precompile for every other. The
boot smoke exercises cold boots — the paths that no longer differ. The switch
matrix exercises the path that does, and it is the only instrument in the
repository that performs an in-session map switch.

### Result — PARTIAL, and the reason is the machine, not an edge

**VERIFIED: 25 of 72 ordered pairs walked, 0 failed, 0 fence-exceeded errors, and
all 4 cold loads reached an active match on the requested arena.** The run then
aborted with `page.evaluate: Target page, context or browser has been closed` —
the headless Chrome went away mid-chunk with 47 rival Playwright Chrome processes
on the GPU (the probe's own 60 s sampler, 29 samples). That is an INSTRUMENT/
ENVIRONMENT failure, not an arena failure: no edge in the run reports `ok:false`
and `summary.failedPairs` is empty.

The receipt is `docs/evidence/pass87/lane-h2/qa/switch-matrix-h2-after-partial.json`
and it names the build it measured on its face (`distBundle:
legacy-main-BZjJAeqa.js`). **`gitDirty: true` — the source tree carried the
uncommitted step-3 edit at the time; the DIST is the committed `89d760ba` build,
and `distBundle` is what proves it.**

Covered by the aborted run: all 8 outgoing edges from atomic-acres, 6 of 8 from
skyline-terminal, and cold loads into atomic-acres (x2) and skyline-terminal
(x2). Missing: 47 pairs.

### Continuation — the arena that has never been switch-tested

With the window left, coverage was spent on `nuketown2` rather than on more of
the same pairs. It shipped as a selectable arena in PASS 86 **hours ago and no
instrument has ever performed an in-session switch into or out of it** — every
arena-loading gate in this repository boots straight into an arena, which is
precisely how Gun Range shipped unreachable-by-switch in PASS 84 with every gate
green. Result below.

**Result — nuketown2. THE FIRST VERSION OF THIS TABLE WAS FALSE; here is the
corrected one.**

| direction | rows recorded | GENUINE nuketown2 edges | note |
|---|---|---|---|
| `nuketown2 -> *` (8) | 8 | **1** (+1 re-run = **2**) | 7 rows are MISLABELLED — they departed the previous target, not nuketown2 |
| `* -> nuketown2` (8) | 8 | **4** | the other 4 rows are `nuketown2 -> nuketown2`, VOID, disclosed in the first version |

### CORRECTION (repair pass, 2026-09-03) — "8/8 outgoing" was false, and the lane's own receipt proves it

The first version of this report claimed `nuketown2 -> *` was **8 of 8 committed,
one chunk, chained correctly**. That is **FALSE**, by the exact defect this lane
diagnosed for the INCOMING sweep and then failed to apply to the OUTGOING one.
An independent skeptic found it; it is re-derived here from the committed
receipt rather than taken on trust.

`h2-after-nuketown-out.json` was taken at `5d5517ab` — **before** this lane's own
probe fix `e89492af`. It ran `--sources nuketown2` over one page, so after edge 1
the live match was on `skyline-terminal` and the walker had to re-establish
`nuketown2` as the source before every later edge. The pre-fix walker had neither
the return-to-menu nor the `matchArenaId !== source` assertion, so every
re-establishment was a **no-op**. Its own `firstLoads` array says so:

| # | arena asked for | first-load ms | deployMs | verdict |
|---|---|---|---|---|
| 1 | nuketown2 | **41 648** | **21 189** | genuine |
| 2-8 | nuketown2 | 399 / 428 / 564 / 593 / 711 / 763 / 1 147 | 146-371 | **no-op** |

`switchEdge()` DOES return to the menu before selecting its TARGET, which is why
each target selection still did real work — from whatever arena was actually
live, i.e. the PREVIOUS target. So rows 2-8 measured, in order:

`skyline-terminal->rustworks-1v1`, `rustworks-1v1->gun-range`,
`gun-range->high-seas`, `high-seas->test1`, `test1->test2`, `test2->map3`,
`map3->atomic-acres` — every one of them labelled `nuketown2->*`.

**The measurement that settles it (VERIFIED).** Two genuine outgoing edges were
re-run through the FIXED probe (`e89492af`) on the same candidate bundle
(`legacy-main-BZjJAeqa.js`): `nuketown2->skyline-terminal` 23 713 ms / 284
pipelines and `nuketown2->rustworks-1v1` 25 189 ms / 275 pipelines, 2/2
committed — and the **second nuketown2 source re-establishment took 28 980 ms
(deploy 17 615 ms)** where the pre-fix receipt recorded 399-1 147 ms. Receipt:
`docs/evidence/pass87/lane-h2/qa/skeptic-nuketown-out-recheck.json`.

**Rows 2-8 of `h2-after-nuketown-out.json` are therefore VOID AS LABELLED.**
They are not void as measurements: each is a real, committed switch of the true
pair named above, and they are counted below under that true pair — never under
`nuketown2`. Commit `e89492af`'s message says "as do all eight outgoing edges
from nuketown2, which chained correctly in one chunk". **That sentence is wrong
and this section supersedes it.**

**nuketown2 in-session switch coverage is 2 of 8 outgoing (1 in the sweep + 1 new
from the re-run) and 4 of 8 incoming — not 8/8.** It remains the least
switch-tested arena in the game and the remaining 10 nuketown2 edges are the
highest-value pairs in the unwalked set.

**The four void rows are a defect in this lane's own probe, found by reading its
output rather than its exit code.** With `--targets nuketown2 --session-edges 2`
every second row reported `ok` with `selectMs` of 1-10 ms, 0 pipelines, and a
`transitionMs` byte-identical to the row above it. Cause:
`performArenaSelection` early-returns while `gameStarted` is true, so selecting a
new SOURCE while the previous edge's match was still live was a no-op; the
"deploy" that followed was also a no-op, `matchActive` was true, and the probe
walked `nuketown2 -> nuketown2` and called it `skyline-terminal -> nuketown2`.

**It reported green for a switch it never performed** — which is HF-417's own
defect class one level up, and it is fixed in `e89492af` with two floors: return
to the menu and wait for `gameStarted === false` before selecting, and ASSERT
after the first load that the live match is on the arena that was asked for,
naming both arenas when it is not. **NOT re-run** — the fix lands after the
window's last measurement, so it is CLAIMED, not verified.

The four REAL incoming edges all committed: `atomic-acres`, `rustworks-1v1`,
`high-seas` and `test2` into nuketown2, 157-241 pipelines each, 11.2-19.4 s.

### Switch-matrix coverage, RE-TOTALLED after the correction

The first version of this table said **37 of 72**. That was wrong three ways: it
counted seven mislabelled rows as nuketown2 departures, it double-counted two
pairs walked in two different receipts, and it presented row count as pair count.
Recomputed mechanically from the three receipts (replay the chunk walker, mark a
source re-establishment under 2 000 ms as a no-op, re-derive the true source,
then de-duplicate):

| | pairs |
|---|---|
| ordered pairs in the 9-arena matrix | 72 |
| edge ROWS recorded across the three receipts | 41 |
| rows whose source label is wrong (pre-fix no-op re-establishment) | 11 |
| — of those, rows that measured a real DISTINCT pair under another name | 7 |
| — of those, rows that were `nuketown2 -> nuketown2` (no switch at all) | 4 |
| duplicate pairs walked twice (`nuketown2->skyline-terminal`, `atomic-acres->nuketown2`) | 2 |
| **GENUINE distinct ordered pairs walked and committed** | **33** |
| **+ the fixed-probe re-run** (`nuketown2->rustworks-1v1`, new) | **34** |
| **not walked** | **38** |
| failed / fence-exceeded | **0** |

Reproduce the count:

```
node -e "…replay each receipt's chunk walker, treat firstLoads[i].ms < 2000 as a
no-op re-establishment, set trueSource = previous committed arena, drop
self-pairs, de-duplicate…"   ->  total rows 41, mislabelled 11, self-pairs 4,
unique as-labelled 39, unique TRUE distinct ordered pairs 33
```

**CLAIM-STATE: the 72-pair gate did NOT complete and this lane does not claim
it.** VERIFIED: **34 genuine ordered pairs committed, 0 failed, 0
fence-exceeded** on the candidate build. Of the 38 unwalked, **10 involve
nuketown2** — the arena the first version of this report believed was fully
covered. That is the run to buy first with the next quiet window.



## 13b. Boot smoke — RUN, and green

**VERIFIED: 12 of 12 canonical arenas boot a clean visible solo match on this
branch.** `PASS73_NATIVE_WEBGPU=1 npx playwright test
tests/e2e/pass74-arena-boot-smoke.spec.ts --project=chromium --workers=1
--retries=0` -> **12 passed (10.9 m), exit 0**, headless installed Chrome with a
real hardware WebGPU device (the spec's own first test refuses to run without
one) and its second test asserting the boot roster still names every arena module
on disk.

Arenas booted: `atomic-acres`, `skyline-terminal`, `rustworks-1v1`, `gun-range`,
**`farcrysis`**, `high-seas`, `test1`, `test2`, `map3`, **`nuketown2`**.

Two of those matter for this lane specifically:
- **`farcrysis`** is the arena the cold-session precompile guard reasons about,
  it is `selectable: false`, and therefore **no switch matrix can ever reach it**.
  The boot smoke is the only instrument that exercises it, which is exactly why
  the skeptic asked for this run. It boots.
- **`nuketown2`** shipped in PASS 86 and its switch coverage is still 2/8 + 4/8
  (section 13); its cold boot is now verified on this branch.

The spec's web server runs `vite build()` from THIS worktree and previews it, so
this is this branch's code, not a retained channel: the freshly built game bundle
is `dist/channels/pass86/assets/legacy-main-DvXBviTB.js`, written at 03:54 by
this run, and `?release=latest` resolves to it. **Side effect worth knowing:**
that build replaced the root `dist/assets/legacy-main-BZjJAeqa.js` the
switch-matrix and A/B receipts name, so re-running those probes needs a fresh
`npm run build` first.

Receipt: `docs/evidence/pass87/lane-h2/qa/boot-smoke-12of12.txt`.
Exit-gate criterion "boot smoke 9/9" — **MET, at 12/12.**

**Bundle bookkeeping, VERIFIED and worth stating.** Every switch-matrix, paired
and first-load receipt in this lane names the candidate bundle
`legacy-main-BZjJAeqa.js` — the dist built at `89d760ba`, which was never rebuilt
after the step-3 source commit `2a72720d`. `npm run build` on the final tree
produces `legacy-main-DvXBviTB.js`, and that is what the boot smoke exercised and
what `dist/` now holds. The two differ only in the cold-session precompile ROOT
for an arena the authority names — farcrysis, `selectable: false`, absent from
every matrix roster and every A/B arena — so for every pair, cold load and switch
this lane measured, they execute the same code. The boot smoke is the one
instrument here that ran on `DvXBviTB`, and it is also the only one that boots
farcrysis: **the arena where the two bundles could differ is the arena the newer
bundle was tested on.**


## 14. Exit gate, line by line

| gate criterion | state |
|---|---|
| no arena's first load slower than the quiet-GPU baseline | **MET on the two arenas that failed it** (gun-range x1.01 vs control x1.04; high-seas x1.02 vs control x0.99, both inside the baseline's own ±1% run-to-run spread). CLAIMED for the other seven: their cold-session path now takes PASS 86's sequence, so there is no mechanism for a difference, but they were not measured. |
| no arena's in-session switch slower than baseline | **FAILED, and now measured (section 13a).** Paired over the same 10 ordered pairs on both builds: **10 of 10 slower, median +7 857 ms, ratios 1.23-1.87**, with the mechanism attributed to `async` pipelines per switch rising 13-40 -> 56-76 (a contention-immune quantity) and the cold-load internal control 3.8% FASTER on the candidate. This was "NOT ESTABLISHED" in the first version of this report; it is established now, and it fails. CLAIMED that the effect size generalises to all 72 pairs (n=1 per arm, one atomic-acres-hubbed 10-pair prefix). |
| tripwire 0 on gun-range AND high-seas AND atomic-acres | **2 of 3 read 0**; high-seas reads 1, identified as the pre-existing `renderPipeline_MeshBasicMaterial_774` that the SHIPPED build also creates. Not introduced here, not met on the shipped build either. |
| switch matrix 56/56 (now 72/72) | **PARTIAL: 34/72 GENUINE ordered pairs committed, 0 failed, 38 not walked** (was mis-stated as 37/31; re-totalled in section 13). Ten of the unwalked involve `nuketown2`, whose real coverage is 2/8 outgoing and 4/8 incoming. The full run aborted under 47 rival Chrome processes; the paired sweep's two arms committed 10/10 and 6/10 (the 6 ended in the same browser closure). |
| boot smoke 9/9 | RUN THIS REPAIR PASS — result in section 13b. |

**The lane does not claim a green exit gate, and after section 13a it claims one
criterion FAILED rather than merely unmeasured.** It claims: the regression that
caused the hold is measured, attributed to one phase, and removed to within the
baseline's own spread; the correctness fix it was bought with is unchanged; and
the three things still owed are named above with the reason each was not done.
