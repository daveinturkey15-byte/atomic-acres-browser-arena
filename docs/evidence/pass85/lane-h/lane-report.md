# Lane H — HF-417 Gun Range switch failure + load-time deep cut (PASS 85)

Worktree `C:/Users/david/projects/aa-claude-loadcut`, branch
`contrib/dave-gaming-pc/claude/load-time-deep-cut`, base `c13ec02c`
(VERIFIED: `git diff --stat 75a4e508 c13ec02c -- src/ scripts/` is empty, so
the base is the shipped PASS 84 source).

Commits: `b082bc83` (gate), `ff938fd9` (HF-417 fix), `2f8cc780` (prewarm cut),
plus the evidence commit.

Every line is VERIFIED (measured or run in this session), CLAIMED (believed,
not verified here) or OPEN.

---

## HEADLINE

**VERIFIED — HF-417's failure mode is fixed, and it was never about Gun Range.**
The full 56-pair in-session switch matrix on the shipped PASS 84 source fails
`atomic-acres -> high-seas` with the exact HF-417 signature. On the candidate
it is 56/56 with zero fence-exceeded errors.

**VERIFIED — this buys reliability, not speed.** Whole-switch p50 18806 ->
19029 ms (+1.2%), p90 29131 -> 28534 ms (-2.0%). The owner's "load every map
much faster" is NOT delivered by this lane. What the lane does deliver is a
measured map of where the 21 s goes, one landed cut, and one specified ~3.5 s
cut left OPEN with its risk stated.

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

**The proof that work MOVED rather than shrank:** `visual-definition` p50 rose
4035 -> 6518 ms and its longest edge rose 10713 -> **15220 ms — and that
15.2 s edge COMMITTED**, where before a 13.9 s one rolled back. The phase is
longer; the fenced submission inside it is survivable.

### Switch matrix, before vs after (56 ordered pairs each)

| | before (`c13ec02c`) | after (`2f8cc780`) |
|---|---|---|
| edges committed | **55 / 56** | **56 / 56** |
| fence-exceeded errors | 1 | **0** |
| switch p50 | 18806 ms | 19029 ms |
| switch p90 | 29131.2 ms | 28534 ms |
| switch mean | 17889 ms | 18866 ms |

Median switch INTO each arena (7 sources each), and the pipelines built inside
the two fenced phases:

| arena | before ms | after ms | pipelines b/a | in-fence pipelines (before) |
|---|---|---|---|---|
| gun-range | 22611 | 23756 | 227 / 221 | 80 |
| high-seas | 21610* | 28534 | 195 / 216 | 39 |
| rustworks-1v1 | 21276 | 23266 | 245 / 245 | 108 |
| atomic-acres | 20173 | 21615 | 288 / 288 | 107 |
| skyline-terminal | 18806 | 16905 | 228 / 228 | 83 |
| test1 | 11829 | 11308 | 167 / 167 | 53 |
| test2 | 10960 | 12108 | 177 / 177 | 66 |
| map3 | 8903 | 9391 | 138 / 138 | 33 |

\* the before high-seas median includes the FAILED edge, which aborted early at
14483 ms and therefore drags that median DOWN; the +32% shown by a naive
comparison is largely that artefact, not a regression.

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

First load, boot -> live match, chunk-start sessions only (n=1 per arena; the
switch table above is the reliable comparison):

| arena | time to menu | transition | deploy | total | pipelines before admission (b/a) | shader modules (b/a) | unique materials | triangles |
|---|---|---|---|---|---|---|---|---|
| atomic-acres | 920 ms | 28973 ms | 18809 ms | 47908 ms | 360 / 384 | 415 / 441 | 104 | 537 259 |
| skyline-terminal | 3550 ms | 28733 ms | 20397 ms | 49276 ms | 289 / 307 | 330 / 344 | 97 | 55 658 |
| rustworks-1v1 | 1625 ms | 34959 ms | 18895 ms | 54000 ms | 280 / 296 | 325 / 342 | 67 | 194 606 |
| high-seas | — | — | — | — | 236 / 243 | 280 / 285 | 67 | 217 202 |
| gun-range | 1683 ms | 28360 ms | 14402 ms | 42972 ms | 255 / 272 | 287 / 303 | 192 | 117 678 |

- OPEN: test1, test2 and map3 never fell on a chunk boundary, so they have no
  first-load row. Their switch rows are complete.
