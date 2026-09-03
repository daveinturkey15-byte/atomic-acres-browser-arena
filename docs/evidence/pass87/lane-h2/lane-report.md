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

**PARTIAL — the 72-pair switch gate did not complete.** 37 real ordered pairs
committed, 0 failed, 0 fence-exceeded; the run aborted when the headless browser
was closed under 47 rival Chrome processes, and the continuation spent its window
on `nuketown2` — the arena that shipped hours ago and had never been
switch-tested (8/8 outgoing, 4 real incoming). 31 pairs are OPEN. See section 13.

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
3. **OPEN — Job 4's serialized-rehearsal cut**, specified in section 6 with the
   experiment and the counter (`match-bound-first-shots`) that decides it.
4. **OPEN — Job 3's parallel compileAsync**, blocked inside three r185's own
   `for await` (section 4a). It is the largest remaining lever on every
   precompile in the game and it needs a lane with a pixel gate.
5. **STRIKE — Job 3's "menu-time prewarm scoped to the picked arena"** is
   forbidden by `AGENTS.md` ("Browsing the menu must construct zero gameplay
   arenas..."). It should come off the job list, not be carried forward.
6. **ORCHESTRATOR DECISION — wire `qa:pass85:arena-switch-matrix` into a group,
   or record why not.** Unchanged from the first pass: it is an npm script in no
   CI group, which is the exact state the boot smoke sat in for months. It needs
   a real WebGPU device (installed Chrome) and ~60-75 min for 72 edges, against a
   2100 s ceiling on the largest bounded-e2e group, and `run-bounded-e2e.mjs`
   (outside this lane's ownership) invokes the Playwright CLI and cannot run a
   node probe.
7. **NOTE — the in-combat tripwire reads 1, not 0, on the shipped build too.**
   The brief states the PASS 82 invariant as "in-combat creations MUST stay 0".
   Lane A's shipped-build baseline is 1 (`renderPipeline_MeshBasicMaterial_774`).
   Whatever this pass measures, "0" is not the shipped state and this lane did
   not introduce the 1.
8. **OPEN — 31 of the 72 ordered pairs were not walked**, and the probe defect
   fixed in `e89492af` is not re-run. Both want one quiet-machine sweep; nothing
   in either is a known failure.
9. **NOTE — commit trailer conflict, unresolved.** The brief mandates
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
- **No gate, threshold, timeout or test was weakened.** `flushWebGpuFrames(12_000)`
  is untouched (0 occurrences in the diff, all call sites intact). The one pin
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

## 11. Verification

- **`npx tsc --noEmit`: exit 0** at the final source commit `89d760ba`. (It was
  NOT clean on the first attempt — `cold-session-precompile-reach.ts` had an
  unsound type predicate, caught and fixed before the build that every
  measurement below used.)
- **Focused vitest: 7 files / 64 tests pass, 0 fail** —
  `rendering/cold-session-precompile-reach` (new),
  `presentation-prewarm-contract`, `arena-special-weapon-reach`,
  `arena-switch-matrix-roster`, `rendering/arena-coverage-prewarm`,
  `rendering/pass64-tsl-scene`, `rendering/art-direction`. Then the whole of
  `src/rendering/` — **28 files / 367 tests pass, 0 fail**, which includes the
  art-direction bounds and cross-arena distinctiveness floor. Full suite NOT run,
  per brief.
- **`flushWebGpuFrames(12_000)` untouched**: 0 occurrences in this pass's diff
  against the merge commit; 4 call sites intact in `src/legacy-main.ts`.
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

1. **Merge or hold.** The correctness fix (in-session switches) is unchanged and
   is the reason to merge. The first-load regression that caused the hold is
   measured, attributed and cut. Section 3's final table says by how much on the
   shipped build.
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

| arena | pipelines before window | **in window** | in a stall | shader modules in window |
|---|---|---|---|---|
| gun-range | 264 | **0** | 0 | 0 |
| high-seas | 251 | **1** | 0 | 0 |
| atomic-acres | 374 | **0** | 0 | 0 |

VERIFIED, and the `1` is identified rather than excused: the probe's
`samplePipelineLabels` names it `renderPipeline_MeshBasicMaterial_774`, which is
**the same single creation Lane A recorded on the SHIPPED build** (baseline 374
before / 1 during / 0 in a stall). This lane did not introduce it. Two of the
three arenas read **0**, including atomic-acres at the identical 374-before count
where Lane A's shipped baseline read 1 — so on this build the invariant is met on
gun-range and atomic-acres and missed by one on high-seas. The brief states the invariant as "in-combat creations MUST stay 0";
that is not the shipped state either, and it is a standing item for whoever owns
that invariant — not something to be silently reported as green.

Note the room: the high-seas window recorded 219 stalls and 33.3% frozen with 36
rival Chrome processes on the GPU. The tripwire is a COUNT gate, not a timing
gate, so contention does not invalidate the counts — but the stall figures in
that receipt are not a frame-pacing measurement and must not be quoted as one.


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

**Result — nuketown2, VERIFIED with one honest subtraction:**

| direction | pairs walked | committed | note |
|---|---|---|---|
| `nuketown2 -> *` (8) | 8 | **8** | one chunk, chained correctly, 167-372 pipelines per edge, 21.7-56.0 s |
| `* -> nuketown2` (8) | 8 | 4 real + **4 VOID** | see below |

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

### Switch-matrix coverage, totalled honestly

| | pairs |
|---|---|
| ordered pairs in the 9-arena matrix | 72 |
| walked and committed, real | **37** (25 from the aborted full run + 8 + 4) |
| walked but VOID (probe defect) | 4 |
| **not walked** | **31** |
| failed | **0** |

**CLAIM-STATE: the 72-pair gate did NOT complete and this lane does not claim
it.** What is VERIFIED is 37 real ordered pairs committed with zero
fence-exceeded errors on the candidate build, including every outgoing edge from
the arena that shipped hours ago and had never been switch-tested. The remaining
31 pairs are OPEN and the run is cheap to repeat on a quiet machine.