- VERIFIED: pipelines compiled before admission are **flat across arenas**
  (236–360), while triangles vary 10x (55k–537k) and unique materials 3x
  (60–192). **Load time is not a function of arena size.** The dominant cost is
  the shared gameplay vocabulary recompiled per arena entry, not the arena.
- VERIFIED: the candidate compiles slightly MORE before admission (+7 to +24
  pipelines) — the intended direction: compile earlier, not later.
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

Neither the flare gun nor the flamethrower is a loadout weapon. Each has one
authored route onto a map: the flare gun is skyline-terminal's timed map
weapon and nothing else grants it; the flamethrower is rustworks-1v1's, plus
the care package's crimson roll wherever field support can be activated.
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
  75 s: **398 pipelines before the window, 1 during, 0 inside a stall**
  (enrichment 0x); shader modules 457 before / 0 during; 5 stalls, 0.76% frozen.
  Lane A's shipped-build baseline was 374 / 1 / 0. PASS 82 invariant holds.
- **Eight-arena boot smoke**: **11/11 passed**, all 9 arenas
  (atomic-acres, skyline-terminal, rustworks-1v1, gun-range, farcrysis,
  high-seas, test1, test2, map3), headless installed Chrome, native WebGPU.
- **`npx tsc --noEmit`: exit 0** (VERIFIED after the final source commit).
- **Focused vitest**: 12 files / 115 tests pass, 0 fail — `arena-switch-matrix-roster`
  (new), `arena-special-weapon-reach` (new), `presentation-prewarm-contract`,
  `gun-range-rack-presentation`, `match-admission-main-integration`,
  `cold-visitor-deploy`, `combat-first-damage-prewarm`, `admission-debug-contract`,
  `rendering/pass64-tsl-scene`, `rendering/arena-coverage-prewarm`,
  `rendering/art-direction`, `rendering/arena-visual-definition`. Plus
  `src/rendering/` in full: 26 files / 359 tests pass. Full suite NOT run, per brief.
- **Visual regression**: OPEN. No screenshot comparison was run. The changes
  add no material, geometry, light or art-direction value — they reorder and
  gate *prewarm* submissions only, and `src/rendering/art-direction.test.ts`
  (bounds + distinctiveness floor) passes unchanged. That is an argument, not a
  measurement, and the pixel comparison is the honest open item.

## Measurement hygiene (things that would otherwise silently corrupt this)

- The probe waits for an idle ComfyUI queue, ≥3000 MiB free VRAM, AND for rival
  Playwright browsers to clear. The last was added after Lane V held 17 headless
  Chromes on this GPU during the first sweep; free VRAM says nothing about
  submission-queue contention, and a 12 s fence is exactly what loses to it.
  Both reported runs launched with ComfyUI idle and 0 rival browsers.
- CAVEAT: `npx tsc` and focused vitest runs overlapped the first ~5 edges of the
  baseline sweep. Nothing overlapped the after sweep. Medians over 56 edges
  absorb it, but the baseline mean is very slightly pessimistic.
- Headless installed Chrome only, `--window-position=-32000,-32000` as belt and
  braces. No headed browser was launched at any point. No process this lane did
  not start was killed. No server or browser is left running (verified: 0
  Playwright Chromes, 0 probe node processes at handoff).

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

1. **OPEN — the ~3.5 s follow-up cut.** Remove both arena-side serialized
   first-shot rehearsals; `prewarmMatchBoundFirstShotPresentations` at deploy
   already rehearses both exact compositions on every arena before admission.
   Predicted ~3.5 s off every switch on atomic-acres, rustworks-1v1, gun-range
   and high-seas. Risk: the fixed warm-up may migrate onto
   `killstreak-vocabulary` (2.1–2.3 s today). Needs one 50-minute matrix run.
2. **OPEN — visual regression not measured.** No screenshot comparison was run
   (argument given in Verification, not a measurement).
3. **OPEN — deploy/match-admission is 14.4–20.4 s**, roughly 30–40% of the wall
   time between pressing deploy and playing, and no lane has examined it. It is
   the largest unexamined block in "faster map loads".
4. **OPEN — commit trailer conflict.** The lane brief mandates
   `Co-Authored-By: Claude Opus 5.1`; the harness system prompt mandates
   `Claude Fable 5.1`. All four commits follow the brief. Lane A flagged the
   same conflict as an orchestrator decision; it is unresolved.
5. **Wire the gate in.** `npm run qa:pass85:arena-switch-matrix` is registered
   but is in no CI group or workflow. The eight-arena boot smoke spent months in
   exactly that state and was therefore never once executed; do not repeat it.
